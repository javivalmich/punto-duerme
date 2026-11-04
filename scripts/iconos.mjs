/* Genera los iconos de la app (beta/icons/*.png) a partir de beta/img/emblema.png (mascota + luna, sin texto, fondo transparente).
   Uso: npm i --no-save sharp  &&  node scripts/iconos.mjs
   Los iconos no pueden ser transparentes: el emblema se recorta a su contenido y se coloca sobre un fondo azul noche de la paleta
   (#1a2260 arriba → #0b1030 abajo), llenando el icono para que luna y mascota se lean en pequeño.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../beta/img/emblema.png', import.meta.url));
const OUT = fileURLToPath(new URL('../beta/icons/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const recorte = await sharp(SRC).trim({ threshold: 5 }).toBuffer({ resolveWithObject: true });
const lado = Math.max(recorte.info.width, recorte.info.height);
const cuadrado = await sharp(recorte.data).extend({
  top: Math.floor((lado - recorte.info.height) / 2), bottom: Math.ceil((lado - recorte.info.height) / 2),
  left: Math.floor((lado - recorte.info.width) / 2), right: Math.ceil((lado - recorte.info.width) / 2), background: { r: 0, g: 0, b: 0, alpha: 0 }
}).png().toBuffer();

const fondo = n => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}"><defs><radialGradient id="g" cx="50%" cy="35%" r="80%"><stop offset="0" stop-color="#1a2260"/><stop offset="1" stop-color="#0b1030"/></radialGradient></defs><rect width="${n}" height="${n}" fill="url(#g)"/></svg>`);
/* el dibujo ocupa `llena` del lado; el resto es fondo */
async function icono(nombre, n, llena) {
  const m = Math.round(n * llena);
  const dib = await sharp(cuadrado).resize(m, m).png().toBuffer();
  await sharp(fondo(n)).composite([{ input: dib, left: Math.round((n - m) / 2), top: Math.round((n - m) / 2) }]).flatten({ background: '#0b1030' }).png().toFile(OUT + nombre);
}
for (const [nombre, n] of [['favicon-32.png', 32], ['favicon-64.png', 64], ['icon-192.png', 192], ['icon-512.png', 512]]) await icono(nombre, n, .96);
await icono('icon-maskable-192.png', 192, .78); /* zona segura de los «maskable» */
await icono('icon-maskable-512.png', 512, .78);
await icono('apple-touch-icon.png', 180, .96);
console.log('Iconos generados en beta/icons/');
