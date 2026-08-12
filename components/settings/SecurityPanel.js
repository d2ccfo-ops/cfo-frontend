"use client";

import { useAuth, useSession, useUser } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";

// P5.4 (§12.1). What is actually true about this account's security.
//
// This tab once showed a segmented control with "Enabled" pre-selected for
// two-factor auth. It read nothing and set nothing. A false claim that an
// account is protected is more dangerous than any wrong number on this
// product — a wrong figure gets checked, and a security setting someone
// believes is on never does.
//
// Everything here is READ from Clerk, live. Where a value cannot be read it
// says so rather than assuming the safe-sounding answer. Changing any of it
// happens in Clerk's own account UI, which this links to rather than
// reimplementing — a hand-rolled 2FA enrolment flow is a security surface
// nobody here should own.

function Row({ label, value, tone = "neutral", note = null }) {
  const color =
    tone === "good" ? "var(--color-success)" : tone === "bad" ? "var(--color-destructive)" : "var(--color-foreground)";
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-2.5 last:border-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="text-right">
        <span className="text-[13.5px] font-medium" style={{ color }}>
          {value}
        </span>
        {note ? <div className="text-[11.5px] text-muted-foreground">{note}</div> : null}
      </span>
    </div>
  );
}

export default function SecurityPanel() {
  const { user, isLoaded } = useUser();
  const { session } = useSession();
  const { getToken } = useAuth();
  const api = process.env.NEXT_PUBLIC_API_URL;

  const [events, setEvents] = useState(null);
  const [eventsFailed, setEventsFailed] = useState(false);

  const loadEvents = useCallback(async () => {
    try {
      // mine=true, not the whole organisation: this is YOUR security tab, and
      // showing colleagues' sign-ins here would be a different feature with
      // a different permission question.
      const res = await fetch(`${api}/audit?actionPrefix=auth.&mine=true&limit=20`, {
        headers: { Authorization: `Bearer ${await getToken()}` },
      });
      if (!res.ok) {
        setEventsFailed(true);
        return;
      }
      const body = await res.json();
      setEvents(body.entries ?? body.logs ?? []);
    } catch {
      setEventsFailed(true);
    }
  }, [api, getToken]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await loadEvents();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadEvents]);

  if (!isLoaded) {
    return (
      <div className="flex flex-col gap-2" role="status" aria-busy="true">
        <span className="sr-only">Loading security settings</span>
        <div className="h-4 w-1/2 animate-pulse rounded-sm bg-primary/10" />
        <div className="h-4 w-2/3 animate-pulse rounded-sm bg-primary/10" />
      </div>
    );
  }

  const twoFactor = user?.twoFactorEnabled;
  const passkeys = user?.passkeys?.length ?? 0;
  const verifiedEmails = (user?.emailAddresses ?? []).filter((e) => e.verification?.status === "verified").length;

  return (
    <>
      <h4 className="mb-4 text-lg font-medium text-foreground">Security</h4>

      <div className="mb-5">
        <Row
          label="Two-factor authentication"
          // Read from Clerk, not assumed. `undefined` is its own answer — the
          // one state the old control could never show.
          value={twoFactor === undefined ? "Could not be read" : twoFactor ? "On" : "Off"}
          tone={twoFactor === undefined ? "neutral" : twoFactor ? "good" : "bad"}
          note={
            twoFactor === false
              ? "Anyone with your password can see this organisation's cash position."
              : null
          }
        />
        <Row label="Passkeys registered" value={String(passkeys)} tone={passkeys > 0 ? "good" : "neutral"} />
        <Row label="Verified email addresses" value={String(verifiedEmails)} />
        <Row
          label="This session started"
          value={session?.lastActiveAt ? new Date(session.createdAt).toLocaleString("en-IN") : "Unknown"}
        />
        <Row label="Session id" value={session?.id ? `${session.id.slice(0, 14)}…` : "Unknown"} />
      </div>

      <p className="mb-5 text-[13px] leading-relaxed text-muted-foreground">
        Passwords, two-factor enrolment and signing other devices out are handled by Clerk, not stored here. Open the
        account menu in the top-right and choose <strong className="font-medium text-foreground">Manage account</strong> —
        that is the only place any of it can be changed, and this page deliberately does not reimplement it.
      </p>

      <div>
        <div className="mb-1 text-[13px] font-medium text-foreground">Recent sign-in activity</div>
        <p className="mb-2 text-[12.5px] leading-relaxed text-muted-foreground">
          Sign-ins and session changes are recorded in the same audit log as every money decision — because &ldquo;who
          saw this figure&rdquo; and &ldquo;who changed it&rdquo; are the same question when the answer is a person.
        </p>
        {eventsFailed ? (
          <p className="text-[12.5px]" style={{ color: "var(--color-destructive)" }}>
            The audit log could not be read. This is a connection failure, not an absence of activity.
          </p>
        ) : events === null ? (
          <div className="h-16 animate-pulse rounded-md bg-primary/10" role="status" aria-busy="true" />
        ) : events.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">
            No auth events recorded yet. They arrive from Clerk by webhook — if this stays empty after a sign-in, the
            session webhook is not subscribed in the Clerk dashboard.
          </p>
        ) : (
          <div className="flex flex-col">
            {events.map((e) => (
              <div key={e.id} className="flex items-baseline justify-between gap-3 border-b border-border py-2 last:border-0">
                <span className="font-mono text-[12px] text-foreground">{(e.action ?? "").replace("auth.", "")}</span>
                <span className="text-[11.5px] text-muted-foreground">
                  {e.createdAt ? new Date(e.createdAt).toLocaleString("en-IN") : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
