// CREMA v2 · arrastar um valor com o dedo (moagem na home e no Edit do histórico).
//
// A área de arrasto é um bloco inteiro — número + régua —, não só a régua: no tablet da
// máquina é difícil acertar uma faixa fina. Um toque sem arrastar não muda nada e chama
// `onTap` (é assim que o número abre o teclado). Sem valor de partida (a máquina ainda
// não informou a moagem) o arrasto não faz nada — era daí que saía o "NaN" na tela.

const TAP_PX = 8;
const PX_PER_STEP = 7;     // um tique fino da régua = um passo (o.pxPerStep sobrescreve)

/** posiciona os tiques da régua conforme o valor */
export function placeRulerAt(el, value, step) {
  if (!el || value == null || !Number.isFinite(Number(value))) return;
  const offset = (Number(value) / step) * PX_PER_STEP;
  el.style.backgroundPositionX = `${-offset % 35}px, ${-offset % 35}px`;
}

export function clampStep(v, f) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const snapped = Math.round(n / f.step) * f.step;
  return Math.min(f.max, Math.max(f.min, Number(snapped.toFixed(4))));
}

/**
 * @param {HTMLElement} el   bloco que recebe o arrasto
 * @param {object} o  { field(): {step,min,max}, get(), set(v), commit(), onTap(e),
 *                      pxPerStep?: px de dedo por passo }
 */
export function bindValueDrag(el, o) {
  if (!el) return;
  let startX = 0, startVal = null, active = false, moved = false, f = null;

  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.stepper')) return;      // − / + têm o próprio clique
    const v = o.get();
    startVal = Number.isFinite(Number(v)) ? Number(v) : null;
    active = true;
    moved = false;
    startX = e.clientX;
    f = o.field();
    // captura mantém o arrasto vivo se o dedo sair do bloco; falha em ponteiros
    // sintéticos (testes) e não deve derrubar o gesto
    try { el.setPointerCapture(e.pointerId); } catch { /* segue sem captura */ }
  });

  el.addEventListener('pointermove', (e) => {
    if (!active) return;
    // o canvas é escalado por transform: converte px de tela → px de layout
    const app = document.querySelector('.app');
    const scale = app ? app.getBoundingClientRect().width / 1320 : 1;
    const dx = (e.clientX - startX) / (scale || 1);
    if (!moved && Math.abs(dx) < TAP_PX) return;
    moved = true;
    if (startVal == null) return;
    const px = o.pxPerStep || PX_PER_STEP;
    const next = clampStep(startVal + Math.round(dx / px) * f.step, f);
    if (Number.isFinite(next) && next !== Number(o.get())) o.set(next);
  });

  const end = (e) => {
    if (!active) return;
    active = false;
    try { el.releasePointerCapture(e.pointerId); } catch {}
    if (!moved) { if (o.onTap) o.onTap(e); return; }
    if (o.commit) o.commit();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}
