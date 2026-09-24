"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bookmark, Clock3, ShieldCheck } from "lucide-react";
import { useVera } from "@/lib/vera";
import { ArtBlock } from "@/lib/art";
import { StatusBadge } from "@/components/status-badge";
import { ArticlePickups } from "@/components/article-pickups";
import { ArticleTranslate, type Translation } from "@/components/article-translate";

export default function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const vera = useVera();
  const article = vera.bySlug(slug);
  const [translation, setTranslation] = useState<Translation | null>(null);

  if (!vera.ready) return <main id="main-content" className="article-page"><p className="article-status">Loading…</p></main>;

  if (!article) {
    return (
      <main id="main-content" className="article-page">
        <div className="article-header"><Link href="/" className="back-link"><ArrowLeft aria-hidden="true" />Back to briefing</Link></div>
        <section className="feed-empty">
          <h2>That report is gone</h2>
          <p>It may have been unpublished.</p>
          <Link className="button button-primary" href="/">Back to the briefing</Link>
        </section>
      </main>
    );
  }

  const author = vera.authorOf(article);
  const mine = author?.id === vera.meId;
  const shown = translation ?? article;
  const filedAt = article.publishedAt
    ? new Date(article.publishedAt).toLocaleDateString([], { month: "long", day: "numeric" })
    : "Draft";

  return (
    <main id="main-content" className="article-page">
      <div className="article-header">
        <Link href="/" className="back-link"><ArrowLeft aria-hidden="true" />Back to briefing</Link>
        <button className="secondary-button"><Bookmark aria-hidden="true" />Save</button>
      </div>
      <div className="article-layout">
      <article>
        <header>
          <div className="article-byline">
            <span className={`author-dot ${author?.seal ?? ""}`} />
            <strong>{author?.alias ?? "Unknown"}</strong>
            <span>{filedAt}</span>
            <span><Clock3 aria-hidden="true" />{article.readMins} min read</span>
            {author && !mine ? (
              <button className={`follow-button${vera.isFollowing(author.id) ? " following" : ""}`}
                disabled={vera.busy} onClick={() => void vera.toggleFollow(author.id)}>
                {vera.isFollowing(author.id) ? "Following" : "Follow"}
              </button>
            ) : null}
          </div>
          <h1>{shown.title}</h1>
          <p className="article-dek">{shown.dek}</p>
          <ArticleTranslate articleId={article.id} active={translation?.language ?? "en"}
            onChange={setTranslation} />
          {author ? <StatusBadge verified={author.verified}>Reporter privately verified</StatusBadge> : null}
        </header>

        <figure className="article-figure">
          {/* The media needs its own sized, positioned box: ArtBlock renders a
              fill image, which would otherwise escape to the viewport. */}
          <div className="article-figure-media">
            <ArtBlock slug={article.slug} kind={article.art} priority sizes="(max-width: 760px) 100vw, 760px" />
          </div>
          <figcaption>Identifying details were separated from source files before publication.</figcaption>
        </figure>

        <aside className="source-protection">
          <ShieldCheck aria-hidden="true" />
          <p><strong>Source protection is active.</strong> Documents are encrypted and identities are stored separately from the published article.</p>
        </aside>

        <div className="article-body">
          {shown.body.map((line, index) => (
            line.startsWith(">")
              ? <blockquote key={index}>{line.replace(/^>\s*/, "")}</blockquote>
              : <p key={index}>{line}</p>
          ))}
        </div>

        {mine ? (
          <aside className="owner-actions">
            <div>
              <strong>This is your report.</strong>
              <span>It is visible to everyone under {author?.alias}. Nothing links it to your wallet.</span>
            </div>
            <button className="secondary-button danger" disabled={vera.busy}
              onClick={() => void vera.unpublish(article.id)}>Unpublish</button>
          </aside>
        ) : null}
      </article>
      <ArticlePickups articleId={article.id} />
      </div>
    </main>
  );
}
