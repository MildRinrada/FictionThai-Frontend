import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HeadcanonView } from "@/components/reader/headcanon-view";
import { PresentationFormat } from "@/types/fiction";
import type { Character } from "@/types/character";
import { ContentFormat, type Chapter } from "@/types/novel";

/**
 * The headcanon set, both ends of it
 * (docs/PHASE-12-STORY-DEPTH.md §12F, docs/PHASE-13-CREATION-AND-CONTROL.md §13M).
 *
 * What is under test is the promise the content model makes: the composer holds
 * a topic whose entries carry a name, optional field values, an optional cast
 * link, and an optional picture - and none of it is destroyed by opening
 * another pane, because the panes send separate fields.
 */

const updateChapter = vi.fn();
const publishChapter = vi.fn();
const unpublishChapter = vi.fn();
const uploadMedia = vi.fn();
const refresh = vi.fn();

vi.mock("@/lib/novels-client", () => ({
  updateChapter: (...args: unknown[]) => updateChapter(...args),
  publishChapter: (...args: unknown[]) => publishChapter(...args),
  unpublishChapter: (...args: unknown[]) => unpublishChapter(...args),
}));

vi.mock("@/lib/media-client", () => ({
  uploadMedia: (...args: unknown[]) => uploadMedia(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

let ChapterEditor: typeof import("@/features/studio/chapter-editor").ChapterEditor;

beforeEach(async () => {
  ({ ChapterEditor } = await import("@/features/studio/chapter-editor"));
  updateChapter.mockResolvedValue({ active_format: PresentationFormat.Headcanon });
});

afterEach(() => {
  updateChapter.mockReset();
  publishChapter.mockReset();
  unpublishChapter.mockReset();
  uploadMedia.mockReset();
  refresh.mockReset();
});

const CAST: Character[] = [
  {
    id: "char-arin",
    novel_id: "n1",
    name: "อาริน",
    avatar_url: "https://cdn.example/media/avatar/arin.png",
    traits: [],
    details: [],
    position: 0,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  },
];

function chapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: "c1",
    novel_id: "n1",
    chapter_number: 1,
    slug: "chapter-1",
    status: "draft",
    word_count: 0,
    presentation_format: null,
    active_format: PresentationFormat.Headcanon,
    content_ready: false,
    message_count: 0,
    entry_count: 0,
    content_format: ContentFormat.Markdown,
    content: null,
    messages: null,
    entries: [
      {
        id: "e1",
        position: 0,
        name: "อาริน",
        values: ["75%"],
        body: "อารินเป็นคนอบอุ่นและเป็นมิตร",
      },
    ],
    entry_fields: ["เปอร์เซ็นต์ที่จีบติด"],
    is_owner: true,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function editor(overrides: Partial<Chapter> = {}, characters: Character[] = CAST) {
  return render(
    <ChapterEditor
      novelRef="my-novel"
      chapter={chapter(overrides)}
      characters={characters}
    />,
  );
}

/**
 * The card for one entry, found by the name FIELD it contains - the cast
 * select shows the same text once an entry is linked, so the tag matters.
 */
function entryCard(name: string): HTMLElement {
  const field = screen
    .getAllByDisplayValue(name)
    .find((element) => element.tagName === "INPUT");
  const card = field?.closest("li");
  if (!card) throw new Error(`no entry card for ${name}`);
  return card;
}

describe("the headcanon topic", () => {
  // The title field is one input asking two different questions. A headcanon
  // set's title is the topic every entry answers, so the label says so.
  it("names the title field as the topic when the headcanon pane is open", () => {
    editor();
    expect(screen.getByLabelText("หัวข้อของชุดนี้")).toBeInTheDocument();
    expect(screen.getByText(/เฮดแคนอนหนึ่งชุด = หัวข้อเดียว/)).toBeInTheDocument();
  });

  it("says out loud that fields are optional", () => {
    editor();
    expect(screen.getByText(/ไม่มีฟิลด์ก็ได้/)).toBeInTheDocument();
  });

  // ONE field per topic (editor review 2026-08): its answer rides the name
  // line - เอเธอร์ | เปอร์เซ็นต์ที่จีบติด: 20% - and a name line carries one
  // clause. With a field already present, the add button stands down.
  it("caps the topic at one field", () => {
    editor();
    expect(
      screen.queryByRole("button", { name: "+ เพิ่มฟิลด์" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/ต่อท้ายชื่อ/)).toBeInTheDocument();
  });

  // Adding the first label must not slide existing answers onto a heading they
  // were not written for, so every entry gains a matching empty slot.
  it("keeps answers aligned when the first field is added", () => {
    editor({
      entry_fields: [],
      entries: [
        { id: "e1", position: 0, name: "อาริน", values: [], body: "อบอุ่น" },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "+ เพิ่มฟิลด์" }));

    const card = entryCard("อาริน");
    expect(within(card).getByLabelText("ฟิลด์ 1")).toHaveValue("");
    // The button is spent: the one slot exists now.
    expect(
      screen.queryByRole("button", { name: "+ เพิ่มฟิลด์" }),
    ).not.toBeInTheDocument();
  });
});

describe("linking an entry to the cast", () => {
  it("offers the fiction's characters and leaves the link optional", () => {
    editor();
    const select = screen.getByLabelText("ผูกกับตัวละครในเรื่อง");
    expect(select).toHaveValue("");
    expect(within(select as HTMLSelectElement).getByText("อาริน")).toBeInTheDocument();
  });

  // An entry may be about someone with no record at all (12F keeps the name
  // denormalised for exactly that), so a fiction with an empty cast gets no
  // control instead of an empty one.
  it("asks nothing when the fiction has no cast yet", () => {
    editor({}, []);
    expect(screen.queryByLabelText("ผูกกับตัวละครในเรื่อง")).not.toBeInTheDocument();
  });

  it("borrows the character's avatar for display, and sends only the link", async () => {
    editor();
    fireEvent.change(screen.getByLabelText("ผูกกับตัวละครในเรื่อง"), {
      target: { value: "char-arin" },
    });

    const card = entryCard("อาริน");
    expect(within(card).getByRole("link", { name: /ดูข้อมูลตัวละคร/ })).toHaveAttribute(
      "href",
      "/studio/novels/my-novel/characters",
    );

    fireEvent.click(screen.getByRole("button", { name: "บันทึกแบบร่าง" }));
    await waitFor(() => expect(updateChapter).toHaveBeenCalled());

    const sent = updateChapter.mock.calls[0][2];
    expect(sent.entries[0].character_id).toBe("char-arin");
    // The avatar is borrowed, never copied - re-picturing the cast member has
    // to keep flowing through.
    expect(sent.entries[0].image_url).toBeNull();
  });
});

describe("a picture on an entry (§13M)", () => {
  it("uploads against the fiction and keeps the URL the API returned", async () => {
    uploadMedia.mockResolvedValue({ url: "https://cdn.example/media/entry_image/x.png" });
    editor();

    const card = entryCard("อาริน");
    const picker = card.querySelector('input[type="file"]');
    fireEvent.change(picker as HTMLInputElement, {
      target: { files: [new File(["x"], "arin.png", { type: "image/png" })] },
    });

    await waitFor(() => expect(uploadMedia).toHaveBeenCalled());
    expect(uploadMedia.mock.calls[0][0]).toMatchObject({
      purpose: "entry_image",
      novel: "my-novel",
    });

    fireEvent.click(screen.getByRole("button", { name: "บันทึกแบบร่าง" }));
    await waitFor(() => expect(updateChapter).toHaveBeenCalled());
    expect(updateChapter.mock.calls[0][2].entries[0].image_url).toBe(
      "https://cdn.example/media/entry_image/x.png",
    );
  });

  // Removing the picture clears the reference. Deleting the stored bytes would
  // be a destructive act triggered by an edit, and a revision restore has to
  // still find the file (docs/CONTENT-MODEL.md §5).
  it("clears only the reference when the writer takes the picture off", async () => {
    editor({
      entries: [
        {
          id: "e1",
          position: 0,
          name: "อาริน",
          values: [],
          body: "",
          image_url: "https://cdn.example/media/entry_image/x.png",
        },
      ],
      entry_fields: [],
    });

    fireEvent.click(screen.getByRole("button", { name: "เอารูปออก" }));
    fireEvent.click(screen.getByRole("button", { name: "บันทึกแบบร่าง" }));

    await waitFor(() => expect(updateChapter).toHaveBeenCalled());
    expect(updateChapter.mock.calls[0][2].entries[0].image_url).toBeNull();
  });

  it("reports a failed upload without losing the entry", async () => {
    const { ApiError } = await import("@/lib/api");
    uploadMedia.mockRejectedValue(
      new ApiError(413, { code: "PAYLOAD_TOO_LARGE", message: "The file is too large." }),
    );
    editor();

    const picker = entryCard("อาริน").querySelector('input[type="file"]');
    fireEvent.change(picker as HTMLInputElement, {
      target: { files: [new File(["x"], "big.png", { type: "image/png" })] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("The file is too large.");
    expect(screen.getByDisplayValue("อาริน")).toBeInTheDocument();
  });
});

describe("HeadcanonView", () => {
  it("shows the author's picture above the body", () => {
    render(
      <HeadcanonView
        fields={["เปอร์เซ็นต์ที่จีบติด"]}
        entries={[
          {
            id: "e1",
            position: 0,
            name: "อาริน",
            values: ["75%"],
            body: "อารินเป็นคนอบอุ่น",
            image_url: "https://cdn.example/media/entry_image/x.png",
          },
        ]}
      />,
    );

    const image = screen.getByAltText("ภาพประกอบของ อาริน");
    expect(image).toHaveAttribute("src", "https://cdn.example/media/entry_image/x.png");
    expect(image).toHaveAttribute("loading", "lazy");
  });

  it("renders an entry with no picture unchanged", () => {
    render(
      <HeadcanonView
        fields={[]}
        entries={[{ id: "e1", position: 0, name: "เธียร", values: [], body: "เขาพกความเงียบ" }]}
      />,
    );

    expect(screen.getByText("เธียร")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  // The field's answer rides the NAME LINE, joined by a pipe (editor review
  // 2026-08): เอเธอร์ | เปอร์เซ็นต์ที่จีบติด: 75% - one line, one clause.
  it("joins the field's answer onto the name line with a pipe", () => {
    render(
      <HeadcanonView
        fields={["เปอร์เซ็นต์ที่จีบติด"]}
        entries={[
          { id: "e1", position: 0, name: "อาริน", values: ["75%"], body: "" },
        ]}
      />,
    );

    expect(screen.getByRole("heading")).toHaveTextContent(
      "อาริน | เปอร์เซ็นต์ที่จีบติด: 75%",
    );
  });
});
