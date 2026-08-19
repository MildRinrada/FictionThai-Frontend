import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PublishChecklist } from "@/features/studio/publish-checklist";
import type { Readiness } from "@/types/novel";

/**
 * ก่อนเผยแพร่, with somewhere to go (§13T), reworked after a writer read the
 * panel and could not tell what was blocking them.
 *
 * What is under test now:
 *
 *   - the count appears ONCE, beside the button waiting on it. The header's
 *     own "2/4" said the same thing a second time and the two had to be
 *     reconciled on every read;
 *   - required rows and advice live in separate lists, so a ✓ next to "แนะนำ"
 *     never reads as a contradiction;
 *   - publishing is one button with no questions attached - no rung picker,
 *     because the panel beside the title already owns that fact;
 *   - the friends-first link is its own button, named after the intent rather
 *     than after the database value;
 *   - undeclared variables appear as an advisory row when the caller reports
 *     them - a reader meeting raw "(y/n)" is worse than a missing tag.
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

function readiness(overrides?: Partial<Readiness>): Readiness {
  return {
    ready: false,
    items: [
      { key: "description", label: "เรื่องย่อ", done: true, required: true },
      { key: "genres", label: "หมวดหมู่", done: false, required: true, hint: "เลือกก่อน" },
      { key: "tags", label: "แท็ก", done: false, required: true },
      { key: "cover", label: "ปกเรื่อง", done: false, required: false },
      { key: "email_verified", label: "ยืนยันอีเมล", done: true, required: true },
    ],
    ...overrides,
  };
}

function renderChecklist(value: Readiness = readiness()) {
  return render(
    <PublishChecklist
      readiness={value}
      novelRef="my-novel"
      slug="my-novel"
      status="draft"
    />,
  );
}

describe("PublishChecklist", () => {
  it("separates required rows from advice, without a second count up top", () => {
    const { container } = renderChecklist();

    // The header names the panel and nothing else - the one count lives
    // beside the publish button.
    expect(screen.getByText("ก่อนเผยแพร่")).toBeInTheDocument();
    expect(screen.queryByText(/2\/4/)).not.toBeInTheDocument();
    const lists = container.querySelectorAll("ul");
    expect(lists[0].querySelectorAll("li")).toHaveLength(4);
    expect(screen.getByText(/แนะนำเพิ่มเติม/)).toBeInTheDocument();
    expect(lists[1].querySelectorAll("li")).toHaveLength(1);
  });

  it("says how many are left exactly once", () => {
    renderChecklist();
    expect(screen.getAllByText(/อีก 2 ข้อจะเผยแพร่ได้/)).toHaveLength(1);
  });

  it("lists undeclared variables as advice with a link to the details", () => {
    render(
      <PublishChecklist
        readiness={readiness()}
        novelRef="my-novel"
        slug="my-novel"
        status="draft"
        undeclaredVariables={2}
      />,
    );
    expect(screen.getByText(/ประกาศตัวแปรที่ใช้ในตอน \(2 ตัว\)/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ดูรายละเอียด" })).toHaveAttribute(
      "href",
      "#undeclared-variables",
    );
    // Advisory only: the remaining count keeps counting REQUIRED rows.
    expect(screen.getByText(/อีก 2 ข้อจะเผยแพร่ได้/)).toBeInTheDocument();
  });

  it("asks no questions before publishing - no rung picker in this box", () => {
    renderChecklist();
    expect(screen.queryByLabelText("ใครเห็นได้")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("keeps both buttons dim while required items remain", () => {
    renderChecklist();
    expect(screen.getByRole("button", { name: /เผยแพร่เรื่อง/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /ส่งลิงก์ให้เพื่อนอ่านก่อน/ })).toBeDisabled();
    expect(updateNovel).not.toHaveBeenCalled();
  });

  it("publishes to everyone in one press once the list is done", async () => {
    updateNovel.mockResolvedValue({});
    const done = readiness({
      ready: true,
      items: readiness().items.map((item) =>
        item.key === "cover" ? item : { ...item, done: true },
      ),
    });
    renderChecklist(done);

    const button = screen.getByRole("button", { name: /เผยแพร่เรื่อง/ });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    await vi.waitFor(() =>
      expect(updateNovel).toHaveBeenCalledWith("my-novel", {
        visibility: "public",
        status: "ongoing",
      }),
    );
  });

  it("makes a secret link from a button named after what the writer wants", async () => {
    updateNovel.mockResolvedValue({});
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const done = readiness({
      ready: true,
      items: readiness().items.map((item) => ({ ...item, done: true })),
    });
    renderChecklist(done);

    fireEvent.click(screen.getByRole("button", { name: /ส่งลิงก์ให้เพื่อนอ่านก่อน/ }));

    await vi.waitFor(() =>
      expect(updateNovel).toHaveBeenCalledWith("my-novel", {
        visibility: "unlisted",
        status: "ongoing",
      }),
    );
    // The point of that button: the link is already on the clipboard.
    await vi.waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/novel/my-novel")),
    );
  });
});
