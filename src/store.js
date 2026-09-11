// CREMA · estado central + pub/sub mínimo (espelha o `store` da Streamline)

import { FAVORITES } from './profiles.js';

const listeners = new Set();

export const state = {
  openModal: null,            // null | 'coffee' | 'adjust' | 'numpad' | 'profiles'
  hostConnected: false,       // true quando ligado ao Bridge real

  favorites: [...FAVORITES],  // chaves dos perfis na barra superior
  selectedProfileKey: 'padrao',
  profileBaseTemp: null,      // temperatura-base do perfil ativo (p/ deltas do Brew)
  graphMode: 'live',          // 'live' | 'profile' | 'shot'

  // buffers do shot ao vivo (arrays de [t, valor])
  liveShot: { pressure: [], flow: [], temp: [], weight: [] },

  // últimos shots tirados (mais recente primeiro) — populado pelo Bridge no M4
  recentShots: [
    { ts: '2026/06/27 02:05', profile: 'Londonium', coffee: 'Scopius', dose: 18.0, yield: 36, grind: 4.2, duration: 30, finalWeight: 42 },
    { ts: '2026/06/27 01:57', profile: 'Londonium', coffee: 'Scopius', dose: 18.0, yield: 36, grind: 4.2, duration: 30, finalWeight: 41 },
    { ts: '2026/06/27 01:51', profile: 'Londonium', coffee: 'Ethiopia G1', dose: 17.5, yield: 34, grind: 4.0, duration: 29, finalWeight: 38 },
    { ts: '2026/06/26 22:40', profile: 'Best practice (light roast)', coffee: 'Ethiopia G1', dose: 18.0, yield: 40, grind: 4.4, duration: 32, finalWeight: 44 },
    { ts: '2026/06/26 22:15', profile: "80's Espresso", coffee: 'Scopius', dose: 20.0, yield: 40, grind: 3.8, duration: 27, finalWeight: 45 },
  ],
  shotIndex: 0,                // qual shot do histórico está em foco no card

  // status da máquina / balança
  status: {
    ready: true,
    connected: true,
    scaleConnected: false,
    mixTemp: 94.2,
    groupTemp: 106.5,
    tankMl: 537,
    tankPct: 36,
    weightG: 0,
  },

  // perfil / recipe selecionada
  profile: {
    coffee: 'Scopius',
    grinder: 'EK43S',
    grinderSetting: 0.0,
    dose: 15.0,
    drink: 0,
    brewTemp: 89,
    ratio: '1:0',
    flush: 5,
    hotWater: { ml: 50, temp: 85 },
    steam: false,
    steamTime: 40,
    steamFlow: 0.5,
    staticTimer: 30,
    staticOn: true,
  },
};

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
