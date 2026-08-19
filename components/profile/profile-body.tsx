import type { ReactNode } from "react";

import { PostCard } from "@/components/community/post-card";
import { ProfileHero } from "@/components/profile/profile-hero";
import { ProfileSidebar } from "@/components/profile/profile-sidebar";
import { AchievementGrid } from "@/components/profile/achievement-grid";
import { CommentWall } from "@/components/profile/comment-wall";
import { PinnedShelf } from "@/components/profile/pinned-shelf";
import { ShelfList } from "@/components/profile/shelf-list";
import { ProfileTabs, type ProfileTab } from "@/components/profile/profile-tabs";
import { WorksPanel, type WorksSort } from "@/components/profile/works-panel";
import { PageContainer } from "@/components/shell/page-container";
import {
  fetchAchievements,
  fetchProfileTimeline,
  fetchProfileWorks,
  fetchPublicShelves,
} from "@/lib/profiles-server";
import type { CommunityPost } from "@/types/community";
import { profileName, type PublicProfile } from "@/types/profile";

/**
 * A profile page body, shared by `/users/[username]` and the caller's own
 * `/profile` (docs/PHASE-12-STORY-DEPTH.md §12E).
 *
 * One component on purpose: the page a writer sees of themselves is the page
 * everyone else sees, plus their own controls. A second layout for the owner
 * would eventually show them something a visitor never gets, and they would
 * have no way to tell.
 *
 * Both lists are audience-filtered by the API, not here - the works listing
 * applies the reader rule, and the community listing keeps a followers-only
 * post inside its audience (docs/11 §37). This renders what it is given.
 */

export interface ProfileBodyProps {
  profile: PublicProfile;
  tab: ProfileTab;
  page: number;
  basePath: string;
  /** Owner controls, or the follow island for a visitor. */
  actions?: ReactNode;
  /** The owner's cover-image control, rendered inside the banner. */
  bannerAction?: ReactNode;
  /**
   * Owner-only panels shown above the tabs. Account-level things do NOT belong
   * here - the adult attestation used to be, and it was the first thing a
   * writer saw on the page other people read; it lives in
   * `/settings/profile` now (docs/PROFILE-AND-ACHIEVEMENTS.md Part 1).
   */
  ownerPanel?: ReactNode;
  /** Replaces the "no work yet" text - the owner gets a call to action. */
  emptyWorks?: ReactNode;
  /**
   * This is the OWNER looking at their own page (profile review 2026-08 -
   * it used to be spelled `includeUnpublished`, one prop carrying two
   * meanings). Unpublished work is included and marked, sections show while
   * empty, and the inline editors below light up.
   */
  isOwner?: boolean;
  /** The owner's in-place editors (section A): name, bio, extras rows - and
      the avatar's camera-on-hover control (no dialog, no settings page). */
  nameEditor?: ReactNode;
  avatarEditor?: ReactNode;
  bioEditor?: ReactNode;
  extrasEditor?: ReactNode;
  /** How the ผลงาน panel is ordered - kept in the URL. */
  sort?: WorksSort;
}

export async function ProfileBody({
  profile,
  tab,
  page,
  basePath,
  actions,
  bannerAction,
  ownerPanel,
  emptyWorks,
  isOwner = false,
  nameEditor,
  avatarEditor,
  bioEditor,
  extrasEditor,
  sort = "updated",
}: ProfileBodyProps) {
  const [works, timeline, shelves, achievements] = await Promise.all([
    fetchProfileWorks(profile.username, tab === "works" ? page : 1, sort, isOwner),
    // The owner asks with their session, so their own followers-only posts
    // are visible on their own page (profile review 2026-08).
    fetchProfileTimeline(profile.username, tab === "timeline" ? page : 1, isOwner),
    fetchPublicShelves(profile.username),
    fetchAchievements(profile.username),
  ]);

  /** Every panel keeps its state in the URL, so any view can be linked to. */
  const hrefFor = (query: { page?: number; sort?: WorksSort; tab?: ProfileTab }) => {
    const params = new URLSearchParams();
    const nextTab = query.tab ?? tab;
    const nextSort = query.sort ?? sort;
    const nextPage = query.page ?? page;
    if (nextTab !== "works") params.set("tab", nextTab);
    if (nextSort !== "updated") params.set("sort", nextSort);
    if (nextPage > 1) params.set("page", String(nextPage));
    const search = params.toString();
    return search ? `${basePath}?${search}` : basePath;
  };

  const name = profileName(profile);

  return (
    <main id="main">
      <ProfileHero
        profile={profile}
        actions={actions}
        bannerAction={bannerAction}
        nameEditor={nameEditor}
        avatarEditor={avatarEditor}
      />

      <PageContainer className="pb-16">
        {/* The work is the page's point (profile review section C): the grid
            gets the width, and who-this-is keeps a narrow column. */}
        <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="flex flex-col gap-5">
            <ProfileSidebar
              profile={profile}
              bioEditor={bioEditor}
              extrasEditor={extrasEditor}
            />
            {achievements ? (
              <AchievementGrid achievements={achievements} name={name} isOwner={isOwner} />
            ) : null}
          </div>

          <div className="min-w-0">
            {ownerPanel ? <div className="mb-5">{ownerPanel}</div> : null}

            {/* The writer's own answer to "where do I start", above the tabs
                because it is the first question a new reader has. */}
            <PinnedShelf pinned={profile.pinned ?? []} />

            {/* Every panel rides the FIRST response, and the tab row swaps
                them locally - switching never refreshes the page (profile
                review follow-up 2026-08). */}
            <ProfileTabs
              basePath={basePath}
              active={tab}
              workCount={profile.novel_count}
              timelineCount={timeline?.meta?.total ?? 0}
              shelfCount={shelves.length}
              wallEnabled={profile.wall_enabled}
              isOwner={isOwner}
              panels={{
                works: (
                  <WorksPanel
                    works={works?.items ?? []}
                    meta={works?.meta}
                    page={page}
                    sort={sort}
                    hrefFor={hrefFor}
                    isOwner={isOwner}
                    fallback={
                      sort === "ongoing" || sort === "completed" ? (
                        <EmptyPanel>
                          ไม่มีเรื่องใน{sort === "ongoing" ? "กำลังเขียน" : "ที่จบแล้ว"}ตอนนี้
                        </EmptyPanel>
                      ) : (
                        (emptyWorks ?? (
                          <EmptyPanel>{name} ยังไม่มีผลงานที่เผยแพร่</EmptyPanel>
                        ))
                      )
                    }
                  />
                ),
                shelves: (
                  <ShelfList shelves={shelves} ownerName={name} isOwner={isOwner} />
                ),
                wall: (
                  <CommentWall
                    userRef={profile.username}
                    ownerName={name}
                    enabled={profile.wall_enabled}
                  />
                ),
                timeline: (
                  <Timeline
                    posts={timeline?.items ?? []}
                    fallback={
                      <EmptyPanel>
                        {isOwner
                          ? "ยังไม่มีโพสต์ - ชวนคุยกับผู้อ่านได้ในหน้าชุมชน"
                          : `${name} ยังไม่มีโพสต์ในชุมชน`}
                      </EmptyPanel>
                    }
                  />
                ),
              }}
            />
          </div>
        </div>
      </PageContainer>
    </main>
  );
}

function Timeline({ posts, fallback }: { posts: CommunityPost[]; fallback: ReactNode }) {
  if (posts.length === 0) return <>{fallback}</>;
  return (
    <ol className="space-y-4">
      {posts.map((post) => (
        <li key={post.id}>
          <PostCard post={post} />
        </li>
      ))}
    </ol>
  );
}

function EmptyPanel({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-text-secondary">
      {children}
    </p>
  );
}

