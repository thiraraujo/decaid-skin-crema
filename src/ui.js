// CREMA v2 · tela principal (01 Home idle / 02 shot ao vivo).
// Render puro a partir de `state` + interações da coluna da receita, carrossel e rodapé.

import { state, setState, FIELDS, fieldFor, ratioText } from './store.js';
import { miniChart } from './chart.js';
import { sleepMachine, openAppSettings } from './host.js';
import { openNumpad } from './numpad.js';
import { openAdjust, openCoffee, openFavorites, openHistory } from './screens.js';
import { pushWorkflow, pushProfile, pushBrewTemp, baseTempOf } from './workflow.js';
import { startLive, onLiveSample, endLive } from './live.js';

const $ = (id) => document.getElementById(id);
const DASH = '—';

let chart = null;
let source = null;
let liveChartRef = null;

// ---------- helpers de formatação ----------
const fmt = (v, d = 1) => (v == null || Number.isNaN(v) ? DASH : Number(v).toFixed(d));
const fmtInt = (v) => (v == null || Number.isNaN(v) ? DASH : String(Math.round(v)));

function valueWithUnit(el, text, unit) {
  el.innerHTML = '';
  el.append(document.createTextNode(text));
  if (unit) {
    const u = document.createElement('span');
    u.className = 'u';
    u.textContent = unit;
    el.appendChild(u);
  }
}

// ================= coluna da receita =================
export function renderRecipe() {
  const r = state.recipe;
  $('coffee-name').textContent = r.coffeeName || DASH;
  $('coffee-brand').textContent = r.coffeeBrand || '';
  const proc = $('coffee-process');
  proc.textContent = r.coffeeProcess || '';
  proc.style.visibility = r.coffeeProcess ? '' : 'hidden';

  $('grinder-name').innerHTML = `${r.grinderName || DASH}<span class="rail__caret">⌄</span>`;
  $('grind-value').textContent = fmt(r.grind, 2);
  valueWithUnit($('dose-value'), fmtInt(r.dose), 'g');
  valueWithUnit($('drink-value'), fmtInt(r.drink), 'g');
  valueWithUnit($('brew-value'), fmtInt(r.brewTemp), '°C');
  $('ratio-value').innerHTML = ratioText().replace(':', '<span class="colon">:</span>');

  for (const chip of $('brew-chips').children) {
    chip.classList.toggle('is-on', Number(chip.dataset.temp) === Math.round(r.brewTemp));
  }

  placeRuler('grind-ruler', r.grind, FIELDS.grind);
  placeRuler('dose-ruler', r.dose, FIELDS.dose);
  placeRuler('drink-ruler', r.drink, FIELDS.drink);
}

// O marcador fica sempre no centro: a régua é "infinita" e o tique alinha com o valor.
// Deslocamos o padrão de ticks para dar a sensação de trilho correndo sob o marcador.
function placeRuler(id, value, field) {
  const el = $(id);
  if (!el || value == null) return;
  const offset = (value / field.step) * 7;   // 7px por passo (tick fino)
  el.style.backgroundPositionX = `${-offset % 35}px, ${-offset % 35}px`;
}

// ================= auxiliares (água / vapor / flush) =================
export function renderAux() {
  const a = state.aux;
  $('aux-water').textContent = `${a.hotWater.ml}ml·${a.hotWater.temp}°`;
  $('aux-steam').textContent = a.steam.on ? `${a.steam.time}s` : 'Off';
  $('aux-flush').textContent = `${a.flush.s}s`;
}

// ================= estado da máquina, balança, tanque =================
const STATE_PILL = {
  ready:        { cls: 'state-pill--ready',        icon: '#ic-cup',       label: 'Ready' },
  heating:      { cls: 'state-pill--heating',      icon: '#ic-cup-steam', label: 'Heating' },
  disconnected: { cls: 'state-pill--disconnected', icon: '#ic-cup-off',   label: 'Disconnected' },
};

// MachineState da API (rest_v1.yml) → as três pílulas do handoff (tela 11).
// Estados de trabalho (espresso/steam/flush/…) continuam "Ready": a máquina está viva.
const STATE_KIND = {
  booting: 'heating', heating: 'heating', preheating: 'heating', fwUpgrade: 'heating',
  sleeping: 'disconnected', disconnected: 'disconnected', error: 'disconnected', needsWater: 'disconnected',
};
const STATE_TEXT = {
  sleeping: 'Sleeping', needsWater: 'Encher o tanque', error: 'Erro', busy: 'Busy',
  cleaning: 'Cleaning', descaling: 'Descaling', fwUpgrade: 'Firmware',
};

export function renderMachine() {
  const m = state.machine;

  const p = STATE_PILL[STATE_KIND[m.state] || 'ready'];
  const pill = $('state-pill');
  pill.className = `state-pill ${p.cls}`;
  $('state-icon').innerHTML = `<use href="${p.icon}"/>`;
  $('state-label').textContent = STATE_TEXT[m.state] || p.label;

  $('mix-value').textContent = fmt(m.mixTemp, 1);
  $('group-value').textContent = fmt(m.groupTemp, 1);

  const w = $('scale-weight');
  valueWithUnit(w, fmt(m.scale.weight, 1), ' g');
  const st = $('scale-status');
  st.textContent = m.scale.connected ? 'Connected' : 'Disconnected';
  st.classList.toggle('is-connected', m.scale.connected);
  $('scale-connect').textContent = m.scale.connected ? 'TARE' : 'CONNECT';

  renderTank();
}

// O nível de água NÃO é legível pela API do ReaPrime: MachineSnapshot não traz o
// campo e /machine/waterLevels é só POST (define o limiar de reabastecimento).
// O único sinal disponível é o estado `needsWater` — então a barra funciona como
// aviso de reabastecer, e não como medidor. Com nível conhecido (mock/dev) ela
// volta a ser medidor.
function renderTank() {
  const { tankPct, tankMl, state: mState } = state.machine;
  const tank = $('tank');
  const needsWater = mState === 'needsWater';
  const pct = tankPct == null ? null : Math.max(0, Math.min(100, tankPct));

  tank.classList.toggle('is-unknown', pct == null && !needsWater);
  tank.classList.toggle('is-refill', needsWater);

  if (needsWater && pct == null) {
    $('tank-fill').style.height = '6%';
    $('tank-pct').style.bottom = '6%';
    $('tank-pct').textContent = '!';
    $('tank-ml').textContent = 'Encher';
    return;
  }
  $('tank-fill').style.height = `${pct ?? 0}%`;
  $('tank-pct').style.bottom = `${pct ?? 0}%`;
  $('tank-pct').textContent = pct == null ? DASH : `${Math.round(pct)}%`;
  valueWithUnit($('tank-ml'), tankMl == null ? DASH : String(Math.round(tankMl)), ' ml');
  tank.classList.toggle('is-low', pct != null && pct < 20 && pct >= 10);
  tank.classList.toggle('is-critical', pct != null && pct < 10);
}

// ================= carrossel de favoritos =================
// 5 slots: central (selecionado), ±1 "near", ±2 "far". Swipe/toque troca a seleção.
export function renderCarousel() {
  const host = $('carousel');
  const favs = state.profiles.favorites;
  host.innerHTML = '';
  if (!favs.length) return;

  const n = favs.length;
  const sel = Math.max(0, favs.findIndex((p) => p.key === state.selectedProfileId));
  // camadas laterais ancoradas às bordas do trilho: ±1 a 120px, ±2 rente à borda
  const EDGE = { 1: 120, 2: 0 };

  for (let d = -2; d <= 2; d++) {
    if (d !== 0 && n <= Math.abs(d)) continue;
    const i = ((sel + d) % n + n) % n;
    const p = favs[i];
    if (!p) continue;
    const card = document.createElement('button');
    card.type = 'button';
    const ad = Math.abs(d);
    card.className = `carousel__card ${ad === 0 ? 'carousel__card--center' : ad === 1 ? 'carousel__card--near' : 'carousel__card--far'}`;
    if (d !== 0) {
      card.style.left = d < 0 ? `${EDGE[ad]}px` : 'auto';
      card.style.right = d > 0 ? `${EDGE[ad]}px` : 'auto';
    }
    card.dataset.key = p.key;

    if (d === 0) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'carousel__mini');
      svg.setAttribute('preserveAspectRatio', 'none');
      card.appendChild(svg);
      const box = document.createElement('div');
      box.innerHTML = `<div class="carousel__name"></div><div class="mono carousel__meta"></div>`;
      box.querySelector('.carousel__name').textContent = p.name;
      box.querySelector('.carousel__meta').textContent = planSummary(p);
      card.appendChild(box);
      miniChart(svg, p, { width: 160, height: 70, pad: 8 });
    } else {
      const lbl = document.createElement('span');
      lbl.className = 'carousel__label';
      lbl.textContent = p.name;
      card.appendChild(lbl);
    }
    host.appendChild(card);
  }
}

// "59s · 9→6 bar · 88°" — resumo do plano do perfil
function planSummary(p) {
  const parts = [];
  if (p.duration) parts.push(`${Math.round(p.duration)}s`);
  const pr = p.pressure || [];
  if (pr.length) {
    const peak = Math.max(...pr.map(([, v]) => v));
    const end = pr[pr.length - 1][1];
    parts.push(Math.abs(peak - end) > 0.4 ? `${fmt(peak, 0)}→${fmt(end, 0)} bar` : `${fmt(peak, 0)} bar`);
  }
  const t = p.temp && p.temp.length ? p.temp[0][1] : null;
  if (t != null) parts.push(`${fmt(t, 0)}°`);
  return parts.join(' · ');
}

export function selectProfile(key) {
  if (!key || key === state.selectedProfileId) return;
  state.selectedProfileId = key;
  state.chartMode = 'plan';
  // o Brew segue a temperatura-base do novo perfil
  const p = currentProfile();
  const base = baseTempOf(p && p.raw);
  if (base != null) { state.profileBaseTemp = base; state.recipe.brewTemp = base; renderRecipe(); }
  renderCarousel();
  renderChart();
  pushProfile(p);
}

export function currentProfile() {
  return state.profiles.favorites.find((p) => p.key === state.selectedProfileId)
    || state.profiles.all.find((p) => p.key === state.selectedProfileId)
    || null;
}

// ================= card do último shot =================
export function renderLastShot() {
  const list = state.history;
  const s = list[state.shotIndex];
  const mini = $('lastshot-mini');
  if (!s) {
    $('lastshot-profile').textContent = DASH;
    $('lastshot-coffee').textContent = '';
    $('lastshot-meta').textContent = DASH;
    mini.innerHTML = '';
    return;
  }
  $('lastshot-profile').textContent = s.profile || 'Shot';
  $('lastshot-coffee').textContent = s.coffee || '';
  $('lastshot-meta').textContent = shotMeta(s, state.shotIndex, list.length);
  if (s.series) miniChart(mini, s.series, { width: 300, height: 70 });
  else mini.innerHTML = '';
}

export function shotMeta(s, idx, total) {
  const bits = [];
  if (s.when) bits.push(s.when);
  if (total) bits.push(`${idx + 1}/${total}`);
  if (s.grinder) bits.push(`${s.grinder}${s.grind != null ? ` ${fmt(s.grind, 2)}` : ''}`);
  if (s.dose != null && s.yield != null) bits.push(`${fmtInt(s.dose)}→${fmtInt(s.yield)}g`);
  if (s.dose && s.yield) bits.push(`1:${(s.yield / s.dose).toFixed(1)}`);
  if (s.duration != null) bits.push(`${Math.round(s.duration)}s`);
  return bits.join(' · ');
}

// ================= gráfico =================
export function renderChart() {
  if (!chart) return;
  if (state.chartMode === 'live') return;
  if (state.chartMode === 'plan') {
    chart.showPlan(currentProfile());
  } else {
    const s = state.history[state.shotIndex];
    if (s && s.series) chart.showShot({ ...s.series, phases: s.series.phases || [] });
    else chart.showPlan(currentProfile());
  }
}

// ================= shot ao vivo (02) =================
// A tela 02 é um elemento próprio (#live) que cobre a home; o gráfico ao vivo é
// uma segunda instância, suavizada — ver src/live.js.
let endTimer = null;

export function onShotStarted() {
  clearTimeout(endTimer);
  state.chartMode = 'live';
  $('home').classList.add('is-live');
  const live = $('live');
  live.hidden = false;
  requestAnimationFrame(() => live.classList.add('is-on'));
  startLive(currentProfile());
}

export function onShotSample(m) {
  onLiveSample(m);
}

// Ao terminar, a tela fica 3s com todos os blocos antes de voltar à home
// (docs/handoff-shot-live § Comportamento).
export function onShotEnded() {
  endLive();
  clearTimeout(endTimer);
  endTimer = setTimeout(() => {
    const live = $('live');
    live.classList.remove('is-on');
    $('home').classList.remove('is-live');
    setTimeout(() => { live.hidden = true; }, 300);
    state.chartMode = 'lastShot';
    renderChart();
  }, 3000);
}

// ================= réguas (drag com snap) =================
function bindRuler(id, field, apply) {
  const el = $(id);
  if (!el) return;
  let startX = 0, startVal = 0, active = false, f = FIELDS[field];

  const PX_PER_STEP = 7;   // um tique fino = um passo

  el.addEventListener('pointerdown', (e) => {
    active = true;
    startX = e.clientX;
    startVal = apply.get();
    f = fieldFor(field, startVal);   // faixa efetiva do valor atual
    // captura mantém o arrasto vivo se o dedo sair da régua; falha em ponteiros
    // sintéticos (testes) e não deve derrubar o gesto
    try { el.setPointerCapture(e.pointerId); } catch { /* segue sem captura */ }
  });
  el.addEventListener('pointermove', (e) => {
    if (!active) return;
    // o canvas é escalado por transform: converte px de tela → px de layout
    const scale = document.querySelector('.app').getBoundingClientRect().width / 1320;
    const dx = (e.clientX - startX) / (scale || 1);
    const steps = Math.round(dx / PX_PER_STEP);
    const next = clampStep(startVal + steps * f.step, f);
    if (next !== apply.get()) { apply.set(next); }
  });
  const end = (e) => {
    if (!active) return;
    active = false;
    try { el.releasePointerCapture(e.pointerId); } catch {}
    apply.commit();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

function clampStep(v, f) {
  const snapped = Math.round(v / f.step) * f.step;
  return Math.min(f.max, Math.max(f.min, Number(snapped.toFixed(4))));
}

// ================= bootstrap =================
export function initUI(chartInstance, dataSource, liveChart) {
  chart = chartInstance;
  source = dataSource;
  liveChartRef = liveChart || null;

  // --- coluna da receita ---
  $('coffee-name-btn').addEventListener('click', () => openCoffee('coffee'));
  $('grinder-btn').addEventListener('click', () => openCoffee('grinder'));

  $('grind-value').addEventListener('click', () => openNumpad('grind', state.recipe.grind, (v) => setRecipe({ grind: v })));
  $('dose-value').addEventListener('click', () => openNumpad('dose', state.recipe.dose, (v) => setRecipe({ dose: v })));
  $('drink-value').addEventListener('click', () => openNumpad('drink', state.recipe.drink, (v) => setRecipe({ drink: v })));
  $('brew-value').addEventListener('click', () => openNumpad('brew', state.recipe.brewTemp, (v) => setBrew(v)));

  for (const chip of $('brew-chips').children) {
    chip.addEventListener('click', () => setBrew(Number(chip.dataset.temp)));
  }

  bindRuler('grind-ruler', 'grind', {
    get: () => state.recipe.grind,
    set: (v) => { state.recipe.grind = v; renderRecipe(); },
    commit: () => pushWorkflow(),
  });
  bindRuler('dose-ruler', 'dose', {
    get: () => state.recipe.dose,
    set: (v) => { state.recipe.dose = v; renderRecipe(); },
    commit: () => pushWorkflow(),
  });
  bindRuler('drink-ruler', 'drink', {
    get: () => state.recipe.drink,
    set: (v) => { state.recipe.drink = v; renderRecipe(); },
    commit: () => pushWorkflow(),
  });

  $('machine-group').addEventListener('click', () => openAdjust());

  // --- topo ---
  $('btn-sleep').addEventListener('click', () => sleepMachine());
  $('btn-settings').addEventListener('click', () => openAppSettings());
  $('edit-favorites').addEventListener('click', () => openFavorites());

  // --- carrossel ---
  bindCarousel();

  // --- gráfico ---
  const tog = $('static-toggle');
  tog.addEventListener('click', () => {
    state.staticAxis = !state.staticAxis;
    tog.classList.toggle('is-on', state.staticAxis);
    tog.setAttribute('aria-checked', String(state.staticAxis));
    chart.setConfig({ staticOn: state.staticAxis });
    if (liveChartRef) liveChartRef.setConfig({ staticOn: state.staticAxis });
  });

  // --- rodapé ---
  $('shot-prev').addEventListener('click', () => stepShot(+1));
  $('shot-next').addEventListener('click', () => stepShot(-1));
  $('lastshot-body').addEventListener('click', () => openHistory(state.history[state.shotIndex]));
  $('scale-connect').addEventListener('click', () => {
    if (!source) return;
    if (state.machine.scale.connected) source.tareScale && source.tareScale();
    else source.connectScale && source.connectScale();
  });

  // --- shot ao vivo ---
  $('btn-stop').addEventListener('click', () => {
    if (source && source.setMachineState) source.setMachineState('idle');
  });

  renderAll();
}

// Swipe ou toque troca o perfil selecionado. Captura o ponteiro para que o gesto
// sobreviva ao dedo saindo do trilho, e ignora o toque quando ele virou arrasto.
function bindCarousel() {
  const host = $('carousel');
  const SWIPE_PX = 40;
  let x0 = null, target = null;

  host.addEventListener('pointerdown', (e) => {
    x0 = e.clientX;
    target = e.target.closest('.carousel__card');
    try { host.setPointerCapture(e.pointerId); } catch { /* mouse sem captura: tudo bem */ }
  });
  host.addEventListener('pointerup', (e) => {
    if (x0 == null) return;
    // o canvas é escalado por transform: converte px de tela → px de layout
    const scale = document.querySelector('.app').getBoundingClientRect().width / 1320;
    const dx = (e.clientX - x0) / (scale || 1);
    x0 = null;
    try { host.releasePointerCapture(e.pointerId); } catch {}
    const favs = state.profiles.favorites;
    if (!favs.length) return;
    if (Math.abs(dx) > SWIPE_PX) {
      const n = favs.length;
      const sel = Math.max(0, favs.findIndex((p) => p.key === state.selectedProfileId));
      selectProfile(favs[((sel + (dx < 0 ? 1 : -1)) % n + n) % n].key);
      return;
    }
    if (target && target.dataset.key) selectProfile(target.dataset.key);
  });
  host.addEventListener('pointercancel', () => { x0 = null; target = null; });
}

function stepShot(dir) {
  const n = state.history.length;
  if (!n) return;
  state.shotIndex = Math.min(n - 1, Math.max(0, state.shotIndex + dir));
  state.chartMode = 'lastShot';
  renderLastShot();
  renderChart();
}

export function setRecipe(patch) {
  Object.assign(state.recipe, patch);
  renderRecipe();
  pushWorkflow();
}

// Brew não existe no workflow: a temperatura vive no perfil, por step (ver workflow.js)
export function setBrew(v) {
  state.recipe.brewTemp = v;
  renderRecipe();
  pushBrewTemp(currentProfile());
}

export function renderAll() {
  renderRecipe();
  renderAux();
  renderMachine();
  renderCarousel();
  renderLastShot();
  renderChart();
}
