// BOLAB — o pedido em uma mensagem de WhatsApp e o link da cozinha.
//
// Enquanto a loja não tem servidor, o pedido fechado fica só no aparelho do cliente. É esta mensagem
// que leva o pedido até a confeitaria: o cliente toca em "Enviar pedido pelo WhatsApp", o WhatsApp
// abre com o texto pronto e ele envia. Nada sai sozinho: o envio é sempre um toque do cliente.
//
//   canal()                    → { number, label, valid, demo }   (o número vem de SITE.whatsapp, em js/data/site.js)
//   carregarBolos(pedido)      → módulo share.js quando o pedido tem bolo 3D (carregado só nesse caso), senão null
//   montarMensagem(pedido, share) → { text, url, full, level, length, oversize, kitchen }
//   avisoDeCancelamento(pedido)   → endereço wa.me com o aviso de cancelamento
//   lerCozinha(query)          → o que o link da cozinha carrega: { order, date, slot, mode, items, cakes }
//
// O QUE VAI ONDE (privacidade):
//   • TEXTO da mensagem: tudo o que o cliente quer contar à confeitaria (nome, telefone, endereço,
//     recados, observação). É a conversa dele; a loja não manda nada disso para lugar nenhum.
//   • LINK da cozinha (#/cozinha?…): só o que serve para produzir. Número do pedido, dia, horário,
//     entrega ou retirada, itens do cardápio (código, tamanho, quantidade) e os bolos 3D (a mesma
//     configuração do link "monte-seu-bolo?c="). Sem nome, telefone, endereço nem recado. Tudo fica
//     depois do "#", que o navegador não envia a servidor nenhum.
//
// CHÁ REVELAÇÃO (a cor é segredo):
//   • O texto da mensagem nunca diz a cor (o resumo guardado no pedido já vem sem ela).
//   • O link "Ver em 3D" de cada bolo é gerado com secret: false: não carrega a cor (abre o mesmo
//     bolo, sem o chá revelação marcado).
//   • A confeitaria PRECISA da cor, e sem servidor o único caminho é a própria mensagem. Ela vai só
//     dentro do link da cozinha, embaralhada no texto da configuração (não dá para ler a olho), e a
//     tela da cozinha só mostra a cor depois de um toque em "Mostrar a cor". Limite honesto: quem
//     abrir esse link e tocar ali vê a cor. Segredo de verdade só com servidor (a cor iria direto
//     para a confeitaria, fora da conversa).
//
// TAMANHO: o WhatsApp não publica um limite para o texto do link wa.me; relatos apontam problemas a
// partir de uns 2 mil caracteres em alguns aparelhos. A mensagem é encurtada por etapas até caber
// na meta (LIMITES.alvo). Se nem a versão mais curta couber no teto, o botão copia o pedido completo
// e abre o WhatsApp com um texto curto, para o cliente colar.
import { SITE } from './data/site.js';
import { money } from './ui.js';

/** Número de demonstração que vem em js/data/site.js. Enquanto for este, a tela avisa que é exemplo. */
const NUMERO_DE_EXEMPLO = '5565999990000';

export const LIMITES = { alvo: 2000, teto: 4000 };

const ID_RE = /^[\w-]{1,64}$/;
const BOLO_RE = /^(\d{1,2})\.(\d{1,3}\.[A-Za-z0-9_-]{0,6000})$/;
const ITEM_RE = /^([\w-]{1,40})\.([a-z0-9]{1,2})\.(\d{1,2})$/;
const MAX_LINHAS = 40;

/** Para onde o pedido é enviado. `demo`: o número ainda é o de exemplo. `valid`: dá para montar o link. */
export function canal() {
  const number = String(SITE.whatsapp || '').replace(/\D/g, '');
  return { number, label: String(SITE.whatsappLabel || ''), valid: /^\d{10,15}$/.test(number), demo: number === NUMERO_DE_EXEMPLO };
}

/**
 * Endereço da loja usado nos links da mensagem. É sempre o endereço oficial (SITE.url): quem abre o
 * link é a confeitaria, em outro aparelho, e o endereço interno do aplicativo Android não existe
 * fora dele. Só em desenvolvimento (localhost) vale o endereço que está aberto.
 */
function lojaBase() {
  const here = typeof location !== 'undefined' ? location : null;
  if (here && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(here.hostname)) return `${here.origin}${here.pathname}`;
  return SITE.url;
}

const waUrl = (text) => `https://wa.me/${canal().number}?text=${encodeURIComponent(text)}`;

/* ───────── Texto ───────── */
const WEEKDAY = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' });
const NBSP = new RegExp(String.fromCharCode(0xa0), 'g');
const reais = (v) => money(v).replace(NBSP, ' ');
const oneLine = (v, max = 300) => {
  const s = String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
};

/** "sábado, 21/11": na mensagem a data é sempre a do calendário (nunca "amanhã": ela é lida depois). */
function dia(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAY.format(date)}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

/** "14:00 – 16:00" → "das 14h às 16h" */
function janela(slot) {
  const [a, b] = String(slot)
    .split('–')
    .map((part) => {
      const [h, m] = part.trim().split(':');
      return `${Number(h)}h${m && m !== '00' ? m : ''}`;
    });
  return `das ${a} às ${b}`;
}

/** "Massa: Baunilha" → "Baunilha" */
function valor(text) {
  const str = String(text);
  const i = str.indexOf(': ');
  return i > 0 && i <= 40 ? str.slice(i + 2) : str;
}

function endereco(a) {
  if (!a) return [];
  const rua = [a.street, a.number].filter(Boolean).join(', ');
  const cidade = [a.district, [a.city, a.uf].filter(Boolean).join('/')].filter(Boolean).join(', ');
  const out = [`${rua}${a.complement ? ` (${a.complement})` : ''}${cidade ? ` - ${cidade}` : ''}${a.cep ? `, CEP ${a.cep}` : ''}`];
  if (a.reference) out.push(`Ref.: ${oneLine(a.reference, 120)}`);
  return out;
}

function pagamento(order) {
  const p = order.payment;
  const n = p.installments || 1;
  const forma = p.method === 'card' ? `Cartão de crédito${n > 1 ? ` em ${n}x de ${reais(order.totals.total / n)}` : ', à vista'}` : `Pix${order.totals.pixDiscount > 0 ? ` (${SITE.pix.discountPct}% de desconto)` : ''}`;
  // Sem servidor nada é cobrado pela loja: a confeitaria não pode ler "pago" em um pedido que ninguém pagou.
  const situacao = SITE.demo ? 'a combinar (nada foi cobrado pelo site)' : p.paidAt ? 'pago pelo site' : 'aguardando pagamento';
  return `${forma}, ${situacao}`;
}

/**
 * O texto do pedido. `level` encurta por etapas:
 *   0 completo · 1 sem o link "Ver em 3D" de cada bolo (a tela da cozinha abre o 3D) ·
 *   2 resumo do bolo em uma linha (o resto está na ficha) · 3 sem porções e sem as parcelas do total.
 */
function compor(order, { level, bolos, kitchen }) {
  const pickup = order.delivery.mode === 'pickup';
  const t = order.totals;
  const out = ['Olá! Fiz este pedido pelo site:', `*Pedido ${order.id}*`, '', '*Itens*'];

  order.items.forEach((l) => {
    const custom = l.kind === 'custom';
    const size = oneLine(String(l.sizeLabel || '').replace(/^Tamanho\s+/i, ''), 60);
    const short = size.split(' · ')[0];
    const detail = [custom ? 'bolo montado em 3D' : '', level >= 3 ? (custom ? '' : short) : size.replace(/ · /g, ', ')].filter(Boolean).join('; ');
    out.push(`${l.qty}x ${oneLine(l.name, 80)}${detail ? ` (${detail})` : ''} - ${reais(l.price * l.qty)}`);
    if (custom) {
      const parts = (Array.isArray(l.summary) ? l.summary : []).map(valor);
      if (parts.length) out.push(`  ${level >= 2 ? `${oneLine(parts[0], 80)}. O resto está na ficha.` : oneLine(parts.join('; '), 420)}`);
      const links = bolos.get(l.lineId);
      if (l.config?.reveal?.on) out.push('  Chá revelação: a cor vai em segredo, só na ficha da cozinha.');
      if (links && level === 0) out.push(`  Ver em 3D: ${lojaBase()}#/monte-seu-bolo?c=${links.publico}`);
      if (!links) out.push('  (Sem ficha neste link: combinar os detalhes por aqui.)');
    }
    if (l.note) out.push(`  Recado: ${oneLine(l.note, 200)}`);
  });

  out.push('', `*${pickup ? 'Retirada no ateliê' : 'Entrega'}:* ${dia(order.delivery.date)}, ${janela(order.delivery.slot)}`);
  if (!pickup) out.push(...endereco(order.address));
  const who = [oneLine(order.contact?.name, 80), oneLine(order.contact?.phone, 20)].filter(Boolean).join(', ');
  if (who) out.push(`${pickup ? 'Quem retira' : 'Quem recebe'}: ${who}`);
  out.push(`Código de ${pickup ? 'retirada' : 'entrega'}: ${order.code}`);

  out.push('', `*Pagamento:* ${pagamento(order)}`);
  if (level < 3) {
    out.push(`Subtotal: ${reais(t.subtotal)}`);
    if (t.couponDiscount > 0) out.push(`Cupom${t.coupon ? ` ${t.coupon}` : ''}: - ${reais(t.couponDiscount)}`);
    if (t.pixDiscount > 0) out.push(`Desconto no Pix: - ${reais(t.pixDiscount)}`);
    if (!pickup) out.push(`Taxa de entrega: ${t.shipping === 0 ? 'grátis' : reais(t.shipping)}`);
  }
  out.push(`*Total: ${reais(t.total)}*`);

  if (order.note) out.push('', `Obs.: ${oneLine(order.note, 300)}`);
  if (kitchen) out.push('', `Ficha de produção dos bolos (para a cozinha): ${kitchen}`);
  return out.join('\n');
}

/* ───────── Link da cozinha ───────── */

/** "14:00 – 16:00" ↔ "1400-1600" */
const slotToLink = (slot) => String(slot).replace(/[^\d–-]/g, '').replace('–', '-');
function slotFromLink(v) {
  const m = /^(\d{1,2})(\d{2})-(\d{1,2})(\d{2})$/.exec(String(v || ''));
  return m && Number(m[1]) < 24 && Number(m[3]) <= 24 ? `${m[1].padStart(2, '0')}:${m[2]} – ${m[3].padStart(2, '0')}:${m[4]}` : '';
}

/**
 * Endereço da tela da cozinha para este pedido ('' quando não há bolo 3D com ficha).
 * Só leva o que serve para produzir (ver o cabeçalho deste arquivo).
 */
function linkDaCozinha(order, bolos) {
  const cakes = order.items.filter((l) => l.kind === 'custom' && bolos.has(l.lineId));
  if (!cakes.length) return '';
  const q = [`n=${order.id.replace(/\D/g, '')}`, `d=${order.delivery.date}`, `h=${slotToLink(order.delivery.slot)}`, `m=${order.delivery.mode === 'pickup' ? 'r' : 'e'}`];
  order.items
    .filter((l) => l.kind === 'product' && ID_RE.test(l.productId) && !l.productId.includes('.'))
    .forEach((l) => q.push(`i=${l.productId}.${l.size || '0'}.${l.qty}`));
  cakes.forEach((l) => q.push(`b=${l.qty}.${bolos.get(l.lineId).cozinha}`));
  return `${lojaBase()}#/cozinha?${q.join('&')}`;
}

/**
 * Lê o que veio no link da cozinha. Tudo é conferido (o link pode ter sido alterado): o que não
 * estiver no formato é ignorado. → { order, date, slot, mode, items: [{ id, size, qty }], cakes: [{ qty, text }] }
 */
export function lerCozinha(query) {
  const raw = String(query || '').slice(0, 60000);
  const q = new URLSearchParams(raw);
  const n = q.get('n') || '';
  const d = q.get('d') || '';
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(new Date(`${d}T12:00:00`).getTime());
  const items = q
    .getAll('i')
    .slice(0, MAX_LINHAS)
    .map((v) => ITEM_RE.exec(v))
    .filter(Boolean)
    .map((m) => ({ id: m[1], size: m[2] === '0' ? null : m[2], qty: Math.max(1, Math.min(20, Number(m[3]))) }));
  const cakes = q
    .getAll('b')
    .slice(0, MAX_LINHAS)
    .map((v) => BOLO_RE.exec(v))
    .filter(Boolean)
    .map((m) => ({ qty: Math.max(1, Math.min(20, Number(m[1]))), text: m[2] }));
  return {
    order: /^\d{1,9}$/.test(n) ? `BOL-${n}` : '',
    date: dateOk ? d : '',
    slot: slotFromLink(q.get('h')),
    mode: q.get('m') === 'r' ? 'pickup' : 'delivery',
    items,
    cakes,
  };
}

/* ───────── Mensagem ───────── */

/**
 * O módulo que transforma o bolo em texto (js/customizer/share.js) traz junto o catálogo inteiro do
 * personalizador; por isso só é carregado quando o pedido tem bolo montado no 3D.
 */
export async function carregarBolos(order) {
  if (!order.items.some((l) => l.kind === 'custom' && l.config)) return null;
  return import('./customizer/share.js');
}

/**
 * A mensagem do pedido, pronta para o WhatsApp.
 *   share: o módulo devolvido por carregarBolos(pedido) (null quando o pedido não tem bolo 3D)
 * → { text, url, full, level, length, oversize, kitchen }
 *   text: o que vai no link · full: a versão completa (para "Copiar mensagem") · length: tamanho do link
 *   oversize: nem a versão mais curta coube no teto; `url` abre o WhatsApp com um texto curto e o
 *   pedido completo (`full`) vai pela área de transferência.
 */
export function montarMensagem(order, share = null) {
  const bolos = new Map(); // lineId → { publico (sem a cor do chá revelação), cozinha (completo) }
  if (share) {
    order.items.forEach((l) => {
      if (l.kind !== 'custom' || !l.config) return;
      try {
        bolos.set(l.lineId, { publico: share.encodeConfig(l.config, { secret: false }), cozinha: share.encodeConfig(l.config) });
      } catch {
        // configuração ilegível: o bolo segue só com o resumo em texto
      }
    });
  }
  const kitchen = linkDaCozinha(order, bolos);
  const full = compor(order, { level: 0, bolos, kitchen });
  // A primeira versão que cabe na meta. Se nenhuma couber, não adianta cortar porções e parcelas
  // (etapa 3) por meia dúzia de caracteres: fica a etapa 2, a não ser que só a 3 caiba no teto.
  const versions = [full, ...[1, 2, 3].map((n) => compor(order, { level: n, bolos, kitchen }))];
  let level = versions.findIndex((v) => waUrl(v).length <= LIMITES.alvo);
  if (level < 0) level = waUrl(versions[2]).length <= LIMITES.teto ? 2 : 3;
  const text = versions[level];
  const url = waUrl(text);
  if (url.length > LIMITES.teto) {
    const short = `Olá! Fiz o pedido ${order.id} pelo site. Vou colar os detalhes na próxima mensagem.`;
    return { text: short, url: waUrl(short), full, level, length: waUrl(short).length, oversize: true, kitchen };
  }
  return { text, url, full, level, length: url.length, oversize: false, kitchen };
}

/** Link que abre o WhatsApp com o aviso de cancelamento (o cancelamento na loja não chega à confeitaria sozinho). */
export function avisoDeCancelamento(order) {
  const pickup = order.delivery.mode === 'pickup';
  return waUrl(`Olá! Preciso cancelar o pedido ${order.id} (${pickup ? 'retirada' : 'entrega'} ${dia(order.delivery.date)}, ${janela(order.delivery.slot)}). Pode confirmar o cancelamento?`);
}
