import { fetchBtcUsd, loadPoolAddress } from "@/lib/fund/bitcoin";

export type EasyPayProvider = "moonpay" | "ramp" | "stripe" | "none";

export function satsToUsdNumber(sats: number, btcUsd: number): number {
  return (sats / 1e8) * btcUsd;
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: amount >= 100 ? 0 : 2,
  }).format(amount);
}

/** Which easy-pay rails are configured (server or public keys). */
export function getConfiguredEasyPay(): {
  moonpay: boolean;
  ramp: boolean;
  stripe: boolean;
  preferred: EasyPayProvider;
} {
  const moonpay = Boolean(process.env.NEXT_PUBLIC_MOONPAY_API_KEY || process.env.MOONPAY_API_KEY);
  const ramp = Boolean(process.env.NEXT_PUBLIC_RAMP_API_KEY || process.env.RAMP_API_KEY);
  const stripe = Boolean(process.env.STRIPE_SECRET_KEY);
  const preferred: EasyPayProvider = moonpay ? "moonpay" : ramp ? "ramp" : stripe ? "stripe" : "none";
  return { moonpay, ramp, stripe, preferred };
}

export async function buildMoonPayUrl(opts: {
  amountSats: number;
  redirectUrl?: string;
}): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_MOONPAY_API_KEY || process.env.MOONPAY_API_KEY;
  if (!apiKey) throw new Error("MoonPay is not configured");
  const address = loadPoolAddress();
  const btcUsd = await fetchBtcUsd();
  const usd = Math.max(20, Number(satsToUsdNumber(opts.amountSats, btcUsd).toFixed(2))); // MoonPay often has ~$20 min
  const url = new URL("https://buy.moonpay.com");
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("currencyCode", "btc");
  url.searchParams.set("walletAddress", address);
  url.searchParams.set("baseCurrencyCode", "usd");
  url.searchParams.set("baseCurrencyAmount", String(usd));
  url.searchParams.set("colorCode", "#f28a19");
  if (opts.redirectUrl) url.searchParams.set("redirectURL", opts.redirectUrl);
  return url.toString();
}

export async function buildRampUrl(opts: {
  amountSats: number;
  redirectUrl?: string;
}): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_RAMP_API_KEY || process.env.RAMP_API_KEY;
  if (!apiKey) throw new Error("Ramp is not configured");
  const address = loadPoolAddress();
  const btcUsd = await fetchBtcUsd();
  const usd = Math.max(15, Number(satsToUsdNumber(opts.amountSats, btcUsd).toFixed(2)));
  const url = new URL("https://app.ramp.network/");
  url.searchParams.set("hostApiKey", apiKey);
  url.searchParams.set("swapAsset", "BTC");
  url.searchParams.set("userAddress", address);
  url.searchParams.set("fiatCurrency", "USD");
  url.searchParams.set("fiatValue", String(usd));
  url.searchParams.set("hostAppName", "Vera");
  url.searchParams.set("hostLogoUrl", "https://mempool.space/resources/logo.svg");
  if (opts.redirectUrl) url.searchParams.set("finalUrl", opts.redirectUrl);
  return url.toString();
}
