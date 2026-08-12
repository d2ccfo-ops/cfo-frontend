"use client";

import { SignIn, SignUp } from "@clerk/nextjs";
import { useState } from "react";

// Maps Clerk's appearance API onto the same design tokens the rest of the
// app uses (app/globals.css) so the prebuilt auth UI doesn't look bolted on.
const clerkAppearance = {
  variables: {
    colorPrimary: "var(--color-primary)",
    colorBackground: "var(--color-background)",
    colorText: "var(--color-foreground)",
    colorTextSecondary: "var(--color-muted-foreground)",
    colorInputBackground: "var(--color-background)",
    colorInputText: "var(--color-foreground)",
    borderRadius: "var(--radius-sm)",
    fontFamily: "var(--font-sans)",
  },
  elements: {
    card: { boxShadow: "none", padding: 0 },
    header: { display: "none" },
    footer: { background: "none" },
    formButtonPrimary: { fontSize: "13.5px", textTransform: "none" },
    socialButtonsBlockButton: { borderColor: "var(--color-border)" },
  },
};

export default function LoginPage() {
  const [tab, setTab] = useState("login");

  const tabStyle = (t) => ({
    padding: "7px 18px",
    borderRadius: "var(--radius-sm)",
    border: "none",
    cursor: "pointer",
    fontSize: "13.5px",
    fontFamily: "var(--font-sans)",
    fontWeight: 500,
    background: tab === t ? "var(--color-card)" : "transparent",
    color: tab === t ? "var(--color-foreground)" : "var(--color-muted-foreground)",
    boxShadow: tab === t ? "var(--shadow-card)" : "none",
  });

  return (
    <div className="grid bg-background lg:grid-cols-2" style={{ minHeight: "100vh" }}>
      <div className="mx-auto flex w-full flex-col justify-center" style={{ padding: 64, maxWidth: 440 }}>
        <div className="mb-10 flex items-center gap-2.5">
          <div className="flex h-[30px] w-[30px] items-center justify-center rounded-md bg-foreground text-base font-semibold text-background">C</div>
          <span className="text-xl font-medium text-foreground">CFOOS</span>
        </div>

        <div className="mb-7 flex w-fit gap-1 rounded-md bg-muted p-1">
          <button style={tabStyle("login")} onClick={() => setTab("login")} type="button">Log in</button>
          <button style={tabStyle("signup")} onClick={() => setTab("signup")} type="button">Sign up</button>
        </div>

        <div className="mb-1.5">
          <h2 className="mb-1.5 text-xl font-normal text-foreground">{tab === "login" ? "Welcome back" : "Create your workspace"}</h2>
          <p className="mb-5 text-[13.5px] text-muted-foreground">
            {tab === "login" ? "Log in to your CFO workspace." : "Set up CFOOS for your brand in minutes."}
          </p>
        </div>

        {tab === "login" ? (
          <SignIn routing="virtual" appearance={clerkAppearance} signUpUrl="/login" forceRedirectUrl="/" />
        ) : (
          <SignUp routing="virtual" appearance={clerkAppearance} signInUrl="/login" forceRedirectUrl="/onboarding" />
        )}

        <p className="mt-7 text-xs text-muted-foreground">By continuing you agree to our Terms of Service and Privacy Policy.</p>
      </div>

      <div
        className="relative flex items-center justify-center overflow-hidden"
        style={{ background: "radial-gradient(120% 100% at 100% 0%, var(--color-primary-soft), var(--color-muted) 55%, var(--color-background))" }}
      >
        {/* This panel held a testimonial — a ₹4.8L settlement shortfall
            "caught" for an unnamed Bengaluru skincare founder. No such customer
            or result exists. A fabricated endorsement is a claim about the
            product's track record made to someone deciding whether to trust it
            with their books, which makes it worse than any invented card. */}
        <div className="text-foreground" style={{ maxWidth: 420, padding: 48 }}>
          <p className="text-2xl leading-[1.5]">
            Every number traced back to the record it came from.
          </p>
          <div className="mt-5 text-[13.5px] leading-relaxed text-muted-foreground">
            Orders, payments, shipments and bank credits reconciled against each other — so &ldquo;revenue&rdquo;,
            &ldquo;collected&rdquo; and &ldquo;in the bank&rdquo; stop being the same number. Where a figure can&apos;t be
            measured, CFOOS says so instead of estimating.
          </div>
        </div>
      </div>
    </div>
  );
}
