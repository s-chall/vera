# Hackathon demo — Signet Total Pool

## Pitch (30 seconds)

Readers fund a **watch-only Bitcoin Signet pool**. Vera never holds spending keys. Deposits are public on mempool.space. Payouts will be PSBTs cosigned by pool owners.

## One-time setup

```bash
# 1) Local Supabase (if not already running)
npm run db:start

# 2) Signet pool address
BITCOIN_NETWORK=signet npm run bitcoin:init

# 3) Point env at Signet (or copy from .env.example)
# BITCOIN_NETWORK=signet
# BITCOIN_POOL_ADDRESS=<from signet/pool.json>
# BITCOIN_MEMPOOL_API=https://mempool.space/signet/api

# 4) Sync + app
npm run bitcoin:sync   # with BITCOIN_NETWORK=signet
npm run dev
```

Open **http://localhost:4174/fund** (or whichever port Next prints).

## How to test the demo

### A. Happy path (on-chain contribute)

1. Open `/fund` — confirm network says **Bitcoin Signet** and **watch-only**.
2. Click **Pay with Bitcoin** → QR + `tb1q…` address.
3. Get coins (no signup): [Alt Signet Faucet](https://signet257.bublina.eu.org/) — paste the pool `tb1q…` address. (`signetfaucet.com` currently shows an unrelated login page; skip it.)
4. Send the requested sats to the pool address (Sparrow Signet, mempool Signet faucet, etc.).
5. Wait ~15s (page polls) or run:
   ```bash
   BITCOIN_NETWORK=signet npm run bitcoin:sync
   ```
6. Confirm:
   - Balance ticks up
   - **Recent UTXOs** lists the tx with a mempool.space link
   - Explorer shows the same deposit

### B. Transparency talking points

- Expand nothing under Advanced unless asked — fiat is demoted.
- Point at trust bullets: watch-only, public txs, cosigned payouts roadmap.
- Click a UTXO → prove it on-chain live.

### C. Chat — “I funded this epoch”

```bash
npm run db:seed-payout   # if no epoch yet
npm run db:seed-chat     # demo deposit sender + media hits
```

1. Open `/chat`
2. Paste demo address: `tb1qdem0c0ntr1but0rvera0000000000000`
3. Click **Follow** — brief shows your deposit + pseudonym payouts
4. Try prompts: “Did I fund this epoch?”, “Which outlets reused reporting?”
5. Click **Refresh NPR + BBC Mundo** (or `npm run media:sync`) to pull live RSS into `media_hits`

Optional local model (Maple / Ollama):

```bash
# Ollama example
ollama pull llama3.2
# .env.local
# OLLAMA_BASE_URL=http://127.0.0.1:11434
# OLLAMA_MODEL=llama3.2
#
# Or Maple-compatible OpenAI endpoint:
# MAPLE_BASE_URL=http://127.0.0.1:8080
# MAPLE_MODEL=maple
```

Without a local model, Chat still answers from grounded templates over payout + media caches.

## Demo checklist

- [ ] Signet address in UI (`tb1q…`)
- [ ] Pay with Bitcoin is the primary orange button
- [ ] After a faucet send, deposits update
- [ ] `/chat` Follow shows funded epoch + journalist aliases
- [ ] Media refresh pulls NPR + BBC Mundo (or seed fixtures)
- [ ] Prompt answers show `ollama` / `maple` / `template` meta

Real deposits: after faucet → `/fund` pay → `BITCOIN_NETWORK=signet npm run bitcoin:sync`, paste the **sending** wallet address (sync stores `sender_address` from the tx).

Note: Reuters and Efecto Cocuyo block automated bots (401/403), so the hackathon allowlist is **NPR (US)** + **BBC Mundo (Spanish LatAm / VE coverage)**.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Shows `bc1q…` mainnet | Set `BITCOIN_NETWORK=signet` in `.env.local` and restart Next |
| Balance stuck at 0 | Confirm tx on Signet explorer; run `bitcoin:sync`; wait for poll |
| Wallet won't pay | Must be a **Signet** wallet, not mainnet |
| API 503 | Run `BITCOIN_NETWORK=signet npm run bitcoin:init` |
| Chat can't find my address | Sync after deposit; sender comes from tx inputs. Or use `npm run db:seed-chat` |
