/**
 * Shared display formatting.
 *
 * These are presentation-only helpers. Nothing here decides what a reader may
 * see - they turn values the API already returned into Thai text.
 */

/**
 * A relative time such as "2 ชั่วโมงที่แล้ว".
 *
 * Rendered on the server, so it is the time at render rather than a live
 * ticking clock. Anything older than a week becomes an absolute date, because
 * "43 สัปดาห์ที่แล้ว" is harder to read than the date itself.
 */
export function relativeTime(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return "";

  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";

  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (seconds < 60) return "เมื่อสักครู่";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;

  const days = Math.round(hours / 24);
  if (days < 8) return `${days} วันที่แล้ว`;

  return absoluteDate(iso);
}

/** A date without a time, in the Thai calendar a reader expects. */
export function absoluteDate(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(date);
}

/**
 * A moment in the FUTURE, for the studio's schedule: weekday, date, and time,
 * because "จะขึ้นเมื่อไหร่" is answered by all three. Tomorrow and today get
 * their own words - "ศ. 15 ส.ค." for the day after tomorrow is precision, for
 * tomorrow it is a subtraction the writer should not have to do.
 */
export function scheduleLabel(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const time = new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysAway = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
  if (daysAway === 0) return `วันนี้ ${time} น.`;
  if (daysAway === 1) return `พรุ่งนี้ ${time} น.`;

  const day = new Intl.DateTimeFormat("th-TH", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
  return `${day} ${time} น.`;
}

/** Thousands separators, so long counts stay scannable in a meta line. */
export function count(value: number): string {
  return new Intl.NumberFormat("th-TH").format(value);
}

/**
 * How many WORDS a piece of writing is (§13P).
 *
 * Thai does not put spaces between words, so the whitespace-token count the
 * backend uses is a floor rather than a figure - it reports a Thai paragraph as
 * one word. `Intl.Segmenter` has a real Thai dictionary built into the runtime,
 * so the browser can answer this properly with nothing shipped and no service
 * called. That is what lets the editor say "99 คำ" and mean it.
 *
 * The fallback is the old rule, for a runtime without the API. Both are
 * advisory: nothing authorizes, orders, or bills on this number.
 */
export function wordsIn(text: string): number {
  if (text.trim() === "") return 0;

  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("th", { granularity: "word" });
    let words = 0;
    for (const segment of segmenter.segment(text)) {
      if (segment.isWordLike) words += 1;
    }
    return words;
  }
  return text.trim().split(/\s+/).length;
}

/**
 * A reading-time estimate.
 *
 * 200 words per minute is the conventional figure and is stated as an
 * approximation in the UI ("~9 นาที") rather than presented as a measurement.
 */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 200));
}

/**
 * What one chapter is called, in this fiction's own words
 * (docs/PHASE-13-CREATION-AND-CONTROL.md §13K).
 *
 * A "บท" labelled "ตอน" reads as someone else's book, which is why the unit is
 * a per-fiction field rather than a platform constant. The fallback is ตอน:
 * every fiction that existed before the column did is one.
 */
export function chapterLabel(unit: string | undefined, number: number): string {
  return `${unit?.trim() || "ตอน"}ที่ ${number}`;
}
