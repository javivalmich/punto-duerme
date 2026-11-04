/* Punto Duerme (beta): red primero (para recibir siempre lo último publicado) y caché como respaldo.
   Al publicar cambios, sube VERSION: el móvil descarga el sw.js nuevo y borra las cachés viejas. */
const VERSION = '11';
const CACHE = 'punto-duerme-beta-v' + VERSION;
const SHELL = ['./', 'index.html', 'manifest.json', 'css/estilo.css', 'js/app.js', 'js/util.js', 'js/red.js', 'js/estado.js', 'js/sala.js', 'js/partida.js',
  'js/roles.js', 'js/narrador.js', 'js/textos-narrador.js', 'js/ambiente.js', 'js/cuenta.js', 'js/cabeza.js', 'js/pruebas.js', 'js/solo.js', 'js/audio.js', 'vendor/qrcode/qrcode.js',
  'vendor/supabase-js/supabase.js', 'fonts/outfit-latin.woff2', 'img/logo.png', 'img/emblema.png', 'icons/favicon-32.png', 'icons/icon-192.png'];
self.addEventListener('install', e => {
  /* la app y, además, todos los audios del narrador (audio/voz/indice.json): así en el modo de un solo móvil sin conexión suena la voz buena */
  const voz = c => fetch('audio/voz/indice.json', { cache: 'reload' }).then(r => r.ok ? r.json() : []).catch(() => [])
    .then(ids => Promise.all([...ids.map(id => 'audio/voz/' + id + '.mp3'), 'audio/voz/indice.json'].map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => { }))));
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => { }))).then(() => voz(c))).then(() => self.skipWaiting()));
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
