/* Modo de un solo móvil: este móvil es el narrador y se pasa de mano en mano. No usa conexión ni servidor
   (todo vive en este archivo y en localStorage), así que funciona sin cobertura.

   Flujo (S.fase): reparto (cada uno ve su papel en secreto) → anochece → noche (el narrador llama a cada personaje por
   turno: ese coge el móvil, elige y lo deja) → amanece → debate (cuenta atrás) → votación (uno a uno, en secreto)
   → resultado → noche… → final.

   Estado S (se guarda tras cada paso, para «Volver a la partida»):
     jug [{n nombre, rol, vivo}], cfg {t_debate, revelar}, ronda, fase, sub {…}, noche {matar}, pub {muertos|eliminado…}, votos {idxVotante: idxVotado}
   Las pantallas privadas (papel, elegir) vuelven siempre a la pantalla «pasa el móvil» si se recarga la página.

   Personajes de la fase 2 (Bruja, Cupido, Vidente): se añaden en roles.js → NOCHE (activo:true) y aquí en ACCIONES
   (cómo se elige y qué efecto tiene); el resto del motor (llamada por turnos, espera simulada si el personaje ha muerto) ya está. */
import { $, esc, sheet, closeSheet, toast, lsGet, lsSet, lsDel, show, tema, plural, cleanName, listaNombres } from './util.js';
import { ROLES, NOCHE, nombreRol, puntosPara, maxPuntos, sugerirPuntos } from './roles.js';
import { texto, subtitulo } from './textos-narrador.js';
import { di, calla, silencia, desbloquea, VOZ, vozGrabada, PAUSA_CIERRA_OJOS, PAUSA_AMANECER, PAUSA_ENTRE_TURNOS, PAUSA_FRASES, PAUSA_ELIMINADO } from './narrador.js';
import { precarga } from './ambiente.js';
import { FASES, cartaRolHTML, ICO_VOZ, ICO_MUDO } from './partida.js';
import { avImg } from './cuenta.js';
import { irInicio } from './sala.js';
import { liberaAudio } from './audio.js';

const CINCO_H = 5 * 3600 * 1000;
const DEF = { nombres: [], puntos: null, t_debate: 180, revelar: true };
let CFG = { ...DEF, ...lsGet('solo-cfg', {}) };
let S = null, CUENTA = 0;

export const soloActivo = () => !!S;
export function soloGuardado() {
  const g = lsGet('solo', null);
  if (!g || !g.S || Date.now() - g.t > CINCO_H) { if (g) lsDel('solo'); return null }
  return g.S;
}
const guarda = () => lsSet('solo', { t: Date.now(), S });
const olvida = () => { S = null; clearInterval(CUENTA); calla(); liberaAudio(); lsDel('solo') };

/* ---------- Ajustes (antes de empezar) ---------- */
const fmt = s => s < 60 ? s + ' s' : Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + ' min';
export function abrirSolo() { tema('sala'); renderCfg(); show('s-solo-cfg') }
function renderCfg() {
  const n = CFG.nombres.length, k = n >= 4 ? puntosPara(n, CFG.puntos) : null;
  $('soCount').textContent = n ? n + ' ' + plural(n, 'jugador', 'jugadores') : '';
  $('soNombres').innerHTML = CFG.nombres.map((x, i) => `<span class="nm">${esc(x)}<button data-del="${i}" aria-label="Quitar a ${esc(x)}">✕</button></span>`).join('');
  $('soAjustes').innerHTML = `
    <div class="row"><div><div class="lbl">Puntos</div><div class="sub">${n < 4 ? 'Hacen falta 4 jugadores' : CFG.puntos == null ? 'Sugerido para ' + n + ' jugadores' : 'Elegido por ti'}</div></div>
      <div class="step"><button type="button" data-pts="-1" aria-label="Menos Puntos" ${!k || k <= 1 ? 'disabled' : ''}>−</button><output>${k || '–'}</output><button type="button" data-pts="1" aria-label="Más Puntos" ${!k || k >= maxPuntos(n) ? 'disabled' : ''}>+</button></div></div>
    <div class="row"><div><div class="lbl">Debate</div><div class="sub">Tiempo para hablar de día</div></div>
      <div class="step"><button type="button" data-deb="-1" aria-label="Menos" ${CFG.t_debate <= 30 ? 'disabled' : ''}>−</button><output>${fmt(CFG.t_debate)}</output><button type="button" data-deb="1" aria-label="Más" ${CFG.t_debate >= 900 ? 'disabled' : ''}>+</button></div></div>
    <div class="row"><div><div class="lbl">Revelar el papel</div><div class="sub">De los muertos y los eliminados</div></div>
      <button type="button" class="switch" role="switch" data-rev aria-checked="${!!CFG.revelar}" aria-label="Revelar el papel"></button></div>`;
  $('soEmpezar').disabled = n < 4;
  $('soSilencio').hidden = vozGrabada() || VOZ.mudo;
  $('soNota').textContent = n < 4 ? `Añade al menos 4 jugadores (ahora ${n}).` : 'Cuando estéis todos, pulsa «Empezar». Os iréis pasando este móvil.';
}
const guardaCfg = () => lsSet('solo-cfg', CFG);
function anade() {
  const el = $('soNom'); let x = cleanName(el.value).slice(0, 14); if (!x) return;
  if (CFG.nombres.length >= 20) return toast('Máximo 20 jugadores');
  let u = x, i = 2; while (CFG.nombres.some(y => y.toLowerCase() === u.toLowerCase())) u = x + i++;
  CFG.nombres.push(u); CFG.puntos = null; guardaCfg(); el.value = ''; renderCfg(); el.focus();
}

function empezar() {
  const n = CFG.nombres;
  if (n.length < 4) return;
  desbloquea(); precarga();
  const k = puntosPara(n.length, CFG.puntos), orden = n.map((_, i) => i).sort(() => Math.random() - .5), pun = new Set(orden.slice(0, k));
  S = {
    id: Math.random().toString(36).slice(2, 8), ronda: 0, noche: {}, pub: {}, votos: {},
    cfg: { t_debate: CFG.t_debate, revelar: CFG.revelar },
    jug: n.map((nombre, i) => ({ n: nombre, rol: pun.has(i) ? 'punto' : 'ciego', vivo: true }))
  };
  ir('reparto', { i: 0, paso: 'pasa' });
}

export function reanudar() {
  const g = soloGuardado(); if (!g) return irInicio();
  desbloquea(); precarga(); S = g;
  /* las pantallas privadas vuelven a «pasa el móvil» (por si alguien recargó con un papel a la vista) */
  const s = { ...S.sub };
  if (S.fase === 'reparto') s.paso = 'pasa';
  if (S.fase === 'noche' && s.paso === 'elige') { s.paso = 'llama'; delete s.sel; delete s.listo }
  if (S.fase === 'votacion') { s.paso = 'pasa'; delete s.sel }
  ir(S.fase, s);
}

/* ---------- Motor ---------- */
const vivos = () => S.jug.filter(j => j.vivo);
function ganador() {
  const p = vivos().filter(j => j.rol === 'punto').length, o = vivos().length - p;
  return p === 0 ? 'ciegos' : p >= o ? 'puntos' : null;
}
const sem = () => ({ j: S.id, r: S.ronda });
const pasos = () => NOCHE.filter(p => p.activo && (!p.soloRonda || p.soloRonda === S.ronda) && S.jug.some(j => j.rol === p.rol)).sort((a, b) => a.orden - b.orden);
const hayTitular = p => vivos().some(j => j.rol === p.rol);

/* Qué se elige y qué efecto tiene cada acción de la noche. Fase 2: añadir aquí 'ver', 'enamorar', 'pociones'. */
const ACCIONES = {
  matar: {
    titulo: 'Elige a la víctima', ayuda: 'Si sois varios Puntos, poneos de acuerdo en voz baja.',
    candidatos: () => vivos().filter(j => j.rol !== 'punto'),
    aplica: idx => { S.noche.matar = idx }
  }
};

function ir(fase, sub) {
  calla(); clearInterval(CUENTA);
  S.fase = fase; S.sub = sub || {}; S.n = (S.n || 0) + 1; S.narra = '';
  guarda(); render(); entra();
}
function entra() {
  const n = S.n, s = S.sub, sm = sem();
  const luego = (fn, ms) => setTimeout(() => { if (S && S.n === n) fn() }, ms);
  const habla = (t, fin) => { S.narra = t; pintaNarra(); di(t, () => { if (S && S.n === n && fin) fin() }) };
  switch (S.fase) {
    case 'reparto':
      if (s.i === 0 && s.paso === 'pasa') habla(texto('bienvenida', null, sm));
      break;
    case 'anochece':
      habla(texto(S.ronda <= 1 ? 'primera_noche' : 'noche_cae', null, sm), () => luego(() => ir('noche', { k: 0, paso: 'llama' }), PAUSA_CIERRA_OJOS));
      break;
    case 'noche': {
      const p = pasos()[s.k];
      if (!p) return finNoche();
      if (s.paso === 'llama') {
        habla(texto(p.abre, null, sm), () => {
          if (hayTitular(p)) { S.sub.listo = true; render() }
          else luego(() => ir('noche', { k: s.k, paso: 'cierra' }), 3500 + Math.random() * 5000); /* el titular ha muerto: se simula la espera */
        });
      } else if (s.paso === 'cierra') {
        habla(texto(p.cierra, null, sm), () => luego(() => ir('noche', { k: s.k + 1, paso: 'llama' }), pasos()[s.k + 1] ? PAUSA_ENTRE_TURNOS : PAUSA_AMANECER));
      }
      break;
    }
    case 'amanece': {
      const m = S.pub.muertos || [];
      habla(texto('amanece_inicio', null, sm) + ' | ' + (m.length > 1 ? texto('amanece_varios', null, sm) : m.length ? texto('amanece_muerto', null, sm) : texto('amanece_nadie', null, sm)),
        () => luego(() => { ganador() ? ir('final') : ir('debate') }, PAUSA_FRASES));
      break;
    }
    case 'debate':
      if (!s.hasta) { S.sub.hasta = Date.now() + S.cfg.t_debate * 1000; guarda(); habla(texto('debate', null, sm)) }
      arrancaCuenta();
      break;
    case 'votacion':
      if (s.i === 0 && s.paso === 'pasa') habla(texto('votacion', null, sm))
      break;
    case 'resultado': {
      const e = S.pub.eliminado, siguiente = () => { if (ganador()) ir('final'); else { S.ronda++; ir('anochece') } };
      /* la frase acaba en suspense («…y señala a…»): el nombre aparece al terminar */
      if (e && !s.revela) habla(texto('eliminado', null, sm), () => { S.sub.revela = true; guarda(); render(); luego(siguiente, PAUSA_ELIMINADO) });
      else if (e) luego(siguiente, PAUSA_ELIMINADO);
      else habla(texto(S.pub.recuento && S.pub.recuento.length ? 'empate' : 'sin_votos', null, sm), () => luego(siguiente, PAUSA_FRASES));
      break;
    }
    case 'final': {
      const g = S.pub.ganador = ganador();
      habla(texto(g === 'puntos' ? 'gana_puntos' : 'gana_pueblo', null, sm));
      guarda();
      break;
    }
  }
}

function finNoche() {
  const m = [], k = S.noche.matar;
  if (k != null && S.jug[k] && S.jug[k].vivo) { S.jug[k].vivo = false; m.push({ n: S.jug[k].n, rol: S.jug[k].rol }) }
  S.noche = {}; S.pub = { muertos: m };
  ir('amanece');
}
function empiezaVoto() {
  S.votos = {};
  ir('votacion', { orden: vivos().map(j => S.jug.indexOf(j)), i: 0, paso: 'pasa' });
}
function finVoto() {
  const cuenta = {};
  let abst = 0;
  for (const v of Object.values(S.votos)) { if (v < 0) abst++; else cuenta[v] = (cuenta[v] || 0) + 1 }
  const rec = Object.entries(cuenta).map(([i, v]) => ({ i: +i, n: S.jug[+i].n, v })).sort((a, b) => b.v - a.v);
  let e = null;
  if (rec.length && (rec.length === 1 || rec[0].v > rec[1].v)) { const j = S.jug[rec[0].i]; j.vivo = false; e = { n: j.n, rol: j.rol } }
  S.pub = { eliminado: e, recuento: rec.map(r => ({ n: r.n, v: r.v })), abstenciones: abst };
  ir('resultado');
}

/* Cuenta atrás del debate */
function arrancaCuenta() {
  const avisos = new Set();
  const tic = () => {
    const r = Math.ceil((S.sub.hasta - Date.now()) / 1000), el = $('soCuenta');
    const txt = Math.floor(Math.max(0, r) / 60) + ':' + String(Math.max(0, r) % 60).padStart(2, '0');
    if (el.textContent !== txt) el.textContent = txt;
    el.classList.toggle('poco', r <= 10);
    if (r <= 0) { clearInterval(CUENTA); empiezaVoto() }
  };
  tic(); CUENTA = setInterval(tic, 250);
}

/* ---------- Pantallas ---------- */
const MIRA = '<p class="tiny">Que nadie más mire la pantalla.</p>';
const pasa = nombre => `<div class="phase"><p class="pt">Pasa el móvil a</p><p class="bigname">${esc(nombre)}</p></div>`;
const lista = (js, sel, attr) => `<div class="vlist">${js.map(j => { const i = S.jug.indexOf(j); return `<button class="vbtn${sel === i ? ' on' : ''}" ${attr}="${i}">${avImg(null, 'sm')}<span class="n">${esc(j.n)}</span><span class="chk">✓</span></button>` }).join('')}</div>`;
const filaJ = j => `<div class="pl${j.vivo ? '' : ' dead'}">${avImg(null, 'sm')}<span class="nm2"><b>${esc(j.n)}</b></span></div>`;

const CUERPO = {
  reparto() {
    const s = S.sub, j = S.jug[s.i];
    if (s.paso === 'pasa') return { fijo: pasa(j.n), vivo: `<button class="act" data-s="soy">Soy ${esc(j.n)}</button>${MIRA}<p class="vprog">Jugador <b>${s.i + 1}/${S.jug.length}</b></p>` };
    return { fijo: cartaRolHTML(j.rol), vivo: `<button class="act" data-s="visto">Ya lo he visto</button><p class="tiny">Después, pasa el móvil a ${esc(S.jug[(s.i + 1) % S.jug.length].n)}${s.i + 1 === S.jug.length ? ' (o déjalo en el centro)' : ''}.</p>` };
  },
  anochece() {
    return { fijo: `<div class="phase"><p class="pt">El pueblo se duerme</p><p>Todos con los ojos cerrados. Deja el móvil en el centro.</p></div>`, vivo: '' };
  },
  noche() {
    const s = S.sub, p = pasos()[s.k]; if (!p) return { fijo: '', vivo: '' };
    if (s.paso === 'llama') return {
      fijo: `<div class="phase"><p class="pt">${esc(p.titulo)}</p><p>Escucha al narrador.</p></div>`,
      vivo: s.listo ? `<button class="act" data-s="tengo">Tengo el móvil</button>${MIRA}` : ''
    };
    if (s.paso === 'elige') {
      const a = ACCIONES[p.accion];
      return {
        fijo: `<div class="phase"><p class="pt">${esc(a.titulo)}</p><p class="hintrol">${esc(a.ayuda)}</p></div>`,
        vivo: lista(a.candidatos(), s.sel, 'data-sel') + `<button class="act" data-s="confirma" ${s.sel == null ? 'disabled' : ''}>Confirmar</button><p class="tiny">Después, deja el móvil en el centro y cierra los ojos.</p>`
      };
    }
    return { fijo: `<div class="phase"><p class="pt">Deja el móvil en el centro</p><p>Y cierra los ojos.</p></div>`, vivo: '' };
  },
  amanece() {
    const m = S.pub.muertos || [];
    const caja = m.length ? m.map(o => `<div class="muerto">${avImg(null, 'xl')}<b>${esc(o.n)}</b><span>${S.cfg.revelar ? 'era ' + (o.rol === 'punto' ? 'un Punto' : 'un Ciego') : 'ha muerto esta noche'}</span></div>`).join('')
      : `<div class="muerto nadie"><b>Nadie ha muerto</b><span>esta noche</span></div>`;
    return { fijo: `<div class="sol" aria-hidden="true"></div>${caja}`, vivo: `<button class="act sec" data-s="sigue">Continuar</button>` };
  },
  debate() {
    return {
      fijo: `<div class="phase"><p class="pt">¿Quién es un Punto?</p><p>Hablad. Cuando se acabe el tiempo, se vota.</p></div>`,
      vivo: `<div class="plist">${S.jug.map(filaJ).join('')}</div><button class="act sec" data-s="votarya">Votar ya</button>`
    };
  },
  votacion() {
    const s = S.sub, vi = s.orden[s.i], j = S.jug[vi];
    if (s.paso === 'pasa') return { fijo: pasa(j.n), vivo: `<button class="act" data-s="soy">Soy ${esc(j.n)}</button>${MIRA}<p class="vprog">Votan <b>${s.i + 1}/${s.orden.length}</b></p>` };
    return {
      fijo: `<div class="phase"><p class="pt">¿A quién echáis del pueblo?</p><p>Vota en secreto, ${esc(j.n)}.</p></div>`,
      vivo: lista(vivos().filter(x => x !== j), s.sel, 'data-sel') + `<button class="act" data-s="vota" ${s.sel == null || s.sel < 0 ? 'disabled' : ''}>Confirmar voto</button><button class="act sec" data-s="abstiene">No votar</button><p class="tiny">Después, pasa el móvil al siguiente.</p>`
    };
  },
  resultado() {
    const p = S.pub, rec = p.recuento || [], max = Math.max(1, ...rec.map(r => r.v)), e = p.eliminado;
    if (e && !S.sub.revela) return { fijo: `<div class="muerto"><div class="suspense" aria-hidden="true">…</div></div>`, vivo: '' };
    const caja = e ? `<div class="muerto">${avImg(null, 'xl')}<b>${esc(e.n)}</b><span>${S.cfg.revelar ? 'era ' + (e.rol === 'punto' ? 'un Punto' : 'un Ciego') : 'abandona el pueblo'}</span></div>`
      : `<div class="muerto nadie"><b>Nadie sale</b><span>${rec.length ? 'hay empate' : 'nadie ha votado'}</span></div>`;
    const barras = rec.length ? `<div class="recuento">${rec.map(r => `<div class="cr">${avImg(null, 'sm')}<span class="nm">${esc(r.n)}</span><span class="b"><i style="width:${Math.round(100 * r.v / max)}%"></i></span><span class="v">${r.v}</span></div>`).join('')}</div>` : '';
    const ab = p.abstenciones || 0, abt = ab ? `<p class="tiny abst">${ab === 1 ? '1 jugador se ha abstenido' : ab + ' jugadores se han abstenido'}</p>` : '';
    return { fijo: caja + barras + abt, vivo: `<button class="act sec" data-s="sigue">Continuar</button>` };
  },
  final() {
    const g = ganador();
    const rows = S.jug.map(j => `<div class="pl${j.vivo ? '' : ' dead'}">${avImg(null, 'sm')}<span class="nm2"><b>${esc(j.n)}</b><span class="tg ${j.rol === 'punto' ? 'rojo' : ''}">${esc(nombreRol(j.rol))}</span></span></div>`).join('');
    return {
      fijo: `<div class="ganan ${g}"><p class="k">Fin de la partida</p><p class="big">GANAN LOS ${g === 'puntos' ? 'PUNTOS' : 'CIEGOS'}</p></div>`,
      vivo: `<div class="panel"><div class="plist">${rows}</div></div><button class="act" data-s="otra">Otra partida</button><button class="act sec" data-s="salir">Salir</button>`
    };
  }
};

const pintaNarra = () => { $('soNarra').textContent = subtitulo(S.narra || '') };
function render() {
  if (!S) return;
  show('s-solo'); tema(S.fase); document.dispatchEvent(new Event('pantalla'));
  $('soFase').textContent = FASES[S.fase] || '';
  if (S.fase !== 'debate') $('soCuenta').textContent = '';
  const m = $('soMudo'); m.innerHTML = VOZ.mudo ? ICO_MUDO : ICO_VOZ; m.setAttribute('aria-label', VOZ.mudo ? 'Activar la voz del narrador' : 'Silenciar al narrador');
  pintaNarra();
  const c = CUERPO[S.fase] ? CUERPO[S.fase]() : { fijo: '', vivo: '' };
  $('soFijo').innerHTML = c.fijo; $('soVivo').innerHTML = c.vivo;
}

/* ---------- Menú ---------- */
function menu() {
  sheet(`<div class="menuhead"><h3>Un solo móvil</h3><button class="xbtn" id="smX" aria-label="Cerrar">✕</button></div>
    <button class="menuitem" id="smMudo">${VOZ.mudo ? 'Activar la voz del narrador' : 'Silenciar al narrador'}</button>
    <button class="menuitem" id="smComo">Cómo se juega</button>
    <div class="menusep"><button class="menuitem exit" id="smFin">Terminar la partida</button></div>`, () => {
    $('smX').onclick = closeSheet;
    $('smMudo').onclick = () => { silencia(!VOZ.mudo); closeSheet(); render() };
    $('smComo').onclick = () => sheet(`<h3>Un solo móvil</h3><p>Este móvil es el narrador. Cada uno mira su papel en secreto. De noche todos cierran los ojos: el narrador llama a los Puntos, uno de ellos coge el móvil, elige a la víctima y lo deja en el centro. De día se anuncia quién ha muerto, se debate y cada uno vota en secreto cuando le llega el móvil: el más votado sale del pueblo; si hay empate, nadie.</p><p>Ganan los Ciegos si no queda ningún Punto. Ganan los Puntos si llegan a ser tantos como los Ciegos.</p><button class="act" id="cmX">Entendido</button>`, () => { $('cmX').onclick = closeSheet });
    $('smFin').onclick = () => sheet(`<h3>¿Terminar la partida?</h3><p>Se perderá la partida actual.</p><button class="act danger" id="tfSi">Terminar</button><button class="link" id="tfNo">Cancelar</button>`, () => {
      $('tfNo').onclick = closeSheet; $('tfSi').onclick = () => { closeSheet(); sale() };
    });
  });
}
function sale() { olvida(); tema('sala'); irInicio() }

/* ---------- Eventos ---------- */
export function iniciaSolo() {
  $('soAdd').onclick = anade;
  $('soNom').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); anade() } });
  $('soNombres').addEventListener('click', e => { const b = e.target.closest('[data-del]'); if (!b) return; CFG.nombres.splice(+b.dataset.del, 1); CFG.puntos = null; guardaCfg(); renderCfg() });
  $('soAjustes').addEventListener('click', e => {
    const n = CFG.nombres.length, p = e.target.closest('[data-pts]'), d = e.target.closest('[data-deb]'), r = e.target.closest('[data-rev]');
    if (p) CFG.puntos = Math.max(1, Math.min(maxPuntos(n), puntosPara(n, CFG.puntos) + +p.dataset.pts));
    else if (d) CFG.t_debate = Math.max(30, Math.min(900, CFG.t_debate + 30 * +d.dataset.deb));
    else if (r) CFG.revelar = !CFG.revelar;
    else return;
    guardaCfg(); renderCfg();
  });
  $('soEmpezar').onclick = empezar;
  $('soMenu').onclick = menu;
  $('soMudo').onclick = () => { silencia(!VOZ.mudo); toast(VOZ.mudo ? 'Narrador silenciado' : 'Voz del narrador activada'); render() };
  $('s-solo').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled || !S) return;
    const s = S.sub, a = b.dataset.s;
    if (b.dataset.sel != null) { S.sub.sel = +b.dataset.sel; guarda(); render(); return }
    if (a === 'soy') ir(S.fase, { ...s, paso: S.fase === 'votacion' ? 'elige' : 've' });
    else if (a === 'visto') s.i + 1 < S.jug.length ? ir('reparto', { i: s.i + 1, paso: 'pasa' }) : (S.ronda = 1, ir('anochece'));
    else if (a === 'tengo') ir('noche', { k: s.k, paso: 'elige' });
    else if (a === 'confirma') { const p = pasos()[s.k]; ACCIONES[p.accion].aplica(s.sel); ir('noche', { k: s.k, paso: 'cierra' }) }
    else if (a === 'vota') {
      S.votos[s.orden[s.i]] = s.sel;
      s.i + 1 < s.orden.length ? ir('votacion', { orden: s.orden, i: s.i + 1, paso: 'pasa' }) : finVoto();
    }
    else if (a === 'abstiene') {
      S.votos[s.orden[s.i]] = -1;
      s.i + 1 < s.orden.length ? ir('votacion', { orden: s.orden, i: s.i + 1, paso: 'pasa' }) : finVoto();
    }
    else if (a === 'votarya') empiezaVoto();
    else if (a === 'sigue') {
      if (S.fase === 'amanece') ganador() ? ir('final') : ir('debate');
      else if (S.fase === 'resultado') { if (ganador()) ir('final'); else { S.ronda++; ir('anochece') } }
    }
    else if (a === 'otra') { olvida(); abrirSolo() }
    else if (a === 'salir') sale();
  });
}
