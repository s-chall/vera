"use client";

import { ExternalLink, Newspaper } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Pickup = { id: string; outlet: string; outlet_slug: string; url: string | null; picked_up_at: string };

/**
 * Wordmarks rather than trademarked logo files: these are drawn from the
 * outlet name, so nothing copyrighted is bundled and any outlet works without
 * an asset. Drop real files in and swap this if you have licence to use them.
 */
const WORDMARK: Record<string, { short: string; className: string }> = {
  nytimes: { short: "The New York Times", className: "pickup-mark--nyt" },
  cnn: { short: "CNN", className: "pickup-mark--cnn" },
  vpitv: { short: "VPItv", className: "pickup-mark--vpitv" },
};

const since = (iso: string) => {
  const hours = Math.round((Date.now() - Date.parse(iso)) / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
};

export function ArticlePickups({ articleId }: { articleId: string }) {
  const [pickups, setPickups] = useState<Pickup[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const db = supabase();
    if (!db) return;
    void db.from("article_pickups")
      .select("id, outlet, outlet_slug, url, picked_up_at")
      .eq("article_id", articleId)
      .order("picked_up_at", { ascending: false })
      .then(({ data }) => { if (!cancelled) setPickups((data as Pickup[]) ?? []); });
    return () => { cancelled = true; };
  }, [articleId]);

  if (!pickups || pickups.length === 0) return null;

  return (
    <aside className="pickups" aria-labelledby="pickups-title">
      <header className="pickups-header">
        <Newspaper aria-hidden="true" size={16} />
        <h2 id="pickups-title">Running this story</h2>
      </header>
      <p className="pickups-note">
        {pickups.length} {pickups.length === 1 ? "outlet has" : "outlets have"} republished this
        reporting under the same protected byline.
      </p>
      <ul className="pickups-list">
        {pickups.map((pickup) => {
          const mark = WORDMARK[pickup.outlet_slug];
          const body = (
            <>
              <span className={`pickup-mark ${mark?.className ?? "pickup-mark--generic"}`} aria-hidden="true">
                {mark?.short ?? pickup.outlet}
              </span>
              <span className="pickup-meta">
                <strong>{pickup.outlet}</strong>
                <small>{since(pickup.picked_up_at)}</small>
              </span>
              {pickup.url ? <ExternalLink aria-hidden="true" size={15} /> : null}
            </>
          );
          return (
            <li key={pickup.id}>
              {pickup.url
                ? <a href={pickup.url} target="_blank" rel="noreferrer noopener">{body}</a>
                : <span>{body}</span>}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
