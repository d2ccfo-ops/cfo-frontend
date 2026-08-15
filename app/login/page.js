"use client";

import { SignIn, SignUp } from "@clerk/nextjs";
import { useState } from "react";
import { Logo } from "@/components/ui/Logo";

// Maps Clerk's appearance API onto the same design tokens the rest of the
// app uses (app/globals.css) so the prebuilt auth UI doesn't look bolted on.
//
// Two radii, not one, because the design uses two: its input is `rounded-md`
// (--radius-md, 14px at --radius 1rem) and its Button is an unambiguous
// h-10 rounded-full pill — the same split .btn hard-codes in globals.css.
// Clerk's `borderRadius` variable is a single knob for the whole widget, so it
// carries the input value and the two button elements override to the pill
// below. Leaving borderRadius at --radius-sm would have shrunk Clerk's fields
// 2px below every .input on the onboarding page they hand off to.
const clerkAppearance = {
  variables: {
    colorPrimary: "var(--color-primary)",
    colorBackground: "var(--color-background)",
    colorText: "var(--color-foreground)",
    colorTextSecondary: "var(--color-muted-foreground)",
    // The design's input sits on `bg-card`, a shade above the canvas, which is
    // what separates the field from the page now that the card carries no border.
    colorInputBackground: "var(--color-card)",
    colorInputText: "var(--color-foreground)",
    borderRadius: "var(--radius-md)",
    fontFamily: "var(--font-sans)",
  },
  elements: {
    // cardBox is the OUTER wrapper Clerk introduced around `card`, and styling
    // only `card` is why this looked like a box inside a box: the inner card
    // was correctly flattened (boxShadow none, padding 0) while cardBox kept
    // its own 28px radius and 0 5px 15px drop shadow, so the form sat in a
    // floating grey panel that belonged to no part of this design. Measured on
    // the rendered DOM — .cl-cardBox had radius 28px and a shadow while
    // .cl-card had none. Both have to be flattened for the form to sit
    // directly on the page the way the design draws it.
    cardBox: { boxShadow: "none", border: "none", borderRadius: 0, background: "transparent" },
    // Transparent, not --color-card: the card was painting a near-white panel
    // a shade off the page behind it, which read as a rectangle nobody drew on
    // purpose. The fields carry their own surface; the container should not.
    card: { boxShadow: "none", padding: 0, background: "transparent", border: "none" },
    header: { display: "none" },
    footer: { background: "none", borderTop: "none" },
    formFieldLabel: { fontSize: "12px", fontWeight: 500, color: "var(--color-muted-foreground)" },
    formFieldInput: { height: "40px", borderColor: "var(--color-border)" },
    formButtonPrimary: {
      height: "40px",
      borderRadius: "9999px",
      fontSize: "14px",
      textTransform: "none",
      boxShadow: "var(--shadow-card)",
    },
    socialButtonsBlockButton: {
      height: "40px",
      borderRadius: "9999px",
      borderColor: "var(--color-border)",
      background: "var(--color-card)",
    },
    dividerLine: { background: "var(--color-border)" },
    dividerText: { fontSize: "12px", color: "var(--color-muted-foreground)" },
    footerActionLink: { color: "var(--color-primary)" },
  },
};

// One-click entry to the showcase account.
//
// Not a filled-in email and password, which is what a demo button usually is:
// Clerk's Device Trust challenges every password sign-in from a device it has
// not seen and emails a code to an inbox nobody at the demo can open, so a
// prefilled form would look like it worked and then stop. This asks the server
// for a Clerk sign-in ticket instead, which skips first-factor verification —
// the same mechanism Clerk documents for invitations.
//
// It renders only when the server actually has a demo account: the endpoint
// 404s when DEMO_LOGIN_EMAIL is unset, and this hides itself on that answer
// rather than offering a button that cannot work.
function DemoLoginButton() {
  const [state, setState] = useState("idle"); // idle | loading | hidden | error
  const [message, setMessage] = useState(null);

  if (state === "hidden") return null;

  const start = async () => {
    setState("loading");
    setMessage(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/demo-login`, { method: "POST" });
      if (res.status === 404) {
        // No demo account on this deployment — take the button away rather
        // than explaining a feature the operator chose not to enable.
        setState("hidden");
        return;
      }
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ticket) {
        setState("error");
        setMessage(body?.message ?? `Could not start a demo session (HTTP ${res.status}).`);
        return;
      }
      // A full navigation, not router.push: the ticket has to be on the URL
      // when Clerk's SignIn mounts and reads it, and it is single-use, so
      // landing here again with a spent ticket must not be a back-button away.
      window.location.replace(`/login?__clerk_ticket=${encodeURIComponent(body.ticket)}`);
    } catch {
      setState("error");
      setMessage("Could not reach the server.");
    }
  };

  return (
    <div className="mt-6">
      {/* "Just looking?", not "or" — Clerk draws its own "or" between the
          Google button and the email field, and a second one directly below it
          reads as a rendering bug rather than a third choice. This label also
          says who the button is for, which "or" does not. */}
      <div className="mb-4 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">Just looking?</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <button
        type="button"
        onClick={start}
        disabled={state === "loading"}
        className="h-10 w-full cursor-pointer rounded-full border border-border bg-card text-sm font-medium text-foreground shadow-card transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === "loading" ? "Starting demo…" : "Explore the demo — no signup"}
      </button>
      {/* Says what the account can do, and it has to stay true: this used to
          read "Read-only … nothing can be changed", which stopped being
          accurate the moment the demo was raised to FINANCE_MANAGER. Editing
          costs and writing off exceptions both work now; only the connected
          sources' credentials are out of reach. */}
      <p className="mt-2 text-center text-xs text-muted-foreground">
        A sample company with real numbers. Ask the AI CFO, edit costs, run scenarios — connected sources stay locked.
      </p>
      {message ? <p className="mt-2 text-center text-xs text-destructive">{message}</p> : null}
    </div>
  );
}

export default function LoginPage() {
  const [tab, setTab] = useState("login");

  // Was an inline style object; the design expresses the same two states as a
  // pill inside a pill, so it is a class helper now — same `tab === t` test.
  const tabClass = (t) =>
    `cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
      tab === t ? "bg-card text-foreground shadow-card" : "text-muted-foreground"
    }`;

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      <div className="mx-auto flex w-full max-w-[440px] flex-col justify-center px-6 py-16">
        <div className="mb-10 flex items-center text-foreground">
          <Logo height={26} />
        </div>

        <div className="mb-7 flex w-fit gap-1 rounded-full bg-muted p-1">
          <button className={tabClass("login")} onClick={() => setTab("login")} type="button">Log in</button>
          <button className={tabClass("signup")} onClick={() => setTab("signup")} type="button">Sign up</button>
        </div>

        <div className="mb-7">
          <h2 className="text-2xl font-normal text-foreground">{tab === "login" ? "Welcome back" : "Create your workspace"}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {tab === "login" ? "Log in to your CFO workspace." : "Set up CFOOS for your brand in minutes."}
          </p>
        </div>

        {tab === "login" ? (
          <SignIn routing="virtual" appearance={clerkAppearance} signUpUrl="/login" forceRedirectUrl="/" />
        ) : (
          <SignUp routing="virtual" appearance={clerkAppearance} signInUrl="/login" forceRedirectUrl="/onboarding" />
        )}

        {/* Only under Log in. Offering a read-only demo account to someone
            halfway through creating their own workspace is an invitation to
            abandon it. */}
        {tab === "login" ? <DemoLoginButton /> : null}

        <p className="mt-7 text-xs text-muted-foreground">By continuing you agree to our Terms of Service and Privacy Policy.</p>
      </div>

      {/* Flat primary-soft, not the old radial gradient: with --primary now
          near-black, --primary-soft is a neutral wash and the three-stop
          gradient into --muted/--background became a smear of three greys that
          differ by 0.01 lightness. The design panel is one flat fill, and it
          hides below lg rather than stacking under the form on a phone. */}
      <div className="hidden items-center justify-center bg-primary-soft p-12 lg:flex">
        {/* This panel held a testimonial — a ₹4.8L settlement shortfall
            "caught" for an unnamed Bengaluru skincare founder. No such customer
            or result exists. A fabricated endorsement is a claim about the
            product's track record made to someone deciding whether to trust it
            with their books, which makes it worse than any invented card. */}
        <div className="max-w-[420px] text-foreground">
          <p className="text-2xl leading-relaxed">
            Every number traced back to the record it came from.
          </p>
          <div className="mt-5 text-sm leading-relaxed text-muted-foreground">
            Orders, payments, shipments and bank credits reconciled against each other — so &ldquo;revenue&rdquo;,
            &ldquo;collected&rdquo; and &ldquo;in the bank&rdquo; stop being the same number. Where a figure can&apos;t be
            measured, CFOOS says so instead of estimating.
          </div>
        </div>
      </div>
    </div>
  );
}
