"""Genera los audios del narrador (Gemini TTS) en beta/audio/voz/<id>-<n>.mp3.

Uso:   python scripts/voz.py                      genera lo que falta (continúa donde se quedó si se corta)
       python scripts/voz.py --regenerar id-n ... vuelve a generar esas frases aunque existan
       python scripts/voz.py --plan               enseña el orden de las tandas sin gastar cupo
       python scripts/voz.py --lista              solo escribe scripts/voz-lista.md (id, entonación, duración, texto)
Necesita: pip install google-genai lameenc numpy scipy pyloudnorm  ·  GEMINI_API_KEY en el .env de la raíz (nunca en el repo).

Cómo funciona (todo configurable en scripts/voz-config.json):
 - Orden por prioridad (ver «orden de generación») y tandas de 4 frases como máximo (`LOTE_FASE`); indice.json se publica tras cada tanda.
 - Agrupa hasta 4 frases de la MISMA entonación en una sola petición, separadas por párrafos con pausas largas.
 - Corta el audio por los silencios: exige tantos trozos como frases y duraciones razonables; si no cuadra, repite solo ese lote.
 - Paso fijo de masterizado de CADA audio (también los futuros): compresión suave → loudness objetivo (-14 LUFS) → limitador de picos.
 - Respeta el límite gratuito (`peticiones_por_dia`, contadas en scripts/.voz-estado.json) y para limpiamente al agotarlo.
 - beta/audio/voz/indice.json se reescribe SIEMPRE con los audios que existen (tras cada lote y al acabar): la app usa los
   que hay y, para las frases sin ninguna variante grabada, la voz del navegador. Basta ejecutar el script y publicar.
Las frases y su entonación están en beta/js/textos-narrador.js (TEXTOS y TONO)."""
import json, os, re, subprocess, sys, time, datetime
import numpy as np
import lameenc
import pyloudnorm as pyln
from scipy import ndimage as ndi
from google import genai
from google.genai import types

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO = os.path.join(RAIZ, 'beta', 'audio', 'voz')
ESTADO = os.path.join(RAIZ, 'scripts', '.voz-estado.json')
CFG = json.load(open(os.path.join(RAIZ, 'scripts', 'voz-config.json'), encoding='utf-8'))


def clave():
    k = os.environ.get('GEMINI_API_KEY')
    if k: return k
    ruta = os.path.join(RAIZ, '.env')
    if os.path.exists(ruta):
        for l in open(ruta, encoding='utf-8'):
            if l.startswith('GEMINI_API_KEY='): return l.split('=', 1)[1].strip()
    sys.exit('Falta GEMINI_API_KEY en .env')


def frases():
    js = "import('./beta/js/textos-narrador.js').then(m=>console.log(JSON.stringify({T:m.TEXTOS,O:m.TONO})))"
    d = json.loads(subprocess.run(['node', '--input-type=module', '-e', js], cwd=RAIZ, capture_output=True, text=True, check=True).stdout)
    res = []
    for id_, vs in d['T'].items():
        for i, t in enumerate(vs, 1):
            res.append({'id': f'{id_}-{i}', 'base': id_, 'tono': d['O'][id_], 'texto': re.sub(r'\s*\|\s*', ' ', t).strip()})
    return res


# ---------- cuota diaria ----------
def peticiones_hoy():
    hoy = datetime.date.today().isoformat()
    try: e = json.load(open(ESTADO))
    except Exception: e = {}
    return e.get('n', 0) if e.get('dia') == hoy else 0

def estado():
    try: return json.load(open(ESTADO))
    except Exception: return {}

def cuenta_peticion():
    json.dump({**estado(), 'dia': datetime.date.today().isoformat(), 'n': peticiones_hoy() + 1}, open(ESTADO, 'w'))

def marca_rehecha(id_):
    e = estado(); e['rehechas'] = sorted(set(e.get('rehechas', [])) | {id_}); json.dump(e, open(ESTADO, 'w'))


# ---------- orden de generación (por prioridad; el cupo diario es corto) ----------
# 1) una variante de cada frase de la fase 1 que no tiene ninguna  2) segundas variantes de las que solo tienen una
# 3) el resto de variantes  4) fase 2 (cupido, vidente, bruja, amantes) y las sospechosas de estar mal cortadas
SIN_NINGUNA = ['bienvenida', 'amanece_inicio', 'amanece_nadie', 'debate', 'gana_pueblo', 'gana_puntos']
SEGUNDA = ['puntos_abre', 'puntos_cierra', 'sin_votos']
FASE2 = ('cupido_', 'vidente_', 'bruja_', 'amantes_', 'gana_amantes')
SOSPECHOSAS = ['amanece_muerto-3', 'amanece_varios-2', 'eliminado-1', 'votacion-2']
LOTE_FASE = 4   # frases por petición como máximo

def prioridad(f, existen, explicitas):
    b = f['base']
    if f['id'] in explicitas: return 0
    if f['id'] in SOSPECHOSAS or b.startswith(FASE2): return 4
    n = sum(1 for e in existen if e.rsplit('-', 1)[0] == b)
    if b in SIN_NINGUNA and n == 0 and f['id'] == b + '-1': return 1
    if b in SEGUNDA and n == 1 and f['id'] == b + '-2': return 2
    return 3


# ---------- audio ----------
FR = 0.02  # s por trama de análisis

def silencios(x, rate):
    n = int(rate * FR); t = len(x) // n
    rms = np.sqrt((x[:t * n].reshape(t, n) ** 2).mean(axis=1))
    umbral = max(0.003, 0.04 * np.percentile(rms, 95))
    sil = rms < umbral
    runs, i = [], 0
    while i < t:
        if sil[i]:
            j = i
            while j < t and sil[j]: j += 1
            runs.append((i, j)); i = j
        else: i += 1
    return runs, sil, t, n

def cortar(x, rate, textos):
    """Devuelve una lista con un array por frase, o None si el audio no cuadra con las frases."""
    N = len(textos)
    runs, sil, t, n = silencios(x, rate)
    interiores = [(a, b) for a, b in runs if a > 0 and b < t]
    if N > 1:
        if len(interiores) < N - 1: return None, 'faltan pausas'
        largos = sorted(interiores, key=lambda r: r[1] - r[0], reverse=True)
        cortes = sorted(largos[:N - 1])
        corto = min((b - a) * FR for a, b in cortes)
        siguiente = (largos[N - 1][1] - largos[N - 1][0]) * FR if len(largos) > N - 1 else 0
        if corto < 1.2 or corto < 1.15 * siguiente: return None, f'pausas ambiguas (corte más corto {corto:.1f} s, siguiente {siguiente:.1f} s)'
    else:
        cortes = []
    lim = [0] + [(a + b) // 2 for a, b in cortes] + [t]
    trozos = []
    for k in range(N):
        a, b = lim[k], lim[k + 1]
        fr = np.where(~sil[a:b])[0]
        if len(fr) == 0: return None, 'trozo vacío'
        i0 = max(0, (a + fr[0]) * n - int(0.12 * rate)); i1 = min(len(x), (a + fr[-1] + 1) * n + int(0.2 * rate))
        trozos.append(x[i0:i1])
    for tr, tx in zip(trozos, textos):
        dur, pal = len(tr) / rate, len(tx.split())
        if not (0.25 * pal <= dur <= 1.6 * pal + 3): return None, f'duración absurda ({dur:.1f} s para {pal} palabras)'
    return trozos, ''

def masteriza(x, rate):
    """Compresión suave → loudness objetivo → limitador de picos. Paso fijo para todos los audios."""
    x = x.astype(np.float64)
    objetivo, techo = CFG['loudness_lufs'], 10 ** (CFG['techo_pico_db'] / 20)
    env = ndi.uniform_filter1d(np.abs(x), int(rate * 0.05))
    thr = 0.06
    g = np.where(env > thr, (thr / np.maximum(env, 1e-6)) ** 0.6, 1.0)   # ratio ≈ 2,5:1 sobre -24 dBFS
    x = x * ndi.uniform_filter1d(g, int(rate * 0.03))
    medidor = pyln.Meter(rate)
    for _ in range(4):
        x = x * 10 ** ((objetivo - medidor.integrated_loudness(x)) / 20)
        # limitador: baja la ganancia donde el pico pasaría del techo (con anticipación de 5 ms) y la suaviza
        red = np.minimum(1.0, techo / np.maximum(np.abs(x), 1e-9))
        red = ndi.minimum_filter1d(red, int(rate * 0.005) * 2 + 1)
        x = x * ndi.uniform_filter1d(red, int(rate * 0.004))
        if abs(medidor.integrated_loudness(x) - objetivo) < 0.6: break
    return np.clip(x, -techo, techo)

def a_mp3(x, rate):
    e = lameenc.Encoder(); e.set_bit_rate(CFG['bitrate_kbps']); e.set_in_sample_rate(rate); e.set_channels(1); e.set_quality(2)
    return bytes(e.encode((x * 32767).astype('<i2').tobytes()) + e.flush())


# ---------- Gemini ----------
def sintetiza_lote(cli, tono, textos):
    cuerpo = '\n\n'.join(f'«{t}»' for t in textos)
    instr = CFG['instruccion'] + (' ' + CFG['instruccion_lote'] if len(textos) > 1 else '')
    contenido = [types.Content(role='user', parts=[types.Part(
        text=f"## Transcript:\n{instr}\n\n{cuerpo}",
        speech_metadata=types.SpeechMetadata(style=CFG['estilos'][tono]))])]
    conf = types.GenerateContentConfig(
        temperature=CFG['temperature'], response_modalities=['audio'],
        speech_config=types.SpeechConfig(voice_config=types.VoiceConfig(
            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=CFG['voz']))))
    datos = bytearray(); mime = ''
    cuenta_peticion()
    for ch in cli.models.generate_content_stream(model=CFG['modelo'], contents=contenido, config=conf):
        if ch.parts is None: continue
        if ch.parts[0].inline_data and ch.parts[0].inline_data.data:
            datos.extend(ch.parts[0].inline_data.data); mime = ch.parts[0].inline_data.mime_type
    if not datos: raise RuntimeError('sin audio')
    m = re.search(r'rate=(\d+)', mime or ''); rate = int(m.group(1)) if m else 24000
    return np.frombuffer(bytes(datos[:len(datos) // 2 * 2]), dtype='<i2').astype(np.float64) / 32768, rate


# ---------- índice y lista ----------
def archivos(): return sorted(f[:-4] for f in os.listdir(DESTINO) if f.endswith('.mp3'))

def escribe_indice(todas):
    ids = archivos(); completas = all(f['id'] in ids for f in todas)
    json.dump(ids, open(os.path.join(DESTINO, 'indice.json'), 'w', encoding='utf-8'))
    return completas

def duracion_mp3(ruta): return os.path.getsize(ruta) * 8 / (CFG['bitrate_kbps'] * 1000)

def escribe_lista(todas):
    l = ['# Audios del narrador', '', '| id | entonación | duración | texto |', '|---|---|---|---|']
    for f in todas:
        r = os.path.join(DESTINO, f['id'] + '.mp3')
        l.append(f"| {f['id']} | {f['tono']} | {duracion_mp3(r):.1f} s | {f['texto']} |" if os.path.exists(r) else f"| {f['id']} | {f['tono']} | — pendiente | {f['texto']} |")
    open(os.path.join(RAIZ, 'scripts', 'voz-lista.md'), 'w', encoding='utf-8').write('\n'.join(l) + '\n')
    # duraciones (s) de cada audio: la app las usa para revelar el nombre justo al terminar la frase
    dur = {f['id']: round(duracion_mp3(os.path.join(DESTINO, f['id'] + '.mp3')), 2) for f in todas if os.path.exists(os.path.join(DESTINO, f['id'] + '.mp3'))}
    json.dump(dur, open(os.path.join(DESTINO, 'duraciones.json'), 'w', encoding='utf-8'))


def main():
    a = sys.argv[1:]
    os.makedirs(DESTINO, exist_ok=True)
    todas = frases()
    if '--lista' in a: return escribe_lista(todas)
    regen = set(a[a.index('--regenerar') + 1:]) if '--regenerar' in a else set()
    # frases que ya no existen: se borran sus audios
    ids_validos = {f['id'] for f in todas}
    for id_ in archivos():
        if id_ not in ids_validos: os.remove(os.path.join(DESTINO, id_ + '.mp3')); print('borrado (ya no existe la frase):', id_)
    rehechas = set(estado().get('rehechas', []))
    pend = [f for f in todas if f['id'] in regen or not os.path.exists(os.path.join(DESTINO, f['id'] + '.mp3'))
            or (f['id'] in SOSPECHOSAS and f['id'] not in rehechas)]
    print(f'{len(pend)} audios por generar de {len(todas)}; peticiones de hoy: {peticiones_hoy()}/{CFG["peticiones_por_dia"]}')
    if not pend: escribe_indice(todas); escribe_lista(todas); return print('Nada que hacer.')
    cli = None if '--plan' in a else genai.Client(api_key=clave())
    existen = set(archivos())
    pend.sort(key=lambda f: prioridad(f, existen, regen))
    lotes = []
    for pr in sorted({prioridad(f, existen, regen) for f in pend}):
        for tono in ('hushed', 'tense', 'rich'):
            p = [f for f in pend if f['tono'] == tono and prioridad(f, existen, regen) == pr]
            k = -(-len(p) // LOTE_FASE) if p else 0              # tandas de 4 como máximo, repartidas parejo (6 → 3+3)
            for i in range(k): lotes.append((tono, p[i * len(p) // k:(i + 1) * len(p) // k]))
    if '--plan' in a:
        for i, (tono, lote) in enumerate(lotes, 1): print(i, tono, [f['id'] for f in lote])
        return
    for tono, lote in lotes:
        for intento in range(3):
            if peticiones_hoy() >= CFG['peticiones_por_dia']:
                escribe_indice(todas); escribe_lista(todas)
                return print(f'Límite diario ({CFG["peticiones_por_dia"]} peticiones) alcanzado. Vuelve a ejecutar mañana: continúa donde se quedó.')
            try:
                x, rate = sintetiza_lote(cli, tono, [f['texto'] for f in lote])
                trozos, motivo = cortar(x, rate, [f['texto'] for f in lote])
            except Exception as e:
                msg = str(e)
                if 'PerDay' in msg or 'per day' in msg.lower():
                    escribe_indice(todas); escribe_lista(todas); return print('Cuota diaria de Google agotada: vuelve a ejecutar mañana.')
                if '429' in msg or 'RESOURCE_EXHAUSTED' in msg:
                    m = re.search(r'retry in ([\d.]+)s', msg); w = float(m.group(1)) + 2 if m else 65
                    print(f'  límite de ritmo, espero {w:.0f} s', flush=True); time.sleep(w); continue
                print(f'  error ({tono}): {msg[:200]}', flush=True); time.sleep(5); continue
            if trozos is None:
                print(f'  lote {tono} no cuadra ({motivo}); lo repito', flush=True); time.sleep(CFG['segundos_entre_llamadas']); continue
            for f, tr in zip(lote, trozos):
                open(os.path.join(DESTINO, f['id'] + '.mp3'), 'wb').write(a_mp3(masteriza(tr, rate), rate))
                print(f"  {f['id']} ({tono}) {len(tr) / rate:.1f} s", flush=True)
                if f['id'] in SOSPECHOSAS: marca_rehecha(f['id'])
            break
        else:
            print(f'  me salto este lote ({tono}): {[f["id"] for f in lote]}')
        escribe_indice(todas); escribe_lista(todas)
        time.sleep(CFG['segundos_entre_llamadas'])
    completas = escribe_indice(todas); escribe_lista(todas)
    print('Listo: todos los audios generados.' if completas else 'Faltan audios; vuelve a ejecutar.')


if __name__ == '__main__':
    main()
