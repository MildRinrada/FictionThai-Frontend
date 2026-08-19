import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChatView } from "@/components/reader/chat-view";
import { ProseView } from "@/components/reader/prose-view";
import { MessageType, type ChatMessage } from "@/types/novel";

/**
 * The two chapter presentations.
 *
 * What matters: content renders as INERT text (docs/11 §17 - the content model
 * is plain text and nothing here may interpret markup), and the chat layout
 * follows the message's own metadata rather than re-deriving sides
 * (docs/06 §16).
 */

describe("ProseView", () => {
  it("splits paragraphs on blank lines", () => {
    render(<ProseView content={"ย่อหน้าแรก\n\nย่อหน้าที่สอง"} />);

    expect(screen.getByText("ย่อหน้าแรก")).toBeInTheDocument();
    expect(screen.getByText("ย่อหน้าที่สอง")).toBeInTheDocument();
  });

  it("renders markup in a manuscript as text, never as HTML", () => {
    const hostile = `<script>alert("x")</script><img src=x onerror=alert(1)>`;
    const { container } = render(<ProseView content={hostile} />);

    // The angle brackets survive as visible characters; no element was created.
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(hostile)).toBeInTheDocument();
  });
});

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: "m1",
    position: 0,
    speaker_name: "Alice",
    message_type: MessageType.Message,
    content: "สวัสดี",
    ...overrides,
  };
}

describe("ChatView", () => {
  it("renders speakers with their messages in order", () => {
    render(
      <ChatView
        messages={[
          message({ id: "m1", position: 0, speaker_name: "Alice", content: "นายอยู่ไหน?" }),
          message({ id: "m2", position: 1, speaker_name: "Bob", content: "กำลังกลับ" }),
        ]}
      />,
    );

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Alice");
    expect(items[0]).toHaveTextContent("นายอยู่ไหน?");
    expect(items[1]).toHaveTextContent("Bob");
  });

  it("places bubbles by the message's own metadata", () => {
    const { container } = render(
      <ChatView
        messages={[
          message({ id: "m1", metadata: { side: "left" } }),
          message({ id: "m2", metadata: { side: "right" }, content: "ขวา" }),
        ]}
      />,
    );

    // The side comes from allowlisted metadata (docs/11 §18); the component
    // never infers it from the speaker.
    const wrappers = container.querySelectorAll("li > div");
    expect(wrappers[0].className).toContain("items-start");
    expect(wrappers[1].className).toContain("items-end");
  });

  it("renders system and separator entries without a speaker bubble", () => {
    render(
      <ChatView
        messages={[
          message({ id: "m1", message_type: MessageType.System, content: "สามปีต่อมา" }),
          message({ id: "m2", message_type: MessageType.Separator, content: "" }),
        ]}
      />,
    );

    expect(screen.getByText("สามปีต่อมา")).toBeInTheDocument();
    // Neither entry shows a speaker name.
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });

  it("renders hostile message content as inert text", () => {
    const { container } = render(
      <ChatView messages={[message({ content: `<img src=x onerror=alert(1)>` })]} />,
    );
    expect(container.querySelector("img")).toBeNull();
  });
});
