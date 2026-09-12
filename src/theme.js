// CREMA v2 · temas de cor — só cores, o layout nunca muda.
//
// O tema escolhido é uma preferência do usuário. Guardamos em dois lugares:
//   - KV store do Decaid (POST /api/v1/store/crema/theme): sobrevive a reinstalar
//     a skin e à troca de origem que o app faz quando a porta cai (doc/Skins.md
//     § Skin Origins and Browser Storage recomenda a API para estado que não pode
//     se perder);
//   - localStorage: cache para aplicar o tema já no <head>, sem piscar o Escuro.

import { resolveHost } from './api.js';
import { state } from './store.js';
import { THEMES } from './themes-data.js';

const LS_KEY = 'crema.theme';
const KV_URL = () => `http://${resolveHost()}/api/v1/store/crema/theme`;

export { THEMES };

export function currentTheme() {
  return document.documentElement.dataset.theme || 'dark';
}

export function applyTheme(id, { persist = true } = {}) {
  const theme = THEMES.find((t) => t.id === id) || THEMES[0];
  if (theme.id === 'dark') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme.id;
  document.documentElement.style.colorScheme = theme.light ? 'light' : 'dark';
  try { localStorage.setItem(LS_KEY, theme.id); } catch { /* sem storage: segue */ }
  if (persist && state.hostConnected) {
    fetch(KV_URL(), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: theme.id }),
    }).catch((e) => console.warn('[CREMA] theme: falha ao salvar no store', e));
  }
  window.dispatchEvent(new CustomEvent('crema:theme', { detail: theme.id }));
  return theme.id;
}

/** reconcilia com o que está salvo no app (a fonte que sobrevive a tudo) */
export async function loadThemeFromHost() {
  if (!state.hostConnected) return;
  try {
    const r = await fetch(KV_URL(), { cache: 'no-store' });
    if (!r.ok) return;
    const data = await r.json();           // chave ausente → 200 com `null`
    const id = data && data.id;
    if (id && id !== currentTheme() && THEMES.some((t) => t.id === id)) applyTheme(id, { persist: false });
  } catch { /* sem store: fica o cache local */ }
}
