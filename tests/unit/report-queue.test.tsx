import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import type { ModeratorReport } from "@/types/moderation";

/**
 * The moderator queue island. What matters: the queue renders what the API
 * allows, the status tabs re-query, and a 403 renders an access message -
 * the client never decides authorization itself (docs/09 §29).
 */

const adminGetReports = vi.fn();

vi.mock("@/lib/moderation-client", () => ({
  adminGetReports: (...args: unknown[]) => adminGetReports(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

let ReportQueue: typeof import("@/features/moderation/report-queue").ReportQueue;

beforeEach(async () => {
  ({ ReportQueue } = await import("@/features/moderation/report-queue"));
});

afterEach(() => {
  adminGetReports.mockReset();
});

function reportFixture(overrides: Partial<ModeratorReport> = {}): ModeratorReport {
  return {
    id: "r1",
    target_type: "comment",
    target_id: "c1",
    reason: "spam",
    status: "pending",
    created_at: "2026-08-11T09:00:00Z",
    reporter: { id: "u1", username: "somchai" },
    ...overrides,
  };
}

describe("ReportQueue", () => {
  it("lists the pending queue with reporter attribution", async () => {
    adminGetReports.mockResolvedValue({
      items: [reportFixture()],
      meta: { page: 1, per_page: 20, total: 1 },
    });

    render(<ReportQueue />);

    await waitFor(() => expect(screen.getByRole("link")).toBeInTheDocument());
    expect(adminGetReports).toHaveBeenCalledWith({ status: "pending", page: 1 });
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/admin/moderation/reports/r1",
    );
    expect(screen.getByText(/somchai/)).toBeInTheDocument();
  });

  it("re-queries when a status tab is chosen", async () => {
    adminGetReports.mockResolvedValue({
      items: [],
      meta: { page: 1, per_page: 20, total: 0 },
    });

    render(<ReportQueue />);
    await waitFor(() => expect(adminGetReports).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("tab", { name: "ดำเนินการแล้ว" }));
    await waitFor(() => expect(adminGetReports).toHaveBeenCalledTimes(2));
    expect(adminGetReports).toHaveBeenLastCalledWith({ status: "resolved", page: 1 });
  });

  it("shows the staff-only message on 403 instead of an error", async () => {
    adminGetReports.mockRejectedValue(
      new ApiError(403, { code: "FORBIDDEN", message: "Forbidden." }),
    );

    render(<ReportQueue />);

    await waitFor(() =>
      expect(screen.getByText("หน้านี้สำหรับทีมดูแลเท่านั้น")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows an empty state when the queue is clear", async () => {
    adminGetReports.mockResolvedValue({
      items: [],
      meta: { page: 1, per_page: 20, total: 0 },
    });

    render(<ReportQueue />);

    await waitFor(() =>
      expect(screen.getByText("ไม่มีรายงานในสถานะนี้")).toBeInTheDocument(),
    );
  });
});
