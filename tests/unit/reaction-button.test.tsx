import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";

/**
 * The like toggle. What matters: optimistic toggling reconciles with the
 * API's count, a failed mutation rolls back, and a guest's click routes to
 * sign-in with intent preserved (docs/02 §5.2).
 */

const reactToPost = vi.fn();
const removeReaction = vi.fn();
const getCommunityPost = vi.fn();
const push = vi.fn();

vi.mock("@/lib/community-client", () => ({
  reactToPost: (...args: unknown[]) => reactToPost(...args),
  removeReaction: (...args: unknown[]) => removeReaction(...args),
  getCommunityPost: (...args: unknown[]) => getCommunityPost(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

let ReactionButton: typeof import("@/features/community/reaction-button").ReactionButton;

beforeEach(async () => {
  ({ ReactionButton } = await import("@/features/community/reaction-button"));
});

afterEach(() => {
  for (const mock of [reactToPost, removeReaction, getCommunityPost, push]) {
    mock.mockReset();
  }
  document.cookie = "ft_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

describe("ReactionButton", () => {
  it("renders the server-provided state for a guest without extra fetches", () => {
    render(<ReactionButton postId="p1" initialCount={3} />);

    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveTextContent("ถูกใจ 3");
    expect(getCommunityPost).not.toHaveBeenCalled();
  });

  it("re-syncs the caller's own state when a session hint exists", async () => {
    document.cookie = "ft_csrf=session";
    getCommunityPost.mockResolvedValue({
      id: "p1", my_reaction: "like", reaction_count: 5,
    });

    render(<ReactionButton postId="p1" initialCount={3} />);

    await waitFor(() =>
      expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true"),
    );
    expect(screen.getByRole("button")).toHaveTextContent("ถูกใจ 5");
  });

  it("toggles optimistically and reconciles with the API count", async () => {
    reactToPost.mockResolvedValue({ post_id: "p1", my_reaction: "like", reaction_count: 4 });

    render(<ReactionButton postId="p1" initialCount={3} />);
    fireEvent.click(screen.getByRole("button"));

    // Optimistic first…
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
    // …then the server's number wins.
    await waitFor(() =>
      expect(screen.getByRole("button")).toHaveTextContent("ถูกใจ 4"),
    );
    expect(reactToPost).toHaveBeenCalledWith("p1");
  });

  it("rolls back and offers sign-in when the API says 401", async () => {
    reactToPost.mockRejectedValue(
      new ApiError(401, { code: "UNAUTHORIZED", message: "Authentication required." }),
    );

    render(<ReactionButton postId="p1" initialCount={0} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(String(push.mock.calls[0][0])).toContain("/login?next=");
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button")).toHaveTextContent("ถูกใจ");
  });

  it("removes a reaction idempotently", async () => {
    removeReaction.mockResolvedValue(undefined);

    render(<ReactionButton postId="p1" initialCount={2} initialMyReaction="like" />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(removeReaction).toHaveBeenCalledWith("p1"));
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button")).toHaveTextContent("ถูกใจ 1");
  });
});
