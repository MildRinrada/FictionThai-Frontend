import { describe, expect, it } from "vitest";

import {
  ContentMode,
  PresentationFormat,
  StoryStructure,
  formatBadges,
  readerKindFor,
  usesChapterNavigation,
  usesStructuredMessages,
} from "@/types/fiction";
import {
  AgeGate,
  AgeRating,
  ChapterStatus,
  MessageType,
  NovelStatus,
  OriginType,
  Visibility,
  type Chapter,
  type Novel,
} from "@/types/novel";

/**
 * The fiction resource contract.
 *
 * These assertions exist because docs/09 §51 forbids clients from inventing
 * their own interpretation of format values: if the shape here drifts from the
 * Go types, web and mobile stop agreeing about what a fiction is.
 */

function novel(overrides: Partial<Novel> = {}): Novel {
  return {
    id: "9f1c0f5e-0000-4000-8000-000000000001",
    slug: "example",
    title: "ตัวอย่างนิยาย",
    story_structure: StoryStructure.MultiChapter,
    presentation_format: PresentationFormat.Standard,
    content_mode: ContentMode.General,
    status: NovelStatus.Ongoing,
    // ตั้งค่าเพิ่มเติม (§13K) - always present on the wire, because a card
    // labels chapters with the unit and a reader sees the rights card.
    language: "th",
    chapter_unit: "ตอน",
    comment_access: "members",
    comment_approval: false,
    rights: {
      allow_screenshot: true,
      allow_translation: false,
      allow_derivative: false,
      allow_audio: false,
      require_credit: true,
    },
    // Always arrays on the wire (docs/08 §14, §15) - never null.
    genres: [],
    tags: [],
    author: { id: "author-1", username: "writer" },
    chapter_count: 3,
    uses_chapter_navigation: true,
    has_mixed_formats: false,
    // Required on create and always returned, because a card has to badge it
    // (docs/PHASE-13-CREATION-AND-CONTROL.md §13A).
    age_rating: AgeRating.General,
    age_gate: AgeGate.Warning,
    origin_type: OriginType.Original,
    // Always sent, so a client can render the reader's y/n control without a
    // second request (docs/PHASE-12-STORY-DEPTH.md §12B).
    // Display counters - always present, so a card never has to decide whether
    // a missing number means zero (docs/PHASE-12-STORY-DEPTH.md §12C).
    view_count: 0,
    like_count: 0,
    bookmark_count: 0,
    created_at: "2026-08-10T00:00:00Z",
    updated_at: "2026-08-10T00:00:00Z",
    is_owner: false,
    ...overrides,
  };
}

describe("the fiction resource", () => {
  // docs/08 §43 Rule 6: never a single collapsed `type` enum.
  it("carries the three dimensions as separate fields", () => {
    const fiction = novel({
      story_structure: StoryStructure.OneShot,
      presentation_format: PresentationFormat.Chat,
      content_mode: ContentMode.Headcanon,
    });

    expect(fiction.story_structure).toBe("one_shot");
    expect(fiction.presentation_format).toBe("chat");
    expect(fiction.content_mode).toBe("headcanon");
    expect(fiction).not.toHaveProperty("type");
    expect(fiction).not.toHaveProperty("mode");
  });

  it("accepts every one of the twelve combinations", () => {
    const combinations = Object.values(StoryStructure).flatMap((structure) =>
      Object.values(PresentationFormat).flatMap((presentation) =>
        Object.values(ContentMode).map((mode) =>
          novel({
            story_structure: structure,
            presentation_format: presentation,
            content_mode: mode,
          }),
        ),
      ),
    );

    expect(combinations).toHaveLength(12);
    for (const fiction of combinations) {
      expect(readerKindFor(fiction)).not.toBe("unsupported");
    }
  });

  // Presentation says nothing about structure, and vice versa (docs/09 §14.4).
  it("keeps structure and presentation independent", () => {
    const chatSerial = novel({
      story_structure: StoryStructure.MultiChapter,
      presentation_format: PresentationFormat.Chat,
    });
    expect(usesChapterNavigation(chatSerial)).toBe(true);
    expect(usesStructuredMessages(chatSerial)).toBe(true);

    const proseOneShot = novel({
      story_structure: StoryStructure.OneShot,
      presentation_format: PresentationFormat.Standard,
    });
    expect(usesChapterNavigation(proseOneShot)).toBe(false);
    expect(usesStructuredMessages(proseOneShot)).toBe(false);
  });

  // docs/09 §52: an unknown future value must degrade safely rather than
  // crashing or rendering the content wrongly.
  it("falls back safely for a presentation format it does not know", () => {
    const future = novel({
      presentation_format: "script" as PresentationFormat,
    });
    expect(readerKindFor(future)).toBe("unsupported");
    // The other dimensions still work, so the card and filters stay usable.
    expect(usesChapterNavigation(future)).toBe(true);
  });
});

describe("format badges", () => {
  // docs/08 §15.2: badges come from first-class format metadata, not from tags.
  it("derives badges from the format rather than from tags", () => {
    const badges = formatBadges(
      novel({
        story_structure: StoryStructure.OneShot,
        presentation_format: PresentationFormat.Chat,
        content_mode: ContentMode.Headcanon,
      }),
    );

    expect(badges.map((badge) => badge.dimension)).toEqual([
      "story_structure",
      "presentation_format",
      "content_mode",
    ]);
    expect(badges.every((badge) => badge.label.length > 0)).toBe(true);
  });

  it("stays quiet about the defaults", () => {
    const badges = formatBadges(novel());
    // Standard prose and general content are the norm; badging them would add
    // noise to every card.
    expect(badges.map((badge) => badge.dimension)).toEqual(["story_structure"]);
  });
});

describe("the chapter resource", () => {
  function chapter(overrides: Partial<Chapter> = {}): Chapter {
    return {
      id: "chapter-1",
      novel_id: "novel-1",
      chapter_number: 1,
      slug: "chapter-one",
      status: ChapterStatus.Published,
      word_count: 120,
      presentation_format: null,
      active_format: PresentationFormat.Standard,
      content_ready: true,
      message_count: 0,
      entry_count: 0,
      content_format: "plain",
      created_at: "2026-08-10T00:00:00Z",
      updated_at: "2026-08-10T00:00:00Z",
      content: null,
      messages: null,
      entries: null,
      entry_fields: [],
      is_owner: false,
      ...overrides,
    };
  }

  // docs/CONTENT-MODEL.md §6: a reader receives ONLY the active representation.
  it("models a standard reader's chapter as prose with no messages", () => {
    const prose = chapter({ content: "ฝนหยุดตกแล้ว", messages: null });

    expect(prose.content).toBe("ฝนหยุดตกแล้ว");
    expect(prose.messages).toBeNull();
    // Owner-only fields are absent, not false: the API omits them entirely.
    expect(prose.has_standard_content).toBeUndefined();
    expect(prose.has_chat_content).toBeUndefined();
  });

  it("models a chat reader's chapter as messages with no prose", () => {
    const chat = chapter({
      content: null,
      messages: [
        {
          id: "m1",
          position: 0,
          speaker_name: "Alice",
          message_type: MessageType.Message,
          content: "อยู่ไหน?",
          metadata: { side: "left" },
        },
        {
          id: "m2",
          position: 1,
          speaker_name: "Bob",
          message_type: MessageType.Message,
          content: "กำลังกลับ",
          metadata: { side: "right" },
        },
      ],
    });

    expect(chat.content).toBeNull();
    expect(chat.messages).toHaveLength(2);
    // Order is carried explicitly so a client never has to infer it.
    expect(chat.messages?.map((message) => message.position)).toEqual([0, 1]);
  });

  // The owner gets BOTH, which is what proves a format change destroyed nothing.
  it("gives the owner both representations after a format change", () => {
    const owned = chapter({
      is_owner: true,
      content: "Prose written before switching to chat.",
      messages: [],
      has_standard_content: true,
      has_chat_content: false,
      content_ready: false,
      message_count: 0,
      entry_count: 0,
    });

    expect(owned.content).not.toBeNull();
    expect(owned.has_standard_content).toBe(true);
    // The active representation is not prepared, so the writer sees a setup
    // state rather than the platform rewriting the manuscript (docs/08 §11).
    expect(owned.content_ready).toBe(false);
  });
});

describe("the documented enumerations", () => {
  it("matches the values the API stores", () => {
    expect(Object.values(NovelStatus)).toEqual([
      "draft",
      "ongoing",
      "completed",
      "hiatus",
      "cancelled",
    ]);
    // The ladder, widest first - the order the forms present (§13C).
    expect(Object.values(Visibility)).toEqual([
      "public",
      "members",
      "followers",
      "unlisted",
      "private",
    ]);
    expect(Object.values(ChapterStatus)).toEqual([
      "draft",
      "scheduled",
      "published",
      "unpublished",
    ]);
    expect(Object.values(MessageType)).toEqual(["message", "system", "separator"]);
  });
});
