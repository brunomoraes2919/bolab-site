// BOLAB — favoritos: itens salvos com o coração e bolos montados no personalizador 3D.
// Celular: linhas de lista, como no cardápio. Computador: grade de cartões.
import { html, icon, money, plural, dateShort, on, toast, confirmDialog } from '../ui.js';
import { productCard, productRow, favButton, pageHead, mediaFallback, sectionHead, promoBanner, priceButton } from '../components.js';
import { store, favs, savedCakes, cart } from '../store.js';
import { searchProducts, isCake } from '../data/products.js';
import { normalizeConfig, servesOf, prepHoursOf, minPrice } from '../customizer/pricing.js';

const SUMMARY_MAX = 3;
/** Com menos favoritos do que isto, a tela ainda sugere os mais pedidos. */
const SUGGEST_UNTIL = 4;
const WIDE = window.matchMedia('(min-width: 900px)');

/** Rendimento e prazo do bolo salvo, calculados como no personalizador (o carrinho usa os dois). */
function cakeExtras(config) {
  if (!config || typeof config !== 'object') return {}; // sem configuração não dá para afirmar tamanho nem prazo
  try {
    const c = normalizeConfig(config);
    return { serves: servesOf(c), prepHours: prepHoursOf(c) };
  } catch {
    return {}; // configuração antiga ou incompleta: valem os padrões do carrinho
  }
}

function promo3d() {
  return promoBanner({
    tone: 'stage',
    tag: 'Só na BOLAB',
    title: 'Monte o seu bolo em 3D',
    text: `Salve para pedir quando quiser. A partir de ${money(minPrice()).replace(',00', '')}.`,
    cta: 'Montar meu bolo',
    href: '#/monte-seu-bolo',
    img: 'assets/img/cz-morango.webp',
    cutout: true,
  });
}

/** Itens do cardápio: lista com coração no celular, grade no computador. */
function products(list) {
  if (WIDE.matches) return html`<div class="product-grid">${list.map((p, i) => productCard(p, { eager: i < 4 }))}</div>`;
  return html`
    <div class="menu-list favs-list">
      ${list.map((p, i) => html`<div class="favs-row">${productRow(p, { eager: i < 4 })} ${favButton(p.id, { cls: 'favs-row__fav' })}</div>`)}
    </div>
  `;
}

function cakeCard(c) {
  const summary = Array.isArray(c.summary) ? c.summary : [];
  const extra = summary.length - SUMMARY_MAX;
  const editHref = `#/monte-seu-bolo?bolo=${c.id}`;
  const name = c.name || 'Bolo personalizado';
  return html`
    <article class="card favs-cake">
      <a class="favs-cake__thumb" href="${editHref}" aria-label="Abrir ${name} no personalizador 3D">
        ${c.thumb ? html`<img src="${c.thumb}" alt="" loading="lazy" />` : mediaFallback()}
      </a>
      <div class="favs-cake__info">
        <h3 class="favs-cake__name">${name}</h3>
        ${summary.length
          ? html`<p class="favs-cake__summary">${summary.slice(0, SUMMARY_MAX).join(' · ')}${extra > 0 ? ` · +${extra}` : ''}</p>`
          : ''}
        ${c.createdAt ? html`<p class="favs-cake__date">Salvo em ${dateShort(c.createdAt)}</p>` : ''}
      </div>
      <button class="icon-btn favs-cake__remove" type="button" data-favs-remove="${c.id}" aria-label="Remover ${name} dos salvos">${icon('trash')}</button>
      <div class="favs-cake__actions">
        <a class="btn btn--neutral" href="${editHref}" aria-label="Editar ${name} no 3D">${icon('edit')} Editar</a>
        ${priceButton('Adicionar', Number(c.price) || 0, { attrs: `data-favs-add="${String(c.id).replace(/[^\w-]/g, '')}"` })}
      </div>
    </article>
  `;
}

/** Sugestões para quem salvou pouco: os mais pedidos que ainda não estão na lista, com o coração para tocar. */
function suggestions() {
  const list = searchProducts()
    .filter((p) => isCake(p) && !favs.has(p.id))
    .slice(0, 6);
  if (!list.length) return '';
  return html`
    <section class="favs-section" aria-labelledby="favs-sug-t">
      ${sectionHead('Mais pedidos', { href: '#/cardapio', id: 'favs-sug-t' })}
      <div class="rail rail--grid favs-suggest">${list.map((p) => productCard(p, { compact: true }))}</div>
    </section>
  `;
}

const view = {
  title: 'Favoritos',
  layout: 'default',

  render() {
    const list = favs.list();
    const cakes = savedCakes.list();

    if (!list.length && !cakes.length) {
      return html`
        <div class="container favs">
          ${pageHead('Favoritos')}
          <div class="card empty favs-empty">
            <div class="empty__art">${icon('heart')}</div>
            <h2>Nenhum favorito ainda</h2>
            <p>Toque no coração de um bolo para guardar aqui e pedir de novo em dois toques.</p>
            <a class="btn" href="#/cardapio">Ver cardápio</a>
          </div>
          ${suggestions()}
          <div class="favs-section">${promo3d()}</div>
        </div>
      `;
    }

    const sub = [list.length ? plural(list.length, 'item salvo', 'itens salvos') : '', cakes.length ? plural(cakes.length, 'bolo montado', 'bolos montados') : '']
      .filter(Boolean)
      .join(' · ');

    return html`
      <div class="container favs">
        ${pageHead('Favoritos', { sub })}

        ${list.length
          ? html`<section class="favs-section" aria-labelledby="favs-saved-t">
              ${sectionHead('Do cardápio', { href: '#/cardapio', label: 'Ver cardápio', id: 'favs-saved-t' })} ${products(list)}
            </section>`
          : ''}

        <section class="favs-section" aria-labelledby="favs-cakes-t">
          ${sectionHead('Bolos que você montou', cakes.length ? { href: '#/monte-seu-bolo', label: 'Montar outro', id: 'favs-cakes-t' } : { id: 'favs-cakes-t' })}
          ${cakes.length ? html`<div class="favs-cakes">${cakes.map(cakeCard)}</div>` : promo3d()}
        </section>

        ${list.length < SUGGEST_UNTIL ? suggestions() : ''}
      </div>
    `;
  },

  mount(root) {
    /* Redesenha só o conteúdo. Não usamos ctx.rerender() aqui: os eventos ficam ligados neste
       mesmo elemento e a tela não pisca. */
    function redraw() {
      root.classList.add('view--still');
      root.innerHTML = String(view.render());
    }

    // Desfavoritar aqui tira o item da lista: avisamos e deixamos desfazer.
    let leaving = null;
    on(root, 'click', '[data-fav]', (_ev, el) => {
      leaving = favs.has(el.dataset.fav) ? el.dataset.fav : null;
    });

    on(root, 'click', '[data-favs-add]', (_ev, el) => {
      const cake = savedCakes.get(el.dataset.favsAdd);
      if (!cake) return;
      const name = cake.name || 'Bolo personalizado';
      cart.addCustom({ name, price: cake.price, thumb: cake.thumb, config: cake.config, summary: cake.summary, ...cakeExtras(cake.config) });
      toast(`${name} foi para o carrinho`, { type: 'success', action: { label: 'Ver carrinho', href: '#/carrinho' } });
    });

    on(root, 'click', '[data-favs-remove]', async (_ev, el) => {
      const cake = savedCakes.get(el.dataset.favsRemove);
      if (!cake) return;
      const ok = await confirmDialog({
        title: 'Remover este bolo?',
        message: `“${cake.name || 'Bolo personalizado'}” sai dos seus bolos salvos. Você pode montar de novo quando quiser.`,
        confirmLabel: 'Remover',
        cancelLabel: 'Manter',
        danger: true,
      });
      if (!ok) return;
      savedCakes.remove(cake.id);
      toast('Bolo removido dos seus salvos');
    });

    WIDE.addEventListener('change', redraw);

    const off = store.on('favs', () => {
      const gone = leaving && !favs.has(leaving) ? leaving : null;
      leaving = null;
      redraw();
      if (!gone) return;
      toast('Removido dos favoritos', { action: { label: 'Desfazer', onClick: () => favs.has(gone) || favs.toggle(gone) } });
    });

    return () => {
      off();
      WIDE.removeEventListener('change', redraw);
    };
  },
};

export default view;
