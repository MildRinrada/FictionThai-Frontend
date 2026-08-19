"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { SaveBadge } from "@/components/ui/save-badge";
import { Icon } from "@/components/ui/icon";
import { FandomChips } from "@/features/novels/fandom-chips";
import { TaxonomyPicker } from "@/features/novels/taxonomy-picker";
import { CoverEditor } from "@/features/studio/cover-editor";
import { updateNovel, updateNovelFormat } from "@/lib/novels-client";
import { useAutosave, type Autosave } from "@/lib/use-autosave";
import {
  StoryStructure,
  WorkFormat,
  workFormatOf,
  workFormatRequest,
  type FictionFormat,
} from "@/types/fiction";
import {
  AgeGate,
  AgeRating,
  COMMENT_ACCESS_CHOICES,
  CommentAccess,
  NOVEL_STATUS_LABELS,
  NovelStatus,
  OriginType,
  VISIBILITY_CHOICES,
  Visibility,
  defaultGateFor,
  gateChoicesFor,
  isAdultRating,
  type Novel,
} from "@/types/novel";
import type { Term } from "@/types/taxonomy";

/**
 * Fiction settings - the identity, content, audience, and format blocks.
 *
 * EVERYTHING on this page autosaves (settings review 2026-08, item A). The
 * old page had six save buttons over four forms while four other blocks saved
 * on change; the review's verdict was that nobody could know which was which.
 * Now every block behaves the same way: edit, pause, and the block's own
 * heading answers "บันทึกแล้ว" - the same contract the chapter editor keeps.
 *
 * The one visibility control (item B1): the five-rung ladder below. The
 * เผยแพร่/ส่วนตัว toggle that used to sit above it - a THIRD control for the
 * same field, counting the overview's dropdown - is gone.
 *
 * The format section (item B2/B3): two dimensions, not three. The work-format
 * choice writes presentation_format AND content_mode together through
 * workFormatRequest - the same §13J vocabulary the create form asks in - so
 * the "ประเภทเนื้อหา" column that duplicated "Headcanon ล้วน" no longer
 * exists as a separate question. The stored dimensions stay independent
 * (docs/08 §2); only the CONTROL is one. And switching to จบในตอนเดียว is
 * disabled while more than one chapter exists, with the reason stated, rather
 * than letting a writer wonder what would happen to the other seven.
 */

export function NovelSettings({
  novel,
  chapterTotal,
  assistantSlot,
}: {
  novel: Novel;
  /** ALL chapters as the owner sees them - drafts included, from the studio's
      own fetch, never novel.chapter_count (which counts live only). */
  chapterTotal: number;
  /** ผู้ช่วยเขียน, rendered as the SECOND block (review item D): it is the
      platform's differentiator and was sitting at the bottom of the page. */
  assistantSlot?: React.ReactNode;
}) {
  const router = useRouter();

  // ── ชื่อเรื่อง ปก และคำโปรย ──────────────────────────────────────────────
  const [title, setTitle] = useState(novel.title);
  const [tagline, setTagline] = useState(novel.tagline ?? "");

  const saveIdentity = useCallback(
    async (value: { title: string; tagline: string }) => {
      if (value.title.trim() === "") {
        throw new Error("ชื่อเรื่องว่างไม่ได้ - ยังไม่ได้บันทึก");
      }
      await updateNovel(novel.slug, {
        title: value.title.trim(),
        // An emptied tagline is CLEARED - null is the only value that says
        // "there is no tagline" (docs/09 §3).
        tagline: value.tagline.trim() || null,
      });
    },
    [novel.slug],
  );
  const identitySave = useAutosave({ title, tagline }, saveIdentity);

  // ── เนื้อหาและคำเตือน ────────────────────────────────────────────────────
  const [description, setDescription] = useState(novel.description ?? "");
  const [foreword, setForeword] = useState(novel.foreword ?? "");
  const [contentWarning, setContentWarning] = useState(novel.content_warning ?? "");
  const [rating, setRating] = useState<AgeRating>(novel.age_rating);
  const [gate, setGate] = useState<AgeGate>(novel.age_gate);
  const [origin, setOrigin] = useState<OriginType>(novel.origin_type);
  const [fandom, setFandom] = useState(novel.fandom ?? "");
  const [genreIDs, setGenreIDs] = useState<string[]>(
    novel.genres.map((genre) => genre.id),
  );
  const [tags, setTags] = useState<Term[]>(novel.tags);

  const saveContent = useCallback(
    async (value: {
      description: string;
      foreword: string;
      contentWarning: string;
      rating: AgeRating;
      gate: AgeGate;
      origin: OriginType;
      fandom: string;
      genreIDs: string[];
      tagIDs: string[];
    }) => {
      await updateNovel(novel.slug, {
        description: value.description.trim() || null,
        foreword: value.foreword.trim() || null,
        content_warning: value.contentWarning.trim() || null,
        age_rating: value.rating,
        age_gate: value.gate,
        origin_type: value.origin,
        // Only a fanfiction names a source; null clears a stale one.
        fandom:
          value.origin === OriginType.Fanfiction ? value.fandom.trim() || null : null,
        // A present list replaces the whole set (docs/09 §15), so both ride
        // together - omitting one would leave it stale under a form that
        // says otherwise.
        genre_ids: value.genreIDs,
        tag_ids: value.tagIDs,
      });
    },
    [novel.slug],
  );
  const contentSave = useAutosave(
    {
      description,
      foreword,
      contentWarning,
      rating,
      gate,
      origin,
      fandom,
      genreIDs,
      tagIDs: tags.map((tag) => tag.id),
    },
    saveContent,
  );

  // ── การมองเห็น สถานะ และคอมเมนต์ ─────────────────────────────────────────
  const [visibility, setVisibility] = useState(novel.visibility ?? Visibility.Private);
  const [status, setStatus] = useState(novel.status);
  const [commentAccess, setCommentAccess] = useState(novel.comment_access);
  const [commentApproval, setCommentApproval] = useState(novel.comment_approval);

  const saveAudience = useCallback(
    async (value: {
      visibility: Visibility;
      status: Novel["status"];
      commentAccess: Novel["comment_access"];
      commentApproval: boolean;
    }) => {
      await updateNovel(novel.slug, {
        visibility: value.visibility,
        status: value.status,
        comment_access: value.commentAccess,
        comment_approval: value.commentApproval,
      });
      // Visibility and status show elsewhere in the studio chrome (badges,
      // checklist) - refresh so those agree with the radio just clicked.
      router.refresh();
    },
    [novel.slug, router],
  );
  // Discrete controls - a shorter pause than the typing blocks.
  const audienceSave = useAutosave(
    { visibility, status, commentAccess, commentApproval },
    saveAudience,
    400,
  );

  // ── รูปแบบของเรื่อง ──────────────────────────────────────────────────────
  const [format, setFormat] = useState<FictionFormat>({
    story_structure: novel.story_structure,
    presentation_format: novel.presentation_format,
    content_mode: novel.content_mode,
  });
  const [formatWarning, setFormatWarning] = useState<string | null>(null);

  const saveFormat = useCallback(
    async (value: FictionFormat) => {
      const result = await updateNovelFormat(novel.slug, value);
      setFormatWarning(
        result.needs_chat_setup
          ? "เรื่องนี้ตั้งให้แสดงผลแบบแชทแล้ว แต่ยังไม่มีบทสนทนาในบางตอน " +
              "ผู้อ่านจะยังไม่เห็นเนื้อหาในตอนเหล่านั้นจนกว่าคุณจะเพิ่มข้อความเอง " +
              "- ฟิคเดิมไม่ได้ถูกลบ และระบบจะไม่แปลงให้อัตโนมัติ"
          : null,
      );
      router.refresh();
    },
    [novel.slug, router],
  );
  const formatSave = useAutosave(format, saveFormat, 400);

  // จบในตอนเดียว is a claim about the shape of the work, and a work with
  // several chapters does not have that shape (review item B2). Nothing is
  // deleted either way - the option simply waits until it would be true.
  const oneShotBlocked = chapterTotal > 1;

  return (
    <div className="flex flex-col gap-6">
      {/* ── ชื่อเรื่อง ปก และคำโปรย ─────────────────────────────────────── */}
      <section
        id="identity"
        className="scroll-mt-28 rounded-lg border border-border bg-surface p-5"
      >
        <BlockHeading title="ชื่อเรื่อง ปก และคำโปรย" autosave={identitySave} />

        <div className="mt-4 flex flex-wrap items-start gap-6">
          {/* Real BUTTONS under the frame (review round 2, item 12): the old
              caption described a gesture; these are the actions themselves,
              ลบปก included. */}
          <div className="w-36 shrink-0">
            <CoverEditor
              novelRef={novel.slug}
              coverURL={novel.cover_url ?? null}
              className="w-36"
              actions
            />
          </div>

          <div className="min-w-56 flex-1 space-y-4">
            <div>
              <label htmlFor="novel-title" className="mono-label block">
                ชื่อเรื่อง
              </label>
              <input
                id="novel-title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                className="mt-1.5 w-full rounded-md border border-border bg-canvas px-3 py-2 font-serif text-lg focus:border-primary focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="novel-tagline" className="mono-label block">
                คำโปรย
              </label>
              <p className="mt-1 text-xs text-text-muted">
                หนึ่งบรรทัดที่จะขึ้นใต้ปกในหน้ารวม - ไม่ใช่เรื่องย่อ
              </p>
              <input
                id="novel-tagline"
                type="text"
                value={tagline}
                maxLength={200}
                onChange={(event) => setTagline(event.target.value)}
                placeholder="เช่น เขาไม่เคยรอใคร จนกระทั่งรอคนนี้"
                className="mt-1.5 w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
              <p className="mt-1 text-end text-xs text-text-muted tabular-nums">
                {tagline.length}/200
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── ผู้ช่วยเขียน - block TWO of the page (review item D) ─────────── */}
      {assistantSlot}

      {/* ── เนื้อหาและคำเตือน ───────────────────────────────────────────── */}
      <section
        id="content"
        className="scroll-mt-28 rounded-lg border border-border bg-surface p-5"
      >
        <BlockHeading title="เนื้อหาและคำเตือน" autosave={contentSave} />
        <p className="mt-1 text-sm text-text-secondary">
          สิ่งที่หน้าสร้างผลงานไม่ถามแล้ว - กรอกตอนไหนก็ได้
          เรื่องย่อที่เขียนหลังมีเนื้อเรื่องแล้วมักดีกว่า
        </p>

        <div className="mt-4">
          <label htmlFor="novel-description" className="mono-label block">
            เรื่องย่อ
          </label>
          <textarea
            id="novel-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            className="mt-2 w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>

        <div className="mt-4">
          <label htmlFor="novel-foreword" className="mono-label block">
            บทนำ
          </label>
          <p className="mt-1 text-xs text-text-muted">
            สิ่งที่อยากบอกผู้อ่านก่อนเริ่มเรื่อง - คำเตือน คำขอบคุณ ที่มาของเรื่อง
            หรือ AU นี้ต่างจากต้นฉบับตรงไหน · ผู้อ่านเปิดดูได้จากแท็บของตัวเอง ไม่ปนกับตอนที่ 1
          </p>
          <textarea
            id="novel-foreword"
            value={foreword}
            onChange={(event) => setForeword(event.target.value)}
            rows={5}
            className="mt-2 w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>

        <div className="mt-4">
          <label htmlFor="novel-content-warning" className="mono-label block">
            คำเตือนเนื้อหา
          </label>
          <p className="mt-1 text-xs text-text-muted">
            ผู้อ่านกลุ่มที่ต้องการคำเตือนจะเห็นก่อนเริ่มอ่าน
          </p>
          <textarea
            id="novel-content-warning"
            value={contentWarning}
            onChange={(event) => setContentWarning(event.target.value)}
            rows={2}
            className="mt-2 w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>

        <div className="mt-5">
          <TaxonomyPicker
            genreIDs={genreIDs}
            tags={tags}
            onGenresChange={setGenreIDs}
            onTagsChange={setTags}
            // AU is a fanfiction's question (create review 2026-08): original
            // work has no canon to be alternate to, so the question follows
            // the ต้นฉบับ answer above.
            showAU={origin === OriginType.Fanfiction}
          />
        </div>

        {/* เรตอายุ as CARDS, not a row of small radios (review item F): every
            other choice on this page is a card, and the rating is the choice
            with legal weight - it must not be the least visible one. */}
        <fieldset className="mt-6">
          <legend className="mono-label">เรตอายุ</legend>
          <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
            {[
              { value: AgeRating.General, label: "ทั่วไป", hint: "อ่านได้ทุกวัย" },
              {
                value: AgeRating.Teen,
                label: "15+",
                hint: "มีความรุนแรงหรือประเด็นผู้ใหญ่บางส่วน",
              },
              {
                value: AgeRating.Mature,
                label: "18+",
                hint: "เนื้อหาผู้ใหญ่ - ไม่ขึ้นหน้ารวมและหน้าค้นหา",
              },
              {
                value: AgeRating.Explicit,
                label: "18+ เนื้อหาทางเพศชัดเจน",
                hint: "ผู้อ่านต้องล็อกอินเสมอ - กฎของแพลตฟอร์ม",
              },
            ].map((choice) => (
              <label
                key={choice.value}
                className="flex cursor-pointer gap-2.5 rounded-md border border-border px-3 py-2.5 has-checked:border-primary has-checked:bg-primary-50"
              >
                <input
                  type="radio"
                  name="age-rating"
                  value={choice.value}
                  checked={rating === choice.value}
                  onChange={() => {
                    setRating(choice.value);
                    // Explicit work has a gate FLOOR (§13B) - the rating
                    // carries the gate up with it rather than letting the API
                    // refuse a combination this form offered.
                    setGate((current) =>
                      gateChoicesFor(choice.value).some((g) => g.value === current)
                        ? current
                        : defaultGateFor(choice.value),
                    );
                  }}
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
          {isAdultRating(rating) ? (
            <p className="mt-2 text-xs text-text-muted">
              เรื่อง 18+ จะไม่ถูกส่งให้ Google
              และไม่ขึ้นภาพตัวอย่างเวลาแชร์ลิงก์
            </p>
          ) : null}
        </fieldset>

        {/* The writer's own gate - protection against reach (§13B). */}
        {isAdultRating(rating) ? (
          <fieldset className="mt-5">
            <legend className="mono-label">ใครเปิดอ่านเรื่อง 18+ นี้ได้</legend>
            <div className="mt-2 space-y-2">
              {gateChoicesFor(rating).map((choice) => (
                <label key={choice.value} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="age-gate"
                    value={choice.value}
                    checked={gate === choice.value}
                    onChange={() => setGate(choice.value)}
                    className="mt-1"
                  />
                  <span>
                    {choice.label}
                    <span className="block text-xs text-text-muted">{choice.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <fieldset className="mt-6">
          <legend className="mono-label">ต้นฉบับ</legend>
          <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
            {[
              {
                value: OriginType.Original,
                label: "แต่งเอง",
                hint: "โลกและตัวละครเป็นของคุณทั้งหมด",
              },
              {
                value: OriginType.Fanfiction,
                // The SAME word the create form's card carries (parity review
                // 2026-08): one concept must not answer to two names, and
                // แฟนฟิค is the word this audience actually uses.
                label: "แฟนฟิค",
                hint: "ฟิคจากเรื่องที่มีอยู่แล้ว - เลือกแล้วกรอกเรื่องต้นทางต่อด้านล่าง",
              },
            ].map((choice) => (
              <label
                key={choice.value}
                className="flex cursor-pointer gap-2.5 rounded-md border border-border px-3 py-2.5 has-checked:border-primary has-checked:bg-primary-50"
              >
                <input
                  type="radio"
                  name="origin-type"
                  value={choice.value}
                  checked={origin === choice.value}
                  onChange={() => setOrigin(choice.value)}
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
        </fieldset>

        {origin === OriginType.Fanfiction ? (
          <div className="mt-4">
            <label htmlFor="novel-fandom" className="mono-label block">
              เขียนจากเรื่องอะไร (เรื่องต้นทาง)
            </label>
            <p className="mt-1 text-xs text-text-muted">
              เพิ่มได้มากกว่าหนึ่งเรื่องถ้าเป็น crossover - กด Enter เพิ่ม สูงสุด 3
              เรื่อง ป้าย Crossover ติดให้เองเมื่อมีตั้งแต่สองเรื่อง
            </p>
            <div className="mt-2">
              <FandomChips id="novel-fandom" value={fandom} onChange={setFandom} />
            </div>
            <p className="mt-2 text-xs text-text-muted">
              ตัวละคร / คู่ชิป ที่กรอกไว้ตอนสร้างกลายเป็นแท็กของเรื่อง -
              จัดการได้ที่หัวข้อแท็กด้านบน
            </p>
          </div>
        ) : null}
      </section>

      {/* ── การมองเห็น สถานะ และคอมเมนต์ ─────────────────────────────────── */}
      <section
        id="audience"
        className="scroll-mt-28 rounded-lg border border-border bg-surface p-5"
      >
        <BlockHeading title="การมองเห็นและสถานะ" autosave={audienceSave} />

        <fieldset className="mt-4">
          <legend className="mono-label">ใครเห็นเรื่องนี้ได้</legend>
          {/* THE visibility control - the only one on this page (review B1).
              The เผยแพร่/ส่วนตัว toggle that duplicated it is gone. */}
          <div className="mt-2.5 flex flex-col gap-2">
            {VISIBILITY_CHOICES.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer gap-2.5 rounded-md border border-border px-3 py-2.5 has-checked:border-primary has-checked:bg-primary-50"
              >
                <input
                  type="radio"
                  name="visibility"
                  value={option.value}
                  checked={visibility === option.value}
                  onChange={() => setVisibility(option.value)}
                  className="mt-0.5 size-4 accent-primary"
                />
                <span>
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="mt-0.5 block text-xs text-text-secondary">
                    {option.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-5">
          <label htmlFor="novel-status" className="mono-label block">
            สถานะการเขียน
          </label>
          <select
            id="novel-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as Novel["status"])}
            className="mt-2 min-h-10 w-full max-w-xs rounded-md border border-border bg-surface px-3 text-sm"
          >
            {Object.values(NovelStatus).map((value) => (
              <option key={value} value={value}>
                {NOVEL_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        {/* คอมเมนต์ - three levels, not a checkbox (§13D). */}
        <fieldset className="mt-6 border-t border-hairline pt-5">
          <legend className="mono-label">ใครคอมเมนต์ได้</legend>
          <div className="mt-2.5 flex flex-col gap-2">
            {COMMENT_ACCESS_CHOICES.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer gap-2.5 rounded-md border border-border px-3 py-2.5 has-checked:border-primary has-checked:bg-primary-50"
              >
                <input
                  type="radio"
                  name="comment-access"
                  value={option.value}
                  checked={commentAccess === option.value}
                  onChange={() => setCommentAccess(option.value)}
                  className="mt-0.5 size-4 accent-primary"
                />
                <span>
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="mt-0.5 block text-xs text-text-secondary">
                    {option.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>

          {commentAccess !== CommentAccess.Off ? (
            <label className="mt-3 flex w-fit items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={commentApproval}
                onChange={(event) => setCommentApproval(event.target.checked)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span>
                ตรวจก่อนโพสต์
                <span className="mt-0.5 block text-xs text-text-secondary">
                  {commentAccess === CommentAccess.Everyone
                    ? "คอมเมนต์จากคนไม่ล็อกอินรอตรวจอยู่แล้วเสมอ - ติ๊กนี้คือให้ของสมาชิกรอตรวจด้วย"
                    : "คอมเมนต์จะรอให้คุณกดอนุมัติก่อนถึงจะขึ้นให้คนอื่นเห็น"}
                </span>
              </span>
            </label>
          ) : null}
        </fieldset>
      </section>

      {/* ── รูปแบบของเรื่อง ─────────────────────────────────────────────── */}
      <section
        id="format"
        className="scroll-mt-28 rounded-lg border border-border bg-surface p-5"
      >
        <BlockHeading title="รูปแบบของเรื่อง" autosave={formatSave} />
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-text-secondary">
          การเปลี่ยนรูปแบบคือการเลือกว่าผู้อ่านจะเห็นเนื้อหาแบบไหน
          ไม่ใช่การแปลงงานเขียนของคุณ - ทั้งร้อยแก้ว บทสนทนา และเฮดแคนอน
          ที่เคยเขียนไว้ยังอยู่ครบ และกลับมาแสดงได้ทุกเมื่อ
        </p>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <fieldset>
            <legend className="mono-label">โครงสร้างเรื่อง</legend>
            <div className="mt-2.5 flex flex-col gap-1.5">
              {[
                { value: StoryStructure.MultiChapter, label: "หลายตอน", disabled: false },
                {
                  value: StoryStructure.OneShot,
                  label: "จบในตอนเดียว",
                  disabled:
                    oneShotBlocked &&
                    format.story_structure !== StoryStructure.OneShot,
                },
              ].map((option) => (
                <label
                  key={option.value}
                  className={`flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-primary-50 ${
                    option.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                  }`}
                >
                  <input
                    type="radio"
                    name="story_structure"
                    value={option.value}
                    checked={format.story_structure === option.value}
                    disabled={option.disabled}
                    onChange={() =>
                      setFormat((current) => ({
                        ...current,
                        story_structure: option.value,
                      }))
                    }
                    className="size-4 accent-primary"
                  />
                  {option.label}
                </label>
              ))}
            </div>
            {oneShotBlocked ? (
              <p className="mt-2 text-xs text-text-muted">
                เรื่องนี้มี {chapterTotal} ตอนแล้ว จึงเลือกจบในตอนเดียวไม่ได้ -
                ไม่มีตอนไหนถูกลบจากตัวเลือกนี้อยู่แล้ว
                ถ้าตั้งใจให้เป็นตอนเดียวจริง ให้จัดการตอนให้เหลือตอนเดียวก่อน
              </p>
            ) : null}
          </fieldset>

          {/* ONE question for what a chapter defaults to (review item B3):
              the same three answers the create form asks (§13J). Choosing
              Headcanon ล้วน sets the content classification with it - the
              third column that asked the same thing again is gone. */}
          <fieldset>
            <legend className="mono-label">รูปแบบเริ่มต้นของตอน</legend>
            <div className="mt-2.5 flex flex-col gap-1.5">
              {[
                { value: WorkFormat.Prose, label: "ร้อยแก้ว" },
                { value: WorkFormat.Chat, label: "แชทล้วน" },
                { value: WorkFormat.Headcanon, label: "Headcanon ล้วน" },
              ].map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-primary-50"
                >
                  <input
                    type="radio"
                    name="work_format"
                    value={option.value}
                    checked={workFormatOf(format) === option.value}
                    onChange={() =>
                      setFormat((current) => ({
                        ...current,
                        ...workFormatRequest(option.value),
                      }))
                    }
                    className="size-4 accent-primary"
                  />
                  {option.label}
                </label>
              ))}
            </div>
            {/* What changing the DEFAULT touches (review round 2, item 1):
                exactly the chapters that inherit it - ActiveFormat falls back
                to the novel only when a chapter pinned nothing of its own. */}
            <p className="mt-2 text-xs text-text-muted">
              มีผลกับตอนที่ใช้ค่าเริ่มต้นเท่านั้น -
              ตอนที่เลือกรูปแบบของตัวเองไว้ไม่เปลี่ยน
              และไม่มีการแก้เนื้อหาทุกกรณี
              เรื่องที่ตอนไม่เหมือนกันจะขึ้นป้าย “ผสมรูปแบบ” ให้เอง
            </p>
          </fieldset>
        </div>

        {formatWarning ? (
          <p className="mt-5 flex gap-2.5 rounded-md border border-warning/30 bg-warning/8 px-3.5 py-3 text-sm leading-relaxed text-warning">
            <Icon name="alert" size={17} className="mt-0.5 shrink-0" />
            {formatWarning}
          </p>
        ) : null}
      </section>
    </div>
  );
}

/** A block heading with its own save state beside it (review item A). */
function BlockHeading({ title, autosave }: { title: string; autosave: Autosave }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="font-serif text-lg font-semibold">{title}</h2>
      <SaveBadge state={autosave.state} error={autosave.error} />
    </div>
  );
}
