"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import {
  FANDOM_TOTAL_MAX,
  MAX_FANDOMS,
  isCrossover,
  joinFandoms,
  splitFandoms,
} from "@/lib/fandom";

/**
 * เรื่องต้นทาง as a chip field (create review 2026-08: "ช่องเดียวรับหลายด้อม
 * อย่าเพิ่มช่องที่สอง").
 *
 * Enter adds, ✕ removes, and the value the caller holds stays the ONE string
 * the API stores - the chips are an input convenience over it, not a new data
 * shape. Typing without pressing Enter still counts: the pending text commits
 * on blur, so a writer who types one fandom and tabs away is never told the
 * field is empty.
 *
 * At two chips the field shows the Crossover label it just earned - derived,
 * exactly like ผสมรูปแบบ. The cap is three: beyond that the tag stops meaning
 * anything in search.
 */
export function FandomChips({
  id,
  value,
  onChange,
  disabled = false,
}: {
  /** The text input's id, so the caller's <label htmlFor> reaches it. */
  id: string;
  /** The joined fandom string exactly as the API stores it. */
  value: string;
  onChange: (joined: string) => void;
  disabled?: boolean;
}) {
  const fandoms = splitFandoms(value);
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);

  function add() {
    const name = text.trim();
    if (name === "") return;
    if (fandoms.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
      setText("");
      return;
    }
    if (fandoms.length >= MAX_FANDOMS) {
      setNote(`ใส่ได้ไม่เกิน ${MAX_FANDOMS} เรื่อง - เกินกว่านั้นแท็กหมดความหมายในการค้นหา`);
      return;
    }
    const joined = joinFandoms([...fandoms, name]);
    if (joined.length > FANDOM_TOTAL_MAX) {
      setNote(`ชื่อรวมกันยาวเกิน ${FANDOM_TOTAL_MAX} ตัวอักษร`);
      return;
    }
    onChange(joined);
    setText("");
    setNote(null);
  }

  function remove(name: string) {
    onChange(joinFandoms(fandoms.filter((existing) => existing !== name)));
    setNote(null);
  }

  return (
    <div>
      {fandoms.length > 0 ? (
        <ul className="mb-2 flex flex-wrap items-center gap-1.5" aria-label="เรื่องต้นทางที่ใส่ไว้">
          {fandoms.map((name) => (
            <li key={name}>
              <button
                type="button"
                onClick={() => remove(name)}
                disabled={disabled}
                title="เอาออก"
                className="inline-flex min-h-7 items-center gap-1 rounded-full border border-primary bg-primary-50 px-2.5 text-xs text-primary disabled:opacity-50"
              >
                {name}
                <Icon name="close" size={11} />
              </button>
            </li>
          ))}
          {/* Earned, not declared (the ผสมรูปแบบ principle): two sources IS
              a crossover, so the label appears by itself. */}
          {isCrossover(value) ? (
            <li className="inline-flex min-h-7 items-center rounded-full bg-surface-secondary px-2.5 font-mono text-[11px] text-text-secondary">
              Crossover
            </li>
          ) : null}
        </ul>
      ) : null}

      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setNote(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          onBlur={add}
          disabled={disabled || fandoms.length >= MAX_FANDOMS}
          autoComplete="off"
          placeholder={
            fandoms.length === 0 ? "เช่น ชื่อซีรีส์ วง หรือเกม" : "เพิ่มอีกเรื่อง (crossover)"
          }
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm disabled:opacity-50"
        />
        <button
          type="button"
          onClick={add}
          disabled={disabled || text.trim() === "" || fandoms.length >= MAX_FANDOMS}
          className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-sm text-text-secondary hover:border-primary-200 hover:text-text disabled:opacity-50"
        >
          เพิ่ม
        </button>
      </div>

      {note ? (
        <p role="alert" className="mt-1.5 text-xs text-warning">
          {note}
        </p>
      ) : null}
    </div>
  );
}
