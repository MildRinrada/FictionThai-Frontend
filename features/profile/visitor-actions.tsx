"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { FollowButton } from "@/features/library/follow-button";
import { ReportButton } from "@/features/moderation/report-button";
import { getFollowStatus, setFollowNotify } from "@/lib/library-client";

/**
 * What a VISITOR can do on somebody's profile (profile review 2026-08,
 * section F): follow - the page's most important action, finally primary -
 * with its per-author notification switch once following, and the quiet ⋯
 * for everything else (copy link, report). Blocking does not exist on the
 * platform yet, so the menu does not pretend it does.
 */
export function VisitorActions({
  authorId,
  username,
}: {
  authorId: string;
  username: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [following, setFollowing] = useState<boolean | null>(null);
  const [notify, setNotify] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    getFollowStatus(authorId)
      .then((status) => {
        if (alive) setFollowing(status.is_following);
      })
      .catch(() => {
        if (alive) setFollowing(false);
      });
    return () => {
      alive = false;
    };
  }, [authorId]);

  function toggleNotify() {
    const next = !notify;
    setNotify(next);
    void setFollowNotify(authorId, next);
  }

  function copyLink() {
    void navigator.clipboard
      ?.writeText(`${window.location.origin}/users/${encodeURIComponent(username)}`)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      });
    setMenuOpen(false);
  }

  return (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      {/* The page's most important action, dressed like it (section F). */}
      <FollowButton authorId={authorId} selfLinksToProfile variant="primary" />

      {/* The notify switch appears once the follow exists - following is not
          the same as wanting every alert. */}
      {following ? (
        <button
          type="button"
          role="switch"
          aria-checked={notify}
          onClick={toggleNotify}
          title={notify ? "ปิดแจ้งเตือนตอนใหม่ของคนนี้" : "เปิดแจ้งเตือนตอนใหม่ของคนนี้"}
          aria-label="แจ้งเตือนตอนใหม่"
          className={`flex size-10 items-center justify-center rounded-md border ${
            notify
              ? "border-primary-200 bg-primary-50 text-primary"
              : "border-border text-text-muted hover:text-text"
          }`}
        >
          <Icon name="bell" size={16} />
        </button>
      ) : null}

      <span className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((current) => !current)}
          aria-label="เมนูเพิ่มเติม"
          aria-expanded={menuOpen}
          className="flex size-10 items-center justify-center rounded-md border border-border text-text-secondary hover:text-text"
        >
          <Icon name="more-horizontal" size={17} />
        </button>
        {menuOpen ? (
          <span className="absolute top-full z-30 mt-1 flex w-44 flex-col rounded-md border border-border bg-surface p-1 text-[13px] shadow-lg inset-e-0">
            <button
              type="button"
              onClick={copyLink}
              className="flex items-center gap-2 rounded px-2.5 py-1.5 text-start hover:bg-surface-secondary"
            >
              <Icon name="link" size={13} />
              {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์โปรไฟล์"}
            </button>
            <span className="rounded px-0.5 hover:bg-surface-secondary">
              <ReportButton targetType="user" targetId={authorId} compact />
            </span>
          </span>
        ) : null}
      </span>
    </div>
  );
}

/**
 * The "seen as others see it" banner (section F): the owner arrived from
 * their own page with ?preview=1, and this strip says so - with the way back.
 */
export function PreviewBanner() {
  return (
    <div className="border-b border-primary-200 bg-primary-50">
      <p className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[13px] text-primary">
        <Icon name="eye" size={14} />
        กำลังดูโปรไฟล์แบบที่คนอื่นเห็น - ปุ่มแก้ไขทั้งหมดถูกซ่อน
        <a href="/profile" className="ms-auto font-medium underline underline-offset-2">
          กลับโปรไฟล์ของฉัน
        </a>
      </p>
    </div>
  );
}
