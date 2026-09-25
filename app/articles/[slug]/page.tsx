"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bitcoin, Bookmark, Clock3 } from "lucide-react";
import { useVera } from "@/lib/vera";
import { bylineName } from "@/lib/types";
import { ArtBlock } from "@/lib/art";
import { ArticleBody } from "@/components/article-body";
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
  const earned = new Intl.NumberFormat().format(article.earnedSats);
  const uploaded = article.leadImage?.url ? article.leadImage : null;
  const gallery = article.images.filter((image) => image.url);

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
            <strong>{bylineName(author)}</strong>
            <span>{filedAt}</span>
            {article.visibility === "media_only"
              ? <span className="article-audience" title="Readable by media organisations and Vera admins">Media only</span>
              : null}
            <span><Clock3 aria-hidden="true" />{article.readMins} min read</span>
            {author && !mine ? (
              <button className={`follow-button${vera.isFollowing(author.id) ? " following" : ""}`}
                disabled={vera.busy} onClick={() => void vera.toggleFollow(author.id)}>
                {vera.isFollowing(author.id) ? "Following" : "Follow"}
              </button>
            ) : null}
          </div>
          <h1>{shown.title}</h1>
          {shown.dek ? <p className="article-dek">{shown.dek}</p> : null}
          <div className="article-earnings" aria-label={`This report received a payout of ${earned} Signet satoshis`}>
            <Bitcoin aria-hidden="true" />
            <span>Report payout</span>
            <strong>{earned} sats</strong>
            <small>Settled on the Signet demo ledger</small>
          </div>
          <ArticleTranslate articleId={article.id} active={translation?.language ?? "en"}
            onChange={setTranslation} />
          {author?.verified ? (
            <div className="article-credential">
              <StatusBadge verified>Reporter privately verified</StatusBadge>
              {author.credentialName ? (
                <dl className="credential-details">
                  <div><dt>Publishing as</dt><dd>{author.alias}</dd></div>
                  {author.credentialCarnet ? <div><dt>Carnet CNP</dt><dd>{author.credentialCarnet}</dd></div> : null}
                  {author.credentialSection ? <div><dt>Seccional CNP</dt><dd>{author.credentialSection}</dd></div> : null}
                </dl>
              ) : null}
            </div>
          ) : null}
        </header>

        <figure className="article-figure">
          {/* The media needs its own sized, positioned box: ArtBlock renders a
              fill image, which would otherwise escape to the viewport. */}
          <div className="article-figure-media">
            <ArtBlock slug={article.slug} kind={article.art} priority uploaded={uploaded}
              url={article.heroImageUrl} alt={article.heroImageAlt}
              sizes="(max-width: 760px) 100vw, 1180px" />
          </div>
          {uploaded ? (
            uploaded.alt ? <figcaption>{uploaded.alt}</figcaption> : null
          ) : (
            <figcaption>
              {article.heroImageAlt ?? "Lead image"}
              {article.heroImageCredit ? <> · Photograph: {article.heroImageCredit}</> : null}
            </figcaption>
          )}
        </figure>

        <div className="article-body">
          <ArticleBody blocks={shown.body} />
        </div>

        {gallery.length ? (
          <section className="article-gallery" aria-label="Images">
            {gallery.map((image) => (
              <figure key={image.path}>
                {/* A signed URL from the private bucket, readable only by this article's audience. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url as string} alt={image.alt} loading="lazy" decoding="async" />
                {image.alt ? <figcaption>{image.alt}</figcaption> : null}
              </figure>
            ))}
          </section>
        ) : null}

        {mine ? (
          <aside className="owner-actions">
            <div>
              <strong>This is your report.</strong>
              <span>
                {article.visibility === "media_only"
                  ? `Media organisations and Vera admins can read it under ${bylineName(author)}. Other members cannot.`
                  : `Every member can read it under ${bylineName(author)}.`}
                {" "}Nothing links it to your wallet.
              </span>
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
