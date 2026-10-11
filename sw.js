// BOLAB — service worker: permite instalar como aplicativo e abrir sem internet.
// Estratégia: sempre busca a versão nova na rede; o cache só entra quando a rede falha.
// Assim uma publicação nova aparece no próximo carregamento, sem precisar "limpar cache".

const CACHE = 'bolab-v3';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(['./', 'index.html', 'manifest.webmanifest', 'assets/logo.webp', 'assets/logo-mark.webp', 'assets/icon-192.png', 'assets/fonts/plus-jakarta-sans-latin.woff2']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
    if (cached) return cached;
    if (request.mode === 'navigate') return cache.match('index.html');
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) event.respondWith(networkFirst(request));
  // Fotos externas e demais origens seguem direto para a rede.
});
