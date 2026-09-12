// CREMA v2 · preferências da skin guardadas NO APP, não no navegador.
//
// Princípio do projeto: toda modificação feita na skin reflete na máquina/app, e ao
// iniciar a skin lê de lá antes de qualquer interação. Receita e auxiliares vão no
// workflow; o que é só da skin (favoritos, eixo Static, valores anteriores do
// teclado) mora no key-value store do Decaid — que a doc recomenda para estado que
// não pode se perder (doc/Skins.md § Skin Origins and Browser Storage).
//
// Sem Bridge (mock/dev) cai no localStorage, só para o desenvolvimento funcionar.

import { resolveHost } from './api.js';
import { state } from './store.js';

const NS = 'crema';
const LS = (key) => `crema.pref.${key}`;
const url = (key) => `http://${resolveHost()}/api/v1/store/${NS}/${key}`;

/** lê várias chaves em paralelo; chave ausente → null */
export async function loadPrefs(keys) {
  const out = {};
  await Promise.all(keys.map(async (key) => {
    if (!state.hostConnected) {
      try { out[key] = JSON.parse(localStorage.getItem(LS(key)) ?? 'null'); } catch { out[key] = null; }
      return;
    }
    try {
      const r = await fetch(url(key), { cache: 'no-store' });
      out[key] = r.ok ? await r.json() : null;       // ausente → 200 com `null`
    } catch { out[key] = null; }
  }));
  return out;
}

const timers = new Map();

/** grava com debounce por chave (toques seguidos viram uma escrita só) */
export function savePref(key, value, delay = 300) {
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => {
    timers.delete(key);
    if (!state.hostConnected) {
      try { localStorage.setItem(LS(key), JSON.stringify(value)); } catch { /* sem storage */ }
      return;
    }
    fetch(url(key), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    }).catch((e) => console.warn(`[CREMA] pref ${key}: falha ao salvar no app`, e));
  }, delay));
}
