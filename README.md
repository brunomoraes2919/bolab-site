# BOLAB — loja online

Site e aplicativo da BOLAB em um único código: no celular tem cara de app (barra inferior, botão "Criar"), no computador vira site (cabeçalho, grade larga, rodapé).

- **Sem etapa de build.** HTML, CSS e JavaScript (módulos ES) servidos como arquivos estáticos. Publicar = enviar a pasta.
- **Modo demonstração.** Não há servidor: carrinho, conta e pedidos ficam no `localStorage` do navegador (`js/store.js`). Pagamento e login social são simulados.
- **Rodar localmente:** dentro desta pasta, `python -m http.server 5173` e abrir `http://localhost:5173` (qualquer servidor de arquivos estáticos serve; abrir o `index.html` direto do disco não funciona por causa dos módulos).
- **Publicado em:** GitHub Pages deste repositório (Settings → Pages → branch `main`).

## Estrutura

```
index.html            moldura (cabeçalho, <main id="app">, rodapé, barra inferior) + importmap do Three.js
css/tokens.css        cores, tipografia, espaços, sombras (variáveis CSS)
css/base.css          reset, .container, .section, títulos, .reveal
css/components.css    botões, chips, cards, formulários, diálogos, toasts…
css/shell.css         cabeçalho, rodapé, barra inferior, layouts
css/<área>.css        home, catalog, cart, account, customizer
js/app.js             boot + comportamentos globais (data-*)
js/router.js          rotas por hash (#/caminho)
js/store.js           estado e regras: auth, cart, favs, savedCakes, addresses, cards, orders, schedule, chat, prefs
js/ui.js              html`` seguro, formatação, máscaras, validação, toast, diálogos
js/components.js      productCard, photo, rating, qtyStepper, pageHead, totalsSummary…
js/icons.js           ícones SVG
js/cep.js             busca de endereço por CEP (ViaCEP)
js/data/              site.js (configurações), products.js (catálogo), photos.js (fotos)
js/views/             uma tela por arquivo
js/customizer/        motor 3D do personalizador
vendor/three/         Three.js r160 (local, sem CDN)
```

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
3. **Use os tokens** de `css/tokens.css` (`var(--rose-600)`, `var(--s-4)`, `var(--r-lg)`…) e as classes de `css/components.css` antes de criar estilo novo. Prefixe as classes novas pela área (`.cart-…`, `.co-…`, `.acc-…`, `.cz-…`).
4. **Mobile primeiro.** Pontos de quebra: `640px`, `900px` (vira site), `1100px`. Alvos de toque ≥ 44px. Em telas com barra fixa no rodapé, lembre da barra inferior (`--tabbar-h`) e de `--safe-bottom`.
5. **Acessível:** `<label>` em todo campo, `aria-label` em botão só com ícone, foco visível, textos de erro junto do campo (`applyErrors`).
6. **Textos em português do Brasil**, tom caloroso e direto, tratando por "você". Sem jargão técnico.
7. **Sem bibliotecas externas** além do Three.js já incluído. Sem CDN novo.
8. Regra de negócio (preço, cupom, frete, pedido) mora em `js/store.js` e `js/data/`. As telas só exibem.

## Desempenho (para a loja continuar leve no celular)

O celular (e o app Android, que é a mesma loja dentro de um WebView) tem bem menos folga que o computador. Estas regras mantêm a rolagem fluida:

1. **Vidro fosco só no computador.** `backdrop-filter` em algo fixo na tela (cabeçalho, barras, fundo de diálogo) obriga o aparelho a desfocar tudo o que passa por baixo a cada quadro. Sempre que usar, acrescente a versão de cor cheia para telas de toque: `@media (hover: none), (pointer: coarse), (max-width: 899px) { … backdrop-filter: none; background: … }` (exemplos em `css/shell.css`).
2. **Hover com movimento só onde existe mouse.** Efeitos de `:hover` que mexem em `transform` ou `box-shadow` vão dentro de `@media (hover: hover)`. No toque o "hover" gruda depois do toque.
3. **Animação contínua (`infinite`) descansa fora da tela.** Use `pauseOffscreen(elementos)` de `js/ui.js` e a classe `.is-away` no CSS (exemplo: bolos flutuantes do início, `css/home.css`).
4. **`.reveal`** (entrada animada ao rolar) funciona só no computador; em telas de toque o conteúdo já nasce visível. Não dependa dela para esconder nada.
5. **Fotos:** passe sempre `sizes` em `photo()` com a largura real que a foto ocupa; o navegador baixa o menor arquivo que serve.
6. **Abertura:** o `index.html` pede de uma vez os arquivos da primeira tela (`modulepreload`), a foto principal do início e as fontes. Se trocar a foto `hero` em `js/data/photos.js`, troque o código dela no começo do `index.html` também.
7. **Para medir:** `python tools/perf_server.py 5180` e `BASE=http://localhost:5180/ node tools/perf.mjs depois` (resumo em `tools/out/perf/RELATORIO-DESEMPENHO.md`; o 3D tem medição própria em `tools/perf_cz.mjs`).

## Atributos globais (tratados em `js/app.js` e `js/shell.js`)

| Atributo | Efeito |
|---|---|
| `data-add-product="p1"` (+ `data-size="m"`) | adiciona ao carrinho e mostra toast |
| `data-fav="p1"` | alterna favorito (use `favButton(id)`) |
| `data-qty` / `data-qty-step` | contador de `qtyStepper()`; emite o evento `qty` (`ev.detail` = número) |
| `data-back="/fallback"` | volta uma tela |
| `data-copy-coupon="BOLAB10"` | copia o cupom |
| `data-dialog-close` | fecha o diálogo aberto |
| `data-mask="phone\|cep\|cpf\|card\|expiry\|digits"` | máscara de digitação (chame `bindMasks(root)`) |
| `img[data-fallback]` | se a foto falhar, vira placeholder (já incluso em `photo()`) |

## API resumida

Tudo documentado em comentários no próprio arquivo — leia `js/store.js`, `js/ui.js` e `js/components.js` antes de escrever uma tela.

- `ui.js`: `html, raw, esc, icon, money, installments, dateLong, dateShort, dateTime, isoDate, toDate, plural, initials, masks, bindMasks, on, debounce, sleep, formData, applyErrors, setFieldError, clearFieldErrors, validators, cardBrand, toast, openDialog, confirmDialog, closeAllDialogs, observeReveal, pauseOffscreen, copyText, confetti`
- `store.js`: `store.on(evento, fn)`, `auth`, `cart`, `favs`, `savedCakes`, `addresses`, `cards`, `orders`, `schedule`, `chat`, `prefs`
- `components.js`: `photo, photoSrcset, mediaFallback, lineThumb, rating, stars, favButton, productCard, qtyStepper, emptyState, pageHead, breadcrumb, notice, totalsSummary`
- `data/products.js`: `PRODUCTS, SIZES, REVIEWS, getProduct, sizesOf, priceOf, isCake, searchProducts, relatedTo, addOns`
- `data/site.js`: `SITE, CATEGORIES, COUPONS, WALLET_COUPONS, ORDER_STEPS`

## Rotas

`#/` início · `#/cardapio` (`?cat=&q=&ordem=&foco=busca`) · `#/produto/:id` · `#/favoritos` · `#/monte-seu-bolo` (`?bolo=<id salvo>&base=<id produto>`) · `#/carrinho` · `#/checkout` · `#/pedidos` · `#/pedido/:id` (`?novo=1`) · `#/entrar` (`?next=&modo=cadastro`) · `#/conta` · `#/conta/dados` · `#/conta/enderecos` · `#/conta/pagamentos` · `#/conta/cupons` · `#/conta/indicar` · `#/atendimento`
