import { beforeEach, describe, expect, it } from "vitest";

import { readLocalProgress, saveLocalProgress } from "@/lib/local-progress";

/**
 * Guest reading progress on the device (docs/03 §11).
 *
 * The properties that matter: a guest position round-trips, garbage never
 * crashes the reader, values are clamped to the same 0–100 the server
 * enforces, and storage stays bounded - "temporarily" is part of the
 * requirement.
 */

beforeEach(() => {
  window.localStorage.clear();
});

describe("local progress", () => {
  it("round-trips a guest position", () => {
    saveLocalProgress("novel-1", "chapter-9", 62.5);

    const stored = readLocalProgress("novel-1");
    expect(stored?.chapter_id).toBe("chapter-9");
    expect(stored?.progress_percent).toBe(62.5);
    expect(stored?.last_read_at).toBeTruthy();
  });

  it("returns null for a fiction never opened", () => {
    expect(readLocalProgress("never-opened")).toBeNull();
  });

  it("keeps positions per fiction", () => {
    saveLocalProgress("novel-1", "c1", 10);
    saveLocalProgress("novel-2", "c2", 90);

    expect(readLocalProgress("novel-1")?.chapter_id).toBe("c1");
    expect(readLocalProgress("novel-2")?.chapter_id).toBe("c2");
  });

  it("clamps the percentage to the same bounds the server enforces", () => {
    saveLocalProgress("novel-1", "c1", 150);
    expect(readLocalProgress("novel-1")?.progress_percent).toBe(100);

    saveLocalProgress("novel-1", "c1", -5);
    expect(readLocalProgress("novel-1")?.progress_percent).toBe(0);
  });

  it("treats corrupted storage as no memory rather than crashing", () => {
    window.localStorage.setItem("ft:progress:novel-1", "{not json");
    expect(readLocalProgress("novel-1")).toBeNull();

    window.localStorage.setItem("ft:progress:novel-2", JSON.stringify({ wrong: "shape" }));
    expect(readLocalProgress("novel-2")).toBeNull();
  });

  it("bounds how many guest positions are retained", () => {
    for (let index = 0; index < 60; index += 1) {
      saveLocalProgress(`novel-${index}`, "c1", index);
    }

    let stored = 0;
    for (let index = 0; index < window.localStorage.length; index += 1) {
      if (window.localStorage.key(index)?.startsWith("ft:progress:")) stored += 1;
    }
    expect(stored).toBeLessThanOrEqual(50);

    // The most recent position always survives eviction.
    expect(readLocalProgress("novel-59")).not.toBeNull();
  });
});
