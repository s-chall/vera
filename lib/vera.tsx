"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase, isConfigured } from "@/lib/supabase";
import type { AccountType, Article, Byline, PendingVerification, VerificationStatus } from "@/lib/types";

const ADJECTIVES = ["Quiet", "Amber", "Hollow", "North", "Low", "Grey", "Far", "Still",
  "Salt", "Blue", "Iron", "Pale", "Long", "Dry", "First"];
const NOUNS = ["Current", "Harbour", "Cedar", "Signal", "Meridian", "Lantern", "Ledger",
  "Thicket", "Junction", "Beacon", "Marsh", "Relay", "Ford", "Kiln", "Verge"];

export const SEALS = ["seal-a", "seal-b", "seal-c", "seal-d", "seal-e"];
/** Mirrors journalists.public_alias: 3 to 64 characters. */
export const ALIAS_SHAPE = /^[A-Za-z0-9][A-Za-z0-9 '-]{2,63}$/;

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

export function slugify(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
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
  fatal: string | null;
};

const EMPTY: State = {
  ready: false, signedIn: false, meId: null, email: null,
  bylines: {}, articles: [], following: [], isAdmin: false,
  accountType: null, verification: null, fatal: null,
};

type Vera = State & {
  me: Byline | null;
  isAdmin: boolean;
  notice: string | null;
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
  isMediaDomain: (email: string) => Promise<boolean>;
  submitVerification: (cnpNumber: string, cedula: string) => Promise<void>;
  pendingVerifications: () => Promise<PendingVerification[]>;
  decideVerification: (requestId: string, approve: boolean, reason?: string) => Promise<void>;
  documentUrl: (path: string) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setVerified: (journalistId: string, verified: boolean) => Promise<void>;
  toggleFollow: (id: string) => Promise<void>;
  publish: (input: { title: string; body: string }) => Promise<Article | null>;
  unpublish: (id: string) => Promise<void>;
  say: (message: string | null) => void;
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
};
type ArticleRow = {
  id: string; slug: string; journalist_id: string; title: string | null; dek: string;
  body: string[] | null; art: string; category: string; read_mins: number;
  published_at: string | null; visibility: "members" | "media_only" | null;
};
type StatRow = { journalist_id: string; followers: number; articles: number };

export function VeraProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(EMPTY);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      setState({ ...EMPTY, ready: true });
      return;
    }

    const [bylineRes, articleRes, statRes] = await Promise.all([
      db.from("bylines").select("*"),
      db.from("articles").select("*").order("published_at", { ascending: false, nullsFirst: false }),
      db.rpc("byline_stats"),
    ]);

    if (bylineRes.error) {
      setState({ ...EMPTY, ready: true, fatal: `Could not read bylines: ${bylineRes.error.message}` });
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
        followers: stat ? stat.followers : 0,
        articleCount: stat ? stat.articles : 0,
      };
    });

    const articles: Article[] = ((articleRes.data as ArticleRow[]) || [])
      .filter((row) => row.title)
      .map((row) => ({
        id: row.id,
        slug: row.slug,
        journalistId: row.journalist_id,
        title: row.title as string,
        dek: row.dek,
        body: row.body || [],
        art: row.art,
        category: row.category,
        readMins: row.read_mins,
        publishedAt: row.published_at ? Date.parse(row.published_at) : null,
        visibility: row.visibility || "members",
      }));

    const [mineRes, followRes] = await Promise.all([
      db.from("journalists")
        .select("id, is_admin, account_type").eq("owner_user_id", session.user.id).maybeSingle(),
      db.from("follows").select("author_id"),
    ]);

    // A session with no journalist row means the account predates the current
    // schema. Treat it as signed out so the gate offers signup rather than
    // dropping the reader into a half-built profile.
    if (!mineRes.data) {
      await db.auth.signOut();
      setState({ ...EMPTY, ready: true, bylines, articles });
      return;
    }

    const mine = mineRes.data as { id: string; is_admin: boolean; account_type: AccountType };

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
    const verificationRes = await db.from("verification_requests").select("status").maybeSingle();
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
      verification: (verificationRes.data as { status: VerificationStatus } | null)?.status ?? null,
      fatal: null,
    });
  }, []);

  useEffect(() => { void load(); }, [load]);

  const guard = useCallback(async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await work();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
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
      needsVerification:
        state.accountType === "journalist" && state.verification === null && !me?.verified,
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
          // the signup trigger raises this for a media_org address we do not recognise
          if (/recognised outlet/i.test(error.message)) {
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
        setNotice(`Welcome, ${alias}`);
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
          // the function returns the reason in the body on a 4xx
          let detail = "";
          const response = (error as { context?: Response }).context;
          if (response) {
            try { detail = (await response.json())?.message ?? ""; } catch { /* ignore */ }
          }
          throw new Error(detail || `Could not verify: ${error.message}`);
        }

        await load();
        setNotice((data as { message?: string })?.message ?? "Submitted for review");
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
        setNotice(approve ? "Verified" : "Rejected");
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
        await load();
        setNotice("Signed out");
      }),

      setVerified: (journalistId, verified) => guard(async () => {
        const db = mustHaveDb();
        const { error } = await db.rpc("set_verified", { target: journalistId, verified });
        if (error) throw new Error(`Could not change verification: ${error.message}`);
        await load();
        setNotice(verified ? "Marked verified" : "Verification removed");
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

      publish: async ({ title, body }) => {
        const db = mustHaveDb();
        if (!state.meId) throw new Error("Sign in first.");
        const paragraphs = body.split("\n").map((line) => line.trim()).filter(Boolean);
        const firstProse = paragraphs.map((l) => l.replace(/^>\s*/, "").trim()).filter(Boolean)[0];
        const words = body.split(/\s+/).filter(Boolean).length;
        let slug = slugify(title);
        if (!slug) slug = `filed-${Date.now().toString(36)}`;

        const row = {
          journalist_id: state.meId,
          slug,
          title,
          dek: firstProse || "Filed without a summary.",
          body: paragraphs,
          art: "paper",
          category: "Filed",
          read_mins: Math.max(1, Math.round(words / 220)),
          published_at: new Date().toISOString(),
        };

        let result = await db.from("articles").insert(row).select().single();
        if (result.error && result.error.code === "23505") {
          // slug collision: fall back to a unique one rather than failing the write
          result = await db.from("articles")
            .insert({ ...row, slug: `${slug}-${Date.now().toString(36).slice(-4)}` })
            .select().single();
        }
        if (result.error) throw new Error(`Publishing failed: ${result.error.message}`);
        await load();
        const created = result.data as ArticleRow;
        return {
          id: created.id, slug: created.slug, journalistId: created.journalist_id,
          title: created.title as string, dek: created.dek, body: created.body || [],
          art: created.art, category: created.category, readMins: created.read_mins,
          publishedAt: created.published_at ? Date.parse(created.published_at) : null,
          visibility: created.visibility || "members",
        };
      },

      unpublish: (id) => guard(async () => {
        const db = mustHaveDb();
        const { error } = await db.from("articles").delete().eq("id", id);
        if (error) throw new Error(`Unpublishing failed: ${error.message}`);
        await load();
        setNotice("Article unpublished");
      }),
    };
  }, [state, notice, busy, guard, load]);

  return <VeraContext.Provider value={value}>{children}</VeraContext.Provider>;
}
