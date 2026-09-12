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
  try { window.location.assign(url); } catch (e) { console.warn('[CREMA] assign falhou', e); }
  // Uma WebView pode barrar a navegação sem lançar erro: se continuamos na mesma
  // página depois de um instante, tenta abrir numa aba e, se nem isso, avisa.
  await new Promise((r) => setTimeout(r, 1200));
  if (location.href !== here) return true;
  const win = window.open(url, '_blank');
  if (win) return true;
  console.warn('[CREMA] o host bloqueou a navegação para', url);
  return false;
}
