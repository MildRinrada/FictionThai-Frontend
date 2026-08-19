import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MarkPopover } from "@/features/studio/chapter-editor";
import type { AiManuscriptMark } from "@/types/ai";

/**
 * The in-text quick fix (13Y §4, the Grammarly gesture).
 *
 * What these tests defend: the popover's primary action IS the correction
 * (click it, it applies, it closes), ข้าม and ไม่เตือนแบบนี้อีก ride along,
 * and a character citation - which has no one-word fix - shows the question
 * instead of a broken apply button.
 */

function spellingMark(overrides: Partial<AiManuscriptMark> = {}): AiManuscriptMark {
  return {
    key: "spelling:กระเพรา",
    text: "กระเพรา",
    family: "error",
    label: "คำผิด/ไวยากรณ์",
    suggestion: "กะเพรา",
    explanation: '"กระเพรา" น่าจะสะกดว่า "กะเพรา"',
    onApplyFix: vi.fn(),
    onSkip: vi.fn(),
    onMute: vi.fn(),
    ...overrides,
  };
}

describe("MarkPopover", () => {
  it("the correction is the primary action: click applies and closes", () => {
    const mark = spellingMark();
    const onClose = vi.fn();
    render(<MarkPopover mark={mark} x={10} y={20} onClose={onClose} />);

    // The fix reads as original → replacement (the arrow is aria-hidden, so
    // the accessible name is the two words).
    const fix = screen.getByRole("button", { name: /กระเพรา.*กะเพรา/ });
    fireEvent.click(fix);
    expect(mark.onApplyFix).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it("ข้าม and ไม่เตือนแบบนี้อีก are one click away, and ✕ just closes", () => {
    const mark = spellingMark();
    const onClose = vi.fn();
    render(<MarkPopover mark={mark} x={10} y={20} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "ข้าม" }));
    expect(mark.onSkip).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "ไม่เตือนแบบนี้อีก" }));
    expect(mark.onMute).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "ปิด" }));
    expect(onClose).toHaveBeenCalled();
    expect(mark.onApplyFix).not.toHaveBeenCalled();
  });

  it("a character citation has no quick fix - it asks its question instead", () => {
    const mark: AiManuscriptMark = {
      key: "character:c1:สวัสดีจ้า ทุกคน",
      text: "สวัสดีจ้า ทุกคน",
      family: "consistency",
      label: "ความสอดคล้องของตัวละคร",
      explanation:
        "«จงหลี» ระบุลักษณะนิสัย «สุขุม» - บรรทัดนี้ลงท้ายด้วย «จ้า» น้ำเสียงอาจเป็นกันเองกว่าที่ตั้งไว้ หรือเป็นความตั้งใจ",
    };
    render(<MarkPopover mark={mark} x={10} y={20} onClose={vi.fn()} />);

    expect(screen.getByText(/ลงท้ายด้วย «จ้า»/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /→/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ข้าม" })).not.toBeInTheDocument();
  });
});
