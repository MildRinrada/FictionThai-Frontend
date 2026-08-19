import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssistantDemo } from "@/features/ai/assistant-demo";
import { ApiError } from "@/lib/api";

/**
 * ลองดูว่าผู้ช่วยทำงานยังไง (assistant-settings review §2).
 *
 * The rules under test: the sample text is pre-filled so the first press costs
 * nothing to compose, findings render entirely in Thai (an English
 * "spelling · high" chip on a Thai settings page reads as debug output), and
 * failures surface as safe Thai messages.
 */

const analyzeText = vi.fn();
const push = vi.fn();

vi.mock("@/lib/ai-client", () => ({
  analyzeText: (...a: unknown[]) => analyzeText(...a),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

afterEach(() => {
  analyzeText.mockReset();
  push.mockReset();
});

describe("AssistantDemo", () => {
  it("pre-fills a sample so the demo works on the first press", async () => {
    analyzeText.mockResolvedValue([]);
    render(<AssistantDemo />);

    const field = screen.getByLabelText("ข้อความสำหรับตรวจ") as HTMLTextAreaElement;
    expect(field.value).not.toBe("");

    const button = screen.getByRole("button", { name: /ตรวจข้อความ/ });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    await waitFor(() => expect(analyzeText).toHaveBeenCalledWith(field.value));
  });

  it("renders findings in Thai and lets the writer ignore one", async () => {
    analyzeText.mockResolvedValue([
      {
        type: "spelling",
        start: 0,
        end: 2,
        original: "เเ",
        suggestions: ["แ"],
        confidence: 0.9,
        severity: "high",
        explanation: "พบสระเอสองตัว",
      },
    ]);
    render(<AssistantDemo />);
    fireEvent.click(screen.getByRole("button", { name: /ตรวจข้อความ/ }));

    await waitFor(() => expect(screen.getByTestId("ai-inline-list")).toBeInTheDocument());
    // The chip is Thai, never the raw "spelling · high".
    expect(screen.getByText("คำผิด · ควรแก้")).toBeInTheDocument();
    expect(screen.queryByText(/spelling/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ละเว้น" }));
    expect(screen.getByText("ไม่พบข้อเสนอแนะ")).toBeInTheDocument();
  });

  it("shows the quota message in Thai on 429 AI_QUOTA_EXCEEDED", async () => {
    analyzeText.mockRejectedValue(
      new ApiError(429, { code: "AI_QUOTA_EXCEEDED", message: "quota" }),
    );
    render(<AssistantDemo />);
    fireEvent.click(screen.getByRole("button", { name: /ตรวจข้อความ/ }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("ครบโควตา"),
    );
  });

  it("never surfaces a raw English API message", async () => {
    analyzeText.mockRejectedValue(
      new ApiError(500, { code: "INTERNAL", message: "Something went wrong." }),
    );
    render(<AssistantDemo />);
    fireEvent.click(screen.getByRole("button", { name: /ตรวจข้อความ/ }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("เกิดข้อผิดพลาด"),
    );
    expect(screen.queryByText(/Something went wrong/)).not.toBeInTheDocument();
  });

  it("routes a guest to sign-in on 401", async () => {
    analyzeText.mockRejectedValue(
      new ApiError(401, { code: "UNAUTHORIZED", message: "Authentication required." }),
    );
    render(<AssistantDemo />);
    fireEvent.click(screen.getByRole("button", { name: /ตรวจข้อความ/ }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(String(push.mock.calls[0][0])).toContain("/login?next=");
  });
});
