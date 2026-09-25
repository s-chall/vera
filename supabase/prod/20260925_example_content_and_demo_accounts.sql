-- One-off for veras.news, 2026-09-25: replace the placeholder stories with the
-- example reporting, and create the demo accounts, one per account type.
--
-- Run once, as postgres, in a single transaction, with the demo password passed
-- in rather than written here:
--
--   psql -v ON_ERROR_STOP=1 --single-transaction \
--        -v demo_password="$VERA_DEMO_PASSWORD" -f this-file.sql
--
-- The password deliberately differs from vera-demo-2026, which is published in
-- this public repository: on a public site a published password lets anyone
-- sign in and publish as a verified journalist. The accounts and their emails
-- match the local demo accounts otherwise.
--
-- Not a seed in /srv/vera/seed: migrate.sh would apply it on a fresh server,
-- and the published-password guard there exists for good reason.

-- `is not null` so the password itself is never echoed into a terminal or log
select set_config('vera.demo_password', :'demo_password', true) is not null as password_set;

do $$
declare
  demo record;
  new_user uuid;
  pw text := current_setting('vera.demo_password');
begin
  if length(pw) < 10 then
    raise exception 'demo_password must be at least 10 characters';
  end if;

  for demo in
    select * from (values
      ('johan@vera.test',      'journalist'::public.account_type, 'Johan Alvarez', 'seal-b',
       'Press freedom', 'Venezuela',
       'Reporting on detentions, censorship and the infrastructure that keeps news reaching people.'),
      ('journalist@vera.test', 'journalist'::public.account_type, 'Ash Meridian',  'seal-b',
       'Public records', 'Caracas', 'Files on procurement and vanished paperwork.'),
      ('desk@nytimes.com',     'media_org'::public.account_type,  'Times Desk',    'seal-c',
       'Investigations desk', 'New York', 'Commissioning desk reading reporting filed to Vera.'),
      ('funder@vera.test',     'funder'::public.account_type,     'Quiet Backer',  'seal-d',
       'Supporter', 'Undisclosed', 'Funds the reporting pool.')
    ) as t(email, kind, alias, seal, beat, region, bio)
  loop
    if exists (select 1 from auth.users u where u.email = demo.email) then
      continue;
    end if;

    new_user := gen_random_uuid();

    -- Token columns must be '' rather than NULL: GoTrue scans them into
    -- non-nullable Go strings and a NULL turns every sign-in into a 500.
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, reauthentication_token, phone_change, phone_change_token
    ) values (
      '00000000-0000-0000-0000-000000000000', new_user, 'authenticated', 'authenticated',
      demo.email, extensions.crypt(pw, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('account_type', demo.kind::text),
      now(), now(), '', '', '', '', '', '', '', ''
    );

    insert into auth.identities (id, provider_id, user_id, identity_data, provider,
                                 last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), new_user::text, new_user,
            jsonb_build_object('sub', new_user::text, 'email', demo.email, 'email_verified', true),
            'email', now(), now(), now());

    -- handle_new_user() minted the byline and the wallet trigger its Signet wallet.
    update public.journalists
       set public_alias = demo.alias,
           seal         = demo.seal,
           beat         = demo.beat,
           region       = demo.region,
           bio          = demo.bio,
           verified_at  = case when demo.kind = 'journalist' then now() else verified_at end,
           funding_confirmed_at = case when demo.kind = 'funder' then now() else funding_confirmed_at end,
           credential_name    = case when demo.alias = 'Johan Alvarez' then 'Johan Alvarez' end,
           -- above 28325, the register's highest member, so it resolves to no one
           credential_carnet  = case when demo.alias = 'Johan Alvarez' then '30418' end,
           credential_section = case when demo.alias = 'Johan Alvarez' then 'Distrito Capital' end
     where owner_user_id = new_user;
  end loop;
end $$;

-- The placeholder stories from the first seed. Their demo credits cascade.
delete from public.articles
 where slug in ('inside-the-towns-being-erased-from-the-official-map',
                'the-night-shift-keeping-the-city-online',
                'who-profits-when-the-water-stops',
                'a-school-a-server-room-and-12-000-missing-names');

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
from public.journalists j where j.public_alias = 'Johan Alvarez'
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
 where j.public_alias = 'Johan Alvarez'
on conflict (slug) do nothing;

-- LOCAL DEMO. Republication credits for one seeded story, so the article
-- sidebar has something to show.
insert into public.article_pickups (article_id, outlet, outlet_slug, url, picked_up_at)
select a.id, v.outlet, v.slug, v.url, now() - v.ago
  from public.articles a
  cross join (values
    ('The New York Times', 'nytimes', 'https://www.nytimes.com/', interval '6 hours'),
    ('CNN',               'cnn',     'https://www.cnn.com/',     interval '19 hours'),
    ('VPItv',             'vpitv',   'https://vpitv.com/',       interval '2 days')
  ) as v(outlet, slug, url, ago)
 where a.slug = 'trujillo-reporter-detained-over-fuel-shortage-story'
on conflict (article_id, outlet_slug) do nothing;

-- LOCAL DEMO. Spanish translation of the seeded story, so the language switch
-- works without a translation provider configured.
insert into public.article_translations (article_id, language, title, dek, body, source)
select a.id, 'es',
  'Trujillo: un periodista detenido por una nota sobre la escasez de gasolina',
  'Pablo Mujica estuvo retenido tres horas, fue interrogado sobre su cobertura de las colas de gasolina y le dijeron que el gobernador quería que parara.',
  array[
    'El 1 de junio de 2026, hombres armados interceptaron a Pablo José Mujica Rodríguez, reportero de Noticias La Voz de Valera, y lo trasladaron a una comisaría en Valera, estado Trujillo. Permaneció retenido unas tres horas.',
    'Los funcionarios lo interrogaron sobre un artículo que había publicado acerca de la escasez de combustible en la región. Según su propio relato, le dijeron que el gobernador del estado, Gerardo Márquez, estaba molesto con la cobertura.',
    '> Le prohibieron, asegura, volver a informar sobre el combustible.',
    'Antes de dejarlo ir, la policía lo presionó para que publicara una segunda nota alineada con la posición del gobernador. El Sindicato Nacional de Trabajadores de la Prensa registró la detención.',
    'Mujica no es el primero. Periodistas en Trujillo han sido detenidos, interrogados y advertidos repetidamente, y las colas de gasolina son un detonante recurrente: son visibles, son contables y contradicen la versión oficial.',
    'Este reporte resume una información publicada originalmente por El Pitazo. Lea el original en https://elpitazo.net/regiones/trujillo-periodista-pablo-mujica-fue-detenido-por-publicar-una-nota-sobre-la-escasez-de-gasolina/'
  ],
  'human'
  from public.articles a
 where a.slug = 'trujillo-reporter-detained-over-fuel-shortage-story'
on conflict (article_id, language) do nothing;

-- Open to every member, as the publish dialog allows, so each demo account has
-- a feed. A media_only default would leave the funder and journalist demos empty.
update public.articles
   set visibility = 'members'
 where slug in ('trujillo-reporter-detained-over-fuel-shortage-story',
                'vpitv-broadcast-platform-hijacked',
                'venezuelan-outlets-put-five-demands-on-censorship',
                'forty-two-satellite-antennas-after-the-june-earthquake');
