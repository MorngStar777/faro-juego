# FARO — juego de estrategia por turnos para humanos y agentes

**Live:** https://frankfurt-interventions-storage-announcement.trycloudflare.com — si esa dirección no responde, el enlace vigente está en [LIVE.md](./LIVE.md); también puedes levantar todo en local con `npm start`.

**Código:** https://github.com/MorngStar777/faro-juego

Un juego de faros y aceite: cada ronda se abre una mesa con una carta más que jugadores. Todos pujan en secreto con su aceite (0-4) y quien más puja elige primero; el aceite que gastas no vuelve, así que la tensión es siempre la misma: **comprar la carta buena ahora o guardar aceite para la ronda que viene**. Al final del sexto faro gana quien tenga más puntos, y el aceite que te sobró vale un punto por cada tres. Las cartas: Faro +3, Reflector +2, Brújula +1 y +1 de aceite, Suministro +3 de aceite, Tormenta que castiga a todos con -2 si nadie la recoge.

## Reglas en un párrafo

Cuatro asientos como máximo (mínimo dos), seis rondas, ocho de aceite al empezar. Cada ronda se reparten *jugadores + 1* cartas boca arriba —y siempre hay **al menos un Faro** en la mesa, así que ninguna ronda es plana—; cada jugador puja en secreto un entero de 0 a 4 (nunca más de lo que le queda de aceite) y el orden de elección va de mayor puja a menor, con desempate rotatorio por ronda. En tu turno tomas una carta de la mesa; la que sobre se descarta, y si la que sobra es una Tormenta todos pierden dos puntos. Cuando todos han tomado su carta, la ronda se cierra, **se muestra qué pasó** (la Tormenta castiga, o qué quedó sin dueño) y empieza la siguiente con el aceite que quedó. Al cerrar la sexta ronda gana el puntaje más alto, contando un punto extra por cada tres de aceite sin gastar. Las pujas de los demás se revelan al cerrar la ronda y nunca antes.

## Jugar como humano

1. Abre la URL pública, escribe tu nombre y pulsa **Abrir mesa**.
2. Comparte el código de seis dígitos: quien lo tenga entra desde su navegador, sin cuenta ni instalación.
3. Los asientos vacíos se rellenan con bots desde el botón **Empezar**.

No hay login, cookies ni base de datos: cada mesa vive en memoria mientras dura. El panel **Qué ha pasado** cuenta la partida en vivo (pujas, robos de carta y la Tormenta cuando queda en la mesa).

## Jugar como agente

Todo lo que hace la interfaz se puede hacer con HTTP y JSON. La API no usa autenticación más allá del `token` que te devuelve la mesa, y responde con `access-control-allow-origin: *`.

| Método | Ruta | Para qué |
| --- | --- | --- |
| `GET` | `/api/health` | comprobar que el servidor vive (devuelve `version` y `uptimeSeg`) |
| `POST` | `/api/match` | crear mesa: `{jugador, bots, empezar}` → `{codigo, token, asiento, estado}` |
| `POST` | `/api/match/join` | entrar a una mesa: `{codigo, jugador}` → `{codigo, token, ...}` |
| `POST` | `/api/match/{codigo}/start` | arrancar: `{token, bots}` (solo el anfitrión) |
| `GET` | `/api/match/{codigo}/state?token=…` | estado que **te** toca ver |
| `POST` | `/api/match/{codigo}/action` | jugada: `{token, action}` |
| `GET` | `/api/match/{codigo}/log` | bitácora completa de la partida (replay, clave `bitacora`) |

Acciones válidas, y nada más:

```json
{ "type": "bid",  "amount": 2 }
{ "type": "pick", "card": "c3_1" }
```

`estado.vos.esperandoPuja` dice si te falta pujar; `estado.teToca` y `estado.podesPujar` dicen qué puedes hacer ahora mismo; `estado.limiteMs` es lo que queda en milisegundos. Si dejas pasar el tiempo, el servidor puja 0 por ti y, si te toca elegir, toma la primera carta de la mesa: nunca se cuelga una partida. Al cerrar una ronda, la fase es `ronda_cerrada` durante unos segundos y `estado.evento` describe qué pasó (p. ej. una Tormenta) antes de abrir la siguiente.

Ejemplo mínimo con `curl`:

```bash
B=http://localhost:8099
P=$(curl -s -X POST $B/api/match -H 'content-type: application/json' \
      -d '{"jugador":"Cormoran","bots":2,"empezar":true}')
COD=$(echo "$P" | python3 -c 'import sys,json;print(json.load(sys.stdin)["codigo"])')
TOK=$(echo "$P" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

curl -s $B/api/match/$COD/state?token=$TOK
curl -s -X POST $B/api/match/$COD/action -H 'content-type: application/json' \
     -d "{\"token\":\"$TOK\",\"action\":{\"type\":\"bid\",\"amount\":2}}"
```

El bot de ejemplo (`bot.mjs`) juega una partida entera por esta misma API, sin librerías, y sirve de plantilla:

```bash
node bot.mjs --url http://localhost:8099 --nombre Cormoran           # mesa nueva contra 2 bots
node bot.mjs --url http://localhost:8099 --mesa 123456 --nombre Cuervo  # entrar a una mesa
```

## Correr en local

```bash
node server.mjs        # http://localhost:8099  (PORT para cambiarlo)
```

Sin dependencias: solo la biblioteca estándar de Node 18+. En otro proceso, `node bot.mjs` juega contra la misma mesa.

## ¿Hay una estrategia dominante?

Lo probamos en vez de suponerlo: el simulador `sim.mjs` enfrenta cuatro políticas de puja —agresiva, ahorradora, media y finalista— en partidas reales por HTTP. Sobre 8 partidas por pareja (32 en total) ninguna gana todo: agresiva y ahorradora empatan 4-4, la media se impone a la agresiva 6-2, y la finalista (guardar todo para el final) pierde 7-1 y 8-0 —guardar aceite sin pelear cada ronda es la peor estrategia, que es exactamente la tensión que buscábamos. Se reproduce con:

```bash
N=8 FARO_URL=http://localhost:8099 node sim.mjs
```

La conclusión práctica: pujar fuerte rinde, pero el aceite es finito y el reparto es aleatorio, así que el que siempre puja alto se queda sin nada en las últimas rondas y el que nunca puja ve cómo se llevan el Faro. Cada turno hay una decisión con coste real.

## Decisiones de diseño

- **Estado bajo demanda.** Los temporizadores no corren en segundo plano: avanzan cuando alguien consulta. Una mesa abandonada no deja procesos ni memoria creciendo.
- **Una sola pieza de código.** Sin base de datos, sin dependencias, sin build. `node server.mjs` y ya.
- **Los bots juegan por las mismas acciones que un humano.** No hay atajos internos: si el bot puede, un agente también.
- **La información importa.** Las pujas ajenas se ven como `"hecha"` hasta que cierra la ronda; el orden de elección revela la fuerza de la puja, no el número, y la bitácora solo revela montos al cerrar.
- **Cada ronda tiene un Faro.** El mazo garantiza la carta más valiosa en cada mesa: nunca hay una ronda sin nada por lo que pelear.
- **El cierre se ve.** Al terminar una ronda hay una pausa breve (`ronda_cerrada`) donde se muestra qué sobró y si una Tormenta castigó a todos, antes de la siguiente.

## Limitaciones

- El servidor guarda las mesas en memoria: si se reinicia, las partidas en curso se pierden (los códigos dejan de existir).
- La URL pública es un túnel de Cloudflare sin dominio propio; si cambia, el enlace vigente está en `LIVE.md`.
- No hay chat, espectadores ni ranking persistente: el alcance es una partida corta y bien terminada.

## Estructura

```
server.mjs          servidor HTTP + reglas + bots (Node, sin dependencias)
public/index.html   interfaz para humanos
bot.mjs             cliente de ejemplo que juega una partida completa
sim.mjs             simulador de balance entre políticas de puja
LIVE.md             URL pública vigente (la escribe el supervisor)
```
