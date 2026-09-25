-- LOCAL DEMO. A sign-in account for Johan Alvarez that owns the example stories.
--
--   johan@vera.test / vera-demo-2026   (journalist, verified, credentialed)
--
-- The stories are seeded under the ownerless Northstar byline in seed.sql, so a
-- hosted deploy still has an author for them. Locally they move to this
-- account, with their earnings credits, so signing in as Johan shows his
-- reporting and what it earned. Local only: config.toml lists this file under
-- [db.seed] sql_paths, which a hosted project never reads.
--
-- The carnet is above 28325, the highest member the CNP register reports, so
-- the displayed credential cannot resolve to a real affiliate.

do $$
declare
  johan_user uuid;
  johan uuid;
begin
  select id into johan_user from auth.users where email = 'johan@vera.test';

  if johan_user is null then
    johan_user := gen_random_uuid();

    -- Token columns must be '' rather than NULL: GoTrue scans them into
    -- non-nullable Go strings and a NULL turns every sign-in into a 500.
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, reauthentication_token, phone_change, phone_change_token
    ) values (
      '00000000-0000-0000-0000-000000000000', johan_user, 'authenticated', 'authenticated',
      'johan@vera.test', extensions.crypt('vera-demo-2026', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"account_type":"journalist"}'::jsonb,
      now(), now(), '', '', '', '', '', '', '', ''
    );

    insert into auth.identities (id, provider_id, user_id, identity_data, provider,
                                 last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), johan_user::text, johan_user,
            jsonb_build_object('sub', johan_user::text, 'email', 'johan@vera.test', 'email_verified', true),
            'email', now(), now(), now());
  end if;

  -- handle_new_user() minted the byline (and a Signet wallet) on insert.
  select id into johan from public.journalists where owner_user_id = johan_user;

  update public.journalists
     set public_alias       = 'Johan Alvarez',
         seal               = 'seal-b',
         beat               = 'Press freedom',
         region             = 'Venezuela',
         bio                = 'Reporting on detentions, censorship and the infrastructure that keeps news reaching people.',
         verified_at        = coalesce(verified_at, now()),
         credential_name    = 'Johan Alvarez',
         credential_carnet  = '30418',
         credential_section = 'Distrito Capital'
   where id = johan;

  -- Move the example stories, and the credits that make up their earnings,
  -- from the ownerless seed byline to this account.
  update public.demo_report_credits c
     set journalist_id = johan
    from public.articles a
    join public.journalists j on j.id = a.journalist_id
   where c.article_id = a.id
     and j.public_alias = 'Northstar' and j.owner_user_id is null;

  update public.articles a
     set journalist_id = johan
    from public.journalists j
   where j.id = a.journalist_id
     and j.public_alias = 'Northstar' and j.owner_user_id is null;

  -- The credential belongs to Johan now, not to every seeded byline.
  update public.journalists
     set credential_name = null, credential_carnet = null, credential_section = null
   where owner_user_id is null;
end $$;
