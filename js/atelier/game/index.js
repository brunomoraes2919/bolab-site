// BOLAB — Ateliê: o Jogo (encomendas, figurinhas e modos de brincar). Contrato em js/atelier/README.md §4.
//
//   import { mountGame } from '../atelier/game/index.js';
//   const game = mountGame({
//     root,        // o elemento .cz da tela (palco + painel). O jogo põe o botão "Jogar" e a comanda sobre o palco
//                  // (.cz-stage) e abre a sua aba POR CIMA do painel de opções (.cz-panel): o bolo continua à vista.
//                  // Sem .cz-panel (outra página), a aba vira uma folha presa ao rodapé.
//     bus,         // js/atelier/bus.js: o jogo OUVE tudo (figurinhas, comanda) e EMITE game.start / game.score / game.sticker / game.end
//     bo,          // a Bô (createBo): o jogo usa bo.say(); sem ela, as falas aparecem como texto na cena da entrega
//     getConfig,   // () => configuração atual do bolo
//     setConfig,   // (config, { by: 'game' }) => a tela troca o bolo da bancada (bolo em branco da encomenda; volta do bolo guardado)
//     getPrice,    // () => preço que a tela está cobrando (opcional; sem ele vale priceOf(config))
//     goto,        // (idDaEtapa) => vai para uma etapa: 'formato' ao aceitar, 'resumo' em "Quer este bolo de verdade?"
//     openSheet,   // ({ title, body, footer }) => { el, close, closed }: diálogo da tela (opcional; padrão: openDialog de js/ui.js)
//     audio,       // não é usado direto: o som reage aos eventos game.* do barramento
//   });
//   game.open()            abre a aba "Jogar"            game.startOrder(id?)   começa uma encomenda (sem id: a próxima)
//   game.stop()            sai da encomenda (modo livre) game.state()           cópia do que está guardado
//   game.destroy()         tira tudo da tela             (extras: close(), openAlbum(), deliver(), current())
//
// O jogo NUNCA mexe em preço, prazo, carrinho ou pedido: só lê o bolo, chama setConfig (bolo da bancada) e goto.
// Sem XP, sem níveis numéricos, sem moedas, sem ranking, sem sequência diária que pune.
import { html, raw, openDialog } from '../../ui.js';
import { normalizeConfig, priceOf } from '../../customizer/pricing.js';
import { POOLS } from '../bo/lines.js';
import { ORDERS, getOrder, dailyOrder, dayKey, flashOrder, blankCake, FLASH_SECONDS } from './orders.js';
import { scoreOrder, hintOf } from './score.js';
import { STICKERS, getSticker, countEvent, earnedBy } from './stickers.js';
import { createStore, gameSummary } from './state.js';
import { gameLine } from './falas.js';
import { portraitSvg, stickerSvg, iconSvg } from './art.js';
import { hubView, briefView, comandaView, sceneView, albumView, stickerDetail, reactionOf } from './views.js';

export { scoreOrder, hintOf } from './score.js';
export { ORDERS, getOrder, dailyOrder, flashOrder, blankCake } from './orders.js';
export { STICKERS } from './stickers.js';
export { STORE_KEY } from './state.js';

const CSS_ID = 'ag-css';
function ensureCss() {
  if (document.getElementById(CSS_ID)) return;
  const link = document.createElement('link');
  link.id = CSS_ID;
  link.rel = 'stylesheet';
  link.href = new URL('../../../css/atelier-game.css', import.meta.url).href;
  document.head.append(link);
}

const TITLES = { hub: 'Jogar', brief: 'Encomenda', comanda: 'Comanda', scene: 'Entrega', album: 'Álbum de figurinhas' };
/** Eventos do barramento que podem ter mudado o bolo (a comanda confere de novo). */
const REFRESH_ON = new Set(['change', 'open', 'fit', 'step', 'reveal', 'gesture', 'bo.action', 'cart']);

export function mountGame({ root, bus = null, audio = null, bo = null, getConfig, setConfig = null, getPrice = null, goto = null, openSheet = null, launcher = true, speak = true, storage, now = () => new Date() } = {}) {
  if (!root || typeof getConfig !== 'function') throw new Error('mountGame precisa de { root, getConfig }.');
  void audio; // o som ouve game.* no barramento
  ensureCss();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = storage === undefined ? createStore() : createStore({ storage });
  const st = () => store.state;
  const stage = root.matches?.('.cz-stage') ? root : root.querySelector('.cz-stage') || root;
  // a aba do jogo cobre o painel de opções (fica dentro dele, por cima); sem painel à vista, vira folha presa ao rodapé
  const optionsPanel = (root.matches?.('.cz') ? root : root.closest?.('.cz') || root).querySelector('.cz-panel');
  const host = optionsPanel || root;
  const sheet = typeof openSheet === 'function' ? openSheet : openDialog;
  const timers = new Set();
  const later = (fn, ms) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
    return t;
  };
  let alive = true;

  /* ───────── elementos ───────── */
  const layer = document.createElement('div');
  layer.className = 'ag';
  layer.innerHTML = String(html`
    <button type="button" class="ag-launch" data-ag-open data-bo-avoid aria-haspopup="dialog" ${launcher ? '' : raw('hidden')}>${raw(iconSvg('jogar'))}<span>Jogar</span><i class="ag-dot" data-ag-dot hidden></i></button>
    <button type="button" class="ag-hud" data-ag-hud data-bo-avoid aria-haspopup="dialog" hidden></button>
    <div class="ag-tick" data-ag-tick aria-hidden="true"></div>
    <button type="button" class="ag-toast" data-ag-toast hidden></button>
    <div class="sr-only" aria-live="polite" data-ag-live></div>
  `);
  stage.append(layer);
  const panel = document.createElement('section');
  panel.className = `ag-panel ${optionsPanel ? '' : 'ag-panel--float'}`;
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Jogar');
  panel.tabIndex = -1;
  panel.innerHTML = String(html`
    <header class="ag-head">
      <button type="button" class="ag-iconbtn" data-ag-act="back" aria-label="Voltar para as encomendas" hidden>${raw(iconSvg('voltar'))}</button>
      <h2 data-ag-title>Jogar</h2>
      <div class="ag-tabs" role="tablist" aria-label="Jogar" data-ag-tabs>
        <button type="button" role="tab" id="ag-tab-hub" aria-controls="ag-body" data-ag-act="tab" data-tab="hub">Encomendas</button>
        <button type="button" role="tab" id="ag-tab-album" aria-controls="ag-body" data-ag-act="tab" data-tab="album">Álbum <span data-ag-count></span></button>
      </div>
      <button type="button" class="ag-iconbtn" data-ag-act="close" aria-label="Fechar e voltar ao bolo">${raw(iconSvg('x'))}</button>
    </header>
    <div class="ag-body" id="ag-body" data-ag-body tabindex="-1"></div>
  `);
  host.append(panel);
  const $ = (sel, from = layer) => from.querySelector(sel);
  const el = { launch: $('[data-ag-open]'), dot: $('[data-ag-dot]'), hud: $('[data-ag-hud]'), tick: $('[data-ag-tick]'), toast: $('[data-ag-toast]'), live: $('[data-ag-live]'), body: $('[data-ag-body]', panel), title: $('[data-ag-title]', panel), back: $('[data-ag-act="back"]', panel), tabs: $('[data-ag-tabs]', panel), count: $('[data-ag-count]', panel) };

  /* ───────── estado da sessão ───────── */
  let view = null; // 'hub' | 'brief' | 'comanda' | 'scene' | 'album' | null (aba fechada)
  let viewData = null;
  let order = null; // a encomenda em andamento (objeto de orders.js)
  let result = null; // a última conferência (scoreOrder)
  let lastKey = '';
  let ready = false; // tudo marcado na comanda (para a Bô avisar uma vez só)
  let overTold = 0;
  let timeTold = false;
  let clock = null;
  let pendingScore = null; // game.score que espera a cena aparecer
  let sceneStickers = null; // figurinhas ganhas durante a entrega (vão para a cena, não para o aviso)
  let opener = null;
  let inertEls = [];
  let rapid = false; // modo rápido da tela: o jogo sai da frente
  /** Só avisa (aviso de figurinha, fala da Bô, som) quem já abriu o jogo: quem veio comprar não é interrompido. */
  const quiet = () => rapid || !st().intro;

  const emit = (type, detail) => {
    try {
      bus?.emit?.(type, detail);
    } catch (err) {
      console.error('[jogo] barramento falhou:', err);
    }
  };
  const config = () => {
    try {
      return normalizeConfig(getConfig());
    } catch {
      return normalizeConfig(null);
    }
  };
  const price = () => {
    try {
      const p = Number(getPrice?.());
      return Number.isFinite(p) && p > 0 ? p : undefined;
    } catch {
      return undefined;
    }
  };
  const applyConfig = (cfg) => {
    try {
      setConfig?.(normalizeConfig(cfg), { by: 'game' });
    } catch (err) {
      console.error('[jogo] a tela não aceitou o bolo:', err);
    }
  };
  const go = (id) => {
    try {
      goto?.(id);
    } catch (err) {
      console.error('[jogo] a tela não mudou de etapa:', err);
    }
  };
  const announce = (text) => {
    el.live.textContent = '';
    later(() => alive && (el.live.textContent = text), 40);
  };

  /**
   * A Bô fala (pelo grupo gravado, quando ela já o tem; senão, texto no balão). Devolve o texto dito.
   * soft: fala de passagem (figurinha, "está pronto", orçamento): não entra por cima de outra fala do jogo.
   */
  let lastSaid = 0;
  function say(group, text = '', { soft = false } = {}) {
    if (soft && Date.now() - lastSaid < 6000) return '';
    const line = gameLine(group, st().lines);
    st().lines += 1;
    const said = text || line?.text || '';
    lastSaid = Date.now();
    if (speak && bo?.say && said) {
      try {
        if (POOLS[group] && !text) bo.say(group);
        else bo.say({ text: said, mood: line?.mood || 'neutra' });
      } catch (err) {
        console.error('[jogo] a Bô não falou:', err);
      }
    }
    return said;
  }

  /* ───────── encomenda em andamento ───────── */
  function resolveOrder(cur) {
    if (!cur) return null;
    if (cur.mode === 'flash') return flashOrder(cur.seed);
    return getOrder(cur.id);
  }
  const secondsLeft = () => (st().current?.mode === 'flash' ? Math.max(0, FLASH_SECONDS - Math.floor((Date.now() - st().current.startedAt) / 1000)) : null);

  function refresh(force = false) {
    if (!order) return;
    const cfg = config();
    const p = price();
    const key = `${JSON.stringify(cfg)}|${p ?? ''}`;
    if (!force && key === lastKey) return;
    lastKey = key;
    const prev = result;
    result = scoreOrder(order, cfg, { price: p });
    if (prev) {
      // o que acabou de ficar pronto: um aviso curto ao lado da comanda
      const was = new Map(prev.checks.map((c) => [c.id, c.ok]));
      const done = result.checks.find((c) => c.ok && was.get(c.id) === false && c.kind !== 'bo');
      const lost = result.checks.find((c) => !c.ok && was.get(c.id) === true && c.kind !== 'bo');
      if (done) tick(done, true);
      else if (lost) tick(lost, false);
      if (result.over && !prev.over && Date.now() - overTold > 20000) {
        overTold = Date.now();
        say('jogo.orcamento', '', { soft: true });
      }
    }
    const nowReady = result.missing.length === 0;
    if (nowReady && !ready && prev) say('jogo.pronto', '', { soft: true });
    ready = nowReady;
    paintHud();
    if (view === 'comanda') render();
  }
  let refreshRaf = 0;
  const scheduleRefresh = () => {
    cancelAnimationFrame(refreshRaf);
    refreshRaf = requestAnimationFrame(() => alive && refresh());
  };

  let tickTimer = 0;
  function tick(check, ok) {
    const label = check.kind === 'nao' ? `sem ${check.t}` : check.t;
    el.tick.innerHTML = String(html`<i>${raw(iconSvg(ok ? 'ok' : 'falta'))}</i><span>${label}</span>`);
    el.tick.classList.toggle('is-lost', !ok);
    el.tick.classList.add('is-on');
    clearTimeout(tickTimer);
    timers.delete(tickTimer);
    tickTimer = later(() => el.tick.classList.remove('is-on'), 2200);
    announce(`${label}: ${ok ? 'feito' : 'saiu do bolo'}`);
  }

  function paintHud() {
    paintLauncherLabel();
    // durante a cena da entrega a comanda sai do palco: a vez é do cliente
    const on = Boolean(order && result) && view !== 'scene';
    el.hud.hidden = !on;
    el.launch.hidden = Boolean(order) || !launcher || rapid;
    if (!on) return;
    const total = result.checks.length;
    const done = total - result.missing.length;
    const secs = secondsLeft();
    const state = result.missing.length === 0 ? 'ready' : result.over ? 'over' : '';
    el.hud.dataset.state = state;
    const label = state === 'ready' ? 'Entregar!' : `${done} de ${total}`;
    el.hud.setAttribute('aria-label', `Comanda de ${order.cliente.nome}: ${done} de ${total} itens prontos${result.over ? ', acima do orçamento' : ''}${secs != null ? `, ${secs} segundos no relógio` : ''}. Abrir a comanda.`);
    el.hud.innerHTML = String(html`
      <span class="ag-hud__face">
        ${raw(portraitSvg(order.cliente.retrato, state === 'ready' ? 'feliz' : 'neutro', { size: 36 }))}
        ${secs != null ? html`<span class="ag-hud__clock ${secs <= 0 ? 'is-done' : secs <= 10 ? 'is-low' : ''}" data-ag-clock aria-hidden="true">${secs}</span>` : ''}
      </span>
      <span class="ag-hud__body">
        <strong>${label}</strong>
        <span class="ag-hud__bar" aria-hidden="true"><i style="width:${Math.round((done / total) * 100)}%"></i></span>
      </span>
    `);
  }

  function startClock() {
    stopClock();
    if (st().current?.mode !== 'flash') return;
    timeTold = secondsLeft() <= 0;
    clock = setInterval(() => {
      if (!alive || !order) return stopClock();
      const secs = secondsLeft();
      const node = el.hud.querySelector('[data-ag-clock]');
      if (node) {
        node.textContent = String(secs);
        node.classList.toggle('is-low', secs > 0 && secs <= 10);
        node.classList.toggle('is-done', secs <= 0);
      }
      if (secs <= 0 && !timeTold) {
        timeTold = true;
        say('jogo.tempo');
        announce('O relógio zerou. Termine com calma.');
        if (view === 'comanda') render();
      }
    }, 500);
  }
  function stopClock() {
    clearInterval(clock);
    clock = null;
  }

  function begin(cur, { fresh = false } = {}) {
    order = resolveOrder(cur);
    if (!order) {
      st().current = null;
      return;
    }
    result = null;
    lastKey = '';
    ready = false;
    refresh(true);
    startClock();
    if (fresh) store.save();
  }

  /**
   * Começa uma encomenda. Sem `id`: a próxima do caderno que ainda não tem estrela.
   * opts: { mode: 'order' | 'daily' | 'flash', keep: true = usa o bolo que está na bancada }
   */
  function startOrder(id, { mode = 'order', keep = false } = {}) {
    if (!alive) return null;
    flushScore();
    const s = st();
    const today = dayKey(now());
    let next = null;
    if (mode === 'daily') next = dailyOrder(now());
    else if (mode === 'flash') next = flashOrder(s.flash.n);
    else next = getOrder(id) || ORDERS.find((o) => !s.orders[o.id]) || ORDERS[0];
    if (!next) return null;
    // o bolo livre da pessoa fica guardado (só o primeiro: trocar de encomenda não guarda bolo de encomenda)
    if (!s.current && !s.parked) s.parked = config();
    s.current = { mode, id: next.id, tries: 0, hinted: false, ...(mode === 'daily' ? { day: today } : {}), ...(mode === 'flash' ? { seed: next.seed, startedAt: Date.now() } : {}) };
    s.intro = true;
    if (!keep) applyConfig(blankCake());
    closePanel({ focus: false });
    begin(s.current, { fresh: true });
    emit('game.start', { id: next.id, title: `${next.ocasiao}: ${next.cliente.nome}`, brief: next.pedido, mode, level: next.nivel });
    say(mode === 'daily' ? 'jogo.dia' : mode === 'flash' ? 'jogo.relampago' : 'jogo.inicio');
    announce(`Encomenda de ${next.cliente.nome} aceita. A comanda fica sobre o bolo.`);
    if (!keep) go('formato');
    later(() => alive && el.hud.focus({ preventScroll: true }), 60);
    return next.id;
  }

  /** Sai da encomenda sem nota. restore: devolve à bancada o bolo que a pessoa estava montando antes. */
  function leave({ restore = true, quiet = false } = {}) {
    flushScore();
    const s = st();
    const was = order;
    stopClock();
    order = null;
    result = null;
    s.current = null;
    if (restore && s.parked) {
      applyConfig(s.parked);
      if (!quiet) say('jogo.livre');
    }
    if (restore) s.parked = null;
    store.save();
    paintHud();
    paintLauncher();
    return was;
  }

  function stop() {
    if (!order) return;
    const cur = st().current;
    emit('game.end', { id: order.id, stars: 0, mode: cur?.mode || 'order', abandoned: true });
    leave();
    if (view) openPanel('hub');
  }

  /** Entrega o bolo: dá a nota, guarda, emite game.score / game.end e mostra a cena. */
  function deliver() {
    if (!order || !alive) return null;
    const s = st();
    const cur = s.current;
    const r = scoreOrder(order, config(), { price: price() });
    const today = dayKey(now());
    let improved = false;
    let tries = 1;
    if (cur.mode === 'flash') {
      s.flash.n += 1;
      s.flash.best = Math.max(s.flash.best, r.stars);
      cur.tries += 1;
      tries = cur.tries;
    } else {
      const old = s.orders[order.id];
      tries = (old?.tries || 0) + 1;
      improved = Boolean(old) && r.stars > old.stars;
      s.orders[order.id] = { stars: Math.max(old?.stars || 0, r.stars), tries, day: !old || r.stars > old.stars ? today : old.day };
      if (cur.mode === 'daily') {
        if (s.daily.last !== cur.day) {
          s.daily.count += 1;
          s.daily.last = cur.day;
          s.daily.stars = r.stars;
        } else s.daily.stars = Math.max(s.daily.stars, r.stars);
      }
    }
    const inTime = cur.mode === 'flash' ? secondsLeft() > 0 : undefined;
    stopClock();
    store.save();
    const detail = { id: order.id, stars: r.stars, parts: r.parts, notes: r.notes, mode: cur.mode, level: order.nivel, tries, improved, price: r.price, budget: r.budget, surprise: r.surprise?.ok === true, ...(inTime === undefined ? {} : { inTime }) };
    sceneStickers = [];
    pendingScore = { detail, order, stars: r.stars, mode: cur.mode };
    const boLine = say('jogo.entrega');
    const shown = { order, result: r, mode: cur.mode, stickers: sceneStickers, boLine: bo ? '' : boLine };
    openPanel('scene', shown);
    announce('Entregando o bolo.');
    // o suspense da caixa fechando; depois as estrelas (é aí que o som e a Bô reagem)
    later(revealScene, reduceMotion ? 120 : 1100);
    return r;
  }

  /** Emite a nota que estava esperando a cena (também quando a pessoa fecha antes de ver). */
  function flushScore() {
    const p = pendingScore;
    if (!p) return;
    pendingScore = null;
    emit('game.score', p.detail);
    emit('game.end', { id: p.detail.id, stars: p.stars, mode: p.mode });
    store.save();
  }

  function revealScene() {
    if (!alive || view !== 'scene' || !pendingScore) return flushScore();
    const p = pendingScore;
    flushScore();
    const data = viewData;
    const line = p.detail.surprise ? say('jogo.surpresa') : say(`jogo.estrelas.${p.stars}`);
    data.boLine = bo ? '' : line;
    data.stickers = sceneStickers || [];
    sceneStickers = null;
    data.revealed = true;
    render();
    const who = data.order.cliente.nome;
    announce(`${p.stars} de 3 estrelas. ${who}: ${reactionOf(data.order, p.stars)}`);
    paintHud();
  }

  /* ───────── figurinhas ───────── */
  let toastTimer = 0;
  function award(id) {
    const s = st();
    const sticker = getSticker(id);
    if (!sticker || id in s.stickers) return;
    s.stickers[id] = dayKey(now());
    if (!s.fresh.includes(id)) s.fresh.push(id);
    store.save();
    paintLauncher();
    // a figurinha fica guardada de qualquer jeito; sem ter aberto o jogo, só aparece um ponto no botão "Jogar"
    if (quiet() && !order) return;
    emit('game.sticker', { id, name: sticker.name, first: true, secret: Boolean(sticker.secret) });
    if (sceneStickers) {
      sceneStickers.push(sticker); // ganha na entrega: aparece na cena, junto das estrelas
      return;
    }
    if (view === 'scene' && viewData?.revealed) {
      viewData.stickers = [...(viewData.stickers || []), sticker];
      render();
      return;
    }
    el.toast.dataset.id = id;
    el.toast.innerHTML = String(html`${raw(stickerSvg(sticker, { size: 44 }))}<span><small>${sticker.secret ? 'Figurinha secreta' : 'Figurinha nova'}</small><strong>${sticker.name}</strong></span>`);
    el.toast.hidden = false;
    void el.toast.offsetWidth;
    el.toast.classList.add('is-on');
    clearTimeout(toastTimer);
    timers.delete(toastTimer);
    toastTimer = later(() => {
      el.toast.classList.remove('is-on');
      later(() => (el.toast.hidden = !el.toast.classList.contains('is-on')), 260);
    }, 4200);
    announce(`${sticker.secret ? 'Figurinha secreta' : 'Figurinha nova'}: ${sticker.name}`);
    say(sticker.secret ? 'jogo.figurinha.secreta' : 'jogo.figurinha', '', { soft: true });
    if (view === 'album') render();
  }

  function onBus(detail, type) {
    // marcas de som e o meio de um gesto chegam muitas vezes por segundo e não dão figurinha: passam direto
    if (!alive || type === 'game.sticker' || type === 'cue' || (type === 'gesture' && detail?.phase === 'move')) return;
    const s = st();
    try {
      countEvent(s.stats, type, detail || {});
      const got = earnedBy(type, detail || {}, { stats: s.stats, have: new Set(Object.keys(s.stickers)), now: now(), game: gameSummary(s) });
      got.forEach(award);
    } catch (err) {
      console.error('[jogo] figurinhas:', err);
    }
    if (type === 'mode') {
      rapid = detail?.mode === 'rapido';
      paintHud();
    }
    if (REFRESH_ON.has(type)) scheduleRefresh();
    // chegou ao resumo com a comanda incompleta: a Bô dá uma dica (uma vez por encomenda)
    if (type === 'step' && detail?.id === 'resumo' && order && result?.missing.length && s.current && !s.current.hinted) {
      s.current.hinted = true;
      later(() => alive && order && hint(), 900);
    }
    if (type === 'close') closePanel({ focus: false });
  }

  function hint() {
    if (!order) return '';
    refresh(true);
    const m = result.missing[0];
    if (!m) return say('jogo.pronto');
    const group = m.kind === 'orcamento' ? 'jogo.orcamento' : m.kind === 'nao' ? 'jogo.dica.naogosta' : m.kind === 'pessoas' ? 'jogo.dica.pessoas' : m.kind === 'prazo' ? 'jogo.dica.prazo' : m.kind === 'bo' ? 'jogo.dica.combina' : m.part === 'sabor' ? 'jogo.dica.sabor' : 'jogo.dica.visual';
    const text = hintOf(order, result);
    say(group, POOLS[group] ? '' : text);
    return text;
  }

  /* ───────── aba do jogo ───────── */
  function paintLauncherLabel() {
    const n = st().fresh.length;
    el.launch.setAttribute('aria-label', n ? `Jogar. ${n === 1 ? 'Uma figurinha nova' : `${n} figurinhas novas`} no álbum.` : 'Jogar: encomendas e álbum de figurinhas');
  }
  function paintLauncher() {
    paintLauncherLabel();
    const s = st();
    // um ponto discreto no botão: há figurinha nova para ver no álbum (nada de cobrança diária)
    el.dot.hidden = !s.fresh.length;
    el.count.textContent = `${Object.keys(s.stickers).length} de ${STICKERS.length}`;
  }

  function render() {
    if (!view) return;
    const s = st();
    const today = dayKey(now());
    let body = '';
    if (view === 'hub') {
      body = hubView({ state: s, daily: dailyOrder(now()), dailyDone: s.daily.last === today ? s.daily.stars : 0, current: order ? { order, mode: s.current?.mode } : null, flashNext: flashOrder(s.flash.n), hasParked: Boolean(s.parked) });
    } else if (view === 'brief') {
      const o = viewData.order;
      body = briefView({ order: o, mode: viewData.mode, best: viewData.mode === 'flash' ? 0 : s.orders[o.id]?.stars || 0, sameAsCurrent: Boolean(order) && order.id === o.id && s.current?.mode === viewData.mode });
    } else if (view === 'comanda') {
      if (!order || !result) return openPanel('hub');
      body = comandaView({ order, result, seconds: secondsLeft() });
    } else if (view === 'scene') {
      const d = viewData;
      body = sceneView({ order: d.order, result: d.result, stickers: d.revealed ? d.stickers || [] : [], boLine: d.revealed ? d.boLine : '', canBuy: typeof goto === 'function' && d.mode !== 'flash', mode: d.mode, nextLabel: d.mode === 'flash' ? 'Outro relâmpago' : 'Próxima encomenda' });
    } else if (view === 'album') body = albumView({ state: s });
    const keepScroll = el.body.dataset.view === view ? el.body.scrollTop : 0;
    el.body.innerHTML = String(body);
    el.body.dataset.view = view;
    el.body.scrollTop = keepScroll;
    panel.dataset.view = view;
    if (view === 'scene') el.body.querySelector('[data-ag-scene]')?.classList.toggle('is-shown', Boolean(viewData.revealed));
    // o título diz de que encomenda se trata (a do dia e o relâmpago têm nome próprio)
    const kind = view === 'brief' ? viewData.mode : view === 'comanda' ? st().current?.mode : view === 'scene' ? viewData.mode : '';
    const title = kind === 'daily' && view !== 'scene' ? 'Encomenda do dia' : kind === 'flash' && view !== 'scene' ? 'Desafio relâmpago' : TITLES[view];
    el.title.textContent = title;
    const tabbed = view === 'hub' || view === 'album';
    // com abas à vista, o corpo é o painel da aba escolhida
    if (tabbed) {
      el.body.setAttribute('role', 'tabpanel');
      el.body.setAttribute('aria-labelledby', `ag-tab-${view}`);
    } else {
      el.body.removeAttribute('role');
      el.body.removeAttribute('aria-labelledby');
    }
    panel.setAttribute('aria-label', tabbed ? 'Jogar' : `Jogar: ${title}`);
    el.tabs.hidden = !tabbed;
    el.title.hidden = tabbed;
    el.back.hidden = tabbed || view === 'scene';
    el.tabs.querySelectorAll('[role="tab"]').forEach((t) => {
      const on = t.dataset.tab === view;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    paintLauncher();
  }

  function openPanel(next = 'hub', data = null) {
    if (!alive) return;
    const wasClosed = !view;
    if (view === 'scene' && next !== 'scene') flushScore();
    if (view === 'album' && next !== 'album' && st().fresh.length) {
      st().fresh = [];
      store.save();
    }
    view = next;
    viewData = data;
    if (wasClosed) {
      opener = document.activeElement;
      panel.hidden = false;
      void panel.offsetWidth;
      panel.classList.add('is-open');
      // o painel de opções fica atrás da aba: sai do teclado e do leitor de tela enquanto ela está aberta
      inertEls = optionsPanel ? [...optionsPanel.children].filter((n) => n !== panel && !n.inert) : [];
      inertEls.forEach((n) => (n.inert = true));
      el.launch.setAttribute('aria-expanded', 'true');
    }
    if (next === 'hub' && !st().intro) later(() => ((st().intro = true), store.save()), 0);
    el.body.dataset.view = '';
    render();
    paintHud();
    el.body.scrollTop = 0;
    if (wasClosed || next !== 'comanda') (wasClosed ? panel : el.body).focus({ preventScroll: true });
  }

  function closePanel({ focus = true } = {}) {
    if (!view) return;
    flushScore();
    if (view === 'album' && st().fresh.length) {
      st().fresh = [];
      store.save();
    }
    view = null;
    viewData = null;
    panel.classList.remove('is-open');
    inertEls.forEach((n) => (n.inert = false));
    inertEls = [];
    el.launch.setAttribute('aria-expanded', 'false');
    later(() => !view && (panel.hidden = true), reduceMotion ? 0 : 200);
    paintLauncher();
    paintHud();
    if (focus) (order ? el.hud : opener && document.contains(opener) ? opener : el.launch)?.focus?.({ preventScroll: true });
    opener = null;
  }

  function showSticker(id) {
    const s = getSticker(id);
    if (!s) return;
    const day = st().stickers[id];
    sheet({ title: 'Figurinha', label: s.secret && day === undefined ? 'Figurinha secreta' : s.name, body: stickerDetail(s, day) });
  }

  const ACTIONS = {
    close: () => closePanel(),
    back: () => openPanel('hub'),
    tab: (btn) => openPanel(btn.dataset.tab === 'album' ? 'album' : 'hub'),
    brief: (btn) => {
      const o = getOrder(btn.dataset.id);
      if (!o) return;
      if (order && order.id === o.id && st().current?.mode !== 'flash') return openPanel('comanda');
      openPanel('brief', { order: o, mode: 'order' });
    },
    'brief-daily': () => {
      const o = dailyOrder(now());
      if (order && st().current?.mode === 'daily' && order.id === o.id) return openPanel('comanda');
      openPanel('brief', { order: o, mode: 'daily' });
    },
    'brief-flash': () => openPanel('brief', { order: flashOrder(st().flash.n), mode: 'flash' }),
    start: (btn) => startOrder(btn.dataset.id, { mode: btn.dataset.mode || 'order', keep: btn.dataset.keep === '1' }),
    comanda: () => openPanel('comanda'),
    deliver: () => deliver(),
    hint: () => {
      const text = hint();
      const node = el.body.querySelector('[data-ag-hint]');
      if (node) node.textContent = text;
    },
    quit: () => stop(),
    restore: () => {
      leave();
      closePanel();
    },
    retry: () => {
      // a mesma encomenda, com o mesmo bolo na bancada: é só ajustar e entregar de novo
      flushScore();
      const cur = st().current;
      if (cur?.mode === 'flash') {
        cur.startedAt = Date.now(); // os mesmos três desejos, relógio novo
        store.save();
      }
      closePanel({ focus: false });
      begin(st().current);
      // nova tentativa = nova partida para quem ouve o barramento (som, Bô)
      if (order && cur) emit('game.start', { id: order.id, title: `${order.ocasiao}: ${order.cliente.nome}`, brief: order.pedido, mode: cur.mode, level: order.nivel, retry: true });
      el.hud.focus({ preventScroll: true });
    },
    next: () => {
      const mode = viewData?.mode;
      flushScore();
      leave({ restore: false, quiet: true });
      if (mode === 'flash') openPanel('brief', { order: flashOrder(st().flash.n), mode: 'flash' });
      else openPanel('hub');
    },
    free: () => {
      leave();
      closePanel();
    },
    // ponte com a loja, sem empurrar: o bolo da encomenda fica na bancada e a pessoa vai para o resumo de sempre
    buy: () => {
      leave({ restore: false, quiet: true });
      st().parked = null;
      store.save();
      closePanel({ focus: false });
      go('resumo');
    },
    sticker: (btn) => showSticker(btn.dataset.id),
  };

  const onPanelClick = (ev) => {
    const btn = ev.target.closest('[data-ag-act]');
    if (!btn || !panel.contains(btn)) return;
    ACTIONS[btn.dataset.agAct]?.(btn);
  };
  const onKey = (ev) => {
    if (!view) return;
    if (ev.key === 'Escape' && !ev.defaultPrevented && !document.querySelector('.overlay')) {
      ev.preventDefault();
      closePanel();
      return;
    }
    // setas trocam de aba, como em qualquer lista de abas
    if ((ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') && ev.target.closest?.('[role="tab"]')) {
      ev.preventDefault();
      openPanel(view === 'hub' ? 'album' : 'hub');
      el.tabs.querySelector('[aria-selected="true"]')?.focus();
    }
  };
  const open = () => openPanel(order ? 'comanda' : 'hub');
  panel.addEventListener('click', onPanelClick);
  document.addEventListener('keydown', onKey);
  el.launch.addEventListener('click', open);
  el.hud.addEventListener('click', open);
  el.toast.addEventListener('click', () => {
    el.toast.classList.remove('is-on');
    el.toast.hidden = true;
    openPanel('album');
  });
  const offBus = bus?.on?.('*', onBus);
  // sem barramento (ou com uma tela que não avisa tudo), a comanda confere sozinha de tempos em tempos
  const poll = setInterval(() => alive && order && view !== 'scene' && refresh(), 1500);

  /* ───────── partida ───────── */
  if (st().current) begin(st().current);
  paintHud();
  paintLauncher();

  return {
    open,
    close: closePanel,
    /** r5-qa: a aba está aberta? (o "voltar" do Android e o do navegador fecham a aba antes de sair da tela) */
    isOpen: () => Boolean(view),
    openAlbum: () => openPanel('album'),
    startOrder,
    deliver,
    stop,
    /** Uma cópia do que está guardado (encomendas, figurinhas, encomenda em andamento). */
    state: () => JSON.parse(JSON.stringify(st())),
    /** A encomenda em andamento e a conferência dela agora: { order, result } ou null. */
    current: () => (order ? { order, mode: st().current?.mode, result: scoreOrder(order, config(), { price: price() }) } : null),
    destroy() {
      if (!alive) return;
      flushScore();
      alive = false;
      stopClock();
      clearInterval(poll);
      cancelAnimationFrame(refreshRaf);
      timers.forEach(clearTimeout);
      offBus?.();
      document.removeEventListener('keydown', onKey);
      inertEls.forEach((n) => (n.inert = false));
      layer.remove();
      panel.remove();
      store.save();
    },
  };
}
