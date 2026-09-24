-- Who can read what. A journalist's work is not visible to the whole
-- membership by default; a media organisation is the audience it is for.

create type public.article_visibility as enum ('members', 'media_only');

alter table public.articles
  add column if not exists visibility public.article_visibility;

-- Existing rows predate the distinction and were readable by all members.
update public.articles set visibility = 'members' where visibility is null;

alter table public.articles
  alter column visibility set not null,
  alter column visibility set default 'members';

-- A journalist filing a report gets media_only unless they say otherwise.
create or replace function public.default_article_visibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.visibility is null then
    select case when j.account_type = 'journalist' then 'media_only' else 'members' end
      into new.visibility
      from public.journalists j where j.id = new.journalist_id;
    new.visibility := coalesce(new.visibility, 'members');
  end if;
  return new;
end;
$$;

drop trigger if exists articles_default_visibility on public.articles;
create trigger articles_default_visibility
  before insert on public.articles
  for each row execute function public.default_article_visibility();

create or replace function public.my_account_type()
returns public.account_type
language sql
stable
security definer
set search_path = public
as $$
  select account_type from public.journalists where owner_user_id = (select auth.uid());
$$;

grant execute on function public.my_account_type() to authenticated;

drop policy if exists articles_read_signed_in on public.articles;

create policy articles_read_members on public.articles
  for select to authenticated
  using (
    published_at is not null
    and (
      visibility = 'members'
      or public.my_account_type() = 'media_org'
      or public.is_admin()
    )
  );
