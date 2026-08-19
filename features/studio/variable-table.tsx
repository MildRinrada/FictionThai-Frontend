"use client";

import { useCallback, useState } from "react";

import { SaveBadge } from "@/components/ui/save-badge";
import { Icon } from "@/components/ui/icon";
import { ApiError } from "@/lib/api";
import { saveVariables } from "@/lib/novels-client";
import { useAutosave } from "@/lib/use-autosave";
import {
  VARIABLE_PRESETS,
  VariableKind,
  tokenFromKey,
  tokenKey,
  type NovelVariable,
  type VariableInput,
  type VariableUsage,
} from "@/types/variable";

/**
 * The reader-variable table
 * (docs/PHASE-13-CREATION-AND-CONTROL.md §13H, reworked settings review 2026-08).
 *
 * 12B's single y/n switch, generalised: a fiction declares as many variables as
 * it needs, and each row is a token, a question, a default, and a kind.
 *
 * The one thing this form must never do is rewrite the author's text. Renaming
 * a token here changes the declaration only - the chapters keep the old token,
 * and the writer is TOLD about it through the usage report rather than having
 * their manuscript edited to follow a settings change.
 *
 * The review's three fixes, all here:
 *
 *   - the table AUTOSAVES like every other block. Rows still missing their
 *     token or question are simply not sent yet - a half-typed row is work in
 *     progress, not an error;
 *   - preset buttons say what they mean: "(l/n)" alone was a code only people
 *     who already knew the genre could read;
 *   - the undeclared-tokens warning carries its own "เพิ่มตัวแปรที่พบทั้งหมด"
 *     button, and tokens that match a CHARACTER's name are set apart - a
 *     "(Scaramouche/Wanderer)" in the prose is two names for one person, not
 *     a reader variable, and offering to declare it as one was wrong.
 */

type Row = VariableInput & { key: string };

function rowOf(variable: NovelVariable | VariableInput, index: number): Row {
  return {
    key: "id" in variable && variable.id ? variable.id : `row-${index}-${Date.now()}`,
    token: variable.token,
    label: variable.label,
    default_value: variable.default_value ?? "",
    kind: variable.kind,
    options: variable.options ?? null,
  };
}

/** A row the API would accept - the rest stay local until they are whole. */
function complete(row: Row): boolean {
  return row.token.trim() !== "" && row.label.trim() !== "";
}

export function VariableTable({
  novelRef,
  initial,
  initialUsage,
}: {
  novelRef: string;
  initial: NovelVariable[];
  initialUsage: VariableUsage;
}) {
  const [rows, setRows] = useState<Row[]>(initial.map(rowOf));
  const [usage, setUsage] = useState<VariableUsage>(initialUsage);
  const [fields, setFields] = useState<Record<string, string[]>>({});

  const save = useCallback(
    async (value: { rows: VariableInput[] }) => {
      setFields({});
      try {
        const result = await saveVariables(novelRef, value.rows);
        // Only the report comes back into view - the ROWS stay the writer's,
        // half-typed ones included; replacing them with the server's list
        // would delete work in progress from under the cursor.
        setUsage(result.usage);
      } catch (cause) {
        if (cause instanceof ApiError && cause.fields) {
          setFields(cause.fields);
        }
        throw cause;
      }
    },
    [novelRef],
  );

  const autosave = useAutosave(
    {
      rows: rows.filter(complete).map((row) => ({
        token: row.token.trim(),
        label: row.label.trim(),
        default_value: row.default_value?.trim() || null,
        kind: row.kind,
        options: row.options ?? null,
      })),
    },
    save,
  );

  function patch(index: number, changes: Partial<Row>) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...changes } : row)),
    );
  }

  function addPreset(preset: VariableInput) {
    // A preset already in the table is not added twice - the API would reject
    // the duplicate token, and a second identical row helps nobody.
    if (rows.some((row) => row.token === preset.token)) return;
    setRows((current) => [...current, rowOf(preset, current.length)]);
  }

  /** One undeclared token becomes a row - preset-aware, so "(y/n)" arrives
      with its question already filled in. */
  function adopt(token: string) {
    if (rows.some((row) => row.token === token)) return;
    const preset = VARIABLE_PRESETS.find((entry) => entry.input.token === token);
    setRows((current) => [
      ...current,
      rowOf(preset ? preset.input : { token, label: "", kind: VariableKind.Text }, current.length),
    ]);
  }

  // The character/variable split comes from the SERVER, which compared each
  // token against the fiction's own cast (docs/09 §51) - this component only
  // subtracts what the table already declares.
  const declared = new Set(rows.map((row) => row.token));
  const adoptable = usage.undeclared.filter((token) => !declared.has(token));
  const characterLike = (usage.character_mentions ?? []).filter(
    (token) => !declared.has(token),
  );
  const hasIncomplete = rows.some((row) => !complete(row));

  return (
    <section
      id="variables"
      className="scroll-mt-28 rounded-lg border border-border bg-surface p-5"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-serif text-lg font-semibold">ตัวแปรผู้อ่าน</h2>
        <SaveBadge state={autosave.state} error={autosave.error} />
      </div>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-text-secondary">
        ประกาศตัวแทนที่คุณพิมพ์ไว้ในเนื้อเรื่อง แล้วผู้อ่านจะเติมคำของตัวเองได้
        ระบบ <span className="font-medium text-text">ไม่เคยแทนที่คำในไฟล์งานของคุณ</span> -
        เนื้อเรื่องเก็บเป็นตัวแทนเสมอ และแทนค่าตอนแสดงผลเท่านั้น
        ช่องตัวแทนกรอกแค่ตัวย่อ เช่น y/n - วงเล็บระบบเติมให้เอง
        {rows.length === 0
          ? " เรื่องนี้ยังไม่มีตัวแปร - เริ่มจากแบบสำเร็จรูปข้างล่างได้เลย"
          : null}
      </p>

      {/* The presets, each SAYING what it is (review item C): "(l/n)" alone
          was a code only people who already knew the genre could read. */}
      <div className="mt-4">
        <p className="mono-label">เพิ่มแบบสำเร็จรูป</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {VARIABLE_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => addPreset(preset.input)}
              disabled={rows.some((row) => row.token === preset.input.token)}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 text-xs text-text-secondary hover:border-primary-200 hover:text-primary disabled:opacity-40"
            >
              <span className="font-mono">{tokenKey(preset.input.token)}</span>
              {preset.input.label}
            </button>
          ))}
        </div>
      </div>

      <ol className="mt-4 flex flex-col gap-3">
        {rows.map((row, index) => (
          <li key={row.key} className="rounded-lg border border-border bg-canvas p-3">
            <div className="flex flex-wrap items-end gap-2.5">
              <Cell label="ตัวแทนในเนื้อเรื่อง" id={`var-token-${row.key}`} width="w-32">
                {/* The KEY alone - "y/n" (review: the brackets are the
                    platform's convention, so the platform types them). */}
                <input
                  id={`var-token-${row.key}`}
                  value={tokenKey(row.token)}
                  onChange={(event) =>
                    patch(index, { token: tokenFromKey(event.target.value) })
                  }
                  placeholder="y/n"
                  className="min-h-9 w-full rounded-md border border-border bg-surface px-2.5 font-mono text-sm outline-none focus:border-primary"
                />
              </Cell>

              <Cell label="คำถามที่ผู้อ่านเห็น" id={`var-label-${row.key}`} width="w-44">
                <input
                  id={`var-label-${row.key}`}
                  value={row.label}
                  onChange={(event) => patch(index, { label: event.target.value })}
                  placeholder="ชื่อของคุณ"
                  className="min-h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm outline-none focus:border-primary"
                />
              </Cell>

              <Cell label="ค่าเริ่มต้น" id={`var-default-${row.key}`} width="w-28">
                <input
                  id={`var-default-${row.key}`}
                  value={row.default_value ?? ""}
                  onChange={(event) => patch(index, { default_value: event.target.value })}
                  placeholder="คุณ"
                  className="min-h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm outline-none focus:border-primary"
                />
              </Cell>

              <Cell label="ประเภท" id={`var-kind-${row.key}`} width="w-32">
                <select
                  id={`var-kind-${row.key}`}
                  value={row.kind}
                  onChange={(event) =>
                    patch(index, {
                      kind: event.target.value as VariableKind,
                      // The options of the kind being left behind are dropped
                      // here as well as server-side, so the form never shows a
                      // row whose controls contradict its kind.
                      options: null,
                    })
                  }
                  className="min-h-9 w-full rounded-md border border-border bg-surface px-2 text-sm outline-none focus:border-primary"
                >
                  <option value={VariableKind.Text}>ข้อความ</option>
                  <option value={VariableKind.Choice}>เลือกจากลิสต์</option>
                  <option value={VariableKind.Pronoun}>คำสรรพนาม</option>
                </select>
              </Cell>

              <button
                type="button"
                onClick={() => setRows(rows.filter((_, i) => i !== index))}
                aria-label={`ลบตัวแปร ${row.token || index + 1}`}
                className="ms-auto flex size-9 items-center justify-center rounded-md text-text-muted hover:bg-surface-secondary hover:text-text"
              >
                ✕
              </button>
            </div>

            {row.kind === VariableKind.Choice ? (
              <ChoiceEditor
                rowKey={row.key}
                values={row.options?.values ?? []}
                onChange={(values) => patch(index, { options: { values } })}
              />
            ) : null}

            {row.kind === VariableKind.Pronoun ? (
              <PronounEditor
                rowKey={row.key}
                forms={row.options?.forms ?? []}
                sets={row.options?.sets ?? []}
                onChange={(options) => patch(index, { options })}
              />
            ) : null}

            {!complete(row) ? (
              <p className="mt-2 text-xs text-text-muted">
                กรอกตัวแทนและคำถามให้ครบ แถวนี้ถึงจะถูกบันทึก
              </p>
            ) : null}

            <RowErrors fields={fields} index={index} />
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={() =>
          setRows([
            ...rows,
            rowOf({ token: "", label: "", kind: VariableKind.Text }, rows.length),
          ])
        }
        className="mt-3 inline-flex min-h-9 items-center rounded-md border border-dashed border-border px-3 text-[13px] text-text-secondary hover:border-primary-200 hover:text-primary"
      >
        + ตัวแปรของฉันเอง
      </button>

      {hasIncomplete ? (
        <p className="mt-3 text-xs text-text-muted">
          แถวที่ยังกรอกไม่ครบจะยังไม่ถูกบันทึก - แถวอื่นบันทึกให้ตามปกติ
        </p>
      ) : null}

      {/* The advisory report (§13H) - warnings, never errors. */}
      {adoptable.length > 0 ? (
        <div className="mt-4 flex gap-2 rounded-md border border-warning/30 bg-warning/8 px-3 py-2.5 text-sm leading-relaxed text-warning">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p>
              พบตัวแทนในเนื้อเรื่องที่ยังไม่ได้ประกาศ:{" "}
              <span className="font-mono">{adoptable.join(" ")}</span> -
              ผู้อ่านจะเห็นเป็นตัวอักษรตรง ๆ จนกว่าจะประกาศ
            </p>
            {/* The fix is one press, HERE (review item C) - not a trip back
                up the page to retype what the scan already found. */}
            <button
              type="button"
              onClick={() => adoptable.forEach(adopt)}
              className="mt-2 inline-flex min-h-8 items-center rounded-md border border-warning/40 bg-surface px-3 text-xs font-medium text-warning hover:border-warning"
            >
              เพิ่มตัวแปรที่พบทั้งหมด ({adoptable.length})
            </button>
          </div>
        </div>
      ) : null}

      {characterLike.length > 0 ? (
        <div className="mt-3 flex gap-2 rounded-md bg-surface-secondary px-3 py-2.5 text-sm leading-relaxed text-text-secondary">
          <Icon name="users" size={16} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p>
              วงเล็บเหล่านี้ตรงกับชื่อตัวละครของเรื่อง:{" "}
              <span className="font-mono">{characterLike.join(" ")}</span> -
              น่าจะเป็นการเขียนชื่อสองแบบของตัวละคร ไม่ใช่ตัวแปรผู้อ่าน
              ระบบจึงไม่นับรวมในปุ่มด้านบน
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
              ถ้าตั้งใจให้เป็นตัวแปรจริง:
              {characterLike.map((token) => (
                <button
                  key={token}
                  type="button"
                  onClick={() => adopt(token)}
                  className="inline-flex min-h-7 items-center rounded-md border border-border bg-surface px-2 font-mono text-[11px] hover:border-primary-200 hover:text-primary"
                >
                  + {token}
                </button>
              ))}
            </p>
          </div>
        </div>
      ) : null}

      {usage.unused.length > 0 ? (
        <p className="mt-3 flex gap-2 rounded-md bg-surface-secondary px-3 py-2 text-sm leading-relaxed text-text-secondary">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
          <span>
            ประกาศไว้แต่ยังไม่ได้ใช้ที่ไหนเลย:{" "}
            <span className="font-mono">{usage.unused.join(" ")}</span>
          </span>
        </p>
      ) : null}
    </section>
  );
}

function Cell({
  label,
  id,
  width,
  children,
}: {
  label: string;
  id: string;
  width: string;
  children: React.ReactNode;
}) {
  return (
    <span className={width}>
      <label htmlFor={id} className="mb-1 block text-xs text-text-muted">
        {label}
      </label>
      {children}
    </span>
  );
}

/** Field errors for one row, keyed the way the API returns them. */
function RowErrors({
  fields,
  index,
}: {
  fields: Record<string, string[]>;
  index: number;
}) {
  const prefix = `variables[${index}]`;
  const messages = Object.entries(fields)
    .filter(([key]) => key.startsWith(prefix))
    .flatMap(([, values]) => values);

  if (messages.length === 0) return null;
  return (
    <p role="alert" className="mt-2 text-sm text-error">
      {messages[0]}
    </p>
  );
}

function ChoiceEditor({
  rowKey,
  values,
  onChange,
}: {
  rowKey: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2">
      <span className="text-xs text-text-muted">ตัวเลือก</span>
      {values.map((value, index) => (
        <span key={index} className="flex items-center gap-1">
          <label className="sr-only" htmlFor={`choice-${rowKey}-${index}`}>
            ตัวเลือกที่ {index + 1}
          </label>
          <input
            id={`choice-${rowKey}-${index}`}
            value={value}
            onChange={(event) =>
              onChange(values.map((item, i) => (i === index ? event.target.value : item)))
            }
            className="min-h-8 w-28 rounded-md border border-border bg-surface px-2 text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            aria-label={`ลบตัวเลือก ${value || index + 1}`}
            onClick={() => onChange(values.filter((_, i) => i !== index))}
            className="flex size-7 items-center justify-center rounded-md text-text-muted hover:text-text"
          >
            ✕
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={() => onChange([...values, ""])}
        className="inline-flex min-h-8 items-center rounded-md border border-dashed border-border px-2.5 text-xs text-text-secondary hover:border-primary-200 hover:text-primary"
      >
        + ตัวเลือก
      </button>
    </div>
  );
}

/**
 * The pronoun editor.
 *
 * Forms are the columns and sets are the rows, because that is what a pronoun
 * is: choosing เขา also decides ของเขา, and the writer needs to see the two
 * lined up. Adding a form appends a blank answer to every set rather than
 * leaving them short - a short row would shift the remaining words onto the
 * wrong form.
 */
function PronounEditor({
  rowKey,
  forms,
  sets,
  onChange,
}: {
  rowKey: string;
  forms: string[];
  sets: Array<{ label: string; values: string[] }>;
  onChange: (options: { forms: string[]; sets: Array<{ label: string; values: string[] }> }) => void;
}) {
  function setForm(index: number, value: string) {
    onChange({ forms: forms.map((f, i) => (i === index ? value : f)), sets });
  }

  function addForm() {
    onChange({
      forms: [...forms, ""],
      sets: sets.map((set) => ({ ...set, values: [...set.values, ""] })),
    });
  }

  function removeForm(index: number) {
    onChange({
      forms: forms.filter((_, i) => i !== index),
      sets: sets.map((set) => ({
        ...set,
        values: set.values.filter((_, i) => i !== index),
      })),
    });
  }

  return (
    <div className="mt-2.5 rounded-md border border-border bg-surface p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-muted">รูปของคำ</span>
        {forms.map((form, index) => (
          <span key={index} className="flex items-center gap-1">
            <label className="sr-only" htmlFor={`form-${rowKey}-${index}`}>
              ชื่อรูปที่ {index + 1}
            </label>
            <input
              id={`form-${rowKey}-${index}`}
              value={form}
              onChange={(event) => setForm(index, event.target.value)}
              placeholder="ประธาน"
              className="min-h-8 w-24 rounded-md border border-border px-2 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              aria-label={`ลบรูป ${form || index + 1}`}
              onClick={() => removeForm(index)}
              className="flex size-7 items-center justify-center rounded-md text-text-muted hover:text-text"
            >
              ✕
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={addForm}
          className="inline-flex min-h-8 items-center rounded-md border border-dashed border-border px-2.5 text-xs text-text-secondary hover:border-primary-200 hover:text-primary"
        >
          + รูป
        </button>
      </div>

      <ul className="mt-2.5 flex flex-col gap-2">
        {sets.map((set, setIndex) => (
          <li key={setIndex} className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`set-${rowKey}-${setIndex}`}>
              ชื่อชุดที่ {setIndex + 1}
            </label>
            <input
              id={`set-${rowKey}-${setIndex}`}
              value={set.label}
              onChange={(event) =>
                onChange({
                  forms,
                  sets: sets.map((item, i) =>
                    i === setIndex ? { ...item, label: event.target.value } : item,
                  ),
                })
              }
              placeholder="ชื่อชุด เช่น เขา"
              className="min-h-8 w-28 rounded-md border border-border px-2 text-sm font-medium outline-none focus:border-primary"
            />
            {forms.map((form, formIndex) => (
              <span key={formIndex} className="flex items-center gap-1">
                <label
                  className="text-xs text-text-muted"
                  htmlFor={`set-${rowKey}-${setIndex}-${formIndex}`}
                >
                  {form || `รูป ${formIndex + 1}`}
                </label>
                <input
                  id={`set-${rowKey}-${setIndex}-${formIndex}`}
                  value={set.values[formIndex] ?? ""}
                  onChange={(event) =>
                    onChange({
                      forms,
                      sets: sets.map((item, i) => {
                        if (i !== setIndex) return item;
                        const values = [...item.values];
                        while (values.length < forms.length) values.push("");
                        values[formIndex] = event.target.value;
                        return { ...item, values };
                      }),
                    })
                  }
                  className="min-h-8 w-24 rounded-md border border-border px-2 text-sm outline-none focus:border-primary"
                />
              </span>
            ))}
            <button
              type="button"
              aria-label={`ลบชุด ${set.label || setIndex + 1}`}
              onClick={() => onChange({ forms, sets: sets.filter((_, i) => i !== setIndex) })}
              className="flex size-7 items-center justify-center rounded-md text-text-muted hover:text-text"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() =>
          onChange({ forms, sets: [...sets, { label: "", values: forms.map(() => "") }] })
        }
        className="mt-2 inline-flex min-h-8 items-center rounded-md border border-dashed border-border px-2.5 text-xs text-text-secondary hover:border-primary-200 hover:text-primary"
      >
        + ชุดคำ
      </button>
    </div>
  );
}
