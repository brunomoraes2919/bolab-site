// BOLAB — moldura fixa da loja: cabeçalho (com o contexto de entrega), faixa de seções
// (computador), rodapé, barra "Ver carrinho" e barra inferior (celular).
import { html, icon, initials, on, copyText, toast, raw, money, plural, openDialog } from './ui.js';
import { auth, cart, favs, store, prefs, addresses, schedule, orders } from './store.js';
import { navigate, onRoute, currentRoute, goBack } from './router.js';
import { SITE, CATEGORIES } from './data/site.js';
import { dayLabel } from './components.js';

const CATS = CATEGORIES.filter((c) => c.id !== 'todos');

/** Faixa de seções do computador. `match` recebe (caminho, query). */
const NAV = [
  { href: '#/', label: 'Início', match: (p) => p === '/' },
  { href: '#/cardapio', label: 'Cardápio', match: (p, q) => (p === '/cardapio' && !q.cat) || p.startsWith('/produto') },
  ...CATS.map((c) => ({ href: `#/cardapio?cat=${c.id}`, label: c.label, match: (p, q) => p === '/cardapio' && q.cat === c.id })),
  { href: '#/monte-seu-bolo', label: 'Monte o seu em 3D', match: (p) => p.startsWith('/monte-seu-bolo'), highlight: true },
  { href: '#/pedidos', label: 'Meus pedidos', match: (p) => p.startsWith('/pedido') },
];

function badge(n) {
  return n > 0 ? html`<span class="count-badge" aria-hidden="true">${n > 9 ? '9+' : n}</span>` : '';
}

/**
 * Valor do botão do carrinho (cabeçalho e barra "Ver carrinho"): os itens já com o cupom aplicado,
 * sem a taxa de entrega. É o mesmo número que a tela do carrinho mostra antes de somar a entrega;
 * com entrega grátis ou retirada, é exatamente o total de lá.
 */
function cartValue() {
  const t = cart.totals();
  return Math.round((t.subtotal - t.couponDiscount) * 100) / 100;
}

/** Só mexe na página quando o conteúdo mudou de fato (cabeçalho e barras são refeitos a cada troca de tela e a cada mudança no carrinho). */
const painted = {};
function setHtml(id, markup) {
  const next = String(markup);
  if (painted[id] === next) return;
  painted[id] = next;
  document.getElementById(id).innerHTML = next;
}

/* ───────── Como a pessoa quer receber ─────────
   A escolha fica em prefs: 'receiveMode' ('delivery' | 'pickup') e 'receiveAddress' (id do
   endereço salvo escolhido). Quem precisar reagir à troca ouve o evento 'bolab:receive' na window. */

/**
 * Contexto de entrega atual.
 * → { mode: 'delivery' | 'pickup', label: 'Entregar em' | 'Retirar no ateliê', place: 'Rua X, 120', address | null, earliest: Date }
 */
export function receiveContext() {
  const mode = prefs.get('receiveMode', 'delivery') === 'pickup' ? 'pickup' : 'delivery';
  const earliest = schedule.earliest(24);
  if (mode === 'pickup') {
    // No cabeçalho cabe só a rua e o número ("Rua das Orquídeas, 120"); o bairro aparece na folha.
    return { mode, label: 'Retirar no ateliê', place: SITE.pickup.address.split(' — ')[0], address: null, earliest };
  }
  const address = addresses.get(prefs.get('receiveAddress')) || addresses.default();
  const place = address ? [address.street, address.number].filter(Boolean).join(', ') : SITE.region;
  return { mode, label: 'Entregar em', place, address, earliest };
}

function receivePanel(mode, addressId) {
  const first = dayLabel(schedule.earliest(24));
  const { fee, freeAbove } = SITE.shipping;
  if (mode === 'pickup') {
    return html`
      <ul class="recv__facts">
        <li>
          ${icon('store')}
          <div><strong>${SITE.pickup.name}</strong><span>${SITE.pickup.address}</span></div>
        </li>
        <li>
          ${icon('calendar')}
          <div><strong>Retire a partir de ${first}</strong><span>${SITE.hours}</span></div>
        </li>
        <li>
          ${icon('check-circle')}
          <div><strong class="recv__free">Retirada grátis</strong><span>${SITE.pickup.note}</span></div>
        </li>
      </ul>
    `;
  }
  const list = addresses.list();
  return html`
    <ul class="recv__facts">
      <li>
        ${icon('map-pin')}
        <div><strong>${SITE.region}</strong><span>É onde entregamos. Dia e horário você escolhe ao fechar o pedido.</span></div>
      </li>
      <li>
        ${icon('calendar')}
        <div><strong>Receba a partir de ${first}</strong><span>Feito sob encomenda: a maioria dos bolos fica pronta em 24 h.</span></div>
      </li>
      <li>
        ${icon('truck')}
        <div><strong>Entrega ${money(fee)}</strong><span class="recv__free">Grátis acima de ${money(freeAbove).replace(',00', '')}</span></div>
      </li>
    </ul>
    ${list.length
      ? html`
          <h3 class="recv__title" id="recv-addr-t">Seus endereços</h3>
          <div class="recv__addresses" role="radiogroup" aria-labelledby="recv-addr-t">
            ${list.map(
              (a) => html`
                <label class="option">
                  <input type="radio" name="recv-address" value="${a.id}" ${a.id === addressId ? raw('checked') : ''} />
                  <span class="option__icon">${icon('map-pin')}</span>
                  <span class="option__body">
                    <span class="option__title">${a.label || 'Endereço'}</span>
                    <span class="option__desc">${addresses.format(a)}</span>
                  </span>
                  <span class="option__check">${icon('check')}</span>
                </label>
              `,
            )}
          </div>
        `
      : ''}
    <a class="recv__add" href="#/conta/enderecos">
      ${icon('plus')}
      <span>${list.length ? 'Adicionar outro endereço' : auth.isLogged() ? 'Adicionar endereço' : 'Entrar e salvar meu endereço'}</span>
      ${icon('chevron-right')}
    </a>
  `;
}

/** Abre a folha "Como você quer receber?". */
export function openReceiveSheet() {
  const ctx = receiveContext();
  let mode = ctx.mode;
  let addressId = ctx.address?.id || null;
  const tab = (id, label, ic) =>
    html`<button type="button" role="radio" aria-checked="${mode === id ? 'true' : 'false'}" data-recv-mode="${id}">${icon(ic)} ${label}</button>`;
  const dlg = openDialog({
    title: 'Como você quer receber?',
    body: html`
      <div class="tabs recv__tabs" role="radiogroup" aria-label="Forma de receber">${tab('delivery', 'Entrega', 'truck')} ${tab('pickup', 'Retirada', 'store')}</div>
      <div data-recv-panel>${receivePanel(mode, addressId)}</div>
    `,
    footer: html`<button class="btn btn--block" type="button" data-recv-confirm>Confirmar</button>`,
  });
  const panel = dlg.el.querySelector('[data-recv-panel]');
  dlg.el.addEventListener('click', (ev) => {
    const tabBtn = ev.target.closest('[data-recv-mode]');
    if (tabBtn) {
      mode = tabBtn.dataset.recvMode;
      dlg.el.querySelectorAll('[data-recv-mode]').forEach((b) => b.setAttribute('aria-checked', String(b === tabBtn)));
      panel.innerHTML = String(receivePanel(mode, addressId));
      return;
    }
    if (ev.target.closest('[data-recv-confirm]')) {
      prefs.set('receiveMode', mode);
      if (mode === 'delivery' && addressId) prefs.set('receiveAddress', addressId);
      dlg.close();
      refresh();
      window.dispatchEvent(new CustomEvent('bolab:receive', { detail: receiveContext() }));
    }
  });
  dlg.el.addEventListener('change', (ev) => {
    if (ev.target.name === 'recv-address') addressId = ev.target.value;
  });
  return dlg;
}

/* ───────── Cabeçalho ───────── */
function whereButton() {
  const ctx = receiveContext();
  return html`
    <button class="header__where" type="button" data-open-receive aria-haspopup="dialog" aria-label="${ctx.label} ${ctx.place}. Trocar a forma de receber">
      <span class="header__where-icon">${icon(ctx.mode === 'pickup' ? 'store' : 'map-pin')}</span>
      <span class="header__where-text">
        <span class="header__where-label">${ctx.label}</span>
        <strong class="header__where-place">${ctx.place}</strong>
      </span>
      ${icon('chevron-down', { cls: 'header__where-chev' })}
    </button>
  `;
}

function renderHeader() {
  const { path, query } = currentRoute();
  const user = auth.user();
  const focus = document.body.dataset.layout === 'focus';
  const count = cart.count();
  const total = cartValue();
  // Na própria tela do carrinho o botão não repete valor: quem fala de valores ali é o resumo.
  const inCart = path === '/carrinho';
  setHtml('header', html`
    <div class="container header__inner">
      ${focus
        ? html`<button class="icon-btn header__back" type="button" data-back="/carrinho" aria-label="Voltar">${icon('arrow-left')}</button>`
        : ''}
      <a class="header__logo ${focus ? 'header__logo--full' : ''}" href="#/" aria-label="BOLAB — página inicial">
        ${focus
          ? html`<img src="assets/logo.webp" alt="BOLAB" width="103" height="40" />`
          : html`<picture>
              <source media="(min-width: 900px)" srcset="assets/logo.webp" width="113" height="44" />
              <img src="assets/logo-mark.webp" alt="BOLAB" width="22" height="34" />
            </picture>`}
      </a>

      ${focus
        ? html`<div class="header__secure">${icon('lock')} Ambiente seguro</div>`
        : html`
            ${whereButton()}

            <form class="header__search search-field" role="search" data-search>
              ${icon('search')}
              <input type="search" name="q" placeholder="Buscar bolo, sabor ou ocasião" aria-label="Buscar no cardápio" autocomplete="off" enterkeyhint="search" maxlength="60" />
            </form>

            <div class="header__actions">
              <a class="icon-btn header__search-link ${path === '/' ? 'is-home' : ''}" href="#/cardapio?foco=busca" aria-label="Buscar no cardápio">${icon('search')}</a>
              <a class="header__account only-desktop" href="${user ? '#/conta' : '#/entrar'}" aria-label="${user ? `Minha conta, ${user.name.split(' ')[0]}` : 'Entrar ou criar conta'}">
                ${user ? html`<span class="avatar avatar--sm">${initials(user.name)}</span>` : icon('user')}
                <span>${user ? `Olá, ${user.name.split(' ')[0]}` : 'Entrar'}</span>
              </a>
              <a class="icon-btn only-desktop" href="#/favoritos" aria-label="Favoritos">${icon('heart')}${badge(favs.count())}</a>
              <a class="header__cart ${count ? 'has-items' : ''}" href="#/carrinho" ${inCart ? raw('aria-current="page"') : ''} aria-label="Carrinho, ${plural(count, 'item', 'itens')}${count && !inCart ? `, ${money(total)}` : ''}">
                <span class="header__cart-icon">${icon('bag')}${badge(count)}</span>
                <span class="header__cart-total">${count && !inCart ? money(total) : 'Carrinho'}</span>
              </a>
            </div>
          `}
    </div>
  `);

  // O texto da busca fica fora do HTML comparado acima: assim o cabeçalho não é refeito a cada
  // letra e quem está digitando não perde o cursor. No computador este campo é a busca do
  // cardápio (js/views/catalog.js ouve a digitação); fora do cardápio ele começa vazio.
  const field = document.querySelector('#header [data-search] input');
  if (field && document.activeElement !== field) {
    const want = path === '/cardapio' ? String(query.q || '') : '';
    if (field.value !== want) field.value = want;
  }
}

function renderSubnav() {
  const { path, query } = currentRoute();
  // O cupom de primeiro pedido só aparece para quem ainda pode usar; quem já pediu vê a entrega grátis.
  const firstOrder = !(auth.isLogged() && orders.list().some((o) => !o.canceled));
  setHtml('subnav', html`
    <div class="container subnav__inner">
      <div class="header__nav">
        ${NAV.map(
          (n) => html`<a href="${n.href}" class="${n.match(path, query) ? 'is-active' : ''} ${n.highlight ? 'is-highlight' : ''}" ${n.match(path, query) ? raw('aria-current="page"') : ''}>
            ${n.highlight ? icon('cube') : ''}${n.label}
          </a>`,
        )}
      </div>
      <div class="subnav__info">
        ${firstOrder
          ? html`<button type="button" data-copy-coupon="BOLAB10" aria-label="Copiar o cupom BOLAB10: 10% OFF no primeiro pedido">${icon('ticket')} 10% OFF no 1º pedido: <strong>BOLAB10</strong></button>`
          : html`<span class="subnav__free">${icon('truck')} Entrega grátis acima de ${money(SITE.shipping.freeAbove).replace(',00', '')}</span>`}
      </div>
    </div>
  `);
}

/* ───────── Barra inferior (celular) ───────── */
function renderTabbar() {
  const { path } = currentRoute();
  const is = (fn) => (fn(path) ? 'is-active' : '');
  const cur = (fn) => (fn(path) ? raw('aria-current="page"') : '');
  const home = (p) => p === '/';
  const menu = (p) => p.startsWith('/cardapio') || p.startsWith('/produto');
  const orders = (p) => p.startsWith('/pedido');
  const account = (p) => p.startsWith('/conta') || p === '/entrar' || p === '/favoritos' || p === '/atendimento';
  setHtml('tabbar', html`
    <a href="#/" class="${is(home)}" ${cur(home)}>${icon('home')}<span>Início</span></a>
    <a href="#/cardapio" class="${is(menu)}" ${cur(menu)}>${icon('cake')}<span>Cardápio</span></a>
    <a href="#/monte-seu-bolo" class="tabbar__fab" aria-label="Monte seu bolo em 3D">
      <span class="tabbar__fab-btn">${icon('cube')}</span>
      <span>Montar</span>
    </a>
    <a href="#/pedidos" class="${is(orders)}" ${cur(orders)}>${icon('receipt')}<span>Pedidos</span></a>
    <a href="${auth.isLogged() ? '#/conta' : '#/entrar'}" class="${is(account)}" ${cur(account)}>${icon('user')}<span>${auth.isLogged() ? 'Conta' : 'Entrar'}</span></a>
  `);
}

/* ───────── Barra "Ver carrinho" (celular) ─────────
   Aparece acima da barra inferior sempre que há itens no carrinho. Some nas telas que já têm
   a sua barra de ação (produto, carrinho, checkout, atendimento), no personalizador e no login.
   Quando está à vista, <body> ganha a classe .has-cartbar e a variável --cartbar-h (css/shell.css)
   passa a valer a altura dela, para as outras telas reservarem o espaço. */
const NO_CARTBAR = /^\/(carrinho|checkout|produto\/|atendimento|monte-seu-bolo|entrar)/;

function renderCartbar() {
  const { path } = currentRoute();
  const layout = document.body.dataset.layout;
  const count = cart.count();
  const show = count > 0 && layout !== 'focus' && layout !== 'immersive' && !NO_CARTBAR.test(path);
  document.body.classList.toggle('has-cartbar', show);
  if (!show) return setHtml('cartbar', '');
  const total = cartValue();
  setHtml('cartbar', html`
    <a class="btn btn--price cartbar__btn" href="#/carrinho" aria-label="Ver carrinho: ${plural(count, 'item', 'itens')}, ${money(total)}">
      <span class="btn__label">${icon('bag')}<span>Ver carrinho · ${plural(count, 'item', 'itens')}</span></span>
      <span class="btn__price">${money(total)}</span>
    </a>
  `);
}

/* ───────── Rodapé ─────────
   Celular: bloco curto de aplicativo (contato, horário, redes, aviso de demonstração).
   Computador: rodapé completo em colunas. */
function renderFooter() {
  const social = html`
    <a class="icon-btn" href="https://instagram.com/${SITE.instagram}" target="_blank" rel="noopener" aria-label="Instagram">${icon('instagram')}</a>
    <a class="icon-btn" href="https://wa.me/${SITE.whatsapp}" target="_blank" rel="noopener" aria-label="WhatsApp">${icon('whatsapp')}</a>
    <a class="icon-btn" href="mailto:${SITE.email}" aria-label="E-mail">${icon('mail')}</a>
  `;
  const year = new Date().getFullYear();
  document.getElementById('footer').innerHTML = String(html`
    <div class="container footer__app only-mobile">
      <div class="card footer__contact">
        <a class="row" href="https://wa.me/${SITE.whatsapp}" target="_blank" rel="noopener">
          <span class="row__icon">${icon('whatsapp')}</span>
          <span class="row__body"><span class="row__title">WhatsApp</span><span class="row__desc">${SITE.whatsappLabel}</span></span>
          ${icon('chevron-right', { cls: 'row__chev' })}
        </a>
        <a class="row" href="#/atendimento">
          <span class="row__icon">${icon('message')}</span>
          <span class="row__body"><span class="row__title">Atendimento</span><span class="row__desc">${SITE.hours}</span></span>
          ${icon('chevron-right', { cls: 'row__chev' })}
        </a>
        <div class="row">
          <span class="row__icon">${icon('store')}</span>
          <span class="row__body"><span class="row__title">${SITE.pickup.name}</span><span class="row__desc">${SITE.pickup.address}, ${SITE.city}</span></span>
        </div>
      </div>
      <div class="footer__social">${social}</div>
      <p class="footer__pay">${icon('pix')} Pix · ${icon('credit-card')} Cartão em até ${SITE.card.maxInstallments}x · ${icon('shield-check')} Compra segura</p>
      ${SITE.demo ? html`<p class="footer__demo">Loja em modo demonstração: pagamentos simulados.</p>` : ''}
      <p class="footer__copy">© ${year} BOLAB Confeitaria Artesanal</p>
    </div>

    <div class="container footer__site only-desktop">
      <div class="footer__grid">
        <div class="footer__brand">
          <img src="assets/logo-light.webp" alt="BOLAB" width="154" height="60" loading="lazy" />
          <p>Bolos artesanais sob encomenda em ${SITE.region}. Entrega com dia e horário marcados ou retirada no ateliê.</p>
          <div class="footer__social">${social}</div>
        </div>
        <div>
          <h3>Cardápio</h3>
          <ul>
            ${CATS.map((c) => html`<li><a href="#/cardapio?cat=${c.id}">${c.label}</a></li>`)}
            <li><a href="#/monte-seu-bolo">Monte o seu em 3D</a></li>
          </ul>
        </div>
        <div>
          <h3>Sua conta</h3>
          <ul>
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
        <span>© ${year} BOLAB Confeitaria Artesanal</span>
        <span class="footer__pay">${icon('pix')} Pix ${icon('credit-card')} Cartão em até ${SITE.card.maxInstallments}x ${icon('shield-check')} Compra segura</span>
        ${SITE.demo ? html`<span class="footer__demo">Loja em modo demonstração: pagamentos simulados</span>` : ''}
      </div>
    </div>
  `);
}

function refresh() {
  renderHeader();
  renderSubnav();
  renderTabbar();
  renderCartbar();
}

export function startShell() {
  refresh();

  // O rodapé só entra junto com a primeira tela. Antes disso ele aparecia por um instante
  // no meio da tela de abertura e era empurrado para baixo quando o conteúdo chegava.
  let footerReady = false;
  onRoute(() => {
    if (!footerReady) {
      footerReady = true;
      renderFooter();
    }
    refresh();
  });
  store.on('cart', refresh);
  store.on('auth', refresh);
  store.on('favs', refresh);
  store.on('addresses', refresh);
  store.on('orders', refresh);

  // Busca: o campo do cabeçalho (computador) e o do início (celular) levam ao cardápio.
  on(document.body, 'submit', '[data-search]', (ev, form) => {
    ev.preventDefault();
    const q = form.q.value.trim();
    form.q.blur();
    if (q) navigate('/cardapio', { query: { q } });
    else navigate('/cardapio', { query: { foco: 'busca' } });
  });

  on(document.body, 'click', '[data-copy-coupon]', async (_ev, el) => {
    const code = el.dataset.copyCoupon;
    const ok = await copyText(code);
    toast(ok ? `Cupom ${code} copiado. Use no carrinho.` : `Seu cupom: ${code}`, { type: 'success' });
  });

  on(document.body, 'click', '[data-back]', (_ev, el) => goBack(el.dataset.back || '/'));

  on(document.body, 'click', '[data-open-receive]', () => openReceiveSheet());

  // Fio sob o cabeçalho ao rolar. (A página abre no topo, então não é preciso conferir agora:
  // ler a posição da rolagem neste ponto obrigava o navegador a calcular o layout antes da hora.)
  // (.is-deep: a pessoa já passou do campo de busca do início; a lupa do cabeçalho aparece.)
  const header = document.getElementById('header');
  const onScroll = () => {
    const y = window.scrollY;
    header.classList.toggle('is-scrolled', y > 8);
    header.classList.toggle('is-deep', y > 96);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
}
