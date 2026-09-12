// CREMA v2 · tela de Perfis — favoritos, filtros por categoria, lista e prévia.
// Substitui o modal de favoritos: a máquina pode ter dezenas de perfis (73 no
// Bridge de teste) e a busca linear numa lista só não se sustenta no tablet.
//
// Categoria sai do próprio título do perfil, que o Decaid escreve como
// "Categoria/Nome" ("Pour over basket/V60 22g in, 375g out", "D-Flow / default").

import { state } from './store.js';
import { createChart } from './chart.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MAX_FAVS = 5;

let el = null;
let chart = null;
let hooks = { onUse: null, onChanged: null };
let cat = null;        // categoria ativa (null = todas)
let query = '';
let searching = false;
let previewKey = null;

export function initProfiles({ onUse, onChanged } = {}) {
  hooks = { onUse, onChanged };
}

/** "Pour over basket/V60 22g in, 375g out" → { cat, label } */
export function splitTitle(name) {
  const s = String(name || '');
  const i = s.indexOf('/');
  if (i < 0) return { cat: null, label: s.trim() };
  return { cat: s.slice(0, i).trim(), label: s.slice(i + 1).trim() || s.trim() };
}

function build() {
  el = document.createElement('section');
  el.className = 'screen profiles';
  el.hidden = true;
  el.innerHTML = `
    <header class="profiles__head">
      <button class="round-btn tap" id="pf-back" type="button" aria-label="Back">‹</button>
      <h1 class="profiles__title" id="pf-title">Profiles</h1>
      <label class="profiles__search" id="pf-searchbox" hidden>
        <svg class="ic" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><use href="#ic-search"/></svg>
        <input id="pf-q" type="search" placeholder="Search profiles" autocomplete="off">
      </label>
      <div class="profiles__head-actions">
        <span class="profiles__count" id="pf-count"></span>
        <button class="round-btn tap" id="pf-search" type="button" aria-label="Search">
          <svg class="ic" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><use href="#ic-search"/></svg>
        </button>
      </div>
    </header>

    <div class="profiles__body">
      <aside class="profiles__favs">
        <div class="row profiles__favs-head">
          <span class="lb">Favourites</span>
          <span class="lb lb--muted" id="pf-favcount"></span>
        </div>
        <div class="profiles__favs-list" id="pf-favs"></div>
        <p class="profiles__favs-hint" id="pf-favhint" hidden>Carousel is full: remove a favourite to add another. <b>Use</b> replaces the last one.</p>
      </aside>

      <main class="profiles__main">
        <div class="profiles__cats" id="pf-cats"></div>
        <div class="profiles__panes">
          <div class="profiles__list" id="pf-list"></div>
          <div class="profiles__preview">
            <div class="profiles__plot" id="pf-plot"></div>
            <div class="profiles__detail">
              <div class="row profiles__detail-head">
                <h2 class="profiles__name" id="pf-name">—</h2>
                <div class="profiles__actions">
                  <button class="round-btn round-btn--blue tap" id="pf-fav" type="button" aria-label="Add to favourites">★</button>
                  <button class="round-btn round-btn--green tap" id="pf-use" type="button" aria-label="Use this profile">
                    <svg class="ic" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><use href="#ic-cup"/></svg>
                  </button>
                </div>
              </div>
              <p class="profiles__notes" id="pf-notes"></p>
            </div>
          </div>
        </div>
      </main>
    </div>`;
  document.querySelector('.app').appendChild(el);

  chart = createChart($('pf-plot'), { gap: 96 });

  $('pf-back').addEventListener('click', close);
  $('pf-search').addEventListener('click', toggleSearch);
  $('pf-q').addEventListener('input', (e) => { query = e.target.value; paintList(); });
  $('pf-use').addEventListener('click', () => usePreview());
  $('pf-fav').addEventListener('click', () => toggleFav(previewKey));

  $('pf-cats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    cat = b.dataset.cat || null;
    paintCats();
    paintList();
  });

  $('pf-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-key]');
    if (b) preview(b.dataset.key);
  });

  $('pf-favs').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (act) {
      const key = act.dataset.key;
      if (act.dataset.act === 'remove') toggleFav(key);
      else if (act.dataset.act === 'up') moveFav(key, -1);
      else if (act.dataset.act === 'down') moveFav(key, +1);
      return;
    }
    const card = e.target.closest('[data-key]');
    if (card) preview(card.dataset.key);
  });
}

// ---------- dados ----------
const allProfiles = () => (state.profiles.all.length ? state.profiles.all : state.profiles.favorites);

function categories() {
  const seen = new Map();
  for (const p of allProfiles()) {
    const { cat: c } = splitTitle(p.name);
    if (c && !seen.has(c)) seen.set(c, 0);
    if (c) seen.set(c, seen.get(c) + 1);
  }
  return [...seen.keys()];
}

function filtered() {
  const q = query.trim().toLowerCase();
  return allProfiles().filter((p) => {
    const { cat: c } = splitTitle(p.name);
    if (cat && c !== cat) return false;
    return !q || p.name.toLowerCase().includes(q);
  });
}

const isFav = (key) => state.profiles.favorites.some((f) => f.key === key);
const byKey = (key) => allProfiles().find((p) => p.key === key) || null;

// ---------- pintura ----------
function paintCats() {
  const cats = categories();
  $('pf-cats').innerHTML = [
    `<button class="chip chip--cat${cat === null ? ' is-on' : ''}" data-cat="" type="button">All</button>`,
    ...cats.map((c) => `<button class="chip chip--cat${cat === c ? ' is-on' : ''}" data-cat="${esc(c)}" type="button">${esc(c)}</button>`),
  ].join('');
}

function paintList() {
  const list = filtered();
  const total = allProfiles().length;
  $('pf-count').textContent = list.length === total ? `${total}` : `${list.length}/${total}`;
  $('pf-list').innerHTML = list.map((p) => {
    const { cat: c, label } = splitTitle(p.name);
    return `<button class="profiles__item${p.key === previewKey ? ' is-on' : ''}" data-key="${esc(p.key)}" type="button">
      <span class="profiles__item-name">${esc(label)}${isFav(p.key) ? '<span class="profiles__item-star">★</span>' : ''}</span>
      ${c ? `<span class="profiles__item-cat">${esc(c)}</span>` : ''}
      ${p.hidden ? '<span class="profiles__item-cat">hidden on machine</span>' : ''}
    </button>`;
  }).join('') || '<div class="coffeehist__empty">No profile matches that name.</div>';
}

function paintFavs() {
  const favs = state.profiles.favorites;
  $('pf-favcount').textContent = `${favs.length}/${MAX_FAVS}`;
  $('pf-favs').innerHTML = favs.map((p, i) => {
    const { label } = splitTitle(p.name);
    return `<div class="fav-card${p.key === state.selectedProfileId ? ' is-active' : ''}" data-key="${esc(p.key)}">
      <div class="fav-card__top">
        <span class="fav-card__name">${esc(label)}</span>
        <span class="fav-card__chev">›</span>
      </div>
      <div class="fav-card__bar">
        <span class="fav-card__order">
          <button class="fav-card__move tap" data-act="up" data-key="${esc(p.key)}" type="button" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="fav-card__move tap" data-act="down" data-key="${esc(p.key)}" type="button" ${i === favs.length - 1 ? 'disabled' : ''}>↓</button>
        </span>
        <button class="fav-card__remove tap" data-act="remove" data-key="${esc(p.key)}" type="button">
          <svg class="ic" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><use href="#ic-star-off"/></svg>
          Remove
        </button>
      </div>
    </div>`;
  }).join('') || '<div class="profiles__favs-empty">Star up to 5 profiles to put them on the carousel.</div>';

  const hint = $('pf-favhint');
  if (hint) hint.hidden = favs.length < MAX_FAVS;
}

function paintPreview() {
  const p = byKey(previewKey);
  const { label } = splitTitle(p ? p.name : '');
  $('pf-name').textContent = p ? label : '—';
  $('pf-notes').textContent = (p && p.raw && p.raw.notes) || '';
  const fav = p && isFav(p.key);
  $('pf-fav').classList.toggle('is-on', !!fav);
  $('pf-fav').textContent = fav ? '★' : '☆';
  $('pf-fav').disabled = !p || (!fav && state.profiles.favorites.length >= MAX_FAVS);
  $('pf-use').disabled = !p;
  chart.showPlan(p);
}

// ---------- ações ----------
function preview(key) {
  previewKey = key;
  paintList();
  paintFavs();
  paintPreview();
}

function toggleFav(key) {
  const favs = state.profiles.favorites;
  const i = favs.findIndex((f) => f.key === key);
  if (i >= 0) favs.splice(i, 1);
  else if (favs.length < MAX_FAVS) {
    const p = byKey(key);
    if (p) favs.push(p);
  }
  if (!favs.some((f) => f.key === state.selectedProfileId)) {
    state.selectedProfileId = favs.length ? favs[0].key : state.selectedProfileId;
  }
  paintFavs();
  paintList();
  paintPreview();
  hooks.onChanged && hooks.onChanged();
}

function moveFav(key, dir) {
  const favs = state.profiles.favorites;
  const i = favs.findIndex((f) => f.key === key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= favs.length) return;
  favs.splice(j, 0, favs.splice(i, 1)[0]);
  paintFavs();
  hooks.onChanged && hooks.onChanged();
}

// Usar: entra no carrossel (se ainda não estiver) e vira o perfil ativo da máquina
function usePreview() {
  const p = byKey(previewKey);
  if (!p) return;
  const favs = state.profiles.favorites;
  if (!favs.some((f) => f.key === p.key)) {
    if (favs.length >= MAX_FAVS) favs.pop();
    favs.unshift(p);
  }
  close();
  hooks.onUse && hooks.onUse(p.key);
}

function toggleSearch() {
  searching = !searching;
  $('pf-searchbox').hidden = !searching;
  $('pf-title').hidden = searching;
  $('pf-search').classList.toggle('is-on', searching);
  if (searching) setTimeout(() => $('pf-q').focus(), 0);
  else { query = ''; $('pf-q').value = ''; paintList(); }
}

export function openProfiles() {
  if (!el) build();
  cat = null;
  query = '';
  searching = false;
  $('pf-searchbox').hidden = true;
  $('pf-title').hidden = false;
  $('pf-q').value = '';
  previewKey = state.selectedProfileId || (allProfiles()[0] && allProfiles()[0].key) || null;
  paintCats();
  paintFavs();
  paintList();
  el.hidden = false;
  state.screen = 'profiles';
  paintPreview();
  chart.resize();
  // deixa o perfil ativo à vista na lista
  const sel = $('pf-list').querySelector('.profiles__item.is-on');
  if (sel) sel.scrollIntoView({ block: 'center' });
}

export function close() {
  if (!el) return;
  el.hidden = true;
  state.screen = 'home';
  hooks.onChanged && hooks.onChanged();
}
