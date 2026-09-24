-- Vera: seeded reporters and their published work.
-- Re-runnable; rows are keyed by alias and slug.
-- Requires 202609240002_identity_and_content.sql.

insert into public.journalists (public_alias, seal, beat, region, bio, verified_at) values
  ('Northstar', 'seal-b', 'Displacement, land records', 'Northern corridor', 'Four years of field notes on communities that stopped appearing in the census.', now()),
  ('Mothlight', 'seal-c', 'Energy, night labour', 'Capital district', 'Dispatches from the shifts nobody schedules and nobody logs.', now()),
  ('Red Cedar', 'seal-d', 'Public money', 'Coastal south', 'Invoices, tenders, shell companies. Mostly invoices.', now()),
  ('Signal 29', 'seal-e', 'Data recovery', 'Undisclosed', 'I work with documents that were meant to be deleted.', now())
on conflict (public_alias) do nothing;

-- One real example, summarised in our own words and credited to the outlet that
-- reported it. El Pitazo states no reuse licence, so their text is not copied.
insert into public.articles
  (journalist_id, slug, title, dek, body, art, category, read_mins, published_at)
select j.id,
  'trujillo-reporter-detained-over-fuel-shortage-story',
  'Trujillo: a reporter detained over a story on fuel shortages',
  'Pablo Mujica was held for three hours, questioned about his reporting on petrol queues, and told the governor wanted it stopped.',
  array[
    'On 1 June 2026, armed men stopped Pablo Jose Mujica Rodriguez, a reporter for Noticias La Voz de Valera, and took him to a police station in Valera, in Trujillo state. He was held for about three hours.',
    'Officers questioned him about an article he had published on fuel shortages in the region. According to his own account, they told him the state governor, Gerardo Marquez, was unhappy with the coverage.',
    '> He was prohibited, he says, from reporting on fuel again.',
    'Before releasing him, police pressed him to publish a second piece aligned with the governor''s position. The National Union of Press Workers recorded the detention.',
    'Mujica is not the first. Reporters in Trujillo have been arrested, questioned and warned off stories repeatedly, and fuel queues have been a recurring trigger: they are visible, they are countable, and they contradict official accounts.',
    'This report summarises reporting first published by El Pitazo. The original is at https://elpitazo.net/regiones/trujillo-periodista-pablo-mujica-fue-detenido-por-publicar-una-nota-sobre-la-escasez-de-gasolina/'
  ],
  'map', 'Press freedom', 4, now() - interval '5 hours'
from public.journalists j where j.public_alias = 'Northstar'
on conflict (slug) do nothing;

-- Lead image referenced from the original report rather than copied here.
update public.articles
   set hero_image_url    = 'https://elpitazo.net/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-03-at-5.23.51-PM.jpeg',
       hero_image_credit = 'El Pitazo',
       hero_image_alt    = 'Reporter Pablo Mujica, detained in Valera over his coverage of fuel shortages'
 where slug = 'trujillo-reporter-detained-over-fuel-shortage-story';
