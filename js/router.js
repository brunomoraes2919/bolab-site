// BOLAB — roteador por hash (#/caminho). Funciona em qualquer hospedagem estática.
import { auth } from './store.js';
import { closeAllDialogs, html, icon } from './ui.js';

/** Importa a tela. Se uma tentativa falhou (rede), a próxima usa um endereço novo:
 *  o navegador guarda a falha de um import() e repetiria o erro para sempre. */
const view = (name) => (attempt) => import(`./views/${name}.js${attempt ? `?t=${attempt}` : ''}`);

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
  failures: 0,
  keys: (r.path.match(/:(\w+)/g) || []).map((k) => k.slice(1)),
  regex: new RegExp(`^${r.path.replace(/:(\w+)/g, '([^/]+)')}/?$`),
}));

const appEl = () => document.getElementById('app');
const listeners = new Set();
const scrollMemory = new Map(); // posição de rolagem por entrada do histórico

let current = { path: null, full: null, cleanup: null, view: null, root: null, ctx: null };
let navToken = 0;
// Cada entrada do histórico do navegador ganha um número (history.state.bolabIdx).
// Comparando com o da tela atual sabemos se a pessoa avançou, voltou ou abriu algo novo.
let currentIdx = -1;

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
    history.replaceState(history.state, '', hash); // mantém o número da entrada
  } else if (location.hash !== hash) {
    location.hash = hash;
    return;
  }
  render();
}

/** Volta uma tela; se não houver histórico dentro da loja, vai para `fallback`. */
export function goBack(fallback = '/') {
  if (currentIdx > 0) history.back();
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
    if (!m) continue;
    try {
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { route: r, params };
    } catch {
      return null; // link com "%" quebrado: trata como página não encontrada
    }
  }
  return null;
}

function statusView({ iconName, title, text, cta, href, retry = false }) {
  return {
    layout: 'default',
    render: () => html`
      <div class="container">
        <div class="empty">
          <div class="empty__art">${icon(iconName)}</div>
          <h1 style="font-size:var(--fs-xl)">${title}</h1>
          <p>${text}</p>
          ${retry ? html`<button class="btn" type="button" data-router-retry>Tentar de novo</button>` : ''}
          <a class="btn ${retry ? 'btn--secondary' : ''}" href="${href}">${cta}</a>
        </div>
      </div>
    `,
    mount: (root) => {
      root.querySelector('[data-router-retry]')?.addEventListener('click', () => render());
    },
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
  retry: true,
});

/**
 * Descobre o tipo da navegação e numera a entrada do histórico.
 * → 'new' (link ou navigate), 'back', 'forward' ou 'same' (replace / recarga da mesma entrada)
 */
function classifyNavigation() {
  const state = history.state;
  const known = state && Number.isInteger(state.bolabIdx);
  if (!known) {
    const idx = currentIdx + 1;
    history.replaceState({ ...(state || {}), bolabIdx: idx }, '');
    currentIdx = idx;
    return 'new';
  }
  const idx = state.bolabIdx;
  const kind = currentIdx < 0 || idx === currentIdx ? 'same' : idx < currentIdx ? 'back' : 'forward';
  currentIdx = idx;
  return kind;
}

async function render() {
  const token = ++navToken;
  const loc = parseLocation();
  const found = match(loc.path);

  let mod = NOT_FOUND;
  let params = {};
  if (found) {
    params = found.params;
    try {
      mod = (await found.route.load(found.route.failures)).default;
    } catch (err) {
      console.error('[router] falha ao carregar a tela', loc.path, err);
      found.route.failures += 1;
      mod = LOAD_ERROR;
    }
  }
  if (token !== navToken) return; // outra navegação começou enquanto esta carregava

  if (mod.auth && !auth.isLogged()) {
    navigate('/entrar', { replace: true, query: { next: loc.full } });
    return;
  }

  const leavingIdx = currentIdx;
  const kind = classifyNavigation();

  // Mesma tela, só a query mudou: a tela pode atualizar sem recriar tudo.
  if (current.view === mod && current.path === loc.path && typeof mod.onQuery === 'function') {
    current.full = loc.full;
    current.ctx.query = loc.query;
    mod.onQuery(current.root, current.ctx);
    notify(loc, mod);
    return;
  }

  if (leavingIdx >= 0 && current.full) scrollMemory.set(leavingIdx, window.scrollY);

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
    /** true quando a pessoa voltou ou avançou pelo histórico (a rolagem será devolvida ao ponto onde estava). */
    restoring: kind === 'back' || kind === 'forward',
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

  let active = mod;
  try {
    root.innerHTML = String(mod.render(ctx));
  } catch (err) {
    console.error('[router] erro ao desenhar a tela', loc.path, err);
    active = LOAD_ERROR;
    root.innerHTML = String(LOAD_ERROR.render());
  }
  appEl().replaceChildren(root);
  current = { path: loc.path, full: loc.full, cleanup: null, view: mod, root, ctx };
  try {
    current.cleanup = active.mount?.(root, ctx) || null;
  } catch (err) {
    console.error('[router] erro ao iniciar a tela', loc.path, err);
  }

  // Só quem voltou ou avançou pelo histórico retoma a rolagem; tela aberta por link começa do topo.
  const restore = kind === 'back' || kind === 'forward';
  window.scrollTo({ top: restore ? scrollMemory.get(currentIdx) || 0 : 0, behavior: 'instant' });
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
  // A rolagem é controlada aqui (o conteúdo é montado depois que o navegador tentaria restaurá-la).
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.addEventListener('hashchange', render);
  render();
}
