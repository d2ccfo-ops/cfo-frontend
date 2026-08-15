"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import NoDataPanel from "@/components/ui/NoDataPanel";
import { AnswerTurn, MAX_QUESTION, ThinkingCard, useAskCfo } from "@/components/ai/askEngine";
import { Icon, SPARKLES_PATHS, SEND_HORIZONTAL_PATHS, X_PATHS } from "@/components/icons";

// Ask the AI CFO without leaving the page you are on — the overlay from
// ai-cfo-design/src/components/AskCfoOverlay.tsx, wired to the real
// orchestrator instead of that file's canned answer library.
//
// Local rather than added to the shared icon set, which is navigation
// vocabulary: this arrow is used here and nowhere else.
const EXPAND_PATHS = '<path d="M14 4h6v6"/><path d="M10 20H4v-6"/><path d="M20 4l-7.5 7.5"/><path d="M4 20l7.5-7.5"/>';

// How many starters the popup offers. The full page groups all thirteen under
// Revenue / Margin / Cash / Data health because it has a screen to do it in; a
// sheet that opens over your dashboard does not, and thirteen questions in a
// 92vh box is a menu, not a prompt. Four is enough to show the SHAPE of what
// can be asked, which is all a starter has to do — the composer takes anything.
const POPUP_STARTERS = 4;

/**
 * The trigger. Renders nothing at all until the popup is available, so a page
 * can drop it in unconditionally.
 */
export function AskCfoButton({ className = "btn btn-primary", children = "Ask AI CFO", question = null }) {
  const { open } = useAskCfo();
  return (
    <button type="button" className={className} onClick={() => open(question ?? undefined)}>
      {children}
    </button>
  );
}

export default function AskCfoOverlay() {
  const pathname = usePathname();
  const {
    isOpen,
    close,
    configured,
    status,
    statusFailed,
    suggestions,
    turns,
    draft,
    setDraft,
    asking,
    pendingQuestion,
    askError,
    progress,
    threadLoading,
    freshness,
    ask,
    seriesBySource,
    openEvidence,
  } = useAskCfo();

  const inputRef = useRef(null);
  const endRef = useRef(null);

  // Focus lands on the input, not on the first focusable element — which is
  // Radix's default and would be the "Open full AI CFO" link. Someone who hits
  // the button wants to type.
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, asking, isOpen]);

  // The popup and /ai-cfo share one conversation, so on /ai-cfo it would be the
  // same thread rendered twice — the second copy covering the first.
  if (pathname === "/ai-cfo") return null;

  const canAsk = configured && !asking && draft.trim().length >= 3;
  const starters = suggestions.slice(0, POPUP_STARTERS);
  const empty = turns.length === 0 && !asking && !threadLoading;

  return (
    <Dialog.Root open={isOpen} onOpenChange={(o) => (o ? null : close())}>
      <Dialog.Portal>
        {/* A veil, not a blackout: the design keeps the page readable behind
            the sheet so the answer sits in the context of the figures that
            prompted it. Radix still traps focus and locks scroll behind it. */}
        <Dialog.Overlay className="fixed inset-0 z-40 bg-background/55 backdrop-blur-[3px]" />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="sheet-in fixed inset-x-0 bottom-0 z-40 mx-auto flex max-h-[92vh] w-full max-w-3xl flex-col px-4 pb-5 outline-none"
        >
          <Dialog.Title className="sr-only">Ask the AI CFO</Dialog.Title>

          {/* Header strip */}
          <div className="mb-3 flex items-center gap-2 self-end">
            <Link
              href="/ai-cfo"
              onClick={close}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-card transition-colors hover:text-foreground"
            >
              <Icon paths={EXPAND_PATHS} size={14} />
              {/* Not a fresh page: the thread carries over, because both
                  surfaces read the same provider. */}
              Open full AI CFO
            </Link>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close AI CFO"
                className="grid h-8 w-8 cursor-pointer place-items-center rounded-full border border-border/60 bg-card text-muted-foreground shadow-card transition-colors hover:text-foreground"
              >
                <Icon paths={X_PATHS} size={15} />
              </button>
            </Dialog.Close>
          </div>

          {/* Answers */}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-4">
            {statusFailed ? (
              <NoDataPanel
                tone="error"
                title="Could not reach the server"
                reason="The AI CFO status endpoint did not respond, so there is no way to tell you whether questions can be answered right now."
              />
            ) : status === null ? (
              <div className="gcard h-24 animate-pulse" role="status" aria-busy="true">
                <span className="sr-only">Checking whether the AI CFO is configured</span>
              </div>
            ) : !configured ? (
              <NoDataPanel
                title="Not configured on this server"
                reason={
                  status.note ??
                  "The AI CFO needs an Anthropic API key on the backend. Until one is set, questions cannot be answered — and rather than return a plausible-looking answer about your business, it returns nothing."
                }
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

            {configured && empty ? (
              <div className="gcard rise px-6 py-7 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft">
                  <Icon paths={SPARKLES_PATHS} size={20} className="text-primary" />
                </div>
                <h3 className="mt-3 text-[17px] font-medium tracking-[-0.01em] text-foreground">
                  Ask your books, without leaving this page
                </h3>
                <p className="mx-auto mt-1.5 max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
                  One plain-English verdict, the figures behind it, and every caveat named.
                </p>

                {/* The design puts its starters in a chip row under the
                    composer. These are whole questions rather than two-word
                    labels, so they go here as full-width rows — a chip row of
                    thirteen-word questions wraps into an unreadable block, and
                    shortening them would mean the chip no longer says what it
                    asks. Filtered by what is actually connected, so the popup
                    never offers a question about a source you do not have. */}
                {starters.length > 0 ? (
                  <div className="mt-5 space-y-2 text-left">
                    {starters.map((s) => (
                      <button
                        key={s.q}
                        type="button"
                        onClick={() => ask(s.q)}
                        className="w-full cursor-pointer rounded-lg border border-border bg-transparent px-3 py-2 text-left text-[13.5px] text-foreground transition-colors hover:border-primary hover:text-primary"
                      >
                        {s.q}
                      </button>
                    ))}
                  </div>
                ) : freshness !== null ? (
                  <p className="mt-4 text-[13px] text-muted-foreground">
                    Nothing is connected yet, so there is no data to ask about.{" "}
                    <Link href="/connections" onClick={close} className="text-primary hover:underline">
                      Connect a source
                    </Link>
                    .
                  </p>
                ) : null}
              </div>
            ) : null}

            <div ref={endRef} />
          </div>

          {/* Composer */}
          <form
            className="gcard shrink-0 p-2 shadow-raised"
            onSubmit={(e) => {
              e.preventDefault();
              ask(draft);
            }}
          >
            <div className="flex items-center gap-2">
              <Icon paths={SPARKLES_PATHS} size={16} className="ml-2 flex-none text-primary" />
              <input
                ref={inputRef}
                value={draft}
                maxLength={MAX_QUESTION}
                disabled={!configured || asking}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={
                  configured ? "Ask about revenue, margin, cash, COD or refunds…" : "Unavailable until the server is configured"
                }
                className="h-11 min-w-0 flex-1 bg-transparent px-1 text-[15px] text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
              />
              <button
                type="submit"
                aria-label="Ask"
                disabled={!canAsk}
                className="inline-flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon paths={SEND_HORIZONTAL_PATHS} size={16} />
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
