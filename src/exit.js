// CREMA v2 · por que a fase terminou.
//
// A API NÃO grava isso: o campo não existe em rest_v1.yml. A Bestpresso também
// infere ("App-owned data contract, not a speculative Decaid API schema",
// src/features/brew/stageMoveOn.ts) e escreve "Unknown" quando não dá para afirmar.
// Aqui vale o mesmo: cruzamos a configuração do step com o que a telemetria mostrou
// e, na dúvida, não inventamos.
//
// A ÚLTIMA fase é a exceção: aí existe dado gravado de verdade — ShotRecord.stopReason.

const fmt = (v) => {
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
};

// stopReason é conjunto ABERTO (rest_v1.yml): valor desconhecido vira texto legível
const STOP_LABELS = {
  targetWeight: 'Target weight reached',
  targetVolume: 'Target volume reached',
  apiStop: 'Stopped manually',
  appStop: 'Stopped manually',
  machineEnded: 'Profile ended',
  profileAdvance: 'Skipped forward',
  profileSkip: 'Step skipped',
  noScale: 'No scale',
  error: 'Machine error',
  disconnected: 'Connection lost',
};

export function stopLabel(reason) {
  if (!reason) return 'Shot ended';
  return STOP_LABELS[reason]
    || reason.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

/**
 * @param {object|null} step  step do perfil com que o shot correu (seconds, exit, weight)
 * @param {object} ph         { start, end, pressEnd, flowEnd, yieldEnd }
 * @param {object} [o]        { isLast, stopReason, tolerance }
 * @returns {string|null}     texto curto, ou null quando não dá para afirmar
 */
export function exitLabel(step, ph, o = {}) {
  if (o.isLast) return stopLabel(o.stopReason);
  if (!step || !ph) return null;

  // 1) condição de saída do perfil, batida no último valor medido da fase
  const ex = step.exit;
  if (ex && (ex.type === 'pressure' || ex.type === 'flow') && Number(ex.value) > 0) {
    const value = Number(ex.value);
    const read = ex.type === 'pressure' ? ph.pressEnd : ph.flowEnd;
    const over = ex.condition === 'over';
    if (Number.isFinite(read) && (over ? read >= value : read <= value)) {
      const unit = ex.type === 'pressure' ? 'bar' : 'ml/s';
      const name = ex.type === 'pressure' ? 'Pressure' : 'Flow';
      return `${name} ${over ? '>' : '<'} ${fmt(value)} ${unit}`;
    }
  }

  // 2) limite de tempo do step — a fronteira da fase tem a folga de uma amostra
  const seconds = Number(step.seconds);
  const dur = ph.end - ph.start;
  if (seconds > 0 && Math.abs(dur - seconds) <= (o.tolerance ?? 0.7)) {
    // sem repetir o número: a fronteira da fase tem a folga de uma amostra, então o
    // limite configurado (5 s) e a duração exibida no card (00:04) não batem sempre
    return 'Time limit reached';
  }

  // 3) peso alvo do step (só com balança: sem peso medido não afirmamos nada)
  const weight = Number(step.weight);
  if (weight > 0 && Number.isFinite(ph.yieldEnd) && ph.yieldEnd >= weight) {
    return 'Stage yield reached';
  }

  return null;   // volume de etapa e saídas do firmware que não dá para reconstruir
}

export const UNKNOWN_EXIT = 'Exit unknown';
