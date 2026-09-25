"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Bitcoin, Check, Copy, ExternalLink, RotateCcw, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useVera } from "@/lib/vera";

const PRESETS = [10_000, 25_000, 50_000];

type FundUtxo = {
  txid: string;
  vout: number;
  amount_sats: number;
  confirmed: boolean;
  explorer_url: string;
};

type FundSnapshot = {
  address: string;
  balance_btc: string;
  balance_sats: number;
  confirmed_sats: number;
  unconfirmed_sats: number;
  approx_usd: string | null;
  explorer_url: string;
  faucet_url: string | null;
  network: string;
  synced_at: string;
  custody: string;
  tx_count: number;
  utxos: FundUtxo[];
  internal_sats?: number;
};

type Invoice = {
  address: string;
  amount_sats: number;
  bitcoin_uri: string;
  explorer_url: string;
  qr_data_url: string;
};

function formatSats(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function shortTx(txid: string) {
  return `${txid.slice(0, 8)}…${txid.slice(-6)}`;
}

export function ReportingFund() {
  const vera = useVera();
  const [amount, setAmount] = useState("25000");
  const [anonymous, setAnonymous] = useState(true);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [copied, setCopied] = useState(false);
  const [pool, setPool] = useState<FundSnapshot | null>(null);
  const [poolError, setPoolError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [demoBalance, setDemoBalance] = useState<number | null>(null);
  const [demoSuccess, setDemoSuccess] = useState<string | null>(null);

  const numericAmount = useMemo(() => Number.parseInt(amount, 10) || 0, [amount]);
  const validAmount = numericAmount >= 1_000;
  const isSignet = pool?.network === "signet" || !pool;
  const availableSats = demoBalance ?? vera.walletBalanceSats;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const fundRes = await fetch("/api/fund");
        const fund = await fundRes.json();
        if (!fundRes.ok) throw new Error(fund.error || "Failed to load pool");
        if (!cancelled) {
          setPool(fund);
          setPoolError(null);
        }
      } catch (error) {
        if (!cancelled) setPoolError(error instanceof Error ? error.message : "Failed to load pool");
      }
    }
    load();
    const id = window.setInterval(load, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!invoice) return;
    document.getElementById("fund-invoice")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [invoice]);

  async function submitBitcoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validAmount) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const response = await fetch("/api/fund/contribute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount_sats: numericAmount, anonymous }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create contribution");
      setInvoice({
        address: data.address,
        amount_sats: data.amount_sats,
        bitcoin_uri: data.bitcoin_uri,
        explorer_url: data.explorer_url,
        qr_data_url: data.qr_data_url,
      });
      setCopied(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Contribution failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitInternal() {
    if (!validAmount || numericAmount > availableSats) return;
    setSubmitting(true);
    setFormError(null);
    setDemoSuccess(null);
    try {
      const db = supabase();
      if (!db) throw new Error("Supabase is not configured.");
      const { data, error } = await db.rpc("contribute_internal_signet", {
        contribution_sats: numericAmount,
        hide_identity: anonymous,
      }).single();
      if (error) throw error;
      const result = data as { wallet_balance_sats: number | string; pool_balance_sats: number | string };
      const nextWallet = Number(result.wallet_balance_sats);
      const nextPool = Number(result.pool_balance_sats);
      setDemoBalance(nextWallet);
      setPool((current) => {
        if (!current) return current;
        const balanceSats = current.balance_sats - (current.internal_sats ?? 0) + nextPool;
        return {
          ...current,
          internal_sats: nextPool,
          balance_sats: balanceSats,
          balance_btc: (balanceSats / 1e8).toFixed(8).replace(/0+$/, "").replace(/\.$/, "") || "0",
        };
      });
      setDemoSuccess(`${formatSats(numericAmount)} starter sats moved to the reporting pool.`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Contribution failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyAddress() {
    if (!invoice) return;
    try {
      await navigator.clipboard.writeText(invoice.address);
    } finally {
      setCopied(true);
    }
  }

  const deposits = pool?.utxos ?? [];

  return (
    <main id="main-content" className="fund-page">
      <div className="fund-shell">
        <header className="fund-intro">
          <h1>Funding Pool</h1>
        </header>

        <div className="fund-main-grid">
          <section className="fund-balance" aria-label="Current Total Pool balance">
            <Bitcoin className="fund-balance-icon" aria-hidden="true" />
            <strong>
              {pool ? pool.balance_btc : "—"} <small>{pool?.internal_sats ? "sBTC" : "BTC"}</small>
            </strong>
            <p>
              {pool
                ? [
                    formatSats(pool.balance_sats) + " sats",
                    pool.internal_sats ? "Internal demo pool" : pool.approx_usd,
                    pool.network === "signet" ? "Signet" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : poolError
                  ? poolError
                  : "Loading…"}
            </p>
            {pool ? (
              <p className="fund-balance-meta">
                <a href={pool.explorer_url} target="_blank" rel="noreferrer">
                  View on-chain address
                </a>
                {pool.internal_sats ? <span> · Demo balance is tracked in Vera</span> : null}
              </p>
            ) : null}

            {deposits.length > 0 ? (
              <ul className="fund-deposits" aria-label="Recent deposits">
                {deposits.map((u) => (
                  <li key={`${u.txid}:${u.vout}`}>
                    <a href={u.explorer_url} target="_blank" rel="noreferrer">
                      <span>{shortTx(u.txid)}</span>
                      <b>{formatSats(u.amount_sats)} sats</b>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="fund-donate" aria-labelledby="donate-title">
            {!invoice ? (
              <form onSubmit={submitBitcoin}>
                <header>
                  <h2 id="donate-title">Contribute</h2>
                  <p className="fund-demo-balance">Available: <strong>{formatSats(availableSats)} sats</strong> · internal Signet demo wallet</p>
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
                  <small id="fund-amount-help">Minimum 1,000 sats</small>
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

                {formError ? <p className="fund-form-error" role="alert">{formError}</p> : null}
                {demoSuccess ? <p className="fund-banner" role="status">{demoSuccess}</p> : null}

                <button className="fund-submit" type="button"
                  disabled={!validAmount || numericAmount > availableSats || submitting}
                  onClick={() => void submitInternal()}>
                  <Wallet aria-hidden="true" />
                  {submitting ? "Contributing…" : "Use starter sats"}
                </button>
                <button className="fund-chain-option" type="submit" disabled={!validAmount || submitting}>
                  <Bitcoin aria-hidden="true" />
                  Pay on-chain instead
                </button>
              </form>
            ) : (
              <div id="fund-invoice" className="fund-invoice" aria-live="polite">
                <header>
                  <h2 id="donate-title">Send {formatSats(invoice.amount_sats)} sats</h2>
                  <p>
                    {isSignet
                      ? "Pay from a Signet wallet. The balance updates when the transaction appears."
                      : "Pay from any Bitcoin wallet. The balance updates when the transaction appears."}
                  </p>
                </header>
                <div className="fund-qr" aria-label="Bitcoin payment QR code">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={invoice.qr_data_url}
                    alt={`Pay ${formatSats(invoice.amount_sats)} sats to the Total Pool`}
                    width={180}
                    height={180}
                  />
                </div>
                <a className="fund-submit fund-wallet-link" href={invoice.bitcoin_uri}>
                  <Wallet aria-hidden="true" />Open in wallet
                </a>
                <button className="fund-address" type="button" onClick={copyAddress}>
                  <span>{invoice.address}</span>
                  {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                </button>
                <p className="fund-copy-status">{copied ? "Address copied" : "Tap to copy address"}</p>
                <p className="fund-copy-status">
                  <a href={invoice.explorer_url} target="_blank" rel="noreferrer">
                    <ExternalLink aria-hidden="true" /> View address
                  </a>
                </p>
                {pool?.faucet_url ? (
                  <p className="fund-copy-status">
                    <a href={pool.faucet_url} target="_blank" rel="noreferrer">
                      Get Signet coins
                    </a>
                  </p>
                ) : null}
                <button className="fund-reset" type="button" onClick={() => setInvoice(null)}>
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
