import Link from "next/link";
import type { ReactNode } from "react";

/**
 * A quick-entry chip.
 *
 * Navigation, not decoration: every chip is a link to a real filtered listing,
 * so the row works before hydration and each entry point is shareable. The
 * selected chip is filled with ink, never with the accent - coral stays
 * reserved for emotional interactions (docs/05 §4).
 */
export function Chip({
  href,
  children,
  selected = false,
}: {
  href: string;
  children: ReactNode;
  selected?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={selected ? "page" : undefined}
      className={`inline-flex min-h-8.5 items-center rounded-md border px-3 text-[13px] whitespace-nowrap ${
        selected
          ? "border-primary bg-primary text-white"
          : "border-border bg-surface text-text-secondary hover:border-primary-200 hover:text-text"
      }`}
    >
      {children}
    </Link>
  );
}

/** A non-interactive chip, for values that label rather than filter. */
export function StaticChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-h-6 items-center rounded-sm border border-border px-2 text-[11px] whitespace-nowrap text-text-secondary">
      {children}
    </span>
  );
}
