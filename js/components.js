// BOLAB — blocos de interface usados por várias telas. Todos devolvem html`` (seguro).
import { html, icon, money, raw, toDate } from './ui.js';
import { favs } from './store.js';
import { photoUrl, photoAlt, photoFocus } from './data/photos.js';
import { sizesOf } from './data/products.js';

/**
 * Foto responsiva com fallback elegante se não carregar.
 *   photo('p1', { w: 480, alt, eager: false, cls: '', sizes: '(min-width: 900px) 280px, 46vw' })
 * `key` é uma chave de js/data/photos.js. Para bolos personalizados use customThumb().
 * `sizes` diz ao navegador a largura que a foto ocupa na tela; com isso ele baixa o menor
 * arquivo que serve (w, 1,5×w ou 2×w) em vez de sempre o maior. `priority` é só para a foto
 * principal da tela (a primeira coisa que a pessoa vê).
 */
export function photo(key, { w = 480, alt, eager = false, cls = '', sizes, priority = false } = {}) {
  const src = photoUrl(key, w);
  if (!src) return mediaFallback(cls);
  return html`<img
    class="${cls}"
    src="${src}"
    srcset="${photoSrcset(key, w)}"
    sizes="${sizes || `${w}px`}"
    alt="${alt ?? photoAlt(key)}"
    style="object-position:${photoFocus(key)}"
    loading="${eager ? 'eager' : 'lazy'}"
    ${priority ? raw('fetchpriority="high"') : ''}
    decoding="async"
    data-fallback
  />`;
}

/** Larguras oferecidas ao navegador para uma foto de largura-base w. */
export function photoSrcset(key, w) {
  return [w, Math.round(w * 1.5), w * 2].map((x) => `${photoUrl(key, x)} ${x}w`).join(', ');
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

/* ───────── Textos de entrega ───────── */
const WEEKDAY = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });

/**
 * Data curta para chips e botões: "hoje", "amanhã" ou "seg, 12/10".
 *   dayLabel(schedule.earliest(24))
 */
export function dayLabel(value) {
  const d = toDate(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - today) / 864e5);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'amanhã';
  const wd = WEEKDAY.format(d).replace('.', '');
  return `${wd}, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Janela de horário curta, igual em todas as telas: "14:00 – 16:00" → "14h–16h" ("09:30 – 11:00" → "9h30–11h").
 *   slotLabel(order.delivery.slot)
 * Em frase: slotLabel(x).replace('–', ' e ') → "Entre 14h e 16h".
 */
export function slotLabel(label) {
  return String(label || '')
    .split('–')
    .map((part) => {
      const [h, m] = part.trim().split(':');
      return h ? `${Number(h)}h${m && m !== '00' ? m : ''}` : '';
    })
    .filter(Boolean)
    .join('–');
}

/** "Pronto em 24 h" (ou '' quando o item não tem preparo, como as velinhas). */
export function prepLabel(hours) {
  const h = Number(hours) || 0;
  return h > 0 ? `Pronto em ${h} h` : '';
}

/**
 * Linha de metadados do produto: "★ 4,9 (128) · Pronto em 24 h".
 *   productMeta(p)                 nota + prazo
 *   productMeta(p, { count: false })   sem o número de avaliações (espaço apertado)
 */
export function productMeta(p, { count = true, prep = true, cls = '' } = {}) {
  const ready = prep ? prepLabel(p.prepHours) : '';
  return html`<p class="meta ${cls}">
    ${rating(p.rating, count ? p.reviews : undefined)}${ready ? html`<span class="meta__item">${ready}</span>` : ''}
  </p>`;
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

/* Selos que merecem cor (os demais ficam brancos, discretos). */
const BADGE_TONE = { 'Mais pedido': 'badge--solid', 'Top vendas': 'badge--solid', Novo: 'badge--green' };
/* Selos que só repetem a categoria não entram no card: lá o selo é para o que ajuda a escolher. */
const CATEGORY_BADGES = new Set(['Premium', 'Clássico', 'Infantil', 'Acessório']);

function cardBadge(p) {
  if (!p.badge || CATEGORY_BADGES.has(p.badge)) return '';
  return html`<span class="badge pcard__badge ${BADGE_TONE[p.badge] || ''}">${p.badge}</span>`;
}

function priceBlock(p, cls) {
  return html`<div class="price ${cls}">${sizesOf(p).length ? html`<small>a partir de</small>` : ''}${money(p.price)}</div>`;
}

function addButton(p, cls = '') {
  return html`<button class="add-btn ${cls}" type="button" data-add-product="${p.id}" aria-label="Adicionar ${p.name} ao carrinho">${icon('plus')}</button>`;
}

/**
 * Card de produto para grades e carrosséis: foto, selo, nome, "★ 4,9 (128) · Pronto em 24 h",
 * preço ("a partir de" quando há tamanhos) e o "+" redondo.
 * O "+" adiciona direto (data-add-product, tratado em app.js; bolo abre a folha de tamanho).
 *   productCard(p)                      grade (2 colunas no celular)
 *   productCard(p, { compact: true })   carrossel (.rail): foto mais baixa, sem descrição
 */
export function productCard(p, { eager = false, compact = false, sizes } = {}) {
  return html`
    <article class="pcard ${compact ? 'pcard--compact' : ''}">
      <div class="pcard__media">
        ${photo(p.photo, {
          w: compact ? 300 : 420,
          alt: p.name,
          eager,
          sizes: sizes || (compact ? '(min-width: 900px) 224px, 152px' : '(min-width: 1100px) 280px, (min-width: 640px) 31vw, 46vw'),
        })}
        ${cardBadge(p)}
        ${favButton(p.id, { cls: 'pcard__fav' })}
      </div>
      <div class="pcard__body">
        <h3 class="pcard__name"><a href="#/produto/${p.id}">${p.name}</a></h3>
        ${productMeta(p, { cls: 'pcard__meta' })}
        <p class="pcard__desc">${p.desc}</p>
        <div class="pcard__foot">${priceBlock(p, 'pcard__price')} ${addButton(p, 'pcard__add')}</div>
      </div>
    </article>
  `;
}

/**
 * Linha de cardápio (lista): nome, descrição em duas linhas e preço à esquerda; foto à direita
 * com o "+" no canto. Coloque várias dentro de <div class="menu-list">…</div>.
 *   html`<div class="menu-list">${list.map((p) => productRow(p))}</div>`
 */
export function productRow(p, { eager = false, meta = true } = {}) {
  return html`
    <article class="prow">
      <div class="prow__body">
        <h3 class="prow__name"><a href="#/produto/${p.id}">${p.name}</a></h3>
        <p class="prow__desc">${p.desc}</p>
        ${meta ? productMeta(p, { cls: 'prow__meta' }) : ''} ${priceBlock(p, 'prow__price')}
      </div>
      <div class="prow__media">${photo(p.photo, { w: 220, alt: '', eager, sizes: '(min-width: 900px) 120px, 104px' })} ${addButton(p, 'prow__add')}</div>
    </article>
  `;
}

/**
 * Título de seção com "Ver todos" à direita. Título curto e funcional ("Mais pedidos").
 *   sectionHead('Mais pedidos', { href: '#/cardapio' })
 *   sectionHead('Para a festa', { href: '#/cardapio?cat=acess', label: 'Ver todos', sub: 'Velas, toppers e kits', id: 'festa-t' })
 */
export function sectionHead(title, { href = '', label = 'Ver todos', sub = '', id = '', level = 2 } = {}) {
  const tag = level === 3 ? 'h3' : 'h2';
  return html`
    <div class="section-head">
      <div>
        ${raw(`<${tag} class="section-title"${id ? ` id="${id.replace(/[^\w-]/g, '')}"` : ''}>`)}${title}${raw(`</${tag}>`)}
        ${sub ? html`<p class="section-sub">${sub}</p>` : ''}
      </div>
      ${href ? html`<a class="section-link" href="${href}" aria-label="${label}: ${title}">${label}${icon('chevron-right')}</a>` : ''}
    </div>
  `;
}

/**
 * Fileira de chips que desliza no celular.
 *   chipRow([{ label: 'Todos', href: '#/cardapio', active: true }, { label: 'Premium', href: '#/cardapio?cat=premium' }], { label: 'Categorias' })
 * Cada item: { label, href?, icon?, active?, info?, tone?: 'positive', attrs?: 'data-x="1"' (texto fixo, nunca dado do usuário) }.
 * Com href vira link; com info: true vira chip de informação (não clicável); senão, botão.
 */
export function chipRow(items, { label = '', cls = '' } = {}) {
  const chip = (it) => {
    const classes = `chip ${it.info ? 'chip--info' : ''} ${it.tone ? `chip--${it.tone}` : ''} ${it.active ? 'is-active' : ''}`;
    const inner = html`${it.icon ? icon(it.icon) : ''}<span>${it.label}</span>`;
    if (it.info) return html`<li class="${classes}">${inner}</li>`;
    if (it.href) return html`<li><a class="${classes}" href="${it.href}" ${it.active ? raw('aria-current="true"') : ''}>${inner}</a></li>`;
    return html`<li><button class="${classes}" type="button" aria-pressed="${it.active ? 'true' : 'false'}" ${raw(it.attrs || '')}>${inner}</button></li>`;
  };
  return html`<ul class="chips ${cls}" ${label ? html`aria-label="${label}"` : ''}>${items.map(chip)}</ul>`;
}

/**
 * Banner de promoção (carrossel do início, topo do cardápio, carrinho).
 *   promoBanner({ tone: 'stage', tag: 'Exclusivo', title: 'Monte o seu em 3D', text: 'A partir de R$ 69', cta: 'Montar agora',
 *                 href: '#/monte-seu-bolo', img: 'assets/img/cz-morango.webp', cutout: true })
 *   promoBanner({ tone: 'action', title: '10% OFF no 1º pedido', text: 'Toque para copiar o cupom', code: 'BOLAB10' })
 * tone: '' (rosa-claro) | 'stage' (cacau escuro) | 'action' (framboesa) | 'green' | 'neutral'.
 * Com `code` o banner vira botão que copia o cupom (data-copy-coupon). `photoKey` usa uma foto de js/data/photos.js.
 */
export function promoBanner({ tone = '', tag = '', title, text = '', cta = '', href = '', code = '', img = '', photoKey = '', cutout = false, iconName = '', eager = false, cls = '' }) {
  const media = img
    ? html`<span class="promo__media ${cutout ? 'promo__media--cutout' : ''}"><img src="${img}" alt="" width="760" height="760" loading="${eager ? 'eager' : 'lazy'}" decoding="async" ${eager ? raw('fetchpriority="high"') : ''} /></span>`
    : photoKey
      ? html`<span class="promo__media">${photo(photoKey, { w: 240, alt: '', sizes: '116px', eager })}</span>`
      : iconName
        ? html`<span class="promo__icon">${icon(iconName)}</span>`
        : '';
  const body = html`
    <span class="promo__body">
      ${tag ? html`<span class="promo__tag">${tag}</span>` : ''}
      <strong class="promo__title">${title}</strong>
      ${text ? html`<span class="promo__text">${text}</span>` : ''}
      ${code ? html`<span class="promo__code">${code} ${icon('copy')}</span>` : cta ? html`<span class="promo__cta">${cta}${icon('chevron-right')}</span>` : ''}
    </span>
    ${media}
  `;
  const classes = `promo ${tone ? `promo--${tone}` : ''} ${cls}`;
  if (code) return html`<button class="${classes}" type="button" data-copy-coupon="${code}" aria-label="${title}. Copiar o cupom ${code}">${body}</button>`;
  return html`<a class="${classes}" href="${href || '#/cardapio'}">${body}</a>`;
}

/**
 * Botão com preço: rótulo à esquerda, valor à direita. É o padrão de toda ação principal de compra.
 *   priceButton('Adicionar', 149.9, { attrs: 'data-sheet-add' })            → [ Adicionar        R$ 149,90 ]
 *   priceButton('Ver carrinho', total, { href: '#/carrinho', count: 2 })    → [ (2) Ver carrinho  R$ 289,80 ]
 * opções: href (vira link), count (bolinha com a quantidade), cls ('btn--lg', 'btn--block' já vem),
 * attrs (texto fixo de atributos, nunca dado do usuário), id, disabled, iconName.
 * Para trocar o valor depois: el.querySelector('.btn__price').textContent = money(novo).
 */
export function priceButton(label, price, { href = '', count = null, cls = '', attrs = '', id = '', disabled = false, iconName = '', type = 'button' } = {}) {
  const inner = html`
    <span class="btn__label">${count != null ? html`<span class="btn__count">${count}</span>` : iconName ? icon(iconName) : ''}<span>${label}</span></span>
    <span class="btn__price">${typeof price === 'number' ? money(price) : price}</span>
  `;
  const classes = `btn btn--price btn--block ${cls}`;
  const idAttr = id ? raw(`id="${id.replace(/[^\w-]/g, '')}"`) : '';
  if (href) return html`<a class="${classes}" href="${href}" ${idAttr} ${raw(attrs)}>${inner}</a>`;
  return html`<button class="${classes}" type="${type}" ${idAttr} ${raw(attrs)} ${disabled ? raw('disabled') : ''}>${inner}</button>`;
}

/**
 * Cabeçalho de um grupo de opções (tamanho, recheio, horário): título, dica e etiqueta.
 *   optionGroupHead('Tamanho', { hint: 'Escolha 1', required: true })
 *   optionGroupHead('Velas e toppers', { hint: 'Opcional' })
 * Quando a pessoa escolher, acrescente a classe .is-done (a etiqueta vira um ✓ verde).
 */
export function optionGroupHead(title, { hint = '', required = false, done = false, id = '' } = {}) {
  return html`
    <div class="opt-head ${done ? 'is-done' : ''}">
      <div>
        <h3 class="opt-head__title" ${id ? raw(`id="${id.replace(/[^\w-]/g, '')}"`) : ''}>${title}</h3>
        ${hint ? html`<p class="opt-head__hint">${hint}</p>` : ''}
      </div>
      ${required
        ? html`<span class="badge badge--dark opt-head__tag">Obrigatório</span><span class="opt-head__done" aria-label="Escolhido">${icon('check')}</span>`
        : ''}
    </div>
  `;
}

/**
 * Linha de lista com ícone e seta (menus da conta, atalhos, "Cupom" no carrinho). Use dentro de um .card.
 *   listRow({ iconName: 'ticket', title: 'Cupom', desc: 'BOLAB10 aplicado', href: '#/conta/cupons' })
 *   listRow({ iconName: 'map-pin', title: 'Entregar em', desc: 'Rua X, 120', trail: 'Trocar', attrs: 'data-open-receive' })
 * Com href vira link; sem href vira botão.
 */
export function listRow({ iconName = '', title, desc = '', href = '', trail = '', attrs = '', chevron = true }) {
  const inner = html`
    ${iconName ? html`<span class="row__icon">${icon(iconName)}</span>` : ''}
    <span class="row__body">
      <span class="row__title">${title}</span>
      ${desc ? html`<span class="row__desc">${desc}</span>` : ''}
    </span>
    ${trail ? html`<span class="row__trail">${trail}</span>` : ''} ${chevron ? icon('chevron-right', { cls: 'row__chev' }) : ''}
  `;
  if (href) return html`<a class="row" href="${href}" ${raw(attrs)}>${inner}</a>`;
  return html`<button class="row" type="button" ${raw(attrs)}>${inner}</button>`;
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

/** Aviso com ícone. tone: '' (neutro) | 'rose' | 'green' | 'amber' | 'red' */
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
          <span>${mode === 'pickup' ? 'Retirada no ateliê' : 'Taxa de entrega'}</span>
          ${t.shipping === 0
            ? html`<strong style="color:var(--green)">Grátis</strong>`
            : html`<strong>${money(t.shipping)}</strong>`}
        </div>`
      : ''}
    <div class="summary-line summary-line--total"><span>Total</span><strong>${money(t.total)}</strong></div>
  `;
}
