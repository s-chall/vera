"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase, isConfigured } from "@/lib/supabase";
import type {
  AccountType, Article, ArticleImage, Byline, PendingVerification, PreparedImage, PublishInput, VerificationStatus,
} from "@/lib/types";

const ADJECTIVES = ["Quiet", "Amber", "Hollow", "North", "Low", "Grey", "Far", "Still",
  "Salt", "Blue", "Iron", "Pale", "Long", "Dry", "First"];
const NOUNS = ["Current", "Harbour", "Cedar", "Signal", "Meridian", "Lantern", "Ledger",
  "Thicket", "Junction", "Beacon", "Marsh", "Relay", "Ford", "Kiln", "Verge"];

export const SEALS = ["seal-a", "seal-b", "seal-c", "seal-d", "seal-e"];
/** Mirrors journalists.public_alias: 3 to 64 characters. */
export const ALIAS_SHAPE = /^[A-Za-z0-9][A-Za-z0-9 '-]{2,63}$/;

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

/** Private bucket for article images; read access follows the article. */
const MEDIA_BUCKET = "article-media";
/** Signed image URLs are bearer links, so they are short and re-signed on a timer. */
const SIGNED_URL_SECONDS = 60 * 60;
const RESIGN_CHECK_MS = 10 * 60 * 1000;
/** A URL with less than this left is signed again rather than reused. */
const RESIGN_MARGIN_MS = 15 * 60 * 1000;
/** Storage refuses to sign more than 1000 paths in one request. */
const SIGN_BATCH = 500;

type SignedUrl = { url: string; expiresAt: number };

/**
 * Signs the paths that are missing from the cache or close to expiry, in
 * batches storage accepts, and reuses the rest so an <img> keeps the same src
 * across reloads instead of downloading again. A failed batch leaves the other
 * images alone. Signing only succeeds for images this account can read.
 */
async function signPaths(db: SupabaseClient, cache: Map<string, SignedUrl>, paths: string[]) {
  const now = Date.now();
  const stale = [...new Set(paths)].filter((path) => {
    const hit = cache.get(path);
    return !hit || hit.expiresAt - now < RESIGN_MARGIN_MS;
  });
  for (let start = 0; start < stale.length; start += SIGN_BATCH) {
    const { data, error } = await db.storage.from(MEDIA_BUCKET)
      .createSignedUrls(stale.slice(start, start + SIGN_BATCH), SIGNED_URL_SECONDS);
    if (error || !data) continue;
    data.forEach((entry) => {
      if (entry.path && entry.signedUrl && !entry.error) {
        cache.set(entry.path, { url: entry.signedUrl, expiresAt: now + SIGNED_URL_SECONDS * 1000 });
      }
    });
  }
  const urls = new Map<string, string>();
  paths.forEach((path) => {
    const hit = cache.get(path);
    if (hit) urls.set(path, hit.url);
  });
  return urls;
}

const imagePaths = (articles: Article[]) =>
  articles.flatMap((a) => [a.leadImage, ...a.images].flatMap((image) => (image ? [image.path] : [])));

function withUrls(article: Article, urls: Map<string, string>): Article {
  const fresh = (image: ArticleImage) => ({ ...image, url: urls.get(image.path) ?? image.url });
  return { ...article, leadImage: article.leadImage ? fresh(article.leadImage) : null, images: article.images.map(fresh) };
}

type State = {
  ready: boolean;
  signedIn: boolean;
  meId: string | null;
  email: string | null;
  bylines: Record<string, Byline>;
  articles: Article[];
  following: string[];
  isAdmin: boolean;
  accountType: AccountType | null;
  verification: VerificationStatus | null;
  fundingConfirmed: boolean;
  walletBalanceSats: number;
  walletStarterSats: number;
  walletEarnedSats: number;
  fatal: string | null;
};

const EMPTY: State = {
  ready: false, signedIn: false, meId: null, email: null,
  bylines: {}, articles: [], following: [], isAdmin: false,
  accountType: null, verification: null, fundingConfirmed: false,
  walletBalanceSats: 0, walletStarterSats: 0, walletEarnedSats: 0, fatal: null,
};

type Vera = State & {
  me: Byline | null;
  isAdmin: boolean;
  notice: string | null;
  noticeTone: "error" | "success";
  busy: boolean;
  suggestAlias: () => string;
  byId: (id: string) => Byline | null;
  bySlug: (slug: string) => Article | null;
  authorOf: (article: Article) => Byline | null;
  isFollowing: (id: string) => boolean;
  feed: (filter: string) => Article[];
  signUp: (input: {
    email: string; password: string; alias: string; seal: string;
    accountType: AccountType; bio?: string;
  }) => Promise<{ confirmationRequired: boolean }>;
  needsVerification: boolean;
  canPublish: boolean;
  fundingConfirmed: boolean;
  isMediaDomain: (email: string) => Promise<boolean>;
  submitVerification: (cnpNumber: string, cedula: string) => Promise<void>;
  pendingVerifications: () => Promise<PendingVerification[]>;
  decideVerification: (requestId: string, approve: boolean, reason?: string) => Promise<void>;
  documentUrl: (path: string) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setVerified: (journalistId: string, verified: boolean) => Promise<void>;
  toggleFollow: (id: string) => Promise<void>;
  /** Uploads the images, files the article, reloads. Throws with a readable message. */
  publish: (input: PublishInput) => Promise<Article>;
  unpublish: (id: string) => Promise<void>;
  say: (message: string | null, tone?: "error" | "success") => void;
};

const VeraContext = createContext<Vera | null>(null);

export function useVera() {
  const value = useContext(VeraContext);
  if (!value) throw new Error("useVera must be used inside <VeraProvider>");
  return value;
}

type BylineRow = {
  id: string; public_alias: string; seal: string; beat: string;
  region: string; bio: string; verified_at: string | null;
  credential_name: string | null; credential_carnet: string | null; credential_section: string | null;
};
type MediaRow = { path: string; role: "lead" | "image"; alt: string; position: number };
type ArticleRow = {
  id: string; slug: string; journalist_id: string; title: string | null; dek: string;
  body: string[] | null; art: string; category: string; read_mins: number;
  published_at: string | null; visibility: "members" | "media_only" | null;
  hero_image_url: string | null; hero_image_credit: string | null; hero_image_alt: string | null;
  article_media?: MediaRow[] | null;
};
type StatRow = { journalist_id: string; followers: number; articles: number };
type EarningsRow = { article_id: string; earned_sats: number | string };
type WalletRow = { starter_sats: number | string; earned_sats: number | string; balance_sats: number | string };

function toArticle(row: ArticleRow, urls: Map<string, string>, earnings = new Map<string, number>()): Article {
  const media = [...(row.article_media || [])].sort((a, b) => a.position - b.position);
  const image = (m: MediaRow): ArticleImage => ({ path: m.path, url: urls.get(m.path) ?? null, alt: m.alt });
  const lead = media.find((m) => m.role === "lead");
  return {
    id: row.id,
    slug: row.slug,
    journalistId: row.journalist_id,
    title: row.title as string,
    dek: row.dek,
    body: (row.body || []).filter((block): block is string => typeof block === "string"),
    art: row.art,
    category: row.category,
    readMins: row.read_mins,
    publishedAt: row.published_at ? Date.parse(row.published_at) : null,
    visibility: row.visibility || "members",
    heroImageUrl: row.hero_image_url ?? null,
    heroImageCredit: row.hero_image_credit ?? null,
    heroImageAlt: row.hero_image_alt ?? null,
    earnedSats: earnings.get(row.id) ?? 0,
    leadImage: lead ? image(lead) : null,
    images: media.filter((m) => m.role === "image").map(image),
  };
}

/**
 * publish_article() raises readable messages; pass those through. A table
 * constraint says only its own name, so those get a sentence here.
 */
function publishError(error: { message: string; code?: string }) {
  const constraint: [RegExp, string][] = [
    [/articles_body_size/, "The story is too long: at most 500 paragraphs and about 200 KB of text."],
    [/articles_title_length/, "Titles are 1 to 200 characters."],
    [/articles_dek_length/, "The introduction is at most 400 characters."],
    [/article_media_path_check/, "An image could not be attached. Try again."],
  ];
  const known = constraint.find(([pattern]) => pattern.test(error.message));
  if (known) return new Error(known[1]);
  if (error.code === "23514" || error.code === "P0002" || error.code === "42501") return new Error(error.message);
  return new Error(`Publishing failed: ${error.message}`);
}

export function VeraProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(EMPTY);
  const [notice, setNoticeText] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<"error" | "success">("error");
  const [busy, setBusy] = useState(false);
  // load() runs again after every action and must not throw away a working
  // session over one failed request, so it needs to know what it already has.
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  const signedRef = useRef(new Map<string, SignedUrl>());
  const signedForRef = useRef<string | null>(null);

  // Anything that goes wrong is an error; successes have to say so explicitly.
  // Defaulting this way means a new failure path can never render as reassuring
  // green text.
  const setNotice = useCallback((message: string | null, tone: "error" | "success" = "error") => {
    setNoticeText(message);
    setNoticeTone(tone);
  }, []);

  const load = useCallback(async () => {
    const db = supabase();
    if (!db) {
      setState({ ...EMPTY, ready: true, fatal: "Supabase is not configured. Copy .env.example to .env.local and fill it in." });
      return;
    }

    const { data: { session } } = await db.auth.getSession();

    // Vera is closed. Without a session there is nothing to load and nothing to
    // show but the sign-in screen.
    if (!session) {
      signedRef.current.clear();
      setState({ ...EMPTY, ready: true });
      return;
    }
    // Signed URLs belong to whoever signed them.
    if (signedForRef.current !== session.user.id) {
      signedRef.current.clear();
      signedForRef.current = session.user.id;
    }
    const refreshing = stateRef.current.signedIn;

    const [bylineRes, initialArticleRes, statRes, earningsRes] = await Promise.all([
      db.from("bylines").select("*"),
      db.from("articles").select("*, article_media(path, role, alt, position)")
        .order("published_at", { ascending: false, nullsFirst: false }),
      db.rpc("byline_stats"),
      db.from("article_earnings").select("article_id, earned_sats"),
    ]);

    // A refresh that fails keeps what is on screen; only a first load can fail the app.
    if (bylineRes.error) {
      if (!refreshing) setState({ ...EMPTY, ready: true, fatal: `Could not read bylines: ${bylineRes.error.message}` });
      return;
    }

    // Without the media embed (a project that has not applied the publishing
    // migration yet) the text still loads.
    let articleRes = initialArticleRes;
    if (articleRes.error) {
      articleRes = await db.from("articles").select("*").order("published_at", { ascending: false, nullsFirst: false });
    }
    if (articleRes.error) {
      if (!refreshing) setState({ ...EMPTY, ready: true, fatal: `Could not read articles: ${articleRes.error.message}` });
      return;
    }

    const stats = new Map<string, StatRow>();
    if (!statRes.error && statRes.data) {
      (statRes.data as StatRow[]).forEach((row) => stats.set(row.journalist_id, row));
    }

    const bylines: Record<string, Byline> = {};
    (bylineRes.data as BylineRow[]).forEach((row) => {
      const stat = stats.get(row.id);
      bylines[row.id] = {
        id: row.id,
        alias: row.public_alias,
        seal: row.seal,
        beat: row.beat,
        region: row.region,
        bio: row.bio,
        verified: Boolean(row.verified_at),
        credentialName: row.credential_name,
        credentialCarnet: row.credential_carnet,
        credentialSection: row.credential_section,
        followers: stat ? stat.followers : 0,
        articleCount: stat ? stat.articles : 0,
      };
    });

    const earnings = new Map<string, number>();
    if (!earningsRes.error && earningsRes.data) {
      (earningsRes.data as EarningsRow[]).forEach((row) => earnings.set(row.article_id, Number(row.earned_sats) || 0));
    }

    const articleRows = ((articleRes.data as ArticleRow[]) || []).filter((row) => row.title);
    const paths = articleRows.flatMap((row) => (row.article_media || []).map((m) => m.path));
    const urls = paths.length ? await signPaths(db, signedRef.current, paths) : new Map<string, string>();
    const articles: Article[] = articleRows.map((row) => toArticle(row, urls, earnings));

    const [mineRes, followRes] = await Promise.all([
      db.from("journalists")
        .select("id, is_admin, account_type, funding_confirmed_at")
        .eq("owner_user_id", session.user.id).maybeSingle(),
      db.from("follows").select("author_id"),
    ]);

    // A failed lookup is not evidence that the account is gone, so it never
    // signs anyone out. On a refresh it keeps what is on screen; on first load
    // it reports the failure and keeps the session.
    if (mineRes.error) {
      if (!refreshing) {
        setState({
          ...EMPTY, ready: true, bylines, articles,
          fatal: `Could not load your account: ${mineRes.error.message}`,
        });
      }
      return;
    }

    // No row, and no error: the account really is not there, usually because
    // the database was reset underneath an open tab. Clearing the stale session
    // is right, otherwise the app holds a token for a user that no longer
    // exists and every request fails. Only this browser's session, though.
    if (!mineRes.data) {
      await db.auth.signOut({ scope: "local" });
      setState({ ...EMPTY, ready: true, bylines, articles });
      return;
    }

    const mine = mineRes.data as {
      id: string; is_admin: boolean; account_type: AccountType; funding_confirmed_at: string | null;
    };

    // The alias chosen during signup could not be written without a session.
    try {
      const pending = window.localStorage.getItem("vera.pendingProfile");
      if (pending) {
        const { alias, seal, bio } = JSON.parse(pending);
        await db.from("journalists").update({ public_alias: alias, seal, bio }).eq("id", mine.id);
        window.localStorage.removeItem("vera.pendingProfile");
        const refreshed = await db.from("bylines").select("*").eq("id", mine.id).maybeSingle();
        const row = refreshed.data as BylineRow | null;
        if (row) {
          bylines[row.id] = { ...bylines[row.id], alias: row.public_alias, seal: row.seal, bio: row.bio };
        }
      }
    } catch { /* a stored alias is a convenience, never a blocker */ }
    const [verificationRes, walletRes] = await Promise.all([
      db.from("verification_requests").select("status").maybeSingle(),
      db.rpc("my_signet_wallet").maybeSingle(),
    ]);
    const wallet = walletRes.data as WalletRow | null;
    setState({
      ready: true,
      signedIn: true,
      meId: mine.id,
      email: session.user.email || null,
      bylines,
      articles,
      following: ((followRes.data as { author_id: string }[]) || []).map((r) => r.author_id),
      isAdmin: Boolean(mine.is_admin),
      accountType: mine.account_type,
      fundingConfirmed: Boolean(mine.funding_confirmed_at),
      walletBalanceSats: Number(wallet?.balance_sats) || 0,
      walletStarterSats: Number(wallet?.starter_sats) || 0,
      walletEarnedSats: Number(wallet?.earned_sats) || 0,
      verification: (verificationRes.data as { status: VerificationStatus } | null)?.status ?? null,
      fatal: null,
    });
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Image URLs expire. In a tab left open, re-sign the ones on screen before
  // they do. This touches nothing else, so a failure here cannot sign anyone
  // out or unmount an editor with unsaved attachments.
  useEffect(() => {
    if (!state.signedIn) return;
    const timer = setInterval(async () => {
      const db = supabase();
      const paths = imagePaths(stateRef.current.articles);
      if (!db || !paths.length) return;
      try {
        const urls = await signPaths(db, signedRef.current, paths);
        setState((current) => ({ ...current, articles: current.articles.map((a) => withUrls(a, urls)) }));
      } catch { /* the next tick tries again */ }
    }, RESIGN_CHECK_MS);
    return () => clearInterval(timer);
  }, [state.signedIn]);

  const guard = useCallback(async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await work();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const value = useMemo<Vera>(() => {
    const me = state.meId ? state.bylines[state.meId] || null : null;

    const mustHaveDb = () => {
      const db = supabase();
      if (!db) throw new Error("Supabase is not configured.");
      return db;
    };

    /** The profile row is made by the on_auth_user_created trigger; the read can race it. */
    const waitForProfile = async (userId: string) => {
      const db = mustHaveDb();
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const { data } = await db.from("journalists").select("id").eq("owner_user_id", userId).maybeSingle();
        if (data) return (data as { id: string }).id;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      throw new Error("No profile was created for this account. Check the on_auth_user_created trigger.");
    };

    return {
      ...state,
      me,
      isAdmin: state.isAdmin,
      noticeTone,
      // Verification is mandatory, so a pending or rejected journalist is held
      // just as firmly as one who has not submitted anything.
      needsVerification: state.accountType === "journalist" && !me?.verified,
      // mirrors can_publish() in the database; the policy is the real gate
      canPublish: state.accountType === "journalist" && Boolean(me?.verified),
      notice,
      busy,

      say: setNotice,

      suggestAlias: () => {
        const taken = new Set(Object.values(state.bylines).map((b) => b.alias));
        for (let i = 0; i < 40; i += 1) {
          const candidate = `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
          if (!taken.has(candidate)) return candidate;
        }
        return `${pick(ADJECTIVES)} ${pick(NOUNS)} ${10 + Math.floor(Math.random() * 89)}`;
      },

      byId: (id) => state.bylines[id] || null,
      bySlug: (slug) => state.articles.find((a) => a.slug === slug) || null,
      authorOf: (article) => state.bylines[article.journalistId] || null,
      isFollowing: (id) => state.following.includes(id),

      feed: (filter) => {
        const live = state.articles.filter((a) => a.publishedAt !== null);
        if (filter === "following") {
          return live.filter((a) => state.following.includes(a.journalistId) || a.journalistId === state.meId);
        }
        return live;
      },

      signUp: async ({ email, password, alias, seal, accountType, bio }) => {
        const db = mustHaveDb();
        const { data, error } = await db.auth.signUp({
          email, password,
          options: { data: { account_type: accountType } },
        });
        if (error) {
          if (error.status === 429 || /rate limit/i.test(error.message)) {
            throw new Error("Too many sign-ups from this network. Try again shortly.");
          }
          if (/already registered/i.test(error.message)) {
            throw new Error("That email already has an account. Sign in instead.");
          }
          // The signup trigger raises for an unrecognised outlet. Depending on
          // where GoTrue notices, that arrives either as the message itself or
          // as an opaque database error once its transaction is aborted.
          if (/recognised outlet/i.test(error.message)) {
            throw new Error("That address is not at a news organisation we recognise.");
          }
          if (accountType === "media_org" && /database error|unexpected_failure|transaction is aborted/i.test(error.message)) {
            throw new Error("That address is not at a news organisation we recognise.");
          }
          throw new Error(error.message);
        }
        // With email confirmation on, signUp issues no session. The account
        // and its byline exist; the alias is applied on first sign-in.
        if (!data.session) {
          window.localStorage.setItem("vera.pendingProfile", JSON.stringify({ alias, seal, bio: bio || "" }));
          return { confirmationRequired: true };
        }

        const id = await waitForProfile(data.session.user.id);
        const { error: profileError } = await db.from("journalists")
          .update({ public_alias: alias, seal, bio: bio || "" }).eq("id", id);
        if (profileError) {
          if (profileError.code === "23505") throw new Error("That alias is taken. Pick another.");
          if (profileError.code === "23514") throw new Error("Aliases are 3 to 64 letters, numbers and spaces.");
          throw new Error(`Account made, but the alias did not stick: ${profileError.message}`);
        }
        await load();
        setNotice(`Welcome, ${alias}`, "success");
        return { confirmationRequired: false };
      },

      isMediaDomain: async (email) => {
        const db = mustHaveDb();
        const { data, error } = await db.rpc("domain_is_media", { address: email });
        if (error) return false;
        return Boolean(data);
      },

      // The cedula goes to cnpven.org for the lookup and is never stored. The
      // CNP number is kept only as a keyed HMAC.
      submitVerification: (cnpNumber, cedula) => guard(async () => {
        const db = mustHaveDb();
        if (!state.meId) throw new Error("Sign in first.");

        const { data, error } = await db.functions.invoke("submit-verification", {
          body: { cnpNumber, cedula },
        });

        if (error) {
          // The function returns the reason in the body on a 4xx. A rejection
          // is recorded server-side, so reload before surfacing it: the screen
          // needs to know the request now exists and was refused.
          let detail = "";
          const response = (error as { context?: Response }).context;
          if (response) {
            try { detail = (await response.json())?.message ?? ""; } catch { /* ignore */ }
          }
          await load();
          throw new Error(detail || `Could not verify: ${error.message}`);
        }

        await load();
        setNotice((data as { message?: string })?.message ?? "Submitted for review", "success");
      }),

      pendingVerifications: async () => {
        const db = mustHaveDb();
        const { data, error } = await db.rpc("pending_verifications");
        if (error) throw new Error(error.message);
        return ((data as {
          id: string; journalist_id: string; alias: string;
          document_path: string | null; submitted_at: string;
        }[]) || []).map((row) => ({
          id: row.id,
          journalistId: row.journalist_id,
          alias: row.alias,
          documentPath: row.document_path,
          submittedAt: Date.parse(row.submitted_at),
        }));
      },

      decideVerification: (requestId, approve, reason) => guard(async () => {
        const db = mustHaveDb();
        const { error } = await db.functions.invoke("review-verification", {
          body: { requestId, approve, reason: reason ?? null },
        });
        if (error) throw new Error(error.message);
        await load();
        setNotice(approve ? "Verified" : "Rejected", "success");
      }),

      documentUrl: async (path) => {
        const db = mustHaveDb();
        const { data, error } = await db.storage.from("verification-documents")
          .createSignedUrl(path, 300);
        return error ? null : data.signedUrl;
      },

      signIn: (email, password) => guard(async () => {
        const db = mustHaveDb();
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message);
        await load();
      }),

      signOut: () => guard(async () => {
        const db = mustHaveDb();
        const { error } = await db.auth.signOut();
        if (error) throw new Error(error.message);
        // Unpublished drafts can name sources. They do not outlive the session
        // on a device someone else may use next.
        try {
          Object.keys(window.localStorage)
            .filter((key) => key.startsWith("vera.draft."))
            .forEach((key) => window.localStorage.removeItem(key));
        } catch { /* storage unavailable: nothing was saved there either */ }
        await load();
        setNotice("Signed out", "success");
      }),

      setVerified: (journalistId, verified) => guard(async () => {
        const db = mustHaveDb();
        const { error } = await db.rpc("set_verified", { target: journalistId, verified });
        if (error) throw new Error(`Could not change verification: ${error.message}`);
        await load();
        setNotice(verified ? "Marked verified" : "Verification removed", "success");
      }),

      toggleFollow: (id) => guard(async () => {
        const db = mustHaveDb();
        if (!state.meId) throw new Error("Sign in first.");
        const on = !state.following.includes(id);
        const { error } = on
          ? await db.from("follows").insert({ follower_id: state.meId, author_id: id })
          : await db.from("follows").delete().eq("follower_id", state.meId).eq("author_id", id);
        if (error) throw new Error(`Could not update follow: ${error.message}`);
        await load();
      }),

      // Images go up first, under random names in the author's own folder,
      // because publish_article() checks they exist before attaching them.
      // It then files the text and the attachments in one transaction; if
      // anything fails, the uploads are removed so nothing is left behind.
      publish: async ({ title, dek, body, visibility, leadImage, images }) => {
        const db = mustHaveDb();
        if (!state.meId) throw new Error("Sign in first.");
        const bucket = db.storage.from(MEDIA_BUCKET);

        const queue: { role: "lead" | "image"; image: PreparedImage }[] = [
          ...(leadImage ? [{ role: "lead" as const, image: leadImage }] : []),
          ...images.map((image) => ({ role: "image" as const, image })),
        ];
        const planned = queue.map((entry) => ({
          ...entry,
          path: `${state.meId}/${crypto.randomUUID()}.${entry.image.extension}`,
        }));

        const uploads = await Promise.allSettled(planned.map(async ({ path, image }) => {
          const { error } = await bucket.upload(path, image.blob, { contentType: image.type, upsert: false });
          if (error) throw new Error(`An image could not be uploaded: ${error.message}`);
          return path;
        }));
        const uploaded = uploads.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
        const discard = async () => {
          if (uploaded.length) await bucket.remove(uploaded);
        };

        const failed = uploads.find((result): result is PromiseRejectedResult => result.status === "rejected");
        if (failed) {
          await discard();
          throw failed.reason instanceof Error ? failed.reason : new Error(String(failed.reason));
        }

        const { data, error } = await db.rpc("publish_article", {
          headline: title,
          standfirst: dek,
          blocks: body,
          audience: visibility,
          media: planned.map(({ role, path, image }) => ({ role, path, alt: image.alt })),
        });
        if (error) {
          await discard();
          throw publishError(error);
        }

        await load();
        return toArticle(data as ArticleRow, new Map());
      },

      // Images first. Deleting the object is the only thing that revokes a
      // signed URL a reader already holds, so if that fails nothing else
      // happens and the author is told.
      unpublish: (id) => guard(async () => {
        const db = mustHaveDb();
        const article = state.articles.find((a) => a.id === id);
        const paths = article ? imagePaths([article]) : [];
        if (paths.length) {
          const { error } = await db.storage.from(MEDIA_BUCKET).remove(paths);
          if (error) throw new Error(`Could not remove the images, so nothing was unpublished: ${error.message}`);
          paths.forEach((path) => signedRef.current.delete(path));
        }
        const { error } = await db.from("articles").delete().eq("id", id);
        if (error) throw new Error(`Unpublishing failed: ${error.message}`);
        await load();
        setNotice("Article unpublished", "success");
      }),
    };
  }, [state, notice, noticeTone, setNotice, busy, guard, load]);

  return <VeraContext.Provider value={value}>{children}</VeraContext.Provider>;
}
