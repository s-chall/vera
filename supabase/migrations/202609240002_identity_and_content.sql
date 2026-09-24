-- Identity, publishing and verification, layered on the payout engine.
--
-- The payout engine owns `journalists` and `articles` but models them only as
-- far as payouts need: an alias with a wallet, and an article with a slug. This
-- adds what a reader-facing app needs (a byline people can see, article text,
-- following, and a verification state) without forking either table.

-- ---------------------------------------------------------------- journalists

-- Signup happens long before anyone has a wallet, and most accounts are readers
-- who will never have one. The payout engine already skips a journalist with no
-- eligible score, and its address format check passes over NULL.
alter table public.journalists alter column payout_address drop not null;

-- The four seeded reporters are editorial fixtures with no auth user behind
-- them. read-own policies compare against owner_user_id and a NULL never
-- matches, so this opens nothing.
alter table public.journalists alter column owner_user_id drop not null;

alter table public.journalists
  add column if not exists seal        text not null default 'seal-a',
  add column if not exists beat        text not null default '',
  add column if not exists region      text not null default 'Region withheld',
  add column if not exists bio         text not null default '',
  add column if not exists verified_at timestamptz;

comment on column public.journalists.verified_at is
  'Set only by an out-of-band review. Never writable by the account holder; see protect_journalist_fields().';

-- ------------------------------------------------------------------- articles

alter table public.articles
  add column if not exists title     text,
  add column if not exists dek       text not null default '',
  add column if not exists body      text[] not null default '{}',
  add column if not exists art       text not null default 'paper',
  add column if not exists category  text not null default 'Filed',
  add column if not exists read_mins integer not null default 1 check (read_mins > 0);

create index if not exists articles_published_at_idx
  on public.articles (published_at desc);

-- ------------------------------------------------------------------- follows

create table if not exists public.follows (
  follower_id uuid not null references public.journalists (id) on delete cascade,
  author_id   uuid not null references public.journalists (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, author_id),
  check (follower_id <> author_id)
);

create index if not exists follows_author_id_idx on public.follows (author_id);

alter table public.follows enable row level security;
alter table public.follows force row level security;

-- --------------------------------------------------------------- helpers

create or replace function public.current_journalist_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.journalists where owner_user_id = (select auth.uid());
$$;

-- Who you read is nobody's business, the reporter's included.
create policy follows_read_own on public.follows
  for select to authenticated using (follower_id = public.current_journalist_id());
create policy follows_insert_own on public.follows
  for insert to authenticated with check (follower_id = public.current_journalist_id());
create policy follows_delete_own on public.follows
  for delete to authenticated using (follower_id = public.current_journalist_id());

-- `journalists` is read-own, so a byline cannot be rendered from it. This view
-- exposes the public half and nothing else: no wallet, no owner, no payout
-- switch. Definer by default in PG15+, which is what lets it cross the
-- read-own policy.
create or replace view public.bylines
with (security_barrier = true)
as
select id, public_alias, seal, beat, region, bio, verified_at, created_at
  from public.journalists;

grant select on public.bylines to anon, authenticated;

-- Follows are private, so a count has to come through a definer function.
create or replace function public.follower_count(journalist_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.follows where author_id = journalist_id;
$$;

create or replace function public.byline_stats()
returns table (journalist_id uuid, followers integer, articles integer)
language sql
stable
security definer
set search_path = public
as $$
  select j.id,
         public.follower_count(j.id),
         (select count(*)::integer from public.articles a
           where a.journalist_id = j.id and a.published_at is not null)
    from public.journalists j;
$$;

grant execute on function public.current_journalist_id() to anon, authenticated;
grant execute on function public.follower_count(uuid) to anon, authenticated;
grant execute on function public.byline_stats() to anon, authenticated;

-- ------------------------------------------------------- signup and guards

-- Every signed-in user gets a pseudonym. No email, name, or wallet touches it.
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- A journalist needs to edit their own alias and bio, which means an update
-- policy, which would otherwise let them award themselves the badge or hand
-- their row to another account. SECURITY INVOKER on purpose: the check reads
-- current_user, which under DEFINER would be the owner and pass for everyone.
create or replace function public.protect_journalist_fields()
returns trigger
language plpgsql
as $$
begin
  if new.verified_at is distinct from old.verified_at
     and current_user not in ('service_role', 'supabase_admin', 'postgres') then
    raise exception 'verified_at cannot be set by the account holder'
      using errcode = 'insufficient_privilege';
  end if;

  new.owner_user_id := old.owner_user_id;
  new.created_at    := old.created_at;
  return new;
end;
$$;

drop trigger if exists journalists_protect_fields on public.journalists;
create trigger journalists_protect_fields
  before update on public.journalists
  for each row execute function public.protect_journalist_fields();

create policy journalists_update_own on public.journalists
  for update to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));
