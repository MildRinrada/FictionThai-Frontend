import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { ChatView } from "@/components/reader/chat-view";
import { ProseView } from "@/components/reader/prose-view";
import { slotsFor } from "@/components/reader/variable-text";
import {
  getReaderProfile,
  getReaderValues,
  resolveValue,
  setReaderProfileValue,
  setReaderValue,
} from "@/lib/reader-values";
import { VariableKind, tokensOf, type NovelVariable } from "@/types/variable";

/**
 * Reader variables (docs/PHASE-13-CREATION-AND-CONTROL.md §13H).
 *
 * The rule these exist to protect: never substitute at save; store tokens and
 * resolve at render. On the client that means the server-rendered text keeps
 * the author's tokens and only SLOTS carry a reader's answer - which is why a
 * cached chapter is identical for every reader.
 */

function variable(overrides: Partial<NovelVariable> = {}): NovelVariable {
  return {
    id: "v1",
    position: 0,
    token: "(y/n)",
    label: "ชื่อของคุณ",
    default_value: "คุณ",
    kind: VariableKind.Text,
    tokens: ["(y/n)"],
    ...overrides,
  };
}

describe("token slots", () => {
  it("renders each occurrence as a slot carrying the author's default", () => {
    const { container } = render(
      <ProseView
        content="(y/n) เดินเข้ามา แล้ว (y/n) ก็หยุด"
        slots={slotsFor([variable()])}
      />,
    );

    const slots = container.querySelectorAll("[data-var-slot]");
    expect(slots).toHaveLength(2);
    expect(slots[0].textContent).toBe("คุณ");
    // The token itself is gone from the rendered text - it is the slot now.
    expect(container.textContent).not.toContain("(y/n)");
  });

  it("leaves text alone when the fiction declares nothing", () => {
    const { container } = render(<ProseView content="(y/n) ยังอยู่" slots={[]} />);
    expect(container.textContent).toContain("(y/n)");
    expect(container.querySelectorAll("[data-var-slot]")).toHaveLength(0);
  });

  // A pronoun's base token would otherwise be found INSIDE its own form tokens
  // and split them into nonsense.
  it("matches the longest token first", () => {
    const pronoun = variable({
      token: "(p/n)",
      label: "สรรพนาม",
      default_value: undefined,
      kind: VariableKind.Pronoun,
      tokens: ["(p/n)", "(p/n.เจ้าของ)"],
      options: {
        forms: ["ประธาน", "เจ้าของ"],
        sets: [{ label: "เขา", values: ["เขา", "ของเขา"] }],
      },
    });

    const { container } = render(
      <ProseView content="(p/n.เจ้าของ) หนังสือ" slots={slotsFor([pronoun])} />,
    );

    const slots = container.querySelectorAll("[data-var-slot]");
    expect(slots).toHaveLength(1);
    expect(slots[0].getAttribute("data-var-slot")).toBe("(p/n.เจ้าของ)");
  });

  // A conversation names the reader too - the slots are not a prose-only idea.
  it("fills slots in chat messages", () => {
    const { container } = render(
      <ChatView
        messages={[
          {
            id: "m1",
            position: 0,
            speaker_name: "Alice",
            message_type: "message",
            content: "สวัสดี (y/n)",
          },
        ]}
        slots={slotsFor([variable()])}
      />,
    );

    expect(container.querySelectorAll("[data-var-slot]")).toHaveLength(1);
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });
});

describe("the reader's answers", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // The module caches per key, so a fresh key per test keeps them isolated
    // without reaching into the cache.
  });

  it("stores per fiction, so a reader can be someone else in another story", () => {
    setReaderValue("novel-a", "(y/n)", "มะลิ");
    setReaderValue("novel-b", "(y/n)", "ดาว");

    expect(getReaderValues("novel-a")["(y/n)"]).toBe("มะลิ");
    expect(getReaderValues("novel-b")["(y/n)"]).toBe("ดาว");
  });

  it("never writes anything but the answers to storage", () => {
    setReaderValue("novel-c", "(y/n)", "มะลิ");
    expect(window.localStorage.getItem("ft:vars:novel-c")).toBe('{"(y/n)":"มะลิ"}');
  });

  it("clears an answer when it is emptied", () => {
    setReaderValue("novel-d", "(y/n)", "มะลิ");
    setReaderValue("novel-d", "(y/n)", "   ");
    expect(getReaderValues("novel-d")["(y/n)"]).toBeUndefined();
  });

  // The device profile keys by LABEL, because tokens are per fiction - one
  // author's (y/n) is another's (ช/ท) - while "ชื่อของคุณ" means the same thing
  // everywhere. That is what makes auto-fill work across the platform.
  it("auto-fills a new fiction from the device profile", () => {
    setReaderProfileValue("ชื่อของคุณ", "มะลิ");

    const shown = resolveValue(
      getReaderValues("novel-never-visited"),
      getReaderProfile(),
      variable(),
      "(y/n)",
    );
    expect(shown).toBe("มะลิ");
  });

  // A default is what the author writes for a reader who has said nothing, and
  // a reader who filled in their profile has said something.
  it("prefers this fiction's answer, then the profile, then the author's default", () => {
    setReaderProfileValue("ชื่อของคุณ", "จากโปรไฟล์");
    setReaderValue("novel-e", "(y/n)", "ในเรื่องนี้");

    expect(
      resolveValue(getReaderValues("novel-e"), getReaderProfile(), variable(), "(y/n)"),
    ).toBe("ในเรื่องนี้");

    setReaderValue("novel-e", "(y/n)", "");
    expect(
      resolveValue(getReaderValues("novel-e"), getReaderProfile(), variable(), "(y/n)"),
    ).toBe("จากโปรไฟล์");

    setReaderProfileValue("ชื่อของคุณ", "");
    expect(
      resolveValue(getReaderValues("novel-e"), getReaderProfile(), variable(), "(y/n)"),
    ).toBe("คุณ");
  });

  it("survives a corrupted storage value rather than rendering an object", () => {
    window.localStorage.setItem("ft:vars:novel-broken", "not json");
    expect(getReaderValues("novel-broken")).toEqual({});
  });
});

describe("form tokens", () => {
  it("gives form 0 the bare token and the rest a suffix", () => {
    expect(
      tokensOf({
        token: "(p/n)",
        label: "สรรพนาม",
        kind: VariableKind.Pronoun,
        options: { forms: ["ประธาน", "เจ้าของ"] },
      }),
    ).toEqual(["(p/n)", "(p/n.เจ้าของ)"]);
  });

  it("leaves a text variable with exactly one token", () => {
    expect(
      tokensOf({ token: "(y/n)", label: "ชื่อของคุณ", kind: VariableKind.Text }),
    ).toEqual(["(y/n)"]);
  });
});
