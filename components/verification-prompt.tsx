"use client";

import { useState } from "react";
import { Clock3, LogOut, ShieldCheck, ShieldX } from "lucide-react";
import { useVera } from "@/lib/vera";

/**
 * Verification is mandatory: a journalist account cannot reach the app until
 * the CNP register confirms it. There is no skip. Signing out is the only way
 * past this screen.
 */
export function VerificationPrompt() {
  const vera = useVera();
  const [cnp, setCnp] = useState("");
  const [cedula, setCedula] = useState("");

  const signOut = (
    <p className="auth-alt">
      <button type="button" onClick={() => void vera.signOut()}>
        <LogOut aria-hidden="true" /> Sign out
      </button>
    </p>
  );

  // An inconclusive lookup leaves the request pending for a reviewer. The
  // account stays closed until someone settles it.
  if (vera.verification === "pending") {
    return (
      <main id="main-content" className="auth-screen">
        <section className="auth-card">
          <span className="status-badge"><Clock3 aria-hidden="true" />Awaiting review</span>
          <h1>We could not reach the register.</h1>
          <p>
            Your CNP number could not be confirmed automatically, so a reviewer will
            check it by hand. You will be able to publish once that is done.
          </p>
          {signOut}
        </section>
      </main>
    );
  }

  const refused = vera.verification === "rejected";

  return (
    <main id="main-content" className="auth-screen">
      <section className="auth-card">
        {refused
          ? <span className="status-badge auth-badge-warn"><ShieldX aria-hidden="true" />Not recognised</span>
          : <span className="overline">One more step</span>}

        <h1>{refused ? "Those details were not recognised." : "Verify your CNP registration."}</h1>
        <p>
          {refused
            ? "The CNP register did not match that number and cédula to an affiliate. Check both and try again."
            : "We check these against the Colegio Nacional de Periodistas register at cnpven.org. Your cédula is used for that request and is never stored."}
        </p>

        <label className="auth-field" htmlFor="cnp">Nº de CNP</label>
        <input id="cnp" inputMode="numeric" placeholder="12345" value={cnp}
          autoComplete="off" onChange={(event) => setCnp(event.target.value)} />

        <label className="auth-field" htmlFor="cedula">Cédula de identidad</label>
        <input id="cedula" placeholder="V12345678" value={cedula} autoComplete="off"
          spellCheck={false} onChange={(event) => setCedula(event.target.value.toUpperCase())} />

        <button className="button button-accent auth-submit" disabled={vera.busy}
          onClick={() => {
            if (!cnp.trim()) return vera.say("Enter your CNP number");
            if (!/^[VE]\d{5,10}$/.test(cedula.trim())) {
              return vera.say("Cédula should look like V12345678");
            }
            void vera.submitVerification(cnp.trim(), cedula.trim());
          }}>
          {vera.busy ? "Checking the register…" : refused ? "Try again" : "Verify"}
        </button>

        <p className="signup-privacy"><ShieldCheck aria-hidden="true" />
          Only the result is kept. Your CNP number is stored as a one-way fingerprint
          and your cédula is not stored at all.</p>

        {signOut}
        {vera.notice ? <p className="form-message auth-message" role="status">{vera.notice}</p> : null}
      </section>
    </main>
  );
}
