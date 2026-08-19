import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";

/**
 * The bookmark toggle.
 *
 * What matters: the caller's state comes from the API after mount (the page
 * itself stays cacheable), a guest's click preserves their intent by routing
 * to sign-in (docs/02 §5.2), and a failed mutation rolls the optimistic state
 * back rather than lying.
 */

const getBookmarkStatus = vi.fn();
const bookmarkNovel = vi.fn();
const removeBookmark = vi.fn();
const push = vi.fn();

vi.mock("@/lib/library-client", () => ({
  getBookmarkStatus: (...args: unknown[]) => getBookmarkStatus(...args),
  bookmarkNovel: (...args: unknown[]) => bookmarkNovel(...args),
  removeBookmark: (...args: unknown[]) => removeBookmark(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

let BookmarkButton: typeof import("@/features/library/bookmark-button").BookmarkButton;

beforeEach(async () => {
  ({ BookmarkButton } = await import("@/features/library/bookmark-button"));
});

afterEach(() => {
  getBookmarkStatus.mockReset();
  bookmarkNovel.mockReset();
  removeBookmark.mockReset();
  push.mockReset();
});

const unauthorized = () =>
  new ApiError(401, { code: "UNAUTHORIZED", message: "Authentication required." });

describe("BookmarkButton", () => {
  it("reflects the caller's saved state from the API", async () => {
    getBookmarkStatus.mockResolvedValue({ is_bookmarked: true });
    render(<BookmarkButton novelRef="n1" />);

    await waitFor(() =>
      expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true"),
    );
    expect(screen.getByRole("button")).toHaveTextContent("บันทึกแล้ว");
  });

  it("bookmarks optimistically and calls the API once", async () => {
    getBookmarkStatus.mockResolvedValue({ is_bookmarked: false });
    bookmarkNovel.mockResolvedValue(undefined);
    render(<BookmarkButton novelRef="n1" />);

    await waitFor(() => expect(getBookmarkStatus).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button"));

    // Optimistic: the label flips before the request resolves, which is safe
    // because the API is idempotent (docs/09 §33).
    expect(screen.getByRole("button")).toHaveTextContent("บันทึกแล้ว");
    await waitFor(() => expect(bookmarkNovel).toHaveBeenCalledWith("n1"));
    expect(removeBookmark).not.toHaveBeenCalled();
  });

  it("removes an existing bookmark on toggle", async () => {
    getBookmarkStatus.mockResolvedValue({ is_bookmarked: true });
    removeBookmark.mockResolvedValue(undefined);
    render(<BookmarkButton novelRef="n1" />);

    await waitFor(() =>
      expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true"),
    );
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(removeBookmark).toHaveBeenCalledWith("n1"));
  });

  it("sends a guest to sign in with their intent preserved", async () => {
    getBookmarkStatus.mockRejectedValue(unauthorized());
    render(<BookmarkButton novelRef="n1" />);

    await waitFor(() => expect(getBookmarkStatus).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button"));

    // docs/02 §5.2: the original action is preserved through registration -
    // the sign-in link carries a return path, and no mutation was attempted.
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(String(push.mock.calls[0][0])).toContain("/login?next=");
    expect(bookmarkNovel).not.toHaveBeenCalled();
  });

  it("rolls the optimistic state back when the mutation fails", async () => {
    getBookmarkStatus.mockResolvedValue({ is_bookmarked: false });
    bookmarkNovel.mockRejectedValue(
      new ApiError(429, { code: "RATE_LIMITED", message: "Too many requests." }),
    );
    render(<BookmarkButton novelRef="n1" />);

    await waitFor(() => expect(getBookmarkStatus).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(bookmarkNovel).toHaveBeenCalled());
    // The claim is withdrawn: the UI must not say "saved" when nothing was.
    await waitFor(() =>
      expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false"),
    );
    expect(screen.getByRole("button")).toHaveTextContent("บันทึกเข้าคลัง");
  });
});
