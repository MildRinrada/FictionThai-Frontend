"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { setShowAdult } from "@/lib/adult-pref";

/**
 * The reader's 18+ switch, on a browse surface (§13B).
 *
 * Off by default, and off is the platform's answer for everyone who never
 * touches it: 18+ work stays out of listings, search, and recommendations.
 * Turning it on is a request the API honours only for a signed-in reader, and
 * never for งาน 18+ เนื้อหาทางเพศชัดเจน - which is reachable by link and from
 * the author's own page, and by design is not something a reader can stumble
 * into from a listing.
 *
 * The panel says both of those things rather than presenting a switch and
 * letting the reader discover its limits by finding nothing. A control that
 * silently does less than it appears to is the dishonesty §13E rules out.
 */

export function AdultFilter({
  showing,
  signedIn,
}: {
  showing: boolean;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  function toggle(next: boolean) {
    setPending(true);
    setShowAdult(next);
    // The listing is rendered on the server, so the page has to be re-fetched
    // for the change to mean anything. Nothing is patched locally: the API
    // decides what this reader may see.
    router.refresh();
    setPending(false);
  }

  if (!signedIn) {
    return (
      <p className="flex items-start gap-2 text-xs text-text-muted">
        <Icon name="shield" size={14} className="mt-0.5 shrink-0" />
        เนื้อหา 18+ ไม่แสดงในหน้ารวม - ล็อกอินก่อนถึงจะเลือกให้แสดงได้
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={!showing}
          onChange={(event) => toggle(!event.target.checked)}
          disabled={pending}
          className="size-4 accent-primary"
        />
        ซ่อนเนื้อหา 18+
      </label>
      <p className="text-xs text-text-muted">
        {showing
          ? "กำลังแสดงงาน 18+ ในหน้ารวม - งานที่เรต 18+ เนื้อหาทางเพศชัดเจน ยังไม่แสดงที่นี่ เข้าถึงได้ทางลิงก์เท่านั้น"
          : "งาน 18+ จะไม่ขึ้นในหน้ารวมและค้นหา แต่ยังเปิดอ่านได้ถ้ามีลิงก์"}
      </p>
    </div>
  );
}
