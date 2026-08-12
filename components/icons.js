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

export const NAV_ICONS = {
  approvals: '<path d="M12 3l7.5 3.2v5.1c0 4.4-3 8.2-7.5 9.7-4.5-1.5-7.5-5.3-7.5-9.7V6.2Z" fill="currentColor" fill-opacity="0.14" stroke-linejoin="round"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  overview: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  dailyBrief: '<path d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/><circle cx="12" cy="12" r="4" fill="currentColor" fill-opacity="0.18" stroke="none"/><circle cx="12" cy="12" r="4"/>',
  revenue: '<path d="M4 16l5-5 4 4 7-8" fill="none"/><path d="M14 7h6v6" fill="none"/>',
  profitability: '<path d="M12 3a9 9 0 1 0 9 9h-9Z" fill="currentColor" fill-opacity="0.18"/><path d="M12 3a9 9 0 1 0 9 9h-9Z"/><path d="M12 3v9h9"/>',
  cashFlow: '<rect x="3" y="6" width="18" height="13" rx="2" fill="currentColor" fill-opacity="0.15" stroke-linejoin="round"/><path d="M3 10h18"/><circle cx="17" cy="14.5" r="1.3" fill="currentColor" stroke="none"/>',
  settlements: '<path d="M4 10l8-6 8 6" fill="none"/><path d="M5 10v9M10 10v9M14 10v9M19 10v9" /><path d="M3 19h18"/>',
  reconciliation: '<rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" fill-opacity="0.12"/><path d="M8 12l3 3 5-6"/>',
  expenses: '<path d="M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5Z" fill="currentColor" fill-opacity="0.12" stroke-linejoin="round"/><path d="M9 9h6M9 13h6"/>',
  inventory: '<path d="M3 8l9-5 9 5-9 5-9-5Z" fill="currentColor" fill-opacity="0.18" stroke-linejoin="round"/><path d="M3 8v9l9 5 9-5V8M12 13v9"/>',
  costs: '<path d="M20.6 13.4 12 22l-9-9V4a1 1 0 0 1 1-1h8l8.6 8.6a1.4 1.4 0 0 1 0 1.8Z" fill="currentColor" fill-opacity="0.15" stroke-linejoin="round"/><circle cx="7.5" cy="7.5" r="1.4"/>',
  exceptions: '<path d="M12 3l10 18H2Z" fill="currentColor" fill-opacity="0.16" stroke-linejoin="round"/><path d="M12 10v4"/><circle cx="12" cy="17.3" r="0.9" fill="currentColor" stroke="none"/>',
  aiCfo: '<path d="M4 5h16v11H9l-5 4Z" fill="currentColor" fill-opacity="0.14" stroke-linejoin="round"/><path d="M8 10h8M8 13h5"/>',
  reports: '<path d="M6 20V10M12 20V4M18 20v-7" stroke-linecap="round"/><path d="M3 20h18" stroke-linecap="round"/>',
  connections: '<circle cx="7" cy="12" r="3.5" fill="currentColor" fill-opacity="0.16"/><circle cx="17" cy="12" r="3.5" fill="currentColor" fill-opacity="0.16"/><path d="M10.2 12h3.6"/>',
  team: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4" fill="currentColor" fill-opacity="0.16"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  settings: '<circle cx="12" cy="12" r="2.6" fill="currentColor" fill-opacity="0.2"/><path d="M12 4v2.2M12 17.8V20M20 12h-2.2M6.2 12H4M17 7l-1.5 1.5M8.5 15.5L7 17M17 17l-1.5-1.5M8.5 8.5L7 7"/>',
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
