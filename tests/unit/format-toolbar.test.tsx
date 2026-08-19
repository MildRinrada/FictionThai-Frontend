import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FormatToolbar } from "@/features/studio/format-toolbar";
import { InsertVariable } from "@/features/studio/insert-variable";
import type { NovelVariable } from "@/types/variable";

/**
 * The toolbar's featured group (editor review 2026-08 C): the platform's own
 * moves - คั่นฉาก and แทรกตัวแปร - sit IN the row wearing words, never folded
 * behind a ⊕ popover two presses deep.
 */

vi.mock("@/lib/media-client", () => ({ uploadMedia: vi.fn() }));

const variable = {
  id: "v1",
  token: "(y/n)",
  label: "ชื่อของคุณ",
} as NovelVariable;

describe("FormatToolbar featured group", () => {
  it("shows คั่นฉาก and แทรกตัวแปร as labeled buttons in the row itself", () => {
    render(
      <FormatToolbar editor={{ current: null }} novelRef="my-fic">
        <InsertVariable variables={[variable]} onInsert={vi.fn()} />
      </FormatToolbar>,
    );

    expect(screen.getByRole("button", { name: /คั่นฉาก/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /แทรกตัวแปร/ })).toBeInTheDocument();
    // The ⊕ that used to hide them is gone.
    expect(
      screen.queryByRole("button", { name: "แทรกอื่น ๆ" }),
    ).not.toBeInTheDocument();
  });

  it("keeps คั่นฉาก out of the generic block group - one button, one home", () => {
    render(<FormatToolbar editor={{ current: null }} novelRef="my-fic" />);
    expect(screen.getAllByRole("button", { name: /คั่นฉาก/ })).toHaveLength(1);
  });
});

describe("image sizing (editor review 2026-08 item 1)", () => {
  it("offers a free-size slider beside the presets when a picture is picked", () => {
    const image = document.createElement("img");
    image.style.width = "40%";
    const resizeImage = vi.fn();
    const handle = {
      command: vi.fn(),
      insertHTML: vi.fn(),
      insertText: vi.fn(),
      element: () => null,
      pickedImage: () => image,
      resizeImage,
    };

    render(<FormatToolbar editor={{ current: handle }} novelRef="my-fic" />);
    // The toolbar learns about the picked image from selectionchange.
    fireEvent(document, new Event("selectionchange"));

    const slider = screen.getByRole("slider", {
      name: "ขนาดรูป (เปอร์เซ็นต์ของคอลัมน์)",
    });
    // It reads the image's own width back, not a default.
    expect(slider).toHaveValue("40");

    fireEvent.change(slider, { target: { value: "63" } });
    expect(resizeImage).toHaveBeenCalledWith(63);

    // Full width is the natural size and is stored as "no size chosen".
    fireEvent.change(slider, { target: { value: "100" } });
    expect(resizeImage).toHaveBeenCalledWith(null);
  });
});
