-- Publishing from the editor: formatted text, a lead image and image
-- attachments, filed in one transaction.
--
-- Images live in a private bucket. A reader can fetch one exactly when they can
-- read the article it belongs to, so an image is media_only whenever its text
-- is. Nothing about the original file survives the upload: the browser
-- re-encodes it from pixels, which drops EXIF and GPS, and the object is named
-- with a random UUID, because a phone's filename is metadata too.

-- ------------------------------------------------------------------- limits

-- The editor is not the only client; PostgREST takes a direct insert. These are
-- the bounds that keep a feed renderable, so they live on the table.
--
-- NOT VALID: they hold for every new or edited row, but a hosted project may
-- already have reports filed through the earlier text-only editor, which put
-- no cap on the standfirst. Checking those here would abort the migration and
-- everything else in it. The renderer copes with any existing row.
alter table public.articles
  add constraint articles_title_length
    check (title is null or char_length(title) between 1 and 200) not valid,
  add constraint articles_dek_length
    check (char_length(dek) <= 400) not valid,
  add constraint articles_body_size
    check (cardinality(body) <= 500
           and octet_length(array_to_string(body, '')) <= 200000
           -- array_to_string skips a NULL, but a reader's renderer would not
           and array_position(body, null) is null) not valid;

-- --------------------------------------------------------------- the bucket

-- Only what the browser's canvas encoder produces. The limit is on the
-- re-encoded file, which is capped at 2400px on its long edge.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('article-media', 'article-media', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------------------------------------ article_media

create table public.article_media (
  id          uuid primary key default gen_random_uuid(),
  article_id  uuid not null references public.articles (id) on delete cascade,
  role        text not null check (role in ('lead', 'image')),
  -- <journalist id>/<random uuid>.<ext>. The shape is enforced so that no
  -- original filename can be stored, and unique so that one upload cannot be
  -- attached to two articles with different audiences.
  path        text not null unique check (path ~ (
                '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
                || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
                || '\.(jpg|png|webp)$')),
  alt         text not null default '' check (char_length(alt) <= 300),
  position    integer not null default 0 check (position >= 0),
  created_at  timestamptz not null default now()
);

create unique index article_media_one_lead_idx
  on public.article_media (article_id) where role = 'lead';
create index article_media_article_idx
  on public.article_media (article_id, position);

alter table public.article_media enable row level security;
alter table public.article_media force row level security;

-- Readable exactly when the article is. The subquery runs under the reader's
-- own articles policies, so media_only carries over without restating it.
create policy article_media_read on public.article_media
  for select to authenticated
  using (exists (select 1 from public.articles a where a.id = article_media.article_id));

-- Only onto your own article, and only an object from your own folder. Without
-- the folder check an author could attach somebody else's upload to a
-- members-visible article, and so publish an image its owner kept media_only.
create policy article_media_insert_own on public.article_media
  for insert to authenticated
  with check (
    split_part(path, '/', 1) = public.current_journalist_id()::text
    and exists (select 1 from public.articles a
                 where a.id = article_media.article_id
                   and a.journalist_id = public.current_journalist_id())
  );

-- The limits publish_article() checks, enforced on every insert, since a
-- member can also write here directly. Unbounded rows would be a feed-wide
-- outage: every reader signs every visible image in one request, and storage
-- refuses a request for more than 1000.
create or replace function public.check_article_media()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- one writer per article at a time, so the count cannot race
  perform 1 from public.articles where id = new.article_id for update;

  if (select count(*) from public.article_media where article_id = new.article_id) >= 20 then
    raise exception 'An article can carry at most 20 images.' using errcode = 'check_violation';
  end if;

  if not exists (select 1 from storage.objects o
                  where o.bucket_id = 'article-media' and o.name = new.path) then
    raise exception 'An image did not finish uploading. Try again.' using errcode = 'no_data_found';
  end if;

  return new;
end;
$$;

create trigger article_media_limits
  before insert on public.article_media
  for each row execute function public.check_article_media();

create policy article_media_delete_own on public.article_media
  for delete to authenticated
  using (exists (select 1 from public.articles a
                  where a.id = article_media.article_id
                    and a.journalist_id = public.current_journalist_id()));

-- ---------------------------------------------------------- storage policies

-- Objects are stored under <journalist_id>/, so ownership is a prefix check.
-- Only someone who can publish has a reason to upload, so the bucket is not
-- free storage for every account.
create policy article_objects_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'article-media'
    and (storage.foldername(name))[1] = public.current_journalist_id()::text
    and public.can_publish()
  );

-- The uploader can always read their own. Anyone else needs the object to be
-- attached to an article they can read, which article_media_read decides. An
-- upload from a publish that failed halfway is attached to nothing, and stays
-- private to its owner.
create policy article_objects_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'article-media'
    and (
      (storage.foldername(name))[1] = public.current_journalist_id()::text
      or exists (select 1 from public.article_media m where m.path = objects.name)
    )
  );

create policy article_objects_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'article-media'
    and (storage.foldername(name))[1] = public.current_journalist_id()::text
  );

-- ---------------------------------------------------------- publish_article

-- One call files the text and attaches the images, so a reader never sees an
-- article whose images have not arrived, and a failure leaves nothing behind
-- but the uploads, which the client removes. INVOKER on purpose: every insert
-- goes through the same policies a direct write would, can_publish() included,
-- so only a verified journalist can file through it.
create or replace function public.publish_article(
  headline   text,
  blocks     text[],
  standfirst text default '',
  audience   public.article_visibility default null,
  media      jsonb default '[]'::jsonb
)
returns public.articles
language plpgsql
security invoker
set search_path = public
as $$
declare
  me          uuid := public.current_journalist_id();
  clean_title text := btrim(coalesce(headline, ''));
  clean_dek   text := btrim(coalesce(standfirst, ''));
  clean_body  text[];
  words       integer;
  stem        text;
  created     public.articles;
  item        jsonb;
  item_path   text;
  item_role   text;
  pos         integer := 0;
begin
  if me is null then
    raise exception 'Sign in to publish.' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(array_agg(btrim(b) order by n), '{}')
    into clean_body
    from unnest(coalesce(blocks, '{}')) with ordinality as t(b, n)
   where btrim(b) <> '';

  if clean_title = '' then
    raise exception 'Give the article a title.' using errcode = 'check_violation';
  end if;
  if char_length(clean_title) > 200 then
    raise exception 'Titles are at most 200 characters.' using errcode = 'check_violation';
  end if;
  if char_length(clean_dek) > 400 then
    raise exception 'The introduction is at most 400 characters.' using errcode = 'check_violation';
  end if;
  if cardinality(clean_body) = 0 then
    raise exception 'The article has no text yet.' using errcode = 'check_violation';
  end if;
  if cardinality(clean_body) > 500 then
    raise exception 'The story is too long: at most 500 paragraphs.' using errcode = 'check_violation';
  end if;
  if octet_length(array_to_string(clean_body, '')) > 200000 then
    raise exception 'The story is too long: at most about 200 KB of text.' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(coalesce(media, '[]'::jsonb)) <> 'array' then
    raise exception 'media must be a list' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_array_length(coalesce(media, '[]'::jsonb)) > 20 then
    raise exception 'An article can carry at most 20 images.' using errcode = 'check_violation';
  end if;
  if (select count(*) from jsonb_array_elements(coalesce(media, '[]'::jsonb)) e
       where e ->> 'role' = 'lead') > 1 then
    raise exception 'An article has one lead image.' using errcode = 'check_violation';
  end if;

  -- Reading time counts words, not markup.
  words := cardinality(regexp_split_to_array(btrim(regexp_replace(
             array_to_string(clean_body, ' '), '<[^>]*>|&[#a-z0-9]+;', ' ', 'gi')), '\s+'));

  stem := btrim(left(btrim(regexp_replace(lower(clean_title), '[^a-z0-9]+', '-', 'g'), '-'), 60), '-');
  if stem = '' then
    stem := 'filed';
  end if;

  -- Slugs are unique across every article, including ones this author cannot
  -- see, so a lookup under their policies would miss the clash. Try the plain
  -- slug, and on a collision try again with a random suffix.
  for attempt in 0..5 loop
    begin
      insert into public.articles
        (journalist_id, slug, title, dek, body, read_mins, published_at, visibility)
      values
        (me,
         case when attempt = 0 then stem
              else stem || '-' || substr(md5(gen_random_uuid()::text), 1, 6) end,
         clean_title, clean_dek, clean_body,
         greatest(1, round(words / 220.0)::integer), now(),
         -- null lets default_article_visibility() decide from the account type
         audience)
      returning * into created;
      exit;
    exception when unique_violation then
      if attempt = 5 then
        raise;
      end if;
    end;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(media, '[]'::jsonb)) loop
    item_path := item ->> 'path';
    item_role := coalesce(item ->> 'role', 'image');

    if item_path is null or split_part(item_path, '/', 1) <> me::text then
      raise exception 'Images must be uploaded to your own folder.'
        using errcode = 'insufficient_privilege';
    end if;

    -- check_article_media() confirms the object exists and enforces the cap.

    insert into public.article_media (article_id, role, path, alt, position)
    values (created.id, item_role, item_path,
            left(btrim(coalesce(item ->> 'alt', '')), 300), pos);
    pos := pos + 1;
  end loop;

  return created;
end;
$$;

revoke execute on function public.publish_article(text, text[], text, public.article_visibility, jsonb)
  from public, anon;
grant execute on function public.publish_article(text, text[], text, public.article_visibility, jsonb)
  to authenticated;
