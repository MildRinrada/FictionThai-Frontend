import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProfileHero } from "@/components/profile/profile-hero";
import { ProfileSidebar } from "@/components/profile/profile-sidebar";
import { ProfileTabs, profileTabOf } from "@/components/profile/profile-tabs";
import type { PublicProfile } from "@/types/profile";

/**
 * The public profile (docs/PHASE-12-STORY-DEPTH.md §12E) and the three defects
 * the prototype shipped with.
 *
 * Each assertion below corresponds to one of them: the band painting over the
 * avatar, a pen-name tab promising a collection the schema cannot hold, and
 * the work being ranked behind a status feed.
 */

function profile(overrides: Partial<PublicProfile> = {}): PublicProfile {
  return {
    id: "9f1c0f5e-0000-4000-8000-000000000001",
    username: "nattavara_s",
    display_name: "ณัฐวรา ศิริ",
    joined_at: "2023-07-01T00:00:00Z",
    links: [],
    is_author: true,
    open_for: [],
    pen_names: [],
    former_names: [],
    pinned: [],
    wall_enabled: true,
    hide_from_rankings: false,
    novel_count: 6,
    follower_count: 4208,
    total_views: 612000,
    ...overrides,
  };
}

describe("the identity band", () => {
  // The prototype's bug: the band is positioned, so without an explicit level
  // it paints over the avatar that the negative margin pulled up.
  it("puts the avatar above the band, not behind it", () => {
    const { container } = render(<ProfileHero profile={profile()} />);

    const band = container.querySelector(".z-0");
    const identity = container.querySelector(".z-10");

    expect(band).not.toBeNull();
    expect(identity).not.toBeNull();
    // Both levels are declared, inside a wrapper that isolates them from the
    // rest of the page.
    expect(container.querySelector(".isolate")).not.toBeNull();
    // The avatar lives in the raised row, never in the band.
    expect(identity).toContainElement(screen.getByRole("heading", { level: 1 }));
    expect(band).not.toContainElement(screen.getByRole("heading", { level: 1 }));
  });

  it("leads with the display name, not the username", () => {
    render(<ProfileHero profile={profile()} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("ณัฐวรา ศิริ");
  });

  it("falls back to the username when there is no display name", () => {
    render(<ProfileHero profile={profile({ display_name: null })} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("nattavara_s");
  });

  // The heading is the name the writer CHOSE; @handle beneath it is the one
  // that never changes (docs/PROFILE-AND-ACHIEVEMENTS.md Part 1).
  it("leads with the pen name when there is one", () => {
    render(<ProfileHero profile={profile({ pen_name: "ณัฐวรา" })} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("ณัฐวรา");
    expect(screen.getByText("@nattavara_s")).toBeInTheDocument();
  });

  // The complaint that started this: `ftadmin` over `@ftadmin` - the same
  // string twice, in the one place a chosen identity should appear.
  it("never prints the handle twice when there is no chosen name", () => {
    render(<ProfileHero profile={profile({ display_name: null, pen_name: null })} />);
    expect(screen.getAllByText(/nattavara_s/)).toHaveLength(2); // heading + handle
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("nattavara_s");
    expect(screen.getByText("@nattavara_s")).toHaveClass("font-mono");
  });

  // Roles are a category, the join date is a fact about the account. Running
  // them together in one grey sentence made both harder to read.
  it("puts roles in their own chips, out of the meta sentence", () => {
    render(<ProfileHero profile={profile()} />);

    const joined = screen.getByText(/เข้าร่วมเมื่อ/);
    expect(joined).not.toHaveTextContent("นักอ่าน");
    expect(screen.getByText("นักเขียน")).toBeInTheDocument();
    expect(screen.getByText("นักอ่าน")).toBeInTheDocument();
  });

  it("shows what the writer is open to beside their roles", () => {
    render(<ProfileHero profile={profile({ open_for: ["commission"] })} />);
    expect(screen.getByText("รับคอมมิชชัน")).toBeInTheDocument();
  });

  it("renders a real cover when the owner has set one, and its control", () => {
    const { container } = render(
      <ProfileHero
        profile={profile({ banner_url: "https://cdn.example/banner.jpg" })}
        bannerAction={<button type="button">เปลี่ยนภาพปก</button>}
      />,
    );

    const banner = container.querySelector('img[src="https://cdn.example/banner.jpg"]');
    expect(banner).not.toBeNull();
    expect(screen.getByRole("button", { name: "เปลี่ยนภาพปก" })).toBeInTheDocument();
  });

  it("gives a visitor no cover control at all", () => {
    render(<ProfileHero profile={profile()} />);
    expect(screen.queryByRole("button", { name: "เปลี่ยนภาพปก" })).toBeNull();
  });
});

describe("the profile tabs", () => {
  it("defaults to the person's work", () => {
    expect(profileTabOf(undefined)).toBe("works");
    expect(profileTabOf("")).toBe("works");
    // An unknown tab falls back to the same default rather than rendering
    // nothing (docs/09 §52's principle, applied to a URL).
    expect(profileTabOf("nonsense")).toBe("works");
    expect(profileTabOf("timeline")).toBe("timeline");
  });

  it("lists ผลงาน first", () => {
    render(
      <ProfileTabs basePath="/profile" active="works" workCount={6} timelineCount={128} />,
    );

    const tabs = screen.getAllByRole("link");
    expect(tabs[0]).toHaveTextContent("ผลงาน");
    // ไทม์ไลน์ says what it is now (profile review 2026-08 section D).
    expect(tabs[1]).toHaveTextContent("โพสต์");
    expect(tabs[0]).toHaveAttribute("aria-current", "page");
  });

  it("hides a section a visitor has nothing to see in", () => {
    render(
      <ProfileTabs basePath="/profile" active="works" workCount={6} timelineCount={128} />,
    );

    // นามปากกา and คอมเมนต์ถึงเรา exist now, but a profile with none of either
    // shows neither - an empty row of zeroes is how a page starts looking
    // abandoned (docs/PROFILE-AND-ACHIEVEMENTS.md).
    expect(screen.queryByText(/นามปากกา/)).not.toBeInTheDocument();
    expect(screen.queryByText(/คอมเมนต์ถึงเรา/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("keeps every tab a real URL, so it works before hydration", () => {
    render(
      <ProfileTabs
        basePath="/users/nattavara_s"
        active="timeline"
        workCount={6}
        timelineCount={128}
      />,
    );

    expect(screen.getByRole("link", { name: /ผลงาน/ })).toHaveAttribute(
      "href",
      "/users/nattavara_s",
    );
    expect(screen.getByRole("link", { name: /โพสต์/ })).toHaveAttribute(
      "href",
      "/users/nattavara_s?tab=timeline",
    );
  });
});

describe("the profile sidebar", () => {
  it("shows only numbers the API actually returned", () => {
    render(<ProfileSidebar profile={profile()} />);

    expect(screen.getByText("6 เรื่อง")).toBeInTheDocument();
    expect(screen.getByText("4,208")).toBeInTheDocument();
    expect(screen.getByText("612,000")).toBeInTheDocument();
  });

  // "0 การอ่าน" on a new writer's profile reads as a verdict on them, the same
  // reason a card hides a read count below a thousand (§12C).
  it("stays quiet about readership until there is some", () => {
    render(<ProfileSidebar profile={profile({ total_views: 12 })} />);
    expect(screen.queryByText("การอ่านรวม")).not.toBeInTheDocument();
  });

  // The prototype's six achievements each imply a rule that has to be
  // evaluated and stored; a badge that is really a picture is worse than none.
  it("invents no achievements", () => {
    render(<ProfileSidebar profile={profile()} />);
    expect(screen.queryByText(/เหรียญ|ความสำเร็จ|ปลดล็อก/)).not.toBeInTheDocument();
  });

  it("marks the writer's own support link as leaving the platform", () => {
    render(
      <ProfileSidebar
        profile={profile({ donation_url: "https://easydonate.example/nattavara" })}
      />,
    );

    const link = screen.getByRole("link", { name: /สนับสนุน/ });
    expect(link).toHaveAttribute("href", "https://easydonate.example/nattavara");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("ugc");
  });

  it("shows no support card when the writer has not set one", () => {
    render(<ProfileSidebar profile={profile()} />);
    expect(screen.queryByText(/สนับสนุนนักเขียน/)).not.toBeInTheDocument();
  });

  // Two empty bordered boxes read as a broken page, not a new one
  // (docs/PROFILE-AND-ACHIEVEMENTS.md Part 1).
  it("collapses to one card while the profile is still empty", () => {
    const { container } = render(
      <ProfileSidebar
        profile={profile({
          bio: null,
          author_bio: null,
          novel_count: 0,
          follower_count: 0,
          total_views: 0,
        })}
      />,
    );

    expect(container.querySelectorAll("section")).toHaveLength(1);
    expect(screen.queryByText("ตัวเลข")).not.toBeInTheDocument();
    expect(screen.getByText("ยังไม่ได้เขียนแนะนำตัว")).toBeInTheDocument();
  });

  it("splits into two cards once both halves have something to say", () => {
    const { container } = render(
      <ProfileSidebar profile={profile({ bio: "เขียนฟิคเป็นงานอดิเรก" })} />,
    );

    expect(container.querySelectorAll("section")).toHaveLength(2);
    expect(screen.getByText("ตัวเลข")).toBeInTheDocument();
  });

  it("lists the writer's own links, marked as leaving the platform", () => {
    render(
      <ProfileSidebar
        profile={profile({
          bio: "…",
          links: [{ label: "X", url: "https://x.com/someone" }],
        })}
      />,
    );

    const link = screen.getByRole("link", { name: "X" });
    expect(link).toHaveAttribute("href", "https://x.com/someone");
    expect(link.getAttribute("rel")).toContain("ugc");
  });
});
