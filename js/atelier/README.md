# Ateliê BOLAB — contrato da imersão (rodada 5, etapa 2)

O personalizador de bolos **é** o simulador de confeiteiro. A imersão é feita de camadas que se ligam
e desligam (cena e animações, som, a Bô, o jogo); a compra continua funcionando com tudo desligado
("modo rápido"). Três frentes trabalham em paralelo e só se falam por este contrato.

| Frente | Dona de | Não toca |
|---|---|---|
| **Cena** | `js/customizer/engine.js` (acréscimos), `js/atelier/stage/**` | tela, jogo |
| **Tela** | `js/views/customizer.js`, `css/customizer.css`, `css/atelier.css`, `js/atelier/ui/**` | motor, jogo |
| **Jogo** | `js/atelier/game/**`, `css/atelier-game.css` | motor, tela |

Quem precisa de algo do outro lado **confere se existe antes de chamar** (`scene.atelier?.play`), para
que cada frente funcione sozinha e a junção não quebre nada.

## 1. Barramento (`bus.js`)

Eventos que já existem: `open`, `close`, `step`, `change`, `fit`, `tool`, `cart` (ver `bus.js`).
Eventos novos desta etapa:

| Evento | Quem emite | Detalhe |
|---|---|---|
| `cue` | Tela (repassa do motor) | `{ name, at, dur, count?, part?, kind? }` — marca de som de uma animação (ver §2) |
| `mode` | Tela | `{ mode: 'atelie' \| 'rapido' }` |
| `gesture` | Tela | `{ id: 'spread' \| 'place' \| 'drip' \| 'blow' \| 'light' \| 'spin', phase: 'start' \| 'move' \| 'end', value? }` |
| `reveal` | Tela | `{ phase: 'start' \| 'candles' \| 'blown' \| 'end', config }` |
| `photo` | Tela | `{ kind: 'foto' \| 'video' \| 'cartao' }` |
| `game.start` | Jogo | `{ id, title, brief }` — começou uma encomenda |
| `game.score` | Jogo | `{ id, stars: 1..3, parts: { sabor, visual, pedido }, notes: [..] }` |
| `game.sticker` | Jogo | `{ id, name, first: true \| false }` — ganhou figurinha |
| `game.end` | Jogo | `{ id, stars }` |
| `bo.action` | Bô | `{ label, patch?, step? }` (já existe) |

Ouvinte ignora o que não conhece. Nenhum evento carrega a cor do chá revelação (vai `'segredo'`).

## 2. Cena (motor) — `scene.atelier`

`createCakeScene()` passa a devolver também `atelier` (objeto abaixo). Tudo é opcional para quem chama.

```js
scene.atelier = {
  enabled,                         // boolean
  setEnabled(on),                  // liga/desliga cozinha + animações de preparo (modo rápido = false)
  setScene(id),                    // 'bancada' (padrão) | 'vitrine' | 'festa' — cenário em volta do bolo
  on(type, fn) → off,              // 'cue' (marcas de som) · 'busy' (true/false: animação em curso)
  play(name, opts) → Promise,      // toca uma animação por nome (lista abaixo); resolve ao terminar
  skip(),                          // termina na hora a animação em curso (toque impaciente, modo rápido)
  replay(opts) → Promise,          // refaz o bolo do prato vazio até o fim (time-lapse da montagem)
  pick(clientX, clientY) → hit|null, // { face: 'topo'|'lateral', x, z, y, tier } no bolo
  ghost(piece|null, hit?) → { ok, why }, // prévia da peça sob o dedo (verde cabe / vermelho não)
  candles: { lit, light() → Promise, blow(strength = 1) → Promise, count },
  spread: { begin(part) → { progress, done: Promise }, feed(deltaAngle), cancel() }, // girar o prato espalha a cobertura
  reveal(opts) → Promise,          // luz baixa, giro, brilho; resolve ao terminar
  capture: { video({ seconds, fps, width }) → Promise<Blob|null>, supported },
};
```

Animações (`play(name)`), todas curtas (0,4–2,5 s) e interrompíveis:
`intro` (prato chega) · `layer` (disco de massa desce e assenta) · `filling` (recheio espalha) ·
`soak` (calda de molhar) · `cover` (cobertura sobe enquanto o prato gira) · `style` (pente/espátula) ·
`drip` (gotas escorrem uma a uma) · `piping` (pitangas nascem em sequência) · `decor` (peças caem uma
a uma) · `remove` · `candles.light` · `candles.blow` · `cut` (fatia sai) · `resize` · `tier` (andar novo) ·
`reveal` · `celebrate` (confete).

Com `enabled`, o próprio `setConfig()` escolhe e toca a animação certa pelo que mudou (usa
`cake.parts()`, `cake.onBuild()` e `cake.assembly()`); `by: 'undo' | 'preset' | 'surprise' | 'auto'`
usa uma transição curta em vez da animação longa. `setConfig(config, { animate: false })` pula.

**Marcas de som (`cue`)**: o motor não toca som. Ele avisa *quando* o som deve acontecer:
`{ name, at, dur, count, part, kind }`, com `name` igual a um efeito de `audio.sfx` quando houver
(`plop`, `stack`, `pour`, `spread`, `swipe`, `scrape`, `smooth`, `drip`, `pipe`, `pipe-run`, `place`,
`place-soft`, `place-hard`, `sprinkle`, `remove`, `match`, `flame`, `blow`, `sparkle`, `confetti`,
`tada`, `slice`, `whoosh`, `resize`). `at` em segundos a partir de agora; `kind` = 'start' | 'hit' | 'stop'
para sons em laço. A Tela repassa cada marca ao barramento (`bus.emit('cue', …)`) e o áudio toca.

Limites: celular ≤ 150 mil triângulos **com** a cena; nada de textura baixada; `prefers-reduced-motion`
troca animações por transições de 150 ms; contexto perdido não pode travar; `dispose()` limpa tudo.

## 3. Tela — o que ela liga

- `audio` (`js/atelier/audio.js`), `soundControl()` (`audio-ui.js`), `haptics`, a Bô
  (`js/atelier/bo/index.js`: `createBo({ mount, bus, audio, getConfig, getStep, rules: rulesOf, onAction })`).
- Modo `atelie` | `rapido` (preferência guardada; padrão `atelie`, com saída clara para quem tem pressa).
- Gestos: girar o prato para espalhar, tocar para colocar peça (`config.decor.placed`, `canPlace`,
  `nearestFree` de `occupancy.js`), tocar para pingar a calda, acender e soprar velas.
- Revelação final, foto, cartão para compartilhar, vídeo da montagem.
- Ponto de montagem do jogo: `import('../atelier/game/index.js')` (se existir) e
  `mountGame({ root, bus, audio, bo, getConfig, setConfig, getPrice, goto, openSheet })`.

### Palco: quem mora onde (r6-tela2)

Uma régua só (`--st-gutter`, `--st-gap`, `--st-hit`, `--st-r`, `--st-lane`, `--st-bo`, em `css/customizer.css`):

| Zona | O quê | Regra |
|---|---|---|
| canto de cima à direita | `.cz-tools`: ver por dentro · revelar (chá) · velas (Decoração) · jogo · “…” | a única coluna de botões; 44 × 44, raio 12, mesma sombra. Em palco baixo, o que não cabe (velas, revelar, jogo — nesta ordem) vira linha da folha “Ateliê” (`.cz[data-collapsed]`); nunca há segunda coluna |
| canto de cima à esquerda | `.ag-hud`: a comanda do jogo | só com encomenda em curso |
| faixa de baixo | a Bô à esquerda; ao lado, **uma coisa por vez**: aviso do palco › figurinha nova › balão | nunca sobre o bolo |
| por cima do painel | `.st-sheet`: a folha “Ateliê” (jogo, som, modo rápido, vistas, giro, medidas, fundo, cenário) | o bolo fica inteiro à vista |

- **Avisos do palco** (`js/atelier/ui/notices.js`, `host.notes`): `notes.flash(texto)` (recado curto), `notes.push({ kind: 'ask' | 'tip', … })`
  (fila; a dica espera a Bô e dá a vez a ela) e `notes.control({ … })` (gesto em curso, com a saída por botão).
  Quem precisar avisar algo sobre o palco usa isto — nada de cartão próprio por cima do bolo.
- **Ferramenta da etapa**: `host.toolSlot` recebe um botão `.cz-tool` a mais na coluna (hoje: acender / soprar as velas).
- **Jogo à vista**: o botão do jogo fica na coluna do palco (`.cz-tool--game`, some no modo rápido) e abre a aba direto; a
  folha “Ateliê” mantém a linha “Encomendas e figurinhas”. Ponto de novidade (`.cz.has-game-news`): figurinha nova ainda não
  vista no álbum ou encomenda do dia ainda não vista hoje (`prefs.atelierGameSeenDay`).
- **Cenário e cabeçalho**: a tela 3D passa por baixo do cabeçalho; a leitura do título vem de um véu do tom do fundo
  (`--st-wall`, definido pela tela a cada troca de fundo) e de `data-tone` — nenhuma cor fixa.
- **Primeira visita**: o bolo aparece sozinho; uns 3 s depois, o convite do som (um aviso da faixa); depois da resposta a Bô
  se apresenta; as duas dicas (girar; o convite para o jogo, apontando o botão dele) só entram quando ela termina de falar.
- A Bô é posicionada pela tela no celular (`css/atelier.css`): âncora no canto de baixo à esquerda, balão ao lado.

## 4. Jogo — `js/atelier/game/index.js`

```js
export function mountGame({ root, bus, audio, bo, getConfig, setConfig, getPrice, goto, openSheet })
  → { open(), startOrder(id?), stop(), state(), destroy() }
export function scoreOrder(order, config) → { stars, parts: { sabor, visual, pedido }, notes }   // puro, testável
export const ORDERS, STICKERS
```

- **Encomendas**: clientes fictícios com pedido, gosto, ocasião e orçamento. Nota de 1 a 3 estrelas.
- **Figurinhas**: álbum de descobertas. **Sem barra de XP, sem níveis numéricos, sem ranking.**
- Estado em `localStorage['bolab:atelie:v1']` (fora do estado da loja), sempre validado ao ler.
- O jogo nunca altera preço, prazo, carrinho nem pedido de verdade.

## 5. Regras que valem para todos

- CSP: nada de `<style>` criado por código, script inline, `eval`, worker de `blob:`. CSS novo em arquivo,
  carregado por `<link>` (como `atelier-bo.css`).
- Texto de usuário só pelo `html\`\`` de `js/ui.js`.
- Ganchos do teste de ponta a ponta continuam: `[data-act="cutaway"]`, `.cz-next[data-act="next"]`, `[data-act="add"]`.
- Nada confeccionável só no computador: o que o simulador mostra a cozinha consegue fazer (`rules.js`).
- Sem personagens ou marcas de terceiros; sem conteúdo de restrição alimentar.
