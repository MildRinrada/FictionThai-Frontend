import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { COVER_ASPECT } from "@/lib/cover";

/**
 * The fiction creation form
 * (docs/PHASE-13-CREATION-AND-CONTROL.md §13A, rebuilt in 13U).
 *
 * What matters here: the form forces only the one-click answers (rating,
 * format); the production items - cover and blurb - are visible but optional
 * slots that land on the SAME novel fields the pre-publish checklist reads
 * (13W), so nothing is collected twice; genres and tags stay with the
 * checklist; the form autosaves to the device and never claims authority the
 * API holds (docs/07 §5, docs/11 §43).
 */

const createNovel = vi.fn();
const createChapter = vi.fn();
const saveVariables = vi.fn();
const updateNovel = vi.fn();
const createTag = vi.fn();
const uploadMedia = vi.fn();
const replace = vi.fn();
const refresh = vi.fn();

vi.mock("@/lib/novels-client", () => ({
  createNovel: (...args: unknown[]) => createNovel(...args),
  createChapter: (...args: unknown[]) => createChapter(...args),
  saveVariables: (...args: unknown[]) => saveVariables(...args),
  updateNovel: (...args: unknown[]) => updateNovel(...args),
  listNovels: () => Promise.resolve({ items: [], meta: { total: 0 } }),
}));

vi.mock("@/lib/discovery-client", () => ({
  createTag: (...args: unknown[]) => createTag(...args),
}));

vi.mock("@/lib/media-client", () => ({
  uploadMedia: (...args: unknown[]) => uploadMedia(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

let CreateNovelForm: typeof import("@/features/novels/create-novel-form").CreateNovelForm;

beforeEach(async () => {
  // The form remembers this device (draft, last settings, template). Each test
  // starts with a blank device, or the previous test's autosave leaks in.
  window.localStorage.clear();
  ({ CreateNovelForm } = await import("@/features/novels/create-novel-form"));
  createChapter.mockResolvedValue({ slug: "chapter-1" });
});

afterEach(() => {
  createNovel.mockReset();
  createChapter.mockReset();
  saveVariables.mockReset();
  updateNovel.mockReset();
  createTag.mockReset();
  uploadMedia.mockReset();
  replace.mockReset();
  refresh.mockReset();
  window.localStorage.clear();
});

function fillTitle(title: string) {
  fireEvent.change(screen.getByLabelText(/ชื่อเรื่อง/), { target: { value: title } });
}

function choose(label: string | RegExp) {
  fireEvent.click(screen.getByLabelText(label));
}

/** One radio, addressed by the value it submits (labels carry hints too). */
function radio(group: string, value: string): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(
    `input[name="${group}"][value="${value}"]`,
  );
}

function chooseValue(group: string, value: string) {
  const input = radio(group, value);
  if (!input) throw new Error(`no ${group} radio with value ${value}`);
  fireEvent.click(input);
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: /สร้างผลงาน/ }));
}

/** Commits one fandom chip - the field adds on Enter (or blur). */
function addFandom(name: string) {
  const input = screen.getByLabelText(/เขียนจากเรื่องอะไร/);
  fireEvent.change(input, { target: { value: name } });
  fireEvent.keyDown(input, { key: "Enter" });
}

describe("what the create form asks", () => {
  it("asks the short set and sends the checklist the rest", () => {
    render(<CreateNovelForm />);

    expect(screen.getByLabelText(/ชื่อเรื่อง/)).toBeInTheDocument();
    expect(screen.getByText("โครงสร้าง")).toBeInTheDocument();
    expect(screen.getByText("รูปแบบหลักของเรื่อง")).toBeInTheDocument();
    // /เรตอายุ/ now appears twice: the question, and the "ยังขาด" line under
    // the disabled button that names it.
    expect(screen.getAllByText(/เรตอายุ/).length).toBeGreaterThan(0);
    expect(screen.getByText("ต้นฉบับ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /สร้างผลงาน/ })).toBeInTheDocument();

    // The identity block (13W-2): cover + title + blurb TOGETHER at the top -
    // the trio every card renders - with the cover optional, unduplicated
    // ("A5 · ไม่บังคับ" once, under the frame), and no required mark or red.
    // The frame itself is COVER_ASPECT, so what a writer sees here is the crop
    // every shelf card will show - not a 2:3 box that re-crops later.
    const coverSlot = screen.getByText("ปก").closest("button") as HTMLElement;
    expect(coverSlot.textContent).not.toContain("*");
    expect(coverSlot.className).toContain(COVER_ASPECT);
    expect(screen.getByText("A5 · ไม่บังคับ")).toBeInTheDocument();
    expect(screen.queryByText("อัปโหลดทีหลังได้")).not.toBeInTheDocument();
    const identity = screen
      .getByLabelText(/ชื่อเรื่อง/)
      .closest("div.flex") as HTMLElement;
    expect(identity.contains(coverSlot)).toBe(true);
    // TWO fields since the parity review: the card's one-line tagline and
    // the synopsis, both optional, both in the identity block - the old
    // combined field could not set a tagline at all.
    const blurb = screen.getByLabelText(/เรื่องย่อ/);
    expect(identity.contains(blurb)).toBe(true);
    expect(blurb).not.toBeRequired();
    const tagline = screen.getByLabelText(/คำโปรย/);
    expect(identity.contains(tagline)).toBe(true);
    expect(tagline).not.toBeRequired();

    // One counter, not a counter plus a "no more than 200" helper (13W-2).
    expect(screen.queryByText(/ไม่เกิน 200/)).not.toBeInTheDocument();

    // The required rating's placeholder chip warns softly instead of fading.
    expect(screen.getByText("ยังไม่เลือกเรต").className).toContain("text-warning");

    // Still owned by the checklist alone - not collected twice.
    expect(screen.queryByText(/หมวดหมู่และแท็ก/)).not.toBeInTheDocument();
    // ใครเห็นได้ left this form for the publish button (13V): a fiction is
    // born private, so the question is asked where it takes effect.
    expect(screen.queryByText("ใครเห็นได้เมื่อเผยแพร่")).not.toBeInTheDocument();
    // And the form says where everything went - BEFORE the button.
    expect(
      screen.getByText(/หมวดหมู่ แท็ก และการเผยแพร่อยู่ที่หน้าภาพรวม/),
    ).toBeInTheDocument();
  });

  it("counts the title's characters against its limit", () => {
    render(<CreateNovelForm />);
    fillTitle("สวัสดี");
    expect(screen.getByText("6/200")).toBeInTheDocument();
  });

  it("pre-selects no rating", () => {
    render(<CreateNovelForm />);
    for (const value of ["general", "teen", "mature", "explicit"]) {
      expect(radio("age_rating", value)).not.toBeChecked();
    }
  });

  it("uses ร้อยแก้ว, not ฟิค, as the prose format's name", () => {
    render(<CreateNovelForm />);
    // Twice: the format card and the preview strip that echoes the selection.
    expect(screen.getAllByText("ร้อยแก้ว").length).toBeGreaterThan(0);
    expect(screen.getByText("เฮดแคนอน")).toBeInTheDocument();
    expect(screen.queryByText("ฟิค")).not.toBeInTheDocument();
  });

  // 13U: the gate is asked for 15+ too, not only 18+.
  it("asks the gate for 15+ and 18+, and never before a rating", () => {
    render(<CreateNovelForm />);

    expect(screen.queryByText(/ผู้อ่านต้องผ่านอะไรก่อน/)).not.toBeInTheDocument();

    chooseValue("age_rating", "teen");
    expect(screen.getByText(/ผู้อ่านต้องผ่านอะไรก่อน/)).toBeInTheDocument();
    expect(radio("age_gate", "warning")).toBeInTheDocument();

    chooseValue("age_rating", "mature");
    expect(screen.getByText(/ผู้อ่านต้องผ่านอะไรก่อน/)).toBeInTheDocument();
  });

  it("never offers the warning gate for explicitly sexual work", () => {
    render(<CreateNovelForm />);

    chooseValue("age_rating", "explicit");
    expect(radio("age_gate", "warning")).not.toBeInTheDocument();
    expect(radio("age_gate", "login")).toBeChecked();
    expect(screen.getByText(/กฎของแพลตฟอร์ม/)).toBeInTheDocument();
  });

  // #7 - the warning is pickable data, not an empty textarea.
  it("offers warning chips plus the spoiler fold for rated work", () => {
    render(<CreateNovelForm />);

    expect(screen.queryByText("คำเตือนเนื้อหา")).not.toBeInTheDocument();
    chooseValue("age_rating", "teen");
    expect(screen.getByText("คำเตือนเนื้อหา")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ความรุนแรง" })).toBeInTheDocument();
    expect(screen.getByLabelText(/ซ่อนคำเตือนไว้ใต้ปุ่มกันสปอยล์/)).toBeInTheDocument();
  });

  // #3 (13V verification) - the variables editor is a real table: one tick
  // reveals preset chips and rows, seeded with (y/n).
  it("reveals the variable table when the switch is ticked", () => {
    render(<CreateNovelForm />);

    fireEvent.click(screen.getByRole("button", { name: /ตั้งค่าเพิ่มเติม/ }));
    expect(screen.queryByText("เพิ่มด่วน:")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/เรื่องนี้ให้ผู้อ่านกรอกชื่อ/));
    expect(screen.getByText("เพิ่มด่วน:")).toBeInTheDocument();
    // The commonest case is seeded: one tick, and y/n is already a row -
    // shown as the KEY; the stored token keeps its brackets.
    expect(screen.getByLabelText("ตัวแทนในเนื้อเรื่อง")).toHaveValue("y/n");
    expect(screen.getByRole("button", { name: "เพิ่มตัวแปรเอง" })).toBeInTheDocument();
  });

  // #7/#12 (13V) - the advanced section is four named groups, and the review
  // switch folds away entirely when the thread is closed.
  it("groups the advanced section and hides ตรวจก่อนโพสต์ for a closed thread", () => {
    render(<CreateNovelForm />);
    fireEvent.click(screen.getByRole("button", { name: /ตั้งค่าเพิ่มเติม/ }));

    for (const heading of ["การตีพิมพ์", "ผู้อ่านและคอมเมนต์", "การแสดงผล", "สิทธิ์"]) {
      expect(screen.getByText(heading)).toBeInTheDocument();
    }

    expect(screen.getByLabelText(/ตรวจก่อนโพสต์/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("ใครคอมเมนต์ได้"), {
      target: { value: "off" },
    });
    expect(screen.queryByLabelText(/ตรวจก่อนโพสต์/)).not.toBeInTheDocument();
  });

  // #9 (13V) - money is opt-in, and dead until there is a link to show.
  it("keeps the donate switch off and disabled without a payment link", () => {
    render(<CreateNovelForm hasDonationLink={false} />);
    fireEvent.click(screen.getByRole("button", { name: /ตั้งค่าเพิ่มเติม/ }));

    const donate = screen.getByLabelText(/แสดงปุ่มสนับสนุนนักเขียน/);
    expect(donate).toBeDisabled();
    expect(donate).not.toBeChecked();
    expect(screen.getByText(/ตั้งค่าช่องทางรับเงิน/)).toBeInTheDocument();
  });
});

describe("what the create form submits", () => {
  it("sends the writer's choices and never a visibility of its own", async () => {
    createNovel.mockResolvedValue({ id: "novel-1", slug: "novel-1" });
    render(<CreateNovelForm />);

    fillTitle("นิยายเรื่องแรก");
    choose(/ทั่วไป/);
    submit();

    await waitFor(() => expect(createNovel).toHaveBeenCalled());
    const sent = createNovel.mock.calls[0][0];
    expect(sent).toMatchObject({
      title: "นิยายเรื่องแรก",
      story_structure: "multi_chapter",
      presentation_format: "standard",
      content_mode: "general",
      age_rating: "general",
      origin_type: "original",
    });
    // Every fiction is born a private draft (docs/11 §31): the ladder records
    // INTENT, the request carries no visibility or status.
    expect(sent).not.toHaveProperty("visibility");
    expect(sent).not.toHaveProperty("status");
  });

  it("joins the warning chips into content_warning with the spoiler flag", async () => {
    createNovel.mockResolvedValue({ id: "novel-3", slug: "novel-3" });
    render(<CreateNovelForm />);

    fillTitle("เรื่องหนัก");
    chooseValue("age_rating", "mature");
    fireEvent.click(screen.getByRole("button", { name: "ความรุนแรง" }));
    fireEvent.click(screen.getByRole("button", { name: "คำหยาบ" }));
    fireEvent.click(screen.getByLabelText(/ซ่อนคำเตือนไว้ใต้ปุ่มกันสปอยล์/));
    submit();

    await waitFor(() => expect(createNovel).toHaveBeenCalled());
    const sent = createNovel.mock.calls[0][0];
    expect(sent.content_warning).toBe("ความรุนแรง · คำหยาบ");
    expect(sent.content_warning_spoiler).toBe(true);
  });

  it("sends the typed blurb as the description the checklist reads (13W)", async () => {
    createNovel.mockResolvedValue({ id: "novel-blurb", slug: "novel-blurb" });
    render(<CreateNovelForm />);

    fillTitle("มีคำโปรยแล้ว");
    choose(/ทั่วไป/);
    fireEvent.change(screen.getByLabelText(/เรื่องย่อ/), {
      target: { value: "  เรื่องของคนสองคนในเมืองเดียวกัน  " },
    });
    fireEvent.change(screen.getByLabelText(/คำโปรย/), {
      target: { value: "  หนึ่งบรรทัดใต้ปก  " },
    });
    submit();

    await waitFor(() => expect(createNovel).toHaveBeenCalled());
    expect(createNovel.mock.calls[0][0].description).toBe(
      "เรื่องของคนสองคนในเมืองเดียวกัน",
    );
    // The tagline rides the same request - settable at creation at last.
    expect(createNovel.mock.calls[0][0].tagline).toBe("หนึ่งบรรทัดใต้ปก");
  });

  it("holds the chosen cover locally, then uploads it against the new fiction (13W)", async () => {
    createNovel.mockResolvedValue({ id: "novel-cover", slug: "novel-cover" });
    uploadMedia.mockResolvedValue({ url: "https://cdn.example/media/novel_cover/a.png" });
    render(<CreateNovelForm />);

    fillTitle("มีปกแล้ว");
    choose(/ทั่วไป/);
    const file = new File(["png"], "ปกของฉัน.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("เลือกไฟล์ปก"), {
      target: { files: [file] },
    });
    // Held locally: no fiction exists yet, so nothing may upload on pick. The
    // slot previews the pick - the image when object URLs exist, else the name.
    expect(uploadMedia).not.toHaveBeenCalled();
    const slotPreview = screen.queryByAltText("ตัวอย่างปก");
    expect(slotPreview ?? screen.getByText("ปกของฉัน.png")).toBeInTheDocument();
    // And the chosen cover joins the reader-preview strip (13W-2).
    if (slotPreview) {
      expect(screen.getByAltText("ปกที่เลือกไว้")).toBeInTheDocument();
    }

    submit();
    // The novel_cover purpose attaches the file to the new fiction - the very
    // cover_url the checklist's ปกเรื่อง row reads, so it ticks by itself.
    await waitFor(() =>
      expect(uploadMedia).toHaveBeenCalledWith({
        file,
        purpose: "novel_cover",
        novel: "novel-cover",
      }),
    );
  });

  it("lets the writer take the chosen cover back out before submitting", () => {
    render(<CreateNovelForm />);
    const file = new File(["png"], "ปกชั่วคราว.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("เลือกไฟล์ปก"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "เอาออก" }));
    expect(screen.queryByText("ปกชั่วคราว.png")).not.toBeInTheDocument();
    expect(screen.queryByAltText("ตัวอย่างปก")).not.toBeInTheDocument();
    expect(uploadMedia).not.toHaveBeenCalled();
  });

  it("sends headcanon as both a presentation and a classification", async () => {
    createNovel.mockResolvedValue({ id: "novel-hc", slug: "novel-hc" });
    render(<CreateNovelForm />);

    fillTitle("เฮดแคนอนล้วน");
    choose(/ทั่วไป/);
    chooseValue("work_format", "headcanon");
    submit();

    await waitFor(() => expect(createNovel).toHaveBeenCalled());
    const sent = createNovel.mock.calls[0][0];
    expect(sent.presentation_format).toBe("headcanon");
    expect(sent.content_mode).toBe("headcanon");
  });

  // Create review 2026-08 item 6: an enabled button over a form the server
  // will refuse is a trap sprung at the end. The button waits, and SAYS what
  // it is waiting for; the server stays the authority behind it.
  it("disables สร้างผลงาน until the required answers exist, and names them", () => {
    render(<CreateNovelForm />);

    expect(screen.getByRole("button", { name: /สร้างผลงาน/ })).toBeDisabled();
    expect(screen.getByText(/ยังขาด: ชื่อเรื่อง · เรตอายุ/)).toBeInTheDocument();

    fillTitle("ยังไม่เลือกเรต");
    expect(screen.getByRole("button", { name: /สร้างผลงาน/ })).toBeDisabled();
    expect(screen.getByText(/ยังขาด: เรตอายุ/)).toBeInTheDocument();

    choose(/ทั่วไป/);
    expect(screen.getByRole("button", { name: /สร้างผลงาน/ })).toBeEnabled();
    expect(screen.queryByText(/ยังขาด:/)).not.toBeInTheDocument();
  });

  it("requires the source work before a fanfiction can be created", () => {
    render(<CreateNovelForm />);

    fillTitle("ฟิคไม่มีต้นทาง");
    choose(/ทั่วไป/);
    choose(/แฟนฟิค/);
    expect(screen.getByRole("button", { name: /สร้างผลงาน/ })).toBeDisabled();
    expect(screen.getByText(/ยังขาด: เรื่องต้นทาง/)).toBeInTheDocument();

    addFandom("Genshin Impact");
    expect(screen.getByRole("button", { name: /สร้างผลงาน/ })).toBeEnabled();
  });

  // Crossover (create review 2026-08): more names in the SAME field, and the
  // label is earned at two - the ผสมรูปแบบ principle, never a checkbox.
  it("labels a crossover by itself at two fandoms, and stops at three", () => {
    render(<CreateNovelForm />);

    fillTitle("ฟิคข้ามด้อม");
    choose(/ทั่วไป/);
    choose(/แฟนฟิค/);

    addFandom("Genshin Impact");
    expect(screen.queryByText("Crossover")).not.toBeInTheDocument();

    addFandom("Honkai: Star Rail");
    // Twice: the chip row's own label, and the reader-preview strip's badge.
    expect(screen.getAllByText("Crossover").length).toBe(2);

    addFandom("แฮร์รี่ พอตเตอร์");
    addFandom("เรื่องที่สี่");
    expect(screen.getByText(/ไม่เกิน 3 เรื่อง/)).toBeInTheDocument();
    expect(screen.queryByText("เรื่องที่สี่")).not.toBeInTheDocument();
  });
});

describe("the source of a fanfiction", () => {
  it("opens the source and ship questions only for แฟนฟิค", () => {
    render(<CreateNovelForm />);

    expect(screen.queryByLabelText(/เขียนจากเรื่องอะไร/)).not.toBeInTheDocument();
    choose(/แฟนฟิค/);
    expect(screen.getByLabelText(/เขียนจากเรื่องอะไร/)).toBeInTheDocument();
    expect(screen.getByLabelText(/ตัวละคร \/ คู่ชิป/)).toBeInTheDocument();
  });

  it("turns ships into tags once the fiction exists", async () => {
    createNovel.mockResolvedValue({ id: "novel-4", slug: "novel-4" });
    createTag.mockImplementation((name: string) =>
      Promise.resolve({ id: `tag-${name}`, name, slug: name }),
    );
    updateNovel.mockResolvedValue({});
    render(<CreateNovelForm />);

    fillTitle("ฟิคคู่ชิป");
    choose(/ทั่วไป/);
    choose(/แฟนฟิค/);
    // The source is REQUIRED for a fanfiction - the button waits for it.
    addFandom("ออฟฟิศของเรา");
    const shipField = screen.getByLabelText(/ตัวละคร \/ คู่ชิป/);
    fireEvent.change(shipField, { target: { value: "Zhongli×Reader" } });
    fireEvent.keyDown(shipField, { key: "Enter" });
    submit();

    await waitFor(() => expect(updateNovel).toHaveBeenCalled());
    expect(createTag).toHaveBeenCalledWith("Zhongli×Reader");
    expect(updateNovel).toHaveBeenCalledWith("novel-4", {
      tag_ids: ["tag-Zhongli×Reader"],
    });
  });

  it("omits the source when the writer switches back to original", async () => {
    createNovel.mockResolvedValue({ id: "novel-5", slug: "novel-5" });
    render(<CreateNovelForm />);

    fillTitle("กลับไปแต่งเอง");
    choose(/ทั่วไป/);
    choose(/แฟนฟิค/);
    addFandom("ต้นฉบับเดิม");
    choose(/แต่งเอง/);
    submit();

    await waitFor(() => expect(createNovel).toHaveBeenCalled());
    const sent = createNovel.mock.calls[0][0];
    expect(sent.origin_type).toBe("original");
    expect(sent).not.toHaveProperty("fandom");
  });
});

describe("the device-local draft (13U)", () => {
  it("autosaves the form and restores it on the next visit", async () => {
    vi.useFakeTimers();
    try {
      const first = render(<CreateNovelForm />);
      fillTitle("เรื่องที่พิมพ์ค้างไว้");
      vi.advanceTimersByTime(1000);
      first.unmount();

      render(<CreateNovelForm />);
      expect(screen.getByLabelText(/ชื่อเรื่อง/)).toHaveValue("เรื่องที่พิมพ์ค้างไว้");
      expect(screen.getByText(/กู้คืนสิ่งที่พิมพ์ค้างไว้/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("writes no draft from merely opening the page", () => {
    // The phantom-draft bug (review 2026-08): the mount state autosaved
    // itself, so visiting once meant the NEXT visit announced a restore over
    // a completely blank form.
    vi.useFakeTimers();
    try {
      const visit = render(<CreateNovelForm />);
      vi.advanceTimersByTime(2000);
      visit.unmount();
      expect(window.localStorage.getItem("ft:create-draft:v1")).toBeNull();

      render(<CreateNovelForm />);
      expect(screen.queryByText(/กู้คืน/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not announce a restore when the stored draft holds nothing", () => {
    // A phantom left behind by the pre-fix code: present, but identical to an
    // untouched form. Restoring it is a no-op, so saying "restored" is a lie.
    window.localStorage.setItem(
      "ft:create-draft:v1",
      JSON.stringify({ savedAt: new Date().toISOString(), state: {} }),
    );
    render(<CreateNovelForm />);
    expect(screen.queryByText(/กู้คืน/)).not.toBeInTheDocument();
  });

  it("dismisses the banner together with the draft it announced", () => {
    window.localStorage.setItem(
      "ft:create-draft:v1",
      JSON.stringify({
        savedAt: new Date().toISOString(),
        state: { title: "เรื่องที่ไม่เอาแล้ว" },
      }),
    );
    render(<CreateNovelForm />);
    expect(screen.getByText(/กู้คืนสิ่งที่พิมพ์ค้างไว้/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /เริ่มฟอร์มเปล่า/ }));
    expect(screen.queryByText(/กู้คืน/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/ชื่อเรื่อง/)).toHaveValue("");
    expect(window.localStorage.getItem("ft:create-draft:v1")).toBeNull();
  });

  it("clears the draft after a successful create", async () => {
    createNovel.mockResolvedValue({ id: "novel-6", slug: "novel-6" });
    render(<CreateNovelForm />);

    fillTitle("สร้างสำเร็จ");
    choose(/ทั่วไป/);
    submit();

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(window.localStorage.getItem("ft:create-draft:v1")).toBeNull();
  });
});

describe("after a successful create", () => {
  it("opens the first chapter rather than an overview", async () => {
    createNovel.mockResolvedValue({ id: "novel-9", slug: "novel-9" });
    render(<CreateNovelForm />);

    fillTitle("เรื่องใหม่");
    choose(/ทั่วไป/);
    submit();

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        "/studio/novels/novel-9/chapters/chapter-1",
      ),
    );
    expect(refresh).toHaveBeenCalled();
    expect(createChapter).toHaveBeenCalledWith("novel-9", { status: "draft" });
  });

  it("still lands in the studio when the chapter call fails", async () => {
    createNovel.mockResolvedValue({ id: "novel-10", slug: "novel-10" });
    createChapter.mockRejectedValue(
      new ApiError(503, {
        code: "SERVICE_UNAVAILABLE",
        message: "Could not reach the API.",
      }),
    );
    render(<CreateNovelForm />);

    fillTitle("เรื่องที่ตอนแรกยังไม่เกิด");
    choose(/ทั่วไป/);
    submit();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/studio/novels/novel-10"));
    expect(refresh).toHaveBeenCalled();
  });
});
