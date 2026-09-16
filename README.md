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
| `main` | **a v2** — é o que a máquina instala |
| `v2` | espelho da `main`, mantido para histórico do redesign |
| `v1` · tag `v0.2.2` | congelamento da versão anterior ao redesign |

Decaid → **Skins → Install from GitHub branch** → `thiraraujo/decaid-skin-crema`,
branch `main`. As atualizações chegam por *Check for updates* (ETag).

Backup local da v1 publicada: `ipad/backups/` (zip + pasta extraída do commit
que estava na `main`).

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
o toque no número abre o teclado para valores fora da lista. O Grind tem régua e botões
− / + ao lado do número; o passo vem do moedor cadastrado no Decaid
(`Grinder.settingSmallStep`) e, sem esse dado, é 0,05. O nome do café diminui quando
quebra linha (46 px → 34 px em duas linhas → 28 px).

O carrossel de favoritos é contínuo: os cards acompanham o dedo durante o arrasto
(tamanho, posição e miolo interpolados) e, ao soltar, deslizam até a vaga final — só
então o perfil troca na máquina. Toque num card lateral desliza até ele; arrasto curto
volta ao lugar; arremesso rápido troca mesmo sem passar da metade.

O bloco do Grind inteiro (número + régua) é área de arrasto: 0,05 por tique, toque no
número abre o teclado e − / + seguem ao lado. Sem valor lido da máquina o arrasto não
faz nada (antes virava `NaN`).

A tela 02 mostra um bloco por fase do perfil conforme o shot avança (Yield / Temp /
Pressure / Flow por fase). As fases vêm dos steps do perfil; a fase corrente, de
`profileFrame` no snapshot — sem esse campo, dos tempos planejados. Cada bloco nasce no
instante em que a fase começa; não há vaga da "próxima", porque a DE1 pula steps por
condição de saída (o step 2 de um perfil pode simplesmente não acontecer) e a vaga
anunciava um número que não vinha. Valores longos ("7.4 → 8.8 → 0") encolhem a fonte
para caber sem mudar o tamanho do bloco.

**Fim do shot (sem ruído).** A curva ao vivo só aceita amostras com substate
`preinfusion` ou `pouring` (websocket_v1.yml · MachineSubstate) depois que o despejo
começa; o rabo de `pouringDone` — a pressão e o fluxo caindo depois que a máquina parou —
fica de fora, como no shot gravado. Mesmo critério da Bestpresso
(`ESPRESSO_EXTRACTION_SUBSTATES`).

**Máquina desligada.** Além do `ws/v1/devices`, a skin vigia o silêncio do
`ws/v1/machine/snapshot`: o canal "remains open and silent while no machine is attached",
então 10 s sem frame viram DISCONNECTED em vez de congelar o último estado (era assim que
a pílula ficava em HEATING com a máquina desligada no botão). Um frame atrasado também não
reacende o estado quando o `/devices` já diz que a máquina caiu.

## Gráfico do shot

- **Linha planejada (tracejada):** vem do próprio shot, não do perfil. Ao vivo, são os
  alvos `targetPressure` / `targetFlow` que a máquina manda a cada snapshot, desenhados só
  até o instante atual; no histórico, os mesmos alvos gravados nas `measurements` do shot.
  A máquina zera o alvo da bomba que não está em uso (step de fluxo → alvo de pressão 0),
  então a linha é interrompida nesses trechos, conforme o `pump` do step corrente. Shot
  gravado sem esses campos fica sem tracejado. A prévia do perfil na home, antes do shot,
  continua mostrando o plano inteiro.
- **Fases:** nada é pré-desenhado. Ao vivo, cada fase entra quando a máquina troca de step
  (`profileFrame`): traço vertical suave no início dela e rótulo no alto, com o mesmo número
  e nome dos blocos abaixo. No histórico, as fases saem das trocas de `profileFrame`
  gravadas nas `measurements` (shot antigo sem esse campo usa os tempos do perfil).
- **Eixo da direita (peso):** escala 0–100 g, sem números.

No histórico, cada shot guarda o **planejado** (`workflow.context.targetDoseWeight` →
`targetYield`, o que a receita pedia) e o **realizado** (`annotations.actualDoseWeight` /
`actualYield`; sem anotação, o último peso da balança nas measurements — critério da
Bestpresso). A lista mostra `18→40g · real 38.4g` e a ficha tem as duas linhas
(*Dose → Drink* e *Actual*). **Apply** copia café, moedor, moagem e o **planejado** para a
tela principal (e para o workflow da máquina); **Edit** corrige os dados daquele shot.
Ao filtrar por café, o primeiro shot da lista filtrada passa a ser o selecionado — o
gráfico e a ficha acompanham.

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
  saver.js          proteção de tela do SLEEP (imagens, brilho, troca, toque longo)
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
| WS `/ws/v1/machine/waterLevels` | nível do tanque (mm → ml → %) e limiar de recarga |
| WS `/ws/v1/devices` | estado de conexão da máquina e da balança + erros de BLE |
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

**Prontidão da máquina** (`src/readiness.js`): não basta o enum `MachineState` — a DE1
só passa por `heating` num instante ao acordar e volta a reportar `idle` enquanto o grupo
ainda sobe. O estado é combinado com as temperaturas e seus alvos (`targetMixTemperature`
/ `targetGroupTemperature`), com memória para distinguir "aquecendo" de "frio e parado".
O modelo é portado da skin [Bestpresso](https://github.com/xinghendri/bestpresso)
(`src/api/decaid/readiness.ts`), incluindo a folga de 8 °C. Resultado: READY · HEATING ·
NOT HEATING · SLEEPING · NO WATER · DISCONNECTED.

**Estado de conexão** vem de `ws/v1/devices`, não da ausência de telemetria: os sockets
ficam abertos mesmo com a máquina fora (doc/Skins.md § Machine Telemetry Socket
Lifecycle). Esse canal também traz os erros de BLE já classificados por `kind`, que a
skin mostra no card da balança.

**Princípio: a máquina é a fonte de verdade.** Toda modificação feita na skin é gravada
na máquina ou no app, e ao iniciar a skin **lê primeiro** e só então libera os toques
(`.app.is-booting`, com limite de 12 s se a rede falhar). Receita, auxiliares e perfil vão
no workflow; o que é da própria skin — tema, favoritos e ordem, eixo Static, valores
anteriores do teclado, última temperatura de vapor — vai no key-value store do app
(`/api/v1/store/crema/*`, ver `src/prefs.js`).

**Regra de ouro:** com Bridge conectado a skin **nunca** usa mock. Sem dado real,
mostra `—` — inclusive antes de `GET /workflow` responder: a receita nasce toda `null`,
e o PUT omite campo desconhecido em vez de mandar `null` (que limparia o valor na
máquina, e `targetYield` nem aceita).

A interface é toda em inglês.

## Configuração da skin

O ícone de ajustes no topo da home abre **Skin settings**:

- **Live chart** — tempo inicial do eixo X no shot ao vivo com STATIC ligado, em passos de
  5 s (padrão 40 s, de 5 a 1000 s). Se o shot passar desse tempo, o eixo cresce contínuo.
  Com STATIC desligado o eixo começa em 0 s e acompanha o tempo decorrido. STATIC e esse tempo valem só
  no shot ao vivo; home e histórico usam a duração do perfil/shot.
- **Screensaver** — proteção de tela do SLEEP com imagens do tablet (abaixo).
- **Colors** — os temas abaixo.

## Proteção de tela (Screensaver)

- **Imagens:** *Add images* abre o seletor de arquivos do Android (seleção múltipla). A skin
  não tem acesso a pastas: o sistema entrega os arquivos só naquele momento. Por isso cada
  imagem é reduzida à resolução física da tela (CSS px × devicePixelRatio, sem ampliar),
  comprimida em JPEG até caber no limite de 1 MiB por item do app e **guardada no Decaid**
  (`/api/v1/store/crema-saver/<id>`). Fotos novas na pasta exigem adicionar de novo.
  Até 20 imagens; miniaturas e ajustes ficam em `crema/saver`.
- **Quando aparece:** ligada, com imagens, enquanto a máquina está `sleeping`. Desligada
  (ou sem imagens), vale o véu de sleep de sempre.
- **Brilho:** barra vertical 0–100 % (padrão 30 %), aplicada ao tablet por
  `PUT /api/v1/display/brightness` só enquanto a proteção está na tela; ao sair, volta o
  brilho de antes. A skin já mantém a tela acesa (wake-lock) o tempo todo.
- **Troca:** a cada 5 min por padrão, de 1 a 60 min, sem transição; o sleep seguinte
  continua da próxima imagem.
- **Toque:** curto mostra *Hold to wake* por 2 s; longo (1 s) acorda a máquina. A imagem
  não recebe toques e o menu de contexto é bloqueado: no Android, segurar sobre uma imagem
  abre o menu dela e cancela o toque. Sem proteção de tela, o véu de sleep acorda com toque
  curto ou longo.
  *Preview* mostra a proteção sem dormir a máquina (toque longo fecha).

## Temas de cor

12 paletas (Dark padrão + 11 do handoff `docs/handoff-themes/`), trocadas pelo ícone de
ajustes no topo da home — só ícone, sem texto. **Só as cores mudam; o layout é o mesmo.**

- Todas as cores da skin são variáveis em `css/tokens.css` (valores = tema Dark).
- `css/themes.css` e `src/themes-data.js` são **gerados** por `tools/build-themes.py` a
  partir da tabela do handoff. Para ajustar uma paleta, edite o script e rode
  `python3 tools/build-themes.py`.
- Temas claros usam os acentos escuros do handoff e escalam a opacidade das linhas.
- "Paper · dark cards": fundo papel com os balões (cards, modais, teclas, painéis) como
  ilhas escuras — só elementos com fundo de superfície, para o texto não sumir.
- O tema escolhido fica no key-value store do app (`/api/v1/store/crema/theme`), que
  sobrevive a reinstalar a skin, com cache em localStorage aplicado já no `<head>`.

Ao abrir, a skin **lê** `GET /workflow` e monta a receita a partir do que já está
carregado na máquina (café, moedor, moagem, dose, drink, flush, água, vapor e
perfil) — só depois passa a escrever. Os PUTs são deep-merge do lado do servidor,
então enviar `hotWaterData: {volume}` preserva `duration` e `flow`.

**Duas specs, não uma.** O REST está em `assets/api/rest_v1.yml` e os WebSockets em
`assets/api/websocket_v1.yml` (AsyncAPI) — canais e payloads de telemetria só existem
na segunda. Ler as duas antes de supor qualquer coisa.

- **Tanque.** O nível vem por `ws/v1/machine/waterLevels`, em **milímetros**
  (`currentLevel` + `refillLevel`), não por REST. A conversão mm→ml usa a tabela da
  skin de referência Bestpresso (`src/api/decaid/adapters.ts · MM_TO_ML`), a mesma do
  de1app (`vars.tcl · water_tank_level_to_milliliters`, do CAD do tanque). A skin mostra
  `ml` e `%` na escala da própria tabela, **0 a 2058 ml** (`TANK_FULL_ML`);
  âmbar abaixo de 20 %, vermelho abaixo de 10 %; aviso de recarga quando a máquina está
  em `needsWater` ou `currentLevel <= refillLevel`.
- **Balança.** `ws/v1/scale/snapshot` emite **dois** tipos de frame no mesmo socket:
  `{status}` (só ao abrir e a cada mudança de conexão) e `{weight, weightFlow,
  battery, timerValue}` (só enquanto conectada). Tratar os dois como um zera o peso
  a cada frame de status. O socket fica aberto entre conexões — não reconectar.
- **A escala do moedor não é informada.** `Grinder` só tem `settingType`
  (`numeric` | `preset`), sem mínimo/máximo. A faixa do Grind assume 0–100 e
  `fieldFor()` a alarga quando a máquina reporta um valor maior.
- **Vapor liga/desliga pela temperatura**, não pela duração: `steamSettings.targetTemperature`
  0 desliga (ligado é 135–160 °C na DE1); `duration` é só o tempo máximo. Como desligar
  apaga a temperatura na máquina, a última temperatura ligada fica no app para religar nela.
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
