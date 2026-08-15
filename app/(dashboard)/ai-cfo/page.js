"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TopNav from "@/components/layout/TopNav";
import NoDataPanel from "@/components/ui/NoDataPanel";
import { AnswerTurn, MAX_QUESTION, ThinkingCard, useAskCfo } from "@/components/ai/askEngine";
import { Icon, PLUS_PATHS, SPARKLES_PATHS } from "@/components/icons";

// Local to this page rather than added to the shared icon set: these three are
// used nowhere else, and the shared set is navigation vocabulary.
const PANEL_PATHS = '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>';
const SEND_PATHS = '<path d="M4 12h13M12 5.5 18.5 12 12 18.5"/>';
const CLOSE_PATHS = '<path d="M6 6l12 12M18 6L6 18"/>';
const SEARCH_PATHS = '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>';

// P4.4. The AI CFO workspace, wired to POST /ai/ask/stream.
//
// What this page replaced is worth stating, because the rule it broke is the
// one this whole product rests on: it answered EVERY question with the same
// canned block — "Contribution margin fell 2.1pp to 33.8% in July, driven by a
// spike in RTO cost on Amazon" — with fabricated figures, fabricated drivers,
// and a fabricated "Answered in 2.1s · Sources: Shopify, Amazon, Razorpay".
// Typing a different question swapped the heading and kept the numbers.
//
// Three properties this version has instead:
//
//   Every figure names its tool. The backend validates the §19 contract before
//   storing, and each keyFigure carries the tool that produced it. Clicking one
//   opens the evidence for that metric.
//
//   Suggested questions are filtered by what is actually connected. Offering
//   "why did Google Ads spend rise" to an org with no Google Ads connection
//   teaches someone the product knows things it does not.
//
//   Unconfigured is stated, not simulated. With no ANTHROPIC_API_KEY the
//   server says so and this page says so — it does not fall back to a
//   template.
//
// THE STATE LIVES IN components/ai/askEngine.js, not here. It moved when the
// overview screen got the ask popup: two surfaces asking the same questions
// through two copies of the SSE reader is how they drift, and the copy that
// drifts is the one nobody is looking at. This file is now the workspace
// CHROME — conversations drawer, thread search, the wide answer column — over
// the same provider the popup uses. Both therefore share one conversation, so
// "Open full AI CFO" in the popup continues the thread rather than starting a
// new one.

function ThreadButton({ conversation, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full cursor-pointer rounded-xl px-3 py-2 text-left transition-colors ${
        active ? "bg-primary-soft" : "hover:bg-muted"
      }`}
    >
      <span className={`block truncate text-[13.5px] ${active ? "text-primary" : "text-foreground"}`}>
        {conversation.title || "Untitled"}
      </span>
      <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
        {conversation.messageCount} message{conversation.messageCount === 1 ? "" : "s"}
      </span>
    </button>
  );
}

// The tool trail moved INTO the answer card as the "How I got this" section,
// matching the reference — same real toolCalls, one card that travels whole
// in a screenshot.

export default function AICfoPage() {
  const {
    activate,
    status,
    statusFailed,
    configured,
    freshness,
    suggestions,
    conversations,
    activeId,
    openConversation,
    startNewConversation,
    turns,
    draft,
    setDraft,
    asking,
    pendingQuestion,
    askError,
    progress,
    threadLoading,
    ask,
    seriesBySource,
    openEvidence,
  } = useAskCfo();

  // The provider deliberately fetches nothing until asked, because it wraps
  // every dashboard page. This page IS the reason to fetch.
  useEffect(() => {
    activate();
  }, [activate]);

  // Presentation-only state for this shell. The conversations list moved from
  // an always-visible 240px rail into a slide-in drawer, which is what buys
  // the answer column its centred measure.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [threadQuery, setThreadQuery] = useState("");

  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, asking]);

  const activeTitle = conversations.find((c) => c.id === activeId)?.title ?? null;

  // Client-side filter over titles already loaded. Not a search endpoint —
  // it narrows what is on screen and never implies results that were not
  // fetched.
  const visibleConversations = useMemo(() => {
    const q = threadQuery.trim().toLowerCase();
    return q ? conversations.filter((c) => (c.title || "").toLowerCase().includes(q)) : conversations;
  }, [conversations, threadQuery]);

  const startNew = useCallback(() => {
    startNewConversation();
    setDrawerOpen(false);
  }, [startNewConversation]);

  return (
    <>
      <TopNav
        title="AI CFO"
        subtitle="Ask about your numbers — every figure names the tool that produced it"
      />

      {/* Toolbar. The conversations rail became a drawer, so its entry point
          lives here alongside the active thread's title. */}
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <Icon paths={PANEL_PATHS} size={15} />
          Conversations
          <span className="rounded-full bg-muted px-1.5 text-[11px]">{conversations.length}</span>
        </button>
        <button
          type="button"
          onClick={startNew}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-[13px] text-primary transition-colors hover:bg-primary-soft"
        >
          <Icon paths={PLUS_PATHS} size={15} />
          New
        </button>
        {activeTitle ? (
          <span className="truncate text-[13px] text-muted-foreground">{activeTitle}</span>
        ) : null}
      </div>

      <div className="mx-auto w-full ">
        <div className="flex min-w-0 flex-col gap-4">
          {statusFailed ? (
            <NoDataPanel
              tone="error"
              title="Could not reach the server"
              reason="The AI CFO status endpoint did not respond, so this page cannot tell you whether questions can be answered right now."
            />
          ) : status === null ? (
            <div className="gcard h-24 animate-pulse p-5" role="status" aria-busy="true">
              <span className="sr-only">Checking whether the AI CFO is configured</span>
            </div>
          ) : !configured ? (
            <NoDataPanel
              title="Not configured on this server"
              reason={
                status.note ??
                "The AI CFO needs an Anthropic API key on the backend. Until one is set, questions cannot be answered — and rather than return a plausible-looking answer about your business, it returns nothing."
              }
              action="Every figure it would quote is on the dashboard today"
              href="/"
            />
          ) : null}

          {threadLoading ? <ThinkingCard question={null} /> : null}

          {turns.map((t, i) => (
            <AnswerTurn
              key={i}
              turn={t}
              seriesBySource={seriesBySource}
              onFollowUp={ask}
              onEvidence={openEvidence}
            />
          ))}

          {asking ? <ThinkingCard question={pendingQuestion} progress={progress} /> : null}

          {askError ? (
            <div className="rounded-md bg-destructive-soft px-3 py-2.5 text-[13px] text-destructive">{askError}</div>
          ) : null}

          {configured && turns.length === 0 && !asking && !threadLoading && suggestions.length > 0 ? (
            /* The reference Welcome, with one honest difference: its starters
               are a fixed list, these are filtered by what is actually
               connected — a question about a source you have not connected is
               not offered, because being asked it implies the answer exists. */
            <div className="gcard rise px-6 py-10 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft">
                <Icon paths={SPARKLES_PATHS} size={20} className="text-primary" />
              </div>
              <h2 className="mt-4 text-[20px] font-medium tracking-[-0.01em] text-foreground">
                Ask your books anything
              </h2>
              <p className="mx-auto mt-2 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
                Every answer opens with one plain-English verdict, then the figures behind it, what moved it, and the
                caveats — so you never have to trust a number blindly. Only questions your connected sources can answer
                are offered.
              </p>
              <div className="mt-7 grid gap-4 text-left sm:grid-cols-3">
                {[...new Set(suggestions.map((s) => s.group))].map((group) => (
                  <div key={group}>
                    <div className="text-xs text-muted-foreground">{group}</div>
                    <div className="mt-2 space-y-2">
                      {suggestions
                        .filter((s) => s.group === group)
                        .map((s) => (
                          <button
                            key={s.q}
                            type="button"
                            onClick={() => ask(s.q)}
                            className="w-full cursor-pointer rounded-lg border border-border bg-transparent px-3 py-2 text-left text-sm text-foreground transition-colors hover:border-primary hover:text-primary"
                          >
                            {s.q}
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {configured && suggestions.length === 0 && freshness !== null && turns.length === 0 ? (
            <NoDataPanel
              title="No sources connected"
              reason="With nothing connected there is no data to ask about, so no suggested questions are offered. Connect a store, gateway or bank first."
              action="Connect a source"
              href="/connections"
            />
          ) : null}

          <div ref={bottomRef} />

          {/* The composer is its own raised card floating over the column,
              rather than a bar welded to the viewport edge. */}
          <div className="sticky bottom-4 z-10">
            <form
              className="gcard askglow p-2 shadow-raised"
              onSubmit={(e) => {
                e.preventDefault();
                ask(draft);
              }}
            >
              <div className="flex items-center gap-2">
                <input
                  className="h-11 min-w-0 flex-1 bg-transparent px-3 text-[15px] text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
                  placeholder={
                    configured ? "Ask about revenue, margin, cash, COD, refunds…" : "Unavailable until the server is configured"
                  }
                  value={draft}
                  maxLength={MAX_QUESTION}
                  disabled={!configured || asking}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button
                  type="submit"
                  aria-label="Ask"
                  className="inline-flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!configured || asking || draft.trim().length < 3}
                >
                  <Icon paths={SEND_PATHS} size={16} />
                </button>
              </div>
              {/* No suggestion chips under the composer. They repeated the
                  welcome card's list verbatim while it was on screen, and
                  once a thread is running the model's own "Ask next" chips —
                  which follow from the answer just given — are the better
                  prompt. */}
            </form>
          </div>
        </div>
      </div>

      {/* Conversations drawer.
          Radix Dialog, not a bare `fixed` aside — and the reason is specific.
          DashboardChrome wraps every page in `div.rise`, whose animation ends
          at `transform: translateY(0)` under `animation-fill-mode: both`. A
          transform other than `none` makes that element the containing block
          for `position: fixed` descendants, so a plain fixed drawer resolved
          against the content column (which starts after the 264px sidebar and
          inside its padding) instead of the viewport — it rendered clipped and
          on top of the app's own nav. Dialog.Portal renders into document.body,
          outside that wrapper, which is also why EvidenceDrawer never had the
          problem. The focus trap, Escape-to-close and scroll lock come free. */}
      <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-scrim" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed left-0 top-0 z-50 flex h-full w-[300px] max-w-[85vw] flex-col overflow-y-auto border-r border-border bg-card p-4 shadow-raised outline-none"
          >
            <div className="mb-3 flex items-center justify-between">
              <Dialog.Title className="text-[13.5px] font-medium text-foreground">Conversations</Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close conversations"
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted"
                >
                  <Icon paths={CLOSE_PATHS} size={15} />
                </button>
              </Dialog.Close>
            </div>

            <button
              type="button"
              onClick={startNew}
              className="mb-3 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-[13px] text-primary transition-colors hover:bg-primary-soft"
            >
              <Icon paths={PLUS_PATHS} size={15} />
              New conversation
            </button>

            {conversations.length > 0 ? (
              <div className="relative mb-3">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Icon paths={SEARCH_PATHS} size={14} />
                </span>
                <input
                  value={threadQuery}
                  onChange={(e) => setThreadQuery(e.target.value)}
                  placeholder="Search conversations"
                  className="h-9 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                />
              </div>
            ) : null}

            <div className="flex flex-col gap-1">
              {conversations.length === 0 ? (
                <p className="px-1 text-[12.5px] text-muted-foreground">Nothing asked yet.</p>
              ) : visibleConversations.length === 0 ? (
                <p className="px-1 text-[12.5px] text-muted-foreground">
                  No conversation matches “{threadQuery}”.
                </p>
              ) : (
                visibleConversations.map((c) => (
                  <ThreadButton
                    key={c.id}
                    conversation={c}
                    active={c.id === activeId}
                    onClick={() => {
                      openConversation(c.id);
                      setDrawerOpen(false);
                    }}
                  />
                ))
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* The evidence drawer is rendered once by AskCfoProvider, so a figure
          clicked here and the same figure clicked in the popup open the same
          panel. It used to be mounted here. */}
    </>
  );
}
