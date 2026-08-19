import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChapterAnalysis } from "@/features/ai/chapter-analysis";
import { ApiError } from "@/lib/api";

/**
 * วิเคราะห์ตอนนี้, in the editor's side panel (assistant-settings review §1).
 *
 * The rules under test: the chapter comes from context - there is NO chapter-id
 * field anywhere; the persisted request → accept flow records a decision
 * without touching the manuscript (docs/12 §14, §15); statuses render in Thai;
 * and quota/unavailability failures surface as safe Thai messages.
 */

const createAiRequest = vi.fn();
const getAiRequest = vi.fn();
const decideSuggestion = vi.fn();
const push = vi.fn();

vi.mock("@/lib/ai-client", () => ({
  createAiRequest: (...a: unknown[]) => createAiRequest(...a),
  getAiRequest: (...a: unknown[]) => getAiRequest(...a),
  decideSuggestion: (...a: unknown[]) => decideSuggestion(...a),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

afterEach(() => {
  createAiRequest.mockReset();
  getAiRequest.mockReset();
  decideSuggestion.mockReset();
  push.mockReset();
});

function renderOpen() {
  const result = render(<ChapterAnalysis chapterId="chap-1" />);
  // The panel is folded by default; open it the way a writer would.
  fireEvent.click(screen.getByText(/วิเคราะห์ตอนนี้/));
  return result;
}

describe("ChapterAnalysis", () => {
  it("takes the chapter from context - no id field to fill", () => {
    renderOpen();
    expect(screen.queryByLabelText(/รหัสบท/)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/chapter id/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /วิเคราะห์/ })).toBeEnabled();
  });

  it("creates a request against the open chapter and records an accept", async () => {
    createAiRequest.mockResolvedValue({
      id: "req1",
      feature: "spell_check",
      provider: "local",
      status: "completed",
      retryable: false,
      created_at: "now",
      suggestions: [
        {
          id: "s1",
          type: "spelling",
          original_text: "เเ",
          suggested_text: "แ",
          status: "pending",
          created_at: "now",
        },
      ],
    });
    decideSuggestion.mockResolvedValue({
      id: "s1",
      type: "spelling",
      original_text: "เเ",
      suggested_text: "แ",
      status: "accepted",
      created_at: "now",
    });

    renderOpen();
    fireEvent.click(screen.getByRole("button", { name: /วิเคราะห์/ }));

    // The status reads in Thai, not as the API's enum.
    await waitFor(() =>
      expect(screen.getByTestId("ai-request-status")).toHaveTextContent("เสร็จแล้ว"),
    );
    expect(createAiRequest).toHaveBeenCalledWith("spell_check", "chap-1");

    fireEvent.click(screen.getByRole("button", { name: "ยอมรับ" }));
    await waitFor(() =>
      expect(screen.getByTestId("ai-suggestion-status")).toHaveTextContent("ยอมรับแล้ว"),
    );
    expect(decideSuggestion).toHaveBeenCalledWith("s1", "accepted");
  });

  it("shows a safe Thai message when AI is unavailable", async () => {
    createAiRequest.mockRejectedValue(
      new ApiError(503, {
        code: "SERVICE_UNAVAILABLE",
        message: "AI assistance is currently unavailable.",
      }),
    );
    renderOpen();
    fireEvent.click(screen.getByRole("button", { name: /วิเคราะห์/ }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("ไม่พร้อมใช้งาน"),
    );
  });

  it("shows the quota message on 429 AI_QUOTA_EXCEEDED", async () => {
    createAiRequest.mockRejectedValue(
      new ApiError(429, { code: "AI_QUOTA_EXCEEDED", message: "quota" }),
    );
    renderOpen();
    fireEvent.click(screen.getByRole("button", { name: /วิเคราะห์/ }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("ครบโควตา"),
    );
  });
});
