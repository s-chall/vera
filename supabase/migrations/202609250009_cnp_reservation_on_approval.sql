-- A CNP number is reserved by a verified affiliation, not by an attempt.
--
-- The unique index covered every request, so a rejected one kept its
-- fingerprint forever. Anyone could submit a real journalist's CNP number with a
-- made-up cedula, be refused by the register, and thereby lock that journalist
-- out of verifying at all.
drop index if exists public.verification_requests_cnp_idx;

create unique index verification_requests_cnp_approved_idx
  on public.verification_requests (cnp_fingerprint)
  where cnp_fingerprint is not null and status = 'approved';
