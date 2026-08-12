"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { formatInr } from "@/lib/money";

// P6.3 — pair an unmatched order to the payment that actually settled it.
//
// WHY A PICKER AND NOT A TEXT FIELD. Typing a payment id would mean the person
// pairing has already found the payment somewhere else, and would let a typo
// attach an order to a stranger's money with no signal that anything was
// wrong. The list is the server's, already filtered to payments nothing else
// has claimed.
//
// WHY THE DIFFERENCE IS ALWAYS SHOWN. The reason a row needs manual pairing is
// usually that the amounts do not agree, and the size of the disagreement is
// the whole basis for deciding whether this is the right payment. A picker
// showing only "₹4,890 · 12 Mar" invites pairing on date proximity alone.

function DiffLabel({ paise }) {
  const n = Number(paise);
  if (n === 0) return <span className="text-[12px] text-muted-foreground">exact match</span>;
  const over = n > 0;
  return (
    <span className="text-[12px]" style={{ color: over ? "var(--color-accent)" : "var(--color-destructive)" }}>
      {over ? "+" : "−"}
      {formatInr(Math.abs(n))} {over ? "more than the order" : "less than the order"}
    </span>
  );
}

export default function PairDialog({ open, row, onClose, onPaired }) {
  const { getToken } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !row?.id) return;
    let cancelled = false;
    // Every setState lives inside the async body. React 19's
    // `react-hooks/set-state-in-effect` rejects a synchronous state-setting
    // call in an effect BODY even when nothing renders between them, and it is
    // right to — the static shape is what makes cascading renders possible.
    (async () => {
      setLoading(true);
      setError(null);
      setData(null);
      setSelected(null);
      setNote("");
      try {
        const token = await getToken();
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/reconciliation/items/${row.id}/pair-candidates`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) throw new Error(`Could not load candidate payments (${res.status})`);
        const body = await res.json();
        if (!cancelled) setData(body);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, row?.id, getToken]);

  async function submit() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/reconciliation/items/${row.id}/pair`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: selected, note: note.trim() || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // The server names the conflicting order when a payment is already
        // claimed. Replacing that with "Failed" would leave someone hunting
        // through the table for which order has it.
        throw new Error(body.message || body.error || `Could not pair (${res.status})`);
      }
      onPaired?.();
      onClose?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => (!v ? onClose?.() : null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog" style={{ maxWidth: 600 }}>
          <Dialog.Title className="text-[15px] font-medium text-foreground">Pair this order to a payment</Dialog.Title>
          <Dialog.Description className="mt-1 text-[12.5px] text-muted-foreground">
            Order {row?.orderNumber ?? row?.id} · {row?.amount != null ? formatInr(Number(row.amount)) : "—"}. This records
            that the money arrived and names which transfer it came in. It does not change revenue or cash received —
            both are already counted from the payment itself.
          </Dialog.Description>

          {loading ? (
            <div className="mt-4 flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ) : null}

          {!loading && data ? (
            <div className="mt-4">
              {data.candidates.length === 0 ? (
                // Says why there is nothing here rather than showing an empty
                // box — "no candidates" and "we did not look properly" are
                // indistinguishable without the window.
                <p className="rounded-md border border-border p-3 text-[12.5px] text-muted-foreground">
                  No unclaimed captured payments within {data.windowDays} days either side of this order. Every payment
                  in that window is already attached to another order.
                </p>
              ) : (
                <>
                  <div className="mb-2 text-[12px] text-muted-foreground">
                    Captured payments within {data.windowDays} days of this order that no other order has claimed
                  </div>
                  <div className="flex max-h-[280px] flex-col gap-1 overflow-y-auto">
                    {data.candidates.map((c) => (
                      <label
                        key={c.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-md border p-2.5 ${
                          selected === c.id ? "border-primary bg-primary-soft" : "border-border hover:bg-muted"
                        }`}
                      >
                        <input
                          type="radio"
                          name="pair-candidate"
                          checked={selected === c.id}
                          onChange={() => setSelected(c.id)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] text-foreground">
                            {formatInr(Number(c.amountPaise))}
                            <span className="ml-2 text-[12px] text-muted-foreground">
                              {c.capturedAt ? new Date(c.capturedAt).toLocaleDateString("en-IN") : "no capture date"}
                              {c.method ? ` · ${c.method}` : ""}
                            </span>
                          </span>
                          <span className="block truncate text-[11.5px] text-muted-foreground">
                            {c.externalPaymentId ?? c.id}
                          </span>
                        </span>
                        <DiffLabel paise={c.differencePaise} />
                      </label>
                    ))}
                  </div>

                  <div className="field mt-3">
                    <label>Why (optional)</label>
                    <input
                      className="input"
                      placeholder="e.g. customer paid for #1042 and #1043 in one transfer"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={500}
                    />
                    <span className="text-[11.5px] text-muted-foreground">
                      Stored on the audit trail. Worth more than the pairing itself in six months.
                    </span>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {error ? (
            <div className="mt-3 text-[12.5px]" style={{ color: "var(--color-destructive)" }}>
              {error}
            </div>
          ) : null}

          <div className="mt-4 flex justify-end gap-2">
            <button className="btn" onClick={() => onClose?.()} disabled={saving}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={submit} disabled={!selected || saving}>
              {saving ? "Pairing…" : "Pair"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
