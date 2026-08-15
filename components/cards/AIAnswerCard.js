"use client";

import { useState } from "react";
import FinancialChart from "@/components/charts/FinancialChart";
import {
  Icon,
  CHEVRON_DOWN_PATHS,
  CIRCLE_ALERT_PATHS,
  LIGHTBULB_PATHS,
  SHIELD_CHECK_PATHS,
  WRENCH_PATHS,
} from "@/components/icons";

// P4.4. The §19 response contract, rendered on the ai-cfo-2 card.
//
// The shape is not a suggestion — the backend orchestrator validates it before
// storing, so a card that renders it is showing exactly what was audited.
//
// WHAT OF THE REFERENCE IS REAL HERE, AND WHERE EACH PIECE COMES FROM
//
//   verdict + body        the model (language only; verifyFigures checks the
//                         verdict carries no number)
//   hero figure + delta   the first keyFigure whose delta the server located
//                         in a tool result (enrichFigures — copy, never
//                         compute)
//   hero sparkline        real daily snapshots from /metrics/snapshot-history,
//                         passed in by the page; absent when unmapped
//   status dot per figure the tool's own §28 status, as a dot with a legend
//   charts                series a tool returned whole (answerCharts.ts)
//   "How I got this"      the run's actual tool calls with measured durations
//   "Ask next"            questions the model offered — questions assert
//                         nothing, so they are the one new thing it may write
//                         freely
//
// STILL ABSENT, BECAUSE NOTHING MEASURES THEM: driver weight bars (no calc
// module attributes a share of a change to a driver, so every bar width would
// be an invented number), fake freshness ("live"/"synced 12 min ago" — sync
// state belongs to /connections and is not in the answer), pin/vote/PNG (no
// backend behind any of them; a button that only flips local state is a lie
// with hover states).
const DIRECTION_MARK = { up: "↑", down: "↓", flat: "→" };

/**
 * The delta as the tool wrote it — sign, one decimal at most, then "%".
 *
 * Rounding for display is the only arithmetic on this card, and it cannot
 * change the claim: 28.4999 and 28.5 are the same measurement written for a
 * screen. Anything non-numeric is passed straight through rather than coerced.
 */
function formatDelta(delta) {
  const n = typeof delta === "number" ? delta : Number(delta);
  if (!Number.isFinite(n)) return String(delta);
  const shown = Math.abs(n) < 10 ? n.toFixed(1) : Math.round(n);
  return `${n > 0 ? "+" : ""}${shown}%`;
}

/** "previous_month" is a wire value; a founder reads "vs previous month". */
function formatComparison(comparison) {
  if (typeof comparison !== "string" || comparison.length === 0) return null;
  return `vs ${comparison.replace(/_/g, " ")}`;
}

/** The §28 status word, however the tool wrapped it. Never invented. */
function statusWord(dataStatus) {
  if (typeof dataStatus === "string") return dataStatus;
  if (dataStatus && typeof dataStatus === "object" && typeof dataStatus.status === "string") {
    return dataStatus.status;
  }
  return null;
}

const STATUS_TONE = {
  reconciled: "bg-success-soft text-success",
  provisional: "bg-primary-soft text-primary",
  estimated: "bg-accent-soft text-accent",
  mixed: "bg-muted text-muted-foreground",
};

// The reference marks each figure with a freshness dot (live / recent /
// stale). Sync freshness is not in the answer — but the tool's §28 status IS,
// per figure, and it is the more honest version of the same signal: not "how
// recently did this sync" but "how far can this number be trusted".
const STATUS_DOT = {
  reconciled: "bg-success",
  provisional: "bg-primary",
  estimated: "bg-accent",
  mixed: "bg-muted-foreground",
};

// The reference sparkline, kept to the pixel — but fed real snapshot points
// and stroked in the chart palette rather than green/red. Success-for-up
// needs to know whether up is good, and no declaration of that arrives with
// the answer.
function HeroSparkline({ points }) {
  const w = 132;
  const h = 40;
  const values = points.map((p) => p.y);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / span) * (h - 6) - 3;
    return [x, y];
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const last = pts[pts.length - 1];
  const stroke = "var(--color-chart-1)";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-hidden="true">
      <path d={area} fill={stroke} opacity={0.1} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={3} fill={stroke} />
    </svg>
  );
}

// Progressive disclosure, one level deep. Collapsed sections are for material
// that supports the answer rather than carries it — which is why the caveats
// section opens by default: a warning nobody expands is a warning nobody read.
function Section({ paths, title, count, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-border/70">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent py-3 text-left text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <Icon paths={paths} size={16} />
        <span className="font-medium">{title}</span>
        <span className="num rounded-full bg-muted px-1.5 text-[11px]">{count}</span>
        <Icon
          paths={CHEVRON_DOWN_PATHS}
          size={16}
          className={`ml-auto transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? <div className="pb-5">{children}</div> : null}
    </div>
  );
}

export default function AIAnswerCard({
  question = "",
  headline = "",
  charts = [],
  answer = "",
  figures = [],
  drivers = [],
  warnings = [],
  evidence = [],
  dataStatus = "",
  recommendedAction = null,
  followUps = [],
  onFollowUp = null,
  toolCalls = [],
  // Real snapshot series keyed by TOOL name ({ get_revenue_summary: {points,
  // caption} }). The card looks the hero's own source up in it, so a series
  // can never be juxtaposed against a figure another tool produced.
  seriesBySource = {},
  meta = "",
  onEvidence = null,
  unsupportedFigures = [],
}) {
  // A figure the server could not find in any tool result is marked ON the
  // figure, not only in the warnings list. Someone reading the tiles is
  // reading the numbers, and a caveat three sections down does not reach them.
  const isUnverified = (value) => {
    if (unsupportedFigures.length === 0) return false;
    const norm = String(value).replace(/[₹\s,]/g, "").replace(/%$/, "");
    return unsupportedFigures.some((u) => norm.includes(u));
  };

  // The hero slot goes to the first figure whose delta the server located —
  // "first" because keyFigures arrive in the model's order of importance and
  // re-ranking them here would be this card deciding what the answer is
  // about. A figure the verifier flagged never gets the big type: promotion
  // is for numbers that checked out.
  const heroIdx = figures.findIndex((f) => f.delta !== undefined && f.delta !== null && !isUnverified(f.value));
  const hero = heroIdx >= 0 ? figures[heroIdx] : null;
  const gridFigures = hero ? figures.filter((_, i) => i !== heroIdx) : figures;

  // The hairline grid works by letting the container's border colour show
  // through 1px gaps, so a column count the figures do not divide into paints
  // a bare grey track. Pick a count they fit, and fill the single hole the
  // remaining odd cases leave.
  const figureCols =
    gridFigures.length === 1
      ? "grid-cols-1"
      : gridFigures.length % 4 === 0
        ? "sm:grid-cols-2 lg:grid-cols-4"
        : gridFigures.length % 3 === 0
          ? "sm:grid-cols-3"
          : "sm:grid-cols-2";
  const figureFiller = gridFigures.length > 1 && gridFigures.length % 2 === 1 && gridFigures.length % 3 !== 0;

  // Legend rows for only the statuses that actually appear on a figure —
  // a legend explaining dots that are not on screen is noise.
  const presentStatuses = [...new Set(gridFigures.concat(hero ? [hero] : []).map((f) => statusWord(f.dataStatus)).filter((s) => s && STATUS_DOT[s]))];

  const heroClickable = hero && typeof onEvidence === "function";
  const heroComparison = hero ? formatComparison(hero.comparison) : null;
  const heroSeries = hero ? (seriesBySource[hero.source] ?? null) : null;

  return (
    <article className="gcard overflow-hidden">
      {/* The question, kept with its answer — a card that travels as a
          screenshot has to say what was asked. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-muted/40 px-6 py-3">
        {question ? <p className="text-[13px] text-muted-foreground">{question}</p> : null}
        <div className="ml-auto flex items-center gap-2">
          <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.07em] text-primary">
            AI answer
          </span>
          {dataStatus ? (
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_TONE[dataStatus] ?? "bg-muted text-muted-foreground"}`}
            >
              {dataStatus}
            </span>
          ) : null}
        </div>
      </div>

      <div className="px-6 py-6">
        {/* The verdict, when the model wrote one — the single line to read if
            you read nothing else. It is language, not measurement: the prompt
            forbids figures in it and verifyFigures checks that it has none, so
            a headline can never become an unsourced number in large type.
            Answers stored before this field existed simply have no headline,
            and the direct answer moves up into its place. */}
        {headline ? (
          <>
            <h3 className="text-[20px] font-medium leading-snug tracking-[-0.01em] text-foreground">{headline}</h3>
            <p className="mt-3 max-w-[62ch] text-[15px] leading-[1.75] text-muted-foreground">{answer}</p>
          </>
        ) : (
          <h3 className="text-[20px] font-medium leading-snug tracking-[-0.01em] text-foreground">{answer}</h3>
        )}

        {/* The hero figure — the reference's centrepiece, with every claim on
            it traced: the value and label are the model's keyFigure (checked
            by verifyFigures), the delta pill and compare line are the tool's
            own measurement (enrichFigures), and the sparkline is real daily
            snapshots the page fetched. The pill is deliberately not green or
            red: for "Refund rate" up is bad and for "Net revenue" up is good,
            and nothing in the answer declares which this is. The arrow states
            the measured direction; the reader supplies the judgement. */}
        {hero ? (
          <div
            role={heroClickable ? "button" : undefined}
            tabIndex={heroClickable ? 0 : undefined}
            onClick={heroClickable ? () => onEvidence(hero) : undefined}
            onKeyDown={heroClickable ? (e) => (e.key === "Enter" || e.key === " ") && onEvidence(hero) : undefined}
            className={`mt-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 rounded-xl bg-muted/50 px-5 py-4 ${
              heroClickable ? "cursor-pointer transition-colors hover:bg-primary-soft/60" : ""
            }`}
          >
            <div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {statusWord(hero.dataStatus) && STATUS_DOT[statusWord(hero.dataStatus)] ? (
                  <span
                    title={statusWord(hero.dataStatus)}
                    className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[statusWord(hero.dataStatus)]}`}
                  />
                ) : null}
                {hero.label}
              </div>
              <div className="num mt-1 text-[34px] font-normal leading-none tracking-[-0.02em] text-foreground">
                {hero.value}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="num inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-1 text-sm font-medium text-foreground shadow-card">
                  {DIRECTION_MARK[hero.deltaDirection] ?? ""} {formatDelta(hero.delta)}
                </span>
                {heroComparison ? <span className="text-sm text-muted-foreground">{heroComparison}</span> : null}
              </div>
              <div className="mt-2 font-mono text-[10px] text-muted-foreground">{hero.source}</div>
            </div>
            {heroSeries?.points?.length >= 4 ? (
              <div className="text-right">
                <HeroSparkline points={heroSeries.points} />
                <div className="mt-1 flex justify-between gap-3 text-[10px] text-muted-foreground">
                  <span>{heroSeries.points[0].x}</span>
                  <span>{heroSeries.points[heroSeries.points.length - 1].x}</span>
                </div>
                {/* The sparkline's own window, stated — it is context beside
                    the figure, not a drawing OF the figure: the number is the
                    period total, the line is the daily snapshot series. */}
                {heroSeries.caption ? (
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{heroSeries.caption}</div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {gridFigures.length > 0 ? (
          <div className={`mt-5 grid gap-px overflow-hidden rounded-xl bg-border ${figureCols}`}>
            {gridFigures.map((f, i) => {
              const clickable = typeof onEvidence === "function";
              const Tag = clickable ? "button" : "div";
              const unverified = isUnverified(f.value);
              // Both read straight off the figure the server enriched. A
              // figure the matcher could not place carries neither, and the
              // tile renders without them rather than falling back to the
              // answer-level values — an inherited delta is a delta about a
              // different number.
              const figureStatus = statusWord(f.dataStatus);
              const comparisonLabel = formatComparison(f.comparison);
              return (
                <Tag
                  key={`${f.label}-${i}`}
                  type={clickable ? "button" : undefined}
                  onClick={clickable ? () => onEvidence(f) : undefined}
                  className={`px-4 py-3.5 text-left ${unverified ? "bg-destructive-soft" : "bg-card"} ${
                    clickable ? "cursor-pointer border-none transition-colors hover:bg-primary-soft" : ""
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {/* The reference's freshness dot, carrying the real §28
                        status for THIS figure instead of a sync claim the
                        answer does not hold. The legend under the grid names
                        the colours. */}
                    {figureStatus && STATUS_DOT[figureStatus] ? (
                      <span title={figureStatus} className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[figureStatus]}`} />
                    ) : null}
                    <span className="text-xs text-muted-foreground">{f.label}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-baseline gap-2">
                    <span className={`num text-lg leading-tight ${unverified ? "text-destructive" : "text-foreground"}`}>
                      {f.value}
                    </span>
                    {/* Not coloured by sign — see the hero pill note. */}
                    {f.delta !== undefined && f.delta !== null ? (
                      <span
                        className="num rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                        title={comparisonLabel ?? undefined}
                      >
                        {DIRECTION_MARK[f.deltaDirection] ?? ""} {formatDelta(f.delta)}
                      </span>
                    ) : null}
                  </div>
                  {comparisonLabel ? (
                    <div className="mt-0.5 text-[10.5px] text-muted-foreground">{comparisonLabel}</div>
                  ) : null}
                  {/* The provenance line. Present on every figure or the contract
                      was violated upstream, so it is not conditional on prettiness
                      — and not on hover either, which is the same thing as hidden. */}
                  <div className="mt-2 font-mono text-[10px] text-muted-foreground">
                    {unverified ? "not found in any tool result" : f.source}
                  </div>
                </Tag>
              );
            })}
            {figureFiller ? <div aria-hidden="true" className="hidden bg-card sm:block" /> : null}
          </div>
        ) : null}

        {presentStatuses.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            {presentStatuses.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[s]}`} />
                {s}
              </span>
            ))}
          </div>
        ) : null}

        {/* Charts the SERVER attached, each copied whole out of one tool
            result (answerCharts.ts). The colour is chosen here rather than
            sent, because which palette entry a series gets is presentation
            and carries no claim — and a server that names one has to ship
            again when the theme changes.

            The tool is printed under each chart for the same reason it is
            printed under each figure: a line nobody can trace is a line
            nobody can check, and a chart is a quantitative claim about every
            point on it. */}
        {charts.length > 0 ? (
          <div className="mt-6 flex flex-col gap-4">
            {charts.map((c, i) => (
              <div key={`${c.source}-${i}`}>
                <FinancialChart
                  title={c.title}
                  subtitle={c.subtitle ?? ""}
                  kind={c.kind}
                  yFormat={c.yFormat}
                  height={200}
                  showLegend={false}
                  footnote={c.footnote ?? ""}
                  series={(c.series ?? []).map((s) => ({ ...s, colorRole: "accent" }))}
                />
                <div className="mt-1.5 font-mono text-[10px] text-muted-foreground">{c.source}</div>
              </div>
            ))}
          </div>
        ) : null}

        {drivers.length > 0 ? (
          <div className="mt-6">
            <div className="text-xs text-muted-foreground">What moved it</div>
            {/* A list, not the reference's weight bars: a bar width is a
                quantity claim, and no calc module measures a driver's share
                of a change. The day contribution.ts attributes one, the bars
                get built from its output. */}
            <ul className="mt-3 space-y-3">
              {drivers.map((d, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-foreground">
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="max-w-[62ch]">{d}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {recommendedAction ? (
          <div className="mt-6 flex gap-3 rounded-xl bg-primary-soft px-5 py-4">
            <Icon paths={LIGHTBULB_PATHS} size={16} className="mt-0.5 shrink-0 text-primary" />
            <div>
              <div className="text-xs font-medium text-primary">What to do next</div>
              <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-foreground">{recommendedAction}</p>
            </div>
          </div>
        ) : null}

        {/* Questions the model offered, as questions — clicking one asks it,
            and the answer comes from a fresh run against the tools. Nothing
            here asserts anything, which is why it is the one place the model
            writes freely. */}
        {followUps.length > 0 && typeof onFollowUp === "function" ? (
          <div className="mt-5">
            <div className="text-xs text-muted-foreground">Ask next</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {followUps.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => onFollowUp(f)}
                  className="cursor-pointer rounded-full border border-border bg-transparent px-3 py-1.5 text-xs text-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {(warnings.length > 0 || toolCalls.length > 0) ? (
        <div className="px-6 pb-2">
          {warnings.length > 0 ? (
            <Section paths={CIRCLE_ALERT_PATHS} title="Caveats" count={warnings.length} defaultOpen>
              <ul className="space-y-2">
                {warnings.map((w, i) => (
                  <li
                    key={i}
                    className="rounded-lg border-l-2 border-accent bg-accent-soft/60 px-3 py-2 text-sm leading-relaxed text-foreground"
                  >
                    {w}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
          {/* The run's ACTUAL tool calls — names and durations measured by
              executeTool, the same events the thinking ticker showed live. A
              call that failed keeps its chip and says so; a run that limped
              is not redrawn afterwards as a run that sailed. */}
          {toolCalls.length > 0 ? (
            <Section paths={WRENCH_PATHS} title="How I got this" count={toolCalls.length}>
              <div className="flex flex-wrap gap-2">
                {toolCalls.map((c, i) => (
                  <span
                    key={`${c.name}-${i}`}
                    className={`num rounded-md px-2 py-1 font-mono text-xs ${
                      c.ok === false ? "bg-destructive-soft text-destructive" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {c.name ?? c.toolName}
                    {typeof c.durationMs === "number" ? ` · ${c.durationMs}ms` : ""}
                    {c.ok === false ? " · failed" : ""}
                  </span>
                ))}
              </div>
            </Section>
          ) : null}
        </div>
      ) : null}

      {evidence.length > 0 || meta ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/70 bg-muted/30 px-6 py-3">
          {evidence.length > 0 ? (
            <>
              <Icon paths={SHIELD_CHECK_PATHS} size={16} className="text-success" />
              <span className="text-xs text-muted-foreground">Open the underlying page:</span>
            </>
          ) : null}
          {/* Two namespaces, and conflating them is how a citation dies:
              /evidence/<metric> is the §21 API envelope (opened in the
              drawer, because the browser cannot render it and the API needs
              a bearer token), everything else is a screen in this app. */}
          {evidence.map((ref, i) =>
            ref.startsWith("/evidence/") ? (
              <button
                key={i}
                type="button"
                onClick={() => onEvidence?.({ label: "Workings", value: "", source: ref, evidenceRef: ref })}
                className="cursor-pointer rounded-md border-none bg-card px-2 py-1 text-xs text-primary transition-colors hover:bg-primary-soft disabled:cursor-default disabled:opacity-60"
                disabled={typeof onEvidence !== "function"}
              >
                {ref.replace("/evidence/", "").replace(/_/g, " ")} workings ↗
              </button>
            ) : (
              <a
                key={i}
                href={ref}
                className="rounded-md bg-card px-2 py-1 text-xs text-primary transition-colors hover:bg-primary-soft"
              >
                {ref} ↗
              </a>
            )
          )}
          {meta ? <span className="ml-auto text-xs text-muted-foreground">{meta}</span> : null}
        </div>
      ) : null}
    </article>
  );
}
