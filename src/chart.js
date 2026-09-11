// CREMA · gráfico de extração (herói) — SVG desenhado à mão.
// Três modos:
//   live    → streaming do shot atual (janela fixa/dinâmica conforme Static).
//   static  → curva planejada de um perfil (com fases) OU um shot gravado do histórico.
// Eixo Y esq.: pressão/fluxo 0..12. Eixo Y dir.: temperatura 0..100 °C.

const WIDTH = 1000;
const HEIGHT = 560;
const V_PF = 12;
const V_TEMP = 100;
const V_WEIGHT = 100;
const PLOT = { top: 10, right: 140, bottom: 30, left: 36 };

const PRESS_TARGET = [[0,2.0],[5,2.85],[12,3.0],[13,3.0],[13.4,8.6],[14,9.1],[20,9.18],[30,8.7]];
const FLOW_TARGET  = [[0,2.0],[5,2.0],[9,1.95],[14,1.9],[20,1.9],[30,1.9]];

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

function toPoints(pairs, vmax, tMax) {
  return pairs
    .map(([t, v]) => `${(t / tMax * WIDTH).toFixed(1)},${(HEIGHT - (v / vmax) * HEIGHT).toFixed(1)}`)
    .join(' ');
}

export function createChart() {
  const el = (id) => document.getElementById(id);
  const graphEl = document.querySelector('.graph');
  const axisXEl = el('axis-x');
  const phaseLinesEl = el('phase-lines');
  const phaseLabelsEl = el('phase-labels');
  const nodes = {
    temp: el('s-temp'), press: el('s-press'), flow: el('s-flow'), weight: el('s-weight'),
    pressTarget: el('s-press-target'), flowTarget: el('s-flow-target'),
  };
  const labels = { temp: el('lbl-temp'), press: el('lbl-press'), flow: el('lbl-flow'), weight: el('lbl-weight') };

  const cfg = { staticOn: true, staticTimer: 30 };
  let mode = 'live';        // 'live' | 'static'
  let staticView = null;    // { kind, pressure, flow, temp, weight, duration, phases }
  let buffers = null;
  let dirty = false;
  let rafId = null;
  let dims = null;

  function measure() {
    // clientWidth/Height = px de layout (NÃO afetados pelo transform:scale do .app),
    // que é o mesmo espaço em que posicionamos os rótulos (left/top).
    const w = graphEl.clientWidth, h = graphEl.clientHeight;
    dims = {
      w, h,
      plotL: PLOT.left, plotT: PLOT.top,
      plotW: w - PLOT.left - PLOT.right,
      plotH: h - PLOT.top - PLOT.bottom,
    };
  }
  window.addEventListener('resize', () => { dims = null; });

  const setLine = (node, pairs, vmax, tMax) =>
    node.setAttribute('points', pairs && pairs.length ? toPoints(pairs, vmax, tMax) : '');

  // posiciona os rótulos à direita da ponta de cada série, com de-colisão vertical
  // para que, ao fim do gráfico, não se sobreponham entre si nem sobre as linhas.
  function placeLabels(items, tMax) {
    const entries = [];
    for (const it of items) {
      if (!it.pair) { it.node.style.display = 'none'; continue; }
      it.node.style.display = '';
      if (it.text != null) it.node.textContent = it.text;
      if (!dims || !dims.plotW) continue;
      const x = dims.plotL + clamp(it.pair[0] / tMax, 0, 1) * dims.plotW;
      const y = dims.plotT + clamp(1 - it.pair[1] / it.vmax, 0, 1) * dims.plotH;
      entries.push({ node: it.node, x, y, h: it.node.offsetHeight || 18 });
    }
    if (!dims || !entries.length) return;
    // `y` é o CENTRO do rótulo (na altura da linha). De-colisão pelo centro.
    const GAP = 20;
    entries.sort((a, b) => a.y - b.y);
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].y - entries[i - 1].y < GAP) entries[i].y = entries[i - 1].y + GAP;
    }
    // se o grupo ultrapassou o fim da área, empurra todos para cima
    const bottom = dims.plotT + dims.plotH;
    const over = entries[entries.length - 1].y - bottom;
    if (over > 0) for (const e of entries) e.y -= over;
    for (const e of entries) {
      // topo = centro − meia-altura, preso na área do gráfico (nunca abaixo do eixo)
      const top = clamp(e.y - e.h / 2, dims.plotT, bottom - e.h);
      let left = e.x + 14;
      const w = e.node.offsetWidth;
      if (left + w > dims.w - 2 && dims.w - 2 - w >= e.x + 4) left = dims.w - 2 - w;
      e.node.style.left = `${left}px`;
      e.node.style.top = `${top}px`;
    }
  }

  function updateAxis(tMax) {
    if (!axisXEl) return;
    const ticks = axisXEl.children;
    const dec = tMax < 10 ? 1 : 0;
    for (let i = 0; i < ticks.length; i++) {
      ticks[i].textContent = `${((i / (ticks.length - 1)) * tMax).toFixed(dec)}s`;
    }
  }

  function clearPhases() {
    phaseLinesEl.innerHTML = '';
    phaseLabelsEl.innerHTML = '';
  }
  function renderPhases(phases, tMax) {
    clearPhases();
    if (!phases || !phases.length) return;
    const SVGNS = 'http://www.w3.org/2000/svg';
    for (const ph of phases) {
      if (ph.start > 0) {
        const line = document.createElementNS(SVGNS, 'line');
        const x = (ph.start / tMax * WIDTH).toFixed(1);
        line.setAttribute('x1', x); line.setAttribute('x2', x);
        line.setAttribute('y1', '0'); line.setAttribute('y2', HEIGHT);
        line.setAttribute('stroke', 'rgba(255,255,255,.14)');
        line.setAttribute('stroke-width', '1');
        line.setAttribute('stroke-dasharray', '2 5');
        line.setAttribute('vector-effect', 'non-scaling-stroke');
        phaseLinesEl.appendChild(line);
      }
      // rótulo preso à largura da própria fase (com reticências); pula fases muito estreitas
      const wPct = ((ph.end - ph.start) / tMax) * 100;
      if (wPct < 6) continue;
      const mid = (ph.start + ph.end) / 2;
      const lbl = document.createElement('div');
      lbl.className = 'phase-label';
      lbl.style.left = `${(mid / tMax) * 100}%`;
      lbl.style.maxWidth = `${wPct}%`;
      lbl.textContent = ph.label;
      phaseLabelsEl.appendChild(lbl);
    }
  }

  function tMaxFor(elapsed) {
    if (!cfg.staticOn) return Math.max(0.5, elapsed);
    let base = Math.max(1, cfg.staticTimer);
    if (elapsed > base) base = Math.ceil(elapsed / 5) * 5;
    return base;
  }
  const last = (arr) => (arr && arr.length ? arr[arr.length - 1] : null);

  function renderLive() {
    clearPhases();
    const elapsed = (last(buffers.pressure) || [0])[0] || 0;
    const tMax = tMaxFor(elapsed);
    setLine(nodes.pressTarget, PRESS_TARGET, V_PF, tMax);
    setLine(nodes.flowTarget, FLOW_TARGET, V_PF, tMax);
    setLine(nodes.press, buffers.pressure, V_PF, tMax);
    setLine(nodes.flow, buffers.flow, V_PF, tMax);
    setLine(nodes.temp, buffers.temp, V_TEMP, tMax);
    setLine(nodes.weight, buffers.weight, V_WEIGHT, tMax);

    const lp = last(buffers.pressure), lf = last(buffers.flow), lt = last(buffers.temp), lw = last(buffers.weight);
    placeLabels([
      { node: labels.temp, pair: lt, vmax: V_TEMP, text: lt ? `${lt[1].toFixed(0)} °C` : null },
      { node: labels.press, pair: lp, vmax: V_PF, text: lp ? `${lp[1].toFixed(1)} Pressure` : null },
      { node: labels.flow, pair: lf, vmax: V_PF, text: lf ? `${lf[1].toFixed(1)} Flow` : null },
      { node: labels.weight, pair: lw, vmax: V_WEIGHT, text: lw ? `${lw[1].toFixed(1)} Weight` : null },
    ], tMax);
    updateAxis(tMax);
  }

  function renderStatic() {
    const v = staticView;
    const tMax = v.duration;
    // sem alvos tracejados no modo estático
    setLine(nodes.pressTarget, null); setLine(nodes.flowTarget, null);
    setLine(nodes.press, v.pressure, V_PF, tMax);
    setLine(nodes.flow, v.flow, V_PF, tMax);
    setLine(nodes.temp, v.temp, V_TEMP, tMax);
    setLine(nodes.weight, v.weight, V_WEIGHT, tMax);

    const lp = last(v.pressure), lf = last(v.flow), lt = last(v.temp), lw = last(v.weight);
    const isShot = v.kind === 'shot';
    placeLabels([
      { node: labels.temp, pair: lt, vmax: V_TEMP, text: lt ? `${lt[1].toFixed(0)} °C` : null },
      { node: labels.press, pair: lp, vmax: V_PF, text: lp ? (isShot ? `${lp[1].toFixed(1)} Pressure` : 'Pressure') : null },
      { node: labels.flow, pair: lf, vmax: V_PF, text: lf ? (isShot ? `${lf[1].toFixed(1)} Flow` : 'Flow') : null },
      { node: labels.weight, pair: lw, vmax: V_WEIGHT, text: isShot && lw ? `${lw[1].toFixed(1)} Weight` : null },
    ], tMax);

    updateAxis(tMax);
    renderPhases(v.phases, tMax);
  }

  function render() {
    rafId = null;
    if (!dirty) return;
    dirty = false;
    if (!dims) measure();
    if (mode === 'static' && staticView) renderStatic();
    else if (mode === 'live' && buffers) renderLive();
  }
  function schedule() {
    dirty = true;
    if (rafId == null) rafId = requestAnimationFrame(render);
  }
  // render imediato (não depende de rAF, que o navegador pausa quando a aba/tela throttla).
  // usado para vistas estáticas (perfil planejado / shot do histórico), que são one-shot.
  function renderNow() { dirty = true; render(); }

  return {
    update(liveShot) { if (mode !== 'live') return; buffers = liveShot; schedule(); },
    setConfig(next) { Object.assign(cfg, next); if (mode === 'static') renderNow(); else schedule(); },
    showLive() { mode = 'live'; schedule(); },
    showStatic(view) { mode = 'static'; staticView = view; renderNow(); },
    stop() { if (rafId != null) cancelAnimationFrame(rafId); rafId = null; },
  };
}
