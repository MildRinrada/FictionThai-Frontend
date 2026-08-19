import type { PolicySlot } from "@/features/policies/catalog";

/**
 * The fill-in blocks of the policy scaffold (docs/POLICIES-CHECKLIST.md).
 *
 * Binding wording must come from the site's owner, so a slot renders as a
 * visibly-unfinished block: dashed border, a "ต้องเขียนเอง" tag, the hint of
 * what belongs there, and the rough length. Nothing here can be mistaken for
 * real terms, and nothing here indexes as if it were - the whole scaffold is
 * wrapped in noindex until the owner fills it (see the page).
 */

const KIND_LABELS: Record<PolicySlot["kind"], string> = {
  paragraphs: "ย่อหน้า",
  list: "รายการ",
  "ordered-list": "รายการเรียงลำดับ",
  "note-info": "กล่องหมายเหตุ (ข้อมูล)",
  "note-warn": "กล่องหมายเหตุ (ข้อควรระวัง)",
};

export function PlaceholderBlock({ slot }: { slot: PolicySlot }) {
  const note = slot.kind === "note-info" || slot.kind === "note-warn";
  const border =
    slot.kind === "note-warn" ? "border-error/50" : "border-primary-200";

  return (
    <div
      className={`rounded-md border border-dashed ${border} bg-surface-secondary/60 px-3.5 py-3 ${
        note ? "border-s-2" : ""
      }`}
    >
      <p className="mono-label text-[9px] text-primary">
        ต้องเขียนเอง · {KIND_LABELS[slot.kind]}
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">
        {slot.hint}
      </p>
      <p className="mt-1.5 font-mono text-[10.5px] text-text-muted">
        ความยาวโดยประมาณ: {slot.length}
      </p>
    </div>
  );
}

/**
 * A short inline fill-in - dates, addresses, response times. Rendered in
 * brackets so it reads as a blank even out of context (and in print).
 */
export function PlaceholderInline({ hint }: { hint: string }) {
  return (
    <span className="rounded-sm border border-dashed border-primary-200 bg-surface-secondary/60 px-1 font-mono text-[0.85em] whitespace-nowrap text-primary">
      [{hint}]
    </span>
  );
}
