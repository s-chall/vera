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

## Deployment

1. Create a Supabase project and apply `supabase/migrations/202609240001_payout_engine.sql`.
2. Deploy `supabase/functions/finalize-payout` and configure its secrets.
3. Insert the first 14-day row into `payout_epochs`. The worker creates each subsequent epoch automatically with the same formula version.
4. Schedule an authenticated `POST` to the function shortly after each `closes_at`.
5. Configure a chain indexer to insert finalized contract receipts into `chain_events` and change an epoch from `submitted` to `settled` only after the required confirmations.

Run `supabase/tests/payout_engine.sql` against a disposable local Supabase database after applying the migration. It checks the view/like weighting, exact one-sixth budget, proportional allocations, and finalization retry behavior.

Before production, the external contract and adapter need independent security review. Public wallet addresses provide pseudonymity, not guaranteed anonymity.
