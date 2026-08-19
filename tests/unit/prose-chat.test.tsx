import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DerivedChatView } from "@/components/reader/derived-chat-view";
import { derivedChat, derivedChatView, hasDialogue, plainProse } from "@/lib/prose-chat";

/**
 * อ่านแบบแชท - prose read as a conversation
 * (docs/PHASE-13-CREATION-AND-CONTROL.md §13O).
 *
 * The feature only earns its place if it takes nothing away, so the tests are
 * about what it must NOT do: it must not lose a word of the narration, must not
 * invent a speaker, must not choke on a quotation mark an author typed for
 * another reason, and must never be mistaken for the author's own layout.
 */

describe("deriving a conversation from prose", () => {
  it("reads straight and smart quotation marks alike", () => {
    // The same manuscript typed on a phone and in a word processor.
    const straight = derivedChat('เขาหันมา "นายอยู่ไหน" แล้วก็เงียบ');
    const smart = derivedChat("เขาหันมา “นายอยู่ไหน” แล้วก็เงียบ");

    for (const turns of [straight, smart]) {
      expect(turns.map((turn) => turn.kind)).toEqual([
        "narration",
        "speech",
        "narration",
      ]);
      expect(turns[1].text).toBe("นายอยู่ไหน");
    }
  });

  // ฟันหนู 2 แบบ (reader review 2026-08): the double quote, and a single
  // quote USED IN A PAIR. Both derive; a lone apostrophe stays narration.
  it("reads a paired single quote as speech", () => {
    const turns = derivedChat("เขากระซิบ 'อย่าบอกใคร' แล้วเดินจากไป");
    expect(turns.map((turn) => turn.kind)).toEqual([
      "narration",
      "speech",
      "narration",
    ]);
    expect(turns[1].text).toBe("อย่าบอกใคร");
  });

  it("leaves a single quote with no partner in the narration", () => {
    const turns = derivedChat("หนังสือของ O'Brien วางอยู่บนโต๊ะ");
    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({ kind: "narration" });
    expect(turns[0].text).toContain("O'Brien");
  });

  // The chat view renders plain text, so it derives from the manuscript's
  // bare words - markers and pictures must not reach a bubble.
  it("projects markup away before deriving", () => {
    const plain = plainProse(
      '_**"เมื่อหนุ่ม ๆ"**_\n\n---\n\n**เอเธอร์**\n\n![แบนเนอร์](https://cdn.example/x.png)\n\n"ไปกันเถอะ"',
    );
    expect(plain).not.toContain("**");
    expect(plain).not.toContain("---");
    expect(plain).not.toContain("![");
    expect(plain).not.toContain("แบนเนอร์");

    const turns = derivedChat(plain);
    expect(turns[0]).toMatchObject({ kind: "speech", text: "เมื่อหนุ่ม ๆ" });
    expect(turns.at(-1)).toMatchObject({ kind: "speech", text: "ไปกันเถอะ" });
  });

  it("reads the bracket forms Thai fanfiction borrows", () => {
    expect(derivedChat("「ไปกันเถอะ」")[0]).toMatchObject({
      kind: "speech",
      text: "ไปกันเถอะ",
    });
    expect(derivedChat("«ไปกันเถอะ»")[0]).toMatchObject({ kind: "speech" });
  });

  // A two-hander reads as a back-and-forth. It is a LAYOUT convention and the
  // panel above the conversation says so - nothing here claims to know who
  // spoke, and no bubble carries a name.
  it("alternates sides across consecutive utterances", () => {
    const turns = derivedChat('"หนึ่ง" "สอง" "สาม"').filter((t) => t.kind === "speech");
    expect(turns.map((turn) => turn.side)).toEqual(["left", "right", "left"]);
  });

  // The rule this feature lives or dies by: everything outside the quotation
  // marks is still there, in the author's order.
  it("keeps every word of the narration", () => {
    const prose = 'เช้าวันนั้นฝนตก "ตื่นเถอะ" เธอบอก แล้วเดินออกไป';
    const joined = derivedChat(prose)
      .map((turn) => turn.text)
      .join(" ");

    for (const fragment of ["เช้าวันนั้นฝนตก", "ตื่นเถอะ", "เธอบอก", "แล้วเดินออกไป"]) {
      expect(joined).toContain(fragment);
    }
  });

  // An unclosed mark is a character the author typed, not a command. Treating
  // it as an opener would swallow the rest of the chapter into one bubble.
  it("leaves an unclosed quotation mark in the narration", () => {
    const turns = derivedChat('เขาพูดว่า "แล้วก็เดินจากไปโดยไม่ปิดคำพูด');
    expect(turns).toHaveLength(1);
    expect(turns[0].kind).toBe("narration");
  });

  it("treats an empty pair as punctuation, not an utterance", () => {
    expect(derivedChat('เขาเงียบ "" แล้วเดินไป').every((t) => t.kind === "narration")).toBe(
      true,
    );
  });

  // Used to decide whether to OFFER the mode. A switch that visibly does
  // nothing is worse than a switch that is not there.
  // The view derivation keeps the author's STRUCTURE (reader review 2026-08):
  // rules become separators, the standalone bold name line becomes a grey
  // scene marker, and the bubble alternation flows across paragraphs.
  it("keeps rules and heading lines as separators and markers", () => {
    const turns = derivedChatView(
      '---\n\n**เอเธอร์ (Aether)**\n\nคลีวิ่งตามคุณไปที่ครัว\n\n"น้าเอเธอร์!"',
    );
    expect(turns.map((turn) => turn.kind)).toEqual([
      "separator",
      "marker",
      "narration",
      "speech",
    ]);
    expect(turns[1].text).toBe("เอเธอร์ (Aether)");
    expect(turns[2].text).toBe("คลีวิ่งตามคุณไปที่ครัว");
  });

  it("does not mistake a mid-scene bold shout for a marker", () => {
    const turns = derivedChatView("คลีตบมือตื่นเต้น\n\n**ตูม!**");
    expect(turns.map((turn) => turn.kind)).toEqual(["narration", "narration"]);
    expect(turns[1].text).toBe("ตูม!");
  });

  it("alternates bubble sides across paragraphs as one conversation", () => {
    const turns = derivedChatView('"หนึ่ง"\n\n"สอง"').filter(
      (turn) => turn.kind === "speech",
    );
    expect(turns.map((turn) => turn.side)).toEqual(["left", "right"]);
  });

  it("reports whether a chapter has any dialogue at all", () => {
    expect(hasDialogue("บรรยายล้วน ไม่มีบทพูดสักคำ")).toBe(false);
    expect(hasDialogue('เขาพูด "สวัสดี"')).toBe(true);
  });
});

describe("DerivedChatView", () => {
  const PROSE = 'เช้าวันนั้นฝนตก "ตื่นเถอะ" เธอบอก';

  it("says the layout is automatic and the manuscript untouched", () => {
    render(<DerivedChatView content={PROSE} />);
    expect(screen.getByText(/ระบบแยกบทพูดจากเครื่องหมายคำพูดในต้นฉบับให้อัตโนมัติ/))
      .toBeInTheDocument();
    expect(screen.getByText(/ไม่ได้แก้ไขต้นฉบับ/)).toBeInTheDocument();
  });

  // A real chat chapter carries names its author chose. This one has none, and
  // inventing one would present a guess as the author's work.
  it("gives a derived bubble no speaker name", () => {
    render(<DerivedChatView content={PROSE} />);
    const conversation = screen.getByRole("list", { name: "บทสนทนา" });
    expect(conversation.textContent).toContain("ตื่นเถอะ");
    expect(conversation.textContent).toContain("เช้าวันนั้นฝนตก");
    expect(screen.queryByText(/ผู้พูด/)).not.toBeInTheDocument();
  });
});
