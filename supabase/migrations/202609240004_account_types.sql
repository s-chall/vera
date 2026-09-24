-- Three kinds of account, and a verification process that keeps no identifying
-- record of the people it verifies.

create type public.account_type as enum ('journalist', 'media_org', 'funder');

alter table public.journalists
  add column if not exists account_type public.account_type not null default 'journalist';

comment on table public.journalists is
  'One row per account of any type. Named for the payout engine that owns it; account_type says what the holder actually is.';

-- ------------------------------------------------ media organisation domains

-- A media_org account may only be created from an address at one of these.
-- Proves the holder has a mailbox at the organisation, which is weaker than
-- proving they represent it, and is the strongest thing an email can show.
create table public.media_domains (
  domain     text primary key check (domain = lower(domain) and domain like '%.%'),
  name       text not null,
  added_at   timestamptz not null default now()
);

alter table public.media_domains enable row level security;
alter table public.media_domains force row level security;

create policy media_domains_read on public.media_domains
  for select to authenticated using (true);

create or replace function public.domain_is_media(address text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.media_domains d
     where d.domain = lower(split_part(address, '@', 2))
  );
$$;

grant execute on function public.domain_is_media(text) to anon, authenticated;

-- ------------------------------------------------------ verification requests

create type public.verification_status as enum ('pending', 'approved', 'rejected');

-- Deliberately holds no legal name, no cedula, and no document after review.
-- Those live on the uploaded file, which a reviewer reads once and which is
-- then destroyed. What survives is the decision.
create table public.verification_requests (
  id               uuid primary key default gen_random_uuid(),
  journalist_id    uuid not null unique references public.journalists (id) on delete cascade,
  status           public.verification_status not null default 'pending',
  cnp_fingerprint  bytea,
  document_path    text,
  submitted_at     timestamptz not null default now(),
  reviewed_at      timestamptz,
  reviewed_by      uuid references public.journalists (id) on delete set null,
  rejection_reason text
);

comment on column public.verification_requests.cnp_fingerprint is
  'HMAC of the CNP number, keyed outside the database. Duplicate detection only. A plain hash would be brute-forceable: the CNP space is roughly 28,000.';
comment on column public.verification_requests.document_path is
  'Private storage object. Set to null and the object deleted the moment a decision is recorded.';

create unique index verification_requests_cnp_idx
  on public.verification_requests (cnp_fingerprint)
  where cnp_fingerprint is not null;

alter table public.verification_requests enable row level security;
alter table public.verification_requests force row level security;

-- An applicant sees their own status and nothing else. Reviewers read through
-- a definer function, so no admin policy exposes the whole table by default.
create policy verification_read_own on public.verification_requests
  for select to authenticated
  using (journalist_id = public.current_journalist_id());

create or replace function public.pending_verifications()
returns table (
  id uuid,
  journalist_id uuid,
  alias text,
  document_path text,
  submitted_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.journalist_id, j.public_alias, v.document_path, v.submitted_at
    from public.verification_requests v
    join public.journalists j on j.id = v.journalist_id
   where v.status = 'pending'
     and public.is_admin()
   order by v.submitted_at;
$$;

grant execute on function public.pending_verifications() to authenticated;

-- Recording a decision is the same moment the document stops existing. Keeping
-- them together means there is no path that approves someone and leaves the
-- identity document behind.
create or replace function public.decide_verification(
  request_id uuid,
  approve boolean,
  reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.verification_requests;
  reviewer uuid := public.current_journalist_id();
begin
  if not public.is_admin() then
    raise exception 'only an admin can review verification'
      using errcode = 'insufficient_privilege';
  end if;

  select * into target from public.verification_requests where id = request_id for update;
  if not found then raise exception 'no such request'; end if;
  if target.status <> 'pending' then raise exception 'request already %', target.status; end if;

  if target.document_path is not null then
    delete from storage.objects
     where bucket_id = 'verification-documents' and name = target.document_path;
  end if;

  update public.verification_requests
     set status           = case when approve then 'approved' else 'rejected' end,
         document_path    = null,
         reviewed_at      = now(),
         reviewed_by      = reviewer,
         rejection_reason = case when approve then null else reason end
   where id = request_id;

  if approve then
    update public.journalists set verified_at = now() where id = target.journalist_id;
  end if;
end;
$$;

grant execute on function public.decide_verification(uuid, boolean, text) to authenticated;

-- ------------------------------------------------------------ funder accounts

-- A funder account is not usable until a contribution is confirmed. Nothing
-- sets this yet: there is no payment rail, contract, or adapter.
alter table public.journalists
  add column if not exists funding_confirmed_at timestamptz;

create or replace function public.account_is_active(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case j.account_type
           when 'funder' then j.funding_confirmed_at is not null
           else true
         end
    from public.journalists j where j.id = target;
$$;

grant execute on function public.account_is_active(uuid) to authenticated;

-- ------------------------------------------------------------- signup guard

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
  wanted public.account_type := coalesce(
    (new.raw_user_meta_data ->> 'account_type')::public.account_type, 'journalist');
  candidate text;
  attempt integer := 0;
begin
  if new.email is null or new.email = '' then
    raise exception 'an account needs an email address';
  end if;

  if wanted = 'media_org' and not public.domain_is_media(new.email) then
    raise exception 'media organisation accounts need an address at a recognised outlet'
      using errcode = 'check_violation';
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

  insert into public.journalists (owner_user_id, public_alias, seal, account_type)
  values (new.id, candidate, seals[1 + floor(random() * array_length(seals, 1))::int], wanted);

  return new;
end;
$$;

-- account_type is set at signup and is not the holder's to change afterwards.
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

  if new.account_type is distinct from old.account_type and not privileged then
    raise exception 'account_type cannot be changed after signup'
      using errcode = 'insufficient_privilege';
  end if;

  if new.funding_confirmed_at is distinct from old.funding_confirmed_at and not privileged then
    raise exception 'funding confirmation is not self-serve'
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
