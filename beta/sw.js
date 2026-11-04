/* Punto Duerme (beta): red primero (para recibir siempre lo último publicado) y caché como respaldo.
   Al publicar cambios, sube VERSION: el móvil descarga el sw.js nuevo y borra las cachés viejas. */
const VERSION = '4';
const CACHE = 'punto-duerme-beta-v' + VERSION;
const SHELL = ['./', 'index.html', 'manifest.json', 'css/estilo.css', 'js/app.js', 'js/util.js', 'js/red.js', 'js/estado.js', 'js/sala.js', 'js/partida.js',
  'js/roles.js', 'js/narrador.js', 'js/textos-narrador.js', 'js/sonido.js', 'js/cuenta.js', 'js/cabeza.js', 'js/pruebas.js', 'js/solo.js', 'audio/noche.wav', 'audio/amanecer.wav', 'audio/muerte.wav', 'audio/votacion.wav', 'audio/eliminado.wav', 'audio/tic.wav', 'audio/victoria-ciegos.wav', 'audio/victoria-puntos.wav', 'vendor/qrcode/qrcode.js',
  'vendor/supabase-js/supabase.js', 'fonts/outfit-latin.woff2', 'img/logo.svg', 'icons/favicon-32.png', 'icons/icon-192.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => { })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)) }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./')))
  );
});
