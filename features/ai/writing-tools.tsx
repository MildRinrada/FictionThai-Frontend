"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/ui/icon";
import {
  addLexiconTerm,
  checkCharacters,
  checkContinuity,
  checkText,
  getAiPrefs,
  getFacts,
  muteSuggestion,
  saveFacts,
  setAiPrefs,
  setCharacterEvolution,
} from "@/lib/ai-client";
import { count } from "@/lib/format";
import { runeLength } from "@/lib/outline";
import type {
  AiCharacterCheck,
  AiCharacterIssue,
  AiContinuityIssue,
  AiContinuityResult,
  AiEffectivePrefs,
  AiFact,
  AiInlineSuggestion,
  AiManuscriptMark,
} from "@/types/ai";

/**
 * เครื่องมือช่วยเขียน - the editor's side panel (13Y).
 *
 * Three cost classes, honestly labelled: the live pass runs when typing PAUSES
 * (~1.5s - never mid-word); the round checks (characters, continuity) run on
 * request, labelled "ตรวจเมื่อคุณกด" rather than promised as real-time; search
 * is its own tool (the Ctrl+K palette).
 *
 * Nothing here edits the manuscript. "ใช้คำนี้" replaces through the editor's
 * own undo stack via the host callback; every other button only teaches the
 * assistant. The panel always states its state - กำลังตรวจ / พบ N จุด /
 * ไม่พบปัญหา / ปิดอยู่ - so the writer never wonders whether it is running.
 */

/** How long typing must pause before the live pass runs (13Y §2). */
const CHECK_DEBOUNCE_MS = 1500;

/**
 * While the model tier reports queued-but-unscored lines (model_pending > 0),
 * the character round repeats at this interval to pick the finished scores
 * up (docs/AI-CONSISTENCY-MODEL.md §Asynchronous scoring).
 */
const MODEL_FOLLOW_UP_MS = 20_000;

/**
 * Upper bound on those follow-up rounds per typing pause. The pair cap is 40
 * and the sidecar scores ~8 per batch at roughly 75s a batch on an ordinary
 * CPU (measured), so a full queue drains in about 6-7 minutes - 24 rounds x
 * 20s covers it with headroom while still ending the loop if the sidecar
 * wedges. Each round is one cheap rule-pass call; the model only ever scores
 * a pair once.
 */
const MODEL_FOLLOW_UP_MAX = 24;

/** The dot colour + line style per family (13Y §3) - colour AND shape. */
const FAMILY_STYLE: Record<string, { dot: string; label: string }> = {
  spelling: { dot: "bg-error", label: "คำผิด/ไวยากรณ์" },
  punctuation: { dot: "bg-error", label: "วรรคตอน" },
  character: { dot: "bg-warning", label: "ความสอดคล้องของตัวละคร" },
  continuity: { dot: "bg-warning", label: "ความต่อเนื่อง" },
  repetition: { dot: "bg-info", label: "คำซ้ำ" },
  polish: { dot: "bg-info", label: "เกลาภาษา" },
};

function familyStyle(type: string) {
  return FAMILY_STYLE[type] ?? { dot: "bg-text-muted", label: type };
}

/** Which visual family a suggestion type belongs to (13Y §3). */
function familyOf(type: string): "error" | "consistency" | "soft" {
  if (type === "spelling" || type === "punctuation") return "error";
  if (type === "repetition" || type === "polish") return "soft";
  return "consistency";
}

/**
 * The four piles a finding can land in (docs/EDITOR.md).
 *
 * A flat list of forty cards is a list a writer scrolls once and gives up on.
 * Grouped, the panel answers the question that actually gets asked - "how much
 * of this is spelling and how much is opinion" - before anything is opened.
 *
 * The order is by how much a finding COSTS if ignored, not by how many there
 * are: a misspelling ships, a character slipping out of voice ships, and a
 * suggestion to tighten a sentence is a matter of taste that can wait.
 */
type GroupKey = "error" | "character" | "continuity" | "soft";

const GROUPS: Array<{
  key: GroupKey;
  label: string;
  dot: string;
  /**
   * Whether the group opens by itself. เกลาภาษา does not: it is the biggest
   * pile and the least urgent one, and open by default it buries the two that
   * matter.
   */
  open: boolean;
}> = [
  { key: "error", label: "คำผิดและวรรคตอน", dot: "bg-error", open: true },
  { key: "character", label: "ตัวละครอาจหลุด", dot: "bg-warning", open: true },
  {
    key: "continuity",
    label: "ความต่อเนื่อง",
    dot: "border border-dashed border-warning bg-transparent",
    open: true,
  },
  { key: "soft", label: "เกลาภาษา", dot: "bg-info/70", open: false },
];

const GROUP_OPEN: Record<GroupKey, boolean> = {
  error: true,
  character: true,
  continuity: true,
  soft: false,
};

/** One finding, whichever check produced it. */
type Finding =
  | { kind: "inline"; key: string; group: GroupKey; at: number; s: AiInlineSuggestion }
  | { kind: "character"; key: string; group: "character"; at: number; issue: AiCharacterIssue }
  | {
      kind: "continuity";
      key: string;
      group: "continuity";
      at: number;
      issue: AiContinuityIssue;
    };

/**
 * A finding's identity, shared with the manuscript's underlines.
 *
 * The panel and the in-text popover must agree on WHICH finding is selected, so
 * both sides name it the same way. It matches the dismissal key, so skipping a
 * finding from either surface silences exactly the one that was skipped.
 */
function keyOfSuggestion(s: AiInlineSuggestion): string {
  return `${s.type}:${s.original}`;
}

function keyOfIssue(issue: AiCharacterIssue): string {
  return `character:${issue.character_id}:${issue.quote}`;
}

/**
 * Where a quoted line sits in the manuscript, in the rune offsets the rest of
 * the findings are measured in - so an ordering by position can mix the two.
 * Unfound text sorts last rather than first: a quote the writer has since
 * edited away should not head the list.
 */
function runeIndexOf(haystack: string, needle: string): number {
  if (needle === "") return Number.MAX_SAFE_INTEGER;
  const at = haystack.indexOf(needle);
  return at < 0 ? Number.MAX_SAFE_INTEGER : runeLength(haystack.slice(0, at));
}

export function WritingTools({
  novelRef,
  chapterID,
  chapterNumber,
  mode,
  text,
  onApply,
  onLocate,
  onHighlight,
  selected = null,
  onSelect,
}: {
  novelRef: string;
  chapterID: string;
  chapterNumber: number;
  /** The chapter's ACTIVE mode - the rules change per mode (13Y §2). */
  mode: string;
  /** The text to check - re-checked when typing pauses. */
  text: string;
  /**
   * The finding the host has selected - set when a writer clicks an underline
   * IN the manuscript. The panel opens that finding's group and scrolls its
   * card into view, so the two surfaces are never looking at different things
   * (docs/EDITOR.md).
   */
  selected?: string | null;
  /** Told when the selection moves inside the panel, so the host can follow. */
  onSelect?: (key: string) => void;
  /**
   * Replaces one occurrence of `original` with `replacement` through the
   * editor's own undo stack. Absent (chat/headcanon panes), "ใช้คำนี้" hides.
   */
  onApply?: (original: string, replacement: string) => boolean;
  /** Scrolls to and selects `original` in the editor, without changing it. */
  onLocate?: (original: string) => void;
  /**
   * Publishes the current findings for the host to underline IN the
   * manuscript (CSS Highlights - no DOM mutation) and to serve from the
   * in-text quick-fix popover. Families: error = spelling/punctuation,
   * consistency = character/continuity citations, soft = repetition/polish.
   */
  onHighlight?: (marks: AiManuscriptMark[]) => void;
}) {
  const [prefs, setPrefs] = useState<AiEffectivePrefs | null>(null);
  const [quiet, setQuiet] = useState(false);
  const [checking, setChecking] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [suggestions, setSuggestions] = useState<AiInlineSuggestion[] | null>(null);
  const [hiddenTotal, setHiddenTotal] = useState(0);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  /** Which groups the writer has opened or closed by hand; the rest use GROUP_OPEN. */
  const [groupOpen, setGroupOpen] = useState<Partial<Record<GroupKey, boolean>>>({});
  /** The finding picked inside the panel, when the host is not driving. */
  const [ownPick, setOwnPick] = useState<string | null>(null);
  /** เขียนเงียบชั่วคราว: the list is put away, the checks keep running (docs/EDITOR.md). */
  const [listOpen, setListOpen] = useState(true);

  const [characterResult, setCharacterResult] = useState<AiCharacterCheck | null>(null);
  const [characterBusy, setCharacterBusy] = useState(false);
  const [continuityResult, setContinuityResult] = useState<AiContinuityResult | null>(null);
  const [continuityBusy, setContinuityBusy] = useState(false);

  const [facts, setFacts] = useState<AiFact[] | null>(null);
  const [factsSaving, setFactsSaving] = useState(false);

  const timer = useRef<number | null>(null);
  const followUp = useRef<number | null>(null);
  const runSeq = useRef(0);

  // The switches, loaded once. An event-driven load keeps the effect free of
  // setState loops: this effect runs once on mount.
  useEffect(() => {
    let alive = true;
    getAiPrefs(novelRef)
      .then((view) => {
        if (alive) setPrefs(view.effective);
      })
      .catch(() => {
        if (alive) setPrefs(null);
      });
    return () => {
      alive = false;
    };
  }, [novelRef]);

  // The live pass: debounced until typing PAUSES. The timer resets on every
  // text change; the fetch itself happens inside the timeout. The character
  // round rides the same pause - it is local server rules over the cast, not
  // model work, so the writer sees it react to what they just wrote instead
  // of hunting for a button.
  useEffect(() => {
    if (quiet || prefs === null || !prefs.assistant) return;
    if (timer.current !== null) window.clearTimeout(timer.current);
    const seq = ++runSeq.current;
    const wantCharacter = prefs.character;
    // Every state change happens inside the timeout, keeping the effect body
    // itself free of setState (the React Compiler contract).
    timer.current = window.setTimeout(() => {
      if (runSeq.current !== seq) return;
      setChecking(true);
      const live = checkText(novelRef, mode, text)
        .then((result) => {
          if (runSeq.current !== seq) return;
          setDisabled(Boolean(result.disabled));
          setSuggestions(result.suggestions);
          setHiddenTotal(
            (result.overflow ?? []).reduce((sum, o) => sum + o.hidden, 0),
          );
          setDismissed(new Set());
        })
        .catch(() => {
          if (runSeq.current === seq) setSuggestions(null);
        });
      // The model tier scores asynchronously on writer hardware
      // (docs/AI-CONSISTENCY-MODEL.md): while the answer says lines are
      // still queued (model_pending > 0), keep asking on a timer - a writer
      // who pastes a whole scene and stops typing must still see every
      // finding when the queue finally drains, not only the first batch.
      const scheduleModelFollowUp = (result: AiCharacterCheck, round: number) => {
        if (!((result.model_pending ?? 0) > 0) || round >= MODEL_FOLLOW_UP_MAX) return;
        if (followUp.current !== null) window.clearTimeout(followUp.current);
        followUp.current = window.setTimeout(() => {
          if (runSeq.current !== seq) return;
          checkCharacters(novelRef, chapterNumber, text)
            .then((late) => {
              if (runSeq.current !== seq) return;
              setCharacterResult(late);
              scheduleModelFollowUp(late, round + 1);
            })
            .catch(() => {});
        }, MODEL_FOLLOW_UP_MS);
      };
      const cast = wantCharacter
        ? checkCharacters(novelRef, chapterNumber, text)
            .then((result) => {
              if (runSeq.current !== seq) return;
              setCharacterResult(result);
              scheduleModelFollowUp(result, 0);
            })
            .catch(() => {})
        : Promise.resolve();
      void Promise.allSettled([live, cast]).then(() => {
        if (runSeq.current === seq) setChecking(false);
      });
    }, CHECK_DEBOUNCE_MS);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [text, mode, novelRef, chapterNumber, quiet, prefs]);

  // Memoized so the marks effect below re-fires exactly when findings change.
  const visible = useMemo(
    () =>
      (suggestions ?? []).filter((s) => !dismissed.has(`${s.type}:${s.original}`)),
    [suggestions, dismissed],
  );
  const spellCount = visible.filter(
    (s) => s.type === "spelling" || s.type === "punctuation",
  ).length;
  const polishCount = visible.filter(
    (s) => s.type === "polish" || s.type === "repetition",
  ).length;

  const assistantOff = disabled || (prefs !== null && !prefs.assistant);

  /**
   * Every finding, in ONE list, ordered by where it sits in the manuscript.
   *
   * Position rather than severity, because that is the order revision happens
   * in: a writer works top to bottom through their own chapter, and a list
   * sorted by how bad each finding is makes them jump around their document to
   * follow it (docs/EDITOR.md).
   */
  const findings = useMemo<Finding[]>(() => {
    const out: Finding[] = [];
    for (const s of visible) {
      const family = familyOf(s.type);
      out.push({
        kind: "inline",
        key: keyOfSuggestion(s),
        group: family === "error" ? "error" : family === "soft" ? "soft" : "character",
        at: s.start,
        s,
      });
    }
    for (const issue of characterResult?.issues ?? []) {
      out.push({
        kind: "character",
        key: keyOfIssue(issue),
        group: "character",
        at: runeIndexOf(text, issue.quote),
        issue,
      });
    }
    for (const issue of continuityResult?.issues ?? []) {
      // Continuity compares the fact book against earlier chapters, so it has
      // no place in THIS text to point at - it sorts to the end of its group.
      out.push({
        kind: "continuity",
        key: `continuity:${issue.label}`,
        group: "continuity",
        at: Number.MAX_SAFE_INTEGER,
        issue,
      });
    }
    return out.sort((a, b) => a.at - b.at);
  }, [visible, characterResult, continuityResult, text]);

  /**
   * The selected finding. The host wins when it has one (a click on an
   * underline), then the panel's own pick, then the first finding in a group
   * that opens by itself - never a เกลาภาษา suggestion, which would prise the
   * quiet group open on arrival.
   */
  const has = (key: string | null) =>
    key !== null && findings.some((finding) => finding.key === key) ? key : null;
  const activeKey =
    has(selected) ??
    has(ownPick) ??
    findings.find((finding) => GROUP_OPEN[finding.group])?.key ??
    findings[0]?.key ??
    null;
  const activeGroup = findings.find((finding) => finding.key === activeKey)?.group ?? null;

  function select(finding: Finding) {
    setOwnPick(finding.key);
    onSelect?.(finding.key);
    // Selecting a finding puts the writer AT it - the card and the manuscript
    // are two views of one place.
    if (finding.kind !== "continuity") {
      onLocate?.(finding.kind === "inline" ? finding.s.original : finding.issue.quote);
    }
  }

  // Every current finding, published to the host as underline marks CARRYING
  // their popover actions - the same closures the panel's card uses, so the
  // in-text quick fix and the panel can never disagree. Quiet mode and the
  // master switch blank the manuscript too - the reader-facing promise ("no
  // marks anywhere outside the studio") extends to a writer who asked for
  // silence.
  const onHighlightRef = useRef(onHighlight);
  onHighlightRef.current = onHighlight;
  useEffect(() => {
    const publish = onHighlightRef.current;
    if (!publish) return;
    if (quiet || assistantOff) {
      publish([]);
      return;
    }
    const marks: AiManuscriptMark[] = [];
    for (const s of visible) {
      marks.push({
        key: keyOfSuggestion(s),
        text: s.original,
        start: s.start,
        family: familyOf(s.type),
        label: familyStyle(s.type).label,
        suggestion: s.suggestions[0],
        explanation: s.explanation,
        onApplyFix:
          onApply && s.suggestions.length > 0 ? () => apply(s) : undefined,
        onSkip: () => dismiss(s),
        onMute: () => void mute(s),
      });
    }
    for (const issue of characterResult?.issues ?? []) {
      marks.push({
        key: keyOfIssue(issue),
        text: issue.quote,
        family: "consistency",
        label: "ความสอดคล้องของตัวละคร",
        explanation: issue.explanation,
      });
    }
    publish(marks);
    // The action closures capture this render's state on purpose; the
    // findings themselves are the dependency that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, characterResult, quiet, assistantOff]);
  useEffect(() => {
    return () => onHighlightRef.current?.([]);
  }, []);

  // Continuity still runs once when the panel opens (it reads the fact book,
  // not the text, so typing cannot change its answer). The button re-runs it.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || prefs === null || assistantOff || quiet) return;
    autoRan.current = true;
    if (prefs.continuity === true) {
      window.setTimeout(() => void runContinuity(), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs, assistantOff, quiet]);

  /**
   * กดที่แถวแล้วไปเลย: clicking a ตรวจทาน row warps straight to that
   * family's next spot in the manuscript, cycling on repeated clicks. The
   * row IS the jump control - no separate "ไปที่จุดนี้" box.
   */
  const jumpCursor = useRef<Record<string, number>>({});
  function jumpFamily(family: "error" | "soft") {
    if (!onLocate) return;
    const list = visible.filter((s) => familyOf(s.type) === family);
    if (list.length === 0) return;
    const at = ((jumpCursor.current[family] ?? -1) + 1) % list.length;
    jumpCursor.current[family] = at;
    onLocate(list[at].original);
    const key = keyOfSuggestion(list[at]);
    setOwnPick(key);
    onSelect?.(key);
  }
  function jumpCharacter() {
    if (!onLocate) return;
    const issues = characterResult?.issues ?? [];
    if (issues.length === 0) return;
    const at = ((jumpCursor.current.character ?? -1) + 1) % issues.length;
    jumpCursor.current.character = at;
    onLocate(issues[at].quote);
    const key = keyOfIssue(issues[at]);
    setOwnPick(key);
    onSelect?.(key);
  }

  /** One switch of one tier: writes the novel override, keeps the UI honest. */
  async function toggleTool(
    key: "spell" | "character" | "continuity" | "polish",
    next: boolean,
  ) {
    const before = prefs;
    if (before) setPrefs({ ...before, [key]: next });
    try {
      const view = await setAiPrefs({ [key]: next }, novelRef);
      setPrefs(view.effective);
      if (key === "continuity" && next) void runContinuity();
      if (key === "character" && next) void runCharacterCheck();
    } catch {
      setPrefs(before);
      flashNotice("บันทึกการตั้งค่าไม่สำเร็จ");
    }
  }

  function flashNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2500);
  }

  function dismiss(s: AiInlineSuggestion) {
    setDismissed((current) => new Set(current).add(`${s.type}:${s.original}`));
  }

  async function mute(s: AiInlineSuggestion) {
    dismiss(s);
    try {
      await muteSuggestion(s.type, s.original, novelRef);
      flashNotice("จะไม่เตือนแบบนี้อีกในเรื่องนี้");
    } catch {
      flashNotice("บันทึกไม่สำเร็จ");
    }
  }

  async function teach(s: AiInlineSuggestion) {
    dismiss(s);
    try {
      await addLexiconTerm(novelRef, s.original);
      flashNotice(`เพิ่ม «${s.original}» ในคลังคำของเรื่องแล้ว`);
    } catch {
      flashNotice("บันทึกไม่สำเร็จ");
    }
  }

  function apply(s: AiInlineSuggestion) {
    if (!onApply || s.suggestions.length === 0) return;
    if (onApply(s.original, s.suggestions[0])) {
      dismiss(s);
    } else {
      flashNotice("หาตำแหน่งข้อความไม่เจอ - อาจถูกแก้ไปแล้ว");
    }
  }

  /**
   * ยอมรับทั้งหมด, and only for the spelling pile (docs/EDITOR.md).
   *
   * A misspelling has one right answer and nobody wants to press a button
   * twelve times to say so. เกลาภาษา never gets this: those are opinions about
   * an author's voice, and a single press that rewrote thirty sentences of
   * someone's prose is exactly the thing the AI rules forbid (docs/12 §15).
   *
   * Each correction still goes through the host's callback and the editor's own
   * undo stack, so one Ctrl+Z per fix takes it back.
   */
  function applyAll(items: Finding[]) {
    if (!onApply) return;
    const done = new Set<string>();
    let applied = 0;
    for (const finding of items) {
      if (finding.kind !== "inline" || finding.s.suggestions.length === 0) continue;
      if (done.has(finding.key)) continue;
      done.add(finding.key);
      if (onApply(finding.s.original, finding.s.suggestions[0])) {
        applied += 1;
        dismiss(finding.s);
      }
    }
    flashNotice(
      applied > 0
        ? `แก้ให้แล้ว ${count(applied)} จุด - กด Ctrl+Z ย้อนได้ทีละจุด`
        : "หาตำแหน่งข้อความไม่เจอ - อาจถูกแก้ไปแล้ว",
    );
  }

  async function runCharacterCheck() {
    setCharacterBusy(true);
    try {
      setCharacterResult(await checkCharacters(novelRef, chapterNumber, text));
    } catch {
      flashNotice("ตรวจตัวละครไม่สำเร็จ");
    } finally {
      setCharacterBusy(false);
    }
  }

  async function evolve(characterID: string) {
    try {
      await setCharacterEvolution(novelRef, characterID, chapterNumber);
      flashNotice(`เลิกเทียบกับข้อมูลเดิมตั้งแต่ตอนที่ ${chapterNumber} แล้ว`);
      await runCharacterCheck();
    } catch {
      flashNotice("บันทึกไม่สำเร็จ");
    }
  }

  async function runContinuity() {
    setContinuityBusy(true);
    try {
      setContinuityResult(await checkContinuity(novelRef, chapterID));
    } catch {
      flashNotice("ตรวจความต่อเนื่องไม่สำเร็จ");
    } finally {
      setContinuityBusy(false);
    }
  }

  async function openFacts() {
    if (facts !== null) {
      setFacts(null);
      return;
    }
    try {
      setFacts(await getFacts(novelRef, chapterID));
    } catch {
      setFacts([]);
    }
  }

  async function persistFacts(next: AiFact[]) {
    setFactsSaving(true);
    try {
      setFacts(await saveFacts(novelRef, chapterID, next));
      flashNotice("บันทึกสมุดข้อเท็จจริงแล้ว");
    } catch {
      flashNotice("บันทึกไม่สำเร็จ");
    } finally {
      setFactsSaving(false);
    }
  }

  // The status chip: the writer must always know which state the system is in
  // (13Y §10). ONE vocabulary, here and on every row below (chat-editor
  // review item 6): ยังไม่ตรวจ / กำลังตรวจ / ไม่พบปัญหา / พบ N จุด / ปิดอยู่.
  const status = assistantOff
    ? { label: "ปิดอยู่", tone: "text-text-muted" }
    : quiet
      ? { label: "โหมดเขียนเงียบ", tone: "text-text-muted" }
      : checking
        ? { label: "กำลังตรวจ…", tone: "text-text-secondary" }
        : suggestions === null
          ? { label: "ยังไม่ตรวจ", tone: "text-text-muted" }
          : visible.length > 0
            ? { label: `พบ ${visible.length} จุด`, tone: "text-warning" }
            : { label: "ไม่พบปัญหา", tone: "text-success" };

  return (
    <section
      aria-label="เครื่องมือช่วยเขียน"
      className="rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="mono-label">เครื่องมือช่วยเขียน</p>
        <span aria-live="polite" className={`text-xs font-medium ${status.tone}`}>
          {status.label}
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">
        ทุกเครื่องมือเสนอเป็นข้อเสนอแนะ ไม่แก้งานของคุณเอง
      </p>

      <label className="mt-3 flex w-fit items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={quiet}
          onChange={(event) => setQuiet(event.target.checked)}
          className="size-3.5 accent-primary"
        />
        โหมดเขียนเงียบ - พักการเตือนทั้งหมดชั่วคราว
      </label>

      {notice ? (
        <p aria-live="polite" className="mt-2 rounded-md bg-primary-50 px-2.5 py-1.5 text-xs text-primary">
          {notice}
        </p>
      ) : null}

      {assistantOff ? (
        <p className="mt-3 rounded-md border border-border px-3 py-2.5 text-xs text-text-secondary">
          ผู้ช่วยปิดอยู่ - เปิดได้ในการตั้งค่าเรื่องหรือการตั้งค่าบัญชี
          การเขียนและบันทึกทำงานปกติ
        </p>
      ) : quiet ? null : (
        <>
          {/* ตรวจทาน - per-family rows, each with its OWN switch right here
              (novel-tier prefs), so turning one tool on or off never requires
              leaving the editor or silencing everything. */}
          <p className="mono-label mt-4">ตรวจทาน</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-[13px]">
            <ToolRow
              dotClass="bg-error"
              label="ตรวจคำผิดและไวยากรณ์"
              status={
                prefs?.spell === false
                  ? "ปิดอยู่"
                  : spellCount > 0
                    ? `พบ ${spellCount} จุด`
                    : suggestions
                      ? "ไม่พบปัญหา"
                      : "ยังไม่ตรวจ"
              }
              on={prefs?.spell !== false}
              onToggle={(next) => void toggleTool("spell", next)}
              onJump={spellCount > 0 ? () => jumpFamily("error") : undefined}
            />
            <ToolRow
              dotClass="bg-warning"
              label="ตรวจความสอดคล้องของตัวละคร"
              status={
                prefs?.character === false
                  ? "ปิดอยู่"
                  : characterResult
                    ? characterResult.issues.length > 0
                      ? `พบ ${characterResult.issues.length} จุด`
                      : // ไม่พบปัญหา with zero checkable characters would be a
                        // pass that never sat the exam (item 6).
                        characterResult.checkable === 0
                        ? "ตรวจไม่ได้"
                        : "ไม่พบปัญหา"
                    : "ยังไม่ตรวจ"
              }
              on={prefs?.character !== false}
              onToggle={(next) => void toggleTool("character", next)}
              onJump={
                (characterResult?.issues.length ?? 0) > 0 ? jumpCharacter : undefined
              }
            />
            <ToolRow
              dotClass="border border-warning border-dashed bg-transparent"
              label="ตรวจความต่อเนื่องของเนื้อเรื่อง"
              status={
                prefs?.continuity !== true
                  ? "ปิดอยู่"
                  : continuityResult && continuityResult.checked
                    ? continuityResult.issues.length > 0
                      ? `พบ ${continuityResult.issues.length} จุด`
                      : "ไม่พบปัญหา"
                    : "ยังไม่ตรวจ"
              }
              on={prefs?.continuity === true}
              onToggle={(next) => void toggleTool("continuity", next)}
            />
            <ToolRow
              dotClass="bg-info/70"
              label="เกลาภาษา"
              hint={
                mode !== "standard"
                  ? "ภาษาพูดในบทแชทไม่ถือเป็นข้อผิดพลาด จึงไม่มีอะไรให้เกลา"
                  : undefined
              }
              status={
                mode !== "standard"
                  ? "ไม่ใช้ในโหมดนี้"
                  : prefs?.polish === false
                    ? "ปิดอยู่"
                    : polishCount > 0
                      ? `พบ ${polishCount} จุด`
                      : suggestions
                        ? "ไม่พบปัญหา"
                        : "ยังไม่ตรวจ"
              }
              on={mode === "standard" && prefs?.polish !== false}
              disabled={mode !== "standard"}
              onToggle={(next) => void toggleTool("polish", next)}
              onJump={polishCount > 0 ? () => jumpFamily("soft") : undefined}
            />
          </ul>

          {/*
            The findings, grouped and collapsible (docs/EDITOR.md).

            This was one card at a time behind a pair of arrows, which on a
            chapter with forty findings meant forty presses to see what was
            wrong with it. Now the counts are readable before anything is
            opened, and each pile can be put away whole.
          */}
          {findings.length > 0 ? (
            <div className="mt-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-text-secondary">
                  {count(findings.length)} จุดในตอนนี้
                  {hiddenTotal > 0 ? ` (+${count(hiddenTotal)} ที่ถูกรวบไว้)` : ""}
                </p>
                <button
                  type="button"
                  aria-expanded={listOpen}
                  onClick={() => setListOpen((open) => !open)}
                  className="text-xs text-text-secondary hover:text-text"
                >
                  {listOpen ? "ซ่อนรายการ" : "แสดงรายการ"}
                </button>
              </div>

              {listOpen ? (
                <div className="mt-2 flex flex-col gap-1.5">
                  {GROUPS.map((group) => {
                    const items = findings.filter((finding) => finding.group === group.key);
                    if (items.length === 0) return null;
                    const open =
                      groupOpen[group.key] ??
                      (group.open || activeGroup === group.key);
                    const fixable = items.filter(
                      (item) => item.kind === "inline" && item.s.suggestions.length > 0,
                    );

                    return (
                      <section
                        key={group.key}
                        className="rounded-md border border-border bg-background"
                      >
                        <h3 className="flex items-center">
                          <button
                            type="button"
                            aria-expanded={open}
                            // Spelled out: read aloud, "คำผิดและวรรคตอน 12"
                            // runs the label into the number.
                            aria-label={`${group.label} ${items.length} จุด`}
                            onClick={() =>
                              setGroupOpen((current) => ({
                                ...current,
                                [group.key]: !open,
                              }))
                            }
                            className="flex min-h-9 flex-1 items-center gap-1.5 px-2.5 text-start text-[13px] font-medium"
                          >
                            <Icon
                              name={open ? "chevron-down" : "chevron-right"}
                              size={14}
                              className="shrink-0 text-text-muted"
                            />
                            <span aria-hidden className={`size-2 rounded-full ${group.dot}`} />
                            <span className="min-w-0 truncate">{group.label}</span>
                            <span className="ms-auto text-xs font-normal text-text-secondary tabular-nums">
                              {count(items.length)}
                            </span>
                          </button>
                        </h3>

                        {open ? (
                          <div className="border-t border-hairline">
                            {/* ยอมรับทั้งหมด lives on the spelling pile alone. */}
                            {group.key === "error" && onApply && fixable.length > 1 ? (
                              <div className="px-2.5 py-2">
                                <button
                                  type="button"
                                  onClick={() => applyAll(items)}
                                  className="inline-flex min-h-8 w-full items-center justify-center gap-1.5 rounded-md border border-primary-200 bg-primary-50 px-2.5 text-xs font-medium text-primary hover:opacity-90"
                                >
                                  <Icon name="check" size={13} />
                                  ยอมรับทั้งหมด {count(fixable.length)} จุด
                                </button>
                              </div>
                            ) : null}

                            <ul className="flex flex-col">
                              {items.map((finding, at) => (
                                <FindingRow
                                  key={`${finding.key}#${at}`}
                                  finding={finding}
                                  active={finding.key === activeKey}
                                  novelRef={novelRef}
                                  canApply={Boolean(onApply)}
                                  onSelect={() => select(finding)}
                                  onApply={apply}
                                  onSkip={dismiss}
                                  onMute={mute}
                                  onTeach={teach}
                                  onEvolve={(id) => void evolve(id)}
                                />
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* The character round now rides the typing pause (local rules,
              not model work); this button is the manual re-run. */}
          <div className="mt-4 border-t border-hairline pt-3">
            <button
              type="button"
              disabled={characterBusy || prefs?.character === false}
              onClick={() => void runCharacterCheck()}
              className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md border border-border px-3 text-xs text-text-secondary hover:border-primary-200 hover:text-text disabled:opacity-50"
            >
              <Icon name="users" size={14} />
              {characterBusy ? "กำลังตรวจตัวละคร…" : "ตรวจตัวละครอีกครั้ง"}
            </button>

            {characterResult ? (
              <div className="mt-2 text-xs">
                {characterResult.checkable === 0 && characterResult.total > 0 ? (
                  // No data means NO verdict (item 6) - so this says so, and
                  // offers the one move that changes it as a real button.
                  <>
                    <p className="text-warning">
                      ตรวจไม่ได้ - ตัวละครยังไม่มีข้อมูล (0/{characterResult.total})
                    </p>
                    <Link
                      href={`/studio/novels/${encodeURIComponent(novelRef)}/characters`}
                      className="mt-1.5 inline-flex min-h-8 items-center gap-1.5 rounded-md border border-primary-200 bg-primary-50 px-2.5 text-xs font-medium text-primary hover:opacity-90"
                    >
                      <Icon name="users" size={13} />
                      ไปเพิ่มข้อมูลตัวละคร
                    </Link>
                  </>
                ) : (
                  <p className="text-text-secondary">
                    ตรวจได้ {characterResult.checkable} จาก {characterResult.total} ตัวละคร
                    {characterResult.skipped.some((s) => s.reason.includes("เพิ่มนิสัย")) ? (
                      <>
                        {" · "}
                        <Link
                          href={`/studio/novels/${encodeURIComponent(novelRef)}/characters`}
                          className="text-primary hover:underline"
                        >
                          เพิ่มข้อมูลเพื่อให้ตรวจได้แม่นขึ้น
                        </Link>
                      </>
                    ) : null}
                  </p>
                )}
                {(characterResult.model_pending ?? 0) > 0 ? (
                  <p className="mt-1 flex items-center gap-1.5 text-text-secondary">
                    <span
                      aria-hidden
                      className="inline-block h-3 w-3 animate-spin rounded-full border border-border border-t-primary"
                    />
                    โมเดลภาษากำลังอ่านอีก {characterResult.model_pending} บรรทัด
                    - ผลจะขึ้นที่นี่เอง
                  </p>
                ) : null}
                {/* The findings themselves are in ตัวละครอาจหลุด above; this
                    line is about COVERAGE, which the group cannot state. It
                    never shows with zero checkable characters - a clean bill
                    from a check that never ran is the contradiction item 6
                    called out. */}
                {characterResult.issues.length === 0 && characterResult.checkable > 0 ? (
                  <p className="mt-1 text-success">ไม่พบจุดที่อาจไม่สอดคล้อง</p>
                ) : null}
              </div>
            ) : null}

            {/* With the tool off, the button ENABLES it (item 6): a disabled
                button telling the user to go press a different control is the
                machine describing its own job. */}
            <button
              type="button"
              disabled={continuityBusy}
              onClick={() => {
                if (prefs?.continuity !== true) void toggleTool("continuity", true);
                else void runContinuity();
              }}
              className="mt-2 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md border border-border px-3 text-xs text-text-secondary hover:border-primary-200 hover:text-text disabled:opacity-50"
            >
              <Icon name="clock" size={14} />
              {continuityBusy
                ? "กำลังตรวจความต่อเนื่อง…"
                : prefs?.continuity !== true
                  ? "เปิดการตรวจความต่อเนื่อง"
                  : "ตรวจความต่อเนื่อง (จากสมุดข้อเท็จจริง)"}
            </button>

            {continuityResult && prefs?.continuity === true ? (
              <div className="mt-2 text-xs">
                {!continuityResult.checked ? (
                  <p className="text-text-secondary">
                    ยังไม่ได้ตรวจ - บันทึกข้อเท็จจริงของตอนนี้ก่อน
                    แล้วระบบจะเทียบกับตอนก่อนหน้าให้
                  </p>
                ) : continuityResult.issues.length === 0 ? (
                  <p className="text-success">ไม่พบข้อขัดแย้งกับตอนก่อนหน้า</p>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* The fact book (13Y §6) - writer-owned, useful in itself. A real
              button like its neighbours (item 6), not a floating line. */}
          <div className="mt-3 border-t border-hairline pt-3">
            <button
              type="button"
              aria-expanded={facts !== null}
              onClick={() => void openFacts()}
              className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md border border-border px-3 text-xs text-text-secondary hover:border-primary-200 hover:text-text"
            >
              <Icon name="book" size={14} />
              {facts === null ? "เปิดสมุดข้อเท็จจริงของตอนนี้" : "ปิดสมุดข้อเท็จจริง"}
            </button>
            {facts !== null ? (
              <FactBook facts={facts} saving={factsSaving} onSave={persistFacts} />
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

/**
 * One ตรวจทาน row: family dot, name, verdict, and the tool's own switch.
 * The switch writes the FICTION's override tier - the same value the settings
 * page edits - so "เปิดตรงนี้" and "เปิดในตั้งค่า" can never disagree.
 */
function ToolRow({
  dotClass,
  label,
  status,
  on,
  disabled,
  onToggle,
  onJump,
  hint,
}: {
  dotClass: string;
  label: string;
  status: string;
  on: boolean;
  disabled?: boolean;
  onToggle: (next: boolean) => void;
  /** When findings exist, clicking the row NAME warps to the next one. */
  onJump?: () => void;
  /** Why the status says what it says, on hover (item 6's เกลาภาษา ask). */
  hint?: string;
}) {
  // One tone per vocabulary word: findings warn, a clean pass reassures,
  // "cannot check" warns (it is actionable), and the rest stay quiet.
  const tone = status.startsWith("พบ")
    ? "text-warning"
    : status === "ไม่พบปัญหา"
      ? "text-success"
      : status === "ตรวจไม่ได้"
        ? "text-warning"
        : "text-text-muted";
  return (
    <li className="flex items-center gap-2" title={hint}>
      <span aria-hidden className={`size-2 rounded-full ${dotClass}`} />
      {onJump ? (
        <button
          type="button"
          onClick={onJump}
          title="กดเพื่อไปยังจุดที่พบในเนื้อหา"
          className="min-w-0 flex-1 truncate text-start hover:text-primary hover:underline"
        >
          {label}
        </button>
      ) : (
        <span className="min-w-0 flex-1 truncate">{label}</span>
      )}
      <span className={`text-xs ${tone}`}>{status}</span>
      <input
        type="checkbox"
        role="switch"
        aria-label={`เปิดปิด${label}`}
        checked={on}
        disabled={disabled}
        onChange={(event) => onToggle(event.target.checked)}
        className="size-3.5 accent-primary disabled:opacity-40"
      />
    </li>
  );
}

/**
 * One finding in a group.
 *
 * Closed it is a single line - what is wrong, and what it would become - which
 * is what makes forty of them scannable. Selected it opens into the card the
 * panel used to show one of at a time: the reason, and the writer's three
 * answers to it. Only the selected row carries the buttons, so a mis-click
 * cannot accept a correction the writer never read.
 *
 * The row itself is the jump control (13Y): pressing it selects the finding AND
 * moves the manuscript to it.
 */
function FindingRow({
  finding,
  active,
  novelRef,
  canApply,
  onSelect,
  onApply,
  onSkip,
  onMute,
  onTeach,
  onEvolve,
}: {
  finding: Finding;
  active: boolean;
  novelRef: string;
  canApply: boolean;
  onSelect: () => void;
  onApply: (s: AiInlineSuggestion) => void;
  onSkip: (s: AiInlineSuggestion) => void;
  onMute: (s: AiInlineSuggestion) => void;
  onTeach: (s: AiInlineSuggestion) => void;
  onEvolve: (characterID: string) => void;
}) {
  const row = useRef<HTMLLIElement>(null);

  // A finding selected from the MANUSCRIPT may be far down a long group, so the
  // panel scrolls to meet it. No state is touched: the panel is following the
  // selection, not deciding it.
  useEffect(() => {
    const node = row.current;
    // Guarded rather than assumed: not every environment implements it, and a
    // panel that throws while scrolling would take the whole editor with it.
    if (active && typeof node?.scrollIntoView === "function") {
      node.scrollIntoView({ block: "nearest" });
    }
  }, [active]);

  return (
    <li
      ref={row}
      className={`border-t border-hairline first:border-t-0 ${
        active ? "bg-primary-50/60" : ""
      }`}
    >
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        onClick={onSelect}
        className="flex w-full items-start gap-1.5 px-2.5 py-2 text-start text-[13px] hover:bg-surface-secondary"
      >
        {finding.kind === "inline" ? (
          <span className="min-w-0 flex-1">
            <span className="rounded-sm bg-error/10 px-1 line-through decoration-error/60">
              {finding.s.original}
            </span>
            {finding.s.suggestions.length > 0 ? (
              <>
                {" → "}
                <span className="rounded-sm bg-success/10 px-1 font-medium">
                  {finding.s.suggestions[0]}
                </span>
              </>
            ) : null}
          </span>
        ) : finding.kind === "character" ? (
          <span className="min-w-0 flex-1">
            <span className="font-medium">«{finding.issue.character_name}»</span>{" "}
            <span className="text-text-secondary">{finding.issue.field}</span>
          </span>
        ) : (
          <span className="min-w-0 flex-1">
            <span className="font-medium">{finding.issue.label}</span>{" "}
            <span className="text-text-secondary">
              ตอนที่ {finding.issue.previous_chapter}: {finding.issue.previous_value}
            </span>
          </span>
        )}
      </button>

      {active ? (
        <div className="px-2.5 pb-2.5 text-xs">
          {finding.kind === "inline" ? (
            <>
              <p className="text-text-secondary">{finding.s.explanation}</p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {canApply && finding.s.suggestions.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => onApply(finding.s)}
                    className="font-medium text-primary hover:underline"
                  >
                    ใช้คำนี้
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onSkip(finding.s)}
                  className="text-text-secondary hover:text-text"
                >
                  ข้าม
                </button>
                <button
                  type="button"
                  onClick={() => onMute(finding.s)}
                  className="text-text-secondary hover:text-text"
                >
                  ไม่เตือนแบบนี้อีก
                </button>
                {finding.s.type === "spelling" ? (
                  <button
                    type="button"
                    onClick={() => onTeach(finding.s)}
                    className="text-text-secondary hover:text-text"
                  >
                    เพิ่มคำนี้ในคลังของเรื่อง
                  </button>
                ) : null}
              </div>
            </>
          ) : finding.kind === "character" ? (
            <>
              {/* The citation is the whole point (13Y §5): a warning a writer
                  cannot trace back to something they wrote down themselves is
                  a warning they switch off. */}
              <p>
                «{finding.issue.character_name}» ระบุ{finding.issue.field}:{" "}
                <Link
                  href={`/studio/novels/${encodeURIComponent(novelRef)}/characters`}
                  className="font-medium text-primary hover:underline"
                >
                  {finding.issue.field_value}
                </Link>
              </p>
              <blockquote className="mt-1 border-s-2 border-warning/50 ps-2 text-text-secondary">
                {finding.issue.quote}
              </blockquote>
              <p className="mt-1 text-text-secondary">{finding.issue.explanation}</p>
              <button
                type="button"
                onClick={() => onEvolve(finding.issue.character_id)}
                className="mt-1.5 text-primary hover:underline"
              >
                ตัวละครเปลี่ยนไปตั้งแต่ตอนนี้ - เลิกเทียบกับข้อมูลเดิม
              </button>
            </>
          ) : (
            <p className="text-text-secondary">{finding.issue.explanation}</p>
          )}
        </div>
      ) : null}
    </li>
  );
}

function FactBook({
  facts,
  saving,
  onSave,
}: {
  facts: AiFact[];
  saving: boolean;
  onSave: (facts: AiFact[]) => void;
}) {
  const [rows, setRows] = useState<AiFact[]>(facts);

  return (
    <div className="mt-2 text-xs">
      <p className="text-text-secondary">
        ใครอยู่ที่ไหน ใครรู้อะไรแล้ว ของสำคัญอยู่กับใคร -
        การตรวจความต่อเนื่องเทียบกับรายการนี้ ไม่ใช่กับข้อความดิบ
      </p>
      <div className="mt-2 flex flex-col gap-1.5">
        {rows.map((fact, index) => (
          <div key={index} className="flex gap-1.5">
            <input
              value={fact.label}
              onChange={(event) =>
                setRows(rows.map((row, i) =>
                  i === index ? { ...row, label: event.target.value } : row,
                ))
              }
              placeholder="เรื่อง เช่น ดาบของคาซึฮะ"
              aria-label={`ข้อเท็จจริงที่ ${index + 1}`}
              className="min-h-8 w-2/5 rounded-md border border-border px-2 outline-none focus:border-primary"
            />
            <input
              value={fact.value}
              onChange={(event) =>
                setRows(rows.map((row, i) =>
                  i === index ? { ...row, value: event.target.value } : row,
                ))
              }
              placeholder="สถานะ เช่น หายไปแล้ว"
              aria-label={`ค่าของข้อเท็จจริงที่ ${index + 1}`}
              className="min-h-8 min-w-0 flex-1 rounded-md border border-border px-2 outline-none focus:border-primary"
            />
            <button
              type="button"
              aria-label="ลบข้อเท็จจริงนี้"
              onClick={() => setRows(rows.filter((_, i) => i !== index))}
              className="flex size-8 items-center justify-center rounded-md text-text-muted hover:text-error"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => setRows([...rows, { label: "", value: "" }])}
          className="inline-flex min-h-8 items-center rounded-md border border-dashed border-border px-2.5 text-text-secondary hover:text-primary"
        >
          + เพิ่มข้อเท็จจริง
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => onSave(rows.filter((row) => row.label.trim() !== ""))}
          className="inline-flex min-h-8 items-center rounded-md bg-primary px-3 font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "กำลังบันทึก…" : "บันทึก"}
        </button>
      </div>
    </div>
  );
}
