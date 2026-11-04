/* Catálogo de personajes. El reparto y lo que hace cada uno de noche lo decide el servidor
   (supabase/migrations): aquí solo está cómo se presentan en pantalla.
   Para añadir un personaje: entrada aquí + su reparto y su paso de la noche en el servidor
   + sus frases en textos-narrador.js. `fase` indica en qué fase lo pondrá en marcha (fase 2+). */

export const ROLES = {
  punto: {
    nombre: 'Punto', plural: 'Puntos', bando: 'puntos', siempre: true,
    corto: 'Eres uno de los asesinos.',
    texto: 'Cada noche, tus compañeros y tú elegís a quién eliminar. De día, que no te descubran.'
  },
  ciego: {
    nombre: 'Ciego', plural: 'Ciegos', bando: 'pueblo', siempre: true,
    corto: 'Eres del pueblo.',
    texto: 'No sabes quién es quién. Debate de día y vota para echar a los Puntos.'
  },
  /* Opcionales: el anfitrión los activará al crear la partida (fase 2) */
  bruja: { nombre: 'Bruja', plural: 'Brujas', bando: 'pueblo', opcional: true, fase: 2, texto: 'Una poción para revivir y otra para matar, una vez cada una.' },
  cupido: { nombre: 'Cupido', plural: 'Cupidos', bando: 'pueblo', opcional: true, fase: 2, texto: 'La primera noche enamora a dos jugadores.' },
  vidente: { nombre: 'Vidente', plural: 'Videntes', bando: 'pueblo', opcional: true, fase: 2, texto: 'Cada noche ve el papel de un jugador.' },
  /* Previstos para más adelante */
  guardian: { nombre: 'Guardián', bando: 'pueblo', opcional: true, futuro: true },
  cazador: { nombre: 'Cazador', bando: 'pueblo', opcional: true, futuro: true },
  alcalde: { nombre: 'Alcalde', bando: 'pueblo', opcional: true, futuro: true },
  anciano: { nombre: 'Anciano', bando: 'pueblo', opcional: true, futuro: true },
  nina: { nombre: 'Niña curiosa', bando: 'pueblo', opcional: true, futuro: true }
};

export const nombreRol = r => (ROLES[r] && ROLES[r].nombre) || '';

/* Puntos sugeridos: el mismo cálculo que el servidor (_duerme_puntos) */
export const sugerirPuntos = n => n <= 5 ? 1 : n <= 8 ? 2 : n <= 11 ? 3 : 4;
export const maxPuntos = n => Math.max(1, Math.floor((n - 1) / 2));
export const puntosPara = (n, pedidos) => Math.max(1, Math.min(pedidos || sugerirPuntos(n), maxPuntos(n)));
