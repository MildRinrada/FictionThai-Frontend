import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorksPanel, worksSortOf } from "@/components/profile/works-panel";
import { ProfileTabs, profileTabOf } from "@/components/profile/profile-tabs";
import { WritingNowPanel } from "@/components/profile/writing-now-panel";
import type { ApiMeta } from "@/types/api";
import type { Novel } from "@/types/novel";

/**
 * The ผลงาน panel and the tab row.
 *
 * The complaint these answer: a writer opened their own profile, saw an empty
 * page, and had no way to learn that their fictions existed but were still
 * drafts. Plus the ordering and paging a profile needs to be linkable at all.
 */

function novel(overrides: Partial<Novel> = {}): Novel {
  return {
    id: crypto.randomUUID(),
    slug: "my-fiction",
    title: "เรื่องของฉัน",
    status: "ongoing",
    chapter_count: 3,
    updated_at: "2026-08-01T00:00:00Z",
    author: { id: "a1", username: "someone", display_name: "ใครคนหนึ่ง" },
    ...overrides,
  } as Novel;
}

function meta(overrides: Partial<ApiMeta> = {}): ApiMeta {
  return { page: 1, per_page: 12, total: 40, ...overrides } as ApiMeta;
}

const hrefFor = (query: { page?: number; sort?: string }) =>
  `/profile?${new URLSearchParams(
    Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]),
  ).toString()}`;

describe("the ผลงาน panel", () => {
  it("tells the owner their work exists but is not published", () => {
    render(
      <WorksPanel
        works={[novel({ status: "draft", visibility: "private" })]}
        meta={meta({ total: 1 })}
        page={1}
        sort="updated"
        hrefFor={hrefFor}
        isOwner
        fallback={<p>ยังไม่มีผลงาน</p>}
      />,
    );

    expect(screen.getByText(/มี 1 เรื่องที่ยังไม่เผยแพร่/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ไปหน้าสตูดิโอ/ })).toBeInTheDocument();
    expect(screen.getByText("ฉบับร่าง")).toBeInTheDocument();
  });

  it("says none of that to a visitor", () => {
    render(
      <WorksPanel
        works={[novel()]}
        meta={meta({ total: 1 })}
        page={1}
        sort="updated"
        hrefFor={hrefFor}
        isOwner={false}
        fallback={<p>ยังไม่มีผลงาน</p>}
      />,
    );

    expect(screen.queryByText(/ยังไม่เผยแพร่/)).not.toBeInTheDocument();
    expect(screen.queryByText("ฉบับร่าง")).not.toBeInTheDocument();
  });

  it("offers the three orderings as real links", () => {
    render(
      <WorksPanel
        works={[novel()]}
        meta={meta()}
        page={1}
        sort="popular"
        hrefFor={hrefFor}
        isOwner={false}
        fallback={<p />}
      />,
    );

    expect(screen.getByRole("link", { name: "ล่าสุด" })).toHaveAttribute(
      "href",
      expect.stringContaining("sort=updated"),
    );
    expect(screen.getByRole("link", { name: "ยอดนิยม" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("link", { name: "จบแล้ว" })).toBeInTheDocument();
  });

  it("pages with real numbers, and says which page is current in words", () => {
    render(
      <WorksPanel
        works={[novel()]}
        meta={meta({ total: 100 })}
        page={5}
        sort="updated"
        hrefFor={hrefFor}
        isOwner={false}
        fallback={<p />}
      />,
    );

    const pager = screen.getByRole("navigation", { name: "หน้าของผลงาน" });
    expect(pager).toBeInTheDocument();
    // First and last are always reachable, with the neighbours of page 5.
    for (const label of ["1", "4", "5", "6", "9"]) {
      expect(screen.getByRole("link", { name: new RegExp(`^${label}`) })).toBeInTheDocument();
    }
    expect(screen.getByText("(หน้าปัจจุบัน)")).toBeInTheDocument();
  });

  it("shows no pager when everything fits on one page", () => {
    render(
      <WorksPanel
        works={[novel()]}
        meta={meta({ total: 3 })}
        page={1}
        sort="updated"
        hrefFor={hrefFor}
        isOwner={false}
        fallback={<p />}
      />,
    );
    expect(screen.queryByRole("navigation", { name: "หน้าของผลงาน" })).toBeNull();
  });

  it("reads an unknown sort as the default rather than rendering nothing", () => {
    expect(worksSortOf(undefined)).toBe("updated");
    expect(worksSortOf("nonsense")).toBe("updated");
    expect(worksSortOf("popular")).toBe("popular");
    expect(worksSortOf("completed")).toBe("completed");
  });
});

describe("กำลังเขียนอยู่", () => {
  it("lists only the unfinished work, with when it last moved", () => {
    render(
      <WritingNowPanel
        works={[novel({ title: "ยังเขียนอยู่" }), novel({ title: "จบแล้ว", status: "completed" })]}
        fallback={<p>ไม่มี</p>}
      />,
    );

    expect(screen.getByText("ยังเขียนอยู่")).toBeInTheDocument();
    expect(screen.queryByText("จบแล้ว")).not.toBeInTheDocument();
    expect(screen.getByText(/อัปเดตล่าสุด/)).toBeInTheDocument();
  });
});

describe("the profile tabs", () => {
  it("keeps ผลงาน first and default", () => {
    expect(profileTabOf(undefined)).toBe("works");
    expect(profileTabOf("nonsense")).toBe("works");
    expect(profileTabOf("wall")).toBe("wall");
  });

  it("hides sections that have nothing behind them yet", () => {
    render(
      <ProfileTabs
        basePath="/users/someone"
        active="works"
        workCount={6}
        timelineCount={2}
      />,
    );

    expect(screen.getByRole("link", { name: /ผลงาน/ })).toBeInTheDocument();
    expect(screen.queryByText("ที่ฉันอ่าน")).not.toBeInTheDocument();
    expect(screen.queryByText("นามปากกา")).not.toBeInTheDocument();
  });

  it("shows the owner every section, so they can fill it", () => {
    render(
      <ProfileTabs
        basePath="/profile"
        active="works"
        workCount={0}
        timelineCount={0}
        isOwner
      />,
    );

    // The slimmer row (profile review 2026-08 section D): shelves say what a
    // reader has to show, the wall says what it is, and the two tabs that
    // double-counted or mislabeled identity (กำลังเขียนอยู่, นามปากกา) are
    // gone - one became a filter chip, the other identity chips in the hero.
    expect(screen.getByText("ชั้นหนังสือ")).toBeInTheDocument();
    expect(screen.getByText("กำแพงโปรไฟล์")).toBeInTheDocument();
    expect(screen.queryByText("นามปากกา")).not.toBeInTheDocument();
    expect(screen.queryByText("กำลังเขียนอยู่")).not.toBeInTheDocument();
  });
});
