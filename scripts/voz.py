"""Genera los audios del narrador (Gemini TTS) en beta/audio/voz/<id>-<n>.mp3 y el índice indice.json.
Uso:   python scripts/voz.py                  genera lo que falta (puede cortarse y continuar: salta lo ya hecho)
       python scripts/voz.py --solo bienvenida-1      solo esa frase
       python scripts/voz.py --incluir-espera         incluye las frases marcadas «en_espera» en voz-config.json
       python scripts/voz.py --regenerar id-n         vuelve a generar aunque exista
Necesita: pip install google-genai lameenc  ·  GEMINI_API_KEY en el archivo .env de la raíz (nunca en el repo).
Configuración de la voz (modelo, voz, estilos): scripts/voz-config.json. Las frases y su entonación: beta/js/textos-narrador.js."""
import json, os, re, subprocess, sys, time
import lameenc
from google import genai
from google.genai import types

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO = os.path.join(RAIZ, 'beta', 'audio', 'voz')
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
    out = subprocess.run(['node', '--input-type=module', '-e', js], cwd=RAIZ, capture_output=True, text=True, check=True).stdout
    d = json.loads(out); res = []
    for id_, vs in d['T'].items():
        for i, t in enumerate(vs, 1):
            res.append({'id': f'{id_}-{i}', 'base': id_, 'tono': d['O'][id_], 'texto': re.sub(r'\s*\|\s*', ' ', t).strip()})
    return res

def pcm_a_mp3(pcm, rate):
    e = lameenc.Encoder(); e.set_bit_rate(64); e.set_in_sample_rate(rate); e.set_channels(1); e.set_quality(2)
    return bytes(e.encode(pcm) + e.flush())

def sintetiza(cli, f):
    contenido = [types.Content(role='user', parts=[types.Part(
        text=f"## Transcript:\n{CFG['instruccion']}\n\n«{f['texto']}»",
        speech_metadata=types.SpeechMetadata(style=CFG['estilos'][f['tono']]))])]
    conf = types.GenerateContentConfig(
        temperature=CFG['temperature'], response_modalities=['audio'],
        speech_config=types.SpeechConfig(voice_config=types.VoiceConfig(
            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=CFG['voz']))))
    datos = bytearray(); mime = ''
    for ch in cli.models.generate_content_stream(model=CFG['modelo'], contents=contenido, config=conf):
        if ch.parts is None: continue
        if ch.parts[0].inline_data and ch.parts[0].inline_data.data:
            datos.extend(ch.parts[0].inline_data.data); mime = ch.parts[0].inline_data.mime_type
    if not datos: raise RuntimeError('sin audio')
    m = re.search(r'rate=(\d+)', mime or ''); rate = int(m.group(1)) if m else 24000
    dur = len(datos) / 2 / rate
    palabras = len(f['texto'].split())
    if dur > 1.5 * palabras + 8:  # con temperature 1 alguna toma sale con pausas larguísimas: se descarta y se repite
        raise RuntimeError(f'toma demasiado larga ({dur:.0f} s para {palabras} palabras)')
    return pcm_a_mp3(bytes(datos), rate)

def escribe_indice():
    ids = sorted(f[:-4] for f in os.listdir(DESTINO) if f.endswith('.mp3'))
    json.dump(ids, open(os.path.join(DESTINO, 'indice.json'), 'w', encoding='utf-8'))

def main():
    a = sys.argv[1:]
    solo = a[a.index('--solo') + 1] if '--solo' in a else None
    regen = a[a.index('--regenerar') + 1] if '--regenerar' in a else None
    espera = '--incluir-espera' in a
    os.makedirs(DESTINO, exist_ok=True)
    cli = genai.Client(api_key=clave())
    lista = [f for f in frases() if (espera or f['base'] not in CFG['en_espera'])]
    if solo: lista = [f for f in lista if f['id'] == solo]
    pend = [f for f in lista if f['id'] == regen or not os.path.exists(os.path.join(DESTINO, f['id'] + '.mp3'))]
    print(f'{len(pend)} audios por generar de {len(lista)}')
    for n, f in enumerate(pend, 1):
        for intento in range(4):
            try:
                mp3 = sintetiza(cli, f)
                open(os.path.join(DESTINO, f['id'] + '.mp3'), 'wb').write(mp3)
                escribe_indice(); print(f"[{n}/{len(pend)}] {f['id']} ({f['tono']}) {len(mp3)//1024} KB", flush=True); break
            except Exception as e:
                msg = str(e)
                if 'PerDay' in msg or 'per day' in msg.lower():
                    escribe_indice(); sys.exit('Cuota diaria agotada: vuelve a ejecutar mañana, continúa donde se quedó.')
                m = re.search(r'retry in ([\d.]+)s', msg) or re.search(r"retryDelay'?: ?'?(\d+)", msg)
                if '429' in msg or 'RESOURCE_EXHAUSTED' in msg:
                    espera_s = float(m.group(1)) + 2 if m else 65; print(f'  límite de ritmo, espero {espera_s:.0f} s', flush=True); time.sleep(espera_s)
                else:
                    print(f"  error en {f['id']}: {msg[:200]}", flush=True); time.sleep(5)
        else:
            print(f"  me salto {f['id']} tras varios intentos"); continue
        time.sleep(CFG['segundos_entre_llamadas'])
    escribe_indice(); print('Listo.')

if __name__ == '__main__': main()
