-- Allow LatAm desk sources (BBC Mundo) alongside US/VE.
alter table public.media_hits drop constraint if exists media_hits_country_check;
alter table public.media_hits
  add constraint media_hits_country_check check (country in ('US', 'VE', 'LATAM'));
