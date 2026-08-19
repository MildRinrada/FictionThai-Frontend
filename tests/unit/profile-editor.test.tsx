import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProfileEditor } from "@/features/profile/profile-editor";
import type { PublicProfile } from "@/types/profile";

/**
 * The profile editor - the write path that did not exist until
 * docs/PROFILE-AND-ACHIEVEMENTS.md Part 1.
 *
 * What is defended: a partial edit is sent as one save, blank link rows are not
 * sent at all, availability is a toggle rather than free text, and a field
 * error from the API lands on the field it belongs to instead of a generic
 * "Validation failed."
 */

const saveProfile = vi.fn();
vi.mock("@/lib/profile-client", () => ({
  saveProfile: (...args: unknown[]) => saveProfile(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/features/media/media-upload-button", () => ({
  MediaUploadButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));
// A "use server" module cannot be imported into a component test.
vi.mock("@/app/settings/profile/actions", () => ({
  refreshProfileCache: vi.fn().mockResolvedValue(undefined),
}));

function profile(overrides: Partial<PublicProfile> = {}): PublicProfile {
  return {
    id: "9f1c0f5e-0000-4000-8000-000000000001",
    username: "ftadmin",
    display_name: null,
    joined_at: "2026-01-01T00:00:00Z",
    links: [],
    is_author: false,
    open_for: [],
    pen_names: [],
    former_names: [],
    pinned: [],
    wall_enabled: true,
    hide_from_rankings: false,
    novel_count: 0,
    follower_count: 0,
    total_views: 0,
    ...overrides,
  };
}

describe("the profile editor", () => {
  beforeEach(() => {
    saveProfile.mockReset();
    saveProfile.mockResolvedValue(profile());
  });

  it("says plainly which name changes and which one does not", () => {
    render(<ProfileEditor profile={profile()} />);
    expect(screen.getByText(/@ftadmin เป็นชื่อผู้ใช้ถาวร/)).toBeInTheDocument();
  });

  it("sends one save with the filled fields, dropping blank link rows", async () => {
    render(<ProfileEditor profile={profile()} />);

    fireEvent.change(screen.getByLabelText(/ชื่อที่แสดง/), {
      target: { value: "ณัฐวรา" },
    });
    fireEvent.change(screen.getByLabelText(/แนะนำตัว/), {
      target: { value: "เขียนฟิคเป็นงานอดิเรก" },
    });
    fireEvent.change(screen.getByLabelText("ที่อยู่ลิงก์ที่ 1"), {
      target: { value: "https://x.com/someone" },
    });
    fireEvent.change(screen.getByLabelText("ชื่อลิงก์ที่ 1"), {
      target: { value: "X" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "บันทึกโปรไฟล์" }));
    });

    expect(saveProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        display_name: "ณัฐวรา",
        bio: "เขียนฟิคเป็นงานอดิเรก",
        links: [{ label: "X", url: "https://x.com/someone" }],
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("บันทึกแล้ว");
  });

  it("carries availability as a toggle, not as typing", async () => {
    render(<ProfileEditor profile={profile()} />);

    const toggle = screen.getByRole("switch", { name: "รับคอมมิชชัน" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "บันทึกโปรไฟล์" }));
    });
    expect(saveProfile).toHaveBeenCalledWith(
      expect.objectContaining({ open_for: ["commission"] }),
    );
  });

  it("puts a field error on its own field", async () => {
    const failure = Object.assign(new Error("ข้อมูลไม่ถูกต้อง"), {
      name: "ApiError",
      status: 422,
      fields: { website_url: ["ลิงก์ต้องเป็น URL เต็มที่ขึ้นต้นด้วย https://"] },
    });
    // The component branches on instanceof ApiError; the real class is used so
    // the branch under test is the real one.
    const { ApiError } = await import("@/lib/api");
    saveProfile.mockRejectedValue(
      new ApiError(422, { code: "VALIDATION_FAILED", message: failure.message, fields: failure.fields }),
    );

    render(<ProfileEditor profile={profile()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "บันทึกโปรไฟล์" }));
    });

    expect(
      screen.getByText("ลิงก์ต้องเป็น URL เต็มที่ขึ้นต้นด้วย https://"),
    ).toBeInTheDocument();
  });
});
