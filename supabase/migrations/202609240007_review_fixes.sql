-- Two corrections found by the account-type suite.

-- 1. A column default defeats a BEFORE INSERT trigger: `visibility` was already
--    'members' by the time default_article_visibility() looked at it, so a
--    journalist's work was published to the whole membership. The trigger is
--    the only thing that should decide, so the default goes.
alter table public.articles alter column visibility drop default;

-- 2. Supabase blocks deleting from storage.objects in SQL, so the previous
--    decide_verification() aborted its whole transaction. Object removal has to
--    go through the Storage API, which means an edge function. This function no
--    longer touches storage and is no longer callable by a client: the
--    review-verification function deletes the document first, then calls this
--    with service_role. If the delete fails, nothing is recorded and the
--    request stays pending, so there is no path that approves someone and
--    leaves their identity document behind.
create or replace function public.decide_verification(
  request_id uuid,
  approve boolean,
  reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.verification_requests;
begin
  select * into target from public.verification_requests where id = request_id for update;
  if not found then raise exception 'no such request'; end if;
  if target.status <> 'pending' then raise exception 'request already %', target.status; end if;

  update public.verification_requests
     set status           = case when approve then 'approved' else 'rejected' end,
         document_path    = null,
         reviewed_at      = now(),
         rejection_reason = case when approve then null else reason end
   where id = request_id;

  if approve then
    update public.journalists set verified_at = now() where id = target.journalist_id;
  end if;
end;
$$;

revoke execute on function public.decide_verification(uuid, boolean, text) from anon, authenticated, public;
grant execute on function public.decide_verification(uuid, boolean, text) to service_role;

-- The CASE returns text and the column is an enum; without the cast the update
-- aborts. It was masked until now because the storage delete failed first.
create or replace function public.decide_verification(
  request_id uuid,
  approve boolean,
  reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.verification_requests;
begin
  select * into target from public.verification_requests where id = request_id for update;
  if not found then raise exception 'no such request'; end if;
  if target.status <> 'pending' then raise exception 'request already %', target.status; end if;

  update public.verification_requests
     set status           = (case when approve then 'approved' else 'rejected' end)::public.verification_status,
         document_path    = null,
         reviewed_at      = now(),
         rejection_reason = case when approve then null else reason end
   where id = request_id;

  if approve then
    update public.journalists set verified_at = now() where id = target.journalist_id;
  end if;
end;
$$;

revoke execute on function public.decide_verification(uuid, boolean, text) from anon, authenticated, public;
grant execute on function public.decide_verification(uuid, boolean, text) to service_role;
