"use client";

import { useLayoutEffect, useRef } from "react";

// FLIP (First, Last, Invert, Play) reorder animation.
//
// Children inside `containerRef` that carry a `data-flip-key` are measured
// after every render. When a key's box has moved since the last render, the
// element is snapped back to its old position with a transform and animated
// to zero — so a list reorder reads as cards sliding to their new slots
// rather than teleporting. Runs off layout, so it never fights React over
// where the elements actually belong.
export default function useFlipList(containerRef, deps, { duration = 240 } = {}) {
  const previous = useRef(new Map());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const nodes = container.querySelectorAll("[data-flip-key]");
    const current = new Map();
    nodes.forEach((node) => current.set(node.dataset.flipKey, node.getBoundingClientRect()));

    // Respect a user's reduced-motion preference — still record positions so
    // the next pass has a baseline, just don't animate the delta.
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (!reduced) {
      nodes.forEach((node) => {
        const before = previous.current.get(node.dataset.flipKey);
        const after = current.get(node.dataset.flipKey);
        if (!before || !after) return;

        const dx = before.left - after.left;
        const dy = before.top - after.top;
        if (dx === 0 && dy === 0) return;

        const animation = node.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
          { duration, easing: "cubic-bezier(0.2, 0, 0, 1)" },
        );

        // A card in flight sits under the cursor at a position that no longer
        // matches its index, so letting it answer dragover would bounce the
        // list between two orders. Ignore pointer input until it lands.
        node.style.pointerEvents = "none";
        animation.finished
          .catch(() => {})
          .finally(() => {
            node.style.pointerEvents = "";
          });
      });
    }

    previous.current = current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
