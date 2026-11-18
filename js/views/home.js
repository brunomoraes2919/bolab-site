// BOLAB — início: a vitrine da loja. A primeira tela mostra onde e quando entregamos, a busca,
// as promoções e os mais pedidos com preço; o texto institucional fica no fim, bem curto.
import { html, icon, money, on, toast, dateShort } from '../ui.js';
import { photo, productCard, productRow, sectionHead, chipRow, promoBanner, listRow, stars, dayLabel, slotLabel, lineThumb } from '../components.js';
import { PRODUCTS, REVIEWS, isCake, ratingSummary, getProduct } from '../data/products.js';
import { CATEGORIES, SITE } from '../data/site.js';
import { MONTAR, montarPrice, montarFrom } from '../data/montar.js';
import { auth, orders } from '../store.js';
import { receiveContext } from '../shell.js';

const SCORE = ratingSummary();
const CATS = CATEGORIES.filter((c) => c.id !== 'todos');
const CAKES = PRODUCTS.filter(isCake).sort((a, b) => Number(b.featured) - Number(a.featured) || b.reviews - a.reviews);
const ADDONS = PRODUCTS.filter((p) => !isCake(p));

/* Frases curtas para os atalhos de categoria do computador. As descrições de js/data/site.js são
   frases inteiras: no atalho eram cortadas com "…" ("Ingredientes nobres e…"). */
const CAT_HINT = { premium: 'Receitas de ateliê', trad: 'Os que todo mundo ama', inf: 'Festas cheias de cor', acess: 'Velas, toppers e kits' };

/** "R$ 250" (sem os centavos quando são zero). */
const brl = (v) => money(v).replace(',00', '');

const STEPS = [
  { title: 'Escolha', text: 'Um bolo do cardápio ou monte o seu em 3D.' },
  { title: 'Agende', text: 'Você define o dia e o horário.' },
  { title: 'Pague', text: `Pix com ${SITE.pix.discountPct}% OFF ou cartão em até ${SITE.card.maxInstallments}x.` },
  { title: 'Receba', text: 'Em casa, na hora marcada, ou retire no ateliê.' },
];

const FAQ = [
  {
    q: 'Com quanta antecedência preciso pedir?',
    a: `Os bolos do cardápio ficam prontos em 24 a 48 h. Os montados em 3D pedem ${MONTAR.prepDays}, conforme o tamanho e a decoração. Ao fechar o pedido você só vê as datas disponíveis.`,
  },
  {
    q: 'Onde vocês entregam e quanto custa?',
    a: `Em ${SITE.region}, por ${money(SITE.shipping.fee)}. Acima de ${brl(SITE.shipping.freeAbove)} a entrega é grátis. Também dá para retirar no ateliê, sem custo.`,
  },
  MONTAR.faq, // a pergunta sobre o bolo em 3D vem de js/data/montar.js
  {
    q: 'Quais são as formas de pagamento?',
    a: `Pix com ${SITE.pix.discountPct}% de desconto ou cartão de crédito em até ${SITE.card.maxInstallments}x sem juros.`,
  },
  {
    q: 'Posso cancelar ou alterar o pedido?',
    a: 'Sim, sem custo, enquanto o bolo não entrou em produção. Depois disso, fale com o atendimento.',
  },
];

/* ───────── Topo: busca, informações de entrega, promoções, categorias ───────── */

/** Chips de informação: data real da primeira entrega, taxa, frete grátis e retirada. */
function infoChips() {
  const ctx = receiveContext();
  const day = dayLabel(ctx.earliest);
  const { fee, freeAbove } = SITE.shipping;
  const items =
    ctx.mode === 'pickup'
      ? [
          { icon: 'calendar', label: `Retire a partir de ${day}` },
          { icon: 'store', label: 'Retirada grátis', tone: 'positive' },
          { icon: 'map-pin', label: SITE.pickup.address },
          { icon: 'clock', label: SITE.hours },
        ]
      : [
          { icon: 'calendar', label: `Receba a partir de ${day}` },
          { icon: 'truck', label: `Entrega ${money(fee)}` },
          { icon: 'check-circle', label: `Grátis acima de ${brl(freeAbove)}`, tone: 'positive' },
          { icon: 'store', label: 'Retirada grátis' },
        ];
  return html`<div data-home-info>${chipRow(items.map((it) => ({ ...it, info: true })), { label: 'Entrega e retirada', cls: 'home-info' })}</div>`;
}

/* Se trocar a imagem do primeiro banner, troque também o arquivo pedido em js/boot.js.
   O texto do primeiro banner (o convite ao personalizador) vem de js/data/montar.js. */
function promos() {
  // Quem já fez um pedido não pode mais usar o cupom de primeiro pedido: no lugar entra o Pix.
  const returning = auth.isLogged() && orders.list().some((o) => !o.canceled);
  const list = [
    promoBanner({
      tone: 'stage',
      tag: MONTAR.tag,
      title: MONTAR.title,
      text: `${MONTAR.line} ${montarFrom()}`,
      cta: MONTAR.cta,
      href: MONTAR.href,
      img: 'assets/img/cz-morango.webp',
      cutout: true,
      eager: true,
    }),
    returning
      ? promoBanner({
          tone: 'action',
          title: `${SITE.pix.discountPct}% OFF pagando no Pix`,
          text: 'Aprovação na hora.',
          cta: 'Ver cardápio',
          href: '#/cardapio',
          iconName: 'pix',
        })
      : promoBanner({
          tone: 'action',
          title: '10% OFF no 1º pedido',
          text: 'Toque para copiar o cupom.',
          code: 'BOLAB10',
          iconName: 'ticket',
        }),
    promoBanner({
      tone: 'green',
      title: `Entrega grátis acima de ${brl(SITE.shipping.freeAbove)}`,
      text: `Em ${SITE.region}.`,
      cta: 'Ver cardápio',
      href: '#/cardapio',
      iconName: 'truck',
    }),
    promoBanner({
      tag: 'Para a festa',
      title: 'Velas, toppers e kits',
      text: `A partir de ${money(Math.min(...ADDONS.map((p) => p.price)))}.`,
      cta: 'Completar a festa',
      href: '#/cardapio?cat=acess',
      photoKey: 'p15',
    }),
  ];
  return html`
    <div class="promos" data-promos role="group" aria-label="Promoções">${list}</div>
    <div class="promos__dots" data-promo-dots aria-hidden="true">${list.map((_, i) => html`<i class="${i === 0 ? 'is-on' : ''}"></i>`)}</div>
  `;
}

function categories() {
  const tile = ({ href, label, desc, media, cls = '' }) => html`
    <li>
      <a class="cat ${cls}" href="${href}">
        <span class="cat__img">${media}</span>
        <span class="cat__text"><strong class="cat__label">${label}</strong><span class="cat__desc">${desc}</span></span>
      </a>
    </li>
  `;
  return html`
    <nav class="cats" aria-label="Categorias">
      <ul class="cats__row">
        ${tile({
          href: MONTAR.href,
          label: MONTAR.short,
          desc: MONTAR.shortDesc,
          cls: 'cat--3d',
          media: html`<img src="assets/img/cz-festa.webp" alt="" width="760" height="760" decoding="async" />`,
        })}
        ${CATS.map((c) =>
          tile({ href: `#/cardapio?cat=${c.id}`, label: c.label, desc: CAT_HINT[c.id] || c.desc, media: photo(c.photo, { w: 144, alt: '', sizes: '64px', eager: true }) }),
        )}
        ${tile({ href: '#/cardapio', label: 'Ver tudo', desc: `${PRODUCTS.length} itens`, cls: 'cat--all', media: icon('grid') })}
      </ul>
    </nav>
  `;
}

function top() {
  return html`
    <section class="hero home-top" aria-label="Loja BOLAB">
      <div class="container">
        <h1 class="sr-only">BOLAB — delivery de bolos artesanais em ${SITE.region}</h1>
        <form class="search-field home-search only-mobile" role="search" data-search>
          ${icon('search')}
          <input type="search" name="q" placeholder="Buscar bolo, sabor ou ocasião" aria-label="Buscar no cardápio" autocomplete="off" enterkeyhint="search" />
        </form>
        ${infoChips()} ${promos()} ${categories()}
      </div>
    </section>
  `;
}

/* ───────── Pedido em andamento (só para quem tem um pedido a caminho) ───────── */
function activeOrder() {
  if (!auth.isLogged()) return '';
  const found = orders
    .list()
    .map((o) => ({ o, st: orders.statusOf(o) }))
    .find(({ st }) => !st.canceled && st.id !== 'delivered');
  if (!found) return '';
  const { o, st } = found;
  const pickup = o.delivery.mode === 'pickup';
  return html`
    <section class="section home-sec" aria-label="Pedido em andamento">
      <div class="container">
        <div class="card track">
          ${listRow({
            iconName: pickup ? 'store' : 'truck',
            title: st.label,
            // sem o número do pedido: no celular ele era cortado, e "Acompanhar" já leva ao pedido
            desc: `${pickup ? 'Retirada' : 'Entrega'} ${dayLabel(o.delivery.date)} · ${slotLabel(o.delivery.slot)}`,
            href: `#/pedido/${o.id}`,
            trail: 'Acompanhar',
          })}
        </div>
      </div>
    </section>
  `;
}

/* ───────── Peça de novo (só para quem já pediu) ───────── */
const isDone = (st) => !st.canceled && st.index === st.steps.length - 1;
function orderAgain() {
  if (!auth.isLogged()) return '';
  const list = orders
    .list()
    // só pedidos já entregues ou retirados: o que está a caminho aparece no acompanhamento
    .filter((o) => o.items?.length && isDone(orders.statusOf(o)))
    .slice(0, 3);
  if (!list.length) return '';
  return html`
    <section class="section home-sec" aria-labelledby="again-t">
      <div class="container">
        ${sectionHead('Peça de novo', { href: '#/pedidos', label: 'Meus pedidos', id: 'again-t' })}
        <div class="rail rail--grid rail--grid-md again">
          ${list.map((o) => {
            const first = o.items[0];
            const more = o.items.length - 1;
            return html`
              <article class="again__card">
                <a class="again__main" href="#/pedido/${o.id}" aria-label="Ver o pedido ${o.id}">
                  <span class="again__thumb">${lineThumb(first, { w: 112 })}</span>
                  <span class="again__body">
                    <strong class="again__name">${first.name}</strong>
                    <span class="again__meta">${more > 0 ? `+ ${more} ${more === 1 ? 'item' : 'itens'} · ` : ''}${dateShort(o.createdAt)} · ${money(o.totals.total)}</span>
                  </span>
                </a>
                <button class="btn btn--sm btn--soft again__btn" type="button" data-reorder="${o.id}">${icon('repeat')} Pedir de novo</button>
              </article>
            `;
          })}
        </div>
      </div>
    </section>
  `;
}

/* ───────── Mais pedidos ───────── */
function bestSellers() {
  return html`
    <section class="section home-sec" aria-labelledby="best-t">
      <div class="container">
        ${sectionHead('Mais pedidos', { href: '#/cardapio', id: 'best-t' })}
        <div class="rail rail--grid rail--grid-md best">${CAKES.slice(0, 6).map((p, i) => productCard(p, { compact: true, eager: i < 3, priority: i < 2 }))}</div>
      </div>
    </section>
  `;
}

/* ───────── Faixa do personalizador 3D ─────────
   O convite grande do início. Os textos vêm de js/data/montar.js (um lugar só para a loja toda);
   aqui fica só o desenho: palco escuro, os bolos do próprio personalizador e as etapas em fila.
   Os três bolos são inspirações novas (MONTAR.stage); as miniaturas deles têm 760 px, como pede o palco. */
function customizerBanner() {
  const cake = (id, cls) => html`<img class="cz3d__cake ${cls}" src="assets/img/cz-${id}.webp" alt="" width="760" height="760" loading="lazy" decoding="async" />`;
  return html`
    <section class="section home-sec" aria-label="${MONTAR.name}">
      <div class="container">
        <a class="cz3d" href="${MONTAR.href}">
          <span class="cz3d__copy">
            <span class="cz3d__tag">${icon('cube')} ${MONTAR.tag}</span>
            <strong class="cz3d__title">${MONTAR.title}</strong>
            <span class="cz3d__text">${MONTAR.text}</span>
            <span class="cz3d__foot">
              <span class="btn btn--white btn--sm cz3d__btn">${MONTAR.cta} ${icon('chevron-right')}</span>
              <span class="cz3d__price">a partir de <strong>${montarPrice()}</strong></span>
            </span>
          </span>
          <span class="cz3d__stage" aria-hidden="true">${cake(MONTAR.stage.c, 'cz3d__cake--c')} ${cake(MONTAR.stage.b, 'cz3d__cake--b')} ${cake(MONTAR.stage.a, 'cz3d__cake--a')}</span>
          <span class="cz3d__steps">
            <span class="sr-only">Etapas: </span>
            ${MONTAR.steps.map((step, i) => html`<span class="cz3d__step">${i ? icon('chevron-right') : ''}${step}</span>`)}
          </span>
        </a>
      </div>
    </section>
  `;
}

/* ───────── Cardápio em lista, por categoria ───────── */
function menuPreview() {
  const groups = CATS.map((c) => ({ c, list: CAKES.filter((p) => p.cat === c.id) })).filter((g) => g.list.length);
  return html`
    <section class="section home-sec" aria-labelledby="menu-t">
      <div class="container">
        ${sectionHead('Cardápio', { href: '#/cardapio', id: 'menu-t', sub: 'Sob encomenda, prontos em 24 a 48 h.' })}
        <div class="menu-groups">
          ${groups.map(
            (g) => html`
              <div class="menu-group">
                <div class="menu-group__head">
                  <h3 class="menu-group__title">${g.c.label} <span>${g.list.length}</span></h3>
                  <a class="section-link" href="#/cardapio?cat=${g.c.id}" aria-label="Ver todos: ${g.c.label}">Ver todos${icon('chevron-right')}</a>
                </div>
                <div class="menu-list">${g.list.slice(0, 4).map((p) => productRow(p, { level: 4 }))}</div>
              </div>
            `,
          )}
        </div>
        <a class="btn btn--secondary btn--block menu-more" href="#/cardapio">Ver cardápio completo</a>
      </div>
    </section>
  `;
}

/* ───────── Complete a festa ───────── */
function addOnsRail() {
  if (!ADDONS.length) return '';
  return html`
    <section class="section home-sec" aria-labelledby="festa-t">
      <div class="container">
        ${sectionHead('Complete a festa', { href: '#/cardapio?cat=acess', id: 'festa-t', sub: 'Chegam junto com o bolo.' })}
        <div class="rail rail--grid rail--grid-md addons">${ADDONS.map((p) => productCard(p, { compact: true }))}</div>
      </div>
    </section>
  `;
}

/* ───────── Avaliações (ilustrativas enquanto a loja está em demonstração) ───────── */
function reviews() {
  const list = REVIEWS.filter((r) => r.rating === 5 && (r.productId === 'custom' || getProduct(r.productId))).slice(0, 8);
  if (!list.length) return '';
  return html`
    <section class="section home-sec" aria-labelledby="rev-t">
      <div class="container">
        <div class="section-head">
          <div>
            <h2 class="section-title" id="rev-t">Avaliações</h2>
            ${SITE.demo ? html`<p class="section-sub">Avaliações de exemplo.</p>` : ''}
          </div>
          <p class="score">${icon('star')}<strong>${SCORE.avg}</strong><span>${SCORE.countLabel} avaliações</span></p>
        </div>
        <div class="rail rail--grid rail--grid-md reviews">
          ${list.map((r) => {
            const product = getProduct(r.productId);
            return html`
              <figure class="review">
                <figcaption class="review__head">
                  <span class="avatar avatar--sm" aria-hidden="true">${r.name[0]}</span>
                  <span class="review__who"><strong>${r.name}</strong>${stars(r.rating)}</span>
                </figcaption>
                <blockquote>${r.text}</blockquote>
                <span class="review__product">${product ? `Pediu ${product.name}` : 'Montou o bolo no 3D'}</span>
              </figure>
            `;
          })}
        </div>
      </div>
    </section>
  `;
}

/* ───────── Como funciona e dúvidas (curtos, no fim) ───────── */
function howItWorks() {
  return html`
    <section class="section home-sec" aria-labelledby="how-t">
      <div class="container">
        ${sectionHead('Como funciona', { id: 'how-t' })}
        <ol class="card how">
          ${STEPS.map(
            (s, i) => html`
              <li class="how__step">
                <span class="how__num" aria-hidden="true">${i + 1}</span>
                <span class="how__body"><strong>${s.title}</strong><span>${s.text}</span></span>
              </li>
            `,
          )}
        </ol>
      </div>
    </section>
  `;
}

function faq() {
  return html`
    <section class="section home-sec" id="duvidas" aria-labelledby="faq-t">
      <div class="container">
        ${sectionHead('Dúvidas', { href: '#/atendimento', label: 'Falar com a gente', id: 'faq-t' })}
        <div class="card faq accordion">
          ${FAQ.map(
            (f) => html`
              <details>
                <summary>${f.q}${icon('plus')}</summary>
                <div class="accordion__body">${f.a}</div>
              </details>
            `,
          )}
        </div>
      </div>
    </section>
  `;
}

/* A página é montada em duas partes. O começo (o que cabe nas primeiras telas) entra na hora;
   o resto entra logo depois da primeira pintura. O resultado final é o mesmo, mas a pessoa vê a
   loja mais cedo: o navegador não precisa calcular a página inteira antes de mostrar o topo. */
/* Quem tem um pedido a caminho vê o acompanhamento e logo depois os mais pedidos (com preço na
   primeira tela); "Peça de novo" desce uma seção. Sem pedido a caminho, "Peça de novo" vem antes. */
const firstPart = () => {
  const tracking = activeOrder();
  return tracking ? html`${top()} ${tracking} ${bestSellers()} ${orderAgain()}` : html`${top()} ${orderAgain()} ${bestSellers()}`;
};
const secondPart = () => html`${customizerBanner()} ${menuPreview()} ${addOnsRail()} ${reviews()} ${howItWorks()} ${faq()}`;

export default {
  layout: 'default',
  render(ctx) {
    // Voltando pelo histórico, a página vem inteira de uma vez: o roteador precisa da altura
    // completa para devolver a rolagem ao ponto onde a pessoa estava.
    if (ctx?.restoring) return html`<div class="home">${firstPart()} ${secondPart()}</div>`;
    return html`<div class="home">${firstPart()}<div class="home-rest" data-home-rest></div></div>`;
  },
  mount(root) {
    let waiting = 0;
    let frame = 0;
    let dotsFrame = 0;

    // Bolinhas do carrossel de promoções acompanham a rolagem.
    const rail = root.querySelector('[data-promos]');
    const dots = [...root.querySelectorAll('[data-promo-dots] i')];
    const syncDots = () => {
      dotsFrame = 0;
      const first = rail.firstElementChild;
      if (!first) return;
      const step = first.getBoundingClientRect().width + 10;
      const max = rail.scrollWidth - rail.clientWidth;
      const index = rail.scrollLeft >= max - 4 ? dots.length - 1 : Math.round(rail.scrollLeft / step);
      dots.forEach((d, i) => d.classList.toggle('is-on', i === index));
    };
    rail?.addEventListener(
      'scroll',
      () => {
        if (!dotsFrame) dotsFrame = requestAnimationFrame(syncDots);
      },
      { passive: true },
    );

    // "Pedir de novo": devolve os itens do pedido ao carrinho.
    on(root, 'click', '[data-reorder]', (_ev, btn) => {
      const n = orders.reorder(btn.dataset.reorder);
      if (n) toast(n === 1 ? 'Item de volta no carrinho' : `${n} itens de volta no carrinho`, { type: 'success', action: { label: 'Ver carrinho', href: '#/carrinho' } });
    });

    // Trocou entrega/retirada na folha do cabeçalho: os chips de informação acompanham.
    const onReceive = () => {
      const slot = root.querySelector('[data-home-info]');
      if (!slot) return;
      const tpl = document.createElement('template');
      tpl.innerHTML = String(infoChips());
      slot.replaceWith(tpl.content);
    };
    window.addEventListener('bolab:receive', onReceive);

    // No acordeão, abrir uma pergunta fecha as outras.
    const wire = () => {
      root.querySelectorAll('.accordion details').forEach((d) => {
        d.addEventListener('toggle', () => {
          if (d.open) root.querySelectorAll('.accordion details[open]').forEach((o) => o !== d && (o.open = false));
        });
      });
    };

    const slot = root.querySelector('[data-home-rest]');
    if (!slot) {
      wire();
    } else {
      // um quadro para a primeira parte aparecer; depois entra o resto
      frame = requestAnimationFrame(() => {
        waiting = setTimeout(() => {
          const tpl = document.createElement('template');
          tpl.innerHTML = String(secondPart());
          slot.replaceWith(tpl.content);
          wire();
        }, 0);
      });
    }

    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(dotsFrame);
      clearTimeout(waiting);
      window.removeEventListener('bolab:receive', onReceive);
    };
  },
};
