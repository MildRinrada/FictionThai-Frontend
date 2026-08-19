import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PresentationFormat } from "@/types/fiction";
import { ContentFormat, type Chapter } from "@/types/novel";

/**
 * The editor's navigation and its status strip (docs/EDITOR.md).
 *
 * What these tests defend, on a chapter shaped like the ones this was built
 * against: the outline finds the writer's own headings (a bold line after a
 * rule, which is how the format is actually written), each row states how much
 * is under it and how many findings are still pending THERE, and the strip that
 * never scrolls away tells the truth about whether the work is saved.
 */

const updateChapter = vi.fn();
const publishChapter = vi.fn();
const unpublishChapter = vi.fn();
const refresh = vi.fn();

const checkText = vi.fn();
const checkCharacters = vi.fn();
const checkContinuity = vi.fn();
const getAiPrefs = vi.fn();
const convertChat = vi.fn();

vi.mock("@/lib/novels-client", () => ({
  updateChapter: (...args: unknown[]) => updateChapter(...args),
  publishChapter: (...args: unknown[]) => publishChapter(...args),
  unpublishChapter: (...args: unknown[]) => unpublishChapter(...args),
}));

vi.mock("@/lib/media-client", () => ({ uploadMedia: vi.fn() }));

vi.mock("@/lib/ai-client", () => ({
  checkText: (...args: unknown[]) => checkText(...args),
  checkCharacters: (...args: unknown[]) => checkCharacters(...args),
  checkContinuity: (...args: unknown[]) => checkContinuity(...args),
  getAiPrefs: (...args: unknown[]) => getAiPrefs(...args),
  convertChat: (...args: unknown[]) => convertChat(...args),
  setAiPrefs: vi.fn(),
  muteSuggestion: vi.fn(),
  addLexiconTerm: vi.fn(),
  setCharacterEvolution: vi.fn(),
  getFacts: vi.fn(),
  saveFacts: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

let ChapterEditor: typeof import("@/features/studio/chapter-editor").ChapterEditor;

/**
 * The manuscript, in the shape the writer's own is in: a rule and a bold name
 * per section, with a bold sound effect inside one of them to make sure the
 * outline does not mistake emphasis for a heading.
 */
const AETHER = "**เอเธอร์ (Aether)**";
const ZHONGLI = "**จงหลี่ (Zhongli)**";
const TYPO = "อนุญาติ";
const CONTENT = [
  AETHER,
  "คุณถอนหายใจ มองเอเธอร์ที่กำลังปาดเหงื่ออยู่ตรงนั้น",
  "_**ตูม!**_",
  "แรงระเบิดทำให้ห้องนั่งเล่นอบอวลไปด้วยฝุ่นคราม",
  "---",
  ZHONGLI,
  `จงหลี่วางถ้วยชาลงอย่างช้า ๆ แล้วขอ${TYPO}จากคุณ`,
].join("\n\n");

beforeEach(async () => {
  ({ ChapterEditor } = await import("@/features/studio/chapter-editor"));
  updateChapter.mockResolvedValue({ active_format: PresentationFormat.Standard });
  getAiPrefs.mockResolvedValue({
    user: null,
    effective: {
      assistant: true,
      spell: true,
      character: false,
      continuity: false,
      polish: true,
    },
  });
  checkText.mockResolvedValue({ suggestions: [] });
  checkCharacters.mockResolvedValue({
    total: 0,
    checkable: 0,
    skipped: [],
    issues: [],
    model_pending: 0,
  });
  checkContinuity.mockResolvedValue({ checked: false, issues: [] });
});

afterEach(() => {
  for (const mock of [
    updateChapter,
    publishChapter,
    unpublishChapter,
    refresh,
    checkText,
    checkCharacters,
    checkContinuity,
    getAiPrefs,
    convertChat,
  ]) {
    mock.mockReset();
  }
  vi.useRealTimers();
});

function chapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: "c1",
    novel_id: "n1",
    chapter_number: 2,
    slug: "one-shot",
    status: "draft",
    word_count: 0,
    presentation_format: null,
    active_format: PresentationFormat.Standard,
    content_ready: true,
    message_count: 0,
    entry_count: 0,
    content_format: ContentFormat.Markdown,
    content: CONTENT,
    messages: null,
    entries: null,
    entry_fields: [],
    is_owner: true,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function renderEditor(overrides: Partial<Chapter> = {}) {
  return render(<ChapterEditor novelRef="my-novel" chapter={chapter(overrides)} />);
}

/**
 * The outline waits for a pause (OUTLINE_IDLE_MS) and the assistant for a
 * longer one; the microtask flush first is the panel's preferences load, which
 * is what schedules the check at all.
 */
async function settleOutline(ms = 500) {
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** The rail and the narrow-window disclosure hold the same list; take one. */
function outline() {
  return within(screen.getAllByRole("navigation", { name: "สารบัญในตอนนี้" })[0]);
}

describe("the chapter outline", () => {
  it("lists the writer's own headings - a bold line after a rule - and not the bangs", async () => {
    vi.useFakeTimers();
    renderEditor();
    await settleOutline();

    const rows = outline().getAllByRole("button");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("เอเธอร์ (Aether)"),
      expect.stringContaining("จงหลี่ (Zhongli)"),
    ]);
    // "ตูม!" is a whole-bold paragraph too, and it is emphasis in the middle of
    // a scene rather than a section: it follows prose, not a separator.
    expect(outline().queryByText(/ตูม/)).not.toBeInTheDocument();
  });

  it("says how much is under each heading, and marks the one being pressed", async () => {
    vi.useFakeTimers();
    renderEditor();
    await settleOutline();

    const zhongli = outline().getByRole("button", { name: /จงหลี่/ });
    expect(zhongli.textContent).toMatch(/\d+ คำ/);

    fireEvent.click(zhongli);
    expect(outline().getByRole("button", { name: /จงหลี่/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("counts the assistant's pending findings under the heading they fall in", async () => {
    vi.useFakeTimers();
    // One misspelling, in the second section - the panel can say "1 จุด", but
    // only the outline can say WHERE.
    checkText.mockResolvedValue({
      suggestions: [
        {
          type: "spelling",
          start: CONTENT.indexOf(TYPO),
          end: CONTENT.indexOf(TYPO) + TYPO.length,
          original: TYPO,
          suggestions: ["อนุญาต"],
          confidence: 0.9,
          severity: "high",
          explanation: "สะกดผิด",
        },
      ],
    });
    renderEditor();
    await settleOutline(2200);

    expect(checkText).toHaveBeenCalled();
    expect(outline().getByRole("button", { name: /จงหลี่/ }).textContent).toMatch(
      /1 จุด/,
    );
    expect(outline().getByRole("button", { name: /เอเธอร์/ }).textContent).not.toMatch(
      /จุด/,
    );
    // And the strip that never scrolls away carries the total.
    expect(screen.getByText("1 จุดที่เสนอไว้")).toBeInTheDocument();
  });

  it("offers nothing to navigate when the chapter has no headings", async () => {
    vi.useFakeTimers();
    renderEditor({ content: "ย่อหน้าหนึ่ง\n\nย่อหน้าสอง" });
    await settleOutline();

    expect(screen.getByText(/ตอนนี้ยังไม่มีหัวข้อ/)).toBeInTheDocument();
  });
});

describe("the chat draft of a prose chapter (editor review 2026-08)", () => {
  const CONVERSION = {
    conversion_status: "success",
    characters: [{ speaker_id: "char-1", name: "เอเธอร์ (Aether)" }],
    blocks: [
      {
        id: "block_001",
        type: "dialogue",
        speaker_id: "char-1",
        text: "อย่าเพิ่งไปนะ",
        confidence: "high",
        needs_review: false,
      },
    ],
    review_items: [],
  };

  it("converts ON the press and opens the result in the chat-only composer", async () => {
    vi.useFakeTimers();
    convertChat.mockResolvedValue(CONVERSION);
    renderEditor();
    await settleOutline();

    // The press converts - a blank form would break the button's promise.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "แปลงเป็นร่างแชท" }));
      await Promise.resolve();
    });
    expect(convertChat).toHaveBeenCalledWith("my-novel", expect.stringContaining("เอเธอร์"));

    // The SAME chat surface the chat-only mode uses, already filled: the
    // result renders as bubbles, and the speaker joins the strip.
    expect(screen.getByLabelText("พิมพ์ข้อความ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "อย่าเพิ่งไปนะ" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /เอเธอร์/ }).length).toBeGreaterThan(0);
    // …with its limits said before the first edit.
    expect(screen.getByText(/ร่างแชทของตอนร้อยแก้ว/)).toBeInTheDocument();
    // The prose surface stands aside while the draft is open.
    expect(screen.queryByLabelText("เนื้อหาตอน")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "กลับไปแก้ร้อยแก้ว" }));
    expect(screen.getByLabelText("เนื้อหาตอน")).toBeInTheDocument();
  });

  it("re-converts only after the replacement is confirmed in so many words", async () => {
    vi.useFakeTimers();
    convertChat.mockResolvedValue(CONVERSION);
    renderEditor();
    await settleOutline();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "แปลงเป็นร่างแชท" }));
      await Promise.resolve();
    });
    expect(convertChat).toHaveBeenCalledTimes(1);

    // Asking again warns that THIS draft dies with the press…
    fireEvent.click(screen.getByRole("button", { name: /แปลงจากร้อยแก้วอีกครั้ง/ }));
    expect(screen.getByText(/จะหายไปและถูกแทนที่ด้วยผลแปลงใหม่/)).toBeInTheDocument();
    expect(convertChat).toHaveBeenCalledTimes(1);

    // …cancelling does nothing…
    fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));
    expect(convertChat).toHaveBeenCalledTimes(1);

    // …and confirming runs the fresh conversion.
    fireEvent.click(screen.getByRole("button", { name: /แปลงจากร้อยแก้วอีกครั้ง/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "ยืนยัน แทนที่ร่างเดิม" }));
      await Promise.resolve();
    });
    expect(convertChat).toHaveBeenCalledTimes(2);
  });
});

describe("the status strip", () => {
  it("states the length, the reading time, and that the work is safe", async () => {
    vi.useFakeTimers();
    renderEditor();
    await settleOutline();

    // All three in ONE row that stays put, rather than scattered around a page
    // the writer has to scroll back up through.
    const strip = screen.getByText(/~\d+ นาที/).closest("p");
    expect(strip?.textContent).toMatch(/\d+ คำ/);
    expect(within(strip as HTMLElement).getByText("บันทึกไว้ครบแล้ว")).toBeInTheDocument();
  });

  it("says so the moment there is something unsaved, and again once it is saved", async () => {
    vi.useFakeTimers();
    renderEditor();
    await settleOutline();

    fireEvent.change(screen.getByLabelText("ชื่อตอน"), {
      target: { value: "ตอนที่แก้แล้ว" },
    });
    // Unsaved INTO THE SYSTEM - the device backup is already written
    // (save-model review 2026-08).
    expect(screen.getByText(/ยังไม่ได้บันทึกลงระบบ/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /บันทึกแบบร่าง/ }));
      await Promise.resolve();
    });
    expect(screen.queryByText(/ยังไม่ได้บันทึกลงระบบ/)).not.toBeInTheDocument();
    // The button itself is the receipt (button review 2026-08): it flips to
    // "บันทึกแล้ว" and stands down until the next edit.
    expect(screen.getByRole("button", { name: "บันทึกแล้ว" })).toBeDisabled();
    // The status line stamps the time; the button says the same word alone.
    expect(screen.getByText(/บันทึกแล้ว \d/)).toBeInTheDocument();
    // The manuscript was not touched by a title change - only the title is sent.
    expect(updateChapter).toHaveBeenCalledWith("my-novel", "one-shot", {
      title: "ตอนที่แก้แล้ว",
      content: undefined,
      messages: undefined,
      entries: undefined,
      entry_fields: undefined,
    });
  });
});
