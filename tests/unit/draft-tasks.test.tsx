import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DraftTasks } from "@/features/studio/draft-tasks";
import { ContentFormat, type ChapterSummary } from "@/types/novel";

/**
 * ทำต่อจากที่ค้างไว้, rebuilt (§13T).
 *
 * The three fixes under test: recency order instead of chapter-number order,
 * a format label on every row, and empty drafts split into their own group
 * with a delete that is (a) confirmed and (b) never offered on a draft that
 * holds content.
 */

const deleteChapter = vi.fn();
const refresh = vi.fn();

vi.mock("@/lib/novels-client", () => ({
  deleteChapter: (...args: unknown[]) => deleteChapter(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(() => {
  deleteChapter.mockReset();
  refresh.mockReset();
});

let sequence = 0;
function draft(over: Partial<ChapterSummary>): ChapterSummary {
  sequence += 1;
  return {
    id: `ch-${sequence}`,
    chapter_number: sequence,
    slug: `chapter-${sequence}`,
    status: "draft",
    word_count: 0,
    presentation_format: null,
    active_format: "standard",
    content_ready: false,
    message_count: 0,
    entry_count: 0,
    content_format: ContentFormat.Plain,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...over,
  };
}

function renderTasks(drafts: ChapterSummary[]) {
  return render(
    <DraftTasks
      novelRef="my-novel"
      base="/studio/novels/my-novel"
      chapterUnit="ตอนที่"
      drafts={drafts}
    />,
  );
}

describe("DraftTasks", () => {
  it("orders working drafts by recency, not by chapter number", () => {
    renderTasks([
      draft({
        chapter_number: 1,
        title: "ตอนเก่า",
        word_count: 100,
        updated_at: "2026-08-01T00:00:00Z",
      }),
      draft({
        chapter_number: 9,
        title: "ตอนเมื่อคืน",
        word_count: 50,
        updated_at: "2026-08-12T00:00:00Z",
      }),
    ]);

    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("ตอนเมื่อคืน");
    expect(rows[1]).toHaveTextContent("ตอนเก่า");
  });

  it("labels every row with the chapter's own format", () => {
    renderTasks([
      draft({ title: "บทสนทนา", active_format: "chat", content_ready: true }),
      draft({ title: "หัวข้อ", active_format: "headcanon", content_ready: true }),
    ]);

    expect(screen.getByText("แชทล้วน")).toBeInTheDocument();
    expect(screen.getByText("เฮดแคนอน")).toBeInTheDocument();
  });

  it("splits empty drafts into their own collapsed group", () => {
    renderTasks([
      draft({ title: "งานจริง", word_count: 42 }),
      draft({ title: "เปลือกเปล่า" }),
    ]);

    expect(screen.getByText(/ร่างว่าง · 1 ตอน/)).toBeInTheDocument();
    // Collapsed: the empty draft's row is not shown until expanded.
    expect(screen.queryByText("เปลือกเปล่า")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /ร่างว่าง · / }));
    expect(screen.getByText("เปลือกเปล่า")).toBeInTheDocument();
  });

  it("deletes an empty draft only after its own confirmation", async () => {
    deleteChapter.mockResolvedValue(undefined);
    renderTasks([draft({ title: "ทิ้งได้", slug: "empty-one" })]);

    fireEvent.click(screen.getByRole("button", { name: /ร่างว่าง · / }));
    fireEvent.click(screen.getByRole("button", { name: /^ลบ ทิ้งได้$/ }));
    // Nothing deleted yet - the row swapped to a confirmation.
    expect(deleteChapter).not.toHaveBeenCalled();

    const row = screen.getByText("ลบร่างว่างนี้?").closest("li");
    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "ลบ" }));

    await screen.findByText(/ร่างว่าง/i).catch(() => null);
    expect(deleteChapter).toHaveBeenCalledWith("my-novel", "empty-one");
  });

  it("offers ลบร่างว่างทั้งหมด behind a confirmation and spares working drafts", async () => {
    deleteChapter.mockResolvedValue(undefined);
    renderTasks([
      draft({ title: "งานจริง", word_count: 42, slug: "real" }),
      draft({ title: "ว่าง 1", slug: "empty-a" }),
      draft({ title: "ว่าง 2", slug: "empty-b" }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "ลบร่างว่างทั้งหมด" }));
    expect(deleteChapter).not.toHaveBeenCalled();
    expect(screen.getByText("ลบร่างว่างทั้ง 2 ตอน?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ลบ" }));
    await vi.waitFor(() => expect(deleteChapter).toHaveBeenCalledTimes(2));
    expect(deleteChapter).toHaveBeenCalledWith("my-novel", "empty-a");
    expect(deleteChapter).toHaveBeenCalledWith("my-novel", "empty-b");
    expect(deleteChapter).not.toHaveBeenCalledWith("my-novel", "real");
  });

  it("never offers a delete on a draft that holds content", () => {
    renderTasks([draft({ title: "มีของ", word_count: 900 })]);
    expect(screen.queryByRole("button", { name: /ลบ/ })).not.toBeInTheDocument();
  });

  it("renders nothing when there are no drafts", () => {
    const { container } = renderTasks([]);
    expect(container).toBeEmptyDOMElement();
  });
});
