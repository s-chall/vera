-- Accounts are required. Nothing in Vera is readable without one, and an
-- account means an email and a password, not an anonymous session.
--
-- Also introduces the admin flag, which is the only thing short of
-- service_role that can mark a journalist verified.

-- ------------------------------------------------------------------ admin

alter table public.journalists
  add column if not exists is_admin boolean not null default false;

comment on column public.journalists.is_admin is
  'Grants the ability to verify other journalists. Only service_role can set it; see protect_journalist_fields().';

-- SECURITY DEFINER so it can read journalists past that table's own policies
-- without the calling policy recursing into itself.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select j.is_admin from public.journalists j where j.owner_user_id = (select auth.uid())),
    false);
$$;

-- An admin may set verified_at on anyone. Nobody may set is_admin, or promote
-- themselves by any route that goes through PostgREST. INVOKER on purpose:
-- current_user must be the caller's role for the service_role check to mean
-- anything.
create or replace function public.protect_journalist_fields()
returns trigger
language plpgsql
as $$
declare
  privileged boolean := current_user in ('service_role', 'supabase_admin', 'postgres');
begin
  if new.is_admin is distinct from old.is_admin and not privileged then
    raise exception 'is_admin cannot be changed through the API'
      using errcode = 'insufficient_privilege';
  end if;

  if new.verified_at is distinct from old.verified_at
     and not privileged
     and not public.is_admin() then
    raise exception 'only an admin can change verification'
      using errcode = 'insufficient_privilege';
  end if;

  new.owner_user_id := old.owner_user_id;
  new.created_at    := old.created_at;
  return new;
end;
$$;

-- Verification goes through a function, not a policy. An UPDATE has to read
-- the row first, so an admin policy would need SELECT on journalists, which
-- would hand every admin every reporter's payout_address. This exposes exactly
-- one capability instead: flip verified_at, see nothing else.
create or replace function public.set_verified(target uuid, verified boolean)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  stamp timestamptz;
begin
  if not public.is_admin() then
    raise exception 'only an admin can change verification'
      using errcode = 'insufficient_privilege';
  end if;

  stamp := case when verified then now() else null end;

  update public.journalists
     set verified_at = stamp
   where id = target;

  if not found then
    raise exception 'no such journalist';
  end if;

  return stamp;
end;
$$;

revoke execute on function public.set_verified(uuid, boolean) from anon, public;
grant execute on function public.set_verified(uuid, boolean) to authenticated;

-- -------------------------------------------------- no reading without an account

-- Payout engine policies were written for anon as well; narrow them.
drop policy if exists articles_public_read on public.articles;
create policy articles_read_signed_in on public.articles
  for select to authenticated using (published_at is not null);

drop policy if exists epochs_public_read on public.payout_epochs;
create policy epochs_read_signed_in on public.payout_epochs
  for select to authenticated using (status in ('ready', 'submitted', 'settled'));

drop policy if exists stats_public_read on public.epoch_article_stats;
create policy stats_read_signed_in on public.epoch_article_stats
  for select to authenticated
  using (exists (select 1 from public.payout_epochs e where e.id = epoch_id and e.status in ('ready', 'submitted', 'settled')));

drop policy if exists allocations_public_read on public.epoch_allocations;
create policy allocations_read_signed_in on public.epoch_allocations
  for select to authenticated
  using (exists (select 1 from public.payout_epochs e where e.id = epoch_id and e.status in ('ready', 'submitted', 'settled')));

drop policy if exists chain_events_public_read on public.chain_events;
create policy chain_events_read_signed_in on public.chain_events
  for select to authenticated using (true);

-- Views and helpers were reachable by the anon key; they no longer are.
revoke select on public.bylines from anon;
revoke select on public.public_payout_ledger from anon;
revoke execute on function public.current_journalist_id() from anon;
revoke execute on function public.follower_count(uuid) from anon;
revoke execute on function public.byline_stats() from anon;

-- ------------------------------------------------------- no anonymous accounts

-- Defence in depth. enable_anonymous_sign_ins is off in config.toml and in the
-- hosted dashboard, but if either is ever flipped back on, an anonymous session
-- still cannot mint a byline and so cannot read or write anything.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  adjectives constant text[] := array[
    'Quiet','Amber','Hollow','North','Low','Grey','Far','Still','Salt','Blue',
    'Iron','Pale','Long','Dry','First'];
  nouns constant text[] := array[
    'Current','Harbour','Cedar','Signal','Meridian','Lantern','Ledger','Thicket',
    'Junction','Beacon','Marsh','Relay','Ford','Kiln','Verge'];
  seals constant text[] := array['seal-a','seal-b','seal-c','seal-d','seal-e'];
  candidate text;
  attempt integer := 0;
begin
  if new.email is null or new.email = '' then
    raise exception 'an account needs an email address';
  end if;

  loop
    candidate := adjectives[1 + floor(random() * array_length(adjectives, 1))::int]
              || ' '
              || nouns[1 + floor(random() * array_length(nouns, 1))::int];
    if attempt > 0 then
      candidate := candidate || ' ' || (10 + floor(random() * 89)::int);
    end if;
    exit when not exists (select 1 from public.journalists where public_alias = candidate);
    attempt := attempt + 1;
    if attempt > 25 then
      candidate := 'Reporter ' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
      exit;
    end if;
  end loop;

  insert into public.journalists (owner_user_id, public_alias, seal)
  values (new.id, candidate, seals[1 + floor(random() * array_length(seals, 1))::int]);

  return new;
end;
$$;

grant execute on function public.is_admin() to authenticated;
