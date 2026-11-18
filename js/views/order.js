// BOLAB — acompanhamento de um pedido (#/pedido/:id).
//
// SEM SERVIDOR (SITE.demo): o pedido fechado fica só neste aparelho. Quem leva o pedido até a
// confeitaria é o cliente, pelo botão "Enviar pedido pelo WhatsApp" (js/pedido-whatsapp.js). A tela
// só afirma o que a loja sabe de verdade: pedido montado, WhatsApp aberto com a mensagem
// ("Aguardando confirmação da BOLAB") e data combinada. Pagamento, produção e entrega são
// combinados e avisados no WhatsApp; nada aqui finge "pago" ou "em produção". O Pix com QR Code
// continua disponível só como demonstração, recolhido e com esse nome.
import { html, raw, icon, money, dateTime, plural, on, toast, confirmDialog, copyText, confetti, openDialog } from '../ui.js';
import { lineThumb, pageHead, totalsSummary, listRow, dayLabel, slotLabel } from '../components.js';
import { addresses, auth, orders } from '../store.js';
import { navigate } from '../router.js';
import { SITE } from '../data/site.js';
import { getProduct, isCake } from '../data/products.js';
import { whenStore, keepFocus } from './cart.js';
import { canal, carregarBolos, montarMensagem, avisoDeCancelamento } from '../pedido-whatsapp.js';

const STEP_ICONS = { received: 'receipt', paid: 'credit-card', preparing: 'cake', ready: 'gift', out: 'truck', delivered: 'home' };
const BADGE_TONES = { amber: 'badge--amber', gold: 'badge--gold', green: 'badge--green', red: 'badge--red', rose: 'badge--rose', neutral: '' };

const celebrated = new Set(); // pedidos que já ganharam confete nesta visita
const PIX_KEY = 'bolab:pix'; // sessionStorage: pedido → momento em que um novo código Pix foi gerado
const pixRestart = new Map(loadPixRestarts());
const qrOpen = new Set(); // pedidos com o QR Code aberto no celular
const copied = new Set(); // pedidos cujo código acabou de ser copiado
const demoPayOpen = new Set(); // pedidos com a demonstração do Pix aberta
const messages = new Map(); // pedido (número + momento em que foi feito) → mensagem do WhatsApp já montada
/** Chave do pedido no cache: o número pode se repetir depois de "apagar os dados" na mesma visita. */
const msgKey = (order) => `${order.id}:${order.createdAt}`;
const justSent = new Set(); // pedidos recém-marcados como enviados: o leitor de tela é avisado uma vez

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

/** Pedido encerrado: entregue, retirado, cancelado ou expirado. */
export function isClosed(order) {
  const st = orders.statusOf(order);
  return st.canceled || st.id === 'delivered';
}

/** Selo de situação. → { label, tone, icon } */
export function statusInfo(order) {
  const st = orders.statusOf(order);
  if (st.expired) return { label: 'Expirado', tone: 'red', icon: 'clock' };
  if (st.canceled) return { label: 'Cancelado', tone: 'red', icon: 'x' };
  // Sem servidor: a situação é a do envio pelo WhatsApp (ver orders.statusOf em js/store.js).
  if (SITE.demo && st.index <= 1) return st.sent ? { label: 'Aguardando confirmação', tone: 'rose', icon: 'whatsapp' } : { label: 'Falta enviar', tone: 'amber', icon: 'send' };
  if (SITE.demo && st.label === 'Encerrado') return { label: 'Encerrado', tone: 'neutral', icon: 'check' };
  if (!order.payment.paidAt) return { label: order.payment.method === 'pix' ? 'Aguardando Pix' : 'Aguardando pagamento', tone: 'amber', icon: 'clock' };
  if (st.id === 'preparing') return { label: st.label, tone: 'rose', icon: 'cake' };
  if (st.id === 'ready') return { label: st.label, tone: 'green', icon: 'gift' };
  if (st.id === 'out') return { label: st.label, tone: 'green', icon: 'truck' };
  if (st.id === 'delivered') return { label: st.label, tone: 'green', icon: 'check' };
  return { label: 'Confirmado', tone: 'green', icon: 'check' };
}

export function statusBadge(order) {
  const info = statusInfo(order);
  return html`<span class="badge ${BADGE_TONES[info.tone]} ord-badge">${icon(info.icon)}${info.label}</span>`;
}

/** Pedido em andamento que a BOLAB ainda não recebeu: falta o cliente enviar pelo WhatsApp. */
export const needsSend = (order) => SITE.demo && !isClosed(order) && !orders.statusOf(order).sent;

/**
 * "Pedir de novo": devolve os itens ao carrinho e leva a pessoa até lá. Item que saiu do cardápio
 * não volta, e a pessoa fica sabendo.
 */
export function reorderAndGo(id) {
  const order = orders.get(id);
  if (!order) return;
  const n = orders.reorder(id);
  const total = order.items.length;
  if (!n) {
    toast(total === 1 ? 'Este item não está mais no cardápio.' : 'Estes itens não estão mais no cardápio.', { type: 'error' });
    return;
  }
  const missing = total - n;
  if (missing > 0) toast(`${missing === 1 ? '1 item saiu do cardápio e ficou de fora' : `${missing} itens saíram do cardápio e ficaram de fora`}. O restante está no carrinho.`, { duration: 6000 });
  else toast(n === 1 ? 'O item voltou para o carrinho.' : 'Os itens voltaram para o carrinho.', { type: 'success' });
  navigate('/carrinho');
}

/** "14:00 – 16:00" → "14h–16h" (o formatador mora em js/components.js: slotLabel). */
export const slotShort = slotLabel;

/** "Entrega sáb, 11/10 · 14h–16h" | "Retirada amanhã · 9h–11h" */
export function whenShort(order) {
  return `${isPickup(order) ? 'Retirada' : 'Entrega'} ${dayLabel(order.delivery.date)} · ${slotShort(order.delivery.slot)}`;
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

/** Título grande do acompanhamento, conforme a etapa. → { title, sub, tone } */
function headline(order, st) {
  const pickup = isPickup(order);
  const cake = order.items.some((l) => l.kind === 'custom' || isCake(getProduct(l.productId) || { cat: 'acess' }));
  const thing = cake ? 'bolo' : 'pedido';
  if (SITE.demo) {
    if (st.expired) return { title: 'Pedido expirado', sub: 'Este pedido não foi enviado à BOLAB e a data escolhida já passou. Nada foi cobrado.', tone: 'off' };
    if (st.canceled) {
      return {
        title: 'Pedido cancelado',
        sub: st.sent ? 'Cancelado neste aparelho. Avise a BOLAB pelo WhatsApp para ela não começar a produção.' : 'Cancelado antes do envio. A BOLAB não chegou a receber e nada foi cobrado.',
        tone: 'off',
      };
    }
    if (st.label === 'Encerrado') return { title: 'Pedido encerrado', sub: 'A data combinada já passou. Se ficou alguma pendência, fale com a BOLAB pelo WhatsApp.', tone: 'done' };
    if (!st.sent) return { title: 'Pedido ainda não enviado', sub: 'Ele fica guardado neste aparelho até você enviar.', tone: 'wait' };
    if (st.index <= 1) return { title: 'Aguardando confirmação da BOLAB', sub: 'A resposta chega pelo WhatsApp, com a confirmação do horário e a forma de pagar.', tone: 'go' };
  }
  if (st.expired) return { title: 'Pedido expirado', sub: 'O pagamento não foi feito e a data combinada já passou. Nada foi cobrado.', tone: 'off' };
  if (st.canceled) {
    return {
      title: 'Pedido cancelado',
      sub: order.payment.paidAt ? 'Cancelado antes da produção. O valor pago volta integralmente pela mesma forma de pagamento.' : 'Cancelado antes do pagamento. Nada foi cobrado.',
      tone: 'off',
    };
  }
  if (!order.payment.paidAt) return { title: 'Aguardando o pagamento', sub: 'Assim que o Pix for confirmado, seu pedido entra na nossa agenda.', tone: 'wait' };
  switch (st.id) {
    case 'preparing':
      return { title: `Seu ${thing} está em produção`, sub: 'Feito à mão, perto do dia, para chegar fresquinho.', tone: 'go' };
    case 'ready':
      return pickup
        ? { title: 'Pronto para retirada', sub: 'É só passar no ateliê no horário combinado.', tone: 'go' }
        : { title: `Seu ${thing} está pronto`, sub: 'Embalado e esperando a saída para entrega.', tone: 'go' };
    case 'out':
      return { title: `Seu ${thing} saiu para entrega`, sub: 'Tenha o código de entrega em mãos.', tone: 'go' };
    case 'delivered':
      return { title: pickup ? 'Pedido retirado' : 'Pedido entregue', sub: 'Bom apetite! Obrigado por pedir na BOLAB.', tone: 'done' };
    default:
      return { title: 'Pedido confirmado', sub: 'Pagamento recebido. Seu pedido já está na nossa agenda.', tone: 'go' };
  }
}

/** Faixa de agradecimento logo depois de fechar o pedido (já pago). */
function confirmBanner(order) {
  const first = (order.contact.name || auth.user()?.name || '').trim().split(/\s+/)[0];
  return html`
    <div class="ord-confirm" role="status">
      <span class="ord-confirm__icon">${icon('check')}</span>
      <div>
        <strong>${first ? `Obrigado, ${first}!` : 'Obrigado pelo pedido!'}</strong>
        <p>${isPickup(order) ? 'Avisamos pelo WhatsApp quando o pedido estiver pronto para retirada.' : 'Avisamos pelo WhatsApp quando o pedido sair para entrega.'}</p>
      </div>
    </div>
  `;
}

/* ───────── Pedido pelo WhatsApp (sem servidor) ───────── */

/** A mensagem já montada, ou null enquanto o módulo dos bolos 3D não chegou (ver mount). */
function messageOf(order) {
  const hit = messages.get(msgKey(order));
  if (hit) return hit;
  if (order.items.some((l) => l.kind === 'custom' && l.config)) return null;
  const msg = montarMensagem(order, null);
  messages.set(msgKey(order), msg);
  return msg;
}

/**
 * O cartão principal do pedido em andamento: enviar (ou reenviar) o pedido pelo WhatsApp.
 * O botão é um link comum: quem abre o WhatsApp é o toque do cliente, nunca a loja sozinha.
 */
function waCard(order, st, isNew) {
  const ch = canal();
  const msg = messageOf(order);
  const first = (order.contact.name || auth.user()?.name || '').trim().split(/\s+/)[0];
  const sent = st.sent;
  const title = sent ? 'Pedido enviado pelo WhatsApp' : isNew && first ? `Quase lá, ${first}. Envie o pedido para a BOLAB` : 'Envie o pedido para a BOLAB';
  const text = sent
    ? `Você abriu o WhatsApp com este pedido em ${dateTime(order.sentAt)}. Se não chegou a enviar a mensagem, envie de novo.`
    : msg?.oversize
      ? 'Este pedido é grande. O botão copia o pedido completo e abre o WhatsApp. Lá, cole a mensagem e envie.'
      : 'A BOLAB só recebe o pedido quando você envia. O botão abre o WhatsApp com a mensagem pronta; é só enviar.';
  const label = msg?.oversize ? 'Copiar pedido e abrir o WhatsApp' : sent ? 'Enviar de novo pelo WhatsApp' : 'Enviar pedido pelo WhatsApp';
  const button = !ch.valid
    ? html`<p class="notice notice--amber">${icon('alert')}<span>O WhatsApp da loja ainda não foi configurado. Fale com a BOLAB pelo atendimento.</span></p>`
    : msg
      ? html`<a class="btn ${sent ? 'btn--secondary' : 'btn--lg'} btn--block ord-wa__btn" id="ord-wa-send" href="${msg.url}" target="_blank" rel="noopener" data-wa-send>${icon('whatsapp')}${label}</a>`
      : html`<button class="btn ${sent ? 'btn--secondary' : 'btn--lg'} btn--block ord-wa__btn" id="ord-wa-send" type="button" disabled aria-busy="true">Preparando a mensagem…</button>`;
  return html`
    <section class="card ord-wa ${sent ? 'is-sent' : ''}" aria-labelledby="ord-wa-t">
      <div class="ord-wa__head">
        <span class="ord-wa__icon">${icon(sent ? 'check' : 'whatsapp')}</span>
        <div>
          <h2 id="ord-wa-t">${title}</h2>
          <p>${text}</p>
        </div>
      </div>
      ${button}
      <div class="ord-wa__foot">
        ${msg && ch.valid ? html`<button class="link" type="button" id="ord-wa-peek" data-wa-peek>${sent ? 'Ver a mensagem' : 'Ver a mensagem antes de enviar'}</button>` : ''}
      </div>
      ${ch.demo && ch.valid
        ? html`<p class="ord-wa__demo">${icon('info')}<span>Demonstração: o WhatsApp da loja ainda é um número de exemplo, ${ch.label}. Por enquanto a mensagem não chega à BOLAB.</span></p>`
        : ''}
    </section>
  `;
}

/** Etapas que a loja conhece sem servidor. As duas primeiras acontecem aqui; as outras, no WhatsApp. */
function honestSteps(order, st) {
  const pickup = isPickup(order);
  return [
    { icon: 'receipt', label: 'Pedido montado', text: dateTime(order.createdAt), done: true, current: false },
    {
      icon: 'send',
      label: st.sent ? 'Enviado pelo WhatsApp' : 'Enviar pelo WhatsApp',
      text: st.sent ? dateTime(order.sentAt) : 'Toque em “Enviar pedido pelo WhatsApp”.',
      done: st.sent,
      current: !st.sent,
    },
    { icon: 'whatsapp', label: 'Confirmação da BOLAB', text: 'A BOLAB confirma o horário e combina o pagamento.', done: false, current: st.sent },
    { icon: 'cake', label: 'Produção', text: '', done: false, current: false },
    { icon: pickup ? 'store' : 'truck', label: pickup ? 'Retirada no ateliê' : 'Entrega', text: '', done: false, current: false },
  ];
}

/** Acompanhamento sem servidor: só o que a loja sabe de verdade (montado, enviado, data combinada). */
function honestTrack(order, st) {
  const head = headline(order, st);
  const ended = st.canceled || st.label === 'Encerrado';
  const steps = honestSteps(order, st);
  const at = steps.findIndex((s) => s.current);
  return html`
    <section class="card ord-track ord-track--${head.tone}" aria-labelledby="ord-track-t">
      ${st.canceled ? '' : html`<p class="ord-track__when">${icon(isPickup(order) ? 'store' : 'truck')}${whenShort(order)}</p>`}
      <h2 class="ord-track__title" id="ord-track-t">${head.title}</h2>
      <p class="ord-track__sub">${head.sub}</p>
      ${st.canceled && st.sent && !st.expired && canal().valid
        ? html`<a class="btn btn--secondary btn--block ord-track__cta" id="ord-wa-cancel" href="${avisoDeCancelamento(order)}" target="_blank" rel="noopener">${icon('whatsapp')}Avisar a BOLAB do cancelamento</a>`
        : ''}
      ${ended
        ? ''
        : html`
            <div class="ord-bar" role="img" aria-label="Etapa ${at + 1} de ${steps.length}: ${steps[at].label}">
              ${steps.map((s) => html`<i class="${s.done ? 'is-done' : s.current ? 'is-current' : ''}"></i>`)}
            </div>
            <ol class="ord-tl">
              ${steps.map(
                (s) => html`
                  <li class="ord-tl__step ${s.done ? 'is-done' : s.current ? 'is-current' : ''}" ${s.current ? raw('aria-current="step"') : ''}>
                    <span class="ord-tl__dot">${icon(s.done ? 'check' : s.icon)}</span>
                    <div class="ord-tl__text">
                      <strong>${s.label}<span class="sr-only"> (${s.done ? 'feito' : s.current ? 'etapa atual' : 'a seguir'})</span></strong>
                      ${(s.done || s.current) && s.text ? html`<span>${s.text}</span>` : ''}
                    </div>
                  </li>
                `,
              )}
            </ol>
            <p class="ord-track__note">${icon('info')}<span>Daqui em diante, o andamento do pedido é combinado com a BOLAB pelo WhatsApp.</span></p>
          `}
    </section>
  `;
}

function pixPanel(order, isNew) {
  const left = pixExpiresAt(order) - Date.now();
  const expired = left <= 0;
  const code = demoPixCode(order);
  const wasCopied = copied.has(order.id);
  const showQr = qrOpen.has(order.id);
  return html`
    <section class="card ord-pix ${expired ? 'is-expired' : ''} ${showQr ? 'is-qr-open' : ''}" aria-labelledby="ord-pix-t">
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
            <h2 id="ord-pix-t">${SITE.demo ? 'Pix pelo site' : isNew ? 'Falta só o Pix' : 'Pague com Pix'}</h2>
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
                <button class="btn btn--block" type="button" id="ord-pix-renew" data-pix-renew>${icon('refresh')}Gerar novo código</button>
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
                  <li><span>Cole e confirme o valor no app do banco.</span></li>
                </ol>
              </div>

              <div class="ord-pix__desk only-desktop">
                <ol class="ord-pix__how">
                  <li><span>Abra o app do seu banco e escolha <strong>Pix</strong>.</span></li>
                  <li><span>Aponte a câmera para o QR Code ou cole o código abaixo.</span></li>
                  <li><span>Confirme o valor no app do banco.</span></li>
                </ol>
                <div class="field">
                  <label for="ord-pix-code">Pix copia e cola</label>
                  <div class="ord-pix__code">
                    <input class="input" id="ord-pix-code" type="text" readonly value="${code}" data-pix-code />
                    <button class="btn btn--soft ${wasCopied ? 'is-copied' : ''}" type="button" id="ord-pix-copy" data-pix-copy>
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
                  <p><strong>Demonstração:</strong> o código e o QR Code são ilustrativos, não dá para pagar com eles e nada é cobrado. O pagamento de verdade é combinado com a BOLAB no WhatsApp.</p>
                  <button class="btn btn--secondary btn--block ord-pix__sim" type="button" id="ord-pix-pay" data-pix-pay>${icon('pix')}Simular pagamento do Pix</button>
                </div>
              </div>
            `
          : ''}
      </div>
    </section>
  `;
}

/** Cartão de acompanhamento: previsão, status em título grande, barra de etapas e linha do tempo. */
function trackCard(order, st) {
  const head = headline(order, st);
  const off = st.canceled;
  const pending = isPixPending(order);
  const total = st.steps.length;
  const doneAll = st.index === total - 1;
  return html`
    <section class="card ord-track ord-track--${head.tone}" aria-labelledby="ord-track-t">
      ${off ? '' : html`<p class="ord-track__when">${icon(isPickup(order) ? 'store' : 'truck')}${whenShort(order)}</p>`}
      <h2 class="ord-track__title" id="ord-track-t">${head.title}</h2>
      <p class="ord-track__sub">${head.sub}</p>
      ${off
        ? ''
        : html`
            <div class="ord-bar" role="img" aria-label="Etapa ${st.index + 1} de ${total}: ${st.label}">
              ${st.steps.map((s) => html`<i class="${s.done ? 'is-done' : s.current ? 'is-current' : ''}"></i>`)}
            </div>
            <ol class="ord-tl">
              ${st.steps.map((s) => {
                const time = s.id === 'received' ? order.createdAt : s.id === 'paid' && order.payment.paidAt && (s.done || s.current) ? order.payment.paidAt : null;
                const desc = pending && s.id === 'received' ? 'Aguardando o Pix para seguir.' : s.desc;
                const state = s.done ? 'is-done' : s.current ? 'is-current' : '';
                return html`
                  <li class="ord-tl__step ${state}" ${s.current ? raw('aria-current="step"') : ''}>
                    <span class="ord-tl__dot">${icon(s.done ? 'check' : STEP_ICONS[s.id] || 'check')}</span>
                    <div class="ord-tl__text">
                      <strong>${s.label}</strong>
                      ${s.done || s.current || doneAll ? html`<span>${time ? dateTime(time) : desc}</span>` : ''}
                    </div>
                  </li>
                `;
              })}
            </ol>
          `}
    </section>
  `;
}

function deliveryCard(order) {
  const pickup = isPickup(order);
  const a = order.address;
  const fact = (iconName, title, ...lines) => html`
    <li>
      <span class="row__icon">${icon(iconName)}</span>
      <div>
        <strong>${title}</strong>
        ${lines.filter(Boolean).map((line) => html`<span>${line}</span>`)}
      </div>
    </li>
  `;
  return html`
    <section class="card ord-box ord-box--delivery" aria-labelledby="ord-delivery-t">
      <h2 id="ord-delivery-t">${pickup ? 'Retirada' : 'Entrega'}</h2>
      <ul class="ord-facts">
        ${fact('calendar', dayLabelLong(order), `Entre ${slotShort(order.delivery.slot).replace('–', ' e ')}`)}
        ${pickup
          ? fact('store', SITE.pickup.name, `${SITE.pickup.address} · ${SITE.city}/${SITE.uf}`, SITE.pickup.note)
          : fact('map-pin', a?.label || 'Endereço de entrega', addresses.format(a), a?.reference ? `Referência: ${a.reference}` : '')}
        ${fact('user', order.contact.name, order.contact.phone)}
      </ul>
      ${isOff(order)
        ? ''
        : html`
            <div class="ord-code">
              <div>
                <strong>Código de ${pickup ? 'retirada' : 'entrega'}</strong>
                <span>${pickup ? 'Informe no balcão ao retirar.' : 'Informe a quem entregar o pedido.'}</span>
              </div>
              <span class="ord-code__digits" aria-label="${order.code.split('').join(' ')}">${order.code.split('').map((d) => html`<i>${d}</i>`)}</span>
            </div>
          `}
    </section>
  `;
}

/** "Sábado, 11 de outubro" (data por extenso para o cartão de entrega). */
function dayLabelLong(order) {
  const [y, m, d] = order.delivery.date.split('-').map(Number);
  const text = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(y, m - 1, d));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Massa: Baunilha" → "Baunilha" (no recibo entram só as escolhas, sem os rótulos). */
function summaryValue(text) {
  const str = String(text);
  const i = str.indexOf(': ');
  return i > 0 && i <= 40 ? str.slice(i + 2) : str;
}

/** Itens, valores e forma de pagamento em um cartão só. */
function receiptCard(order) {
  const count = order.items.reduce((n, l) => n + l.qty, 0);
  const p = order.payment;
  const off = isOff(order);
  const isCard = p.method === 'card';
  const n = p.installments || 1;
  // Sem servidor nada é cobrado: a linha diz a forma escolhida e que o pagamento é combinado no WhatsApp.
  const demo = SITE.demo;
  const parcels = `${n}x de ${money(order.totals.total / n)} sem juros`;
  const payTitle = demo ? (isCard ? 'Cartão de crédito' : 'Pix') : isCard ? `${p.brand || 'Cartão'} final ${p.last4 || '····'}` : 'Pix';
  const paySub = demo
    ? off
      ? 'Nenhum valor cobrado'
      : `${isCard ? `${parcels} · ` : ''}${p.paidAt ? 'Pagamento simulado: nada foi cobrado' : 'A combinar com a BOLAB no WhatsApp'}`
    : off
      ? p.paidAt
        ? 'Valor estornado'
        : 'Nenhum valor cobrado'
      : isCard
        ? parcels
        : p.paidAt
          ? `Pago em ${dateTime(p.paidAt)}`
          : 'Aguardando pagamento';
  const payBadge = off
    ? ''
    : demo
      ? p.paidAt
        ? html`<span class="badge badge--amber">Simulado</span>`
        : html`<span class="badge">A combinar</span>`
      : p.paidAt
        ? html`<span class="badge badge--green">${icon('check')}Pago</span>`
        : html`<span class="badge badge--amber">Pendente</span>`;
  return html`
    <section class="card ord-box ord-box--receipt" aria-labelledby="ord-items-t">
      <h2 id="ord-items-t">Itens <small>${plural(count, 'item', 'itens')}</small></h2>
      <ul class="ord-items">
        ${order.items.map(
          (l) => html`
            <li class="ord-item">
              <span class="ord-item__thumb">${lineThumb(l, { w: 112 })}</span>
              <div class="ord-item__body">
                <strong>${l.qty > 1 ? `${l.qty}× ` : ''}${l.name}</strong>
                ${l.sizeLabel ? html`<span>${l.sizeLabel}</span>` : ''}
                ${l.kind === 'custom' && l.summary?.length ? html`<span class="ord-item__recipe">${l.summary.map(summaryValue).join(' · ')}</span>` : ''}
                ${l.note ? html`<span>Recado: ${l.note}</span>` : ''}
              </div>
              <strong class="ord-item__total">${money(l.price * l.qty)}</strong>
            </li>
          `,
        )}
      </ul>
      ${order.note ? html`<div class="ord-note">${icon('message')}<div><strong>Observação</strong><span>${order.note}</span></div></div>` : ''}
      <div class="ord-totals">${totalsSummary(order.totals, { mode: order.delivery.mode })}</div>
      <div class="ord-pay">
        <span class="row__icon">${icon(isCard ? 'credit-card' : 'pix')}</span>
        <div>
          <strong>${payTitle}</strong>
          <span>${paySub}</span>
        </div>
        ${payBadge}
      </div>
    </section>
  `;
}

/** Demonstração do Pix pelo site, recolhida: não muda a situação do pedido. */
function demoPay(order, isNew) {
  return html`
    <details class="card ord-demopay" data-demo-pay ${demoPayOpen.has(order.id) ? raw('open') : ''}>
      <summary>
        <span class="row__icon">${icon('pix')}</span>
        <span class="ord-demopay__text"><strong>Demonstração: Pix pelo site</strong><span>Veja como o pagamento on-line vai funcionar. Não é cobrança.</span></span>
        ${icon('chevron-down')}
      </summary>
      ${pixPanel(order, isNew)}
    </details>
  `;
}

function actions(order) {
  const closed = isClosed(order);
  const wa = `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(`Olá! É sobre o pedido ${order.id}.`)}`;
  const reorderRow = listRow({ iconName: 'repeat', title: 'Pedir de novo', desc: 'Coloca os mesmos itens no carrinho', attrs: 'data-reorder' });
  return html`
    <div class="ord-actions">
      ${closed ? html`<button class="btn btn--lg btn--block" type="button" id="ord-reorder" data-reorder>${icon('repeat')}Pedir de novo</button>` : ''}
      <div class="card ord-actions__list">
        ${listRow({ iconName: 'whatsapp', title: 'Falar no WhatsApp', desc: SITE.whatsappLabel, href: wa, attrs: 'target="_blank" rel="noopener"' })}
        ${listRow({ iconName: 'help', title: 'Preciso de ajuda', desc: 'Dúvidas, troca de horário ou de endereço', href: '#/atendimento' })}
        ${closed ? '' : reorderRow}
      </div>
      ${orders.canCancel(order) ? html`<button class="ord-cancel" type="button" id="ord-cancel" data-cancel>Cancelar pedido</button>` : ''}
    </div>
  `;
}

function notFound(id) {
  return html`
    <div class="container ord">
      <div class="empty">
        <div class="empty__art">${icon('receipt')}</div>
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
    const pending = isPixPending(order);
    if (SITE.demo) {
      // Sem servidor: o que importa é o pedido chegar à BOLAB. O cartão do WhatsApp vem primeiro.
      const active = !isClosed(order);
      return html`
        <div class="container ord">
          <div class="ord-head">${pageHead(`Pedido ${order.id}`, { back: '/pedidos', sub: `Feito em ${dateTime(order.createdAt)}` })}</div>
          ${active ? waCard(order, st, isNew) : ''}
          <p class="sr-only" role="status" data-ord-live></p>
          <div class="ord-layout">
            <div class="ord-main">${honestTrack(order, st)} ${receiptCard(order)} ${pending ? demoPay(order, isNew) : ''}</div>
            <div class="ord-side">${deliveryCard(order)} ${actions(order)}</div>
          </div>
        </div>
      `;
    }
    return html`
      <div class="container ord">
        <div class="ord-head">${pageHead(`Pedido ${order.id}`, { back: '/pedidos', sub: `Feito em ${dateTime(order.createdAt)}` })}</div>
        ${isNew && !pending && st.index <= 1 ? confirmBanner(order) : ''} ${pending ? pixPanel(order, isNew) : ''}
        <div class="ord-layout">
          <div class="ord-main">${trackCard(order, st)} ${receiptCard(order)}</div>
          <div class="ord-side">${deliveryCard(order)} ${actions(order)}</div>
        </div>
      </div>
    `;
  },

  mount(root, ctx) {
    const page = root.firstElementChild;
    const id = ctx.params.id;
    const off = whenStore('orders', () => keepFocus(() => ctx.rerender()));
    const order = orders.get(id);
    if (!order) return off;

    /* Pedido pelo WhatsApp */
    let alive = true;
    const key = msgKey(order);
    if (SITE.demo && !isClosed(order) && !messages.has(key)) {
      // Pedido com bolo 3D: o texto do bolo vem de um módulo carregado só agora.
      carregarBolos(order)
        .catch(() => null) // sem rede: a mensagem segue só com o resumo em texto
        .then((share) => {
          if (!messages.has(key)) messages.set(key, montarMensagem(order, share));
          if (alive) keepFocus(() => ctx.rerender());
        });
    }

    on(page, 'click', '[data-wa-send]', () => {
      const msg = messages.get(key);
      if (msg?.oversize) {
        copyText(msg.full).then((ok) =>
          toast(ok === false ? 'Não deu para copiar. Use "Ver a mensagem" e copie por lá.' : 'Pedido copiado. No WhatsApp, cole a mensagem e envie.', { type: ok === false ? 'error' : 'success', duration: 6000 }),
        );
      }
      // O link abre o WhatsApp (ação do próprio toque). A marcação vem um instante depois, para a
      // tela não ser redesenhada no meio do toque.
      setTimeout(() => {
        justSent.add(id);
        orders.markSent(id);
      }, 500);
    });
    if (justSent.delete(id)) {
      requestAnimationFrame(() => {
        const live = page.querySelector('[data-ord-live]');
        if (live) live.textContent = 'Pedido marcado como enviado pelo WhatsApp. Aguardando confirmação da BOLAB.';
      });
    }

    on(page, 'click', '[data-wa-peek]', () => {
      const msg = messages.get(key);
      if (!msg) return;
      const text = msg.oversize ? msg.full : msg.text;
      const dlg = openDialog({
        title: 'Mensagem do pedido',
        body: html`
          <p class="ord-msg__lead">${msg.oversize ? 'É esta mensagem que você cola no WhatsApp.' : 'É esta mensagem que abre no WhatsApp. Você pode editar lá antes de enviar.'}</p>
          <pre class="ord-msg" tabindex="0" role="region" aria-label="Texto da mensagem">${text}</pre>
        `,
        footer: html`<button class="btn btn--secondary" type="button" data-msg-copy>${icon('copy')}Copiar mensagem</button><button class="btn" type="button" data-dialog-close>Fechar</button>`,
      });
      dlg.el.addEventListener('click', async (ev) => {
        if (!ev.target.closest('[data-msg-copy]')) return;
        const ok = await copyText(text);
        toast(ok === false ? 'Selecione o texto e copie manualmente.' : 'Mensagem copiada.', { type: ok === false ? 'error' : 'success' });
      });
    });

    // Demonstração do Pix: lembra se estava aberta (o evento "toggle" não sobe, por isso a captura).
    page.addEventListener(
      'toggle',
      (ev) => {
        if (!ev.target.matches?.('[data-demo-pay]')) return;
        if (ev.target.open) demoPayOpen.add(id);
        else demoPayOpen.delete(id);
      },
      true,
    );

    // Comemora uma vez só: ao chegar com o pedido pago ou quando o Pix é confirmado.
    if (!SITE.demo && ctx.query.novo === '1' && order.payment.paidAt && !order.canceled && !celebrated.has(id)) {
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
      if (SITE.demo) {
        // Só demonstração: nada foi pago e a situação do pedido continua a mesma.
        demoPayOpen.delete(id);
        orders.markPaid(id);
        toast('Pix simulado. Nada foi cobrado.', { type: 'success' });
        return;
      }
      celebrated.add(id);
      orders.markPaid(id);
      confetti();
      toast('Pix recebido! Seu pedido está confirmado.', { type: 'success' });
      // Depois que a tela se redesenha (ela preserva a rolagem), sobe para mostrar a confirmação.
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    });

    /* Ações */
    on(page, 'click', '[data-reorder]', () => reorderAndGo(id));

    on(page, 'click', '[data-cancel]', async () => {
      const now = orders.get(id);
      const paid = Boolean(now?.payment.paidAt);
      const sent = Boolean(now?.sentAt);
      const yes = await confirmDialog({
        title: 'Cancelar este pedido?',
        message: SITE.demo
          ? sent
            ? 'A BOLAB pode já ter recebido este pedido. Depois de cancelar aqui, avise pelo WhatsApp para ela não começar a produção.'
            : 'Este pedido ainda não foi enviado à BOLAB, então é só confirmar. Nada foi cobrado.'
          : paid
            ? 'Seu pedido ainda não entrou em produção, então o cancelamento é gratuito e o valor pago volta integralmente.'
            : 'Seu pedido ainda não foi pago, então é só confirmar: nada será cobrado.',
        confirmLabel: 'Sim, cancelar',
        cancelLabel: 'Manter pedido',
        danger: true,
      });
      if (!yes) return;
      if (orders.cancel(id)) {
        toast(SITE.demo && sent ? 'Pedido cancelado aqui. Avise a BOLAB pelo WhatsApp.' : 'Pedido cancelado.', { type: 'success', duration: SITE.demo && sent ? 6000 : 3200 });
        // O aviso à BOLAB fica logo no alto da tela.
        if (SITE.demo && sent) requestAnimationFrame(() => document.getElementById('ord-wa-cancel')?.focus());
      } else toast('Não dá mais para cancelar por aqui. Fale com a BOLAB pelo WhatsApp.', { type: 'error' });
    });

    return () => {
      alive = false;
      off();
      clearInterval(timer);
      clearTimeout(copiedTimer);
    };
  },
};
