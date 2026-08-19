"use client";

import { useRef, useState } from "react";

import { Switch } from "@/components/ui/switch";
import { setShowAdult } from "@/lib/adult-pref";
import { getMany } from "@/lib/api";
import type { SearchFacets, SearchFilters } from "@/lib/search-client";
import { count } from "@/lib/format";
import type { Genre, Tag } from "@/types/taxonomy";

/**
 * The filter panel (search review 2026-08 sections A-B): every option VISIBLE
 * as a chip or field, with the match count each choice would leave, instead of
 * four native selects hiding everything until opened.
 *
 * Counts come from /search/facets and follow the faceting rule - a dimension
 * is counted with its own selection released - so picking "จบแล้ว" never
 * zeroes the other statuses.
 */

export interface FilterPanelProps {
  genres: Genre[];
  facets: SearchFacets | null;
  filters: SearchFilters;
  signedIn: boolean;
  onChange: (patch: Partial<SearchFilters>) => void;
}

function facetCount(counts: Record<string, number> | undefined, key: string): string {
  const total = counts?.[key];
  if (total === undefined || total === 0) return "";
  return ` (${count(total)})`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-hairline pb-4">
      <h3 className="mb-2 text-xs font-medium text-text-secondary">{title}</h3>
      {children}
    </section>
  );
}

function FilterChip({
  selected,
  disabled,
  onClick,
  children,
  title,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      title={title}
      className={`inline-flex min-h-7 items-center rounded-full border px-2.5 text-xs transition-colors ${
        selected
          ? "border-primary bg-primary font-medium text-white"
          : disabled
            ? "cursor-not-allowed border-border text-text-muted opacity-60"
            : "border-border text-text-secondary hover:border-primary-200 hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

/** Toggle one value in a list. */
function toggled(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((it) => it !== value) : [...list, value];
}

/** A one-line free-text filter that commits on Enter or blur. */
function TextFilter({
  label,
  placeholder,
  value,
  onCommit,
}: {
  label: string;
  placeholder: string;
  value: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  // An outside change (chip ✕, ล้างทั้งหมด, back button) refreshes the field -
  // the render-phase reset pattern, not an effect.
  const [committed, setCommitted] = useState(value);
  if (committed !== value) {
    setCommitted(value);
    setDraft(value);
  }

  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <input
        type="text"
        value={draft}
        placeholder={placeholder}
        maxLength={120}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => draft.trim() !== value && onCommit(draft.trim())}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onCommit(draft.trim());
          }
        }}
        className="min-h-8 w-full rounded-md border border-border bg-surface px-2.5 text-xs focus:border-primary focus:outline-none"
      />
    </label>
  );
}

/**
 * Tag picker: type a name, pick from live suggestions, get a chip. The API
 * filters by SLUG, so the picker resolves names to slugs through /tags and
 * remembers the names for the chips.
 */
function TagPicker({
  label,
  tone,
  selected,
  names,
  onAdd,
  onRemove,
}: {
  label: string;
  tone: "include" | "exclude";
  selected: string[];
  names: Map<string, string>;
  onAdd: (tag: Tag) => void;
  onRemove: (slug: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [options, setOptions] = useState<Tag[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function search(term: string) {
    setDraft(term);
    if (timer.current) clearTimeout(timer.current);
    if (!term.trim()) {
      setOptions([]);
      return;
    }
    timer.current = setTimeout(() => {
      getMany<Tag>("/tags", { query: { q: term.trim(), per_page: 6 } })
        .then(({ items }) => setOptions(items.filter((tag) => !selected.includes(tag.slug))))
        .catch(() => setOptions([]));
    }, 250);
  }

  return (
    <div>
      <p className="mb-1 text-[11px] text-text-muted">{label}</p>
      {selected.length > 0 ? (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {selected.map((slug) => (
            <button
              key={slug}
              type="button"
              onClick={() => onRemove(slug)}
              title="เอาออก"
              className={`inline-flex min-h-6 items-center gap-1 rounded-full px-2 text-[11px] ${
                tone === "exclude"
                  ? "bg-error/10 text-error line-through decoration-error/50"
                  : "bg-primary-50 text-primary"
              }`}
            >
              {names.get(slug) ?? slug}
              <span aria-hidden>✕</span>
            </button>
          ))}
        </div>
      ) : null}
      <input
        type="text"
        value={draft}
        placeholder="พิมพ์ชื่อแท็ก…"
        onChange={(event) => search(event.target.value)}
        className="min-h-8 w-full rounded-md border border-border bg-surface px-2.5 text-xs focus:border-primary focus:outline-none"
      />
      {options.length > 0 ? (
        <ul className="mt-1 overflow-hidden rounded-md border border-border bg-surface text-xs shadow-sm">
          {options.map((tag) => (
            <li key={tag.id}>
              <button
                type="button"
                onClick={() => {
                  onAdd(tag);
                  setDraft("");
                  setOptions([]);
                }}
                className="flex w-full items-center justify-between px-2.5 py-1.5 text-left hover:bg-surface-secondary"
              >
                <span>{tag.name}</span>
                {tag.novel_count ? (
                  <span className="font-mono text-[10px] text-text-muted">
                    {count(tag.novel_count)}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Chapter-length buckets (section B) - ranges, not a number box. */
const LENGTH_BUCKETS: Array<{ label: string; min: number; max: number }> = [
  { label: "1-5 ตอน", min: 1, max: 5 },
  { label: "6-20 ตอน", min: 6, max: 20 },
  { label: "21-50 ตอน", min: 21, max: 50 },
  { label: "51 ตอนขึ้นไป", min: 51, max: 0 },
];

const UPDATED_BUCKETS: Array<{ label: string; days: number }> = [
  { label: "7 วันที่ผ่านมา", days: 7 },
  { label: "เดือนนี้", days: 30 },
  { label: "3 เดือน", days: 90 },
];

const RELATIONSHIP_LABELS: Record<string, string> = {
  bl: "BL",
  gl: "GL",
  het: "ชาย-หญิง",
  reader: "×Reader",
  oc: "OC",
};

export function FilterPanel({ genres, facets, filters, signedIn, onChange }: FilterPanelProps) {
  const contentGenres = genres.filter((genre) => genre.kind === "content");
  const auGenres = genres.filter((genre) => genre.kind === "au");
  const relationshipGenres = genres.filter((genre) => genre.kind === "relationship");

  // Chip labels for tag slugs that arrived from the URL or the picker.
  const [tagNames, setTagNames] = useState<Map<string, string>>(() => new Map());
  function rememberTag(tag: Tag) {
    setTagNames((prev) => new Map(prev).set(tag.slug, tag.name));
  }

  return (
    <div className="space-y-4">
      <Section title="สถานะเรื่อง">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["ongoing", "กำลังเขียน"],
              ["completed", "จบแล้ว"],
              ["hiatus", "พักไว้"],
            ] as const
          ).map(([value, label]) => (
            <FilterChip
              key={value}
              selected={filters.status === value}
              onClick={() =>
                onChange({ status: filters.status === value ? "" : value, page: 1 })
              }
            >
              {label}
              {facetCount(facets?.status, value)}
            </FilterChip>
          ))}
        </div>
      </Section>

      <Section title="รูปแบบการอ่าน">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["standard", "ร้อยแก้ว"],
              ["chat", "แชทล้วน"],
              ["headcanon", "เฮดแคนอน"],
            ] as const
          ).map(([value, label]) => (
            <FilterChip
              key={value}
              selected={filters.format === value}
              onClick={() =>
                onChange({ format: filters.format === value ? "" : value, page: 1 })
              }
            >
              {label}
              {facetCount(facets?.presentation_format, value)}
            </FilterChip>
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {(
            [
              ["one_shot", "ตอนเดียวจบ"],
              ["multi_chapter", "หลายตอน"],
            ] as const
          ).map(([value, label]) => (
            <FilterChip
              key={value}
              selected={filters.structure === value}
              onClick={() =>
                onChange({ structure: filters.structure === value ? "" : value, page: 1 })
              }
            >
              {label}
              {facetCount(facets?.story_structure, value)}
            </FilterChip>
          ))}
          <FilterChip
            selected={filters.variables}
            onClick={() => onChange({ variables: !filters.variables, page: 1 })}
            title="เรื่องที่ใส่ชื่อผู้อ่านลงในเนื้อเรื่องได้"
          >
            มีตัวแปรผู้อ่าน (y/n)
            {facets && facets.has_variables > 0 ? ` (${count(facets.has_variables)})` : ""}
          </FilterChip>
        </div>
      </Section>

      <Section title="ประเภทงาน">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["original", "แต่งเอง"],
              ["fanfiction", "แฟนฟิค"],
              ["crossover", "ครอสโอเวอร์"],
              ["single", "ด้อมเดียวล้วน"],
            ] as const
          ).map(([value, label]) => (
            <FilterChip
              key={value}
              selected={filters.origin === value}
              onClick={() =>
                onChange({ origin: filters.origin === value ? "" : value, page: 1 })
              }
            >
              {label}
              {value === "single" ? "" : facetCount(facets?.origin, value)}
            </FilterChip>
          ))}
        </div>
        <div className="mt-2 space-y-2">
          <TextFilter
            label="แฟนด้อม"
            placeholder="แฟนด้อม เช่น Genshin Impact"
            value={filters.fandom}
            onCommit={(fandom) => onChange({ fandom, page: 1 })}
          />
          <TextFilter
            label="ตัวละคร"
            placeholder="ชื่อตัวละคร เช่น จงหลี่"
            value={filters.character}
            onCommit={(character) => onChange({ character, page: 1 })}
          />
        </div>
      </Section>

      {relationshipGenres.length > 0 ? (
        <Section title="คู่ชิป / ความสัมพันธ์">
          <div className="flex flex-wrap gap-1.5">
            {relationshipGenres.map((genre) => (
              <FilterChip
                key={genre.slug}
                selected={filters.genres.includes(genre.slug)}
                onClick={() => onChange({ genres: toggled(filters.genres, genre.slug), page: 1 })}
              >
                {RELATIONSHIP_LABELS[genre.slug] ?? genre.name}
                {facetCount(facets?.relationship, genre.slug)}
              </FilterChip>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="เรตอายุ">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["general", "ทุกวัย"],
              ["teen", "15+"],
              ["mature", "18+"],
            ] as const
          ).map(([value, label]) => {
            const needsOptIn = value === "mature" && (!signedIn || !filters.adult);
            return (
              <FilterChip
                key={value}
                selected={filters.rating === value}
                disabled={needsOptIn}
                title={needsOptIn ? "เปิดสวิตช์แสดงเนื้อหา 18+ ก่อน" : undefined}
                onClick={() =>
                  onChange({ rating: filters.rating === value ? "" : value, page: 1 })
                }
              >
                {label}
                {facetCount(facets?.rating, value)}
              </FilterChip>
            );
          })}
        </div>
        <label className="mt-2.5 flex items-center justify-between gap-2">
          <span className="text-xs text-text-secondary">
            แสดงเนื้อหา 18+
            {!signedIn ? (
              <span className="block text-[10px] text-text-muted">ต้องเข้าสู่ระบบก่อน</span>
            ) : null}
          </span>
          <Switch
            checked={filters.adult}
            disabled={!signedIn}
            aria-label="แสดงเนื้อหา 18+"
            onChange={(next) => {
              // The cookie keeps /novels and /explore in agreement with the
              // choice made here (§13B - one preference, one place).
              setShowAdult(next);
              onChange({
                adult: next,
                rating: !next && filters.rating === "mature" ? "" : filters.rating,
                page: 1,
              });
            }}
          />
        </label>
      </Section>

      {contentGenres.length > 0 ? (
        <Section title="หมวดหมู่">
          <div className="flex flex-wrap gap-1.5">
            {contentGenres.map((genre) => (
              <FilterChip
                key={genre.slug}
                selected={filters.genres.includes(genre.slug)}
                onClick={() => onChange({ genres: toggled(filters.genres, genre.slug), page: 1 })}
              >
                {genre.name}
              </FilterChip>
            ))}
          </div>
        </Section>
      ) : null}

      {auGenres.length > 0 ? (
        <Section title="AU">
          <div className="flex flex-wrap gap-1.5">
            {auGenres.map((genre) => (
              <FilterChip
                key={genre.slug}
                selected={filters.genres.includes(genre.slug)}
                onClick={() => onChange({ genres: toggled(filters.genres, genre.slug), page: 1 })}
              >
                {genre.name}
              </FilterChip>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="แท็ก">
        <div className="space-y-3">
          <TagPicker
            label="ต้องมีแท็ก"
            tone="include"
            selected={filters.tags}
            names={tagNames}
            onAdd={(tag) => {
              rememberTag(tag);
              onChange({ tags: [...filters.tags, tag.slug], page: 1 });
            }}
            onRemove={(slug) =>
              onChange({ tags: filters.tags.filter((it) => it !== slug), page: 1 })
            }
          />
          <TagPicker
            label="ไม่เอาแท็ก"
            tone="exclude"
            selected={filters.excludeTags}
            names={tagNames}
            onAdd={(tag) => {
              rememberTag(tag);
              onChange({ excludeTags: [...filters.excludeTags, tag.slug], page: 1 });
            }}
            onRemove={(slug) =>
              onChange({ excludeTags: filters.excludeTags.filter((it) => it !== slug), page: 1 })
            }
          />
        </div>
      </Section>

      <Section title="คำเตือนที่ไม่อยากเจอ">
        {filters.excludeWarnings.length > 0 ? (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {filters.excludeWarnings.map((word) => (
              <button
                key={word}
                type="button"
                title="เอาออก"
                onClick={() =>
                  onChange({
                    excludeWarnings: filters.excludeWarnings.filter((it) => it !== word),
                    page: 1,
                  })
                }
                className="inline-flex min-h-6 items-center gap-1 rounded-full bg-error/10 px-2 text-[11px] text-error"
              >
                {word}
                <span aria-hidden>✕</span>
              </button>
            ))}
          </div>
        ) : null}
        <TextFilter
          label="คำเตือนที่ไม่อยากเจอ"
          placeholder="พิมพ์คำแล้วกด Enter เช่น ตัวละครหลักตาย"
          value=""
          onCommit={(word) => {
            if (!word || filters.excludeWarnings.includes(word)) return;
            onChange({ excludeWarnings: [...filters.excludeWarnings, word], page: 1 });
          }}
        />
        <p className="mt-1 text-[10px] leading-relaxed text-text-muted">
          ตัดเรื่องที่คำเตือนเนื้อหาของผู้เขียนมีคำเหล่านี้ออกจากผลค้นหา
        </p>
      </Section>

      <Section title="ความยาว">
        <div className="flex flex-wrap gap-1.5">
          {LENGTH_BUCKETS.map((bucket) => {
            const selected =
              filters.minChapters === bucket.min && filters.maxChapters === bucket.max;
            return (
              <FilterChip
                key={bucket.label}
                selected={selected}
                onClick={() =>
                  onChange(
                    selected
                      ? { minChapters: 0, maxChapters: 0, page: 1 }
                      : { minChapters: bucket.min, maxChapters: bucket.max, page: 1 },
                  )
                }
              >
                {bucket.label}
              </FilterChip>
            );
          })}
        </div>
      </Section>

      <Section title="อัปเดตล่าสุด">
        <div className="flex flex-wrap gap-1.5">
          {UPDATED_BUCKETS.map((bucket) => (
            <FilterChip
              key={bucket.days}
              selected={filters.updatedWithin === bucket.days}
              onClick={() =>
                onChange({
                  updatedWithin: filters.updatedWithin === bucket.days ? 0 : bucket.days,
                  page: 1,
                })
              }
            >
              {bucket.label}
            </FilterChip>
          ))}
        </div>
      </Section>
    </div>
  );
}
