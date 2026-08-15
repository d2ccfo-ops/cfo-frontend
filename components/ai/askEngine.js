"use client";

import { useAuth } from "@clerk/nextjs";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import AIAnswerCard from "@/components/cards/AIAnswerCard";
import EvidenceDrawer from "@/components/ui/EvidenceDrawer";
import { Icon, CHECK_PATHS, CIRCLE_ALERT_PATHS, SPARKLES_PATHS } from "@/components/icons";

// The AI CFO engine, extracted from app/(dashboard)/ai-cfo/page.js so the full
// page and the ask-anywhere popup run the SAME code rather than two copies.
//
// Why this is a module and not a second implementation inside the overlay: the
// design's overlay (ai-cfo-design/src/components/AskCfoOverlay.tsx) answers
// from a hardcoded LIBRARY of three canned answers, picked with
// `LIBRARY.find(x => q.includes("margin")) ?? A_SALES` on a 2600ms setTimeout.
// That is exactly the fabrication this page was rewritten to remove — a popup
// wired that way would quote invented figures on the overview screen, which is
// the first thing anyone sees. So the popup gets the real orchestrator: the
// same POST /ai/ask/stream, the same measured progress, the same evidence
// envelopes.
//
// It also means the popup and the page share one conversation. Asking in the
// popup and then clicking "Open full AI CFO" continues the thread instead of
// landing on an empty page, which the design's own link cannot do because its
// two surfaces hold separate state.

export const MAX_QUESTION = 1000;

// Each candidate names the providers whose data it needs. A question is only
// offered when at least one of them is an ACTIVE connection — `null` means the
// question is answerable from data that is already in the system regardless of
// what is connected now (reconciliation legs, anomalies, freshness itself).
const CANDIDATE_QUESTIONS = [
  { q: "How much net revenue did we make this month, and how does it compare with last month?", group: "Revenue", needs: ["SHOPIFY", "AMAZON", "FLIPKART"] },
  { q: "What is our contribution margin right now, and which layer is eating it?", group: "Margin & cost", needs: ["SHOPIFY", "AMAZON", "FLIPKART"] },
  { q: "Which products lose money on every order?", group: "Margin & cost", needs: ["SHOPIFY", "AMAZON", "FLIPKART"] },
  { q: "How much cash do we have, and how long does it last at the current burn?", group: "Cash", needs: ["BANK", "BANK_AA"] },
  { q: "What did actually land in the bank this month versus what we billed?", group: "Cash", needs: ["BANK", "BANK_AA"] },
  { q: "How much money is Razorpay still holding that has not been paid out?", group: "Cash", needs: ["RAZORPAY", "GOKWIK"] },
  { q: "Where is my COD cash sitting right now?", group: "Cash", needs: ["SHIPROCKET", "DELHIVERY", "BLUEDART", "CLICKPOST"] },
  { q: "What is driving the RTO rate, and what is it costing us?", group: "Margin & cost", needs: ["SHIPROCKET", "DELHIVERY", "BLUEDART", "CLICKPOST"] },
  { q: "Is ad spend still paying for itself?", group: "Margin & cost", needs: ["META_ADS", "GOOGLE_ADS"] },
  { q: "How much did we refund this month, and through which gateway?", group: "Revenue", needs: ["SHOPIFY", "RAZORPAY", "GOKWIK"] },
  { q: "What is anomalous about the business right now?", group: "Data health", needs: null },
  { q: "Which reconciliation legs cannot run, and what is missing?", group: "Data health", needs: null },
  { q: "Which of my data sources are stale, and what does that make unreliable?", group: "Data health", needs: null },
];

function suggestionsFor(freshness) {
  if (!freshness?.sources) return [];
  const active = new Set(freshness.sources.filter((s) => s.status === "ACTIVE").map((s) => s.provider));
  return CANDIDATE_QUESTIONS.filter((c) => c.needs === null || c.needs.some((p) => active.has(p)));
}

// Which tool's hero figure can carry a sparkline, and which nightly snapshot
// series (§P5.2) is that context. ONLY tools whose enriched delta describes a
// single metric are listed: get_sales_summary is deliberately absent because
// it measures gross sales, AOV, discount and refund rates side by side, and
// this map cannot know which of them the hero figure is — a gross-sales line
// under an AOV figure would be a real series shown against the wrong number.
const TOOL_SNAPSHOT = {
  get_revenue_summary: { key: "net_revenue_day", caption: "net revenue · daily" },
  get_cash_received: { key: "cash_received_day", caption: "cash received · daily" },
  get_available_cash: { key: "available_cash", caption: "available cash · nightly" },
  get_ad_spend_analysis: { key: "ad_spend_day", caption: "ad spend · daily" },
  get_rto_analysis: { key: "rto_rate_28d", caption: "28-day RTO rate · nightly" },
};

// SSE framing, parsed the only way that is safe: buffer, then split on the
// blank line.
//
// A chunk boundary falls wherever the network puts it — including the middle
// of a JSON string in a long answer — so parsing each chunk as it lands throws
// intermittently, on exactly the big answers that most need to arrive.
// encodeSseFrame separates frames with \n\n, and that is the only boundary
// this trusts.
//
// A frame that will not parse is skipped rather than fatal: losing one
// progress row must not lose the answer behind it. `done` and `error` are
// terminal and are returned to the caller instead of being handed to onEvent,
// so the render path for a finished run stays in one place.
export async function readAskStream(body, onEvent) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;
  let error = null;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut = buffer.indexOf("\n\n");
    while (cut !== -1) {
      const frame = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (line) {
        let event = null;
        try {
          event = JSON.parse(line.slice(5).trim());
        } catch {
          event = null;
        }
        if (event?.type === "done") result = event.result;
        else if (event?.type === "error") error = event.message;
        else if (event) onEvent(event);
      }
      cut = buffer.indexOf("\n\n");
    }
  }

  return { result, error };
}

// The design shows a five-step ticker — "Reading orders… Checking
// settlements… Reconciling…" — advancing on a timer. Every step is hardcoded,
// so it narrates the same five stages no matter what the run does. That is an
// animation wearing telemetry's clothes, and it is the same defect as a
// fabricated figure: it tells a founder something the system does not know.
//
// This one is fed by POST /ai/ask/stream. A row appears when the server says a
// tool RETURNED, carrying that tool's own label from tools.ts and the duration
// executeTool measured. Three consequences, each of which is the honest
// version of something the reference fakes:
//
//   Nothing is pre-rendered greyed-out. The loop picks its next tool from what
//   the last one returned, so a list of upcoming steps would be a prediction.
//   Rows arrive; they are never revealed.
//
//   No progress bar and no percentage. A bar needs a denominator, and the
//   number of tools this run will make is not knowable until it stops.
//
//   A tool that failed keeps its row and says so. A run that limped is not
//   redrawn afterwards as a run that sailed.
const STAGE_COPY = {
  resolving: "Working out which figures this needs",
  writing: "Writing the answer",
};

export function ThinkingCard({ question, progress }) {
  const steps = progress?.tools ?? [];
  const stage = progress?.stage ?? null;
  // The header belongs to a live run. `progress` is null when this card is
  // standing in for a stored thread being fetched, and claiming to be thinking
  // through the books while loading saved text would be the small version of
  // the same lie.
  const live = progress != null;
  return (
    <article className="gcard rise overflow-hidden" role="status" aria-busy="true">
      <span className="sr-only">Working out the answer</span>
      {/* The same question bar the answer card opens with, so the card that
          replaces this one lands in the same visual frame. */}
      {question ? (
        <div className="border-b border-border/70 bg-muted/40 px-6 py-3">
          <p className="text-[13px] text-muted-foreground">{question}</p>
        </div>
      ) : null}
      <div className="flex flex-col gap-3 px-6 py-6">

      {live ? (
        <div className="flex items-center gap-2 text-[13px] text-primary">
          <Icon paths={SPARKLES_PATHS} size={15} className="animate-pulse motion-reduce:animate-none" />
          Thinking through your books…
        </div>
      ) : null}

      {steps.map((s, i) => (
        <div key={`${s.name}-${i}`} className="rise flex items-center gap-2.5 text-[13px]">
          {/* A tool row is never a spinner. The event is emitted after the call
              returned and after its AgentToolCall row was written, so the only
              honest marks here are "done" and "failed". */}
          <Icon
            paths={s.ok ? CHECK_PATHS : CIRCLE_ALERT_PATHS}
            size={14}
            className={`flex-none ${s.ok ? "text-success" : "text-destructive"}`}
          />
          {/* label is null only when the model named a tool that does not
              exist — a real event, so it gets a real row, showing the name it
              asked for rather than inventing copy for it. */}
          <span className={s.ok ? "text-muted-foreground" : "text-destructive"}>
            {s.label ?? <span className="font-mono text-[12px]">{s.name}</span>}
            {s.ok ? "" : " — that lookup failed"}
          </span>
          {/* Measured by executeTool on return. This client never starts a
              clock of its own and calls the reading a measurement. */}
          <span className="num ml-auto flex-none text-[11.5px] text-muted-foreground">{s.durationMs}ms</span>
        </div>
      ))}

      {/* The live line: the phase the loop has ALREADY entered, not the one it
          is expected to reach next. It keeps spinning because the phase is
          genuinely still running — tool calls happen inside `resolving` and do
          not end it, and `writing` ends when the answer replaces this card.
          Under prefers-reduced-motion the ring holds still and the phase is
          still legible as the only unfinished row. */}
      {stage ? (
        <div className="flex items-center gap-2.5 text-[13px] text-foreground">
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 flex-none animate-spin rounded-full border-2 border-primary border-t-transparent motion-reduce:animate-none"
          />
          <span>{STAGE_COPY[stage] ?? stage}</span>
          <span className="sr-only">, in progress</span>
        </div>
      ) : null}

      {/* Before the first event lands there is nothing measured to show, so
          this stays a skeleton rather than an empty box. */}
      {steps.length === 0 && !stage ? (
        <>
          <div className="h-4 w-4/5 animate-pulse rounded-full bg-primary/10" />
          <div className="h-4 w-3/5 animate-pulse rounded-full bg-primary/10" />
          <div className="mt-1 h-14 w-full animate-pulse rounded-xl bg-primary/10" />
        </>
      ) : null}
      </div>
    </article>
  );
}

/**
 * One question and its answer, with the two run outcomes that are not a clean
 * answer spelled out underneath.
 *
 * Shared by the page and the popup deliberately. An EXHAUSTED or FAILED run
 * rendered in one surface and silently dropped in the other would mean the
 * popup showed nothing where the page showed a warning — the popup would look
 * like the question simply vanished.
 */
export function AnswerTurn({ turn, seriesBySource, onFollowUp, onEvidence }) {
  const { question, result } = turn;
  return (
    <div className="flex flex-col gap-2">
      <AIAnswerCard
        question={question}
        headline={result.answer?.headline ?? ""}
        charts={result.answer?.charts ?? []}
        answer={result.answer?.directAnswer ?? ""}
        figures={(result.answer?.keyFigures ?? []).map((f) => ({
          ...f,
          // toolEvidence is what the tools in THIS run actually returned, so a
          // figure's source maps to a destination that really exists. Picking
          // the first ref out of the answer's own evidence[] instead would
          // attach revenue's workings to a COD figure whenever an answer used
          // more than one tool.
          evidenceRef: result.toolEvidence?.[f.source] ?? null,
        }))}
        drivers={result.answer?.drivers ?? []}
        warnings={result.answer?.warnings ?? []}
        evidence={result.answer?.evidence ?? []}
        dataStatus={result.answer?.dataStatus ?? ""}
        recommendedAction={result.answer?.recommendedAction ?? null}
        followUps={result.answer?.followUps ?? []}
        onFollowUp={onFollowUp}
        toolCalls={result.toolCalls ?? []}
        seriesBySource={seriesBySource}
        unsupportedFigures={result.verification?.unsupportedFigures ?? []}
        onEvidence={onEvidence}
      />
      {result.status === "EXHAUSTED" ? (
        <div className="rounded-md bg-accent-soft px-3 py-2 text-[13px] text-accent">
          The question needed more steps than one run allows. What is above is what it had worked out — ask a narrower
          version to get the rest.
        </div>
      ) : null}
      {result.status === "FAILED" ? (
        <div className="rounded-md bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
          That run failed{result.error ? `: ${result.error}` : "."} Nothing was answered — no figure above is a guess at
          what it would have said.
        </div>
      ) : null}
    </div>
  );
}

const AskCfoContext = createContext(null);

export function useAskCfo() {
  const ctx = useContext(AskCfoContext);
  if (!ctx) throw new Error("useAskCfo must be used inside AskCfoProvider");
  return ctx;
}

export function AskCfoProvider({ children }) {
  const { getToken } = useAuth();
  const api = process.env.NEXT_PUBLIC_API_URL;

  const [status, setStatus] = useState(null); // { configured, note }
  const [statusFailed, setStatusFailed] = useState(false);
  const [freshness, setFreshness] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [turns, setTurns] = useState([]); // { question, result }
  const [draft, setDraft] = useState("");
  const [asking, setAsking] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState(null);
  const [askError, setAskError] = useState(null);
  // What the run has actually done so far: { stage, tools[] }. Only ever
  // written from a server event — nothing here is advanced by a timer.
  const [progress, setProgress] = useState(null);
  // Nightly snapshot series by snapshot key, for the hero sparkline. Same
  // endpoint and same measured-or-absent rule as the overview hero row.
  const [snapSeries, setSnapSeries] = useState({});
  const [threadLoading, setThreadLoading] = useState(false);
  const [evidence, setEvidence] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  // This provider wraps EVERY dashboard page, so its four fetches must not
  // fire on pages that will never ask anything — that would put /ai/status,
  // /metrics/freshness, /metrics/snapshot-history and /ai/conversations on the
  // critical path of Inventory, Connections and every other screen, for a
  // popup most sessions never open. Nothing loads until something asks it to:
  // the full page on mount, the popup on its first open.
  const [activated, setActivated] = useState(false);
  const activate = useCallback(() => setActivated(true), []);

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
    if (!activated) return;
    let cancelled = false;
    (async () => {
      try {
        const opts = await authed();
        const [statusRes, freshRes, snapRes] = await Promise.all([
          fetch(`${api}/ai/status`, opts),
          fetch(`${api}/metrics/freshness`, opts),
          fetch(`${api}/metrics/snapshot-history?days=30`, opts),
        ]);
        if (cancelled) return;
        if (statusRes.ok) setStatus(await statusRes.json());
        else setStatusFailed(true);
        if (freshRes.ok) setFreshness(await freshRes.json());
        if (snapRes.ok) {
          const snap = await snapRes.json();
          // { series: [{ metric, points }] }, oldest-first. A null-valued
          // point was captured but not measurable that night — dropped, so
          // the line is only ever drawn through observed nights.
          const byKey = {};
          for (const row of snap.series ?? []) {
            const key = row?.metric?.key;
            if (!key) continue;
            const pts = (row.points ?? [])
              .map((pt) => ({ x: pt.day, y: pt.value ?? pt.valueNumeric }))
              .filter((p) => typeof p.y === "number" && Number.isFinite(p.y) && typeof p.x === "string");
            if (pts.length) byKey[key] = pts;
          }
          setSnapSeries(byKey);
        }
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
  }, [activated, api, authed, loadConversations]);

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
      setDraft("");
      // Echoed above the skeleton while the run is in flight, so the composer
      // can be cleared without the question disappearing from the screen.
      setPendingQuestion(q);
      setProgress({ stage: null, tools: [] });
      try {
        // The streaming route, not /ai/ask. Same orchestrator, same AskResult
        // in the terminal `done` event — the only difference is that this one
        // narrates the run while it happens instead of going silent for
        // twenty seconds and then producing everything at once.
        const res = await fetch(`${api}/ai/ask/stream`, {
          method: "POST",
          headers: { ...(await authed()).headers, "Content-Type": "application/json" },
          body: JSON.stringify({ question: q, ...(activeId ? { conversationId: activeId } : {}) }),
        });

        // A rejected question and an unconfigured server both answer as
        // ordinary JSON: the route validates before it writes a single SSE
        // header, precisely so these stay readable as errors instead of
        // arriving as a stream that says nothing.
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setAskError(body?.message ?? `The question could not be answered (HTTP ${res.status}).`);
          return;
        }
        if (!res.body) {
          setAskError("The server answered without a readable stream.");
          return;
        }

        const { result, error } = await readAskStream(res.body, (event) => {
          if (event.type === "stage") {
            setProgress((p) => ({ ...(p ?? { tools: [] }), stage: event.stage }));
          } else if (event.type === "tool") {
            setProgress((p) => ({ ...(p ?? { stage: null }), tools: [...(p?.tools ?? []), event] }));
          }
        });

        if (error) {
          setAskError(error);
          return;
        }
        // A stream that ended without either terminal event means the
        // connection dropped mid-run. Saying so beats leaving the composer
        // enabled under a card that silently vanished.
        if (!result) {
          setAskError("The connection dropped before the answer finished. Nothing was answered — ask again.");
          return;
        }

        setTurns((prev) => [...prev, { question: q, result }]);
        if (result.conversationId && result.conversationId !== activeId) setActiveId(result.conversationId);
        loadConversations();
      } catch {
        setAskError("Could not reach the server.");
      } finally {
        setAsking(false);
        setPendingQuestion(null);
        setProgress(null);
      }
    },
    [api, authed, activeId, asking, loadConversations]
  );

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

  const startNewConversation = useCallback(() => {
    setActiveId(null);
    setTurns([]);
    setAskError(null);
  }, []);

  // Opening the popup is the popup's own trigger to load. Prefilling is how
  // "ask about this card" would hand a question in — the draft is set, never
  // auto-asked, because a question that fires itself spends tokens on a click
  // that was only meant to open a box.
  const open = useCallback(
    (question) => {
      activate();
      setIsOpen(true);
      if (question) setDraft(question);
    },
    [activate]
  );
  const close = useCallback(() => setIsOpen(false), []);

  // Snapshot series re-keyed by TOOL name, so the card can look a hero
  // figure's own source up directly. Only mapped tools appear; a hero from
  // any other tool renders without a sparkline rather than borrowing one.
  const seriesBySource = useMemo(() => {
    const out = {};
    for (const [tool, spec] of Object.entries(TOOL_SNAPSHOT)) {
      const pts = snapSeries[spec.key];
      if (pts?.length >= 4) out[tool] = { points: pts, caption: spec.caption };
    }
    return out;
  }, [snapSeries]);

  const suggestions = useMemo(() => suggestionsFor(freshness), [freshness]);

  const value = useMemo(
    () => ({
      activate,
      status,
      statusFailed,
      configured: status?.configured === true,
      freshness,
      suggestions,
      conversations,
      activeId,
      openConversation,
      startNewConversation,
      turns,
      draft,
      setDraft,
      asking,
      pendingQuestion,
      askError,
      progress,
      threadLoading,
      ask,
      seriesBySource,
      openEvidence,
      isOpen,
      open,
      close,
    }),
    [
      activate, status, statusFailed, freshness, suggestions, conversations, activeId, openConversation,
      startNewConversation, turns, draft, asking, pendingQuestion, askError, progress, threadLoading, ask,
      seriesBySource, openEvidence, isOpen, open, close,
    ]
  );

  return (
    <AskCfoContext.Provider value={value}>
      {children}
      {/* One drawer for both surfaces. Rendered here rather than in each so a
          figure clicked inside the popup opens the same envelope, in the same
          panel, as the identical figure clicked on the full page. It portals
          to document.body at z-50 — above the popup's z-40 — so the workings
          are readable without closing the answer they belong to. */}
      <EvidenceDrawer
        open={evidence !== null}
        title={evidence?.title ?? "Evidence"}
        sourceLabel={evidence?.sourceLabel ?? ""}
        rows={evidence?.rows ?? []}
        onClose={() => setEvidence(null)}
      />
    </AskCfoContext.Provider>
  );
}
