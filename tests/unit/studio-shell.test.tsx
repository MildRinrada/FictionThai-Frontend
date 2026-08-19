import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioShell } from "@/components/studio/studio-shell";

/**
 * The editor review's structural rule (2026-08 A-B): every studio screen keeps
 * the rail EXCEPT the chapter editor, whose only job is writing - there the
 * rail's width belongs to the manuscript and the outline is the left panel.
 */

const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
}));

describe("StudioShell", () => {
  it("keeps the rail on management screens", () => {
    pathname.current = "/studio/novels/my-fic/chapters";
    render(<StudioShell rail={<nav>แถบสตูดิโอ</nav>}>เนื้อหา</StudioShell>);
    expect(screen.getByText("แถบสตูดิโอ")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("เนื้อหา");
  });

  it("drops the rail on the chapter editor - the writing screen", () => {
    pathname.current = "/studio/novels/my-fic/chapters/chapter-1";
    render(<StudioShell rail={<nav>แถบสตูดิโอ</nav>}>ต้นฉบับ</StudioShell>);
    expect(screen.queryByText("แถบสตูดิโอ")).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("ต้นฉบับ");
  });

  it("keeps the rail on the novel overview", () => {
    pathname.current = "/studio/novels/my-fic";
    render(<StudioShell rail={<nav>แถบสตูดิโอ</nav>}>ภาพรวม</StudioShell>);
    expect(screen.getByText("แถบสตูดิโอ")).toBeInTheDocument();
  });
});
