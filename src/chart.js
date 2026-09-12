// CREMA v2 · gráfico de extração — SVG desenhado à mão, sem dependências.
// Espelha docs/handoff-v2/Chart.dc.html: mesmas escalas, séries, rótulos e eixos.
//
//   plan  → curva planejada do perfil (fases pontilhadas, sem peso)
//   shot  → shot gravado (realizado + peso, eixo direito em g)
//   live  → shot em andamento (realizado sólido + plano tracejado a 55%)
//
// Escalas: pressão/fluxo 0–12 · temperatura 0–100 °C · peso 0–50 g.

const W = 1000, H = 560;
const V_PF = 12, V_TEMP = 100, V_WEIGHT = 50;
const SVGNS = 'http://www.w3.org/2000/svg';

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const last = (a) => (a && a.length ? a[a.length - 1] : null);

function toXY(pairs, vmax, tMax) {
  return pairs.map(([t, v]) => [t / tMax * W, H - clamp(v / vmax, -0.2, 1.2) * H]);
}

const n1 = (n) => n.toFixed(1);

/** caminho reto (um L por amostra) */
function linePath(pts) {
  if (!pts.length) return '';
  return `M${n1(pts[0][0])},${n1(pts[0][1])}` + pts.slice(1).map(([x, y]) => ` L${n1(x)},${n1(y)}`).join('');
}

/** Catmull-Rom → Bézier cúbica, tensão 1/6; Y preso a [0,H] para o peso não
 *  descer abaixo da base quando a curva "passa do ponto" (docs/handoff-shot-live). */
function curvePath(pts) {
  if (pts.length < 2) return '';
  const cl = (y) => Math.min(H, Math.max(0, y));
  let d = `M${n1(pts[0][0])},${n1(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, cl(p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, cl(p2[1] - (p3[1] - p1[1]) / 6)];
    d += ` C${n1(c1[0])},${n1(c1[1])} ${n1(c2[0])},${n1(c2[1])} ${n1(p2[0])},${n1(p2[1])}`;
  }
  return d;
}

function svgEl(tag, attrs) {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

/**
 * @param {HTMLElement} host  container (position:relative) onde o gráfico é montado
 * @param {object} opts  { gap:number=80, thick:boolean, axes:boolean=true }
 */
export function createChart(host, opts = {}) {
  const cfg = {
    gap: opts.gap ?? 80,
    thick: !!opts.thick,
    smooth: !!opts.smooth,          // curvas suavizadas + traço 2px (tela 02)
    phaseLabelsTop: !!opts.smooth,  // fases numeradas no alto do gráfico
    axes: opts.axes !== false,
    staticOn: true,
    staticTimer: 30,
  };

  // ---------- DOM ----------
  host.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'chart';

  const body = document.createElement('div');
  body.className = 'chart__body';

  const axisY = document.createElement('div');
  axisY.className = 'chart__axis-y';
  axisY.innerHTML = ['12', '9', '6', '3', '0'].map((t) => `<span>${t}</span>`).join('');

  const plot = document.createElement('div');
  plot.className = 'chart__plot';

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none' });
  for (const y of [140, 280, 420]) {
    svg.appendChild(svgEl('line', { x1: 0, y1: y, x2: W, y2: y, stroke: 'var(--grid-line)', 'vector-effect': 'non-scaling-stroke' }));
  }
  svg.appendChild(svgEl('line', { x1: 0, y1: H - 1, x2: W, y2: H - 1, stroke: 'var(--grid-base)', 'vector-effect': 'non-scaling-stroke' }));

  const gPhases = svgEl('g', {});
  svg.appendChild(gPhases);

  const mkLine = (stroke, extra) => svgEl('path', {
    d: '', fill: 'none', stroke, 'stroke-width': cfg.smooth ? 2 : (cfg.thick ? 3.5 : 2.5),
    'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    'vector-effect': 'non-scaling-stroke', ...extra,
  });
  const dash = cfg.smooth
    ? { 'stroke-width': 1.5, 'stroke-dasharray': '4 5', 'stroke-opacity': .5 }
    : { 'stroke-width': 2, 'stroke-dasharray': '6 6', 'stroke-opacity': .55 };
  const line = {
    pressTarget: mkLine('var(--green)', dash),
    flowTarget: mkLine('var(--blue)', dash),
    temp: mkLine('var(--red)'),
    weight: mkLine('var(--amber)'),
    flow: mkLine('var(--blue)'),
    press: mkLine('var(--green)'),
  };
  // ordem de pintura: alvos atrás; pressão por último (série principal)
  for (const k of ['pressTarget', 'flowTarget', 'temp', 'weight', 'flow', 'press']) svg.appendChild(line[k]);

  const labelsEl = document.createElement('div');
  labelsEl.className = 'chart__labels';
  const phaseLabelsEl = document.createElement('div');
  phaseLabelsEl.className = 'chart__phase-labels';

  plot.append(svg, labelsEl, phaseLabelsEl);

  const gapEl = document.createElement('div');
  gapEl.className = 'chart__gap';
  gapEl.style.width = `${cfg.gap}px`;

  const axisW = document.createElement('div');
  axisW.className = 'chart__axis-w';
  axisW.innerHTML = ['50', '40', '30', '20', '0'].map((t) => `<span>${t}</span>`).join('');

  body.append(axisY, plot, gapEl, axisW);

  const axisX = document.createElement('div');
  axisX.className = 'chart__axis-x';
  axisX.innerHTML = new Array(5).fill('<span></span>').join('');

  root.append(body, axisX);
  host.appendChild(root);
  if (!cfg.axes) root.classList.add('chart--bare');
  if (cfg.thick) root.classList.add('chart--thick');
  if (cfg.smooth) root.classList.add('chart--smooth');

  // espessura do traço acompanha o modo: 3.5px ao vivo (tela 02), 2.5px nas vistas estáticas
  function setThick(on) {
    cfg.thick = on;
    root.classList.toggle('chart--thick', on);
    if (cfg.smooth) return;   // tela 02 usa 2px fixo
    for (const k of ['temp', 'weight', 'flow', 'press']) line[k].setAttribute('stroke-width', on ? 3.5 : 2.5);
  }

  // ---------- estado ----------
  let mode = 'plan';        // 'plan' | 'shot' | 'live'
  let view = null;          // dados estáticos (plan/shot)
  let buffers = null;       // séries ao vivo
  let targets = null;       // { pressure, flow } planejados do perfil ativo
  let livePhases = null;    // fases do perfil ativo, desenhadas durante o shot
  let dims = null;
  let rafId = null, dirty = false;

  function measure() {
    dims = { w: plot.clientWidth, h: plot.clientHeight };
  }
  const invalidate = () => { dims = null; };
  window.addEventListener('resize', invalidate);
  // o gráfico muda de caixa ao entrar/sair do modo ao vivo e ao abrir telas:
  // observar o próprio elemento evita rótulos posicionados com medidas velhas.
  const ro = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => { invalidate(); drawNow(); })
    : null;
  if (ro) ro.observe(plot);

  // ---------- rótulos ----------
  // Um rótulo por série, na ponta direita da curva, com de-colisão vertical.
  function renderLabels(items, tMax) {
    labelsEl.innerHTML = '';
    if (!dims || !dims.w) return;
    const entries = [];
    for (const it of items) {
      if (!it.pair || it.text == null) continue;
      const d = document.createElement('div');
      d.className = 'chart__label';
      d.style.color = it.color;
      d.textContent = it.text;
      labelsEl.appendChild(d);
      entries.push({
        node: d,
        x: clamp(it.pair[0] / tMax, 0, 1) * dims.w,
        y: clamp(1 - it.pair[1] / it.vmax, 0, 1) * dims.h,
        h: d.offsetHeight || 18,
      });
    }
    if (!entries.length) return;
    const GAP = cfg.thick ? 26 : 20;
    entries.sort((a, b) => a.y - b.y);
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].y - entries[i - 1].y < GAP) entries[i].y = entries[i - 1].y + GAP;
    }
    const over = entries[entries.length - 1].y - dims.h;
    if (over > 0) for (const e of entries) e.y -= over;
    for (const e of entries) {
      e.node.style.left = `${e.x}px`;
      e.node.style.top = `${clamp(e.y, e.h / 2, dims.h - e.h / 2)}px`;
    }
  }

  function renderPhases(phases, tMax) {
    gPhases.innerHTML = '';
    phaseLabelsEl.innerHTML = '';
    if (!phases || !phases.length) return;
    for (const ph of phases) {
      if (ph.start > 0) {
        const x = (ph.start / tMax * W).toFixed(1);
        gPhases.appendChild(svgEl('line', {
          x1: x, y1: 0, x2: x, y2: H,
          stroke: 'var(--grid-phase)', 'stroke-dasharray': '2 5',
          'vector-effect': 'non-scaling-stroke',
        }));
      }
      const wPct = ((ph.end - ph.start) / tMax) * 100;
      if (wPct < 6) continue;
      const d = document.createElement('div');
      d.className = `chart__phase-label${cfg.phaseLabelsTop ? ' chart__phase-label--top' : ''}`;
      d.style.left = `${((ph.start + ph.end) / 2 / tMax) * 100}%`;
      d.style.maxWidth = `${wPct}%`;
      d.textContent = ph.label;
      phaseLabelsEl.appendChild(d);
    }
    hideCrowdedLabels();
  }

  // perfis reais têm muitos steps: esconde o rótulo que encostaria no anterior,
  // em vez de empilhar texto ilegível na base do gráfico.
  function hideCrowdedLabels() {
    const items = [...phaseLabelsEl.children];
    let prevRight = -Infinity;
    for (const el of items) {
      el.style.visibility = '';
      const left = el.offsetLeft - el.offsetWidth / 2;
      if (left < prevRight + 8) { el.style.visibility = 'hidden'; continue; }
      prevRight = left + el.offsetWidth;
    }
  }

  function renderAxisX(tMax) {
    const dec = tMax < 10 ? 1 : 0;
    const ticks = axisX.children;
    for (let i = 0; i < ticks.length; i++) {
      ticks[i].textContent = `${((i / (ticks.length - 1)) * tMax).toFixed(dec)}s`;
    }
    axisX.style.marginRight = `${cfg.gap + (mode === 'plan' ? 0 : 26)}px`;
  }

  // `straight` para as curvas do PLANO: são degraus (cada step repete o X ao trocar
  // de patamar) e a suavização Catmull-Rom transformaria isso em laços.
  const setLine = (node, pairs, vmax, tMax, straight) => {
    const pts = pairs && pairs.length ? toXY(pairs, vmax, tMax) : [];
    node.setAttribute('d', cfg.smooth && !straight ? curvePath(pts) : linePath(pts));
  };

  function tMaxLive(elapsed) {
    if (!cfg.staticOn) return Math.max(5, elapsed);
    let base = Math.max(1, cfg.staticTimer);
    if (elapsed > base) base = Math.ceil(elapsed / 5) * 5;
    return base;
  }

  function draw() {
    rafId = null;
    if (!dirty) return;
    dirty = false;
    if (!dims) measure();

    axisW.style.display = mode === 'plan' ? 'none' : '';

    if (mode === 'live') {
      const b = buffers || { pressure: [], flow: [], temp: [], weight: [] };
      const elapsed = (last(b.pressure) || [0])[0] || 0;
      const tMax = tMaxLive(elapsed);
      setLine(line.pressTarget, targets && targets.pressure, V_PF, tMax, true);
      setLine(line.flowTarget, targets && targets.flow, V_PF, tMax, true);
      setLine(line.press, b.pressure, V_PF, tMax);
      setLine(line.flow, b.flow, V_PF, tMax);
      setLine(line.temp, b.temp, V_TEMP, tMax);
      setLine(line.weight, b.weight, V_WEIGHT, tMax);
      const lp = last(b.pressure), lf = last(b.flow), lt = last(b.temp), lw = last(b.weight);
      renderLabels([
        { color: 'var(--red)',   pair: lt, vmax: V_TEMP,   text: lt ? `${lt[1].toFixed(0)} °C` : null },
        { color: 'var(--green)', pair: lp, vmax: V_PF,     text: lp ? `${lp[1].toFixed(1)} Pressure` : null },
        { color: 'var(--amber)', pair: lw, vmax: V_WEIGHT, text: lw ? `${lw[1].toFixed(1)} g` : null },
        { color: 'var(--blue)',  pair: lf, vmax: V_PF,     text: lf ? `${lf[1].toFixed(1)} Flow` : null },
      ], tMax);
      renderPhases(livePhases, tMax);
      renderAxisX(tMax);
      return;
    }

    const v = view;
    if (!v) return;
    const tMax = Math.max(1, v.duration || 30);
    setLine(line.pressTarget, v.pressureTarget, V_PF, tMax, true);
    setLine(line.flowTarget, v.flowTarget, V_PF, tMax, true);
    setLine(line.press, v.pressure, V_PF, tMax);
    setLine(line.flow, v.flow, V_PF, tMax);
    setLine(line.temp, v.temp, V_TEMP, tMax);
    setLine(line.weight, mode === 'plan' ? null : v.weight, V_WEIGHT, tMax);

    const lp = last(v.pressure), lf = last(v.flow), lt = last(v.temp), lw = last(v.weight);
    const isShot = mode === 'shot';
    renderLabels([
      { color: 'var(--red)',   pair: lt, vmax: V_TEMP,   text: lt ? `${lt[1].toFixed(0)} °C` : null },
      { color: 'var(--green)', pair: lp, vmax: V_PF,     text: lp ? (isShot ? `${lp[1].toFixed(1)} Pressure` : 'Pressure') : null },
      { color: 'var(--amber)', pair: lw, vmax: V_WEIGHT, text: isShot && lw ? `${lw[1].toFixed(1)} g` : null },
      { color: 'var(--blue)',  pair: lf, vmax: V_PF,     text: lf ? (isShot ? `${lf[1].toFixed(1)} Flow` : 'Flow') : null },
    ], tMax);
    renderPhases(v.phases, tMax);
    renderAxisX(tMax);
  }

  const schedule = () => { dirty = true; if (rafId == null) rafId = requestAnimationFrame(draw); };
  // vistas estáticas são one-shot: renderiza já, sem depender de rAF (que o
  // navegador congela quando a tela do kiosk entra em throttle).
  const drawNow = () => { dirty = true; draw(); };

  return {
    el: root,

    /** curva planejada de um perfil: { duration, pressure, flow, temp, phases } */
    setThick,

    showPlan(profile) {
      mode = 'plan';
      setThick(false);
      view = profile ? { ...profile, weight: null, pressureTarget: null, flowTarget: null } : null;
      drawNow();
    },
    /** shot gravado: { duration, pressure, flow, temp, weight, phases? } */
    showShot(shot) {
      mode = 'shot';
      setThick(false);
      view = shot ? { pressureTarget: null, flowTarget: null, ...shot } : null;
      drawNow();
    },
    /** entra no modo ao vivo; `plan` (opcional) vira as linhas tracejadas de alvo */
    showLive(plan) {
      mode = 'live';
      setThick(true);
      targets = plan ? { pressure: plan.pressure, flow: plan.flow } : null;
      // rótulo da fase já numerado, como na tela 02 ("1 preinfusion")
      livePhases = plan && plan.phases && plan.phases.length
        ? plan.phases.map((ph, i) => ({ ...ph, label: `${i + 1} ${ph.label}` }))
        : null;
      schedule();
    },
    update(liveShot) { if (mode !== 'live') return; buffers = liveShot; schedule(); },
    setConfig(next) { Object.assign(cfg, next); if (mode === 'live') schedule(); else drawNow(); },
    resize() { invalidate(); drawNow(); },
    destroy() {
      if (rafId != null) cancelAnimationFrame(rafId);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', invalidate);
      host.innerHTML = '';
    },
  };
}

/** mini-gráfico (carrossel, card do último shot): só as polilinhas, sem eixos. */
export function miniChart(svg, series, { width = 300, height = 70, pad = 6 } = {}) {
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.innerHTML = '';
  const tMax = Math.max(1, series.duration || 30);
  const add = (pairs, vmax, color) => {
    if (!pairs || !pairs.length) return;
    const pts = pairs.map(([t, v]) =>
      `${(t / tMax * (width - pad * 2) + pad).toFixed(1)},${(height - pad - clamp(v / vmax, 0, 1) * (height - pad * 2)).toFixed(1)}`
    ).join(' ');
    svg.appendChild(svgEl('polyline', {
      points: pts, fill: 'none', stroke: color, 'stroke-width': 2.5,
      'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke',
    }));
  };
  add(series.pressure, V_PF, 'var(--green)');
  add(series.flow, V_PF, 'var(--blue)');
  if (series.weight && series.weight.length) add(series.weight, V_WEIGHT, 'var(--amber)');
  else add(series.temp, V_TEMP, 'var(--red)');
}
