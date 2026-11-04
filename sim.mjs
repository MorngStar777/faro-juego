// sim.mjs — mide si hay una estrategia dominante: cuatro políticas de puja se
// enfrentan en partidas reales por HTTP. No simula reglas por su cuenta: usa el
// mismo servidor que juega un humano.
//
//   node sim.mjs                       # 40 partidas por pareja, puerto 8080
//   N=15 FARO_URL=http://localhost:8099 node sim.mjs
const BASE = process.env.FARO_URL || "http://localhost:8080";
const N = Number(process.env.N || 40);

async function api(ruta, cuerpo) {
  const r = await fetch(BASE + ruta, {
    method: cuerpo ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const d = await r.json();
  if (d.ok === false) throw new Error(d.error);
  return d;
}
const val = (c) => (c.puntos || 0) + (c.aceite ? c.aceite / 3 : 0);

const politicas = {
  // puja fuerte mientras haya faro en la mesa
  agresiva: (s) => (s.mesa.some((c) => c.tipo === "faro") ? 3 : 1),
  // puja lo mínimo y guarda aceite para el final
  ahorradora: (s) => (s.ronda === s.rondasTotales ? 4 : s.mesa.some((c) => c.tipo === "tormenta") ? 2 : 0),
  // puja media constante
  media: () => 1,
  // puja todo en las dos últimas rondas
  finalista: (s) => (s.ronda >= s.rondasTotales - 1 ? 4 : 0),
};

async function jugar(pa, pb) {
  const d = await api("/api/match", { jugador: pa, bots: 0, empezar: false });
  const codigo = d.codigo;
  const e = await api("/api/match/join", { codigo, jugador: pb });
  const tokens = [d.token, e.token];
  const nombres = [pa, pb];
  await api(`/api/match/${codigo}/start`, { token: tokens[0], bots: 0 });

  for (let guardia = 0; guardia < 400; guardia++) {
    let actuo = false;
    for (let i = 0; i < 2; i++) {
      const mi = (await api(`/api/match/${codigo}/state?token=${tokens[i]}`)).estado;
      if (mi.fase === "fin") return { ganador: mi.ganador.nombre, puntos: mi.jugadores.map((j) => [j.nombre, j.puntaje]) };
      if (mi.fase === "puja" && mi.vos.esperandoPuja) {
        const monto = Math.max(0, Math.min(politicas[nombres[i]](mi), mi.podesPujar));
        await api(`/api/match/${codigo}/action`, { token: tokens[i], action: { type: "bid", amount: monto } });
        actuo = true;
      } else if (mi.fase === "pick" && mi.teToca) {
        const c = [...mi.mesa].sort((a, b) => val(b) - val(a))[0];
        await api(`/api/match/${codigo}/action`, { token: tokens[i], action: { type: "pick", card: c.id } });
        actuo = true;
      }
    }
    if (!actuo) await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("la partida no terminó");
}

const pares = [
  ["agresiva", "ahorradora"],
  ["agresiva", "media"],
  ["ahorradora", "finalista"],
  ["media", "finalista"],
];

for (const [a, b] of pares) {
  const victorias = { [a]: 0, [b]: 0 };
  const suma = { [a]: 0, [b]: 0 };
  for (let i = 0; i < N; i++) {
    const r = await jugar(a, b);
    victorias[r.ganador] = (victorias[r.ganador] || 0) + 1;
    for (const [n, p] of r.puntos) suma[n] = (suma[n] || 0) + p;
  }
  console.log(
    `${a} vs ${b}: ${victorias[a]}-${victorias[b]} · puntos medios ${a}=${(suma[a] / N).toFixed(2)} ${b}=${(suma[b] / N).toFixed(2)}`
  );
}
