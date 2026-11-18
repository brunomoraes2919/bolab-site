// BOLAB — Ateliê: avisos do palco. UM componente para tudo o que a tela diz por cima do palco:
//
//   controle   aviso de um gesto em curso, com a saída por botão ("Toque no bolo para colocar… · Pronto",
//              "Gire o prato · Alisar para mim", "Gravando…"). Fica enquanto o gesto durar. Um por vez.
//   pergunta   o convite do som ("Ligar o som do ateliê? · Ligar · Agora não"). Entra na fila.
//   dica       as dicas da primeira visita. Entram na fila, esperam a Bô terminar de falar e, se ela voltar a
//              falar com a dica em cartaz, dão a vez a ela e voltam depois (`wait`).
//   recado     aviso curto de uma ação ("Vista: de frente", "Aqui não cabe", "Modo rápido"). Passa na frente e some sozinho.
//
// Lugar: a faixa de baixo do palco (.st-lane), ao lado da Bô — nunca sobre o bolo, nunca sobre o painel de opções.
// Um por vez: aparece o de cima desta pilha — recado › pergunta/dica › controle — e os outros esperam. Enquanto
// houver aviso na faixa, o balão da Bô espera também (css/atelier.css: .cz.has-note).
// O leitor de tela é avisado por quem pede o aviso (host.say); aqui nada é anunciado duas vezes.
//
//   const notes = createNotices({ lane, cz })
//   notes.flash('Vista: de frente')                                   → recado
//   notes.push({ kind: 'ask' | 'tip', icon, title, text, actions, ms, wait, onClose }) → { close(), el }
//   notes.control({ icon, title, text, actions, bar, className } | null) → { el, close(), set({ title, text }) }
//   notes.busy · notes.destroy()
import { html, raw } from '../../ui.js';

const svg = (body) => raw(`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`);
export const NOTE_ICON = {
  sound: svg('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>'),
  swipe: svg('<polyline points="18 8 22 12 18 16"/><polyline points="6 8 2 12 6 16"/><line x1="2" x2="22" y1="12" y2="12"/>'),
  ticket: svg('<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 11v2M13 17v2"/>'),
  menu: svg('<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>'),
  turn: svg('<path d="M21 12a9 9 0 1 1-3-6.700"/><path d="M21 4v5h-5"/>'),
  hand: svg('<path d="M9 11V5.500a1.500 1.500 0 0 1 3 0V11"/><path d="M12 10.500V4.500a1.500 1.500 0 0 1 3 0V11"/><path d="M15 11V6.500a1.500 1.500 0 0 1 3 0V14a7 7 0 0 1-7 7h-.500a6 6 0 0 1-4.700-2.300L3.300 15a1.600 1.600 0 0 1 2.500-2L9 15.500V8.500"/>'),
  close: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
};

const FLASH_MS = 1700;
const GAP_MS = 500; // respiro entre um aviso da fila e o próximo
const OUT_MS = 160;

export function createNotices({ lane, cz }) {
  let alive = true;
  let flashNote = null; // recado em cartaz
  let current = null; // pergunta ou dica em cartaz
  let ctrl = null; // controle de gesto
  const queue = [];
  const timers = new Set();
  const later = (fn, ms) => {
    const t = setTimeout(() => {
      timers.delete(t);
      if (alive) fn();
    }, ms);
    timers.add(t);
    return t;
  };

  /** Monta o cartão de um aviso. `o.node` = elemento pronto (um botão de segurar, por exemplo) que vira o próprio aviso. */
  function build(o) {
    const el = o.node || document.createElement('div');
    el.classList.add('st-note', `st-note--${o.kind}`);
    if (o.className) el.classList.add(...String(o.className).split(' ').filter(Boolean));
    if (!o.node) {
      if (o.kind !== 'info') {
        el.setAttribute('role', 'group');
        el.setAttribute('aria-label', o.label || o.title || 'Aviso do ateliê');
      }
      el.innerHTML = String(html`
        ${o.icon ? html`<span class="st-note__icon" aria-hidden="true">${o.icon}</span>` : ''}
        <p class="st-note__text">${o.title ? html`<strong data-note-title>${o.title}</strong>` : ''}${o.text ? html`<span data-note-text>${o.text}</span>` : ''}</p>
        ${(o.actions || []).length || o.closable
          ? html`<span class="st-note__acts">
              ${(o.actions || []).map(
                // a.attr: gancho fixo escrito no código (ex.: 'data-at-yes'), nunca texto de usuário
                (a, i) => html`<button type="button" class="st-note__btn ${a.go ? 'st-note__btn--go' : ''} ${a.quiet ? 'st-note__btn--quiet' : ''} ${a.className || ''}" data-note-act="${i}" aria-label="${a.aria || a.label}" ${raw(a.attr || '')}>${a.label}</button>`,
              )}
              ${o.closable ? html`<button type="button" class="st-note__x" data-note-close aria-label="${o.closeLabel || 'Fechar o aviso'}">${NOTE_ICON.close}</button>` : ''}
            </span>`
          : ''}
        ${o.bar ? html`<span class="st-note__bar ${o.barClass || ''}" aria-hidden="true"><i></i></span>` : ''}
      `);
      el.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-note-act]');
        if (b) return void o.actions[Number(b.dataset.noteAct)]?.onClick?.(ev);
        if (ev.target.closest('[data-note-close]')) o.onDismiss?.();
      });
    }
    el.dataset.show = 'false';
    lane.append(el);
    return el;
  }

  function leave(el) {
    if (!el) return;
    el.dataset.show = 'false';
    el.dataset.gone = 'true';
    later(() => el.remove(), OUT_MS);
  }

  /** Só o de cima da pilha aparece (uma dica que está dando a vez à Bô não conta). */
  function sync() {
    const top = flashNote || (current && !current.yielding ? current : null) || ctrl;
    for (const n of [flashNote, current, ctrl]) if (n?.el) n.el.dataset.show = String(n === top);
    cz.classList.toggle('has-note', Boolean(top));
    lane.dataset.kind = top ? top.kind : '';
  }
  /** Entra com transição: nasce invisível e é mostrado no quadro seguinte. */
  function enter(item) {
    item.el = build(item);
    requestAnimationFrame(() => alive && sync());
  }

  function pump() {
    if (current || !alive) return;
    const next = queue[0];
    if (!next) return void sync();
    // a dica espera a Bô terminar de falar (no máximo uns 50 s; depois entra assim mesmo)
    if (next.wait && next.wait() && (next.waited = (next.waited || 0) + 1) < 125) return void later(pump, 400);
    queue.shift();
    current = next;
    enter(next);
    next.onShow?.();
    arm(next);
    watch(next);
  }
  /** O tempo de um aviso só corre enquanto ele está à vista. */
  function arm(item) {
    if (!item.ms) return;
    item.since = Date.now();
    item.timer = later(() => closeItem(item, 'time'), item.left ?? item.ms);
  }
  function disarm(item) {
    if (!item.ms || !item.since) return;
    clearTimeout(item.timer);
    item.left = Math.max(1500, (item.left ?? item.ms) - (Date.now() - item.since));
    item.since = 0;
  }
  /** Quem tem `wait` dá a vez sempre que ele volta a valer (a Bô começou a falar): some, e reaparece depois. */
  function watch(item) {
    if (!item.wait) return;
    item.watch = setInterval(() => {
      if (!alive || item !== current) return void clearInterval(item.watch);
      const off = Boolean(item.wait());
      if (off === Boolean(item.yielding)) return;
      item.yielding = off;
      if (off) disarm(item);
      else arm(item);
      item.onYield?.(off);
      sync();
    }, 400);
  }
  function closeItem(item, why = 'close') {
    const i = queue.indexOf(item);
    if (i >= 0) queue.splice(i, 1);
    if (item.done) return;
    item.done = true;
    clearTimeout(item.timer);
    clearInterval(item.watch);
    if (item === current) {
      current = null;
      leave(item.el);
      sync();
      later(pump, GAP_MS);
    }
    item.onClose?.(why);
  }

  return {
    /** Recado curto. Um novo troca o anterior na hora. */
    flash(text, { ms = FLASH_MS, className = '' } = {}) {
      if (!alive || !text) return;
      if (flashNote) {
        clearTimeout(flashNote.timer);
        leave(flashNote.el);
      }
      const item = { kind: 'info', text, className };
      flashNote = item;
      enter(item);
      item.timer = later(() => {
        if (flashNote !== item) return;
        flashNote = null;
        leave(item.el);
        sync();
      }, ms);
    },
    /** Pergunta ou dica: entra na fila. → { close(why), el } */
    push(o) {
      const item = { kind: 'tip', closable: true, ...o };
      item.onDismiss = () => closeItem(item, 'dismiss');
      queue.push(item);
      pump();
      return {
        close: (why) => closeItem(item, why),
        get el() {
          return item.el;
        },
        /** Em cartaz e à vista agora. */
        get shown() {
          return item === current && !item.yielding;
        },
        /** Em cartaz (mesmo que dando a vez à Bô). */
        get live() {
          return item === current;
        },
      };
    },
    /** Controle do gesto em curso (ou null para tirar). Um por vez: o novo troca o anterior. */
    control(o) {
      if (ctrl) {
        leave(ctrl.el);
        ctrl = null;
      }
      if (!o || !alive) {
        sync();
        return null;
      }
      const item = { kind: 'control', ...o };
      ctrl = item;
      enter(item);
      return {
        el: item.el,
        set({ title, text } = {}) {
          const t = item.el.querySelector('[data-note-title]');
          const d = item.el.querySelector('[data-note-text]');
          if (t && title != null) t.textContent = title;
          if (d && text != null) d.innerHTML = String(html`${text}`); // texto simples entra escapado; trecho de html`` passa como está
        },
        close() {
          if (ctrl !== item) return;
          ctrl = null;
          leave(item.el);
          sync();
        },
      };
    },
    get busy() {
      return Boolean(flashNote || current || ctrl);
    },
    get waiting() {
      return queue.length;
    },
    destroy() {
      alive = false;
      clearInterval(current?.watch);
      timers.forEach(clearTimeout);
      timers.clear();
      lane.textContent = '';
      cz.classList.remove('has-note');
    },
  };
}
