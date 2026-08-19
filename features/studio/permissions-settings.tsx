"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { SaveBadge } from "@/components/ui/save-badge";
import { PERMISSION_FIELDS } from "@/features/novels/create-extras";
import { updateNovel } from "@/lib/novels-client";
import { useAutosave } from "@/lib/use-autosave";
import type { Novel } from "@/types/novel";

/**
 * สิทธิ์และการสนับสนุน (settings review 2026-08, item E).
 *
 * The permission statements (§13E) existed on the create form and then had no
 * editor anywhere - a writer who changed their mind about translations or
 * fanart could never say so. The same five statements live here now.
 *
 * ปุ่มสนับสนุน moved HERE from การแสดงผล (review item F): it is a money
 * switch, and filing money under "display" is how it gets flipped by someone
 * adjusting their theme colour. Money stays opt-in and dead until a payment
 * link exists (13V).
 */
export function PermissionsSettings({
  novel,
  hasDonationLink,
}: {
  novel: Novel;
  hasDonationLink: boolean;
}) {
  const [permissions, setPermissions] = useState({
    allow_screenshot: novel.rights.allow_screenshot,
    allow_translation: novel.rights.allow_translation,
    allow_derivative: novel.rights.allow_derivative,
    allow_audio: novel.rights.allow_audio,
    require_credit: novel.rights.require_credit,
  });
  const [derivativeTerms, setDerivativeTerms] = useState(
    novel.rights.derivative_terms ?? "",
  );
  const [showDonate, setShowDonate] = useState(novel.show_donate ?? false);

  const save = useCallback(
    async (value: {
      permissions: typeof permissions;
      derivativeTerms: string;
      showDonate: boolean;
    }) => {
      await updateNovel(novel.slug, {
        ...value.permissions,
        derivative_terms: value.permissions.allow_derivative
          ? value.derivativeTerms.trim() || null
          : null,
        show_donate: value.showDonate,
      });
    },
    [novel.slug],
  );
  const autosave = useAutosave({ permissions, derivativeTerms, showDonate }, save, 500);

  function toggle(key: keyof typeof permissions, next: boolean) {
    setPermissions((current) => ({ ...current, [key]: next }));
  }

  return (
    <section
      id="permissions"
      className="scroll-mt-28 rounded-lg border border-border bg-surface p-5"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-serif text-lg font-semibold">สิทธิ์และการสนับสนุน</h2>
        <SaveBadge state={autosave.state} error={autosave.error} />
      </div>
      <p className="mt-1 text-xs leading-relaxed text-text-muted">
        การประกาศเจตนาที่แสดงให้ผู้อ่านเห็น ไม่ใช่การป้องกันทางเทคนิค
      </p>

      <div className="mt-4 flex flex-col gap-2">
        {PERMISSION_FIELDS.map(([key, label]) => (
          <label key={key} className="flex w-fit items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={permissions[key]}
              onChange={(event) => toggle(key, event.target.checked)}
              className="size-4 accent-primary"
            />
            {label}
          </label>
        ))}
      </div>

      {permissions.allow_derivative ? (
        <div className="mt-4">
          <label htmlFor="derivative-terms" className="mono-label block">
            เงื่อนไขของงานต่อยอด
          </label>
          <input
            id="derivative-terms"
            type="text"
            value={derivativeTerms}
            onChange={(event) => setDerivativeTerms(event.target.value)}
            placeholder="เช่น ทำต่อได้ แต่บอกกันก่อน"
            className="mt-2 w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>
      ) : null}

      <div className="mt-5 border-t border-hairline pt-4">
        <p className="mono-label">การสนับสนุน</p>
        <label
          className={`mt-2.5 flex w-fit items-center gap-2.5 text-sm ${
            hasDonationLink ? "" : "opacity-60"
          }`}
        >
          <input
            type="checkbox"
            checked={showDonate && hasDonationLink}
            onChange={(event) => setShowDonate(event.target.checked)}
            disabled={!hasDonationLink}
            className="size-4 accent-primary"
          />
          แสดงปุ่มสนับสนุนนักเขียนใต้เรื่องนี้
        </label>
        {!hasDonationLink ? (
          <p className="mt-1 ms-6.5 text-xs text-text-muted">
            ยังไม่ได้ตั้งช่องทางรับเงิน -{" "}
            <Link href="/studio/author" className="text-primary hover:underline">
              ตั้งค่าช่องทางรับเงิน
            </Link>
          </p>
        ) : null}
      </div>
    </section>
  );
}
