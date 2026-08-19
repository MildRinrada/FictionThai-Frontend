"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Icon } from "@/components/ui/icon";
import { logout } from "@/lib/auth-client";

/**
 * The signed-in account menu - the ACCOUNT, and nothing else.
 *
 * สตูดิโอ and ชั้นหนังสือ used to live in here. Both are places a person goes
 * to do their work, and both are now top-level links: a menu that mixes "where
 * my writing is" with "sign out" makes the first one invisible, because nobody
 * opens their own avatar looking for a workspace.
 *
 * What is left is what an avatar menu is for: who you are, how the site behaves
 * for you, and the way out.
 *
 * A client island because a dropdown needs open state, outside-click dismissal,
 * and Escape handling. Nothing here decides what the account may do - that stays
 * with the API (docs/10).
 */

/** Who you are, publicly. */
const IDENTITY = [
  { href: "/profile", label: "โปรไฟล์ของฉัน", hint: "ดูแบบที่คนอื่นเห็น" },
  { href: "/profile?tab=achievements", label: "เหรียญและความสำเร็จ" },
];

/** How the site behaves for you. */
const SETTINGS = [
  { href: "/settings/profile", label: "ตั้งค่าโปรไฟล์" },
  { href: "/settings/ai", label: "ผู้ช่วยเขียน" },
  { href: "/notifications", label: "การแจ้งเตือน" },
  { href: "/account/subscription", label: "ตั้งค่าบัญชีและแพ็กเกจ" },
  { href: "/contact", label: "ติดต่อทีมงาน" },
];

export function AccountMenu({
  displayName,
  avatarUrl,
  username,
}: {
  displayName: string;
  avatarUrl?: string;
  /** Shown under the name, because the handle is the permanent one. */
  username?: string;
}) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  async function onSignOut() {
    setSigningOut(true);
    try {
      await logout();
    } catch {
      // The session may already be gone server-side. Either way the visitor
      // asked to leave, so continue to the signed-out view rather than
      // stranding them in a menu with an error.
    }
    setOpen(false);
    // refresh() re-runs the Server Components, which is what actually clears
    // the signed-in shell - push alone would keep the cached header.
    router.push("/");
    router.refresh();
  }

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`บัญชีของ ${displayName}`}
        className="flex size-8 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-secondary text-text-secondary"
      >
        {avatarUrl ? (
          // Avatars are served from object storage, an origin the image
          // optimizer has no configured loader for.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="size-full object-cover" />
        ) : (
          <Icon name="user" size={16} />
        )}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute inset-e-0 top-[calc(100%+8px)] z-50 w-60 overflow-hidden rounded-lg border border-border bg-surface shadow-popover"
        >
          <div className="border-b border-hairline px-3.5 py-2.5">
            <p className="text-sm font-medium">{displayName}</p>
            {username ? (
              <p className="mt-0.5 font-mono text-[11px] text-text-muted">@{username}</p>
            ) : null}
          </div>

          <ul className="py-1">
            {IDENTITY.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="block px-3.5 py-2 text-sm text-text-secondary hover:bg-surface-secondary hover:text-text"
                >
                  {item.label}
                  {item.hint ? (
                    <span className="mt-0.5 block text-[11px] text-text-muted">
                      {item.hint}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>

          <ul className="border-t border-hairline py-1">
            {SETTINGS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="block px-3.5 py-2 text-sm text-text-secondary hover:bg-surface-secondary hover:text-text"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            {/* แต้ม/กาชา's reserved seat (docs/MONETIZATION.md §25 - the
                mechanic is an OPEN decision). It moved here from the bar
                itself: the navbar review counted five items in the right
                cluster and this was the one that does nothing yet. */}
            <li>
              <span
                aria-disabled
                className="flex items-center gap-1.5 px-3.5 py-2 text-sm text-text-muted"
              >
                <Icon name="sparkle" size={14} />
                ระบบแต้ม
                <span className="ms-auto text-[11px]">กำลังจะมา</span>
              </span>
            </li>
          </ul>

          {/* The theme belongs to the person, so it lives with their account
              rather than at the bottom of every page. */}
          <div className="border-t border-hairline px-3.5 py-2.5">
            <ThemeToggle tone="onSurface" />
          </div>

          <div className="border-t border-hairline py-1">
            {/*
              Sign-out is a POST through the API client so it carries the CSRF
              header. A link would be a GET that a prefetch could fire by
              accident, silently ending someone's session (docs/11 §43).
            */}
            <button
              type="button"
              role="menuitem"
              onClick={onSignOut}
              disabled={signingOut}
              className="block w-full px-3.5 py-2 text-start text-sm text-text-secondary hover:bg-surface-secondary hover:text-text disabled:opacity-50"
            >
              {signingOut ? "กำลังออกจากระบบ…" : "ออกจากระบบ"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
