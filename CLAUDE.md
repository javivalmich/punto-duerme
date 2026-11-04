# Punto Duerme

Juego de Punto Studio del estilo «el pueblo duerme / los hombres lobo». Cada jugador usa su móvil y un móvil (el del anfitrión) hace de narrador con voz. Web estática sin compilación, publicada con GitHub Pages; el estado de las partidas vive en el Supabase compartido con Punto Falso y Punto Ciego.

- Beta: https://puntostudio.es/punto-duerme/beta/ (carpeta `beta/`). Es la única versión jugable por ahora.
- Raíz (`index.html`): página provisional «Próximamente», sin enlace a la beta.
- Base: Punto Falso (`C:\Users\javiv\el-impostor`, repo `javivalmich/punto-falso`): diseño, cuenta, editor de personaje y páginas legales. «Volver a la partida» sale de Punto Ciego.

## Fases del desarrollo

Se hace **una fase cada vez** y se espera a que el usuario la pruebe antes de seguir.

1. ✅ Modo «cada uno con su móvil», solo Punto y Ciego: sala, noche, día, votación, final y narrador con voz. **(hecha, pendiente de prueba del usuario)**
2. Bruja, Cupido y Vidente.
3. Modo de un solo móvil.
4. Música y efectos.

## Reglas del juego

**Papeles**
- **Punto**: los asesinos. Número sugerido según los jugadores que juegan: 4–5 → 1, 6–8 → 2, 9–11 → 3, 12+ → 4, nunca la mitad o más. El anfitrión lo cambia en la sala de espera.
- **Ciego**: el pueblo.
- Opcionales (fase 2): Bruja, Cupido, Vidente. Previstos: Guardián, Cazador, Alcalde, Anciano, Niña curiosa (ya están en `roles.js` marcados como `futuro`).

**Partida** (mínimo 4 jugadores; si el narrador no juega, no cuenta)
1. **Reparto**: cada uno mantiene pulsada su tarjeta para ver su papel y pulsa «Ya lo he visto». Los Puntos ven quiénes son sus compañeros. Se pasa a la noche cuando todos están listos (o a los 90 s).
2. **Anochece** (narrada) → **Noche**: todos miran el móvil y **todos tocan a alguien**, para que nadie se delate. Los Puntos eligen víctima y ven en directo a quién marca cada compañero; los Ciegos marcan de quién sospechan (no tiene efecto, es tapadera) y también pulsan «Confirmar». Los Puntos no pueden marcarse entre ellos.
   - Los Puntos tienen que coincidir todos y pulsar «Confirmar» (basta con que lo pulse uno). **Si solo queda un Punto vivo, confirma directamente.**
   - La noche acaba en cuanto confirman o se acaba el tiempo (configurable, 30 s por defecto). Sin confirmar, muere el más marcado entre los Puntos vivos; si hay empate, no muere nadie.
3. **Amanece** (narrada): el narrador anuncia los muertos.
4. **Debate** con temporizador (3 min por defecto). El anfitrión o el narrador pueden pulsar «Votar ya».
5. **Votación** en el móvil (60 s por defecto): no a uno mismo, se puede cambiar hasta que voten todos. Acaba cuando votan todos o se acaba el tiempo; **si se acaba el tiempo, cuentan solo los votos emitidos**. El más votado queda eliminado; si hay empate (o nadie vota), nadie.
6. **Resultado** (narrada) y vuelta a anochecer.
- Opción al crear la partida: **revelar el papel** de los muertos (de noche y en la votación). Por defecto, sí.
- Los muertos siguen viendo la partida pero no votan ni actúan, y no ven papeles ajenos hasta el final.

**Final**: ganan los Ciegos si no queda ningún Punto; ganan los Puntos si hay tantos Puntos vivos como Ciegos (o más). Se comprueba al salir de «Amanece» y de «Resultado» (y cuando alguien sale de la partida). Pantalla final con el papel de todos; el anfitrión puede volver a la sala con «Otra partida».

**Narrador**
- Es el móvil del anfitrión. Opción «El narrador también juega»: si juega, lleva el móvil en la mano (arriba la fase, debajo su panel); si no, `body.solo-narra` muestra la fase y la cuenta atrás en grande para dejarlo en el centro.
- Voz con `speechSynthesis`, la mejor voz `es-ES` del dispositivo (`narrador.js` puntúa las voces). Botón de silenciar (también silencia los sonidos). iOS solo deja hablar tras un toque: «Crear sala», «Unirme», «Empezar» y «Volver a la partida» llaman a `desbloquea()`.
- Textos en `beta/js/textos-narrador.js`, con id y variantes. La variante se elige igual en todos los móviles (código + ronda + fase), así el subtítulo que ve cada jugador coincide con la voz.
- **Nunca dice nada que revele un papel de forma indirecta**: las frases son las mismas pase lo que pase (por ejemplo, «Los Puntos abren los ojos» se dice siempre, y la noche no termina antes por nada que no sea la confirmación de los Puntos o el tiempo).
- Si el móvil del narrador no está conectado más de 30 s, los demás ven «Ser yo el narrador» (también en el menú ☰).

**Salir de la partida** (regla de Punto Falso / Punto Ciego): nadie sale por desconectarse o bloquear el móvil. Solo con «Salir», tras 5 h sin abrir el juego (`CINCO_H` en `estado.js`; al detectarlo se llama a `duerme_salir`) o cerrando la app: al volver, la portada muestra «Volver a la partida». Quien sale en plena partida queda fuera (como muerto, sin anuncio) y no puede volver. Si sale el anfitrión o el narrador, pasa al siguiente por orden de llegada.

## Estructura

```
index.html                     portada raíz provisional («Próximamente»)
beta/
  index.html                   pantallas: portada, crear, unirme, sala de espera, partida, editor de personaje
  css/estilo.css               diseño de Punto Falso (copiado) + bloque «Punto Duerme» al final
  js/app.js                    arranque, reparto de pantallas, pantalla encendida, vuelta a la app
  js/estado.js                 sesión guardada (5 h), vista actual, sincronización con el servidor
  js/red.js                    Supabase: rpc('…') → duerme_…, canal en tiempo real y presencia
  js/sala.js                   portada, crear, unirse, sala de espera y ajustes
  js/partida.js                pantallas de cada fase, director del narrador, temporizadores, menú
  js/roles.js                  catálogo de personajes (presentación) y Puntos sugeridos
  js/narrador.js               voz (speechSynthesis), cola de frases, silenciar
  js/textos-narrador.js        todas las frases del narrador
  js/sonido.js                 sonidos (solo en el móvil del narrador)
  js/cuenta.js, js/cabeza.js   cuenta opcional y personaje (de Punto Falso; listas de colores = Punto Ciego)
  assets/personaje3d.js, .bin  personaje 3D del editor (de Punto Ciego)
  audio/*.wav                  sonidos provisionales (noche, amanecer, muerte, votacion, eliminado, tic, victoria-…)
  vendor/                      supabase-js (UMD) y qrcode
  sw.js, manifest.json         PWA: red primero; subir VERSION al publicar
  soporte.html, terminos.html  adaptados de Punto Falso; privacidad.html redirige a /privacidad/
supabase/migrations/           tablas y funciones del juego (aplicadas en el proyecto «Punto ciego», qsmcdfyyxvqmesnbwsod)
scripts/sonidos-provisionales.mjs   genera los .wav provisionales
```

Para cambiar un sonido: sustituye el archivo en `beta/audio/` (si cambia la extensión, cambia la ruta en `SONIDOS` de `sonido.js`).

Para añadir un personaje: entrada en `roles.js`, su reparto y su paso de noche en las funciones SQL (`duerme_empezar`, `duerme_actuar`, `_duerme_noche_fin`), lo que ve en `duerme_vista`, su pantalla en `partida.js` y sus frases en `textos-narrador.js`.

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
