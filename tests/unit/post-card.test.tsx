import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PostCard } from "@/components/community/post-card";
import { hidePost, setMutedWords } from "@/lib/community-prefs";
import type { CommunityPost } from "@/types/community";

/**
 * The feed card's presentation rules (docs/COMMUNITY-FEED.md, section A of
 * the redesign): one identity instead of two, visibility badged only when it
 * narrows, no zero-noise, repeat-walls collapsed, search hits marked.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function post(overrides: Partial<CommunityPost> = {}): CommunityPost {
  return {
    id: "post-a",
    content: "คืนนี้มีตอนใหม่นะคะ",
    visibility: "public",
    post_type: "discussion",
    edited: false,
    created_at: "2026-08-15T00:00:00Z",
    updated_at: "2026-08-15T00:00:00Z",
    author: { id: "u1", username: "nightowl_w", display_name: "นกฮูกยามดึก" },
    comment_count: 0,
    reaction_count: 0,
    is_owner: false,
    ...overrides,
  };
}

afterEach(() => {
  window.localStorage.clear();
});

describe("identity", () => {
  it("shows the pen name with the handle beneath, each once", () => {
    render(<PostCard post={post()} />);
    expect(screen.getByText("นกฮูกยามดึก")).toBeInTheDocument();
    expect(screen.getAllByText(/nightowl_w/)).toHaveLength(1);
  });

  it("shows the handle only once when no pen name is set", () => {
    render(<PostCard post={post({ author: { id: "u1", username: "nightowl_w" } })} />);
    expect(screen.getAllByText(/nightowl_w/)).toHaveLength(1);
  });
});

describe("badges", () => {
  it("says nothing about visibility on a public post", () => {
    render(<PostCard post={post()} />);
    expect(screen.queryByText("สาธารณะ")).not.toBeInTheDocument();
  });

  it("badges a followers-only post", () => {
    render(<PostCard post={post({ visibility: "followers" })} />);
    expect(screen.getByText("เฉพาะผู้ติดตาม")).toBeInTheDocument();
  });

  it("labels a declared post type, but not the default", () => {
    render(<PostCard post={post({ post_type: "beta_request" })} />);
    expect(screen.getByText("หาเบต้า/นักเขียนร่วม")).toBeInTheDocument();

    render(<PostCard post={post({ id: "post-b" })} />);
    expect(screen.queryByText("พูดคุย")).not.toBeInTheDocument();
  });
});

describe("counts", () => {
  it("hides zero counts and shows real ones", () => {
    const { container } = render(
      <PostCard post={post({ reaction_count: 0, comment_count: 7 })} />,
    );
    expect(container.querySelector("footer")).not.toHaveTextContent("0");
    expect(screen.getByText("7")).toBeInTheDocument();
  });
});

describe("hostile content", () => {
  it("collapses a repeated-character wall at render time", () => {
    render(<PostCard post={post({ content: "ก".repeat(500) })} />);
    expect(screen.getByText("ก".repeat(30))).toBeInTheDocument();
    expect(screen.queryByText("ก".repeat(31))).not.toBeInTheDocument();
  });
});

describe("search highlight", () => {
  it("marks the needle inside the content", () => {
    const { container } = render(
      <PostCard post={post({ content: "คืนนี้มีตอนใหม่" })} highlight="ตอนใหม่" />,
    );
    const mark = container.querySelector("mark");
    expect(mark).toHaveTextContent("ตอนใหม่");
  });
});

describe("device preferences", () => {
  it("collapses a post this device hid, and restores it", async () => {
    hidePost("post-a");
    render(<PostCard post={post()} />);
    await waitFor(() =>
      expect(screen.getByText("ซ่อนโพสต์นี้แล้ว")).toBeInTheDocument(),
    );

    screen.getByRole("button", { name: "แสดง" }).click();
    await waitFor(() =>
      expect(screen.getByText("คืนนี้มีตอนใหม่นะคะ")).toBeInTheDocument(),
    );
  });

  it("collapses a post that carries a muted word, naming the word", async () => {
    setMutedWords(["สปอยล์"]);
    render(<PostCard post={post({ content: "ระวังสปอยล์ตอนจบนะ" })} />);
    await waitFor(() =>
      expect(screen.getByText(/มีคำที่คุณปิดไว้/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/สปอยล์/)).toBeInTheDocument();
  });
});
