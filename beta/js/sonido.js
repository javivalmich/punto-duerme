/* Sonidos: solo suenan en el móvil del narrador (si sonaran en el de cada jugador, podrían delatar
   quién está haciendo algo). Son archivos de audio/ con nombres claros; los actuales son provisionales:
   para cambiarlos, sustituye el archivo (o cambia aquí la ruta si cambia la extensión). */
import { VOZ } from './narrador.js';

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
const cache = {};
export function suena(nombre) {
  if (VOZ.mudo || !SONIDOS[nombre]) return;
  try {
    const a = cache[nombre] || (cache[nombre] = new Audio(SONIDOS[nombre]));
    a.currentTime = 0; const p = a.play(); if (p && p.catch) p.catch(() => { });
  } catch (e) { }
}
/* Precarga al primer toque (los navegadores no dejan sonar nada antes de un gesto) */
export function precarga() {
  for (const k in SONIDOS) if (!cache[k]) {
    try { const a = new Audio(SONIDOS[k]); a.preload = 'auto'; cache[k] = a } catch (e) { }
    /* además se guardan en memoria (los lee el service worker desde su caché si no hay conexión) */
    fetch(SONIDOS[k]).then(r => r.ok ? r.blob() : null).then(b => { if (b) { const a = new Audio(URL.createObjectURL(b)); a.preload = 'auto'; cache[k] = a } }).catch(() => { });
  }
}
