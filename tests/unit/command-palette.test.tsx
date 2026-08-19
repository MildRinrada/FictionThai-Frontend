import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CommandPalette } from "@/features/studio/command-palette";

/**
 * The Ctrl+K search palette (13Y §8): opens on the shortcut, searches the
 * fiction (drafts included) after a debounce, and one press jumps to the
 * chapter's editor.
 */

const searchNovel = vi.fn();
const push = vi.fn();

vi.mock("@/lib/ai-client", () => ({
  searchNovel: (...args: unknown[]) => searchNovel(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
}));

afterEach(() => {
  searchNovel.mockReset();
  push.mockReset();
  vi.useRealTimers();
});

function open() {
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
}

describe("CommandPalette", () => {
  it("opens on Ctrl+K and closes on Escape", () => {
    render(<CommandPalette novelRef="my-novel" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    open();
    expect(screen.getByRole("dialog", { name: "ค้นหาในเรื่อง" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/รวมฉบับร่าง/)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("searches after a debounce and jumps to the hit's editor", async () => {
    vi.useFakeTimers();
    searchNovel.mockResolvedValue([
      {
        chapter_id: "ch-1",
        slug: "chapter-one",
        chapter_number: 1,
        title: "คืนฝนแรก",
        status: "draft",
        where: "prose",
        snippet: "…เขายื่นร่มสีแดงให้เธอ…",
      },
    ]);
    render(<CommandPalette novelRef="my-novel" />);
    open();

    fireEvent.change(screen.getByLabelText("คำค้น"), { target: { value: "ร่ม" } });
    await act(() => vi.advanceTimersByTimeAsync(400));

    expect(searchNovel).toHaveBeenCalledWith("my-novel", "ร่ม");
    expect(screen.getByText(/คืนฝนแรก/)).toBeInTheDocument();
    expect(screen.getByText(/เขายื่นร่มสีแดงให้เธอ/)).toBeInTheDocument();
    // A draft hit says it is one - drafts are why writers search here.
    expect(screen.getByText("ร่าง")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByLabelText("คำค้น"), { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/studio/novels/my-novel/chapters/chapter-one");
  });

  it("says so when nothing matches", async () => {
    vi.useFakeTimers();
    searchNovel.mockResolvedValue([]);
    render(<CommandPalette novelRef="my-novel" />);
    open();

    fireEvent.change(screen.getByLabelText("คำค้น"), { target: { value: "ไม่มีทางเจอ" } });
    await act(() => vi.advanceTimersByTimeAsync(400));

    expect(screen.getByText(/ไม่พบ «ไม่มีทางเจอ»/)).toBeInTheDocument();
  });
});
