"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ReportButton } from "@/features/moderation/report-button";
import { ApiError } from "@/lib/api";
import {
  createCommunityComment,
  deleteCommunityComment,
  getCommunityComments,
  getCommunityReplies,
  replyToCommunityComment,
  updateCommunityComment,
} from "@/lib/community-client";
import {
  COMMUNITY_COMMENT_MAX_LENGTH,
  type CommunityComment,
} from "@/types/community";

/**
 * The comment thread on a community post (docs/01 §20.1).
 *
 * Deliberately its OWN island, not a reuse of the fiction thread: community
 * comments are a separate domain with separate endpoints and shapes
 * (docs/09 §21 "Community is a separate domain"), and coupling the two UIs
 * would quietly couple the contracts. The interaction patterns match - guests
 * read, a 401 becomes a sign-in offer in place (docs/02 §5.2), text renders
 * as text nodes (docs/11 §16).
 */

export interface CommunityCommentsProps {
  postId: string;
}

export function CommunityComments({ postId }: CommunityCommentsProps) {
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCommunityComments(postId, { page: 1 })
      .then((result) => {
        if (cancelled) return;
        setComments(result.items);
        setTotal(result.meta.total);
        setPage(1);
        setFailed(false);
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
  }, [postId]);

  const loadMore = useCallback(async () => {
    const next = page + 1;
    const result = await getCommunityComments(postId, { page: next });
    setComments((current) => {
      const seen = new Set(current.map((c) => c.id));
      return [...current, ...result.items.filter((c) => !seen.has(c.id))];
    });
    setTotal(result.meta.total);
    setPage(next);
  }, [page, postId]);

  return (
    <section aria-labelledby="community-comments-heading" className="mt-10">
      <h2 id="community-comments-heading" className="mb-4 text-lg font-semibold">
        ความคิดเห็น{total > 0 ? ` (${total})` : ""}
      </h2>

      <CommentForm
        placeholder="ร่วมพูดคุยในโพสต์นี้…"
        submitLabel="ส่งความคิดเห็น"
        onSubmit={(content) => createCommunityComment(postId, content)}
        onCreated={(comment) => {
          setComments((current) => [comment, ...current]);
          setTotal((current) => current + 1);
        }}
      />

      {loading ? (
        <p className="mt-6 text-sm text-text-secondary">กำลังโหลดความคิดเห็น…</p>
      ) : failed ? (
        <p className="mt-6 text-sm text-text-secondary">
          ไม่สามารถโหลดความคิดเห็นได้ในขณะนี้
        </p>
      ) : comments.length === 0 ? (
        <p className="mt-6 text-sm text-text-secondary">
          ยังไม่มีความคิดเห็น เริ่มบทสนทนาได้เลย
        </p>
      ) : (
        <>
          <ol className="mt-6 space-y-4">
            {comments.map((comment) => (
              <li key={comment.id}>
                <CommentItem
                  comment={comment}
                  onRemoved={(id) => {
                    setComments((current) => current.filter((c) => c.id !== id));
                    setTotal((current) => Math.max(0, current - 1));
                  }}
                  onUpdated={(updated) => {
                    setComments((current) =>
                      current.map((c) => (c.id === updated.id ? updated : c)),
                    );
                  }}
                />
              </li>
            ))}
          </ol>
          {comments.length < total ? (
            <div className="mt-6">
              <Button variant="secondary" onClick={loadMore}>
                ดูความคิดเห็นเพิ่มเติม
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function CommentItem({
  comment,
  onRemoved,
  onUpdated,
  isReply = false,
}: {
  comment: CommunityComment;
  onRemoved: (id: string) => void;
  onUpdated: (comment: CommunityComment) => void;
  isReply?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const [replies, setReplies] = useState<CommunityComment[] | null>(null);
  const [replyCount, setReplyCount] = useState(comment.reply_count);
  const [busy, setBusy] = useState(false);

  const toggleReplies = useCallback(async () => {
    if (showReplies) {
      setShowReplies(false);
      return;
    }
    setShowReplies(true);
    if (replies === null) {
      try {
        const result = await getCommunityReplies(comment.id);
        setReplies(result.items);
        setReplyCount(result.meta.total);
      } catch {
        setReplies([]);
      }
    }
  }, [comment.id, replies, showReplies]);

  const remove = useCallback(async () => {
    setBusy(true);
    try {
      await deleteCommunityComment(comment.id);
      onRemoved(comment.id);
    } finally {
      setBusy(false);
    }
  }, [comment.id, onRemoved]);

  return (
    <article className="rounded-md border border-border bg-surface p-4">
      <header className="flex flex-wrap items-baseline gap-2 text-sm">
        <span className="font-medium">
          {comment.author.display_name ?? comment.author.username}
        </span>
        <time dateTime={comment.created_at} className="text-xs text-text-secondary">
          {formatDate(comment.created_at)}
        </time>
        {comment.edited ? (
          <span className="text-xs text-text-muted">(แก้ไขแล้ว)</span>
        ) : null}
      </header>

      {editing ? (
        <CommentForm
          initialValue={comment.content}
          submitLabel="บันทึกการแก้ไข"
          onSubmit={(content) => updateCommunityComment(comment.id, content)}
          onCreated={(updated) => {
            onUpdated(updated);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm">{comment.content}</p>
      )}

      <footer className="mt-3 flex flex-wrap items-center gap-4 text-xs">
        {!isReply ? (
          <>
            <button
              type="button"
              onClick={() => setReplying((current) => !current)}
              className="text-text-secondary hover:text-primary"
            >
              ตอบกลับ
            </button>
            {replyCount > 0 ? (
              <button
                type="button"
                onClick={() => void toggleReplies()}
                className="text-text-secondary hover:text-primary"
              >
                {showReplies ? "ซ่อนการตอบกลับ" : `ดูการตอบกลับ (${replyCount})`}
              </button>
            ) : null}
          </>
        ) : null}
        {comment.is_owner && !editing ? (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-text-secondary hover:text-primary"
            >
              แก้ไข
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="text-text-secondary hover:text-error"
            >
              ลบ
            </button>
          </>
        ) : null}
        {!comment.is_owner ? (
          // docs/11 §38 lists community comments as reportable; own comments
          // are deleted, not reported.
          <ReportButton targetType="community_comment" targetId={comment.id} compact />
        ) : null}
      </footer>

      {!isReply && replying ? (
        <div className="mt-3">
          <CommentForm
            placeholder={`ตอบกลับ ${comment.author.display_name ?? comment.author.username}…`}
            submitLabel="ส่งการตอบกลับ"
            onSubmit={(content) => replyToCommunityComment(comment.id, content)}
            onCreated={(reply) => {
              setReplies((current) => [...(current ?? []), reply]);
              setReplyCount((current) => current + 1);
              setShowReplies(true);
              setReplying(false);
            }}
            onCancel={() => setReplying(false)}
          />
        </div>
      ) : null}

      {!isReply && showReplies && replies !== null ? (
        <ol className="mt-4 space-y-3 border-l-2 border-border pl-4">
          {replies.map((reply) => (
            <li key={reply.id}>
              <CommentItem
                comment={reply}
                isReply
                onRemoved={(id) => {
                  setReplies((current) => (current ?? []).filter((r) => r.id !== id));
                  setReplyCount((current) => Math.max(0, current - 1));
                }}
                onUpdated={(updated) => {
                  setReplies((current) =>
                    (current ?? []).map((r) => (r.id === updated.id ? updated : r)),
                  );
                }}
              />
            </li>
          ))}
        </ol>
      ) : null}
    </article>
  );
}

/** The shared write form: create, reply, and edit all run through it. */
function CommentForm({
  initialValue = "",
  placeholder,
  submitLabel,
  onSubmit,
  onCreated,
  onCancel,
}: {
  initialValue?: string;
  placeholder?: string;
  submitLabel: string;
  onSubmit: (content: string) => Promise<CommunityComment>;
  onCreated: (comment: CommunityComment) => void;
  onCancel?: () => void;
}) {
  const [content, setContent] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);

  const submit = useCallback(async () => {
    const trimmed = content.trim();
    if (trimmed === "" || busy) return;

    setBusy(true);
    setError(null);
    try {
      const comment = await onSubmit(trimmed);
      setContent("");
      onCreated(comment);
    } catch (cause) {
      if (cause instanceof ApiError && cause.isUnauthorized) {
        setNeedsSignIn(true);
      } else if (cause instanceof ApiError) {
        setError(cause.fields?.content?.[0] ?? cause.message);
      } else {
        setError("ไม่สามารถส่งความคิดเห็นได้ กรุณาลองใหม่");
      }
    } finally {
      setBusy(false);
    }
  }, [busy, content, onCreated, onSubmit]);

  if (needsSignIn) {
    return (
      <p className="mt-2 rounded-md border border-border bg-surface-secondary px-3 py-2 text-sm">
        <Link
          href={`/login?next=${typeof window !== "undefined" ? encodeURIComponent(window.location.pathname) : "/community"}`}
          className="font-medium text-primary hover:underline"
        >
          เข้าสู่ระบบ
        </Link>{" "}
        เพื่อร่วมพูดคุย
      </p>
    );
  }

  return (
    <form
      className="mt-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder={placeholder}
        maxLength={COMMUNITY_COMMENT_MAX_LENGTH}
        rows={3}
        aria-label={placeholder ?? submitLabel}
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
      />
      {error ? <p className="mt-1 text-xs text-error">{error}</p> : null}
      <div className="mt-2 flex items-center gap-3">
        <Button type="submit" loading={busy} disabled={content.trim() === ""}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-text-secondary hover:text-primary"
          >
            ยกเลิก
          </button>
        ) : null}
      </div>
    </form>
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
