-- Where a story has been republished. Shown in a sidebar on the article page.

create table if not exists public.article_pickups (
  id          uuid primary key default gen_random_uuid(),
  article_id  uuid not null references public.articles (id) on delete cascade,
  outlet      text not null check (length(outlet) between 1 and 120),
  outlet_slug text not null check (outlet_slug ~ '^[a-z0-9-]+$'),
  url         text,
  picked_up_at timestamptz not null default now(),
  unique (article_id, outlet_slug)
);

create index if not exists article_pickups_article_idx
  on public.article_pickups (article_id, picked_up_at desc);

alter table public.article_pickups enable row level security;
alter table public.article_pickups force row level security;

-- Visible to anyone who can already read the article itself, so a pickup list
-- never reveals the existence of a story the reader could not otherwise see.
create policy article_pickups_read on public.article_pickups
  for select to authenticated
  using (exists (select 1 from public.articles a where a.id = article_id));

-- Recording a pickup is an editorial act, not something an author self-serves.
create policy article_pickups_admin_write on public.article_pickups
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
