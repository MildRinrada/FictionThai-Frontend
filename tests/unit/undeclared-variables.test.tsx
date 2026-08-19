import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UndeclaredVariables } from "@/features/studio/undeclared-variables";
import type { NovelVariable } from "@/types/variable";

/**
 * ตัวแปรที่ยังไม่ประกาศ, made actionable (§13T follow-up).
 *
 * The rules under test:
 *
 *   - every token links to the chapters it was found in - the warning names
 *     WHERE, not just WHAT;
 *   - ประกาศเลย declares in one press by resending the WHOLE list with the new
 *     row appended - order is the declaration order, and dropping the existing
 *     rows would be the destructive save this platform never does;
 *   - a preset token gets its known label and kind rather than a bare copy of
 *     itself.
 */

const saveVariables = vi.fn();
const refresh = vi.fn();

vi.mock("@/lib/novels-client", () => ({
  saveVariables: (...args: unknown[]) => saveVariables(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(() => {
  saveVariables.mockReset();
  refresh.mockReset();
});

const declared: NovelVariable[] = [
  {
    id: "v1",
    position: 0,
    token: "(l/n)",
    label: "นามสกุล",
    kind: "text",
    tokens: ["(l/n)"],
  },
];

function renderPanel() {
  return render(
    <UndeclaredVariables
      novelRef="my-novel"
      base="/studio/novels/my-novel"
      chapterUnit="ตอน"
      declared={declared}
      uses={[
        {
          token: "(y/n)",
          chapters: [
            { chapter_number: 3, slug: "ep-3", title: undefined },
            { chapter_number: 5, slug: "ep-5", title: "ห้องซ้อมดนตรี" },
          ],
        },
        { token: "(X/X)", chapters: [] },
      ]}
    />,
  );
}

describe("UndeclaredVariables", () => {
  it("links each token to the chapters it appears in", () => {
    renderPanel();

    // A chapter with no title is named by its unit and number; a titled one by
    // its title. Both jump to the chapter editor.
    expect(screen.getByRole("link", { name: "ตอนที่ 3" })).toHaveAttribute(
      "href",
      "/studio/novels/my-novel/chapters/ep-3",
    );
    expect(screen.getByRole("link", { name: "ห้องซ้อมดนตรี" })).toHaveAttribute(
      "href",
      "/studio/novels/my-novel/chapters/ep-5",
    );
  });

  it("declares in one press, appending to the existing list", async () => {
    saveVariables.mockResolvedValue({});
    renderPanel();

    fireEvent.click(screen.getAllByRole("button", { name: /ประกาศเลย/ })[0]);

    await vi.waitFor(() => expect(saveVariables).toHaveBeenCalledTimes(1));
    const [ref, inputs] = saveVariables.mock.calls[0] as [string, Array<{ token: string; label: string }>];
    expect(ref).toBe("my-novel");
    // The declaration that was already there survives, in front.
    expect(inputs[0]).toMatchObject({ token: "(l/n)", label: "นามสกุล" });
    // (y/n) is a known preset, so the row arrives with its real label rather
    // than a token named after itself.
    expect(inputs[1]).toMatchObject({ token: "(y/n)", label: "ชื่อของคุณ", kind: "text" });
    expect(refresh).toHaveBeenCalled();
  });

  it("falls back to a text variable named after an unknown token", async () => {
    saveVariables.mockResolvedValue({});
    renderPanel();

    fireEvent.click(screen.getAllByRole("button", { name: /ประกาศเลย/ })[1]);

    await vi.waitFor(() => expect(saveVariables).toHaveBeenCalledTimes(1));
    const [, inputs] = saveVariables.mock.calls[0] as [string, Array<{ token: string }>];
    expect(inputs[1]).toMatchObject({ token: "(X/X)", label: "(X/X)", kind: "text" });
  });

  it("renders nothing once every token is declared", () => {
    const { container } = render(
      <UndeclaredVariables
        novelRef="my-novel"
        base="/studio/novels/my-novel"
        declared={declared}
        uses={[]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
