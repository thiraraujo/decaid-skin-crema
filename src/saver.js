// CREMA v2 · proteção de tela do SLEEP — imagens escolhidas pelo usuário.
//
// A skin não tem acesso a pastas do tablet: o seletor de arquivos do Android (aberto
// pelo <input type="file" multiple> da WebView do Decaid) entrega os arquivos só no
// momento da escolha. Por isso cada imagem é reduzida à resolução física da tela e
// GUARDADA NO APP (key-value store, namespace próprio), junto das preferências.
//
//   crema/saver            { on, brightness, minutes, images:[{ id, thumb }] }
//   crema-saver/<id>       data URL JPEG da imagem (limite do app: 1 MiB por item)
//
// Enquanto a máquina dorme: imagem em tela cheia, brilho do tablet no valor escolhido
// (PUT /api/v1/display/brightness), troca seca a cada N minutos. Toque curto mostra
// a dica; toque longo acorda a máquina. Ao sair, o brilho anterior é devolvido.

import { state } from './store.js';
import { resolveHost } from './api.js';
import { savePref } from './prefs.js';
import { wakeMachine, getDisplay, setBrightness } from './host.js';

export const SAVER = {
  maxImages: 20,
  minutes: { default: 5, step: 1, min: 1, max: 60 },
  brightnessDefault: 30,
  holdMs: 1000,
  hintMs: 2000,
};

const NS = 'crema-saver';
const MAX_ITEM_CHARS = 1000000;   // bounded_request_body.dart: 1 MiB por POST (com as aspas do JSON)
const THUMB_W = 160, THUMB_H = 100;

const $ = (id) => document.getElementById(id);
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

export function normalizeSaver(v) {
  const o = v && typeof v === 'object' ? v : {};
  return {
    on: o.on === true,
    brightness: Number.isFinite(o.brightness) ? clamp(Math.round(o.brightness), 0, 100) : SAVER.brightnessDefault,
    minutes: Number.isFinite(o.minutes) ? clamp(Math.round(o.minutes), SAVER.minutes.min, SAVER.minutes.max) : SAVER.minutes.default,
    images: Array.isArray(o.images) ? o.images.filter((i) => i && typeof i.id === 'string' && typeof i.thumb === 'string') : [],
  };
}

const persist = () => savePref('saver', state.saver);

// ================= imagens no app =================
const memImages = new Map();   // sem Bridge (mock/dev)
const imgUrl = (id) => `http://${resolveHost()}/api/v1/store/${NS}/${id}`;

async function putImage(id, dataUrl) {
  if (!state.hostConnected) { memImages.set(id, dataUrl); return; }
  const r = await fetch(imgUrl(id), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dataUrl),
  });
  if (!r.ok) throw new Error(`store ${r.status}`);
}
async function getImage(id) {
  if (!state.hostConnected) return memImages.get(id) || null;
  try {
    const r = await fetch(imgUrl(id), { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
function deleteImage(id) {
  if (!state.hostConnected) { memImages.delete(id); return; }
  fetch(imgUrl(id), { method: 'DELETE' }).catch(() => {});
}

// ---------- redução ----------
// Resolução física da tela (CSS px × devicePixelRatio), em paisagem. A imagem é reduzida
// só o bastante para COBRIR essa área — nunca ampliada — e depois comprimida até caber
// no limite do app.
function screenPixels() {
  const dpr = window.devicePixelRatio || 1;
  const a = Math.round((window.screen.width || window.innerWidth) * dpr);
  const b = Math.round((window.screen.height || window.innerHeight) * dpr);
  return { long: Math.max(a, b), short: Math.min(a, b) };
}

function draw(bmp, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  return c;
}

async function encodeImage(file) {
  const bmp = await createImageBitmap(file);
  const { long, short } = screenPixels();
  const landscape = bmp.width >= bmp.height;
  const [tw, th] = landscape ? [long, short] : [short, long];
  let scale = Math.min(1, Math.max(tw / bmp.width, th / bmp.height));
  let dataUrl = null;
  for (let round = 0; round < 12 && !dataUrl; round++) {
    const c = draw(bmp, Math.max(1, Math.round(bmp.width * scale)), Math.max(1, Math.round(bmp.height * scale)));
    for (const q of [0.88, 0.8, 0.72, 0.64]) {
      const d = c.toDataURL('image/jpeg', q);
      if (d.length + 2 <= MAX_ITEM_CHARS) { dataUrl = d; break; }
    }
    scale *= 0.85;   // ainda grande demais: reduz um pouco e tenta de novo
  }
  // miniatura para a tela de configuração (fica no próprio pref, abre na hora)
  const k = Math.max(THUMB_W / bmp.width, THUMB_H / bmp.height);
  const t = draw(bmp, Math.round(bmp.width * k), Math.round(bmp.height * k));
  const tc = document.createElement('canvas');
  tc.width = THUMB_W; tc.height = THUMB_H;
  tc.getContext('2d').drawImage(t, (THUMB_W - t.width) / 2, (THUMB_H - t.height) / 2);
  const thumb = tc.toDataURL('image/jpeg', 0.7);
  bmp.close && bmp.close();
  return { dataUrl, thumb };
}

const newId = () => `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** adiciona arquivos escolhidos; devolve { added, skipped, failed } */
export async function addImageFiles(files, onProgress) {
  const list = [...files].filter((f) => !f.type || f.type.startsWith('image/'));
  const room = SAVER.maxImages - state.saver.images.length;
  const take = list.slice(0, Math.max(0, room));
  const out = { added: 0, skipped: list.length - take.length, failed: 0 };
  for (let i = 0; i < take.length; i++) {
    if (onProgress) onProgress(i + 1, take.length);
    try {
      const { dataUrl, thumb } = await encodeImage(take[i]);
      if (!dataUrl) throw new Error('grande demais');
      const id = newId();
      await putImage(id, dataUrl);
      state.saver.images.push({ id, thumb });
      out.added++;
      persist();
    } catch (e) {
      console.warn('[CREMA] imagem não adicionada', take[i] && take[i].name, e);
      out.failed++;
    }
  }
  return out;
}

export function removeImage(id) {
  state.saver.images = state.saver.images.filter((i) => i.id !== id);
  deleteImage(id);
  persist();
  if (active && !state.saver.images.length) stop();
}

export function setSaverOn(on) { state.saver.on = !!on; persist(); syncSaver(); }
export function setSaverBrightness(v) {
  state.saver.brightness = clamp(Math.round(v), 0, 100);
  persist();
  if (active) setBrightness(state.saver.brightness);
}
export function setSaverMinutes(v) {
  state.saver.minutes = clamp(Math.round(v), SAVER.minutes.min, SAVER.minutes.max);
  persist();
  if (active) restartTimer();
}

// ================= a proteção de tela =================
// Fica FORA do canvas escalado (.app): cobre a tela inteira, inclusive as sobras laterais.
let el = null, imgEl = null, hintEl = null, hintText = null;
let active = null;          // null | 'sleep' | 'preview'
let index = 0;              // continua de onde parou no sleep seguinte
let timer = null, showToken = 0;
let prevBrightness = null;
let suppressUntil = 0;      // depois de pedir para acordar, não reabrir enquanto o estado não muda
let holdTimer = null, hintTimer = null, pressAt = 0;

function build() {
  el = document.createElement('div');
  el.className = 'saver';
  el.hidden = true;
  el.innerHTML = `
    <img class="saver__img" alt="" draggable="false">
    <div class="saver__hint" hidden>
      <span class="saver__hint-text"></span>
      <span class="saver__hold"><i></i></span>
    </div>`;
  document.body.appendChild(el);
  imgEl = el.querySelector('.saver__img');
  hintEl = el.querySelector('.saver__hint');
  hintText = el.querySelector('.saver__hint-text');

  // No Android, segurar o dedo sobre uma imagem abre o menu dela e CANCELA o toque
  // (pointercancel). Por isso a imagem não recebe toques, o menu é bloqueado e só o
  // soltar do dedo interrompe o toque longo — um cancelamento do sistema, não.
  el.addEventListener('pointerdown', onPress);
  el.addEventListener('pointerup', onRelease);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('dragstart', (e) => e.preventDefault());
}

const hintLabel = () => (active === 'preview' ? 'Hold to close preview' : 'Hold to wake');

function showHint(holding) {
  clearTimeout(hintTimer);
  hintText.textContent = hintLabel();
  hintEl.hidden = false;
  hintEl.classList.toggle('is-holding', holding);
  if (!holding) hintTimer = setTimeout(() => { hintEl.hidden = true; }, SAVER.hintMs);
}

function onPress(e) {
  e.preventDefault();
  try { el.setPointerCapture(e.pointerId); } catch { /* sem captura */ }
  pressAt = performance.now();
  clearTimeout(holdTimer);
  // reinicia a barra de progresso do toque longo
  hintEl.classList.remove('is-holding');
  void hintEl.offsetWidth;
  showHint(true);
  holdTimer = setTimeout(onHoldComplete, SAVER.holdMs);
}

function onRelease() {
  if (!holdTimer) return;
  clearTimeout(holdTimer);
  holdTimer = null;
  if (performance.now() - pressAt < SAVER.holdMs) showHint(false);
}

function onHoldComplete() {
  holdTimer = null;
  hintEl.hidden = true;
  if (active === 'sleep') {
    suppressUntil = Date.now() + 8000;
    wakeMachine();
  }
  stop();
}

async function showCurrent() {
  const imgs = state.saver.images;
  if (!imgs.length) { stop(); return; }
  const token = ++showToken;
  for (let tries = 0; tries < imgs.length; tries++) {
    index = ((index % imgs.length) + imgs.length) % imgs.length;
    const data = await getImage(imgs[index].id);
    if (token !== showToken || !active) return;
    if (data) { imgEl.src = data; return; }
    index++;   // item sumiu do app: pula
  }
  stop();      // nenhuma imagem legível → volta ao véu padrão
}

function restartTimer() {
  clearInterval(timer);
  timer = setInterval(() => { index++; showCurrent(); }, state.saver.minutes * 60000);
}

async function start(mode) {
  if (!el) build();
  const wasActive = active;
  active = mode;
  if (wasActive) return;          // prévia virando sleep: mantém imagem e brilho
  el.hidden = false;
  hintEl.hidden = true;
  showCurrent();
  restartTimer();
  const d = await getDisplay();
  if (!active) return;
  prevBrightness = d && Number.isFinite(d.requestedBrightness) ? d.requestedBrightness : 100;
  setBrightness(state.saver.brightness);
}

function stop() {
  if (!active) return;
  active = null;
  showToken++;
  clearInterval(timer); timer = null;
  clearTimeout(holdTimer); holdTimer = null;
  clearTimeout(hintTimer);
  if (el) { el.hidden = true; imgEl.removeAttribute('src'); }
  index++;   // o próximo sleep começa na imagem seguinte
  if (prevBrightness != null) { setBrightness(prevBrightness); prevBrightness = null; }
}

/** chamado a cada render do estado da máquina */
export function syncSaver() {
  const sleeping = state.machine.readiness === 'sleeping';
  if (!sleeping) suppressUntil = 0;
  const want = sleeping && state.saver.on && state.saver.images.length > 0 && Date.now() >= suppressUntil;
  if (want && active !== 'sleep') start('sleep');
  else if (!want && active === 'sleep') stop();
}

/** prévia a partir da configuração (sai com toque longo) */
export function previewSaver() {
  if (!state.saver.images.length || active) return;
  start('preview');
}

export const saverActive = () => active;
