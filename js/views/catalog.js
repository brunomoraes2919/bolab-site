// BOLAB — cardápio, no formato de menu de app de delivery.
// Celular: busca e abas de categoria presas no topo; seções por categoria com linhas de lista;
// a aba ativa acompanha a rolagem. Computador: grade de cartões; a busca é a do cabeçalho e as
// categorias são as da faixa de seções (js/shell.js), para não repetir as duas coisas na tela.
// A URL é a fonte da verdade (?cat=&q=&ordem=): dá para compartilhar um filtro e o "voltar" funciona.
import { html, icon, on, debounce, plural, money } from '../ui.js';
import { productCard, productRow, promoBanner, chipRow } from '../components.js';
import { searchProducts, isCake } from '../data/products.js';
import { CATEGORIES } from '../data/site.js';
import { minPrice } from '../customizer/pricing.js';
import { navigate } from '../router.js';

const CATS = CATEGORIES.filter((c) => c.id !== 'todos');

const SORTS = [
  { id: 'relevancia', label: 'Mais pedidos' },
  { id: 'menor-preco', label: 'Menor preço' },
  { id: 'maior-preco', label: 'Maior preço' },
  { id: 'avaliacao', label: 'Melhor avaliados' },
];

const SUGGESTIONS = ['chocolate', 'morango', 'limão', 'aniversário'];

/** A partir daqui a tela é "de computador": grade de cartões e abas que filtram. */
const WIDE = window.matchMedia('(min-width: 900px)');
const XWIDE = window.matchMedia('(min-width: 1100px)');

/** Cada tela montada guarda aqui a função que aplica um novo filtro (usada por onQuery). */
const live = new WeakMap();

/** Campo de busca do cabeçalho: no computador é ele quem busca (o da tela fica escondido). */
const headerField = () => document.querySelector('#header [data-search] input');

function readState(query = {}) {
  return {
    cat: CATEGORIES.some((c) => c.id === query.cat) ? query.cat : 'todos',
    q: String(query.q || '')
      .trim()
      .slice(0, 60),
    sort: SORTS.some((s) => s.id === query.ordem) ? query.ordem : 'relevancia',
  };
}

/** Sem filtro nem busca, o celular mostra o cardápio inteiro em seções. */
const isMenu = (state) => state.cat === 'todos' && !state.q;

function find(state) {
  const list = searchProducts({ q: state.q, cat: state.cat, sort: state.sort });
  // Na ordem padrão os bolos vêm antes dos itens de festa; dentro de cada grupo vale a ordem da busca.
  return state.sort === 'relevancia' ? [...list.filter(isCake), ...list.filter((p) => !isCake(p))] : list;
}

function itemsLabel(list) {
  const cakes = list.filter(isCake).length;
  if (cakes === list.length) return plural(cakes, 'bolo', 'bolos');
  return plural(list.length, 'item', 'itens');
}

function countHtml(list, state) {
  const cat = CATEGORIES.find((c) => c.id === state.cat);
  if (state.q) {
    const where = state.cat === 'todos' ? '' : ` em ${cat.label}`;
    return html`<strong>${list.length ? plural(list.length, 'resultado', 'resultados') : 'Nenhum resultado'}</strong><span>para “${state.q}”${where}</span>`;
  }
  // Cardápio inteiro: no celular a linha só situa (os títulos são os das seções); no computador
  // ela é o título da página. Com filtro, é o título nos dois.
  if (state.cat === 'todos') {
    return html`<strong class="only-desktop">Cardápio</strong><span>${plural(list.length, 'item', 'itens')}<span class="only-mobile"> no cardápio</span></span>`;
  }
  return html`<strong>${cat.label}</strong><span>${itemsLabel(list)}</span>`;
}

/** Convite ao personalizador 3D, no meio da lista. */
function promo3d(state) {
  return promoBanner({
    tone: 'stage',
    tag: 'Só na BOLAB',
    title: state.cat === 'acess' ? 'Falta o bolo? Monte o seu em 3D' : 'Não achou o seu? Monte do seu jeito',
    text: `Massa, recheio e cobertura em 3D. A partir de ${money(minPrice()).replace(',00', '')}.`,
    cta: 'Montar meu bolo',
    href: '#/monte-seu-bolo',
    img: 'assets/img/cz-morango.webp',
    cutout: true,
    cls: 'catalog-promo',
  });
}

/* ───────── Celular: linhas de lista ───────── */
function rows(list, eagerCount = 0) {
  return html`<div class="menu-list catalog-list">${list.map((p, i) => productRow(p, { eager: i < eagerCount }))}</div>`;
}

/** Cardápio inteiro, em seções por categoria (as abas rolam até cada uma). */
function sectionsHtml(list, state) {
  const groups = CATS.map((c) => ({ c, items: list.filter((p) => p.cat === c.id) })).filter((g) => g.items.length);
  const promoAfter = Math.min(1, groups.length - 1);
  return html`${groups.map(
    (g, i) => html`
      <section class="catalog-sec" data-catalog-sec="${g.c.id}" aria-labelledby="catalog-sec-${g.c.id}">
        <h2 class="catalog-sec__title" id="catalog-sec-${g.c.id}">${g.c.label} <span>${g.items.length}</span></h2>
        ${rows(g.items, i === 0 ? 4 : 0)}
      </section>
      ${i === promoAfter ? promo3d(state) : ''}
    `,
  )}`;
}

function listHtml(list, state) {
  return html`
    ${rows(list, 4)} ${promo3d(state)}
    <button class="btn btn--secondary btn--block catalog-all" type="button" data-catalog-clear>Ver cardápio completo</button>
  `;
}

/* ───────── Computador: grade de cartões ───────── */
function gridHtml(list, state) {
  const cards = list.map((p, i) => productCard(p, { eager: i < 4 }));
  const promo = html`<div class="catalog-grid__promo">${promo3d(state)}</div>`;
  const at = (XWIDE.matches ? 4 : 3) * 2; // depois de duas fileiras cheias
  if (list.length > at) cards.splice(at, 0, promo);
  else cards.push(promo);
  return html`<div class="product-grid catalog-grid">${cards}</div>`;
}

function emptyHtml(state) {
  const cat = CATEGORIES.find((c) => c.id === state.cat);
  // A busca pode ter resultado em outras categorias: oferecemos o atalho antes de desistir.
  const elsewhere = state.q && state.cat !== 'todos' ? searchProducts({ q: state.q }).length : 0;
  return html`
    <div class="card empty catalog-empty">
      <div class="empty__art">${icon('search')}</div>
      <h2>${state.q ? html`Nada encontrado para “${state.q}”` : 'Nenhum item nesta categoria agora'}</h2>
      <p>
        ${elsewhere
          ? `Em ${cat.label} não tem, mas há ${plural(elsewhere, 'resultado', 'resultados')} em outras categorias.`
          : 'Tente outro sabor. Ou monte o bolo que você imaginou, em 3D.'}
      </p>
      <div class="catalog-empty__actions">
        ${elsewhere
          ? html`<button class="btn" type="button" data-catalog-all>Buscar em todo o cardápio</button>`
          : html`<a class="btn" href="#/monte-seu-bolo">${icon('cube')} Montar meu bolo em 3D</a>`}
        <button class="btn btn--secondary" type="button" data-catalog-clear>Ver cardápio completo</button>
      </div>
      <div class="catalog-empty__hints">
        <span>Buscas comuns</span>
        ${chipRow(
          SUGGESTIONS.filter((s) => s !== state.q.toLowerCase()).map((s) => ({ label: s, attrs: `data-catalog-suggest="${s}"` })),
          { label: 'Buscas comuns', cls: 'catalog-empty__chips' },
        )}
      </div>
    </div>
  `;
}

function resultsHtml(list, state) {
  if (!list.length) return emptyHtml(state);
  if (WIDE.matches) return gridHtml(list, state);
  return isMenu(state) ? sectionsHtml(list, state) : listHtml(list, state);
}

/** Identifica o que está na tela, para não redesenhar a lista quando nada mudou. */
function resultsKey(list, state) {
  const layout = WIDE.matches ? `grade${XWIDE.matches ? 4 : 3}` : isMenu(state) ? 'secoes' : 'lista';
  return list.length ? `${layout}|${list.map((p) => p.id).join(',')}|${state.cat === 'acess'}` : `vazio|${state.q}|${state.cat}`;
}

function chipsHtml(state) {
  return chipRow(
    CATEGORIES.map((c) => ({ label: c.label, active: c.id === state.cat, attrs: `data-catalog-cat="${c.id}"` })),
    { cls: 'catalog-chips' }, // o nome "Categorias" já está no <nav> em volta
  );
}

export default {
  title: 'Cardápio',
  layout: 'default',

  render(ctx) {
    const state = readState(ctx.query);
    const list = find(state);
    return html`
      <div class="catalog">
        <h1 class="sr-only">Cardápio</h1>

        <div class="catalog-top" data-catalog-top>
          <div class="container catalog-top__inner">
            <form class="search-field catalog-search" role="search" data-catalog-form>
              ${icon('search')}
              <label class="sr-only" for="catalog-q">Buscar no cardápio</label>
              <input
                id="catalog-q"
                type="search"
                name="q"
                value="${state.q}"
                placeholder="Buscar bolo, sabor ou ocasião"
                autocomplete="off"
                autocapitalize="off"
                enterkeyhint="search"
                maxlength="60"
                data-catalog-input
              />
              <button class="icon-btn catalog-search__clear" type="button" data-catalog-clear-q aria-label="Limpar busca" ${state.q ? '' : html`hidden`}>
                ${icon('x')}
              </button>
            </form>
            <nav class="catalog-tabs" aria-label="Categorias" data-catalog-chips>${chipsHtml(state)}</nav>
          </div>
        </div>

        <div class="container catalog-body">
          <div class="catalog-info" data-catalog-info ${list.length ? '' : html`hidden`}>
            <p class="catalog-count" aria-live="polite" data-catalog-count>${countHtml(list, state)}</p>
            <label class="catalog-sort">
              <span class="sr-only">Ordenar por</span>
              <select class="select" data-catalog-sort>
                ${SORTS.map((s) => html`<option value="${s.id}" ${s.id === state.sort ? html`selected` : ''}>${s.label}</option>`)}
              </select>
            </label>
          </div>

          <div class="catalog-results" data-catalog-results>${resultsHtml(list, state)}</div>
        </div>
      </div>
    `;
  },

  mount(root, ctx) {
    const top = root.querySelector('[data-catalog-top]');
    const input = root.querySelector('[data-catalog-input]');
    const clearQ = root.querySelector('[data-catalog-clear-q]');
    const chips = root.querySelector('[data-catalog-chips] .chips');
    const sort = root.querySelector('[data-catalog-sort]');
    const count = root.querySelector('[data-catalog-count]');
    const info = root.querySelector('[data-catalog-info]');
    const results = root.querySelector('[data-catalog-results]');
    const chipOf = (id) => chips.querySelector(`[data-catalog-cat="${id}"]`);

    let state = readState(ctx.query);
    let shown = resultsKey(find(state), state);
    let disposed = false;

    /** O campo de busca em uso: o do cabeçalho no computador, o da própria tela no celular. */
    const field = () => (WIDE.matches && headerField()) || input;
    /** Escreve o texto da busca nos dois campos (o que não está em uso só acompanha). */
    const setQuery = (text) => {
      input.value = text;
      const h = headerField();
      if (h) h.value = text;
    };

    /* ── abas ── */
    function centerChip(chip, behavior = 'smooth') {
      if (!chip || chips.scrollWidth <= chips.clientWidth) return;
      const box = chips.getBoundingClientRect();
      const item = chip.getBoundingClientRect();
      chips.scrollBy({ left: item.left - box.left - (box.width - item.width) / 2, behavior });
    }

    let activeChip = state.cat;
    function setActiveChip(id, behavior = 'smooth') {
      if (id === activeChip) return;
      activeChip = id;
      chips.querySelectorAll('[data-catalog-cat]').forEach((chip) => {
        const on = chip.dataset.catalogCat === id;
        chip.classList.toggle('is-active', on);
        chip.setAttribute('aria-pressed', String(on));
      });
      centerChip(chipOf(id), behavior);
    }

    /** No cardápio em seções (celular) a aba marcada é a da seção à vista; nos outros casos, o filtro. */
    function syncChips() {
      if (!WIDE.matches && isMenu(state)) spy();
      else setActiveChip(state.cat);
    }

    /** Desenha o estado pedido. O campo de busca nunca é recriado (o cursor fica onde está). */
    function paint(next, { force = false } = {}) {
      state = next;
      const list = find(state);

      sort.value = state.sort;
      if (input.value.trim() !== state.q) input.value = state.q;
      const h = headerField();
      if (h && h !== document.activeElement && h.value.trim() !== state.q) h.value = state.q;
      clearQ.hidden = !input.value;
      count.innerHTML = String(countHtml(list, state));
      info.hidden = !list.length; // sem resultado, quem fala é o estado vazio

      const key = resultsKey(list, state);
      if (key !== shown || force) {
        shown = key;
        results.innerHTML = String(resultsHtml(list, state));
        results.classList.remove('is-fresh');
        void results.offsetWidth; // reinicia a animação de entrada
        results.classList.add('is-fresh');
      }
      syncChips();
    }

    function pushUrl() {
      navigate('/cardapio', {
        replace: true,
        query: { cat: state.cat === 'todos' ? '' : state.cat, q: state.q, ordem: state.sort === 'relevancia' ? '' : state.sort },
      });
    }

    /** Mudança feita pela pessoa: o texto da busca vem sempre do campo, nunca o contrário. */
    function commit(patch, { toTop = true } = {}) {
      const before = shown;
      paint({ ...state, q: field().value.trim(), ...patch });
      pushUrl();
      // lista nova começa do começo (as abas e a busca ficam presas no topo)
      if (toTop && shown !== before && window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'instant' });
    }

    function focusSearch() {
      setCompact(false);
      const el = field();
      el.focus({ preventScroll: true });
      el.setSelectionRange(el.value.length, el.value.length);
    }

    /* ── celular: a busca recolhe ao rolar para baixo e a aba ativa acompanha a rolagem ── */
    let compact = false;
    let lastY = window.scrollY;
    let frame = 0;
    let spyLockUntil = 0;

    function setCompact(on) {
      if (on === compact) return;
      compact = on;
      top.classList.toggle('is-compact', on);
    }

    /** Altura do que fica preso no topo (cabeçalho + barra de abas, com ou sem a busca). */
    function pinnedHeight(withSearch) {
      const header = document.getElementById('header')?.offsetHeight || 56;
      const search = top.querySelector('.catalog-search').offsetHeight + 8;
      return header + top.offsetHeight - (withSearch ? 0 : search);
    }

    function spy() {
      const line = pinnedHeight(!compact) + 20;
      let current = 'todos';
      for (const sec of results.querySelectorAll('[data-catalog-sec]')) {
        if (sec.getBoundingClientRect().top > line) break;
        current = sec.dataset.catalogSec;
      }
      setActiveChip(current);
    }

    function onFrame() {
      frame = 0;
      if (disposed || WIDE.matches) return;
      const y = window.scrollY;
      if (Math.abs(y - lastY) > 4) {
        setCompact(y > lastY && y > 96 && document.activeElement !== input);
        lastY = y;
      }
      if (isMenu(state) && performance.now() > spyLockUntil) spy();
    }

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(onFrame);
    };

    /** Aba tocada no cardápio em seções: rola até a categoria em vez de filtrar. */
    function scrollToSection(id) {
      const sec = id === 'todos' ? null : results.querySelector(`[data-catalog-sec="${id}"]`);
      if (id !== 'todos' && !sec) return false;
      const y = sec ? sec.getBoundingClientRect().top + window.scrollY : 0;
      const goingDown = y > window.scrollY;
      spyLockUntil = performance.now() + 700; // durante a rolagem animada a aba tocada fica marcada
      setActiveChip(id);
      window.scrollTo({ top: Math.max(0, sec ? y - pinnedHeight(!goingDown) - 12 : 0), behavior: 'smooth' });
      return true;
    }

    /* ── eventos ── */
    const typed = debounce(() => {
      if (!disposed) commit({ q: field().value.trim() });
    }, 180);

    // Computador: digitar no campo do cabeçalho filtra a grade na hora, e Enter filtra aqui mesmo
    // (mantendo a categoria), em vez de recomeçar a navegação como nas outras telas.
    const header = document.getElementById('header');
    const onHeaderInput = (ev) => {
      if (WIDE.matches && ev.target.matches('[data-search] input')) typed();
    };
    const onHeaderSubmit = (ev) => {
      if (!WIDE.matches || !ev.target.matches('[data-search]')) return;
      ev.preventDefault();
      ev.stopPropagation(); // a moldura (js/shell.js) não precisa navegar: já estamos no cardápio
      commit({ q: ev.target.q.value.trim() });
    };
    header?.addEventListener('input', onHeaderInput);
    header?.addEventListener('submit', onHeaderSubmit);

    on(root, 'input', '[data-catalog-input]', () => {
      clearQ.hidden = !input.value;
      typed();
    });

    // Chegou ao campo pelo teclado com a busca recolhida: ela volta a aparecer.
    input.addEventListener('focus', () => setCompact(false));

    on(root, 'submit', '[data-catalog-form]', (ev) => {
      ev.preventDefault();
      commit({ q: input.value.trim() });
      input.blur(); // fecha o teclado no celular para mostrar os resultados
    });

    on(root, 'click', '[data-catalog-clear-q]', () => {
      setQuery('');
      commit({ q: '' });
      focusSearch();
    });

    on(root, 'click', '[data-catalog-cat]', (_ev, chip) => {
      const id = chip.dataset.catalogCat;
      if (!WIDE.matches && isMenu(state) && scrollToSection(id)) return;
      commit({ cat: id });
    });

    on(root, 'change', '[data-catalog-sort]', () => commit({ sort: sort.value }, { toTop: false }));

    on(root, 'click', '[data-catalog-clear]', () => {
      setQuery('');
      commit({ q: '', cat: 'todos' });
    });

    on(root, 'click', '[data-catalog-all]', () => commit({ cat: 'todos' }));

    on(root, 'click', '[data-catalog-suggest]', (_ev, el) => {
      setQuery(el.dataset.catalogSuggest);
      commit({ q: el.dataset.catalogSuggest, cat: 'todos' });
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
          focusSearch();
          pushUrl();
          return;
        }
        // Eco da nossa própria troca de URL: a tela já está certa (e a pessoa pode estar digitando).
        if (same) return;
        paint(next);
        window.scrollTo({ top: 0, behavior: 'instant' });
      },
    });

    // Trocou de celular para computador (ou girou o tablet): a lista muda de formato.
    const onLayout = () => {
      setCompact(false);
      paint(state, { force: true });
    };
    WIDE.addEventListener('change', onLayout);
    XWIDE.addEventListener('change', onLayout);
    window.addEventListener('scroll', onScroll, { passive: true });

    centerChip(chipOf(state.cat), 'instant');

    // Só depois que o roteador terminar de montar a tela (ele acerta a rolagem logo após o mount).
    const boot = setTimeout(() => {
      if (disposed) return;
      lastY = window.scrollY;
      if (ctx.query.foco === 'busca') {
        focusSearch();
        pushUrl(); // tira o "foco=busca" da URL para o voltar não reabrir o teclado
      } else if (!WIDE.matches && isMenu(state)) {
        spy();
      }
    }, 0);

    return () => {
      disposed = true;
      clearTimeout(boot);
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      header?.removeEventListener('input', onHeaderInput);
      header?.removeEventListener('submit', onHeaderSubmit);
      WIDE.removeEventListener('change', onLayout);
      XWIDE.removeEventListener('change', onLayout);
      live.delete(root);
    };
  },

  onQuery(root, ctx) {
    live.get(root)?.apply(ctx.query);
  },
};
