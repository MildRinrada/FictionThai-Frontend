import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * The shell, split by role.
 *
 * The problems this rebuild answers, each of which is one test below:
 *
 *   - สตูดิโอ was reachable only through the avatar menu, which is where people
 *     look for settings and sign-out. A writer's most-opened page cannot live
 *     there.
 *   - Nothing told a writer they had unfinished work. The badge counts drafts
 *     WITH WORDS IN THEM, so it is a number that can actually be cleared.
 *   - "สร้างผลงาน" only ever offered a NEW fiction, while the common act is
 *     adding a chapter to one already in progress.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/auth-client", () => ({ logout: vi.fn() }));

const { StudioLink } = await import("@/components/shell/studio-link");
const { CreateMenu } = await import("@/components/shell/create-menu");
const { AccountMenu } = await import("@/components/shell/account-menu");
const { MobileNav } = await import("@/components/shell/mobile-nav");
const { SectionMenu } = await import("@/components/shell/section-menu");

describe("a section menu", () => {
  const items = [
    { href: "/novels?preset=completed", label: "จบแล้ว", hint: "อ่านรวดเดียวจบ" },
    { href: "/novels?preset=chat", label: "แชทล้วน" },
  ];

  it("keeps the label a real destination", () => {
    render(<SectionMenu href="/explore" label="สำรวจ" items={items} />);
    expect(screen.getByRole("link", { name: "สำรวจ" })).toHaveAttribute("href", "/explore");
  });

  it("opens on the chevron even when the pointer already opened it", () => {
    render(<SectionMenu href="/explore" label="สำรวจ" items={items} />);
    const chevron = screen.getByRole("button", { name: /ทางลัดในสำรวจ/ });

    // The pointer arriving is what opens it on a desktop - and the click that
    // follows must not toggle it straight back shut, which is exactly what a
    // single open/closed flag did.
    fireEvent.mouseEnter(chevron.parentElement!.parentElement!);
    fireEvent.click(chevron);

    expect(screen.getByRole("menuitem", { name: /จบแล้ว/ })).toHaveAttribute(
      "href",
      "/novels?preset=completed",
    );
  });

  it("stays open for a pointer that cannot hover, until asked to close", () => {
    render(<SectionMenu href="/explore" label="สำรวจ" items={items} />);
    const wrapper = screen.getByRole("link", { name: "สำรวจ" }).parentElement!.parentElement!;
    const chevron = screen.getByRole("button", { name: /ทางลัดในสำรวจ/ });

    fireEvent.click(chevron);
    fireEvent.mouseLeave(wrapper);
    expect(screen.getByRole("menuitem", { name: "แชทล้วน" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menuitem", { name: "แชทล้วน" })).toBeNull();
  });
});

describe("the studio link", () => {
  it("is a link of its own, with the count of unfinished drafts", () => {
    render(<StudioLink unfinished={3} />);

    const link = screen.getByRole("link", { name: /สตูดิโอ/ });
    expect(link).toHaveAttribute("href", "/studio");
    expect(screen.getByText("3")).toBeInTheDocument();
    // The number is announced with its meaning - "สตูดิโอ 3" alone is an
    // address, not a message.
    expect(screen.getByLabelText(/ร่างที่ยังไม่เผยแพร่ 3 ตอน/)).toBeInTheDocument();
  });

  it("shows no badge when nothing is waiting", () => {
    render(<StudioLink unfinished={0} />);

    expect(screen.getByRole("link", { name: /สตูดิโอ/ })).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("caps a very large count instead of stretching the header", () => {
    render(<StudioLink unfinished={412} />);
    expect(screen.getByText("99+")).toBeInTheDocument();
  });
});

describe("the create menu", () => {
  const recent = [
    { slug: "a", title: "ดาวเหนือฟ้าเดียวกัน", unfinished: 2, updated_at: new Date().toISOString() },
    { slug: "b", title: "ฤดูที่หายไป", unfinished: 0, updated_at: new Date().toISOString() },
  ];

  it("keeps a new fiction one press away without opening anything", () => {
    render(<CreateMenu recent={recent} />);

    expect(screen.getByRole("link", { name: /สร้างผลงาน/ })).toHaveAttribute(
      "href",
      "/studio/novels/new",
    );
  });

  it("offers the fictions in progress, straight to their chapters", () => {
    render(<CreateMenu recent={recent} />);
    fireEvent.click(screen.getByRole("button", { name: "ตัวเลือกการสร้าง" }));

    expect(screen.getByText("เพิ่มตอนในเรื่องที่ค้างอยู่")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /ดาวเหนือฟ้าเดียวกัน/ })).toHaveAttribute(
      "href",
      "/studio/novels/a/chapters",
    );
    // The one with work waiting says so; the other shows when it was touched.
    expect(screen.getByText("ค้าง 2")).toBeInTheDocument();
  });

  it("degrades to the new-fiction item for a writer with no works yet", () => {
    render(<CreateMenu recent={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "ตัวเลือกการสร้าง" }));

    expect(screen.getByRole("menuitem", { name: /เริ่มนิยายเรื่องใหม่/ })).toBeInTheDocument();
    expect(screen.queryByText("เพิ่มตอนในเรื่องที่ค้างอยู่")).not.toBeInTheDocument();
  });
});

describe("the account menu", () => {
  it("holds the account and no longer hides the workspace", () => {
    render(<AccountMenu displayName="ณัฐวรา" username="nattavara" />);
    fireEvent.click(screen.getByRole("button", { name: /บัญชีของ/ }));

    expect(screen.getByRole("menuitem", { name: /โปรไฟล์ของฉัน/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /ออกจากระบบ/ })).toBeInTheDocument();
    // The two workspaces are top-level links now; finding them in here again
    // would mean the header had quietly re-hidden them.
    expect(screen.queryByRole("menuitem", { name: /สตูดิโอ/ })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /^คลังของฉัน$/ })).toBeNull();
  });

  it("shows the permanent handle beside the changeable name", () => {
    render(<AccountMenu displayName="ณัฐวรา" username="nattavara" />);
    fireEvent.click(screen.getByRole("button", { name: /บัญชีของ/ }));

    expect(screen.getByText("@nattavara")).toBeInTheDocument();
  });
});

describe("the mobile bar", () => {
  it("gives สตูดิโอ a slot of its own rather than a hamburger", () => {
    render(<MobileNav signedIn unfinished={4} />);

    expect(screen.getByRole("link", { name: /สตูดิโอ/ })).toHaveAttribute("href", "/studio");
    expect(screen.getByLabelText(/ร่างที่ยังไม่เผยแพร่ 4 ตอน/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "สร้างผลงาน" })).toHaveAttribute(
      "href",
      "/studio/novels/new",
    );
  });

  it("keeps a guest's way in", () => {
    render(<MobileNav signedIn={false} />);

    expect(screen.getByRole("link", { name: /เข้าสู่ระบบ/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /สตูดิโอ/ })).toBeNull();
  });
});
