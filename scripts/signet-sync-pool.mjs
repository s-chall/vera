#!/usr/bin/env node
/**
 * Sync Signet pool balance + UTXOs into Supabase (or print JSON if DB unavailable).
 * Default watcher: mempool.space Signet API (no local IBD required).
 * Optional: BITCOIN_RPC_URL=http://vera:vera@127.0.0.1:38332
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const poolPath = join(root, "signet/pool.json");
const MEMPOOL = process.env.SIGNET_MEMPOOL_API || "https://mempool.space/signet/api";
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

if (!existsSync(poolPath)) {
  console.error("Missing signet/pool.json — run: npm run signet:init");
  process.exit(1);
}

const pool = JSON.parse(readFileSync(poolPath, "utf8"));
const address = process.env.SIGNET_POOL_ADDRESS || pool.address;

async function fetchMempool() {
  const [summaryRes, utxoRes] = await Promise.all([
    fetch(`${MEMPOOL}/address/${address}`),
    fetch(`${MEMPOOL}/address/${address}/utxo`),
  ]);
  if (!summaryRes.ok) throw new Error(`mempool address ${summaryRes.status}: ${await summaryRes.text()}`);
  if (!utxoRes.ok) throw new Error(`mempool utxo ${utxoRes.status}: ${await utxoRes.text()}`);
  const summary = await summaryRes.json();
  const utxos = await utxoRes.json();

  const chain = summary.chain_stats || {};
  const mempool = summary.mempool_stats || {};
  const confirmed = (chain.funded_txo_sum || 0) - (chain.spent_txo_sum || 0);
  const unconfirmed = (mempool.funded_txo_sum || 0) - (mempool.spent_txo_sum || 0);

  return {
    address,
    network: "signet",
    confirmed_sats: confirmed,
    unconfirmed_sats: unconfirmed,
    balance_sats: confirmed + unconfirmed,
    tx_count: (chain.tx_count || 0) + (mempool.tx_count || 0),
    utxos: utxos.map((u) => ({
      txid: u.txid,
      vout: u.vout,
      amount_sats: u.value,
      confirmed: Boolean(u.status?.confirmed),
      block_height: u.status?.block_height ?? null,
    })),
    synced_at: new Date().toISOString(),
    source: "mempool.space",
  };
}

async function upsertSupabase(snapshot) {
  const headers = {
    apikey: SERVICE_KEY,
    authorization: `Bearer ${SERVICE_KEY}`,
    "content-type": "application/json",
    prefer: "resolution=merge-duplicates,return=representation",
  };

  const poolRes = await fetch(`${SUPABASE_URL}/rest/v1/fund_pool`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: 1,
      network: snapshot.network,
      address: snapshot.address,
      balance_sats: snapshot.balance_sats,
      confirmed_sats: snapshot.confirmed_sats,
      unconfirmed_sats: snapshot.unconfirmed_sats,
      tx_count: snapshot.tx_count,
      synced_at: snapshot.synced_at,
      watch_source: snapshot.source,
    }),
  });
  if (!poolRes.ok) throw new Error(`fund_pool upsert ${poolRes.status}: ${await poolRes.text()}`);

  if (snapshot.utxos.length) {
    const depRes = await fetch(`${SUPABASE_URL}/rest/v1/fund_deposits`, {
      method: "POST",
      headers,
      body: JSON.stringify(
        snapshot.utxos.map((u) => ({
          txid: u.txid,
          vout: u.vout,
          amount_sats: u.amount_sats,
          confirmed: u.confirmed,
          block_height: u.block_height,
          address: snapshot.address,
        })),
      ),
    });
    if (!depRes.ok) throw new Error(`fund_deposits upsert ${depRes.status}: ${await depRes.text()}`);
  }

  return true;
}

const snapshot = await fetchMempool();
console.log(JSON.stringify(snapshot, null, 2));

try {
  await upsertSupabase(snapshot);
  console.log("\nSynced to Supabase fund_pool / fund_deposits");
} catch (error) {
  console.warn("\nSupabase sync skipped:", error instanceof Error ? error.message : error);
  console.warn("Apply migration 20260924180000_fund_pool.sql and ensure supabase is running.");
}
