import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ReportDetailView } from "@/features/moderation/report-detail";
import { getCurrentUserOrNull } from "@/lib/auth";

/**
 * One report, for staff - docs/02 §46: review content, choose an action,
 * record it, close the report. Authorization is the API's (docs/09 §29).
 */

export const metadata: Metadata = {
  title: "รายละเอียดรายงาน - ทีมดูแล",
  robots: { index: false, follow: false },
};

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getCurrentUserOrNull();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/admin/moderation/reports/${id}`)}`);
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <nav aria-label="เส้นทาง" className="mb-6 text-sm">
        <Link href="/admin/moderation" className="text-text-secondary hover:text-primary">
          ← คิวรายงาน
        </Link>
      </nav>

      <h1 className="mb-8 text-3xl font-bold tracking-tight">รายละเอียดรายงาน</h1>

      <ReportDetailView reportId={id} />
    </main>
  );
}
