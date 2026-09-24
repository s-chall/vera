-- LOCAL DEMO. Press credentials shown on seeded bylines.
--
-- The carnet number is deliberately above 28325, the highest member the CNP
-- register reports, so this credential cannot resolve to a real affiliate.
update public.journalists
   set credential_name    = 'Johan Alvarez',
       credential_carnet  = '30418',
       credential_section = 'Distrito Capital'
 where owner_user_id is null
   and public_alias in ('Northstar', 'Mothlight', 'Red Cedar', 'Signal 29');
