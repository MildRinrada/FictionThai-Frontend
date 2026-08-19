"use client";

import { useId, useState } from "react";

/**
 * เรื่องย่อ / บทนำ / จากผู้เขียน - the three things an author writes ABOUT the
 * fiction, in one place (§13S).
 *
 * The page is otherwise deliberately untabbed: a reader deciding whether to
 * start should not have to hunt for the synopsis or the chapter list, which is
 * exactly what the tabbed competitor layouts make them do. These three are the
 * one honest exception - they answer the same question at three lengths, a
 * reader wants one of them, and stacking all three pushes the chapter list off
 * the screen for everyone.
 *
 * With only a synopsis there is no strip at all, so the common case is exactly
 * the page it always was.
 */

export interface AboutPanel {
  key: string;
  label: string;
  subLabel: string;
  text: string;
}

export function AboutTabs({ panels }: { panels: AboutPanel[] }) {
  const id = useId();
  const [active, setActive] = useState(panels[0]?.key ?? "");

  if (panels.length === 0) return null;

  const current = panels.find((panel) => panel.key === active) ?? panels[0];

  if (panels.length === 1) {
    return (
      <section aria-labelledby={`${id}-single`} className="mb-10">
        <div className="mb-3 flex items-baseline gap-3 border-b border-hairline pb-2">
          <h2 id={`${id}-single`} className="font-serif text-lg font-semibold">
            {current.label}
          </h2>
          <span className="mono-label">{current.subLabel}</span>
        </div>
        <p className="max-w-prose text-[15px] leading-loose whitespace-pre-wrap text-text-secondary">
          {current.text}
        </p>
      </section>
    );
  }

  return (
    <section className="mb-10">
      <div role="tablist" aria-label="เกี่ยวกับเรื่องนี้" className="flex gap-1 border-b border-hairline">
        {panels.map((panel) => {
          const selected = panel.key === current.key;
          return (
            <button
              key={panel.key}
              type="button"
              role="tab"
              id={`${id}-tab-${panel.key}`}
              aria-selected={selected}
              aria-controls={`${id}-panel-${panel.key}`}
              onClick={() => setActive(panel.key)}
              className={`-mb-px border-b-2 px-3.5 py-2 text-sm ${
                selected
                  ? "border-primary font-medium text-primary"
                  : "border-transparent text-text-secondary hover:text-text"
              }`}
            >
              {panel.label}
            </button>
          );
        })}
      </div>

      {/* Every panel is RENDERED and the inactive ones are hidden, so the text
          is in the HTML for search engines and for a reader whose JavaScript
          never arrives. */}
      {panels.map((panel) => (
        <div
          key={panel.key}
          role="tabpanel"
          id={`${id}-panel-${panel.key}`}
          aria-labelledby={`${id}-tab-${panel.key}`}
          hidden={panel.key !== current.key}
          className="pt-4"
        >
          <p className="max-w-prose text-[15px] leading-loose whitespace-pre-wrap text-text-secondary">
            {panel.text}
          </p>
        </div>
      ))}
    </section>
  );
}
