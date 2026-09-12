// CREMA v2 · prontidão da máquina — READY / HEATING / NOT HEATING / SLEEPING / NO WATER.
//
// Não basta olhar `state`: a DE1 só passa por `heating` num instante ao acordar e
// volta a reportar `idle` enquanto o grupo ainda sobe — era por isso que a skin
// mostrava READY com a máquina esquentando. O snapshot traz as temperaturas e os
// alvos (`targetMixTemperature` / `targetGroupTemperature`), e é deles que sai a
// resposta.
//
// O modelo abaixo é portado da skin Bestpresso (xinghendri/bestpresso,
// src/api/decaid/readiness.ts), que já roda em máquina real — inclusive a folga
// de 8 °C: a DE1 ociosa fica abaixo do alvo, e uma tolerância apertada deixaria a
// pílula piscando.

const NOT_HEATING_BELOW_C = 70;        // abaixo disso e sem subir = aquecedores desligados
const READY_TARGET_TOLERANCE_C = 8;    // folga aceita em relação ao alvo
const TEMPERATURE_RISE_C = 0.3;        // subida que conta como "está aquecendo"
const RISING_MEMORY_MS = 5000;         // por quanto tempo uma subida ainda vale
const NOT_HEATING_OBSERVATION_MS = 10000;

const HEATING_STATES = new Set(['booting', 'busy', 'heating', 'preheating']);
const READY_STATES = new Set(['idle', 'schedidle', 'ready']);
const OPERATION_STATES = new Set(['espresso', 'hotwater', 'flush', 'steam', 'steamrinse', 'cleaning', 'descaling', 'calibration', 'selftest', 'airpurge']);
const NOT_HEATING_STATES = new Set(['notheating', 'noheat', 'poweredoff']);
const NOT_HEATING_SUBSTATES = new Set(['errornoac']);

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

function readings(snap) {
  const out = [];
  const add = (sensor, current, target) => {
    if (!finite(current)) return;
    const t = finite(target) ? target : undefined;
    out.push({ sensor, current, target: t, gap: t === undefined ? undefined : t - current });
  };
  add('mix', snap.mixTemp, snap.targetMixTemp);
  add('group', snap.groupTemp, snap.targetGroupTemp);
  return out;
}

function withinReadyBand(snap) {
  const all = readings(snap);
  const targeted = all.filter((r) => r.target !== undefined && r.target > 0);
  if (targeted.length) return targeted.every((r) => r.gap <= READY_TARGET_TOLERANCE_C);
  return all.length > 0 && all.every((r) => r.current >= NOT_HEATING_BELOW_C);
}

/** rastreador com memória — precisa ver a série para distinguir "frio parado" de "aquecendo" */
export function createReadinessTracker() {
  let thermal = null;        // 'ready' | 'heating' | 'notHeating'
  let operation = null;
  let lowest = {};           // menor temperatura vista por sensor
  let lastRiseAt = null;
  let coldSince = null;

  const commit = (v) => { thermal = v; return v; };

  function observe(snap, now) {
    const rs = readings(snap);
    const seen = new Set();
    let rose = false;
    for (const r of rs) {
      seen.add(r.sensor);
      if (lowest[r.sensor] === undefined) { lowest[r.sensor] = r.current; continue; }
      lowest[r.sensor] = Math.min(lowest[r.sensor], r.current);
      if (r.current >= lowest[r.sensor] + TEMPERATURE_RISE_C) { rose = true; lowest[r.sensor] = r.current; }
    }
    for (const s of ['mix', 'group']) if (!seen.has(s)) delete lowest[s];

    if (rose) lastRiseAt = now;
    const rising = lastRiseAt !== null && now - lastRiseAt <= RISING_MEMORY_MS;
    const coldest = rs.length ? Math.min(...rs.map((r) => r.current)) : undefined;
    const cold = coldest !== undefined && coldest < NOT_HEATING_BELOW_C;

    if (cold && !rising) coldSince = coldSince ?? now;
    else coldSince = null;

    return { rising, stalledCold: cold && coldSince !== null && now - coldSince >= NOT_HEATING_OBSERVATION_MS };
  }

  return {
    reset() { thermal = null; operation = null; lowest = {}; lastRiseAt = null; coldSince = null; },

    /** @returns {'ready'|'heating'|'notHeating'|'sleeping'|'noWater'|'disconnected'} */
    evaluate(snap, now = Date.now()) {
      const state = (snap.state || '').toLowerCase();
      const substate = (snap.substate || '').toLowerCase();

      if (state === 'disconnected') { operation = null; return 'disconnected'; }
      if (state === 'sleeping') { operation = null; return 'sleeping'; }
      if (state === 'needswater') { operation = null; return 'noWater'; }

      const signalsReady = READY_STATES.has(state) && substate !== 'preparingforshot';
      const signalsHeating = HEATING_STATES.has(state) || substate === 'preparingforshot';
      const signalsNotHeating = NOT_HEATING_STATES.has(state) || NOT_HEATING_SUBSTATES.has(substate);

      if (signalsNotHeating) { operation = null; return commit('notHeating'); }
      if (state === 'error') { operation = null; return thermal ?? commit('heating'); }

      // durante uma operação (shot, vapor, flush…) mantém o que já era, para a
      // pílula não oscilar por causa da queda de temperatura do próprio uso
      if (OPERATION_STATES.has(state)) {
        operation = operation ?? (thermal === 'ready' ? 'ready' : 'heating');
        return commit(operation);
      }
      operation = null;

      const temp = observe(snap, now);

      if (signalsReady && withinReadyBand(snap)) {
        lowest = {}; lastRiseAt = null; coldSince = null;
        return commit('ready');
      }
      if (temp.stalledCold) return commit('notHeating');
      if (signalsHeating || temp.rising) return commit('heating');
      if (signalsReady) return commit('heating');
      return thermal ?? commit('heating');
    },
  };
}
