"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useRef, useState } from "react";
import TopNav from "@/components/layout/TopNav";
import AIAnswerCard from "@/components/cards/AIAnswerCard";
import EvidenceDrawer from "@/components/ui/EvidenceDrawer";
import NoDataPanel from "@/components/ui/NoDataPanel";

// P4.4. The AI CFO workspace, wired to POST /ai/ask.
//
// What this page replaced is worth stating, because the rule it broke is the
// one this whole product rests on: it answered EVERY question with the same
// canned block — "Contribution margin fell 2.1pp to 33.8% in July, driven by a
// spike in RTO cost on Amazon" — with fabricated figures, fabricated drivers,
// and a fabricated "Answered in 2.1s · Sources: Shopify, Amazon, Razorpay".
// Typing a different question swapped the heading and kept the numbers.
//
// Three properties this version has instead:
//
//   Every figure names its tool. The backend validates the §19 contract before
//   storing, and each keyFigure carries the tool that produced it. Clicking one
//   opens the evidence for that metric.
//
//   Suggested questions are filtered by what is actually connected. Offering
//   "why did Google Ads spend rise" to an org with no Google Ads connection
//   teaches someone the product knows things it does not.
//
//   Unconfigured is stated, not simulated. With no ANTHROPIC_API_KEY the
//   server says so and this page says so — it does not fall back to a
//   template.

const MAX_QUESTION = 1000;

// Each candidate names the providers whose data it needs. A question is only
// offered when at least one of them is an ACTIVE connection — `null` means the
// question is answerable from data that is already in the system regardless of
// what is connected now (reconciliation legs, anomalies, freshness itself).
const CANDIDATE_QUESTIONS = [
  { q: "How much net revenue did we make this month, and how does it compare with last month?", needs: ["SHOPIFY", "AMAZON", "FLIPKART"] },
  { q: "What is our contribution margin right now, and which layer is eating it?", needs: ["SHOPIFY", "AMAZON", "FLIPKART"] },
  { q: "Which products lose money on every order?", needs: ["SHOPIFY", "AMAZON", "FLIPKART"] },
  { q: "How much cash do we have, and how long does it last at the current burn?", needs: ["BANK", "BANK_AA"] },
  { q: "What did actually land in the bank this month versus what we billed?", needs: ["BANK", "BANK_AA"] },
  { q: "How much money is Razorpay still holding that has not been paid out?", needs: ["RAZORPAY", "GOKWIK"] },
  { q: "Where is my COD cash sitting right now?", needs: ["SHIPROCKET", "DELHIVERY", "BLUEDART", "CLICKPOST"] },
  { q: "What is driving the RTO rate, and what is it costing us?", needs: ["SHIPROCKET", "DELHIVERY", "BLUEDART", "CLICKPOST"] },
  { q: "Is ad spend still paying for itself?", needs: ["META_ADS", "GOOGLE_ADS"] },
  { q: "How much did we refund this month, and through which gateway?", needs: ["SHOPIFY", "RAZORPAY", "GOKWIK"] },
  { q: "What is anomalous about the business right now?", needs: null },
  { q: "Which reconciliation legs cannot run, and what is missing?", needs: null },
  { q: "Which of my data sources are stale, and what does that make unreliable?", needs: null },
];

function suggestionsFor(freshness) {
  if (!freshness?.sources) return [];
  const active = new Set(freshness.sources.filter((s) => s.status === "ACTIVE").map((s) => s.provider));
  return CANDIDATE_QUESTIONS.filter((c) => c.needs === null || c.needs.some((p) => active.has(p))).map((c) => c.q);
}

function ThinkingCard() {
  return (
    <div className="gcard flex flex-col gap-3 p-5" role="status" aria-busy="true">
      <span className="sr-only">Working out the answer</span>
      <div className="h-3 w-24 animate-pulse rounded-sm bg-primary/10" />
      <div className="h-4 w-4/5 animate-pulse rounded-sm bg-primary/10" />
      <div className="h-4 w-3/5 animate-pulse rounded-sm bg-primary/10" />
      <div className="mt-1 h-14 w-full animate-pulse rounded-md bg-primary/10" />
    </div>
  );
}

function ToolTrail({ calls }) {
  if (!calls?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Tools run</span>
      {calls.map((c, i) => (
        <span
          key={i}
          className={`rounded-sm px-1.5 py-0.5 font-mono text-[10.5px] ${
            c.ok ? "bg-muted text-muted-foreground" : "bg-destructive-soft text-destructive"
          }`}
          title={c.ok ? `${c.durationMs}ms` : "failed"}
        >
          {c.name ?? c.toolName}
        </span>
      ))}
    </div>
  );
}

export default function AICfoPage() {
  const { getToken } = useAuth();
  const api = process.env.NEXT_PUBLIC_API_URL;

  const [status, setStatus] = useState(null); // { configured, note }
  const [statusFailed, setStatusFailed] = useState(false);
  const [freshness, setFreshness] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [turns, setTurns] = useState([]); // { question, result }
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [evidence, setEvidence] = useState(null);

  const bottomRef = useRef(null);

  const authed = useCallback(async () => ({ headers: { Authorization: `Bearer ${await getToken()}` } }), [getToken]);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch(`${api}/ai/conversations`, await authed());
      if (!res.ok) return;
      const body = await res.json();
      setConversations(body.conversations ?? []);
    } catch {
      /* the list is navigation, not content — a failure here must not blank the page */
    }
  }, [api, authed]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const opts = await authed();
        const [statusRes, freshRes] = await Promise.all([
          fetch(`${api}/ai/status`, opts),
          fetch(`${api}/metrics/freshness`, opts),
        ]);
        if (cancelled) return;
        if (statusRes.ok) setStatus(await statusRes.json());
        else setStatusFailed(true);
        if (freshRes.ok) setFreshness(await freshRes.json());
      } catch {
        if (!cancelled) setStatusFailed(true);
      }
      // Inside the async body, not beside it: React 19's lint rejects a
      // setState-triggering call made synchronously in an effect, and the
      // list is navigation chrome that can arrive after the status does.
      if (!cancelled) await loadConversations();
    })();
    return () => {
      cancelled = true;
    };
  }, [api, authed, loadConversations]);

  // Rebuild a stored thread into the same {question, result} pairs a live ask
  // produces, so one renderer serves both and a reloaded answer cannot look
  // different from the one that was just given.
  const openConversation = useCallback(
    async (id) => {
      setActiveId(id);
      setTurns([]);
      setAskError(null);
      setThreadLoading(true);
      try {
        const res = await fetch(`${api}/ai/conversations/${id}`, await authed());
        if (!res.ok) {
          setAskError("That conversation could not be loaded.");
          return;
        }
        const body = await res.json();
        const rebuilt = [];
        let pending = null;
        for (const m of body.messages ?? []) {
          if (m.role === "USER") pending = m.content;
          else if (m.role === "ASSISTANT" && m.structured) {
            rebuilt.push({
              question: pending ?? "",
              result: { answer: m.structured, status: "COMPLETED", toolCalls: [], toolEvidence: {}, verification: null },
            });
            pending = null;
          }
        }
        // Attach the tool trail from the run that produced each answer.
        const runs = body.runs ?? [];
        rebuilt.forEach((t, i) => {
          const run = runs[i];
          if (!run) return;
          t.result.toolCalls = run.toolCalls ?? [];
          t.result.toolEvidence = run.toolEvidence ?? {};
          // The unverified-figure marks travel with the stored answer, so a
          // thread re-opened next month carries the same caveat it was given.
          t.result.verification = run.verification ?? null;
        });
        setTurns(rebuilt);
      } catch {
        setAskError("That conversation could not be loaded.");
      } finally {
        setThreadLoading(false);
      }
    },
    [api, authed]
  );

  const ask = useCallback(
    async (text) => {
      const q = text.trim();
      if (q.length < 3 || asking) return;
      setAsking(true);
      setAskError(null);
      setQuestion("");
      try {
        const res = await fetch(`${api}/ai/ask`, {
          method: "POST",
          headers: { ...(await authed()).headers, "Content-Type": "application/json" },
          body: JSON.stringify({ question: q, ...(activeId ? { conversationId: activeId } : {}) }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setAskError(body?.message ?? `The question could not be answered (HTTP ${res.status}).`);
          return;
        }
        setTurns((prev) => [...prev, { question: q, result: body }]);
        if (body.conversationId && body.conversationId !== activeId) setActiveId(body.conversationId);
        loadConversations();
      } catch {
        setAskError("Could not reach the server.");
      } finally {
        setAsking(false);
      }
    },
    [api, authed, activeId, asking, loadConversations]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, asking]);

  // Opening the workings for one figure. The §21 envelope is an API resource
  // behind a bearer token, so it is fetched and shown here rather than linked.
  const openEvidence = useCallback(
    async (figure) => {
      const ref = figure.evidenceRef ?? null;
      if (!ref || !ref.startsWith("/evidence/")) {
        // No envelope exists for this metric. Say which tool produced the
        // figure rather than opening an empty drawer.
        setEvidence({
          title: figure.label || "Figure",
          sourceLabel: `Produced by ${figure.source}`,
          rows: [
            { label: "Value", value: figure.value },
            { label: "Tool", value: figure.source },
            {
              label: "Workings",
              block: true,
              value:
                "This metric has no §21 evidence envelope yet — the five material metrics (revenue, contribution margin, product profitability, cash received, cash forecast) do. The figure still came from the tool named above, which reads the same calculation the dashboard shows.",
            },
          ],
        });
        return;
      }
      setEvidence({ title: figure.label || "Workings", sourceLabel: "Loading…", rows: [] });
      try {
        const res = await fetch(`${api}${ref}`, await authed());
        if (!res.ok) {
          setEvidence({ title: figure.label || "Workings", sourceLabel: "Unavailable", rows: [{ label: "Error", value: `HTTP ${res.status}`, block: true }] });
          return;
        }
        const e = await res.json();
        setEvidence({
          title: figure.label || e.metric,
          sourceLabel: `${e.formula ? "Formula " : ""}${e.formulaVersion ?? ""}`.trim(),
          rows: [
            ...(figure.value ? [{ label: "Figure in the answer", value: figure.value }] : []),
            { label: "Definition", value: e.definition, block: true },
            { label: "Formula", value: e.formula, block: true },
            { label: "Period", value: `${e.period?.from?.slice(0, 10)} → ${e.period?.to?.slice(0, 10)}` },
            { label: "Rows behind it", value: String(e.transactionCount ?? 0) },
            { label: "Completeness", value: e.completeness ?? "—", block: true },
            { label: "Reconciliation", value: e.reconciliationStatus?.status ?? "—" },
            ...(e.reconciliationStatus?.reasons ?? []).map((r) => ({ label: "", value: r, block: true })),
            ...(e.sources ?? []).map((s) => ({ label: s.label, value: s.detail })),
            ...(e.warnings ?? []).map((w) => ({ label: "Warning", value: w, block: true })),
          ],
        });
      } catch {
        setEvidence({ title: figure.label || "Workings", sourceLabel: "Unavailable", rows: [{ label: "Error", value: "Could not reach the server.", block: true }] });
      }
    },
    [api, authed]
  );

  const suggestions = suggestionsFor(freshness);
  const configured = status?.configured === true;

  return (
    <>
      <TopNav
        title="AI CFO"
        subtitle="Ask about your numbers — every figure names the tool that produced it"
        actions={
          turns.length > 0 || activeId ? (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setActiveId(null);
                setTurns([]);
                setAskError(null);
              }}
            >
              New conversation
            </button>
          ) : null
        }
      />

      <div className="grid gap-5" style={{ gridTemplateColumns: "minmax(0, 1fr) 240px" }}>
        <div className="flex min-w-0 flex-col gap-4">
          {statusFailed ? (
            <NoDataPanel
              tone="error"
              title="Could not reach the server"
              reason="The AI CFO status endpoint did not respond, so this page cannot tell you whether questions can be answered right now."
            />
          ) : status === null ? (
            <div className="gcard h-24 animate-pulse p-5" role="status" aria-busy="true">
              <span className="sr-only">Checking whether the AI CFO is configured</span>
            </div>
          ) : !configured ? (
            <NoDataPanel
              title="Not configured on this server"
              reason={
                status.note ??
                "The AI CFO needs an Anthropic API key on the backend. Until one is set, questions cannot be answered — and rather than return a plausible-looking answer about your business, it returns nothing."
              }
              action="Every figure it would quote is on the dashboard today"
              href="/"
            />
          ) : null}

          {threadLoading ? <ThinkingCard /> : null}

          {turns.map((t, i) => (
            <div key={i} className="flex flex-col gap-2">
              <AIAnswerCard
                question={t.question}
                answer={t.result.answer?.directAnswer ?? ""}
                figures={(t.result.answer?.keyFigures ?? []).map((f) => ({
                  ...f,
                  // toolEvidence is what the tools in THIS run actually
                  // returned, so a figure's source maps to a destination that
                  // really exists. Picking the first ref out of the answer's
                  // own evidence[] instead would attach revenue's workings to
                  // a COD figure whenever an answer used more than one tool.
                  evidenceRef: t.result.toolEvidence?.[f.source] ?? null,
                }))}
                drivers={t.result.answer?.drivers ?? []}
                warnings={t.result.answer?.warnings ?? []}
                evidence={t.result.answer?.evidence ?? []}
                dataStatus={t.result.answer?.dataStatus ?? ""}
                recommendedAction={t.result.answer?.recommendedAction ?? null}
                unsupportedFigures={t.result.verification?.unsupportedFigures ?? []}
                onEvidence={openEvidence}
              />
              <ToolTrail calls={t.result.toolCalls} />
              {t.result.status === "EXHAUSTED" ? (
                <div className="rounded-md bg-accent-soft px-3 py-2 text-[13px] text-accent">
                  The question needed more steps than one run allows. What is above is what it had worked out — ask a
                  narrower version to get the rest.
                </div>
              ) : null}
              {t.result.status === "FAILED" ? (
                <div className="rounded-md bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
                  That run failed{t.result.error ? `: ${t.result.error}` : "."} Nothing was answered — no figure above is
                  a guess at what it would have said.
                </div>
              ) : null}
            </div>
          ))}

          {asking ? <ThinkingCard /> : null}

          {askError ? (
            <div className="rounded-md bg-destructive-soft px-3 py-2.5 text-[13px] text-destructive">{askError}</div>
          ) : null}

          {configured && turns.length === 0 && !asking && !threadLoading && suggestions.length > 0 ? (
            <div className="gcard p-5">
              <div className="mb-1 text-base font-medium text-foreground">Questions your data can answer</div>
              <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
                Filtered by what is actually connected — a question about a source you have not connected is not
                offered, because being asked it implies the answer exists.
              </p>
              <div className="flex flex-col gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s)}
                    className="cursor-pointer rounded-md border border-border bg-transparent px-3 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-muted"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {configured && suggestions.length === 0 && freshness !== null && turns.length === 0 ? (
            <NoDataPanel
              title="No sources connected"
              reason="With nothing connected there is no data to ask about, so no suggested questions are offered. Connect a store, gateway or bank first."
              action="Connect a source"
              href="/connections"
            />
          ) : null}

          <div ref={bottomRef} />

          <form
            className="sticky bottom-0 flex gap-2 bg-background pb-1 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
          >
            <input
              className="input flex-1"
              placeholder={configured ? "Ask about revenue, margin, cash, COD, refunds…" : "Unavailable until the server is configured"}
              value={question}
              maxLength={MAX_QUESTION}
              disabled={!configured || asking}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <button type="submit" className="btn btn-primary" disabled={!configured || asking || question.trim().length < 3}>
              {asking ? "Working…" : "Ask"}
            </button>
          </form>
        </div>

        <aside className="flex flex-col gap-2">
          <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Conversations</div>
          {conversations.length === 0 ? (
            <div className="text-[12.5px] text-muted-foreground">Nothing asked yet.</div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => openConversation(c.id)}
                className={`cursor-pointer rounded-md border px-2.5 py-2 text-left text-[12.5px] transition-colors ${
                  c.id === activeId ? "border-primary bg-primary-soft text-primary" : "border-border text-foreground hover:bg-muted"
                }`}
              >
                <div className="line-clamp-2">{c.title || "Untitled"}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {c.messageCount} message{c.messageCount === 1 ? "" : "s"}
                </div>
              </button>
            ))
          )}
        </aside>
      </div>

      <EvidenceDrawer
        open={evidence !== null}
        title={evidence?.title ?? "Evidence"}
        sourceLabel={evidence?.sourceLabel ?? ""}
        rows={evidence?.rows ?? []}
        onClose={() => setEvidence(null)}
      />
    </>
  );
}
