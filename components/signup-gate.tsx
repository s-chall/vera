"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ShieldOff } from "lucide-react";
import { useVera } from "@/lib/vera";
import { VerificationPrompt } from "@/components/verification-prompt";

/** Signed out, only the signup route renders its own page; everything else is sign-in. */
export function SignupGate({ children }: { children: React.ReactNode }) {
  const vera = useVera();
  const pathname = usePathname();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (!vera.ready) {
    return <main id="main-content" className="auth-screen"><section className="auth-card"><h1>Opening Vera</h1><p>Checking your session.</p></section></main>;
  }

  if (vera.fatal) {
    return (
      <main id="main-content" className="auth-screen">
        <section className="auth-card">
          <span className="status-badge auth-badge-warn"><ShieldOff aria-hidden="true" />Not connected</span>
          <h1>Could not start</h1>
          <p>{vera.fatal}</p>
        </section>
      </main>
    );
  }

  if (vera.signedIn) {
    // Mandatory: a journalist stays here until the register confirms them.
    if (vera.needsVerification) return <VerificationPrompt />;
    return <>{children}</>;
  }
  if (pathname === "/signup") return <>{children}</>;
  // Ops portal is gated by ADMIN_PAYOUT_SECRET on the API, not account signup.
  if (pathname.startsWith("/admin")) return <>{children}</>;

  return (
    <main id="main-content" className="auth-screen">
      <section className="auth-card">
        <span className="wordmark auth-wordmark">Vera<span aria-hidden="true">.</span></span>
        <span className="overline">Sign in</span>
        <h1>Welcome</h1>
        <p>Reporting is visible only to people with an account.</p>

        <label className="auth-field" htmlFor="email">Email</label>
        <input id="email" type="email" value={email} autoComplete="email" spellCheck={false}
          onChange={(event) => setEmail(event.target.value)} />

        <label className="auth-field" htmlFor="password">Password</label>
        <input id="password" type="password" value={password} autoComplete="current-password"
          onChange={(event) => setPassword(event.target.value)} />

        <button className="button button-primary auth-submit" disabled={vera.busy}
          onClick={() => {
            if (!email.trim() || !password) {
              vera.say("Email and password are both needed");
              return;
            }
            void vera.signIn(email.trim(), password);
          }}>
          {vera.busy ? "Signing in…" : "Sign in"}
        </button>

        <p className="auth-alt">No account? <Link href="/signup">Create one</Link></p>
        {vera.notice ? <p className={`form-message auth-message is-${vera.noticeTone}`} role="status">{vera.notice}</p> : null}
      </section>
    </main>
  );
}
