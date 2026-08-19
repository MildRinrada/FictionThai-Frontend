"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { getAiUsage } from "@/lib/ai-client";
import type { AiUsage } from "@/types/ai";

/**
 * โควตาต่อวัน (assistant-settings review §6).
 *
 * The quota existed before this panel did - a writer's first sight of it was
 * the "ครบโควตาแล้ว" refusal. Now the budget is stated where the switches
 * are. Renders NOTHING when the platform runs uncapped: a quota panel about
 * no quota is noise. Reading this spends none of it (the API peeks).
 */
export function AiUsagePanel() {
  const [usage, setUsage] = useState<AiUsage | null>(null);

  useEffect(() => {
    let alive = true;
    getAiUsage()
      .then((loaded) => {
        if (alive) setUsage(loaded);
      })
      // Advisory: no quota line beats an error box about the quota line.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!usage?.limited) return null;

  const ratio = usage.daily_quota > 0 ? usage.used / usage.daily_quota : 0;

  return (
    <section
      aria-label="โควตาการวิเคราะห์ต่อวัน"
      className="rounded-lg border border-border bg-surface p-4"
    >
      <p className="mono-label flex items-center gap-1.5">
        <Icon name="clock" size={14} />
        โควตาการวิเคราะห์ต่อวัน
      </p>
      <p className="mt-1 text-xs text-text-secondary">
        การวิเคราะห์แบบรอบใหญ่ (วิเคราะห์ตอน/สรุปเนื้อหา) ใช้โควตา -
        การตรวจสดระหว่างพิมพ์ไม่ใช้
      </p>
      <div className="mt-2.5 flex items-center gap-3">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={usage.daily_quota}
          aria-valuenow={usage.used}
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-secondary"
        >
          <div
            className={`h-full rounded-full ${ratio >= 1 ? "bg-error" : "bg-primary"}`}
            style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
          />
        </div>
        <p className="shrink-0 text-xs text-text-secondary tabular-nums">
          ใช้ไป {usage.used}/{usage.daily_quota} · เหลือ {usage.remaining}
        </p>
      </div>
      <p className="mt-1.5 text-xs text-text-muted">
        โควตานับเป็นรอบ 24 ชั่วโมงจากการใช้ครั้งแรก
      </p>
    </section>
  );
}
