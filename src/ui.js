// CREMA v2 · tela principal (01 Home idle / 02 shot ao vivo).
// Render puro a partir de `state` + interações da coluna da receita, carrossel e rodapé.

import { state, setState, FIELDS, PRESETS, fieldFor, ratioText, clampStaticSeconds } from './store.js';
import { miniChart } from './chart.js';
import { sleepMachine, wakeMachine, openAppSettings } from './host.js';
import { syncSaver } from './saver.js';
import { openNumpad } from './numpad.js';
import { openAdjust, openCoffee, openHistory, openThemes } from './screens.js';
import { openProfiles } from './profiles.js';
import { pushWorkflow, pushProfile, pushBrewTemp, baseTempOf } from './workflow.js';
import { startLive, onLiveSample, endLive } from './live.js';
import { savePref } from './prefs.js';

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
  if (unit && text !== DASH) {   // valor desconhecido: só "—", sem unidade solta
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
    chip.classList.toggle('is-on', r.brewTemp != null && Number(chip.dataset.temp) === Math.round(r.brewTemp));
  }
  paintPresets('dose-chips', PRESETS.dose, r.dose);
  paintPresets('drink-chips', PRESETS.drink, r.drink);

  placeRuler('grind-ruler', r.grind, FIELDS.grind);
}

// Dose e Drink são presets em botão; valores fora da lista continuam vindo do
// teclado (toque no número) e deixam todos os botões apagados.
function paintPresets(id, values, current) {
  const host = $(id);
  if (!host) return;
  if (host.children.length !== values.length) {
    host.innerHTML = values.map((v) => `<button class="chip chip--round" data-v="${v}" type="button">${v}</button>`).join('');
  }
  for (const chip of host.children) {
    chip.classList.toggle('is-on', current != null && Number(chip.dataset.v) === Math.round(current));
  }
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
  const has = (v) => v != null;
  $('aux-water').textContent = has(a.hotWater.ml) && has(a.hotWater.temp)
    ? `${a.hotWater.ml}ml·${a.hotWater.temp}°` : DASH;
  // ligado: tempo · fluxo lado a lado, no mesmo formato da água quente
  $('aux-steam').textContent = a.steam.on == null ? DASH
    : !a.steam.on ? 'Off'
    : [has(a.steam.time) ? `${a.steam.time}s` : null, has(a.steam.flow) ? `${a.steam.flow}` : null]
        .filter(Boolean).join('·') || DASH;
  $('aux-flush').textContent = has(a.flush.s) ? `${a.flush.s}s` : DASH;
}

// ================= estado da máquina, balança, tanque =================
// mensagens por `kind` do ConnectionError (doc/Skins.md § Handling connection errors)
const SCALE_ERROR = {
  scaleConnectFailed: 'Scale did not connect',
  scaleDisconnected: 'Scale dropped',
  adapterOff: 'Bluetooth is off',
  bluetoothPermissionDenied: 'No Bluetooth permission',
  scanFailed: 'Scan could not start',
};

const STATE_PILL = {
  ready:        { cls: 'state-pill--ready',        icon: '#ic-cup',       label: 'Ready' },
  heating:      { cls: 'state-pill--heating',      icon: '#ic-cup-steam', label: 'Heating' },
  notHeating:   { cls: 'state-pill--heating',      icon: '#ic-cup',       label: 'Not heating' },
  sleeping:     { cls: 'state-pill--disconnected', icon: '#ic-moon',      label: 'Sleeping' },
  noWater:      { cls: 'state-pill--disconnected', icon: '#ic-cup-off',   label: 'No water' },
  disconnected: { cls: 'state-pill--disconnected', icon: '#ic-cup-off',   label: 'Disconnected' },
};

export function renderMachine() {
  const m = state.machine;

  const p = STATE_PILL[m.readiness] || STATE_PILL.disconnected;
  const pill = $('state-pill');
  pill.className = `state-pill ${p.cls}`;
  $('state-icon').innerHTML = `<use href="${p.icon}"/>`;
  $('state-label').textContent = p.label;

  // dormindo: a tela apaga e qualquer toque acorda a máquina
  $('sleep-veil').hidden = m.readiness !== 'sleeping';
  // com a proteção de tela ligada (e imagens escolhidas), ela cobre o véu
  syncSaver();

  $('mix-value').textContent = fmt(m.mixTemp, 1);
  $('group-value').textContent = fmt(m.groupTemp, 1);

  const w = $('scale-weight');
  valueWithUnit(w, fmt(m.scale.weight, 1), ' g');
  // erro de BLE do canal /devices tem mensagem e sugestão prontas — mostramos
  // no lugar do status genérico quando o erro é da balança
  const st = $('scale-status');
  const err = m.error;
  const scaleErr = err && /scale/i.test(err.kind || '') ? err : null;
  const bleOff = err && (err.kind === 'adapterOff' || err.kind === 'bluetoothPermissionDenied');
  st.textContent = scaleErr ? (SCALE_ERROR[scaleErr.kind] || scaleErr.message || 'Error')
    : bleOff ? (SCALE_ERROR[err.kind] || err.message)
    : m.scale.connected ? 'Connected' : 'Disconnected';
  st.title = scaleErr ? (scaleErr.suggestion || '') : '';
  st.classList.toggle('is-connected', m.scale.connected && !scaleErr);
  const connectBtn = $('scale-connect');
  connectBtn.dataset.restore = m.scale.connected ? 'TARE' : 'CONNECT';
  if (!connectBtn.dataset.busy && !connectBtn.dataset.flashing) {
    connectBtn.textContent = connectBtn.dataset.restore;
  }

  renderTank();
}

// Nível do tanque: a DE1 reporta ALTURA DA ÁGUA em milímetros pelo canal
// ws/v1/machine/waterLevels (o REST não expõe). O app oficial mostra "NNmm" e
// acende o aviso quando currentLevel <= refillLevel — fazemos o mesmo, porque a
// conversão mm→ml depende da geometria do tanque e não é dada por lugar nenhum.
// A barra usa uma escala cheia de referência que se ajusta se a máquina reportar
// um nível maior.
function renderTank() {
  const { water, state: mState } = state.machine;
  const tank = $('tank');
  const level = water.level;
  const needsWater = mState === 'needsWater'
    || (level != null && water.refill != null && level <= water.refill);

  tank.classList.toggle('is-unknown', level == null && !needsWater);
  tank.classList.toggle('is-refill', needsWater);

  if (level == null) {
    $('tank-fill').style.height = needsWater ? '6%' : '0';
    $('tank-pct').style.bottom = needsWater ? '6%' : '0';
    $('tank-pct').textContent = needsWater ? '!' : DASH;
    $('tank-ml').textContent = needsWater ? 'Refill' : DASH;
    tank.classList.remove('is-low', 'is-critical');
    return;
  }

  const pct = Math.max(0, Math.min(100, (level / water.fullScale) * 100));
  $('tank-fill').style.height = `${pct}%`;
  $('tank-pct').style.bottom = `${pct}%`;
  $('tank-pct').textContent = `${Math.round(level)}`;
  valueWithUnit($('tank-ml'), String(Math.round(level)), ' mm');
  tank.classList.toggle('is-low', !needsWater && pct < 25);
  tank.classList.remove('is-critical');
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
  setStopMode('stop');
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

// Ao terminar, a tela do shot FICA — é a hora de ler o que aconteceu. Sai só no
// toque em FECHAR (que ocupa o lugar do STOP) ou sozinha depois de 1 minuto.
const LIVE_AUTOCLOSE_MS = 60000;

export function onShotEnded() {
  endLive();
  setStopMode('close');
  clearTimeout(endTimer);
  endTimer = setTimeout(closeLive, LIVE_AUTOCLOSE_MS);
}

export function closeLive() {
  clearTimeout(endTimer);
  endTimer = null;
  const live = $('live');
  live.classList.remove('is-on');
  $('home').classList.remove('is-live');
  setTimeout(() => { live.hidden = true; }, 300);
  setStopMode('stop');
  state.chartMode = 'lastShot';
  renderChart();
}

// STOP (durante o shot, vermelho) ↔ FECHAR (depois, neutro)
function setStopMode(mode) {
  const btn = $('btn-stop');
  btn.dataset.mode = mode;
  btn.classList.toggle('btn-stop--close', mode === 'close');
  $('btn-stop-label').textContent = mode === 'close' ? 'CLOSE' : 'STOP';
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
  bindPresets('dose-chips', (v) => setRecipe({ dose: v }));
  bindPresets('drink-chips', (v) => setRecipe({ drink: v }));

  $('machine-group').addEventListener('click', () => openAdjust());

  // --- topo ---
  $('btn-sleep').addEventListener('click', () => sleepMachine());
  $('btn-theme').addEventListener('click', () => openThemes());
  // véu padrão: acorda com toque curto OU longo. `click` não serve — no Android um
  // toque longo vira menu de contexto e o click nunca chega.
  const veil = $('sleep-veil');
  let veilTimer = null;
  const veilWake = () => { clearTimeout(veilTimer); veilTimer = null; wakeMachine(); };
  veil.addEventListener('pointerdown', (e) => {
    try { veil.setPointerCapture(e.pointerId); } catch { /* sem captura */ }
    clearTimeout(veilTimer);
    veilTimer = setTimeout(veilWake, 1000);
  });
  veil.addEventListener('pointerup', () => { if (veilTimer) veilWake(); });
  veil.addEventListener('contextmenu', (e) => e.preventDefault());
  // SETTINGS: resposta imediata no botão enquanto a página do app carrega
  $('btn-settings').addEventListener('click', async () => {
    const btn = $('btn-settings');
    if (btn.dataset.busy) return;
    btn.dataset.busy = '1';
    const original = btn.innerHTML;
    btn.classList.add('is-busy');
    btn.lastChild.textContent = ' OPENING…';
    const ok = await openAppSettings();
    const restore = () => { btn.innerHTML = original; btn.classList.remove('is-busy'); delete btn.dataset.busy; };
    if (!ok) { restore(); flash(btn, 'UNAVAILABLE'); return; }
    // voltou pelo histórico do navegador (página preservada): o botão volta ao normal
    window.addEventListener('pageshow', restore, { once: true });
  });
  $('edit-favorites').addEventListener('click', () => openProfiles());

  // --- carrossel ---
  bindCarousel();

  // --- gráfico ---
  const tog = $('static-toggle');
  tog.addEventListener('click', () => {
    state.staticAxis = !state.staticAxis;
    renderStaticToggle();
    savePref('staticAxis', state.staticAxis);
  });

  // --- rodapé ---
  $('shot-prev').addEventListener('click', () => stepShot(+1));
  $('shot-next').addEventListener('click', () => stepShot(-1));
  $('lastshot-body').addEventListener('click', () => openHistory(state.history[state.shotIndex]));
  // toque no mini-gráfico: plota esse shot no gráfico principal
  $('lastshot-mini').addEventListener('click', () => showShotInChart());
  // CONNECT força a conexão BT na hora (api.js: /devices/connect, com scan de
  // reserva). Enquanto isso o botão mostra o progresso — o scan pode demorar.
  $('scale-connect').addEventListener('click', async () => {
    if (!source) return;
    const btn = $('scale-connect');
    if (state.machine.scale.connected) {
      if (source.tareScale) await source.tareScale();
      flash(btn, 'TARED');
      return;
    }
    if (!source.connectScale || btn.dataset.busy) return;
    btn.dataset.busy = '1';
    btn.textContent = 'SEARCHING…';
    const ok = await source.connectScale();
    delete btn.dataset.busy;
    if (!state.machine.scale.connected) flash(btn, ok ? 'NO SCALE' : 'FAILED');
    else renderMachine();
  });

  // --- shot ao vivo ---
  $('btn-stop').addEventListener('click', (e) => {
    if (e.currentTarget.dataset.mode === 'close') { closeLive(); return; }
    if (source && source.setMachineState) source.setMachineState('idle');
  });

  renderAll();
}

// Swipe ou toque troca o perfil selecionado. Captura o ponteiro para que o gesto
// sobreviva ao dedo saindo do trilho, e ignora o toque quando ele virou arrasto.
function bindPresets(id, apply) {
  const host = $(id);
  if (!host) return;
  host.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (b) apply(Number(b.dataset.v));
  });
}

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
  showShotInChart();
}

// O gráfico principal mostra o shot do rodapé. O histórico chega sem as curvas (só o
// primeiro vem completo): busca as do shot escolhido e redesenha quando chegarem.
let shotLoadToken = 0;
function showShotInChart() {
  state.chartMode = 'lastShot';
  renderLastShot();
  renderChart();
  const s = state.history[state.shotIndex];
  if (!s || s.series || !source || !source.getShot) return;
  const token = ++shotLoadToken;
  source.getShot(s.id).then((series) => {
    if (!series) return;
    s.series = series;
    s.duration = s.duration ?? series.duration;
    if (s.brewTemp == null && series.brewTemp != null) s.brewTemp = series.brewTemp;
    if (token !== shotLoadToken || state.history[state.shotIndex] !== s) return;
    if (state.chartMode === 'lastShot') { renderLastShot(); renderChart(); }
  }).catch((e) => console.warn('[CREMA] curvas do shot', s.id, e));
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

// feedback curto no próprio botão quando a ação não pôde ser executada
function flash(btn, text) {
  if (btn.dataset.flashing) return;
  const original = btn.dataset.restore || btn.innerHTML;
  btn.dataset.flashing = '1';
  btn.textContent = text;
  btn.classList.add('is-warn');
  setTimeout(() => {
    btn.innerHTML = original;
    btn.classList.remove('is-warn');
    delete btn.dataset.flashing;
  }, 1600);
}

export function renderStaticToggle() {
  const tog = $('static-toggle');
  tog.classList.toggle('is-on', state.staticAxis);
  tog.setAttribute('aria-checked', String(state.staticAxis));
  chart.setConfig({ staticOn: state.staticAxis });
  // STATIC e Y só valem no shot ao vivo
  if (liveChartRef) liveChartRef.setConfig({ staticOn: state.staticAxis, staticTimer: state.staticTimer });
}

/** Y do STATIC: ajustado na configuração da skin, gravado no app */
export function setStaticSeconds(v) {
  state.staticTimer = clampStaticSeconds(v);
  if (liveChartRef) liveChartRef.setConfig({ staticTimer: state.staticTimer });
  savePref('staticSeconds', state.staticTimer);
  return state.staticTimer;
}

export function renderAll() {
  renderRecipe();
  renderAux();
  renderMachine();
  renderCarousel();
  renderLastShot();
  renderChart();
}
