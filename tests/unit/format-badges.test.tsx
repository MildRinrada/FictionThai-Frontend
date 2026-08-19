import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FormatBadges } from "@/components/fiction/format-badges";
import { ContentMode, PresentationFormat, StoryStructure } from "@/types/fiction";

describe("<FormatBadges />", () => {
  it("renders a badge for each applicable dimension", () => {
    render(
      <FormatBadges
        format={{
          story_structure: StoryStructure.OneShot,
          presentation_format: PresentationFormat.Chat,
          content_mode: ContentMode.Headcanon,
        }}
      />,
    );

    expect(screen.getByText("เรื่องสั้นจบในตอน")).toBeInTheDocument();
    expect(screen.getByText("แชทล้วน")).toBeInTheDocument();
    expect(screen.getByText("งานเฮดแคนอน")).toBeInTheDocument();
  });

  // docs/05 §31: meaning must not be communicated by colour alone, so each
  // badge carries a screen-reader label naming its dimension.
  it("names each dimension for screen readers", () => {
    render(
      <FormatBadges
        format={{
          story_structure: StoryStructure.MultiChapter,
          presentation_format: PresentationFormat.Chat,
          content_mode: ContentMode.General,
        }}
      />,
    );

    expect(screen.getByText("รูปแบบเรื่อง:")).toBeInTheDocument();
    expect(screen.getByText("รูปแบบการนำเสนอ:")).toBeInTheDocument();
  });

  it("exposes the badges as a labelled list", () => {
    render(
      <FormatBadges
        format={{
          story_structure: StoryStructure.MultiChapter,
          presentation_format: PresentationFormat.Standard,
          content_mode: ContentMode.General,
        }}
      />,
    );

    expect(screen.getByRole("list", { name: "รูปแบบของนิยาย" })).toBeInTheDocument();
  });
});
