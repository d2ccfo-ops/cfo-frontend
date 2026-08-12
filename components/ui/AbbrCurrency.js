"use client";

import { useRef, useState } from "react";
import { formatInrFull, formatInrShort } from "@/lib/money";

const HOVER_REVEAL_MS = 2000;

// The formatters used to be defined here, which is how three other files ended
// up with their own divergent copies. They now live in lib/money.js and are
// re-exported so existing importers keep working.
export { formatInrShort, formatInrFull };

// Shows the abbreviated figure; hovering 2s+ reveals the exact rupee amount
// in a tooltip so precision is still one hover away, not lost.
export default function AbbrCurrency({ value, className = "" }) {
  const [showFull, setShowFull] = useState(false);
  const timerRef = useRef(null);

  const short = formatInrShort(value);
  const full = formatInrFull(value);
  // Nothing was hidden, so there is nothing to reveal — below ₹10 lakh the
  // tile already shows the exact figure. Attaching a hover that repeats it
  // just teaches people the tooltip is worthless.
  const isAbbreviated = short !== full && short !== "—";

  const onEnter = () => {
    if (!isAbbreviated) return;
    timerRef.current = setTimeout(() => setShowFull(true), HOVER_REVEAL_MS);
  };
  const onLeave = () => {
    clearTimeout(timerRef.current);
    setShowFull(false);
  };

  return (
    <span className={`relative inline-block cursor-default ${className}`} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      {short}
      {showFull ? (
        <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-popover px-3.5 py-2.5 text-sm font-semibold tabular-nums text-popover-foreground shadow-raised">
          {full}
        </span>
      ) : null}
    </span>
  );
}
