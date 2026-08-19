"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Icon, type IconName } from "@/components/ui/icon";
import { precheckChapter } from "@/lib/ai-client";
import { ApiError } from "@/lib/api";
import { count, relativeTime, scheduleLabel } from "@/lib/format";
import type { AiPrecheck } from "@/types/ai";
import {
  createChapter,
  deleteChapter,
  getChapter,
  publishChapter,
  reorderChapters,
  unpublishChapter,
  updateChapter,
} from "@/lib/novels-client";
import { PresentationFormat } from "@/types/fiction";
import type { ChapterSummary } from "@/types/novel";

/**
 * Chapter management for one fiction (rebuilt 13X).
 *
 * A client island because every row carries a state change. The list is
 * rendered from the server's data on first paint and re-read from the server
 * after each mutation (`router.refresh()`) rather than patched locally - the
 * API owns chapter numbering and status, and a locally-guessed state that
 * disagreed with it would be a lie about the writer's own work.
 *
 * Everything public-facing sits behind a confirmation that states its
 * consequences: publishing says who will see the chapter (and that nobody
 * will, while the fiction is private), unpublishing says what happens to the
 * old link and its comments, deleting names the chapter and the amount of
 * writing that goes with it - except a truly empty chapter, which deletes
 * without ceremony because there is nothing to lose.
 */

const CHAPTER_FORMAT_CHOICES = [
  {
    value: PresentationFormat.Standard,
    icon: "book",
    label: "ร้อยแก้ว",
    hint: "เขียนเป็นร้อยแก้ว ผู้อ่านกดสลับอ่านแบบแชทได้อัตโนมัติ จากเครื่องหมายคำพูดในเรื่อง",
  },
  {
    value: PresentationFormat.Chat,
    icon: "message",
    label: "แชทล้วน",
    hint: "บทสนทนาล้วน จัดผู้พูด ฝั่งซ้ายขวา ข้อความระบบ และคั่นฉากเองได้เต็มที่",
  },
  {
    value: PresentationFormat.Headcanon,
    icon: "users",
    label: "เฮดแคนอน",
    hint: "หนึ่งตอนคือหนึ่งหัวข้อ แยกกล่องตามตัวละคร เพิ่มได้ไม่จำกัด",
  },
] as const satisfies ReadonlyArray<{
  value: string;
  icon: IconName;
  label: string;
  hint: string;
}>;

/** The short label for a chapter's mode - one Thai word set, everywhere (13X). */
function chapterFormatLabel(value: string): string {
  switch (value) {
    case PresentationFormat.Chat:
      return "แชทล้วน";
    case PresentationFormat.Headcanon:
      return "เฮดแคนอน";
    default:
      return "ร้อยแก้ว";
  }
}

/**
 * The quantity a row states, in the active mode's own unit (13X). Null means
 * the active representation is empty - said once, as "ยังไม่มีเนื้อหา".
 */
function quantityLabel(chapter: ChapterSummary): string | null {
  switch (chapter.active_format) {
    case PresentationFormat.Chat:
      return chapter.message_count > 0
        ? `${count(chapter.message_count)} ข้อความ`
        : null;
    case PresentationFormat.Headcanon:
      return chapter.entry_count > 0 ? `${count(chapter.entry_count)} กล่อง` : null;
    default:
      return chapter.word_count > 0 ? `${count(chapter.word_count)} คำ` : null;
  }
}

/** A chapter with nothing in ANY representation - deletable without ceremony. */
function isEmptyChapter(chapter: ChapterSummary): boolean {
  return (
    chapter.word_count === 0 &&
    chapter.message_count === 0 &&
    chapter.entry_count === 0
  );
}

/** Drafts with real content that sat untouched this long get a nudge (13X). */
const STALE_DRAFT_MS = 7 * 24 * 60 * 60 * 1000;

function isStaleDraft(chapter: ChapterSummary): boolean {
  return (
    chapter.status === "draft" &&
    chapter.content_ready &&
    Date.now() - new Date(chapter.updated_at).getTime() > STALE_DRAFT_MS
  );
}

/** A prose chapter this small gets a pass-through warning, not a block (13X). */
const TINY_WORD_COUNT = 50;

/** Who can see a published chapter, given the fiction's own visibility. */
function audienceLabel(visibility: string): string {
  switch (visibility) {
    case "public":
      return "ทุกคนที่เข้าเว็บ รวมถึงคนที่ไม่ได้ล็อกอิน";
    case "members":
      return "สมาชิกที่ล็อกอินทุกคน";
    case "followers":
      return "เฉพาะผู้ติดตามของคุณ";
    case "unlisted":
      return "เฉพาะคนที่มีลิงก์ของเรื่องนี้";
    default:
      return "ยังไม่มีใคร - เรื่องยังเป็นส่วนตัว";
  }
}

type Tab = "all" | "published" | "draft";

/** How many chapters it takes before a search box earns its space. */
const SEARCH_THRESHOLD = 11;

interface RowConfirm {
  kind: "publish" | "unpublish" | "delete";
  chapterID: string;
}

export function ChapterManager({
  novelRef,
  chapters,
  usesChapterNavigation,
  defaultFormat,
  chapterUnit,
  novelVisibility,
  nextNumber,
}: {
  novelRef: string;
  chapters: ChapterSummary[];
  usesChapterNavigation: boolean;
  /** What the mode picker preselects: the last-CREATED chapter's mode (13X). */
  defaultFormat: string;
  /** ตอนที่ / บทที่ / EP. - stored on the fiction, changed in its settings. */
  chapterUnit: string;
  /** The fiction's visibility, quoted by the publish confirmation (13X). */
  novelVisibility: string;
  /** What the server would assign if the writer types nothing. */
  nextNumber: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The add box is a one-line button until asked for - managing existing
  // chapters is this page's main job (13X). A fiction with no chapters yet
  // gets it open, as its own empty state.
  const [addOpen, setAddOpen] = useState(chapters.length === 0);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState<string>(defaultFormat);
  // The number is computed - ตอนสุดท้าย + 1 - and shown as text. The input
  // only exists after "แก้เลขตอน", for the special arrangements (§13R).
  const [editingNumber, setEditingNumber] = useState(false);
  const [number, setNumber] = useState(String(nextNumber));

  // List state lives in the URL, so finishing an edit lands back on the same
  // tab and search (13X).
  const tab = (searchParams.get("tab") ?? "all") as Tab;
  const query = searchParams.get("q") ?? "";
  const modeFilter = searchParams.get("mode") ?? "";

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState<
    "publish" | "unpublish" | "delete" | null
  >(null);

  const [menuID, setMenuID] = useState<string | null>(null);
  const [renamingID, setRenamingID] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [movingID, setMovingID] = useState<string | null>(null);
  const [movePosition, setMovePosition] = useState("");

  const [confirm, setConfirm] = useState<RowConfirm | null>(null);
  const [publishLater, setPublishLater] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  // The pre-publish round (13Y §11): the moment a writer will wait 5 seconds,
  // and the checks' highest-value moment. Advisory - it never blocks.
  const [precheck, setPrecheck] = useState<{
    chapterID: string;
    result: AiPrecheck | null;
  } | null>(null);

  function startPrecheck(chapter: ChapterSummary) {
    setPrecheck({ chapterID: chapter.id, result: null });
    precheckChapter(novelRef, chapter.id)
      .then((result) =>
        setPrecheck((current) =>
          current?.chapterID === chapter.id ? { chapterID: chapter.id, result } : current,
        ),
      )
      .catch(() =>
        // Advisory: a failed check must never stand between a writer and
        // their publish button.
        setPrecheck((current) =>
          current?.chapterID === chapter.id ? null : current,
        ),
      );
  }

  // Drag state (armed-handle pattern): the ⋮⋮ handle arms the row, so text
  // selection and the title link can never start a drag.
  const [armed, setArmed] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [reorderNotice, setReorderNotice] = useState<{
    undoOrder: string[];
    movedPublished: boolean;
  } | null>(null);

  function setParams(changes: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const encoded = params.toString();
    router.replace(encoded ? `${pathname}?${encoded}` : pathname, { scroll: false });
  }

  function report(cause: unknown, fallback: string) {
    setError(cause instanceof ApiError ? cause.message : fallback);
  }

  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (cause) {
      report(cause, "ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusyId(null);
    }
  }

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const chosen = Number.parseInt(number, 10);
      // A new chapter is always a draft: nothing a writer types becomes public
      // by the act of creating it.
      const chapter = await createChapter(novelRef, {
        title: title.trim() || null,
        status: "draft",
        // Only sent when the writer opened "แก้เลขตอน" and moved it. The
        // server refuses a taken number with a clear 409 rather than shifting
        // anything - stated beside the input before it happens.
        ...(editingNumber && Number.isFinite(chosen) && chosen !== nextNumber
          ? { chapter_number: chosen }
          : {}),
        // ALWAYS sent, even when it equals the fiction's own (§13P): the
        // chapter is stamped with the mode it was created in.
        presentation_format: format,
      });
      setTitle("");
      router.push(
        `/studio/novels/${encodeURIComponent(novelRef)}/chapters/${encodeURIComponent(chapter.slug)}`,
      );
    } catch (cause) {
      report(cause, "สร้างตอนใหม่ไม่สำเร็จ");
      setCreating(false);
    }
  }

  async function applyOrder(ids: string[], movedPublished: boolean) {
    const previous = chapters.map((chapter) => chapter.id);
    setError(null);
    try {
      await reorderChapters(novelRef, ids);
      setReorderNotice({ undoOrder: previous, movedPublished });
      router.refresh();
    } catch (cause) {
      report(cause, "จัดลำดับไม่สำเร็จ");
    }
  }

  function moveTo(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= chapters.length) return;
    const ids = chapters.map((chapter) => chapter.id);
    const [moved] = ids.splice(fromIndex, 1);
    ids.splice(toIndex, 0, moved);
    void applyOrder(ids, chapters[fromIndex].status === "published");
  }

  async function undoReorder() {
    if (!reorderNotice) return;
    setError(null);
    try {
      await reorderChapters(novelRef, reorderNotice.undoOrder);
      setReorderNotice(null);
      router.refresh();
    } catch (cause) {
      report(cause, "ย้อนการจัดลำดับไม่สำเร็จ");
    }
  }

  async function duplicate(chapter: ChapterSummary) {
    await run(chapter.id, async () => {
      // The owner's read carries every representation, so the copy carries
      // them too - same mode, always a draft, appended at the end (13X).
      const full = await getChapter(novelRef, chapter.slug);
      const baseTitle =
        chapter.title ?? `${chapterUnit || "ตอนที่"} ${chapter.chapter_number}`;
      await createChapter(novelRef, {
        title: `${baseTitle} (สำเนา)`.slice(0, 200),
        status: "draft",
        presentation_format: full.presentation_format ?? full.active_format,
        content_format: full.content_format,
        ...(full.content ? { content: full.content } : {}),
        ...(full.messages && full.messages.length > 0
          ? { messages: full.messages }
          : {}),
        ...(full.entries && full.entries.length > 0
          ? {
              entries: full.entries.map((entry) => ({
                character_id: entry.character_id ?? null,
                name: entry.name,
                values: entry.values,
                body: entry.body,
                image_url: entry.image_url ?? null,
              })),
            }
          : {}),
        ...(full.entry_fields.length > 0 ? { entry_fields: full.entry_fields } : {}),
      });
    });
  }

  async function saveRename(chapter: ChapterSummary) {
    await run(chapter.id, () =>
      updateChapter(novelRef, chapter.slug, { title: renameValue.trim() || null }),
    );
    setRenamingID(null);
  }

  async function confirmPublish(chapter: ChapterSummary) {
    setConfirm(null);
    if (publishLater && scheduleAt) {
      await run(chapter.id, () =>
        updateChapter(novelRef, chapter.slug, {
          status: "scheduled",
          scheduled_at: new Date(scheduleAt).toISOString(),
        }),
      );
    } else {
      await run(chapter.id, () => publishChapter(novelRef, chapter.slug));
    }
    setPublishLater(false);
    setScheduleAt("");
  }

  async function removeChapter(chapter: ChapterSummary) {
    setConfirm(null);
    await run(chapter.id, () => deleteChapter(novelRef, chapter.slug));
    setSelected((current) => {
      if (!current.has(chapter.id)) return current;
      const next = new Set(current);
      next.delete(chapter.id);
      return next;
    });
  }

  // --- bulk actions --------------------------------------------------------

  const selectedChapters = chapters.filter((chapter) => selected.has(chapter.id));
  const bulkPublishable = selectedChapters.filter(
    (chapter) => chapter.status !== "published" && chapter.content_ready,
  );
  const bulkSkippedEmpty = selectedChapters.filter(
    (chapter) => chapter.status !== "published" && !chapter.content_ready,
  ).length;
  const bulkUnpublishable = selectedChapters.filter(
    (chapter) => chapter.status === "published",
  );

  async function runBulk(action: (chapter: ChapterSummary) => Promise<unknown>, targets: ChapterSummary[]) {
    setBulkConfirm(null);
    setBusyId("bulk");
    setError(null);
    try {
      for (const chapter of targets) {
        await action(chapter);
      }
      setSelected(new Set());
      router.refresh();
    } catch (cause) {
      report(cause, "ทำรายการไม่สำเร็จ - บางตอนอาจสำเร็จไปแล้ว");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  // --- filtering -----------------------------------------------------------

  const publishedCount = chapters.filter((c) => c.status === "published").length;
  const draftCount = chapters.length - publishedCount;

  const distinctModes = [...new Set(chapters.map((c) => c.active_format))];
  const trimmedQuery = query.trim().toLowerCase();
  const filtering = tab !== "all" || trimmedQuery !== "" || modeFilter !== "";

  const visible = chapters.filter((chapter) => {
    if (tab === "published" && chapter.status !== "published") return false;
    if (tab === "draft" && chapter.status === "published") return false;
    if (modeFilter && chapter.active_format !== modeFilter) return false;
    if (trimmedQuery) {
      const haystack = `${chapter.title ?? ""} ${chapter.chapter_number}`.toLowerCase();
      if (!haystack.includes(trimmedQuery)) return false;
    }
    return true;
  });

  const emptyDrafts = chapters.filter(
    (chapter) => chapter.status !== "published" && isEmptyChapter(chapter),
  );

  const reorderable = !filtering;
  const base = `/studio/novels/${encodeURIComponent(novelRef)}`;
  const unit = chapterUnit || "ตอนที่";

  return (
    <div>
      {/* --- add chapter ---------------------------------------------------- */}
      {addOpen ? (
        <form
          onSubmit={onCreate}
          className="mb-7 rounded-lg border border-primary-200 bg-primary-50 p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="mono-label">เพิ่มตอนใหม่</p>
            {chapters.length > 0 ? (
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="text-xs text-text-secondary hover:text-text"
              >
                ปิด
              </button>
            ) : null}
          </div>

          <fieldset className="mt-3">
            <legend className="text-sm font-medium">
              ตอนนี้จะเขียนในโหมดไหน?{" "}
              <span className="text-text-muted">(เลือกได้ครั้งเดียว)</span>
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {CHAPTER_FORMAT_CHOICES.map((choice) => {
                const chosen = format === choice.value;
                return (
                  <label
                    key={choice.value}
                    className={`flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3 text-sm ${
                      chosen
                        ? "border-primary bg-surface"
                        : "border-border bg-surface/60 hover:border-primary-200"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="chapter_format"
                        value={choice.value}
                        checked={chosen}
                        onChange={() => setFormat(choice.value)}
                        className="sr-only"
                      />
                      <Icon
                        name={choice.icon}
                        size={16}
                        className={chosen ? "text-primary" : "text-text-muted"}
                      />
                      <span className="font-medium">{choice.label}</span>
                    </span>
                    <span className="text-xs text-text-muted">{choice.hint}</span>
                  </label>
                );
              })}
            </div>
            {/* Said before the choice is made, not discovered after. */}
            <p className="mt-2 flex gap-1.5 text-xs text-text-muted">
              <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
              <span>
                โหมดของตอนล็อกตั้งแต่สร้าง เปลี่ยนภายหลังไม่ได้ -
                ต่างจากรูปแบบหลักของเรื่องที่ปรับได้ในตั้งค่า
                ถ้าอยากได้โหมดอื่นให้สร้างเป็นอีกตอน
              </span>
            </p>
          </fieldset>

          <div className="mt-3 flex flex-wrap items-end gap-2.5">
            <div className="min-w-0 flex-1">
              <label htmlFor="new-chapter-title" className="mono-label block">
                ชื่อตอน
              </label>
              <input
                id="new-chapter-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={
                  usesChapterNavigation
                    ? "เว้นว่างไว้ก็ได้ - จะใช้เลขตอนแทน"
                    : "ชื่อเรื่องย่อยของตอนนี้ - เว้นว่างไว้ก็ได้"
                }
                className="mt-1 min-h-10 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              <Icon name="plus" size={16} />
              {creating ? "กำลังสร้าง…" : "สร้างและเริ่มเขียน"}
            </button>
          </div>

          {/* The number is computed, not asked (13X): ตอนสุดท้าย + 1. The
              input appears only on request, and the collision rule is stated
              before it can happen. The unit is the fiction's own setting. */}
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
            <span>
              จะเป็น{" "}
              <span className="font-medium text-text">
                {unit} {nextNumber}
              </span>{" "}
              และเป็นฉบับร่างจนกว่าคุณจะกดเผยแพร่เอง
            </span>
            {!editingNumber ? (
              <button
                type="button"
                onClick={() => setEditingNumber(true)}
                className="text-primary hover:underline"
              >
                แก้เลขตอน
              </button>
            ) : null}
            <Link href={`${base}/settings`} className="text-primary hover:underline">
              เปลี่ยนคำเรียกของเรื่องนี้
            </Link>
          </p>

          {editingNumber ? (
            <div className="mt-2">
              <label htmlFor="new-chapter-number" className="mono-label block">
                เลขตอน
              </label>
              <input
                id="new-chapter-number"
                type="number"
                inputMode="numeric"
                min={1}
                value={number}
                onChange={(event) => setNumber(event.target.value)}
                className="mt-1 min-h-10 w-24 rounded-md border border-border bg-surface px-2.5 text-sm tabular-nums outline-none focus:border-primary"
              />
              <p className="mt-1 text-xs text-text-muted">
                ถ้าเลขนี้ถูกใช้อยู่แล้ว ระบบจะไม่สร้างทับและไม่เลื่อนตอนอื่น -
                จะแจ้งให้เลือกเลขใหม่
              </p>
            </div>
          ) : null}
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="mb-7 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary-200 text-sm font-medium text-primary hover:bg-primary-50"
        >
          <Icon name="plus" size={16} />
          เพิ่มตอนใหม่
        </button>
      )}

      {error ? (
        <p role="alert" className="mb-4 rounded-md bg-error/10 px-3 py-2 text-sm text-error">
          {error}
        </p>
      ) : null}

      {reorderNotice ? (
        <p className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-primary-200 bg-primary-50 px-3 py-2 text-sm">
          <span>
            เรียงลำดับใหม่แล้ว - เลขตอนถูกคำนวณใหม่เป็น 1 ถึง {chapters.length}
            {reorderNotice.movedPublished
              ? " และลำดับที่ผู้อ่านเห็นเปลี่ยนแล้วทันที"
              : ""}
          </span>
          <button
            type="button"
            onClick={() => void undoReorder()}
            className="font-medium text-primary hover:underline"
          >
            ย้อนกลับ
          </button>
          <button
            type="button"
            onClick={() => setReorderNotice(null)}
            aria-label="ปิดข้อความ"
            className="ms-auto text-text-muted hover:text-text"
          >
            <Icon name="close" size={14} />
          </button>
        </p>
      ) : null}

      {/* --- tabs / search / mode filter ------------------------------------ */}
      {chapters.length > 0 ? (
        <div className="mb-4 space-y-3">
          <div role="tablist" aria-label="กรองตามสถานะ" className="flex flex-wrap gap-1.5">
            {(
              [
                { key: "all", label: `ทั้งหมด (${chapters.length})` },
                { key: "published", label: `เผยแพร่แล้ว (${publishedCount})` },
                { key: "draft", label: `ร่าง (${draftCount})` },
              ] as const
            ).map((entry) => (
              <button
                key={entry.key}
                type="button"
                role="tab"
                aria-selected={tab === entry.key}
                onClick={() => setParams({ tab: entry.key === "all" ? "" : entry.key })}
                className={`inline-flex min-h-9 items-center rounded-md border px-3 text-sm ${
                  tab === entry.key
                    ? "border-primary bg-primary-50 text-primary"
                    : "border-border text-text-secondary hover:text-text"
                }`}
              >
                {entry.label}
              </button>
            ))}

            {distinctModes.length > 1
              ? distinctModes.map((mode) => {
                  const active = modeFilter === mode;
                  const total = chapters.filter((c) => c.active_format === mode).length;
                  return (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setParams({ mode: active ? "" : mode })}
                      className={`ms-auto inline-flex min-h-9 items-center rounded-full border px-3 text-xs first-of-type:ms-auto ${
                        active
                          ? "border-primary bg-primary-50 text-primary"
                          : "border-border text-text-secondary hover:text-text"
                      }`}
                    >
                      {chapterFormatLabel(mode)} {total}
                    </button>
                  );
                })
              : null}
          </div>

          {chapters.length >= SEARCH_THRESHOLD ? (
            <input
              type="search"
              value={query}
              onChange={(event) => setParams({ q: event.target.value })}
              placeholder="ค้นหาชื่อตอนหรือเลขตอน"
              aria-label="ค้นหาตอน"
              className="min-h-10 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
            />
          ) : null}

          {emptyDrafts.length > 0 ? (
            <button
              type="button"
              onClick={() => setSelected(new Set(emptyDrafts.map((c) => c.id)))}
              className="text-xs text-primary hover:underline"
            >
              เลือกร่างที่ไม่มีเนื้อหาทั้งหมด ({emptyDrafts.length})
            </button>
          ) : null}
        </div>
      ) : null}

      {/* --- the list ------------------------------------------------------- */}
      {chapters.length === 0 ? null : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-text-secondary">
          {trimmedQuery ? (
            <p>ไม่พบตอนที่ตรงกับ «{query.trim()}»</p>
          ) : tab === "published" ? (
            <>
              <p>ยังไม่มีตอนที่เผยแพร่</p>
              <button
                type="button"
                onClick={() => setParams({ tab: "draft" })}
                className="mt-2 text-primary hover:underline"
              >
                ดูฉบับร่าง ({draftCount})
              </button>
            </>
          ) : (
            <>
              <p>ไม่มีฉบับร่างค้างอยู่ - ทุกตอนเผยแพร่แล้ว</p>
              <button
                type="button"
                onClick={() => setParams({ tab: "published" })}
                className="mt-2 text-primary hover:underline"
              >
                ดูตอนที่เผยแพร่ ({publishedCount})
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <label className="mb-2 flex w-fit items-center gap-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={visible.length > 0 && visible.every((c) => selected.has(c.id))}
              onChange={(event) =>
                setSelected(
                  event.target.checked ? new Set(visible.map((c) => c.id)) : new Set(),
                )
              }
              className="size-4 accent-primary"
            />
            เลือกทั้งหมดที่แสดง
          </label>

          <ul className="divide-y divide-hairline rounded-lg border border-border bg-surface">
            {visible.map((chapter) => {
              const index = chapters.indexOf(chapter);
              const busy = busyId === chapter.id;
              const isPublished = chapter.status === "published";
              const quantity = quantityLabel(chapter);
              const displayTitle =
                chapter.title ?? `${unit} ${chapter.chapter_number}`;

              return (
                <li
                  key={chapter.id}
                  draggable={armed === index}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    setDragIndex(index);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setOverIndex(null);
                    setArmed(null);
                  }}
                  onDragOver={(event) => {
                    if (dragIndex === null) return;
                    event.preventDefault();
                    setOverIndex(index);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const from = dragIndex;
                    setDragIndex(null);
                    setOverIndex(null);
                    setArmed(null);
                    if (from !== null && from !== index) moveTo(from, index);
                  }}
                  className={`border-s-[3px] ${
                    isPublished ? "border-s-success" : "border-s-transparent"
                  } ${
                    overIndex === index && dragIndex !== null && dragIndex !== index
                      ? "bg-primary-50/60"
                      : ""
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(chapter.id)}
                      onChange={(event) =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(chapter.id);
                          else next.delete(chapter.id);
                          return next;
                        })
                      }
                      aria-label={`เลือก ${displayTitle}`}
                      className="size-4 shrink-0 accent-primary"
                    />

                    {reorderable ? (
                      <span
                        role="button"
                        tabIndex={-1}
                        aria-hidden
                        title="ลากเพื่อจัดลำดับ"
                        onPointerDown={() => setArmed(index)}
                        onPointerUp={() => setArmed(null)}
                        className="cursor-grab touch-none text-text-muted hover:text-text active:cursor-grabbing"
                      >
                        <Icon name="grip" size={15} />
                      </span>
                    ) : null}

                    <span
                      className={`w-8 shrink-0 font-mono text-xs tabular-nums ${
                        isPublished ? "font-medium text-text" : "text-text-muted"
                      }`}
                    >
                      {chapter.chapter_number}
                    </span>

                    {renamingID === chapter.id ? (
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <input
                          value={renameValue}
                          autoFocus
                          onChange={(event) => setRenameValue(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void saveRename(chapter);
                            }
                            if (event.key === "Escape") setRenamingID(null);
                          }}
                          aria-label="ชื่อตอนใหม่"
                          placeholder="เว้นว่างเพื่อใช้เลขตอน"
                          className="min-h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
                        />
                        <button
                          type="button"
                          onClick={() => void saveRename(chapter)}
                          disabled={busy}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          บันทึก
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenamingID(null)}
                          className="text-xs text-text-secondary hover:text-text"
                        >
                          ยกเลิก
                        </button>
                      </span>
                    ) : (
                      <Link
                        href={`${base}/chapters/${encodeURIComponent(chapter.slug)}`}
                        className="group min-w-0 flex-1 cursor-pointer"
                      >
                        <span
                          className={`block truncate text-sm group-hover:text-primary group-hover:underline ${
                            chapter.title
                              ? "font-medium"
                              : "text-text-muted italic"
                          }`}
                        >
                          {displayTitle}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-text-muted">
                          {/* One fixed shape: โหมด · ปริมาณ · เวลา (13X). */}
                          {chapterFormatLabel(chapter.active_format)}
                          {" · "}
                          {quantity ?? "ยังไม่มีเนื้อหา"}
                          {" · แก้ไข "}
                          {relativeTime(chapter.updated_at)}
                          {isPublished && chapter.published_at
                            ? ` · เผยแพร่ ${relativeTime(chapter.published_at)}`
                            : ""}
                          {chapter.status === "scheduled" && chapter.scheduled_at
                            ? ` · จะเผยแพร่ ${scheduleLabel(chapter.scheduled_at)}`
                            : ""}
                        </span>
                      </Link>
                    )}

                    {isStaleDraft(chapter) ? (
                      <span className="inline-flex shrink-0 items-center rounded-full bg-warning/10 px-2 py-0.5 text-[11px] text-warning">
                        ร่างค้าง
                      </span>
                    ) : null}

                    <span
                      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs ${
                        isPublished
                          ? "bg-success/10 text-success"
                          : chapter.status === "scheduled"
                            ? "bg-warning/10 text-warning"
                            : chapter.status === "unpublished"
                              ? "bg-error/10 text-error"
                              : "bg-surface-secondary text-text-secondary"
                      }`}
                    >
                      {isPublished
                        ? "เผยแพร่แล้ว"
                        : chapter.status === "scheduled"
                          ? "ตั้งเวลาไว้"
                          : chapter.status === "unpublished"
                            ? "ถอนออกแล้ว"
                            : "ฉบับร่าง"}
                    </span>

                    <span
                      title={
                        !isPublished && !chapter.content_ready
                          ? "ยังไม่มีเนื้อหาในตอนนี้"
                          : undefined
                      }
                    >
                      <button
                        type="button"
                        disabled={busy || (!isPublished && !chapter.content_ready)}
                        onClick={() => {
                          setPublishLater(false);
                          setScheduleAt("");
                          setConfirm({
                            kind: isPublished ? "unpublish" : "publish",
                            chapterID: chapter.id,
                          });
                          if (!isPublished) startPrecheck(chapter);
                        }}
                        className="inline-flex min-h-9 shrink-0 items-center rounded-md border border-border px-3 text-xs text-text-secondary hover:border-primary-200 hover:text-text disabled:opacity-40"
                      >
                        {busy ? "กำลังทำ…" : isPublished ? "ถอนออก" : "เผยแพร่"}
                      </button>
                    </span>

                    <span className="relative shrink-0">
                      <button
                        type="button"
                        aria-label={`เมนูของ ${displayTitle}`}
                        aria-haspopup="menu"
                        aria-expanded={menuID === chapter.id}
                        onClick={() =>
                          setMenuID(menuID === chapter.id ? null : chapter.id)
                        }
                        className="flex size-9 items-center justify-center rounded-md text-text-muted hover:bg-surface-secondary hover:text-text"
                      >
                        <Icon name="more-horizontal" size={16} />
                      </button>

                      {menuID === chapter.id ? (
                        <>
                          <span
                            aria-hidden
                            onClick={() => setMenuID(null)}
                            className="fixed inset-0 z-10"
                          />
                          <span
                            role="menu"
                            className="absolute inset-e-0 top-full z-20 mt-1 flex w-44 flex-col rounded-md border border-border bg-surface py-1 shadow-lg"
                          >
                            <MenuLink
                              href={`${base}/chapters/${encodeURIComponent(chapter.slug)}`}
                              onNavigate={() => setMenuID(null)}
                            >
                              แก้ไข
                            </MenuLink>
                            <MenuLink
                              href={`/read/${encodeURIComponent(novelRef)}/${encodeURIComponent(chapter.slug)}`}
                              onNavigate={() => setMenuID(null)}
                            >
                              ดูตัวอย่าง
                            </MenuLink>
                            <MenuItem
                              onClick={() => {
                                setMenuID(null);
                                setRenamingID(chapter.id);
                                setRenameValue(chapter.title ?? "");
                              }}
                            >
                              เปลี่ยนชื่อ
                            </MenuItem>
                            <MenuItem
                              onClick={() => {
                                setMenuID(null);
                                void duplicate(chapter);
                              }}
                            >
                              ทำสำเนา
                            </MenuItem>

                            {reorderable ? (
                              <>
                                <span className="my-1 block border-t border-hairline" />
                                <MenuItem
                                  disabled={index === 0}
                                  onClick={() => {
                                    setMenuID(null);
                                    moveTo(index, index - 1);
                                  }}
                                >
                                  ย้ายขึ้น
                                </MenuItem>
                                <MenuItem
                                  disabled={index === chapters.length - 1}
                                  onClick={() => {
                                    setMenuID(null);
                                    moveTo(index, index + 1);
                                  }}
                                >
                                  ย้ายลง
                                </MenuItem>
                                <MenuItem
                                  onClick={() => {
                                    setMenuID(null);
                                    setMovingID(chapter.id);
                                    setMovePosition(String(index + 1));
                                  }}
                                >
                                  ย้ายไปตำแหน่ง…
                                </MenuItem>
                              </>
                            ) : null}

                            <span className="my-1 block border-t border-hairline" />
                            <MenuItem
                              tone="danger"
                              onClick={() => {
                                setMenuID(null);
                                // Nothing in any representation: nothing to
                                // lose, so no ceremony (13X).
                                if (isEmptyChapter(chapter)) {
                                  void removeChapter(chapter);
                                } else {
                                  setConfirm({ kind: "delete", chapterID: chapter.id });
                                }
                              }}
                            >
                              ลบตอน
                            </MenuItem>
                          </span>
                        </>
                      ) : null}
                    </span>
                  </div>

                  {movingID === chapter.id ? (
                    <div className="flex flex-wrap items-center gap-2 border-t border-hairline bg-surface-secondary/40 px-4 py-2.5 text-sm">
                      <label htmlFor={`move-${chapter.id}`}>ย้ายไปตำแหน่ง</label>
                      <input
                        id={`move-${chapter.id}`}
                        type="number"
                        min={1}
                        max={chapters.length}
                        value={movePosition}
                        onChange={(event) => setMovePosition(event.target.value)}
                        className="min-h-9 w-20 rounded-md border border-border bg-surface px-2.5 text-sm tabular-nums outline-none focus:border-primary"
                      />
                      <span className="text-xs text-text-muted">จาก {chapters.length}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const target = Number.parseInt(movePosition, 10) - 1;
                          setMovingID(null);
                          if (Number.isFinite(target)) moveTo(index, target);
                        }}
                        className="inline-flex min-h-9 items-center rounded-md bg-primary px-3 text-xs font-medium text-white hover:opacity-90"
                      >
                        ย้าย
                      </button>
                      <button
                        type="button"
                        onClick={() => setMovingID(null)}
                        className="text-xs text-text-secondary hover:text-text"
                      >
                        ยกเลิก
                      </button>
                    </div>
                  ) : null}

                  {confirm?.chapterID === chapter.id ? (
                    <div className="border-t border-hairline bg-surface-secondary/40 px-4 py-3 text-sm">
                      {confirm.kind === "publish" ? (
                        <>
                          <p>
                            กำลังจะเผยแพร่ «{displayTitle}»
                            {quantity ? ` (${quantity})` : ""} - ผู้ที่จะเห็นได้:{" "}
                            <span className="font-medium">
                              {audienceLabel(novelVisibility)}
                            </span>
                          </p>
                          {novelVisibility === "private" ? (
                            <p className="mt-1.5 flex gap-1.5 text-warning">
                              <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
                              ตอนนี้จะเผยแพร่ แต่เรื่องยังเป็นส่วนตัว
                              จึงยังไม่มีใครเห็น - เผยแพร่เรื่องได้ที่หน้าภาพรวม
                            </p>
                          ) : null}
                          {chapter.active_format === "standard" &&
                          chapter.word_count > 0 &&
                          chapter.word_count < TINY_WORD_COUNT ? (
                            <p className="mt-1.5 text-warning">
                              ตอนนี้มีแค่ {count(chapter.word_count)} คำ
                              ต้องการเผยแพร่จริงหรือไม่?
                            </p>
                          ) : null}

                          {/* The pre-publish round (13Y §11) - advisory. */}
                          {precheck?.chapterID === chapter.id ? (
                            precheck.result == null ? (
                              <p className="mt-1.5 text-xs text-text-secondary">
                                กำลังตรวจรอบสุดท้าย…
                              </p>
                            ) : precheck.result.skipped ? null : precheck.result
                                .issue_count > 0 ? (
                              <p className="mt-1.5 text-xs">
                                <span className="text-warning">
                                  พบ {precheck.result.issue_count} จุดที่ควรดู:
                                  {" "}คำผิด {precheck.result.spell_count}
                                  {" · "}ตัวละครอาจหลุด{" "}
                                  {precheck.result.character.issues.length}
                                  {precheck.result.continuity.checked
                                    ? ` · ความต่อเนื่อง ${precheck.result.continuity.issues.length}`
                                    : ""}
                                </span>{" "}
                                <Link
                                  href={`${base}/chapters/${encodeURIComponent(chapter.slug)}`}
                                  className="text-primary hover:underline"
                                >
                                  ดูก่อนเผยแพร่
                                </Link>{" "}
                                หรือเผยแพร่เลยก็ได้ - เป็นข้อเสนอแนะเท่านั้น
                              </p>
                            ) : (
                              <p className="mt-1.5 text-xs text-success">
                                ตรวจรอบสุดท้ายแล้ว - ไม่พบจุดที่ต้องดู
                              </p>
                            )
                          ) : null}

                          <div className="mt-2.5 flex flex-wrap items-center gap-3 text-sm">
                            <label className="flex items-center gap-1.5">
                              <input
                                type="radio"
                                name={`when-${chapter.id}`}
                                checked={!publishLater}
                                onChange={() => setPublishLater(false)}
                                className="accent-primary"
                              />
                              เผยแพร่ทันที
                            </label>
                            <label className="flex items-center gap-1.5">
                              <input
                                type="radio"
                                name={`when-${chapter.id}`}
                                checked={publishLater}
                                onChange={() => setPublishLater(true)}
                                className="accent-primary"
                              />
                              ตั้งเวลา
                            </label>
                            {publishLater ? (
                              <input
                                type="datetime-local"
                                value={scheduleAt}
                                onChange={(event) => setScheduleAt(event.target.value)}
                                aria-label="เวลาเผยแพร่"
                                className="min-h-9 rounded-md border border-border bg-surface px-2.5 text-sm outline-none focus:border-primary"
                              />
                            ) : null}
                          </div>

                          <div className="mt-2.5 flex gap-2.5">
                            <button
                              type="button"
                              disabled={busy || (publishLater && !scheduleAt)}
                              onClick={() => void confirmPublish(chapter)}
                              className="inline-flex min-h-9 items-center rounded-md bg-primary px-3.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                            >
                              {publishLater ? "ยืนยันตั้งเวลา" : "ยืนยันเผยแพร่"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirm(null)}
                              className="inline-flex min-h-9 items-center rounded-md border border-border px-3.5 text-sm text-text-secondary"
                            >
                              ยกเลิก
                            </button>
                          </div>
                        </>
                      ) : confirm.kind === "unpublish" ? (
                        <>
                          <p>
                            ถอน «{displayTitle}» ออกจากการเผยแพร่? ลิงก์เดิมจะเข้าไม่ได้
                            และคอมเมนต์ที่มีอยู่จะถูกซ่อนไว้ (ไม่ลบ) -
                            เผยแพร่ใหม่ได้ทุกเมื่อ
                          </p>
                          <div className="mt-2.5 flex gap-2.5">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setConfirm(null);
                                void run(chapter.id, () =>
                                  unpublishChapter(novelRef, chapter.slug),
                                );
                              }}
                              className="inline-flex min-h-9 items-center rounded-md bg-primary px-3.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                            >
                              ยืนยันถอนออก
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirm(null)}
                              className="inline-flex min-h-9 items-center rounded-md border border-border px-3.5 text-sm text-text-secondary"
                            >
                              ยกเลิก
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-error">
                            ลบ «{displayTitle}» ถาวร?
                            {quantity ? ` เนื้อหา ${quantity} จะหายไป` : ""}
                          </p>
                          {isPublished ? (
                            <p className="mt-1.5 flex gap-1.5 text-warning">
                              <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
                              ตอนนี้เผยแพร่อยู่ -
                              ผู้อ่านที่บุ๊กมาร์กหรือแชร์ลิงก์ไว้จะเข้าไม่ได้อีก
                            </p>
                          ) : null}
                          <div className="mt-2.5 flex gap-2.5">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void removeChapter(chapter)}
                              className="inline-flex min-h-9 items-center rounded-md bg-error px-3.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                            >
                              ยืนยันลบ
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirm(null)}
                              className="inline-flex min-h-9 items-center rounded-md border border-border px-3.5 text-sm text-text-secondary"
                            >
                              ยกเลิก
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* --- bulk action bar ------------------------------------------------ */}
      {selected.size > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 py-3 shadow-lg backdrop-blur">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            {bulkConfirm === null ? (
              <>
                <span className="font-medium">เลือก {selected.size} ตอน</span>
                <button
                  type="button"
                  disabled={bulkPublishable.length === 0 || busyId === "bulk"}
                  onClick={() => setBulkConfirm("publish")}
                  className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-xs hover:border-primary-200 disabled:opacity-40"
                >
                  เผยแพร่ที่เลือก
                </button>
                <button
                  type="button"
                  disabled={bulkUnpublishable.length === 0 || busyId === "bulk"}
                  onClick={() => setBulkConfirm("unpublish")}
                  className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-xs hover:border-primary-200 disabled:opacity-40"
                >
                  ถอนออกที่เลือก
                </button>
                <button
                  type="button"
                  disabled={busyId === "bulk"}
                  onClick={() => setBulkConfirm("delete")}
                  className="inline-flex min-h-9 items-center rounded-md border border-error/40 px-3 text-xs text-error hover:bg-error/5 disabled:opacity-40"
                >
                  ลบที่เลือก
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="ms-auto text-xs text-text-secondary hover:text-text"
                >
                  ล้างที่เลือก
                </button>
              </>
            ) : bulkConfirm === "publish" ? (
              <>
                <span>
                  เผยแพร่ {bulkPublishable.length} ตอน - ผู้ที่จะเห็นได้:{" "}
                  {audienceLabel(novelVisibility)}
                  {bulkSkippedEmpty > 0
                    ? ` (จะข้าม ${bulkSkippedEmpty} ตอนที่ยังไม่มีเนื้อหา)`
                    : ""}
                  {novelVisibility === "private"
                    ? " - เรื่องยังเป็นส่วนตัว จึงยังไม่มีใครเห็น"
                    : ""}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void runBulk(
                      (chapter) => publishChapter(novelRef, chapter.slug),
                      bulkPublishable,
                    )
                  }
                  className="inline-flex min-h-9 items-center rounded-md bg-primary px-3.5 text-xs font-medium text-white hover:opacity-90"
                >
                  ยืนยันเผยแพร่
                </button>
                <button
                  type="button"
                  onClick={() => setBulkConfirm(null)}
                  className="text-xs text-text-secondary hover:text-text"
                >
                  ยกเลิก
                </button>
              </>
            ) : bulkConfirm === "unpublish" ? (
              <>
                <span>
                  ถอน {bulkUnpublishable.length} ตอนออกจากการเผยแพร่ -
                  ลิงก์เดิมจะเข้าไม่ได้ และคอมเมนต์จะถูกซ่อนไว้ (ไม่ลบ)
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void runBulk(
                      (chapter) => unpublishChapter(novelRef, chapter.slug),
                      bulkUnpublishable,
                    )
                  }
                  className="inline-flex min-h-9 items-center rounded-md bg-primary px-3.5 text-xs font-medium text-white hover:opacity-90"
                >
                  ยืนยันถอนออก
                </button>
                <button
                  type="button"
                  onClick={() => setBulkConfirm(null)}
                  className="text-xs text-text-secondary hover:text-text"
                >
                  ยกเลิก
                </button>
              </>
            ) : (
              <>
                <span className="text-error">
                  ลบ {selectedChapters.length} ตอนถาวร
                  {(() => {
                    const words = selectedChapters.reduce(
                      (sum, c) => sum + c.word_count,
                      0,
                    );
                    return words > 0 ? ` - เนื้อหารวม ${count(words)} คำจะหายไป` : "";
                  })()}
                  {bulkUnpublishable.length > 0
                    ? ` (มี ${bulkUnpublishable.length} ตอนที่เผยแพร่อยู่ - ผู้อ่านที่บุ๊กมาร์กไว้จะเข้าไม่ได้อีก)`
                    : ""}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void runBulk(
                      (chapter) => deleteChapter(novelRef, chapter.slug),
                      selectedChapters,
                    )
                  }
                  className="inline-flex min-h-9 items-center rounded-md bg-error px-3.5 text-xs font-medium text-white hover:opacity-90"
                >
                  ยืนยันลบ
                </button>
                <button
                  type="button"
                  onClick={() => setBulkConfirm(null)}
                  className="text-xs text-text-secondary hover:text-text"
                >
                  ยกเลิก
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 text-start text-sm hover:bg-surface-secondary disabled:opacity-40 ${
        tone === "danger" ? "text-error" : "text-text"
      }`}
    >
      {children}
    </button>
  );
}

function MenuLink({
  href,
  children,
  onNavigate,
}: {
  href: string;
  children: React.ReactNode;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onNavigate}
      className="px-3 py-1.5 text-start text-sm text-text hover:bg-surface-secondary"
    >
      {children}
    </Link>
  );
}
