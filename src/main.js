// CREMA · bootstrap. Liga fonte de dados (Bridge real ou mock) → gráfico + status.

import { state, setState } from './store.js';
import { initUI, renderStatus, updateShotPhase, renderShotTable, onShotStarted, onShotEnded } from './ui.js';
import { createChart } from './chart.js';
import { createMockSource } from './mock.js';
import { createApiSource, detectHost } from './api.js';

// escala o canvas fixo 1320×800 para preencher a tela real (qualquer dpr/viewport).
// min() evita cortar conteúdo; no kiosk 1320×800 (mesma proporção) escala exata, sem faixas.
function fitApp() {
  const el = document.querySelector('.app');
  if (!el) return;
  const s = Math.min(window.innerWidth / 1320, window.innerHeight / 800);
  el.style.transform = `scale(${s})`;
}
fitApp();
window.addEventListener('resize', fitApp);
window.addEventListener('orientationchange', fitApp);

async function boot() {
  fitApp();
  renderStatus();

  const chart = createChart();
  chart.setConfig({ staticOn: state.profile.staticOn, staticTimer: state.profile.staticTimer });

  // detecção de host: com Bridge → api real; sem host → mock (visual-first)
  const useBridge = await detectHost();
  const source = useBridge ? createApiSource() : createMockSource();
  setState({ hostConnected: useBridge });

  // No Bridge real, começa sem valores inventados — "—" até chegar o 1º snapshot.
  // Tank fica "—" sempre (o snapshot da DE1 não traz nível de água).
  if (useBridge) {
    Object.assign(state.status, {
      mixTemp: null, groupTemp: null, tankMl: null, tankPct: null,
      weightG: 0, connected: false, ready: false, scaleConnected: false,
    });
    renderStatus();
  }

  // início de shot (mock via SIM; bridge quando a máquina entra em "espresso")
  source.onShotStart(() => {
    state.liveShot = { pressure: [], flow: [], temp: [], weight: [] };
    state.graphMode = 'live';
    chart.showLive();
    onShotStarted();
  });

  // snapshot da máquina → SEMPRE atualiza os cards de telemetria; só alimenta o
  // gráfico ao vivo quando há um shot ativo (m.running).
  source.onSnapshot((m) => {
    state.status.mixTemp = m.mixTemp;
    state.status.groupTemp = m.groupTemp;
    state.status.connected = true;                 // recebendo dados = conectado
    state.status.machineState = m.state || 'idle'; // estado bruto p/ o badge
    state.status.ready = m.state === 'idle';
    renderStatus();
    if (!m.running) return;                         // sem shot → não mexe no gráfico ao vivo
    const ls = state.liveShot;
    ls.pressure.push([m.t, m.pressure]);
    ls.flow.push([m.t, m.flow]);
    ls.temp.push([m.t, m.temp]);
    for (const k of ['pressure', 'flow', 'temp', 'weight']) {
      if (ls[k].length > 600) ls[k].shift();
    }
    chart.update(ls);
    if (state.graphMode === 'live') {
      updateShotPhase(m.t);
      renderShotTable(ls, m.t);
    }
  });

  // fim de shot → congela a curva e mostra o tempo final
  source.onShotEnd(() => onShotEnded());

  // snapshot da balança → série de peso + cartão Weight
  source.onScale((w) => {
    const t = state.liveShot.pressure.length
      ? state.liveShot.pressure[state.liveShot.pressure.length - 1][0]
      : 0;
    state.liveShot.weight.push([t, w.weight]);
    state.status.weightG = w.weight;
    state.status.scaleConnected = w.connected;
    renderStatus();
    chart.update(state.liveShot);
  });

  initUI(chart, source);

  // Bridge real: abre WS + wake-lock. Mock (dev): o shot é controlado pelo botão SIM.
  if (useBridge) {
    if (source.requestWakeLock) source.requestWakeLock();
    source.start();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
