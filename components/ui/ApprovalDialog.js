"use client";

import * as Dialog from "@radix-ui/react-dialog";

export default function ApprovalDialog({
  open,
  title = "Approve match",
  description = "Confirm this transaction match before it posts to your ledger.",
  rows = [],
  onClose,
  onApprove,
  onReject,
}) {
  return (
    <Dialog.Root open={!!open} onOpenChange={(next) => !next && onClose?.()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-backdrop z-50" />
        <Dialog.Content className="dialog elev-lg z-50 outline-none" style={{ maxWidth: 440 }}>
          <Dialog.Title className="dialog-title">{title}</Dialog.Title>
          <div className="dialog-body">
            <p className="text-[13.5px]">{description}</p>
            <div className="mt-2.5 flex flex-col gap-2">
              {rows.map((r, i) => (
                <div key={i} className="flex justify-between text-[13px]">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className="font-medium text-foreground">{r.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="dialog-actions">
            <button className="btn btn-ghost" onClick={onReject} type="button">Reject</button>
            <Dialog.Close asChild>
              <button className="btn btn-secondary" onClick={onClose} type="button">Cancel</button>
            </Dialog.Close>
            <button className="btn btn-primary" onClick={onApprove} type="button">Approve</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
