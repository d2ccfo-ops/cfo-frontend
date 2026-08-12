import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { getDefinition } from "../lib/definitions.js";

// Everything calculated in this app can explain itself. This asserts that the
// promise is kept: every metric card label, and every `term="…"` passed to
// <Explain>, <StatusBadge>, <FinancialChart> or <NoDataPanel>, resolves to an
// entry in lib/definitions.js.
//
// It exists because both failure modes are silent. A card ships with no
// definition and degrades to "nothing recorded", which nobody sees until a
// founder right-clicks it six weeks later. A term is misspelled and the
// affordance simply vanishes — no error, no underline, no dialog, just a piece
// of text that quietly stopped being explainable.
//
// Run with: npm run check:definitions

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const files = [];
for (const dir of [join(ROOT, "app"), join(ROOT, "components")]) {
  (function walk(d) {
    for (const entry of readdirSync(d)) {
      const path = join(d, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (entry.endsWith(".js")) files.push(path);
    }
  })(dir);
}

// Three shapes carry something that must resolve: a <Metric>/<MetricCard> with
// a literal label, the Overview's METRICS_RAW/EXTRA_METRICS definition objects
// (the only place a card is described without being rendered), and any literal
// `term="…"`.
const referenced = new Map();
const note = (key, file, kind) => {
  if (!referenced.has(key)) referenced.set(key, { file, kind });
};

for (const file of files) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/<Metric\b[^>]*?label="([^"]+)"/gs)) note(m[1], file, "card label");
  for (const m of src.matchAll(/\{\s*label:\s*"([^"]+)",\s*goodDirection/g)) note(m[1], file, "card label");
  for (const m of src.matchAll(/\bterm="([^"{}]+)"/g)) note(m[1], file, "term");

  // Reconciliation statuses are passed as a template literal
  // (`status-${r.status}`), which no regex over the JSX can see. The set of
  // statuses is enumerated in ReconciliationTable's STATUS_DISPLAY, so the keys
  // of that object are read directly — this is the one place a missing
  // definition would be invisible to the scan above AND user-facing on the
  // busiest table in the app.
  const statusBlock = src.match(/const STATUS_DISPLAY = \{([\s\S]*?)\n\};/);
  if (statusBlock) {
    for (const m of statusBlock[1].matchAll(/^\s{2}(\w+):/gm)) {
      note(`status-${m[1].replaceAll("_", "-")}`, file, "status");
    }
  }
}

const missing = [...referenced].filter(([key]) => getDefinition(key) === null);

for (const [key, { file, kind }] of missing.sort()) {
  console.log(`  MISSING  ${kind.padEnd(11)} ${key.padEnd(34)} ${relative(ROOT, file)}`);
}
console.log(`\n${referenced.size - missing.length}/${referenced.size} referenced definitions resolve`);

if (missing.length > 0) {
  console.log(
    "\nAdd each to lib/definitions.js — transcribed from the cfo-backend module\n" +
      "that computes it, not written from what the label sounds like."
  );
  process.exit(1);
}
