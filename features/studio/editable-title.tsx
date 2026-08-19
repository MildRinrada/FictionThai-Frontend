"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { ApiError } from "@/lib/api";
import { updateNovel } from "@/lib/novels-client";

/**
 * ชื่อเรื่อง, editable wherever it is shown (§13S, reworked in §13T).
 *
 * Double-click to edit, exactly where the title is. The first version put a
 * confirmation bar at the bottom of the viewport - a control at the maximum
 * possible distance from the field it confirmed. Gone: Enter or clicking away
 * saves, Esc abandons, and the feedback is a small "บันทึกแล้ว" BESIDE the
 * title, where the writer is already looking.
 *
 * Auto-save on blur is safe here because entering the editor takes a
 * deliberate double-click and Esc is a full undo; the API remains the
 * authority on whether the change took, and a refusal puts the old title back
 * with the reason next to it.
 */
export function EditableTitle({
  novelRef,
  title,
  className = "font-serif text-2xl font-semibold tracking-tight",
  as: Heading = "h1",
}: {
  novelRef: string;
  title: string;
  className?: string;
  /**
   * The element the title renders as. The studio rail shows the same title on
   * every screen beside a page that already has an h1, so it renders as a
   * paragraph there - two h1s on one page is a worse outcome than a heading
   * level being decided by the caller.
   */
  as?: "h1" | "h2" | "p";
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(title);
  const [draft, setDraft] = useState(title);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  // Set by Esc so the blur it causes does not save what was just abandoned.
  const abandoned = useRef(false);

  // Select the whole title on open: the commonest edit is a rewrite, and the
  // second commonest starts by putting the caret somewhere, which a click does.
  useEffect(() => {
    if (!editing) return;
    field.current?.focus();
    field.current?.select();
  }, [editing]);

  // The confirmation of a save, and its own dismissal.
  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(false), 2400);
    return () => window.clearTimeout(timer);
  }, [flash]);

  function cancel() {
    setDraft(saved);
    setEditing(false);
    setError(null);
  }

  async function commit() {
    const next = draft.trim();
    if (next === saved) {
      setEditing(false);
      setError(null);
      return;
    }
    if (next === "") {
      // An emptied field on blur is treated as an abandoned edit, not as a
      // request to have no title - which the API would refuse anyway.
      cancel();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateNovel(novelRef, { title: next });
      setSaved(next);
      setDraft(next);
      setEditing(false);
      setFlash(true);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "บันทึกชื่อเรื่องไม่สำเร็จ");
      setEditing(false);
      setDraft(saved);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="min-w-0">
        <Heading
          onDoubleClick={() => {
            setFlash(false);
            setEditing(true);
          }}
          title="ดับเบิลคลิกเพื่อแก้ชื่อเรื่อง"
          className={`group inline-flex max-w-full cursor-text items-center gap-1.5 rounded-md px-1 -mx-1 hover:bg-surface-secondary ${className}`}
        >
          {/* Wrapped, not truncated: this is the writer's own page, and a
              title clipped to "Genshin Men x rea…" hides the one thing they
              came to recognise. Two lines is enough for any real title. */}
          <span className="min-w-0 line-clamp-2 text-start">{saved}</span>
          {flash ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-normal text-success">
              <Icon name="check" size={13} />
              บันทึกแล้ว
            </span>
          ) : (
            <Icon
              name="edit"
              size={14}
              className="shrink-0 opacity-0 transition-opacity group-hover:opacity-60"
            />
          )}
        </Heading>
        {error ? (
          <p role="alert" className="mt-1 text-xs text-error">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <label className="sr-only" htmlFor="editable-title">
        ชื่อเรื่อง
      </label>
      <input
        id="editable-title"
        ref={field}
        value={draft}
        disabled={saving}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (abandoned.current) {
            abandoned.current = false;
            return;
          }
          void commit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void commit();
          }
          if (event.key === "Escape") {
            abandoned.current = true;
            cancel();
          }
        }}
        className={`w-full rounded-md border border-primary bg-surface px-1 -mx-1 outline-none ${className}`}
      />
      <p className="mt-1 text-xs text-text-muted">
        {saving ? "กำลังบันทึก…" : "Enter เพื่อบันทึก · Esc เพื่อยกเลิก"}
      </p>
    </div>
  );
}
