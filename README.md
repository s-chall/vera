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

**A seeded admin exists locally:**

```
admin@vera.test / vera-admin-2026
```

That account comes from `supabase/seed-local-admin.sql`, which runs only because
`config.toml` lists it under `[db.seed] sql_paths`. A hosted project never reads
`config.toml`, so deploying this repository creates no administrator anywhere.
To make one on a hosted project, sign up normally and set `is_admin` with
`service_role`.

**Demo accounts**, all with password `vera-demo-2026`:

| Email | Account |
|---|---|
| `johan@vera.test` | Johan Alvarez, verified journalist who owns the example stories |
| `journalist@vera.test` | Ash Meridian, verified journalist |
| `desk@nytimes.com` | Times Desk, media organisation |
| `funder@vera.test` | Quiet Backer, funder |

These come from `supabase/seed-local-demo.sql` and
`supabase/seeds/local_johan_account.sql`, both local only.

On **veras.news** the same four accounts exist, but with a different password,
kept in `VERA_DEMO_PASSWORD` in `/srv/vera/.env` on the server. The one above
is published in this repository, and on a public site that would let anyone
sign in and publish as a verified journalist. They were created by
`supabase/prod/20260925_example_content_and_demo_accounts.sql`, a one-off that
also replaced the placeholder stories there.

Or create your own at **http://localhost:3000/signup**. Three account types:

- **Journalist** — two steps, then a CNP number and cédula are checked live
  against cnpven.org straight after signing in. **Mandatory**: the account
  cannot reach any page until the register confirms it. Signing out is the only
  way past that screen.
- **Media organisation** — needs an email at an allowlisted outlet. Try
  `you@nytimes.com`. A `@gmail.com` address is rejected as you type, and again
  in the signup trigger so the check cannot be skipped from the client.
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

After *adding* a new function, a restart is not enough: the function list is
fixed when the stack starts. Run `npx supabase stop && npx supabase start`.

Otherwise the old code keeps serving, which looks exactly like your change
having no effect.

---

## Tests

```bash
npm run db:reset && npm run test:signup     # 32 checks, access control
npm run db:reset && npm run test:accounts   # 36 checks, account types and verification
npm run db:reset && npm run test:ui         # 21 checks, real browser, needs npm run dev
npm run test:publishing                      # 60 checks (test file not yet in the repo), publish_article and image access
npm run test:publishing-ui                   # 69 checks (test file not yet in the repo), real browser, needs npm run dev
npm run test:body                            # 76 checks (test file not yet in the repo), the stored body format; no stack needed
```

Each asserts on the seeded state, so reset between them. `test:ui` drives
Chromium through all three signup flows and needs the dev server already
running. `test:accounts` needs `VERA_CNP_HMAC_KEY` in `supabase/functions/.env`
(any random value works locally), or the verification checks fail with a 500.
`test:publishing` cleans up after itself. `test:publishing-ui` signs in as the
demo accounts, writes, pastes, publishes, checks the uploaded image bytes carry
no EXIF, and unpublishes what it made. If Playwright's own Chromium build is
missing, point `VERA_CHROMIUM` at any installed Chromium binary instead of
downloading one.

---

### Email confirmation

Off, so signup issues a session immediately. Turning `enable_confirmations` on
under `[auth.email]` in `supabase/config.toml` is the only change needed: the
signup screen already handles the no-session case, and the test helpers already
collect the confirmation mail from Mailpit and follow the link.

Worth turning on before this is real. For a media organisation it is the thing
that proves control of a mailbox at the outlet, rather than only proving they
typed a domain we recognise.

### Translation

An article can be read in Spanish, Portuguese or French. Translations are
**cached** in `article_translations`, so a story is translated once and then
served from the database.

The seeded Spanish translation of the lead story is marked `human` and works out
of the box. For anything else, set `ANTHROPIC_API_KEY` in the
`translate-article` function's secrets. Without it the endpoint returns 501 and
says so rather than failing quietly.

Translation asks for the article **as the calling user**, so it cannot be used to
reach a story the reader is not allowed to see.

### Republication

`article_pickups` records which outlets are running a story, shown in a sidebar
on the article page. Readable by anyone who can read the article; only an admin
can record one, since it is an editorial claim about a third party.

The outlet marks are drawn from the outlet name. No trademarked logo files are
bundled; swap `WORDMARK` in `components/article-pickups.tsx` if you have licence
to use real ones.

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
lib/article-body.ts      the stored article format: parse, serialize, editor DOM
lib/scrub-image.ts       re-encodes images in the browser before upload
lib/supabase.ts          browser client
supabase/migrations/     payout engine first, then identity, accounts, visibility
supabase/functions/      submit-verification, review-verification, finalize-payout
supabase/seed.sql        reporters, articles, media domains
supabase/seed-local-admin.sql  the test admin, local only
tests/                   API and browser suites
```

### Accounts

`account_type` is set at signup and cannot be changed afterwards, along with
`is_admin` and `funding_confirmed_at`. All three are blocked in
`protect_journalist_fields`.

Media organisation domains are checked **inside the signup trigger**, so the
gate cannot be bypassed by calling the API directly.

### Journalist verification

The CNP number is a Colegio Nacional de Periodistas (Venezuela) registration.
Verification submits the same form a person would fill in at
https://cnpven.org/formulario-de-afiliados/ and reads the answer:

| Response | Outcome |
|---|---|
| "no coincide con un afiliado" | rejected, with the reason recorded |
| `Carnet CNP: <the same number>` | approved, byline verified |
| anything else, or the site is unreachable | inconclusive, queued for a reviewer |

It fails closed: an unrecognised answer is never an automatic pass. The match
check requires the register to echo back the number we asked about, so a cached
or unrelated page cannot be read as a success.

**What is stored:** the outcome, and the CNP number as a keyed HMAC for
duplicate detection. The key lives only in the edge function's secrets; the CNP
space is roughly 28,000, so an unkeyed hash would be brute-forced instantly.

**What is not stored:** the cédula, at all. It is used for the request and
discarded. A successful lookup also returns the affiliate's real name, which is
never stored, logged, or returned to the browser.

An admin can still verify by hand through `set_verified()` for anyone the
register cannot settle.

Verification is mandatory, so an inconclusive result holds the account until a
reviewer settles it. **A cnpven.org outage therefore blocks every new journalist
account**, and existing unverified ones. That is the deliberate trade for not
letting an unverified byline publish; if it matters, the queue is the release
valve and someone has to watch it.

**The cost, stated plainly:** this sends a cédula to cnpven.org from the server,
so their logs learn which cédulas are registering with Vera. That is a real
disclosure in Venezuela. The alternative is a reviewer running the lookup from
their own machine, which leaks to CNP either way but not in a pattern tied to
your infrastructure.

To run the live-match test, put a real pair in `.env.test` (gitignored):

```
VERA_TEST_CNP=
VERA_TEST_CEDULA=
```

Both suites skip that check when it is absent. Do not commit a real cédula.

### Who can publish

Only a **verified journalist**. Enforced by `articles_insert_verified`, which
calls `can_publish()`, so it holds against the API and not just the browser.
Media organisations and funders cannot file reports, and neither can a
journalist who has not cleared the CNP register.

Editing and withdrawing your own work stays separate, so someone whose
verification is later removed can still take their reporting down.

### Article visibility

Journalist-authored work defaults to `media_only`; everything else is `members`.
Media organisations and admins read everything.

**Journalists cannot read each other, and funders see only what a journalist
opens up.** Only verified journalists can publish, and their work defaults to
`media_only`, which media organisations and admins can read. The publish dialog
lets the author widen a piece to all members instead; nothing else creates a
`members` article. There are tests pinning this so it cannot drift unnoticed. If
journalists should read each other by default, it is one line in
`202609240006_article_visibility.sql`.

### Publishing

`/write` files through one call, `publish_article()`, which inserts the article
and attaches its images in a single transaction, so readers never see a
half-published piece. It is `SECURITY INVOKER`: every write goes through the
same policies a direct insert would.

- **Body format.** `articles.body` stays `text[]`, one block per entry: `> `
  quote, `## ` heading, `---` divider, anything else a paragraph. Inline
  formatting is a tiny tag set (`<b>`, `<i>`, `<a href>`) that is parsed into
  React elements and never given to `innerHTML`; anything else renders as
  literal text. Only `http(s)` links survive. See `lib/article-body.ts`.
- **Images.** Re-encoded from pixels in the browser before upload, which drops
  EXIF, GPS and embedded thumbnails, then stored in the private `article-media`
  bucket as `<journalist id>/<random uuid>.<ext>`, because a phone's filename is
  metadata too. An image is readable exactly when its article is: the storage
  policy defers to `article_media`, whose policy defers to `articles`. An
  author cannot attach another author's upload, and one upload cannot be
  attached to two articles.
- **What is not uploaded.** Audio, video and documents block publishing, since
  nothing here can strip their metadata. Private source files never leave the
  device.
- **Drafts** are kept in `localStorage` on the author's device, per account,
  and cleared on publish. Attachments are not kept in a draft.

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
- No admin is created for you. `seed-local-admin.sql` is local-only; promote a
  real account with `service_role` instead.

---

## What is not built

Being explicit, because several screens imply otherwise.

- **Payments.** No pool, no contract, no adapter, no on-ramp. Every BTC figure
  and ledger row on the Fund page comes from `lib/content.ts`.
- **Engagement recording.** `engagement_events` has no writer, so the payout
  engine would distribute nothing. Like, comment and share buttons are inert,
  and the feed shows no counts rather than invented ones.
- **The admin review UI.** The backend is built and tested, but there is no
  screen for reviewing verification requests yet.
- **The fund page** is an upstream component not yet connected to the
  database. The feed, editor and profile page are.
- **Profile photos.** The avatar is the account's seal with its initials; there
  is no photo upload. Drafts live only on the author's device, so the profile's
  drafts tab is always empty.
- **Audio, video and document publishing**, which needs server-side metadata
  stripping first. Images are uploaded, scrubbed in the browser.
- Bookmarks, and search beyond filtering the loaded feed.

### Two known contradictions

`journalists.payout_address` only accepts an Ethereum address and the payout
adapter deals in a stablecoin with `0x` transaction hashes, while the Fund page
is denominated in BTC and mentions Lightning. Base was chosen, so the UI copy is
the part that's wrong.

`epoch_allocations` is readable by any member and holds both `journalist_id` and
`payout_address`. Joining it to `bylines` links a pseudonym to a wallet. Nothing
has settled yet so nothing has leaked, but this ships the day payouts do.
