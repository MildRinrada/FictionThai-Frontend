import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageContainer } from "@/components/shell/page-container";
import { SettingsNav } from "@/components/settings/settings-nav";
import { AdultAttestation } from "@/features/profile/adult-attestation";
import { AchievementManager } from "@/features/profile/achievement-manager";
import { PenNamesPanel } from "@/features/profile/pen-names-panel";
import { PinnedEditor } from "@/features/profile/pinned-editor";
import { ShelfManager } from "@/features/profile/shelf-manager";
import { ProfileEditor } from "@/features/profile/profile-editor";
import { getCurrentUserOrNull } from "@/lib/auth";
import { fetchPublicProfile } from "@/lib/profiles-server";

/**
 * ตั้งค่าโปรไฟล์ - the first real settings surface
 * (docs/PROFILE-AND-ACHIEVEMENTS.md Part 1).
 *
 * Two things live here that were on the profile page before:
 *
 * 1. **Editing.** `แก้ไขโปรไฟล์` used to lead to the author-profile page, which
 *    can only set a donation link. Name, introduction, links, avatar, and cover
 *    had no editor anywhere in the product.
 * 2. **The adult attestation.** It is ACCOUNT data - a one-time statement that
 *    gates publishing 18+ work - and it was the first thing a writer saw on
 *    their own profile. A profile is the page other people read; an account
 *    statement does not belong on it.
 */

export const metadata: Metadata = {
  title: "ตั้งค่าโปรไฟล์",
  robots: { index: false, follow: false },
};

export default async function ProfileSettingsPage() {
  const user = await getCurrentUserOrNull();
  if (!user) {
    redirect("/login?next=/settings/profile");
  }

  // Read through the public endpoint, so the editor starts from exactly what
  // visitors see today.
  const profile = await fetchPublicProfile(user.username);
  if (!profile) notFound();

  return (
    <PageContainer className="max-w-3xl pt-6 pb-16">
      {/* The account-settings tabs: this page and ตั้งค่าผู้ช่วยเขียน are
          siblings of one settings area, and each should say so. */}
      <SettingsNav />
      <nav className="mono-label mt-5">
        <Link href="/profile" className="hover:text-primary">
          โปรไฟล์
        </Link>
        {" · ตั้งค่า"}
      </nav>
      <h1 className="mt-3 font-serif text-2xl font-semibold tracking-tight">
        ตั้งค่าโปรไฟล์
      </h1>
      <p className="mt-2 text-sm text-text-secondary">
        ทุกอย่างในหน้านี้คือสิ่งที่คนอื่นเห็นบนโปรไฟล์ของคุณ ยกเว้นส่วนบัญชีด้านล่าง
      </p>

      <div className="mt-6">
        <ProfileEditor profile={profile} />
      </div>

      {/*
       * นามปากกา (docs/PROFILE-AND-ACHIEVEMENTS.md Part 2). Its own section
       * rather than a field inside the editor above: these are a LIST the
       * writer manages one row at a time, each row its own request, while the
       * editor is one form with one save. Folding them together would mean a
       * half-finished introduction could block adding a pen name.
       *
       * The list comes from the public profile this page already fetched, so
       * the section costs no extra request on first paint.
       */}
      <section className="mt-10">
        <h2 className="font-serif text-lg font-semibold">นามปากกา</h2>
        <p className="mt-1 mb-4 text-sm text-text-secondary">
          ชื่อที่ผู้อ่านเห็นบนผลงาน - เปลี่ยนได้เสมอ และเลือกได้ว่าเรื่องไหนใช้ชื่อไหน
        </p>
        <PenNamesPanel
          username={profile.username}
          initialPenNames={profile.pen_names ?? []}
        />
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-lg font-semibold">เรื่องที่ปักหมุด</h2>
        <p className="mt-1 mb-4 text-sm text-text-secondary">
          เลือกได้ 3 เรื่องที่จะขึ้นบนสุดของโปรไฟล์ พร้อมเหตุผลสั้น ๆ ในภาษาของคุณเอง -
          คนที่เพิ่งเจอคุณจะได้รู้ว่าควรเริ่มตรงไหน
        </p>
        <PinnedEditor username={profile.username} initialPinned={profile.pinned ?? []} />
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-lg font-semibold">ชั้นหนังสือ</h2>
        <p className="mt-1 mb-4 text-sm text-text-secondary">
          จัดชั้นของที่คุณอ่าน ตั้งชื่อเองได้ - แต่ละชั้นเลือกได้ว่าจะให้คนอื่นเห็นหรือไม่
        </p>
        <ShelfManager />
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-lg font-semibold">เหรียญและความสำเร็จ</h2>
        <p className="mt-1 mb-4 text-sm text-text-secondary">
          เลือกได้ว่าจะโชว์อันไหนบนโปรไฟล์ - หรือปิดทั้งระบบก็ได้
        </p>
        <AchievementManager />
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-lg font-semibold">บัญชี</h2>
        <p className="mt-1 mb-4 text-sm text-text-secondary">
          ส่วนนี้เป็นข้อมูลบัญชีของคุณเอง ไม่แสดงบนโปรไฟล์สาธารณะ
        </p>
        <AdultAttestation attested={user.adult_attested} />
      </section>
    </PageContainer>
  );
}
