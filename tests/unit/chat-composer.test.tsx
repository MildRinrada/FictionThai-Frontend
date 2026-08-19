import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ChatComposer, type DraftMessage } from "@/features/studio/chat-composer";
import type { Character } from "@/types/character";
import type { NovelVariable } from "@/types/variable";

/**
 * The chat composer (chat-editor review 2026-08 and its follow-up round):
 * a CHAT, not a stack of forms. What these tests defend - one input bar, a
 * speaker strip whose colour/side/name belong to the SPEAKER, the paste
 * preview, bulk selection, delete-undo, and ค้นหา/แทนที่.
 */

const CAST: Character[] = [
  {
    id: "char-aether",
    novel_id: "n1",
    name: "เอเธอร์ (Aether)",
    traits: [],
    details: [],
    position: 0,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  },
];

const VARIABLES = [{ id: "v1", token: "(y/n)", label: "ชื่อของคุณ" }] as NovelVariable[];

function composer(
  initial: DraftMessage[] = [],
  onUpdateCharacter?: (id: string, changes: object) => void,
) {
  const onChange = vi.fn();
  render(
    <ChatComposer
      messages={initial}
      onChange={onChange}
      variables={VARIABLES}
      characters={CAST}
      onUpdateCharacter={onUpdateCharacter}
    />,
  );
  return onChange;
}

const input = () => screen.getByLabelText("พิมพ์ข้อความ");

describe("ChatComposer", () => {
  it("sends with Enter, as the picked speaker, on the speaker's own side", () => {
    const onChange = composer();

    // The reader is a default speaker, named by the variable token, RIGHT side.
    fireEvent.click(screen.getByRole("button", { name: "(y/n)" }));
    fireEvent.change(input(), { target: { value: "ไปกันเถอะ" } });
    fireEvent.keyDown(input(), { key: "Enter" });

    const sent = onChange.mock.calls[0][0] as DraftMessage[];
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      speaker_name: "(y/n)",
      content: "ไปกันเถอะ",
      message_type: "message",
      side: "right",
    });
  });

  it("shows ONE name per chip - the short display name, never both scripts", () => {
    composer();
    // "เอเธอร์ (Aether)" wears just "เอเธอร์"; the full name is the tooltip.
    const chip = screen.getByRole("button", { name: "เอเธอร์" });
    expect(chip).toHaveAttribute("title", expect.stringContaining("เอเธอร์ (Aether)"));
  });

  it("cycles the speaker with Tab on an empty box", () => {
    composer();
    const before = screen.getByRole("button", { name: "(y/n)" });
    expect(before).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(input(), { key: "Tab" });
    expect(screen.getByRole("button", { name: "เอเธอร์" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("switches the speaker mid-line with @ชื่อ", () => {
    const onChange = composer();
    fireEvent.change(input(), { target: { value: "@เอเธอร์ อย่าเพิ่งไปนะ" } });
    fireEvent.keyDown(input(), { key: "Enter" });

    const sent = onChange.mock.calls[0][0] as DraftMessage[];
    expect(sent[0]).toMatchObject({ speaker_name: "เอเธอร์", content: "อย่าเพิ่งไปนะ" });
  });

  it("previews a pasted script and only inserts after the confirm", () => {
    const onChange = composer();
    fireEvent.paste(input(), {
      clipboardData: {
        getData: () =>
          "เอเธอร์: ไปกันเถอะ\n(y/n): เดี๋ยวก่อนสิ\n---\nเวนติ: มาช้าจัง",
      },
    });

    // Nothing landed yet - the dialog shows what WOULD land (item 4).
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "ตัวอย่างข้อความที่วาง" })).toBeInTheDocument();
    expect(screen.getByText(/ผู้พูดใหม่เข้าแถบ: เวนติ/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "แทรกเป็นบับเบิล" }));
    const sent = onChange.mock.calls[0][0] as DraftMessage[];
    expect(sent.map((m) => m.message_type)).toEqual([
      "message",
      "message",
      "separator",
      "message",
    ]);
    expect(sent[0]).toMatchObject({ speaker_name: "เอเธอร์", side: "left" });
    expect(sent[1]).toMatchObject({ speaker_name: "(y/n)", side: "right" });
    expect(sent[3]).toMatchObject({ speaker_name: "เวนติ", content: "มาช้าจัง" });
  });

  it("keeps a cancelled paste out of the conversation", () => {
    const onChange = composer();
    fireEvent.paste(input(), {
      clipboardData: { getData: () => "เอเธอร์: หนึ่ง\nเอเธอร์: สอง" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("re-sides every bubble a speaker owns from the chip's own settings", () => {
    const rows: DraftMessage[] = [
      { key: "m1", speaker_name: "เอเธอร์", content: "หนึ่ง", message_type: "message", side: "left" },
      { key: "m2", speaker_name: "(y/n)", content: "สอง", message_type: "message", side: "right" },
      { key: "m3", speaker_name: "เอเธอร์", content: "สาม", message_type: "message", side: "left" },
    ];
    const persist = vi.fn();
    const onChange = composer(rows, persist);

    // The chip's AVATAR is the settings handle (visual round, item 8).
    fireEvent.click(screen.getByRole("button", { name: "ตั้งค่าผู้พูด เอเธอร์" }));
    fireEvent.click(screen.getByRole("button", { name: "ฝั่งขวา" }));

    const next = onChange.mock.calls[0][0] as DraftMessage[];
    expect(next[0].side).toBe("right");
    expect(next[2].side).toBe("right");
    // The other speaker is untouched (the side belongs to the speaker).
    expect(next[1]).toMatchObject({ speaker_name: "(y/n)", side: "right" });
    // ...and the preference rides home to the character record.
    expect(persist).toHaveBeenCalledWith("char-aether", { chat_side: "right" });
  });

  it("the ⇌ beside a bubble moves the whole speaker across, and persists", () => {
    // The mock's always-visible swap arrow: per SPEAKER, never per message.
    const rows: DraftMessage[] = [
      { key: "m1", speaker_name: "เอเธอร์", content: "หนึ่ง", message_type: "message", side: "left" },
      { key: "m2", speaker_name: "เอเธอร์", content: "สอง", message_type: "message", side: "left" },
    ];
    const persist = vi.fn();
    const onChange = composer(rows, persist);

    fireEvent.click(screen.getAllByRole("button", { name: "สลับฝั่งซ้ายขวา" })[0]);

    const next = onChange.mock.calls.at(-1)?.[0] as DraftMessage[];
    expect(next[0].side).toBe("right");
    expect(next[1].side).toBe("right");
    expect(persist).toHaveBeenCalledWith("char-aether", { chat_side: "right" });
  });

  it("persists a colour pick to the character record", () => {
    const persist = vi.fn();
    composer([], persist);

    fireEvent.click(screen.getByRole("button", { name: "ตั้งค่าผู้พูด เอเธอร์" }));
    fireEvent.click(screen.getByRole("button", { name: "ใช้สี #4d896a" }));

    expect(persist).toHaveBeenCalledWith("char-aether", { chat_color: "#4d896a" });
  });

  it("renames a speaker everywhere: chip, future bubbles, and existing ones", () => {
    const rows: DraftMessage[] = [
      { key: "m1", speaker_name: "เอเธอร์", content: "หนึ่ง", message_type: "message", side: "left" },
    ];
    const persist = vi.fn();
    const onChange = composer(rows, persist);

    fireEvent.click(screen.getByRole("button", { name: "ตั้งค่าผู้พูด เอเธอร์" }));
    const field = screen.getByLabelText("ชื่อที่แสดงของผู้พูดนี้");
    fireEvent.change(field, { target: { value: "Aether" } });
    fireEvent.keyDown(field, { key: "Enter" });

    const next = onChange.mock.calls[0][0] as DraftMessage[];
    expect(next[0].speaker_name).toBe("Aether");
    expect(persist).toHaveBeenCalledWith("char-aether", { chat_display_name: "Aether" });
  });

  it("opens a bubble for editing in place when clicked", () => {
    const rows: DraftMessage[] = [
      { key: "m1", speaker_name: "เอเธอร์", content: "แก้ฉันสิ", message_type: "message", side: "left" },
    ];
    composer(rows);

    fireEvent.click(screen.getByRole("button", { name: "แก้ฉันสิ" }));
    expect(screen.getByLabelText("แก้ไขข้อความ")).toHaveValue("แก้ฉันสิ");
    expect(screen.getByLabelText("ผู้พูดของข้อความนี้")).toHaveValue("เอเธอร์");
  });

  it("deletes with an เลิกทำ window, and the undo really restores", () => {
    // A controlled harness: the undo path reads the LIVE list, so the parent
    // must actually apply each onChange, exactly as the editor does.
    const rows: DraftMessage[] = [
      { key: "m1", speaker_name: "เอเธอร์", content: "อย่าลบฉัน", message_type: "message", side: "left" },
    ];
    const onChange = vi.fn();
    function Harness() {
      const [live, setLive] = useState(rows);
      return (
        <ChatComposer
          messages={live}
          onChange={(next) => {
            setLive(next);
            onChange(next);
          }}
          variables={VARIABLES}
          characters={CAST}
        />
      );
    }
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "อย่าลบฉัน" }));
    fireEvent.click(screen.getByRole("button", { name: "ลบข้อความนี้" }));
    expect(onChange).toHaveBeenLastCalledWith([]);

    fireEvent.click(screen.getByRole("button", { name: "เลิกทำ" }));
    const restored = onChange.mock.calls.at(-1)?.[0] as DraftMessage[];
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({ key: "m1", content: "อย่าลบฉัน" });
  });

  it("shift+click selects several bubbles for one bulk speaker change", () => {
    const rows: DraftMessage[] = [
      { key: "m1", speaker_name: "เอเธอร์", content: "หนึ่ง", message_type: "message", side: "left" },
      { key: "m2", speaker_name: "เอเธอร์", content: "สอง", message_type: "message", side: "left" },
    ];
    const onChange = composer(rows);

    fireEvent.click(screen.getByRole("button", { name: "หนึ่ง" }), { shiftKey: true });
    fireEvent.click(screen.getByRole("button", { name: "สอง" }), { shiftKey: true });
    expect(screen.getByText("เลือกแล้ว 2 ข้อความ")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("เปลี่ยนผู้พูดของที่เลือก"), {
      target: { value: "(y/n)" },
    });
    const next = onChange.mock.calls.at(-1)?.[0] as DraftMessage[];
    expect(next[0]).toMatchObject({ speaker_name: "(y/n)", side: "right" });
    expect(next[1]).toMatchObject({ speaker_name: "(y/n)", side: "right" });
  });

  it("ค้นหา/แทนที่ rewrites content AND speaker names in one press", () => {
    const rows: DraftMessage[] = [
      { key: "m1", speaker_name: "เวนติ", content: "เวนติมาแล้วนะ", message_type: "message", side: "left" },
      { key: "m2", speaker_name: "เอเธอร์", content: "ไปกันเถอะ", message_type: "message", side: "left" },
    ];
    const onChange = composer(rows);

    fireEvent.click(screen.getByRole("button", { name: "ค้นหา/แทนที่" }));
    fireEvent.change(screen.getByLabelText("ค้นหาในตอนนี้"), { target: { value: "เวนติ" } });
    expect(screen.getByText("พบ 2 จุด")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("แทนที่ด้วย"), { target: { value: "บาร์บาทอส" } });
    fireEvent.click(screen.getByRole("button", { name: "แทนที่ทั้งหมด" }));

    const next = onChange.mock.calls.at(-1)?.[0] as DraftMessage[];
    expect(next[0]).toMatchObject({
      speaker_name: "บาร์บาทอส",
      content: "บาร์บาทอสมาแล้วนะ",
    });
    expect(next[1].content).toBe("ไปกันเถอะ");
  });

  it("duplicates a bubble from its ⋯ menu", () => {
    const rows: DraftMessage[] = [
      { key: "m1", speaker_name: "เอเธอร์", content: "ทำสำเนาฉัน", message_type: "message", side: "left" },
    ];
    const onChange = composer(rows);

    fireEvent.click(screen.getByRole("button", { name: "เมนูข้อความนี้" }));
    fireEvent.click(screen.getByRole("button", { name: "ทำสำเนา" }));

    const next = onChange.mock.calls.at(-1)?.[0] as DraftMessage[];
    expect(next).toHaveLength(2);
    expect(next[1].content).toBe("ทำสำเนาฉัน");
    expect(next[1].key).not.toBe(next[0].key);
  });

  it("removes a stray strip-only voice from the strip (junk-chip escape)", () => {
    // "test" arrived from old messages, not from the cast (visual round,
    // item 7). Its settings offer ลบออกจากแถบ; a cast character's do not.
    const rows: DraftMessage[] = [
      { key: "m1", speaker_name: "test", content: "ขยะทดสอบ", message_type: "message", side: "left" },
    ];
    composer(rows);
    expect(screen.getByRole("button", { name: "test" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ตั้งค่าผู้พูด test" }));
    fireEvent.click(screen.getByRole("button", { name: "ลบออกจากแถบ" }));
    expect(screen.queryByRole("button", { name: "test" })).not.toBeInTheDocument();

    // The cast chip has no such exit - the character page owns the cast.
    fireEvent.click(screen.getByRole("button", { name: "ตั้งค่าผู้พูด เอเธอร์" }));
    expect(screen.queryByRole("button", { name: "ลบออกจากแถบ" })).not.toBeInTheDocument();
  });

  it("inserts a variable with a breathing space and wears it as a chip", () => {
    // "testy/n" (visual round, item 9): a token glued to a word reads as a
    // typo. The insert pads a space, and the input's mirror marks the token.
    composer();
    fireEvent.change(input(), { target: { value: "ทดสอบ" } });
    fireEvent.click(screen.getByRole("button", { name: "แทรกตัวแปรผู้อ่าน" }));
    fireEvent.click(screen.getByRole("button", { name: /ชื่อของคุณ/ }));

    expect(input()).toHaveValue("ทดสอบ (y/n)");
    // The backdrop renders the token as a quiet chip, metrics untouched.
    const chip = document.querySelector(".bg-primary-50.text-primary");
    expect(chip?.textContent).toBe("(y/n)");
  });

  it("keeps the send button honestly grey until there is something to send", () => {
    composer();
    const send = screen.getByRole("button", { name: "ส่ง" });
    expect(send).toBeDisabled();
    fireEvent.change(input(), { target: { value: "มีข้อความแล้ว" } });
    expect(send).toBeEnabled();
  });
});
