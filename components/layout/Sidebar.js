"use client";

import { OrganizationSwitcher, SignOutButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, NAV_ICONS, NAV_ORDER, NAV_ORDER_2 } from "@/components/icons";

const clerkFooterAppearance = {
  variables: {
    colorPrimary: "var(--color-primary)",
    colorText: "var(--color-foreground)",
    fontFamily: "var(--font-sans)",
    borderRadius: "var(--radius-sm)",
  },
  elements: {
    userButtonBox: { flexDirection: "row-reverse" },
    organizationSwitcherTrigger: { padding: 0, fontSize: "13px" },
  },
};

// Hover is bg-muted, not the design's hover:bg-sidebar-accent. In light mode
// --sidebar-accent is byte-identical to --card, and this row now sits INSIDE a
// gcard, so hover:bg-sidebar-accent would tint card-on-card and read as dead.
// Active keeps the token but leans on shadow-card + font-semibold to carry it:
// a same-colour chip lifted off the panel, which is what actually reads once
// the fill is a no-op.
function NavRow({ item, active, collapsed }) {
  return (
    <Link
      href={item.href}
      className={`group flex h-11 items-center gap-3 rounded-xl text-sm transition-colors ${
        collapsed ? "mx-2 justify-center px-0" : "mx-3 px-3"
      } ${
        active
          ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-card hover:bg-sidebar-accent"
          : "text-sidebar-foreground hover:bg-muted"
      }`}
    >
      <Icon paths={NAV_ICONS[item.key]} size={18} strokeWidth={1.6} className="shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

export default function Sidebar({ collapsed = false }) {
  const pathname = usePathname();

  // --sidebar now EQUALS --background, so this rail is the canvas, not a panel.
  // The old border-r + bg-sidebar would render as an unstyled column; the nav
  // has to float in a gcard instead. Outer <aside> owns the sticky/width/scroll,
  // the inner div is the card.
  return (
    <aside
      className={`sticky top-[68px] hidden h-[calc(100vh-84px)] flex-none overflow-y-auto transition-[width] duration-300 md:block ${
        collapsed ? "w-[88px]" : "w-[272px]"
      }`}
    >
      <div className="gcard ml-4 mt-4 flex min-h-[calc(100vh-108px)] flex-col py-4">
        <nav className="flex flex-col gap-1">
          {NAV_ORDER.map((item) => (
            <NavRow key={item.key} item={item} active={pathname === item.href} collapsed={collapsed} />
          ))}
        </nav>

        <div className={`my-4 border-t border-border/50 ${collapsed ? "mx-4" : "mx-5"}`} />

        <nav className="flex flex-col gap-1">
          {NAV_ORDER_2.map((item) => (
            <NavRow key={item.key} item={item} active={pathname === item.href} collapsed={collapsed} />
          ))}
        </nav>

        <div className="flex-1" />

        <div className={collapsed ? "px-3" : "px-5"}>
          <div className="flex items-center gap-2.5 border-t border-border/50 pt-3">
            <UserButton appearance={clerkFooterAppearance} afterSignOutUrl="/login" />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <OrganizationSwitcher
                  appearance={clerkFooterAppearance}
                  hidePersonal
                  afterSelectOrganizationUrl="/"
                  afterCreateOrganizationUrl="/onboarding"
                />
              </div>
            )}
          </div>
          {!collapsed && (
            <SignOutButton redirectUrl="/login">
              <button type="button" className="btn btn-ghost btn-block mt-2.5 text-xs">
                Sign out
              </button>
            </SignOutButton>
          )}
        </div>
      </div>
    </aside>
  );
}
