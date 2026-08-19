import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PromoManager } from "@/features/promo/promo-manager";
import { getCurrentUserOrNull } from "@/lib/auth";

/**
 * คิวสไลด์หน้าแรก (docs/HOME-PROMO.md).
 *
 * The redirect is a UX affordance only: every /admin/promo endpoint enforces
 * RequireAuth + RequireStaff server-side, and the service re-checks - a
 * non-staff visitor who reaches this page just sees the API's refusal.
 */

export const metadata: Metadata = {
  title: "คิวสไลด์หน้าแรก - ทีมดูแล",
  robots: { index: false, follow: false },
};

export default async function PromoAdminPage() {
  const user = await getCurrentUserOrNull();
  if (!user) {
    redirect("/login?next=/admin/promo");
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <nav aria-label="เส้นทาง" className="mb-6 text-sm">
        <Link href="/" className="text-text-secondary hover:text-primary">
          ← กลับหน้าแรก
        </Link>
      </nav>

      <h1 className="mb-2 text-3xl font-bold tracking-tight">คิวสไลด์หน้าแรก</h1>
      <p className="mb-8 max-w-prose text-sm text-text-secondary">
        สไลด์เรียงตามลำดับในคิว ระบบเสิร์ฟสูงสุด 4 ใบที่อยู่ในช่วงเวลาและเปิดอยู่ -
        สไลด์ซื้อพื้นที่ติดป้าย “โปรโมท” เสมอ และเสิร์ฟไม่เกิน 1 ใน 4 ของชุด
        (ช่องขวาของ hero เป็นของนักเขียนหน้าใหม่ ระบบเลือกอัตโนมัติ ขายไม่ได้)
      </p>

      <PromoManager />
    </main>
  );
}
