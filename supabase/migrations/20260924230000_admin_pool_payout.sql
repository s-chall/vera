-- Admin-triggered pool payout runs (hackathon / ops).
-- Distributes a chosen sats amount to earning journalists, then zeros fund_pool.

create table if not exists public.admin_pool_payouts (
  id bigint generated always as identity primary key,
  amount_sats bigint not null check (amount_sats > 0),
  pool_balance_before bigint not null check (pool_balance_before >= 0),
  note text,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_pool_payout_lines (
  id bigint generated always as identity primary key,
  payout_id bigint not null references public.admin_pool_payouts (id) on delete cascade,
  journalist_id uuid not null references public.journalists (id),
  public_alias text not null,
  score numeric(78,0) not null default 0,
  total_score numeric(78,0) not null default 0,
  payout_atomic bigint not null check (payout_atomic >= 0),
  payout_address text
);

create index if not exists admin_pool_payout_lines_payout_idx
  on public.admin_pool_payout_lines (payout_id);

alter table public.admin_pool_payouts enable row level security;
alter table public.admin_pool_payouts force row level security;
alter table public.admin_pool_payout_lines enable row level security;
alter table public.admin_pool_payout_lines force row level security;

-- Public can read settled payout history (transparency); writes are service_role only.
create policy admin_pool_payouts_public_read on public.admin_pool_payouts
  for select to anon, authenticated using (true);
create policy admin_pool_payout_lines_public_read on public.admin_pool_payout_lines
  for select to anon, authenticated using (true);

revoke insert, update, delete on public.admin_pool_payouts, public.admin_pool_payout_lines from anon, authenticated;
grant select on public.admin_pool_payouts, public.admin_pool_payout_lines to anon, authenticated;
