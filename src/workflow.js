// CREMA v2 · gravação da receita na máquina (PUT /api/v1/workflow), com debounce.
//
// Formato confirmado contra o Bridge real na v1:
//   - campos da recipe vão DENTRO de `context`;
//   - steamSettings, hotWaterData e rinseData (= flush) ficam no nível de topo;
//   - Brew NÃO tem campo no workflow: a temperatura mora no PERFIL, por step —
//     mudar o Brew clona o perfil ativo e desloca todos os steps pelo delta.

import { state } from './store.js';
import { resolveHost } from './api.js';

let source = null;

export const STEAM_MIN_C = 135;      // abaixo disso a máquina trata o vapor como desligado
const STEAM_DEFAULT_C = 150;         // ao ligar sem temperatura anterior conhecida (exemplo da spec)

// Desligar grava 0 °C na máquina, e a temperatura de antes se perde. Guardamos a
// última temperatura LIGADA no key-value store do app (como o tema), para que
// religar volte a ela mesmo depois de recarregar a skin.
const STEAM_KV = () => `http://${resolveHost()}/api/v1/store/crema/steamTemp`;

export function rememberSteamTemp(t) {
  if (typeof t !== 'number' || t < STEAM_MIN_C) return;
  if (!state.hostConnected) return;
  fetch(STEAM_KV(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ c: t }) })
    .catch(() => { /* sem store: vale o padrão */ });
}

export async function recallSteamTemp() {
  if (!state.hostConnected) return null;
  try {
    const r = await fetch(STEAM_KV(), { cache: 'no-store' });
    const d = r.ok ? await r.json() : null;          // chave ausente → 200 com null
    return d && typeof d.c === 'number' && d.c >= STEAM_MIN_C ? d.c : null;
  } catch { return null; }
}
export function initWorkflow(dataSource) { source = dataSource; }

const debounced = (fn, ms = 400) => {
  let t = null;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

/** recipe + auxiliares → PUT /workflow */
// Campos ainda desconhecidos (a máquina não respondeu) são OMITIDOS: o PUT é
// deep-merge, então omitir preserva o que está lá. Enviar null limparia o campo
// — e `targetYield` nem aceita null (400), porque null e 0 significam
// "stop-at-weight desligado".
const defined = (obj) => {
  const out = {};
  for (const k in obj) if (obj[k] != null && obj[k] !== '') out[k] = obj[k];
  return out;
};

export const pushWorkflow = debounced(() => {
  if (!(source && source.putWorkflow)) return;
  const r = state.recipe;
  const a = state.aux;
  const body = {};

  const context = defined({
    targetDoseWeight: r.dose,
    targetYield: r.drink,
    grinderModel: r.grinderName,
    grinderSetting: r.grind == null ? null : String(r.grind),
    coffeeName: r.coffeeName,
    coffeeRoaster: r.coffeeBrand,
    finalBeverageType: 'espresso',
  });
  if (Object.keys(context).length) body.context = context;

  // Vapor liga/desliga pela TEMPERATURA, não pela duração (rest_v1.yml § SteamSettings):
  // targetTemperature 0 desliga o aquecedor de vapor; ligado é 135–160 °C na DE1.
  // `duration` é só o tempo máximo de vapor. Enquanto o estado não é conhecido
  // (on === null) a temperatura não é enviada — o deep-merge preserva a da máquina.
  const steam = defined({ duration: a.steam.time, flow: a.steam.flow });
  if (a.steam.on != null) steam.targetTemperature = a.steam.on ? (a.steam.temp ?? STEAM_DEFAULT_C) : 0;
  if (Object.keys(steam).length) body.steamSettings = steam;

  const water = defined({ targetTemperature: a.hotWater.temp, volume: a.hotWater.ml });
  if (Object.keys(water).length) body.hotWaterData = water;

  const rinse = defined({ duration: a.flush.s });
  if (Object.keys(rinse).length) body.rinseData = rinse;

  if (Object.keys(body).length) source.putWorkflow(body);
});

/** perfil selecionado no carrossel → PUT /workflow { profile } */
export function pushProfile(profile) {
  if (!(source && source.putWorkflow) || !profile || !profile.raw) return;
  // trocou de perfil: ele passa a ser a base dos ajustes de Brew
  state.loadedProfileRaw = profile.raw;
  state.profileBaseTemp = baseTempOf(profile.raw);
  source.putWorkflow({ profile: profile.raw });
}

/** Brew: clona o perfil CARREGADO NA MÁQUINA e desloca a temperatura de cada step */
export const pushBrewTemp = debounced((profile) => {
  if (!(source && source.putWorkflow)) return;
  // o perfil da máquina é a referência; a cópia da biblioteca só serve se ela não informou
  const src = state.loadedProfileRaw || (profile && profile.raw);
  if (!src || !Array.isArray(src.steps)) return;
  const base = baseTempOf(src);
  if (base == null) return;
  const delta = state.recipe.brewTemp - base;
  const raw = JSON.parse(JSON.stringify(src));
  for (const s of raw.steps) {
    if (typeof s.temperature === 'number') s.temperature = +(s.temperature + delta).toFixed(1);
  }
  source.putWorkflow({ profile: raw });
});

export function baseTempOf(raw) {
  if (!raw) return null;
  const steps = Array.isArray(raw.steps) ? raw.steps : [];
  const withTemp = steps.find((s) => typeof s.temperature === 'number');
  return withTemp ? withTemp.temperature : (raw.tank_temperature ?? null);
}
