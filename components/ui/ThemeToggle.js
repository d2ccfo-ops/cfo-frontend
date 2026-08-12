"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

const KEY = "cfoos-theme";

const SUN_PATHS =
  '<circle cx="12" cy="12" r="4"/><path d="M12 3v1.5M12 19.5V21M4.9 4.9l1.1 1.1M18 18l1.1 1.1M3 12h1.5M19.5 12H21M4.9 19.1l1.1-1.1M18 6l1.1-1.1"/>';
const MOON_PATHS = '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/>';
const LAPTOP_PATHS =
  '<rect x="4" y="4" width="16" height="11" rx="1.5"/><path d="M2 19h20" stroke-linecap="round"/>';

function apply(mode) {
  const dark =
    mode === "dark" ||
    (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

const OPTIONS = [
  { k: "light", l: "Light", paths: SUN_PATHS, desc: "Bright console surfaces" },
  { k: "dark", l: "Dark", paths: MOON_PATHS, desc: "Evening-sky navy" },
  { k: "system", l: "System", paths: LAPTOP_PATHS, desc: "Match your device" },
];

/** Theme picker used in Settings → Preferences. */
export default function ThemePicker() {
  // ThemePicker only ever mounts client-side (behind the Settings ->
  // Preferences tab, never present in the initial SSR tree), so reading
  // localStorage in the lazy initializer can't cause a hydration mismatch.
  const [mode, setMode] = useState(() =>
    typeof window === "undefined" ? "system" : localStorage.getItem(KEY) ?? "system"
  );

  const choose = (next) => {
    setMode(next);
    localStorage.setItem(KEY, next);
    apply(next);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {OPTIONS.map((o) => {
        const active = mode === o.k;
        return (
          <button
            key={o.k}
            type="button"
            onClick={() => choose(o.k)}
            aria-pressed={active}
            className={`rounded-xl border p-4 text-left transition-colors ${
              active
                ? "border-primary bg-primary-soft text-primary"
                : "border-border text-foreground hover:bg-muted"
            }`}
          >
            <Icon paths={o.paths} size={20} strokeWidth={1.8} />
            <div className="mt-2 text-sm font-medium">{o.l}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{o.desc}</div>
          </button>
        );
      })}
    </div>
  );
}
