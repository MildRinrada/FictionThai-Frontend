"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { ApiError } from "@/lib/api";
import { updateNovel } from "@/lib/novels-client";
import { type NovelStatus, Visibility } from "@/types/novel";

/**
 * เผยแพร่เรื่อง - one button that does the obvious thing.
 *
 * It used to carry a five-rung "ใครเห็นได้" picker, while the badge beside the
 * title carried the same setting with a different value - two controls for one
 * fact, disagreeing on screen. Worse, it forced a decision at the worst moment:
 * someone who has finished a story and wants to publish it is not asking to be
 * taught the difference between เฉพาะสมาชิก and ลิงก์ลับ.
 *
 * So: publishing publishes, to everyone, and says so in one line. The writer
 * who wants a private read-through gets a button named after what they want -
 * ส่งลิงก์ให้เพื่อนอ่านก่อน - which makes the link and copies it in one press.
 * Nobody has to learn the word "unlisted". The full ladder still exists on the
 * badge beside the title and in the fiction's settings, for the writers who go
 * looking.
 *
 * Both actions are easy to undo (the badge changes it back), which is why
 * neither asks for confirmation.
 */

export function PublishNovelButton({
  novelRef,
  slug,
  status,
  ready,
  remaining,
}: {
  novelRef: string;
  /** The public slug, for the link the friends-first button copies. */
  slug: string;
  status: NovelStatus;
  ready: boolean;
  /** How many REQUIRED items are still not done. */
  remaining: number;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<null | "public" | "unlisted">(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [when, setWhen] = useState("");

  async function publish(visibility: Visibility, publishAt?: string) {
    setSaving(visibility === Visibility.Public ? "public" : "unlisted");
    setError(null);
    try {
      await updateNovel(novelRef, {
        visibility,
        ...(status === "draft" ? { status: "ongoing" as NovelStatus } : {}),
        ...(publishAt ? { publish_at: new Date(publishAt).toISOString() } : {}),
      });
      if (visibility === Visibility.Unlisted) {
        // The whole point of the button: the writer wanted a link to send.
        try {
          await navigator.clipboard.writeText(
            `${window.location.origin}/novel/${encodeURIComponent(slug)}`,
          );
          setCopied(true);
        } catch {
          // Clipboard permission is not something to fail a publish over; the
          // link is on the page after the refresh either way.
        }
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "เผยแพร่ไม่สำเร็จ");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="mt-4 border-t border-hairline pt-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          disabled={!ready || saving !== null}
          onClick={() => void publish(Visibility.Public)}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-primary px-5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon name="globe" size={15} />
          {saving === "public" ? "กำลังเผยแพร่…" : "เผยแพร่เรื่อง"}
        </button>

        <button
          type="button"
          disabled={!ready || saving !== null}
          onClick={() => void publish(Visibility.Unlisted)}
          // The explanation of THIS button rides on the button rather than
          // padding the helper line below to full width - whoever hovers the
          // control is the person asking.
          title="ได้ลิงก์ที่ค้นไม่เจอ ส่งให้เฉพาะคนที่คุณให้ลิงก์"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-4 text-sm text-text-secondary hover:border-primary-200 hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon name="link" size={15} />
          {saving === "unlisted" ? "กำลังสร้างลิงก์…" : "ส่งลิงก์ให้เพื่อนอ่านก่อน"}
        </button>

        {!ready ? (
          <p className="text-xs text-text-muted">อีก {remaining} ข้อจะเผยแพร่ได้</p>
        ) : null}
      </div>

      <p className="mt-2 text-xs text-text-secondary">
        เผยแพร่แล้วจะอยู่ในหน้ารวมและค้นเจอ ใครก็อ่านได้
      </p>

      {copied ? (
        <p role="status" className="mt-1.5 flex items-center gap-1.5 text-xs text-success">
          <Icon name="check" size={14} />
          คัดลอกลิงก์แล้ว - วางส่งให้เพื่อนได้เลย
        </p>
      ) : null}

      {/* Scheduling is the rarer intent, so it is a line of text rather than a
          second full-size button competing with the one people came for. */}
      {ready ? (
        <button
          type="button"
          onClick={() => setScheduling((value) => !value)}
          aria-expanded={scheduling}
          className="mt-2 text-xs text-primary hover:underline"
        >
          หรือตั้งเวลาให้ขึ้นเอง
        </button>
      ) : null}

      {scheduling && ready ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-3">
          <label htmlFor="novel-publish-at" className="text-sm text-text-secondary">
            จะให้ขึ้นเมื่อ
          </label>
          <input
            id="novel-publish-at"
            type="datetime-local"
            value={when}
            onChange={(event) => setWhen(event.target.value)}
            disabled={saving !== null}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            disabled={!when || saving !== null}
            onClick={() => void publish(Visibility.Public, when)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            <Icon name="check" size={14} />
            ยืนยันตั้งเวลา
          </button>
          <p className="w-full text-xs text-text-muted">
            เช็กลิสต์ถูกตรวจตอนนี้เลย - ถึงเวลาแล้วเรื่องขึ้นเองโดยไม่ต้องเปิดเว็บ
          </p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-xs text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
