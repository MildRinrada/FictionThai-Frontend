import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Button primitive.
 *
 * Variants follow docs/05 §17: primary for the main action, secondary for
 * alternatives, ghost for quiet controls. Destructive uses the semantic error
 * colour - never red merely for emphasis.
 */

type Variant = "primary" | "secondary" | "ghost" | "destructive";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-primary text-white hover:opacity-90",
  secondary: "border border-primary text-primary hover:bg-primary/5",
  ghost: "text-text-secondary hover:bg-surface-secondary",
  destructive: "bg-error text-white hover:opacity-90",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Shows a busy state and blocks repeat submissions. */
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  loading = false,
  disabled,
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      // Buttons inside a form default to type="submit"; being explicit prevents
      // a stray button from submitting the form by accident.
      type={props.type ?? "button"}
      disabled={disabled || loading}
      // aria-busy announces the pending state to assistive technology, which a
      // spinner alone does not (docs/05 §31).
      aria-busy={loading || undefined}
      className={[
        // 44px minimum touch target (docs/05 §31).
        "inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2",
        "text-sm font-medium transition-opacity",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_CLASSES[variant],
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
