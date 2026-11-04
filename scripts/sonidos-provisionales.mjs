// Genera sonidos provisionales muy simples (tonos sintetizados) en beta/audio/.
// Son de relleno: se sustituirán por los definitivos. Uso: node scripts/sonidos-provisionales.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 22050;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'beta', 'audio');
mkdirSync(OUT, { recursive: true });

// notas: [frecuencia Hz (0 = silencio), duración s, volumen 0..1]
function wav(notas, forma = 'sine') {
  const muestras = [];
  for (const [f, d, vol = .5] of notas) {
    const n = Math.round(d * SR);
    for (let i = 0; i < n; i++) {
      const t = i / SR, env = Math.min(1, i / (SR * .01)) * Math.min(1, (n - i) / (SR * .04));
      let x = 0;
      if (f) {
        const ph = 2 * Math.PI * f * t;
        x = forma === 'square' ? Math.sign(Math.sin(ph)) * .5 : forma === 'tri' ? (2 / Math.PI) * Math.asin(Math.sin(ph)) : Math.sin(ph);
      }
      muestras.push(x * vol * env);
    }
  }
  const datos = Buffer.alloc(muestras.length * 2);
  muestras.forEach((m, i) => datos.writeInt16LE(Math.round(Math.max(-1, Math.min(1, m)) * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + datos.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(datos.length, 40);
  return Buffer.concat([h, datos]);
}

const S = {
  noche: wav([[392, .35, .35], [330, .35, .35], [262, .7, .35]], 'tri'),
  amanecer: wav([[262, .25, .35], [330, .25, .35], [392, .25, .35], [523, .6, .35]], 'tri'),
  muerte: wav([[196, .3, .45], [0, .08], [185, .7, .45]], 'tri'),
  votacion: wav([[523, .12, .3], [0, .06], [523, .12, .3], [0, .06], [659, .3, .3]], 'square'),
  eliminado: wav([[440, .2, .35], [349, .2, .35], [262, .5, .35]], 'square'),
  tic: wav([[1000, .05, .25]], 'square'),
  'victoria-ciegos': wav([[392, .15, .35], [523, .15, .35], [659, .15, .35], [784, .6, .35]], 'tri'),
  'victoria-puntos': wav([[220, .2, .4], [233, .2, .4], [220, .2, .4], [175, .8, .4]], 'square')
};
for (const [n, b] of Object.entries(S)) writeFileSync(join(OUT, n + '.wav'), b);
console.log('Sonidos provisionales en', OUT, Object.keys(S).join(', '));
