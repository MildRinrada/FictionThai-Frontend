import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SubscriptionManager } from "@/features/subscription/subscription-manager";
import { getCurrentUserOrNull } from "@/lib/auth";

/**
 * The reader's Premium management page (brief §22). Private: the redirect is a
 * UX affordance only - the API independently enforces authentication and
 * authorization (docs/07 §5, docs/11 §43).
 */

export const metadata: Metadata = {
  title: "การเป็นสมาชิก Premium",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function SubscriptionPage({ searchParams }: PageProps) {
  const user = await getCurrentUserOrNull();
  if (!user) {
    redirect("/login?next=/account/subscription");
  }

  const params = await searchParams;
  const initialPlan = firstValue(params.plan);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <nav aria-label="เส้นทาง" className="mb-6 text-sm">
        <Link href="/pricing" className="text-text-secondary hover:text-primary">
          ← แพ็กเกจทั้งหมด
        </Link>
      </nav>

      <h1 className="mb-2 text-2xl font-semibold">การเป็นสมาชิก Premium</h1>
      <p className="mb-8 text-sm text-text-secondary">
        จัดการแพ็กเกจ Premium ของคุณ การชำระเงินนี้เป็นของ FictionThai
        และแยกจากการสนับสนุนนักเขียนโดยสิ้นเชิง
      </p>

      <SubscriptionManager initialPlan={initialPlan} />
    </main>
  );
}
