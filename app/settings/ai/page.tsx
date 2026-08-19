import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageContainer } from "@/components/shell/page-container";
import { SettingsNav } from "@/components/settings/settings-nav";
import { AccountLexicon } from "@/features/ai/account-lexicon";
import { AssistantDemo } from "@/features/ai/assistant-demo";
import { AssistantSettings } from "@/features/ai/assistant-settings";
import { MutedRules } from "@/features/ai/muted-rules";
import { AiUsagePanel } from "@/features/ai/usage-panel";
import { getCurrentUserOrNull } from "@/lib/auth";

/**
 * ตั้งค่าผู้ช่วยเขียน - the ACCOUNT tier, as a tab of the account settings
 * (moved here from /studio/ai after review, 2026-08).
 *
 * Everything on this page is account-wide: the default switches every fiction
 * starts from, the word bank that applies across all of them, the taught
 * silences, and the daily quota. Chapter-scoped tools left for the chapter
 * editor, which knows which chapter is open - a settings page asking for a
 * chapter id was the review's headline complaint.
 *
 * The redirect is a UX affordance, NOT access control - the API rejects an
 * unauthenticated AI call regardless (docs/07 §5, docs/11 §43).
 */

export const metadata: Metadata = {
  title: "ตั้งค่าผู้ช่วยเขียน",
  // Settings are private by nature; keep them out of the index (docs/11 §31).
  robots: { index: false, follow: false },
};

export default async function AiSettingsPage() {
  const user = await getCurrentUserOrNull();
  if (!user) {
    redirect("/login?next=/settings/ai");
  }

  return (
    <PageContainer className="max-w-3xl pt-6 pb-16">
      <SettingsNav />

      <h1 className="mt-5 font-serif text-2xl font-semibold tracking-tight">
        ผู้ช่วยเขียน
      </h1>
      {/* The one-line summary matches the switches that actually exist below
          - it used to promise "สรุปเนื้อหา" this page could not deliver. */}
      <p className="mt-2 text-sm text-text-secondary">
        ตรวจคำผิด ความสอดคล้องของตัวละคร ความต่อเนื่อง และเกลาภาษา -
        ผู้ช่วยเสนอเท่านั้น ไม่แก้ต้นฉบับของคุณเอง
      </p>

      <div className="mt-6 flex flex-col gap-5">
        <AssistantSettings />
        <AccountLexicon />
        <MutedRules />
        <AiUsagePanel />
        <AssistantDemo />
      </div>
    </PageContainer>
  );
}
