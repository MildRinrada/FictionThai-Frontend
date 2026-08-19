"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { deleteWallEntry, getWall, postToWall, WALL_DISABLED } from "@/lib/wall-client";
import { WALL_BODY_MAX, wallAuthorName, type WallEntry } from "@/types/shelf";

/**
 * The profile comment wall.
 *
 * An island, not part of the page: the profile itself is the same for every
 * visitor and is cached, while `can_delete` on each message depends on who is
 * asking. So the wall loads after mount and the page stays cacheable
 * (the FollowButton pattern).
 *
 * Three states a visitor can be in, and none of them is a broken form:
 *
 *	closed     the owner switched the wall off. The section renders NOTHING -
 *	           an absent wall is not an error, and saying "this is disabled"
 *	           would announce a decision that is nobody else's business.
 *	guest      the messages are readable, and where the composer would be there
 *	           is an invitation to sign in that keeps the visitor's place.
 *	signed in  the composer.
 *
 * Message text is rendered as text nodes only, never as markup - React's
 * escaping is the XSS boundary docs/11 §16 requires.
 */

export interface CommentWallProps {
  /** Username or id of the person whose page this is. */
  userRef: string;
  /** Their name, for the empty state's wording. */
  ownerName: string;
  /**
   * The owner's switch, from the public profile. Passing `false` skips the
   * request entirely; the API refuses a closed wall regardless, so this is a
   * saved round trip rather than the enforcement.
   */
  enabled?: boolean;
}

export function CommentWall({ userRef, ownerName, enabled = true }: CommentWallProps) {
  const [entries, setEntries] = useState<WallEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(enabled);
  const [closed, setClosed] = useState(!enabled);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // `closed` already starts as !enabled, so a closed wall needs no state
    // change here - and setting it synchronously in the effect body is the
    // cascading-render pattern the React Compiler rules forbid.
    if (!enabled) return;
    let cancelled = false;
    getWall(userRef)
      .then((page) => {
        if (cancelled) return;
        setEntries(page.items);
        setTotal(page.meta.total);
        setClosed(false);
        setFailed(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // A closed wall is not a failure - it is simply absent.
        if (error instanceof ApiError && error.code === WALL_DISABLED) {
          setClosed(true);
          return;
        }
        setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, userRef]);

  const handlePosted = useCallback((entry: WallEntry) => {
    setEntries((current) => [entry, ...current]);
    setTotal((current) => current + 1);
  }, []);

  const handleRemoved = useCallback((id: string) => {
    setEntries((current) => current.filter((entry) => entry.id !== id));
    setTotal((current) => Math.max(0, current - 1));
  }, []);

  if (closed) return null;

  return (
    <section aria-labelledby="wall-heading" className="mt-2">
      <h2 id="wall-heading" className="font-serif text-lg font-semibold">
        ข้อความถึง {ownerName}
        {total > 0 ? (
          <span className="ms-2 font-mono text-xs text-text-muted tabular-nums">
            {total}
          </span>
        ) : null}
      </h2>

      <WallComposer userRef={userRef} ownerName={ownerName} onPosted={handlePosted} />

      {loading ? (
        <p className="mt-6 text-sm text-text-secondary">กำลังโหลดข้อความ…</p>
      ) : failed ? (
        <p role="alert" className="mt-6 text-sm text-text-secondary">
          โหลดข้อความไม่สำเร็จในตอนนี้
        </p>
      ) : entries.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-border p-8 text-center text-sm text-text-secondary">
          ยังไม่มีใครฝากข้อความไว้ - เป็นคนแรกได้เลย
        </p>
      ) : (
        <ol className="mt-6 space-y-4">
          {entries.map((entry) => (
            <li key={entry.id}>
              <WallItem entry={entry} onRemoved={handleRemoved} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * The composer. A guest never sees a form that cannot work: the 401 turns into
 * a sign-in offer in place, and their intent survives (docs/02 §5.2).
 */
function WallComposer({
  userRef,
  ownerName,
  onPosted,
}: {
  userRef: string;
  ownerName: string;
  onPosted: (entry: WallEntry) => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);

  const submit = useCallback(async () => {
    const trimmed = body.trim();
    if (trimmed === "" || busy) return;
    setBusy(true);
    setError(null);
    try {
      const entry = await postToWall(userRef, trimmed);
      setBody("");
      onPosted(entry);
    } catch (cause) {
      if (cause instanceof ApiError && cause.isUnauthorized) {
        setNeedsSignIn(true);
      } else if (cause instanceof ApiError) {
        setError(cause.fields?.body?.[0] ?? cause.message);
      } else {
        setError("ส่งข้อความไม่สำเร็จ ลองใหม่อีกครั้ง");
      }
    } finally {
      setBusy(false);
    }
  }, [body, busy, onPosted, userRef]);

  if (needsSignIn) {
    return (
      <p className="mt-3 rounded-md border border-border bg-surface-secondary px-3 py-2 text-sm">
        <Link
          href={`/login?next=${typeof window !== "undefined" ? encodeURIComponent(window.location.pathname) : "/"}`}
          className="font-medium text-primary hover:underline"
        >
          เข้าสู่ระบบ
        </Link>{" "}
        เพื่อฝากข้อความถึง {ownerName}
      </p>
    );
  }

  return (
    <form
      className="mt-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={`ฝากข้อความถึง ${ownerName}…`}
        aria-label={`ฝากข้อความถึง ${ownerName}`}
        maxLength={WALL_BODY_MAX}
        rows={3}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
      />
      {error ? (
        <p role="alert" className="mt-1 text-xs text-error">
          {error}
        </p>
      ) : null}
      <div className="mt-2 flex items-center gap-3">
        <Button type="submit" loading={busy} disabled={body.trim() === ""}>
          ฝากข้อความ
        </Button>
        {body.length > WALL_BODY_MAX * 0.9 ? (
          <span className="font-mono text-xs text-text-muted tabular-nums">
            {body.length}/{WALL_BODY_MAX}
          </span>
        ) : null}
      </div>
    </form>
  );
}

/** One message, with the delete control the API says this viewer may use. */
function WallItem({
  entry,
  onRemoved,
}: {
  entry: WallEntry;
  onRemoved: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteWallEntry(entry.id);
      onRemoved(entry.id);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "ลบข้อความไม่สำเร็จ");
      setBusy(false);
    }
  }, [entry.id, onRemoved]);

  return (
    <article className="rounded-xl border border-border bg-surface p-4">
      <header className="flex flex-wrap items-baseline gap-2 text-sm">
        <Link
          href={`/users/${encodeURIComponent(entry.author.username)}`}
          className="font-medium hover:text-primary"
        >
          {wallAuthorName(entry)}
        </Link>
        <time dateTime={entry.created_at} className="text-xs text-text-secondary">
          {formatDate(entry.created_at)}
        </time>
      </header>

      <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">{entry.body}</p>

      {error ? (
        <p role="alert" className="mt-2 text-xs text-error">
          {error}
        </p>
      ) : null}

      {entry.can_delete ? (
        <footer className="mt-3">
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="text-xs text-text-secondary hover:text-error disabled:opacity-50"
          >
            {/* The wording differs because the acts differ: taking back your own
                words, or clearing somebody else's off your own page. */}
            {entry.is_owner ? "ลบข้อความของฉัน" : "เอาออกจากหน้าของฉัน"}
          </button>
        </footer>
      ) : null}
    </article>
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
