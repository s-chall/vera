import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Heart, Landmark, MessageCircle, Repeat2, Search, ShieldCheck } from "lucide-react";
import { leadStory, reports } from "@/lib/content";

export default function HomePage() {
  return (
    <main id="main-content" className="home-page">
      <div className="feed-layout">
        <div className="feed-column">
          <section className="briefing-banner">
            <span>Thursday’s briefing</span>
            <h1>Reporting worth your attention.</h1>
            <p>Independent investigations selected for public value, not outrage.</p>
          </section>
          <nav className="feed-filter" aria-label="Briefing filters"><button className="active">For you</button><button>Latest</button><button>Following</button></nav>
          <article className="feed-story">
            <header><div className="reporter-avatar">NO</div><div><strong>{leadStory.author}</strong><span><ShieldCheck aria-hidden="true"/>Privately verified · {leadStory.filed}</span></div><Link href="/fund">Support</Link></header>
            <h2><Link href={`/articles/${leadStory.slug}`}>{leadStory.title}</Link></h2>
            <p>{leadStory.summary}</p>
            <Link href={`/articles/${leadStory.slug}`} className="feed-image"><Image src={leadStory.image} alt="A remote mountain town beside a river" fill priority sizes="(max-width: 760px) 100vw, 640px"/></Link>
            <footer><button aria-label="Like report"><Heart aria-hidden="true"/><span>2.8K</span></button><button aria-label="Comment on report"><MessageCircle aria-hidden="true"/><span>184</span></button><button aria-label="Share report"><Repeat2 aria-hidden="true"/><span>391</span></button><Link href={`/articles/${leadStory.slug}`}>Read {leadStory.readTime}<ArrowRight aria-hidden="true"/></Link></footer>
          </article>
          <section className="feed-list" aria-labelledby="more-title">
            <header><h2 id="more-title">More from today</h2><span>Verified investigations</span></header>
            {reports.map((report) => <article className="feed-note" key={report.author}><div className="reporter-avatar">{report.author.slice(0,2).toUpperCase()}</div><div><div className="note-meta"><strong>{report.author}</strong><span>{report.category} · {report.time} read</span></div><h3>{report.title}</h3><p>Documents reviewed by Vera. Sources and publishing identity remain protected.</p><footer><button aria-label={`Like ${report.title}`}><Heart aria-hidden="true"/></button><button aria-label={`Comment on ${report.title}`}><MessageCircle aria-hidden="true"/></button><Link href={`/articles/${leadStory.slug}`}>Read report</Link></footer></div></article>)}
          </section>
        </div>

        <aside className="home-rail">
          <label className="site-search"><span>Search Vera</span><input placeholder="Search reports and journalists"/><Search aria-hidden="true"/></label>
          <section className="rail-fund" aria-labelledby="fund-preview-title"><div className="fund-preview-icon"><Landmark aria-hidden="true"/></div><span className="overline">Community reporting pool</span><h2 id="fund-preview-title">0.4278 BTC</h2><p>Every two weeks, one-sixth is distributed according to qualified readership and support.</p><div className="pool-progress"><span style={{ width: "71%" }}/></div><div className="pool-label"><span>71% funded</span><span>0.6000 goal</span></div><Link className="button button-accent" href="/fund">Fund independent reporting</Link><small><ShieldCheck aria-hidden="true"/>Public payouts. Protected identities.</small></section>
          <section className="rail-explainer"><h2>How Vera is different</h2><p>Journalists are verified privately, publish under protected aliases, and earn from a transparent shared pool.</p><Link href="/fund">See how payouts work <ArrowRight aria-hidden="true"/></Link></section>
        </aside>
      </div>
    </main>
  );
}
