import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { explorerAddressUrl, getBitcoinNetwork, loadPoolAddress } from "@/lib/fund/bitcoin";

export const dynamic = "force-dynamic";

type Body = {
  amount_sats?: number;
  anonymous?: boolean;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const amount = Number(body.amount_sats);
  if (!Number.isInteger(amount) || amount < 1_000) {
    return NextResponse.json({ error: "amount_sats must be an integer >= 1000" }, { status: 400 });
  }

  try {
    const network = getBitcoinNetwork();
    const address = loadPoolAddress();
    const anonymous = body.anonymous !== false;
    const uri = `bitcoin:${address}?amount=${(amount / 1e8).toFixed(8)}&label=Vera%20Total%20Pool`;
    const qr_data_url = await QRCode.toDataURL(uri, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 280,
      color: { dark: "#15202a", light: "#ffffff" },
    });

    let intent_id: string | undefined;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
    try {
      const intentRes = await fetch(`${supabaseUrl}/rest/v1/fund_contribution_intents`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          authorization: `Bearer ${anonKey}`,
          "content-type": "application/json",
          prefer: "return=representation",
        },
        body: JSON.stringify({ amount_sats: amount, anonymous, address, status: "pending" }),
      });
      if (intentRes.ok) {
        const rows = (await intentRes.json()) as Array<{ id: string }>;
        intent_id = rows[0]?.id;
      }
    } catch {
      // Intent logging is best-effort.
    }

    return NextResponse.json({
      network,
      address,
      amount_sats: amount,
      anonymous,
      bitcoin_uri: uri,
      qr_data_url,
      intent_id,
      explorer_url: explorerAddressUrl(address, network),
      instructions:
        network === "mainnet"
          ? "Send real Bitcoin to this address. Scan the QR or open your wallet; the watcher detects the UTXO after broadcast."
          : "Send Signet Bitcoin to this address. Scan the QR or open a Signet wallet.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Pool address unavailable" },
      { status: 503 },
    );
  }
}
