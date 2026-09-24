"use client";

import Link from "next/link";
import { Camera, CheckCircle2, ChevronRight, Clock3, FilePenLine, Settings2 } from "lucide-react";
import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";

const published = [
  { title: "The public contracts nobody was meant to compare", date: "Sep 14", views: "24,381", likes: "1,204", earned: "0.00642 BTC" },
  { title: "A river authority’s missing inspection records", date: "Aug 28", views: "18,704", likes: "892", earned: "0.00489 BTC" },
  { title: "Inside the towns being erased from the official map", date: "Aug 02", views: "11,906", likes: "611", earned: "0.00318 BTC" },
];

const drafts = [
  { title: "Untitled investigation", updated: "Edited 18 minutes ago" },
  { title: "Notes from the northern water hearing", updated: "Edited yesterday" },
];

export function JournalistProfile() {
  const [tab, setTab] = useState<"published" | "drafts">("published");
  const [photo, setPhoto] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);

  const changePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (photo) URL.revokeObjectURL(photo);
    setPhoto(URL.createObjectURL(file));
    event.target.value = "";
  };

  return (
    <main id="main-content" className="page-shell profile-page profile-page--journalist">
      <header className="journalist-profile-header">
        <div className="journalist-photo-wrap">
          {photo ? <img className="journalist-photo" src={photo} alt="Your profile preview" /> : <span className="journalist-photo-placeholder" aria-hidden="true">QC</span>}
          <button className="journalist-photo-button" type="button" aria-label="Upload profile photo" onClick={() => photoInput.current?.click()}><Camera aria-hidden="true" /></button>
          <input className="writer-visually-hidden" ref={photoInput} type="file" accept="image/*" tabIndex={-1} onChange={changePhoto} />
        </div>
        <div className="journalist-profile-copy">
          <div className="journalist-name-line"><h1>Quiet Current</h1><span><CheckCircle2 aria-hidden="true" />Verified journalist</span></div>
          <p>Reporting on public institutions, environmental records, and the people affected when accountability disappears.</p>
          <span className="journalist-handle">@quietcurrent</span>
        </div>
        <button className="secondary-button journalist-settings" type="button"><Settings2 aria-hidden="true" />Settings</button>
      </header>

      <section className="profile-summary" aria-label="Journalist summary">
        <article className="profile-wallet-compact">
          <div className="profile-wallet-value"><span>Bitcoin balance</span><strong>0.01842 BTC</strong><small>≈ $1,212.40</small></div>
          <div className="profile-wallet-actions"><button type="button">Withdraw</button><button type="button">Payout history</button></div>
        </article>
      </section>

      <section className="profile-work">
        <div className="profile-work-heading">
          <div><h2>Your articles</h2></div>
          <Link className="profile-new-article" href="/write"><FilePenLine aria-hidden="true" />New article</Link>
        </div>
        <div className="profile-tabs" role="tablist" aria-label="Article status">
          <button type="button" role="tab" aria-selected={tab === "published"} onClick={() => setTab("published")}>Published <span>3</span></button>
          <button type="button" role="tab" aria-selected={tab === "drafts"} onClick={() => setTab("drafts")}>Drafts <span>2</span></button>
        </div>

        {tab === "published" ? (
          <div className="profile-article-list" role="tabpanel" aria-label="Published articles">
            {published.map((article) => <Link className="profile-article-row" href="/articles/inside-the-towns-being-erased" key={article.title}><div><span>Published {article.date}</span><h3>{article.title}</h3><p>{article.views} views <i aria-hidden="true">·</i> {article.likes} likes</p></div><div className="profile-article-earnings"><span>Earned</span><strong>{article.earned}</strong></div><ChevronRight aria-hidden="true" /></Link>)}
          </div>
        ) : (
          <div className="profile-article-list" role="tabpanel" aria-label="Draft articles">
            {drafts.map((article) => <Link className="profile-article-row profile-draft-row" href="/write" key={article.title}><div><span><Clock3 aria-hidden="true" />{article.updated}</span><h3>{article.title}</h3><p>Private draft</p></div><ChevronRight aria-hidden="true" /></Link>)}
          </div>
        )}
      </section>
    </main>
  );
}
