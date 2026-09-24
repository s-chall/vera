"use client";

import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import {
  Bookmark,
  Heart,
  MessageCircle,
  Repeat2,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";

import roadsideSources from "@/assets/roadside-sources.png";
import valleyReporting from "@/assets/valley-reporting.png";

type FeedTab = "Journalists" | "Activists";

type FeedItem = {
  alias: string;
  avatar: string;
  date: string;
  group: FeedTab;
  title: string;
  summary: string;
  topic: string;
  image?: StaticImageData;
  imageAlt?: string;
  likes: number;
  comments: number;
  shares: number;
};

const articleHref = "/articles/towns-erased-from-the-map";

const feedItems: FeedItem[] = [
  {
    alias: "Northstar",
    avatar: "N",
    date: "Sep 24",
    group: "Journalists",
    title: "The towns erased from the map",
    summary:
      "County records show how three communities disappeared from planning documents while road and water contracts moved forward.",
    topic: "Public records",
    image: valleyReporting,
    imageAlt: "A reporter overlooking a valley while documenting local land use",
    likes: 184,
    comments: 21,
    shares: 38,
  },
  {
    alias: "Red Cedar",
    avatar: "RC",
    date: "Sep 23",
    group: "Journalists",
    title: "A river permit with no public hearing",
    summary:
      "A review of agency filings finds a major discharge permit advanced before nearby residents received notice.",
    topic: "Environment",
    likes: 132,
    comments: 17,
    shares: 29,
  },
  {
    alias: "Mothlight",
    avatar: "M",
    date: "Sep 21",
    group: "Journalists",
    title: "Eviction filings outpace the official count",
    summary:
      "Court dockets reveal hundreds of housing cases missing from the city dashboard used to direct tenant aid.",
    topic: "Housing",
    likes: 96,
    comments: 14,
    shares: 22,
  },
  {
    alias: "Riverwatch",
    avatar: "R",
    date: "Sep 24",
    group: "Activists",
    title: "What roadside sources told us",
    summary:
      "Residents living near the freight route logged repeated water outages and shared records from months of unanswered reports.",
    topic: "Environment",
    image: roadsideSources,
    imageAlt: "Community sources gathering beside a rural roadside",
    likes: 211,
    comments: 32,
    shares: 47,
  },
  {
    alias: "Tenant Signal",
    avatar: "TS",
    date: "Sep 22",
    group: "Activists",
    title: "The repair requests that vanished",
    summary:
      "Tenants compared receipts and found repeated maintenance complaints were closed without inspections or repairs.",
    topic: "Housing",
    likes: 148,
    comments: 26,
    shares: 35,
  },
  {
    alias: "Borderless Archive",
    avatar: "BA",
    date: "Sep 20",
    group: "Activists",
    title: "Tracking a widening phone-search policy",
    summary:
      "Newly released directives show when officers may copy device data and how long those records can be retained.",
    topic: "Civil liberties",
    likes: 173,
    comments: 19,
    shares: 41,
  },
];

const tabs: FeedTab[] = ["Journalists", "Activists"];

export function NewsFeed() {
  const [activeTab, setActiveTab] = useState<FeedTab>("Journalists");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();

    return feedItems.filter((item) => {
      if (item.group !== activeTab) return false;
      if (!query) return true;

      return [item.alias, item.title, item.summary, item.topic].some((value) =>
        value.toLocaleLowerCase().includes(query),
      );
    });
  }, [activeTab, searchQuery]);

  return (
    <section className="news-shell" aria-labelledby="news-heading">
      <header className="news-header">
        <h1 className="news-title" id="news-heading">
          News
        </h1>

        <label className="news-search-label" htmlFor="news-search">
          Search news
        </label>
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
          <p className="news-empty">No matching news. Try another name or topic.</p>
        ) : (
          filteredItems.map((item) => (
            <article className="news-article" key={`${item.group}-${item.alias}`}>
              <div className="news-avatar" aria-hidden="true">
                {item.avatar}
              </div>

              <div className="news-article-content">
                <header className="news-article-header">
                  <div className="news-byline">
                    <span className="news-alias">{item.alias}</span>
                    <ShieldCheck
                      className="news-verified-icon"
                      aria-hidden="true"
                      size={16}
                    />
                    <span className="news-verified">Verified</span>
                    <time className="news-date">{item.date}</time>
                  </div>
                  <Link className="news-fund-link" href="/fund">
                    Fund
                  </Link>
                </header>

                <Link className="news-story-link" href={articleHref}>
                  <h2 className="news-headline">{item.title}</h2>
                  <p className="news-summary">{item.summary}</p>
                </Link>

                {item.image && item.imageAlt ? (
                  <Link
                    className="news-image-link"
                    href={articleHref}
                    aria-label={`Read ${item.title}`}
                  >
                    <Image
                      className="news-image"
                      src={item.image}
                      alt={item.imageAlt}
                      sizes="(max-width: 720px) 100vw, 640px"
                    />
                    <span className="news-image-caption">{item.title}</span>
                    <Bookmark className="news-bookmark" aria-hidden="true" size={20} />
                  </Link>
                ) : null}

                <footer className="news-actions" aria-label={`Actions for ${item.title}`}>
                  <button className="news-action" type="button" aria-label={`Like ${item.title}`}>
                    <Heart aria-hidden="true" size={20} />
                    <span>{item.likes}</span>
                  </button>
                  <button
                    className="news-action"
                    type="button"
                    aria-label={`Comment on ${item.title}`}
                  >
                    <MessageCircle aria-hidden="true" size={20} />
                    <span>{item.comments}</span>
                  </button>
                  <button className="news-action" type="button" aria-label={`Share ${item.title}`}>
                    <Repeat2 aria-hidden="true" size={20} />
                    <span>{item.shares}</span>
                  </button>
                  {!item.image ? (
                    <button
                      className="news-action news-action-bookmark"
                      type="button"
                      aria-label={`Bookmark ${item.title}`}
                    >
                      <Bookmark aria-hidden="true" size={20} />
                    </button>
                  ) : null}
                </footer>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

export default NewsFeed;
