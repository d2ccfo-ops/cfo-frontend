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

function NavRow({ item, active, collapsed }) {
  return (
    <Link
      href={item.href}
      className={`group flex h-10 items-center gap-3 rounded-r-full text-sm transition-colors ${
        collapsed ? "pl-4 pr-2" : "pl-6 pr-4"
      } ${
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground hover:bg-sidebar-accent"
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

  return (
    <nav
      className={`sticky top-16 hidden h-[calc(100vh-4rem)] flex-none flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar py-3 transition-[width] md:flex ${
        collapsed ? "w-[72px]" : "w-[264px]"
      }`}
    >
      <div className="flex flex-col gap-0.5 pr-3">
        {NAV_ORDER.map((item) => (
          <NavRow key={item.key} item={item} active={pathname === item.href} collapsed={collapsed} />
        ))}
      </div>

      <div className="my-3 border-t border-sidebar-border" />

      <div className="flex flex-col gap-0.5 pr-3">
        {NAV_ORDER_2.map((item) => (
          <NavRow key={item.key} item={item} active={pathname === item.href} collapsed={collapsed} />
        ))}
      </div>

      {!collapsed && (
        <div className="mx-4 mt-6 rounded-lg bg-accent-soft p-3">
          <div className="text-sm font-medium text-foreground">Spark plan</div>
          <p className="mt-1 text-xs text-muted-foreground">
            3 of 6 sources connected. Connect banking for full reconciliation.
          </p>
        </div>
      )}

      <div className="flex-1" />

      <div className={collapsed ? "px-2" : "px-4"}>
        <div className="flex items-center gap-2.5 border-t border-sidebar-border pt-3">
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
    </nav>
  );
}
