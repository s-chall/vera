-- Demo seed for Chat: one contributor deposit + media reuse hits.
-- Safe to re-run.

do $$
declare
  pool_addr text;
  demo_sender text := 'tb1qdem0c0ntr1but0rvera0000000000000';
  latest_epoch bigint;
begin
  select address into pool_addr from public.fund_pool where id = 1;
  if pool_addr is null then
    pool_addr := 'tb1qp6vfdapdwdd9s44tr04thdp9c48ctwqm3n8cws';
    insert into public.fund_pool (id, network, address, balance_sats, confirmed_sats, unconfirmed_sats, tx_count, synced_at, watch_source)
    values (1, 'signet', pool_addr, 25000, 25000, 0, 1, now(), 'seed')
    on conflict (id) do update
      set address = excluded.address,
          balance_sats = greatest(public.fund_pool.balance_sats, excluded.balance_sats),
          synced_at = now();
  end if;

  insert into public.fund_deposits (address, txid, vout, amount_sats, confirmed, block_height, sender_address, observed_at)
  values (
    pool_addr,
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    0,
    25000,
    true,
    1,
    demo_sender,
    now() - interval '3 days'
  )
  on conflict (txid, vout) do update
    set sender_address = excluded.sender_address,
        amount_sats = excluded.amount_sats,
        observed_at = excluded.observed_at;

  select id into latest_epoch
  from public.payout_epochs
  where status in ('ready', 'submitted', 'settled', 'open')
  order by closes_at desc
  limit 1;

  -- Stretch latest closed/open epoch window so the demo deposit counts as funding it.
  if latest_epoch is not null then
    update public.payout_epochs
    set opens_at = least(opens_at, now() - interval '10 days'),
        closes_at = greatest(closes_at, now() + interval '1 day')
    where id = latest_epoch;
  end if;

  insert into public.media_hits (outlet_id, outlet_name, country, title, url, matched_alias, epoch_id, excerpt)
  values
    (
      'npr-world',
      'NPR',
      'US',
      'Local Northstar reporting cited in Americas briefing',
      'https://www.npr.org/',
      'Local Northstar',
      latest_epoch,
      'Demo allowlist hit for hackathon Chat briefs.'
    ),
    (
      'bbc-mundo',
      'BBC Mundo',
      'LATAM',
      'Local Red Cedar y el periodismo con seudónimo',
      'https://www.bbc.com/mundo',
      'Local Red Cedar',
      latest_epoch,
      'Demo allowlist hit for hackathon Chat briefs.'
    )
  on conflict (url) do update
    set matched_alias = excluded.matched_alias,
        epoch_id = excluded.epoch_id,
        title = excluded.title,
        outlet_id = excluded.outlet_id,
        outlet_name = excluded.outlet_name,
        country = excluded.country;
end $$;
