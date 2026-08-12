"use client";

import { useState } from "react";
import ContextMenu, { ContextMenuItem, ContextMenuSeparator, useContextMenu } from "./ContextMenu";
import DefinitionDialog from "./DefinitionDialog";
import { hasMetricDefinition } from "@/lib/definitions";
import { explainAttrs } from "./ExplainMode";

const TONE = {
  positive: "bg-success-soft text-success",
  negative: "bg-destructive-soft text-destructive",
  warning: "bg-accent-soft text-accent",
  info: "bg-primary-soft text-primary",
  neutral: "bg-muted text-muted-foreground",
};

// Every metric card on every page answers "what is this and how was it worked
// out" on right-click. The explanation is looked up by `label`, so the eight
// pages that render this component needed no changes at all — and a card whose
// label has no recorded definition says so rather than inventing one.
//
// The hover "i" exists because a right-click menu nobody knows about is the
// same as no menu. It is the affordance; the right-click is the shortcut.
export default function Metric({ label, value, change, tone = "neutral", sub }) {
  const menu = useContextMenu();
  const [info, setInfo] = useState(false);
  const documented = hasMetricDefinition(label);

  return (
    <>
      <div className="gcard group relative p-4" {...menu.triggerProps} {...explainAttrs(label)}>
        <button
          type="button"
          aria-label={`What is ${label}?`}
          title={`What is ${label}?`}
          onClick={() => setInfo(true)}
          className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full text-[11px] font-medium text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        >
          i
        </button>

        <div className="pr-6 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-normal text-foreground">{value}</div>
        {change ? (
          <div className="mt-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${TONE[tone] || TONE.neutral}`}>
              {change}
            </span>
          </div>
        ) : null}
        {sub ? <div className="mt-2 text-xs text-muted-foreground">{sub}</div> : null}
      </div>

      {menu.at ? (
        <ContextMenu x={menu.at.x} y={menu.at.y} onClose={menu.close}>
          <ContextMenuItem
            onClick={() => {
              setInfo(true);
              menu.close();
            }}
          >
            What is “{label}”?
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              setInfo(true);
              menu.close();
            }}
            hint={documented ? "" : "not recorded"}
          >
            How it&apos;s calculated
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => {
              // The displayed string, not the underlying float — what someone
              // pastes into a message should be what they were looking at.
              navigator.clipboard?.writeText(`${label}: ${value}`);
              menu.close();
            }}
          >
            Copy value
          </ContextMenuItem>
        </ContextMenu>
      ) : null}

      <DefinitionDialog open={info} label={label} value={value} onClose={() => setInfo(false)} />
    </>
  );
}
