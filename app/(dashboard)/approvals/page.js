"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import TopNav from "@/components/layout/TopNav";
import ApprovalDialog from "@/components/ui/ApprovalDialog";
import NoDataPanel from "@/components/ui/NoDataPanel";

// §22 (P5.2). Where a decision waits for a second pair of eyes.
//
// ApprovalDialog has existed in this codebase since the first week, imported
// by nothing. It is wired here, to real ApprovalRequest rows, and the dialog
// shows the evidence that was CAPTURED WHEN THE REQUEST WAS RAISED rather than
// re-reading it now — a figure that moved between the request and the review
// would otherwise be approved on the strength of a number nobody saw.
//
// Three things this page is careful about:
//
//   It never offers a button someone cannot use. The server says which role a
//   request needs and who raised it; a request you cannot act on renders with
//   the reason, not with a control that 403s.
//
//   "Prepared by AI" is on the card, not in a tooltip. A reviewer signing off
//   on a model's draft is entitled to know that before they sign.
//
//   An expired request is shown as expired, not hidden. Silence is how a
//   process failure looks identical to nothing having been asked.

const STATUS_TABS = ["PENDING", "APPROVED", "REJECTED", "EXPIRED", "ALL"];

const RISK_TONE = {
  HIGH: "bg-destructive-soft text-destructive",
  MEDIUM: "bg-accent-soft text-accent",
  LOW: "bg-muted text-muted-foreground",
};

const ACTION_LABEL = {
  RECONCILIATION_WRITE_OFF: "Write-off",
  COST_RESTAMP: "Cost restamp",
  EXTERNAL_MESSAGE: "Message leaving the company",
  OTHER: "Other",
};

function whenLeft(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "lapsed";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "lapses within the hour";
  if (hours < 24) return `lapses in ${hours}h`;
  return `lapses in ${Math.floor(hours / 24)}d`;
}

export default function ApprovalsPage() {
  const { getToken } = useAuth();
  const api = process.env.NEXT_PUBLIC_API_URL;

  const [tab, setTab] = useState("PENDING");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [error, setError] = useState(null);
  const [deciding, setDeciding] = useState(false);

  const load = useCallback(
    async (status) => {
      setLoading(true);
      setFailed(false);
      try {
        const res = await fetch(`${api}/approvals?status=${status}`, {
          headers: { Authorization: `Bearer ${await getToken()}` },
        });
        if (!res.ok) {
          setFailed(true);
          return;
        }
        setData(await res.json());
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
      }
    },
    [api, getToken]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await load(tab);
    })();
    return () => {
      cancelled = true;
    };
  }, [load, tab]);

  async function decide(id, decision) {
    setDeciding(true);
    setError(null);
    try {
      const res = await fetch(`${api}/approvals/${id}/decide`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        // The server's own message. "You cannot approve your own request" and
        // "this request lapsed on the 9th" are different problems, and a
        // generic failure would hide which.
        setError(body?.message ?? `Could not record that decision (HTTP ${res.status}).`);
        return;
      }
      setDialog(null);
      await load(tab);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setDeciding(false);
    }
  }

  const approvals = data?.approvals ?? [];

  // Everything the reviewer needs, from the request itself.
  function rowsFor(a) {
    const rows = [
      { label: "Action", value: ACTION_LABEL[a.actionType] ?? a.actionType },
      { label: "Risk", value: a.riskLevel },
      ...(a.amountLabel ? [{ label: "Amount", value: a.amountLabel }] : []),
      { label: "Raised by", value: a.preparedByAi ? "AI, submitted by a person" : a.requestedBy },
      { label: "Needs", value: `${a.requiredRole} or above` },
      { label: "Deadline", value: whenLeft(a.expiresAt) },
    ];
    for (const [k, v] of Object.entries(a.evidence ?? {})) {
      if (v === null || typeof v === "object") continue;
      rows.push({ label: k, value: String(v) });
    }
    rows.push({ label: "Reason given", value: a.reason, block: true });
    return rows;
  }

  return (
    <>
      <TopNav
        title="Approvals"
        subtitle={
          data
            ? `Anything at or above ${data.thresholdLabel} needs a second pair of eyes`
            : "Decisions waiting for a second pair of eyes"
        }
      />

      <div className="flex flex-col gap-5">
        {error ? (
          <div className="rounded-md bg-destructive-soft px-3 py-2.5 text-[13px] text-destructive" role="alert">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-1.5">
          {STATUS_TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`cursor-pointer rounded-md border px-2.5 py-1 text-[12.5px] transition-colors ${
                t === tab ? "border-primary bg-primary-soft text-primary" : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {t === "ALL" ? "All" : t.charAt(0) + t.slice(1).toLowerCase()}
              {t === "PENDING" && data?.pendingCount ? ` (${data.pendingCount})` : ""}
            </button>
          ))}
        </div>

        {failed ? (
          <NoDataPanel
            tone="error"
            title="Could not reach the server"
            reason="The approval queue could not be loaded. This is a connection failure, not an empty queue — do not read it as nothing needing attention."
          />
        ) : loading ? (
          <div className="gcard h-28 animate-pulse p-5" role="status" aria-busy="true">
            <span className="sr-only">Loading approvals</span>
          </div>
        ) : approvals.length === 0 ? (
          <NoDataPanel
            title={tab === "PENDING" ? "Nothing waiting" : "Nothing here"}
            reason={
              tab === "PENDING"
                ? `No action has crossed the ${data?.thresholdLabel ?? "materiality"} threshold. Smaller write-offs happen directly — requiring sign-off on every one is how approvals become a reflex click.`
                : "No requests with this status."
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            {approvals.map((a) => {
              const isYours = a.requestedBy === data?.yourUserId || a.preparedBy === data?.yourUserId;
              const canAct = a.status === "PENDING" && !isYours;
              return (
                <div key={a.id} className="gcard p-5">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={`rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] ${RISK_TONE[a.riskLevel]}`}>
                      {a.riskLevel} risk
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
                      {ACTION_LABEL[a.actionType] ?? a.actionType}
                    </span>
                    {a.preparedByAi ? (
                      <span className="rounded-sm bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-primary">
                        Prepared by AI
                      </span>
                    ) : null}
                    {a.status !== "PENDING" ? (
                      <span className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground">{a.status}</span>
                    ) : null}
                  </div>

                  <div className="text-[15px] font-medium text-foreground">{a.title}</div>
                  {a.amountLabel ? <div className="mt-0.5 text-[19px] font-medium text-foreground">{a.amountLabel}</div> : null}
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{a.reason}</p>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                    <div className="text-[11.5px] text-muted-foreground">
                      Needs {a.requiredRole} or above ·{" "}
                      {a.status === "PENDING" ? whenLeft(a.expiresAt) : `${a.status.toLowerCase()}${a.decidedBy ? ` by ${a.decidedBy}` : ""}`}
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" className="btn btn-secondary" onClick={() => setDialog(a)}>
                        Review
                      </button>
                      {canAct ? null : a.status === "PENDING" ? (
                        <span className="text-[11.5px] text-muted-foreground">
                          {isYours ? "You raised this — someone else must decide it." : ""}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ApprovalDialog
        open={dialog !== null}
        title={dialog?.title ?? "Approve"}
        description={
          dialog?.status === "PENDING"
            ? "These figures were captured when the request was raised — they are what you are signing off on, not what the data says right now."
            : `This request is already ${dialog?.status?.toLowerCase() ?? "decided"}.`
        }
        rows={dialog ? rowsFor(dialog) : []}
        onClose={() => setDialog(null)}
        onApprove={
          dialog && dialog.status === "PENDING" && dialog.requestedBy !== data?.yourUserId && !deciding
            ? () => decide(dialog.id, "APPROVED")
            : undefined
        }
        onReject={
          dialog && dialog.status === "PENDING" && dialog.requestedBy !== data?.yourUserId && !deciding
            ? () => decide(dialog.id, "REJECTED")
            : undefined
        }
      />
    </>
  );
}
