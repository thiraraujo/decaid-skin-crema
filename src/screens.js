// CREMA v2 · 03 Adjustments · 05/06 Coffee & Grinder (selecionar / criar).
// Modais 1180×728 (inset 36/70) sobre scrim .55.

import { state } from './store.js';
import { openNumpad } from './numpad.js';
import { pushWorkflow } from './workflow.js';

let scrim = null;
let source = null;
let onApplied = null;      // callback p/ re-render da home

export function initScreens(dataSource, applied) {
  source = dataSource;
  onApplied = applied;
}

function app() { return document.querySelector('.app'); }

function ensureScrim() {
  if (scrim) return scrim;
  scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.hidden = true;
  app().appendChild(scrim);
  return scrim;
}

const openModals = new Set();

function showModal(el) {
  ensureScrim().hidden = false;
  el.hidden = false;
  openModals.add(el);
}
export function closeModal(el) {
  el.hidden = true;
  openModals.delete(el);
  if (!openModals.size) ensureScrim().hidden = true;
  state.modal = null;
}

// ===================== 03 · Adjustments =====================
const PRESETS = {
  flush:      { unit: 's',  opts: [5, 10, 15, 20],        field: { title: 'Flush', min: 1, max: 60, decimals: 0, unit: 's' } },
  waterVol:   { unit: 'ml', opts: [10, 20, 50, 100],      field: { title: 'Volume', min: 5, max: 500, decimals: 0, unit: 'ml' } },
  waterTemp:  { unit: '°',  opts: [80, 85, 90, 95],       field: { title: 'Water temp', min: 40, max: 99, decimals: 0, unit: '°' } },
  steamTime:  { unit: 's',  opts: [25, 30, 40, 45],       field: { title: 'Steam time', min: 5, max: 120, decimals: 0, unit: 's' } },
  steamFlow:  { unit: '',   opts: [0.4, 0.5, 0.6, 0.8],   field: { title: 'Steam flow', min: 0.1, max: 2, decimals: 1, unit: '' } },
};

let adjustEl = null;

function buildAdjust() {
  adjustEl = document.createElement('div');
  adjustEl.className = 'modal modal--wide adjust';
  adjustEl.hidden = true;
  adjustEl.innerHTML = `
    <div class="modal__head">
      <span class="modal__title">Adjustments</span>
      <button class="adjust__x tap" id="adj-close" type="button">×</button>
    </div>
    <div class="adjust__grid">
      <div>
        <div class="hl">
          <svg class="ic" width="22" height="22" viewBox="0 0 20 20" fill="none" stroke-width="1.6" stroke-linecap="round">
            <path d="M4 7h12M10 2v5M6.5 7v2M13.5 7v2" stroke="var(--text-2)"/><path d="M6 12v3M10 12v5M14 12v3" stroke="var(--blue)"/>
          </svg>Flush
        </div>
        <div class="opts" data-group="flush"></div>
        <div class="hl hl--gap">
          <svg class="ic" width="22" height="22" viewBox="0 0 20 20" fill="none" stroke-width="1.6" stroke-linecap="round">
            <use href="#ic-drop" stroke="var(--red)"/><use href="#ic-waves" stroke="var(--label)"/>
          </svg>Hot water
        </div>
        <div class="sub">Volume</div>
        <div class="opts" data-group="waterVol"></div>
        <div class="sub">Temp</div>
        <div class="opts" data-group="waterTemp"></div>
      </div>
      <div>
        <div class="row">
          <div class="hl"><span class="hl__glyph">♨</span>Steam</div>
          <div class="adjust__steam-toggle">
            <span class="lb" id="adj-steam-state">Off</span>
            <button class="toggle" id="adj-steam" type="button" role="switch"><i></i></button>
          </div>
        </div>
        <div class="sub">Time</div>
        <div class="opts" data-group="steamTime"></div>
        <div class="sub">Flow</div>
        <div class="opts" data-group="steamFlow"></div>
      </div>
    </div>
    <button class="btn-primary adjust__done" id="adj-done" type="button">Done</button>`;
  app().appendChild(adjustEl);

  adjustEl.querySelector('#adj-close').addEventListener('click', () => closeModal(adjustEl));
  adjustEl.querySelector('#adj-done').addEventListener('click', () => closeModal(adjustEl));
  adjustEl.querySelector('#adj-steam').addEventListener('click', () => {
    state.aux.steam.on = !state.aux.steam.on;
    pushAux();
    paintAdjust();
    onApplied && onApplied();
  });
  adjustEl.addEventListener('click', (e) => {
    const b = e.target.closest('.opt');
    if (!b) return;
    const group = b.parentElement.dataset.group;
    if (b.classList.contains('opt--custom')) {
      const spec = PRESETS[group].field;
      openNumpad(group, readGroup(group), (v) => { writeGroup(group, v); paintAdjust(); onApplied && onApplied(); }, spec);
      return;
    }
    writeGroup(group, Number(b.dataset.v));
    paintAdjust();
    onApplied && onApplied();
  });
}

function readGroup(g) {
  const a = state.aux;
  return { flush: a.flush.s, waterVol: a.hotWater.ml, waterTemp: a.hotWater.temp, steamTime: a.steam.time, steamFlow: a.steam.flow }[g];
}
function writeGroup(g, v) {
  const a = state.aux;
  if (g === 'flush') a.flush.s = v;
  else if (g === 'waterVol') a.hotWater.ml = v;
  else if (g === 'waterTemp') a.hotWater.temp = v;
  else if (g === 'steamTime') a.steam.time = v;
  else if (g === 'steamFlow') a.steam.flow = v;
  pushAux();
}

function pushAux() { pushWorkflow(); }

function paintAdjust() {
  for (const box of adjustEl.querySelectorAll('.opts')) {
    const g = box.dataset.group;
    const spec = PRESETS[g];
    const cur = readGroup(g);
    const isPreset = spec.opts.some((o) => o === cur);
    box.innerHTML = spec.opts
      .map((o) => `<button class="opt${o === cur ? ' is-on' : ''}" data-v="${o}" type="button">${o}${spec.unit}</button>`)
      .join('') +
      `<button class="opt opt--custom${!isPreset ? ' is-on' : ''}" type="button">
         <svg class="ic" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><use href="#ic-keyboard"/></svg>
         ${isPreset ? '' : cur + spec.unit}</button>`;
  }
  const on = state.aux.steam.on;
  adjustEl.querySelector('#adj-steam').classList.toggle('is-on', on);
  adjustEl.querySelector('#adj-steam-state').textContent = on ? 'On' : 'Off';
  adjustEl.querySelector('#adj-steam').setAttribute('aria-checked', String(on));
}

export function openAdjust() {
  if (!adjustEl) buildAdjust();
  paintAdjust();
  state.modal = 'adjust';
  showModal(adjustEl);
}

// ===================== 05/06 · Coffee & Grinder =====================
const PROCESSES = ['Washed', 'Natural', 'Honey', 'Anaeróbico'];

let coffeeEl = null;
let creating = { coffee: false, grinder: false };
let draft = { coffee: { name: '', brand: '', process: 'Washed' }, grinder: { name: '' } };

function buildCoffee() {
  coffeeEl = document.createElement('div');
  coffeeEl.className = 'modal modal--wide picker';
  coffeeEl.hidden = true;
  coffeeEl.innerHTML = `
    <div class="modal__head">
      <div>
        <div class="modal__title">Coffee &amp; Grinder</div>
        <div class="modal__sub">Toque num recente para aplicar, ou crie um novo.</div>
      </div>
      <button class="btn-primary" id="pk-done" type="button">Done</button>
    </div>
    <div class="picker__grid">
      <div class="picker__col" data-kind="coffee">
        <div class="row picker__colhead">
          <div class="lb lb--md" data-role="title">Coffee · recentes</div>
          <div class="picker__colactions"></div>
        </div>
        <div class="picker__form" hidden></div>
        <div class="picker__scroll"><div class="picker__list"></div><div class="picker__fade"></div></div>
      </div>
      <div class="picker__col" data-kind="grinder">
        <div class="row picker__colhead">
          <div class="lb lb--md" data-role="title">Grinder · recentes</div>
          <div class="picker__colactions"></div>
        </div>
        <div class="picker__form" hidden></div>
        <div class="picker__scroll"><div class="picker__list"></div><div class="picker__fade"></div></div>
      </div>
    </div>`;
  app().appendChild(coffeeEl);
  coffeeEl.querySelector('#pk-done').addEventListener('click', () => closeModal(coffeeEl));
}

function colOf(kind) { return coffeeEl.querySelector(`.picker__col[data-kind="${kind}"]`); }

function paintCoffee() {
  paintCol('coffee');
  paintCol('grinder');
}

function paintCol(kind) {
  const col = colOf(kind);
  const isCoffee = kind === 'coffee';
  const label = isCoffee ? 'Coffee' : 'Grinder';
  col.querySelector('[data-role="title"]').textContent = `${label} · ${creating[kind] ? 'novo' : 'recentes'}`;

  const actions = col.querySelector('.picker__colactions');
  actions.innerHTML = creating[kind]
    ? `<button class="pill pill--40 tap" data-act="cancel" type="button">Cancelar</button>
       <button class="pill pill--40 pill--blue tap" data-act="add" type="button">Adicionar</button>`
    : `<button class="pill pill--40 pill--blue tap" data-act="new" type="button">+ New</button>`;
  actions.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'new') { creating[kind] = true; draft[kind] = isCoffee ? { name: '', brand: '', process: 'Washed' } : { name: '' }; }
    else if (b.dataset.act === 'cancel') creating[kind] = false;
    else if (b.dataset.act === 'add') return commitNew(kind);
    paintCol(kind);
  };

  const form = col.querySelector('.picker__form');
  form.hidden = !creating[kind];
  if (creating[kind]) {
    form.innerHTML = isCoffee
      ? `<input class="field field--focus" data-k="name" placeholder="Nome do café" value="${esc(draft.coffee.name)}">
         <input class="field" data-k="brand" placeholder="Marca / roaster" value="${esc(draft.coffee.brand)}">
         <div class="picker__proc"><span class="lb">Processo</span>${
            PROCESSES.map((p) => `<button class="chip chip--proc${p === draft.coffee.process ? ' is-on' : ''}" data-p="${p}" type="button">${p}</button>`).join('')
         }</div>`
      : `<input class="field field--focus" data-k="name" placeholder="Nome do moedor" value="${esc(draft.grinder.name)}">`;
    form.oninput = (e) => { const k = e.target.dataset.k; if (k) draft[kind][k] = e.target.value; };
    form.onclick = (e) => {
      const b = e.target.closest('[data-p]');
      if (!b) return;
      draft.coffee.process = b.dataset.p;
      paintCol(kind);
    };
    const first = form.querySelector('.field--focus');
    if (first) setTimeout(() => first.focus(), 0);
  }

  const list = col.querySelector('.picker__list');
  const items = isCoffee ? state.beans : state.grinders;
  const selId = isCoffee ? state.recipe.coffeeId : state.recipe.grinderId;
  list.innerHTML = items.map((it) => {
    const on = it.id != null && it.id === selId;
    return isCoffee
      ? `<button class="picker__item row${on ? ' is-on' : ''}" data-id="${esc(it.id)}" type="button">
           <span><span class="picker__name">${esc(it.name)}</span><span class="picker__brand">${esc(it.brand || '')}</span></span>
           ${it.process ? `<span class="chip chip--sm">${esc(it.process)}</span>` : ''}
         </button>`
      : `<button class="picker__item picker__item--one${on ? ' is-on' : ''}" data-id="${esc(it.id)}" type="button">${esc(it.name)}</button>`;
  }).join('');
  list.classList.toggle('is-dimmed', creating[kind]);
  list.onclick = (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    const it = items.find((x) => String(x.id) === b.dataset.id);
    if (!it) return;
    if (isCoffee) Object.assign(state.recipe, { coffeeId: it.id, coffeeName: it.name, coffeeBrand: it.brand || '', coffeeProcess: it.process || '' });
    else Object.assign(state.recipe, { grinderId: it.id, grinderName: it.name });
    paintCol(kind);
    onApplied && onApplied();
  };
}

async function commitNew(kind) {
  const d = draft[kind];
  if (!d.name.trim()) return;
  if (kind === 'coffee') {
    const rec = source && source.addBean
      ? await source.addBean({ name: d.name.trim(), roaster: d.brand.trim(), process: d.process })
      : null;
    const bean = { id: (rec && rec.id) || `local-${Date.now()}`, name: d.name.trim(), brand: d.brand.trim(), process: d.process };
    state.beans.unshift(bean);
    Object.assign(state.recipe, { coffeeId: bean.id, coffeeName: bean.name, coffeeBrand: bean.brand, coffeeProcess: bean.process });
  } else {
    const rec = source && source.addGrinder ? await source.addGrinder({ model: d.name.trim() }) : null;
    const g = { id: (rec && rec.id) || `local-${Date.now()}`, name: d.name.trim() };
    state.grinders.unshift(g);
    Object.assign(state.recipe, { grinderId: g.id, grinderName: g.name });
  }
  creating[kind] = false;
  paintCol(kind);
  onApplied && onApplied();
}

export function openCoffee(focus) {
  if (!coffeeEl) buildCoffee();
  creating = { coffee: false, grinder: false };
  paintCoffee();
  state.modal = 'coffee';
  showModal(coffeeEl);
  if (focus === 'grinder') colOf('grinder').scrollIntoView({ block: 'nearest' });
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export { esc };
export { openHistory } from './history.js';

// ===================== Gerenciador de favoritos (✎ favoritos) =====================
// Até 5 perfis na barra; ⭐ marca/desmarca, ↑↓ reordena. Sem equivalente nas telas
// finais do handoff — segue o mesmo modal largo dos demais.
let favEl = null;

function buildFavorites() {
  favEl = document.createElement('div');
  favEl.className = 'modal modal--wide picker';
  favEl.hidden = true;
  favEl.innerHTML = `
    <div class="modal__head">
      <div>
        <div class="modal__title">Favoritos</div>
        <div class="modal__sub">Até 5 perfis no carrossel. Toque na estrela para incluir; use ↑ ↓ para ordenar.</div>
      </div>
      <button class="btn-primary" id="fv-done" type="button">Done</button>
    </div>
    <div class="fav__grid">
      <div class="fav__col">
        <div class="lb lb--md">No carrossel</div>
        <div class="picker__scroll"><div class="picker__list" id="fv-selected"></div></div>
      </div>
      <div class="fav__col">
        <div class="lb lb--md">Todos os perfis</div>
        <div class="picker__scroll"><div class="picker__list" id="fv-all"></div><div class="picker__fade"></div></div>
      </div>
    </div>`;
  app().appendChild(favEl);
  favEl.querySelector('#fv-done').addEventListener('click', () => closeModal(favEl));
  favEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const key = b.dataset.key;
    const favs = state.profiles.favorites;
    const i = favs.findIndex((p) => p.key === key);
    if (b.dataset.act === 'toggle') {
      if (i >= 0) favs.splice(i, 1);
      else if (favs.length < 5) {
        const p = state.profiles.all.find((x) => x.key === key);
        if (p) favs.push(p);
      }
    } else if (b.dataset.act === 'up' && i > 0) {
      favs.splice(i - 1, 0, favs.splice(i, 1)[0]);
    } else if (b.dataset.act === 'down' && i >= 0 && i < favs.length - 1) {
      favs.splice(i + 1, 0, favs.splice(i, 1)[0]);
    }
    if (!favs.some((p) => p.key === state.selectedProfileId)) {
      state.selectedProfileId = favs.length ? favs[0].key : null;
    }
    paintFavorites();
    onApplied && onApplied();
  });
}

function paintFavorites() {
  const favs = state.profiles.favorites;
  favEl.querySelector('#fv-selected').innerHTML = favs.map((p, i) => `
    <div class="picker__item row is-on">
      <span class="picker__name">${esc(p.name)}</span>
      <span class="fav__actions">
        <button class="stepper stepper--sm tap" data-act="up" data-key="${esc(p.key)}" type="button"${i === 0 ? ' disabled' : ''}>↑</button>
        <button class="stepper stepper--sm tap" data-act="down" data-key="${esc(p.key)}" type="button"${i === favs.length - 1 ? ' disabled' : ''}>↓</button>
        <button class="fav__star is-on tap" data-act="toggle" data-key="${esc(p.key)}" type="button">★</button>
      </span>
    </div>`).join('') || `<div class="coffeehist__empty">Nenhum favorito.</div>`;

  const full = state.profiles.all.length ? state.profiles.all : favs;
  favEl.querySelector('#fv-all').innerHTML = full.map((p) => {
    const on = favs.some((f) => f.key === p.key);
    return `<div class="picker__item row${on ? ' is-on' : ''}">
      <span><span class="picker__name">${esc(p.name)}</span>${p.hidden ? '<span class="picker__brand">oculto na máquina</span>' : ''}</span>
      <button class="fav__star${on ? ' is-on' : ''} tap" data-act="toggle" data-key="${esc(p.key)}" type="button">${on ? '★' : '☆'}</button>
    </div>`;
  }).join('');
}

export function openFavorites() {
  if (!favEl) buildFavorites();
  paintFavorites();
  state.modal = 'favorites';
  showModal(favEl);
}
