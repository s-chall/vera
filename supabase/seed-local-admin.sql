-- LOCAL DEVELOPMENT ONLY. Seeds the test administrator.
--
-- This file is the gate: it runs only because config.toml lists it in
-- [db.seed] sql_paths, which the Supabase CLI reads for `supabase start` and
-- `supabase db reset`. A hosted project never reads config.toml, so deploying
-- this repository does not create an administrator anywhere.
--
-- Do not add this file to a production deploy script. If you need an admin on a
-- hosted project, create the account normally and set is_admin with
-- service_role, choosing your own password.
--
--   admin@vera.test / vera-admin-2026


-- ---------------------------------------------------------------- admin account
-- A real email/password account for testing, since anonymous sessions are gone.
--   admin@vera.test / vera-admin-2026
-- Local and staging only. Change the password before this reaches anything real.

-- The token columns must be '' rather than NULL: GoTrue scans them into
-- non-nullable Go strings and a NULL turns every sign-in into a 500.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, phone_change, phone_change_token
)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
       'authenticated', 'admin@vera.test', extensions.crypt('vera-admin-2026', extensions.gen_salt('bf')),
       now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
       '', '', '', '', '', '', '', ''
where not exists (select 1 from auth.users where email = 'admin@vera.test');

-- Without an identity row, GoTrue will not accept a password sign-in.
insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
  from auth.users u
 where u.email = 'admin@vera.test'
   and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

-- handle_new_user() already minted a byline for that account; make it the desk.
update public.journalists j
   set public_alias = 'Vera Desk',
       seal         = 'seal-a',
       beat         = 'Editorial',
       region       = 'Newsroom',
       bio          = 'The editorial desk. Verifies reporters and keeps the briefing honest.',
       is_admin     = true,
       verified_at  = now()
  from auth.users u
 where u.email = 'admin@vera.test'
   and j.owner_user_id = u.id
   and j.public_alias <> 'Vera Desk';

-- ------------------------------------------------------- media organisations
-- Domains allowed to open a media_org account. Extend as needed.

insert into public.media_domains (domain, name) values
  ('nytimes.com',        'The New York Times'),
  ('washingtonpost.com', 'The Washington Post'),
  ('theguardian.com',    'The Guardian'),
  ('reuters.com',        'Reuters'),
  ('apnews.com',         'Associated Press'),
  ('bbc.co.uk',          'BBC News'),
  ('elpais.com',         'El País'),
  ('efecto-cocuyo.com',  'Efecto Cocuyo'),
  ('armando.info',       'Armando.info'),
  ('elpitazo.net',       'El Pitazo'),
  ('runrun.es',          'Runrun.es'),
  ('talcualdigital.com', 'TalCual'),
  ('vera.test',          'Vera (testing)')
on conflict (domain) do nothing;
