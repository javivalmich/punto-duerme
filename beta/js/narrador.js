/* Voz del narrador: speechSynthesis del navegador, en español de España, con la mejor voz que tenga el
   dispositivo. Solo habla el móvil que hace de narrador. Si está silenciado o el navegador no tiene voz,
   se espera lo que tardaría en decirlo, para que el ritmo de la partida sea el mismo. */
import { lsGet, lsSet } from './util.js';
import { TEXTOS } from './textos-narrador.js';

const SS = window.speechSynthesis || null;
export const VOZ = { mudo: !!lsGet('mudo', false), voz: null, cola: 0 };

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
const A = new Audio();
let INDICE = null;
const BLOBS = new Map();
const FRASES = [];
for (const id in TEXTOS) TEXTOS[id].forEach((t, i) => FRASES.push({ clip: id + '-' + (i + 1), t }));
FRASES.sort((a, b) => b.t.length - a.t.length);
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
/* Se descarga como blob (así el service worker lo sirve de su caché sin conexión y no hay problemas de «Range» en iOS) */
function cargaClip(c) {
  if (!BLOBS.has(c)) BLOBS.set(c, fetch('audio/voz/' + c + '.mp3').then(r => { if (!r.ok) throw new Error('clip'); return r.blob() }).then(b => URL.createObjectURL(b)).catch(e => { BLOBS.delete(c); throw e }));
  return BLOBS.get(c);
}
export function precargaVoz() { if (INDICE) INDICE.forEach(c => cargaClip(c).catch(() => { })); else setTimeout(precargaVoz, 1500) }
function reproduce(clips, vale, fin, fallo) {
  let i = 0;
  const sig = async () => {
    if (!vale()) return;
    if (i >= clips.length) return fin();
    try {
      A.src = await cargaClip(clips[i++]);
      if (!vale()) return;
      A.onended = () => setTimeout(sig, 350); A.onerror = fallo;
      await A.play();
    } catch (e) { if (vale()) fallo() }
  };
  sig();
}

/* iOS y algunos Android solo dejan hablar después de un toque: se llama desde «Empezar» o «Volver a la partida» */
export function desbloquea() {
  desbloqueaAudio();
  if (!SS) return;
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; u.lang = 'es-ES'; SS.speak(u) } catch (e) { }
}
export function desbloqueaAudio() { try { A.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='; A.play().catch(() => { }) } catch (e) { } }
export function silencia(on) {
  VOZ.mudo = !!on; lsSet('mudo', VOZ.mudo);
  if (VOZ.mudo) { try { A.pause() } catch (e) { } if (SS) try { SS.cancel() } catch (e) { } }
}
export function calla() { VOZ.cola++; try { A.pause() } catch (e) { } if (SS) try { SS.cancel() } catch (e) { } }

const dura = t => Math.max(1200, t.replace(/\|/g, '').length * 62);

/* Dice un texto («|» = pausa) y llama a fin() al terminar. Una llamada nueva corta la anterior. */
export function di(texto, fin) {
  const yo = ++VOZ.cola;
  const acaba = () => { if (yo === VOZ.cola && fin) { const f = fin; fin = null; f() } };
  const trozos = String(texto || '').split('|').map(s => s.trim()).filter(Boolean);
  if (!trozos.length) { setTimeout(acaba, 0); return }
  /* respaldo: si el navegador no avisa del final (pasa en pestañas de fondo), se sigue igualmente */
  const respaldo = setTimeout(acaba, dura(texto) * 1.8 + 3000);
  const fin2 = () => { clearTimeout(respaldo); acaba() };
  const clips = !VOZ.mudo && clipsDe(texto);
  if (clips && clips.length) {
    clearTimeout(respaldo); const r2 = setTimeout(acaba, 90000);
    try { SS && SS.cancel() } catch (e) { }
    reproduce(clips, () => yo === VOZ.cola, () => { clearTimeout(r2); acaba() }, () => { clearTimeout(r2); setTimeout(acaba, dura(texto) * 1.8 + 3000); hablaNavegador() });
    return;
  }
  hablaNavegador();
  function hablaNavegador() {
  if (VOZ.mudo || !SS || !VOZ.voz && !(SS.getVoices() || []).length) { clearTimeout(respaldo); setTimeout(acaba, dura(texto)); return }
  try { SS.cancel() } catch (e) { }
  let i = 0;
  const sig = () => {
    if (yo !== VOZ.cola) return;
    if (i >= trozos.length) return fin2();
    const u = new SpeechSynthesisUtterance(trozos[i++]);
    u.lang = 'es-ES'; if (VOZ.voz) u.voice = VOZ.voz; u.rate = .95; u.pitch = .9;
    u.onend = () => setTimeout(sig, 450);
    u.onerror = () => setTimeout(sig, 100);
    try { SS.speak(u) } catch (e) { setTimeout(sig, 100) }
  };
  sig();
  }
}
export const hayVoz = () => !!SS;
