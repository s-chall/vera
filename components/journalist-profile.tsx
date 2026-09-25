"use client";

import Link from "next/link";
import { CheckCircle2, ChevronRight, Clock3, FilePenLine, LogOut, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { useVera } from "@/lib/vera";
import type { Article } from "@/lib/types";

const initials = (alias: string) =>
  alias.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();

const TYPE_LABEL = {
  journalist: "Journalist",
  media_org: "Media organisation",
  funder: "Funder",
} as const;

function when(at: number | null) {
  if (!at) return "Draft";
  return new Date(at).toLocaleDateString([], { month: "short", day: "numeric" });
}

const sats = (amount: number) => new Intl.NumberFormat().format(amount);

export function JournalistProfile() {
  const vera = useVera();
  const [tab, setTab] = useState<"published" | "drafts">("published");
  const me = vera.me;

  if (!vera.ready || !me) {
    return <main id="main-content" className="page-shell profile-page"><p>Loading your workspace…</p></main>;
  }

  const mine = vera.articles.filter((a) => a.journalistId === vera.meId);
  const published = mine.filter((a) => a.publishedAt !== null);
  const drafts = mine.filter((a) => a.publishedAt === null);
  const shown: Article[] = tab === "published" ? published : drafts;
  return (
    <main id="main-content" className="page-shell profile-page profile-page--journalist">
      <header className="journalist-profile-header">
        <div className="journalist-photo-wrap">
          <span className={`journalist-photo-placeholder identity-seal ${me.seal}`} aria-hidden="true">
            {initials(me.alias)}
          </span>
        </div>
        <div className="journalist-profile-copy">
          <div className="journalist-name-line">
            <h1>{me.alias}</h1>
            {/* Verification is a journalist concept. A media organisation or
                funder is neither verified nor unverified, so it says nothing. */}
            {me.verified
              ? <span><CheckCircle2 aria-hidden="true" />Verified {TYPE_LABEL[vera.accountType ?? "journalist"].toLowerCase()}</span>
              : vera.accountType === "journalist"
                ? <span className="journalist-unverified"><ShieldAlert aria-hidden="true" />Not verified</span>
                : null}
          </div>
          <p>{me.bio || "No bio yet."}</p>
          <span className="journalist-handle">
            {TYPE_LABEL[vera.accountType ?? "journalist"]}
            {me.beat ? ` · ${me.beat}` : ""}
            {me.region ? ` · ${me.region}` : ""}
          </span>
        </div>
        <button className="secondary-button journalist-settings" type="button"
          disabled={vera.busy} onClick={() => void vera.signOut()}>
          <LogOut aria-hidden="true" />Sign out
        </button>
      </header>

      <section className="profile-summary" aria-label="Account summary">
        <article className="profile-wallet-compact">
          <div className="profile-wallet-value">
            <span>Signet wallet</span>
            <strong>{sats(vera.walletBalanceSats)} sats</strong>
            <small>
              {vera.walletEarnedSats > 0
                ? `${sats(vera.walletStarterSats)} starter sats · ${sats(vera.walletEarnedSats)} in report payouts · Signet demo ledger`
                : `${sats(vera.walletStarterSats)} sats loaded · Ready for demo transfers · No real-world value`}
            </small>
          </div>
        </article>
        <article className="profile-wallet-compact">
          <div className="profile-wallet-value">
            <span>Signed in as</span>
            <strong className="profile-email">{vera.email}</strong>
            <small>Stored in the auth system, never shown on your byline.</small>
          </div>
        </article>
      </section>

      {vera.accountType === "funder" || !vera.canPublish ? null : (
        <section className="profile-work">
          <div className="profile-work-heading">
            <div><h2>Your articles</h2></div>
            {vera.canPublish
              ? <Link className="profile-new-article" href="/write"><FilePenLine aria-hidden="true" />New article</Link>
              : null}
          </div>
          <div className="profile-tabs" role="tablist" aria-label="Article status">
            <button type="button" role="tab" aria-selected={tab === "published"}
              onClick={() => setTab("published")}>Published <span>{published.length}</span></button>
            <button type="button" role="tab" aria-selected={tab === "drafts"}
              onClick={() => setTab("drafts")}>Drafts <span>{drafts.length}</span></button>
          </div>

          {shown.length ? (
            <div className="profile-article-list" role="tabpanel" aria-label={`${tab} articles`}>
              {shown.map((article) => (
                <Link className={`profile-article-row${tab === "drafts" ? " profile-draft-row" : ""}`}
                  href={`/articles/${article.slug}`} key={article.id}>
                  <div>
                    <span>
                      {tab === "drafts" ? <><Clock3 aria-hidden="true" />Not published</> : `Published ${when(article.publishedAt)}`}
                    </span>
                    <h3>{article.title}</h3>
                    <p>
                      {article.category} <i aria-hidden="true">·</i> {article.readMins} min read
                      {article.visibility === "media_only"
                        ? <> <i aria-hidden="true">·</i> Media organisations only</>
                        : null}
                    </p>
                  </div>
                  {tab === "published" ? (
                    <div className="profile-article-earnings">
                      <span>Report payout</span>
                      <strong>{sats(article.earnedSats)} sats</strong>
                    </div>
                  ) : null}
                  <ChevronRight aria-hidden="true" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="feed-empty" role="tabpanel">
              <h2>{tab === "published" ? "Nothing published yet" : "No drafts"}</h2>
              <p>
                {tab === "published"
                  ? "Your reporting will appear here once you publish it."
                  : "Drafts stay on this device, in the editor, until you publish them. Nothing unpublished is stored on Vera."}
              </p>
              <Link className="button button-accent" href="/write">Start writing</Link>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
