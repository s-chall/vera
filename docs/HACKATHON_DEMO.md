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

### C. Optional Advanced fiat

Only if you configured MoonPay/Stripe keys. Not required for Bitcoin judges.

## Demo checklist

- [ ] Signet address in UI (`tb1q…`)
- [ ] Faucet link visible
- [ ] Pay with Bitcoin is the primary orange button
- [ ] Advanced fiat is collapsed
- [ ] After a faucet send, UTXO list updates

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Shows `bc1q…` mainnet | Set `BITCOIN_NETWORK=signet` in `.env.local` and restart Next |
| Balance stuck at 0 | Confirm tx on Signet explorer; run `bitcoin:sync`; wait for poll |
| Wallet won't pay | Must be a **Signet** wallet, not mainnet |
| API 503 | Run `BITCOIN_NETWORK=signet npm run bitcoin:init` |
