/* Punto Duerme · arranque y reparto de pantallas.
   Estructura: estado.js (sincronización), red.js (Supabase), sala.js (portada, crear, unirse, sala de
   espera), partida.js (la partida), narrador.js + textos-narrador.js (voz), sonido.js, cuenta.js (cuenta
   y personaje), roles.js (personajes). Ver CLAUDE.md. */
import { $, QS, show, pantalla, toast, closeSheet, tema } from './util.js';
import { revisaCanal, rpc } from './red.js';
import { E, actualiza, accion, guardaSesion, sesionGuardada, olvida } from './estado.js';
import { avLoad, iniciaCuentas, ganchos, miLook, miNombre } from './cuenta.js';
import { iniciaSala, renderSala, irInicio, abrirUnir, renderInicio, limpiaCodigo } from './sala.js';
import { iniciaPartida, renderJuego, pintaCuentas } from './partida.js';

/* Cada vez que llega una vista nueva (o cambia algo local), se pinta la pantalla que toca */
function render() {
  if (!E.ses || !E.V) { if (pantalla() === 's-home') renderInicio(); return }
  const fase = E.V.sala.fase;
  if (fase === 'sala') { tema('sala'); if (pantalla() !== 's-sala') { closeSheet(); show('s-sala') } renderSala() }
  else { if (pantalla() !== 's-juego') { closeSheet(); show('s-juego') } renderJuego() }
  pidePantallaEncendida();
}
E.render = render;
E.alSalir = msg => { tema('sala'); soltarPantalla(); irInicio(); if (msg) toast(msg) };
document.addEventListener('repinta', render);

/* Si el jugador cambia su personaje o su nombre con la cuenta, se avisa a la sala */
ganchos.alGuardar = () => { if (E.ses) accion('perfil', { p_nombre: miNombre() || null, p_look: miLook() }).catch(() => { }) };
ganchos.alBorrar = async () => { if (E.ses) { const s = E.ses; olvida(); E.alSalir(); try { await rpc('salir', { p_codigo: s.codigo, p_token: s.token }) } catch (e) { } } };

/* Pantalla encendida durante la partida (sobre todo para el móvil del narrador) */
let WL = null;
async function pidePantallaEncendida() {
  try { if (E.ses && navigator.wakeLock && !WL && !document.hidden) { WL = await navigator.wakeLock.request('screen'); WL.addEventListener('release', () => { WL = null }) } } catch (e) { }
}
function soltarPantalla() { try { WL && WL.release() } catch (e) { } WL = null }

/* Al volver a la app: el socket pudo cortarse con el móvil bloqueado. Nadie sale por eso. */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { guardaSesion(); return }
  if (E.ses) { guardaSesion(); revisaCanal(); actualiza(); pidePantallaEncendida() }
  else if (pantalla() === 's-home') renderInicio();
});
window.addEventListener('pagehide', guardaSesion);
setInterval(() => { if (E.ses && !document.hidden) actualiza() }, 15000); /* respaldo por si se pierde algún aviso */
setInterval(() => { if (E.ses && E.V) pintaCuentas() }, 250);

function arranca() {
  iniciaSala(); iniciaPartida(); avLoad(); iniciaCuentas();
  $('overlay').addEventListener('click', e => { if (e.target.id === 'overlay') closeSheet() });
  /* Enlace de sala (?s=CÓDIGO): si ya estoy en esa partida, vuelvo a ella; si no, voy a «Unirme» con el código */
  const c = limpiaCodigo(QS.get('s'));
  if (c) {
    const s = sesionGuardada();
    history.replaceState(null, '', location.pathname + (QS.get('yo') ? '?yo=' + QS.get('yo') : ''));
    if (s && s.codigo === c) { irInicio(); return }
    abrirUnir(c); return;
  }
  irInicio();
}
arranca();

/* Service worker: red primero, caché de respaldo */
if ('serviceWorker' in navigator && !/^(localhost|127\.)/.test(location.hostname)) {
  navigator.serviceWorker.register('sw.js').catch(() => { });
}
