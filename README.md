# CREMA — skin "Editorial Cool" para a Decent DE1

Skin web (HTML/CSS/JS) para o app **Streamline / Decent.app** (bridge **ReaPrime**),
rodando num **iPad Pro 11" em paisagem** (canvas fixo **1194×834**, kiosk). Implementa a
Direção 4 "Editorial Cool" do redesign: rail de controles + gráfico de extração ao vivo (herói)
+ modais Coffee & Grinder e Adjustments.

## Stack

- **JS vanilla, ES modules, sem bundler** — servida como arquivos estáticos (igual à skin
  Streamline de referência, `allofmeng/streamline_project`).
- **CSS puro com design tokens** (`css/tokens.css`) — cores/tipografia/espaçamentos do handoff.
- **Gráfico SVG desenhado à mão** (`src/chart.js`), animado por `requestAnimationFrame`.
- **Fontes locais** (offline/kiosk): Hanken Grotesk + IBM Plex Mono (woff2 em `assets/fonts/`).

## Estrutura

```
index.html          canvas fixo + markup estático (tela principal + 2 modais)
manifest.json       id/name/version/author (lido pelo Bridge)
css/                tokens.css · main.css · modals.css
src/
  main.js           bootstrap: escolhe fonte (Bridge real vs mock) e liga ao gráfico/status
  api.js            cliente REST+WebSocket do ReaPrime + detecção de host
  mock.js           fonte simulada (mesma interface de api.js) — shot de demonstração ~10Hz
  chart.js          gráfico herói (séries P/F/T/W + alvos, eixos, labels)
  ui.js             modais, steppers, chips, toggles (touch-only)
  store.js          estado + pub/sub
assets/fonts/       *.woff2
.github/workflows/  release.yml (tag v* → crema.zip → GitHub Release)
```

## Integração com o Bridge (ReaPrime, porta 8080)

Detecção de host em `src/api.js`: `window.__REA_HOST__` → `localStorage.reaHostname` →
`localhost:8080`. Sem host detectado, a UI usa `mock.js` (rodável no navegador, sem hardware).

- WebSocket `ws://<host>:8080/ws/v1/machine/snapshot` (~10Hz) → gráfico + Mix/Group.
- WebSocket `.../ws/v1/scale/snapshot` → peso / cartão Weight.
- WebSocket `.../ws/v1/display` → wake-lock (tela sempre acesa).
- REST `PUT /api/v1/workflow`, `PUT /api/v1/machine/state/{state}` → gravar recipe / iniciar shot.

## Desenvolvimento (preview local)

O projeto vive numa pasta do iCloud, cujo sandbox bloqueia o servidor de dev. O preview roda a
partir de uma cópia no diretório de scratchpad da sessão (ver `.claude/launch.json`). Ao alterar
arquivos, ressincronize a cópia servida:

```
cp -R "<...>/crema/." "<scratchpad>/crema-serve/"
```

Depois recarregue o preview. Emule **1194×834 @2x**, paisagem, para conferir a fidelidade.

`.devserver.py` é um servidor estático de dev (faz `chdir` antes de qualquer `getcwd`, contornando
a restrição do iCloud). Não faz parte da skin distribuída (excluído no `release.yml`).

**Botão SIM (apenas dev):** quando a skin roda sem Bridge (mock), aparece um botão **SIM** no
cabeçalho para iniciar/parar uma simulação de shot. Ele é condicionado a `source.kind === 'mock'`
em `src/ui.js`, então **não aparece nem funciona na versão final** (com o Bridge real, um shot de
verdade já reativa o modo ao vivo pelo WebSocket `/machine/snapshot`).

## Distribuição (M5)

O artefato é validado localmente em `crema-0.1.0.zip` (raiz do projeto): `index.html` na raiz +
`manifest.json` + `css/` + `src/` + `assets/`, sem arquivos de dev. Publique via GitHub Release:

```
# 1. repositório (a partir da pasta crema/)
git init && git add . && git commit -m "CREMA v0.1.0"
git branch -M main
git remote add origin git@github.com:<voce>/crema.git
git push -u origin main

# 2. dispara o release (o workflow carimba a versão e sobe crema.zip)
git tag v0.1.0 && git push origin v0.1.0
```

Instalar no iPad: **Settings → Skins** no app Streamline/Decent.app. Para listar publicamente,
adicione `"<voce>/crema"` (tipo `github_release`) ao `skin_sources.json` da reaprime.

> O zip pronto em `crema-0.1.0.zip` também serve para sideload/teste manual se o app permitir
> instalar a partir de arquivo.

## Testando o M4 sem hardware (emulador do Bridge)

`tools/bridge-emulator.py` é um emulador de dev do Bridge ReaPrime (REST + WebSocket, stdlib
pura) que exercita o caminho real de `api.js`. Ferramenta de dev — excluída do `release.yml`.

```
python3 tools/bridge-emulator.py 8080
```

No console da skin (preview), aponte para ele e recarregue:

```
localStorage.setItem('reaHostname', '127.0.0.1:8080'); location.reload();
```

A skin passa a usar `createApiSource` (WS `/machine/snapshot` + `/scale/snapshot`, REST de
perfis/shots/workflow). O emulador cicla idle→espresso(30s)→idle, então o gráfico, o indicador de
passo e o quadro de fases atualizam ao vivo pela WS. Para voltar ao mock:
`localStorage.removeItem('reaHostname'); location.reload();`. No iPad real, use o IP do Bridge:
`localStorage.reaHostname = '<ip-do-ipad>:8080'` (ou a WebView injeta `window.__REA_HOST__`).

## Status

- [x] M0 Scaffold · [x] M1 Tela principal pixel-perfect · [x] M2 Gráfico herói com mock
- [x] M3 Modais e interações
- [x] M4 Integração com Bridge — **verificado ponta a ponta contra o emulador**: WS
  snapshot/scale, ciclo de shot pelo estado da máquina, tempo relativo, `profileFrame`, balança
  connect/tare (REST), **lista de perfis** (`getProfiles` → barra/picker/curva planejada dos
  steps), **histórico** (`getShots`/`getShot` → log/gráfico do shot), e **gravação de recipe**
  (`PUT /workflow` ao mudar dose/drink/brew/grinder/adjustments/perfil). Falta apenas **validar no
  iPad real** (apontar `reaHostname` para o Bridge do device).
- [ ] M5 Release testado no iPad
