// BOLAB — favoritos: produtos salvos com o coração e bolos montados no personalizador 3D.
import { html, icon, money, plural, dateShort, on, toast, confirmDialog, observeReveal } from '../ui.js';
import { productCard, pageHead, mediaFallback } from '../components.js';
import { store, favs, savedCakes, cart } from '../store.js';
import { normalizeConfig, servesOf, prepHoursOf } from '../customizer/pricing.js';

const SUMMARY_MAX = 4;

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

function emptyAll() {
  return html`
    <div class="container favs">
      ${pageHead('Favoritos')}
      <div class="empty">
        <div class="empty__art">${icon('heart')}</div>
        <h2>Guarde aqui os bolos que você amou</h2>
        <p>Toque no coração de qualquer bolo para salvar. Ou monte o seu em 3D e deixe guardado para pedir quando quiser.</p>
        <div class="favs-empty-actions">
          <a class="btn" href="#/cardapio">Ver cardápio</a>
          <a class="btn btn--secondary" href="#/monte-seu-bolo">${icon('sparkles')} Montar meu bolo em 3D</a>
        </div>
      </div>
    </div>
  `;
}

function savedList(list) {
  if (!list.length) {
    return html`
      <a class="favs-hint" href="#/cardapio">
        <span class="favs-hint__icon">${icon('heart')}</span>
        <span class="favs-hint__body">
          <strong>Nenhum favorito ainda</strong>
          <span>Toque no coração de um bolo para guardá-lo aqui.</span>
        </span>
        <span class="link-arrow">Ver cardápio ${icon('arrow-right')}</span>
      </a>
    `;
  }
  return html`<div class="product-grid">${list.map((p, i) => html`<div class="favs-cell reveal" style="--reveal-delay:${(i % 4) * 50}ms">${productCard(p, { eager: i < 4 })}</div>`)}</div>`;
}

function cakeCard(c) {
  const summary = Array.isArray(c.summary) ? c.summary : [];
  const extra = summary.length - SUMMARY_MAX;
  const editHref = `#/monte-seu-bolo?bolo=${c.id}`;
  return html`
    <article class="favs-cake reveal">
      <a class="favs-cake__thumb" href="${editHref}" aria-label="Abrir ${c.name} no personalizador 3D">
        ${c.thumb ? html`<img src="${c.thumb}" alt="" loading="lazy" />` : mediaFallback()}
      </a>
      <div class="favs-cake__info">
        <div class="favs-cake__head">
          <h3>${c.name || 'Bolo personalizado'}</h3>
          <button class="icon-btn" type="button" data-favs-remove="${c.id}" aria-label="Remover ${c.name || 'bolo'} dos salvos">${icon('trash')}</button>
        </div>
        ${summary.length
          ? html`<ul class="favs-cake__summary">
              ${summary.slice(0, SUMMARY_MAX).map((line) => html`<li>${line}</li>`)}
              ${extra > 0 ? html`<li class="favs-cake__more">+ ${plural(extra, 'detalhe', 'detalhes')}</li>` : ''}
            </ul>`
          : ''}
        <div class="favs-cake__foot">
          <span class="price">${money(c.price)}</span>
          ${c.createdAt ? html`<span class="favs-cake__date">salvo em ${dateShort(c.createdAt)}</span>` : ''}
        </div>
      </div>
      <div class="favs-cake__actions">
        <button class="btn" type="button" data-favs-add="${c.id}">${icon('bag')} Adicionar ao carrinho</button>
        <a class="btn btn--secondary" href="${editHref}">${icon('edit')} Editar no 3D</a>
      </div>
    </article>
  `;
}

function cakesList(list) {
  if (!list.length) {
    return html`
      <a class="favs-invite reveal" href="#/monte-seu-bolo">
        <span class="favs-invite__icon">${icon('cube')}</span>
        <span class="favs-invite__body">
          <strong>Monte um bolo que é só seu</strong>
          <span>Monte camada por camada no personalizador 3D e salve aqui para pedir quando quiser.</span>
        </span>
        <span class="favs-invite__cta">Montar meu bolo em 3D ${icon('arrow-right')}</span>
      </a>
    `;
  }
  return html`<div class="favs-cakes">${list.map(cakeCard)}</div>`;
}

const view = {
  title: 'Favoritos',
  layout: 'default',

  render() {
    const list = favs.list();
    const cakes = savedCakes.list();
    if (!list.length && !cakes.length) return emptyAll();

    const sub = [
      list.length ? plural(list.length, 'favorito', 'favoritos') : '',
      cakes.length ? plural(cakes.length, 'bolo montado por você', 'bolos montados por você') : '',
    ]
      .filter(Boolean)
      .join(' · ');

    return html`
      <div class="container favs">
        ${pageHead('Favoritos', { sub })}

        <section class="favs-section" aria-labelledby="favs-saved-title">
          <div class="favs-section__head">
            <h2 id="favs-saved-title">Do cardápio</h2>
            ${list.length ? html`<a class="link-arrow" href="#/cardapio">Ver cardápio ${icon('arrow-right')}</a>` : ''}
          </div>
          ${savedList(list)}
        </section>

        <section class="favs-section" aria-labelledby="favs-cakes-title">
          <div class="favs-section__head">
            <h2 id="favs-cakes-title">Bolos que você montou</h2>
            ${cakes.length ? html`<a class="link-arrow" href="#/monte-seu-bolo">Montar outro ${icon('arrow-right')}</a>` : ''}
          </div>
          ${cakesList(cakes)}
        </section>
      </div>
    `;
  },

  mount(root) {
    observeReveal(root);

    /* Redesenha só o conteúdo. Não usamos ctx.rerender() aqui porque ele monta a tela de novo
       (e se inscreve de novo na loja) no meio do próprio aviso de mudança. */
    function redraw() {
      root.classList.add('view--still');
      root.innerHTML = String(view.render());
      observeReveal(root);
    }

    // Desfavoritar aqui tira o card da tela: avisamos e deixamos desfazer.
    let leaving = null;
    on(root, 'click', '[data-fav]', (_ev, el) => {
      leaving = favs.has(el.dataset.fav) ? el.dataset.fav : null;
    });

    on(root, 'click', '[data-favs-add]', (_ev, el) => {
      const cake = savedCakes.get(el.dataset.favsAdd);
      if (!cake) return;
      cart.addCustom({ name: cake.name, price: cake.price, thumb: cake.thumb, config: cake.config, summary: cake.summary, ...cakeExtras(cake.config) });
      toast(`${cake.name || 'Seu bolo'} foi para o carrinho`, { type: 'success', action: { label: 'Ver carrinho', href: '#/carrinho' } });
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

    return store.on('favs', () => {
      const gone = leaving && !favs.has(leaving) ? leaving : null;
      leaving = null;
      redraw();
      if (!gone) return;
      toast('Removido dos favoritos', { action: { label: 'Desfazer', onClick: () => favs.has(gone) || favs.toggle(gone) } });
    });
  },
};

export default view;
