"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Heart, Landmark, MessageCircle, Repeat2, Search, ShieldCheck } from "lucide-react";
import { useVera } from "@/lib/vera";
import { ArtBlock } from "@/lib/art";
import { pool } from "@/lib/content";
import type { Article, Byline } from "@/lib/types";

const FILTERS = [
  { id: "for-you", label: "For you" },
  { id: "latest", label: "Latest" },
  { id: "following", label: "Following" },
];

const initials = (alias: string) => alias.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

function filed(at: number | null) {
  if (!at) return "Draft";
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return "Filed just now";
  if (mins < 60) return `Filed ${mins} min ago`;
  if (mins < 60 * 24) return `Filed ${Math.round(mins / 60)} hours ago`;
  return `Filed ${new Date(at).toLocaleDateString([], { month: "short", day: "numeric" })}`;
}

export default function HomePage() {
  const vera = useVera();
  const [filter, setFilter] = useState("for-you");
  const articles = vera.feed(filter);
  const [lead, ...rest] = articles;
  const leadAuthor: Byline | null = lead ? vera.authorOf(lead) : null;

  return (
    <main id="main-content" className="home-page">
      <div className="feed-layout">
        <div className="feed-column">
          <section className="briefing-banner">
            <span>Today’s briefing</span>
            <h1>Reporting worth your attention.</h1>
            <p>Independent investigations selected for public value, not outrage.</p>
          </section>

          <nav className="feed-filter" aria-label="Briefing filters">
            {FILTERS.map((item) => (
              <button key={item.id} className={filter === item.id ? "active" : ""}
                aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>
            ))}
          </nav>

          {!lead ? (
            <section className="feed-empty">
              <h2>{filter === "following" ? "Nothing from the people you follow" : "Nothing filed yet"}</h2>
              <p>{filter === "following"
                ? "Switch to Latest to see every investigation published so far."
                : "Published investigations will appear here."}</p>
              {filter === "following"
                ? <button className="button button-primary" onClick={() => setFilter("latest")}>Show Latest</button>
                : <Link className="button button-accent" href="/write">Write the first one</Link>}
            </section>
          ) : (
            <article className="feed-story">
              <header>
                <div className={`reporter-avatar ${leadAuthor?.seal ?? ""}`}>{leadAuthor ? initials(leadAuthor.alias) : "··"}</div>
                <div>
                  <strong>{leadAuthor?.alias ?? "Unknown"}</strong>
                  <span>
                    {leadAuthor?.verified ? <><ShieldCheck aria-hidden="true" />Privately verified · </> : null}
                    {filed(lead.publishedAt)}
                  </span>
                </div>
                <Link href="/fund">Support</Link>
              </header>
              <h2><Link href={`/articles/${lead.slug}`}>{lead.title}</Link></h2>
              <p>{lead.dek}</p>
              <Link href={`/articles/${lead.slug}`} className="feed-image">
                <ArtBlock slug={lead.slug} kind={lead.art} priority sizes="(max-width: 760px) 100vw, 640px" />
              </Link>
              <footer>
                <button aria-label="Like report"><Heart aria-hidden="true" /><span>—</span></button>
                <button aria-label="Comment on report"><MessageCircle aria-hidden="true" /><span>—</span></button>
                <button aria-label="Share report"><Repeat2 aria-hidden="true" /><span>—</span></button>
                <Link href={`/articles/${lead.slug}`}>Read {lead.readMins} min read<ArrowRight aria-hidden="true" /></Link>
              </footer>
            </article>
          )}

          {rest.length ? (
            <section className="feed-list" aria-labelledby="more-title">
              <header><h2 id="more-title">More from today</h2><span>{rest.length} more</span></header>
              {rest.map((report: Article) => {
                const author = vera.authorOf(report);
                return (
                  <article className="feed-note" key={report.id}>
                    <div className={`reporter-avatar ${author?.seal ?? ""}`}>{author ? initials(author.alias) : "··"}</div>
                    <div>
                      <div className="note-meta">
                        <strong>{author?.alias ?? "Unknown"}</strong>
                        <span>{report.category} · {report.readMins} min read</span>
                      </div>
                      <h3>{report.title}</h3>
                      <p>{report.dek}</p>
                      <footer>
                        <button aria-label={`Like ${report.title}`}><Heart aria-hidden="true" /></button>
                        <button aria-label={`Comment on ${report.title}`}><MessageCircle aria-hidden="true" /></button>
                        <Link href={`/articles/${report.slug}`}>Read report</Link>
                      </footer>
                    </div>
                  </article>
                );
              })}
            </section>
          ) : null}
        </div>

        <aside className="home-rail">
          <label className="site-search"><span>Search Vera</span>
            <input placeholder="Search reports and journalists" /><Search aria-hidden="true" /></label>
          <section className="rail-fund" aria-labelledby="fund-preview-title">
            <div className="fund-preview-icon"><Landmark aria-hidden="true" /></div>
            <span className="overline">Community reporting pool</span>
            <h2 id="fund-preview-title">{pool.balance} BTC</h2>
            <p>Every two weeks, one-sixth is distributed according to qualified readership and support.</p>
            <div className="pool-progress"><span style={{ width: `${pool.percent}%` }} /></div>
            <div className="pool-label"><span>{pool.percent}% funded</span><span>{pool.goal} goal</span></div>
            <Link className="button button-accent" href="/fund">Fund independent reporting</Link>
            <small><ShieldCheck aria-hidden="true" />Public payouts. Protected identities.</small>
          </section>
          <section className="rail-explainer">
            <h2>How Vera is different</h2>
            <p>Journalists are verified privately, publish under protected aliases, and earn from a transparent shared pool.</p>
            <Link href="/fund">See how payouts work <ArrowRight aria-hidden="true" /></Link>
          </section>
        </aside>
      </div>
    </main>
  );
}
