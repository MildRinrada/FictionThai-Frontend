import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { NotificationFeed } from "@/features/notifications/notification-feed";
import { getCurrentUserOrNull } from "@/lib/auth";

/**
 * The notification centre - docs/03 §28 `/notifications` (authenticated).
 *
 * The redirect is the UX affordance; the API's RequireAuth on every
 * notification endpoint is the actual protection (docs/07 §5, docs/11 §43).
 * The feed itself is a client island: marking read is interactive, and a
 * personalised list must never render into a shared cache (docs/14 §7).
 */

export const metadata: Metadata = {
  title: "การแจ้งเตือน",
  robots: { index: false, follow: false },
};

export default async function NotificationsPage() {
  const user = await getCurrentUserOrNull();
  if (!user) {
    redirect("/login?next=/notifications");
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <nav aria-label="เส้นทาง" className="mb-6 text-sm">
        <Link href="/" className="text-text-secondary hover:text-primary">
          ← กลับหน้าแรก
        </Link>
      </nav>

      <h1 className="mb-8 text-3xl font-bold tracking-tight">การแจ้งเตือน</h1>

      <NotificationFeed />
    </main>
  );
}
