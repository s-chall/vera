-- LOCAL DEMO. A Spanish translation of the lead story, so the language switch
-- has something to show without a translation provider configured.
insert into public.article_translations (article_id, language, title, dek, body, source)
select a.id, 'es',
  'Los pueblos que están siendo borrados del mapa oficial',
  'Los residentes describen desalojos silenciosos, registros desaparecidos y los caminos que se esfuman antes del amanecer.',
  array[
    'Lo primero que desapareció fue la parada de autobús. No la caseta, que sigue en pie en el cruce con su banco y su horario descolorido, sino la parada en sí: el registro en la base de datos de la autoridad de transporte que indicaba a los conductores que debían reducir la velocidad aquí.',
    'Para cuando alguien en Hollow Bend se dio cuenta, el autobús de las 6:10 llevaba once semanas pasando de largo.',
    '> "No se puede apelar algo que nunca se anunció. No hay carta. Solo hay un autobús que no para."',
    'Pasé nueve días en tres asentamientos del corredor norte. Los tres fueron constituidos antes de 1974. Los tres aparecen en el catastro regional impreso que se conserva en el archivo del distrito. Ninguno aparece en la capa catastral a la que el ministerio de planificación migró la primavera pasada.',
    'El ministerio sostiene que se trata de un problema de migración de datos y que las correcciones están en curso. Lo viene diciendo desde marzo. Mientras tanto, un asentamiento que no figura en la capa no puede obtener un permiso de obra, no puede recibir conexión a la red y no puede impugnar la venta del terreno sobre el que se asienta.',
    'Meret Osei lleva treinta y un años viviendo en Hollow Bend. Me mostró una carpeta con recibos de una conexión de agua que paga desde 2009, y una carta de la empresa de servicios que explica que la dirección de esos recibos no existe.',
    'Dos de los tres asentamientos han recibido desde entonces cuadrillas de topógrafos. Ambos levantamientos fueron encargados por la misma sociedad de cartera privada, y ambos se presentaron como evaluaciones de terreno virgen, la designación que se usa para suelo sin ocupación previa.',
    'Pregunté a la empresa por esa designación. Un representante dijo que las evaluaciones eran rutinarias y se negó a decir quién las había encargado. Los caminos se construyeron cuatro semanas después.'
  ],
  'human'
  from public.articles a
 where a.slug = 'inside-the-towns-being-erased-from-the-official-map'
on conflict (article_id, language) do nothing;
