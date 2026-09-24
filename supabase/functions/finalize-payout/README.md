# Finalize payout function

Run this authenticated function on a biweekly schedule after an epoch closes. It:

1. Reads the stablecoin pool balance from the external contract adapter.
2. Calls the transactional `finalize_payout_epoch` database function.
3. Builds a deterministic public allocation manifest.
4. Submits it to the external contract adapter with an epoch idempotency key.
5. Stores the transaction hash and public manifest references.

Required secrets:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
CRON_SECRET
PAYOUT_CONTRACT_ADAPTER_URL
PAYOUT_CONTRACT_ADAPTER_TOKEN
```

The adapter must implement:

- `GET /pool-balance` → `{ "balanceAtomic": "600000000" }`
- `POST /epochs` accepting `idempotencyKey`, `epochId`, `manifest`, and `manifestHash`
- `POST /epochs` → `{ "txHash": "0x…", "manifestUri": "ipfs://…", "allocationRoot": "0x…" }`

The adapter must return the same result when an idempotency key is retried. It owns chain-specific signing, ABI validation, finality monitoring, and contract interaction; no signing key is stored in Vera or Supabase.
