// BOLAB — ponto de entrada: liga a moldura, o roteador e os comportamentos globais.
import { startRouter, revalidate } from './router.js';
import { startShell } from './shell.js';
import { cart, favs, store } from './store.js';
import { toast, on } from './ui.js';
import { getProduct } from './data/products.js';
import { mediaFallback } from './components.js';

/* Foto que não carregou (sem internet, link quebrado) vira um placeholder da marca. */
document.addEventListener(
  'error',
  (ev) => {
    const img = ev.target;
    if (!(img instanceof HTMLImageElement) || !img.hasAttribute('data-fallback')) return;
    const tpl = document.createElement('template');
    tpl.innerHTML = String(mediaFallback(img.className));
    img.replaceWith(tpl.content.firstElementChild);
  },
  true,
);

/* "+" dos cards: adiciona direto ao carrinho (tamanho P para bolos). */
on(document.body, 'click', '[data-add-product]', (ev, el) => {
  ev.preventDefault();
  const p = getProduct(el.dataset.addProduct);
  if (!p) return;
  cart.addProduct(p.id, { size: el.dataset.size || 'p' });
  el.classList.add('is-added');
  setTimeout(() => el.classList.remove('is-added'), 600);
  toast(`${p.name} foi para o carrinho`, { type: 'success', action: { label: 'Ver carrinho', href: '#/carrinho' } });
});

/* Coração de favorito em qualquer lugar do site. */
on(document.body, 'click', '[data-fav]', (ev, el) => {
  ev.preventDefault();
  const id = el.dataset.fav;
  const nowOn = favs.toggle(id);
  document.querySelectorAll(`[data-fav="${CSS.escape(id)}"]`).forEach((b) => {
    b.classList.toggle('is-on', nowOn);
    b.setAttribute('aria-pressed', String(nowOn));
    b.setAttribute('aria-label', nowOn ? 'Remover dos favoritos' : 'Salvar nos favoritos');
  });
  if (nowOn) toast('Salvo nos seus favoritos', { type: 'success', action: { label: 'Ver', href: '#/favoritos' } });
});

/* Contador de quantidade: dispara o evento "qty" com o novo valor. */
on(document.body, 'click', '[data-qty-step]', (_ev, btn) => {
  const box = btn.closest('[data-qty]');
  const out = box.querySelector('output');
  const min = Number(box.dataset.min);
  const max = Number(box.dataset.max);
  const next = Math.max(min, Math.min(max, Number(out.textContent) + Number(btn.dataset.qtyStep)));
  out.textContent = next;
  box.querySelector('[data-qty-step="-1"]').disabled = next <= min;
  box.querySelector('[data-qty-step="1"]').disabled = next >= max;
  box.dispatchEvent(new CustomEvent('qty', { detail: next, bubbles: true }));
});

/* Ao sair da conta em uma tela protegida, o roteador manda para o login.
   O setTimeout dá vez à navegação que a própria tela costuma fazer logo depois de sair. */
store.on('auth', () => setTimeout(revalidate, 0));

startShell();
startRouter();

// No app Android os arquivos já vêm embutidos; o service worker é só para o site.
const IN_APP = location.hostname === 'appassets.androidplatform.net';
if ('serviceWorker' in navigator && location.protocol === 'https:' && !IN_APP) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
