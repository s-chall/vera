"use client";

import { useEffect, useState } from "react";
import { RefreshCw, ShieldOff } from "lucide-react";
import { useVera, SEALS, ALIAS_SHAPE } from "@/lib/vera";

export function SignupGate({ children }: { children: React.ReactNode }) {
  const vera = useVera();
  const [mode, setMode] = useState<"claim" | "signin">("claim");
  const [alias, setAlias] = useState("");

  // Propose an alias once the byline list is loaded, then leave it alone.
  // Deriving it during render regenerated it on every state change and moved
  // the text out from under whoever was typing.
  useEffect(() => {
    if (vera.ready && !vera.signedIn && !alias) setAlias(vera.suggestAlias());
  }, [vera.ready, vera.signedIn, alias, vera]);
  const [seal, setSeal] = useState(SEALS[0]);
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

  if (vera.signedIn) return <>{children}</>;

  return (
    <main id="main-content" className="auth-screen">
      <section className="auth-card">
        <span className="wordmark auth-wordmark">Vera<span aria-hidden="true">.</span></span>

        {mode === "claim" ? (
          <>
            <span className="overline">Create an account</span>
            <h1>Two identities,<br />never joined.</h1>
            <p>Your email signs you in and nothing else. The alias below is what readers
            see, and nothing links it to your email or to the wallet that receives payouts.</p>

            <div className="alias-preview">
              <span className={`identity-seal ${seal}`} aria-hidden="true" />
              <strong>{alias || "…"}</strong>
              <small>Unverified · new account</small>
            </div>

            <label className="auth-field" htmlFor="signup-email">Email</label>
            <input id="signup-email" type="email" value={email} autoComplete="email" spellCheck={false}
              onChange={(event) => setEmail(event.target.value)} />

            <label className="auth-field" htmlFor="signup-password">Password</label>
            <input id="signup-password" type="password" value={password} autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value)} />

            <label className="auth-field" htmlFor="alias">Public alias</label>
            <div className="alias-row">
              <input id="alias" value={alias} maxLength={64} autoComplete="off" spellCheck={false}
                onChange={(event) => setAlias(event.target.value)} />
              <button type="button" className="secondary-button" onClick={() => setAlias(vera.suggestAlias())}
                aria-label="Suggest another alias"><RefreshCw aria-hidden="true" /></button>
            </div>

            <span className="auth-field">Seal</span>
            <div className="seal-picker" role="group" aria-label="Choose a seal">
              {SEALS.map((name) => (
                <button type="button" key={name} aria-label={`Seal ${name.slice(-1)}`}
                  aria-pressed={name === seal} className={`seal-option${name === seal ? " selected" : ""}`}
                  onClick={() => setSeal(name)}>
                  <span className={`identity-seal ${name}`} aria-hidden="true" />
                </button>
              ))}
            </div>

            <button className="button button-accent auth-submit" disabled={vera.busy}
              onClick={() => {
                const wanted = alias.trim();
                if (!email.trim() || !email.includes("@")) {
                  vera.say("Enter the email you will sign in with");
                  return;
                }
                if (password.length < 6) {
                  vera.say("Passwords are at least 6 characters");
                  return;
                }
                if (!ALIAS_SHAPE.test(wanted)) {
                  vera.say("Aliases are 3 to 64 letters, numbers and spaces");
                  return;
                }
                void vera.signUp(email.trim(), password, wanted, seal);
              }}>
              {vera.busy ? "Creating your account…" : "Create account"}
            </button>

            <p className="auth-note">Your email is stored in the auth system and never appears on
            your byline. Nobody reading your work can see it.</p>
            <p className="auth-alt">Already have an account?{" "}
              <button type="button" onClick={() => { setMode("signin"); vera.say(null); }}>Sign in</button></p>
          </>
        ) : (
          <>
            <span className="overline">Sign in</span>
            <h1>Welcome back.</h1>
            <p>Vera is closed. Reports are visible only to people with an account.</p>

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

            <p className="auth-alt">No account?{" "}
              <button type="button" onClick={() => { setMode("claim"); vera.say(null); }}>Create one</button></p>
          </>
        )}

        {vera.notice ? <p className="form-message auth-message" role="status">{vera.notice}</p> : null}
      </section>
    </main>
  );
}
