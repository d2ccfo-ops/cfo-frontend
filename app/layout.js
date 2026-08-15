import { ClerkProvider } from "@clerk/nextjs";
import { Plus_Jakarta_Sans } from "next/font/google";
import ThemeSync from "@/components/ui/ThemeSync";
import "./globals.css";

// The design names "Plus Jakarta Sans" as a bare family because it loads fonts
// through a Google Fonts <link>. That mechanism is wrong here: a link tag is a
// render-blocking third-party request that Next cannot preload, and the family
// only resolves for users who happen to have it installed. next/font self-hosts
// the file, emits a preload, and hands back a CSS variable — so globals.css
// asks for var(--font-jakarta), not for a family name it has to hope exists.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata = {
  title: "CFOOS — AI CFO Dashboard",
  description: "Founder dashboard for CFOOS, the AI CFO for D2C brands.",
};

// Runs before paint — see the note at the <script> tag for why it has to be a
// plain inline script rather than next/script to actually do that. Applying
// these in an effect instead means the first frame renders in the default
// theme and then snaps, and on a dark-palette account that flash is a full
// white page.
//
// Palette is applied in the same pass as mode. Doing it in the picker's effect
// instead would leave the two out of step for a frame — mode correct, hues not
// — which reads as a broken theme rather than a slow one.
//
// Both palettes are applied at once and only one can match — the light blocks
// are guarded by :root:not(.dark), the dark ones by .dark — so switching mode
// needs no second pass and cannot momentarily show the wrong palette.
//
// The class lists are duplicated from ThemeToggle.js rather than imported: this
// is a string injected before any bundle loads, so it cannot import anything.
// Adding a palette means adding it in both places.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var d = document.documentElement;
    var mode = localStorage.getItem("cfoos-theme") || "system";
    d.classList.toggle("dark", mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches));
    var light = localStorage.getItem("cfoos-palette-light") || "signature";
    var dark = localStorage.getItem("cfoos-palette-dark") || "signature";
    var L = ["cream","oat","almond","seasalt","vanilla","linen","mint","champagne","mono"];
    var D = ["obsidian","navy","espresso","forest","plum","mono"];
    for (var i = 0; i < L.length; i++) d.classList.toggle("p-" + L[i], light === L[i]);
    for (var j = 0; j < D.length; j++) d.classList.toggle("d-" + D[j], dark === D[j]);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }) {
  return (
    // colorPrimary as a var(), not a literal. This was the one hardcoded
    // oklch() outside globals.css in the whole app, and it was the OLD blue —
    // so every Clerk-hosted surface (sign-in, org switcher, user button) went
    // on rendering blue while the rest of the app moved to near-black, and it
    // followed neither theme toggle. app/login/page.js already passes var()
    // references; this makes the root provider agree with it.
    <ClerkProvider appearance={{ variables: { colorPrimary: "var(--color-primary)" } }}>
      <html lang="en" className={jakarta.variable} suppressHydrationWarning>
        <body>
          {/* A PLAIN inline script, not next/script.
              This used <Script strategy="beforeInteractive">, which does not do
              what its name says in the App Router: for an inline script with no
              `src`, Next emits only a queue push — the code lands in the HTML as
              an inert JSON string inside `self.__next_s` and is not executed
              until the client runtime chunk downloads and drains that queue
              (next/dist/client/app-bootstrap.js). Verified in .next/server/app/
              *.html: the theme code was present but escaped, and <html> shipped
              with no theme class at all. Every load therefore painted light
              Signature first and snapped afterwards — the exact flash the
              comment above claimed to prevent, worst on a dark palette.
              React streams this one into the markup verbatim, so the parser
              runs it synchronously — after the render-blocking stylesheet and
              before the body paints. */}
          <script id="theme-init" dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
          {/* The script above resolves the theme once per load. On "system"
              that goes stale when the OS flips at sunset, or when another tab
              changes the setting — this re-derives it. App-wide rather than
              inside the picker, which only mounts on Settings. */}
          <ThemeSync />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
