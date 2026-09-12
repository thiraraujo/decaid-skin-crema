// CREMA v2 · estado central + pub/sub mínimo.
// Formato definido em docs/handoff-v2/README.md § State Management.

const listeners = new Set();

export const state = {
  hostConnected: false,        // true quando ligado ao Bridge real
  screen: 'home',              // 'home' | 'numpad' | 'history'
  modal: null,                 // null | 'adjust' | 'coffee' | 'coffeehist' | 'editshot' | 'favorites'

  // receita do próximo shot — ratio é derivado (drink/dose)
  recipe: {
    coffeeId: null, coffeeName: '', coffeeBrand: '', coffeeProcess: '',
    grinderId: null, grinderName: '',
    grind: 3.10,
    dose: 18,
    drink: 36,
    brewTemp: 89,
  },

  // perfis
  profiles: { all: [], favorites: [] },
  selectedProfileId: null,
  loadedProfileTitle: null, // perfil que a máquina tem carregado
  profileBaseTemp: null,   // temperatura-base do perfil ativo (referência do Brew)
  chartMode: 'lastShot',       // 'lastShot' | 'plan' | 'live'
  staticAxis: true,
  staticTimer: 30,

  // shot ao vivo
  live: { running: false, t: 0, series: { pressure: [], flow: [], temp: [], weight: [] } },

  // máquina
  machine: {
    state: 'disconnected',     // 'ready' | 'heating' | 'disconnected' | estado bruto da DE1
    mixTemp: null, groupTemp: null,
    // nível do tanque em MILÍMETROS (ws/v1/machine/waterLevels) — a DE1 reporta
    // altura da água, não volume; `refill` é o limiar de recarga da máquina
    water: { level: null, refill: null, fullScale: 70 },
    scale: { connected: false, weight: 0, flow: null, battery: null },
  },

  // água quente / vapor / flush
  aux: {
    flush: { s: 5 },
    hotWater: { ml: 50, temp: 75 },
    steam: { on: false, time: 40, flow: 0.5 },
  },

  // histórico
  history: [],
  historyFilter: { coffeeId: null, coffeeLabel: '' },
  selectedShotId: null,
  shotIndex: 0,                // shot em foco no card do rodapé

  // biblioteca
  beans: [],
  grinders: [],

  // teclado numérico (componente único)
  numpad: null,                // { field, title, value, min, max, decimals, unit, hint, previous[], onConfirm }
};

// presets em botão — o toque no número continua abrindo o teclado p/ valores livres
export const PRESETS = {
  dose:  [18, 20, 22],
  drink: [36, 40, 45],
  brew:  [88, 92, 95],
};

// limites e passos de cada campo numérico (teclado + réguas)
export const FIELDS = {
  grind: { title: 'Grind', min: 0, max: 100, step: 0.05, decimals: 2, unit: '' },
  dose:  { title: 'Dose',  min: 5, max: 30, step: 1, decimals: 1, unit: 'g' },
  drink: { title: 'Drink', min: 5, max: 120, step: 1, decimals: 1, unit: 'g' },
  brew:  { title: 'Brew',  min: 80, max: 100, step: 1, decimals: 1, unit: '°C' },
};

// A API não informa a escala do moedor (Grinder só tem settingType numeric|preset),
// e ela varia muito — 0–11 num EK43, 0–100 num Kafatek, mícrons em outros. Então a
// faixa se alarga para caber o valor que a máquina já tem, em vez de rejeitá-lo.
export function fieldFor(name, value) {
  const f = FIELDS[name];
  if (!f) return null;
  const v = Number(value);
  if (!Number.isFinite(v) || (v >= f.min && v <= f.max)) return f;
  const max = v > f.max ? Math.ceil(v * 1.5 / 10) * 10 : f.max;
  const min = v < f.min ? Math.floor(v) : f.min;
  return { ...f, min, max };
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit(evt) {
  for (const fn of listeners) fn(evt, state);
}

export function setState(patch) {
  Object.assign(state, patch);
  emit('state');
}

/** ratio derivado — sempre drink/dose com 1 decimal (somente leitura na UI) */
export function ratioText() {
  const { dose, drink } = state.recipe;
  if (!dose || !drink) return '1:0.0';
  return `1:${(drink / dose).toFixed(1)}`;
}
