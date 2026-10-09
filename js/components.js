// BOLAB — blocos de interface usados por várias telas. Todos devolvem html`` (seguro).
import { html, icon, money, raw } from './ui.js';
import { favs } from './store.js';
import { photoUrl, photoAlt, photoFocus } from './data/photos.js';
import { isCake, sizesOf } from './data/products.js';

/**
 * Foto responsiva com fallback elegante se não carregar.
 *   photo('p1', { w: 480, ratio: '1/1', alt, eager: false, cls: '' })
 * `key` é uma chave de js/data/photos.js. Para bolos personalizados use customThumb().
 */
export function photo(key, { w = 480, alt, eager = false, cls = '', sizes } = {}) {
  const src = photoUrl(key, w);
  if (!src) return mediaFallback(cls);
  const srcset = [w, w * 2].map((x) => `${photoUrl(key, x)} ${x}w`).join(', ');
  return html`<img
    class="${cls}"
    src="${src}"
    srcset="${srcset}"
    sizes="${sizes || `${w}px`}"
    alt="${alt ?? photoAlt(key)}"
    style="object-position:${photoFocus(key)}"
    loading="${eager ? 'eager' : 'lazy'}"
    decoding="async"
    data-fallback
  />`;
}

export function mediaFallback(cls = '') {
  return html`<div class="media-fallback ${cls}">${icon('cake')}</div>`;
}

/** Miniatura de um item do carrinho/pedido (produto do catálogo ou bolo personalizado). */
export function lineThumb(line, { w = 160 } = {}) {
  if (line.kind === 'custom') {
    return line.thumb ? html`<img src="${line.thumb}" alt="Seu bolo personalizado" loading="lazy" />` : mediaFallback();
  }
  return photo(line.photo, { w, alt: line.name });
}

export function rating(value, count) {
  const v = Number(value).toFixed(1).replace('.', ',');
  return html`<span class="rating" aria-label="Nota ${v} de 5">${icon('star')}${v}${count != null ? html` <span>(${count})</span>` : ''}</span>`;
}

/** Cinco estrelas preenchidas conforme a nota (para avaliações). */
export function stars(value) {
  const n = Math.round(Number(value));
  return html`<span class="stars" aria-label="${n} de 5 estrelas">${[1, 2, 3, 4, 5].map((i) => raw(`<span class="${i <= n ? 'is-on' : ''}">★</span>`))}</span>`;
}

/** Coração de favorito. O clique é tratado globalmente em app.js (data-fav). */
export function favButton(productId, { cls = '' } = {}) {
  const on = favs.has(productId);
  return html`<button
    class="fav-btn ${on ? 'is-on' : ''} ${cls}"
    type="button"
    data-fav="${productId}"
    aria-pressed="${on ? 'true' : 'false'}"
    aria-label="${on ? 'Remover dos favoritos' : 'Salvar nos favoritos'}"
  >
    ${icon('heart')}
  </button>`;
}

/**
 * Card de produto para grades e carrosséis.
 * O botão "+" adiciona direto (data-add-product, tratado em app.js).
 */
export function productCard(p, { eager = false } = {}) {
  const cake = isCake(p);
  return html`
    <article class="pcard">
      <div class="pcard__media">
        ${photo(p.photo, { w: 420, alt: p.name, eager, sizes: '(min-width: 1100px) 280px, (min-width: 640px) 31vw, 46vw' })}
        ${p.badge ? html`<span class="badge badge--dark pcard__badge">${p.badge}</span>` : ''}
        ${favButton(p.id, { cls: 'pcard__fav' })}
      </div>
      <div class="pcard__body">
        ${rating(p.rating, p.reviews)}
        <h3 class="pcard__name"><a href="#/produto/${p.id}">${p.name}</a></h3>
        <p class="pcard__desc">${p.desc}</p>
        <div class="pcard__foot">
          <div class="price">${sizesOf(p).length ? html`<small>a partir de</small><br />` : ''}${money(p.price)}</div>
          <button class="pcard__add" type="button" data-add-product="${p.id}" aria-label="Adicionar ${p.name} ao carrinho">
            ${icon(cake ? 'plus' : 'plus')}
          </button>
        </div>
      </div>
    </article>
  `;
}

/** Contador − 1 + . Emite o evento "qty" (detail: número) no próprio elemento. */
export function qtyStepper(value, { min = 1, max = 20, small = false, id = '' } = {}) {
  return html`
    <div class="qty ${small ? 'qty--sm' : ''}" data-qty data-min="${min}" data-max="${max}" data-id="${id}">
      <button type="button" data-qty-step="-1" aria-label="Diminuir quantidade" ${value <= min ? raw('disabled') : ''}>${icon('minus')}</button>
      <output aria-live="polite">${value}</output>
      <button type="button" data-qty-step="1" aria-label="Aumentar quantidade" ${value >= max ? raw('disabled') : ''}>${icon('plus')}</button>
    </div>
  `;
}

export function emptyState({ iconName = 'cake', title, text, cta, href }) {
  return html`
    <div class="empty">
      <div class="empty__art">${icon(iconName)}</div>
      <h2>${title}</h2>
      <p>${text}</p>
      ${cta ? html`<a class="btn" href="${href}">${cta}</a>` : ''}
    </div>
  `;
}

/** Cabeçalho de página interna com botão voltar (data-back é tratado em app.js). */
export function pageHead(title, { back = '/', sub = '' } = {}) {
  return html`
    <div class="page-head">
      <button class="icon-btn page-head__back" type="button" data-back="${back}" aria-label="Voltar">${icon('arrow-left')}</button>
      <div>
        <h1>${title}</h1>
        ${sub ? html`<p class="muted">${sub}</p>` : ''}
      </div>
    </div>
  `;
}

export function breadcrumb(items) {
  return html`<nav class="breadcrumb" aria-label="Você está em">
    ${items.map((it, i) =>
      i < items.length - 1 ? html`<a href="${it.href}">${it.label}</a>${icon('chevron-right')}` : html`<span aria-current="page">${it.label}</span>`,
    )}
  </nav>`;
}

/** Aviso com ícone. tone: '' | 'green' | 'amber' | 'red' */
export function notice(text, { tone = '', iconName = 'info' } = {}) {
  return html`<div class="notice ${tone ? `notice--${tone}` : ''}">${icon(iconName)}<div>${text}</div></div>`;
}

/** Linhas de valores do resumo (carrinho, checkout, pedido). `t` vem de cart.totals(). */
export function totalsSummary(t, { showShipping = true, mode = 'delivery' } = {}) {
  return html`
    <div class="summary-line"><span>Subtotal</span><strong>${money(t.subtotal)}</strong></div>
    ${t.couponDiscount > 0
      ? html`<div class="summary-line summary-line--discount"><span>Cupom ${t.coupon?.code || t.coupon || ''}</span><span>− ${money(t.couponDiscount)}</span></div>`
      : ''}
    ${t.pixDiscount > 0 ? html`<div class="summary-line summary-line--discount"><span>Desconto no Pix</span><span>− ${money(t.pixDiscount)}</span></div>` : ''}
    ${showShipping
      ? html`<div class="summary-line">
          <span>${mode === 'pickup' ? 'Retirada no ateliê' : 'Entrega'}</span>
          ${t.shipping === 0
            ? html`<strong style="color:var(--green)">Grátis</strong>`
            : html`<strong>${money(t.shipping)}</strong>`}
        </div>`
      : ''}
    <div class="summary-line summary-line--total"><span>Total</span><strong>${money(t.total)}</strong></div>
  `;
}
