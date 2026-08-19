import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { SectionHeader } from "@/components/ui/section-header";
import { Sparkline } from "@/components/ui/sparkline";
import { CommentQueue } from "@/features/studio/comment-queue";
import { CoverEditor } from "@/features/studio/cover-editor";
import { DraftTasks } from "@/features/studio/draft-tasks";
import { EditableTitle } from "@/features/studio/editable-title";
import { PublishChecklist } from "@/features/studio/publish-checklist";
import { ScheduledPublish } from "@/features/studio/scheduled-publish";
import { SharePanel } from "@/features/studio/share-panel";
import { UndeclaredVariables } from "@/features/studio/undeclared-variables";
import { VisibilityBadge } from "@/features/studio/visibility-badge";
import { serverGetOne } from "@/lib/api-server";
import { tallyChapters } from "@/lib/chapter-tally";
import {
  decodeParam,
  fetchOwnerNovel,
  fetchOwnerChapters,
  fetchVariableReport,
} from "@/lib/fiction-server";
import {
  chapterLabel,
  count,
  readingMinutes,
  relativeTime,
  scheduleLabel,
} from "@/lib/format";
import { presentationLabel } from "@/types/fiction";
import { ActivityKind, type NovelInsights } from "@/types/insights";
import {
  type ChapterSummary,
  NOVEL_STATUS_LABELS,
  type Readiness,
  Visibility,
} from "@/types/novel";

/**
 * The studio overview for one fiction (§13R, rebuilt in §13T).
 *
 * Everything here is scoped to this story, and every chapter number on the
 * page - the stat card, the backlog, the rail beside it - comes from ONE
 * owner-fetched chapter list through `tallyChapters`, because the previous
 * version derived them three ways and showed three different answers on one
 * screen.
 *
 * The reader numbers are real since §13R: a daily counter table backs
 * "ผู้อ่านสัปดาห์นี้", now with last week beside it - and it still reports
 * nothing per-reader, because there is nothing per-reader to report.
 */

export async function generateMetadata({
  params,
}: PageProps<"/studio/novels/[ref]">): Promise<Metadata> {
  const { ref } = await params;
  const novel = await fetchOwnerNovel(decodeParam(ref));
  return {
    title: novel ? `สตูดิโอ - ${novel.title}` : "สตูดิโอ",
    robots: { index: false, follow: false },
  };
}

/**
 * The pre-publish checklist (§13L), as its owner.
 *
 * A failure yields null rather than breaking the page: the checklist is an aid,
 * and the API refuses an incomplete publish on its own regardless.
 */
async function fetchReadiness(ref: string): Promise<Readiness | null> {
  try {
    return await serverGetOne<Readiness>(
      `/novels/${encodeURIComponent(ref)}/readiness`,
    );
  } catch {
    return null;
  }
}

/**
 * The overview's numbers and activity feed (§13R).
 *
 * Null on failure, like the checklist beside it: an unavailable counter is a
 * panel that does not render, never a studio a writer cannot open.
 */
async function fetchInsights(ref: string): Promise<NovelInsights | null> {
  try {
    return await serverGetOne<NovelInsights>(
      `/novels/${encodeURIComponent(ref)}/insights`,
    );
  } catch {
    return null;
  }
}

export default async function StudioOverviewPage({
  params,
}: PageProps<"/studio/novels/[ref]">) {
  const { ref: rawRef } = await params;
  const ref = decodeParam(rawRef);

  const [novel, chapters, readiness, insights, variables] = await Promise.all([
    fetchOwnerNovel(ref),
    fetchOwnerChapters(ref),
    fetchReadiness(ref),
    fetchInsights(ref),
    fetchVariableReport(ref),
  ]);
  if (!novel) notFound();

  const tally = tallyChapters(chapters);
  const scheduled = chapters
    .filter((chapter) => chapter.status === "scheduled" && chapter.scheduled_at)
    .sort(
      (a, b) => Date.parse(a.scheduled_at ?? "") - Date.parse(b.scheduled_at ?? ""),
    );
  /*
   * ทำต่อจากที่ค้างไว้ - what is genuinely unfinished (§13R): drafts that have
   * never been out. The same rule `tallyChapters` counts as `drafts`, so the
   * rail's "ร่าง N" and this list's row count are one number.
   */
  const unfinished = chapters.filter(
    (chapter) => chapter.status === "draft" && !chapter.published_at,
  );
  const words = chapters.reduce((total, chapter) => total + chapter.word_count, 0);
  const base = `/studio/novels/${encodeURIComponent(novel.slug)}`;
  const visibility = novel.visibility ?? Visibility.Private;
  const isPrivate = visibility === Visibility.Private;
  // A first publish scheduled for later (13U): exposed on paper, invisible to
  // readers until the moment arrives.
  const pendingPublish = pendingPublishOf(novel.publish_at);

  // สถิติจะเริ่มเก็บเมื่อเผยแพร่ (§13T): while the work is private and the
  // counters have nothing, two dashes in full-size cards are a whole row spent
  // saying nothing. One line says it instead.
  const hasAnyStat =
    (insights?.weekly_views ?? 0) > 0 ||
    (insights?.prev_weekly_views ?? 0) > 0 ||
    (insights?.weekly_comments ?? 0) > 0 ||
    (insights?.prev_weekly_comments ?? 0) > 0;
  const collapseStats = isPrivate && !hasAnyStat;

  const formatsPresent = presentFormats(chapters, novel.presentation_format);
  const timeline = storyTimeline(chapters, novel.chapter_unit);
  const undeclared = variables?.usage.undeclared ?? [];
  // The undeclared tokens WITH the chapters they were found in. An API build
  // that predates `undeclared_uses` degrades to the bare token list.
  const undeclaredUses =
    variables?.usage.undeclared_uses ??
    undeclared.map((token) => ({ token, chapters: [] }));

  /*
   * แก้ตอนที่ค้าง - the thing a writer most wants when they open this page,
   * so it is a header button beside เพิ่มตอนใหม่ rather than a scroll to the
   * backlog. The target is the unfinished draft touched LAST, and only one
   * that holds something: an empty draft has nothing to continue.
   */
  const continueTarget = [...unfinished]
    .filter((chapter) => chapter.content_ready || chapter.word_count > 0)
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0];

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-5">
        <div className="flex min-w-0 gap-4">
          {/* The story's face, on the story's own dashboard (§13S). An
              existing cover links to its one editing home in ตั้งค่าเรื่อง; a
              missing one opens the picker here - it is what the checklist is
              asking for (cover review 2026-08). */}
          <CoverEditor
            novelRef={novel.slug}
            coverURL={novel.cover_url ?? null}
            className="w-16 shrink-0"
            editHref={`/studio/novels/${encodeURIComponent(novel.slug)}/settings#identity`}
          />
          <div className="min-w-0">
            {/*
              The title, editable where it is shown (§13S) - and beside it who
              can see this story RIGHT NOW plus its writing status. Before the
              first publish the visibility is a plain label: the checklist
              below owns publishing, and a second control that could publish
              from up here is how one fact grows three switches. After
              publishing, the badge is the in-place control again.
            */}
            <div className="flex flex-wrap items-center gap-3">
              <EditableTitle novelRef={novel.slug} title={novel.title} />
              {novel.is_owner && !isPrivate ? (
                <VisibilityBadge
                  novelRef={novel.slug}
                  visibility={visibility}
                  status={novel.status}
                />
              ) : (
                <Badge srLabel="การมองเห็น">
                  {isPrivate ? "ส่วนตัว" : "เผยแพร่แล้ว"}
                </Badge>
              )}
              {/* สถานะเรื่อง (กำลังเผยแพร่ / จบแล้ว / พัก) - readers filter by
                  it, so its author should see it. Changed in settings. */}
              <Link href={`${base}/settings`} title="เปลี่ยนสถานะได้ที่ตั้งค่าเรื่อง">
                <Badge srLabel="สถานะเรื่อง">{NOVEL_STATUS_LABELS[novel.status]}</Badge>
              </Link>
            </div>
            {novel.tagline ? (
              <p className="mt-1.5 text-sm text-text-secondary">{novel.tagline}</p>
            ) : null}
            {/* What the story is made of, derived from the chapters that hold
                content (§13T) - never from the fiction's default setting, which
                stops describing the work the moment a chapter differs. More
                than one format in use is said as ผสมรูปแบบ, the same word the
                reader-facing badges use. Neutral on purpose: this is
                information, and the old red "งาน Headcanon" badge read as an
                error. */}
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="รูปแบบของเรื่อง">
              <li>
                <Badge>
                  {novel.story_structure === "one_shot" ? "เรื่องสั้นจบในตอน" : "หลายตอน"}
                </Badge>
              </li>
              {formatsPresent.length > 1 ? (
                <li>
                  <Badge srLabel="รูปแบบที่ใช้อยู่">
                    ผสมรูปแบบ ({formatsPresent.join(" + ")})
                  </Badge>
                </li>
              ) : formatsPresent.length === 1 ? (
                <li>
                  <Badge srLabel="รูปแบบที่ใช้อยู่">{formatsPresent[0]}</Badge>
                </li>
              ) : null}
            </ul>
          </div>
        </div>

        {/* The header's actions, together: continue what is open, start what
            is next, tune the assistant that helps with both. */}
        <div className="flex flex-wrap items-center gap-2">
          {continueTarget ? (
            <Link
              href={`${base}/chapters/${encodeURIComponent(continueTarget.slug)}`}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-white hover:opacity-90"
            >
              <Icon name="edit" size={16} />
              เขียนต่อ
              <span className="max-w-40 truncate font-normal opacity-90">
                {continueTarget.title ??
                  chapterLabel(novel.chapter_unit, continueTarget.chapter_number)}
              </span>
            </Link>
          ) : null}
          <Link
            href={`${base}/chapters`}
            className={
              continueTarget
                ? "inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-4 text-sm text-text-secondary hover:border-primary-200 hover:text-text"
                : "inline-flex min-h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-white hover:opacity-90"
            }
          >
            <Icon name="plus" size={16} />
            เพิ่มตอนใหม่
          </Link>
          {/* ผู้ช่วยเขียนของเรื่องนี้ - the platform's heart had no door on
              this page; now it is one click into the settings section that
              owns it. */}
          <Link
            href={`${base}/settings#assistant`}
            title="ตั้งค่าผู้ช่วยเขียนของเรื่องนี้"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-3.5 text-sm text-text-secondary hover:border-primary-200 hover:text-text"
          >
            <Icon name="sparkle" size={15} />
            ผู้ช่วยเขียน
          </Link>
        </div>
      </div>

      {/* The top slot answers "แล้วยังไงต่อ" (§13T): before the first publish
          it is the checklist with the publish button at its foot; afterwards
          the checklist has nothing left to say and the story's link takes its
          place. */}
      {isPrivate && readiness && novel.is_owner ? (
        <div className="mb-8">
          <PublishChecklist
            readiness={readiness}
            novelRef={novel.slug}
            slug={novel.slug}
            status={novel.status}
            undeclaredVariables={undeclared.length}
          />
        </div>
      ) : null}
      {pendingPublish && novel.is_owner ? (
        <div className="mb-8">
          <ScheduledPublish novelRef={novel.slug} publishAt={pendingPublish} />
        </div>
      ) : null}
      {!isPrivate && !pendingPublish ? (
        <div className="mb-8">
          <SharePanel
            slug={novel.slug}
            title={novel.title}
            tagline={novel.tagline}
            coverURL={novel.cover_url ?? null}
            authorName={novel.author.display_name ?? novel.author.username}
            visibility={visibility}
          />
        </div>
      ) : null}

      {/* ตรวจก่อนโพสต์ (§13D). It renders nothing when the queue is empty, so
          it is not a permanent panel to scroll past - it appears exactly when
          somebody is waiting for an answer. */}
      <div className="mb-8 empty:mb-0">
        <CommentQueue novelRef={novel.slug} />
      </div>

      {/* มีตอนที่ใช้ตัวแปรที่ยังไม่ประกาศ (§13T) - the variable system's
          quietest failure, surfaced where the writer will actually see it,
          with the chapters each token appears in and a one-press declare. */}
      {undeclared.length > 0 ? (
        <div className="mb-8">
          <UndeclaredVariables
            novelRef={novel.slug}
            base={base}
            chapterUnit={novel.chapter_unit}
            declared={variables?.variables ?? []}
            uses={undeclaredUses}
          />
        </div>
      ) : null}

      {/*
        The numbers a writer opens the studio for (§13R).

        ผู้อ่านสัปดาห์นี้ is the daily counters summed over the window, and it
        is labelled as READS rather than people on purpose: the recorder
        de-duplicates one viewer per fiction per day and knows nothing else
        about them, so "คนอ่าน" would be a claim the data cannot support.
      */}
      {collapseStats ? (
        <p className="mb-10 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border border-dashed px-4 py-3 text-[13px] text-text-muted">
          <Icon name="clock" size={14} className="shrink-0" />
          สถิติผู้อ่านจะเริ่มเก็บเมื่อเผยแพร่
          {words > 0 ? (
            // "ทั้งเรื่อง" is load-bearing: a bare word count beside a page of
            // per-chapter counts reads as one more chapter's.
            <span>
              - ทั้งเรื่องเขียนไปแล้ว {count(words)} คำ (~
              {count(readingMinutes(words))} นาทีอ่าน)
            </span>
          ) : null}
        </p>
      ) : (
        <ul className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="ผู้อ่านสัปดาห์นี้"
            value={insights ? `${count(insights.weekly_views)} ครั้ง` : "-"}
            delta={
              insights ? (
                <WeekDelta
                  current={insights.weekly_views}
                  previous={insights.prev_weekly_views}
                />
              ) : undefined
            }
            series={insights?.views_by_day}
          />
          <StatCard
            label="ตอนที่เผยแพร่"
            value={`${count(tally.published)} ตอน`}
            hint={
              tally.scheduled > 0
                ? `ตั้งเวลาไว้อีก ${count(tally.scheduled)} ตอน`
                : undefined
            }
          />
          <StatCard
            label="คอมเมนต์ใหม่"
            value={insights ? `${count(insights.weekly_comments)} รายการ` : "-"}
            delta={
              insights ? (
                <WeekDelta
                  current={insights.weekly_comments}
                  previous={insights.prev_weekly_comments}
                />
              ) : undefined
            }
            series={insights?.comments_by_day}
          />
          <StatCard
            label="ความยาวรวมทั้งเรื่อง"
            value={words > 0 ? `${count(words)} คำ` : "-"}
            hint={words > 0 ? `รวมทุกตอน · ~${count(readingMinutes(words))} นาทีอ่าน` : undefined}
          />
        </ul>
      )}

      {/* ตารางลงตอน (§13T): when something is scheduled, the overview says
          WHAT goes up WHEN - not just that a number of things are queued. */}
      {scheduled.length > 0 ? (
        <section className="mb-10">
          <SectionHeader title="ตารางลงตอน" />
          <ul className="divide-y divide-hairline rounded-lg border border-border bg-surface">
            {scheduled.map((chapter) => (
              <li
                key={chapter.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
              >
                <span
                  aria-hidden
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning"
                >
                  <Icon name="clock" size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {chapter.title ??
                      chapterLabel(novel.chapter_unit, chapter.chapter_number)}
                  </span>
                </span>
                <span className="shrink-0 text-sm text-text-secondary tabular-nums">
                  จะขึ้น {scheduleLabel(chapter.scheduled_at)}
                </span>
                <Link
                  href={`${base}/chapters/${encodeURIComponent(chapter.slug)}`}
                  className="inline-flex min-h-8 shrink-0 items-center rounded-md border border-border px-3 text-xs text-text-secondary hover:border-primary-200 hover:text-text"
                >
                  แก้ไข
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <DraftTasks
        novelRef={novel.slug}
        base={base}
        chapterUnit={novel.chapter_unit}
        drafts={unfinished}
      />

      {/* ความเคลื่อนไหวล่าสุด (§13R). Comments on the fiction and community
          posts that attached it, in one timeline - the two ways somebody says
          something about a writer's work without messaging them. Once the work
          is out, an empty week is said out loud rather than omitted. */}
      {insights && (insights.activity.length > 0 || !isPrivate) ? (
        <section className="mb-10">
          <SectionHeader title="ความเคลื่อนไหวล่าสุด" />
          {insights.activity.length === 0 ? (
            <p className="rounded-lg border border-border border-dashed px-4 py-3 text-[13px] text-text-muted">
              ยังไม่มีคอมเมนต์หรือโพสต์ใหม่ - ลองแชร์ลิงก์เรื่องดูไหม
            </p>
          ) : (
            <ol className="divide-y divide-hairline rounded-lg border border-border bg-surface">
              {insights.activity.map((item, index) => (
                <li key={`${item.kind}-${index}`} className="flex gap-3 px-4 py-3">
                  <span
                    aria-hidden
                    className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-secondary text-text-muted"
                  >
                    <Icon
                      name={item.kind === ActivityKind.Post ? "users" : "message"}
                      size={14}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">
                      <span className="font-medium">{item.actor}</span>{" "}
                      {item.kind === ActivityKind.Post ? (
                        <>
                          ตั้งกระทู้ถึงเรื่องนี้ในชุมชน
                          {item.post_id ? (
                            <>
                              {" "}
                              <Link
                                href={`/community/post/${encodeURIComponent(item.post_id)}`}
                                className="text-primary hover:underline"
                              >
                                ดูโพสต์
                              </Link>
                            </>
                          ) : null}
                        </>
                      ) : item.chapter_slug ? (
                        <>
                          คอมเมนต์{" "}
                          <Link
                            href={`${base}/chapters/${encodeURIComponent(item.chapter_slug)}`}
                            className="text-primary hover:underline"
                          >
                            {item.chapter_label || "ตอนหนึ่ง"}
                          </Link>
                        </>
                      ) : (
                        "คอมเมนต์ที่หน้าเรื่อง"
                      )}
                    </span>
                    {item.excerpt ? (
                      <span className="mt-0.5 line-clamp-2 block text-xs text-text-secondary">
                        {item.excerpt}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-text-muted">
                    {relativeTime(item.created_at)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}

      {/* กิจกรรมของเรื่อง (§13T): what the WRITER did - publishes and recent
          edits - derived from the chapter list itself. The feed above is what
          readers did; this is the story's own log. It is a HISTORY, of things
          the writer already knows they did, so it lives folded at the bottom:
          the panels above answer "ต้องทำอะไรต่อ", this one answers "เมื่อไหร่"
          for whoever comes asking. */}
      {timeline.length > 0 ? (
        <section aria-label="กิจกรรมของเรื่อง" className="mb-10">
          <details className="group rounded-lg border border-border bg-surface">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-3 text-sm text-text-secondary hover:text-text [&::-webkit-details-marker]:hidden">
              <Icon
                name="chevron-right"
                size={14}
                className="transition-transform group-open:rotate-90"
              />
              ดูประวัติทั้งหมด
              <span className="text-xs text-text-muted">
                (เผยแพร่และแก้ไขล่าสุดของแต่ละตอน)
              </span>
            </summary>
            <ol className="divide-y divide-hairline border-t border-hairline">
              {timeline.map((event) => (
                <li
                  key={`${event.kind}-${event.chapterID}`}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <span
                    aria-hidden
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full ${
                      event.kind === "published"
                        ? "bg-success/15 text-success"
                        : "bg-surface-secondary text-text-muted"
                    }`}
                  >
                    <Icon name={event.kind === "published" ? "check" : "edit"} size={12} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {event.kind === "published" ? "เผยแพร่ " : "แก้ไข "}
                    <Link
                      href={`${base}/chapters/${encodeURIComponent(event.slug)}`}
                      className="hover:text-primary hover:underline"
                    >
                      {event.label}
                    </Link>
                  </span>
                  <span className="shrink-0 text-xs text-text-muted">
                    {relativeTime(event.at)}
                  </span>
                </li>
              ))}
            </ol>
          </details>
        </section>
      ) : null}

      {/* Archiving and deleting moved to the END of ตั้งค่าเรื่อง (settings
          review 2026-08): the overview is where a writer works, and delete
          does not belong an arm's length from "เขียนต่อ". */}
    </div>
  );
}

/**
 * Whether a scheduled first publish is still in the future - evaluated at
 * request time, which is what a Server Component's render IS.
 */
function pendingPublishOf(publishAt?: string): string | null {
  if (!publishAt) return null;
  return Date.parse(publishAt) > Date.now() ? publishAt : null;
}

/**
 * Which presentations this story's chapters ACTUALLY hold, in reading order.
 * Derived from the chapters rather than claimed by a setting (§13J); an empty
 * story falls back to the fiction's own declared format.
 *
 * Only chapters whose active representation holds CONTENT vote. Seven empty
 * drafts created as prose used to outvote the one published Reaction chapter,
 * so the badge said ร้อยแก้ว over a story every reader meets as headcanon -
 * the review's exact screenshot. An empty draft says nothing about what the
 * story is; the fallbacks below only apply when nothing has content yet.
 */
function presentFormats(
  chapters: ChapterSummary[],
  fallback: string,
): string[] {
  const order = ["standard", "chat", "headcanon"];
  const withContent = chapters.filter((chapter) => chapter.content_ready);
  const source = withContent.length > 0 ? withContent : chapters;
  const present = new Set<string>(
    source.length > 0 ? source.map((chapter) => chapter.active_format) : [fallback],
  );
  return order
    .filter((format) => present.has(format))
    .map((format) => presentationLabel(format))
    .filter(Boolean);
}

interface StoryEvent {
  kind: "published" | "edited";
  chapterID: string;
  slug: string;
  label: string;
  at: string;
}

/**
 * กิจกรรมของเรื่อง, derived - no new table, no new endpoint. A publish is a
 * chapter with a publication date; an edit is a chapter touched meaningfully
 * after it was created or published. The 90-second grace hides the automatic
 * touch every save makes right after creation.
 */
function storyTimeline(chapters: ChapterSummary[], unit?: string): StoryEvent[] {
  const events: StoryEvent[] = [];
  for (const chapter of chapters) {
    const label = chapter.title ?? chapterLabel(unit, chapter.chapter_number);
    if (chapter.published_at) {
      events.push({
        kind: "published",
        chapterID: chapter.id,
        slug: chapter.slug,
        label,
        at: chapter.published_at,
      });
    }
    const baseline = Math.max(
      Date.parse(chapter.created_at),
      chapter.published_at ? Date.parse(chapter.published_at) : 0,
    );
    if (Date.parse(chapter.updated_at) - baseline > 90_000) {
      events.push({
        kind: "edited",
        chapterID: chapter.id,
        slug: chapter.slug,
        label,
        at: chapter.updated_at,
      });
    }
  }
  return events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 6);
}

/**
 * The week-over-week readout beside a stat (§13T). Plain triangles rather
 * than icons - they are text, they inherit the tone colour, and a screen
 * reader gets the words either way.
 */
function WeekDelta({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  if (diff === 0) {
    return <span className="text-xs text-text-muted">เท่าสัปดาห์ก่อน</span>;
  }
  return (
    <span className={`text-xs tabular-nums ${diff > 0 ? "text-success" : "text-error"}`}>
      {diff > 0 ? "▲" : "▼"} {diff > 0 ? "+" : ""}
      {count(diff)}{" "}
      <span className="text-text-muted">จากสัปดาห์ก่อน ({count(previous)})</span>
    </span>
  );
}

function StatCard({
  label,
  value,
  hint,
  delta,
  series,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: React.ReactNode;
  series?: number[];
}) {
  return (
    <li className="rounded-lg border border-border bg-surface px-4 py-3.5">
      <p className="mono-label">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="font-serif text-xl font-semibold tabular-nums">{value}</p>
        {series && series.some((point) => point > 0) ? (
          <Sparkline values={series} width={72} height={24} />
        ) : null}
      </div>
      {delta ? <p className="mt-0.5">{delta}</p> : null}
      {hint ? <p className="mt-0.5 text-xs text-text-muted">{hint}</p> : null}
    </li>
  );
}
