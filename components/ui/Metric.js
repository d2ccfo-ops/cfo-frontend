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
// `onClick` makes the whole card a control, and it exists so call sites do not
// have to wrap this component in a <button> to achieve that. Inventory did
// exactly that, which nested a button inside the "i" button below — invalid
// HTML that browsers resolve by closing the outer button early, so React's tree
// and the parsed DOM disagreed and the page hydrated with an error.
//
// The click target is an overlay sibling rather than a wrapper: an absolutely
// positioned button covering the card, sitting above the content but below the
// "i", so both controls stay reachable by mouse and keyboard and neither
// contains the other.
export default function Metric({ label, value, change, tone = "neutral", sub, badge = null, onClick = null, actionLabel = null }) {
  const menu = useContextMenu();
  const [info, setInfo] = useState(false);
  const documented = hasMetricDefinition(label);

  return (
    <>
      <div className="gcard group relative p-5" {...menu.triggerProps} {...explainAttrs(label)}>
        {onClick ? (
          <button
            type="button"
            onClick={onClick}
            aria-label={actionLabel ?? label}
            title={actionLabel ?? undefined}
            className="absolute inset-0 z-10 cursor-pointer rounded-[inherit] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          />
        ) : null}
        <button
          type="button"
          aria-label={`What is ${label}?`}
          title={`What is ${label}?`}
          onClick={() => setInfo(true)}
          className="absolute right-2 top-2 z-20 grid h-6 w-6 place-items-center rounded-full text-[11px] font-medium text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        >
          i
        </button>

        {/* The §28 status pill rides beside the label, not inside `change` —
            change is a movement claim, this is a trust claim, and merging the
            two would let a green +12% wash out an amber ESTIMATED. */}
        <div className="flex items-start justify-between gap-2 pr-6">
          <div className="text-[13px] font-medium text-muted-foreground">{label}</div>
          {badge}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {/* Scales down below sm, and the reason is `whitespace-nowrap`: the
              figure cannot wrap — deliberately, since a rupee amount broken
              across two lines is unreadable — so when it does not fit it pushes
              the card, and the card pushes the document sideways. The widest
              real value measured here is "25,487 / 26,901" on Product costs, at
              172px in a 24px face; 20px brings that under 145px and back inside
              a two-column track. Same responsive-figure pattern as the overview
              hero. */}
          <span className="num whitespace-nowrap text-[20px] font-semibold text-foreground sm:text-[24px]">{value}</span>
          {change ? (
            <span className={`num inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${TONE[tone] || TONE.neutral}`}>
              {change}
            </span>
          ) : null}
        </div>
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
