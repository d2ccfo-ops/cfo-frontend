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
function NavRow({ item, active, collapsed, onNavigate }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
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

// TWO LAYOUTS, ONE COMPONENT, AND THE REASON THEY CANNOT BE ONE.
//
// This used to be `hidden md:block`, which meant the rail simply did not exist
// below 768px — and the header's menu button toggled `collapsed`, a width, on
// an element that was not rendered. Tapping it did nothing at all, and there
// was no other way to reach any page on a phone.
//
// At md and up the rail is in flow and `collapsed` changes its width between
// 88px and 272px, as before. Below md it leaves the flow entirely and becomes a
// drawer over the content, driven by `mobileOpen` — a different question from
// `collapsed`, which is why they are separate props rather than one boolean:
// the desktop default is OPEN (expanded) and the mobile default is CLOSED, so a
// single flag would have to mean opposite things at different widths.
//
// It translates rather than mounting on open so the transition has something to
// animate from, and so the nav is present in the DOM for assistive tech at all
// widths. `md:translate-x-0` unsets the off-screen transform unconditionally at
// desktop — without it, a drawer closed on a phone would stay shifted off-screen
// after a rotate to landscape.
export default function Sidebar({ collapsed = false, mobileOpen = false, onNavigate }) {
  const pathname = usePathname();

  return (
    <aside
      // aria-hidden only below md, and only when closed: at desktop widths the
      // same element is the permanent rail and must never be hidden from a
      // screen reader.
      aria-hidden={mobileOpen ? undefined : "true"}
      className={`fixed inset-y-0 left-0 z-50 w-[272px] flex-none overflow-y-auto bg-background transition-transform duration-300 md:sticky md:top-[68px] md:z-auto md:h-[calc(100vh-84px)] md:translate-x-0 md:bg-transparent md:transition-[width] ${
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      } ${collapsed ? "md:w-[88px]" : "md:w-[272px]"}`}
    >
      {/* --sidebar now EQUALS --background, so this rail is the canvas, not a
          panel. The old border-r + bg-sidebar would render as an unstyled
          column; the nav has to float in a gcard instead. */}
      <div className="gcard m-3 flex min-h-[calc(100vh-24px)] flex-col py-4 md:ml-4 md:mr-0 md:mt-4 md:min-h-[calc(100vh-108px)]">
        <nav className="flex flex-col gap-1">
          {NAV_ORDER.map((item) => (
            <NavRow
              key={item.key}
              item={item}
              active={pathname === item.href}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </nav>

        <div className={`my-4 border-t border-border/50 ${collapsed ? "mx-4" : "mx-5"}`} />

        <nav className="flex flex-col gap-1">
          {NAV_ORDER_2.map((item) => (
            <NavRow
              key={item.key}
              item={item}
              active={pathname === item.href}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
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
