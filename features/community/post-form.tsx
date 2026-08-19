"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  ReferencePicker,
  referenceInputOf,
} from "@/features/community/reference-picker";
import { ApiError } from "@/lib/api";
import { createCommunityPost, updateCommunityPost } from "@/lib/community-client";
import {
  COMMUNITY_VISIBILITIES,
  POST_MAX_LENGTH,
  POST_TYPES,
  POST_TYPE_LABELS,
  type CommunityPost,
  type CommunityPostType,
  type CommunityVisibility,
  type PostReference,
} from "@/types/community";

/**
 * The post composer (docs/03 §14 `/community/create`) - also reused inline
 * for editing an existing post, so validation, the visibility picker, and API
 * error rendering exist once.
 *
 * Visibility is the author's audience choice (docs/11 §37); the labels spell
 * out who will see the post rather than assuming the reader knows.
 *
 * The attachment follows the API's three-case rule when editing
 * (docs/09 §3, docs/PHASE-12-STORY-DEPTH.md §12D): the form sends `reference`
 * only when the author actually touched it. That matters for a post whose
 * fiction the author can no longer open - they see no card, and an edit to the
 * text alone must not be read as "detach it".
 */

// The closed dropdown wears the short name; the full audience wording rides
// the control's tooltip so it is never further than a hover away.
const VISIBILITY_LABELS: Record<CommunityVisibility, string> = {
  public: "สาธารณะ - ทุกคนเห็นได้",
  followers: "ผู้ติดตาม - เฉพาะคนที่ติดตามคุณ",
  private: "ส่วนตัว - เห็นเฉพาะคุณ",
};

const SHORT_VISIBILITY_LABELS: Record<CommunityVisibility, string> = {
  public: "สาธารณะ",
  followers: "ผู้ติดตาม",
  private: "ส่วนตัว",
};

export interface PostFormProps {
  /** Present when editing; absent when composing a new post. */
  post?: CommunityPost;
  onSaved?: (post: CommunityPost) => void;
  onCancel?: () => void;
  /** Compact layout for the inline composer at the top of the feed. */
  compact?: boolean;
}

export function PostForm({ post, onSaved, onCancel, compact = false }: PostFormProps) {
  const router = useRouter();
  const [content, setContent] = useState(post?.content ?? "");
  const [visibility, setVisibility] = useState<CommunityVisibility>(
    post?.visibility ?? "public",
  );
  const [postType, setPostType] = useState<CommunityPostType>(
    POST_TYPES.includes(post?.post_type as CommunityPostType)
      ? (post?.post_type as CommunityPostType)
      : "discussion",
  );
  const [reference, setReference] = useState<PostReference | null>(
    post?.reference ?? null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  // Only a deliberate change sends the field at all - see the note above.
  const [referenceTouched, setReferenceTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changeReference = useCallback((next: PostReference | null) => {
    setReference(next);
    setReferenceTouched(true);
  }, []);

  const submit = useCallback(async () => {
    const trimmed = content.trim();
    if (trimmed === "" || busy) return;

    setBusy(true);
    setError(null);
    try {
      if (post) {
        const updated = await updateCommunityPost(post.id, {
          content: trimmed,
          visibility,
          post_type: postType,
          ...(referenceTouched
            ? { reference: reference ? referenceInputOf(reference) : null }
            : {}),
        });
        onSaved?.(updated);
      } else {
        const created = await createCommunityPost({
          content: trimmed,
          visibility,
          post_type: postType,
          ...(reference ? { reference: referenceInputOf(reference) } : {}),
        });
        setContent("");
        setReference(null);
        setReferenceTouched(false);
        if (onSaved) {
          onSaved(created);
        } else {
          router.push(`/community/post/${created.id}`);
        }
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.isUnauthorized) {
        router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      } else if (cause instanceof ApiError) {
        setError(
          cause.fields?.content?.[0] ??
            cause.fields?.visibility?.[0] ??
            cause.fields?.novel_id?.[0] ??
            cause.fields?.chapter_id?.[0] ??
            cause.message,
        );
      } else {
        setError("ไม่สามารถบันทึกโพสต์ได้ กรุณาลองใหม่");
      }
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    content,
    onSaved,
    post,
    postType,
    reference,
    referenceTouched,
    router,
    visibility,
  ]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder="เล่าถึงตอนที่เพิ่งอ่าน อัปเดตงานเขียน หรือชวนคุยเรื่องตัวละคร…"
        maxLength={POST_MAX_LENGTH}
        rows={compact ? 3 : 5}
        aria-label="เนื้อหาโพสต์"
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
      />

      {reference || pickerOpen ? (
        <div className="mt-2">
          <ReferencePicker
            value={reference}
            onChange={changeReference}
            disabled={busy}
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            hideTrigger
          />
        </div>
      ) : null}

      {error ? <p className="mt-2 text-sm text-error">{error}</p> : null}

      {/* One toolbar row (docs/COMMUNITY-FEED.md): attach and intent on the
          left, audience and the submit on the right. The three-row radio
          block became a dropdown - same three choices, spelled out in the
          option list. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {!reference && !pickerOpen ? (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={busy}
            title="แนบได้ 1 ตอนต่อโพสต์"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-text-secondary hover:border-primary-200 hover:text-primary disabled:opacity-60"
          >
            <Icon name="paperclip" size={15} />
            แนบตอน
          </button>
        ) : null}

        <select
          value={postType}
          onChange={(event) => setPostType(event.target.value as CommunityPostType)}
          disabled={busy}
          aria-label="ประเภทโพสต์"
          className="min-h-9 rounded-md border border-border bg-surface px-2 text-sm text-text-secondary focus:border-primary focus:outline-none"
        >
          {POST_TYPES.map((value) => (
            <option key={value} value={value}>
              {POST_TYPE_LABELS[value]}
            </option>
          ))}
        </select>

        {content.length > POST_MAX_LENGTH * 0.9 ? (
          <span className="text-xs text-text-muted">
            {content.length}/{POST_MAX_LENGTH}
          </span>
        ) : null}

        <span className="ms-auto flex items-center gap-2">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="text-sm text-text-secondary hover:text-primary"
            >
              ยกเลิก
            </button>
          ) : null}
          <select
            value={visibility}
            onChange={(event) =>
              setVisibility(event.target.value as CommunityVisibility)
            }
            disabled={busy}
            aria-label="ใครเห็นโพสต์นี้ได้บ้าง"
            title={VISIBILITY_LABELS[visibility]}
            className="min-h-9 rounded-md border border-border bg-surface px-2 text-sm text-text-secondary focus:border-primary focus:outline-none"
          >
            {COMMUNITY_VISIBILITIES.map((value) => (
              <option key={value} value={value} title={VISIBILITY_LABELS[value]}>
                {SHORT_VISIBILITY_LABELS[value]}
              </option>
            ))}
          </select>
          <Button type="submit" loading={busy} disabled={content.trim() === ""}>
            {post ? "บันทึกการแก้ไข" : "โพสต์"}
          </Button>
        </span>
      </div>
    </form>
  );
}
