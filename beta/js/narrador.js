/* Voz del narrador: speechSynthesis del navegador, en español de España, con la mejor voz que tenga el
   dispositivo. Solo habla el móvil que hace de narrador. Si está silenciado o el navegador no tiene voz,
   se espera lo que tardaría en decirlo, para que el ritmo de la partida sea el mismo. */
import { lsGet, lsSet } from './util.js';
import { TEXTOS } from './textos-narrador.js';
import { desbloquea as desbloqueaWA, carga, decodifica, reproduce as suenaBuffer, audioListo, reanuda, aseguraAudio, estadoAudio, fijaOcupado, relojAudio } from './audio.js';

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
/* Para el panel de pruebas: qué ha sonado en cada frase (grabada, navegador o error) */
export const DIAG = { log: [] };
/* Tiempos reales de la noche (panel de pruebas): cada marca lleva el instante; el panel muestra el salto desde la anterior */
export const TIEMPOS = [];
export function marcaT(nombre) { const t = performance.now(), u = TIEMPOS[TIEMPOS.length - 1]; if (u && u.n === nombre) return; /* una marca seguida de sí misma (p. ej. repintados) no cuenta */ TIEMPOS.push({ n: nombre, t, h: new Date().toTimeString().slice(0, 8) }); if (TIEMPOS.length > 30) TIEMPOS.shift() }
/* Estado PROPIO de la voz del navegador: en iOS `speechSynthesis.speaking` puede quedarse en true para siempre tras un cancel(),
   y si se usara para decidir si «hay algo sonando» se bloquearían el desbloqueo, la reanudación del audio y el botón «Activar la voz». */
let HABLA_HASTA = 0;
const hablando = () => Date.now() < HABLA_HASTA;
const nota = (texto, via, extra) => { const e = { t: new Date().toTimeString().slice(0, 8), via, txt: String(texto || '').replace(/\s*\|\s*/g, ' ').slice(0, 42), extra: extra || '', fin: '' }; DIAG.log.unshift(e); DIAG.log.length = Math.min(DIAG.log.length, 40); return e };
export const diagVoz = () => ({ indice: INDICE ? INDICE.size : null, ...estadoAudio(), mudo: VOZ.mudo, bloqueada: VOZ.bloqueada, voz: VOZ.voz ? VOZ.voz.name : 'ninguna', log: DIAG.log });
function faltaDe(texto) {
  if (!INDICE) return 'índice sin cargar';
  let r = String(texto || '').trim();
  while (r) { const f = FRASES.find(x => r.startsWith(x.t) && INDICE.has(x.clip)); if (!f) return 'sin audio para «' + r.slice(0, 28) + '…»'; r = r.slice(f.t.length).replace(/^\s*\|\s*/, '') }
  return '';
}
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
function reproduce(clips, vale, fin, fallo, ent, empieza) {
  let i = 0;
  const sig = async () => {
    if (!vale()) return;
    if (i >= clips.length) return fin();
    try {
      const buf = await decodifica(urlClip(clips[i++]), false);
      if (!vale()) return;
      await aseguraAudio(1200);
      if (!vale()) return;
      /* contexto suspendido/interrumpido y sin forma de reanudarlo (iOS lo exige con un toque): antes se «reproducía» en silencio y
         la partida seguía muda; ahora se avisa y habla la voz del navegador */
      if (!audioListo()) { marcaBloqueo(true); ent.extra += ' · ⚠ contexto ' + estadoAudio().ctx + ': no se puede reanudar, voz del navegador'; return fallo() }
      const t0a = relojAudio(), mio = CLIP = suenaBuffer(buf, () => { if (CLIP === mio) CLIP = null; i >= clips.length ? sig() : setTimeout(sig, 350) /* 0,35 s entre clips, pero ninguno tras el último */ });
      empieza();
      /* vigilante: si a los 0,7 s el reloj del contexto no ha avanzado, no está sonando nada */
      setTimeout(() => { if (vale() && CLIP === mio && relojAudio() - t0a < 0.2 && !document.hidden) { marcaBloqueo(true); ent.extra += ' · ⚠ el reloj del audio está parado (no se oye); voz del navegador'; paraClip(); fallo() } }, 700);
      if (i === 1) ent.extra += ' · contexto ' + estadoAudio().ctx;
      setTimeout(() => { if (vale() && !audioListo() && !document.hidden) { marcaBloqueo(true); ent.extra += ' · ⚠ contexto ' + estadoAudio().ctx + ' tras 1,5 s: no se oye' } }, 1500); /* contexto de audio interrumpido por iOS */
    } catch (e) { ent.extra += ' · ⚠ ' + (clips[i - 1] || '') + ': ' + (e && (e.name + ' ' + e.message) || e); if (vale()) fallo() }
  };
  sig();
}

/* iOS y algunos Android solo dejan hablar después de un toque: se llama desde «Empezar» o «Volver a la partida» */
/* ¿Está sonando ahora una frase (grabada o del navegador)? */
export const sonando = () => !!CLIP || hablando();
fijaOcupado(() => sonando());
export function desbloquea() {
  /* El desbloqueo completo solo se hace en los toques de «Crear», «Unirme», «Empezar», «Volver a la partida», «Ser yo el narrador» y
     «Activar la voz»; si justo suena algo, no se toca nada (ni voz vacía, ni sesión, ni contexto): ya estaba desbloqueado. */
  if (sonando()) return;
  /* frase vacía a volumen 0 dentro del toque: desbloquea la voz del navegador para las frases que lleguen después por la red.
     Primero la voz y después Web Audio: así el arranque de la voz no deja el contexto de audio «interrumpido» en iOS */
  if (SS) { try { const u = new SpeechSynthesisUtterance('.'); u.volume = 0; u.lang = 'es-ES'; SS.speak(u) } catch (e) { } VOZ.bloqueada = false }
  desbloqueaWA();
}
/* Botón «Activar la voz del narrador» (hay que llamarlo desde un toque) */
export function activaVoz() { desbloquea(); document.dispatchEvent(new Event('voz-activada')); document.dispatchEvent(new Event('repinta')) }
const cancelaSiHace = () => { HABLA_HASTA = 0; try { if (SS && (SS.speaking || SS.pending)) SS.cancel() } catch (e) { } };
export function silencia(on) {
  VOZ.mudo = !!on; lsSet('mudo', VOZ.mudo);
  if (VOZ.mudo) { paraClip(); if (SS) try { SS.cancel() } catch (e) { } }
}
export function calla() { VOZ.cola++; paraClip(); cancelaSiHace() }

/* Pausas del narrador (ms) entre una frase y la siguiente, iguales en multimóvil y en un solo móvil. Ajustables aquí.
   Se cuentan desde que acaba el audio (que ya lleva ~0,1-0,2 s de silencio al final); en multimóvil se suma la ida y vuelta al servidor (~0,4 s). */
export const PAUSA_CIERRA_OJOS = 5000;   // tras «Cae la noche… todos cierran los ojos», antes de «Los Puntos despiertan»
export const PAUSA_AMANECER = 3000;      // tras «Los Puntos vuelven a dormir», antes del amanecer
export const PAUSA_ENTRE_TURNOS = 1200;  // entre el «vuelven a dormir» de un personaje y el «despierta» del siguiente (fase 2)
export const PAUSA_FRASES = 400;         // resto de frases narradas encadenadas (amanecer → debate, resultado → noche…)
export const PAUSA_ELIMINADO = 7000;     // tras «…y señala a…»: el nombre del eliminado se ve este tiempo antes de seguir
const dura = t => Math.max(1200, t.replace(/\|/g, '').length * 62);

/* Dice un texto («|» = pausa) y llama a fin() al terminar. Una llamada nueva corta la anterior. */
export function di(texto, fin, opts) {
  const yo = ++VOZ.cola; paraClip();
  const etq = (opts && opts.etq) || '', alEmpezar = opts && opts.empieza;
  const t0 = Date.now(); let ent = null, tope = null, ya = false;
  /* el sonido ha empezado de verdad (clip en marcha, voz del navegador hablando o, si no hay voz, ya) */
  const empieza = () => { if (ya || yo !== VOZ.cola) return; ya = true; if (etq) marcaT('inicio ' + etq); if (alEmpezar) alEmpezar() };
  /* Se sigue en cuanto acaba el audio o, como mucho, cuando se cumple la duración conocida + un margen corto: en iOS el aviso de fin
     del audio puede no llegar nunca, así que el avance no depende solo de él. `porque` queda anotado en el panel de pruebas. */
  const acaba = porque => {
    if (yo !== VOZ.cola || !fin) return;
    clearTimeout(tope); const f = fin; fin = null; if (etq) marcaT('fin ' + etq);
    if (ent) ent.fin = (porque === 'audio' ? 'fin del audio' : porque === 'limite' ? 'por el límite de tiempo' : porque) + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)';
    f();
  };
  const fin2 = () => acaba('audio');
  const ponTope = ms => { clearTimeout(tope); tope = setTimeout(() => acaba('limite'), ms) };
  const trozos = String(texto || '').split('|').map(s => s.trim()).filter(Boolean);
  if (!trozos.length) { empieza(); setTimeout(() => acaba('sin texto'), 0); return }
  const clips = !VOZ.mudo && clipsDe(texto);
  if (clips && clips.length) {
    const limite = limiteClips(clips);
    ponTope(limite);
    cancelaSiHace();
    ent = nota(texto, 'grabada', clips.join(' + ') + ' · límite ' + (limite / 1000).toFixed(1) + ' s');
    reproduce(clips, () => yo === VOZ.cola, () => acaba('audio'), () => { ent.via = 'navegador'; ent.extra += ' · el audio falló, habla el navegador'; ponTope(Math.max(1500, limite - (Date.now() - t0))); hablaNavegador() }, ent, empieza);
    return;
  }
  /* respaldo: si el navegador no avisa del final (pasa en pestañas de fondo), se sigue igualmente */
  ponTope(dura(texto) * 1.8 + 3000);
  ent = nota(texto, VOZ.mudo ? 'silencio' : 'navegador', VOZ.mudo ? 'narrador silenciado' : faltaDe(texto));
  hablaNavegador();
  function hablaNavegador() {
  if (VOZ.mudo || !SS || !VOZ.voz && !(SS.getVoices() || []).length) { empieza(); ponTope(dura(texto)); return }
  const hayQueCortar = !!(SS.speaking || SS.pending); cancelaSiHace();
  let i = 0;
  const sig = () => {
    if (yo !== VOZ.cola) return;
    if (i >= trozos.length) return fin2();
    const u = new SpeechSynthesisUtterance(trozos[i++]);
    u.lang = 'es-ES'; if (VOZ.voz) u.voice = VOZ.voz; u.rate = .95; u.pitch = .9;
    let empezo = false, reintento = false;
    HABLA_HASTA = Date.now() + dura(u.text) * 1.8 + 3000;
    const vig = setTimeout(() => {
      if (document.hidden || yo !== VOZ.cola || empezo) return;
      marcaBloqueo(true);
      /* la cola de la voz puede quedarse atascada (iOS): se vacía y se repite la frase una vez */
      if (!reintento) { reintento = true; ent.extra += ' · la voz no arrancó en 2,5 s: se reintenta'; try { SS.cancel() } catch (e) { } setTimeout(() => { if (yo === VOZ.cola && !empezo) { try { SS.speak(u) } catch (e) { } } }, 200) }
    }, 2500);
    u.onstart = () => { empezo = true; clearTimeout(vig); marcaBloqueo(false); empieza() };
    u.onend = () => { clearTimeout(vig); HABLA_HASTA = 0; i >= trozos.length ? sig() : setTimeout(sig, 450) /* pausa entre trozos, no tras el último */ };
    u.onerror = () => { clearTimeout(vig); HABLA_HASTA = 0; setTimeout(sig, 100) };
    try { SS.speak(u) } catch (e) { clearTimeout(vig); HABLA_HASTA = 0; setTimeout(sig, 100) }
  };
  /* en iOS, hablar justo después de cancel() deja la voz muda: se espera un instante */
  hayQueCortar ? setTimeout(sig, 150) : sig();
  }
}
/* Tiempo máximo que se espera a que acabe un audio: su duración conocida (+0,35 s de pausa entre clips) + 1,5 s de margen */
const limiteClips = clips => (clips.reduce((t, c) => t + (DURS[c] || 8) + 0.35, 0) + 1.5) * 1000;
/* Cuánto durará un texto al decirlo (s): suma de sus audios (+ pausa entre ellos) o, sin audios, una estimación */
export function duracionTexto(texto) {
  const clips = clipsDe(texto);
  if (clips && clips.every(c => DURS[c])) return clips.reduce((t, c) => t + DURS[c] + 0.35, 0);
  return dura(String(texto || '')) * 1.1 / 1000;
}
/* ¿Hay audios grabados del narrador? (si no, habla la voz del navegador, que NO suena con el modo silencio del iPhone) */
export const vozGrabada = () => !!(INDICE && INDICE.size);
export const hayVoz = () => !!SS;
