"use client";

// P4.5. The one AI-written section of an otherwise deterministic page.
//
// The separation is the design. Every tile, alert and recommended action on
// the daily brief is computed by the backend's calc modules and stays that
// way; this card explains them in words. It is labelled on the card, not in a
// footnote, because a founder forwarding a screenshot should not have to
// explain which part a model wrote.
//
// It renders a REASON as readily as a narrative. "Nothing moved since the last
// snapshot" and "the narrative was discarded because it quoted a figure the
// snapshot did not produce" are both real states worth showing — the second
// one especially, because a page that silently hides a rejected narrative
// looks identical to one where the feature is off.

function Section({ title, items }) {
  if (!items?.length) return null;
  return (
    <div className="mt-3.5">
      <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">{title}</div>
      <ul className="mt-1.5 list-disc pl-[18px]">
        {items.map((t, i) => (
          <li key={i} className="mb-1 text-[13.5px] leading-relaxed text-foreground">{t}</li>
        ))}
      </ul>
    </div>
  );
}

export default function BriefNarrativeCard({ brief, loading = false }) {
  if (loading) {
    return (
      <div className="gcard flex flex-col gap-3 p-5" role="status" aria-busy="true">
        <span className="sr-only">Loading the narrative</span>
        <div className="h-3 w-28 animate-pulse rounded-sm bg-primary/10" />
        <div className="h-4 w-3/4 animate-pulse rounded-sm bg-primary/10" />
        <div className="h-3 w-full animate-pulse rounded-sm bg-primary/10" />
        <div className="h-3 w-5/6 animate-pulse rounded-sm bg-primary/10" />
      </div>
    );
  }
  if (!brief) return null;

  const n = brief.narrative;

  return (
    <div className="gcard p-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-sm bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.07em] text-primary">
          Written by AI
        </span>
        {/* Stated, not implied. The count is what the P4.7 harness actually
            checked before this was stored, so the claim is falsifiable. */}
        {n && brief.figuresChecked > 0 ? (
          <span className="text-[11px] text-muted-foreground">
            {brief.figuresChecked} figure{brief.figuresChecked === 1 ? "" : "s"} checked against the overnight snapshot
          </span>
        ) : null}
        {brief.day ? <span className="text-[11px] text-muted-foreground">· {brief.day}</span> : null}
      </div>

      {n ? (
        <>
          <p className="mb-0 text-[15px] leading-[1.6] text-foreground">{n.headline}</p>
          <Section title="What changed" items={n.whatChanged} />
          <Section title="Why it matters" items={n.whyItMatters} />
          <Section title="Watch for" items={n.watchFor} />
          {n.caveats?.length > 0 ? (
            <div className="mt-3.5 flex flex-col gap-1.5">
              {n.caveats.map((c, i) => (
                <div key={i} className="rounded-md bg-accent-soft px-3 py-2 text-[13px] text-accent">{c}</div>
              ))}
            </div>
          ) : null}
          <div className="mt-4 border-t border-border pt-3 text-[11.5px] leading-relaxed text-muted-foreground">
            The metrics on this page are computed, not written. This section describes them; if the two ever disagree,
            the metrics are right.
          </div>
        </>
      ) : (
        <p className="mb-0 text-[13.5px] leading-relaxed text-muted-foreground">{brief.reason}</p>
      )}
    </div>
  );
}
