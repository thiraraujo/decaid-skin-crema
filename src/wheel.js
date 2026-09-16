// CREMA v2 · roleta de valor — usada no Brew (temperatura) e no Grind (moagem).
//
// Os números acompanham o dedo: posição, tamanho e opacidade de cada item saem da
// distância até o centro, interpolados, então o movimento é contínuo (nada de pular de
// passo em passo). Ao soltar, desliza até encaixar e só então o valor vai para a máquina.
// Arrastar para a direita traz os MENORES para o centro — a lista anda junto com o dedo,
// como o carrossel de perfis.

const TAP_PX = 8;
const SNAP_MS = 160;

// tamanho e opacidade por distância do centro (|p| = 0, 1, 2, 3+)
const DEFAULT_LEVELS = [
  { size: 44, alpha: 1 },
  { size: 26, alpha: .35 },
  { size: 20, alpha: .15 },
  { size: 16, alpha: 0 },
];

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * @param {object} o
 *   zone      elemento que recebe o toque (bloco inteiro)
 *   items     elemento onde os números são desenhados
 *   field()   { min, max, step } efetivo no momento
 *   get()     valor atual (null = sem leitura da máquina)
 *   set(v)    aplica o valor na skin
 *   commit()  grava na máquina (só ao soltar)
 *   format(v) texto do número
 *   color(v, d) cor do item a `d` passos do centro
 *   slot      px de dedo por passo (padrão 64)
 *   visible   passos desenhados para cada lado (padrão 4)
 *   levels    tamanhos/opacidades por distância (padrão acima)
 *   onTap()   toque sem arrasto sobre o número central
 */
export function createWheel(o) {
  const slot = o.slot || 64;
  const visible = o.visible || 4;
  const levels = o.levels || DEFAULT_LEVELS;
  let offset = 0;                 // deslocamento do arrasto, em passos (fracionário)
  let startX = null, startVal = null, moved = false, anim = null;

  const scale = () => {
    const app = document.querySelector('.app');
    return (app ? app.getBoundingClientRect().width / 1320 : 1) || 1;
  };

  function levelAt(ap) {
    const i = Math.min(levels.length - 2, Math.floor(ap));
    const t = Math.min(1, ap - i);
    return {
      size: lerp(levels[i].size, levels[i + 1].size, t),
      alpha: lerp(levels[i].alpha, levels[i + 1].alpha, t),
    };
  }

  function layout(next = offset) {
    offset = next;
    for (const el of o.items.children) {
      const p = Number(el.dataset.d) + offset;
      const ap = Math.min(levels.length - 1, Math.abs(p));
      const { size, alpha } = levelAt(ap);
      el.style.transform = `translate(calc(-50% + ${(p * slot).toFixed(1)}px), -50%)`;
      el.style.fontSize = `${size.toFixed(1)}px`;
      el.style.opacity = alpha.toFixed(3);
      el.classList.toggle('is-center', Math.abs(p) < 0.5);
    }
  }

  function render() {
    const v = o.get();
    if (v == null || !Number.isFinite(Number(v))) {
      o.items.innerHTML = '<span class="is-center" data-d="0" style="color:var(--label)">—</span>';
      layout(0);
      return;
    }
    const f = o.field();
    const html = [];
    for (let d = -visible; d <= visible; d++) {
      const t = Number((Number(v) + d * f.step).toFixed(4));
      if (t < f.min || t > f.max) continue;
      html.push(`<span data-d="${d}" style="color:${o.color(t, d)}">${o.format(t)}</span>`);
    }
    o.items.innerHTML = html.join('');
    layout(0);
  }

  function animateTo(to, done) {
    const from = offset;
    const t0 = performance.now();
    let stopped = false;
    const finish = () => {
      if (stopped) return;
      stopped = true; anim = null;
      layout(to);
      if (done) done();
    };
    const step = (now) => {
      if (stopped) return;
      const k = Math.min(1, (now - t0) / SNAP_MS);
      layout(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step); else finish();
    };
    anim = { finish };
    requestAnimationFrame(step);
    setTimeout(finish, SNAP_MS + 120);   // a WebView do kiosk pode congelar o rAF
  }

  o.zone.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.stepper')) return;      // botões, quando existirem
    if (anim) anim.finish();
    const v = Number(o.get());
    if (!Number.isFinite(v)) { startVal = null; return; }
    startVal = v;
    startX = e.clientX;
    moved = false;
    try { o.zone.setPointerCapture(e.pointerId); } catch { /* segue sem captura */ }
  });

  o.zone.addEventListener('pointermove', (e) => {
    if (startX == null) return;
    const dx = (e.clientX - startX) / scale();
    if (!moved && Math.abs(dx) < TAP_PX) return;
    moved = true;
    const f = o.field();
    // limites da faixa (sinal invertido: arrastar para a direita diminui o valor)
    const lo = (startVal - f.max) / f.step;
    const hi = (startVal - f.min) / f.step;
    layout(Math.max(lo, Math.min(hi, dx / slot)));
  });

  const release = (e) => {
    if (startX == null) return;
    startX = null;
    try { o.zone.releasePointerCapture(e.pointerId); } catch {}
    if (!moved) {
      if (o.onTap && e.target.closest('.is-center')) o.onTap(e);
      return;
    }
    const f = o.field();
    const steps = Math.round(offset);
    const next = Math.min(f.max, Math.max(f.min, Number((startVal - steps * f.step).toFixed(4))));
    animateTo(steps, () => {
      o.set(next);
      if (o.commit) o.commit();
    });
  };
  o.zone.addEventListener('pointerup', release);
  o.zone.addEventListener('pointercancel', () => { if (startX != null) { startX = null; animateTo(0); } });

  return { render, layout };
}
