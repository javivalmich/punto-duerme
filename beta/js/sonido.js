/* Sonidos: solo suenan en el móvil del narrador (si sonaran en el de cada jugador, podrían delatar
   quién está haciendo algo). Son archivos de audio/ con nombres claros; los actuales son provisionales:
   para cambiarlos, sustituye el archivo (o cambia aquí la ruta si cambia la extensión). */
import { VOZ, precargaVoz } from './narrador.js';
import { decodifica, reproduce as suenaBuffer } from './audio.js';

export const SONIDOS = {
  noche: 'audio/noche.wav',              // cae la noche
  amanecer: 'audio/amanecer.wav',        // amanece
  muerte: 'audio/muerte.wav',            // se anuncia un muerto (noche o votación)
  votacion: 'audio/votacion.wav',        // empieza la votación
  eliminado: 'audio/eliminado.wav',      // el pueblo echa a alguien
  tic: 'audio/tic.wav',                  // últimos segundos de una cuenta atrás
  'victoria-ciegos': 'audio/victoria-ciegos.wav',
  'victoria-puntos': 'audio/victoria-puntos.wav'
};
/* Con Web Audio (no <audio>: en iOS crearía el reproductor de la pantalla de bloqueo); ver audio.js */
export function suena(nombre) {
  if (VOZ.mudo || !SONIDOS[nombre]) return;
  decodifica(SONIDOS[nombre], true).then(b => suenaBuffer(b)).catch(() => { });
}
/* Precarga al primer toque (los navegadores no dejan sonar nada antes de un gesto); también se guardan para usarlos sin conexión */
export function precarga() {
  precargaVoz();
  for (const k in SONIDOS) decodifica(SONIDOS[k], true).catch(() => { });
}
