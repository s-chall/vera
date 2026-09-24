# Vera

Reader-funded reporting with protected journalist identities. Next.js front end,
Supabase for identity and content, and a payout engine that distributes a shared
pool by qualified readership.

## Running it locally

Needs Docker running.

```
npm install
npx supabase start          # Postgres, auth, PostgREST, Studio
npm run dev
```

`supabase start` applies both migrations and `supabase/seed.sql`, so you get the
four reporters and their reporting with nothing else to do. It prints the local
URL and publishable key; put them in `.env.local` (see `.env.example`). Anonymous
sign-ins and a raised signup rate limit are already set in `supabase/config.toml`.

`npm run db:reset` replays every migration and the seed from scratch. Use it
freely, the local database holds nothing you need.

## Tests

```
npm run test:signup   # 30 checks, API level, against the local stack
npm run test:ui       # 41 checks, real browser, needs npm run dev
```

`test:ui` expects a freshly reset database, since it asserts on the seeded feed.
Run `npm run db:reset` first.

## Deploying the schema to a hosted project

Order matters. The payout engine owns `journalists` and `articles`; the identity
migration extends both. `supabase db push` handles it once the project is
linked. By hand, `supabase/setup.sql` concatenates everything in order, or run
these individually:

1. `supabase/reset-legacy-prototype.sql` — **only if** the project still holds
   the old vanilla prototype schema (`profiles`, `pools`, `pledges`). It is
   destructive and deletes every account. Skip it on a fresh project.
2. `supabase/migrations/202609240001_payout_engine.sql`
3. `supabase/migrations/202609240002_identity_and_content.sql`
4. `supabase/migrations/202609240003_require_accounts.sql`
5. `supabase/seed.sql`

Then make sure **Anonymous sign-ins** is **off** under Authentication > Sign In /
Providers, and set up custom SMTP if you want email confirmation on. With
confirmations enabled, signup returns no session and the screen tells the user to
confirm before signing in.

## Accounts

Vera is closed. Nothing is readable without an account, and an account means an
email and a password. Anonymous sessions are refused at three levels: disabled
in `config.toml`, disabled in the hosted dashboard, and `handle_new_user()`
refuses to mint a byline for a user with no email even if the first two are
flipped back on.

Signup is one screen: email, password, and the public alias readers will see.
The email signs you in and appears nowhere else. A trigger mints the byline and
the alias is applied in the same step.

There are two kinds of account. An ordinary one can read, follow and publish.
An admin can additionally verify reporters.

### The test admin

```
admin@vera.test / vera-admin-2026
```

Seeded by `supabase/seed.sql` as the byline **Vera Desk**. Local and staging
only; change the password before this reaches anything real.

An admin's only extra power is verification, deliberately. It is granted through
`set_verified()` rather than an RLS policy, because an UPDATE has to read the row
first, so an admin update policy would require SELECT on `journalists` and hand
every admin every reporter's `payout_address`. The function exposes exactly one
capability and nothing else. `is_admin` itself cannot be set through the API at
all, by anyone, including admins.

## Privacy properties, and their limit

Enforced in Postgres, not in the UI:

- `journalists` is read-own. Bylines reach the client through the `bylines`
  view, which exposes the alias, seal and bio but never `payout_address`,
  `owner_user_id` or `payouts_enabled`.
- `follows` is readable only by the follower. A reporter cannot query who
  follows them. Counts come from `follower_count()`, a definer function.
- `verified_at` is null on every account created through signup, and the shield
  only renders when it is set. `protect_journalist_fields()` rejects any change
  to it except from `service_role` or an admin, and pins `owner_user_id` so a row
  cannot be handed to another account. That trigger is SECURITY INVOKER
  deliberately: it reads `current_user`, which under DEFINER would be the owner
  and would pass for everyone.
- Nothing is readable by the `anon` key. Articles, bylines, the payout ledger
  and every helper function require an authenticated session.
- A journalist cannot publish under another byline or delete another's work.

The limit: `auth.users` and `journalists` live in the same Supabase instance, so
the provider can join a legal identity to a pseudonym. Everything above protects
users from each other, not from Supabase, a breach, or a subpoena. For this
product that gap is the substantive one, and no RLS policy closes it.

## What is still mock

- **Payouts.** No epoch has run. The pool balance, the ledger rows and every BTC
  figure come from `lib/content.ts`. See `BACKEND.md` for the engine.
- **The wallet.** No payout address is attached to any account. `payout_address`
  is nullable precisely because signup happens long before anyone has one.
- **Verification.** There is no review process. The four seeded reporters carry
  the badge because `seed.sql` sets it. It means "seeded by us", not "checked".
- Likes, comments, search, bookmarks and image upload are inert controls.

## Known inconsistency

`journalists.payout_address` validates an Ethereum address
(`^0x[0-9a-fA-F]{40}$`) while the entire interface is denominated in BTC and the
funding dialog says Lightning. One of the two is wrong and it should be settled
before a payout is ever submitted.

## Layout

```
app/                     routes: briefing, article, fund, write, profile
components/              header, signup gate, status badge, fund dialog
lib/vera.tsx             session, data loading, auth and publishing actions
lib/supabase.ts          browser client
lib/content.ts           mock payout data only
supabase/migrations/     payout engine, then identity and content
supabase/seed.sql        four reporters and their reporting
```
