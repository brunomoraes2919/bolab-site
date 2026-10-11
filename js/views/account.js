// BOLAB — minha conta: perfil (#/conta).
// Também exporta a moldura (menu lateral no computador) e os utilitários das telas #/conta/*.
import { html, icon, initials, on, plural, money, toast, confirmDialog, toDate } from '../ui.js';
import { pageHead, listRow, sectionHead, dayLabel, slotLabel } from '../components.js';
import { auth, orders, favs, addresses, cards, savedCakes, prefs, store } from '../store.js';
import { navigate } from '../router.js';
import { COUPONS, WALLET_COUPONS, SITE } from '../data/site.js';
import { demoNote } from './auth.js';
import { statusBadge } from './order.js';

/* ───────── Utilitários compartilhados ───────── */
export function firstName(user) {
  const first = String(user?.name || '').trim().split(/\s+/)[0] || '';
  return first.length > 24 ? `${first.slice(0, 24)}…` : first; // primeiro nome gigante não vira parede de texto
}

const walletKey = () => `wallet:${auth.user()?.id || 'guest'}`;

/** Códigos na carteira da pessoa: os da loja + os que ela adicionou pelo código. */
export function walletCodes() {
  const extra = prefs.get(walletKey(), []);
  return [...new Set([...WALLET_COUPONS, ...(Array.isArray(extra) ? extra : [])])].filter((code) => COUPONS[code]);
}

export function addToWallet(code) {
  if (walletCodes().includes(code)) return;
  const extra = prefs.get(walletKey(), []);
  prefs.set(walletKey(), [...(Array.isArray(extra) ? extra : []), code]);
}

/** O cupom pode ser usado por esta pessoa agora? → { usable, why } (mesmas regras da loja). */
export function couponStatus(coupon) {
  if (coupon.expires && toDate(coupon.expires) < new Date()) return { usable: false, why: 'Vencido' };
  if (coupon.firstOrderOnly && orders.list().some((o) => !o.canceled)) return { usable: false, why: 'Só no 1º pedido' };
  return { usable: true, why: '' };
}

export function usableCoupons() {
  return walletCodes().filter((code) => couponStatus(COUPONS[code]).usable);
}

/**
 * Redesenha a tela quando o estado muda: return rerenderOn(ctx, ['addresses']).
 * Vários avisos seguidos (ex.: salvar + tornar padrão) viram um único redesenho,
 * e nada é redesenhado depois que a pessoa saiu da conta.
 */
export function rerenderOn(ctx, events) {
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (auth.isLogged()) ctx.rerender();
    });
  };
  const offs = events.map((name) => store.on(name, schedule));
  return () => offs.forEach((off) => off());
}

/** Mostra o botão "carregando" enquanto `work` roda (com uma pausa mínima para dar retorno visual). */
export async function withLoading(btn, work, minMs = 320) {
  if (!btn) return work();
  if (btn.classList.contains('is-loading')) return undefined;
  btn.classList.add('is-loading');
  btn.setAttribute('aria-busy', 'true');
  try {
    await new Promise((r) => setTimeout(r, minMs));
    return await work();
  } finally {
    btn.classList.remove('is-loading');
    btn.removeAttribute('aria-busy');
  }
}

/* ───────── Menu da conta ───────── */
const MENU = {
  pedidos: { href: '#/pedidos', icon: 'receipt', title: 'Meus pedidos' },
  favoritos: { href: '#/favoritos', icon: 'heart', title: 'Favoritos' },
  dados: { href: '#/conta/dados', icon: 'user', title: 'Meus dados' },
  enderecos: { href: '#/conta/enderecos', icon: 'map-pin', title: 'Endereços' },
  pagamentos: { href: '#/conta/pagamentos', icon: 'credit-card', title: 'Pagamentos' },
  cupons: { href: '#/conta/cupons', icon: 'ticket', title: 'Cupons' },
  indicar: { href: '#/conta/indicar', icon: 'gift', title: 'Indique e ganhe' },
  atendimento: { href: '#/atendimento', icon: 'message', title: 'Atendimento' },
};

/** Grupos de linhas do perfil no celular (no computador o menu lateral faz esse papel). */
const GROUPS = [
  { title: 'Conta', ids: ['dados', 'enderecos', 'pagamentos'] },
  { title: 'Vantagens', ids: ['cupons', 'indicar'] },
  { title: 'Ajuda', ids: ['atendimento'] },
];

const SIDE_ORDER = ['pedidos', 'favoritos', 'dados', 'enderecos', 'pagamentos', 'cupons', 'indicar', 'atendimento'];

/** Menu lateral fixo do computador: quem é, para onde ir e a saída. */
function sideNav(active) {
  const user = auth.user();
  const link = (id, m) =>
    html`<a href="${m.href}" class="${id === active ? 'is-active' : ''}" ${id === active ? html`aria-current="page"` : ''}>${icon(m.icon)}<span>${m.title}</span></a>`;
  return html`
    <aside class="acc-side only-desktop">
      <div class="acc-side__me">
        <span class="avatar" data-user-initials>${initials(user.name)}</span>
        <div>
          <strong data-user-name>${user.name}</strong>
          <span data-user-email>${user.email}</span>
        </div>
      </div>
      <nav class="card acc-side__nav" aria-label="Minha conta">
        ${link('visao', { href: '#/conta', icon: 'home', title: 'Visão geral' })} ${SIDE_ORDER.map((id) => link(id, MENU[id]))}
      </nav>
      <button class="acc-side__out" type="button" data-signout>${icon('log-out')}<span>Sair da conta</span></button>
    </aside>
  `;
}

/**
 * Moldura das telas internas da conta: no celular, título com voltar; no computador, menu lateral + conteúdo.
 *   accountPage({ title, sub, active: 'enderecos', body: html`…` })
 * Na montagem da tela, chame bindAccount(root) para ligar o "Sair da conta" do menu lateral.
 */
export function accountPage({ title, sub = '', active = '', body }) {
  if (!auth.user()) return '';
  return html`
    <div class="container acc">
      <div class="acc-shell">
        ${sideNav(active)}
        <div class="acc-main">${pageHead(title, { back: '/conta', sub })} ${body}</div>
      </div>
    </div>
  `;
}

/** Liga as ações comuns a todas as telas da conta: sair e (em demonstração) apagar os dados. */
export function bindAccount(root) {
  on(root, 'click', '[data-signout]', async () => {
    const ok = await confirmDialog({
      title: 'Sair da conta?',
      message: 'Seus pedidos, endereços e favoritos continuam guardados para quando você voltar.',
      confirmLabel: 'Sair',
      cancelLabel: 'Continuar na conta',
    });
    if (!ok) return;
    // Primeiro muda de tela, depois encerra a sessão: assim ninguém cai no login sem querer.
    navigate('/');
    auth.signOut();
    toast('Você saiu da conta. Até logo!');
  });

  on(root, 'click', '[data-reset]', async () => {
    const ok = await confirmDialog({
      title: 'Apagar dados de demonstração?',
      message: 'Isso remove deste aparelho as contas de teste, pedidos, endereços, cartões, favoritos e o carrinho. Não dá para desfazer.',
      confirmLabel: 'Apagar tudo',
      cancelLabel: 'Cancelar',
      danger: true,
    });
    if (!ok) return;
    navigate('/');
    store.reset();
    toast('Pronto: os dados de demonstração foram apagados deste aparelho.', { type: 'success' });
  });
}

/* ───────── Perfil ───────── */
function activeOrder() {
  for (const o of orders.list()) {
    try {
      const st = orders.statusOf(o);
      if (!st.canceled && st.id !== 'delivered') return { o, st };
    } catch {
      // pedido com dados incompletos: ignora
    }
  }
  return null;
}

function orderCard({ o, st }) {
  const waiting = !o.payment?.paidAt;
  const pct = Math.round(((st.index + 1) / st.steps.length) * 100);
  const how = o.delivery?.mode === 'pickup' ? 'Retirada' : 'Entrega';
  const when = o.delivery?.date ? `${how} ${dayLabel(o.delivery.date)}${o.delivery.slot ? ` · ${slotLabel(o.delivery.slot)}` : ''}` : how;
  return html`
    <a class="card acc-order" href="#/pedido/${o.id}">
      <div class="acc-order__top">
        ${statusBadge(o)}
        <span class="acc-order__go">Acompanhar${icon('chevron-right')}</span>
      </div>
      <strong class="acc-order__title">Pedido ${o.id}</strong>
      <span class="acc-order__meta">${when}</span>
      <div class="progress ${waiting ? '' : 'progress--green'}" role="img" aria-label="Etapa ${st.index + 1} de ${st.steps.length}"><i style="width:${pct}%"></i></div>
    </a>
  `;
}

function shortcuts() {
  const nOrders = orders.count();
  const nCoupons = usableCoupons().length;
  const nFavs = favs.count();
  const tile = (href, ic, label, info) => html`
    <a class="card acc-quick__item" href="${href}">
      <span class="acc-quick__icon">${icon(ic)}</span>
      <strong>${label}</strong>
      <span>${info}</span>
    </a>
  `;
  return html`
    <nav class="acc-quick" aria-label="Atalhos">
      ${tile('#/pedidos', 'receipt', 'Pedidos', nOrders ? plural(nOrders, 'pedido', 'pedidos') : 'Nenhum ainda')}
      ${tile('#/conta/cupons', 'ticket', 'Cupons', nCoupons ? plural(nCoupons, 'disponível', 'disponíveis') : 'Nenhum agora')}
      ${tile('#/favoritos', 'heart', 'Favoritos', nFavs ? plural(nFavs, 'salvo', 'salvos') : 'Nenhum ainda')}
    </nav>
  `;
}

/** Bolos montados no 3D e salvos: carrossel compacto que reabre o personalizador. */
function cakesRail() {
  const cakes = savedCakes.list();
  if (!cakes.length) return '';
  return html`
    <section class="acc-cakes" aria-label="Seus bolos em 3D">
      ${sectionHead('Seus bolos em 3D', { href: '#/favoritos', label: 'Ver todos' })}
      <div class="rail acc-cakes__rail">
        ${cakes.slice(0, 8).map(
          (c) => html`
            <a class="acc-cake" href="#/monte-seu-bolo?bolo=${c.id}">
              <span class="acc-cake__thumb">${c.thumb ? html`<img src="${c.thumb}" alt="" loading="lazy" />` : icon('cake')}</span>
              <strong>${c.name || 'Bolo personalizado'}</strong>
              ${c.price ? html`<span class="price">${money(c.price)}</span>` : ''}
            </a>
          `,
        )}
      </div>
    </section>
  `;
}

function rowDesc(id) {
  const addr = addresses.default();
  const card = cards.default();
  const nCoupons = usableCoupons().length;
  return {
    dados: 'Nome, contato e senha',
    enderecos: addr ? `${addr.label}: ${[addr.street, addr.number].filter(Boolean).join(', ')}` : 'Nenhum endereço salvo',
    pagamentos: card ? `${card.brand} final ${card.last4}` : `Pix com ${SITE.pix.discountPct}% OFF ou cartão`,
    cupons: nCoupons ? `${plural(nCoupons, 'cupom disponível', 'cupons disponíveis')}` : 'Nenhum cupom agora',
    indicar: 'Ganhe R$ 20 a cada indicação',
    atendimento: 'Dúvidas e ajuda com o pedido',
  }[id];
}

const menuRow = (id) => listRow({ iconName: MENU[id].icon, title: MENU[id].title, desc: rowDesc(id), href: MENU[id].href });

export default {
  title: 'Minha conta',
  layout: 'plain',
  auth: true,

  render() {
    const user = auth.user();
    if (!user) return '';
    const current = activeOrder();
    return html`
      <div class="container acc">
        <div class="acc-shell">
          ${sideNav('visao')}
          <div class="acc-main">
            <div class="page-head"><div><h1>Minha conta</h1></div></div>

            <a class="card acc-me" href="#/conta/dados" aria-label="Meus dados: ${user.name}">
              <span class="avatar">${initials(user.name)}</span>
              <span class="acc-me__body">
                <strong>${user.name}</strong>
                <span>${user.email}</span>
              </span>
              <span class="acc-me__edit">Editar${icon('chevron-right')}</span>
            </a>

            ${shortcuts()} ${current ? orderCard(current) : ''} ${cakesRail()}

            <div class="acc-groups only-mobile">
              ${GROUPS.map(
                (g) => html`
                  <section class="acc-group">
                    <h2 class="acc-group__title">${g.title}</h2>
                    <div class="card acc-list">${g.ids.map(menuRow)}</div>
                  </section>
                `,
              )}
              <div class="card acc-list">
                <button class="row acc-out" type="button" data-signout>
                  <span class="row__icon">${icon('log-out')}</span>
                  <span class="row__body"><span class="row__title">Sair da conta</span></span>
                </button>
              </div>
            </div>

            <section class="acc-group only-desktop">
              <h2 class="acc-group__title">Para o próximo pedido</h2>
              <div class="card acc-list">${['enderecos', 'pagamentos', 'cupons'].map(menuRow)}</div>
            </section>

            ${SITE.demo
              ? demoNote(
                  html`conta, pedidos e carrinho ficam salvos só neste aparelho.
                    <button class="acc-reset" type="button" data-reset>Apagar dados de demonstração</button>`,
                )
              : ''}
          </div>
        </div>
      </div>
    `;
  },

  mount(root, ctx) {
    bindAccount(root);
    // Pedidos, favoritos, endereços… qualquer mudança atualiza os números da tela.
    return rerenderOn(ctx, ['*']);
  },
};
