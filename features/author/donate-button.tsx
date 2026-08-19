/**
 * The "support this writer" CTA (Phase 11, brief §7, §15).
 *
 * This is an EXTERNAL link to the writer's own EasyDonate (or similar) page -
 * FictionThai does NOT process this money. It is deliberately visually and
 * functionally distinct from "สมัคร Premium" (which pays FictionThai): a
 * different label, a plain external anchor, and `rel="noopener nofollow"` since
 * it leaves the platform entirely.
 *
 * A Server Component: it renders a static external link, so it ships no
 * JavaScript - nothing here is personal or interactive (docs/07 §20).
 */
export interface DonateButtonProps {
  /** The author's external donation URL; the CTA is hidden when absent. */
  donationUrl?: string;
  /** Hide entirely (e.g. the viewer IS the author). */
  hidden?: boolean;
}

export function DonateButton({ donationUrl, hidden = false }: DonateButtonProps) {
  if (hidden || !donationUrl) return null;

  return (
    <a
      href={donationUrl}
      target="_blank"
      rel="noopener noreferrer nofollow external"
      data-testid="donate-writer"
      className="inline-flex min-h-11 items-center justify-center rounded-md border border-secondary px-4 text-sm font-medium text-secondary transition-colors hover:bg-secondary/5"
    >
      สนับสนุนนักเขียน ↗
    </a>
  );
}
