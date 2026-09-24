#!/usr/bin/env node
/**
 * Generate a Signet watch address for the Vera Total Pool.
 * Writes public pool.json and gitignored key material.
 *
 * Signet uses the same bech32 HRP as testnet (tb1…).
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as btc from "@scure/btc-signer";
import { hex } from "@scure/base";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "signet");
const publicPath = join(dir, "pool.json");
const keyPath = join(dir, "pool.key.json");
const wifPath = join(dir, "pool.wif");

mkdirSync(dir, { recursive: true });

if (existsSync(publicPath) && !process.argv.includes("--force")) {
  const existing = JSON.parse(readFileSync(publicPath, "utf8"));
  console.log("Pool already initialized:");
  console.log(JSON.stringify(existing, null, 2));
  console.log("\nRe-run with --force to generate a new address.");
  process.exit(0);
}

const priv = btc.utils.randomPrivateKeyBytes();
const address = btc.getAddress("wpkh", priv, btc.TEST_NETWORK);
const wif = btc.WIF(btc.TEST_NETWORK).encode(priv);

const pool = {
  network: "signet",
  address,
  scriptType: "wpkh",
  createdAt: new Date().toISOString(),
  explorerUrl: `https://mempool.space/signet/address/${address}`,
  faucetHint: "https://signet257.bublina.eu.org/",
  watch: {
    mempoolApi: `https://mempool.space/signet/api/address/${address}`,
  },
};

writeFileSync(publicPath, JSON.stringify(pool, null, 2) + "\n");
writeFileSync(
  keyPath,
  JSON.stringify(
    {
      network: "signet",
      address,
      privateKeyHex: hex.encode(priv),
      warning: "DEV ONLY — never commit. Watching the pool does not require this file.",
    },
    null,
    2,
  ) + "\n",
);
writeFileSync(wifPath, `${wif}\n`);

console.log("Created Signet pool address:");
console.log(`  ${address}`);
console.log(`  Public:   signet/pool.json`);
console.log(`  Secret:   signet/pool.key.json + signet/pool.wif (gitignored)`);
console.log(`  Explorer: ${pool.explorerUrl}`);
console.log(`  Faucet:   ${pool.faucetHint}`);
