/**
 * AI / Thai NLP assistance (docs/12; docs/09 §24).
 *
 * AI is an OPTIONAL assistant: it proposes suggestions, and the writer accepts
 * or rejects them. Nothing here ever modifies a manuscript on its own
 * (docs/12 §15, §43). The backend is the authority - the frontend only submits
 * requests and renders what comes back.
 */

/** Features the API accepts today (mirrors the backend vocabulary). */
export const AI_FEATURES = ["spell_check", "repetition", "summary"] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

export const AI_FEATURE_LABELS: Record<AiFeature, string> = {
  spell_check: "ตรวจการสะกดและวรรคตอน",
  repetition: "ตรวจคำซ้ำ",
  summary: "สรุปเนื้อหา (ประมวลผลเบื้องหลัง)",
};

/** A transient inline suggestion for the editor (docs/12 §13) - not persisted. */
export interface AiInlineSuggestion {
  type: string;
  start: number;
  end: number;
  original: string;
  suggestions: string[];
  confidence: number;
  severity: string;
  explanation: string;
}

export type AiSuggestionStatus = "pending" | "accepted" | "rejected" | "dismissed";

/** A persisted suggestion the writer decides on (docs/08 §26.1). */
export interface AiSuggestion {
  id: string;
  type: string;
  original_text: string;
  suggested_text?: string;
  explanation?: string;
  status: AiSuggestionStatus;
  created_at: string;
}

export type AiRequestStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

/** A persisted AI request and its lifecycle (docs/12 §28). */
export interface AiRequest {
  id: string;
  feature: AiFeature;
  provider: string;
  model?: string;
  status: AiRequestStatus;
  chapter_id?: string;
  error_code?: string;
  retryable: boolean;
  created_at: string;
  completed_at?: string;
  suggestions: AiSuggestion[];
}

/** The writer's decision on a suggestion (docs/12 §14). */
export type AiDecision = "accepted" | "rejected" | "dismissed";

/** A request status is terminal when the worker will do no more with it. */
export function isTerminal(status: AiRequestStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

// ---------------------------------------------------------------------------
// The writing tools (13Y)
// ---------------------------------------------------------------------------

/** The assistant switches. Absent = inherit the tier below. */
export interface AiPrefs {
  assistant?: boolean;
  spell?: boolean;
  character?: boolean;
  continuity?: boolean;
  polish?: boolean;
}

/** Every switch resolved: defaults ← account ← fiction. */
export interface AiEffectivePrefs {
  assistant: boolean;
  spell: boolean;
  character: boolean;
  continuity: boolean;
  polish: boolean;
}

/** One fiction whose override tier actually sets something. */
export interface AiPrefsOverride {
  title: string;
  slug: string;
}

export interface AiPrefsView {
  user: AiPrefs | null;
  novel?: AiPrefs | null;
  effective: AiEffectivePrefs;
  /**
   * On the ACCOUNT view: the caller's fictions that override these defaults,
   * so the settings page can say which stories do not follow them.
   */
  overrides?: AiPrefsOverride[];
}

/**
 * One finding published INTO the manuscript: the text to underline, its
 * visual family, and the actions the in-text popover offers - the same
 * closures the side panel's card uses, so the two surfaces can never
 * disagree. Nothing here edits anything by itself.
 */
export interface AiManuscriptMark {
  /**
   * The finding's identity, shared with the side panel's row. It is what lets
   * a click on an underline SELECT the matching card instead of opening a
   * second, separate view of the same finding.
   */
  key: string;
  text: string;
  /**
   * Where it sits in the manuscript, as a RUNE offset - the unit the Thai
   * analyzer reports in. Absent for findings that carry a quote rather than a
   * position (the character round), which are located by searching for it.
   */
  start?: number;
  family: "error" | "consistency" | "soft";
  label: string;
  suggestion?: string;
  explanation?: string;
  onApplyFix?: () => void;
  onSkip?: () => void;
  onMute?: () => void;
}

/** The live check's answer (mode-aware, lexicon-filtered, capped). */
export interface AiCheckResult {
  disabled?: boolean;
  suggestions: AiInlineSuggestion[];
  overflow?: Array<{ paragraph: number; hidden: number }>;
}

/** One character finding, WITH the sheet field it cites (13Y §5). */
export interface AiCharacterIssue {
  character_id: string;
  character_name: string;
  field: string;
  field_value: string;
  quote: string;
  explanation: string;
  severity: string;
}

export interface AiCharacterCheck {
  total: number;
  checkable: number;
  skipped: Array<{ character_id: string; name: string; reason: string }>;
  issues: AiCharacterIssue[];
  /**
   * Lines the model sidecar has queued but not scored yet (it scores
   * asynchronously on writer hardware). Non-zero means "ask again shortly" -
   * the panel keeps following up until this reaches zero.
   */
  model_pending: number;
}

/** One fact-book row - writer-owned, writer-edited. */
export interface AiFact {
  label: string;
  value: string;
}

export interface AiContinuityIssue {
  label: string;
  this_value: string;
  previous_value: string;
  previous_chapter: number;
  explanation: string;
}

export interface AiContinuityResult {
  checked: boolean;
  issues: AiContinuityIssue[];
}

/** One place a search query appears - drafts included. */
export interface AiSearchHit {
  chapter_id: string;
  slug: string;
  chapter_number: number;
  title?: string;
  status: string;
  where: "prose" | "chat" | "entry" | "title";
  snippet: string;
}

/** The fiction's word bank: taught terms + the auto-derived part. */
export interface AiLexicon {
  custom: Array<{ id: string; term: string }>;
  /**
   * The author's account-wide terms, which apply here too. Managed on the
   * account settings page; shown per fiction so nobody wonders why a word is
   * not flagged. Optional: an API build predating the account bank omits it.
   */
  account?: Array<{ id: string; term: string }>;
  auto: string[];
}

/** One account-wide word-bank term. */
export interface AiUserLexiconTerm {
  id: string;
  term: string;
}

/** `GET /ai/lexicon` - the account-wide word bank. */
export interface AiUserLexicon {
  terms: AiUserLexiconTerm[];
}

/** One taught silence ("ไม่เตือนแบบนี้อีก"), as `GET /ai/mutes` lists them. */
export interface AiMute {
  id: string;
  kind: string;
  term: string;
  /** Set when the silence is scoped to one fiction; absent = everywhere. */
  novel_id?: string;
  novel_title?: string;
  novel_slug?: string;
}

/** `GET /ai/usage` - the daily-quota standing. Reading it spends nothing. */
export interface AiUsage {
  /** False when the platform runs without a cap; the page then shows nothing. */
  limited: boolean;
  daily_quota: number;
  used: number;
  remaining: number;
}

/** The pre-publish round's bundle (13Y §11). */
export interface AiPrecheck {
  skipped?: boolean;
  spell: AiInlineSuggestion[];
  character: AiCharacterCheck;
  continuity: AiContinuityResult;
  spell_count: number;
  issue_count: number;
  checked_runes: number;
}
