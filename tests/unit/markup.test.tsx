import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProseView } from "@/components/reader/prose-view";
import {
  isOwnImage,
  parseBlocks,
  parseInline,
  safeHref,
  safeImageSrc,
} from "@/lib/markup";
import { fromDOM, toHTML } from "@/lib/markup-dom";
import { ContentFormat } from "@/types/novel";

/**
 * The chapter content model (§13N).
 *
 * Four properties are load-bearing and every test below is one of them:
 *
 *   1. A chapter written before the editor existed still renders as the literal
 *      text it was written as. The platform never decides an author meant markup.
 *   2. Nothing reaches the reader as markup except through the closed
 *      vocabulary - no HTML, no scheme a link may not carry, no image from a
 *      host the reader did not choose (docs/11 §17, §34, docs/13 §38).
 *   3. The editor round trip is LOSSLESS for the vocabulary and TOTAL for
 *      everything else: markup it does not recognise costs its formatting,
 *      never the author's words.
 *   4. The paragraph indent is content, and it is there from the first line.
 */

/** Serializes an HTML fragment the way the live editor's surface would. */
function serialize(html: string): string {
  const host = document.createElement("div");
  host.innerHTML = html;
  return fromDOM(host);
}

describe("blocks", () => {
  it("keeps one blank-line chunk as one block, so paragraph indices survive", () => {
    // 12G anchors comments on content.split(/\n{2,}/); a parser that split a
    // paragraph further would move every comment in the chapter.
    const blocks = parseBlocks("ย่อหน้าแรก\nบรรทัดสอง\n\nย่อหน้าที่สอง");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({
      kind: "paragraph",
      text: "ย่อหน้าแรก\nบรรทัดสอง",
      align: "start",
    });
  });

  // A block's kind comes from its FIRST line. A paragraph that happens to
  // contain a dash-led line is still one paragraph, not a list.
  it("does not turn a mid-paragraph dash into a list", () => {
    const blocks = parseBlocks("เขาพูดว่า\n- แล้วก็เงียบไป");
    expect(blocks[0].kind).toBe("paragraph");
  });

  it("reads lists, quotes, headings, and separators", () => {
    expect(parseBlocks("- หนึ่ง\n- สอง")).toEqual([
      { kind: "list", ordered: false, items: ["หนึ่ง", "สอง"] },
    ]);
    expect(parseBlocks("1. หนึ่ง\n2. สอง")[0]).toMatchObject({ ordered: true });
    expect(parseBlocks("> คำพูด")[0]).toEqual({ kind: "quote", text: "คำพูด" });
    expect(parseBlocks("## บทที่")[0]).toEqual({
      kind: "heading",
      level: 2,
      text: "บทที่",
      align: "start",
    });
    expect(parseBlocks("---")[0]).toEqual({ kind: "rule" });
  });
});

describe("inline spans", () => {
  it("prefers the pair over the single marker", () => {
    expect(parseInline("**หนา**")).toEqual([
      { kind: "strong", children: [{ kind: "text", text: "หนา" }] },
    ]);
  });

  // An unclosed marker is text the author typed. Swallowing the rest of the
  // manuscript would be the parser deciding what they meant.
  it("leaves an unmatched marker as text", () => {
    expect(parseInline("เขา **เริ่มพูด")).toEqual([
      { kind: "text", text: "เขา **เริ่มพูด" },
    ]);
  });

  it("never lets a link carry an executable scheme", () => {
    expect(safeHref("https://example.com")).toBe("https://example.com");
    expect(safeHref("/novel/some-slug")).toBe("/novel/some-slug");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,<script>")).toBeNull();
    expect(safeHref("//evil.example")).toBeNull();
  });
});

describe("ProseView", () => {
  const MARKED = "**หนา** และ *เอียง*\n\n- หนึ่ง\n- สอง";

  // The whole reason the discriminator column exists.
  it("renders a pre-13N chapter as the literal text it was written as", () => {
    render(<ProseView content={MARKED} />);
    expect(screen.getByText(/\*\*หนา\*\*/)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("renders a formatted chapter through the vocabulary", () => {
    render(<ProseView content={MARKED} format={ContentFormat.Markdown} />);
    expect(screen.getByText("หนา").tagName).toBe("STRONG");
    expect(screen.getByText("เอียง").tagName).toBe("EM");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("keeps an author's words when the link scheme is refused", () => {
    render(
      <ProseView
        content="[กดที่นี่](javascript:void)"
        format={ContentFormat.Markdown}
      />,
    );
    expect(screen.getByText("กดที่นี่")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("gives a real link no window handle back", () => {
    render(
      <ProseView content="[อ่านต่อ](https://example.com)" format={ContentFormat.Markdown} />,
    );
    const link = screen.getByRole("link", { name: "อ่านต่อ" });
    expect(link).toHaveAttribute("rel", "nofollow noopener noreferrer");
  });
});

/**
 * The WYSIWYG round trip.
 *
 * The editor shows bold as bold, which means the manuscript now makes a trip
 * through a DOM and back on every keystroke. These are the tests that make that
 * safe: everything in the vocabulary survives, and everything outside it loses
 * its formatting rather than its text.
 */
describe("the editor round trip", () => {
  const CASES: Array<[string, string]> = [
    ["prose", "　　เขาเดินเข้ามา\nแล้วก็เงียบไป"],
    // Italic serialises as `_x_` since §13R. `*` still PARSES as italic - a
    // manuscript written before the change reads exactly as it did - but it is
    // no longer written, because `**` wrapped around `*x*` produces `***x***`
    // and leaves stray asterisks in an author's sentence.
    ["bold and italic", "**หนา** และ _เอียง_"],
    ["bold inside italic", "_เอียงและ **หนา** ด้วย_"],
    ["underline and strike", "__ขีดเส้นใต้__ กับ ~~ขีดฆ่า~~"],
    ["sub and sup", "H~2~O และ E=mc^2^"],
    ["colour", "{red|เลือด} และ {bg-yellow|สำคัญ}"],
    ["a heading", "## บทที่หนึ่ง"],
    ["a quote", "> เขาบอกว่าอย่ารอ"],
    ["a bullet list", "- หนึ่ง\n- สอง"],
    ["an ordered list", "1. หนึ่ง\n2. สอง"],
    ["a separator", "ก่อน\n\n---\n\nหลัง"],
    ["a link", "[อ่านต่อ](https://example.com)"],
    ["an image", "![ภาพ](/media/chapter_image/x.png)"],
    ["centred text", ":center: กลางหน้า"],
    ["several blocks", "ย่อหน้าแรก\n\n## หัวข้อ\n\n- หนึ่ง\n- สอง"],
  ];

  it.each(CASES)("survives a trip through the editor: %s", (_name, markdown) => {
    expect(serialize(toHTML(markdown))).toBe(markdown);
  });

  // The property that matters most. A browser's execCommand emits tags this
  // serializer was not written for; an author's words must come back anyway.
  it("keeps the words when the markup is unrecognised", () => {
    expect(serialize("<p><font color=\"#ff0000\">เขาเดิน</font>ไป</p>")).toBe(
      "เขาเดินไป",
    );
    expect(serialize("<p><custom-tag>คำของผู้เขียน</custom-tag></p>")).toBe(
      "คำของผู้เขียน",
    );
  });

  /**
   * Text dragged in from another site (§13R).
   *
   * It arrives wearing that site's formatting as inline STYLE rather than as
   * tags, and the serializer used to drop all of it - a writer moving a chapter
   * here watched their bold-italic prose arrive flat. Only the four the
   * vocabulary already has are read; a pasted hex colour or font size is still
   * dropped on purpose, because the palette exists so a manuscript stays
   * legible in both themes.
   */
  it("reads formatting a paste carries as inline style", () => {
    expect(serialize('<p><span style="font-weight:700">หนา</span></p>')).toBe("**หนา**");
    expect(serialize('<p><span style="font-style:italic">เอียง</span></p>')).toBe(
      "_เอียง_",
    );
    expect(
      serialize('<p><span style="font-weight:bold;font-style:italic">ทั้งคู่</span></p>'),
    ).toBe("**_ทั้งคู่_**");
    expect(
      serialize('<p><span style="text-decoration:line-through">ฆ่า</span></p>'),
    ).toBe("~~ฆ่า~~");
    // A colour from somewhere else is still not a colour here.
    expect(serialize('<p><span style="color:#f0f0f0">คำ</span></p>')).toBe("คำ");
  });

  it("reads the tags a browser actually produces", () => {
    expect(serialize("<p><strong>ก</strong><em>ข</em><strike>ค</strike></p>")).toBe(
      "**ก**_ข_~~ค~~",
    );
    expect(serialize("<div>บรรทัด</div>")).toBe("บรรทัด");
  });

  /**
   * Bold AND italic on one run (§13R).
   *
   * The bug this fixes was visible to a writer: pasting a bold-italic sentence
   * put literal asterisks in the middle of their prose. `**` around `*x*` is
   * `***x***`, which the parser reads as `**` … `**` with an asterisk left
   * over. Italic writes `_` now, so the pair nests either way round - and the
   * three-asterisk form is still READ, because chapters were saved in it.
   */
  it("survives bold and italic nested either way round", () => {
    expect(serialize("<p><b><i>ทั้งคู่</i></b></p>")).toBe("**_ทั้งคู่_**");
    expect(serialize("<p><i><b>ทั้งคู่</b></i></p>")).toBe("_**ทั้งคู่**_");
    expect(serialize("<p><b>นำ <i>ตาม</i></b></p>")).toBe("**นำ _ตาม_**");
    // And what the old serializer wrote still reads as what it meant.
    expect(toHTML("***ทั้งคู่***")).toBe("<p><b><i>ทั้งคู่</i></b></p>");
  });

  /**
   * Pressing ตัวยก twice is a switch, not a stack (§13R).
   *
   * A browser will happily nest <sup> inside <sup> on a collapsed caret, and
   * writing that out as `^^x^^` hands the author a manuscript with visible
   * carets in it.
   */
  it("writes one marker for a doubled tag", () => {
    expect(serialize("<p><sup><sup>2</sup></sup></p>")).toBe("^2^");
    expect(serialize("<p><b>หนา <b>ซ้อน</b></b></p>")).toBe("**หนา ซ้อน**");
  });

  // Pressing bold on nothing must not leave `****` behind in the manuscript.
  it("writes no marker around an empty span", () => {
    expect(serialize("<p><b></b>เขาเดิน</p>")).toBe("เขาเดิน");
  });

  // A marker inside the surrounding spaces, or it does not parse back at all.
  it("puts the markers inside the whitespace", () => {
    expect(serialize("<p>เขา<b> เดิน </b>ไป</p>")).toBe("เขา **เดิน** ไป");
  });

  /**
   * An image from another site (§13R).
   *
   * It used to be refused outright, on the grounds that a remote image hands
   * the reader's IP to a host they never chose. That cost more than it bought:
   * a writer moving their fiction here pastes chapters whose pictures live on
   * the site they came from, and every one of them silently became its alt
   * text - which looks exactly like the platform eating the picture.
   *
   * What is still refused is the part that was ever dangerous: a scheme that
   * executes. And the renderer sends `referrerpolicy="no-referrer"` with every
   * remote image, so the third party learns nothing about WHICH chapter is
   * open.
   */
  it("allows a remote image but never an executable scheme", () => {
    expect(safeImageSrc("/media/chapter_image/x.png")).toBe("/media/chapter_image/x.png");
    expect(safeImageSrc("https://images.example/cover.jpg")).toBe(
      "https://images.example/cover.jpg",
    );
    expect(safeImageSrc("javascript:alert(1)")).toBeNull();
    expect(safeImageSrc("data:image/svg+xml,<svg onload=alert(1)>")).toBeNull();
    expect(safeImageSrc("  ")).toBeNull();

    // And it round-trips rather than collapsing to its alt text.
    expect(
      serialize('<p><img src="https://images.example/p.gif" alt="คำอธิบาย"></p>'),
    ).toBe("![คำอธิบาย](https://images.example/p.gif)");
  });

  /**
   * The width a writer chose for a picture (§13S).
   *
   * A percentage of the reading column, not pixels: the measure a chapter is
   * read at is the READER's setting, so "half the column" survives a phone and
   * a desktop where "400px" is right on exactly one of them.
   */
  it("round-trips the width a writer set on an image", () => {
    expect(toHTML("![ภาพ](/media/chapter_image/x.png =50%)")).toContain(
      'style="width:50%"',
    );
    expect(
      serialize('<p><img src="/media/chapter_image/x.png" alt="ภาพ" style="width:50%"></p>'),
    ).toBe("![ภาพ](/media/chapter_image/x.png =50%)");
  });

  it("records no width for a full-width image", () => {
    // 100% is the natural size, so the manuscript says nothing about it -
    // an unmarked image is one whose author never chose a size.
    expect(
      serialize('<p><img src="/media/chapter_image/x.png" alt="ภาพ" style="width:100%"></p>'),
    ).toBe("![ภาพ](/media/chapter_image/x.png)");
    // A pixel width is the browser's, not the author's, and is not carried.
    expect(
      serialize('<p><img src="/media/chapter_image/x.png" alt="ภาพ" style="width:412px"></p>'),
    ).toBe("![ภาพ](/media/chapter_image/x.png)");
  });

  it("tells its own images apart from everyone else's", () => {
    expect(isOwnImage("/media/chapter_image/x.png")).toBe(true);
    expect(isOwnImage("https://cdn.fictionthai.test/media/entry_image/y.png")).toBe(true);
    expect(isOwnImage("https://images.example/cover.jpg")).toBe(false);
  });

  it("gives an empty manuscript a line to type on", () => {
    expect(toHTML("")).toBe("<p><br></p>");
    expect(serialize(toHTML(""))).toBe("");
  });
});

/**
 * ย่อหน้าอัตโนมัติ, as a display rule (§13Q).
 *
 * It used to type two ideographic spaces into the manuscript, which is why it
 * could be deleted by accident, never survived a paste, and had to be
 * re-inserted on every Enter. It is CSS now - so the assertions are about what
 * the markup DOES NOT contain, and about the one paragraph that has to opt out.
 */
describe("the paragraph indent", () => {
  it("puts no characters in the manuscript", () => {
    expect(toHTML("เขาเดินเข้ามา")).toBe("<p>เขาเดินเข้ามา</p>");
    expect(serialize(toHTML("เขาเดินเข้ามา"))).toBe("เขาเดินเข้ามา");
  });

  // The chapters written under the old behaviour still carry those spaces, and
  // they are the author's text. They are never stripped; the CSS rule stands
  // down in front of them so the paragraph is not indented twice.
  it("stands down in front of an indent that was typed", () => {
    expect(toHTML("　　เขาเดินเข้ามา")).toBe(
      '<p class="ft-typed-indent">　　เขาเดินเข้ามา</p>',
    );
    // And the characters survive the round trip untouched.
    expect(serialize(toHTML("　　เขาเดินเข้ามา"))).toBe("　　เขาเดินเข้ามา");
  });

  it("marks a typed indent on the reader's page too", () => {
    const { container } = render(
      <ProseView content={"　　ย่อหน้าเก่า\n\nย่อหน้าใหม่"} />,
    );
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs[0].className).toContain("ft-typed-indent");
    expect(paragraphs[1].className).not.toContain("ft-typed-indent");
  });
});
