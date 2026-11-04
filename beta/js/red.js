/* Red: Supabase (el mismo proyecto que Punto Falso y Punto Ciego).
   - Las llamadas al juego son funciones del servidor (duerme_*): ver supabase/migrations.
   - El canal en tiempo real `duerme-<CÓDIGO>` solo trae avisos sin secretos ({v: versión}) y la presencia
     (quién está conectado). Al recibir un aviso, el juego pide su vista con rpc('vista'). */
import { EN_LOCAL, QS } from './util.js';

export const SUPA = {
  url: 'https://qsmcdfyyxvqmesnbwsod.supabase.co',
  key: 'sb_publishable_gS_zmhigp_Qt-h8jTyQBCg_r9WwTVU9' /* clave publicable: es pública por diseño; los datos los protegen las funciones */
};
const SB_LIB = (EN_LOCAL && QS.get('sblib')) || 'vendor/supabase-js/supabase.js';
let SB = null, sbP = null;
export function loadSB() {
  if (SB) return Promise.resolve(SB);
  if (sbP) return sbP;
  sbP = new Promise((ok, ko) => {
    const t = setTimeout(() => { sbP = null; ko(new Error('timeout')) }, 12000);
    const e = document.createElement('script'); e.src = SB_LIB;
    e.onload = () => {
      clearTimeout(t); try {
        /* Sin storageKey propia: misma sesión que Punto Falso y Punto Ciego en el mismo origen */
        SB = window.supabase.createClient(SUPA.url, SUPA.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }); ok(SB)
      } catch (x) { sbP = null; ko(x) }
    };
    e.onerror = () => { clearTimeout(t); sbP = null; ko(new Error('no carga la librería')) };
    document.head.appendChild(e);
  });
  return sbP;
}

/* Llama a public.duerme_<fn>. Los errores del juego llegan como mensaje corto ('no_estas', 'empezada'…) */
export async function rpc(fn, args) {
  const sb = await loadSB();
  const { data, error } = await sb.rpc('duerme_' + fn, args || {});
  if (error) { const e = new Error(error.message || 'error'); e.code = error.code; throw e }
  return data;
}

export const MENSAJES = {
  no_existe: 'No hay ninguna partida con ese código.',
  empezada: 'Esa partida ya ha empezado.',
  llena: 'La sala está llena (20 jugadores).',
  pocos: 'Hacen falta al menos 4 jugadores.',
  solo_anfitrion: 'Solo el anfitrión puede hacer eso.',
  no_estas: 'Ya no estás en esa partida.',
  sin_pruebas: 'Las pruebas con bots están desactivadas.'
};
export const textoError = e => MENSAJES[e && e.message] || (/fetch|network|timeout/i.test(e && e.message || '') ? 'No hay conexión. Prueba otra vez.' : 'Algo ha fallado. Prueba otra vez.');

/* ---------- Canal en tiempo real ---------- */
const NET = { ch: null, codigo: null, id: null, onPing: null, onPres: null, intento: 0, tm: 0 };
export function conecta(codigo, id, onPing, onPres) {
  if (NET.ch && NET.codigo === codigo && NET.id === id) return;
  desconecta();
  Object.assign(NET, { codigo, id, onPing, onPres, intento: 0 });
  abre();
}
async function abre() {
  const { codigo, id } = NET; if (!codigo) return;
  let sb; try { sb = await loadSB() } catch (e) { return reintenta() }
  if (NET.codigo !== codigo || NET.id !== id) return;
  /* un canal viejo con el mismo nombre (de una conexión caída) haría fallar .on(): se quita antes */
  sb.getChannels().filter(c => c.topic === 'realtime:duerme-' + codigo).forEach(c => sb.removeChannel(c));
  const ch = sb.channel('duerme-' + codigo, { config: { broadcast: { self: false, ack: false }, presence: { key: id } } });
  NET.ch = ch;
  ch.on('broadcast', { event: 'v' }, m => NET.onPing && NET.onPing(m.payload && m.payload.v));
  ch.on('presence', { event: 'sync' }, () => { let st = {}; try { st = ch.presenceState() } catch (e) { } NET.onPres && NET.onPres(new Set(Object.keys(st))) });
  ch.subscribe(st => {
    if (NET.ch !== ch) return;
    if (st === 'SUBSCRIBED') { NET.intento = 0; ch.track({ t: Date.now() }).catch(() => { }); NET.onPing && NET.onPing(null) }
    else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') reintenta();
  });
}
function reintenta() {
  clearTimeout(NET.tm);
  if (!NET.codigo) return;
  const ch = NET.ch; NET.ch = null;
  if (ch && SB) try { SB.removeChannel(ch) } catch (e) { }
  NET.tm = setTimeout(abre, Math.min(10000, 1500 * ++NET.intento));
}
export function desconecta() {
  clearTimeout(NET.tm);
  const ch = NET.ch; Object.assign(NET, { ch: null, codigo: null, id: null, onPing: null, onPres: null });
  if (ch && SB) { try { ch.untrack() } catch (e) { } setTimeout(() => { try { SB.removeChannel(ch) } catch (e) { } }, 50) }
}
/* Al volver a la app (el móvil bloqueado corta el socket): si el canal no está unido, se rehace */
export function revisaCanal() {
  if (!NET.codigo) return;
  if (!NET.ch || NET.ch.state !== 'joined') { NET.intento = 0; reintenta() }
}
export const canalUnido = () => !!(NET.ch && NET.ch.state === 'joined');
