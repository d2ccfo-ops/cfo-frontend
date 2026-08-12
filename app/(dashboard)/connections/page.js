"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import TopNav from "@/components/layout/TopNav";
import ConnectionCard from "@/components/cards/ConnectionCard";
import StatusBadge from "@/components/ui/StatusBadge";
import { formatInrShort } from "@/lib/money";

// Shared by every "connected" ConnectionCard's action button below — without
// this, a connection that's ACTIVE but never actually finished a backfill
// (e.g. it crashed partway through) has no way to retry short of deleting
// the row directly in the database. `POST /connections/:id/sync` already
// exists as a generic backend route (works for any provider via its
// CONNECTORS map); this was just never wired to anything on the frontend —
// every "Manage" button rendered but did nothing.
//
// POST /:id/sync no longer runs the sync itself — it enqueues a background
// job (cfo-backend's BullMQ worker, see modules/queue/syncWorker.ts) and
// returns immediately (202), so a store with a huge order history can't hold
// this fetch open for minutes. This just starts the job; syncAndWait below
// is what actually waits for it to finish.
async function triggerSync(getToken, connectionId) {
  const token = await getToken();
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections/${connectionId}/sync`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Sync failed to start — check the backend log for details.");
  return res.json();
}

async function fetchSyncStatus(getToken, connectionId) {
  const token = await getToken();
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections/${connectionId}/sync-status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Could not check sync status.");
  return res.json();
}

const SYNC_POLL_INTERVAL_MS = 1500;
const SYNC_POLL_MAX_ATTEMPTS = 400; // ~10 minutes

function isSyncInFlight(status) {
  return status === "QUEUED" || status === "SYNCING";
}

// Polls sync-status until the job settles, WITHOUT (re-)triggering it — the
// building block both syncAndWait (below, called right after a fresh
// triggerSync) and resumeInFlightSync (per-section, called on mount/
// navigation to pick back up a job that's already running server-side) are
// built on. Splitting these apart is what makes "navigate away and come
// back" work correctly: the poll loop doesn't care who started the job, it
// just watches Connection.syncStatus, which is real server state that
// outlives any one browser tab — unlike the syncingId React state below,
// which is not.
async function pollUntilSettled(getToken, connectionId, onProgress) {
  for (let attempt = 0; attempt < SYNC_POLL_MAX_ATTEMPTS; attempt++) {
    const status = await fetchSyncStatus(getToken, connectionId);
    onProgress?.(status);
    if (status.syncStatus === "FAILED") throw new Error(status.lastSyncError || "Sync failed.");
    if (status.syncStatus === "IDLE") return status;
    await new Promise((resolve) => setTimeout(resolve, SYNC_POLL_INTERVAL_MS));
  }
  return null; // still running past the poll budget — not an error, see the comment above the constant.
}

// Enqueues the sync then polls sync-status until the worker settles it —
// this (not triggerSync alone) is what every "Sync now" button below
// actually calls. Gives up quietly (not as an error) after
// SYNC_POLL_MAX_ATTEMPTS: a very large backfill is fine to keep running in
// the background past that point, the founder can check back later and
// GET /connections will already reflect the latest state on next load.
async function syncAndWait(getToken, connectionId, onProgress) {
  await triggerSync(getToken, connectionId);
  return pollUntilSettled(getToken, connectionId, onProgress);
}

// Real, measured progress — never a fabricated percentage or a fixed-speed
// guess. syncProgressCurrent/Total come straight from cfo-backend's worker,
// which itself asks Shopify's own count.json endpoints for a real total
// before starting (see modules/connectors/shopify/index.ts's pull()) — so
// "total" is honestly null for connectors that don't support this yet
// (everything except Shopify, currently), and this renders accordingly
// rather than pretending to know.
function formatEta(seconds) {
  if (seconds < 60) return "< 1m";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function formatSyncProgress(status) {
  if (!status) return "Syncing…";
  const current = status.syncProgressCurrent;
  const total = status.syncProgressTotal;
  if (current == null) return "Syncing…";
  const countLabel = total != null ? `${current.toLocaleString("en-IN")} / ${total.toLocaleString("en-IN")}` : `${current.toLocaleString("en-IN")} synced`;
  if (!status.syncStartedAt || !total || current <= 0) return `Syncing… ${countLabel}`;
  // Real elapsed-time throughput, not an assumed rate — needs a few seconds
  // of measured progress before an ETA is worth showing at all.
  const elapsedSec = (Date.now() - new Date(status.syncStartedAt).getTime()) / 1000;
  if (elapsedSec < 3) return `Syncing… ${countLabel}`;
  const rate = current / elapsedSec;
  const etaSec = rate > 0 ? Math.max(total - current, 0) / rate : null;
  return `Syncing… ${countLabel}${etaSec != null ? ` (~${formatEta(etaSec)} left)` : ""}`;
}

// Layout only — which cards exist and how they're grouped. Deliberately carries
// NO status or lastSync: every card below is intercepted by a live branch that
// renders real connection state, so these were dead strings ("Synced 12 min
// ago") sitting one refactor away from being spread onto a real card.
const GROUPS = [
  {
    title: "Storefront & orders",
    items: [
      { name: "Shopify", category: "Storefront" },
      { name: "Amazon Seller Central", category: "Marketplace" },
      { name: "Flipkart", category: "Marketplace" },
      // No public seller API exists for Myntra (checked before building
      // this — see cfo-docs/PROGRESS.md) — shown honestly as not built
      // rather than a fake "connected"/"error" state with nothing behind it.
      { name: "Myntra Partner Portal", category: "Marketplace" },
    ],
  },
  {
    title: "Payments & banking",
    items: [
      { name: "Razorpay", category: "Payment gateway" },
      { name: "Bank accounts", category: "Current account" },
      { name: "Bank via Setu", category: "Account Aggregator" },
    ],
  },
  {
    title: "Ads & logistics",
    items: [
      { name: "Meta Ads", category: "Ad platform" },
      { name: "Meta Ads CSV", category: "Ad spend via export" },
      { name: "Google Ads", category: "Ad platform" },
      { name: "Google Ads CSV", category: "Ad spend via export" },
      { name: "Shiprocket", category: "3PL / shipping" },
      { name: "Delhivery", category: "3PL / shipping" },
      { name: "Bluedart", category: "3PL / shipping" },
      { name: "ClickPost", category: "Shipping aggregator" },
    ],
  },
  {
    title: "COD & settlements",
    items: [
      { name: "GoKwik", category: "Checkout / COD remittance" },
    ],
  },
  {
    title: "Accounting",
    items: [
      { name: "Zoho Books", category: "Accounting" },
      // Tally is deliberately listed and deliberately not connectable. It runs
      // on-premise behind an HTTP gateway bound to localhost on the merchant's
      // own machine, so a cloud backend cannot reach it — it needs a desktop
      // bridge agent, which is a separate product surface. Shown honestly
      // rather than omitted, because founders will look for it.
      { name: "Tally", category: "Accounting (on-premise)" },
    ],
  },
];

// Two connect paths on one card: OAuth (needs a Shopify Partner app, which
// nobody has set up yet — see cfo-docs/PROGRESS.md) or a Custom App access
// token (created directly in the merchant's own admin, no Partner account
// needed — the only way to actually test this connector today). Whichever
// field the founder fills in decides which path the button takes; both post
// to the same shopifyConnector on the backend, which doesn't care how the
// token was obtained.
function ShopifyConnectCard({ onConnect, onConnectToken, connecting, error }) {
  const [shop, setShop] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const usingToken = accessToken.trim().length > 0;
  return (
    <div className="card elev-sm flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-md bg-primary-soft flex items-center justify-center font-semibold text-[13px] text-primary flex-none">SH</div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-[15px] text-foreground">Shopify</div>
          <div className="text-xs text-muted-foreground">Storefront</div>
        </div>
      </div>
      <input
        className="input"
        placeholder="yourstore.myshopify.com"
        value={shop}
        onChange={(e) => setShop(e.target.value)}
      />
      <input
        className="input"
        type="password"
        placeholder="Admin API access token (optional — Custom App)"
        value={accessToken}
        onChange={(e) => setAccessToken(e.target.value)}
      />
      <p className="text-[11px] text-muted-foreground">
        Leave the token blank to connect via OAuth (needs a Shopify Partner app). Or paste a Custom App token — store admin → Settings → Apps and sales channels → Develop apps → create an app → Admin API access token — to connect instantly, no Partner app needed.
      </p>
      {error ? <p className="text-[12px]" style={{ color: "var(--color-destructive)" }}>{error}</p> : null}
      <button
        className="btn btn-primary"
        disabled={connecting || !shop.trim()}
        onClick={() =>
          usingToken ? onConnectToken({ shop: shop.trim(), accessToken: accessToken.trim() }) : onConnect(shop.trim())
        }
      >
        {connecting ? (usingToken ? "Connecting…" : "Redirecting…") : usingToken ? "Connect with token" : "Connect Shopify"}
      </button>
    </div>
  );
}

function RazorpayConnectCard({ onConnect, connecting, error }) {
  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const ready = keyId.trim() && keySecret.trim() && webhookSecret.trim();
  return (
    <div className="card elev-sm flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-md bg-primary-soft flex items-center justify-center font-semibold text-[13px] text-primary flex-none">RP</div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-[15px] text-foreground">Razorpay</div>
          <div className="text-xs text-muted-foreground">Payment gateway</div>
        </div>
      </div>
      <input className="input" placeholder="Key ID (rzp_live_... or rzp_test_...)" value={keyId} onChange={(e) => setKeyId(e.target.value)} />
      <input className="input" type="password" placeholder="Key Secret" value={keySecret} onChange={(e) => setKeySecret(e.target.value)} />
      <input className="input" type="password" placeholder="Webhook signing secret" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} />
      <p className="text-[11px] text-muted-foreground">From Razorpay Dashboard → Settings → API Keys, and → Webhooks (create one pointing at your backend&apos;s /webhooks/razorpay).</p>
      {error ? <p className="text-[12px]" style={{ color: "var(--color-destructive)" }}>{error}</p> : null}
      <button
        className="btn btn-primary"
        disabled={connecting || !ready}
        onClick={() => onConnect({ keyId: keyId.trim(), keySecret: keySecret.trim(), webhookSecret: webhookSecret.trim() })}
      >
        {connecting ? "Connecting…" : "Connect Razorpay"}
      </button>
    </div>
  );
}

// OAuth, single button — no form fields, same shape as Meta/Google Ads'
// unconnected state, but simpler: a seller account has exactly one
// selling_partner_id per marketplace, so unlike Meta/Google's "one grant,
// many ad accounts" there's only ever one Amazon connection per org.
function AmazonConnectCard({ onConnect, connecting, error }) {
  return (
    <div className="card elev-sm flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-md bg-primary-soft flex items-center justify-center font-semibold text-[13px] text-primary flex-none">AM</div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-[15px] text-foreground">Amazon Seller Central</div>
          <div className="text-xs text-muted-foreground">Marketplace</div>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Orders, and fees/settlement data via the Finances API — real revenue and real fee/commission data, not just totals.
      </p>
      {error ? <p className="text-[12px]" style={{ color: "var(--color-destructive)" }}>{error}</p> : null}
      <button className="btn btn-primary" disabled={connecting} onClick={onConnect}>
        {connecting ? "Redirecting…" : "Connect Amazon Seller Central"}
      </button>
    </div>
  );
}

// No OAuth for Flipkart — a "Self Access Application" is created by the
// seller themselves in their own Seller Dashboard (Manage Profile →
// Developer Access) and only ever authorizes their own account, so this is a
// credential form like Razorpay's, not a redirect button.
function FlipkartConnectCard({ onConnect, connecting, error }) {
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const ready = appId.trim() && appSecret.trim();
  return (
    <div className="card elev-sm flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-md bg-primary-soft flex items-center justify-center font-semibold text-[13px] text-primary flex-none">FK</div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-[15px] text-foreground">Flipkart</div>
          <div className="text-xs text-muted-foreground">Marketplace</div>
        </div>
      </div>
      <input className="input" placeholder="App ID" value={appId} onChange={(e) => setAppId(e.target.value)} />
      <input className="input" type="password" placeholder="App Secret" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} />
      <p className="text-[11px] text-muted-foreground">
        Seller Dashboard → Manage Profile → Developer Access → create a Self Access Application. Pulls orders and shipments — Flipkart has not published a settlement/fee API yet, so that data isn&apos;t available here.
      </p>
      {error ? <p className="text-[12px]" style={{ color: "var(--color-destructive)" }}>{error}</p> : null}
      <button
        className="btn btn-primary"
        disabled={connecting || !ready}
        onClick={() => onConnect({ appId: appId.trim(), appSecret: appSecret.trim() })}
      >
        {connecting ? "Connecting…" : "Connect Flipkart"}
      </button>
    </div>
  );
}

function ShiprocketConnectCard({ onConnect, connecting, error }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [webhookToken, setWebhookToken] = useState("");
  const ready = email.trim() && password.trim() && webhookToken.trim();
  return (
    <div className="card elev-sm flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-md bg-primary-soft flex items-center justify-center font-semibold text-[13px] text-primary flex-none">SR</div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-[15px] text-foreground">Shiprocket</div>
          <div className="text-xs text-muted-foreground">3PL / shipping</div>
        </div>
      </div>
      <input className="input" placeholder="API user email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="input" type="password" placeholder="API user password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <input className="input" type="password" placeholder="Webhook secret key" value={webhookToken} onChange={(e) => setWebhookToken(e.target.value)} />
      <p className="text-[11px] text-muted-foreground">From Shiprocket Dashboard → Settings → API → create an API user (not your login), then → Webhook (set a Secret Key and point it at your backend&apos;s /webhooks/shiprocket).</p>
      {error ? <p className="text-[12px]" style={{ color: "var(--color-destructive)" }}>{error}</p> : null}
      <button
        className="btn btn-primary"
        disabled={connecting || !ready}
        onClick={() => onConnect({ email: email.trim(), password: password.trim(), webhookToken: webhookToken.trim() })}
      >
        {connecting ? "Connecting…" : "Connect Shiprocket"}
      </button>
    </div>
  );
}

function DelhiveryConnectCard({ onConnect, connecting, error }) {
  const [apiToken, setApiToken] = useState("");
  return (
    <div className="card elev-sm flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-md bg-primary-soft flex items-center justify-center font-semibold text-[13px] text-primary flex-none">DL</div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-[15px] text-foreground">Delhivery</div>
          <div className="text-xs text-muted-foreground">3PL / shipping</div>
        </div>
      </div>
      <input className="input" type="password" placeholder="API Token" value={apiToken} onChange={(e) => setApiToken(e.target.value)} />
      <p className="text-[11px] text-muted-foreground">From Delhivery One → Settings → API Setup. Delhivery has no self-service webhook — after connecting, you&apos;ll get a URL to send to Delhivery&apos;s onboarding team so they know where to push shipment scans.</p>
      {error ? <p className="text-[12px]" style={{ color: "var(--color-destructive)" }}>{error}</p> : null}
      <button className="btn btn-primary" disabled={connecting || !apiToken.trim()} onClick={() => onConnect(apiToken.trim())}>
        {connecting ? "Connecting…" : "Connect Delhivery"}
      </button>
    </div>
  );
}

// ClickPost is a carrier aggregator (many couriers behind one API), but its
// API shape matches Delhivery's rather than Shiprocket's: track-by-known-
// waybill only, with the webhook as the sole way shipments are discovered.
// So this card is Delhivery's shape too — connect, then hand ClickPost the
// generated webhook URL.
function ClickPostConnectCard({ onConnect, connecting, error }) {
  const [username, setUsername] = useState("");
  const [apiKey, setApiKey] = useState("");
  const ready = username.trim() && apiKey.trim();
  return (
    <div className="card elev-sm flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-md bg-primary-soft flex items-center justify-center font-semibold text-[13px] text-primary flex-none">CP</div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-[15px] text-foreground">ClickPost</div>
          <div className="text-xs text-muted-foreground">Shipping aggregator</div>
        </div>
      </div>
      <input className="input" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
      <input className="input" type="password" placeholder="API key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
      <p className="text-[11px] text-muted-foreground">
        From your ClickPost account settings. After connecting you&apos;ll get a webhook URL to paste into ClickPost&apos;s dashboard — shipments only appear here once ClickPost starts pushing status updates to it.
      </p>
      {error ? <p className="text-[12px]" style={{ color: "var(--color-destructive)" }}>{error}</p> : null}
      <button
        className="btn btn-primary"
        disabled={connecting || !ready}
        onClick={() => onConnect({ username: username.trim(), apiKey: apiKey.trim() })}
      >
        {connecting ? "Connecting…" : "Connect ClickPost"}
      </button>
    </div>
  );
}

// GoKwik and Bluedart share one component because they share one shape: an API
// for enrichment, plus a REMITTANCE STATEMENT that is the thing reconciliation
// actually needs. Neither exposes remittance as an API — Bluedart emails a COD
// MIS, GoKwik publishes a settlement report — so the upload is not a fallback
// here, it is the primary path.
//
// The two are deliberately independent: credentials are optional. A merchant
// with no working API key can still upload a statement and reconcile, because
// the importer resolves rows against orders and shipments already held.
const REMITTANCE_PROVIDERS = {
  GOKWIK: {
    label: "GoKwik",
    initials: "GK",
    category: "Checkout / settlements",
    connectPath: "gokwik",
    uploadPath: "settlement",
    uploadLabel: "settlement report",
    help:
      "GoKwik merchant dashboard → Settlements → export the settlement report for a date range, as CSV. " +
      "It should cover BOTH prepaid (UPI/cards/Snapmint) and COD, since GoKwik settles both. " +
      "Needs, per row: the payout/settlement id, its UTR, the settlement date, the order id, the amount, and the payment mode.",
    fields: [
      { key: "merchantId", label: "Merchant ID (mid)", type: "text" },
      { key: "appId", label: "App ID", type: "password" },
      { key: "appSecret", label: "App Secret", type: "password" },
    ],
  },
  BLUEDART: {
    label: "Bluedart",
    initials: "BD",
    category: "3PL / shipping",
    connectPath: "bluedart",
    uploadPath: "remittance",
    uploadLabel: "COD remittance MIS",
    invoiceLabel: "freight tax invoice",
    help: "Only the login ID and licence key are required. Bluedart's onboarding sheet lists two different keys — license_key and tracking_license_key — so if yours shows both, put the tracking one in its own field; tracking uses it in preference. The Client ID and secret come separately from the DHL developer portal and are optional. Note that Bluedart's tracking API currently returns no data for these waybills even though its public tracker resolves them, so freight cost comes from the tax-invoice PDF and COD from the remittance MIS.",
    fields: [
      { key: "loginId", label: "Login ID", type: "text" },
      { key: "licenceKey", label: "Licence key (license_key)", type: "password" },
      // Optional, and ordered last so the ones that matter are filled first. A
      // required-looking field a merchant cannot fill is how a working
      // connection goes unmade.
      { key: "trackingLicenceKey", label: "Tracking licence key (optional)", type: "password", optional: true },
      { key: "clientId", label: "Client ID (optional)", type: "text", optional: true },
      { key: "clientSecret", label: "Client Secret (optional)", type: "password", optional: true },
    ],
  },
};

function RemittanceSection({ getToken, provider }) {
  const cfg = REMITTANCE_PROVIDERS[provider];
  const [connection, setConnection] = useState(undefined);
  const [form, setForm] = useState({});
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [upload, setUpload] = useState({});
  // Freight invoices are a second, separate upload on this card — PDF, not CSV.
  const [invoice, setInvoice] = useState({});

  async function load() {
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();
      setConnection(data.connections.find((c) => c.provider === provider) ?? false);
    } catch {
      setConnection(false);
    }
  }

  useEffect(() => {
    // load() only setStates after awaiting getToken(), so the cascading-render
    // the rule guards against cannot happen here. Same mount-load pattern as
    // BankAccountsSection and the other self-contained sections in this file.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Optional fields are excluded from the readiness test — a Connect button
  // held disabled by a box the merchant has no value for is indistinguishable
  // from a broken page.
  const ready = cfg.fields.every((f) => f.optional || (form[f.key] || "").trim());

  async function handleConnect() {
    setConnecting(true);
    setError("");
    setNote("");
    try {
      const token = await getToken();
      const body = {};
      for (const f of cfg.fields) body[f.key] = (form[f.key] || "").trim();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections/${cfg.connectPath}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error === "invalid_credentials" ? "Those credentials were rejected." : "Could not connect.");
      // The backend reports whether it could actually verify the credentials.
      // Saying "connected" when it could not reach the provider would be a lie
      // the merchant only discovers at the first failed sync.
      if (data.note) setNote(data.note);
      setForm({});
      await load();
    } catch (err) {
      setError(err.message || "Could not connect.");
    } finally {
      setConnecting(false);
    }
  }

  async function handleUpload(file) {
    setUpload({ uploading: true });
    try {
      const csv = await file.text();
      const token = await getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/connections/${cfg.connectPath}/${connection.id}/${cfg.uploadPath}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ csv }),
        }
      );
      const data = await res.json().catch(() => ({}));
      // The backend sends a human message for the cases a founder can act on
      // (file too large, malformed CSV). Showing the raw error code instead
      // would tell them "payload_too_large" and nothing about what to do.
      if (!res.ok) throw new Error(data.message || data.error || `Import failed (HTTP ${res.status}).`);
      setUpload({ uploading: false, result: data });
      await load();
    } catch (err) {
      setUpload({ uploading: false, error: err.message || "Import failed." });
    }
  }

  // Freight invoices arrive as PDF — Bluedart offers no CSV annexure for most
  // accounts — so this is a separate handler from the CSV upload above, and a
  // separate control below. An invoice is what the courier CHARGED us; a
  // remittance is what they COLLECTED and paid us. One uploaded as the other
  // would record a cost as income.
  async function readPdfAsBase64(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    // Chunked rather than one spread: String.fromCharCode(...bytes) on a
    // multi-megabyte PDF exceeds the argument limit and throws.
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return btoa(binary);
  }

  // Many invoices at once. Bluedart bills monthly and per product line, so
  // catching up on a year is a couple of dozen PDFs — one-at-a-time is how a
  // merchant gives up halfway and leaves most of their shipping cost unknown.
  //
  // Sent as one request rather than N: the backend applies them sequentially
  // because two invoices routinely bill the same waybill (outbound on one,
  // return leg on the next) and the per-shipment total is recomputed from all
  // lines, so parallel uploads would race on the same row.
  async function handleInvoiceUpload(fileList) {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setInvoice({ uploading: true, total: files.length });
    try {
      const payload = [];
      for (const file of files) {
        payload.push({ name: file.name, pdfBase64: await readPdfAsBase64(file) });
      }
      const token = await getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/connections/${cfg.connectPath}/${connection.id}/invoices`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ files: payload }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error === "too_many_files") {
          throw new Error(`Too many files — ${data.received} selected, ${data.max} at a time.`);
        }
        throw new Error(data.message || data.error || `Import failed (HTTP ${res.status}).`);
      }
      setInvoice({ uploading: false, batch: data });
      await load();
    } catch (err) {
      setInvoice({ uploading: false, error: err.message || "Import failed." });
    }
  }

  // Per-file refusals, in words a reader can act on. A bare "total_mismatch"
  // cannot be told apart from a parser bug or simply the wrong file.
  function describeInvoiceFailure(f) {
    if (f.error === "total_mismatch") {
      return `states ${formatInrShort(Number(f.statedPaise) / 100)} but the ${f.linesParsed} rows read sum to ${formatInrShort(Number(f.summedPaise) / 100)} — not imported`;
    }
    if (f.error === "no_shipment_rows") return "no shipment rows — is this a Bluedart freight invoice?";
    if (f.error === "no_invoice_number") return "no invoice number found, so a re-upload could not be detected — not imported";
    if (f.error === "unreadable_pdf") return "could not be read as a PDF";
    if (f.error === "missing_pdf") return "was empty";
    return f.error ?? "failed";
  }

  const r = upload.result;
  const batch = invoice.batch;
  const invoiceRows = (batch?.results ?? []).filter((f) => f.ok);
  const invoiceFailures = (batch?.results ?? []).filter((f) => !f.ok);
  return (
    <div className="card elev-sm flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-md bg-primary-soft flex items-center justify-center font-semibold text-[13px] text-primary flex-none">{cfg.initials}</div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-[15px] text-foreground">{cfg.label}</div>
          <div className="text-xs text-muted-foreground">{cfg.category}</div>
        </div>
        {connection ? (
          <StatusBadge
            status={connection.status === "ACTIVE" ? "positive" : "warning"}
            label={connection.status === "ACTIVE" ? "Connected" : connection.status}
          />
        ) : null}
      </div>

      {connection === undefined ? (
        <div className="h-8 rounded bg-muted animate-pulse" />
      ) : connection ? (
        <>
          <div className="text-[11px] text-muted-foreground">{cfg.help}</div>
          <label className="btn btn-secondary cursor-pointer text-center">
            {upload.uploading ? "Importing…" : `Upload ${cfg.uploadLabel} (CSV)`}
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={upload.uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = "";
              }}
            />
          </label>
          {upload.error ? <p className="text-[12px]" style={{ color: "var(--color-destructive)" }}>{upload.error}</p> : null}

          {/* The freight invoice. Only Bluedart bills this way today, so the
              control appears only where it means something rather than as a
              dead button on every remittance card. */}
          {cfg.invoiceLabel ? (
            <>
              <label className="btn btn-secondary cursor-pointer text-center">
                {invoice.uploading
                  ? `Reading ${invoice.total ?? 1} PDF${(invoice.total ?? 1) === 1 ? "" : "s"}…`
                  : `Upload ${cfg.invoiceLabel}s (PDF)`}
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  multiple
                  disabled={invoice.uploading}
                  onChange={(e) => {
                    if (e.target.files?.length) handleInvoiceUpload(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              <p className="text-[11px] text-muted-foreground">
                Select as many months as you have — up to 40 at once. Re-uploading an invoice replaces it rather than
                adding to it, so overlapping selections are safe.
              </p>
              {invoice.error ? (
                <p className="text-[12px]" style={{ color: "var(--color-destructive)" }}>{invoice.error}</p>
              ) : null}
              {batch ? (
                <div className="text-[12px] text-muted-foreground flex flex-col gap-2">
                  {/* The batch headline. One number, so a merchant who just
                      uploaded a year of invoices is not asked to add up twelve
                      rows themselves. */}
                  <div>
                    Imported <span className="text-foreground">{batch.distinctInvoices ?? batch.imported}</span> invoice
                    {(batch.distinctInvoices ?? batch.imported) === 1 ? "" : "s"} from {batch.filesReceived} file
                    {batch.filesReceived === 1 ? "" : "s"} —{" "}
                    <span className="text-foreground">{formatInrShort(Number(batch.totalFreightPaise) / 100)}</span> freight
                    across <span className="text-foreground">{batch.shipmentsUpdated.toLocaleString("en-IN")}</span> shipments.
                  </div>
                  {/* Said out loud rather than left to be inferred from a
                      shorter list than the number of files picked. Selecting a
                      duplicate is normal and harmless — the totals count each
                      invoice once — but silently importing fewer things than
                      were chosen looks like a failure. */}
                  {batch.duplicateFiles > 0 ? (
                    <div>
                      {batch.duplicateFiles} file{batch.duplicateFiles === 1 ? " was" : "s were"} another copy of an
                      invoice already in this batch. Counted once, not twice.
                    </div>
                  ) : null}

                  {invoiceRows.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {invoiceRows.map((f, i) => (
                        // Index-suffixed: the backend dedupes by invoice number,
                        // but a key that assumes uniqueness would collide the
                        // moment that changed, and React silently drops rows.
                        <div key={`${f.invoiceNo}-${i}`} className="flex flex-col">
                          <div>
                            <span className="text-foreground">{f.invoiceNo}</span>
                            {f.product ? ` · ${f.product}` : ""} — {f.linesParsed.toLocaleString("en-IN")} lines,{" "}
                            {formatInrShort(Number(f.totalFreightPaise) / 100)}
                            {/* Re-uploads are silent otherwise, and a merchant
                                who selects an overlapping folder needs to know
                                the figure was replaced, not doubled. */}
                            {f.replacedExisting ? " · replaced an earlier upload" : ""}
                          </div>
                          {/* An RTO is billed twice — out and back. Naming it
                              separately is the only way the cost of a failed
                              delivery is ever visible. */}
                          {f.returnLegCount > 0 ? (
                            <div style={{ color: "var(--color-accent)" }}>
                              &nbsp;&nbsp;{f.returnLegCount} return-leg charges (RTO),{" "}
                              {formatInrShort(Number(f.returnLegPaise) / 100)} — parcels you paid to ship twice.
                            </div>
                          ) : null}
                          {f.creditCount > 0 ? (
                            <div style={{ color: "var(--color-success)" }}>
                              &nbsp;&nbsp;{f.creditCount} credits, {formatInrShort(Number(f.creditPaise) / 100)}.
                            </div>
                          ) : null}
                          {(f.warnings ?? []).map((w) => (
                            <div key={w} style={{ color: "var(--color-accent)" }}>&nbsp;&nbsp;{w}</div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {/* Reported rather than hidden: a waybill Bluedart billed for
                      that this system has never seen means a parcel shipped
                      outside the connected store — money out, for something
                      unverifiable. */}
                  {batch.unmatchedCount > 0 ? (
                    <div>
                      {batch.unmatchedCount.toLocaleString("en-IN")} waybill
                      {batch.unmatchedCount === 1 ? "" : "s"} across these invoices match no shipment we hold — billed
                      for, but never synced from the store.
                    </div>
                  ) : null}

                  {/* Named individually. "3 files failed" sends a reader back
                      to their folder to guess which. */}
                  {invoiceFailures.length > 0 ? (
                    <div className="flex flex-col gap-0.5" style={{ color: "var(--color-destructive)" }}>
                      {invoiceFailures.map((f, i) => (
                        <div key={`${f.fileName ?? "file"}-${i}`}>
                          {f.fileName ?? "A file"}: {describeInvoiceFailure(f)}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}

          {r ? (
            <div className="text-[12px] text-muted-foreground flex flex-col gap-1">
              <div>
                Imported <span className="text-foreground">{r.batchesImported}</span> payouts,{" "}
                <span className="text-foreground">{r.linesImported}</span> lines
                {/* Amounts cross the wire as paise strings because BigInt does
                    not survive JSON. Rupees is what the formatter takes. */}
                {typeof r.amountImportedPaise === "string"
                  ? ` — ${formatInrShort(Number(r.amountImportedPaise) / 100)}`
                  : null}
              </div>
              {/* THE REASON NOTHING IMPORTED. Without this an unreadable file
                  reports a cheerful "0 payouts, 0 lines" and leaves the reader
                  with no idea whether the export was wrong, the columns were
                  misnamed, or the feature is broken. The importer already says
                  exactly what it could not find — show it. */}
              {r.errors?.length ? (
                <div style={{ color: "var(--color-destructive)" }}>
                  {r.batchesImported === 0 ? "Nothing imported. " : ""}
                  {r.errors.length} problem{r.errors.length === 1 ? "" : "s"} in the file:
                  <ul className="mt-1 list-disc pl-4">
                    {r.errors.slice(0, 5).map((e, i) => (
                      <li key={i} className="break-words">{e}</li>
                    ))}
                  </ul>
                  {r.errors.length > 5 ? <div className="mt-1">…and {r.errors.length - 5} more.</div> : null}
                </div>
              ) : null}
              {/* Modes we could not classify. The money IS in the payout — the
                  lines just aren't attached to a shipment or a payment, so
                  nothing is misattributed. Shown because naming them is how the
                  vocabulary gets fixed. */}
              {r.unknownModes?.length ? (
                <div style={{ color: "var(--color-accent)" }}>
                  Imported, but {r.unknownModes.length} payment mode
                  {r.unknownModes.length === 1 ? " was" : "s were"} not recognised:{" "}
                  <span className="text-foreground">{r.unknownModes.join(", ")}</span>. Those lines count toward the payout
                  total but aren&apos;t matched to an order — tell us what they mean and they&apos;ll reconcile too.
                </div>
              ) : null}
              {r.linesUnresolved > 0 ? (
                <div>
                  {r.linesUnresolved} line{r.linesUnresolved === 1 ? "" : "s"} matched nothing we hold — reported, not dropped.
                </div>
              ) : null}
              {/* A refused payout is the important case: the importer will not
                  import a batch whose lines do not sum to its stated total,
                  because a misread column produces a reconciliation that is
                  confidently wrong. Say so, and say by how much. */}
              {r.rejected?.length ? (
                <div style={{ color: "var(--color-destructive)" }}>
                  {r.rejected.length} payout{r.rejected.length === 1 ? "" : "s"} refused — lines did not sum to the stated total:
                  <ul className="mt-1 list-disc pl-4">
                    {r.rejected.slice(0, 3).map((x) => (
                      <li key={x.batchId}>
                        {x.batchId}: stated {formatInrShort(Number(x.statedPaise) / 100)}, lines summed{" "}
                        {formatInrShort(Number(x.summedPaise) / 100)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <>
          {cfg.fields.map((f) => (
            <input
              key={f.key}
              className="input"
              type={f.type}
              placeholder={f.label}
              value={form[f.key] || ""}
              onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
            />
          ))}
          <p className="text-[11px] text-muted-foreground">{cfg.help}</p>
          {error ? <p className="text-[12px]" style={{ color: "var(--color-destructive)" }}>{error}</p> : null}
          <button className="btn btn-primary" disabled={connecting || !ready} onClick={handleConnect}>
            {connecting ? "Connecting…" : `Connect ${cfg.label}`}
          </button>
        </>
      )}
      {note ? <p className="text-[11px]" style={{ color: "var(--color-warning)" }}>{note}</p> : null}
    </div>
  );
}

// Ad-spend CSV upload, for Meta and Google.
//
// Sits alongside the OAuth sections rather than replacing them: the API path is
// better once an app has cleared platform review, but until then a founder with
// an export in their downloads folder has no other way to get ad spend onto the
// Expenses page. Writes the same AdSpend rows, so nothing downstream can tell.
const AD_CSV_PROVIDERS = {
  "meta-ads": {
    label: "Meta Ads",
    initials: "MA",
    accountHint: "Optional — label, only if you run several ad accounts",
    help:
      "Ads Manager → Reports → Export. IMPORTANT: set Breakdown → Time → Day before exporting. " +
      "Meta's default export lumps the whole date range into one row, which carries no daily figures and will be refused.",
  },
  "google-ads": {
    label: "Google Ads",
    initials: "GA",
    accountHint: "Optional — label, only if you run several ad accounts",
    help:
      "Google Ads → Campaigns → Download → CSV. Add the “Day” segment first, otherwise the export has no per-day rows and will be refused.",
  },
};

function AdSpendCsvSection({ getToken, slug }) {
  const cfg = AD_CSV_PROVIDERS[slug];
  const [connection, setConnection] = useState(undefined);
  const [accountId, setAccountId] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [upload, setUpload] = useState({});
  const provider = slug === "meta-ads" ? "META_ADS" : "GOOGLE_ADS";

  async function load() {
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();
      setConnection(data.connections.find((c) => c.provider === provider) ?? false);
    } catch {
      setConnection(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConnect() {
    setConnecting(true);
    setError("");
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections/ad-spend/${slug}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ accountId: accountId.trim() }),
      });
      if (!res.ok) throw new Error("Could not register that ad account.");
      setAccountId("");
      await load();
    } catch (err) {
      setError(err.message || "Could not register that ad account.");
    } finally {
      setConnecting(false);
    }
  }

  async function handleUpload(file) {
    setUpload({ uploading: true });
    try {
      const csv = await file.text();
      const token = await getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/connections/ad-spend/${slug}/${connection.id}/upload`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ csv }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || `Import failed (HTTP ${res.status}).`);
      setUpload({ uploading: false, result: data });
      await load();
    } catch (err) {
      setUpload({ uploading: false, error: err.message || "Import failed." });
    }
  }

  const r = upload.result;
  return (
    <div className="card elev-sm flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-md bg-primary-soft flex items-center justify-center font-semibold text-[13px] text-primary flex-none">{cfg.initials}</div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-[15px] text-foreground">{cfg.label} — CSV</div>
          <div className="text-xs text-muted-foreground">Ad spend via export</div>
        </div>
        {connection ? <StatusBadge status="positive" label="Ready" /> : null}
      </div>

      {connection === undefined ? (
        <div className="h-8 rounded bg-muted animate-pulse" />
      ) : connection ? (
        <>
          <p className="text-[11px] text-muted-foreground">{cfg.help}</p>
          <label className="btn btn-secondary cursor-pointer text-center">
            {upload.uploading ? "Importing…" : "Upload ad spend (CSV)"}
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={upload.uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = "";
              }}
            />
          </label>
          {upload.error ? <p className="text-[12px]" style={{ color: "var(--color-destructive)" }}>{upload.error}</p> : null}
          {r ? (
            <div className="text-[12px] text-muted-foreground flex flex-col gap-1">
              {r.daysImported > 0 ? (
                <div>
                  Imported <span className="text-foreground">{r.daysImported}</span> days
                  {r.from ? ` (${r.from} → ${r.to})` : ""}
                  {typeof r.totalSpendPaise === "string" ? ` — ${formatInrShort(Number(r.totalSpendPaise) / 100)}` : ""}
                </div>
              ) : null}
              {/* The aggregate-export refusal lands here. It is the most likely
                  outcome of a first attempt, so it has to read as an
                  instruction rather than an error code. */}
              {r.errors?.length ? (
                <div style={{ color: "var(--color-destructive)" }}>
                  {r.errors.map((e, i) => (
                    <div key={i} className="break-words">{e}</div>
                  ))}
                </div>
              ) : null}
              {r.rowsSkipped > 0 ? (
                <div>{r.rowsSkipped} row{r.rowsSkipped === 1 ? "" : "s"} skipped (account-total and blank rows).</div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <input className="input" placeholder={cfg.accountHint} value={accountId} onChange={(e) => setAccountId(e.target.value)} />
          <p className="text-[11px] text-muted-foreground">{cfg.help}</p>
          {error ? <p className="text-[12px]" style={{ color: "var(--color-destructive)" }}>{error}</p> : null}
          <button className="btn btn-primary" disabled={connecting} onClick={handleConnect}>
            {connecting ? "Setting up…" : `Set up ${cfg.label} upload`}
          </button>
        </>
      )}
    </div>
  );
}

// The email pipe. Every Indian courier distributes its money documents by
// email — the freight invoice as PDF, the COD remittance MIS as CSV — and none
// offers either over an API, so the alternative to this card is a human
// downloading attachments every month. The merchant sets one forwarding rule;
// documents are recognised by content and land in the same importers the
// upload buttons use. One address serves every courier.
const INBOUND_STATUS_STYLE = {
  PROCESSED: { label: "Imported", color: "var(--color-success)" },
  PARTIAL: { label: "Partly imported", color: "var(--color-accent)" },
  FAILED: { label: "Nothing imported", color: "var(--color-destructive)" },
  EMPTY: { label: "No attachments", color: "var(--color-muted-foreground)" },
};

function EmailInSection({ getToken }) {
  const [data, setData] = useState(undefined); // undefined = loading, false = failed, object = loaded
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [confirmingRotate, setConfirmingRotate] = useState(false);
  const [rotateError, setRotateError] = useState("");

  async function load() {
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections/email-ingest`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setData(false);
        return;
      }
      setData(await res.json());
    } catch {
      setData(false);
    }
  }

  useEffect(() => {
    // load() only setStates after awaiting getToken(), so the cascading-render
    // the rule guards against cannot happen here. Same mount-load pattern as
    // the other self-contained sections in this file.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const target = data ? (data.address ?? data.webhookUrl) : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(target);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be denied; the address is selectable text either way.
    }
  }

  // Two-click rotate: the first click arms, the second fires. Rotation kills
  // the old address immediately — every forwarding rule pointing at it starts
  // bouncing — so a single misclick must not do that.
  async function rotate() {
    if (!confirmingRotate) {
      setConfirmingRotate(true);
      setTimeout(() => setConfirmingRotate(false), 4000);
      return;
    }
    setConfirmingRotate(false);
    setRotating(true);
    setRotateError("");
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections/email-ingest/rotate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      // A silent failure here is dangerous: the merchant believes the old
      // address is dead and stops trusting it, when in fact it is still live.
      if (!res.ok) throw new Error("rotate failed");
      await load();
    } catch {
      setRotateError("Couldn't rotate — the current address is still active. Try again.");
    } finally {
      setRotating(false);
    }
  }

  return (
    <div className="card elev-sm flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-md bg-primary-soft flex items-center justify-center font-semibold text-[13px] text-primary flex-none">
          @
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-[15px] text-foreground">Forward courier documents</div>
          <div className="text-xs text-muted-foreground">
            Bluedart invoices (PDF) · COD remittance MIS (CSV) · GoKwik settlements (CSV)
          </div>
        </div>
        {data ? <StatusBadge status="positive" label="Ready" /> : null}
      </div>

      {data === undefined ? (
        <div className="h-8 rounded bg-muted animate-pulse" />
      ) : data === false ? (
        <p className="text-[12px]" style={{ color: "var(--color-destructive)" }}>
          Couldn&apos;t load the ingest address.
        </p>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground">
            {data.domainConfigured
              ? "Set a forwarding rule in your inbox for each courier's billing sender, pointed at this address. Documents are recognised by their content — never by filename or sender — imported through the same checks as the upload buttons, and safe to re-forward: a duplicate replaces itself rather than double-counting."
              : "No inbound email domain is configured yet (EMAIL_INGEST_DOMAIN), so there is no address to forward to. An inbound provider (e.g. Postmark) pointed at this webhook URL turns it on; the URL also accepts direct POSTs from a relay."}
          </p>

          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted px-2.5 py-1.5 text-[12px] text-foreground">
              {target}
            </code>
            <button type="button" className="btn btn-secondary flex-none" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
            <button type="button" className="btn btn-secondary flex-none" onClick={rotate} disabled={rotating}>
              {rotating ? "Rotating…" : confirmingRotate ? "Really rotate?" : "Rotate"}
            </button>
          </div>
          {confirmingRotate ? (
            <p className="text-[11px]" style={{ color: "var(--color-accent)" }}>
              Rotating kills this address immediately — every forwarding rule pointing at it starts bouncing. Click
              again to confirm.
            </p>
          ) : null}
          {rotateError ? (
            <p className="text-[11px]" style={{ color: "var(--color-destructive)" }}>{rotateError}</p>
          ) : null}

          {(data.emails ?? []).length > 0 ? (
            <div className="flex flex-col gap-2">
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Recent emails
              </div>
              {data.emails.map((e) => {
                const style = INBOUND_STATUS_STYLE[e.status] ?? INBOUND_STATUS_STYLE.EMPTY;
                return (
                  <div key={e.id} className="flex flex-col gap-0.5 border-b border-border pb-2 last:border-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-[12.5px] text-foreground">
                        {e.subject || "(no subject)"}
                      </span>
                      <span className="flex-none text-[11px]" style={{ color: style.color }}>
                        {style.label}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {e.fromAddress || "unknown sender"} · {new Date(e.createdAt).toLocaleString("en-IN")}
                    </div>
                    {/* Per-attachment outcomes verbatim: "I forwarded it, where
                        is it?" is only answerable if a refused attachment says
                        why it was refused. */}
                    {(e.outcomes ?? []).map((o, i) => (
                      <div
                        key={`${e.id}-${i}`}
                        className="text-[11px]"
                        style={{ color: o.ok ? "var(--color-muted-foreground)" : "var(--color-destructive)" }}
                      >
                        {o.name}: {o.detail}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">Nothing has arrived yet.</p>
          )}
        </>
      )}
    </div>
  );
}

// No live bank API for MVP — Account Aggregator licensing is real regulatory
// weight, out of scope until the product has validated the rest first. This
// registers an account and lets a founder upload statements as CSV instead.
function BankAccountsSection({ getToken }) {
  const [connections, setConnections] = useState(undefined);
  const [bankName, setBankName] = useState("");
  const [accountLast4, setAccountLast4] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [uploadState, setUploadState] = useState({});
  const [balanceForm, setBalanceForm] = useState({}); // connectionId -> { balance, asOfDate, saving, error, saved }

  async function load() {
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();
      setConnections(data.connections.filter((c) => c.provider === "BANK"));
    } catch {
      setConnections([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAddBank() {
    setAdding(true);
    setAddError("");
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections/bank/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bankName: bankName.trim(), accountLast4: accountLast4.trim() }),
      });
      if (!res.ok) throw new Error("Could not add that bank account.");
      setBankName("");
      setAccountLast4("");
      await load();
    } catch (err) {
      setAddError(err.message || "Could not add that bank account.");
    } finally {
      setAdding(false);
    }
  }

  async function handleUpload(connectionId, file) {
    setUploadState((s) => ({ ...s, [connectionId]: { uploading: true } }));
    try {
      const csv = await file.text();
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections/bank/${connectionId}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      setUploadState((s) => ({ ...s, [connectionId]: { uploading: false, result: data } }));
      await load();
    } catch (err) {
      setUploadState((s) => ({ ...s, [connectionId]: { uploading: false, error: err.message || "Upload failed." } }));
    }
  }

  async function handleSaveOpeningBalance(connectionId) {
    const form = balanceForm[connectionId] || {};
    const balanceRupees = Number(form.balance);
    if (!form.balance || Number.isNaN(balanceRupees) || !form.asOfDate) return;
    setBalanceForm((s) => ({ ...s, [connectionId]: { ...s[connectionId], saving: true, error: "" } }));
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections/${connectionId}/opening-balance`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ balanceRupees, asOfDate: form.asOfDate }),
      });
      if (!res.ok) throw new Error("Could not save the opening balance.");
      setBalanceForm((s) => ({ ...s, [connectionId]: { ...s[connectionId], saving: false, saved: true } }));
      await load();
    } catch (err) {
      setBalanceForm((s) => ({
        ...s,
        [connectionId]: { ...s[connectionId], saving: false, error: err.message || "Could not save the opening balance." },
      }));
    }
  }

  if (connections === undefined) {
    return <ConnectionCard name="Bank accounts" category="Current account" status="syncing" lastSync="Checking…" />;
  }

  return (
    <>
      {connections.map((c) => {
        const state = uploadState[c.id] || {};
        const bForm = balanceForm[c.id] || {};
        const hasOpeningBalance = c.openingBalanceMinor != null;
        return (
          <div key={c.id} className="card elev-sm flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-primary-soft flex items-center justify-center font-semibold text-[13px] text-primary flex-none">BK</div>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-[15px] text-foreground">{c.externalAccountId ?? "Bank account"}</div>
                <div className="text-xs text-muted-foreground">
                  {c.lastSyncedAt ? `Last statement ${new Date(c.lastSyncedAt).toLocaleString()}` : "No statement uploaded yet"}
                </div>
              </div>
            </div>
            <label className="btn btn-primary text-center cursor-pointer">
              {state.uploading ? "Uploading…" : "Upload statement (CSV)"}
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(c.id, file);
                  e.target.value = "";
                }}
              />
            </label>
            {state.error ? <p className="text-[12px]" style={{ color: "var(--color-destructive)" }}>{state.error}</p> : null}
            {state.result ? (
              <p className="text-[12px]" style={{ color: "var(--color-success)" }}>
                Ingested {state.result.recordsFetched} transactions
                {state.result.skipped ? `, skipped ${state.result.skipped} row(s)` : ""}.
              </p>
            ) : null}

            <div className="border-t border-border pt-3 flex flex-col gap-2">
              <div className="text-xs text-muted-foreground">
                {hasOpeningBalance
                  ? `Opening balance set: ₹${Number(c.openingBalanceMinor) / 100} as of ${new Date(c.openingBalanceDate).toLocaleDateString()}. This feeds "Available cash" on the Overview page.`
                  : 'No opening balance set yet — this account is excluded from "Available cash" on Overview until you set one.'}
              </div>
              <input
                className="input"
                placeholder="Balance (₹) as of a known date"
                value={bForm.balance ?? ""}
                onChange={(e) => setBalanceForm((s) => ({ ...s, [c.id]: { ...s[c.id], balance: e.target.value, saved: false } }))}
              />
              <input
                className="input"
                type="date"
                value={bForm.asOfDate ?? ""}
                onChange={(e) => setBalanceForm((s) => ({ ...s, [c.id]: { ...s[c.id], asOfDate: e.target.value, saved: false } }))}
              />
              {bForm.error ? <p className="text-[12px]" style={{ color: "var(--color-destructive)" }}>{bForm.error}</p> : null}
              {bForm.saved ? <p className="text-[12px]" style={{ color: "var(--color-success)" }}>Saved.</p> : null}
              <button
                className="btn btn-secondary"
                disabled={bForm.saving || !bForm.balance || !bForm.asOfDate}
                onClick={() => handleSaveOpeningBalance(c.id)}
              >
                {bForm.saving ? "Saving…" : hasOpeningBalance ? "Update opening balance" : "Set opening balance"}
              </button>
            </div>
          </div>
        );
      })}

      <div className="card elev-sm flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary-soft flex items-center justify-center font-semibold text-[13px] text-primary flex-none">+</div>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-[15px] text-foreground">Add a bank account</div>
            <div className="text-xs text-muted-foreground">No live bank feed yet — upload statements as CSV</div>
          </div>
        </div>
        <input className="input" placeholder="Bank name (e.g. ICICI Bank)" value={bankName} onChange={(e) => setBankName(e.target.value)} />
        <input className="input" placeholder="Account last 4 digits" value={accountLast4} onChange={(e) => setAccountLast4(e.target.value)} />
        <p className="text-[11px] text-muted-foreground">CSV columns: date (YYYY-MM-DD), description, amount, type (CREDIT or DEBIT).</p>
        {addError ? <p className="text-[12px]" style={{ color: "var(--color-destructive)" }}>{addError}</p> : null}
        <button
          className="btn btn-primary"
          disabled={adding || !bankName.trim() || !accountLast4.trim()}
          onClick={handleAddBank}
        >
          {adding ? "Adding…" : "Add bank account"}
        </button>
      </div>
    </>
  );
}

// Real bank data via India's Account Aggregator network (through Setu),
// alongside — not replacing — BankAccountsSection's CSV path above: this
// needs the founder's specific bank to be a live AA participant and needs
// them to approve a consent in an AA app, which CSV upload never requires.
// The approval itself happens in a tab Setu hosts, not on this page, so this
// polls a status endpoint after opening it rather than handling a callback
// directly (see routes/connections/setu.ts on the backend).
function SetuBankSection({ getToken }) {
  const [connections, setConnections] = useState(undefined);
  const [mobileNumber, setMobileNumber] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(null); // { connectionId } while waiting for approval
  const [balanceForm, setBalanceForm] = useState({});

  async function load() {
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();
      setConnections(data.connections.filter((c) => c.provider === "BANK_AA"));
    } catch {
      setConnections([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The consent-approved webhook is the primary path, but it can't reach a
  // local/sandbox backend with no public URL — this polls the same status
  // check as a fallback so the UI still moves during dev, and as a safety
  // net in prod if a webhook delivery is ever missed.
  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const token = await getToken();
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/connections/bank-aa/${pending.connectionId}/status`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        if (cancelled) return;
        if (data.status === "ACTIVE") {
          setPending(null);
          await load();
        } else if (data.status === "ERROR" || data.status === "DISCONNECTED") {
          setPending(null);
          setError("The consent request was rejected, revoked, or expired. Try again.");
        }
      } catch {
        // transient network error — keep polling, next tick will retry
      }
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pending, getToken]);

  async function handleConnect() {
    setConnecting(true);
    setError("");
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections/bank-aa/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mobileNumber: mobileNumber.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error === "setu_not_configured"
            ? "Setu isn't configured on the backend yet."
            : data.error === "invalid_mobile_number"
              ? "Enter a valid 10-digit mobile number."
              : data.error || "Could not start the consent request."
        );
      }
      window.open(data.redirectUrl, "_blank", "noopener,noreferrer");
      setPending({ connectionId: data.connectionId });
    } catch (err) {
      setError(err.message || "Could not start the consent request.");
    } finally {
      setConnecting(false);
    }
  }

  async function handleSaveOpeningBalance(connectionId) {
    const form = balanceForm[connectionId] || {};
    const balanceRupees = Number(form.balance);
    if (!form.balance || Number.isNaN(balanceRupees) || !form.asOfDate) return;
    setBalanceForm((s) => ({ ...s, [connectionId]: { ...s[connectionId], saving: true, error: "" } }));
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections/${connectionId}/opening-balance`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ balanceRupees, asOfDate: form.asOfDate }),
      });
      if (!res.ok) throw new Error("Could not save the opening balance.");
      setBalanceForm((s) => ({ ...s, [connectionId]: { ...s[connectionId], saving: false, saved: true } }));
      await load();
    } catch (err) {
      setBalanceForm((s) => ({
        ...s,
        [connectionId]: { ...s[connectionId], saving: false, error: err.message || "Could not save the opening balance." },
      }));
    }
  }

  if (connections === undefined) {
    return <ConnectionCard name="Bank via Setu" category="Account Aggregator" status="syncing" lastSync="Checking…" />;
  }

  if (connections.length === 0) {
    if (pending) {
      return (
        <div className="card elev-sm flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-primary-soft flex items-center justify-center font-semibold text-[13px] text-primary flex-none">SE</div>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-[15px] text-foreground">Bank via Setu</div>
              <div className="text-xs text-muted-foreground">Account Aggregator</div>
            </div>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Waiting for approval — a new tab opened for you to approve the data-sharing consent in your bank/AA app. Come back here once you&apos;ve approved it.
          </p>
        </div>
      );
    }
    return (
      <div className="card elev-sm flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary-soft flex items-center justify-center font-semibold text-[13px] text-primary flex-none">SE</div>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-[15px] text-foreground">Bank via Setu</div>
            <div className="text-xs text-muted-foreground">Account Aggregator — real bank data</div>
          </div>
        </div>
        <input
          className="input"
          placeholder="Mobile number linked to your bank account"
          value={mobileNumber}
          onChange={(e) => setMobileNumber(e.target.value)}
        />
        <p className="text-[11px] text-muted-foreground">
          Uses India&apos;s RBI-regulated Account Aggregator network via Setu. You approve the data-sharing consent yourself, in your own AA app — CFOOS never sees your net-banking credentials.
        </p>
        {error ? <p className="text-[12px]" style={{ color: "var(--color-destructive)" }}>{error}</p> : null}
        <button className="btn btn-primary" disabled={connecting || !mobileNumber.trim()} onClick={handleConnect}>
          {connecting ? "Sending…" : "Send consent request"}
        </button>
      </div>
    );
  }

  return (
    <>
      {connections.map((c) => {
        const bForm = balanceForm[c.id] || {};
        const hasOpeningBalance = c.openingBalanceMinor != null;
        return (
          <div key={c.id} className="card elev-sm flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-primary-soft flex items-center justify-center font-semibold text-[13px] text-primary flex-none">SE</div>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-[15px] text-foreground">Bank via Setu</div>
                <div className="text-xs text-muted-foreground">
                  {c.status === "ACTIVE"
                    ? c.lastSyncedAt
                      ? `Synced ${new Date(c.lastSyncedAt).toLocaleString()}`
                      : "Approved — waiting on first data pull"
                    : "Needs reconnecting"}
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-3 flex flex-col gap-2">
              <div className="text-xs text-muted-foreground">
                {hasOpeningBalance
                  ? `Opening balance set: ₹${Number(c.openingBalanceMinor) / 100} as of ${new Date(c.openingBalanceDate).toLocaleDateString()}. This feeds "Available cash" on the Overview page.`
                  : 'No opening balance set yet — this account is excluded from "Available cash" on Overview until you set one.'}
              </div>
              <input
                className="input"
                placeholder="Balance (₹) as of a known date"
                value={bForm.balance ?? ""}
                onChange={(e) => setBalanceForm((s) => ({ ...s, [c.id]: { ...s[c.id], balance: e.target.value, saved: false } }))}
              />
              <input
                className="input"
                type="date"
                value={bForm.asOfDate ?? ""}
                onChange={(e) => setBalanceForm((s) => ({ ...s, [c.id]: { ...s[c.id], asOfDate: e.target.value, saved: false } }))}
              />
              {bForm.error ? <p className="text-[12px]" style={{ color: "var(--color-destructive)" }}>{bForm.error}</p> : null}
              {bForm.saved ? <p className="text-[12px]" style={{ color: "var(--color-success)" }}>Saved.</p> : null}
              <button
                className="btn btn-secondary"
                disabled={bForm.saving || !bForm.balance || !bForm.asOfDate}
                onClick={() => handleSaveOpeningBalance(c.id)}
              >
                {bForm.saving ? "Saving…" : hasOpeningBalance ? "Update opening balance" : "Set opening balance"}
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}

// One OAuth grant can cover multiple ad accounts (see modules/connectors/metaAds
// on the backend) — this lists however many real connections exist rather
// than assuming one, same idea as BankAccountsSection but for OAuth instead
// of manual add.
function MetaAdsSection({ getToken, refreshKey }) {
  const [connections, setConnections] = useState(undefined);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [syncingId, setSyncingId] = useState(null);
  const [syncProgress, setSyncProgress] = useState(null);
  const [syncBump, setSyncBump] = useState(0);
  // Which connectionId we've already auto-attached a resumed poll to — a
  // ref, not state, so it doesn't itself trigger a re-render/re-check loop.
  const resumedRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const token = await getToken();
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("request failed");
        const data = await res.json();
        if (!cancelled) setConnections(data.connections.filter((c) => c.provider === "META_ADS"));
      } catch {
        if (!cancelled) setConnections([]);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [getToken, refreshKey, syncBump]);

  // Fixes a real bug: syncingId is local React state, so it resets to null
  // the moment this component unmounts — navigating to another page and
  // back (or just reloading) made an actually-still-running sync look like
  // it had silently stopped, because nothing here was resuming it. This
  // re-checks each fresh `connections` snapshot for a job the *server*
  // reports as in-flight and, if we're not already watching it, resumes
  // polling — without re-triggering (`pollUntilSettled`, not `syncAndWait`,
  // the job is already running).
  useEffect(() => {
    if (!connections) return;
    const inFlight = connections.find((c) => isSyncInFlight(c.syncStatus));
    if (!inFlight || syncingId === inFlight.id || resumedRef.current === inFlight.id) return;
    resumedRef.current = inFlight.id;
    setSyncingId(inFlight.id);
    setSyncProgress(inFlight);
    pollUntilSettled(getToken, inFlight.id, setSyncProgress)
      .then(() => setSyncBump((n) => n + 1))
      .catch((err) => setError(err.message || "Sync failed."))
      .finally(() => {
        setSyncingId(null);
        setSyncProgress(null);
      });
  }, [connections, syncingId, getToken]);

  async function handleSync(connectionId) {
    setSyncingId(connectionId);
    setSyncProgress(null);
    setError("");
    try {
      await syncAndWait(getToken, connectionId, setSyncProgress);
      setSyncBump((n) => n + 1);
    } catch (err) {
      setError(err.message || "Sync failed.");
    } finally {
      setSyncingId(null);
      setSyncProgress(null);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    setError("");
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections/meta-ads/install`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          data.error === "meta_ads_not_configured"
            ? "Needs one-time setup: add META_APP_ID and META_APP_SECRET to cfo-backend/.env (from developers.facebook.com → your app → App Settings → Basic), then restart the backend."
            : data.error || "Could not start connection."
        );
      window.location.href = data.url;
    } catch (err) {
      setError(err.message || "Could not connect. Try again.");
      setConnecting(false);
    }
  }

  if (connections === undefined) {
    return <ConnectionCard name="Meta Ads" category="Ad platform" status="syncing" lastSync="Checking…" />;
  }

  if (connections.length === 0) {
    return (
      <div className="card elev-sm flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary-soft flex items-center justify-center font-semibold text-[13px] text-primary flex-none">ME</div>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-[15px] text-foreground">Meta Ads</div>
            <div className="text-xs text-muted-foreground">Ad platform</div>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">One login can connect multiple ad accounts at once — each shows up as its own card here.</p>
        {error ? <p className="text-[12px]" style={{ color: "var(--color-destructive)" }}>{error}</p> : null}
        <button className="btn btn-primary" disabled={connecting} onClick={handleConnect}>
          {connecting ? "Redirecting…" : "Connect Meta Ads"}
        </button>
      </div>
    );
  }

  return (
    <>
      {connections.map((c) => (
        <ConnectionCard
          key={c.id}
          name="Meta Ads"
          category={c.externalAccountId ?? "Ad platform"}
          status={c.status === "ACTIVE" ? "connected" : "error"}
          lastSync={c.lastSyncedAt ? `Synced ${new Date(c.lastSyncedAt).toLocaleString()}` : "Not yet synced"}
          actionLabel={syncingId === c.id ? formatSyncProgress(syncProgress) : "Sync now"}
          onAction={() => handleSync(c.id)}
          actionDisabled={syncingId === c.id}
        />
      ))}
      {error ? <p className="text-[12px]" style={{ color: "var(--color-destructive)" }}>{error}</p> : null}
    </>
  );
}

// Same shape as MetaAdsSection — OAuth, no form fields, one grant can list
// multiple ad accounts (Google Ads customer IDs).
// One OAuth grant can cover several Zoho organisations (one Connection each),
// same "don't assume 1:1" reasoning as the ad-account connectors.
function ZohoBooksSection({ getToken }) {
  const [connections, setConnections] = useState(undefined);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [syncingId, setSyncingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const token = await getToken();
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("request failed");
        const data = await res.json();
        if (!cancelled) setConnections(data.connections.filter((c) => c.provider === "ZOHO_BOOKS"));
      } catch {
        if (!cancelled) setConnections([]);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  async function handleConnect() {
    setConnecting(true);
    setError("");
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections/zoho-books/install`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.message ?? body.error ?? "Couldn't start Zoho authorisation.");
        return;
      }
      window.location.href = body.url;
    } catch {
      setError("Couldn't reach the backend.");
    } finally {
      setConnecting(false);
    }
  }

  async function handleSync(id) {
    setSyncingId(id);
    try {
      const token = await getToken();
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections/${id}/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } finally {
      setSyncingId(null);
    }
  }

  if (connections === undefined) {
    return <ConnectionCard name="Zoho Books" category="Accounting" status="syncing" lastSync="Checking…" />;
  }

  if (connections.length === 0) {
    return (
      <div className="gcard flex flex-col gap-3 p-5">
        <div>
          <div className="font-medium text-[15px] text-foreground">Zoho Books</div>
          <div className="text-[13px] text-muted-foreground">Accounting · vendor bills and expenses</div>
        </div>
        <p className="text-xs text-muted-foreground">
          Unblocks upcoming payments (§57) and operating expenses (§74). Read-only access — bills and expenses only.
        </p>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <button type="button" className="btn btn-primary self-start" onClick={handleConnect} disabled={connecting}>
          {connecting ? "Redirecting…" : "Connect Zoho Books"}
        </button>
      </div>
    );
  }

  return (
    <>
      {connections.map((c) => (
        <ConnectionCard
          key={c.id}
          name="Zoho Books"
          category={c.externalAccountId ? `Zoho org ${c.externalAccountId}` : "Accounting"}
          status={c.status === "ACTIVE" ? "connected" : "error"}
          lastSync={c.lastSyncedAt ? `Synced ${new Date(c.lastSyncedAt).toLocaleString()}` : "Not yet synced"}
          actionLabel={syncingId === c.id ? "Syncing…" : "Sync now"}
          onAction={() => handleSync(c.id)}
          actionDisabled={syncingId === c.id}
          error={c.lastSyncError}
        />
      ))}
    </>
  );
}

function GoogleAdsSection({ getToken, refreshKey }) {
  const [connections, setConnections] = useState(undefined);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [syncingId, setSyncingId] = useState(null);
  const [syncProgress, setSyncProgress] = useState(null);
  const [syncBump, setSyncBump] = useState(0);
  const resumedRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const token = await getToken();
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("request failed");
        const data = await res.json();
        if (!cancelled) setConnections(data.connections.filter((c) => c.provider === "GOOGLE_ADS"));
      } catch {
        if (!cancelled) setConnections([]);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [getToken, refreshKey, syncBump]);

  // See the identical effect in MetaAdsSection above for why this exists —
  // resumes watching a sync that's genuinely still running server-side
  // after this component (re)mounts, instead of relying on local state that
  // doesn't survive navigation.
  useEffect(() => {
    if (!connections) return;
    const inFlight = connections.find((c) => isSyncInFlight(c.syncStatus));
    if (!inFlight || syncingId === inFlight.id || resumedRef.current === inFlight.id) return;
    resumedRef.current = inFlight.id;
    setSyncingId(inFlight.id);
    setSyncProgress(inFlight);
    pollUntilSettled(getToken, inFlight.id, setSyncProgress)
      .then(() => setSyncBump((n) => n + 1))
      .catch((err) => setError(err.message || "Sync failed."))
      .finally(() => {
        setSyncingId(null);
        setSyncProgress(null);
      });
  }, [connections, syncingId, getToken]);

  async function handleSync(connectionId) {
    setSyncingId(connectionId);
    setSyncProgress(null);
    setError("");
    try {
      await syncAndWait(getToken, connectionId, setSyncProgress);
      setSyncBump((n) => n + 1);
    } catch (err) {
      setError(err.message || "Sync failed.");
    } finally {
      setSyncingId(null);
      setSyncProgress(null);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    setError("");
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections/google-ads/install`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          data.error === "google_ads_not_configured"
            ? "Needs one-time setup: add GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET and GOOGLE_ADS_DEVELOPER_TOKEN to cfo-backend/.env, then restart the backend."
            : data.error || "Could not start connection."
        );
      window.location.href = data.url;
    } catch (err) {
      setError(err.message || "Could not connect. Try again.");
      setConnecting(false);
    }
  }

  if (connections === undefined) {
    return <ConnectionCard name="Google Ads" category="Ad platform" status="syncing" lastSync="Checking…" />;
  }

  if (connections.length === 0) {
    return (
      <div className="card elev-sm flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary-soft flex items-center justify-center font-semibold text-[13px] text-primary flex-none">GO</div>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-[15px] text-foreground">Google Ads</div>
            <div className="text-xs text-muted-foreground">Ad platform</div>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">One login can connect multiple ad accounts at once — each shows up as its own card here.</p>
        {error ? <p className="text-[12px]" style={{ color: "var(--color-destructive)" }}>{error}</p> : null}
        <button className="btn btn-primary" disabled={connecting} onClick={handleConnect}>
          {connecting ? "Redirecting…" : "Connect Google Ads"}
        </button>
      </div>
    );
  }

  return (
    <>
      {connections.map((c) => (
        <ConnectionCard
          key={c.id}
          name="Google Ads"
          category={c.externalAccountId ?? "Ad platform"}
          status={c.status === "ACTIVE" ? "connected" : "error"}
          lastSync={c.lastSyncedAt ? `Synced ${new Date(c.lastSyncedAt).toLocaleString()}` : "Not yet synced"}
          actionLabel={syncingId === c.id ? formatSyncProgress(syncProgress) : "Sync now"}
          onAction={() => handleSync(c.id)}
          actionDisabled={syncingId === c.id}
        />
      ))}
      {error ? <p className="text-[12px]" style={{ color: "var(--color-destructive)" }}>{error}</p> : null}
    </>
  );
}

function ConnectionsContent() {
  const { getToken } = useAuth();
  const searchParams = useSearchParams();
  // undefined = still loading, false = not connected, object = connected
  const [shopifyConnection, setShopifyConnection] = useState(undefined);
  const [shopifyTokenResult, setShopifyTokenResult] = useState(null);
  const [razorpayConnection, setRazorpayConnection] = useState(undefined);
  const [shiprocketConnection, setShiprocketConnection] = useState(undefined);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [razorpayConnecting, setRazorpayConnecting] = useState(false);
  const [razorpayError, setRazorpayError] = useState("");
  const [razorpayResult, setRazorpayResult] = useState(null);
  const [shiprocketConnecting, setShiprocketConnecting] = useState(false);
  const [shiprocketError, setShiprocketError] = useState("");
  const [shiprocketResult, setShiprocketResult] = useState(null);
  const [delhiveryConnection, setDelhiveryConnection] = useState(undefined);
  const [delhiveryConnecting, setDelhiveryConnecting] = useState(false);
  const [delhiveryError, setDelhiveryError] = useState("");
  const [delhiveryWebhookUrl, setDelhiveryWebhookUrl] = useState(null);
  const [amazonConnection, setAmazonConnection] = useState(undefined);
  const [amazonConnecting, setAmazonConnecting] = useState(false);
  const [amazonError, setAmazonError] = useState("");
  const [flipkartConnection, setFlipkartConnection] = useState(undefined);
  const [flipkartConnecting, setFlipkartConnecting] = useState(false);
  const [flipkartError, setFlipkartError] = useState("");
  const [flipkartResult, setFlipkartResult] = useState(null);
  const [clickpostConnection, setClickpostConnection] = useState(undefined);
  const [clickpostConnecting, setClickpostConnecting] = useState(false);
  const [clickpostError, setClickpostError] = useState("");
  const [clickpostWebhookUrl, setClickpostWebhookUrl] = useState(null);
  const [syncingId, setSyncingId] = useState(null);
  const [syncProgress, setSyncProgress] = useState(null);
  const [syncError, setSyncError] = useState("");
  const [syncBump, setSyncBump] = useState(0);
  const resumedRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function loadConnections() {
      try {
        const token = await getToken();
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("request failed");
        const data = await res.json();
        if (cancelled) return;
        setShopifyConnection(data.connections.find((c) => c.provider === "SHOPIFY") ?? false);
        setRazorpayConnection(data.connections.find((c) => c.provider === "RAZORPAY") ?? false);
        setShiprocketConnection(data.connections.find((c) => c.provider === "SHIPROCKET") ?? false);
        setDelhiveryConnection(data.connections.find((c) => c.provider === "DELHIVERY") ?? false);
        setAmazonConnection(data.connections.find((c) => c.provider === "AMAZON") ?? false);
        setFlipkartConnection(data.connections.find((c) => c.provider === "FLIPKART") ?? false);
        setClickpostConnection(data.connections.find((c) => c.provider === "CLICKPOST") ?? false);

        // Same "resume a job the server says is actually still running"
        // fix as MetaAdsSection/GoogleAdsSection — this section just tracks
        // its providers as separate connection objects rather than an
        // array, so the in-flight check has to look across all of them here.
        const inFlight = [
          data.connections.find((c) => c.provider === "SHOPIFY"),
          data.connections.find((c) => c.provider === "RAZORPAY"),
          data.connections.find((c) => c.provider === "SHIPROCKET"),
          data.connections.find((c) => c.provider === "DELHIVERY"),
          data.connections.find((c) => c.provider === "AMAZON"),
          data.connections.find((c) => c.provider === "FLIPKART"),
          data.connections.find((c) => c.provider === "CLICKPOST"),
        ].find((c) => c && isSyncInFlight(c.syncStatus));
        if (inFlight && syncingId !== inFlight.id && resumedRef.current !== inFlight.id) {
          resumedRef.current = inFlight.id;
          setSyncingId(inFlight.id);
          setSyncProgress(inFlight);
          pollUntilSettled(getToken, inFlight.id, setSyncProgress)
            .then(() => setSyncBump((n) => n + 1))
            .catch((err) => setSyncError(err.message || "Sync failed."))
            .finally(() => {
              setSyncingId(null);
              setSyncProgress(null);
            });
        }
      } catch {
        if (!cancelled) {
          setShopifyConnection(false);
          setRazorpayConnection(false);
          setShiprocketConnection(false);
          setDelhiveryConnection(false);
          setAmazonConnection(false);
          setFlipkartConnection(false);
          setClickpostConnection(false);
        }
      }
    }
    loadConnections();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- syncingId is read but deliberately not a dep: adding it would re-run this fetch every time a sync starts/stops, which loadConnections itself already handles via syncBump.
  }, [getToken, searchParams, razorpayResult, shiprocketResult, delhiveryWebhookUrl, shopifyTokenResult, flipkartResult, clickpostWebhookUrl, syncBump]);

  async function handleSync(connectionId) {
    setSyncingId(connectionId);
    setSyncProgress(null);
    setSyncError("");
    try {
      await syncAndWait(getToken, connectionId, setSyncProgress);
      setSyncBump((n) => n + 1);
    } catch (err) {
      setSyncError(err.message || "Sync failed.");
    } finally {
      setSyncingId(null);
      setSyncProgress(null);
    }
  }

  async function handleConnectShopify(shop) {
    setConnecting(true);
    setConnectError("");
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections/shopify/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ shop }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error === "shopify_not_configured" ? "Shopify isn't configured on the backend yet." : data.error || "Could not start connection.");
      window.location.href = data.url;
    } catch (err) {
      setConnectError(err.message || "Could not connect. Check the store domain and try again.");
      setConnecting(false);
    }
  }

  async function handleConnectShopifyToken(creds) {
    setConnecting(true);
    setConnectError("");
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections/shopify/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(creds),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error === "invalid_credentials"
            ? "That access token doesn't look valid for this store."
            : data.error === "shopify_unreachable"
              ? "Couldn't reach Shopify to validate the token — try again in a moment."
              : data.error === "connect_failed"
                ? "Connected, but pulling data from the store failed partway through — check the backend log, then try again (it's safe to retry)."
                : data.error || "Could not connect."
        );
      }
      setShopifyTokenResult(data.recordsFetched);
    } catch (err) {
      setConnectError(err.message || "Could not connect. Check the domain and token and try again.");
    } finally {
      setConnecting(false);
    }
  }

  async function handleConnectRazorpay(creds) {
    setRazorpayConnecting(true);
    setRazorpayError("");
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections/razorpay/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(creds),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error === "invalid_credentials" ? "Those keys don't look valid — check the Key ID/Secret." : data.error || "Could not connect.");
      setRazorpayResult(data.recordsFetched);
    } catch (err) {
      setRazorpayError(err.message || "Could not connect. Check the credentials and try again.");
    } finally {
      setRazorpayConnecting(false);
    }
  }

  async function handleConnectShiprocket(creds) {
    setShiprocketConnecting(true);
    setShiprocketError("");
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections/shiprocket/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(creds),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error === "invalid_credentials" ? "Those credentials don't look valid — check the API user email/password." : data.error || "Could not connect.");
      setShiprocketResult(data.recordsFetched);
    } catch (err) {
      setShiprocketError(err.message || "Could not connect. Check the credentials and try again.");
    } finally {
      setShiprocketConnecting(false);
    }
  }

  async function handleConnectDelhivery(apiToken) {
    setDelhiveryConnecting(true);
    setDelhiveryError("");
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections/delhivery/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ apiToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error === "invalid_credentials" ? "That API token doesn't look valid." : data.error || "Could not connect.");
      setDelhiveryWebhookUrl(data.webhookUrl);
    } catch (err) {
      setDelhiveryError(err.message || "Could not connect. Check the API token and try again.");
    } finally {
      setDelhiveryConnecting(false);
    }
  }

  // OAuth — same "get the URL, navigate there separately" shape as
  // handleConnectShopify's OAuth path, since the actual navigation to
  // Amazon's consent screen has to be a plain browser request, not the
  // result of an authenticated fetch().
  async function handleConnectAmazon() {
    setAmazonConnecting(true);
    setAmazonError("");
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections/amazon/install`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          data.error === "amazon_not_configured"
            ? "Needs one-time setup: add AMAZON_APP_ID, AMAZON_LWA_CLIENT_ID and AMAZON_LWA_CLIENT_SECRET to cfo-backend/.env (from Seller Central's Developer Console), then restart the backend."
            : data.error || "Could not start connection."
        );
      window.location.href = data.url;
    } catch (err) {
      setAmazonError(err.message || "Could not connect. Try again.");
      setAmazonConnecting(false);
    }
  }

  async function handleConnectFlipkart(creds) {
    setFlipkartConnecting(true);
    setFlipkartError("");
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections/flipkart/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(creds),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error === "invalid_credentials" ? "Those credentials don't look valid." : data.error || "Could not connect.");
      setFlipkartResult(data);
    } catch (err) {
      setFlipkartError(err.message || "Could not connect. Check the App ID/Secret and try again.");
    } finally {
      setFlipkartConnecting(false);
    }
  }

  async function handleConnectClickPost(creds) {
    setClickpostConnecting(true);
    setClickpostError("");
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/connections/clickpost/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(creds),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error === "invalid_credentials" ? "Those credentials don't look valid." : data.error || "Could not connect.");
      setClickpostWebhookUrl(data.webhookUrl);
    } catch (err) {
      setClickpostError(err.message || "Could not connect. Check the username/API key and try again.");
    } finally {
      setClickpostConnecting(false);
    }
  }

  const shopifyStatus = searchParams.get("shopify");
  const metaAdsStatus = searchParams.get("metaAds");
  const googleAdsStatus = searchParams.get("googleAds");
  const amazonStatus = searchParams.get("amazon");

  return (
    <>
      <TopNav title="Connections" subtitle="Connect the sources CFOOS reads from · 3 of 6 core sources connected" />

      <div className="flex flex-col gap-8">
        {shopifyStatus === "connected" ? (
          <div className="rounded-md p-3.5 text-sm" style={{ background: "var(--color-success-soft)", color: "var(--color-success)" }}>
            Shopify connected — pulled {searchParams.get("orders") ?? "0"} orders.
          </div>
        ) : shopifyStatus === "error" ? (
          <div className="rounded-md p-3.5 text-sm" style={{ background: "var(--color-destructive-soft)", color: "var(--color-destructive)" }}>
            Shopify connection failed. Check the backend log for details and try again.
          </div>
        ) : null}

        {syncError ? (
          <div className="rounded-md p-3.5 text-sm" style={{ background: "var(--color-destructive-soft)", color: "var(--color-destructive)" }}>
            {syncError}
          </div>
        ) : null}

        {shopifyTokenResult !== null ? (
          <div className="rounded-md p-3.5 text-sm" style={{ background: "var(--color-success-soft)", color: "var(--color-success)" }}>
            Shopify connected — pulled {shopifyTokenResult} orders + products.
          </div>
        ) : null}

        {razorpayResult !== null ? (
          <div className="rounded-md p-3.5 text-sm" style={{ background: "var(--color-success-soft)", color: "var(--color-success)" }}>
            Razorpay connected — pulled {razorpayResult} payments + settlements.
          </div>
        ) : null}

        {shiprocketResult !== null ? (
          <div className="rounded-md p-3.5 text-sm" style={{ background: "var(--color-success-soft)", color: "var(--color-success)" }}>
            Shiprocket connected — pulled {shiprocketResult} orders/shipments.
          </div>
        ) : null}

        {delhiveryWebhookUrl ? (
          <div className="rounded-md p-3.5 text-sm flex flex-col gap-2" style={{ background: "var(--color-success-soft)", color: "var(--color-success)" }}>
            <div>
              Delhivery connected. Send this URL to Delhivery&apos;s onboarding team as the endpoint to push shipment scans to —
              it won&apos;t be shown again after you leave this page:
            </div>
            <code className="text-[12px] p-2 rounded" style={{ background: "var(--color-muted)", wordBreak: "break-all" }}>{delhiveryWebhookUrl}</code>
          </div>
        ) : null}

        {clickpostWebhookUrl ? (
          <div className="rounded-md p-3.5 text-sm flex flex-col gap-2" style={{ background: "var(--color-success-soft)", color: "var(--color-success)" }}>
            <div>
              ClickPost connected. Paste this URL into ClickPost&apos;s dashboard as your tracking webhook — shipments only start
              appearing here once ClickPost pushes to it, and this URL won&apos;t be shown again after you leave this page:
            </div>
            <code className="text-[12px] p-2 rounded" style={{ background: "var(--color-muted)", wordBreak: "break-all" }}>{clickpostWebhookUrl}</code>
          </div>
        ) : null}

        {metaAdsStatus === "connected" ? (
          <div className="rounded-md p-3.5 text-sm" style={{ background: "var(--color-success-soft)", color: "var(--color-success)" }}>
            Meta Ads connected — {searchParams.get("accounts") ?? "0"} ad account(s), pulled {searchParams.get("records") ?? "0"} days of spend.
          </div>
        ) : metaAdsStatus === "error" ? (
          <div className="rounded-md p-3.5 text-sm" style={{ background: "var(--color-destructive-soft)", color: "var(--color-destructive)" }}>
            Meta Ads connection failed. Check the backend log for details and try again.
          </div>
        ) : null}

        {googleAdsStatus === "connected" ? (
          <div className="rounded-md p-3.5 text-sm" style={{ background: "var(--color-success-soft)", color: "var(--color-success)" }}>
            Google Ads connected — {searchParams.get("accounts") ?? "0"} account(s), pulled {searchParams.get("records") ?? "0"} days of spend.
          </div>
        ) : googleAdsStatus === "error" ? (
          <div className="rounded-md p-3.5 text-sm" style={{ background: "var(--color-destructive-soft)", color: "var(--color-destructive)" }}>
            Google Ads connection failed. Check the backend log for details and try again.
          </div>
        ) : null}

        {amazonStatus === "connected" ? (
          <div className="rounded-md p-3.5 text-sm" style={{ background: "var(--color-success-soft)", color: "var(--color-success)" }}>
            Amazon Seller Central connected — pulled {searchParams.get("records") ?? "0"} orders and settlement transactions.
          </div>
        ) : amazonStatus === "error" ? (
          <div className="rounded-md p-3.5 text-sm" style={{ background: "var(--color-destructive-soft)", color: "var(--color-destructive)" }}>
            Amazon connection failed. Check the backend log for details and try again.
          </div>
        ) : null}

        {GROUPS.map((g) => (
          <div key={g.title}>
            <h2 className="mb-3 text-[13px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{g.title}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {g.items.map((c) => {
                if (c.name === "Shopify") {
                  if (shopifyConnection === undefined) return <ConnectionCard key={c.name} name="Shopify" category="Storefront" status="syncing" lastSync="Checking…" />;
                  if (!shopifyConnection) return <ShopifyConnectCard key={c.name} onConnect={handleConnectShopify} onConnectToken={handleConnectShopifyToken} connecting={connecting} error={connectError} />;
                  return (
                    <ConnectionCard
                      key={c.name}
                      name="Shopify"
                      category={shopifyConnection.externalAccountId ?? "Storefront"}
                      status={shopifyConnection.status === "ACTIVE" ? "connected" : "error"}
                      lastSync={shopifyConnection.lastSyncedAt ? `Synced ${new Date(shopifyConnection.lastSyncedAt).toLocaleString()}` : "Not yet synced"}
                      actionLabel={syncingId === shopifyConnection.id ? formatSyncProgress(syncProgress) : "Sync now"}
                      onAction={() => handleSync(shopifyConnection.id)}
                      actionDisabled={syncingId === shopifyConnection.id}
                    />
                  );
                }
                if (c.name === "Razorpay") {
                  if (razorpayConnection === undefined) return <ConnectionCard key={c.name} name="Razorpay" category="Payment gateway" status="syncing" lastSync="Checking…" />;
                  if (!razorpayConnection) return <RazorpayConnectCard key={c.name} onConnect={handleConnectRazorpay} connecting={razorpayConnecting} error={razorpayError} />;
                  return (
                    <ConnectionCard
                      key={c.name}
                      name="Razorpay"
                      category={razorpayConnection.externalAccountId ?? "Payment gateway"}
                      status={razorpayConnection.status === "ACTIVE" ? "connected" : "error"}
                      lastSync={razorpayConnection.lastSyncedAt ? `Synced ${new Date(razorpayConnection.lastSyncedAt).toLocaleString()}` : "Not yet synced"}
                      actionLabel={syncingId === razorpayConnection.id ? formatSyncProgress(syncProgress) : "Sync now"}
                      onAction={() => handleSync(razorpayConnection.id)}
                      actionDisabled={syncingId === razorpayConnection.id}
                    />
                  );
                }
                if (c.name === "Bank accounts") {
                  return <BankAccountsSection key={c.name} getToken={getToken} />;
                }
                if (c.name === "Bank via Setu") {
                  return <SetuBankSection key={c.name} getToken={getToken} />;
                }
                if (c.name === "Meta Ads") {
                  return <MetaAdsSection key={c.name} getToken={getToken} refreshKey={metaAdsStatus} />;
                }
                if (c.name === "Google Ads") {
                  return <GoogleAdsSection key={c.name} getToken={getToken} refreshKey={googleAdsStatus} />;
                }
                if (c.name === "Zoho Books") {
                  return <ZohoBooksSection key={c.name} getToken={getToken} />;
                }
                if (c.name === "Meta Ads CSV") {
                  return <AdSpendCsvSection key={c.name} getToken={getToken} slug="meta-ads" />;
                }
                if (c.name === "Google Ads CSV") {
                  return <AdSpendCsvSection key={c.name} getToken={getToken} slug="google-ads" />;
                }
                if (c.name === "GoKwik") {
                  return <RemittanceSection key={c.name} getToken={getToken} provider="GOKWIK" />;
                }
                if (c.name === "Bluedart") {
                  return <RemittanceSection key={c.name} getToken={getToken} provider="BLUEDART" />;
                }
                if (c.name === "Tally") {
                  return (
                    <ConnectionCard
                      key={c.name}
                      name="Tally"
                      category="Accounting (on-premise)"
                      status="not_connected"
                      lastSync="Runs on your own machine — needs a desktop bridge"
                      actionLabel="Not available"
                      actionDisabled
                    />
                  );
                }
                if (c.name === "Shiprocket") {
                  if (shiprocketConnection === undefined) return <ConnectionCard key={c.name} name="Shiprocket" category="3PL / shipping" status="syncing" lastSync="Checking…" />;
                  if (!shiprocketConnection) return <ShiprocketConnectCard key={c.name} onConnect={handleConnectShiprocket} connecting={shiprocketConnecting} error={shiprocketError} />;
                  return (
                    <ConnectionCard
                      key={c.name}
                      name="Shiprocket"
                      category={shiprocketConnection.externalAccountId ?? "3PL / shipping"}
                      status={shiprocketConnection.status === "ACTIVE" ? "connected" : "error"}
                      lastSync={shiprocketConnection.lastSyncedAt ? `Synced ${new Date(shiprocketConnection.lastSyncedAt).toLocaleString()}` : "Not yet synced"}
                      actionLabel={syncingId === shiprocketConnection.id ? formatSyncProgress(syncProgress) : "Sync now"}
                      onAction={() => handleSync(shiprocketConnection.id)}
                      actionDisabled={syncingId === shiprocketConnection.id}
                    />
                  );
                }
                if (c.name === "Delhivery") {
                  if (delhiveryConnection === undefined) return <ConnectionCard key={c.name} name="Delhivery" category="3PL / shipping" status="syncing" lastSync="Checking…" />;
                  if (!delhiveryConnection) return <DelhiveryConnectCard key={c.name} onConnect={handleConnectDelhivery} connecting={delhiveryConnecting} error={delhiveryError} />;
                  return (
                    <ConnectionCard
                      key={c.name}
                      name="Delhivery"
                      category="3PL / shipping"
                      status={delhiveryConnection.status === "ACTIVE" ? "connected" : "error"}
                      lastSync={delhiveryConnection.lastSyncedAt ? `Synced ${new Date(delhiveryConnection.lastSyncedAt).toLocaleString()}` : "Awaiting first webhook scan"}
                      actionLabel={syncingId === delhiveryConnection.id ? formatSyncProgress(syncProgress) : "Sync now"}
                      onAction={() => handleSync(delhiveryConnection.id)}
                      actionDisabled={syncingId === delhiveryConnection.id}
                    />
                  );
                }
                if (c.name === "ClickPost") {
                  if (clickpostConnection === undefined) return <ConnectionCard key={c.name} name="ClickPost" category="Shipping aggregator" status="syncing" lastSync="Checking…" />;
                  if (!clickpostConnection) return <ClickPostConnectCard key={c.name} onConnect={handleConnectClickPost} connecting={clickpostConnecting} error={clickpostError} />;
                  return (
                    <ConnectionCard
                      key={c.name}
                      name="ClickPost"
                      category={clickpostConnection.externalAccountId ?? "Shipping aggregator"}
                      status={clickpostConnection.status === "ACTIVE" ? "connected" : "error"}
                      lastSync={clickpostConnection.lastSyncedAt ? `Synced ${new Date(clickpostConnection.lastSyncedAt).toLocaleString()}` : "Awaiting first webhook push"}
                      actionLabel={syncingId === clickpostConnection.id ? formatSyncProgress(syncProgress) : "Sync now"}
                      onAction={() => handleSync(clickpostConnection.id)}
                      actionDisabled={syncingId === clickpostConnection.id}
                    />
                  );
                }
                if (c.name === "Amazon Seller Central") {
                  if (amazonConnection === undefined) return <ConnectionCard key={c.name} name="Amazon Seller Central" category="Marketplace" status="syncing" lastSync="Checking…" />;
                  if (!amazonConnection) return <AmazonConnectCard key={c.name} onConnect={handleConnectAmazon} connecting={amazonConnecting} error={amazonError} />;
                  return (
                    <ConnectionCard
                      key={c.name}
                      name="Amazon Seller Central"
                      category={amazonConnection.externalAccountId ?? "Marketplace"}
                      status={amazonConnection.status === "ACTIVE" ? "connected" : "error"}
                      lastSync={amazonConnection.lastSyncedAt ? `Synced ${new Date(amazonConnection.lastSyncedAt).toLocaleString()}` : "Not yet synced"}
                      actionLabel={syncingId === amazonConnection.id ? formatSyncProgress(syncProgress) : "Sync now"}
                      onAction={() => handleSync(amazonConnection.id)}
                      actionDisabled={syncingId === amazonConnection.id}
                    />
                  );
                }
                if (c.name === "Flipkart") {
                  if (flipkartConnection === undefined) return <ConnectionCard key={c.name} name="Flipkart" category="Marketplace" status="syncing" lastSync="Checking…" />;
                  if (!flipkartConnection) return <FlipkartConnectCard key={c.name} onConnect={handleConnectFlipkart} connecting={flipkartConnecting} error={flipkartError} />;
                  return (
                    <ConnectionCard
                      key={c.name}
                      name="Flipkart"
                      category="Marketplace"
                      status={flipkartConnection.status === "ACTIVE" ? "connected" : "error"}
                      lastSync={flipkartConnection.lastSyncedAt ? `Synced ${new Date(flipkartConnection.lastSyncedAt).toLocaleString()}` : "Not yet synced"}
                      actionLabel={syncingId === flipkartConnection.id ? formatSyncProgress(syncProgress) : "Sync now"}
                      onAction={() => handleSync(flipkartConnection.id)}
                      actionDisabled={syncingId === flipkartConnection.id}
                    />
                  );
                }
                if (c.name === "Myntra Partner Portal") {
                  // Genuinely not built — Myntra has no public seller API
                  // (checked before this pass, see cfo-docs/PROGRESS.md).
                  // Disabled rather than clickable so it can't be mistaken
                  // for a real, just-not-yet-connected integration.
                  return (
                    <ConnectionCard
                      key={c.name}
                      name="Myntra Partner Portal"
                      category="Marketplace"
                      status="not_connected"
                      actionLabel="No public API"
                      actionDisabled
                    />
                  );
                }
                return <ConnectionCard key={c.name} {...c} />;
              })}
            </div>
          </div>
        ))}

        {/* Not a provider card: one address serves every courier at once, so it
            sits outside the provider grid rather than pretending to be one of
            them. */}
        <div>
          <h2 className="mb-3 text-[13px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Email in</h2>
          <EmailInSection getToken={getToken} />
        </div>

        <div className="flex justify-end">
          <Link href="/" className="btn btn-primary no-underline">Continue to dashboard</Link>
        </div>
      </div>
    </>
  );
}

export default function ConnectionsPage() {
  return (
    <Suspense fallback={<TopNav title="Connections" subtitle="Connect the sources CFOOS reads from" />}>
      <ConnectionsContent />
    </Suspense>
  );
}
