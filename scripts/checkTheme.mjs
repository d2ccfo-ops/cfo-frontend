import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The palette class list exists in three places, and it has to. Two are JS and
// share lib/theme.js; the third is the pre-paint string in app/layout.js, which
// is injected before any bundle loads and therefore cannot import anything.
//
// This asserts they agree, because every way they can disagree is silent:
//
//   in the picker, missing from CSS      a card that does nothing when clicked
//   in CSS, missing from the picker      a palette nobody can reach
//   missing from the init script         correct after hydration, wrong on the
//                                        first paint of every reload — the
//                                        exact flash the script exists to stop
//
// Also asserts that Signature is nowhere: it must stay the ABSENCE of a class
// (:root and .dark themselves), which is what makes the shipped theme
// unregressable by anything in the palette layer.
//
// Run with: npm run check:theme

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const css = read("app/globals.css");
const theme = read("lib/theme.js");
const layout = read("app/layout.js");

const set = (xs) => new Set(xs);
const list = (s) => [...s].sort();

const cssLight = set([...css.matchAll(/:root:not\(\.dark\)\.p-([a-z]+)/g)].map((m) => m[1]));
const cssDark = set([...css.matchAll(/\.dark\.d-([a-z]+)/g)].map((m) => m[1]));

const arr = (src, name) => {
  const m = src.match(new RegExp(`${name}\\s*=\\s*\\[([^\\]]*)\\]`));
  return set(m ? [...m[1].matchAll(/"([a-z]+)"/g)].map((x) => x[1]) : []);
};
const themeLight = arr(theme, "LIGHT_KEYS");
const themeDark = arr(theme, "DARK_KEYS");
const initLight = arr(layout, "var L");
const initDark = arr(layout, "var D");

const problems = [];

const compare = (label, sets) => {
  const [first, ...rest] = sets;
  const same = rest.every((s) => s.set.size === first.set.size && [...s.set].every((k) => first.set.has(k)));
  if (same) {
    console.log(`  OK  ${label.padEnd(6)} ${first.set.size} palettes agree across all three: ${list(first.set).join(", ")}`);
    return;
  }
  problems.push(label);
  console.log(`  FAIL ${label}`);
  for (const s of sets) console.log(`       ${s.name.padEnd(18)} ${list(s.set).join(", ")}`);
  for (const s of rest) {
    const missing = list(first.set).filter((k) => !s.set.has(k));
    const extra = list(s.set).filter((k) => !first.set.has(k));
    if (missing.length) console.log(`       ${s.name} is MISSING: ${missing.join(", ")}`);
    if (extra.length) console.log(`       ${s.name} has EXTRA:   ${extra.join(", ")}`);
  }
};

console.log("Palette class lists\n");
compare("light", [
  { name: "globals.css", set: cssLight },
  { name: "lib/theme.js", set: themeLight },
  { name: "layout.js init", set: initLight },
]);
compare("dark", [
  { name: "globals.css", set: cssDark },
  { name: "lib/theme.js", set: themeDark },
  { name: "layout.js init", set: initDark },
]);

console.log("\nSignature stays classless");
const stray = [
  ["app/globals.css", css],
  ["lib/theme.js", theme],
  ["app/layout.js", layout],
  ["components/ui/ThemeToggle.js", read("components/ui/ThemeToggle.js")],
].filter(([, src]) => /[.pd]-signature\b/.test(src));
if (stray.length === 0) {
  console.log("  OK  no p-signature / d-signature class anywhere");
} else {
  problems.push("signature");
  for (const [f] of stray) console.log(`  FAIL ${f} defines a signature palette class`);
}

// The shipped dark theme must remain the navy one. Obsidian is a palette you
// can choose, never the thing .dark becomes.
console.log("\nShipped theme intact");
const darkBlock = css.match(/(?:^|\n)\.dark \{([\s\S]*?)\n\}/);
const bg = darkBlock && darkBlock[1].match(/--background:\s*([^;]+);/);
if (bg && bg[1].includes("0.203")) {
  console.log(`  OK  .dark --background is still Signature navy (${bg[1].trim()})`);
} else {
  problems.push("signature-dark");
  console.log(`  FAIL .dark --background is ${bg ? bg[1].trim() : "unreadable"} — expected the 0.203 navy`);
}

if (problems.length > 0) {
  console.log(`\n${problems.length} problem(s). A palette must be added to globals.css, lib/theme.js AND the`);
  console.log("init script in app/layout.js — the third is a string and cannot import the second.");
  process.exit(1);
}
console.log("\nAll theme checks passed");
