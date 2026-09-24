-- Press credentials shown publicly on a byline.
--
-- Note this runs against the grain of the verification flow, which deliberately
-- discards the affiliate's legal name so the database cannot link a pseudonym
-- to a person. These columns store and publish exactly that link, so they are
-- admin-written only and never touched by the CNP lookup.

alter table public.journalists
  add column if not exists credential_name    text,
  add column if not exists credential_carnet  text,
  add column if not exists credential_section text;

comment on column public.journalists.credential_name is
  'Displayed publicly on the byline. Only service_role or an admin may set it; submit-verification never writes here.';

create or replace function public.protect_journalist_fields()
returns trigger
language plpgsql
as $$
declare
  privileged boolean := current_user in ('service_role', 'supabase_admin', 'postgres');
begin
  if new.is_admin is distinct from old.is_admin and not privileged then
    raise exception 'is_admin cannot be changed through the API'
      using errcode = 'insufficient_privilege';
  end if;

  if new.account_type is distinct from old.account_type and not privileged then
    raise exception 'account_type cannot be changed after signup'
      using errcode = 'insufficient_privilege';
  end if;

  if new.funding_confirmed_at is distinct from old.funding_confirmed_at and not privileged then
    raise exception 'funding confirmation is not self-serve'
      using errcode = 'insufficient_privilege';
  end if;

  if (new.credential_name    is distinct from old.credential_name
   or new.credential_carnet  is distinct from old.credential_carnet
   or new.credential_section is distinct from old.credential_section)
     and not privileged and not public.is_admin() then
    raise exception 'press credentials cannot be set by the account holder'
      using errcode = 'insufficient_privilege';
  end if;

  if new.verified_at is distinct from old.verified_at
     and not privileged
     and not public.is_admin() then
    raise exception 'only an admin can change verification'
      using errcode = 'insufficient_privilege';
  end if;

  new.owner_user_id := old.owner_user_id;
  new.created_at    := old.created_at;
  return new;
end;
$$;

create or replace view public.bylines
with (security_barrier = true)
as
select id, public_alias, seal, beat, region, bio, verified_at, created_at,
       credential_name, credential_carnet, credential_section
  from public.journalists;

grant select on public.bylines to authenticated;
