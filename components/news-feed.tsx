"use client";

import Link from "next/link";
import { Heart, Lock, MessageCircle, Repeat2, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { useVera } from "@/lib/vera";
import { ArtBlock, hasPhoto } from "@/lib/art";
import { bylineName, type Article } from "@/lib/types";

type FeedTab = "Latest" | "Following";
const tabs: FeedTab[] = ["Latest", "Following"];

function filed(at: number | null) {
  if (!at) return "Draft";
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return new Date(at).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function NewsFeed() {
  const vera = useVera();
  const [activeTab, setActiveTab] = useState<FeedTab>("Latest");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();

    return vera.articles
      .filter((article) => article.publishedAt !== null)
      .filter((article) =>
        activeTab === "Latest"
          ? true
          : vera.following.includes(article.journalistId) || article.journalistId === vera.meId)
      .filter((article) => {
        if (!query) return true;
        const author = vera.byId(article.journalistId);
        return [author?.alias ?? "", article.title, article.dek, article.category]
          .some((value) => value.toLocaleLowerCase().includes(query));
      });
  }, [vera, activeTab, searchQuery]);

  const emptyMessage = searchQuery.trim()
    ? "No matching news. Try another name or topic."
    : activeTab === "Following"
      ? "Nothing from the people you follow yet. Follow a byline from the Latest tab."
      : "Nothing published yet.";

  return (
    <section className="news-shell" aria-labelledby="news-heading">
      <header className="news-header">
        <h1 className="news-title" id="news-heading">News</h1>

        <label className="news-search-label" htmlFor="news-search">Search news</label>
        <div className="news-search-wrap">
          <Search className="news-search-icon" aria-hidden="true" size={19} />
          <input
            className="news-search-input"
            id="news-search"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search"
          />
        </div>

        <div className="news-tabs" role="tablist" aria-label="News sources">
          {tabs.map((tab) => (
            <button
              className="news-tab"
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      </header>

      <div className="news-feed" aria-live="polite">
        {filteredItems.length === 0 ? (
          <p className="news-empty">{emptyMessage}</p>
        ) : (
          filteredItems.map((article: Article) => {
            const author = vera.byId(article.journalistId);
            const mine = article.journalistId === vera.meId;
            const href = `/articles/${article.slug}`;

            return (
              <article className="news-article" key={article.id}>
                <div className="news-article-content">
                  <header className="news-article-header">
                    <div className="news-byline">
                      <span className="news-alias">{bylineName(author)}</span>
                      {author?.verified ? (
                        <>
                          <ShieldCheck className="news-verified-icon" aria-hidden="true" size={16} />
                          <span className="news-verified">Verified</span>
                        </>
                      ) : null}
                      <time className="news-date">{filed(article.publishedAt)}</time>
                      {article.visibility === "media_only" ? (
                        <span className="news-restricted" title="Visible to media organisations only">
                          <Lock aria-hidden="true" size={13} />Media only
                        </span>
                      ) : null}
                    </div>
                    {author && !mine ? (
                      <button
                        className={`news-follow${vera.isFollowing(author.id) ? " is-following" : ""}`}
                        type="button"
                        disabled={vera.busy}
                        onClick={() => void vera.toggleFollow(author.id)}
                      >
                        {vera.isFollowing(author.id) ? "Following" : "Follow"}
                      </button>
                    ) : null}
                  </header>

                  <Link className="news-story-link" href={href}>
                    <h2 className="news-headline">{article.title}</h2>
                    {article.dek ? <p className="news-summary">{article.dek}</p> : null}
                  </Link>

                  {hasPhoto(article.slug, article.leadImage?.url ?? article.heroImageUrl) ? (
                    <Link className="news-image-link" href={href} aria-label={`Read ${article.title}`}>
                      <ArtBlock slug={article.slug} kind={article.art} uploaded={article.leadImage}
                        url={article.heroImageUrl} alt={article.heroImageAlt}
                        sizes="(max-width: 720px) 100vw, 640px" />
                      <span className="news-image-caption">
                        {article.title}
                        {!article.leadImage?.url && article.heroImageCredit ? ` · ${article.heroImageCredit}` : ""}
                      </span>
                    </Link>
                  ) : null}

                  {/* Counts are deliberately absent: nothing records engagement yet,
                      and a number here would be invented. */}
                  <footer className="news-actions" aria-label={`Actions for ${article.title}`}>
                    <button className="news-action" type="button" disabled
                      title="Likes are not recorded yet" aria-label={`Like ${article.title}`}>
                      <Heart aria-hidden="true" size={20} />
                    </button>
                    <button className="news-action" type="button" disabled
                      title="Comments are not built yet" aria-label={`Comment on ${article.title}`}>
                      <MessageCircle aria-hidden="true" size={20} />
                    </button>
                    <button className="news-action" type="button" disabled
                      title="Sharing is not built yet" aria-label={`Share ${article.title}`}>
                      <Repeat2 aria-hidden="true" size={20} />
                    </button>
                    <span className="news-readtime">{article.readMins} min read</span>
                  </footer>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

export default NewsFeed;
