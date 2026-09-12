// CREMA v2 · 04 · teclado numérico — componente único, tela cheia.
// Usado por Grind/Dose/Drink/Brew e pelos valores manuais dos Adjustments.

import { state, FIELDS } from './store.js';

const PREV_KEY = 'crema.numpad.previous';

let el = null;          // raiz da tela
let ctx = null;         // { field, spec, onConfirm }
let buffer = '';        // dígitos digitados ('' = ainda mostrando o valor inicial)
let initial = '';

function previousFor(field) {
  try {
    const all = JSON.parse(localStorage.getItem(PREV_KEY) || '{}');
    return Array.isArray(all[field]) ? all[field] : [];
  } catch { return []; }
}
function rememberValue(field, value) {
  try {
    const all = JSON.parse(localStorage.getItem(PREV_KEY) || '{}');
    const list = [String(value), ...(all[field] || []).filter((v) => v !== String(value))].slice(0, 3);
    all[field] = list;
    localStorage.setItem(PREV_KEY, JSON.stringify(all));
  } catch { /* kiosk sem storage: segue sem histórico */ }
}

function build() {
  el = document.createElement('div');
  el.className = 'screen numpad';
  el.hidden = true;
  el.innerHTML = `
    <div class="numpad__head">
      <span class="numpad__title" id="np-title"></span>
      <div class="numpad__actions">
        <button class="numpad__cancel tap" id="np-cancel" type="button">CANCEL</button>
        <button class="numpad__confirm tap" id="np-confirm" type="button">CONFIRM</button>
      </div>
    </div>
    <div class="numpad__body">
      <div class="numpad__left">
        <span class="numpad__hint" id="np-hint"></span>
        <div class="numpad__field" id="np-field">
          <span class="mono numpad__value" id="np-value">0</span>
          <span class="mono numpad__unit" id="np-unit"></span>
          <span class="numpad__caret"></span>
        </div>
        <span class="numpad__prev-label">Previous values</span>
        <div class="numpad__prev" id="np-prev"></div>
      </div>
      <div class="numpad__keys" id="np-keys">
        ${['1','2','3','4','5','6','7','8','9','.','0','⌫']
          .map((k) => `<button class="key tap${k === '⌫' ? ' key--back' : ''}" data-k="${k}" type="button">${k}</button>`).join('')}
      </div>
    </div>`;
  document.querySelector('.app').appendChild(el);

  el.querySelector('#np-cancel').addEventListener('click', close);
  el.querySelector('#np-confirm').addEventListener('click', confirm);
  el.querySelector('#np-keys').addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]');
    if (b) press(b.dataset.k);
  });
  el.querySelector('#np-prev').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (b) { buffer = b.dataset.v; paint(); }
  });
}

function press(k) {
  const { spec } = ctx;
  if (k === '⌫') {
    buffer = (buffer || initial).slice(0, -1);
  } else if (k === '.') {
    const cur = buffer || '';
    if (!spec.decimals || cur.includes('.')) return;
    buffer = (cur || '0') + '.';
  } else {
    const cur = buffer;
    const dot = cur.indexOf('.');
    if (dot >= 0 && cur.length - dot - 1 >= spec.decimals) return;   // limita as casas
    buffer = cur === '0' ? k : cur + k;
  }
  paint();
}

const current = () => (buffer === '' ? Number(initial) : Number(buffer));

function valid() {
  const v = current();
  return buffer !== '.' && !Number.isNaN(v) && v >= ctx.spec.min && v <= ctx.spec.max;
}

function paint() {
  el.querySelector('#np-value').textContent = buffer === '' ? initial : buffer;
  const ok = valid();
  el.querySelector('#np-field').classList.toggle('is-invalid', !ok);
  el.querySelector('#np-confirm').disabled = !ok;
  el.querySelector('#np-confirm').classList.toggle('is-disabled', !ok);
}

function confirm() {
  if (!valid()) return;
  const v = Number(current().toFixed(ctx.spec.decimals));
  rememberValue(ctx.field, v);
  const cb = ctx.onConfirm;
  close();
  cb(v);
}

export function close() {
  if (!el) return;
  el.hidden = true;
  state.screen = 'home';
  ctx = null;
}

/**
 * @param {string} field  chave em FIELDS, ou um spec ad-hoc {title,min,max,decimals,unit,hint}
 * @param {number} value  valor atual
 * @param {(v:number)=>void} onConfirm
 */
export function openNumpad(field, value, onConfirm, override) {
  if (!el) build();
  const spec = { ...(FIELDS[field] || {}), ...(override || {}) };
  ctx = { field, spec, onConfirm };
  initial = value == null ? '' : String(Number(value).toFixed(spec.decimals)).replace(/\.?0+$/, (m) => (m.includes('.') ? '' : m));
  if (initial === '') initial = '0';
  buffer = '';

  el.querySelector('#np-title').textContent = (spec.title || field).toUpperCase();
  el.querySelector('#np-hint').textContent = spec.hint || `Input a value between ${spec.min}–${spec.max}${spec.unit || ''}`;
  el.querySelector('#np-unit').textContent = spec.unit || '';
  const prev = previousFor(field);
  el.querySelector('#np-prev').innerHTML = prev
    .map((v) => `<button class="chip chip--prev tap" data-v="${v}" type="button">${v}</button>`).join('');

  el.hidden = false;
  state.screen = 'numpad';
  paint();
}
