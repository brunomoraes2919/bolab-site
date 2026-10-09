// BOLAB — roteador por hash (#/caminho). Funciona em qualquer hospedagem estática.
import { auth } from './store.js';
import { closeAllDialogs, html, icon } from './ui.js';

const view = (name) => () => import(`./views/${name}.js`);

/** Tabela de rotas. `:id` vira params.id. */
const ROUTES = [
  { path: '/', load: view('home') },
  { path: '/cardapio', load: view('catalog') },
  { path: '/produto/:id', load: view('product') },
  { path: '/favoritos', load: view('favorites') },
  { path: '/monte-seu-bolo', load: view('customizer') },
  { path: '/carrinho', load: view('cart') },
  { path: '/checkout', load: view('checkout') },
  { path: '/pedidos', load: view('orders') },
  { path: '/pedido/:id', load: view('order') },
  { path: '/entrar', load: view('auth') },
  { path: '/conta', load: view('account') },
  { path: '/conta/dados', load: view('account-profile') },
  { path: '/conta/enderecos', load: view('account-addresses') },
  { path: '/conta/pagamentos', load: view('account-cards') },
  { path: '/conta/cupons', load: view('account-coupons') },
  { path: '/conta/indicar', load: view('account-refer') },
  { path: '/atendimento', load: view('support') },
].map((r) => ({
  ...r,
  keys: (r.path.match(/:(\w+)/g) || []).map((k) => k.slice(1)),
  regex: new RegExp(`^${r.path.replace(/:(\w+)/g, '([^/]+)')}/?$`),
}));

const appEl = () => document.getElementById('app');
const listeners = new Set();
const scrollMemory = new Map();
const trail = []; // caminhos visitados, para detectar "voltar"

let current = { path: null, full: null, cleanup: null, view: null, root: null, ctx: null };
let navToken = 0;
let replaceNext = false; // a próxima renderização veio de um navigate(..., { replace: true })

/** Lê o hash atual → { path, query, full }. */
export function parseLocation() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const [rawPath, rawQuery = ''] = hash.split('?');
  const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  const query = Object.fromEntries(new URLSearchParams(rawQuery));
  return { path, query, full: rawQuery ? `${path}?${rawQuery}` : path };
}

/** navigate('/carrinho') · navigate('/cardapio', { query: { cat: 'premium' } }) · navigate('/x', { replace: true }) */
export function navigate(path, { replace = false, query } = {}) {
  let target = path;
  if (query) {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null)).toString();
    if (qs) target += `?${qs}`;
  }
  const hash = `#${target}`;
  if (replace) {
    replaceNext = true;
    history.replaceState(null, '', hash);
  } else if (location.hash !== hash) {
    location.hash = hash;
    return;
  }
  render();
}

/** Volta uma tela; se não houver histórico dentro da loja, vai para `fallback`. */
export function goBack(fallback = '/') {
  if (trail.length > 1) history.back();
  else navigate(fallback, { replace: true });
}

/** onRoute(fn) → fn({ path, query, layout }) a cada troca de tela. Devolve função para desligar. */
export function onRoute(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function currentRoute() {
  return parseLocation();
}

function match(path) {
  for (const r of ROUTES) {
    const m = path.match(r.regex);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { route: r, params };
    }
  }
  return null;
}

function statusView({ iconName, title, text, cta, href }) {
  return {
    layout: 'default',
    render: () => html`
      <div class="container">
        <div class="empty">
          <div class="empty__art">${icon(iconName)}</div>
          <h2>${title}</h2>
          <p>${text}</p>
          <a class="btn" href="${href}">${cta}</a>
        </div>
      </div>
    `,
  };
}

const NOT_FOUND = statusView({
  iconName: 'cake',
  title: 'Esta página saiu do forno… e sumiu',
  text: 'Não encontramos o que você procurava. Que tal dar uma olhada no cardápio?',
  cta: 'Ver cardápio',
  href: '#/cardapio',
});

const LOAD_ERROR = statusView({
  iconName: 'alert',
  title: 'Não conseguimos abrir esta tela',
  text: 'Confira sua conexão e tente de novo.',
  cta: 'Voltar ao início',
  href: '#/',
});

/** Atualiza o rastro de telas visitadas. Devolve true quando a pessoa está voltando. */
function updateTrail(full, wasReplace) {
  if (wasReplace && trail.length) {
    trail[trail.length - 1] = full;
    return false;
  }
  const isBack = trail.length > 1 && trail[trail.length - 2] === full;
  if (isBack) trail.pop();
  else if (trail[trail.length - 1] !== full) trail.push(full);
  return isBack;
}

async function render() {
  const token = ++navToken;
  const wasReplace = replaceNext;
  replaceNext = false;
  const loc = parseLocation();
  const found = match(loc.path);

  let mod = NOT_FOUND;
  let params = {};
  if (found) {
    params = found.params;
    try {
      mod = (await found.route.load()).default;
    } catch (err) {
      console.error('[router] falha ao carregar a tela', loc.path, err);
      mod = LOAD_ERROR;
    }
  }
  if (token !== navToken) return; // outra navegação começou enquanto esta carregava

  if (mod.auth && !auth.isLogged()) {
    navigate('/entrar', { replace: true, query: { next: loc.full } });
    return;
  }

  // Mesma tela, só a query mudou: a tela pode atualizar sem recriar tudo.
  if (current.view === mod && current.path === loc.path && typeof mod.onQuery === 'function') {
    updateTrail(loc.full, wasReplace);
    current.full = loc.full;
    current.ctx.query = loc.query;
    mod.onQuery(current.root, current.ctx);
    notify(loc, mod);
    return;
  }

  if (current.full) scrollMemory.set(current.full, window.scrollY);
  const isBack = updateTrail(loc.full, wasReplace);

  closeAllDialogs();
  try {
    current.cleanup?.();
  } catch (err) {
    console.error('[router] erro ao encerrar a tela anterior', err);
  }

  const root = document.createElement('div');
  root.className = 'view';
  const ctx = {
    params,
    query: loc.query,
    path: loc.path,
    /**
     * Redesenha a tela atual no lugar (sem animação de entrada, mantendo a rolagem).
     * A tela ganha um elemento raiz novo, então os eventos ligados no anterior somem com ele.
     */
    rerender() {
      if (current.ctx !== ctx) return;
      try {
        current.cleanup?.();
      } catch (err) {
        console.error(err);
      }
      current.cleanup = null;
      const fresh = document.createElement('div');
      fresh.className = 'view view--still';
      fresh.innerHTML = String(mod.render(ctx));
      const y = window.scrollY;
      current.root.replaceWith(fresh);
      current.root = fresh;
      current.cleanup = mod.mount?.(fresh, ctx) || null;
      window.scrollTo(0, y);
    },
  };

  document.body.dataset.layout = mod.layout || 'default';
  document.title = mod.title ? `${typeof mod.title === 'function' ? mod.title(ctx) : mod.title} · BOLAB` : 'BOLAB — Bolos artesanais sob encomenda';

  try {
    root.innerHTML = String(mod.render(ctx));
  } catch (err) {
    console.error('[router] erro ao desenhar a tela', loc.path, err);
    root.innerHTML = String(LOAD_ERROR.render());
  }
  appEl().replaceChildren(root);
  current = { path: loc.path, full: loc.full, cleanup: null, view: mod, root, ctx };
  try {
    current.cleanup = mod.mount?.(root, ctx) || null;
  } catch (err) {
    console.error('[router] erro ao iniciar a tela', loc.path, err);
  }

  window.scrollTo(0, isBack ? scrollMemory.get(loc.full) || 0 : 0);
  notify(loc, mod);
}

function notify(loc, mod) {
  listeners.forEach((fn) => fn({ path: loc.path, query: loc.query, layout: mod.layout || 'default' }));
}

/**
 * Depois de sair da conta (ou apagar os dados): se a tela atual exige login, manda para o login.
 * Se já existe outra navegação a caminho, não faz nada — ela passa pelo mesmo controle.
 */
export function revalidate() {
  const loc = parseLocation();
  if (loc.full !== current.full) return;
  if (current.view?.auth && !auth.isLogged()) navigate('/entrar', { replace: true, query: { next: loc.full } });
}

export function startRouter() {
  window.addEventListener('hashchange', render);
  // Depois de entrar ou sair, telas protegidas precisam ser reavaliadas.
  render();
}
