"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { applyAll, DARK_KEY, isDark, LIGHT_KEY, MODE_KEY, readTheme } from "@/lib/theme";

// Two axes that do NOT multiply into one list.
//
//   MODE     light / dark / system        -> the `dark` class
//   PALETTE  which hues, chosen PER MODE  -> a `p-*` or `d-*` class
//
// The light choice and the dark choice are stored separately and BOTH stay
// applied to <html> at once. Only one can ever match, because the light blocks
// in globals.css are guarded by :root:not(.dark) and the dark blocks by .dark.
// That is what lets someone run a cream light theme and a forest dark theme
// without either overwriting the other — and why switching mode reveals the
// palette already chosen for that mode instead of resetting it.
//
// SIGNATURE IS THE ABSENCE OF A CLASS, in both modes. The theme this app ships
// with is :root and .dark themselves, so nothing in the palette layer can
// regress it — including a future palette added carelessly.
const SUN_PATHS =
  '<circle cx="12" cy="12" r="4"/><path d="M12 3v1.5M12 19.5V21M4.9 4.9l1.1 1.1M18 18l1.1 1.1M3 12h1.5M19.5 12H21M4.9 19.1l1.1-1.1M18 6l1.1-1.1"/>';
const MOON_PATHS = '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/>';
const LAPTOP_PATHS =
  '<rect x="4" y="4" width="16" height="11" rx="1.5"/><path d="M2 19h20" stroke-linecap="round"/>';
const CIRCLE_PATHS = '<circle cx="12" cy="12" r="9"/>';
const CONTRAST_PATHS = '<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18Z" fill="currentColor"/>';
const WHEAT_PATHS = '<path d="M12 21V9"/><path d="M12 9c0-3 2-5 4-5 0 3-2 5-4 5Z"/><path d="M12 9C12 6 10 4 8 4c0 3 2 5 4 5Z"/><path d="M12 15c0-3 2-5 4-5 0 3-2 5-4 5Z"/><path d="M12 15c0-3-2-5-4-5 0 3 2 5 4 5Z"/>';
const CROISSANT_PATHS = '<path d="M4 15a8 8 0 0 1 16 0c0 1.5-1 2.5-2 2l-1.5-.7a2 2 0 0 0-2 .2l-.8.6a2 2 0 0 1-2.4 0l-.8-.6a2 2 0 0 0-2-.2L6 17c-1 .5-2-.5-2-2Z"/>';
const FEATHER_PATHS = '<path d="M20.2 4a5.5 5.5 0 0 0-7.8 0L5 11.4V19h7.6l7.6-7.4a5.5 5.5 0 0 0 0-7.6Z"/><path d="M16 8 5 19"/>';
const WAVES_PATHS = '<path d="M2 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 20c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>';
const SPARKLES_PATHS = '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/><path d="M19 15.5 19.8 18l2.2.8-2.2.8-.8 2.4-.8-2.4-2.2-.8 2.2-.8Z"/>';
const LEAF_PATHS = '<path d="M11 20A7 7 0 0 1 4 13c0-6 5-9 16-9 0 11-3 16-9 16Z"/><path d="M8 17c3-4 6-6 10-7"/>';
const DROPLETS_PATHS = '<path d="M12 3.3 6.9 9a7.2 7.2 0 1 0 10.2 0Z"/>';
const DIAMOND_PATHS = '<path d="m12 3 9 9-9 9-9-9Z"/>';
const TREES_PATHS = '<path d="M12 2 6.5 10h3L5 17h14l-4.5-7h3Z"/><path d="M12 17v5"/>';

// The swatches are the point of these cards: four colours the palette actually
// resolves to — canvas, card, ink, accent — so a name like "Almond & Mocha"
// does not have to be trusted. Copied from the reference's own swatch arrays.
const LIGHT_PALETTES = [
  { k: "signature", l: "Signature", paths: CIRCLE_PATHS, desc: "This console's own cool grey and amber", sw: ["#f3f4f6", "#ffffff", "#1f2430", "#e08b3c"] },
  { k: "cream", l: "Butterscotch", paths: CROISSANT_PATHS, desc: "Creamy off-white, caramel warmth", sw: ["#f8f2e4", "#fffaf0", "#4b3a24", "#d79a45"] },
  { k: "oat", l: "Oat Milk", paths: WHEAT_PATHS, desc: "Oatmeal warmth with soft sage", sw: ["#f4f0e6", "#fbf8f1", "#3b342a", "#6f8f76"] },
  { k: "almond", l: "Almond & Mocha", paths: FEATHER_PATHS, desc: "Beige canvas, espresso ink", sw: ["#f3ebe1", "#fbf5ee", "#3a2c22", "#8a5b3c"] },
  { k: "seasalt", l: "Sea Salt", paths: WAVES_PATHS, desc: "Cool white-blue, slate ink", sw: ["#f2f5f8", "#fdfeff", "#2a3138", "#4b9bc4"] },
  { k: "vanilla", l: "Vanilla Bean", paths: SPARKLES_PATHS, desc: "Vanilla white, butter accent", sw: ["#f8f5e6", "#fffdf2", "#26241c", "#e6c344"] },
  { k: "linen", l: "Linen & Clay", paths: LEAF_PATHS, desc: "Unbleached linen, terracotta", sw: ["#f1eee6", "#fbf9f4", "#26221c", "#b96a3c"] },
  { k: "mint", l: "Mint Frost", paths: DROPLETS_PATHS, desc: "Pale mint with forest ink", sw: ["#eef6f1", "#fafefb", "#22332b", "#4fa885"] },
  { k: "champagne", l: "Champagne & Slate", paths: DIAMOND_PATHS, desc: "Champagne gold, slate text", sw: ["#f6f2e8", "#fdfbf6", "#333b45", "#b79a55"] },
  { k: "mono", l: "Black & white", paths: CONTRAST_PATHS, desc: "Pure greyscale, no colour", sw: ["#f2f2f2", "#ffffff", "#1a1a1a", "#8a8a8a"] },
];

const DARK_PALETTES = [
  // First and default, and deliberately not the reference's Obsidian: this is
  // the dark theme this console already shipped, and it stays the one you get
  // by doing nothing.
  { k: "signature", l: "Signature", paths: CIRCLE_PATHS, desc: "This console's own evening navy", sw: ["#141a2b", "#1e2740", "#f0f1f4", "#e8a05a"] },
  { k: "obsidian", l: "Obsidian", paths: DROPLETS_PATHS, desc: "Shiny black with amber accent", sw: ["#0c0d11", "#1b1d24", "#e9eaee", "#e2a44b"] },
  { k: "navy", l: "Midnight Navy", paths: MOON_PATHS, desc: "Deep evening-sky blue", sw: ["#0e1220", "#1b2135", "#e7eaf3", "#7aa7e8"] },
  { k: "espresso", l: "Toasted Espresso", paths: CROISSANT_PATHS, desc: "Warm coffee-black", sw: ["#181310", "#241c17", "#f2e9dc", "#e0ac60"] },
  { k: "forest", l: "Deep Forest", paths: TREES_PATHS, desc: "Black-green with mint accent", sw: ["#0c1512", "#17231e", "#e6f0ea", "#63c8a0"] },
  { k: "plum", l: "Noir Plum", paths: SPARKLES_PATHS, desc: "Black violet with orchid accent", sw: ["#130f16", "#211a26", "#f0e9f2", "#c78ada"] },
  { k: "mono", l: "Black & white", paths: CONTRAST_PATHS, desc: "Pure greyscale, no colour", sw: ["#141414", "#232323", "#f2f2f2", "#8a8a8a"] },
];

const MODES = [
  { k: "light", l: "Light", paths: SUN_PATHS, desc: "Bright console surfaces" },
  { k: "dark", l: "Dark", paths: MOON_PATHS, desc: "Low-light surfaces" },
  { k: "system", l: "System", paths: LAPTOP_PATHS, desc: "Match your device" },
];

/** Theme + palette picker used in Settings → Preferences. */
export default function ThemePicker() {
  // ThemePicker only ever mounts client-side (behind the Settings ->
  // Preferences tab, never present in the initial SSR tree), so reading
  // localStorage in the lazy initializer can't cause a hydration mismatch.
  const [mode, setMode] = useState(() =>
    typeof window === "undefined" ? "system" : localStorage.getItem(MODE_KEY) ?? "system"
  );
  const [light, setLight] = useState(() =>
    typeof window === "undefined" ? "signature" : localStorage.getItem(LIGHT_KEY) ?? "signature"
  );
  const [dark, setDark] = useState(() =>
    typeof window === "undefined" ? "signature" : localStorage.getItem(DARK_KEY) ?? "signature"
  );
  const [darkActive, setDarkActive] = useState(false);

  // Which list to show is a RESOLVED question, not a stored one — on "system"
  // it depends on the OS. Read after mount so the server and the first client
  // render agree, and keep listening: the palette list must follow the OS
  // flipping at sunset, or the founder is editing the theme they cannot see.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    // Re-APPLIES, not just re-labels. The earlier version called only
    // setDarkActive, so an OS flip swapped the card list to the other mode's
    // palettes while <html> kept the old class — the page stayed light while
    // the picker claimed to be editing dark. ThemeSync does the same job
    // app-wide; this keeps the cards in step on this screen.
    const sync = () => {
      const t = readTheme();
      applyAll(t.mode, t.light, t.dark);
      setDarkActive(isDark(t.mode));
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const commit = useCallback((nextMode, nextLight, nextDark) => {
    localStorage.setItem(MODE_KEY, nextMode);
    localStorage.setItem(LIGHT_KEY, nextLight);
    localStorage.setItem(DARK_KEY, nextDark);
    applyAll(nextMode, nextLight, nextDark);
    setDarkActive(isDark(nextMode));
  }, []);

  const chooseMode = (next) => {
    setMode(next);
    commit(next, light, dark);
  };

  const choosePalette = (next) => {
    if (darkActive) setDark(next);
    else setLight(next);
    commit(mode, darkActive ? light : next, darkActive ? next : dark);
  };

  const list = darkActive ? DARK_PALETTES : LIGHT_PALETTES;
  const activeKey = darkActive ? dark : light;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {MODES.map((o) => {
          const active = mode === o.k;
          return (
            <button
              key={o.k}
              type="button"
              onClick={() => chooseMode(o.k)}
              aria-pressed={active}
              className={`cursor-pointer rounded-xl border p-4 text-left transition-colors ${
                active
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border bg-transparent text-foreground hover:bg-muted"
              }`}
            >
              <Icon paths={o.paths} size={20} strokeWidth={1.8} />
              <div className="mt-2 text-sm font-medium">{o.l}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{o.desc}</div>
            </button>
          );
        })}
      </div>

      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Colour palette
        </div>
        {/* Says which list this is, because the cards change under you when the
            mode changes and an unlabelled swap looks like a bug. */}
        <p className="mb-3 text-xs text-muted-foreground">
          {darkActive
            ? "For dark mode. Your light-mode palette is kept separately and returns when you switch back."
            : "For light mode. Your dark-mode palette is kept separately and returns when you switch back."}
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => {
            const active = activeKey === p.k;
            return (
              <button
                key={p.k}
                type="button"
                onClick={() => choosePalette(p.k)}
                aria-pressed={active}
                className={`cursor-pointer rounded-xl border p-4 text-left transition-colors ${
                  active
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border bg-transparent text-foreground hover:bg-muted"
                }`}
              >
                <Icon paths={p.paths} size={20} strokeWidth={1.8} />
                <div className="mt-2 text-sm font-medium">{p.l}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{p.desc}</div>
                {/* Canvas, card, ink, accent — so the name does not have to be
                    taken on trust. ring-black/10 rather than a border token:
                    these must read the same against every palette's card. */}
                <div className="mt-3 flex gap-1">
                  {p.sw.map((c) => (
                    <span
                      key={c}
                      className="h-4 w-4 rounded-full ring-1 ring-black/10"
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
