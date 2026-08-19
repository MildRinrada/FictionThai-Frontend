"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import {
  activateDemo,
  cancelSubscription,
  getSubscriptionOverview,
  startCheckout,
  submitPaymentSlip,
} from "@/lib/subscription-client";
import {
  formatTHB,
  periodLabel,
  tierLabel,
  type SubscriptionCheckout,
  type SubscriptionOverview,
} from "@/types/subscription";

/**
 * The reader's Premium management surface (brief §10, §11, §22).
 *
 * It adapts to the platform mode returned by the backend:
 *
 *   disabled  "Premium is coming soon" - no purchase, no demo.
 *   demo      the FREE launch trial: activate → use the tier → see the expiry
 *             date. NO PromptPay, NO slip, NO fake payment (brief §2, §20).
 *   live      the real PromptPay + slip flow (unchanged).
 *
 * The tier shown here is display only - the BACKEND is the entitlement authority,
 * and the frontend can NEVER activate a PAID subscription itself (brief §8, §12).
 */
export function SubscriptionManager({ initialPlan = "" }: { initialPlan?: string }) {
  const toMessage = useErrorMessage();
  const [overview, setOverview] = useState<SubscriptionOverview | null>(null);
  const [checkout, setCheckout] = useState<SubscriptionCheckout | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoStarted, setDemoStarted] = useState(false);

  const reload = useCallback(async () => {
    try {
      setOverview(await getSubscriptionOverview());
    } catch (cause) {
      setError(toMessage(cause));
    }
  }, [toMessage]);

  useEffect(() => {
    let cancelled = false;
    getSubscriptionOverview()
      .then((o) => {
        if (!cancelled) setOverview(o);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(toMessage(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [toMessage]);

  const beginCheckout = async (planCode: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setCheckout(await startCheckout(planCode));
    } catch (cause) {
      setError(toMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const startDemo = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await activateDemo();
      setDemoStarted(true);
      await reload();
    } catch (cause) {
      setError(toMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await cancelSubscription();
      setCheckout(null);
      await reload();
    } catch (cause) {
      setError(toMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const onSlipSubmitted = async () => {
    setCheckout(null);
    await reload();
  };

  if (!overview) {
    return <p className="text-sm text-text-secondary">กำลังโหลด…</p>;
  }

  const { mode, subscription: sub, demo } = overview;
  const payment = overview.latest_payment;
  const isActive = !!sub && (sub.status === "active" || sub.status === "cancelled");
  const isDemoActive = isActive && sub!.source === "demo";
  const isPaidActive = isActive && sub!.source === "paid";
  const awaitingReview =
    payment && payment.status === "pending_verification" && payment.has_evidence;
  const needsSlip =
    !isActive &&
    payment &&
    payment.status === "pending_verification" &&
    !payment.has_evidence;

  return (
    <div className="flex flex-col gap-8">
      {/* Current standing */}
      <section className="rounded-md border border-border p-4" data-testid="subscription-status">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-secondary">แพ็กเกจปัจจุบัน:</span>
          <Badge tone={overview.tier === "free" ? "neutral" : "primary"}>
            <span data-testid="subscription-tier">{tierLabel(overview.tier)}</span>
          </Badge>
          {isDemoActive ? (
            <Badge tone="secondary">
              <span data-testid="demo-badge">ทดลองใช้</span>
            </Badge>
          ) : null}
        </div>
        {sub ? (
          <p className="mt-2 text-sm text-text-secondary">
            สถานะ: <span className="font-medium">{sub.status}</span>
            {sub.current_period_end ? (
              <> · ใช้ได้ถึง {new Date(sub.current_period_end).toLocaleDateString("th-TH")}</>
            ) : null}
          </p>
        ) : null}
      </section>

      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}

      {/* Active DEMO - free trial in progress (brief §10) */}
      {isDemoActive && sub ? (
        <section className="rounded-md border border-primary/40 p-4" data-testid="demo-active">
          <p className="text-sm font-medium">
            {demoStarted ? "เริ่มทดลองใช้แล้ว - " : ""}
            คุณกำลังใช้ {tierLabel(sub.tier)} แบบทดลอง
          </p>
          {sub.current_period_end ? (
            <p className="mt-1 text-sm text-text-secondary">
              สิทธิ์ทดลองใช้ถึง{" "}
              <span className="font-medium" data-testid="demo-expires">
                {new Date(sub.current_period_end).toLocaleDateString("th-TH")}
              </span>
            </p>
          ) : null}
          <p className="mt-2 text-xs text-text-muted">ช่วงทดลองนี้ไม่มีค่าใช้จ่าย</p>
        </section>
      ) : null}

      {/* Active PAID subscription - cancellable (brief §14, unchanged live flow) */}
      {isPaidActive && sub ? (
        <section className="rounded-md border border-success/40 p-4" data-testid="premium-active">
          <p className="text-sm">✓ Premium ของคุณใช้งานอยู่ ({tierLabel(sub.tier)})</p>
          {sub.status === "active" ? (
            <div className="mt-3">
              <Button variant="ghost" onClick={() => void cancel()} loading={busy}>
                ยกเลิกการต่ออายุ
              </Button>
              <p className="mt-1 text-xs text-text-muted">
                การยกเลิกจะไม่ตัดสิทธิ์ที่ชำระไปแล้ว คุณยังใช้ได้จนสิ้นสุดรอบ
              </p>
            </div>
          ) : (
            <p className="mt-2 text-xs text-text-muted">
              ยกเลิกแล้ว - ยังใช้ได้จนสิ้นสุดรอบที่ชำระไว้
            </p>
          )}
        </section>
      ) : null}

      {/* DEMO MODE - activate / expired (no PromptPay, no slip, no fake payment) */}
      {mode === "demo" && !isActive ? (
        demo?.eligible ? (
          <section className="rounded-md border border-primary/40 p-4" data-testid="demo-activate">
            <h2 className="mb-1 text-lg font-semibold">
              ทดลองใช้ {demo.offered_tier ? tierLabel(demo.offered_tier) : "Premium"} ฟรี
            </h2>
            <p className="text-sm text-text-secondary">
              สัมผัสฟีเจอร์ทั้งหมดฟรี {demo.duration_days} วัน ไม่มีการเรียกเก็บเงิน
              และไม่ต้องกรอกข้อมูลการชำระเงิน
            </p>
            <div className="mt-3">
              <span data-testid="demo-activate-button">
                <Button onClick={() => void startDemo()} loading={busy}>
                  เริ่มทดลองใช้
                </Button>
              </span>
            </div>
          </section>
        ) : demo?.used ? (
          <section className="rounded-md border border-border p-4" data-testid="demo-expired">
            <p className="text-sm">
              สิทธิ์ทดลองใช้ {demo.offered_tier ? tierLabel(demo.offered_tier) : "Premium"}{" "}
              หมดอายุแล้ว
            </p>
            <p className="mt-1 text-xs text-text-muted">
              คุณสามารถกลับมาใช้แพ็กเกจฟรีได้ตามปกติ
            </p>
          </section>
        ) : null
      ) : null}

      {/* DISABLED MODE - coming soon */}
      {mode === "disabled" && !isActive ? (
        <section className="rounded-md border border-border p-4" data-testid="subscription-disabled">
          <p className="text-sm">ระบบสมาชิก Premium กำลังจะเปิดให้บริการเร็ว ๆ นี้</p>
        </section>
      ) : null}

      {/* LIVE MODE - awaiting verification */}
      {mode === "live" && !isActive && awaitingReview ? (
        <section className="rounded-md border border-warning/40 p-4" data-testid="awaiting-verification">
          <p className="text-sm">กำลังรอตรวจสอบการชำระเงิน</p>
          <p className="mt-1 text-xs text-text-muted">
            เราได้รับสลิปของคุณแล้ว Premium จะเปิดใช้งานหลังการตรวจสอบ
          </p>
        </section>
      ) : null}

      {/* LIVE MODE - just checked out → PromptPay + slip upload */}
      {mode === "live" && !isActive && checkout ? (
        <CheckoutPanel checkout={checkout} onSubmitted={onSlipSubmitted} toMessage={toMessage} />
      ) : mode === "live" && !isActive && needsSlip && payment ? (
        <SlipOnlyPanel
          paymentId={payment.id}
          amountMinor={payment.amount_minor}
          onSubmitted={onSlipSubmitted}
          toMessage={toMessage}
        />
      ) : null}

      {/* LIVE MODE - rejected hint */}
      {mode === "live" && !isActive && payment && payment.status === "rejected" ? (
        <p className="text-sm text-error" data-testid="payment-rejected">
          การชำระเงินก่อนหน้าไม่ผ่านการตรวจสอบ
          {payment.reject_reason ? ` (${payment.reject_reason})` : ""} กรุณาเลือกแพ็กเกจเพื่อลองใหม่
        </p>
      ) : null}

      {/* LIVE MODE - plans to subscribe */}
      {mode === "live" && !isActive && !checkout && !awaitingReview && !needsSlip ? (
        <section aria-labelledby="plans-heading">
          <h2 id="plans-heading" className="mb-3 text-lg font-semibold">
            เลือกแพ็กเกจ
          </h2>
          <ul className="grid gap-3 sm:grid-cols-3" data-testid="plan-choices">
            {overview.plans.map((plan) => (
              <li key={plan.code} data-testid={`plan-${plan.code}`} className="rounded-md border border-border p-4">
                <Badge tone={plan.tier === "pro" ? "secondary" : "primary"}>{tierLabel(plan.tier)}</Badge>
                <p className="mt-2 text-lg font-semibold">
                  {formatTHB(plan.price_minor)}{" "}
                  <span className="text-xs font-normal text-text-secondary">
                    {plan.currency} {periodLabel(plan.billing_period)}
                  </span>
                </p>
                <div className="mt-3">
                  <Button
                    onClick={() => void beginCheckout(plan.code)}
                    loading={busy}
                    aria-label={`สมัคร ${plan.code}`}
                  >
                    สมัคร
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {initialPlan ? (
            <p className="mt-2 text-xs text-text-muted">แพ็กเกจที่เลือกไว้: {initialPlan}</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/** PromptPay instructions + slip upload, shown right after checkout. */
function CheckoutPanel({
  checkout,
  onSubmitted,
  toMessage,
}: {
  checkout: SubscriptionCheckout;
  onSubmitted: () => void | Promise<void>;
  toMessage: (cause: unknown) => string;
}) {
  const { payment, promptpay } = checkout;
  return (
    <section className="rounded-md border border-border p-4" data-testid="checkout-panel">
      <h2 className="mb-2 text-lg font-semibold">ชำระเงินผ่าน PromptPay</h2>
      <p className="text-sm">
        ยอดชำระ:{" "}
        <span className="font-medium" data-testid="checkout-amount">
          {formatTHB(payment.amount_minor)} {payment.currency}
        </span>
      </p>
      {promptpay.available && promptpay.target ? (
        <>
          <p className="mt-1 text-sm text-text-secondary">
            พร้อมเพย์: <span className="font-mono">{promptpay.target}</span>
          </p>
          <p className="mt-2 break-all rounded-md bg-surface-secondary p-2 text-xs" data-testid="promptpay-payload">
            {promptpay.qr_payload}
          </p>
        </>
      ) : (
        <p className="mt-1 text-xs text-text-muted">
          โปรดโอนตามยอดข้างต้น แล้วอัปโหลดสลิปเพื่อยืนยัน
        </p>
      )}
      <SlipUploader paymentId={payment.id} onSubmitted={onSubmitted} toMessage={toMessage} />
    </section>
  );
}

/** Slip upload for an in-progress payment when the QR is no longer in memory. */
function SlipOnlyPanel({
  paymentId,
  amountMinor,
  onSubmitted,
  toMessage,
}: {
  paymentId: string;
  amountMinor: number;
  onSubmitted: () => void | Promise<void>;
  toMessage: (cause: unknown) => string;
}) {
  return (
    <section className="rounded-md border border-border p-4" data-testid="checkout-panel">
      <h2 className="mb-2 text-lg font-semibold">ยืนยันการชำระเงิน</h2>
      <p className="text-sm">
        ยอดชำระ: <span className="font-medium">{formatTHB(amountMinor)} THB</span>
      </p>
      <SlipUploader paymentId={paymentId} onSubmitted={onSubmitted} toMessage={toMessage} />
    </section>
  );
}

function SlipUploader({
  paymentId,
  onSubmitted,
  toMessage,
}: {
  paymentId: string;
  onSubmitted: () => void | Promise<void>;
  toMessage: (cause: unknown) => string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      await submitPaymentSlip(paymentId, file);
      await onSubmitted();
    } catch (cause) {
      setError(toMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 flex flex-col gap-2">
      <label className="text-sm text-text-secondary" htmlFor="slip">
        อัปโหลดสลิปการโอน (รูปภาพ)
      </label>
      <input
        id="slip"
        data-testid="slip-input"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="text-sm"
      />
      <div className="flex items-center gap-3">
        <span data-testid="submit-slip">
          <Button onClick={() => void submit()} loading={busy} disabled={!file}>
            ส่งสลิป
          </Button>
        </span>
        {error ? (
          <span role="alert" className="text-xs text-error">
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Maps an API failure to a Thai message, redirecting a guest to sign in. */
function useErrorMessage() {
  const router = useRouter();
  return useCallback(
    (cause: unknown): string => {
      if (cause instanceof ApiError && cause.isUnauthorized) {
        router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        return "กรุณาเข้าสู่ระบบ";
      }
      if (cause instanceof ApiError) {
        if (cause.status === 503) return "ระบบสมาชิก Premium ยังไม่พร้อมใช้งานขณะนี้";
        if (cause.status === 409) return cause.message;
        if (cause.isRateLimited) return "ทำรายการถี่เกินไป กรุณารอสักครู่";
        if (cause.status === 413) return "ไฟล์ใหญ่เกินไป";
        if (cause.status === 422) {
          const first = cause.fields && Object.values(cause.fields)[0]?.[0];
          return first ?? "ข้อมูลไม่ถูกต้อง";
        }
        if (cause.isNotFound) return "ไม่พบรายการ หรือคุณไม่มีสิทธิ์เข้าถึง";
        return cause.message;
      }
      return "เกิดข้อผิดพลาด กรุณาลองใหม่";
    },
    [router],
  );
}
