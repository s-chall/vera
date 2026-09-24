"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useVera } from "@/lib/vera";

/**
 * Checks a journalist against the Colegio Nacional de Periodistas register,
 * asking for exactly what cnpven.org asks for. Skippable: an unverified
 * journalist can still read and write, they simply carry no shield.
 */
export function VerificationPrompt({ onSkip }: { onSkip: () => void }) {
  const vera = useVera();
  const [cnp, setCnp] = useState("");
  const [cedula, setCedula] = useState("");

  return (
    <main id="main-content" className="auth-screen">
      <section className="auth-card">
        <span className="overline">One more step</span>
        <h1>Verify your CNP registration.</h1>
        <p>
          We check these against the Colegio Nacional de Periodistas register at
          cnpven.org. Your cédula is used for that request and is never stored.
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
          {vera.busy ? "Checking the register…" : "Verify"}
        </button>

        <p className="signup-privacy"><ShieldCheck aria-hidden="true" />
          Only the result is kept. Your CNP number is stored as a one-way fingerprint
          and your cédula is not stored at all.</p>

        <p className="auth-alt">
          <button type="button" onClick={onSkip}>Do this later</button>
        </p>
        {vera.notice ? <p className="form-message auth-message" role="status">{vera.notice}</p> : null}
      </section>
    </main>
  );
}
