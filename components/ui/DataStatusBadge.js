"use client";

import { useEffect, useRef, useState } from "react";

// §28 honesty label. The backend's dataStatus travels with every material
// figure ({status, reasons[]}); this renders it as a small pill whose click
// opens the reasons. The reasons come from the response, not from
// lib/definitions.js — they are live diagnoses ("741 of 741 costed SKUs carry
// seeded placeholder costs"), not fixed definitions, so Explain's dictionary
// pattern doesn't fit here.
const TONE = {
  estimated: { cls: "bg-accent-soft text-accent", label: "Estimated" },
  provisional: { cls: "bg-primary-soft text-primary", label: "Provisional" },
  reconciled: { cls: "bg-success-soft text-success", label: "Reconciled" },
};

export default function DataStatusBadge({ dataStatus, className = "" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // No status = the payload predates the label or the fetch failed. Rendering
  // nothing is right: a made-up "provisional" would be the exact dishonesty
  // this badge exists to prevent.
  const tone = TONE[dataStatus?.status];
  if (!tone) return null;

  const reasons = dataStatus.reasons ?? [];

  return (
    <span ref={ref} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => reasons.length > 0 && setOpen((v) => !v)}
        title={reasons.length > 0 ? reasons.join(" ") : undefined}
        aria-expanded={open}
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.04em] whitespace-nowrap ${tone.cls} ${
          reasons.length > 0 ? "cursor-help" : "cursor-default"
        }`}
      >
        {tone.label}
      </button>
      {open ? (
        <div
          role="tooltip"
          className="absolute left-0 top-full z-50 mt-1.5 w-72 rounded-lg border border-border bg-popover p-3 text-left shadow-lg"
        >
          <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
            Why {tone.label.toLowerCase()}
          </div>
          <ul className="flex flex-col gap-1.5">
            {reasons.map((r) => (
              <li key={r} className="text-[12px] leading-snug text-foreground">
                {r}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </span>
  );
}
