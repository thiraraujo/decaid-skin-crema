// CREMA v2 · bootstrap. Escolhe a fonte (Bridge real vs mock) e liga estado → telas.

import { state, setState } from './store.js';
import { createChart } from './chart.js';
import { createApiSource, detectHost } from './api.js';
import { createMockSource } from './mock.js';
import { initScreens } from './screens.js';
import { initWorkflow, baseTempOf } from './workflow.js';
import { initHistory } from './history.js';
import { initLive } from './live.js';
import {
  initUI, renderAll, renderMachine, renderCarousel, renderLastShot, renderChart,
  onShotStarted, onShotSample, onShotEnded,
} from './ui.js';

// canvas fixo 1320×800 escalado para a tela real (independe de dpr)
function fitApp() {
  const el = document.querySelector('.app');
  if (!el) return;
  el.style.transform = `scale(${Math.min(window.innerWidth / 1320, window.innerHeight / 800)})`;
}
fitApp();
window.addEventListener('resize', fitApp);
window.addEventListener('orientationchange', fitApp);

// "Hoje 14:40" · "Ontem 09:12" · "11/09 · 18:31"
function whenLabel(at) {
  if (!at) return '';
  const d = new Date(at);
  const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((today - day) / 86400000);
  if (diff === 0) return `Hoje ${hh}`;
  if (diff === 1) return `Ontem ${hh}`;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} · ${hh}`;
}

function toShot(r) {
  const at = r.rawTs ? Date.parse(r.rawTs) : (r.at || null);
  return {
    id: r.id, profile: r.profile, coffee: r.coffee, brand: r.brand,
    coffeeId: r.coffeeId ?? null, grinder: r.grinder, grinderId: r.grinderId ?? null,
    grind: r.grind, dose: r.dose, yield: r.yield, brewTemp: r.brewTemp ?? null,
    duration: r.duration ?? null, at: Number.isNaN(at) ? null : at,
    when: whenLabel(at), series: r.series || null,
  };
}

async function boot() {
  fitApp();

  const chart = createChart(document.getElementById('chart-host'), { gap: 80 });
  // a tela 02 tem o seu próprio gráfico (suavizado, 2px) — ver src/live.js
  const liveChart = initLive();
  for (const c of [chart, liveChart]) c.setConfig({ staticOn: state.staticAxis, staticTimer: state.staticTimer });

  // `?mock=1` força a fonte simulada (só p/ desenvolvimento visual: no app real,
  // com Bridge conectado, a skin nunca usa mock).
  const forceMock = new URLSearchParams(location.search).get('mock') === '1';
  const useBridge = forceMock ? false : await detectHost();
  const source = useBridge ? createApiSource() : createMockSource();
  setState({ hostConnected: useBridge });
  console.info(`[CREMA v2] fonte: ${source.kind}`);

  initWorkflow(source);
  initScreens(source, () => renderAll());
  initHistory(source, () => renderAll());
  initUI(chart, source, liveChart);

  // ---------- telemetria ----------
  source.onSnapshot((m) => {
    const mc = state.machine;
    mc.mixTemp = m.mixTemp;
    mc.groupTemp = m.groupTemp;
    mc.state = m.state || 'ready';   // estado bruto da API; ui.js mapeia p/ a pílula
    if (m.tankPct != null) { mc.tankPct = m.tankPct; mc.tankMl = m.tankMl; }
    renderMachine();
    if (!m.running) return;
    const s = state.live.series;
    s.pressure.push([m.t, m.pressure]);
    s.flow.push([m.t, m.flow]);
    s.temp.push([m.t, m.temp]);
    for (const k of ['pressure', 'flow', 'temp', 'weight']) if (s[k].length > 900) s[k].shift();
    liveChart.update(s);
    state.live.t = m.t;
    onShotSample({
      t: m.t, frame: Number.isInteger(m.frame) ? m.frame : null,
      pressure: m.pressure, flow: m.flow, temp: m.temp,
      weight: mc.scale.weight || 0,
    });
  });

  source.onScale((w) => {
    state.machine.scale.weight = w.weight;
    state.machine.scale.connected = w.connected;
    if (state.live.running) {
      const s = state.live.series;
      const t = s.pressure.length ? s.pressure[s.pressure.length - 1][0] : 0;
      s.weight.push([t, w.weight]);
      liveChart.update(s);
    }
    renderMachine();
  });

  source.onShotStart(() => {
    state.live = { running: true, t: 0, series: { pressure: [], flow: [], temp: [], weight: [] } };
    onShotStarted();
  });

  source.onShotEnd(() => {
    state.live.running = false;
    onShotEnded();
    loadHistory(source).then(() => { renderLastShot(); renderChart(); });
  });

  // ---------- carga inicial ----------
  if (useBridge) {
    Object.assign(state.machine, { state: 'disconnected', mixTemp: null, groupTemp: null, tankMl: null, tankPct: null });
    renderMachine();
    if (source.requestWakeLock) source.requestWakeLock();
    source.start();
  } else {
    source.start && source.start();
  }

  // loadLibrary define state.loadedProfileTitle → precisa vir antes de loadProfiles
  await loadLibrary(source);
  await Promise.all([loadProfiles(source), loadHistory(source)]);
  renderAll();
}

async function loadProfiles(source) {
  const all = await source.getProfiles(true).catch(() => []);
  if (!all.length) return;
  state.profiles.all = all;
  state.profiles.favorites = all.filter((p) => !p.hidden).slice(0, 5);
  const loaded = state.loadedProfileTitle
    && all.find((p) => p.name === state.loadedProfileTitle);
  if (loaded) {
    state.selectedProfileId = loaded.key;
    // o perfil da máquina abre o carrossel, mesmo que não esteja entre os 5 favoritos
    if (!state.profiles.favorites.some((p) => p.key === loaded.key)) {
      state.profiles.favorites = [loaded, ...state.profiles.favorites].slice(0, 5);
    }
  } else if (!state.selectedProfileId && state.profiles.favorites.length) {
    state.selectedProfileId = state.profiles.favorites[0].key;
  }
  // temperatura-base do perfil ativo: referência para os deltas do Brew
  const sel = all.find((p) => p.key === state.selectedProfileId);
  if (sel) {
    state.profileBaseTemp = baseTempOf(sel.raw);
    if (state.profileBaseTemp != null) state.recipe.brewTemp = state.profileBaseTemp;
  }
  renderCarousel();
}

async function loadLibrary(source) {
  const [beans, grinders, workflow] = await Promise.all([
    source.getBeans().catch(() => []),
    source.getGrinders().catch(() => []),
    source.getWorkflow ? source.getWorkflow().catch(() => null) : Promise.resolve(null),
  ]);
  state.beans = beans.map((b) => ({
    id: b.id, name: b.name || b.coffeeName || '—',
    brand: b.roaster || b.brand || '', process: b.process || b.processing || '',
  }));
  state.grinders = grinders.map((g) => ({ id: g.id, name: g.model || g.name || '—' }));

  // A receita vem do que JÁ está carregado na máquina (GET /workflow → context).
  // Sem isso a skin sobrescreveria o próximo shot com o primeiro café da biblioteca.
  const r = state.recipe;
  const ctx = (workflow && workflow.context) || null;
  if (ctx) {
    if (ctx.targetDoseWeight != null) r.dose = ctx.targetDoseWeight;
    if (ctx.targetYield) r.drink = ctx.targetYield;
    if (ctx.grinderModel) r.grinderName = ctx.grinderModel;
    if (ctx.grinderSetting != null && ctx.grinderSetting !== '') {
      const g = Number(String(ctx.grinderSetting).replace(',', '.'));
      if (!Number.isNaN(g)) r.grind = g;
    }
    if (ctx.coffeeName) r.coffeeName = ctx.coffeeName;
    if (ctx.coffeeRoaster) r.coffeeBrand = ctx.coffeeRoaster;
    if (ctx.grinderId) r.grinderId = ctx.grinderId;
  }
  // casa com a biblioteca para recuperar id / marca / processo do café e do moedor
  const bean = state.beans.find((b) => b.name === r.coffeeName)
    || (r.coffeeName ? null : state.beans[0]);
  if (bean) {
    r.coffeeId = bean.id;
    r.coffeeName = bean.name;
    if (!r.coffeeBrand) r.coffeeBrand = bean.brand;
    r.coffeeProcess = bean.process;
  }
  const gr = state.grinders.find((g) => g.name === r.grinderName)
    || (r.grinderName ? null : state.grinders[0]);
  if (gr) { r.grinderId = gr.id; r.grinderName = gr.name; }

  // auxiliares (flush / água quente / vapor) também vêm do workflow
  if (workflow) {
    const a = state.aux;
    if (workflow.rinseData && workflow.rinseData.duration != null) a.flush.s = workflow.rinseData.duration;
    if (workflow.hotWaterData) {
      if (workflow.hotWaterData.volume != null) a.hotWater.ml = workflow.hotWaterData.volume;
      if (workflow.hotWaterData.targetTemperature != null) a.hotWater.temp = workflow.hotWaterData.targetTemperature;
    }
    if (workflow.steamSettings) {
      if (workflow.steamSettings.duration != null) a.steam.time = workflow.steamSettings.duration;
      if (workflow.steamSettings.flow != null) a.steam.flow = workflow.steamSettings.flow;
      a.steam.on = (workflow.steamSettings.duration ?? 0) > 0;
    }
    // perfil carregado na máquina = o selecionado na skin
    if (workflow.profile && workflow.profile.title) state.loadedProfileTitle = workflow.profile.title;
  }
}

async function loadHistory(source) {
  const rows = await source.getShotHistory(60).catch(() => []);
  state.history = rows.map(toShot);
  state.shotIndex = 0;
  // o card do rodapé mostra a curva do último shot
  const first = state.history[0];
  if (first && !first.series && source.getShot) {
    const series = await source.getShot(first.id);
    if (series) {
      first.series = series;
      first.duration = first.duration ?? series.duration;
      if (first.brewTemp == null) first.brewTemp = series.brewTemp ?? null;
    }
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
