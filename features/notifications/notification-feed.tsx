"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications-client";
import type { Notification } from "@/types/notifications";

/**
 * The notification list on /notifications (docs/03 §28, docs/09 §23).
 *
 * Marking read is optimistic: both mutations are idempotent on the server, so
 * a repeat or a race resolves to the same state (docs/09 §33).
 */

/** Thai sentence for one notification. The list is open-ended server-side, so
 * unknown types fall back to a generic line instead of rendering nothing.
 * new_comment / comment_reply branch on entity_type: the same type covers
 * fiction threads and community posts (docs/08 §23.1). */
function describe(notification: Notification): string {
  const actor =
    notification.actor?.display_name ?? notification.actor?.username ?? "มีผู้ใช้";
  const onCommunity = notification.entity_type === "community_comment";
  switch (notification.type) {
    case "new_follower":
      return `${actor} ติดตามคุณ`;
    case "new_comment":
      return onCommunity
        ? `${actor} แสดงความคิดเห็นในโพสต์ของคุณ`
        : `${actor} แสดงความคิดเห็นในนิยายของคุณ`;
    case "comment_reply":
      return `${actor} ตอบกลับความคิดเห็นของคุณ`;
    case "novel_update":
      return `${actor} เผยแพร่ตอนใหม่`;
    case "community_reaction":
      return `${actor} ถูกใจโพสต์ของคุณ`;
    case "moderation":
      // Deliberately actor-less and generic: the sender is "the platform",
      // never an individual moderator (docs/11 §39), and the notification
      // reveals no moderation internals (docs/02 §38).
      return "ทีมดูแลได้ดำเนินการเกี่ยวกับเนื้อหาหรือบัญชีของคุณ";
    case "system":
      return "ประกาศจากระบบ";
    default:
      return `${actor} มีการอัปเดตใหม่`;
  }
}

/**
 * Two piles, because they are two different feelings.
 *
 * "เรื่องที่ติดตามมีตอนใหม่" is leisure - something to read tonight. "มีคน
 * คอมเมนต์งานคุณ" is about the reader's own work and lands completely
 * differently; a writer skimming for the second one should not have to walk
 * past forty update notices to find it, and someone catching up on reading
 * should not have their evening interrupted by a moderation notice.
 *
 * The split is by type, and an unknown type lands on the personal side: a
 * notification nobody has classified yet is more likely to be about you than
 * about a story you follow, and being told once too often beats missing it.
 */
type Pile = "mine" | "following";

const FOLLOWING_TYPES = new Set(["novel_update"]);

function pileOf(notification: Notification): Pile {
  return FOLLOWING_TYPES.has(notification.type) ? "following" : "mine";
}

const TABS: { pile: Pile; label: string }[] = [
  { pile: "mine", label: "เกี่ยวกับงานของฉัน" },
  { pile: "following", label: "เรื่องที่ติดตาม" },
];

export function NotificationFeed() {
  const [pile, setPile] = useState<Pile>("mine");
  const [items, setItems] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getNotifications()
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.meta.total);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = useCallback(async () => {
    const next = page + 1;
    const result = await getNotifications({ page: next });
    setItems((current) => {
      const seen = new Set(current.map((n) => n.id));
      return [...current, ...result.items.filter((n) => !seen.has(n.id))];
    });
    setTotal(result.meta.total);
    setPage(next);
  }, [page]);

  const markRead = useCallback(async (id: string) => {
    setItems((current) =>
      current.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    try {
      await markNotificationRead(id);
    } catch {
      // The next load shows the truth; an optimistic miss here is harmless.
    }
  }, []);

  const markAll = useCallback(async () => {
    setItems((current) => current.map((n) => ({ ...n, read: true })));
    try {
      await markAllNotificationsRead();
    } catch {
      // Same: server state wins on the next load.
    }
  }, []);

  if (loading) {
    return <p className="text-sm text-text-secondary">กำลังโหลดการแจ้งเตือน…</p>;
  }
  if (failed) {
    return (
      <p className="text-sm text-text-secondary">
        ไม่สามารถโหลดการแจ้งเตือนได้ในขณะนี้
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-border bg-surface p-6 text-sm text-text-secondary">
        <p>ยังไม่มีการแจ้งเตือน</p>
        <p className="mt-2">
          ติดตามนักเขียนที่ชอบจากหน้า{" "}
          <Link href="/explore" className="text-primary hover:underline">
            สำรวจ
          </Link>{" "}
          เพื่อรับข่าวเมื่อมีตอนใหม่
        </p>
      </div>
    );
  }

  const hasUnread = items.some((n) => !n.read);
  const shown = items.filter((notification) => pileOf(notification) === pile);

  return (
    <div>
      <nav aria-label="ประเภทการแจ้งเตือน" className="mb-4 flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const unread = items.filter(
            (n) => pileOf(n) === tab.pile && !n.read,
          ).length;
          return (
            <button
              key={tab.pile}
              type="button"
              onClick={() => setPile(tab.pile)}
              aria-pressed={pile === tab.pile}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm ${
                pile === tab.pile
                  ? "border-primary-200 bg-primary-50 text-text"
                  : "border-border text-text-secondary hover:text-text"
              }`}
            >
              {tab.label}
              {unread > 0 ? (
                <span className="font-mono text-[11px] text-primary tabular-nums">
                  {unread}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {hasUnread ? (
        <div className="mb-4">
          <Button variant="secondary" onClick={markAll}>
            อ่านทั้งหมดแล้ว
          </Button>
        </div>
      ) : null}

      {shown.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-6 text-sm text-text-secondary">
          ยังไม่มีการแจ้งเตือนในหมวดนี้
        </p>
      ) : null}

      <ol
        className={
          shown.length === 0
            ? "hidden"
            : "divide-y divide-border rounded-md border border-border"
        }
      >
        {shown.map((notification) => (
          <li
            key={notification.id}
            className={`flex items-start justify-between gap-4 px-4 py-3 ${
              notification.read ? "" : "bg-primary/5"
            }`}
          >
            <div className="min-w-0">
              <p className="text-sm">
                {!notification.read ? (
                  <span
                    aria-label="ยังไม่ได้อ่าน"
                    className="mr-2 inline-block h-2 w-2 rounded-full bg-primary align-middle"
                  />
                ) : null}
                {describe(notification)}
              </p>
              <time
                dateTime={notification.created_at}
                className="mt-1 block text-xs text-text-secondary"
              >
                {formatDate(notification.created_at)}
              </time>
            </div>
            {!notification.read ? (
              <button
                type="button"
                onClick={() => void markRead(notification.id)}
                className="shrink-0 text-xs text-text-secondary hover:text-primary"
              >
                อ่านแล้ว
              </button>
            ) : null}
          </li>
        ))}
      </ol>

      {items.length < total ? (
        <div className="mt-4">
          <Button variant="secondary" onClick={loadMore}>
            ดูการแจ้งเตือนเพิ่มเติม
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}
