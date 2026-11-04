/* Utilidades comunes: DOM, almacenamiento local, hojas y avisos. */

export const $ = id => document.getElementById(id);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const EN_LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
export const QS = new URLSearchParams(location.search);

/* En local, ?yo=2 da a esta pestaña su propio jugador: así se simulan varios móviles en un mismo navegador */
const SUF = EN_LOCAL && QS.get('yo') ? '-' + QS.get('yo').replace(/\W/g, '') : '';
export const lsGet = (k, d) => { try { const v = localStorage.getItem('duerme-' + k + SUF); return v == null ? d : JSON.parse(v) } catch (e) { return d } };
export const lsSet = (k, v) => { try { localStorage.setItem('duerme-' + k + SUF, JSON.stringify(v)) } catch (e) { } };
export const lsDel = k => { try { localStorage.removeItem('duerme-' + k + SUF) } catch (e) { } };

export function cleanName(x) { return String(x || '').replace(/[~#<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16) }
export const plural = (n, s, p) => n === 1 ? s : p;
export function listaNombres(a) { return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1] }

/* Cualquier módulo puede pedir que se vuelva a pintar todo (p. ej. al cargar los avatares o la sesión) */
export const repinta = () => document.dispatchEvent(new Event('repinta'));

export function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id));
  window.scrollTo(0, 0);
}
export const pantalla = () => (document.querySelector('.screen.on') || {}).id;

let toastT = 0;
export function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600);
}
export function sheet(html, bind) {
  $('sheet').innerHTML = html; $('overlay').classList.add('on'); bind && bind();
  const f = $('sheet').querySelector('button,input'); if (f && f.tagName === 'INPUT') f.focus();
}
export function closeSheet() { $('overlay').classList.remove('on') }

/* Efecto al pulsar (como en Punto Falso: en iOS :active no siempre se aplica con el dedo) */
document.addEventListener('pointerdown', e => {
  const b = e.target.closest('button'); if (!b) return;
  b.classList.add('prs'); const fuera = () => { b.classList.remove('prs'); window.removeEventListener('pointerup', fuera); window.removeEventListener('pointercancel', fuera) };
  window.addEventListener('pointerup', fuera); window.addEventListener('pointercancel', fuera);
});
