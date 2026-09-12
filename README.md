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

Favoritos (`✎ favoritos`) têm um gerenciador próprio em `src/screens.js`: lista **todos**
os perfis da máquina (73 no Bridge de teste), com busca por nome, e marca até 5 para o
carrossel.

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
| WS `/ws/v1/scale/snapshot` | peso e status da balança |
| WS `/ws/v1/display` | wake-lock (tela sempre acesa) |
| `GET /profiles` | carrossel de favoritos e curvas planejadas |
| `GET /shots` · `GET /shots/{id}` | histórico e curvas do shot |
| `PUT /shots/{id}` | editar shot passado (`annotations.extras`) |
| `GET/POST /beans` · `/grinders` | biblioteca Café & Moedor |
| `PUT /workflow` | dose, drink, café, moedor, moagem, flush, água e vapor |
| `PUT /machine/state/{state}` | STOP (o shot é disparado pelo GHC) |

**Regra de ouro:** com Bridge conectado a skin **nunca** usa mock. Sem dado real,
mostra `—`.

Ao abrir, a skin **lê** `GET /workflow` e monta a receita a partir do que já está
carregado na máquina (café, moedor, moagem, dose, drink, flush, água, vapor e
perfil) — só depois passa a escrever. Os PUTs são deep-merge do lado do servidor,
então enviar `hotWaterData: {volume}` preserva `duration` e `flow`.

**Limites conhecidos da API** (`assets/api/rest_v1.yml` do repo do Decaid):

- **Nível do tanque não é legível.** `MachineSnapshot` não traz o campo e
  `/machine/waterLevels` é só `POST` (define o limiar de reabastecimento). A
  barra do tanque fica vazia com `—` e só acende — em vermelho, com "Encher" —
  quando o estado da máquina é `needsWater`.
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
