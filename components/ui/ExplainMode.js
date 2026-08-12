"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import DefinitionDialog from "./DefinitionDialog";
import { getDefinition } from "@/lib/definitions";

// "What's this?" mode. Click the ? in the header, then click anything on the
// page to be told what it is and how it was calculated.
//
// The alternative — putting a visible info affordance on every explainable
// element at once — was rejected: the dashboard has around seventy of them, and
// seventy dotted underlines is a page nobody can read. So the affordances stay
// quiet until asked for, and this mode reveals all of them at once.
//
// How the picking works: elements carry `data-explain-term`, and a single
// CAPTURE-phase click listener walks up from whatever was clicked to the
// nearest one. Capture phase, and preventDefault + stopPropagation, because in
// this mode a click on a card must NOT also follow the card's link, open its
// drawer, or toggle its filter — the click is a question, not an action.

const ExplainModeContext = createContext({ active: false, toggle: () => {}, exit: () => {} });

export function useExplainMode() {
  return useContext(ExplainModeContext);
}

// Set on any element that should be pickable. Guarded on the caller's side by
// hasDefinition(), so nothing is highlighted that would then explain nothing.
export function explainAttrs(term) {
  return getDefinition(term) === null ? {} : { "data-explain-term": typeof term === "string" ? term : "" };
}

export default function ExplainModeProvider({ children }) {
  const [active, setActive] = useState(false);
  const [term, setTerm] = useState(null);
  // Set when someone picks a spot with nothing recorded behind it. Saying so is
  // the honest answer; silently doing nothing reads as a broken button.
  const [miss, setMiss] = useState(false);

  const exit = useCallback(() => setActive(false), []);
  const toggle = useCallback(() => setActive((v) => !v), []);

  // The body class drives the cursor and the dashed outlines (see globals.css).
  // Doing it in CSS rather than per-element means the ~70 pickable elements
  // don't each need to subscribe to this context and re-render on toggle.
  useEffect(() => {
    if (!active) return undefined;
    document.body.classList.add("explain-mode");
    return () => document.body.classList.remove("explain-mode");
  }, [active]);

  useEffect(() => {
    if (!active) return undefined;

    function onClick(e) {
      // While a definition is open, the mode gets out of the way entirely.
      // Otherwise the overlay click that dismisses the dialog is swallowed by
      // the very handler that opened it, and the only way out is Escape.
      if (term !== null) return;

      // The toggle itself, and anything inside a dialog, stay clickable —
      // otherwise the mode can be entered and never left.
      if (e.target.closest?.("[data-explain-ignore], [role='dialog']")) return;

      e.preventDefault();
      e.stopPropagation();

      const hit = e.target.closest?.("[data-explain-term]");
      if (hit) {
        setMiss(false);
        setTerm(hit.getAttribute("data-explain-term"));
      } else {
        setMiss(true);
        window.setTimeout(() => setMiss(false), 2200);
      }
    }

    // Escape closes the definition first, and only leaves the mode on a second
    // press — one key press should undo one thing.
    function onKey(e) {
      if (e.key !== "Escape") return;
      if (term !== null) return;
      setActive(false);
    }

    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [active, term]);

  const value = useMemo(() => ({ active, toggle, exit }), [active, toggle, exit]);

  return (
    <ExplainModeContext.Provider value={value}>
      {children}

      {active ? (
        <div
          data-explain-ignore
          className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4"
          // Purely an announcement — it must never sit between the pointer and
          // the thing being picked.
          style={{ pointerEvents: "none" }}
        >
          <div
            className="flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2.5 text-[13px] shadow-raised"
            style={{ pointerEvents: "auto" }}
          >
            <span className="grid h-5 w-5 place-items-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary">
              ?
            </span>
            <span className="text-foreground">
              {miss ? "Nothing is recorded for that — try an outlined element." : "Click anything outlined to see what it is and how it's calculated."}
            </span>
            <button
              type="button"
              data-explain-ignore
              onClick={exit}
              className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Done · Esc
            </button>
          </div>
        </div>
      ) : null}

      <DefinitionDialog open={term !== null} term={term ?? undefined} onClose={() => setTerm(null)} />
    </ExplainModeContext.Provider>
  );
}
