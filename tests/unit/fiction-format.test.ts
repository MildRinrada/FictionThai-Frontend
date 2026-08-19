import { describe, expect, it } from "vitest";

import {
  ContentMode,
  type FictionFormat,
  PresentationFormat,
  StoryStructure,
  formatBadges,
  readerKindFor,
  usesChapterNavigation,
  usesStructuredMessages,
} from "@/types/fiction";

/**
 * These mirror `backend/internal/fiction/format_test.go`. Both clients and the
 * server must agree on what a format means (docs/09 §51), so the same rules are
 * asserted on both sides of the wire.
 */

function format(
  story: StoryStructure,
  presentation: PresentationFormat,
  mode: ContentMode,
): FictionFormat {
  return {
    story_structure: story,
    presentation_format: presentation,
    content_mode: mode,
  };
}

describe("reader selection", () => {
  it("routes standard fiction to the standard reader", () => {
    expect(
      readerKindFor(
        format(
          StoryStructure.MultiChapter,
          PresentationFormat.Standard,
          ContentMode.General,
        ),
      ),
    ).toBe("standard");
  });

  it("routes chat fiction to the chat reader", () => {
    expect(
      readerKindFor(
        format(StoryStructure.OneShot, PresentationFormat.Chat, ContentMode.General),
      ),
    ).toBe("chat");
  });

  // The third representation (§13J, 12F).
  it("routes headcanon fiction to the entries reader", () => {
    expect(
      readerKindFor(
        format(
          StoryStructure.MultiChapter,
          PresentationFormat.Headcanon,
          ContentMode.Headcanon,
        ),
      ),
    ).toBe("headcanon");
  });

  // docs/09 §52: a value this build does not know about must degrade safely
  // rather than crash or render the content in the wrong presentation.
  it("falls back safely for an unknown future presentation format", () => {
    const future = {
      story_structure: StoryStructure.OneShot,
      presentation_format: "script" as PresentationFormat,
      content_mode: ContentMode.General,
    };
    expect(readerKindFor(future)).toBe("unsupported");
  });
});

describe("reader capabilities", () => {
  // docs/15 §5.2: a one-shot is a single reading unit and must not show
  // chapter navigation.
  it("offers chapter navigation only for multi-chapter fiction", () => {
    expect(
      usesChapterNavigation(
        format(
          StoryStructure.MultiChapter,
          PresentationFormat.Standard,
          ContentMode.General,
        ),
      ),
    ).toBe(true);

    expect(
      usesChapterNavigation(
        format(
          StoryStructure.OneShot,
          PresentationFormat.Standard,
          ContentMode.General,
        ),
      ),
    ).toBe(false);
  });

  it("uses structured messages only for chat presentation", () => {
    expect(
      usesStructuredMessages(
        format(StoryStructure.OneShot, PresentationFormat.Chat, ContentMode.General),
      ),
    ).toBe(true);

    expect(
      usesStructuredMessages(
        format(StoryStructure.OneShot, PresentationFormat.Standard, ContentMode.General),
      ),
    ).toBe(false);
  });

  // The dimensions are independent: chat does not imply one-shot, and headcanon
  // does not imply anything about structure (docs/08 §2.3). Twelve since §13J
  // added a third presentation.
  it("keeps the three dimensions independent across all twelve combinations", () => {
    const combinations: FictionFormat[] = [];
    for (const story of Object.values(StoryStructure)) {
      for (const presentation of Object.values(PresentationFormat)) {
        for (const mode of Object.values(ContentMode)) {
          combinations.push(format(story, presentation, mode));
        }
      }
    }

    expect(combinations).toHaveLength(12);

    for (const combination of combinations) {
      expect(usesChapterNavigation(combination)).toBe(
        combination.story_structure === StoryStructure.MultiChapter,
      );
      expect(usesStructuredMessages(combination)).toBe(
        combination.presentation_format === PresentationFormat.Chat,
      );
    }
  });
});

describe("format badges", () => {
  it("labels the story structure", () => {
    const badges = formatBadges(
      format(StoryStructure.OneShot, PresentationFormat.Standard, ContentMode.General),
    );

    expect(badges.map((b) => b.dimension)).toEqual(["story_structure"]);
    expect(badges[0].label).toBe("เรื่องสั้นจบในตอน");
  });

  // "general" and "standard" are the defaults; badging them would put noise on
  // every card (docs/05 §19: avoid displaying too many numbers/labels).
  it("omits badges for the default presentation and content mode", () => {
    const badges = formatBadges(
      format(
        StoryStructure.MultiChapter,
        PresentationFormat.Standard,
        ContentMode.General,
      ),
    );

    expect(badges.map((b) => b.dimension)).not.toContain("presentation_format");
    expect(badges.map((b) => b.dimension)).not.toContain("content_mode");
  });

  it("badges chat and headcanon together when both apply", () => {
    const badges = formatBadges(
      format(StoryStructure.OneShot, PresentationFormat.Chat, ContentMode.Headcanon),
    );

    expect(badges.map((b) => b.dimension)).toEqual([
      "story_structure",
      "presentation_format",
      "content_mode",
    ]);
    expect(badges.map((b) => b.label)).toEqual([
      "เรื่องสั้นจบในตอน",
      "แชทล้วน",
      "งานเฮดแคนอน",
    ]);
  });

  it("never emits a badge without a label", () => {
    for (const story of Object.values(StoryStructure)) {
      for (const presentation of Object.values(PresentationFormat)) {
        for (const mode of Object.values(ContentMode)) {
          for (const badge of formatBadges(format(story, presentation, mode))) {
            expect(badge.label).toBeTruthy();
          }
        }
      }
    }
  });
});
