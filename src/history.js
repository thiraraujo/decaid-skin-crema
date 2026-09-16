// CREMA v2 · 07/08 Shot history · 09 Coffee history (busca) · 10 Edit shot.

import { state, FIELDS } from './store.js';
import { createChart } from './chart.js';
import { openNumpad } from './numpad.js';
import { bindValueDrag, placeRulerAt } from './drag.js';
import { pushWorkflow } from './workflow.js';

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
// PLANEJADO: o que o workflow pedia no shot (targetDoseWeight → targetYield).
// REALIZADO: o que foi medido (annotations ou o último peso da balança).
const planDoseOf = (s) => s.planDose ?? s.dose ?? null;
const planYieldOf = (s) => s.planYield ?? s.yield ?? null;
const realDoseOf = (s) => s.realDose ?? (s.series && s.series.realDose) ?? null;
const realYieldOf = (s) => s.realYield ?? (s.series && s.series.realYield) ?? null;
const planText = (s) => (planDoseOf(s) != null && planYieldOf(s) != null
  ? `${fmtInt(planDoseOf(s))} → ${fmtInt(planYieldOf(s))}g` : '—');
const actualText = (s) => {
  const d = realDoseOf(s) ?? planDoseOf(s), y = realYieldOf(s);
  return y != null ? `${fmtInt(d)} → ${fmt(y, 1)}g` : '—';
};
const ratioOf = (s) => {
  const d = planDoseOf(s), y = planYieldOf(s);
  return d && y ? `1:${(y / d).toFixed(1)}` : '—';
};

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
        <div class="history__strip-actions">
          <button class="pill pill--blue tap" id="hs-apply" type="button">Apply</button>
          <button class="pill pill--blue tap" id="hs-edit" type="button">
            <svg class="ic" width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><use href="#ic-pencil"/></svg>
            Edit
          </button>
        </div>
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
  screenEl.querySelector('#hs-apply').addEventListener('click', () => applyShot(selected()));
  screenEl.querySelector('#hs-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b) select(b.dataset.id);
  });
  screenEl.querySelector('#hs-filter').addEventListener('click', (e) => {
    if (e.target.closest('[data-clear]')) { state.historyFilter = { coffeeId: null, coffeeLabel: '' }; paint(); }
  });
}

// Filtro por café. Shots reais muitas vezes vêm só com o NOME do café (sem id de
// bean), então o filtro vale pelo rótulo e usa o id apenas quando os dois lados têm.
const filterOn = () => !!state.historyFilter.coffeeLabel;
function visible() {
  const f = state.historyFilter;
  if (!filterOn()) return state.history;
  return state.history.filter((s) => (f.coffeeId && s.coffeeId
    ? s.coffeeId === f.coffeeId
    : (s.coffee || 'No coffee') === f.coffeeLabel));
}

const selected = () => state.history.find((s) => s.id === state.selectedShotId) || visible()[0] || null;

function paint() {
  const list = visible();
  // sem seleção válida na lista visível, o primeiro vira o selecionado — senão o
  // gráfico e a ficha continuavam mostrando o shot anterior ao filtro
  if (!list.some((s) => s.id === state.selectedShotId)) state.selectedShotId = list.length ? list[0].id : null;
  screenEl.querySelector('#hs-count').textContent = String(list.length);

  const f = state.historyFilter;
  const fEl = screenEl.querySelector('#hs-filter');
  fEl.hidden = !filterOn();
  screenEl.querySelector('#hs-search').classList.toggle('is-on', filterOn());
  if (filterOn()) {
    fEl.innerHTML = `<span class="chip chip--filter">${esc(f.coffeeLabel)}<button class="chip__x tap" data-clear="1" type="button">×</button></span>`;
  }

  screenEl.querySelector('#hs-list').innerHTML = list.map((s) => `
    <button class="history__item${s.id === state.selectedShotId ? ' is-on' : ''}" data-id="${esc(s.id)}" type="button">
      <div class="history__item-l1"><span class="history__item-coffee">${esc(s.coffee || 'No coffee')}</span>${s.brand ? `<span class="history__item-brand">${esc(s.brand)}</span>` : ''}</div>
      <div class="history__item-l2">${esc(s.profile || 'Shot')}${s.grinder ? ` · ${esc(s.grinder)} <span class="mono">${fmt(s.grind, 2)}</span>` : ''}</div>
      <div class="mono history__item-l3">${esc(itemMeta(s))}</div>
    </button>`).join('');

  paintDetail(selected());
}

// Uma linha só (sem quebra) com o REALIZADO; sem medida gravada, cai no planejado.
function itemMeta(s) {
  const y = realYieldOf(s), d = realDoseOf(s) ?? planDoseOf(s);
  const weights = y != null
    ? `${fmtInt(d)}→${fmt(y, 1)}g`
    : (planDoseOf(s) != null && planYieldOf(s) != null ? `${fmtInt(planDoseOf(s))}→${fmtInt(planYieldOf(s))}g` : null);
  return [s.when, s.duration != null ? `${Math.round(s.duration)}s` : null, weights, ratioOf(s)]
    .filter(Boolean).join(' · ');
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
    ['Actual', actualText(s)],
    ['Ratio', ratioOf(s)],
    ['Brew', s.brewTemp != null ? `${fmtInt(s.brewTemp)}°` : '—'],
  ].map(([k, v]) => `<div class="history__stat"><span class="lb">${k}</span><span class="mono history__stat-v">${esc(v)}</span></div>`).join('<span class="history__sep"></span>');

  // planejado ao lado do café, com as mesmas cores da home (dose clara, drink âmbar)
  const pd = planDoseOf(s), py = planYieldOf(s);
  const planCell = pd != null && py != null
    ? `<span class="mono history__field-v"><span class="history__plan-dose">${fmtInt(pd)}</span><span class="history__plan-arrow"> → </span><span class="history__plan-drink">${fmtInt(py)}</span><span class="u">g</span></span>`
    : '<span class="mono history__field-v">—</span>';
  strip.innerHTML = `
    <div class="history__field"><span class="lb">Coffee</span><span class="history__field-v">${esc(s.coffee || '—')}${s.brand ? ` <span class="history__field-brand">${esc(s.brand)}</span>` : ''}</span></div>
    <div class="history__field"><span class="lb">Dose → Drink</span>${planCell}</div>
    <div class="history__field"><span class="lb">Grinder</span><span class="history__field-v">${esc(s.grinder || '—')}</span></div>
    <div class="history__field"><span class="lb">Grind</span><span class="mono history__field-v">${fmt(s.grind, 2)}</span></div>`;

  const phases = (s.series && s.series.phases) || [];
  screenEl.querySelector('#hd-phases').innerHTML = phases
    .map((p, i) => `<span class="phase-pill"><b>${p.n ?? i + 1}</b><span>${esc(p.label)}</span></span>`).join('');

  if (s.series) chart.showShot(s.series);
  else loadSeries(s);
}

async function loadSeries(s) {
  if (!source || !source.getShot) return;
  const series = await source.getShot(s.id);
  if (!series) return;
  s.series = series;
  s.duration = s.duration ?? series.duration;
  if (s.brewTemp == null && series.brewTemp != null) s.brewTemp = series.brewTemp;
  if (s.realYield == null && series.realYield != null) s.realYield = series.realYield;
  if (s.realDose == null && series.realDose != null) s.realDose = series.realDose;
  if (state.selectedShotId === s.id) { chart.showShot(series); paintDetail(s); }
}

function select(id) {
  state.selectedShotId = id;
  paint();
}

/**
 * Apply — copia a receita deste shot para a tela principal (café, moedor,
 * moagem, dose e drink), grava no workflow da máquina e volta para a home.
 * O perfil NÃO é aplicado: quem escolhe o perfil é o carrossel.
 */
function applyShot(s) {
  if (!s) return;
  const r = state.recipe;
  if (s.coffee) {
    const bean = state.beans.find((b) => b.name === s.coffee);
    r.coffeeName = s.coffee;
    r.coffeeBrand = s.brand || (bean ? bean.brand : '');
    r.coffeeId = bean ? bean.id : (s.coffeeId || null);
    r.coffeeProcess = bean ? bean.process : '';
  }
  if (s.grinder) {
    const gr = state.grinders.find((g) => g.name === s.grinder);
    r.grinderName = s.grinder;
    r.grinderId = gr ? gr.id : (s.grinderId || null);
  }
  if (s.grind != null) r.grind = s.grind;
  // Apply leva o PLANEJADO do shot (18 → 40 g), não o que a balança marcou no fim
  const pd = planDoseOf(s), py = planYieldOf(s);
  if (pd != null) r.dose = pd;
  if (py != null) r.drink = py;

  pushWorkflow();
  close();
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
        <div class="modal__sub">How you dialled this bean in last time</div>
      </div>
      <button class="modal__close tap" id="ch-close" type="button">×</button>
    </div>
    <div class="coffeehist__selects">
      <label class="select"><span class="lb">Brand</span><select id="ch-brand"></select><span class="select__caret">⇅</span></label>
      <label class="select"><span class="lb">Coffee</span><select id="ch-coffee"></select><span class="select__caret">⇅</span></label>
    </div>
    <div class="lb coffeehist__label">Most recent</div>
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
    const key = s.coffee || 'No coffee';
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
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d} days ago`;
}

function paintSearch() {
  const groups = groupByCoffee();
  const brands = [...new Set(groups.map((g) => g.brand).filter(Boolean))];
  const coffees = [...new Set(groups.map((g) => g.coffee))];
  const opt = (list, cur) => [`<option value="">All</option>`, ...list.map((v) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(v)}</option>`)].join('');
  searchEl.querySelector('#ch-brand').innerHTML = opt(brands, searchFilter.brand);
  searchEl.querySelector('#ch-coffee').innerHTML = opt(coffees, searchFilter.coffee);

  const rows = groups.filter((g) =>
    (!searchFilter.brand || g.brand === searchFilter.brand) &&
    (!searchFilter.coffee || g.coffee === searchFilter.coffee));

  searchEl.querySelector('#ch-list').innerHTML = rows.map((g) => `
    <button class="coffeehist__row row tap" data-coffee="${esc(g.coffee)}" data-id="${esc(g.id)}" type="button">
      <span><span class="coffeehist__name">${esc(g.coffee)}</span>${g.brand ? `<span class="coffeehist__brand">${esc(g.brand)}</span>` : ''}</span>
      <span class="mono coffeehist__meta">${esc(daysAgo(g.last.at))} · ${g.shots} shot${g.shots > 1 ? 's' : ''}${g.last.grinder ? ` · ${esc(g.last.grinder)} ${fmt(g.last.grind, 2)}` : ''}</span>
    </button>`).join('') || `<div class="coffeehist__empty">No shots in history.</div>`;
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
        <div class="editshot__grind-zone" id="ed-grind-zone">
          <div class="editshot__grind-row">
            <button class="stepper tap" id="ed-grind-minus" type="button" aria-label="Finer grind">−</button>
            <div class="editshot__grind-mid">
              <button class="mono editshot__grind tap" id="ed-grind" type="button"></button>
              <div class="ruler" id="ed-ruler"><b></b><i></i></div>
            </div>
            <button class="stepper tap" id="ed-grind-plus" type="button" aria-label="Coarser grind">+</button>
          </div>
        </div>
      </div>
    </div>
    <div class="mono editshot__note">Updates THIS shot in the Decent history and on Visualizer (same shot — it does not create a new one).</div>`;
  app().appendChild(editEl);

  editEl.querySelector('#ed-cancel').addEventListener('click', hideEdit);
  editEl.querySelector('#ed-save').addEventListener('click', saveEdit);
  // mesmas regras da home: bloco inteiro arrasta (0,05 por tique), − / + ao lado e
  // toque no número abre o teclado
  const editField = () => {
    const f = FIELDS.grind;
    const v = Number(editDraft && editDraft.grind);
    if (!Number.isFinite(v) || (v >= f.min && v <= f.max)) return f;
    return { ...f, min: Math.min(f.min, Math.floor(v)), max: Math.max(f.max, Math.ceil(v * 1.5 / 10) * 10) };
  };
  const nudge = (dir) => {
    const cur = Number(editDraft && editDraft.grind);
    if (!Number.isFinite(cur)) return;
    const f = editField();
    editDraft.grind = Math.min(f.max, Math.max(f.min, Number((cur + dir * f.step).toFixed(4))));
    paintEdit();
  };
  editEl.querySelector('#ed-grind-minus').addEventListener('click', () => nudge(-1));
  editEl.querySelector('#ed-grind-plus').addEventListener('click', () => nudge(+1));
  bindValueDrag(editEl.querySelector('#ed-grind-zone'), {
    field: editField,
    get: () => (editDraft ? editDraft.grind : null),
    set: (v) => { editDraft.grind = v; paintEdit(); },
    onTap: (e) => {
      if (!e.target.closest('#ed-grind')) return;
      openNumpad('grind', editDraft.grind, (v) => { editDraft.grind = v; paintEdit(); });
    },
  });
  editEl.querySelector('#ed-coffee').addEventListener('click', () => openChooser('coffee'));
  editEl.querySelector('#ed-grinder').addEventListener('click', () => openChooser('grinder'));
}

// ---------- escolher café / moedor entre os JÁ CADASTRADOS ----------
// Mesma lista que a tela inicial mostra (state.beans / state.grinders, lidos do Decaid):
// aqui é só escolher — cadastrar café ou moedor novo continua na tela Coffee & Grinder.
let chooserEl = null;
let chooserKind = 'coffee';

function buildChooser() {
  chooserEl = document.createElement('div');
  chooserEl.className = 'modal chooser';
  chooserEl.hidden = true;
  chooserEl.innerHTML = `
    <div class="modal__head">
      <div class="modal__title" id="ch2-title">Coffee</div>
      <button class="modal__close tap" id="ch2-close" type="button">×</button>
    </div>
    <div class="picker__list chooser__list" id="ch2-list"></div>`;
  app().appendChild(chooserEl);
  chooserEl.querySelector('#ch2-close').addEventListener('click', hideChooser);
  chooserEl.querySelector('#ch2-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    const items = chooserKind === 'coffee' ? state.beans : state.grinders;
    const it = items.find((x) => String(x.id) === b.dataset.id);
    if (!it) return;
    if (chooserKind === 'coffee') {
      editDraft.coffee = it.name; editDraft.brand = it.brand || ''; editDraft.coffeeId = it.id;
    } else {
      editDraft.grinder = it.name; editDraft.grinderId = it.id;
    }
    paintEdit();
    hideChooser();
  });
}

function openChooser(kind) {
  if (!chooserEl) buildChooser();
  chooserKind = kind;
  const isCoffee = kind === 'coffee';
  const items = isCoffee ? state.beans : state.grinders;
  const curId = isCoffee ? editDraft.coffeeId : editDraft.grinderId;
  const curName = isCoffee ? editDraft.coffee : editDraft.grinder;
  chooserEl.querySelector('#ch2-title').textContent = isCoffee ? 'Coffee' : 'Grinder';
  chooserEl.querySelector('#ch2-list').innerHTML = items.length
    ? items.map((it) => {
      const on = (it.id != null && it.id === curId) || it.name === curName;
      return isCoffee
        ? `<button class="picker__item row${on ? ' is-on' : ''}" data-id="${esc(it.id)}" type="button">
             <span><span class="picker__name">${esc(it.name)}</span><span class="picker__brand">${esc(it.brand || '')}</span></span>
             ${it.process ? `<span class="chip chip--sm">${esc(it.process)}</span>` : ''}
           </button>`
        : `<button class="picker__item picker__item--one${on ? ' is-on' : ''}" data-id="${esc(it.id)}" type="button">${esc(it.name)}</button>`;
    }).join('')
    : `<div class="coffeehist__empty">Nothing registered yet — add it in Coffee &amp; Grinder.</div>`;
  chooserEl.hidden = false;
}

function hideChooser() { if (chooserEl) chooserEl.hidden = true; }

function paintEdit() {
  editEl.querySelector('#ed-coffee').innerHTML = `${esc(editDraft.coffee || '—')}${editDraft.brand ? ` <span class="field__brand">${esc(editDraft.brand)}</span>` : ''}<span class="field__caret">⌄</span>`;
  editEl.querySelector('#ed-grinder').innerHTML = `${esc(editDraft.grinder || '—')}<span class="field__caret">⌄</span>`;
  editEl.querySelector('#ed-grind').textContent = fmt(editDraft.grind, 2);
  editEl.querySelector('#ed-grind-minus').disabled = editDraft.grind == null;
  editEl.querySelector('#ed-grind-plus').disabled = editDraft.grind == null;
  placeRulerAt(editEl.querySelector('#ed-ruler'), editDraft.grind, FIELDS.grind.step);
}

export function openEditShot(shot) {
  if (!shot) return;
  if (!editEl) buildEdit();
  editDraft = {
    id: shot.id, coffee: shot.coffee || '', brand: shot.brand || '', coffeeId: shot.coffeeId || null,
    grinder: shot.grinder || '', grinderId: shot.grinderId || null,
    // a API guarda a moagem como TEXTO (Grinder.settingSmallStep/grinderSetting são
    // strings): sem converter, o − / + concatenava em vez de somar
    grind: Number.isFinite(Number(shot.grind)) && shot.grind !== '' && shot.grind != null ? Number(shot.grind) : null,
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
