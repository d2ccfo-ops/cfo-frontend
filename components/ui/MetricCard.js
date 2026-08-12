"use client";

import { useState } from "react";
import { Icon, GRIP_PATHS, INFO_PATHS, MORE_VERTICAL_PATHS, TRASH_PATHS } from "@/components/icons";
import StatusBadge from "./StatusBadge";
import ContextMenu, { ContextMenuItem, ContextMenuSeparator, useContextMenu } from "./ContextMenu";
import DefinitionDialog from "./DefinitionDialog";
import { hasMetricDefinition } from "@/lib/definitions";
import { explainAttrs } from "./ExplainMode";

const STATUS_LABEL_MAP = { positive: "On track", negative: "Needs attention", warning: "Watch", neutral: "Steady" };

export default function MetricCard({
  label = "Metric",
  value = "—",
  change = "",
  changeDirection = "flat",
  goodDirection = "up",
  comparison = "vs last period",
  status,
  statusLabel,
  updated = "Updated moments ago",
  onEvidence,
  onInfo,
  onRemove,
  onDragStart,
  onDragEnd,
  onDragOver,
  isDragging = false,
}) {
  const [menu, setMenu] = useState(false);
  // Right-click anywhere on the card, as well as the kebab. The kebab stays
  // because it is the keyboard-reachable path — a right-click menu is a
  // shortcut, never the only way in.
  const ctx = useContextMenu();
  const [explain, setExplain] = useState(false);
  const documented = hasMetricDefinition(label);
  const isGood = changeDirection === "flat" ? true : changeDirection === goodDirection;
  const changeTone = changeDirection === "flat" ? "neutral" : isGood ? "positive" : "negative";
  const changeColorClass =
    changeTone === "neutral" ? "text-muted-foreground" : changeTone === "positive" ? "text-success" : "text-destructive";
  const resolvedStatus = status || (isGood ? "positive" : "negative");
  const resolvedStatusLabel = statusLabel || STATUS_LABEL_MAP[resolvedStatus];
  const reorderable = !!onDragStart;

  return (
    <>
    <div
      data-flip-key={label}
      className={`gcard group relative flex flex-col p-5 ${isDragging ? "opacity-50" : ""}`}
      {...ctx.triggerProps}
      {...explainAttrs(label)}
      onDragOver={
        reorderable
          ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              onDragOver?.();
            }
          : undefined
      }
      onDrop={reorderable ? (e) => e.preventDefault() : undefined}
    >
      {reorderable && (
        <span
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", label);
            onDragStart?.();
          }}
          onDragEnd={() => onDragEnd?.()}
          aria-label={`Drag to reorder ${label}`}
          className="absolute left-0 top-0 grid h-full w-5 cursor-grab place-items-center rounded-l-lg text-muted-foreground opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100 active:cursor-grabbing"
        >
          <Icon paths={GRIP_PATHS} size={14} />
        </span>
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-[13px] font-medium text-muted-foreground">{label}</div>
        {(onInfo || onRemove) && (
          <div className="relative shrink-0">
            <button
              type="button"
              aria-label={`Options for ${label}`}
              onClick={() => setMenu((v) => !v)}
              onBlur={() => window.setTimeout(() => setMenu(false), 120)}
              className="-mr-1 -mt-1 grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Icon paths={MORE_VERTICAL_PATHS} size={16} />
            </button>
            {menu && (
              <div className="absolute right-0 top-8 z-20 w-52 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-raised">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setExplain(true);
                    setMenu(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground hover:bg-muted"
                >
                  <Icon paths={INFO_PATHS} size={14} /> How it&apos;s calculated
                </button>
                {onInfo && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onInfo();
                      setMenu(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground hover:bg-muted"
                  >
                    <Icon paths={INFO_PATHS} size={14} /> Card details
                  </button>
                )}
                {onRemove && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onRemove();
                      setMenu(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-destructive hover:bg-muted"
                  >
                    <Icon paths={TRASH_PATHS} size={14} /> Remove
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-[26px] leading-none tracking-tight text-foreground">{value}</span>
        {change ? <span className={`text-[13px] ${changeColorClass}`}>{change}</span> : null}
      </div>

      {comparison ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{comparison}</p> : null}

      <div className="mt-3 flex items-center gap-2">
        <StatusBadge status={resolvedStatus} label={resolvedStatusLabel} />
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-5">
        <span className="truncate text-xs text-muted-foreground">{updated}</span>
        <button
          className="text-xs font-medium text-primary hover:underline"
          onClick={onEvidence}
          type="button"
        >
          Evidence
        </button>
      </div>
    </div>

    {ctx.at ? (
      <ContextMenu x={ctx.at.x} y={ctx.at.y} onClose={ctx.close}>
        <ContextMenuItem
          onClick={() => {
            setExplain(true);
            ctx.close();
          }}
          hint={documented ? "" : "not recorded"}
        >
          What is “{label}”?
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            setExplain(true);
            ctx.close();
          }}
        >
          How it&apos;s calculated
        </ContextMenuItem>
        {onEvidence ? (
          <ContextMenuItem
            onClick={() => {
              onEvidence();
              ctx.close();
            }}
          >
            Show the evidence
          </ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => {
            navigator.clipboard?.writeText(`${label}: ${value}`);
            ctx.close();
          }}
        >
          Copy value
        </ContextMenuItem>
        {onRemove ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              tone="destructive"
              onClick={() => {
                onRemove();
                ctx.close();
              }}
            >
              Remove from Overview
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenu>
    ) : null}

    <DefinitionDialog open={explain} label={label} value={value} onClose={() => setExplain(false)} />
    </>
  );
}
