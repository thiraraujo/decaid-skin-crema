// CREMA v2 · 03 Adjustments · 05/06 Coffee & Grinder (selecionar / criar).
// Modais 1180×728 (inset 36/70) sobre scrim .55.

import { state } from './store.js';
import { openNumpad } from './numpad.js';
import { pushWorkflow } from './workflow.js';
import { THEMES, applyTheme, currentTheme } from './theme.js';
import { STATIC_AXIS } from './store.js';
import { setStaticSeconds } from './ui.js';
import {
  SAVER, addImageFiles, removeImage, setSaverOn, setSaverBrightness, setSaverMinutes, previewSaver,
} from './saver.js';

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

export function showModal(el) {
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
        <div class="adjust__steam-body" id="adj-steam-body">
          <div class="sub">Time</div>
          <div class="opts" data-group="steamTime"></div>
          <div class="sub">Flow</div>
          <div class="opts" data-group="steamFlow"></div>
        </div>
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
    if (!b || b.disabled) return;
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
  // vapor desligado: Time e Flow ficam esmaecidos e inativos
  const steamOff = !state.aux.steam.on;
  adjustEl.querySelector('#adj-steam-body').classList.toggle('is-disabled', steamOff);
  for (const box of adjustEl.querySelectorAll('.opts')) {
    const g = box.dataset.group;
    const spec = PRESETS[g];
    const cur = readGroup(g);
    const known = cur != null;
    const isPreset = known && spec.opts.some((o) => o === cur);
    const custom = known && !isPreset;           // valor manual fora dos presets
    const off = steamOff && (g === 'steamTime' || g === 'steamFlow') ? ' disabled aria-disabled="true"' : '';
    box.innerHTML = spec.opts
      .map((o) => `<button class="opt${o === cur ? ' is-on' : ''}" data-v="${o}" type="button"${off}>${o}${spec.unit}</button>`)
      .join('') +
      `<button class="opt opt--custom${custom ? ' is-on' : ''}" type="button"${off}>
         <svg class="ic" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><use href="#ic-keyboard"/></svg>
         ${custom ? cur + spec.unit : ''}</button>`;
  }
  const on = !!state.aux.steam.on;   // null (ainda desconhecido) conta como desligado
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
const PROCESSES = ['Washed', 'Natural', 'Honey', 'Anaerobic'];

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
        <div class="modal__sub">Tap a recent one to apply it, or create a new one.</div>
      </div>
      <button class="btn-primary" id="pk-done" type="button">Done</button>
    </div>
    <div class="picker__grid">
      <div class="picker__col" data-kind="coffee">
        <div class="row picker__colhead">
          <div class="lb lb--md" data-role="title">Coffee · recent</div>
          <div class="picker__colactions"></div>
        </div>
        <div class="picker__form" hidden></div>
        <div class="picker__scroll"><div class="picker__list"></div><div class="picker__fade"></div></div>
      </div>
      <div class="picker__col" data-kind="grinder">
        <div class="row picker__colhead">
          <div class="lb lb--md" data-role="title">Grinder · recent</div>
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
  col.querySelector('[data-role="title"]').textContent = `${label} · ${creating[kind] ? 'new' : 'recent'}`;

  const actions = col.querySelector('.picker__colactions');
  actions.innerHTML = creating[kind]
    ? `<button class="pill pill--40 tap" data-act="cancel" type="button">Cancel</button>
       <button class="pill pill--40 pill--blue tap" data-act="add" type="button">Add</button>`
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
      ? `<input class="field field--focus" data-k="name" placeholder="Coffee name" value="${esc(draft.coffee.name)}">
         <input class="field" data-k="brand" placeholder="Brand / roaster" value="${esc(draft.coffee.brand)}">
         <div class="picker__proc"><span class="lb">Process</span>${
            PROCESSES.map((p) => `<button class="chip chip--proc${p === draft.coffee.process ? ' is-on' : ''}" data-p="${p}" type="button">${p}</button>`).join('')
         }</div>`
      : `<input class="field field--focus" data-k="name" placeholder="Grinder name" value="${esc(draft.grinder.name)}">`;
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
    pushWorkflow();          // o shot é gravado com o workflow da máquina: sem isto, ficava o café anterior
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
  pushWorkflow();          // café/moedor recém-criado também vai para a máquina
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

// ===================== Cores (tema) =====================
let themesEl = null;

function buildThemes() {
  themesEl = document.createElement('div');
  themesEl.className = 'modal modal--wide themes';
  themesEl.hidden = true;
  themesEl.innerHTML = `
    <div class="modal__head">
      <div class="modal__title">Skin settings</div>
      <button class="btn-primary" id="th-done" type="button">Done</button>
    </div>
    <div class="skinset">
      <div class="skinset__col">
        <div class="row skinset__axis">
          <div>
            <div class="hl">Live chart</div>
            <div class="sub skinset__hint">With STATIC on, the time axis starts at this length and keeps growing if the shot runs longer.</div>
          </div>
          <div class="skinset__stepper">
            <button class="stepper tap" id="th-axis-minus" type="button" aria-label="5 seconds less">−</button>
            <span class="mono skinset__value" id="th-axis-value">—</span>
            <button class="stepper tap" id="th-axis-plus" type="button" aria-label="5 seconds more">+</button>
          </div>
        </div>

        <div class="skinset__saver">
          <div class="row skinset__saver-head">
            <div>
              <div class="hl">Screensaver</div>
              <div class="sub skinset__hint">Shows your images while the machine sleeps. Hold the screen to wake.</div>
            </div>
            <button class="toggle" id="sv-on" type="button" role="switch" aria-label="Screensaver"><i></i></button>
          </div>
          <div class="skinset__saver-body" id="sv-body">
            <div class="skinset__saver-main">
              <div class="skinset__thumbs" id="sv-thumbs"></div>
              <div class="row skinset__saver-actions">
                <button class="btn-ghost btn-ghost--sm" id="sv-add" type="button">Add images</button>
                <span class="sub" id="sv-count"></span>
                <button class="btn-ghost btn-ghost--sm" id="sv-preview" type="button">Preview</button>
              </div>
              <input type="file" id="sv-file" accept="image/*" multiple hidden>
              <div class="row skinset__saver-interval">
                <div class="lb">Change every</div>
                <div class="skinset__stepper">
                  <button class="stepper tap" id="sv-min-minus" type="button" aria-label="1 minute less">−</button>
                  <span class="mono skinset__value" id="sv-min-value">—</span>
                  <button class="stepper tap" id="sv-min-plus" type="button" aria-label="1 minute more">+</button>
                </div>
              </div>
            </div>
            <div class="skinset__bright">
              <div class="lb">Brightness</div>
              <div class="vslider" id="sv-bright" role="slider" aria-label="Screensaver brightness" aria-valuemin="0" aria-valuemax="100">
                <div class="vslider__fill"></div>
                <div class="vslider__knob"></div>
              </div>
              <div class="mono skinset__bright-value" id="sv-bright-value">—</div>
            </div>
          </div>
        </div>
      </div>

      <div class="skinset__col">
        <div class="hl skinset__colors">Colors <span class="sub skinset__colors-sub">Only the colors change — the layout stays the same.</span></div>
        <div class="themes__grid" id="th-grid"></div>
      </div>
    </div>`;
  app().appendChild(themesEl);
  themesEl.querySelector('#th-done').addEventListener('click', () => closeModal(themesEl));
  themesEl.querySelector('#th-axis-minus').addEventListener('click', () => { setStaticSeconds(state.staticTimer - STATIC_AXIS.step); paintAxis(); });
  themesEl.querySelector('#th-axis-plus').addEventListener('click', () => { setStaticSeconds(state.staticTimer + STATIC_AXIS.step); paintAxis(); });
  bindSaverSettings();
  themesEl.querySelector('#th-grid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme-id]');
    if (!b) return;
    applyTheme(b.dataset.themeId);   // aplica na hora: o próprio modal já mostra o tema
    paintThemes();
  });
}

// ---------- proteção de tela ----------
function bindSaverSettings() {
  const q = (s) => themesEl.querySelector(s);
  q('#sv-on').addEventListener('click', () => { setSaverOn(!state.saver.on); paintSaver(); });
  q('#sv-min-minus').addEventListener('click', () => { setSaverMinutes(state.saver.minutes - SAVER.minutes.step); paintSaver(); });
  q('#sv-min-plus').addEventListener('click', () => { setSaverMinutes(state.saver.minutes + SAVER.minutes.step); paintSaver(); });
  q('#sv-preview').addEventListener('click', () => previewSaver());
  q('#sv-add').addEventListener('click', () => q('#sv-file').click());
  q('#sv-file').addEventListener('change', async (e) => {
    const input = e.currentTarget;
    const files = [...(input.files || [])];
    input.value = '';
    if (!files.length) return;
    q('#sv-add').disabled = true;
    const res = await addImageFiles(files, (i, n) => { q('#sv-count').textContent = `Adding ${i} of ${n}…`; paintThumbs(); });
    q('#sv-add').disabled = false;
    paintSaver();
    const notes = [];
    if (res.skipped) notes.push(`${res.skipped} over the ${SAVER.maxImages}-image limit`);
    if (res.failed) notes.push(`${res.failed} could not be read`);
    if (notes.length) q('#sv-count').textContent = `${state.saver.images.length} / ${SAVER.maxImages} · ${notes.join(' · ')}`;
  });
  q('#sv-thumbs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-remove]');
    if (!b) return;
    removeImage(b.dataset.remove);
    paintSaver();
  });

  // barra vertical: arrastar ou tocar; grava ao soltar
  const bar = q('#sv-bright');
  let dragging = false;
  const valueAt = (clientY) => {
    const r = bar.getBoundingClientRect();
    return Math.round((1 - Math.min(1, Math.max(0, (clientY - r.top) / r.height))) * 100);
  };
  const show = (v) => {
    bar.style.setProperty('--v', `${v}%`);
    bar.setAttribute('aria-valuenow', String(v));
    q('#sv-bright-value').textContent = `${v}%`;
  };
  bar.addEventListener('pointerdown', (e) => {
    if (!state.saver.on) return;
    dragging = true;
    try { bar.setPointerCapture(e.pointerId); } catch { /* sem captura */ }
    show(valueAt(e.clientY));
  });
  bar.addEventListener('pointermove', (e) => { if (dragging) show(valueAt(e.clientY)); });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    setSaverBrightness(valueAt(e.clientY));
    show(state.saver.brightness);
  };
  bar.addEventListener('pointerup', end);
  bar.addEventListener('pointercancel', () => { dragging = false; show(state.saver.brightness); });
}

function paintThumbs() {
  const imgs = state.saver.images;
  themesEl.querySelector('#sv-thumbs').innerHTML = imgs.length
    ? imgs.map((i) => `<span class="skinset__thumb" style="background-image:url('${i.thumb}')">
        <button class="skinset__thumb-x" type="button" data-remove="${esc(i.id)}" aria-label="Remove image">×</button>
      </span>`).join('')
    : '<span class="sub skinset__thumbs-empty">No images yet — add some from a folder on the tablet.</span>';
}

function paintSaver() {
  const s = state.saver;
  const q = (sel) => themesEl.querySelector(sel);
  q('#sv-on').classList.toggle('is-on', s.on);
  q('#sv-on').setAttribute('aria-checked', String(s.on));
  q('#sv-body').classList.toggle('is-disabled', !s.on);
  paintThumbs();
  q('#sv-count').textContent = `${s.images.length} / ${SAVER.maxImages}`;
  q('#sv-add').disabled = s.images.length >= SAVER.maxImages;
  q('#sv-preview').disabled = !s.images.length;
  q('#sv-min-value').textContent = `${s.minutes} min`;
  q('#sv-min-minus').disabled = s.minutes <= SAVER.minutes.min;
  q('#sv-min-plus').disabled = s.minutes >= SAVER.minutes.max;
  q('#sv-bright').style.setProperty('--v', `${s.brightness}%`);
  q('#sv-bright').setAttribute('aria-valuenow', String(s.brightness));
  q('#sv-bright-value').textContent = `${s.brightness}%`;
}

function paintAxis() {
  themesEl.querySelector('#th-axis-value').textContent = `${state.staticTimer}s`;
  themesEl.querySelector('#th-axis-minus').disabled = state.staticTimer <= STATIC_AXIS.min;
  themesEl.querySelector('#th-axis-plus').disabled = state.staticTimer >= STATIC_AXIS.max;
}

function paintThemes() {
  const cur = currentTheme();
  themesEl.querySelector('#th-grid').innerHTML = THEMES.map((t) => {
    const w = t.swatch;
    const on = t.id === cur;
    return `<button class="theme-card${on ? ' is-on' : ''}" data-theme-id="${esc(t.id)}" type="button" aria-pressed="${on}">
      <span class="theme-card__preview" style="background:${w.bg}">
        <span class="theme-card__panel" style="background:${w.surface}">
          <span>
            <span class="theme-card__line" style="background:${w.text}"></span>
            <span class="theme-card__line theme-card__line--short" style="background:${w.label}"></span>
          </span>
          <span class="theme-card__dots">
            <i style="background:${w.blue}"></i><i style="background:${w.green}"></i><i style="background:${w.red}"></i><i style="background:${w.amber}"></i>
          </span>
        </span>
      </span>
      <span class="theme-card__name">${esc(t.name)}${on ? '<span class="theme-card__check">✓</span>' : ''}</span>
    </button>`;
  }).join('');
}

export function openThemes() {
  if (!themesEl) buildThemes();
  paintAxis();
  paintSaver();
  paintThemes();
  state.modal = 'themes';
  showModal(themesEl);
}
