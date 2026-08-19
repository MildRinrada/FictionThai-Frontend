import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import type { ReportDetail } from "@/types/moderation";

/**
 * The staff report page (docs/02 §46). What matters: the action panel offers
 * exactly what the API says is available, an action posts and re-reads the
 * truth, and a 409 (someone acted first) is surfaced, never papered over.
 */

const adminGetReport = vi.fn();
const adminPerformAction = vi.fn();
const adminUpdateReport = vi.fn();

vi.mock("@/lib/moderation-client", () => ({
  adminGetReport: (...args: unknown[]) => adminGetReport(...args),
  adminPerformAction: (...args: unknown[]) => adminPerformAction(...args),
  adminUpdateReport: (...args: unknown[]) => adminUpdateReport(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

let ReportDetailView: typeof import("@/features/moderation/report-detail").ReportDetailView;

beforeEach(async () => {
  ({ ReportDetailView } = await import("@/features/moderation/report-detail"));
});

afterEach(() => {
  adminGetReport.mockReset();
  adminPerformAction.mockReset();
  adminUpdateReport.mockReset();
});

function detailFixture(overrides: Partial<ReportDetail> = {}): ReportDetail {
  return {
    report: {
      id: "r1",
      target_type: "community_post",
      target_id: "p1",
      reason: "harassment",
      status: "pending",
      created_at: "2026-08-11T09:00:00Z",
      reporter: { id: "u1", username: "somchai" },
    },
    target: {
      type: "community_post",
      id: "p1",
      exists: true,
      state: "published",
      excerpt: "ข้อความที่ถูกรายงาน",
      author: { id: "u2", username: "somsak" },
    },
    history: [],
    available_actions: ["hide", "remove", "restore"],
    ...overrides,
  };
}

describe("ReportDetailView", () => {
  it("renders the report, the live target snapshot, and the allowed actions", async () => {
    adminGetReport.mockResolvedValue(detailFixture());

    render(<ReportDetailView reportId="r1" />);

    await waitFor(() =>
      expect(screen.getByText("ข้อความที่ถูกรายงาน")).toBeInTheDocument(),
    );
    expect(screen.getByText("การคุกคาม")).toBeInTheDocument();
    expect(screen.getByText(/somchai/)).toBeInTheDocument();

    // Exactly the API's available_actions - no invented options.
    const select = screen.getByLabelText("เลือกการดำเนินการ");
    const options = Array.from(select.querySelectorAll("option")).map((o) => o.value);
    expect(options).toEqual(["hide", "remove", "restore"]);
  });

  it("performs an action against the report's target and reloads", async () => {
    adminGetReport.mockResolvedValue(detailFixture());
    adminPerformAction.mockResolvedValue({ id: "a1", action: "hide" });

    render(<ReportDetailView reportId="r1" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "ดำเนินการ" })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "ดำเนินการ" }));

    await waitFor(() =>
      expect(adminPerformAction).toHaveBeenCalledWith({
        target_type: "community_post",
        target_id: "p1",
        action: "hide",
        reason: undefined,
      }),
    );
    // The page re-reads the truth after acting.
    await waitFor(() => expect(adminGetReport).toHaveBeenCalledTimes(2));
  });

  it("closes a report through the lifecycle endpoint", async () => {
    adminGetReport.mockResolvedValue(detailFixture());
    adminUpdateReport.mockResolvedValue({ id: "r1", status: "resolved" });

    render(<ReportDetailView reportId="r1" />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "ปิดรายงาน - ดำเนินการแล้ว" }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "ปิดรายงาน - ดำเนินการแล้ว" }));

    await waitFor(() =>
      expect(adminUpdateReport).toHaveBeenCalledWith("r1", "resolved"),
    );
    // Drain the follow-up reload so it cannot leak into the next test.
    await waitFor(() => expect(adminGetReport).toHaveBeenCalledTimes(2));
  });

  it("surfaces a 409 as 'someone else acted' and re-reads", async () => {
    adminGetReport.mockResolvedValue(detailFixture());
    adminUpdateReport.mockRejectedValue(
      new ApiError(409, { code: "CONFLICT", message: "Already moved." }),
    );

    render(<ReportDetailView reportId="r1" />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "ปิดรายงาน - ไม่ดำเนินการ" }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "ปิดรายงาน - ไม่ดำเนินการ" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("สถานะเปลี่ยนไปแล้ว"),
    );
    // The page re-read the truth at least once after the conflict.
    await waitFor(() =>
      expect(adminGetReport.mock.calls.length).toBeGreaterThanOrEqual(2),
    );
  });

  it("renders the staff-only message on 403", async () => {
    adminGetReport.mockRejectedValue(
      new ApiError(403, { code: "FORBIDDEN", message: "Forbidden." }),
    );

    render(<ReportDetailView reportId="r1" />);

    await waitFor(() =>
      expect(screen.getByText("หน้านี้สำหรับทีมดูแลเท่านั้น")).toBeInTheDocument(),
    );
  });

  it("says the target is gone when the snapshot reports it missing", async () => {
    adminGetReport.mockResolvedValue(
      detailFixture({
        target: { type: "community_post", id: "p1", exists: false },
      }),
    );

    render(<ReportDetailView reportId="r1" />);

    await waitFor(() =>
      expect(screen.getByText("เนื้อหานี้ไม่อยู่ในระบบแล้ว")).toBeInTheDocument(),
    );
    // No action panel for a gone target.
    expect(screen.queryByLabelText("เลือกการดำเนินการ")).not.toBeInTheDocument();
  });
});
