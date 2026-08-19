"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { count } from "@/lib/format";
import { listChapters, listNovels } from "@/lib/novels-client";
import type { PostReference, PostReferenceInput } from "@/types/community";
import type { ChapterSummary, Novel } from "@/types/novel";

/**
 * The composer's attach control (docs/PHASE-12-STORY-DEPTH.md §12D).
 *
 * A client island because searching and picking is genuinely interactive. It
 * is the only part of the community page that needs JavaScript; the feed and
 * its cards stay server-rendered.
 *
 * It searches through the ordinary fiction listing, so a writer can attach
 * someone else's work as easily as their own - recommending what you are
 * reading is the point of the feature, not only announcing what you wrote.
 * Nothing here decides what may be attached: the API refuses a fiction the
 * caller cannot read, and refuses it with the same message it gives for one
 * that does not exist (docs/11 §3.4).
 *
 * One reference per post, matching the schema. The limit is stated in the UI
 * rather than silently enforced.
 */

const SEARCH_DEBOUNCE_MS = 300;

export interface ReferencePickerProps {
  /** The current attachment, if any. */
  value: PostReference | null;
  onChange: (value: PostReference | null) => void;
  disabled?: boolean;
  /**
   * Controlled open state, for a composer whose toolbar renders its own
   * "แนบตอน" trigger inline (docs/COMMUNITY-FEED.md). When provided together
   * with hideTrigger, the picker renders nothing until opened.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Suppress the built-in trigger; the caller renders its own. */
  hideTrigger?: boolean;
}

/** Builds the wire shape from a picked fiction and optional chapter. */
export function referenceInputOf(reference: PostReference): PostReferenceInput {
  return reference.chapter_id
    ? { novel_id: reference.novel_id, chapter_id: reference.chapter_id }
    : { novel_id: reference.novel_id };
}

/**
 * The optimistic card shown once something is picked.
 *
 * The API returns the authoritative resolved reference when the post saves;
 * this is built locally only so the composer can show what is attached before
 * that happens.
 */
function referenceOf(novel: Novel, chapter: ChapterSummary | null): PostReference {
  return {
    novel_id: novel.id,
    novel_slug: novel.slug,
    novel_title: novel.title,
    cover_url: novel.cover_url ?? null,
    story_structure: novel.story_structure,
    presentation_format: novel.presentation_format,
    content_mode: novel.content_mode,
    age_rating: novel.age_rating,
    chapter_id: chapter?.id ?? null,
    chapter_slug: chapter?.slug ?? null,
    chapter_number: chapter?.chapter_number ?? null,
    chapter_title: chapter?.title ?? null,
    word_count: chapter?.word_count ?? null,
  };
}

function chapterLabel(chapter: ChapterSummary): string {
  return chapter.title
    ? `ตอนที่ ${chapter.chapter_number} ${chapter.title}`
    : `ตอนที่ ${chapter.chapter_number}`;
}

export function ReferencePicker({
  value,
  onChange,
  disabled,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: ReferencePickerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      setInternalOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Novel[]>([]);
  const [novel, setNovel] = useState<Novel | null>(null);
  const [chapters, setChapters] = useState<ChapterSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const searchId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  // Search. Debounced, because every keystroke would otherwise be a request
  // against the listing endpoint.
  useEffect(() => {
    if (!open || novel) return;

    const term = query.trim();
    let cancelled = false;
    const timer = setTimeout(() => {
      setBusy(true);
      setFailed(false);
      listNovels(term ? { q: term, per_page: 8 } : { sort: "updated", per_page: 8 })
        .then((page) => {
          if (!cancelled) setResults(page.items);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, novel, query]);

  const pickNovel = useCallback(async (picked: Novel) => {
    setNovel(picked);
    setChapters([]);
    setFailed(false);

    // A one-shot has nothing to choose between: attaching it means attaching
    // the fiction (docs/15 §5.2 - a one-shot must not grow a chapter list).
    if (!picked.uses_chapter_navigation) return;

    setBusy(true);
    try {
      const page = await listChapters(picked.id);
      setChapters(page.items);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, []);

  const attach = useCallback(
    (picked: Novel, chapter: ChapterSummary | null) => {
      onChange(referenceOf(picked, chapter));
      setOpen(false);
      setNovel(null);
      setChapters([]);
      setQuery("");
    },
    [onChange, setOpen],
  );

  const reset = useCallback(() => {
    setOpen(false);
    setNovel(null);
    setChapters([]);
    setQuery("");
    setFailed(false);
  }, [setOpen]);

  if (value && !open) {
    return (
      <AttachedSummary
        reference={value}
        disabled={disabled}
        onChange={() => setOpen(true)}
        onRemove={() => onChange(null)}
      />
    );
  }

  if (!open) {
    if (hideTrigger) return null;
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title="แนบได้ 1 ตอนต่อโพสต์"
        className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border px-3 text-sm text-text-secondary hover:border-primary-200 hover:text-primary disabled:opacity-60"
      >
        <Icon name="paperclip" size={16} />
        แนบตอน
      </button>
    );
  }

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={searchId} className="text-sm font-medium">
          {novel ? "เลือกตอนที่จะแนบ" : "ค้นหาเรื่องที่จะแนบ"}
        </label>
        <button
          type="button"
          onClick={reset}
          className="text-xs text-text-secondary hover:text-primary"
        >
          ยกเลิก
        </button>
      </div>

      {novel ? (
        <div className="mt-3">
          <p className="truncate font-serif text-sm font-semibold">{novel.title}</p>
          <button
            type="button"
            onClick={() => {
              setNovel(null);
              setChapters([]);
            }}
            className="mt-1 text-xs text-text-secondary hover:text-primary"
          >
            ← เลือกเรื่องอื่น
          </button>

          <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto">
            <li>
              <button
                type="button"
                onClick={() => attach(novel, null)}
                className="w-full rounded-sm px-2 py-2 text-start text-sm hover:bg-surface"
              >
                แนบทั้งเรื่อง
              </button>
            </li>
            {chapters.map((chapter) => (
              <li key={chapter.id}>
                <button
                  type="button"
                  onClick={() => attach(novel, chapter)}
                  className="flex w-full items-baseline justify-between gap-3 rounded-sm px-2 py-2 text-start text-sm hover:bg-surface"
                >
                  <span className="min-w-0 truncate">{chapterLabel(chapter)}</span>
                  <span className="shrink-0 font-mono text-xs text-text-muted tabular-nums">
                    {count(chapter.word_count)} คำ
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {busy ? <p className="mt-2 text-xs text-text-muted">กำลังโหลดตอน…</p> : null}
          {!busy && chapters.length === 0 && novel.uses_chapter_navigation ? (
            <p className="mt-2 text-xs text-text-muted">เรื่องนี้ยังไม่มีตอนที่เผยแพร่</p>
          ) : null}
        </div>
      ) : (
        <div className="mt-3">
          <input
            id={searchId}
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ชื่อเรื่อง หรือชื่อนักเขียน"
            autoComplete="off"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />

          <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
            {results.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void pickNovel(item)}
                  className="flex w-full items-baseline justify-between gap-3 rounded-sm px-2 py-2 text-start text-sm hover:bg-surface"
                >
                  <span className="min-w-0 truncate">{item.title}</span>
                  <span className="shrink-0 text-xs text-text-muted">
                    {item.author.display_name ?? item.author.username}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {busy ? <p className="mt-2 text-xs text-text-muted">กำลังค้นหา…</p> : null}
          {!busy && !failed && results.length === 0 ? (
            <p className="mt-2 text-xs text-text-muted">ไม่พบเรื่องที่ตรงกับคำค้นนี้</p>
          ) : null}
          {failed ? (
            <p className="mt-2 text-xs text-error">ค้นหาไม่สำเร็จ กรุณาลองใหม่</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** The attached state: what is attached, and the two ways out of it. */
function AttachedSummary({
  reference,
  disabled,
  onChange,
  onRemove,
}: {
  reference: PostReference;
  disabled?: boolean;
  onChange: () => void;
  onRemove: () => void;
}) {
  const label = reference.chapter_id
    ? `${reference.novel_title} · ตอนที่ ${reference.chapter_number ?? ""}${
        reference.chapter_title ? ` ${reference.chapter_title}` : ""
      }`
    : reference.novel_title;

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="mono-label block text-[10px]">
            {reference.chapter_id ? "แนบ 1 ตอน" : "แนบทั้งเรื่อง"}
          </span>
          <span className="mt-0.5 block truncate font-serif text-sm font-semibold">
            {label}
          </span>
          <span className="mt-0.5 block text-xs text-text-muted">
            ผู้อ่านจะเห็นการ์ดนี้ในโพสต์ และกดอ่านได้ทันที
          </span>
        </span>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="shrink-0 rounded-sm p-1 text-text-secondary hover:text-primary disabled:opacity-60"
        >
          <Icon name="close" size={16} label="เอาสิ่งที่แนบออก" />
        </button>
      </div>

      <button
        type="button"
        onClick={onChange}
        disabled={disabled}
        className="mt-2 inline-flex items-center gap-2 text-xs text-text-secondary hover:text-primary disabled:opacity-60"
      >
        <Icon name="paperclip" size={14} />
        เปลี่ยนตอนที่แนบ
      </button>
    </div>
  );
}
