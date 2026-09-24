"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Building2, Check, Eye, EyeOff, FileCheck2, HandCoins, ShieldCheck, Upload } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useVera, SEALS, ALIAS_SHAPE } from "@/lib/vera";
import type { AccountType } from "@/lib/types";

const ROLES: { id: AccountType; label: string; icon: typeof FileCheck2; blurb: string }[] = [
  { id: "journalist", label: "Journalist", icon: FileCheck2, blurb: "Publish under a protected alias. Verified against the CNP register." },
  { id: "media_org", label: "Media organisation", icon: Building2, blurb: "Read reporting filed to Vera. Needs an address at a recognised outlet." },
  { id: "funder", label: "Funder", icon: HandCoins, blurb: "Support the reporting pool. Active once a contribution clears." },
];

export function SignupFlow() {
  const vera = useVera();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [role, setRole] = useState<AccountType>("journalist");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [alias, setAlias] = useState("");
  const [seal, setSeal] = useState(SEALS[0]);
  const [bio, setBio] = useState("");
  const [cnp, setCnp] = useState("");
  const [document, setDocument] = useState<File | null>(null);
  const [domainOk, setDomainOk] = useState<boolean | null>(null);
  const [created, setCreated] = useState(false);

  const needsVerification = role === "journalist";
  const totalSteps = needsVerification ? 3 : 2;

  useEffect(() => {
    if (vera.ready && !alias) setAlias(vera.suggestAlias());
  }, [vera.ready, alias, vera]);

  // Check the outlet domain as they type so the rejection is not a surprise at submit.
  useEffect(() => {
    if (role !== "media_org" || !email.includes("@")) { setDomainOk(null); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const ok = await vera.isMediaDomain(email.trim());
      if (!cancelled) setDomainOk(ok);
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [role, email, vera]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (step === 1) {
      if (!email.includes("@")) return vera.say("Enter the email you will sign in with");
      if (password.length < 10) return vera.say("Use at least 10 characters");
      if (role === "media_org" && domainOk === false) {
        return vera.say("That address is not at a news organisation we recognise");
      }
      vera.say(null);
      return setStep(2);
    }

    if (step === 2) {
      if (!ALIAS_SHAPE.test(alias.trim())) return vera.say("Aliases are 3 to 64 letters, numbers and spaces");
      await vera.signUp({ email: email.trim(), password, alias: alias.trim(), seal, accountType: role, bio });
      if (!needsVerification) { setCreated(true); return; }
      return setStep(3);
    }

    if (!cnp.trim()) return vera.say("Enter your CNP number");
    if (!document) return vera.say("Attach your identity document");
    await vera.submitVerification(cnp.trim(), document);
    setCreated(true);
  }

  if (created) {
    const message = needsVerification
      ? "Your document is queued for review and will be deleted once a decision is made."
      : role === "funder"
        ? "Your account is ready. It becomes active once a contribution to the pool clears."
        : "Your account is ready.";
    return (
      <main id="main-content" className="signup-page">
        <section className="signup-complete">
          <span><Check aria-hidden="true" /></span>
          <h1>Account created.</h1>
          <p>{message}</p>
          <button type="button" onClick={() => router.push(role === "funder" ? "/fund" : "/")}>
            {role === "funder" ? "Go to the fund" : "Go to the news"}<ArrowRight aria-hidden="true" />
          </button>
        </section>
      </main>
    );
  }

  return (
    <main id="main-content" className="signup-page">
      <section className="signup-panel">
        <div className="signup-form-wrap">
          <div className="signup-simple-header">
            <Link className="signup-wordmark" href="/">Vera<span aria-hidden="true">.</span></Link>
            <Link href="/">Sign in</Link>
          </div>
          <header className="signup-progress">
            <span>Step {step} of {totalSteps}</span>
            <div aria-hidden="true"><i style={{ width: `${(step / totalSteps) * 100}%` }} /></div>
          </header>

          <form onSubmit={submit}>
            {step === 1 ? (
              <fieldset className="signup-step">
                <legend>Create your account</legend>
                <div className="signup-role-grid">
                  {ROLES.map(({ id, label, icon: Icon }) => (
                    <button type="button" key={id} aria-pressed={role === id} onClick={() => setRole(id)}>
                      <Icon aria-hidden="true" /><span><strong>{label}</strong></span>
                    </button>
                  ))}
                </div>
                <p className="signup-role-blurb">{ROLES.find((r) => r.id === role)?.blurb}</p>

                <label className="signup-field">
                  <span>Email</span>
                  <input type="email" autoComplete="email" required placeholder="you@example.com"
                    value={email} onChange={(event) => setEmail(event.target.value)} />
                  {role === "media_org" && domainOk !== null ? (
                    <small className={domainOk ? "signup-ok" : "signup-bad"}>
                      {domainOk ? "Recognised outlet" : "Not a recognised outlet"}
                    </small>
                  ) : null}
                </label>

                <label className="signup-field">
                  <span>Password</span>
                  <span className="signup-password">
                    <input type={showPassword ? "text" : "password"} autoComplete="new-password"
                      minLength={10} required value={password}
                      onChange={(event) => setPassword(event.target.value)} />
                    <button type="button" aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                    </button>
                  </span>
                  <small>Use at least 10 characters.</small>
                </label>
              </fieldset>
            ) : null}

            {step === 2 ? (
              <fieldset className="signup-step">
                <legend>Choose a public name</legend>
                <p className="signup-role-blurb">This is what readers see. Your email is never shown beside it.</p>

                <label className="signup-field">
                  <span>Public alias</span>
                  <input type="text" required maxLength={64} value={alias}
                    onChange={(event) => setAlias(event.target.value)} />
                </label>
                <button type="button" className="signup-suggest" onClick={() => setAlias(vera.suggestAlias())}>
                  Suggest another
                </button>

                <span className="signup-field"><span>Seal</span></span>
                <div className="seal-picker" role="group" aria-label="Choose a seal">
                  {SEALS.map((name) => (
                    <button type="button" key={name} aria-label={`Seal ${name.slice(-1)}`}
                      aria-pressed={name === seal} className={`seal-option${name === seal ? " selected" : ""}`}
                      onClick={() => setSeal(name)}>
                      <span className={`identity-seal ${name}`} aria-hidden="true" />
                    </button>
                  ))}
                </div>

                <label className="signup-field">
                  <span>Short bio <i>Optional</i></span>
                  <textarea rows={3} maxLength={160} placeholder="What do you report on?"
                    value={bio} onChange={(event) => setBio(event.target.value)} />
                </label>
              </fieldset>
            ) : null}

            {step === 3 ? (
              <fieldset className="signup-step">
                <legend>Journalist verification</legend>
                <p className="signup-role-blurb">
                  A reviewer checks your CNP number against the register and then deletes the document.
                  We do not store your cédula, your name, or the file.
                </p>

                <label className="signup-field">
                  <span>CNP number</span>
                  <input type="text" inputMode="numeric" required pattern="[0-9]+" placeholder="24165"
                    value={cnp} onChange={(event) => setCnp(event.target.value)} />
                </label>

                <label className="signup-upload">
                  <Upload aria-hidden="true" />
                  <span>
                    <strong>{document?.name || "Upload identity document"}</strong>
                    <small>Image or PDF, deleted once reviewed</small>
                  </span>
                  <input type="file" accept="image/*,.pdf" required
                    onChange={(event) => setDocument(event.target.files?.[0] ?? null)} />
                </label>

                <p className="signup-privacy"><ShieldCheck aria-hidden="true" />
                  Nothing here is linked to your alias after review. What survives is the decision.</p>
              </fieldset>
            ) : null}

            <div className="signup-form-actions">
              {step > 1 && step < 3
                ? <button className="signup-back" type="button" onClick={() => setStep(step - 1)}><ArrowLeft aria-hidden="true" />Back</button>
                : <span />}
              <button className="signup-next" type="submit" disabled={vera.busy}>
                {vera.busy ? "Working…" : step === totalSteps ? "Create account" : "Continue"}
                <ArrowRight aria-hidden="true" />
              </button>
            </div>
          </form>

          {vera.notice ? <p className="form-message signup-message" role="status">{vera.notice}</p> : null}
        </div>
      </section>
    </main>
  );
}
