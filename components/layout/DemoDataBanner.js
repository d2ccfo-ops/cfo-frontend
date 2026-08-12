"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";

// A permanent, unmissable strip across the top of every page when the signed-in
// organisation holds generated data.
//
// This exists because of the one hole in the no-invented-numbers rule the rest
// of this app enforces. Every card refuses to render a figure it cannot stand
// behind — but that discipline lives in the frontend, and it is worth nothing
// if the DATABASE is fabricated. Seeded rows are, by construction,
// indistinguishable from measured ones: same tables, same calc engine, same
// warnings, same evidence drawers. The only thing that can tell you is a marker
// carried out of the backend, which is what GET /organization reports.
//
// Deliberately not dismissible. A banner you can close is a banner you close
// once and then forget, and forgetting is the entire failure mode here.
export default function DemoDataBanner() {
  const { getToken, isLoaded } = useAuth();
  const [org, setOrg] = useState(null);

  useEffect(() => {
    if (!isLoaded) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/organization`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (!cancelled) setOrg(json);
      } catch {
        // A failed check must not claim "this is real data" either — it simply
        // shows nothing, which is the same as any other page that could not
        // reach the backend.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded]);

  if (!org?.isDemo) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-2 text-center text-[12.5px]"
      style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
    >
      <span className="font-semibold uppercase tracking-wide">Demo data</span>
      <span style={{ color: "var(--color-foreground)" }}>{org.demoNote}</span>
    </div>
  );
}
