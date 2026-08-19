"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, fieldInputProps } from "@/components/ui/field";
import { Icon, type IconName } from "@/components/ui/icon";
import {
  clearCreateDraft,
  readCreateDraft,
  readLastSettings,
  readTemplate,
  writeCreateDraft,
  writeLastSettings,
  writeTemplate,
} from "@/features/novels/create-form-storage";
import {
  EXTRAS_DEFAULTS,
  ExtrasSection,
  type ExtrasValues,
  extrasPayload,
} from "@/features/novels/create-extras";
import { FandomChips } from "@/features/novels/fandom-chips";
import { isCrossover, splitFandoms } from "@/lib/fandom";
import { formErrors } from "@/lib/auth-client";
import { relativeTime } from "@/lib/format";
import { createTag } from "@/lib/discovery-client";
import { COVER_ASPECT } from "@/lib/cover";
import { uploadMedia } from "@/lib/media-client";
import { MEDIA_ACCEPT } from "@/types/media";
import {
  createChapter,
  createNovel,
  listNovels,
  saveVariables,
  updateNovel,
} from "@/lib/novels-client";
import { StoryStructure, WorkFormat, workFormatRequest } from "@/types/fiction";
import {
  AgeGate,
  AgeRating,
  OriginType,
  defaultGateFor,
  gateChoicesFor,
} from "@/types/novel";

/**
 * Creates a fiction (docs/PHASE-13-CREATION-AND-CONTROL.md §13A, §13J,
 * rebuilt 13U, corrected 13V).
 *
 * The 13V corrections: ต้นฉบับ moved up under the title because it is the most
 * basic classification and changes what the later fields mean; the visibility
 * ladder LEFT this form entirely - every fiction is born a private draft
 * (docs/11 §31), so who-sees-it is the publish button's question, asked where
 * publishing happens; and the answers a card renders are previewed in a strip
 * that looks like the statement it is.
 *
 * The whole form autosaves to this device as the writer types, and the
 * advanced section starts from the writer's own last answers.
 */

/** Mirrors the API's TitleMaxLength. */
const TITLE_MAX = 200;

/** Mirrors the API's DescriptionMaxLength. */
const DESCRIPTION_MAX = 5000;

/**
 * The chosen cover file, held locally until the fiction exists (13W). It
 * cannot upload earlier - the novel_cover purpose attaches to a fiction - and
 * it never enters the autosaved draft, because a File does not survive
 * localStorage.
 */
interface CoverPick {
  file: File;
  preview: string | null;
}

function coverPreviewOf(file: File): string | null {
  try {
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
}

function releaseCoverPreview(preview: string | null) {
  if (!preview) return;
  try {
    URL.revokeObjectURL(preview);
  } catch {
    // Nothing to release on runtimes without object URLs.
  }
}

const STRUCTURE_CHOICES = [
  {
    value: StoryStructure.MultiChapter,
    label: "หลายตอน",
    hint: "ทยอยลงเป็นตอน ๆ",
  },
  {
    value: StoryStructure.OneShot,
    label: "จบในตอนเดียว",
    hint: "เรื่องสั้น อ่านรวดเดียวจบ",
  },
] as const;

const WORK_FORMAT_CHOICES = [
  {
    value: WorkFormat.Prose,
    icon: "book",
    label: "ร้อยแก้ว",
    hint: "นิยายแบบย่อหน้า - ผู้อ่านกดสลับอ่านแบบแชทได้เอง",
  },
  {
    value: WorkFormat.Chat,
    icon: "message",
    label: "แชทล้วน",
    hint: "เล่าผ่านบทสนทนา จัดผู้พูดซ้ายขวาและคั่นฉากได้",
  },
  {
    value: WorkFormat.Headcanon,
    icon: "users",
    label: "เฮดแคนอน",
    hint: "แต่ละตอนเป็นหัวข้อ แยกกล่องตามตัวละคร",
  },
] as const satisfies ReadonlyArray<{
  value: WorkFormat;
  icon: IconName;
  label: string;
  hint: string;
}>;

const RATING_CHOICES = [
  { value: AgeRating.General, label: "ทั่วไป", hint: "อ่านได้ทุกวัย" },
  { value: AgeRating.Teen, label: "15+", hint: "เนื้อหาวัยรุ่นขึ้นไป" },
  {
    value: AgeRating.Mature,
    label: "18+",
    hint: "เนื้อหาหนัก ความรุนแรง - ไม่แสดงในหน้ารวม",
  },
  {
    value: AgeRating.Explicit,
    label: "18+ เนื้อหาทางเพศชัดเจน",
    hint: "ต้องล็อกอินเสมอ และไม่ขึ้นหน้ารวมหรือค้นหา",
  },
] as const;

const ORIGIN_CHOICES = [
  { value: OriginType.Original, label: "แต่งเอง", hint: "ตัวละครและโลกของคุณเอง" },
  {
    value: OriginType.Fanfiction,
    // The word this audience actually uses (create review 2026-08) - and the
    // hint points at the box that appears DIRECTLY under this card, so the
    // choice never reads as a dead end.
    label: "แฟนฟิค",
    hint: "ฟิคจากเรื่องที่มีอยู่แล้ว - เลือกแล้วกรอกเรื่องต้นทางต่อด้านล่างทันที",
  },
] as const;

/** The rating badge the preview strip shows - the card's most important label. */
const RATING_BADGES: Record<AgeRating, string> = {
  [AgeRating.General]: "ทุกวัย",
  [AgeRating.Teen]: "15+",
  [AgeRating.Mature]: "18+",
  [AgeRating.Explicit]: "18+ ทางเพศ",
};

/** คำเตือนเนื้อหา presets (13U) - pickable, so the data is consistent. */
const WARNING_PRESETS = [
  "ความรุนแรง",
  "การเสียชีวิตของตัวละคร",
  "การทำร้ายตัวเอง",
  "การล่วงละเมิด",
  "คำหยาบ",
  "ยาเสพติด/แอลกอฮอล์",
  "เลือด/ความสยอง",
  "การนอกใจ",
] as const;

/** Everything the form remembers, as one autosaved object (13U). */
interface FormState {
  title: string;
  tagline: string;
  description: string;
  structure: StoryStructure;
  workFormat: WorkFormat;
  rating: AgeRating | "";
  gate: AgeGate;
  warningChips: string[];
  warningCustom: string;
  warningSpoiler: boolean;
  origin: OriginType;
  fandom: string;
  ships: string[];
  extras: ExtrasValues;
}

function defaultState(): FormState {
  return {
    title: "",
    tagline: "",
    description: "",
    structure: StoryStructure.MultiChapter,
    workFormat: WorkFormat.Prose,
    // No default rating: the author chooses, or the server refuses.
    rating: "",
    gate: AgeGate.Warning,
    warningChips: [],
    warningCustom: "",
    warningSpoiler: false,
    origin: OriginType.Original,
    fandom: "",
    ships: [],
    // The writer's own last answers are this form's starting point (13U).
    extras: { ...EXTRAS_DEFAULTS, ...(readLastSettings<Partial<ExtrasValues>>() ?? {}) },
  };
}

/**
 * Opens the first chapter of a brand-new fiction, returning its slug.
 * Null instead of throwing: the fiction already exists by the time this runs,
 * so a failure here is a navigation detail, not a lost work.
 */
async function startFirstChapter(novelRef: string): Promise<string | null> {
  try {
    const chapter = await createChapter(novelRef, { status: "draft" });
    return chapter.slug;
  } catch {
    return null;
  }
}

/**
 * This component is rendered with SSR disabled (see the loader), so reading
 * localStorage in the initializer is safe: there is no server HTML to
 * mismatch against.
 */
export function CreateNovelForm({
  username,
  hasDonationLink = false,
}: {
  /** The writer's username, for loading their existing series names (13V). */
  username?: string;
  /** Whether the writer has a support link at all (13V). */
  hasDonationLink?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<FormState>(() => {
    const draft = readCreateDraft<FormState>();
    return draft ? { ...defaultState(), ...draft.state } : defaultState();
  });
  // A draft worth announcing is one that DIFFERS from an untouched form.
  // The page used to autosave its pristine state on mere opening, so the next
  // visit greeted the writer with "restored" over a blank form (review
  // 2026-08) - the phantom is filtered here AND no longer written below.
  const [restoredFrom, setRestoredFrom] = useState<string | null>(() => {
    const draft = readCreateDraft<FormState>();
    if (!draft) return null;
    const merged = JSON.stringify({ ...defaultState(), ...draft.state });
    return merged === JSON.stringify(defaultState()) ? null : draft.savedAt;
  });
  const [savedAt, setSavedAt] = useState<string | null>(restoredFrom);
  const [hasTemplate, setHasTemplate] = useState<boolean>(
    () => readTemplate<ExtrasValues>() !== null,
  );
  const [shipInput, setShipInput] = useState("");
  const [extrasOpen, setExtrasOpen] = useState(false);
  // The writer's existing series names, loaded when the section opens (13V).
  const [seriesOptions, setSeriesOptions] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [cover, setCover] = useState<CoverPick | null>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const skipAutosave = useRef(false);

  function pickCover(file: File) {
    setCover((current) => {
      releaseCoverPreview(current?.preview ?? null);
      return { file, preview: coverPreviewOf(file) };
    });
  }

  function removeCover() {
    setCover((current) => {
      releaseCoverPreview(current?.preview ?? null);
      return null;
    });
    if (coverInput.current) coverInput.current.value = "";
  }

  function patch(changes: Partial<FormState>) {
    setState((current) => ({ ...current, ...changes }));
  }

  // Autosave (13U): the whole form, debounced, to this device - but only once
  // the writer actually CHANGED something. The state the page mounted with
  // must never be written back: that manufactured empty drafts out of merely
  // opening the page. After the first real change the flag stays up, so
  // editing back to the starting value still saves (a deliberate erasure is
  // content too).
  const initialFingerprint = useRef(JSON.stringify(state));
  const touched = useRef(false);
  useEffect(() => {
    if (skipAutosave.current) return;
    if (!touched.current) {
      if (JSON.stringify(state) === initialFingerprint.current) return;
      touched.current = true;
    }
    const timer = window.setTimeout(() => {
      setSavedAt(writeCreateDraft(state));
    }, 800);
    return () => window.clearTimeout(timer);
  }, [state]);


  function resetForm() {
    skipAutosave.current = true;
    clearCreateDraft();
    setState(defaultState());
    setSavedAt(null);
    // The banner leaves with the draft it announced - it used to stay up
    // after the reset, reading like a restore that never finished.
    setRestoredFrom(null);
    window.setTimeout(() => {
      skipAutosave.current = false;
    }, 1000);
  }

  function toggleExtras() {
    setExtrasOpen((current) => !current);
    // Load the series picker's options once, on first open - an event, not an
    // effect, so nothing runs for writers who never open the section.
    if (seriesOptions === null && username) {
      listNovels({ author: username, per_page: 50 })
        .then((result) => {
          const names = new Set<string>();
          for (const novel of result.items) {
            if (novel.series_name) names.add(novel.series_name);
          }
          setSeriesOptions([...names].sort());
        })
        .catch(() => setSeriesOptions([]));
    }
  }

  function addShip() {
    const ship = shipInput.trim();
    if (!ship) return;
    if (!state.ships.includes(ship)) patch({ ships: [...state.ships, ship] });
    setShipInput("");
  }

  const warningText = [...state.warningChips, state.warningCustom.trim()]
    .filter(Boolean)
    .join(" · ");
  const showRatedBlock = state.rating !== "" && state.rating !== AgeRating.General;

  // What the button still waits for (create review 2026-08 item 6): an
  // enabled button over a form the server will refuse is a trap sprung at the
  // end. The SERVER remains the authority - this list only mirrors the three
  // rules a writer cannot submit around.
  const missing = [
    ...(state.title.trim() === "" ? ["ชื่อเรื่อง"] : []),
    ...(state.rating === "" ? ["เรตอายุ"] : []),
    ...(state.origin === OriginType.Fanfiction && state.fandom.trim() === ""
      ? ["เรื่องต้นทาง"]
      : []),
  ];

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (missing.length > 0) return;
    setPending(true);
    setMessage(null);
    setFields({});

    try {
      const novel = await createNovel({
        title: state.title,
        story_structure: state.structure,
        // One function maps the three cards onto the format columns, so the
        // create form, the settings page, and the badges cannot disagree.
        ...workFormatRequest(state.workFormat),
        // Sent as-is when unset, so the SERVER produces the missing-field
        // error and this form never duplicates the rule (docs/11 §43).
        age_rating: state.rating as AgeRating,
        // The gate is asked for 15+ too (13U): stored whatever the rating,
        // and in effect the moment the work moves to 18+.
        ...(showRatedBlock ? { age_gate: state.gate } : {}),
        origin_type: state.origin,
        // The same field the checklist's เรื่องย่อ row reads - filled here,
        // that row ticks itself (13W).
        ...(state.description.trim() ? { description: state.description.trim() } : {}),
        ...(state.tagline.trim() ? { tagline: state.tagline.trim() } : {}),
        ...(state.origin === OriginType.Fanfiction && state.fandom.trim()
          ? { fandom: state.fandom.trim() }
          : {}),
        ...(showRatedBlock && warningText
          ? { content_warning: warningText, content_warning_spoiler: state.warningSpoiler }
          : {}),
        ...extrasPayload(state.extras),
      });

      // The cover chosen in the form uploads NOW, against the fiction that
      // just started existing - the novel_cover purpose attaches it, which is
      // the same cover_url the checklist's ปกเรื่อง row reads (13W). One
      // value, two views; no second upload anywhere. Non-fatal: the work
      // exists either way, and the checklist offers the retry path.
      if (cover) {
        try {
          await uploadMedia({
            file: cover.file,
            purpose: "novel_cover",
            novel: novel.id,
          });
        } catch {
          // Non-fatal by design.
        }
      }

      // ตัวละคร/คู่ชิป become tags (13U): the searchable vocabulary fandom
      // readers actually browse by. Non-fatal - the work exists either way,
      // and the settings page has the full tag picker.
      if (state.ships.length > 0) {
        try {
          const tags = await Promise.all(state.ships.map((ship) => createTag(ship)));
          await updateNovel(novel.id, { tag_ids: tags.map((tag) => tag.id) });
        } catch {
          // Non-fatal by design.
        }
      }

      // The variable table (13U), seeded once the fiction exists. A separate
      // call on purpose: variables are their own resource, and folding them
      // into the create body would make one request that half-succeeds.
      const variables = state.extras.variables.filter(
        (row) => row.token.trim() && row.label.trim(),
      );
      if (state.extras.variables_enabled && variables.length > 0) {
        try {
          await saveVariables(novel.id, variables);
        } catch {
          // Non-fatal by design.
        }
      }

      writeLastSettings(state.extras);
      skipAutosave.current = true;
      clearCreateDraft();

      const started = await startFirstChapter(novel.id);
      // The SLUG, not the id. The API resolves either, but the slug is the
      // work's one public address (docs/SLUGS.md: a permanent random token,
      // never the title) and every other studio link in the app already uses
      // it; this was the one door that opened onto the internal UUID.
      const ref = encodeURIComponent(novel.slug);
      router.replace(
        started
          ? `/studio/novels/${ref}/chapters/${encodeURIComponent(started)}`
          : `/studio/novels/${ref}`,
      );
      router.refresh();
    } catch (error) {
      const parsed = formErrors(error);
      setMessage(parsed.message);
      setFields(parsed.fields);
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-7" noValidate>
      {message ? (
        <p role="alert" className="rounded-md bg-error/10 px-3 py-2 text-sm text-error">
          {message}
        </p>
      ) : null}

      {restoredFrom ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border border-dashed px-3 py-2 text-xs text-text-secondary">
          <Icon name="undo" size={13} className="shrink-0" />
          กู้คืนสิ่งที่พิมพ์ค้างไว้ {relativeTime(restoredFrom)} ให้อัตโนมัติ
          <button
            type="button"
            onClick={resetForm}
            className="text-primary hover:underline"
          >
            ไม่ใช้ - เริ่มฟอร์มเปล่า
          </button>
        </p>
      ) : null}

      {/* ปก + ชื่อ + คำโปรย (13W): one block, first - the same trio every
          card, shelf, and reader page renders together, so the top of the form
          IS the preview. The cover slot is `COVER_ASPECT` - the one shape from
          lib/cover.ts, so this frame crops exactly like the shelf card it
          becomes - visible in the first second and optional forever; everything here is
          typed or uploaded, unlike the radio groups below. Both optional
          fields land on the novel fields the publish checklist reads, so
          filling them here ticks its rows by itself. */}
      <div className="flex items-start gap-4">
        <input
          ref={coverInput}
          type="file"
          accept={MEDIA_ACCEPT}
          className="sr-only"
          aria-label="เลือกไฟล์ปก"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) pickCover(file);
          }}
        />
        <div className="w-24 shrink-0">
          <button
            type="button"
            onClick={() => coverInput.current?.click()}
            disabled={pending}
            className={`block ${COVER_ASPECT} w-full overflow-hidden rounded-md border border-dashed border-border bg-surface hover:border-primary-200`}
          >
            {cover ? (
              cover.preview ? (
                // A local object URL, never a remote origin - nothing for the
                // image optimizer to do.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover.preview} alt="ตัวอย่างปก" className="size-full object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center p-1.5 text-center text-[10px] leading-tight text-text-secondary">
                  {cover.file.name}
                </span>
              )
            ) : (
              <span className="flex h-full flex-col items-center justify-center gap-1 text-text-muted">
                <Icon name="image" size={17} />
                <span className="text-[11px] leading-none">ปก</span>
              </span>
            )}
          </button>
          {cover ? (
            <button
              type="button"
              onClick={removeCover}
              disabled={pending}
              className="mt-1 block w-full text-center text-[11px] text-text-muted hover:text-error"
            >
              เอาออก
            </button>
          ) : (
            <span className="mt-1 block text-center text-[10px] text-text-muted">
              A5 · ไม่บังคับ
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          <Field
            id="title"
            label="ชื่อเรื่อง"
            errors={fields.title}
            required
          >
            <input
              {...fieldInputProps("title", fields.title, "hint")}
              type="text"
              required
              maxLength={TITLE_MAX}
              value={state.title}
              onChange={(event) => patch({ title: event.target.value })}
              disabled={pending}
            />
            <p className="mt-1 text-end font-mono text-[11px] text-text-muted tabular-nums">
              {state.title.length}/{TITLE_MAX}
            </p>
          </Field>

          {/* คำโปรย and เรื่องย่อ are TWO fields, here as in the settings
              (parity review 2026-08): the old combined "เรื่องย่อ / คำโปรย"
              saved only the description, so a tagline could not be set at
              creation at all - and the card line and the synopsis are not the
              same sentence. */}
          <div>
            <label htmlFor="tagline" className="block text-sm font-medium">
              คำโปรย{" "}
              <span className="font-normal text-text-muted">
                · ไม่บังคับ - หนึ่งบรรทัดใต้ปกในหน้ารวม
              </span>
            </label>
            <input
              id="tagline"
              type="text"
              maxLength={200}
              value={state.tagline}
              onChange={(event) => patch({ tagline: event.target.value })}
              disabled={pending}
              placeholder="เช่น เขาไม่เคยรอใคร จนกระทั่งรอคนนี้"
              className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
            {fields.tagline?.length ? (
              <p role="alert" className="mt-1 text-sm text-error">
                {fields.tagline[0]}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium">
              เรื่องย่อ{" "}
              <span className="font-normal text-text-muted">· ไม่บังคับ</span>
            </label>
            <textarea
              id="description"
              rows={2}
              maxLength={DESCRIPTION_MAX}
              value={state.description}
              onChange={(event) => patch({ description: event.target.value })}
              disabled={pending}
              placeholder="สองสามบรรทัดที่ทำให้คนอยากกดเข้ามาอ่าน"
              className="mt-1.5 min-h-16 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm field-sizing-content"
            />
            {fields.description?.length ? (
              <p role="alert" className="mt-1 text-sm text-error">
                {fields.description[0]}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* ต้นฉบับ sits under the identity block (13V): it is the most basic
          classification, and it changes what the ship/tag questions mean. */}
      <div>
        <ChoiceGroup
          name="origin_type"
          legend="ต้นฉบับ"
          choices={ORIGIN_CHOICES}
          value={state.origin}
          onChange={(origin) => patch({ origin })}
          errors={fields.origin_type}
          disabled={pending}
        />

        {state.origin === OriginType.Fanfiction ? (
          <div className="mt-3 space-y-4 rounded-lg border border-border bg-surface-muted/40 p-3.5">
            {/* ONE chip field, the writer's own words (docs/FANDOM.md): the
                platform keeps no fandom vocabulary - and a crossover is MORE
                names in the SAME field, never a second field. The Crossover
                label derives from the count (the ผสมรูปแบบ principle). */}
            <Field
              id="fandom"
              label="เขียนจากเรื่องอะไร (เรื่องต้นทาง)"
              required
              errors={fields.fandom}
              hint="เพิ่มได้มากกว่าหนึ่งเรื่องถ้าเป็น crossover - กด Enter เพิ่ม สูงสุด 3 เรื่อง"
            >
              <FandomChips
                id="fandom"
                value={state.fandom}
                onChange={(fandom) => patch({ fandom })}
                disabled={pending}
              />
            </Field>

            <div>
              <label htmlFor="ships" className="block text-sm font-medium">
                ตัวละคร / คู่ชิป
              </label>
              <p className="mt-1 text-xs text-text-muted">
                กด Enter เพื่อเพิ่ม - กลายเป็นแท็กให้คนค้นเจอ
              </p>
              <div className="mt-1.5 flex gap-2">
                <input
                  id="ships"
                  value={shipInput}
                  onChange={(event) => setShipInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addShip();
                    }
                  }}
                  disabled={pending}
                  placeholder="เช่น Zhongli×Reader"
                  className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={addShip}
                  disabled={pending}
                  className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-sm text-text-secondary hover:border-primary-200 hover:text-text"
                >
                  เพิ่ม
                </button>
              </div>
              {state.ships.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {state.ships.map((ship) => (
                    <li key={ship}>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          patch({ ships: state.ships.filter((s) => s !== ship) })
                        }
                        className="inline-flex min-h-7 items-center gap-1 rounded-full border border-primary bg-primary-50 px-2.5 text-xs text-primary"
                      >
                        {ship}
                        <Icon name="close" size={11} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <ChoiceGroup
        name="story_structure"
        legend="โครงสร้าง"
        choices={STRUCTURE_CHOICES}
        value={state.structure}
        onChange={(structure) => patch({ structure })}
        errors={fields.story_structure}
        disabled={pending}
      />

      <ChoiceGroup
        name="work_format"
        legend="รูปแบบหลักของเรื่อง"
        note="ใช้จัดหมวดหมู่ให้ผู้อ่านหาเจอ - แต่ละตอนสลับโหมดได้เสมอ และการสลับไม่ลบอะไร"
        columns={3}
        choices={WORK_FORMAT_CHOICES}
        value={state.workFormat}
        onChange={(workFormat) => patch({ workFormat })}
        errors={fields.presentation_format}
        disabled={pending}
      />

      <div>
        <ChoiceGroup
          name="age_rating"
          legend="เรตอายุ"
          required
          columns={2}
          // The follow-ups are SIGNPOSTED (create review 2026-08 items 2-3):
          // the gate and content-warning blocks appear only after a rated
          // choice, and without this line their absence read as their removal.
          note="กำหนดว่าเรื่องจะไปปรากฏที่ไหนได้บ้าง - เลือก 15+/18+ แล้วจะมีระดับการปิดกั้นและคำเตือนเนื้อหาให้ตั้งต่อทันที"
          choices={RATING_CHOICES}
          value={state.rating}
          onChange={(rating) => {
            patch({
              rating,
              // The gate has a floor that depends on the rating (§13B).
              gate: gateChoicesFor(rating).some((choice) => choice.value === state.gate)
                ? state.gate
                : defaultGateFor(rating),
            });
          }}
          errors={fields.age_rating}
          disabled={pending}
        />

        {/* ระดับการปิดกั้น (13U): for 15+ AND both 18+ tiers. Explicit keeps
            its floor - the warning-only gate is not offered there at all. */}
        {showRatedBlock ? (
          <div className="mt-3 space-y-4 rounded-lg border border-border bg-surface-muted/40 p-3.5">
            <ChoiceGroup
              name="age_gate"
              legend="ผู้อ่านต้องผ่านอะไรก่อนเข้าอ่าน"
              note={
                state.rating === AgeRating.Explicit
                  ? "เรตนี้ต้องล็อกอินเป็นอย่างน้อยเสมอ - กฎของแพลตฟอร์ม"
                  : "กันแน่นขึ้น แลกกับคนอ่านน้อยลง"
              }
              choices={gateChoicesFor(state.rating)}
              value={state.gate}
              onChange={(gate) => patch({ gate })}
              errors={fields.age_gate}
              disabled={pending}
            />

            {/* คำเตือนเนื้อหา as chips (13U): pickable data instead of an
                empty textarea most writers skip. */}
            <fieldset>
              <legend className="text-sm font-medium">คำเตือนเนื้อหา</legend>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {WARNING_PRESETS.map((preset) => {
                  const active = state.warningChips.includes(preset);
                  return (
                    <button
                      key={preset}
                      type="button"
                      aria-pressed={active}
                      disabled={pending}
                      onClick={() =>
                        patch({
                          warningChips: active
                            ? state.warningChips.filter((chip) => chip !== preset)
                            : [...state.warningChips, preset],
                        })
                      }
                      className={`inline-flex min-h-8 items-center rounded-full border px-3 text-xs ${
                        active
                          ? "border-primary bg-primary-50 text-primary"
                          : "border-border text-text-secondary hover:border-primary-200"
                      }`}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>
              <input
                aria-label="คำเตือนเพิ่มเติม"
                value={state.warningCustom}
                onChange={(event) => patch({ warningCustom: event.target.value })}
                disabled={pending}
                placeholder="เพิ่มเองได้ เช่น สงคราม, โรคซึมเศร้า"
                className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
              />
              <label className="mt-2 flex w-fit items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={state.warningSpoiler}
                  onChange={(event) => patch({ warningSpoiler: event.target.checked })}
                  disabled={pending}
                  className="mt-0.5 size-4 accent-primary"
                />
                <span>
                  ซ่อนคำเตือนไว้ใต้ปุ่มกันสปอยล์
                  <span className="mt-0.5 block text-xs text-text-muted">
                    ผู้อ่านกดเปิดดูเองก่อนเริ่มอ่าน
                  </span>
                </span>
              </label>
            </fieldset>
          </div>
        ) : null}
      </div>

      <ExtrasSection
        open={extrasOpen}
        onToggle={toggleExtras}
        values={state.extras}
        onChange={(changes) => patch({ extras: { ...state.extras, ...changes } })}
        errors={fields}
        disabled={pending}
        hasTemplate={hasTemplate}
        onSaveTemplate={() => {
          writeTemplate(state.extras);
          setHasTemplate(true);
        }}
        onApplyTemplate={() => {
          const template = readTemplate<Partial<ExtrasValues>>();
          if (template) patch({ extras: { ...EXTRAS_DEFAULTS, ...template } });
        }}
        seriesOptions={seriesOptions}
        hasDonationLink={hasDonationLink}
      />

      {/* ผู้อ่านจะเห็นแบบนี้ (13V): the form's answers as the labels a card
          renders. Framed like the statement it is, with the rating - the most
          important label - always present once chosen. */}
      <section
        aria-label="ตัวอย่างป้ายกำกับที่ผู้อ่านจะเห็น"
        className="rounded-lg border-2 border-primary-200 bg-primary-50/50 p-4"
      >
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Icon name="eye" size={15} className="text-primary" />
          ผู้อ่านจะเห็นป้ายกำกับแบบนี้
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {cover?.preview ? (
            // The chosen cover joins the preview strip - the strip is "what a
            // reader sees", and a reader sees the cover first.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover.preview}
              alt="ปกที่เลือกไว้"
              className="h-12 w-8 shrink-0 rounded-sm border border-border object-cover"
            />
          ) : null}
          {state.rating !== "" ? (
            <Badge tone={state.rating === AgeRating.General ? "neutral" : "warning"}>
              {RATING_BADGES[state.rating]}
            </Badge>
          ) : (
            // The rating is REQUIRED, so its placeholder warns softly rather
            // than fading into the optional chips beside it.
            <span className="rounded-sm border border-dashed border-warning/60 bg-warning/5 px-2 py-0.5 text-xs text-warning">
              ยังไม่เลือกเรต
            </span>
          )}
          <Badge>
            {state.structure === StoryStructure.OneShot ? "เรื่องสั้นจบในตอน" : "หลายตอน"}
          </Badge>
          <Badge>
            {WORK_FORMAT_CHOICES.find((c) => c.value === state.workFormat)?.label}
          </Badge>
          {state.workFormat === WorkFormat.Headcanon ? (
            <Badge tone="secondary">งานเฮดแคนอน</Badge>
          ) : null}
          {state.origin === OriginType.Fanfiction
            ? splitFandoms(state.fandom).map((name) => <Badge key={name}>{name}</Badge>)
            : null}
          {state.origin === OriginType.Fanfiction && isCrossover(state.fandom) ? (
            // Derived from the count, never a checkbox - the ผสมรูปแบบ rule.
            <Badge tone="primary">Crossover</Badge>
          ) : null}
          {state.extras.variables_enabled ? <Badge tone="primary">y/n</Badge> : null}
        </div>
      </section>

      {/* Read BEFORE the press (13V) - both lines. */}
      <div className="space-y-1.5">
        <p className="text-xs leading-relaxed text-text-muted">
          เรื่องจะถูกสร้างเป็น<span className="text-text-secondary">ร่างส่วนตัว</span>{" "}
          แล้วพาไปเขียนตอนแรก - หมวดหมู่ แท็ก และการเผยแพร่อยู่ที่หน้าภาพรวม
        </p>
        <p className="flex items-center gap-1.5 text-xs text-text-muted">
          <Icon name="check" size={12} className="shrink-0" />
          {savedAt
            ? `ฟอร์มนี้บันทึกลงเครื่องอัตโนมัติแล้ว (${relativeTime(savedAt)})`
            : "ฟอร์มนี้บันทึกลงเครื่องอัตโนมัติขณะพิมพ์ ปิดแท็บก็ไม่หาย"}
        </p>
      </div>

      {missing.length > 0 ? (
        <p className="text-center text-xs text-text-muted">
          ยังขาด: {missing.join(" · ")}
        </p>
      ) : null}
      <Button
        type="submit"
        loading={pending}
        disabled={missing.length > 0}
        className="w-full"
      >
        {pending ? "กำลังสร้าง…" : "สร้างผลงาน"}
      </Button>
    </form>
  );
}

/** The visible radio circle every card carries (13U). */
function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2 ${
        selected ? "border-primary" : "border-border"
      }`}
    >
      {selected ? <span className="size-1.5 rounded-full bg-primary" /> : null}
    </span>
  );
}

/**
 * One question, answered by picking a card.
 *
 * Radios rather than a `<select>`: each option carries a one-line explanation.
 * Since 13U every card shows a real radio circle - the selected border alone
 * was not enough to tell the chosen card apart.
 */
function ChoiceGroup<T extends string>({
  name,
  legend,
  note,
  choices,
  value,
  onChange,
  errors,
  disabled,
  required = false,
  columns = 3,
}: {
  name: string;
  legend: string;
  note?: string;
  choices: ReadonlyArray<{
    value: T;
    label: string;
    hint: string;
    icon?: IconName;
  }>;
  value: T | "";
  onChange: (value: T) => void;
  errors?: string[];
  disabled?: boolean;
  required?: boolean;
  columns?: 2 | 3;
}) {
  const errorID = errors?.length ? `${name}-error` : undefined;

  return (
    <fieldset aria-describedby={errorID}>
      <legend className="text-sm font-medium">
        {legend}
        {required ? (
          <span className="ms-1 text-error" aria-hidden>
            *
          </span>
        ) : null}
      </legend>
      {note ? <p className="mt-1 text-xs text-text-muted">{note}</p> : null}

      <div
        className={`mt-2.5 grid items-stretch gap-2 ${
          columns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"
        }`}
      >
        {choices.map((choice) => {
          const selected = value === choice.value;
          return (
            <label
              key={choice.value}
              className={`flex h-full cursor-pointer gap-2.5 rounded-lg border p-3 text-sm ${
                selected
                  ? "border-primary bg-primary-50"
                  : "border-border bg-surface hover:border-primary-200"
              } ${disabled ? "opacity-60" : ""}`}
            >
              <input
                type="radio"
                name={name}
                value={choice.value}
                checked={selected}
                onChange={() => onChange(choice.value)}
                disabled={disabled}
                className="sr-only"
              />
              <RadioDot selected={selected} />
              <span className="min-w-0 flex-col">
                <span className="flex items-center gap-1.5">
                  {choice.icon ? (
                    <Icon
                      name={choice.icon}
                      size={15}
                      className={selected ? "text-primary" : "text-text-muted"}
                    />
                  ) : null}
                  <span className="font-medium">{choice.label}</span>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-text-muted">
                  {choice.hint}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {errors?.length ? (
        <p id={errorID} role="alert" className="mt-2 text-sm text-error">
          {errors[0]}
        </p>
      ) : null}
    </fieldset>
  );
}
