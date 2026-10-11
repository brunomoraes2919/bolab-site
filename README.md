# BOLAB — loja online

Loja de delivery de bolos da BOLAB em um único código: no celular tem cara de app (contexto de entrega no topo, barra inferior com o botão "Montar", barra "Ver carrinho"), no computador vira vitrine de loja (cabeçalho com busca larga e carrinho com valor, grade de produtos, rodapé).

- **Sem etapa de build.** HTML, CSS e JavaScript (módulos ES) servidos como arquivos estáticos. Publicar = enviar a pasta.
- **Modo demonstração.** Não há servidor: carrinho, conta e pedidos ficam no `localStorage` do navegador (`js/store.js`). Pagamento e login social são simulados.
- **Rodar localmente:** dentro desta pasta, `python -m http.server 5173` e abrir `http://localhost:5173` (qualquer servidor de arquivos estáticos serve; abrir o `index.html` direto do disco não funciona por causa dos módulos).
- **Publicado em:** GitHub Pages deste repositório (Settings → Pages → branch `main`).

## Estrutura

```
index.html            moldura (cabeçalho, faixa de seções, <main id="app">, rodapé, barra "Ver carrinho", barra inferior) + importmap do Three.js
css/tokens.css        cores, tipografia, espaços, sombras (variáveis CSS)
css/base.css          reset, .container, .section, títulos, .reveal
css/components.css    botões, chips, cards, linhas de cardápio, formulários, folhas, avisos, banners…
css/shell.css         cabeçalho, faixa de seções, folha de entrega, barra "Ver carrinho", barra inferior, rodapé, layouts
css/<área>.css        home, catalog, cart, account, customizer
js/app.js             boot + comportamentos globais (data-*)
js/router.js          rotas por hash (#/caminho)
js/store.js           estado e regras: auth, cart, favs, savedCakes, addresses, cards, orders, schedule, chat, prefs
js/ui.js              html`` seguro, formatação, máscaras, validação, toast, diálogos
js/components.js      productCard, productRow, priceButton, sectionHead, promoBanner, photo, qtyStepper, pageHead, totalsSummary…
js/icons.js           ícones SVG
js/cep.js             busca de endereço por CEP (ViaCEP)
js/data/              site.js (configurações), products.js (catálogo), photos.js (fotos)
js/views/             uma tela por arquivo
js/customizer/        motor 3D do personalizador
vendor/three/         Three.js r160 (local, sem CDN)
```

## Linguagem visual: "delivery premium"

A loja tem que parecer, em um segundo, um aplicativo de delivery de bolos: clara e densa como iFood e Uber Eats, com o cuidado de uma marca boutique. O guia completo para quem desenha telas está em `tools/out/design/GUIA-DELIVERY.md` (fora desta pasta). O resumo:

- **Uma família só, sem serifa:** Plus Jakarta Sans (400–800). Sem serifa, sem itálico, sem `<em>` de destaque, sem rótulo em versalete acima de título. Títulos curtos e funcionais ("Mais pedidos", "Peça de novo").
- **Cor:** página em cinza-claro neutro (`--bg`), superfícies brancas (`--surface`), texto quase preto (`--text`). O rosa da logo (`--rose-500`) é decoração; a **cor de ação** é a framboesa `--action` (`--rose-600`, `#D12D58`, contraste 4,97:1 com branco) em botões, links e seleção. Rosa-claro só em item selecionado e pequenos destaques. Verde (`--green`) para "grátis" e positivo; dourado só na estrela; cacau escuro (`--stage`) só na faixa do 3D e no rodapé do computador.
- **Forma:** cartões 16 px, botões e campos 12 px, selos 6 px; pílula só em chips, etiquetas e contadores. **Cartão é branco com fio de 1 px, sem sombra** (`--shadow-1` é esse fio). Sombra de verdade (`--shadow-2`, `--shadow-3`, `--shadow-up`) só no que flutua: barras fixas, folhas, avisos.
- **Preço sempre forte** (`.price`, cor `--price`, peso 800). Toda ação principal de compra leva o valor dentro do botão: `priceButton('Adicionar', 149.9)`.
- **Contexto de entrega sempre à vista:** "Entregar em …" ou "Retirar no ateliê" no cabeçalho, "Receba a partir de <data real>" nos chips. A BOLAB só trabalha sob encomenda; não existe "pronta-entrega".
- **Movimento rápido e funcional** (120–220 ms): toque, folha subindo, carrossel encaixando. Nada flutuando para enfeitar.
- **Texto:** direto e caloroso. "Entregar em", "Receba a partir de", "Pronto em 24 h", "Adicionar", "Ver carrinho", "Taxa de entrega".

### Fonte

A Plus Jakarta Sans está hospedada no próprio site: `assets/fonts/plus-jakarta-sans-latin.woff2` (um arquivo variável, pesos 400 a 800, caracteres latinos) com a licença em `assets/fonts/OFL.txt`. O `@font-face` fica em `css/tokens.css` e o `index.html` pede o arquivo logo no começo (`<link rel="preload" as="font">`). O site e o app não dependem de servidor externo para a fonte. Enquanto o arquivo carrega, a loja usa a fonte do aparelho com o tamanho ajustado (`"Plus Jakarta Sans Fallback"`), então as quebras de linha ficam praticamente iguais.

### Tokens principais (`css/tokens.css`)

| Papel | Token | Valor |
|---|---|---|
| Fundo da página | `--bg` | `#F5F5F6` |
| Superfície (cartão, folha, barra) | `--surface`, `--surface-2` | branco, `#FAFAFA` |
| Preenchimento neutro (busca, fundo de foto, abas) | `--fill` | `#EFEFF1` |
| Fio de cartão e campo | `--border` (= `--line`), `--border-strong` | `#E5E4E6`, `#D3D1D4` |
| Texto | `--text`, `--text-2`, `--text-3` | `#1C1A1B`, `#5F5B5E`, `#6C686B` |
| Cor de ação | `--action` (= `--rose-600`), `--action-hover` (= `--rose-700`) | `#D12D58`, `#B01F47` |
| Seleção e destaque suave | `--rose-50`, `--rose-100` | `#FFF4F6`, `#FFE7EC` |
| Preço | `--price` | `#1C1A1B` |
| Positivo / estrela | `--green`, `--gold` | `#15803D`, `#F2A60C` |
| Áreas de impacto | `--stage`, `--stage-2` | `#2A1215`, `#4A1A2A` |
| Raios | `--r-sm` `--r-md` `--r-lg` `--r-xl` `--r-pill` | 8, 12, 16, 20, 999 px |
| Alturas | `--header-h`, `--tabbar-h`, `--cartbar-h` | 56 / 72 px, 60 px, 0 ou 64 px |

Os nomes antigos (`--rose-*`, `--cocoa-*`, `--cream`, `--line`, `--font-display`, `--r-*`, `--shadow-*`, `--s-*`) continuam valendo; `--font-display` e `--font-body` são a mesma fonte.

### Moldura

- **Cabeçalho:** marca, contexto de entrega (abre a folha "Como você quer receber?"), busca e carrinho. No computador o carrinho mostra o valor e há a faixa de seções `#subnav`, que rola com a página.
  - **Valor do carrinho** (cabeçalho e barra "Ver carrinho"): os itens já com o cupom aplicado, sem a taxa de entrega (`cartValue()` em `js/shell.js`). Na própria tela do carrinho o botão do cabeçalho diz só "Carrinho": ali quem mostra valores é o resumo.
  - **Busca no computador:** o campo do cabeçalho é a busca de todas as telas, inclusive do cardápio (lá ele filtra a grade enquanto a pessoa digita; quem liga isso é `js/views/catalog.js`). O texto do campo nunca entra no HTML do cabeçalho, para ele não ser refeito a cada letra.
  - **Categorias no computador:** são os links da faixa de seções; o cardápio não repete as abas (as abas próprias dele existem só abaixo de 900 px).
- **Contexto de entrega:** `receiveContext()` de `js/shell.js` devolve `{ mode, label, place, address, earliest }`. A escolha fica em `prefs` (`receiveMode`: `'delivery'` ou `'pickup'`; `receiveAddress`: id do endereço salvo). Quando muda, a `window` recebe o evento `bolab:receive`.
- **Barra "Ver carrinho"** (`#cartbar`, só no celular): aparece acima da barra inferior quando há itens; não aparece em produto, carrinho, checkout, atendimento, personalizador e login. Com ela à vista, `<body>` ganha `.has-cartbar` e `--cartbar-h` vale 64 px (senão 0). O `<body>` já reserva o espaço; quem tiver elemento fixo no rodapé soma `var(--cartbar-h)`. Não confundir com `.cart-bar`, a barra própria da tela do carrinho.
- **Barra de ação presa ao rodapé (celular):** cada etapa da compra tem a sua, sempre com a ação principal à vista: `.pd-sticky` na tela do item, `.cart-bar` no carrinho e `.co-cta` no checkout (envolve `#co-next-1`, `#co-next-2` e `#co-pay`; no computador volta a ser um botão comum no fim da etapa).
- **Rodapé:** bloco curto no celular (contato, horário, redes, aviso de demonstração); colunas completas no computador.

## Como uma tela funciona

Cada arquivo em `js/views/` exporta um objeto:

```js
import { html, icon } from '../ui.js';

export default {
  title: 'Carrinho',          // vira "Carrinho · BOLAB" (pode ser função (ctx) => string)
  layout: 'default',          // 'default' | 'plain' | 'focus' | 'immersive'
  auth: false,                // true = exige login (o roteador manda para #/entrar?next=…)
  render(ctx) { return html`…`; },      // ctx = { params, query, path, restoring, rerender() }
  mount(root, ctx) { … return () => { /* limpeza opcional */ }; },
  onQuery(root, ctx) { … },   // opcional: só a query mudou, atualize sem recriar a tela
};
```

- `root` é um `<div class="view">` novo a cada navegação: ouça eventos **nele** (`on(root, 'click', '[data-x]', fn)`) e eles morrem junto com a tela. Só o que for ligado em `window`/`document` ou timers precisa da função de limpeza.
- `ctx.rerender()` redesenha a tela no lugar (bom para carrinho e listas). Para reagir ao estado: `const off = store.on('cart', () => ctx.rerender()); return off;`
- Navegação: links comuns `<a href="#/produto/p1">` ou `navigate('/carrinho')`, `navigate('/cardapio', { query: { cat: 'premium' }, replace: true })`, `goBack('/')`.

Layouts: `default` cabeçalho + rodapé + barra inferior · `plain` sem rodapé no celular (telas de conta) · `focus` só cabeçalho enxuto (login, checkout) · `immersive` tela cheia (personalizador).

## Regras do código

1. **Sempre `html\`…\``** para montar HTML. Tudo que é interpolado é escapado; para inserir HTML pronto use outro `html\`\``, `icon()` ou `raw()`. Nunca concatene string com dado do usuário.
2. **Nada de `onclick=""`** no HTML. Use `data-*` + `on(root, …)`.
3. **Use os tokens** de `css/tokens.css` (`var(--action)`, `var(--surface)`, `var(--s-4)`, `var(--r-lg)`…) e as classes de `css/components.css` antes de criar estilo novo. Prefixe as classes novas pela área (`.cart-…`, `.co-…`, `.acc-…`, `.cz-…`). Sem fundo rosado de tela, sem sombra em cartão, sem pílula em botão ou campo (ver "Linguagem visual").
4. **Mobile primeiro.** Pontos de quebra: `640px`, `900px` (vira site), `1100px`. Alvos de toque ≥ 44px. Em telas com barra fixa no rodapé, lembre da barra inferior (`--tabbar-h`), da barra "Ver carrinho" (`--cartbar-h`) e de `--safe-bottom`.
5. **Acessível:** `<label>` em todo campo, `aria-label` em botão só com ícone, foco visível, textos de erro junto do campo (`applyErrors`).
6. **Textos em português do Brasil**, tom caloroso e direto, tratando por "você". Sem jargão técnico. A mesma informação se escreve do mesmo jeito em todas as telas: "Entrega qua, 14/10 · 9h–11h" (`dayLabel` + `slotLabel`), "Receba a partir de …", "Taxa de entrega", "R$ X no Pix · 5% de desconto".
7. **Sem bibliotecas externas** além do Three.js já incluído. Sem CDN novo.
8. Regra de negócio (preço, cupom, frete, pedido) mora em `js/store.js` e `js/data/`. As telas só exibem.

## Desempenho (para a loja continuar leve no celular)

O celular (e o app Android, que é a mesma loja dentro de um WebView) tem bem menos folga que o computador. Estas regras mantêm a rolagem fluida:

1. **Sem vidro fosco.** `backdrop-filter` em algo fixo na tela (cabeçalho, barras, fundo de diálogo) obriga o aparelho a desfocar tudo o que passa por baixo a cada quadro. A moldura e os componentes usam cor cheia. Se um dia precisar em alguma tela, só no computador, com a versão de cor cheia para telas de toque: `@media (hover: none), (pointer: coarse), (max-width: 899px) { … backdrop-filter: none; background: … }`.
2. **Hover com movimento só onde existe mouse.** Efeitos de `:hover` que mexem em `transform` ou `box-shadow` vão dentro de `@media (hover: hover)`. No toque o "hover" gruda depois do toque.
3. **Animação contínua (`infinite`) descansa fora da tela.** Evite animação decorativa; se houver uma contínua, use `pauseOffscreen(elementos)` de `js/ui.js` e a classe `.is-away` no CSS.
4. **`.reveal`** (entrada animada ao rolar) funciona só no computador; em telas de toque o conteúdo já nasce visível. Não dependa dela para esconder nada.
5. **Fotos:** passe sempre `sizes` em `photo()` com a largura real que a foto ocupa; o navegador baixa o menor arquivo que serve.
6. **Abertura:** o `index.html` pede de uma vez os arquivos da primeira tela (`modulepreload`), a imagem do primeiro banner do início (`assets/img/cz-morango.webp`) e a fonte. Se trocar a imagem do primeiro banner em `js/views/home.js`, troque o arquivo no começo do `index.html` também.
7. **Fileiras que deslizam** (`.rail`, `.chips`) já vêm com `contain: inline-size`: podem ficar dentro de grade ou flex sem alargar a página. Se criar uma fileira própria com `overflow-x: auto`, faça o mesmo (ou dê `min-width: 0` à coluna).
8. **Para medir:** `python tools/perf_server.py 5180` e `BASE=http://localhost:5180/ node tools/perf.mjs depois` (resumo em `tools/out/perf/RELATORIO-DESEMPENHO.md`; o 3D tem medição própria em `tools/perf_cz.mjs`).

## Atributos globais (tratados em `js/app.js` e `js/shell.js`)

| Atributo | Efeito |
|---|---|
| `data-add-product="p1"` (+ `data-size="m"`) | adiciona ao carrinho e mostra toast |
| `data-fav="p1"` | alterna favorito (use `favButton(id)`) |
| `data-qty` / `data-qty-step` | contador de `qtyStepper()`; emite o evento `qty` (`ev.detail` = número) |
| `data-back="/fallback"` | volta uma tela |
| `data-copy-coupon="BOLAB10"` | copia o cupom |
| `data-open-receive` | abre a folha "Como você quer receber?" (entrega ou retirada) |
| `<form data-search>` com campo `name="q"` | envia a busca para o cardápio |
| `data-dialog-close` | fecha o diálogo aberto |
| `data-mask="phone\|cep\|cpf\|card\|expiry\|digits"` | máscara de digitação (chame `bindMasks(root)`) |
| `img[data-fallback]` | se a foto falhar, vira placeholder (já incluso em `photo()`) |

## API resumida

Tudo documentado em comentários no próprio arquivo — leia `js/store.js`, `js/ui.js` e `js/components.js` antes de escrever uma tela.

- `ui.js`: `html, raw, esc, icon, money, installments, dateLong, dateShort, dateTime, isoDate, toDate, plural, initials, masks, bindMasks, on, debounce, sleep, formData, applyErrors, setFieldError, clearFieldErrors, validators, cardBrand, toast, openDialog, confirmDialog, closeAllDialogs, observeReveal, pauseOffscreen, copyText, confetti`
- `store.js`: `store.on(evento, fn)`, `auth`, `cart`, `favs`, `savedCakes`, `addresses`, `cards`, `orders`, `schedule`, `chat`, `prefs`
- `components.js`: `photo, photoSrcset, mediaFallback, lineThumb, rating, stars, favButton, productCard, productRow, productMeta, sectionHead, chipRow, promoBanner, priceButton, optionGroupHead, listRow, dayLabel, slotLabel, prepLabel, qtyStepper, emptyState, pageHead, breadcrumb, notice, totalsSummary`
- `shell.js`: `startShell, receiveContext, openReceiveSheet`
- `data/products.js`: `PRODUCTS, SIZES, REVIEWS, getProduct, sizesOf, priceOf, isCake, searchProducts, relatedTo, addOns`
- `data/site.js`: `SITE, CATEGORIES, COUPONS, WALLET_COUPONS, ORDER_STEPS`

### Componentes mais usados

| Para | Use |
|---|---|
| Produto em grade | `productCard(p)` dentro de `.product-grid` |
| Produto em carrossel | `productCard(p, { compact: true })` dentro de `.rail` (com `.rail--grid` vira grade no computador). A largura do card é a padrão de `.rail` (160 px; 172 px a partir de 640 px): não defina `--rail-w` para card de produto |
| Produto em lista de cardápio (foto à direita, "+") | `productRow(p)` dentro de `<div class="menu-list">` |
| Título de seção com "Ver todos" | `sectionHead('Mais pedidos', { href: '#/cardapio' })` |
| Botão de compra com valor | `priceButton('Adicionar', 149.9, { attrs: 'data-x' })` → `.btn.btn--price` |
| Grupo de opções ("Obrigatório", "Escolha 1") | `optionGroupHead('Tamanho', { hint: 'Escolha 1', required: true })` + `.option` |
| Linha de lista com seta | `listRow({ iconName, title, desc, href })` dentro de `.card` |
| Chips (filtro ou informação) | `chipRow([{ label, href, active }, { label, info: true }])` |
| Banner de promoção | `promoBanner({ tone, tag, title, text, cta, href })` ou `{ code: 'BOLAB10' }` |
| Datas e prazos | `dayLabel(data)` → "seg, 12/10"; `slotLabel('14:00 – 16:00')` → "14h–16h"; `prepLabel(24)` → "Pronto em 24 h" |
| Situação de um pedido (selo) | `statusBadge(pedido)` de `js/views/order.js` (a mesma cor e o mesmo ícone na lista, na conta e no acompanhamento) |
| Tela da área do cliente (conta, pedidos) | `accountPage({ title, active, body })` de `js/views/account.js` + `bindAccount(root)` |
| Tela sem conteúdo (carrinho vazio, busca sem resultado…) | título da página (`pageHead`) + cartão `<div class="card empty">` com ícone, título, texto e botão |
| "Receba a partir de …" + onde entrega (item e carrinho) | `listRow({ iconName: 'calendar', title: 'Receba a partir de seg, 12/10', desc: 'Entregar em …', trail: 'Trocar', attrs: 'data-open-receive aria-haspopup="dialog"' })` |

Botões: `.btn` (ação), `--secondary` (branco com fio), `--ghost`, `--soft` (rosa-claro), `--neutral` (cinza), `--dark`, `--white` (sobre fundo escuro), `--lg`, `--sm`, `--block`, `--price`. Selos: `.badge` (cinza) e `--solid`, `--dark`, `--rose`, `--gold`, `--green`, `--amber`, `--red`, `--float`. Avisos: `notice(texto, { tone: '' | 'rose' | 'green' | 'amber' | 'red' })`.

## Rotas

`#/` início · `#/cardapio` (`?cat=&q=&ordem=&foco=busca`) · `#/produto/:id` · `#/favoritos` · `#/monte-seu-bolo` (`?bolo=<id salvo>&base=<id produto>`) · `#/carrinho` · `#/checkout` · `#/pedidos` · `#/pedido/:id` (`?novo=1`) · `#/entrar` (`?next=&modo=cadastro`) · `#/conta` · `#/conta/dados` · `#/conta/enderecos` · `#/conta/pagamentos` · `#/conta/cupons` · `#/conta/indicar` · `#/atendimento`
