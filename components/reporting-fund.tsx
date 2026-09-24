"use client";

import { FormEvent, useMemo, useState } from "react";
import { Bitcoin, Check, Copy, RotateCcw } from "lucide-react";

const PRESETS = [10_000, 25_000, 50_000];
const POOL_BTC = "0.4278";
const POOL_USD = "$28,140";
const DEMO_ADDRESS = "bc1qvera7reportingfund8n4w2x5p9";

function formatSats(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function ReportingFund() {
  const [amount, setAmount] = useState("25000");
  const [anonymous, setAnonymous] = useState(true);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const numericAmount = useMemo(() => Number.parseInt(amount, 10) || 0, [amount]);
  const validAmount = numericAmount >= 1_000;

  function submitDonation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validAmount) return;
    setInvoiceOpen(true);
    setCopied(false);
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(DEMO_ADDRESS);
    } finally {
      setCopied(true);
    }
  }

  return (
    <main id="main-content" className="fund-page">
      <div className="fund-shell">
        <header className="fund-intro">
          <h1>Reporting fund</h1>
        </header>

        <div className="fund-main-grid">
          <section className="fund-balance" aria-label="Current reporting fund balance">
            <Bitcoin className="fund-balance-icon" aria-hidden="true" />
            <strong>{POOL_BTC} <small>BTC</small></strong>
            <p>Approximately {POOL_USD}</p>
          </section>

          <section className="fund-donate" aria-labelledby="donate-title">
            {!invoiceOpen ? (
              <form onSubmit={submitDonation}>
                <header>
                  <span>Contribute</span>
                  <h2 id="donate-title">Choose an amount</h2>
                </header>

                <div className="fund-presets" aria-label="Suggested contribution amounts">
                  {PRESETS.map((preset) => (
                    <button
                      type="button"
                      key={preset}
                      aria-pressed={numericAmount === preset}
                      onClick={() => setAmount(String(preset))}
                    >
                      {formatSats(preset)} <span>sats</span>
                    </button>
                  ))}
                </div>

                <label className="fund-amount-field" htmlFor="fund-amount">
                  <span>Custom amount</span>
                  <div>
                    <input
                      id="fund-amount"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      min="1000"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))}
                      aria-describedby="fund-amount-help"
                    />
                    <b>sats</b>
                  </div>
                  <small id="fund-amount-help">Minimum contribution is 1,000 sats.</small>
                </label>

                <label className="fund-anonymous">
                  <input
                    type="checkbox"
                    checked={anonymous}
                    onChange={(event) => setAnonymous(event.target.checked)}
                  />
                  <span>
                    <strong>Contribute anonymously</strong>
                    <small>Your name will not appear publicly.</small>
                  </span>
                </label>

                <button className="fund-submit" type="submit" disabled={!validAmount}>
                  <Bitcoin aria-hidden="true" />Donate Bitcoin
                </button>
              </form>
            ) : (
              <div className="fund-invoice" aria-live="polite">
                <header>
                  <span>Bitcoin invoice</span>
                  <h2 id="donate-title">Send {formatSats(numericAmount)} sats</h2>
                  <p>Use this demo address to preview the contribution flow.</p>
                </header>
                <div className="fund-qr" aria-label="Demo Bitcoin payment code">
                  <Bitcoin aria-hidden="true" />
                </div>
                <button className="fund-address" type="button" onClick={copyAddress}>
                  <span>{DEMO_ADDRESS}</span>
                  {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                </button>
                <p className="fund-copy-status">{copied ? "Address copied" : "Tap to copy address"}</p>
                <button className="fund-reset" type="button" onClick={() => setInvoiceOpen(false)}>
                  <RotateCcw aria-hidden="true" />Change amount
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
