import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WriterSpotlight } from "@/features/home/writer-spotlight";
import type { SpotlightWriter, WriterSpotlightView } from "@/types/profile";

/**
 * The writer band's binding rules (docs/WRITER-SPOTLIGHT.md):
 *
 *   - numbers appear only as bands or a streak, never as exact counts;
 *   - the pen name outranks the display name on the card;
 *   - a guest gets a sign-in link, not a button that can only fail;
 *   - fewer than three writers renders nothing at all.
 */

function writer(overrides: Partial<SpotlightWriter> = {}): SpotlightWriter {
  return {
    id: crypto.randomUUID(),
    username: "somewriter",
    display_name: "ชื่อที่แสดง",
    ...overrides,
  };
}

function view(
  writers: SpotlightWriter[],
  kind: WriterSpotlightView["kind"] = "rising",
): WriterSpotlightView {
  return { kind, writers };
}

describe("WriterSpotlight", () => {
  it("shows the band, never an exact count", () => {
    render(
      <WriterSpotlight
        signedIn={false}
        spotlight={view([
          writer({ username: "a", band: "50+" }),
          writer({ username: "b", band: "10+" }),
          writer({ username: "c" }),
        ])}
      />,
    );
    expect(screen.getByText(/เข้าชั้นหนังสือ 50\+ ครั้งเดือนนี้/)).toBeInTheDocument();
    // The writer below the first threshold gets the kind's quiet line - not
    // a zero, which would be an exact count and a verdict at once.
    expect(screen.queryByText(/ 0 /)).not.toBeInTheDocument();
  });

  it("phrases the consistent ranking as the writer's own streak", () => {
    render(
      <WriterSpotlight
        signedIn={false}
        spotlight={view(
          [
            writer({ username: "a", streak_weeks: 6 }),
            writer({ username: "b", streak_weeks: 4 }),
            writer({ username: "c", streak_weeks: 3 }),
          ],
          "consistent",
        )}
      />,
    );
    expect(screen.getByText("นักเขียนที่ลงตอนสม่ำเสมอ")).toBeInTheDocument();
    expect(screen.getByText("ลงตอนต่อเนื่อง 6 สัปดาห์")).toBeInTheDocument();
  });

  it("puts the pen name above the display name on the card", () => {
    render(
      <WriterSpotlight
        signedIn={false}
        spotlight={view([
          writer({ username: "a", pen_name: "นามปากกาเอ", display_name: "ชื่อจริงเอ" }),
          writer({ username: "b" }),
          writer({ username: "c" }),
        ])}
      />,
    );
    expect(screen.getByText("นามปากกาเอ")).toBeInTheDocument();
    expect(screen.queryByText("ชื่อจริงเอ")).not.toBeInTheDocument();
  });

  it("sends a guest to sign in instead of mounting six follow probes", () => {
    render(
      <WriterSpotlight
        signedIn={false}
        spotlight={view([
          writer({ username: "a" }),
          writer({ username: "b" }),
          writer({ username: "c" }),
        ])}
      />,
    );
    const links = screen.getAllByRole("link", { name: "ติดตาม" });
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute("href", "/login?next=/");
  });

  it("renders nothing below three writers - a lonely band is worse than none", () => {
    const { container } = render(
      <WriterSpotlight
        signedIn={false}
        spotlight={view([writer({ username: "a" }), writer({ username: "b" })])}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the API had nothing to say", () => {
    const { container } = render(
      <WriterSpotlight signedIn={false} spotlight={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
