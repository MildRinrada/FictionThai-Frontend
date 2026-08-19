import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import type { CommunityComment } from "@/types/community";

/**
 * The community post thread. Same guarantees as the fiction thread - its own
 * island over its own client, so this suite proves the SEPARATE contract:
 * guests read, a 401 becomes a sign-in offer in place, posting appears
 * without a reload, replies load on demand.
 */

const getCommunityComments = vi.fn();
const getCommunityReplies = vi.fn();
const createCommunityComment = vi.fn();
const replyToCommunityComment = vi.fn();
const updateCommunityComment = vi.fn();
const deleteCommunityComment = vi.fn();

vi.mock("@/lib/community-client", () => ({
  getCommunityComments: (...args: unknown[]) => getCommunityComments(...args),
  getCommunityReplies: (...args: unknown[]) => getCommunityReplies(...args),
  createCommunityComment: (...args: unknown[]) => createCommunityComment(...args),
  replyToCommunityComment: (...args: unknown[]) => replyToCommunityComment(...args),
  updateCommunityComment: (...args: unknown[]) => updateCommunityComment(...args),
  deleteCommunityComment: (...args: unknown[]) => deleteCommunityComment(...args),
}));

// Comment rows embed the report control (Phase 8), which uses the router.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

let CommunityComments: typeof import("@/features/community/community-comments").CommunityComments;

beforeEach(async () => {
  ({ CommunityComments } = await import("@/features/community/community-comments"));
});

afterEach(() => {
  for (const mock of [
    getCommunityComments, getCommunityReplies, createCommunityComment,
    replyToCommunityComment, updateCommunityComment, deleteCommunityComment,
  ]) {
    mock.mockReset();
  }
});

function comment(overrides: Partial<CommunityComment> = {}): CommunityComment {
  return {
    id: "c1",
    post_id: "p1",
    content: "ลองโทนพาสเทลไหมคะ",
    edited: false,
    created_at: "2026-08-10T09:00:00Z",
    updated_at: "2026-08-10T09:00:00Z",
    author: { id: "u1", username: "reader01", display_name: "นักอ่าน" },
    reply_count: 0,
    is_owner: false,
    ...overrides,
  };
}

function pageOf(items: CommunityComment[], total = items.length) {
  return { items, meta: { page: 1, per_page: 20, total } };
}

describe("CommunityComments", () => {
  it("renders the thread with Thai text intact", async () => {
    getCommunityComments.mockResolvedValue(pageOf([comment()]));

    render(<CommunityComments postId="p1" />);

    expect(await screen.findByText("ลองโทนพาสเทลไหมคะ")).toBeInTheDocument();
    expect(getCommunityComments).toHaveBeenCalledWith("p1", { page: 1 });
  });

  it("posts a comment and shows it without a reload", async () => {
    getCommunityComments.mockResolvedValue(pageOf([]));
    createCommunityComment.mockResolvedValue(
      comment({ content: "ยินดีด้วยค่ะ", is_owner: true }),
    );

    render(<CommunityComments postId="p1" />);
    await screen.findByText(/ยังไม่มีความคิดเห็น/);

    fireEvent.change(screen.getByLabelText(/ร่วมพูดคุยในโพสต์นี้/), {
      target: { value: "ยินดีด้วยค่ะ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ส่งความคิดเห็น" }));

    expect(await screen.findByText("ยินดีด้วยค่ะ")).toBeInTheDocument();
    expect(createCommunityComment).toHaveBeenCalledWith("p1", "ยินดีด้วยค่ะ");
  });

  it("turns a 401 into a sign-in offer in place", async () => {
    getCommunityComments.mockResolvedValue(pageOf([]));
    createCommunityComment.mockRejectedValue(
      new ApiError(401, { code: "UNAUTHORIZED", message: "Authentication required." }),
    );

    render(<CommunityComments postId="p1" />);
    await screen.findByText(/ยังไม่มีความคิดเห็น/);

    fireEvent.change(screen.getByLabelText(/ร่วมพูดคุยในโพสต์นี้/), {
      target: { value: "อยากคุยด้วย" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ส่งความคิดเห็น" }));

    const signIn = await screen.findByRole("link", { name: "เข้าสู่ระบบ" });
    expect(signIn.getAttribute("href")).toContain("/login?next=");
  });

  it("loads replies on demand and gates owner actions", async () => {
    getCommunityComments.mockResolvedValue(
      pageOf([
        comment({ reply_count: 1 }),
        comment({ id: "c2", content: "ของฉันเอง", is_owner: true }),
      ]),
    );
    getCommunityReplies.mockResolvedValue(
      pageOf([comment({ id: "r1", parent_id: "c1", content: "เห็นด้วยค่ะ" })]),
    );

    render(<CommunityComments postId="p1" />);
    await screen.findByText("ลองโทนพาสเทลไหมคะ");

    expect(screen.getAllByRole("button", { name: "แก้ไข" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "ลบ" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "ดูการตอบกลับ (1)" }));
    expect(await screen.findByText("เห็นด้วยค่ะ")).toBeInTheDocument();
    expect(getCommunityReplies).toHaveBeenCalledWith("c1");
  });

  it("shows the error state when the thread cannot load", async () => {
    getCommunityComments.mockRejectedValue(new Error("network down"));

    render(<CommunityComments postId="p1" />);

    expect(
      await screen.findByText(/ไม่สามารถโหลดความคิดเห็นได้/),
    ).toBeInTheDocument();
  });
});
