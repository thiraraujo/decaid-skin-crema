// CREMA v2 · fonte simulada. Implementa a MESMA interface de api.js, para desenvolvimento
// visual sem hardware. Com Bridge conectado a skin NUNCA usa esta fonte (regra de ouro).
// Os dados espelham o handoff (docs/handoff-v2) para conferir as telas 1:1.

const P = [[0,0],[1,.6],[2,1.3],[3,2.3],[4,2.9],[5,3.1],[6,3.2],[7,3.1],[8,3.0],[10,3.0],[12,3.0],[13,3.0],[13.5,3.0],[14,4.6],[14.5,7],[15,8.4],[16,9.0],[18,9.1],[20,9.05],[22,8.95],[25,8.85],[28,8.65],[30,8.5]];
const F = [[0,3.1],[0.6,5],[1.3,6.8],[2,7.7],[2.6,8.0],[3.3,7.8],[4,7.0],[5,5.6],[6,4.2],[7,2.8],[8,1.7],[9,1.25],[10,1.12],[12,1.1],[13.6,1.1],[14.2,1.5],[15,2.3],[15.6,2.62],[16.4,2.4],[17.4,2.05],[19,1.92],[24,1.9],[30,1.9]];
const T = [[0,88],[6,88.1],[14,87.8],[16,88.4],[24,88.1],[30,88]];
const W = [[0,0],[8,0],[14,1],[20,18],[26,34],[30,42]];

const T_MAX = 30;
const TICK_MS = 100;   // ~10 Hz, como o /machine/snapshot do Bridge

// steps do perfil simulado — dão nome aos blocos de fase da tela 02
const SIM_STEPS = [
  { name: 'Prefill', seconds: 6, temperature: 88 },
  { name: 'Preinfusion', seconds: 10, temperature: 88 },
  { name: 'Dripping', seconds: 4, temperature: 88 },
  { name: 'Pressurize', seconds: 6, temperature: 88 },
  { name: 'Extraction', seconds: 23, temperature: 88 },
  { name: 'Decline', seconds: 10, temperature: 88 },
];
const SIM_TOTAL = SIM_STEPS.reduce((a, s) => a + s.seconds, 0);

// índice do step para o instante `t` do shot simulado (T_MAX comprimido em SIM_TOTAL)
function simFrame(t) {
  const scaled = t / T_MAX * SIM_TOTAL;
  let acc = 0;
  for (let i = 0; i < SIM_STEPS.length; i++) {
    acc += SIM_STEPS[i].seconds;
    if (scaled < acc) return i;
  }
  return SIM_STEPS.length - 1;
}

const PROFILES = [
  { key: 'rao-allonge', id: 'rao-allonge', name: 'Rao Allongé', duration: 59,
    pressure: [[0,0],[14,0],[14,9],[30,9],[30,6],[59,6]], flow: [[0,4],[14,4],[14,2],[59,2]], temp: [[0,88],[59,88]],
    phases: [
      { start: 0, end: 6, label: 'prefill' }, { start: 6, end: 16, label: 'preinfusion' },
      { start: 16, end: 20, label: 'dripping' }, { start: 20, end: 26, label: 'pressurize' },
      { start: 26, end: 49, label: 'extraction' }, { start: 49, end: 59, label: 'decline' },
    ],
    raw: { title: 'Rao Allongé', tank_temperature: 88, steps: SIM_STEPS } },
  { key: 'best-practice', id: 'best-practice', name: 'Best practice', duration: 32,
    pressure: [[0,0],[3,2.5],[9,3],[10,9],[16,9],[32,8]], flow: [[0,3],[9,3],[10,2],[32,1.9]], temp: [[0,94.5],[32,94.5]],
    phases: [{ start: 0, end: 10, label: 'preinfusion' }, { start: 10, end: 32, label: 'extraction' }] },
  { key: 'default', id: 'default', name: 'Default', duration: 30,
    pressure: [[0,0],[2,2],[8,3],[10,3],[11,9],[18,9],[30,7.5]], flow: [[0,2.5],[8,2.5],[11,2],[30,1.8]], temp: [[0,92],[30,92]],
    phases: [{ start: 0, end: 10, label: 'preinfusion' }, { start: 10, end: 30, label: 'extraction' }] },
  { key: 'espresso-80', id: 'espresso-80', name: "80's Espresso", duration: 28,
    pressure: [[0,0],[3,9],[28,9]], flow: null, temp: [[0,93],[28,93]], phases: [] },
  { key: 'gentle', id: 'gentle', name: 'Gentle and sweet', duration: 35,
    pressure: [[0,0],[6,2],[10,6],[35,5]], flow: [[0,3],[6,3],[10,2],[35,1.8]], temp: [[0,88],[35,88]],
    phases: [{ start: 0, end: 10, label: 'preinfusion' }, { start: 10, end: 35, label: 'extraction' }] },
];

const BEANS = [
  { id: 'b1', name: 'Scopius', roaster: 'Midnight Coffee', process: 'Washed' },
  { id: 'b2', name: 'Red Brick', roaster: 'Square Mile', process: 'Natural' },
  { id: 'b3', name: 'Sensação', roaster: 'Encantos do Café', process: 'Washed' },
  { id: 'b4', name: 'Marvin Alvalado', roaster: 'SEY', process: 'Washed' },
  { id: 'b5', name: 'Diego Fernando', roaster: 'SEY', process: 'Natural' },
  { id: 'b6', name: 'Julio Madrid', roaster: 'B&W', process: 'Washed' },
];
const GRINDERS = [
  { id: 'g1', model: 'EK43S' }, { id: 'g2', model: 'Lagom P80' }, { id: 'g3', model: 'Niche Zero' },
];

// histórico sintético: 8 shots nos últimos dias, variando café/moedor/moagem
const HISTORY = (() => {
  const now = Date.now();
  const rows = [
    { h: 2,   p: 'Rao Allongé',      b: 'b2', g: 'g1', grind: 3.10, dose: 15, y: 36, dur: 55, brew: 89 },
    { h: 20,  p: 'Best practice',    b: 'b1', g: 'g1', grind: 3.05, dose: 18, y: 36, dur: 56, brew: 92 },
    { h: 26,  p: 'Rao Allongé',      b: 'b1', g: 'g1', grind: 3.00, dose: 18, y: 37, dur: 52, brew: 89 },
    { h: 48,  p: 'Default',          b: 'b3', g: 'g2', grind: 5.20, dose: 17, y: 34, dur: 29, brew: 92 },
    { h: 52,  p: "80's Espresso",    b: 'b3', g: 'g2', grind: 5.40, dose: 17, y: 35, dur: 27, brew: 93 },
    { h: 120, p: 'Gentle and sweet', b: 'b4', g: 'g3', grind: 2.40, dose: 19, y: 45, dur: 35, brew: 88 },
    { h: 500, p: 'Rao Allongé',      b: 'b5', g: 'g1', grind: 2.90, dose: 18, y: 36, dur: 58, brew: 89 },
    { h: 700, p: 'Best practice',    b: 'b6', g: 'g3', grind: 2.60, dose: 18, y: 38, dur: 44, brew: 94 },
  ];
  return rows.map((r, i) => {
    const bean = BEANS.find((b) => b.id === r.b);
    const gr = GRINDERS.find((g) => g.id === r.g);
    return {
      id: `shot-${i}`, rawTs: new Date(now - r.h * 3600e3).toISOString(),
      profile: r.p, coffee: bean.name, brand: bean.roaster, coffeeId: bean.id,
      grinder: gr.model, grinderId: gr.id, grind: r.grind,
      dose: r.dose, yield: r.y, duration: r.dur, brewTemp: r.brew,
    };
  });
})();

function sample(curve, t) {
  if (!curve || !curve.length) return 0;
  if (t <= curve[0][0]) return curve[0][1];
  if (t >= curve[curve.length - 1][0]) return curve[curve.length - 1][1];
  for (let i = 1; i < curve.length; i++) {
    const [t1, v1] = curve[i];
    if (t <= t1) {
      const [t0, v0] = curve[i - 1];
      return v0 + (v1 - v0) * ((t - t0) / (t1 - t0));
    }
  }
  return curve[curve.length - 1][1];
}

// reescala uma curva base para a duração do shot (histórico plausível, sem repetir igual)
function scaled(curve, dur, jitter = 0) {
  const src = curve[curve.length - 1][0];
  return curve.map(([t, v]) => [Number((t / src * dur).toFixed(2)), Number((v * (1 + jitter)).toFixed(2))]);
}

export function createMockSource() {
  const snapshotCbs = new Set();
  const scaleCbs = new Set();
  const startCbs = new Set();
  const endCbs = new Set();
  let shotTimer = null, idleTimer = null, t = 0;
  let scaleConnected = false, tareOffset = 0;
  let tankPct = 36;

  function emitIdle() {
    for (const cb of snapshotCbs) {
      cb({ t: 0, running: false, state: 'idle', frame: null, pressure: 0, flow: 0, mixTemp: 92.0, groupTemp: 92.0, temp: 92.0, tankPct, tankMl: Math.round(tankPct * 14.9) });
    }
  }

  function tick() {
    t += TICK_MS / 1000;
    for (const cb of snapshotCbs) {
      cb({ t, running: true, state: 'espresso', frame: simFrame(t), pressure: sample(P, t), flow: sample(F, t), mixTemp: 92.4, groupTemp: 94.1, temp: sample(T, t), tankPct, tankMl: Math.round(tankPct * 14.9) });
    }
    const weight = scaleConnected ? Math.max(0, sample(W, t) - tareOffset) : 0;
    for (const cb of scaleCbs) cb({ weight, connected: scaleConnected });
    if (t >= T_MAX) { stopShot(); for (const cb of endCbs) cb(); }
  }

  function startShot() {
    stopShot();
    t = 0;
    for (const cb of startCbs) cb();
    shotTimer = setInterval(tick, TICK_MS);
  }
  function stopShot() { if (shotTimer) clearInterval(shotTimer); shotTimer = null; }

  const src = {
    kind: 'mock',
    onSnapshot(cb) { snapshotCbs.add(cb); return () => snapshotCbs.delete(cb); },
    onScale(cb) { scaleCbs.add(cb); return () => scaleCbs.delete(cb); },
    onShotStart(cb) { startCbs.add(cb); return () => startCbs.delete(cb); },
    onShotEnd(cb) { endCbs.add(cb); return () => endCbs.delete(cb); },

    // no mock a máquina fica ociosa; o shot é disparado por `simShot()` (console/dev)
    start() { emitIdle(); idleTimer = setInterval(emitIdle, 1000); },
    stop() { stopShot(); clearInterval(idleTimer); },
    simShot: startShot,

    getWorkflow: async () => ({
      profile: { title: 'Rao Allongé' },
      context: {
        targetDoseWeight: 18, targetYield: 36,
        grinderModel: 'EK43S', grinderSetting: '3.10',
        coffeeName: 'Scopius', coffeeRoaster: 'Midnight Coffee',
      },
      steamSettings: { targetTemperature: 155, duration: 40, flow: 0.5 },
      hotWaterData: { targetTemperature: 75, volume: 50 },
      rinseData: { duration: 5 },
    }),
    getProfiles: async () => PROFILES.map((p) => ({ ...p, hidden: false })),
    getBeans: async () => BEANS.map((b) => ({ ...b })),
    getGrinders: async () => GRINDERS.map((g) => ({ ...g })),
    getShotHistory: async () => HISTORY.map((s) => ({ ...s })),
    getShot: async (id) => {
      const s = HISTORY.find((x) => x.id === id);
      if (!s) return null;
      const d = s.duration;
      const j = ((Number(id.split('-')[1]) % 5) - 2) * 0.02;
      // plano tracejado: o perfil com que o shot foi tirado (como no Bridge real,
      // onde ele vem em shot.workflow.profile)
      const plan = PROFILES.find((x) => x.name === s.profile);
      return {
        kind: 'shot', profile: s.profile, duration: d,
        pressure: scaled(P, d, j), flow: scaled(F, d, j), temp: scaled(T, d, 0),
        weight: scaled(W, d, 0).map(([tt, v]) => [tt, Number((v / 42 * s.yield).toFixed(1))]),
        pressureTarget: plan ? plan.pressure : null,
        flowTarget: plan ? plan.flow : null,
        phases: plan && plan.phases.length
          ? plan.phases
          : [{ start: 0, end: d * 0.45, label: 'preinfusion' }, { start: d * 0.45, end: d, label: 'extraction' }],
      };
    },

    connectScale() { scaleConnected = true; tareOffset = 0; },
    tareScale() { tareOffset = sample(W, t); },
    setMachineState(s) { if (s === 'idle') { stopShot(); for (const cb of endCbs) cb(); } },

    applyContext: async () => {},
    putWorkflow: async () => {},
    applyProfile: async () => {},
    addBean: async (d) => ({ id: `b${Date.now()}`, ...d }),
    addGrinder: async (d) => ({ id: `g${Date.now()}`, ...d }),
    updateShotAnnotations: async (id, ann) => {
      const s = HISTORY.find((x) => x.id === id);
      if (s && ann.extras) Object.assign(s, {
        coffee: ann.extras.coffeeName, brand: ann.extras.coffeeRoaster,
        grinder: ann.extras.grinderModel, grind: Number(ann.extras.grinderSetting),
      });
      return true;
    },
  };

  // atalho de dev: `__crema.simShot()` no console dispara um shot simulado
  window.__crema = src;
  return src;
}
