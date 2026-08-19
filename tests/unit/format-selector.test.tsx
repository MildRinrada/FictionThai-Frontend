import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FormatSelector } from "@/components/fiction/format-selector";
import type { FictionFormat } from "@/types/fiction";
import { ContentMode, PresentationFormat, StoryStructure } from "@/types/fiction";

/**
 * Format selection.
 *
 * The behaviour under test is the UI half of docs/08 §43 Rule 6: three
 * independent controls, never one list of the eight combinations. A combined
 * control would make the dimensions look mutually exclusive to a writer.
 */

const DEFAULT: FictionFormat = {
  story_structure: StoryStructure.MultiChapter,
  presentation_format: PresentationFormat.Standard,
  content_mode: ContentMode.General,
};

function renderSelector(value: FictionFormat = DEFAULT) {
  const onChange = vi.fn();
  render(<FormatSelector value={value} onChange={onChange} />);
  return onChange;
}

describe("FormatSelector", () => {
  it("offers each dimension as its own group of choices", () => {
    renderSelector();

    // One group per dimension: 2 structures + 3 presentations + 2 modes = 7
    // radios - never one list of the twelve combined ones.
    expect(screen.getAllByRole("radio")).toHaveLength(7);

    for (const name of ["story_structure", "presentation_format", "content_mode"]) {
      const chosen = screen
        .getAllByRole("radio")
        .filter((input) => input.getAttribute("name") === name && (input as HTMLInputElement).checked);
      expect(chosen).toHaveLength(1);
    }
  });

  it("changes only the dimension the writer touched", () => {
    const onChange = renderSelector();

    fireEvent.click(screen.getByLabelText(/แชท/));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      story_structure: StoryStructure.MultiChapter, // untouched
      presentation_format: PresentationFormat.Chat, // changed
      content_mode: ContentMode.General, // untouched // untouched
    });
  });

  it("lets every combination be reached", () => {
    // Choosing chat must not restrict the structure, and choosing one-shot must
    // not restrict the presentation (docs/09 §14.4).
    const onChange = renderSelector({
      ...DEFAULT,
      presentation_format: PresentationFormat.Chat,
      content_mode: ContentMode.Headcanon,
    });

    fireEvent.click(screen.getByLabelText(/จบในตอนเดียว/));

    expect(onChange).toHaveBeenCalledWith({
      story_structure: StoryStructure.OneShot,
      presentation_format: PresentationFormat.Chat,
      content_mode: ContentMode.Headcanon,
    });
  });

  it("reflects the value it is given rather than holding its own", () => {
    render(
      <FormatSelector
        value={{
          story_structure: StoryStructure.OneShot,
          presentation_format: PresentationFormat.Chat,
          content_mode: ContentMode.Headcanon,
        }}
        onChange={vi.fn()}
      />,
    );

    const checked = screen
      .getAllByRole("radio")
      .filter((input) => (input as HTMLInputElement).checked)
      .map((input) => (input as HTMLInputElement).value);

    expect(checked.sort()).toEqual(["chat", "headcanon", "one_shot"]);
  });

  // docs/01 §15: explain the options in understandable language rather than
  // requiring the writer to understand technical terminology.
  it("describes each choice in plain Thai rather than its wire value", () => {
    renderSelector();

    expect(screen.getByText("หลายตอน")).toBeInTheDocument();
    expect(screen.getByText("จบในตอนเดียว")).toBeInTheDocument();
    expect(screen.getByText("ร้อยแก้ว")).toBeInTheDocument();
    expect(screen.getByText("แชทล้วน")).toBeInTheDocument();
    expect(screen.getByText("งานเฮดแคนอน")).toBeInTheDocument();

    // The raw values are never shown as labels.
    expect(screen.queryByText("multi_chapter")).not.toBeInTheDocument();
    expect(screen.queryByText("presentation_format")).not.toBeInTheDocument();
  });

  it("surfaces the API's per-dimension validation errors", () => {
    render(
      <FormatSelector
        value={DEFAULT}
        onChange={vi.fn()}
        errors={{ presentation_format: ["Must be one of: standard, chat."] }}
      />,
    );

    // role="alert" so a screen reader announces the rejection (docs/05 §31).
    expect(screen.getByRole("alert")).toHaveTextContent("Must be one of: standard, chat.");
  });

  it("can be disabled while a submission is in flight", () => {
    render(<FormatSelector value={DEFAULT} onChange={vi.fn()} disabled />);

    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).toBeDisabled();
    }
  });
});
