"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";

// P6.5's packaging rate — the one contribution-margin layer with no ingested
// source at all.
//
// Nothing a D2C brand connects reports what a mailer costs. Shopify does not
// carry it, no courier states it, it appears on no settlement. The founder
// knows it and no system does, so a rate typed once is the only honest source
// available — which is why the layer sat at zero until this existed.
//
// TWO FIELDS, NOT ONE. A mailer is charged per PARCEL; tissue and inserts per
// ITEM. A single blended per-order number misprices every multi-item order,
// and multi-item orders are where the margin is.
//
// NOT CONFIGURED IS NOT ZERO. Leaving this blank keeps the layer uncovered and
// CM1 marked unreliable. Entering 0 is a founder stating packaging genuinely
// costs nothing — a measured fact. The two must not collapse into each other,
// so this never pre-fills a default.

export default function PackagingCost() {
  const { getToken } = useAuth();
  const [perOrder, setPerOrder] = useState("");
  const [perItem, setPerItem] = useState("");
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/preferences/org`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Could not load settings (${res.status})`);
        const body = await res.json();
        if (cancelled) return;
        const cfg = body.settings?.packagingCost ?? null;
        if (cfg) {
          setPerOrder(String(Number(cfg.perOrderPaise) / 100));
          setPerItem(String(Number(cfg.perItemPaise) / 100));
          setConfigured(true);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  async function save(clear = false) {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const token = await getToken();
      const payload = clear
        ? { packagingCost: null }
        : {
            packagingCost: {
              // Rounded here rather than trusting a float through JSON — the
              // server takes an integer-paise string and rejects anything else.
              perOrderPaise: String(Math.round(Number(perOrder || 0) * 100)),
              perItemPaise: String(Math.round(Number(perItem || 0) * 100)),
            },
          };
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/preferences/org`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error?.message || body.error || `Save failed (${res.status})`);
      }
      const body = await res.json();
      const cfg = body.settings?.packagingCost ?? null;
      setConfigured(Boolean(cfg));
      if (!cfg) {
        setPerOrder("");
        setPerItem("");
      }
      setSaved(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="h-24 animate-pulse rounded-md bg-muted" />;

  const invalid =
    (perOrder !== "" && !(Number(perOrder) >= 0)) || (perItem !== "" && !(Number(perItem) >= 0));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] text-muted-foreground">
        No connected system reports packaging cost — it is the one margin layer that has to be typed. Until it is,
        contribution margin after fulfilment (CM1) is marked unreliable rather than assuming packaging is free.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div className="field">
          <label>Per order (₹)</label>
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            placeholder="e.g. 14.00"
            value={perOrder}
            onChange={(e) => {
              setSaved(false);
              setPerOrder(e.target.value);
            }}
          />
          <span className="text-[11.5px] text-muted-foreground">Mailer, label, tape — charged once per parcel</span>
        </div>
        <div className="field">
          <label>Per item (₹)</label>
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            placeholder="e.g. 4.00"
            value={perItem}
            onChange={(e) => {
              setSaved(false);
              setPerItem(e.target.value);
            }}
          />
          <span className="text-[11.5px] text-muted-foreground">Tissue, inserts, per-unit wrap</span>
        </div>
      </div>

      {error ? (
        <div className="text-[12.5px]" style={{ color: "var(--color-destructive)" }}>
          {error}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <button className="btn btn-primary" disabled={saving || invalid || (perOrder === "" && perItem === "")} onClick={() => save(false)}>
          {saving ? "Saving…" : "Save packaging rate"}
        </button>
        {/* Clearing is distinct from setting zero, and has to be reachable —
            a founder who entered a rate by mistake needs the layer to go back
            to "unknown", not to "free". */}
        {configured ? (
          <button className="btn" disabled={saving} onClick={() => save(true)}>
            Clear
          </button>
        ) : null}
        {saved ? <span className="text-[12.5px] text-muted-foreground">Saved</span> : null}
        {!configured && !saved ? (
          <span className="text-[12.5px]" style={{ color: "var(--color-accent)" }}>
            Not configured — packaging is excluded from margin
          </span>
        ) : null}
      </div>
    </div>
  );
}
