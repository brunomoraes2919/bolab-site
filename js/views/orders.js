// BOLAB — meus pedidos (#/pedidos).
import { html, icon, money, dateLong, dateTime, plural, on } from '../ui.js';
import { lineThumb, pageHead } from '../components.js';
import { orders } from '../store.js';
import { whenStore, keepFocus } from './cart.js';
import { isClosed, isPickup, isPixPending, statusBadge } from './order.js';

const MAX_THUMBS = 4;
let tab = ''; // 'open' (em andamento) | 'closed' (concluídos); vazio = ainda não escolhida pela pessoa

function orderCard(order) {
  const count = order.items.reduce((n, l) => n + l.qty, 0);
  const shown = order.items.slice(0, MAX_THUMBS);
  const extra = order.items.length - shown.length;
  const names = order.items.map((l) => l.name).join(', ');
  return html`
    <li>
      <a class="card ord-card" href="#/pedido/${order.id}" aria-label="Pedido ${order.id}, ${names}. Ver detalhes">
        <div class="ord-card__head">
          <div>
            <strong>Pedido ${order.id}</strong>
            <span>Feito em ${dateTime(order.createdAt)}</span>
          </div>
          ${statusBadge(order)}
        </div>
        <div class="ord-card__items">
          <div class="ord-card__thumbs">
            ${shown.map((l) => html`<span class="ord-card__thumb">${lineThumb(l, { w: 112 })}</span>`)}
            ${extra > 0 ? html`<span class="ord-card__thumb ord-card__more">+${extra}</span>` : ''}
          </div>
          <p class="ord-card__names">${names}</p>
        </div>
        <div class="ord-card__foot">
          <span class="ord-card__when">
            ${icon(isPickup(order) ? 'store' : 'truck')}
            <span>
              <small>${isPickup(order) ? 'Retirada' : 'Entrega'}</small>
              <strong>${dateLong(order.delivery.date)}</strong>
              <span>Entre ${order.delivery.slot.replace(' – ', ' e ')}</span>
            </span>
          </span>
          <span class="ord-card__total">
            <small>${plural(count, 'item', 'itens')}</small>
            <strong>${money(order.totals.total)}</strong>
          </span>
        </div>
        <div class="ord-card__cta">
          ${isPixPending(order) ? html`<span class="ord-card__alert">${icon('pix')} Pague o Pix para confirmar</span>` : html`<span></span>`}
          <span class="link-arrow">Ver detalhes ${icon('arrow-right')}</span>
        </div>
      </a>
    </li>
  `;
}

function emptyAll() {
  return html`
    <div class="empty">
      <div class="empty__art">${icon('package')}</div>
      <h2>Seu primeiro pedido começa aqui</h2>
      <p>Quando você fizer uma encomenda, vai acompanhar cada etapa por esta tela: do forno até a sua mesa.</p>
      <div class="cart-empty__cta">
        <a class="btn" href="#/cardapio">${icon('cake')} Ver cardápio</a>
        <a class="btn btn--secondary" href="#/monte-seu-bolo">${icon('sparkles')} Montar meu bolo em 3D</a>
      </div>
    </div>
  `;
}

function emptyTab(current) {
  return current === 'open'
    ? html`
        <div class="empty ord-empty">
          <div class="empty__art">${icon('cake')}</div>
          <h2>Nenhum pedido em andamento</h2>
          <p>Que tal já garantir o bolo da próxima comemoração?</p>
          <a class="btn" href="#/cardapio">Ver cardápio</a>
        </div>
      `
    : html`
        <div class="empty ord-empty">
          <div class="empty__art">${icon('receipt')}</div>
          <h2>Nada concluído ainda</h2>
          <p>Os pedidos entregues, retirados ou cancelados ficam guardados aqui.</p>
        </div>
      `;
}

export default {
  title: 'Meus pedidos',
  layout: 'plain',
  auth: true,

  render() {
    const all = orders.list();
    if (!all.length) {
      return html`<div class="container container--narrow ord-list">${pageHead('Meus pedidos', { back: '/conta' })} ${emptyAll()}</div>`;
    }
    const open = all.filter((o) => !isClosed(o));
    const closed = all.filter(isClosed);
    // Sem escolha da pessoa, abre onde há pedidos: em andamento primeiro.
    const current = tab || (open.length ? 'open' : 'closed');
    const list = current === 'open' ? open : closed;
    return html`
      <div class="container container--narrow ord-list">
        ${pageHead('Meus pedidos', { back: '/conta', sub: plural(all.length, 'pedido', 'pedidos') })}
        <div class="tabs ord-tabs" role="tablist" aria-label="Filtrar pedidos">
          <button type="button" role="tab" id="ord-tab-open" data-tab="open" aria-selected="${current === 'open' ? 'true' : 'false'}" aria-controls="ord-panel">
            Em andamento <span class="ord-tabs__count">${open.length}</span>
          </button>
          <button type="button" role="tab" id="ord-tab-closed" data-tab="closed" aria-selected="${current === 'closed' ? 'true' : 'false'}" aria-controls="ord-panel">
            Concluídos <span class="ord-tabs__count">${closed.length}</span>
          </button>
        </div>
        <div id="ord-panel" role="tabpanel" aria-labelledby="ord-tab-${current}">
          ${list.length ? html`<ul class="ord-cards">${list.map(orderCard)}</ul>` : emptyTab(current)}
        </div>
      </div>
    `;
  },

  mount(root, ctx) {
    const page = root.firstElementChild;
    const redraw = () => keepFocus(() => ctx.rerender());
    on(page, 'click', '[data-tab]', (_ev, btn) => {
      if (btn.getAttribute('aria-selected') === 'true') return;
      tab = btn.dataset.tab;
      redraw();
    });
    return whenStore('orders', redraw);
  },
};
