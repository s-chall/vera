import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SECRET_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ADMIN_SECRET = process.env.ADMIN_PAYOUT_SECRET || "local-admin-payout";

type ScoreRow = {
  journalist_id: string;
  public_alias: string;
  payout_address: string | null;
  score: number;
};

function service() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

async function assertAdmin(request: Request) {
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (bearer && bearer === ADMIN_SECRET) return { mode: "secret" as const };

  if (bearer) {
    const userClient = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || SERVICE_KEY, {
      global: { headers: { authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    const uid = userData.user?.id;
    if (uid) {
      const db = service();
      const { data: profile } = await db
        .from("journalists")
        .select("is_admin, public_alias")
        .eq("owner_user_id", uid)
        .maybeSingle();
      if (profile?.is_admin) return { mode: "admin" as const, alias: profile.public_alias as string };
    }
  }
  return null;
}

async function loadPool(db: ReturnType<typeof service>) {
  const { data, error } = await db.from("fund_pool").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  return data as {
    address: string;
    network: string;
    balance_sats: number;
    confirmed_sats: number;
    unconfirmed_sats: number;
  } | null;
}

async function loadEarners(db: ReturnType<typeof service>): Promise<ScoreRow[]> {
  // Prefer scores from the latest ready/submitted epoch allocations.
  const { data: ledger } = await db
    .from("public_payout_ledger")
    .select("epoch_id, public_alias, score, total_score, payout_atomic")
    .order("closes_at", { ascending: false })
    .limit(40);

  if (ledger?.length) {
    const latestEpoch = ledger[0].epoch_id;
    const rows = ledger.filter((r) => r.epoch_id === latestEpoch);
    const aliases = rows.map((r) => r.public_alias);
    const { data: journalists } = await db
      .from("journalists")
      .select("id, public_alias, payout_address, payouts_enabled")
      .in("public_alias", aliases);

    return rows.map((r) => {
      const j = journalists?.find((x) => x.public_alias === r.public_alias);
      return {
        journalist_id: j?.id || "",
        public_alias: r.public_alias,
        payout_address: j?.payout_address || null,
        score: Number(r.score) || 0,
      };
    }).filter((r) => r.journalist_id && r.score > 0);
  }

  // Fallback: equal share among payout-enabled journalists with an address.
  const { data: journalists } = await db
    .from("journalists")
    .select("id, public_alias, payout_address, payouts_enabled")
    .eq("payouts_enabled", true);

  const eligible = (journalists || []).filter((j) => j.payout_address);
  return eligible.map((j) => ({
    journalist_id: j.id,
    public_alias: j.public_alias,
    payout_address: j.payout_address,
    score: 1,
  }));
}

function allocate(amountSats: number, earners: ScoreRow[]) {
  const totalScore = earners.reduce((sum, e) => sum + e.score, 0);
  if (!earners.length || totalScore <= 0 || amountSats <= 0) return [];

  const lines = earners.map((e) => {
    const raw = Math.floor((amountSats * e.score) / totalScore);
    return {
      ...e,
      total_score: totalScore,
      payout_atomic: raw,
    };
  });

  // Give leftover sats to the highest scorer so the budget is fully used.
  let allocated = lines.reduce((sum, l) => sum + l.payout_atomic, 0);
  let dust = amountSats - allocated;
  if (dust > 0 && lines.length) {
    lines.sort((a, b) => b.score - a.score);
    lines[0].payout_atomic += dust;
  }
  return lines.sort((a, b) => b.payout_atomic - a.payout_atomic);
}

export async function GET(request: Request) {
  const auth = await assertAdmin(request);
  if (!auth) return unauthorized();

  try {
    const db = service();
    const [pool, earners, recent] = await Promise.all([
      loadPool(db),
      loadEarners(db),
      db
        .from("admin_pool_payouts")
        .select("id, amount_sats, pool_balance_before, note, created_by, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const defaultAmount = pool?.balance_sats || 0;
    const preview = allocate(defaultAmount, earners);

    return NextResponse.json({
      pool,
      earners,
      preview_amount_sats: defaultAmount,
      preview,
      recent: recent.data || [],
      auth: auth.mode,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load admin payout" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await assertAdmin(request);
  if (!auth) return unauthorized();

  let body: { amount_sats?: number; note?: string; reset_pool?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const db = service();
    const pool = await loadPool(db);
    if (!pool) throw new Error("fund_pool row missing — run bitcoin:sync first");

    const earners = await loadEarners(db);
    if (!earners.length) {
      return NextResponse.json(
        { error: "No earning journalists found. Seed an epoch or enable journalist payouts." },
        { status: 400 },
      );
    }

    const amount =
      typeof body.amount_sats === "number" && Number.isInteger(body.amount_sats) && body.amount_sats > 0
        ? body.amount_sats
        : pool.balance_sats;

    if (amount <= 0) {
      return NextResponse.json({ error: "Pool balance is already 0 — nothing to pay out" }, { status: 400 });
    }

    const lines = allocate(amount, earners);
    if (!lines.length) {
      return NextResponse.json({ error: "Allocation produced no lines" }, { status: 400 });
    }

    const { data: payout, error: payoutError } = await db
      .from("admin_pool_payouts")
      .insert({
        amount_sats: amount,
        pool_balance_before: pool.balance_sats,
        note: body.note || "Admin portal payout",
        created_by: auth.mode === "admin" ? auth.alias : "secret",
      })
      .select("id, created_at")
      .single();
    if (payoutError) throw payoutError;

    const { error: linesError } = await db.from("admin_pool_payout_lines").insert(
      lines.map((line) => ({
        payout_id: payout.id,
        journalist_id: line.journalist_id,
        public_alias: line.public_alias,
        score: line.score,
        total_score: line.total_score,
        payout_atomic: line.payout_atomic,
        payout_address: line.payout_address,
      })),
    );
    if (linesError) throw linesError;

    const reset = body.reset_pool !== false;
    if (reset) {
      const { error: zeroError } = await db
        .from("fund_pool")
        .update({
          balance_sats: 0,
          confirmed_sats: 0,
          unconfirmed_sats: 0,
          synced_at: new Date().toISOString(),
          watch_source: "admin-payout-reset",
        })
        .eq("id", 1);
      if (zeroError) throw zeroError;
    }

    return NextResponse.json({
      ok: true,
      payout_id: payout.id,
      amount_sats: amount,
      reset_pool: reset,
      lines: lines.map((l) => ({
        public_alias: l.public_alias,
        payout_atomic: l.payout_atomic,
        score: l.score,
        payout_address: l.payout_address,
      })),
      created_at: payout.created_at,
      note: "Ledger payout recorded. On-chain Signet broadcast remains a separate cosign/PSBT step for real custody.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Payout failed" },
      { status: 503 },
    );
  }
}
