-- Deterministic demo funding: move test-only sats from a user's internal
-- Signet wallet into the reporting pool without relying on a public faucet.

create table public.internal_signet_contributions (
  id            bigint generated always as identity primary key,
  journalist_id uuid not null references public.journalists (id) on delete restrict,
  amount_sats   bigint not null check (amount_sats >= 1000),
  anonymous     boolean not null default true,
  created_at    timestamptz not null default now()
);

create index internal_signet_contributions_journalist_idx
  on public.internal_signet_contributions (journalist_id, created_at desc);

alter table public.internal_signet_contributions enable row level security;
alter table public.internal_signet_contributions force row level security;

create policy internal_contributions_read_own on public.internal_signet_contributions
  for select to authenticated
  using (journalist_id = public.current_journalist_id());

revoke insert, update, delete on public.internal_signet_contributions from anon, authenticated;
grant select on public.internal_signet_contributions to authenticated;

create or replace function public.internal_pool_balance()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(amount_sats), 0)::bigint
  from public.internal_signet_contributions;
$$;

grant execute on function public.internal_pool_balance() to anon, authenticated;

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
    (
      w.starter_balance_sats
      + coalesce((
          select sum(a.payout_atomic)::bigint
          from public.epoch_allocations a
          join public.payout_epochs e on e.id = a.epoch_id
          where a.journalist_id = w.journalist_id
            and e.status in ('ready', 'submitted', 'settled')
        ), 0)
      - coalesce((
          select sum(c.amount_sats)::bigint
          from public.internal_signet_contributions c
          where c.journalist_id = w.journalist_id
        ), 0)
    )::bigint
  from public.signet_wallets w
  where w.journalist_id = public.current_journalist_id();
$$;

create or replace function public.contribute_internal_signet(
  contribution_sats bigint,
  hide_identity boolean default true
)
returns table (contribution_id bigint, wallet_balance_sats bigint, pool_balance_sats bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  contributor uuid := public.current_journalist_id();
  available bigint;
  made_id bigint;
begin
  if contributor is null then
    raise exception 'sign in before contributing' using errcode = 'insufficient_privilege';
  end if;
  if contribution_sats < 1000 then
    raise exception 'minimum contribution is 1,000 sats' using errcode = 'check_violation';
  end if;

  -- One wallet row is the concurrency lock. Two simultaneous requests cannot
  -- both observe and spend the same balance.
  perform 1 from public.signet_wallets where journalist_id = contributor for update;
  if not found then raise exception 'Signet wallet not found'; end if;

  select balance_sats into available from public.my_signet_wallet();
  if contribution_sats > available then
    raise exception 'insufficient Signet balance';
  end if;

  insert into public.internal_signet_contributions (journalist_id, amount_sats, anonymous)
  values (contributor, contribution_sats, hide_identity)
  returning id into made_id;

  return query select
    made_id,
    available - contribution_sats,
    public.internal_pool_balance();
end;
$$;

revoke all on function public.contribute_internal_signet(bigint, boolean) from public, anon;
grant execute on function public.contribute_internal_signet(bigint, boolean) to authenticated;
