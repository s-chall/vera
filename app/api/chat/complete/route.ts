import { NextResponse } from "next/server";
import { completeLocally } from "@/lib/chat/maple";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

type Body = {
  message?: string;
  address?: string;
};

type LedgerRow = {
  epoch_id: number;
  closes_at: string;
  public_alias: string;
  payout_atomic: number;
  payout_budget_atomic: number;
};

type Deposit = {
  amount_sats: number;
  observed_at: string;
  sender_address: string | null;
  txid: string;
};

type MediaHit = {
  outlet_name: string;
  country: string;
  title: string;
  url: string;
  matched_alias: string | null;
};

function formatSats(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDay(iso: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(iso),
  );
}

async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as T;
}

function buildContext(input: {
  address: string | null;
  deposits: Deposit[];
  ledger: LedgerRow[];
  media: MediaHit[];
}) {
  const epochs = new Map<
    number,
    { closes_at: string; budget: number; lines: string[]; funded: boolean; your_sats: number }
  >();

  for (const row of input.ledger) {
    const e = epochs.get(row.epoch_id) ?? {
      closes_at: row.closes_at,
      budget: row.payout_budget_atomic,
      lines: [],
      funded: false,
      your_sats: 0,
    };
    e.lines.push(`${row.public_alias}: ${formatSats(row.payout_atomic)} sats`);
    epochs.set(row.epoch_id, e);
  }

  const totalDeposit = input.deposits.reduce((s, d) => s + d.amount_sats, 0);
  if (input.deposits.length && epochs.size) {
    const latest = [...epochs.entries()].sort(
      (a, b) => Date.parse(b[1].closes_at) - Date.parse(a[1].closes_at),
    )[0];
    if (latest) {
      latest[1].funded = true;
      latest[1].your_sats = totalDeposit;
    }
  }

  const epochBlocks = [...epochs.entries()]
    .sort((a, b) => Date.parse(b[1].closes_at) - Date.parse(a[1].closes_at))
    .slice(0, 2)
    .map(([id, e]) => {
      const you = e.funded
        ? `Contributor ${input.address} funded this epoch with ${formatSats(e.your_sats)} sats.`
        : "No indexed deposits from this address for this epoch.";
      return `Epoch ${id} (closes ${formatDay(e.closes_at)}), budget ${formatSats(e.budget)} sats.\n${you}\nAllocations:\n- ${e.lines.join("\n- ")}`;
    })
    .join("\n\n");

  const mediaBlock = input.media.length
    ? input.media
        .slice(0, 8)
        .map(
          (m) =>
            `- ${m.outlet_name} (${m.country}): ${m.title}${m.matched_alias ? ` [alias ${m.matched_alias}]` : ""} → ${m.url}`,
        )
        .join("\n")
    : "No media hits cached yet.";

  return { epochBlocks, mediaBlock, totalDeposit, funded: totalDeposit > 0 };
}

function templateAnswer(message: string, ctx: ReturnType<typeof buildContext>) {
  const q = message.toLowerCase();
  if (q.includes("did i fund") || q.includes("fund this")) {
    return ctx.funded
      ? `Yes. This address deposited ${formatSats(ctx.totalDeposit)} sats tied to the latest indexed epoch.\n\n${ctx.epochBlocks}`
      : `No deposits from this address are indexed yet.\n\n${ctx.epochBlocks}`;
  }
  if (q.includes("outlet") || q.includes("reused") || q.includes("media")) {
    return `Allowlisted media cache (NPR + BBC Mundo):\n${ctx.mediaBlock}`;
  }
  return `Biweekly distribution brief (local grounded data):\n\n${ctx.epochBlocks}\n\nMedia:\n${ctx.mediaBlock}`;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = (body.message || "").trim();
  const address = (body.address || "").trim() || null;
  if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });

  try {
    const [ledger, media, deposits] = await Promise.all([
      rest<LedgerRow[]>(
        "public_payout_ledger?select=epoch_id,closes_at,public_alias,payout_atomic,payout_budget_atomic&order=closes_at.desc&limit=40",
      ).catch(() => [] as LedgerRow[]),
      rest<MediaHit[]>(
        "media_hits?select=outlet_name,country,title,url,matched_alias&order=observed_at.desc&limit=20",
      ).catch(() => [] as MediaHit[]),
      address
        ? rest<Deposit[]>(
            `fund_deposits?select=amount_sats,observed_at,sender_address,txid&sender_address=eq.${encodeURIComponent(address)}&order=observed_at.desc`,
          ).catch(() => [] as Deposit[])
        : Promise.resolve([] as Deposit[]),
    ]);

    const ctx = buildContext({ address, deposits, ledger, media });
    const fallback = templateAnswer(message, ctx);

    const system = `You are Vera Chat. Answer ONLY from the local context below.
Do not invent payouts, aliases, or URLs.
Prefer concise briefs. List journalist pseudonyms and sats clearly.
If media links exist, cite them with the URL.
Never claim cloud AI training access. You run locally (Maple / local model).

CONTEXT:
${ctx.epochBlocks}

MEDIA HITS:
${ctx.mediaBlock}`;

    const result = await completeLocally(
      [
        { role: "system", content: system },
        { role: "user", content: message },
      ],
      fallback,
    );

    const links = media.slice(0, 6).map((m) => ({
      label: `${m.outlet_name}${m.matched_alias ? ` · ${m.matched_alias}` : ""} — ${m.title}`,
      href: m.url,
    }));

    return NextResponse.json({
      text: result.text,
      provider: result.provider,
      model: result.model,
      links: message.toLowerCase().includes("outlet") || message.toLowerCase().includes("reused") || message.toLowerCase().includes("media")
        ? links
        : links.filter((l) => /alias/i.test(l.label)).slice(0, 4),
      grounded: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Complete failed" },
      { status: 503 },
    );
  }
}
