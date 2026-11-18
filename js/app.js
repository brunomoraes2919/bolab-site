// BOLAB — ponto de entrada: liga a moldura, o roteador e os comportamentos globais.
import { startRouter, primeLayout, revalidate } from './router.js';
import { startShell } from './shell.js';
import { auth, cart, favs, store } from './store.js';
import { toast, on, openDialog, closeTopDialog, html, raw, icon, money } from './ui.js';
import { getProduct, sizesOf, priceOf } from './data/products.js';
import { mediaFallback, priceButton, optionGroupHead } from './components.js';

// No app Android os arquivos já vêm embutidos; lá não há service worker, busca nem cartão de compartilhamento.
const IN_APP = location.hostname === 'appassets.androidplatform.net';

/* ───────── Erros que ninguém tratou ─────────
   A loja nunca fica em branco sem explicação:
   • na partida, quem mostra "Tentar de novo" é o js/boot.js;
   • tela que falha ao desenhar vira "Não conseguimos abrir esta tela" (js/router.js);
   • qualquer outro erro vira um aviso com o botão "Recarregar" (o carrinho está salvo).
   Os últimos erros ficam em window.__bolabErrors (sem dados pessoais), para o suporte. */
const problems = (window.__bolabErrors = []);
let lastNotice = 0;

function notifyProblem(err, where = '') {
  const message = String(err?.message || err || 'erro desconhecido').slice(0, 300);
  if (/ResizeObserver loop/.test(message)) return; // aviso inofensivo do navegador
  problems.push({ at: Date.now(), where, message, stack: String(err?.stack || '').slice(0, 900), route: location.hash.split('?')[0] });
  if (problems.length > 20) problems.shift();
  if (!window.__bolabReady || Date.now() - lastNotice < 8000) return;
  lastNotice = Date.now();
  const offline = navigator.onLine === false;
  toast(offline ? 'Você está sem internet. Parte da loja pode não abrir até a conexão voltar.' : 'Algo não saiu como esperado. Se a tela travar, recarregue a loja: seu carrinho continua salvo.', {
    type: 'error',
    duration: 9000,
    action: offline ? undefined : { label: 'Recarregar', onClick: () => location.reload() },
  });
}

window.addEventListener('error', (ev) => {
  if (ev.error || ev.message) notifyProblem(ev.error || ev.message, 'erro');
});
window.addEventListener('unhandledrejection', (ev) => notifyProblem(ev.reason, 'promessa'));
window.addEventListener('bolab:error', (ev) => notifyProblem(ev.detail?.error, ev.detail?.where));

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
      ${optionGroupHead('Tamanho', { hint: 'Escolha 1', required: true, done: true, id: 'sheet-size-t' })}
      <div class="size-sheet" role="radiogroup" aria-labelledby="sheet-size-t">
        ${sizes.map(
          (s, i) => html`
            <label class="option">
              <input type="radio" name="sheet-size" value="${s.id}" ${i === 0 ? raw('checked') : ''} />
              <span class="option__body">
                <span class="option__title">${s.label} · ${s.diameter}</span>
                <span class="option__desc">${s.serves}</span>
              </span>
              <strong class="size-sheet__price">${money(priceOf(p, s.id))}</strong>
              <span class="option__check">${icon('check')}</span>
            </label>
          `,
        )}
      </div>
    `,
    footer: priceButton('Adicionar', priceOf(p, chosen), { attrs: 'data-sheet-add autofocus' }),
  });
  dlg.el.addEventListener('change', (ev) => {
    if (ev.target.name !== 'sheet-size') return;
    chosen = ev.target.value;
    dlg.el.querySelector('[data-sheet-add] .btn__price').textContent = money(priceOf(p, chosen));
  });
  dlg.el.addEventListener('click', (ev) => {
    if (!ev.target.closest('[data-sheet-add]')) return;
    dlg.close();
    addWithFeedback(p, chosen, el);
  });
}

function start() {
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
      b.classList.toggle('is-pop', nowOn && b === el); // o coração tocado "pula"; os outros só mudam
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

  primeLayout();
  startShell();
  startRouter();
  window.__bolabReady = true;

  /* Navegador bloqueando o armazenamento (aba anônima restrita, cota cheia): avisa uma vez. */
  const warnStorage = () =>
    toast('Seu navegador não está deixando salvar dados. O carrinho e os pedidos somem ao fechar esta aba.', { type: 'error', duration: 9000 });
  if (!store.isPersistent()) warnStorage();
  else store.on('storage-fail', warnStorage);

  /* ───────── Sem internet ─────────
     A loja continua aberta (os arquivos já estão no aparelho); uma etiqueta discreta avisa, para
     ninguém achar que as fotos sumiram por defeito. */
  const syncOnline = (announce) => {
    const offline = navigator.onLine === false;
    document.body.classList.toggle('is-offline', offline);
    let bar = document.querySelector('[data-offline]');
    if (offline && !bar) {
      bar = document.createElement('div');
      bar.className = 'offline-bar';
      bar.setAttribute('data-offline', '');
      bar.setAttribute('role', 'status');
      bar.textContent = 'Sem internet';
      bar.title = 'Você pode continuar olhando a loja. As fotos voltam quando a conexão voltar.';
      document.body.appendChild(bar);
    } else if (!offline && bar) {
      bar.remove();
      if (announce) toast('Conexão de volta.', { type: 'success' });
    }
  };
  window.addEventListener('online', () => syncOnline(true));
  window.addEventListener('offline', () => syncOnline(true));
  syncOnline(false);

  /* ───────── Loja em segundo plano / de volta ─────────
     Ao sair da frente (outro app, outra aba, tela apagada): nenhum som continua tocando.
     Quem cria som fora da página (Web Audio, new Audio()) deve ouvir 'bolab:background' e
     'bolab:foreground' na window — ou o próprio 'visibilitychange' — e pausar/retomar.
     Ao voltar: confere se a sessão não venceu enquanto a loja ficou aberta. */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      document.querySelectorAll('audio, video').forEach((media) => {
        if (!media.paused) media.pause();
      });
      window.dispatchEvent(new CustomEvent('bolab:background'));
    } else {
      auth.touch();
      window.dispatchEvent(new CustomEvent('bolab:foreground'));
    }
  });
  window.addEventListener('pageshow', (ev) => {
    if (ev.persisted) auth.touch(); // página devolvida pelo "voltar" do navegador, do jeito que estava
  });

  /* Botão "voltar" do Android (o app chama esta função antes de voltar uma tela): se há uma
     folha ou um diálogo aberto, o "voltar" só fecha o que está por cima. → true se já resolveu. */
  window.bolabBack = () => closeTopDialog();

  /* Service worker: deixa a loja instalável e abrindo sem internet. Só no site (https); em
     localhost fica desligado para não atrapalhar quem está mexendo no código — ?sw=1 liga para teste. */
  const wantsSw = location.protocol === 'https:' || new URLSearchParams(location.search).has('sw');
  if ('serviceWorker' in navigator && wantsSw && !IN_APP) {
    const register = () => navigator.serviceWorker.register('sw.js').catch(() => {});
    // Depois da abertura, para o primeiro carregamento não disputar a rede com ele.
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
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
}

/* Dentro de um quadro de outro site a loja não inicia (clickjacking). A conferência é feita aqui
   mesmo, sem depender do js/boot.js — que troca a tela pelo botão "Abrir a loja BOLAB". */
function framedByOtherSite() {
  try {
    return window.top !== window.self && window.top.location.origin !== window.location.origin;
  } catch {
    return true; // nem dá para ler o endereço de cima: é de outro site
  }
}

if (!framedByOtherSite()) start();
