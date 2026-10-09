// BOLAB — página inicial.
import { html, icon, money, observeReveal, pauseOffscreen } from '../ui.js';
import { photo, productCard, stars } from '../components.js';
import { PRODUCTS, REVIEWS, isCake, ratingSummary } from '../data/products.js';

const SCORE = ratingSummary();
import { CATEGORIES, SITE } from '../data/site.js';
import { schedule } from '../store.js';
import { dateLong } from '../ui.js';

const STEPS = [
  { icon: 'cake', title: 'Escolha ou crie', text: 'Peça um dos nossos clássicos ou monte o seu bolo em 3D, camada por camada.' },
  { icon: 'calendar', title: 'Agende a entrega', text: 'Você escolhe o dia e a janela de horário. A gente chega na hora combinada.' },
  { icon: 'pix', title: 'Pague como preferir', text: `Pix com ${SITE.pix.discountPct}% de desconto ou cartão em até ${SITE.card.maxInstallments}x.` },
  { icon: 'gift', title: 'Receba fresquinho', text: 'Seu bolo é feito à mão no dia da entrega e vai embalado para presente.' },
];

const PERKS = [
  { icon: 'award', title: 'Feito só para você', text: 'Nada de bolo de vitrine. Cada encomenda começa do zero, no dia da sua entrega.' },
  { icon: 'leaf', title: 'Ingredientes de verdade', text: 'Chocolate belga, frutas frescas, manteiga e ovos caipiras. Sem pré-mistura.' },
  { icon: 'truck', title: 'Entrega com hora marcada', text: `Atendemos ${SITE.region}, com transporte refrigerado e cuidado em cada curva.` },
  { icon: 'shield-check', title: 'Garantia BOLAB', text: 'Se o seu bolo não chegar perfeito, a gente refaz ou devolve o seu dinheiro.' },
];

const FAQ = [
  {
    q: 'Com quanta antecedência preciso pedir?',
    a: 'A maioria dos bolos fica pronta em 24 horas. Bolos decorados e personalizados pedem 48 horas. No checkout você só vê as datas realmente disponíveis.',
  },
  {
    q: 'Como funciona o bolo personalizado em 3D?',
    a: 'Você escolhe formato, número de andares, massa, recheio, cobertura e decoração, vendo o bolo girar na tela a cada escolha. O preço atualiza na hora e o que você vê é o que a gente produz.',
  },
  {
    q: 'Vocês entregam em qual região?',
    a: `Entregamos em ${SITE.region}. Se preferir, você também pode retirar no nosso ateliê sem pagar frete.`,
  },
  {
    q: 'Quais são as formas de pagamento?',
    a: `Pix (com ${SITE.pix.discountPct}% de desconto) e cartão de crédito em até ${SITE.card.maxInstallments}x sem juros.`,
  },
  {
    q: 'Posso cancelar ou alterar meu pedido?',
    a: 'Sim, sem custo, enquanto o bolo não entrou em produção. Depois disso, fale com a gente pelo atendimento que encontramos a melhor solução.',
  },
];

function hero() {
  const first = schedule.earliest(24);
  return html`
    <section class="hero">
      <div class="container hero__grid">
        <div class="hero__copy">
          <span class="eyebrow">${icon('sparkles')} Confeitaria artesanal sob encomenda</span>
          <h1 class="hero__title display">O bolo que você imaginou, <em>do jeitinho que imaginou.</em></h1>
          <p class="hero__lead only-desktop">
            Escolha um dos nossos clássicos ou monte o seu em 3D — massa, recheio, cobertura e decoração — e receba em casa com hora marcada.
          </p>
          <p class="hero__lead only-mobile">Escolha um clássico ou monte o seu em 3D. A gente entrega com hora marcada.</p>
          <div class="hero__cta">
            <a class="btn btn--lg" href="#/monte-seu-bolo">${icon('sparkles')} Montar meu bolo em 3D</a>
            <a class="btn btn--lg btn--secondary only-desktop" href="#/cardapio">Ver cardápio</a>
            <a class="link-arrow hero__alt only-mobile" href="#/cardapio">ou ver o cardápio ${icon('arrow-right')}</a>
          </div>
          <ul class="hero__trust">
            <li>
              <span class="hero__stars">★★★★★</span>
              <span><strong>${SCORE.avg}</strong> em ${SCORE.countLabel} avaliações</span>
            </li>
            <li>${icon('calendar')}<span>Peça hoje, receba a partir de <strong>${dateLong(first).toLowerCase()}</strong></span></li>
          </ul>
        </div>

        <div class="hero__visual">
          <div class="hero__photo">${photo('hero', { w: 720, eager: true, priority: true, sizes: '(min-width: 900px) 46vw, 92vw' })}</div>
          <div class="hero__card hero__card--a">
            <span class="hero__card-icon">${icon('cube')}</span>
            <div>
              <strong>Personalizador 3D</strong>
              <span>Veja seu bolo antes de pedir</span>
            </div>
          </div>
          <div class="hero__card hero__card--b">
            <span class="hero__card-icon hero__card-icon--green">${icon('truck')}</span>
            <div>
              <strong>Entrega agendada</strong>
              <span>Grátis acima de R$ ${SITE.shipping.freeAbove}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function categories() {
  const cats = CATEGORIES.filter((c) => c.id !== 'todos');
  return html`
    <section class="section section--tight">
      <div class="container">
        <div class="cat-row">
          ${cats.map(
            (c) => html`
              <a class="cat-tile reveal" href="#/cardapio?cat=${c.id}">
                <span class="cat-tile__img">${photo(c.photo, { w: 220, alt: '', sizes: '(min-width: 900px) 116px, 84px' })}</span>
                <span class="cat-tile__label">${c.label}</span>
              </a>
            `,
          )}
        </div>
      </div>
    </section>
  `;
}

function bestSellers() {
  const list = PRODUCTS.filter(isCake)
    .sort((a, b) => Number(b.featured) - Number(a.featured) || b.reviews - a.reviews)
    .slice(0, 8);
  return html`
    <section class="section">
      <div class="container">
        <div class="section-head">
          <div>
            <span class="eyebrow">Os mais pedidos</span>
            <h2 class="section-title">Favoritos de <em>quem prova</em></h2>
          </div>
          <a class="link-arrow only-desktop" href="#/cardapio">Ver todo o cardápio ${icon('arrow-right')}</a>
        </div>
        <div class="product-grid product-grid--teaser">${list.map((p, i) => html`<div class="reveal" style="--reveal-delay:${(i % 4) * 60}ms">${productCard(p)}</div>`)}</div>
        <div class="section-foot only-mobile">
          <a class="btn btn--secondary btn--block" href="#/cardapio">Ver todo o cardápio</a>
        </div>
      </div>
    </section>
  `;
}

function customizerSpotlight() {
  const bullets = [
    'Formato, andares, massa e recheio de cada camada',
    'Mais de 15 cores de cobertura e 6 acabamentos',
    'Preço atualizado a cada escolha, sem surpresa',
    'O que você vê na tela é o que chega na sua mesa',
  ];
  return html`
    <section class="spot">
      <div class="container spot__grid">
        <div class="spot__visual reveal">
          <a class="spot__stage" href="#/monte-seu-bolo" aria-label="Abrir o personalizador 3D">
            <img class="spot__cake spot__cake--left" src="assets/img/cz-belga.webp" alt="" width="760" height="760" loading="lazy" decoding="async" />
            <img class="spot__cake spot__cake--right" src="assets/img/cz-festa.webp" alt="" width="760" height="760" loading="lazy" decoding="async" />
            <img
              class="spot__cake spot__cake--main"
              src="assets/img/cz-morango.webp"
              alt="Bolo rosa com calda branca, rosetas e frutas vermelhas, criado no personalizador 3D da BOLAB"
              width="760"
              height="760"
              loading="lazy"
              decoding="async"
            />
            <span class="spot__tag">${icon('cube')} Imagens reais do personalizador</span>
          </a>
          <div class="spot__chips" aria-hidden="true">
            <span>Massa de baunilha</span>
            <span>Recheio de morango e ninho</span>
            <span>Buttercream rosa</span>
            <span>Frutas frescas</span>
          </div>
        </div>
        <div class="spot__copy reveal">
          <span class="eyebrow eyebrow--light">${icon('cube')} Exclusivo BOLAB</span>
          <h2 class="section-title">Crie um bolo que <em>só existe na sua cabeça.</em></h2>
          <p class="section-lead">
            No nosso personalizador 3D você monta o bolo camada por camada e vê o resultado girando na tela, em tempo real. Em poucos toques ele está pronto para ir ao forno.
          </p>
          <ul class="spot__list">
            ${bullets.map((b) => html`<li>${icon('check')}<span>${b}</span></li>`)}
          </ul>
          <div class="spot__cta">
            <a class="btn btn--lg" href="#/monte-seu-bolo">${icon('sparkles')} Montar meu bolo em 3D</a>
            <span class="spot__price">bolos a partir de <strong>${money(69)}</strong></span>
          </div>
        </div>
      </div>
    </section>
  `;
}

function howItWorks() {
  return html`
    <section class="section">
      <div class="container">
        <div class="section-head section-head--center">
          <div>
            <span class="eyebrow">Simples assim</span>
            <h2 class="section-title">Do clique à <em>primeira fatia</em></h2>
          </div>
        </div>
        <ol class="how">
          ${STEPS.map(
            (s, i) => html`
              <li class="how__step reveal" style="--reveal-delay:${i * 80}ms">
                <span class="how__num">${i + 1}</span>
                <span class="how__icon">${icon(s.icon)}</span>
                <h3>${s.title}</h3>
                <p>${s.text}</p>
              </li>
            `,
          )}
        </ol>
      </div>
    </section>
  `;
}

function perks() {
  return html`
    <section class="section section--cream">
      <div class="container perks__grid">
        <div class="perks__photo reveal">${photo('atelier', { w: 640, sizes: '(min-width: 900px) 40vw, 92vw' })}</div>
        <div>
          <span class="eyebrow">Por que BOLAB</span>
          <h2 class="section-title">Feito à mão, <em>com hora para chegar</em></h2>
          <ul class="perks">
            ${PERKS.map(
              (p, i) => html`
                <li class="reveal" style="--reveal-delay:${i * 60}ms">
                  <span class="perks__icon">${icon(p.icon)}</span>
                  <div>
                    <h3>${p.title}</h3>
                    <p>${p.text}</p>
                  </div>
                </li>
              `,
            )}
          </ul>
        </div>
      </div>
    </section>
  `;
}

function reviews() {
  const list = REVIEWS.filter((r) => r.rating === 5).slice(0, 6);
  return html`
    <section class="section">
      <div class="container">
        <div class="section-head">
          <div>
            <span class="eyebrow">Quem pediu, aprovou</span>
            <h2 class="section-title">Histórias <em>doces de verdade</em></h2>
            <p class="reviews__inline only-mobile">${stars(5)} <strong>${SCORE.avg}</strong> · ${SCORE.countLabel} avaliações</p>
          </div>
          <div class="reviews__score only-desktop">
            <strong>${SCORE.avg}</strong>
            <div>${stars(5)}<span>${SCORE.countLabel} avaliações</span></div>
          </div>
        </div>
        <div class="reviews" data-reviews>
          ${list.map((r) => {
            const product = PRODUCTS.find((p) => p.id === r.productId);
            return html`
              <figure class="review reveal">
                ${stars(r.rating)}
                <blockquote>“${r.text}”</blockquote>
                <figcaption>
                  <span class="avatar avatar--sm">${r.name[0]}</span>
                  <div>
                    <strong>${r.name}</strong>
                    <span>${product ? `pediu ${product.name}` : 'criou um bolo no 3D'}</span>
                  </div>
                </figcaption>
              </figure>
            `;
          })}
        </div>
      </div>
    </section>
  `;
}

function partyAddOns() {
  const list = PRODUCTS.filter((p) => !isCake(p)).slice(0, 4);
  return html`
    <section class="section section--tight-top">
      <div class="container">
        <div class="section-head">
          <div>
            <span class="eyebrow">Para a mesa do bolo</span>
            <h2 class="section-title">Complete <em>a festa</em></h2>
          </div>
          <a class="link-arrow only-desktop" href="#/cardapio?cat=acess">Ver todos ${icon('arrow-right')}</a>
        </div>
        <div class="product-grid product-grid--rail">${list.map((p) => html`<div class="reveal">${productCard(p)}</div>`)}</div>
      </div>
    </section>
  `;
}

function faq() {
  return html`
    <section class="section section--cream" id="duvidas">
      <div class="container container--narrow">
        <div class="section-head section-head--center">
          <div>
            <span class="eyebrow">Dúvidas frequentes</span>
            <h2 class="section-title">Tudo o que você <em>quer saber</em></h2>
          </div>
        </div>
        <div class="accordion">
          ${FAQ.map(
            (f) => html`
              <details>
                <summary>${f.q}${icon('plus')}</summary>
                <div class="accordion__body">${f.a}</div>
              </details>
            `,
          )}
        </div>
        <p class="faq__more">Ainda com dúvida? <a class="link" href="#/atendimento">Fale com a gente</a></p>
      </div>
    </section>
  `;
}

function finalCta() {
  return html`
    <section class="section">
      <div class="container">
        <div class="final-cta reveal">
          <div class="final-cta__photo">${photo('celebration', { w: 900, sizes: '(min-width: 900px) 50vw, 92vw', alt: '' })}</div>
          <div class="final-cta__body">
            <h2 class="section-title">Tem uma data especial chegando?</h2>
            <p>Garanta o seu bolo agora e escolha o dia da entrega. No primeiro pedido, 10% OFF com o cupom <strong>BOLAB10</strong>.</p>
            <div class="hero__cta">
              <a class="btn btn--lg" href="#/monte-seu-bolo">${icon('sparkles')} Montar meu bolo</a>
              <a class="btn btn--lg btn--secondary" href="#/cardapio">Escolher no cardápio</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

/* A página é montada em duas partes. O começo (o que cabe nas primeiras telas) entra na hora;
   o resto entra logo depois da primeira pintura. O resultado final é o mesmo, mas a pessoa vê a
   loja mais cedo: o navegador não precisa calcular a página inteira (8 telas de altura no
   celular) antes de mostrar a primeira. */
const firstPart = () => html`${hero()} ${categories()} ${bestSellers()}`;
const secondPart = () => html`${customizerSpotlight()} ${reviews()} ${howItWorks()} ${perks()} ${partyAddOns()} ${faq()} ${finalCta()}`;

export default {
  layout: 'default',
  render(ctx) {
    // Voltando pelo histórico, a página vem inteira de uma vez: o roteador precisa da altura
    // completa para devolver a rolagem ao ponto onde a pessoa estava.
    if (ctx?.restoring) return html`${firstPart()} ${secondPart()}`;
    return html`${firstPart()}<div class="home-rest" data-home-rest></div>`;
  },
  mount(root) {
    let offPause = () => {};
    let waiting = 0;
    let frame = 0;

    const wire = () => {
      observeReveal(root);
      // No acordeão, abrir uma pergunta fecha as outras.
      root.querySelectorAll('.accordion details').forEach((d) => {
        d.addEventListener('toggle', () => {
          if (d.open) root.querySelectorAll('.accordion details[open]').forEach((o) => o !== d && (o.open = false));
        });
      });
      // Os bolos e os cartões que flutuam só se mexem enquanto estão à vista.
      offPause = pauseOffscreen(root.querySelectorAll('.hero__visual, .spot__stage'));
    };

    const slot = root.querySelector('[data-home-rest]');
    if (!slot) {
      wire();
    } else {
      observeReveal(root);
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
      clearTimeout(waiting);
      offPause();
    };
  },
};
