// CREMA · fonte de dados simulada. Implementa a MESMA interface de api.js,
// então a UI não sabe se os dados são reais ou mock (habilita a entrega visual-first).
// As curvas base vêm do handoff (renderVals do mock D4).

const P = [[0,0],[1,.6],[2,1.3],[3,2.3],[4,2.9],[5,3.1],[6,3.2],[7,3.1],[8,3.0],[10,3.0],[12,3.0],[13,3.0],[13.5,3.0],[14,4.6],[14.5,7],[15,8.4],[16,9.0],[18,9.1],[20,9.05],[22,8.95],[25,8.85],[28,8.65],[30,8.5]];
const F = [[0,3.1],[0.6,5],[1.3,6.8],[2,7.7],[2.6,8.0],[3.3,7.8],[4,7.0],[5,5.6],[6,4.2],[7,2.8],[8,1.7],[9,1.25],[10,1.12],[12,1.1],[13.6,1.1],[14.2,1.5],[15,2.3],[15.6,2.62],[16.4,2.4],[17.4,2.05],[19,1.92],[24,1.9],[30,1.9]];
const T = [[0,88],[6,88.1],[14,87.8],[16,88.4],[24,88.1],[30,88]];
// peso subindo suavemente durante a extração (mock plausível)
const W = [[0,0],[8,0],[14,1],[20,18],[26,34],[30,42]];

const T_MAX = 30;
const TICK_MS = 100; // ~10 Hz, como o /machine/snapshot do Bridge

// interpolação linear numa curva [t, v]
function sample(curve, t) {
  if (t <= curve[0][0]) return curve[0][1];
  if (t >= curve[curve.length - 1][0]) return curve[curve.length - 1][1];
  for (let i = 1; i < curve.length; i++) {
    const [t1, v1] = curve[i];
    if (t <= t1) {
      const [t0, v0] = curve[i - 1];
      const f = (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * f;
    }
  }
  return curve[curve.length - 1][1];
}

export function createMockSource() {
  const snapshotCbs = new Set();
  const scaleCbs = new Set();
  const startCbs = new Set();
  const endCbs = new Set();
  let timer = null;
  let t = 0;

  // balança começa DESCONECTADA (como o handoff). Só reporta peso após "connect".
  let scaleConnected = false;
  let tareOffset = 0;

  function tick() {
    t += TICK_MS / 1000;
    const pressure = sample(P, t);
    const flow = sample(F, t);
    const temp = sample(T, t);

    for (const cb of snapshotCbs) {
      // o mock só emite durante um shot → running:true (main.js alimenta o gráfico ao vivo)
      cb({ t, running: true, state: 'espresso', pressure, flow, mixTemp: 94.2, groupTemp: 106.5, temp });
    }
    const weight = scaleConnected ? Math.max(0, sample(W, t) - tareOffset) : 0;
    for (const cb of scaleCbs) cb({ weight, connected: scaleConnected });

    if (t >= T_MAX) { stopShot(); for (const cb of endCbs) cb(); }
  }

  function startShot() {
    stopShot();
    t = 0;
    for (const cb of startCbs) cb();
    timer = setInterval(tick, TICK_MS);
  }
  function stopShot() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    kind: 'mock',
    onSnapshot(cb) { snapshotCbs.add(cb); return () => snapshotCbs.delete(cb); },
    onScale(cb) { scaleCbs.add(cb); return () => scaleCbs.delete(cb); },
    onShotStart(cb) { startCbs.add(cb); return () => startCbs.delete(cb); },
    onShotEnd(cb) { endCbs.add(cb); return () => endCbs.delete(cb); },
    start() { startShot(); },
    running() { return timer != null; },
    stop() { stopShot(); },
    startShot,
    stopShot,

    // balança: liguei a balança (BT) → conecta; tare → zera o ponto atual
    connectScale() { scaleConnected = true; tareOffset = 0; },
    tareScale() { tareOffset = sample(W, t); },
  };
}
