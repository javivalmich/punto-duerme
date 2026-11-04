/* Cuenta opcional (la misma que Punto Falso y Punto Ciego) y personaje.
   Adaptado de Punto Falso: mismas listas de colores, mismo editor 3D y misma tabla `profiles`.
   Las listas (COLORES, ROPA, PIEZAS…) y limpiaLook son las de Punto Ciego: si se tocan allí, hay que copiarlas aquí. */
import { $, esc, lsGet, lsSet, lsDel, cleanName, sheet, closeSheet, toast, repinta } from './util.js';
import { loadSB, SUPA } from './red.js';
import { HEAD_IMG, HEAD_MASK, G_LOGO, APPLE_LOGO } from './cabeza.js';

/* El juego se engancha aquí para enterarse de cambios del personaje y de un borrado de cuenta */
export const ganchos = { alGuardar: null, alBorrar: null };

/* ---------- Personaje: avatar redondo ligero (cabeza 2D recoloreada) ---------- */
const BLANCO = 7;
const COLORES = [['Rojo', '#D83A34'], ['Azul', '#2F6FE0'], ['Verde', '#2FA05A'], ['Rosa', '#E86FB0'], ['Naranja', '#EE8A2A'], ['Amarillo', '#F2D23A'], ['Menta', '#6FE0C0'], ['Blanco', '#F1ECE3'], ['Morado', '#8A55D8'], ['Marrón', '#9A6A45'], ['Cian', '#3CC7D6'], ['Lima', '#9BD83A'], ['Granate', '#9E2B4A'], ['Gris', '#8A8F96'], ['Coral', '#FF7F6B']];
const ROPA = [['Negra', null], ['Grafito', '#4A4A52'], ['Hueso', '#E6DFD2'], ['Oliva', '#6B7A3A'], ['Marino', '#22406E'], ['Burdeos', '#7C1F2E'], ['Camel', '#B8894F'], ['Roja', '#FF4637'], ['Rosa', '#E58FB5'], ['Lavanda', '#9C8AD8'], ['Azul eléctrico', '#2F6FE0'], ['Cielo', '#7FB7E6'], ['Turquesa', '#1FA3A0'], ['Verde bosque', '#1F6B3A'], ['Lima', '#A6D83A'], ['Mostaza', '#D9A21B'], ['Naranja', '#E8742A'], ['Terracota', '#B4533A'], ['Berenjena', '#5B2A6B'], ['Fucsia', '#D6338C']];
const ESTAMPADOS = ['Lisa', 'Rayas', 'Cuadros', 'Camuflaje'];
const GUANTES = [['Blancos', null], ['Negros', '#2A2A2E'], ['Rojos', '#E5483A'], ['Amarillos', '#F2D23A'], ['Azules', '#2F6FE0'], ['Verdes', '#2FA05A']];
const OJOS = [['Blancos', null], ['Rojos', '#FF4637'], ['Cian', '#5FE0F0'], ['Amarillos', '#FFD84A'], ['Lima', '#B6F24A'], ['Rosas', '#FF8FC8']];
const PIEZAS = [['Como la sudadera', null], ...ROPA];
const colorPieza = (i, cloth) => i === 0 ? ROPA[cloth][1] : ROPA[i - 1][1];
const ESTAMPADOS_P = ['Como la sudadera', ...ESTAMPADOS];
const ZAPATOS = [['Como el pantalón', null], ...ROPA];
const patPantalon = l => l.pantsPat === 0 ? l.pat : l.pantsPat - 1;
const colorZapato = l => l.shoes === 0 ? colorPieza(l.pants, l.cloth) : ROPA[l.shoes - 1][1];
export function limpiaLook(l) {
  l = l || {}; const o = {}; const r = (v, n, d) => Number.isInteger(v) && v >= 0 && v < n ? v : d;
  o.hood = r(l.hood, COLORES.length, BLANCO); o.cloth = r(l.cloth, ROPA.length, 0); o.pat = r(l.pat, ESTAMPADOS.length, 0); o.glove = r(l.glove, GUANTES.length, 0); o.eye = r(l.eye, OJOS.length, 0); o.pants = r(l.pants, PIEZAS.length, 0); o.pack = r(l.pack, PIEZAS.length, 0); o.pantsPat = r(l.pantsPat, ESTAMPADOS_P.length, 0); o.shoes = r(l.shoes, ZAPATOS.length, 0); return o
}
const REF_HEAD = [26.3, 227.7, 39.5, 239.9, 0];
const hexRGB = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const arrOfLook = l => [l.hood, l.cloth, l.pat, l.glove, l.eye];
const esDefecto = l => l.hood === BLANCO && !l.cloth && !l.pat && !l.glove && !l.eye;
const AV = { B: null, cache: new Map() };
export function avLoad() {
  const carga = src => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src });
  Promise.all([carga(HEAD_IMG), carga(HEAD_MASK)]).then(([im, lb]) => {
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(im, 0, 0); const px = x.getImageData(0, 0, c.width, c.height);
    x.clearRect(0, 0, c.width, c.height); x.drawImage(lb, 0, 0, c.width, c.height); const lab = x.getImageData(0, 0, c.width, c.height).data;
    const L = new Uint8Array(c.width * c.height); for (let i = 0; i < L.length; i++)L[i] = Math.round(lab[i * 4] / 30);
    AV.B = { w: c.width, h: c.height, px: px.data, L }; AV.cache.clear(); renderAcct(); repinta();
  }).catch(e => console.warn('avatar', e));
}
function pintaCabeza(look) {
  const B = AV.B, ref = REF_HEAD, esc2 = B.w / 90;
  const c = document.createElement('canvas'); c.width = B.w; c.height = B.h; const x = c.getContext('2d'); const out = x.createImageData(B.w, B.h), d = out.data, src = B.px, L = B.L;
  const cH = look.hood === BLANCO ? null : hexRGB(COLORES[look.hood][1]), cR = ROPA[look.cloth][1] ? hexRGB(ROPA[look.cloth][1]) : null,
    cG = GUANTES[look.glove][1] ? hexRGB(GUANTES[look.glove][1]) : null, cE = OJOS[look.eye][1] ? hexRGB(OJOS[look.eye][1]) : null, pat = look.pat;
  const claro = (col, l, r, o) => { const t = Math.min(1.25, l / r); for (let j = 0; j < 3; j++) { let v = col[j] * t; if (l > r) v += (255 - v) * Math.min(1, (l - r) / (256 - r)) * .55; d[o + j] = v } };
  for (let i = 0, n = L.length; i < n; i++) {
    const o = i * 4, lb = L[i], r = src[o], g = src[o + 1], b = src[o + 2], l = (r + g + b) / 3; d[o + 3] = src[o + 3];
    if (lb === 2 && cH) claro(cH, l, ref[1], o);
    else if (lb === 4 && cE) claro(cE, l, ref[3] || 240, o);
    else if (lb === 5 && cG) claro(cG, l, ref[4] || 180, o);
    else if (lb === 1 && (cR || pat)) {
      const X = (i % B.w) / esc2, Y = Math.floor(i / B.w) / esc2; let f = 1;
      if (pat === 1) f = Math.floor(Y / 5) % 2 ? .62 : 1;
      else if (pat === 2) f = (Math.floor(X / 7) + Math.floor(Y / 7)) % 2 ? .6 : 1;
      else if (pat === 3) { const q = Math.sin(X * .23 + Math.sin(Y * .15) * 2.2) + Math.sin(Y * .19 + Math.sin(X * .12) * 2.4); f = q > .9 ? .5 : q > -.4 ? .8 : 1.05 }
      const base = cR || [62, 62, 66], t = Math.max(.25, Math.min(2.4, l / ref[0])) * (cR ? .5 : .42) * f;
      for (let j = 0; j < 3; j++)d[o + j] = base[j] * t;
    } else { d[o] = r; d[o + 1] = g; d[o + 2] = b }
  }
  x.putImageData(out, 0, 0); return c;
}
export function avSrc(look) {
  look = look ? limpiaLook(look) : null;
  if (!look || esDefecto(look) || !AV.B) return HEAD_IMG;
  const k = arrOfLook(look).join('.');
  if (!AV.cache.has(k)) { let u = HEAD_IMG; try { u = pintaCabeza(look).toDataURL('image/png') } catch (e) { console.warn('avatar', e) } AV.cache.set(k, u) }
  return AV.cache.get(k);
}
export const avImg = (look, cls = '') => `<img class="av ${cls}" src="${avSrc(look)}" alt="">`;

export let USER = null, PERFIL = null; // sesión (opcional) y su perfil {name,look}
export const miLook = () => PERFIL ? PERFIL.look : null;
export const miNombre = () => (PERFIL && PERFIL.name) || lsGet('nombre', '') || '';

/* ---------- Cuenta ---------- */
let GOOGLE = false, APPLE = false;
export function renderAcct() {
  const html = USER ?
    `${avImg(miLook(), 'sm')}<span>${PERFIL && PERFIL.name ? 'Hola, <b></b>' : 'Sesión iniciada'}</span><button data-a="menu">Mi cuenta</button>`
    : `<button data-a="in">Entrar o crear cuenta</button>`;
  document.querySelectorAll('.acct').forEach(el => {
    if (el._h !== html) { el._h = html; el.innerHTML = html; const b = el.querySelector('b'); if (b) b.textContent = PERFIL.name }
  });
}
document.addEventListener('click', e => {
  const b = e.target.closest('.acct button'); if (!b) return;
  if (b.dataset.a === 'in') loginSheet(); else cuentaMenuSheet();
});
function errorCuenta(e) {
  const m = ((e && (e.code || '')) + ' ' + (e && e.message || '')).toLowerCase();
  if (m.includes('invalid') && m.includes('credential')) return 'Correo o contraseña incorrectos.';
  if (m.includes('not confirmed')) return 'Tienes que confirmar el correo antes de entrar.';
  if (m.includes('rate') || m.includes('too many') || m.includes('security purposes')) return 'Demasiados intentos seguidos. Espera un minuto.';
  if (m.includes('invalid') && m.includes('email')) return 'Ese correo no parece válido.';
  if (m.includes('already') && m.includes('registered')) return 'Ya hay una cuenta con ese correo. Entra con él.';
  if (m.includes('password') && (m.includes('at least') || m.includes('weak'))) return 'La contraseña tiene que tener al menos 8 caracteres.';
  if (m.includes('same') && m.includes('password')) return 'La nueva contraseña tiene que ser distinta de la anterior.';
  if (m.includes('fetch') || m.includes('network')) return 'No hay conexión con el servidor de cuentas.';
  return (e && e.message) || 'Algo ha fallado. Prueba otra vez.';
}
/* Adonde vuelven los enlaces del correo y el inicio con Google/Apple: esta misma página.
   Tiene que estar en Redirect URLs de Supabase (Authentication → URL Configuration). */
const WEB_VUELTA = () => /^https?:$/.test(location.protocol) && !/^(localhost|127\.)/.test(location.hostname) ? location.origin + location.pathname : 'https://puntostudio.es/punto-duerme/beta/';
let LOGIN = { modo: 'entrar', email: '' };
export function loginSheet(modo) {
  if (modo) LOGIN.modo = modo;
  const crear = LOGIN.modo === 'crear';
  sheet(`<h3>Tu cuenta</h3><p>Es la misma en todos los juegos de Punto Studio. Sirve para jugar con tu nombre y tu personaje; para jugar no hace falta.</p>
    <div class="pestanas" role="tablist"><button type="button" role="tab" aria-selected="${!crear}" class="${crear ? '' : 'on'}" id="lgTabE">Entrar</button><button type="button" role="tab" aria-selected="${crear}" class="${crear ? 'on' : ''}" id="lgTabC">Crear cuenta</button></div>
    ${APPLE ? `<button class="act apple" id="lgA">${APPLE_LOGO}<span>${crear ? 'Registrarme con Apple' : 'Iniciar sesión con Apple'}</span></button>` : ''}
    ${GOOGLE ? `<button class="act google" id="lgG">${G_LOGO}<span>${crear ? 'Registrarme con Google' : 'Entrar con Google'}</span></button>` : ''}
    ${(APPLE || GOOGLE) ? '<p class="tiny" style="margin:14px 0 4px">o con tu correo</p>' : ''}
    <input class="field" id="lgMail" type="email" autocomplete="${crear ? 'email' : 'username'}" inputmode="email" placeholder="Correo" autocapitalize="off" spellcheck="false" value="${esc(LOGIN.email)}">
    <input class="field" id="lgPass" type="password" autocomplete="${crear ? 'new-password' : 'current-password'}" placeholder="${crear ? 'Contraseña (mínimo 8 caracteres)' : 'Contraseña'}">
    <p class="err" id="lgErr" role="alert"></p><p class="ok" id="lgOk" role="status"></p>
    <button class="act" id="lgGo">${crear ? 'Crear cuenta' : 'Entrar'}</button>
    ${crear ? '' : '<button class="link" id="lgOlvido">He olvidado la contraseña</button>'}
    <button class="link" id="lgNo">Ahora no</button>
    ${crear ? '<p class="fine">Al crear una cuenta (mínimo 14 años) aceptas los <a href="terminos.html" target="_blank" rel="noopener">términos</a> y la <a href="/privacidad/" target="_blank" rel="noopener">política de privacidad</a>.</p>' : ''}`, () => {
    $('lgNo').onclick = closeSheet;
    $('lgMail').addEventListener('input', () => { LOGIN.email = $('lgMail').value.trim() });
    $('lgTabE').onclick = () => { if (crear) loginSheet('entrar') };
    $('lgTabC').onclick = () => { if (!crear) loginSheet('crear') };
    const err = t => { $('lgOk').textContent = ''; $('lgErr').textContent = t };
    const go = async () => {
      const email = $('lgMail').value.trim(), password = $('lgPass').value; LOGIN.email = email;
      if (!email || !password) { err(crear ? 'Escribe tu correo y una contraseña.' : 'Escribe tu correo y tu contraseña.'); return }
      if (crear && password.length < 8) { err('La contraseña tiene que tener al menos 8 caracteres.'); return }
      $('lgGo').disabled = true; err('');
      try {
        const sb = await loadSB();
        if (crear) {
          const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: WEB_VUELTA() } });
          if (error) throw error;
          if (!data.session) {
            LOGIN.modo = 'entrar'; loginSheet();
            $('lgOk').textContent = 'Cuenta creada. Te hemos mandado un correo para confirmarla: ábrelo y vuelve aquí para entrar.';
            return;
          }
          closeSheet(); toast('Cuenta creada');
        } else {
          const { error } = await sb.auth.signInWithPassword({ email, password });
          if (error) throw error; closeSheet(); toast('Sesión iniciada');
        }
      } catch (e) { err(errorCuenta(e)); $('lgGo').disabled = false }
    };
    $('lgGo').onclick = go; $('lgPass').addEventListener('keydown', e => { if (e.key === 'Enter') go() });
    if ($('lgOlvido')) $('lgOlvido').onclick = async () => {
      const email = $('lgMail').value.trim(); if (!email) { err('Escribe primero tu correo.'); return }
      $('lgOlvido').disabled = true; err('');
      try {
        const sb = await loadSB(); const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: WEB_VUELTA() }); if (error) throw error;
        $('lgOk').textContent = 'Si hay una cuenta con ese correo, te llegará un enlace para poner una contraseña nueva.'
      }
      catch (e) { err(errorCuenta(e)) }
      $('lgOlvido').disabled = false;
    };
    const oauth = provider => async () => {
      try {
        const sb = await loadSB(); const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin + location.pathname } });
        if (error) throw error;
      } catch (e) { err(errorCuenta(e)) }
    };
    if ($('lgG')) $('lgG').onclick = oauth('google');
    if ($('lgA')) $('lgA').onclick = oauth('apple');
  });
}
function nuevaClaveSheet() {
  if (EDIT) cerrarEditor();
  sheet(`<h3>Nueva contraseña</h3><p>Escribe la contraseña que quieres usar a partir de ahora.</p>
    <input class="field" id="ncPass" type="password" autocomplete="new-password" placeholder="Mínimo 8 caracteres">
    <p class="err" id="ncErr" role="alert"></p>
    <button class="act" id="ncGo">Guardar contraseña</button><button class="link" id="ncNo">Ahora no</button>`, () => {
    $('ncNo').onclick = closeSheet;
    $('ncGo').onclick = async () => {
      const pw = $('ncPass').value; if (pw.length < 8) { $('ncErr').textContent = 'Mínimo 8 caracteres.'; return }
      $('ncGo').disabled = true;
      try { const sb = await loadSB(); const { error } = await sb.auth.updateUser({ password: pw }); if (error) throw error; closeSheet(); toast('Contraseña cambiada') }
      catch (e) { $('ncErr').textContent = errorCuenta(e); $('ncGo').disabled = false }
    };
  });
}
function logoutSheet() {
  sheet(`<h3>¿Salir de tu cuenta?</h3><p>Los juegos de Punto Studio comparten la sesión en este navegador: también saldrás de los demás. Podrás jugar igual, con el nombre escrito.</p>
    <button class="act" id="loYes">Salir</button><button class="link" id="loNo">Cancelar</button>`, () => {
    $('loNo').onclick = cuentaMenuSheet;
    $('loYes').onclick = async () => { closeSheet(); try { const sb = await loadSB(); await sb.auth.signOut({ scope: 'local' }) } catch (e) { } };
  });
}
export function cuentaMenuSheet() {
  if (!USER) return loginSheet();
  sheet(`<div class="acct-head">${avImg(miLook())}<b></b></div>
    <button class="menuitem" id="acEdit">Editar personaje y nombre</button>
    <button class="menuitem" id="acOut">Cerrar sesión</button>
    <a class="menuitem" href="/privacidad/" target="_blank" rel="noopener" style="text-decoration:none;text-align:center">Política de privacidad</a>
    <a class="menuitem" href="terminos.html" target="_blank" rel="noopener" style="text-decoration:none;text-align:center">Términos y condiciones</a>
    <div class="menusep"><button class="menuitem danger" id="acDel">Eliminar cuenta</button></div>
    <button class="link" id="acClose">Cerrar</button>`, () => {
    const b = $('sheet').querySelector('.acct-head b'); if (b) b.textContent = (PERFIL && PERFIL.name) || 'Sin nombre';
    $('acClose').onclick = closeSheet;
    $('acEdit').onclick = () => abrirEditor(false);
    $('acOut').onclick = logoutSheet;
    $('acDel').onclick = deleteAccountSheet;
  });
}

/* ---------- Editor de personaje y nombre (el de Punto Ciego, con el personaje 3D) ---------- */
let EDIT = null, PJ_CARGA = null; const EDIT_AVISO = new Set();
function cargaPJ() {
  if (window.PJ) return Promise.resolve(window.PJ);
  if (PJ_CARGA) return PJ_CARGA;
  return PJ_CARGA = new Promise(ok => {
    const e = document.createElement('script'); e.src = 'assets/personaje3d.js?v=6';
    e.onload = () => ok(window.PJ || null); e.onerror = () => { PJ_CARGA = null; ok(null) };
    document.head.appendChild(e);
  });
}
const lkDe = l => [COLORES[l.hood][1], ROPA[l.cloth][1] || '', GUANTES[l.glove][1] || '', OJOS[l.eye][1] || ''].map(x => x.replace('#', '')).join('|') + '|' + l.pat + '|' + (colorPieza(l.pants, l.cloth) || '').replace('#', '') + '|' + (colorPieza(l.pack, l.cloth) || '').replace('#', '') + '|' + patPantalon(l) + '|' + (colorZapato(l) || '').replace('#', '');
function miraSVG() {
  const R = 92, c = 105, arc = (a0, a1, col) => { const r = a => (a - 90) * Math.PI / 180, x = a => c + R * Math.cos(r(a)), y = a => c + R * Math.sin(r(a)); return `<path d="M${x(a0).toFixed(1)} ${y(a0).toFixed(1)} A${R} ${R} 0 0 1 ${x(a1).toFixed(1)} ${y(a1).toFixed(1)}" stroke="${col}" stroke-width="9" fill="none"/>` };
  return `<svg class="mira" viewBox="0 0 210 210" aria-hidden="true">${arc(8, 82, 'var(--red)')}${arc(98, 172, 'var(--red)')}${arc(188, 262, 'currentColor')}${arc(278, 352, 'currentColor')}<path d="M105 0v22M105 188v22M0 105h22M188 105h22" stroke="currentColor" stroke-width="7"/></svg>`;
}
const PAT_T = ['—', '≡', '▦', '◍'];
function edFila(t, k, lista, sw) {
  const l = EDIT.look;
  return `<div class="ed-fila"><p class="lbl">${esc(t)}: <b>${esc(sw(l[k]).n)}</b></p><div class="swatches">${lista.map((_, i) => { const x = sw(i); return `<button type="button" class="sw${l[k] === i ? ' on' : ''}" data-ed="${k}" data-v="${i}" aria-label="${esc(x.n)}" aria-pressed="${l[k] === i}" style="--c:${x.c}">${x.t || ''}</button>` }).join('')}</div></div>`;
}
function edFilasHTML() {
  const l = EDIT.look;
  return edFila('Capucha', 'hood', COLORES, i => ({ n: COLORES[i][0], c: COLORES[i][1] }))
    + edFila('Sudadera', 'cloth', ROPA, i => ({ n: ROPA[i][0], c: ROPA[i][1] || '#141416' }))
    + edFila('Estampado de la sudadera', 'pat', ESTAMPADOS, i => ({ n: ESTAMPADOS[i], c: '#222226', t: PAT_T[i] }))
    + edFila('Pantalón', 'pants', PIEZAS, i => i ? { n: PIEZAS[i][0], c: PIEZAS[i][1] || '#141416' } : { n: PIEZAS[0][0], c: ROPA[l.cloth][1] || '#141416', t: '=' })
    + edFila('Estampado del pantalón', 'pantsPat', ESTAMPADOS_P, i => i ? { n: ESTAMPADOS[i - 1], c: '#222226', t: PAT_T[i - 1] } : { n: ESTAMPADOS_P[0], c: '#222226', t: '=' })
    + edFila('Zapatillas', 'shoes', ZAPATOS, i => i ? { n: ZAPATOS[i][0], c: ZAPATOS[i][1] || '#141416' } : { n: ZAPATOS[0][0], c: colorPieza(l.pants, l.cloth) || '#141416', t: '=' })
    + edFila('Mochila', 'pack', PIEZAS, i => i ? { n: PIEZAS[i][0], c: PIEZAS[i][1] || '#141416' } : { n: PIEZAS[0][0], c: ROPA[l.cloth][1] || '#141416', t: '=' })
    + '<p class="ed-nota">La mochila (con sus asas) y las zapatillas son siempre lisas.</p>'
    + edFila('Guantes', 'glove', GUANTES, i => ({ n: GUANTES[i][0], c: GUANTES[i][1] || '#F1ECE3' }))
    + edFila('Ojos', 'eye', OJOS, i => ({ n: OJOS[i][0], c: OJOS[i][1] || '#F1ECE3' }));
}
function edVistaHTML() {
  const pj = window.PJ;
  if (pj && pj.estado === 'fallo') return `${miraSVG()}<img class="av ed-2d" src="${avSrc(EDIT.look)}" alt="Tu personaje">`;
  return `${miraSVG()}<div class="v3d" role="img" aria-label="Vista previa de tu personaje. Arrástralo para girarlo." style="width:150px;height:196px"><img class="ph av" src="${avSrc(EDIT.look)}" alt=""><canvas data-v="editor" data-w="150" data-h="196" data-lk="${lkDe(EDIT.look)}" data-anim="reposo" data-drag="1" tabindex="0" data-yaw=".35"></canvas></div>`;
}
function edPintaVista() {
  const v = $('edVista'); if (!v) return;
  v.innerHTML = edVistaHTML();
  const pj = window.PJ; $('edTip').hidden = !pj || pj.estado === 'fallo';
  if (pj && pj.estado !== 'fallo') pj.aplica();
}
function edActualiza(k) {
  $('edFilas').innerHTML = edFilasHTML();
  const pj = window.PJ, cv = $('edVista').querySelector('canvas[data-v]');
  if (cv && pj && pj.estado !== 'fallo') { cv.dataset.lk = lkDe(EDIT.look); pj.aplica(); pj.giraA('editor', k === 'pack' ? Math.PI : null) }
  const ph = $('edVista').querySelector('img'); if (ph) ph.src = avSrc(EDIT.look);
}
async function abrirEditor(nuevo) {
  closeSheet();
  let raw = (PERFIL && PERFIL.look) || {}, name = (PERFIL && PERFIL.name) || (nuevo ? cleanName(lsGet('nombre', '') || '') : '');
  EDIT = { name, raw, look: limpiaLook(raw), nuevo: !!nuevo, cargando: true };
  const ed = $('editor');
  $('edTit').textContent = nuevo ? 'Crea tu personaje' : 'Tu personaje';
  $('edSub').textContent = nuevo ? 'Así te verán los demás en las partidas. Se guarda en tu cuenta y es el mismo en todos los juegos de Punto Studio.' : 'Se guarda en tu cuenta y es el mismo en todos los juegos de Punto Studio.';
  $('edGuardar').textContent = nuevo ? 'Guardar y continuar' : 'Guardar cambios';
  $('edCancelar').textContent = nuevo ? 'Ahora no' : 'Cancelar';
  $('edNom').value = name; $('edErr').textContent = ''; $('edGuardar').disabled = false;
  $('edFilas').innerHTML = edFilasHTML();
  ed.hidden = false; ed.scrollTop = 0; document.body.classList.add('ed-on');
  edPintaVista();
  cargaPJ().then(pj => {
    if (!EDIT) return;
    if (!pj) { $('edTip').hidden = true; return }
    pj.onCambio = () => { if (EDIT) edPintaVista() };
    edPintaVista();
  });
  /* el perfil de la nube manda (puede haber cambiado en otro juego) */
  try {
    const sb = await loadSB();
    const { data, error } = await sb.from('profiles').select('username,look').eq('id', USER.id).maybeSingle();
    if (error) throw error;
    if (data && EDIT && EDIT.cargando) {
      EDIT.raw = data.look || {}; EDIT.look = limpiaLook(EDIT.raw);
      const nomEl = $('edNom'); if (nomEl && nomEl.value === name) { EDIT.name = data.username || ''; nomEl.value = EDIT.name }
      edActualiza();
    }
  } catch (e) { }
  if (EDIT) EDIT.cargando = false;
}
function cerrarEditor() {
  EDIT = null; $('editor').hidden = true; document.body.classList.remove('ed-on');
  const cv = $('edVista').querySelector('canvas'); if (cv) cv.remove();
  if (window.PJ && window.PJ.estado !== 'fallo') window.PJ.aplica();
}
function editorSalir() {
  if (!EDIT) return;
  const base = PERFIL ? { name: PERFIL.name || '', look: limpiaLook(PERFIL.look) } : { name: '', look: limpiaLook({}) };
  const n = ($('edNom').value || '').trim();
  if (n === base.name && JSON.stringify(EDIT.look) === JSON.stringify(base.look)) return cerrarEditor();
  sheet(`<h3>¿Salir sin guardar?</h3><p>Se perderán los cambios que has hecho en tu personaje.</p>
    <button class="act danger" id="edSalirSi">Salir sin guardar</button><button class="link" id="edSalirNo">Seguir editando</button>`, () => {
    $('edSalirNo').onclick = closeSheet;
    $('edSalirSi').onclick = () => { closeSheet(); cerrarEditor() };
  });
}
async function guardarPersonaje() {
  if (!EDIT || !USER) return;
  const nomEl = $('edNom'), n = (nomEl.value || '').trim().slice(0, 16);
  if (!n) { $('edErr').textContent = 'Escribe un nombre de jugador.'; nomEl.focus(); return }
  $('edGuardar').disabled = true; $('edErr').textContent = '';
  const look = { ...EDIT.raw, ...limpiaLook(EDIT.look) };
  try {
    const sb = await loadSB();
    const { error } = await sb.from('profiles').upsert({ id: USER.id, username: n, look, updated_at: new Date().toISOString() });
    if (error) throw error;
  } catch (e) {
    $('edErr').textContent = (e && e.code === '23505') ? 'Ese nombre ya lo usa otra persona. Elige otro.' : errorCuenta(e);
    $('edGuardar').disabled = false; return;
  }
  PERFIL = { name: n, look: limpiaLook(look) }; lsSet('perfil-' + USER.id, PERFIL); lsSet('nombre', n);
  cerrarEditor();
  renderAcct(); ganchos.alGuardar && ganchos.alGuardar(); repinta();
  toast('Personaje guardado');
}

/* ---------- Eliminar cuenta (la misma función de Supabase que los otros juegos) ---------- */
async function borrarCuentaRemota(sb) {
  try {
    const { data, error } = await sb.functions.invoke('eliminar-cuenta', { body: {} });
    if (!error && data && data.ok) return;
  } catch (e) { }
  const { error: rpcErr } = await sb.rpc('eliminar_mi_cuenta');
  if (rpcErr) throw rpcErr;
}
function guardaTokenApple(sb, ses) {
  try {
    if (!ses || !ses.provider_refresh_token || !ses.user || !ses.user.app_metadata || ses.user.app_metadata.provider !== 'apple') return;
    sb.rpc('guardar_token_apple', { p_token: ses.provider_refresh_token, p_origen: 'web' }).then(() => { }, () => { });
  } catch (e) { }
}
function deleteAccountSheet() {
  sheet(`<h3>Eliminar tu cuenta</h3>
    <p>Es la misma cuenta que usas en <b>Punto Falso</b> y <b>Punto Ciego</b>: al eliminarla se borra también allí, con tu personaje, tu nombre y tus estadísticas.</p>
    <p><b>No se puede deshacer.</b></p>
    <button class="act danger" id="delGo">Eliminar cuenta</button>
    <button class="link" id="delNo">Cancelar</button>`, () => {
    $('delNo').onclick = cuentaMenuSheet;
    $('delGo').onclick = deleteAccountConfirmSheet;
  });
}
function deleteAccountConfirmSheet() {
  const porEmail = !!(USER && USER.app_metadata && USER.app_metadata.provider === 'email');
  const proveedor = USER && USER.app_metadata && USER.app_metadata.provider === 'apple' ? 'Apple' : 'Google';
  sheet(`<h3>Confirma que eres tú</h3>
    ${porEmail ? `<label class="lbl" for="delPass">Tu contraseña</label><input class="field" id="delPass" type="password" autocomplete="current-password" placeholder="Contraseña">`
      : `<p>Entraste con ${proveedor}, así que aquí no tienes contraseña: escribe <b>BORRAR</b> para confirmar.</p><input class="field" id="delWord" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="BORRAR">`}
    <p class="err" id="delErr" role="alert"></p>
    <button class="act danger" id="delFinal">Eliminar cuenta para siempre</button>
    <button class="link" id="delNo2">Cancelar</button>`, () => {
    $('delNo2').onclick = cuentaMenuSheet;
    $('delFinal').onclick = async () => {
      $('delErr').textContent = '';
      if (!porEmail) {
        const w = (($('delWord').value) || '').trim().toUpperCase();
        if (w !== 'BORRAR') { $('delErr').textContent = 'Escribe BORRAR (en mayúsculas) para confirmar.'; return }
      }
      $('delFinal').disabled = true;
      try {
        const sb = await loadSB();
        if (porEmail) {
          const pass = $('delPass').value;
          if (!pass) { $('delErr').textContent = 'Escribe tu contraseña.'; $('delFinal').disabled = false; return }
          const { error } = await sb.auth.signInWithPassword({ email: USER.email, password: pass });
          if (error) throw error;
        }
        await borrarCuentaRemota(sb);
        ganchos.alBorrar && await ganchos.alBorrar();
        const uid = USER.id;
        try { await sb.auth.signOut({ scope: 'local' }) } catch (e) { }
        lsDel('perfil-' + uid); USER = null; PERFIL = null;
        closeSheet(); renderAcct(); repinta();
        toast('Cuenta eliminada');
      } catch (e) { $('delErr').textContent = errorCuenta(e); $('delFinal').disabled = false }
    };
  });
}

export async function iniciaCuentas() {
  $('edFilas').addEventListener('click', e => {
    const b = e.target.closest('.sw'); if (!b || !EDIT) return;
    EDIT.look = { ...EDIT.look, [b.dataset.ed]: +b.dataset.v }; EDIT.cargando = false;
    edActualiza(b.dataset.ed);
  });
  $('edNom').addEventListener('input', () => { if (EDIT) { EDIT.name = $('edNom').value; EDIT.cargando = false } });
  $('edVolver').onclick = editorSalir;
  $('edCancelar').onclick = editorSalir;
  $('edGuardar').onclick = guardarPersonaje;
  renderAcct();
  try {
    const sb = await loadSB();
    sb.auth.onAuthStateChange((ev, ses) => { guardaTokenApple(sb, ses); setTimeout(() => { trasSesion(ses); if (ev === 'PASSWORD_RECOVERY') nuevaClaveSheet() }, 0) });
    const { data } = await sb.auth.getSession();
    await trasSesion(data.session);
    fetch(SUPA.url + '/auth/v1/settings', { headers: { apikey: SUPA.key } }).then(r => r.json()).then(j => { if (j && j.external) { if (j.external.google) GOOGLE = true; if (j.external.apple) APPLE = true } }).catch(() => { });
  } catch (e) { console.warn('cuentas', e) }
}
async function trasSesion(ses) {
  const u = ses && ses.user ? ses.user : null;
  if ((u ? u.id : '') === (USER ? USER.id : '') && (!u || PERFIL)) { USER = u; return }
  USER = u;
  if (!u) { PERFIL = null; renderAcct(); repinta(); return }
  const key = 'perfil-' + u.id;
  try {
    const sb = await loadSB();
    const { data, error } = await sb.from('profiles').select('username,look').eq('id', u.id).maybeSingle();
    if (error) throw error;
    PERFIL = data ? { name: data.username || '', look: limpiaLook(data.look) } : { name: '', look: limpiaLook({}) };
    lsSet(key, PERFIL);
    /* cuenta recién creada (o sin personaje todavía): se abre el editor una vez para crearlo aquí mismo */
    if (!PERFIL.name && !EDIT_AVISO.has(u.id)) { EDIT_AVISO.add(u.id); setTimeout(() => { if (USER && USER.id === u.id && !EDIT && !(PERFIL && PERFIL.name)) abrirEditor(true) }, 300) }
  } catch (e) { console.warn('perfil', e); const c = lsGet(key); PERFIL = c ? { name: c.name, look: limpiaLook(c.look) } : { name: '', look: limpiaLook({}) } }
  renderAcct(); ganchos.alGuardar && ganchos.alGuardar(); repinta();
}
