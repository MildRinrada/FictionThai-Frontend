"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { getAuthorProfile, setDonationURL } from "@/lib/author-client";

/**
 * The writer's external donation-link setting (brief §8). The smallest surface
 * for one field - NOT a full account-settings system. FictionThai only stores
 * and displays this external https URL; it never processes the donation.
 */
export function DonationForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAuthorProfile()
      .then((profile) => {
        if (cancelled) return;
        setValue(profile.donation_url ?? "");
        setLoaded(true);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        if (cause instanceof ApiError && cause.isUnauthorized) {
          router.push("/login?next=/studio/author");
          return;
        }
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const toMessage = useCallback(
    (cause: unknown): string => {
      if (cause instanceof ApiError && cause.isUnauthorized) {
        router.push("/login?next=/studio/author");
        return "กรุณาเข้าสู่ระบบ";
      }
      if (cause instanceof ApiError) {
        if (cause.status === 422) {
          const first = cause.fields && Object.values(cause.fields)[0]?.[0];
          return first ?? "ลิงก์ไม่ถูกต้อง";
        }
        return cause.message;
      }
      return "เกิดข้อผิดพลาด กรุณาลองใหม่";
    },
    [router],
  );

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const trimmed = value.trim();
      const profile = await setDonationURL(trimmed === "" ? null : trimmed);
      setValue(profile.donation_url ?? "");
      setMessage(profile.donation_url ? "บันทึกลิงก์แล้ว" : "ลบลิงก์แล้ว");
    } catch (cause) {
      setError(toMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) {
    return <p className="text-sm text-text-secondary">กำลังโหลด…</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="donation_url" className="text-sm font-medium">
        ลิงก์รับการสนับสนุน (EasyDonate หรืออื่น ๆ)
      </label>
      <input
        id="donation_url"
        data-testid="donation-url-input"
        type="url"
        inputMode="url"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://easydonate.co/your-page"
        className="min-h-11 rounded-md border border-border bg-transparent px-3 text-sm"
      />
      <p className="text-xs text-text-muted">
        ต้องเป็นลิงก์ https เท่านั้น การสนับสนุนนี้เป็นการโอนตรงถึงนักเขียนผ่านบริการภายนอก
        FictionThai ไม่ได้รับหรือจัดการเงินส่วนนี้ เว้นว่างไว้เพื่อลบลิงก์
      </p>
      <div className="flex items-center gap-3">
        <Button onClick={() => void save()} loading={busy}>
          บันทึก
        </Button>
        {message ? (
          <span role="status" className="text-xs text-success">
            {message}
          </span>
        ) : null}
        {error ? (
          <span role="alert" className="text-xs text-error">
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );
}
