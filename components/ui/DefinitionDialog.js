"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { getDefinition } from "@/lib/definitions";

// "What is this and how was it worked out" for any calculated thing on screen —
// a metric card, a chart, a table column, a reconciliation status, a rung of the
// revenue ladder.
//
// The definition is looked up from lib/definitions.js, which is transcribed
// from the backend module that computes the number. When there is no entry,
// this says so plainly instead of generating an explanation — a paragraph
// describing how a figure was calculated is unfalsifiable by looking at it, so
// an invented one would simply be believed.

function Section({ title, children }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="mt-1.5 text-[13px] leading-relaxed text-foreground">{children}</div>
    </div>
  );
}

export default function DefinitionDialog({ open, term, label, value, onClose }) {
  const def = getDefinition(term ?? label);
  // The registry may carry a fuller name than the label on screen ("CM3" on a
  // table header, "CM3 — after advertising" in the dialog).
  const heading = def?.title ?? label ?? term;

  return (
    <Dialog.Root open={!!open} onOpenChange={(next) => !next && onClose?.()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50"
          style={{ background: "var(--color-scrim)" }}
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-card shadow-raised outline-none"
        >
          <div className="flex items-start justify-between gap-3 border-b border-border p-5">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-medium text-foreground">{heading}</Dialog.Title>
              {value && value !== "—" ? (
                <div className="mt-1 text-[22px] leading-none tracking-tight text-foreground">{value}</div>
              ) : null}
              {def?.spec ? (
                <div className="mt-2 inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  Finance engine {def.spec}
                </div>
              ) : null}
            </div>
            <Dialog.Close asChild>
              <button
                className="h-[30px] w-[30px] flex-none rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                ✕
              </button>
            </Dialog.Close>
          </div>

          <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
            {def === null ? (
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                No definition has been recorded for this metric yet. Rather than describe how it might be
                calculated, this says nothing — an explanation of a formula can&apos;t be checked by looking at it,
                so a guess here would be indistinguishable from the real thing.
              </p>
            ) : (
              <>
                <Section title="What this is">{def.what}</Section>

                <Section title="How it&apos;s calculated">
                  <code className="block rounded-lg border border-border bg-muted/50 px-3 py-2.5 font-mono text-[12px] leading-relaxed text-foreground">
                    {def.formula}
                  </code>
                  <p className="mt-2 text-[12px] text-muted-foreground">
                    Computed in the backend calc engine, never by the AI layer. Money is held as integer paise
                    throughout and only converted to rupees for display.
                  </p>
                </Section>

                {def.excludes ? <Section title="What it excludes">{def.excludes}</Section> : null}

                <Section title="What it needs to be real">
                  <ul className="flex list-disc flex-col gap-1 pl-5">
                    {def.sources.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </Section>

                {def.caveat ? (
                  <div
                    className="rounded-lg border px-3.5 py-3 text-[13px] leading-relaxed"
                    style={{
                      borderColor: "var(--color-accent)",
                      background: "var(--color-accent-soft)",
                      color: "var(--color-foreground)",
                    }}
                  >
                    <div className="mb-1 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-accent)" }}>
                      Worth knowing before you act on this
                    </div>
                    {def.caveat}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
