"use client";

import Link from "next/link";

import { Field, fieldInputProps } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import {
  COMMENT_ACCESS_CHOICES,
  CommentAccess,
  type CreateNovelRequest,
} from "@/types/novel";
import {
  VARIABLE_PRESETS,
  tokenFromKey,
  tokenKey,
  type VariableInput,
} from "@/types/variable";

/**
 * ตั้งค่าเพิ่มเติม - the collapsed section of the create form
 * (docs/PHASE-13-CREATION-AND-CONTROL.md §13K, rebuilt in 13U, regrouped 13V).
 *
 * 13V gave the section the structure its second half already had: four named
 * groups - การตีพิมพ์, ผู้อ่านและคอมเมนต์, การแสดงผล, สิทธิ์ - instead of a
 * raft of floating fields above three headed ones.
 *
 * Two 13V corrections of substance:
 *
 *   - ซีรีส์ is a PICKER over the writer's existing series plus "สร้างใหม่",
 *     not a free-text field. Free text was how one series ends up stored
 *     under three spellings.
 *
 *   - ปุ่มสนับสนุน defaults OFF and is disabled until the writer has a
 *     payment link at all. Money is opt-in, and a checkbox conditioned on a
 *     parenthesis was neither honest nor usable.
 */

/** The shape the section edits, before it becomes a request body. */
export interface ExtrasValues {
  language: string;
  chapter_unit: string;
  /** สถานะเรื่อง (13U): a new fiction is a draft; "จบแล้ว" marks it completed. */
  story_state: "writing" | "completed";
  series_name: string;
  series_position: string;
  author_note_start: string;
  author_note_end: string;
  comment_access: string;
  comment_approval: boolean;
  /** ตัวแปรผู้อ่าน (13U): the declarations, seeded via PUT /variables. */
  variables_enabled: boolean;
  variables: VariableInput[];
  /** 13U display switches. theme_color is "" for none. */
  hide_counts: boolean;
  show_donate: boolean;
  theme_color: string;
  allow_screenshot: boolean;
  allow_translation: boolean;
  allow_derivative: boolean;
  allow_audio: boolean;
  require_credit: boolean;
  derivative_terms: string;
}

/** What the section starts as: the API's own defaults, mirrored. */
export const EXTRAS_DEFAULTS: ExtrasValues = {
  language: "th",
  chapter_unit: "ตอน",
  story_state: "writing",
  series_name: "",
  series_position: "",
  author_note_start: "",
  author_note_end: "",
  comment_access: CommentAccess.Members,
  comment_approval: false,
  variables_enabled: false,
  variables: [],
  hide_counts: false,
  // Money is opt-in (13V) - never a default.
  show_donate: false,
  theme_color: "",
  allow_screenshot: true,
  allow_translation: false,
  allow_derivative: false,
  allow_audio: false,
  require_credit: true,
  derivative_terms: "",
};

/** The chapter units writers actually use. "อื่น ๆ" opens a free field. */
const CHAPTER_UNITS = ["ตอน", "ตอนที่", "บทที่", "EP.", "ท่อน"];

/** The accent swatches. Curated, dark enough to carry white text. */
export const THEME_SWATCHES = [
  "#b5453c",
  "#a34d7c",
  "#7c4da3",
  "#4d5aa3",
  "#2e7ea6",
  "#2e8a6b",
  "#8a7a2e",
  "#8a562e",
] as const;

/**
 * Each swatch's NAME (settings review 2026-08, item F): nine circles with
 * hex-code labels answered "which colour is this" with a number. The name is
 * what a screen reader says and what the picker shows for the current choice.
 */
export const THEME_SWATCH_NAMES: Record<string, string> = {
  "#b5453c": "แดงอิฐ",
  "#a34d7c": "ชมพูเข้ม",
  "#7c4da3": "ม่วง",
  "#4d5aa3": "น้ำเงินหม่น",
  "#2e7ea6": "ฟ้าทะเล",
  "#2e8a6b": "เขียวหยก",
  "#8a7a2e": "เขียวมะกอก",
  "#8a562e": "น้ำตาลอบอุ่น",
};

/**
 * Turns the section's values into the fields the API takes.
 *
 * Empty strings are dropped rather than sent: an empty series name is "no
 * series", not a series called nothing.
 */
export function extrasPayload(values: ExtrasValues): Partial<CreateNovelRequest> {
  const position = Number.parseInt(values.series_position, 10);
  const series = values.series_name.trim();

  return {
    language: values.language,
    chapter_unit: values.chapter_unit.trim() || "ตอน",
    ...(values.story_state === "completed" ? { status: "completed" as const } : {}),
    ...(series ? { series_name: series } : {}),
    ...(series && Number.isFinite(position) && position > 0
      ? { series_position: position }
      : {}),
    ...(values.author_note_start.trim()
      ? { author_note_start: values.author_note_start.trim() }
      : {}),
    ...(values.author_note_end.trim()
      ? { author_note_end: values.author_note_end.trim() }
      : {}),
    comment_access: values.comment_access as CreateNovelRequest["comment_access"],
    // Guest comments are held by the API whatever this says, so sending it as
    // the writer left it is honest: the switch covers member comments, and the
    // helper text under it says exactly that.
    comment_approval: values.comment_approval,
    hide_counts: values.hide_counts,
    show_donate: values.show_donate,
    ...(values.theme_color ? { theme_color: values.theme_color } : {}),
    allow_screenshot: values.allow_screenshot,
    allow_translation: values.allow_translation,
    allow_derivative: values.allow_derivative,
    allow_audio: values.allow_audio,
    require_credit: values.require_credit,
    ...(values.allow_derivative && values.derivative_terms.trim()
      ? { derivative_terms: values.derivative_terms.trim() }
      : {}),
  };
}

/** The selected level's own explanation, so the hint answers the choice. */
function commentAccessHint(value: string): string {
  return COMMENT_ACCESS_CHOICES.find((choice) => choice.value === value)?.hint ?? "";
}

/** The author's stated permissions (§13E), in the order a writer thinks of them. */
export const PERMISSION_FIELDS = [
  ["allow_screenshot", "อนุญาตให้แคป/แชร์ภาพบางส่วน"],
  ["allow_translation", "อนุญาตให้แปลเป็นภาษาอื่น"],
  ["allow_derivative", "อนุญาตให้ทำ fanart หรือฟิคต่อยอด"],
  ["allow_audio", "อนุญาตให้อ่านออกเสียง / ทำคลิป"],
  ["require_credit", "ขอให้ให้เครดิตพร้อมลิงก์"],
] as const;

/** A named group inside the section (13V) - the structure the review asked for. */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-hairline pt-4 first:border-t-0 first:pt-0">
      <h4 className="mono-label">{title}</h4>
      <div className="mt-3 flex flex-col gap-4">{children}</div>
    </section>
  );
}

export function ExtrasSection({
  open,
  onToggle,
  values,
  onChange,
  errors,
  disabled,
  hasTemplate,
  onSaveTemplate,
  onApplyTemplate,
  seriesOptions,
  hasDonationLink,
}: {
  open: boolean;
  onToggle: () => void;
  values: ExtrasValues;
  onChange: (changes: Partial<ExtrasValues>) => void;
  errors: Record<string, string[]>;
  disabled?: boolean;
  hasTemplate: boolean;
  onSaveTemplate: () => void;
  onApplyTemplate: () => void;
  /**
   * The writer's existing series names, or null while unknown. The picker is
   * what keeps one series from being stored under three spellings (13V).
   */
  seriesOptions: string[] | null;
  /** Whether the writer has a support link at all (13V). */
  hasDonationLink: boolean;
}) {
  // "" = no series, "__new__" = typing a new name.
  const knownSeries = seriesOptions ?? [];
  const seriesIsKnown =
    values.series_name === "" || knownSeries.includes(values.series_name);

  return (
    <section className="rounded-lg border border-border">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-start text-sm font-medium"
      >
        <Icon name={open ? "chevron-down" : "chevron-right"} size={16} />
        ตั้งค่าเพิ่มเติม
        <span className="ms-auto text-xs font-normal text-text-muted">
          ไม่ต้องกรอกก็ได้ - แก้ทีหลังได้ทุกอย่าง
        </span>
      </button>

      {open ? (
        <div className="flex flex-col gap-5 border-t border-hairline px-4 py-4">
          {/* The section's memory (13U). */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-text-muted">ค่าจากเรื่องล่าสุดของคุณถูกใส่ให้แล้ว</span>
            <button
              type="button"
              onClick={onSaveTemplate}
              disabled={disabled}
              className="inline-flex min-h-8 items-center rounded-md border border-border px-2.5 text-text-secondary hover:border-primary-200 hover:text-text disabled:opacity-50"
            >
              บันทึกค่าชุดนี้เป็นเทมเพลต
            </button>
            {hasTemplate ? (
              <button
                type="button"
                onClick={onApplyTemplate}
                disabled={disabled}
                className="inline-flex min-h-8 items-center rounded-md border border-border px-2.5 text-text-secondary hover:border-primary-200 hover:text-text disabled:opacity-50"
              >
                ใช้เทมเพลตของฉัน
              </button>
            ) : null}
          </div>

          <Group title="การตีพิมพ์">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                id="chapter_unit"
                label="เรียกหน่วยว่า"
                errors={errors.chapter_unit}
                hint="ค่าเริ่มต้น - แต่ละตอนเลือกใหม่ได้ตอนสร้าง"
              >
                {/* A closed list plus an escape (create review item 9): a free
                    text field here is how "ตอนที่", "ตอนที๋", and " ตอนที่ "
                    become three different units in the reader's chapter list. */}
                <select
                  {...fieldInputProps("chapter_unit", errors.chapter_unit, "hint")}
                  value={
                    CHAPTER_UNITS.includes(values.chapter_unit)
                      ? values.chapter_unit
                      : "__custom__"
                  }
                  onChange={(event) => {
                    const value = event.target.value;
                    onChange({
                      chapter_unit: value === "__custom__" ? "" : value,
                    });
                  }}
                  disabled={disabled}
                >
                  {CHAPTER_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                  <option value="__custom__">อื่น ๆ…</option>
                </select>
                {!CHAPTER_UNITS.includes(values.chapter_unit) ? (
                  <input
                    aria-label="หน่วยตอนแบบกำหนดเอง"
                    autoFocus
                    type="text"
                    value={values.chapter_unit}
                    onChange={(event) => onChange({ chapter_unit: event.target.value })}
                    disabled={disabled}
                    placeholder="เช่น องก์ที่"
                    className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                  />
                ) : null}
              </Field>

              <Field id="language" label="ภาษา" errors={errors.language}>
                <select
                  {...fieldInputProps("language", errors.language)}
                  value={values.language}
                  onChange={(event) => onChange({ language: event.target.value })}
                  disabled={disabled}
                >
                  <option value="th">ไทย</option>
                  <option value="en">English</option>
                </select>
              </Field>

              <Field id="story_state" label="สถานะเรื่อง" errors={errors.status}>
                <select
                  {...fieldInputProps("story_state", errors.status)}
                  value={values.story_state}
                  onChange={(event) =>
                    onChange({
                      story_state: event.target.value as ExtrasValues["story_state"],
                    })
                  }
                  disabled={disabled}
                >
                  <option value="writing">ยังเขียนอยู่</option>
                  <option value="completed">จบแล้ว</option>
                </select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* A PICKER over the writer's own series (13V). Free text only
                  appears behind "สร้างซีรีส์ใหม่", so an existing series is
                  chosen, never re-typed. */}
              <Field id="series_pick" label="อยู่ในซีรีส์" errors={errors.series_name}>
                <select
                  {...fieldInputProps("series_pick", errors.series_name)}
                  value={seriesIsKnown ? values.series_name : "__new__"}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === "__new__") {
                      onChange({ series_name: " " });
                    } else {
                      onChange({ series_name: value, ...(value === "" ? { series_position: "" } : {}) });
                    }
                  }}
                  disabled={disabled}
                >
                  <option value="">ไม่อยู่ในซีรีส์</option>
                  {knownSeries.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                  <option value="__new__">+ สร้างซีรีส์ใหม่…</option>
                </select>
                {!seriesIsKnown ? (
                  <input
                    aria-label="ชื่อซีรีส์ใหม่"
                    autoFocus
                    value={values.series_name.trimStart()}
                    onChange={(event) => onChange({ series_name: event.target.value })}
                    disabled={disabled}
                    placeholder="ชื่อซีรีส์"
                    className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                  />
                ) : null}
              </Field>

              <Field
                id="series_position"
                label="ลำดับในซีรีส์"
                errors={errors.series_position}
              >
                <input
                  {...fieldInputProps("series_position", errors.series_position)}
                  type="number"
                  min={1}
                  value={values.series_position}
                  onChange={(event) => onChange({ series_position: event.target.value })}
                  disabled={disabled || values.series_name.trim() === ""}
                />
              </Field>
            </div>

            {/* Stacked, not side by side (13V): a multi-line box needs width. */}
            <Field
              id="author_note_start"
              label="โน้ตผู้เขียน (ต้นเรื่อง)"
              errors={errors.author_note_start}
              hint="แยกจากเรื่องย่อ ไม่ไปโผล่ในหน้าค้นหา"
            >
              <textarea
                {...fieldInputProps("author_note_start", errors.author_note_start, "hint")}
                rows={2}
                value={values.author_note_start}
                onChange={(event) => onChange({ author_note_start: event.target.value })}
                disabled={disabled}
              />
            </Field>

            <Field
              id="author_note_end"
              // Named for where it actually appears (create review item 8):
              // a note that ends every chapter is not a "ท้ายเรื่อง" note.
              label="โน้ตผู้เขียน (ท้ายทุกตอน)"
              errors={errors.author_note_end}
              hint="ขึ้นท้ายทุกตอน เช่น ช่องทางติดตาม"
            >
              <textarea
                {...fieldInputProps("author_note_end", errors.author_note_end, "hint")}
                rows={2}
                value={values.author_note_end}
                onChange={(event) => onChange({ author_note_end: event.target.value })}
                disabled={disabled}
              />
            </Field>

          </Group>

          <Group title="ผู้อ่านและคอมเมนต์">
            <Field
              id="comment_access"
              label="ใครคอมเมนต์ได้"
              errors={errors.comment_access}
              hint={commentAccessHint(values.comment_access)}
            >
              <select
                {...fieldInputProps("comment_access", errors.comment_access, "hint")}
                value={values.comment_access}
                onChange={(event) => onChange({ comment_access: event.target.value })}
                disabled={disabled}
              >
                {COMMENT_ACCESS_CHOICES.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </Field>

            {/* Indented under the question it belongs to (13V), and absent
                entirely when the thread is closed. */}
            {values.comment_access !== CommentAccess.Off ? (
              <label className="ms-3 flex w-fit items-start gap-2.5 border-s-2 border-hairline ps-3 text-sm">
                <input
                  type="checkbox"
                  checked={values.comment_approval}
                  onChange={(event) => onChange({ comment_approval: event.target.checked })}
                  disabled={disabled}
                  className="mt-0.5 size-4 accent-primary"
                />
                <span>
                  ตรวจก่อนโพสต์
                  <span className="mt-0.5 block text-xs text-text-muted">
                    {values.comment_access === CommentAccess.Everyone
                      ? "ของคนไม่ล็อกอินรอตรวจเสมออยู่แล้ว - ติ๊กนี้ให้ของสมาชิกรอด้วย"
                      : "คอมเมนต์รอให้คุณอนุมัติก่อนขึ้น"}
                  </span>
                </span>
              </label>
            ) : null}

            <VariableEditor values={values} onChange={onChange} disabled={disabled} />
          </Group>

          <Group title="การแสดงผล">
            <label className="flex w-fit items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={values.hide_counts}
                onChange={(event) => onChange({ hide_counts: event.target.checked })}
                disabled={disabled}
                className="mt-0.5 size-4 accent-primary"
              />
              <span>
                ซ่อนตัวเลขหัวใจ/ยอดอ่านจากผู้อ่าน
                <span className="mt-0.5 block text-xs text-text-muted">
                  ผู้อ่านจะไม่เห็นตัวเลข แต่ยังกดหัวใจได้ และคุณยังดูยอดในสตูดิโอได้
                </span>
              </span>
            </label>

            {/* Money is opt-in (13V): off by default, and dead until there is
                a link for it to show. */}
            <div>
              <label
                className={`flex w-fit items-start gap-2.5 text-sm ${
                  hasDonationLink ? "" : "opacity-60"
                }`}
              >
                <input
                  type="checkbox"
                  checked={values.show_donate && hasDonationLink}
                  onChange={(event) => onChange({ show_donate: event.target.checked })}
                  disabled={disabled || !hasDonationLink}
                  className="mt-0.5 size-4 accent-primary"
                />
                แสดงปุ่มสนับสนุนนักเขียนใต้เรื่องนี้
              </label>
              {!hasDonationLink ? (
                <p className="mt-1 ms-6.5 text-xs text-text-muted">
                  ยังไม่ได้ตั้งช่องทางรับเงิน -{" "}
                  <Link href="/studio/author" className="text-primary hover:underline">
                    ตั้งค่าช่องทางรับเงิน
                  </Link>
                </p>
              ) : null}
            </div>

            <ThemePicker
              value={values.theme_color}
              onChange={(theme_color) => onChange({ theme_color })}
              disabled={disabled}
            />
          </Group>

          <Group title="สิทธิ์">
            <div>
              <p className="text-xs leading-relaxed text-text-muted">
                การประกาศเจตนาที่แสดงให้ผู้อ่านเห็น ไม่ใช่การป้องกันทางเทคนิค
              </p>
              <div className="mt-2.5 flex flex-col gap-2">
                {PERMISSION_FIELDS.map(([key, label]) => (
                  <label key={key} className="flex w-fit items-center gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={values[key]}
                      onChange={(event) => onChange({ [key]: event.target.checked })}
                      disabled={disabled}
                      className="size-4 accent-primary"
                    />
                    {label}
                  </label>
                ))}
              </div>

              {values.allow_derivative ? (
                <div className="mt-3">
                  <Field
                    id="derivative_terms"
                    label="เงื่อนไขของงานต่อยอด"
                    errors={errors.derivative_terms}
                    hint="เช่น ทำต่อได้ แต่บอกกันก่อน"
                  >
                    <input
                      {...fieldInputProps(
                        "derivative_terms",
                        errors.derivative_terms,
                        "hint",
                      )}
                      type="text"
                      value={values.derivative_terms}
                      onChange={(event) =>
                        onChange({ derivative_terms: event.target.value })
                      }
                      disabled={disabled}
                    />
                  </Field>
                </div>
              ) : null}
            </div>
          </Group>

          {/* ONE closing block for everything this form deliberately does not
              ask (create review item 5): mixed in with real fields these lines
              read as fields that broke. */}
          <Group title="ตั้งได้หลังสร้าง">
            <p className="flex gap-2 text-xs leading-relaxed text-text-muted">
              <Icon name="clock" size={14} className="mt-0.5 shrink-0" />
              ตั้งเวลาเผยแพร่ - อยู่ที่ปุ่มเผยแพร่ในหน้าภาพรวม
              ตั้งได้เมื่อเช็กลิสต์ก่อนเผยแพร่ครบ
            </p>
            <p className="flex gap-2 text-xs leading-relaxed text-text-muted">
              <Icon name="users" size={14} className="mt-0.5 shrink-0" />
              ผู้เขียนร่วม - เพิ่มได้ที่ตั้งค่าเรื่อง
              คนที่เพิ่มจะเขียนและแก้ตอนได้เหมือนคุณ
            </p>
          </Group>
        </div>
      ) : null}
    </section>
  );
}

/**
 * ธีมสีของเรื่อง (13V): one row of swatches - "ไม่ใช้สี" is a swatch like the
 * rest, not a text button - plus a live miniature of the fiction page showing
 * exactly where the colour lands. Exported since the settings review: the
 * settings page shows the SAME picker, names and preview included, instead of
 * its own bare row of anonymous circles.
 */
export function ThemePicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <p className="text-sm">ธีมสีของเรื่อง</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange("")}
          disabled={disabled}
          aria-pressed={value === ""}
          aria-label="ไม่ใช้สี"
          title="ไม่ใช้สี"
          className={`relative size-7 overflow-hidden rounded-full border-2 bg-surface ${
            value === "" ? "border-text" : "border-border"
          }`}
        >
          {/* The universal "none" swatch: a diagonal through an empty circle. */}
          <span
            aria-hidden
            className="absolute inset-x-0 top-1/2 h-px rotate-45 bg-error"
          />
        </button>
        {THEME_SWATCHES.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            disabled={disabled}
            aria-pressed={value === color}
            aria-label={`ธีมสี${THEME_SWATCH_NAMES[color] ?? color}`}
            title={THEME_SWATCH_NAMES[color] ?? color}
            className={`size-7 rounded-full border-2 ${
              value === color ? "border-text" : "border-transparent"
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
        {/* The name appears only for a CHOSEN colour (create review item 7):
            beside the "none" swatch a "ไม่ใช้สี" caption said the same thing
            twice. */}
        {value ? (
          <span className="ms-1 text-xs text-text-muted">
            {THEME_SWATCH_NAMES[value] ?? value}
          </span>
        ) : null}
      </div>

      {/* Where it lands, SAID and shown (settings review round 2, item 2):
          the miniature alone read as an empty grey box, so the preview now
          names itself, thickens the band, and answers "ตอนนี้เป็นสีอะไร"
          in words beside the picture. */}
      <p className="mt-2.5 text-xs text-text-muted">
        ตัวอย่างหน้าเรื่องของคุณ - สีคือแถบคาดบนสุด:
      </p>
      <div
        aria-hidden
        className="mt-1.5 w-56 overflow-hidden rounded-md border border-border"
      >
        {value ? (
          <div className="h-2" style={{ backgroundColor: value }} />
        ) : (
          <div className="h-2 border-b border-dashed border-border bg-surface-secondary/50" />
        )}
        <div className="flex items-center gap-2 bg-surface p-2">
          <span className="h-9 w-6.5 shrink-0 rounded-sm bg-surface-secondary" />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="h-1.5 w-24 rounded bg-surface-secondary" />
            <span className="h-1.5 w-14 rounded bg-surface-secondary" />
          </span>
          <span
            className="ms-auto self-start text-[10px] leading-none font-medium"
            style={value ? { color: value } : undefined}
          >
            {value ? (THEME_SWATCH_NAMES[value] ?? value) : "สีมาตรฐาน"}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * ตัวแปรผู้อ่าน as a real table (13U).
 *
 * One tick reveals the actual editor: preset chips for the vocabulary that
 * already has words, plus rows the writer types - token, the question readers
 * see, and a default.
 */
function VariableEditor({
  values,
  onChange,
  disabled,
}: {
  values: ExtrasValues;
  onChange: (changes: Partial<ExtrasValues>) => void;
  disabled?: boolean;
}) {
  const rows = values.variables;

  function patchRow(index: number, changes: Partial<VariableInput>) {
    onChange({
      variables: rows.map((row, i) => (i === index ? { ...row, ...changes } : row)),
    });
  }

  function addPreset(preset: VariableInput) {
    if (rows.some((row) => row.token === preset.token)) return;
    onChange({ variables: [...rows, { ...preset }] });
  }

  return (
    <fieldset>
      <legend className="text-sm font-medium">ตัวแปรผู้อ่าน</legend>
      <label className="mt-1.5 flex w-fit items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={values.variables_enabled}
          onChange={(event) =>
            onChange({
              variables_enabled: event.target.checked,
              // Switching on with an empty table seeds (y/n): the commonest
              // case should be one tick, not one tick plus a preset hunt.
              variables:
                event.target.checked && rows.length === 0
                  ? [{ ...VARIABLE_PRESETS[0].input }]
                  : rows,
            })
          }
          disabled={disabled}
          className="mt-0.5 size-4 accent-primary"
        />
        <span>
          เรื่องนี้ให้ผู้อ่านกรอกชื่อ/ค่าของตัวเอง
          <span className="mt-0.5 block text-xs text-text-muted">
            คำตอบอยู่ในเครื่องผู้อ่าน ไม่ถูกส่งเข้าระบบ
          </span>
        </span>
      </label>

      {values.variables_enabled ? (
        <div className="mt-3 rounded-md border border-border p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-text-muted">เพิ่มด่วน:</span>
            {VARIABLE_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => addPreset(preset.input)}
                disabled={disabled || rows.some((row) => row.token === preset.input.token)}
                className="inline-flex min-h-7 items-center rounded-full border border-border px-2.5 font-mono text-[11px] text-text-secondary hover:border-primary hover:text-primary disabled:opacity-40"
              >
                {tokenKey(preset.input.token)}
              </button>
            ))}
          </div>

          {rows.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2">
              {rows.map((row, index) => (
                <li key={`${row.token}-${index}`} className="flex flex-wrap items-center gap-2">
                  <input
                    aria-label="ตัวแทนในเนื้อเรื่อง"
                    value={tokenKey(row.token)}
                    onChange={(event) =>
                      patchRow(index, { token: tokenFromKey(event.target.value) })
                    }
                    disabled={disabled}
                    placeholder="y/n"
                    className="w-24 rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs"
                  />
                  <input
                    aria-label="คำถามที่ผู้อ่านเห็น"
                    value={row.label}
                    onChange={(event) => patchRow(index, { label: event.target.value })}
                    disabled={disabled}
                    placeholder="ชื่อของคุณ"
                    className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
                  />
                  <input
                    aria-label="ค่าเริ่มต้น"
                    value={row.default_value ?? ""}
                    onChange={(event) =>
                      patchRow(index, { default_value: event.target.value })
                    }
                    disabled={disabled || row.kind === "pronoun"}
                    placeholder="ค่าเริ่มต้น"
                    className="w-24 rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
                  />
                  {row.kind === "pronoun" ? (
                    <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-[11px] text-text-muted">
                      สรรพนาม
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() =>
                      onChange({ variables: rows.filter((_, i) => i !== index) })
                    }
                    disabled={disabled}
                    aria-label={`ลบตัวแปร ${row.token}`}
                    className="inline-flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-error/10 hover:text-error"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <button
            type="button"
            onClick={() =>
              onChange({
                variables: [...rows, { token: "", label: "", kind: "text" }],
              })
            }
            disabled={disabled}
            className="mt-2.5 inline-flex min-h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs text-text-secondary hover:border-primary-200 hover:text-text"
          >
            <Icon name="plus" size={13} />
            เพิ่มตัวแปรเอง
          </button>
        </div>
      ) : null}
    </fieldset>
  );
}
