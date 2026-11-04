/* Textos del narrador. Están aquí aparte para poder cambiarlos sin tocar el juego y, más adelante,
   grabarlos con otra voz: cada frase tiene un id; un audio en audio/voz/<id>-<n>.mp3 (n = número de
   variante, desde 1) podría sustituir a la voz del navegador. Las frases con {nombre} seguirán
   necesitando la voz sintética para el nombre.

   - Cada id tiene una o varias variantes; en cada fase se elige una al azar, pero la misma en todos
     los móviles (sale del código de la sala, la ronda y la fase), así el subtítulo coincide con la voz.
   - «|» es una pausa corta al hablar (no se ve en el subtítulo).
   - La voz buena son audios pregrabados (audio/voz/<id>-<n>.mp3, n = variante desde 1; ver CLAUDE.md → Voz del narrador).
     Por eso ninguna frase lleva nombres ni tiempos: el nombre del jugador sale grande en pantalla y el tiempo, en el reloj.
   - El narrador SOLO cuenta la historia, con tono de cuento: nunca órdenes de juego («votad», «elegid»), avisos de tiempo ni el bando o el
     papel de nadie (eso se ve en pantalla si «revelar el papel» está activado). De noche (multimóvil todos miran su móvil): nada de «cierran los ojos».
     Si cambias una frase, hay que regenerar su audio (node scripts/voz.mjs); mientras tanto habla la voz del navegador.
   - Regla de oro: el narrador NUNCA dice nada que revele un papel de forma indirecta. Las frases de
     cada fase son las mismas pase lo que pase (esté vivo o muerto quien sea, se haya actuado o no). */

export const TEXTOS = {
  /* ---- noche (hushed) ---- */
  noche_cae: [
    'Cae la noche sobre el pueblo… | y todos se quedan dormidos.',
    'Otra noche más. | El pueblo apaga las luces y se queda dormido.',
    'Oscurece de nuevo… | y todo el pueblo duerme.'
  ],
  primera_noche: [
    'Cae la primera noche sobre el pueblo… | y todos se quedan dormidos.',
    'El sol se esconde por primera vez… | y el pueblo se queda dormido.'
  ],
  puntos_abre: [
    'Los Puntos despiertan… | y buscan a su próxima víctima.',
    'En la oscuridad, los Puntos abren los ojos… | y eligen.'
  ],
  puntos_cierra: [
    'Los Puntos vuelven a dormir.',
    'Los Puntos cierran los ojos… | y la noche sigue su curso.'
  ],
  cupido_abre: ['Cupido despierta… | y une dos corazones para siempre.'],
  cupido_cierra: ['Cupido vuelve a dormir.'],
  vidente_abre: ['La Vidente despierta… | y busca la verdad en la oscuridad.'],
  vidente_cierra: ['La Vidente vuelve a dormir.'],
  bruja_abre: ['La Bruja despierta… | con sus pociones entre las manos.'],
  bruja_cierra: ['La Bruja vuelve a dormir.'],

  /* ---- muertes y votación (tense) ---- */
  amanece_muerto: [
    '…pero alguien no ha vuelto a despertar.',
    '…pero una silla queda vacía en la mesa.',
    '…y un grito rompe la calma: | alguien no ha sobrevivido a la noche.'
  ],
  amanece_varios: [
    '…pero esta noche la muerte ha visitado más de una casa.',
    '…y el pueblo descubre que esta noche ha habido más de una víctima.'
  ],
  votacion: [
    'El pueblo ha perdido la paciencia… | alguien pagará por ello.',
    'Las sospechas se vuelven acusaciones…',
    'Ha llegado la hora de señalar con el dedo.'
  ],
  eliminado: [
    'El pueblo ha tomado su decisión… | y señala a…',
    'Los votos están contados… | y el elegido es…',
    'La plaza guarda silencio… | todas las miradas apuntan a…'
  ],
  empate: [
    'El pueblo no se pone de acuerdo… | hoy nadie abandona el pueblo.',
    'Los votos se reparten… | y nadie se va.'
  ],
  sin_votos: ['Nadie se atreve a acusar a nadie… | hoy nadie abandona el pueblo.'],
  amantes_mueren: ['Dos corazones latían como uno… | y ahora ambos se han apagado.'],

  /* ---- bienvenida, amanecer, debate y final (rich) ---- */
  bienvenida: [
    'Bienvenidos a Punto Duerme… | un pueblo tranquilo. | Demasiado tranquilo.',
    'En este pueblo, cada uno guarda un secreto… | y esta noche empieza a salir a la luz.'
  ],
  amanece_inicio: [
    'El pueblo amanece de nuevo…',
    'Sale el sol sobre las casas del pueblo…',
    'La luz del día vuelve a las calles…'
  ],
  amanece_nadie: [
    'Esta noche, por suerte, nadie ha muerto.',
    'La noche ha pasado… | y todos siguen aquí.',
    'Nadie ha caído esta noche. | Pero el peligro sigue entre vosotros.'
  ],
  debate: [
    'El pueblo se reúne. | Alguien entre vosotros miente.',
    'Se abren las puertas de la plaza… | y empiezan los murmullos.',
    'Todas las miradas se cruzan. | Un Punto camina entre vosotros.'
  ],
  gana_pueblo: [
    'Los Puntos han caído. | El pueblo vuelve a dormir tranquilo.',
    'El último Punto ha sido descubierto… | ¡Gana el pueblo!'
  ],
  gana_puntos: [
    'Los Puntos se han adueñado del pueblo.',
    'Ya no queda nadie que los detenga… | ¡Ganan los Puntos!'
  ],
  gana_amantes: ['Contra todo pronóstico, el amor lo ha vencido… | ¡Ganan los enamorados!']
};

/* Entonación de cada frase (para generar el audio con su estilo: scripts/voz.py → scripts/voz-config.json).
   hushed: la noche · tense: muertes, votación y eliminados · rich: bienvenida, amanecer, debate y final. */
export const TONO = {
  noche_cae: 'hushed', primera_noche: 'hushed', puntos_abre: 'hushed', puntos_cierra: 'hushed', cupido_abre: 'hushed', cupido_cierra: 'hushed',
  vidente_abre: 'hushed', vidente_cierra: 'hushed', bruja_abre: 'hushed', bruja_cierra: 'hushed',
  amanece_muerto: 'tense', amanece_varios: 'tense', votacion: 'tense', eliminado: 'tense', empate: 'tense', sin_votos: 'tense', amantes_mueren: 'tense',
  bienvenida: 'rich', amanece_inicio: 'rich', amanece_nadie: 'rich', debate: 'rich', gana_pueblo: 'rich', gana_puntos: 'rich', gana_amantes: 'rich'
};

/* Elige variante de forma determinista (igual en todos los móviles) y rellena {campos} */
export function texto(id, vars, semilla) {
  const v = TEXTOS[id]; if (!v) return '';
  let h = 0; const s = String(semilla || '') + id; for (let i = 0; i < s.length; i++)h = (h * 31 + s.charCodeAt(i)) | 0;
  return v[Math.abs(h) % v.length].replace(/\{(\w+)\}/g, (_, k) => vars && vars[k] != null ? vars[k] : '');
}
export const subtitulo = t => t.replace(/\s*\|\s*/g, ' ');
