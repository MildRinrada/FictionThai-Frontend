import { describe, expect, it } from "vitest";

import {
  outlineOf,
  runeLength,
  sectionAtIndex,
  sectionAtRune,
  totalWords,
} from "@/lib/outline";

/**
 * สารบัญในตอน (docs/EDITOR.md).
 *
 * What these tests defend is the ONE decision that makes the outline useful on
 * real chapters instead of empty on them: a Thai fiction writer separates a
 * section with a rule and a bold line, not with `##`, and the detector has to
 * read what writers actually type. The decoy in every fixture is the other
 * whole-bold paragraph - `**ตูม!**` in the middle of an action scene - which is
 * emphasis, not a heading, and is told apart by what precedes it.
 */

/** The shape of a real chapter: a title, a rule, a name, prose, a bang. */
const CHAPTER = [
  "_**“เมื่อหนุ่ม ๆ กับคุณรับน้องคลีมาเลี้ยง”**_",
  "**หมายเหตุ:** คุณเป็นสมาชิกสมาคมแม่มด",
  "---",
  "**เอเธอร์ (Aether)**",
  "คุณถอนหายใจ มองเอเธอร์ที่กำลังปาดเหงื่อ",
  "_**ตูม!**_",
  "แรงระเบิดทำให้ห้องนั่งเล่นอบอวลด้วยฝุ่นคราม",
  "---",
  "**จงหลี่ (Zhongli)**",
  "จงหลี่วางถ้วยชาลงอย่างช้า ๆ",
].join("\n\n");

describe("outlineOf", () => {
  it("reads a bold line after a rule as a heading, and the bang in between as prose", () => {
    const sections = outlineOf(CHAPTER);

    expect(sections.map((section) => section.title)).toEqual([
      "“เมื่อหนุ่ม ๆ กับคุณรับน้องคลีมาเลี้ยง”",
      "เอเธอร์ (Aether)",
      "จงหลี่ (Zhongli)",
    ]);
    // Every one of them was written as a bold line, not as `##`.
    expect(sections.every((section) => section.implicit)).toBe(true);
  });

  it("reads a real ## heading too, at both levels", () => {
    const sections = outlineOf("## บทที่หนึ่ง\n\nข้อความ\n\n### ฉากที่สอง\n\nข้อความ");

    expect(sections.map((s) => [s.title, s.level, s.implicit])).toEqual([
      ["บทที่หนึ่ง", 2, false],
      ["ฉากที่สอง", 3, false],
    ]);
  });

  it("drops the markers from a heading rather than showing them to the writer", () => {
    // Two bold runs on one line is what a writer gets from formatting a name
    // and its romanisation separately - and it used to read as stray asterisks.
    const sections = outlineOf("---\n\n**อเลโยชา** **(Alyosha)**\n\nข้อความ");

    expect(sections[0].title).toBe("อเลโยชา (Alyosha)");
  });

  it("refuses a bold line that is a sentence rather than a name", () => {
    const long = `**${"ก".repeat(200)}**`;

    expect(outlineOf(`---\n\n${long}\n\nข้อความ`)).toEqual([]);
  });

  it("gives a chapter with no headings no outline at all", () => {
    expect(outlineOf("ย่อหน้าหนึ่ง\n\nย่อหน้าสอง\n\nย่อหน้าสาม")).toEqual([]);
  });

  it("tiles the whole chapter, so the section counts add up to its total", () => {
    const sections = outlineOf(CHAPTER);

    // Nothing is left out: the last section reaches the end of the manuscript.
    expect(sections[0].index).toBe(0);
    expect(sections.at(-1)?.end).toBe(CHAPTER.length);
    for (let at = 1; at < sections.length; at += 1) {
      expect(sections[at].index).toBe(sections[at - 1].end);
    }
    expect(totalWords(sections, CHAPTER)).toBeGreaterThan(0);
  });

  it("keeps the words before the first heading as a section of their own", () => {
    const sections = outlineOf("เปิดเรื่องด้วยย่อหน้านี้\n\n---\n\n**เวนติ (Venti)**\n\nข้อความ");

    expect(sections[0].title).toBe("ก่อนหัวข้อแรก");
    expect(sections[0].index).toBe(0);
    expect(sections[1].title).toBe("เวนติ (Venti)");
  });

  it("points each heading at its own block, which is its element in the editor", () => {
    const sections = outlineOf(CHAPTER);

    // Blocks: 0 title, 1 note, 2 rule, 3 เอเธอร์ … 7 rule, 8 จงหลี่
    expect(sections.map((section) => section.blockIndex)).toEqual([0, 3, 8]);
  });
});

describe("a chapter the size of a real one", () => {
  /**
   * Built to the shape of the manuscript this feature was designed against: 38
   * character sections, each a rule, a bold name, and a few hundred words - and
   * a `**ตูม!**` inside several of them.
   */
  const long = Array.from({ length: 38 }, (_, at) =>
    [
      "---",
      `**ตัวละครที่ ${at + 1} (Character ${at + 1})**`,
      "ประโยคเปิดฉากที่ยาวพอสมควรสำหรับการทดสอบการนับคำในแต่ละหัวข้อ",
      "_**ตูม!**_",
      "ประโยคปิดฉากอีกหนึ่งย่อหน้าเพื่อให้แต่ละหัวข้อมีความยาวใกล้เคียงของจริง",
    ].join("\n\n"),
  ).join("\n\n");

  it("finds every section and no false one, and stays off the keystroke path", () => {
    const started = performance.now();
    const sections = outlineOf(long);
    const took = performance.now() - started;

    expect(sections).toHaveLength(38);
    expect(sections.some((section) => section.title.includes("ตูม"))).toBe(false);
    expect(sections[37].title).toBe("ตัวละครที่ 38 (Character 38)");
    // Well under the idle delay it runs behind (OUTLINE_IDLE_MS = 400ms). The
    // number that matters is that this is not free: it is why the outline and
    // the word count wait for a pause instead of running per keystroke.
    expect(took).toBeLessThan(400);
  });
});

describe("offsets", () => {
  it("counts runes, not UTF-16 units, so emoji cannot shift a finding", () => {
    expect(runeLength("ก")).toBe(1);
    expect(runeLength("🌅")).toBe(1);
    expect("🌅".length).toBe(2);
    expect(runeLength("a🌅ก")).toBe(3);
  });

  it("locates a finding in the section it was written in", () => {
    const sections = outlineOf(CHAPTER);
    const zhongli = sections[2];

    expect(sectionAtRune(sections, zhongli.runeStart + 2)).toBe(2);
    expect(sectionAtIndex(sections, zhongli.index + 2)).toBe(2);
    expect(sectionAtRune(sections, 1)).toBe(0);
    // Past the end of the manuscript belongs to no section rather than the last.
    expect(sectionAtRune(sections, 999_999)).toBe(-1);
    expect(sectionAtIndex(sections, -1)).toBe(-1);
  });

  it("keeps rune offsets and UTF-16 offsets in step through an emoji", () => {
    const withEmoji = "🌅 เปิดเรื่อง\n\n---\n\n**เคย่า (Kaeya)**\n\nข้อความ";
    const sections = outlineOf(withEmoji);
    const kaeya = sections[1];

    // The UTF-16 index is two units further along than the rune offset, which
    // is exactly the surrogate pair the emoji occupies.
    expect(kaeya.index - kaeya.runeStart).toBe(1);
    expect(sectionAtRune(sections, kaeya.runeStart)).toBe(1);
    expect(sectionAtIndex(sections, kaeya.index)).toBe(1);
  });
});
