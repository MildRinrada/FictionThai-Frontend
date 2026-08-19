import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WritingTools } from "@/features/ai/writing-tools";
import type { AiEffectivePrefs, AiInlineSuggestion } from "@/types/ai";

/**
 * เครื่องมือช่วยเขียน (13Y).
 *
 * What these tests defend: the live pass waits for typing to PAUSE, the panel
 * always states its state, the card carries the three trust buttons (ใช้คำนี้
 * / ข้าม / ไม่เตือนแบบนี้อีก) plus the word-bank teach, the quiet mode and the
 * master switch genuinely stop the checks, character findings cite the sheet,
 * and nothing ever edits the manuscript except through the host's callback.
 */

const checkText = vi.fn();
const checkCharacters = vi.fn();
const checkContinuity = vi.fn();
const getAiPrefs = vi.fn();
const setAiPrefs = vi.fn();
const muteSuggestion = vi.fn();
const addLexiconTerm = vi.fn();
const setCharacterEvolution = vi.fn();
const getFacts = vi.fn();
const saveFacts = vi.fn();

vi.mock("@/lib/ai-client", () => ({
  checkText: (...args: unknown[]) => checkText(...args),
  checkCharacters: (...args: unknown[]) => checkCharacters(...args),
  checkContinuity: (...args: unknown[]) => checkContinuity(...args),
  getAiPrefs: (...args: unknown[]) => getAiPrefs(...args),
  setAiPrefs: (...args: unknown[]) => setAiPrefs(...args),
  muteSuggestion: (...args: unknown[]) => muteSuggestion(...args),
  addLexiconTerm: (...args: unknown[]) => addLexiconTerm(...args),
  setCharacterEvolution: (...args: unknown[]) => setCharacterEvolution(...args),
  getFacts: (...args: unknown[]) => getFacts(...args),
  saveFacts: (...args: unknown[]) => saveFacts(...args),
}));

afterEach(() => {
  for (const mock of [
    checkText,
    checkCharacters,
    checkContinuity,
    getAiPrefs,
    setAiPrefs,
    muteSuggestion,
    addLexiconTerm,
    setCharacterEvolution,
    getFacts,
    saveFacts,
  ]) {
    mock.mockReset();
  }
  vi.useRealTimers();
});

const PREFS_ON: AiEffectivePrefs = {
  assistant: true,
  spell: true,
  character: true,
  continuity: false,
  polish: true,
};

function typo(overrides: Partial<AiInlineSuggestion> = {}): AiInlineSuggestion {
  return {
    type: "spelling",
    start: 10,
    end: 17,
    original: "อนุญาติ",
    suggestions: ["อนุญาต"],
    confidence: 0.9,
    severity: "high",
    explanation: '"อนุญาติ" น่าจะสะกดว่า "อนุญาต"',
    ...overrides,
  };
}

function renderTools({
  prefs = PREFS_ON,
  text = "เขาหันมามอง อนุญาติ อีกครั้งอย่างช้า ๆ",
  mode = "standard",
  onApply,
  onLocate,
  onHighlight,
  selected,
  onSelect,
}: {
  prefs?: AiEffectivePrefs;
  text?: string;
  mode?: string;
  onApply?: (original: string, replacement: string) => boolean;
  onLocate?: (original: string) => void;
  onHighlight?: (marks: { text: string; family: string }[]) => void;
  selected?: string | null;
  onSelect?: (key: string) => void;
} = {}) {
  getAiPrefs.mockResolvedValue({ user: null, effective: prefs });
  // The character round rides the same typing pause as the live pass, so it
  // fires in nearly every test - default it to a quiet answer unless the
  // test configured its own.
  if (checkCharacters.getMockImplementation() === undefined) {
    checkCharacters.mockResolvedValue({
      total: 0,
      checkable: 0,
      skipped: [],
      issues: [],
      model_pending: 0,
    });
  }
  return render(
    <WritingTools
      novelRef="my-novel"
      chapterID="ch-1"
      chapterNumber={3}
      mode={mode}
      text={text}
      onApply={onApply}
      onLocate={onLocate}
      onHighlight={onHighlight}
      selected={selected}
      onSelect={onSelect}
    />,
  );
}

/** Flushes the prefs load, then the debounce, then the check's promise. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
  await act(() => vi.advanceTimersByTimeAsync(1600));
}

describe("WritingTools", () => {
  it("states the frame promise and the review rows", async () => {
    vi.useFakeTimers();
    checkText.mockResolvedValue({ suggestions: [] });
    renderTools();
    await settle();

    expect(screen.getByText("เครื่องมือช่วยเขียน")).toBeInTheDocument();
    expect(
      screen.getByText("ทุกเครื่องมือเสนอเป็นข้อเสนอแนะ ไม่แก้งานของคุณเอง"),
    ).toBeInTheDocument();
    expect(screen.getByText("ตรวจคำผิดและไวยากรณ์")).toBeInTheDocument();
    expect(screen.getByText("ตรวจความสอดคล้องของตัวละคร")).toBeInTheDocument();
    expect(screen.getByText("ตรวจความต่อเนื่องของเนื้อเรื่อง")).toBeInTheDocument();
    expect(screen.getByText("เกลาภาษา")).toBeInTheDocument();
    // One vocabulary everywhere (chat-editor review item 6): the chip and the
    // clean rows all say ไม่พบปัญหา.
    expect(screen.getAllByText("ไม่พบปัญหา").length).toBeGreaterThan(0);
  });

  it("checks only after typing pauses, sending the chapter's mode", async () => {
    vi.useFakeTimers();
    checkText.mockResolvedValue({ suggestions: [typo()] });
    renderTools();

    await act(async () => {
      await Promise.resolve();
    });
    // Before the pause elapses, nothing may run (13Y: never mid-word).
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(checkText).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(900));
    expect(checkText).toHaveBeenCalledWith(
      "my-novel",
      "standard",
      expect.stringContaining("อนุญาติ"),
    );
    // In the status chip AND on the family row.
    expect(screen.getAllByText("พบ 1 จุด").length).toBeGreaterThan(0);
  });

  it("carries the three trust buttons and the word-bank teach on the card", async () => {
    vi.useFakeTimers();
    checkText.mockResolvedValue({ suggestions: [typo()] });
    muteSuggestion.mockResolvedValue(undefined);
    renderTools({ onApply: () => true });
    await settle();

    expect(screen.getByRole("button", { name: "ใช้คำนี้" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ข้าม" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ไม่เตือนแบบนี้อีก" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "เพิ่มคำนี้ในคลังของเรื่อง" }),
    ).toBeInTheDocument();

    // "ไม่เตือนแบบนี้อีก" teaches THIS fiction's assistant.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "ไม่เตือนแบบนี้อีก" }));
      await Promise.resolve();
    });
    expect(muteSuggestion).toHaveBeenCalledWith("spelling", "อนุญาติ", "my-novel");
    expect(screen.getAllByText("ไม่พบปัญหา").length).toBeGreaterThan(0);
  });

  it("applies through the host callback only - never by itself", async () => {
    vi.useFakeTimers();
    checkText.mockResolvedValue({ suggestions: [typo()] });
    const onApply = vi.fn(() => true);
    renderTools({ onApply });
    await settle();

    fireEvent.click(screen.getByRole("button", { name: "ใช้คำนี้" }));
    expect(onApply).toHaveBeenCalledWith("อนุญาติ", "อนุญาต");
  });

  it("teaches the word bank from the card", async () => {
    vi.useFakeTimers();
    checkText.mockResolvedValue({ suggestions: [typo()] });
    addLexiconTerm.mockResolvedValue({ custom: [], auto: [] });
    renderTools();
    await settle();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "เพิ่มคำนี้ในคลังของเรื่อง" }));
      await Promise.resolve();
    });
    expect(addLexiconTerm).toHaveBeenCalledWith("my-novel", "อนุญาติ");
  });

  it("โหมดเขียนเงียบ pauses every check and says so", async () => {
    vi.useFakeTimers();
    checkText.mockResolvedValue({ suggestions: [typo()] });
    renderTools();
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByLabelText(/โหมดเขียนเงียบ/));
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(checkText).not.toHaveBeenCalled();
    expect(screen.getByText("โหมดเขียนเงียบ")).toBeInTheDocument();
  });

  it("the master switch turns the panel off - visibly", async () => {
    vi.useFakeTimers();
    renderTools({ prefs: { ...PREFS_ON, assistant: false } });
    await act(async () => {
      await Promise.resolve();
    });
    await act(() => vi.advanceTimersByTimeAsync(2000));

    expect(checkText).not.toHaveBeenCalled();
    expect(screen.getByText("ปิดอยู่")).toBeInTheDocument();
    expect(screen.getByText(/ผู้ช่วยปิดอยู่/)).toBeInTheDocument();
  });

  it("polish is declared out of scope for chat - a voice is not an error", async () => {
    vi.useFakeTimers();
    checkText.mockResolvedValue({ suggestions: [] });
    renderTools({ mode: "chat" });
    await settle();

    expect(screen.getByText("ไม่ใช้ในโหมดนี้")).toBeInTheDocument();
  });

  it("character findings cite the sheet and honour deliberate development", async () => {
    vi.useFakeTimers();
    checkText.mockResolvedValue({ suggestions: [] });
    checkCharacters.mockResolvedValue({
      total: 2,
      checkable: 1,
      skipped: [
        {
          character_id: "c2",
          name: "จงหลี",
          reason: "ยังไม่มีข้อมูลพอในหน้าตัวละคร - เพิ่มนิสัยหรือภูมิหลังเพื่อให้ตรวจได้",
        },
      ],
      issues: [
        {
          character_id: "c1",
          character_name: "คาซึฮะ",
          field: "ลักษณะนิสัย",
          field_value: "เก็บความรู้สึก",
          quote: "คาซึฮะ ตะโกน ใส่คนแปลกหน้า",
          explanation: "«คาซึฮะ» ระบุนิสัย «เก็บความรู้สึก» - อาจไม่ตรงกับที่ตั้งไว้",
          severity: "medium",
        },
      ],
    });
    setCharacterEvolution.mockResolvedValue(undefined);
    renderTools();
    await settle();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ตรวจตัวละคร/ }));
      await Promise.resolve();
    });

    // Honest coverage + the nudge back to the character page.
    expect(screen.getByText(/ตรวจได้ 1 จาก 2 ตัวละคร/)).toBeInTheDocument();
    expect(screen.getByText("เพิ่มข้อมูลเพื่อให้ตรวจได้แม่นขึ้น")).toBeInTheDocument();
    // The citation: the sheet field, linked, and the quoted line.
    expect(screen.getByRole("link", { name: "เก็บความรู้สึก" })).toBeInTheDocument();
    expect(screen.getByText(/คาซึฮะ ตะโกน ใส่คนแปลกหน้า/)).toBeInTheDocument();

    // "ตัวละครเปลี่ยนไปตั้งแต่ตอนนี้" stops the comparison from THIS chapter.
    checkCharacters.mockResolvedValue({ total: 2, checkable: 1, skipped: [], issues: [] });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /ตัวละครเปลี่ยนไปตั้งแต่ตอนนี้/ }),
      );
      await Promise.resolve();
    });
    expect(setCharacterEvolution).toHaveBeenCalledWith("my-novel", "c1", 3);
  });

  it("never says ไม่พบปัญหา for a character check that could check nobody", async () => {
    // Item 6 of the chat-editor review: "ผ่าน" beside "ตรวจได้ 0 จาก 5" was
    // the panel contradicting itself.
    vi.useFakeTimers();
    checkText.mockResolvedValue({ suggestions: [] });
    checkCharacters.mockResolvedValue({
      total: 5,
      checkable: 0,
      skipped: [
        {
          character_id: "c1",
          name: "จงหลี",
          reason: "ยังไม่มีข้อมูลพอในหน้าตัวละคร - เพิ่มนิสัยหรือภูมิหลังเพื่อให้ตรวจได้",
        },
      ],
      issues: [],
    });
    renderTools();
    await settle();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ตรวจตัวละคร/ }));
      await Promise.resolve();
    });

    expect(screen.getAllByText("ตรวจไม่ได้").length).toBeGreaterThan(0);
    expect(screen.getByText(/ตัวละครยังไม่มีข้อมูล \(0\/5\)/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /ไปเพิ่มข้อมูลตัวละคร/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("ไม่พบจุดที่อาจไม่สอดคล้อง")).not.toBeInTheDocument();
  });

  it("the continuity button enables the switch itself instead of describing it", async () => {
    vi.useFakeTimers();
    checkText.mockResolvedValue({ suggestions: [] });
    setAiPrefs.mockResolvedValue({
      user: null,
      effective: { ...PREFS_ON, continuity: true },
    });
    checkContinuity.mockResolvedValue({ checked: false, issues: [] });
    renderTools(); // continuity off in PREFS_ON
    await settle();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "เปิดการตรวจความต่อเนื่อง" }));
      await Promise.resolve();
    });

    // One press: the preference flips on and the first check runs.
    expect(setAiPrefs).toHaveBeenCalledWith({ continuity: true }, "my-novel");
    expect(checkContinuity).toHaveBeenCalled();
  });

  it("opens the fact book and saves labelled rows only", async () => {
    vi.useFakeTimers();
    checkText.mockResolvedValue({ suggestions: [] });
    getFacts.mockResolvedValue([{ label: "ดาบ", value: "หายไป" }]);
    saveFacts.mockResolvedValue([{ label: "ดาบ", value: "หายไป" }]);
    renderTools();
    await settle();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "เปิดสมุดข้อเท็จจริงของตอนนี้" }));
      await Promise.resolve();
    });
    expect(getFacts).toHaveBeenCalledWith("my-novel", "ch-1");
    expect(screen.getByDisplayValue("ดาบ")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "+ เพิ่มข้อเท็จจริง" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));
      await Promise.resolve();
    });
    // The blank row the writer never filled is not sent.
    expect(saveFacts).toHaveBeenCalledWith("my-novel", "ch-1", [
      { label: "ดาบ", value: "หายไป" },
    ]);
  });

  it("keeps following up while the model tier reports queued lines, then stops", async () => {
    vi.useFakeTimers();
    checkText.mockResolvedValue({ suggestions: [] });
    // The sidecar scores asynchronously: the first two answers say lines are
    // still queued; the third carries the late finding and an empty queue.
    checkCharacters
      .mockResolvedValueOnce({
        total: 1, checkable: 1, skipped: [], issues: [], model_pending: 9,
      })
      .mockResolvedValueOnce({
        total: 1, checkable: 1, skipped: [], issues: [], model_pending: 3,
      })
      .mockResolvedValue({
        total: 1,
        checkable: 1,
        skipped: [],
        issues: [
          {
            character_id: "c1",
            character_name: "จงหลี่ (Zhongli)",
            field: "โปรไฟล์ตัวละคร",
            field_value: "มีนิสัยสุภาพ สุขุม รอบรู้",
            quote: "จงหลี่หัวเราะออกมาเสียงดังจนแทบสำลักชา",
            explanation:
              "«จงหลี่ (Zhongli)» - โมเดลภาษาเห็นว่าบรรทัดนี้อาจขัดกับนิสัยที่ตั้งไว้ (ความขัดแย้ง 93%)",
            severity: "medium",
          },
        ],
        model_pending: 0,
      });
    renderTools();
    await settle();

    // Round 1 answered with a 9-line queue - the panel says so and re-asks.
    expect(checkCharacters).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/โมเดลภาษากำลังอ่านอีก 9 บรรทัด/)).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(checkCharacters).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/โมเดลภาษากำลังอ่านอีก 3 บรรทัด/)).toBeInTheDocument();

    // Round 3 delivers the late finding; the queue is empty.
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(checkCharacters).toHaveBeenCalledTimes(3);
    expect(screen.getByText(/ความขัดแย้ง 93%/)).toBeInTheDocument();
    expect(screen.queryByText(/โมเดลภาษากำลังอ่านอีก/)).not.toBeInTheDocument();

    // Empty queue = no more polling, however long the writer sits still.
    await act(() => vi.advanceTimersByTimeAsync(120_000));
    expect(checkCharacters).toHaveBeenCalledTimes(3);
  });

  it("runs the character round by itself when the panel opens - no hidden button hunt", async () => {
    vi.useFakeTimers();
    checkText.mockResolvedValue({ suggestions: [] });
    checkCharacters.mockResolvedValue({ total: 1, checkable: 1, skipped: [], issues: [] });
    renderTools();
    await settle();

    expect(checkCharacters).toHaveBeenCalledWith(
      "my-novel",
      3,
      "เขาหันมามอง อนุญาติ อีกครั้งอย่างช้า ๆ",
    );
    expect(screen.getByText("ตรวจได้ 1 จาก 1 ตัวละคร")).toBeInTheDocument();
  });

  it("each ตรวจทาน row carries its own switch, writing the fiction's tier", async () => {
    vi.useFakeTimers();
    checkText.mockResolvedValue({ suggestions: [] });
    checkCharacters.mockResolvedValue({ total: 0, checkable: 0, skipped: [], issues: [] });
    checkContinuity.mockResolvedValue({ checked: false, issues: [] });
    setAiPrefs.mockResolvedValue({
      user: null,
      effective: { ...PREFS_ON, continuity: true },
    });
    renderTools();
    await settle();

    // Continuity starts OFF (its documented default) - the switch is right in
    // the row, so turning it on never requires leaving the editor.
    const row = screen.getByRole("switch", {
      name: "เปิดปิดตรวจความต่อเนื่องของเนื้อเรื่อง",
    });
    expect(row).not.toBeChecked();
    await act(async () => {
      fireEvent.click(row);
      await Promise.resolve();
    });
    expect(setAiPrefs).toHaveBeenCalledWith({ continuity: true }, "my-novel");
    // Turning the tool on runs it, so the row shows a verdict, not "–".
    expect(checkContinuity).toHaveBeenCalledWith("my-novel", "ch-1");
  });

  it("clicking a ตรวจทาน row warps straight to that family's spot - the row IS the jump", async () => {
    vi.useFakeTimers();
    const onLocate = vi.fn();
    checkText.mockResolvedValue({ suggestions: [typo()] });
    checkCharacters.mockResolvedValue({
      total: 1,
      checkable: 1,
      skipped: [],
      issues: [
        {
          character_id: "c1",
          character_name: "จงหลี",
          field: "ลักษณะนิสัย",
          field_value: "สุขุม",
          quote: "สวัสดีจ้า ทุกคน",
          explanation: "…",
          severity: "medium",
        },
      ],
    });
    renderTools({ onLocate });
    await settle();

    fireEvent.click(screen.getByRole("button", { name: "ตรวจคำผิดและไวยากรณ์" }));
    expect(onLocate).toHaveBeenLastCalledWith("อนุญาติ");

    fireEvent.click(
      screen.getByRole("button", { name: "ตรวจความสอดคล้องของตัวละคร" }),
    );
    expect(onLocate).toHaveBeenLastCalledWith("สวัสดีจ้า ทุกคน");
  });

  it("groups the findings, counts each pile, and leaves เกลาภาษา folded away", async () => {
    vi.useFakeTimers();
    checkText.mockResolvedValue({
      suggestions: [
        typo({ start: 40, original: "อนุญาติ" }),
        typo({ start: 60, original: "กระเพรา", suggestions: ["กะเพรา"] }),
        typo({ type: "polish", start: 10, original: "อย่างมาก", suggestions: ["มาก"] }),
        typo({ type: "repetition", start: 20, original: "แล้วก็", suggestions: [] }),
      ],
    });
    renderTools();
    await settle();

    // The counts are readable before anything is opened - which is the whole
    // point of grouping a list nobody was going to scroll.
    const spelling = screen.getByRole("button", { name: "คำผิดและวรรคตอน 2 จุด" });
    const polish = screen.getByRole("button", { name: "เกลาภาษา 2 จุด" });
    expect(spelling).toHaveAttribute("aria-expanded", "true");
    expect(polish).toHaveAttribute("aria-expanded", "false");

    // เกลาภาษา opens on request, and closes again.
    fireEvent.click(polish);
    expect(screen.getByRole("button", { name: "เกลาภาษา 2 จุด" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("orders a group by position in the manuscript, not by severity", async () => {
    vi.useFakeTimers();
    checkText.mockResolvedValue({
      suggestions: [
        typo({ start: 900, original: "ท้ายเรื่อง" }),
        typo({ start: 10, original: "ต้นเรื่อง" }),
        typo({ start: 400, original: "กลางเรื่อง" }),
      ],
    });
    renderTools();
    await settle();

    // A writer revises top to bottom; a list sorted by how bad each finding is
    // would send them jumping around their own chapter.
    const rows = screen
      .getAllByRole("listitem")
      .map((node) => node.textContent ?? "")
      .filter((text) => /(ต้น|กลาง|ท้าย)เรื่อง/.test(text));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain("ต้นเรื่อง");
    expect(rows[1]).toContain("กลางเรื่อง");
    expect(rows[2]).toContain("ท้ายเรื่อง");
  });

  it("ยอมรับทั้งหมด belongs to the spelling pile alone", async () => {
    vi.useFakeTimers();
    const onApply = vi.fn(() => true);
    checkText.mockResolvedValue({
      suggestions: [
        typo({ start: 10, original: "อนุญาติ", suggestions: ["อนุญาต"] }),
        typo({ start: 30, original: "กระเพรา", suggestions: ["กะเพรา"] }),
        typo({ type: "polish", start: 50, original: "อย่างมาก", suggestions: ["มาก"] }),
        typo({ type: "polish", start: 70, original: "อย่างยิ่ง", suggestions: ["ยิ่ง"] }),
      ],
    });
    renderTools({ onApply });
    await settle();

    // เกลาภาษา is opened by hand, and still has no bulk button: those are
    // opinions about an author's voice, not typos with one right answer.
    fireEvent.click(screen.getByRole("button", { name: "เกลาภาษา 2 จุด" }));
    expect(screen.getAllByRole("button", { name: /ยอมรับทั้งหมด/ })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "ยอมรับทั้งหมด 2 จุด" }));
    expect(onApply).toHaveBeenCalledTimes(2);
    expect(onApply).toHaveBeenNthCalledWith(1, "อนุญาติ", "อนุญาต");
    expect(onApply).toHaveBeenNthCalledWith(2, "กระเพรา", "กะเพรา");
    // Applied means dealt with: the pile is empty, and it says so.
    expect(screen.queryByRole("button", { name: /^คำผิดและวรรคตอน/ })).not.toBeInTheDocument();
    expect(screen.getByText(/แก้ให้แล้ว 2 จุด/)).toBeInTheDocument();
  });

  it("a finding picked in the manuscript is the one the panel opens", async () => {
    vi.useFakeTimers();
    checkText.mockResolvedValue({
      suggestions: [
        typo({ start: 10, original: "อนุญาติ", suggestions: ["อนุญาต"] }),
        // In เกลาภาษา, which is folded away by default.
        typo({
          type: "polish",
          start: 50,
          original: "อย่างมาก",
          suggestions: ["มาก"],
          explanation: "ตัดคำขยายที่ไม่ได้เพิ่มความหมาย",
        }),
      ],
    });
    const { rerender } = renderTools();
    await settle();

    expect(screen.queryByText("ตัดคำขยายที่ไม่ได้เพิ่มความหมาย")).not.toBeInTheDocument();

    // The host says which finding was clicked in the text; the panel opens its
    // group and its card, so the two surfaces are looking at one thing.
    rerender(
      <WritingTools
        novelRef="my-novel"
        chapterID="ch-1"
        chapterNumber={3}
        mode="standard"
        text="เขาหันมามอง อนุญาติ อีกครั้งอย่างช้า ๆ"
        selected="polish:อย่างมาก"
      />,
    );
    expect(screen.getByRole("button", { name: "เกลาภาษา 1 จุด" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText("ตัดคำขยายที่ไม่ได้เพิ่มความหมาย")).toBeInTheDocument();
  });

  it("the list can be put away for quiet writing, and the count stays", async () => {
    vi.useFakeTimers();
    checkText.mockResolvedValue({ suggestions: [typo()] });
    renderTools();
    await settle();

    fireEvent.click(screen.getByRole("button", { name: "ซ่อนรายการ" }));
    expect(screen.queryByRole("button", { name: /^คำผิดและวรรคตอน/ })).not.toBeInTheDocument();
    // Hiding the list is not silencing the assistant: the tally is still there,
    // and the checks are still running.
    expect(screen.getByText("1 จุดในตอนนี้")).toBeInTheDocument();
    expect(screen.getAllByText("พบ 1 จุด").length).toBeGreaterThan(0);
  });

  it("publishes findings as manuscript marks, and quiet mode blanks them", async () => {
    vi.useFakeTimers();
    const onHighlight = vi.fn();
    checkText.mockResolvedValue({ suggestions: [typo()] });
    checkCharacters.mockResolvedValue({ total: 0, checkable: 0, skipped: [], issues: [] });
    renderTools({ onHighlight });
    await settle();

    expect(onHighlight).toHaveBeenCalledWith([
      expect.objectContaining({
        text: "อนุญาติ",
        family: "error",
        suggestion: "อนุญาต",
      }),
    ]);

    // Quiet mode must blank the manuscript too - "พักการเตือนทั้งหมด" includes
    // the underlines, not just the panel.
    fireEvent.click(screen.getByLabelText(/โหมดเขียนเงียบ/));
    expect(onHighlight).toHaveBeenLastCalledWith([]);
  });
});
