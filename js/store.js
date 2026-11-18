// BOLAB — estado da loja (carrinho, conta, pedidos, favoritos), salvo no aparelho.
//
// MODO DEMONSTRAÇÃO: tudo fica no localStorage do navegador. Não há servidor.
// Quando houver um backend, este é o único arquivo que precisa trocar de implementação;
// as telas só usam as funções exportadas aqui.
//
// SEGURANÇA (ver README, seção "Segurança"): o que está no aparelho pode ser lido e alterado por
// quem tem o aparelho na mão. Por isso (1) tudo o que é relido passa por conferência de tipo e
// tamanho, (2) o preço dos itens do cardápio é sempre refeito pelo cardápio e (3) o que só um
// servidor pode garantir (quem é a pessoa, preço do bolo 3D, cupom de primeira compra, vagas da
// agenda) está marcado com "SÓ COM SERVIDOR" nos comentários.

import { SITE, COUPONS, ORDER_STEPS } from './data/site.js';
import { getProduct, priceOf, SIZES } from './data/products.js';
import { cardBrand, toDate, isoDate } from './ui.js';

const KEY = 'bolab:v1';
const MAX_QTY = 20;

/* ───────── Formato dos dados salvos ─────────
   `v` é a versão do formato. Regras para mexer nele sem perder dado de ninguém:
   • Mudança que só ACRESCENTA campo não sobe a versão (quem lê ignora o que não conhece).
   • Mudança que troca o sentido de um campo sobe VERSION e ganha um passo em MIGRATIONS
     (de N para N+1). Dados antigos passam por todos os passos na abertura.
   • Dados gravados por uma versão MAIS NOVA da loja (outra aba que já atualizou) não são
     apagados: lemos o que conhecemos, guardamos o resto como veio e mantemos o `v` deles. */
const VERSION = 1;
const MIGRATIONS = {
  // 1: (s) => ({ ...s, v: 2, cart: { ...s.cart, campoNovo: … } }),
};

const SESSION_KEYS = ['bolab:checkout', 'bolab:pix']; // rascunhos por aba (sessionStorage)
const MAX_CUSTOM_PRICE = 20000;
const THUMB_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const ID_RE = /^[\w-]{1,64}$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const SLOT_RE = /^\d{1,2}:\d{2}\s*–\s*\d{1,2}:\d{2}$/;
const BAD_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const DAY = 864e5;

/* ───────── Conferência do que vem do aparelho ───────── */
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
const finite = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const clampInt = (v, min, max, fallback) => {
  const n = typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
};
const list = (v, maxItems, maxLen) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, maxItems).map((x) => x.slice(0, maxLen)) : []);
const round2 = (n) => Math.round(n * 100) / 100;
/** Campos extras (de versões futuras ou de outras partes da loja) seguem junto, menos as chaves perigosas. */
const rest = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !BAD_KEYS.has(k)));

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
const idOf = (v) => (typeof v === 'string' && ID_RE.test(v) ? v : uid());

/** Miniatura do bolo 3D: só imagem gerada aqui mesmo (data:image), nunca um endereço de fora. */
function cleanThumb(v) {
  return typeof v === 'string' && v.length <= 600000 && THUMB_RE.test(v) ? v : '';
}

function blankUserData() {
  return { favorites: [], savedCakes: [], addresses: [], cards: [], orders: [], chat: [], cart: null };
}

const blankSession = () => ({ userId: null, at: 0, seen: 0 });
const blankCart = () => ({ lines: [], coupon: null, note: '' });

function defaults() {
  return { v: VERSION, session: blankSession(), users: [], cart: blankCart(), data: { guest: blankUserData() }, prefs: {}, seq: { order: 1041 } };
}

/** Linha de produto montada a partir do cardápio: nome, preço, foto e prazo nunca vêm de fora. */
function productLine(p, sizeId, { lineId = uid(), qty = 1, note = '' } = {}) {
  const sizeObj = p.sizes === null ? null : SIZES.find((s) => s.id === sizeId) || SIZES[0];
  return {
    lineId,
    kind: 'product',
    productId: p.id,
    name: p.name,
    size: sizeObj ? sizeObj.id : null,
    sizeLabel: sizeObj ? `Tamanho ${sizeObj.label} · ${sizeObj.serves}` : '',
    price: priceOf(p, sizeObj ? sizeObj.id : 'p'),
    qty: clampInt(qty, 1, MAX_QTY, 1),
    note: text(note, 300),
    photo: p.photo,
    prepHours: p.prepHours,
  };
}

/**
 * Bolo montado no 3D. → linha, ou null se o preço não for um valor possível.
 * SÓ COM SERVIDOR: o preço do bolo 3D vem do personalizador (js/customizer/pricing.js) e é
 * guardado na linha; aqui só dá para conferir a faixa. O servidor precisa refazer a conta a
 * partir de `config` antes de cobrar.
 */
function customLine(l, { lineId = uid() } = {}) {
  const price = Number(l.price);
  if (!Number.isFinite(price) || price <= 0 || price > MAX_CUSTOM_PRICE) return null;
  return {
    ...rest(l),
    lineId,
    kind: 'custom',
    productId: 'custom',
    name: text(l.name, 80) || 'Bolo personalizado',
    size: null,
    sizeLabel: text(l.sizeLabel, 80),
    price: round2(price),
    qty: clampInt(l.qty, 1, MAX_QTY, 1),
    note: text(l.note, 300),
    thumb: cleanThumb(l.thumb),
    config: isObj(l.config) ? l.config : null,
    summary: list(l.summary, 40, 160),
    prepHours: clampInt(l.prepHours, 0, 720, 48),
  };
}

/**
 * Linha relida do aparelho. No carrinho o item do cardápio é refeito pelo cardápio (preço de hoje;
 * produto que saiu do cardápio sai do carrinho). Em pedido já fechado (`history`) vale o cobrado.
 */
function cleanLine(l, { history = false } = {}) {
  if (!isObj(l)) return null;
  const lineId = idOf(l.lineId);
  if (l.kind === 'custom') return customLine(l, { lineId });
  if (l.kind !== 'product') return null;
  if (!history) {
    const p = getProduct(l.productId);
    return p ? productLine(p, l.size, { lineId, qty: l.qty, note: l.note }) : null;
  }
  const price = Number(l.price);
  if (!Number.isFinite(price) || price < 0) return null;
  return {
    lineId,
    kind: 'product',
    productId: text(l.productId, 40),
    name: text(l.name, 80) || 'Item',
    size: l.size == null ? null : text(l.size, 2),
    sizeLabel: text(l.sizeLabel, 80),
    price: round2(price),
    qty: clampInt(l.qty, 1, MAX_QTY, 1),
    note: text(l.note, 300),
    photo: text(l.photo, 40),
    prepHours: clampInt(l.prepHours, 0, 720, 24),
  };
}

function cleanAddress(a) {
  if (!isObj(a)) return null;
  return {
    id: idOf(a.id),
    isDefault: a.isDefault === true,
    label: text(a.label, 30) || 'Casa',
    cep: text(a.cep, 9),
    street: text(a.street, 120),
    number: text(a.number, 12),
    complement: text(a.complement, 60),
    district: text(a.district, 80),
    city: text(a.city, 80),
    uf: text(a.uf, 2),
    reference: text(a.reference, 120),
  };
}

/** Cartão salvo: só bandeira, final, nome e validade. Qualquer outro campo é descartado. */
function cleanCard(c) {
  if (!isObj(c)) return null;
  const last4 = text(c.last4, 8).replace(/\D/g, '').slice(-4);
  if (last4.length !== 4) return null;
  return {
    id: idOf(c.id),
    brand: text(c.brand, 20) || 'Cartão',
    last4,
    holder: text(c.holder, 40),
    expiry: typeof c.expiry === 'string' && /^\d{2}\/\d{2}$/.test(c.expiry) ? c.expiry : '',
    isDefault: c.isDefault === true,
  };
}

function cleanOrder(o) {
  if (!isObj(o) || typeof o.id !== 'string' || !/^BOL-\d{1,9}$/.test(o.id)) return null;
  const d = o.delivery;
  if (!isObj(d) || typeof d.date !== 'string' || !ISO_DAY.test(d.date) || Number.isNaN(toDate(d.date).getTime())) return null;
  if (typeof d.slot !== 'string' || !SLOT_RE.test(d.slot) || !isObj(o.payment)) return null;
  const items = (Array.isArray(o.items) ? o.items : []).map((l) => cleanLine(l, { history: true })).filter(Boolean);
  if (!items.length) return null;
  const t = isObj(o.totals) ? o.totals : {};
  const amount = (k) => round2(Math.max(0, finite(t[k])));
  const pay = o.payment;
  const card = pay.method === 'card';
  return {
    id: o.id,
    code: typeof o.code === 'string' && /^\d{4,6}$/.test(o.code) ? o.code : '0000',
    createdAt: finite(o.createdAt, Date.now()),
    userId: text(o.userId, 64),
    items,
    note: text(o.note, 300),
    totals: {
      subtotal: amount('subtotal'),
      shipping: amount('shipping'),
      shippingFull: amount('shippingFull'),
      couponDiscount: amount('couponDiscount'),
      pixDiscount: amount('pixDiscount'),
      discount: amount('discount'),
      total: amount('total'),
      coupon: typeof t.coupon === 'string' && /^[A-Z0-9]{1,20}$/.test(t.coupon) ? t.coupon : null,
      couponIssue: '',
      freeShippingMissing: amount('freeShippingMissing'),
      freeShippingPct: clampInt(t.freeShippingPct, 0, 100, 0),
      itemCount: items.reduce((n, l) => n + l.qty, 0),
    },
    delivery: { mode: d.mode === 'pickup' ? 'pickup' : 'delivery', date: d.date, slot: d.slot },
    address: cleanAddress(o.address),
    payment: {
      method: card ? 'card' : 'pix',
      ...(card ? { brand: text(pay.brand, 20), last4: text(pay.last4, 8).replace(/\D/g, '').slice(-4), installments: clampInt(pay.installments, 1, 24, 1) } : {}),
      paidAt: typeof pay.paidAt === 'number' && Number.isFinite(pay.paidAt) ? pay.paidAt : null,
    },
    contact: { name: text(o.contact?.name, 80), phone: text(o.contact?.phone, 20) },
    prepHours: clampInt(o.prepHours, 0, 720, 24),
    demoStep: Number.isInteger(o.demoStep) ? Math.max(0, Math.min(10, o.demoStep)) : null,
    sentAt: typeof o.sentAt === 'number' && Number.isFinite(o.sentAt) ? o.sentAt : null,
    canceled: o.canceled === true,
  };
}

function cleanSavedCake(c) {
  if (!isObj(c)) return null;
  return {
    ...rest(c),
    id: idOf(c.id),
    createdAt: finite(c.createdAt, Date.now()),
    name: text(c.name, 80) || 'Bolo personalizado',
    thumb: cleanThumb(c.thumb),
    price: round2(Math.max(0, Math.min(MAX_CUSTOM_PRICE, Number(c.price) || 0))),
    summary: list(c.summary, 40, 160),
    config: isObj(c.config) ? c.config : null,
  };
}

function cleanChat(m) {
  if (!isObj(m) || (m.from !== 'me' && m.from !== 'bolab') || typeof m.text !== 'string' || !Number.isFinite(m.at)) return null;
  return { id: idOf(m.id), from: m.from, text: m.text.slice(0, 2000), at: m.at };
}

function cleanCart(c) {
  const src = isObj(c) ? c : {};
  return {
    lines: (Array.isArray(src.lines) ? src.lines : []).map((l) => cleanLine(l)).filter(Boolean).slice(0, 60),
    coupon: typeof src.coupon === 'string' && /^[A-Za-z0-9]{1,20}$/.test(src.coupon) ? src.coupon.toUpperCase() : null,
    note: text(src.note, 300),
  };
}

/** Exatamente um endereço (ou cartão) padrão. */
function oneDefault(items) {
  let found = false;
  items.forEach((it) => {
    it.isDefault = it.isDefault && !found;
    found ||= it.isDefault;
  });
  if (!found && items[0]) items[0].isDefault = true;
  return items;
}

function cleanUserData(d) {
  const src = isObj(d) ? d : {};
  const arr = (k) => (Array.isArray(src[k]) ? src[k] : []);
  const stash = isObj(src.cart) ? cleanCart(src.cart) : null;
  return {
    favorites: [...new Set(arr('favorites').filter((x) => typeof x === 'string' && ID_RE.test(x)))].slice(0, 200),
    savedCakes: arr('savedCakes').map(cleanSavedCake).filter(Boolean).slice(0, 60),
    addresses: oneDefault(arr('addresses').map(cleanAddress).filter(Boolean).slice(0, 20)),
    cards: oneDefault(arr('cards').map(cleanCard).filter(Boolean).slice(0, 10)),
    orders: arr('orders').map(cleanOrder).filter(Boolean),
    chat: arr('chat').map(cleanChat).filter(Boolean).slice(-200),
    cart: stash && stash.lines.length ? stash : null,
  };
}

function cleanUser(u) {
  if (!isObj(u) || typeof u.id !== 'string' || !ID_RE.test(u.id) || u.id === 'guest' || BAD_KEYS.has(u.id)) return null;
  const email = text(u.email, 120).trim().toLowerCase();
  if (!email) return null;
  const guard = isObj(u.guard) ? { n: clampInt(u.guard.n, 0, 99, 0), until: finite(u.guard.until) } : null;
  return {
    id: u.id,
    name: text(u.name, 80),
    email,
    phone: text(u.phone, 20),
    birthday: text(u.birthday, 10),
    provider: text(u.provider, 20) || 'email',
    createdAt: finite(u.createdAt, Date.now()),
    passHash: text(u.passHash, 200),
    ...(guard && guard.n ? { guard } : {}),
  };
}

function cleanPrefs(p) {
  const out = {};
  if (!isObj(p)) return out;
  for (const [k, v] of Object.entries(p)) {
    if (!BAD_KEYS.has(k) && k.length <= 64) out[k] = v;
  }
  if (out.receiveMode !== 'pickup' && out.receiveMode !== 'delivery') delete out.receiveMode;
  if (typeof out.receiveAddress !== 'string' || !ID_RE.test(out.receiveAddress)) delete out.receiveAddress;
  return out;
}

/** Sessão parada há mais de SITE.sessionIdleDays é encerrada (o aparelho pode ter mudado de mãos). */
function sessionExpired(session, now = Date.now()) {
  const idle = (Number(SITE.sessionIdleDays) || 30) * DAY;
  return Boolean(session.userId) && now - (session.seen || session.at || now) > idle;
}

/**
 * Texto salvo → estado da loja. Qualquer parte faltando, com o tipo errado ou adulterada volta
 * ao padrão; nada do que vem do aparelho derruba a loja.
 */
function parseState(rawState) {
  if (!rawState) return defaults();
  let parsed;
  try {
    parsed = JSON.parse(rawState);
  } catch {
    return defaults();
  }
  if (!isObj(parsed) || !Number.isInteger(parsed.v) || parsed.v < 1) return defaults();
  for (let v = parsed.v; v < VERSION; v++) {
    if (!MIGRATIONS[v]) return defaults();
    parsed = MIGRATIONS[v](parsed);
  }

  const users = [];
  const ids = new Set();
  (Array.isArray(parsed.users) ? parsed.users : []).forEach((u) => {
    const user = cleanUser(u);
    if (!user || ids.has(user.id) || users.some((x) => x.email === user.email)) return;
    ids.add(user.id);
    users.push(user);
  });

  const dataIn = isObj(parsed.data) ? parsed.data : {};
  const own = (id) => (Object.hasOwn(dataIn, id) ? dataIn[id] : null);
  const data = { guest: cleanUserData(own('guest')) };
  users.forEach((u) => (data[u.id] = cleanUserData(own(u.id))));

  const s = isObj(parsed.session) ? parsed.session : {};
  const now = Date.now();
  let session = { userId: typeof s.userId === 'string' && ids.has(s.userId) ? s.userId : null, at: finite(s.at), seen: finite(s.seen) };
  if (session.userId && !session.at) session = { ...session, at: now, seen: now }; // sessão de antes de existir validade
  // Sessão vencida: o mesmo que "sair" — o carrinho fica guardado na conta (volta no próximo
  // login) e sai do aparelho, junto com o endereço escolhido no cabeçalho.
  let cart = cleanCart(parsed.cart);
  const prefs = cleanPrefs(parsed.prefs);
  if (session.userId && sessionExpired(session, now)) {
    data[session.userId].cart = cart.lines.length ? cart : null;
    cart = blankCart();
    delete prefs.receiveAddress;
    sessionEnded = true;
    session = blankSession();
  }
  if (!session.userId) session = blankSession();

  const maxOrder = Object.values(data).reduce((m, d) => d.orders.reduce((n, o) => Math.max(n, Number(o.id.slice(4)) || 0), m), 0);
  const seq = isObj(parsed.seq) && Number.isInteger(parsed.seq.order) && parsed.seq.order >= 1 ? parsed.seq.order : 0;

  // Campos que esta versão não conhece (gravados por uma versão mais nova) seguem intactos.
  const KNOWN = new Set(['v', 'session', 'users', 'cart', 'data', 'prefs', 'seq']);
  const extra = {};
  for (const [k, v] of Object.entries(parsed)) if (!KNOWN.has(k) && !BAD_KEYS.has(k)) extra[k] = v;

  return {
    ...extra,
    v: Math.max(parsed.v, VERSION),
    session,
    users,
    cart,
    data,
    prefs,
    seq: { order: Math.max(seq, maxOrder, 1041) },
  };
}

/* ───────── Persistência ───────── */
let sessionEnded = false; // parseState encerrou uma sessão vencida: falta apagar os rascunhos da aba

function load() {
  try {
    return parseState(localStorage.getItem(KEY));
  } catch {
    return defaults(); // armazenamento bloqueado pelo navegador
  }
}

const listeners = new Map();
let state = load();
let persistent = true;
let lastSaved = null; // último texto gravado ou lido: não regrava o que não mudou

/**
 * Aparelho sem espaço: o que mais pesa são as miniaturas dos bolos 3D em pedidos antigos e a
 * conversa do atendimento. Libera espaço aos poucos, do menos importante para o mais.
 */
const SLIMMERS = [
  (s) =>
    Object.values(s.data).forEach((d) =>
      [...d.orders]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(5)
        .forEach((o) => o.items.forEach((l) => l.thumb && (l.thumb = ''))),
    ),
  (s) => Object.values(s.data).forEach((d) => (d.chat = d.chat.slice(-40))),
  (s) => Object.values(s.data).forEach((d) => d.orders.forEach((o) => o.items.forEach((l) => l.thumb && (l.thumb = '')))),
  (s) => Object.values(s.data).forEach((d) => d.savedCakes.slice(10).forEach((c) => (c.thumb = ''))),
];

function write(textState) {
  localStorage.setItem(KEY, textState);
  lastSaved = textState;
  persistent = true;
}

function save() {
  let textState = JSON.stringify(state);
  if (textState === lastSaved && persistent) return;
  try {
    write(textState);
    return;
  } catch {
    // não coube (ou o navegador bloqueou): tenta liberar espaço
  }
  for (const slim of SLIMMERS) {
    try {
      slim(state);
      textState = JSON.stringify(state);
      write(textState);
      return;
    } catch {
      // ainda não coube: próximo corte
    }
  }
  // Sem armazenamento (aba anônima ou cota cheia): segue funcionando só em memória,
  // e avisa a tela uma vez (evento 'storage-fail') para a pessoa não perder o pedido sem saber.
  const wasPersistent = persistent;
  persistent = false;
  if (wasPersistent) listeners.get('storage-fail')?.forEach((fn) => fn());
}

// Na abertura: confere se dá para gravar. O estado só é regravado se a leitura corrigiu alguma
// coisa — gravar a cada abertura acordava (e redesenhava) as outras abas da loja à toa.
(function checkStorage() {
  let stored = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch {
    persistent = false;
    return;
  }
  // "Visto por último": renovado no máximo uma vez por hora, pelo mesmo motivo.
  if (state.session.userId && Date.now() - state.session.seen > 3600e3) state.session.seen = Date.now();
  if (stored !== null && stored === JSON.stringify(state)) {
    lastSaved = stored;
    try {
      localStorage.setItem('bolab:probe', '1');
      localStorage.removeItem('bolab:probe');
    } catch {
      persistent = false;
    }
    return;
  }
  save();
})();

/** Apaga os rascunhos desta aba (andamento do checkout, relógio do Pix). */
function clearTabDrafts() {
  sessionEnded = false;
  try {
    if (typeof sessionStorage !== 'undefined') SESSION_KEYS.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    // sem armazenamento de sessão: nada a limpar
  }
}
if (sessionEnded) clearTabDrafts();

/* ───────── Eventos ─────────
   store.on('cart' | 'auth' | 'favs' | 'orders' | 'addresses' | 'cards' | 'chat' | '*', fn) → função para desligar.
   'storage-fail' é interno: o navegador parou de deixar gravar. */
const INTERNAL = (name) => name.startsWith('storage-');

function emit(name) {
  save();
  // Copia antes de percorrer: uma tela pode se reinscrever durante o aviso (ctx.rerender()).
  [name, '*'].forEach((n) => [...(listeners.get(n) || [])].forEach((fn) => fn(name)));
}

export const store = {
  on(name, fn) {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
    return () => listeners.get(name).delete(fn);
  },
  /** false quando o navegador não deixa gravar (o que a pessoa fizer some ao fechar a aba). */
  isPersistent() {
    return persistent;
  },
  /** Apaga tudo (usado em "Sair e limpar dados de demonstração"). */
  reset() {
    state = defaults();
    clearTabDrafts();
    ['auth', 'cart', 'favs', 'orders', 'addresses', 'cards', 'chat'].forEach(emit);
  },
};

// Mantém abas diferentes do mesmo navegador sincronizadas. O que chega da outra aba passa pela
// mesma conferência da abertura (ela pode estar com uma versão antiga da loja).
window.addEventListener('storage', (ev) => {
  if (ev.key !== KEY && ev.key !== null) return; // null: o armazenamento inteiro foi limpo
  const incoming = ev.key === null ? null : ev.newValue;
  if (incoming !== null && incoming === lastSaved) return;
  state = parseState(incoming);
  lastSaved = incoming;
  if (sessionEnded) clearTabDrafts();
  [...listeners.entries()].forEach(([name, set]) => {
    if (!INTERNAL(name)) [...set].forEach((fn) => fn('*'));
  });
});

/** Dados da pessoa logada (ou do visitante). */
function scope() {
  const id = state.session.userId || 'guest';
  if (!Object.hasOwn(state.data, id)) state.data[id] = blankUserData();
  return state.data[id];
}

/* ───────── Conta ─────────
   SÓ COM SERVIDOR: aqui a "conta" é uma ficha guardada no próprio aparelho. Quem tem o aparelho
   (ou consegue rodar código nesta página) lê e altera tudo; a senha só impede o uso casual.
   Com backend, auth.signUp / signIn / signOut / changePassword / resetPassword passam a ser
   chamadas ao servidor (que guarda a senha, limita tentativas e emite a sessão em cookie
   HttpOnly) e `passHash` deixa de existir aqui. As telas não mudam: os formatos de retorno
   ({ ok, user } | { ok: false, field, message }) já são os de uma resposta de servidor. */
const PBKDF2_ROUNDS = 310000; // PBKDF2-HMAC-SHA256 (faixa recomendada pela OWASP: 310 mil a 600 mil voltas)
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function pbkdf2(password, salt, rounds) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds }, key, 256));
}

/** Sem Web Crypto (página fora de https): embaralhamento simples, só para a demonstração não parar. */
function weakHash(userId, password) {
  const input = `${userId}::${password}`;
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return `x${(h >>> 0).toString(16)}`;
}

/**
 * Nunca guardamos a senha: guardamos uma derivação lenta dela, com sal aleatório por conta
 * ("pbkdf2$voltas$sal$resultado"). Se alguém copiar os dados do aparelho, descobrir a senha
 * (que a pessoa pode usar em outros sites) custa caro.
 */
async function hashPassword(userId, password) {
  if (!crypto.subtle) return weakHash(userId, password);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ROUNDS}$${b64(salt)}$${await pbkdf2(password, salt, PBKDF2_ROUNDS)}`;
}

function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** → { ok, stale } — `stale`: a senha confere, mas está guardada em um formato antigo (regravar). */
async function checkPassword(user, password) {
  const stored = String(user.passHash || '');
  try {
    if (stored.startsWith('pbkdf2$')) {
      const [, rounds, salt, digest] = stored.split('$');
      const n = Number(rounds);
      if (!crypto.subtle || !Number.isInteger(n) || n < 1 || n > 5e6 || !salt || !digest) return { ok: false };
      return { ok: sameText(await pbkdf2(password, unb64(salt), n), digest), stale: n < PBKDF2_ROUNDS };
    }
    // Formato das primeiras versões: SHA-256 de "id::senha" (rápido demais para proteger uma senha).
    if (/^[0-9a-f]{64}$/.test(stored) && crypto.subtle) {
      const digest = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${user.id}::${password}`)));
      return { ok: sameText(digest, stored), stale: true };
    }
    if (/^x[0-9a-f]+$/.test(stored)) return { ok: sameText(weakHash(user.id, password), stored), stale: Boolean(crypto.subtle) };
  } catch {
    // dado de senha ilegível: trata como senha errada
  }
  return { ok: false };
}

/* Tentativas de senha. SÓ COM SERVIDOR: este freio vive no aparelho e some para quem apaga os
   dados; o limite de verdade (por conta e por endereço de rede) é do servidor. Fica aqui para a
   tela já saber mostrar a resposta "muitas tentativas". */
const GUARD_FREE = 5; // erros seguidos antes da primeira pausa
const GUARD_BASE = 30e3; // 30 s, dobrando a cada novo erro, até 15 min

function lockLeft(user) {
  return Math.max(0, (user.guard?.until || 0) - Date.now());
}

function lockMessage(ms) {
  const s = Math.ceil(ms / 1000);
  const wait = s >= 90 ? `${Math.ceil(s / 60)} minutos` : s >= 60 ? '1 minuto' : `${s} segundos`;
  return `Muitas tentativas seguidas. Por segurança, aguarde ${wait} e tente de novo.`;
}

function noteFailure(user) {
  const n = (user.guard?.n || 0) + 1;
  const wait = n >= GUARD_FREE ? Math.min(15 * 60e3, GUARD_BASE * 2 ** (n - GUARD_FREE)) : 0;
  user.guard = { n, until: wait ? Date.now() + wait : 0 };
  save();
  return wait;
}

function publicUser(u) {
  if (!u) return null;
  const { passHash, guard, ...rest_ } = u;
  return rest_;
}

function currentUser() {
  const id = state.session.userId;
  return id ? state.users.find((u) => u.id === id) || null : null;
}

/** Ao entrar, o que o visitante fez (favoritos, bolos salvos) passa para a conta. */
function adoptGuestData(userId) {
  const guest = state.data.guest || blankUserData();
  if (!Object.hasOwn(state.data, userId)) state.data[userId] = blankUserData();
  const mine = state.data[userId];
  mine.favorites = [...new Set([...mine.favorites, ...guest.favorites])];
  mine.savedCakes = [...mine.savedCakes, ...guest.savedCakes];
  if (!mine.addresses.length) mine.addresses = guest.addresses;
  // O carrinho que a pessoa deixou ao sair volta, a não ser que ela já tenha montado outro.
  if (mine.cart && !state.cart.lines.length) state.cart = cleanCart(mine.cart);
  mine.cart = null;
  state.data.guest = blankUserData();
}

function startSession(user) {
  const now = Date.now();
  state.session = { userId: user.id, at: now, seen: now };
  adoptGuestData(user.id);
  emit('auth');
  emit('cart');
  emit('favs');
}

/** Encerra a sessão e tira do aparelho compartilhado o que é da pessoa (carrinho, rascunhos). */
function endSession() {
  const id = state.session.userId;
  if (id && Object.hasOwn(state.data, id)) state.data[id].cart = state.cart.lines.length ? { ...state.cart } : null;
  state.session = blankSession();
  state.cart = blankCart();
  delete state.prefs.receiveAddress;
  clearTabDrafts();
  emit('auth');
  emit('cart');
  emit('favs');
}

export const auth = {
  user() {
    return publicUser(currentUser());
  },
  isLogged() {
    return Boolean(currentUser());
  },
  /** → { ok: true, user } | { ok: false, field, message } */
  async signUp({ name, email, phone = '', password }) {
    const mail = String(email).trim().toLowerCase().slice(0, 120);
    if (state.users.some((u) => u.email === mail)) {
      return { ok: false, field: 'email', message: 'Este e-mail já tem cadastro. Que tal entrar?' };
    }
    const id = uid();
    const user = {
      id,
      name: text(String(name).trim(), 80),
      email: mail,
      phone: text(phone, 20),
      birthday: '',
      provider: 'email',
      createdAt: Date.now(),
      passHash: await hashPassword(id, password),
    };
    state.users.push(user);
    startSession(user);
    return { ok: true, user: publicUser(user) };
  },
  /** → { ok: true, user } | { ok: false, field, message, code? } (code 'locked': muitas tentativas) */
  async signIn({ email, password }) {
    const mail = String(email).trim().toLowerCase();
    const user = state.users.find((u) => u.email === mail);
    if (!user) return { ok: false, field: 'email', message: 'Não encontramos uma conta com este e-mail.' };
    if (user.provider !== 'email') {
      return { ok: false, field: 'email', message: 'Esta conta foi criada com o Google. Use "Continuar com Google".' };
    }
    const locked = lockLeft(user);
    if (locked) return { ok: false, field: 'password', code: 'locked', message: lockMessage(locked) };
    const check = await checkPassword(user, password);
    if (!check.ok) {
      const wait = noteFailure(user);
      return { ok: false, field: 'password', ...(wait ? { code: 'locked' } : {}), message: wait ? lockMessage(wait) : 'Senha incorreta. Confira e tente de novo.' };
    }
    delete user.guard;
    if (check.stale) user.passHash = await hashPassword(user.id, password); // regrava no formato atual
    startSession(user);
    return { ok: true, user: publicUser(user) };
  },
  /** Login social SIMULADO (demonstração): entra com uma conta de exemplo. */
  signInDemo(provider = 'google') {
    const mail = `cliente.${provider}@exemplo.com`;
    let user = state.users.find((u) => u.email === mail);
    if (!user) {
      user = { id: uid(), name: 'Cliente Demonstração', email: mail, phone: '', birthday: '', provider, createdAt: Date.now(), passHash: '' };
      state.users.push(user);
    }
    startSession(user);
    return { ok: true, user: publicUser(user) };
  },
  signOut() {
    endSession();
  },
  /**
   * A loja voltou a ficar em uso (aba visível de novo): renova o "visto por último" e encerra a
   * sessão que ficou parada além do prazo. → true se continua logado
   */
  touch() {
    if (!state.session.userId) return false;
    if (sessionExpired(state.session)) {
      endSession();
      return false;
    }
    if (Date.now() - state.session.seen > 3600e3) {
      state.session.seen = Date.now();
      save();
    }
    return true;
  },
  /** Atualiza nome, telefone, aniversário ou e-mail. → { ok } | { ok:false, field, message } */
  update(patch) {
    const user = currentUser();
    if (!user) return { ok: false, message: 'Faça login para continuar.' };
    if (patch.email) {
      const mail = String(patch.email).trim().toLowerCase().slice(0, 120);
      if (state.users.some((u) => u.email === mail && u.id !== user.id)) {
        return { ok: false, field: 'email', message: 'Este e-mail já está em uso por outra conta.' };
      }
      patch.email = mail;
    }
    const limits = { name: 80, email: 120, phone: 20, birthday: 10 };
    Object.keys(limits).forEach((k) => {
      if (patch[k] !== undefined) user[k] = text(String(patch[k]), limits[k]);
    });
    emit('auth');
    return { ok: true, user: publicUser(user) };
  },
  async changePassword(current, next) {
    const user = currentUser();
    if (!user) return { ok: false, message: 'Faça login para continuar.' };
    if (user.provider === 'email') {
      const locked = lockLeft(user);
      if (locked) return { ok: false, field: 'current', code: 'locked', message: lockMessage(locked) };
      if (!(await checkPassword(user, current)).ok) {
        const wait = noteFailure(user);
        return { ok: false, field: 'current', message: wait ? lockMessage(wait) : 'A senha atual não confere.' };
      }
    }
    delete user.guard;
    user.passHash = await hashPassword(user.id, next);
    user.provider = 'email';
    emit('auth');
    return { ok: true };
  },
  /** Já existe alguma conta criada neste aparelho? (define se o login abre em "Entrar" ou "Criar conta") */
  hasAccounts() {
    return state.users.length > 0;
  },
  emailExists(email) {
    return state.users.some((u) => u.email === String(email).trim().toLowerCase());
  },
  /**
   * Redefinição SIMULADA: sem servidor de e-mail, a nova senha é definida na hora.
   * SÓ COM SERVIDOR: a troca tem de exigir o link enviado ao e-mail da conta.
   */
  async resetPassword(email, next) {
    const mail = String(email).trim().toLowerCase();
    const user = state.users.find((u) => u.email === mail);
    if (!user) return { ok: false, field: 'email', message: 'Não encontramos uma conta com este e-mail.' };
    user.passHash = await hashPassword(user.id, next);
    user.provider = 'email';
    delete user.guard;
    emit('auth');
    return { ok: true };
  },
};

/* ───────── Carrinho ───────── */
function hasOrders() {
  return scope().orders.some((o) => !o.canceled);
}

/**
 * → { ok: true, coupon } | { ok: false, message }
 * SÓ COM SERVIDOR: "primeiro pedido" é conferido contra os pedidos guardados neste aparelho; quem
 * apaga os dados volta a ser "primeira compra". Limite de uso por pessoa é coisa de servidor.
 */
function checkCoupon(code, subtotal) {
  const key = String(code || '').trim().toUpperCase();
  const c = Object.hasOwn(COUPONS, key) ? COUPONS[key] : null;
  if (!c) return { ok: false, message: 'Cupom não encontrado. Confira o código.' };
  if (c.expires && toDate(c.expires) < new Date()) return { ok: false, message: 'Este cupom expirou.' };
  if (c.firstOrderOnly && hasOrders()) return { ok: false, message: 'Este cupom vale só para o primeiro pedido.' };
  if (c.minSubtotal && subtotal < c.minSubtotal) {
    return { ok: false, message: `Este cupom vale para compras a partir de R$ ${c.minSubtotal.toFixed(2).replace('.', ',')}.` };
  }
  return { ok: true, coupon: c };
}

function subtotalOf(lines) {
  return lines.reduce((s, l) => s + l.price * l.qty, 0);
}

export const cart = {
  lines() {
    return state.cart.lines;
  },
  /** Quantidade total de itens (soma das quantidades). */
  count() {
    return state.cart.lines.reduce((n, l) => n + l.qty, 0);
  },
  isEmpty() {
    return state.cart.lines.length === 0;
  },
  /**
   * Adiciona um produto do catálogo. → linha do carrinho.
   * cart.addProduct('p1', { size: 'm', qty: 1, note: 'Escrever Parabéns Ana' })
   */
  addProduct(productId, { size = 'p', qty = 1, note = '' } = {}) {
    const p = getProduct(productId);
    if (!p) return null;
    const line = productLine(p, size, { qty, note });
    const same = state.cart.lines.find((l) => l.kind === 'product' && l.productId === productId && l.size === line.size && l.note === line.note);
    if (same) {
      same.qty = Math.min(MAX_QTY, same.qty + line.qty);
      emit('cart');
      return same;
    }
    state.cart.lines.push(line);
    emit('cart');
    return line;
  },
  /**
   * Adiciona um bolo criado no personalizador 3D. → linha do carrinho (null se o preço for inválido).
   * cart.addCustom({ name, price, thumb (dataURL), config, summary: ['Massa: …', …], serves, prepHours })
   */
  addCustom({ name = 'Bolo personalizado', price, thumb = '', config, summary = [], serves = '', prepHours = 48 }) {
    const line = customLine({ name, price, thumb, config, summary, sizeLabel: serves, prepHours, qty: 1, note: '' });
    if (!line) return null;
    state.cart.lines.push(line);
    emit('cart');
    return line;
  },
  /** Linha do carrinho pelo id (para editar um bolo criado no 3D). */
  line(lineId) {
    return state.cart.lines.find((l) => l.lineId === lineId) || null;
  },
  /**
   * Atualiza um bolo personalizado que já está no carrinho (mantém quantidade e posição).
   * cart.replaceCustom(lineId, { name, price, thumb, config, summary, serves, prepHours }) → linha | null
   */
  replaceCustom(lineId, { name, price, thumb, config, summary, serves, prepHours }) {
    const line = state.cart.lines.find((l) => l.lineId === lineId && l.kind === 'custom');
    if (!line) return null;
    const next = customLine(
      {
        name: name ?? line.name,
        price: Number(price) || line.price,
        thumb: thumb ?? line.thumb,
        config: config ?? line.config,
        summary: summary ?? line.summary,
        sizeLabel: serves ?? line.sizeLabel,
        prepHours: prepHours ?? line.prepHours,
        qty: line.qty,
        note: line.note,
      },
      { lineId },
    );
    if (!next) return null;
    Object.assign(line, next);
    emit('cart');
    return line;
  },
  setQty(lineId, qty) {
    const line = state.cart.lines.find((l) => l.lineId === lineId);
    if (!line) return;
    const n = clampInt(qty, 0, MAX_QTY, line.qty);
    if (n <= 0) return cart.remove(lineId);
    line.qty = n;
    emit('cart');
  },
  setLineNote(lineId, note) {
    const line = state.cart.lines.find((l) => l.lineId === lineId);
    if (!line) return;
    line.note = text(String(note ?? ''), 300);
    emit('cart');
  },
  /** Remove e devolve a linha (para oferecer "Desfazer"). */
  remove(lineId) {
    const i = state.cart.lines.findIndex((l) => l.lineId === lineId);
    if (i < 0) return null;
    const [line] = state.cart.lines.splice(i, 1);
    emit('cart');
    return line;
  },
  /** Recoloca uma linha removida. */
  restore(line) {
    const clean = cleanLine(line);
    if (!clean || state.cart.lines.some((l) => l.lineId === clean.lineId)) return;
    state.cart.lines.push(clean);
    emit('cart');
  },
  clear() {
    state.cart = blankCart();
    emit('cart');
  },
  note() {
    return state.cart.note || '';
  },
  setNote(value) {
    state.cart.note = text(String(value ?? ''), 300);
    save();
  },
  /** Maior prazo de preparo (em horas) entre os itens — define a primeira data possível. */
  prepHours() {
    return state.cart.lines.reduce((h, l) => Math.max(h, l.prepHours || 0), 24);
  },
  couponCode() {
    return state.cart.coupon;
  },
  /** → { ok: true, coupon } | { ok: false, message } */
  applyCoupon(code) {
    const res = checkCoupon(code, subtotalOf(state.cart.lines));
    if (!res.ok) return res;
    state.cart.coupon = res.coupon.code;
    emit('cart');
    return res;
  },
  removeCoupon() {
    state.cart.coupon = null;
    emit('cart');
  },
  /**
   * Valores do carrinho.
   *   mode: 'delivery' | 'pickup'      payment: 'pix' | 'card' | null
   * → { subtotal, shipping, shippingFull, couponDiscount, pixDiscount, discount, total,
   *     coupon, couponIssue, freeShippingMissing, freeShippingPct, itemCount }
   * SÓ COM SERVIDOR: estes valores são para MOSTRAR. Na hora de cobrar, o servidor refaz a
   * mesma conta com os ids, tamanhos e quantidades (e a configuração do bolo 3D) e ignora
   * qualquer valor vindo do navegador.
   */
  totals({ mode = 'delivery', payment = null } = {}) {
    const lines = state.cart.lines;
    const subtotal = subtotalOf(lines);
    let coupon = null;
    let couponIssue = '';
    if (state.cart.coupon) {
      const res = checkCoupon(state.cart.coupon, subtotal);
      if (res.ok) coupon = res.coupon;
      else couponIssue = res.message;
    }
    const { fee, freeAbove } = SITE.shipping;
    const shippingFull = mode === 'pickup' || !lines.length ? 0 : fee;
    let shipping = shippingFull;
    if (subtotal >= freeAbove || coupon?.type === 'frete') shipping = 0;

    let couponDiscount = 0;
    if (coupon?.type === 'pct') couponDiscount = subtotal * (coupon.value / 100);
    if (coupon?.type === 'fixed') couponDiscount = Math.min(subtotal, coupon.value);

    // Cada parcela é arredondada antes de somar, para o total bater com as linhas exibidas.
    const round = (n) => Math.round(n * 100) / 100;
    couponDiscount = round(couponDiscount);
    const afterCoupon = round(subtotal - couponDiscount);
    const pixDiscount = payment === 'pix' ? round(afterCoupon * (SITE.pix.discountPct / 100)) : 0;

    return {
      subtotal: round(subtotal),
      shipping: round(shipping),
      shippingFull: round(shippingFull),
      couponDiscount,
      pixDiscount,
      discount: round(couponDiscount + pixDiscount),
      total: round(afterCoupon - pixDiscount + shipping),
      coupon,
      couponIssue,
      freeShippingMissing: round(Math.max(0, freeAbove - subtotal)),
      freeShippingPct: Math.min(100, Math.round((subtotal / freeAbove) * 100)),
      itemCount: cart.count(),
    };
  },
};

/* ───────── Favoritos e bolos salvos ───────── */
export const favs = {
  has(productId) {
    return scope().favorites.includes(productId);
  },
  /** Alterna e devolve o novo estado (true = favoritado). */
  toggle(productId) {
    const fav = scope().favorites;
    const i = fav.indexOf(productId);
    if (i >= 0) fav.splice(i, 1);
    else if (typeof productId === 'string' && ID_RE.test(productId)) fav.unshift(productId);
    emit('favs');
    return i < 0;
  },
  list() {
    return scope().favorites.map(getProduct).filter(Boolean);
  },
  /** Conta só o que aparece na tela de favoritos (produto fora do cardápio não entra). */
  count() {
    return favs.list().length + scope().savedCakes.length;
  },
};

export const savedCakes = {
  list() {
    return scope().savedCakes;
  },
  get(id) {
    return scope().savedCakes.find((c) => c.id === id) || null;
  },
  /** savedCakes.add({ name, config, thumb, price, summary }) → bolo salvo (com id). */
  add(cake) {
    const item = cleanSavedCake({ ...cake, id: uid(), createdAt: Date.now() });
    scope().savedCakes.unshift(item);
    emit('favs');
    return item;
  },
  remove(id) {
    const s = scope();
    s.savedCakes = s.savedCakes.filter((c) => c.id !== id);
    emit('favs');
  },
};

/* ───────── Endereços ───────── */
export const addresses = {
  list() {
    return scope().addresses;
  },
  get(id) {
    return scope().addresses.find((a) => a.id === id) || null;
  },
  default() {
    const all = scope().addresses;
    return all.find((a) => a.isDefault) || all[0] || null;
  },
  /**
   * Cria ou atualiza (quando vem id). Campos: label, cep, street, number, complement,
   * district, city, uf, reference. O primeiro endereço vira o padrão.
   */
  save(addr) {
    const all = scope().addresses;
    let item = addr.id ? all.find((a) => a.id === addr.id) : null;
    if (item) Object.assign(item, cleanAddress({ ...item, ...addr, id: item.id, isDefault: item.isDefault }));
    else {
      item = cleanAddress({ label: 'Casa', ...addr, id: uid(), isDefault: all.length === 0 });
      all.push(item);
    }
    if (addr.isDefault) all.forEach((a) => (a.isDefault = a.id === item.id));
    emit('addresses');
    return item;
  },
  remove(id) {
    const s = scope();
    const wasDefault = s.addresses.find((a) => a.id === id)?.isDefault;
    s.addresses = s.addresses.filter((a) => a.id !== id);
    if (wasDefault && s.addresses[0]) s.addresses[0].isDefault = true;
    emit('addresses');
  },
  setDefault(id) {
    scope().addresses.forEach((a) => (a.isDefault = a.id === id));
    emit('addresses');
  },
  /** "Rua X, 123 — Bairro, Cidade/UF" */
  format(a) {
    if (!a) return '';
    const line1 = [a.street, a.number].filter(Boolean).join(', ');
    const comp = a.complement ? ` (${a.complement})` : '';
    return `${line1}${comp} — ${[a.district, `${a.city}/${a.uf}`].filter(Boolean).join(', ')}`;
  },
};

/* ───────── Cartões salvos ─────────
   Nunca guardamos o número completo nem o CVV: só bandeira, final e validade.
   SÓ COM SERVIDOR: com pagamento de verdade o número nem passa por este código — o campo é do
   meio de pagamento (iframe/SDK) e a loja recebe só um token e estes mesmos dados de exibição. */
export const cards = {
  list() {
    return scope().cards;
  },
  get(id) {
    return scope().cards.find((c) => c.id === id) || null;
  },
  default() {
    const all = scope().cards;
    return all.find((c) => c.isDefault) || all[0] || null;
  },
  /** cards.save({ number, holder, expiry }) → cartão salvo { id, brand, last4, holder, expiry } */
  save({ number, holder, expiry }) {
    const digits = String(number).replace(/\D/g, '');
    const all = scope().cards;
    const same = all.find((c) => c.last4 === digits.slice(-4) && c.brand === cardBrand(digits) && c.expiry === expiry);
    if (same) return same; // o mesmo cartão não entra duas vezes
    const item = {
      id: uid(),
      brand: cardBrand(digits),
      last4: digits.slice(-4),
      holder: String(holder).trim().toUpperCase().slice(0, 40),
      expiry,
      isDefault: all.length === 0,
    };
    all.push(item);
    emit('cards');
    return item;
  },
  remove(id) {
    const s = scope();
    const wasDefault = s.cards.find((c) => c.id === id)?.isDefault;
    s.cards = s.cards.filter((c) => c.id !== id);
    if (wasDefault && s.cards[0]) s.cards[0].isDefault = true;
    emit('cards');
  },
  setDefault(id) {
    scope().cards.forEach((c) => (c.isDefault = c.id === id));
    emit('cards');
  },
};

/* ───────── Pedidos ───────── */
function slotBounds(order) {
  const day = toDate(order.delivery.date);
  const [from, to] = String(order.delivery.slot)
    .split('–')
    .map((t) => t.trim().split(':').map(Number));
  const start = new Date(day);
  start.setHours(from?.[0] ?? 9, from?.[1] ?? 0, 0, 0);
  const end = new Date(day);
  end.setHours(to?.[0] ?? 20, to?.[1] ?? 0, 0, 0);
  return { start, end };
}

function stepsFor(order) {
  const pickup = order.delivery.mode === 'pickup';
  return ORDER_STEPS.filter((s) => !(pickup && s.id === 'out')).map((s) => {
    if (pickup && s.id === 'ready') return { ...s, label: 'Pronto para retirada', desc: 'É só passar no ateliê.' };
    if (pickup && s.id === 'delivered') return { ...s, label: 'Retirado', desc: 'Bom apetite!' };
    return s;
  });
}

/**
 * Índice da etapa atual calculado pelo relógio (data e horário agendados).
 * SEM SERVIDOR (SITE.demo): a loja não fica sabendo de pagamento, produção nem entrega; o que ela
 * sabe de verdade é se a pessoa já abriu o WhatsApp com o pedido (`sentAt`). Por isso o relógio não
 * inventa "em produção" nem "saiu para entrega": o pedido fica em "aguardando confirmação" até a
 * data combinada passar, e aí é dado como encerrado.
 */
function timeIndex(order, steps) {
  const idx = (id) => steps.findIndex((s) => s.id === id);
  if (SITE.demo) {
    if (order.sentAt && Date.now() >= slotBounds(order).end.getTime()) return idx('delivered');
    return order.sentAt || order.payment.paidAt ? idx('paid') : idx('received');
  }
  if (!order.payment.paidAt) return idx('received');
  const now = Date.now();
  const { start, end } = slotBounds(order);
  const HOUR = 3600e3;
  const prep = Math.max(order.prepHours || 24, 12) * HOUR;
  if (now >= end.getTime()) return idx('delivered');
  if (now >= start.getTime() && idx('out') >= 0) return idx('out');
  if (now >= start.getTime() - 2 * HOUR) return idx('ready');
  if (now >= start.getTime() - prep) return idx('preparing');
  return idx('paid');
}

const DIACRITICS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g'); // acentos soltos depois de normalize('NFD')
const plain = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .trim();

/** A cidade (e o estado, se informado) está na área de entrega definida em js/data/site.js? */
export function isServedCity(city, uf = '') {
  if (!plain(city)) return false;
  const okCity = SITE.deliveryCities.some((c) => plain(c) === plain(city));
  const okUf = !uf || plain(uf) === plain(SITE.uf);
  return okCity && okUf;
}

/** Código de 4 dígitos para a entrega (sorteio do sistema, não Math.random). */
function deliveryCode() {
  const n = crypto.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 2 ** 32);
  return String(1000 + (n % 9000));
}

export const orders = {
  /** Mais recentes primeiro. */
  list() {
    return [...scope().orders].sort((a, b) => b.createdAt - a.createdAt);
  },
  get(id) {
    return scope().orders.find((o) => o.id === id) || null;
  },
  count() {
    return scope().orders.length;
  },
  /**
   * Fecha o pedido com o carrinho atual e esvazia o carrinho. Exige login.
   *   orders.create({
   *     delivery: { mode: 'delivery' | 'pickup', date: 'AAAA-MM-DD', slot: '14:00 – 16:00' },
   *     address,            // objeto de endereço (null em retirada)
   *     payment: { method: 'pix' | 'card', brand, last4, installments, paid: boolean },
   *     contact: { name, phone },
   *   }) → pedido
   * SÓ COM SERVIDOR: é aqui que entra a chamada ao backend. Ele recebe os ids, tamanhos,
   * quantidades, a configuração do bolo 3D, o cupom, a data e o endereço; refaz preço, cupom,
   * frete e disponibilidade do horário; cria a cobrança no meio de pagamento; e só então devolve
   * o pedido. "paid" nunca vem do navegador: quem confirma é o aviso do meio de pagamento.
   */
  create({ delivery, address = null, payment, contact = {} }) {
    const user = currentUser();
    if (!user) throw new Error('É preciso estar logado para fechar o pedido.');
    if (!state.cart.lines.length) throw new Error('O carrinho está vazio.');
    if (delivery.mode === 'delivery' && !isServedCity(address?.city, address?.uf)) {
      throw new Error(`Ainda não entregamos neste endereço. Atendemos ${SITE.region}.`);
    }
    const totals = cart.totals({ mode: delivery.mode, payment: payment.method });
    state.seq.order += 1;
    const { paid, ...pay } = payment;
    const order = {
      id: `BOL-${state.seq.order}`,
      code: deliveryCode(), // código de confirmação na entrega
      createdAt: Date.now(),
      userId: user.id,
      items: state.cart.lines.map((l) => ({ ...l })),
      note: state.cart.note || '',
      totals: { ...totals, coupon: totals.coupon?.code || null },
      delivery: { ...delivery },
      address: address ? { ...address } : null,
      payment: { ...pay, paidAt: paid ? Date.now() : null },
      contact: { name: text(contact.name || user.name, 80), phone: text(contact.phone || user.phone, 20) },
      prepHours: cart.prepHours(),
      demoStep: null,
      sentAt: null, // momento em que a pessoa abriu o WhatsApp com o pedido (orders.markSent)
      canceled: false,
    };
    scope().orders.push(order);
    state.cart = blankCart();
    emit('orders');
    emit('cart');
    return order;
  },
  markPaid(id) {
    const o = orders.get(id);
    if (!o || o.payment.paidAt) return;
    o.payment.paidAt = Date.now();
    emit('orders');
  },
  /**
   * A pessoa tocou em "Enviar pedido pelo WhatsApp". Sem servidor, é só isso que a loja consegue
   * saber: que o WhatsApp foi aberto com a mensagem pronta (não que ela foi enviada nem lida).
   * SÓ COM SERVIDOR: o pedido chega à confeitaria sozinho e este passo deixa de existir.
   */
  markSent(id) {
    const o = orders.get(id);
    if (!o || o.canceled) return;
    o.sentAt = Date.now();
    emit('orders');
  },
  /**
   * Situação do pedido.
   * → { id, label, index, canceled, sent, steps: [{ id, label, desc, done, current }] }
   * `sent`: a pessoa já abriu o WhatsApp com este pedido. Sem servidor (SITE.demo) o rótulo diz o
   * que a loja sabe de verdade: "Falta enviar pelo WhatsApp", "Aguardando confirmação da BOLAB" ou
   * "Encerrado" (a data combinada passou).
   */
  statusOf(order) {
    const steps = stepsFor(order);
    const sent = Boolean(order.sentAt);
    // Pedido que nunca chegou à confeitaria (sem servidor: não enviado; com servidor: não pago) e
    // cuja data de entrega já passou deixa de estar "em andamento".
    const reached = SITE.demo ? sent : Boolean(order.payment.paidAt);
    const expired = !order.canceled && !reached && Date.now() > slotBounds(order).end.getTime();
    if (order.canceled || expired) {
      return {
        id: 'canceled',
        label: !expired ? 'Cancelado' : SITE.demo ? 'Expirado — pedido não enviado' : 'Expirado — pagamento não realizado',
        index: -1,
        canceled: true,
        expired,
        sent,
        steps: steps.map((s) => ({ ...s, done: false, current: false })),
      };
    }
    const byTime = timeIndex(order, steps);
    const forced = order.demoStep ?? 0; // orders.advance (demonstração)
    const index = Math.min(steps.length - 1, Math.max(byTime, forced));
    let label = steps[index].label;
    if (SITE.demo && byTime >= forced) {
      if (index <= steps.findIndex((s) => s.id === 'paid')) label = sent ? 'Aguardando confirmação da BOLAB' : 'Falta enviar pelo WhatsApp';
      else if (index === steps.length - 1) label = 'Encerrado';
    }
    return {
      id: steps[index].id,
      label,
      index,
      canceled: false,
      sent,
      steps: steps.map((s, i) => ({ ...s, done: i < index || index === steps.length - 1, current: i === index && index < steps.length - 1 })),
    };
  },
  /** DEMONSTRAÇÃO: avança o pedido uma etapa para mostrar o acompanhamento. */
  advance(id) {
    const o = orders.get(id);
    if (!o || o.canceled) return;
    const st = orders.statusOf(o);
    if (!o.payment.paidAt) o.payment.paidAt = Date.now();
    o.demoStep = Math.min(st.steps.length - 1, st.index + 1);
    emit('orders');
  },
  /** Só é possível cancelar antes de entrar em produção. */
  canCancel(order) {
    const st = orders.statusOf(order);
    return !st.canceled && ['received', 'paid'].includes(st.id);
  },
  cancel(id) {
    const o = orders.get(id);
    if (!o || !orders.canCancel(o)) return false;
    o.canceled = true;
    emit('orders');
    return true;
  },
  /** Coloca os itens de um pedido antigo de volta no carrinho. */
  reorder(id) {
    const o = orders.get(id);
    if (!o) return 0;
    let n = 0;
    o.items.forEach((it) => {
      const line = it.kind === 'custom' ? cart.addCustom({ ...it, serves: it.sizeLabel }) : cart.addProduct(it.productId, { size: it.size || 'p', qty: it.qty, note: it.note });
      if (!line) return;
      if (it.kind === 'custom' && it.qty > 1) cart.setQty(line.lineId, it.qty); // addCustom entra sempre com 1
      n += 1;
    });
    return n;
  },
};

/* ───────── Agenda de entregas ─────────
   Sem servidor não há como saber quantos pedidos cada horário já tem. A lotação já foi sorteada
   aqui para demonstração, mas "Esgotado" e "Últimas vagas" inventados recusavam horários livres e
   criavam uma pressa que não existe: agora todo horário possível aparece livre e quem confirma é a
   confeitaria, pelo WhatsApp.
   SÓ COM SERVIDOR: vagas de verdade por horário. A agenda usa o relógio e o fuso do aparelho. Quem adianta o relógio (ou está
   em outro fuso) vê datas diferentes; a data final tem de ser conferida pelo servidor, no
   horário de Cuiabá, junto com as vagas de verdade. */
function pseudo(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

/** Início de uma janela ('14:00 – 16:00') em um dia. → Date */
function slotStart(date, label) {
  const [h, m] = String(label).split('–')[0].trim().split(':').map(Number);
  const d = new Date(toDate(date));
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

export const schedule = {
  /** Momento em que o pedido fica pronto se for feito agora. → Date */
  readyAt(prepHours = cart.prepHours()) {
    return new Date(Date.now() + prepHours * 3600e3);
  },
  /**
   * Primeira data de entrega possível. → Date (meia-noite)
   * Regra: o bolo pode sair no mesmo dia em que fica pronto, nas janelas que começam
   * depois desse horário. Ex.: pedido na sexta às 10h com 24 h de preparo → sábado a partir das 11h.
   */
  earliest(prepHours = cart.prepHours()) {
    const ready = schedule.readyAt(prepHours);
    const d = new Date(ready);
    d.setHours(0, 0, 0, 0);
    for (let i = 0; i < 21; i++) {
      const open = !SITE.closedWeekdays.includes(d.getDay());
      if (open && SITE.slots.some((label) => slotStart(d, label) >= ready)) break;
      d.setDate(d.getDate() + 1);
    }
    return d;
  },
  isOpen(date, prepHours = cart.prepHours()) {
    const d = toDate(date);
    const first = schedule.earliest(prepHours);
    const last = new Date();
    last.setDate(last.getDate() + SITE.scheduleDaysAhead);
    return d >= first && d <= last && !SITE.closedWeekdays.includes(d.getDay());
  },
  /**
   * Horários de um dia. → [{ label, left }]  (left = vagas restantes; 0 = esgotado)
   * Janelas que começam antes de o pedido ficar pronto não entram na lista.
   */
  slots(date, prepHours = cart.prepHours()) {
    const key = isoDate(date);
    const ready = schedule.readyAt(prepHours);
    return SITE.slots
      .filter((label) => slotStart(date, label) >= ready)
      .map((label) => {
        // SITE.demo: sem lotação inventada (ver o comentário acima). Fora dele, a simulação antiga.
        const r = SITE.demo ? 1 : pseudo(`${key}|${label}`);
        const taken = SITE.demo ? 0 : r < 0.12 ? SITE.maxOrdersPerSlot : Math.floor(r * SITE.maxOrdersPerSlot);
        return { label, left: SITE.maxOrdersPerSlot - taken };
      });
  },
};

/* ───────── Atendimento (chat) ───────── */
export const chat = {
  list() {
    return scope().chat;
  },
  /** from: 'me' | 'bolab' */
  add(from, message) {
    const msg = { id: uid(), from: from === 'me' ? 'me' : 'bolab', text: String(message ?? '').slice(0, 2000), at: Date.now() };
    const s = scope();
    s.chat.push(msg);
    if (s.chat.length > 200) s.chat = s.chat.slice(-200);
    emit('chat');
    return msg;
  },
  clear() {
    scope().chat = [];
    emit('chat');
  },
};

/* ───────── Preferências soltas ─────────
   Várias preferências gravadas em sequência (o personalizador guarda o rascunho e a etapa a cada
   escolha) viram uma gravação só, feita logo depois que o código atual termina. Cada gravação
   converte o estado inteiro em texto, então gravar duas vezes seguidas era trabalho dobrado. */
let prefsPending = false;
function savePrefsSoon() {
  if (prefsPending) return;
  prefsPending = true;
  queueMicrotask(() => {
    prefsPending = false;
    save();
  });
}

export const prefs = {
  get(key, fallback = null) {
    return Object.hasOwn(state.prefs, key) ? (state.prefs[key] ?? fallback) : fallback;
  },
  set(key, value) {
    if (BAD_KEYS.has(key)) return;
    state.prefs[key] = value;
    savePrefsSoon();
  },
};
