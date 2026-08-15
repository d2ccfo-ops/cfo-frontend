// Inline icon set — ported verbatim from the source design components'
// embedded SVG path strings (Sidebar.dc.html, MetricCard.dc.html, etc).
// A generic <Icon> renders raw path markup via dangerouslySetInnerHTML,
// same technique the source used; the strings are static and trusted.

export function Icon({ paths, size = 18, viewBox = "0 0 24 24", stroke = "currentColor", strokeWidth = 1.6, className, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: paths }}
    />
  );
}

// Nav glyphs, taken from the same lucide icons ai-cfo-design names in its
// nav-items.ts (LayoutDashboard, Sun, TrendingUp, ChartPie, Wallet, Banknote,
// Scale, Receipt, Boxes, TriangleAlert, Bot, FileText, Plug, Users, Settings)
// so the two apps read as one product. The geometry is copied rather than
// imported: lucide-react would be a new dependency for seventeen glyphs, and
// every icon here already renders through one <Icon> with currentColor.
//
// These are pure outlines — no fill, no fill-opacity — which is the visible
// difference from the set they replace. The old glyphs used a tinted fill to
// carry weight against a white rail; the nav now sits on a gcard panel where
// that tint reads as smudge. lucide is ISC licensed.
//
// `costs` (Tag) and `approvals` (ShieldCheck) have no entry in the design's
// nav — it ships neither route — so they are matched to the nearest lucide
// glyph rather than left in the old style, which would have made exactly two
// rows look foreign.
export const NAV_ICONS = {
  overview: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  dailyBrief: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  revenue: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
  profitability: '<path d="M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z"/><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/>',
  cashFlow: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  settlements: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  reconciliation: '<path d="M12 3v18"/><path d="m19 8 3 8a5 5 0 0 1-6 0zV7"/><path d="M3 7h1a17 17 0 0 0 8-2 17 17 0 0 0 8 2h1"/><path d="m5 8 3 8a5 5 0 0 1-6 0zV7"/><path d="M7 21h10"/>',
  expenses: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
  inventory: '<path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z"/><path d="m7 16.5-4.74-2.85"/><path d="m7 16.5 5-3"/><path d="M7 16.5v5.17"/><path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z"/><path d="m17 16.5-5-3"/><path d="m17 16.5 4.74-2.85"/><path d="M17 16.5v5.17"/><path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z"/><path d="M12 8 7.26 5.15"/><path d="m12 8 4.74-2.85"/><path d="M12 13.5V8"/>',
  costs: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  exceptions: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  approvals: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  aiCfo: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  reports: '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  connections: '<path d="M12 22v-5"/><path d="M15 8V2"/><path d="M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z"/><path d="M9 8V2"/>',
  team: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
  settings: '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>',
};

export const NAV_ORDER = [
  { key: "overview", label: "Overview", href: "/" },
  { key: "dailyBrief", label: "Daily Brief", href: "/daily-brief" },
  { key: "revenue", label: "Revenue", href: "/revenue" },
  { key: "profitability", label: "Profitability", href: "/profitability" },
  { key: "cashFlow", label: "Cash Flow", href: "/cash-flow" },
  { key: "settlements", label: "Settlements", href: "/settlements" },
  { key: "reconciliation", label: "Reconciliation", href: "/reconciliation" },
  { key: "expenses", label: "Expenses", href: "/expenses" },
  { key: "inventory", label: "Inventory", href: "/inventory" },
  { key: "costs", label: "Product costs", href: "/costs" },
  { key: "exceptions", label: "Exceptions", href: "/exceptions" },
  { key: "approvals", label: "Approvals", href: "/approvals" },
];

export const NAV_ORDER_2 = [
  { key: "aiCfo", label: "AI CFO", href: "/ai-cfo" },
  { key: "reports", label: "Reports", href: "/reports" },
  { key: "connections", label: "Connections", href: "/connections" },
  { key: "team", label: "Team", href: "/team" },
  { key: "settings", label: "Settings", href: "/settings" },
];

export function arrowIconPaths(dir) {
  return dir === "up" ? 'M4 13l5-5 4 4 7-7' : dir === "down" ? 'M4 6l5 5 4-4 7 7' : 'M4 10h14';
}

export const ALERT_TRIANGLE_PATHS = '<path d="M12 2.5l10.5 19h-21Z" fill="currentColor" fill-opacity="0.18" stroke-linejoin="round"/><path d="M12 9v5.4"/><circle cx="12" cy="17.7" r="0.9" fill="currentColor" stroke="none"/>';
export const ERROR_TRIANGLE_PATHS = '<path d="M12 2.5l10.5 19h-21Z" fill="currentColor" fill-opacity="0.15" stroke-linejoin="round"/><path d="M12 9v5.4"/><circle cx="12" cy="17.7" r="0.9" fill="currentColor" stroke="none"/>';
export const EMPTY_CIRCLE_PATHS = '<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity="0.12"/><path d="M8 12h8M12 8v8"/>';
export const CALENDAR_PATHS = '<rect x="3.5" y="5" width="17" height="15" rx="2" fill="currentColor" fill-opacity="0.14"/><path d="M8 3v4M16 3v4M3.5 10h17"/>';
export const ENTITY_PATHS = '<path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" fill="currentColor" fill-opacity="0.14"/><circle cx="12" cy="8" r="3.6" fill="currentColor" fill-opacity="0.18"/>';

export const MENU_PATHS = '<path d="M4 6h16M4 12h16M4 18h16" stroke-linecap="round"/>';
export const PLUS_PATHS = '<path d="M12 5v14M5 12h14" stroke-linecap="round"/>';
export const MORE_VERTICAL_PATHS = '<circle cx="12" cy="5" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.1" fill="currentColor" stroke="none"/>';
export const INFO_PATHS = '<circle cx="12" cy="12" r="9"/><path d="M12 11v5" stroke-linecap="round"/><circle cx="12" cy="7.6" r="0.9" fill="currentColor" stroke="none"/>';
export const TRASH_PATHS = '<path d="M4 7h16" stroke-linecap="round"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" stroke-linecap="round" stroke-linejoin="round"/>';
export const GRIP_PATHS = '<circle cx="9" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.2" fill="currentColor" stroke="none"/>';
export const SEARCH_PATHS = '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3" stroke-linecap="round"/>';
export const BELL_PATHS = '<path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9Z" stroke-linejoin="round"/><path d="M10 18a2 2 0 0 0 4 0" stroke-linecap="round"/>';
export const HELP_CIRCLE_PATHS = '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.1.9-1.1 1.8" stroke-linecap="round"/><circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none"/>';

// Geometry below is transcribed from lucide's own SVGs (MIT, © lucide
// contributors) on the same 24x24 grid the <Icon> wrapper already assumes.
// Transcribed rather than imported on purpose: lucide-react is not a
// dependency of this app and is not going to become one for thirteen paths.
// Plain single-weight strokes, matching the utility icons above rather than
// the duotone NAV_ICONS — the <Icon> wrapper supplies fill="none",
// stroke="currentColor" and round caps/joins, so these carry no attributes.
export const CHEVRON_DOWN_PATHS = '<path d="m6 9 6 6 6-6"/>';
export const CIRCLE_ALERT_PATHS = '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>';
export const WRENCH_PATHS = '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"/>';
export const COPY_PATHS = '<rect x="8" y="8" width="14" height="14" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>';
export const SHIELD_CHECK_PATHS = '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>';
export const SPARKLES_PATHS = '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>';
export const SEND_HORIZONTAL_PATHS = '<path d="M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904z"/><path d="M6 12h16"/>';
export const MESSAGE_SQUARE_PLUS_PATHS = '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M12 8v6"/><path d="M9 11h6"/>';
export const PANEL_LEFT_OPEN_PATHS = '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="m14 9 3 3-3 3"/>';
export const X_PATHS = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';
export const CHECK_PATHS = '<path d="M20 6 9 17l-5-5"/>';
export const LIGHTBULB_PATHS = '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>';
export const PIN_PATHS = '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>';

// lucide renamed send-horizonal -> send-horizontal in v0.400; the brief spells
// it the old way, so both spellings resolve to the same paths.
export const SEND_HORIZONAL_PATHS = SEND_HORIZONTAL_PATHS;

// Hero-metric glyphs for "Today at a glance" (lucide Wallet, TrendingUp,
// Percent — the same three ai-cfo-design's HERO_ICONS names).
export const WALLET_PATHS = '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>';
export const TRENDING_UP_PATHS = '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>';
export const PERCENT_PATHS = '<line x1="19" x2="5" y1="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>';
