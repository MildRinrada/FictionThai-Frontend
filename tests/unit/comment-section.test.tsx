import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import type { Comment } from "@/types/comments";

/**
 * The discussion thread island.
 *
 * What matters: guests can READ the thread, a guest's attempt to write turns
 * into a sign-in offer rather than an error (docs/02 §5.2), a successful post
 * appears without a reload, and comment text renders as text - Thai content
 * comes back character-for-character.
 */

const getNovelComments = vi.fn();
const getChapterComments = vi.fn();
const getReplies = vi.fn();
const createNovelComment = vi.fn();
const createChapterComment = vi.fn();
const replyToComment = vi.fn();
const updateComment = vi.fn();
const deleteComment = vi.fn();

vi.mock("@/lib/comments-client", () => ({
  getNovelComments: (...args: unknown[]) => getNovelComments(...args),
  getChapterComments: (...args: unknown[]) => getChapterComments(...args),
  getReplies: (...args: unknown[]) => getReplies(...args),
  createNovelComment: (...args: unknown[]) => createNovelComment(...args),
  createChapterComment: (...args: unknown[]) => createChapterComment(...args),
  replyToComment: (...args: unknown[]) => replyToComment(...args),
  updateComment: (...args: unknown[]) => updateComment(...args),
  deleteComment: (...args: unknown[]) => deleteComment(...args),
  likeComment: vi.fn().mockResolvedValue({ like_count: 1, is_liked: true }),
  unlikeComment: vi.fn().mockResolvedValue(undefined),
}));

// Comment rows embed the report control (Phase 8), which uses the router.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

let CommentSection: typeof import("@/features/comments/comment-section").CommentSection;

beforeEach(async () => {
  ({ CommentSection } = await import("@/features/comments/comment-section"));
});

afterEach(() => {
  for (const mock of [
    getNovelComments, getChapterComments, getReplies,
    createNovelComment, createChapterComment, replyToComment,
    updateComment, deleteComment,
  ]) {
    mock.mockReset();
  }
});

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: "c1",
    novel_id: "n1",
    content: "สนุกมากเลยค่ะ",
    edited: false,
    created_at: "2026-08-10T09:00:00Z",
    updated_at: "2026-08-10T09:00:00Z",
    author: { id: "u1", username: "reader01", display_name: "นักอ่าน" },
    reply_count: 0,
    like_count: 0,
    is_owner: false,
    ...overrides,
  };
}

function pageOf(items: Comment[], total = items.length) {
  return { items, meta: { page: 1, per_page: 20, total } };
}

describe("CommentSection", () => {
  it("renders the fiction thread for guests, Thai text intact", async () => {
    getNovelComments.mockResolvedValue(pageOf([comment()]));

    render(<CommentSection novelRef="novel-1" />);

    expect(await screen.findByText("สนุกมากเลยค่ะ")).toBeInTheDocument();
    expect(screen.getByText("นักอ่าน")).toBeInTheDocument();
    expect(getNovelComments).toHaveBeenCalledWith("novel-1", { page: 1 });
    expect(getChapterComments).not.toHaveBeenCalled();
  });

  it("scopes to the chapter thread when a chapterRef is given", async () => {
    getChapterComments.mockResolvedValue(pageOf([]));

    render(<CommentSection novelRef="novel-1" chapterRef="ตอนที่หนึ่ง" />);

    await waitFor(() =>
      expect(getChapterComments).toHaveBeenCalledWith("novel-1", "ตอนที่หนึ่ง", { page: 1 }),
    );
    expect(await screen.findByText(/ยังไม่มีความคิดเห็น/)).toBeInTheDocument();
  });

  it("posts a comment and shows it without a reload", async () => {
    getNovelComments.mockResolvedValue(pageOf([]));
    createNovelComment.mockResolvedValue(comment({ content: "รอติดตามตอนต่อไป", is_owner: true }));

    render(<CommentSection novelRef="novel-1" />);
    await screen.findByText(/ยังไม่มีความคิดเห็น/);

    fireEvent.change(screen.getByLabelText(/เขียนถึงเรื่องนี้/), {
      target: { value: "รอติดตามตอนต่อไป" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ส่งความคิดเห็น" }));

    expect(await screen.findByText("รอติดตามตอนต่อไป")).toBeInTheDocument();
    // The third argument is the guest name, undefined for a signed-in reader
    // (§13D). It is always sent so one form serves both.
    expect(createNovelComment).toHaveBeenCalledWith(
      "novel-1",
      "รอติดตามตอนต่อไป",
      undefined,
    );
  });

  it("turns a 401 into a sign-in offer, preserving intent", async () => {
    getNovelComments.mockResolvedValue(pageOf([]));
    createNovelComment.mockRejectedValue(
      new ApiError(401, { code: "UNAUTHORIZED", message: "Authentication required." }),
    );

    render(<CommentSection novelRef="novel-1" />);
    await screen.findByText(/ยังไม่มีความคิดเห็น/);

    fireEvent.change(screen.getByLabelText(/เขียนถึงเรื่องนี้/), {
      target: { value: "อยากคอมเมนต์" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ส่งความคิดเห็น" }));

    const signIn = await screen.findByRole("link", { name: "เข้าสู่ระบบ" });
    expect(signIn.getAttribute("href")).toContain("/login?next=");
  });

  it("surfaces the API's field error on invalid content", async () => {
    getNovelComments.mockResolvedValue(pageOf([]));
    createNovelComment.mockRejectedValue(
      new ApiError(422, {
        code: "VALIDATION_ERROR",
        message: "Validation failed.",
        fields: { content: ["A comment cannot be empty."] },
      }),
    );

    render(<CommentSection novelRef="novel-1" />);
    await screen.findByText(/ยังไม่มีความคิดเห็น/);

    fireEvent.change(screen.getByLabelText(/เขียนถึงเรื่องนี้/), {
      target: { value: "x" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ส่งความคิดเห็น" }));

    expect(await screen.findByText("A comment cannot be empty.")).toBeInTheDocument();
  });

  it("loads replies on demand and offers owner actions only on own comments", async () => {
    getNovelComments.mockResolvedValue(
      pageOf([comment({ reply_count: 1 }), comment({ id: "c2", content: "ของฉันเอง", is_owner: true })]),
    );
    getReplies.mockResolvedValue(
      pageOf([comment({ id: "r1", parent_id: "c1", content: "เห็นด้วยค่ะ" })]),
    );

    render(<CommentSection novelRef="novel-1" />);
    await screen.findByText("สนุกมากเลยค่ะ");

    // Owner affordances appear exactly once - on the caller's own comment.
    expect(screen.getAllByRole("button", { name: "แก้ไข" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "ลบ" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "ดูการตอบกลับ (1)" }));
    expect(await screen.findByText("เห็นด้วยค่ะ")).toBeInTheDocument();
    expect(getReplies).toHaveBeenCalledWith("c1");
  });
});

// §13D - the level this platform exists for. A reader with no account says
// something, and it waits for the author rather than appearing unreviewed.
describe("CommentSection on the ทุกคน level", () => {
  it("asks a guest for a name and says the comment will wait", async () => {
    getNovelComments.mockResolvedValue(pageOf([]));

    render(<CommentSection novelRef="novel-1" access="everyone" />);

    expect(
      await screen.findByLabelText(/ชื่อที่อยากให้แสดง/),
    ).toBeInTheDocument();
    expect(screen.getByText(/จะรอผู้เขียนตรวจก่อนเสมอ/)).toBeInTheDocument();
  });

  it("does not add a held comment to the thread", async () => {
    getNovelComments.mockResolvedValue(pageOf([]));
    createNovelComment.mockResolvedValue(
      comment({ content: "ชอบมากค่ะ", pending: true, author: undefined, guest_name: "คนอ่าน" }),
    );

    render(<CommentSection novelRef="novel-1" access="everyone" />);
    await screen.findByLabelText(/ชื่อที่อยากให้แสดง/);

    fireEvent.change(screen.getByLabelText(/ชื่อที่อยากให้แสดง/), {
      target: { value: "คนอ่าน" },
    });
    fireEvent.change(screen.getByLabelText(/เขียนถึงเรื่องนี้/), {
      target: { value: "ชอบมากค่ะ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ส่งความคิดเห็น" }));

    await waitFor(() => expect(createNovelComment).toHaveBeenCalled());
    expect(await screen.findByText(/ส่งแล้ว/)).toBeInTheDocument();
    // It is not in the thread, because it is not in the thread yet - showing it
    // there would be a lie the next page load undoes.
    expect(screen.queryByText("ชอบมากค่ะ")).not.toBeInTheDocument();
  });

  it("offers no form at all when the author closed the thread", async () => {
    getNovelComments.mockResolvedValue(pageOf([]));

    render(<CommentSection novelRef="novel-1" access="off" />);

    expect(await screen.findByText(/ผู้เขียนปิดการคอมเมนต์/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ส่งความคิดเห็น" })).not.toBeInTheDocument();
  });
});

