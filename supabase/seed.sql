-- Vera: seeded reporters and their published work.
-- Re-runnable; rows are keyed by alias and slug.
-- Requires 202609240002_identity_and_content.sql.

insert into public.journalists (public_alias, seal, beat, region, bio, verified_at) values
  ('Northstar', 'seal-b', 'Displacement, land records', 'Northern corridor', 'Four years of field notes on communities that stopped appearing in the census.', now()),
  ('Mothlight', 'seal-c', 'Energy, night labour', 'Capital district', 'Dispatches from the shifts nobody schedules and nobody logs.', now()),
  ('Red Cedar', 'seal-d', 'Public money', 'Coastal south', 'Invoices, tenders, shell companies. Mostly invoices.', now()),
  ('Signal 29', 'seal-e', 'Data recovery', 'Undisclosed', 'I work with documents that were meant to be deleted.', now())
on conflict (public_alias) do nothing;

insert into public.articles
  (journalist_id, slug, title, dek, body, art, category, read_mins, published_at)
select j.id, 'inside-the-towns-being-erased-from-the-official-map', 'Inside the towns being erased from the official map', 'Residents describe quiet evictions, missing records, and the roads that disappear before dawn.',
  array[
    'The first thing to go was the bus stop. Not the shelter, which is still standing at the junction with its bench and its faded timetable, but the stop itself, the entry in the transit authority database that told drivers to slow down here.',
    'By the time anyone in Hollow Bend noticed, the 6:10 had been running past them for eleven weeks.',
    '> "You cannot appeal a thing that was never announced. There is no letter. There is just a bus that does not stop."',
    'I spent nine days in three settlements along the northern corridor. All three were incorporated before 1974. All three appear on the printed regional survey held at the district archive. None of them appear in the survey layer that the planning ministry moved to last spring.',
    'The ministry says this is a data migration issue and that corrections are ongoing. It has said this since March. In the meantime, a settlement that is not in the layer cannot be issued a repair permit, cannot receive a mains connection, and cannot contest a sale of the land it sits on.',
    'Meret Osei has lived in Hollow Bend for thirty-one years. She showed me a folder of receipts for a water connection she has paid for since 2009, and a letter from the utility explaining that the address on those receipts does not exist.',
    'Two of the three settlements have since received survey crews. Both surveys were commissioned by the same private holding company, and both were filed as greenfield assessments, the designation used for land with no existing occupancy.',
    'I asked the company about the designation. A representative said the assessments were routine and declined to say who ordered them. The roads went in four weeks later.'
  ],
  'map', 'Field report', 6, now() - interval '47 minutes'
from public.journalists j where j.public_alias = 'Northstar'
on conflict (slug) do nothing;

insert into public.articles
  (journalist_id, slug, title, dek, body, art, category, read_mins, published_at)
select j.id, 'the-night-shift-keeping-the-city-online', 'The night shift keeping the city online', 'When the grid fails, a hidden network of technicians crosses checkpoints to restore it.',
  array[
    'There is a WhatsApp group with 140 members and no name. When a substation drops, someone posts a district number and a rough time. Within twenty minutes, two or three people reply with a single character: a dot.',
    'A dot means they are going.',
    'None of them are employed by the utility. Most of them were, at some point. The maintenance division was cut by roughly sixty percent over two restructurings, and the contractors who replaced it do not work after 8pm because the insurance does not cover the checkpoints.',
    '> "The grid does not know what time it is. It fails at three in the morning the same as any other hour."',
    'I rode with Tariq, who is 44 and now drives a delivery van during the day. He keeps a bag of terminal lugs, a torque wrench, and a laminated copy of an access letter that expired in 2022 in the footwell of the van.',
    'The letter has never been refused at a checkpoint. He thinks this is because the officers recognise the bag more than the paper.',
    'What the group does is illegal in at least three separate ways, and everyone in it knows the exact statutes. They talk about them the way other people talk about the weather.',
    'On the night I was there, the fault was a corroded jumper on a pole outside a school. It took Tariq nineteen minutes. Four thousand homes came back at 3:41am. Nobody was told why.'
  ],
  'night', 'Dispatch', 4, now() - interval '82 minutes'
from public.journalists j where j.public_alias = 'Mothlight'
on conflict (slug) do nothing;

insert into public.articles
  (journalist_id, slug, title, dek, body, art, category, read_mins, published_at)
select j.id, 'who-profits-when-the-water-stops', 'Who profits when the water stops?', 'Public invoices reveal a private supplier charging three times the regional average.',
  array[
    'Between January 2024 and June 2026, the coastal south municipality spent 41.2 million on emergency water delivery. Nearly all of it went to one supplier.',
    'Harbour Line Logistics was incorporated eight weeks before the first tanker contract was signed. Its registered address is a serviced office. Its listed director has held directorships in fourteen companies, eleven of which were dissolved within three years.',
    'The rate is the part that is hard to argue with. Neighbouring municipalities paid between 0.9 and 1.4 per cubic metre for the same emergency delivery over the same period. Harbour Line invoiced at 3.6.',
    '> The invoices were never hidden. They were published, on time, in a quarterly PDF that nobody opened.',
    'I obtained 312 of them through the standard disclosure portal. It took four requests, because the first three were answered with a scanned cover page and nothing behind it.',
    'The municipality says the rate reflects the urgency of the deliveries and the difficulty of the terrain. The terrain is a coastal road that carries a public bus route.',
    'What the invoices also show is a pattern in the timing. Deliveries spike in the eleven days following each reported main failure, and the main failures cluster in two districts, both of which are served by pipework that the municipality itself flagged as end-of-life in a 2021 condition report.',
    'That report recommended 6.8 million in replacement work. It was deferred twice, then removed from the capital plan in 2023.',
    'The money spent on tankers since would have paid for the pipes six times over.'
  ],
  'water', 'Investigation', 8, now() - interval '126 minutes'
from public.journalists j where j.public_alias = 'Red Cedar'
on conflict (slug) do nothing;

insert into public.articles
  (journalist_id, slug, title, dek, body, art, category, read_mins, published_at)
select j.id, 'a-school-a-server-room-and-12-000-missing-names', 'A school, a server room, and 12,000 missing names', 'We recovered the database officials said never existed. This is what it contains.',
  array[
    'The department told a parliamentary committee, twice, that no central enrolment register existed for the affected years. The register existed. It was on a decommissioned machine in a school basement, and it had not been wiped, only unplugged.',
    'I am not going to describe how it reached me. I will describe what is in it, because that is the part that matters and the part that can be checked.',
    'The register covers 2019 to 2024 and contains 118,406 enrolment records. Cross-referencing against the published year-end totals leaves 12,317 records that appear in the register and in no public figure.',
    '> Every one of those 12,317 entries has a name, a date of birth, and a school code. None of them have a completion status.',
    'The records are not evenly spread. Sixty-two percent come from nineteen schools, all of which were merged or closed during the same period. In the published data, those schools report enrolment figures that are close to round numbers, in a dataset where no other school reports round numbers.',
    'The simplest explanation is that the missing records were dropped when those schools were consolidated and their data was manually re-entered. The department has not offered that explanation, or any other.',
    'What follows from it is funding. Per-pupil allocation for the affected districts was calculated from the published totals. If the register is correct, those districts were funded for five years as though twelve thousand children were not there.',
    'I have published the schema, the row counts by school code, and the reconciliation method. I have not published the records. I will not.',
    'The department was sent a full summary of these findings sixteen days ago and asked nine questions. It has answered none of them and has not disputed the existence of the register.'
  ],
  'data', 'Data', 11, now() - interval '940 minutes'
from public.journalists j where j.public_alias = 'Signal 29'
on conflict (slug) do nothing;

-- ---------------------------------------------------------------- admin account
-- A real email/password account for testing, since anonymous sessions are gone.
--   admin@vera.test / vera-admin-2026
-- Local and staging only. Change the password before this reaches anything real.

-- The token columns must be '' rather than NULL: GoTrue scans them into
-- non-nullable Go strings and a NULL turns every sign-in into a 500.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, phone_change, phone_change_token
)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
       'authenticated', 'admin@vera.test', extensions.crypt('vera-admin-2026', extensions.gen_salt('bf')),
       now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
       '', '', '', '', '', '', '', ''
where not exists (select 1 from auth.users where email = 'admin@vera.test');

-- Without an identity row, GoTrue will not accept a password sign-in.
insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
  from auth.users u
 where u.email = 'admin@vera.test'
   and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

-- handle_new_user() already minted a byline for that account; make it the desk.
update public.journalists j
   set public_alias = 'Vera Desk',
       seal         = 'seal-a',
       beat         = 'Editorial',
       region       = 'Newsroom',
       bio          = 'The editorial desk. Verifies reporters and keeps the briefing honest.',
       is_admin     = true,
       verified_at  = now()
  from auth.users u
 where u.email = 'admin@vera.test'
   and j.owner_user_id = u.id
   and j.public_alias <> 'Vera Desk';

-- ------------------------------------------------------- media organisations
-- Domains allowed to open a media_org account. Extend as needed.

insert into public.media_domains (domain, name) values
  ('nytimes.com',        'The New York Times'),
  ('washingtonpost.com', 'The Washington Post'),
  ('theguardian.com',    'The Guardian'),
  ('reuters.com',        'Reuters'),
  ('apnews.com',         'Associated Press'),
  ('bbc.co.uk',          'BBC News'),
  ('elpais.com',         'El País'),
  ('efecto-cocuyo.com',  'Efecto Cocuyo'),
  ('armando.info',       'Armando.info'),
  ('elpitazo.net',       'El Pitazo'),
  ('runrun.es',          'Runrun.es'),
  ('talcualdigital.com', 'TalCual'),
  ('vera.test',          'Vera (testing)')
on conflict (domain) do nothing;
