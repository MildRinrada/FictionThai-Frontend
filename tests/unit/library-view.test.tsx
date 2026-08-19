import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LibraryView, type LibraryData } from "@/features/library/library-view";
import type { ContinueReadingEntry, FollowedAuthor } from "@/types/library";
import type { Novel } from "@/types/novel";

/**
 * ชั้นหนังสือของฉัน (library redesign 2026-08). What these tests defend: the
 * one name, the stat header that navigates, the reading tab's grouping and
 * counts, the undo toast instead of confirm dialogs, the per-follow
 * notification switch, and history's privacy controls.
 */

const push = vi.fn();
const replace = vi.fn();
let urlParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace }),
  usePathname: () => "/library",
  useSearchParams: () => urlParams,
}));

const deleteProgress = vi.fn(() => Promise.resolve());
const saveProgress = vi.fn(() => Promise.resolve());
const markFinished = vi.fn(() => Promise.resolve());
const unmarkFinished = vi.fn(() => Promise.resolve());
const setFollowNotify = vi.fn(() => Promise.resolve());
const unfollowUser = vi.fn(() => Promise.resolve());
const followUser = vi.fn(() => Promise.resolve());
const setHistorySettings = vi.fn(() => Promise.resolve({ record_history: false }));
const clearHistory = vi.fn(() => Promise.resolve());

vi.mock("@/lib/library-client", () => ({
  deleteProgress: (...args: unknown[]) => deleteProgress(...(args as [])),
  saveProgress: (...args: unknown[]) => saveProgress(...(args as [])),
  markFinished: (...args: unknown[]) => markFinished(...(args as [])),
  unmarkFinished: (...args: unknown[]) => unmarkFinished(...(args as [])),
  setFollowNotify: (...args: unknown[]) => setFollowNotify(...(args as [])),
  unfollowUser: (...args: unknown[]) => unfollowUser(...(args as [])),
  followUser: (...args: unknown[]) => followUser(...(args as [])),
  setHistorySettings: (...args: unknown[]) => setHistorySettings(...(args as [])),
  clearHistory: (...args: unknown[]) => clearHistory(...(args as [])),
  getFinished: vi.fn(() => Promise.resolve({ items: [], meta: null })),
  getHistory: vi.fn(() => Promise.resolve({ items: [], meta: null })),
  bookmarkNovel: vi.fn(() => Promise.resolve()),
  removeBookmark: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/shelves-client", () => ({
  addToShelf: vi.fn(() => Promise.resolve()),
  createShelf: vi.fn(() =>
    Promise.resolve({
      id: "shelf-new",
      name: "อ่านซ้ำได้",
      is_public: false,
      position: 0,
      item_count: 0,
      items: [],
      created_at: "",
      updated_at: "",
    }),
  ),
  deleteShelf: vi.fn(() => Promise.resolve()),
  removeFromShelf: vi.fn(() => Promise.resolve()),
  updateShelf: vi.fn(() => Promise.resolve()),
}));

function novelOf(id: string, title: string, status = "ongoing"): Novel {
  return {
    id,
    slug: id,
    title,
    status,
    age_rating: "all",
    age_gate: false,
    origin_type: "original",
    view_count: 0,
    like_count: 0,
    bookmark_count: 0,
    genres: [],
    tags: [],
    author: { id: "a1", username: "writerly", display_name: "นักเขียนดี" },
    chapter_count: 10,
    uses_chapter_navigation: true,
    has_mixed_formats: false,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-10T00:00:00Z",
  } as unknown as Novel;
}

function readingEntry(overrides: Partial<ContinueReadingEntry> = {}): ContinueReadingEntry {
  return {
    novel: novelOf("n1", "เรื่องที่อ่านค้าง"),
    chapter: { id: "c2", chapter_number: 2, slug: "ch2", title: "บทที่ฝนตก" },
    progress_percent: 50,
    last_read_at: new Date().toISOString(),
    total_chapters: 10,
    chapters_left: 6,
    new_since_read: 3,
    ...overrides,
  };
}

function followEntry(overrides: Partial<FollowedAuthor> = {}): FollowedAuthor {
  return {
    author: { id: "a1", username: "writerly", display_name: "นักเขียนดี" },
    followed_at: "2026-08-01T00:00:00Z",
    last_published_at: new Date().toISOString(),
    writing_count: 2,
    notify_new_chapters: true,
    ...overrides,
  };
}

function data(overrides: Partial<LibraryData> = {}): LibraryData {
  return {
    reading: [],
    readingMeta: null,
    bookmarks: [],
    bookmarksMeta: null,
    shelves: [],
    finished: [],
    finishedMeta: null,
    following: [],
    followingMeta: null,
    history: [],
    historyMeta: null,
    historySettings: { record_history: true },
    suggestions: [],
    username: "readerly",
    ...overrides,
  };
}

beforeEach(() => {
  urlParams = new URLSearchParams();
  for (const mock of [push, replace, deleteProgress, saveProgress, markFinished,
    setFollowNotify, setHistorySettings, clearHistory]) {
    mock.mockClear();
  }
});

describe("LibraryView", () => {
  it("wears the navbar's name and a stat row that navigates", () => {
    render(
      <LibraryView
        initialTab="reading"
        data={data({
          reading: [readingEntry()],
          readingMeta: { page: 1, per_page: 20, total: 3 },
          followingMeta: { page: 1, per_page: 20, total: 7 },
        })}
      />,
    );

    // One name everywhere (item 1) - never คลังของฉัน.
    expect(
      screen.getByRole("heading", { name: "ชั้นหนังสือของฉัน" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/คลังของฉัน/)).not.toBeInTheDocument();

    // The numbers ARE the navigation - shallow, so the press never triggers
    // a server round trip (review follow-up: tab switches must not refresh).
    fireEvent.click(screen.getByRole("button", { name: "ติดตาม 7 นักเขียน" }));
    expect(window.location.search).toBe("?tab=following");
    expect(replace).not.toHaveBeenCalled();
  });

  it("the reading card carries the resume line, the real bar, and THE badge", () => {
    render(<LibraryView initialTab="reading" data={data({ reading: [readingEntry()] })} />);

    expect(screen.getByText(/อ่านค้างที่: ตอนที่ 2 · บทที่ฝนตก/)).toBeInTheDocument();
    expect(screen.getByText("เหลืออีก 6 ตอน")).toBeInTheDocument();
    expect(
      screen.getByText(/มี 3 ตอนใหม่หลังจากที่คุณอ่านค้างไว้/),
    ).toBeInTheDocument();
    // (10 - 6 - 1 + 0.5) / 10 = 35% through the story.
    expect(screen.getByRole("progressbar", { name: "อ่านแล้ว 35%" })).toBeInTheDocument();
    // อ่านต่อ deep-links to the saved position, not the chapter top.
    expect(screen.getByRole("link", { name: /อ่านต่อ/ })).toHaveAttribute(
      "href",
      "/read/n1/ch2#resume",
    );
  });

  it("groups the read-through and the stale apart from the active", () => {
    const old = new Date(Date.now() - 40 * 86_400_000).toISOString();
    render(
      <LibraryView
        initialTab="reading"
        data={data({
          reading: [
            readingEntry(),
            readingEntry({
              novel: novelOf("n2", "เรื่องที่รอตอนใหม่"),
              chapters_left: 0,
              new_since_read: 0,
            }),
            readingEntry({
              novel: novelOf("n3", "เรื่องที่จบและอ่านครบ", "completed"),
              chapters_left: 0,
              new_since_read: 0,
            }),
            readingEntry({
              novel: novelOf("n4", "เรื่องที่ค้างนาน"),
              last_read_at: old,
              new_since_read: 0,
            }),
          ],
        })}
      />,
    );

    expect(screen.getByRole("heading", { name: "อ่านค้างไว้" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "รอตอนใหม่" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "อ่านครบแล้ว - ปิดเล่มไหม?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /ค้างนานแล้ว/ }),
    ).toBeInTheDocument();
  });

  it("เก็บกวาด clears the stale pile with an undo, never a dialog", () => {
    const old = new Date(Date.now() - 40 * 86_400_000).toISOString();
    render(
      <LibraryView
        initialTab="reading"
        data={data({
          reading: [
            readingEntry({
              novel: novelOf("n4", "เรื่องที่ค้างนาน"),
              last_read_at: old,
              new_since_read: 0,
            }),
          ],
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /เก็บกวาดทั้งกลุ่ม/ }));
    expect(deleteProgress).toHaveBeenCalledWith("n4");
    expect(screen.getByText("เก็บกวาด 1 เรื่องแล้ว")).toBeInTheDocument();

    // เลิกทำ really brings it back - re-saving the exact position.
    fireEvent.click(screen.getByRole("button", { name: "เลิกทำ" }));
    expect(saveProgress).toHaveBeenCalledWith("n4", {
      chapter_id: "c2",
      progress_percent: 50,
    });
    expect(
      screen.getAllByRole("link", { name: "เรื่องที่ค้างนาน" }).length,
    ).toBeGreaterThan(0);
  });

  it("ทำเครื่องหมายว่าอ่านจบ moves the fiction out through its menu", async () => {
    render(<LibraryView initialTab="reading" data={data({ reading: [readingEntry()] })} />);

    fireEvent.click(screen.getByRole("button", { name: /เมนูของ เรื่องที่อ่านค้าง/ }));
    fireEvent.click(screen.getByRole("button", { name: "ทำเครื่องหมายว่าอ่านจบ" }));

    expect(markFinished).toHaveBeenCalledWith("n1");
    expect(screen.queryByText(/อ่านค้างที่: ตอนที่ 2/)).not.toBeInTheDocument();
  });

  it("the follow row carries activity and its own notification switch", () => {
    urlParams = new URLSearchParams("tab=following");
    render(
      <LibraryView
        initialTab="following"
        data={data({
          following: [
            followEntry(),
            followEntry({
              author: { id: "a2", username: "quietone", display_name: "คนเงียบ" },
              last_published_at: null,
              writing_count: 0,
              notify_new_chapters: true,
            }),
          ],
        })}
      />,
    );

    // Grouped: active vs quiet (the unfollow-easily group).
    expect(screen.getByRole("heading", { name: "มีความเคลื่อนไหว" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "เงียบไปนาน" })).toBeInTheDocument();
    expect(screen.getByText(/กำลังเขียน 2 เรื่อง/)).toBeInTheDocument();

    const toggle = screen.getByRole("switch", {
      name: "แจ้งเตือนตอนใหม่ของ นักเขียนดี",
    });
    fireEvent.click(toggle);
    expect(setFollowNotify).toHaveBeenCalledWith("a1", false);
  });

  it("history keeps its privacy controls in reach", () => {
    urlParams = new URLSearchParams("tab=history");
    render(
      <LibraryView
        initialTab="history"
        data={data({
          history: [
            {
              novel: novelOf("n1", "เรื่องที่เคยอ่าน"),
              chapter: { id: "c1", chapter_number: 1, slug: "ch1" },
              read_at: new Date().toISOString(),
            },
          ],
          historyMeta: { page: 1, per_page: 20, total: 1 },
        })}
      />,
    );

    // The recording switch flips off in one press.
    fireEvent.click(screen.getByRole("switch", { name: "ไม่บันทึกประวัติการอ่าน" }));
    expect(setHistorySettings).toHaveBeenCalledWith(false);

    // ล้างประวัติ is a two-step INLINE confirm - it erases, and says so.
    fireEvent.click(screen.getByRole("button", { name: /ล้างประวัติ/ }));
    fireEvent.click(screen.getByRole("button", { name: "ล้างประวัติ" }));
    expect(clearHistory).toHaveBeenCalled();
    expect(screen.getByText("ยังไม่มีประวัติการอ่าน")).toBeInTheDocument();
  });

  it("shelves offer the preset first-shelf chips on empty", async () => {
    urlParams = new URLSearchParams("tab=shelves");
    render(<LibraryView initialTab="shelves" data={data()} />);

    expect(screen.getByText("ยังไม่มีชั้นหนังสือ")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+ อ่านซ้ำได้" }));
    expect(await screen.findByText(/สร้างชั้น "อ่านซ้ำได้" แล้ว/)).toBeInTheDocument();
  });
});
