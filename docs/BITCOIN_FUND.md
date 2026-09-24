# Bitcoin Total Pool — financial deployment

## Why Signet felt broken

Most phone/desktop wallets only speak **Bitcoin mainnet**. A Signet `tb1q…` invoice cannot be paid from a normal wallet, so Donate looked broken even when the app was correct.

Vera’s fund rail is now **mainnet by default**.

## What “deployable with real money” means

```text
Donors pay bc1q… pool address (any Bitcoin wallet)
        ↓
Vera watches chain (mempool API / node) — NO spending keys on the server
        ↓
Postgres records deposits + epoch scores
        ↓
Backend builds a payout PSBT (batch to journalists)
        ↓
Pool owners co-sign (2-of-3 hardware multisig)
        ↓
Broadcast → transparent explorer + public ledger
```

### Custody (non-negotiable for production)

| Do | Don’t |
|----|--------|
| 2-of-3 (or 2-of-2) **hardware multisig** (Sparrow + Coldcard/Ledger) | Store a mainnet private key on Vercel/Supabase |
| Import **watch-only** address/xpub into Vera | Let the web app broadcast spends |
| Keep seed phrases offline | Commit `pool.wif` / `pool.key.json` |

```bash
# Production: you create the multisig elsewhere, then:
BITCOIN_POOL_ADDRESS=bc1q… npm run bitcoin:init -- --watch-only
```

The local `npm run bitcoin:init` hot key is for **smoke tests only**. Move any test dust out; never put meaningful BTC on it.

### Money flows (who gets what)

1. **Donor → Total Pool** — restricted reporting pool (fiduciary-style), not Vera revenue.
2. **Pool → journalists** — biweekly formula (views + 4×likes, 1/6 budget) via signed PSBT.
3. **Vera company** — funded separately (SaaS fee, grants, % disclosed to donors if ever taken from pool).

Mixing ops cash into the donor pool without disclosure breaks trust and can create legal risk.

### Costs to run

- Hosting: Next.js + Supabase (normal SaaS bill)
- Chain watch: free public mempool API at low volume; self-host Electrs/mempool at scale
- On-chain fees: paid from pool (or separately) when broadcasting payout batches
- Multisig ops: hardware wallets (~one-time), signer coordination

### Legal / compliance (high level, not advice)

- Donor communications should say funds support **reader-funded reporting**, not investment returns.
- Journalist payouts may be taxable income to recipients.
- Depending on jurisdiction: money-transmitter, charity, or “software + multisig” framing — get counsel before taking public mainnet donations at scale.
- Publish the pool address, policy, and payout ledger (transparency slice).

### Easy pay (Apple Pay / card)

Apple Pay cannot put BTC on-chain by itself. Use an on-ramp:

1. **MoonPay / Ramp (recommended)** — user pays with Apple Pay or card; BTC is delivered to `BITCOIN_POOL_ADDRESS`.
2. **Stripe Checkout** — Apple Pay / card; USD to your Stripe balance; you sweep BTC into the pool (or treat as USD donation).

```bash
# .env.local
NEXT_PUBLIC_MOONPAY_API_KEY=pk_test_…
# or
STRIPE_SECRET_KEY=sk_test_…
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

UI: **Pay with Apple Pay or card** → `/api/fund/easy-pay`. **Pay with Bitcoin wallet** stays for native BTC.

### Rollout stages

1. **Now** — mainnet watch + donate invoice (QR / BIP21). App never signs.
2. **Next** — public deposit ledger UI.
3. **Then** — PSBT builder from epoch allocations + owner cosign workflow.
4. **Later** — optional Lightning receive (still settles to same cold pool).

## Commands

```bash
npm run bitcoin:init    # mainnet bc1q… (or --watch-only with BITCOIN_POOL_ADDRESS)
npm run bitcoin:sync    # balance → fund_pool
BITCOIN_NETWORK=signet npm run bitcoin:init -- --force   # optional testnet-style Signet
```

Env (see `.env.example`):

```text
BITCOIN_NETWORK=mainnet
BITCOIN_POOL_ADDRESS=bc1q…
NEXT_PUBLIC_BITCOIN_POOL_ADDRESS=bc1q…
BITCOIN_MEMPOOL_API=https://mempool.space/api
```
