import { describe, expect, it } from "vitest";

import { collapseRepeats, splitAroundMatches } from "@/lib/community-content";

/**
 * Display-time hardening (docs/COMMUNITY-FEED.md): the stored post text is
 * untouched; only what the feed PAINTS is defended.
 */

describe("collapseRepeats", () => {
  it("collapses a 500-ก wall to 30", () => {
    const wall = "ก".repeat(500);
    expect(collapseRepeats(wall)).toBe("ก".repeat(30));
  });

  it("collapses runs inside surrounding text", () => {
    expect(collapseRepeats(`ฮา${"5".repeat(100)}จริง`)).toBe(
      `ฮา${"5".repeat(30)}จริง`,
    );
  });

  it("leaves text at or under the limit alone", () => {
    const fine = "ヴ".repeat(30) + " ปกติดี";
    expect(collapseRepeats(fine)).toBe(fine);
  });

  it("collapses emoji as characters, not surrogate halves", () => {
    const collapsed = collapseRepeats("😂".repeat(60));
    expect(collapsed).toBe("😂".repeat(30));
  });
});

describe("splitAroundMatches", () => {
  it("returns hits at odd indices, case-insensitively", () => {
    const parts = splitAroundMatches("อ่าน OOC แล้ว ooc อีก", "ooc");
    expect(parts).toEqual(["อ่าน ", "OOC", " แล้ว ", "ooc", " อีก"]);
  });

  it("treats regex metacharacters as literal text", () => {
    const parts = splitAroundMatches("ราคา (พิเศษ) วันนี้", "(พิเศษ)");
    expect(parts[1]).toBe("(พิเศษ)");
  });

  it("returns the whole text for a blank needle", () => {
    expect(splitAroundMatches("ทั้งก้อน", "  ")).toEqual(["ทั้งก้อน"]);
  });
});
