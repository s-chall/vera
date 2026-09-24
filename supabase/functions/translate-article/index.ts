// Translates a report and caches the result, so a story is translated once and
// then served from the database.
//
// Needs ANTHROPIC_API_KEY in this function's secrets. Without it the endpoint
// reports that translation is unconfigured and the app falls back to whatever
// translations already exist, which is how the seeded Spanish demo works.
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "claude-sonnet-5";

const LANGUAGES: Record<string, string> = {
  es: "Spanish",
  en: "English",
  pt: "Portuguese",
  fr: "French",
};

const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

type Article = { id: string; title: string; dek: string; body: string[] };

async function translate(article: Article, language: string, apiKey: string) {
  const target = LANGUAGES[language];

  // The body is sent as a JSON array so paragraph breaks and the leading ">"
  // that marks a pull quote survive the round trip.
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      system:
        `You translate investigative journalism into ${target}. Translate faithfully: ` +
        `keep names, figures and quoted speech exact, preserve a leading "> " on any ` +
        `paragraph that has one, and do not summarise, soften or add anything. ` +
        `Reply with JSON only, shaped {"title":string,"dek":string,"body":string[]}, ` +
        `where body has exactly the same number of entries as the input.`,
      messages: [{
        role: "user",
        content: JSON.stringify({ title: article.title, dek: article.dek, body: article.body }),
      }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Translation provider returned ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  const payload = await response.json();
  const text = payload?.content?.[0]?.text ?? "";
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);

  let parsed: { title?: string; dek?: string; body?: string[] };
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Translation came back in an unreadable shape");
  }
  if (!parsed.title || !Array.isArray(parsed.body) || parsed.body.length !== article.body.length) {
    throw new Error("Translation did not match the shape of the original");
  }
  return { title: parsed.title, dek: parsed.dek ?? "", body: parsed.body };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authorization = request.headers.get("authorization");
  if (!authorization) return Response.json({ error: "Not signed in" }, { status: 401 });

  const admin = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = authorization.replace(/^Bearer\s+/i, "");
  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) return Response.json({ error: "Not signed in" }, { status: 401 });

  let body: { articleId?: string; language?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected JSON" }, { status: 400 });
  }

  const language = (body.language ?? "").toLowerCase();
  if (!body.articleId) return Response.json({ error: "articleId is required" }, { status: 400 });
  if (!LANGUAGES[language]) {
    return Response.json({ error: `Unsupported language: ${language}` }, { status: 400 });
  }

  // Already translated, or seeded by hand: serve it and skip the provider.
  const cached = await admin.from("article_translations")
    .select("title, dek, body, source").eq("article_id", body.articleId).eq("language", language).maybeSingle();
  if (cached.data) return Response.json({ ...cached.data, language, cached: true });

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return Response.json({
      error: "Translation is not configured. Set ANTHROPIC_API_KEY in this function's secrets.",
    }, { status: 501 });
  }

  // The caller must already be able to read the article; ask as them, not as
  // service_role, so translation cannot be used to reach a restricted story.
  const asCaller = createClient(required("SUPABASE_URL"), required("SUPABASE_ANON_KEY"), {
    global: { headers: { authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: article } = await asCaller.from("articles")
    .select("id, title, dek, body").eq("id", body.articleId).maybeSingle();
  if (!article) return Response.json({ error: "No such article" }, { status: 404 });

  let translated;
  try {
    translated = await translate(article as Article, language, apiKey);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }

  await admin.from("article_translations").upsert({
    article_id: body.articleId,
    language,
    title: translated.title,
    dek: translated.dek,
    body: translated.body,
    source: "machine",
  }, { onConflict: "article_id,language" });

  return Response.json({ ...translated, language, cached: false });
});
