"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import TopNav from "@/components/layout/TopNav";
import SecurityPanel from "@/components/settings/SecurityPanel";
import RecurringCosts from "@/components/settings/RecurringCosts";
import ThemePicker from "@/components/ui/ThemeToggle";

const TABS = [
  { key: "org", label: "Organisation" },
  { key: "fixedCosts", label: "Fixed costs" },
  { key: "preferences", label: "Preferences" },
  { key: "billing", label: "Billing" },
  { key: "notifications", label: "Notifications" },
  { key: "security", label: "Security" },
  { key: "dataPrivacy", label: "Data & privacy" },
];

const NOTIF_PREFS = [
  { label: "Daily CFO brief", description: "Email summary every morning at 6am.", enabled: true },
  { label: "Critical anomalies", description: "Instant alert when a critical issue is detected.", enabled: true },
  { label: "Settlement overdue", description: "Alert when a settlement passes 15 days.", enabled: true },
  { label: "Weekly cash summary", description: "Sent every Monday morning.", enabled: false },
];

export default function SettingsPage() {
  const [tab, setTab] = useState("org");

  return (
    <>
      <TopNav title="Settings" subtitle="Organisation, billing and preferences" />

      <div className="flex flex-col gap-8 md:flex-row" style={{ maxWidth: 920 }}>
        <div className="flex shrink-0 gap-0.5 overflow-x-auto md:w-[180px] md:flex-col">
          {TABS.map((t) => (
            <div
              key={t.key}
              className={`cursor-pointer whitespace-nowrap rounded-md px-3 py-2.5 text-[13.5px] ${
                tab === t.key ? "bg-primary-soft font-medium text-primary" : "font-normal text-foreground hover:bg-muted"
              }`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </div>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          {tab === "org" ? <OrganisationTab /> : null}

          {tab === "fixedCosts" ? (
            <>
              <h4 className="mb-4 text-lg font-medium text-foreground">Fixed costs</h4>
              <RecurringCosts />
            </>
          ) : null}

          {tab === "preferences" ? (
            <>
              <h4 className="mb-4 text-lg font-medium text-foreground">Preferences</h4>
              <div className="field"><label>Theme</label></div>
              <ThemePicker />
              <div className="mt-4 grid grid-cols-2 gap-3.5">
                <div className="field"><label>Currency</label><select className="input"><option>INR (₹)</option><option>USD ($)</option></select></div>
                <div className="field"><label>Date format</label><select className="input"><option>DD/MM/YYYY</option><option>MM/DD/YYYY</option></select></div>
              </div>
            </>
          ) : null}

          {tab === "billing" ? (
            <>
              <h4 className="mb-4 text-lg font-medium text-foreground">Billing</h4>
              {/* Stated a plan and a price ("Founder plan — ₹24,999/month")
                  with no billing system behind either. A fabricated amount a
                  user believes they are being charged is worse than an empty
                  tab, so the tab says what it is. */}
              <div className="card elev-sm">
                <div className="card-kicker">Current plan</div>
                <div className="card-title">Not set up yet</div>
                <div className="card-body">
                  No billing system is connected, so there is no plan or amount to show. Nothing is being charged.
                </div>
              </div>
            </>
          ) : null}

          {tab === "notifications" ? (
            <>
              <h4 className="mb-4 text-lg font-medium text-foreground">Notifications</h4>
              {/* These toggles read nothing and save nothing. Shown switched ON
                  they told a founder that alerts were being delivered when no
                  notification system exists — so they are disabled and labelled
                  rather than left looking operational. */}
              <p className="mb-4 text-[13px] text-muted-foreground">
                Not built yet — nothing is delivered by email or push, whatever these show. Alerts appear on the
                Exceptions page and the Daily brief, which are computed live each time you open them.
              </p>
              <div className="flex flex-col gap-3.5 opacity-60">
                {NOTIF_PREFS.map((n) => (
                  <div key={n.label} className="flex items-center justify-between">
                    <div>
                      <div className="text-[13.5px] font-medium text-foreground">{n.label}</div>
                      <div className="text-xs text-muted-foreground">{n.description}</div>
                    </div>
                    <input type="checkbox" checked={false} disabled readOnly aria-label={`${n.label} (not available yet)`} />
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {tab === "security" ? <SecurityPanel /> : null}

          {tab === "dataPrivacy" ? (
            <>
              <h4 className="mb-4 text-lg font-medium text-foreground">Data & privacy</h4>
              {/* The export button had no handler. A control that looks like it
                  exports your data and silently does nothing is a promise the
                  product doesn't keep. */}
              <p className="text-[13.5px] text-muted-foreground">
                Raw provider payloads are stored immutably and every derived figure is versioned, so any number on
                this dashboard can be traced back to the record it came from. Self-serve export isn&apos;t built yet —
                ask and it can be pulled directly from the database.
              </p>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

// The real legal entity, loaded and saved — previously this tab showed
// hardcoded placeholder values ("Aara Wellness Private Limited") with a Save
// button that did nothing, which is worse than showing nothing: it reads as
// configured data that is actually fiction.
//
// This is also the recovery path for onboarding. That form saves the same
// entity, but its save races Clerk's organisation webhook and is deliberately
// allowed to give up rather than trap the user on a page — when it does, this
// is where the profile gets filled in.
function OrganisationTab() {
  const { getToken } = useAuth();
  const [entity, setEntity] = useState(null);
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // { kind: "ok" | "error", message }
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const token = await getToken();
        const headers = { Authorization: `Bearer ${token}` };
        const [entityRes, optionsRes] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/legal-entities`, { headers }),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/legal-entities/options`, { headers }),
        ]);
        if (cancelled) return;
        if (optionsRes.ok) setOptions(await optionsRes.json());
        if (entityRes.ok) {
          const data = await entityRes.json();
          // The primary entity is the oldest, matching what the backend's
          // PUT /legal-entities/primary and getOrCreateDefaultLegalEntity
          // both resolve to.
          const primary = data.legalEntities?.[0] ?? null;
          setEntity(
            primary
              ? {
                  id: primary.id,
                  name: primary.name ?? "",
                  gstin: primary.gstin ?? "",
                  pan: primary.pan ?? "",
                  category: primary.category ?? "",
                  revenueRange: primary.revenueRange ?? "",
                  primaryChannel: primary.primaryChannel ?? "",
                }
              : null
          );
        } else {
          setStatus({ kind: "error", message: "Couldn't load your organisation details." });
        }
      } catch {
        if (!cancelled) setStatus({ kind: "error", message: "Couldn't reach the backend." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  const set = useCallback((key) => (e) => setEntity((v) => ({ ...v, [key]: e.target.value })), []);

  async function handleSave() {
    if (!entity) return;
    setSaving(true);
    setStatus(null);
    setFieldErrors({});
    try {
      const token = await getToken();
      // PUT /primary rather than PATCH /:id so this works identically whether
      // the entity already exists or onboarding never managed to create it.
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/legal-entities/primary`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: entity.name.trim(),
          gstin: entity.gstin.trim() || null,
          pan: entity.pan.trim() || null,
          category: entity.category || null,
          revenueRange: entity.revenueRange || null,
          primaryChannel: entity.primaryChannel || null,
        }),
      });

      if (res.ok) {
        setStatus({ kind: "ok", message: "Saved." });
        return;
      }
      const detail = await res.json().catch(() => null);
      if (res.status === 400 && detail?.issues) {
        const byField = {};
        for (const issue of detail.issues) {
          if (issue.path?.[0]) byField[issue.path[0]] = issue.message;
        }
        setFieldErrors(byField);
        setStatus({ kind: "error", message: "Check the highlighted fields." });
        return;
      }
      setStatus({ kind: "error", message: "Couldn't save. Try again." });
    } catch {
      setStatus({ kind: "error", message: "Couldn't reach the backend." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <>
        <h4 className="mb-4 text-lg font-medium text-foreground">Organisation</h4>
        <div className="flex flex-col gap-3.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="animate-pulse rounded-md bg-muted" style={{ height: 56 }} />
          ))}
        </div>
      </>
    );
  }

  // No entity at all means onboarding never completed AND no connector has
  // been set up (a connector materialises a placeholder entity). Saying so is
  // more useful than an empty form that silently creates one.
  const value = entity ?? { name: "", gstin: "", pan: "", category: "", revenueRange: "", primaryChannel: "" };

  return (
    <>
      <h4 className="mb-1 text-lg font-medium text-foreground">Organisation</h4>
      <p className="mb-4 text-[13px] text-muted-foreground">
        The GST-registered company your numbers are filed against. Separate from the workspace name, which Clerk owns.
      </p>

      <div className="field">
        <label>Legal entity name</label>
        <input className="input" value={value.name} onChange={set("name")} placeholder="Aara Wellness Private Limited" />
        <FieldError message={fieldErrors.name} />
      </div>

      <div className="mt-3.5 grid grid-cols-2 gap-3.5">
        <div className="field">
          <label>GSTIN</label>
          <input className="input" value={value.gstin} onChange={set("gstin")} maxLength={15} placeholder="29AACCA1234M1Z5" />
          <FieldError message={fieldErrors.gstin} />
        </div>
        <div className="field">
          <label>PAN</label>
          <input className="input" value={value.pan} onChange={set("pan")} maxLength={10} placeholder="AACCA1234M" />
          <FieldError message={fieldErrors.pan} />
        </div>
      </div>

      <div className="field mt-3.5">
        <label>Category</label>
        <select className="input" value={value.category} onChange={set("category")}>
          <option value="">Not set</option>
          {(options?.categories ?? []).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="mt-3.5 grid grid-cols-2 gap-3.5">
        <div className="field">
          <label>Monthly revenue range</label>
          <select className="input" value={value.revenueRange} onChange={set("revenueRange")}>
            <option value="">Not set</option>
            {(options?.revenueRanges ?? []).map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Primary sales channel</label>
          <select className="input" value={value.primaryChannel} onChange={set("primaryChannel")}>
            <option value="">Not set</option>
            {(options?.primaryChannels ?? []).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button className="btn btn-primary" type="button" onClick={handleSave} disabled={saving || !value.name.trim()}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        {status ? (
          <span
            className="text-[13px]"
            style={{ color: status.kind === "ok" ? "var(--color-success)" : "var(--color-destructive)" }}
          >
            {status.message}
          </span>
        ) : null}
      </div>
    </>
  );
}

function FieldError({ message }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-[12px]" style={{ color: "var(--color-destructive)" }}>
      {message}
    </p>
  );
}
