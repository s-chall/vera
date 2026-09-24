-- LOCAL DEMO. Republication credits for one seeded story, so the article
-- sidebar has something to show.
insert into public.article_pickups (article_id, outlet, outlet_slug, url, picked_up_at)
select a.id, v.outlet, v.slug, v.url, now() - v.ago
  from public.articles a
  cross join (values
    ('The New York Times', 'nytimes', 'https://www.nytimes.com/', interval '6 hours'),
    ('CNN',               'cnn',     'https://www.cnn.com/',     interval '19 hours'),
    ('VPItv',             'vpitv',   'https://vpitv.com/',       interval '2 days')
  ) as v(outlet, slug, url, ago)
 where a.slug = 'inside-the-towns-being-erased-from-the-official-map'
on conflict (article_id, outlet_slug) do nothing;
