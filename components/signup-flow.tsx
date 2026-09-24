"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, FileCheck2, ShieldCheck, Upload, UserRound } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";

type Role = "journalist" | "activist" | "contributor";

export function SignupFlow() {
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<Role>("journalist");
  const [showPassword, setShowPassword] = useState(false);
  const [documentName, setDocumentName] = useState("");
  const [complete, setComplete] = useState(false);
  const [values, setValues] = useState({ email: "", password: "", pseudonym: "", handle: "", bio: "", fullName: "", cnpNumber: "", idNumber: "" });
  const totalSteps = role === "journalist" ? 3 : 2;
  const update = (field: keyof typeof values, value: string) => setValues((current) => ({ ...current, [field]: value }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step < totalSteps) setStep((current) => current + 1);
    else setComplete(true);
  };

  if (complete) {
    const message = role === "journalist" ? "Your verification is queued for review." : `Your ${role} profile is ready.`;
    return <main id="main-content" className="signup-page"><section className="signup-complete"><span><Check aria-hidden="true" /></span><h1>Account created.</h1><p>{message}</p><Link href="/write">Write your first article<ArrowRight aria-hidden="true" /></Link></section></main>;
  }

  return (
    <main id="main-content" className="signup-page">
      <section className="signup-panel">
        <div className="signup-form-wrap">
          <div className="signup-simple-header"><Link className="signup-wordmark" href="/">Vera<span aria-hidden="true">.</span></Link><button type="button">Sign in</button></div>
          <header className="signup-progress"><span>Step {step} of {totalSteps}</span><div aria-hidden="true"><i style={{ width: `${(step / totalSteps) * 100}%` }} /></div></header>
          <form onSubmit={submit}>
            {step === 1 ? <AccountStep role={role} setRole={setRole} showPassword={showPassword} setShowPassword={setShowPassword} values={values} update={update} /> : null}
            {step === 2 ? <IdentityStep values={values} update={update} /> : null}
            {step === 3 ? <VerificationStep documentName={documentName} setDocumentName={setDocumentName} values={values} update={update} /> : null}
            <div className="signup-form-actions">
              {step > 1 ? <button className="signup-back" type="button" onClick={() => setStep((current) => current - 1)}><ArrowLeft aria-hidden="true" />Back</button> : <span />}
              <button className="signup-next" type="submit">{step === totalSteps ? "Create account" : "Continue"}<ArrowRight aria-hidden="true" /></button>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}

type SignupValues = { email: string; password: string; pseudonym: string; handle: string; bio: string; fullName: string; cnpNumber: string; idNumber: string };
type UpdateValue = (field: keyof SignupValues, value: string) => void;

function AccountStep({ role, setRole, showPassword, setShowPassword, values, update }: { role: Role; setRole: (role: Role) => void; showPassword: boolean; setShowPassword: (value: boolean) => void; values: SignupValues; update: UpdateValue }) {
  return <fieldset className="signup-step"><legend>Create your account</legend><div className="signup-role-grid"><button type="button" aria-pressed={role === "journalist"} onClick={() => setRole("journalist")}><FileCheck2 aria-hidden="true" /><span><strong>Journalist</strong></span></button><button type="button" aria-pressed={role === "activist"} onClick={() => setRole("activist")}><ShieldCheck aria-hidden="true" /><span><strong>Activist</strong></span></button><button type="button" aria-pressed={role === "contributor"} onClick={() => setRole("contributor")}><UserRound aria-hidden="true" /><span><strong>Contributor</strong></span></button></div><label className="signup-field"><span>Email</span><input type="email" name="email" autoComplete="email" required placeholder="you@example.com" value={values.email} onChange={(event) => update("email", event.target.value)} /></label><label className="signup-field"><span>Password</span><span className="signup-password"><input type={showPassword ? "text" : "password"} name="password" autoComplete="new-password" minLength={10} required value={values.password} onChange={(event) => update("password", event.target.value)} /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></span><small>Use at least 10 characters.</small></label></fieldset>;
}

function IdentityStep({ values, update }: { values: SignupValues; update: UpdateValue }) {
  return <fieldset className="signup-step"><legend>Choose a public name</legend><label className="signup-field"><span>Pseudonym</span><input type="text" name="pseudonym" autoComplete="nickname" required placeholder="Quiet Current" value={values.pseudonym} onChange={(event) => update("pseudonym", event.target.value)} /></label><label className="signup-field"><span>Profile handle</span><span className="signup-handle"><b aria-hidden="true">@</b><input type="text" name="handle" autoComplete="off" required placeholder="quietcurrent" pattern="[A-Za-z0-9_]+" value={values.handle} onChange={(event) => update("handle", event.target.value)} /></span></label><label className="signup-field"><span>Short bio <i>Optional</i></span><textarea name="bio" rows={3} maxLength={160} placeholder="What do you report on?" value={values.bio} onChange={(event) => update("bio", event.target.value)} /></label></fieldset>;
}

function VerificationStep({ documentName, setDocumentName, values, update }: { documentName: string; setDocumentName: (name: string) => void; values: SignupValues; update: UpdateValue }) {
  return <fieldset className="signup-step"><legend>Journalist verification</legend><label className="signup-field"><span>CNP number</span><input type="text" name="cnpNumber" inputMode="numeric" autoComplete="off" required pattern="[0-9]+" placeholder="24165" value={values.cnpNumber} onChange={(event) => update("cnpNumber", event.target.value)} /></label><label className="signup-field"><span>ID number</span><input type="text" name="idNumber" autoComplete="off" required pattern="[VEve][0-9]+" placeholder="V24223873" value={values.idNumber} onChange={(event) => update("idNumber", event.target.value.toUpperCase())} /></label><label className="signup-field"><span>Name and surname</span><input type="text" name="fullName" autoComplete="name" required value={values.fullName} onChange={(event) => update("fullName", event.target.value)} /></label><label className="signup-upload"><Upload aria-hidden="true" /><span><strong>{documentName || "Upload government ID"}</strong><small>Image or PDF</small></span><input type="file" accept="image/*,.pdf" required onChange={(event) => setDocumentName(event.target.files?.[0]?.name ?? "")} /></label></fieldset>;
}
