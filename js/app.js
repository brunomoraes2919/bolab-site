// BOLAB — ponto de entrada: liga a moldura, o roteador e os comportamentos globais.
import { startRouter, revalidate } from './router.js';
import { startShell } from './shell.js';
import { cart, favs, store } from './store.js';
import { toast, on, openDialog, html, raw, icon, money } from './ui.js';
import { getProduct, sizesOf, priceOf } from './data/products.js';
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

/* "+" dos cards. Acessório entra direto; bolo pergunta o tamanho antes
   (ninguém deve descobrir só no carrinho que pediu um bolo de 8 fatias para 20 convidados). */
function addWithFeedback(p, size, el) {
  cart.addProduct(p.id, { size });
  el?.classList.add('is-added');
  setTimeout(() => el?.classList.remove('is-added'), 600);
  toast(`${p.name} foi para o carrinho`, { type: 'success', action: { label: 'Ver carrinho', href: '#/carrinho' } });
}

function openSizeSheet(p, el) {
  const sizes = sizesOf(p);
  let chosen = sizes[0].id;
  const dlg = openDialog({
    title: p.name,
    body: html`
      <p class="muted">Para quantas pessoas é o bolo?</p>
      <div class="size-sheet" role="radiogroup" aria-label="Tamanho">
        ${sizes.map(
          (s, i) => html`
            <label class="option">
              <input type="radio" name="sheet-size" value="${s.id}" ${i === 0 ? raw('checked') : ''} />
              <span class="option__body">
                <span class="option__title">Tamanho ${s.label} · ${s.diameter}</span>
                <span class="option__desc">${s.serves}</span>
              </span>
              <strong class="size-sheet__price">${money(priceOf(p, s.id))}</strong>
              <span class="option__check">${icon('check')}</span>
            </label>
          `,
        )}
      </div>
    `,
    footer: html`<button class="btn btn--block" type="button" data-sheet-add autofocus>Adicionar · ${money(priceOf(p, chosen))}</button>`,
  });
  dlg.el.addEventListener('change', (ev) => {
    if (ev.target.name !== 'sheet-size') return;
    chosen = ev.target.value;
    dlg.el.querySelector('[data-sheet-add]').textContent = `Adicionar · ${money(priceOf(p, chosen))}`;
  });
  dlg.el.addEventListener('click', (ev) => {
    if (!ev.target.closest('[data-sheet-add]')) return;
    dlg.close();
    addWithFeedback(p, chosen, el);
  });
}

on(document.body, 'click', '[data-add-product]', (ev, el) => {
  ev.preventDefault();
  const p = getProduct(el.dataset.addProduct);
  if (!p) return;
  if (sizesOf(p).length && !el.dataset.size) openSizeSheet(p, el);
  else addWithFeedback(p, el.dataset.size || 'p', el);
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

/* "Pular para o conteúdo": leva o foco ao conteúdo sem trocar de tela. */
on(document.body, 'click', '[data-skip]', (ev) => {
  ev.preventDefault();
  const main = document.getElementById('app');
  main.focus();
  main.scrollIntoView();
});

startShell();
startRouter();
window.__bolabReady = true;

/* Navegador bloqueando o armazenamento (aba anônima restrita, cota cheia): avisa uma vez. */
const warnStorage = () =>
  toast('Seu navegador não está deixando salvar dados. O carrinho e os pedidos somem ao fechar esta aba.', { type: 'error', duration: 9000 });
if (!store.isPersistent()) warnStorage();
else store.on('storage-fail', warnStorage);

// No app Android os arquivos já vêm embutidos; o service worker é só para o site.
const IN_APP = location.hostname === 'appassets.androidplatform.net';
if ('serviceWorker' in navigator && location.protocol === 'https:' && !IN_APP) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// No app os arquivos já estão no aparelho: com a loja parada, deixamos o motor 3D lido e
// compilado (sem executar), para o "Monte seu bolo" abrir mais depressa. No site isso não é
// feito: seriam ~650 KB baixados por quem talvez nem abra o personalizador.
if (IN_APP) {
  const warm = () =>
    ['vendor/three/three.module.min.js', 'js/views/customizer.js'].forEach((href) => {
      const link = document.createElement('link');
      link.rel = 'modulepreload';
      link.href = href;
      document.head.appendChild(link);
    });
  setTimeout(warm, 5000); // depois que a primeira tela e as fotos dela já assentaram
}
