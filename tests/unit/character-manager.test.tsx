import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CharacterManager } from "@/features/studio/character-manager";
import type { Character } from "@/types/character";
import type { ChapterSummary } from "@/types/novel";

/**
 * The cast editor's studio round.
 *
 * What these tests defend: edits autosave (collapsing a card cannot lose
 * work), the destructive action sits in its own confirmed zone, duplicate
 * names are refused before a request is made, and the page keeps its two
 * promises - a real timeline and a real "what the reader sees" preview.
 */

const createCharacter = vi.fn();
const updateCharacter = vi.fn();
const deleteCharacter = vi.fn();
const reorderCharacters = vi.fn();
const setCharacterAppearances = vi.fn();
const uploadMedia = vi.fn();

vi.mock("@/lib/characters-client", () => ({
  createCharacter: (...args: unknown[]) => createCharacter(...args),
  updateCharacter: (...args: unknown[]) => updateCharacter(...args),
  deleteCharacter: (...args: unknown[]) => deleteCharacter(...args),
  reorderCharacters: (...args: unknown[]) => reorderCharacters(...args),
  setCharacterAppearances: (...args: unknown[]) => setCharacterAppearances(...args),
}));

vi.mock("@/lib/media-client", () => ({
  uploadMedia: (...args: unknown[]) => uploadMedia(...args),
}));

afterEach(() => {
  createCharacter.mockReset();
  updateCharacter.mockReset();
  deleteCharacter.mockReset();
  reorderCharacters.mockReset();
  setCharacterAppearances.mockReset();
  uploadMedia.mockReset();
  vi.useRealTimers();
});

let sequence = 0;

function member(overrides: Partial<Character> = {}): Character {
  sequence += 1;
  return {
    id: `char-${sequence}`,
    novel_id: "novel-1",
    name: `ตัวละคร ${sequence}`,
    traits: [],
    details: [],
    position: sequence,
    created_at: "2026-08-13T00:00:00Z",
    updated_at: "2026-08-13T00:00:00Z",
    ...overrides,
  };
}

function chapter(overrides: Partial<ChapterSummary> = {}): ChapterSummary {
  sequence += 1;
  return {
    id: `ch-${sequence}`,
    chapter_number: sequence,
    slug: `ch-${sequence}`,
    status: "published",
    word_count: 100,
    message_count: 0,
    entry_count: 0,
    presentation_format: null,
    active_format: "standard",
    content_ready: true,
    content_format: "plain",
    created_at: "2026-08-13T00:00:00Z",
    updated_at: "2026-08-13T00:00:00Z",
    ...overrides,
  };
}

function renderManager({
  cast = [] as Character[],
  chapters = [] as ChapterSummary[],
} = {}) {
  return render(
    <CharacterManager
      novelRef="my-novel"
      initialCharacters={cast}
      chapters={chapters}
    />,
  );
}

describe("CharacterManager", () => {
  it("labels the toggle แก้ไข closed and เสร็จสิ้น open - one verb pair, not two (#1)", () => {
    renderManager({ cast: [member({ name: "มินตรา" })] });

    const toggle = screen.getByRole("button", { name: /แก้ไข/ });
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: /เสร็จสิ้น/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^แก้ไข$/ })).not.toBeInTheDocument();
  });

  it("autosaves an edit after the debounce - no manual save button (#2)", async () => {
    vi.useFakeTimers();
    const one = member({ name: "มินตรา" });
    updateCharacter.mockResolvedValue({ ...one, role: "ตัวเอก" });
    renderManager({ cast: [one] });

    fireEvent.click(screen.getByRole("button", { name: /แก้ไข/ }));
    fireEvent.change(screen.getByLabelText("บทบาท"), { target: { value: "ตัวเอก" } });

    expect(screen.getByText("มีการแก้ไขที่ยังไม่บันทึก…")).toBeInTheDocument();
    expect(updateCharacter).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(900));
    expect(updateCharacter).toHaveBeenCalledWith(
      "my-novel",
      one.id,
      expect.objectContaining({ name: "มินตรา", role: "ตัวเอก" }),
    );
    expect(screen.getByText("บันทึกอัตโนมัติแล้ว")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "บันทึก" })).not.toBeInTheDocument();
  });

  it("flushes a pending edit when the card is closed - เสร็จสิ้น never discards (#2)", async () => {
    vi.useFakeTimers();
    const one = member({ name: "มินตรา" });
    updateCharacter.mockResolvedValue(one);
    renderManager({ cast: [one] });

    fireEvent.click(screen.getByRole("button", { name: /แก้ไข/ }));
    fireEvent.change(screen.getByLabelText("คำอธิบายสั้น"), {
      target: { value: "นางเอกของเรื่อง" },
    });
    // Close immediately, well before the 800ms debounce would have fired.
    fireEvent.click(screen.getByRole("button", { name: /เสร็จสิ้น/ }));

    await vi.waitFor(() =>
      expect(updateCharacter).toHaveBeenCalledWith(
        "my-novel",
        one.id,
        expect.objectContaining({ summary: "นางเอกของเรื่อง" }),
      ),
    );
  });

  it("refuses a duplicate name at the add form, without a request (#4)", () => {
    renderManager({ cast: [member({ name: "มินตรา" })] });

    fireEvent.change(screen.getByLabelText("เพิ่มตัวละคร"), {
      target: { value: "  มินตรา " },
    });
    fireEvent.click(screen.getByRole("button", { name: /เพิ่ม$/ }));

    expect(createCharacter).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("มีตัวละครชื่อ");
  });

  it("keeps one card open at a time (#7)", () => {
    renderManager({ cast: [member({ name: "หนึ่ง" }), member({ name: "สอง" })] });

    const toggles = screen.getAllByRole("button", { name: /แก้ไข/ });
    fireEvent.click(toggles[0]);
    expect(screen.getAllByRole("button", { name: /เสร็จสิ้น/ })).toHaveLength(1);

    // Opening the second closes the first - never two open forms stacked.
    fireEvent.click(screen.getByRole("button", { name: /แก้ไข/ }));
    expect(screen.getAllByRole("button", { name: /เสร็จสิ้น/ })).toHaveLength(1);
  });

  it("shows role and appearance count on the closed card (#8)", () => {
    const chapters = [chapter(), chapter()];
    renderManager({
      cast: [
        member({
          name: "มินตรา",
          role: "ตัวเอก",
          appears_in: [chapters[0].id, chapters[1].id],
        }),
        member({ name: "วรัญ" }),
      ],
      chapters,
    });

    expect(screen.getByText(/ตัวเอก · ปรากฏ 2 ตอน/)).toBeInTheDocument();
    expect(
      screen.getByText(/ยังไม่ได้ระบุบทบาท · ยังไม่ได้เลือกตอนที่ปรากฏ/),
    ).toBeInTheDocument();
  });

  it("uploads a portrait under the character_avatar purpose and attaches it (#9)", async () => {
    const one = member({ name: "มินตรา" });
    uploadMedia.mockResolvedValue({ url: "https://cdn.example/media/character_avatar/a.png" });
    updateCharacter.mockResolvedValue({
      ...one,
      avatar_url: "https://cdn.example/media/character_avatar/a.png",
    });
    renderManager({ cast: [one] });

    fireEvent.click(screen.getByRole("button", { name: /แก้ไข/ }));
    expect(screen.getByRole("button", { name: /อัปโหลดรูป/ })).toBeInTheDocument();

    const file = new File(["png"], "หน้า.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("เลือกรูปตัวละคร"), {
      target: { files: [file] },
    });

    await vi.waitFor(() =>
      expect(uploadMedia).toHaveBeenCalledWith(
        expect.objectContaining({ purpose: "character_avatar", novel: "my-novel" }),
      ),
    );
    await vi.waitFor(() =>
      expect(updateCharacter).toHaveBeenCalledWith("my-novel", one.id, {
        avatar_url: "https://cdn.example/media/character_avatar/a.png",
      }),
    );
  });

  it("gives ประโยคติดปาก a placeholder like every other box (#10)", () => {
    renderManager({ cast: [member({ name: "มินตรา" })] });
    fireEvent.click(screen.getByRole("button", { name: /แก้ไข/ }));
    expect(screen.getByLabelText("ประโยคติดปาก")).toHaveAttribute(
      "placeholder",
      expect.stringContaining("เช่น"),
    );
  });

  it("keeps secondary fields behind รายละเอียดเพิ่มเติม for a bare character (#11, #19)", () => {
    renderManager({ cast: [member({ name: "มินตรา" })] });
    fireEvent.click(screen.getByRole("button", { name: /แก้ไข/ }));

    // The three primary boxes are immediate; the rest sit in a closed disclosure.
    expect(screen.getByLabelText("ชื่อ")).toBeInTheDocument();
    expect(screen.getByLabelText("บทบาท")).toBeInTheDocument();
    expect(screen.getByLabelText("คำอธิบายสั้น")).toBeInTheDocument();
    const disclosure = screen
      .getByText("รายละเอียดเพิ่มเติม")
      .closest("details") as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);

    // A character with written backstory keeps the disclosure open - hiding
    // filled fields would read as data loss.
    const second = renderManager({
      cast: [member({ name: "วรัญ", description: "อดีตทหาร" })],
    });
    fireEvent.click(
      within(second.container).getByRole("button", { name: /แก้ไข/ }),
    );
    const opened = within(second.container)
      .getByText("รายละเอียดเพิ่มเติม")
      .closest("details") as HTMLDetailsElement;
    expect(opened.open).toBe(true);
  });

  it("starts ข้อมูลเพิ่มเติม at zero rows - the add button is the only entry (#12)", () => {
    renderManager({ cast: [member({ name: "มินตรา" })] });
    fireEvent.click(screen.getByRole("button", { name: /แก้ไข/ }));

    expect(screen.queryByPlaceholderText("หัวข้อ")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+ เพิ่มหัวข้อ" }));
    expect(screen.getByPlaceholderText("หัวข้อ")).toBeInTheDocument();

    // And the row's ✕ genuinely removes it (#13).
    fireEvent.click(screen.getByRole("button", { name: "ลบหัวข้อนี้" }));
    expect(screen.queryByPlaceholderText("หัวข้อ")).not.toBeInTheDocument();
  });

  it("names chapters in the appearance picker and flags unreadable ones (#14)", () => {
    const chapters = [
      chapter({ chapter_number: 1, title: "คืนแรกในเมือง" }),
      chapter({ chapter_number: 2, title: "ยังไม่เสร็จ", status: "draft" }),
    ];
    renderManager({ cast: [member({ name: "มินตรา" })], chapters });
    fireEvent.click(screen.getByRole("button", { name: /แก้ไข/ }));

    // Exact names, so the timeline's own cells ("มินตรา - 1 · …") stay out.
    expect(
      screen.getByRole("button", { name: "1 · คืนแรกในเมือง" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^2 · ยังไม่เสร็จ\s*ร่าง$/ }),
    ).toBeInTheDocument();
  });

  it("shows a reasoned empty state before the first character exists (#16)", () => {
    renderManager();
    expect(screen.getByText("ยังไม่มีตัวละครในเรื่องนี้")).toBeInTheDocument();
    expect(screen.getByText(/การ์ดแนะนำบนหน้าเรื่อง/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /เริ่มจากใส่ชื่อตัวละครแรก/ }),
    ).toBeInTheDocument();
  });

  it("renders the timeline grid and toggles an appearance from a cell (#17)", async () => {
    const chapters = [chapter({ chapter_number: 1, title: "หนึ่ง" }), chapter({ chapter_number: 2 })];
    const one = member({ name: "มินตรา", appears_in: [chapters[0].id] });
    setCharacterAppearances.mockResolvedValue({
      ...one,
      appears_in: [chapters[0].id, chapters[1].id],
    });
    renderManager({ cast: [one], chapters });

    const timeline = screen.getByRole("table");
    const cell = within(timeline).getByRole("button", {
      name: `มินตรา - 2 · ตอนที่ 2`,
    });
    expect(cell).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(cell);

    await vi.waitFor(() =>
      expect(setCharacterAppearances).toHaveBeenCalledWith(
        "my-novel",
        one.id,
        expect.arrayContaining([chapters[0].id, chapters[1].id]),
      ),
    );
  });

  it("previews the reader card from the live draft (#18)", () => {
    renderManager({ cast: [member({ name: "มินตรา" })] });
    fireEvent.click(screen.getByRole("button", { name: /แก้ไข/ }));
    fireEvent.change(screen.getByLabelText("คำอธิบายสั้น"), {
      target: { value: "นางเอกผู้ไม่ยอมแพ้" },
    });

    const preview = screen
      .getByText("ดูตัวอย่างที่ผู้อ่านเห็น")
      .closest("details") as HTMLDetailsElement;
    expect(within(preview).getByText("นางเอกผู้ไม่ยอมแพ้")).toBeInTheDocument();
  });

  it("confirms deletion by name, in its own zone, before any request (#3)", async () => {
    const one = member({ name: "มินตรา" });
    deleteCharacter.mockResolvedValue(undefined);
    renderManager({ cast: [one] });

    fireEvent.click(screen.getByRole("button", { name: /แก้ไข/ }));
    fireEvent.click(screen.getByRole("button", { name: /ลบตัวละคร/ }));
    expect(deleteCharacter).not.toHaveBeenCalled();
    expect(screen.getByText(/ลบ «มินตรา» ถาวร\?/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ยืนยันลบ" }));
    await vi.waitFor(() =>
      expect(deleteCharacter).toHaveBeenCalledWith("my-novel", one.id),
    );
  });

  it("offers search from six characters and filters by name or role (#6)", () => {
    const cast = [
      member({ name: "มินตรา", role: "ตัวเอก" }),
      member({ name: "วรัญ" }),
      member({ name: "สาม" }),
      member({ name: "สี่" }),
      member({ name: "ห้า" }),
    ];
    const { unmount } = renderManager({ cast });
    expect(screen.queryByLabelText("ค้นหาตัวละคร")).not.toBeInTheDocument();
    unmount();

    renderManager({ cast: [...cast, member({ name: "หก" })] });
    const search = screen.getByLabelText("ค้นหาตัวละคร");
    fireEvent.change(search, { target: { value: "ตัวเอก" } });
    expect(screen.getByText("มินตรา")).toBeInTheDocument();
    expect(screen.queryByText("วรัญ")).not.toBeInTheDocument();
  });

  it("reorders the cast by drag and drop, keeping the arrows as fallback (#5)", async () => {
    const cast = [
      member({ name: "หนึ่ง" }),
      member({ name: "สอง" }),
      member({ name: "สาม" }),
    ];
    reorderCharacters.mockResolvedValue(cast);
    renderManager({ cast });

    const rows = screen.getAllByRole("listitem");
    fireEvent.dragStart(rows[0], { dataTransfer: { effectAllowed: "" } });
    fireEvent.dragOver(rows[2], { dataTransfer: {} });
    fireEvent.drop(rows[2], { dataTransfer: {} });

    await vi.waitFor(() =>
      expect(reorderCharacters).toHaveBeenCalledWith("my-novel", [
        cast[1].id,
        cast[2].id,
        cast[0].id,
      ]),
    );
    // The arrow fallback still exists for keyboard and touch.
    expect(screen.getAllByRole("button", { name: "เลื่อนขึ้น" })).toHaveLength(3);
  });

  it("an over-long ลักษณะนิสัย warns at the field but never holds the card hostage", async () => {
    vi.useFakeTimers();
    const one = member({ name: "มินตรา" });
    updateCharacter.mockResolvedValue({ ...one, role: "ตัวเอก" });
    renderManager({ cast: [one] });

    fireEvent.click(screen.getByRole("button", { name: /แก้ไข/ }));
    fireEvent.change(screen.getByLabelText("บทบาท"), { target: { value: "ตัวเอก" } });
    fireEvent.change(screen.getByLabelText("ลักษณะนิสัย"), {
      target: { value: "เป็นคนสุขุมเยือกเย็นชอบช่วยเหลือคนรอบข้าง".repeat(9) },
    });
    await act(() => vi.advanceTimersByTimeAsync(900));

    // The save went ahead WITHOUT the traits - the role still landed - and
    // the field itself says why, in Thai, with the fix. No "Validation
    // failed.", no blocked card.
    const call = updateCharacter.mock.calls.find(([, id]) => id === one.id);
    expect(call).toBeTruthy();
    expect(call?.[2]).not.toHaveProperty("traits");
    expect(call?.[2]).toMatchObject({ role: "ตัวเอก" });
    expect(screen.getByText(/ยาวเกิน 300 ตัวอักษร.*จุลภาค/)).toBeInTheDocument();
  });

  it("a full-sentence personality saves as-is - writers are not forced into chips", async () => {
    vi.useFakeTimers();
    const sentence =
      "มีนิสัยสุภาพ สุขุม รอบรู้ และรักสันโดษ ในฐานะร่างจำแลงของเทพแห่งหินเขาจึงมีความใจเย็นและสง่างาม แต่มีจุดอ่อนตลกๆ คือชอบซื้อของโดยไม่พกเงินและมักให้คนอื่นจ่ายให้เสมอ";
    const one = member({ name: "จงหลี" });
    updateCharacter.mockResolvedValue({ ...one, traits: [sentence] });
    renderManager({ cast: [one] });

    fireEvent.click(screen.getByRole("button", { name: /แก้ไข/ }));
    fireEvent.change(screen.getByLabelText("ลักษณะนิสัย"), {
      target: { value: sentence },
    });
    await act(() => vi.advanceTimersByTimeAsync(900));

    const call = updateCharacter.mock.calls.find(([, id]) => id === one.id);
    expect(call?.[2]).toMatchObject({ traits: [sentence] });
    expect(screen.queryByText(/ยาวเกิน/)).not.toBeInTheDocument();
  });

  it("a refused save names the field in Thai instead of 'Validation failed.'", async () => {
    vi.useFakeTimers();
    const { ApiError } = await import("@/lib/api");
    updateCharacter.mockRejectedValue(
      new ApiError(422, {
        code: "VALIDATION_ERROR",
        message: "Validation failed.",
        fields: { summary: ["This value is too long."] },
      }),
    );
    renderManager({ cast: [member({ name: "มินตรา" })] });

    fireEvent.click(screen.getByRole("button", { name: /แก้ไข/ }));
    fireEvent.change(screen.getByLabelText("คำอธิบายสั้น"), {
      target: { value: "ยาวเกินจริง" },
    });
    await act(() => vi.advanceTimersByTimeAsync(900));

    expect(screen.getAllByText(/คำอธิบายสั้นยาวเกิน 300 ตัวอักษร/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Validation failed.")).not.toBeInTheDocument();
  });
});
