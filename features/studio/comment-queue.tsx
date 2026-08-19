"use client";

import { useCallback, useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { ApiError } from "@/lib/api";
import {
  approveComment,
  getPendingComments,
  rejectComment,
} from "@/lib/comments-client";
import { commentAuthorName, isGuestComment, type Comment } from "@/types/comments";

/**
 * ตรวจก่อนโพสต์ - the author's review queue
 * (docs/PHASE-13-CREATION-AND-CONTROL.md §13D).
 *
 * This is the half that makes the three comment levels survivable. "ทุกคน" is
 * the level this platform exists for - a reader with no account says something
 * - but a writer handed that door and no way to see what walks through it will
 * close it after the first bad day, and the level might as well not exist.
 *
 * It renders NOTHING when the queue is empty. A permanent empty panel in the
 * studio would be one more thing to scroll past every day; the queue appears
 * when there is something in it and disappears when there is not.
 *
 * A client island because every row is a decision. The list is re-read from the
 * server after each one rather than patched locally - the API owns whether a
 * comment has been decided, and racing two tabs must not leave this one showing
 * a comment that is already published.
 */

export function CommentQueue({ novelRef }: { novelRef: string }) {
  const [items, setItems] = useState<Comment[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [busyID, setBusyID] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Bumped after each decision to re-read the queue. The list is never patched
  // locally: the API owns whether a comment has been decided, and two open tabs
  // must not leave this one offering to approve something already published.
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getPendingComments(novelRef)
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.meta.total);
      })
      .catch(() => {
        // A queue that cannot load is not worth an error banner in the studio:
        // the fiction's own page is what the writer came for. It stays hidden,
        // and the next visit tries again.
        if (cancelled) return;
        setItems([]);
        setTotal(0);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [novelRef, reloads]);

  const decide = useCallback(async (id: string, approve: boolean) => {
    setBusyID(id);
    setError(null);
    try {
      await (approve ? approveComment(id) : rejectComment(id));
      setReloads((current) => current + 1);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusyID(null);
    }
  }, []);

  if (!loaded || items.length === 0) return null;

  return (
    <section
      aria-labelledby="comment-queue-heading"
      className="rounded-lg border border-warning/30 bg-warning/8 p-4"
    >
      <p id="comment-queue-heading" className="mono-label flex items-center gap-1.5">
        <Icon name="message" size={14} />
        รอคุณตรวจ · {total}
      </p>

      <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
        คอมเมนต์เหล่านี้ยังไม่มีใครเห็นนอกจากคุณ - กดอนุมัติเพื่อให้ขึ้นในเรื่อง
        หรือปฏิเสธเพื่อไม่ให้ขึ้น
      </p>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-error">
          {error}
        </p>
      ) : null}

      <ul className="mt-3 flex flex-col gap-2.5">
        {items.map((comment) => {
          const busy = busyID === comment.id;
          return (
            <li
              key={comment.id}
              className="rounded-md border border-border bg-surface p-3"
            >
              <p className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="font-medium">{commentAuthorName(comment)}</span>
                {/* A typed-in name is not an identity, and the queue is exactly
                    where a writer needs to know which one they are looking at. */}
                {isGuestComment(comment) ? (
                  <span className="rounded-full bg-surface-secondary px-1.5 py-0.5 text-[11px] text-text-muted">
                    ผู้อ่านทั่วไป
                  </span>
                ) : null}
                {comment.chapter_id ? (
                  <span className="text-xs text-text-muted">ในตอน</span>
                ) : null}
                {comment.parent_id ? (
                  <span className="text-xs text-text-muted">ตอบกลับ</span>
                ) : null}
              </p>

              <p className="mt-1.5 whitespace-pre-wrap text-sm">{comment.content}</p>

              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => decide(comment.id, true)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  <Icon name="check" size={14} />
                  อนุมัติ
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => decide(comment.id, false)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs text-text-secondary hover:border-error hover:text-error disabled:opacity-50"
                >
                  <Icon name="close" size={14} />
                  ไม่อนุมัติ
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {items.length < total ? (
        <p className="mt-3 text-xs text-text-muted">
          แสดง {items.length} จาก {total} - ตรวจชุดนี้เสร็จแล้วชุดถัดไปจะขึ้นมาเอง
        </p>
      ) : null}
    </section>
  );
}
