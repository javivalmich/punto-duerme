/* Genera los iconos de la app (beta/icons/*.png) a partir de beta/img/logo.svg.
   Uso: npm i --no-save sharp  &&  node scripts/iconos.mjs
   Cuando llegue el logo definitivo: sustituye beta/img/logo.svg (cuadrado, con el fondo incluido) y vuelve a ejecutarlo. */
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SVG = readFileSync(new URL('../beta/img/logo.svg', import.meta.url));
const OUT = new URL('../beta/icons/', import.meta.url);
const FONDO = '#0b1030'; /* fondo de los iconos «maskable» y del apple-touch-icon (el sistema los recorta o redondea) */
mkdirSync(fileURLToPath(OUT), { recursive: true });

const logo = n => sharp(SVG, { density: 384 }).resize(n, n).png().toBuffer();
const guarda = (nombre, buf) => sharp(buf).toFile(fileURLToPath(new URL(nombre, OUT)));

/* normales: el logo tal cual */
for (const [nombre, n] of [['favicon-32.png', 32], ['favicon-64.png', 64], ['icon-192.png', 192], ['icon-512.png', 512]]) await guarda(nombre, await logo(n));

/* con fondo y margen: maskable (zona segura ≈ 80 %) y apple-touch-icon (iOS redondea él mismo) */
async function conFondo(nombre, n, escala) {
  const m = Math.round(n * escala);
  const buf = await sharp({ create: { width: n, height: n, channels: 4, background: FONDO } })
    .composite([{ input: await logo(m), left: Math.round((n - m) / 2), top: Math.round((n - m) / 2) }]).png().toBuffer();
  await guarda(nombre, buf);
}
await conFondo('icon-maskable-192.png', 192, .78);
await conFondo('icon-maskable-512.png', 512, .78);
await conFondo('apple-touch-icon.png', 180, 1);
console.log('Iconos generados en beta/icons/');
