import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ProfileBody } from "@/components/profile/profile-body";
import { profileTabOf } from "@/components/profile/profile-tab";
import { worksSortOf } from "@/components/profile/works-panel";
import { AvatarControl } from "@/features/profile/avatar-control";
import { BannerControl } from "@/features/profile/banner-control";
import {
  EditProfileDialog,
  EditableBio,
  EditableExtras,
  EditableName,
} from "@/features/profile/inline-profile";
import { NextSteps } from "@/features/profile/next-steps";
import { getCurrentUserOrNull } from "@/lib/auth";
import { fetchPublicProfile } from "@/lib/profiles-server";

/**
 * The caller's own profile - docs/03 §5 `/profile`.
 *
 * It renders the SAME body as `/users/[username]`, from the same public
 * endpoint, plus the owner's controls. That is deliberate: a writer looking at
 * their own profile is looking at what everyone else sees, so there is no
 * second layout to drift, and no way for the owner's view to quietly include
 * something a visitor would never get (docs/PHASE-12-STORY-DEPTH.md §12E).
 *
 * docs/06 §37 orders a writer profile as avatar, display name, bio, published
 * novels, then social activity - which is why ผลงาน is the first tab and the
 * default. A profile that opened on a status feed would answer "what has this
 * person said" before "what has this person written".
 */

export const metadata: Metadata = {
  title: "โปรไฟล์ของฉัน",
  // A personal page must never be indexed (docs/11 §34).
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ tab?: string; page?: string; sort?: string }>;
}

export default async function ProfilePage({ searchParams }: PageProps) {
  const user = await getCurrentUserOrNull();
  if (!user) {
    redirect("/login?next=/profile");
  }

  // Read the caller's own profile through the public endpoint, so this page
  // can only ever show what the endpoint publishes.
  const profile = await fetchPublicProfile(user.username);
  if (!profile) notFound();

  const query = await searchParams;

  return (
    <ProfileBody
      profile={profile}
      tab={profileTabOf(query.tab)}
      page={Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1)}
      sort={worksSortOf(query.sort)}
      basePath="/profile"
      actions={<OwnerActions username={profile.username} profile={profile} />}
      bannerAction={
        <BannerControl username={profile.username} />
      }
      // The owner sees their own unpublished work here; a visitor never does.
      // A writer whose fictions are all drafts was looking at an empty page
      // with nothing to explain it.
      isOwner
      // What visitors see is edited WHERE they see it (profile review
      // 2026-08, section A): the name in the hero, the bio in its card, the
      // link/availability/boundaries rows beneath.
      nameEditor={<EditableName profile={profile} />}
      // The picture is changed by pointing at it - camera on hover, never a
      // dialog or a settings page (owner's standing rule).
      avatarEditor={<AvatarControl profile={profile} />}
      bioEditor={
        <span id="intro" className="block scroll-mt-24">
          <EditableBio profile={profile} />
        </span>
      }
      extrasEditor={<EditableExtras profile={profile} />}
      // One collapsible line, dismissible for good - never the page-eating
      // card it used to be (section B).
      ownerPanel={<NextSteps profile={profile} />}
      emptyWorks={<NoWorkYet />}
    />
  );
}

function OwnerActions({
  username,
  profile,
}: {
  username: string;
  profile: NonNullable<Awaited<ReturnType<typeof fetchPublicProfile>>>;
}) {
  // The hierarchy the review asked for (section F): one primary, one
  // secondary, and the rarely-used view-as demoted to a text link.
  return (
    <>
      <Link
        href="/studio"
        className="inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-white hover:opacity-90"
      >
        จัดการนิยายของฉัน
      </Link>
      <EditProfileDialog profile={profile} />
      {/* The public URL with the preview flag, so the banner up top can say
          which mode this is (section F). */}
      <Link
        href={`/users/${encodeURIComponent(username)}?preview=1`}
        className="inline-flex min-h-10 items-center justify-center px-1 text-sm text-text-secondary underline-offset-2 hover:text-primary hover:underline"
      >
        ดูแบบคนอื่นเห็น
      </Link>
    </>
  );
}

function NoWorkYet() {
  return (
    <div className="rounded-xl border border-dashed border-border p-8 text-center">
      <p className="font-serif text-lg font-semibold">ยังไม่มีผลงาน</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-text-secondary">
        เริ่มเรื่องแรกได้เลย - เลือกได้ว่าจะเขียนแบบร้อยแก้ว แชท หรือเฮดแคนอน
        และเปลี่ยนการแสดงผลภายหลังได้โดยไม่กระทบต้นฉบับ
      </p>
      <Link
        href="/studio/novels/new"
        className="mt-5 inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-white hover:opacity-90"
      >
        สร้างผลงานชิ้นแรก
      </Link>
    </div>
  );
}
