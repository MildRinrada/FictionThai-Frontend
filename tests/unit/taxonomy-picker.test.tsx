import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { GenreKind, type Genre } from "@/types/taxonomy";

/**
 * Genre and tag selection.
 *
 * What matters: the two vocabularies stay distinct controls (docs/08 §14,
 * §15), a writer can only SELECT genres - never type one - free-form tags
 * resolve through the server's single creation path, and a server rejection
 * (the format-metadata ban above all) is shown verbatim rather than being
 * re-implemented here.
 *
 * Since §13S the controlled vocabulary answers three questions rather than one,
 * and the tests below cover the two things that adds: the questions are asked
 * separately, and the AU one is a switch before it is a list.
 */

const getGenres = vi.fn();
const createTag = vi.fn();

vi.mock("@/lib/discovery-client", () => ({
  getGenres: (...args: unknown[]) => getGenres(...args),
  createTag: (...args: unknown[]) => createTag(...args),
}));

let TaxonomyPicker: typeof import("@/features/novels/taxonomy-picker").TaxonomyPicker;

beforeEach(async () => {
  ({ TaxonomyPicker } = await import("@/features/novels/taxonomy-picker"));
});

afterEach(() => {
  getGenres.mockReset();
  createTag.mockReset();
});

const AT = "2026-08-10T00:00:00Z";

// The vocabulary answers three questions since §13S. The fixture carries all
// three so the grouping, the AU switch, and the shared cap are all exercised.
const GENRES: Genre[] = [
  { id: "g1", name: "แฟนตาซี", slug: "fantasy", kind: GenreKind.Content, created_at: AT },
  { id: "g2", name: "โรแมนติก", slug: "romance", kind: GenreKind.Content, created_at: AT },
  { id: "g3", name: "สยองขวัญ", slug: "horror", kind: GenreKind.Content, created_at: AT },
  { id: "g4", name: "ดราม่าปวดตับ", slug: "drama", kind: GenreKind.Content, created_at: AT },
  {
    id: "r1",
    name: "Boy's Love (BL)",
    slug: "bl",
    kind: GenreKind.Relationship,
    created_at: AT,
  },
  { id: "a1", name: "AU มหาลัย", slug: "au-campus", kind: GenreKind.AU, created_at: AT },
];

function renderPicker(overrides: Partial<Parameters<typeof TaxonomyPicker>[0]> = {}) {
  const onGenresChange = vi.fn();
  const onTagsChange = vi.fn();
  render(
    <TaxonomyPicker
      genreIDs={[]}
      tags={[]}
      onGenresChange={onGenresChange}
      onTagsChange={onTagsChange}
      {...overrides}
    />,
  );
  return { onGenresChange, onTagsChange };
}

describe("genre selection", () => {
  it("offers the server's controlled vocabulary as checkboxes", async () => {
    getGenres.mockResolvedValue(GENRES);
    renderPicker();

    // Selection only - there is no way to type a new genre into existence.
    expect(await screen.findByText("แฟนตาซี")).toBeInTheDocument();
    // The AU list is behind its switch, so only content and relationship show.
    expect(screen.getAllByRole("checkbox")).toHaveLength(5);
  });

  it("toggles a genre without touching the others", async () => {
    getGenres.mockResolvedValue(GENRES);
    const { onGenresChange } = renderPicker({ genreIDs: ["g1"] });

    await screen.findByText("แฟนตาซี");
    fireEvent.click(screen.getByLabelText("โรแมนติก"));

    expect(onGenresChange).toHaveBeenCalledWith(["g1", "g2"]);
  });

  it("stops at the shared limit across all three questions", async () => {
    getGenres.mockResolvedValue(GENRES);
    const { onGenresChange } = renderPicker({
      genreIDs: ["g1", "g2", "g3", "g4", "r1", "x1", "x2", "x3"],
    });

    await screen.findByText("ดราม่าปวดตับ");
    fireEvent.click(screen.getByLabelText("Boy's Love (BL)"));

    // Already selected, so this DESELECTS - the cap never blocks removal.
    expect(onGenresChange).toHaveBeenCalledWith([
      "g1",
      "g2",
      "g3",
      "g4",
      "x1",
      "x2",
      "x3",
    ]);

    onGenresChange.mockClear();
    // An unselected one at the cap is refused client-side; the API enforces
    // the same limit regardless.
    fireEvent.click(screen.getByLabelText("โรแมนติก"));
    expect(onGenresChange).toHaveBeenCalled();
  });

  /**
   * §13S - the three questions are asked separately.
   *
   * A BL campus romance used to have to spend its three genre slots choosing
   * between "โรแมนติก", "BL", and the AU, and drop one of its own facts.
   */
  it("asks about content, relationship, and AU as separate questions", async () => {
    getGenres.mockResolvedValue(GENRES);
    renderPicker();

    expect(await screen.findByText("หมวดหมู่ตามเนื้อหา")).toBeInTheDocument();
    expect(screen.getByText("ความสัมพันธ์ในเรื่อง")).toBeInTheDocument();
    expect(screen.getByText("เรื่องนี้เป็น AU ไหม")).toBeInTheDocument();
  });

  // "No" is the commonest answer, so the AU chips stay out of the way until a
  // writer says otherwise.
  it("keeps the AU list behind its switch", async () => {
    getGenres.mockResolvedValue(GENRES);
    renderPicker();

    await screen.findByText("เรื่องนี้เป็น AU ไหม");
    expect(screen.queryByLabelText("AU มหาลัย")).not.toBeInTheDocument();

    // A RADIO CARD since the settings review: the one either/or on the form
    // no longer answers in a different dialect from the rest. The accessible
    // name carries the card's hint too, so the match is by prefix.
    fireEvent.click(screen.getByRole("radio", { name: /ใช่ เป็น AU/ }));
    expect(screen.getByLabelText("AU มหาลัย")).toBeInTheDocument();
  });

  // Turning the question off must not leave the answers behind.
  it("drops the AU terms when the writer says it is not an AU", async () => {
    getGenres.mockResolvedValue(GENRES);
    const { onGenresChange } = renderPicker({ genreIDs: ["g1", "a1"] });

    // An existing AU answer opens the question rather than hiding it.
    expect(await screen.findByLabelText("AU มหาลัย")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /ไม่ใช่ AU/ }));
    expect(onGenresChange).toHaveBeenCalledWith(["g1"]);
  });
});

describe("tag input", () => {
  it("resolves a typed tag through the server's creation path", async () => {
    getGenres.mockResolvedValue([]);
    createTag.mockResolvedValue({ id: "t1", name: "slow-burn", slug: "slow-burn" });
    const { onTagsChange } = renderPicker();

    fireEvent.change(screen.getByPlaceholderText(/slow-burn/), { target: { value: "Slow-Burn" } });
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มแท็ก" }));

    await waitFor(() => expect(createTag).toHaveBeenCalledWith("Slow-Burn"));
    // What gets attached is the SERVER's normalized tag, not the raw input.
    expect(onTagsChange).toHaveBeenCalledWith([
      { id: "t1", name: "slow-burn", slug: "slow-burn" },
    ]);
  });

  it("does not attach the same tag twice", async () => {
    getGenres.mockResolvedValue([]);
    createTag.mockResolvedValue({ id: "t1", name: "slow-burn", slug: "slow-burn" });
    const { onTagsChange } = renderPicker({
      tags: [{ id: "t1", name: "slow-burn", slug: "slow-burn" }],
    });

    fireEvent.change(screen.getByPlaceholderText(/slow-burn/), { target: { value: "SLOW-BURN" } });
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มแท็ก" }));

    // The server resolves both spellings to one row; attaching by id keeps
    // the list free of duplicates.
    await waitFor(() => expect(createTag).toHaveBeenCalled());
    expect(onTagsChange).not.toHaveBeenCalled();
  });

  it("shows the server's rejection of a format tag verbatim", async () => {
    getGenres.mockResolvedValue([]);
    createTag.mockRejectedValue(
      new ApiError(422, {
        code: "VALIDATION_ERROR",
        message: "Validation failed.",
        fields: {
          name: ["Fiction formats are first-class metadata, not tags. Set the format on the fiction instead."],
        },
      }),
    );
    const { onTagsChange } = renderPicker();

    fireEvent.change(screen.getByPlaceholderText(/slow-burn/), { target: { value: "chat-fiction" } });
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มแท็ก" }));

    // docs/08 §15.2 enforced by the SERVER; this component only reports it.
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("first-class metadata"),
    );
    expect(onTagsChange).not.toHaveBeenCalled();
  });

  it("removes a tag from the selection", async () => {
    getGenres.mockResolvedValue([]);
    const { onTagsChange } = renderPicker({
      tags: [
        { id: "t1", name: "slow-burn", slug: "slow-burn" },
        { id: "t2", name: "isekai", slug: "isekai" },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "ลบแท็ก slow-burn" }));

    expect(onTagsChange).toHaveBeenCalledWith([
      { id: "t2", name: "isekai", slug: "isekai" },
    ]);
  });
});
