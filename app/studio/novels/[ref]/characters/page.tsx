import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SectionHeader } from "@/components/ui/section-header";
import { CharacterManager } from "@/features/studio/character-manager";
import { fetchCharacters } from "@/lib/characters-server";
import { decodeParam, fetchOwnerNovel, fetchOwnerChapters } from "@/lib/fiction-server";

/**
 * The cast editor route (Phase 12A).
 *
 * The chapter list is fetched here so the appearance picker can offer real
 * chapters. The layout above has already established that the caller owns this
 * fiction; the API re-checks on every write regardless (docs/11 §43).
 */

export const metadata: Metadata = {
  title: "ตัวละคร",
  robots: { index: false, follow: false },
};

export default async function StudioCharactersPage({
  params,
}: PageProps<"/studio/novels/[ref]/characters">) {
  const { ref: rawRef } = await params;
  const ref = decodeParam(rawRef);

  const [novel, characters, chapters] = await Promise.all([
    fetchOwnerNovel(ref),
    fetchCharacters(ref),
    fetchOwnerChapters(ref),
  ]);
  if (!novel) notFound();

  return (
    <div>
      <SectionHeader title={`ตัวละครและไทม์ไลน์ · ${characters.length}`} />
      <p className="mb-5 max-w-prose text-sm leading-relaxed text-text-secondary">
        ตัวละครที่เพิ่มไว้จะแสดงบนหน้าเรื่องให้ผู้อ่านเห็น -
        กด «ดูตัวอย่างที่ผู้อ่านเห็น» ในการ์ดได้ทุกเมื่อ
        การเลือกตอนที่แต่ละคนปรากฏจะรวมเป็นตารางไทม์ไลน์ท้ายหน้านี้
        และทุกการแก้ไขบันทึกอัตโนมัติ
      </p>

      <CharacterManager
        novelRef={novel.slug}
        initialCharacters={characters}
        chapters={chapters}
      />
    </div>
  );
}
