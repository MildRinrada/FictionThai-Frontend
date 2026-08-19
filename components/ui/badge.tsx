import type { ReactNode } from "react";

/**
 * A small label. Used for fiction format badges, statuses, and counts.
 *
 * A Server Component: it has no interactivity, so shipping JavaScript for it
 * would be waste on the reader path (docs/07 §20).
 */

type BadgeTone = "neutral" | "primary" | "secondary" | "success" | "warning";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "border-border text-text-secondary",
  primary: "border-primary text-primary",
  secondary: "border-secondary text-secondary",
  success: "border-success text-success",
  warning: "border-warning text-warning",
};

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  /**
   * Announced by screen readers instead of the visible text. docs/05 §31:
   * meaning must never be carried by colour alone.
   */
  srLabel?: string;
}

export function Badge({ children, tone = "neutral", srLabel }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {srLabel ? <span className="sr-only">{srLabel}: </span> : null}
      {children}
    </span>
  );
}
