"use client";

import * as Dialog from "@radix-ui/react-dialog";

export default function ApprovalDialog({
  open,
  title = "Approve match",
  description = "Confirm this transaction match before it posts to your ledger.",
  rows = [],
  onClose,
  onApprove = null,
  onReject = null,
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
          {/* Approve and Reject are RENDERED ONLY when a handler exists. A
              button that is present but inert reads as broken, and on a
              screen whose whole purpose is "did someone sign this off", the
              difference between "you cannot" and "it did not work" matters. */}
          <div className="dialog-actions">
            {onReject ? (
              <button className="btn btn-ghost" onClick={onReject} type="button">Reject</button>
            ) : null}
            <Dialog.Close asChild>
              <button className="btn btn-secondary" onClick={onClose} type="button">
                {onApprove || onReject ? "Cancel" : "Close"}
              </button>
            </Dialog.Close>
            {onApprove ? (
              <button className="btn btn-primary" onClick={onApprove} type="button">Approve</button>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
