"use client";

import * as Dialog from "@radix-ui/react-dialog";

export default function EvidenceDrawer({ open, title = "Evidence", sourceLabel = "", rows = [], onClose }) {
  return (
    <Dialog.Root open={!!open} onOpenChange={(next) => !next && onClose?.()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50 flex justify-end"
          style={{ background: "color-mix(in srgb, var(--color-foreground) 45%, transparent)" }}
        />
        <Dialog.Content
          className="fixed inset-y-0 right-0 z-50 flex h-full flex-col bg-card shadow-raised outline-none"
          style={{ width: "min(420px, 100%)" }}
        >
          <div className="flex items-start justify-between gap-2.5 border-b border-border p-5">
            <div>
              <Dialog.Title className="text-lg font-medium text-foreground">{title}</Dialog.Title>
              <div className="mt-0.5 text-[12.5px] text-muted-foreground">{sourceLabel}</div>
            </div>
            <Dialog.Close asChild>
              <button className="h-[30px] w-[30px] flex-none cursor-pointer rounded-md border-none bg-transparent text-sm text-foreground" aria-label="Close">
                ✕
              </button>
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-2.5 border-b border-border py-2.5 last:border-0">
                <span className="text-[13px] text-muted-foreground">{r.label}</span>
                <span className="text-[13.5px] font-medium text-foreground">{r.value}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-border p-4 px-5">
            <button className="btn btn-secondary btn-block" onClick={onClose}>
              Close
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
