/* Portada, crear partida, unirse y sala de espera. */
import { $, esc, lsGet, lsSet, cleanName, show, toast, sheet, closeSheet, plural } from './util.js';
import { rpc, textoError } from './red.js';
import { E, entra, olvida, accion, sesionGuardada, soyAnfitrion, conectado } from './estado.js';
import { avImg, miLook, miNombre } from './cuenta.js';
import { sugerirPuntos, puntosPara, maxPuntos } from './roles.js';
import { desbloquea } from './narrador.js';
import { precarga } from './sonido.js';
import { salirSheet } from './partida.js';

/* ---------- Ajustes de la partida (al crearla y en la sala de espera) ---------- */
const DEF = { puntos: null, t_noche: 30, t_debate: 180, t_voto: 60, revelar: true, anf_juega: true };
const PASOS = { t_noche: [10, 180, 5], t_debate: [30, 900, 30], t_voto: [15, 300, 15] };
export const fmtSeg = s => s < 60 ? s + ' s' : Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + ' min';

function ajustesHTML(c, editable, nJug) {
  const fila = (k, t, sub) => `<div class="row"><div><div class="lbl">${t}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${editable
    ? `<div class="step"><button type="button" data-paso="${k}" data-d="-1" aria-label="Menos" ${c[k] <= PASOS[k][0] ? 'disabled' : ''}>−</button><output>${fmtSeg(c[k])}</output><button type="button" data-paso="${k}" data-d="1" aria-label="Más" ${c[k] >= PASOS[k][1] ? 'disabled' : ''}>+</button></div>`
    : `<b class="val">${fmtSeg(c[k])}</b>`}</div>`;
  const sw = (k, t, sub) => `<div class="row"><div><div class="lbl">${t}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${editable
    ? `<button type="button" class="switch" role="switch" data-sw="${k}" aria-checked="${!!c[k]}" aria-label="${t}"></button>` : `<b class="val">${c[k] ? 'Sí' : 'No'}</b>`}</div>`;
  let h = '';
  if (nJug != null) {
    const k = puntosPara(nJug, c.puntos), auto = c.puntos == null;
    h += `<div class="row"><div><div class="lbl">Puntos</div><div class="sub">${auto ? 'Sugerido para ' + nJug + ' ' + plural(nJug, 'jugador', 'jugadores') : 'Elegido por el anfitrión'}</div></div>${editable
      ? `<div class="step"><button type="button" data-pts="-1" aria-label="Menos Puntos" ${k <= 1 ? 'disabled' : ''}>−</button><output>${k}</output><button type="button" data-pts="1" aria-label="Más Puntos" ${k >= maxPuntos(nJug) ? 'disabled' : ''}>+</button></div>`
      : `<b class="val">${k}</b>`}</div>`;
  }
  h += sw('anf_juega', 'El narrador también juega', 'Si no, su móvil solo pone la voz y se deja en el centro');
  h += fila('t_noche', 'Noche', 'Tiempo para elegir');
  h += fila('t_debate', 'Debate', 'Tiempo para hablar de día');
  h += fila('t_voto', 'Votación', 'Tiempo para votar');
  h += sw('revelar', 'Revelar el papel', 'De los muertos y los eliminados');
  return h;
}
/* Aplica un toque de los controles de ajustes sobre la config c; devuelve el cambio o null */
function cambioAjuste(e, c, nJug) {
  const p = e.target.closest('[data-paso]'), s = e.target.closest('[data-sw]'), q = e.target.closest('[data-pts]');
  if (p) { const k = p.dataset.paso, [mn, mx, st] = PASOS[k]; return { [k]: Math.max(mn, Math.min(mx, c[k] + st * +p.dataset.d)) } }
  if (s) { const k = s.dataset.sw; return { [k]: !c[k] } }
  if (q) {
    const actual = puntosPara(nJug, c.puntos), nuevo = Math.max(1, Math.min(maxPuntos(nJug), actual + +q.dataset.pts));
    return { puntos: nuevo === sugerirPuntos(nJug) ? null : nuevo };
  }
  return null;
}

/* ---------- Portada ---------- */
export function renderInicio() {
  const s = sesionGuardada(), b = $('hVolver');
  b.hidden = !s; if (s) b.textContent = 'Volver a la partida ' + s.codigo;
}
export function irInicio() { renderInicio(); show('s-home') }

/* ---------- Crear ---------- */
let CFG = { ...DEF, ...lsGet('ajustes', {}) };
function fillNombre(id) { const el = $(id); if (el && !el.value) el.value = cleanName(miNombre()) }
export function abrirCrear() { fillNombre('crNom'); $('crErr').textContent = ''; pintaCrear(); show('s-crear') }
function pintaCrear() { $('crAjustes').innerHTML = ajustesHTML(CFG, true, null) }
async function crear() {
  const nombre = cleanName($('crNom').value);
  if (!nombre) { $('crErr').textContent = 'Escribe tu nombre.'; $('crNom').focus(); return }
  lsSet('nombre', nombre); lsSet('ajustes', { ...CFG, puntos: null });
  desbloquea(); precarga();
  $('crGo').disabled = true; $('crErr').textContent = '';
  try {
    const r = await rpc('crear', { p_nombre: nombre, p_look: miLook(), p_config: { ...CFG, puntos: null } });
    await entra(r);
  } catch (e) { $('crErr').textContent = textoError(e) }
  $('crGo').disabled = false;
}

/* ---------- Unirme ---------- */
export function abrirUnir(codigo) {
  fillNombre('unNom'); $('unErr').textContent = '';
  if (codigo) $('unCod').value = codigo;
  show('s-unir');
  setTimeout(() => (codigo ? $('unNom') : $('unCod')).focus(), 50);
}
const RALPH = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const limpiaCodigo = x => { const s = String(x || '').toUpperCase().replace(/[^0-9A-Z]/g, ''); return s.length === 5 && [...s].every(c => RALPH.includes(c)) ? s : '' };
async function unirme() {
  const codigo = limpiaCodigo($('unCod').value), nombre = cleanName($('unNom').value);
  if (!codigo) { $('unErr').textContent = 'El código tiene 5 letras o números.'; return }
  if (!nombre) { $('unErr').textContent = 'Escribe tu nombre.'; $('unNom').focus(); return }
  lsSet('nombre', nombre); desbloquea(); precarga();
  $('unGo').disabled = true; $('unErr').textContent = '';
  try {
    const r = await rpc('unirse', { p_codigo: codigo, p_nombre: nombre, p_look: miLook() });
    await entra(r);
  } catch (e) { $('unErr').textContent = textoError(e) }
  $('unGo').disabled = false;
}

/* ---------- Sala de espera ---------- */
const enlace = c => location.origin + location.pathname + '?s=' + c;
export function renderSala() {
  const V = E.V, s = V.sala, host = soyAnfitrion();
  $('saCod').textContent = s.codigo;
  const qr = $('saQr');
  if (qr.dataset.c !== s.codigo && window.qrcode) {
    try { const q = window.qrcode(0, 'M'); q.addData(enlace(s.codigo)); q.make(); qr.innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); qr.dataset.c = s.codigo } catch (e) { }
  }
  const js = V.jugadores.filter(j => !j.fuera), jugadores = js.filter(j => j.juega).length;
  const lista = js.map((j, i) => `<div class="pl"><span class="num">${i + 1}</span>${avImg(j.id === V.yo.id ? (miLook() || j.look) : j.look, 'sm')}<span class="nm2"><b>${esc(j.nombre)}</b>${j.id === s.anfitrion ? '<span class="tg">anfitrión</span>' : ''}${!j.juega ? '<span class="tg">solo narra</span>' : ''}${j.id === V.yo.id ? '<span class="tg">tú</span>' : ''}</span><span class="dot${conectado(j.id) ? '' : ' off'}" title="${conectado(j.id) ? 'Conectado' : 'Sin conexión'}"></span>${host && j.id !== V.yo.id ? `<button class="kick" data-kick="${j.id}" aria-label="Sacar a ${esc(j.nombre)}">✕</button>` : ''}</div>`).join('');
  pinta('saLista', lista);
  pinta('saAjustes', ajustesHTML(s.config, host, jugadores));
  $('saEmpezar').hidden = !host;
  $('saEmpezar').disabled = jugadores < 4;
  $('saNota').textContent = host
    ? (jugadores < 4 ? `Hacen falta al menos 4 jugadores (sois ${jugadores}).` : 'Cuando estéis todos, pulsa «Empezar».')
    : 'Esperando a que el anfitrión empiece la partida…';
}
function pinta(id, html) { const el = $(id); if (el._h !== html) { el._h = html; el.innerHTML = html } }

async function compartir() {
  const url = enlace(E.V.sala.codigo);
  try { if (navigator.share) { await navigator.share({ title: 'Punto Duerme', text: 'Únete a mi partida de Punto Duerme: ' + E.V.sala.codigo, url }); return } } catch (e) { if (e && e.name === 'AbortError') return }
  try { await navigator.clipboard.writeText(url); toast('Enlace copiado') } catch (e) { toast(url) }
}
function salirSalaSheet() {
  sheet(`<h3>¿Salir de la sala?</h3><p>${soyAnfitrion() ? 'Si sales, el siguiente jugador pasará a ser el anfitrión.' : 'Podrás volver a entrar con el código mientras no empiece la partida.'}</p>
    <button class="act" id="ssSi">Salir</button><button class="link" id="ssNo">Cancelar</button>`, () => {
    $('ssNo').onclick = closeSheet;
    $('ssSi').onclick = async () => {
      closeSheet(); const ses = E.ses; olvida(); irInicio();
      try { await rpc('salir', { p_codigo: ses.codigo, p_token: ses.token }) } catch (e) { }
    };
  });
}

export function iniciaSala() {
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-a]'); if (!a) return;
    if (a.dataset.a === 'crear') abrirCrear();
    else if (a.dataset.a === 'unir') abrirUnir();
    else if (a.dataset.a === 'inicio') irInicio();
  });
  $('hVolver').onclick = async () => {
    const s = sesionGuardada(); if (!s) return renderInicio();
    desbloquea(); precarga(); $('hVolver').disabled = true;
    await entra(s); $('hVolver').disabled = false;
  };
  $('crAjustes').addEventListener('click', e => { const c = cambioAjuste(e, CFG, null); if (c) { CFG = { ...CFG, ...c }; pintaCrear() } });
  $('crGo').onclick = crear;
  $('crNom').addEventListener('keydown', e => { if (e.key === 'Enter') crear() });
  $('unGo').onclick = unirme;
  $('unNom').addEventListener('keydown', e => { if (e.key === 'Enter') unirme() });
  $('unCod').addEventListener('input', () => { const el = $('unCod'); el.value = el.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 5) });
  $('saAjustes').addEventListener('click', e => {
    if (!E.V || !soyAnfitrion()) return;
    const n = E.V.jugadores.filter(j => !j.fuera && j.juega).length;
    const c = cambioAjuste(e, E.V.sala.config, n); if (!c) return;
    E.V.sala.config = { ...E.V.sala.config, ...c }; renderSala(); /* se ve al momento; el servidor lo confirma */
    accion('configurar', { p_config: c }).catch(err => toast(textoError(err)));
  });
  $('saLista').addEventListener('click', e => {
    const k = e.target.closest('[data-kick]'); if (!k) return;
    const j = E.V.jugadores.find(x => x.id === k.dataset.kick); if (!j) return;
    sheet(`<h3>¿Sacar a ${esc(j.nombre)}?</h3><p>Saldrá de la sala. Podrá volver a entrar con el código.</p><button class="act danger" id="kkSi">Sacar</button><button class="link" id="kkNo">Cancelar</button>`, () => {
      $('kkNo').onclick = closeSheet;
      $('kkSi').onclick = () => { closeSheet(); accion('expulsar', { p_id: j.id }).catch(err => toast(textoError(err))) };
    });
  });
  $('saEmpezar').onclick = async () => {
    desbloquea(); precarga(); $('saEmpezar').disabled = true;
    try { await accion('empezar') } catch (err) { toast(textoError(err)) }
    $('saEmpezar').disabled = false;
  };
  $('saCompartir').onclick = compartir;
  $('saSalir').onclick = () => E.V && E.V.sala.fase === 'sala' ? salirSalaSheet() : salirSheet();
}
