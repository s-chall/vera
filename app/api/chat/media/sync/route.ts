import { NextResponse } from "next/server";
import { MEDIA_SOURCES } from "@/lib/chat/sources";
import { fetchFeed } from "@/lib/chat/rss";
import { buildCandidates, matchAlias } from "@/lib/chat/match";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

function headers() {
  return {
    apikey: SERVICE_KEY,
    authorization: `Bearer ${SERVICE_KEY}`,
    "content-type": "application/json",
    prefer: "resolution=merge-duplicates,return=representation",
  };
}

async function loadCandidates() {
  const [jRes, aRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/journalists?select=id,public_alias`, { headers: headers() }),
    fetch(`${SUPABASE_URL}/rest/v1/articles?select=journalist_id,slug`, { headers: headers() }),
  ]);
  if (!jRes.ok) return [];
  const journalists = (await jRes.json()) as Array<{ id: string; public_alias: string }>;
  const articles = aRes.ok
    ? ((await aRes.json()) as Array<{ journalist_id: string; slug: string }>)
    : [];
  return buildCandidates(
    journalists.map((j) => ({
      public_alias: j.public_alias,
      slugs: articles.filter((a) => a.journalist_id === j.id).map((a) => a.slug),
    })),
  );
}

async function latestEpochId() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/payout_epochs?select=id&status=in.(ready,submitted,settled,open)&order=closes_at.desc&limit=1`,
    { headers: headers() },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ id: number }>;
  return rows[0]?.id ?? null;
}

export async function POST() {
  try {
    const candidates = await loadCandidates();
    const epochId = await latestEpochId();
    const summary: Array<Record<string, unknown>> = [];
    const allRows: Array<Record<string, unknown>> = [];

    for (const source of MEDIA_SOURCES) {
      try {
        const items = (await fetchFeed(source.feedUrl)).slice(0, 12);
        for (const item of items) {
          allRows.push({
            outlet_id: source.id,
            outlet_name: source.name,
            country: source.country,
            title: item.title,
            url: item.url,
            matched_alias: matchAlias(`${item.title} ${item.excerpt}`, candidates),
            epoch_id: epochId,
            excerpt: item.excerpt || null,
          });
        }
        summary.push({
          source: source.name,
          fetched: items.length,
          matched: allRows.filter((r) => r.outlet_id === source.id && r.matched_alias).length,
        });
      } catch (error) {
        summary.push({
          source: source.name,
          error: error instanceof Error ? error.message : "fetch failed",
        });
      }
    }

    if (allRows.length) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/media_hits`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(allRows),
      });
      if (!res.ok) throw new Error(`Upsert failed: ${await res.text()}`);
    }

    return NextResponse.json({
      ok: true,
      sources: MEDIA_SOURCES.map((s) => ({ id: s.id, name: s.name, country: s.country })),
      candidates: candidates.length,
      epochId,
      summary,
      note: "Reuters / Efecto Cocuyo block bots; allowlist is NPR + BBC Mundo.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Media sync failed" },
      { status: 503 },
    );
  }
}
