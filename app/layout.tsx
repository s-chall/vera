import type { Metadata } from "next";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/newsreader";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { VeraProvider } from "@/lib/vera";
import { SignupGate } from "@/components/signup-gate";

export const metadata: Metadata = {
  title: { default: "Vera - Verified Reporting", template: "%s - Vera" },
  description: "Reader-funded reporting with protected journalist identities and transparent payouts.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <VeraProvider>
          <SignupGate>
            <SiteHeader />
            {children}
          </SignupGate>
        </VeraProvider>
      </body>
    </html>
  );
}
