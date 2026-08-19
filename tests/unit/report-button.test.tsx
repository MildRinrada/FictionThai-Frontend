import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";

/**
 * The report dialog (docs/02 §38). What matters: the flow is reason →
 * optional description → submit → simple confirmation; a guest's submit
 * routes to sign-in with intent preserved; API failures surface without
 * leaking moderation internals.
 */

const createReport = vi.fn();
const push = vi.fn();

vi.mock("@/lib/moderation-client", () => ({
  createReport: (...args: unknown[]) => createReport(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

let ReportButton: typeof import("@/features/moderation/report-button").ReportButton;

beforeEach(async () => {
  ({ ReportButton } = await import("@/features/moderation/report-button"));
});

afterEach(() => {
  createReport.mockReset();
  push.mockReset();
});

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: /รายงาน/ }));
  return screen.getByRole("dialog");
}

describe("ReportButton", () => {
  it("opens the docs/02 §38 flow: reasons, optional description, submit", () => {
    render(<ReportButton targetType="novel" targetId="n1" />);

    const dialog = openDialog();
    expect(dialog).toHaveTextContent("รายงานเนื้อหา");
    // Every documented reason is offered (docs/01 §21).
    for (const label of ["สแปม", "การคุกคาม", "ละเมิดลิขสิทธิ์"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "ส่งรายงาน" })).toBeInTheDocument();
  });

  it("submits the selected reason and shows a simple confirmation", async () => {
    createReport.mockResolvedValue({ id: "r1", status: "pending" });

    render(<ReportButton targetType="comment" targetId="c1" />);
    openDialog();
    fireEvent.click(screen.getByLabelText("การคุกคาม"));
    fireEvent.click(screen.getByRole("button", { name: "ส่งรายงาน" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("รายงานแล้ว"),
    );
    expect(createReport).toHaveBeenCalledWith({
      target_type: "comment",
      target_id: "c1",
      reason: "harassment",
      description: undefined,
    });
    // The confirmation reveals no moderation internals (docs/02 §38).
    expect(screen.queryByText(/pending|moderator/i)).not.toBeInTheDocument();
  });

  it("sends the optional description when provided", async () => {
    createReport.mockResolvedValue({ id: "r1", status: "pending" });

    render(<ReportButton targetType="community_post" targetId="p1" />);
    openDialog();
    fireEvent.change(screen.getByLabelText(/รายละเอียดเพิ่มเติม/), {
      target: { value: "  สแปมซ้ำ ๆ  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "ส่งรายงาน" }));

    await waitFor(() => expect(createReport).toHaveBeenCalled());
    expect(createReport.mock.calls[0][0]).toMatchObject({
      description: "สแปมซ้ำ ๆ",
    });
  });

  it("routes a guest to sign-in with the return path preserved", async () => {
    createReport.mockRejectedValue(
      new ApiError(401, { code: "UNAUTHORIZED", message: "Authentication required." }),
    );

    render(<ReportButton targetType="novel" targetId="n1" />);
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: "ส่งรายงาน" }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(String(push.mock.calls[0][0])).toContain("/login?next=");
  });

  it("surfaces API failures inside the dialog and allows retry", async () => {
    createReport.mockRejectedValue(
      new ApiError(422, { code: "VALIDATION_ERROR", message: "Validation failed." }),
    );

    render(<ReportButton targetType="chapter" targetId="c1" />);
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: "ส่งรายงาน" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("ข้อมูลรายงานไม่ถูกต้อง"),
    );
    // The dialog stays open for a retry.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
