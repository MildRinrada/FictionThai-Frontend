import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChapterManager } from "@/features/studio/chapter-manager";
import type { ChapterSummary } from "@/types/novel";

/**
 * The chapter list's studio round (13X).
 *
 * What these tests defend: every row has a full action menu (not just the
 * publish button), everything public-facing confirms with its consequences
 * stated - including "the fiction is still private, nobody will see this" -
 * an empty chapter cannot be published but CAN be deleted without ceremony,
 * the meta line has one fixed shape in the mode's own unit, and the list
 * scales: tabs, bulk selection, and drag reordering with an undo.
 */

const createChapter = vi.fn();
const updateChapter = vi.fn();
const deleteChapter = vi.fn();
const getChapter = vi.fn();
const publishChapter = vi.fn();
const unpublishChapter = vi.fn();
const reorderChapters = vi.fn();
const push = vi.fn();
const refresh = vi.fn();
const replace = vi.fn();

let urlParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh, replace }),
  usePathname: () => "/studio/novels/my-fiction/chapters",
  useSearchParams: () => urlParams,
}));

vi.mock("@/lib/novels-client", () => ({
  createChapter: (...args: unknown[]) => createChapter(...args),
  updateChapter: (...args: unknown[]) => updateChapter(...args),
  deleteChapter: (...args: unknown[]) => deleteChapter(...args),
  getChapter: (...args: unknown[]) => getChapter(...args),
  publishChapter: (...args: unknown[]) => publishChapter(...args),
  unpublishChapter: (...args: unknown[]) => unpublishChapter(...args),
  reorderChapters: (...args: unknown[]) => reorderChapters(...args),
}));

const precheckChapter = vi.fn();

vi.mock("@/lib/ai-client", () => ({
  precheckChapter: (...args: unknown[]) => precheckChapter(...args),
}));

afterEach(() => {
  for (const mock of [
    createChapter,
    updateChapter,
    deleteChapter,
    getChapter,
    publishChapter,
    unpublishChapter,
    reorderChapters,
    precheckChapter,
    push,
    refresh,
    replace,
  ]) {
    mock.mockReset();
  }
  // The publish confirm fires the advisory precheck; default it to "still
  // loading" so unrelated tests never crash on it.
  precheckChapter.mockReturnValue(new Promise(() => {}));
  urlParams = new URLSearchParams();
});

let sequence = 0;

function chapter(overrides: Partial<ChapterSummary> = {}): ChapterSummary {
  sequence += 1;
  return {
    id: `ch-${sequence}`,
    chapter_number: sequence,
    slug: `chapter-${sequence}`,
    status: "draft",
    word_count: 0,
    message_count: 0,
    entry_count: 0,
    presentation_format: null,
    active_format: "standard",
    content_ready: false,
    content_format: "plain",
    created_at: "2026-08-12T00:00:00Z",
    updated_at: "2026-08-13T00:00:00Z",
    ...overrides,
  };
}

function renderManager({
  chapters = [] as ChapterSummary[],
  visibility = "private",
  defaultFormat = "standard",
} = {}) {
  return render(
    <ChapterManager
      novelRef="my-fiction"
      chapters={chapters}
      usesChapterNavigation
      defaultFormat={defaultFormat}
      chapterUnit="ตอนที่"
      novelVisibility={visibility}
      nextNumber={chapters.length + 1}
    />,
  );
}

function openMenu(name: RegExp | string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("row actions (#1)", () => {
  it("gives every row a ⋯ menu in the specified order, delete in red", () => {
    renderManager({
      chapters: [chapter({ title: "บทนำ", word_count: 100, content_ready: true })],
    });

    openMenu(/เมนูของ บทนำ/);
    const menu = screen.getByRole("menu");
    const labels = within(menu)
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    expect(labels).toEqual([
      "แก้ไข",
      "ดูตัวอย่าง",
      "เปลี่ยนชื่อ",
      "ทำสำเนา",
      "ย้ายขึ้น",
      "ย้ายลง",
      "ย้ายไปตำแหน่ง…",
      "ลบตอน",
    ]);
    expect(within(menu).getByRole("menuitem", { name: "ลบตอน" }).className).toContain(
      "text-error",
    );
    // แก้ไข and ดูตัวอย่าง are real links.
    expect(
      within(menu).getByRole("menuitem", { name: "แก้ไข" }).getAttribute("href"),
    ).toContain("/chapters/");
    expect(
      within(menu).getByRole("menuitem", { name: "ดูตัวอย่าง" }).getAttribute("href"),
    ).toContain("/read/my-fiction/");
  });

  it("renames inline through the menu, without leaving the page", async () => {
    const one = chapter({ title: "ชื่อเดิม", word_count: 10, content_ready: true });
    updateChapter.mockResolvedValue(one);
    renderManager({ chapters: [one] });

    openMenu(/เมนูของ ชื่อเดิม/);
    fireEvent.click(screen.getByRole("menuitem", { name: "เปลี่ยนชื่อ" }));

    const input = screen.getByLabelText("ชื่อตอนใหม่");
    fireEvent.change(input, { target: { value: "ชื่อใหม่" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(updateChapter).toHaveBeenCalledWith("my-fiction", one.slug, {
        title: "ชื่อใหม่",
      }),
    );
  });

  it("duplicates as a draft copy in the same mode, titled (สำเนา)", async () => {
    const one = chapter({
      title: "ต้นฉบับ",
      word_count: 50,
      content_ready: true,
      active_format: "chat",
      message_count: 3,
    });
    getChapter.mockResolvedValue({
      ...one,
      content: null,
      messages: [{ speaker_name: "A", message_type: "message", content: "สวัสดี" }],
      entries: null,
      entry_fields: [],
    });
    createChapter.mockResolvedValue({ slug: "copy" });
    renderManager({ chapters: [one] });

    openMenu(/เมนูของ ต้นฉบับ/);
    fireEvent.click(screen.getByRole("menuitem", { name: "ทำสำเนา" }));

    await waitFor(() => expect(createChapter).toHaveBeenCalled());
    expect(createChapter.mock.calls[0][1]).toMatchObject({
      title: "ต้นฉบับ (สำเนา)",
      status: "draft",
      presentation_format: "chat",
    });
  });

  it("confirms deletion with the name and the amount of writing at stake (#1)", async () => {
    const one = chapter({
      title: "บทที่มีเนื้อหา",
      word_count: 3012,
      content_ready: true,
      status: "published",
      published_at: "2026-08-12T10:00:00Z",
    });
    deleteChapter.mockResolvedValue(undefined);
    renderManager({ chapters: [one] });

    openMenu(/เมนูของ บทที่มีเนื้อหา/);
    fireEvent.click(screen.getByRole("menuitem", { name: "ลบตอน" }));
    expect(deleteChapter).not.toHaveBeenCalled();
    expect(
      screen.getByText(/ลบ «บทที่มีเนื้อหา» ถาวร\? เนื้อหา 3,012 คำ จะหายไป/),
    ).toBeInTheDocument();
    // A published chapter warns about readers' bookmarks.
    expect(screen.getByText(/บุ๊กมาร์ก/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ยืนยันลบ" }));
    await waitFor(() =>
      expect(deleteChapter).toHaveBeenCalledWith("my-fiction", one.slug),
    );
  });

  it("deletes a truly empty chapter without any confirmation", async () => {
    const empty = chapter({ title: "ตอนขยะ" });
    deleteChapter.mockResolvedValue(undefined);
    renderManager({ chapters: [empty] });

    openMenu(/เมนูของ ตอนขยะ/);
    fireEvent.click(screen.getByRole("menuitem", { name: "ลบตอน" }));

    await waitFor(() =>
      expect(deleteChapter).toHaveBeenCalledWith("my-fiction", empty.slug),
    );
    expect(screen.queryByText(/ถาวร\?/)).not.toBeInTheDocument();
  });
});

describe("publishing guards (#2, #8)", () => {
  it("disables เผยแพร่ for a chapter with no content, with a tooltip", () => {
    renderManager({ chapters: [chapter({ title: "ว่างเปล่า" })] });

    const button = screen.getByRole("button", { name: "เผยแพร่" });
    expect(button).toBeDisabled();
    expect(button.closest("span")).toHaveAttribute("title", "ยังไม่มีเนื้อหาในตอนนี้");
  });

  it("confirms a publish with audience - and warns when the fiction is private", async () => {
    const one = chapter({ title: "พร้อมปล่อย", word_count: 900, content_ready: true });
    publishChapter.mockResolvedValue(one);
    renderManager({ chapters: [one], visibility: "private" });

    fireEvent.click(screen.getByRole("button", { name: "เผยแพร่" }));
    expect(publishChapter).not.toHaveBeenCalled();
    expect(screen.getByText(/ยังไม่มีใคร - เรื่องยังเป็นส่วนตัว/)).toBeInTheDocument();
    expect(screen.getByText(/จึงยังไม่มีใครเห็น/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ยืนยันเผยแพร่" }));
    await waitFor(() =>
      expect(publishChapter).toHaveBeenCalledWith("my-fiction", one.slug),
    );
  });

  it("warns - without blocking - when a prose chapter is only a few words", () => {
    const tiny = chapter({ title: "สั้นมาก", word_count: 4, content_ready: true });
    renderManager({ chapters: [tiny], visibility: "public" });

    fireEvent.click(screen.getByRole("button", { name: "เผยแพร่" }));
    expect(screen.getByText(/ตอนนี้มีแค่ 4 คำ/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ยืนยันเผยแพร่" })).toBeEnabled();
  });

  it("runs the advisory precheck in the publish confirmation (13Y §11)", async () => {
    const one = chapter({ title: "รอบสุดท้าย", word_count: 900, content_ready: true });
    precheckChapter.mockResolvedValue({
      spell: [],
      spell_count: 1,
      issue_count: 2,
      checked_runes: 900,
      character: { total: 2, checkable: 2, skipped: [], issues: [{}] },
      continuity: { checked: false, issues: [] },
    });
    renderManager({ chapters: [one], visibility: "public" });

    fireEvent.click(screen.getByRole("button", { name: "เผยแพร่" }));
    await waitFor(() => expect(precheckChapter).toHaveBeenCalledWith("my-fiction", one.id));
    expect(
      await screen.findByText(/พบ 2 จุดที่ควรดู: คำผิด 1 · ตัวละครอาจหลุด 1/),
    ).toBeInTheDocument();
    // Advisory: the publish button stays live either way.
    expect(screen.getByRole("button", { name: "ยืนยันเผยแพร่" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "ดูก่อนเผยแพร่" })).toBeInTheDocument();
  });

  it("offers ตั้งเวลา inside the publish confirmation", async () => {
    const one = chapter({ title: "ไว้ค่อยปล่อย", word_count: 500, content_ready: true });
    updateChapter.mockResolvedValue(one);
    renderManager({ chapters: [one], visibility: "public" });

    fireEvent.click(screen.getByRole("button", { name: "เผยแพร่" }));
    fireEvent.click(screen.getByLabelText("ตั้งเวลา"));
    fireEvent.change(screen.getByLabelText("เวลาเผยแพร่"), {
      target: { value: "2026-09-01T18:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันตั้งเวลา" }));

    await waitFor(() =>
      expect(updateChapter).toHaveBeenCalledWith(
        "my-fiction",
        one.slug,
        expect.objectContaining({ status: "scheduled" }),
      ),
    );
  });

  it("confirms an unpublish with its consequences", async () => {
    const live = chapter({
      title: "ถอนได้",
      word_count: 100,
      content_ready: true,
      status: "published",
    });
    unpublishChapter.mockResolvedValue(live);
    renderManager({ chapters: [live] });

    fireEvent.click(screen.getByRole("button", { name: "ถอนออก" }));
    expect(unpublishChapter).not.toHaveBeenCalled();
    expect(screen.getByText(/ลิงก์เดิมจะเข้าไม่ได้/)).toBeInTheDocument();
    expect(screen.getByText(/คอมเมนต์ที่มีอยู่จะถูกซ่อนไว้ \(ไม่ลบ\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ยืนยันถอนออก" }));
    await waitFor(() =>
      expect(unpublishChapter).toHaveBeenCalledWith("my-fiction", live.slug),
    );
  });
});

describe("the meta line (#3, #4, #5, #6, #7)", () => {
  it("always leads with the mode - even for a chapter that follows the fiction", () => {
    renderManager({
      chapters: [
        chapter({ title: "ตามเรื่อง", presentation_format: null, active_format: "headcanon" }),
      ],
    });
    // เฮดแคนอน in Thai (#6), first on the meta line, and the empty state is
    // said exactly once (#4).
    expect(screen.getByText(/เฮดแคนอน · ยังไม่มีเนื้อหา · แก้ไข/)).toBeInTheDocument();
    expect(screen.queryByText(/Headcanon/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ยังไม่มีเนื้อหาในรูปแบบที่แสดงผล/)).not.toBeInTheDocument();
  });

  it("states quantity in the mode's own unit", () => {
    renderManager({
      chapters: [
        chapter({ title: "ร้อยแก้ว", word_count: 3012, content_ready: true }),
        chapter({
          title: "แชท",
          active_format: "chat",
          message_count: 48,
          content_ready: true,
        }),
        chapter({
          title: "หัวข้อ",
          active_format: "headcanon",
          entry_count: 5,
          content_ready: true,
        }),
      ],
    });
    expect(screen.getByText(/3,012 คำ/)).toBeInTheDocument();
    expect(screen.getByText(/48 ข้อความ/)).toBeInTheDocument();
    expect(screen.getByText(/5 กล่อง/)).toBeInTheDocument();
  });

  it("renders an untitled chapter's fallback name faintly, an authored one solid (#5)", () => {
    renderManager({
      chapters: [
        chapter({ title: "ชื่อที่ตั้งเอง", word_count: 10, content_ready: true }),
        chapter({ title: undefined, chapter_number: 2 }),
      ],
    });

    const authored = screen.getByText("ชื่อที่ตั้งเอง");
    expect(authored.className).toContain("font-medium");
    const fallback = screen.getByText("ตอนที่ 2");
    expect(fallback.className).toContain("italic");
    expect(fallback.className).toContain("text-text-muted");
  });

  it("separates published rows from drafts at a glance (#7)", () => {
    renderManager({
      chapters: [
        chapter({
          title: "ปล่อยแล้ว",
          status: "published",
          word_count: 100,
          content_ready: true,
          published_at: "2026-08-12T10:00:00Z",
        }),
        chapter({ title: "ยังร่าง" }),
      ],
    });

    const publishedRow = screen.getByText("ปล่อยแล้ว").closest("li") as HTMLElement;
    expect(publishedRow.className).toContain("border-s-success");
    const draftRow = screen.getByText("ยังร่าง").closest("li") as HTMLElement;
    expect(draftRow.className).toContain("border-s-transparent");

    // The status is a chip with a background, and the published row also
    // shows WHEN readers got it - not just the writer's own edit time.
    expect(screen.getByText("เผยแพร่แล้ว").className).toContain("bg-success/10");
    expect(screen.getByText(/· เผยแพร่ /)).toBeInTheDocument();
  });

  it("flags a content-bearing draft that sat for over a week as ร่างค้าง", () => {
    renderManager({
      chapters: [
        chapter({
          title: "ค้างนาน",
          word_count: 500,
          content_ready: true,
          updated_at: "2026-07-01T00:00:00Z",
        }),
        chapter({ title: "เพิ่งแก้", word_count: 500, content_ready: true }),
      ],
    });
    expect(screen.getAllByText("ร่างค้าง")).toHaveLength(1);
  });
});

describe("the add box (#9, #10, #11, #12)", () => {
  it("collapses to a button when chapters exist, opens as the empty state when none do", () => {
    const { unmount } = renderManager({ chapters: [chapter()] });
    expect(screen.queryByText(/ตอนนี้จะเขียนในโหมดไหน/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /เพิ่มตอนใหม่/ })).toBeInTheDocument();
    unmount();

    renderManager({ chapters: [] });
    expect(screen.getByText(/ตอนนี้จะเขียนในโหมดไหน/)).toBeInTheDocument();
  });

  it("computes the number and hides the input behind แก้เลขตอน (#9)", () => {
    renderManager({ chapters: [] });

    expect(screen.queryByLabelText("เลขตอน")).not.toBeInTheDocument();
    expect(screen.getByText("ตอนที่ 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "แก้เลขตอน" }));
    expect(screen.getByLabelText("เลขตอน")).toBeInTheDocument();
    // The collision behaviour is stated BEFORE it can happen.
    expect(screen.getByText(/ระบบจะไม่สร้างทับและไม่เลื่อนตอนอื่น/)).toBeInTheDocument();
  });

  it("shows the fiction's unit as text with a link to change it, not a dropdown (#10)", () => {
    renderManager({ chapters: [] });
    expect(screen.queryByLabelText("เรียกว่า")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "เปลี่ยนคำเรียกของเรื่องนี้" }).getAttribute("href"),
    ).toContain("/settings");
  });

  it("preselects the mode passed from the last-created chapter (#11)", () => {
    renderManager({ chapters: [], defaultFormat: "headcanon" });
    expect(
      document.querySelector('input[name="chapter_format"][value="headcanon"]'),
    ).toBeChecked();
  });
});

describe("scale: tabs, selection, reorder", () => {
  it("shows status tabs with counts and a mode filter for a mixed fiction", () => {
    renderManager({
      chapters: [
        chapter({ title: "หนึ่ง", status: "published", word_count: 10, content_ready: true }),
        chapter({ title: "สอง" }),
        chapter({ title: "สาม", active_format: "chat" }),
      ],
    });

    expect(screen.getByRole("tab", { name: "ทั้งหมด (3)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "เผยแพร่แล้ว (1)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "ร่าง (2)" })).toBeInTheDocument();
    // Mixed modes get their own filter chips, with counts.
    expect(screen.getByRole("button", { name: "ร้อยแก้ว 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "แชทล้วน 1" })).toBeInTheDocument();

    // Tab state lands in the URL, so finishing an edit comes back here.
    fireEvent.click(screen.getByRole("tab", { name: "เผยแพร่แล้ว (1)" }));
    expect(replace).toHaveBeenCalledWith(
      "/studio/novels/my-fiction/chapters?tab=published",
      { scroll: false },
    );
  });

  it("tells the truth on a filtered-empty tab and offers the other one", () => {
    urlParams = new URLSearchParams("tab=published");
    renderManager({ chapters: [chapter({ title: "ร่างเดียว" })] });

    expect(screen.getByText("ยังไม่มีตอนที่เผยแพร่")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ดูฉบับร่าง \(1\)/ })).toBeInTheDocument();
  });

  it("selects, then bulk-publishes with a single summary that skips empty chapters", async () => {
    const ready = chapter({ title: "พร้อม", word_count: 100, content_ready: true });
    const empty = chapter({ title: "ว่าง" });
    publishChapter.mockResolvedValue(ready);
    renderManager({ chapters: [ready, empty], visibility: "public" });

    fireEvent.click(screen.getByLabelText("เลือกทั้งหมดที่แสดง"));
    expect(screen.getByText("เลือก 2 ตอน")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "เผยแพร่ที่เลือก" }));
    expect(screen.getByText(/จะข้าม 1 ตอนที่ยังไม่มีเนื้อหา/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ยืนยันเผยแพร่" }));
    await waitFor(() => expect(publishChapter).toHaveBeenCalledTimes(1));
    expect(publishChapter).toHaveBeenCalledWith("my-fiction", ready.slug);
  });

  it("offers the one-click cleanup of empty drafts", () => {
    renderManager({
      chapters: [
        chapter({ title: "มีของ", word_count: 10, content_ready: true }),
        chapter({ title: "เปล่าหนึ่ง" }),
        chapter({ title: "เปล่าสอง" }),
      ],
    });

    fireEvent.click(
      screen.getByRole("button", { name: "เลือกร่างที่ไม่มีเนื้อหาทั้งหมด (2)" }),
    );
    expect(screen.getByText("เลือก 2 ตอน")).toBeInTheDocument();
  });

  it("reorders by drag, renumbers, and can undo (addition)", async () => {
    const chaptersList = [
      chapter({ title: "หนึ่ง", status: "published", word_count: 5, content_ready: true }),
      chapter({ title: "สอง", word_count: 5, content_ready: true }),
      chapter({ title: "สาม", word_count: 5, content_ready: true }),
    ];
    reorderChapters.mockResolvedValue([]);
    renderManager({ chapters: chaptersList });

    const rows = screen.getAllByRole("listitem");
    fireEvent.dragStart(rows[0], { dataTransfer: { effectAllowed: "" } });
    fireEvent.dragOver(rows[2], { dataTransfer: {} });
    fireEvent.drop(rows[2], { dataTransfer: {} });

    await waitFor(() =>
      expect(reorderChapters).toHaveBeenCalledWith("my-fiction", [
        chaptersList[1].id,
        chaptersList[2].id,
        chaptersList[0].id,
      ]),
    );

    // The notice states the renumber, warns that readers' order moved (a
    // published chapter travelled), and can undo to the previous order.
    expect(await screen.findByText(/เรียงลำดับใหม่แล้ว/)).toBeInTheDocument();
    expect(screen.getByText(/ลำดับที่ผู้อ่านเห็นเปลี่ยนแล้วทันที/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ย้อนกลับ" }));
    await waitFor(() =>
      expect(reorderChapters).toHaveBeenLastCalledWith("my-fiction", [
        chaptersList[0].id,
        chaptersList[1].id,
        chaptersList[2].id,
      ]),
    );
  });

  it("keeps a keyboard path: ย้ายขึ้น / ย้ายลง in the menu", async () => {
    const chaptersList = [
      chapter({ title: "บน", word_count: 5, content_ready: true }),
      chapter({ title: "ล่าง", word_count: 5, content_ready: true }),
    ];
    reorderChapters.mockResolvedValue([]);
    renderManager({ chapters: chaptersList });

    openMenu(/เมนูของ ล่าง/);
    fireEvent.click(screen.getByRole("menuitem", { name: "ย้ายขึ้น" }));

    await waitFor(() =>
      expect(reorderChapters).toHaveBeenCalledWith("my-fiction", [
        chaptersList[1].id,
        chaptersList[0].id,
      ]),
    );
  });
});
