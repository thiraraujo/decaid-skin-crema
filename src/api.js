// CREMA · cliente do Bridge ReaPrime (REST + WebSocket, porta 8080).
// Mesma interface de mock.js. Detecção de host: window.__REA_HOST__ (WebView)
// → localStorage.reaHostname (padrão Streamline) → localhost:8080.

export function resolveHost() {
  // beacon do ReaPrime (v0.7.8+): window.REA_HOST. Pode ser string (host) ou boolean.
  const beacon = window.REA_HOST ?? window.__REA_HOST__;
  if (typeof beacon === 'string' && beacon) {
    return beacon.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
  const saved = localStorage.getItem('reaHostname');
  if (saved) return saved;
  // servida pelo app na porta 3000 → API no mesmo host, porta 8080
  if (location.hostname && location.port === '3000') return `${location.hostname}:8080`;
  return 'localhost:8080';
}

// há um Bridge real disponível? (escolhe api real vs mock)
// Sinais rápidos: __REA_HOST__ injetado pela WebView, reaHostname salvo, ou skin servida
// pelo app na porta 3000. Caso contrário, faz um probe curto no Bridge (localhost:8080).
export async function detectHost() {
  if (window.REA_HOST || window.__REA_HOST__ || localStorage.getItem('reaHostname') || location.port === '3000') return true;
  try {
    const c = new AbortController();
    const to = setTimeout(() => c.abort(), 900);
    const r = await fetch(`http://${resolveHost()}/api/v1/machine/state`, { signal: c.signal, cache: 'no-store' });
    clearTimeout(to);
    return r.ok;
  } catch {
    return false;
  }
}

export function createApiSource() {
  const host = resolveHost();
  const httpBase = `http://${host}`;
  const wsBase = `ws://${host}`;

  const snapshotCbs = new Set();
  const scaleCbs = new Set();
  const startCbs = new Set();
  const endCbs = new Set();
  const waterCbs = new Set();
  const deviceCbs = new Set();
  const sockets = [];

  // ciclo de vida do shot, derivado do estado da máquina.
  // usa o relógio do cliente para o tempo relativo (robusto a jitter do timestamp).
  let running = false;
  let shotStart = 0;

  function openWS(path, onMessage) {
    const ws = new WebSocket(`${wsBase}/ws/v1${path}`);
    ws.onmessage = (e) => {
      try { onMessage(JSON.parse(e.data)); } catch { /* ignora frames malformados */ }
    };
    // NÃO reconectar em erro (o Bridge mantém o socket aberto entre erros).
    sockets.push(ws);
    return ws;
  }

  return {
    kind: 'bridge',
    host,

    onSnapshot(cb) { snapshotCbs.add(cb); return () => snapshotCbs.delete(cb); },
    onScale(cb) { scaleCbs.add(cb); return () => scaleCbs.delete(cb); },
    onWaterLevels(cb) { waterCbs.add(cb); return () => waterCbs.delete(cb); },
    onDevices(cb) { deviceCbs.add(cb); return () => deviceCbs.delete(cb); },
    onShotStart(cb) { startCbs.add(cb); return () => startCbs.delete(cb); },
    onShotEnd(cb) { endCbs.add(cb); return () => endCbs.delete(cb); },

    start() {
      // /machine/snapshot (~10Hz): pressure, flow, temps, state, profileFrame.
      // Dispara SEMPRE (idle ou shot) → cards de telemetria ao vivo. O flag `running`
      // diz se há um shot ativo (estado 'espresso'); só então alimenta o gráfico ao vivo.
      let gotSnap = false;
      openWS('/machine/snapshot', (m) => {
        if (!gotSnap) { gotSnap = true; console.info('[CREMA] 1º snapshot da máquina', m && m.state); }
        const st = m.state || {};
        const isRunning = st.state === 'espresso';
        if (isRunning && !running) { running = true; shotStart = performance.now(); for (const cb of startCbs) cb(); }
        if (!isRunning && running) { running = false; for (const cb of endCbs) cb(); }
        const t = running ? (performance.now() - shotStart) / 1000 : 0;
        for (const cb of snapshotCbs) {
          cb({
            t,
            running,
            state: st.state || 'idle',
            substate: st.substate || '',
            pressure: m.pressure ?? 0,
            flow: m.flow ?? 0,
            mixTemp: m.mixTemperature ?? 0,
            groupTemp: m.groupTemperature ?? 0,
            targetMixTemp: m.targetMixTemperature ?? null,
            targetGroupTemp: m.targetGroupTemperature ?? null,
            temp: m.mixTemperature ?? 0,
            frame: Number.isInteger(m.profileFrame) ? m.profileFrame : null,
          });
        }
      });
      // /scale/snapshot emite DOIS tipos de frame (websocket_v1.yml):
      //   ScaleStatus   {"status":"connected"|"disconnected"} — ao abrir e a cada
      //                 mudança de estado de conexão;
      //   ScaleSnapshot {timestamp, weight, weightFlow, battery, timerValue} — só
      //                 enquanto há balança conectada.
      // Tratar os dois como um só zerava o peso a cada frame de status.
      // O socket fica aberto entre conexões: não reconectar quando cai.
      openWS('/scale/snapshot', (m) => {
        if (typeof m.status === 'string') {
          for (const cb of scaleCbs) cb({ kind: 'status', connected: m.status === 'connected' });
          return;
        }
        if (m.weight == null) return;
        for (const cb of scaleCbs) {
          cb({
            kind: 'weight',
            connected: true,
            weight: m.weight,
            weightFlow: m.weightFlow ?? null,
            battery: m.battery ?? null,
          });
        }
      });

      // /devices: é a ÚNICA fonte confiável de estado de conexão — os sockets de
      // telemetria ficam abertos mesmo com a máquina fora, então ausência de
      // frame não prova desconexão (doc/Skins.md § Machine Telemetry Socket
      // Lifecycle). Traz também os erros de BLE já classificados por `kind`.
      openWS('/devices', (m) => {
        if (!m || !Array.isArray(m.devices)) return;
        const find = (t) => m.devices.find((d) => d.type === t) || null;
        for (const cb of deviceCbs) {
          cb({
            machine: find('machine'),
            scale: find('scale'),
            scanning: !!m.scanning,
            phase: (m.connectionStatus && m.connectionStatus.phase) || null,
            error: (m.connectionStatus && m.connectionStatus.error) || null,
          });
        }
      });

      // /machine/waterLevels: nível do tanque em MILÍMETROS + limiar de recarga.
      // (o REST não expõe isso — só este canal; ver websocket_v1.yml)
      openWS('/machine/waterLevels', (m) => {
        for (const cb of waterCbs) {
          cb({ currentLevel: m.currentLevel ?? null, refillLevel: m.refillLevel ?? null });
        }
      });
    },

    stop() {
      for (const ws of sockets) { try { ws.close(); } catch {} }
      sockets.length = 0;
    },

    // wake-lock via /display (essencial p/ kiosk)
    requestWakeLock() {
      const ws = openWS('/display', () => {});
      ws.onopen = () => ws.send(JSON.stringify({ command: 'requestWakeLock' }));
    },

    // --- REST helpers (usados nos milestones seguintes) ---
    getWorkflow() {
      return fetch(`${httpBase}/api/v1/workflow`).then((r) => r.json());
    },
    putWorkflow(workflow) {
      return fetch(`${httpBase}/api/v1/workflow`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflow),
      });
    },
    setMachineState(newState) {
      return fetch(`${httpBase}/api/v1/machine/state/${newState}`, { method: 'PUT' });
    },
    // info da máquina (model, serial, GHC). GHC=false → sem botão físico → mostrar Espresso na tela.
    getMachineInfo() {
      return fetch(`${httpBase}/api/v1/machine/info`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    },

    // Balança: o botão CONNECT força a conexão BT na hora.
    // Se a balança já é conhecida (apareceu num scan anterior), PUT /devices/connect
    // conecta direto; senão, /devices/scan?connect=true varre e preenche o slot.
    getDevices() {
      return fetch(`${httpBase}/api/v1/devices`)
        .then((r) => (r.ok ? r.json() : []))
        .then((a) => (Array.isArray(a) ? a : []))
        .catch(() => []);
    },
    async connectScale() {
      const devices = await this.getDevices();
      const scale = devices.find((d) => d.type === 'scale' && d.state !== 'connected');
      if (scale) {
        // O resultado é estruturado (DeviceConnectResult): a doc manda usar
        // `outcome`/`state` em vez de inferir sucesso por HTTP ou pelos frames
        // seguintes. 409 = conflito ou dispositivo de inventário.
        const r = await fetch(`${httpBase}/api/v1/devices/connect`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: scale.id }),
        }).catch((e) => { console.warn('[CREMA] falha ao conectar balança', e); return null; });
        const result = r ? await r.json().catch(() => null) : null;
        if (result && (result.outcome === 'connected' || result.outcome === 'alreadyConnected')) return true;
        if (result) console.warn('[CREMA] connect:', result.outcome, result.error || '', result.connectionError || '');
      }
      const r = await fetch(`${httpBase}/api/v1/devices/scan?connect=true&quick=false`)
        .catch((e) => { console.warn('[CREMA] falha no scan de dispositivos', e); return null; });
      return !!(r && r.ok);
    },
    tareScale() {
      return fetch(`${httpBase}/api/v1/scale/tare`, { method: 'PUT' })
        .catch((e) => console.warn('[CREMA] falha ao tarar balança', e));
    },

    // lista de perfis (GET /api/v1/profiles) → biblioteca da skin.
    // Busca robusta: pega os visíveis e (se pedido) os ocultos em chamadas separadas,
    // marcando o flag `hidden` explicitamente. Assim não dependemos de um único parâmetro.
    getProfiles(includeHidden = false) {
      const fetchVis = (v) => fetch(`${httpBase}/api/v1/profiles?visibility=${v}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((list) => (Array.isArray(list) ? list : list.items || []))
        .catch(() => []);
      if (!includeHidden) {
        return fetchVis('visible').then((v) => v.map(mapProfileRecord));
      }
      return Promise.all([fetchVis('visible'), fetchVis('hidden')]).then(([vis, hid]) => {
        const seen = new Set(); const out = [];
        for (const r of vis) { const p = { ...mapProfileRecord(r), hidden: false }; if (!seen.has(p.key)) { seen.add(p.key); out.push(p); } }
        for (const r of hid) { const p = { ...mapProfileRecord(r), hidden: true }; if (!seen.has(p.key)) { seen.add(p.key); out.push(p); } }
        return out;
      }).catch((e) => { console.warn('[CREMA] falha ao listar perfis', e); return []; });
    },
    // mostra/oculta um perfil na máquina (PUT /api/v1/profiles/{id}/visibility).
    // A API espera { visibility: 'visible'|'hidden'|'deleted' } — NÃO { visible: bool }.
    // (perfis default só podem ser 'hidden', nunca 'deleted'.)
    setProfileVisibility(id, visible) {
      return fetch(`${httpBase}/api/v1/profiles/${id}/visibility`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: visible ? 'visible' : 'hidden' }),
      }).catch((e) => console.warn('[CREMA] falha ao mudar visibilidade', e));
    },
    // histórico de shots (GET /api/v1/shots) — ShotRecordSummary (sem measurements).
    // título/café/dose vêm de workflow.{profile,context}; dose/yield reais de annotations.
    getShots() {
      return fetch(`${httpBase}/api/v1/shots?limit=8`)
        .then((r) => r.json())
        .then((d) => {
          const items = Array.isArray(d) ? d : (d.items || []);
          return items.map((s) => {
            const wf = s.workflow || {};
            const ctx = wf.context || s.context || {};
            const ann = s.annotations || {};
            const ex = ann.extras || {};              // correções de café/moedor moram aqui
            const prof = wf.profile || {};
            return {
              id: s.id,
              profile: prof.title || s.profileTitle || 'Shot',
              ts: fmtTs(s.timestamp),
              duration: s.durationSeconds ?? null,          // vem dos measurements ao abrir
              coffee: ex.coffeeName || ctx.coffeeName || ctx.coffee || s.coffeeName || '',
              brand: ex.coffeeRoaster || ctx.coffeeRoaster || '',
              grinder: ex.grinderModel || ctx.grinderModel || '',
              dose: ann.actualDoseWeight ?? ctx.targetDoseWeight ?? s.dose,
              yield: ann.actualYield ?? ctx.targetYield ?? s.yield,
              grind: ex.grinderSetting ?? ctx.grinderSetting ?? ctx.grindSetting ?? s.grinderSetting,
              finalWeight: ann.actualYield ?? s.finalWeight,  // gramas reais (annotations)
              notes: ann.espressoNotes || '',
              rating: ann.enjoyment ?? null,
            };
          });
        })
        .catch((e) => { console.warn('[CREMA] falha ao listar shots', e); return []; });
    },
    // shot completo com measurements (GET /api/v1/shots/{id}) → séries do gráfico
    getShot(id) {
      return fetch(`${httpBase}/api/v1/shots/${encodeURIComponent(id)}`)
        .then((r) => { if (!r.ok) { console.warn('[CREMA] GET shot HTTP', r.status, id); return null; } return r.json(); })
        .then((j) => (j ? mapShotMeasurements(j) : null))
        .catch((e) => { console.warn('[CREMA] falha ao carregar shot', e); return null; });
    },
    // histórico amplo p/ o navegador por café. Correções de café/moedor moram em
    // annotations.extras (o workflow do shot é imutável); por isso extras vem primeiro.
    getShotHistory(limit = 60) {
      return fetch(`${httpBase}/api/v1/shots?limit=${limit}`)
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((d) => {
          const items = Array.isArray(d) ? d : (d.items || []);
          return items.map((s) => {
            const wf = s.workflow || {};
            const ctx = wf.context || {};
            const ann = s.annotations || {};
            const ex = ann.extras || {};
            return {
              id: s.id,
              ts: fmtTs(s.timestamp),
              rawTs: s.timestamp,
              profile: (wf.profile && wf.profile.title) || 'Shot',
              coffee: ex.coffeeName || ctx.coffeeName || '',
              brand: ex.coffeeRoaster || ctx.coffeeRoaster || '',
              grinder: ex.grinderModel || ctx.grinderModel || '',
              grind: ex.grinderSetting ?? ctx.grinderSetting ?? null,
              dose: ann.actualDoseWeight ?? ctx.targetDoseWeight ?? null,
              yield: ann.actualYield ?? ctx.targetYield ?? null,
            };
          });
        })
        .catch((e) => { console.warn('[CREMA] falha ao carregar histórico', e); return []; });
    },
    // cafés e moedores cadastrados (biblioteca)
    getBeans() {
      return fetch(`${httpBase}/api/v1/beans`).then((r) => (r.ok ? r.json() : []))
        .then((a) => (Array.isArray(a) ? a : (a.items || []))).catch(() => []);
    },
    getGrinders() {
      return fetch(`${httpBase}/api/v1/grinders`).then((r) => (r.ok ? r.json() : []))
        .then((a) => (Array.isArray(a) ? a : (a.items || []))).catch(() => []);
    },
    // aplica café/moedor/moagem como "próximo shot" (PUT /workflow { context })
    applyContext(ctx) {
      return fetch(`${httpBase}/api/v1/workflow`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: ctx }),
      }).catch((e) => console.warn('[CREMA] falha ao aplicar contexto', e));
    },
    // cadastra café (POST /beans — exige roaster+name) e moedor (POST /grinders — exige model+settingType)
    addBean(data) {
      return fetch(`${httpBase}/api/v1/beans`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      }).then((r) => (r.ok ? r.json() : null)).catch((e) => { console.warn('[CREMA] falha ao criar café', e); return null; });
    },
    addGrinder(data) {
      return fetch(`${httpBase}/api/v1/grinders`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settingType: 'numeric', ...data }),
      }).then((r) => (r.ok ? r.json() : null)).catch((e) => { console.warn('[CREMA] falha ao criar moedor', e); return null; });
    },
    // edita um shot passado (PUT /shots/{id}) — só annotations são gravadas.
    // Correções de café/moedor/moagem vão em annotations.extras (workflow é imutável).
    updateShotAnnotations(id, annotations) {
      return fetch(`${httpBase}/api/v1/shots/${encodeURIComponent(id)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ annotations }),
      }).then((r) => r.ok).catch((e) => { console.warn('[CREMA] falha ao editar shot', e); return false; });
    },
  };
}

// ---- mapeadores REST → modelo da skin ----
function fmtTs(iso) {
  const d = iso ? new Date(iso) : new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// perfil v2 (steps) → curvas planejadas + fases da skin.
// Cada step vira um patamar: pressão/fluxo/temperatura constantes durante `seconds`.
export function profileToPlan(pr) {
  const steps = (pr && pr.steps) || [];
  const pressure = [], flow = [], temp = [], phases = [];
  let t = 0;
  for (const s of steps) {
    const dur = s.seconds ?? s.duration ?? 10;
    const p0 = s.pressure ?? (pressure.length ? pressure[pressure.length - 1][1] : 0);
    const f0 = s.flow ?? (flow.length ? flow[flow.length - 1][1] : 0);
    const tp = s.temperature ?? (pr && pr.tank_temperature) ?? 90;
    pressure.push([t, p0]); pressure.push([t + dur, p0]);
    if (s.flow != null) { flow.push([t, f0]); flow.push([t + dur, f0]); }
    temp.push([t, tp]); temp.push([t + dur, tp]);
    phases.push({ start: t, end: t + dur, label: s.name || `Step ${phases.length + 1}` });
    t += dur;
  }
  return {
    duration: t || 30,
    pressure, flow: flow.length ? flow : null, temp,
    phases: phases.length > 1 ? phases : [],
  };
}

function mapProfileRecord(rec) {
  const pr = rec.profile || rec;
  const plan = profileToPlan(pr);
  return {
    key: rec.id || pr.title,
    id: rec.id || null,
    name: pr.title || 'Profile',
    type: pr.beverage_type === 'espresso' ? 'Advanced' : (pr.beverage_type || 'Profile'),
    ...plan,
    hidden: rec.hidden === true || rec.isHidden === true || rec.visibility === 'hidden'
      || !!(rec.metadata && rec.metadata.hidden),
    raw: pr,
  };
}

// measurements → séries {pressure,flow,temp,weight} relativas ao início.
// Robusto: sample nested (machine/scale) OU flat; timestamp ISO, epoch(ms) ou relativo.
function tsSeconds(m) {
  const mt = m.machine || m;
  const ts = mt.timestamp ?? mt.time ?? m.timestamp;
  if (typeof ts === 'number') return ts > 1e6 ? ts / 1000 : ts;   // epoch ms → s
  const p = Date.parse(ts);
  return isNaN(p) ? 0 : p / 1000;
}
function mapShotMeasurements(shot) {
  if (!shot) return null;
  const ms = shot.measurements || shot.samples || shot.data || [];
  if (!ms.length) { console.warn('[CREMA] shot sem measurements', shot && Object.keys(shot)); return null; }
  const pressure = [], flow = [], temp = [], weight = [];
  const t0 = tsSeconds(ms[0]);
  for (const m of ms) {
    const mt = m.machine || m;
    const sc = m.scale || {};
    const t = tsSeconds(m) - t0;
    pressure.push([t, mt.pressure ?? 0]);
    flow.push([t, mt.flow ?? 0]);
    temp.push([t, mt.mixTemperature ?? mt.groupTemperature ?? 0]);
    weight.push([t, sc.weight ?? m.weight ?? 0]);
  }
  const dur = pressure.length ? pressure[pressure.length - 1][0] : 30;
  const pr = shot.workflow && shot.workflow.profile;
  const title = (pr && pr.title) || shot.profileTitle || 'Shot';
  // o próprio shot carrega o perfil com que foi tirado → plano (tracejado) e fases
  const plan = pr ? profileToPlan(pr) : null;
  const brewTemp = plan && plan.temp && plan.temp.length ? plan.temp[0][1] : null;
  return {
    kind: 'shot', profile: title, duration: dur || 30, brewTemp,
    pressure, flow, temp, weight,
    pressureTarget: plan ? plan.pressure : null,
    flowTarget: plan ? plan.flow : null,
    phases: plan ? plan.phases : [],
  };
}
