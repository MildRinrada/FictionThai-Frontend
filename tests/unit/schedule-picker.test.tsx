import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SchedulePicker } from "@/features/studio/schedule-picker";

/**
 * The scheduling calendar (save-model review 2026-08): a real month grid in
 * place of a bare datetime-local field - month arrows, month/year dropdowns
 * for far jumps, พ.ศ. years, and a floor at today.
 */

const TODAY = new Date(2026, 7, 15); // 15 สิงหาคม 2026 (พ.ศ. 2569)

function picker(over: Partial<Parameters<typeof SchedulePicker>[0]> = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(
    <SchedulePicker
      today={TODAY}
      initial=""
      scheduled={false}
      onConfirm={onConfirm}
      onClose={onClose}
      {...over}
    />,
  );
  return { onConfirm, onClose };
}

describe("SchedulePicker", () => {
  it("opens on the current month with พ.ศ. years and disables the past", () => {
    picker();
    expect(screen.getByLabelText("เดือน")).toHaveValue("7");
    // The year dropdown speaks Buddhist era.
    expect(screen.getByRole("option", { name: "2569" })).toBeInTheDocument();
    // Yesterday cannot be scheduled; today can.
    expect(screen.getByRole("button", { name: "14" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "15" })).toBeEnabled();
  });

  it("confirms the picked day and time as a datetime-local value", () => {
    const { onConfirm } = picker();
    fireEvent.click(screen.getByRole("button", { name: "20" }));
    fireEvent.change(screen.getByLabelText("เวลา"), { target: { value: "21:30" } });
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันตั้งเวลา" }));
    expect(onConfirm).toHaveBeenCalledWith("2026-08-20T21:30");
  });

  it("jumps far by dropdown - a year away is two changes, not a chain of arrows", () => {
    const { onConfirm } = picker();
    fireEvent.change(screen.getByLabelText("ปี (พ.ศ.)"), { target: { value: "2027" } });
    fireEvent.change(screen.getByLabelText("เดือน"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "5" }));
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันตั้งเวลา" }));
    expect(onConfirm).toHaveBeenCalledWith("2027-01-05T19:00");
  });

  it("cannot confirm before a day is picked", () => {
    picker();
    expect(screen.getByRole("button", { name: "ยืนยันตั้งเวลา" })).toBeDisabled();
  });

  it("offers the cancel only while a schedule exists", () => {
    const onCancelSchedule = vi.fn();
    picker({ scheduled: true, onCancelSchedule });
    fireEvent.click(screen.getByRole("button", { name: "ยกเลิกการตั้งเวลา" }));
    expect(onCancelSchedule).toHaveBeenCalled();
  });
});
