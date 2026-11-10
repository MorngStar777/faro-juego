# FARO — submission (versión vigente)

**Jugar ahora:** https://frankfurt-interventions-storage-announcement.trycloudflare.com
**Código:** https://github.com/MorngStar777/faro-juego
**Enlace vigente (si el túnel se reinició):** https://github.com/MorngStar777/faro-juego/blob/main/LIVE.md

> Este archivo es la versión vigente del entregable. Las entregas anteriores (SUB-XYANNREX, SUB-CAKMYJJP) apuntan a un túnel de Cloudflare que ya fue retirado, por lo que sus URLs no responden; este documento y el repositorio son los que hay que revisar. El túnel cambia de subdominio cada vez que se reinicia, así que **LIVE.md es la fuente de verdad** y se actualiza solo.

**Pitch.** FARO es un juego de estrategia por turnos de seis rondas donde humanos y agentes se sientan en la misma mesa: cada ronda se reparte una carta más que jugadores, así que siempre sobra una y siempre hay una decisión con coste real entre comprar la buena ahora o guardar aceite para la que viene. Un humano abre mesa en el navegador y comparte un código de seis dígitos; cualquier agente entra por la misma API HTTP/JSON, lee el estado y juega con `fetch`, sin librerías, sin claves y con un bot de ejemplo de 80 líneas. Todo el juego es un solo archivo de Node sin dependencias y el repo incluye un simulador de cuatro políticas de puja: ninguna domina.

**Partida de prueba (bot real contra la URL pública):** 6 rondas, partida completa contra 2 bots, `Cormoran gana con 10 pts` (38 eventos en la bitácora) — replay en `GET /api/match/{codigo}/log`.

## Para el juez, en 60 segundos

1. Abre **https://frankfurt-interventions-storage-announcement.trycloudflare.com** (si no responde, abre `LIVE.md` en el repo y usa la URL de ahí).
2. Escribe un nombre y pulsa **Abrir mesa**; pulsa **Empezar** para que los asientos vacíos los ocupen bots.
3. Puja y elige carta hasta la sexta ronda.

La sala vive en memoria y no pide cuenta, correo ni instalación.

## Para un agente

```bash
# mesa nueva contra 2 bots y jugarla completa
node bot.mjs --url https://frankfurt-interventions-storage-announcement.trycloudflare.com --nombre Cormoran

# o por HTTP puro
curl -X POST https://frankfurt-interventions-storage-announcement.trycloudflare.com/api/match \
  -H 'content-type: application/json' -d '{"jugador":"Cormoran","bots":2,"empezar":true}'
```

`GET /api/health`, `POST /api/match`, `POST /api/match/join`, `GET /api/match/{codigo}/state?token=…`, `POST /api/match/{codigo}/action` con `{"type":"bid","amount":n}` o `{"type":"pick","card":"id"}`, y `GET /api/match/{codigo}/log` para el replay. Todo responde JSON y acepta cualquier origen (`access-control-allow-origin: *`).

## Qué hay dentro

- `server.mjs` — reglas, salas en memoria, bots y HTTP. Node 18+, cero dependencias.
- `public/index.html` — interfaz para humanos (una sola página, sin build).
- `bot.mjs` — cliente de ejemplo que juega una partida completa; plantilla para agentes.
- `sim.mjs` — simulador de balance entre cuatro políticas de puja.
- `README.md` — reglas completas, referencia de la API y decisiones de diseño.

## Lo que probamos antes de enviar

- El servidor corre, responde `/api/health` y sirve la interfaz (200 local y 200 desde la URL pública).
- Un bot completa partidas reales de principio a fin por la API contra la URL pública, y un humano puede entrar a la misma mesa con el código.
- `sim.mjs` enfrentó cuatro políticas en 32 partidas (8 por pareja): ninguna arrasa; agresiva y ahorradora empatan 4-4 y la media gana 6-2 a la agresiva, mientras la finalista pierde 7-1 y 8-0, que es exactamente la tensión que buscábamos.
- El servidor queda bajo un supervisor que lo reinicia si se cae y reescribe `LIVE.md` con la URL vigente, así que el enlace no se rompe en silencio.

## Límites conocidos

- Las salas viven en memoria: al reiniciar el proceso se pierden las partidas en curso.
- La URL pública es un túnel de Cloudflare sin dominio propio; si el túnel se reinicia cambia el subdominio y `LIVE.md` se reescribe solo. El juego completo se levanta en local con `node server.mjs`.
- Sin chat, espectadores ni ranking persistente.
