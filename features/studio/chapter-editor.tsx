"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { Icon } from "@/components/ui/icon";
import { ApiError } from "@/lib/api";
import { count, readingMinutes, wordsIn } from "@/lib/format";
import { clearLocalDraft, writeLocalDraft } from "@/lib/local-draft";
import { uploadMedia } from "@/lib/media-client";
import { publishChapter, unpublishChapter, updateChapter } from "@/lib/novels-client";
import {
  outlineOf,
  sectionAtIndex,
  sectionAtRune,
  totalWords,
  type OutlineSection,
} from "@/lib/outline";
import { MEDIA_ACCEPT } from "@/types/media";
import { convertChat } from "@/lib/ai-client";
import { ChapterAnalysis } from "@/features/ai/chapter-analysis";
import {
  ChatConversionCard,
  messagesFromConversion,
} from "@/features/ai/chat-conversion";
import { WritingTools } from "@/features/ai/writing-tools";
import { ChapterOutline } from "@/features/studio/chapter-outline";
import { ChatComposer, type DraftMessage } from "@/features/studio/chat-composer";
import { FormatToolbar } from "@/features/studio/format-toolbar";
import { RevisionHistory } from "@/features/studio/revision-history";
import { SchedulePicker } from "@/features/studio/schedule-picker";
import { ChatView } from "@/components/reader/chat-view";
import type { TokenSlot } from "@/components/reader/variable-text";
import { updateCharacter } from "@/lib/characters-client";
import { InsertVariable } from "@/features/studio/insert-variable";
import { RichEditor, type RichEditorHandle } from "@/features/studio/rich-editor";
import { PresentationFormat } from "@/types/fiction";
import type { Character } from "@/types/character";
import type { AiManuscriptMark } from "@/types/ai";
import type { Chapter, ChatMessage, HeadcanonEntry } from "@/types/novel";
import type { NovelVariable } from "@/types/variable";

/**
 * The chapter editor.
 *
 * Three composers, one chapter. docs/CONTENT-MODEL.md is explicit that prose
 * lives in `chapters.content`, chat lives in `chapter_messages`, headcanon
 * entries live in `chapter_entries`, and a chapter may hold all three at once -
 * the active presentation format only decides which one READERS see. This
 * editor is built to make that visible: the writer can open any representation,
 * and editing one never sends the others, so switching panes cannot destroy
 * anything.
 *
 * Saving sends only the field that changed. `content: undefined` leaves prose
 * alone; `messages: undefined` leaves the conversation alone; `entries:
 * undefined` leaves the topic alone (docs/09 §14). Nothing here converts one
 * representation into another - a transformation of an author's text requires
 * an explicit action the product has not specified.
 *
 * SAVING IS THE WRITER'S PRESS (save-model review 2026-08). The system's copy
 * changes on exactly three actions: บันทึกแบบร่าง, เผยแพร่, and ตั้งเวลา. The
 * only automatic saving is the LOCAL one - a per-keystroke copy on this
 * device, for the tab that closes or the machine that dies - and it never
 * leaves the device. The previous behaviour (an idle timer quietly writing to
 * the server) conflated the two, which meant the platform decided when the
 * system's copy changed. That call belongs to the author.
 */

/**
 * Idle time before the outline and the word count are recomputed (docs/EDITOR.md).
 *
 * Both walk the whole manuscript, and `Intl.Segmenter` over a real 79,000-
 * character chapter measures ~105ms on this machine. That work used to happen
 * on EVERY keystroke, for the word count in the meta row alone - a tenth of a
 * second of the main thread between pressing a key and seeing the letter. It
 * waits for a pause now: a table of contents that appears a beat after the
 * heading is typed is worth incomparably more than one that types with you.
 */
const OUTLINE_IDLE_MS = 400;

/**
 * How far the site header intrudes: `top-15` in the sticky bar below, in px.
 * The editor's own sticky rows stack UNDER it, and a jump has to land clear of
 * the whole pile rather than behind it.
 */
const HEADER_OFFSET = 60;

/**
 * A box's height, kept current.
 *
 * The formatting toolbar sticks directly below the action bar, and the action
 * bar's height is not a constant - it wraps on a narrow window and grows a row
 * when ตั้งเวลา opens. Measuring is what stops the toolbar from either
 * overlapping it or floating below it with a gap.
 */
function useMeasuredHeight(): [(node: HTMLElement | null) => void, number] {
  const [height, setHeight] = useState(0);
  const watcher = useRef<ResizeObserver | null>(null);

  const ref = useCallback((node: HTMLElement | null) => {
    watcher.current?.disconnect();
    watcher.current = null;
    if (!node) return;
    setHeight(node.getBoundingClientRect().height);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const target = entries[0]?.target;
      if (target) setHeight(target.getBoundingClientRect().height);
    });
    observer.observe(node);
    watcher.current = observer;
  }, []);

  return [ref, height];
}

/**
 * The element a section's heading lives in.
 *
 * `toHTML` emits exactly one element per block, so a block index IS a child
 * index. The outline is rebuilt on the same idle beat as any edit, so the index
 * can only be stale for the fraction of a second between a keystroke and the
 * next parse - and being one paragraph off for that moment costs a jump that
 * lands slightly high, never a wrong answer that persists.
 */
function blockElementAt(root: HTMLElement | null, blockIndex: number): HTMLElement | null {
  const node = root?.children[blockIndex];
  return node instanceof HTMLElement ? node : null;
}

/**
 * Finds one occurrence of needle inside the editable surface as a DOM Range.
 * Single-text-node matches only - exactly what a flagged word or phrase is.
 * Used by the writing tools to select and replace THROUGH the editor's own
 * undo stack, never by rewriting its DOM (13Y).
 */
function findRangeIn(root: HTMLElement, needle: string): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const at = (node.textContent ?? "").indexOf(needle);
    if (at >= 0) {
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + needle.length);
      return range;
    }
  }
  return null;
}

/**
 * The three visual families of assistant marks (13Y §3): colour AND line
 * style differ, so the underlines read without hovering.
 */
export type MarkFamily = "error" | "consistency" | "soft";

/** One painted mark: the finding plus the live Range its underline sits on. */
interface PaintedMark {
  mark: AiManuscriptMark;
  range: Range;
}

/**
 * The mark styles (13Y §3): colour AND line style differ per family, so the
 * underlines read without hovering (and survive colour-blindness).
 *
 * Injected at runtime rather than written in globals.css because the build's
 * CSS parser does not know the ::highlight() pseudo-element yet and drops the
 * rules with a warning - while every browser that HAS the Highlight API
 * parses them natively. Same feature gate as the painting itself.
 */
const MARK_STYLE_ID = "ft-ai-mark-styles";
const MARK_CSS = [
  "::highlight(ft-ai-error){text-decoration:underline wavy var(--color-error);text-decoration-thickness:1.5px;text-underline-offset:3px}",
  "::highlight(ft-ai-consistency){text-decoration:underline solid var(--color-warning);text-decoration-thickness:1.5px;text-underline-offset:3px;background-color:color-mix(in srgb,var(--color-warning) 14%,transparent)}",
  "::highlight(ft-ai-soft){text-decoration:underline dotted var(--color-info);text-underline-offset:3px}",
  "::highlight(ft-ai-flash){background-color:color-mix(in srgb,var(--color-primary) 28%,transparent)}",
].join("\n");

function ensureMarkStyles() {
  if (document.getElementById(MARK_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = MARK_STYLE_ID;
  style.textContent = MARK_CSS;
  document.head.append(style);
}

/**
 * Paints the assistant's marks INTO the manuscript via the CSS Custom
 * Highlight API. Highlights style DOM Ranges without inserting a single
 * node, so the editable surface - which is serialized back into the saved
 * manuscript - is never touched. On browsers without the API the side
 * panel plus the clickable tool rows remain the (fully functional) fallback.
 *
 * Returns the painted ranges so a click can be hit-tested against them for
 * the in-text quick-fix popover.
 */
function paintMarks(root: HTMLElement, marks: AiManuscriptMark[]): PaintedMark[] {
  if (typeof CSS === "undefined" || !("highlights" in CSS)) return [];
  ensureMarkStyles();
  const painted: PaintedMark[] = [];
  const buckets: Record<MarkFamily, Range[]> = { error: [], consistency: [], soft: [] };
  for (const mark of marks) {
    const range = findRangeIn(root, mark.text);
    if (range) {
      buckets[mark.family].push(range);
      painted.push({ mark, range });
    }
  }
  for (const family of Object.keys(buckets) as MarkFamily[]) {
    const ranges = buckets[family];
    if (ranges.length > 0) {
      CSS.highlights.set(`ft-ai-${family}`, new Highlight(...ranges));
    } else {
      CSS.highlights.delete(`ft-ai-${family}`);
    }
  }
  return painted;
}

/**
 * The caret position under a screen point, in whichever of the two APIs the
 * browser offers. Null when neither exists (jsdom, old engines).
 */
function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
  };
  if (typeof doc.caretPositionFromPoint === "function") {
    const pos = doc.caretPositionFromPoint(x, y);
    return pos ? { node: pos.offsetNode, offset: pos.offset } : null;
  }
  if (typeof document.caretRangeFromPoint === "function") {
    const range = document.caretRangeFromPoint(x, y);
    return range ? { node: range.startContainer, offset: range.startOffset } : null;
  }
  return null;
}

/** Removes every assistant highlight, including the locate flash. */
function clearMarks() {
  if (typeof CSS === "undefined" || !("highlights" in CSS)) return;
  for (const name of ["ft-ai-error", "ft-ai-consistency", "ft-ai-soft", "ft-ai-flash"]) {
    CSS.highlights.delete(name);
  }
}

/**
 * Word counts use Intl.Segmenter, whose Thai dictionary DIFFERS between the
 * server's ICU and the browser's - the same manuscript totals a few dozen
 * words apart, which React reports as a hydration mismatch. The count is
 * therefore client-only: the server renders a quiet placeholder and this flag
 * flips exactly at hydration, with no effect involved.
 */
const emptySubscribe = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

type Pane = "prose" | "chat" | "headcanon";

/** Which pane an active format opens on. */
function paneFor(format: string): Pane {
  switch (format) {
    case PresentationFormat.Chat:
      return "chat";
    case PresentationFormat.Headcanon:
      return "headcanon";
    default:
      return "prose";
  }
}

/**
 * What each mode is CALLED (§13P).
 *
 * "แชท" alone was wrong: it read as a feature a prose chapter might also have,
 * when it is a whole mode with its own composer. And "ฟิค" needs its other half
 * said out loud - a prose chapter is the one a READER can flip to a chat layout
 * (§13O), which is the reason picking it costs a writer nothing.
 */
const PANE_LABELS: Record<Pane, string> = {
  prose: "ร้อยแก้ว",
  chat: "แชทล้วน",
  headcanon: "เฮดแคนอน",
};

const PANE_NOTES: Record<Pane, string> = {
  prose: "สลับเป็นแชทได้อัตโนมัติ",
  chat: "จัดผู้พูดและฝั่งเองได้เต็มที่",
  headcanon: "แยกกล่องตามตัวละคร",
};

interface DraftEntry {
  key: string;
  name: string;
  values: string[];
  body: string;
  /** The cast member this entry is about, when there is a record for them. */
  characterId: string | null;
  /** The entry's picture (§13M). null is the norm. */
  imageURL: string | null;
}

function toDraft(messages: ChatMessage[]): DraftMessage[] {
  return messages.map((message, index) => ({
    key: message.id || `existing-${index}`,
    speaker_name: message.speaker_name ?? "",
    content: message.content,
    message_type:
      message.message_type === "system" || message.message_type === "separator"
        ? message.message_type
        : "message",
    side: message.metadata?.side === "right" ? "right" : "left",
  }));
}

function toEntryDraft(entries: HeadcanonEntry[]): DraftEntry[] {
  return entries.map((entry, index) => ({
    key: entry.id || `existing-entry-${index}`,
    name: entry.name,
    values: entry.values ?? [],
    body: entry.body,
    characterId: entry.character_id ?? null,
    imageURL: entry.image_url ?? null,
  }));
}

export function ChapterEditor({
  novelRef,
  novelTitle,
  chapter,
  chapterUnit = "ตอนที่",
  variables = [],
  characters = [],
}: {
  novelRef: string;
  /**
   * The fiction's name, for the sticky bar's breadcrumb. The editor screen
   * dropped the studio rail (editor review 2026-08 A-B), so this bar is now
   * the one place that says WHICH story's chapter is open.
   */
  novelTitle?: string;
  chapter: Chapter;
  /** What this fiction calls a chapter - ตอนที่ / บทที่ / EP. (§13K, §13R). */
  chapterUnit?: string;
  /**
   * The fiction's reader variables (§13H). Declared per fiction, but the insert
   * button belongs to every pane - a token typed from memory with one character
   * wrong is a token that silently never resolves.
   */
  variables?: NovelVariable[];
  /**
   * The fiction's cast (12A). A headcanon entry may point at one of them -
   * the column has existed since 12F - which is what lets an entry carry the
   * character's picture and a way back to their page. An entry may also name
   * someone with no record at all, so the link is never required.
   */
  characters?: Character[];
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  // The live surface's command handle. Null until it mounts, and null forever
  // on a chapter still being edited as literal text.
  const editorRef = useRef<RichEditorHandle | null>(null);

  // The assistant's current marks. A ref, not state: painting happens outside
  // React (the Highlight registry), so re-rendering on every repaint would buy
  // nothing. Ranges go stale as the DOM changes, so every content change
  // repaints from the latest mark list.
  const marksRef = useRef<AiManuscriptMark[]>([]);
  const paintedRef = useRef<PaintedMark[]>([]);
  const repaintMarks = useCallback(() => {
    const root = editorRef.current?.element();
    if (root) paintedRef.current = paintMarks(root, marksRef.current);
  }, []);
  // Highlights are registered on the DOCUMENT, so leaving the page must clear
  // them or they would try to paint into the next chapter's editor.
  useEffect(() => clearMarks, []);

  // The in-text quick-fix popover, anchored to the underlined word the writer
  // clicked - the Grammarly gesture. It dies on scroll, Escape, an outside
  // click, or any action, so it can never sit over stale text.
  const [popover, setPopover] = useState<{
    mark: AiManuscriptMark;
    x: number;
    y: number;
  } | null>(null);
  useEffect(() => {
    if (popover === null) return;
    const close = () => setPopover(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [popover]);

  /** The painted mark under a screen point, if any. */
  function markAt(clientX: number, clientY: number): PaintedMark | null {
    const hit = caretAt(clientX, clientY);
    if (!hit) return null;
    for (const painted of paintedRef.current) {
      try {
        if (painted.range.isPointInRange(hit.node, hit.offset)) return painted;
      } catch {
        // A range invalidated by an edit cannot be hit - skip it.
      }
    }
    return null;
  }

  function openPopoverFor(painted: PaintedMark) {
    const rect = painted.range.getBoundingClientRect();
    setPopover((current) =>
      current?.mark.key === painted.mark.key
        ? current
        : {
            mark: painted.mark,
            x: Math.max(8, Math.min(rect.left, window.innerWidth - 296)),
            y: rect.bottom,
          },
    );
  }

  /** A click inside the prose surface: on an underline → open its popover. */
  function onEditorClick(event: React.MouseEvent) {
    const painted = markAt(event.clientX, event.clientY);
    if (painted) {
      openPopoverFor(painted);
      // …and the side panel opens the SAME finding's card. Clicking a word in
      // the manuscript used to leave the panel showing something else
      // entirely, so the two surfaces disagreed about what the writer was
      // looking at (docs/EDITOR.md).
      setPickedFinding(painted.mark.key);
      return;
    }
    setPopover(null);
  }

  /**
   * The Grammarly gesture proper (editor review 2026-08 item 3): resting the
   * pointer on an underline opens its card - a click is not required. Hit
   * testing is throttled to one frame, and leaving an underline closes the
   * card only after a beat, so the pointer can cross the 6px gap into the
   * card's own buttons without it vanishing underneath.
   */
  const hoverFrame = useRef(0);
  const hoverClose = useRef(0);
  useEffect(
    () => () => {
      if (hoverFrame.current) window.cancelAnimationFrame(hoverFrame.current);
      if (hoverClose.current) window.clearTimeout(hoverClose.current);
    },
    [],
  );

  function onEditorHover(event: React.MouseEvent) {
    const { clientX, clientY } = event;
    if (hoverFrame.current) return;
    hoverFrame.current = window.requestAnimationFrame(() => {
      hoverFrame.current = 0;
      const painted = markAt(clientX, clientY);
      if (painted) {
        if (hoverClose.current) {
          window.clearTimeout(hoverClose.current);
          hoverClose.current = 0;
        }
        openPopoverFor(painted);
        return;
      }
      // Not over an underline: close soon, not instantly - the pointer may be
      // on its way to the card. Hover never picks the side panel's card; only
      // a click commits that.
      if (hoverClose.current) return;
      hoverClose.current = window.setTimeout(() => {
        hoverClose.current = 0;
        setPopover(null);
      }, 350);
    });
  }

  /** The card is being read or aimed at - it must not close underneath. */
  function keepPopover() {
    if (hoverClose.current) {
      window.clearTimeout(hoverClose.current);
      hoverClose.current = 0;
    }
  }

  // The chapter's RESOLVED format, decided by the API. The editor opens on the
  // pane a reader would see, and never re-derives that rule (docs/09 §51).
  // The chapter's mode, decided at creation and never changed here (§13P).
  // Derived, not state: there is nothing that can move it while the editor is
  // open, so holding it in state would only create a second version of a fact.
  const pane = paneFor(chapter.active_format);
  /**
   * ร่างแชทของตอนร้อยแก้ว (editor review 2026-08): a prose chapter's SECOND
   * representation, opened in the same composer the chat-only mode uses.
   * A view toggle, never a mode change - the chapter stays prose, readers
   * keep seeing prose, and the chat draft saves through the same messages
   * field every chat chapter uses.
   */
  const [chatDraftOpen, setChatDraftOpen] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  /** The two-step guard on แปลงอีกครั้ง - it replaces the whole draft. */
  const [confirmReconvert, setConfirmReconvert] = useState(false);
  const [title, setTitle] = useState(chapter.title ?? "");
  const [content, setContent] = useState(chapter.content ?? "");
  const [messages, setMessages] = useState<DraftMessage[]>(
    toDraft(chapter.messages ?? []),
  );
  const [entries, setEntries] = useState<DraftEntry[]>(
    toEntryDraft(chapter.entries ?? []),
  );
  const [entryFields, setEntryFields] = useState<string[]>(chapter.entry_fields ?? []);
  const [preview, setPreview] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [status, setStatus] = useState(chapter.status);
  // ตั้งเวลาเผยแพร่ (§13R). The column has existed since the schema was written
  // and the editor never offered a way to set it. `scheduling` opens the
  // calendar modal; `modalToday` is computed by the OPENING click, because
  // `new Date()` may not run during render (react-hooks/purity).
  const [scheduling, setScheduling] = useState(false);
  const [modalToday, setModalToday] = useState<Date | null>(null);
  const [scheduledAt, setScheduledAt] = useState(() => toLocalInput(chapter.scheduled_at));
  const [scheduledSaved, setScheduledSaved] = useState(chapter.scheduled_at ?? null);
  // ประวัติการแก้ไข (chat-editor review 2026-08, item 10).
  const [historyOpen, setHistoryOpen] = useState(false);

  // The cast, locally overlaid: the composer's chip settings write colour,
  // side, and display name back to the character record (item 2), and this
  // copy makes the strip agree with the save without a reload.
  const [cast, setCast] = useState<Character[]>(characters);
  function persistSpeakerPrefs(
    characterID: string,
    changes: { chat_color?: string; chat_side?: "left" | "right"; chat_display_name?: string },
  ) {
    setCast((current) =>
      current.map((member) =>
        member.id === characterID ? { ...member, ...changes } : member,
      ),
    );
    // Fire-and-forget: the composer already applied the change; a failed save
    // simply falls back to the stored preference on the next load.
    void updateCharacter(novelRef, characterID, changes).catch(() => {});
  }

  // What is already on the server. Compared against the live state so an
  // autosave never re-sends an unchanged representation.
  //
  // State rather than a ref, because the writer is now TOLD which of the two it
  // is ("บันทึกแล้ว" against "ยังไม่ได้บันทึก"), and a fact the interface
  // renders has to be a fact React re-renders on.
  const [saved, setSaved] = useState({
    title: chapter.title ?? "",
    content: chapter.content ?? "",
    messages: JSON.stringify(toDraft(chapter.messages ?? [])),
    entries: JSON.stringify(toEntryDraft(chapter.entries ?? [])),
    entryFields: JSON.stringify(chapter.entry_fields ?? []),
  });

  const dirty =
    title !== saved.title ||
    (content.trim() === "" ? "" : content) !== saved.content ||
    JSON.stringify(messages) !== saved.messages ||
    JSON.stringify(entries) !== saved.entries ||
    JSON.stringify(entryFields) !== saved.entryFields;

  // A plain function on purpose: nothing schedules it any more - saving is
  // the writer's press (save-model review 2026-08), so no effect depends on a
  // stable identity.
  async function save() {
    const nextMessages = JSON.stringify(messages);
    const nextEntries = JSON.stringify(entries);
    const nextFields = JSON.stringify(entryFields);
    const titleChanged = title !== saved.title;
    // Prose that is only whitespace is prose the writer has not written. The
    // auto-indent puts a real indent in an empty field the moment it is focused
    // (that is the point of it), and clicking into a chapter and back out must
    // not therefore become a saved revision of two ideographic spaces.
    const nextContent = content.trim() === "" ? "" : content;
    const contentChanged = nextContent !== saved.content;
    const messagesChanged = nextMessages !== saved.messages;
    const entriesChanged = nextEntries !== saved.entries;
    const fieldsChanged = nextFields !== saved.entryFields;

    if (
      !titleChanged &&
      !contentChanged &&
      !messagesChanged &&
      !entriesChanged &&
      !fieldsChanged
    ) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateChapter(novelRef, chapter.slug, {
        title: titleChanged ? title.trim() || null : undefined,
        content: contentChanged ? nextContent : undefined,
        messages: messagesChanged
          ? messages
              // An empty row is a row the writer has not filled in yet, not a
              // blank message they want readers to see.
              .filter((message) => message.content.trim() !== "")
              .map((message) => ({
                speaker_name: message.speaker_name.trim(),
                content: message.content,
                message_type: message.message_type,
                metadata: { side: message.side },
              }))
          : undefined,
        entries: entriesChanged
          ? entries
              // An entry with no name is one the writer has not started. The
              // API refuses it, and dropping it here keeps an unfinished row
              // from blocking the save of everything beside it.
              .filter((entry) => entry.name.trim() !== "")
              .map((entry) => ({
                name: entry.name.trim(),
                values: entry.values,
                body: entry.body,
                character_id: entry.characterId,
                image_url: entry.imageURL,
              }))
          : undefined,
        entry_fields: fieldsChanged ? entryFields : undefined,
      });

      setSaved({
        title,
        content: nextContent,
        messages: nextMessages,
        entries: nextEntries,
        entryFields: nextFields,
      });
      // The server now has it, so the device's copy has nothing left to
      // protect (§13R).
      clearLocalDraft(novelRef, chapter.slug);
      setSavedAt(
        new Date().toLocaleTimeString("th-TH", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "บันทึกไม่สำเร็จ - งานของคุณยังอยู่ในหน้านี้ ลองบันทึกอีกครั้ง",
      );
    } finally {
      setSaving(false);
    }
  }

  /**
   * The device's own copy, written on every change (§13R) - THE one automatic
   * save, and it never leaves this machine (save-model review 2026-08). It
   * exists for the browser that closes, the machine that freezes, and the
   * refresh nobody meant to press. The system's copy changes only when the
   * writer presses บันทึก, เผยแพร่, or ตั้งเวลา.
   */
  useEffect(() => {
    if (!dirty) return;
    writeLocalDraft({
      novelRef,
      chapterSlug: chapter.slug,
      title,
      content,
      payload: JSON.stringify({ messages, entries, entryFields }),
    });
  }, [chapter.slug, content, dirty, entries, entryFields, messages, novelRef, title]);

  // Closing the tab is the one the platform cannot save its way out of: the
  // browser gives no time for a request. It can only ask.
  useEffect(() => {
    if (!dirty) return;
    function onLeave(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  // ---------------------------------------------------------------------
  // สารบัญในตอนนี้ (docs/EDITOR.md)
  // ---------------------------------------------------------------------

  const [outline, setOutline] = useState<OutlineSection[]>([]);
  const [words, setWords] = useState(0);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  /** The assistant's current findings, for the per-section tallies. */
  const [findings, setFindings] = useState<AiManuscriptMark[]>([]);
  /** The finding both the panel and the manuscript consider selected. */
  const [pickedFinding, setPickedFinding] = useState<string | null>(null);

  const [barRef, barHeight] = useMeasuredHeight();
  const [toolbarRef, toolbarHeight] = useMeasuredHeight();
  /** Where the sticky chrome ends - what a jump has to clear. */
  const chromeBottom = HEADER_OFFSET + barHeight + toolbarHeight;

  // Both walk the whole manuscript, so they wait for a pause rather than
  // running between keystrokes (see OUTLINE_IDLE_MS). Every state change is
  // inside the timeout, which keeps the effect body itself free of setState.
  useEffect(() => {
    if (pane !== "prose") return;
    const timer = window.setTimeout(() => {
      const sections = outlineOf(content);
      setOutline(sections);
      setWords(totalWords(sections, content));
    }, OUTLINE_IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [content, pane]);

  /**
   * สารบัญ for the other two representations (layout-parity review 2026-08):
   * a headcanon topic's sections ARE its character boxes, and a chat's are
   * its scene separators. Derived on the fly like the prose outline - a
   * reading of the draft, never a change to it. Each section's key doubles as
   * the DOM id of the block it jumps to.
   */
  /** Which outline the left panel reads: the chat one while the draft is open. */
  const outlinePane: Pane = pane === "prose" && chatDraftOpen ? "chat" : pane;

  const derivedOutline = useMemo<OutlineSection[]>(() => {
    const shell = {
      level: 2 as const,
      implicit: true,
      index: 0,
      end: 0,
      runeStart: 0,
      runeEnd: 0,
    };
    if (outlinePane === "headcanon") {
      return entries
        .filter((entry) => entry.name.trim() !== "")
        .map((entry, at) => ({
          ...shell,
          key: entry.key,
          title: entry.name.trim(),
          blockIndex: at,
          words: wordsIn(entry.body),
        }));
    }
    if (outlinePane !== "chat" || messages.length === 0) return [];

    // A chat's sections are its SCENES, counted in messages - not words
    // (chat-editor review item D13): "14 คำ" under a scene name reads as
    // noise; "12 ข้อความ" reads as a scene.
    const sections: OutlineSection[] = [];
    // The opening span jumps to the first message; a separator span to itself.
    let key = messages[0].key;
    let title = "ช่วงเปิดเรื่อง";
    let bubbles = 0;
    let opening = true;
    const push = () => {
      // An opening with nothing in it is a row spent on nothing.
      if (opening && bubbles === 0) return;
      sections.push({ ...shell, key, title, blockIndex: sections.length, words: bubbles });
    };
    for (const message of messages) {
      if (message.message_type === "separator") {
        push();
        key = message.key;
        title = message.content.trim() || "คั่นฉาก";
        bubbles = 0;
        opening = false;
        continue;
      }
      if (message.message_type === "message") bubbles += 1;
    }
    push();
    return sections;
  }, [outlinePane, entries, messages]);

  /** Whichever outline this pane reads from. */
  const activeOutline = outlinePane === "prose" ? outline : derivedOutline;

  /**
   * How many pending findings sit under each heading.
   *
   * The panel can say "พบ 43 จุด"; only this can say WHERE they are. Findings
   * from the live pass carry a rune offset; the character round carries a quote
   * instead, so it is located by searching for it.
   */
  const sectionCounts = useMemo(() => {
    const counts = new Array<number>(outline.length).fill(0);
    if (outline.length === 0) return counts;
    for (const mark of findings) {
      const at =
        typeof mark.start === "number"
          ? sectionAtRune(outline, mark.start)
          : sectionAtIndex(outline, content.indexOf(mark.text));
      if (at >= 0) counts[at] += 1;
    }
    return counts;
  }, [outline, findings, content]);

  // Which section the writer is looking at. Measured from the manuscript's own
  // block elements on a scroll, throttled to one frame - the outline follows
  // the page rather than the page re-rendering to follow the outline.
  useEffect(() => {
    if (outlinePane !== "prose" || outline.length === 0) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const root = editorRef.current?.element();
      if (!root) return;
      const line = chromeBottom + 24;
      let current = outline[0]?.key ?? null;
      for (const section of outline) {
        const node = blockElementAt(root, section.blockIndex);
        if (!node) continue;
        if (node.getBoundingClientRect().top > line) break;
        current = section.key;
      }
      setActiveSection(current);
    };
    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(measure);
    };
    frame = window.requestAnimationFrame(measure);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [outlinePane, outline, chromeBottom]);

  /** Moves the view to a heading, and marks where it landed. */
  function jumpToSection(section: OutlineSection) {
    const node = blockElementAt(editorRef.current?.element() ?? null, section.blockIndex);
    if (!node) return;
    window.scrollTo({
      top: node.getBoundingClientRect().top + window.scrollY - chromeBottom - 16,
      behavior: "smooth",
    });
    setActiveSection(section.key);
    // A short mark, so the eye finds the place the click sent it to even while
    // the page is still moving.
    node.setAttribute("data-jumped", "true");
    window.setTimeout(() => node.removeAttribute("data-jumped"), 1400);
  }

  /** The DOM id a chat or headcanon section jumps to - its own block. */
  const derivedBlockID = useCallback(
    (key: string) =>
      outlinePane === "chat" ? `chat-block-${key}` : `entry-block-${key}`,
    [outlinePane],
  );

  /** The same jump, for the sections a chat or headcanon derives. */
  function jumpToDerived(section: OutlineSection) {
    const node = document.getElementById(derivedBlockID(section.key));
    if (!node) return;
    window.scrollTo({
      top: node.getBoundingClientRect().top + window.scrollY - chromeBottom - 16,
      behavior: "smooth",
    });
    setActiveSection(section.key);
  }

  // The scroll-spy for the derived outlines - same one-frame throttle as the
  // prose version, measuring the composer's block elements by id.
  useEffect(() => {
    if (outlinePane === "prose" || derivedOutline.length === 0) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const line = chromeBottom + 24;
      let current = derivedOutline[0]?.key ?? null;
      for (const section of derivedOutline) {
        const node = document.getElementById(derivedBlockID(section.key));
        if (!node) continue;
        if (node.getBoundingClientRect().top > line) break;
        current = section.key;
      }
      setActiveSection(current);
    };
    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(measure);
    };
    frame = window.requestAnimationFrame(measure);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [outlinePane, derivedOutline, chromeBottom, derivedBlockID]);

  async function onPublishToggle() {
    setPublishing(true);
    setError(null);
    try {
      // Save first: publishing text that is still only in the browser would put
      // the wrong version in front of readers.
      await save();
      const updated =
        status === "published"
          ? await unpublishChapter(novelRef, chapter.slug)
          : await publishChapter(novelRef, chapter.slug);
      setStatus(updated.status);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : "เปลี่ยนสถานะการเผยแพร่ไม่สำเร็จ",
      );
    } finally {
      setPublishing(false);
    }
  }

  /**
   * Schedules the chapter.
   *
   * The manuscript is saved FIRST, for the same reason publishing saves first:
   * a chapter that goes public at midnight must be the version its author was
   * looking at when they set the time, not the last one that happened to reach
   * the server. The API refuses a time in the past, so nothing here has to
   * decide what "too late" means.
   */
  async function onSchedule(value: string) {
    const when = new Date(value);
    if (Number.isNaN(when.getTime())) {
      setError("เวลาที่เลือกไม่ถูกต้อง");
      return;
    }

    setPublishing(true);
    setError(null);
    try {
      await save();
      const updated = await updateChapter(novelRef, chapter.slug, {
        status: "scheduled",
        scheduled_at: when.toISOString(),
      });
      setScheduledAt(value);
      setStatus(updated.status);
      setScheduledSaved(updated.scheduled_at ?? when.toISOString());
      setScheduling(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "ตั้งเวลาไม่สำเร็จ");
    } finally {
      setPublishing(false);
    }
  }

  /** Back to a plain draft. The text is untouched - only the plan changes. */
  async function onCancelSchedule() {
    setPublishing(true);
    setError(null);
    try {
      const updated = await updateChapter(novelRef, chapter.slug, {
        status: "draft",
        scheduled_at: null,
      });
      setStatus(updated.status);
      setScheduledSaved(null);
      setScheduledAt("");
      setScheduling(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "ยกเลิกการตั้งเวลาไม่สำเร็จ");
    } finally {
      setPublishing(false);
    }
  }

  const base = `/studio/novels/${encodeURIComponent(novelRef)}`;

  /**
   * One press = converted (editor review 2026-08): runs the conversion
   * engine on the live prose and fills the chat draft with the result,
   * opened in the composer ready to customise. Replaces whatever draft was
   * there - which is why the RE-convert path asks first.
   */
  async function convertToDraft() {
    setConverting(true);
    setConvertError(null);
    try {
      const result = await convertChat(novelRef, content);
      setMessages(messagesFromConversion(result));
      setChatDraftOpen(true);
    } catch (cause) {
      setConvertError(
        cause instanceof ApiError ? cause.message : "แปลงไม่สำเร็จ ลองอีกครั้ง",
      );
    } finally {
      setConverting(false);
    }
  }

  return (
    <div>
      {/*
        The action bar (§13S).

        เผยแพร่ / บันทึกแบบร่าง / ตั้งเวลา used to live in the right-hand rail,
        which on anything narrower than a wide desktop is BELOW the whole
        editor - so a writer who had just finished a chapter scrolled past
        their own manuscript looking for the publish button, and reasonably
        concluded there wasn't one. They are at the top now, and they stay
        there while the page scrolls: they are what this screen is for.
      */}
      <div
        ref={barRef}
        className="sticky top-15 z-20 mb-5 -mx-1 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hairline bg-background/95 px-1 py-3 backdrop-blur-sm"
      >
        <Link
          href={`${base}/chapters`}
          className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-primary"
        >
          <Icon name="chevron-left" size={15} />
          ตอนทั้งหมด
        </Link>

        <p className="mono-label flex min-w-0 items-center gap-1.5">
          {novelTitle ? (
            <>
              <span className="max-w-36 truncate xl:max-w-56" title={novelTitle}>
                {novelTitle}
              </span>
              <span aria-hidden>·</span>
            </>
          ) : null}
          <span className="shrink-0">
            {chapterUnit || "ตอนที่"} {chapter.chapter_number}
          </span>
        </p>

        {/*
          The status strip (docs/EDITOR.md).

          Three facts that a writer of a long chapter looks for constantly, in
          the one row that never scrolls away: how long it is, how long it takes
          to read, and whether the work is safe. The last one used to be a grey
          dot and a word - on a 20,000-word manuscript, "บันทึกแล้ว 14:32" is
          the difference between trusting the tab and re-saving out of fear.
        */}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
          {pane === "prose" ? (
            <>
              <span className="tabular-nums">{`${hydrated ? count(words) : "–"} คำ`}</span>
              <span aria-hidden>·</span>
              <span>{`~${readingMinutes(words)} นาที`}</span>
              <span aria-hidden>·</span>
            </>
          ) : null}
          <span aria-live="polite" className="flex items-center gap-1.5">
            {saving ? (
              "กำลังบันทึก…"
            ) : dirty ? (
              <>
                <Icon name="clock" size={14} className="text-warning" />
                {/* Into the SYSTEM, that is - the device's own backup copy is
                    already written (save-model review 2026-08). */}
                ยังไม่ได้บันทึกลงระบบ - สำรองไว้ในเครื่องนี้แล้ว
              </>
            ) : savedAt ? (
              <>
                <Icon name="check" size={14} className="text-success" />
                บันทึกแล้ว {savedAt}
              </>
            ) : (
              <>
                <Icon name="check" size={14} className="text-success" />
                บันทึกไว้ครบแล้ว
              </>
            )}
          </span>
          {findings.length > 0 ? (
            <>
              <span aria-hidden>·</span>
              <span className="text-warning">{`${count(findings.length)} จุดที่เสนอไว้`}</span>
            </>
          ) : null}
        </p>

        <div className="ms-auto flex flex-wrap items-center gap-2">
          {/* THE save (save-model review 2026-08, button review): while there
              is unsaved work it is a SOLID button asking to be pressed; once
              pressed it flips to "บันทึกแล้ว" and stands down - the button
              itself is the receipt. No checkmark on an unpressed action: a
              save button wearing a ✓ reads as already saved.
              text-background, not text-white: the warning amber is dark in
              the light theme and light in the dark one, and the page's
              background token is the one colour that flips against it. */}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !dirty}
            className={`inline-flex min-h-10 items-center rounded-md px-4 text-sm ${
              dirty || saving
                ? "bg-warning font-medium text-background hover:opacity-90 disabled:opacity-70"
                : "border border-border text-text-muted"
            }`}
          >
            {saving
              ? "กำลังบันทึก…"
              : dirty
                ? status === "published"
                  ? "บันทึกการแก้ไข"
                  : "บันทึกแบบร่าง"
                : "บันทึกแล้ว"}
          </button>

          <button
            type="button"
            aria-expanded={scheduling}
            onClick={() => {
              // Midnight today, computed by the click - the calendar's floor.
              const now = new Date();
              setModalToday(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
              setScheduling(true);
            }}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3.5 text-sm ${
              status === "scheduled" || scheduling
                ? "border-warning bg-warning/10 text-warning"
                : "border-border text-text-secondary hover:border-primary-200 hover:text-text"
            }`}
          >
            <Icon name="clock" size={15} />
            {status === "scheduled" ? "แก้เวลาที่ตั้งไว้" : "ตั้งเวลา"}
          </button>

          <button
            type="button"
            onClick={onPublishToggle}
            disabled={publishing}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-md px-4 text-sm font-medium disabled:opacity-50 ${
              status === "published"
                ? "border border-border text-text-secondary hover:border-error hover:text-error"
                : "bg-primary text-white hover:opacity-90"
            }`}
          >
            <Icon name={status === "published" ? "eye" : "share"} size={16} />
            {publishing
              ? "กำลังทำ…"
              : status === "published"
                ? "ถอนตอนนี้ออก"
                : "เผยแพร่ตอนนี้"}
          </button>
        </div>

      </div>

      {/* The calendar (save-model review 2026-08): a real month grid with
          month/year jumps, in place of a bare datetime-local field. */}
      {scheduling && modalToday ? (
        <SchedulePicker
          today={modalToday}
          initial={scheduledAt}
          scheduled={status === "scheduled"}
          busy={publishing}
          onConfirm={(value) => void onSchedule(value)}
          onCancelSchedule={
            status === "scheduled" ? () => void onCancelSchedule() : undefined
          }
          onClose={() => setScheduling(false)}
        />
      ) : null}

      {historyOpen ? (
        <RevisionHistory
          novelRef={novelRef}
          chapterRef={chapter.slug || chapter.id}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}

      {error ? (
        <p role="alert" className="mb-4 rounded-md bg-error/10 px-3 py-2 text-sm text-error">
          {error}
        </p>
      ) : null}

      {/*
        Three columns from lg up: where you are, what you are writing, and what
        the assistant has to say about it. The studio rail no longer shares
        this screen (editor review 2026-08 A-B), so the outline IS the left
        panel and the manuscript takes the width the rail used to spend on
        navigation. Below lg the outline becomes a disclosure above the
        manuscript rather than disappearing.
      */}
      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)_290px] xl:grid-cols-[225px_minmax(0,1fr)_310px] 2xl:grid-cols-[250px_minmax(0,1fr)_330px]">
        {/* Every mode gets the same three columns (layout-parity review
            2026-08): the outline reads headings in prose, character boxes in
            a headcanon, scene separators in a chat. */}
        <aside className="hidden lg:sticky lg:top-22 lg:block lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto">
          <ChapterOutline
            sections={activeOutline}
            counts={outlinePane === "prose" ? sectionCounts : activeOutline.map(() => 0)}
            activeKey={activeSection}
            onJump={outlinePane === "prose" ? jumpToSection : jumpToDerived}
            countUnit={outlinePane === "chat" ? "ข้อความ" : "คำ"}
            assistantFooter={outlinePane === "prose"}
            emptyHint={
              outlinePane === "chat"
                ? "ยังไม่มีช่วงฉาก - คั่นฉากแบ่งบทสนทนาเป็นช่วง สารบัญจะตามให้เอง"
                : outlinePane === "headcanon"
                  ? "ตั้งชื่อตัวละครในกล่องด้านล่าง สารบัญจะขึ้นให้เอง"
                  : undefined
            }
            emptyAction={
              outlinePane === "chat"
                ? {
                    label: "+ เพิ่มคั่นฉากแรก",
                    onAction: () =>
                      setMessages((current) => [
                        ...current,
                        {
                          // The length is a fine local key: appending changes
                          // it, so the press can never reissue one.
                          key: `sep-${current.length}`,
                          speaker_name: "",
                          content: "",
                          message_type: "separator",
                          side: "left",
                        },
                      ]),
                  }
                : undefined
            }
          />
        </aside>

        {/* The manuscript column. It can be far wider than a readable line
            now, so the document caps itself at a book's measure and centres -
            the extra width becomes margin, never hundred-character lines. */}
        <div className="mx-auto w-full min-w-0 max-w-[52rem]">
          {/*
            The title field is one field, but it is not one THING: in a
            headcanon set it is the topic every entry answers, which is a
            different question from "what is this chapter called". The label
            says which one is being asked rather than making the writer infer
            it from the composer below (12F).
          */}
          <label
            htmlFor="chapter-title"
            className={pane === "headcanon" ? "mono-label block" : "sr-only"}
          >
            {pane === "headcanon" ? "หัวข้อของชุดนี้" : "ชื่อตอน"}
          </label>
          <input
            id="chapter-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={
              pane === "headcanon"
                ? "เช่น เปอร์เซ็นต์ที่จีบหนุ่ม ๆ คนนั้นติด"
                : // The number is its own field now (§13R), so the placeholder
                  // asks for the NAME rather than showing a writer the number
                  // to type into the title.
                  "ชื่อตอน - เว้นว่างไว้ก็ได้"
            }
            className={`w-full bg-transparent font-serif text-2xl font-semibold tracking-tight outline-none placeholder:text-text-muted ${
              pane === "headcanon" ? "mt-1.5" : ""
            }`}
          />
          {pane === "headcanon" ? (
            <p className="mt-1.5 text-xs text-text-muted">
              เฮดแคนอนหนึ่งชุด = หัวข้อเดียว + รายการตัวละครที่คั่นแยกกัน
              ความยาวของแต่ละคนอิสระ ไม่บังคับฟิลด์
            </p>
          ) : null}

          {/*
            The chapter's mode, stated and locked (§13P).

            It was a dropdown, and that was wrong in a way the schema hid: the
            three representations are stored side by side, so switching was
            cheap - but a chapter is a piece of writing with a shape, and one
            that can become a chat and back is one whose writer is never sure
            what they are looking at. It is chosen once, on the screen that
            creates the chapter. Here it is a fact, not a control.
          */}
          <div className="mt-4 flex flex-wrap items-center gap-2.5 border-b border-hairline pb-3">
            {/* Short on purpose (chat-editor review item 9, per the mock):
                the mode's name and the word ล็อก - readable, with the full
                sentence in the tooltip. */}
            <span
              title={`${PANE_NOTES[pane]} · โหมดของตอนล็อกตั้งแต่สร้าง เปลี่ยนภายหลังไม่ได้`}
              className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 text-[13px]"
            >
              <span aria-hidden className="size-1.5 rounded-full bg-primary" />
              <span className="font-medium text-primary">{PANE_LABELS[pane]}</span>
              <span className="text-[11px] font-medium text-primary/70">ล็อก</span>
            </span>

            {/* + สร้างตอนใหม่ left this strip (chat-editor review item D12):
                a story-level action has no business sitting an inch from the
                controls of the chapter being edited. The chapters page is its
                home, one press away on ตอนทั้งหมด. */}

            {/* ร่างแชท (editor review 2026-08): a prose chapter's second
                representation, opened in the SAME composer the chat-only mode
                uses. A view toggle - the chapter stays prose. */}
            {pane === "prose" ? (
              <button
                type="button"
                aria-pressed={chatDraftOpen}
                disabled={converting}
                onClick={() => {
                  if (chatDraftOpen) {
                    setChatDraftOpen(false);
                    setConfirmReconvert(false);
                    return;
                  }
                  // An EMPTY draft converts on the press itself (editor
                  // review 2026-08): the button's promise is a conversation,
                  // not a blank form. An existing draft just opens.
                  if (messages.length > 0) setChatDraftOpen(true);
                  else void convertToDraft();
                }}
                className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs disabled:opacity-60 ${
                  chatDraftOpen
                    ? "border-primary bg-primary-50 font-medium text-primary"
                    : "border-border text-text-secondary hover:border-primary-200 hover:text-text"
                }`}
              >
                <Icon name="message" size={13} />
                {converting
                  ? "กำลังแปลง…"
                  : chatDraftOpen
                    ? "กลับไปแก้ร้อยแก้ว"
                    : messages.length > 0
                      ? `แก้ไขร่างแชท (${count(messages.length)})`
                      : "แปลงเป็นร่างแชท"}
              </button>
            ) : null}

            {/* Prominent in chat mode (item 9, per the mock): a chat's edit
                surface and its reading surface differ the most, so the
                preview is the one button that proves what readers get. */}
            {variables.length > 0 || pane === "chat" || chatDraftOpen ? (
              <button
                type="button"
                aria-pressed={preview}
                onClick={() => setPreview((current) => !current)}
                className={`inline-flex min-h-8 items-center rounded-full border px-3 text-[13px] font-medium ${
                  preview
                    ? "border-primary bg-primary-50 text-primary"
                    : "border-border bg-surface text-text hover:border-primary-200"
                }`}
              >
                ดูตัวอย่างแบบผู้อ่าน
              </button>
            ) : null}

            {/* Prose says its length in the sticky strip above, which never
                scrolls away; repeating it here would be two numbers a beat out
                of step with each other. Readable, not a whisper (item 9). */}
            {pane !== "prose" ? (
              <p className="ms-auto text-[13px] text-text-secondary">
                {pane === "chat"
                  ? // Bubbles and scenes are different things and count apart
                    // (chat-editor review item D14).
                    `${count(messages.filter((m) => m.message_type === "message").length)} ข้อความ · ${count(messages.filter((m) => m.message_type === "separator").length)} ฉาก`
                  : `${count(entries.length)} รายการ`}
              </p>
            ) : null}
          </div>

          {/* A conversion that failed BEFORE the draft could open still has
              to say so - the draft box that normally carries this error is
              not on screen yet. */}
          {pane === "prose" && !chatDraftOpen && convertError ? (
            <p role="alert" className="mt-3 rounded-md bg-error/10 px-3 py-2 text-sm text-error">
              {convertError}
            </p>
          ) : null}

          {/*
            The outline, for a window too narrow to give it a column of its own.
            A disclosure rather than nothing: it is closed by default so it
            costs a writer who does not want it exactly one line.
          */}
          {activeOutline.length > 0 ? (
            <details className="mt-4 rounded-lg border border-border bg-surface px-3.5 py-2.5 lg:hidden">
              <summary className="cursor-pointer text-[13px] text-text-secondary">
                สารบัญในตอนนี้ · {count(activeOutline.length)} หัวข้อ
              </summary>
              <div className="mt-2 max-h-72 overflow-y-auto">
                <ChapterOutline
                  sections={activeOutline}
                  counts={outlinePane === "prose" ? sectionCounts : activeOutline.map(() => 0)}
                  activeKey={activeSection}
                  onJump={outlinePane === "prose" ? jumpToSection : jumpToDerived}
                  countUnit={outlinePane === "chat" ? "ข้อความ" : "คำ"}
                  assistantFooter={outlinePane === "prose"}
                  compact
                />
              </div>
            </details>
          ) : null}

          {/*
            ดูตัวอย่างแบบผู้อ่าน (§13H): the author's own text with sample
            answers filled in. It renders BESIDE the editor and never writes -
            the manuscript keeps its tokens, which is the point of being able
            to preview at all.
          */}
          {preview ? (
            pane === "chat" || chatDraftOpen ? (
              // A chat previews as BUBBLES (item 9): the edit surface and the
              // reading surface differ the most here, and a text dump of the
              // conversation would preview the wrong thing entirely.
              <ChatDraftPreview messages={messages} variables={variables} />
            ) : variables.length > 0 ? (
              <VariablePreview text={previewText(pane, content, messages, entries)} variables={variables} />
            ) : null
          ) : null}

          {pane === "prose" && chatDraftOpen ? (
            <div className="mt-4">
              {/* The limits, said before the first edit (editor review
                  2026-08): this form is the chat-only mode's composer, but
                  what it edits is a SECOND representation converted from
                  prose - the prose stays the origin. */}
              <div className="flex gap-2.5 rounded-lg border border-warning/50 bg-warning/5 px-3.5 py-3 text-xs leading-relaxed text-text-secondary">
                <Icon name="alert" size={15} className="mt-0.5 shrink-0 text-warning" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-text">
                    ร่างแชทของตอนร้อยแก้ว - แก้ไขได้เต็มรูปแบบ แต่มีข้อจำกัด
                  </p>
                  <p className="mt-0.5">
                    แก้ที่นี่ไม่เปลี่ยนร้อยแก้วต้นฉบับ ·
                    ผู้อ่านยังเห็นร้อยแก้วตามเดิมจนกว่าจะเปลี่ยนรูปแบบการแสดงผลของตอนเป็นแชท
                  </p>

                  {/* แปลงอีกครั้ง, guarded (editor review 2026-08): it throws
                      this whole draft away for a fresh conversion, so it asks
                      in so many words before doing it. */}
                  <div className="mt-2">
                    {confirmReconvert ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-warning">
                          ร่างแชทนี้ทั้งหมด รวมทุกอย่างที่แก้ไว้
                          จะหายไปและถูกแทนที่ด้วยผลแปลงใหม่จากร้อยแก้ว - ยืนยันหรือไม่?
                        </span>
                        <button
                          type="button"
                          disabled={converting}
                          onClick={() => {
                            setConfirmReconvert(false);
                            void convertToDraft();
                          }}
                          className="inline-flex min-h-8 items-center rounded-md bg-warning px-3 text-xs font-medium text-background hover:opacity-90 disabled:opacity-60"
                        >
                          ยืนยัน แทนที่ร่างเดิม
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmReconvert(false)}
                          className="inline-flex min-h-8 items-center rounded-md border border-border px-3 text-xs text-text-secondary hover:text-text"
                        >
                          ยกเลิก
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={converting}
                        onClick={() => setConfirmReconvert(true)}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs text-text-secondary hover:border-warning hover:text-warning disabled:opacity-60"
                      >
                        <Icon name="redo" size={13} />
                        {converting ? "กำลังแปลง…" : "แปลงจากร้อยแก้วอีกครั้ง"}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {convertError ? (
                <p role="alert" className="mt-3 rounded-md bg-error/10 px-3 py-2 text-sm text-error">
                  {convertError}
                </p>
              ) : null}

              <ChatComposer
                messages={messages}
                onChange={setMessages}
                variables={variables}
                characters={cast}
                onUpdateCharacter={persistSpeakerPrefs}
              />
            </div>
          ) : pane === "prose" ? (
            <div className="mt-4">
              {/*
                ย่อหน้าอัตโนมัติ is stated, not switched (§13Q).

                It used to be a checkbox because it typed two ideographic spaces
                into the manuscript, and a writer had to be able to stop it. It
                is a display rule now: every paragraph's first line is indented,
                which means a paste from another site arrives indented, the
                caret cannot land inside the indent, and backspace cannot take
                it away. There is nothing left to switch off - so this row says
                what is true instead of offering a control that would not
                change what a reader sees.
              */}
              <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-text-secondary">
                  <Icon name="indent" size={13} />
                  ย่อหน้าอัตโนมัติทุกย่อหน้า - รวมข้อความที่วางมาจากที่อื่น
                </span>

                <p className="ms-auto text-xs text-text-muted">
                  {count(content.length)} ตัวอักษร
                </p>
              </div>

              {/*
                The formatting toolbar STAYS (docs/EDITOR.md).

                It used to sit at the top of the document and scroll away with
                it, which on a 20,000-word chapter meant that formatting a
                sentence in the second half required scrolling to the top,
                losing the selection on the way, and starting again. It sticks
                directly under the action bar - whose height is measured rather
                than assumed, because that bar wraps on a narrow window and
                grows a row when ตั้งเวลา is open.
              */}
              <div
                ref={toolbarRef}
                style={{ top: HEADER_OFFSET + barHeight }}
                className="sticky z-10 mb-3 bg-background pb-1"
              >
                <FormatToolbar editor={editorRef} novelRef={novelRef}>
                  <InsertVariable
                    variables={variables}
                    onInsert={(token) => editorRef.current?.insertText(token)}
                  />
                </FormatToolbar>
              </div>

              {/*
                The live surface: bold looks bold while it is being typed
                (§13N). What is STORED is unchanged - it serialises back to the
                marked-up text the content model defines, so there is still no
                HTML on the write path and nothing to sanitize.

                The click wrapper is the popover trigger: a click landing on
                an underlined range opens its quick fix right there.
              */}
              <div onClick={onEditorClick} onMouseMove={onEditorHover}>
                <RichEditor
                  id="chapter-content"
                  initialValue={chapter.content ?? ""}
                  onChange={(value) => {
                    setContent(value);
                    setPopover(null);
                    // The edit just shifted the text under the marks - repaint
                    // once the DOM settles so underlines track their words.
                    requestAnimationFrame(repaintMarks);
                  }}
                  handleRef={editorRef}
                  placeholder="เริ่มเขียนที่นี่…"
                />
              </div>
              {popover ? (
                <MarkPopover
                  mark={popover.mark}
                  x={popover.x}
                  y={popover.y}
                  onClose={() => setPopover(null)}
                  onKeepOpen={keepPopover}
                />
              ) : null}
            </div>
          ) : pane === "chat" ? (
            <ChatComposer
              messages={messages}
              onChange={setMessages}
              variables={variables}
              characters={cast}
              onUpdateCharacter={persistSpeakerPrefs}
            />
          ) : (
            <EntryComposer
              novelRef={novelRef}
              entries={entries}
              fields={entryFields}
              onChangeEntries={setEntries}
              onChangeFields={setEntryFields}
              variables={variables}
              characters={cast}
            />
          )}
        </div>

        {/* Scrolls INSIDE itself past the viewport (editor review 2026-08
            item 4): sticky with free overflow meant everything below the fold
            of this panel - ChapterAnalysis included - could never be reached. */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-22 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto">
          {/*
            The publishing STATE, now that the publishing ACTIONS are in the
            bar at the top (§13S). One place to press, one place to read - the
            panel that had both was the reason neither was easy to find.
          */}
          <section className="rounded-lg border border-border bg-surface p-4">
            <p className="mono-label">สถานะตอนนี้</p>
            <p className="mt-2 flex items-center gap-1.5 text-sm">
              <span
                aria-hidden
                className={`size-1.5 rounded-full ${
                  status === "published"
                    ? "bg-success"
                    : status === "scheduled"
                      ? "bg-warning"
                      : "bg-text-muted"
                }`}
              />
              {status === "published"
                ? "ตอนนี้ผู้อ่านเห็นแล้ว"
                : status === "scheduled"
                  ? `ตั้งเวลาไว้ ${scheduledLabel(scheduledSaved)}`
                  : "เป็นฉบับร่าง - ยังไม่มีใครเห็น"}
            </p>

            {/* ONE line (items D10 and 6): the bar above already says the
                save state; what earns a place here is the door to history. */}
            <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
              ปุ่มบันทึก ตั้งเวลา เผยแพร่อยู่แถบบน
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <Icon name="clock" size={12} />
                ประวัติการแก้ไข
              </button>
            </p>
          </section>

          {/* เครื่องมือช่วยเขียน (13Y): the live panel. The text it checks is
              the ACTIVE representation's; apply/locate work on the prose
              surface only, through the editor's own undo stack. */}
          <WritingTools
            novelRef={novelRef}
            chapterID={chapter.id}
            chapterNumber={chapter.chapter_number}
            mode={chapter.active_format}
            text={
              pane === "prose"
                ? content
                : pane === "chat"
                  ? messages.map((message) => message.content).join("\n")
                  : entries.map((entry) => `${entry.name}\n${entry.body}`).join("\n")
            }
            onApply={
              pane === "prose"
                ? (original, replacement) => {
                    const root = editorRef.current?.element();
                    if (!root) return false;
                    const range = findRangeIn(root, original);
                    if (!range) return false;
                    const selection = window.getSelection();
                    selection?.removeAllRanges();
                    selection?.addRange(range);
                    root.focus();
                    document.execCommand("insertText", false, replacement);
                    return true;
                  }
                : undefined
            }
            onLocate={
              pane === "prose"
                ? (original) => {
                    const root = editorRef.current?.element();
                    if (!root) return;
                    const range = findRangeIn(root, original);
                    if (!range) return;
                    // Focus FIRST: an unfocused contenteditable does not paint
                    // its selection, which read as "nothing happened".
                    root.focus();
                    const selection = window.getSelection();
                    selection?.removeAllRanges();
                    selection?.addRange(range);
                    range.startContainer.parentElement?.scrollIntoView({
                      block: "center",
                      behavior: "smooth",
                    });
                    // A short flash marks the spot even while the page is
                    // still scrolling to it.
                    if (typeof CSS !== "undefined" && "highlights" in CSS) {
                      ensureMarkStyles();
                      CSS.highlights.set("ft-ai-flash", new Highlight(range.cloneRange()));
                      window.setTimeout(() => CSS.highlights.delete("ft-ai-flash"), 1600);
                    }
                  }
                : undefined
            }
            onHighlight={
              pane === "prose"
                ? (marks) => {
                    marksRef.current = marks;
                    repaintMarks();
                    // The outline tallies them per heading, and the sticky
                    // strip counts them - one list, three readings of it.
                    setFindings(marks);
                    // The findings just changed - a popover for the old set
                    // must not survive them.
                    setPopover(null);
                  }
                : undefined
            }
            selected={pickedFinding}
            onSelect={setPickedFinding}
          />

          {/* แปลงเป็นแชทฟิก (docs/CHAT-CONVERSION.md): prose only - a chat
              chapter has nothing to convert. The import fills the chat DRAFT
              and the author saves it themselves. */}
          {pane === "prose" ? (
            <ChatConversionCard
              novelRef={novelRef}
              text={content}
              existingMessages={messages.length}
              onImport={(imported) => {
                setMessages(imported);
                // …and open the draft right where the fixing happens (editor
                // review 2026-08): the press's whole point is editing next.
                setChatDraftOpen(true);
              }}
            />
          ) : null}

          {/* The deliberate round (docs/12 §14): batch analysis and the async
              summary, moved here from the account AI page - the editor knows
              which chapter is open, so nobody pastes a chapter id. Folded:
              the live tools above are the everyday surface. */}
          <div className="mt-3">
            <ChapterAnalysis chapterId={chapter.id} />
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * The in-text quick fix (13Y §4, the Grammarly gesture): a small card
 * anchored under the underlined word. One primary action - the correction
 * itself, applied through the editor's undo stack - plus ข้าม and
 * ไม่เตือนแบบนี้อีก. Character citations have no one-word fix, so they show
 * the question instead. Exported for tests.
 */
export function MarkPopover({
  mark,
  x,
  y,
  onClose,
  onKeepOpen,
}: {
  mark: AiManuscriptMark;
  x: number;
  y: number;
  onClose: () => void;
  /** Told when the pointer reaches the card, so a hover-close timer stands down. */
  onKeepOpen?: () => void;
}) {
  const dot =
    mark.family === "error"
      ? "bg-error"
      : mark.family === "consistency"
        ? "bg-warning"
        : "bg-info/70";
  return (
    <div
      role="dialog"
      aria-label={mark.label}
      onMouseEnter={onKeepOpen}
      onMouseMove={onKeepOpen}
      style={{ position: "fixed", left: x, top: y + 6, zIndex: 60 }}
      className="w-72 rounded-lg border border-border bg-surface p-3 text-[13px] shadow-lg"
    >
      <p className="flex items-center gap-1.5 text-xs text-text-secondary">
        <span aria-hidden className={`size-2 rounded-full ${dot}`} />
        {mark.label}
        <button
          type="button"
          aria-label="ปิด"
          onClick={onClose}
          className="ms-auto flex size-6 items-center justify-center rounded-md text-text-muted hover:bg-surface-secondary hover:text-text"
        >
          ✕
        </button>
      </p>

      {mark.suggestion && mark.onApplyFix ? (
        <button
          type="button"
          onClick={() => {
            mark.onApplyFix?.();
            onClose();
          }}
          className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-sm text-white hover:opacity-90"
        >
          <span className="truncate line-through opacity-75">{mark.text}</span>
          <span aria-hidden>→</span>
          <span className="truncate font-medium">{mark.suggestion}</span>
        </button>
      ) : null}

      {mark.explanation ? (
        <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">
          {mark.explanation}
        </p>
      ) : null}

      {mark.onSkip || mark.onMute ? (
        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {mark.onSkip ? (
            <button
              type="button"
              onClick={() => {
                mark.onSkip?.();
                onClose();
              }}
              className="text-text-secondary hover:text-text"
            >
              ข้าม
            </button>
          ) : null}
          {mark.onMute ? (
            <button
              type="button"
              onClick={() => {
                mark.onMute?.();
                onClose();
              }}
              className="text-text-secondary hover:text-text"
            >
              ไม่เตือนแบบนี้อีก
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

/**
 * An RFC 3339 instant as `<input type="datetime-local">` wants it.
 *
 * Built from the LOCAL parts rather than by slicing the ISO string, because
 * slicing would show a writer in Bangkok the UTC time and schedule their
 * chapter seven hours from where they meant.
 */
function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** The scheduled time, for the status line. */
function scheduledLabel(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** The text the preview renders, for whichever pane is open. */
function previewText(
  pane: Pane,
  content: string,
  messages: DraftMessage[],
  entries: DraftEntry[],
): string {
  if (pane === "prose") return content;
  if (pane === "chat") return messages.map((message) => message.content).join("\n");
  return entries.map((entry) => entry.body).join("\n");
}

/**
 * Substitutes sample answers into the author's text for a preview.
 *
 * The author's own default is the sample, falling back to the variable's label
 * - a preview that showed the raw token would be showing exactly what the
 * editor already shows.
 */
function VariablePreview({
  text,
  variables,
}: {
  text: string;
  variables: NovelVariable[];
}) {
  let preview = text;
  for (const variable of variables) {
    const tokens = variable.tokens ?? [variable.token];
    tokens.forEach((token, index) => {
      const sample =
        variable.kind === "pronoun"
          ? (variable.options?.sets?.[0]?.values?.[index] ?? variable.label)
          : (variable.default_value ??
            variable.options?.values?.[0] ??
            variable.label);
      // split/join, never a regular expression: a token is matched literally
      // everywhere else and must be here too.
      preview = preview.split(token).join(sample);
    });
  }

  return (
    <section className="mt-3 rounded-lg border border-primary-200 bg-primary-50 p-4">
      <p className="mono-label">ตัวอย่างที่ผู้อ่านจะเห็น</p>
      <p className="mt-2 font-serif text-[15px] leading-loose whitespace-pre-wrap">
        {preview || "ยังไม่มีเนื้อหาในรูปแบบนี้"}
      </p>
      <p className="mt-2.5 text-xs text-text-muted">
        ใช้ค่าเริ่มต้นที่คุณตั้งไว้เป็นตัวอย่าง - ต้นฉบับยังเก็บเป็นตัวแทนเหมือนเดิม
      </p>
    </section>
  );
}


/**
 * A chat draft, previewed as the READER meets it (chat-editor review item 9):
 * the same ChatView the reading page renders, with each variable's sample
 * answer filling its slots - in bubbles AND in speaker names.
 */
function ChatDraftPreview({
  messages,
  variables,
}: {
  messages: DraftMessage[];
  variables: NovelVariable[];
}) {
  const slots: TokenSlot[] = [];
  for (const variable of variables) {
    const tokens = variable.tokens ?? [variable.token];
    tokens.forEach((token, index) => {
      const sample =
        variable.kind === "pronoun"
          ? (variable.options?.sets?.[0]?.values?.[index] ?? variable.label)
          : (variable.default_value ??
            variable.options?.values?.[0] ??
            variable.label);
      slots.push({ token, fallback: sample });
    });
  }
  // Longest first, so a suffixed token is never matched inside a longer one.
  slots.sort((a, b) => b.token.length - a.token.length);

  const rendered: ChatMessage[] = messages.map((message, index) => ({
    id: message.key,
    position: index,
    speaker_name: message.speaker_name,
    message_type: message.message_type,
    content: message.content,
    metadata: { side: message.side },
  }));

  return (
    <section className="mt-3 rounded-lg border border-primary-200 bg-primary-50/50 p-4">
      <p className="mono-label">ตัวอย่างที่ผู้อ่านจะเห็น</p>
      <div className="mt-3">
        {rendered.length > 0 ? (
          <ChatView messages={rendered} slots={slots} />
        ) : (
          <p className="text-sm text-text-secondary">ยังไม่มีข้อความในบทสนทนา</p>
        )}
      </div>
      <p className="mt-2.5 text-xs text-text-muted">
        ใช้ค่าเริ่มต้นที่คุณตั้งไว้เป็นตัวอย่าง - ต้นฉบับยังเก็บเป็นตัวแทนเหมือนเดิม
      </p>
    </section>
  );
}

/**
 * The headcanon composer (12F, §13M).
 *
 * A topic is a chapter; its entries are cards, one per character. The field
 * labels belong to the TOPIC, so they are edited once at the top and every
 * entry answers them positionally - which is why adding a label appends an
 * empty answer to each entry rather than silently shifting the existing ones
 * onto the wrong heading.
 *
 * Entry bodies have no length limit. 12F is explicit that headcanon entry
 * length is unknown by nature, and the textarea grows rather than truncating.
 *
 * Each entry carries three optional things beyond its body: values for the
 * topic's fields, a link to a cast record, and a picture. None is required, and
 * a topic with none of them is a complete headcanon set - the panel above says
 * so rather than leaving a writer to guess which empty control is a mistake.
 */
function EntryComposer({
  novelRef,
  entries,
  fields,
  onChangeEntries,
  onChangeFields,
  variables,
  characters,
}: {
  novelRef: string;
  entries: DraftEntry[];
  fields: string[];
  onChangeEntries: (next: DraftEntry[]) => void;
  onChangeFields: (next: string[]) => void;
  variables: NovelVariable[];
  characters: Character[];
}) {
  /**
   * The entry the toolbar is pointing at (§13R).
   *
   * One toolbar above the whole composer, exactly as the mockup has it, rather
   * than one per card - a row of buttons repeated twenty times is not a
   * toolbar, it is noise. It follows focus: whichever body the writer is in is
   * the one B, I, สี, and แทรกรูป act on. `RichEditor` fills its own handle on
   * mount, so by the time a body can be focused there is something to point at.
   */
  const focused = useRef<RichEditorHandle | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const hydrated = useHydrated();

  /**
   * The first box, already there (§13R).
   *
   * A brand-new headcanon topic used to open on the sentence "ยังไม่มีรายการ
   * ในหัวข้อนี้" and a dashed button, which tells a writer what is absent
   * rather than what to do. One empty card is the format explaining itself.
   *
   * It writes NOTHING: an entry with no name is dropped before the save, so a
   * writer who opens a topic and closes it again has created no content. On
   * mount only - a writer who deletes their last entry meant to.
   */
  useEffect(() => {
    if (entries.length > 0) return;
    onChangeEntries([
      {
        key: `starter-${Date.now()}`,
        name: "",
        values: fields.map(() => ""),
        body: "",
        characterId: null,
        imageURL: null,
      },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patch(index: number, changes: Partial<DraftEntry>) {
    onChangeEntries(
      entries.map((item, i) => (i === index ? { ...item, ...changes } : item)),
    );
  }

  function setValue(index: number, slot: number, value: string) {
    const values = [...entries[index].values];
    while (values.length < fields.length) values.push("");
    values[slot] = value;
    patch(index, { values });
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= entries.length) return;
    const next = [...entries];
    [next[index], next[target]] = [next[target], next[index]];
    onChangeEntries(next);
  }

  function addField() {
    onChangeFields([...fields, ""]);
    // Every entry gains the matching empty answer, so answers never slide onto
    // a heading they were not written for.
    onChangeEntries(entries.map((entry) => ({ ...entry, values: [...entry.values, ""] })));
  }

  function removeField(slot: number) {
    onChangeFields(fields.filter((_, i) => i !== slot));
    onChangeEntries(
      entries.map((entry) => ({
        ...entry,
        values: entry.values.filter((_, i) => i !== slot),
      })),
    );
  }

  return (
    <div className="mt-4">
      {/*
        เฮดแคนอนชุดนี้ทำงานยังไง (§13R).

        A writer opening this for the first time meets three empty controls -
        a field row, a name, a body - and no way to tell which of them the
        format actually needs. Two lines up front cost a returning writer one
        glance and save a first-time one from guessing.
      */}
      <section className="mb-3 flex gap-2.5 rounded-lg border border-primary-200 bg-primary-50 px-3.5 py-3">
        <Icon name="users" size={16} className="mt-0.5 shrink-0 text-primary" />
        <div className="text-xs leading-relaxed text-text-secondary">
          <p className="font-medium text-text">
            หนึ่งตอน = หนึ่งหัวข้อ · หนึ่งกล่อง = หนึ่งตัวละคร
          </p>
          <p className="mt-0.5">
            ตั้งหัวข้อไว้ด้านบน แล้วเพิ่มกล่องทีละตัวละคร
            แต่ละกล่องใส่ชื่อกับเนื้อหาก็พอ - รูปภาพและฟิลด์เสริมจะใส่หรือไม่ใส่ก็ได้
          </p>
        </div>
      </section>

      {/*
        The topic's fields, on ONE row (§13P).

        Label, the chips themselves, the way to add another, and - held to the
        far end - the thing a writer most needs to know about them: they are
        optional. A topic is a name and a body; everything on this row is extra.
      */}
      <section className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-surface px-3.5 py-3">
        <p className="text-[13px] text-text-secondary">ฟิลด์เสริมของหัวข้อนี้ (ได้ 1 ฟิลด์)</p>

        {/* Chips rather than bare inputs: a field label belongs to the TOPIC,
            and one that reads as an object with a remove on it is harder to
            mistake for a value the entry below is asking for. */}
        {fields.map((field, slot) => (
          <span
            key={slot}
            className="flex items-center gap-0.5 rounded-full border border-primary-200 bg-primary-50 py-0.5 ps-3 pe-1"
          >
            <label className="sr-only" htmlFor={`entry-field-${slot}`}>
              ชื่อฟิลด์ที่ {slot + 1}
            </label>
            <input
              id={`entry-field-${slot}`}
              value={field}
              onChange={(event) =>
                onChangeFields(
                  fields.map((item, i) => (i === slot ? event.target.value : item)),
                )
              }
              placeholder="ชื่อฟิลด์"
              size={Math.max(8, field.length + 1)}
              className="min-h-8 min-w-0 bg-transparent text-[13px] outline-none placeholder:text-text-muted"
            />
            <RowButton
              label={`ลบฟิลด์ ${field || slot + 1}`}
              onClick={() => removeField(slot)}
              compact
            >
              <Icon name="close" size={13} />
            </RowButton>
          </span>
        ))}

        {/* ONE field, by design (editor review 2026-08): its answer rides the
            character's name line - เอเธอร์ (Aether) | เปอร์เซ็นต์ที่จีบติด: 20% -
            and a name line carries one clause. More than that belongs in the
            box's own body, where the writer lays it out themselves. Topics
            that already have several keep them until removed. */}
        {fields.length === 0 ? <AddButton onClick={addField}>+ เพิ่มฟิลด์</AddButton> : null}

        <p className="ms-auto text-xs text-text-muted">
          ไม่มีฟิลด์ก็ได้ - คำตอบจะต่อท้ายชื่อ เช่น เอเธอร์ | เปอร์เซ็นต์ที่จีบติด: 20%
          อยากได้มากกว่านี้เขียนในกล่องเนื้อหาได้เลย
        </p>
      </section>

      {/*
        The formatting toolbar, above the composer and shared by every entry
        (§13R). A headcanon body is prose - it wants bold, a colour, a link,
        a picture in the middle of it - and it had none of that while a chapter
        beside it had all of it.
      */}
      <div className="mt-3">
        <FormatToolbar editor={focused} novelRef={novelRef}>
          <InsertVariable
            variables={variables}
            onInsert={(token) => focused.current?.insertText(token)}
          />
        </FormatToolbar>
      </div>

      {uploadError ? (
        <p role="alert" className="mt-3 rounded-md bg-error/10 px-3 py-2 text-sm text-error">
          {uploadError}
        </p>
      ) : null}

      <ol className="mt-3 flex flex-col gap-3">
        {entries.map((entry, index) => {
          const character = entry.characterId
            ? (characters.find((item) => item.id === entry.characterId) ?? null)
            : null;

          return (
            <li
              key={entry.key}
              id={`entry-block-${entry.key}`}
              className="scroll-mt-36 rounded-lg border border-border bg-surface"
            >
              <div className="flex flex-wrap items-center gap-2.5 border-b border-hairline px-3.5 py-2.5">
                <span className="font-mono text-xs text-text-muted tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>

                <EntryAvatar
                  imageURL={entry.imageURL}
                  avatarURL={character?.avatar_url ?? null}
                  name={entry.name}
                />

                <label className="sr-only" htmlFor={`entry-name-${entry.key}`}>
                  ชื่อตัวละคร
                </label>
                <input
                  id={`entry-name-${entry.key}`}
                  value={entry.name}
                  onChange={(event) => patch(index, { name: event.target.value })}
                  placeholder="ชื่อตัวละคร"
                  className="min-h-9 w-44 rounded-md border border-border px-2.5 text-sm font-medium outline-none focus:border-primary"
                />

                {/*
                  The link to a cast record. The column has existed since 12F
                  and never had a control: linking is what lets this entry show
                  the character's picture and point a reader at their page. It
                  stays OPTIONAL - a headcanon may be about someone who has no
                  record at all, and 12F keeps the name denormalised for exactly
                  that case.
                */}
                {characters.length > 0 ? (
                  <>
                    <label className="sr-only" htmlFor={`entry-character-${entry.key}`}>
                      ผูกกับตัวละครในเรื่อง
                    </label>
                    <select
                      id={`entry-character-${entry.key}`}
                      value={entry.characterId ?? ""}
                      onChange={(event) =>
                        patch(index, { characterId: event.target.value || null })
                      }
                      className="min-h-9 max-w-44 rounded-md border border-border bg-surface px-2 text-[13px] text-text-secondary outline-none focus:border-primary"
                    >
                      <option value="">ไม่ผูกกับตัวละคร</option>
                      {characters.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </>
                ) : null}

                {character ? (
                  <Link
                    href={`/studio/novels/${encodeURIComponent(novelRef)}/characters`}
                    className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2.5 text-xs text-text-secondary hover:border-primary-200 hover:text-text"
                  >
                    ดูข้อมูลตัวละคร
                    <Icon name="external" size={13} />
                  </Link>
                ) : null}

                {/*
                  Reorder and remove, at the far end of the row. Two arrows
                  rather than a drag handle: a drag needs a pointer, and a cast
                  of twenty is a list a keyboard has to be able to reorder too.
                */}
                <span className="ms-auto flex items-center gap-0.5">
                  <RowButton label="เลื่อนขึ้น" onClick={() => move(index, -1)} compact>
                    <Icon name="chevron-up" size={14} />
                  </RowButton>
                  <RowButton label="เลื่อนลง" onClick={() => move(index, 1)} compact>
                    <Icon name="chevron-down" size={14} />
                  </RowButton>
                  <RowButton
                    label="ลบรายการนี้"
                    onClick={() => onChangeEntries(entries.filter((_, i) => i !== index))}
                    compact
                  >
                    <Icon name="close" size={14} />
                  </RowButton>
                </span>
              </div>

              <div className="px-3.5 py-3">
                {fields.length > 0 ? (
                  <div className="mb-3 flex flex-col gap-2">
                    {fields.map((field, slot) => (
                      <div
                        key={slot}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1"
                      >
                        <label
                          className="w-40 shrink-0 text-xs text-text-secondary"
                          htmlFor={`entry-${entry.key}-value-${slot}`}
                        >
                          {field || `ฟิลด์ ${slot + 1}`}
                        </label>
                        <input
                          id={`entry-${entry.key}-value-${slot}`}
                          value={entry.values[slot] ?? ""}
                          onChange={(event) => setValue(index, slot, event.target.value)}
                          className="min-h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
                        />
                      </div>
                    ))}
                  </div>
                ) : null}

                <EntryImage
                  novelRef={novelRef}
                  imageURL={entry.imageURL}
                  onChange={(next) => patch(index, { imageURL: next })}
                  onError={setUploadError}
                />

                <div className="mt-3">
                  <EntryBody
                    entryKey={entry.key}
                    initialValue={entry.body}
                    onChange={(next) => patch(index, { body: next })}
                    onFocus={(handle) => {
                      focused.current = handle;
                    }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-text-muted">
                  {hydrated ? count(wordsIn(entry.body)) : "–"} คำ · ย่อหน้าเว้นบรรทัดได้ตามใจ ไม่จำกัดความยาว
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <AddButton
          onClick={() =>
            onChangeEntries([
              ...entries,
              {
                key: `new-entry-${Date.now()}-${entries.length}`,
                name: "",
                values: fields.map(() => ""),
                body: "",
                characterId: null,
                imageURL: null,
              },
            ])
          }
        >
          + ตัวละคร
        </AddButton>

      </div>
    </div>
  );
}

/**
 * One entry's body, as a live surface (§13R).
 *
 * Its own handle, registered with the composer on focus - which is what lets
 * ONE toolbar drive twenty of these. The handle is a ref rather than state on
 * purpose: pointing the toolbar at a different entry must not re-render the
 * entry the writer is typing in.
 */
function EntryBody({
  entryKey,
  initialValue,
  onChange,
  onFocus,
}: {
  entryKey: string;
  initialValue: string;
  onChange: (next: string) => void;
  onFocus: (handle: RichEditorHandle | null) => void;
}) {
  const handle = useRef<RichEditorHandle | null>(null);

  return (
    <RichEditor
      id={`entry-body-${entryKey}`}
      initialValue={initialValue}
      onChange={onChange}
      handleRef={handle}
      onFocus={() => onFocus(handle.current)}
      ariaLabel="เนื้อหาเฮดแคนอน"
      placeholder="เขียนเฮดแคนอนของตัวละครนี้…"
      className="min-h-32 p-3 text-sm leading-relaxed"
    />
  );
}

/**
 * The round mark beside an entry's name.
 *
 * The entry's OWN picture wins, then the linked character's avatar, then an
 * initial. The character's avatar is only ever borrowed for display - it is
 * never copied into the entry - so renaming or re-picturing a cast member keeps
 * flowing through, and unlinking does not leave a stale face behind.
 */
function EntryAvatar({
  imageURL,
  avatarURL,
  name,
}: {
  imageURL: string | null;
  avatarURL: string | null;
  name: string;
}) {
  const source = imageURL ?? avatarURL;

  if (source) {
    return (
      /* An uploaded URL from our own media route. next/image would add a proxy
         hop and a layout guess for a 32px decoration inside an editor that
         never ships to a reader. */
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={source}
        alt=""
        className="size-8 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-secondary text-xs text-text-muted"
    >
      {name.trim().slice(0, 1) || "?"}
    </span>
  );
}

/**
 * รูปภาพของรายการนี้ (§13M).
 *
 * Uploaded through the media endpoint, which authorizes against the fiction and
 * validates the actual bytes before storing them (docs/11 §28) - nothing here
 * decides whether a file is acceptable. What lands in the draft is the URL the
 * API hands back; it becomes part of the entry on the next save, like every
 * other field in this composer.
 *
 * Removing the picture clears the REFERENCE and leaves the stored file alone.
 * Deleting the bytes here would be a destructive act triggered by an edit, and
 * an author who reverts to an earlier revision must find their picture still
 * there (docs/CONTENT-MODEL.md §5).
 */
function EntryImage({
  novelRef,
  imageURL,
  onChange,
  onError,
}: {
  novelRef: string;
  imageURL: string | null;
  onChange: (next: string | null) => void;
  onError: (message: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // The same input is reused for a replacement, so it is cleared either way.
    event.target.value = "";
    if (!file) return;

    setBusy(true);
    onError(null);
    try {
      const media = await uploadMedia({
        file,
        purpose: "entry_image",
        novel: novelRef,
      });
      onChange(media.url);
    } catch (cause) {
      onError(
        cause instanceof ApiError ? cause.message : "อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept={MEDIA_ACCEPT}
        onChange={onPick}
        className="hidden"
      />

      {imageURL ? (
        /* CENTRED, always (editor review 2026-08): the box's picture is its
           banner, and a banner does not lean left or right. The composer shows
           it exactly where the reader's card will. */
        <div className="flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- see EntryAvatar */}
          <img
            src={imageURL}
            alt="รูปภาพของรายการนี้"
            className="mx-auto max-h-40 w-auto rounded-md border border-border object-contain"
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs text-text-secondary hover:border-primary-200 hover:text-text disabled:opacity-50"
            >
              <Icon name="image" size={14} />
              {busy ? "กำลังอัปโหลด…" : "เปลี่ยนรูป"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onChange(null)}
              className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-xs text-text-secondary hover:border-error hover:text-error disabled:opacity-50"
            >
              เอารูปออก
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-dashed border-border px-3 text-[13px] text-text-secondary hover:border-primary-200 hover:text-primary disabled:opacity-50"
        >
          <Icon name="image" size={15} />
          {busy ? "กำลังอัปโหลด…" : "+ เพิ่มรูปภาพ"}
        </button>
      )}
    </div>
  );
}

function RowButton({
  children,
  label,
  onClick,
  compact = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  /** Sized to sit inside a chip rather than beside a form row. */
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex items-center justify-center rounded-full text-text-muted hover:bg-surface-secondary hover:text-text ${
        compact ? "size-6" : "size-8 rounded-md"
      }`}
    >
      {children}
    </button>
  );
}

function AddButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-9 items-center rounded-md border border-dashed border-border px-3 text-[13px] text-text-secondary hover:border-primary-200 hover:text-primary"
    >
      {children}
    </button>
  );
}
