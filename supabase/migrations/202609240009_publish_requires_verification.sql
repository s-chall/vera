-- Only a verified journalist may file a report.
--
-- Until now this was a UI convention: the gate held an unverified journalist in
-- the browser, but nothing stopped them calling PostgREST directly with the
-- publishable key, which ships to every browser.

create or replace function public.can_publish()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.journalists j
     where j.owner_user_id = (select auth.uid())
       and j.account_type = 'journalist'
       and j.verified_at is not null
  );
$$;

grant execute on function public.can_publish() to authenticated;

-- articles_owner_all covered every command, so insert has to be split out to be
-- treated differently from reading and editing your own work.
drop policy if exists articles_owner_all on public.articles;

create policy articles_owner_read on public.articles
  for select to authenticated
  using (journalist_id = public.current_journalist_id());

create policy articles_insert_verified on public.articles
  for insert to authenticated
  with check (
    journalist_id = public.current_journalist_id()
    and public.can_publish()
  );

-- Editing and withdrawing your own work stays available even if verification is
-- later removed: someone who loses their badge should still be able to take
-- their reporting down.
create policy articles_owner_update on public.articles
  for update to authenticated
  using (journalist_id = public.current_journalist_id())
  with check (journalist_id = public.current_journalist_id());

create policy articles_owner_delete on public.articles
  for delete to authenticated
  using (journalist_id = public.current_journalist_id());
