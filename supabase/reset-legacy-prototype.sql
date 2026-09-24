-- DESTRUCTIVE. Removes the vanilla-prototype schema so the payout engine can
-- own `public.articles`. Run this once, before the migrations, and only while
-- the project still holds test data.
--
-- Everything published under the old schema is destroyed. seed.sql puts the
-- four reporters and their articles back.

-- Functions must go before the tables. Several share a signature with their
-- replacements but use different parameter names, and CREATE OR REPLACE cannot
-- rename an input parameter, so replacing them in place fails.
drop function if exists public.profile_stats() cascade;
drop function if exists public.supporter_total(uuid) cascade;
drop function if exists public.follower_count(uuid) cascade;
drop function if exists public.current_profile_id() cascade;
drop function if exists public.protect_profile_fields() cascade;
drop function if exists public.enforce_budget() cascade;

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;

drop table if exists public.reads cascade;
drop table if exists public.pledges cascade;
drop table if exists public.follows cascade;
drop table if exists public.pools cascade;
drop table if exists public.articles cascade;
drop table if exists public.profiles cascade;

-- Old accounts have no journalist row and would sign in to a broken state.
-- journalists.owner_user_id is ON DELETE RESTRICT, so this must happen while
-- no journalist rows exist, which is the case before the migrations run.
delete from auth.users;

-- Expect zero rows:
-- select table_name from information_schema.tables
--  where table_schema = 'public' and table_name in
--        ('profiles','pools','pledges','reads');
