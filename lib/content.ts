/**
 * Mock data that has no backend yet. Everything the payout engine will own once
 * an epoch has actually run: pool balance, ledger rows, BTC amounts.
 * Articles and journalists come from Supabase; see lib/vera.tsx.
 */
export const payouts = [
  { alias: "Northstar", date: "Sep 22", amount: "0.0480 BTC", score: "36.4% of epoch" },
  { alias: "Mothlight", date: "Sep 18", amount: "0.0215 BTC", score: "16.3% of epoch" },
  { alias: "Red Cedar", date: "Sep 12", amount: "0.0340 BTC", score: "25.8% of epoch" },
  { alias: "Signal 29", date: "Sep 08", amount: "0.0168 BTC", score: "12.7% of epoch" },
];

export const pool = { balance: "0.4278", goal: "0.6000", percent: 71, closesInDays: 9 };
