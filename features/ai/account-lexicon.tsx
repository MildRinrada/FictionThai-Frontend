"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";
import {
  addUserLexiconTerm,
  getUserLexicon,
  removeUserLexiconTerm,
} from "@/lib/ai-client";
import type { AiUserLexicon } from "@/types/ai";

/**
 * คลังคำทั้งบัญชี (assistant-settings review §4).
 *
 * The per-fiction bank answers "this story's invented words"; this one answers
 * the other, bigger case - a writer with twenty stories in one fandom whose
 * proper nouns are flagged as typos in every new story until re-taught. Terms
 * here apply in every fiction the account writes, alongside each fiction's own
 * bank.
 */
export function AccountLexicon() {
  const [bank, setBank] = useState<AiUserLexicon | null>(null);
  const [newTerm, setNewTerm] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getUserLexicon()
      .then((loaded) => {
        if (alive) setBank(loaded);
      })
      .catch(() => {
        if (alive) setError("โหลดคลังคำไม่สำเร็จ");
      });
    return () => {
      alive = false;
    };
  }, []);

  async function addTerm() {
    const term = newTerm.trim();
    if (!term) return;
    setError(null);
    try {
      setBank(await addUserLexiconTerm(term));
      setNewTerm("");
    } catch {
      setError("เพิ่มคำไม่สำเร็จ");
    }
  }

  async function removeTerm(termID: string) {
    setError(null);
    try {
      await removeUserLexiconTerm(termID);
      setBank(await getUserLexicon());
    } catch {
      setError("ลบคำไม่สำเร็จ");
    }
  }

  return (
    <section
      aria-label="คลังคำทั้งบัญชี"
      className="rounded-lg border border-border bg-surface p-4"
    >
      <p className="mono-label">คลังคำทั้งบัญชี</p>
      <p className="mt-1 text-xs text-text-secondary">
        คำในคลังนี้จะไม่ถูกเตือนว่าสะกดผิดในทุกเรื่องที่คุณเขียน -
        เหมาะกับชื่อเฉพาะของแฟนด้อมที่ใช้ซ้ำหลายเรื่อง สอนครั้งเดียวพอ
        (คลังของแต่ละเรื่องยังมีของมันเองที่หน้าตั้งค่าเรื่อง)
      </p>

      {error ? (
        <p role="alert" className="mt-2 text-xs text-error">
          {error}
        </p>
      ) : null}

      <div className="mt-2 flex gap-2">
        <input
          value={newTerm}
          onChange={(event) => setNewTerm(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void addTerm();
            }
          }}
          placeholder="เพิ่มคำ เช่น ชื่อตัวละครประจำแฟนด้อม"
          aria-label="เพิ่มคำในคลังทั้งบัญชี"
          className="min-h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={() => void addTerm()}
          disabled={newTerm.trim() === "" || bank === null}
          className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-sm text-text-secondary hover:border-primary-200 disabled:opacity-50"
        >
          เพิ่ม
        </button>
      </div>

      {bank === null ? (
        <p className="mt-2 text-xs text-text-muted">กำลังโหลด…</p>
      ) : bank.terms.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {bank.terms.map((term) => (
            <li key={term.id}>
              <button
                type="button"
                onClick={() => void removeTerm(term.id)}
                title="ลบออกจากคลัง"
                className="inline-flex min-h-7 items-center gap-1 rounded-full border border-primary bg-primary-50 px-2.5 text-xs text-primary"
              >
                {term.term}
                <Icon name="close" size={11} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-text-muted">ยังไม่มีคำในคลัง</p>
      )}
    </section>
  );
}
