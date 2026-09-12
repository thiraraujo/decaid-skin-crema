// CREMA v2 · bootstrap. Escolhe a fonte (Bridge real vs mock) e liga estado → telas.

import { state, setState, clampStaticSeconds } from './store.js';
import { createChart } from './chart.js';
import { createApiSource, detectHost, pumpAt, activeTarget } from './api.js';
import { createMockSource } from './mock.js';
import { initScreens } from './screens.js';
import { initProfiles } from './profiles.js';
import { initWorkflow, baseTempOf, STEAM_MIN_C, rememberSteamTemp, recallSteamTemp } from './workflow.js';
import { initHistory } from './history.js';
import { initLive } from './live.js';
import { createReadinessTracker } from './readiness.js';
import { loadThemeFromHost } from './theme.js';
import { loadPrefs } from './prefs.js';
import {
  initUI, renderAll, renderMachine, renderCarousel, renderLastShot, renderChart,
  onShotStarted, onShotSample, onShotEnded, selectProfile, renderStaticToggle, currentProfile,
} from './ui.js';

// O canvas é fixo em 1320×800 e escalado para caber na tela real.
//
// `window.innerWidth/innerHeight` NÃO são confiáveis dentro da WebView do
// Decaid: podem reportar uma área maior que a realmente visível (barras do
// sistema, insets, zoom próprio da WebView) e a tela vaza pelas bordas. Medimos
// por três fontes e ficamos com a MENOR — assim nunca escapa do visível.
const CANVAS_W = 1320;
const CANVAS_H = 800;

function viewportSize() {
  const doc = document.documentElement;
  const vv = window.visualViewport;
  const probe = document.getElementById('vp-probe');
  const box = probe ? probe.getBoundingClientRect() : null;
  const widths = [doc && doc.clientWidth, vv && vv.width, window.innerWidth, box && box.width];
  const heights = [doc && doc.clientHeight, vv && vv.height, window.innerHeight, box && box.height];
  const pick = (list) => Math.min(...list.filter((n) => typeof n === 'number' && n > 0));
  return { w: pick(widths), h: pick(heights) };
}

function fitApp() {
  const el = document.querySelector('.app');
  if (!el) return;
  const { w, h } = viewportSize();
  if (!isFinite(w) || !isFinite(h)) return;
  const s = Math.min(w / CANVAS_W, h / CANVAS_H);
  // sobra distribuída dos dois lados: a skin fica centrada, sem encostar na borda
  const x = Math.max(0, (w - CANVAS_W * s) / 2);
  const y = Math.max(0, (h - CANVAS_H * s) / 2);
  el.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${s})`;
  document.documentElement.style.setProperty('--app-scale', s.toFixed(4));
  paintDiag();
}

// `?diag=1` mostra num canto o que a WebView reporta e a escala aplicada —
// serve para diagnosticar layout cortado direto no tablet, sem console.
const DIAG = new URLSearchParams(location.search).get('diag') === '1';
let diagEl = null;
function paintDiag() {
  if (!DIAG) return;
  if (!diagEl) {
    diagEl = document.createElement('div');
    diagEl.id = 'vp-diag';
    document.body.appendChild(diagEl);
  }
  const doc = document.documentElement;
  const vv = window.visualViewport;
  const probe = document.getElementById('vp-probe');
  const box = probe ? probe.getBoundingClientRect() : null;
  const { w, h } = viewportSize();
  diagEl.textContent = [
    `doc ${doc.clientWidth}x${doc.clientHeight}`,
    vv ? `visual ${Math.round(vv.width)}x${Math.round(vv.height)}` : 'visual —',
    `inner ${window.innerWidth}x${window.innerHeight}`,
    box ? `probe ${Math.round(box.width)}x${Math.round(box.height)}` : 'probe —',
    `usado ${Math.round(w)}x${Math.round(h)}`,
    `escala ${(Math.min(w / CANVAS_W, h / CANVAS_H)).toFixed(3)}`,
    `dpr ${window.devicePixelRatio}`,
  ].join('  ·  ');
}

fitApp();
paintDiag();
window.addEventListener('resize', fitApp);
window.addEventListener('orientationchange', fitApp);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', fitApp);
  window.visualViewport.addEventListener('scroll', fitApp);
}
// a WebView às vezes só estabiliza o tamanho depois do primeiro paint
window.addEventListener('load', fitApp);
requestAnimationFrame(fitApp);
setTimeout(fitApp, 300);
if (typeof ResizeObserver !== 'undefined') {
  const probe = document.getElementById('vp-probe');
  if (probe) new ResizeObserver(fitApp).observe(probe);
}

// "Today 14:40" · "Yesterday 09:12" · "11/09 · 18:31"
function whenLabel(at) {
  if (!at) return '';
  const d = new Date(at);
  const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((today - day) / 86400000);
  if (diff === 0) return `Today ${hh}`;
  if (diff === 1) return `Yesterday ${hh}`;
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
  chart.setConfig({ staticOn: state.staticAxis });
  liveChart.setConfig({ staticOn: state.staticAxis, staticTimer: state.staticTimer });

  // `?mock=1` força a fonte simulada (só p/ desenvolvimento visual: no app real,
  // com Bridge conectado, a skin nunca usa mock).
  const forceMock = new URLSearchParams(location.search).get('mock') === '1';
  const readiness = createReadinessTracker();
  const useBridge = forceMock ? false : await detectHost();
  const source = useBridge ? createApiSource() : createMockSource();
  setState({ hostConnected: useBridge });
  // leitura do que é da skin mas mora no app (tema, favoritos, eixo Static, teclado);
  // começa já, em paralelo com a leitura da máquina, e entra no portão abaixo
  const themeRead = loadThemeFromHost();
  const prefsRead = loadPrefs(['favorites', 'staticAxis', 'staticSeconds', 'numpadPrevious']);
  console.info(`[CREMA v2] fonte: ${source.kind}`);

  initWorkflow(source);
  initScreens(source, () => renderAll());
  initProfiles({
    onUse: (key) => selectProfile(key),
    onChanged: () => { renderCarousel(); renderChart(); },
  });
  initHistory(source, () => renderAll());
  initUI(chart, source, liveChart);

  // ---------- telemetria ----------
  source.onSnapshot((m) => {
    const mc = state.machine;
    mc.mixTemp = m.mixTemp;
    mc.groupTemp = m.groupTemp;
    mc.targetMixTemp = m.targetMixTemp;
    mc.targetGroupTemp = m.targetGroupTemp;
    mc.state = m.state || 'idle';
    mc.substate = m.substate || '';
    // prontidão real: estado + temperaturas x alvos, com memória (src/readiness.js)
    mc.readiness = readiness.evaluate(mc);
    renderMachine();
    if (!m.running) return;
    const s = state.live.series;
    s.pressure.push([m.t, m.pressure]);
    s.flow.push([m.t, m.flow]);
    s.temp.push([m.t, m.temp]);
    // linha planejada acompanha o shot: alvos que a máquina manda a cada amostra
    const pump = pumpAt(state.live.profile, m.frame);
    s.pressureTarget.push([m.t, activeTarget(m.targetPressure, 'pressure', pump)]);
    s.flowTarget.push([m.t, activeTarget(m.targetFlow, 'flow', pump)]);
    for (const k of Object.keys(s)) if (s[k].length > 900) s[k].shift();
    liveChart.update(s);
    state.live.t = m.t;
    onShotSample({
      t: m.t, frame: Number.isInteger(m.frame) ? m.frame : null,
      pressure: m.pressure, flow: m.flow, temp: m.temp,
      weight: mc.scale.weight || 0,
    });
  });

  // A balança manda frames de STATUS (conexão) e de PESO no mesmo socket.
  // Só o de peso alimenta a série — senão um status no meio do shot cravava 0 g.
  source.onScale((w) => {
    const sc = state.machine.scale;
    sc.connected = w.connected;
    if (w.kind === 'status') {
      if (!w.connected) { sc.weight = 0; sc.flow = null; sc.battery = null; }
      renderMachine();
      return;
    }
    sc.weight = w.weight;
    sc.flow = w.weightFlow;
    sc.battery = w.battery;
    if (state.live.running) {
      const s = state.live.series;
      const t = s.pressure.length ? s.pressure[s.pressure.length - 1][0] : 0;
      s.weight.push([t, w.weight]);
      liveChart.update(s);
    }
    renderMachine();
  });

  // estado de conexão + erros de BLE — a fonte correta, segundo a documentação
  if (source.onDevices) {
    source.onDevices((d) => {
      const mc = state.machine;
      mc.link = { machine: d.machine, scale: d.scale, scanning: d.scanning, phase: d.phase };
      state.machine.error = d.error || null;
      const machineUp = d.machine && d.machine.state === 'connected';
      if (!machineUp) {
        mc.state = 'disconnected';
        mc.readiness = 'disconnected';
        readiness.reset();
      }
      if (d.scale) mc.scale.connected = d.scale.state === 'connected';
      renderMachine();
    });
  }

  // nível do tanque — canal próprio, em mm
  if (source.onWaterLevels) {
    source.onWaterLevels((w) => {
      const water = state.machine.water;
      water.level = w.currentLevel;
      water.refill = w.refillLevel;
      if (w.currentLevel != null && w.currentLevel > water.fullScale) water.fullScale = Math.ceil(w.currentLevel);
      renderMachine();
    });
  }

  source.onShotStart(() => {
    const p = currentProfile();
    state.live = {
      running: true, t: 0, profile: (p && p.raw) || null,
      series: { pressure: [], flow: [], temp: [], weight: [], pressureTarget: [], flowTarget: [] },
    };
    onShotStarted();
  });

  source.onShotEnd(() => {
    state.live.running = false;
    onShotEnded();
    loadHistory(source).then(() => { renderLastShot(); renderChart(); });
  });

  // ---------- carga inicial ----------
  if (useBridge) {
    Object.assign(state.machine, { state: 'disconnected', mixTemp: null, groupTemp: null });
    state.machine.water.level = null;
    renderMachine();
    if (source.requestWakeLock) source.requestWakeLock();
    source.start();
  } else {
    source.start && source.start();
  }

  // Princípio do projeto: a skin LÊ a máquina primeiro e só então libera os toques.
  // Até aqui a tela mostra "—" e fica bloqueada (.app.is-booting); um toque precoce
  // seria sobrescrito pela leitura, ou gravaria algo sobre um estado desconhecido.
  const machineRead = (async () => {
    // loadLibrary define state.loadedProfileTitle → precisa vir antes de loadProfiles
    const [prefs] = await Promise.all([prefsRead, loadLibrary(source), themeRead]);
    applyPrefs(prefs);
    await Promise.all([loadProfiles(source, prefs.favorites), loadHistory(source)]);
  })();
  // rede com problema não pode deixar a tela travada para sempre
  const BOOT_TIMEOUT_MS = 12000;
  await Promise.race([machineRead, new Promise((r) => setTimeout(r, BOOT_TIMEOUT_MS))])
    .catch((e) => console.warn('[CREMA] leitura inicial falhou', e));
  renderAll();
  document.querySelector('.app').classList.remove('is-booting');
}

function applyPrefs(prefs) {
  if (typeof prefs.staticAxis === 'boolean') state.staticAxis = prefs.staticAxis;
  if (typeof prefs.staticSeconds === 'number') state.staticTimer = clampStaticSeconds(prefs.staticSeconds);
  renderStaticToggle();
  if (prefs.numpadPrevious && typeof prefs.numpadPrevious === 'object') state.numpadPrevious = prefs.numpadPrevious;
}

async function loadProfiles(source, savedFavorites) {
  const all = await source.getProfiles(true).catch(() => []);
  if (!all.length) return;
  state.profiles.all = all;
  // favoritos escolhidos pelo usuário (gravados no app); perfis que sumiram da máquina
  // são ignorados. Sem nada salvo, os 5 primeiros perfis visíveis.
  const saved = Array.isArray(savedFavorites)
    ? savedFavorites.map((k) => all.find((p) => p.key === k)).filter(Boolean).slice(0, 5)
    : [];
  state.profiles.favorites = saved.length ? saved : all.filter((p) => !p.hidden).slice(0, 5);
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
      const ss = workflow.steamSettings;
      if (ss.duration != null) a.steam.time = ss.duration;
      if (ss.flow != null) a.steam.flow = ss.flow;
      // ligado = temperatura de vapor na faixa suportada; 0 (ou abaixo) = desligado
      if (typeof ss.targetTemperature === 'number') {
        a.steam.on = ss.targetTemperature >= STEAM_MIN_C;
        if (a.steam.on) { a.steam.temp = ss.targetTemperature; rememberSteamTemp(a.steam.temp); }
        else a.steam.temp = await recallSteamTemp();   // desligado: a máquina tem 0 °C
      }
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
