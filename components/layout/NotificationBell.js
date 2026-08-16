"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon, BELL_PATHS } from "@/components/icons";

// §23 (P3.2). The bell was decorative — it rendered and did nothing. Now it
// reads GET /notifications.
//
// The badge count comes from the server, never from the length of the list.
// The dropdown fetches at most 30 rows, so deriving the count client-side
// would under-report at exactly the moment the number matters — an org with 40
// unread would show "30".
//
// Nothing is invented while loading: no badge appears until a count arrives,
// because a "0" that is really "not known yet" is the same lie as any other
// placeholder number.

const POLL_MS = 120_000;

const SEVERITY_DOT = {
  CRITICAL: "bg-destructive",
  WARNING: "bg-accent",
  INFO: "bg-muted-foreground",
};

// Where a notification's resource actually lives. A row whose type has no
// destination renders WITHOUT a link rather than with one that goes nowhere —
// the same rule AlertCard follows for action buttons.
function hrefFor(n) {
  if (n.resourceType === "ANOMALY") return "/exceptions";
  if (n.resourceType === "CONNECTION") return "/connections";
  if (n.resourceType === "PAGE" && n.resourceId === "payables") return "/cash-flow";
  if (n.resourceType === "PAGE" && n.resourceId === "reconciliation") return "/reconciliation";
  if (n.resourceType === "METRIC" && n.resourceId === "available_cash") return "/cash-flow";
  return null;
}

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function NotificationBell() {
  const { getToken, isLoaded } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const wrapRef = useRef(null);

  // Read through a ref, same as app/(dashboard)/page.js: Clerk hands back a
  // new getToken identity after hydration, which recreated `load` and re-ran
  // the polling effect — measured as the notifications list fetching twice on
  // every page load. The ref always holds the current function; identity
  // changes no longer restart anything.
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const load = useCallback(async () => {
    try {
      const token = await getTokenRef.current();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/notifications?limit=30`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Could not load notifications (${res.status})`);
      const body = await res.json();
      setItems(body.notifications ?? []);
      setUnread(body.unreadCount ?? 0);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    // Wait for Clerk — a pre-hydration run sends `Bearer null` and burns a
    // request on a guaranteed 401.
    if (!isLoaded) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      setLoading(true);
      await load();
      if (!cancelled) setLoading(false);
    };
    tick();
    // Polled rather than pushed. The emitters run nightly, so a two-minute
    // poll is far finer-grained than anything it could observe — a socket here
    // would be infrastructure for a feed that changes once a day.
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isLoaded, load]);

  // Click-outside and Escape. Without these the panel stays open behind
  // whatever a founder clicks next, over the numbers they were trying to read.
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markRead(id) {
    // Optimistic, then reconciled by the next poll. A founder clicking a
    // notification should see it dim immediately; if the request fails the
    // poll puts it back, which is the honest outcome.
    setItems((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnread((u) => (u === null ? u : Math.max(0, u - 1)));
    try {
      const token = await getToken();
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/notifications/${id}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      load();
    }
  }

  async function markAllRead() {
    setItems((list) => list.map((n) => ({ ...n, read: true })));
    setUnread(0);
    try {
      const token = await getToken();
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/notifications/read-all`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } finally {
      load();
    }
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className="relative grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:bg-muted"
      >
        <Icon paths={BELL_PATHS} size={19} strokeWidth={1.6} />
        {/* No badge until a real count has arrived — see the header note. */}
        {unread !== null && unread > 0 ? (
          <span className="absolute right-1 top-1 grid min-w-[17px] place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-[17px] text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-40 mt-1 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
            <div className="text-[13.5px] font-medium text-foreground">
              Notifications{unread ? ` · ${unread} unread` : ""}
            </div>
            {unread ? (
              <button type="button" className="text-xs text-primary hover:underline" onClick={markAllRead}>
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {error ? (
              <p className="m-0 px-4 py-6 text-[13px]" style={{ color: "var(--color-destructive)" }} role="alert">
                {error}
              </p>
            ) : loading && items.length === 0 ? (
              <div className="flex flex-col gap-2 p-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-10 animate-pulse rounded bg-muted" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <p className="m-0 px-4 py-8 text-center text-[13px] text-muted-foreground">
                Nothing to report. Checks run overnight — connection failures, stale data, cash below your
                threshold and critical anomalies all land here.
              </p>
            ) : (
              items.map((n) => {
                const href = hrefFor(n);
                const inner = (
                  <>
                    <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${SEVERITY_DOT[n.severity] ?? SEVERITY_DOT.INFO}`} />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[13px] ${n.read ? "text-muted-foreground" : "font-medium text-foreground"}`}>
                        {n.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{n.body}</span>
                      <span className="mt-1 block text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
                    </span>
                  </>
                );
                const cls = `flex w-full items-start gap-2.5 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-muted/60 ${n.read ? "" : "bg-primary-soft/30"}`;
                return href ? (
                  <Link key={n.id} href={href} className={cls} onClick={() => { markRead(n.id); setOpen(false); }}>
                    {inner}
                  </Link>
                ) : (
                  // No destination, no link. A row that looks clickable and
                  // goes nowhere is worse than one that plainly does not.
                  <div key={n.id} className={cls} onClick={() => markRead(n.id)}>
                    {inner}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
