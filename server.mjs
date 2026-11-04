// FARO — juego de estrategia por turnos para humanos y agentes.
// Un solo archivo, sin dependencias: node server.mjs
import http from "node:http";
import { randomUUID, randomInt } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT || 8080);
const RONDAS = 6;
const ACEITE_INICIAL = 8;
const TOKEN_BID = 45_000; // ms para ofertar
const TOKEN_PICK = 30_000; // ms por elección
const MAX_BID = 4;

const CARTAS = {
  faro: { nombre: "Faro", puntos: 3, texto: "+3 puntos" },
  reflector: { nombre: "Reflector", puntos: 2, texto: "+2 puntos" },
  brujula: { nombre: "Brújula", puntos: 1, aceite: 1, texto: "+1 punto y +1 aceite" },
  suministro: { nombre: "Suministro", puntos: 0, aceite: 3, texto: "+3 aceite" },
  tormenta: { nombre: "Tormenta", puntos: 0, global: -2, texto: "si queda en la mesa al final de la ronda, todos pierden 2 puntos" },
};
const MAZO = { faro: 10, reflector: 5, brujula: 6, suministro: 5, tormenta: 4 };

const partidas = new Map();

function barajar(lista) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function nuevoMazo(numJugadores) {
  const total = RONDAS * (numJugadores + 1);
  const baraja = [];
  for (const [tipo, n] of Object.entries(MAZO)) for (let i = 0; i < n; i++) baraja.push({ tipo });
  const mezcla = barajar(baraja);
  return mezcla.slice(0, total);
}

function crearPartida(nombre) {
  const codigo = String(randomInt(100000, 999999));
  const p = {
    codigo,
    creada: Date.now(),
    ronda: 0,
    fase: "espera",
    mazo: null,
    mesa: [],
    jugadores: [],
    orden: [],
    turnoPick: 0,
    limite: 0,
    evento: null,
    ultimo: null,
    bitacora: [],
    nombre: nombre || "Mesa",
  };
  partidas.set(codigo, p);
  return p;
}

function agregarJugador(p, nombre, esBot = false) {
  if (p.jugadores.length >= 4) return null;
  if (p.fase !== "espera") return null;
  const jugador = {
    id: p.jugadores.length,
    token: randomUUID(),
    nombre: nombre || `Jugador ${p.jugadores.length + 1}`,
    bot: esBot,
    aceite: ACEITE_INICIAL,
    puntos: 0,
    tomadas: [],
    puja: null,
  };
  p.jugadores.push(jugador);
  return jugador;
}

// turno de puja ------------------------------------------------------------
function iniciarRonda(p) {
  p.ronda += 1;
  p.mesa = p.mazo.splice(0, p.jugadores.length + 1).map((c, i) => ({ id: `c${p.ronda}_${i}`, tipo: c.tipo }));
  p.fase = "puja";
  p.evento = null;
  p.orden = [];
  p.turnoPick = 0;
  p.limite = Date.now() + TOKEN_BID;
  for (const j of p.jugadores) j.puja = null;
}

function cerrarPujas(p) {
  for (const j of p.jugadores) if (j.puja === null) j.puja = 0;
  const base = p.ronda % Math.max(1, p.jugadores.length);
  p.orden = [...p.jugadores].sort((a, b) => {
    if (b.puja !== a.puja) return b.puja - a.puja;
    return ((a.id - base + 4) % 4) - ((b.id - base + 4) % 4);
  });
  for (const j of p.jugadores) {
    j.aceite -= j.puja;
    p.bitacora.push({ tipo: "puja", jugador: j.nombre, monto: j.puja, aceite: j.aceite });
  }
  p.fase = "pick";
  p.turnoPick = 0;
  p.limite = Date.now() + TOKEN_PICK;
}

function aplicarCarta(p, jugador, carta) {
  const def = CARTAS[carta.tipo];
  jugador.puntos += def.puntos || 0;
  if (def.aceite) jugador.aceite += def.aceite;
  jugador.tomadas.push(carta.tipo);
  p.bitacora.push({ tipo: "toma", jugador: jugador.nombre, carta: carta.tipo, puntos: jugador.puntos, aceite: jugador.aceite });
}

function avanzarPick(p) {
  p.turnoPick += 1;
  p.limite = Date.now() + TOKEN_PICK;
  if (p.turnoPick >= p.jugadores.length) cerrarRonda(p);
}

function cerrarRonda(p) {
  const sobra = p.mesa[0];
  if (sobra) {
    const def = CARTAS[sobra.tipo];
    if (def.global) {
      for (const j of p.jugadores) j.puntos += def.global;
      p.evento = `Quedó una ${def.nombre} en la mesa: todos pierden ${Math.abs(def.global)} puntos.`;
      p.bitacora.push({ tipo: "evento", carta: sobra.tipo, detalle: p.evento });
    } else {
      p.evento = `Quedó un ${def.nombre} sin dueño: no pasa nada.`;
    }
    p.mesa = [];
  }
  p.fase = "ronda_cerrada";
  if (p.ronda >= RONDAS) {
    p.fase = "fin";
    p.ganador = [...p.jugadores].sort((a, b) => puntaje(b) - puntaje(a))[0].id;
    p.bitacora.push({ tipo: "fin", ganador: p.jugadores[p.ganador].nombre });
  }
}

function puntaje(j) {
  return j.puntos + Math.floor(Math.max(0, j.aceite) / 3);
}

function estado(p, jugador) {
  const turnoActual = p.fase === "pick" ? p.orden[p.turnoPick] : null;
  return {
    codigo: p.codigo,
    ronda: p.ronda,
    rondasTotales: RONDAS,
    fase: p.fase,
    limiteMs: p.fase === "puja" || p.fase === "pick" ? Math.max(0, p.limite - Date.now()) : 0,
    mesa: p.mesa.map((c) => ({ id: c.id, tipo: c.tipo, ...CARTAS[c.tipo] })),
    evento: p.evento,
    ultimo: p.ultimo,
    vos: jugador
      ? { id: jugador.id, nombre: jugador.nombre, aceite: jugador.aceite, puntos: jugador.puntos, puntaje: puntaje(jugador), esperandoPuja: jugador.puja === null }
      : null,
    jugadores: [...p.jugadores]
      .sort((a, b) => puntaje(b) - puntaje(a))
      .map((j) => ({
        id: j.id,
        nombre: j.nombre,
        bot: j.bot,
        aceite: j.aceite,
        puntos: j.puntos,
        puntaje: puntaje(j),
        tomadas: j.tomadas,
        puja: p.fase === "puja" && j.id !== jugador?.id ? (j.puja === null ? null : "hecha") : j.puja,
        turno: p.fase === "pick" && turnoActual?.id === j.id,
      })),
    teToca: p.fase === "puja" ? Boolean(jugador && jugador.puja === null) : p.fase === "pick" ? turnoActual?.id === jugador?.id : false,
    podesPujar: p.fase === "puja" && jugador ? Math.min(MAX_BID, jugador.aceite) : 0,
    ganador: p.fase === "fin" ? { nombre: p.jugadores[p.ganador].nombre, puntaje: puntaje(p.jugadores[p.ganador]) } : null,
  };
}

function error(res, code, msg) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: false, error: msg }));
}

function json(res, datos, code = 200) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(datos));
}

function jugadorPorToken(p, token) {
  return p.jugadores.find((j) => j.token === token) || null;
}

// bots ---------------------------------------------------------------------
function valorCarta(carta, estadoActual) {
  const def = CARTAS[carta.tipo];
  let v = def.puntos || 0;
  if (def.aceite) v += def.aceite / 3;
  if (def.global) v -= 0.5; // quitarla de la mesa también vale
  return v;
}

function jugarBots(p) {
  for (const j of p.jugadores) {
    if (!j.bot) continue;
    if (p.fase === "puja" && j.puja === null) {
      const mejor = Math.max(...p.mesa.map((c) => valorCarta(c, p)));
      let quiero = mejor >= 3 ? 3 : mejor >= 2 ? 2 : 1;
      if (p.ronda === RONDAS) quiero += 1; // última ronda: gastar no cuesta
      j.puja = Math.max(0, Math.min(quiero, MAX_BID, j.aceite));
      p.bitacora.push({ tipo: "puja_bot", jugador: j.nombre, monto: j.puja });
    }
    if (p.fase === "pick" && p.orden[p.turnoPick]?.id === j.id && p.mesa.length) {
      const mejor = [...p.mesa].sort((a, b) => valorCarta(b, p) - valorCarta(a, p))[0];
      p.mesa = p.mesa.filter((c) => c.id !== mejor.id);
      aplicarCarta(p, j, mejor);
      avanzarPick(p);
    }
  }
}

function avanzarSiToca(p) {
  if (p.fase === "puja" && p.jugadores.length >= 2 && p.jugadores.every((j) => j.puja !== null)) cerrarPujas(p);
  if (p.fase === "puja" && Date.now() > p.limite) cerrarPujas(p);
  if (p.fase === "pick" && Date.now() > p.limite && p.mesa.length) {
    const j = p.orden[p.turnoPick];
    const carta = p.mesa[0];
    p.mesa = p.mesa.filter((c) => c.id !== carta.id);
    p.ultimo = `${j.nombre} se quedó sin tiempo y tomó ${CARTAS[carta.tipo].nombre}.`;
    aplicarCarta(p, j, carta);
    avanzarPick(p);
  }
  if (p.fase === "ronda_cerrada") {
    if (p.ronda < RONDAS) iniciarRonda(p);
  }
}

function tick(p) {
  jugarBots(p);
  avanzarSiToca(p);
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".json": "application/json; charset=utf-8" };

async function servirEstatico(res, ruta) {
  const limpia = normalize(ruta).replace(/^(\.\.[/\\])+/, "");
  const archivo = join(process.cwd(), "public", limpia === "/" ? "index.html" : limpia);
  try {
    const datos = await readFile(archivo);
    res.writeHead(200, { "content-type": MIME[extname(archivo)] || "application/octet-stream" });
    res.end(datos);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("no está");
  }
}

function leerCuerpo(req) {
  return new Promise((resolve) => {
    let datos = "";
    req.on("data", (c) => (datos += c));
    req.on("end", () => {
      try {
        resolve(datos ? JSON.parse(datos) : {});
      } catch {
        resolve(null);
      }
    });
  });
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const ruta = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" });
    return res.end();
  }

  if (ruta === "/api/health") return json(res, { ok: true, juego: "faro", partidas: partidas.size });

  if (ruta === "/api/match" && req.method === "POST") {
    const cuerpo = (await leerCuerpo(req)) || {};
    const p = crearPartida(cuerpo.nombre);
    const j = agregarJugador(p, cuerpo.jugador || "Anfitrión");
    for (let i = 0; i < Number(cuerpo.bots || 0) && p.jugadores.length < 4; i++) agregarJugador(p, `Bot ${i + 1}`, true);
    if (cuerpo.empezar !== false && p.jugadores.length >= 2) {
      p.mazo = nuevoMazo(p.jugadores.length);
      iniciarRonda(p);
    }
    return json(res, { ok: true, codigo: p.codigo, token: j.token, asiento: j.id, estado: estado(p, j) }, 201);
  }

  if (ruta === "/api/match/join" && req.method === "POST") {
    const cuerpo = (await leerCuerpo(req)) || {};
    const p = partidas.get(String(cuerpo.codigo || ""));
    if (!p) return error(res, 404, "No existe esa mesa.");
    const j = agregarJugador(p, cuerpo.jugador);
    if (!j) return error(res, 409, "La mesa está llena o ya empezó.");
    return json(res, { ok: true, codigo: p.codigo, token: j.token, asiento: j.id, estado: estado(p, j) }, 201);
  }

  const mEstado = ruta.match(/^\/api\/match\/(\d{6})\/state$/);
  if (mEstado) {
    const p = partidas.get(mEstado[1]);
    if (!p) return error(res, 404, "No existe esa mesa.");
    tick(p);
    return json(res, { ok: true, estado: estado(p, jugadorPorToken(p, url.searchParams.get("token"))) });
  }

  const mLog = ruta.match(/^\/api\/match\/(\d{6})\/log$/);
  if (mLog) {
    const p = partidas.get(mLog[1]);
    if (!p) return error(res, 404, "No existe esa mesa.");
    return json(res, { ok: true, bitacora: p.bitacora, jugadores: p.jugadores.map((j) => ({ nombre: j.nombre, puntaje: puntaje(j) })) });
  }

  const mStart = ruta.match(/^\/api\/match\/(\d{6})\/start$/);
  if (mStart && req.method === "POST") {
    const cuerpo = (await leerCuerpo(req)) || {};
    const p = partidas.get(mStart[1]);
    if (!p) return error(res, 404, "No existe esa mesa.");
    if (p.fase !== "espera") return error(res, 409, "Ya empezó.");
    if (p.jugadores.length < 2) return error(res, 409, "Faltan jugadores: mínimo 2.");
    if (p.jugadores[0].token !== cuerpo.token) return error(res, 403, "Solo el anfitrión puede empezar.");
    for (let i = 0; i < Number(cuerpo.bots || 0) && p.jugadores.length < 4; i++) agregarJugador(p, `Bot ${p.jugadores.length}`, true);
    p.mazo = nuevoMazo(p.jugadores.length);
    iniciarRonda(p);
    tick(p);
    return json(res, { ok: true, estado: estado(p, p.jugadores[0]) });
  }

  const mAccion = ruta.match(/^\/api\/match\/(\d{6})\/action$/);
  if (mAccion && req.method === "POST") {
    const cuerpo = (await leerCuerpo(req)) || {};
    const p = partidas.get(mAccion[1]);
    if (!p) return error(res, 404, "No existe esa mesa.");
    tick(p);
    const j = jugadorPorToken(p, cuerpo.token);
    if (!j) return error(res, 403, "Token inválido para esa mesa.");
    const accion = cuerpo.action || {};
    if (accion.type === "bid") {
      if (p.fase !== "puja") return error(res, 409, "No es momento de pujar.");
      if (j.puja !== null) return error(res, 409, "Ya pujaste esta ronda.");
      const monto = Number(accion.amount);
      if (!Number.isInteger(monto) || monto < 0 || monto > MAX_BID) return error(res, 400, `La puja va de 0 a ${MAX_BID}.`);
      if (monto > j.aceite) return error(res, 400, "No tienes tanto aceite.");
      j.puja = monto;
      p.bitacora.push({ tipo: "puja_hecha", jugador: j.nombre, monto });
    } else if (accion.type === "pick") {
      if (p.fase !== "pick") return error(res, 409, "No es momento de elegir carta.");
      if (p.orden[p.turnoPick]?.id !== j.id) return error(res, 409, "No es tu turno de elegir.");
      const carta = p.mesa.find((c) => c.id === accion.card);
      if (!carta) return error(res, 400, "Esa carta no está en la mesa.");
      p.mesa = p.mesa.filter((c) => c.id !== carta.id);
      aplicarCarta(p, j, carta);
      p.ultimo = `${j.nombre} tomó ${CARTAS[carta.tipo].nombre}.`;
      avanzarPick(p);
    } else {
      return error(res, 400, 'Acción desconocida: usa {"type":"bid","amount":n} o {"type":"pick","card":"id"}.');
    }
    tick(p);
    return json(res, { ok: true, estado: estado(p, j) });
  }

  if (ruta.startsWith("/api/")) return error(res, 404, "Ruta de API desconocida. Ver README.");
  if (req.method === "GET") return servirEstatico(res, ruta);
  return error(res, 405, "Método no permitido.");
});

// los temporizadores solo avanzan cuando alguien consulta: sin proceso de fondo,
// una partida abandonada no rompe nada.
servidor.listen(PORT, () => console.log(`FARO escuchando en :${PORT}`));
