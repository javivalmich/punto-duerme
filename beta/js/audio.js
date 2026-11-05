/* Todo el sonido de la app (la voz grabada del narrador; no hay efectos) pasa por Web Audio (AudioContext), nunca por elementos <audio>/<video>:
   iOS trata un <audio> como «música» y deja el reproductor «Punto Duerme» en la pantalla de bloqueo (con play, ±10 s…).
   Con Web Audio no aparece. Además se limpia navigator.mediaSession y se para y libera todo al salir de la partida,
   al ocultarse/cerrarse la página (pagehide) y al terminar cada clip.
   La pantalla se mantiene encendida solo con la Wake Lock API (app.js), nunca con un audio o vídeo en silencio. */

let CTX = null;
const ACTIVOS = new Set();   // fuentes sonando ahora mismo
const CRUDOS = new Map();    // url -> Promise<ArrayBuffer> (sin decodificar, ocupa poco)

const Ctor = window.AudioContext || window.webkitAudioContext;

/* Quita cualquier rastro de «reproductor» en la pantalla de bloqueo */
export function limpiaMediaSession() {
  try {
    const ms = navigator.mediaSession; if (!ms) return;
    ms.metadata = null; ms.playbackState = 'none';
    for (const a of ['play', 'pause', 'stop', 'seekbackward', 'seekforward', 'previoustrack', 'nexttrack', 'seekto']) { try { ms.setActionHandler(a, null) } catch (e) { } }
  } catch (e) { }
}

/* Hay que llamarlo desde un toque del usuario (iOS no deja sonar antes): crea o reanuda el contexto y emite un instante de silencio */
/* iOS: con «playback» el audio de Web Audio suena aunque el móvil esté en modo silencio (la voz del navegador, no: no tiene arreglo) */
function tipoSesion(t) { try { if (navigator.audioSession) navigator.audioSession.type = t } catch (e) { } }

export function desbloquea() {
  limpiaMediaSession(); tipoSesion('playback');
  if (!Ctor) return;
  try {
    if (!CTX || CTX.state === 'closed') { CTX = new Ctor(); marca('contexto creado: ' + CTX.state); CTX.onstatechange = () => marca('estado → ' + (CTX && CTX.state)) }
    if (CTX.state !== 'running') CTX.resume().catch(() => { });
    const b = CTX.createBuffer(1, 1, 22050), s = CTX.createBufferSource(); s.buffer = b; s.connect(CTX.destination); s.start(0);
    s.onended = () => { try { s.disconnect() } catch (e) { } };
  } catch (e) { }
}
/* Para el panel de pruebas: estado del contexto y de la sesión de audio de iOS, y los últimos cambios de estado */
const HIST = [];
const marca = t => { HIST.push(((performance.now() / 1000) | 0) + ' s: ' + t); if (HIST.length > 8) HIST.shift() };
export const estadoAudio = () => ({ ctx: !Ctor ? 'sin Web Audio' : CTX ? CTX.state : 'sin crear', sesion: navigator.audioSession ? navigator.audioSession.type : 'no soportada', hist: HIST.slice() });
/* Antes de cada clip: si iOS lo ha suspendido o interrumpido, intenta reanudarlo (espera como mucho `ms`) */
export async function aseguraAudio(ms) {
  if (!CTX || CTX.state === 'running' || CTX.state === 'closed') return;
  try { await Promise.race([CTX.resume(), new Promise(r => setTimeout(r, ms || 1200))]) } catch (e) { marca('resume falló: ' + (e && e.message || e)) }
}
export const audioListo = () => !Ctor || (!!CTX && CTX.state === 'running');
/* Si iOS lo interrumpió (llamada, bloqueo…), se reanuda en el siguiente toque */
export function reanuda() { if (CTX && CTX.state !== 'running' && CTX.state !== 'closed') CTX.resume().catch(() => { }) }

/* Descarga (sin decodificar) para tenerlo a mano, también sin conexión (el service worker lo sirve de su caché) */
export function carga(url) {
  if (!CRUDOS.has(url)) CRUDOS.set(url, fetch(url).then(r => { if (!r.ok) throw new Error('audio'); return r.arrayBuffer() }).catch(e => { CRUDOS.delete(url); throw e }));
  return CRUDOS.get(url);
}
const DECOD = new Map();     // url -> Promise<AudioBuffer> (solo los efectos cortos se guardan decodificados)
export async function decodifica(url, guardar) {
  if (!Ctor) throw new Error('sin Web Audio');
  if (!CTX || CTX.state === 'closed') { CTX = new Ctor(); marca('contexto creado fuera de un toque: ' + CTX.state); CTX.onstatechange = () => marca('estado → ' + (CTX && CTX.state)) }
  if (guardar && DECOD.has(url)) return DECOD.get(url);
  const p = carga(url).then(ab => new Promise((ok, ko) => { const c = CTX; c.decodeAudioData(ab.slice(0), ok, ko) }));
  if (guardar) DECOD.set(url, p.catch(e => { DECOD.delete(url); throw e }));
  return p;
}

/* Reproduce un AudioBuffer; devuelve { parar() }. `fin` se llama al terminar (o al pararlo no). El clip se desconecta al acabar. */
export function reproduce(buffer, fin) {
  if (!CTX || CTX.state === 'closed') throw new Error('sin contexto');
  reanuda();
  const s = CTX.createBufferSource(); s.buffer = buffer; s.connect(CTX.destination);
  const h = { parar() { try { s.onended = null; s.stop() } catch (e) { } libera() } };
  const libera = () => { ACTIVOS.delete(h); try { s.disconnect() } catch (e) { } };
  s.onended = () => { libera(); if (fin) fin() };
  ACTIVOS.add(h); s.start(0);
  return h;
}

/* Para todo lo que suene */
export function paraTodo() { for (const h of [...ACTIVOS]) h.parar() }

/* Libera el audio por completo (al salir de la partida o cerrar la página): para, cierra el contexto y limpia la sesión multimedia */
export function liberaAudio() {
  paraTodo(); DECOD.clear();
  const c = CTX; CTX = null; if (c) marca('contexto cerrado (se sale de la partida o se oculta la página)');
  if (c && c.state !== 'closed') { try { c.close().catch(() => { }) } catch (e) { } }
  limpiaMediaSession(); tipoSesion('auto');
}

/* Al ocultar la página (bloqueo, cambio de app) se para y suspende; al volver, reanuda en el siguiente toque */
window.addEventListener('pagehide', liberaAudio);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { paraTodo(); if (CTX && CTX.state === 'running') CTX.suspend().catch(() => { }); limpiaMediaSession() }
  else reanuda();
});
document.addEventListener('pointerdown', reanuda, true);
limpiaMediaSession();
