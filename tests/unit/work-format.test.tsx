import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HeadcanonView } from "@/components/reader/headcanon-view";
import {
  PresentationFormat,
  WorkFormat,
  workFormatOf,
  workFormatRequest,
  type FictionFormat,
} from "@/types/fiction";
import type { ChapterSummary } from "@/types/novel";

/**
 * รูปแบบผลงาน - the four-way work format and the per-chapter question
 * (docs/PHASE-13-CREATION-AND-CONTROL.md §13J, docs/PHASE-12-STORY-DEPTH.md §12F).
 *
 * The mapping between the four cards a writer sees and the format columns the
 * API stores lives in one function, so the create form, the settings page, and
 * the badges cannot drift apart. That function is worth testing directly.
 */

// vi.mock is hoisted above every declaration in the file, so the doubles it
// closes over have to live at module scope.
const createChapter = vi.fn();
const push = vi.fn();
const refresh = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh, replace }),
  usePathname: () => "/studio/novels/my-fiction/chapters",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/novels-client", () => ({
  createChapter: (...args: unknown[]) => createChapter(...args),
  publishChapter: vi.fn(),
  unpublishChapter: vi.fn(),
  updateChapter: vi.fn(),
  deleteChapter: vi.fn(),
  getChapter: vi.fn(),
  reorderChapters: vi.fn(),
}));

describe("the four work formats", () => {
  it("maps each choice onto the format columns", () => {
    expect(workFormatRequest(WorkFormat.Prose)).toEqual({
      presentation_format: "standard",
      content_mode: "general",
    });
    expect(workFormatRequest(WorkFormat.Chat)).toEqual({
      presentation_format: "chat",
      content_mode: "general",
    });
    expect(workFormatRequest(WorkFormat.Headcanon)).toEqual({
      presentation_format: "headcanon",
      content_mode: "headcanon",
    });
  });

  // There is no "mixed" answer, and that is the point: a writer who picks one
  // format can already change any chapter later, so a fourth card would have
  // locked nothing while telling the other three that they had (§13J).
  it("offers exactly three answers", () => {
    expect(Object.values(WorkFormat)).toEqual(["prose", "chat", "headcanon"]);
  });

  it("round-trips every choice", () => {
    for (const choice of Object.values(WorkFormat)) {
      const format = {
        story_structure: "multi_chapter",
        ...workFormatRequest(choice),
      } as FictionFormat;
      expect(workFormatOf(format)).toBe(choice);
    }
  });
});

// The add-chapter flow. A mixed fiction asks which format the new chapter is;
// the other three do not, because the writer already answered.
describe("<ChapterManager /> - the per-chapter question", () => {
  let ChapterManager: typeof import("@/features/studio/chapter-manager").ChapterManager;

  beforeEach(async () => {
    ({ ChapterManager } = await import("@/features/studio/chapter-manager"));
  });

  afterEach(() => {
    createChapter.mockReset();
    push.mockReset();
    refresh.mockReset();
  });

  function chapter(overrides: Partial<ChapterSummary> = {}): ChapterSummary {
    return {
      id: "chapter-1",
      chapter_number: 1,
      slug: "chapter-one",
      status: "draft",
      word_count: 0,
      presentation_format: null,
      active_format: PresentationFormat.Standard,
      content_ready: false,
      message_count: 0,
      entry_count: 0,
      content_format: "plain",
      created_at: "2026-08-12T00:00:00Z",
      updated_at: "2026-08-12T00:00:00Z",
      ...overrides,
    };
  }

  function renderManager(format = "standard") {
    render(
      <ChapterManager
        novelRef="my-fiction"
        chapters={[chapter()]}
        usesChapterNavigation
        defaultFormat={format}
        chapterUnit="ตอนที่"
        novelVisibility="private"
        nextNumber={2}
      />,
    );
    // The add box is collapsed to a button when chapters exist (13X); these
    // tests are about the questions inside it, so open it first.
    fireEvent.click(screen.getByRole("button", { name: /เพิ่มตอนใหม่/ }));
  }

  it("asks which mode the chapter is, and says the answer is final", () => {
    renderManager();

    expect(screen.getByText(/ตอนนี้จะเขียนในโหมดไหน/)).toBeInTheDocument();
    expect(screen.getByText(/เลือกได้ครั้งเดียว/)).toBeInTheDocument();
    // §13P - said BEFORE the choice, not discovered after it.
    expect(screen.getByText(/โหมดของตอนล็อกตั้งแต่สร้าง/)).toBeInTheDocument();

    for (const value of ["standard", "chat", "headcanon"]) {
      expect(
        document.querySelector(`input[name="chapter_format"][value="${value}"]`),
      ).toBeInTheDocument();
    }
  });

  // "แชท" alone read as a feature a prose chapter might also have. It is a whole
  // mode with its own composer, and the word has to say so.
  it("calls the chat mode แชทล้วน", () => {
    renderManager();
    expect(screen.getByText("แชทล้วน")).toBeInTheDocument();
    // ร้อยแก้ว appears on the mode card AND on the list row's meta line (13X).
    expect(screen.getAllByText("ร้อยแก้ว").length).toBeGreaterThan(0);
  });

  it("opens on the fiction's own mode", () => {
    renderManager("chat");
    expect(
      document.querySelector('input[name="chapter_format"][value="chat"]'),
    ).toBeChecked();
  });

  it("sends the mode the writer picked", async () => {
    createChapter.mockResolvedValue({ slug: "new-chapter" });
    renderManager();

    fireEvent.click(
      document.querySelector('input[name="chapter_format"][value="headcanon"]')!,
    );
    fireEvent.click(screen.getByRole("button", { name: /สร้างและเริ่มเขียน/ }));

    await waitFor(() => expect(createChapter).toHaveBeenCalled());
    expect(createChapter.mock.calls[0][1]).toMatchObject({
      status: "draft",
      presentation_format: "headcanon",
    });
  });

  /**
   * §13P reversed this. The chapter used to store NULL when its mode equalled
   * the fiction's, meaning "follow the fiction" - cheap, but it made
   * "ล็อกตั้งแต่สร้าง" untrue, because a later fiction-level change would then
   * silently turn a prose chapter into a chat one. The chapter is stamped.
   */
  it("stamps the mode even when it matches the fiction's own", async () => {
    createChapter.mockResolvedValue({ slug: "new-chapter" });
    renderManager("chat");

    fireEvent.click(screen.getByRole("button", { name: /สร้างและเริ่มเขียน/ }));

    await waitFor(() => expect(createChapter).toHaveBeenCalled());
    expect(createChapter.mock.calls[0][1]).toMatchObject({
      presentation_format: "chat",
    });
  });
});

describe("<HeadcanonView />", () => {
  const entries = [
    {
      id: "e1",
      position: 0,
      name: "อลิซ",
      values: ["20", "ราศีเมษ"],
      body: "ตื่นเช้าเสมอ\n\nแม้ไม่มีอะไรต้องทำ",
    },
  ];

  it("renders each entry with its topic fields on the name line", () => {
    render(<HeadcanonView entries={entries} fields={["อายุ", "ราศี"]} />);

    // The field's answer rides the name line, pipe-joined (editor review
    // 2026-08): อลิซ | อายุ: 20 - not a separate row under it.
    expect(screen.getByText("อลิซ").closest("h2")).toHaveTextContent("อายุ: 20");
    expect(screen.getByText(/ตื่นเช้าเสมอ/)).toBeInTheDocument();
  });

  // The labels belong to the topic and the answers to the entry, so editing the
  // headings later must not silently drop an answer already written.
  it("still shows a value whose label was removed", () => {
    render(<HeadcanonView entries={entries} fields={["อายุ"]} />);

    expect(screen.getByText("ราศีเมษ")).toBeInTheDocument();
    expect(screen.queryByText("ราศี")).not.toBeInTheDocument();
  });

  it("renders an entry that has only a name", () => {
    render(
      <HeadcanonView
        entries={[{ id: "e2", position: 0, name: "บ็อบ", values: [], body: "" }]}
        fields={["อายุ"]}
      />,
    );

    expect(screen.getByText("บ็อบ")).toBeInTheDocument();
  });
});
