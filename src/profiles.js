// CREMA · biblioteca de perfis (mock) e shots gravados de exemplo.
// No M4: perfis planejados vêm de GET /api/v1/profiles/{id} (steps v2 — pressure/flow/
// temperature/duration) e o histórico de GET /api/v1/shots/{id}.measurements.

// Cada perfil planejado: curvas alvo (pressão/fluxo/temp) e fases (segmentos com rótulo).
// Mock dos 5 favoritos padrão (mesmos da Streamline — perfis default da DE1).
export const PROFILES = {
  padrao: {
    name: 'Default', type: 'Espresso', duration: 30,
    pressure: [[0, 0], [2, 2], [8, 3], [10, 3], [11, 9], [18, 9], [30, 7.5]],
    flow: [[0, 2.5], [8, 2.5], [11, 2], [30, 1.8]],
    temp: [[0, 92], [30, 92]],
    phases: [{ start: 0, end: 10, label: 'Preinfusion' }, { start: 10, end: 30, label: 'Extraction' }],
  },
  'melhor-pratica': {
    name: 'Best practice (light roast)', type: 'Espresso', duration: 30,
    pressure: [[0, 0], [3, 2.5], [9, 3], [10, 9], [16, 9], [30, 8]],
    flow: [[0, 3], [9, 3], [10, 2], [30, 1.9]],
    temp: [[0, 94.5], [30, 94.5]],
    phases: [{ start: 0, end: 10, label: 'Preinfusion' }, { start: 10, end: 30, label: 'Extraction' }],
  },
  'espresso-80': {
    name: "80's Espresso", type: 'Pressure', duration: 28,
    pressure: [[0, 0], [3, 9], [28, 9]],
    flow: null,
    temp: [[0, 93], [28, 93]],
    phases: [],
  },
  'rao-allonge': {
    name: 'Rao Allongé', type: 'Lever', duration: 50,
    pressure: [[0, 0], [4, 9], [8, 9], [50, 4]],
    flow: null,
    temp: [[0, 90], [50, 90]],
    phases: [{ start: 0, end: 8, label: 'Ramp' }, { start: 8, end: 50, label: 'Decline' }],
  },
  'doce-suave': {
    name: 'Gentle and sweet', type: 'Gentle', duration: 35,
    pressure: [[0, 0], [6, 2], [10, 6], [35, 5]],
    flow: [[0, 3], [6, 3], [10, 2], [35, 1.8]],
    temp: [[0, 88], [35, 88]],
    phases: [{ start: 0, end: 10, label: 'Preinfusion' }, { start: 10, end: 35, label: 'Extraction' }],
  },

  // extras (não-favoritos) · alguns ocultos p/ demonstrar o "Show hidden"
  'damian-lrv3': {
    name: "Damian's LRv3", type: 'Advanced', duration: 362, hidden: true,
    pressure: [[0, 1.5], [8, 1.5], [8, 3], [15, 3], [15, 9], [90, 9], [150, 5.5], [250, 5.5]],
    flow: [[250, 0], [250, 2], [362, 2]],
    temp: [[0, 90], [15, 90], [15, 88.5], [362, 88.5]],
    phases: [
      { start: 0, end: 8, label: 'Fill' },
      { start: 8, end: 15, label: 'Infusion' },
      { start: 15, end: 90, label: '9 Bar Hold' },
      { start: 90, end: 150, label: 'Pressure Decline' },
      { start: 150, end: 250, label: '5 Bar Hold' },
      { start: 250, end: 362, label: 'Flow Limit' },
    ],
  },
  'leite-cremoso': {
    name: 'Flow for milk', type: 'Flow', duration: 36, hidden: true,
    pressure: [[0, 0], [6, 2], [10, 6], [36, 6]],
    flow: [[0, 4], [4, 4], [10, 2], [36, 2]],
    temp: [[0, 86], [36, 86]],
    phases: [],
  },
};

// ordem dos favoritos exibidos na barra superior (chaves de PROFILES)
export const FAVORITES = ['padrao', 'melhor-pratica', 'espresso-80', 'rao-allonge', 'doce-suave'];

// fallback de favoritos (mesma lista da Streamline). No dispositivo real, casamos esses
// títulos (EN ou PT) contra os perfis da máquina para escolher os 5 slots — ver ui.js.
export const FALLBACK_FAVORITE_TITLES = [
  ['Default', 'Padrão'],
  ['Best practice (light roast)', 'Melhor prática (torra clara)'],
  ["80's Espresso", 'Espresso dos anos 80'],
  ['Rao Allongé'],
  ['Gentle and sweet', 'Doce e suave'],
];

// passos do shot simulado (batem com a curva do mock) — no M4 vêm de state.profileFrame
// + os nomes dos steps do perfil carregado.
export const SIM_STEPS = [
  { n: 1, label: 'Fill', end: 2 },
  { n: 2, label: 'Preinfusion', end: 13 },
  { n: 3, label: 'Pressure Up', end: 16 },
  { n: 4, label: 'Extraction', end: 30 },
];

// curvas do último shot real (mock) — reusadas como "shot gravado" para o histórico.
const REC_P = [[0,0],[1,.6],[2,1.3],[3,2.3],[4,2.9],[5,3.1],[6,3.2],[7,3.1],[8,3.0],[10,3.0],[12,3.0],[13,3.0],[13.5,3.0],[14,4.6],[14.5,7],[15,8.4],[16,9.0],[18,9.1],[20,9.05],[22,8.95],[25,8.85],[28,8.65],[30,8.5]];
const REC_F = [[0,3.1],[0.6,5],[1.3,6.8],[2,7.7],[2.6,8.0],[3.3,7.8],[4,7.0],[5,5.6],[6,4.2],[7,2.8],[8,1.7],[9,1.25],[10,1.12],[12,1.1],[13.6,1.1],[14.2,1.5],[15,2.3],[15.6,2.62],[16.4,2.4],[17.4,2.05],[19,1.92],[24,1.9],[30,1.9]];
const REC_T = [[0,88],[6,88.1],[14,87.8],[16,88.4],[24,88.1],[30,88]];
const REC_W = [[0,0],[8,0],[14,1],[20,18],[26,34],[30,42]];

function recorded(profile) {
  return { profile, duration: 30, pressure: REC_P, flow: REC_F, temp: REC_T, weight: REC_W };
}

// shots gravados de exemplo, chaveados pelo timestamp exibido no log.
export const SAMPLE_SHOTS = {
  '2026/06/27 02:05': recorded('Londonium'),
  '2026/06/27 01:57': recorded('Londonium'),
  '2026/06/27 01:51': recorded('Londonium'),
  '2026/06/26 22:40': recorded('Best practice (light roast)'),
  '2026/06/26 22:15': recorded("80's Espresso"),
};
