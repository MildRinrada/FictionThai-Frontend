import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AchievementGrid } from "@/components/profile/achievement-grid";
import {
  EditableBio,
  EditableExtras,
  EditableName,
} from "@/features/profile/inline-profile";
import { NextSteps } from "@/features/profile/next-steps";
import type { PublicProfile } from "@/types/profile";

/**
 * Inline profile editing (profile review 2026-08, section A): the page is
 * edited where it is read. What these tests defend - the empty bio is a door
 * not a dead end, the name edits in place with Enter, the extras rows offer
 * their "+ เพิ่ม", the checklist is one dismissible line, and the
 * achievement block shows ONE locked slot instead of a wall of padlocks.
 */

const saveProfile = vi.fn(() => Promise.resolve());
vi.mock("@/lib/profile-client", () => ({
  saveProfile: (...args: unknown[]) => saveProfile(...(args as [])),
}));

const getMyAchievements = vi.fn(() =>
  Promise.resolve({ enabled: true, achievements: [] }),
);
vi.mock("@/lib/achievements-client", () => ({
  getMyAchievements: () => getMyAchievements(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

// inline-profile pulls ProfileEditor for its dialog, whose cache-refresh
// server action would drag `server-only` into a jsdom run.
vi.mock("@/app/settings/profile/actions", () => ({
  refreshProfileCache: vi.fn(() => Promise.resolve()),
}));

function profile(overrides: Partial<PublicProfile> = {}): PublicProfile {
  return {
    id: "u1",
    username: "readerly",
    display_name: "คนอ่านดี",
    joined_at: "2026-08-01T00:00:00Z",
    is_author: false,
    open_for: [],
    links: [],
    pen_names: [],
    former_names: [],
    pinned: [],
    wall_enabled: false,
    hide_from_rankings: false,
    novel_count: 0,
    follower_count: 0,
    total_views: 0,
    ...overrides,
  } as PublicProfile;
}

beforeEach(() => {
  saveProfile.mockClear();
  window.localStorage.clear();
});

describe("inline profile editing", () => {
  it("edits the name exactly where it is read - Enter saves", async () => {
    render(<EditableName profile={profile()} />);

    fireEvent.click(screen.getByRole("button", { name: /คนอ่านดี/ }));
    const field = screen.getByLabelText("ชื่อที่แสดง");
    fireEvent.change(field, { target: { value: "ชื่อใหม่" } });
    fireEvent.keyDown(field, { key: "Enter" });

    await waitFor(() =>
      expect(saveProfile).toHaveBeenCalledWith({ display_name: "ชื่อใหม่" }),
    );
  });

  it("the empty bio card is a DOOR: click it, get the textarea and counter", async () => {
    render(<EditableBio profile={profile()} />);

    fireEvent.click(
      screen.getByRole("button", { name: /ยังไม่ได้เขียนแนะนำตัว - คลิกตรงนี้เพื่อเขียน/ }),
    );
    const field = screen.getByLabelText("แนะนำตัว");
    fireEvent.change(field, { target: { value: "สวัสดีค่ะ" } });
    expect(screen.getByText(/\/2000$/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(saveProfile).toHaveBeenCalledWith({ bio: "สวัสดีค่ะ" }));
  });

  it("offers + เพิ่มลิงก์ when there are none, and saves the new row", async () => {
    render(<EditableExtras profile={profile()} />);

    fireEvent.click(screen.getByRole("button", { name: /เพิ่มลิงก์โซเชียล/ }));
    fireEvent.change(screen.getByLabelText("ชื่อลิงก์"), { target: { value: "X" } });
    fireEvent.change(screen.getByLabelText("ที่อยู่ลิงก์"), {
      target: { value: "https://x.com/readerly" },
    });
    fireEvent.click(screen.getByRole("button", { name: "เพิ่ม" }));

    await waitFor(() =>
      expect(saveProfile).toHaveBeenCalledWith({
        links: [{ label: "X", url: "https://x.com/readerly" }],
      }),
    );
  });

  it("writes the boundaries field that never had a UI", async () => {
    render(<EditableExtras profile={profile()} />);

    fireEvent.click(screen.getByRole("button", { name: /คำเตือน\/ขอบเขตของฉัน/ }));
    fireEvent.change(screen.getByLabelText("คำเตือนและขอบเขตของนักเขียน"), {
      target: { value: "งดสปอยล์" },
    });
    fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));

    await waitFor(() =>
      expect(saveProfile).toHaveBeenCalledWith({ boundaries: "งดสปอยล์" }),
    );
  });
});

describe("the next-steps line", () => {
  it("is ONE collapsed line that expands, with a real CTA per item", async () => {
    render(<NextSteps profile={profile()} />);

    const bar = await screen.findByRole("button", { name: /โปรไฟล์ยังไม่ครบ/ });
    expect(bar).toHaveTextContent("0/5");

    fireEvent.click(bar);
    expect(screen.getByText("เขียนแนะนำตัว")).toBeInTheDocument();
    // Every item carries a way to go DO it - no passive rows.
    expect(screen.getAllByRole("link").length).toBeGreaterThanOrEqual(5);
    // Nothing the owner cannot control is listed.
    expect(screen.queryByText(/มีคนอ่านจริง/)).not.toBeInTheDocument();
  });

  it("ปิดถาวร means permanently - it stays gone", async () => {
    const { unmount } = render(<NextSteps profile={profile()} />);
    fireEvent.click(await screen.findByRole("button", { name: "ปิดถาวร" }));
    expect(screen.queryByText(/โปรไฟล์ยังไม่ครบ/)).not.toBeInTheDocument();

    unmount();
    render(<NextSteps profile={profile()} />);
    await Promise.resolve();
    expect(screen.queryByText(/โปรไฟล์ยังไม่ครบ/)).not.toBeInTheDocument();
  });
});

describe("the achievement block", () => {
  const achievements = {
    enabled: true,
    unlocked: 1,
    total: 9,
    showcase: [{ key: "first_chapter", title: "ก้าวแรก", description: null }],
    eggs: { unlocked: 2 },
  };

  it("shows ONE locked slot, never a wall of padlocks", () => {
    render(
      <AchievementGrid
        achievements={achievements as never}
        name="คนอ่านดี"
      />,
    );

    expect(screen.getByText("อีก 8 เหรียญ")).toBeInTheDocument();
    // One showcase medal + exactly one "next" slot - never eight padlocks.
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("splits the two numbers onto two readable lines", () => {
    render(
      <AchievementGrid
        achievements={achievements as never}
        name="คนอ่านดี"
      />,
    );

    expect(screen.getByText("ปลดล็อกแล้ว 1 / 9")).toBeInTheDocument();
    expect(screen.getByText("ของลับที่เจอ 2")).toBeInTheDocument();
    expect(screen.queryByText(/\?\?/)).not.toBeInTheDocument();
  });
});
