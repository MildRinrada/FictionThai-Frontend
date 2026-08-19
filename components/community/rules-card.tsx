import Link from "next/link";

/**
 * The three-line community rules card (docs/COMMUNITY-FEED.md). A reminder,
 * not the rulebook - the guidelines page carries the full wording.
 */
export function RulesCard() {
  return (
    <section
      aria-labelledby="community-rules-heading"
      className="rounded-lg border border-border bg-surface p-4"
    >
      <h2 id="community-rules-heading" className="mono-label">
        กติกาชุมชน
      </h2>

      <ol className="mt-3 list-decimal space-y-1.5 ps-4 text-xs leading-relaxed text-text-secondary">
        <li>เคารพกัน - วิจารณ์งานได้ ไม่โจมตีตัวคน</li>
        <li>สปอยล์และเนื้อหา 18+ ต้องบอกล่วงหน้า</li>
        <li>งานของนักเขียนเป็นของนักเขียน - ไม่คัดลอก ไม่แอบอ้าง</li>
      </ol>

      <Link
        href="/community/guidelines"
        className="mt-3 block text-xs text-primary hover:underline"
      >
        อ่านแนวปฏิบัติฉบับเต็ม →
      </Link>
    </section>
  );
}
