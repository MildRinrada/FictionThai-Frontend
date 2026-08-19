// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResultRow } from "@/features/search/result-card";
import { highlight, matches } from "@/features/search/highlight";
import type { Novel } from "@/types/novel";

/**
 * The search result card (search review 2026-08 section D): one system badge
 * set in reader vocabulary, the match visible, and the writer's own labels on
 * their own quieter row.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/library-client", () => ({
  bookmarkNovel: vi.fn(() => Promise.resolve()),
}));

afterEach(cleanup);

function novelOf(overrides: Partial<Novel> = {}): Novel {
  return {
    id: "n1",
    slug: "b7k2m9x4",
    title: "เมืองที่ไม่มีเงา",
    tagline: "เรื่องของเงาที่หายไป",
    story_structure: "multi_chapter",
    presentation_format: "standard",
    content_mode: "general",
    status: "ongoing",
    age_rating: "general",
    age_gate: "warning",
    origin_type: "original",
    view_count: 10,
    like_count: 2,
    bookmark_count: 1,
    genres: [],
    tags: [{ id: "t1", name: "แฟนตาซี", slug: "fantasy" }],
    author: { id: "u1", username: "meaw", display_name: "แมวเขียน" },
    chapter_count: 12,
    uses_chapter_navigation: true,
    has_mixed_formats: false,
    has_reader_variables: true,
    first_chapter_slug: "w3nd8kfq",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-10T00:00:00Z",
    is_owner: false,
    ...overrides,
  } as Novel;
}

describe("highlight", () => {
  it("wraps every case-insensitive occurrence in <mark>", () => {
    render(<p>{highlight("Shadow of shadows", "shadow")}</p>);
    expect(screen.getAllByText(/shadow/i).filter((el) => el.tagName === "MARK")).toHaveLength(2);
  });

  it("matches by the same rule", () => {
    expect(matches("เมืองที่ไม่มีเงา", "เงา")).toBe(true);
    expect(matches("เมือง", "เงา")).toBe(false);
  });
});

describe("ResultRow", () => {
  it("speaks the reader vocabulary - กำลังเขียน, never กำลังเผยแพร่ (D3)", () => {
    render(<ResultRow novel={novelOf()} q="" signedIn={false} />);
    expect(screen.getByText("กำลังเขียน")).toBeTruthy();
    expect(screen.queryByText("กำลังเผยแพร่")).toBeNull();
  });

  it("badges y/n and offers อ่านตอนแรก straight to the first chapter (D6)", () => {
    render(<ResultRow novel={novelOf()} q="" signedIn={false} />);
    expect(screen.getByText("y/n")).toBeTruthy();
    const read = screen.getByRole("link", { name: /อ่านตอนแรก/ });
    expect(read.getAttribute("href")).toBe("/read/b7k2m9x4/w3nd8kfq");
  });

  it("highlights the query where it matched in the title", () => {
    render(<ResultRow novel={novelOf()} q="เงา" signedIn={false} />);
    const marks = document.querySelectorAll("mark");
    expect(marks.length).toBeGreaterThan(0);
  });

  it("names the match source when only a tag matched (D5)", () => {
    render(<ResultRow novel={novelOf()} q="แฟนตาซี" signedIn={false} />);
    expect(screen.getByText("ตรงกับแท็ก: แฟนตาซี")).toBeTruthy();
  });

  it("shows บันทึกเข้าชั้น only when signed in", () => {
    render(<ResultRow novel={novelOf()} q="" signedIn={false} />);
    expect(screen.queryByRole("button", { name: /บันทึกเข้าชั้น/ })).toBeNull();
    cleanup();
    render(<ResultRow novel={novelOf()} q="" signedIn />);
    expect(screen.getByRole("button", { name: /บันทึกเข้าชั้น/ })).toBeTruthy();
  });
});
