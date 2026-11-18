# BOLAB — loja online

Loja de delivery de bolos da BOLAB em um único código: no celular tem cara de app (contexto de entrega no topo, barra inferior com o botão "Montar", barra "Ver carrinho"), no computador vira vitrine de loja (cabeçalho com busca larga e carrinho com valor, grade de produtos, rodapé).

- **Sem etapa de build.** HTML, CSS e JavaScript (módulos ES) servidos como arquivos estáticos. Publicar = enviar a pasta.
- **Modo demonstração.** Não há servidor: carrinho, conta e pedidos ficam no `localStorage` do navegador (`js/store.js`). Pagamento e login social são simulados.
- **Rodar localmente:** dentro desta pasta, `python -m http.server 5173` e abrir `http://localhost:5173` (qualquer servidor de arquivos estáticos serve; abrir o `index.html` direto do disco não funciona por causa dos módulos).
- **Publicado em:** GitHub Pages deste repositório (Settings → Pages → branch `main`).

## Estrutura

```
index.html            moldura (cabeçalho, faixa de seções, <main id="app">, rodapé, barra "Ver carrinho", barra inferior),
                      política de segurança (CSP), endereço oficial e cartão de compartilhamento, importmap do Three.js
css/tokens.css        cores, tipografia, espaços, sombras (variáveis CSS)
css/base.css          reset, .container, .section, títulos, .reveal
css/components.css    botões, chips, cards, linhas de cardápio, formulários, folhas, avisos, banners…
css/shell.css         cabeçalho, faixa de seções, folha de entrega, barra "Ver carrinho", barra inferior, rodapé, layouts
css/<área>.css        home, catalog, cart, account, customizer — carregadas pelo roteador junto com a tela (ver "Desempenho")
js/boot.js            partida: bloqueio de quadro de outro site, aviso "Tentar de novo", pedido antecipado dos arquivos da tela de entrada
js/app.js             comportamentos globais (data-*), erros não tratados, aviso "Sem internet", service worker
js/router.js          rotas por hash (#/caminho) e a folha de estilo de cada rota
js/seo.js             descrição, cartão de compartilhamento e dados estruturados (schema.org) de cada tela
sw.js                 service worker: loja instalável e abrindo sem internet
404.html              endereço que não existe volta para a loja (/cardapio vira #/cardapio)
robots.txt, sitemap.xml  para os buscadores
js/store.js           estado e regras: auth, cart, favs, savedCakes, addresses, cards, orders, schedule, chat, prefs
js/ui.js              html`` seguro, formatação, máscaras, validação, toast, diálogos
js/components.js      productCard, productRow, priceButton, sectionHead, promoBanner, photo, qtyStepper, pageHead, totalsSummary…
js/icons.js           ícones SVG
js/cep.js             busca de endereço por CEP (ViaCEP)
js/pedido-whatsapp.js o pedido em mensagem de WhatsApp e o link da ficha da cozinha (ver "Pedido pelo WhatsApp")
js/data/              site.js (configurações), products.js (catálogo), photos.js (fotos),
                      montar.js (a chamada do "Monte seu bolo": um lugar só para a loja toda)
js/views/             uma tela por arquivo
js/customizer/        motor 3D do personalizador
js/atelier/           o Ateliê (a imersão do personalizador): bus.js (barramento), audio*.js (som), haptics.js (vibração),
                      bo/ (a assistente Bô), stage/ (cozinha e animações de preparo), game/ (encomendas e figurinhas),
                      ui/ (o que liga tudo isso à tela) — ver "O Ateliê"
css/atelier*.css      atelier.css (composição do palco, com a rota), atelier-audio / -bo / -game (cada módulo pede a sua)
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
| Alturas | `--header-h`, `--tabbar-h`, `--cartbar-h` | 56 (celular) / 64 (tablet) / 72 px (computador), 60 px, 0 ou 64 px |

Os nomes antigos (`--rose-*`, `--cocoa-*`, `--cream`, `--line`, `--font-display`, `--r-*`, `--shadow-*`, `--s-*`) continuam valendo; `--font-display` e `--font-body` são a mesma fonte.

### Moldura

- **Cabeçalho:** marca, contexto de entrega (abre a folha "Como você quer receber?"), busca e carrinho. No computador o carrinho mostra o valor e há a faixa de seções `#subnav`, que rola com a página.
  - **Valor do carrinho** (cabeçalho e barra "Ver carrinho"): os itens já com o cupom aplicado, sem a taxa de entrega (`cartValue()` em `js/shell.js`). Na própria tela do carrinho o botão do cabeçalho diz só "Carrinho": ali quem mostra valores é o resumo.
  - **Busca no computador:** o campo do cabeçalho é a busca de todas as telas, inclusive do cardápio (lá ele filtra a grade enquanto a pessoa digita; quem liga isso é `js/views/catalog.js`). O texto do campo nunca entra no HTML do cabeçalho, para ele não ser refeito a cada letra.
  - **Categorias no computador:** são os links da faixa de seções; o cardápio não repete as abas (as abas próprias dele existem só abaixo de 900 px).
- **Contexto de entrega:** `receiveContext()` de `js/shell.js` devolve `{ mode, label, place, address, earliest }`. A escolha fica em `prefs` (`receiveMode`: `'delivery'` ou `'pickup'`; `receiveAddress`: id do endereço salvo). Quando muda, a `window` recebe o evento `bolab:receive`.
- **Barra "Ver carrinho"** (`#cartbar`, só abaixo de 720 px): aparece acima da barra inferior quando há itens; não aparece em produto, carrinho, checkout, atendimento, personalizador, login e nas telas de formulário da conta (`#/conta/…`). No tablet quem faz esse papel é o botão do carrinho do cabeçalho, que mostra o valor. Com ela à vista, `<body>` ganha `.has-cartbar` e `--cartbar-h` vale 64 px (senão 0). O `<body>` já reserva o espaço; quem tiver elemento fixo no rodapé soma `var(--cartbar-h)`. Não confundir com `.cart-bar`, a barra própria da tela do carrinho.
- **Barra de ação presa ao rodapé (celular):** cada etapa da compra tem a sua, sempre com a ação principal à vista: `.pd-sticky` na tela do item, `.cart-bar` no carrinho e `.co-cta` no checkout (envolve `#co-next-1`, `#co-next-2` e `#co-pay`; no computador volta a ser um botão comum no fim da etapa).
- **Rodapé:** bloco curto no celular (contato, horário, redes, aviso de demonstração); colunas completas no computador.
- **Tablet (720–899 px):** continua com cara de aplicativo (barra inferior, folhas), mas com layout próprio: cabeçalho com a logo inteira, o contexto de entrega, a **busca** (é a busca de todas as telas, como no computador; o cardápio fica só com as abas presas) e o carrinho com o valor; grades de 3 e 4 colunas no início; cardápio e favoritos em duas colunas; item com a foto de um lado e a compra do outro; conta com o **menu lateral a partir de 768 px**. Entre 600 e 719 px (celular grande, dobrável aberto) vale o cabeçalho do celular, com margens de 24 px e grades de 2 e 3 colunas.
- **Troca de tela:** o roteador anuncia o título da tela nova para o leitor de tela e leva o foco ao conteúdo. Se a tela demora a chegar (rede lenta), uma linha fina corre sob o cabeçalho (`body.is-routing`).
- **Folhas e diálogos:** no celular a folha fecha também puxando o topo para baixo; com um diálogo aberto o resto da página fica inerte (`inert`).

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

- A tela entra na tabela `ROUTES` de `js/router.js` com as folhas de estilo de área que usa: `{ path: '/carrinho', load: view('cart'), css: ['cart'] }`. O roteador baixa a folha junto com a tela e só mostra a tela quando as duas chegaram. Usou classes de outra área? Acrescente a folha dela em `css`.
- `root` é um `<div class="view">` novo a cada navegação: ouça eventos **nele** (`on(root, 'click', '[data-x]', fn)`) e eles morrem junto com a tela. Só o que for ligado em `window`/`document` ou timers precisa da função de limpeza.
- `ctx.rerender()` redesenha a tela no lugar (bom para carrinho e listas). Para reagir ao estado: `const off = store.on('cart', () => ctx.rerender()); return off;`
- Navegação: links comuns `<a href="#/produto/p1">` ou `navigate('/carrinho')`, `navigate('/cardapio', { query: { cat: 'premium' }, replace: true })`, `goBack('/')`.

Layouts: `default` cabeçalho + rodapé + barra inferior · `plain` sem rodapé no celular (telas de conta) · `focus` só cabeçalho enxuto (login, checkout) · `immersive` tela cheia (personalizador).

## Regras do código

1. **Sempre `html\`…\``** para montar HTML. Tudo que é interpolado é escapado; para inserir HTML pronto use outro `html\`\``, `icon()` ou `raw()`. Nunca concatene string com dado do usuário.
2. **Nada de `onclick=""`** no HTML. Use `data-*` + `on(root, …)`.
3. **Use os tokens** de `css/tokens.css` (`var(--action)`, `var(--surface)`, `var(--s-4)`, `var(--r-lg)`…) e as classes de `css/components.css` antes de criar estilo novo. Prefixe as classes novas pela área (`.cart-…`, `.co-…`, `.acc-…`, `.cz-…`). Sem fundo rosado de tela, sem sombra em cartão, sem pílula em botão ou campo (ver "Linguagem visual").
4. **Mobile primeiro.** Pontos de quebra: `600px` (margens de 24 px, grades maiores), `720px` (tablet: cabeçalho com busca), `768px` (menu lateral da conta), `900px` (vira site), `1100px`. `640px` continua valendo para folhas (viram modal) e formulários em duas colunas. Alvos de toque ≥ 44px. Em telas com barra fixa no rodapé, lembre da barra inferior (`--tabbar-h`), da barra "Ver carrinho" (`--cartbar-h`) e de `--safe-bottom`.
5. **Acessível:** `<label>` em todo campo, `aria-label` em botão só com ícone, foco visível, textos de erro junto do campo (`applyErrors`).
6. **Textos em português do Brasil**, tom caloroso e direto, tratando por "você". Sem jargão técnico. A mesma informação se escreve do mesmo jeito em todas as telas: "Entrega qua, 14/10 · 9h–11h" (`dayLabel` + `slotLabel`), "Receba a partir de …", "Taxa de entrega", "R$ X no Pix · 5% de desconto".
7. **Sem bibliotecas externas** além do Three.js já incluído. Sem CDN novo.
8. Regra de negócio (preço, cupom, frete, pedido) mora em `js/store.js` e `js/data/`. As telas só exibem.
9. **Nada de script nem estilo escritos dentro do HTML.** A política de segurança do `index.html` barra `<script>…</script>`, `onclick=""`, `eval` e `<style>` criado por código. Script vai em arquivo `.js`; estilo vai em arquivo `.css` (carregado por `<link>`) ou em `style=""` no próprio elemento. Recurso de outro endereço (imagem, API, som) só funciona depois de liberado na política (ver "Segurança").
10. **Endereço que vem de dado nunca vai cru para `href` ou `src`.** Dentro de `html\`…\`` isso já é conferido (`href="${x}"` só aceita caminho da loja, `https`, `mailto`, `tel` e WhatsApp). Fora dele, use `safeUrl(x)` de `js/ui.js`.

## Desempenho (para a loja continuar leve no celular)

O celular (e o app Android, que é a mesma loja dentro de um WebView) tem bem menos folga que o computador. Estas regras mantêm a rolagem fluida:

1. **Sem vidro fosco.** `backdrop-filter` em algo fixo na tela (cabeçalho, barras, fundo de diálogo) obriga o aparelho a desfocar tudo o que passa por baixo a cada quadro. A moldura e os componentes usam cor cheia. Se um dia precisar em alguma tela, só no computador, com a versão de cor cheia para telas de toque: `@media (hover: none), (pointer: coarse), (max-width: 899px) { … backdrop-filter: none; background: … }`.
2. **Hover com movimento só onde existe mouse.** Efeitos de `:hover` que mexem em `transform` ou `box-shadow` vão dentro de `@media (hover: hover)`. No toque o "hover" gruda depois do toque.
3. **Animação contínua (`infinite`) descansa fora da tela.** Evite animação decorativa; se houver uma contínua, use `pauseOffscreen(elementos)` de `js/ui.js` e a classe `.is-away` no CSS.
4. **`.reveal`** (entrada animada ao rolar) funciona só no computador; em telas de toque o conteúdo já nasce visível. Não dependa dela para esconder nada.
5. **Fotos:** passe sempre `sizes` em `photo()` com a largura real que a foto ocupa; o navegador baixa o menor arquivo que serve. Em celulares com 3 pontos de tela por pixel, `photo()` pede o arquivo de ~2x (não dá para ver a diferença e pesa perto da metade). Foto que é a maior coisa da primeira tela leva `priority: true`.
6. **Abertura:** o `index.html` traz só o estilo da moldura (`tokens`, `base`, `components`, `shell`) e pede de uma vez os arquivos de JavaScript da moldura (`modulepreload`) e a fonte. O `js/boot.js` olha o endereço e já pede o que é da tela de entrada: a folha de estilo da área, o arquivo da tela e, no início, a imagem do primeiro banner (`assets/img/cz-morango.webp`). Se trocar a imagem do primeiro banner em `js/views/home.js`, troque em `js/boot.js` também. Tela nova não precisa entrar no `boot.js`: sem isso ela só começa a baixar um instante depois.
   - **Estilo por área:** as folhas `home`, `catalog`, `cart`, `account`, `customizer` e `cozinha` chegam com a primeira tela que precisa delas e ficam na página daí em diante, sempre na mesma ordem. Regra de uma folha de área tem de começar por uma classe da própria área (`.cart-…`, `.co-…`, `.acc-…`): regra solta mudaria outras telas conforme a ordem em que a pessoa navega.
   - **Próximas telas:** com a loja parada (depois que a tela de entrada terminou de carregar), o roteador carrega cardápio, item e carrinho, um por vez: a folha de estilo e o arquivo da tela com tudo o que ele importa. O primeiro toque em cada uma não vai à rede. Não roda com "economia de dados", sem internet, nem enquanto o personalizador 3D está aberto (`warmUp` em `js/router.js`).
7. **Fileiras que deslizam** (`.rail`, `.chips`) já vêm com `contain: inline-size`: podem ficar dentro de grade ou flex sem alargar a página. Se criar uma fileira própria com `overflow-x: auto`, faça o mesmo (ou dê `min-width: 0` à coluna).
8. **Para medir:** `python tools/perf_server.py 5180` e `BASE=http://localhost:5180/ node tools/perf.mjs depois` (resumo em `tools/out/perf/RELATORIO-DESEMPENHO.md`; o 3D tem medição própria em `tools/perf_cz.mjs`).

## Segurança

O que protege a loja hoje, o que cada pessoa que mexe no código precisa manter e o que só o servidor novo vai poder garantir. O relatório completo da revisão (ataques testados, provas) está em `tools/out/r5/plataforma/SEGURANCA.md`; para repetir os testes: `node tools/sec_check.mjs`.

### O que a loja faz

- **Política de segurança de conteúdo (CSP)**, no começo do `index.html`. Diz ao navegador de onde cada coisa pode vir. Mesmo que um texto malicioso entre na página, ele não roda script nem manda dados para outro site.

  | Tipo | De onde pode vir |
  |---|---|
  | Script | Arquivos da própria loja. Nada escrito dentro do HTML, nada de `eval`. A única exceção é o mapa de imports do Three.js, autorizado por um código (`sha256-…`) |
  | Estilo | Folhas da própria loja (`<link>`) e `style=""` nos elementos. `<style>` criado por código é barrado |
  | Imagem | A loja, imagens geradas na hora (`data:`, `blob:`) e `images.unsplash.com` (fotos de demonstração) |
  | Conexão (`fetch`) | A loja e `viacep.com.br` |
  | Som e vídeo | A loja e conteúdo gerado na hora |
  | Quadros, plug-ins | Nenhum |

  **Vai usar um serviço novo** (fotos em outro endereço, meio de pagamento, banco de dados)? Acrescente o endereço dele na linha certa da política, senão o navegador barra. **Mexeu no mapa de imports** do `index.html` ou no script do `404.html`? Rode `node tools/csp_hash.mjs --gravar` (ele recalcula o código). Esses dois scripts ficam em uma linha só de propósito.
- **Texto sempre escapado** (`html\`…\``) e **endereços conferidos** em `href`/`src` (`safeUrl`).
- **O que é relido do aparelho é conferido** (`js/store.js`): tipos, tamanhos, identificadores. Item do cardápio no carrinho é refeito pelo cardápio (preço, nome, foto, prazo), então mexer no preço guardado não adianta. Dados fora do formato são descartados em vez de derrubar a loja.
- **Sessão com validade:** depois de `SITE.sessionIdleDays` dias sem abrir a loja (30), ela pede a senha de novo. **Sair** tira do aparelho o carrinho (ele volta quando a pessoa entra de novo), a observação do pedido e os rascunhos do checkout.
- **Senha:** nunca é guardada; guarda-se uma derivação lenta dela (PBKDF2, sal aleatório por conta). Cinco erros seguidos pedem uma pausa.
- **Cartão:** só bandeira, final, nome e validade são guardados, e só se a cliente pedir. Número e CVV vivem apenas enquanto a tela de pagamento está aberta.
- **A loja não abre dentro de um quadro de outro site** (`js/boot.js` e `js/app.js`).
- **Resposta do ViaCEP** é tratada como texto de fora: campos limitados, estado só como sigla.
- **Nada de terceiros no código:** Three.js r160 e a fonte estão na própria loja (conferidos contra os originais em `tools/sec_check.mjs`). De fora vêm só as fotos de demonstração (Unsplash) e a busca de CEP (ViaCEP).
- **Service worker** (`sw.js`): guarda só arquivos da loja; nunca dados de ninguém nem respostas de outros sites.

### O que é limite do modo demonstração (só o servidor resolve)

Tudo o que a loja guarda fica no aparelho, e quem tem o aparelho na mão (ou consegue rodar código na página) pode ler e alterar. Os pontos abaixo estão marcados no código com `SÓ COM SERVIDOR`:

| Hoje | Com o servidor |
|---|---|
| A conta é uma ficha no aparelho; a senha só impede o uso casual | Login no servidor, sessão em cookie `HttpOnly`, limite de tentativas por conta e por rede |
| "Esqueci minha senha" troca a senha na hora | Link enviado ao e-mail da conta |
| O preço do bolo 3D vem do personalizador e é guardado na linha do carrinho | O servidor refaz a conta a partir da configuração do bolo antes de cobrar |
| Total, cupom, frete e agenda são calculados no navegador | O servidor recalcula tudo com os ids e quantidades e ignora valores vindos do navegador |
| "Primeiro pedido" do cupom olha os pedidos do aparelho | Limite de uso por pessoa no servidor |
| A agenda usa o relógio e o fuso do aparelho; as vagas são simuladas | Data e vagas conferidas pelo servidor, no horário de Cuiabá |
| Nada é cobrado pela loja: o pedido vai pelo WhatsApp e o pagamento é combinado lá (o Pix da tela do pedido é só demonstração; o checkout não pede cartão) | Só o aviso do meio de pagamento confirma; o número do cartão nem passa pelo código da loja |
| O pedido só chega à confeitaria quando o cliente envia a mensagem do WhatsApp | O pedido chega sozinho e a situação (confirmado, em produção, entregue) vem do servidor |
| A agenda mostra todo horário possível como livre; quem confirma é a confeitaria | Vagas de verdade por horário |
| Proteções por `<meta>` | Cabeçalhos HTTP: `Content-Security-Policy` com `frame-ancestors`, `Strict-Transport-Security`, `Permissions-Policy`, `X-Content-Type-Options` |
| Textos legais resumidos; sem tela de consentimento | Política de privacidade e termos completos, registro do aceite, pedido de exclusão de dados (LGPD) |

No GitHub Pages, todos os sites da mesma conta (`brunomoraes2919.github.io/…`) dividem o mesmo "cofre" do navegador: outro site publicado nessa conta poderia ler os dados da loja. Antes de vender de verdade, a loja precisa de endereço só dela (domínio próprio).

## Pedido pelo WhatsApp (enquanto não há servidor)

O pedido fechado fica só no aparelho do cliente. Quem leva o pedido até a confeitaria é o próprio cliente, com um toque:

- **Tela do pedido** (`js/views/order.js`): o primeiro cartão é **"Enviar pedido pelo WhatsApp"**. É um link comum (`https://wa.me/<SITE.whatsapp>?text=…`): o WhatsApp abre com a mensagem pronta e o cliente envia. A loja nunca abre o WhatsApp sozinha. "Ver a mensagem antes de enviar" mostra o texto e deixa copiar.
- **O número** vem de `SITE.whatsapp` (`js/data/site.js`), o único lugar para trocar. Enquanto for o número de exemplo, a tela avisa que é demonstração.
- **A mensagem** (`js/pedido-whatsapp.js`): número do pedido, itens com tamanho, quantidade e valor, recados, entrega ou retirada com dia e janela, endereço, quem recebe, código de entrega, forma de pagamento ("a combinar": nada é cobrado pelo site), total e observação. Bolo montado no 3D leva o resumo e o link "Ver em 3D". Quando o link passa da meta de tamanho (`LIMITES.alvo`), a mensagem é encurtada por etapas; acima do teto (`LIMITES.teto`), o botão copia o pedido completo e abre o WhatsApp para colar.
- **Situação do pedido** (`orders.statusOf` em `js/store.js`): só o que a loja sabe de verdade. "Falta enviar pelo WhatsApp" → (toque em enviar, `orders.markSent`) → "Aguardando confirmação da BOLAB" → "Encerrado" quando a data combinada passa. Pagamento, produção e entrega são combinados no WhatsApp; a loja não mostra "pago" nem "em produção". O Pix com QR Code continua na tela do pedido só como demonstração, recolhido, e não muda a situação. O checkout não pede cartão: sem meio de pagamento, número e CVV não teriam uso.
- **Ficha da cozinha** (`#/cozinha?…`, `js/views/cozinha.js`, `css/cozinha.css`): aberta pelo link que vai na mensagem, sem conta. Mostra a ficha de produção de cada bolo 3D (`js/customizer/ficha.js`), os itens do cardápio do mesmo pedido, dia e horário, "Abrir em 3D", "Copiar em texto" e "Imprimir" (folha limpa). O link leva só o que serve para produzir: `n` número do pedido, `d` dia, `h` janela, `m` entrega (`e`) ou retirada (`r`), `i=<produto>.<tamanho>.<quantidade>` e `b=<quantidade>.<bolo em texto>`. Nome, telefone, endereço e recados ficam no texto da mensagem, nunca no link. Tudo vai depois do `#`, que o navegador não envia a servidor nenhum.
- **Chá revelação:** o texto da mensagem nunca diz a cor e o link "Ver em 3D" é gerado sem ela (`encodeConfig(config, { secret: false })`). A confeitaria precisa da cor, então ela vai só dentro do link da cozinha, embaralhada no texto do bolo, e a tela só mostra depois do toque em "Mostrar a cor". Quem tiver o link e tocar ali vê a cor: segredo de verdade só com servidor.
- **Com servidor**, `orders.create` passa a entregar o pedido à confeitaria e este passo some; a mensagem pode continuar como comprovante.

## O Ateliê (o personalizador como simulador de confeiteiro)

`#/monte-seu-bolo` tem dois modos, guardados em `prefs.atelierMode`: **Ateliê** (padrão: cozinha em volta do bolo, animações de preparo, som, a Bô, gestos, jogo) e **rápido** (só o que é preciso para pedir). O botão fica no canto de cima do palco; a compra é a mesma nos dois. O contrato entre as partes está em `js/atelier/README.md`; a tela (`js/views/customizer.js`) só **avisa** o barramento (`js/atelier/bus.js`) e entrega um `host` a `js/atelier/ui/index.js`, que liga o resto.

- **Quando cada coisa chega.** O painel de opções aparece sem esperar o motor 3D (`engineLoad` em `customizer.js`; o roteador pede o motor em paralelo). Depois do primeiro quadro do bolo, com a loja ociosa, entra `js/atelier/ui/index.js`; ele liga a cena (`cake.atelier.setEnabled(true)`, que baixa `js/atelier/stage/**`), busca som e Bô e monta o jogo. Nada disso roda no modo rápido.
- **Som.** Nunca toca antes de um toque. Na primeira visita há o convite "Ligar o som do ateliê?" (com "Agora não"); sem resposta, nada é ligado e o alto-falante fica com um ponto. O que soa para cada evento está em `js/atelier/audio-map.js` (inclui `cue`, as marcas de som das animações, que a tela repassa da cena para o barramento). Sair da tela ou mandar o app para segundo plano silencia.
- **Bô.** É uma assistente de regras com voz gravada (etiqueta "assistente" sempre à vista), não IA generativa. Ela sugere e a tela aplica (`host.applyBo`). A voz só toca se o som foi aceito.
- **Composição do palco** (`css/atelier.css`): canto de cima à esquerda = som, modo e jogo; à direita = ferramentas (em coluna no celular); faixa de baixo = a Bô, o balão dela e os avisos de gesto. O enquadramento do bolo reserva essas áreas (`stageInsets` em `customizer.js`): nada cobre o bolo. Balão comprido cresce para baixo, sobre a borda do painel.
- **Gestos** (`js/atelier/ui/hands.js`), todos com saída por botão ou teclado: colocar peça com o dedo no topo ou na lateral (`config.decor.placed`, preço por unidade; `canPlace`/`nearestFree` de `occupancy.js` dizem onde cabe), tocar na borda para pingar a calda, acender e soprar as velas, girar o prato para alisar a cobertura. Com a cena carregada usam `pick`, `ghost`, `dripAt`, `candles` e `spread` de `cake.atelier`; se a cena não carregar, a conta de onde o dedo tocou é feita na tela (só o topo) e os demais gestos ficam de fora.
- **Revelação e lembranças** (`js/atelier/ui/reveal.js`, `card.js`): "Revelar meu bolo" no resumo (luz baixa, velas, sopro, confete), cartão do bolo com assinatura, vídeo da montagem (`cake.atelier.capture.video({ replay: true })`) e link do bolo.
- **Jogo** (`js/atelier/game/`): montado com `launcher: false`; quem abre é o botão "jogo" da coluna do ateliê. A comanda de uma encomenda fica ao lado dessa coluna (`--ag-x` em `css/atelier.css`).
- **Cenário**: bancada, vitrine ou festa — a troca fica dentro do painel "Fundo" (`prefs.atelierScene`; "Automático" = bancada nas etapas, vitrine no resumo).
- **Provas** (em `tools/`, servidor da cópia em `BASE`): `r5t_shots.mjs` + `r5t_sheet.py` (folhas de capturas), `r5t_sessao.mjs` (uma sessão inteira com tudo o que cada ação dispara), `r5t_cena.mjs` (a tela contra a cena e o jogo de verdade), `r5t_extra.mjs` (teclado, voltar do Android, reduzir movimento, deitado, 200%), `r5t_vaza.mjs` (20 entradas e saídas), `r5t_perf.mjs` (abertura). `sh r5t_tudo.sh` roda tudo.

## A chamada do "Monte seu bolo"

O personalizador é o diferencial da loja e aparece em muitos lugares: banner e faixa do início, convite no meio do cardápio, favoritos, tela do item, telas vazias, faixa de seções, barra inferior, rodapé e atendimento. **Todos os textos e o endereço saem de `js/data/montar.js`** (`MONTAR`). Para mudar a chamada (por exemplo, quando o simulador ganhar som e a assistente Bô), edite só esse arquivo.

- **Só prometa o que já está na tela do personalizador.** Hoje: montar o bolo camada por camada numa cozinha 3D (formato, massa, recheio, cobertura, acabamento e decoração) com o preço mudando a cada escolha; som (só depois de a pessoa aceitar); a assistente Bô (regras de confeitaria e voz gravada: nunca "pessoa" nem "IA"); gestos (girar o prato, colocar peça com o dedo, soprar as velas); a revelação do bolo, o cartão e o vídeo; o jogo de encomendas com figurinhas; e o modo rápido. A lista que vale é a do cabeçalho de `js/data/montar.js`.
- `MONTAR.fromPrice` ("a partir de R$ …") e `MONTAR.prepDays` ("de 2 a 4 dias") ficam escritos ali para o início e o cardápio não precisarem baixar as regras do personalizador (95 KB) só para mostrar um número. O teste `tools/tests/loja.test.mjs` confere os dois contra `js/customizer/pricing.js` e falha se alguém mudar os preços e esquecer de atualizar.
- Tela nova que convide ao personalizador: `import { MONTAR, montarFrom } from '../data/montar.js'` e use `MONTAR.href`, `MONTAR.title`, `MONTAR.cta`… O mesmo teste reclama de `#/monte-seu-bolo` escrito à mão.

## Acessibilidade (o que manter)

- **Títulos sem pular nível:** `productCard`, `productRow` e `optionGroupHead` aceitam `level` (2, 3 ou 4). Lista ou grade sem título de seção acima usa `level: 2`; linha abaixo de um subtítulo (h3) usa `level: 4`.
- **Alvos de toque de 44 px** mesmo quando o desenho é menor: a área extra vem de um `::before`/`::after` absoluto (veja `.add-btn`, `.chip`, `.section-link`). Fileira que desliza (`.chips`) recorta o que passa dela: por isso tem 4 px de respiro em cima e embaixo.
- **O link do nome cobre o card inteiro** (`.pcard__name a::after`, `z-index: 1`); botões de dentro do card ficam com `z-index: 2`. O card é um contexto de empilhamento próprio (`isolation: isolate`).
- **Erro de formulário** (`setFieldError`): a mensagem fica ligada ao campo por `aria-describedby` e some da descrição quando o erro é limpo.
- **Nota e estrelas** levam `role="img"` com a frase inteira ("Nota 4,9 de 5, 128 avaliações").
- Para conferir: `node tools/r5l_audit.mjs` (alvos, nomes, rótulos, títulos, contraste, texto a 200%), `node tools/r5l_break.mjs` (dados no pior caso) e `node tools/r5l_sheet_drag.mjs` (folha do celular).

## Presença na busca e instalação

- **Endereço oficial** em `SITE.url` (`js/data/site.js`). Ele também está escrito no `index.html` (canonical e cartão de compartilhamento), no `robots.txt` e no `sitemap.xml`. Para trocar tudo de uma vez: `node tools/trocar_endereco.mjs https://novo-endereco/`.
- **Por tela** (`js/seo.js`): título, descrição e dados estruturados (`Bakery` com endereço, telefone e horário; cardápio com preços; `Product` na tela do item) gerados de `site.js` e `products.js`. Notas e avaliações só entram quando `SITE.demo` for desligado (hoje são ilustrativas). `SITE.indexable: false` pede aos buscadores para não listar a loja.
- **Limite:** endereços com `#` não são páginas separadas para os buscadores nem para o WhatsApp: a loja inteira aparece como uma página e todo link compartilhado mostra o mesmo cartão. Páginas por produto dependem do servidor novo (endereços de verdade, como `/produto/chocolate-belga`).
- **Cartão de compartilhamento, ícone e capturas:** `node tools/og_image.mjs` gera `assets/og-bolab.jpg`, `assets/icon-maskable-512.png` e `assets/screens/*` a partir da logo e dos bolos do personalizador. Rode de novo ao trocar a logo, o destaque do início ou as fotos.
- **Instalação:** `manifest.webmanifest` traz os atalhos (Montar bolo, Cardápio, Pedidos), o ícone com margem de segurança e as capturas da janela "Instalar".

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

- `ui.js`: `html, raw, esc, safeUrl, closeTopDialog, icon, money, installments, dateLong, dateShort, dateTime, isoDate, toDate, plural, initials, masks, bindMasks, on, debounce, sleep, formData, applyErrors, setFieldError, clearFieldErrors, validators, cardBrand, toast, openDialog, confirmDialog, closeAllDialogs, observeReveal, pauseOffscreen, copyText, confetti`
- `store.js`: `store.on(evento, fn)`, `auth` (inclui `auth.touch()`), `cart`, `favs`, `savedCakes`, `addresses`, `cards`, `orders`, `schedule`, `chat`, `prefs`
- `components.js`: `photo, photoSrcset, mediaFallback, lineThumb, rating, stars, favButton, productCard, productRow, productMeta, sectionHead, chipRow, promoBanner, priceButton, optionGroupHead, listRow, dayLabel, slotLabel, prepLabel, qtyStepper, emptyState, pageHead, breadcrumb, notice, totalsSummary`
- `shell.js`: `startShell, receiveContext, openReceiveSheet`
- `data/products.js`: `PRODUCTS, SIZES, REVIEWS, getProduct, sizesOf, priceOf, isCake, searchProducts, relatedTo, addOns`
- `data/site.js`: `SITE, CATEGORIES, COUPONS, WALLET_COUPONS, ORDER_STEPS`
- `data/montar.js`: `MONTAR, montarPrice, montarFrom`

### Componentes mais usados

| Para | Use |
|---|---|
| Produto em grade | `productCard(p)` dentro de `.product-grid` |
| Produto em carrossel | `productCard(p, { compact: true })` dentro de `.rail` (com `.rail--grid` vira grade no computador; com `.rail--grid-md` e `--rail-cols-md` vira grade também no tablet). A largura do card é a padrão de `.rail` (160 px; 172 px a partir de 640 px): não defina `--rail-w` para card de produto |
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

`#/` início · `#/cardapio` (`?cat=&q=&ordem=&foco=busca`) · `#/produto/:id` · `#/favoritos` · `#/monte-seu-bolo` (`?bolo=<id salvo>&base=<id produto>&c=<bolo em texto>`) · `#/carrinho` · `#/checkout` · `#/pedidos` · `#/pedido/:id` (`?novo=1`) · `#/cozinha` (`?n=&d=&h=&m=&i=&b=`, ficha de produção aberta pelo link da mensagem do pedido) · `#/entrar` (`?next=&modo=cadastro`) · `#/conta` · `#/conta/dados` · `#/conta/enderecos` · `#/conta/pagamentos` · `#/conta/cupons` · `#/conta/indicar` · `#/atendimento`
