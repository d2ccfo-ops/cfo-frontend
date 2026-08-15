"use client";

import { useEffect } from "react";
import { applyAll, readTheme } from "@/lib/theme";

/**
 * Keeps the theme correct while the page is open, on "system" mode.
 *
 * The pre-paint script in app/layout.js resolves the theme ONCE per load. On
 * mode="system" that resolution can go stale without a reload: the OS flips to
 * dark at sunset, or the user changes it in another window, and the app keeps
 * rendering the mode it started in — nothing else re-evaluates the media query.
 *
 * Mounted app-wide from the root layout rather than inside the picker, which is
 * the actual bug this replaced: the listener lived in ThemePicker, so it only
 * existed on Settings -> Preferences. Everywhere else an OS flip did nothing,
 * and even on that page the handler only re-labelled the cards without
 * re-applying the classes — so the list swapped to the dark palettes while the
 * page stayed light, which is precisely the "editing a theme you cannot see"
 * state it was meant to prevent.
 *
 * Renders nothing. Storage is the source of truth; this only re-derives from it.
 */
export default function ThemeSync() {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");

    const reapply = () => {
      const { mode, light, dark } = readTheme();
      // Cheap and unconditional. Guarding on mode === "system" would skip the
      // storage-event case, where the mode itself is what changed.
      applyAll(mode, light, dark);
    };

    mq.addEventListener("change", reapply);
    // Another tab changing the theme should not leave this one stale. `storage`
    // fires only in OTHER documents, so this cannot loop with the picker.
    window.addEventListener("storage", reapply);
    return () => {
      mq.removeEventListener("change", reapply);
      window.removeEventListener("storage", reapply);
    };
  }, []);

  return null;
}
