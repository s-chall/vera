import { NextResponse } from "next/server";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook: mark contribution intents paid when Checkout completes.
 * Configure endpoint: POST /api/fund/easy-pay/webhook
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });

  const stripe = new Stripe(secret);
  const raw = await request.text();
  let event: Stripe.Event;

  try {
    if (whSecret) {
      const sig = request.headers.get("stripe-signature");
      if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });
      event = stripe.webhooks.constructEvent(raw, sig, whSecret);
    } else {
      event = JSON.parse(raw) as Stripe.Event;
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid webhook" },
      { status: 400 },
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const amountSats = Number(session.metadata?.amount_sats || 0);
    const anonymous = session.metadata?.anonymous !== "false";
    const address = session.metadata?.pool_address || "";
    if (amountSats >= 1000 && address) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
      const serviceKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        "";
      await fetch(`${supabaseUrl}/rest/v1/fund_contribution_intents`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          authorization: `Bearer ${serviceKey}`,
          "content-type": "application/json",
          prefer: "return=minimal",
        },
        body: JSON.stringify({
          amount_sats: amountSats,
          anonymous,
          address,
          status: "paid",
          payment_method: "stripe",
          external_id: session.id,
        }),
      }).catch(() => null);
    }
  }

  return NextResponse.json({ received: true });
}
