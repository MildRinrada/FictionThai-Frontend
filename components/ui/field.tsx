import type { ReactNode } from "react";

/**
 * A labelled form field with error and hint support.
 *
 * Accessibility is the point of this component (docs/05 §31, WCAG 2.2 AA):
 * every input gets a real `<label for>`, errors are linked with
 * `aria-describedby` and announced via `role="alert"`, and the invalid state is
 * exposed through `aria-invalid` rather than colour alone.
 */

export interface FieldProps {
  id: string;
  label: string;
  /** Server-supplied messages for this field, from the API's 422 payload. */
  errors?: string[];
  hint?: string;
  required?: boolean;
  children: ReactNode;
}

export function Field({ id, label, errors, hint, required, children }: FieldProps) {
  const hasError = Boolean(errors?.length);
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {required ? (
          <span className="ml-1 text-error" aria-hidden="true">
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> (จำเป็น)</span> : null}
      </label>

      {children}

      {hint && !hasError ? (
        <p id={hintId} className="text-xs text-text-muted">
          {hint}
        </p>
      ) : null}

      {hasError ? (
        // role="alert" so a screen reader announces the problem when the server
        // rejects the submission.
        <ul id={errorId} role="alert" className="space-y-0.5 text-xs text-error">
          {errors?.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Props shared by inputs rendered inside a Field. */
export function fieldInputProps(id: string, errors?: string[], hint?: string) {
  const hasError = Boolean(errors?.length);
  return {
    id,
    name: id,
    "aria-invalid": hasError || undefined,
    "aria-describedby": hasError ? `${id}-error` : hint ? `${id}-hint` : undefined,
    className: [
      "w-full rounded-md border bg-surface px-3 py-2 text-sm",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
      hasError ? "border-error" : "border-border",
    ].join(" "),
  } as const;
}
