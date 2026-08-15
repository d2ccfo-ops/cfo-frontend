// The theme's two axes, in one place.
//
//   MODE     light / dark / system        -> the `dark` class
//   PALETTE  which hues, chosen PER MODE  -> a `p-*` or `d-*` class
//
// Shared by the picker (Settings -> Preferences) and by ThemeSync (mounted app
// -wide), because both have to apply the same rules and a second copy of the
// class list is a palette that silently stops working in one of them.
//
// A third copy does exist, unavoidably: the pre-paint script in app/layout.js
// is a string injected before any bundle loads, so it cannot import this file.
// Adding a palette means editing both. That is asserted by a test rather than
// left to memory — see lib/theme.test.js.

export const MODE_KEY = "cfoos-theme";
export const LIGHT_KEY = "cfoos-palette-light";
export const DARK_KEY = "cfoos-palette-dark";

/** Palette classes, WITHOUT the p-/d- prefix. Signature is deliberately absent
 *  from both lists: it is the absence of a class, which is what makes the
 *  shipped theme unregressable by anything in the palette layer. */
export const LIGHT_KEYS = ["cream", "oat", "almond", "seasalt", "vanilla", "linen", "mint", "champagne", "mono"];
export const DARK_KEYS = ["obsidian", "navy", "espresso", "forest", "plum", "mono"];

export function isDark(mode) {
  return (
    mode === "dark" ||
    (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  );
}

/**
 * Put the whole theme on <html>.
 *
 * Every class is toggled every time rather than only the newly-chosen one
 * added: a stale p-* left behind from a previous choice keeps winning on
 * specificity, and the picker appears to do nothing.
 *
 * Both palettes stay applied at once and only one can match — the light blocks
 * are guarded by :root:not(.dark), the dark ones by .dark — so a mode switch
 * needs no second pass and cannot momentarily show the wrong palette.
 */
export function applyAll(mode, light, dark) {
  const root = document.documentElement;
  root.classList.toggle("dark", isDark(mode));
  for (const k of LIGHT_KEYS) root.classList.toggle(`p-${k}`, light === k);
  for (const k of DARK_KEYS) root.classList.toggle(`d-${k}`, dark === k);
}

/** The stored choice, with the shipped theme as the default for all three. */
export function readTheme() {
  return {
    mode: localStorage.getItem(MODE_KEY) ?? "system",
    light: localStorage.getItem(LIGHT_KEY) ?? "signature",
    dark: localStorage.getItem(DARK_KEY) ?? "signature",
  };
}
