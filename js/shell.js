// BOLAB — moldura fixa do site: faixa de aviso, cabeçalho, rodapé e barra inferior (celular).
import { html, icon, initials, on, copyText, toast, raw } from './ui.js';
import { auth, cart, favs, store } from './store.js';
import { navigate, onRoute, currentRoute, goBack } from './router.js';
import { SITE, CATEGORIES } from './data/site.js';

const NAV = [
  { href: '#/', label: 'Início', match: (p) => p === '/' },
  { href: '#/cardapio', label: 'Cardápio', match: (p) => p.startsWith('/cardapio') || p.startsWith('/produto') },
  { href: '#/monte-seu-bolo', label: 'Monte seu bolo', match: (p) => p.startsWith('/monte-seu-bolo'), highlight: true },
  { href: '#/pedidos', label: 'Meus pedidos', match: (p) => p.startsWith('/pedido') },
];

function badge(n) {
  return n > 0 ? html`<span class="count-badge" aria-hidden="true">${n > 9 ? '9+' : n}</span>` : '';
}

function renderAnnounce() {
  document.getElementById('announce').innerHTML = String(html`
    <div class="container announce__inner">
      <span>${icon('truck')} Entrega grátis acima de R$ ${SITE.shipping.freeAbove}</span>
      <span class="announce__sep" aria-hidden="true">•</span>
      <button type="button" data-copy-coupon="BOLAB10">${icon('gift')} 10% OFF na 1ª encomenda: <strong>BOLAB10</strong></button>
    </div>
  `);
}

function renderHeader() {
  const { path, query } = currentRoute();
  const user = auth.user();
  const focus = document.body.dataset.layout === 'focus';
  document.getElementById('header').innerHTML = String(html`
    <div class="container header__inner">
      ${focus
        ? html`<button class="icon-btn header__back" type="button" data-back="/carrinho" aria-label="Voltar">${icon('arrow-left')}</button>`
        : ''}
      <a class="header__logo" href="#/" aria-label="BOLAB — página inicial">
        <img src="assets/logo.webp" alt="BOLAB — Onde seu bolo ganha forma" width="154" height="60" />
      </a>

      ${focus
        ? html`<div class="header__secure">${icon('lock')} Ambiente seguro</div>`
        : html`
            <nav class="header__nav" aria-label="Seções">
              ${NAV.map(
                (n) => html`<a href="${n.href}" class="${n.match(path) ? 'is-active' : ''} ${n.highlight ? 'is-highlight' : ''}">
                  ${n.highlight ? icon('sparkles') : ''}${n.label}
                </a>`,
              )}
            </nav>

            <form class="header__search" role="search" data-search ${path === '/cardapio' ? raw('hidden') : ''}>
              ${icon('search')}
              <input type="search" name="q" placeholder="Buscar bolos, sabores…" aria-label="Buscar no cardápio" value="${path === '/cardapio' ? query.q || '' : ''}" autocomplete="off" />
            </form>

            <div class="header__actions">
              <a class="icon-btn only-mobile" href="#/cardapio?foco=busca" aria-label="Buscar">${icon('search')}</a>
              <a class="icon-btn only-desktop" href="#/favoritos" aria-label="Favoritos">${icon('heart')}${badge(favs.count())}</a>
              <a class="header__account only-desktop" href="${user ? '#/conta' : '#/entrar'}">
                ${user ? html`<span class="avatar avatar--sm">${initials(user.name)}</span>` : icon('user')}
                <span>${user ? `Olá, ${user.name.split(' ')[0]}` : 'Entrar'}</span>
              </a>
              <a class="icon-btn header__cart" href="#/carrinho" aria-label="Carrinho, ${cart.count()} itens">${icon('bag')}${badge(cart.count())}</a>
            </div>
          `}
    </div>
  `);
}

function renderTabbar() {
  const { path } = currentRoute();
  const is = (fn) => (fn(path) ? 'is-active' : '');
  const orders = (p) => p.startsWith('/pedido');
  const account = (p) => p.startsWith('/conta') || p === '/entrar' || p === '/favoritos' || p === '/atendimento';
  document.getElementById('tabbar').innerHTML = String(html`
    <a href="#/" class="${is((p) => p === '/')}">${icon('home')}<span>Início</span></a>
    <a href="#/cardapio" class="${is((p) => p.startsWith('/cardapio') || p.startsWith('/produto'))}">${icon('cake')}<span>Cardápio</span></a>
    <a href="#/monte-seu-bolo" class="tabbar__fab" aria-label="Monte seu bolo em 3D">
      <span class="tabbar__fab-btn">${icon('sparkles')}</span>
      <span>Criar</span>
    </a>
    <a href="#/pedidos" class="${is(orders)}">${icon('package')}<span>Pedidos</span></a>
    <a href="${auth.isLogged() ? '#/conta' : '#/entrar'}" class="${is(account)}">${icon('user')}<span>${auth.isLogged() ? 'Conta' : 'Entrar'}</span></a>
  `);
}

function renderFooter() {
  const cats = CATEGORIES.filter((c) => c.id !== 'todos');
  document.getElementById('footer').innerHTML = String(html`
    <div class="container">
      <div class="footer__grid">
        <div class="footer__brand">
          <img src="assets/logo-light.webp" alt="BOLAB" width="180" height="70" loading="lazy" />
          <p>Bolos artesanais feitos sob encomenda em ${SITE.region}. Cada bolo é preparado à mão, só para você, no dia da sua entrega.</p>
          <div class="footer__social">
            <a class="icon-btn" href="https://instagram.com/${SITE.instagram}" target="_blank" rel="noopener" aria-label="Instagram">${icon('instagram')}</a>
            <a class="icon-btn" href="https://wa.me/${SITE.whatsapp}" target="_blank" rel="noopener" aria-label="WhatsApp">${icon('whatsapp')}</a>
            <a class="icon-btn" href="mailto:${SITE.email}" aria-label="E-mail">${icon('mail')}</a>
          </div>
        </div>
        <div>
          <h3>Cardápio</h3>
          <ul>
            ${cats.map((c) => html`<li><a href="#/cardapio?cat=${c.id}">${c.label}</a></li>`)}
          </ul>
        </div>
        <div>
          <h3>Sua conta</h3>
          <ul>
            <li><a href="#/monte-seu-bolo">Monte seu bolo em 3D</a></li>
            <li><a href="#/pedidos">Meus pedidos</a></li>
            <li><a href="#/favoritos">Favoritos</a></li>
            <li><a href="#/conta/cupons">Cupons</a></li>
            <li><a href="#/conta/indicar">Indique e ganhe</a></li>
          </ul>
        </div>
        <div>
          <h3>Atendimento</h3>
          <ul>
            <li><a href="#/atendimento">Fale com a gente</a></li>
            <li><a href="https://wa.me/${SITE.whatsapp}" target="_blank" rel="noopener">WhatsApp ${SITE.whatsappLabel}</a></li>
            <li>${SITE.hours}</li>
            <li>${SITE.pickup.address}</li>
          </ul>
        </div>
      </div>
      <div class="footer__bottom">
        <span>© ${new Date().getFullYear()} BOLAB Confeitaria Artesanal</span>
        <span class="footer__pay">${icon('pix')} Pix ${icon('credit-card')} Cartão em até ${SITE.card.maxInstallments}x ${icon('shield-check')} Compra segura</span>
        ${SITE.demo ? html`<span class="footer__demo">Site em modo demonstração — pagamentos simulados</span>` : ''}
      </div>
    </div>
  `);
}

function refresh() {
  renderHeader();
  renderTabbar();
}

export function startShell() {
  renderAnnounce();
  renderFooter();
  refresh();

  onRoute(refresh);
  store.on('cart', refresh);
  store.on('auth', refresh);
  store.on('favs', refresh);

  const header = document.getElementById('header');
  header.addEventListener('submit', (ev) => {
    const form = ev.target.closest('[data-search]');
    if (!form) return;
    ev.preventDefault();
    const q = form.q.value.trim();
    navigate('/cardapio', { query: { q } });
    form.q.blur();
  });

  on(document.body, 'click', '[data-copy-coupon]', async (_ev, el) => {
    const code = el.dataset.copyCoupon;
    const ok = await copyText(code);
    toast(ok ? `Cupom ${code} copiado! Use no carrinho.` : `Seu cupom: ${code}`, { type: 'success' });
  });

  on(document.body, 'click', '[data-back]', (_ev, el) => goBack(el.dataset.back || '/'));

  // Sombra no cabeçalho ao rolar.
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}
