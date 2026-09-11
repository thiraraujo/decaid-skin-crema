# CREMA — skin "Editorial Cool" para a Decent DE1

Skin web (HTML/CSS/JS, sem bundler) para o app **Decaid** / bridge **ReaPrime**.
Tela única: rail de controles + gráfico de extração como herói + histórico por café.

> 📐 **Handoff visual (prints de todas as telas + o que cada uma faz):**
> [branch `handoff`](https://github.com/thiraraujo/decaid-skin-crema/tree/handoff) — base do próximo redesign.

## Instalação

Decaid → **Skins → Install from GitHub branch** → `thiraraujo/decaid-skin-crema`, branch `main`.
As atualizações chegam por *Check for updates* (ETag) — não é preciso release nem PR.

## Stack

- **JS vanilla, ES modules, sem build** — servido como arquivos estáticos.
- **CSS puro com design tokens** (`css/tokens.css`).
- **Gráfico SVG desenhado à mão** (`src/chart.js`) — ao vivo por `requestAnimationFrame`,
  estático (perfil planejado / shot gravado) por render síncrono.
- **Fontes locais** (offline/kiosk): Hanken Grotesk + IBM Plex Mono.
- **Canvas fixo 1320×800** escalado por `transform` (`fitApp` em `main.js`) — independe de dpr.

## Estrutura

```
index.html          canvas fixo + markup estático (tela principal + 6 modais)
manifest.json       id/name/version/author/repository/entry (lido pelo Decaid)
css/                tokens.css · main.css · modals.css
src/
  main.js           bootstrap: escolhe a fonte (Bridge real vs mock) e liga gráfico/status
  api.js            cliente REST + WebSocket do ReaPrime + detecção de host
  mock.js           fonte simulada — SÓ quando não há Bridge (dev visual)
  chart.js          gráfico herói (séries P/F/T/W + alvos, eixos, rótulos sobre a linha)
  ui.js             toda a interação (modais, steppers, histórico por café, editor de shot)
  profiles.js       perfis/favoritos de fallback
  store.js          estado + pub/sub
  host.js           ações do app host (sleep, Settings nativo)
assets/fonts/       *.woff2
```

## Integração com o Bridge (ReaPrime, porta 8080)

Detecção de host em `src/api.js`: `window.__REA_HOST__` → `localStorage.reaHostname` →
`localhost:8080`. Sem host, a UI cai no `mock.js` (rodável no navegador, sem hardware).

| Canal | Uso |
|---|---|
| WS `/ws/v1/machine/snapshot` | gráfico ao vivo, Mix/Group, estado da máquina (badge + botão) |
| WS `/ws/v1/scale/snapshot` | peso, status da balança, série de peso |
| WS `/ws/v1/display` | wake-lock (tela sempre acesa) |
| `GET /profiles` · `PUT /profiles/{id}/visibility` | barra de favoritos, picker, mostrar/ocultar |
| `GET /shots` · `GET /shots/{id}` | card de histórico, histórico por café, curvas do shot |
| `PUT /shots/{id}` | editar shot passado (só `annotations`) |
| `GET/POST /beans` · `/grinders` | biblioteca Café & Moedor |
| `PUT /workflow` | dose, yield, café, moedor, moagem, flush, água, vapor e **perfil** |
| `PUT /machine/state/{state}` | ESPRESSO / STOP / WAKE / SLEEP |

**Regra de ouro:** com Bridge conectado a skin **nunca** usa mock. Sem dado real, mostra `—`.

**Botão de máquina:** aparece só quando `GET /machine/info` reporta `GHC: false`. Em máquinas com
botão físico (GHC) a skin esconde o botão da tela.

## Desenvolvimento

O projeto vive numa pasta do iCloud, cujo sandbox bloqueia `python3 -m http.server` a partir dela.
Sirva uma cópia (ou use `--directory`):

```bash
python3 -m http.server 4173 --directory ipad/crema
```

Com o Decaid rodando, o Bridge responde em `localhost:8080` e a skin conecta sozinha.
Emule **1320×800** para conferir a fidelidade.

## Publicação

`rsync` do conteúdo desta pasta para o clone do repositório, commit e **force-push na `main`**.
Até a v1: sempre sobrescrever, sem PR e sem release. Na v1 o histórico será refeito do zero.

```bash
curl -X POST http://localhost:8080/api/v1/webui/skins/update   # força o check na máquina
```

## Status

Funcionando e verificado no Bridge real: telemetria ao vivo, perfis (incl. ocultos), histórico de
shots com curvas, **histórico por café + apply**, biblioteca de cafés/moedores com cadastro,
**editor de shot**, badges completos de estado, dim/lock no shot, iniciar/parar espresso.

Pendências mapeadas no handoff: Visualizer (precisa login da conta Decent), fases reais no gráfico,
Tank via WS, auto-reconexão da balança, ações de vapor/água/flush pela tela.
</content>
