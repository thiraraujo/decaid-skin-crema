// CREMA v2 · bootstrap. Escolhe a fonte (Bridge real vs mock) e liga estado → telas.

import { state, setState } from './store.js';
import { createChart } from './chart.js';
import { createApiSource, detectHost } from './api.js';
import { createMockSource } from './mock.js';
import { initScreens } from './screens.js';
import { initHistory } from './history.js';
import {
  initUI, renderAll, renderMachine, renderCarousel, renderLastShot, renderChart,
  onShotStarted, onShotTick, onShotEnded, selectProfile,
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
  chart.setConfig({ staticOn: state.staticAxis, staticTimer: state.staticTimer });

  // `?mock=1` força a fonte simulada (só p/ desenvolvimento visual: no app real,
  // com Bridge conectado, a skin nunca usa mock).
  const forceMock = new URLSearchParams(location.search).get('mock') === '1';
  const useBridge = forceMock ? false : await detectHost();
  const source = useBridge ? createApiSource() : createMockSource();
  setState({ hostConnected: useBridge });
  console.info(`[CREMA v2] fonte: ${source.kind}`);

  initScreens(source, () => renderAll());
  initHistory(source, () => renderAll());
  initUI(chart, source);

  // ---------- telemetria ----------
  source.onSnapshot((m) => {
    const mc = state.machine;
    mc.mixTemp = m.mixTemp;
    mc.groupTemp = m.groupTemp;
    mc.state = m.state === 'idle' ? 'ready' : m.state;
    if (m.tankPct != null) { mc.tankPct = m.tankPct; mc.tankMl = m.tankMl; }
    renderMachine();
    if (!m.running) return;
    const s = state.live.series;
    s.pressure.push([m.t, m.pressure]);
    s.flow.push([m.t, m.flow]);
    s.temp.push([m.t, m.temp]);
    for (const k of ['pressure', 'flow', 'temp', 'weight']) if (s[k].length > 900) s[k].shift();
    chart.update(s);
    onShotTick(m.t);
  });

  source.onScale((w) => {
    state.machine.scale.weight = w.weight;
    state.machine.scale.connected = w.connected;
    if (state.live.running) {
      const s = state.live.series;
      const t = s.pressure.length ? s.pressure[s.pressure.length - 1][0] : 0;
      s.weight.push([t, w.weight]);
      chart.update(s);
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

  await Promise.all([loadProfiles(source), loadLibrary(source), loadHistory(source)]);
  renderAll();
}

async function loadProfiles(source) {
  const all = await source.getProfiles(true).catch(() => []);
  if (!all.length) return;
  state.profiles.all = all;
  state.profiles.favorites = all.filter((p) => !p.hidden).slice(0, 5);
  if (!state.selectedProfileId && state.profiles.favorites.length) {
    state.selectedProfileId = state.profiles.favorites[0].key;
  }
  renderCarousel();
}

async function loadLibrary(source) {
  const [beans, grinders] = await Promise.all([
    source.getBeans().catch(() => []),
    source.getGrinders().catch(() => []),
  ]);
  state.beans = beans.map((b) => ({
    id: b.id, name: b.name || b.coffeeName || '—',
    brand: b.roaster || b.brand || '', process: b.process || b.processing || '',
  }));
  state.grinders = grinders.map((g) => ({ id: g.id, name: g.model || g.name || '—' }));

  // receita inicial = primeiro café/moedor da biblioteca, se ainda não houver
  const r = state.recipe;
  if (!r.coffeeName && state.beans[0]) {
    Object.assign(r, { coffeeId: state.beans[0].id, coffeeName: state.beans[0].name, coffeeBrand: state.beans[0].brand, coffeeProcess: state.beans[0].process });
  }
  if (!r.grinderName && state.grinders[0]) {
    Object.assign(r, { grinderId: state.grinders[0].id, grinderName: state.grinders[0].name });
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
    if (series) { first.series = series; first.duration = first.duration ?? series.duration; }
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
