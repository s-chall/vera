"use client";

import Link from "next/link";
import { EyeOff, FileText, LockKeyhole, LogOut, Settings2, WalletCards } from "lucide-react";
import { useVera } from "@/lib/vera";
import { StatusBadge, UnverifiedNote } from "@/components/status-badge";
import { pool } from "@/lib/content";

export default function ProfilePage() {
  const vera = useVera();
  const me = vera.me;

  const mine = vera.articles.filter((article) => article.journalistId === vera.meId);
  const following = vera.following.map((id) => vera.byId(id)).filter(Boolean);

  if (!me) return <main id="main-content" className="page-shell profile-page"><p>Loading your workspace…</p></main>;

  return (
    <main id="main-content" className="page-shell profile-page">
      <div className="profile-heading">
        <div className={`identity-mark ${me.seal}`} aria-hidden="true"><i /><i /><i /></div>
        <div>
          <StatusBadge verified={me.verified} />
          <h1>{me.alias}</h1>
          <p>Your private journalist workspace. Only you can see the wallet and verification details on this page.</p>
          {!me.verified ? <UnverifiedNote /> : null}
        </div>
        <button className="secondary-button"><Settings2 aria-hidden="true" />Settings</button>
      </div>

      <div className="profile-grid">
        <section className="wallet-card">
          <header><span><WalletCards aria-hidden="true" />Protected wallet</span><b>Not connected</b></header>
          <strong>— <small>BTC</small></strong>
          <p>No payout address is attached to this alias. Payouts begin after an epoch settles.</p>
          <div>
            <Link className="button button-primary" href="/fund">See how payouts work</Link>
          </div>
        </section>

        <section className="privacy-card">
          <span className="overline">Identity separation</span>
          <h2>Your byline stays apart from your identity.</h2>
          <ul>
            <li><LockKeyhole aria-hidden="true" /><span><strong>Verification record</strong>{me.verified ? "Held privately" : "Not yet reviewed"}</span></li>
            <li><EyeOff aria-hidden="true" /><span><strong>Payout wallet</strong>Never shown on your byline</span></li>
            <li><FileText aria-hidden="true" /><span><strong>Who you follow</strong>Readable only by you</span></li>
          </ul>
        </section>
      </div>

      <section className="account-card">
        <span className="overline">Account</span>
        <h2>Signed in as {vera.email}</h2>
        <p>Stored in the auth system, never on your public byline. Nobody reading your
        work can see it.</p>
        {vera.isAdmin ? <p className="admin-flag">This account is an editorial admin and can verify reporters.</p> : null}
        <button className="secondary-button" disabled={vera.busy} onClick={() => void vera.signOut()}>
          <LogOut aria-hidden="true" />Sign out
        </button>
        {vera.notice ? <p className="form-message account-message" role="status">{vera.notice}</p> : null}
      </section>

      {vera.isAdmin ? (
        <section className="your-reporting admin-panel">
          <header>
            <div><span className="overline">Admin</span><h2>Verification</h2></div>
            <span>{Object.keys(vera.bylines).length} bylines</span>
          </header>
          {Object.values(vera.bylines).map((byline) => (
            <div className="profile-report follow-row" key={byline.id}>
              <div>
                <span>{byline.verified ? "Verified" : "Unverified"}</span>
                <h3>{byline.alias}</h3>
                <p>{byline.beat || "No beat set"} · {byline.articleCount} published</p>
              </div>
              <button className="secondary-button" disabled={vera.busy}
                onClick={() => void vera.setVerified(byline.id, !byline.verified)}>
                {byline.verified ? "Remove verification" : "Verify"}
              </button>
            </div>
          ))}
        </section>
      ) : null}

      <section className="your-reporting">
        <header>
          <div><span className="overline">Your reporting</span><h2>Published investigations</h2></div>
          <span>{mine.length} {mine.length === 1 ? "report" : "reports"}</span>
        </header>
        {mine.length ? mine.map((article) => (
          <Link className="profile-report" key={article.id} href={`/articles/${article.slug}`}>
            <div>
              <span>{article.category}</span>
              <h3>{article.title}</h3>
              <p>{article.publishedAt ? new Date(article.publishedAt).toLocaleDateString([], { month: "short", day: "numeric" }) : "Draft"} · {article.readMins} min read</p>
            </div>
            <b>Awaiting first epoch</b>
          </Link>
        )) : (
          <div className="feed-empty">
            <h2>Nothing published yet</h2>
            <p>Your first investigation will appear here and in the briefing.</p>
            <Link className="button button-accent" href="/write">Start writing</Link>
          </div>
        )}
      </section>

      <section className="your-reporting">
        <header>
          <div><span className="overline">Following</span><h2>Reporters you read</h2></div>
          <span>{following.length}</span>
        </header>
        {following.length ? following.map((author) => author ? (
          <div className="profile-report follow-row" key={author.id}>
            <div>
              <span>{author.beat || "Independent"}</span>
              <h3>{author.alias}</h3>
              <p>{author.followers} {author.followers === 1 ? "follower" : "followers"} · {author.articleCount} published</p>
            </div>
            <button className="secondary-button" disabled={vera.busy}
              onClick={() => void vera.toggleFollow(author.id)}>Unfollow</button>
          </div>
        ) : null) : (
          <div className="feed-empty"><p>You are not following anyone yet.</p></div>
        )}
      </section>

      <p className="pool-footnote">Pool figures on the Fund page ({pool.balance} BTC) are still placeholder data. No epoch has run.</p>
    </main>
  );
}
