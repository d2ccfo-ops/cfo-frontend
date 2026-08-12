import { ClerkProvider } from "@clerk/nextjs";
import { Roboto } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const roboto = Roboto({
  variable: "--font-roboto",
  weight: ["300", "400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata = {
  title: "CFOOS — AI CFO Dashboard",
  description: "Founder dashboard for CFOOS, the AI CFO for D2C brands.",
};

const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("cfoos-theme") || "system";
    var dark = stored === "dark" || (stored === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }) {
  return (
    <ClerkProvider appearance={{ variables: { colorPrimary: "oklch(0.567 0.184 261)" } }}>
      <html lang="en" className={roboto.variable} suppressHydrationWarning>
        <body>
          <Script id="theme-init" strategy="beforeInteractive">
            {THEME_INIT_SCRIPT}
          </Script>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
