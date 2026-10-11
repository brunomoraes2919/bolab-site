// BOLAB — carrinho ("sacola" do aplicativo).
import { html, icon, money, plural, on, toast } from '../ui.js';
import { photo, lineThumb, qtyStepper, pageHead, productCard, totalsSummary, priceButton, sectionHead, promoBanner, dayLabel, listRow } from '../components.js';
import { cart, schedule, store } from '../store.js';
import { receiveContext } from '../shell.js';
import { PRODUCTS, addOns, getProduct, isCake } from '../data/products.js';
import { SITE, COUPONS, WALLET_COUPONS } from '../data/site.js';

/* O que a pessoa está digitando (e o que já viu) sobrevive aos redesenhos da tela. */
const draft = { coupon: '', couponError: '', pct: 0, openDetails: new Set(), freshLine: '' };

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

/**
 * Quando e como a pessoa vai receber. É a mesma linha da tela do item ("Receba a partir de…" em
 * destaque, o lugar embaixo): a data é a informação nova aqui, porque o endereço já está no
 * cabeçalho logo acima. Toque abre a folha de troca.
 */
function receiveCard(ctx) {
  const pickup = ctx.mode === 'pickup';
  const first = dayLabel(schedule.earliest());
  return html`
    <div class="card cart-recv">
      ${listRow({
        iconName: pickup ? 'store' : 'calendar',
        title: `${pickup ? 'Retire' : 'Receba'} a partir de ${first}`,
        desc: pickup ? `${SITE.pickup.name} · ${SITE.pickup.address}` : `${ctx.label} ${ctx.place}`,
        trail: 'Trocar',
        attrs: 'data-open-receive aria-haspopup="dialog"',
      })}
    </div>
  `;
}

/** Faixa "Faltam R$ X para entrega grátis" (só faz sentido em entrega). */
function shippingStrip(t) {
  const byCoupon = t.coupon?.type === 'frete';
  const free = t.freeShippingMissing === 0 || byCoupon;
  const pct = free ? 100 : t.freeShippingPct;
  return html`
    <div class="cart-ship ${free ? 'is-free' : ''}">
      <p>
        ${icon(free ? 'check-circle' : 'truck')}
        <span>
          ${free
            ? byCoupon && t.freeShippingMissing > 0
              ? html`<strong>Entrega grátis</strong> com o cupom ${t.coupon.code}`
              : html`<strong>Você ganhou entrega grátis</strong>`
            : html`Faltam <strong>${money(t.freeShippingMissing)}</strong> para entrega grátis`}
        </span>
      </p>
      <div class="progress ${free ? 'progress--green' : ''}" role="progressbar" aria-label="Progresso para a entrega grátis" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
        <i style="width:${draft.pct}%" data-pct="${pct}"></i>
      </div>
    </div>
  `;
}

/** "Formato: Redondo, tamanho M" → { label: 'Formato', value: 'Redondo, tamanho M' } */
function summaryPart(text) {
  const str = String(text);
  const i = str.indexOf(': ');
  return i > 0 && i <= 40 ? { label: str.slice(0, i), value: str.slice(i + 2) } : { label: '', value: str };
}

function lineItem(l) {
  const custom = l.kind === 'custom';
  const href = !custom && getProduct(l.productId) ? `#/produto/${l.productId}` : '';
  const parts = custom && Array.isArray(l.summary) ? l.summary.map(summaryPart) : [];
  const open = draft.openDetails.has(l.lineId);
  const cls = ['cart-line', custom ? 'cart-line--custom' : '', draft.freshLine === l.lineId ? 'is-new' : ''].filter(Boolean).join(' ');
  return html`
    <li class="${cls}">
      ${href
        ? html`<a class="cart-line__media" href="${href}" tabindex="-1" aria-hidden="true">${lineThumb(l, { w: 160 })}</a>`
        : html`<div class="cart-line__media">${lineThumb(l, { w: 160 })}</div>`}
      <div class="cart-line__body">
        <div class="cart-line__top">
          <h3 class="cart-line__name">${href ? html`<a href="${href}">${l.name}</a>` : l.name}</h3>
          <strong class="cart-line__price">${money(l.price * l.qty)}</strong>
        </div>
        ${custom ? html`<span class="badge badge--rose cart-line__tag">${icon('cube')}Montado em 3D</span>` : ''}
        ${l.sizeLabel ? html`<p class="cart-line__meta">${l.sizeLabel}</p>` : ''}
        ${parts.length && !open ? html`<p class="cart-line__meta cart-line__recipe">${parts.map((p) => p.value).join(' · ')}</p>` : ''}
        ${l.note ? html`<p class="cart-line__meta cart-line__note">${icon('message')}<span>${l.note}</span></p>` : ''}
        ${l.qty > 1 ? html`<p class="cart-line__meta">${l.qty} × ${money(l.price)}</p>` : ''}
        ${open
          ? html`
              <dl class="cart-line__details" id="cart-details-${l.lineId}">
                ${parts.map((p) => html`<div><dt>${p.label || 'Detalhe'}</dt><dd>${p.value}</dd></div>`)}
              </dl>
            `
          : ''}
      </div>
      <div class="cart-line__foot">
        <div class="cart-line__links">
          ${custom ? html`<a class="cart-line__link" href="#/monte-seu-bolo?linha=${l.lineId}">${icon('edit')}Editar</a>` : ''}
          ${parts.length
            ? html`<button class="cart-line__link" type="button" id="cart-more-${l.lineId}" data-details="${l.lineId}" aria-expanded="${open ? 'true' : 'false'}">
                ${open ? 'Ocultar' : 'Detalhes'}${icon('chevron-down')}
              </button>`
            : ''}
        </div>
        <div class="cart-line__ctrl">
          <button class="icon-btn cart-line__remove" type="button" data-remove="${l.lineId}" aria-label="Remover ${l.name} do carrinho">${icon('trash')}</button>
          ${qtyStepper(l.qty, { id: l.lineId, small: true })}
        </div>
      </div>
    </li>
  `;
}

/** "Peça também": acessórios que ainda não estão no carrinho, em carrossel compacto. */
function alsoRail() {
  const inCart = new Set(cart.lines().map((l) => l.productId));
  const list = addOns(6)
    .filter((p) => !inCart.has(p.id))
    .slice(0, 4);
  if (!list.length) return '';
  return html`
    <section class="cart-also" aria-labelledby="cart-also-t">
      ${sectionHead('Peça também', { id: 'cart-also-t', sub: 'Chega junto com o seu pedido.' })}
      <ul class="rail cart-also__rail">
        ${list.map(
          (p) => html`
            <li class="card cart-also__item">
              <a class="cart-also__media" href="#/produto/${p.id}" tabindex="-1" aria-hidden="true">${photo(p.photo, { w: 200, alt: '', sizes: '(min-width: 900px) 180px, 132px' })}</a>
              <a class="cart-also__name" href="#/produto/${p.id}">${p.name}</a>
              <div class="cart-also__foot">
                <span class="price">${money(p.price)}</span>
                <button class="add-btn" type="button" data-cart-add="${p.id}" aria-label="Adicionar ${p.name} ao carrinho">${icon('plus')}</button>
              </div>
            </li>
          `,
        )}
      </ul>
    </section>
  `;
}

function couponCard(t) {
  const code = cart.couponCode();

  if (code && t.coupon) {
    return html`
      <section class="card cart-coupon" aria-label="Cupom">
        <div class="cart-coupon__on" role="status">
          <span class="row__icon cart-coupon__icon">${icon('ticket')}</span>
          <div class="cart-coupon__body">
            <strong>${t.coupon.code} aplicado</strong>
            <span>${t.couponDiscount > 0 ? `Você economiza ${money(t.couponDiscount)}` : t.coupon.label}</span>
          </div>
          <button class="btn btn--ghost btn--sm" type="button" id="cart-coupon-remove" data-coupon-remove aria-label="Remover o cupom ${t.coupon.code}">Remover</button>
        </div>
      </section>
    `;
  }

  if (code && t.couponIssue) {
    return html`
      <section class="card cart-coupon" aria-label="Cupom">
        <div class="notice notice--amber">
          ${icon('alert')}
          <div>
            <strong>O cupom ${code} não está valendo agora.</strong> ${t.couponIssue}
            <button class="link cart-coupon__drop" type="button" id="cart-coupon-remove" data-coupon-remove>Remover cupom</button>
          </div>
        </div>
      </section>
    `;
  }

  const wallet = WALLET_COUPONS.map((c) => COUPONS[c]).filter(Boolean);
  return html`
    <section class="card cart-coupon" aria-label="Cupom">
      <form data-coupon-form novalidate>
        <div class="field ${draft.couponError ? 'is-invalid' : ''}">
          <label for="cart-coupon">Cupom</label>
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
            <button class="btn btn--soft" type="submit">Aplicar</button>
          </div>
          <div class="field__error" id="cart-coupon-msg" role="alert">${draft.couponError}</div>
        </div>
        ${wallet.length
          ? html`
              <ul class="chips cart-coupon__wallet" aria-label="Cupons disponíveis">
                ${wallet.map(
                  (c) => html`
                    <li>
                      <button class="chip" type="button" data-coupon-apply="${c.code}" aria-label="Aplicar o cupom ${c.code}: ${c.label}">
                        ${icon('ticket')}<span><strong>${c.code}</strong> · ${c.label}</span>
                      </button>
                    </li>
                  `,
                )}
              </ul>
            `
          : ''}
      </form>
    </section>
  `;
}

function noteCard() {
  const note = cart.note();
  return html`
    <section class="card cart-note">
      <div class="field">
        <label for="cart-note">Observação do pedido <span class="cart-optional">(opcional)</span></label>
        <textarea
          class="textarea"
          id="cart-note"
          name="note"
          maxlength="300"
          rows="2"
          placeholder="Ex.: vela de número 7, tocar o interfone 12…"
          aria-describedby="cart-note-hint"
        >
${note}</textarea
        >
        <div class="field__hint cart-note__hint" id="cart-note-hint">
          <span>A gente lê antes de começar o seu pedido.</span>
          <span data-note-count>${note.length}/300</span>
        </div>
      </div>
    </section>
  `;
}

function summaryCard(t, mode) {
  const pix = cart.totals({ mode, payment: 'pix' });
  return html`
    <section class="card cart-summary" aria-labelledby="cart-summary-t">
      <h2 id="cart-summary-t">Resumo</h2>
      ${totalsSummary(t, { mode })}
      <p class="notice notice--green cart-summary__pix">${icon('pix')}<span><strong>${money(pix.total)} no Pix</strong> · ${SITE.pix.discountPct}% de desconto</span></p>
      <div class="cart-summary__cta">${priceButton('Fechar pedido', t.total, { href: '#/checkout', cls: 'btn--lg' })}</div>
      <p class="cart-summary__trust">${icon('shield-check')}<span>Cancelamento grátis antes da produção.</span></p>
    </section>
  `;
}

function emptyCart() {
  const picks = PRODUCTS.filter(isCake)
    .sort((a, b) => Number(b.featured) - Number(a.featured) || b.reviews - a.reviews)
    .slice(0, 4);
  return html`
    <div class="container cart cart--empty">
      ${pageHead('Carrinho', { back: '/cardapio' })}
      <div class="empty cart-empty">
        <div class="empty__art">${icon('bag')}</div>
        <h2>Seu carrinho está vazio</h2>
        <p>Escolha um bolo do cardápio ou monte o seu em 3D.</p>
        <div class="cart-empty__cta">
          <a class="btn" href="#/cardapio">Ver cardápio</a>
          <a class="btn btn--secondary" href="#/monte-seu-bolo">${icon('cube')}Montar meu bolo em 3D</a>
        </div>
      </div>
      <section class="cart-picks" aria-labelledby="cart-picks-t">
        ${sectionHead('Mais pedidos', { href: '#/cardapio', id: 'cart-picks-t' })}
        <div class="rail rail--grid cart-picks__rail">${picks.map((p) => productCard(p, { compact: true }))}</div>
      </section>
      <div class="cart-empty__promo">
        ${promoBanner({
          tone: 'stage',
          tag: 'Só na BOLAB',
          title: 'Monte o seu em 3D',
          text: 'Massa, recheio e cobertura do seu jeito.',
          cta: 'Montar agora',
          href: '#/monte-seu-bolo',
          img: 'assets/img/cz-morango.webp',
          cutout: true,
        })}
      </div>
    </div>
  `;
}

/* ───────── Tela ───────── */
export default {
  title: 'Carrinho',
  layout: 'plain', // como em um aplicativo: sem rodapé do site no celular

  render() {
    if (cart.isEmpty()) return emptyCart();
    const ctx = receiveContext();
    const t = cart.totals({ mode: ctx.mode });
    return html`
      <div class="container cart">
        ${pageHead('Carrinho', { back: '/cardapio', sub: plural(t.itemCount, 'item', 'itens') })}
        <div class="cart-layout">
          <div class="cart-main">
            ${receiveCard(ctx)}
            <section class="card cart-items" aria-label="Itens do carrinho">
              ${ctx.mode === 'pickup' ? '' : shippingStrip(t)}
              <ul class="cart-lines">
                ${cart.lines().map(lineItem)}
              </ul>
              <a class="cart-more" href="#/cardapio">${icon('plus')}Adicionar mais itens</a>
            </section>
            ${alsoRail()} ${noteCard()}
          </div>
          <aside class="cart-side">${couponCard(t)} ${summaryCard(t, ctx.mode)}</aside>
        </div>
        <p class="sr-only" role="status" data-cart-live></p>
        <div class="sticky-cta cart-bar">${priceButton('Fechar pedido', t.total, { href: '#/checkout' })}</div>
      </div>
    `;
  },

  mount(root, ctx) {
    const page = root.firstElementChild;
    const redraw = () => keepFocus(() => ctx.rerender());
    const offStore = whenStore('cart', redraw);
    // O modo de receber escolhido no cabeçalho (entrega ou retirada) muda a taxa e a data.
    window.addEventListener('bolab:receive', redraw);
    const off = () => {
      offStore();
      window.removeEventListener('bolab:receive', redraw);
    };
    if (cart.isEmpty()) return off;

    /* Quantidade e remoção */
    page.addEventListener('qty', (ev) => cart.setQty(ev.target.dataset.id, ev.detail));

    on(page, 'click', '[data-remove]', (_ev, btn) => {
      const line = cart.remove(btn.dataset.remove);
      if (!line) return;
      toast(`${line.name} saiu do carrinho`, { duration: 6000, action: { label: 'Desfazer', onClick: () => cart.restore(line) } });
    });

    /* Cupom */
    const showCouponError = (message) => {
      draft.couponError = message;
      const field = page.querySelector('[data-coupon-form] .field');
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
      // Sem aviso flutuante: o cupom aplicado e os novos valores já aparecem no próprio resumo.
      draft.coupon = '';
      draft.couponError = '';
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
    on(page, 'click', '[data-coupon-remove]', () => cart.removeCoupon());

    /* Observação */
    on(page, 'input', '#cart-note', (_ev, area) => {
      cart.setNote(area.value);
      page.querySelector('[data-note-count]').textContent = `${area.value.length}/300`;
    });

    /* Bolo montado no 3D: abre e fecha a lista completa de escolhas. */
    on(page, 'click', '[data-details]', (_ev, btn) => {
      const id = btn.dataset.details;
      if (draft.openDetails.has(id)) draft.openDetails.delete(id);
      else draft.openDetails.add(id);
      redraw();
    });

    /* Peça também: o item novo aparece destacado na lista, sem aviso por cima do que mudou. */
    on(page, 'click', '[data-cart-add]', (_ev, btn) => {
      const line = cart.addProduct(btn.dataset.cartAdd);
      if (line) draft.freshLine = line.lineId;
    });
    const added = draft.freshLine ? cart.line(draft.freshLine) : null;
    draft.freshLine = '';
    if (added) {
      page.querySelector('.cart-line.is-new')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      requestAnimationFrame(() => {
        const live = page.querySelector('[data-cart-live]');
        if (live) live.textContent = `${added.name} foi para o carrinho.`;
      });
    }

    /* Barra de entrega grátis: anima do valor anterior até o atual. */
    const bar = page.querySelector('.cart-ship .progress > i');
    if (bar) {
      const pct = Number(bar.dataset.pct);
      requestAnimationFrame(() => {
        bar.style.width = `${pct}%`;
      });
      draft.pct = pct;
    }

    return off;
  },
};
