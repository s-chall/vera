"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, Wallet } from "lucide-react";

type Earner = {
  journalist_id: string;
  public_alias: string;
  payout_address: string | null;
  score: number;
};

type PreviewLine = Earner & {
  total_score: number;
  payout_atomic: number;
};

type Pool = {
  address: string;
  network: string;
  balance_sats: number;
};

type Recent = {
  id: number;
  amount_sats: number;
  pool_balance_before: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

const SECRET_KEY = "vera-admin-payout-secret";

function formatSats(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function AdminPayoutPortal() {
  const [secret, setSecret] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pool, setPool] = useState<Pool | null>(null);
  const [earners, setEarners] = useState<Earner[]>([]);
  const [preview, setPreview] = useState<PreviewLine[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    const saved = window.sessionStorage.getItem(SECRET_KEY);
    if (saved) setSecret(saved);
  }, []);

  const numericAmount = useMemo(() => {
    const n = Number.parseInt(amount.replace(/\D/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
  }, [amount]);

  const livePreview = useMemo(() => {
    if (!earners.length || numericAmount <= 0) return preview;
    const totalScore = earners.reduce((sum, e) => sum + e.score, 0);
    if (totalScore <= 0) return [];
    const lines = earners.map((e) => ({
      ...e,
      total_score: totalScore,
      payout_atomic: Math.floor((numericAmount * e.score) / totalScore),
    }));
    let allocated = lines.reduce((sum, l) => sum + l.payout_atomic, 0);
    let dust = numericAmount - allocated;
    if (dust > 0 && lines.length) {
      lines.sort((a, b) => b.score - a.score);
      lines[0].payout_atomic += dust;
    }
    return lines.sort((a, b) => b.payout_atomic - a.payout_atomic);
  }, [earners, numericAmount, preview]);

  async function load(nextSecret = secret) {
    if (!nextSecret.trim()) {
      setError("Enter the admin payout secret");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/payout", {
        headers: { authorization: `Bearer ${nextSecret.trim()}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      window.sessionStorage.setItem(SECRET_KEY, nextSecret.trim());
      setPool(data.pool);
      setEarners(data.earners || []);
      setPreview(data.preview || []);
      setRecent(data.recent || []);
      if (!amount && data.preview_amount_sats != null) {
        setAmount(String(data.preview_amount_sats));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function payOut(event: FormEvent) {
    event.preventDefault();
    if (!secret.trim() || numericAmount <= 0) return;
    setPaying(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/payout", {
        method: "POST",
        headers: {
          authorization: `Bearer ${secret.trim()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          amount_sats: numericAmount,
          note: note.trim() || undefined,
          reset_pool: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Payout failed");
      const summary = (data.lines || [])
        .map((l: { public_alias: string; payout_atomic: number }) => `${l.public_alias}: ${formatSats(l.payout_atomic)} sats`)
        .join("\n");
      setResult(`Paid ${formatSats(data.amount_sats)} sats and reset the pool to zero.\n\n${summary}`);
      setAmount("0");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payout failed");
    } finally {
      setPaying(false);
    }
  }

  return (
    <main id="main-content" className="admin-page">
      <div className="admin-shell">
        <header className="admin-intro">
          <Link href="/fund" className="admin-back">
            <ArrowLeft aria-hidden="true" /> Back to Fund
          </Link>
          <h1>Payout admin</h1>
          <p>
            Distribute a chosen sats amount to journalists who earned it (by epoch scores), then reset the Total
            Pool balance to zero.
          </p>
        </header>

        <section className="admin-card">
          <label htmlFor="admin-secret">Admin secret</label>
          <div className="admin-row">
            <input
              id="admin-secret"
              type="password"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              placeholder="local-admin-payout"
              autoComplete="off"
            />
            <button type="button" onClick={() => void load()} disabled={loading || !secret.trim()}>
              <RefreshCw aria-hidden="true" />
              {loading ? "Loading…" : "Load"}
            </button>
          </div>
          <small>Default local secret: <code>local-admin-payout</code>. Or sign in as admin and send a session token.</small>
        </section>

        {pool ? (
          <section className="admin-card admin-balance" aria-label="Current pool">
            <Wallet aria-hidden="true" />
            <div>
              <strong>{formatSats(pool.balance_sats)} sats</strong>
              <p>
                {pool.network} · {pool.address}
              </p>
            </div>
          </section>
        ) : null}

        <form className="admin-card" onSubmit={payOut}>
          <label htmlFor="admin-amount">Amount to pay out (sats)</label>
          <input
            id="admin-amount"
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))}
            placeholder="25000"
          />
          <label htmlFor="admin-note">Note (optional)</label>
          <input
            id="admin-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Hackathon demo payout"
          />

          <div className="admin-preview">
            <h2>Split preview</h2>
            {!livePreview.length ? (
              <p className="admin-muted">Load the portal to preview earners.</p>
            ) : (
              <ul>
                {livePreview.map((line) => (
                  <li key={line.journalist_id}>
                    <span>{line.public_alias}</span>
                    <b>{formatSats(line.payout_atomic)} sats</b>
                    <small>score {formatSats(line.score)}</small>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error ? <p className="admin-error" role="alert">{error}</p> : null}
          {result ? <pre className="admin-result">{result}</pre> : null}

          <button className="admin-pay" type="submit" disabled={paying || numericAmount <= 0 || !secret.trim()}>
            {paying ? "Paying…" : "Pay out & reset pool to 0"}
          </button>
        </form>

        {recent.length ? (
          <section className="admin-card">
            <h2>Recent runs</h2>
            <ul className="admin-recent">
              {recent.map((run) => (
                <li key={run.id}>
                  <strong>{formatSats(run.amount_sats)} sats</strong>
                  <span>
                    from {formatSats(run.pool_balance_before)} · {new Date(run.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
