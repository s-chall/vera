-- Contributor transparency: track which wallet funded each pool UTXO,
-- plus cached media reuse hits for Chat briefs.

alter table public.fund_deposits
  add column if not exists sender_address text;

create index if not exists fund_deposits_sender_idx
  on public.fund_deposits (sender_address)
  where sender_address is not null;

create table if not exists public.media_hits (
  id bigint generated always as identity primary key,
  outlet_id text not null,
  outlet_name text not null,
  country text not null check (country in ('US', 'VE', 'LATAM')),
  title text not null,
  url text not null,
  matched_alias text,
  epoch_id bigint references public.payout_epochs (id) on delete set null,
  excerpt text,
  observed_at timestamptz not null default now(),
  unique (url)
);

create index if not exists media_hits_alias_idx on public.media_hits (matched_alias);
create index if not exists media_hits_epoch_idx on public.media_hits (epoch_id);

alter table public.media_hits enable row level security;
alter table public.media_hits force row level security;

create policy media_hits_public_read on public.media_hits
  for select to anon, authenticated using (true);

revoke insert, update, delete on public.media_hits from anon, authenticated;
grant select on public.media_hits to anon, authenticated;
