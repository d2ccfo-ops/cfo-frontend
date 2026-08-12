"use client";

import { useState } from "react";
import DefinitionDialog from "./DefinitionDialog";
import ContextMenu, { ContextMenuItem, useContextMenu } from "./ContextMenu";
import { hasDefinition } from "@/lib/definitions";
import { explainAttrs } from "./ExplainMode";

// Makes any piece of on-screen text explain itself: a table column header, a
// status badge, a step of the revenue waterfall, a chart title.
//
// <Explain term="cm0">Contribution</Explain>
//
// The affordance is a dotted underline — quiet enough to sit in a table header
// forty times without turning the page into a field of links, and conventional
// enough to read as "there is a definition here". It is a real <button>, so it
// is reachable by keyboard; right-click works too, for consistency with the
// metric cards.
//
// If the term has no entry in lib/definitions.js, this renders the plain text
// with NO affordance at all rather than a control that opens a dialog saying
// nothing. A promise of an explanation that isn't there is worse than silence.
export default function Explain({ term, children, value, className = "", underline = true }) {
  const [open, setOpen] = useState(false);
  const ctx = useContextMenu();
  const key = term ?? (typeof children === "string" ? children : null);

  if (!hasDefinition(key)) return <span className={className}>{children}</span>;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        {...ctx.triggerProps}
        {...explainAttrs(key)}
        title="What is this, and how is it calculated?"
        className={`cursor-help text-left transition-colors hover:text-foreground ${
          underline ? "underline decoration-dotted decoration-muted-foreground/60 underline-offset-4" : ""
        } ${className}`}
      >
        {children}
      </button>

      {ctx.at ? (
        <ContextMenu x={ctx.at.x} y={ctx.at.y} onClose={ctx.close}>
          <ContextMenuItem
            onClick={() => {
              setOpen(true);
              ctx.close();
            }}
          >
            How it&apos;s calculated
          </ContextMenuItem>
        </ContextMenu>
      ) : null}

      <DefinitionDialog
        open={open}
        term={key}
        label={typeof children === "string" ? children : undefined}
        value={value}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
