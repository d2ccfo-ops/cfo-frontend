"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// A right-click menu anchored at the pointer.
//
// Rendered through a PORTAL to document.body rather than inline. `position:
// fixed` is resolved against the nearest transformed/filtered ancestor rather
// than the viewport, and the dashboard has plenty of those (every card with a
// hover transform) — an inline menu would sometimes land in the right place and
// sometimes hundreds of pixels away, depending on which card was clicked.
//
// It closes on: outside click, Escape, scroll, resize, and any other menu
// opening. Scroll is included because a menu pinned to viewport coordinates
// detaches from the card it belongs to the moment the page moves under it.

// Roughly the menu's own size, used to decide whether to flip. Measured after
// mount and corrected, so these only matter for the first frame.
const ESTIMATED_WIDTH = 220;
const ESTIMATED_HEIGHT = 160;

export default function ContextMenu({ x, y, onClose, children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(() => ({
    left: Math.min(x, (typeof window === "undefined" ? 1024 : window.innerWidth) - ESTIMATED_WIDTH - 8),
    top: Math.min(y, (typeof window === "undefined" ? 768 : window.innerHeight) - ESTIMATED_HEIGHT - 8),
  }));

  // Corrected against the real size before paint, so a menu near the bottom
  // edge never appears half off-screen for a frame and then jumps.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
    });
  }, [x, y]);

  useEffect(() => {
    const close = () => onClose();
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    const onPointerDown = (e) => {
      if (!ref.current?.contains(e.target)) onClose();
    };
    // capture:true on scroll so a scroll inside any nested container counts,
    // not just the document.
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 min-w-[200px] overflow-hidden rounded-xl border border-border bg-card py-1 shadow-raised"
      style={{ left: pos.left, top: pos.top }}
      // The menu itself must not open another context menu on top of itself.
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>,
    document.body
  );
}

export function ContextMenuItem({ onClick, icon = null, children, tone = "default", hint = "" }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors hover:bg-muted ${
        tone === "destructive" ? "text-destructive" : "text-foreground"
      }`}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {hint ? <span className="text-[10px] text-muted-foreground">{hint}</span> : null}
    </button>
  );
}

export function ContextMenuSeparator() {
  return <div className="my-1 h-px bg-border" />;
}

// Shared open/close state for a card that wants a right-click menu. Returns the
// props to spread onto the card and the coordinates to render the menu at.
export function useContextMenu() {
  const [at, setAt] = useState(null);
  return {
    at,
    close: () => setAt(null),
    triggerProps: {
      onContextMenu: (e) => {
        e.preventDefault();
        setAt({ x: e.clientX, y: e.clientY });
      },
    },
  };
}
