# CREMA v2 — skin "Editorial Cool" para a Decent DE1

Skin web (HTML/CSS/JS, sem bundler) para o app **Decaid** / bridge **ReaPrime**.
Redesign completo da v1: antes do shot, a tela lê de um golpe **Café · Moedor · Grind ·
Ratio · Brew** e o plano do perfil; durante o shot, **o gráfico toma a tela**.

> 📐 **Handoff de design:** `docs/handoff-v2/` (11 telas) e `docs/handoff-shot-live/`
> (tela 02 redesenhada) no repo de trabalho — o `README.md` de cada pacote é a
> especificação e os `.dc.html` abrem no navegador.

## Linhas de versão

| Branch | O que é |
|---|---|
| `main` | o que a máquina instala hoje — segue na v1 até a v2 ficar pronta |
| `v1` · tag `v0.2.2` | congelamento da versão anterior ao redesign |
| `v2` | **este redesign** — instale por aqui para testar na máquina |

Decaid → **Skins → Install from GitHub branch** → `thiraraujo/decaid-skin-crema`,
branch `v2`. As atualizações chegam por *Check for updates* (ETag).

## Telas

| # | Tela | Onde mora |
|---|---|---|
| 01 | Home (idle) | `index.html` + `src/ui.js` |
| 02 | Shot ao vivo | `src/live.js` (`#live` + gráfico próprio) |
| 03 | Adjustments (flush / água / vapor) | `src/screens.js` |
| 04 | Teclado numérico | `src/numpad.js` |
| 05/06 | Coffee & Grinder (selecionar / criar) | `src/screens.js` |
| 07/08 | Shot history (+ filtro por café) | `src/history.js` |
| 09 | Coffee history (busca) | `src/history.js` |
| 10 | Edit shot | `src/history.js` |
| 11 | Estados da máquina (pílula) | `.state-pill` em `css/main.css` |
| — | Perfis (favoritos, categorias, busca) | `src/profiles.js` |

**Tela de Perfis** (`✎ perfis` no topo da home) em `src/profiles.js`: favoritos à esquerda
(reordenar e remover), filtros por categoria, lista de **todos** os perfis da máquina
(73 no Bridge de teste) com busca, e prévia com a curva planejada, as notas do perfil e
duas ações — ★ favoritar e ☕ usar agora (entra no carrossel e vai para a máquina).

As categorias saem do próprio título, que o Decaid escreve como `Categoria/Nome`
(`Pour over basket/V60 22g in, 375g out`, `D-Flow / default`).

Dose, Drink e Brew usam presets em botão redondo (18/20/22 g · 36/40/45 g · 88/92/95 °C);
o toque no número abre o teclado para valores fora da lista. O Grind mantém a régua.

A tela 02 mostra um bloco por fase do perfil conforme o shot avança (Yield / Temp /
Pressure / Flow por fase). As fases vêm dos steps do perfil; a fase corrente, de
`profileFrame` no snapshot — sem esse campo, dos tempos planejados.

No histórico, **Apply** copia café, moedor, moagem, dose e drink do shot para a tela
principal (e para o workflow da máquina); **Edit** corrige os dados daquele shot.

## Estrutura

```
index.html          canvas fixo 1320×800 + markup da home
manifest.json       id/name/version/author/repository/entry (lido pelo Decaid)
css/                tokens.css · main.css (home) · screens.css (gráfico, telas, modais)
src/
  main.js           bootstrap: escolhe Bridge real vs mock e liga estado → telas
  api.js            cliente REST + WebSocket do ReaPrime + detecção de host
  mock.js           fonte simulada — só sem Bridge, ou com `?mock=1`
  chart.js          gráfico (plan / shot / live) + miniChart()
  store.js          estado (recipe · profiles · machine · aux · history)
  ui.js             home: receita, réguas, carrossel, rodapé, shot ao vivo
  numpad.js         teclado numérico reutilizável
  screens.js        Adjustments · Coffee & Grinder · favoritos
  history.js        histórico, busca por café e edição de shot
  host.js           ações do app host (sleep, Settings nativo)
assets/fonts/       Hanken Grotesk + IBM Plex Mono (offline/kiosk)
```

## Integração com o Bridge (ReaPrime, porta 8080)

Detecção de host em `src/api.js`: `window.REA_HOST` → `localStorage.reaHostname` →
`localhost:8080`. Sem host, cai no `mock.js`.

| Canal | Uso |
|---|---|
| WS `/ws/v1/machine/snapshot` | gráfico ao vivo, Mix/Group, estado da máquina |
| WS `/ws/v1/scale/snapshot` | peso, fluxo gravimétrico e status da balança |
| WS `/ws/v1/machine/waterLevels` | nível do tanque (mm) e limiar de recarga |
| WS `/ws/v1/display` | wake-lock (tela sempre acesa) |
| `GET /profiles` | carrossel de favoritos e curvas planejadas |
| `GET /shots` · `GET /shots/{id}` | histórico e curvas do shot |
| `PUT /shots/{id}` | editar shot passado (`annotations.extras`) |
| `GET/POST /beans` · `/grinders` | biblioteca Café & Moedor |
| `PUT /workflow` | dose, drink, café, moedor, moagem, flush, água e vapor |
| `PUT /machine/state/{state}` | STOP, Sleep e acordar (o shot é disparado pelo GHC) |
| `GET /devices` · `PUT /devices/connect` · `GET /devices/scan` | botão CONNECT da balança |
| `PUT /scale/tare` | botão TARE |
| `GET /plugins` | descobre o plugin de Settings do app |

A pílula de estado lê `state.state` do snapshot e mapeia o enum `MachineState`:
`idle` e os estados de trabalho → **READY** (verde), `heating`/`booting`/`preheating` →
**HEATING** (âmbar), `sleeping`/`error`/`needsWater`/sem conexão → vermelho (com o texto
próprio de cada um).

**Regra de ouro:** com Bridge conectado a skin **nunca** usa mock. Sem dado real,
mostra `—`.

Ao abrir, a skin **lê** `GET /workflow` e monta a receita a partir do que já está
carregado na máquina (café, moedor, moagem, dose, drink, flush, água, vapor e
perfil) — só depois passa a escrever. Os PUTs são deep-merge do lado do servidor,
então enviar `hotWaterData: {volume}` preserva `duration` e `flow`.

**Duas specs, não uma.** O REST está em `assets/api/rest_v1.yml` e os WebSockets em
`assets/api/websocket_v1.yml` (AsyncAPI) — canais e payloads de telemetria só existem
na segunda. Ler as duas antes de supor qualquer coisa.

- **Tanque.** O nível vem por `ws/v1/machine/waterLevels`, em **milímetros**
  (`currentLevel` + `refillLevel`), não por REST. A skin mostra `NNmm` e acende o
  aviso quando `currentLevel <= refillLevel`, igual ao app oficial — a conversão
  mm→ml depende da geometria do tanque e não é informada em lugar nenhum.
- **Balança.** `ws/v1/scale/snapshot` emite **dois** tipos de frame no mesmo socket:
  `{status}` (só ao abrir e a cada mudança de conexão) e `{weight, weightFlow,
  battery, timerValue}` (só enquanto conectada). Tratar os dois como um zera o peso
  a cada frame de status. O socket fica aberto entre conexões — não reconectar.
- **A escala do moedor não é informada.** `Grinder` só tem `settingType`
  (`numeric` | `preset`), sem mínimo/máximo. A faixa do Grind assume 0–100 e
  `fieldFor()` a alarga quando a máquina reporta um valor maior.
- **Brew não existe no workflow.** A temperatura mora no perfil, por step: mudar
  o Brew clona o perfil ativo e desloca todos os steps pelo delta.

**GHC dispara o shot** — não há botão ESPRESSO na tela; durante a extração só `STOP`
é interativo.

## Desenvolvimento

A pasta vive no iCloud, cujo sandbox impede o servidor de preview de ler os arquivos.
`tools/devsync.sh` espelha a skin em `~/.cache/crema-dev/v2`, de onde `.devserver.py`
serve:

```bash
tools/devsync.sh v2 && python3 .devserver.py 4173 ~/.cache/crema-dev/v2
```

Emule **1320×800**. Sem hardware, use `http://localhost:4173/?mock=1` (fonte simulada;
`__crema.simShot()` no console dispara um shot). Com o Decaid rodando, a skin conecta
sozinha no Bridge — e aí o `?mock=1` é o único jeito de mexer na UI sem escrever na máquina.

## Publicação

```bash
tools/publish.sh "mensagem do commit"          # espelha crema-v2/ na branch v2
curl -X POST http://localhost:8080/api/v1/webui/skins/update   # força o check na máquina
```
