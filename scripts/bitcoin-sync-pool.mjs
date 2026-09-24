#!/usr/bin/env node
/**
 * Sync Bitcoin pool balance + UTXOs into Supabase.
 * Uses mempool.space (Signet by default; BITCOIN_NETWORK=mainnet for production).
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const network = (process.env.BITCOIN_NETWORK || "signet").toLowerCase() === "mainnet" ? "mainnet" : "signet";
const poolPathCandidates = [
  join(root, network === "signet" ? "signet/pool.json" : "bitcoin/pool.json"),
  join(root, "bitcoin/pool.json"),
  join(root, "signet/pool.json"),
];
const poolPath = poolPathCandidates.find((p) => existsSync(p));
const MEMPOOL =
  process.env.BITCOIN_MEMPOOL_API ||
  (network === "signet" ? "https://mempool.space/signet/api" : "https://mempool.space/api");
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

if (!poolPath) {
  console.error("Missing bitcoin/pool.json — run: npm run bitcoin:init");
  process.exit(1);
}

const pool = JSON.parse(readFileSync(poolPath, "utf8"));
const address = process.env.BITCOIN_POOL_ADDRESS || pool.address;

async function resolveSender(txid: string) {
  try {
    const res = await fetch(`${MEMPOOL}/tx/${txid}`);
    if (!res.ok) return null;
    const tx = await res.json();
    const vins = Array.isArray(tx.vin) ? tx.vin : [];
    for (const vin of vins) {
      const addr = vin?.prevout?.scriptpubkey_address;
      if (typeof addr === "string" && addr.length > 0) return addr;
    }
  } catch {
    // Sender resolution is best-effort for Chat transparency.
  }
  return null;
}

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
  const mem = summary.mempool_stats || {};
  const confirmed = (chain.funded_txo_sum || 0) - (chain.spent_txo_sum || 0);
  const unconfirmed = (mem.funded_txo_sum || 0) - (mem.spent_txo_sum || 0);

  const mapped = [];
  for (const u of utxos) {
    const sender_address = await resolveSender(u.txid);
    mapped.push({
      txid: u.txid,
      vout: u.vout,
      amount_sats: u.value,
      confirmed: Boolean(u.status?.confirmed),
      block_height: u.status?.block_height ?? null,
      sender_address,
    });
  }

  return {
    address,
    network: pool.network || network,
    confirmed_sats: confirmed,
    unconfirmed_sats: unconfirmed,
    balance_sats: confirmed + unconfirmed,
    tx_count: (chain.tx_count || 0) + (mem.tx_count || 0),
    utxos: mapped,
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
          sender_address: u.sender_address,
        })),
      ),
    });
    if (!depRes.ok) throw new Error(`fund_deposits upsert ${depRes.status}: ${await depRes.text()}`);
  }
}

const snapshot = await fetchMempool();
console.log(JSON.stringify(snapshot, null, 2));
try {
  await upsertSupabase(snapshot);
  console.log("\nSynced to Supabase fund_pool / fund_deposits");
} catch (error) {
  console.warn("\nSupabase sync skipped:", error instanceof Error ? error.message : error);
}
