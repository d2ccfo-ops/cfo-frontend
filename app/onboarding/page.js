"use client";

import { SignOutButton, UserButton, useAuth, useOrganizationList } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

// Clerk owns the "workspace" (org name + membership). The remaining fields
// below (GSTIN, PAN, category, revenue range, channel) describe the LEGAL
// ENTITY under that org, which is a different thing — it's the GST-registered
// company every financial row is filed against. They now persist via
// PUT /legal-entities/primary (cfo-backend/src/routes/legalEntities.ts).
//
// The dropdown options are fetched rather than hardcoded: the backend both
// serves and validates them, so an option that would be rejected on save
// cannot appear in the list.

const RETRY_DELAYS_MS = [400, 800, 1600, 3000, 5000];

export default function OnboardingPage() {
  const router = useRouter();
  const { createOrganization, setActive, isLoaded } = useOrganizationList();
  const { getToken } = useAuth();

  const [form, setForm] = useState({
    name: "",
    gstin: "",
    pan: "",
    category: "",
    revenueRange: "",
    primaryChannel: "",
  });
  const [options, setOptions] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const set = useCallback((key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value })), []);

  useEffect(() => {
    let cancelled = false;
    async function loadOptions() {
      try {
        const token = await getToken();
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/legal-entities/options`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled && res.ok) {
          const data = await res.json();
          setOptions(data);
          // Preselect the first of each so a user who touches nothing still
          // submits a valid value rather than an empty string the API rejects.
          setForm((f) => ({
            ...f,
            category: f.category || data.categories[0],
            revenueRange: f.revenueRange || data.revenueRanges[0],
            primaryChannel: f.primaryChannel || data.primaryChannels[0],
          }));
        }
      } catch {
        // Non-fatal: the selects fall back to disabled below, and the entity
        // still saves with name/GSTIN/PAN. Onboarding must not be blocked by
        // an unreachable backend.
      }
    }
    loadOptions();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  // The org is created in Clerk, but our Organization row is written by Clerk's
  // webhook (routes/webhooks/clerk.ts is the ONLY writer, by design). That
  // webhook is in flight at exactly this moment, so the first save can
  // genuinely land before the org exists on our side — a 409, and a race we
  // ride out rather than an error worth showing. Same for the 403 while the
  // freshly-issued session token still lacks the new org claim.
  const saveProfile = useCallback(async () => {
    const body = {
      name: form.name.trim(),
      gstin: form.gstin.trim() || null,
      pan: form.pan.trim() || null,
      category: form.category || null,
      revenueRange: form.revenueRange || null,
      primaryChannel: form.primaryChannel || null,
    };

    for (let attempt = 0; ; attempt += 1) {
      // Fetched inside the loop, not once outside it: the point of retrying is
      // that the token's org claim is still propagating, and a cached token
      // would retry with the same stale claim forever.
      const token = await getToken({ skipCache: attempt > 0 });
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/legal-entities/primary`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      if (res.ok) return { ok: true };

      const retriable = res.status === 409 || res.status === 403;
      if (!retriable || attempt >= RETRY_DELAYS_MS.length) {
        const detail = await res.json().catch(() => null);
        return { ok: false, status: res.status, detail };
      }
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }, [form, getToken]);

  async function handleContinue() {
    if (!isLoaded || !form.name.trim()) return;
    setSubmitting(true);
    setError("");
    setFieldErrors({});

    let org;
    try {
      org = await createOrganization({ name: form.name.trim() });
      await setActive({ organization: org.id });
    } catch (err) {
      setError(err?.errors?.[0]?.message || "Could not create your workspace. Try again.");
      setSubmitting(false);
      return;
    }

    const saved = await saveProfile();

    if (!saved.ok) {
      // A validation failure is the user's to fix and must not be swallowed —
      // it's the whole reason this endpoint validates GSTIN structurally.
      if (saved.status === 400 && saved.detail?.issues) {
        const byField = {};
        for (const issue of saved.detail.issues) {
          if (issue.path?.[0]) byField[issue.path[0]] = issue.message;
        }
        setFieldErrors(byField);
        setError("Check the highlighted fields — your workspace was created, so fixing these and continuing is all that's left.");
        setSubmitting(false);
        return;
      }
      // Anything else (backend down, webhook never landed) is ours, not
      // theirs. The workspace exists and connecting data matters more than
      // this profile, so continue — Settings → Business can fill it in later.
      router.push("/connections?profile=unsaved");
      return;
    }

    router.push("/connections");
  }

  const selectsReady = options !== null;

  return (
    <div className="flex flex-col items-center bg-background" style={{ minHeight: "100vh" }}>
      <div className="w-full" style={{ maxWidth: 600, padding: "48px 24px" }}>
        <div className="mb-9 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-sm font-semibold text-background">C</div>
            <span className="text-[17px] font-medium text-foreground">CFOOS</span>
          </div>
          <div className="flex items-center gap-3">
            <SignOutButton redirectUrl="/login">
              <button type="button" className="btn btn-ghost" style={{ fontSize: "12.5px" }}>
                Sign out
              </button>
            </SignOutButton>
            <UserButton afterSignOutUrl="/login" />
          </div>
        </div>

        <div className="mb-8 flex items-center gap-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex-1 rounded-full" style={{ height: 4, background: n <= 2 ? "var(--color-primary)" : "var(--color-muted)" }} />
          ))}
        </div>

        <h2 className="mb-1 text-xl font-normal text-foreground">Tell us about your business</h2>
        <p className="mb-7 text-[13.5px] text-muted-foreground">This helps CFOOS calibrate benchmarks for your category.</p>

        <div className="field">
          <label>Legal entity name</label>
          <input
            className="input"
            placeholder="Aara Wellness Private Limited"
            value={form.name}
            onChange={set("name")}
          />
          <FieldError message={fieldErrors.name} />
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2 mt-3.5">
          <div className="field">
            <label>GSTIN</label>
            <input className="input" placeholder="29AACCA1234M1Z5" value={form.gstin} onChange={set("gstin")} maxLength={15} />
            <FieldError message={fieldErrors.gstin} />
          </div>
          <div className="field">
            <label>PAN</label>
            <input className="input" placeholder="AACCA1234M" value={form.pan} onChange={set("pan")} maxLength={10} />
            <FieldError message={fieldErrors.pan} />
          </div>
        </div>

        <div className="field mt-3.5">
          <label>Category</label>
          <select className="input" value={form.category} onChange={set("category")} disabled={!selectsReady}>
            {(options?.categories ?? []).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2 mt-3.5">
          <div className="field">
            <label>Monthly revenue range</label>
            <select className="input" value={form.revenueRange} onChange={set("revenueRange")} disabled={!selectsReady}>
              {(options?.revenueRanges ?? []).map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Primary sales channel</label>
            <select className="input" value={form.primaryChannel} onChange={set("primaryChannel")} disabled={!selectsReady}>
              {(options?.primaryChannels ?? []).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {error ? <p className="mt-4 text-[13px]" style={{ color: "var(--color-destructive)" }}>{error}</p> : null}

        <div className="flex justify-between mt-8">
          <button className="btn btn-ghost" type="button">Back</button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={!form.name.trim() || submitting}
            onClick={handleContinue}
          >
            {submitting ? "Creating workspace…" : "Continue to connect data sources"}
          </button>
        </div>
      </div>
    </div>
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
