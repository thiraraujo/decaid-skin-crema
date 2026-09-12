// CREMA v2 · estado central + pub/sub mínimo.
// Formato definido em docs/handoff-v2/README.md § State Management.

const listeners = new Set();

export const state = {
  hostConnected: false,        // true quando ligado ao Bridge real
  screen: 'home',              // 'home' | 'numpad' | 'history'
  modal: null,                 // null | 'adjust' | 'coffee' | 'coffeehist' | 'editshot' | 'favorites'

  // Receita do próximo shot — ratio é derivado (drink/dose).
  // Tudo começa `null` de propósito: a regra de ouro do projeto é nunca mostrar
  // número inventado. Estes campos só ganham valor quando `GET /workflow`
  // responde; até lá a tela mostra "—".
  recipe: {
    coffeeId: null, coffeeName: '', coffeeBrand: '', coffeeProcess: '',
    grinderId: null, grinderName: '',
    grind: null,
    dose: null,
    drink: null,
    brewTemp: null,
  },

  // perfis
  profiles: { all: [], favorites: [] },
  selectedProfileId: null,
  loadedProfileTitle: null, // perfil que a máquina tem carregado
  profileBaseTemp: null,   // temperatura-base do perfil ativo (referência do Brew)
  chartMode: 'lastShot',       // 'lastShot' | 'plan' | 'live'
  staticAxis: true,           // vem do app (prefs) no boot
  numpadPrevious: {},         // valores anteriores do teclado, por campo — vem do app
  // proteção de tela do SLEEP (prefs do app, ver src/saver.js)
  saver: { on: false, brightness: 30, minutes: 5, images: [] },
  staticTimer: 40,            // STATIC ligado: eixo X do shot ao vivo começa em Y s (prefs do app)

  // shot ao vivo
  live: { running: false, t: 0, profile: null, series: { pressure: [], flow: [], temp: [], weight: [], pressureTarget: [], flowTarget: [] } },

  // máquina
  machine: {
    state: 'disconnected',     // estado bruto da DE1 (MachineState da API)
    substate: '',
    readiness: 'disconnected', // derivado: ready | heating | notHeating | sleeping | noWater | disconnected
    mixTemp: null, groupTemp: null,
    targetMixTemp: null, targetGroupTemp: null,
    // nível do tanque em MILÍMETROS (ws/v1/machine/waterLevels) — a DE1 reporta
    // altura da água, não volume; `refill` é o limiar de recarga da máquina
    water: { level: null, refill: null, fullScale: 70 },
    scale: { connected: false, weight: 0, flow: null, battery: null },
    link: { machine: null, scale: null, scanning: false, phase: null },  // /ws/v1/devices
    error: null,        // ConnectionError do canal /devices ({kind, message, suggestion})
  },

  // água quente / vapor / flush
  // idem: vem de rinseData / hotWaterData / steamSettings do workflow
  aux: {
    flush: { s: null },
    hotWater: { ml: null, temp: null },
    // on: null até a máquina responder (evita gravar "desligado" por engano);
    // temp: temperatura de vapor quando ligado — é ela que liga/desliga (ver workflow.js)
    steam: { on: null, time: null, flow: null, temp: null },
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

// tempo inicial do eixo X no shot ao vivo com STATIC ligado — ajuste de 5 em 5 s
export const STATIC_AXIS = { default: 40, step: 5, min: 5, max: 1000 };
export const clampStaticSeconds = (v) =>
  Math.min(STATIC_AXIS.max, Math.max(STATIC_AXIS.min, Math.round(Number(v) || STATIC_AXIS.default)));

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
  if (!dose || !drink) return '—';
  return `1:${(drink / dose).toFixed(1)}`;
}
