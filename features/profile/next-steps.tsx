"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { count } from "@/lib/format";
import { getMyAchievements } from "@/lib/achievements-client";
import type { PublicProfile } from "@/types/profile";

/**
 * The owner's onboarding, shrunk to ONE line (profile review 2026-08,
 * section B): "โปรไฟล์ยังไม่ครบ X/N · ดูสิ่งที่ทำได้" - it expands on press,
 * closes for good on ปิดถาวร, and never eats the page the way the old card
 * did. Owner-only by mounting: `/profile` renders it, the public page never
 * does.
 *
 * Every item is something the owner can DO right now with a button that goes
 * there - nothing that depends on other people ("มีคนอ่านจริง ๆ" is gone for
 * exactly that reason).
 */

const DISMISS_KEY = "ft:profile:next-steps-dismissed";

interface Step {
  key: string;
  title: string;
  done: boolean;
  href: string;
  label: string;
}

export function NextSteps({ profile }: { profile: PublicProfile }) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [achieved, setAchieved] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
    const frame = requestAnimationFrame(() => setVisible(true));
    getMyAchievements()
      .then((view) => {
        const map: Record<string, boolean> = {};
        for (const item of view.achievements) map[item.key] = item.unlocked;
        setAchieved(map);
      })
      .catch(() => {});
    return () => cancelAnimationFrame(frame);
  }, []);

  const steps: Step[] = [
    {
      key: "bio",
      title: "เขียนแนะนำตัว",
      done: Boolean(profile.author_bio ?? profile.bio),
      href: "#intro",
      label: "เขียนตรงนี้",
    },
    {
      key: "avatar",
      title: "ใส่รูปโปรไฟล์",
      done: Boolean(profile.avatar_url),
      // The avatar itself is the uploader - point at it, press the camera
      // (owner's standing rule: never a settings page for pictures).
      href: "#avatar",
      label: "อัปโหลด",
    },
    {
      key: "links",
      title: "เพิ่มลิงก์โซเชียล",
      done: (profile.links ?? []).length > 0 || Boolean(profile.website_url),
      href: "#intro",
      label: "เพิ่มลิงก์",
    },
    {
      key: "first_chapter",
      title: "เผยแพร่ตอนแรก",
      done: achieved["first_chapter"] ?? profile.novel_count > 0,
      href: "/studio/novels/new",
      label: "เริ่มเขียน",
    },
    {
      key: "completed",
      title: "ปิดจบเรื่องแรก",
      done: achieved["completed"] ?? false,
      href: "/studio",
      label: "ไปที่สตูดิโอ",
    },
  ];

  const doneCount = steps.filter((step) => step.done).length;
  if (!visible || doneCount === steps.length) return null;

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  return (
    <section className="rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-2 px-3.5 py-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="flex min-h-8 flex-1 items-center gap-2 text-start text-[13px]"
        >
          <Icon
            name={open ? "chevron-down" : "chevron-right"}
            size={14}
            className="shrink-0 text-text-muted"
          />
          <span>
            โปรไฟล์ยังไม่ครบ{" "}
            <span className="font-medium tabular-nums">
              {count(doneCount)}/{count(steps.length)}
            </span>
          </span>
          <span className="text-text-secondary">· ดูสิ่งที่ทำได้</span>
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 text-[11px] text-text-muted hover:text-text"
        >
          ปิดถาวร
        </button>
      </div>

      {open ? (
        <ul className="flex flex-col gap-1.5 border-t border-hairline px-3.5 py-2.5">
          {steps.map((step) => (
            <li key={step.key} className="flex items-center gap-2 text-[13px]">
              <Icon
                name={step.done ? "check" : "pin"}
                size={13}
                className={step.done ? "shrink-0 text-success" : "shrink-0 text-text-muted"}
              />
              <span className={step.done ? "text-text-muted line-through" : ""}>
                {step.title}
              </span>
              {!step.done ? (
                <Link
                  href={step.href}
                  className="ms-auto shrink-0 text-xs text-primary hover:underline"
                >
                  {step.label}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
