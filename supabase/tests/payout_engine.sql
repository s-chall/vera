begin;

do $$
declare
  user_one uuid := gen_random_uuid();
  user_two uuid := gen_random_uuid();
  journalist_one uuid;
  journalist_two uuid;
  article_one uuid;
  article_two uuid;
  test_epoch_id bigint;
  total_paid numeric;
  first_paid numeric;
  second_paid numeric;
begin
  -- Allow one open epoch in this transaction even if the local DB already has one.
  update public.payout_epochs
  set status = 'settled'
  where status in ('open', 'finalizing');

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password)
  values
    (user_one, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'one@example.test', 'x'),
    (user_two, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'two@example.test', 'x');

  insert into public.journalists (owner_user_id, public_alias, payout_address)
  values (user_one, 'Northstar', '0x1111111111111111111111111111111111111111') returning id into journalist_one;
  insert into public.journalists (owner_user_id, public_alias, payout_address)
  values (user_two, 'Red Cedar', '0x2222222222222222222222222222222222222222') returning id into journalist_two;

  insert into public.articles (journalist_id, slug, published_at)
  values (journalist_one, 'northstar-report', now() - interval '10 days') returning id into article_one;
  insert into public.articles (journalist_id, slug, published_at)
  values (journalist_two, 'cedar-report', now() - interval '10 days') returning id into article_two;

  insert into public.payout_epochs (opens_at, closes_at)
  values (timestamptz '2020-01-01 00:00:00+00', timestamptz '2020-01-15 00:00:00+00')
  returning id into test_epoch_id;

  -- Northstar: 2 views + 1 like = 6. Red Cedar: 2 views = 2.
  insert into public.engagement_events (article_id, audience_key_hash, kind, qualified, occurred_at)
  values
    (article_one, repeat('a', 64), 'view', true, timestamptz '2020-01-05 12:00:00+00'),
    (article_one, repeat('b', 64), 'view', true, timestamptz '2020-01-05 12:00:00+00'),
    (article_one, repeat('a', 64), 'like', true, timestamptz '2020-01-05 12:00:00+00'),
    (article_two, repeat('c', 64), 'view', true, timestamptz '2020-01-05 12:00:00+00'),
    (article_two, repeat('d', 64), 'view', true, timestamptz '2020-01-05 12:00:00+00');

  perform public.finalize_payout_epoch(test_epoch_id, 600000000);

  select sum(payout_atomic) into total_paid from public.epoch_allocations where epoch_id = test_epoch_id;
  select payout_atomic into first_paid from public.epoch_allocations
    where epoch_id = test_epoch_id and journalist_id = journalist_one;
  select payout_atomic into second_paid from public.epoch_allocations
    where epoch_id = test_epoch_id and journalist_id = journalist_two;

  if total_paid <> 100000000 then raise exception 'Expected full 1/6 budget, got %', total_paid; end if;
  if first_paid <> 75000000 then raise exception 'Expected 75%% allocation, got %', first_paid; end if;
  if second_paid <> 25000000 then raise exception 'Expected 25%% allocation, got %', second_paid; end if;

  -- A retry must not create or alter allocations.
  perform public.finalize_payout_epoch(test_epoch_id, 600000000);
  if (select count(*) from public.epoch_allocations where epoch_id = test_epoch_id) <> 2 then
    raise exception 'Finalization retry was not idempotent';
  end if;
end $$;

rollback;
