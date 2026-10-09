// BOLAB — detalhe e acompanhamento de um pedido (#/pedido/:id).
import { html, raw, icon, money, dateLong, dateTime, plural, on, toast, confirmDialog, copyText, confetti } from '../ui.js';
import { lineThumb, pageHead, notice, totalsSummary } from '../components.js';
import { addresses, auth, orders } from '../store.js';
import { navigate } from '../router.js';
import { SITE } from '../data/site.js';
import { whenStore, keepFocus } from './cart.js';

const STEP_ICONS = { received: 'receipt', paid: 'credit-card', preparing: 'cake', ready: 'gift', out: 'truck', delivered: 'home' };
const BADGE_TONES = { amber: 'badge--amber', gold: 'badge--gold', green: 'badge--green', red: 'badge--red', rose: '' };

const celebrated = new Set(); // pedidos que já ganharam confete nesta visita
const PIX_KEY = 'bolab:pix'; // sessionStorage: pedido → momento em que um novo código Pix foi gerado
const pixRestart = new Map(loadPixRestarts());
const qrOpen = new Set(); // pedidos com o QR Code aberto no celular
const copied = new Set(); // pedidos cujo código acabou de ser copiado

function loadPixRestarts() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(PIX_KEY) || '{}');
    return Object.entries(saved).filter(([, at]) => Number.isFinite(at));
  } catch {
    return [];
  }
}

function savePixRestarts() {
  try {
    sessionStorage.setItem(PIX_KEY, JSON.stringify(Object.fromEntries(pixRestart)));
  } catch {
    // sem armazenamento de sessão: o novo código vale só até recarregar.
  }
}

/* ───────── Compartilhado com a lista de pedidos ───────── */
/** Pedido que saiu de cena: cancelado, ou nunca pago e com a data de entrega já vencida. */
export const isOff = (order) => orders.statusOf(order).canceled;
export const isPickup = (order) => order.delivery.mode === 'pickup';
export const isPixPending = (order) => order.payment.method === 'pix' && !order.payment.paidAt && !isOff(order);

/** Pedido encerrado: entregue, retirado ou cancelado. */
export function isClosed(order) {
  const st = orders.statusOf(order);
  return st.canceled || st.id === 'delivered';
}

/** Selo de situação. → { label, tone, icon } */
export function statusInfo(order) {
  const st = orders.statusOf(order);
  if (st.canceled) return { label: st.label, tone: 'red', icon: st.expired ? 'clock' : 'x' };
  if (!order.payment.paidAt) return { label: order.payment.method === 'pix' ? 'Aguardando Pix' : 'Aguardando pagamento', tone: 'amber', icon: 'clock' };
  if (st.id === 'preparing') return { label: st.label, tone: 'gold', icon: 'cake' };
  if (st.id === 'ready') return { label: st.label, tone: 'green', icon: 'gift' };
  if (st.id === 'out') return { label: st.label, tone: 'green', icon: 'truck' };
  if (st.id === 'delivered') return { label: st.label, tone: 'green', icon: 'check' };
  return { label: st.label, tone: 'rose', icon: 'check' };
}

export function statusBadge(order) {
  const info = statusInfo(order);
  return html`<span class="badge ${BADGE_TONES[info.tone]} ord-badge">${icon(info.icon)}${info.label}</span>`;
}

/** "Sábado, 12 de outubro · 14:00 – 16:00" */
export function whenText(order) {
  return `${dateLong(order.delivery.date)} · ${order.delivery.slot}`;
}

/* ───────── Pix de demonstração ─────────
   Nada aqui é pagável: o desenho imita um QR Code e o código é só ilustrativo. */
function seeded(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
}

function decorativeQr(seed) {
  const N = 29;
  const rnd = seeded(`${seed}|bolab-demo`);
  const corner = (x, y) => (x < 8 && y < 8) || (x >= N - 8 && y < 8) || (x < 8 && y >= N - 8);
  const middle = (x, y) => Math.abs(x - 14) <= 4 && Math.abs(y - 14) <= 4;
  let dots = '';
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const on = rnd() < 0.5;
      if (on && !corner(x, y) && !middle(x, y)) dots += `<circle cx="${x + 0.5}" cy="${y + 0.5}" r="0.42"/>`;
    }
  }
  const eye = (x, y) =>
    `<rect x="${x + 0.6}" y="${y + 0.6}" width="5.8" height="5.8" rx="1.9" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="${x + 2.2}" y="${y + 2.2}" width="2.6" height="2.6" rx="0.9"/>`;
  return raw(
    `<svg viewBox="0 0 ${N} ${N}" fill="currentColor" aria-hidden="true" focusable="false">${dots}${eye(0, 0)}${eye(N - 7, 0)}${eye(0, N - 7)}</svg>`,
  );
}

function demoPixCode(order) {
  const rnd = seeded(order.id);
  const block = () => Math.floor(rnd() * 36 ** 5).toString(36).toUpperCase().padStart(5, '0');
  return `BOLAB.DEMO/${order.id}/${block()}-${block()}-${block()}/CODIGO-ILUSTRATIVO-NAO-PAGAVEL`;
}

function pixExpiresAt(order) {
  return (pixRestart.get(order.id) || order.createdAt) + SITE.pix.expiresMin * 60e3;
}

function clock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/* ───────── Blocos ───────── */
function hero(order, isNew) {
  const first = (order.contact.name || auth.user()?.name || '').trim().split(/\s+/)[0];
  const pickup = isPickup(order);

  if (isOff(order)) {
    return html`
      <div class="ord-headrow">
        ${pageHead(`Pedido ${order.id}`, { back: '/pedidos', sub: `Feito em ${dateTime(order.createdAt)}` })} ${statusBadge(order)}
      </div>
    `;
  }

  if (isNew && isPixPending(order)) {
    return html`
      <header class="ord-hero ord-hero--wait">
        <span class="ord-hero__icon">${icon('pix')}</span>
        <p class="eyebrow">Pedido ${order.id}</p>
        <h1>Falta só o Pix</h1>
        <p class="ord-hero__lead">
          ${first ? `${first}, seu` : 'Seu'} pedido está reservado. Pague em até ${SITE.pix.expiresMin} minutos para garantir
          ${pickup ? 'a retirada' : 'a entrega'} de <strong>${dateLong(order.delivery.date).toLowerCase()}</strong>.
        </p>
      </header>
    `;
  }

  if (isNew) {
    return html`
      <header class="ord-hero ord-hero--ok">
        <span class="ord-hero__icon">${icon('check')}</span>
        <p class="eyebrow">Pedido ${order.id}</p>
        <h1>Pedido confirmado!</h1>
        <p class="ord-hero__lead">
          ${first ? `Obrigado, ${first}!` : 'Obrigado!'} Agora é com a gente: seu pedido é feito à mão, bem perto do dia, para chegar fresquinho.
          ${pickup ? 'Avisamos pelo WhatsApp quando o pedido estiver pronto para retirada.' : 'Avisamos pelo WhatsApp quando o bolo sair para entrega.'} E você acompanha cada etapa por aqui.
        </p>
        <ul class="ord-hero__facts">
          <li>${icon('calendar')}<span>${whenText(order)}</span></li>
          <li>${icon(pickup ? 'store' : 'map-pin')}<span>${pickup ? `Retirada no ${SITE.pickup.name}` : addresses.format(order.address)}</span></li>
          <li>${icon('shield-check')}<span>Código de ${pickup ? 'retirada' : 'entrega'}: <strong>${order.code}</strong></span></li>
        </ul>
      </header>
    `;
  }

  return html`
    <div class="ord-headrow">${pageHead(`Pedido ${order.id}`, { back: '/pedidos', sub: `Feito em ${dateTime(order.createdAt)}` })} ${statusBadge(order)}</div>
  `;
}

function pixPanel(order) {
  const left = pixExpiresAt(order) - Date.now();
  const expired = left <= 0;
  const code = demoPixCode(order);
  const wasCopied = copied.has(order.id);
  const showQr = qrOpen.has(order.id);
  return html`
    <section class="card ord-pix ${expired ? 'is-expired' : ''} ${showQr ? 'is-qr-open' : ''}" aria-labelledby="ord-pix-title">
      <div class="ord-pix__qr" id="ord-pix-qr">
        <div class="ord-qr" role="img" aria-label="${SITE.demo ? 'QR Code de demonstração. Não é possível pagar com ele.' : 'QR Code do Pix'}">
          ${decorativeQr(order.id)}
          <span class="ord-qr__mark"><img src="assets/logo-mark.webp" alt="" width="60" height="92" /></span>
          ${SITE.demo ? html`<span class="ord-qr__ribbon">Demonstração</span>` : ''}
        </div>
        ${SITE.demo ? html`<p class="ord-qr__label">QR Code de demonstração — não realize pagamento</p>` : ''}
      </div>

      <div class="ord-pix__body">
        <div class="ord-pix__top">
          <div>
            <h2 id="ord-pix-title">Pague com Pix</h2>
            <p class="ord-pix__amount">${money(order.totals.total)}</p>
          </div>
          <p class="ord-pix__timer ${expired ? 'is-over' : ''}" data-pix-timer>
            ${icon('clock')}
            <span>${expired ? 'Código expirado' : html`Expira em <strong data-pix-clock>${clock(left)}</strong>`}</span>
          </p>
        </div>

        ${expired
          ? html`
              <div class="ord-pix__expired">
                <p>O prazo deste código terminou, mas o seu pedido continua guardado. Gere um novo código para pagar.</p>
                <button class="btn btn--block" type="button" id="ord-pix-renew" data-pix-renew>${icon('refresh')} Gerar novo código</button>
              </div>
            `
          : html`
              <div class="ord-pix__quick only-mobile">
                <button class="btn btn--lg btn--block ord-pix__copy ${wasCopied ? 'is-copied' : ''}" type="button" id="ord-pix-copy-m" data-pix-copy>
                  ${wasCopied ? '' : icon('copy')}<span>${wasCopied ? 'Código copiado ✓' : 'Copiar código Pix'}</span>
                </button>
                <input class="input ord-pix__codeline" type="text" readonly value="${code}" data-pix-code aria-label="Código Pix copia e cola" />
                <ol class="ord-pix__how">
                  <li><span>Toque em <strong>Copiar código Pix</strong>.</span></li>
                  <li><span>No app do seu banco, escolha <strong>Pix copia e cola</strong>.</span></li>
                  <li><span>Cole e confirme — a aprovação aparece aqui em segundos.</span></li>
                </ol>
              </div>

              <div class="ord-pix__desk only-desktop">
                <ol class="ord-pix__how">
                  <li><span>Abra o app do seu banco e escolha <strong>Pix</strong>.</span></li>
                  <li><span>Aponte a câmera para o QR Code ou cole o código abaixo.</span></li>
                  <li><span>Confirme o valor. A aprovação aparece aqui em segundos.</span></li>
                </ol>
                <div class="field">
                  <label for="ord-pix-code">Pix copia e cola</label>
                  <div class="ord-pix__code">
                    <input class="input" id="ord-pix-code" type="text" readonly value="${code}" data-pix-code />
                    <button class="btn btn--secondary ${wasCopied ? 'is-copied' : ''}" type="button" id="ord-pix-copy" data-pix-copy>
                      ${wasCopied ? '' : icon('copy')}<span>${wasCopied ? 'Copiado ✓' : 'Copiar'}</span>
                    </button>
                  </div>
                </div>
              </div>

              <button class="ord-pix__qr-toggle only-mobile" type="button" id="ord-pix-qr-toggle" data-pix-qr aria-expanded="${showQr ? 'true' : 'false'}" aria-controls="ord-pix-qr">
                ${icon('qr')}
                <span class="ord-pix__qr-text">${showQr ? html`<span>Ocultar QR Code</span>` : html`<span>Pagar por outro aparelho?</span> <span>Ver QR Code</span>`}</span>
                ${icon('chevron-down')}
              </button>
            `}

        ${SITE.demo
          ? html`
              <div class="notice notice--amber ord-pix__demo">
                ${icon('info')}
                <div>
                  <p><strong>Modo demonstração:</strong> o código e o QR Code são ilustrativos e nada é cobrado. Use o botão abaixo para ver o pedido ser confirmado.</p>
                  <button class="btn btn--block ord-pix__sim" type="button" id="ord-pix-pay" data-pix-pay>${icon('pix')} Simular pagamento do Pix</button>
                </div>
              </div>
            `
          : ''}
      </div>
    </section>
  `;
}

function timeline(order, st) {
  if (st.expired) {
    return html`
      <section class="card ord-box ord-box--track">
        <h2>Pedido expirado</h2>
        ${notice('O pagamento não foi feito e a data combinada já passou, então este pedido não foi produzido. Nada foi cobrado. Se ainda quiser, é só pedir de novo e escolher uma nova data.', {
          tone: 'red',
          iconName: 'clock',
        })}
      </section>
    `;
  }

  if (st.canceled) {
    return html`
      <section class="card ord-box ord-box--track">
        <h2>Pedido cancelado</h2>
        ${notice(
          order.payment.paidAt
            ? 'Este pedido foi cancelado antes de entrar em produção. O valor pago volta integralmente pela mesma forma de pagamento.'
            : 'Este pedido foi cancelado antes do pagamento. Nada foi cobrado.',
          { tone: 'red', iconName: 'info' },
        )}
      </section>
    `;
  }

  const pending = isPixPending(order);
  const current = st.steps.find((s) => s.current);
  const finished = st.index === st.steps.length - 1;
  const headline = pending ? 'Aguardando o pagamento' : st.label;
  const detail = pending
    ? 'Assim que o Pix for confirmado, seu pedido entra na nossa agenda.'
    : finished
      ? 'Pedido concluído. Obrigado por escolher a BOLAB!'
      : current?.desc || '';

  return html`
    <section class="card ord-box ord-box--track" aria-labelledby="ord-track-title">
      <div class="ord-track__head">
        <div>
          <p class="eyebrow">Acompanhe seu pedido</p>
          <h2 id="ord-track-title">${headline}</h2>
          <p class="muted">${detail}</p>
        </div>
      </div>
      <ol class="ord-tl" style="--ord-steps:${st.steps.length}">
        ${st.steps.map((s) => {
          const time = s.id === 'received' ? order.createdAt : s.id === 'paid' && order.payment.paidAt && s.done ? order.payment.paidAt : null;
          const desc = pending && s.id === 'received' ? 'Aguardando o Pix para seguir.' : s.desc;
          return html`
            <li class="ord-tl__step ${s.done ? 'is-done' : ''} ${s.current ? 'is-current' : ''}" ${s.current ? raw('aria-current="step"') : ''}>
              <span class="ord-tl__dot">${icon(s.done ? 'check' : STEP_ICONS[s.id] || 'check')}</span>
              <div class="ord-tl__text">
                <strong>${s.label}</strong>
                <span>${desc}</span>
                ${time ? html`<time>${dateTime(time)}</time>` : ''}
              </div>
            </li>
          `;
        })}
      </ol>
    </section>
  `;
}

function deliveryCard(order) {
  const pickup = isPickup(order);
  const a = order.address;
  return html`
    <section class="card ord-box ord-box--delivery" aria-labelledby="ord-delivery-title">
      <h2 id="ord-delivery-title">${pickup ? 'Retirada' : 'Entrega'}</h2>
      <ul class="ord-facts">
        <li>
          ${icon('calendar')}
          <div>
            <strong>${dateLong(order.delivery.date)}</strong>
            <span>Entre ${order.delivery.slot.replace(' – ', ' e ')}</span>
          </div>
        </li>
        <li>
          ${icon(pickup ? 'store' : 'map-pin')}
          <div>
            <strong>${pickup ? SITE.pickup.name : a?.label || 'Endereço de entrega'}</strong>
            <span>${pickup ? `${SITE.pickup.address} · ${SITE.city}/${SITE.uf}` : addresses.format(a)}</span>
            ${pickup ? html`<span>${SITE.pickup.note}</span>` : a?.reference ? html`<span>Referência: ${a.reference}</span>` : ''}
          </div>
        </li>
        <li>
          ${icon('user')}
          <div>
            <strong>${order.contact.name}</strong>
            <span>${order.contact.phone}</span>
          </div>
        </li>
      </ul>
      ${isOff(order)
        ? ''
        : html`
            <div class="ord-code">
              <div>
                <strong>Código de ${pickup ? 'retirada' : 'entrega'}</strong>
                <span>${pickup ? 'Informe no balcão ao retirar o pedido.' : 'Informe a quem entregar o seu pedido.'}</span>
              </div>
              <span class="ord-code__digits" aria-label="${order.code.split('').join(' ')}">${order.code}</span>
            </div>
          `}
    </section>
  `;
}

function itemsCard(order) {
  const count = order.items.reduce((n, l) => n + l.qty, 0);
  return html`
    <section class="card ord-box ord-box--items" aria-labelledby="ord-items-title">
      <h2 id="ord-items-title">Itens do pedido <small>${plural(count, 'item', 'itens')}</small></h2>
      <ul class="ord-items">
        ${order.items.map(
          (l) => html`
            <li class="ord-item">
              <span class="ord-item__thumb">${lineThumb(l, { w: 144 })}</span>
              <div class="ord-item__body">
                <strong>${l.name}</strong>
                ${l.sizeLabel ? html`<span>${l.sizeLabel}</span>` : ''}
                ${l.kind === 'custom' && l.summary?.length ? html`<span>${l.summary.join(' · ')}</span>` : ''}
                ${l.note ? html`<span class="ord-item__note">“${l.note}”</span>` : ''}
                <span class="ord-item__qty">${l.qty} × ${money(l.price)}</span>
              </div>
              <strong class="ord-item__total">${money(l.price * l.qty)}</strong>
            </li>
          `,
        )}
      </ul>
      ${order.note ? html`<div class="ord-note">${icon('message')}<div><strong>Seu recado</strong><span>${order.note}</span></div></div>` : ''}
    </section>
  `;
}

function paymentCard(order) {
  const p = order.payment;
  const isCard = p.method === 'card';
  const n = p.installments || 1;
  const line = isCard ? `${p.brand || 'Cartão'} •••• ${p.last4 || '····'}` : 'Pix';
  const off = isOff(order);
  const sub = off
    ? p.paidAt
      ? 'Valor estornado'
      : 'Nenhum valor cobrado'
    : isCard
      ? `${n}x de ${money(order.totals.total / n)} sem juros`
      : p.paidAt
        ? `Pago em ${dateTime(p.paidAt)}`
        : 'Aguardando pagamento';
  return html`
    <section class="card ord-box ord-box--pay" aria-labelledby="ord-pay-title">
      <h2 id="ord-pay-title">Pagamento</h2>
      <div class="ord-paymethod">
        <span class="ord-paymethod__icon">${icon(isCard ? 'credit-card' : 'pix')}</span>
        <div>
          <strong>${line}</strong>
          <span>${sub}</span>
        </div>
        ${off ? '' : p.paidAt ? html`<span class="badge badge--green">${icon('check')}Pago</span>` : html`<span class="badge badge--amber">Pendente</span>`}
      </div>
      <div class="ord-totals">${totalsSummary(order.totals, { mode: order.delivery.mode })}</div>
    </section>
  `;
}

function actions(order, st) {
  const canAdvance = SITE.demo && !st.canceled && st.index < st.steps.length - 1;
  return html`
    <div class="ord-actions">
      ${isClosed(order) ? html`<button class="btn btn--block" type="button" id="ord-reorder" data-reorder>${icon('refresh')} Pedir de novo</button>` : ''}
      <a class="btn btn--secondary btn--block" href="#/atendimento">${icon('message')} Preciso de ajuda</a>
      ${orders.canCancel(order) ? html`<button class="ord-cancel" type="button" id="ord-cancel" data-cancel>Cancelar pedido</button>` : ''}
    </div>
    ${canAdvance
      ? html`
          <div class="notice notice--amber ord-demo">
            ${icon('info')}
            <div>
              <p><strong>Modo demonstração:</strong> veja o acompanhamento evoluir sem esperar o dia da entrega.</p>
              <button class="btn btn--secondary btn--sm" type="button" id="ord-advance" data-advance>Avançar etapa (demonstração)</button>
            </div>
          </div>
        `
      : ''}
  `;
}

function notFound(id) {
  return html`
    <div class="container ord">
      <div class="empty">
        <div class="empty__art">${icon('package')}</div>
        <h1 class="ord-notfound">Não encontramos o pedido ${id}</h1>
        <p>Confira o número ou veja todos os pedidos feitos com esta conta.</p>
        <div class="cart-empty__cta">
          <a class="btn" href="#/pedidos">Ver meus pedidos</a>
          <a class="btn btn--secondary" href="#/cardapio">Ir para o cardápio</a>
        </div>
      </div>
    </div>
  `;
}

/* ───────── Tela ───────── */
export default {
  title: (ctx) => `Pedido ${ctx.params.id}`,
  layout: 'plain',
  auth: true,

  render(ctx) {
    const order = orders.get(ctx.params.id);
    if (!order) return notFound(ctx.params.id);
    const st = orders.statusOf(order);
    const isNew = ctx.query.novo === '1' && !isClosed(order); // a comemoração vale enquanto o pedido está em andamento
    return html`
      <div class="container ord ${isNew ? 'ord--new' : ''}">
        ${hero(order, isNew)} ${isPixPending(order) ? pixPanel(order) : ''}
        <div class="ord-layout">
          <div class="ord-main">${timeline(order, st)} ${itemsCard(order)} ${paymentCard(order)}</div>
          <div class="ord-side">${deliveryCard(order)} ${actions(order, st)}</div>
        </div>
        <p class="ord-foot"><a class="link-arrow" href="#/pedidos">Ver todos os meus pedidos ${icon('arrow-right')}</a></p>
      </div>
    `;
  },

  mount(root, ctx) {
    const page = root.firstElementChild;
    const id = ctx.params.id;
    const off = whenStore('orders', () => keepFocus(() => ctx.rerender()));
    const order = orders.get(id);
    if (!order) return off;

    // Comemora uma vez só: ao chegar com o pedido pago ou quando o Pix é confirmado.
    if (ctx.query.novo === '1' && order.payment.paidAt && !order.canceled && !celebrated.has(id)) {
      celebrated.add(id);
      confetti();
    }

    /* Pix: contagem regressiva */
    let timer = 0;
    const clockEl = page.querySelector('[data-pix-clock]');
    if (clockEl) {
      const tick = () => {
        const left = pixExpiresAt(order) - Date.now();
        if (left <= 0) {
          clearInterval(timer);
          ctx.rerender();
          return;
        }
        clockEl.textContent = clock(left);
        page.querySelector('[data-pix-timer]')?.classList.toggle('is-soon', left < 120e3);
      };
      timer = setInterval(tick, 1000);
      tick();
    }

    let copiedTimer = 0;
    on(page, 'click', '[data-pix-copy]', async () => {
      const input = [...page.querySelectorAll('[data-pix-code]')].find((el) => el.offsetParent) || page.querySelector('[data-pix-code]');
      const ok = await copyText(input.value);
      if (!ok) {
        input.focus();
        input.select();
        toast('Selecione o código e copie manualmente.', { type: 'error' });
        return;
      }
      // Um retorno só: o próprio botão vira "Código copiado ✓" por alguns segundos.
      copied.add(id);
      ctx.rerender();
      document.getElementById(window.matchMedia('(max-width: 899px)').matches ? 'ord-pix-copy-m' : 'ord-pix-copy')?.focus({ preventScroll: true });
    });
    if (copied.has(id)) {
      copiedTimer = setTimeout(() => {
        copied.delete(id);
        keepFocus(() => ctx.rerender());
      }, 4000);
    }

    on(page, 'click', '[data-pix-code]', (_ev, input) => input.select());

    on(page, 'click', '[data-pix-qr]', () => {
      if (qrOpen.has(id)) qrOpen.delete(id);
      else qrOpen.add(id);
      keepFocus(() => ctx.rerender());
    });

    on(page, 'click', '[data-pix-renew]', () => {
      pixRestart.set(id, Date.now());
      savePixRestarts();
      ctx.rerender();
      toast('Novo código gerado.', { type: 'success' });
    });

    on(page, 'click', '[data-pix-pay]', () => {
      if (pixRestart.delete(id)) savePixRestarts();
      celebrated.add(id);
      orders.markPaid(id);
      confetti();
      toast('Pix recebido! Seu pedido está confirmado.', { type: 'success' });
      // Depois que a tela se redesenha (ela preserva a rolagem), sobe para mostrar a confirmação.
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    });

    /* Ações */
    on(page, 'click', '[data-reorder]', () => {
      const n = orders.reorder(id);
      if (!n) return;
      toast(n === 1 ? 'O item voltou para o carrinho.' : 'Os itens voltaram para o carrinho.', { type: 'success' });
      navigate('/carrinho');
    });

    on(page, 'click', '[data-cancel]', async () => {
      const paid = Boolean(orders.get(id)?.payment.paidAt);
      const yes = await confirmDialog({
        title: 'Cancelar este pedido?',
        message: paid
          ? 'Seu bolo ainda não entrou em produção, então o cancelamento é gratuito e o valor pago volta integralmente.'
          : 'Seu pedido ainda não foi pago, então é só confirmar: nada será cobrado.',
        confirmLabel: 'Sim, cancelar',
        cancelLabel: 'Manter pedido',
        danger: true,
      });
      if (!yes) return;
      if (orders.cancel(id)) toast('Pedido cancelado.', { type: 'success' });
      else toast('Este pedido já entrou em produção. Fale com a gente pelo atendimento.', { type: 'error' });
    });

    on(page, 'click', '[data-advance]', () => orders.advance(id));

    return () => {
      off();
      clearInterval(timer);
      clearTimeout(copiedTimer);
    };
  },
};
