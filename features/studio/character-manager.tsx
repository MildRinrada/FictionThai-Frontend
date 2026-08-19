"use client";

import { useRef, useState } from "react";

import { CharacterCard } from "@/components/fiction/character-section";
import { Icon } from "@/components/ui/icon";
import { ApiError } from "@/lib/api";
import {
  createCharacter,
  deleteCharacter,
  reorderCharacters,
  setCharacterAppearances,
  updateCharacter,
} from "@/lib/characters-client";
import { uploadMedia } from "@/lib/media-client";
import { MEDIA_ACCEPT } from "@/types/media";
import type { Character, CharacterDetail } from "@/types/character";
import { ChapterStatus, type ChapterSummary } from "@/types/novel";

/**
 * The cast editor.
 *
 * A client island, because everything on it is a write. It holds the whole cast
 * in state; each open card AUTOSAVES its edits (debounced, like everywhere else
 * writing happens on this site), so collapsing a card can never lose work. The
 * server still owns ordering and normalisation - what the API returns replaces
 * the list entry, never the other way around.
 *
 * Deleting a character removes AUTHOR-CREATED metadata, so it lives in its own
 * zone at the bottom of the card behind an explicit confirmation that names the
 * character. It never touches a chapter.
 */

const AUTOSAVE_DELAY_MS = 800;

/** Cast size at which the search box appears - scanning stops working there. */
const SEARCH_THRESHOLD = 6;

/**
 * Field caps mirroring the API's validation, enforced on the inputs so the
 * request that leaves this page can only fail for reasons typing cannot
 * prevent (a duplicate name, a sentence pasted into ลักษณะนิสัย).
 */
const LIMIT = {
  name: 120,
  role: 120,
  summary: 300,
  quote: 500,
  description: 20_000,
  // Generous on purpose: a personality is often a full sentence, not chips.
  trait: 300,
  traits: 12,
  detailLabel: 200,
  detailValue: 2000,
  details: 20,
} as const;

/**
 * A "Validation failed." toast tells the writer nothing. Translate the API's
 * field errors into a Thai sentence that names the field and the rule, so the
 * fix is obvious from the message alone.
 */
function thaiSaveError(cause: unknown): string | null {
  if (!(cause instanceof ApiError) || !cause.fields) return null;
  const fields = cause.fields;
  const has = (key: string, part: string) =>
    fields[key]?.some((message) => message.includes(part)) ?? false;

  if (fields.name) {
    if (has("name", "exists"))
      return "มีตัวละครชื่อนี้อยู่แล้วในเรื่อง - เปลี่ยนชื่อแล้วระบบจะบันทึกให้ใหม่";
    if (has("name", "too long")) return `ชื่อยาวเกิน ${LIMIT.name} ตัวอักษร`;
    return "ต้องมีชื่อตัวละครก่อน ระบบจึงจะบันทึกได้";
  }
  if (fields.traits) {
    return has("traits", "Too many")
      ? `ลักษณะนิสัยใส่ได้ไม่เกิน ${LIMIT.traits} คำ`
      : `ลักษณะนิสัยแต่ละคำต้องไม่เกิน ${LIMIT.trait} ตัวอักษร - แยกเป็นวลีสั้น ๆ คั่นด้วยจุลภาค (,)`;
  }
  if (fields.role) return `บทบาทยาวเกิน ${LIMIT.role} ตัวอักษร`;
  if (fields.summary) return `คำอธิบายสั้นยาวเกิน ${LIMIT.summary} ตัวอักษร`;
  if (fields.quote) return `ประโยคติดปากยาวเกิน ${LIMIT.quote} ตัวอักษร`;
  if (fields.description) return `ภูมิหลังยาวเกิน ${LIMIT.description.toLocaleString("th-TH")} ตัวอักษร`;
  if (fields.details) {
    return has("details", "Too many")
      ? `ข้อมูลเพิ่มเติมมีได้ไม่เกิน ${LIMIT.details} หัวข้อ`
      : `ข้อมูลเพิ่มเติมยาวเกินกำหนด (หัวข้อ ${LIMIT.detailLabel} / เนื้อหา ${LIMIT.detailValue.toLocaleString("th-TH")} ตัวอักษร)`;
  }
  if (fields.avatar_url) return "รูปตัวละครต้องเป็นลิงก์แบบ http(s)";
  return null;
}

/**
 * The trait problems typing CAN cause, caught before the request is sent.
 * A problem here never blocks the rest of the card - the save simply leaves
 * the traits as they were and says so next to the field.
 */
function traitProblem(traits: string): string | null {
  const chips = traits
    .split(",")
    .map((trait) => trait.trim())
    .filter(Boolean);
  const longChip = chips.find((chip) => [...chip].length > LIMIT.trait);
  if (longChip) {
    const shown = [...longChip].length > 24 ? `${[...longChip].slice(0, 24).join("")}…` : longChip;
    return `«${shown}» ยาวเกิน ${LIMIT.trait} ตัวอักษร - แยกเป็นวลีสั้น ๆ คั่นด้วยจุลภาค (,) แล้วระบบจะบันทึกให้`;
  }
  if (chips.length > LIMIT.traits) {
    return `ลักษณะนิสัยใส่ได้ไม่เกิน ${LIMIT.traits} คำ (ตอนนี้มี ${chips.length}) - ส่วนนี้ยังไม่ถูกบันทึก`;
  }
  return null;
}

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error" | "needs-name";

interface Draft {
  name: string;
  role: string;
  summary: string;
  quote: string;
  description: string;
  traits: string;
}

function draftOf(character: Character): Draft {
  return {
    name: character.name,
    role: character.role ?? "",
    summary: character.summary ?? "",
    quote: character.quote ?? "",
    description: character.description ?? "",
    traits: character.traits.join(", "),
  };
}

/** The chapter-picker label: the number alone tells a writer nothing (#14). */
function chapterLabel(chapter: ChapterSummary): string {
  return `${chapter.chapter_number} · ${chapter.title || `ตอนที่ ${chapter.chapter_number}`}`;
}

/** A reader cannot see this chapter yet - say so instead of styling it alike. */
function chapterStateLabel(chapter: ChapterSummary): string | null {
  switch (chapter.status) {
    case ChapterStatus.Draft:
      return "ร่าง";
    case ChapterStatus.Scheduled:
      return "ตั้งเวลา";
    case ChapterStatus.Unpublished:
      return "ซ่อนอยู่";
    default:
      return null;
  }
}

/**
 * What the reader card will show for the current, possibly unsaved edits -
 * built from the draft so the preview tracks every keystroke.
 */
function previewOf(
  character: Character,
  draft: Draft,
  details: CharacterDetail[],
): Character {
  return {
    ...character,
    name: draft.name.trim() || character.name,
    role: draft.role.trim() || undefined,
    summary: draft.summary.trim() || undefined,
    quote: draft.quote.trim() || undefined,
    description: draft.description.trim() || undefined,
    traits: draft.traits
      .split(",")
      .map((trait) => trait.trim())
      .filter(Boolean),
    details: details.filter((detail) => detail.label.trim() !== ""),
  };
}

export function CharacterManager({
  novelRef,
  initialCharacters,
  chapters,
}: {
  novelRef: string;
  initialCharacters: Character[];
  chapters: ChapterSummary[];
}) {
  const [cast, setCast] = useState(initialCharacters);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One card open at a time: a card's form is long, and three open at once
  // buries the page (#7).
  const [openID, setOpenID] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Row drag state. `armed` gates draggable to the handle, so selecting text
  // inside an open card can never start a drag.
  const [armed, setArmed] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function report(cause: unknown, fallback: string) {
    setError(cause instanceof ApiError ? cause.message : fallback);
  }

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === "") return;

    // Two cast members with one name would be indistinguishable everywhere the
    // cast appears (#4). The API refuses it too; checking here answers in Thai
    // without a round trip.
    if (cast.some((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      setError(`มีตัวละครชื่อ «${trimmed}» อยู่แล้ว - ใช้ชื่ออื่น หรือแก้ไขตัวเดิมด้านล่าง`);
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const created = await createCharacter(novelRef, { name: trimmed });
      setCast((current) => [...current, created]);
      setName("");
      // Open the new character straight away: the writer created it in order to
      // fill it in.
      setOpenID(created.id);
    } catch (cause) {
      if (cause instanceof ApiError && cause.fields?.name) {
        setError(`มีตัวละครชื่อ «${trimmed}» อยู่แล้ว - ใช้ชื่ออื่น หรือแก้ไขตัวเดิมด้านล่าง`);
      } else {
        report(cause, "เพิ่มตัวละครไม่สำเร็จ");
      }
    } finally {
      setCreating(false);
    }
  }

  async function applyOrder(next: Character[], fallback: Character[]) {
    setCast(next);
    setError(null);
    try {
      const saved = await reorderCharacters(
        novelRef,
        next.map((character) => character.id),
      );
      setCast(saved);
    } catch (cause) {
      setCast(fallback);
      report(cause, "จัดลำดับไม่สำเร็จ");
    }
  }

  function onMove(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= cast.length) return;
    const next = [...cast];
    [next[index], next[target]] = [next[target], next[index]];
    void applyOrder(next, cast);
  }

  function onDropRow(target: number) {
    const from = dragIndex;
    setDragIndex(null);
    setOverIndex(null);
    setArmed(null);
    if (from === null || from === target) return;
    const next = [...cast];
    const [moved] = next.splice(from, 1);
    next.splice(target, 0, moved);
    void applyOrder(next, cast);
  }

  /** Returns null on success, or the Thai reason the save was refused. */
  async function onSave(
    id: string,
    patch: Parameters<typeof updateCharacter>[2],
  ): Promise<string | null> {
    setError(null);
    try {
      const saved = await updateCharacter(novelRef, id, patch);
      setCast((current) =>
        current.map((character) => (character.id === id ? saved : character)),
      );
      return null;
    } catch (cause) {
      const why =
        thaiSaveError(cause) ??
        (cause instanceof ApiError ? cause.message : "บันทึกตัวละครไม่สำเร็จ");
      setError(why);
      return why;
    }
  }

  async function onDelete(id: string) {
    setError(null);
    try {
      await deleteCharacter(novelRef, id);
      setCast((current) => current.filter((character) => character.id !== id));
    } catch (cause) {
      report(cause, "ลบตัวละครไม่สำเร็จ");
    }
  }

  async function onAppearances(id: string, chapterIDs: string[]) {
    setError(null);
    try {
      const saved = await setCharacterAppearances(novelRef, id, chapterIDs);
      setCast((current) =>
        current.map((character) => (character.id === id ? saved : character)),
      );
    } catch (cause) {
      report(cause, "บันทึกตอนที่ปรากฏไม่สำเร็จ");
    }
  }

  const trimmedQuery = query.trim().toLowerCase();
  const filtering = trimmedQuery !== "";
  const visible = filtering
    ? cast.filter((character) =>
        [character.name, character.role ?? "", character.summary ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(trimmedQuery),
      )
    : cast;

  return (
    <div>
      <form
        onSubmit={onCreate}
        className="mb-6 rounded-lg border border-primary-200 bg-primary-50 p-4"
      >
        <label htmlFor="new-character" className="mono-label block">
          เพิ่มตัวละคร
        </label>
        <div className="mt-2.5 flex flex-wrap gap-2.5">
          <input
            id="new-character"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="ชื่อตัวละคร"
            className="min-h-10 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={creating || name.trim() === ""}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            <Icon name="plus" size={16} />
            {creating ? "กำลังเพิ่ม…" : "เพิ่ม"}
          </button>
        </div>
        <p className="mt-2 text-xs text-text-secondary">
          ใส่แค่ชื่อก่อนก็ได้ รายละเอียดค่อยเติมทีหลัง - ทุกการแก้ไขบันทึกอัตโนมัติ
        </p>
      </form>

      {error ? (
        <p role="alert" className="mb-4 rounded-md bg-error/10 px-3 py-2 text-sm text-error">
          {error}
        </p>
      ) : null}

      {cast.length >= SEARCH_THRESHOLD ? (
        <div className="relative mb-4">
          <Icon
            name="search"
            size={15}
            className="pointer-events-none absolute inset-s-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาตัวละครจากชื่อ บทบาท หรือคำอธิบาย"
            aria-label="ค้นหาตัวละคร"
            className="min-h-10 w-full rounded-md border border-border bg-surface ps-9 pe-3 text-sm outline-none focus:border-primary"
          />
        </div>
      ) : null}

      {cast.length === 0 ? (
        <EmptyCast />
      ) : visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-text-secondary">
          ไม่พบตัวละครที่ตรงกับ «{query.trim()}»
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((character) => {
            const index = cast.indexOf(character);
            return (
              <li
                key={character.id}
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
                  onDropRow(index);
                }}
                className={
                  overIndex === index && dragIndex !== null && dragIndex !== index
                    ? "rounded-lg ring-2 ring-primary/60"
                    : undefined
                }
              >
                <CharacterRow
                  novelRef={novelRef}
                  character={character}
                  chapters={chapters}
                  open={openID === character.id}
                  onToggle={() =>
                    setOpenID(openID === character.id ? null : character.id)
                  }
                  // Reordering while a filter hides part of the cast would move
                  // rows the writer cannot see - the controls pause instead (#5).
                  reorderable={!filtering}
                  canMoveUp={index > 0}
                  canMoveDown={index < cast.length - 1}
                  onMove={(delta) => onMove(index, delta)}
                  onArmDrag={(active) => setArmed(active ? index : null)}
                  onSave={(patch) => onSave(character.id, patch)}
                  onDelete={() => onDelete(character.id)}
                  onAppearances={(ids) => onAppearances(character.id, ids)}
                  onError={(cause, fallback) => report(cause, fallback)}
                />
              </li>
            );
          })}
        </ul>
      )}

      {cast.length > 0 && chapters.length > 0 ? (
        <AppearanceTimeline
          cast={cast}
          chapters={chapters}
          onToggle={(characterID, chapterIDs) =>
            onAppearances(characterID, chapterIDs)
          }
        />
      ) : null}
    </div>
  );
}

/**
 * Why this page exists, shown before the first character does (#16). The form
 * above is the only action, so the button just walks the writer back to it.
 */
function EmptyCast() {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <Icon name="users" size={28} className="mx-auto text-text-muted" />
      <h2 className="mt-3 font-serif text-base font-semibold">
        ยังไม่มีตัวละครในเรื่องนี้
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-secondary">
        ตัวละครที่เพิ่มไว้จะกลายเป็นการ์ดแนะนำบนหน้าเรื่อง
        ให้ผู้อ่านใหม่รู้จักใครเป็นใครก่อนเริ่มอ่าน
        และเมื่อเลือกตอนที่แต่ละคนปรากฏ หน้านี้จะสร้างไทม์ไลน์ให้อัตโนมัติ
      </p>
      <button
        type="button"
        onClick={() => document.getElementById("new-character")?.focus()}
        className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-md border border-primary-200 px-4 text-sm font-medium text-primary hover:bg-primary-50"
      >
        <Icon name="plus" size={15} />
        เริ่มจากใส่ชื่อตัวละครแรก
      </button>
    </div>
  );
}

function CharacterRow({
  novelRef,
  character,
  chapters,
  open,
  onToggle,
  reorderable,
  canMoveUp,
  canMoveDown,
  onMove,
  onArmDrag,
  onSave,
  onDelete,
  onAppearances,
  onError,
}: {
  novelRef: string;
  character: Character;
  chapters: ChapterSummary[];
  open: boolean;
  onToggle: () => void;
  reorderable: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (delta: number) => void;
  onArmDrag: (active: boolean) => void;
  onSave: (patch: Parameters<typeof updateCharacter>[2]) => Promise<string | null>;
  onDelete: () => void;
  onAppearances: (chapterIDs: string[]) => void;
  onError: (cause: unknown, fallback: string) => void;
}) {
  const [draft, setDraft] = useState(() => draftOf(character));
  // Detail rows start at what actually exists - no permanently-parked empty
  // row next to an "เพิ่มหัวข้อ" button that does the same thing (#12).
  const [details, setDetails] = useState<CharacterDetail[]>(character.details);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  // The specific Thai reason a save was refused, shown in place of the generic
  // error label so the writer knows WHICH field to fix.
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  // A trait list that cannot be saved yet (too long / too many). It warns at
  // the field and holds ONLY the traits back - everything else keeps saving.
  const [traitWarning, setTraitWarning] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Secondary fields hide behind one disclosure so a new card asks for three
  // things, not eight (#19). Filled fields keep it open - hiding content the
  // writer wrote would look like losing it.
  const [moreOpen, setMoreOpen] = useState(
    () =>
      Boolean(character.description || character.quote) ||
      character.traits.length > 0 ||
      character.details.length > 0,
  );
  // Detail-row drag (#13): same armed-handle pattern as the cast rows.
  const [detailArmed, setDetailArmed] = useState<number | null>(null);
  const [detailDrag, setDetailDrag] = useState<number | null>(null);
  const [detailOver, setDetailOver] = useState<number | null>(null);

  const saveTimer = useRef<number | null>(null);
  const editSeq = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  function buildPatch(nextDraft: Draft, nextDetails: CharacterDetail[]) {
    return {
      name: nextDraft.name.trim(),
      // An emptied box is a deliberate clear, which the API expresses as null.
      role: nextDraft.role.trim() || null,
      summary: nextDraft.summary.trim() || null,
      quote: nextDraft.quote.trim() || null,
      description: nextDraft.description.trim() || null,
      traits: nextDraft.traits
        .split(",")
        .map((trait) => trait.trim())
        .filter(Boolean),
      // A half-filled row is work in progress: it stays on screen but is not
      // sent, exactly as the API would treat it anyway.
      details: nextDetails.filter((detail) => detail.label.trim() !== ""),
    };
  }

  async function persist(nextDraft: Draft, nextDetails: CharacterDetail[]) {
    if (nextDraft.name.trim() === "") {
      setSaveState("needs-name");
      return;
    }
    // A sentence pasted into ลักษณะนิสัย is the one length problem the inputs
    // cannot cap. It must never hold the REST of the card hostage: the save
    // goes ahead without the traits, and the field itself says why.
    const problem = traitProblem(nextDraft.traits);
    setTraitWarning(problem);
    const patch = buildPatch(nextDraft, nextDetails);
    if (problem) delete (patch as { traits?: string[] }).traits;

    const at = editSeq.current;
    setSaveState("saving");
    const why = await onSave(patch);
    // Edits made while this save was in flight already scheduled the next one -
    // their state ("dirty") must not be overwritten with "saved".
    if (editSeq.current === at) {
      setSaveMessage(why);
      setSaveState(why === null ? "saved" : "error");
    }
  }

  /**
   * Every edit funnels through here: apply it, then (re)start the autosave
   * clock with the values the timer should write (#2). The closure carries the
   * exact snapshot, so a later keystroke simply replaces the pending save.
   */
  function mutate(nextDraft: Draft, nextDetails: CharacterDetail[]) {
    setDraft(nextDraft);
    setDetails(nextDetails);
    setSaveState("dirty");
    editSeq.current += 1;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void persist(nextDraft, nextDetails);
    }, AUTOSAVE_DELAY_MS);
  }

  /** Closing the card flushes any pending edit first - nothing can be lost. */
  async function finish() {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (saveState === "dirty" || saveState === "error" || saveState === "needs-name") {
      await persist(draft, details);
    }
    onToggle();
  }

  async function onPickAvatar(file: File) {
    setUploading(true);
    try {
      const media = await uploadMedia({
        file,
        purpose: "character_avatar",
        novel: novelRef,
      });
      const why = await onSave({ avatar_url: media.url });
      if (why !== null) {
        setSaveMessage(why);
        setSaveState("error");
      }
    } catch (cause) {
      onError(cause, "อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const appearsIn = new Set(character.appears_in ?? []);

  const saveLabel: Record<SaveState, string | null> = {
    idle: null,
    dirty: "มีการแก้ไขที่ยังไม่บันทึก…",
    saving: "กำลังบันทึก…",
    saved: "บันทึกอัตโนมัติแล้ว",
    error: saveMessage ?? "บันทึกไม่สำเร็จ - แก้ไขอีกครั้งเพื่อลองใหม่",
    "needs-name": "ใส่ชื่อก่อน ระบบจึงจะบันทึกได้",
  };

  return (
    <article className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-3 p-4">
        {reorderable ? (
          <span
            role="button"
            tabIndex={-1}
            aria-hidden
            title="ลากเพื่อจัดลำดับ"
            onPointerDown={() => onArmDrag(true)}
            onPointerUp={() => onArmDrag(false)}
            className="cursor-grab touch-none text-text-muted hover:text-text active:cursor-grabbing"
          >
            <Icon name="grip" size={16} />
          </span>
        ) : null}

        <span className="art-placeholder flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border">
          {character.avatar_url ? (
            // Character art is served from object storage, an origin the image
            // optimizer has no configured loader for.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={character.avatar_url} alt="" className="size-full object-cover" />
          ) : (
            <Icon name="user" size={16} className="text-text-muted" />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate font-serif text-base font-semibold">
            {character.name}
          </span>
          <span className="mt-0.5 block truncate text-xs text-text-muted">
            {character.role || "ยังไม่ได้ระบุบทบาท"}
            {" · "}
            {appearsIn.size > 0
              ? `ปรากฏ ${appearsIn.size} ตอน`
              : "ยังไม่ได้เลือกตอนที่ปรากฏ"}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-1">
          <IconButton
            label="เลื่อนขึ้น"
            disabled={!reorderable || !canMoveUp}
            onClick={() => onMove(-1)}
          >
            ↑
          </IconButton>
          <IconButton
            label="เลื่อนลง"
            disabled={!reorderable || !canMoveDown}
            onClick={() => onMove(1)}
          >
            ↓
          </IconButton>
          <button
            type="button"
            onClick={open ? () => void finish() : onToggle}
            aria-expanded={open}
            className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-3 text-xs text-text-secondary hover:border-primary-200 hover:text-text"
          >
            <Icon name={open ? "chevron-up" : "chevron-down"} size={13} />
            {open ? "เสร็จสิ้น" : "แก้ไข"}
          </button>
        </span>
      </div>

      {open ? (
        <div className="border-t border-hairline p-4">
          <div className="mb-4 flex items-center gap-3">
            <span className="art-placeholder flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border">
              {character.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={character.avatar_url} alt="" className="size-full object-cover" />
              ) : (
                <Icon name="camera" size={18} className="text-text-muted" />
              )}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInput}
                type="file"
                accept={MEDIA_ACCEPT}
                className="sr-only"
                aria-label="เลือกรูปตัวละคร"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onPickAvatar(file);
                }}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs text-text-secondary hover:border-primary-200 hover:text-text disabled:opacity-50"
              >
                <Icon name="image" size={14} />
                {uploading
                  ? "กำลังอัปโหลด…"
                  : character.avatar_url
                    ? "เปลี่ยนรูป"
                    : "อัปโหลดรูป"}
              </button>
              {character.avatar_url ? (
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => void onSave({ avatar_url: null })}
                  className="inline-flex min-h-9 items-center rounded-md px-2.5 text-xs text-text-muted hover:text-error disabled:opacity-50"
                >
                  ลบรูป
                </button>
              ) : (
                <span className="text-xs text-text-muted">
                  รูปนี้จะแสดงบนการ์ดตัวละครหน้าเรื่อง
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="ชื่อ"
              value={draft.name}
              maxLength={LIMIT.name}
              onChange={(value) => mutate({ ...draft, name: value }, details)}
            />
            <Field
              label="บทบาท"
              value={draft.role}
              placeholder="เช่น ตัวละครหลัก · ผู้เล่าเรื่อง"
              maxLength={LIMIT.role}
              onChange={(value) => mutate({ ...draft, role: value }, details)}
            />
          </div>

          <Field
            className="mt-3"
            label="คำอธิบายสั้น"
            value={draft.summary}
            placeholder="หนึ่งบรรทัดที่แสดงบนการ์ด"
            maxLength={LIMIT.summary}
            onChange={(value) => mutate({ ...draft, summary: value }, details)}
          />

          <details
            className="mt-4"
            open={moreOpen}
            onToggle={(event) => setMoreOpen(event.currentTarget.open)}
          >
            <summary className="mono-label cursor-pointer select-none text-text-secondary hover:text-text">
              รายละเอียดเพิ่มเติม
            </summary>

            <div className="mt-3">
              <label className="mono-label block" htmlFor={`desc-${character.id}`}>
                ภูมิหลัง
              </label>
              <textarea
                id={`desc-${character.id}`}
                value={draft.description}
                onChange={(event) =>
                  mutate({ ...draft, description: event.target.value }, details)
                }
                rows={3}
                maxLength={LIMIT.description}
                className="mt-1.5 min-h-20 w-full resize-y rounded-md border border-border bg-background p-2.5 text-sm outline-none field-sizing-content focus:border-primary"
              />
            </div>

            <Field
              className="mt-3"
              label="ลักษณะนิสัย"
              value={draft.traits}
              placeholder="คั่นด้วยจุลภาค เช่น เก็บความรู้สึก, ใจแข็ง"
              onChange={(value) => mutate({ ...draft, traits: value }, details)}
            />
            {traitWarning ? (
              <p className="mt-1 text-xs text-warning">{traitWarning}</p>
            ) : null}

            <Field
              className="mt-3"
              label="ประโยคติดปาก"
              value={draft.quote}
              placeholder={`เช่น "ไม่เป็นไร เดี๋ยวฉันจัดการเอง"`}
              maxLength={LIMIT.quote}
              onChange={(value) => mutate({ ...draft, quote: value }, details)}
            />

            <fieldset className="mt-4">
              <legend className="mono-label">ข้อมูลเพิ่มเติม</legend>
              <p className="mt-1 mb-2 text-xs text-text-secondary">
                ตั้งชื่อหัวข้อเองได้ทั้งหมด - ไม่มีชุดฟิลด์ตายตัว
              </p>
              <div className="flex flex-col gap-2">
                {details.map((detail, index) => (
                  <div
                    key={index}
                    draggable={detailArmed === index}
                    onDragStart={(event) => {
                      event.stopPropagation();
                      event.dataTransfer.effectAllowed = "move";
                      setDetailDrag(index);
                    }}
                    onDragEnd={() => {
                      setDetailDrag(null);
                      setDetailOver(null);
                      setDetailArmed(null);
                    }}
                    onDragOver={(event) => {
                      if (detailDrag === null) return;
                      event.preventDefault();
                      event.stopPropagation();
                      setDetailOver(index);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const from = detailDrag;
                      setDetailDrag(null);
                      setDetailOver(null);
                      setDetailArmed(null);
                      if (from === null || from === index) return;
                      const next = [...details];
                      const [moved] = next.splice(from, 1);
                      next.splice(index, 0, moved);
                      mutate(draft, next);
                    }}
                    className={`flex flex-wrap items-center gap-2 ${
                      detailOver === index && detailDrag !== null && detailDrag !== index
                        ? "rounded-md ring-2 ring-primary/60"
                        : ""
                    }`}
                  >
                    <span
                      role="button"
                      tabIndex={-1}
                      aria-hidden
                      title="ลากเพื่อจัดลำดับหัวข้อ"
                      onPointerDown={() => setDetailArmed(index)}
                      onPointerUp={() => setDetailArmed(null)}
                      className="cursor-grab touch-none text-text-muted hover:text-text active:cursor-grabbing"
                    >
                      <Icon name="grip" size={14} />
                    </span>
                    <input
                      value={detail.label}
                      onChange={(event) =>
                        mutate(
                          draft,
                          details.map((item, i) =>
                            i === index ? { ...item, label: event.target.value } : item,
                          ),
                        )
                      }
                      placeholder="หัวข้อ"
                      maxLength={LIMIT.detailLabel}
                      aria-label={`หัวข้อที่ ${index + 1}`}
                      className="min-h-9 w-36 rounded-md border border-border px-2.5 text-sm outline-none focus:border-primary"
                    />
                    <input
                      value={detail.value}
                      onChange={(event) =>
                        mutate(
                          draft,
                          details.map((item, i) =>
                            i === index ? { ...item, value: event.target.value } : item,
                          ),
                        )
                      }
                      placeholder="ค่า"
                      maxLength={LIMIT.detailValue}
                      aria-label={`ค่าของหัวข้อที่ ${index + 1}`}
                      className="min-h-9 min-w-0 flex-1 rounded-md border border-border px-2.5 text-sm outline-none focus:border-primary"
                    />
                    <IconButton
                      label="ลบหัวข้อนี้"
                      onClick={() =>
                        mutate(
                          draft,
                          details.filter((_, i) => i !== index),
                        )
                      }
                    >
                      ✕
                    </IconButton>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => mutate(draft, [...details, { label: "", value: "" }])}
                className="mt-2 inline-flex min-h-9 items-center rounded-md border border-dashed border-border px-3 text-[13px] text-text-secondary hover:border-primary-200 hover:text-primary"
              >
                + เพิ่มหัวข้อ
              </button>
            </fieldset>
          </details>

          {chapters.length > 0 ? (
            <fieldset className="mt-4">
              <legend className="mono-label">ปรากฏในตอน</legend>
              <p className="mt-1 mb-2 text-xs text-text-secondary">
                เรียงตามลำดับตอน - ใช้เป็นไทม์ไลน์ของตัวละครนี้
              </p>
              <div className="flex flex-wrap gap-1.5">
                {chapters.map((chapter) => {
                  const active = appearsIn.has(chapter.id);
                  const state = chapterStateLabel(chapter);
                  return (
                    <button
                      key={chapter.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        onAppearances(
                          active
                            ? [...appearsIn].filter((id) => id !== chapter.id)
                            : [...appearsIn, chapter.id],
                        )
                      }
                      className={`inline-flex min-h-8 max-w-56 items-center gap-1.5 rounded-md border px-2.5 text-xs ${
                        state ? "border-dashed" : ""
                      } ${
                        active
                          ? "border-primary bg-primary-50 text-primary"
                          : "border-border text-text-secondary hover:text-text"
                      }`}
                    >
                      <span className="truncate">{chapterLabel(chapter)}</span>
                      {state ? (
                        <span className="shrink-0 text-[10px] text-text-muted">
                          {state}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          <details className="mt-4 rounded-md border border-hairline">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-text-secondary hover:text-text">
              ดูตัวอย่างที่ผู้อ่านเห็น
            </summary>
            <div className="border-t border-hairline bg-background p-3">
              <CharacterCard character={previewOf(character, draft, details)} />
            </div>
          </details>

          <p aria-live="polite" className="mt-3 min-h-4 text-xs text-text-muted">
            {saveLabel[saveState]}
          </p>

          <div className="mt-4 border-t border-hairline pt-4">
            {confirming ? (
              <div className="rounded-md border border-error/40 bg-error/5 p-3">
                <p className="text-sm text-error">
                  ลบ «{character.name}» ถาวร?
                  การลบไม่กระทบเนื้อหาตอนใด ๆ - ลบเฉพาะข้อมูลตัวละครที่คุณสร้างไว้
                </p>
                <div className="mt-2.5 flex gap-2.5">
                  <button
                    type="button"
                    onClick={onDelete}
                    className="inline-flex min-h-9 items-center rounded-md bg-error px-3.5 text-sm font-medium text-white hover:opacity-90"
                  >
                    ยืนยันลบ
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="inline-flex min-h-9 items-center rounded-md border border-border px-3.5 text-sm text-text-secondary"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm text-text-muted hover:text-error"
              >
                <Icon name="trash" size={14} />
                ลบตัวละคร
              </button>
            )}
          </div>
        </div>
      ) : null}
    </article>
  );
}

/**
 * The promised timeline (#17): every character × every chapter on one grid.
 * Each cell is the same appearance toggle the per-card picker writes, so the
 * two views can never disagree.
 */
function AppearanceTimeline({
  cast,
  chapters,
  onToggle,
}: {
  cast: Character[];
  chapters: ChapterSummary[];
  onToggle: (characterID: string, chapterIDs: string[]) => void;
}) {
  return (
    <section aria-labelledby="timeline-heading" className="mt-8">
      <h2 id="timeline-heading" className="mono-label">
        ไทม์ไลน์การปรากฏ
      </h2>
      <p className="mt-1 mb-3 text-xs text-text-secondary">
        แถวละตัวละคร คอลัมน์ละตอน - กดช่องเพื่อบันทึกว่าใครปรากฏตอนไหน
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-hairline">
              <th className="sticky inset-s-0 z-10 min-w-36 bg-surface px-3 py-2 text-start font-medium">
                ตัวละคร
              </th>
              {chapters.map((chapter) => {
                const state = chapterStateLabel(chapter);
                return (
                  <th
                    key={chapter.id}
                    scope="col"
                    title={chapterLabel(chapter)}
                    className={`px-2 py-2 text-center text-xs font-normal ${
                      state ? "text-text-muted" : "text-text-secondary"
                    }`}
                  >
                    {chapter.chapter_number}
                    {state ? <span className="block text-[10px]">{state}</span> : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {cast.map((character) => {
              const appears = new Set(character.appears_in ?? []);
              return (
                <tr key={character.id} className="border-b border-hairline last:border-b-0">
                  <th
                    scope="row"
                    className="sticky inset-s-0 z-10 max-w-44 truncate bg-surface px-3 py-1.5 text-start font-normal"
                  >
                    {character.name}
                  </th>
                  {chapters.map((chapter) => {
                    const active = appears.has(chapter.id);
                    return (
                      <td key={chapter.id} className="px-1 py-1 text-center">
                        <button
                          type="button"
                          aria-pressed={active}
                          aria-label={`${character.name} - ${chapterLabel(chapter)}`}
                          onClick={() =>
                            onToggle(
                              character.id,
                              active
                                ? [...appears].filter((id) => id !== chapter.id)
                                : [...appears, chapter.id],
                            )
                          }
                          className={`inline-flex size-7 items-center justify-center rounded-md border text-xs ${
                            active
                              ? "border-primary bg-primary-50 text-primary"
                              : "border-transparent text-text-muted hover:border-border"
                          }`}
                        >
                          {active ? "●" : "○"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  className?: string;
}) {
  const id = `field-${label}`;
  return (
    <div className={className}>
      <label className="mono-label block" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
      />
    </div>
  );
}

function IconButton({
  children,
  label,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex size-9 items-center justify-center rounded-md text-text-muted hover:bg-surface-secondary hover:text-text disabled:opacity-30"
    >
      {children}
    </button>
  );
}
