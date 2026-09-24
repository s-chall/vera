# Vera

Reader-funded reporting with protected journalist identities. Next.js front end,
Supabase for accounts and content, and a payout engine that distributes a shared
pool by qualified readership.

---

## Run it

You need **Docker running** and Node 20+. Everything else is local; nothing
touches a hosted project.

```bash
npm install
npx supabase start     # Postgres, auth, PostgREST, storage, Studio
npm run dev
```

Open **http://localhost:3000**.

If you don't have a `.env.local` yet:

```bash
cp .env.example .env.local
```

It already points at the local stack. The key in it is the standard local
development key, identical on every machine and not a secret.

### Other local URLs

| | |
|---|---|
| App | http://localhost:3000 |
| Supabase Studio (browse tables) | http://127.0.0.1:54323 |
| Mailpit (any email the app sends) | http://127.0.0.1:54324 |
| API gateway | http://127.0.0.1:54321 |

The API gateway returns `{"message":"no Route matched with those values"}` at
its root. That is correct; it only serves `/rest/v1/…`, `/auth/v1/…` and
`/functions/v1/…`.

---

## Sign in

Vera is closed. There is no anonymous browsing, so you need an account before
you see anything.

**A seeded admin exists:**

```
admin@vera.test / vera-admin-2026
```

Or create your own at **http://localhost:3000/signup**. Three account types:

- **Journalist** — three steps, ending in CNP number plus an identity document.
  Any image or PDF works locally.
- **Media organisation** — needs an email at an allowlisted outlet. Try
  `you@nytimes.com`. A `@gmail.com` address is rejected as you type.
- **Funder** — creates an account that stays inactive, because there is no
  payment rail yet.

---

## Reset the database

```bash
npm run db:reset
```

Replays every migration and `supabase/seed.sql` from scratch: four reporters,
their articles, the media-domain allowlist, and the admin account. Use it
freely, there is nothing in the local database worth keeping.

**Edge functions are not reloaded by a reset.** After editing one:

```bash
docker restart supabase_edge_runtime_vera
```

Otherwise the old code keeps serving, which looks exactly like your change
having no effect.

---

## Tests

```bash
npm run db:reset && npm run test:signup     # 30 checks, access control
npm run db:reset && npm run test:accounts   # 36 checks, account types and verification
npm run db:reset && npm run test:ui         # 25 checks, real browser, needs npm run dev
```

Each asserts on the seeded state, so reset between them. `test:ui` drives
Chromium through all three signup flows and needs the dev server already
running.

---

## Troubleshooting

**"Could not start" on a dark screen.** The app can't reach Supabase. Check
`npx supabase status`, and that `.env.local` points at `127.0.0.1:54321`.

**Signup fails with "Anonymous sign-ins are disabled".** Expected, and not your
problem: the app uses email and password. If you see it, something is calling
the old anonymous path.

**"Too many sign-ups from this network."** The local rate limit is 500/hour
(`anonymous_users` in `supabase/config.toml`). A hosted project defaults to 30.

**Port already in use.** `npx supabase stop` then `npx supabase start`.

**`supabase start` hangs on a first run.** It is pulling several GB of images.

---

## How it fits together

The browser talks to Supabase directly. There is no API server of your own,
which means **Postgres is the entire access-control system**. A policy mistake
is a breach, not a bug.

```
app/                     routes: news, article, fund, write, profile, signup
components/              feed, editor, profile, fund, signup flow, sign-in gate
lib/vera.tsx             session, data loading, auth, publishing
lib/supabase.ts          browser client
supabase/migrations/     payout engine first, then identity, accounts, visibility
supabase/functions/      submit-verification, review-verification, finalize-payout
supabase/seed.sql        reporters, articles, media domains, admin account
tests/                   API and browser suites
```

### Accounts

`account_type` is set at signup and cannot be changed afterwards, along with
`is_admin` and `funding_confirmed_at`. All three are blocked in
`protect_journalist_fields`.

Media organisation domains are checked **inside the signup trigger**, so the
gate cannot be bypassed by calling the API directly.

### Journalist verification

The CNP number is a Colegio Nacional de Periodistas (Venezuela) registration,
checked at cnpven.org against the holder's cédula. That site has no API, so a
human does the check.

The system deliberately never collects the cédula or the legal name, and does
not keep the document:

1. The applicant uploads to a private bucket, under their own folder.
2. `submit-verification` HMACs the CNP number with a key held only in that
   function's secrets. The CNP space is roughly 28,000, so an unkeyed hash
   would be brute-forced immediately.
3. A reviewer reads the document and runs the cnpven.org lookup **from their own
   machine**. Doing it server-side would tell CNP which pseudonyms are
   registering with Vera.
4. `review-verification` **deletes the document first** and records the outcome
   only if that succeeded, so no path approves someone and leaves their ID
   behind.

What survives: verified or not, who decided, when.

Supabase blocks deleting from `storage.objects` in SQL, which is why deletion
lives in an edge function. `decide_verification` is not callable by a client.

### Article visibility

Journalist-authored work defaults to `media_only`; everything else is `members`.
Media organisations and admins read everything.

**A funder currently sees an empty feed**, because every seeded reporter is a
journalist. There is a test pinning that so it can't drift. If funders should
read the reporting they fund, change the policy in
`202609240006_article_visibility.sql`.

---

## Deploying to a hosted project

`supabase link` then `supabase db push` handles migrations. By hand, run them in
filename order, then `supabase/seed.sql`.

If the project still holds the original vanilla prototype schema (`profiles`,
`pools`, `pledges`), run `supabase/reset-legacy-prototype.sql` first. It is
destructive and deletes every account.

Then:

- Turn **Anonymous sign-ins off** under Authentication > Sign In / Providers.
- Deploy both edge functions and set `VERA_CNP_HMAC_KEY` in their secrets.
  Losing that key loses duplicate detection on CNP numbers.
- Set up custom SMTP. The shared Supabase sender is rate limited and not meant
  for production.
- Change the admin password in `seed.sql`, or don't seed that account at all.

---

## What is not built

Being explicit, because several screens imply otherwise.

- **Payments.** No pool, no contract, no adapter, no on-ramp. Every BTC figure
  and ledger row on the Fund page comes from `lib/content.ts`.
- **Engagement recording.** `engagement_events` has no writer, so the payout
  engine would distribute nothing. Like and comment buttons are inert.
- **The admin review UI.** The backend is built and tested, but the profile page
  is upstream's and still shows fixture data, so there is no screen for
  reviewing verification requests yet.
- **The feed, editor, profile and fund pages** are upstream components not yet
  connected to the database.
- Search, bookmarks and image upload.

### Two known contradictions

`journalists.payout_address` only accepts an Ethereum address and the payout
adapter deals in a stablecoin with `0x` transaction hashes, while the Fund page
is denominated in BTC and mentions Lightning. Base was chosen, so the UI copy is
the part that's wrong.

`epoch_allocations` is readable by any member and holds both `journalist_id` and
`payout_address`. Joining it to `bylines` links a pseudonym to a wallet. Nothing
has settled yet so nothing has leaked, but this ships the day payouts do.
