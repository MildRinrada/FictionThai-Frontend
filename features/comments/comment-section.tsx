"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ReportButton } from "@/features/moderation/report-button";
import { ApiError } from "@/lib/api";
import { count, relativeTime } from "@/lib/format";
import {
  createChapterComment,
  createNovelComment,
  deleteComment,
  getChapterComments,
  getNovelComments,
  getReplies,
  likeComment,
  replyToComment,
  unlikeComment,
  updateComment,
} from "@/lib/comments-client";
import {
  COMMENT_MAX_LENGTH,
  GUEST_NAME_MAX_LENGTH,
  commentAuthorName,
  isGuestComment,
  type Comment,
} from "@/types/comments";
import { CommentAccess } from "@/types/novel";

/**
 * The discussion thread on a fiction or chapter page (docs/09 §20,
 * docs/03 §10/§11).
 *
 * The page stays a cacheable Server Component; this island loads the thread
 * after mount. Guests READ the discussion freely, and since §13D they may WRITE
 * too when the author chose "ทุกคน" - which is the level this platform exists
 * for. On the narrower level a guest who tries is offered sign-in in place, so
 * their intent survives (docs/02 §5.2).
 *
 * Comment text is rendered as text nodes only, never as markup - React's
 * escaping is the XSS boundary docs/11 §16 requires.
 */

export interface CommentSectionProps {
  novelRef: string;
  /** Present on the reader page: scope the thread to one chapter. */
  chapterRef?: string;
  /**
   * The fiction's own comment level (§13D). The API is authoritative and
   * refuses anything this gets wrong; the value is here so the form can ask a
   * guest for a name BEFORE they type a comment and lose it to a 401.
   */
  access?: CommentAccess;
  /** Whether comments wait for the author. Shown before posting, not after. */
  approval?: boolean;
}

export function CommentSection({
  novelRef,
  chapterRef,
  access = CommentAccess.Members,
  approval = false,
}: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const fetchPage = useCallback(
    (pageNo: number) =>
      chapterRef
        ? getChapterComments(novelRef, chapterRef, { page: pageNo })
        : getNovelComments(novelRef, { page: pageNo }),
    [novelRef, chapterRef],
  );

  // No synchronous setLoading(true) here: the state starts as loading, and on
  // the rare prop change the previous thread stays visible until the new one
  // arrives - better than a flash of spinner.
  useEffect(() => {
    let cancelled = false;
    fetchPage(1)
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
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    const next = page + 1;
    const result = await fetchPage(next);
    setComments((current) => {
      const seen = new Set(current.map((c) => c.id));
      return [...current, ...result.items.filter((c) => !seen.has(c.id))];
    });
    setTotal(result.meta.total);
    setPage(next);
  }, [fetchPage, page]);

  const handleCreated = useCallback((comment: Comment) => {
    setComments((current) => [comment, ...current]);
    setTotal((current) => current + 1);
  }, []);

  const handleRemoved = useCallback((id: string) => {
    setComments((current) => current.filter((c) => c.id !== id));
    setTotal((current) => Math.max(0, current - 1));
  }, []);

  const handleUpdated = useCallback((updated: Comment) => {
    setComments((current) => current.map((c) => (c.id === updated.id ? updated : c)));
  }, []);

  return (
    <section aria-labelledby="comments-heading" className="mt-12 border-t border-hairline pt-8">
      {/* The header per the comment design review (2026-08): the thread's
          name in the reading voice, the count riding it quietly, and the way
          to the rest held to the far end. */}
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="comments-heading" className="font-serif text-xl font-semibold tracking-tight">
          {chapterRef ? "คุยกันในตอนนี้" : "คุยกันในเรื่องนี้"}
          {total > 0 ? (
            <span className="ms-2 text-sm font-normal text-text-secondary">
              {count(total)} ความคิดเห็น
            </span>
          ) : null}
        </h2>
        {comments.length < total ? (
          <button
            type="button"
            onClick={() => void loadMore()}
            className="text-sm text-primary hover:underline"
          >
            ดูทั้งหมด →
          </button>
        ) : null}
      </div>

      {access === CommentAccess.Off ? (
        <p className="rounded-md border border-border bg-surface-secondary px-3 py-2 text-sm text-text-secondary">
          ผู้เขียนปิดการคอมเมนต์ของเรื่องนี้ไว้
        </p>
      ) : (
        <div className="flex items-start gap-3">
          <Avatar name="" />
          <div className="min-w-0 flex-1">
            <CommentForm
              placeholder={chapterRef ? "เขียนถึงตอนนี้…" : "เขียนถึงเรื่องนี้…"}
              submitLabel="ส่งความคิดเห็น"
              access={access}
              approval={approval}
              onSubmit={(content, guestName) =>
                chapterRef
                  ? createChapterComment(novelRef, chapterRef, content, guestName)
                  : createNovelComment(novelRef, content, guestName)
              }
              onCreated={handleCreated}
            />
          </div>
        </div>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-text-secondary">กำลังโหลดความคิดเห็น…</p>
      ) : failed ? (
        <p className="mt-6 text-sm text-text-secondary">
          ไม่สามารถโหลดความคิดเห็นได้ในขณะนี้
        </p>
      ) : comments.length === 0 ? (
        <p className="mt-6 text-sm text-text-secondary">
          ยังไม่มีความคิดเห็น เป็นคนแรกที่ร่วมพูดคุยได้เลย
        </p>
      ) : (
        <>
          <ol className="mt-7 space-y-6">
            {comments.map((comment) => (
              <li key={comment.id}>
                <CommentItem
                  comment={comment}
                  onRemoved={handleRemoved}
                  onUpdated={handleUpdated}
                  access={access}
                  approval={approval}
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

/**
 * The round face beside a comment (comment design review 2026-08): the
 * account's picture, or the name's first letter in a soft circle. The
 * composer's own is an empty circle - this island deliberately knows nothing
 * about the session.
 */
function Avatar({
  name,
  imageURL = null,
  small = false,
}: {
  name: string;
  imageURL?: string | null;
  small?: boolean;
}) {
  const size = small ? "size-7" : "size-9";
  if (imageURL) {
    return (
      /* Our own media route; next/image would add a proxy hop for a tiny
         decoration. */
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imageURL} alt="" className={`${size} shrink-0 rounded-full object-cover`} />
    );
  }
  return (
    <span
      aria-hidden
      className={`flex ${size} shrink-0 items-center justify-center rounded-full border border-border bg-surface-secondary text-xs text-text-muted`}
    >
      {name.trim().slice(0, 1)}
    </span>
  );
}

/** The heart under a comment - optimistic, idempotent, sign-in on 401. */
function CommentLike({ comment }: { comment: Comment }) {
  const router = useRouter();
  const [liked, setLiked] = useState(comment.is_liked ?? false);
  const [total, setTotal] = useState(comment.like_count ?? 0);
  const [busy, setBusy] = useState(false);

  const toggle = useCallback(async () => {
    const next = !liked;
    setLiked(next);
    setTotal((current) => Math.max(0, current + (next ? 1 : -1)));
    setBusy(true);
    try {
      if (next) await likeComment(comment.id);
      else await unlikeComment(comment.id);
    } catch (error) {
      setLiked(!next);
      setTotal((current) => Math.max(0, current + (next ? -1 : 1)));
      if (error instanceof ApiError && error.isUnauthorized) {
        router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      }
    } finally {
      setBusy(false);
    }
  }, [comment.id, liked, router]);

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      aria-pressed={liked}
      aria-label={liked ? "เลิกถูกใจความคิดเห็นนี้" : "ถูกใจความคิดเห็นนี้"}
      className={`inline-flex items-center gap-1 disabled:opacity-60 ${
        liked ? "text-secondary-600" : "text-text-secondary hover:text-secondary-600"
      }`}
    >
      <Icon name="heart" size={13} />
      {total > 0 ? <span className="tabular-nums">{count(total)}</span> : null}
    </button>
  );
}

/**
 * A single comment with its actions and its own thread. Threads nest three
 * levels (comment design review 2026-08): the first two levels host replies;
 * the third is the floor, where the API attaches further replies beside what
 * they answer.
 */
const MAX_REPLY_DEPTH = 2;

function CommentItem({
  comment,
  onRemoved,
  onUpdated,
  depth = 0,
  access = CommentAccess.Members,
  approval = false,
}: {
  comment: Comment;
  onRemoved: (id: string) => void;
  onUpdated: (comment: Comment) => void;
  /** 0 = top level. Levels 0-1 host replies; level 2 is the floor. */
  depth?: number;
  access?: CommentAccess;
  approval?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const [replies, setReplies] = useState<Comment[] | null>(null);
  const [replyCount, setReplyCount] = useState(comment.reply_count);
  const [busy, setBusy] = useState(false);

  const authorName = commentAuthorName(comment);

  const toggleReplies = useCallback(async () => {
    if (showReplies) {
      setShowReplies(false);
      return;
    }
    setShowReplies(true);
    if (replies === null) {
      try {
        const result = await getReplies(comment.id);
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
      await deleteComment(comment.id);
      onRemoved(comment.id);
    } finally {
      setBusy(false);
    }
  }, [comment.id, onRemoved]);

  const handleReplyCreated = useCallback((reply: Comment) => {
    setReplies((current) => [...(current ?? []), reply]);
    setReplyCount((current) => current + 1);
    setShowReplies(true);
  }, []);

  return (
    // Borderless per the comment design review (2026-08): the thread reads as
    // a conversation, not a stack of cards - the avatar column carries the
    // structure.
    <article className="flex items-start gap-3">
      <Avatar
        name={authorName}
        imageURL={comment.author?.avatar_url ?? null}
        small={depth > 0}
      />

      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
          <span className="font-medium">{authorName}</span>
          {/* A typed-in name must never read as an account. There is no profile
              behind it and nothing to link to (§13D). */}
          {isGuestComment(comment) ? (
            <span className="rounded-full bg-surface-secondary px-1.5 py-0.5 text-[11px] text-text-muted">
              ผู้อ่านทั่วไป
            </span>
          ) : null}
          <time dateTime={comment.created_at} className="text-xs text-text-muted">
            {relativeTime(comment.created_at)}
          </time>
          {comment.edited ? (
            <span className="text-xs text-text-muted">(แก้ไขแล้ว)</span>
          ) : null}
          {comment.pending ? (
            <span className="text-xs text-warning">รอผู้เขียนตรวจ</span>
          ) : null}
        </header>

        {editing ? (
          <CommentForm
            initialValue={comment.content}
            submitLabel="บันทึกการแก้ไข"
            onSubmit={(content) => updateComment(comment.id, content)}
            onCreated={(updated) => {
              onUpdated(updated);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">
            {comment.content}
          </p>
        )}

        <footer className="mt-1.5 flex flex-wrap items-center gap-4 text-xs">
          <CommentLike comment={comment} />
          {depth < MAX_REPLY_DEPTH ? (
            <ReplyControls
              parent={comment}
              replyCount={replyCount}
              showReplies={showReplies}
              onToggleReplies={toggleReplies}
              onReplyCreated={handleReplyCreated}
              access={access}
              approval={approval}
            />
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
                onClick={remove}
                disabled={busy}
                className="text-text-secondary hover:text-error"
              >
                ลบ
              </button>
            </>
          ) : null}
          {!comment.is_owner ? (
            // docs/06 §14 lists Report among comment actions; own comments are
            // deleted, not reported.
            <ReportButton targetType="comment" targetId={comment.id} compact />
          ) : null}
        </footer>

        {depth < MAX_REPLY_DEPTH && showReplies && replies !== null ? (
          <ol className="mt-4 space-y-4 border-s-2 border-hairline ps-4">
            {replies.map((reply) => (
              <li key={reply.id}>
                <CommentItem
                  comment={reply}
                  depth={depth + 1}
                  access={access}
                  approval={approval}
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
      </div>
    </article>
  );
}

/** Reply affordances under a top-level comment. */
function ReplyControls({
  parent,
  replyCount,
  showReplies,
  onToggleReplies,
  onReplyCreated,
  access,
  approval,
}: {
  parent: Comment;
  replyCount: number;
  showReplies: boolean;
  onToggleReplies: () => void;
  onReplyCreated: (reply: Comment) => void;
  access: CommentAccess;
  approval: boolean;
}) {
  const [replying, setReplying] = useState(false);

  return (
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
          onClick={onToggleReplies}
          className="text-text-secondary hover:text-primary"
        >
          {showReplies ? "ซ่อนการตอบกลับ" : `ดูการตอบกลับ (${replyCount})`}
        </button>
      ) : null}
      {replying ? (
        <div className="w-full">
          <CommentForm
            placeholder={`ตอบกลับ ${commentAuthorName(parent)}…`}
            submitLabel="ส่งการตอบกลับ"
            access={access}
            approval={approval}
            onSubmit={(content, guestName) =>
              replyToComment(parent.id, content, guestName)
            }
            onCreated={(reply) => {
              onReplyCreated(reply);
              setReplying(false);
            }}
            onCancel={() => setReplying(false)}
          />
        </div>
      ) : null}
    </>
  );
}

/**
 * The shared write form: create, reply, and edit all run through it, so the
 * guest redirect, the length counter, and API error rendering exist once.
 */
function CommentForm({
  initialValue = "",
  placeholder,
  submitLabel,
  onSubmit,
  onCreated,
  onCancel,
  access = CommentAccess.Members,
  approval = false,
}: {
  initialValue?: string;
  placeholder?: string;
  submitLabel: string;
  onSubmit: (content: string, guestName?: string) => Promise<Comment>;
  onCreated: (comment: Comment) => void;
  onCancel?: () => void;
  access?: CommentAccess;
  approval?: boolean;
}) {
  const [content, setContent] = useState(initialValue);
  const [guestName, setGuestName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [held, setHeld] = useState(false);

  // On the "ทุกคน" level the name field is offered to EVERYONE, and ignored by
  // the API for a signed-in caller. Deciding whether to show it from the
  // session would mean this island had to know about the session, and getting
  // that wrong means a guest types a comment and loses it to a 401.
  const guestsWelcome = access === CommentAccess.Everyone;

  const submit = useCallback(async () => {
    const trimmed = content.trim();
    if (trimmed === "" || busy) return;

    setBusy(true);
    setError(null);
    setNameError(null);
    try {
      const comment = await onSubmit(trimmed, guestName.trim() || undefined);
      setContent("");
      setGuestName("");
      // A held comment is NOT added to the thread: it is not there yet, and
      // showing it as though it were would be a lie the next page load undoes.
      if (comment.pending) {
        setHeld(true);
      } else {
        onCreated(comment);
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.isUnauthorized) {
        // Signing in is the fix, not an error - offer it in place.
        setNeedsSignIn(true);
      } else if (cause instanceof ApiError) {
        setNameError(cause.fields?.guest_name?.[0] ?? null);
        setError(
          cause.fields?.guest_name?.[0] ? null : (cause.fields?.content?.[0] ?? cause.message),
        );
      } else {
        setError("ไม่สามารถส่งความคิดเห็นได้ กรุณาลองใหม่");
      }
    } finally {
      setBusy(false);
    }
  }, [busy, content, guestName, onCreated, onSubmit]);

  if (held) {
    return (
      <p className="mt-2 rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm">
        ส่งแล้ว - รอผู้เขียนตรวจก่อนถึงจะขึ้นให้คนอื่นเห็น
        <button
          type="button"
          onClick={() => setHeld(false)}
          className="ms-2 text-primary hover:underline"
        >
          เขียนอีกอัน
        </button>
      </p>
    );
  }

  if (needsSignIn) {
    return (
      <p className="mt-2 rounded-md border border-border bg-surface-secondary px-3 py-2 text-sm">
        <Link
          href={`/login?next=${typeof window !== "undefined" ? encodeURIComponent(window.location.pathname) : "/"}`}
          className="font-medium text-primary hover:underline"
        >
          เข้าสู่ระบบ
        </Link>{" "}
        เพื่อร่วมแสดงความคิดเห็น
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
      {guestsWelcome ? (
        <div className="mb-2">
          <input
            type="text"
            value={guestName}
            onChange={(event) => setGuestName(event.target.value)}
            placeholder="ชื่อที่อยากให้แสดง (ถ้ายังไม่ได้ล็อกอิน)"
            maxLength={GUEST_NAME_MAX_LENGTH}
            aria-label="ชื่อที่อยากให้แสดง"
            className="w-full max-w-xs rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          {nameError ? <p className="mt-1 text-xs text-error">{nameError}</p> : null}
          <p className="mt-1 text-xs text-text-muted">
            คอมเมนต์แบบไม่ล็อกอินจะรอผู้เขียนตรวจก่อนเสมอ และแก้หรือลบเองภายหลังไม่ได้
          </p>
        </div>
      ) : null}

      {/* One rounded row that grows as it fills (comment design review
          2026-08) - the input reads like the reply line of a chat app, and
          the send button appears once there is something to send. */}
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder={placeholder}
        maxLength={COMMENT_MAX_LENGTH}
        rows={1}
        aria-label={placeholder ?? submitLabel}
        className="w-full rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm field-sizing-content focus:border-primary focus:outline-none"
      />
      {error ? <p className="mt-1 text-xs text-error">{error}</p> : null}
      {approval && !guestsWelcome ? (
        <p className="mt-1 text-xs text-text-muted">
          ผู้เขียนเปิด &ldquo;ตรวจก่อนโพสต์&rdquo; ไว้ - คอมเมนต์จะขึ้นหลังผู้เขียนอนุมัติ
        </p>
      ) : null}
      {content.trim() !== "" || onCancel ? (
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
          {content.length > COMMENT_MAX_LENGTH * 0.9 ? (
            <span className="text-xs text-text-muted">
              {content.length}/{COMMENT_MAX_LENGTH}
            </span>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
