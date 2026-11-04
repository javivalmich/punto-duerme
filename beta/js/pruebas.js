/* Herramientas de prueba (solo en la beta): bots que mueve el servidor y panel de pruebas.
   - «Añadir bot» (sala de espera) mete jugadores falsos; el servidor los hace actuar (duerme_tick) con retraso aleatorio.
   - Este móvil solo da la hora a los bots (cada 2 s pregunta «¿les toca?»); no decide nada.
   - El panel permite ver los papeles de los bots y forzar a quién marcan o votan.
   El servidor lo desactiva con: update duerme_flags set valor = false where clave = 'pruebas';  (ver CLAUDE.md). */
import { $, esc, sheet, closeSheet, toast } from './util.js';
import { E, accion, soyAnfitrion } from './estado.js';
import { rpc, textoError } from './red.js';

export const EN_BETA = /\/beta\//.test(location.pathname);
export const hayPruebas = () => !!(EN_BETA && E.V && soyAnfitrion() && E.V.sala.pruebas && E.V.sala.pruebas.permitido);
const verRoles = () => !!(E.V && E.V.sala.pruebas && E.V.sala.pruebas.ver_roles);

/* etiqueta con el papel de un bot (solo llega si el servidor lo envía: anfitrión con «ver roles de los bots») */
export const ptag = j => j && j.bot && j.rol && verRoles() ? `<span class="tg ${j.rol === 'punto' ? 'rojo' : ''}">${j.rol === 'punto' ? 'Punto' : 'Ciego'}</span>` : '';
export const avisoPruebas = () => hayPruebas() && verRoles() ? '<div class="aviso">Modo pruebas: ves el papel de los bots.</div>' : '';

function panelHTML(V, enSala) {
  const p = V.sala.pruebas, js = V.jugadores.filter(j => !j.fuera);
  const opts = sel => '<option value="">Al azar</option>' + js.map(j => `<option value="${j.id}" ${sel === j.id ? 'selected' : ''}>${esc(j.nombre)}${j.vivo ? '' : ' (muerto)'}</option>`).join('');
  return `<div class="row"><div><div class="lbl">Ver roles de los bots</div><div class="sub">Solo los ves tú</div></div><button type="button" class="switch" role="switch" data-pr="ver_roles" aria-checked="${!!p.ver_roles}" aria-label="Ver roles de los bots"></button></div>
    <div class="row"><div><div class="lbl">Los bots marcan a</div><div class="sub">De noche; los Puntos, su víctima</div></div><select class="field sel" data-pr="forzar_marca" aria-label="Los bots marcan a">${opts(p.forzar_marca)}</select></div>
    <div class="row"><div><div class="lbl">Los bots votan a</div><div class="sub">De día, en la votación</div></div><select class="field sel" data-pr="forzar_voto" aria-label="Los bots votan a">${opts(p.forzar_voto)}</select></div>
    ${enSala ? '<button class="act sec" data-pr-quitar>Quitar todos los bots</button>' : ''}`;
}
const pinta = (el, html) => { if (el._h !== html) { el._h = html; el.innerHTML = html } };

/* Sala de espera: botón «Añadir bot» y panel plegable (solo anfitrión, solo beta) */
export function renderPruebasSala() {
  const ok = hayPruebas();
  $('saBot').hidden = !ok; $('saPruebasBox').hidden = !ok;
  if (ok) pinta($('saPruebas'), panelHTML(E.V, true));
}

/* Durante la partida: hoja con el mismo panel (menú ☰ → «Panel de pruebas») */
export function abrePanelPruebas() {
  if (!hayPruebas()) return;
  sheet(`<div class="menuhead"><h3>Panel de pruebas</h3><button class="xbtn" id="prX" aria-label="Cerrar">✕</button></div><div id="prCuerpo"></div>`, () => {
    $('prX').onclick = closeSheet; pinta($('prCuerpo'), panelHTML(E.V, false)); manejar($('prCuerpo'));
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
