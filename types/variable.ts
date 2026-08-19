/**
 * Reader variables, client side
 * (docs/PHASE-13-CREATION-AND-CONTROL.md §13H).
 *
 * These mirror `backend/internal/variables` exactly. The backend is
 * authoritative: docs/09 §51 forbids clients inventing their own interpretation
 * of these values.
 *
 * The rule that governs everything here: the reader's ANSWERS never leave the
 * device. The DECLARATIONS are public - a guest has to be asked the questions
 * before the text makes sense - and the answers are the private part.
 */

export const VariableKind = {
  /** A free-text answer: a name, a nickname, a colour. */
  Text: "text",
  /** One of a list the AUTHOR defined. */
  Choice: "choice",
  /**
   * One linked SET of words. A pronoun is not one word - choosing เขา also
   * decides ของเขา - so one declaration serves readers of any gender without
   * the writer maintaining three versions of the text.
   */
  Pronoun: "pronoun",
} as const;
export type VariableKind = (typeof VariableKind)[keyof typeof VariableKind];

/** One selectable set of linked pronoun forms. Values answer `forms` positionally. */
export interface PronounSet {
  label: string;
  values: string[];
}

export interface VariableOptions {
  /** The choices, for `choice`. */
  values?: string[];
  /** The pronoun form NAMES, for `pronoun`. */
  forms?: string[];
  /** The selectable sets, for `pronoun`. */
  sets?: PronounSet[];
}

export interface NovelVariable {
  id: string;
  position: number;
  /** The literal placeholder the author typed. Matched literally, never as a regex. */
  token: string;
  /** What the reader is asked. */
  label: string;
  /** What the text shows before the reader answers. */
  default_value?: string;
  kind: VariableKind;
  options?: VariableOptions;
  /**
   * Every literal placeholder this declaration produces: one for text and
   * choice, one per FORM for a pronoun. Served by the API so no client rebuilds
   * the suffix rule and disagrees with the server (docs/09 §51).
   */
  tokens: string[];
}

/** Where an undeclared token was found - enough to name the chapter and link. */
export interface TokenChapterRef {
  chapter_number: number;
  title?: string;
  slug: string;
}

/** One undeclared token and the chapters it appears in. */
export interface TokenUse {
  token: string;
  chapters: TokenChapterRef[];
}

/**
 * The writer's advisory report. Warnings, never errors - a token typed before
 * its declaration exists is an ordinary order of work.
 */
export interface VariableUsage {
  undeclared: string[];
  /**
   * The same tokens as `undeclared`, each with the chapters it was found in.
   * Optional so a client running against an API build that predates the field
   * degrades to the bare token list rather than crashing.
   */
  undeclared_uses?: TokenUse[];
  unused: string[];
  /**
   * Token-shaped strings that name one of the fiction's own CHARACTERS -
   * "(Scaramouche/Wanderer)" beside a cast member called either. Classified
   * by the SERVER against the declared cast (docs/09 §51 - clients never
   * guess from shape), and never included in `undeclared`. Optional for the
   * same compatibility reason as `undeclared_uses`.
   */
  character_mentions?: string[];
}

/** `GET`/`PUT /novels/:ref/variables`. */
export interface VariablesResult {
  variables: NovelVariable[];
  usage: VariableUsage;
}

/** One row as submitted by a writer. Positions come from array order. */
export interface VariableInput {
  token: string;
  label: string;
  default_value?: string | null;
  kind: VariableKind;
  options?: VariableOptions | null;
}

/**
 * The presets this genre already has words for
 * (docs/PHASE-13-CREATION-AND-CONTROL.md §13H).
 *
 * One click each, because a writer should not have to type "(y/n)" and "ชื่อของ
 * คุณ" from memory every time. Custom rows are still allowed - these are a head
 * start, not the vocabulary.
 */
export const VARIABLE_PRESETS: ReadonlyArray<{
  key: string;
  input: VariableInput;
}> = [
  {
    key: "y/n",
    input: { token: "(y/n)", label: "ชื่อของคุณ", default_value: "คุณ", kind: "text" },
  },
  { key: "l/n", input: { token: "(l/n)", label: "นามสกุล", kind: "text" } },
  { key: "n/n", input: { token: "(n/n)", label: "ชื่อเล่น", kind: "text" } },
  { key: "e/c", input: { token: "(e/c)", label: "สีตา", kind: "text" } },
  { key: "h/c", input: { token: "(h/c)", label: "สีผม", kind: "text" } },
  { key: "s/n", input: { token: "(s/n)", label: "ชื่อลูกชาย", kind: "text" } },
  { key: "d/n", input: { token: "(d/n)", label: "ชื่อลูกสาว", kind: "text" } },
  {
    key: "p/n",
    input: {
      token: "(p/n)",
      label: "สรรพนามของคุณ",
      kind: "pronoun",
      options: {
        forms: ["ประธาน", "เจ้าของ"],
        sets: [
          { label: "เขา", values: ["เขา", "ของเขา"] },
          { label: "เธอ", values: ["เธอ", "ของเธอ"] },
          { label: "เขา (ไม่ระบุเพศ)", values: ["เขา", "ของเขา"] },
        ],
      },
    },
  },
];

/**
 * The KEY a writer types - "y/n", no brackets (settings review 2026-08).
 *
 * The stored token keeps its "(y/n)" delimiters - they are what the scanner
 * matches in the manuscript - but the declaration form asks for the key
 * alone: the brackets are the platform's convention, not something a writer
 * should have to spell.
 */
export function tokenKey(token: string): string {
  const trimmed = token.trim();
  return trimmed.startsWith("(") && trimmed.endsWith(")")
    ? trimmed.slice(1, -1)
    : trimmed;
}

/** The stored token for a typed key: wraps in () unless already wrapped. */
export function tokenFromKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed === "") return "";
  return trimmed.startsWith("(") && trimmed.endsWith(")") ? trimmed : `(${trimmed})`;
}

/**
 * The token for one form of a variable.
 *
 * Mirrors `Variable.FormToken` in Go, and is used only where the API's own
 * `tokens` array is not available - the editor's insert button, which works on
 * a row the writer has not saved yet.
 */
export function formToken(token: string, form: string, index: number): string {
  if (index <= 0) return token;
  if (token.endsWith(")")) return `${token.slice(0, -1)}.${form})`;
  return `${token}.${form}`;
}

/** Every literal placeholder a declaration produces, for an unsaved row. */
export function tokensOf(input: VariableInput): string[] {
  const forms = input.kind === VariableKind.Pronoun ? (input.options?.forms ?? []) : [];
  if (forms.length === 0) return [input.token];
  return forms.map((form, index) => formToken(input.token, form, index));
}
