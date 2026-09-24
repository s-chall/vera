"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { MessageSquare, RefreshCw, Send, Wallet } from "lucide-react";

type Allocation = {
  public_alias: string;
  payout_atomic: number;
  score: number;
  total_score: number;
};

type Epoch = {
  epoch_id: number;
  opens_at: string;
  closes_at: string;
  payout_budget_atomic: number;
  allocations: Allocation[];
  funded_by_you: boolean;
  your_deposit_sats: number;
};

type MediaHit = {
  outlet_name: string;
  country: string;
  title: string;
  url: string;
  matched_alias: string | null;
};

type Lookup = {
  address: string | null;
  model: { name: string; mode: string; note: string };
  deposits: Array<{ txid: string; amount_sats: number; observed_at: string }>;
  epochs: Epoch[];
  funded_epochs: Epoch[];
  media_hits: MediaHit[];
  your_total_sats: number;
  error?: string;
  hint?: string;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  links?: Array<{ label: string; href: string }>;
  meta?: string;
};

const STORAGE_KEY = "vera-chat-wallet";

const PROMPTS = [
  "How were funds distributed last epoch?",
  "Did I fund this epoch?",
  "Which outlets reused reporting?",
];

function formatSats(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDay(iso: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
}

function briefForEpoch(epoch: Epoch, youFunded: boolean, yourSats: number) {
  const lines = epoch.allocations
    .slice()
    .sort((a, b) => b.payout_atomic - a.payout_atomic)
    .map((a) => `• ${a.public_alias} — ${formatSats(a.payout_atomic)} sats`)
    .join("\n");

  const header = youFunded ? `You funded this epoch with ${formatSats(yourSats)} sats.\n\n` : "";

  return `${header}Epoch closing ${formatDay(epoch.closes_at)} distributed ${formatSats(epoch.payout_budget_atomic)} sats to journalist pseudonyms:\n\n${lines}`;
}

export function ChatBriefs() {
  const [wallet, setWallet] = useState("");
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [loading, setLoading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Paste the Bitcoin address you used to fund the Total Pool. I’ll show which epoch you funded and how sats were distributed to journalist pseudonyms. Runs on Maple / local models — Vera reporting is not sent to cloud training APIs.",
    },
  ]);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) setWallet(saved);
  }, []);

  async function runLookup(address: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/chat/lookup?address=${encodeURIComponent(address)}`);
      const data = (await res.json()) as Lookup;
      if (!res.ok) throw new Error(data.error || "Lookup failed");
      setLookup(data);
      window.localStorage.setItem(STORAGE_KEY, address);

      const funded = data.funded_epochs[0] ?? null;
      const latest = data.epochs[0] ?? null;
      const next: ChatMessage[] = [];

      if (funded) {
        next.push({
          id: `funded-${funded.epoch_id}`,
          role: "assistant",
          text: briefForEpoch(funded, true, funded.your_deposit_sats || data.your_total_sats),
        });
      } else if (latest) {
        next.push({
          id: `latest-${latest.epoch_id}`,
          role: "assistant",
          text:
            `No deposits from this address are indexed yet.\n\n` +
            briefForEpoch(latest, false, 0) +
            `\n\nAfter you contribute on /fund and sync, paste this address again to unlock “you funded this epoch.”`,
        });
      } else {
        next.push({
          id: "empty-ledger",
          role: "assistant",
          text: "No payout epochs are ready yet. Seed a local epoch (`npm run db:seed-payout`) or wait for the next close.",
        });
      }

      if (data.media_hits?.length) {
        next.push({
          id: "media",
          role: "assistant",
          text: "Media reuse hits from the local cache (NPR + BBC Mundo allowlist):",
          links: data.media_hits.slice(0, 4).map((hit) => ({
            label: `${hit.outlet_name}: ${hit.title}`,
            href: hit.url,
          })),
        });
      }

      setMessages((current) => [
        ...current,
        { id: `user-wallet-${Date.now()}`, role: "user", text: `Follow ${address}` },
        ...next,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  async function ask(prompt: string) {
    setAsking(true);
    setMessages((current) => [...current, { id: `u-${Date.now()}`, role: "user", text: prompt }]);
    try {
      const res = await fetch("/api/chat/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: prompt, address: wallet.trim() || lookup?.address || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chat failed");
      setMessages((current) => [
        ...current,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: data.text,
          links: data.links,
          meta: `${data.provider} · ${data.model}`,
        },
      ]);
    } catch (err) {
      setMessages((current) => [
        ...current,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: err instanceof Error ? err.message : "Chat failed",
        },
      ]);
    } finally {
      setAsking(false);
    }
  }

  async function syncMedia() {
    setSyncing(true);
    try {
      const res = await fetch("/api/chat/media/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Media sync failed");
      const lines = (data.summary || [])
        .map((s: { source: string; fetched?: number; matched?: number; error?: string }) =>
          s.error ? `${s.source}: ${s.error}` : `${s.source}: ${s.fetched} stories, ${s.matched} alias matches`,
        )
        .join("\n");
      setMessages((current) => [
        ...current,
        {
          id: `sync-${Date.now()}`,
          role: "assistant",
          text: `Refreshed allowlist feeds.\n${lines}`,
        },
      ]);
      if (wallet.trim()) await runLookup(wallet.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Media sync failed");
    } finally {
      setSyncing(false);
    }
  }

  function onSubmitWallet(event: FormEvent) {
    event.preventDefault();
    const address = wallet.trim();
    if (!address) return;
    void runLookup(address);
  }

  function onSubmitChat(event: FormEvent) {
    event.preventDefault();
    const prompt = draft.trim();
    if (!prompt || asking) return;
    setDraft("");
    void ask(prompt);
  }

  const modelNote = useMemo(
    () =>
      lookup?.model.note ??
      "Local Maple / Ollama grounding — journalist work is not sent to cloud training APIs.",
    [lookup],
  );

  return (
    <main id="main-content" className="chat-page">
      <div className="chat-shell">
        <header className="chat-intro">
          <h1>Chat</h1>
          <p>Follow your deposit address into biweekly payouts to journalist pseudonyms.</p>
          <p className="chat-model">{modelNote}</p>
        </header>

        <form className="chat-wallet" onSubmit={onSubmitWallet}>
          <label htmlFor="chat-wallet">
            <Wallet aria-hidden="true" />
            Your deposit address
          </label>
          <div>
            <input
              id="chat-wallet"
              value={wallet}
              onChange={(event) => setWallet(event.target.value)}
              placeholder="tb1q… or bc1q…"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" disabled={loading || !wallet.trim()}>
              {loading ? "Looking up…" : "Follow"}
            </button>
          </div>
          {error ? <p className="chat-error" role="alert">{error}</p> : null}
        </form>

        <div className="chat-prompts" aria-label="Suggested questions">
          {PROMPTS.map((prompt) => (
            <button type="button" key={prompt} disabled={asking} onClick={() => void ask(prompt)}>
              {prompt}
            </button>
          ))}
          <button type="button" className="chat-sync" disabled={syncing} onClick={() => void syncMedia()}>
            <RefreshCw aria-hidden="true" />
            {syncing ? "Syncing media…" : "Refresh NPR + BBC Mundo"}
          </button>
        </div>

        <section className="chat-thread" aria-live="polite">
          {messages.map((message) => (
            <article key={message.id} className={`chat-bubble chat-bubble-${message.role}`}>
              {message.role === "assistant" ? <MessageSquare aria-hidden="true" /> : null}
              <div>
                <p>{message.text}</p>
                {message.links?.length ? (
                  <ul>
                    {message.links.map((link) => (
                      <li key={link.href}>
                        <a href={link.href} target="_blank" rel="noreferrer">
                          {link.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {message.meta ? <small className="chat-meta">{message.meta}</small> : null}
              </div>
            </article>
          ))}
        </section>

        <form className="chat-composer" onSubmit={onSubmitChat}>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask about payouts or media reuse…"
            aria-label="Message"
            disabled={asking}
          />
          <button type="submit" disabled={!draft.trim() || asking} aria-label="Send">
            <Send aria-hidden="true" />
          </button>
        </form>
      </div>
    </main>
  );
}
