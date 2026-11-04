/* Textos del narrador. Están aquí aparte para poder cambiarlos sin tocar el juego y, más adelante,
   grabarlos con otra voz: cada frase tiene un id; un audio en audio/voz/<id>-<n>.mp3 (n = número de
   variante, desde 1) podría sustituir a la voz del navegador. Las frases con {nombre} seguirán
   necesitando la voz sintética para el nombre.

   - Cada id tiene una o varias variantes; en cada fase se elige una al azar, pero la misma en todos
     los móviles (sale del código de la sala, la ronda y la fase), así el subtítulo coincide con la voz.
   - «|» es una pausa corta al hablar (no se ve en el subtítulo).
   - La voz buena son audios pregrabados (audio/voz/<id>-<n>.mp3, n = variante desde 1; ver CLAUDE.md → Voz del narrador).
     Por eso ninguna frase lleva nombres ni tiempos: el nombre del jugador sale grande en pantalla y el tiempo, en el reloj.
     Si cambias una frase, hay que regenerar su audio (node scripts/voz.mjs); mientras tanto habla la voz del navegador.
   - Regla de oro: el narrador NUNCA dice nada que revele un papel de forma indirecta. Las frases de
     cada fase son las mismas pase lo que pase (esté vivo o muerto quien sea, se haya actuado o no). */

export const TEXTOS = {
  bienvenida: [
    'Bienvenidos a Punto Duerme. | Mirad vuestro papel en secreto y pulsad «Ya lo he visto».',
    'Empieza la partida. | Cada uno mire su papel sin que nadie lo vea.'
  ],
  primera_noche: [
    'Cae la primera noche sobre el pueblo. | Todos, mirad vuestro móvil. | Los Puntos abren los ojos y eligen a su víctima. | El resto, marcad de quién sospecháis.',
    'El sol se esconde y el pueblo se va a dormir. | Mirad todos vuestro móvil. | Los Puntos despiertan y buscan a quién eliminar. | Los demás, señalad a quien os parezca sospechoso.'
  ],
  anochece: [
    'Cae la noche sobre el pueblo. | Todos, mirad vuestro móvil. | Los Puntos abren los ojos y eligen a su víctima. | El resto, marcad de quién sospecháis.',
    'Otra noche más. | El pueblo cierra las puertas y apaga las luces. | Mirad vuestro móvil. | Los Puntos vuelven a salir.',
    'Oscurece. | Mirad todos vuestro móvil. | Los Puntos abren los ojos. | Los demás, marcad de quién sospecháis.'
  ],
  noche_elegid: ['Elegid ahora.', 'Tenéis poco tiempo. Elegid.'],
  noche_10s: ['Quedan diez segundos.'],

  amanece_muerto: [
    'Amanece en el pueblo… | Esta noche ha muerto este jugador.',
    'Sale el sol. | El pueblo despierta… pero falta alguien. | Esta noche ha muerto este jugador.',
    'Amanece. | Al abrir las puertas, el pueblo descubre que este jugador ha muerto esta noche.'
  ],
  amanece_nadie: [
    'Amanece en el pueblo… | Esta noche no ha muerto nadie.',
    'Sale el sol. | Todos siguen aquí. | Esta noche no ha muerto nadie.'
  ],
  era_punto: ['Era un Punto.'],
  era_ciego: ['Era un Ciego.'],

  debate: [
    'Ahora, debatid. | ¿Quién es un Punto? | El reloj ya corre.',
    'Es hora de hablar. | Tenéis el tiempo del reloj para encontrar a los Puntos.'
  ],
  debate_30s: ['Quedan treinta segundos de debate.'],
  votacion: [
    'Se acabó el debate. | Votad en vuestro móvil a quién queréis echar del pueblo.',
    'Ha llegado la hora de votar. | Elegid en vuestro móvil.'
  ],
  votacion_10s: ['Quedan diez segundos para votar.'],

  eliminado: [
    'El pueblo ha decidido. | Este jugador abandona el pueblo.',
    'Los votos están contados. | Este jugador queda fuera del pueblo.'
  ],
  empate: [
    'Hay empate. | Hoy nadie abandona el pueblo.',
    'El pueblo no se pone de acuerdo. | Hoy nadie se va.'
  ],
  sin_votos: ['Nadie ha votado. | Hoy nadie abandona el pueblo.'],

  gana_pueblo: [
    'No queda ningún Punto. | ¡Ganan los Ciegos!',
    'El último Punto ha caído. | El pueblo vuelve a dormir tranquilo. | ¡Ganan los Ciegos!'
  ],
  gana_puntos: [
    'Los Puntos ya son tantos como los Ciegos. | ¡Ganan los Puntos!',
    'El pueblo ha caído en manos de los Puntos. | ¡Ganan los Puntos!'
  ],

  /* Modo de un solo móvil */
  solo_reparto: [
    'Vamos a repartir los papeles. | Cuando el móvil llegue a tus manos, mira tu papel en secreto y pásalo.',
    'Empieza la partida. | Cada uno, cuando le llegue el móvil, mire su papel sin que nadie lo vea.'
  ],
  solo_noche: [
    'Cae la noche sobre el pueblo. | Todos cerráis los ojos y dejáis el móvil en el centro.',
    'El pueblo se va a dormir. | Cerrad los ojos y que nadie los abra hasta que yo lo diga.',
    'Oscurece. | Todos los ojos cerrados. | Nadie mira.'
  ],
  puntos_abre: ['Los Puntos abren los ojos. | Que uno de vosotros coja el móvil, elija a la víctima y lo deje otra vez en el centro.'],
  puntos_cierra: ['Los Puntos cierran los ojos.'],
  cupido_abre: ['Cupido abre los ojos. | Que coja el móvil, elija a los dos enamorados y lo deje en el centro.'],
  cupido_cierra: ['Cupido cierra los ojos.'],
  vidente_abre: ['La Vidente abre los ojos. | Que coja el móvil, elija a quién quiere ver y lo deje en el centro.'],
  vidente_cierra: ['La Vidente cierra los ojos.'],
  bruja_abre: ['La Bruja abre los ojos. | Que coja el móvil, decida qué hace con sus pociones y lo deje en el centro.'],
  bruja_cierra: ['La Bruja cierra los ojos.'],
  solo_votacion: [
    'Se acabó el debate. | Ahora votaréis uno a uno y en secreto. | Cuando el móvil llegue a tus manos, elige a quién echar del pueblo.',
    'Hora de votar. | Os iré pasando el móvil. | Votad en secreto.'
  ]
};

/* Entonación de cada frase (para generar el audio con su estilo: scripts/voz.mjs → scripts/voz-config.json).
   hushed: la noche · tense: muertes, votación y eliminados · rich: bienvenida, amanecer, debate y final. */
export const TONO = {
  bienvenida: 'rich', solo_reparto: 'rich', amanece_nadie: 'rich', debate: 'rich', debate_30s: 'rich', gana_pueblo: 'rich', gana_puntos: 'rich',
  primera_noche: 'hushed', anochece: 'hushed', solo_noche: 'hushed', noche_elegid: 'hushed', noche_10s: 'hushed',
  puntos_abre: 'hushed', puntos_cierra: 'hushed', cupido_abre: 'hushed', cupido_cierra: 'hushed', vidente_abre: 'hushed', vidente_cierra: 'hushed', bruja_abre: 'hushed', bruja_cierra: 'hushed',
  amanece_muerto: 'tense', era_punto: 'tense', era_ciego: 'tense', votacion: 'tense', votacion_10s: 'tense', solo_votacion: 'tense', eliminado: 'tense', empate: 'tense', sin_votos: 'tense'
};

/* Elige variante de forma determinista (igual en todos los móviles) y rellena {campos} */
export function texto(id, vars, semilla) {
  const v = TEXTOS[id]; if (!v) return '';
  let h = 0; const s = String(semilla || '') + id; for (let i = 0; i < s.length; i++)h = (h * 31 + s.charCodeAt(i)) | 0;
  return v[Math.abs(h) % v.length].replace(/\{(\w+)\}/g, (_, k) => vars && vars[k] != null ? vars[k] : '');
}
export const subtitulo = t => t.replace(/\s*\|\s*/g, ' ');
