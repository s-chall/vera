import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export type BitcoinNetwork = "mainnet" | "signet";

export type FundUtxo = {
  txid: string;
  vout: number;
  amount_sats: number;
  confirmed: boolean;
  block_height: number | null;
  explorer_url: string;
};

export type FundSnapshot = {
  network: BitcoinNetwork;
  address: string;
  balance_sats: number;
  confirmed_sats: number;
  unconfirmed_sats: number;
  balance_btc: string;
  approx_usd: string | null;
  tx_count: number;
  explorer_url: string;
  faucet_url: string | null;
  synced_at: string;
  source: string;
  custody: "watch-only";
  utxos: FundUtxo[];
};

/** Hackathon default: Signet. Set BITCOIN_NETWORK=mainnet for production. */
const NETWORK = (process.env.BITCOIN_NETWORK || "signet") as BitcoinNetwork;

const MEMPOOL_BASE =
  process.env.BITCOIN_MEMPOOL_API ||
  (NETWORK === "signet" ? "https://mempool.space/signet/api" : "https://mempool.space/api");

export function getBitcoinNetwork(): BitcoinNetwork {
  return NETWORK === "mainnet" ? "mainnet" : "signet";
}

export function explorerAddressUrl(address: string, network = getBitcoinNetwork()): string {
  return network === "signet"
    ? `https://mempool.space/signet/address/${address}`
    : `https://mempool.space/address/${address}`;
}

export function explorerTxUrl(txid: string, network = getBitcoinNetwork()): string {
  return network === "signet"
    ? `https://mempool.space/signet/tx/${txid}`
    : `https://mempool.space/tx/${txid}`;
}

export function loadPoolAddress(): string {
  if (process.env.BITCOIN_POOL_ADDRESS) return process.env.BITCOIN_POOL_ADDRESS;
  if (process.env.NEXT_PUBLIC_BITCOIN_POOL_ADDRESS) return process.env.NEXT_PUBLIC_BITCOIN_POOL_ADDRESS;
  if (process.env.SIGNET_POOL_ADDRESS) return process.env.SIGNET_POOL_ADDRESS;
  if (process.env.NEXT_PUBLIC_SIGNET_POOL_ADDRESS) return process.env.NEXT_PUBLIC_SIGNET_POOL_ADDRESS;

  const network = getBitcoinNetwork();
  const preferred =
    network === "signet"
      ? ["signet/pool.json", "bitcoin/pool.json"]
      : ["bitcoin/pool.json", "signet/pool.json"];

  for (const relative of preferred) {
    const path = join(process.cwd(), relative);
    if (!existsSync(path)) continue;
    const pool = JSON.parse(readFileSync(path, "utf8")) as { address: string; network?: string };
    if (pool.address && (!pool.network || pool.network === network || relative.startsWith(network))) {
      return pool.address;
    }
    if (pool.address && relative.startsWith(network === "signet" ? "signet" : "bitcoin")) {
      return pool.address;
    }
  }

  // Last resort: any pool.json
  for (const relative of preferred) {
    const path = join(process.cwd(), relative);
    if (!existsSync(path)) continue;
    const pool = JSON.parse(readFileSync(path, "utf8")) as { address: string };
    if (pool.address) return pool.address;
  }

  throw new Error(
    network === "signet"
      ? "Signet pool not initialized. Run: BITCOIN_NETWORK=signet npm run bitcoin:init"
      : "Bitcoin pool not initialized. Run: npm run bitcoin:init",
  );
}

function formatBtc(sats: number): string {
  return (sats / 1e8).toFixed(8).replace(/0+$/, "").replace(/\.$/, "") || "0";
}

export async function fetchBtcUsd(): Promise<number> {
  const hint = Number(process.env.BITCOIN_USD_HINT || process.env.SIGNET_BTC_USD_HINT || "");
  if (Number.isFinite(hint) && hint > 0) return hint;
  try {
    const res = await fetch("https://mempool.space/api/v1/prices", { next: { revalidate: 300 } });
    if (!res.ok) return 100_000;
    const data = (await res.json()) as { USD?: number };
    return data.USD || 100_000;
  } catch {
    return 100_000;
  }
}

function approxUsd(sats: number, btcUsd: number): string {
  const usd = (sats / 1e8) * btcUsd;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: usd >= 100 ? 0 : 2,
  }).format(usd);
}

/** @deprecated use fetchPoolSnapshot */
export async function fetchSignetSnapshot(): Promise<FundSnapshot> {
  return fetchPoolSnapshot();
}

export async function fetchPoolSnapshot(): Promise<FundSnapshot> {
  const network = getBitcoinNetwork();
  const address = loadPoolAddress();
  const [summaryRes, utxoRes, btcUsd] = await Promise.all([
    fetch(`${MEMPOOL_BASE}/address/${address}`, { next: { revalidate: 15 } }),
    fetch(`${MEMPOOL_BASE}/address/${address}/utxo`, { next: { revalidate: 15 } }),
    fetchBtcUsd(),
  ]);
  if (!summaryRes.ok) throw new Error(`Bitcoin watch failed (${summaryRes.status})`);
  if (!utxoRes.ok) throw new Error(`Bitcoin UTXO watch failed (${utxoRes.status})`);

  const summary = (await summaryRes.json()) as {
    chain_stats: { funded_txo_sum: number; spent_txo_sum: number; tx_count: number };
    mempool_stats: { funded_txo_sum: number; spent_txo_sum: number; tx_count: number };
  };
  const rawUtxos = (await utxoRes.json()) as Array<{
    txid: string;
    vout: number;
    value: number;
    status?: { confirmed?: boolean; block_height?: number };
  }>;

  const confirmed = (summary.chain_stats.funded_txo_sum || 0) - (summary.chain_stats.spent_txo_sum || 0);
  const unconfirmed = (summary.mempool_stats.funded_txo_sum || 0) - (summary.mempool_stats.spent_txo_sum || 0);
  const balance = confirmed + unconfirmed;

  const utxos: FundUtxo[] = rawUtxos
    .map((u) => ({
      txid: u.txid,
      vout: u.vout,
      amount_sats: u.value,
      confirmed: Boolean(u.status?.confirmed),
      block_height: u.status?.block_height ?? null,
      explorer_url: explorerTxUrl(u.txid, network),
    }))
    .sort((a, b) => b.amount_sats - a.amount_sats)
    .slice(0, 8);

  return {
    network,
    address,
    balance_sats: balance,
    confirmed_sats: confirmed,
    unconfirmed_sats: unconfirmed,
    balance_btc: formatBtc(balance),
    approx_usd: balance > 0 ? approxUsd(balance, btcUsd) : "$0",
    tx_count: (summary.chain_stats.tx_count || 0) + (summary.mempool_stats.tx_count || 0),
    explorer_url: explorerAddressUrl(address, network),
    faucet_url: network === "signet" ? "https://signet257.bublina.eu.org/" : null,
    synced_at: new Date().toISOString(),
    source: "mempool.space",
    custody: "watch-only",
    utxos,
  };
}
