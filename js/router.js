// BOLAB — roteador por hash (#/caminho). Funciona em qualquer hospedagem estática.
import { auth } from './store.js';
import { closeAllDialogs, html, icon } from './ui.js';
import { SITE } from './data/site.js';

const DEFAULT_TITLE = `${SITE.name} — Bolos artesanais sob encomenda em ${SITE.city}`;

/* Descrição, cartão de compartilhamento e dados estruturados (js/seo.js) não são necessários para
   a tela aparecer: o arquivo só é buscado depois que a tela já está desenhada. */
let seo = null;
function applySeoLater(info) {
  seo ||= import('./seo.js');
  seo.then((m) => m.applySeo(info)).catch(() => {
    seo = null; // sem rede agora: tenta de novo na próxima tela
  });
}

/** Importa a tela. Se uma tentativa falhou (rede), a próxima usa um endereço novo:
 *  o navegador guarda a falha de um import() e repetiria o erro para sempre. */
const view = (name) => (attempt) => import(`./views/${name}.js${attempt ? `?t=${attempt}` : ''}`);

/** r5-tela: o motor 3D do personalizador é pedido junto com a tela (em paralelo), mas a tela não espera por ele:
 *  o painel de opções aparece antes, e o bolo entra quando o motor chega (js/views/customizer.js → engineLoad). */
const customizerView = (attempt) => {
  import('./customizer/engine.js').catch(() => {});
  return view('customizer')(attempt);
};

/**
 * Tabela de rotas. `:id` vira params.id.
 * `css`: folhas de estilo da área (css/<nome>.css) que a tela usa. Elas são carregadas junto com
 * a tela, antes de ela aparecer; as da moldura (tokens, base, components, shell) estão no
 * index.html. Tela nova que use classes de outra área: acrescente a folha aqui.
 * `layout`: o mesmo `layout` do arquivo da tela, repetido aqui só para a moldura já nascer no
 * formato certo na abertura (sem isso o cabeçalho aparecia completo e depois trocava). Quem manda
 * é o da tela; se os dois divergirem, a única consequência é essa troca visível na abertura.
 */
const ROUTES = [
  { path: '/', load: view('home'), css: ['home'] },
  { path: '/cardapio', load: view('catalog'), css: ['catalog'] },
  { path: '/produto/:id', load: view('product'), css: ['catalog'] },
  { path: '/favoritos', load: view('favorites'), css: ['catalog'] },
  { path: '/monte-seu-bolo', load: customizerView, css: ['customizer', 'atelier'], layout: 'immersive' }, // r5-tela: atelier = a camada de imersão
  { path: '/carrinho', load: view('cart'), css: ['cart'], layout: 'plain' },
  { path: '/checkout', load: view('checkout'), css: ['cart'], layout: 'focus' },
  { path: '/pedidos', load: view('orders'), css: ['cart', 'account'], layout: 'plain' },
  { path: '/pedido/:id', load: view('order'), css: ['cart'], layout: 'plain' },
  { path: '/cozinha', load: view('cozinha'), css: ['cozinha'], layout: 'plain' }, // ficha de produção aberta pelo link da mensagem do pedido
  { path: '/entrar', load: view('auth'), css: ['account'], layout: 'focus' },
  { path: '/conta', load: view('account'), css: ['account', 'cart'], layout: 'plain' },
  { path: '/conta/dados', load: view('account-profile'), css: ['account'], layout: 'plain' },
  { path: '/conta/enderecos', load: view('account-addresses'), css: ['account'], layout: 'plain' },
  { path: '/conta/pagamentos', load: view('account-cards'), css: ['account'], layout: 'plain' },
  { path: '/conta/cupons', load: view('account-coupons'), css: ['account'], layout: 'plain' },
  { path: '/conta/indicar', load: view('account-refer'), css: ['account'], layout: 'plain' },
  { path: '/atendimento', load: view('support'), css: ['account'], layout: 'plain' },
].map((r) => ({
  ...r,
  failures: 0,
  keys: (r.path.match(/:(\w+)/g) || []).map((k) => k.slice(1)),
  regex: new RegExp(`^${r.path.replace(/:(\w+)/g, '([^/]+)')}/?$`),
}));

/* ───────── Folhas de estilo por área ─────────
   Antes, as 9 folhas (14 mil linhas) eram baixadas e lidas na abertura de qualquer tela. Agora o
   index.html traz só as da moldura e cada área chega com a primeira tela que precisa dela. A
   tela só aparece depois que a folha dela chegou: nada pisca sem estilo. */
const AREA_CSS = ['home', 'catalog', 'cart', 'account', 'customizer', 'atelier', 'cozinha']; // ordem na página (a mesma de sempre)
const cssReady = new Map(); // nome → Promise<boolean>

function ensureCss(name) {
  if (cssReady.has(name)) return cssReady.get(name);
  const ready = new Promise((resolve) => {
    // Página que já traz a folha no próprio HTML (bancadas em lab/): nada a fazer.
    const file = `css/${name}.css`;
    if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => (l.getAttribute('href') || '').split('?')[0].endsWith(file))) {
      resolve(true);
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = file;
    link.dataset.areaCss = name;
    const fail = () => {
      cssReady.delete(name); // a próxima tentativa pede de novo
      link.remove();
      resolve(false);
    };
    const timer = setTimeout(fail, 15000);
    link.addEventListener(
      'load',
      () => {
        clearTimeout(timer);
        resolve(true);
      },
      { once: true },
    );
    link.addEventListener(
      'error',
      () => {
        clearTimeout(timer);
        fail();
      },
      { once: true },
    );
    // Mantém a ordem das folhas: antes da próxima área já carregada; senão, na marca do index.html.
    const later = AREA_CSS.slice(AREA_CSS.indexOf(name) + 1)
      .map((n) => document.querySelector(`link[data-area-css="${n}"]`))
      .find(Boolean);
    const slot = later || document.querySelector('meta[name="bolab-area-css"]');
    if (slot) slot.before(link);
    else document.head.appendChild(link);
  });
  cssReady.set(name, ready);
  return ready;
}

/** Erro que a pessoa precisa saber: vai para o console e para o aviso amigável (js/app.js). */
function report(where, err) {
  console.error(`[router] ${where}`, err);
  window.dispatchEvent(new CustomEvent('bolab:error', { detail: { where, error: err } }));
}

const appEl = () => document.getElementById('app');
const listeners = new Set();
const scrollMemory = new Map(); // posição de rolagem por entrada do histórico

let current = { path: null, full: null, cleanup: null, view: null, root: null, ctx: null };
let navToken = 0;

/* Tela que demora a chegar (rede lenta): depois de um instante, uma linha fina corre sob o
   cabeçalho (body.is-routing, css/shell.css) e o conteúdo é marcado como ocupado. Em rede boa a
   tela chega antes e nada aparece. */
let routingTimer = 0;
function setRouting(on) {
  clearTimeout(routingTimer);
  if (on) {
    routingTimer = setTimeout(() => {
      document.body.classList.add('is-routing');
      appEl()?.setAttribute('aria-busy', 'true');
    }, 160);
    return;
  }
  document.body.classList.remove('is-routing');
  appEl()?.removeAttribute('aria-busy');
}

/* Leitor de tela: a cada troca de tela o título é anunciado (região discreta, criada uma vez). */
let routeStatus = null;
function announce(text) {
  if (!routeStatus) {
    routeStatus = document.createElement('div');
    routeStatus.className = 'sr-only';
    routeStatus.setAttribute('role', 'status');
    routeStatus.setAttribute('aria-live', 'polite');
    document.body.appendChild(routeStatus);
  }
  routeStatus.textContent = text;
}
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
  title: 'Página não encontrada',
  text: 'O endereço pode ter mudado ou o item saiu do cardápio.',
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
    if (current.root) setRouting(true); // na abertura quem avisa é a tela de partida
    try {
      const [loaded, ...styles] = await Promise.all([found.route.load(found.route.failures), ...found.route.css.map(ensureCss)]);
      if (styles.includes(false)) throw new Error('a folha de estilo da tela não chegou');
      mod = loaded.default;
    } catch (err) {
      console.error('[router] falha ao carregar a tela', loc.path, err);
      found.route.failures += 1;
      mod = LOAD_ERROR;
    }
  }
  if (token !== navToken) return; // outra navegação começou enquanto esta carregava
  setRouting(false);

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
      // Primeiro desenha; se der erro, a tela que está aberta continua como estava.
      let markup;
      try {
        markup = String(mod.render(ctx));
      } catch (err) {
        report(`erro ao redesenhar ${loc.path}`, err);
        return;
      }
      try {
        current.cleanup?.();
      } catch (err) {
        console.error(err);
      }
      current.cleanup = null;
      const fresh = document.createElement('div');
      fresh.className = 'view view--still';
      fresh.innerHTML = markup;
      const y = window.scrollY;
      current.root.replaceWith(fresh);
      current.root = fresh;
      try {
        current.cleanup = mod.mount?.(fresh, ctx) || null;
      } catch (err) {
        report(`erro ao iniciar ${loc.path}`, err);
      }
      window.scrollTo(0, y);
    },
  };

  document.body.dataset.layout = mod.layout || 'default';
  let title = DEFAULT_TITLE;
  try {
    const own = typeof mod.title === 'function' ? mod.title(ctx) : mod.title;
    if (own) title = `${own} · BOLAB`;
    else if (mod === NOT_FOUND) title = 'Página não encontrada · BOLAB';
  } catch (err) {
    console.error('[router] erro no título da tela', loc.path, err);
  }
  document.title = title;

  let active = mod;
  try {
    root.innerHTML = String(mod.render(ctx));
  } catch (err) {
    console.error('[router] erro ao desenhar a tela', loc.path, err);
    active = LOAD_ERROR;
    root.innerHTML = String(LOAD_ERROR.render());
  }
  const firstScreen = !current.root;
  appEl().replaceChildren(root);
  current = { path: loc.path, full: loc.full, cleanup: null, view: mod, root, ctx };
  try {
    current.cleanup = active.mount?.(root, ctx) || null;
  } catch (err) {
    report(`erro ao iniciar a tela ${loc.path}`, err);
  }

  // Só quem voltou ou avançou pelo histórico retoma a rolagem; tela aberta por link começa do topo.
  const restore = kind === 'back' || kind === 'forward';
  window.scrollTo({ top: restore ? scrollMemory.get(currentIdx) || 0 : 0, behavior: 'instant' });
  notify(loc, mod);

  // Teclado e leitor de tela: a tela nova é anunciada e o foco vai para o conteúdo (o link tocado
  // ficou para trás, na tela anterior ou na moldura). Tela que já pôs o foco em algo dela, ou
  // pessoa digitando em um campo (a busca do cabeçalho), fica como está.
  if (!firstScreen) {
    announce(title);
    const focused = document.activeElement;
    const typing = focused && /^(INPUT|TEXTAREA|SELECT)$/.test(focused.tagName);
    if (!typing && !root.contains(focused)) appEl().focus({ preventScroll: true });
  }
  applySeoLater({ path: loc.path, params, query: loc.query, title });
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

/**
 * Com a loja parada, deixa prontas as telas para onde a pessoa mais vai a seguir (cardápio, item,
 * carrinho): o primeiro toque em cada uma não espera download. Não roda com economia de dados.
 *
 * Carrega de verdade (a folha de estilo entra na página, o arquivo da tela é importado com tudo o
 * que ele usa), uma tela por vez e sempre em momento ocioso. Só "avisar" o navegador
 * (`prefetch`/`modulepreload`) não bastava: a folha voltava à rede quando o servidor manda
 * revalidar, e os arquivos que a tela importa não vinham junto.
 */
const WARM = ['/cardapio', '/produto/:id', '/carrinho'];
const idle = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 1));
const warmLater = () => setTimeout(() => idle(warmUp), 1500);

async function warmUp() {
  const conn = navigator.connection;
  if (navigator.onLine === false || (conn && (conn.saveData || /2g/.test(conn.effectiveType || '')))) return;
  // O personalizador 3D usa a máquina inteira: o aquecimento espera a pessoa sair dele.
  if (document.body.dataset.layout === 'immersive') {
    window.addEventListener('hashchange', warmLater, { once: true });
    return;
  }
  for (const path of WARM) {
    const route = ROUTES.find((r) => r.path === path);
    route.css.forEach(ensureCss);
    // Falhou (rede caiu): a próxima tentativa, a da própria tela, usa um endereço novo.
    await route.load(route.failures).catch(() => {
      route.failures += 1;
    });
    await new Promise(idle);
  }
}

/** Antes de a moldura ser desenhada: já deixa a página no formato da tela de entrada. */
export function primeLayout() {
  const found = match(parseLocation().path);
  if (found?.route.layout) document.body.dataset.layout = found.route.layout;
}

export function startRouter() {
  // A rolagem é controlada aqui (o conteúdo é montado depois que o navegador tentaria restaurá-la).
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.addEventListener('hashchange', render);
  render();
  // Só depois que a tela de entrada terminou de carregar (fotos inclusive), para não disputar a rede com ela.
  if (document.readyState === 'complete') warmLater();
  else window.addEventListener('load', warmLater, { once: true });
}
