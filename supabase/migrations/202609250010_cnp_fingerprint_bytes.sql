-- Fingerprints were stored as JSON text, not bytes.
--
-- supabase-js serialises a Uint8Array as {"0":102,"1":16,...}, and PostgREST
-- cast that text to bytea, so each "32-byte" HMAC was ~265 bytes of JSON. It was
-- still keyed and deterministic, so duplicate detection worked, but any lookup
-- by the real bytes never matched. Convert existing rows to the 32 raw bytes.
update public.verification_requests v
   set cnp_fingerprint = (
         select decode(string_agg(lpad(to_hex(e.value::int), 2, '0'), '' order by e.key::int), 'hex')
           from json_each_text(convert_from(v.cnp_fingerprint, 'UTF8')::json) as e
       )
 where v.cnp_fingerprint is not null
   and get_byte(v.cnp_fingerprint, 0) = ascii('{');

-- A request left pending because its CNP was already approved elsewhere cannot
-- ever be approved; close it rather than leave it in the review queue.
update public.verification_requests v
   set status           = 'rejected',
       reviewed_at      = now(),
       rejection_reason = 'CNP number already verified on another account'
 where v.status = 'pending'
   and v.cnp_fingerprint is not null
   and exists (
     select 1 from public.verification_requests o
      where o.cnp_fingerprint = v.cnp_fingerprint
        and o.status = 'approved'
        and o.id <> v.id
   );
