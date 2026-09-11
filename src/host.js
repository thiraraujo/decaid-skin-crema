// CREMA · ações que envolvem o app host (ReaPrime), independentes da fonte de dados.
// Sem host detectado (dev/mock), apenas registra a intenção no console.

import { resolveHost } from './api.js';
import { state } from './store.js';

// Sleep → coloca a DE1 em repouso: PUT /api/v1/machine/state/sleeping
export function sleepMachine() {
  if (!state.hostConnected) {
    console.info('[CREMA] Sleep (mock): PUT machine/state/sleeping');
    return Promise.resolve();
  }
  return fetch(`http://${resolveHost()}/api/v1/machine/state/sleeping`, { method: 'PUT' })
    .catch((e) => console.warn('[CREMA] falha ao dormir a máquina', e));
}

// Settings → navega para o plugin de settings nativo do app, com botão "voltar" rotulado.
export function openAppSettings() {
  if (!state.hostConnected) {
    console.info('[CREMA] Settings (mock): abriria settings.reaplugin/ui?backName=CREMA');
    return;
  }
  window.location.href =
    `http://${resolveHost()}/api/v1/plugins/settings.reaplugin/ui?backName=CREMA`;
}
