import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ReportQueue } from "@/features/moderation/report-queue";
import { getCurrentUserOrNull } from "@/lib/auth";

/**
 * The moderation queue - docs/03 §28 `/admin/moderation`.
 *
 * The redirect and the role check here are UX affordances only: every admin
 * endpoint enforces RequireAuth + RequireStaff server-side (docs/09 §29
 * "Admin APIs must never rely solely on frontend route protection"). A
 * non-staff user who reaches this page anyway just sees the API's refusal.
 */

export const metadata: Metadata = {
  title: "คิวรายงาน - ทีมดูแล",
  robots: { index: false, follow: false },
};

export default async function ModerationPage() {
  const user = await getCurrentUserOrNull();
  if (!user) {
    redirect("/login?next=/admin/moderation");
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <nav aria-label="เส้นทาง" className="mb-6 text-sm">
        <Link href="/" className="text-text-secondary hover:text-primary">
          ← กลับหน้าแรก
        </Link>
      </nav>

      <h1 className="mb-2 text-3xl font-bold tracking-tight">คิวรายงาน</h1>
      <p className="mb-8 text-sm text-text-secondary">
        รายงานจากผู้ใช้ เรียงจากเก่าไปใหม่ (docs/02 §38)
      </p>

      <ReportQueue />
    </main>
  );
}
