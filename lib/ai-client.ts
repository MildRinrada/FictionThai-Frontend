"use client";

import { del, getOne, post, put } from "@/lib/api";
import { readCSRFToken } from "@/lib/auth-client";
import type {
  AiCharacterCheck,
  AiCheckResult,
  AiContinuityResult,
  AiDecision,
  AiFact,
  AiFeature,
  AiInlineSuggestion,
  AiLexicon,
  AiMute,
  AiPrecheck,
  AiPrefs,
  AiPrefsView,
  AiRequest,
  AiSearchHit,
  AiSuggestion,
  AiUsage,
  AiUserLexicon,
} from "@/types/ai";

/**
 * Browser-side AI calls (docs/09 §24).
 *
 * Every mutation carries the CSRF double-submit header, the session cookie, the
 * envelope, and the ApiError contract that every other client uses (docs/11
 * §22). No AI credential is ever handled here - the browser never talks to a
 * provider directly (docs/09 §24, docs/11 §"AI provider keys").
 */

function mutationHeaders(): Record<string, string> {
  const token = readCSRFToken();
  return token ? { "X-CSRF-Token": token } : {};
}

/** Stateless spell/punctuation/repetition check of raw text. Not persisted. */
export async function analyzeText(text: string): Promise<AiInlineSuggestion[]> {
  const data = await post<{ suggestions: AiInlineSuggestion[] }>(
    "/ai/spell-check",
    { text },
    { headers: mutationHeaders() },
  );
  return data.suggestions;
}

/** Creates a persisted request against a chapter the caller owns. */
export async function createAiRequest(
  feature: AiFeature,
  chapterId: string,
): Promise<AiRequest> {
  return post<AiRequest>(
    "/ai/requests",
    { feature, chapter_id: chapterId },
    { headers: mutationHeaders() },
  );
}

/** Polls one request's status and suggestions. */
export async function getAiRequest(id: string): Promise<AiRequest> {
  return getOne<AiRequest>(`/ai/requests/${encodeURIComponent(id)}`);
}

/** Records the writer's decision on a suggestion (docs/12 §14). */
export async function decideSuggestion(
  id: string,
  decision: AiDecision,
): Promise<AiSuggestion> {
  return post<AiSuggestion>(
    `/ai/suggestions/${encodeURIComponent(id)}/decision`,
    { decision },
    { headers: mutationHeaders() },
  );
}

// ---------------------------------------------------------------------------
// The writing tools (13Y)
// ---------------------------------------------------------------------------

/** The editor's live pass: mode-aware, word-bank-filtered. Not persisted. */
export async function checkText(
  novel: string,
  mode: string,
  text: string,
): Promise<AiCheckResult> {
  return post<AiCheckResult>(
    "/ai/check",
    { novel, mode, text },
    { headers: mutationHeaders() },
  );
}

/** One block of a prose→chat conversion (docs/CHAT-CONVERSION.md). */
export interface ConversionBlock {
  id: string;
  type: "narration" | "dialogue" | "action" | "unknown";
  speaker_id: string | null;
  text: string;
  confidence: "high" | "medium" | "low";
  needs_review: boolean;
  reason?: string | null;
}

export interface ChatConversion {
  conversion_status: "success" | "needs_review";
  characters: Array<{ speaker_id: string; name: string }>;
  blocks: ConversionBlock[];
  review_items: Array<{ block_id: string; reason: string }>;
}

/**
 * The fiction-format conversion engine (docs/CHAT-CONVERSION.md): prose in,
 * chat blocks out. Read-only - nothing is written until the author imports
 * the result and presses บันทึก themselves.
 */
export async function convertChat(novel: string, text: string): Promise<ChatConversion> {
  return post<ChatConversion>(
    "/ai/convert-chat",
    { novel, text },
    { headers: mutationHeaders() },
  );
}

/** The character-consistency round (13Y §5) - every finding cites its sheet. */
export async function checkCharacters(
  novel: string,
  chapterNumber: number,
  text: string,
): Promise<AiCharacterCheck> {
  return post<AiCharacterCheck>(
    "/ai/character-check",
    { novel, chapter_number: chapterNumber, text },
    { headers: mutationHeaders() },
  );
}

/** "ตัวละครเปลี่ยนไปตั้งแต่ตอนนี้" - 0 clears the marker. */
export async function setCharacterEvolution(
  novel: string,
  characterId: string,
  fromChapterNumber: number,
): Promise<void> {
  await put(
    "/ai/character-evolution",
    { novel, character_id: characterId, from_chapter_number: fromChapterNumber },
    { headers: mutationHeaders() },
  );
}

/** The continuity round, driven by the fact book (13Y §6). */
export async function checkContinuity(
  novel: string,
  chapterId: string,
): Promise<AiContinuityResult> {
  return post<AiContinuityResult>(
    "/ai/continuity",
    { novel, chapter_id: chapterId },
    { headers: mutationHeaders() },
  );
}

/** The pre-publish bundle (13Y §11). */
export async function precheckChapter(
  novel: string,
  chapterId: string,
): Promise<AiPrecheck> {
  return post<AiPrecheck>(
    "/ai/precheck",
    { novel, chapter_id: chapterId },
    { headers: mutationHeaders() },
  );
}

/** The layered assistant switches; pass a novel for its override tier. */
export async function getAiPrefs(novel?: string): Promise<AiPrefsView> {
  const suffix = novel ? `?novel=${encodeURIComponent(novel)}` : "";
  return getOne<AiPrefsView>(`/ai/prefs${suffix}`);
}

/** Writes one tier: the account's (no novel) or one fiction's override. */
export async function setAiPrefs(prefs: AiPrefs, novel?: string): Promise<AiPrefsView> {
  return put<AiPrefsView>(
    "/ai/prefs",
    { novel: novel ?? "", prefs },
    { headers: mutationHeaders() },
  );
}

/**
 * A word bank with both lists guaranteed to be arrays.
 *
 * A fiction with no cast, no variables and no tags used to answer
 * `"auto": null`, and the settings page reads `.length` off both lists - so
 * the whole page died on its own error boundary for every fiction on its first
 * day. The API no longer sends null; this keeps an older or cached response
 * from taking the page down again.
 */
function wordBank(bank: AiLexicon): AiLexicon {
  return { custom: bank.custom ?? [], account: bank.account ?? [], auto: bank.auto ?? [] };
}

/** The fiction's word bank (custom + auto). */
export async function getLexicon(novel: string): Promise<AiLexicon> {
  return wordBank(
    await getOne<AiLexicon>(`/novels/${encodeURIComponent(novel)}/lexicon`),
  );
}

/** "เพิ่มคำนี้ในคลังของเรื่อง". */
export async function addLexiconTerm(novel: string, term: string): Promise<AiLexicon> {
  return wordBank(
    await post<AiLexicon>(
      `/novels/${encodeURIComponent(novel)}/lexicon`,
      { term },
      { headers: mutationHeaders() },
    ),
  );
}

export async function removeLexiconTerm(novel: string, termId: string): Promise<void> {
  await del(`/novels/${encodeURIComponent(novel)}/lexicon/${encodeURIComponent(termId)}`, {
    headers: mutationHeaders(),
  });
}

/** "ไม่เตือนแบบนี้อีก" - novel-scoped, or global when novel is omitted. */
export async function muteSuggestion(
  kind: string,
  term: string,
  novel?: string,
): Promise<void> {
  await post(
    "/ai/mutes",
    { novel: novel ?? "", kind, term },
    { headers: mutationHeaders() },
  );
}

/**
 * The caller's taught silences. With no novel: every one, account-wide, each
 * naming the fiction it is scoped to - the settings page's "กฎที่ปิดไว้".
 */
export async function listMutes(novel?: string): Promise<AiMute[]> {
  const suffix = novel ? `?novel=${encodeURIComponent(novel)}` : "";
  const data = await getOne<{ mutes: AiMute[] }>(`/ai/mutes${suffix}`);
  return data.mutes ?? [];
}

/** Un-teaches one silence - the rule warns again. */
export async function removeMute(muteId: string): Promise<void> {
  await del(`/ai/mutes/${encodeURIComponent(muteId)}`, {
    headers: mutationHeaders(),
  });
}

/** The account-wide word bank - terms that apply in every fiction. */
export async function getUserLexicon(): Promise<AiUserLexicon> {
  const bank = await getOne<AiUserLexicon>("/ai/lexicon");
  return { terms: bank.terms ?? [] };
}

export async function addUserLexiconTerm(term: string): Promise<AiUserLexicon> {
  const bank = await post<AiUserLexicon>(
    "/ai/lexicon",
    { term },
    { headers: mutationHeaders() },
  );
  return { terms: bank.terms ?? [] };
}

export async function removeUserLexiconTerm(termId: string): Promise<void> {
  await del(`/ai/lexicon/${encodeURIComponent(termId)}`, {
    headers: mutationHeaders(),
  });
}

/** The daily-quota standing. A read that spends none of it. */
export async function getAiUsage(): Promise<AiUsage> {
  return getOne<AiUsage>("/ai/usage");
}

/** A chapter's fact book. */
export async function getFacts(novel: string, chapterId: string): Promise<AiFact[]> {
  const data = await getOne<{ facts: AiFact[] }>(
    `/novels/${encodeURIComponent(novel)}/chapters/${encodeURIComponent(chapterId)}/facts`,
  );
  return data.facts;
}

export async function saveFacts(
  novel: string,
  chapterId: string,
  facts: AiFact[],
): Promise<AiFact[]> {
  const data = await put<{ facts: AiFact[] }>(
    `/novels/${encodeURIComponent(novel)}/chapters/${encodeURIComponent(chapterId)}/facts`,
    { facts },
    { headers: mutationHeaders() },
  );
  return data.facts;
}

/** Literal search across the fiction - drafts included (13Y §8). */
export async function searchNovel(novel: string, query: string): Promise<AiSearchHit[]> {
  const data = await getOne<{ results: AiSearchHit[] }>(
    `/novels/${encodeURIComponent(novel)}/search?q=${encodeURIComponent(query)}`,
  );
  return data.results;
}
