-- Easy-pay fields for Apple Pay / card / on-ramp contributions.

alter table public.fund_contribution_intents
  drop constraint if exists fund_contribution_intents_status_check;

alter table public.fund_contribution_intents
  add constraint fund_contribution_intents_status_check
  check (status in ('pending', 'detected', 'paid', 'expired'));

alter table public.fund_contribution_intents
  add column if not exists payment_method text;

alter table public.fund_contribution_intents
  add column if not exists external_id text;

alter table public.fund_pool
  drop constraint if exists fund_pool_network_check;

alter table public.fund_pool
  add constraint fund_pool_network_check
  check (network in ('signet', 'regtest', 'mainnet', 'testnet'));
