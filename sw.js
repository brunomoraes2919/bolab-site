// BOLAB — service worker: deixa a loja instalável como aplicativo e abrindo sem internet.
//
// O que ele guarda: só arquivos da própria loja pedidos com GET (HTML, CSS, JS, fonte, imagens,
// sons). Nunca guarda dados de ninguém — carrinho, conta e pedidos ficam no localStorage, fora
// daqui — nem respostas de outros sites (ViaCEP, fotos do Unsplash seguem direto para a rede).
//
// Estratégia, por tipo de arquivo:
//   • Código (HTML, CSS, JS, manifesto): REDE PRIMEIRO. Uma publicação nova aparece no próximo
//     carregamento, sem "limpar cache", e os arquivos nunca se misturam com versões antigas
//     (a loja não tem etapa de build nem nomes com versão, então misturar seria arriscado).
//     O cache só entra quando a rede falha.
//   • Imagens, fonte e sons da loja: CACHE PRIMEIRO, atualizando por trás. São arquivos que
//     quase nunca mudam; se um for trocado, a versão nova aparece na visita seguinte.
//
// Para forçar todo mundo a baixar tudo de novo, troque o número abaixo.
const VERSION = 'bolab-v4';

// Moldura da loja: o mínimo para abrir sem internet mesmo que a primeira visita tenha sido curta.
// O resto entra no cache conforme é usado. Arquivo que faltar aqui não impede a instalação.
const SHELL = [
  './',
  'manifest.webmanifest',
  'css/tokens.css',
  'css/base.css',
  'css/components.css',
  'css/shell.css',
  'css/home.css',
  'js/boot.js',
  'js/app.js',
  'js/router.js',
  'js/shell.js',
  'js/store.js',
  'js/ui.js',
  'js/icons.js',
  'js/components.js',

  'js/data/site.js',
  'js/data/montar.js',
  'js/data/products.js',
  'js/data/photos.js',
  'js/views/home.js',
  'assets/fonts/plus-jakarta-sans-latin.woff2',
  'assets/logo.webp',
  'assets/logo-mark.webp',
  'assets/icon-192.png',
];

const STATIC = /\.(?:webp|png|jpe?g|gif|svg|avif|ico|woff2?|mp3|ogg|wav|m4a)$/i;

/** Chave no cache: o endereço sem "?…" (a loja não usa parâmetros para escolher arquivo). */
const keyOf = (url) => `${url.origin}${url.pathname}`;

/** Só entra no cache resposta completa, com sucesso e da própria loja. */
const storable = (response) => response && response.status === 200 && response.type === 'basic';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => Promise.all(SHELL.map((path) => fetch(path, { cache: 'no-cache' }).then((res) => (storable(res) ? cache.put(keyOf(new URL(path, self.location.href)), res) : null)).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
      // Deixa o navegador pedir a página enquanto o service worker ainda está acordando.
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
      await self.clients.claim();
    })(),
  );
});

async function put(key, response) {
  if (!storable(response)) return;
  try {
    const cache = await caches.open(VERSION);
    await cache.put(key, response);
  } catch {
    // sem espaço no aparelho: segue sem guardar
  }
}

/** Página e código: rede primeiro; sem rede, o que estiver guardado. */
async function networkFirst(event, key) {
  const { request } = event;
  try {
    const preload = request.mode === 'navigate' ? await event.preloadResponse : null;
    const fresh = preload || (await fetch(request));
    if (storable(fresh)) event.waitUntil(put(key, fresh.clone()));
    return fresh;
  } catch (err) {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(key);
    if (cached) return cached;
    throw err;
  }
}

/** Trecho de um arquivo guardado (áudio pede "Range"); responde 206 como um servidor faria. */
async function slice(cached, range) {
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  const blob = await cached.blob();
  const size = blob.size;
  let start = m && m[1] ? Number(m[1]) : 0;
  let end = m && m[2] ? Number(m[2]) : size - 1;
  if (m && !m[1] && m[2]) {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  }
  if (!(start <= end) || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  end = Math.min(end, size - 1);
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: { 'Content-Type': cached.headers.get('Content-Type') || 'application/octet-stream', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' },
  });
}

/** Imagens, fonte e sons: o guardado responde na hora; a rede atualiza por trás. */
async function cacheFirst(event, key) {
  const { request } = event;
  const range = request.headers.get('range');
  const cache = await caches.open(VERSION);
  const cached = await cache.match(key);
  // O arquivo inteiro é pedido sem "Range", para o cache nunca guardar um pedaço.
  const refresh = () =>
    fetch(key, { credentials: 'same-origin' })
      .then((fresh) => (storable(fresh) ? put(key, fresh.clone()).then(() => fresh) : fresh))
      .catch(() => null);
  if (cached) {
    event.waitUntil(refresh());
    return range ? slice(cached, range) : cached;
  }
  if (range) {
    const full = await refresh();
    if (full && full.status === 200) return slice(full, range);
    return fetch(request);
  }
  const fresh = await fetch(request);
  if (storable(fresh)) event.waitUntil(put(key, fresh.clone()));
  return fresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Fotos externas, ViaCEP e demais origens seguem direto para a rede, sem passar por aqui.
  if (url.origin !== self.location.origin) return;
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;
  const root = new URL('./', self.location.href);
  if (!url.pathname.startsWith(root.pathname)) return; // outro site no mesmo endereço (GitHub Pages)
  // A loja inteira é uma página só: "/", "/index.html" e "/?x=1" são o mesmo arquivo no cache.
  const isStore = url.pathname === root.pathname || url.pathname === `${root.pathname}index.html`;
  const key = isStore ? keyOf(root) : keyOf(url);
  event.respondWith(STATIC.test(url.pathname) ? cacheFirst(event, key) : networkFirst(event, key));
});
