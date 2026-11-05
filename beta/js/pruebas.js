/* Herramientas de prueba (solo en la beta): bots que mueve el servidor y panel de pruebas.
   - «Añadir bot» (sala de espera) mete jugadores falsos; el servidor los hace actuar (duerme_tick) con retraso aleatorio.
   - Este móvil solo da la hora a los bots (cada 2 s pregunta «¿les toca?»); no decide nada.
   - El panel permite ver los papeles de los bots y forzar a quién marcan o votan.
   El servidor lo desactiva con: update duerme_flags set valor = false where clave = 'pruebas';  (ver CLAUDE.md). */
import { $, esc, sheet, closeSheet, toast } from './util.js';
import { E, accion, soyAnfitrion, soyNarrador, nombreDe } from './estado.js';
import { rpc, textoError } from './red.js';
import { diagVoz, TIEMPOS } from './narrador.js';

export const EN_BETA = /\/beta\//.test(location.pathname);
export const hayPruebas = () => !!(EN_BETA && E.V && soyAnfitrion() && E.V.sala.pruebas && E.V.sala.pruebas.permitido);
const verRoles = () => !!(E.V && E.V.sala.pruebas && E.V.sala.pruebas.ver_roles);

/* etiqueta con el papel de un bot (solo llega si el servidor lo envía: anfitrión con «ver roles de los bots») */
export const ptag = j => j && j.bot && j.rol && verRoles() ? `<span class="tg ${j.rol === 'punto' ? 'rojo' : ''}">${j.rol === 'punto' ? 'Punto' : 'Ciego'}</span>` : '';
export const avisoPruebas = () => hayPruebas() && verRoles() ? '<div class="aviso pruebas">Modo pruebas: ves el papel de los bots.</div>' : '';

function panelHTML(V, enSala) {
  const p = V.sala.pruebas, js = V.jugadores.filter(j => !j.fuera);
  const opts = sel => '<option value="">Al azar</option>' + js.map(j => `<option value="${j.id}" ${sel === j.id ? 'selected' : ''}>${esc(j.nombre)}${j.vivo ? '' : ' (muerto)'}</option>`).join('');
  return `<div class="row"><div><div class="lbl">Ver roles de los bots</div><div class="sub">Solo los ves tú</div></div><button type="button" class="switch" role="switch" data-pr="ver_roles" aria-checked="${!!p.ver_roles}" aria-label="Ver roles de los bots"></button></div>
    <div class="row"><div><div class="lbl">Los bots marcan a</div><div class="sub">De noche; los Puntos, su víctima</div></div><select class="field sel" data-pr="forzar_marca" aria-label="Los bots marcan a">${opts(p.forzar_marca)}</select></div>
    <div class="row"><div><div class="lbl">Los bots votan a</div><div class="sub">De día, en la votación</div></div><select class="field sel" data-pr="forzar_voto" aria-label="Los bots votan a">${opts(p.forzar_voto).replace('</option>', '</option><option value="-"' + (p.forzar_voto === '-' ? ' selected' : '') + '>Nadie (no votan)</option>')}</select></div>
    ${enSala ? '<button class="act sec" data-pr-quitar>Quitar todos los bots</button>' : ''}`;
}
/* Estado de la voz (solo beta): versión de la app, audios del índice, contexto de audio y qué ha sonado en cada frase */
/* Tiempos reales de la noche: fin de «Cae la noche» → inicio de «Los Puntos despiertan» → elección visible; fin de «vuelven a dormir» → inicio del amanecer */
function tiemposHTML() {
  const T = TIEMPOS, ult = n => { for (let i = T.length - 1; i >= 0; i--) if (T[i].n === n) return i; return -1 };
  const entre = (a, b) => { const i = ult(a); if (i < 0) return null; const j = T.findIndex((x, k) => k > i && x.n === b); return j < 0 ? null : (T[j].t - T[i].t) / 1000 };
  const f = x => x == null ? '—' : x.toFixed(2) + ' s';
  const resumen = `<div class="sub">Pausa «Cae la noche» → «Los Puntos despiertan»: <b>${f(entre('fin noche_cae', 'inicio puntos_abre'))}</b> (objetivo 5 s)<br>
    «Los Puntos despiertan» → elección visible: <b>${f(entre('inicio puntos_abre', 'elección visible'))}</b> · fin de «Cae la noche» → elección visible: <b>${f(entre('fin noche_cae', 'elección visible'))}</b><br>
    Pausa «vuelven a dormir» → amanecer: <b>${f(entre('fin puntos_cierra', 'inicio amanece'))}</b> (objetivo 3 s)</div>`;
  const filas = T.slice(-10).map((x, k, a) => `${esc(x.h)} ${esc(x.n)}${k ? ' <i>(+' + ((x.t - a[k - 1].t) / 1000).toFixed(2) + ' s)</i>' : ''}`).join('<br>');
  return `<div class="lbl" style="margin-top:8px">Tiempos de la noche</div>${resumen}${filas ? '<div class="sub">' + filas + '</div>' : ''}`;
}
async function vozHTML() {
  const d = diagVoz(); let vers = '?', rem = '?';
  try { vers = (await caches.keys()).map(k => k.replace('punto-duerme-beta-v', 'v')).join(', ') || 'sin caché' } catch (e) { }
  try { const r = await fetch('audio/voz/indice.json', { cache: 'no-store' }); rem = (await r.json()).length } catch (e) { rem = 'error' }
  const via = { grabada: '🎙 grabada', navegador: '🗣 navegador', error: '⚠ error', silencio: '🔇 silencio' };
  return `<div class="vozdiag"><div class="lbl">Estado de la voz</div>
    <div class="sub">App ${esc(vers)} · audios en el índice: ${d.indice == null ? 'sin cargar' : d.indice} (en la red: ${rem})</div>
    <div class="sub">Este móvil es el narrador: <b>${E.V ? (soyNarrador() ? 'sí' : 'no') : '—'}</b>${E.V && E.V.sala.narrador ? ' (narrador: ' + esc(nombreDe(E.V.sala.narrador)) + ')' : ''}${E.V && soyAnfitrion() ? ' · anfitrión' : ''}</div>
    <div class="sub">AudioContext: <b>${esc(d.ctx)}</b> · sesión de audio: ${esc(d.sesion)} · ${d.mudo ? 'silenciado' : 'con sonido'}${d.bloqueada ? ' · voz bloqueada' : ''}</div>
    <div class="sub">Voz del navegador: ${esc(d.voz)}</div>
    ${d.hist.length ? `<div class="sub">${d.hist.map(esc).join('<br>')}</div>` : ''}
    ${tiemposHTML()}
    <div class="lbl" style="margin-top:8px">Últimas frases</div>
    ${d.log.length ? d.log.map(l => `<div class="sub">${esc(l.t)} ${via[l.via] || l.via}${l.motivo ? ' · <b>' + esc(l.motivo) + '</b>' : ''}: «${esc(l.txt)}»${l.extra ? '<br>&nbsp;&nbsp;' + esc(l.extra) : ''}${l.fin ? '<br>&nbsp;&nbsp;→ avanzó: <b>' + esc(l.fin) + '</b>' : ''}</div>`).join('') : '<div class="sub">Aún no ha hablado el narrador en este móvil.</div>'}</div>`;
}
function pintaVoz(el) {
  if (!el) return;
  const va = async () => { if (!el.isConnected) return clearInterval(el._iv); const h = await vozHTML(); if (el._h !== h) { el._h = h; el.innerHTML = h } };
  clearInterval(el._iv); va(); el._iv = setInterval(va, 2000);
}
const pinta = (el, html) => { if (el._h !== html) { el._h = html; el.innerHTML = html } };

/* Sala de espera: botón «Añadir bot» y panel plegable (solo anfitrión, solo beta) */
export function renderPruebasSala() {
  const ok = hayPruebas();
  $('saBot').hidden = !ok; $('saPruebasBox').hidden = !EN_BETA;
  if (EN_BETA) { pinta($('saPruebas'), ok ? panelHTML(E.V, true) : ''); if (!$('saVoz')._iv) pintaVoz($('saVoz')) }
}

/* Durante la partida: hoja con el mismo panel (menú ☰ → «Panel de pruebas») */
export function abrePanelPruebas() {
  if (!EN_BETA) return;
  sheet(`<div class="menuhead"><h3>Panel de pruebas</h3><button class="xbtn" id="prX" aria-label="Cerrar">✕</button></div><div id="prCuerpo"></div><div id="prVoz"></div>`, () => {
    $('prX').onclick = closeSheet; if (hayPruebas()) pinta($('prCuerpo'), panelHTML(E.V, false)); manejar($('prCuerpo')); pintaVoz($('prVoz'));
  });
}

const cambia = cfg => accion('pruebas', { p_cfg: cfg }).catch(err => toast(textoError(err)));
function manejar(el) {
  el.addEventListener('click', async e => {
    const sw = e.target.closest('[data-pr=ver_roles]');
    if (sw) { const on = sw.getAttribute('aria-checked') !== 'true'; sw.setAttribute('aria-checked', on); cambia({ ver_roles: on }); return }
    if (e.target.closest('[data-pr-quitar]')) {
      for (const j of E.V.jugadores.filter(x => x.bot)) { try { await accion('expulsar', { p_id: j.id }) } catch (err) { toast(textoError(err)); break } }
    }
  });
  el.addEventListener('change', e => { const s = e.target.closest('select[data-pr]'); if (s) cambia({ [s.dataset.pr]: s.value }) });
}

let EN_VUELO = false;
export function iniciaPruebas() {
  $('saBot').onclick = () => accion('bot_add').catch(err => toast(textoError(err)));
  manejar($('saPruebas'));
  /* reloj de los bots: solo el anfitrión, solo si hay bots y en las fases en las que actúan */
  setInterval(async () => {
    if (!EN_BETA || EN_VUELO || document.hidden || !E.ses || !E.V || !soyAnfitrion() || !E.V.sala.bots) return;
    if (!['reparto', 'noche', 'votacion'].includes(E.V.sala.fase)) return;
    EN_VUELO = true;
    try { await rpc('tick', { p_codigo: E.ses.codigo, p_token: E.ses.token }) } catch (e) { }
    EN_VUELO = false;
  }, 2000);
}
