import { NextResponse } from "next/server";
import { fetchPoolSnapshot } from "@/lib/fund/bitcoin";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

export async function GET() {
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
            balance_sats: 0,
            confirmed_sats: 0,
            unconfirmed_sats: 0,
            balance_btc: "0",
            approx_usd: "$0",
            source: "admin-payout-reset",
            utxos: [],
          });
        }
      }
    } catch {
      // Fall through to live chain snapshot.
    }

    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to watch Bitcoin pool" },
      { status: 503 },
    );
  }
}
