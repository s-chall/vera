"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FilePlus2, ImagePlus, Link2, Quote, ShieldCheck } from "lucide-react";
import { useVera } from "@/lib/vera";

export default function WritePage() {
  const vera = useVera();
  const router = useRouter();
  const [headline, setHeadline] = useState("");
  const [story, setStory] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function publish() {
    if (!headline.trim()) {
      setMessage("Add a headline before publishing.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const article = await vera.publish({ title: headline.trim(), body: story });
      if (article) router.push(`/articles/${article.slug}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main id="main-content" className="page-shell write-page">
      <header className="composer-header">
        <div><span className="overline">Private draft</span><h1>New investigation</h1></div>
        <span><ShieldCheck aria-hidden="true" />Publishing as {vera.me?.alias ?? "…"}</span>
      </header>
      <div className="composer-layout">
        <section className="editor-card">
          <label htmlFor="headline">Headline</label>
          <input id="headline" value={headline} placeholder="Untitled investigation"
            onChange={(event) => setHeadline(event.target.value)} />
          <p>Give readers a clear, specific reason to open this story.</p>

          <label className="lead-upload">
            <ImagePlus aria-hidden="true" />
            <strong>Add a lead image or artwork</strong>
            <span>Image upload is not wired up yet</span>
            <input type="file" accept="image/*" disabled />
          </label>

          <label htmlFor="story">Story</label>
          <textarea id="story" value={story} placeholder="Begin your reporting…"
            onChange={(event) => setStory(event.target.value)} />
          <p className="composer-hint">One paragraph per line. Start a line with &gt; to pull it out as a quote.</p>

          <div className="editor-toolbar" aria-label="Editor tools">
            <button type="button" aria-label="Add link" disabled><Link2 /></button>
            <button type="button" aria-label="Add quote" disabled><Quote /></button>
            <button type="button" aria-label="Attach source" disabled><FilePlus2 /></button>
          </div>
        </section>

        <aside className="publish-panel">
          <span className="overline">Before publishing</span>
          <h2>Protection check</h2>
          <ul>
            <li><CheckCircle2 aria-hidden="true" />Published under {vera.me?.alias ?? "your alias"}</li>
            <li><CheckCircle2 aria-hidden="true" />Byline separated from your wallet</li>
            <li><CheckCircle2 aria-hidden="true" />No email attached to this report</li>
          </ul>
          <button className="button button-accent" onClick={() => void publish()} disabled={saving}>
            {saving ? "Publishing…" : "Publish securely"}
          </button>
          {message ? <p className="form-message" role="status">{message}</p> : null}
        </aside>
      </div>
    </main>
  );
}
