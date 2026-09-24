# Signet Total Pool

Vera’s fund page watches a Bitcoin **Signet** pool address.

## Quick start

```bash
npm run signet:init          # creates signet/pool.json (+ gitignored keys)
npm run signet:sync          # pulls balance/UTXOs from mempool.space → Supabase
npm run signet:up            # optional local bitcoind (IBD can take a while)
npm run signet:import-watch  # import pool address watch-only into local bitcoind
npm run dev                  # /fund shows live watched balance
```

Pool address (public): see `pool.json`.

Fund it from a faucet: https://signet257.bublina.eu.org/  
Explorer: https://mempool.space/signet/address/<address>

## Watch model

- **Primary watcher:** `mempool.space` Signet API (no full node sync required).
- **Optional node:** `docker-compose.signet.yml` runs `bitcoind -signet` with the pool address imported watch-only.
- Private key stays in `pool.key.json` / `pool.wif` for local faucet testing only — never commit. Payout multisig comes later.

## API

- `GET /api/fund` — live pool snapshot
- `POST /api/fund/contribute` — `{ amount_sats, anonymous }` → Signet invoice address + BIP21 URI
