"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { formErrors } from "@/lib/auth-client";
import { createTag, getGenres } from "@/lib/discovery-client";
import { suggest } from "@/lib/suggest-client";
import { GenreKind, type Genre, type Term } from "@/types/taxonomy";

/**
 * หมวดหมู่และแท็ก - the fiction form's discovery controls (§13S).
 *
 * It used to be ONE list of seven English genre names and a free tag box, which
 * made a writer spend their three genre slots choosing between facts about
 * their own work: a BL campus romance had to pick two of "romance", "BL", and
 * "campus AU" and drop the third.
 *
 * The controlled vocabulary answers three questions now, and this asks them as
 * three:
 *
 *   หมวดหมู่ตามเนื้อหา        what the story is LIKE
 *   ความสัมพันธ์ในเรื่อง       who it is ABOUT
 *   เป็น AU ไหม               which alternate universe, if any
 *
 * The AU question is a switch first, because "no" is the commonest answer and a
 * row of AU chips in front of a writer who is not writing one is noise. A
 * writer whose AU is not on the list types it, and it becomes a TAG - the one
 * validated path a new term enters the vocabulary by, which is what keeps it
 * reusable by everyone else rather than a private string on one fiction.
 *
 * Every rule is enforced server-side. The counts here are affordance.
 */

/** Mirror of the server's limits, for UI affordance only - the API enforces. */
export const MAX_GENRES = 8;
export const MAX_TAGS = 20;

const KIND_LABELS: Record<GenreKind, { legend: string; note: string }> = {
  [GenreKind.Content]: {
    legend: "หมวดหมู่ตามเนื้อหา",
    note: "เรื่องนี้อ่านแล้วให้ความรู้สึกแบบไหน",
  },
  [GenreKind.Relationship]: {
    legend: "ความสัมพันธ์ในเรื่อง",
    note: "ผู้อ่านหลายคนเลือกอ่านจากตรงนี้ก่อนอย่างอื่น",
  },
  [GenreKind.AU]: {
    legend: "เป็น AU แบบไหน",
    note: "เลือกได้มากกว่าหนึ่งอย่าง",
  },
};

export interface TaxonomyPickerProps {
  genreIDs: string[];
  tags: Term[];
  onGenresChange: (ids: string[]) => void;
  onTagsChange: (tags: Term[]) => void;
  disabled?: boolean;
  errors?: Record<string, string[]>;
  /**
   * Whether the AU question makes sense at all (create review 2026-08):
   * "which alternate universe" is a fanfiction's question - original work has
   * no canon to be alternate TO. Default on, so existing callers keep it.
   */
  showAU?: boolean;
}

export function TaxonomyPicker({
  genreIDs,
  tags,
  onGenresChange,
  onTagsChange,
  disabled = false,
  errors = {},
  showAU = true,
}: TaxonomyPickerProps) {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagBusy, setTagBusy] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  /** Existing tags matching what is being typed (settings review item F):
      typing blind is how "slow burn" ends up beside "slowburn" forever. */
  const [tagMatches, setTagMatches] = useState<Array<{ slug: string; name: string }>>([]);
  const [auInput, setAuInput] = useState("");
  // Whether the AU question is open. It starts open only for a fiction that
  // already declared one, so an existing answer is never hidden behind a
  // switch the writer has to remember to flip.
  const [isAU, setIsAU] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getGenres()
      .then((list) => {
        if (!cancelled) setGenres(list);
      })
      .catch(() => {
        // Without the vocabulary the pickers simply don't render; the fiction
        // can still be created and classified later.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const trimmed = tagInput.trim();
    if (trimmed === "") {
      const clear = window.setTimeout(() => setTagMatches([]), 0);
      return () => window.clearTimeout(clear);
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      // The same public suggestion endpoint the navbar search uses - one
      // vocabulary, one spelling of every tag.
      suggest(trimmed, { signedIn: false, signal: controller.signal })
        .then((found) => {
          if (controller.signal.aborted) return;
          setTagMatches(
            found.tags
              .filter((tag) => !tags.some((existing) => existing.name === tag.name))
              .slice(0, 6),
          );
        })
        .catch(() => {
          // No suggestions is just a quieter input, never an error.
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [tagInput, tags]);

  const byKind = useMemo(() => {
    const groups: Record<GenreKind, Genre[]> = {
      [GenreKind.Content]: [],
      [GenreKind.Relationship]: [],
      [GenreKind.AU]: [],
    };
    for (const genre of genres) {
      // An unknown kind from a newer server lands with the content group rather
      // than disappearing from the form.
      (groups[genre.kind] ?? groups[GenreKind.Content]).push(genre);
    }
    return groups;
  }, [genres]);

  // A fiction that already carries an AU term has answered the question, so the
  // section is open whatever the switch says. DERIVED rather than pushed into
  // state by an effect: the selection is the answer, and a second copy of it
  // could disagree with the chips the writer is looking at.
  const auOpen =
    isAU || byKind[GenreKind.AU].some((genre) => genreIDs.includes(genre.id));

  function toggleGenre(id: string) {
    if (genreIDs.includes(id)) {
      onGenresChange(genreIDs.filter((existing) => existing !== id));
      return;
    }
    if (genreIDs.length >= MAX_GENRES) return;
    onGenresChange([...genreIDs, id]);
  }

  async function addTag(name: string, onDone: () => void) {
    const trimmed = name.trim();
    if (trimmed === "" || tagBusy || tags.length >= MAX_TAGS) return;

    setTagBusy(true);
    setTagError(null);
    try {
      // The server normalizes and validates; "Slow Burn" and "slow burn"
      // come back as the same tag, so duplicates are checked by id.
      const tag = await createTag(trimmed);
      if (!tags.some((existing) => existing.id === tag.id)) {
        onTagsChange([...tags, tag]);
      }
      onDone();
    } catch (error) {
      const parsed = formErrors(error);
      setTagError(parsed.fields.name?.[0] ?? parsed.message);
    } finally {
      setTagBusy(false);
    }
  }

  /** Turning the AU question off also drops the AU terms it selected. */
  function setAU(next: boolean) {
    setIsAU(next);
    if (next) return;
    const auIDs = new Set(byKind[GenreKind.AU].map((genre) => genre.id));
    onGenresChange(genreIDs.filter((id) => !auIDs.has(id)));
  }

  const remaining = MAX_GENRES - genreIDs.length;

  return (
    <div className="space-y-6">
      {genres.length > 0 ? (
        <>
          <ChipGroup
            kind={GenreKind.Content}
            genres={byKind[GenreKind.Content]}
            genreIDs={genreIDs}
            onToggle={toggleGenre}
            disabled={disabled}
            full={remaining <= 0}
          />

          <ChipGroup
            kind={GenreKind.Relationship}
            genres={byKind[GenreKind.Relationship]}
            genreIDs={genreIDs}
            onToggle={toggleGenre}
            disabled={disabled}
            full={remaining <= 0}
          />

          {showAU && byKind[GenreKind.AU].length > 0 ? (
            <fieldset disabled={disabled}>
              <legend className="text-sm font-medium">เรื่องนี้เป็น AU ไหม</legend>
              <p className="mt-1 text-xs text-text-muted">
                AU = ย้ายตัวละครไปอยู่ในโลกหรือบริบทอื่น ไม่ใช่ก็ข้ามได้
              </p>

              {/* RADIO CARDS like every other either/or on the page (review
                  round 2, item 7) - the pill pair was the one yes/no still
                  answering in a different dialect. */}
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {[
                  {
                    value: false,
                    label: "ไม่ใช่ AU",
                    hint: "เรื่องอยู่ในโลกของต้นฉบับ หรือโลกที่คุณสร้างเอง",
                  },
                  {
                    value: true,
                    label: "ใช่ เป็น AU",
                    hint: "ย้ายตัวละครไปโลกหรือบริบทอื่น - เลือกแบบได้ด้านล่าง",
                  },
                ].map((choice) => (
                  <label
                    key={String(choice.value)}
                    className="flex cursor-pointer gap-2.5 rounded-md border border-border px-3 py-2.5 has-checked:border-primary has-checked:bg-primary-50"
                  >
                    <input
                      type="radio"
                      name="is-au"
                      checked={auOpen === choice.value}
                      onChange={() => setAU(choice.value)}
                      className="mt-0.5 size-4 accent-primary"
                    />
                    <span>
                      <span className="block text-sm font-medium">{choice.label}</span>
                      <span className="mt-0.5 block text-xs text-text-secondary">
                        {choice.hint}
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              {auOpen ? (
                <div className="mt-3 rounded-lg border border-border bg-surface-muted/40 p-3.5">
                  <ChipGroup
                    kind={GenreKind.AU}
                    genres={byKind[GenreKind.AU]}
                    genreIDs={genreIDs}
                    onToggle={toggleGenre}
                    disabled={disabled}
                    full={remaining <= 0}
                  />

                  {/*
                    An AU nobody has named yet. It becomes a TAG through the one
                    validated creation path, so the next writer with the same AU
                    finds it already there instead of typing a second spelling
                    of it.
                  */}
                  <div className="mt-3 border-t border-hairline pt-3">
                    <label htmlFor="au-custom" className="text-xs text-text-secondary">
                      ไม่มี AU ที่ต้องการ? พิมพ์เองได้ - จะถูกเก็บเป็นแท็กให้คนอื่นใช้ต่อได้ด้วย
                    </label>
                    <div className="mt-1.5 flex gap-2">
                      <input
                        id="au-custom"
                        type="text"
                        value={auInput}
                        onChange={(event) => setAuInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          void addTag(`AU ${auInput}`, () => setAuInput(""));
                        }}
                        disabled={disabled || tags.length >= MAX_TAGS}
                        placeholder="เช่น วงดนตรี, ร้านหนังสือ, ยุค 90"
                        className="min-h-10 flex-1 rounded-md border border-border bg-transparent px-3 text-sm focus:border-primary focus:outline-none"
                      />
                      <Button
                        variant="secondary"
                        onClick={() => void addTag(`AU ${auInput}`, () => setAuInput(""))}
                        loading={tagBusy}
                        disabled={disabled || auInput.trim() === "" || tags.length >= MAX_TAGS}
                      >
                        เพิ่ม AU
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </fieldset>
          ) : null}

          {/* ONE sentence, one number (review round 2, item 5): the previous
              two rewrites each said the cap twice and read as neither. */}
          <p className="text-xs text-text-muted">
            {genreIDs.length === 0
              ? `เลือกได้สูงสุด ${MAX_GENRES} หมวด รวมทุกกลุ่มด้านบน`
              : remaining > 0
                ? `เลือกแล้ว ${genreIDs.length} หมวด - เลือกได้อีก ${remaining}`
                : `เลือกครบ ${MAX_GENRES} หมวดแล้ว - เอาบางอันออกก่อนจึงเลือกเพิ่มได้`}
          </p>

          {errors.genre_ids?.map((message) => (
            <p key={message} role="alert" className="text-sm text-error">
              {message}
            </p>
          ))}
        </>
      ) : null}

      <div>
        <label htmlFor="tag-input" className="text-sm font-medium">
          แท็ก{" "}
          <span className="font-normal text-text-secondary">
            (ไม่บังคับ สูงสุด {MAX_TAGS})
          </span>
        </label>
        <p className="mt-1 text-xs text-text-muted">
          รายละเอียดที่หมวดหมู่ไม่ครอบคลุม - คู่ ตัวละคร ทรอป คำเตือน
        </p>

        {tags.length === 0 ? (
          <p className="mt-2 text-xs text-text-muted">
            ยังไม่มีแท็ก - พิมพ์ด้านล่างแล้วกด Enter หรือเลือกจากที่มีอยู่
          </p>
        ) : null}

        {tags.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="แท็กที่เลือก">
            {tags.map((tag) => (
              <li
                key={tag.id}
                className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-sm"
              >
                #{tag.name}
                <button
                  type="button"
                  onClick={() => onTagsChange(tags.filter((t) => t.id !== tag.id))}
                  disabled={disabled}
                  aria-label={`ลบแท็ก ${tag.name}`}
                  className="ml-1 text-text-secondary hover:text-error"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-2 flex gap-2">
          <input
            id="tag-input"
            type="text"
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void addTag(tagInput, () => setTagInput(""));
              }
            }}
            disabled={disabled || tags.length >= MAX_TAGS}
            placeholder="เช่น slow-burn, พระเอกเย็นชา"
            className="min-h-11 flex-1 rounded-md border border-border bg-transparent px-3 text-sm focus:border-primary focus:outline-none"
          />
          <Button
            variant="secondary"
            onClick={() => void addTag(tagInput, () => setTagInput(""))}
            loading={tagBusy}
            disabled={disabled || tagInput.trim() === "" || tags.length >= MAX_TAGS}
          >
            เพิ่มแท็ก
          </Button>
        </div>

        {tagMatches.length > 0 ? (
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
            มีอยู่แล้ว กดใช้ได้เลย:
            {tagMatches.map((match) => (
              <button
                key={match.slug}
                type="button"
                onClick={() => void addTag(match.name, () => setTagInput(""))}
                disabled={disabled || tagBusy || tags.length >= MAX_TAGS}
                className="inline-flex min-h-7 items-center rounded-full border border-border px-2.5 text-xs text-text-secondary hover:border-primary hover:text-primary disabled:opacity-50"
              >
                #{match.name}
              </button>
            ))}
          </p>
        ) : null}

        {tagError ? (
          <p role="alert" className="mt-2 text-sm text-error">
            {tagError}
          </p>
        ) : null}
        {errors.tag_ids?.map((message) => (
          <p key={message} role="alert" className="mt-2 text-sm text-error">
            {message}
          </p>
        ))}
      </div>
    </div>
  );
}

/** One question's chips. */
function ChipGroup({
  kind,
  genres,
  genreIDs,
  onToggle,
  disabled,
  full,
}: {
  kind: GenreKind;
  genres: Genre[];
  genreIDs: string[];
  onToggle: (id: string) => void;
  disabled: boolean;
  /** The overall cap is reached, so unselected chips cannot be added. */
  full: boolean;
}) {
  if (genres.length === 0) return null;
  const { legend, note } = KIND_LABELS[kind];

  return (
    <fieldset disabled={disabled}>
      <legend className="text-sm font-medium">{legend}</legend>
      <p className="mt-1 text-xs text-text-muted">{note}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {genres.map((genre) => {
          const selected = genreIDs.includes(genre.id);
          return (
            <label
              key={genre.id}
              title={genre.description}
              className={[
                "inline-flex items-center rounded-full border px-3 py-1 text-sm",
                // A SELECTED chip is filled, not just tinted (settings review
                // item F): thirteen chips in a row need the chosen ones to
                // read at a glance, not on inspection.
                selected
                  ? "cursor-pointer border-primary bg-primary font-medium text-white"
                  : full
                    ? "cursor-not-allowed border-border text-text-muted opacity-50"
                    : "cursor-pointer border-border text-text-secondary hover:border-primary",
              ].join(" ")}
            >
              <input
                type="checkbox"
                name="genre_ids"
                value={genre.id}
                checked={selected}
                onChange={() => onToggle(genre.id)}
                className="sr-only"
              />
              {/* Every chip wears its own checkbox (review round 2, item 3):
                  with nothing selected yet, the fill alone gave no hint that
                  these chips HAVE a selected state at all. An SVG, so the
                  accessible name stays the genre's own. */}
              <span
                aria-hidden
                className={`me-1.5 inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border ${
                  selected ? "border-white/70 bg-white/20" : "border-current opacity-40"
                }`}
              >
                {selected ? <Icon name="check" size={9} /> : null}
              </span>
              {genre.name}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
