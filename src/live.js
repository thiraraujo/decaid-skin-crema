// CREMA v2 · 02 · shot ao vivo — cabeçalho, gráfico e blocos por fase.
// Spec: docs/handoff-shot-live/README.md.
//
// As fases vêm dos steps do perfil ativo; a fase corrente vem de `profileFrame`
// no snapshot da máquina (índice 0-based do step). Sem esse campo, caímos nos
// tempos planejados do perfil.

import { state, ratioText } from './store.js';
import { createChart } from './chart.js';

const $ = (id) => document.getElementById(id);
const host = () => $('live-phases');
const DASH = '—';

let chart = null;
let steps = [];          // [{ n, name, seconds }] do perfil
let phases = [];         // fases já iniciadas, com os agregados
let seq = 0;             // contador da ordem de ocorrência (numeração dos blocos)
let current = -1;
let scrolledTo = -1;

export function initLive() {
  chart = createChart($('live-chart'), { gap: 90, smooth: true });
  return chart;
}

// ---------- formatação ----------
const num = (v, d = 1) => {
  if (v == null || Number.isNaN(v)) return DASH;
  if (Math.abs(v) < 0.05) return '0';
  return Number(v).toFixed(d);
};
const mmss = (sec) => {
  const s = Math.max(0, Math.round(sec || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// "0 → 0.6" · "8.8 → 9.1 → 8.9" (pico só quando destoa das pontas)
function range(a, peak, b) {
  if (a == null) return DASH;
  const parts = [num(a)];
  if (peak != null && peak > Math.max(a, b ?? a) + 0.2) parts.push(num(peak));
  if (b != null && num(b) !== parts[parts.length - 1]) parts.push(num(b));
  return parts.join(' → ');
}
// "88–90" · "90" (inteiros)
function span(min, max) {
  if (min == null) return DASH;
  const a = Math.round(min), b = Math.round(max ?? min);
  return a === b ? String(a) : `${a}–${b}`;
}

// ---------- cabeçalho ----------
export function renderLiveHeader(profile) {
  const r = state.recipe;
  $('lv-profile').textContent = (profile && profile.name) || 'Espresso';
  $('lv-coffee').innerHTML = r.coffeeName
    ? `${esc(r.coffeeName)}${r.coffeeBrand ? ` <span class="brand">${esc(r.coffeeBrand)}</span>` : ''}`
    : DASH;
  $('lv-grinder').innerHTML = r.grinderName
    ? `${esc(r.grinderName)} <span class="grind">${num(r.grind, 2)}</span>`
    : DASH;
  $('lv-dose').innerHTML = `${num(r.dose, 0)} → <span class="drink">${num(r.drink, 0)}</span><span class="u">g</span>`;
  $('lv-ratio').innerHTML = ratioText().replace(':', '<span class="colon">:</span>');
  $('lv-brew').innerHTML = `${num(r.brewTemp, 0)}<span class="u">°C</span>`;
  $('lv-timer').textContent = '0.0';
}

// ---------- ciclo de vida ----------
export function startLive(profile) {
  steps = stepsOf(profile);
  phases = [];
  seq = 0;
  current = -1;
  scrolledTo = -1;
  renderLiveHeader(profile);
  chart.showLive();
  renderPhases();
}

function stepsOf(profile) {
  const raw = profile && profile.raw;
  if (raw && Array.isArray(raw.steps) && raw.steps.length) {
    return raw.steps.map((s, i) => ({ n: i + 1, name: s.name || `Step ${i + 1}`, seconds: s.seconds ?? s.duration ?? 10 }));
  }
  // sem perfil bruto (mock/dev): usa as fases já derivadas do plano
  const ph = (profile && profile.phases) || [];
  return ph.map((p, i) => ({ n: i + 1, name: p.label || `Step ${i + 1}`, seconds: p.end - p.start }));
}

/** índice da fase pelo tempo planejado — usado quando profileFrame não vem */
function phaseByTime(t) {
  let acc = 0;
  for (let i = 0; i < steps.length; i++) {
    acc += steps[i].seconds;
    if (t < acc) return i;
  }
  return steps.length ? steps.length - 1 : -1;
}

/**
 * Uma amostra da máquina. Abre/fecha fases e atualiza os agregados da corrente.
 * @param {{t:number, frame:number|null, pressure:number, flow:number, temp:number, weight:number}} m
 */
export function onLiveSample(m) {
  $('lv-timer').textContent = m.t.toFixed(1);

  let idx = Number.isInteger(m.frame) ? m.frame : phaseByTime(m.t);
  if (idx < 0) idx = 0;
  if (steps.length) idx = Math.min(idx, steps.length - 1);

  if (idx !== current) {
    if (current >= 0 && phases[current]) phases[current].end = m.t;
    current = idx;
    const st = steps[idx] || { n: idx + 1, name: `Step ${idx + 1}` };
    // número = ORDEM em que a fase aconteceu. A DE1 pula steps por condição de saída
    // e steps de uma amostra só não chegam a aparecer no socket: numerar pelo índice
    // do step deixava buracos (1, 3, 4, 5, 7). A Bestpresso numera igual.
    seq += 1;
    phases[idx] = {
      n: seq, name: st.name, start: m.t, end: m.t,
      yieldEnd: m.weight, tempMin: m.temp, tempMax: m.temp,
      pressStart: m.pressure, pressPeak: m.pressure, pressEnd: m.pressure,
      flowStart: m.flow, flowEnd: m.flow,
    };
    if (host() && host().children.length === phases.filter(Boolean).length - 1) appendPhase(phases[idx]);
    else renderPhases();
    paintChartPhases();
    return;
  }

  const p = phases[current];
  if (!p) return;
  p.end = m.t;
  p.yieldEnd = m.weight;
  p.tempMin = Math.min(p.tempMin, m.temp);
  p.tempMax = Math.max(p.tempMax, m.temp);
  p.pressPeak = Math.max(p.pressPeak, m.pressure);
  p.pressEnd = m.pressure;
  p.flowEnd = m.flow;
  updateCurrentCard();
}

export function endLive() {
  if (current >= 0 && phases[current]) renderPhases();
  const host = $('live-phases');
  if (host) scrollToEnd(host);
}

// O rolar suave é cancelado pelo rebuild do DOM dos blocos; rolar no próximo
// frame, sem animação, garante a última fase à vista.
function scrollToEnd(host) {
  requestAnimationFrame(() => { host.scrollLeft = host.scrollWidth; });
}

// fases no gráfico: só as que já aconteceram, com o mesmo número e nome dos blocos
function paintChartPhases() {
  const started = phases.filter(Boolean).sort((a, b) => a.start - b.start);
  chart.setLivePhases(started.map((p, i) => ({ start: i === 0 ? 0 : p.start, label: `${p.n} ${p.name}` })));
}

// ---------- blocos ----------
// Valores como "7.4 → 8.8 → 0" estouram a largura do card: a fonte encolhe conforme o
// texto cresce, sem mexer no tamanho do card.
function vClass(text) {
  const n = String(text).length;
  return n > 14 ? ' phase-card__v--xs' : n > 10 ? ' phase-card__v--sm' : '';
}

function cardHTML(p, isCurrent) {
  const press = range(p.pressStart, p.pressPeak, p.pressEnd);
  const flow = range(p.flowStart, null, p.flowEnd);
  return `
    <div class="phase-card${isCurrent ? ' is-current' : ''}" data-n="${p.n}">
      <div class="row phase-card__head">
        <span class="phase-card__name">
          <span class="phase-card__n">${p.n}</span>
          <span class="phase-card__label">${esc(p.name)}</span>
        </span>
        <span class="phase-card__time" data-role="time">${mmss(p.end - p.start)}</span>
      </div>
      <div class="phase-card__row"><span class="lb">Yield</span><span class="phase-card__v phase-card__v--yield" data-role="yield">${num(p.yieldEnd)}<span class="u"> g</span></span></div>
      <div class="phase-card__row"><span class="lb">Temp</span><span class="phase-card__v phase-card__v--temp" data-role="temp">${span(p.tempMin, p.tempMax)}<span class="u"> °</span></span></div>
      <div class="phase-card__row"><span class="lb">Pressure</span><span class="phase-card__v phase-card__v--press${vClass(press)}" data-role="press">${press}</span></div>
      <div class="phase-card__row"><span class="lb">Flow</span><span class="phase-card__v phase-card__v--flow${vClass(flow)}" data-role="flow">${flow}</span></div>
    </div>`;
}

// Um card por fase que JÁ começou, criado no momento em que ela começa — sem vaga
// pontilhada da "próxima": a DE1 pula steps por condição de saída (o step 2 de um
// perfil pode nunca acontecer), e a vaga anunciava um número que não vinha.
function renderPhases() {
  const host = $('live-phases');
  if (!host) return;
  host.innerHTML = phases.filter(Boolean).map((p, i, all) => cardHTML(p, i === all.length - 1)).join('');
  scrolledTo = current;
  scrollToEnd(host);
}

/** acrescenta só o card da fase que acabou de começar (não refaz os anteriores) */
function appendPhase(p) {
  const host = $('live-phases');
  if (!host) return;
  const prev = host.querySelector('.phase-card.is-current');
  if (prev) prev.classList.remove('is-current');
  const wrap = document.createElement('div');
  wrap.innerHTML = cardHTML(p, true).trim();
  const card = wrap.firstElementChild;
  card.classList.add('is-entering');
  host.appendChild(card);
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.remove('is-entering')));
  scrolledTo = current;
  scrollToEnd(host);
}

// atualização barata da fase corrente a cada amostra (sem refazer o DOM)
function updateCurrentCard() {
  const host = $('live-phases');
  if (!host) return;
  const card = host.querySelector('.phase-card.is-current');
  const p = phases[current];
  if (!card || !p) return;
  const set = (role, html) => {
    const el = card.querySelector(`[data-role="${role}"]`);
    if (el && el.innerHTML !== html) el.innerHTML = html;
  };
  set('time', mmss(p.end - p.start));
  set('yield', `${num(p.yieldEnd)}<span class="u"> g</span>`);
  set('temp', `${span(p.tempMin, p.tempMax)}<span class="u"> °</span>`);
  const press = range(p.pressStart, p.pressPeak, p.pressEnd);
  const flow = range(p.flowStart, null, p.flowEnd);
  set('press', press);
  set('flow', flow);
  const fit = (role, text) => {
    const el = card.querySelector(`[data-role="${role}"]`);
    if (!el) return;
    el.classList.toggle('phase-card__v--sm', String(text).length > 10 && String(text).length <= 14);
    el.classList.toggle('phase-card__v--xs', String(text).length > 14);
  };
  fit('press', press);
  fit('flow', flow);
}
