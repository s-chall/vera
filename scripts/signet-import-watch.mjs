#!/usr/bin/env node
/**
 * Import the pool address into local bitcoind as watch-only (descriptor wallet).
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const poolPath = join(root, "signet/pool.json");
if (!existsSync(poolPath)) {
  console.error("Run npm run signet:init first");
  process.exit(1);
}
const { address } = JSON.parse(readFileSync(poolPath, "utf8"));

function cli(...args) {
  return execFileSync(
    "docker",
    ["exec", "vera-bitcoind-signet", "bitcoin-cli", "-signet", "-rpcuser=vera", "-rpcpassword=vera", ...args],
    { encoding: "utf8" },
  );
}

try {
  cli("-rpcwallet=vera_pool", "getwalletinfo");
} catch {
  cli("createwallet", "vera_pool", "true", "false", "", "false", "true");
}

const info = JSON.parse(cli("getdescriptorinfo", `addr(${address})`));
const result = JSON.parse(
  cli(
    "-rpcwallet=vera_pool",
    "importdescriptors",
    JSON.stringify([{ desc: info.descriptor, timestamp: 0, watchonly: true, active: false, label: "total_pool" }]),
  ),
);
console.log(JSON.stringify({ address, result }, null, 2));
