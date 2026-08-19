import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NovelCoverCard } from "@/components/fiction/novel-card";
import {
  DiscoverQuestions,
  type DiscoverColumn,
} from "@/components/fiction/discover-questions";
import type { Novel } from "@/types/novel";

/**
 * The home review's card and section rules (2026-08):
 *
 *   - every shelf card carries its age rating and, when it is anything but
 *     plain prose, its presentation format - the differentiator, visible to
 *     the first-time visitor;
 *   - the discover questions answer with THREE fictions each and can redeal
 *     from the pool without a request;
 *   - the ad slot renders reserved space only when ads are on, and collapses
 *     entirely for an ad-free viewer.
 */

function novel(overrides: Partial<Novel> = {}): Novel {
  return {
    id: crypto.randomUUID(),
    slug: "my-fiction",
    title: "เรื่องของฉัน",
    status: "ongoing",
    age_rating: "general",
    presentation_format: "standard",
    has_mixed_formats: false,
    uses_chapter_navigation: true,
    chapter_count: 3,
    view_count: 0,
    updated_at: "2026-08-01T00:00:00Z",
    author: { id: "a1", username: "someone", display_name: "ใครคนหนึ่ง" },
    ...overrides,
  } as Novel;
}

describe("NovelCoverCard badges", () => {
  it("badges 18+ work and non-prose formats", () => {
    render(
      <NovelCoverCard
        novel={novel({ age_rating: "mature", presentation_format: "chat" })}
      />,
    );
    expect(screen.getByText("18+")).toBeInTheDocument();
    expect(screen.getByText("แชทล้วน")).toBeInTheDocument();
  });

  it("says ผสมรูปแบบ when the chapters disagree with the fiction's format", () => {
    render(<NovelCoverCard novel={novel({ has_mixed_formats: true })} />);
    expect(screen.getByText("ผสมรูปแบบ")).toBeInTheDocument();
  });

  it("badges even plain general-rated prose - every card states both facts", () => {
    // Round 2 of the review reaffirmed it: on a platform a guest can open
    // without signing in, the ABSENCE of a rating is not a rating.
    render(<NovelCoverCard novel={novel()} />);
    expect(screen.getByText("ทุกวัย")).toBeInTheDocument();
    expect(screen.getByText("ร้อยแก้ว")).toBeInTheDocument();
    expect(screen.queryByText("18+")).not.toBeInTheDocument();
  });

  it("fills the rating chip so it cannot be read as another category label", () => {
    // Review round 5: two identical outline chips in a row read as one kind
    // of label. The rating is FILLED; the format chip stays outlined.
    render(<NovelCoverCard novel={novel()} />);
    expect(screen.getByText("ทุกวัย").closest("span")).toHaveClass("bg-surface-secondary");
    expect(screen.getByText("ร้อยแก้ว").closest("span")).not.toHaveClass("bg-surface-secondary");
  });
});

describe("DiscoverQuestions", () => {
  const column = (question: string, size: number): DiscoverColumn => ({
    question,
    href: "/novels?preset=completed",
    pool: Array.from({ length: size }, (_, i) => ({
      slug: `s-${question}-${i}`,
      title: `เรื่องที่ ${i}`,
      author: "ใครคนหนึ่ง",
    })),
  });

  it("answers each question with three fictions, not one", () => {
    render(<DiscoverQuestions columns={[column("อยากอ่านจบในคืนเดียว?", 6)]} />);
    expect(screen.getAllByText(/เรื่องที่ \d/)).toHaveLength(3);
  });

  it("redeals from the pool without any request", () => {
    render(<DiscoverQuestions columns={[column("อยากอ่านจบในคืนเดียว?", 6)]} />);
    fireEvent.click(screen.getByRole("button", { name: /สุ่มใหม่/ }));
    // Still exactly three answers - a redeal changes which, never how many.
    expect(screen.getAllByText(/เรื่องที่ \d/)).toHaveLength(3);
  });

  it("offers no shuffle when the pool has nothing more to deal", () => {
    render(<DiscoverQuestions columns={[column("อยากอ่านจบในคืนเดียว?", 3)]} />);
    expect(screen.queryByRole("button", { name: /สุ่มใหม่/ })).not.toBeInTheDocument();
  });
});

describe("AdSlot", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/env");
  });

  async function renderSlot(
    adsEnabled: boolean,
    adFree: boolean,
    slot: "home-leaderboard" | "home-inline" | "home-footer" = "home-leaderboard",
  ) {
    vi.doMock("@/lib/env", () => ({
      env: { adsEnabled, apiUrl: "http://x", appUrl: "http://x", supportEmail: "", isProduction: false },
      apiBase: "http://x/api/v1",
    }));
    const { AdSlot } = await import("@/components/ads/ad-slot");
    return render(<AdSlot slot={slot} adFree={adFree} />);
  }

  it("reserves labelled space when ads are on", async () => {
    await renderSlot(true, false);
    // The label is the law-and-trust requirement: every slot says โฆษณา.
    expect(screen.getByText("โฆษณา")).toBeInTheDocument();
  });

  it("collapses entirely for an ad-free viewer", async () => {
    const { container } = await renderSlot(true, true);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while ads are off platform-wide", async () => {
    const { container } = await renderSlot(false, false);
    expect(container).toBeEmptyDOMElement();
  });

  it("gives every home slot the same standard height (review round 5)", async () => {
    // Three different heights read as three broken boxes - and the tallest
    // sat mid-page, where scrolling is fastest. One unit for all of home.
    const heights = new Set<string>();
    for (const slot of ["home-leaderboard", "home-inline", "home-footer"] as const) {
      const { container, unmount } = await renderSlot(true, false, slot);
      const box = container.querySelector(`[data-ad-slot="${slot}"]`);
      const minH = [...(box?.classList ?? [])]
        .filter((name) => name.includes("min-h"))
        .sort()
        .join(" ");
      heights.add(minH);
      unmount();
      vi.resetModules();
      vi.doUnmock("@/lib/env");
    }
    expect(heights.size).toBe(1);
  });
});
