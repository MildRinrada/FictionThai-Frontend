import type { Metadata } from "next";
import Link from "next/link";

import { PricingTable } from "@/features/subscription/pricing-table";

/**
 * Premium pricing (Phase 11, docs/MONETIZATION.md). Public - a guest may browse
 * before deciding to register. Functional foundation only, not the designed
 * marketing page. The prices come from the API (the database is the source of
 * truth), never hard-coded here.
 */

export const metadata: Metadata = {
  title: "FictionThai Premium",
  description: "สมัคร Premium เพื่อปลดล็อกฟีเจอร์เพิ่มเติมสำหรับนักอ่านและนักเขียน",
};

export default function PricingPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <nav aria-label="เส้นทาง" className="mb-6 text-sm">
        <Link href="/" className="text-text-secondary hover:text-primary">
          ← กลับหน้าแรก
        </Link>
      </nav>

      <h1 className="mb-2 text-3xl font-semibold">FictionThai Premium</h1>
      <p className="mb-8 max-w-2xl text-sm text-text-secondary">
        สนับสนุนแพลตฟอร์มและปลดล็อกฟีเจอร์เพิ่มเติม การชำระเงินนี้เป็นของ FictionThai
        โดยตรง แยกจากการสนับสนุนนักเขียนซึ่งทำผ่านลิงก์ภายนอกของนักเขียนแต่ละคน
      </p>

      <PricingTable />
    </main>
  );
}
