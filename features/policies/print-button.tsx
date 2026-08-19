"use client";

import { Icon } from "@/components/ui/icon";

/**
 * พิมพ์ / บันทึกเป็น PDF. The print stylesheet on the policy page hides the
 * chrome, leaving the document body with its version and dates - the copy a
 * dispute keeps.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      title="พิมพ์หรือบันทึกเป็น PDF"
      aria-label="พิมพ์หรือบันทึกเป็น PDF"
      className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-surface text-text-secondary hover:bg-surface-secondary print:hidden"
    >
      <Icon name="printer" size={15} />
    </button>
  );
}
