import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PenNamesPanel } from "@/features/profile/pen-names-panel";
import type { PenNameView } from "@/types/profile";

/**
 * นามปากกา - the owner's editor (docs/PROFILE-AND-ACHIEVEMENTS.md Part 2).
 *
 * What is defended here:
 *
 *  1. Adding sends the name and the label, and the new identity appears without
 *     a reload.
 *  2. Renaming sends only the rename and shows the name the API returned - the
 *     server owns normalisation, not this component.
 *  3. **The delete confirmation says, in words, that no work is deleted.** A
 *     writer removing an identity has every reason to fear it takes the stories
 *     with it; the copy that answers that fear is behaviour, not decoration, so
 *     it is asserted like any other behaviour.
 */

const createPenName = vi.fn();
const updatePenName = vi.fn();
const deletePenName = vi.fn();

vi.mock("@/lib/pen-names-client", () => ({
  createPenName: (...args: unknown[]) => createPenName(...args),
  updatePenName: (...args: unknown[]) => updatePenName(...args),
  deletePenName: (...args: unknown[]) => deletePenName(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
// A "use server" module cannot be imported into a component test.
vi.mock("@/app/settings/profile/actions", () => ({
  refreshProfileCache: vi.fn().mockResolvedValue(undefined),
}));

function penName(overrides: Partial<PenNameView> = {}): PenNameView {
  return {
    id: "9f1c0f5e-0000-4000-8000-000000000001",
    name: "ณัฐวรา",
    note: null,
    is_default: true,
    ...overrides,
  };
}

describe("the pen names panel", () => {
  beforeEach(() => {
    createPenName.mockReset();
    updatePenName.mockReset();
    deletePenName.mockReset();
    deletePenName.mockResolvedValue(undefined);
  });

  it("says which name changes and which one does not", () => {
    render(<PenNamesPanel username="ftadmin" initialPenNames={[]} />);
    expect(
      screen.getByText(/@ftadmin เป็นชื่อผู้ใช้ถาวรที่เปลี่ยนไม่ได้/),
    ).toBeInTheDocument();
  });

  it("adds a pen name with its label and shows it straight away", async () => {
    createPenName.mockResolvedValue(
      penName({ id: "new-id", name: "N.W.", note: "แยกแนว", is_default: false }),
    );
    render(<PenNamesPanel username="ftadmin" initialPenNames={[]} />);

    fireEvent.change(screen.getByLabelText("นามปากกา"), {
      target: { value: "  N.W.  " },
    });
    fireEvent.change(screen.getByLabelText("โน้ต"), {
      target: { value: "แยกแนว" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /เพิ่มนามปากกา/ }));
    });

    // Trimmed, and an empty label would have been sent as null rather than "".
    expect(createPenName).toHaveBeenCalledWith({ name: "N.W.", note: "แยกแนว" });
    expect(screen.getByText("N.W.")).toBeInTheDocument();
    expect(screen.getByText("แยกแนว")).toBeInTheDocument();
  });

  it("refuses a duplicate before it reaches the API", async () => {
    render(
      <PenNamesPanel username="ftadmin" initialPenNames={[penName({ name: "N.W." })]} />,
    );

    fireEvent.change(screen.getByLabelText("นามปากกา"), {
      target: { value: "n.w." },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /เพิ่มนามปากกา/ }));
    });

    expect(createPenName).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("อยู่แล้ว");
  });

  it("renames an identity and shows the name the API returned", async () => {
    const existing = penName({ name: "ณัฐวรา", note: "แนวหลัก" });
    updatePenName.mockResolvedValue({ ...existing, name: "นวรา" });

    render(<PenNamesPanel username="ftadmin" initialPenNames={[existing]} />);

    fireEvent.click(screen.getByRole("button", { name: "แก้ไข ณัฐวรา" }));
    fireEvent.change(screen.getByLabelText("ชื่อนามปากกา"), {
      target: { value: "นวรา" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "บันทึกชื่อ" }));
    });

    expect(updatePenName).toHaveBeenCalledWith(existing.id, {
      name: "นวรา",
      note: "แนวหลัก",
    });
    expect(screen.getByText("นวรา")).toBeInTheDocument();
    expect(screen.queryByText("ณัฐวรา")).not.toBeInTheDocument();
  });

  it("puts an API field error into Thai on the panel", async () => {
    const { ApiError } = await import("@/lib/api");
    createPenName.mockRejectedValue(
      new ApiError(422, {
        code: "VALIDATION_FAILED",
        message: "Validation failed.",
        fields: { name: ["You already use this pen name."] },
      }),
    );

    render(<PenNamesPanel username="ftadmin" initialPenNames={[]} />);
    fireEvent.change(screen.getByLabelText("นามปากกา"), {
      target: { value: "ชื่อใหม่" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /เพิ่มนามปากกา/ }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "คุณมีนามปากกาชื่อนี้อยู่แล้ว",
    );
  });

  // The one piece of copy this feature cannot get wrong.
  it("states that deleting a pen name deletes no work, and asks first", async () => {
    const existing = penName({ name: "ณัฐวรา" });
    render(<PenNamesPanel username="ftadmin" initialPenNames={[existing]} />);

    // Nothing is deleted until the writer has read the sentence.
    expect(screen.queryByRole("button", { name: "ยืนยันลบนามปากกา" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "ลบ ณัฐวรา" }));

    const confirmation = screen.getByText(/ลบนามปากกา «ณัฐวรา» ถาวร\?/);
    expect(confirmation).toHaveTextContent("การลบนี้ไม่ลบผลงานของคุณแม้แต่เรื่องเดียว");
    expect(confirmation).toHaveTextContent(
      "เรื่องที่เคยเผยแพร่ในชื่อนี้จะยังอยู่ครบทุกตอนทุกตัวอักษร",
    );
    expect(confirmation).toHaveTextContent("จะกลับไปแสดงด้วยนามปากกาเริ่มต้นแทน");
    expect(deletePenName).not.toHaveBeenCalled();

    // Backing out deletes nothing at all.
    fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));
    expect(deletePenName).not.toHaveBeenCalled();
    expect(screen.getByText("ณัฐวรา")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ลบ ณัฐวรา" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "ยืนยันลบนามปากกา" }));
    });

    expect(deletePenName).toHaveBeenCalledWith(existing.id);
    expect(screen.getByRole("status")).toHaveTextContent("ผลงานทั้งหมดยังอยู่ครบ");
  });

  it("moves the default with one request and takes it off the old holder", async () => {
    const main = penName({ id: "a", name: "ณัฐวรา", is_default: true });
    const other = penName({ id: "b", name: "N.W.", is_default: false });
    updatePenName.mockResolvedValue({ ...other, is_default: true });

    render(<PenNamesPanel username="ftadmin" initialPenNames={[main, other]} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "ตั้งเป็นค่าเริ่มต้น" }));
    });

    expect(updatePenName).toHaveBeenCalledWith("b", { is_default: true });
    // Exactly one ค่าเริ่มต้น chip, and the other row now offers the button.
    expect(screen.getAllByText("ค่าเริ่มต้น")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "ตั้งเป็นค่าเริ่มต้น" }),
    ).toBeInTheDocument();
  });
});
