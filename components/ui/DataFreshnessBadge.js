"use client";

import { useAuth, useOrganization } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";

const TONE = {
  fresh: { fg: "text-success", dot: "bg-success" },
  stale: { fg: "text-accent", dot: "bg-accent" },
  error: { fg: "text-destructive", dot: "bg-destructive" },
  unknown: { fg: "text-muted-foreground", dot: "bg-muted-foreground" },
};

// How long the badge itself may be out of date. A freshness indicator that is
// stale is a contradiction, so it re-reads while the tab is open.
const REFRESH_MS = 60_000;

function describeAge(minutes) {
  if (minutes == null) return "Never synced";
  if (minutes < 1) return "Synced just now";
  if (minutes < 60) return `Synced ${Math.round(minutes)} min ago`;
  const hours = minutes / 60;
  if (hours < 24) return `Synced ${Math.round(hours)} hr ago`;
  const days = Math.round(hours / 24);
  return `Synced ${days} day${days === 1 ? "" : "s"} ago`;
}

// Reports how old the data actually is.
//
// This used to default to a hardcoded `label="Synced 12 min ago"` with
// `status="fresh"`, and the header rendered it with no props at all — so it
// claimed 12-minute-old data permanently, including on an organisation whose
// last sync was 30 hours earlier. A false freshness signal is worse than none:
// it is the one indicator a reader uses to decide whether to trust everything
// else on the page.
//
// Pass `label`/`status` to render a specific state; with neither, it fetches
// the real one from GET /metrics/freshness.
export default function DataFreshnessBadge({ label, status }) {
  const { getToken } = useAuth();
  const { organization } = useOrganization();
  const controlled = label !== undefined || status !== undefined;

  const [state, setState] = useState(null);

  const fetchFreshness = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/metrics/freshness`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const data = await res.json();

      if (data.totalSources === 0) return { label: "No sources connected", status: "unknown" };
      if (data.erroredSources > 0) {
        return {
          label: `${data.erroredSources} source${data.erroredSources === 1 ? "" : "s"} failing`,
          status: "error",
        };
      }
      if (data.newestAgeMinutes == null) return { label: "Never synced", status: "unknown" };

      // The label has to describe the same thing the colour does. Showing the
      // NEWEST source's age while colouring by the state of ALL of them
      // produces "Synced 2 hr ago" in amber next to "Synced 8 hr ago" in
      // green — both accurate, together incoherent. When something is behind,
      // say what is behind; the newest age is not the interesting fact then.
      if (data.staleSources > 0) {
        return {
          label: `${data.staleSources} of ${data.totalSources} sources stale`,
          status: "stale",
        };
      }
      return {
        // "Fresh" is the backend's own threshold (staleAfterMinutes), not a
        // judgement made here — the badge must agree with the freshness card.
        label: describeAge(data.newestAgeMinutes),
        status: data.newestAgeMinutes > data.staleAfterMinutes ? "stale" : "fresh",
      };
    } catch {
      return null;
    }
  }, [getToken]);

  useEffect(() => {
    if (controlled) return;
    let cancelled = false;
    const load = () => {
      fetchFreshness().then((next) => {
        if (!cancelled && next) setState(next);
      });
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [controlled, fetchFreshness, organization?.id]);

  const shown = controlled ? { label, status } : state;
  // Renders nothing until the real answer arrives, rather than a placeholder
  // that would read as a measurement.
  if (!shown?.label) return null;

  const tone = TONE[shown.status] || TONE.unknown;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11.5px] font-medium ${tone.fg}`}>
      <span className={`h-1.5 w-1.5 flex-none rounded-full ${tone.dot}`} />
      {shown.label}
    </span>
  );
}
