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
