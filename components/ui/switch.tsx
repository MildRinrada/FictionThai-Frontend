"use client";

/**
 * A switch - the control for a setting that takes effect the moment it is
 * flipped (the assistant toggles, first). A checkbox reads as "tick, then
 * submit"; these settings have no submit, so the control should not promise
 * one.
 *
 * A real `role="switch"` button rather than a styled checkbox: screen readers
 * announce it as a switch with an on/off state, and the label is wired by the
 * caller through `aria-label` or a wrapping <label>.
 */
export function Switch({
  checked,
  onChange,
  disabled = false,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5.5 w-9.5 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked
          ? "border-primary bg-primary"
          : "border-border bg-surface-secondary"
      }`}
    >
      <span
        aria-hidden
        className={`absolute size-4 rounded-full bg-white shadow-sm transition-[inset-inline-start] ${
          checked ? "start-[calc(100%-1.125rem)]" : "start-0.5"
        }`}
      />
    </button>
  );
}
