-- Showcase report-level circulation without depending on a live Signet faucet.
-- Credits are explicitly demo-only and share the same internal wallet ledger.

create table public.demo_report_credits (
  article_id   uuid primary key references public.articles (id) on delete cascade,
  journalist_id uuid not null references public.journalists (id) on delete restrict,
  amount_sats  bigint not null check (amount_sats > 0),
  reason       text not null default 'Demo reporting payout',
  credited_at  timestamptz not null default now()
);

create index demo_report_credits_journalist_idx
  on public.demo_report_credits (journalist_id, credited_at desc);

alter table public.demo_report_credits enable row level security;
alter table public.demo_report_credits force row level security;

create policy demo_report_credits_read on public.demo_report_credits
  for select to authenticated using (true);

revoke insert, update, delete on public.demo_report_credits from anon, authenticated;
grant select on public.demo_report_credits to authenticated;

-- Give every existing published report a deterministic, visually distinct
-- payout. Replaying this migration cannot duplicate a credit.
with ranked as (
  select id, journalist_id,
         row_number() over (order by published_at, id) as position
  from public.articles
  where published_at is not null
)
insert into public.demo_report_credits (article_id, journalist_id, amount_sats)
select id, journalist_id, 12500 + ((position - 1) % 5) * 2500
from ranked
on conflict (article_id) do nothing;

create or replace function public.credit_demo_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.published_at is not null then
    insert into public.demo_report_credits (article_id, journalist_id, amount_sats)
    values (new.id, new.journalist_id, 12500)
    on conflict (article_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_article_published_demo_credit on public.articles;
create trigger on_article_published_demo_credit
  after insert or update of published_at on public.articles
  for each row execute function public.credit_demo_report();

create or replace view public.article_earnings
with (security_barrier = true)
as
with epoch_earnings as (
  select
    s.article_id,
    s.journalist_id,
    coalesce(sum(trunc(a.payout_atomic * s.score / nullif(a.score, 0))), 0)::bigint as earned_sats
  from public.epoch_article_stats s
  join public.epoch_allocations a
    on a.epoch_id = s.epoch_id
   and a.journalist_id = s.journalist_id
  join public.payout_epochs e on e.id = s.epoch_id
  where e.status in ('ready', 'submitted', 'settled')
  group by s.article_id, s.journalist_id
), combined as (
  select article_id, journalist_id, earned_sats from epoch_earnings
  union all
  select article_id, journalist_id, amount_sats from public.demo_report_credits
)
select article_id, journalist_id, sum(earned_sats)::bigint as earned_sats
from combined
group by article_id, journalist_id;

grant select on public.article_earnings to authenticated;

create or replace function public.journalist_earned_sats(target uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select (
    coalesce((
      select sum(a.payout_atomic)::bigint
      from public.epoch_allocations a
      join public.payout_epochs e on e.id = a.epoch_id
      where a.journalist_id = target
        and e.status in ('ready', 'submitted', 'settled')
    ), 0)
    + coalesce((
      select sum(c.amount_sats)::bigint
      from public.demo_report_credits c
      where c.journalist_id = target
    ), 0)
  )::bigint;
$$;

revoke all on function public.journalist_earned_sats(uuid) from public, anon, authenticated;

create or replace function public.my_signet_wallet()
returns table (starter_sats bigint, earned_sats bigint, balance_sats bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    w.starter_balance_sats,
    public.journalist_earned_sats(w.journalist_id),
    (
      w.starter_balance_sats
      + public.journalist_earned_sats(w.journalist_id)
      - coalesce((
          select sum(c.amount_sats)::bigint
          from public.internal_signet_contributions c
          where c.journalist_id = w.journalist_id
        ), 0)
    )::bigint
  from public.signet_wallets w
  where w.journalist_id = public.current_journalist_id();
$$;

revoke all on function public.my_signet_wallet() from public, anon;
grant execute on function public.my_signet_wallet() to authenticated;
