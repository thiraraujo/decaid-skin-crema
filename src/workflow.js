// CREMA v2 · gravação da receita na máquina (PUT /api/v1/workflow), com debounce.
//
// Formato confirmado contra o Bridge real na v1:
//   - campos da recipe vão DENTRO de `context`;
//   - steamSettings, hotWaterData e rinseData (= flush) ficam no nível de topo;
//   - Brew NÃO tem campo no workflow: a temperatura mora no PERFIL, por step —
//     mudar o Brew clona o perfil ativo e desloca todos os steps pelo delta.

import { state } from './store.js';

let source = null;
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

  const steam = defined({ duration: a.steam.time, flow: a.steam.flow });
  if (Object.keys(steam).length) body.steamSettings = { targetTemperature: 155, ...steam };

  const water = defined({ targetTemperature: a.hotWater.temp, volume: a.hotWater.ml });
  if (Object.keys(water).length) body.hotWaterData = water;

  const rinse = defined({ duration: a.flush.s });
  if (Object.keys(rinse).length) body.rinseData = rinse;

  if (Object.keys(body).length) source.putWorkflow(body);
});

/** perfil selecionado no carrossel → PUT /workflow { profile } */
export function pushProfile(profile) {
  if (!(source && source.putWorkflow) || !profile || !profile.raw) return;
  state.profileBaseTemp = baseTempOf(profile.raw);
  source.putWorkflow({ profile: profile.raw });
}

/** Brew: clona o perfil ativo e desloca a temperatura de cada step pelo delta */
export const pushBrewTemp = debounced((profile) => {
  if (!(source && source.putWorkflow) || !profile || !profile.raw) return;
  const steps = profile.raw.steps;
  if (!Array.isArray(steps)) return;
  const base = state.profileBaseTemp ?? baseTempOf(profile.raw);
  if (base == null) return;
  const delta = state.recipe.brewTemp - base;
  const raw = JSON.parse(JSON.stringify(profile.raw));
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
