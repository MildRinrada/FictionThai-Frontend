import { describe, expect, it } from "vitest";

import {
  POLICY_DOCS,
  POLICY_GROUPS,
  policyDoc,
  policyNeighbours,
  policySlotCount,
} from "@/features/policies/catalog";

/**
 * The policy scaffold's structure IS the deliverable (2026-08-17 brief):
 * ten documents, three groups, the agreed section outlines, placeholders in
 * every content slot. These tests pin the outline so a later edit that adds
 * or drops a section is a deliberate, visible decision.
 */

const EXPECTED_SECTIONS: Record<string, number> = {
  about: 4,
  terms: 12,
  privacy: 8,
  guidelines: 6,
  "content-policy": 5,
  takedown: 4,
  illegal: 6,
  ai: 5,
  security: 5,
  cookies: 4,
};

describe("policy catalog", () => {
  it("has the ten agreed documents, in brief order, in three groups", () => {
    expect(POLICY_DOCS.map((doc) => doc.slug)).toEqual([
      "about", "terms", "privacy",
      "guidelines", "content-policy", "takedown", "illegal",
      "ai", "security", "cookies",
    ]);
    // Group order follows the TOC, and every doc belongs to a known group.
    expect(POLICY_GROUPS).toHaveLength(3);
    for (const doc of POLICY_DOCS) {
      expect(POLICY_GROUPS).toContain(doc.group);
    }
  });

  it("keeps each document's agreed section count", () => {
    for (const doc of POLICY_DOCS) {
      expect(doc.sections, doc.slug).toHaveLength(EXPECTED_SECTIONS[doc.slug]);
    }
  });

  it("gives every document a full scaffold: lead, three TL;DR bullets, contacts", () => {
    for (const doc of POLICY_DOCS) {
      expect(doc.leadHint, doc.slug).not.toBe("");
      expect(doc.tldrHints, doc.slug).toHaveLength(3);
      expect(doc.contacts.length, doc.slug).toBeGreaterThanOrEqual(1);
      for (const section of doc.sections) {
        expect(section.slots.length, `${doc.slug} · ${section.heading}`)
          .toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("holds no real policy wording - every slot is a hint with a length", () => {
    for (const doc of POLICY_DOCS) {
      for (const section of doc.sections) {
        for (const slot of section.slots) {
          expect(slot.hint.trim(), `${doc.slug} · ${section.heading}`).not.toBe("");
          expect(slot.length.trim(), `${doc.slug} · ${section.heading}`).not.toBe("");
        }
      }
    }
  });

  it("uses an ordered list for the illegal-content steps, as the brief demands", () => {
    const illegal = policyDoc("illegal");
    const steps = illegal?.sections.find((s) => s.heading === "ขั้นตอนเมื่อได้รับแจ้ง");
    expect(steps?.slots.some((slot) => slot.kind === "ordered-list")).toBe(true);
  });

  it("wraps prev/next around the catalog", () => {
    expect(policyNeighbours("about").prev.slug).toBe("cookies");
    expect(policyNeighbours("cookies").next.slug).toBe("about");
    expect(policyNeighbours("terms").prev.slug).toBe("about");
  });

  it("counts fill-in slots for the checklist", () => {
    for (const doc of POLICY_DOCS) {
      // lead + 3 tldr + section slots + contact lead + 2 per contact
      const sectionSlots = doc.sections.reduce((n, s) => n + s.slots.length, 0);
      expect(policySlotCount(doc)).toBe(1 + 3 + sectionSlots + 1 + doc.contacts.length * 2);
    }
  });

  it("answers unknown slugs with undefined so the page can 404", () => {
    expect(policyDoc("advertising")).toBeUndefined();
  });
});
