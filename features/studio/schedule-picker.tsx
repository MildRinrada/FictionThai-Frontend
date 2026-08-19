"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";

/**
 * ตั้งเวลาเผยแพร่ - the calendar modal (save-model review 2026-08).
 *
 * A bare `datetime-local` input asks a writer to type a timestamp; scheduling
 * a chapter is picking a day on a calendar. This modal is that calendar: a
 * month grid with real navigation - month arrows, and month/year dropdowns so
 * a date far away is two jumps, not thirty clicks - plus the time, and one
 * confirm. Years read as พ.ศ., like everywhere else a Thai writer looks.
 *
 * The API refuses a time in the past, so the grid disables days before today
 * rather than re-deciding what "too late" means. `today` arrives as a prop -
 * computed by the OPENING event, never during render (react-hooks/purity).
 */

const MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
] as const;

const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"] as const;

/** How many years ahead the year dropdown offers. */
const YEARS_AHEAD = 5;

const pad = (value: number) => String(value).padStart(2, "0");

export function SchedulePicker({
  today,
  initial,
  scheduled,
  busy = false,
  onConfirm,
  onCancelSchedule,
  onClose,
}: {
  /** Midnight of the current day, from the click that opened the modal. */
  today: Date;
  /** The `YYYY-MM-DDTHH:mm` value already chosen, if any. */
  initial: string;
  /** Whether the chapter is currently scheduled - offers the cancel. */
  scheduled: boolean;
  busy?: boolean;
  onConfirm: (value: string) => void;
  onCancelSchedule?: () => void;
  onClose: () => void;
}) {
  const start = parseInitial(initial, today);
  const [year, setYear] = useState(start.getFullYear());
  const [month, setMonth] = useState(start.getMonth());
  const [day, setDay] = useState<number | null>(
    initial ? start.getDate() : null,
  );
  const [time, setTime] = useState(
    initial ? `${pad(start.getHours())}:${pad(start.getMinutes())}` : "19:00",
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const todayStamp = today.getFullYear() * 10000 + today.getMonth() * 100 + today.getDate();

  function moveMonth(delta: number) {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
    setDay(null);
  }

  function confirm() {
    if (day === null || time === "") return;
    onConfirm(`${year}-${pad(month + 1)}-${pad(day)}T${time}`);
  }

  const chosenPast =
    day !== null && year * 10000 + month * 100 + day < todayStamp;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="ตั้งเวลาเผยแพร่"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-4 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">ตั้งเวลาเผยแพร่</p>
          <button
            type="button"
            aria-label="ปิด"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-secondary hover:text-text"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* Month + year, each a DIRECT jump: the dropdowns are what make "next
            April" or "next year" two presses instead of a chain of arrows. */}
        <div className="mt-3 flex items-center gap-1.5">
          <button
            type="button"
            aria-label="เดือนก่อนหน้า"
            onClick={() => moveMonth(-1)}
            className="flex size-9 items-center justify-center rounded-md border border-border text-text-secondary hover:border-primary-200 hover:text-text"
          >
            <Icon name="chevron-left" size={15} />
          </button>

          <label className="sr-only" htmlFor="schedule-month">
            เดือน
          </label>
          <select
            id="schedule-month"
            value={month}
            onChange={(event) => {
              setMonth(Number(event.target.value));
              setDay(null);
            }}
            className="min-h-9 flex-1 rounded-md border border-border bg-surface px-2 text-sm outline-none focus:border-primary"
          >
            {MONTHS.map((name, at) => (
              <option key={name} value={at}>
                {name}
              </option>
            ))}
          </select>

          <label className="sr-only" htmlFor="schedule-year">
            ปี (พ.ศ.)
          </label>
          <select
            id="schedule-year"
            value={year}
            onChange={(event) => {
              setYear(Number(event.target.value));
              setDay(null);
            }}
            className="min-h-9 rounded-md border border-border bg-surface px-2 text-sm outline-none focus:border-primary"
          >
            {Array.from({ length: YEARS_AHEAD + 1 }, (_, at) => {
              const value = today.getFullYear() + at;
              return (
                <option key={value} value={value}>
                  {value + 543}
                </option>
              );
            })}
          </select>

          <button
            type="button"
            aria-label="เดือนถัดไป"
            onClick={() => moveMonth(1)}
            className="flex size-9 items-center justify-center rounded-md border border-border text-text-secondary hover:border-primary-200 hover:text-text"
          >
            <Icon name="chevron-right" size={15} />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-0.5 text-center">
          {WEEKDAYS.map((name) => (
            <span key={name} className="py-1 text-[11px] text-text-muted">
              {name}
            </span>
          ))}
          {Array.from({ length: firstWeekday }, (_, at) => (
            <span key={`blank-${at}`} />
          ))}
          {Array.from({ length: daysInMonth }, (_, at) => {
            const value = at + 1;
            const stamp = year * 10000 + month * 100 + value;
            const past = stamp < todayStamp;
            const isToday = stamp === todayStamp;
            const picked = day === value;
            return (
              <button
                key={value}
                type="button"
                disabled={past}
                aria-pressed={picked}
                onClick={() => setDay(value)}
                className={`flex min-h-9 items-center justify-center rounded-md text-sm tabular-nums ${
                  picked
                    ? "bg-primary font-medium text-white"
                    : past
                      ? "text-text-muted/50"
                      : isToday
                        ? "border border-primary-200 text-primary hover:bg-primary-50"
                        : "text-text hover:bg-surface-secondary"
                }`}
              >
                {value}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center gap-2.5 border-t border-hairline pt-3">
          <label htmlFor="schedule-time" className="text-sm text-text-secondary">
            เวลา
          </label>
          <input
            id="schedule-time"
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            className="min-h-9 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
          />
          <p className="ms-auto text-xs text-text-muted">ใช้เวลาของเครื่องคุณ</p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || day === null || time === "" || chosenPast}
            onClick={confirm}
            className="inline-flex min-h-10 flex-1 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            ยืนยันตั้งเวลา
          </button>
          {scheduled && onCancelSchedule ? (
            <button
              type="button"
              disabled={busy}
              onClick={onCancelSchedule}
              className="inline-flex min-h-10 items-center rounded-md border border-border px-3.5 text-sm text-text-secondary hover:border-error hover:text-error disabled:opacity-50"
            >
              ยกเลิกการตั้งเวลา
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-text-muted">
          ตอนจะยังเป็นร่างจนถึงเวลานั้น - งานถูกบันทึกลงระบบให้พร้อมกับการตั้งเวลา
        </p>
      </div>
    </div>
  );
}

/** The starting point the calendar opens on. */
function parseInitial(initial: string, today: Date): Date {
  if (initial) {
    const parsed = new Date(initial);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return today;
}
