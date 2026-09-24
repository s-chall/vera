export type RssItem = {
  title: string;
  url: string;
  excerpt: string;
  published_at: string | null;
};

function decodeXml(value: string) {
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

function tag(block: string, name: string) {
  const cdata = block.match(new RegExp(`<${name}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${name}>`, "i"));
  if (cdata?.[1]) return decodeXml(cdata[1]);
  const plain = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  if (plain?.[1]) return decodeXml(plain[1].replace(/<[^>]+>/g, " "));
  return "";
}

/** Minimal RSS/Atom parser — no extra dependencies. */
export function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];

  for (const block of blocks) {
    const title = tag(block, "title");
    let url =
      tag(block, "link") ||
      block.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] ||
      block.match(/<guid[^>]*>([^<]+)<\/guid>/i)?.[1] ||
      "";
    url = url.trim();
    if (!title || !url) continue;
    if (!/^https?:\/\//i.test(url)) continue;

    const excerpt = tag(block, "description") || tag(block, "summary") || tag(block, "content") || "";
    const published =
      tag(block, "pubDate") || tag(block, "published") || tag(block, "updated") || null;

    items.push({
      title: title.slice(0, 300),
      url,
      excerpt: excerpt.replace(/\s+/g, " ").slice(0, 400),
      published_at: published,
    });
  }

  return items;
}

export async function fetchFeed(feedUrl: string): Promise<RssItem[]> {
  const res = await fetch(feedUrl, {
    headers: {
      "user-agent": "VeraBot/0.1 (+https://github.com/s-chall/vera; hackathon media allowlist)",
      accept: "application/rss+xml, application/xml, text/xml, */*",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Feed ${res.status} for ${feedUrl}`);
  const xml = await res.text();
  return parseRss(xml);
}
