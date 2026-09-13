// CREMA v2 · ações que envolvem o app host (ReaPrime), independentes da fonte de dados.

import { resolveHost } from './api.js';
import { state } from './store.js';

/** Sleep → PUT /api/v1/machine/state/sleeping */
export function sleepMachine() {
  return setMachineState('sleeping');
}

/** Wake → PUT /api/v1/machine/state/idle */
export function wakeMachine() {
  return setMachineState('idle');
}

function setMachineState(next) {
  if (!state.hostConnected) {
    console.info(`[CREMA] ${next} (mock): PUT machine/state/${next}`);
    state.machine.state = next === 'idle' ? 'ready' : next;
    return Promise.resolve();
  }
  return fetch(`http://${resolveHost()}/api/v1/machine/state/${next}`, { method: 'PUT' })
    .then((r) => { if (!r.ok) console.warn('[CREMA] machine/state', next, 'HTTP', r.status); return r.ok; })
    .catch((e) => { console.warn(`[CREMA] falha ao mudar estado para ${next}`, e); return false; });
}

// Tela do tablet (doc/Skins.md § Display): brilho 0–99 fixo, 100 = volta ao do sistema.
export async function getDisplay() {
  if (!state.hostConnected) return null;
  try {
    const r = await fetch(`http://${resolveHost()}/api/v1/display`, { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export function setBrightness(value) {
  const brightness = Math.min(100, Math.max(0, Math.round(value)));
  if (!state.hostConnected) {
    console.info(`[CREMA] brilho (mock): ${brightness}`);
    return Promise.resolve(true);
  }
  return fetch(`http://${resolveHost()}/api/v1/display/brightness`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brightness }),
  }).then((r) => r.ok).catch((e) => { console.warn('[CREMA] falha ao mudar o brilho', e); return false; });
}

// Settings → UI do plugin de settings do app. O id pode variar entre versões,
// então descobrimos pelo /plugins em vez de fixar "settings.reaplugin".
let settingsPath = null;

export async function findSettingsPlugin() {
  if (settingsPath !== null) return settingsPath;
  if (!state.hostConnected) { settingsPath = ''; return settingsPath; }
  try {
    const list = await fetch(`http://${resolveHost()}/api/v1/plugins`).then((r) => (r.ok ? r.json() : []));
    const plugin = (Array.isArray(list) ? list : []).find((p) => /(^|[.\-])settings/i.test(p.id || ''));
    settingsPath = plugin ? `/api/v1/plugins/${plugin.id}/ui` : '';
  } catch (e) {
    console.warn('[CREMA] falha ao listar plugins', e);
    settingsPath = '';
  }
  return settingsPath;
}

export async function openAppSettings() {
  if (!state.hostConnected) {
    console.info('[CREMA] Settings (mock): abriria a UI do plugin de settings');
    return false;
  }
  const path = await findSettingsPlugin();
  if (!path) {
    console.warn('[CREMA] nenhum plugin de settings instalado no app');
    return false;
  }
  const url = `http://${resolveHost()}${path}?backName=CREMA`;
  console.info('[CREMA] abrindo Settings:', url);
  const here = location.href;
  // A página de settings do app pode levar vários segundos para responder no tablet:
  // enquanto a navegação está em curso (beforeunload/pagehide já dispararam) não há
  // aviso nem segunda tentativa. Só se nada acontecer em 10 s é que tentamos abrir
  // numa aba e, se nem isso, avisamos.
  let leaving = false;
  const mark = () => { leaving = true; };
  window.addEventListener('beforeunload', mark);
  window.addEventListener('pagehide', mark);
  try { window.location.assign(url); } catch (e) { console.warn('[CREMA] assign falhou', e); }
  const t0 = Date.now();
  while (Date.now() - t0 < 10000) {
    await new Promise((r) => setTimeout(r, 250));
    if (leaving || location.href !== here) return true;
  }
  window.removeEventListener('beforeunload', mark);
  window.removeEventListener('pagehide', mark);
  const win = window.open(url, '_blank');
  if (win) return true;
  console.warn('[CREMA] o host bloqueou a navegação para', url);
  return false;
}
