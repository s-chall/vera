create extension if not exists pgcrypto;

create type public.engagement_kind as enum ('view', 'like');
create type public.epoch_status as enum ('open', 'finalizing', 'ready', 'submitted', 'settled', 'failed');

create table public.journalists (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users(id) on delete restrict,
  public_alias text not null unique check (char_length(public_alias) between 3 and 64),
  payout_address text not null check (payout_address ~ '^0x[0-9a-fA-F]{40}$'),
  payouts_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  journalist_id uuid not null references public.journalists(id) on delete restrict,
  slug text not null unique,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.payout_epochs (
  id bigint generated always as identity primary key,
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  status public.epoch_status not null default 'open',
  pool_balance_atomic numeric(78,0),
  payout_budget_atomic numeric(78,0),
  view_weight integer not null default 1 check (view_weight > 0),
  like_weight integer not null default 4 check (like_weight > 0),
  formula_version text not null default 'qualified-v1',
  manifest_uri text,
  manifest_hash text,
  allocation_root text,
  contract_tx_hash text,
  failure_reason text,
  finalized_at timestamptz,
  submitted_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  check (closes_at > opens_at),
  check (pool_balance_atomic is null or pool_balance_atomic >= 0),
  check (payout_budget_atomic is null or payout_budget_atomic >= 0),
  unique (opens_at),
  exclude using gist (tstzrange(opens_at, closes_at, '[)') with &&)
);

create table public.engagement_events (
  id bigint generated always as identity primary key,
  article_id uuid not null references public.articles(id) on delete restrict,
  audience_key_hash text not null check (char_length(audience_key_hash) = 64),
  kind public.engagement_kind not null,
  qualified boolean not null default false,
  qualification_version text not null default 'qualified-v1',
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (article_id, audience_key_hash, kind)
);

create table public.epoch_article_stats (
  epoch_id bigint not null references public.payout_epochs(id) on delete restrict,
  article_id uuid not null references public.articles(id) on delete restrict,
  journalist_id uuid not null references public.journalists(id) on delete restrict,
  qualified_views bigint not null check (qualified_views >= 0),
  qualified_likes bigint not null check (qualified_likes >= 0),
  score numeric(78,0) not null check (score >= 0),
  primary key (epoch_id, article_id)
);

create table public.epoch_allocations (
  epoch_id bigint not null references public.payout_epochs(id) on delete restrict,
  journalist_id uuid not null references public.journalists(id) on delete restrict,
  payout_address text not null,
  score numeric(78,0) not null check (score > 0),
  total_score numeric(78,0) not null check (total_score > 0),
  payout_atomic numeric(78,0) not null check (payout_atomic >= 0),
  leaf_index integer,
  leaf_hash text,
  primary key (epoch_id, journalist_id)
);

create table public.chain_events (
  id bigint generated always as identity primary key,
  chain_id bigint not null,
  tx_hash text not null,
  log_index integer not null,
  epoch_id bigint references public.payout_epochs(id) on delete restrict,
  event_name text not null,
  payload jsonb not null,
  observed_at timestamptz not null default now(),
  unique (chain_id, tx_hash, log_index)
);

create index articles_journalist_id_idx on public.articles (journalist_id);
create index engagement_events_article_time_qualified_idx
  on public.engagement_events (article_id, occurred_at)
  where qualified = true;
create index engagement_events_time_qualified_idx
  on public.engagement_events (occurred_at)
  where qualified = true;
create index epoch_article_stats_journalist_idx
  on public.epoch_article_stats (epoch_id, journalist_id);
create index epoch_allocations_journalist_idx
  on public.epoch_allocations (journalist_id, epoch_id desc);
create unique index payout_epochs_one_active_idx
  on public.payout_epochs ((true))
  where status in ('open', 'finalizing');

alter table public.journalists enable row level security;
alter table public.journalists force row level security;
alter table public.articles enable row level security;
alter table public.articles force row level security;
alter table public.payout_epochs enable row level security;
alter table public.payout_epochs force row level security;
alter table public.engagement_events enable row level security;
alter table public.engagement_events force row level security;
alter table public.epoch_article_stats enable row level security;
alter table public.epoch_article_stats force row level security;
alter table public.epoch_allocations enable row level security;
alter table public.epoch_allocations force row level security;
alter table public.chain_events enable row level security;
alter table public.chain_events force row level security;

create policy journalists_read_own on public.journalists
  for select to authenticated using ((select auth.uid()) = owner_user_id);
create policy articles_public_read on public.articles
  for select to anon, authenticated using (published_at is not null);
create policy articles_owner_all on public.articles
  for all to authenticated
  using (journalist_id in (select id from public.journalists where owner_user_id = (select auth.uid())))
  with check (journalist_id in (select id from public.journalists where owner_user_id = (select auth.uid())));
create policy epochs_public_read on public.payout_epochs
  for select to anon, authenticated using (status in ('ready', 'submitted', 'settled'));
create policy stats_public_read on public.epoch_article_stats
  for select to anon, authenticated
  using (exists (select 1 from public.payout_epochs e where e.id = epoch_id and e.status in ('ready', 'submitted', 'settled')));
create policy allocations_public_read on public.epoch_allocations
  for select to anon, authenticated
  using (exists (select 1 from public.payout_epochs e where e.id = epoch_id and e.status in ('ready', 'submitted', 'settled')));
create policy chain_events_public_read on public.chain_events
  for select to anon, authenticated using (true);

revoke all on public.engagement_events from anon, authenticated;
revoke insert, update, delete on public.payout_epochs, public.epoch_article_stats,
  public.epoch_allocations, public.chain_events from anon, authenticated;

create or replace function public.finalize_payout_epoch(
  target_epoch_id bigint,
  observed_pool_balance_atomic numeric
) returns public.payout_epochs
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_epoch public.payout_epochs;
  computed_budget numeric(78,0);
  computed_total_score numeric(78,0);
begin
  if observed_pool_balance_atomic < 0 or trunc(observed_pool_balance_atomic) <> observed_pool_balance_atomic then
    raise exception 'Pool balance must be a non-negative atomic integer';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('vera:payout-epoch:' || target_epoch_id::text, 0));

  select * into target_epoch
  from public.payout_epochs
  where id = target_epoch_id
  for update;

  if not found then raise exception 'Epoch % not found', target_epoch_id; end if;
  if target_epoch.status = 'ready' then return target_epoch; end if;
  if target_epoch.status <> 'open' then raise exception 'Epoch % is %', target_epoch_id, target_epoch.status; end if;
  if target_epoch.closes_at > now() then raise exception 'Epoch % has not closed', target_epoch_id; end if;

  update public.payout_epochs set status = 'finalizing' where id = target_epoch_id;

  insert into public.epoch_article_stats (
    epoch_id, article_id, journalist_id, qualified_views, qualified_likes, score
  )
  select
    target_epoch_id,
    a.id,
    a.journalist_id,
    count(*) filter (where ev.kind = 'view'),
    count(*) filter (where ev.kind = 'like'),
    count(*) filter (where ev.kind = 'view') * target_epoch.view_weight
      + count(*) filter (where ev.kind = 'like') * target_epoch.like_weight
  from public.articles a
  join public.engagement_events ev on ev.article_id = a.id
  where ev.qualified = true
    and ev.qualification_version = target_epoch.formula_version
    and ev.occurred_at >= target_epoch.opens_at
    and ev.occurred_at < target_epoch.closes_at
  group by a.id, a.journalist_id
  on conflict (epoch_id, article_id) do nothing;

  select coalesce(sum(s.score), 0) into computed_total_score
  from public.epoch_article_stats s
  join public.journalists j on j.id = s.journalist_id and j.payouts_enabled = true
  where s.epoch_id = target_epoch_id;
  computed_budget := trunc(observed_pool_balance_atomic / 6);

  if computed_total_score > 0 then
    insert into public.epoch_allocations (
      epoch_id, journalist_id, payout_address, score, total_score, payout_atomic
    )
    select
      target_epoch_id,
      s.journalist_id,
      j.payout_address,
      sum(s.score),
      computed_total_score,
      trunc(computed_budget * sum(s.score) / computed_total_score)
    from public.epoch_article_stats s
    join public.journalists j on j.id = s.journalist_id and j.payouts_enabled = true
    where s.epoch_id = target_epoch_id
    group by s.journalist_id, j.payout_address
    having sum(s.score) > 0
    on conflict (epoch_id, journalist_id) do nothing;
  end if;

  update public.payout_epochs
  set status = 'ready',
      pool_balance_atomic = observed_pool_balance_atomic,
      payout_budget_atomic = computed_budget,
      finalized_at = now()
  where id = target_epoch_id
  returning * into target_epoch;

  return target_epoch;
end;
$$;

revoke all on function public.finalize_payout_epoch(bigint, numeric) from public, anon, authenticated;
grant execute on function public.finalize_payout_epoch(bigint, numeric) to service_role;

create or replace view public.public_payout_ledger
with (security_barrier = true)
as
select e.id as epoch_id, e.opens_at, e.closes_at, e.formula_version,
       e.payout_budget_atomic, e.manifest_uri, e.manifest_hash,
       e.contract_tx_hash, j.public_alias, a.score, a.total_score, a.payout_atomic
from public.payout_epochs e
join public.epoch_allocations a on a.epoch_id = e.id
join public.journalists j on j.id = a.journalist_id
where e.status in ('ready', 'submitted', 'settled');

grant select on public.public_payout_ledger to anon, authenticated;
