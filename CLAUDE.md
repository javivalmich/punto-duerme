# Punto Duerme

Juego de Punto Studio del estilo «el pueblo duerme / los hombres lobo». Cada jugador usa su móvil y un móvil (el del anfitrión) hace de narrador con voz. Web estática sin compilación, publicada con GitHub Pages; el estado de las partidas vive en el Supabase compartido con Punto Falso y Punto Ciego.

- Beta: https://puntostudio.es/punto-duerme/beta/ (carpeta `beta/`). Es la única versión jugable por ahora.
- Raíz (`index.html`): página provisional «Próximamente», sin enlace a la beta.
- Base: Punto Falso (`C:\Users\javiv\el-impostor`, repo `javivalmich/punto-falso`): diseño, cuenta, editor de personaje y páginas legales. «Volver a la partida» sale de Punto Ciego.

## Fases del desarrollo

Se hace **una fase cada vez** y se espera a que el usuario la pruebe antes de seguir.

1. ✅ Modo «cada uno con su móvil», solo Punto y Ciego: sala, noche, día, votación, final y narrador con voz. **(hecha y probada por el usuario; ajustes posteriores: narrador = jugador más, botón de portada, estética propia, bots de prueba)**
2. Bruja, Cupido y Vidente.
3. ✅ Modo de un solo móvil (adelantada: **hecha, pendiente de prueba del usuario**).
4. Música de ambiente (hueco preparado en `js/ambiente.js`, desactivado; **no hay pitidos ni efectos de sonido, solo la voz del narrador**).

## Reglas del juego

**Papeles**
- **Punto**: los asesinos. Número sugerido según los jugadores que juegan: 4–5 → 1, 6–8 → 2, 9–11 → 3, 12+ → 4, nunca la mitad o más. El anfitrión lo cambia en la sala de espera.
- **Ciego**: el pueblo.
- Opcionales (fase 2): Bruja, Cupido, Vidente. Previstos: Guardián, Cazador, Alcalde, Anciano, Niña curiosa (ya están en `roles.js` marcados como `futuro`).

**Partida** (mínimo 4 jugadores, contando al anfitrión)
1. **Reparto**: cada uno mantiene pulsada su tarjeta para ver su papel y pulsa «Ya lo he visto». Los Puntos ven quiénes son sus compañeros. Se pasa a la noche cuando todos están listos (o a los 90 s).
2. **Noche guiada por el narrador** (como en el juego clásico: todos cierran los ojos y **solo actúa quien el narrador llama**). Fases del servidor: `anochece` (narrada: «Cae la noche… y todos cierran los ojos») → `noche` (turno de los Puntos; el narrador dice «Los Puntos despiertan…») → `noche_cierra` (narrada: «Los Puntos vuelven a dormir») → `amanece`.
   - **Los Ciegos no hacen nada de noche**: su pantalla es casi negra con «Duerme… Mantén los ojos cerrados» (también la de los muertos y la de todos en `anochece` y `noche_cierra`), sin cuenta atrás, sin subtítulo, sin sonidos ni vibraciones (los sonidos solo suenan en el móvil del narrador). El servidor ignora sus marcas y confirmaciones.
   - **Solo los Puntos ven la elección de víctima**, con las marcas de sus compañeros en directo y «Confirmar». Tema `fase-oscura` (`estilo.css`): fondo negro, texto y acento atenuados, sin cielo ni estrellas, para que si alguien entreabre los ojos no vea qué móvil se ilumina. Los Puntos tienen que coincidir todos y pulsar «Confirmar» (basta con que lo pulse uno). **Si solo queda un Punto vivo, confirma directamente.**
   - El turno acaba en cuanto confirman o se acaba el tiempo (configurable, 30 s por defecto). Sin confirmar, el elegido es el más marcado entre los Puntos vivos; si hay empate, no muere nadie. **La víctima no muere ni se publica hasta que amanece** (`duerme_salas.pendiente` → `_duerme_amanece`), para que nadie vea antes de tiempo quién ha caído.
   - **Fase 2**: cada personaje (Cupido, Vidente, Bruja) tendrá su turno igual, con su «despierta» y «vuelve a dormir» (fases `noche_<papel>` y `noche_<papel>_cierra` entre `noche` y `noche_cierra`), y **su turno durará lo mismo aunque esté muerto** (el servidor simulará la espera) para no delatar nada.
3. **Amanece** (narrada): el narrador anuncia los muertos.
4. **Debate** con temporizador (3 min por defecto). El anfitrión o el narrador pueden pulsar «Votar ya».
5. **Votación** en el móvil (60 s por defecto): no a uno mismo, se puede cambiar hasta que voten todos. **Opción «No votar»** (abstención, acción `abstiene` → se guarda como `voto` con `objetivo` nulo; `mio.voto === ''` en la vista): cuenta como haber votado pero no suma a nadie; el resultado publica `abstenciones` y la pantalla dice cuántos se abstuvieron. Acaba cuando votan o se abstienen todos o se acaba el tiempo; **si se acaba el tiempo, cuentan solo los votos emitidos**. El más votado queda eliminado; si hay empate (o nadie vota), nadie.
6. **Resultado** (narrada) y vuelta a anochecer.
- Opción al crear la partida: **revelar el papel** de los muertos (de noche y en la votación). Por defecto, sí.
- Los muertos siguen viendo la partida pero no votan ni actúan, y no ven papeles ajenos hasta el final.

**Final**: ganan los Ciegos si no queda ningún Punto; ganan los Puntos si hay tantos Puntos vivos como Ciegos (o más). Se comprueba al salir de «Amanece» y de «Resultado» (y cuando alguien sale de la partida). Pantalla final con el papel de todos; el anfitrión puede volver a la sala con «Otra partida».

**Narrador**
- **El narrador es un jugador más**: es el móvil del anfitrión y juega con él en la mano, igual que los demás (no hay opción «yo también juego»; se quitó). Es el único móvil que suena (voz y sonidos), pero su pantalla es la de un jugador normal: ve lo mismo que cualquiera con su papel, ni más ni menos. Lo único propio es el botón de silenciar. La columna `duerme_jugadores.juega` sigue en la base de datos pero siempre es `true`.
- **Voz**: audios pregrabados con Gemini TTS (ver «Voz del narrador» abajo); `speechSynthesis` (la mejor voz `es-ES` del dispositivo, `narrador.js` puntúa las voces) queda solo de reserva si falta algún audio. Botón de silenciar (también silencia los sonidos). iOS solo deja hablar tras un toque: «Crear sala», «Unirme», «Empezar» y «Volver a la partida» llaman a `desbloquea()`.
- Textos en `beta/js/textos-narrador.js`, con id y variantes. La variante se elige al azar pero igual en todos los móviles, y **no se repite la misma dos veces seguidas en una partida**: `texto(id, vars, {j: partida, r: ronda})` baraja las variantes de cada id con semilla de la partida y las recorre por rondas (cada frase suena como mucho una vez por ronda; al cambiar de vuelta nunca empieza por la última). Vale también en un solo móvil (`j` = `S.id`). Con una sola variante no se puede evitar.
- **Nunca dice nada que revele un papel de forma indirecta**: las frases son las mismas pase lo que pase (por ejemplo, «Los Puntos abren los ojos» se dice siempre, y la noche no termina antes por nada que no sea la confirmación de los Puntos o el tiempo).
- **Relevo**: si el móvil del narrador no está conectado más de 30 s, los demás ven «Ser yo el narrador» (también en el menú ☰); quien lo pulsa pasa a ser el narrador (hace falta un toque para que el navegador deje hablar). Si el narrador sale de la partida, pasa al siguiente por orden de llegada.

**Salir de la partida** (regla de Punto Falso / Punto Ciego): nadie sale por desconectarse o bloquear el móvil. Solo con «Salir», tras 5 h sin abrir el juego (`CINCO_H` en `estado.js`; al detectarlo se llama a `duerme_salir`) o cerrando la app: al volver, la portada muestra «Volver a la partida». Quien sale en plena partida queda fuera (como muerto, sin anuncio) y no puede volver. Si sale el anfitrión o el narrador, pasa al siguiente por orden de llegada.

## Estructura

```
index.html                     portada raíz provisional («Próximamente»)
beta/
  index.html                   pantallas: portada, crear, unirme, sala de espera, partida, editor de personaje
  css/estilo.css               tokens de tema (noche/alba/día) al principio; base heredada de Punto Falso; bloques «Punto Duerme» al final
  js/app.js                    arranque, reparto de pantallas, pantalla encendida, vuelta a la app
  js/estado.js                 sesión guardada (5 h), vista actual, sincronización con el servidor
  js/red.js                    Supabase: rpc('…') → duerme_…, canal en tiempo real y presencia
  js/sala.js                   portada, crear, unirse, sala de espera y ajustes
  js/pruebas.js                bots y panel de pruebas (solo beta)
  js/solo.js                   modo de un solo móvil (sin conexión)
  js/partida.js                pantallas de cada fase, director del narrador, temporizadores, menú
  js/roles.js                  catálogo de personajes (presentación) y Puntos sugeridos
  js/narrador.js               voz (speechSynthesis), cola de frases, silenciar
  js/textos-narrador.js        todas las frases del narrador
  js/audio.js                  todo el sonido por Web Audio (nunca <audio>), mediaSession, audioSession «playback»
  js/ambiente.js               música de ambiente: hueco desactivado
  js/cuenta.js, js/cabeza.js   cuenta opcional y personaje (de Punto Falso; listas de colores = Punto Ciego)
  img/logo.png, emblema.png    logo con texto (portada) y emblema sin texto (iconos de la app); ambos transparentes
  assets/personaje3d.js, .bin  personaje 3D del editor (de Punto Ciego)
  vendor/                      supabase-js (UMD) y qrcode
  sw.js, manifest.json         PWA: red primero; subir VERSION al publicar
  soporte.html, terminos.html  adaptados de Punto Falso; privacidad.html redirige a /privacidad/
supabase/migrations/           tablas y funciones del juego (aplicadas en el proyecto «Punto ciego», qsmcdfyyxvqmesnbwsod)
scripts/iconos.mjs                  genera los iconos de la app a partir de beta/img/emblema.png
```

La música de ambiente se activará más adelante en `js/ambiente.js` (`AMBIENTE.activo` y `AMBIENTE.archivo`); no hay efectos de sonido.

Para añadir un personaje: entrada en `roles.js`, su reparto y su paso de noche en las funciones SQL (`duerme_empezar`, `duerme_actuar`, `_duerme_noche_fin`), lo que ve en `duerme_vista`, su pantalla en `partida.js` y sus frases en `textos-narrador.js`.

## Audio en iPhone (importante)

**Nunca usar elementos `<audio>`/`<video>`** (ni audio en silencio en bucle): iOS los trata como música y deja el reproductor «Punto Duerme» en la pantalla de bloqueo. Todo el sonido (la voz grabada; no hay efectos) va por **Web Audio** (`js/audio.js`: `AudioContext`, `decodeAudioData`, `BufferSource`). `desbloquea()` emite un búfer de ceros (silencio total, 20 ms) y pone `navigator.audioSession.type = 'playback'` donde exista (así la voz grabada suena con el modo silencio del iPhone; `liberaAudio()` lo devuelve a `auto`) y se llama desde un toque («Crear», «Unirme», «Empezar», «Volver a la partida», empezar un solo móvil); `reanuda()` en cada toque por si iOS interrumpió el contexto. `liberaAudio()` para todo, cierra el contexto y limpia `navigator.mediaSession` (metadata null, playbackState `none`, sin manejadores) al salir de la partida, en `pagehide` y al ocultarse la página; cada clip se desconecta al terminar. La pantalla se mantiene encendida **solo con la Wake Lock API** (`app.js`), que se suelta al salir y en `pagehide`.

**Diagnóstico de la voz (solo beta)**: en el panel de pruebas (sala de espera → «Panel de pruebas», o ☰ → «Panel de pruebas» en partida) hay un bloque «Estado de la voz»: versión de la app (caché del service worker), audios en el índice (en memoria y en la red), estado del `AudioContext` (running/suspended/interrupted), tipo de `audioSession`, últimos cambios de estado y, por cada frase, si sonó la grabada, la del navegador o hubo error (con el mensaje). El bloque también dice si este móvil es el narrador. Antes de cada clip se intenta reanudar el contexto (`aseguraAudio`), y al desbloquear se arranca primero la voz del navegador y luego Web Audio.

En el modo de un solo móvil, cada votante tiene también «No votar» en su voto secreto (`S.votos[i] = -1`).

**Los toques no cortan la voz**: el desbloqueo completo (`desbloquea()`: voz vacía, contexto, `audioSession`) solo se hace en «Crear», «Unirme», «Empezar», «Volver a la partida», «Ser yo el narrador» y «Activar la voz», y se salta si hay una frase sonando (`sonando()` en `narrador.js`). Cualquier otro toque (y volver a la app) solo llama a `reanuda()`, que reanuda el `AudioContext` si está suspendido o interrumpido y **nunca mientras suena una frase**; no para, cancela ni recrea nada.

## Voz y bloqueo de iOS

iOS solo deja hablar si la voz arrancó dentro de un toque. Por eso «Crear», «Unirme», «Empezar», «Volver a la partida», «Ser yo el narrador» y empezar un solo móvil llaman a `desbloquea()` (narrador.js) **antes de ir al servidor**: `speak()` de una frase vacía a volumen 0 + `AudioContext` (audio.js). Además: no se llama a `speechSynthesis.cancel()` si no hay nada hablando, y si hace falta se espera 150 ms antes de hablar (en iOS, hablar justo después de `cancel()` deja la voz muda). Si la voz no empieza en 2,5 s (o el `AudioContext` está interrumpido), `VOZ.bloqueada = true` y el móvil del narrador ve el aviso «iOS ha bloqueado la voz» con el botón **«Activar la voz del narrador»**, que la desbloquea con un toque y repite lo que tocaba decir.

## Voz del narrador (audios Gemini TTS)

- **Modo silencio del iPhone**: la voz del navegador (`speechSynthesis`) NO suena con el modo silencio y no tiene arreglo; los audios grabados (Web Audio) sí. Mientras no haya audios grabados (`vozGrabada()` en `narrador.js`), la sala de espera del narrador y los ajustes del modo de un solo móvil muestran «Quita el modo silencio para oír al narrador».

- Audios en `beta/audio/voz/<id>-<n>.mp3` (id de frase de `textos-narrador.js`, n = variante desde 1) y `indice.json` (lista de los que existen). `narrador.js` localiza cada frase por su texto, la reproduce como blob y, si falta cualquier audio, habla la voz del navegador. Los audios se precargan en memoria y el service worker los mete en su caché al instalarse (`sw.js`, lee `indice.json`), así suenan también sin conexión en el modo de un solo móvil.
- **Las frases no llevan nombres ni tiempos** (no se pueden pregrabar): el narrador dice «este jugador» y el nombre sale grande en pantalla; el tiempo del debate sale en el reloj.
- **Configuración** (`scripts/voz-config.json`, sin la clave): modelo `gemini-3.8-flash-tts`, voz `Riko`, `temperature` 0,7; instrucción «narrador nativo de Madrid, español de España con acento castellano, sin acento extranjero, c y z como en España, tono de cuento de misterio»; estilos `rich`, `tense` y `hushed` (este último: «Low, mysterious, suspenseful night-time narration, spoken softly but clearly projected so a whole room can hear it…», para que se oiga en una sala) que se pasan como `speech_metadata.style`. No se cambian sin que lo pida el usuario.
- **Entonación** de cada frase: `TONO` en `textos-narrador.js` (hushed = noche; tense = muertes, votación y eliminados; rich = bienvenida, amanecer, debate y final).
- **Estado de los audios** (5 nov 2026): 45 frases aprobadas; **18 generadas y en uso** (también se retiraron `empate-1` y `sin_votos-1` por cambio de texto: se regeneran justo después de los de «Puntos») (`puntos_abre-1` y `puntos_cierra-1` se retiraron porque el audio decía «lobos» en vez de «Puntos»; están en `scripts/descartados/`, sin subir, y se regeneran los primeros) (`indice.json` lista las que existen); 23 pendientes (cuota agotada; los lotes de `hushed`/`rich` fallaban al cortar). Sin ninguna variante grabada, **hoy suena la voz del navegador** en: `bienvenida`, `amanece_inicio`, `amanece_nadie`, `debate`, `gana_pueblo`, `gana_puntos` (y `primera_noche` usa `noche_cae`). Solo tienen una variante `puntos_abre`, `puntos_cierra` y `sin_votos` (se repiten). Si una frase compuesta (p. ej. el amanecer) incluye una parte sin audio, se dice entera con la voz del navegador. Mañana: `python scripts/voz.py` (continúa solo y actualiza `indice.json`), `--regenerar` para los sospechosos `amanece_muerto-3`, `amanece_varios-2` (muy rápidos), `eliminado-1` (silencio sobrante) y `votacion-2`; luego subir `VERSION` y publicar.
- **Textos**: el narrador solo cuenta la historia con tono de cuento; **nunca da órdenes de juego ni avisos de tiempo** (eso lo dicen la pantalla y el reloj). Sin nombres ni tiempos (no se pueden pregrabar): el nombre sale grande en pantalla. La frase de `eliminado` acaba en suspense («…y señala a…») y el nombre (y su papel, si está activado) aparece al terminar el audio (`duracionTexto` en `narrador.js`, usando `audio/voz/duraciones.json` que escribe el script). La voz nunca dice el bando ni el papel de nadie.
- **Generar o regenerar** (`python scripts/voz.py`; `pip install google-genai lameenc numpy scipy pyloudnorm`):
  - Agrupa hasta 8 frases de la misma entonación por petición (separadas con pausas largas) y corta por los silencios; exige tantos trozos como frases y duraciones razonables, si no repite solo ese lote.
  - **Masterizado fijo de cada audio**: compresión suave → -14 LUFS → limitador a -1 dBFS (MP3 96 kbps mono).
  - Límite gratuito: 10 peticiones al día (contadas en `scripts/.voz-estado.json`, ignorado); al agotarlo para y, al volver a ejecutarlo otro día, continúa donde se quedó (salta lo ya hecho). Las tomas descartadas también gastan cupo.
  - **Orden y tandas** (`voz.py`, ver `--plan`): 1) una variante de `bienvenida`, `amanece_inicio`, `amanece_nadie`, `debate`, `gana_pueblo`, `gana_puntos`; 2) segundas variantes de `puntos_abre`, `puntos_cierra`, `sin_votos`; 3) el resto; 4) fase 2 y las 4 sospechosas (se rehacen una vez, se anotan en `.voz-estado.json`). Tandas de 4 frases como máximo, pausas de «unos cinco segundos» entre frases y 20 s entre peticiones; `indice.json` se reescribe tras cada tanda.
  - **`audio/voz/indice.json` lista siempre los audios que existen** (el script lo reescribe tras cada lote); la app sortea variantes solo entre las grabadas (`texto()` en `textos-narrador.js`) y usa la voz del navegador en las frases sin ninguna. `scripts/voz-lista.md` lleva id, entonación, duración y texto de cada audio.
  - `--regenerar id-n …` rehace frases concretas. **Si cambias el texto de una frase, ejecuta el script** (borra los audios de frases que ya no existen y genera los que faltan) y sube `VERSION` en `sw.js`.
- **«Puntos» nunca «lobos»**: la instrucción de voz incluye «lee el texto exactamente como está escrito… 'Puntos' es el nombre de los asesinos; nunca lo cambies por 'lobos'». Aun así hay que **escuchar cada audio que nombre a los Puntos** (`puntos_abre`, `puntos_cierra`, `debate` (2.ª variante), `gana_pueblo`, `gana_puntos`) antes de darlo por bueno; si dice otra cosa, borrarlo y regenerarlo.
- **Avance tras la voz**: `di()` (`narrador.js`) sigue cuando acaba el audio o, como mucho, a la duración conocida (`duraciones.json`) + 0,35 s por clip + 1,5 s; en iOS el aviso de fin del audio puede no llegar. El panel de pruebas anota por cada frase si avanzó «por fin del audio» o «por el límite de tiempo».
- **Clave**: `GEMINI_API_KEY` solo en `.env` en la raíz (en `.gitignore`; no se sube ni se escribe en otro archivo).
- **Condiciones**: los términos de la API de Gemini (aistudio.google.com/docs/terms) no reclaman la propiedad del contenido generado y encajan con uso profesional; en el plan gratuito Google puede usar prompts y respuestas para mejorar sus productos (aquí solo frases del juego, sin datos personales). Revisar los términos antes de un lanzamiento comercial.

## Estética

- **Botones** (todos, `.act` y `.vbtn`): como la app de Punto Falso. Sin sombra dura ni borde inferior oscuro. Principal: relleno `--acc` con resplandor suave (`0 8px 22px` del mismo color al 30 %). Secundario (`.act.sec`) y peligro: solo borde, sin relleno. Tamaño, letra, padding y esquinas (16 px) vienen de la regla base `.act`, idéntica a Punto Falso; al pulsar se oscurece (`--red-press`). El bloque «botones» al final de `estilo.css` solo cambia colores.
- **Portada**: arriba el logo completo con texto (`img/logo.png`, transparente; `.hero .logo`: máx. 82 vw / 330 px / 40 dvh, margen inferior 10 px) y debajo, en texto, el lema `<p class="tag">NADIE DESCANSA TRANQUILO</p>` en amarillo (mismo estilo que «EL JUEGO SOCIAL DEL IMPOSTOR» de Punto Falso). Orden de la portada (como la app de Punto Falso): logo, lema, texto de presentación, «Crear partida», «Unirme», «Jugar con un solo móvil», cuenta (`.acct`: avatar + «Hola, nombre» + «Mi cuenta», o «Entrar o crear cuenta») y «Cómo se juega» al final. Sin título en texto ni emblema encima (se probó «PUNTO / DUERME» en texto con el emblema y se descartó). `img/emblema.png` queda para el reparto y los iconos. Portada compacta (bloque final de `estilo.css`): margen superior 22 px y logo máx. 36 dvh, para que en un iPhone 390×844 con barras de Safari (≈664 px útiles) se vea del logo a la cuenta sin scroll; «Cómo se juega» queda debajo. Si se añade algo a la portada, comprobarlo a 390×664. Comprobado a 360 y 390 px.

Identidad propia dentro de Punto Studio: mismas mascota, tipografía (Outfit), estructura de pantallas y botones **como en la app de Punto Falso (rama `app`)**, pero paleta nocturna. **No se usa el estilo «expediente» ni la skill punto-studio-design** (descartada para este juego).

- **Noche** (portada, sala, reparto, anochece, noche): azul noche `#0B1030`, cielo índigo `#1A2260`, acento **amarillo luna** `#E5AE3A` (dorado profundo; texto oscuro `--accT` encima, contraste 8,4:1), coral `#FF7A8C` solo para Puntos/muertes/errores.
- **Amanecer y día** (amanece, debate, votación, resultado, final): **siempre oscuro y cálido** (se juega con poca luz; nunca fondo claro): morado `#1D1233`/`#5A2A55`, acento melocotón `#FFB46B`, texto `#FFF1E4`, carmesí/rosa `#FF8FA0` para Puntos. Contraste AA comprobado.
- Los colores son variables en `:root` (`--bg --bg2 --surface --surface2 --line --text --muted --acc --accT --pel --btn --glow`), registradas con `@property` para que se fundan en ~1,6 s. `tema(fase)` (en `util.js`) pone en `<html>` la clase `fase-noche | fase-alba | fase-dia`; se llama desde `renderJuego` y al volver a la sala/portada.
- Cielo (`#cielo`, fijo detrás de todo): estrellas, brillos que parpadean, niebla que se desplaza, luna (de noche) y sol que sale por el horizonte (alba) y sube un poco (día). Solo CSS y `transform`/`opacity`; respeta `prefers-reduced-motion`.
- **El amarillo luna** (`--acc` de la noche, al principio de `estilo.css`) debe coincidir con el del logo definitivo: cámbialo ahí (actual: #E5AE3A, casa con la luna del emblema).
- **Logos** definitivos: `beta/img/logo.png` (con texto, portada, fondo transparente) y `beta/img/emblema.png` (sin texto, transparente; de él salen los iconos sobre fondo azul noche). Para cambiarlos: sustituir esos archivos y ejecutar `npm i --no-save sharp && node scripts/iconos.mjs`, que regenera `beta/icons/*` (favicon, icon-192/512, maskable y apple-touch-icon). 
- La propuesta de diseño (maqueta) está en `design/propuesta.html` (no se publica).

## Modo de un solo móvil

Elección de modo en la portada, como en Punto Falso: «Crear partida» (cada uno con su móvil, necesita conexión) y «Jugar con un solo móvil» (un móvil que se pasa de mano en mano, sin conexión); cada botón lleva su explicación debajo, y las pantallas de ajustes de ambos modos enlazan con el otro.

- **Sin conexión ni servidor**: todo está en `js/solo.js` y `localStorage` (clave `solo`, caduca a las 5 h; la portada ofrece «Volver a la partida de un solo móvil»). No hay ninguna llamada a Supabase. El service worker precachea la app y los sonidos; los sonidos se guardan además en memoria como blobs (`sonido.js`) y sin conexión el narrador solo usa voces instaladas en el móvil (`narrador.js`).
- **Flujo**: ajustes (nombres ≥ 4, Puntos, tiempo de debate, revelar papel) → **reparto** (cada uno: «pasa el móvil a X» → «Soy X» → mantiene pulsada su tarjeta → «Ya lo he visto») → **anochece** (todos cierran los ojos) → **noche**: el narrador llama a cada personaje por turno («Los Puntos abren los ojos…»), uno coge el móvil («Tengo el móvil»), elige y confirma, lo deja y «cierran los ojos» → **amanece** (anuncia muertos) → **debate** (cuenta atrás) → **votación** uno a uno y en secreto → **resultado** → noche… → **final** con todos los papeles. Las pantallas privadas vuelven a «pasa el móvil» si se recarga la página.
- Las reglas de victoria, empate y revelar papel son las mismas que en línea. Los Ciegos no actúan de noche en este modo.
- **Estructura para la fase 2**: `roles.js → NOCHE` lista los pasos de la noche por orden (cupido 10 solo ronda 1, vidente 20, punto 30, bruja 40), con `activo:false` los de la fase 2; `solo.js → ACCIONES` define qué se elige y qué efecto tiene cada acción (`matar` ya está; faltan `enamorar`, `ver`, `pociones`). Si el personaje ha muerto, se llama igual y se simula la espera (no delata nada). Los textos de llamada de los tres personajes ya están en `textos-narrador.js`.

## Bots de prueba (solo beta)

Para probar con un único móvil. El anfitrión, en la sala de espera, pulsa «Añadir bot (pruebas)» (Bot Ana, Bot Luis…; ✕ para quitarlos). Cuentan para el mínimo de 4 jugadores.

- **Los mueve el servidor** (`supabase/migrations/20261105100000_duerme_bots.sql`): `duerme_tick` programa a cada bot con un retraso aleatorio de 2–7 s al empezar cada fase y ejecuta los que ya les toca (`_duerme_bot_paso`): reparto → «Ya lo he visto»; noche → marcan (los Puntos copian al Punto que ya haya marcado, los humanos primero, así dos Puntos coinciden) y confirman 1,5–5 s después; votación → votan al azar o al forzado. El móvil del anfitrión solo llama a `duerme_tick` cada 2 s (`pruebas.js`) para dar la hora; no decide nada. Nunca son anfitrión ni narrador (`_duerme_quita`).
- **Abstención de los bots**: en la votación se abstienen con un 8 % de probabilidad; en el panel, «Los bots votan a → Nadie (no votan)» (`forzar_voto = '-'`) los hace abstenerse siempre (migración `20261107100000_duerme_no_votar.sql`).
- **Panel de pruebas** (plegable en la sala; en partida, ☰ → «Panel de pruebas»), solo anfitrión: «Ver roles de los bots» (la vista incluye el papel de los bots solo para el anfitrión de esa sala con el interruptor; los de personas nunca), y «Los bots marcan a / votan a» para forzar un jugador (si no es válido, al azar).
- **Seguridad**: tablas con RLS sin permisos, funciones internas sin acceso. Interruptor global `duerme_flags('pruebas')`: con `update duerme_flags set valor = false where clave = 'pruebas';` los bots y el panel dejan de funcionar en el servidor aunque alguien llame a las funciones a mano. **Hazlo antes de lanzar el juego.** En el cliente solo aparece si la ruta contiene `/beta/` (`EN_BETA` en `pruebas.js`).
- **Fase 2**: para que los bots hagan de Bruja, Cupido y Vidente basta añadir su rama en `_duerme_bot_paso` (y su fase en `duerme_tick`); calendario, forzados y panel ya valen para todos los papeles.

## Sincronización entre móviles

**El servidor manda.** Nada secreto se calcula ni se guarda en los móviles.

- Tablas `duerme_salas`, `duerme_jugadores`, `duerme_acciones` con RLS activado y sin permisos para `anon`/`authenticated`: ningún cliente puede leerlas.
- Todo pasa por funciones `security definer` que reciben el **token secreto** del jugador (lo da el servidor al crear o unirse, y se guarda en el navegador junto al código y el id público):
  `duerme_crear`, `duerme_unirse`, `duerme_perfil`, `duerme_configurar`, `duerme_salir`, `duerme_expulsar`, `duerme_empezar`, `duerme_actuar` (listo, marca, confirma, voto, votar_ya), `duerme_avanzar`, `duerme_ser_narrador`, `duerme_a_la_sala`, `duerme_vista`.
  Las internas (`_duerme_*`) no se pueden llamar desde fuera.
- `duerme_vista` devuelve lo público (fase, tiempos, jugadores vivos/muertos, anuncios) y de lo secreto **solo lo mío**: mi papel; si soy Punto, mis compañeros y sus marcas de esta noche; mi propia acción. Los papeles de todos, solo en la fase `final`. El número de votos emitidos, no quién vota a quién (el recuento por jugador se publica al cerrar la votación).
- Cada cambio sube `version` y la función envía un aviso **sin secretos** (`{v}`) con `realtime.send` al canal público `duerme-<CÓDIGO>`. Al recibirlo (o al reconectar, volver a la app o cada 15 s de respaldo), cada móvil pide `duerme_vista`. El canal también lleva la presencia (punto verde de conectado).
- **Tiempos**: el servidor guarda `fase_hasta`; los móviles pintan la cuenta atrás corrigiendo el desfase de reloj (`ahora` en la vista). Al vencer, el narrador llama a `duerme_avanzar(fase)`; los demás, 2,5–5 s después por si el narrador no está. Es idempotente: si la fase ya cambió, no hace nada.
- **Fases narradas** (`anochece`, `amanece`, `resultado`): el narrador las cierra al terminar de hablar (máximo 40 s si su móvil no está).
- Las salas se borran solas tras 1 día sin actividad (al crear una nueva).

## Probar en local

```bash
npx http-server . -p 8384 -c-1
```

Abre `http://localhost:8384/beta/?yo=1` y, en otras pestañas, `?yo=2`, `?yo=3`… (en localhost, `?yo=N` da a cada pestaña su propio jugador). Con el código de sala: `?yo=2&s=CODIGO`. Usa el Supabase real (las partidas de prueba se borran solas en un día). No hay tests automáticos: se prueba con varias pestañas.

## Publicar

GitHub Pages sirve el repo `javivalmich/punto-duerme` desde la raíz de `main` en `puntostudio.es/punto-duerme/` (dominio de `javivalmich.github.io`). Para actualizar: commit y push; **sube `VERSION` en `beta/sw.js`**.

Supabase (Authentication → URL Configuration → Redirect URLs) necesita `https://puntostudio.es/punto-duerme/**` para que el correo de confirmación y el inicio con Google vuelvan aquí.
