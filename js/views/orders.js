// BOLAB — meus pedidos (#/pedidos): em andamento primeiro, depois os anteriores.
import { html, icon, money, plural, on, toast } from '../ui.js';
import { lineThumb, sectionHead } from '../components.js';
import { orders } from '../store.js';
import { navigate } from '../router.js';
import { whenStore, keepFocus } from './cart.js';
import { isClosed, isOff, isPickup, isPixPending, statusBadge, whenShort } from './order.js';
import { accountPage, bindAccount } from './account.js';

const MAX_THUMBS = 4;

function orderCard(order) {
  const count = order.items.reduce((n, l) => n + l.qty, 0);
  const shown = order.items.slice(0, MAX_THUMBS);
  const extra = order.items.length - shown.length;
  const names = order.items.map((l) => (l.qty > 1 ? `${l.qty}× ${l.name}` : l.name)).join(', ');
  const closed = isClosed(order);
  const pending = isPixPending(order);
  const href = `#/pedido/${order.id}`;
  return html`
    <li class="card ord-card">
      <a class="ord-card__main" href="${href}" aria-label="Pedido ${order.id}: ${names}. Ver detalhes">
        <div class="ord-card__head">
          ${statusBadge(order)}
          <span class="ord-card__id">Pedido ${order.id}</span>
        </div>
        <p class="ord-card__when ${isOff(order) ? 'is-off' : ''}">${icon(isPickup(order) ? 'store' : 'truck')}${whenShort(order)}</p>
        <div class="ord-card__items">
          <div class="ord-card__thumbs">
            ${shown.map((l) => html`<span class="ord-card__thumb">${lineThumb(l, { w: 96 })}</span>`)}
            ${extra > 0 ? html`<span class="ord-card__thumb ord-card__more">+${extra}</span>` : ''}
          </div>
          <p class="ord-card__names">${names}</p>
        </div>
      </a>
      <div class="ord-card__foot">
        <p class="ord-card__total">
          <span>${plural(count, 'item', 'itens')}</span>
          <strong>${money(order.totals.total)}</strong>
        </p>
        ${closed
          ? html`<button class="btn btn--secondary btn--sm" type="button" id="ord-again-${order.id}" data-reorder="${order.id}">${icon('repeat')}Pedir de novo</button>`
          : pending
            ? html`<a class="btn btn--sm" href="${href}">${icon('pix')}Pagar com Pix</a>`
            : html`<a class="btn btn--soft btn--sm" href="${href}">Acompanhar${icon('chevron-right')}</a>`}
      </div>
    </li>
  `;
}

function emptyAll() {
  return html`
    <div class="card empty">
      <div class="empty__art">${icon('receipt')}</div>
      <h2>Você ainda não fez pedidos</h2>
      <p>Quando fizer, o acompanhamento aparece aqui: do forno até a sua mesa.</p>
      <div class="cart-empty__cta">
        <a class="btn" href="#/cardapio">Ver cardápio</a>
        <a class="btn btn--secondary" href="#/monte-seu-bolo">${icon('cube')}Montar meu bolo em 3D</a>
      </div>
    </div>
  `;
}

export default {
  title: 'Meus pedidos',
  layout: 'plain',
  auth: true,

  // A lista usa a moldura da conta (js/views/account.js): no computador, o mesmo menu lateral e a
  // mesma largura de "Minha conta", com "Meus pedidos" marcado; no celular, título com voltar.
  render() {
    const all = orders.list();
    if (!all.length) return accountPage({ title: 'Meus pedidos', active: 'pedidos', body: html`<div class="ord-list">${emptyAll()}</div>` });
    const open = all.filter((o) => !isClosed(o));
    const closed = all.filter(isClosed);
    const body = html`
      <div class="ord-list">
        ${open.length
          ? html`
              <section class="ord-group" aria-labelledby="ord-open-t">
                ${sectionHead('Em andamento', { id: 'ord-open-t' })}
                <ul class="ord-cards">
                  ${open.map(orderCard)}
                </ul>
              </section>
            `
          : html`
              <div class="card ord-none">
                <span class="row__icon">${icon('cake')}</span>
                <div>
                  <strong>Nenhum pedido em andamento</strong>
                  <span>Que tal garantir o bolo da próxima comemoração?</span>
                </div>
                <a class="btn btn--soft btn--sm" href="#/cardapio">Ver cardápio</a>
              </div>
            `}
        ${closed.length
          ? html`
              <section class="ord-group" aria-labelledby="ord-closed-t">
                ${sectionHead('Anteriores', { id: 'ord-closed-t' })}
                <ul class="ord-cards">
                  ${closed.map(orderCard)}
                </ul>
              </section>
            `
          : ''}
      </div>
    `;
    return accountPage({ title: 'Meus pedidos', active: 'pedidos', body });
  },

  mount(root, ctx) {
    const page = root.firstElementChild;
    if (!page) return undefined; // sessão encerrada: o roteador já está levando ao login
    bindAccount(root);
    on(page, 'click', '[data-reorder]', (_ev, btn) => {
      const n = orders.reorder(btn.dataset.reorder);
      if (!n) return;
      toast(n === 1 ? 'O item voltou para o carrinho.' : 'Os itens voltaram para o carrinho.', { type: 'success' });
      navigate('/carrinho');
    });
    return whenStore('orders', () => keepFocus(() => ctx.rerender()));
  },
};
