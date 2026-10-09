// BOLAB — carrinho.
import { html, icon, money, dateLong, plural, on, toast, observeReveal } from '../ui.js';
import { photo, lineThumb, qtyStepper, pageHead, productCard, totalsSummary } from '../components.js';
import { cart, schedule, store } from '../store.js';
import { PRODUCTS, addOns, getProduct, isCake } from '../data/products.js';
import { SITE, COUPONS, WALLET_COUPONS } from '../data/site.js';

/* O que a pessoa está digitando (e o que já viu) sobrevive aos redesenhos da tela. */
const draft = { coupon: '', couponError: '', walletOpen: false, pct: 0, barAway: false };

/**
 * Parcelas possíveis no cartão para um valor, conforme SITE.card.
 * → [{ n: 1, value: 189.9 }, { n: 2, value: 94.95 }, …]
 */
export function installmentOptions(total) {
  const { maxInstallments, minInstallment } = SITE.card;
  const out = [];
  for (let n = 1; n <= maxInstallments; n++) {
    if (n > 1 && total / n < minInstallment) break;
    out.push({ n, value: Math.round((total / n) * 100) / 100 });
  }
  return out;
}

/**
 * Escuta um evento do store e redesenha uma vez só no fim do ciclo atual:
 * vários avisos seguidos (ex.: pedido criado + carrinho esvaziado) viram um único redesenho.
 */
export function whenStore(name, fn) {
  let queued = false;
  let alive = true;
  const off = store.on(name, () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (alive) fn();
    });
  });
  return () => {
    alive = false;
    off();
  };
}

/**
 * Redesenha mantendo o foco e a posição do cursor em quem estava com o teclado.
 * A tela ganha um elemento raiz novo a cada ctx.rerender(), então o foco é procurado de novo em #app.
 */
export function keepFocus(redraw) {
  const scope = document.getElementById('app');
  const el = document.activeElement;
  let selector = null;
  let caret = null;
  if (el && scope?.contains(el)) {
    const box = el.closest('[data-qty]');
    if (el.id) selector = `#${CSS.escape(el.id)}`;
    else if (box && el.dataset.qtyStep) selector = `[data-qty][data-id="${box.dataset.id}"] [data-qty-step="${el.dataset.qtyStep}"]`;
    if (el.matches('input[type="text"], input:not([type]), textarea')) caret = [el.selectionStart, el.selectionEnd];
  }
  redraw();
  if (!selector) return;
  const next = scope.querySelector(selector);
  if (!next || next.disabled) return;
  next.focus({ preventScroll: true });
  if (caret) {
    try {
      next.setSelectionRange(caret[0], caret[1]);
    } catch {
      // campos que não aceitam seleção: tudo bem.
    }
  }
}

/* ───────── Blocos ───────── */
function shippingBanner(t) {
  const byCoupon = t.coupon?.type === 'frete';
  const reached = t.freeShippingMissing === 0;
  const free = reached || byCoupon;
  const pct = free ? 100 : t.freeShippingPct;
  return html`
    <div class="cart-ship ${free ? 'is-free' : ''}">
      <span class="cart-ship__icon">${icon(free ? 'check' : 'truck')}</span>
      <div class="cart-ship__body">
        <p>
          ${reached
            ? html`<strong>Você ganhou entrega grátis!</strong>`
            : byCoupon
              ? html`<strong>Entrega grátis</strong> garantida pelo cupom ${t.coupon.code}.`
              : html`Faltam <strong>${money(t.freeShippingMissing)}</strong> para a entrega grátis`}
        </p>
        <div
          class="progress ${free ? 'progress--green' : ''}"
          role="progressbar"
          aria-label="Progresso para a entrega grátis"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="${pct}"
        >
          <i style="width:${draft.pct}%" data-pct="${pct}"></i>
        </div>
      </div>
    </div>
  `;
}

function lineItem(l) {
  const custom = l.kind === 'custom';
  const href = !custom && getProduct(l.productId) ? `#/produto/${l.productId}` : '';
  return html`
    <li class="cart-line">
      ${href
        ? html`<a class="cart-line__media" href="${href}" tabindex="-1" aria-hidden="true">${lineThumb(l, { w: 208 })}</a>`
        : html`<div class="cart-line__media">${lineThumb(l, { w: 208 })}</div>`}
      <div class="cart-line__body">
        <div class="cart-line__head">
          <div class="cart-line__titles">
            ${custom ? html`<span class="badge badge--gold">${icon('cube')} Criado por você em 3D</span>` : ''}
            <h3 class="cart-line__name">${href ? html`<a href="${href}">${l.name}</a>` : l.name}</h3>
            ${l.sizeLabel ? html`<p class="cart-line__meta">${l.sizeLabel}</p>` : ''}
          </div>
          <button class="icon-btn cart-line__remove" type="button" data-remove="${l.lineId}" aria-label="Remover ${l.name} do carrinho">
            ${icon('trash')}
          </button>
        </div>
        ${custom && l.summary?.length ? html`<ul class="cart-line__summary">${l.summary.map((s) => html`<li>${s}</li>`)}</ul>` : ''}
        ${l.note ? html`<p class="cart-line__note">${icon('edit')}<span>${l.note}</span></p>` : ''}
      </div>
      <div class="cart-line__foot">
        ${qtyStepper(l.qty, { id: l.lineId })}
        <div class="cart-line__price">
          <small>${money(l.price)} cada</small>
          <strong>${money(l.price * l.qty)}</strong>
        </div>
      </div>
    </li>
  `;
}

function couponBlock(t) {
  const code = cart.couponCode();

  if (code && t.coupon) {
    return html`
      <div class="cart-coupon cart-coupon--on">
        <span class="cart-coupon__icon">${icon('ticket')}</span>
        <div class="cart-coupon__body">
          <strong>${t.coupon.code}</strong>
          <span>${t.couponDiscount > 0 ? `Você economiza ${money(t.couponDiscount)}` : t.coupon.label}</span>
        </div>
        <button class="cart-coupon__remove" type="button" id="cart-coupon-remove" data-coupon-remove aria-label="Remover o cupom ${t.coupon.code}">Remover</button>
      </div>
    `;
  }

  if (code && t.couponIssue) {
    return html`
      <div class="notice notice--amber cart-coupon__issue">
        ${icon('alert')}
        <div>
          <strong>O cupom ${code} não está valendo agora.</strong> ${t.couponIssue}
          <button class="link" type="button" id="cart-coupon-remove" data-coupon-remove>Remover cupom</button>
        </div>
      </div>
    `;
  }

  const wallet = WALLET_COUPONS.map((c) => COUPONS[c]).filter(Boolean);
  return html`
    <form class="cart-coupon" data-coupon-form novalidate>
      <div class="field ${draft.couponError ? 'is-invalid' : ''}">
        <label for="cart-coupon">Cupom de desconto</label>
        <div class="cart-coupon__row">
          <div class="input-group">
            ${icon('ticket')}
            <input
              class="input cart-coupon__input"
              id="cart-coupon"
              name="coupon"
              type="text"
              value="${draft.coupon}"
              placeholder="Digite o código"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
              maxlength="20"
              enterkeyhint="done"
              aria-describedby="cart-coupon-msg"
            />
          </div>
          <button class="btn btn--secondary" type="submit">Aplicar</button>
        </div>
        <div class="field__error" id="cart-coupon-msg" role="alert">${draft.couponError}</div>
      </div>
      ${wallet.length
        ? html`
            <details class="cart-wallet" ${draft.walletOpen ? html`open` : ''}>
              <summary id="cart-wallet-toggle">${icon('gift')} Ver cupons disponíveis (${wallet.length})${icon('chevron-down')}</summary>
              <ul>
                ${wallet.map(
                  (c) => html`
                    <li>
                      <button type="button" data-coupon-apply="${c.code}" aria-label="Aplicar o cupom ${c.code}: ${c.label}">
                        <strong>${c.code}</strong>
                        <span>${c.label}</span>
                        <em>Aplicar</em>
                      </button>
                    </li>
                  `,
                )}
              </ul>
            </details>
          `
        : ''}
    </form>
  `;
}

function summaryCard(t) {
  const pix = cart.totals({ payment: 'pix' });
  const parcels = installmentOptions(t.total);
  const best = parcels[parcels.length - 1];
  const first = schedule.earliest();
  return html`
    <section class="card cart-summary" aria-labelledby="cart-summary-title">
      <h2 id="cart-summary-title">Resumo do pedido</h2>
      ${couponBlock(t)}
      <div class="cart-summary__totals">
        ${totalsSummary(t)}
        <p class="cart-summary__pay">
          ${icon('pix')}
          <span>
            <strong>${money(pix.total)} no Pix</strong> (${SITE.pix.discountPct}% de desconto)${best.n > 1 ? ` ou ${best.n}x de ${money(best.value)} sem juros` : ''}
          </span>
        </p>
      </div>
      <div class="cart-summary__date">
        ${icon('calendar')}
        <div>
          <strong>Receba a partir de ${dateLong(first).toLowerCase()}</strong>
          <span>Você escolhe o dia e o horário no próximo passo.</span>
        </div>
      </div>
      <div class="cart-summary__actions">
        <a class="btn btn--lg btn--block" href="#/checkout" data-cart-cta>Fechar pedido ${icon('arrow-right')}</a>
        <a class="btn btn--ghost btn--block" href="#/cardapio">Continuar comprando</a>
      </div>
      <ul class="cart-trust">
        <li>${icon('pix')}<span>${SITE.pix.discountPct}% de desconto no Pix</span></li>
        <li>${icon('credit-card')}<span>Até ${SITE.card.maxInstallments}x sem juros no cartão</span></li>
        <li>${icon('shield-check')}<span>Cancelamento grátis antes da produção</span></li>
      </ul>
    </section>
  `;
}

function crossSell() {
  const inCart = new Set(cart.lines().map((l) => l.productId));
  const list = addOns(5)
    .filter((p) => !inCart.has(p.id))
    .slice(0, 3);
  if (!list.length) return '';
  return html`
    <section class="cart-cross" aria-labelledby="cart-cross-title">
      <div class="cart-cross__head">
        <h2 id="cart-cross-title">Complete a festa</h2>
        <p>Chegam junto com o seu pedido, sem frete a mais.</p>
      </div>
      <ul class="cart-cross__list">
        ${list.map(
          (p) => html`
            <li class="cart-cross__item">
              <a class="cart-cross__media" href="#/produto/${p.id}" tabindex="-1" aria-hidden="true">${photo(p.photo, { w: 144, alt: '' })}</a>
              <div class="cart-cross__body">
                <a class="cart-cross__name" href="#/produto/${p.id}">${p.name}</a>
                <span class="cart-cross__price">${money(p.price)}</span>
              </div>
              <button class="cart-cross__add" type="button" data-cart-add="${p.id}" aria-label="Adicionar ${p.name} ao carrinho">${icon('plus')}</button>
            </li>
          `,
        )}
      </ul>
    </section>
  `;
}

function noteCard() {
  const note = cart.note();
  return html`
    <section class="card cart-note">
      <div class="field">
        <label for="cart-note">Algum recado para a nossa confeitaria?</label>
        <textarea
          class="textarea"
          id="cart-note"
          name="note"
          maxlength="300"
          rows="3"
          placeholder="Ex.: escrever “Parabéns, Ana!” no topper, vela de número 7, alergia a castanhas…"
          aria-describedby="cart-note-hint"
        >
${note}</textarea
        >
        <div class="field__hint cart-note__hint" id="cart-note-hint">
          <span>Opcional. A gente lê antes de começar o seu bolo.</span>
          <span data-note-count>${note.length}/300</span>
        </div>
      </div>
    </section>
  `;
}

function emptyCart() {
  const picks = PRODUCTS.filter(isCake)
    .sort((a, b) => Number(b.featured) - Number(a.featured) || b.reviews - a.reviews)
    .slice(0, 4);
  return html`
    <div class="container cart cart--empty">
      <div class="empty cart-empty">
        <div class="empty__art">${icon('bag')}</div>
        <h1>Seu carrinho está esperando um bolo</h1>
        <p>Escolha um dos nossos clássicos ou crie o seu em 3D, camada por camada. Do resto a gente cuida.</p>
        <div class="cart-empty__cta">
          <a class="btn btn--lg" href="#/cardapio">${icon('cake')} Ver cardápio</a>
          <a class="btn btn--lg btn--secondary" href="#/monte-seu-bolo">${icon('sparkles')} Montar meu bolo em 3D</a>
        </div>
      </div>
      <section class="cart-picks" aria-labelledby="cart-picks-title">
        <div class="section-head">
          <div>
            <span class="eyebrow">Para começar</span>
            <h2 class="section-title" id="cart-picks-title">Os mais <em>pedidos</em></h2>
          </div>
          <a class="link-arrow only-desktop" href="#/cardapio">Ver todo o cardápio ${icon('arrow-right')}</a>
        </div>
        <div class="product-grid">${picks.map((p) => html`<div class="reveal">${productCard(p)}</div>`)}</div>
      </section>
    </div>
  `;
}

/* ───────── Tela ───────── */
export default {
  title: 'Carrinho',
  layout: 'default',

  render() {
    if (cart.isEmpty()) return emptyCart();
    const t = cart.totals();
    return html`
      <div class="container cart">
        ${pageHead('Seu carrinho', { back: '/cardapio', sub: plural(t.itemCount, 'item', 'itens') })}
        <div class="cart-layout">
          <div class="cart-main">
            ${shippingBanner(t)}
            <ul class="cart-lines" aria-label="Itens do carrinho">
              ${cart.lines().map(lineItem)}
            </ul>
            ${crossSell()} ${noteCard()}
          </div>
          <aside class="cart-side">${summaryCard(t)}</aside>
        </div>
        <div class="cart-bar ${draft.barAway ? 'is-away' : ''}" data-cart-bar>
          <a class="cart-bar__link" href="#/checkout">
            <span class="cart-bar__total">
              <small>Total · ${plural(t.itemCount, 'item', 'itens')}</small>
              <strong>${money(t.total)}</strong>
            </span>
            <span class="cart-bar__cta">Fechar pedido ${icon('arrow-right')}</span>
          </a>
        </div>
      </div>
    `;
  },

  mount(root, ctx) {
    const page = root.firstElementChild;
    const off = whenStore('cart', () => keepFocus(() => ctx.rerender()));
    if (cart.isEmpty()) {
      observeReveal(root);
      return off;
    }

    /* Quantidade e remoção */
    page.addEventListener('qty', (ev) => cart.setQty(ev.target.dataset.id, ev.detail));

    on(page, 'click', '[data-remove]', (_ev, btn) => {
      const line = cart.remove(btn.dataset.remove);
      if (!line) return;
      toast(`${line.name} saiu do carrinho`, { duration: 6000, action: { label: 'Desfazer', onClick: () => cart.restore(line) } });
    });

    /* Cupom */
    const couponField = () => page.querySelector('[data-coupon-form] .field');
    const showCouponError = (message) => {
      draft.couponError = message;
      const field = couponField();
      if (!field) return;
      field.classList.toggle('is-invalid', Boolean(message));
      field.querySelector('.field__error').textContent = message;
      const input = field.querySelector('input');
      if (message) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    };
    const applyCoupon = (raw) => {
      const code = String(raw || '').trim().toUpperCase();
      if (!code) {
        showCouponError('Digite o código do cupom para aplicar.');
        page.querySelector('#cart-coupon')?.focus();
        return;
      }
      const res = cart.applyCoupon(code);
      if (!res.ok) {
        draft.coupon = code;
        const input = page.querySelector('#cart-coupon');
        if (input) input.value = code;
        showCouponError(res.message);
        return;
      }
      draft.coupon = '';
      draft.couponError = '';
      toast(`Cupom ${res.coupon.code} aplicado: ${res.coupon.label}`, { type: 'success' });
    };

    on(page, 'submit', '[data-coupon-form]', (ev, form) => {
      ev.preventDefault();
      applyCoupon(form.coupon.value);
    });
    on(page, 'input', '#cart-coupon', (_ev, input) => {
      draft.coupon = input.value;
      if (draft.couponError) showCouponError('');
    });
    on(page, 'click', '[data-coupon-apply]', (_ev, btn) => applyCoupon(btn.dataset.couponApply));
    on(page, 'click', '[data-coupon-remove]', () => {
      const code = cart.couponCode();
      cart.removeCoupon();
      toast(`Cupom ${code} removido`);
    });
    page.querySelector('.cart-wallet')?.addEventListener('toggle', (ev) => {
      draft.walletOpen = ev.target.open;
    });

    /* Recado */
    on(page, 'input', '#cart-note', (_ev, area) => {
      cart.setNote(area.value);
      page.querySelector('[data-note-count]').textContent = `${area.value.length}/300`;
    });

    /* Complete a festa */
    on(page, 'click', '[data-cart-add]', (_ev, btn) => {
      const line = cart.addProduct(btn.dataset.cartAdd);
      if (line) toast(`${line.name} foi para o carrinho`, { type: 'success' });
    });

    /* Barra de frete: anima do valor anterior até o atual. */
    const bar = page.querySelector('.progress > i');
    if (bar) {
      const pct = Number(bar.dataset.pct);
      requestAnimationFrame(() => {
        bar.style.width = `${pct}%`;
      });
      draft.pct = pct;
    }

    /* No celular, a barra flutuante sai de cena quando o botão do resumo já está à vista. */
    const floating = page.querySelector('[data-cart-bar]');
    const cta = page.querySelector('[data-cart-cta]');
    let io;
    if (floating && cta && 'IntersectionObserver' in window) {
      io = new IntersectionObserver(
        ([entry]) => {
          draft.barAway = entry.isIntersecting;
          floating.classList.toggle('is-away', draft.barAway);
        },
        { rootMargin: '0px 0px -170px 0px' },
      );
      io.observe(cta);
    }

    return () => {
      off();
      io?.disconnect();
    };
  },
};
