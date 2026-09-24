import { NextResponse } from "next/server";
import Stripe from "stripe";
import { fetchBtcUsd, loadPoolAddress } from "@/lib/fund/bitcoin";
import {
  buildMoonPayUrl,
  buildRampUrl,
  formatUsd,
  getConfiguredEasyPay,
  satsToUsdNumber,
} from "@/lib/fund/onramp";

export const dynamic = "force-dynamic";

type Body = {
  amount_sats?: number;
  anonymous?: boolean;
  /** Prefer a specific rail when several are configured */
  provider?: "moonpay" | "ramp" | "stripe" | "auto";
};

function appOrigin(request: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/$/, "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "http";
  return host ? `${proto}://${host}` : "http://localhost:4174";
}

export async function GET() {
  const configured = getConfiguredEasyPay();
  const btcUsd = await fetchBtcUsd();
  return NextResponse.json({
    ...configured,
    btc_usd: btcUsd,
    apple_pay_hint:
      configured.preferred === "none"
        ? "Add NEXT_PUBLIC_MOONPAY_API_KEY (BTC to pool) or STRIPE_SECRET_KEY (Apple Pay / card)."
        : configured.moonpay || configured.ramp
          ? "Apple Pay / card via on-ramp; BTC is delivered to the Total Pool address."
          : "Apple Pay / card via Stripe Checkout; record donation then sweep BTC to the pool.",
  });
}

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

  const anonymous = body.anonymous !== false;
  const configured = getConfiguredEasyPay();
  const want = body.provider || "auto";
  const provider =
    want === "auto"
      ? configured.preferred
      : want === "moonpay" && configured.moonpay
        ? "moonpay"
        : want === "ramp" && configured.ramp
          ? "ramp"
          : want === "stripe" && configured.stripe
            ? "stripe"
            : configured.preferred;

  if (provider === "none") {
    return NextResponse.json(
      {
        error:
          "Easy pay is not configured. Set NEXT_PUBLIC_MOONPAY_API_KEY (recommended: Apple Pay → BTC to pool) or STRIPE_SECRET_KEY.",
        setup: {
          moonpay: "https://www.moonpay.com/partners",
          ramp: "https://ramp.network/",
          stripe: "https://dashboard.stripe.com/apikeys",
        },
      },
      { status: 503 },
    );
  }

  const origin = appOrigin(request);
  const address = loadPoolAddress();
  const btcUsd = await fetchBtcUsd();
  const usd = satsToUsdNumber(amount, btcUsd);
  const successUrl = `${origin}/fund?easy_pay=success&sats=${amount}`;
  const cancelUrl = `${origin}/fund?easy_pay=cancel`;

  try {
    if (provider === "moonpay") {
      const url = await buildMoonPayUrl({ amountSats: amount, redirectUrl: successUrl });
      return NextResponse.json({
        provider: "moonpay",
        url,
        amount_sats: amount,
        amount_usd: formatUsd(usd),
        address,
        message: "Complete Apple Pay or card in MoonPay. BTC is sent to the Total Pool.",
      });
    }

    if (provider === "ramp") {
      const url = await buildRampUrl({ amountSats: amount, redirectUrl: successUrl });
      return NextResponse.json({
        provider: "ramp",
        url,
        amount_sats: amount,
        amount_usd: formatUsd(usd),
        address,
        message: "Complete Apple Pay or card in Ramp. BTC is sent to the Total Pool.",
      });
    }

    // Stripe Checkout (Apple Pay + card). Funds land in your Stripe balance;
    // use for USD donations or sweep to BTC ops separately.
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) throw new Error("Stripe is not configured");
    const stripe = new Stripe(secret);
    const cents = Math.max(100, Math.round(usd * 100)); // min $1.00

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      // Apple Pay / Google Pay appear automatically when domain is verified
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: cents,
            product_data: {
              name: "Vera Total Pool contribution",
              description: `${amount.toLocaleString("en-US")} sats equivalent · ${anonymous ? "Anonymous" : "Named"} donor`,
            },
          },
        },
      ],
      success_url: successUrl + "&session_id={CHECKOUT_SESSION_ID}",
      cancel_url: cancelUrl,
      metadata: {
        amount_sats: String(amount),
        anonymous: anonymous ? "true" : "false",
        pool_address: address,
        purpose: "vera_total_pool",
      },
    });

    return NextResponse.json({
      provider: "stripe",
      url: session.url,
      session_id: session.id,
      amount_sats: amount,
      amount_usd: formatUsd(cents / 100),
      address,
      message: "Apple Pay and cards via Stripe. Verify domain in Stripe for Apple Pay on the web.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start easy pay" },
      { status: 500 },
    );
  }
}
