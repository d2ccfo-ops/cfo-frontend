"use client";

import { useAuth } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

// WHAT THE BROWSER MEASURED, AND WHAT IT THREW.
//
// The backend already times its own handlers, and that number can be excellent
// while this app is unusable: it excludes DNS, TLS, the network, the JavaScript
// bundle, hydration, and the several sequential fetches a page makes before it
// renders anything. An 8ms server p95 and a six-second largest-contentful-paint
// are perfectly compatible, and only one of them is what the customer sees.
//
// It also records nothing about a component that throws during render — that
// returns HTTP 200 and a blank screen.
//
// NO DEPENDENCY. The `web-vitals` package would be the obvious reach, and it is
// ~5KB on a page whose whole point is to be measured for weight. Every metric
// below comes from PerformanceObserver, which is what that package wraps.
//
// ONE HONEST APPROXIMATION, LABELLED: real INP is the 98th percentile of a
// visit's interaction latencies. This sends the WORST interaction instead,
// which is a strict upper bound. It is reported as `inp` because that is the
// band it is judged against; the difference matters on pages with hundreds of
// interactions and not on these.

const API = process.env.NEXT_PUBLIC_API_URL;

/** Google's published Web Vitals bands are applied server-side; this only measures. */
function collect() {
  const state = { lcp: null, fcp: null, ttfb: null, cls: 0, inp: null, sawShift: false };
  const observers = [];

  const observe = (type, handler, extra) => {
    try {
      const po = new PerformanceObserver((list) => list.getEntries().forEach(handler));
      po.observe({ type, buffered: true, ...extra });
      observers.push(po);
    } catch {
      // An unsupported entry type is not an error worth surfacing; it means
      // this browser cannot report that metric, and a null is the honest value.
    }
  };

  observe("largest-contentful-paint", (e) => {
    state.lcp = e.startTime;
  });
  observe("paint", (e) => {
    if (e.name === "first-contentful-paint") state.fcp = e.startTime;
  });
  observe("layout-shift", (e) => {
    // hadRecentInput excludes shifts the user caused by interacting — those are
    // expected movement, not instability, and counting them makes every
    // interactive page look broken.
    if (!e.hadRecentInput) {
      state.cls += e.value;
      state.sawShift = true;
    }
  });
  observe("event", (e) => {
    if (state.inp === null || e.duration > state.inp) state.inp = e.duration;
  }, { durationThreshold: 40 });

  const nav = performance.getEntriesByType?.("navigation")?.[0];
  if (nav && nav.responseStart > 0) state.ttfb = nav.responseStart;

  return {
    state,
    stop: () => observers.forEach((o) => o.disconnect()),
  };
}

export default function Telemetry() {
  const pathname = usePathname();
  const { getToken, isSignedIn } = useAuth();
  const sent = useRef(false);
  // getToken is something the error handler CALLS, not something it reacts to.
  // Held in a ref and refreshed in its own effect — assigning during render is
  // a mutation React is allowed to discard, and listing it as an effect
  // dependency would tear down and re-register the window listeners on every
  // Clerk session refresh.
  const tokenRef = useRef(getToken);
  useEffect(() => {
    tokenRef.current = getToken;
  }, [getToken]);

  // ---- Web Vitals ----
  useEffect(() => {
    if (!API || typeof PerformanceObserver === "undefined") return undefined;
    sent.current = false;
    const { state, stop } = collect();

    const flush = () => {
      if (sent.current) return;
      sent.current = true;
      stop();
      const metrics = {};
      if (state.lcp !== null) metrics.lcp = Math.round(state.lcp);
      if (state.fcp !== null) metrics.fcp = Math.round(state.fcp);
      if (state.ttfb !== null) metrics.ttfb = Math.round(state.ttfb);
      if (state.inp !== null) metrics.inp = Math.round(state.inp);
      // Only when a shift was actually observed. Sending 0 for a browser that
      // does not support layout-shift would report perfect stability for a page
      // nothing measured.
      if (state.sawShift) metrics.cls = Number(state.cls.toFixed(4));
      if (Object.keys(metrics).length === 0) return;

      const body = JSON.stringify({ route: pathname, metrics });
      // sendBeacon survives the page being torn down, which fetch does not —
      // and the moment worth measuring is precisely the moment the user leaves.
      // It cannot set an Authorization header, which is why the vitals endpoint
      // accepts anonymous callers and aggregates into fixed rows.
      if (navigator.sendBeacon) {
        navigator.sendBeacon(`${API}/telemetry/vitals`, new Blob([body], { type: "application/json" }));
      } else {
        fetch(`${API}/telemetry/vitals`, { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
      }
    };

    // hidden, not unload. Mobile Safari frequently never fires unload at all,
    // so a page closed on a phone would report nothing — which would quietly
    // bias every metric here toward desktop.
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    // Also on route change, via cleanup — a single-page navigation is a new
    // page to the user and never fires visibilitychange.
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [pathname]);

  // ---- uncaught exceptions ----
  useEffect(() => {
    if (!API) return undefined;

    const report = async (name, message, stack, kind) => {
      if (!isSignedIn || !message) return;
      try {
        const token = await tokenRef.current();
        if (!token) return;
        await fetch(`${API}/telemetry/errors`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          keepalive: true,
          body: JSON.stringify({ name, message, stack, route: pathname, kind }),
        });
      } catch {
        // A failed error report must never itself surface. It would be the one
        // exception guaranteed to fire in a loop.
      }
    };

    const onError = (e) => void report(e.error?.name ?? "Error", e.message, e.error?.stack, "window.onerror");
    const onRejection = (e) => {
      const r = e.reason;
      void report(r?.name ?? "UnhandledRejection", r?.message ?? String(r), r?.stack, "unhandledrejection");
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [pathname, isSignedIn]);

  return null;
}
