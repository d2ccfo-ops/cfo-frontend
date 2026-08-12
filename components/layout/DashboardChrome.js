"use client";

import { UserButton } from "@clerk/nextjs";
import { useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/layout/Sidebar";
import EntitySelector from "@/components/controls/EntitySelector";
import DateRangePicker from "@/components/controls/DateRangePicker";
import DataFreshnessBadge from "@/components/ui/DataFreshnessBadge";
import { DateRangeProvider } from "@/components/controls/DateRangeContext";
import { Icon, MENU_PATHS, SEARCH_PATHS, HELP_CIRCLE_PATHS, BELL_PATHS } from "@/components/icons";
import ExplainModeProvider, { useExplainMode } from "@/components/ui/ExplainMode";
import DemoDataBanner from "@/components/layout/DemoDataBanner";

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
      className={`grid h-10 w-10 place-items-center rounded-full transition-colors ${
        active ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted"
      }`}
    >
      <Icon paths={HELP_CIRCLE_PATHS} size={19} strokeWidth={1.6} />
    </button>
  );
}

export default function DashboardChrome({ children }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <ExplainModeProvider>
    <DateRangeProvider>
    <div className="min-h-screen bg-background">
      {/* Above the header, not inside it: if the numbers on this screen are
          generated, that is the first thing on the page, not a chip in a
          toolbar someone learns to stop seeing. */}
      <DemoDataBanner />
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card px-4">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label="Toggle navigation"
          className="grid h-10 w-10 flex-none place-items-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <Icon paths={MENU_PATHS} size={20} strokeWidth={1.8} />
        </button>
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary-soft text-sm font-semibold text-primary">
            C
          </span>
          <span className="text-[19px] font-normal tracking-tight text-foreground">
            CFOOS <span className="text-muted-foreground">console</span>
          </span>
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
          <div className="hidden items-center gap-2 rounded-full bg-muted px-3 py-2 text-sm text-muted-foreground lg:flex">
            <Icon paths={SEARCH_PATHS} size={16} strokeWidth={1.8} />
            <input
              placeholder="Search resources, docs, metrics"
              className="w-56 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ExplainModeButton />
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <Icon paths={BELL_PATHS} size={19} strokeWidth={1.6} />
          </button>
          {/* Clerk's own control rather than the hardcoded "AK" initials this
              used to render — those belonged to nobody, and the one element in
              a header that should identify WHO you are signed in as must not
              be decorative. */}
          <div className="ml-1 grid h-8 w-8 flex-none place-items-center">
            <UserButton appearance={{ elements: { avatarBox: { width: 32, height: 32 } } }} afterSignOutUrl="/login" />
          </div>
        </div>
      </header>

      <div className="flex">
        <Sidebar collapsed={collapsed} />
        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-[1280px] px-6 py-6">{children}</div>
        </main>
      </div>
    </div>
    </DateRangeProvider>
    </ExplainModeProvider>
  );
}
