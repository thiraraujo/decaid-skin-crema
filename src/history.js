// CREMA v2 · 07/08 Shot history · 09 Coffee history (busca) · 10 Edit shot.

import { state, FIELDS } from './store.js';
import { createChart } from './chart.js';
import { openNumpad } from './numpad.js';

let source = null;
let onApplied = null;
let screenEl = null;
let chart = null;

export function initHistory(dataSource, applied) {
  source = dataSource;
  onApplied = applied;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = () => document.querySelector('.app');
const fmt = (v, d = 1) => (v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toFixed(d));
const fmtInt = (v) => (v == null || Number.isNaN(Number(v)) ? '—' : String(Math.round(v)));
const ratioOf = (s) => (s.dose && s.yield ? `1:${(s.yield / s.dose).toFixed(1)}` : '—');

// ===================== 07/08 · tela cheia =====================
function build() {
  screenEl = document.createElement('div');
  screenEl.className = 'screen history';
  screenEl.hidden = true;
  screenEl.innerHTML = `
    <aside class="history__side">
      <div class="history__sidehead">
        <div class="row">
          <span class="history__title">Shot history</span>
          <span class="chip chip--sm" id="hs-count">0</span>
        </div>
        <button class="history__search tap" id="hs-search" type="button">
          <svg class="ic" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><use href="#ic-search"/></svg>
        </button>
      </div>
      <div class="history__filter" id="hs-filter" hidden></div>
      <div class="history__list" id="hs-list"></div>
    </aside>
    <section class="history__main">
      <div class="row history__head">
        <div class="history__headline">
          <div class="history__profile" id="hd-profile">—</div>
          <div class="mono history__date" id="hd-date">—</div>
        </div>
        <div class="history__stats" id="hd-stats"></div>
        <button class="btn-ghost tap" id="hs-close" type="button">Close</button>
      </div>
      <div class="row history__strip">
        <div class="history__strip-fields" id="hd-strip"></div>
        <button class="pill pill--blue tap" id="hs-edit" type="button">
          <svg class="ic" width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><use href="#ic-pencil"/></svg>
          Edit
        </button>
      </div>
      <div class="card history__chart">
        <div class="row history__chart-head">
          <div class="history__phases" id="hd-phases"></div>
          <div class="legend">
            <span><i style="background:var(--blue)"></i>Flow</span>
            <span><i style="background:var(--green)"></i>Pressure</span>
            <span><i style="background:var(--red)"></i>Temp</span>
            <span><i style="background:var(--amber)"></i>Weight</span>
            <span><i class="dashed" style="color:var(--label)"></i>Target</span>
          </div>
        </div>
        <div class="history__plot" id="hd-plot"></div>
      </div>
    </section>`;
  app().appendChild(screenEl);

  chart = createChart(screenEl.querySelector('#hd-plot'), { gap: 90 });

  screenEl.querySelector('#hs-close').addEventListener('click', close);
  screenEl.querySelector('#hs-search').addEventListener('click', openCoffeeSearch);
  screenEl.querySelector('#hs-edit').addEventListener('click', () => openEditShot(selected()));
  screenEl.querySelector('#hs-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b) select(b.dataset.id);
  });
  screenEl.querySelector('#hs-filter').addEventListener('click', (e) => {
    if (e.target.closest('[data-clear]')) { state.historyFilter = { coffeeId: null, coffeeLabel: '' }; paint(); }
  });
}

function visible() {
  const f = state.historyFilter;
  if (!f.coffeeId) return state.history;
  return state.history.filter((s) => s.coffeeId === f.coffeeId || s.coffee === f.coffeeLabel);
}

const selected = () => state.history.find((s) => s.id === state.selectedShotId) || visible()[0] || null;

function paint() {
  const list = visible();
  screenEl.querySelector('#hs-count').textContent = String(list.length);

  const f = state.historyFilter;
  const fEl = screenEl.querySelector('#hs-filter');
  fEl.hidden = !f.coffeeId;
  screenEl.querySelector('#hs-search').classList.toggle('is-on', !!f.coffeeId);
  if (f.coffeeId) {
    fEl.innerHTML = `<span class="chip chip--filter">${esc(f.coffeeLabel)}<button class="chip__x tap" data-clear="1" type="button">×</button></span>`;
  }

  screenEl.querySelector('#hs-list').innerHTML = list.map((s) => `
    <button class="history__item${s.id === state.selectedShotId ? ' is-on' : ''}" data-id="${esc(s.id)}" type="button">
      <div class="history__item-l1"><span class="history__item-coffee">${esc(s.coffee || 'Sem café')}</span>${s.brand ? `<span class="history__item-brand">${esc(s.brand)}</span>` : ''}</div>
      <div class="history__item-l2">${esc(s.profile || 'Shot')}${s.grinder ? ` · ${esc(s.grinder)} <span class="mono">${fmt(s.grind, 2)}</span>` : ''}</div>
      <div class="mono history__item-l3">${esc(itemMeta(s))}</div>
    </button>`).join('');

  paintDetail(selected());
}

function itemMeta(s) {
  return [s.when, s.duration != null ? `${Math.round(s.duration)}s` : null,
    (s.dose != null && s.yield != null) ? `${fmtInt(s.dose)}→${fmtInt(s.yield)}g` : null,
    ratioOf(s)].filter(Boolean).join(' · ');
}

function paintDetail(s) {
  const stats = screenEl.querySelector('#hd-stats');
  const strip = screenEl.querySelector('#hd-strip');
  if (!s) {
    screenEl.querySelector('#hd-profile').textContent = '—';
    screenEl.querySelector('#hd-date').textContent = '';
    stats.innerHTML = ''; strip.innerHTML = '';
    screenEl.querySelector('#hd-phases').innerHTML = '';
    chart.showShot(null);
    return;
  }
  screenEl.querySelector('#hd-profile').textContent = s.profile || 'Shot';
  screenEl.querySelector('#hd-date').textContent = s.when || '';

  stats.innerHTML = [
    ['Duration', s.duration != null ? `${Math.round(s.duration)}s` : '—'],
    ['Dose → Drink', (s.dose != null && s.yield != null) ? `${fmtInt(s.dose)} → ${fmtInt(s.yield)}g` : '—'],
    ['Ratio', ratioOf(s)],
    ['Brew', s.brewTemp != null ? `${fmtInt(s.brewTemp)}°` : '—'],
  ].map(([k, v]) => `<div class="history__stat"><span class="lb">${k}</span><span class="mono history__stat-v">${esc(v)}</span></div>`).join('<span class="history__sep"></span>');

  strip.innerHTML = `
    <div class="history__field"><span class="lb">Coffee</span><span class="history__field-v">${esc(s.coffee || '—')}${s.brand ? ` <span class="history__field-brand">${esc(s.brand)}</span>` : ''}</span></div>
    <div class="history__field"><span class="lb">Grinder</span><span class="history__field-v">${esc(s.grinder || '—')}</span></div>
    <div class="history__field"><span class="lb">Grind</span><span class="mono history__field-v">${fmt(s.grind, 2)}</span></div>`;

  const phases = (s.series && s.series.phases) || [];
  screenEl.querySelector('#hd-phases').innerHTML = phases
    .map((p, i) => `<span class="phase-pill"><b>${i + 1}</b>${esc(p.label)}</span>`).join('');

  if (s.series) chart.showShot(s.series);
  else loadSeries(s);
}

async function loadSeries(s) {
  if (!source || !source.getShot) return;
  const series = await source.getShot(s.id);
  if (!series) return;
  s.series = series;
  s.duration = s.duration ?? series.duration;
  if (state.selectedShotId === s.id) { chart.showShot(series); paintDetail(s); }
}

function select(id) {
  state.selectedShotId = id;
  paint();
}

export function openHistory(shot) {
  if (!screenEl) build();
  state.selectedShotId = (shot && shot.id) || (state.history[0] && state.history[0].id) || null;
  state.screen = 'history';
  screenEl.hidden = false;
  paint();
  chart.resize();
}

export function close() {
  if (!screenEl) return;
  screenEl.hidden = true;
  state.screen = 'home';
  onApplied && onApplied();
}

// ===================== 09 · Coffee history (busca) =====================
let searchEl = null;
let searchFilter = { brand: '', coffee: '' };

function buildSearch() {
  searchEl = document.createElement('div');
  searchEl.className = 'modal coffeehist';
  searchEl.hidden = true;
  searchEl.innerHTML = `
    <div class="modal__head">
      <div>
        <div class="modal__title">Coffee history</div>
        <div class="modal__sub">Como você acertou esse grão da última vez</div>
      </div>
      <button class="modal__close tap" id="ch-close" type="button">×</button>
    </div>
    <div class="coffeehist__selects">
      <label class="select"><span class="lb">Brand</span><select id="ch-brand"></select><span class="select__caret">⇅</span></label>
      <label class="select"><span class="lb">Coffee</span><select id="ch-coffee"></select><span class="select__caret">⇅</span></label>
    </div>
    <div class="lb coffeehist__label">Mais recentes</div>
    <div class="coffeehist__list" id="ch-list"></div>`;
  app().appendChild(searchEl);

  searchEl.querySelector('#ch-close').addEventListener('click', () => hideSearch());
  searchEl.querySelector('#ch-brand').addEventListener('change', (e) => { searchFilter.brand = e.target.value; paintSearch(); });
  searchEl.querySelector('#ch-coffee').addEventListener('change', (e) => { searchFilter.coffee = e.target.value; paintSearch(); });
  searchEl.querySelector('#ch-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-coffee]');
    if (!b) return;
    state.historyFilter = { coffeeId: b.dataset.id || null, coffeeLabel: b.dataset.coffee };
    hideSearch();
    state.selectedShotId = null;
    paint();
  });
}

// agrupa o histórico por café: nº de shots, quando foi o último e a última combinação
function groupByCoffee() {
  const map = new Map();
  for (const s of state.history) {
    const key = s.coffee || 'Sem café';
    if (!map.has(key)) map.set(key, { coffee: key, brand: s.brand || '', id: s.coffeeId || '', shots: 0, last: s, });
    const g = map.get(key);
    g.shots++;
    if (!g.last.at || (s.at && s.at > g.last.at)) g.last = s;
  }
  return [...map.values()].sort((a, b) => (b.last.at || 0) - (a.last.at || 0));
}

function daysAgo(at) {
  if (!at) return '';
  const d = Math.floor((Date.now() - at) / 86400000);
  if (d <= 0) return 'hoje';
  if (d === 1) return 'ontem';
  return `há ${d} dias`;
}

function paintSearch() {
  const groups = groupByCoffee();
  const brands = [...new Set(groups.map((g) => g.brand).filter(Boolean))];
  const coffees = [...new Set(groups.map((g) => g.coffee))];
  const opt = (list, cur) => [`<option value="">Todos</option>`, ...list.map((v) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(v)}</option>`)].join('');
  searchEl.querySelector('#ch-brand').innerHTML = opt(brands, searchFilter.brand);
  searchEl.querySelector('#ch-coffee').innerHTML = opt(coffees, searchFilter.coffee);

  const rows = groups.filter((g) =>
    (!searchFilter.brand || g.brand === searchFilter.brand) &&
    (!searchFilter.coffee || g.coffee === searchFilter.coffee));

  searchEl.querySelector('#ch-list').innerHTML = rows.map((g) => `
    <button class="coffeehist__row row tap" data-coffee="${esc(g.coffee)}" data-id="${esc(g.id)}" type="button">
      <span><span class="coffeehist__name">${esc(g.coffee)}</span>${g.brand ? `<span class="coffeehist__brand">${esc(g.brand)}</span>` : ''}</span>
      <span class="mono coffeehist__meta">${esc(daysAgo(g.last.at))} · ${g.shots} shot${g.shots > 1 ? 's' : ''}${g.last.grinder ? ` · ${esc(g.last.grinder)} ${fmt(g.last.grind, 2)}` : ''}</span>
    </button>`).join('') || `<div class="coffeehist__empty">Sem shots no histórico.</div>`;
}

function openCoffeeSearch() {
  if (!searchEl) buildSearch();
  searchFilter = { brand: '', coffee: '' };
  paintSearch();
  searchEl.hidden = false;
  ensureScrimLocal(true);
}

function hideSearch() {
  searchEl.hidden = true;
  ensureScrimLocal(false);
}

// scrim próprio (a tela de histórico não usa o scrim dos modais da home)
let localScrim = null;
function ensureScrimLocal(show) {
  if (!localScrim) {
    localScrim = document.createElement('div');
    localScrim.className = 'scrim scrim--history';
    localScrim.hidden = true;
    app().appendChild(localScrim);
  }
  localScrim.hidden = !show;
  if (show) screenEl.appendChild(localScrim);
}

// ===================== 10 · Edit shot =====================
let editEl = null;
let editDraft = null;

function buildEdit() {
  editEl = document.createElement('div');
  editEl.className = 'modal editshot';
  editEl.hidden = true;
  editEl.innerHTML = `
    <div class="modal__head">
      <div>
        <div class="modal__title">Edit shot</div>
        <div class="modal__sub" id="ed-sub"></div>
      </div>
      <div class="editshot__actions">
        <button class="pill tap" id="ed-cancel" type="button">Cancel</button>
        <button class="pill pill--blue tap" id="ed-save" type="button">Save and update</button>
      </div>
    </div>
    <div class="editshot__body">
      <label class="field-row"><span class="lb">Coffee</span><button class="field field--select tap" id="ed-coffee" type="button"></button></label>
      <label class="field-row"><span class="lb">Grinder</span><button class="field field--select tap" id="ed-grinder" type="button"></button></label>
      <div class="field-row">
        <span class="lb">Grind size</span>
        <button class="mono editshot__grind tap" id="ed-grind" type="button"></button>
        <div class="ruler" id="ed-ruler" style="width:100%"><b></b><i></i></div>
      </div>
    </div>
    <div class="mono editshot__note">Atualiza ESTE shot no histórico da Decent e no Visualizer (mesmo shot — não cria um novo).</div>`;
  app().appendChild(editEl);

  editEl.querySelector('#ed-cancel').addEventListener('click', hideEdit);
  editEl.querySelector('#ed-save').addEventListener('click', saveEdit);
  editEl.querySelector('#ed-grind').addEventListener('click', () => {
    openNumpad('grind', editDraft.grind, (v) => { editDraft.grind = v; paintEdit(); });
  });
  editEl.querySelector('#ed-coffee').addEventListener('click', () => cycle('coffee'));
  editEl.querySelector('#ed-grinder').addEventListener('click', () => cycle('grinder'));
}

// sem teclado físico no kiosk: o select percorre a biblioteca já cadastrada
function cycle(kind) {
  const list = kind === 'coffee' ? state.beans : state.grinders;
  if (!list.length) return;
  const cur = kind === 'coffee' ? editDraft.coffee : editDraft.grinder;
  const i = list.findIndex((x) => x.name === cur);
  const next = list[(i + 1) % list.length];
  if (kind === 'coffee') { editDraft.coffee = next.name; editDraft.brand = next.brand || ''; editDraft.coffeeId = next.id; }
  else { editDraft.grinder = next.name; editDraft.grinderId = next.id; }
  paintEdit();
}

function paintEdit() {
  editEl.querySelector('#ed-coffee').innerHTML = `${esc(editDraft.coffee || '—')}${editDraft.brand ? ` <span class="field__brand">${esc(editDraft.brand)}</span>` : ''}<span class="field__caret">⌄</span>`;
  editEl.querySelector('#ed-grinder').innerHTML = `${esc(editDraft.grinder || '—')}<span class="field__caret">⌄</span>`;
  editEl.querySelector('#ed-grind').textContent = fmt(editDraft.grind, 2);
  const f = FIELDS.grind;
  const off = (editDraft.grind / f.step) * 7;
  const r = editEl.querySelector('#ed-ruler');
  r.style.backgroundPositionX = `${-off % 35}px, ${-off % 35}px`;
}

export function openEditShot(shot) {
  if (!shot) return;
  if (!editEl) buildEdit();
  editDraft = {
    id: shot.id, coffee: shot.coffee || '', brand: shot.brand || '', coffeeId: shot.coffeeId || null,
    grinder: shot.grinder || '', grinderId: shot.grinderId || null, grind: shot.grind ?? 0,
  };
  editEl.querySelector('#ed-sub').textContent = [shot.when, shot.profile].filter(Boolean).join(' · ');
  paintEdit();
  editEl.hidden = false;
  ensureScrimLocal(true);
}

function hideEdit() {
  editEl.hidden = true;
  ensureScrimLocal(false);
}

async function saveEdit() {
  const s = state.history.find((x) => x.id === editDraft.id);
  if (s) {
    Object.assign(s, {
      coffee: editDraft.coffee, brand: editDraft.brand, coffeeId: editDraft.coffeeId,
      grinder: editDraft.grinder, grinderId: editDraft.grinderId, grind: editDraft.grind,
    });
  }
  if (source && source.updateShotAnnotations) {
    await source.updateShotAnnotations(editDraft.id, {
      extras: {
        coffeeName: editDraft.coffee, coffeeRoaster: editDraft.brand,
        grinderModel: editDraft.grinder, grinderSetting: String(editDraft.grind),
      },
    });
  }
  hideEdit();
  paint();
  onApplied && onApplied();
}
