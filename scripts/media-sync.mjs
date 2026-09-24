#!/usr/bin/env node
/**
 * Fetch allowlisted RSS feeds (NPR + BBC Mundo), match journalist aliases, upsert media_hits.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Inline minimal copies so the script runs without a TS build step.
const MEDIA_SOURCES = [
  {
    id: "npr-world",
    name: "NPR",
    country: "US",
    feedUrl: "https://feeds.npr.org/1004/rss.xml",
  },
  {
    id: "bbc-mundo",
    name: "BBC Mundo",
    country: "LATAM",
    feedUrl: "https://feeds.bbci.co.uk/mundo/rss.xml",
  },
];

function decodeXml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

function tag(block, name) {
  const cdata = block.match(new RegExp(`<${name}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${name}>`, "i"));
  if (cdata?.[1]) return decodeXml(cdata[1]);
  const plain = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  if (plain?.[1]) return decodeXml(plain[1].replace(/<[^>]+>/g, " "));
  return "";
}

function parseRss(xml) {
  const items = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const block of blocks) {
    const title = tag(block, "title");
    let url = tag(block, "link") || block.match(/<guid[^>]*>([^<]+)<\/guid>/i)?.[1] || "";
    url = url.trim();
    if (!title || !/^https?:\/\//i.test(url)) continue;
    const excerpt = (tag(block, "description") || "").replace(/\s+/g, " ").slice(0, 400);
    items.push({ title: title.slice(0, 300), url, excerpt });
  }
  return items;
}

function normalize(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchAlias(haystack, candidates) {
  const text = normalize(haystack);
  for (const candidate of candidates) {
    const alias = normalize(candidate.alias);
    if (alias.length >= 3 && text.includes(alias)) return candidate.alias;
    for (const term of candidate.terms) {
      const t = normalize(term);
      if (t.length >= 5 && text.includes(t)) return candidate.alias;
    }
  }
  return null;
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const headers = {
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
  "content-type": "application/json",
  prefer: "resolution=merge-duplicates,return=representation",
};

async function loadCandidates() {
  try {
    const [jRes, aRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/journalists?select=id,public_alias`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/articles?select=journalist_id,slug`, { headers }),
    ]);
    if (!jRes.ok) return [];
    const journalists = await jRes.json();
    const articles = aRes.ok ? await aRes.json() : [];
    return journalists.map((j) => {
      const terms = new Set();
      for (const part of String(j.public_alias).split(/\s+/g)) if (part.length >= 5) terms.add(part);
      for (const a of articles.filter((row) => row.journalist_id === j.id)) {
        for (const part of String(a.slug || "").split(/[-_]/g)) if (part.length >= 5) terms.add(part);
      }
      return { alias: j.public_alias, terms: [...terms] };
    });
  } catch {
    return [];
  }
}

async function latestEpochId() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/payout_epochs?select=id&status=in.(ready,submitted,settled,open)&order=closes_at.desc&limit=1`,
      { headers },
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function upsertHits(rows) {
  if (!rows.length) return { ok: true, count: 0 };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/media_hits`, {
    method: "POST",
    headers,
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    return { ok: false, error: `media_hits upsert ${res.status}: ${await res.text()}` };
  }
  return { ok: true, count: rows.length };
}

const candidates = await loadCandidates();
const epochId = await latestEpochId();
const summary = [];
let anyUpsertOk = false;

for (const source of MEDIA_SOURCES) {
  try {
    const res = await fetch(source.feedUrl, {
      headers: {
        "user-agent": "VeraBot/0.1 (+https://github.com/s-chall/vera; hackathon media allowlist)",
        accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = parseRss(await res.text()).slice(0, 12);
    const rows = items.map((item) => {
      const matched = matchAlias(`${item.title} ${item.excerpt}`, candidates);
      return {
        outlet_id: source.id,
        outlet_name: source.name,
        country: source.country,
        title: item.title,
        url: item.url,
        matched_alias: matched,
        epoch_id: epochId,
        excerpt: item.excerpt || null,
      };
    });
    const upsert = await upsertHits(rows);
    if (upsert.ok) anyUpsertOk = true;
    summary.push({
      source: source.name,
      fetched: items.length,
      matched: rows.filter((r) => r.matched_alias).length,
      ...(upsert.ok ? {} : { error: upsert.error }),
    });
  } catch (error) {
    summary.push({
      source: source.name,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

console.log(JSON.stringify({ ok: anyUpsertOk, candidates: candidates.length, epochId, summary }, null, 2));

const fixture = join(root, "supabase/mocks/media-feed-fixture.json");
if (!anyUpsertOk && existsSync(fixture)) {
  const rows = JSON.parse(readFileSync(fixture, "utf8"));
  const upsert = await upsertHits(rows.map((r) => ({ ...r, epoch_id: epochId })));
  if (upsert.ok) {
    console.log("Applied offline fixture media hits");
  } else {
    console.warn("Could not write media_hits — run migrations first:", upsert.error);
    process.exitCode = 1;
  }
}
