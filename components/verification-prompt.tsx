"use client";

import { useState } from "react";
import { ShieldCheck, Upload } from "lucide-react";
import { useVera } from "@/lib/vera";

/**
 * Shown to a journalist who has signed in but not yet proved their CNP
 * registration. Skippable: an unverified journalist can still read and write,
 * they simply carry no shield.
 */
export function VerificationPrompt({ onSkip }: { onSkip: () => void }) {
  const vera = useVera();
  const [cnp, setCnp] = useState("");
  const [document, setDocument] = useState<File | null>(null);

  return (
    <main id="main-content" className="auth-screen">
      <section className="auth-card">
        <span className="overline">One more step</span>
        <h1>Verify your CNP registration.</h1>
        <p>
          A reviewer checks your number against the Colegio Nacional de Periodistas
          register and then deletes your document. We never store your cédula, your
          name, or the file itself.
        </p>

        <label className="auth-field" htmlFor="cnp">CNP number</label>
        <input id="cnp" inputMode="numeric" placeholder="24165" value={cnp}
          onChange={(event) => setCnp(event.target.value)} />

        <label className="signup-upload">
          <Upload aria-hidden="true" />
          <span>
            <strong>{document?.name || "Upload identity document"}</strong>
            <small>Image or PDF, deleted once reviewed</small>
          </span>
          <input type="file" accept="image/*,.pdf"
            onChange={(event) => setDocument(event.target.files?.[0] ?? null)} />
        </label>

        <button className="button button-accent auth-submit" disabled={vera.busy}
          onClick={() => {
            if (!cnp.trim()) return vera.say("Enter your CNP number");
            if (!document) return vera.say("Attach your identity document");
            void vera.submitVerification(cnp.trim(), document);
          }}>
          {vera.busy ? "Submitting…" : "Submit for review"}
        </button>

        <p className="signup-privacy"><ShieldCheck aria-hidden="true" />
          Nothing here is linked to your alias after review. What survives is the decision.</p>

        <p className="auth-alt">
          <button type="button" onClick={onSkip}>Do this later</button>
        </p>
        {vera.notice ? <p className="form-message auth-message" role="status">{vera.notice}</p> : null}
      </section>
    </main>
  );
}
