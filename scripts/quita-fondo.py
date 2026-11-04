"""Convierte un PNG con fondo blanco aplanado en PNG con fondo transparente (los logos llegaron sin canal alfa).
Uso: python scripts/quita-fondo.py entrada.png salida.png [--texto-y N --semillas x,y x,y ...]
 1) Fondo = blanco (>=246) conectado con el borde (así la capucha blanca, que no tiene contorno, se conserva).
 2) Con --texto-y: en la zona de texto (y >= N) también es fondo todo lo claro encerrado entre letras (huecos de la D, la U…)
    salvo las caras de las letras: se conservan las zonas claras que contienen alguna de las --semillas (puntos dentro de cada letra).
Suaviza el filo con un desenfoque mínimo."""
import sys, numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi
args = sys.argv[1:]; src, dst = args[0], args[1]
ty = int(args[args.index('--texto-y') + 1]) if '--texto-y' in args else None
semillas = [tuple(map(int, s.split(','))) for s in args[args.index('--semillas') + 1:]] if '--semillas' in args else []
a = np.array(Image.open(src).convert('RGB')).astype(float); m = a.min(axis=2)
lab, n = ndi.label(m >= 246)
borde = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
fondo = np.isin(lab, list(borde))
if ty is not None:
    luz = m >= 175; l2, n2 = ndi.label(luz)
    caras = {l2[y, x] for x, y in semillas} - {0}
    zona = np.zeros_like(luz); zona[ty:] = True
    fondo |= zona & luz & ~np.isin(l2, list(caras))
alpha = np.array(Image.fromarray((~fondo * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.8))).astype(float) / 255
alpha = np.clip((alpha - 0.25) / 0.5, 0, 1)
Image.fromarray(np.dstack([a, alpha * 255]).astype('uint8'), 'RGBA').save(dst, optimize=True)
print('hecho', dst)
