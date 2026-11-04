/* Textos del narrador. Están aquí aparte para poder cambiarlos sin tocar el juego y, más adelante,
   grabarlos con otra voz: cada frase tiene un id; un audio en audio/voz/<id>-<n>.mp3 (n = número de
   variante, desde 1) podría sustituir a la voz del navegador. Las frases con {nombre} seguirán
   necesitando la voz sintética para el nombre.

   - Cada id tiene una o varias variantes; en cada fase se elige una al azar, pero la misma en todos
     los móviles (sale del código de la sala, la ronda y la fase), así el subtítulo coincide con la voz.
   - «|» es una pausa corta al hablar (no se ve en el subtítulo).
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
    'Amanece en el pueblo… | Esta noche ha muerto {nombre}.',
    'Sale el sol. | El pueblo despierta… pero falta alguien. | Esta noche ha muerto {nombre}.',
    'Amanece. | Al abrir las puertas, el pueblo descubre que {nombre} ha muerto esta noche.'
  ],
  amanece_nadie: [
    'Amanece en el pueblo… | Esta noche no ha muerto nadie.',
    'Sale el sol. | Todos siguen aquí. | Esta noche no ha muerto nadie.'
  ],
  era_punto: ['{nombre} era un Punto.'],
  era_ciego: ['{nombre} era un Ciego.'],

  debate: [
    'Ahora, debatid. | ¿Quién es un Punto? | Tenéis {tiempo}.',
    'Es hora de hablar. | Tenéis {tiempo} para encontrar a los Puntos.'
  ],
  debate_30s: ['Quedan treinta segundos de debate.'],
  votacion: [
    'Se acabó el debate. | Votad en vuestro móvil a quién queréis echar del pueblo.',
    'Ha llegado la hora de votar. | Elegid en vuestro móvil.'
  ],
  votacion_10s: ['Quedan diez segundos para votar.'],

  eliminado: [
    'El pueblo ha decidido. | {nombre} abandona el pueblo.',
    'Los votos están contados. | {nombre} queda fuera del pueblo.'
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
  ]
};

/* Elige variante de forma determinista (igual en todos los móviles) y rellena {campos} */
export function texto(id, vars, semilla) {
  const v = TEXTOS[id]; if (!v) return '';
  let h = 0; const s = String(semilla || '') + id; for (let i = 0; i < s.length; i++)h = (h * 31 + s.charCodeAt(i)) | 0;
  return v[Math.abs(h) % v.length].replace(/\{(\w+)\}/g, (_, k) => vars && vars[k] != null ? vars[k] : '');
}
export const subtitulo = t => t.replace(/\s*\|\s*/g, ' ');
