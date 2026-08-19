"use client";

import { useState } from "react";

import type { NovelVariable } from "@/types/variable";

/**
 * The insert-variable button
 * (docs/PHASE-13-CREATION-AND-CONTROL.md §13H).
 *
 * Variables are declared per FICTION, but the button belongs to every editor
 * toolbar - prose, chat, and headcanon - because a writer types the token
 * wherever they are writing, and a token typed from memory with one character
 * wrong is a token that silently never resolves.
 *
 * It inserts at the caret rather than appending: the writer is mid-sentence.
 * A pronoun offers each of its forms by name, so the suffix syntax is something
 * the writer never has to know exists.
 */
export function InsertVariable({
  variables,
  onInsert,
  disabled,
  compact = false,
}: {
  variables: NovelVariable[];
  onInsert: (token: string) => void;
  disabled?: boolean;
  /**
   * An icon-sized button for a field's own toolbar (chat-editor review
   * 2026-08, item 5): inserting a token into the box you are typing in is a
   * typing tool, so in the chat composer it sits WITH the input, not among
   * the block-insert buttons.
   */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (variables.length === 0) return null;

  return (
    <span className="relative">
      {/* Prominent on purpose (editor review 2026-08 C): reader variables are
          a move no other editor has, so the button dresses like the feature
          it is - the token style itself - rather than like one more icon. */}
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-label={compact ? "แทรกตัวแปรผู้อ่าน" : undefined}
        title={compact ? "แทรกตัวแปรผู้อ่าน (เช่น ชื่อของผู้อ่าน)" : undefined}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((current) => !current)}
        className={
          compact
            ? "mb-0.5 inline-flex h-8 shrink-0 items-center justify-center rounded-full px-2 font-mono text-[11px] font-medium text-primary hover:bg-primary-50 disabled:opacity-50"
            : "inline-flex min-h-8 items-center gap-1.5 rounded-md border border-primary-200 bg-primary-50/60 px-2.5 text-xs font-medium text-primary hover:border-primary hover:bg-primary-50 disabled:opacity-50"
        }
      >
        <span className="font-mono text-[11px] leading-none">y/n</span>
        {compact ? null : "แทรกตัวแปร"}
      </button>

      {open ? (
        <span className="absolute start-0 top-full z-10 mt-1 flex w-56 flex-col rounded-md border border-border bg-surface p-1 shadow-lg">
          {variables.flatMap((variable) =>
            (variable.tokens ?? [variable.token]).map((token, index) => (
              <button
                key={token}
                type="button"
                onClick={() => {
                  onInsert(token);
                  setOpen(false);
                }}
                className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-start text-[13px] hover:bg-surface-secondary"
              >
                <span className="truncate">
                  {variable.label}
                  {index > 0 && variable.options?.forms?.[index] ? (
                    <span className="text-text-muted">
                      {" "}
                      · {variable.options.forms[index]}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 font-mono text-xs text-text-muted">
                  {token}
                </span>
              </button>
            )),
          )}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Inserts text at a field's caret and restores the caret after it.
 *
 * React re-renders from state, which would otherwise drop the caret to the end
 * of the text - the same reason the prose editor's auto-indent restores it by
 * hand.
 */
export function insertAtCaret(
  field: HTMLInputElement | HTMLTextAreaElement | null,
  value: string,
  token: string,
  commit: (next: string) => void,
): void {
  if (!field) {
    commit(value + token);
    return;
  }

  const { selectionStart, selectionEnd } = field;
  const start = selectionStart ?? value.length;
  const end = selectionEnd ?? start;
  commit(value.slice(0, start) + token + value.slice(end));

  requestAnimationFrame(() => {
    const caret = start + token.length;
    field.focus();
    field.setSelectionRange(caret, caret);
  });
}
