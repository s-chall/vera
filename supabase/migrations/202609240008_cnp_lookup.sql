-- Verification is now a live lookup against the CNP register instead of a
-- document upload. The cedula is used for the request and never stored.

alter table public.verification_requests
  add column if not exists lookup_outcome text
    check (lookup_outcome in ('match', 'no_match', 'inconclusive')),
  add column if not exists checked_at timestamptz;

comment on column public.verification_requests.lookup_outcome is
  'Result of the cnpven.org query. The cedula used to obtain it is never stored.';

-- Recording an outcome no longer implies a document to delete, so the decision
-- function stops caring about one. It still nulls document_path for any request
-- created under the previous flow.
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
