import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAutosave } from "@/lib/use-autosave";

/**
 * The autosave contract every settings block now stands on (settings review
 * 2026-08, item A): edits coalesce, the newest edit wins, the initial render
 * saves nothing, and a failure says so instead of pretending.
 */

function Harness({ save }: { save: (value: { text: string }) => Promise<void> }) {
  const [text, setText] = useState("เดิม");
  const autosave = useAutosave({ text }, save, 300);
  return (
    <div>
      <input
        aria-label="ข้อความ"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <output>{autosave.state}</output>
      {autosave.error ? <p role="alert">{autosave.error}</p> : null}
    </div>
  );
}

describe("useAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves nothing on mount - the initial render IS the saved state", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<Harness save={save} />);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText("idle")).toBeInTheDocument();
  });

  it("coalesces a burst of edits into one save of the final value", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<Harness save={save} />);
    const input = screen.getByLabelText("ข้อความ");

    for (const value of ["ใ", "ให", "ใหม่"]) {
      fireEvent.change(input, { target: { value } });
      act(() => {
        vi.advanceTimersByTime(100);
      });
    }
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ text: "ใหม่" });
    expect(screen.getByText("saved")).toBeInTheDocument();
  });

  it("reports a failed save in the writer's words", async () => {
    const save = vi.fn().mockRejectedValue(new Error("ชื่อเรื่องว่างไม่ได้"));
    render(<Harness save={save} />);
    fireEvent.change(screen.getByLabelText("ข้อความ"), { target: { value: "" } });
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("ชื่อเรื่องว่างไม่ได้");
  });
});
