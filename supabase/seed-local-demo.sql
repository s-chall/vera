-- LOCAL DEVELOPMENT ONLY. Three demo accounts, one per account type.
--
-- Like seed-local-admin.sql, this runs only because config.toml lists it under
-- [db.seed] sql_paths. A hosted project never reads config.toml, so deploying
-- this repository creates none of these accounts.
--
--   journalist@vera.test  / vera-demo-2026   (journalist, verified)
--   desk@nytimes.com      / vera-demo-2026   (media organisation)
--   funder@vera.test      / vera-demo-2026   (funder, funding confirmed)

do $$
declare
  demo record;
  new_user uuid;
begin
  for demo in
    select * from (values
      ('journalist@vera.test', 'journalist'::public.account_type, 'Ash Meridian',  'seal-b',
       'Public records', 'Caracas', 'Files on procurement and vanished paperwork.'),
      ('desk@nytimes.com',     'media_org'::public.account_type,  'Times Desk',    'seal-c',
       'Investigations desk', 'New York', 'Commissioning desk reading reporting filed to Vera.'),
      ('funder@vera.test',     'funder'::public.account_type,     'Quiet Backer',  'seal-d',
       'Supporter', 'Undisclosed', 'Funds the reporting pool.')
    ) as t(email, kind, alias, seal, beat, region, bio)
  loop
    if exists (select 1 from auth.users u where u.email = demo.email) then
      continue;
    end if;

    new_user := gen_random_uuid();

    -- Token columns must be '' rather than NULL: GoTrue scans them into
    -- non-nullable Go strings and a NULL turns every sign-in into a 500.
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, reauthentication_token, phone_change, phone_change_token
    ) values (
      '00000000-0000-0000-0000-000000000000', new_user, 'authenticated', 'authenticated',
      demo.email, extensions.crypt('vera-demo-2026', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('account_type', demo.kind::text),
      now(), now(), '', '', '', '', '', '', '', ''
    );

    insert into auth.identities (id, provider_id, user_id, identity_data, provider,
                                 last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), new_user::text, new_user,
            jsonb_build_object('sub', new_user::text, 'email', demo.email, 'email_verified', true),
            'email', now(), now(), now());

    -- handle_new_user() already minted a byline; give it a recognisable identity.
    update public.journalists
       set public_alias = demo.alias,
           seal         = demo.seal,
           beat         = demo.beat,
           region       = demo.region,
           bio          = demo.bio,
           -- the journalist demo is pre-verified so the shield is visible
           verified_at  = case when demo.kind = 'journalist' then now() else verified_at end,
           -- the funder demo is pre-funded so the account is not inert
           funding_confirmed_at = case when demo.kind = 'funder' then now() else funding_confirmed_at end
     where owner_user_id = new_user;
  end loop;
end $$;
