"use client";

import { useEffect, useState } from "react";

import { getUnreadCount } from "@/lib/notifications-client";

/**
 * The unread count beside a "การแจ้งเตือน" link (docs/03 §5 top navigation).
 *
 * One cheap read after mount, riding the (recipient_id, read_at) index
 * (docs/08 §37). Renders nothing for guests, on failure, or at zero - the
 * badge is an accent, never a blocker.
 */
export function NotificationBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getUnreadCount()
      .then((result) => {
        if (!cancelled) setCount(result.unread_count);
      })
      .catch(() => {
        // Guest or API blip: no badge either way.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (count <= 0) return null;

  return (
    <span
      aria-label={`ยังไม่ได้อ่าน ${count} รายการ`}
      className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-xs font-medium text-white"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
