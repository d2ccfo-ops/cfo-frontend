"use client";

import { UserButton } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import EntitySelector from "@/components/controls/EntitySelector";
import DateRangePicker from "@/components/controls/DateRangePicker";
import DataFreshnessBadge from "@/components/ui/DataFreshnessBadge";
import { DateRangeProvider } from "@/components/controls/DateRangeContext";
import { Icon, MENU_PATHS, SEARCH_PATHS, HELP_CIRCLE_PATHS } from "@/components/icons";
import ExplainModeProvider, { useExplainMode } from "@/components/ui/ExplainMode";
import { Logo } from "@/components/ui/Logo";
import DemoDataBanner from "@/components/layout/DemoDataBanner";
import NotificationBell from "@/components/layout/NotificationBell";
import { AskCfoProvider } from "@/components/ai/askEngine";
import AskCfoOverlay from "@/components/ai/AskCfoOverlay";

// The date-range provider wraps the whole shell because the picker that sets
// it lives in this header while everything that reads it lives in {children}.
// The ? in the header. It used to be decorative; it now toggles "what's this?"
// mode, which outlines every explainable thing on the page and turns the next
// click into a question rather than an action.
function ExplainModeButton() {
  const { active, toggle } = useExplainMode();
  return (
    <button
      type="button"
      data-explain-ignore
      onClick={toggle}
      aria-pressed={active}
      aria-label={active ? "Exit what's-this mode" : "What's this? Explain anything on this page"}
      title={active ? "Exit — or press Esc" : "What's this? Click, then click anything on the page"}
      className={`grid h-10 w-10 place-items-center rounded-xl transition-colors ${
        active ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted"
      }`}
    >
      <Icon paths={HELP_CIRCLE_PATHS} size={19} strokeWidth={1.6} />
    </button>
  );
}

export default function DashboardChrome({ children }) {
  // Two states, because the menu button means different things at different
  // widths: at md+ it narrows the permanent rail, below md it opens a drawer
  // that is closed by default. One boolean would have to be true and false at
  // the same time to express "expanded on desktop, shut on mobile".
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Only feeds the `key` on the content wrapper so the `rise` entry animation
  // replays per route. The design uses TanStack's useRouterState; the App
  // Router equivalent is usePathname.
  const pathname = usePathname();

  // matchMedia rather than a resize listener: this only has to be right at the
  // moment of the click, and reading it there costs nothing and cannot go stale.
  // 768px is Tailwind's `md`, which is the breakpoint Sidebar switches on — the
  // two must agree or the button toggles the state the layout is not using.
  const toggleNav = useCallback(() => {
    if (window.matchMedia("(min-width: 768px)").matches) setCollapsed((c) => !c);
    else setMobileOpen((o) => !o);
  }, []);

  // A drawer left open across a navigation covers the page you just asked for.
  // Adjusted during render rather than in an effect — React's documented way to
  // reset state when a value changes, and the only one that closes the drawer in
  // the SAME pass as the new route paints. An effect would render the new page
  // once with the drawer still over it, then close it, which is a visible flash.
  //
  // Clicking a nav row also closes it directly (onNavigate). This exists for the
  // navigations that do not go through one: the back button, and links inside
  // page content.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMobileOpen(false);
  }

  // Escape closes it, and the body cannot scroll behind it — without the second
  // part, dragging on the backdrop scrolls the page underneath, which reads as
  // the drawer being broken.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  return (
    <ExplainModeProvider>
    <DateRangeProvider>
    {/* Wraps the whole shell so the popup can be opened from any page, and so
        the conversation survives navigating between them. It loads nothing
        until something calls open() or activate() — see the note on
        `activated` in askEngine.js. */}
    <AskCfoProvider>
    <div className="min-h-screen bg-background">
      {/* Above the header, not inside it: if the numbers on this screen are
          generated, that is the first thing on the page, not a chip in a
          toolbar someone learns to stop seeing. */}
      {/* <DemoDataBanner /> */}
      <header className="sticky top-0 z-30 flex h-[68px] items-center gap-3 border-b border-border/50 bg-background/85 px-4 backdrop-blur">
        <button
          type="button"
          onClick={toggleNav}
          aria-label="Toggle navigation"
          aria-expanded={mobileOpen}
          className="grid h-10 w-10 flex-none place-items-center rounded-xl text-muted-foreground hover:bg-muted"
        >
          <Icon paths={MENU_PATHS} size={20} strokeWidth={1.8} />
        </button>
        {/* The real mark replaces the "C"-in-a-box placeholder and the CFOOS
            wordmark that was set in the UI font. text-foreground is what the
            mask paints with, so it inverts with the theme by itself. */}
        <Link href="/" className="flex items-center text-foreground">
          <Logo height={21} />
        </Link>
        <div className="ml-4 hidden items-center gap-2 md:flex">
          <EntitySelector />
          <DateRangePicker />
          {/* No props: the badge reads real sync ages from
              GET /metrics/freshness. It used to be passed a hardcoded
              "Synced 12 min ago". */}
          <DataFreshnessBadge />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <div className="hidden items-center gap-2 rounded-full border border-border/60 bg-card px-3.5 py-2 text-sm text-muted-foreground shadow-card lg:flex">
            <Icon paths={SEARCH_PATHS} size={16} strokeWidth={1.8} />
            <input
              placeholder="Search resources, docs, metrics"
              className="w-56 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ExplainModeButton />
          {/* Was a decorative bell that rendered and did nothing. It now reads
              GET /notifications, badges the server's unread count, and marks
              rows read. */}
          <NotificationBell />
          {/* Clerk's own control rather than the hardcoded "AK" initials this
              used to render — those belonged to nobody, and the one element in
              a header that should identify WHO you are signed in as must not
              be decorative. */}
          <div className="ml-1 grid h-8 w-8 flex-none place-items-center">
            <UserButton appearance={{ elements: { avatarBox: { width: 32, height: 32 } } }} afterSignOutUrl="/login" />
          </div>
        </div>
      </header>

      {/* Below md only. A plain div would leave the drawer dismissable by
          nothing but the menu button; making it a button gives it a click
          target, a keyboard focus stop and a name, which is what a screen
          reader needs to say "close navigation" rather than describing a
          rectangle. Sits under the drawer's z-50 and above the header's z-30. */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-foreground/25 md:hidden"
        />
      )}

      <div className="flex">
        <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onNavigate={() => setMobileOpen(false)} />
        <main className="min-w-0 flex-1">
          <div key={pathname} className="rise mx-auto max-w-[1320px] px-6 py-8 md:pr-8">
            {children}
          </div>
        </main>
      </div>

      {/* Outside the `rise` content wrapper on purpose. Radix portals it to
          document.body anyway, but keeping it out of that subtree means it is
          not remounted by the `key={pathname}` above on every navigation —
          which would close the popup mid-answer whenever a link was followed
          behind it. */}
      <AskCfoOverlay />
    </div>
    </AskCfoProvider>
    </DateRangeProvider>
    </ExplainModeProvider>
  );
}
