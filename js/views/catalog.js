// BOLAB — cardápio: busca, categorias, ordenação e grade de produtos.
// A URL é a fonte da verdade (?cat=&q=&ordem=): dá para compartilhar um filtro e o "voltar" funciona.
import { html, icon, on, debounce, plural, observeReveal } from '../ui.js';
import { productCard } from '../components.js';
import { searchProducts, isCake } from '../data/products.js';
import { CATEGORIES, SITE } from '../data/site.js';
import { navigate } from '../router.js';

const SORTS = [
  { id: 'relevancia', label: 'Mais pedidos' },
  { id: 'menor-preco', label: 'Menor preço' },
  { id: 'maior-preco', label: 'Maior preço' },
  { id: 'avaliacao', label: 'Melhor avaliados' },
];

const SUGGESTIONS = ['chocolate', 'morango', 'limão', 'aniversário'];

/** Posição do convite ao personalizador dentro da grade (8ª casa, ou no fim de listas curtas). */
const PROMO_AT = 7;

/** Cada tela montada guarda aqui a função que aplica um novo filtro (usada por onQuery). */
const live = new WeakMap();

function readState(query = {}) {
  return {
    cat: CATEGORIES.some((c) => c.id === query.cat) ? query.cat : 'todos',
    q: String(query.q || '')
      .trim()
      .slice(0, 60),
    sort: SORTS.some((s) => s.id === query.ordem) ? query.ordem : 'relevancia',
  };
}

function find(state) {
  const list = searchProducts({ q: state.q, cat: state.cat, sort: state.sort });
  // Na ordem padrão os bolos vêm antes dos itens de festa; dentro de cada grupo vale a ordem da busca.
  return state.sort === 'relevancia' ? [...list.filter(isCake), ...list.filter((p) => !isCake(p))] : list;
}

function countLabel(list, state) {
  if (!list.length) return 'Nenhum resultado';
  if (state.q) return plural(list.length, 'resultado', 'resultados');
  const cakes = list.filter(isCake).length;
  const extras = list.length - cakes;
  if (!extras) return plural(cakes, 'bolo', 'bolos');
  if (!cakes) return plural(extras, 'item para a festa', 'itens para a festa');
  return plural(list.length, 'produto', 'produtos');
}

function countHtml(list, state) {
  const cat = CATEGORIES.find((c) => c.id === state.cat);
  const label = html`<strong>${countLabel(list, state)}</strong>`;
  if (state.q) return html`${label}<span>${state.cat === 'todos' ? `para “${state.q}”` : `“${state.q}” em ${cat.label}`}</span>`;
  return html`${label}${cat?.desc ? html`<span class="catalog-count__desc">${cat.desc}</span>` : ''}`;
}

function promoTile(state) {
  return html`
    <a class="catalog-promo" href="#/monte-seu-bolo">
      <span class="catalog-promo__icon">${icon('cube')}</span>
      <span class="catalog-promo__eyebrow">Exclusivo BOLAB</span>
      <strong class="catalog-promo__title">${state.cat === 'acess' ? 'Falta o bolo?' : 'Não achou o seu?'} <em>Monte do seu jeito em 3D.</em></strong>
      <span class="catalog-promo__text">Massa, recheio, cobertura e decoração: você escolhe tudo.</span>
      <span class="catalog-promo__cta">Montar meu bolo ${icon('arrow-right')}</span>
    </a>
  `;
}

function gridHtml(list, state, { reveal = false } = {}) {
  const cls = reveal ? 'catalog-cell reveal' : 'catalog-cell';
  const cells = list.map((p, i) => html`<div class="${cls}" style="--reveal-delay:${(i % 2) * 60}ms">${productCard(p, { eager: i < 4 })}</div>`);
  cells.splice(Math.min(list.length, PROMO_AT), 0, html`<div class="${cls}">${promoTile(state)}</div>`);
  return html`<div class="product-grid catalog-grid">${cells}</div>`;
}

function emptyHtml(state) {
  const cat = CATEGORIES.find((c) => c.id === state.cat);
  // A busca pode ter resultado em outras categorias: oferecemos o atalho antes de desistir.
  const elsewhere = state.q && state.cat !== 'todos' ? searchProducts({ q: state.q }).length : 0;
  return html`
    <div class="empty catalog-empty">
      <div class="empty__art">${icon('search')}</div>
      <h2>${state.q ? html`Nada por aqui com “${state.q}”` : 'Esta categoria está sem bolos no momento'}</h2>
      <p>
        ${elsewhere
          ? `Não encontramos em ${cat.label}, mas há ${plural(elsewhere, 'resultado', 'resultados')} em outras categorias.`
          : 'Tente outro sabor ou limpe os filtros. E se o bolo que você imaginou ainda não existe, dá para montar o seu em 3D.'}
      </p>
      <div class="catalog-empty__actions">
        ${elsewhere
          ? html`<button class="btn" type="button" data-catalog-all>Buscar em todo o cardápio</button>`
          : html`<button class="btn" type="button" data-catalog-clear>Limpar filtros</button>`}
        <a class="btn btn--secondary" href="#/monte-seu-bolo">${icon('sparkles')} Montar meu bolo em 3D</a>
      </div>
      <div class="catalog-empty__hints">
        <span>Que tal buscar por</span>
        ${SUGGESTIONS.filter((s) => s !== state.q.toLowerCase()).map(
          (s) => html`<button class="chip" type="button" data-catalog-suggest="${s}">${s}</button>`,
        )}
      </div>
    </div>
  `;
}

function resultsHtml(list, state, opts) {
  return list.length ? gridHtml(list, state, opts) : emptyHtml(state);
}

/** Identifica o que está na tela, para não redesenhar a grade quando nada mudou. */
function resultsKey(list, state) {
  return list.length ? `${list.map((p) => p.id).join(',')}|${state.cat === 'acess'}` : `vazio|${state.q}|${state.cat}`;
}

export default {
  title: 'Cardápio',
  layout: 'default',

  render(ctx) {
    const state = readState(ctx.query);
    const list = find(state);
    return html`
      <div class="container catalog">
        <header class="catalog-head">
          <div>
            <span class="eyebrow">Cardápio</span>
            <h1 class="catalog-head__title display">Qual vai ser o <em>bolo da vez?</em></h1>
            <p class="catalog-head__lead">Feitos à mão, sob encomenda, e entregues com hora marcada em ${SITE.region}.</p>
          </div>
          <form class="input-group catalog-search" role="search" data-catalog-form>
            ${icon('search')}
            <label class="sr-only" for="catalog-q">Buscar no cardápio</label>
            <input
              class="input"
              id="catalog-q"
              type="search"
              name="q"
              value="${state.q}"
              placeholder="Busque por sabor ou ocasião"
              autocomplete="off"
              autocapitalize="off"
              enterkeyhint="search"
              maxlength="60"
              data-catalog-input
            />
            <button class="icon-btn input-group__action" type="button" data-catalog-clear-q aria-label="Limpar busca" ${state.q ? '' : html`hidden`}>
              ${icon('x')}
            </button>
          </form>
        </header>

        <div class="chips catalog-chips" role="group" aria-label="Categorias" data-catalog-chips>
          ${CATEGORIES.map(
            (c) => html`<button class="chip" type="button" data-catalog-cat="${c.id}" aria-pressed="${c.id === state.cat ? 'true' : 'false'}">${c.label}</button>`,
          )}
        </div>

        <div class="catalog-bar">
          <p class="catalog-count" aria-live="polite" data-catalog-count>${countHtml(list, state)}</p>
          <label class="catalog-sort">
            <span class="catalog-sort__label">Ordenar por</span>
            <select class="select" data-catalog-sort aria-label="Ordenar por">
              ${SORTS.map((s) => html`<option value="${s.id}" ${s.id === state.sort ? html`selected` : ''}>${s.label}</option>`)}
            </select>
          </label>
        </div>

        <div class="catalog-results" data-catalog-results>${resultsHtml(list, state, { reveal: true })}</div>
      </div>
    `;
  },

  mount(root, ctx) {
    const input = root.querySelector('[data-catalog-input]');
    const clearQ = root.querySelector('[data-catalog-clear-q]');
    const chips = root.querySelector('[data-catalog-chips]');
    const sort = root.querySelector('[data-catalog-sort]');
    const count = root.querySelector('[data-catalog-count]');
    const results = root.querySelector('[data-catalog-results]');

    let state = readState(ctx.query);
    let shown = resultsKey(find(state), state);
    let disposed = false;

    /** Desenha o estado pedido. O campo de busca nunca é recriado (o cursor fica onde está). */
    function paint(next) {
      const catChanged = next.cat !== state.cat;
      state = next;
      const list = find(state);

      chips.querySelectorAll('[data-catalog-cat]').forEach((chip) => {
        const on = chip.dataset.catalogCat === state.cat;
        chip.setAttribute('aria-pressed', String(on));
        if (on && catChanged) centerChip(chip);
      });
      sort.value = state.sort;
      if (input.value.trim() !== state.q) input.value = state.q;
      clearQ.hidden = !input.value;
      count.innerHTML = String(countHtml(list, state));

      const key = resultsKey(list, state);
      if (key === shown) return;
      shown = key;
      results.innerHTML = String(resultsHtml(list, state));
      results.classList.remove('is-fresh');
      void results.offsetWidth; // reinicia a animação de entrada
      results.classList.add('is-fresh');
    }

    /* O roteador só devolve a rolagem ao voltar quando a URL não foi trocada por "replace".
       Como os filtros trocam a URL, a posição fica guardada no próprio histórico. */
    function rememberScroll() {
      if (disposed || !location.hash.startsWith('#/cardapio')) return;
      try {
        history.replaceState({ ...(history.state || {}), catalogY: Math.round(window.scrollY) }, '');
      } catch {
        // Alguns navegadores limitam a frequência de replaceState: tudo bem perder uma gravação.
      }
    }
    const onScroll = debounce(rememberScroll, 160);

    function pushUrl() {
      navigate('/cardapio', {
        replace: true,
        query: { cat: state.cat === 'todos' ? '' : state.cat, q: state.q, ordem: state.sort === 'relevancia' ? '' : state.sort },
      });
      rememberScroll();
    }

    /** Mudança feita pela pessoa: o texto da busca vem sempre do campo, nunca o contrário. */
    function commit(patch) {
      paint({ ...state, q: input.value.trim(), ...patch });
      pushUrl();
    }

    function centerChip(chip, behavior = 'smooth') {
      if (chips.scrollWidth <= chips.clientWidth) return;
      const box = chips.getBoundingClientRect();
      const item = chip.getBoundingClientRect();
      chips.scrollBy({ left: item.left - box.left - (box.width - item.width) / 2, behavior });
    }

    function focusSearch({ scroll = false } = {}) {
      input.focus({ preventScroll: !scroll });
      input.setSelectionRange(input.value.length, input.value.length);
    }

    const typed = debounce(() => {
      if (!disposed) commit({ q: input.value.trim() });
    }, 180);

    on(root, 'input', '[data-catalog-input]', () => {
      clearQ.hidden = !input.value;
      typed();
    });

    on(root, 'submit', '[data-catalog-form]', (ev) => {
      ev.preventDefault();
      commit({ q: input.value.trim() });
      input.blur(); // fecha o teclado no celular para mostrar os resultados
    });

    on(root, 'click', '[data-catalog-clear-q]', () => {
      input.value = '';
      commit({ q: '' });
      focusSearch();
    });

    on(root, 'click', '[data-catalog-cat]', (_ev, chip) => commit({ cat: chip.dataset.catalogCat }));

    on(root, 'change', '[data-catalog-sort]', () => commit({ sort: sort.value }));

    on(root, 'click', '[data-catalog-clear]', () => {
      input.value = '';
      commit({ q: '', cat: 'todos' });
    });

    on(root, 'click', '[data-catalog-all]', () => commit({ cat: 'todos' }));

    on(root, 'click', '[data-catalog-suggest]', (_ev, el) => {
      input.value = el.dataset.catalogSuggest;
      commit({ q: input.value, cat: 'todos' });
    });

    live.set(root, {
      /** A URL mudou por fora (busca do cabeçalho, link do rodapé, voltar/avançar). */
      apply(query) {
        const next = readState(query);
        const same = next.cat === state.cat && next.q === state.q && next.sort === state.sort;
        if (query.foco === 'busca') {
          // Lupa do cabeçalho com o cardápio já aberto: só leva o cursor para a busca, sem perder o filtro.
          const keep = !query.cat && !query.q && !query.ordem;
          if (!keep && !same) paint(next);
          focusSearch({ scroll: true });
          pushUrl();
          return;
        }
        // Eco da nossa própria troca de URL: a tela já está certa (e a pessoa pode estar digitando).
        if (!same) paint(next);
      },
    });

    observeReveal(root);
    window.addEventListener('scroll', onScroll, { passive: true });

    const active = chips.querySelector('[aria-pressed="true"]');
    if (active) centerChip(active, 'instant');

    // Só depois que o roteador terminar de montar a tela (ele rola para o topo logo após o mount).
    const savedY = history.state?.catalogY;
    const boot = setTimeout(() => {
      if (disposed) return;
      if (ctx.query.foco === 'busca') {
        focusSearch();
        pushUrl(); // tira o "foco=busca" da URL para o voltar não reabrir o teclado
      } else if (savedY > 0) {
        window.scrollTo({ top: savedY, behavior: 'instant' });
      }
    }, 0);

    return () => {
      disposed = true;
      clearTimeout(boot);
      window.removeEventListener('scroll', onScroll);
      live.delete(root);
    };
  },

  onQuery(root, ctx) {
    live.get(root)?.apply(ctx.query);
  },
};
