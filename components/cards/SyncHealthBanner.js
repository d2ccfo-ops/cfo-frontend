"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";

// P5.5 (§26/§31). What the run HISTORY says, as opposed to what each
// connection's current status says.
//
// The connector cards below already show syncStatus, and that field can only
// ever describe the last attempt. Two things are invisible from it, and both
// matter more than a single red badge:
//
//   A feed that reports success and returns nothing. Four consecutive empty
//   runs on a store that takes orders daily is what an expired or de-scoped
//   credential looks like — the provider answers 200, the sync "succeeds",
//   and the numbers quietly stop moving.
//
//   A failure that has repeated. "Failed once last Tuesday" is noise;
//   "failed four nights running" is a dead feed, and the card shows the same
//   thing for both.
//
// Renders nothing when there is nothing to say. A permanent green "all
// healthy" strip is a thing people stop reading, and then it is a thing they
// do not notice going amber.

export default function SyncHealthBanner() {
  const { getToken } = useAuth();
  const api = process.env.NEXT_PUBLIC_API_URL;
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${api}/connections/health`, {
        headers: { Authorization: `Bearer ${await getToken()}` },
      });
      if (res.ok) setData(await res.json());
    } catch {
      // Silent. This is a warning layer over the cards below; a failure to
      // load it must not add a second error to a page that already reports
      // its own connection problems.
    }
  }, [api, getToken]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const concerns = (data?.connections ?? []).filter((c) => c.concern);
  const deadLetters = (data?.deadLetters ?? []).filter((d) => !d.recoveredSince);

  if (concerns.length === 0 && deadLetters.length === 0) return null;

  return (
    <div className="mb-4 flex flex-col gap-2">
      {concerns.map((c) => (
        <div key={c.connectionId} className="rounded-md bg-accent-soft px-3.5 py-3 text-[13px] text-accent" role="status">
          <strong className="font-medium">{c.provider}</strong> — {c.concern}
        </div>
      ))}
      {deadLetters.map((d) => (
        <div
          key={d.connectionId}
          className="rounded-md bg-destructive-soft px-3.5 py-3 text-[13px] text-destructive"
          role="alert"
        >
          <strong className="font-medium">
            {d.provider}: {d.failures} failure{d.failures === 1 ? "" : "s"} in the last two weeks
          </strong>
          {d.error ? <div className="mt-0.5 font-mono text-[11.5px] opacity-80">{d.error}</div> : null}
          <div className="mt-0.5">{d.recommendation}</div>
        </div>
      ))}
    </div>
  );
}
