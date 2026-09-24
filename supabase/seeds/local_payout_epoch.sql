-- Seed a closed open epoch with qualified engagement for local finalize-payout curls.
-- Safe to re-run: clears prior local seed aliases first.

begin;

delete from public.engagement_events
where article_id in (
  select a.id from public.articles a
  join public.journalists j on j.id = a.journalist_id
  where j.public_alias in ('Local Northstar', 'Local Red Cedar')
);
delete from public.epoch_allocations
where journalist_id in (
  select id from public.journalists where public_alias in ('Local Northstar', 'Local Red Cedar')
);
delete from public.epoch_article_stats
where journalist_id in (
  select id from public.journalists where public_alias in ('Local Northstar', 'Local Red Cedar')
);
delete from public.articles
where journalist_id in (
  select id from public.journalists where public_alias in ('Local Northstar', 'Local Red Cedar')
);
delete from public.payout_epochs
where status in ('open', 'ready', 'submitted', 'finalizing')
  and opens_at < now() - interval '1 day';
delete from public.journalists
where public_alias in ('Local Northstar', 'Local Red Cedar');
delete from auth.users
where email in ('local-northstar@example.test', 'local-cedar@example.test');

do $$
declare
  user_one uuid := gen_random_uuid();
  user_two uuid := gen_random_uuid();
  journalist_one uuid;
  journalist_two uuid;
  article_one uuid;
  article_two uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password)
  values
    (user_one, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'local-northstar@example.test', 'x'),
    (user_two, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'local-cedar@example.test', 'x');

  insert into public.journalists (owner_user_id, public_alias, payout_address)
  values (user_one, 'Local Northstar', '0x1111111111111111111111111111111111111111')
  returning id into journalist_one;
  insert into public.journalists (owner_user_id, public_alias, payout_address)
  values (user_two, 'Local Red Cedar', '0x2222222222222222222222222222222222222222')
  returning id into journalist_two;

  insert into public.articles (journalist_id, slug, published_at)
  values (journalist_one, 'local-northstar-report', now() - interval '10 days')
  returning id into article_one;
  insert into public.articles (journalist_id, slug, published_at)
  values (journalist_two, 'local-cedar-report', now() - interval '10 days')
  returning id into article_two;

  insert into public.payout_epochs (opens_at, closes_at, status)
  values (now() - interval '15 days', now() - interval '1 hour', 'open');

  insert into public.engagement_events (article_id, audience_key_hash, kind, qualified, occurred_at)
  values
    (article_one, repeat('1', 64), 'view', true, now() - interval '2 days'),
    (article_one, repeat('2', 64), 'view', true, now() - interval '2 days'),
    (article_one, repeat('1', 64), 'like', true, now() - interval '2 days'),
    (article_two, repeat('3', 64), 'view', true, now() - interval '2 days'),
    (article_two, repeat('4', 64), 'view', true, now() - interval '2 days');
end $$;

commit;
