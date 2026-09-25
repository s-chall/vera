import { NextResponse } from "next/server";
import { explorerAddressUrl, fetchPoolSnapshot, loadPoolAddress } from "@/lib/fund/bitcoin";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

export async function GET() {
  let internalSats = 0;
  try {
    const internalRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/internal_pool_balance`, {
      method: "POST",
      headers: { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}`, "content-type": "application/json" },
      body: "{}",
      cache: "no-store",
    });
    if (internalRes.ok) internalSats = Number(await internalRes.json()) || 0;
  } catch { /* the on-chain balance can still render */ }

  try {
    const snapshot = await fetchPoolSnapshot();

    // After an admin payout, show the reset ledger balance until the next real sync.
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/fund_pool?id=eq.1&select=balance_sats,watch_source`, {
        headers: { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` },
        cache: "no-store",
      });
      if (res.ok) {
        const rows = (await res.json()) as Array<{ balance_sats: number; watch_source: string | null }>;
        const row = rows[0];
        if (row?.watch_source === "admin-payout-reset" && row.balance_sats === 0) {
          return NextResponse.json({
            ...snapshot,
            balance_sats: internalSats,
            confirmed_sats: 0,
            unconfirmed_sats: 0,
            balance_btc: (internalSats / 1e8).toFixed(8).replace(/0+$/, "").replace(/\.$/, "") || "0",
            approx_usd: null,
            source: "admin-payout-reset",
            internal_sats: internalSats,
            utxos: [],
          });
        }
      }
    } catch {
      // Fall through to live chain snapshot.
    }

    const balance = snapshot.balance_sats + internalSats;
    return NextResponse.json({
      ...snapshot,
      balance_sats: balance,
      balance_btc: (balance / 1e8).toFixed(8).replace(/0+$/, "").replace(/\.$/, "") || "0",
      internal_sats: internalSats,
    });
  } catch (error) {
    if (internalSats > 0) {
      const address = loadPoolAddress();
      return NextResponse.json({
        address,
        balance_sats: internalSats,
        confirmed_sats: 0,
        unconfirmed_sats: 0,
        balance_btc: (internalSats / 1e8).toFixed(8).replace(/0+$/, "").replace(/\.$/, "") || "0",
        approx_usd: null,
        explorer_url: explorerAddressUrl(address, "signet"),
        faucet_url: null,
        network: "signet",
        synced_at: new Date().toISOString(),
        source: "internal-demo",
        custody: "internal-demo",
        tx_count: 0,
        utxos: [],
        internal_sats: internalSats,
      });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to watch Bitcoin pool" },
      { status: 503 },
    );
  }
}
