/* Música de ambiente: HUECO PREPARADO, DESACTIVADO. No hay pitidos ni efectos de sonido: solo suena la voz del narrador.
   Para añadir música más adelante: pon el archivo en beta/audio/ambiente/ (mp3), ponlo en `AMBIENTE.archivo` y
   activa `AMBIENTE.activo`. Sonaría en bucle y suave (con Web Audio, ver audio.js: nunca <audio>), solo en el móvil del
   narrador (en el de los jugadores podría delatar quién hace algo), bajando el volumen mientras habla la voz.
   Falta decidir: volumen, fundido entre noche y día, y si cambia de pista según la fase. */
import { precargaVoz } from './narrador.js';

export const AMBIENTE = { activo: false, archivo: null /* p. ej. 'audio/ambiente/noche.mp3' */, volumen: 0.25 };

/* Precarga lo que haga falta tras el primer toque: la voz grabada (y, si se activa, la música) */
export function precarga() {
  precargaVoz();
  /* if (AMBIENTE.activo && AMBIENTE.archivo) …cargar y empezar el bucle con ganancia AMBIENTE.volumen */
}
