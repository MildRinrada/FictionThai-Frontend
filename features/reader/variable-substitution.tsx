"use client";

import { useEffect } from "react";

import {
  getReaderProfile,
  getReaderValues,
  resolveValue,
  subscribeReaderValues,
} from "@/lib/reader-values";
import { VariableKind, type NovelVariable } from "@/types/variable";

/**
 * Fills the variable slots on the reading surface with the reader's answers
 * (docs/PHASE-13-CREATION-AND-CONTROL.md §13H).
 *
 * Renders nothing. The chapter text stays a Server Component - the slots were
 * already emitted as elements during the server render, so this island only
 * writes their text content and never has to ship the prose to the browser as
 * JavaScript (docs/07 §20).
 *
 * `textContent` is used deliberately: the value came from a text input, and
 * assigning it as text makes it impossible for an answer to become markup
 * (docs/11 §17).
 */
export function VariableSubstitution({
  novelID,
  variables,
}: {
  novelID: string;
  variables: NovelVariable[];
}) {
  useEffect(() => {
    function apply() {
      const values = getReaderValues(novelID);
      const profile = getReaderProfile();

      // token -> what to show. Built once per update rather than per slot: a
      // long chapter can hold hundreds of slots.
      const resolved = new Map<string, string>();
      for (const variable of variables) {
        const tokens = variable.tokens ?? [variable.token];

        if (variable.kind === VariableKind.Pronoun) {
          // A pronoun's answer names a SET; each form token then takes its own
          // word from that set. This is the whole reason pronoun is its own
          // kind - one answer, several words, all consistent.
          const chosen = values[variable.token] || profile[variable.label] || "";
          const set =
            variable.options?.sets?.find((candidate) => candidate.label === chosen) ??
            variable.options?.sets?.[0];

          tokens.forEach((token, index) => {
            const word = set?.values?.[index] ?? "";
            resolved.set(token, word || variable.default_value || chosen || token);
          });
          continue;
        }

        for (const token of tokens) {
          resolved.set(token, resolveValue(values, profile, variable, token));
        }
      }

      for (const slot of document.querySelectorAll<HTMLElement>("[data-var-slot]")) {
        const token = slot.dataset.varSlot;
        if (!token) continue;
        const value = resolved.get(token);
        if (value !== undefined) slot.textContent = value;
      }
    }

    apply();
    // Re-run when the reader changes an answer here, on the fiction page, or in
    // another tab.
    return subscribeReaderValues(apply);
  }, [novelID, variables]);

  return null;
}
