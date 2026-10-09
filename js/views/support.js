// BOLAB — atendimento (#/atendimento): chat com o Assistente BOLAB + canais de contato.
// O assistente é automático e responde com base em js/data (site.js, products.js) e nas regras
// do personalizador (js/customizer/pricing.js), então as respostas mudam sozinhas quando o dono
// ajusta preços, prazos ou horários.
import { html, raw, icon, on, money, dateLong, toDate, isoDate, confirmDialog } from '../ui.js';
import { pageHead } from '../components.js';
import { auth, orders, chat, schedule } from '../store.js';
import { SITE, COUPONS, WALLET_COUPONS, CATEGORIES } from '../data/site.js';
import { PRODUCTS, SIZES, isCake } from '../data/products.js';
import { SIZES as CUSTOM_SIZES, MAX_LAYERS, DECORS } from '../data/customizer.js';
import { defaultConfig, prepHoursOf } from '../customizer/pricing.js';
import { firstNameOf } from './auth.js';

const TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const WA_URL = `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent('Olá! Vim pelo site da BOLAB e preciso de ajuda.')}`;
// Espaço e hífen "inquebráveis": o número de telefone nunca fica partido em duas linhas.
const WA_LABEL = SITE.whatsappLabel.replace(/ /g, String.fromCharCode(160)).replace(/-/g, String.fromCharCode(8209));
const WA_LINK = `[WhatsApp ${WA_LABEL}](${WA_URL})`;

const norm = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

/* ───────── Respostas (sempre montadas a partir dos dados da loja) ───────── */
function prepRange() {
  const hours = PRODUCTS.filter(isCake).map((p) => p.prepHours || 24);
  return [Math.min(...hours), Math.max(...hours)];
}

function deliveryWindow() {
  const start = SITE.slots[0].split('–')[0].trim();
  const end = SITE.slots[SITE.slots.length - 1].split('–')[1].trim();
  return `das ${start} às ${end}`;
}

function productsMentioned(text) {
  const t = norm(text);
  return PRODUCTS.filter((p) => isCake(p) && [p.name, ...(p.tags || [])].some((tag) => norm(tag).length > 3 && t.includes(norm(tag)))).slice(0, 3);
}

/** "glúten, leite e ovos" */
function listPt(items) {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}` : items[0] || '';
}

/**
 * O que os bolos à venda contêm, lido do cadastro de produtos (campo `allergens`):
 * "Todos os bolos do cardápio levam glúten, leite e ovos. Alguns também levam coco. "
 */
function allergenSummary() {
  const cakes = PRODUCTS.filter(isCake);
  const count = new Map();
  cakes.forEach((p) => (p.allergens || []).forEach((a) => count.set(a, (count.get(a) || 0) + 1)));
  const inAll = [...count].filter(([, n]) => n === cakes.length).map(([a]) => a.toLowerCase());
  const inSome = [...count].filter(([, n]) => n < cakes.length).map(([a]) => a.toLowerCase());
  if (inAll.length) return `Todos os bolos do cardápio levam ${listPt(inAll)}. ${inSome.length ? `Alguns também levam ${listPt(inSome)}. ` : ''}`;
  return inSome.length ? `Conforme o sabor, os bolos podem levar ${listPt(inSome)}. ` : '';
}

/**
 * Prazo do bolo montado em 3D, tirado das mesmas regras que o personalizador usa:
 * do mais simples ao mais elaborado. → [mínimo, máximo] em horas
 */
function customPrepRange() {
  try {
    const base = defaultConfig();
    const simple = { ...base, size: CUSTOM_SIZES[0].id, layers: base.layers.slice(0, 1), fillings: [], decor: { ...base.decor, items: [], message: '' } };
    const elaborate = {
      ...base,
      size: CUSTOM_SIZES[CUSTOM_SIZES.length - 1].id,
      layers: Array.from({ length: MAX_LAYERS }, () => base.layers[0]),
      decor: { ...base.decor, items: DECORS.map((d) => d.id), message: 'Parabéns!' },
    };
    const hours = [simple, base, elaborate].map(prepHoursOf);
    return [Math.min(...hours), Math.max(...hours)];
  } catch {
    const [, max] = prepRange();
    return [max, max];
  }
}

const daysOf = (hours) => Math.max(1, Math.ceil(hours / 24));

/** Prazo sempre em dias: "1 dia", "2 dias". */
function inDays(hours) {
  const d = daysOf(hours);
  return d === 1 ? '1 dia' : `${d} dias`;
}

/** "2 dias" quando o prazo é um só; "2 a 3 dias" quando varia. */
function daysRange(minHours, maxHours) {
  return daysOf(minHours) === daysOf(maxHours) ? inDays(maxHours) : `${daysOf(minHours)} a ${daysOf(maxHours)} dias`;
}

const ANSWERS = {
  // Convenção da loja: primeiro a DATA em que dá para receber; a duração vem só como complemento.
  prazo() {
    const [min, max] = prepRange();
    const [min3d, max3d] = customPrepRange();
    const first = dateLong(schedule.earliest(min)).toLowerCase();
    const first3d = dateLong(schedule.earliest(min3d)).toLowerCase();
    return (
      `Pedindo agora, você recebe a partir de ${first}.` +
      (first3d !== first ? ` Bolos montados em 3D, a partir de ${first3d}.` : '') +
      `\n\nCada bolo é feito sob encomenda: os do cardápio levam ${daysRange(min, max)}; os montados em 3D, ${daysRange(min3d, max3d)}, conforme o tamanho e a decoração. ` +
      `Você escolhe o dia e a janela de horário ao fechar o pedido, e dá para agendar com até ${SITE.scheduleDaysAhead} dias de antecedência.` +
      `\n\nPrecisa para antes? Chame a equipe no ${WA_LINK}.`
    );
  },

  pagamento() {
    return (
      `Você paga aqui mesmo no site, ao fechar o pedido:\n` +
      `• Pix, com ${SITE.pix.discountPct}% de desconto e aprovação na hora\n` +
      `• Cartão de crédito em até ${SITE.card.maxInstallments}x sem juros (parcela mínima de ${money(SITE.card.minInstallment)})` +
      (SITE.demo ? `\n\nModo demonstração: os pagamentos são simulados e nada é cobrado.` : '')
    );
  },

  entrega() {
    const closed = SITE.closedWeekdays.map((d) => WEEKDAYS[d]).join(', ');
    return (
      `Entregamos em ${SITE.region}, com hora marcada. A taxa é de ${money(SITE.shipping.fee)} e sai grátis em pedidos a partir de ${money(SITE.shipping.freeAbove)}.\n\n` +
      `Janelas de entrega: ${deliveryWindow()}.${closed ? ` Dia sem entrega: ${closed}.` : ''}\n\n` +
      `Prefere buscar? A retirada no ${SITE.pickup.name} (${SITE.pickup.address}) não tem custo.`
    );
  },

  cancelar() {
    return (
      `Dá para cancelar sem custo enquanto o pedido ainda não entrou em produção: é só abrir o pedido em [Meus pedidos](#/pedidos).\n\n` +
      `Para mudar data, sabor ou endereço, ou se o bolo já estiver em produção, fale com a equipe pelo ${WA_LINK} que a gente encontra a melhor solução.`
    );
  },

  // A loja só fala de bolos para restrições alimentares quando a categoria existe em js/data/site.js.
  // Sem categoria ativa, a resposta diz com clareza que hoje não há essas opções.
  alergenicos(text = '') {
    const has = (id) => CATEGORIES.some((c) => c.id === id);
    const options = [has('veg') ? '[bolos veganos](#/cardapio?cat=veg)' : '', has('sg') ? '[bolos sem glúten](#/cardapio?cat=sg)' : ''].filter(Boolean).join(' e ');
    const offer = options
      ? `Temos ${options} no cardápio.`
      : `No momento não temos bolos específicos para restrições alimentares (veganos, sem glúten ou sem lactose).`;
    const contains = `${allergenSummary()}A página de cada produto lista os ingredientes e os alergênicos.`;
    // Quem perguntou por uma dieta lê primeiro se temos ou não; quem perguntou pelos alergênicos, a lista.
    const askedDiet = /vegan|gluten|lactose|restric|intoler|celiac|diabet|sem acucar/.test(norm(text));
    return (
      `${askedDiet ? `${offer} ${contains}` : `${contains}\n\n${offer}`}\n\n` +
      `Importante: nossa cozinha manipula trigo, leite, ovos e castanhas, então pode haver traços em qualquer bolo. Em caso de alergia grave, converse com a equipe antes de pedir: ${WA_LINK}.`
    );
  },

  bolo3d() {
    const [min3d, max3d] = customPrepRange();
    const varies = daysOf(min3d) !== daysOf(max3d);
    return (
      `No Monte seu bolo você escolhe formato, andares, massa, recheio, cobertura e decoração, e vê o bolo girando na tela a cada escolha. O preço atualiza na hora, sem surpresa.\n\n` +
      `Gostou do resultado? É só mandar para o carrinho, ou salvar na sua conta para pedir depois. ` +
      `Bolos montados em 3D pedem ${daysRange(min3d, max3d)} de antecedência${varies ? ', conforme o tamanho e a decoração' : ''}. A primeira data de entrega aparece na tela enquanto você monta.\n\n` +
      `[Montar meu bolo em 3D](#/monte-seu-bolo)`
    );
  },

  pedido() {
    if (!auth.isLogged()) {
      return `Para eu consultar o seu pedido, você precisa estar na sua conta: [entrar na minha conta](#/entrar?next=/atendimento).\n\nSe preferir, a equipe confere para você pelo ${WA_LINK}.`;
    }
    const list = orders.list();
    if (!list.length) {
      return `Ainda não encontrei pedidos na sua conta. Quando você fizer um pedido, eu consigo dizer em que etapa ele está.\n\n[Ver cardápio](#/cardapio)`;
    }
    const o = list[0];
    const st = orders.statusOf(o);
    if (st.canceled) return `Seu pedido mais recente, o ${o.id}, foi cancelado. Se precisar de ajuda com ele, fale com a equipe pelo ${WA_LINK}.\n\n[Ver pedido](#/pedido/${o.id})`;
    const step = st.steps[st.index];
    const when = o.delivery?.date ? `${dateLong(o.delivery.date).toLowerCase()}${o.delivery.slot ? `, ${o.delivery.slot}` : ''}` : '';
    const how = o.delivery?.mode === 'pickup' ? 'Retirada' : 'Entrega';
    return (
      `Seu pedido ${o.id} está na etapa “${st.label}”. ${o.payment?.paidAt ? step.desc : 'Estamos aguardando a confirmação do pagamento.'}` +
      (when && st.id !== 'delivered' ? `\n\n${how} agendada para ${when}.` : '') +
      `\n\n[Acompanhar pedido](#/pedido/${o.id})`
    );
  },

  cupons() {
    const alreadyOrdered = auth.isLogged() && orders.list().some((o) => !o.canceled);
    const active = WALLET_COUPONS.map((code) => COUPONS[code]).filter(
      (c) => c && !(c.expires && toDate(c.expires) < new Date()) && !(c.firstOrderOnly && alreadyOrdered),
    );
    const lines = active.map((c) => `• ${c.code}: ${c.label}${c.minSubtotal && !/R\$/.test(c.label) ? ` (a partir de ${money(c.minSubtotal)})` : ''}`);
    return (
      (lines.length ? `Cupons valendo agora:\n${lines.join('\n')}\n\nÉ só digitar o código no carrinho (um cupom por pedido). ` : 'No momento não temos cupons ativos. ') +
      `No Pix você ainda ganha ${SITE.pix.discountPct}% de desconto.` +
      (auth.isLogged() ? `\n\n[Ver meus cupons](#/conta/cupons)` : '')
    );
  },

  tamanhos() {
    const cakes = PRODUCTS.filter(isCake);
    const from = Math.min(...cakes.map((p) => p.price));
    return (
      `Nossos bolos vêm em ${SIZES.length} tamanhos:\n` +
      SIZES.map((s) => `• ${s.label} (${s.diameter}): ${s.serves}`).join('\n') +
      `\n\nOs preços começam em ${money(from)} no tamanho ${SIZES[0].label}, e o valor de cada tamanho aparece na página do bolo.\n\n[Ver cardápio](#/cardapio)`
    );
  },

  cardapio(text) {
    const found = productsMentioned(text);
    const list = found.length
      ? found
      : PRODUCTS.filter(isCake)
          .sort((a, b) => Number(b.featured) - Number(a.featured) || b.reviews - a.reviews)
          .slice(0, 3);
    return (
      `${found.length ? 'Olha o que encontrei no cardápio:' : `Temos ${PRODUCTS.filter(isCake).length} bolos no cardápio. Os mais pedidos:`}\n` +
      list.map((p) => `• [${p.name}](#/produto/${p.id}), a partir de ${money(p.price)}`).join('\n') +
      `\n\nNão achou o que queria? Dá para [montar o seu em 3D](#/monte-seu-bolo) ou [ver o cardápio completo](#/cardapio).`
    );
  },

  contato() {
    return (
      `Você fala com uma pessoa da equipe pelo ${WA_LINK} ou pelo e-mail [${SITE.email}](mailto:${SITE.email}).\n\n` +
      `Horário de atendimento: ${SITE.hours}.\nRetirada: ${SITE.pickup.name}, ${SITE.pickup.address}.`
    );
  },

  obrigado() {
    return 'Imagina! Precisando de mais alguma coisa, é só chamar.';
  },

  saudacao() {
    const name = firstNameOf(auth.user());
    return `Oi${name ? `, ${name}` : ''}! Como posso ajudar? Toque em um dos assuntos aqui embaixo ou escreva a sua dúvida.`;
  },

  fallback() {
    return (
      `Essa eu ainda não sei responder direito. Posso ajudar com prazos, pagamento, entrega, alterações no pedido, alergênicos e o bolo 3D: é só tocar em um dos assuntos abaixo.\n\n` +
      `Se preferir falar com uma pessoa, chame a equipe no ${WA_LINK}. Horário de atendimento: ${SITE.hours}.`
    );
  },
};

/* Palavras-chave por assunto (sem acento). "x$" = palavra inteira; o resto casa com o começo da palavra.
   Em caso de empate, vale o assunto que vem primeiro. */
const INTENTS = [
  { id: 'cancelar', keys: ['cancel', 'alterar', 'alterac', 'altero', 'mudar', 'mudanca', 'trocar', 'troca$', 'desist', 'reembols', 'estorn', 'devol', 'remarc', 'adiar'] },
  { id: 'pedido', keys: ['meu pedido', 'minha encomenda', 'status', 'rastre', 'acompanh', 'onde esta', 'cade$', 'cheg', 'atras', 'andamento', 'numero do pedido'] },
  { id: 'pagamento', keys: ['pagament', 'pagar', 'pago$', 'pix', 'cartao', 'cartoes', 'parcel', 'credito', 'debito', 'boleto', 'dinheiro'] },
  { id: 'prazo', keys: ['prazo', 'anteceden', 'quanto tempo', 'demora', 'amanha', 'hoje$', 'urgent', 'ultima hora', 'fica pronto', 'quando fica', 'quando posso', 'para quando', 'pra quando', 'encomendar'] },
  { id: 'entrega', keys: ['entreg', 'frete', 'taxa', 'regiao', 'bairro', 'area$', 'retir', 'buscar', 'endereco', 'onde fica', 'localiz', 'horario de entrega', 'delivery'] },
  { id: 'alergenicos', keys: ['alerg', 'gluten', 'lactose', 'vegan', 'intoler', 'castanh', 'amendoim', 'celiac', 'diabet', 'sem acucar', 'restric', 'ingrediente'] },
  { id: 'bolo3d', keys: ['3d', 'personaliz', 'montar', 'monte', 'criar bolo', 'criar meu bolo', 'criar um bolo', 'customiz', 'andares', 'do meu jeito'] },
  { id: 'cupons', keys: ['cupom', 'cupons', 'desconto', 'promoc', 'codigo'] },
  { id: 'tamanhos', keys: ['tamanho', 'fatia', 'pessoas', 'serve', 'preco', 'valor', 'custa', 'convidad', 'quantos kg', 'quilo'] },
  { id: 'cardapio', keys: ['cardapio', 'sabor', 'opcoes', 'quais bolos', 'tem bolo', 'catalogo', 'recheio'] },
  { id: 'contato', keys: ['atendente', 'humano', 'pessoa', 'falar com', 'telefone', 'whats', 'zap$', 'contato', 'email', 'e-mail', 'horario', 'abert', 'abre', 'funciona$', 'domingo', 'feriado', 'reclam'] },
  { id: 'obrigado', keys: ['obrigad', 'valeu', 'brigad', 'agradec'] },
  { id: 'saudacao', keys: ['oi$', 'oie$', 'ola$', 'bom dia', 'boa tarde', 'boa noite', 'e ai$', 'opa$', 'hello', 'hey$'] },
].map((intent) => ({
  ...intent,
  tests: intent.keys.map((key) => {
    const whole = key.endsWith('$');
    const body = (whole ? key.slice(0, -1) : key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${body}${whole ? '($|[^a-z0-9])' : ''}`);
  }),
}));

/** Descobre o assunto de uma pergunta digitada. → id do assunto ou 'fallback' */
function intentOf(text) {
  const t = norm(text);
  let best = 'fallback';
  let bestScore = 0;
  INTENTS.forEach((intent) => {
    const score = intent.tests.filter((re) => re.test(t)).length;
    if (score > bestScore) {
      best = intent.id;
      bestScore = score;
    }
  });
  if (best === 'fallback' && productsMentioned(text).length) return 'cardapio';
  return best;
}

function replyTo(text, forced) {
  const id = forced && ANSWERS[forced] ? forced : intentOf(text);
  try {
    return ANSWERS[id](text);
  } catch {
    return ANSWERS.fallback();
  }
}

const QUICK = [
  { id: 'prazo', label: 'Prazo para pedir', ask: 'Com quanta antecedência preciso pedir?' },
  { id: 'pagamento', label: 'Formas de pagamento', ask: 'Quais são as formas de pagamento?' },
  { id: 'entrega', label: 'Área de entrega', ask: 'Vocês entregam em qual região?' },
  { id: 'cancelar', label: 'Alterar ou cancelar pedido', ask: 'Como altero ou cancelo um pedido?' },
  { id: 'alergenicos', label: 'Alergênicos', ask: 'Quais alergênicos os bolos contêm?' },
  { id: 'bolo3d', label: 'Como funciona o bolo 3D', ask: 'Como funciona o bolo personalizado em 3D?' },
];

/* ───────── Mensagens ───────── */
const LINK_OK = /^(#\/|https:\/\/wa\.me\/|mailto:)/;

function lines(text) {
  return String(text)
    .split('\n')
    .map((line, i) => (i ? html`<br />${line}` : line));
}

/** Texto do assistente: aceita [rótulo](link) só para endereços da própria loja, WhatsApp e e-mail. */
function rich(text) {
  const out = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    out.push(lines(text.slice(last, m.index)));
    if (LINK_OK.test(m[2])) {
      const external = !m[2].startsWith('#');
      out.push(html`<a class="link" href="${m[2]}" ${external ? raw('target="_blank" rel="noopener"') : ''}>${m[1]}</a>`);
    } else out.push(m[0]);
    last = re.lastIndex;
  }
  out.push(lines(text.slice(last)));
  return out;
}

function messageHtml(m, { still = false } = {}) {
  const me = m.from === 'me';
  return html`
    <div class="sup-msg ${me ? 'sup-msg--me' : ''} ${still ? 'sup-msg--still' : ''}">
      ${me ? '' : html`<span class="sup-bot sup-bot--sm" aria-hidden="true">${icon('cake')}</span>`}
      <div class="sup-msg__col">
        <div class="sup-msg__bubble"><span class="sr-only">${me ? 'Você: ' : 'Assistente: '}</span>${me ? lines(m.text) : rich(m.text)}</div>
        ${m.at ? html`<time class="sup-msg__time" datetime="${new Date(m.at).toISOString()}">${TIME.format(m.at)}</time>` : ''}
      </div>
    </div>
  `;
}

function dayLabel(at) {
  const key = isoDate(new Date(at));
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (key === isoDate(today)) return 'Hoje';
  if (key === isoDate(yesterday)) return 'Ontem';
  return dateLong(at);
}

function introHtml() {
  const name = firstNameOf(auth.user());
  return messageHtml(
    {
      from: 'bolab',
      text:
        `Oi${name ? `, ${name}` : ''}! Eu sou o Assistente BOLAB, o atendimento automático da loja.\n\n` +
        `Respondo na hora às dúvidas mais comuns sobre pedidos e entregas. O que eu não souber, passo para a nossa equipe.`,
    },
    { still: true },
  );
}

function historyHtml() {
  let lastDay = '';
  return chat.list().map((m) => {
    const day = isoDate(new Date(m.at));
    const sep = day !== lastDay ? html`<div class="sup-day">${dayLabel(m.at)}</div>` : '';
    lastDay = day;
    return html`${sep}${messageHtml(m, { still: true })}`;
  });
}

function contactHtml() {
  return html`
    <aside class="sup-contact" aria-label="Outros canais de atendimento">
      <h2 class="sup-contact__title">Fale com a equipe</h2>
      <div class="sup-contact__list">
        <a class="sup-contact__item sup-contact__item--wa" href="${WA_URL}" target="_blank" rel="noopener">
          <span class="sup-contact__icon">${icon('whatsapp')}</span>
          <div><strong>WhatsApp</strong><small>${SITE.whatsappLabel}</small></div>
          ${icon('chevron-right')}
        </a>
        <a class="sup-contact__item" href="mailto:${SITE.email}">
          <span class="sup-contact__icon">${icon('mail')}</span>
          <div><strong>E-mail</strong><small>${SITE.email}</small></div>
          ${icon('chevron-right')}
        </a>
        <div class="sup-contact__item sup-contact__item--info">
          <span class="sup-contact__icon">${icon('clock')}</span>
          <div><strong>Horário de atendimento</strong><small>${SITE.hours}</small></div>
        </div>
        <div class="sup-contact__item sup-contact__item--info">
          <span class="sup-contact__icon">${icon('store')}</span>
          <div><strong>Retirada no ${SITE.pickup.name}</strong><small>${SITE.pickup.address}</small></div>
        </div>
      </div>
      <p class="acc-note sup-contact__note">${icon('info')}<span>A equipe responde no horário de atendimento. Fora dele, deixe sua mensagem que retornamos assim que abrirmos.</span></p>
    </aside>
  `;
}

export default {
  title: 'Atendimento',
  layout: 'plain',

  render() {
    const hasHistory = chat.list().length > 0;
    const hasOrders = auth.isLogged() && orders.count() > 0;
    return html`
      <div class="container sup">
        ${pageHead('Atendimento', { back: '/', sub: 'Tire suas dúvidas na hora ou fale com a nossa equipe.' })}
        <div class="sup-layout">
          <section class="card sup-chat" aria-label="Conversa com o Assistente BOLAB">
            <header class="sup-chat__head">
              <span class="sup-bot" aria-hidden="true">${icon('cake')}</span>
              <div class="sup-chat__who">
                <strong>Assistente BOLAB</strong>
                <span>Virtual · responde na hora</span>
              </div>
              <button class="btn btn--ghost btn--sm sup-clear" type="button" data-clear aria-label="Limpar conversa" ${hasHistory ? '' : raw('hidden')}>
                ${icon('trash')}<span class="only-desktop">Limpar conversa</span>
              </button>
            </header>

            <div class="sup-chat__list" data-list role="log" aria-live="polite" aria-label="Mensagens" tabindex="0">${introHtml()}${historyHtml()}</div>

            <div class="sup-chat__bottom">
              <div class="sup-quick" role="group" aria-label="Perguntas frequentes">
                ${hasOrders
                  ? html`<button class="sup-chip" type="button" data-quick="pedido" data-ask="Como está o meu pedido?"><span class="chip">${icon('package')} Meu pedido</span></button>`
                  : ''}
                ${QUICK.map((q) => html`<button class="sup-chip" type="button" data-quick="${q.id}" data-ask="${q.ask}"><span class="chip">${q.label}</span></button>`)}
              </div>
              <form class="sup-chat__form" data-chat-form autocomplete="off">
                <label class="sr-only" for="sup-input">Sua mensagem</label>
                <input class="input" id="sup-input" name="text" type="text" placeholder="Escreva sua dúvida…" maxlength="400" enterkeyhint="send" autocomplete="off" />
                <button class="sup-send" type="submit" aria-label="Enviar mensagem">${icon('send')}</button>
              </form>
            </div>
          </section>

          ${contactHtml()}
        </div>
      </div>
    `;
  },

  mount(root) {
    const list = root.querySelector('[data-list]');
    const clearBtn = root.querySelector('[data-clear]');
    const input = root.querySelector('#sup-input');
    const pending = []; // respostas que o assistente ainda está "digitando"
    let nextAt = 0;
    let typingEl = null;
    let lastDay = chat.list().length ? isoDate(new Date(chat.list()[chat.list().length - 1].at)) : '';

    const toBottom = () => {
      list.scrollTop = list.scrollHeight;
    };

    function append(m) {
      const day = isoDate(new Date(m.at));
      const tpl = document.createElement('template');
      tpl.innerHTML = String(html`${day !== lastDay ? html`<div class="sup-day">${dayLabel(m.at)}</div>` : ''}${messageHtml(m)}`);
      lastDay = day;
      list.insertBefore(tpl.content, typingEl); // a bolinha de "digitando" fica sempre por último
      clearBtn.hidden = false;
      toBottom();
    }

    function setTyping(show) {
      if (show && !typingEl) {
        const tpl = document.createElement('template');
        tpl.innerHTML = String(html`
          <div class="sup-msg" data-typing>
            <span class="sup-bot sup-bot--sm" aria-hidden="true">${icon('cake')}</span>
            <div class="sup-msg__bubble"><span class="sr-only">O assistente está escrevendo</span><span class="sup-typing" aria-hidden="true"><i></i><i></i><i></i></span></div>
          </div>
        `);
        typingEl = tpl.content.firstElementChild;
        list.appendChild(typingEl);
        toBottom();
      } else if (!show && typingEl) {
        typingEl.remove();
        typingEl = null;
      }
    }

    function deliver(job) {
      const i = pending.indexOf(job);
      if (i >= 0) pending.splice(i, 1);
      if (!pending.length) setTyping(false);
      append(chat.add('bolab', job.text));
    }

    function send(text, forced) {
      const clean = String(text || '').trim();
      if (!clean) return;
      append(chat.add('me', clean));
      const answer = replyTo(clean, forced);
      // Uma pausa curta, proporcional ao tamanho da resposta; várias perguntas saem em fila.
      nextAt = Math.max(Date.now(), nextAt) + 550 + Math.min(900, answer.length * 3);
      const job = { text: answer };
      job.timer = setTimeout(() => deliver(job), nextAt - Date.now());
      pending.push(job);
      setTyping(true);
    }

    on(root, 'submit', '[data-chat-form]', (ev) => {
      ev.preventDefault();
      send(input.value);
      input.value = '';
      input.focus({ preventScroll: true });
    });

    on(root, 'click', '[data-quick]', (_ev, btn) => send(btn.dataset.ask, btn.dataset.quick));

    on(root, 'click', '[data-clear]', async () => {
      const ok = await confirmDialog({
        title: 'Limpar a conversa?',
        message: 'As mensagens deste atendimento serão apagadas deste aparelho.',
        confirmLabel: 'Limpar',
        cancelLabel: 'Manter',
        danger: true,
      });
      if (!ok) return;
      pending.splice(0).forEach((job) => clearTimeout(job.timer));
      nextAt = 0;
      typingEl = null;
      lastDay = '';
      chat.clear();
      list.innerHTML = String(introHtml());
      clearBtn.hidden = true;
    });

    toBottom();

    // Saindo da tela com uma resposta a caminho: ela é gravada, para o histórico não ficar sem resposta.
    return () => {
      pending.splice(0).forEach((job) => {
        clearTimeout(job.timer);
        chat.add('bolab', job.text);
      });
    };
  },
};
