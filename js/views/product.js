// BOLAB — página de produto: foto, tamanho, preço, prazo e tudo o que ajuda a decidir.
import { html, icon, money, installments, dateLong, dateShort, plural, on, toast, copyText, observeReveal } from '../ui.js';
import { photo, stars, favButton, productCard, qtyStepper, breadcrumb, notice } from '../components.js';
import { REVIEWS, getProduct, sizesOf, priceOf, isCake, relatedTo, addOns, searchProducts } from '../data/products.js';
import { CATEGORIES, SITE } from '../data/site.js';
import { cart, schedule } from '../store.js';
import { navigate } from '../router.js';

/** O que a cozinha manipula (está nas dúvidas frequentes): base do aviso de traços. */
const KITCHEN_ALLERGENS = ['Glúten', 'Leite', 'Ovos', 'Castanhas'];

const CARE_TIPS = [
  'Guarde na geladeira até a hora da festa.',
  'Tire de 20 a 30 minutos antes de servir: a massa e o recheio ficam no ponto.',
  'Sobrou? Em pote fechado, na geladeira, fica gostoso por até 3 dias.',
  'Se for retirar no ateliê, leve o bolo no piso do carro, sempre na horizontal.',
];

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Valores da escolha atual (tamanho × quantidade). */
function quote(p, size, qty) {
  const unit = priceOf(p, size || 'p');
  const total = round2(unit * qty);
  const { maxInstallments, minInstallment } = SITE.card;
  return {
    unit,
    total,
    pix: round2(total - round2(total * (SITE.pix.discountPct / 100))), // mesma conta do carrinho
    parcels: Math.max(1, Math.min(maxInstallments, Math.floor(total / minInstallment))),
    freeShipping: total >= SITE.shipping.freeAbove,
  };
}

function listText(items) {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}` : items[0] || '';
}

/** Distribuição de notas coerente com a média e o total de avaliações do produto. */
function starBars(avg, count) {
  const gap = Math.max(0, 5 - avg);
  const n4 = Math.round(count * gap * 0.5);
  const n3 = Math.round(count * gap * 0.15);
  const n2 = Math.round(count * gap * 0.04);
  const n1 = Math.round(count * gap * 0.02);
  const counts = [Math.max(0, count - n4 - n3 - n2 - n1), n4, n3, n2, n1];
  const pcts = counts.map((n) => (count ? Math.round((n / count) * 100) : 0));
  pcts[0] = Math.max(0, 100 - pcts.slice(1).reduce((s, v) => s + v, 0));
  return pcts.map((pct, i) => ({ star: 5 - i, pct }));
}

/* ───────── Blocos ───────── */
function priceBlock(q, qty) {
  return html`
    <div class="pd-price__main">
      <span class="pd-price__value">${money(q.total)}</span>
      ${qty > 1 ? html`<span class="pd-price__each">${qty} × ${money(q.unit)}</span>` : ''}
    </div>
    <ul class="pd-price__lines">
      <li>${icon('credit-card')}<span>${q.parcels > 1 ? `ou ${installments(q.total, q.parcels)}` : 'no cartão de crédito'}</span></li>
      <li class="pd-price__pix">
        ${icon('pix')}<span><strong>${money(q.pix)}</strong> no Pix</span><span class="badge badge--green">${SITE.pix.discountPct}% OFF</span>
      </li>
    </ul>
  `;
}

function shippingPerk(q) {
  return q.freeShipping
    ? html`<strong class="pd-perks__free">Entrega grátis neste pedido</strong><span>Com hora marcada em ${SITE.region}.</span>`
    : html`<strong>Entrega por ${money(SITE.shipping.fee)}, com hora marcada</strong><span>Grátis em pedidos acima de R$ ${SITE.shipping.freeAbove}.</span>`;
}

function sizeSelector(p) {
  const sizes = sizesOf(p);
  if (!sizes.length) return '';
  return html`
    <div class="pd-sizes" role="radiogroup" aria-labelledby="pd-size-label">
      <div class="pd-label" id="pd-size-label">Tamanho <span>diâmetro e quantas fatias rende</span></div>
      <div class="pd-sizes__grid">
        ${sizes.map(
          (s, i) => html`
            <label class="pd-size">
              <input
                type="radio"
                name="size"
                value="${s.id}"
                aria-label="Tamanho ${s.label}: ${s.diameter}, ${s.serves}, ${money(priceOf(p, s.id))}"
                ${i === 0 ? html`checked` : ''}
              />
              <span class="pd-size__check">${icon('check')}</span>
              <span class="pd-size__letter">${s.label}</span>
              <span class="pd-size__dim">${s.diameter}</span>
              <span class="pd-size__serves">${s.serves}</span>
              <span class="pd-size__price">${money(priceOf(p, s.id))}</span>
            </label>
          `,
        )}
      </div>
    </div>
  `;
}

function details(p, firstDate) {
  const cake = isCake(p);
  const item = (title, body, open = false) => html`
    <details ${open ? html`open` : ''}>
      <summary>${title}${icon('chevron-down')}</summary>
      <div class="accordion__body">${body}</div>
    </details>
  `;
  const traces = cake ? KITCHEN_ALLERGENS.filter((a) => !(p.allergens || []).includes(a)) : [];

  return html`
    <div class="accordion pd-details">
      ${item(
        cake ? 'Sobre este bolo' : 'Sobre este item',
        html`<p>${p.long}</p>
          <p class="pd-details__meta">
            ${icon('calendar')}
            <span>${p.prepHours ? 'Feito sob encomenda.' : 'Pronta entrega.'} Pedindo hoje, a primeira data de entrega é ${firstDate}.</span>
          </p>`,
        true,
      )}
      ${p.ingredients?.length
        ? item(
            'Ingredientes',
            html`<ul class="pd-tags">
                ${p.ingredients.map((i) => html`<li>${i}</li>`)}
              </ul>
              <p>Feito do zero, sem pré-mistura.</p>`,
          )
        : ''}
      ${p.allergens?.length
        ? item(
            'Alérgenos',
            html`<p><strong>Contém:</strong> ${listText(p.allergens.map((a) => a.toLowerCase()))}.</p>
              ${traces.length
                ? html`<p><strong>Pode conter traços de:</strong> ${listText(traces.map((a) => a.toLowerCase()))}, porque tudo é feito na mesma cozinha.</p>`
                : ''}
              <p>Tem alguma alergia ou restrição? <a class="link" href="#/atendimento">Fale com a gente</a> antes de pedir.</p>`,
          )
        : ''}
      ${cake
        ? item(
            'Conservação e dicas',
            html`<ul class="pd-tips">
              ${CARE_TIPS.map((t) => html`<li>${icon('check')}<span>${t}</span></li>`)}
            </ul>`,
          )
        : item(
            'Entrega e retirada',
            html`<p>
              Vai junto com o seu pedido, na data e no horário que você escolher ao fechar a compra. Também dá para retirar no
              ${SITE.pickup.name}: ${SITE.pickup.address}.
            </p>`,
          )}
    </div>
  `;
}

function reviewCard(r, { showProduct = false } = {}) {
  const product = showProduct ? getProduct(r.productId) : null;
  return html`
    <figure class="pd-review reveal">
      <div class="pd-review__top">${stars(r.rating)}<time datetime="${r.date}">${dateShort(r.date)}</time></div>
      <blockquote>“${r.text}”</blockquote>
      <figcaption>
        <span class="avatar avatar--sm">${r.name[0]}</span>
        <div>
          <strong>${r.name}</strong>
          ${product ? html`<span>pediu ${product.name}</span>` : ''}
        </div>
      </figcaption>
    </figure>
  `;
}

function reviewsSection(p) {
  const own = REVIEWS.filter((r) => r.productId === p.id);
  // Sem comentário próprio, mostramos o de outros pedidos (um por produto), deixando claro de qual é.
  const others = own.length
    ? []
    : REVIEWS.filter((r, i, all) => r.rating === 5 && getProduct(r.productId) && all.findIndex((x) => x.productId === r.productId) === i).slice(0, 2);
  const avg = Number(p.rating).toFixed(1).replace('.', ',');
  return html`
    <section class="pd-section" id="pd-avaliacoes">
      <div class="container">
        <div class="section-head">
          <div>
            <span class="eyebrow">Avaliações</span>
            <h2 class="section-title">Quem pediu, <em>aprovou</em></h2>
          </div>
        </div>
        <div class="pd-reviews">
          <div class="pd-score reveal">
            <div class="pd-score__top">
              <strong>${avg}</strong>
              <div>
                ${stars(p.rating)}
                <span>${plural(p.reviews, 'avaliação', 'avaliações')}</span>
              </div>
            </div>
            <ul class="pd-score__bars" aria-label="Distribuição das notas">
              ${starBars(p.rating, p.reviews).map(
                (b) => html`
                  <li>
                    <span>${b.star} ★</span>
                    <div class="progress"><i style="width:${b.pct}%"></i></div>
                    <span>${b.pct}%</span>
                  </li>
                `,
              )}
            </ul>
          </div>
          <div class="pd-reviews__list">
            ${own.length
              ? own.map((r) => reviewCard(r))
              : html`
                  <p class="pd-reviews__none">
                    ${icon('message')}
                    <span>Os comentários por escrito deste ${isCake(p) ? 'bolo' : 'item'} ainda estão chegando. Enquanto isso, veja o que contam sobre outros pedidos:</span>
                  </p>
                  ${others.map((r) => reviewCard(r, { showProduct: true }))}
                `}
          </div>
        </div>
      </div>
    </section>
  `;
}

function shelf({ eyebrow, title, list, more }) {
  if (!list.length) return '';
  return html`
    <section class="pd-section">
      <div class="container">
        <div class="section-head">
          <div>
            <span class="eyebrow">${eyebrow}</span>
            <h2 class="section-title">${title}</h2>
          </div>
          ${more ? html`<a class="link-arrow only-desktop" href="${more.href}">${more.label} ${icon('arrow-right')}</a>` : ''}
        </div>
        <div class="product-grid pd-shelf">
          ${list.map((item, i) => html`<div class="pd-shelf__cell reveal" style="--reveal-delay:${i * 60}ms">${productCard(item)}</div>`)}
        </div>
      </div>
    </section>
  `;
}

function notFound() {
  return html`
    <div class="container">
      <div class="empty pd-missing">
        <div class="empty__art">${icon('cake')}</div>
        <h1>Este bolo não está mais no cardápio</h1>
        <p>O link pode estar desatualizado. Veja os bolos disponíveis ou monte o seu, do seu jeito, em 3D.</p>
        <div class="pd-empty-actions">
          <a class="btn" href="#/cardapio">Ver cardápio</a>
          <a class="btn btn--secondary" href="#/monte-seu-bolo">${icon('sparkles')} Montar meu bolo em 3D</a>
        </div>
      </div>
    </div>
  `;
}

function stickyBar() {
  const bar = document.createElement('div');
  bar.className = 'pd-sticky';
  bar.setAttribute('inert', '');
  bar.innerHTML = String(html`
    <div class="pd-sticky__info">
      <span data-pd-sticky-meta></span>
      <strong data-pd-sticky-price></strong>
    </div>
    <button class="btn pd-add pd-sticky__btn" type="button">
      <span class="pd-add__idle">${icon('bag')} Adicionar</span>
      <span class="pd-add__done">${icon('check')} Adicionado</span>
    </button>
  `);
  return bar;
}

export default {
  title: (ctx) => getProduct(ctx.params.id)?.name || 'Produto não encontrado',
  layout: 'default',

  render(ctx) {
    const p = getProduct(ctx.params.id);
    if (!p) return notFound();

    const cake = isCake(p);
    const cat = CATEGORIES.find((c) => c.id === p.cat);
    const q = quote(p, 'p', 1);
    const firstDate = dateLong(schedule.earliest(p.prepHours)).toLowerCase();
    const avg = Number(p.rating).toFixed(1).replace('.', ',');
    const askText = `Oi! Preciso ${cake ? 'do bolo' : 'do item'} ${p.name} para ___. Vocês conseguem?`;

    return html`
      <article class="pd">
        <div class="container">
          ${breadcrumb([{ href: '#/cardapio', label: 'Cardápio' }, { href: `#/cardapio?cat=${p.cat}`, label: cat?.label || 'Bolos' }, { label: p.name }])}

          <div class="pd-top">
            <div class="pd-gallery">
              <div class="pd-photo">
                ${photo(p.photo, { w: 720, alt: p.name, eager: true, priority: true, sizes: '(min-width: 900px) 46vw, 100vw' })}
                ${p.badge ? html`<span class="badge badge--dark pd-photo__badge">${p.badge}</span>` : ''}
                <div class="pd-photo__actions">
                  ${favButton(p.id)}
                  <button class="fav-btn" type="button" data-pd-share aria-label="Compartilhar ${p.name}">${icon('share')}</button>
                </div>
              </div>
            </div>

            <div class="pd-buy">
              <header class="pd-head">
                <a class="eyebrow" href="#/cardapio?cat=${p.cat}">${cat?.label || 'Cardápio'}</a>
                <h1 class="pd-title">${p.name}</h1>
                <button class="pd-rating" type="button" data-pd-goto-reviews aria-label="Nota ${avg} de 5. Ver ${p.reviews} avaliações">
                  ${stars(p.rating)}<strong>${avg}</strong><span>${plural(p.reviews, 'avaliação', 'avaliações')}</span>
                </button>
                ${sizesOf(p).length
                  ? html`<p class="pd-from">
                      <span>a partir de</span> <strong>${money(q.unit)}</strong>
                      <span class="pd-from__pix">${money(q.pix)} no Pix</span>
                    </p>`
                  : ''}
                <p class="pd-desc">${p.desc}</p>
              </header>

              ${sizeSelector(p)}

              <div class="pd-price" aria-live="polite" data-pd-price>${priceBlock(q, 1)}</div>

              <div class="pd-when">
                ${notice(html`Peça hoje e receba a\u00a0partir\u00a0de <strong>${firstDate}</strong>`, { tone: 'green', iconName: 'calendar' })}
                <a class="pd-ask" href="https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(askText)}" target="_blank" rel="noopener">
                  ${icon('whatsapp')}<span>Precisa para antes? <strong>Chame no WhatsApp</strong></span>
                </a>
              </div>

              <div class="pd-form">
                <div class="field pd-note">
                  <label for="pd-note">${cake ? 'Mensagem no bolo ou observações' : 'Observações'} <span class="field__hint">(opcional)</span></label>
                  <textarea
                    class="textarea"
                    id="pd-note"
                    rows="1"
                    maxlength="140"
                    placeholder="${cake ? 'Ex.: escrever “Parabéns, Ana!”' : 'Ex.: nome, idade, cor ou tema da festa'}"
                    data-pd-note
                  ></textarea>
                </div>
                <div class="pd-qty">
                  <span class="pd-label">Quantidade</span>
                  ${qtyStepper(1)}
                </div>
                <button class="btn btn--lg pd-add" type="button" data-pd-add>
                  <span class="pd-add__idle">${icon('bag')} Adicionar ao carrinho</span>
                  <span class="pd-add__done">${icon('check')} Adicionado!</span>
                </button>
                <button class="btn btn--lg btn--secondary pd-buy-now" type="button" data-pd-buy>Comprar agora</button>
              </div>

              <ul class="pd-perks">
                <li>
                  <span class="pd-perks__icon">${icon('truck')}</span>
                  <div data-pd-shipping>${shippingPerk(q)}</div>
                </li>
                <li>
                  <span class="pd-perks__icon">${icon('store')}</span>
                  <div><strong>Retirada grátis no ateliê</strong><span>${SITE.pickup.address}.</span></div>
                </li>
                <li>
                  <span class="pd-perks__icon">${icon('shield-check')}</span>
                  <div>
                    <strong>Cancelamento sem custo</strong>
                    <span>Enquanto ${cake ? 'o bolo' : 'o pedido'} não entrar em produção.</span>
                  </div>
                </li>
                ${cake
                  ? html`<li>
                      <span class="pd-perks__icon">${icon('gift')}</span>
                      <div><strong>Feito no dia da entrega</strong><span>À mão, só para você, e embalado para presente.</span></div>
                    </li>`
                  : ''}
              </ul>

              ${p.customizable
                ? html`
                    <a class="pd-custom" href="#/monte-seu-bolo?base=${p.id}">
                      <span class="pd-custom__icon">${icon('cube')}</span>
                      <span class="pd-custom__body">
                        <span class="pd-custom__eyebrow">Personalizador 3D</span>
                        <strong>Quer este bolo do seu jeito?</strong>
                        <span>Troque massa, recheio, cobertura e decoração e veja o resultado girando na tela.</span>
                      </span>
                      <span class="pd-custom__cta">Personalizar este bolo ${icon('arrow-right')}</span>
                    </a>
                  `
                : ''}

              ${details(p, firstDate)}
            </div>
          </div>
        </div>

        ${reviewsSection(p)}
        ${cake
          ? html`
              ${shelf({
                eyebrow: 'Para a mesa do bolo',
                title: html`Complete <em>a festa</em>`,
                list: addOns(4),
                more: { href: '#/cardapio?cat=acess', label: 'Ver todos' },
              })}
              ${shelf({
                eyebrow: 'Você também vai gostar',
                title: html`Outros bolos para <em>se apaixonar</em>`,
                list: relatedTo(p, 4),
                more: { href: '#/cardapio', label: 'Ver cardápio' },
              })}
            `
          : html`
              ${shelf({
                eyebrow: 'Para a mesa do bolo',
                title: html`Complete <em>a festa</em>`,
                list: relatedTo(p, 4),
                more: { href: '#/cardapio?cat=acess', label: 'Ver todos' },
              })}
              ${shelf({
                eyebrow: 'Falta o bolo?',
                title: html`Os mais pedidos <em>da casa</em>`,
                list: searchProducts().filter(isCake).slice(0, 4),
                more: { href: '#/cardapio', label: 'Ver cardápio' },
              })}
            `}
      </article>
    `;
  },

  mount(root, ctx) {
    const p = getProduct(ctx.params.id);
    if (!p) return undefined;

    const sizes = sizesOf(p);
    const priceEl = root.querySelector('[data-pd-price]');
    const shippingEl = root.querySelector('[data-pd-shipping]');
    const noteEl = root.querySelector('[data-pd-note]');
    const mainBtn = root.querySelector('[data-pd-add]');

    let size = sizes.length ? sizes[0].id : null;
    let qty = 1;
    const timers = new Set();

    /* Barra fixa do celular. Fica no <body> para não depender da animação de entrada da tela. */
    const bar = stickyBar();
    const barBtn = bar.querySelector('.pd-sticky__btn');
    document.body.appendChild(bar);

    function update() {
      const q = quote(p, size, qty);
      const sizeObj = sizes.find((s) => s.id === size);
      priceEl.innerHTML = String(priceBlock(q, qty));
      shippingEl.innerHTML = String(shippingPerk(q));
      bar.querySelector('[data-pd-sticky-meta]').textContent = [sizeObj ? `Tamanho ${sizeObj.label}` : '', `${qty} un.`].filter(Boolean).join(' · ');
      bar.querySelector('[data-pd-sticky-price]').textContent = money(q.total);
    }

    function addToCart() {
      return cart.addProduct(p.id, { size: size || 'p', qty, note: noteEl.value.trim() });
    }

    function celebrate(btn) {
      btn.classList.add('is-done');
      const t = setTimeout(() => {
        btn.classList.remove('is-done');
        timers.delete(t);
      }, 1600);
      timers.add(t);
    }

    function onAdd(btn) {
      if (btn.classList.contains('is-done') || !addToCart()) return;
      celebrate(btn);
      toast(`${p.name} foi para o carrinho`, { type: 'success', action: { label: 'Ver carrinho', href: '#/carrinho' } });
    }

    async function share() {
      const url = location.href;
      if (navigator.share) {
        try {
          await navigator.share({ title: `${p.name} · BOLAB`, text: p.desc, url });
          return;
        } catch (err) {
          if (err?.name === 'AbortError') return; // a pessoa fechou a janela de compartilhar
        }
      }
      const ok = await copyText(url);
      toast(ok ? 'Link copiado. Agora é só colar e enviar.' : 'Não deu para copiar. Copie o link pela barra de endereço.', { type: ok ? 'success' : 'error' });
    }

    on(root, 'change', 'input[name="size"]', (_ev, el) => {
      size = el.value;
      update();
    });

    root.addEventListener('qty', (ev) => {
      if (!ev.target.closest('.pd-qty')) return;
      qty = ev.detail;
      update();
    });

    on(root, 'input', '[data-pd-note]', (_ev, el) => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    });

    on(root, 'click', '[data-pd-add]', (_ev, btn) => onAdd(btn));
    barBtn.addEventListener('click', () => onAdd(barBtn));

    // Um clique duplo não pode colocar duas unidades: depois do primeiro, a tela já está de saída.
    let leaving = false;
    on(root, 'click', '[data-pd-buy]', () => {
      if (leaving || !addToCart()) return;
      leaving = true;
      navigate('/carrinho');
    });

    on(root, 'click', '[data-pd-share]', share);

    on(root, 'click', '[data-pd-goto-reviews]', () => {
      root.querySelector('#pd-avaliacoes')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    /* A barra aparece quando o botão principal some por cima da tela. No fim da página ela
       fica sobre o espaço reservado no rodapé (ver css/catalog.css), sem cobrir conteúdo.
       A área observada vai do cabeçalho para baixo sem fim: o botão só "sai" dela por cima,
       então um salto de rolagem (voltar ao topo, por exemplo) nunca deixa a barra no estado errado. */
    let io = null;
    if ('IntersectionObserver' in window) {
      const headerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 60;
      io = new IntersectionObserver(
        ([entry]) => {
          const show = !entry.isIntersecting;
          bar.classList.toggle('is-visible', show);
          bar.toggleAttribute('inert', !show);
        },
        { rootMargin: `-${headerH}px 0px 100000px 0px` },
      );
      io.observe(mainBtn);
    }

    update();
    observeReveal(root);

    return () => {
      io?.disconnect();
      timers.forEach(clearTimeout);
      bar.remove();
    };
  },
};
