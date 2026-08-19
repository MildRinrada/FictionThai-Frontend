import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DangerZone } from "@/features/studio/danger-zone";
import { Visibility } from "@/types/novel";

/**
 * โซนอันตราย (§13T).
 *
 * The rules under test are the writer-first ones: nothing destructive happens
 * on a first click, archiving states it is reversible and only offers itself
 * when there is something to archive, and deleting demands the TITLE typed
 * back - a decision, where a second click is a reflex.
 */

const updateNovel = vi.fn();
const deleteNovel = vi.fn();
const refresh = vi.fn();
const push = vi.fn();

vi.mock("@/lib/novels-client", () => ({
  updateNovel: (...args: unknown[]) => updateNovel(...args),
  deleteNovel: (...args: unknown[]) => deleteNovel(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push }),
}));

afterEach(() => {
  updateNovel.mockReset();
  deleteNovel.mockReset();
  refresh.mockReset();
  push.mockReset();
});

describe("DangerZone", () => {
  it("archives only after its own confirmation, by setting visibility private", async () => {
    updateNovel.mockResolvedValue({});
    render(
      <DangerZone novelRef="my-novel" title="เรื่องของฉัน" visibility={Visibility.Public} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /เก็บเข้าคลัง/ }));
    expect(updateNovel).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "ยืนยันเก็บเข้าคลัง" }));
    await vi.waitFor(() =>
      expect(updateNovel).toHaveBeenCalledWith("my-novel", { visibility: "private" }),
    );
  });

  it("hides archiving entirely on a story that is already private", () => {
    render(
      <DangerZone novelRef="my-novel" title="เรื่องของฉัน" visibility={Visibility.Private} />,
    );
    // Not a disabled state, not an explanation - the row is simply absent,
    // leaving ลบเรื่องนี้ as the zone's only entry.
    expect(screen.queryByRole("button", { name: /เก็บเข้าคลัง/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/เก็บเข้าคลัง/)).not.toBeInTheDocument();
  });

  it("keeps the delete dead until the exact title is typed", async () => {
    deleteNovel.mockResolvedValue(undefined);
    render(
      <DangerZone novelRef="my-novel" title="เรื่องของฉัน" visibility={Visibility.Private} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /ลบเรื่อง/ }));
    const confirm = screen.getByRole("button", { name: /ลบถาวร/ });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/พิมพ์ชื่อเรื่อง/), {
      target: { value: "เรื่องของฉั" }, // one character short
    });
    expect(confirm).toBeDisabled();
    expect(deleteNovel).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/พิมพ์ชื่อเรื่อง/), {
      target: { value: "เรื่องของฉัน" },
    });
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);
    await vi.waitFor(() => expect(deleteNovel).toHaveBeenCalledWith("my-novel"));
    expect(push).toHaveBeenCalledWith("/studio");
  });
});
