import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditableTitle } from "@/features/studio/editable-title";

/**
 * The in-place title editor, second revision (§13T).
 *
 * The first version confirmed through a bar floating at the bottom of the
 * viewport - a control at the maximum distance from the field it confirmed.
 * These tests pin the replacement behaviour: Enter or blur saves, Esc is a
 * full undo, the feedback appears BESIDE the title, and the floating bar is
 * gone for good.
 */

const updateNovel = vi.fn();
const refresh = vi.fn();

vi.mock("@/lib/novels-client", () => ({
  updateNovel: (...args: unknown[]) => updateNovel(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(() => {
  updateNovel.mockReset();
  refresh.mockReset();
});

function open() {
  render(<EditableTitle novelRef="my-novel" title="ชื่อเดิม" />);
  fireEvent.doubleClick(screen.getByTitle("ดับเบิลคลิกเพื่อแก้ชื่อเรื่อง"));
  return screen.getByLabelText("ชื่อเรื่อง") as HTMLInputElement;
}

describe("EditableTitle", () => {
  it("opens on double-click with the current title selected for rewriting", () => {
    const field = open();
    expect(field.value).toBe("ชื่อเดิม");
  });

  it("saves on Enter and confirms beside the title, not in a floating bar", async () => {
    updateNovel.mockResolvedValue({});
    const field = open();

    fireEvent.change(field, { target: { value: "ชื่อใหม่" } });
    fireEvent.keyDown(field, { key: "Enter" });

    expect(await screen.findByText("บันทึกแล้ว")).toBeInTheDocument();
    expect(updateNovel).toHaveBeenCalledWith("my-novel", { title: "ชื่อใหม่" });
    expect(screen.getByText("ชื่อใหม่")).toBeInTheDocument();
    // The old confirmation bar must not resurface.
    expect(screen.queryByText("บันทึกการเปลี่ยนแปลงชื่อเรื่อง?")).not.toBeInTheDocument();
  });

  it("saves on blur - clicking away is finishing, not abandoning", async () => {
    updateNovel.mockResolvedValue({});
    const field = open();

    fireEvent.change(field, { target: { value: "แก้แล้วคลิกที่อื่น" } });
    fireEvent.blur(field);

    await vi.waitFor(() =>
      expect(updateNovel).toHaveBeenCalledWith("my-novel", {
        title: "แก้แล้วคลิกที่อื่น",
      }),
    );
  });

  it("abandons on Esc without writing anything", () => {
    const field = open();
    fireEvent.change(field, { target: { value: "พิมพ์ผิด" } });
    fireEvent.keyDown(field, { key: "Escape" });
    fireEvent.blur(field);

    expect(updateNovel).not.toHaveBeenCalled();
    expect(screen.getByText("ชื่อเดิม")).toBeInTheDocument();
  });

  it("treats an emptied field as abandoned rather than as a request for no title", () => {
    const field = open();
    fireEvent.change(field, { target: { value: "   " } });
    fireEvent.keyDown(field, { key: "Enter" });

    expect(updateNovel).not.toHaveBeenCalled();
    expect(screen.getByText("ชื่อเดิม")).toBeInTheDocument();
  });

  it("puts the old title back with the reason when the API refuses", async () => {
    updateNovel.mockRejectedValue(new Error("boom"));
    const field = open();

    fireEvent.change(field, { target: { value: "จะไม่ผ่าน" } });
    fireEvent.keyDown(field, { key: "Enter" });

    expect(await screen.findByRole("alert")).toHaveTextContent("บันทึกชื่อเรื่องไม่สำเร็จ");
    expect(screen.getByText("ชื่อเดิม")).toBeInTheDocument();
  });
});
