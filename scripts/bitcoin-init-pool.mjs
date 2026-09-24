#!/usr/bin/env node
/**
 * Initialize the Vera Total Pool Bitcoin address.
 *
 * Default: Signet watch address (tb1q…) for hackathon demos.
 * Production: BITCOIN_NETWORK=mainnet + watch-only multisig.
 *
 * Do NOT spend from a key this script generates in production.
 * Create a multisig in Sparrow/Coldcard, then:
 *   BITCOIN_NETWORK=mainnet BITCOIN_POOL_ADDRESS=bc1q… npm run bitcoin:init -- --watch-only
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as btc from "@scure/btc-signer";
import { hex } from "@scure/base";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const networkName = (process.env.BITCOIN_NETWORK || "signet").toLowerCase() === "mainnet" ? "mainnet" : "signet";
const dir = join(root, networkName === "signet" ? "signet" : "bitcoin");
const publicPath = join(dir, "pool.json");
const keyPath = join(dir, "pool.key.json");
const wifPath = join(dir, "pool.wif");
const watchOnly = process.argv.includes("--watch-only");
const force = process.argv.includes("--force");
const network = networkName === "signet" ? btc.TEST_NETWORK : btc.NETWORK;

mkdirSync(dir, { recursive: true });

if (existsSync(publicPath) && !force) {
  console.log("Pool already initialized:");
  console.log(readFileSync(publicPath, "utf8"));
  console.log("Re-run with --force to replace.");
  process.exit(0);
}

const explorerBase = networkName === "signet" ? "https://mempool.space/signet" : "https://mempool.space";
const mempoolApi = networkName === "signet" ? "https://mempool.space/signet/api" : "https://mempool.space/api";

let address = process.env.BITCOIN_POOL_ADDRESS || process.env.NEXT_PUBLIC_BITCOIN_POOL_ADDRESS || "";
let wroteKey = false;

if (watchOnly) {
  if (!address) {
    console.error("Watch-only mode requires BITCOIN_POOL_ADDRESS=bc1q…");
    process.exit(1);
  }
  if (!address.startsWith("bc1") && networkName === "mainnet") {
    console.error("Mainnet addresses should start with bc1 (native segwit).");
    process.exit(1);
  }
} else if (!address) {
  const priv = btc.utils.randomPrivateKeyBytes();
  address = btc.getAddress("wpkh", priv, network);
  const wif = btc.WIF(network).encode(priv);
  writeFileSync(
    keyPath,
    JSON.stringify(
      {
        network: networkName,
        address,
        privateKeyHex: hex.encode(priv),
        warning:
          "HOT KEY — for local smoke tests only. Do not fund with meaningful amounts. Production pool must be multisig watch-only.",
      },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(wifPath, `${wif}\n`);
  wroteKey = true;
}

const pool = {
  network: networkName,
  address,
  scriptType: "wpkh",
  custody: watchOnly ? "watch-only-external" : "local-dev-key",
  createdAt: new Date().toISOString(),
  explorerUrl: `${explorerBase}/address/${address}`,
  watch: {
    mempoolApi: `${mempoolApi}/address/${address}`,
  },
};

writeFileSync(publicPath, JSON.stringify(pool, null, 2) + "\n");

console.log(`Created ${networkName} pool address:`);
console.log(`  ${address}`);
console.log(`  Public:  ${publicPath}`);
if (wroteKey) {
  console.log(`  Secret:  ${keyPath} + ${wifPath} (gitignored)`);
  console.log("  WARNING: local hot key. Use --watch-only + multisig address before real funds.");
} else {
  console.log("  Mode:    watch-only (no spending key in this repo)");
}
console.log(`  Explorer: ${pool.explorerUrl}`);
