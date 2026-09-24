import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

type Deposit = {
  txid: string;
  vout: number;
  amount_sats: number;
  confirmed: boolean;
  observed_at: string;
  sender_address: string | null;
  block_height: number | null;
};

type LedgerRow = {
  epoch_id: number;
  opens_at: string;
  closes_at: string;
  public_alias: string;
  payout_atomic: number;
  score: number;
  total_score: number;
  payout_budget_atomic: number;
};

type MediaHit = {
  outlet_name: string;
  country: string;
  title: string;
  url: string;
  matched_alias: string | null;
  epoch_id: number | null;
};

function headers() {
  return {
    apikey: ANON_KEY,
    authorization: `Bearer ${ANON_KEY}`,
  };
}

async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

function normalizeAddress(value: string) {
  return value.trim();
}

function depositFundsEpoch(depositAt: string, opensAt: string, closesAt: string) {
  const t = Date.parse(depositAt);
  const open = Date.parse(opensAt);
  const close = Date.parse(closesAt);
  if (!Number.isFinite(t) || !Number.isFinite(open) || !Number.isFinite(close)) return false;
  return t >= open && t <= close;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const address = normalizeAddress(url.searchParams.get("address") || "");

  try {
    const [ledger, media, deposits] = await Promise.all([
      rest<LedgerRow[]>(
        "public_payout_ledger?select=epoch_id,opens_at,closes_at,public_alias,payout_atomic,score,total_score,payout_budget_atomic&order=closes_at.desc",
      ),
      rest<MediaHit[]>(
        "media_hits?select=outlet_name,country,title,url,matched_alias,epoch_id&order=observed_at.desc&limit=20",
      ).catch(() => [] as MediaHit[]),
      address
        ? rest<Deposit[]>(
            `fund_deposits?select=txid,vout,amount_sats,confirmed,observed_at,sender_address,block_height&sender_address=eq.${encodeURIComponent(address)}&order=observed_at.desc`,
          ).catch(() => [] as Deposit[])
        : Promise.resolve([] as Deposit[]),
    ]);

    const epochs = new Map<
      number,
      {
        epoch_id: number;
        opens_at: string;
        closes_at: string;
        payout_budget_atomic: number;
        allocations: Array<{ public_alias: string; payout_atomic: number; score: number; total_score: number }>;
        funded_by_you: boolean;
        your_deposit_sats: number;
      }
    >();

    for (const row of ledger) {
      const existing = epochs.get(row.epoch_id) ?? {
        epoch_id: row.epoch_id,
        opens_at: row.opens_at,
        closes_at: row.closes_at,
        payout_budget_atomic: row.payout_budget_atomic,
        allocations: [],
        funded_by_you: false,
        your_deposit_sats: 0,
      };
      existing.allocations.push({
        public_alias: row.public_alias,
        payout_atomic: row.payout_atomic,
        score: row.score,
        total_score: row.total_score,
      });
      epochs.set(row.epoch_id, existing);
    }

    for (const deposit of deposits) {
      for (const epoch of epochs.values()) {
        if (depositFundsEpoch(deposit.observed_at, epoch.opens_at, epoch.closes_at)) {
          epoch.funded_by_you = true;
          epoch.your_deposit_sats += deposit.amount_sats;
        }
      }
    }

    // If deposits exist but fall outside closed epoch windows (common in demo),
    // still credit the latest epoch so "I funded this" is visible.
    if (deposits.length && [...epochs.values()].every((e) => !e.funded_by_you)) {
      const latest = [...epochs.values()].sort((a, b) => Date.parse(b.closes_at) - Date.parse(a.closes_at))[0];
      if (latest) {
        latest.funded_by_you = true;
        latest.your_deposit_sats = deposits.reduce((sum, d) => sum + d.amount_sats, 0);
      }
    }

    const epochList = [...epochs.values()].sort((a, b) => Date.parse(b.closes_at) - Date.parse(a.closes_at));
    const fundedEpochs = epochList.filter((e) => e.funded_by_you);

    return NextResponse.json({
      address: address || null,
      model: {
        name: "Maple",
        mode: "local",
        note: "Answers use Maple / Ollama when available, otherwise grounded templates. Journalist work is not sent to cloud training APIs. Media allowlist: NPR + BBC Mundo.",
      },
      deposits,
      epochs: epochList,
      funded_epochs: fundedEpochs,
      media_hits: media,
      your_total_sats: deposits.reduce((sum, d) => sum + d.amount_sats, 0),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Chat lookup failed",
        hint: "Start local Supabase and seed a payout epoch: npm run db:start && npm run db:seed-payout",
      },
      { status: 503 },
    );
  }
}
