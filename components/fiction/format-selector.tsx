"use client";

import { Field } from "@/components/ui/field";
import type { FictionFormat } from "@/types/fiction";
import { ContentMode, PresentationFormat, StoryStructure } from "@/types/fiction";

/**
 * Chooses a fiction's format.
 *
 * THREE INDEPENDENT CONTROLS, one per dimension - never a single list of eight
 * combined options (docs/08 §43 Rule 6). A combined control would make the
 * dimensions look mutually exclusive to a writer, and would need rebuilding the
 * moment a fourth value is added to any one of them.
 *
 * docs/01 §15 asks that the creation flow explain the options in understandable
 * language rather than technical terminology, so each choice carries a plain
 * Thai description rather than its wire value.
 */

interface Option<T extends string> {
  value: T;
  label: string;
  description: string;
}

const STORY_STRUCTURES: Option<StoryStructure>[] = [
  {
    value: StoryStructure.MultiChapter,
    label: "หลายตอน",
    description: "เล่าเรื่องต่อเนื่องหลายตอน ผู้อ่านจะมีเมนูสารบัญและติดตามตอนใหม่ได้",
  },
  {
    value: StoryStructure.OneShot,
    label: "จบในตอนเดียว",
    description: "เรื่องที่อ่านจบได้ในครั้งเดียว ผู้อ่านจะไม่เห็นเมนูข้ามตอน",
  },
];

const PRESENTATION_FORMATS: Option<PresentationFormat>[] = [
  {
    value: PresentationFormat.Standard,
    label: "ร้อยแก้ว",
    description: "รูปแบบการอ่านแบบนิยายทั่วไป เขียนเป็นย่อหน้า",
  },
  {
    value: PresentationFormat.Chat,
    label: "แชทล้วน",
    description: "เล่าเรื่องผ่านบทสนทนา ผู้อ่านจะเห็นเป็นข้อความโต้ตอบกัน",
  },
  {
    value: PresentationFormat.Headcanon,
    label: "เฮดแคนอน",
    description: "แต่ละตอนเป็นหัวข้อ ผู้อ่านจะเห็นเป็นกล่องแยกตามตัวละคร",
  },
];

const CONTENT_MODES: Option<ContentMode>[] = [
  {
    value: ContentMode.General,
    label: "ทั่วไป",
    description: "เนื้อหาทั่วไป ไม่ได้ระบุประเภทเฉพาะ",
  },
  {
    value: ContentMode.Headcanon,
    label: "งานเฮดแคนอน",
    description: "ระบุชัดเจนว่าเป็นงานเฮดแคนอน ผู้อ่านจะเห็นป้ายกำกับบนหน้าเรื่อง",
  },
];

export interface FormatSelectorProps {
  value: FictionFormat;
  onChange: (next: FictionFormat) => void;
  /** Server-supplied per-dimension errors from a 422 payload. */
  errors?: Record<string, string[]>;
  disabled?: boolean;
}

export function FormatSelector({
  value,
  onChange,
  errors = {},
  disabled,
}: FormatSelectorProps) {
  return (
    <div className="space-y-6">
      <Dimension
        name="story_structure"
        label="โครงสร้างเรื่อง"
        options={STORY_STRUCTURES}
        selected={value.story_structure}
        errors={errors.story_structure}
        disabled={disabled}
        // Each dimension updates ONLY itself. Spreading the current value keeps
        // the other two exactly as they were - the UI mirror of the API rule
        // that a partial format change never resets what it did not mention.
        onSelect={(next) => onChange({ ...value, story_structure: next })}
      />

      <Dimension
        name="presentation_format"
        label="รูปแบบการนำเสนอ"
        options={PRESENTATION_FORMATS}
        selected={value.presentation_format}
        errors={errors.presentation_format}
        disabled={disabled}
        onSelect={(next) => onChange({ ...value, presentation_format: next })}
      />

      <Dimension
        name="content_mode"
        label="ประเภทเนื้อหา"
        options={CONTENT_MODES}
        selected={value.content_mode}
        errors={errors.content_mode}
        disabled={disabled}
        onSelect={(next) => onChange({ ...value, content_mode: next })}
      />
    </div>
  );
}

interface DimensionProps<T extends string> {
  name: string;
  label: string;
  options: Option<T>[];
  selected: T;
  errors?: string[];
  disabled?: boolean;
  onSelect: (value: T) => void;
}

/**
 * One dimension, as a radio group.
 *
 * A `fieldset`/`legend` with real radio inputs rather than styled buttons: it
 * gives arrow-key navigation and a single tab stop for free, and announces the
 * group name with every option (docs/05 §31, WCAG 2.2 AA).
 */
function Dimension<T extends string>({
  name,
  label,
  options,
  selected,
  errors,
  disabled,
  onSelect,
}: DimensionProps<T>) {
  return (
    <Field id={name} label={label} errors={errors}>
      <fieldset disabled={disabled} className="mt-1 space-y-2">
        <legend className="sr-only">{label}</legend>

        {options.map((option) => {
          const id = `${name}-${option.value}`;
          const isSelected = selected === option.value;

          return (
            <label
              key={option.value}
              htmlFor={id}
              className={[
                "flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors",
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40",
              ].join(" ")}
            >
              <input
                type="radio"
                id={id}
                name={name}
                value={option.value}
                checked={isSelected}
                onChange={() => onSelect(option.value)}
                className="mt-1 size-4 shrink-0 accent-primary"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="mt-0.5 block text-xs text-text-secondary">
                  {option.description}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>
    </Field>
  );
}
