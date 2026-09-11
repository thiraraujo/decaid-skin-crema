// CREMA · interações da interface (modais, steppers, presets, perfis, toggles).
// Touch-only: usa estados :active/pressed (sem hover) — ver CSS.

import { state, setState } from './store.js';
import { sleepMachine, openAppSettings } from './host.js';
import { PROFILES as MOCK_PROFILES, FAVORITES as MOCK_FAVORITES, SAMPLE_SHOTS, SIM_STEPS, FALLBACK_FAVORITE_TITLES } from './profiles.js';

// biblioteca de perfis ativa: mock (dev) ou carregada do Bridge (getProfiles).
let profileLib = MOCK_PROFILES;

let chartRef = null;  // injetado por initUI (para o comportamento do Static)
let sourceRef = null; // fonte de dados (mock/bridge) — para ações de balança
let simRunning = false; // simulação de shot (apenas dev/mock)

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

const modals = {
  coffee: () => document.getElementById('modal-coffee'),
  adjust: () => document.getElementById('modal-adjust'),
  numpad: () => document.getElementById('modal-numpad'),
  profiles: () => document.getElementById('modal-profiles'),
  coffeehist: () => document.getElementById('modal-coffeehist'),
  editshot: () => document.getElementById('modal-editshot'),
};

function openModal(name) {
  closeModal();
  const el = modals[name] && modals[name]();
  if (el) { el.hidden = false; setState({ openModal: name }); }
}
function closeModal() {
  for (const k of Object.keys(modals)) { const el = modals[k](); if (el) el.hidden = true; }
  setState({ openModal: null });
}

// ---- valores dos controles ----
const CTRL = {
  dose:  { id: 'dose-value',  unit: 'g', digits: 1, key: 'dose' },
  drink: { id: 'drink-value', unit: 'g', digits: 0, key: 'drink' },
  brew:  { id: 'brew-value',  unit: '°', digits: 0, key: 'brewTemp' },
};

function setUnitValue(id, value, unit, digits = 0) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `${value.toFixed(digits)}<span class="unit">${unit}</span>`;
}

function updateRatio() {
  const { dose, drink } = state.profile;
  const r = dose > 0 ? (drink / dose) : 0;
  const txt = r > 0 ? `1:${r.toFixed(1)}` : '1:0';
  state.profile.ratio = txt;
  const el = document.getElementById('ratio-value');
  if (el) el.textContent = txt;
}

function applyCtrl(name) {
  const c = CTRL[name];
  setUnitValue(c.id, state.profile[c.key], c.unit, c.digits);
  updateRatio();
  if (name === 'brew') pushBrewTemp();   // Brew = temperatura do perfil, não campo do context
  else pushWorkflow();
}

function bumpCtrl(name, d) {
  const c = CTRL[name];
  state.profile[c.key] = Math.max(0, +(state.profile[c.key] + d).toFixed(c.digits));
  // ao ajustar manualmente, nenhum preset fica "ativo"
  clearPresetActive(name);
  applyCtrl(name);
}

function bumpGrinder(d) {
  const v = Math.max(0, +(state.profile.grinderSetting + d).toFixed(2));
  state.profile.grinderSetting = v;
  document.getElementById('grinder-value').textContent = v.toFixed(2);
  pushWorkflow();
}
function bumpStatic(d) {
  const v = Math.max(1, state.profile.staticTimer + d);
  state.profile.staticTimer = v;
  document.getElementById('static-value').textContent = `${v} sec`;
  if (chartRef && state.profile.staticOn) chartRef.setConfig({ staticOn: true, staticTimer: v });
}

const STEP = {
  'grinder+': () => bumpGrinder(+0.05),
  'grinder-': () => bumpGrinder(-0.05),
  'dose+': () => bumpCtrl('dose', +0.1),
  'dose-': () => bumpCtrl('dose', -0.1),
  'drink+': () => bumpCtrl('drink', +1),
  'drink-': () => bumpCtrl('drink', -1),
  'brew+': () => bumpCtrl('brew', +1),
  'brew-': () => bumpCtrl('brew', -1),
  'static+': () => bumpStatic(+5),
  'static-': () => bumpStatic(-5),
};

// ---- presets do rail ----
function clearPresetActive(group) {
  const row = document.querySelector(`[data-preset-group="${group}"]`);
  if (row) row.querySelectorAll('.preset').forEach((p) => p.classList.remove('active'));
}
function selectPreset(group, chip) {
  const c = CTRL[group];
  if (!c) return;
  clearPresetActive(group);
  chip.classList.add('active');
  state.profile[c.key] = Number(chip.dataset.preset);
  applyCtrl(group);
}

// ---- numpad (Grinder / Dose / Drink / Brew) ----
const FIELDS = {
  grinder: { title: 'GRINDER', unit: '',  min: 0,  max: 50,  decimals: 2, key: 'grinderSetting' },
  dose:    { title: 'DOSE',    unit: 'g', min: 5,  max: 30,  decimals: 1, key: 'dose',    group: 'dose' },
  drink:   { title: 'DRINK',   unit: 'g', min: 0,  max: 100, decimals: 0, key: 'drink',   group: 'drink' },
  brew:    { title: 'BREW',    unit: '°', min: 80, max: 100, decimals: 0, key: 'brewTemp', group: 'brew' },
};
const prevValues = { grinder: [], dose: [18, 17], drink: [], brew: [] };
let numpadField = null;
let numpadInput = '';

const fmtNum = (v, d) => String(parseFloat(v.toFixed(d)));

function renderNumpadDisplay() {
  const f = FIELDS[numpadField];
  const shown = numpadInput === '' ? '0' : numpadInput;
  document.getElementById('numpad-display').innerHTML = `${shown}<span class="unit">${f.unit}</span>`;
}
function renderNumpadPrev() {
  const wrap = document.getElementById('numpad-prev');
  wrap.innerHTML = '';
  for (const v of prevValues[numpadField]) {
    const chip = document.createElement('div');
    chip.className = 'prev-chip';
    chip.dataset.prev = v;
    chip.textContent = v;
    wrap.appendChild(chip);
  }
}
function openNumpad(field) {
  const f = FIELDS[field];
  if (!f) return;
  numpadField = field;
  numpadInput = fmtNum(state.profile[f.key], f.decimals);
  document.getElementById('numpad-title').textContent = f.title;
  document.getElementById('numpad-hint').textContent = `Input a value between ${f.min}-${f.max}${f.unit}`;
  renderNumpadDisplay();
  renderNumpadPrev();
  openModal('numpad');
}
function numpadKey(k) {
  if (k === 'back') numpadInput = numpadInput.slice(0, -1);
  else if (k === '.') { if (!numpadInput.includes('.')) numpadInput += (numpadInput === '' ? '0.' : '.'); }
  else if (numpadInput.replace('.', '').length < 5) numpadInput += k;
  renderNumpadDisplay();
}
function numpadConfirm() {
  const f = FIELDS[numpadField];
  let v = parseFloat(numpadInput);
  if (isNaN(v)) return closeModal();
  v = +clamp(v, f.min, f.max).toFixed(f.decimals);
  state.profile[f.key] = v;
  if (numpadField === 'grinder') { document.getElementById('grinder-value').textContent = v.toFixed(2); pushWorkflow(); }
  else { clearPresetActive(f.group); applyCtrl(f.group); }
  prevValues[numpadField] = [v, ...prevValues[numpadField].filter((x) => x !== v)].slice(0, 3);
  closeModal();
}

// ---- perfis (barra superior + gráfico planejado) ----
let pickerSlot = 0;
let pickerMode = 'assign'; // 'assign' = duplo-clique favorito · 'select' = navegar todos
let showHidden = false;    // mostrar perfis ocultos no modal

function setTitle(name, type) {
  const el = document.getElementById('content-title');
  if (el) {
    el.innerHTML = `<span class="title-name">${name}</span> <span class="sub">${type}</span>`;
    fitTitle();
  }
}

// encolhe a fonte do título até caber numa linha (nunca quebra)
function fitTitle() {
  const el = document.getElementById('content-title');
  if (!el) return;
  el.style.fontSize = '';                       // volta ao padrão (32px)
  const avail = el.clientWidth;
  if (avail > 0 && el.scrollWidth > avail) {
    const base = parseFloat(getComputedStyle(el).fontSize);
    el.style.fontSize = `${Math.max(15, Math.floor(base * avail / el.scrollWidth))}px`;
  }
}

// renderiza a barra de favoritos a partir de state.favorites
function renderProfiles() {
  const wrap = document.getElementById('profiles');
  if (!wrap) return;
  wrap.innerHTML = '';
  state.favorites.forEach((key, i) => {
    const p = profileLib[key];
    if (!p) return;
    const div = document.createElement('div');
    div.className = 'profile' + (key === state.selectedProfileKey ? ' active' : '');
    div.dataset.profileKey = key;
    div.dataset.slot = i;
    div.textContent = p.name;
    wrap.appendChild(div);
  });
}

function plannedView(p) {
  return { kind: 'profile', duration: p.duration, pressure: p.pressure, flow: p.flow, temp: p.temp, weight: null, phases: p.phases };
}

// clique simples: seleciona o favorito → título + gráfico planejado
function selectProfile(key) {
  const p = profileLib[key];
  if (!p) return;
  if (simRunning) simStop();          // sai do modo ao vivo para ver o planejado
  hideShotPhase();
  state.selectedProfileKey = key;
  state.graphMode = 'profile';
  document.querySelectorAll('#profiles .profile').forEach((el) =>
    el.classList.toggle('active', el.dataset.profileKey === key));
  setTitle(p.name, p.type);
  const pv = plannedView(p);
  if (chartRef) chartRef.showStatic(pv);
  renderShotTable(pv, p.duration);   // Preinfusion + Extraction + Total do perfil planejado
  // Brew reflete a temperatura real do perfil (1º step) → base para deltas futuros
  const steps = p.raw && Array.isArray(p.raw.steps) ? p.raw.steps : [];
  const t0 = steps.length && typeof steps[0].temperature === 'number' ? steps[0].temperature : null;
  if (t0 != null) {
    state.profileBaseTemp = t0;
    state.profile.brewTemp = Math.round(t0);
    setUnitValue('brew-value', state.profile.brewTemp, '°', 0);
    clearPresetActive('brew');
  } else {
    state.profileBaseTemp = null;
  }
  // aplica o perfil na máquina (Bridge): PUT /api/v1/workflow { profile }
  if (sourceRef && sourceRef.putWorkflow && p.raw) sourceRef.putWorkflow({ profile: p.raw });
}

function setPickerText() {
  const sub = document.getElementById('profile-picker-sub');
  if (sub) {
    sub.textContent = pickerMode === 'assign'
      ? 'Choose the profile for this favorite.'
      : 'Tap a profile to use it (favorites unchanged).';
  }
}

// reinicia o estado "mostrar ocultos" ao abrir o modal
function resetShowHidden() {
  showHidden = false;
  const t = document.getElementById('show-hidden-toggle');
  if (t) t.classList.add('off');
}

// clique duplo num favorito: troca o perfil daquele slot
function openProfilePicker(slot) {
  pickerMode = 'assign';
  pickerSlot = slot;
  resetShowHidden();
  renderProfilePicker();
  setPickerText();
  openModal('profiles');
}

// botão "todos os perfis": navegar e selecionar qualquer perfil (fora dos favoritos)
function browseProfiles() {
  pickerMode = 'select';
  resetShowHidden();
  renderProfilePicker();
  setPickerText();
  openModal('profiles');
}

function renderProfilePicker() {
  const wrap = document.getElementById('profile-picker');
  if (!wrap) return;
  wrap.innerHTML = '';
  const currentKey = pickerMode === 'assign' ? state.favorites[pickerSlot] : state.selectedProfileKey;
  for (const [key, p] of Object.entries(profileLib)) {
    if (!showHidden && p.hidden) continue;                 // esconde os ocultos
    const card = document.createElement('div');
    card.className = 'pp-card' + (key === currentKey ? ' selected' : '') + (p.hidden ? ' is-hidden' : '');
    card.dataset.profileKey = key;
    // com "Show hidden" ligado, cada perfil ganha um toggle de visibilidade
    const vis = showHidden
      ? `<div class="pp-vis toggle${p.hidden ? ' off' : ''}" data-vis="${key}" role="switch" aria-label="Visível"><div class="knob"></div></div>`
      : '';
    card.innerHTML = `<div class="pp-main"><span class="pp-name">${p.name}</span><span class="pp-type">${p.type}</span></div>${vis}`;
    wrap.appendChild(card);
  }
}

// liga/desliga a exibição dos perfis ocultos
function toggleShowHidden() {
  showHidden = !showHidden;
  const t = document.getElementById('show-hidden-toggle');
  if (t) t.classList.toggle('off', !showHidden);
  renderProfilePicker();
}

// mostra/oculta um perfil (grava na máquina via PUT /profiles/{id}/visibility)
function toggleProfileVisibility(key) {
  const p = profileLib[key];
  if (!p) return;
  p.hidden = !p.hidden;
  if (sourceRef && sourceRef.setProfileVisibility) sourceRef.setProfileVisibility(key, !p.hidden);
  renderProfilePicker();
}

function pickProfile(key) {
  if (pickerMode === 'assign') {           // troca o favorito do slot
    state.favorites[pickerSlot] = key;
    renderProfiles();
  }
  selectProfile(key);                       // seleciona/aplica o perfil (dos dois modos)
  closeModal();
}

// clique num shot do histórico → gráfico estático do shot gravado
async function showShot(entry) {
  if (simRunning) simStop();
  hideShotPhase();
  let s;
  if (sourceRef && sourceRef.kind === 'bridge' && sourceRef.getShot) {
    s = await sourceRef.getShot(entry.id);       // GET /api/v1/shots/{id}.measurements
  } else {
    s = SAMPLE_SHOTS[entry.ts];
  }
  if (!s || !chartRef) return;
  state.graphMode = 'shot';
  setTitle(s.profile, 'Last shot');
  chartRef.showStatic({ kind: 'shot', duration: s.duration, pressure: s.pressure, flow: s.flow, temp: s.temp, weight: s.weight, phases: [] });
  renderShotTable(s, s.duration);
}

// ---- carregamento do Bridge (perfis, histórico) + gravação de workflow ----
// escolhe os 5 favoritos casando os títulos de fallback da Streamline contra os perfis
// da máquina (EN ou PT); completa com os demais na ordem retornada.
function pickFavorites(list) {
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const used = new Set();
  const keys = [];
  for (const variants of FALLBACK_FAVORITE_TITLES) {
    const wanted = variants.map(norm);
    const hit = list.find((p) => !used.has(p.key) &&
      wanted.some((w) => w && (norm(p.name) === w || norm(p.name).includes(w))));
    if (hit) { keys.push(hit.key); used.add(hit.key); }
  }
  for (const p of list) {
    if (keys.length >= 5) break;
    if (!used.has(p.key)) { keys.push(p.key); used.add(p.key); }
  }
  return keys.slice(0, 5);
}

async function loadProfiles() {
  if (sourceRef && sourceRef.kind === 'bridge' && sourceRef.getProfiles) {
    let list = await sourceRef.getProfiles(true);     // inclui ocultos (para o "Show hidden")
    if (!list.length) list = await sourceRef.getProfiles(false);  // fallback: só visíveis
    if (list.length) {
      profileLib = {};
      for (const p of list) profileLib[p.key] = p;
      const visible = list.filter((p) => !p.hidden);
      state.favorites = pickFavorites(visible.length ? visible : list);
      state.selectedProfileKey = state.favorites[0];
    }
  }
  renderProfiles();
  // mostra o perfil selecionado como planejado (gráfico + tabela por fase) no boot,
  // exceto quando já há um shot ao vivo (mock/SIM assume o gráfico e a tabela).
  const sel = profileLib[state.selectedProfileKey];
  if (sel && !simRunning) {
    setTitle(sel.name, sel.type);
    const pv = plannedView(sel);
    if (chartRef) chartRef.showStatic(pv);
    renderShotTable(pv, sel.duration);
  }
}
async function loadShots() {
  // No Bridge real usamos SEMPRE o histórico da máquina (mesmo vazio) — nunca o mock,
  // senão apareceriam shots inexistentes com id falso (o clique não abriria nada).
  if (sourceRef && sourceRef.kind === 'bridge' && sourceRef.getShots) {
    state.recentShots = await sourceRef.getShots();   // GET /api/v1/shots
  }
  state.shotIndex = 0;
  renderShotCard();
}

let wfTimer = null;
// grava a recipe atual na máquina (Bridge): PUT /api/v1/workflow (debounced).
// IMPORTANTE: a API espera os campos da recipe DENTRO de `context`; steamSettings,
// hotWaterData e rinseData (= flush) ficam no nível de topo, ao lado de `context`.
function pushWorkflow() {
  if (!(sourceRef && sourceRef.putWorkflow)) return;
  clearTimeout(wfTimer);
  wfTimer = setTimeout(() => {
    const pf = state.profile;
    sourceRef.putWorkflow({
      context: {
        targetDoseWeight: pf.dose,
        targetYield: pf.drink,
        grinderModel: pf.grinder,
        grinderSetting: String(pf.grinderSetting),
        coffeeName: pf.coffee,
        finalBeverageType: 'espresso',
      },
      steamSettings: { targetTemperature: 155, duration: pf.steamTime, flow: pf.steamFlow },
      hotWaterData: { targetTemperature: pf.hotWater.temp, volume: pf.hotWater.ml },
      rinseData: { duration: pf.flush },
    });
  }, 400);
}

// Brew (temperatura) não tem campo no workflow — a temperatura mora no PERFIL (por step).
// Então mudar o Brew clona o perfil ativo, desloca a temperatura de todos os steps pelo
// delta em relação à temperatura-base do perfil, e reenvia via PUT /workflow { profile }.
let brewTimer = null;
function pushBrewTemp() {
  if (!(sourceRef && sourceRef.putWorkflow)) return;
  const p = profileLib[state.selectedProfileKey];
  if (!p || !p.raw || !Array.isArray(p.raw.steps) || state.profileBaseTemp == null) return;
  const delta = state.profile.brewTemp - state.profileBaseTemp;
  const raw = JSON.parse(JSON.stringify(p.raw));
  for (const s of raw.steps) {
    if (typeof s.temperature === 'number') s.temperature = +(s.temperature + delta).toFixed(1);
  }
  clearTimeout(brewTimer);
  brewTimer = setTimeout(() => sourceRef.putWorkflow({ profile: raw }), 400);
}

// ---- toggles ----
function toggleSwitch(el, key) {
  const on = !el.classList.toggle('off'); // classe 'off' => desligado
  if (key === 'static') applyStatic(on);
  if (key === 'steam') applySteam(on);
}

// Steam ligado → revela opções de Time/Flow e reflete no rail.
function applySteam(on) {
  state.profile.steam = on;
  const lbl = document.getElementById('steam-state');
  if (lbl) lbl.textContent = on ? 'ON' : 'OFF';
  const opts = document.getElementById('steam-options');
  if (opts) opts.hidden = !on;
  refreshRail();
  pushWorkflow();
}

// Static ligado  → eixo X fixo até staticTimer; mostra o stepper de tempo.
// Static desligado → eixo X dinâmico (segue a extração); esconde números+stepper.
function applyStatic(on) {
  state.profile.staticOn = on;
  const stepper = document.getElementById('static-stepper');
  if (stepper) stepper.style.display = on ? '' : 'none';
  if (chartRef) chartRef.setConfig({ staticOn: on, staticTimer: state.profile.staticTimer });
}

// ---- chips grandes dos modais (Adjustments) ----
// grava o valor no perfil (que será enviado ao app via workflow no M4) e reflete no rail.
function applyChip(groupName, value) {
  const p = state.profile;
  if (groupName === 'flush') p.flush = value;
  else if (groupName === 'hw-volume') p.hotWater.ml = value;
  else if (groupName === 'hw-temp') p.hotWater.temp = value;
  else if (groupName === 'steam-time') p.steamTime = value;
  else if (groupName === 'steam-flow') p.steamFlow = value;
  pushWorkflow();
}
function selectChip(groupEl, chip) {
  groupEl.querySelectorAll('.big-chip').forEach((c) => c.classList.remove('selected'));
  chip.classList.add('selected');
  applyChip(groupEl.dataset.chipgroup, Number(chip.dataset.value));
  refreshRail();
}

// log dos últimos shots (esquerda do rodapé)
// ---- card do último shot (navegável, Opção 1 centralizada) ----
const shotSeriesCache = {};
async function getShotSeries(entry) {
  const key = entry.id || entry.ts;
  if (key in shotSeriesCache) return shotSeriesCache[key];
  let s = null;
  if (sourceRef && sourceRef.kind === 'bridge' && sourceRef.getShot && entry.id) s = await sourceRef.getShot(entry.id);
  else s = SAMPLE_SHOTS[entry.ts] || null;
  shotSeriesCache[key] = s;
  return s;
}
const fmt1 = (v) => (v == null ? '—' : String(Math.round(v * 10) / 10));
const fmt0 = (v) => (v == null ? '—' : String(Math.round(v)));
// "2026/06/27 02:05" -> "27/06/2026 · 02:05"
function fmtDateBR(ts) {
  const [d, t] = String(ts || '').split(' ');
  const p = (d || '').split('/');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}${t ? ' · ' + t : ''}` : ts;
}

function renderShotCard() {
  const wrap = document.getElementById('shot-card');
  if (!wrap) return;
  const shots = state.recentShots;
  if (!shots.length) {
    wrap.innerHTML = '<div class="shot-card"><div class="sc-head"><span class="sc-hbtn" data-action="coffee-history" role="button"><span class="sc-hi">≡</span> History</span></div><div class="sc-empty">Sem shots ainda</div></div>';
    return;
  }
  const i = clamp(state.shotIndex, 0, shots.length - 1);
  state.shotIndex = i;
  const s = shots[i];
  const ratio = (s.dose > 0 && s.yield != null) ? `1:${(s.yield / s.dose).toFixed(1)}` : '—';
  const coffee = s.coffee ? `<span class="sc-coffee">· ${esc(s.coffee)}</span>` : '';
  const out = s.finalWeight != null ? fmt0(s.finalWeight) : '—';
  // setas invertidas: ‹ (esquerda) vai para o mais antigo (2/5…); › (direita) volta ao mais recente (1/5)
  const olderOff = i === shots.length - 1 ? ' is-disabled' : '';
  const newerOff = i === 0 ? ' is-disabled' : '';
  wrap.innerHTML =
    `<div class="shot-card" data-id="${s.id || s.ts}" data-ts="${esc(s.ts)}">
      <div class="sc-head">
        <span class="sc-hbtn" data-action="coffee-history" role="button"><span class="sc-hi">≡</span> History</span>
        <span class="sc-pos">${i + 1} / ${shots.length}</span>
        <span class="sc-hbtn edit" data-action="edit-shot" role="button"><span class="sc-hi">✎</span> Edit</span>
      </div>
      <div class="sc-nav">
        <div class="sc-arrow${olderOff}" data-action="shot-older" role="button" aria-label="Shot mais antigo">‹</div>
        <div class="sc-when">
          <div class="sc-date">${fmtDateBR(s.ts)}</div>
          <div class="sc-title">${esc(s.profile)}${coffee}</div>
          <div class="sc-grind">${s.grinder ? esc(s.grinder) + ' · ' : ''}grind ${s.grind != null ? esc(s.grind) : '—'}</div>
        </div>
        <div class="sc-arrow${newerOff}" data-action="shot-newer" role="button" aria-label="Shot mais recente">›</div>
      </div>
      <div class="sc-metrics4">
        <div class="sc-m time"><div class="sc-m-lb">Time</div><div class="sc-m-vv">${s.duration != null ? `${fmt0(s.duration)}<small>s</small>` : '—'}</div></div>
        <div class="sc-m"><div class="sc-m-lb">Dose</div><div class="sc-m-vv">${fmt1(s.dose)}<small>g</small></div></div>
        <div class="sc-m out"><div class="sc-m-lb">Out</div><div class="sc-m-vv o">${out !== '—' ? `${out}<small>g</small>` : '—'}</div></div>
        <div class="sc-m"><div class="sc-m-lb">Ratio</div><div class="sc-m-vv">${ratio}</div></div>
      </div>
    </div>`;
  if (s.duration == null || s.finalWeight == null) fillFromSeries(s, s.duration == null, s.finalWeight == null);
}
// completa tempo e/ou gramas finais a partir do detalhe do shot (measurements)
async function fillFromSeries(entry, needDur, needFinal) {
  const s = await getShotSeries(entry);
  const cur = document.querySelector('#shot-card .shot-card');
  if (!s || !cur || cur.dataset.ts !== entry.ts) return;   // trocou de shot enquanto buscava
  if (needDur && s.duration != null) {
    const el = cur.querySelector('.sc-m.time .sc-m-vv');
    if (el) el.innerHTML = `${fmt0(s.duration)}<small>s</small>`;
  }
  if (needFinal) {
    const w = s.weight && s.weight.length ? s.weight[s.weight.length - 1][1] : null;
    const el = cur.querySelector('.sc-m.out .sc-m-vv');
    if (el && w != null) el.innerHTML = `${fmt0(w)}<small>g</small>`;
  }
}
function shotNav(dir) {
  const n = state.recentShots.length;
  if (!n) return;
  const ni = clamp(state.shotIndex + dir, 0, n - 1);
  if (ni === state.shotIndex) return;      // nas pontas não faz nada (sem dar a volta)
  state.shotIndex = ni;
  renderShotCard();
  // se o gráfico já está mostrando um shot, muda automaticamente para o novo shot
  if (state.graphMode === 'shot') {
    const s = state.recentShots[ni];
    showShot({ id: s.id || s.ts, ts: s.ts });
  }
}

// ================= HISTÓRICO POR CAFÉ + BIBLIOTECA (Fase 1) =================
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// atualiza o rail com o par café/moedor/moagem escolhido
function setRailPairing(coffee, brand, grinder, grind) {
  const p = state.profile;
  if (coffee) { p.coffee = coffee; const el = document.querySelector('.coffee-name'); if (el) el.textContent = coffee; }
  if (brand != null) { const el = document.querySelector('.coffee-sub'); if (el) el.textContent = brand || ''; }
  if (grinder) {
    p.grinder = grinder;
    const gv = document.querySelector('.grinder-val');
    if (gv && gv.firstChild && gv.firstChild.nodeType === 3) gv.firstChild.nodeValue = grinder + ' ';
  }
  if (grind != null && !isNaN(+grind)) {
    p.grinderSetting = +grind;
    const el = document.getElementById('grinder-value'); if (el) el.textContent = (+grind).toFixed(2);
  }
}

// ---- navegador de histórico por café ----
let chGroups = [];   // [{key, coffee, brand, count, lastTs, shots:[]}]
let chSel = -1;      // índice do café selecionado (-1 = lista)

async function loadShotHistory() {
  let list = [];
  if (sourceRef && sourceRef.getShotHistory) list = await sourceRef.getShotHistory(60);
  else list = state.recentShots.map((s) => ({ ...s, brand: s.brand || '', grinder: s.grinder || '' }));
  const map = new Map();
  for (const s of list) {
    const coffee = (s.coffee || '').trim();
    const key = (coffee || '—') + '|' + (s.brand || '');
    if (!map.has(key)) map.set(key, { key, coffee: coffee || 'Sem café', brand: s.brand || '', count: 0, lastTs: s.ts, shots: [] });
    const g = map.get(key); g.count++; g.shots.push(s);
  }
  chGroups = [...map.values()];   // API já vem do mais recente pro mais antigo
}
function openCoffeeHistory() {
  chSel = -1;
  loadShotHistory().then(() => { renderCoffeeHistory(); openModal('coffeehist'); });
}
function chBack() { chSel = -1; renderCoffeeHistory(); }
function renderCoffeeHistory() {
  const body = document.getElementById('coffeehist-body');
  const back = document.querySelector('#modal-coffeehist .ch-back');
  const title = document.getElementById('ch-title');
  const sub = document.getElementById('ch-sub');
  if (!body) return;
  body.classList.toggle('ch-list', chSel >= 0);   // grade (cafés) vs lista (shots)
  if (chSel < 0) {
    if (back) back.hidden = true;
    if (title) title.textContent = 'Coffee history';
    if (sub) sub.textContent = 'Toque num café para ver os últimos shots e aplicar a combinação.';
    body.innerHTML = chGroups.length
      ? chGroups.map((g, i) =>
        `<div class="pp-card ch-coffee" data-ch-coffee="${i}"><div class="pp-main">`
        + `<span class="pp-name">${esc(g.coffee)}${g.brand ? ` · <span class="ch-brand">${esc(g.brand)}</span>` : ''}</span>`
        + `<span class="pp-type">${g.count} shot${g.count > 1 ? 's' : ''} · último ${esc(g.lastTs)}</span>`
        + `</div></div>`).join('')
      : '<div class="ch-empty">Sem shots ainda</div>';
  } else {
    const g = chGroups[chSel];
    if (back) back.hidden = false;
    if (title) title.textContent = g.coffee;
    if (sub) sub.textContent = g.brand || 'Últimos shots';
    body.innerHTML = g.shots.slice(0, 5).map((s, i) =>
      `<div class="ch-shot"><div class="ch-shot-main">`
      + `<div class="ch-shot-top">${esc(s.ts)} · ${esc(s.profile)}</div>`
      + `<div class="ch-shot-metrics"><span class="ch-grind">grind ${s.grind != null ? esc(s.grind) : '—'}</span> · ${fmt1(s.dose)}→${fmt0(s.yield)}<small>g</small>${s.grinder ? ` · ${esc(s.grinder)}` : ''}</div>`
      + `</div><div class="ch-apply" data-ch-apply="${i}" role="button">apply</div></div>`).join('');
  }
}
function applyPairing(s) {
  if (!s) return;
  setRailPairing(s.coffee === 'Sem café' ? '' : s.coffee, s.brand, s.grinder, s.grind);
  updateRatio();
  pushWorkflow();          // grava coffeeName/grinderModel/grinderSetting no context
  closeModal();
}

// ---- biblioteca Café & Moedor (lê /beans e /grinders reais) ----
let libBeans = [];
let libGrinders = [];
async function openCoffeeLibrary() {
  openModal('coffee');
  libAdd = null;
  libBeans = (sourceRef && sourceRef.getBeans) ? await sourceRef.getBeans() : [];
  libGrinders = (sourceRef && sourceRef.getGrinders) ? await sourceRef.getGrinders() : [];
  renderLibrary();
}
const beanName = (b) => b.name || b.coffeeName || b.title || b.roast || 'Café';
const beanBrand = (b) => b.roaster || b.brand || b.coffeeRoaster || b.origin || '';
const grinderName = (g) => g.model || g.name || g.title || 'Moedor';
let libAdd = null;   // null | 'coffee' | 'grinder' → mostra o form de novo item
function renderLibrary() {
  const cc = document.getElementById('coffee-cards');
  const gc = document.getElementById('grinder-cards');
  const coffeeForm = libAdd === 'coffee'
    ? `<div class="lib-form"><input id="nb-name" placeholder="Nome do café" autocomplete="off"><input id="nb-roaster" placeholder="Marca / roaster" autocomplete="off"><div class="lib-form-row"><div class="lib-cancel" data-action="lib-cancel">Cancelar</div><div class="lib-add" data-action="lib-save-coffee">Adicionar</div></div></div>` : '';
  const grinderForm = libAdd === 'grinder'
    ? `<div class="lib-form"><input id="ng-model" placeholder="Modelo do moedor" autocomplete="off"><div class="lib-form-row"><div class="lib-cancel" data-action="lib-cancel">Cancelar</div><div class="lib-add" data-action="lib-save-grinder">Adicionar</div></div></div>` : '';
  if (cc) cc.innerHTML = coffeeForm + (libBeans.length
    ? libBeans.map((b, i) => {
      const act = beanName(b) === state.profile.coffee ? ' selected' : '';
      const proc = b.process || '';
      return `<div class="card${act}" data-bean="${i}"><div class="card-top"><div class="card-coffee-name">${esc(beanName(b))}</div>${proc ? `<div class="washed-tag">${esc(proc)}</div>` : ''}</div><div class="card-bottom"><div class="card-coffee-sub">${esc(beanBrand(b))}</div></div></div>`;
    }).join('')
    : (libAdd === 'coffee' ? '' : '<div class="ch-empty">Nenhum café cadastrado</div>'));
  if (gc) gc.innerHTML = grinderForm + (libGrinders.length
    ? libGrinders.map((g, i) => {
      const act = grinderName(g) === state.profile.grinder ? ' selected' : '';
      return `<div class="card card-grinder${act}" data-grinder="${i}"><div class="card-grinder-name">${esc(grinderName(g))}</div></div>`;
    }).join('')
    : (libAdd === 'grinder' ? '' : '<div class="ch-empty">Nenhum moedor cadastrado</div>'));
}
function selectBean(i) {
  const b = libBeans[i]; if (!b) return;
  setRailPairing(beanName(b), beanBrand(b), null, null);
  pushWorkflow(); renderLibrary();
}
function selectGrinder(i) {
  const g = libGrinders[i]; if (!g) return;
  setRailPairing(null, null, grinderName(g), null);
  pushWorkflow(); renderLibrary();
}
function libNewCoffee() { libAdd = 'coffee'; renderLibrary(); const el = document.getElementById('nb-name'); if (el) el.focus(); }
function libNewGrinder() { libAdd = 'grinder'; renderLibrary(); const el = document.getElementById('ng-model'); if (el) el.focus(); }
function libCancel() { libAdd = null; renderLibrary(); }
async function libSaveCoffee() {
  const name = (document.getElementById('nb-name') || {}).value?.trim();
  const roaster = (document.getElementById('nb-roaster') || {}).value?.trim();
  if (!name || !roaster) return;            // /beans exige name + roaster
  if (sourceRef && sourceRef.addBean) {
    const b = await sourceRef.addBean({ name, roaster });
    if (b) libBeans = [b, ...libBeans];
  }
  libAdd = null; renderLibrary();
}
async function libSaveGrinder() {
  const model = (document.getElementById('ng-model') || {}).value?.trim();
  if (!model) return;
  if (sourceRef && sourceRef.addGrinder) {
    const g = await sourceRef.addGrinder({ model });
    if (g) libGrinders = [g, ...libGrinders];
  }
  libAdd = null; renderLibrary();
}

// ---- editor de shot (✎): Coffee/Grinder como pickers, Grind size como stepper ----
let esState = null;   // { id, ts, profile, coffee, brand, grinder, grind, pick }
async function openEditShot() {
  const s = state.recentShots[state.shotIndex];
  if (!s || !s.id) return;   // precisa de id real (bridge)
  libBeans = (sourceRef && sourceRef.getBeans) ? await sourceRef.getBeans() : [];
  libGrinders = (sourceRef && sourceRef.getGrinders) ? await sourceRef.getGrinders() : [];
  esState = { id: s.id, ts: s.ts, profile: s.profile, coffee: s.coffee || '', brand: s.brand || '',
    grinder: s.grinder || '', grind: s.grind != null ? +s.grind : 0, pick: null };
  const sub = document.getElementById('es-sub');
  if (sub) sub.textContent = `${fmtDateBR(s.ts)} · ${s.profile}`;
  renderEditShot();
  openModal('editshot');
}
const CHEV = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 9l4-4 4 4M8 15l4 4 4-4"/></svg>';
function renderEditShot() {
  const body = document.getElementById('editshot-body');
  if (!body || !esState) return;
  const coffeeLbl = esState.coffee ? esc(esState.coffee) + (esState.brand ? ` · <span class="ch-brand">${esc(esState.brand)}</span>` : '') : 'Choose coffee';
  const grinderLbl = esState.grinder ? esc(esState.grinder) : 'Choose grinder';
  const coffeeList = esState.pick === 'coffee'
    ? `<div class="es-list">${libBeans.length ? libBeans.map((b, i) => `<div class="es-opt" data-es-choose="coffee:${i}">${esc(beanName(b))}${beanBrand(b) ? ` · <span class="ch-brand">${esc(beanBrand(b))}</span>` : ''}</div>`).join('') : '<div class="es-list-empty">No coffees yet</div>'}</div>` : '';
  const grinderList = esState.pick === 'grinder'
    ? `<div class="es-list">${libGrinders.length ? libGrinders.map((g, i) => `<div class="es-opt" data-es-choose="grinder:${i}">${esc(grinderName(g))}</div>`).join('') : '<div class="es-list-empty">No grinders yet</div>'}</div>` : '';
  body.innerHTML =
    `<div class="es-label">Coffee</div>
     <div class="es-picker${esState.coffee ? '' : ' ph'}" data-es-pick="coffee" role="button"><span>${coffeeLbl}</span>${CHEV}</div>${coffeeList}
     <div class="es-label">Grinder</div>
     <div class="es-picker${esState.grinder ? '' : ' ph'}" data-es-pick="grinder" role="button"><span>${grinderLbl}</span>${CHEV}</div>${grinderList}
     <div class="es-label">Grind size</div>
     <div class="es-grind"><div class="step-btn lg" data-es-grind="-1">−</div><div class="es-grind-val">${(+esState.grind).toFixed(2)}</div><div class="step-btn lg" data-es-grind="1">+</div></div>
     <div class="es-help">Updates THIS shot in the Decent history (same shot — not a new one). Visualizer sync needs a Decent account (coming next).</div>
     <div class="es-actions">
       <div class="es-btn ghost" data-action="close-modal" role="button">Cancel</div>
       <div class="es-btn primary" data-action="editshot-save" role="button">Save and update</div>
     </div>`;
}
function esPick(which) { esState.pick = esState.pick === which ? null : which; renderEditShot(); }
function esChoose(spec) {
  const [which, i] = spec.split(':'); const idx = +i;
  if (which === 'coffee') { const b = libBeans[idx]; if (b) { esState.coffee = beanName(b); esState.brand = beanBrand(b); } }
  else { const g = libGrinders[idx]; if (g) esState.grinder = grinderName(g); }
  esState.pick = null; renderEditShot();
}
function esGrind(d) { esState.grind = Math.max(0, +(+esState.grind + d * 0.1).toFixed(2)); renderEditShot(); }
async function saveEditShot() {
  if (!esState) return closeModal();
  const extras = {};
  if (esState.coffee) extras.coffeeName = esState.coffee;
  if (esState.brand) extras.coffeeRoaster = esState.brand;
  if (esState.grinder) extras.grinderModel = esState.grinder;
  if (esState.grind) extras.grinderSetting = String(esState.grind);
  if (sourceRef && sourceRef.updateShotAnnotations) {
    const ok = await sourceRef.updateShotAnnotations(esState.id, { extras });
    if (ok) {
      const s = state.recentShots[state.shotIndex];
      if (s && s.id === esState.id) Object.assign(s, { coffee: esState.coffee, brand: esState.brand, grinder: esState.grinder, grind: esState.grind || null });
    }
  }
  closeModal();
  renderShotCard();
}

// ---- quadro de fases do shot (atualiza ao vivo, como no Streamline) ----
const SPLIT_T = 14; // transição preinfusion → extraction (bate com a curva do mock)

function segStats(pairs, t0, t1) {
  const seg = (pairs || []).filter(([t]) => t >= t0 && t <= t1);
  if (!seg.length) return null;
  let peak = -Infinity;
  for (const [, v] of seg) if (v > peak) peak = v;
  return { start: seg[0][1], end: seg[seg.length - 1][1], peak };
}
function segVolume(flow, t0, t1) {
  const seg = (flow || []).filter(([t]) => t >= t0 && t <= t1);
  let v = 0;
  for (let i = 1; i < seg.length; i++) v += ((seg[i][1] + seg[i - 1][1]) / 2) * (seg[i][0] - seg[i - 1][0]);
  return v;
}
const fnum = (v) => (Math.abs(v) < 0.05 ? '0' : v.toFixed(1));
const rangeTxt = (s) => (s ? `${fnum(s.start)}→${fnum(s.peak)}→${fnum(s.end)}` : '—');

function phaseRow(name, dur, grams, ml, temp, fl, pr, total, started = true) {
  const cls = total ? 'st-grid st-row st-total' : 'st-grid st-row';
  // fase ainda não iniciada → todas as colunas viram tracinho
  if (!started) {
    return `<div class="${cls}"><div class="name">${name}</div>`
      + '<div>—</div><div>—</div><div>—</div>'
      + '<div>—</div><div class="c-blue">—</div><div class="c-green">—</div></div>';
  }
  const tail = total
    ? '<div></div><div></div><div></div>'
    : `<div>${temp != null ? Math.round(temp) : '—'}</div>`
      + `<div class="c-blue">${rangeTxt(fl)}</div><div class="c-green">${rangeTxt(pr)}</div>`;
  return `<div class="${cls}"><div class="name">${name}</div>`
    + `<div>${Math.round(dur)}s</div><div>${grams.toFixed(1)}</div><div>${Math.round(ml)}</div>`
    + tail + '</div>';
}

// data: séries {flow,pressure,temp,weight}. Sempre 2 fases: Preinfusion + Extraction
// (corte fixo em SPLIT_T) + linha Total, como a Streamline. A Extraction já aparece
// pré-feita e zerada enquanto o shot não chega nela (t0 == t1 → dur 0s, valores '—').
export function renderShotTable(data, elapsed) {
  const wrap = document.getElementById('shot-table-rows');
  if (!wrap || !data) return;
  const phases = [
    { name: 'Preinfusion', t0: 0, t1: Math.min(elapsed, SPLIT_T) },
    { name: 'Extraction', t0: SPLIT_T, t1: Math.max(elapsed, SPLIT_T) },
  ];
  let html = '';
  let totMl = 0;
  for (const ph of phases) {
    const fl = segStats(data.flow, ph.t0, ph.t1);
    const pr = segStats(data.pressure, ph.t0, ph.t1);
    const tp = segStats(data.temp, ph.t0, ph.t1);
    const wt = segStats(data.weight, ph.t0, ph.t1);
    const ml = segVolume(data.flow, ph.t0, ph.t1);
    totMl += ml;
    const grams = wt ? Math.max(0, wt.end - wt.start) : 0; // peso ganho na fase
    const started = ph.t1 > ph.t0;                          // fase já começou?
    html += phaseRow(ph.name, ph.t1 - ph.t0, grams, ml, tp ? tp.end : null, fl, pr, false, started);
  }
  const lastW = data.weight && data.weight.length ? data.weight[data.weight.length - 1][1] : 0;
  html += phaseRow('Total', elapsed, lastW, totMl, null, null, null, true);
  wrap.innerHTML = html;
}

// reflete os ajustes na tela inicial (rail)
function refreshRail() {
  const p = state.profile;
  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  set('flush-rail', `${p.flush}s`);
  set('hotwater-rail', `${p.hotWater.ml}ml · ${p.hotWater.temp}°`);
  set('steam-rail', p.steam ? `${p.steamTime}s · ${p.steamFlow}` : 'Off');
}

// ---- indicador de passo do shot (ao vivo) ----
let shotElapsed = 0;
// durante o shot: "N: Nome | 14s ⏩". No M4 usa state{substate}+profileFrame.
export function updateShotPhase(elapsed) {
  shotElapsed = elapsed;
  const el = document.getElementById('shot-phase');
  if (!el) return;
  el.hidden = false;
  el.classList.remove('ended');
  const step = SIM_STEPS.find((s) => elapsed < s.end) || SIM_STEPS[SIM_STEPS.length - 1];
  document.getElementById('sp-step').textContent = `${step.n}: ${step.label}`;
  document.getElementById('sp-time').textContent = `${Math.floor(elapsed)}s`;
}
// no fim do shot: permanece só o tempo final
function endShotPhase() {
  const el = document.getElementById('shot-phase');
  if (!el) return;
  el.hidden = false;
  el.classList.add('ended');
  document.getElementById('sp-time').textContent = `${Math.round(shotElapsed)}s`;
}
function hideShotPhase() {
  const el = document.getElementById('shot-phase');
  if (el) el.hidden = true;
  fitTitle();   // sobrou espaço à direita → reajusta o título
}

// ---- SIM: iniciar/parar simulação de shot (SOMENTE dev/mock) ----
function updateSimBtn() {
  const icon = document.getElementById('sim-icon');
  const label = document.getElementById('sim-label');
  if (!icon || !label) return;
  if (simRunning) {
    icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>';
    label.textContent = 'STOP';
  } else {
    icon.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    label.textContent = 'SIM';
  }
}
function simStart() {
  // dispara o shot; o reset/UI acontece via onShotStarted (evento de início)
  if (sourceRef && sourceRef.kind === 'mock') sourceRef.startShot();
}
function simStop() {
  if (sourceRef && sourceRef.stopShot) sourceRef.stopShot();
  simRunning = false;
  updateSimBtn();
  endShotPhase();
}

// ---- ciclo de vida do shot (dirigido pela fonte: mock via SIM, bridge via estado) ----
export function onShotStarted() {
  const p = profileLib[state.selectedProfileKey];
  if (p) setTitle(p.name, p.type);   // volta o título ao perfil ativo
  updateShotPhase(0);
  fitTitle();                        // o indicador de passo apareceu → reajusta o título
  document.querySelector('.rail')?.classList.add('locked');   // dim/lock dos controles no shot
  if (sourceRef && sourceRef.kind === 'mock') { simRunning = true; updateSimBtn(); }
}
export function onShotEnded() {
  endShotPhase();
  document.querySelector('.rail')?.classList.remove('locked');
  if (sourceRef && sourceRef.kind === 'mock') { simRunning = false; updateSimBtn(); }
}
function simToggle() {
  if (simRunning) simStop(); else simStart();
}

// balança: desconectada → força conexão BT; conectada → tara (zera).
function scaleAction() {
  if (!sourceRef) return;
  if (state.status.scaleConnected) sourceRef.tareScale && sourceRef.tareScale();
  else sourceRef.connectScale && sourceRef.connectScale();
}

export function initUI(chart, source) {
  chartRef = chart;
  sourceRef = source;

  document.addEventListener('click', (e) => {
    const t = e.target;

    // ações nomeadas
    const actionEl = t.closest('[data-action]');
    if (actionEl) {
      const a = actionEl.dataset.action;
      if (a === 'open-coffee') return void openCoffeeLibrary();
      if (a === 'coffee-history') return openCoffeeHistory();
      if (a === 'ch-back') return chBack();
      if (a === 'open-adjust') return openModal('adjust');
      if (a === 'close-modal') return closeModal();
      if (a === 'open-settings') return openAppSettings();
      if (a === 'sleep') return void sleepMachine();
      if (a === 'machine-action') return machineAction();
      if (a === 'scale-action') return scaleAction();
      if (a === 'sim-toggle') return simToggle();
      if (a === 'browse-profiles') return browseProfiles();
      if (a === 'toggle-hidden') return toggleShowHidden();
      if (a === 'shot-older') return shotNav(1);   // ‹ esquerda → mais antigo (2/5…)
      if (a === 'shot-newer') return shotNav(-1);  // › direita → mais recente (1/5)
      if (a === 'edit-shot') return openEditShot();
      if (a === 'editshot-save') return void saveEditShot();
      if (a === 'lib-new-coffee') return libNewCoffee();
      if (a === 'lib-new-grinder') return libNewGrinder();
      if (a === 'lib-save-coffee') return void libSaveCoffee();
      if (a === 'lib-save-grinder') return void libSaveGrinder();
      if (a === 'lib-cancel') return libCancel();
      if (a === 'open-numpad') return openNumpad(actionEl.dataset.field);
      if (a === 'numpad-cancel') return closeModal();
      if (a === 'numpad-confirm') return numpadConfirm();
    }

    // navegador de histórico por café (antes do .pp-card, pois reusa a classe)
    const chC = t.closest('[data-ch-coffee]');
    if (chC) { chSel = +chC.dataset.chCoffee; return renderCoffeeHistory(); }
    const chA = t.closest('[data-ch-apply]');
    if (chA) { const g = chGroups[chSel]; return applyPairing(g && g.shots[+chA.dataset.chApply]); }
    // biblioteca café/moedor
    const beanEl = t.closest('[data-bean]');
    if (beanEl) return selectBean(+beanEl.dataset.bean);
    const grEl = t.closest('[data-grinder]');
    if (grEl) return selectGrinder(+grEl.dataset.grinder);
    // editor de shot: pickers + stepper de grind
    const esPickEl = t.closest('[data-es-pick]');
    if (esPickEl) return esPick(esPickEl.dataset.esPick);
    const esChooseEl = t.closest('[data-es-choose]');
    if (esChooseEl) return esChoose(esChooseEl.dataset.esChoose);
    const esGrindEl = t.closest('[data-es-grind]');
    if (esGrindEl) return esGrind(+esGrindEl.dataset.esGrind);

    // seleção de perfil (barra superior)
    const prof = t.closest('#profiles .profile');
    if (prof) return selectProfile(prof.dataset.profileKey);

    // toggle de visibilidade dentro do card (antes de selecionar)
    const vis = t.closest('.pp-vis');
    if (vis) return toggleProfileVisibility(vis.dataset.vis);

    // card do picker de perfil
    const pp = t.closest('.pp-card');
    if (pp) return pickProfile(pp.dataset.profileKey);

    // card do shot → abre o shot no gráfico (as setas ‹ › já foram tratadas acima)
    const card = t.closest('.shot-card');
    if (card) return void showShot({ id: card.dataset.id, ts: card.dataset.ts });

    // teclas do numpad
    const key = t.closest('.key[data-key]');
    if (key) return numpadKey(key.dataset.key);

    // valores anteriores do numpad
    const prev = t.closest('.prev-chip[data-prev]');
    if (prev) { numpadInput = prev.dataset.prev; return renderNumpadDisplay(); }

    // fechar ao tocar no overlay (fora do card)
    const overlay = t.closest('[data-close-overlay]');
    if (overlay && t === overlay) return closeModal();

    // steppers
    const stepEl = t.closest('[data-step]');
    if (stepEl && STEP[stepEl.dataset.step]) return STEP[stepEl.dataset.step]();

    // toggles
    const tog = t.closest('[data-toggle]');
    if (tog) return toggleSwitch(tog, tog.dataset.toggle);

    // presets do rail
    const preset = t.closest('.preset');
    if (preset) {
      const row = preset.closest('[data-preset-group]');
      if (row) return selectPreset(row.dataset.presetGroup, preset);
    }

    // chips grandes (Adjustments)
    const chip = t.closest('.big-chip');
    if (chip) {
      const grp = chip.closest('[data-chipgroup]');
      if (grp) return selectChip(grp, chip);
    }
  });

  // duplo-clique num favorito → abre o seletor de perfis para aquele slot
  const profilesBar = document.getElementById('profiles');
  if (profilesBar) {
    profilesBar.addEventListener('dblclick', (e) => {
      const prof = e.target.closest('.profile');
      if (prof) openProfilePicker(Number(prof.dataset.slot));
    });
  }

  // SIM: só em dev/mock. Mostra o botão e toca o 1º shot (ciclo via onShotStart/End em main).
  if (sourceRef && sourceRef.kind === 'mock') {
    const simBtn = document.getElementById('sim-btn');
    if (simBtn) simBtn.hidden = false;
    simStart();
  }

  // estado inicial coerente com o store
  applyStatic(state.profile.staticOn);
  refreshRail();
  loadProfiles();   // mock: usa a lib local · bridge: GET /api/v1/profiles
  loadShots();      // mock: shots semente · bridge: GET /api/v1/shots

  // GHC? máquina com botão físico → esconde o botão de máquina da tela (usa o GHC).
  if (sourceRef && sourceRef.getMachineInfo) {
    sourceRef.getMachineInfo().then((info) => {
      machineHasGHC = !!(info && info.GHC);
      updateMachineBtn(state.status.machineState);
    });
  }

  // ajusta o título inicial (e reajusta quando as fontes carregam, p/ medir certo)
  fitTitle();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitTitle);
}

// atualiza a faixa de status a partir do store
export function renderStatus() {
  const s = state.status;
  // null-safe: sem dado real → "—" (nunca inventa valor)
  const uv = (id, v, unit, dig) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = (v == null) ? `—<span class="unit">${unit}</span>` : `${v.toFixed(dig)}<span class="unit">${unit}</span>`;
  };
  uv('mix-value', s.mixTemp, ' °c', 1);
  uv('group-value', s.groupTemp, ' °c', 1);
  uv('tank-value', s.tankMl, ' ml', 0);
  const pctEl = document.getElementById('tank-pct');
  if (pctEl) pctEl.textContent = (s.tankPct == null) ? '—' : `${s.tankPct}%`;
  const fill = document.getElementById('tank-fill');
  if (fill) fill.style.width = `${s.tankPct == null ? 0 : s.tankPct}%`;

  const wEl = document.getElementById('weight-value');
  if (wEl) wEl.innerHTML = `${(s.weightG ?? 0).toFixed(1)}<span class="unit"> g</span>`;
  const wStatus = document.getElementById('weight-status');
  if (wStatus) {
    wStatus.textContent = s.scaleConnected ? 'Connected' : 'Disconnected';
    wStatus.style.color = s.scaleConnected ? 'var(--green)' : 'var(--red)';
  }
  const btn = document.getElementById('scale-btn');
  if (btn) {
    btn.textContent = s.scaleConnected ? 'TARE' : 'CONNECT';
    btn.classList.toggle('tare', s.scaleConnected);
  }
  // badge de estado da máquina (READY/HEATING/SLEEPING/REFILL/ERROR/manutenção…)
  const br = document.getElementById('badge-ready');
  if (br) {
    const [text, cls] = stateBadge(s.machineState, s.connected);
    br.innerHTML = `<span class="dot"></span>${text}`;
    br.className = 'badge ' + cls;
  }
  const bc = document.getElementById('badge-conn');
  if (bc) bc.classList.toggle('off', !s.connected);
  updateMachineBtn(s.machineState);
}
// botão de máquina no header (state-aware, regras do Skins.md do Decaid):
// só inicia shot a partir de 'idle'; de 'sleeping' acorda; durante o shot só para;
// aquecendo/sem água → desabilitado. Escondido quando a máquina tem GHC (botão físico).
let machineHasGHC = false;   // definido no boot via GET /machine/info
const RUNNING_STATES = ['espresso', 'steam', 'hotWater', 'flush', 'steamRinse'];
const ICON_PLAY = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const ICON_STOP = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
function updateMachineBtn(st) {
  const btn = document.getElementById('machine-btn');
  const lbl = document.getElementById('mb-label');
  const ic = document.getElementById('mb-icon');
  if (!btn || !lbl) return;
  if (machineHasGHC) { btn.hidden = true; return; }   // GHC físico → sem botão na tela
  btn.hidden = false;
  let label = 'ESPRESSO', stop = false, disabled = false, icon = ICON_PLAY;
  if (RUNNING_STATES.includes(st)) { label = 'STOP'; stop = true; icon = ICON_STOP; }
  else if (st === 'idle' || st == null) { label = 'ESPRESSO'; }
  else if (st === 'sleeping') { label = 'WAKE'; }
  else if (st === 'needsWater') { label = 'REFILL'; disabled = true; }
  else if (st === 'error' || st === 'fwUpgrade') { label = '—'; disabled = true; }
  else { label = 'HEATING…'; disabled = true; }   // heating/preheating/booting/busy/cleaning…
  btn.className = 'pill-btn machine-btn' + (stop ? ' stop' : '') + (disabled ? ' disabled' : '');
  lbl.textContent = label;
  if (ic) ic.innerHTML = icon;
}
function machineAction() {
  const st = state.status.machineState;
  if (machineHasGHC) return;
  let target = null;
  if (RUNNING_STATES.includes(st)) target = 'idle';       // parar
  else if (st === 'idle' || st == null) target = 'espresso'; // iniciar (só de idle)
  else if (st === 'sleeping') target = 'idle';            // acordar
  else return;                                            // heating/needsWater/error → nada
  if (sourceRef && sourceRef.setMachineState) sourceRef.setMachineState(target);
  else if (target === 'idle' && RUNNING_STATES.includes(st)) simStop();
  else if (target === 'espresso') simStart();
}
// mapeia o estado da máquina para rótulo + classe de cor do badge
const BADGE_MAP = {
  idle: ['READY', 'b-green'], espresso: ['READY', 'b-green'], steam: ['READY', 'b-green'],
  hotWater: ['READY', 'b-green'], flush: ['READY', 'b-green'], skipStep: ['READY', 'b-green'],
  heating: ['HEATING', 'b-amber'], preheating: ['HEATING', 'b-amber'],
  booting: ['STARTING', 'b-amber'], busy: ['BUSY', 'b-amber'],
  sleeping: ['SLEEPING', 'b-grey'], transportMode: ['TRANSPORT', 'b-grey'],
  needsWater: ['REFILL', 'b-yellow'], error: ['ERROR', 'b-red'], fwUpgrade: ['FIRMWARE', 'b-red'],
  cleaning: ['CLEANING', 'b-amber'], descaling: ['DESCALING', 'b-amber'], steamRinse: ['RINSING', 'b-amber'],
  calibration: ['CALIBRATING', 'b-amber'], airPurge: ['AIR PURGE', 'b-amber'], selfTest: ['SELF TEST', 'b-amber'],
};
function stateBadge(st, connected) {
  if (!connected) return ['—', 'b-grey off'];
  return BADGE_MAP[st] || ['READY', 'b-green'];
}
