import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfileBody } from "@/components/profile/profile-body";
import { profileTabOf } from "@/components/profile/profile-tab";
import { worksSortOf } from "@/components/profile/works-panel";
import { PreviewBanner, VisitorActions } from "@/features/profile/visitor-actions";
import { decodeParam } from "@/lib/fiction-server";
import { fetchPublicProfile } from "@/lib/profiles-server";
import { profileName } from "@/types/profile";

/**
 * Somebody else's profile - `/users/[username]`
 * (docs/PHASE-12-STORY-DEPTH.md §12E).
 *
 * Until this route existed, an author could be NAMED on a fiction page and in
 * the community feed but never linked to. Everything on it is fetched without
 * credentials, so one cached render serves every visitor (docs/14 §7); the
 * only personal thing is the follow button, a client island that asks about
 * the caller after mount.
 */

interface PageProps {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ tab?: string; page?: string; sort?: string; preview?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params;
  const profile = await fetchPublicProfile(decodeParam(username));
  // Thrown HERE so the 404 STATUS is committed before streaming begins.
  if (!profile) notFound();

  const name = profileName(profile);
  return {
    title: name,
    description: profile.author_bio ?? profile.bio ?? `ผลงานและความเคลื่อนไหวของ ${name}`,
    // The username is the canonical form even when the URL used an id.
    alternates: { canonical: `/users/${profile.username}` },
  };
}

export default async function PublicProfilePage({ params, searchParams }: PageProps) {
  const [{ username: raw }, query] = await Promise.all([params, searchParams]);

  const profile = await fetchPublicProfile(decodeParam(raw));
  if (!profile) notFound();

  return (
    <>
      {/* The owner's "ดูแบบคนอื่นเห็น" arrives with ?preview=1, and this
          strip says which mode the page is in (profile review section F).
          Harmless for anyone else who adds the flag - it only labels. */}
      {query.preview === "1" ? <PreviewBanner /> : null}
      <ProfileBody
        profile={profile}
        tab={profileTabOf(query.tab)}
        page={Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1)}
        sort={worksSortOf(query.sort)}
        basePath={`/users/${encodeURIComponent(profile.username)}`}
        actions={
          <VisitorActions authorId={profile.id} username={profile.username} />
        }
      />
    </>
  );
}
