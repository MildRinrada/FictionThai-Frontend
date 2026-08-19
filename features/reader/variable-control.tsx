"use client";

import { useSyncExternalStore } from "react";

import { Icon } from "@/components/ui/icon";
import {
  VALUE_FALLBACK,
  getReaderProfile,
  getReaderValues,
  getReaderValuesServerSnapshot,
  setReaderProfileValue,
  setReaderValue,
  subscribeReaderValues,
} from "@/lib/reader-values";
import { VariableKind, type NovelVariable } from "@/types/variable";

/**
 * The reader's answers to a fiction's variables
 * (docs/PHASE-13-CREATION-AND-CONTROL.md §13H).
 *
 * The whole feature from the reader's side: answer the author's questions, and
 * the placeholders they wrote read as those answers everywhere in the fiction.
 *
 * Nothing here is sent anywhere, and the card says so - a reader typing their
 * own name into a romance deserves to know where it goes. Read through an
 * external store so the server render and the hydration render agree.
 */
export function VariableControl({
  novelID,
  variables,
}: {
  novelID: string;
  variables: NovelVariable[];
}) {
  const values = useSyncExternalStore(
    subscribeReaderValues,
    () => getReaderValues(novelID),
    getReaderValuesServerSnapshot,
  );
  const profile = useSyncExternalStore(
    subscribeReaderValues,
    getReaderProfile,
    getReaderValuesServerSnapshot,
  );

  if (variables.length === 0) return null;

  const first = variables[0];
  const sample =
    values[first.token] || profile[first.label] || first.default_value || VALUE_FALLBACK;

  return (
    <section
      aria-labelledby={`vars-${novelID}-heading`}
      className="rounded-lg border border-primary-200 bg-primary-50 p-4"
    >
      <p id={`vars-${novelID}-heading`} className="mono-label flex items-center gap-1.5">
        <Icon name="user" size={13} />
        เรื่องนี้ให้คุณเติมชื่อเองได้
      </p>

      <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
        ผู้เขียนใส่ตัวแทนไว้ในเนื้อเรื่อง - ตอบคำถามข้างล่างแล้วระบบจะแสดงคำที่คุณเลือกแทนทุกจุด
      </p>

      <div className="mt-3 flex flex-col gap-3">
        {variables.map((variable) => (
          <VariableField
            key={variable.id}
            novelID={novelID}
            variable={variable}
            value={values[variable.token] ?? ""}
            profileValue={profile[variable.label] ?? ""}
          />
        ))}
      </div>

      <p className="mt-3.5 text-[13px] text-text-secondary">
        ตัวอย่าง: “{sample}เดินเข้าไปในร้านนั้นอีกครั้ง”
      </p>

      <p className="mt-3 text-xs text-text-muted">
        คำตอบเหล่านี้เก็บไว้ในเครื่องของคุณเท่านั้น ไม่ถูกส่งไปที่เซิร์ฟเวอร์
        และผู้เขียนไม่เห็น - ถ้าติ๊ก “จำไว้ใช้กับเรื่องอื่น” ระบบจะเติมให้อัตโนมัติ
        เมื่อเจอคำถามเดียวกัน แต่ยังอยู่ในเครื่องนี้เครื่องเดียว
      </p>
    </section>
  );
}

function VariableField({
  novelID,
  variable,
  value,
  profileValue,
}: {
  novelID: string;
  variable: NovelVariable;
  value: string;
  profileValue: string;
}) {
  const inputID = `var-${variable.id}`;
  const remembered = profileValue !== "";
  // What the reader sees in the field: their answer for this fiction, or the
  // profile answer that is already filling the slots for them.
  const shown = value || profileValue;

  function onChange(next: string) {
    setReaderValue(novelID, variable.token, next);
    // Keeping the profile in step means unticking is the only way to forget -
    // an answer that stayed behind after being changed would quietly refill it.
    if (remembered) setReaderProfileValue(variable.label, next);
  }

  return (
    <div>
      <label htmlFor={inputID} className="block text-[13px] font-medium">
        {variable.label}
      </label>

      {variable.kind === VariableKind.Text ? (
        <input
          id={inputID}
          value={shown}
          onChange={(event) => onChange(event.target.value)}
          placeholder={variable.default_value || VALUE_FALLBACK}
          maxLength={40}
          className="mt-1.5 min-h-10 w-full max-w-xs rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
        />
      ) : (
        <select
          id={inputID}
          value={shown}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1.5 min-h-10 w-full max-w-xs rounded-md border border-border bg-surface px-2.5 text-sm outline-none focus:border-primary"
        >
          <option value="">{variable.default_value || "- เลือก -"}</option>
          {optionsFor(variable).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}

      <label className="mt-1.5 flex w-fit items-center gap-1.5 text-xs text-text-muted">
        <input
          type="checkbox"
          checked={remembered}
          onChange={(event) =>
            setReaderProfileValue(variable.label, event.target.checked ? shown : "")
          }
          className="size-3.5 accent-primary"
        />
        จำไว้ใช้กับเรื่องอื่น
      </label>
    </div>
  );
}

/** A choice offers its values; a pronoun offers its sets by label. */
function optionsFor(variable: NovelVariable): string[] {
  if (variable.kind === VariableKind.Pronoun) {
    return (variable.options?.sets ?? []).map((set) => set.label);
  }
  return variable.options?.values ?? [];
}
