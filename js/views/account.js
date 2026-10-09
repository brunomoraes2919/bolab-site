// BOLAB — minha conta: visão geral (#/conta).
// Também exporta a moldura e os utilitários usados pelas telas #/conta/*.
import { html, icon, initials, on, plural, toast, confirmDialog, dateLong, toDate } from '../ui.js';
import { pageHead } from '../components.js';
import { auth, orders, favs, addresses, cards, prefs, store } from '../store.js';
import { navigate } from '../router.js';
import { COUPONS, WALLET_COUPONS, SITE } from '../data/site.js';
import { demoNote } from './auth.js';

/* ───────── Utilitários compartilhados ───────── */
export function firstName(user) {
  const first = String(user?.name || '').trim().split(/\s+/)[0] || '';
  return first.length > 24 ? `${first.slice(0, 24)}…` : first; // primeiro nome gigante não vira parede de texto
}

const MONTH_YEAR = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

/** "outubro de 2026" */
export function memberSince(user) {
  return MONTH_YEAR.format(new Date(user?.createdAt || Date.now()));
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
  if (coupon.expires && toDate(coupon.expires) < new Date()) return { usable: false, why: 'Expirado' };
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

export const ACCOUNT_MENU = [
  { id: 'pedidos', href: '#/pedidos', icon: 'package', title: 'Meus pedidos' },
  { id: 'favoritos', href: '#/favoritos', icon: 'heart', title: 'Favoritos e bolos criados' },
  { id: 'dados', href: '#/conta/dados', icon: 'user', title: 'Dados pessoais' },
  { id: 'enderecos', href: '#/conta/enderecos', icon: 'map-pin', title: 'Endereços' },
  { id: 'pagamentos', href: '#/conta/pagamentos', icon: 'credit-card', title: 'Formas de pagamento' },
  { id: 'cupons', href: '#/conta/cupons', icon: 'ticket', title: 'Cupons' },
  { id: 'indicar', href: '#/conta/indicar', icon: 'gift', title: 'Indique e ganhe' },
  { id: 'atendimento', href: '#/atendimento', icon: 'message', title: 'Atendimento' },
];

/**
 * Moldura das telas internas da conta: título com voltar e, no desktop, menu lateral.
 *   accountPage({ title, sub, active: 'enderecos', body: html`…` })
 */
export function accountPage({ title, sub = '', active = '', body }) {
  const user = auth.user();
  if (!user) return '';
  return html`
    <div class="container acc">
      ${pageHead(title, { back: '/conta', sub })}
      <div class="acc-shell">
        <aside class="acc-side only-desktop">
          <a class="acc-side__me" href="#/conta" aria-label="Visão geral da conta">
            <span class="avatar" data-user-initials>${initials(user.name)}</span>
            <div>
              <strong data-user-name>${user.name}</strong>
              <span data-user-email>${user.email}</span>
            </div>
          </a>
          <nav class="acc-side__nav" aria-label="Minha conta">
            <a href="#/conta">${icon('home')} Visão geral</a>
            ${ACCOUNT_MENU.map(
              (m) => html`<a href="${m.href}" class="${m.id === active ? 'is-active' : ''}" ${m.id === active ? html`aria-current="page"` : ''}>${icon(m.icon)} ${m.title}</a>`,
            )}
          </nav>
        </aside>
        <div class="acc-main">${body}</div>
      </div>
    </div>
  `;
}

/* ───────── Visão geral ───────── */
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
  const step = st.steps[st.index];
  const waiting = !o.payment?.paidAt;
  const pct = Math.round(((st.index + 1) / st.steps.length) * 100);
  const when = o.delivery?.date ? `${dateLong(o.delivery.date)}${o.delivery.slot ? `, ${o.delivery.slot}` : ''}` : '';
  return html`
    <a class="card acc-order" href="#/pedido/${o.id}">
      <div class="acc-order__top">
        <span class="acc-order__live"><i></i>Pedido em andamento</span>
        <span class="badge ${waiting ? 'badge--amber' : 'badge--green'}">${st.label}</span>
      </div>
      <h3>Pedido ${o.id}</h3>
      <p>
        ${waiting ? 'Estamos aguardando a confirmação do pagamento.' : step.desc}
        ${when ? html`<br />${o.delivery.mode === 'pickup' ? 'Retirada' : 'Entrega'}: ${when}` : ''}
      </p>
      <div class="progress ${waiting ? '' : 'progress--green'}" role="img" aria-label="Etapa ${st.index + 1} de ${st.steps.length}"><i style="width:${pct}%"></i></div>
      <span class="link-arrow">Acompanhar pedido ${icon('arrow-right')}</span>
    </a>
  `;
}

function menuRows() {
  const nOrders = orders.count();
  const nFavs = favs.count();
  const addr = addresses.default();
  const card = cards.default();
  const nCoupons = usableCoupons().length;
  const desc = {
    pedidos: nOrders ? `${plural(nOrders, 'pedido', 'pedidos')} até agora` : 'Acompanhe seus pedidos',
    favoritos: nFavs ? `${plural(nFavs, 'item salvo', 'itens salvos')}` : 'O que você salvar e montar no 3D',
    dados: 'Nome, contato, aniversário e senha',
    enderecos: addr ? `${addr.label}: ${[addr.street, addr.number].filter(Boolean).join(', ')}` : 'Cadastre para agilizar a entrega',
    pagamentos: card ? `${card.brand} final ${card.last4}` : `Pix com ${SITE.pix.discountPct}% OFF e cartões salvos`,
    cupons: nCoupons ? 'Descontos prontos para usar' : 'Seus descontos aparecem aqui',
    indicar: 'Ganhe R$ 20 a cada indicação',
    atendimento: 'Tire dúvidas ou fale com a equipe',
  };
  return ACCOUNT_MENU.map(
    (m) => html`
      <a class="row" href="${m.href}">
        <span class="row__icon">${icon(m.icon)}</span>
        <span class="row__body">
          <span class="row__title">${m.title}</span>
          <span class="row__desc">${desc[m.id]}</span>
        </span>
        ${m.id === 'cupons' && nCoupons ? html`<span class="badge badge--solid">${nCoupons}</span>` : ''}
        ${icon('chevron-right', { cls: 'row__chev' })}
      </a>
    `,
  );
}

export default {
  title: 'Minha conta',
  layout: 'plain',
  auth: true,

  render() {
    const user = auth.user();
    if (!user) return '';
    const current = activeOrder();
    const coupons = usableCoupons();
    const welcome = coupons.includes('BOLAB10') && !current;
    return html`
      <div class="container acc">
        <div class="page-head">
          <div>
            <h1>Minha conta</h1>
            <p class="muted">Olá, ${firstName(user)}! Tudo o que é seu na BOLAB está aqui.</p>
          </div>
        </div>

        <div class="acc-hub">
          <div class="acc-hub__col acc-hub__col--side">
            <section class="card acc-profile" aria-label="Seu perfil">
              <div class="acc-profile__cover"></div>
              <div class="acc-profile__body">
                <span class="avatar avatar--lg">${initials(user.name)}</span>
                <a class="btn btn--sm btn--secondary acc-profile__edit" href="#/conta/dados">${icon('edit')} Editar</a>
              </div>
              <div class="acc-profile__info">
                <h2>${user.name}</h2>
                <p>${user.email}</p>
                <span class="acc-profile__since">${icon('calendar')} Cliente desde ${memberSince(user)}</span>
              </div>
              <div class="acc-stats">
                <a class="acc-stat" href="#/pedidos"><strong>${orders.count()}</strong><span>${orders.count() === 1 ? 'Pedido' : 'Pedidos'}</span></a>
                <a class="acc-stat" href="#/favoritos"><strong>${favs.count()}</strong><span>${favs.count() === 1 ? 'Favorito' : 'Favoritos'}</span></a>
                <a class="acc-stat" href="#/conta/cupons" aria-label="${plural(coupons.length, 'cupom disponível', 'cupons disponíveis')}">
                  <strong>${coupons.length}</strong><span>${coupons.length === 1 ? 'Cupom' : 'Cupons'}</span>
                </a>
              </div>
            </section>

            ${current ? orderCard(current) : ''}
            ${welcome
              ? html`
                  <a class="card acc-gift" href="#/conta/cupons">
                    <span class="acc-gift__icon">${icon('gift')}</span>
                    <span><strong>Seu presente de boas-vindas</strong>${COUPONS.BOLAB10.label} com o cupom BOLAB10.</span>
                    ${icon('chevron-right')}
                  </a>
                `
              : ''}
          </div>

          <div class="acc-hub__col">
            <nav class="card acc-menu" aria-label="Minha conta">${menuRows()}</nav>

            <div class="card acc-menu acc-out">
              <button class="row" type="button" data-signout>
                <span class="row__icon">${icon('log-out')}</span>
                <span class="row__body"><span class="row__title">Sair da conta</span></span>
              </button>
            </div>

            ${SITE.demo
              ? html`<div class="acc-hub__foot">
                  ${demoNote(
                    html`conta, pedidos e carrinho ficam salvos só neste aparelho.
                      <button class="acc-reset" type="button" data-reset>Apagar dados de demonstração deste aparelho</button>`,
                  )}
                </div>`
              : ''}
          </div>
        </div>
      </div>
    `;
  },

  mount(root, ctx) {
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

    // Pedidos, favoritos, endereços… qualquer mudança atualiza os números da tela.
    return rerenderOn(ctx, ['*']);
  },
};
