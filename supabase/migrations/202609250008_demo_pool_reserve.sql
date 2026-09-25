-- A visible opening reserve keeps the demo independent of public faucet
-- availability. This is an internal Signet-demo ledger balance, not an
-- on-chain UTXO and not money with real-world value.

create table public.demo_pool_reserve (
  id           integer primary key check (id = 1),
  amount_sats  bigint not null check (amount_sats >= 0),
  description  text not null,
  created_at   timestamptz not null default now()
);

alter table public.demo_pool_reserve enable row level security;
alter table public.demo_pool_reserve force row level security;

revoke all on public.demo_pool_reserve from anon, authenticated;

insert into public.demo_pool_reserve (id, amount_sats, description)
values (1, 250000, 'Opening Signet demo reserve')
on conflict (id) do update
set amount_sats = excluded.amount_sats,
    description = excluded.description;

create or replace function public.internal_pool_balance()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select (
    coalesce((select amount_sats from public.demo_pool_reserve where id = 1), 0)
    + coalesce((select sum(amount_sats) from public.internal_signet_contributions), 0)
  )::bigint;
$$;

grant execute on function public.internal_pool_balance() to anon, authenticated;
