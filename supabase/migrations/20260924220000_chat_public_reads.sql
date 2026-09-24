-- Chat needs anon read on the public payout ledger.
-- Later identity migrations left journalists RLS tight; keep the ledger view
-- as security definer/owner so joins still resolve for public briefs.

grant select on public.public_payout_ledger to anon, authenticated;
grant select on public.fund_pool to anon, authenticated;
grant select on public.fund_deposits to anon, authenticated;
grant select on public.media_hits to anon, authenticated;

alter view public.public_payout_ledger set (security_invoker = false);
