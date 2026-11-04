/* Voz del narrador: speechSynthesis del navegador, en español de España, con la mejor voz que tenga el
   dispositivo. Solo habla el móvil que hace de narrador. Si está silenciado o el navegador no tiene voz,
   se espera lo que tardaría en decirlo, para que el ritmo de la partida sea el mismo. */
import { lsGet, lsSet } from './util.js';

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
  return p;
}
function eligeVoz() {
  if (!SS) return;
  const vs = SS.getVoices() || [];
  let mejor = null, pm = -1;
  for (const v of vs) { const p = puntua(v); if (p > pm) { pm = p; mejor = v } }
  VOZ.voz = pm >= 0 ? mejor : null;
}
if (SS) { eligeVoz(); SS.addEventListener && SS.addEventListener('voiceschanged', eligeVoz) }

/* iOS y algunos Android solo dejan hablar después de un toque: se llama desde «Empezar» o «Volver a la partida» */
export function desbloquea() {
  if (!SS) return;
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; u.lang = 'es-ES'; SS.speak(u) } catch (e) { }
}
export function silencia(on) {
  VOZ.mudo = !!on; lsSet('mudo', VOZ.mudo);
  if (VOZ.mudo && SS) try { SS.cancel() } catch (e) { }
}
export function calla() { VOZ.cola++; if (SS) try { SS.cancel() } catch (e) { } }

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
export const hayVoz = () => !!SS;
