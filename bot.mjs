// Bot de ejemplo: juega una partida completa de FARO por HTTP, sin librerías.
//   node bot.mjs --url http://localhost:8099 --mesa 123456 --nombre Cormoran
// También sirve como plantilla para cualquier agente: todo es fetch + JSON.
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : "true"]);
    return acc;
  }, [])
);
const URL_BASE = (args.url || process.env.FARO_URL || "http://localhost:8099").replace(/\/$/, "");
const NOMBRE = args.nombre || "Cormoran";

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(ruta, cuerpo) {
  const r = await fetch(URL_BASE + ruta, {
    method: cuerpo ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const d = await r.json();
  if (d.ok === false) throw new Error(d.error);
  return d;
}

function valor(c) {
  let v = c.puntos || 0;
  if (c.aceite) v += c.aceite / 3;
  return v;
}

async function main() {
  let codigo = args.mesa, token = args.token;
  if (!codigo) {
    const d = await api("/api/match", { jugador: NOMBRE, bots: 1, empezar: false });
    codigo = d.codigo; token = d.token;
    console.log(`mesa ${codigo} creada por ${NOMBRE}`);
  } else if (!token) {
    const d = await api("/api/match/join", { codigo, jugador: NOMBRE });
    token = d.token;
    console.log(`me senté en la mesa ${codigo} como ${NOMBRE}`);
  }

  let s = (await api(`/api/match/${codigo}/state?token=${token}`)).estado;
  if (s.fase === "espera") {
    try {
      await api(`/api/match/${codigo}/start`, { token, bots: 1 });
      s = (await api(`/api/match/${codigo}/state?token=${token}`)).estado;
    } catch (e) {
      console.log("esperando a que el anfitrión empiece…");
    }
  }

  let vueltas = 0;
  while (s.fase !== "fin" && vueltas++ < 400) {
    if (s.fase === "puja" && s.vos?.esperandoPuja) {
      const mejor = Math.max(...s.mesa.map(valor));
      let quiero = mejor >= 3 ? 3 : mejor >= 2 ? 2 : 1;
      if (s.ronda === s.rondasTotales) quiero += 1; // última ronda: guardar aceite no sirve
      const monto = Math.max(0, Math.min(quiero, s.podesPujar));
      s = (await api(`/api/match/${codigo}/action`, { token, action: { type: "bid", amount: monto } })).estado;
      console.log(`pujo ${monto}`);
    } else if (s.fase === "pick" && s.teToca) {
      const carta = [...s.mesa].sort((a, b) => valor(b) - valor(a))[0];
      s = (await api(`/api/match/${codigo}/action`, { token, action: { type: "pick", card: carta.id } })).estado;
      console.log(`tomo ${carta.nombre}`);
    } else {
      await espera(700);
      s = (await api(`/api/match/${codigo}/state?token=${token}`)).estado;
      if (s.fase === "ronda_cerrada") await espera(300);
    }
  }

  const yo = s.jugadores.find((j) => j.id === s.vos.id);
  console.log(`\nfin: ${s.ganador ? s.ganador.nombre + " gana con " + s.ganador.puntaje + " pts" : "sin ganador"}`);
  console.log(`mis puntos: ${yo.puntaje} · cartas: ${yo.tomadas.join(", ") || "ninguna"}`);
  const log = await api(`/api/match/${codigo}/log`);
  console.log(`bitácora: ${log.bitacora.length} eventos`);
}

main().catch((e) => { console.error("error:", e.message); process.exit(1); });
