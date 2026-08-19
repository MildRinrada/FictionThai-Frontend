"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { ApiError } from "@/lib/api";
import { attestAdult } from "@/lib/auth-client";

/**
 * ยืนยันว่าคุณอายุ 18 ปีขึ้นไป - asked once, at the account
 * (docs/PHASE-13-CREATION-AND-CONTROL.md §13B).
 *
 * It is a precondition for PUBLISHING 18+ work and for nothing else: not for
 * reading it, not for holding an account, not for anything a general-rated
 * writer does. That is why it lives here rather than on the create form - a
 * question asked once belongs where the account lives, and a writer who never
 * publishes 18+ never has to answer it.
 *
 * What is stored is a timestamp. There is no date of birth, no document, and no
 * third-party check behind it, and this panel says so rather than implying the
 * platform verified something it did not (docs/11 §34, §43).
 *
 * There is deliberately no "un-attest" button. Taking it back is not an edit to
 * a profile field, and a toggle that flips both ways would make the statement
 * mean nothing.
 */

export function AdultAttestation({ attested }: { attested: boolean }) {
  const [done, setDone] = useState(attested);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3.5 py-3 text-sm">
        <Icon name="check" size={15} className="shrink-0 text-success" />
        ยืนยันแล้วว่าคุณอายุ 18 ปีขึ้นไป - เผยแพร่งาน 18+ ได้ทุกเรื่องหลังจากนี้
      </p>
    );
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await attestAdult();
      setDone(true);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "ยืนยันไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Icon name="shield" size={15} className="shrink-0 text-text-muted" />
        ยืนยันอายุสำหรับการเผยแพร่งาน 18+
      </p>

      <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
        ถ้าคุณจะเผยแพร่งานเรต 18+ ระบบขอให้คุณยืนยันครั้งเดียวว่าคุณอายุ 18 ปีขึ้นไป
        ใช้ได้กับทุกเรื่องหลังจากนั้น และไม่เกี่ยวกับการอ่าน
      </p>

      <p className="mt-2 text-xs leading-relaxed text-text-muted">
        เราเก็บแค่ว่า{" "}
        <span className="text-text-secondary">คุณกดยืนยันเมื่อไหร่</span> เท่านั้น -
        ไม่ขอวันเกิด ไม่ขอบัตรประชาชน และไม่ส่งข้อมูลไปให้ใครตรวจ
      </p>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-error">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={confirm}
        disabled={busy}
        className="mt-3 inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "กำลังยืนยัน…" : "ยืนยันว่าฉันอายุ 18 ปีขึ้นไป"}
      </button>
    </section>
  );
}
