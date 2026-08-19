import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CommentWall } from "@/components/profile/comment-wall";
import type { WallEntry } from "@/types/shelf";

/**
 * The profile comment wall.
 *
 * What is defended here is the set of things a wall gets wrong if nobody
 * checks: a guest must be offered sign-in rather than a form that 401s; the
 * delete control must follow what the API said, not what the component guessed;
 * a wall its owner closed must be ABSENT rather than an error message; and an
 * empty wall must say something a person can act on.
 */

const getWall = vi.fn();
const postToWall = vi.fn();
const deleteWallEntry = vi.fn();

vi.mock("@/lib/wall-client", () => ({
  getWall: (...args: unknown[]) => getWall(...args),
  postToWall: (...args: unknown[]) => postToWall(...args),
  deleteWallEntry: (...args: unknown[]) => deleteWallEntry(...args),
  WALL_DISABLED: "WALL_DISABLED",
}));

function entry(overrides: Partial<WallEntry> = {}): WallEntry {
  return {
    id: "e1",
    body: "อ่านเรื่องล่าสุดแล้ว ชอบมากค่ะ",
    created_at: "2026-08-14T10:00:00Z",
    author: { id: "u2", username: "reader", display_name: "ผู้อ่านคนหนึ่ง" },
    is_owner: false,
    can_delete: false,
    ...overrides,
  };
}

function page(items: WallEntry[]) {
  return { items, meta: { page: 1, per_page: 20, total: items.length } };
}

describe("the profile comment wall", () => {
  beforeEach(() => {
    getWall.mockReset();
    postToWall.mockReset();
    deleteWallEntry.mockReset();
    getWall.mockResolvedValue(page([entry()]));
  });

  it("shows what people left, and who left it", async () => {
    render(<CommentWall userRef="nattavara" ownerName="ณัฐวรา" />);

    expect(await screen.findByText("อ่านเรื่องล่าสุดแล้ว ชอบมากค่ะ")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ผู้อ่านคนหนึ่ง" })).toHaveAttribute(
      "href",
      "/users/reader",
    );
    // Nothing to delete: the API said so, and the component does not decide.
    expect(screen.queryByRole("button", { name: /ลบ|เอาออก/ })).not.toBeInTheDocument();
  });

  it("says something an empty wall can be acted on", async () => {
    getWall.mockResolvedValue(page([]));
    render(<CommentWall userRef="nattavara" ownerName="ณัฐวรา" />);

    expect(await screen.findByText(/ยังไม่มีใครฝากข้อความไว้/)).toBeInTheDocument();
  });

  it("offers a guest sign-in instead of a form that cannot work", async () => {
    const { ApiError } = await import("@/lib/api");
    postToWall.mockRejectedValue(
      new ApiError(401, { code: "UNAUTHORIZED", message: "Authentication required." }),
    );

    render(<CommentWall userRef="nattavara" ownerName="ณัฐวรา" />);
    await screen.findByText("อ่านเรื่องล่าสุดแล้ว ชอบมากค่ะ");

    // The guest CAN read - the composer is offered, and only the attempt
    // reveals that an account is needed, with what they typed still theirs.
    fireEvent.change(screen.getByLabelText(/ฝากข้อความถึง ณัฐวรา/), {
      target: { value: "ชอบเรื่องนี้มาก" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "ฝากข้อความ" }));
    });

    expect(screen.getByRole("link", { name: "เข้าสู่ระบบ" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ฝากข้อความ" })).not.toBeInTheDocument();
  });

  it("posts a message and puts it at the top", async () => {
    postToWall.mockResolvedValue(
      entry({ id: "e2", body: "ฝากไว้หน่อย", is_owner: true, can_delete: true }),
    );

    render(<CommentWall userRef="nattavara" ownerName="ณัฐวรา" />);
    await screen.findByText("อ่านเรื่องล่าสุดแล้ว ชอบมากค่ะ");

    fireEvent.change(screen.getByLabelText(/ฝากข้อความถึง ณัฐวรา/), {
      target: { value: "  ฝากไว้หน่อย  " },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "ฝากข้อความ" }));
    });

    // Trimmed before it is sent - trailing whitespace is never meaningful.
    expect(postToWall).toHaveBeenCalledWith("nattavara", "ฝากไว้หน่อย");
    expect(screen.getByText("ฝากไว้หน่อย")).toBeInTheDocument();
    // Own message: the wording is "take mine back".
    expect(
      screen.getByRole("button", { name: "ลบข้อความของฉัน" }),
    ).toBeInTheDocument();
  });

  it("lets the page's owner clear somebody else's message off their page", async () => {
    getWall.mockResolvedValue(
      page([entry({ is_owner: false, can_delete: true })]),
    );
    deleteWallEntry.mockResolvedValue(undefined);

    render(<CommentWall userRef="nattavara" ownerName="ณัฐวรา" />);

    // Not "delete mine" - it is not theirs, it is on their page.
    const control = await screen.findByRole("button", { name: "เอาออกจากหน้าของฉัน" });
    await act(async () => {
      fireEvent.click(control);
    });

    expect(deleteWallEntry).toHaveBeenCalledWith("e1");
    await waitFor(() =>
      expect(
        screen.queryByText("อ่านเรื่องล่าสุดแล้ว ชอบมากค่ะ"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/ยังไม่มีใครฝากข้อความไว้/)).toBeInTheDocument();
  });

  it("renders nothing at all when the owner switched the wall off", () => {
    const { container } = render(
      <CommentWall userRef="nattavara" ownerName="ณัฐวรา" enabled={false} />,
    );

    expect(container).toBeEmptyDOMElement();
    // And it does not even ask - a closed wall is absent, not an error.
    expect(getWall).not.toHaveBeenCalled();
  });

  it("treats a WALL_DISABLED answer as absence rather than failure", async () => {
    const { ApiError } = await import("@/lib/api");
    getWall.mockRejectedValue(
      new ApiError(404, { code: "WALL_DISABLED", message: "Wall is off." }),
    );

    const { container } = render(<CommentWall userRef="nattavara" ownerName="ณัฐวรา" />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
