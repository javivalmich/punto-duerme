/* Genera los iconos de la app (beta/icons/*.png) a partir de beta/img/icono.png (mascota + luna, sin texto).
   Uso: npm i --no-save sharp  &&  node scripts/iconos.mjs
   Cuando cambie el icono: sustituye beta/img/icono.png (cuadrado, fondo negro) y vuelve a ejecutarlo.
   El dibujo se recorta a su contenido y se centra para que la luna y la mascota llenen el icono y se lean en pequeño. */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../beta/img/icono.png', import.meta.url));
const OUT = fileURLToPath(new URL('../beta/icons/', import.meta.url));
const FONDO = '#000000'; /* negro del icono */
mkdirSync(OUT, { recursive: true });

/* contenido recortado y hecho cuadrado (con el fondo negro) */
const recorte = await (async () => {
  const { data, info } = await sharp(SRC).trim({ background: FONDO, threshold: 28 }).toBuffer({ resolveWithObject: true });
  const lado = Math.max(info.width, info.height);
  return sharp(data).extend({
    top: Math.floor((lado - info.height) / 2), bottom: Math.ceil((lado - info.height) / 2),
    left: Math.floor((lado - info.width) / 2), right: Math.ceil((lado - info.width) / 2), background: FONDO
  }).png().toBuffer();
})();

/* el dibujo ocupa `llena` del lado del icono; el resto es margen negro */
async function icono(nombre, n, llena) {
  const m = Math.round(n * llena);
  const dib = await sharp(recorte).resize(m, m).png().toBuffer();
  await sharp({ create: { width: n, height: n, channels: 3, background: FONDO } })
    .composite([{ input: dib, left: Math.round((n - m) / 2), top: Math.round((n - m) / 2) }]).png().toFile(OUT + nombre);
}
for (const [nombre, n] of [['favicon-32.png', 32], ['favicon-64.png', 64], ['icon-192.png', 192], ['icon-512.png', 512]]) await icono(nombre, n, .94);
await icono('icon-maskable-192.png', 192, .78); /* zona segura de los iconos «maskable» */
await icono('icon-maskable-512.png', 512, .78);
await icono('apple-touch-icon.png', 180, .94);
console.log('Iconos generados en beta/icons/');
