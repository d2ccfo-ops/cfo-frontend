"use client";

import { useCallback, useEffect, useState } from "react";

// Pinch / ctrl-wheel zoom and two-finger pan for a chart.
//
// Returns a CALLBACK ref, not a useRef object, and that is the whole reason
// this file was rewritten once. With a useRef the effect runs on mount, reads
// `ref.current`, and finds null whenever the chart is behind a loading branch —
// which it always is on first paint. Nothing in the dependency list changes when
// the real node later mounts, so the effect never runs again and the wheel
// listener is never attached. The buttons worked; the pinch silently did not.
// A callback ref puts the node in state, so attaching it re-runs the effect.
//
// Two further decisions, both the opposite of the naive implementation:
//
// 1. A PLAIN vertical wheel does NOT zoom. This chart sits in the middle of a
//    scrolling dashboard, and hijacking the scroll wheel over it means the page
//    stops halfway down and starts zooming a chart nobody was pointing at.
//    Zoom is pinch (which macOS delivers as wheel + ctrlKey), an explicit
//    ctrl/⌘ + wheel, or the buttons.
// 2. The listener is registered with `{ passive: false }` via addEventListener
//    rather than as an onWheel prop. React attaches wheel listeners passively,
//    so preventDefault() from a JSX handler is ignored and the browser zooms
//    the whole page instead of the chart.
//
// onZoom is called with a MULTIPLIER on the current span (0.9 = show 10% less
// time), not with an "in"/"out" direction. A trackpad pinch fires dozens of
// small wheel events per gesture; a fixed step per event would collapse six
// months to a week in a flick. A multiplier derived from the event's own delta
// makes the window track the fingers.
const PINCH_SENSITIVITY = 0.015;

// One event should never do more than halve or double the span, however large a
// delta a mouse decides to send.
const MAX_STEP = 2;

export default function useChartZoom({ onZoom, onPan, enabled = true }) {
  const [node, setNode] = useState(null);
  const ref = useCallback((next) => setNode(next), []);

  useEffect(() => {
    if (!node || !enabled) return undefined;

    // Where in the plot the pointer is, 0 at the left edge and 1 at the right.
    // The zoom anchors on this so the date under the cursor stays put.
    const fractionOf = (clientX) => {
      const rect = node.getBoundingClientRect();
      if (rect.width === 0) return 0.5;
      return (clientX - rect.left) / rect.width;
    };

    const clampFactor = (f) => Math.min(MAX_STEP, Math.max(1 / MAX_STEP, f));

    function onWheel(e) {
      // macOS trackpad pinch arrives as a wheel event with ctrlKey set, which
      // is why this single branch covers both pinch and ctrl+wheel.
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        // deltaY is negative when spreading the fingers (zoom in), so the
        // exponent shrinks the span. Exponential rather than linear because
        // spans are multiplicative: one notch should mean "20% less time"
        // whether you are looking at two years or two weeks.
        onZoom?.(clampFactor(Math.exp(e.deltaY * PINCH_SENSITIVITY)), fractionOf(e.clientX));
        return;
      }
      // Horizontal intent — a two-finger sideways swipe, or shift+wheel —
      // pans. Requiring the horizontal delta to dominate keeps an ordinary
      // diagonal scroll from nudging the window while the page moves.
      const horizontal = e.shiftKey ? e.deltaY : e.deltaX;
      const vertical = e.shiftKey ? e.deltaX : e.deltaY;
      if (Math.abs(horizontal) > Math.abs(vertical) && Math.abs(horizontal) > 1) {
        e.preventDefault();
        onPan?.(horizontal > 0 ? 1 : -1);
      }
      // Anything else: left alone, so the page scrolls.
    }

    // Touch pinch, for tablets. The span tracks the ratio between the fingers'
    // current distance and their distance one event ago, which is the same
    // multiplicative model the wheel branch uses.
    let lastDistance = null;
    let midpointX = 0;
    const distance = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    function onTouchStart(e) {
      if (e.touches.length === 2) {
        lastDistance = distance(e.touches);
        midpointX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      }
    }
    function onTouchMove(e) {
      if (e.touches.length !== 2 || lastDistance === null) return;
      e.preventDefault();
      const dist = distance(e.touches);
      if (dist === 0) return;
      // Fingers further apart → smaller span.
      onZoom?.(clampFactor(lastDistance / dist), fractionOf(midpointX));
      lastDistance = dist;
      midpointX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    }
    function onTouchEnd(e) {
      if (e.touches.length < 2) lastDistance = null;
    }

    node.addEventListener("wheel", onWheel, { passive: false });
    node.addEventListener("touchstart", onTouchStart, { passive: true });
    node.addEventListener("touchmove", onTouchMove, { passive: false });
    node.addEventListener("touchend", onTouchEnd, { passive: true });
    node.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      node.removeEventListener("wheel", onWheel);
      node.removeEventListener("touchstart", onTouchStart);
      node.removeEventListener("touchmove", onTouchMove);
      node.removeEventListener("touchend", onTouchEnd);
      node.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [node, enabled, onZoom, onPan]);

  return ref;
}
