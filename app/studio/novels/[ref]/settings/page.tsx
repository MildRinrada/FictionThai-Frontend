import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SectionHeader } from "@/components/ui/section-header";
import { AssistantSettings } from "@/features/ai/assistant-settings";
import { CollaboratorsPanel } from "@/features/studio/collaborators-panel";
import { DangerZone } from "@/features/studio/danger-zone";
import { DisplaySettings } from "@/features/studio/display-settings";
import { NovelSettings } from "@/features/studio/novel-settings";
import { PermissionsSettings } from "@/features/studio/permissions-settings";
import { PublishingSettings } from "@/features/studio/publishing-settings";
import { SettingsAnchors } from "@/features/studio/settings-anchors";
import { VariableTable } from "@/features/studio/variable-table";
import { serverGetOne } from "@/lib/api-server";
import { decodeParam, fetchOwnerChapters, fetchOwnerNovel } from "@/lib/fiction-server";
import type { VariablesResult } from "@/types/variable";
import { Visibility } from "@/types/novel";

export const metadata: Metadata = {
  title: "ตั้งค่าเรื่อง",
  robots: { index: false, follow: false },
};

/**
 * ตั้งค่าเรื่อง, ordered by weight (settings review 2026-08):
 *
 *   identity → ASSISTANT (the platform's differentiator, block two, not the
 *   basement) → content → audience → format → variables → publishing →
 *   display → permissions/money → collaborators → danger zone.
 *
 * The danger zone moved HERE from the overview: the overview is where a
 * writer works, and delete does not belong an arm's length from "continue
 * writing". Every block autosaves and answers at its own heading (item A).
 */

/**
 * The variables as their OWNER sees them - the only read that carries the
 * usage report (docs/PHASE-13-CREATION-AND-CONTROL.md §13H). A failure yields
 * an empty table rather than a broken page.
 */
async function fetchOwnVariables(ref: string): Promise<VariablesResult> {
  try {
    return await serverGetOne<VariablesResult>(
      `/novels/${encodeURIComponent(ref)}/variables`,
    );
  } catch {
    return { variables: [], usage: { undeclared: [], unused: [] } };
  }
}

/**
 * publish_at while it is still in the FUTURE - evaluated at request time,
 * which is what a Server Component's render is (the overview's pattern).
 */
function futureSchedule(publishAt?: string): string | null {
  if (!publishAt) return null;
  return new Date(publishAt).getTime() > Date.now() ? publishAt : null;
}

/** Whether the writer has any payment link for the donate switch to show. */
async function hasDonationLink(): Promise<boolean> {
  try {
    const profile = await serverGetOne<{ donation_url?: string }>("/me/author-profile");
    return Boolean(profile.donation_url);
  } catch {
    return false;
  }
}

export default async function StudioSettingsPage({
  params,
}: PageProps<"/studio/novels/[ref]/settings">) {
  const { ref } = await params;
  const decoded = decodeParam(ref);

  const [novel, variables, chapters, donationLinkSet] = await Promise.all([
    fetchOwnerNovel(decoded),
    fetchOwnVariables(decoded),
    // The owner's own list, drafts included - never novel.chapter_count,
    // which counts live chapters only (studio counting rule, §13T).
    fetchOwnerChapters(decoded),
    hasDonationLink(),
  ]);
  if (!novel) notFound();

  // Settings belong to the OWNER (13U). A collaborator reaches this page
  // through the shared studio nav; what they get is the statement, not the
  // forms - their surface is the chapters, not the fiction's configuration.
  if (!novel.is_owner) {
    return (
      <div>
        <SectionHeader title="ตั้งค่าเรื่อง" />
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-text-secondary">
          การตั้งค่าเรื่องแก้ได้เฉพาะเจ้าของเรื่อง -
          คุณเขียนและแก้ตอนของเรื่องนี้ได้ตามปกติ
        </p>
      </div>
    );
  }

  return (
    <div>
      <SectionHeader title="ตั้งค่าเรื่อง" />
      <p className="-mt-2 mb-4 text-xs text-text-muted">
        ทุกอย่างในหน้านี้บันทึกให้เองเมื่อหยุดแก้ - ดูสถานะได้ที่หัวข้อของแต่ละส่วน
      </p>

      <SettingsAnchors />

      <div className="mt-5 flex flex-col gap-6">
        <NovelSettings
          novel={novel}
          chapterTotal={chapters.length}
          assistantSlot={<AssistantSettings novelRef={novel.slug} />}
        />

        {/* The character/variable split rides IN the usage report - the API
            classifies against the cast, so every surface agrees. */}
        <VariableTable
          novelRef={novel.slug}
          initial={variables.variables}
          initialUsage={variables.usage}
        />

        <PublishingSettings novel={novel} scheduled={futureSchedule(novel.publish_at)} />
        <DisplaySettings novel={novel} />
        <PermissionsSettings novel={novel} hasDonationLink={donationLinkSet} />

        <div id="collaborators" className="scroll-mt-28">
          <CollaboratorsPanel
            novelRef={novel.slug}
            initial={novel.collaborators ?? []}
            ownerUsername={novel.author.username}
          />
        </div>

        {/* Last on purpose: everything above it is reversible. */}
        <div id="danger" className="scroll-mt-28">
          <DangerZone
            novelRef={novel.slug}
            title={novel.title}
            visibility={novel.visibility ?? Visibility.Private}
          />
        </div>
      </div>
    </div>
  );
}
