/* Pantalla de la partida: una sola pantalla que cambia según la fase que manda el servidor.
   - #jFijo se repinta solo al cambiar de fase (así la tarjeta del papel no se cierra mientras se mira);
     #jVivo, con cada novedad (marcas, votos…).
   - El móvil narrador habla al empezar cada fase y cierra las fases narradas al terminar de hablar.
   - Cualquier móvil pide pasar de fase cuando se acaba el tiempo (el narrador primero; los demás,
     unos segundos después, por si el narrador no está). El servidor ignora las peticiones repetidas. */
import { $, esc, sheet, closeSheet, toast, listaNombres, tema } from './util.js';
import { textoError, rpc } from './red.js';
import { E, ahora, jug, nombreDe, soyAnfitrion, soyNarrador, conectado, accion, olvida } from './estado.js';
import { avImg } from './cuenta.js';
import { ROLES, nombreRol } from './roles.js';
import { texto, subtitulo } from './textos-narrador.js';
import { di, calla, silencia, VOZ } from './narrador.js';
import { suena } from './sonido.js';

export const FASES = { reparto: 'Tu papel', anochece: 'Cae la noche', noche: 'Noche', amanece: 'Amanece', debate: 'Debate', votacion: 'Votación', resultado: 'Resultado', final: 'Fin de la partida' };
const NARRADAS = ['anochece', 'amanece', 'resultado'];

/* ---------- Lo que dice el narrador en cada fase (también sale como subtítulo en todos los móviles) ---------- */
const tiempoHablado = s => s < 60 ? s + ' segundos' : s % 60 === 0 ? (s === 60 ? 'un minuto' : s / 60 + ' minutos') : s % 60 === 30 && s < 120 ? 'un minuto y medio' : s % 60 === 30 ? Math.floor(s / 60) + ' minutos y medio' : Math.floor(s / 60) + ' minutos y ' + (s % 60) + ' segundos';
const era = (o, sem) => o && o.rol ? ' | ' + texto(o.rol === 'punto' ? 'era_punto' : 'era_ciego', { nombre: nombreDe(o.id) }, sem) : '';
export function textoFase(V) {
  const s = V.sala, p = s.publico || {}, sem = s.codigo + s.ronda + s.fase;
  switch (s.fase) {
    case 'reparto': return texto('bienvenida', null, sem);
    case 'anochece': return texto(s.ronda <= 1 ? 'primera_noche' : 'anochece', null, sem);
    case 'noche': return texto('noche_elegid', null, sem);
    case 'amanece': {
      const m = p.muertos || [];
      return m.length ? m.map(o => texto('amanece_muerto', { nombre: nombreDe(o.id) }, sem) + era(o, sem)).join(' | ') : texto('amanece_nadie', null, sem);
    }
    case 'debate': return texto('debate', { tiempo: tiempoHablado(s.config.t_debate) }, sem);
    case 'votacion': return texto('votacion', null, sem);
    case 'resultado':
      if (p.eliminado) return texto('eliminado', { nombre: nombreDe(p.eliminado.id) }, sem) + era(p.eliminado, sem);
      return texto((p.recuento || []).length ? 'empate' : 'sin_votos', null, sem);
    case 'final': return texto(p.ganador === 'puntos' ? 'gana_puntos' : 'gana_pueblo', null, sem);
  }
  return '';
}

/* ---------- Pintado ---------- */
function pinta(id, html) { const el = $(id); if (el._h !== html) { el._h = html; el.innerHTML = html } }
let FIJO_K = '';
export function renderJuego() {
  const V = E.V, s = V.sala, me = V.yo;
  tema(s.fase);
  $('jFase').textContent = FASES[s.fase] || '';
  const mudo = $('jMudo'); mudo.hidden = !soyNarrador();
  mudo.innerHTML = VOZ.mudo ? ICO_MUDO : ICO_VOZ; mudo.setAttribute('aria-label', VOZ.mudo ? 'Activar la voz del narrador' : 'Silenciar al narrador');
  pinta('jNarra', esc(subtitulo(textoFase(V))));
  const f = CUERPO[s.fase] ? CUERPO[s.fase](V) : { fijo: '', vivo: '' };
  const k = s.fase + '|' + s.ronda + '|' + s.desde + '|' + me.vivo;
  if (k !== FIJO_K) { FIJO_K = k; $('jFijo').innerHTML = f.fijo; $('jFijo')._h = f.fijo }
  else pinta('jFijo', f.fijo.includes('rolCard') ? $('jFijo')._h : f.fijo);
  pinta('jVivo', f.vivo);
  renderAviso();
  tic();
  dirige();
  programaAvance();
}
const AUS = { desde: 0 };
function renderAviso() {
  if (!E.V) return;
  const V = E.V, s = V.sala, me = V.yo; let h = '';
  const n = s.narrador;
  if (E.presT && !conectado(n)) { if (!AUS.desde) AUS.desde = Date.now() } else AUS.desde = 0;
  if (AUS.desde && Date.now() - AUS.desde > 30000 && s.fase !== 'final')
    h += `<div class="aviso">El móvil del narrador (${esc(nombreDe(n))}) no está conectado. <button class="act sec" data-a="sernarr">Ser yo el narrador</button></div>`;
  if (!me.vivo && s.fase !== 'final') h += `<div class="elimban">ESTÁS FUERA<small>Sigue la partida en silencio: ya no votas ni actúas.</small></div>`;
  pinta('jAviso', h);
}

const fila = (j, extra = '') => `<div class="pl${j.vivo ? '' : ' dead'}">${avImg(j.look, 'sm')}<span class="nm2"><b>${esc(j.nombre)}</b>${extra}</span></div>`;
const listaJug = (V, f) => `<div class="plist">${V.jugadores.filter(j => f ? f(j) : true).map(j => fila(j, j.fuera ? '<span class="tg">ha salido</span>' : '')).join('')}</div>`;
const vivos = V => V.jugadores.filter(j => j.vivo);

/* Tarjeta del papel: se mantiene pulsada para verla (como la de Punto Falso) */
function cartaHTML(V) {
  const r = V.yo.rol, R = ROLES[r] || {};
  const comp = V.jugadores.filter(j => j.rol === 'punto' && j.id !== V.yo.id).map(j => j.nombre);
  const extra = r === 'punto' ? `<p class="comp">${comp.length ? 'Tus compañeros: <b>' + esc(listaNombres(comp)) + '</b>' : 'Eres el único Punto.'}</p>` : '';
  return `<div class="card rolcard" id="rolCard" tabindex="0" role="button" aria-label="Mantén pulsado para ver tu papel">
    <div class="front"><img class="mascot" src="img/logo.svg" alt=""><b>Mantén pulsado</b><span>para ver tu papel. Que nadie más lo vea.</span></div>
    <div class="back"><p class="k">Eres</p><p class="rolnom ${r}">${esc((R.nombre || '').toUpperCase())}</p><p class="rcorto">${esc(R.corto || '')}</p><p class="rtexto">${esc(R.texto || '')}</p>${extra}</div>
  </div>`;
}

const CUERPO = {
  reparto(V) {
    const me = V.yo, vs = vivos(V), listos = vs.filter(j => j.listo).length, mio = jug(me.id);
    return {
      fijo: cartaHTML(V),
      vivo: (mio && mio.listo ? `<p class="espera">Esperando a los demás…</p>` : `<button class="act" data-a="listo">Ya lo he visto</button>`) + `<p class="vprog">Listos <b>${listos}/${vs.length}</b></p>`
    };
  },
  anochece(V) {
    return { fijo: `<div class="phase"><p class="pt">El pueblo se duerme</p><p>Escucha al narrador y prepárate para mirar tu móvil.</p></div>`, vivo: '' };
  },
  noche(V) {
    const me = V.yo, actua = me.vivo, punto = me.rol === 'punto';
    if (!actua) return { fijo: `<div class="phase"><p class="pt">Es de noche</p><p>Estás fuera: mira en silencio.</p></div>`, vivo: '' };
    const vp = V.jugadores.filter(j => j.rol === 'punto' && j.vivo);
    const fijo = `<div class="phase"><p class="pt">Elige a un jugador</p><p class="hintrol">${punto ? (vp.length > 1 ? 'Elegid a quién eliminar. Tenéis que coincidir.' : 'Elige a quién eliminar.') : 'Marca de quién sospechas.'}</p></div>`;
    const marcas = V.marcas || {}, mia = V.mio.marca, conf = 'confirma' in V.mio;
    const lista = vivos(V).filter(j => j.id !== me.id).map(j => {
      const comp = punto && j.rol === 'punto';
      const quien = punto ? Object.keys(marcas).filter(p => marcas[p] === j.id && p !== me.id).map(nombreDe) : [];
      return `<button class="vbtn${mia === j.id ? ' on' : ''}${comp ? ' comp' : ''}" data-marca="${j.id}" ${comp || conf ? 'disabled' : ''}>${avImg(j.look, 'sm')}<span class="n">${esc(j.nombre)}</span>${comp ? '<span class="tg">Punto</span>' : ''}${quien.length ? `<span class="tg marca">${esc(listaNombres(quien))}</span>` : ''}<span class="chk">✓</span></button>`;
    }).join('');
    let puede, nota = '';
    if (punto) {
      const todos = vp.every(p => marcas[p.id] && marcas[p.id] === mia);
      puede = !!mia && (vp.length === 1 || todos);
      if (mia && !puede) nota = 'Tenéis que marcar todos al mismo para confirmar.';
    } else { puede = !!mia && !conf; if (conf) nota = 'Hecho. Espera a que amanezca.' }
    return { fijo, vivo: `<div class="vlist">${lista}</div><button class="act" data-a="confirma" ${puede ? '' : 'disabled'}>${conf ? 'Confirmado' : 'Confirmar'}</button><p class="tiny">${nota}</p>` };
  },
  amanece(V) {
    const m = (V.sala.publico || {}).muertos || [];
    const caja = m.length ? m.map(o => { const j = jug(o.id) || {}; return `<div class="muerto">${avImg(j.look, 'xl')}<b>${esc(j.nombre || '')}</b><span>${o.rol ? 'era ' + (o.rol === 'punto' ? 'un Punto' : 'un Ciego') : 'ha muerto esta noche'}</span></div>` }).join('')
      : `<div class="muerto nadie"><b>Nadie ha muerto</b><span>esta noche</span></div>`;
    return { fijo: `<div class="sol" aria-hidden="true"></div>${caja}`, vivo: '' };
  },
  debate(V) {
    const me = V.yo, puede = soyAnfitrion() || soyNarrador();
    return {
      fijo: `<div class="phase"><p class="pt">¿Quién es un Punto?</p><p>Hablad. Cuando se acabe el tiempo, se vota.</p></div>`,
      vivo: listaJug(V) + (puede ? `<button class="act sec" data-a="votarya">Votar ya</button>` : '')
    };
  },
  votacion(V) {
    const me = V.yo, actua = me.vivo, vs = vivos(V), mio = V.mio.voto;
    const prog = `<div class="vprog">Han votado <b>${V.votos || 0}/${vs.length}</b><span class="bar"><i style="width:${vs.length ? Math.round(100 * (V.votos || 0) / vs.length) : 0}%"></i></span></div>`;
    if (!actua) return { fijo: `<div class="phase"><p class="pt">Votación</p><p>Los jugadores vivos están votando en su móvil.</p></div>`, vivo: prog };
    const lista = vs.filter(j => j.id !== me.id).map(j => `<button class="vbtn${mio === j.id ? ' on' : ''}" data-voto="${j.id}">${avImg(j.look, 'sm')}<span class="n">${esc(j.nombre)}</span><span class="chk">✓</span></button>`).join('');
    return {
      fijo: `<div class="phase"><p class="pt">¿A quién echáis del pueblo?</p><p>Puedes cambiar tu voto hasta que voten todos.</p></div>`,
      vivo: `<div class="vlist">${lista}</div>${prog}`
    };
  },
  resultado(V) {
    const p = V.sala.publico || {}, rec = p.recuento || [], max = Math.max(1, ...rec.map(r => r.n));
    const e = p.eliminado, j = e && jug(e.id);
    const caja = e ? `<div class="muerto">${avImg(j && j.look, 'xl')}<b>${esc(j ? j.nombre : '')}</b><span>${e.rol ? 'era ' + (e.rol === 'punto' ? 'un Punto' : 'un Ciego') : 'abandona el pueblo'}</span></div>`
      : `<div class="muerto nadie"><b>Nadie sale</b><span>${rec.length ? 'hay empate' : 'nadie ha votado'}</span></div>`;
    const barras = rec.length ? `<div class="recuento">${rec.map(r => { const x = jug(r.id) || {}; return `<div class="cr">${avImg(x.look, 'sm')}<span class="nm">${esc(x.nombre || '')}</span><span class="b"><i style="width:${Math.round(100 * r.n / max)}%"></i></span><span class="v">${r.n}</span></div>` }).join('')}</div>` : '';
    return { fijo: caja + barras, vivo: '' };
  },
  final(V) {
    const g = (V.sala.publico || {}).ganador, host = soyAnfitrion();
    const rows = V.jugadores.map(j => fila(j, `<span class="tg ${j.rol === 'punto' ? 'rojo' : ''}">${esc(nombreRol(j.rol))}</span>${j.fuera ? '<span class="tg">ha salido</span>' : ''}`)).join('');
    const mio = V.yo.rol && ((g === 'puntos') === (V.yo.rol === 'punto'));
    return {
      fijo: `<div class="ganan ${g}"><p class="k">${mio ? 'Has ganado' : 'Has perdido'}</p><p class="big">GANAN LOS ${g === 'puntos' ? 'PUNTOS' : 'CIEGOS'}</p></div>`,
      vivo: `<div class="panel"><div class="plist">${rows}</div></div>` + (host ? `<button class="act" data-a="otra">Otra partida</button>` : '<p class="hostnote">El anfitrión puede empezar otra partida.</p>') + `<button class="act sec" data-a="salir">Salir</button>`
    };
  }
};

/* ---------- Narrador: habla al empezar cada fase y cierra las narradas al terminar ---------- */
const DIR = { k: '', avisos: new Set() };
const SONIDO_FASE = { anochece: 'noche', votacion: 'votacion' };
function dirige() {
  if (!soyNarrador()) { if (DIR.k) { DIR.k = ''; calla() } return }
  const s = E.V.sala, k = s.codigo + '|' + s.ronda + '|' + s.fase + '|' + s.desde;
  if (k === DIR.k) return;
  DIR.k = k; DIR.avisos = new Set();
  const p = s.publico || {};
  let son = SONIDO_FASE[s.fase];
  if (s.fase === 'amanece') son = (p.muertos || []).length ? 'muerte' : 'amanecer';
  if (s.fase === 'resultado') son = p.eliminado ? 'eliminado' : null;
  if (s.fase === 'final') son = p.ganador === 'puntos' ? 'victoria-puntos' : 'victoria-ciegos';
  if (son) suena(son);
  const t = textoFase(E.V), fase = s.fase, desde = s.desde;
  const sigue = () => {
    if (!NARRADAS.includes(fase)) return;
    setTimeout(() => { if (E.V && E.V.sala.fase === fase && E.V.sala.desde === desde) accion('avanzar', { p_fase: fase }).catch(() => { }) }, 900);
  };
  setTimeout(() => { if (DIR.k === k) di(t, sigue) }, son ? 900 : 200);
}
/* Avisos de tiempo y «tic» de los últimos segundos (solo el narrador) */
function tic() {
  if (!E.V || !soyNarrador()) return;
  const s = E.V.sala; if (!s.hasta) return;
  const q = Math.ceil((s.hasta - ahora()) / 1000), total = (s.hasta - s.desde) / 1000;
  const avisa = (id, seg, min) => { if (q <= seg && q > seg - 3 && total > min && !DIR.avisos.has(id)) { DIR.avisos.add(id); di(texto(id, null, s.codigo + s.ronda)) } };
  if (s.fase === 'noche') avisa('noche_10s', 10, 20);
  if (s.fase === 'debate') avisa('debate_30s', 30, 60);
  if (s.fase === 'votacion') avisa('votacion_10s', 10, 20);
  if ((s.fase === 'noche' || s.fase === 'votacion') && q > 0 && q <= 5 && !DIR.avisos.has('t' + q)) { DIR.avisos.add('t' + q); suena('tic') }
}

/* ---------- Pasar de fase cuando se acaba el tiempo ---------- */
const AV = { k: '', t: 0 };
function programaAvance() {
  const s = E.V.sala, k = s.fase + '|' + s.desde;
  if (AV.k === k) return;
  AV.k = k; clearTimeout(AV.t);
  if (!s.hasta) return;
  const extra = soyNarrador() ? 150 : 2500 + Math.random() * 2500;
  const f = () => {
    if (!E.V || E.V.sala.fase !== s.fase || E.V.sala.desde !== s.desde) return;
    accion('avanzar', { p_fase: s.fase }).catch(() => { });
    AV.t = setTimeout(f, 4000);
  };
  AV.t = setTimeout(f, Math.max(0, s.hasta - ahora() + extra));
}

/* ---------- Cuenta atrás en pantalla ---------- */
export function pintaCuentas() {
  const s = E.V && E.V.sala;
  const t = s && s.hasta && s.fase !== 'final' ? Math.max(0, Math.ceil((s.hasta - ahora()) / 1000)) : null;
  const txt = t == null || NARRADAS.includes(s.fase) || s.fase === 'reparto' ? '' : Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  document.querySelectorAll('[data-cuenta]').forEach(el => { if (el.textContent !== txt) el.textContent = txt; el.classList.toggle('poco', t != null && t <= 10) });
  if (s) { renderAviso(); tic() }
}

/* ---------- Menú y salir ---------- */
export function salirSheet() {
  const enJuego = E.V && !['sala', 'final'].includes(E.V.sala.fase);
  sheet(`<h3>¿Salir de la partida?</h3><p>${enJuego ? 'Si sales ahora, quedas fuera de la partida (como si murieras) y no podrás volver a entrar.' : 'Saldrás de la sala.'}${soyAnfitrion() ? ' El siguiente jugador pasará a ser el anfitrión.' : ''}</p>
    <button class="act danger" id="sxSi">Salir</button><button class="link" id="sxNo">Cancelar</button>`, () => {
    $('sxNo').onclick = closeSheet;
    $('sxSi').onclick = async () => {
      closeSheet(); calla(); const ses = E.ses; olvida(); E.alSalir && E.alSalir();
      try { await rpc('salir', { p_codigo: ses.codigo, p_token: ses.token }) } catch (e) { }
    };
  });
}
function menu() {
  const V = E.V; if (!V) return;
  const s = V.sala, me = V.yo, enJuego = !['sala', 'final'].includes(s.fase);
  sheet(`<div class="menuhead"><h3>Partida ${esc(s.codigo)}</h3><button class="xbtn" id="mnX" aria-label="Cerrar">✕</button></div>
    ${me.rol && enJuego ? '<button class="menuitem" id="mnRol">Ver mi papel</button>' : ''}
    ${soyNarrador() ? `<button class="menuitem" id="mnMudo">${VOZ.mudo ? 'Activar la voz del narrador' : 'Silenciar al narrador'}</button>` : '<button class="menuitem" id="mnNarr">Ser yo el narrador</button>'}
    <button class="menuitem" id="mnComo">Cómo se juega</button>
    <div class="menusep">${soyAnfitrion() && enJuego ? '<button class="menuitem danger" id="mnFin">Terminar la partida</button>' : ''}<button class="menuitem exit" id="mnSalir">Salir de la partida</button></div>`, () => {
    $('mnX').onclick = closeSheet;
    if ($('mnRol')) $('mnRol').onclick = () => sheet(cartaHTML(E.V) + '<button class="link" id="rlX">Cerrar</button>', () => { $('rlX').onclick = closeSheet });
    if ($('mnMudo')) $('mnMudo').onclick = () => { silencia(!VOZ.mudo); closeSheet(); renderJuego() };
    if ($('mnNarr')) $('mnNarr').onclick = () => sheet(`<h3>¿Ser el narrador?</h3><p>Tu móvil pondrá la voz y los sonidos de la partida. Úsalo si el móvil del narrador se ha quedado sin batería o sin conexión.</p><button class="act" id="snSi">Ser el narrador</button><button class="link" id="snNo">Cancelar</button>`, () => {
      $('snNo').onclick = closeSheet; $('snSi').onclick = () => { closeSheet(); serNarrador() };
    });
    $('mnComo').onclick = () => sheet(`<h3>Cómo se juega</h3><p>De noche, todos miran su móvil y tocan a alguien: los Puntos eligen a quién eliminar (si son varios, tienen que coincidir) y los Ciegos marcan de quién sospechan. De día se anuncia quién ha muerto, se debate y se vota: el más votado sale del pueblo; si hay empate, nadie.</p><p>Ganan los Ciegos si no queda ningún Punto. Ganan los Puntos si llegan a ser tantos como los Ciegos.</p><button class="act" id="cmX">Entendido</button>`, () => { $('cmX').onclick = closeSheet });
    if ($('mnFin')) $('mnFin').onclick = () => sheet(`<h3>¿Terminar la partida?</h3><p>Todos volveréis a la sala de espera y se verán los papeles de esta partida perdidos.</p><button class="act danger" id="tfSi">Terminar</button><button class="link" id="tfNo">Cancelar</button>`, () => {
      $('tfNo').onclick = closeSheet; $('tfSi').onclick = () => { closeSheet(); accion('a_la_sala').catch(e => toast(textoError(e))) };
    });
    $('mnSalir').onclick = salirSheet;
  });
}
function serNarrador() { accion('ser_narrador').then(() => toast('Ahora eres el narrador')).catch(e => toast(textoError(e))) }

const ICO_VOZ = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
const ICO_MUDO = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';

export function iniciaPartida() {
  $('jMenu').onclick = menu;
  $('jMudo').onclick = () => { silencia(!VOZ.mudo); toast(VOZ.mudo ? 'Narrador silenciado' : 'Voz del narrador activada'); renderJuego() };
  const cuerpo = $('s-juego');
  cuerpo.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    const err = x => toast(textoError(x));
    if (b.dataset.marca) { b.classList.add('on'); accion('actuar', { p_tipo: 'marca', p_objetivo: b.dataset.marca }).catch(err) }
    else if (b.dataset.voto) { document.querySelectorAll('[data-voto]').forEach(x => x.classList.toggle('on', x === b)); accion('actuar', { p_tipo: 'voto', p_objetivo: b.dataset.voto }).catch(err) }
    else if (b.dataset.a === 'confirma') { b.disabled = true; accion('actuar', { p_tipo: 'confirma', p_objetivo: null }).catch(err) }
    else if (b.dataset.a === 'listo') { b.disabled = true; accion('actuar', { p_tipo: 'listo', p_objetivo: null }).catch(err) }
    else if (b.dataset.a === 'votarya') { b.disabled = true; accion('actuar', { p_tipo: 'votar_ya', p_objetivo: null }).catch(err) }
    else if (b.dataset.a === 'otra') accion('a_la_sala').catch(err);
    else if (b.dataset.a === 'salir') salirSheet();
    else if (b.dataset.a === 'sernarr') serNarrador();
  });
  /* Mantener pulsada la tarjeta del papel (en la partida y en «Ver mi papel») */
  const abre = on => e => { const c = e.target.closest('#rolCard'); if (!c) return; if (on) e.preventDefault(); c.classList.toggle('open', on) };
  document.addEventListener('pointerdown', abre(true));
  ['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, () => document.querySelectorAll('#rolCard.open').forEach(c => c.classList.remove('open')), true));
  document.addEventListener('contextmenu', e => { if (e.target.closest('#rolCard')) e.preventDefault() });
  document.addEventListener('keydown', e => { const c = e.target.closest && e.target.closest('#rolCard'); if (c && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); c.classList.add('open') } });
  document.addEventListener('keyup', e => { const c = e.target.closest && e.target.closest('#rolCard'); if (c) c.classList.remove('open') });
}
