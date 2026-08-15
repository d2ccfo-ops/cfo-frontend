"use client";

import * as Dialog from "@radix-ui/react-dialog";

export default function EvidenceDrawer({ open, title = "Evidence", sourceLabel = "", rows = [], onClose, onDownload = null }) {
  return (
    <Dialog.Root open={!!open} onOpenChange={(next) => !next && onClose?.()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50 flex justify-end"
          style={{ background: "var(--color-scrim)" }}
        />
        <Dialog.Content
          className="fixed inset-y-0 right-0 z-50 flex h-full flex-col bg-card shadow-raised outline-none"
          style={{ width: "min(440px, 100%)" }}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border/60 p-5">
            <div>
              <Dialog.Title className="text-lg font-semibold text-foreground">{title}</Dialog.Title>
              <div className="mt-0.5 text-xs text-muted-foreground">{sourceLabel}</div>
            </div>
            <Dialog.Close asChild>
              <button className="grid h-8 w-8 flex-none cursor-pointer place-items-center rounded-full border-none bg-transparent text-sm text-muted-foreground hover:bg-muted" aria-label="Close">
                ✕
              </button>
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            {rows.map((r, i) =>
              // block rows stack label over value — a definition paragraph
              // right-aligned against its label is unreadable.
              r.block ? (
                <div key={i} className="border-b border-border/70 py-2.5 last:border-0">
                  <div className="text-[13px] text-muted-foreground">{r.label}</div>
                  <div className="mt-0.5 text-[13px] leading-relaxed text-foreground">{r.value}</div>
                </div>
              ) : (
                <div key={i} className="flex items-center justify-between gap-3 border-b border-border/70 py-2.5 last:border-0">
                  <span className="text-[13px] text-muted-foreground">{r.label}</span>
                  <span className="text-right text-[13.5px] font-medium text-foreground">{r.value}</span>
                </div>
              )
            )}
          </div>
          <div className="flex gap-2.5 border-t border-border p-4 px-5">
            {onDownload ? (
              <button className="btn btn-secondary btn-block" onClick={onDownload}>
                Download CSV
              </button>
            ) : null}
            <button className="btn btn-secondary btn-block" onClick={onClose}>
              Close
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
