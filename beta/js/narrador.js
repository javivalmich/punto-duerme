/* Voz del narrador: speechSynthesis del navegador, en español de España, con la mejor voz que tenga el
   dispositivo. Solo habla el móvil que hace de narrador. Si está silenciado o el navegador no tiene voz,
   se espera lo que tardaría en decirlo, para que el ritmo de la partida sea el mismo. */
import { lsGet, lsSet } from './util.js';
import { TEXTOS } from './textos-narrador.js';
import { desbloquea as desbloqueaWA, carga, decodifica, reproduce as suenaBuffer, audioListo, reanuda } from './audio.js';

const SS = window.speechSynthesis || null;
export const VOZ = { mudo: !!lsGet('mudo', false), voz: null, cola: 0, bloqueada: false };
/* iOS bloquea la voz si no ha arrancado dentro de un toque (y de nuevo tras bloquear el móvil o cambiar de app):
   si la voz no empieza a sonar, se avisa para que el narrador pulse «Activar la voz del narrador» */
function marcaBloqueo(b) { if (VOZ.bloqueada !== b) { VOZ.bloqueada = b; document.dispatchEvent(new Event('repinta')) } }

/* Puntuación de cada voz: solo español de España; mejor las «naturales» o mejoradas */
function puntua(v) {
  const lang = (v.lang || '').replace('_', '-').toLowerCase(), n = (v.name || '').toLowerCase();
  if (lang !== 'es-es' && !(lang === 'es' && !/m[eé]xico|united states|latin|us\b/.test(n))) return -1;
  let p = 10;
  if (/natural|neural|online/.test(n)) p += 50;
  if (/premium|enhanced|mejorada|calidad superior/.test(n)) p += 40;
  if (/google/.test(n)) p += 25;
  if (/microsoft/.test(n)) p += 15;
  if (/m[oó]nica|jorge|marisol|paulina|elvira|alvaro|álvaro|helena|laura|pablo/.test(n)) p += 5;
  if (/compact|eloquence|espeak|novelty|bells|organ|whisper/.test(n)) p -= 30;
  if (v.localService) p += 2;
  if (!navigator.onLine && !v.localService) return -1; /* sin conexión solo valen las voces instaladas en el móvil */
  return p;
}
function eligeVoz() {
  if (!SS) return;
  const vs = SS.getVoices() || [];
  let mejor = null, pm = -1;
  for (const v of vs) { const p = puntua(v); if (p > pm) { pm = p; mejor = v } }
  VOZ.voz = pm >= 0 ? mejor : null;
}
window.addEventListener('online', () => eligeVoz()); window.addEventListener('offline', () => eligeVoz());
if (SS) { eligeVoz(); SS.addEventListener && SS.addEventListener('voiceschanged', eligeVoz) }

/* ---------- Voz buena: audios pregrabados (audio/voz/<id>-<n>.mp3, índice en indice.json) ----------
   Se localizan por el texto de la frase (las frases ya no llevan nombres ni tiempos). Si falta cualquier audio, habla la voz del navegador. */
let INDICE = null;
let CLIP = null; /* clip de voz sonando (Web Audio) */
const FRASES = [];
for (const id in TEXTOS) TEXTOS[id].forEach((t, i) => FRASES.push({ clip: id + '-' + (i + 1), t }));
FRASES.sort((a, b) => b.t.length - a.t.length);
let DURS = {};
fetch('audio/voz/duraciones.json').then(r => r.ok ? r.json() : {}).then(d => { DURS = d }).catch(() => { });
fetch('audio/voz/indice.json').then(r => r.ok ? r.json() : []).then(l => { INDICE = new Set(l) }).catch(() => { });
function clipsDe(texto) {
  if (!INDICE) return null;
  let r = String(texto || '').trim(); const out = [];
  while (r) {
    const f = FRASES.find(x => r.startsWith(x.t) && INDICE.has(x.clip)); if (!f) return null;
    out.push(f.clip); r = r.slice(f.t.length).replace(/^\s*\|\s*/, '');
  }
  return out;
}
const urlClip = c => 'audio/voz/' + c + '.mp3';
export function precargaVoz() { if (INDICE) INDICE.forEach(c => carga(urlClip(c)).catch(() => { })); else setTimeout(precargaVoz, 1500) }
const paraClip = () => { if (CLIP) { CLIP.parar(); CLIP = null } };
/* Los clips suenan con Web Audio (no con <audio>, que en iOS crea el reproductor de la pantalla de bloqueo) */
function reproduce(clips, vale, fin, fallo) {
  let i = 0;
  const sig = async () => {
    if (!vale()) return;
    if (i >= clips.length) return fin();
    try {
      const buf = await decodifica(urlClip(clips[i++]), false);
      if (!vale()) return;
      CLIP = suenaBuffer(buf, () => { CLIP = null; setTimeout(sig, 350) });
      setTimeout(() => { if (vale() && !audioListo() && !document.hidden) marcaBloqueo(true) }, 1500); /* contexto de audio interrumpido por iOS */
    } catch (e) { if (vale()) fallo() }
  };
  sig();
}

/* iOS y algunos Android solo dejan hablar después de un toque: se llama desde «Empezar» o «Volver a la partida» */
export function desbloquea() {
  desbloqueaWA();
  if (!SS) return;
  /* frase vacía a volumen 0 dentro del toque: desbloquea la voz del navegador para las frases que lleguen después por la red */
  try { const u = new SpeechSynthesisUtterance('.'); u.volume = 0; u.lang = 'es-ES'; SS.speak(u) } catch (e) { }
  VOZ.bloqueada = false;
}
/* Botón «Activar la voz del narrador» (hay que llamarlo desde un toque) */
export function activaVoz() { desbloquea(); document.dispatchEvent(new Event('voz-activada')); document.dispatchEvent(new Event('repinta')) }
const cancelaSiHace = () => { try { if (SS && (SS.speaking || SS.pending)) SS.cancel() } catch (e) { } };
export function silencia(on) {
  VOZ.mudo = !!on; lsSet('mudo', VOZ.mudo);
  if (VOZ.mudo) { paraClip(); if (SS) try { SS.cancel() } catch (e) { } }
}
export function calla() { VOZ.cola++; paraClip(); cancelaSiHace() }

const dura = t => Math.max(1200, t.replace(/\|/g, '').length * 62);

/* Dice un texto («|» = pausa) y llama a fin() al terminar. Una llamada nueva corta la anterior. */
export function di(texto, fin) {
  const yo = ++VOZ.cola; paraClip();
  const acaba = () => { if (yo === VOZ.cola && fin) { const f = fin; fin = null; f() } };
  const trozos = String(texto || '').split('|').map(s => s.trim()).filter(Boolean);
  if (!trozos.length) { setTimeout(acaba, 0); return }
  /* respaldo: si el navegador no avisa del final (pasa en pestañas de fondo), se sigue igualmente */
  const respaldo = setTimeout(acaba, dura(texto) * 1.8 + 3000);
  const fin2 = () => { clearTimeout(respaldo); acaba() };
  const clips = !VOZ.mudo && clipsDe(texto);
  if (clips && clips.length) {
    clearTimeout(respaldo); const r2 = setTimeout(acaba, 90000);
    cancelaSiHace();
    reproduce(clips, () => yo === VOZ.cola, () => { clearTimeout(r2); acaba() }, () => { clearTimeout(r2); setTimeout(acaba, dura(texto) * 1.8 + 3000); hablaNavegador() });
    return;
  }
  hablaNavegador();
  function hablaNavegador() {
  if (VOZ.mudo || !SS || !VOZ.voz && !(SS.getVoices() || []).length) { clearTimeout(respaldo); setTimeout(acaba, dura(texto)); return }
  const hayQueCortar = !!(SS.speaking || SS.pending); cancelaSiHace();
  let i = 0;
  const sig = () => {
    if (yo !== VOZ.cola) return;
    if (i >= trozos.length) return fin2();
    const u = new SpeechSynthesisUtterance(trozos[i++]);
    u.lang = 'es-ES'; if (VOZ.voz) u.voice = VOZ.voz; u.rate = .95; u.pitch = .9;
    const vig = setTimeout(() => { if (!document.hidden && yo === VOZ.cola) marcaBloqueo(true) }, 2500);
    u.onstart = () => { clearTimeout(vig); marcaBloqueo(false) };
    u.onend = () => { clearTimeout(vig); setTimeout(sig, 450) };
    u.onerror = () => { clearTimeout(vig); setTimeout(sig, 100) };
    try { SS.speak(u) } catch (e) { clearTimeout(vig); setTimeout(sig, 100) }
  };
  /* en iOS, hablar justo después de cancel() deja la voz muda: se espera un instante */
  hayQueCortar ? setTimeout(sig, 150) : sig();
  }
}
/* Cuánto durará un texto al decirlo (s): suma de sus audios (+ pausa entre ellos) o, sin audios, una estimación */
export function duracionTexto(texto) {
  const clips = clipsDe(texto);
  if (clips && clips.every(c => DURS[c])) return clips.reduce((t, c) => t + DURS[c] + 0.35, 0);
  return dura(String(texto || '')) * 1.1 / 1000;
}
/* ¿Hay audios grabados del narrador? (si no, habla la voz del navegador, que NO suena con el modo silencio del iPhone) */
export const vozGrabada = () => !!(INDICE && INDICE.size);
export const hayVoz = () => !!SS;
