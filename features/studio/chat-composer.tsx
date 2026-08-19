"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { count } from "@/lib/format";
import { InsertVariable } from "@/features/studio/insert-variable";
import type { Character } from "@/types/character";
import type { NovelVariable } from "@/types/variable";

/**
 * The chat composer (chat-editor review 2026-08, visual round per the author's
 * own mock): a CHAT, not a stack of forms - and a QUIET one.
 *
 * The rules that matter:
 *
 *   - A speaker's colour, side, and display name belong to the SPEAKER, set
 *     once from the chip's avatar - never per message. For a cast character
 *     they persist to the character record itself.
 *   - Colours come from a curated palette in the site's own key (same
 *     lightness, muted chroma), assigned in cast order - never hashed, never
 *     loud. The colour is what tells four เ-names apart; the name beside the
 *     circle says who.
 *   - The conversation sits in a centred 720px column, groups bubbles by
 *     speaker (3px inside a group, 16px between groups, 32px around scene
 *     breaks), and the avatar rides the FIRST bubble of the group.
 *   - One input pill holds everything the typing hand needs: the current
 *     voice's avatar, the block inserts, the variable token, search, the box,
 *     and ส่ง. Two rows of chrome, total.
 *   - Enter sends; Shift+Enter breaks the line; Tab cycles the speaker;
 *     ↑ edits the last bubble; "@ชื่อ" switches speaker mid-line. A
 *     multi-line paste previews as bubbles before it lands.
 */

export interface DraftMessage {
  key: string;
  speaker_name: string;
  content: string;
  message_type: "message" | "system" | "separator";
  side: "left" | "right";
}

interface Speaker {
  /** Stable identity: the character id, "reader", or a local key. */
  key: string;
  characterID?: string;
  /** The SPEAKING name - what goes into a bubble's speaker_name. */
  name: string;
  /** The full name, for the tooltip ("จงหลี่ (Zhongli)"). */
  fullName: string;
  side: "left" | "right";
  color: string;
  avatarURL: string | null;
  reader: boolean;
  /** A strip-only voice (added by hand or found in pasted text): removable. */
  temp: boolean;
}

interface SpeakerPrefs {
  color?: string;
  side?: "left" | "right";
  name?: string;
}

/** The line shape a pasted script uses: `ชื่อ: ข้อความ` (ASCII or Thai colon). */
const SCRIPT_LINE = /^([^:：\n]{1,30})[:：]\s*(.+)$/;

/**
 * The curated identity palette (visual round, item 1): eight colours at the
 * SAME oklch lightness (0.58) with muted chroma (0.07-0.09), hues spread just
 * far enough to tell speakers apart without shouting over the cream page.
 * Assigned in cast order - never hashed from a name.
 */
const PALETTE = [
  "#a36b44", // น้ำตาลอุ่น
  "#42868e", // เขียวน้ำทะเลหม่น
  "#4d896a", // เขียวหม่น
  "#557ea8", // น้ำเงินหม่น
  "#a96369", // กุหลาบหม่น
  "#9a6789", // ม่วงพลัม
  "#857b41", // มะกอก
  "#876ca5", // ม่วงอ่อน
];

/** The reader wears the brand purple - the same voice the reader page paints. */
const READER_COLOR = "#4f46a5";

/** "จงหลี่ (Zhongli)" → "จงหลี่": one name on the chip, the rest in the tooltip. */
function stripParen(name: string): string {
  const short = name.replace(/\s*[(（][^)）]*[)）]\s*$/, "").trim();
  return short === "" ? name : short;
}

function replaceAll(text: string, find: string, replace: string): string {
  return text.split(find).join(replace);
}

/**
 * Draft-row keys: local identities that only need to be unique within the
 * session. Module scope, so a remount never reissues one - and no impure
 * call sits inside the component for the compiler to flag.
 */
let keySequence = 0;
function nextKey(): string {
  keySequence += 1;
  return `new-${keySequence}`;
}

export function ChatComposer({
  messages,
  onChange,
  variables,
  characters = [],
  onUpdateCharacter,
}: {
  messages: DraftMessage[];
  onChange: (next: DraftMessage[]) => void;
  variables: NovelVariable[];
  characters?: Character[];
  /**
   * Persists a chip's colour/side/display-name back to the character record -
   * the composer applies the change optimistically either way.
   */
  onUpdateCharacter?: (
    characterID: string,
    changes: { chat_color?: string; chat_side?: "left" | "right"; chat_display_name?: string },
  ) => void;
}) {
  // The reader's speaking name: the fiction's own variable token, so the
  // reader page substitutes the real answer.
  const readerName = variables[0]?.tokens?.[0] ?? variables[0]?.token ?? "คุณ";

  const [extraSpeakers, setExtraSpeakers] = useState<string[]>([]);
  /** Session-side overrides, keyed by speaker key. For characters this is the
      optimistic layer over the persisted record. */
  const [prefs, setPrefs] = useState<Record<string, SpeakerPrefs>>({});
  /** Names removed from the strip by hand (item 7) - the junk-chip escape. */
  const [hiddenSpeakers, setHiddenSpeakers] = useState<Set<string>>(new Set());
  const [activeName, setActiveName] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [settingsKey, setSettingsKey] = useState<string | null>(null);
  const [addingSpeaker, setAddingSpeaker] = useState(false);
  const [newSpeaker, setNewSpeaker] = useState("");
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [pastePending, setPastePending] = useState<{
    rows: Omit<DraftMessage, "key">[];
    newcomers: string[];
    raw: string;
  } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [undoPile, setUndoPile] = useState<{ message: DraftMessage; index: number }[] | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const undoTimer = useRef<number | null>(null);

  // Strip scroll state: fades and arrows only when there is more to see.
  const railRef = useRef<HTMLDivElement>(null);
  const [rail, setRail] = useState({ left: false, right: false });
  useEffect(() => {
    const element = railRef.current;
    if (!element) return;
    const measure = () => {
      setRail({
        left: element.scrollLeft > 4,
        right: element.scrollLeft + element.clientWidth < element.scrollWidth - 4,
      });
    };
    measure();
    element.addEventListener("scroll", measure, { passive: true });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    return () => {
      element.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, [characters.length, extraSpeakers.length]);

  const speakers: Speaker[] = useMemo(() => {
    const seen = new Map<string, Speaker>();
    const fullNames = new Set<string>();
    // Palette slots hand out in cast order (item 1); a stored colour keeps
    // its own and consumes no slot.
    let slot = 0;
    const nextColor = () => PALETTE[slot++ % PALETTE.length];
    const add = (speaker: Speaker) => {
      if (speaker.name === "" || seen.has(speaker.name)) return;
      if (hiddenSpeakers.has(speaker.fullName)) return;
      seen.set(speaker.name, speaker);
      fullNames.add(speaker.fullName);
    };

    const readerPrefs = prefs["reader"] ?? {};
    add({
      key: "reader",
      name: readerName,
      fullName: readerName,
      side: readerPrefs.side ?? "right",
      color: readerPrefs.color ?? READER_COLOR,
      avatarURL: null,
      reader: true,
      temp: false,
    });

    for (const member of characters) {
      const local = prefs[member.id] ?? {};
      add({
        key: member.id,
        characterID: member.id,
        name: local.name ?? member.chat_display_name ?? stripParen(member.name),
        fullName: member.name,
        side: local.side ?? member.chat_side ?? "left",
        color: local.color ?? member.chat_color ?? nextColor(),
        avatarURL: member.avatar_url ?? null,
        reader: false,
        temp: false,
      });
    }

    for (const name of extraSpeakers) {
      const local = prefs["extra:" + name] ?? {};
      add({
        key: "extra:" + name,
        name: local.name ?? name,
        fullName: name,
        side: local.side ?? "left",
        color: local.color ?? nextColor(),
        avatarURL: null,
        reader: false,
        temp: true,
      });
    }

    // Voices already in the conversation stay pickable - unless the name is a
    // cast member's FULL name, which is the same person, not a new chip.
    for (const message of messages) {
      if (message.message_type !== "message") continue;
      if (seen.has(message.speaker_name) || fullNames.has(message.speaker_name)) continue;
      const local = prefs["msg:" + message.speaker_name] ?? {};
      add({
        key: "msg:" + message.speaker_name,
        name: message.speaker_name,
        fullName: message.speaker_name,
        side: local.side ?? message.side,
        color: local.color ?? nextColor(),
        avatarURL: null,
        reader: false,
        temp: true,
      });
    }

    // The reader leads; speakers this chapter actually uses come next; the
    // rest of the cast waits at the end of the row (item 7).
    const used = new Set<string>();
    for (const message of messages) {
      if (message.message_type === "message") used.add(message.speaker_name);
    }
    const list = [...seen.values()];
    const inUse = (speaker: Speaker) =>
      used.has(speaker.name) || used.has(speaker.fullName);
    return [
      ...list.filter((speaker) => speaker.reader),
      ...list.filter((speaker) => !speaker.reader && inUse(speaker)),
      ...list.filter((speaker) => !speaker.reader && !inUse(speaker)),
    ];
  }, [characters, extraSpeakers, hiddenSpeakers, messages, prefs, readerName]);

  const active =
    speakers.find((speaker) => speaker.name === activeName) ?? speakers[0];
  const settingsSpeaker =
    settingsKey === null ? null : (speakers.find((speaker) => speaker.key === settingsKey) ?? null);

  /** Every token this fiction declares, longest first, for the input's chips. */
  const tokenList = useMemo(
    () =>
      variables
        .flatMap((variable) => variable.tokens ?? [variable.token])
        .sort((a, b) => b.length - a.length),
    [variables],
  );

  /** A speaker by speaking OR full name - old bubbles may carry either. */
  function speakerFor(name: string): Speaker | undefined {
    return (
      speakers.find((speaker) => speaker.name === name) ??
      speakers.find((speaker) => speaker.fullName === name)
    );
  }

  function ownsMessage(speaker: Speaker, message: DraftMessage): boolean {
    return (
      message.message_type === "message" &&
      (message.speaker_name === speaker.name || message.speaker_name === speaker.fullName)
    );
  }

  function cycleSpeaker(delta: number) {
    if (speakers.length === 0) return;
    const at = speakers.findIndex((speaker) => speaker.name === active?.name);
    const next = speakers[(at + delta + speakers.length) % speakers.length];
    setActiveName(next.name);
  }

  function append(rows: Omit<DraftMessage, "key">[]) {
    onChange([...messages, ...rows.map((row) => ({ ...row, key: nextKey() }))]);
  }

  function send() {
    let text = draft;
    let speaker = active;

    // "@ชื่อ ข้อความ" switches the speaker on the way past.
    if (text.startsWith("@")) {
      const head = text.slice(1).split(/\s+/, 1)[0] ?? "";
      const match = speakers.find((candidate) =>
        candidate.name.toLowerCase().startsWith(head.toLowerCase()),
      );
      if (match && head !== "") {
        speaker = match;
        setActiveName(match.name);
        text = text.slice(1 + head.length).trim();
        if (text === "") {
          setDraft("");
          return;
        }
      }
    }

    if (text.trim() === "" || !speaker) return;
    append([
      {
        speaker_name: speaker.name,
        content: text,
        message_type: "message",
        side: speaker.side,
      },
    ]);
    setDraft("");
  }

  /**
   * Inserts a variable token at the caret, with a breathing space when the
   * character before it is not one (item 9's "testy/n") - a token glued to a
   * word reads as a typo, not a variable.
   */
  function insertToken(token: string) {
    const field = inputRef.current;
    const pad = (before: string) =>
      before !== "" && !/\s$/.test(before) ? " " : "";
    if (!field) {
      setDraft((current) => current + pad(current) + token);
      return;
    }
    const start = field.selectionStart ?? draft.length;
    const end = field.selectionEnd ?? start;
    const before = draft.slice(0, start);
    const inserted = pad(before) + token;
    setDraft(before + inserted + draft.slice(end));
    requestAnimationFrame(() => {
      const caret = start + inserted.length;
      field.focus();
      field.setSelectionRange(caret, caret);
    });
  }

  /** Parses a multi-line paste into rows - the preview decides what happens. */
  function onPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const text = event.clipboardData.getData("text/plain");
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== "");
    if (lines.length < 2) return;
    event.preventDefault();

    const known = new Map<string, Speaker>();
    for (const speaker of speakers) {
      known.set(speaker.name, speaker);
      known.set(speaker.fullName, speaker);
    }
    const newcomers: string[] = [];
    const rows: Omit<DraftMessage, "key">[] = [];
    for (const line of lines) {
      if (/^(-{3,}|\*{3,})$/.test(line)) {
        rows.push({ speaker_name: "", content: "", message_type: "separator", side: "left" });
        continue;
      }
      const scripted = SCRIPT_LINE.exec(line);
      if (scripted) {
        const name = scripted[1].trim();
        let speaker = known.get(name);
        if (!speaker) {
          speaker = {
            key: "extra:" + name,
            name,
            fullName: name,
            side: name === readerName ? "right" : "left",
            color: PALETTE[0],
            avatarURL: null,
            reader: false,
            temp: true,
          };
          known.set(name, speaker);
          newcomers.push(name);
        }
        rows.push({
          speaker_name: speaker.name,
          content: scripted[2].trim(),
          message_type: "message",
          side: speaker.side,
        });
        continue;
      }
      rows.push({
        speaker_name: active?.name ?? "",
        content: line,
        message_type: "message",
        side: active?.side ?? "left",
      });
    }
    setPastePending({ rows, newcomers, raw: text });
  }

  function confirmPaste() {
    if (!pastePending) return;
    if (pastePending.newcomers.length > 0) {
      setExtraSpeakers((current) => [...current, ...pastePending.newcomers]);
    }
    append(pastePending.rows);
    setPasteNote(
      `วางแล้วแตกเป็น ${count(pastePending.rows.length)} ข้อความให้เรียบร้อย - คลิกบับเบิลเพื่อแก้`,
    );
    setPastePending(null);
  }

  /**
   * One change on the chip changes the SPEAKER everywhere: a new side
   * re-sides every bubble they own, a new name re-labels them, and for a
   * cast character the preference rides home to the character record.
   */
  function applySpeakerChange(speaker: Speaker, changes: SpeakerPrefs) {
    setPrefs((current) => ({
      ...current,
      [speaker.key]: { ...current[speaker.key], ...changes },
    }));

    let next = messages;
    if (changes.side && changes.side !== speaker.side) {
      next = next.map((message) =>
        ownsMessage(speaker, message) ? { ...message, side: changes.side! } : message,
      );
    }
    if (changes.name && changes.name !== speaker.name) {
      next = next.map((message) =>
        ownsMessage(speaker, message)
          ? { ...message, speaker_name: changes.name! }
          : message,
      );
      if (active?.key === speaker.key) setActiveName(changes.name);
    }
    if (next !== messages) onChange(next);

    if (speaker.characterID && onUpdateCharacter) {
      onUpdateCharacter(speaker.characterID, {
        ...(changes.color ? { chat_color: changes.color } : {}),
        ...(changes.side ? { chat_side: changes.side } : {}),
        ...(changes.name ? { chat_display_name: changes.name } : {}),
      });
    }
  }

  function removeFromStrip(speaker: Speaker) {
    if (!speaker.temp) return;
    setExtraSpeakers((current) => current.filter((name) => name !== speaker.fullName));
    setHiddenSpeakers((current) => new Set([...current, speaker.fullName]));
    if (activeName === speaker.name) setActiveName(null);
    setSettingsKey(null);
  }

  function patch(key: string, changes: Partial<DraftMessage>) {
    onChange(
      messages.map((message) => (message.key === key ? { ...message, ...changes } : message)),
    );
  }

  /** Removes rows and opens the เลิกทำ window. */
  function removeWithUndo(keys: string[]) {
    const pile = messages
      .map((message, index) => ({ message, index }))
      .filter(({ message }) => keys.includes(message.key));
    if (pile.length === 0) return;
    onChange(messages.filter((message) => !keys.includes(message.key)));
    setEditingKey(null);
    setMenuKey(null);
    setSelected(new Set());
    setUndoPile(pile);
    if (undoTimer.current !== null) window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => setUndoPile(null), 5000);
  }

  function undoDelete() {
    if (!undoPile) return;
    const next = [...messages];
    for (const { message, index } of undoPile) {
      next.splice(Math.min(index, next.length), 0, message);
    }
    onChange(next);
    setUndoPile(null);
    if (undoTimer.current !== null) window.clearTimeout(undoTimer.current);
  }

  function move(key: string, delta: number) {
    const at = messages.findIndex((message) => message.key === key);
    const target = at + delta;
    if (at < 0 || target < 0 || target >= messages.length) return;
    const next = [...messages];
    [next[at], next[target]] = [next[target], next[at]];
    onChange(next);
  }

  function moveTo(key: string, index: number) {
    const at = messages.findIndex((message) => message.key === key);
    if (at < 0) return;
    const next = [...messages];
    const [row] = next.splice(at, 1);
    next.splice(at < index ? index - 1 : index, 0, row);
    onChange(next);
  }

  function insertAt(index: number, row: Omit<DraftMessage, "key">, edit = false) {
    const withKey = { ...row, key: nextKey() };
    const next = [...messages];
    next.splice(index, 0, withKey);
    onChange(next);
    if (edit) setEditingKey(withKey.key);
    setMenuKey(null);
  }

  function duplicate(key: string) {
    const at = messages.findIndex((message) => message.key === key);
    if (at < 0) return;
    const source = messages[at];
    insertAt(at + 1, {
      speaker_name: source.speaker_name,
      content: source.content,
      message_type: source.message_type,
      side: source.side,
    });
  }

  function editLast() {
    const last = [...messages].reverse().find((message) => message.message_type === "message");
    if (last) setEditingKey(last.key);
  }

  function reassignSelected(name: string) {
    const speaker = speakers.find((candidate) => candidate.name === name);
    if (!speaker) return;
    onChange(
      messages.map((message) =>
        selected.has(message.key) && message.message_type === "message"
          ? { ...message, speaker_name: speaker.name, side: speaker.side }
          : message,
      ),
    );
    setSelected(new Set());
  }

  /** Moves every selected row one step, keeping their relative order. */
  function moveSelected(delta: number) {
    const next = [...messages];
    const indices = next
      .map((message, index) => (selected.has(message.key) ? index : -1))
      .filter((index) => index >= 0);
    if (indices.length === 0) return;
    const ordered = delta < 0 ? indices : [...indices].reverse();
    for (const index of ordered) {
      const target = index + delta;
      if (target < 0 || target >= next.length || selected.has(next[target].key)) continue;
      [next[index], next[target]] = [next[target], next[index]];
    }
    onChange(next);
  }

  function toggleSelected(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // --- ค้นหา/แทนที่ ---------------------------------------------------------
  const matchCount =
    query === ""
      ? 0
      : messages.reduce(
          (sum, message) =>
            sum +
            (message.content.split(query).length - 1) +
            (message.speaker_name.split(query).length - 1),
          0,
        );

  function replaceEverywhere() {
    if (query === "" || matchCount === 0) return;
    onChange(
      messages.map((message) => ({
        ...message,
        content: replaceAll(message.content, query, replacement),
        speaker_name: replaceAll(message.speaker_name, query, replacement),
      })),
    );
    setPasteNote(`แทนที่ ${count(matchCount)} จุดแล้ว`);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
      return;
    }
    if (event.key === "Tab" && draft === "") {
      event.preventDefault();
      cycleSpeaker(event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === "ArrowUp" && draft === "") {
      event.preventDefault();
      editLast();
    }
  }

  /** Whether the row at `index` starts a bubble group. */
  function startsGroup(index: number): boolean {
    const message = messages[index];
    if (message.message_type !== "message") return true;
    const previous = messages[index - 1];
    if (!previous || previous.message_type !== "message") return true;
    return (
      previous.speaker_name !== message.speaker_name || previous.side !== message.side
    );
  }

  /**
   * The rhythm that makes the structure readable (item 4): 3px inside a
   * group, 16px between groups, 32px around a scene break.
   */
  function rowSpacing(index: number): string {
    if (index === 0) return "";
    const message = messages[index];
    const previous = messages[index - 1];
    if (message.message_type === "separator" || previous.message_type === "separator") {
      return "mt-8";
    }
    if (message.message_type === "system" || previous.message_type === "system") {
      return "mt-4";
    }
    return startsGroup(index) ? "mt-4" : "mt-0.75";
  }

  function rowDragOver(event: React.DragEvent, index: number) {
    if (dragKey === null) return;
    event.preventDefault();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const below = event.clientY > rect.top + rect.height / 2;
    setDropAt(below ? index + 1 : index);
  }

  function drop() {
    if (dragKey !== null && dropAt !== null) moveTo(dragKey, dropAt);
    setDragKey(null);
    setDropAt(null);
  }

  /** The input's mirror: tokens wear a quiet chip, metrics stay identical. */
  function renderDraftWithTokens(text: string): React.ReactNode {
    let parts: (string | { token: string; at: number })[] = [text];
    let sequence = 0;
    for (const token of tokenList) {
      const next: typeof parts = [];
      for (const part of parts) {
        if (typeof part !== "string" || !part.includes(token)) {
          next.push(part);
          continue;
        }
        const pieces = part.split(token);
        pieces.forEach((piece, at) => {
          if (piece !== "") next.push(piece);
          if (at < pieces.length - 1) next.push({ token, at: sequence++ });
        });
      }
      parts = next;
    }
    return parts.map((part) =>
      typeof part === "string" ? (
        part
      ) : (
        <span key={`t-${part.at}`} className="rounded-sm bg-primary-50 text-primary">
          {part.token}
        </span>
      ),
    );
  }

  return (
    <div className="mt-4">
      {/* ---- the conversation: a centred chat column (item 5) ------------ */}
      <ol
        className="mx-auto flex w-full max-w-180 flex-col"
        aria-label="บทสนทนา (คลิกข้อความเพื่อแก้)"
      >
        {messages.map((message, index) => (
          <li
            key={message.key}
            id={`chat-block-${message.key}`}
            className={`group scroll-mt-36 ${
              dropAt === index && dragKey !== null ? "border-t-2 border-primary" : ""
            } ${rowSpacing(index)}`}
            onDragOver={(event) => rowDragOver(event, index)}
            onDrop={drop}
          >
            {message.key === editingKey ? (
              <RowEditor
                message={message}
                speakers={speakers}
                grouped={!startsGroup(index)}
                onSave={(changes) => {
                  patch(message.key, changes);
                  setEditingKey(null);
                }}
                onDelete={() => removeWithUndo([message.key])}
                onCancel={() => setEditingKey(null)}
              />
            ) : message.message_type === "separator" ? (
              <button
                type="button"
                onClick={() => setEditingKey(message.key)}
                className="flex w-full items-center gap-3 py-1"
                title="คลิกเพื่อแก้คั่นฉาก"
              >
                <span aria-hidden className="h-px flex-1 bg-border" />
                {message.content ? (
                  <span className="text-[13px] text-text-secondary">{message.content}</span>
                ) : (
                  // The WORD "คั่นฉาก" is chrome, not content (item 9): an
                  // unnamed break shows an invitation, styled as one.
                  <span className="text-[13px] text-text-muted/80 italic">
                    ตั้งชื่อฉาก - เช่น ผ่านไป 30 นาที
                  </span>
                )}
                <span aria-hidden className="h-px flex-1 bg-border" />
              </button>
            ) : message.message_type === "system" ? (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setEditingKey(message.key)}
                  title="คลิกเพื่อแก้ข้อความระบบ"
                  className="inline-flex max-w-[92%] items-center gap-1.5 rounded-full bg-surface-secondary/70 px-4 py-2 text-center text-sm whitespace-pre-wrap text-text-secondary hover:bg-surface-secondary"
                >
                  <Icon name="message" size={13} className="shrink-0 opacity-60" />
                  {message.content || "ข้อความระบบ"}
                </button>
              </div>
            ) : (
              <MessageRow
                message={message}
                speaker={speakerFor(message.speaker_name)}
                groupStart={startsGroup(index)}
                selected={selected.has(message.key)}
                menuOpen={menuKey === message.key}
                speakers={speakers}
                onClick={(event) => {
                  if (event.shiftKey) toggleSelected(message.key);
                  else setEditingKey(message.key);
                }}
                onEdit={() => setEditingKey(message.key)}
                onFlipSide={() => {
                  // The mock's ⇌ beside every bubble: one press moves the
                  // whole SPEAKER across (the side belongs to the speaker,
                  // item D11) - and rides home to the character record.
                  const owner = speakerFor(message.speaker_name);
                  if (owner) {
                    applySpeakerChange(owner, {
                      side: owner.side === "right" ? "left" : "right",
                    });
                  } else {
                    patch(message.key, {
                      side: message.side === "right" ? "left" : "right",
                    });
                  }
                }}
                onReassign={(name) => {
                  const speaker = speakers.find((candidate) => candidate.name === name);
                  if (speaker) {
                    patch(message.key, { speaker_name: speaker.name, side: speaker.side });
                  }
                }}
                onMenu={() =>
                  setMenuKey((current) => (current === message.key ? null : message.key))
                }
                onInsertAbove={() =>
                  insertAt(index, { ...message, content: "" }, true)
                }
                onInsertBelow={() =>
                  insertAt(index + 1, { ...message, content: "" }, true)
                }
                onDuplicate={() => duplicate(message.key)}
                onMoveUp={() => move(message.key, -1)}
                onMoveDown={() => move(message.key, 1)}
                onDelete={() => removeWithUndo([message.key])}
                onDragStart={() => setDragKey(message.key)}
                onDragEnd={() => {
                  setDragKey(null);
                  setDropAt(null);
                }}
              />
            )}
          </li>
        ))}
      </ol>

      {messages.length === 0 ? (
        <p className="mx-auto max-w-180 rounded-lg border border-dashed border-border p-6 text-center text-sm text-text-secondary">
          เลือกผู้พูดด้านล่าง แล้วเริ่มพิมพ์ได้เลย - Enter ส่ง · Tab สลับผู้พูด ·
          วางบทที่ร่างไว้หลายบรรทัดได้ (รูปแบบ ชื่อ: ข้อความ)
        </p>
      ) : null}

      {/* ---- the composer bar, pinned ------------------------------------ */}
      <div className="sticky bottom-0 z-10 mt-4 border-t border-hairline bg-background pt-2.5 pb-2">
        <div className="mx-auto w-full max-w-180">
          {pasteNote ? (
            <p aria-live="polite" className="mb-2 text-xs text-success">
              {pasteNote}
            </p>
          ) : null}

          {undoPile ? (
            <p className="mb-2 flex items-center gap-2 rounded-md bg-surface-secondary px-3 py-1.5 text-xs text-text">
              ลบแล้ว {count(undoPile.length)} ข้อความ
              <button
                type="button"
                onClick={undoDelete}
                className="font-medium text-primary hover:underline"
              >
                เลิกทำ
              </button>
            </p>
          ) : null}

          {selected.size > 0 ? (
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs">
              <span className="font-medium text-primary">
                เลือกแล้ว {count(selected.size)} ข้อความ
              </span>
              <select
                defaultValue=""
                aria-label="เปลี่ยนผู้พูดของที่เลือก"
                onChange={(event) => {
                  if (event.target.value !== "") reassignSelected(event.target.value);
                }}
                className="min-h-7 rounded-md border border-border bg-surface px-2 text-xs outline-none focus:border-primary"
              >
                <option value="">เปลี่ยนผู้พูดเป็น…</option>
                {speakers.map((speaker) => (
                  <option key={speaker.key} value={speaker.name}>
                    {speaker.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => moveSelected(-1)}
                className="rounded-md border border-border px-2 py-1 hover:text-text"
              >
                เลื่อนขึ้น
              </button>
              <button
                type="button"
                onClick={() => moveSelected(1)}
                className="rounded-md border border-border px-2 py-1 hover:text-text"
              >
                เลื่อนลง
              </button>
              <button
                type="button"
                onClick={() => removeWithUndo([...selected])}
                className="rounded-md border border-error/40 px-2 py-1 text-error hover:bg-error/10"
              >
                ลบที่เลือก
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="ms-auto text-text-secondary hover:text-text"
              >
                ยกเลิก
              </button>
            </div>
          ) : null}

          {/* The speaker strip: scrolls without a scrollbar, fades at the
              edges, keeps + ผู้พูด parked at the end. */}
          <div className="flex items-center gap-1.5 pb-2">
            <div className="relative min-w-0 flex-1">
              <div
                ref={railRef}
                className="scrollbar-none flex items-center gap-1.5 overflow-x-auto"
              >
                {speakers.map((speaker) => {
                  const isActive = speaker.name === active?.name;
                  return (
                    <span
                      key={speaker.key}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setSettingsKey(speaker.key);
                      }}
                      style={
                        isActive
                          ? { backgroundColor: speaker.color, borderColor: speaker.color }
                          : undefined
                      }
                      className={`flex shrink-0 items-center overflow-hidden rounded-full border text-[13px] ${
                        isActive
                          ? "font-medium text-white"
                          : "border-border bg-surface text-text-secondary hover:border-primary-200"
                      }`}
                    >
                      {/* The avatar IS the settings handle (item 8). */}
                      <button
                        type="button"
                        aria-label={`ตั้งค่าผู้พูด ${speaker.name}`}
                        title="ตั้งค่าสี ฝั่ง และชื่อของผู้พูดนี้"
                        onClick={() =>
                          setSettingsKey((current) =>
                            current === speaker.key ? null : speaker.key,
                          )
                        }
                        className="flex items-center justify-center py-0.5 ps-1"
                      >
                        <SpeakerAvatar
                          speaker={speaker}
                          size={28}
                          ring={isActive}
                        />
                      </button>
                      <button
                        type="button"
                        aria-pressed={isActive}
                        title={`${speaker.fullName} - คลิกเพื่อพิมพ์ในนามนี้`}
                        onClick={() => setActiveName(speaker.name)}
                        className="min-h-9 pe-3 ps-1.5"
                      >
                        {speaker.name}
                      </button>
                    </span>
                  );
                })}
              </div>

              {rail.left ? (
                <>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 inset-s-0 w-8 bg-linear-to-r from-background to-transparent"
                  />
                  <button
                    type="button"
                    aria-label="เลื่อนรายชื่อผู้พูดไปทางซ้าย"
                    onClick={() => railRef.current?.scrollBy({ left: -160, behavior: "smooth" })}
                    className="absolute inset-y-0 inset-s-0 my-auto flex size-6 items-center justify-center rounded-full border border-border bg-surface text-text-secondary shadow-sm hover:text-text"
                  >
                    <Icon name="chevron-left" size={13} />
                  </button>
                </>
              ) : null}
              {rail.right ? (
                <>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 inset-e-0 w-8 bg-linear-to-l from-background to-transparent"
                  />
                  <button
                    type="button"
                    aria-label="เลื่อนรายชื่อผู้พูดไปทางขวา"
                    onClick={() => railRef.current?.scrollBy({ left: 160, behavior: "smooth" })}
                    className="absolute inset-y-0 inset-e-0 my-auto flex size-6 items-center justify-center rounded-full border border-border bg-surface text-text-secondary shadow-sm hover:text-text"
                  >
                    <Icon name="chevron-right" size={13} />
                  </button>
                </>
              ) : null}
            </div>

            {/* Always reachable, never scrolled away. */}
            {addingSpeaker ? (
              <input
                autoFocus
                value={newSpeaker}
                onChange={(event) => setNewSpeaker(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    const name = newSpeaker.trim();
                    if (name !== "") {
                      setExtraSpeakers((current) => [...current, name]);
                      setHiddenSpeakers((current) => {
                        const next = new Set(current);
                        next.delete(name);
                        return next;
                      });
                      setActiveName(name);
                    }
                    setNewSpeaker("");
                    setAddingSpeaker(false);
                  }
                  if (event.key === "Escape") setAddingSpeaker(false);
                }}
                onBlur={() => setAddingSpeaker(false)}
                placeholder="ชื่อผู้พูดใหม่"
                aria-label="ชื่อผู้พูดใหม่"
                className="min-h-8 w-32 shrink-0 rounded-full border border-border bg-surface px-3 text-xs outline-none focus:border-primary"
              />
            ) : (
              <button
                type="button"
                onClick={() => setAddingSpeaker(true)}
                className="min-h-9 shrink-0 rounded-full border border-dashed border-border px-3.5 text-[13px] text-text-secondary hover:border-primary-200 hover:text-primary"
              >
                + ผู้พูด
              </button>
            )}
          </div>

          {settingsSpeaker ? (
            <SpeakerSettings
              speaker={settingsSpeaker}
              onApply={(changes) => applySpeakerChange(settingsSpeaker, changes)}
              onRemove={
                settingsSpeaker.temp ? () => removeFromStrip(settingsSpeaker) : undefined
              }
              onClose={() => setSettingsKey(null)}
            />
          ) : null}

          {/* ONE pill holds the whole typing hand (item 6): voice, inserts,
              token, search, the box, and ส่ง. */}
          <div className="flex items-end gap-1 rounded-3xl border border-border bg-surface py-1 ps-2 pe-1 focus-within:border-primary">
            {active ? (
              <span className="mb-1 shrink-0" title={`กำลังพิมพ์ในนาม ${active.fullName}`}>
                <SpeakerAvatar speaker={active} size={28} />
              </span>
            ) : null}
            <button
              type="button"
              aria-label="+ คั่นฉาก"
              title="แทรกคั่นฉาก"
              onClick={() => {
                append([{ speaker_name: "", content: "", message_type: "separator", side: "left" }]);
              }}
              className="mb-0.5 flex h-9 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs text-text-secondary hover:bg-surface-secondary hover:text-text"
            >
              <Icon name="minus" size={15} />
              คั่นฉาก
            </button>
            <button
              type="button"
              aria-label="+ ข้อความระบบ"
              title="แทรกข้อความกลางแชท เช่น สถานะหรือการกระทำ"
              onClick={() => {
                append([{ speaker_name: "", content: "", message_type: "system", side: "left" }]);
              }}
              className="mb-0.5 flex h-9 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs text-text-secondary hover:bg-surface-secondary hover:text-text"
            >
              <Icon name="message" size={14} />
              แจ้งกลางแชท
            </button>
            <InsertVariable compact variables={variables} onInsert={insertToken} />
            <button
              type="button"
              aria-label="ค้นหา/แทนที่"
              aria-expanded={searchOpen}
              title="ค้นหา/แทนที่ในตอนนี้"
              onClick={() => setSearchOpen((open) => !open)}
              className="mb-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-surface-secondary hover:text-text"
            >
              <Icon name="search" size={15} />
            </button>

            <div className="relative min-w-0 flex-1">
              {tokenList.length > 0 ? (
                <div
                  ref={backdropRef}
                  aria-hidden
                  className="pointer-events-none absolute inset-0 overflow-hidden px-2 py-2 text-[15px] leading-relaxed wrap-break-word whitespace-pre-wrap"
                >
                  {renderDraftWithTokens(draft)}
                  {"​"}
                </div>
              ) : null}
              <textarea
                ref={inputRef}
                rows={1}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                onScroll={(event) => {
                  if (backdropRef.current) {
                    backdropRef.current.scrollTop = event.currentTarget.scrollTop;
                  }
                }}
                aria-label="พิมพ์ข้อความ"
                title="Enter ส่ง · Shift+Enter ขึ้นบรรทัด · Tab สลับผู้พูด · ↑ แก้ข้อความล่าสุด · @ชื่อ สลับผู้พูด"
                placeholder={active ? `พิมพ์ในนาม ${active.name}…` : "พิมพ์ข้อความ…"}
                className={`relative max-h-40 w-full resize-none bg-transparent px-2 py-2 text-[15px] leading-relaxed field-sizing-content placeholder:text-text-muted focus:outline-none ${
                  tokenList.length > 0 ? "caret-text text-transparent" : ""
                }`}
              />
            </div>

            <button
              type="button"
              onClick={send}
              disabled={draft.trim() === ""}
              className={`mb-0.5 inline-flex h-9 shrink-0 items-center rounded-full px-4 text-sm font-medium ${
                draft.trim() === ""
                  ? "bg-surface-secondary text-text-muted"
                  : "bg-primary text-white hover:opacity-90"
              }`}
            >
              ส่ง
            </button>
          </div>

          {searchOpen ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ค้นหาในตอนนี้…"
                aria-label="ค้นหาในตอนนี้"
                className="min-h-8 w-40 rounded-md border border-border bg-background px-2.5 outline-none focus:border-primary"
              />
              <input
                value={replacement}
                onChange={(event) => setReplacement(event.target.value)}
                placeholder="แทนที่ด้วย…"
                aria-label="แทนที่ด้วย"
                className="min-h-8 w-40 rounded-md border border-border bg-background px-2.5 outline-none focus:border-primary"
              />
              <span aria-live="polite" className="text-text-secondary tabular-nums">
                {query === "" ? "" : `พบ ${count(matchCount)} จุด`}
              </span>
              <button
                type="button"
                disabled={matchCount === 0}
                onClick={replaceEverywhere}
                className="inline-flex min-h-8 items-center rounded-md bg-primary px-3 font-medium text-white hover:opacity-90 disabled:opacity-40"
              >
                แทนที่ทั้งหมด
              </button>
              <span className="text-text-muted">
                รวมชื่อผู้พูดด้วย - ใช้เปลี่ยนชื่อตัวละครทั้งตอนได้
              </span>
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                aria-label="ปิดค้นหา"
                className="ms-auto text-text-secondary hover:text-text"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          ) : null}

          {/* Two shortcuts people actually reach for; the rest live in the
              box's own tooltip (item 6). */}
          <p className="mt-1 text-end text-xs text-text-muted">
            Enter ส่ง · Tab สลับผู้พูด
          </p>
        </div>
      </div>

      {/* ---- the paste preview: confirm before it lands ------------------ */}
      {pastePending ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-label="ตัวอย่างข้อความที่วาง"
            className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border border-border bg-surface p-4 shadow-xl"
          >
            <p className="text-sm font-medium">วางเป็นบทสนทนา?</p>
            <p className="mt-1 text-xs text-text-secondary">
              {count(pastePending.rows.filter((row) => row.message_type === "message").length)}{" "}
              ข้อความ ·{" "}
              {count(pastePending.rows.filter((row) => row.message_type === "separator").length)}{" "}
              ฉาก
              {pastePending.newcomers.length > 0
                ? ` · ผู้พูดใหม่เข้าแถบ: ${pastePending.newcomers.join(", ")}`
                : ""}
            </p>
            <ol className="mt-3 flex flex-1 flex-col gap-1.5 overflow-y-auto rounded-md border border-hairline bg-background p-2.5">
              {pastePending.rows.map((row, at) =>
                row.message_type === "separator" ? (
                  <li key={at} className="flex items-center gap-2 text-[11px] text-text-muted">
                    <span aria-hidden className="h-px flex-1 bg-border" />
                    คั่นฉาก
                    <span aria-hidden className="h-px flex-1 bg-border" />
                  </li>
                ) : (
                  <li
                    key={at}
                    className={`flex flex-col text-xs ${row.side === "right" ? "items-end" : "items-start"}`}
                  >
                    <span className="px-1 text-[10px] text-text-muted">{row.speaker_name}</span>
                    <span
                      className={`max-w-[90%] rounded-xl px-2.5 py-1 whitespace-pre-wrap ${
                        row.side === "right"
                          ? "bg-primary text-white"
                          : "border border-hairline bg-surface text-text"
                      }`}
                    >
                      {row.content}
                    </span>
                  </li>
                ),
              )}
            </ol>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={confirmPaste}
                className="inline-flex min-h-9 items-center rounded-md bg-primary px-3.5 text-sm font-medium text-white hover:opacity-90"
              >
                แทรกเป็นบับเบิล
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft((current) => current + pastePending.raw);
                  setPastePending(null);
                }}
                className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-sm text-text-secondary hover:text-text"
              >
                วางเป็นข้อความเดียว
              </button>
              <button
                type="button"
                onClick={() => setPastePending(null)}
                className="ms-auto text-sm text-text-secondary hover:text-text"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The avatar (visual round, items 1-3): the character's picture, or a solid
 * circle in the speaker's own muted colour wearing the generic person mark -
 * the COLOUR is the identity, the name beside it is the label, and no letter
 * doubles what the name already says. The reader's circle wears y/n.
 */
function SpeakerAvatar({
  speaker,
  size,
  ring = false,
}: {
  speaker: Speaker;
  size: number;
  /** A light ring, for when the circle sits on its own colour (active chip). */
  ring?: boolean;
}) {
  if (speaker.avatarURL) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- own media route
      <img
        src={speaker.avatarURL}
        alt=""
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, backgroundColor: speaker.color }}
      className={`flex shrink-0 items-center justify-center rounded-full text-white ${
        ring ? "ring-1 ring-white/50" : ""
      }`}
    >
      {speaker.reader ? (
        <span className="font-mono" style={{ fontSize: Math.round(size * 0.34) }}>
          y/n
        </span>
      ) : (
        <Icon name="user" size={Math.round(size * 0.55)} />
      )}
    </span>
  );
}

/**
 * The chip's settings: colour, side, display name, remove - opened from the
 * chip's avatar (or a right-click). Character preferences ride home to the
 * character record; the reader and hand-added voices keep theirs in the
 * session.
 */
function SpeakerSettings({
  speaker,
  onApply,
  onRemove,
  onClose,
}: {
  speaker: Speaker;
  onApply: (changes: SpeakerPrefs) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(speaker.name);

  function commitName() {
    const trimmed = name.trim();
    if (trimmed !== "" && trimmed !== speaker.name) onApply({ name: trimmed });
  }

  return (
    <section
      aria-label={`ตั้งค่าผู้พูด ${speaker.fullName}`}
      className="mb-2 rounded-lg border border-border bg-surface p-3"
    >
      <div className="flex items-center gap-2">
        <SpeakerAvatar speaker={speaker} size={24} />
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{speaker.fullName}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิดตั้งค่าผู้พูด"
          className="text-text-secondary hover:text-text"
        >
          <Icon name="close" size={15} />
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2.5 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-text-secondary">สี</span>
          {PALETTE.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`ใช้สี ${color}`}
              aria-pressed={speaker.color === color}
              onClick={() => onApply({ color })}
              style={{ backgroundColor: color }}
              className={`size-5 rounded-full ${
                speaker.color === color
                  ? "ring-2 ring-primary ring-offset-1 ring-offset-surface"
                  : "hover:scale-110"
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-text-secondary">ฝั่ง</span>
          {(["left", "right"] as const).map((side) => (
            <button
              key={side}
              type="button"
              aria-pressed={speaker.side === side}
              onClick={() => {
                if (speaker.side !== side) onApply({ side });
              }}
              className={`rounded-md border px-2.5 py-1 ${
                speaker.side === side
                  ? "border-primary bg-primary-50 font-medium text-primary"
                  : "border-border text-text-secondary hover:text-text"
              }`}
            >
              {side === "left" ? "ฝั่งซ้าย" : "ฝั่งขวา"}
            </button>
          ))}
          <span className="text-text-muted">มีผลทุกบับเบิลของคนนี้</span>
        </div>

        {!speaker.reader ? (
          <label className="flex items-center gap-1.5">
            <span className="text-text-secondary">ชื่อที่แสดง</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={commitName}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitName();
                }
              }}
              aria-label="ชื่อที่แสดงของผู้พูดนี้"
              className="min-h-7 w-36 rounded-md border border-border bg-background px-2 outline-none focus:border-primary"
            />
          </label>
        ) : null}

        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="text-error hover:underline"
          >
            ลบออกจากแถบ
          </button>
        ) : null}
      </div>

      <p className="mt-2 text-[11px] text-text-muted">
        {speaker.characterID
          ? "บันทึกไปที่หน้าตัวละครให้อัตโนมัติ - ทุกตอนใช้ค่าเดียวกัน"
          : speaker.reader
            ? "ผู้อ่านอยู่ฝั่งขวาตามธรรมเนียมแชท - เปลี่ยนได้ถ้าเรื่องของคุณเล่าอีกมุม"
            : "ผู้พูดชั่วคราวของตอนนี้ - สร้างเป็นตัวละครจริงได้ในหน้าตัวละคร"}
      </p>
    </section>
  );
}

/** One bubble row: avatar on the group's first line, hover tools, drag. */
function MessageRow({
  message,
  speaker,
  groupStart,
  selected,
  menuOpen,
  speakers,
  onClick,
  onEdit,
  onFlipSide,
  onReassign,
  onMenu,
  onInsertAbove,
  onInsertBelow,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onDelete,
  onDragStart,
  onDragEnd,
}: {
  message: DraftMessage;
  speaker: Speaker | undefined;
  groupStart: boolean;
  selected: boolean;
  menuOpen: boolean;
  speakers: Speaker[];
  onClick: (event: React.MouseEvent) => void;
  onEdit: () => void;
  onFlipSide: () => void;
  onReassign: (name: string) => void;
  onMenu: () => void;
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const right = message.side === "right";

  const tools = (
    // The cluster mirrors on the right side, so the ⇌ hugs the bubble and
    // the hover-only buttons extend OUTWARD - hidden buttons still occupy
    // their space, and without the mirror they shoved the ⇌ into the void.
    <span
      className={`flex items-center gap-0.5 self-stretch ${
        right ? "flex-row-reverse" : ""
      } ${groupStart ? "pt-5" : ""}`}
    >
      {/* The ⇌ from the mock: always in view, one press per SPEAKER. */}
      <button
        type="button"
        onClick={onFlipSide}
        aria-label="สลับฝั่งซ้ายขวา"
        title={`สลับฝั่งของ ${message.speaker_name} - มีผลทุกบับเบิลของคนนี้`}
        className="flex size-8 items-center justify-center rounded-md text-text-muted/60 hover:bg-surface-secondary hover:text-text"
      >
        <Icon name="swap" size={16} />
      </button>
      <span
        className={`flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 ${
          menuOpen ? "opacity-100" : ""
        }`}
      >
      <span
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        title="ลากเพื่อเรียงลำดับ"
        className="flex size-8 cursor-grab items-center justify-center rounded-md text-text-muted hover:bg-surface-secondary hover:text-text"
      >
        <Icon name="grip" size={15} />
      </span>
      <button
        type="button"
        onClick={onEdit}
        aria-label="แก้ไขข้อความนี้"
        title="แก้ไข"
        className="flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-secondary hover:text-text"
      >
        <Icon name="edit" size={15} />
      </button>
      <span className="relative">
        <button
          type="button"
          onClick={onMenu}
          aria-label="เมนูข้อความนี้"
          aria-expanded={menuOpen}
          title="เพิ่มเติม"
          className="flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-secondary hover:text-text"
        >
          <Icon name="more-horizontal" size={16} />
        </button>
        {menuOpen ? (
          <span
            className={`absolute top-full z-20 mt-1 flex w-44 flex-col rounded-md border border-border bg-surface p-1 text-[13px] shadow-lg ${
              right ? "inset-e-0" : "inset-s-0"
            }`}
          >
            <label className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-surface-secondary">
              <span className="text-text-secondary">ผู้พูด</span>
              <select
                value={speaker?.name ?? message.speaker_name}
                aria-label="เปลี่ยนผู้พูดของข้อความนี้"
                onChange={(event) => onReassign(event.target.value)}
                className="min-h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-1.5 text-xs outline-none focus:border-primary"
              >
                {speakers.map((candidate) => (
                  <option key={candidate.key} value={candidate.name}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </label>
            <MenuItem label="แทรกข้างบน" onClick={onInsertAbove} />
            <MenuItem label="แทรกข้างล่าง" onClick={onInsertBelow} />
            <MenuItem label="ทำสำเนา" onClick={onDuplicate} />
            <MenuItem label="เลื่อนขึ้น" onClick={onMoveUp} />
            <MenuItem label="เลื่อนลง" onClick={onMoveDown} />
            <MenuItem label="ลบ" tone="error" onClick={onDelete} />
          </span>
        ) : null}
      </span>
      </span>
    </span>
  );

  return (
    <div className={`flex items-start gap-2 ${right ? "flex-row-reverse" : ""}`}>
      {/* The avatar marks the group's first bubble, aligned to ITS first
          line - the name label above is why the padding compensates. */}
      <span className={`w-9 shrink-0 ${groupStart ? "pt-5" : ""}`}>
        {groupStart && speaker ? <SpeakerAvatar speaker={speaker} size={36} /> : null}
      </span>
      <div className={`flex max-w-[68%] min-w-0 flex-col ${right ? "items-end" : "items-start"}`}>
        {groupStart ? (
          <span className="mb-0.5 px-1 text-[13px] text-text-muted">
            {message.speaker_name}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onClick}
          title="คลิกเพื่อแก้ · Shift+คลิกเพื่อเลือกหลายข้อความ"
          className={`rounded-2xl px-4 py-2.5 text-start text-[15px] leading-relaxed whitespace-pre-wrap ${
            right
              ? `bg-primary text-white hover:opacity-90 ${groupStart ? "rounded-tr-1" : ""}`
              : `border border-hairline bg-surface text-text hover:bg-surface-secondary/50 ${
                  groupStart ? "rounded-tl-1" : ""
                }`
          } ${selected ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""}`}
        >
          {message.content}
        </button>
      </div>
      {tools}
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  tone,
}: {
  label: string;
  onClick: () => void;
  tone?: "error";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2 py-1.5 text-start hover:bg-surface-secondary ${
        tone === "error" ? "text-error" : ""
      }`}
    >
      {label}
    </button>
  );
}

/**
 * In-place editing: the bubble itself becomes the field, exactly where it
 * was - no separate form. Enter saves, Esc cancels; the speaker moves with
 * the row's own select.
 */
function RowEditor({
  message,
  speakers,
  grouped,
  onSave,
  onDelete,
  onCancel,
}: {
  message: DraftMessage;
  speakers: Speaker[];
  grouped: boolean;
  onSave: (changes: Partial<DraftMessage>) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(message.content);
  const [speaker, setSpeaker] = useState(message.speaker_name);
  const right = message.side === "right";

  function save() {
    const chosen = speakers.find((candidate) => candidate.name === speaker);
    onSave({
      content: text,
      ...(message.message_type === "message" && chosen
        ? { speaker_name: chosen.name, side: chosen.side }
        : {}),
    });
  }

  const field = (
    <textarea
      autoFocus
      rows={1}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          save();
        }
        if (event.key === "Escape") onCancel();
      }}
      aria-label="แก้ไขข้อความ"
      placeholder={
        message.message_type === "separator"
          ? "เช่น ผ่านไป 30 นาที"
          : message.message_type === "system"
            ? "เช่น อีกฝ่ายกำลังพิมพ์…"
            : "ข้อความ…"
      }
      className={
        message.message_type === "message"
          ? `w-full rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed outline-none ring-2 ring-primary field-sizing-content ${
              right
                ? "bg-primary text-white placeholder:text-white/60"
                : "border border-hairline bg-surface text-text"
            }`
          : "w-full rounded-md border border-primary bg-background px-3 py-2 text-center text-sm outline-none field-sizing-content"
      }
    />
  );

  if (message.message_type !== "message") {
    return (
      <div className="py-1">
        <p className="mono-label mb-1">
          {message.message_type === "separator" ? "คั่นฉาก" : "ข้อความระบบ"}
        </p>
        {field}
        <EditorFooter onSave={save} onDelete={onDelete} onCancel={onCancel} />
      </div>
    );
  }

  return (
    <div className={`flex items-start gap-2 ${right ? "flex-row-reverse" : ""}`}>
      <span className="w-9 shrink-0" />
      <div className={`flex w-full max-w-[68%] min-w-0 flex-col ${right ? "items-end" : "items-start"}`}>
        {!grouped ? (
          <span className="mb-0.5 px-1 text-xs text-text-muted">{message.speaker_name}</span>
        ) : null}
        <div className="w-full">{field}</div>
        <div className={`mt-1 flex flex-wrap items-center gap-2 ${right ? "flex-row-reverse" : ""}`}>
          <select
            value={speaker}
            onChange={(event) => setSpeaker(event.target.value)}
            aria-label="ผู้พูดของข้อความนี้"
            className="min-h-7 rounded-md border border-border bg-surface px-2 text-xs outline-none focus:border-primary"
          >
            {speakers.map((candidate) => (
              <option key={candidate.key} value={candidate.name}>
                {candidate.name}
              </option>
            ))}
            {speakers.every((candidate) => candidate.name !== speaker) ? (
              <option value={speaker}>{speaker}</option>
            ) : null}
          </select>
          <EditorFooter onSave={save} onDelete={onDelete} onCancel={onCancel} />
        </div>
      </div>
    </div>
  );
}

function EditorFooter({
  onSave,
  onDelete,
  onCancel,
}: {
  onSave: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  return (
    <span className="flex items-center gap-2 text-xs">
      <button
        type="button"
        onClick={onSave}
        className="inline-flex min-h-7 items-center rounded-md bg-primary px-2.5 font-medium text-white hover:opacity-90"
      >
        บันทึกข้อความ
      </button>
      <button type="button" onClick={onCancel} className="text-text-secondary hover:text-text">
        ยกเลิก
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label="ลบข้อความนี้"
        className="text-error hover:underline"
      >
        ลบ
      </button>
      <span className="text-text-muted">Enter บันทึก · Esc ยกเลิก</span>
    </span>
  );
}
