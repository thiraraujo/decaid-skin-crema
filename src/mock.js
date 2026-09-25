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
// `exit` e `weight` existem nos perfis reais e alimentam o motivo de saída da fase
// (src/exit.js): sem eles o mock mostrava sempre "Exit unknown".
// Os tempos somam T_MAX: assim o shot simulado anda no mesmo relógio dos steps e o
// motivo de saída (src/exit.js) pode ser exercitado em dev. `exit` e `weight`
// existem nos perfis reais — sem eles o mock mostrava sempre "Exit unknown".
const SIM_STEPS = [
  { name: 'Prefill', seconds: 3, temperature: 88, exit: null, weight: 0 },
  { name: 'Preinfusion', seconds: 5, temperature: 88, exit: { type: 'pressure', condition: 'over', value: 3 }, weight: 0 },
  { name: 'Dripping', seconds: 2, temperature: 88, exit: null, weight: 0 },
  { name: 'Pressurize', seconds: 4, temperature: 88, exit: { type: 'pressure', condition: 'over', value: 8.5 }, weight: 0 },
  { name: 'Extraction', seconds: 11, temperature: 88, exit: { type: 'flow', condition: 'under', value: 2 }, weight: 0 },
  { name: 'Decline', seconds: 5, temperature: 88, exit: null, weight: 0 },
];
const SIM_TOTAL = SIM_STEPS.reduce((a, s) => a + s.seconds, 0);

// índice do step para o instante `t` do shot simulado (T_MAX comprimido em SIM_TOTAL)
// alvos como a máquina manda: step de fluxo até 14 s (pressão 0), depois pressão
function simTargets(t) {
  if (t < 14) return { targetPressure: 0, targetFlow: 4 };
  return { targetPressure: Number((9 - Math.max(0, t - 18) * 0.05).toFixed(2)), targetFlow: 0 };
}
const simTargetSeries = (d) => {
  const pt = [], ft = [];
  for (let i = 0; i <= 60; i++) {
    const tt = i / 60 * d, g = simTargets(tt / d * T_MAX);
    pt.push([tt, g.targetPressure > 0 ? g.targetPressure : null]);
    ft.push([tt, g.targetFlow > 0 ? g.targetFlow : null]);
  }
  return { pt, ft };
};

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
    raw: { title: 'Rao Allongé', tank_temperature: 88, steps: SIM_STEPS,
      notes: 'Scott Rao style allongé: long low-pressure preinfusion and a gentle decline, for a longer, sweeter cup.' } },
  { key: 'best-practice', id: 'best-practice', name: 'Best practice (light roast)', duration: 32,
    pressure: [[0,0],[3,2.5],[9,3],[10,9],[16,9],[32,8]], flow: [[0,3],[9,3],[10,2],[32,1.9]], temp: [[0,94.5],[32,94.5]],
    phases: [{ start: 0, end: 10, label: 'preinfusion' }, { start: 10, end: 32, label: 'extraction' }],
    raw: { title: 'Best practice (light roast)', notes: 'A starting point for light roasts: high temperature and steady 9 bar.' } },
  { key: 'default', id: 'default', name: 'Default', duration: 30,
    pressure: [[0,0],[2,2],[8,3],[10,3],[11,9],[18,9],[30,7.5]], flow: [[0,2.5],[8,2.5],[11,2],[30,1.8]], temp: [[0,92],[30,92]],
    phases: [{ start: 0, end: 10, label: 'preinfusion' }, { start: 10, end: 30, label: 'extraction' }],
    raw: { title: 'Default', notes: 'This profile is gentle on the coffee puck and not too demanding on the barista. Produces a very acceptable espresso in a wide variety of settings.' } },
  { key: 'espresso-80', id: 'espresso-80', name: "80's Espresso", duration: 28,
    pressure: [[0,0],[3,9],[28,9]], flow: null, temp: [[0,93],[28,93]], phases: [],
    raw: { title: "80's Espresso", notes: '80s spring machine: ramps to 9 bar and holds to the end.' } },
  { key: 'gentle', id: 'gentle', name: 'Gentle and sweet', duration: 35,
    pressure: [[0,0],[6,2],[10,6],[35,5]], flow: [[0,3],[6,3],[10,2],[35,1.8]], temp: [[0,88],[35,88]],
    phases: [{ start: 0, end: 10, label: 'preinfusion' }, { start: 10, end: 35, label: 'extraction' }],
    raw: { title: 'Gentle and sweet', notes: 'Low pressure throughout, to bring out sweetness in medium roasts.' } },

  // Perfis com CATEGORIA no título ("Categoria/Nome"), como o Decaid escreve —
  // é daí que a tela de Perfis monta os filtros. Sem isso o mock enganava.
  { key: 'v60-22', id: 'v60-22', name: 'Pour over basket/V60 22g in, 375g out', duration: 180,
    pressure: [[0,0],[180,0]], flow: [[0,4],[10,4],[10,2.5],[180,2.5]], temp: [[0,92],[180,92]],
    phases: [{ start: 0, end: 10, label: 'bloom' }, { start: 10, end: 180, label: 'pour' }],
    raw: { title: 'Pour over basket/V60 22g in, 375g out', notes: 'Requires the pour over basket. 22 g of coarse coffee for 375 g of beverage.' } },
  { key: 'v60-15', id: 'v60-15', name: 'Pour over basket/V60 15g in, 250g out', duration: 150,
    pressure: [[0,0],[150,0]], flow: [[0,3.5],[10,3.5],[10,2.2],[150,2.2]], temp: [[0,92],[150,92]],
    phases: [{ start: 0, end: 10, label: 'bloom' }, { start: 10, end: 150, label: 'pour' }],
    raw: { title: 'Pour over basket/V60 15g in, 250g out', notes: 'Smaller version of the V60 recipe.' } },
  { key: 'tea-black', id: 'tea-black', name: 'Tea portafilter/black tea', duration: 178,
    pressure: [[0,0],[178,0]], flow: [[0,6],[8,6],[8,0],[178,0]], temp: [[0,99],[178,99]],
    phases: [{ start: 0, end: 8, label: 'fill' }, { start: 8, end: 178, label: 'infuse' }],
    raw: { title: 'Tea portafilter/black tea', notes: 'Requires the tea portafilter. Water at 99 °C and a long infusion.' } },
  { key: 'tea-green', id: 'tea-green', name: 'Tea portafilter/Japanese green', duration: 120,
    pressure: [[0,0],[120,0]], flow: [[0,6],[8,6],[8,0],[120,0]], temp: [[0,80],[120,80]],
    phases: [{ start: 0, end: 8, label: 'fill' }, { start: 8, end: 120, label: 'infuse' }],
    raw: { title: 'Tea portafilter/Japanese green', notes: 'Japanese green tea: cooler water, short infusion.' } },
  { key: 'ghc-flow', id: 'ghc-flow', name: 'GHC/manual flow control', duration: 60,
    pressure: [[0,0],[60,6]], flow: [[0,2],[60,2]], temp: [[0,92],[60,92]], phases: [],
    raw: { title: 'GHC/manual flow control', notes: 'Manual flow control from the machine’s physical button.' } },
  { key: 'dflow', id: 'dflow', name: 'D-Flow / default', duration: 40,
    pressure: [[0,0],[8,3],[12,8],[40,7]], flow: [[0,4],[8,4],[12,2],[40,2]], temp: [[0,90],[40,90]],
    phases: [{ start: 0, end: 12, label: 'preinfusion' }, { start: 12, end: 40, label: 'extraction' }],
    raw: { title: 'D-Flow / default', notes: '' } },
  { key: 'aflow-medium', id: 'aflow-medium', name: 'A-Flow / default-medium', duration: 38,
    pressure: [[0,0],[8,3],[12,8.5],[38,7.5]], flow: [[0,4.5],[8,4.5],[12,2.1],[38,2.1]], temp: [[0,91],[38,91]],
    phases: [{ start: 0, end: 12, label: 'preinfusion' }, { start: 12, end: 38, label: 'extraction' }],
    raw: { title: 'A-Flow / default-medium', notes: 'Adaptive flow profile for medium roasts.' } },
  { key: 'cleaning', id: 'cleaning', name: 'Cleaning/Forward Flush x5', duration: 50,
    pressure: [[0,0],[50,0]], flow: [[0,8],[50,8]], temp: [[0,90],[50,90]], phases: [],
    raw: { title: 'Cleaning/Forward Flush x5', notes: 'Five back-to-back flushes to clean the group. No coffee in the portafilter.' } },
  { key: 'londonium', id: 'londonium', name: 'Londonium', duration: 36, hidden: true,
    pressure: [[0,0],[4,9],[10,9],[36,4]], flow: null, temp: [[0,90],[36,90]],
    phases: [{ start: 0, end: 10, label: 'ramp' }, { start: 10, end: 36, label: 'decline' }],
    raw: { title: 'Londonium', notes: 'Spring lever: ramps quickly to 9 bar and declines to the end.' } },
];

const BEANS = [
  { id: 'b1', name: 'Scopius', roaster: 'Midnight Coffee', process: 'Washed' },
  { id: 'b2', name: 'Red Brick', roaster: 'Square Mile', process: 'Natural' },
  { id: 'b3', name: 'Sensacao', roaster: 'Encantos do Cafe', process: 'Washed' },
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
      stopReason: ['targetWeight', 'targetWeight', 'appStop', 'targetVolume'][i % 4],
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
  const waterCbs = new Set();
  const deviceCbs = new Set();
  let scaleConnected = false, tareOffset = 0;
  let waterLevel = 42;   // mm, como a DE1 reporta

  function emitDevices() {
    for (const cb of deviceCbs) {
      cb({
        machine: { id: 'MockDe1', name: 'MockDe1', type: 'machine', state: 'connected' },
        scale: { id: 'MockScale', name: 'Mock Scale', type: 'scale', state: scaleConnected ? 'connected' : 'disconnected' },
        scanning: false, phase: 'ready', error: null,
      });
    }
  }

  function emitIdle() {
    for (const cb of snapshotCbs) {
      cb({ t: 0, running: false, state: 'idle', frame: null, pressure: 0, flow: 0, mixTemp: 92.0, groupTemp: 92.0, temp: 92.0 });
    }
  }

  function tick() {
    t += TICK_MS / 1000;
    for (const cb of snapshotCbs) {
      // substates como os da máquina (websocket_v1.yml · MachineSubstate): a cauda
      // depois de `pouringDone` é o ruído que a skin deve descartar
      const substate = t < 1.5 ? 'preparingForShot' : t < 14 ? 'preinfusion' : t <= T_MAX ? 'pouring' : 'pouringDone';
      const noise = t > T_MAX ? (Math.random() - 0.5) * 6 : 0;
      cb({
        t, running: true, state: 'espresso', substate, frame: simFrame(Math.min(t, T_MAX)),
        pressure: Math.max(0, sample(P, Math.min(t, T_MAX)) + noise),
        flow: Math.max(0, sample(F, Math.min(t, T_MAX)) + noise),
        mixTemp: 92.4, groupTemp: 94.1, temp: sample(T, Math.min(t, T_MAX)), ...simTargets(Math.min(t, T_MAX)),
      });
    }
    if (scaleConnected) {
      const weight = Math.max(0, sample(W, t) - tareOffset);
      for (const cb of scaleCbs) cb({ kind: 'weight', connected: true, weight, weightFlow: null, battery: 78 });
    }
    // 3 s de "pouringDone" com ruído antes de encerrar, como na máquina real
    if (t >= T_MAX + 3) { stopShot(); for (const cb of endCbs) cb(); }
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
    onWaterLevels(cb) { waterCbs.add(cb); return () => waterCbs.delete(cb); },
    onDevices(cb) { deviceCbs.add(cb); return () => deviceCbs.delete(cb); },
    onShotStart(cb) { startCbs.add(cb); return () => startCbs.delete(cb); },
    onShotEnd(cb) { endCbs.add(cb); return () => endCbs.delete(cb); },

    // no mock a máquina fica ociosa; o shot é disparado por `simShot()` (console/dev)
    start() {
      emitIdle();
      for (const cb of waterCbs) cb({ currentLevel: waterLevel, refillLevel: 5 });
      for (const cb of scaleCbs) cb({ kind: 'status', connected: scaleConnected });
      emitDevices();
      idleTimer = setInterval(emitIdle, 1000);
    },
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
      // fases: o perfil com que o shot foi tirado; tracejado: alvos gravados no shot
      const plan = PROFILES.find((x) => x.name === s.profile);
      const tg = simTargetSeries(d);
      return {
        kind: 'shot', profile: s.profile, duration: d,
        pressure: scaled(P, d, j), flow: scaled(F, d, j), temp: scaled(T, d, 0),
        weight: scaled(W, d, 0).map(([tt, v]) => [tt, Number((v / 42 * s.yield).toFixed(1))]),
        pressureTarget: tg.pt,
        flowTarget: tg.ft,
        phases: plan && plan.phases.length
          ? plan.phases
          : [{ start: 0, end: d * 0.45, label: 'preinfusion' }, { start: d * 0.45, end: d, label: 'extraction' }],
      };
    },

    async connectScale() {
      await new Promise((r) => setTimeout(r, 900));   // o scan real demora
      scaleConnected = true; tareOffset = 0;
      for (const cb of scaleCbs) cb({ kind: 'status', connected: true });
      emitDevices();
      return true;
    },
    getDevices: async () => [{ id: 'MockScale', name: 'Mock Scale', type: 'scale', state: scaleConnected ? 'connected' : 'disconnected', available: true }],
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
