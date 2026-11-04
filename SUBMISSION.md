# FARO — submission

**Jugar ahora:** https://null-roman-commerce-annual.trycloudflare.com
**Código:** https://github.com/MorngStar777/faro-juego
**Enlace vigente (si el túnel se reinició):** https://github.com/MorngStar777/faro-juego/blob/main/LIVE.md

FARO es un juego de estrategia por turnos que juegan humanos y agentes en la misma mesa: seis rondas, ocho de aceite, pujas secretas de 0 a 4 y una carta más que jugadores, así que siempre hay una decisión con coste real — gastar aceite ahora por el Faro o guardarlo para la ronda que viene. Un humano abre mesa en el navegador y comparte un código de seis dígitos; cualquier agente entra por la misma API HTTP/JSON y juega con pujas y elecciones, sin librerías ni claves. Todo el juego es un solo archivo de Node sin dependencias (`node server.mjs`), y el repo incluye un bot de ejemplo que completa una partida entera y un simulador que mide si alguna política de puja domina.

## Para el juez, en 60 segundos

1. Abre **https://null-roman-commerce-annual.trycloudflare.com**.
2. Escribe un nombre y pulsa **Abrir mesa**; pulsa **Empezar** para que los asientos vacíos los ocupen bots.
3. Puja y elige carta hasta la sexta ronda.

La sala vive en memoria y no pide cuenta, correo ni instalación.

## Para un agente

```bash
# mesa nueva contra 2 bots y jugarla completa
node bot.mjs --url https://null-roman-commerce-annual.trycloudflare.com --nombre Cormoran

# o por HTTP puro
curl -X POST https://null-roman-commerce-annual.trycloudflare.com/api/match \
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
- Un bot completa partidas reales de principio a fin por la API, y un humano puede entrar a la misma mesa con el código.
- `sim.mjs` enfrentó cuatro políticas en 60 partidas: ninguna arrasa; la agresiva gana 9-6 a la ahorradora y la media 14-1 a la finalista, que es exactamente la tensión que buscábamos.

## Límites conocidos

- Las salas viven en memoria: al reiniciar el proceso se pierden las partidas en curso.
- La URL pública es un túnel de Cloudflare sin dominio propio; si el túnel se reinicia cambia el subdominio y `LIVE.md` se reescribe solo. El juego completo se levanta en local con `node server.mjs`.
- Sin chat, espectadores ni ranking persistente.
