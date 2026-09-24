# Vera payout backend

Vera records qualified engagement and automatically creates a payout batch every 14 days. The external public contract holds funds and performs transfers; this repository does not contain the contract or a signing key.

## Formula

```text
article score    = qualified views + (4 × qualified likes)
journalist score = sum(article scores)
epoch budget     = floor(pool balance at close / 6)
payout           = floor(epoch budget × journalist score / total eligible score)
```

All token values are atomic integer units. Rounding dust remains in the pool. If an epoch has no qualified engagement, no allocation is submitted.

## Trust boundaries

- Clients never mark their own events as qualified and cannot call epoch finalization.
- A separate ingestion service should hash a stable, pseudonymous audience key and qualify events after read-time, scroll-depth, rate-limit, self-interaction, and abuse checks.
- The database freezes aggregates and allocations transactionally under an advisory lock.
- The contract adapter revalidates the manifest, publishes it, and submits it to the configured public contract.
- `vera-epoch-{id}` is the cross-system idempotency key. The contract must also reject an epoch that has already been paid.

## Local payout backend

Prerequisites: Docker (Docker Desktop or Colima), [Supabase CLI](https://supabase.com/docs/guides/cli), and Node.

```bash
# 1) Boot local Supabase (applies supabase/migrations/*)
npm run db:start

# 2) Prove the formula in Postgres
npm run db:test

# 3) Mock the external contract adapter (separate terminal)
npm run mock:adapter

# 4) Seed one closed open epoch with sample engagement
npm run db:seed-payout

# 5) Serve the edge function (separate terminal)
#    Copy adapter secrets into supabase/.env.local first — see .env.example
cp .env.example supabase/.env.local   # then keep only the adapter/cron lines
npm run functions:serve

# 6) Finalize the due epoch
curl -X POST 'http://127.0.0.1:54321/functions/v1/finalize-payout' \
  -H 'Authorization: Bearer local-cron-secret' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Expected curl result: `{"ok":true,"epochId":…,"txHash":"0x…"}`. The epoch moves to `submitted`, allocations land in `public_payout_ledger`, and the next 14-day `open` epoch is created.

Useful URLs after `db:start`:

| Service | URL |
|---------|-----|
| API | http://127.0.0.1:54321 |
| Studio | http://127.0.0.1:54323 |
| DB | postgresql://postgres:postgres@127.0.0.1:54322/postgres |

If Docker Desktop fails to start, Colima works: `colima start`, then `docker context use colima`.

## Bitcoin Total Pool (fund)

`/fund` is **Signet-first** for Bitcoin hackathon demos (watch-only + on-chain transparency). See [docs/HACKATHON_DEMO.md](docs/HACKATHON_DEMO.md).

```bash
BITCOIN_NETWORK=signet npm run bitcoin:init
BITCOIN_NETWORK=signet npm run bitcoin:sync
npm run dev   # open /fund
```

Primary path: BIP21 / QR on Signet. Fiat on-ramps stay under **Advanced**. Production mainnet: `BITCOIN_NETWORK=mainnet` + watch-only multisig address.

## Deployment

1. Create a Supabase project and apply `supabase/migrations/202609240001_payout_engine.sql`.
2. Deploy `supabase/functions/finalize-payout` and configure its secrets.
3. Insert the first 14-day row into `payout_epochs`. The worker creates each subsequent epoch automatically with the same formula version.
4. Schedule an authenticated `POST` to the function shortly after each `closes_at`.
5. Configure a chain indexer to insert finalized contract receipts into `chain_events` and change an epoch from `submitted` to `settled` only after the required confirmations.

Run `supabase/tests/payout_engine.sql` against a disposable local Supabase database after applying the migration. It checks the view/like weighting, exact one-sixth budget, proportional allocations, and finalization retry behavior.

Before production, the external contract and adapter need independent security review. Public wallet addresses provide pseudonymity, not guaranteed anonymity.
