-- A lead image for a story, referenced by URL and credited.
--
-- Stored as a link rather than an uploaded file: the image belongs to whoever
-- shot it, and referencing keeps a copyrighted photo out of this repository.
alter table public.articles
  add column if not exists hero_image_url    text,
  add column if not exists hero_image_credit text,
  add column if not exists hero_image_alt    text;

comment on column public.articles.hero_image_url is
  'Remote image. The host must be listed in next.config.ts remotePatterns.';
