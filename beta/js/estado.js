/* Estado de este móvil y sincronización con el servidor.
   - E.ses: la partida en la que estoy ({codigo, token, id}), guardada en el navegador con la hora
     de la última vez que se abrió el juego. Caduca a las 5 h sin abrirlo.
   - E.V: mi vista de la partida, tal como la devuelve duerme_vista (solo lo público y lo mío).
   Cada aviso del canal ({v}) con una versión más nueva hace pedir la vista otra vez. */
import { rpc, conecta, desconecta } from './red.js';
import { lsGet, lsSet, lsDel } from './util.js';

export const E = { ses: null, V: null, offset: 0, pres: new Set(), presT: 0, render: null, alSalir: null };
export const CINCO_H = 5 * 3600e3;

export const ahora = () => Date.now() + E.offset;
export const yo = () => E.V ? E.V.yo : null;
export const jug = id => E.V ? E.V.jugadores.find(j => j.id === id) : null;
export const nombreDe = id => { const j = jug(id); return j ? j.nombre : '' };
export const soyAnfitrion = () => !!(E.V && E.V.sala.anfitrion === E.V.yo.id);
export const soyNarrador = () => !!(E.V && E.V.sala.narrador === E.V.yo.id);
export const conectado = id => E.pres.has(id) || (E.V && (id === E.V.yo.id || E.V.jugadores.some(j => j.id === id && j.bot)));

export function sesionGuardada() {
  const s = lsGet('partida', null);
  if (!s || !s.codigo || !s.token || !s.id) return null;
  if (Date.now() - (s.t || 0) > CINCO_H) {
    lsDel('partida');
    rpc('salir', { p_codigo: s.codigo, p_token: s.token }).catch(() => { }); /* 5 h sin abrir el juego: se sale */
    return null;
  }
  return s;
}
export function guardaSesion() { if (E.ses) lsSet('partida', { ...E.ses, t: Date.now() }) }

export function entra(ses) {
  E.ses = { codigo: ses.codigo, token: ses.token, id: ses.id }; E.V = null; E.pres = new Set();
  guardaSesion();
  conecta(E.ses.codigo, E.ses.id, onPing, onPres);
  return actualiza();
}
export function olvida() {
  desconecta(); E.ses = null; E.V = null; E.pres = new Set(); lsDel('partida');
}
function onPing(v) { if (v == null || !E.V || v > E.V.sala.version) actualiza() }
function onPres(set) { E.pres = set; E.presT = Date.now(); E.render && E.render() }

let pidiendo = null, otraVez = false;
export async function actualiza() {
  if (!E.ses) return;
  if (pidiendo) { otraVez = true; return pidiendo }
  const ses = E.ses;
  pidiendo = (async () => {
    try {
      const t0 = Date.now(); const v = await rpc('vista', { p_codigo: ses.codigo, p_token: ses.token }); const t1 = Date.now();
      if (E.ses !== ses) return;
      E.offset = v.ahora - (t0 + t1) / 2;
      if (!E.V || v.sala.version >= E.V.sala.version) { E.V = v; guardaSesion(); E.render && E.render() }
    } catch (e) {
      if (E.ses === ses && /no_estas|no_existe/.test(e.message || '')) { olvida(); E.alSalir && E.alSalir('Ya no estás en esa partida.') }
    }
  })();
  try { await pidiendo } finally { pidiendo = null; if (otraVez) { otraVez = false; actualiza() } }
}

/* Acción del jugador: llama al servidor y se pone al día enseguida (sin esperar al aviso del canal) */
export async function accion(fn, args) {
  if (!E.ses) return;
  await rpc(fn, { p_codigo: E.ses.codigo, p_token: E.ses.token, ...(args || {}) });
  actualiza();
}
