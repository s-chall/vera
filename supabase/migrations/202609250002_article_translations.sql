-- Stored translations of a report. Cached rather than translated on every read,
-- so a story is translated once and then served.

create table if not exists public.article_translations (
  article_id  uuid not null references public.articles (id) on delete cascade,
  language    text not null check (language ~ '^[a-z]{2}$'),
  title       text not null,
  dek         text not null default '',
  body        text[] not null default '{}',
  source      text not null default 'machine' check (source in ('machine', 'human')),
  created_at  timestamptz not null default now(),
  primary key (article_id, language)
);

alter table public.article_translations enable row level security;
alter table public.article_translations force row level security;

-- Follows the article: if you can read the piece, you can read it translated.
create policy article_translations_read on public.article_translations
  for select to authenticated
  using (exists (select 1 from public.articles a where a.id = article_id));

-- Written by the translate-article function with service_role, or by an admin
-- correcting a machine translation.
create policy article_translations_admin_write on public.article_translations
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Which languages exist for a story, without pulling the bodies.
create or replace function public.article_languages(target uuid)
returns table (language text, source text)
language sql
stable
security definer
set search_path = public
as $$
  select t.language, t.source
    from public.article_translations t
   where t.article_id = target
     and exists (select 1 from public.articles a where a.id = target)
   order by t.language;
$$;

grant execute on function public.article_languages(uuid) to authenticated;
