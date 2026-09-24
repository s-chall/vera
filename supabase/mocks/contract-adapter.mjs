#!/usr/bin/env node
/**
 * Local mock for PAYOUT_CONTRACT_ADAPTER_URL.
 * Implements the endpoints expected by finalize-payout.
 *
 *   GET  /pool-balance → { balanceAtomic }
 *   POST /epochs       → { txHash, manifestUri, allocationRoot } (idempotent by key)
 */
import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 8787);
const TOKEN = process.env.PAYOUT_CONTRACT_ADAPTER_TOKEN || "local-adapter-token";
const POOL_BALANCE = process.env.POOL_BALANCE_ATOMIC || "600000000";

/** @type {Map<string, { txHash: string, manifestUri: string, allocationRoot: string }>} */
const submissions = new Map();

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function unauthorized(res) {
  send(res, 401, { error: "Unauthorized" });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${TOKEN}`) return unauthorized(res);

  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);

  if (req.method === "GET" && url.pathname === "/pool-balance") {
    return send(res, 200, { balanceAtomic: POOL_BALANCE });
  }

  if (req.method === "POST" && url.pathname === "/epochs") {
    const raw = await readBody(req);
    let body;
    try {
      body = JSON.parse(raw || "{}");
    } catch {
      return send(res, 400, { error: "Invalid JSON" });
    }

    const key = body.idempotencyKey;
    if (!key || typeof key !== "string") {
      return send(res, 400, { error: "idempotencyKey required" });
    }

    const existing = submissions.get(key);
    if (existing) return send(res, 200, existing);

    const digest = crypto.createHash("sha256").update(key).digest("hex");
    const result = {
      txHash: `0x${digest.slice(0, 64)}`,
      manifestUri: `mock://manifests/${body.epochId ?? "unknown"}`,
      allocationRoot: `0x${digest.slice(0, 64)}`,
    };
    submissions.set(key, result);
    return send(res, 200, result);
  }

  return send(res, 404, { error: "Not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Mock payout contract adapter on http://127.0.0.1:${PORT}`);
  console.log(`Auth: Bearer ${TOKEN}`);
});
