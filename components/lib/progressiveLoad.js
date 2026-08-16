"use client";

// FIRE EVERYTHING AT ONCE, PAINT EACH ANSWER THE MOMENT IT ARRIVES.
//
// Every page here used to fetch with `await Promise.all([...])`, which is a
// BARRIER: the responses are collected and only then applied, so the whole
// screen moves at the speed of its slowest request. Measured on the live
// deployment, the overview fires seventeen requests — the cheapest answers in
// ~40ms and the dearest in ~1,000ms, and with a barrier the reader waits the
// full second to see any of them. Nothing about the data requires that: the
// figures are independent, and a card that has its number has it.
//
// So this runs the same requests concurrently and hands each result to its own
// setter as it lands. React batches state updates within a tick, so responses
// arriving together paint together, and one that arrives late paints late —
// without holding up the ones already in hand.
//
// The returned promise resolves when everything has settled. That is for
// bookkeeping only (clearing a page-level flag, logging); no rendering may
// wait on it, or the barrier is back.
//
// WHAT THIS MUST NEVER DO IS PAINT A FALSE EMPTY STATE. A card whose request
// is still in flight is not "Not connected" and not "₹0" — it is unknown, and
// the honest rendering of unknown is a skeleton. That is why onSettled reports
// per-key completion: the page keeps a set of still-pending keys and each card
// shows its own skeleton until its own source has answered. Rendering a card
// against a null payload before its request has settled would state, in
// confident type, that a source is missing when it is merely slow.

/**
 * @param {Array<{key: string, url: string, apply: (data: any) => void}>} requests
 * @param {{init?: RequestInit, isCancelled?: () => boolean, onSettled?: (key: string, ok: boolean) => void}} options
 * @returns {Promise<{ok: number, failed: number}>} counts, once everything has settled
 */
export function loadProgressively(requests, { init, isCancelled, onSettled } = {}) {
  const cancelled = isCancelled ?? (() => false);
  let ok = 0;
  let failed = 0;

  return Promise.all(
    requests.map(({ key, url, apply }) =>
      fetch(url, init)
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
        .then((data) => {
          // A superseded load (the reader moved the date picker again) must
          // not write its answer over the newer one's.
          if (cancelled()) return;
          apply(data);
          ok += 1;
          onSettled?.(key, true);
        })
        .catch((err) => {
          if (cancelled()) return;
          // An aborted request is not a failure — it is a request we chose to
          // stop caring about, and its card belongs to the newer load.
          if (err?.name === "AbortError") return;
          failed += 1;
          // Still reported as settled: the card must stop showing a skeleton
          // and fall through to its real "no data" state, which is now the
          // truth for this key.
          onSettled?.(key, false);
        })
    )
  ).then(() => ({ ok, failed }));
}
