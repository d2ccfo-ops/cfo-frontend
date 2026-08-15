"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Icon, CALENDAR_PATHS } from "@/components/icons";
import { PRESETS, useDateRange } from "@/components/controls/DateRangeContext";

// Reads and writes the shared date range (components/controls/DateRangeContext)
// rather than holding its own selection — the pages that fetch metrics need to
// see this, and previously they couldn't: the picker tracked a local useState
// and never called anything, so the label moved and the numbers didn't.
export default function DateRangePicker() {
  const { preset, setPreset, custom, setCustom, range } = useDateRange();
  const [open, setOpen] = useState(false);

  const customIncomplete = preset === "Custom range" && !range;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-[13px] text-foreground">
          <Icon paths={CALENDAR_PATHS} size={15} viewBox="0 0 24 22" strokeWidth={1.6} className="mr-1.5" />
          {preset === "Custom range" && range ? `${range.from} → ${range.to}` : preset}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-10 overflow-hidden rounded-md border border-border bg-card py-1 shadow-raised"
          style={{ minWidth: 200 }}
        >
          {PRESETS.map((label) => (
            <div
              key={label}
              role="button"
              tabIndex={0}
              className={`cursor-pointer px-3.5 py-2.5 text-[13px] ${
                label === preset ? "bg-primary-soft text-primary" : "text-foreground hover:bg-muted"
              }`}
              onClick={() => {
                setPreset(label);
                // Stay open for custom range — the user still has to pick the
                // two dates, and closing would hide the inputs they need.
                if (label !== "Custom range") setOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setPreset(label);
                  if (label !== "Custom range") setOpen(false);
                }
              }}
            >
              {label}
            </div>
          ))}

          {preset === "Custom range" ? (
            <div className="border-t border-border px-3.5 py-3">
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  aria-label="From date"
                  value={custom.from}
                  max={custom.to || undefined}
                  onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                  className="w-full min-w-0 flex-1 rounded-md border border-border bg-card px-2 py-1.5 text-[13px] text-foreground"
                />
                <span className="text-[13px] text-muted-foreground">to</span>
                <input
                  type="date"
                  aria-label="To date"
                  value={custom.to}
                  min={custom.from || undefined}
                  onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                  className="w-full min-w-0 flex-1 rounded-md border border-border bg-card px-2 py-1.5 text-[13px] text-foreground"
                />
              </div>
              {/* Says which period is actually in effect. Without this the
                  trigger would read "Custom range" while the cards quietly
                  showed month-to-date — the same mismatch this whole component
                  was rebuilt to remove. */}
              <p className="mt-2 text-[12px] text-muted-foreground">
                {customIncomplete
                  ? "Pick both dates — showing month to date until then."
                  : "Applied."}
              </p>
            </div>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
