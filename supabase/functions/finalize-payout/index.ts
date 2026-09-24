import { createClient } from "npm:@supabase/supabase-js@2";

type Allocation = {
  journalist_id: string;
  payout_address: string;
  payout_atomic: string;
  score: string;
  total_score: string;
};

const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const sha256 = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

async function contractRequest(path: string, init: RequestInit = {}) {
  const baseUrl = required("PAYOUT_CONTRACT_ADAPTER_URL").replace(/\/$/, "");
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  headers.set("authorization", `Bearer ${required("PAYOUT_CONTRACT_ADAPTER_TOKEN")}`);
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) throw new Error(`Contract adapter returned ${response.status}: ${await response.text()}`);
  return response.json();
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (request.headers.get("authorization") !== `Bearer ${required("CRON_SECRET")}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: dueEpoch, error: epochError } = await supabase
      .from("payout_epochs")
      .select("id,status,opens_at,closes_at,formula_version,payout_budget_atomic,contract_tx_hash")
      .lte("closes_at", new Date().toISOString())
      .in("status", ["open", "ready"])
      .order("closes_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (epochError) throw epochError;
    if (!dueEpoch) return Response.json({ ok: true, action: "nothing_due" });
    if (dueEpoch.contract_tx_hash) return Response.json({ ok: true, action: "already_submitted", epochId: dueEpoch.id });

    if (dueEpoch.status === "open") {
      const balance = await contractRequest("/pool-balance");
      const { error } = await supabase.rpc("finalize_payout_epoch", {
        target_epoch_id: dueEpoch.id,
        observed_pool_balance_atomic: balance.balanceAtomic,
      });
      if (error) throw error;
    }

    const { data: epoch, error: finalizedEpochError } = await supabase
      .from("payout_epochs")
      .select("id,status,opens_at,closes_at,formula_version,pool_balance_atomic,payout_budget_atomic,contract_tx_hash")
      .eq("id", dueEpoch.id)
      .single();
    if (finalizedEpochError) throw finalizedEpochError;
    if (epoch.status !== "ready") throw new Error(`Epoch ${epoch.id} is not ready`);

    const nextOpen = new Date(epoch.closes_at);
    const nextClose = new Date(nextOpen.getTime() + 14 * 24 * 60 * 60 * 1000);
    const { error: nextEpochError } = await supabase.from("payout_epochs").upsert({
      opens_at: nextOpen.toISOString(),
      closes_at: nextClose.toISOString(),
      view_weight: 1,
      like_weight: 4,
      formula_version: epoch.formula_version,
    }, { onConflict: "opens_at", ignoreDuplicates: true });
    if (nextEpochError) throw nextEpochError;

    const { data: allocations, error: allocationsError } = await supabase
      .from("epoch_allocations")
      .select("journalist_id,payout_address,payout_atomic,score,total_score")
      .eq("epoch_id", epoch.id)
      .gt("payout_atomic", 0)
      .order("journalist_id");
    if (allocationsError) throw allocationsError;

    const manifest = JSON.stringify({
      schema: "vera-payout-manifest-v1",
      epochId: epoch.id,
      opensAt: epoch.opens_at,
      closesAt: epoch.closes_at,
      formulaVersion: epoch.formula_version,
      poolBalanceAtomic: epoch.pool_balance_atomic,
      payoutBudgetAtomic: epoch.payout_budget_atomic,
      allocations: (allocations as Allocation[]).map(({ payout_address, payout_atomic, score, total_score }) => ({
        payoutAddress: payout_address,
        payoutAtomic: payout_atomic,
        score,
        totalScore: total_score,
      })),
    });
    const manifestHash = await sha256(manifest);

    const submission = await contractRequest("/epochs", {
      method: "POST",
      body: JSON.stringify({
        idempotencyKey: `vera-epoch-${epoch.id}`,
        epochId: epoch.id,
        manifest,
        manifestHash,
      }),
    });

    const { error: updateError } = await supabase
      .from("payout_epochs")
      .update({
        status: "submitted",
        manifest_hash: manifestHash,
        manifest_uri: submission.manifestUri,
        allocation_root: submission.allocationRoot,
        contract_tx_hash: submission.txHash,
        submitted_at: new Date().toISOString(),
        failure_reason: null,
      })
      .eq("id", epoch.id)
      .eq("status", "ready");
    if (updateError) throw updateError;

    return Response.json({ ok: true, epochId: epoch.id, txHash: submission.txHash });
  } catch (error) {
    console.error(error);
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
