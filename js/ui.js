// BOLAB — utilitários de interface: template seguro, formatação, toast, modal.
import { icon, setIconWrapper } from './icons.js';

/* ───────── Template HTML seguro ─────────
   html`<p>${texto}</p>` escapa tudo que for interpolado. Para inserir HTML já
   confiável (outro html``, ícones), o valor precisa ser um SafeHtml (html``/raw()). */
class SafeHtml {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

// icon('nome') passa a devolver SafeHtml, então pode ser interpolado direto em html``.
setIconWrapper((s) => new SafeHtml(s));
export { icon };

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

export function raw(s) {
  return new SafeHtml(String(s ?? ''));
}

function toHtml(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof SafeHtml) return v.s;
  if (Array.isArray(v)) return v.map(toHtml).join('');
  return esc(v);
}

export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) out += toHtml(vals[i]);
  });
  return new SafeHtml(out);
}

/* ───────── Formatação ───────── */
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function money(v) {
  return BRL.format(Number(v) || 0);
}

/** "12x de R$ 12,49" — parcela sem juros para ancorar o preço. */
export function installments(v, max = 3) {
  return `${max}x de ${money(v / max)} sem juros`;
}

const DATE_LONG = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const DATE_SHORT = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const DATE_TIME = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Aceita Date, timestamp ou 'AAAA-MM-DD' (interpretado no fuso local). */
export function toDate(v) {
  if (v instanceof Date) return v;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(v);
}

export function isoDate(d) {
  const x = toDate(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function dateLong(v) {
  const s = DATE_LONG.format(toDate(v));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function dateShort(v) {
  return DATE_SHORT.format(toDate(v)).replace('.', '');
}

export function dateTime(v) {
  return DATE_TIME.format(toDate(v)).replace('.', '');
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

export function initials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

/* ───────── Máscaras de digitação ───────── */
export const masks = {
  phone(v) {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : '';
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  },
  cep(v) {
    const d = v.replace(/\D/g, '').slice(0, 8);
    return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
  },
  cpf(v) {
    const d = v.replace(/\D/g, '').slice(0, 11);
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2');
  },
  card(v) {
    return v
      .replace(/\D/g, '')
      .slice(0, 16)
      .replace(/(\d{4})(?=\d)/g, '$1 ');
  },
  expiry(v) {
    const d = v.replace(/\D/g, '').slice(0, 4);
    return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  },
  digits(v) {
    return v.replace(/\D/g, '');
  },
};

/** Liga máscaras a todo input com data-mask="phone|cep|cpf|card|expiry|digits" dentro de root. */
export function bindMasks(root) {
  root.querySelectorAll('input[data-mask]').forEach((el) => {
    const fn = masks[el.dataset.mask];
    if (!fn) return;
    el.addEventListener('input', () => {
      el.value = fn(el.value);
    });
    if (el.value) el.value = fn(el.value);
  });
}

/* ───────── Eventos ───────── */
/** Delegação: on(root, 'click', '[data-action]', (ev, el) => …). */
export function on(root, type, selector, handler) {
  root.addEventListener(type, (ev) => {
    const el = ev.target.closest(selector);
    if (el && root.contains(el)) handler(ev, el);
  });
}

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ───────── Formulários ───────── */
/** Lê os campos nomeados de um <form> como objeto (strings aparadas). */
export function formData(form) {
  const out = {};
  new FormData(form).forEach((v, k) => {
    out[k] = typeof v === 'string' ? v.trim() : v;
  });
  return out;
}

/** Marca um campo como inválido: procura o .field que contém [name=…]. */
export function setFieldError(form, name, message) {
  const input = form.querySelector(`[name="${name}"]`);
  const field = input?.closest('.field');
  if (!field) return;
  field.classList.toggle('is-invalid', Boolean(message));
  let err = field.querySelector('.field__error');
  if (message && !err) {
    err = document.createElement('div');
    err.className = 'field__error';
    field.appendChild(err);
  }
  if (err) err.textContent = message || '';
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

export function clearFieldErrors(form) {
  form.querySelectorAll('.field.is-invalid').forEach((f) => {
    f.classList.remove('is-invalid');
    f.querySelector('[aria-invalid]')?.removeAttribute('aria-invalid');
  });
}

/**
 * Aplica um mapa { campo: mensagem } e foca o primeiro erro.
 * Retorna true quando não há erros.
 */
export function applyErrors(form, errors) {
  clearFieldErrors(form);
  const names = Object.keys(errors).filter((k) => errors[k]);
  names.forEach((n) => setFieldError(form, n, errors[n]));
  if (names.length) form.querySelector(`[name="${names[0]}"]`)?.focus();
  return names.length === 0;
}

export const validators = {
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v),
  phone: (v) => v.replace(/\D/g, '').length >= 10,
  cep: (v) => v.replace(/\D/g, '').length === 8,
  cpf(v) {
    const d = v.replace(/\D/g, '');
    if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
    const calc = (len) => {
      let sum = 0;
      for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
      const r = (sum * 10) % 11;
      return r === 10 ? 0 : r;
    };
    return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
  },
  cardNumber(v) {
    const d = v.replace(/\D/g, '');
    if (d.length < 13) return false;
    let sum = 0;
    let dbl = false;
    for (let i = d.length - 1; i >= 0; i--) {
      let n = Number(d[i]);
      if (dbl) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      dbl = !dbl;
    }
    return sum % 10 === 0;
  },
  expiry(v) {
    const m = v.match(/^(\d{2})\/(\d{2})$/);
    if (!m) return false;
    const month = Number(m[1]);
    const year = 2000 + Number(m[2]);
    if (month < 1 || month > 12) return false;
    const end = new Date(year, month, 1);
    return end > new Date();
  },
};

export function cardBrand(number) {
  const d = String(number).replace(/\D/g, '');
  // Elo e Hipercard primeiro: algumas faixas deles começam com 4 ou 5, como Visa e Mastercard.
  if (/^(4011|4389|4514|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/.test(d)) return 'Elo';
  if (/^(606282|3841)/.test(d)) return 'Hipercard';
  if (/^4/.test(d)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(d)) return 'Mastercard';
  if (/^3[47]/.test(d)) return 'Amex';
  return 'Cartão';
}

/* ───────── Toast ───────── */
function toastHost() {
  let host = document.querySelector('.toast-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast-host';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  return host;
}

/**
 * toast('Adicionado ao carrinho', { type: 'success', action: { label: 'Ver', href: '#/carrinho' } })
 * type: 'info' | 'success' | 'error'
 */
export function toast(message, { type = 'info', action, duration = 3200 } = {}) {
  const host = toastHost();
  while (host.children.length >= 2) host.firstChild.remove();
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  const ic = type === 'success' ? 'check-circle' : type === 'error' ? 'alert' : 'sparkles';
  el.innerHTML = String(html`${icon(ic)}<span>${message}</span>`);
  if (action) {
    const a = document.createElement(action.href ? 'a' : 'button');
    a.textContent = action.label;
    if (action.href) a.href = action.href;
    a.addEventListener('click', () => {
      action.onClick?.();
      close();
    });
    el.appendChild(a);
  }
  host.appendChild(el);
  const timer = setTimeout(close, duration);
  function close() {
    clearTimeout(timer);
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 160);
  }
  return close;
}

/* ───────── Modal / sheet / gaveta ───────── */
const openOverlays = [];

function lockScroll(lock) {
  document.documentElement.style.overflow = lock ? 'hidden' : '';
}

/**
 * Abre um diálogo. No celular sobe como sheet; no desktop é modal central.
 *   const dlg = openDialog({ title, body: html`…`, footer: html`…`, variant: 'drawer' | 'wide', onClose });
 *   dlg.el     → elemento .dialog (para ligar eventos)
 *   dlg.close(resultado)
 *   await dlg.closed → resultado
 */
export function openDialog({ title = '', body = '', footer = '', variant = '', onClose, dismissible = true, label } = {}) {
  const overlay = document.createElement('div');
  overlay.className = `overlay${variant === 'drawer' ? ' overlay--drawer' : ''}`;
  overlay.innerHTML = String(html`
    <div class="dialog ${variant === 'wide' ? 'dialog--wide' : ''}" role="dialog" aria-modal="true" aria-label="${label || title}" tabindex="-1">
      ${title || dismissible
        ? html`<div class="dialog__head">
            <h2>${title}</h2>
            ${dismissible ? html`<button class="icon-btn" data-dialog-close aria-label="Fechar">${icon('x')}</button>` : ''}
          </div>`
        : ''}
      <div class="dialog__body">${body}</div>
      ${footer ? html`<div class="dialog__foot">${footer}</div>` : ''}
    </div>
  `);
  const el = overlay.querySelector('.dialog');
  const previousFocus = document.activeElement;
  let resolve;
  const closed = new Promise((r) => (resolve = r));
  let done = false;

  function close(result) {
    if (done) return;
    done = true;
    overlay.classList.add('is-leaving');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => {
      overlay.remove();
      const i = openOverlays.indexOf(api);
      if (i >= 0) openOverlays.splice(i, 1);
      if (!openOverlays.length) lockScroll(false);
      previousFocus?.focus?.();
    }, 160);
    onClose?.(result);
    resolve(result);
  }

  function onKey(ev) {
    if (openOverlays[openOverlays.length - 1] !== api) return;
    if (ev.key === 'Escape' && dismissible) close();
    if (ev.key === 'Tab') {
      const focusables = [...el.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])')].filter(
        (n) => n.getClientRects().length,
      );
      if (!focusables.length) {
        ev.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      // O foco nunca sai do diálogo: nem pelo fim, nem pelo começo, nem a partir do próprio contêiner.
      if (ev.shiftKey && (active === first || active === el || !el.contains(active))) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && (active === last || !el.contains(active))) {
        ev.preventDefault();
        first.focus();
      }
    }
  }

  // Um duplo clique no botão que abre o diálogo não pode fechá-lo no segundo toque.
  const openedAt = performance.now();
  overlay.addEventListener('mousedown', (ev) => {
    if (ev.target === overlay && dismissible && performance.now() - openedAt > 350) close();
  });
  overlay.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-dialog-close]')) close();
  });
  document.addEventListener('keydown', onKey);

  const api = { el, overlay, close, closed };
  openOverlays.push(api);
  document.body.appendChild(overlay);
  lockScroll(true);
  (el.querySelector('[autofocus]') || el).focus({ preventScroll: true });
  return api;
}

export function closeAllDialogs() {
  [...openOverlays].forEach((d) => d.close());
}

/** Confirmação simples. Resolve true/false. */
export function confirmDialog({ title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false } = {}) {
  const dlg = openDialog({
    title,
    body: html`<p class="muted">${message}</p>`,
    footer: html`
      <button class="btn btn--secondary" data-act="no">${cancelLabel}</button>
      <button class="btn ${danger ? 'btn--dark' : ''}" data-act="yes" autofocus>${confirmLabel}</button>
    `,
  });
  dlg.el.addEventListener('click', (ev) => {
    const act = ev.target.closest('[data-act]')?.dataset.act;
    if (act) dlg.close(act === 'yes');
  });
  return dlg.closed.then(Boolean);
}

/* ───────── Efeitos ───────── */
let revealObserver;

/* Celular, tablet e janelas estreitas (a mesma regra do css/base.css): sem animação de entrada. */
const LITE_MOTION = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(hover: none), (pointer: coarse), (max-width: 899px)') : null;

/**
 * Anima a entrada de todo .reveal dentro de root quando entra na tela.
 * Em telas de toque o conteúdo já nasce visível: lá a animação pesava na rolagem.
 */
export function observeReveal(root = document) {
  if (!('IntersectionObserver' in window) || LITE_MOTION?.matches) {
    root.querySelectorAll('.reveal:not(.is-in)').forEach((el) => el.classList.add('is-in'));
    return;
  }
  revealObserver ||= new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          revealObserver.unobserve(e.target);
        }
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  root.querySelectorAll('.reveal:not(.is-in)').forEach((el) => revealObserver.observe(el));
}

/**
 * Marca cada elemento com .is-away enquanto ele está fora da tela, para o CSS pausar as
 * animações contínuas de dentro dele (ex.: css/home.css). Devolve a função que desliga.
 *   const off = pauseOffscreen(root.querySelectorAll('.spot__stage'));
 */
export function pauseOffscreen(elements) {
  if (!('IntersectionObserver' in window)) return () => {};
  const io = new IntersectionObserver((entries) => entries.forEach((e) => e.target.classList.toggle('is-away', !e.isIntersecting)), { rootMargin: '120px 0px' });
  elements.forEach((el) => io.observe(el));
  return () => io.disconnect();
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/** Chuva de confete leve para momentos de celebração (pedido confirmado). */
export function confetti({ count = 90, duration = 2600 } = {}) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:300';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const colors = ['#D96B82', '#F7D3DC', '#C99A2E', '#FFFFFF', '#E38CA0', '#7A2C40'];
  const parts = Array.from({ length: count }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 120,
    y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 11,
    vy: -Math.random() * 12 - 4,
    w: 6 + Math.random() * 6,
    h: 8 + Math.random() * 8,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.35,
    color: colors[(Math.random() * colors.length) | 0],
  }));
  const start = performance.now();
  (function frame(now) {
    const t = now - start;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts.forEach((p) => {
      p.vy += 0.32;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / duration);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * 0.6);
      ctx.restore();
    });
    if (t < duration) requestAnimationFrame(frame);
    else canvas.remove();
  })(start);
}
