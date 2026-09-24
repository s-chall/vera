"use client";

import { Languages } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type Translation = { language: string; title: string; dek: string; body: string[] };

const NAMES: Record<string, string> = {
  en: "English",
  es: "Español",
  pt: "Português",
  fr: "Français",
};

const OFFERED = ["es", "pt", "fr"];

export function ArticleTranslate({
  articleId, active, onChange,
}: {
  articleId: string;
  active: string;
  onChange: (translation: Translation | null) => void;
}) {
  const [available, setAvailable] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const db = supabase();
    if (!db) return;
    void db.rpc("article_languages", { target: articleId }).then(({ data }) => {
      if (!cancelled) setAvailable(((data as { language: string }[]) ?? []).map((row) => row.language));
    });
    return () => { cancelled = true; };
  }, [articleId]);

  const show = useCallback(async (language: string) => {
    const db = supabase();
    if (!db) return;

    if (language === "en") { onChange(null); setError(""); return; }

    setBusy(language);
    setError("");
    try {
      // Cached translations come straight from the table; anything missing goes
      // to the function, which translates once and stores the result.
      const stored = await db.from("article_translations")
        .select("language, title, dek, body")
        .eq("article_id", articleId).eq("language", language).maybeSingle();

      if (stored.data) { onChange(stored.data as Translation); return; }

      const { data, error: failed } = await db.functions.invoke("translate-article", {
        body: { articleId, language },
      });
      if (failed) {
        let detail = "";
        const response = (failed as { context?: Response }).context;
        if (response) { try { detail = (await response.json())?.error ?? ""; } catch { /* ignore */ } }
        throw new Error(detail || failed.message);
      }
      onChange(data as Translation);
      setAvailable((current) => (current.includes(language) ? current : [...current, language]));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(null);
    }
  }, [articleId, onChange]);

  return (
    <div className="translate-bar">
      <span className="translate-label"><Languages aria-hidden="true" size={15} />Read in</span>
      <div className="translate-options" role="group" aria-label="Choose a language">
        <button type="button" aria-pressed={active === "en"} disabled={Boolean(busy)}
          onClick={() => void show("en")}>English</button>
        {OFFERED.map((language) => (
          <button key={language} type="button" aria-pressed={active === language} disabled={Boolean(busy)}
            onClick={() => void show(language)}>
            {busy === language ? "Translating…" : NAMES[language]}
            {available.includes(language) ? <span className="translate-ready" aria-hidden="true" /> : null}
          </button>
        ))}
      </div>
      {error ? <p className="translate-error" role="status">{error}</p> : null}
    </div>
  );
}
