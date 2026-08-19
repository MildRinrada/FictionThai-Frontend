import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VisibilityBadge } from "@/features/studio/visibility-badge";
import { Visibility } from "@/types/novel";

/**
 * The visibility badge beside the title (§13T).
 *
 * The one answer the overview's header was missing: who can see this story
 * right now, changeable in place. The behavioural rule under test is the
 * draft bridge - moving OFF private on a draft-status fiction must carry
 * `status: "ongoing"` with it, because the API refuses a shared draft and a
 * control that surfaces that refusal as an error only works for people who
 * already know the rule.
 */

const updateNovel = vi.fn();
const refresh = vi.fn();

vi.mock("@/lib/novels-client", () => ({
  updateNovel: (...args: unknown[]) => updateNovel(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(() => {
  updateNovel.mockReset();
  refresh.mockReset();
});

describe("VisibilityBadge", () => {
  it("states the current rung in one word", () => {
    render(
      <VisibilityBadge novelRef="my-novel" visibility={Visibility.Private} status="draft" />,
    );
    expect(screen.getByRole("button", { name: /ส่วนตัว/ })).toBeInTheDocument();
  });

  it("opens the full ladder with the meaning of each rung", () => {
    render(
      <VisibilityBadge novelRef="my-novel" visibility={Visibility.Private} status="draft" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /ส่วนตัว/ }));

    const menu = screen.getByRole("menu");
    // Three rungs, not five (docs/PROFILE-AND-ACHIEVEMENTS.md): เฉพาะสมาชิก
    // contradicts the platform's own "reading needs no account" promise and
    // เฉพาะผู้ติดตาม is a specialist choice - both stay on the fiction's
    // settings page rather than in the control everyone passes through.
    for (const label of ["สาธารณะ", "ลิงก์ลับ", "ส่วนตัว"]) {
      expect(menu).toHaveTextContent(label);
    }
  });

  it("carries the status change when publishing a draft", async () => {
    updateNovel.mockResolvedValue({});
    render(
      <VisibilityBadge novelRef="my-novel" visibility={Visibility.Private} status="draft" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /ส่วนตัว/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /สาธารณะ/ }));

    await vi.waitFor(() =>
      expect(updateNovel).toHaveBeenCalledWith("my-novel", {
        visibility: "public",
        status: "ongoing",
      }),
    );
  });

  it("changes only the visibility on an already-publishable fiction", async () => {
    updateNovel.mockResolvedValue({});
    render(
      <VisibilityBadge novelRef="my-novel" visibility={Visibility.Public} status="ongoing" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /สาธารณะ/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /ลิงก์ลับ/ }));

    await vi.waitFor(() =>
      expect(updateNovel).toHaveBeenCalledWith("my-novel", { visibility: "unlisted" }),
    );
  });

  it("rolls the badge back and shows the reason when the API refuses", async () => {
    updateNovel.mockRejectedValue(new Error("refused"));
    render(
      <VisibilityBadge novelRef="my-novel" visibility={Visibility.Private} status="draft" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /ส่วนตัว/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /สาธารณะ/ }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ส่วนตัว/ })).toBeInTheDocument();
  });
});
