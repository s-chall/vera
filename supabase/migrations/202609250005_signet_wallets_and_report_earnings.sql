-- Custodial Signet balances for the product demo, plus report-level attribution.
-- These are testnet sats: they have no monetary value and are never presented
-- as mainnet Bitcoin.

create table if not exists public.signet_wallets (
  journalist_id       uuid primary key references public.journalists (id) on delete cascade,
  starter_balance_sats bigint not null default 100000 check (starter_balance_sats >= 0),
  created_at           timestamptz not null default now()
);

comment on table public.signet_wallets is
  'In-app Signet test wallets. Balances are denominated in testnet satoshis and have no real-world value.';

alter table public.signet_wallets enable row level security;
alter table public.signet_wallets force row level security;

create policy signet_wallets_read_own on public.signet_wallets
  for select to authenticated
  using (journalist_id = public.current_journalist_id());

revoke insert, update, delete on public.signet_wallets from anon, authenticated;
grant select on public.signet_wallets to authenticated;

-- Give existing accounts the same starter balance as future accounts. This is
-- idempotent, so resetting or replaying migrations never doubles the credit.
insert into public.signet_wallets (journalist_id)
select id from public.journalists
on conflict (journalist_id) do nothing;

create or replace function public.create_signet_wallet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.signet_wallets (journalist_id)
  values (new.id)
  on conflict (journalist_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_journalist_created_create_signet_wallet on public.journalists;
create trigger on_journalist_created_create_signet_wallet
  after insert on public.journalists
  for each row execute function public.create_signet_wallet();

-- Attribute each finalized epoch payout back to the reports that earned the
-- journalist's score. Integer remainders stay unassigned rather than making a
-- report claim more than its exact proportional share.
create or replace view public.article_earnings
with (security_barrier = true)
as
select
  s.article_id,
  s.journalist_id,
  coalesce(sum(
    trunc(a.payout_atomic * s.score / nullif(a.score, 0))
  ), 0)::bigint as earned_sats
from public.epoch_article_stats s
join public.epoch_allocations a
  on a.epoch_id = s.epoch_id
 and a.journalist_id = s.journalist_id
join public.payout_epochs e on e.id = s.epoch_id
where e.status in ('ready', 'submitted', 'settled')
group by s.article_id, s.journalist_id;

grant select on public.article_earnings to authenticated;

create or replace function public.my_signet_wallet()
returns table (starter_sats bigint, earned_sats bigint, balance_sats bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    w.starter_balance_sats,
    coalesce((
      select sum(a.payout_atomic)::bigint
      from public.epoch_allocations a
      join public.payout_epochs e on e.id = a.epoch_id
      where a.journalist_id = w.journalist_id
        and e.status in ('ready', 'submitted', 'settled')
    ), 0)::bigint,
    (w.starter_balance_sats + coalesce((
      select sum(a.payout_atomic)::bigint
      from public.epoch_allocations a
      join public.payout_epochs e on e.id = a.epoch_id
      where a.journalist_id = w.journalist_id
        and e.status in ('ready', 'submitted', 'settled')
    ), 0))::bigint
  from public.signet_wallets w
  where w.journalist_id = public.current_journalist_id();
$$;

revoke all on function public.my_signet_wallet() from public, anon;
grant execute on function public.my_signet_wallet() to authenticated;
