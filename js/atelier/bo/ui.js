// BOLAB — Ateliê: a interface da Bô. A mascote flutua num canto do palco, com o balão de fala (a legenda de
// tudo o que ela diz), a ação sugerida como botão, os atalhos "Pergunte à Bô" ao tocar nela e os controles de
// repetir, silenciar e de quanto ela fala.
//
// Caixa: a mascote ocupa um QUADRADO (52 px no celular, 72 px no computador); logo abaixo vem a etiqueta
// "assistente" (.bo-tag). A âncora (.bo-anchor) é a soma dos dois; o balão e os atalhos se prendem a ela.
//
// Posição: por padrão, o canto de baixo à esquerda do palco, desviando do que já mora ali (botões do palco,
// etiqueta de fatias e prazo). A pessoa pode ARRASTAR a Bô para outro lugar: ela gruda na lateral mais próxima
// e a escolha fica guardada. O balão abre para o lado onde há espaço e nunca por cima dos botões do palco.
//
// Acessibilidade: a mascote é um botão; o balão não rouba o foco; o texto vai também para uma região
// aria-live="polite" (some depois de lido, para não duplicar na navegação); Esc fecha balão e atalhos.
import { html, raw } from '../../ui.js';
import { createAvatar } from './avatar.js';

const ICON = {
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  repeat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5"/><path d="M20 4v4.5h-4.5"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5"/><path d="M4 20v-4.5h4.5"/></svg>',
  sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path d="M18 6.5a7.8 7.8 0 0 1 0 11"/></svg>',
  mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9z"/></svg>',
};

const MODE_LABEL = { falante: 'Falante', importa: 'Só o que importa', muda: 'Muda' };
const DEFAULT_AVOID = '[data-cz-tools], [data-cz-meta], [data-cz-bgbar]:not([hidden]), [data-cz-viewbar]:not([hidden]), [data-bo-avoid]';
const TOP_BAR = '.cz-top, [data-bo-top]';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function starsHtml(n, max = 5) {
  return raw(Array.from({ length: max }, (_, i) => `<span class="${i < n ? 'is-on' : ''}">${ICON.star}</span>`).join(''));
}

/**
 * createUi({ mount, chips, modes, avoid, position, onChip, onAction, onMode, onVoice, onReplay, onOpen, onMoved, onHide })
 * → { root, avatar, show, hide, hold, isOpen, setMode, setVoice, setHot, setPresence, setTalking, dot, layout, openPanel, closePanel, destroy }
 */
export function createUi({ mount, chips = [], modes = ['falante', 'importa', 'muda'], avoid = DEFAULT_AVOID, position = null, onChip = () => {}, onAction = () => {}, onMode = () => {}, onVoice = () => {}, onReplay = () => {}, onOpen = () => {}, onMoved = () => {}, onHide = () => {} }) {
  const avatar = createAvatar();
  const root = document.createElement('div');
  root.className = 'bo is-instant';
  root.dataset.layout = 'side';
  root.dataset.side = 'l';
  root.dataset.vert = 'b';
  root.dataset.size = 's';
  root.dataset.presence = 'ativa';
  root.innerHTML = String(html`
    <div class="bo-anchor" data-bo-anchor>
      <div class="bo-bubble" data-bo-bubble data-on="false" role="group" aria-label="Fala da Bô">
        <button type="button" class="bo-ico bo-x" data-bo-close aria-label="Fechar a fala da Bô">${raw(ICON.x)}</button>
        <div class="bo-stars" data-bo-stars hidden></div>
        <p class="bo-bubble__text">
          <span class="bo-bubble__tools">
            <button type="button" class="bo-ico" data-bo-replay aria-label="Repetir a fala" title="Repetir">${raw(ICON.repeat)}</button>
            <button type="button" class="bo-ico" data-bo-voice aria-pressed="true" aria-label="Voz da Bô ligada. Tocar para silenciar." title="Silenciar a voz">${raw(ICON.sound)}</button>
          </span>
          <span data-bo-text></span>
        </p>
        <div class="bo-acts" data-bo-acts></div>
      </div>
      <div class="bo-panel" data-bo-panel data-on="false" role="group" aria-label="Pergunte à Bô">
        <div class="bo-panel__head">
          <span class="bo-panel__title">Pergunte à Bô<small>assistente da BOLAB</small></span>
          <button type="button" class="bo-ico" data-bo-voice aria-pressed="true" aria-label="Voz da Bô ligada. Tocar para silenciar." title="Silenciar a voz">${raw(ICON.sound)}</button>
        </div>
        <div class="bo-chips" data-bo-chips role="group" aria-label="Atalhos">
          ${chips.map((c) => html`<button type="button" class="bo-chip" data-bo-chip="${c.id}">${c.label}</button>`)}
        </div>
        <div class="bo-panel__foot">
          <div class="bo-seg" role="radiogroup" aria-label="Quanto a Bô fala">
            ${modes.map((m) => html`<button type="button" role="radio" aria-checked="false" data-bo-mode="${m}">${MODE_LABEL[m] || m}</button>`)}
          </div>
        </div>
      </div>
      <button type="button" class="bo-avatar" data-bo-avatar aria-expanded="false" aria-label="Bô, assistente da BOLAB. Toque para ver os atalhos; arraste para mudar de lugar.">
        <span class="bo-dot" data-bo-dot></span>
      </button>
      <span class="bo-tag" aria-hidden="true">assistente</span>
    </div>
    <div class="bo-live" aria-live="polite" aria-atomic="true" data-bo-live></div>
  `);
  const $ = (sel) => root.querySelector(sel);
  const el = {
    anchor: $('[data-bo-anchor]'),
    bubble: $('[data-bo-bubble]'),
    text: $('[data-bo-text]'),
    stars: $('[data-bo-stars]'),
    acts: $('[data-bo-acts]'),
    panel: $('[data-bo-panel]'),
    button: $('[data-bo-avatar]'),
    dot: $('[data-bo-dot]'),
    live: $('[data-bo-live]'),
  };
  el.button.prepend(avatar.el);
  mount.append(root);

  let pos = position && typeof position === 'object' ? { ...position } : {}; // { s: { side, fy }, l: { side, fy } }
  const TAG = 17; // a etiqueta "assistente" abaixo da caixa da mascote (1 px de respiro + 16 px)
  const TAIL = 14; // altura da ponta do balão (css/atelier-bo.css)
  const reduceMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  let geo = { x: 8, y: 8, w: 52, h: 52 + TAG, W: 0, H: 0 };
  let hideTimer = 0;
  let hideLeft = 0;
  let hideStart = 0;
  let shownAt = 0;
  let liveTimer = 0;
  let hovering = false;
  let destroyed = false;
  let visTimer = 0;
  let leaving = false;

  /* ───────── posição esperta ───────── */
  const rectsOf = (selector, m) =>
    [...mount.querySelectorAll(selector)]
      .filter((n) => !root.contains(n))
      .map((n) => n.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({ left: r.left - m.left, top: r.top - m.top, right: r.right - m.left, bottom: r.bottom - m.top, width: r.width }));

  function layout({ instant = false } = {}) {
    if (destroyed) return;
    const m = mount.getBoundingClientRect();
    if (!m.width || !m.height) return;
    const W = m.width;
    const H = m.height;
    const size = W >= 640 ? 'l' : 's';
    root.dataset.size = size;
    const w = size === 'l' ? 72 : 52; // a caixa da mascote é quadrada
    const h = w + TAG;
    const headY = w * 0.6; // o meio do rosto dela, medido do alto da âncora
    const margin = size === 'l' ? 20 : 8;
    const gap = size === 'l' ? 12 : 8;
    const lap = parseFloat(getComputedStyle(mount).getPropertyValue('--cz-lap')) || 0; // o painel sobe sobre o palco no celular
    const obstacles = rectsOf(avoid, m);
    const bar = rectsOf(TOP_BAR, m).reduce((b, r) => (r.top < 8 && r.width > W * 0.5 ? Math.max(b, r.bottom) : b), 0);
    const top = bar ? bar + 4 : margin;
    const floor = H - h - margin - lap;
    const saved = pos[size] || {};
    const side = saved.side === 'r' ? 'r' : 'l';
    const x = side === 'l' ? margin : W - w - margin;
    let y = saved.fy != null ? top + clamp(saved.fy, 0, 1) * Math.max(0, floor - top) : floor;
    // desvia do que já mora no palco: sobe até ficar livre (se não der, desce)
    const pad = 4;
    for (let i = 0; i < 6; i++) {
      const hit = obstacles.find((o) => x - pad < o.right && x + w + pad > o.left && y - pad < o.bottom && y + h + pad > o.top);
      if (!hit) break;
      const up = hit.top - h - pad - 2;
      y = up >= top ? up : Math.min(floor, hit.bottom + pad + 2);
      if (up < top) break;
    }
    y = clamp(y, Math.min(top, floor), Math.max(top, floor));
    geo = { x, y, w, h, W, H, top, bottom: H - margin - lap };

    // Para onde o balão abre. O bolo ocupa o meio do palco (mais ou menos metade da largura):
    //  · palco largo → o balão sobe pela faixa livre ao lado do bolo, em cima da Bô ("stack");
    //  · palco estreito (celular) → não há faixa livre: o balão abre ao lado dela, baixo, sobre o pé do prato ("side").
    const sideRoom = (side === 'l' ? W - (x + w) : x) - gap - margin;
    const gutter = W * 0.26 - margin;
    const mode = gutter >= 190 ? 'stack' : sideRoom >= 216 ? 'side' : 'stack';
    const vert = y + h / 2 >= H / 2 ? 'b' : 't';
    const room = Math.floor(gutter >= 190 ? clamp(gutter, 200, 300) : mode === 'side' ? Math.min(sideRoom, 330) : Math.min(W - 2 * margin, 330));
    const panelRoom = gutter >= 190 ? Math.max(room, 288) : room; // duas colunas de fichas pedem um pouco mais
    root.dataset.layout = mode;
    root.dataset.side = side;
    root.dataset.vert = vert;
    root.style.setProperty('--bo-x', `${Math.round(x)}px`);
    root.style.setProperty('--bo-y', `${Math.round(y)}px`);
    root.style.setProperty('--bo-room', `${room}px`);
    root.style.setProperty('--bo-room-panel', `${panelRoom}px`);
    if (mode === 'side') {
      const bx0 = side === 'l' ? x + w + gap : x - gap - room;
      const bx1 = bx0 + room;
      const inBand = obstacles.filter((o) => o.left < bx1 && o.right > bx0 && o.top < y + h + 2 && o.bottom > y - 2);
      // o balão fica na altura do ombro da Bô e sobe (ou desce) para não cobrir os botões do palco
      const lift = inBand.reduce((v, o) => Math.max(v, y + h - (o.top - 8)), TAG + w * 0.12);
      const drop = inBand.reduce((v, o) => Math.max(v, o.bottom + 8 - y), w * 0.12);
      root.style.setProperty('--bo-lift', `${Math.round(lift)}px`);
      root.style.setProperty('--bo-drop', `${Math.round(drop)}px`);
      root.style.setProperty('--bo-shift', '0px');
      root.style.setProperty('--bo-shift-panel', '0px');
      // a ponta do balão fica na altura do rosto dela (ou no canto, quando o balão teve de subir)
      root.style.setProperty('--bo-tail', `${Math.round(Math.max(11, (vert === 'b' ? h - headY - lift : headY - drop) - TAIL / 2))}px`);
    } else {
      const shiftOf = (r) => Math.round(clamp(side === 'l' ? x : x + w - r, margin, Math.max(margin, W - r - margin)) - x);
      root.style.setProperty('--bo-shift', `${shiftOf(room)}px`);
      root.style.setProperty('--bo-shift-panel', `${shiftOf(panelRoom)}px`);
    }
    // ela olha para o bolo (o centro do palco)
    avatar.look(side === 'l' ? 0.7 : -0.7, vert === 'b' ? -0.35 : 0.3);
    if (instant) flashInstant();
    // o palco mudou de tamanho (ou algo entrou nele) com o balão aberto: confere de novo onde ele ficou
    if (el.bubble.dataset.on === 'true') {
      fit(el.bubble);
      syncMore(); // r5-qa
    }
    if (el.panel.dataset.on === 'true') fit(el.panel, { squeeze: false });
  }

  /**
   * Depois que o balão (ou o painel de atalhos) ganha o texto, confere onde ele caiu: se cobre algo que mora no
   * palco (os elementos de `avoid`, entre eles [data-bo-avoid] — botões, etiqueta de fatias, a reserva do bolo) ou
   * sai da área útil, ele vai para a faixa livre mais próxima; se nenhuma comporta o texto inteiro, fica na maior
   * delas com a altura limitada (o texto rola por dentro). Sem faixa livre nenhuma (palco pequeno tomado pelo bolo),
   * fica dentro do palco, na posição em que cobre menos — e some sozinho logo depois.
   * Quando outra folha de estilo posiciona a Bô (a tela, no celular, ancora a mascote no pé do palco), ela manda:
   * aqui nada é mexido.
   */
  function fit(box, { squeeze = true } = {}) {
    box.style.removeProperty('--bo-by');
    box.style.removeProperty('--bo-maxh');
    box.style.removeProperty('--bo-tail-y');
    box.style.removeProperty('--bo-tail-o');
    delete box.dataset.fit;
    if (destroyed || box.dataset.on !== 'true') return;
    const m = mount.getBoundingClientRect();
    const a = el.anchor.getBoundingClientRect();
    if (!m.width || Math.abs(a.left - m.left - geo.x) > 3 || Math.abs(a.top - m.top - geo.y) > 3) return;
    const bw = box.offsetWidth;
    const bh = box.offsetHeight;
    if (!bw || !bh) return;
    const pad = 6;
    const x0 = geo.x + box.offsetLeft;
    const y0 = geo.y + box.offsetTop;
    const lo = Math.min(geo.top ?? 8, geo.y);
    const hi = geo.bottom ?? geo.H - 8;
    // só o que divide a mesma coluna do balão pode ser coberto por ele
    const blocks = rectsOf(avoid, m)
      .filter((o) => o.left < x0 + bw + pad && o.right > x0 - pad)
      .map((o) => [o.top - pad, o.bottom + pad])
      .sort((p, q) => p[0] - q[0]);
    const clear = y0 >= lo && y0 + bh <= hi && !blocks.some(([t, b]) => t < y0 + bh && b > y0);
    if (clear) return;
    const free = [];
    let cur = lo;
    for (const [t, b] of blocks) {
      if (t > cur) free.push([cur, Math.min(t, hi)]);
      cur = Math.max(cur, b);
    }
    if (cur < hi) free.push([cur, hi]);
    const room = free.filter(([t, b]) => b - t >= bh);
    let y;
    let maxh = 0;
    if (room.length) {
      y = room.map(([t, b]) => clamp(y0, t, b - bh)).sort((p, q) => Math.abs(p - y0) - Math.abs(q - y0))[0];
    } else {
      const [t, b] = free.sort((p, q) => q[1] - q[0] - (p[1] - p[0]))[0] || [0, 0];
      if (squeeze && b - t >= 72) {
        // nenhuma faixa comporta o balão inteiro: fica na maior, com a altura limitada (o texto rola por dentro)
        y = t;
        maxh = Math.floor(b - t);
      } else {
        // não há faixa livre que preste (palco pequeno, bolo grande): fica DENTRO do palco, onde cobre menos
        // — e some sozinho logo depois
        const height = Math.min(bh, hi - lo);
        if (height < bh) maxh = Math.floor(height);
        const cover = (yy) => blocks.reduce((sum, [bt, bb]) => sum + Math.max(0, Math.min(yy + height, bb) - Math.max(yy, bt)), 0);
        const want = clamp(y0, lo, hi - height);
        let best = want;
        for (let yy = lo; yy <= hi - height; yy += 6) {
          if (cover(yy) < cover(best) - 0.5 || (Math.abs(cover(yy) - cover(best)) <= 0.5 && Math.abs(yy - want) < Math.abs(best - want))) best = yy;
        }
        y = best;
      }
    }
    box.dataset.fit = 'true';
    box.style.setProperty('--bo-by', `${Math.round(y - geo.y)}px`);
    if (maxh) box.style.setProperty('--bo-maxh', `${maxh}px`);
    // a ponta continua na cabeça da Bô quando ela está ao alcance do balão; senão some
    const head = geo.y + geo.w * 0.6 - y; // o meio do rosto dela, medido do alto do balão
    const height = maxh || bh;
    if (root.dataset.layout === 'side' && head > 11 + TAIL / 2 && head < height - 11 - TAIL / 2) {
      box.style.setProperty('--bo-tail-y', `${Math.round(head - TAIL / 2)}px`);
      box.style.setProperty('--bo-tail-o', '1');
    }
  }

  let instantTimer = 0;
  function flashInstant() {
    root.classList.add('is-instant');
    clearTimeout(instantTimer);
    instantTimer = setTimeout(() => root.classList.remove('is-instant'), 80);
  }

  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => layout({ instant: true })) : null;
  ro?.observe(mount);
  const onResize = () => layout({ instant: true });
  window.addEventListener('resize', onResize);

  // descansa as animações fora da tela ou com a aba escondida
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entries) => entries.forEach((e) => avatar.pause(!e.isIntersecting || document.hidden)), { threshold: 0.01 }) : null;
  io?.observe(el.button);
  const onVisibility = () => avatar.pause(document.hidden);
  document.addEventListener('visibilitychange', onVisibility);

  /* ───────── arrastar ───────── */
  let drag = null;
  let swallowClick = false;
  el.button.addEventListener('pointerdown', (ev) => {
    if (ev.button > 0) return;
    drag = { id: ev.pointerId, sx: ev.clientX, sy: ev.clientY, ox: geo.x, oy: geo.y, moved: false };
    try {
      el.button.setPointerCapture(ev.pointerId); // o arrasto continua mesmo com o dedo fora da mascote
    } catch {
      // sem captura: o arrasto vale enquanto o ponteiro estiver sobre ela
    }
  });
  el.button.addEventListener('pointermove', (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    const dx = ev.clientX - drag.sx;
    const dy = ev.clientY - drag.sy;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 7) return;
      drag.moved = true;
      root.classList.add('is-dragging');
      hide();
      closePanel();
    }
    const nx = clamp(drag.ox + dx, 4, geo.W - geo.w - 4);
    const ny = clamp(drag.oy + dy, 4, geo.H - geo.h - 4);
    drag.x = nx;
    drag.y = ny;
    root.style.setProperty('--bo-x', `${Math.round(nx)}px`);
    root.style.setProperty('--bo-y', `${Math.round(ny)}px`);
  });
  const endDrag = (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.moved) return;
    swallowClick = true;
    setTimeout(() => (swallowClick = false), 350);
    root.classList.remove('is-dragging');
    const size = root.dataset.size;
    const margin = size === 'l' ? 20 : 8;
    const lap = parseFloat(getComputedStyle(mount).getPropertyValue('--cz-lap')) || 0;
    const top = margin;
    const floor = geo.H - geo.h - margin - lap;
    pos = { ...pos, [size]: { side: d.x + geo.w / 2 < geo.W / 2 ? 'l' : 'r', fy: floor > top ? clamp((d.y - top) / (floor - top), 0, 1) : 1 } };
    layout();
    onMoved(pos);
  };
  el.button.addEventListener('pointerup', endDrag);
  el.button.addEventListener('pointercancel', endDrag);

  /* ───────── balão ───────── */
  // r5-qa: o texto que não cabe no balão rola por dentro; `data-more` avisa o CSS (a última linha esmaece) enquanto
  // houver texto abaixo. Conferido a cada fala e a cada rolagem.
  function syncMore() {
    const box = el.text.parentElement;
    // mede o texto em si (os ícones de repetir e silenciar avançam além da caixa e não contam)
    box.dataset.more = String(el.text.getBoundingClientRect().bottom - box.getBoundingClientRect().bottom > 3);
  }
  el.text.parentElement.addEventListener('scroll', syncMore, { passive: true });
  function announce(text) {
    clearTimeout(liveTimer);
    el.live.textContent = '';
    // o intervalo faz o leitor de tela perceber a troca; depois de lido, limpa (não duplica o balão na navegação)
    liveTimer = setTimeout(() => {
      el.live.textContent = text;
      liveTimer = setTimeout(() => (el.live.textContent = ''), 6000);
    }, 60);
  }

  function armHide(ms) {
    clearTimeout(hideTimer);
    hideLeft = ms;
    if (!ms || hovering) return;
    hideStart = Date.now();
    hideTimer = setTimeout(hide, ms);
  }

  /** Mostra uma fala: { text, actions?, stars? }. `hold` = por quanto tempo fica (0 = até fechar ou até a próxima). */
  function show(d, { hold = 0, quiet = false } = {}) {
    closePanel();
    layout();
    shownAt = Date.now();
    el.text.textContent = d.text || '';
    const s = d.stars;
    if (s) {
      el.stars.hidden = false;
      el.stars.innerHTML = String(html`
        <div class="bo-stars__row bo-stars__row--total"><span>Nota da Bô</span><span class="bo-stars__s" role="img" aria-label="${s.estrelas} de 5 estrelas">${starsHtml(s.estrelas)}</span></div>
        <div class="bo-stars__parts">
          ${(s.parts || []).map((p) => html`<div class="bo-stars__row"><span>${p.label}</span><span class="bo-stars__s" role="img" aria-label="${p.v} de 5">${starsHtml(p.v)}</span><span class="bo-stars__n" aria-hidden="true">${p.v}${raw(ICON.star)}</span></div>`)}
        </div>
      `);
    } else {
      el.stars.hidden = true;
      el.stars.textContent = '';
    }
    el.acts.textContent = '';
    (d.actions || []).slice(0, 2).forEach((a, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = i ? 'bo-btn bo-btn--2' : 'bo-btn';
      b.dataset.boAct = String(i);
      b.textContent = a.label;
      el.acts.append(b);
    });
    el.bubble.dataset.on = 'true';
    el.bubble.dataset.plain = String(!s && !(d.actions || []).length); // só texto: some ao primeiro toque no palco
    el.text.parentElement.scrollTop = 0;
    fit(el.bubble);
    syncMore(); // r5-qa
    if (!quiet) {
      const nota = s ? `Nota da Bô: ${s.estrelas} de 5 estrelas. Sabor ${s.sabor}, visual ${s.visual}, equilíbrio ${s.equilibrio}. ` : '';
      const acts = (d.actions || []).length ? ` Sugestão disponível: ${d.actions.map((a) => a.label).join('; ')}.` : '';
      announce(`Bô: ${nota}${d.text || ''}${acts}`);
    }
    armHide(hold);
  }

  function hide() {
    clearTimeout(hideTimer);
    hideLeft = 0;
    if (el.bubble.dataset.on !== 'true') return;
    el.bubble.dataset.on = 'false';
    onHide();
  }

  el.bubble.addEventListener('pointerenter', () => {
    hovering = true;
    if (hideLeft) {
      clearTimeout(hideTimer);
      hideLeft = Math.max(1200, hideLeft - (Date.now() - hideStart));
    }
  });
  el.bubble.addEventListener('pointerleave', () => {
    hovering = false;
    if (hideLeft) armHide(hideLeft);
  });
  el.bubble.addEventListener('focusin', () => clearTimeout(hideTimer));
  el.bubble.addEventListener('focusout', () => hideLeft && armHide(Math.max(2500, hideLeft)));

  /* ───────── atalhos ───────── */
  function openPanel({ focus = false } = {}) {
    hide();
    layout();
    el.panel.dataset.on = 'true';
    fit(el.panel, { squeeze: false }); // os atalhos a pessoa abriu de propósito: mudam de lugar, mas não encolhem
    el.button.setAttribute('aria-expanded', 'true');
    if (focus) root.querySelector('[data-bo-chip]')?.focus();
    onOpen(true);
  }

  function closePanel() {
    if (el.panel.dataset.on !== 'true') return;
    el.panel.dataset.on = 'false';
    el.button.setAttribute('aria-expanded', 'false');
    onOpen(false);
  }

  const isOpen = () => el.panel.dataset.on === 'true';

  root.addEventListener('click', (ev) => {
    const t = ev.target.closest('button');
    if (!t || !root.contains(t)) return;
    if (t === el.button) {
      if (swallowClick) return;
      if (isOpen()) closePanel();
      else openPanel({ focus: ev.detail === 0 }); // aberto pelo teclado: o foco entra nos atalhos
      return;
    }
    if (t.dataset.boChip) {
      closePanel();
      onChip(t.dataset.boChip);
    } else if (t.dataset.boAct != null) onAction(Number(t.dataset.boAct));
    else if (t.dataset.boMode) onMode(t.dataset.boMode);
    else if ('boVoice' in t.dataset) onVoice();
    else if ('boReplay' in t.dataset) onReplay();
    else if ('boClose' in t.dataset) hide();
  });

  root.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (isOpen()) {
      closePanel();
      el.button.focus();
      ev.stopPropagation();
    } else if (el.bubble.dataset.on === 'true') {
      hide();
      ev.stopPropagation();
    }
  });

  const onOutside = (ev) => {
    if (isOpen() && !el.panel.contains(ev.target) && !el.button.contains(ev.target)) closePanel();
    // no celular o palco é pequeno: quando a pessoa volta a mexer (no bolo ou no painel), o balão dá licença —
    // o que é só texto some na hora; o que tem botão de sugestão ou a nota fica mais um instante
    if (root.dataset.size !== 's' || el.bubble.dataset.on !== 'true' || root.contains(ev.target)) return;
    if (Date.now() - shownAt < 900 || root.dataset.talking === 'true') return; // acabou de aparecer, ou ela ainda está falando (o balão é a legenda)
    if (el.bubble.dataset.plain === 'true') hide();
    else armHide(hideLeft ? Math.min(4500, Math.max(1500, hideLeft - (Date.now() - hideStart))) : 4500);
  };
  document.addEventListener('pointerdown', onOutside, true);

  layout({ instant: true });

  return {
    root,
    avatar,
    show,
    hide,
    /** Por quanto tempo o balão ainda fica (depois que ela termina de falar). */
    hold: armHide,
    isOpen,
    layout,
    openPanel,
    closePanel,
    get bubbleOn() {
      return el.bubble.dataset.on === 'true';
    },
    setMode(mode) {
      root.querySelectorAll('[data-bo-mode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.boMode === mode)));
      root.dataset.mode = mode;
    },
    setVoice(on) {
      root.querySelectorAll('[data-bo-voice]').forEach((b) => {
        b.setAttribute('aria-pressed', String(on));
        b.setAttribute('aria-label', on ? 'Voz da Bô ligada. Tocar para silenciar.' : 'Voz da Bô desligada. Tocar para ligar.');
        b.title = on ? 'Silenciar a voz' : 'Ligar a voz';
        b.innerHTML = on ? ICON.sound : ICON.mute; // ícone fixo deste arquivo
      });
    },
    /** Sem tocador de áudio na tela, os botões de repetir e silenciar não aparecem (a Bô fica só no balão). */
    setVoiceAvailable(on) {
      root.querySelectorAll('[data-bo-voice], [data-bo-replay]').forEach((b) => (b.hidden = !on));
    },
    /** Destaca um atalho (ex.: "Nota da Bô" no resumo). */
    setHot(id) {
      root.querySelectorAll('[data-bo-chip]').forEach((b) => b.classList.toggle('is-hot', b.dataset.boChip === id));
    },
    setPresence(p) {
      root.dataset.presence = p;
    },
    setTalking(on) {
      root.dataset.talking = String(Boolean(on));
    },
    dot(on) {
      el.dot.classList.toggle('is-on', Boolean(on));
    },
    /** Mostra ou esconde a Bô. Ela entra com um pulinho e sai encolhendo (sem movimento, troca na hora). */
    setVisible(on) {
      clearTimeout(visTimer);
      if (on) {
        const was = root.hidden || leaving;
        leaving = false;
        root.hidden = false;
        layout({ instant: true });
        if (was) avatar.gesture(reduceMotion() ? '' : 'pop');
        return;
      }
      if (root.hidden || leaving) return;
      hide();
      closePanel();
      if (reduceMotion()) {
        root.hidden = true;
        return;
      }
      leaving = true;
      avatar.gesture('out');
      visTimer = setTimeout(() => {
        leaving = false;
        root.hidden = true;
        avatar.gesture('');
      }, 150);
    },
    destroy() {
      destroyed = true;
      clearTimeout(hideTimer);
      clearTimeout(liveTimer);
      clearTimeout(instantTimer);
      clearTimeout(visTimer);
      ro?.disconnect();
      io?.disconnect();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('pointerdown', onOutside, true);
      avatar.destroy();
      root.remove();
    },
  };
}
