"use client";

// P4.4. The §19 response contract, rendered.
//
// The shape is not a suggestion — the backend orchestrator validates it before
// storing, so a card that renders it is showing exactly what was audited. Two
// consequences shape this component:
//
//   1. Every figure carries the TOOL that produced it, and the tool name is
//      shown, not hidden behind a tooltip. A number whose provenance is one
//      click away is a number people stop checking.
//   2. Nothing is rendered that the model did not return. There is no default
//      "Sources: Shopify, Razorpay" strip, no invented confidence score, no
//      elapsed-time flourish. The page this replaced had all three, all fixed
//      strings, on top of fabricated figures.
//
// The AI label is on the card itself rather than only on the page, because
// screenshots travel and a founder forwarding one to their accountant should
// not have to explain where the number came from.

const STATUS_TONE = {
  reconciled: "text-primary",
  provisional: "text-accent",
  estimated: "text-muted-foreground",
  mixed: "text-muted-foreground",
};

export default function AIAnswerCard({
  question = "",
  answer = "",
  figures = [],
  drivers = [],
  warnings = [],
  evidence = [],
  dataStatus = "",
  recommendedAction = null,
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
  return (
    <div className="gcard p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-sm bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.07em] text-primary">
          AI answer
        </span>
        {dataStatus ? (
          <span className={`text-[11px] uppercase tracking-[0.05em] ${STATUS_TONE[dataStatus] ?? "text-muted-foreground"}`}>
            {dataStatus}
          </span>
        ) : null}
      </div>

      {question ? <div className="text-[13.5px] text-muted-foreground">{question}</div> : null}
      <p className="mb-0 mt-1.5 text-[15px] leading-[1.6] text-foreground">{answer}</p>

      {figures.length > 0 ? (
        <div className="mt-4 grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          {figures.map((f, i) => {
            const clickable = typeof onEvidence === "function";
            const Tag = clickable ? "button" : "div";
            const unverified = isUnverified(f.value);
            return (
              <Tag
                key={`${f.label}-${i}`}
                type={clickable ? "button" : undefined}
                onClick={clickable ? () => onEvidence(f) : undefined}
                className={`rounded-md px-3 py-2.5 text-left ${unverified ? "bg-destructive-soft" : "bg-muted"} ${
                  clickable ? "cursor-pointer border-none transition-colors hover:bg-primary-soft" : ""
                }`}
              >
                <div className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground">{f.label}</div>
                <div className={`text-[19px] font-medium ${unverified ? "text-destructive" : "text-foreground"}`}>
                  {f.value}
                </div>
                {/* The provenance line. Present on every figure or the contract
                    was violated upstream, so it is not conditional on prettiness. */}
                <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">
                  {unverified ? "not found in any tool result" : f.source}
                </div>
              </Tag>
            );
          })}
        </div>
      ) : null}

      {drivers.length > 0 ? (
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Main drivers</div>
          <ul className="mt-1.5 list-disc pl-[18px]">
            {drivers.map((d, i) => (
              <li key={i} className="mb-1 text-[13.5px] text-foreground">{d}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Warnings</div>
          <div className="mt-1.5 flex flex-col gap-1.5">
            {warnings.map((w, i) => (
              <div key={i} className="rounded-md bg-destructive-soft px-3 py-2 text-[13px] text-destructive">{w}</div>
            ))}
          </div>
        </div>
      ) : null}

      {recommendedAction ? (
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Recommended action</div>
          <div className="mt-1.5 rounded-md bg-primary-soft px-3 py-2.5 text-[13px] text-primary">{recommendedAction}</div>
        </div>
      ) : null}

      {evidence.length > 0 || meta ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 border-t border-border pt-3">
          <div className="flex flex-wrap gap-3.5">
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
                  className="cursor-pointer border-none bg-transparent p-0 text-[12.5px] text-primary hover:underline"
                  disabled={typeof onEvidence !== "function"}
                >
                  {ref.replace("/evidence/", "").replace(/_/g, " ")} workings ↗
                </button>
              ) : (
                <a key={i} href={ref} className="text-[12.5px] text-primary hover:underline">
                  {ref} ↗
                </a>
              )
            )}
          </div>
          {meta ? <span className="text-[11.5px] text-muted-foreground">{meta}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
