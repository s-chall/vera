/** Allowlisted news sources for Chat media reuse briefs. */
export type MediaSource = {
  id: string;
  name: string;
  country: "US" | "VE" | "LATAM";
  feedUrl: string;
};

/**
 * Reuters and Efecto Cocuyo block automated fetches (401/403).
 * NPR (US) + BBC Mundo (Spanish LatAm, heavy VE coverage) are reliably scrapeable via RSS.
 */
export const MEDIA_SOURCES: MediaSource[] = [
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
