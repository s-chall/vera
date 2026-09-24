-- Private bucket for identity documents. Applicants write, reviewers read,
-- nobody lists, and decide_verification() deletes on decision.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('verification-documents', 'verification-documents', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Objects are stored under <journalist_id>/<filename>, so ownership is a
-- prefix check rather than a lookup.
create policy verification_docs_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'verification-documents'
    and (storage.foldername(name))[1] = public.current_journalist_id()::text
  );

create policy verification_docs_read_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'verification-documents'
    and (storage.foldername(name))[1] = public.current_journalist_id()::text
  );

create policy verification_docs_read_admin on storage.objects
  for select to authenticated
  using (bucket_id = 'verification-documents' and public.is_admin());

-- An applicant may replace their own upload before review; only the decision
-- function removes it afterwards.
create policy verification_docs_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'verification-documents'
    and (storage.foldername(name))[1] = public.current_journalist_id()::text
  );
