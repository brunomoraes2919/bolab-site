// BOLAB — partida. Arquivo pequeno, sem módulos, pedido logo no começo do index.html com "async":
// baixa junto com o resto e roda assim que chega, sem segurar o desenho da página.
// Fica em arquivo próprio (e não dentro do index.html) porque a política de segurança da página
// (Content-Security-Policy, no index.html) não deixa rodar script escrito dentro do HTML.
//
// Faz três coisas:
//   1. não deixa a loja aparecer dentro de um quadro de outro site;
//   2. se algum arquivo essencial não chegar, mostra "Tentar de novo" em vez da logo para sempre;
//   3. já pede os arquivos da tela que a pessoa está abrindo (estilo, tela e imagem principal).
(function () {
  'use strict';
  var doc = document;

  /* 1. Quadro de outro site (clickjacking): alguém poderia cobrir a loja com outra página e
        induzir cliques em "Pagar". O bloqueio definitivo é um cabeçalho do servidor
        (frame-ancestors), que o GitHub Pages não deixa configurar; aqui a loja simplesmente não
        abre quando está embutida em outro endereço. Páginas da própria loja (lab/) podem embutir. */
  var framed = false;
  try {
    framed = window.top !== window.self && window.top.location.origin !== window.location.origin;
  } catch (err) {
    framed = true; // nem dá para ler o endereço de cima: é de outro site
  }
  if (framed) {
    window.__bolabFramed = true;
    var lockOut = function () {
      var body = doc.body;
      while (body.firstChild) body.removeChild(body.firstChild);
      var box = doc.createElement('div');
      box.className = 'boot';
      var link = doc.createElement('a');
      link.className = 'btn';
      link.href = window.location.href;
      link.target = '_top';
      link.rel = 'noopener';
      link.textContent = 'Abrir a loja BOLAB';
      box.appendChild(link);
      body.appendChild(box);
    };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', lockOut);
    else lockOut();
    return;
  }

  /* 2. A loja não abriu. */
  function bootFail() {
    var boot = doc.getElementById('boot');
    if (!boot || window.__bolabReady || boot.getAttribute('data-failed')) return;
    boot.setAttribute('data-failed', '1');
    while (boot.firstChild) boot.removeChild(boot.firstChild);
    var box = doc.createElement('div');
    box.className = 'boot__fail';
    var img = doc.createElement('img');
    img.src = 'assets/logo-mark.webp';
    img.alt = '';
    img.width = 48;
    img.height = 74;
    var h1 = doc.createElement('h1');
    h1.textContent = 'Não conseguimos abrir a loja';
    var p = doc.createElement('p');
    p.textContent = window.navigator.onLine === false ? 'Você está sem internet. Confira a conexão e tente de novo.' : 'Confira sua conexão com a internet e tente de novo.';
    var btn = doc.createElement('button');
    btn.className = 'btn';
    btn.type = 'button';
    btn.textContent = 'Tentar de novo';
    btn.addEventListener('click', function () {
      window.location.reload();
    });
    box.appendChild(img);
    box.appendChild(h1);
    box.appendChild(p);
    box.appendChild(btn);
    boot.appendChild(box);
  }
  window.bolabBootFail = bootFail;
  window.setTimeout(bootFail, 12000);
  // Um arquivo de script não chegou, ou a loja deu erro antes de ficar pronta.
  window.addEventListener(
    'error',
    function (ev) {
      if (window.__bolabReady) return;
      var t = ev.target;
      if (t === window || (t && t.tagName === 'SCRIPT')) bootFail();
    },
    true,
  );
  window.addEventListener('unhandledrejection', function () {
    if (!window.__bolabReady) bootFail();
  });

  /* 3. Arquivos da tela de entrada. A lista completa de telas fica em js/router.js; esta é só
        um atalho para as entradas mais comuns. Se ficar desatualizada nada quebra: o arquivo
        apenas começa a baixar um pouco depois. */
  var ROUTES = [
    // [começo do caminho, folha de estilo, telas, imagem principal]
    ['/cardapio', 'catalog', ['catalog']],
    ['/produto/', 'catalog', ['product']],
    ['/favoritos', 'catalog', ['favorites']],
    ['/carrinho', 'cart', ['cart']],
    ['/checkout', 'cart', ['cart', 'checkout']],
    ['/pedidos', 'cart', ['cart', 'order', 'orders']],
    ['/pedido/', 'cart', ['cart', 'order']],
    ['/entrar', 'account', ['auth']],
    ['/conta', 'account', ['auth', 'account']],
    ['/atendimento', 'account', ['auth', 'support']],
    ['/monte-seu-bolo', 'customizer', []],
  ];
  // Se trocar a imagem do primeiro banner do início (PROMOS em js/views/home.js), troque aqui também.
  var HOME = ['/', 'home', ['home'], 'assets/img/cz-morango.webp'];

  function hint(rel, href, as) {
    var link = doc.createElement('link');
    link.rel = rel;
    if (as) link.as = as;
    link.href = href;
    doc.head.appendChild(link);
  }

  var path = (window.location.hash.replace(/^#/, '') || '/').split('?')[0];

  // Telas de entrada sem a moldura completa: o css/shell.css não guarda lugar para o que elas não têm.
  if (path.indexOf('/monte-seu-bolo') === 0) doc.documentElement.setAttribute('data-entry', 'immersive');
  else if (path.indexOf('/entrar') === 0 || path.indexOf('/checkout') === 0) doc.documentElement.setAttribute('data-entry', 'focus');
  var entry = path === '/' ? HOME : null;
  for (var i = 0; i < ROUTES.length && !entry; i++) {
    if (path.indexOf(ROUTES[i][0]) === 0) entry = ROUTES[i];
  }
  if (entry) {
    hint('preload', 'css/' + entry[1] + '.css', 'style');
    for (var j = 0; j < entry[2].length; j++) hint('modulepreload', 'js/views/' + entry[2][j] + '.js');
    if (entry[3]) hint('preload', entry[3], 'image');
  }
})();
