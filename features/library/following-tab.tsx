"use client";

import Link from "next/link";
import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { count, relativeTime } from "@/lib/format";
import { setFollowNotify, unfollowUser, followUser } from "@/lib/library-client";
import type { FollowedAuthor } from "@/types/library";

import { AuthorAvatar, EmptyState } from "@/features/library/shared";

/**
 * แท็บ "นักเขียนที่ติดตาม" (library redesign 2026-08, section F): a row per
 * person with what actually matters - when they last published, how many
 * fictions they are still writing, and a notification switch of their own,
 * because following is not the same as wanting an alert from everyone.
 * The quiet group exists to make unfollowing easy.
 */

const QUIET_DAYS = 45;

export function FollowingTab({
  initial,
  notify,
  onCountChange,
}: {
  initial: FollowedAuthor[];
  notify: (message: string, undo?: () => void) => void;
  onCountChange: (delta: number) => void;
}) {
  const [entries, setEntries] = useState(initial);
  const [now] = useState(() => Date.now());

  function isActive(entry: FollowedAuthor): boolean {
    if (!entry.last_published_at) return false;
    return (now - new Date(entry.last_published_at).getTime()) / 86_400_000 <= QUIET_DAYS;
  }

  function toggleNotify(entry: FollowedAuthor) {
    const next = !entry.notify_new_chapters;
    setEntries((current) =>
      current.map((row) =>
        row.author.id === entry.author.id ? { ...row, notify_new_chapters: next } : row,
      ),
    );
    void setFollowNotify(entry.author.id, next);
  }

  function unfollow(entry: FollowedAuthor) {
    setEntries((current) => current.filter((row) => row.author.id !== entry.author.id));
    onCountChange(-1);
    void unfollowUser(entry.author.id);
    notify(`เลิกติดตาม ${entry.author.display_name || entry.author.username} แล้ว`, () => {
      setEntries((current) => [entry, ...current]);
      onCountChange(1);
      void followUser(entry.author.id);
    });
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon="users"
        title="ยังไม่ได้ติดตามนักเขียนคนไหน"
        body="ติดตามนักเขียนที่ชอบจากหน้าเรื่องหรือหน้าโปรไฟล์ แล้วรวมความเคลื่อนไหวของทุกคนไว้ที่นี่"
      >
        <Link
          href="/explore"
          className="mt-1 inline-flex min-h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-white hover:opacity-90"
        >
          สำรวจนักเขียนและเรื่องเด่น
        </Link>
      </EmptyState>
    );
  }

  const groups: { key: boolean; title: string; hint?: string }[] = [
    { key: true, title: "มีความเคลื่อนไหว" },
    {
      key: false,
      title: "เงียบไปนาน",
      hint: "ไม่ลงตอนใหม่เกิน 45 วัน - พิจารณาเลิกติดตามได้จากตรงนี้",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {groups.map(({ key, title, hint }) => {
        const rows = entries.filter((entry) => isActive(entry) === key);
        if (rows.length === 0) return null;
        return (
          <section key={String(key)} aria-label={title}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="text-sm font-medium">{title}</h2>
              <span className="text-xs text-text-muted">{count(rows.length)} คน</span>
              {hint ? <span className="text-xs text-text-muted">· {hint}</span> : null}
            </div>
            <ol className="mt-2 flex flex-col gap-2">
              {rows.map((entry) => (
                <li key={entry.author.id}>
                  <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
                    <AuthorAvatar
                      name={entry.author.display_name || entry.author.username}
                      avatarURL={entry.author.avatar_url}
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/users/${encodeURIComponent(entry.author.username)}`}
                        className="line-clamp-1 text-sm font-medium hover:text-primary"
                      >
                        {entry.author.display_name || entry.author.username}
                      </Link>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-text-secondary">
                        {entry.last_published_at ? (
                          <span>ลงตอนใหม่{relativeTime(entry.last_published_at)}</span>
                        ) : (
                          <span className="text-text-muted">ยังไม่มีตอนที่เผยแพร่</span>
                        )}
                        {entry.writing_count > 0 ? (
                          <span>· กำลังเขียน {count(entry.writing_count)} เรื่อง</span>
                        ) : null}
                      </p>
                    </div>

                    <label
                      title="แจ้งเตือนเมื่อคนนี้ลงตอนใหม่"
                      className="flex shrink-0 items-center gap-1.5 text-xs text-text-secondary"
                    >
                      <input
                        type="checkbox"
                        role="switch"
                        checked={entry.notify_new_chapters}
                        onChange={() => toggleNotify(entry)}
                        aria-label={`แจ้งเตือนตอนใหม่ของ ${
                          entry.author.display_name || entry.author.username
                        }`}
                        className="size-4 accent-primary"
                      />
                      <span className="hidden sm:inline">แจ้งตอนใหม่</span>
                      <Icon name="bell" size={13} className="sm:hidden" />
                    </label>

                    <button
                      type="button"
                      onClick={() => unfollow(entry)}
                      className="inline-flex min-h-8 shrink-0 items-center rounded-md border border-border px-2.5 text-xs text-text-secondary hover:border-error hover:text-error"
                    >
                      เลิกติดตาม
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
