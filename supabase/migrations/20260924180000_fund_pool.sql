-- Signet Total Pool: watched address balance + deposit UTXOs.

create table public.fund_pool (
  id integer primary key check (id = 1),
  network text not null default 'signet' check (network in ('signet', 'regtest', 'mainnet', 'testnet')),
  address text not null,
  balance_sats bigint not null default 0 check (balance_sats >= 0),
  confirmed_sats bigint not null default 0 check (confirmed_sats >= 0),
  unconfirmed_sats bigint not null default 0 check (unconfirmed_sats >= 0),
  tx_count integer not null default 0 check (tx_count >= 0),
  watch_source text,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fund_deposits (
  id bigint generated always as identity primary key,
  address text not null,
  txid text not null check (char_length(txid) = 64),
  vout integer not null check (vout >= 0),
  amount_sats bigint not null check (amount_sats > 0),
  confirmed boolean not null default false,
  block_height integer,
  observed_at timestamptz not null default now(),
  unique (txid, vout)
);

create table public.fund_contribution_intents (
  id uuid primary key default gen_random_uuid(),
  amount_sats bigint not null check (amount_sats >= 1000),
  anonymous boolean not null default true,
  address text not null,
  status text not null default 'pending' check (status in ('pending', 'detected', 'expired')),
  created_at timestamptz not null default now()
);

create index fund_deposits_address_idx on public.fund_deposits (address);
create index fund_deposits_confirmed_idx on public.fund_deposits (confirmed, observed_at desc);
create index fund_intents_created_idx on public.fund_contribution_intents (created_at desc);

alter table public.fund_pool enable row level security;
alter table public.fund_pool force row level security;
alter table public.fund_deposits enable row level security;
alter table public.fund_deposits force row level security;
alter table public.fund_contribution_intents enable row level security;
alter table public.fund_contribution_intents force row level security;

create policy fund_pool_public_read on public.fund_pool
  for select to anon, authenticated using (true);
create policy fund_deposits_public_read on public.fund_deposits
  for select to anon, authenticated using (true);
create policy fund_intents_insert on public.fund_contribution_intents
  for insert to anon, authenticated with check (amount_sats >= 1000);
create policy fund_intents_owner_read on public.fund_contribution_intents
  for select to anon, authenticated using (true);

revoke insert, update, delete on public.fund_pool, public.fund_deposits from anon, authenticated;
grant select on public.fund_pool, public.fund_deposits to anon, authenticated;
grant select, insert on public.fund_contribution_intents to anon, authenticated;
