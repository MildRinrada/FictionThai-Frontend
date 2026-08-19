/**
 * วันนี้ N คำ - the quietest thing in the header.
 *
 * It is deliberately not a streak. A streak turns a day off into a loss and
 * makes writing an obligation to a counter; a plain "today" is just a fact,
 * and the fact is what makes someone want to add to it. Nothing is compared
 * to yesterday, nothing is compared to anyone else, and there is no target -
 * so there is nothing here to fail at.
 *
 * A day with nothing in it renders NOTHING at all, rather than a zero. A zero
 * is a scold; an absence is a blank page, which is the state a writer already
 * knows how to deal with.
 */
export function WordsToday({ words }: { words: number }) {
  if (words <= 0) return null;

  return (
    <span
      className="hidden font-mono text-[11px] text-text-muted tabular-nums lg:inline"
      title="จำนวนคำที่เขียนเพิ่มวันนี้"
    >
      วันนี้ {words.toLocaleString("th-TH")} คำ
    </span>
  );
}
