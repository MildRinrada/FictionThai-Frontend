import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PostCard } from "@/components/community/post-card";
import { ReferenceCard } from "@/components/community/reference-card";
import {
  referenceHref,
  referenceMeta,
  referenceTitle,
} from "@/lib/post-reference";
import type { CommunityPost, PostReference } from "@/types/community";

/**
 * A post that points at a fiction (docs/PHASE-12-STORY-DEPTH.md §12D).
 *
 * The rule these assertions defend: the API resolves the reference against the
 * reader, so ITS ABSENCE CARRIES NO INFORMATION. A post with no card must look
 * like an ordinary post - never like a broken one, and never with a placeholder
 * that tells a stranger a fiction they cannot see exists.
 */

// PostCard is a client component now (docs/COMMUNITY-FEED.md) and navigates.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function reference(overrides: Partial<PostReference> = {}): PostReference {
  return {
    novel_id: "9f1c0f5e-0000-4000-8000-000000000001",
    novel_slug: "the-old-pier",
    novel_title: "ปลายฝนที่ท่าน้ำเก่า",
    story_structure: "multi_chapter",
    presentation_format: "standard",
    content_mode: "general",
    age_rating: "general",
    ...overrides,
  };
}

function chapterReference(overrides: Partial<PostReference> = {}): PostReference {
  return reference({
    chapter_id: "chapter-7",
    chapter_slug: "high-tide",
    chapter_number: 7,
    chapter_title: "น้ำขึ้นตอนตีสาม",
    word_count: 2140,
    ...overrides,
  });
}

function post(overrides: Partial<CommunityPost> = {}): CommunityPost {
  return {
    id: "post-1",
    content: "ตอนที่ 7 ปล่อยแล้วนะคะ",
    visibility: "public",
    post_type: "discussion",
    edited: false,
    created_at: "2026-08-12T00:00:00Z",
    updated_at: "2026-08-12T00:00:00Z",
    author: { id: "u1", username: "nattavara_s", display_name: "ณัฐวรา ศิริ" },
    comment_count: 24,
    reaction_count: 128,
    is_owner: false,
    ...overrides,
  };
}

describe("where a reference points", () => {
  it("opens the chapter when the post attached one", () => {
    expect(referenceHref(chapterReference())).toBe("/read/the-old-pier/high-tide");
  });

  it("opens the fiction when the post attached the whole work", () => {
    expect(referenceHref(reference())).toBe("/novel/the-old-pier");
  });

  it("escapes slugs rather than trusting them into the path", () => {
    const href = referenceHref(reference({ novel_slug: "a b/c" }));
    expect(href).toBe("/novel/a%20b%2Fc");
  });
});

describe("what a reference card says", () => {
  it("names the fiction and the chapter", () => {
    expect(referenceTitle(chapterReference())).toBe(
      "ปลายฝนที่ท่าน้ำเก่า · ตอนที่ 7 น้ำขึ้นตอนตีสาม",
    );
  });

  it("names only the fiction when no chapter is attached", () => {
    expect(referenceTitle(reference())).toBe("ปลายฝนที่ท่าน้ำเก่า");
  });

  it("keeps an untitled chapter untitled", () => {
    const title = referenceTitle(chapterReference({ chapter_title: null }));
    expect(title).toBe("ปลายฝนที่ท่าน้ำเก่า · ตอนที่ 7");
  });

  it("states the format, the length, and an approximate reading time", () => {
    expect(referenceMeta(chapterReference())).toEqual([
      "ร้อยแก้ว",
      "2,140 คำ",
      "~11 นาที",
    ]);
  });

  it("flags headcanon, which is not the default", () => {
    const meta = referenceMeta(chapterReference({ content_mode: "headcanon" }));
    expect(meta).toContain("งานเฮดแคนอน");
  });

  // A fiction-level card has no word count, so it must claim no length and no
  // reading time rather than showing "0 คำ".
  it("invents no length for a fiction with no chapter", () => {
    const meta = referenceMeta(reference());
    expect(meta).toEqual(["ร้อยแก้ว"]);
  });

  // docs/09 §52: a format this build does not know must degrade safely.
  it("says nothing about a format it does not know", () => {
    const meta = referenceMeta(reference({ presentation_format: "script" }));
    expect(meta).toEqual([]);
    expect(meta.join(" · ")).not.toContain("undefined");
  });
});

describe("a post card with an attached fiction", () => {
  it("renders the card and links through to the chapter", () => {
    render(<PostCard post={post({ reference: chapterReference() })} />);

    const link = screen.getByRole("link", { name: /ปลายฝนที่ท่าน้ำเก่า/ });
    expect(link).toHaveAttribute("href", "/read/the-old-pier/high-tide");
    expect(screen.getByText(/ตอนที่ 7 น้ำขึ้นตอนตีสาม/)).toBeInTheDocument();
  });

  // The point of §12D: a post whose fiction the reader may not open arrives
  // without a reference, and must be indistinguishable from a post that never
  // attached one.
  it("renders as an ordinary post when there is no reference", () => {
    const { container } = render(<PostCard post={post({ reference: null })} />);

    expect(screen.queryByText(/ตอนที่แนบมา/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ไม่พบ|ไม่สามารถ|ถูกลบ|ส่วนตัว/)).not.toBeInTheDocument();
    // The post itself is untouched.
    expect(screen.getByText("ตอนที่ 7 ปล่อยแล้วนะคะ")).toBeInTheDocument();
    // Nothing links into a fiction, so no empty card frame was left behind.
    const targets = Array.from(container.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    expect(targets.some((href) => href?.startsWith("/read/"))).toBe(false);
    expect(targets.some((href) => href?.startsWith("/novel/"))).toBe(false);
  });

  it("is identical whether the reference is absent or explicitly null", () => {
    const withoutKey = render(<PostCard post={post()} />).container.innerHTML;
    const withNull = render(<PostCard post={post({ reference: null })} />).container
      .innerHTML;
    expect(withoutKey).toBe(withNull);
  });
});

describe("the reference card on its own", () => {
  it("offers the fiction rather than a chapter when none was attached", () => {
    render(<ReferenceCard reference={reference()} />);
    expect(screen.getByText("เปิดเรื่องนี้ →")).toBeInTheDocument();
  });

  it("offers the chapter when one was attached", () => {
    render(<ReferenceCard reference={chapterReference()} />);
    expect(screen.getByText("อ่านตอนนี้ →")).toBeInTheDocument();
  });
});
