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

-- Three further examples, summarised in our own words and credited to VPItv,
-- which states no reuse licence. Attributed to the same credentialed byline.
insert into public.articles
  (journalist_id, slug, title, dek, body, art, category, read_mins, published_at)
select j.id, v.slug, v.title, v.dek, v.body, v.art, v.category, v.read_mins, now() - v.ago
  from public.journalists j
  cross join (values
    (
      'vpitv-broadcast-platform-hijacked',
      'A broadcaster''s stream is hijacked and filled with state propaganda',
      'VPItv lost control of its transmission platform for part of an evening. What replaced it attacked the opposition, the United States and independent media.',
      array[
        'On the evening of 23 June 2026, VPItv''s streaming platform stopped carrying its own programming. In its place ran political material praising Nicolas Maduro and Hugo Chavez and attacking the United States, the Venezuelan opposition and independent outlets.',
        'A group presenting itself as Turkish hackers claimed responsibility. The channel''s technical staff regained control the same night.',
        '> The broadcaster said the material did not represent its editorial position, and preserved what it could as evidence.',
        'VPItv reported the incident to authorities in the United States, where parts of its infrastructure sit. Taking an independent channel off air for an evening and substituting state-aligned messaging is cheaper than jamming a signal and harder to attribute.',
        'This report summarises reporting first published by VPItv. The original is at https://vpitv.com/lo-ultimo/vpitv-denuncia-ataque-en-contra-de-su-plataforma-de-transmision/'
      ],
      'data', 'Press freedom', 3, interval '31 hours'
    ),
    (
      'venezuelan-outlets-put-five-demands-on-censorship',
      'Venezuelan newsrooms set out five demands on censorship',
      'Editors from La Patilla, El Nacional, VPI TV and El Diario met a transition commission and named what would have to change.',
      array[
        'On 3 September 2026, representatives of several Venezuelan outlets met a transition commission chaired by Dinorah Figuera, who presided over the 2015 National Assembly.',
        'They brought five proposals: unblock news portals, extend amnesty to journalists, repeal the laws used to punish coverage, make broadcast concessions transparent, and open up how state advertising is allocated.',
        '> Each of the five describes a mechanism already in use, which is what makes the list specific rather than aspirational.',
        'Leonardo Trechi of VPI TV pointed to an administrative case against his own outlet under the Hate Law as an example of how the machinery works in practice. Rory Branker of La Patilla described the room as people who had been on the receiving end of it.',
        'This report summarises reporting first published by VPItv. The original is at https://vpitv.com/lo-ultimo/medios-de-comunicacion-participaron-en-mesa-de-trabajo-con-la-comision-de-transicion-para-fortalecer-libertad-de-expresion-y-desmontar-censura/'
      ],
      'night', 'Press freedom', 4, interval '3 days'
    ),
    (
      'forty-two-satellite-antennas-after-the-june-earthquake',
      'Forty-two satellite antennas, and no government in the picture',
      'After the 24 June earthquake cut connectivity in Caracas and La Guaira, the network that came back was assembled by companies, donors and volunteers.',
      array[
        'The earthquake of 24 June 2026 left parts of Caracas and La Guaira without usable internet access. ReconectaVenezuela.com put 42 Starlink kits into service across both, free to use.',
        'The kits were assembled from private companies, donors and civil society groups including RedesAyuda and Telecom District. SpaceX extended its usual 30 days of service to 90.',
        '> What is notable is not the speed. It is who was absent from it.',
        'The organisers describe a response coordinated without the state, after no official answer came. For people trying to find relatives or move aid, the practical question was which antenna was nearest, not who paid for it.',
        'This report summarises reporting first published by VPItv. The original is at https://vpitv.com/lo-ultimo/reconectavenezuela-com-habilita-42-antenas-satelitales-gratuitas-en-caracas-y-la-guaira-tras-el-terremoto-del-24-de-junio/'
      ],
      'water', 'Connectivity', 3, interval '5 days'
    )
  ) as v(slug, title, dek, body, art, category, read_mins, ago)
 where j.public_alias = 'Northstar'
on conflict (slug) do nothing;
