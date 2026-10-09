// BOLAB — estado da loja (carrinho, conta, pedidos, favoritos), salvo no aparelho.
//
// MODO DEMONSTRAÇÃO: tudo fica no localStorage do navegador. Não há servidor.
// Quando houver um backend, este é o único arquivo que precisa trocar de implementação;
// as telas só usam as funções exportadas aqui.

import { SITE, COUPONS, ORDER_STEPS } from './data/site.js';
import { getProduct, priceOf, SIZES } from './data/products.js';
import { cardBrand, toDate, isoDate } from './ui.js';

const KEY = 'bolab:v1';
const MAX_QTY = 20;

/* ───────── Persistência ───────── */
function blankUserData() {
  return { favorites: [], savedCakes: [], addresses: [], cards: [], orders: [], chat: [] };
}

function defaults() {
  return {
    v: 1,
    session: { userId: null },
    users: [],
    cart: { lines: [], coupon: null, note: '' },
    data: { guest: blankUserData() },
    prefs: {},
    seq: { order: 1041 },
  };
}

function load() {
  try {
    const rawState = localStorage.getItem(KEY);
    if (!rawState) return defaults();
    const parsed = JSON.parse(rawState);
    if (!parsed || parsed.v !== 1) return defaults();
    const base = defaults();
    return { ...base, ...parsed, cart: { ...base.cart, ...parsed.cart }, data: { ...base.data, ...parsed.data } };
  } catch {
    return defaults();
  }
}

let state = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Sem armazenamento (aba anônima ou cota cheia): segue funcionando só em memória.
  }
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/* ───────── Eventos ─────────
   store.on('cart' | 'auth' | 'favs' | 'orders' | 'addresses' | 'cards' | 'chat' | '*', fn) → função para desligar. */
const listeners = new Map();

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
  /** Apaga tudo (usado em "Sair e limpar dados de demonstração"). */
  reset() {
    state = defaults();
    ['auth', 'cart', 'favs', 'orders', 'addresses', 'cards', 'chat'].forEach(emit);
  },
};

// Mantém abas diferentes do mesmo navegador sincronizadas.
window.addEventListener('storage', (ev) => {
  if (ev.key !== KEY) return;
  state = load();
  [...listeners.values()].forEach((set) => [...set].forEach((fn) => fn('*')));
});

/** Dados da pessoa logada (ou do visitante). */
function scope() {
  const id = state.session.userId || 'guest';
  state.data[id] ||= blankUserData();
  return state.data[id];
}

/* ───────── Conta ───────── */
// O "sal" é o id da conta (não o e-mail), para a senha continuar valendo se o e-mail mudar.
async function hashPassword(userId, password) {
  const text = `${userId}::${password}`;
  if (crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `x${(h >>> 0).toString(16)}`;
}

function publicUser(u) {
  if (!u) return null;
  const { passHash, ...rest } = u;
  return rest;
}

function currentUser() {
  return state.users.find((u) => u.id === state.session.userId) || null;
}

/** Ao entrar, o que o visitante fez (favoritos, bolos salvos) passa para a conta. */
function adoptGuestData(userId) {
  const guest = state.data.guest || blankUserData();
  state.data[userId] ||= blankUserData();
  const mine = state.data[userId];
  mine.favorites = [...new Set([...mine.favorites, ...guest.favorites])];
  mine.savedCakes = [...mine.savedCakes, ...guest.savedCakes];
  if (!mine.addresses.length) mine.addresses = guest.addresses;
  state.data.guest = blankUserData();
}

function startSession(user) {
  state.session.userId = user.id;
  adoptGuestData(user.id);
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
    const mail = String(email).trim().toLowerCase();
    if (state.users.some((u) => u.email === mail)) {
      return { ok: false, field: 'email', message: 'Este e-mail já tem cadastro. Que tal entrar?' };
    }
    const id = uid();
    const user = {
      id,
      name: String(name).trim(),
      email: mail,
      phone,
      birthday: '',
      provider: 'email',
      createdAt: Date.now(),
      passHash: await hashPassword(id, password),
    };
    state.users.push(user);
    startSession(user);
    return { ok: true, user: publicUser(user) };
  },
  /** → { ok: true, user } | { ok: false, field, message } */
  async signIn({ email, password }) {
    const mail = String(email).trim().toLowerCase();
    const user = state.users.find((u) => u.email === mail);
    if (!user) return { ok: false, field: 'email', message: 'Não encontramos uma conta com este e-mail.' };
    if (user.provider !== 'email') {
      return { ok: false, field: 'email', message: 'Esta conta foi criada com o Google. Use "Continuar com Google".' };
    }
    if (user.passHash !== (await hashPassword(user.id, password))) {
      return { ok: false, field: 'password', message: 'Senha incorreta. Confira e tente de novo.' };
    }
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
    state.session.userId = null;
    emit('auth');
    emit('favs');
  },
  /** Atualiza nome, telefone, aniversário ou e-mail. → { ok } | { ok:false, field, message } */
  update(patch) {
    const user = currentUser();
    if (!user) return { ok: false, message: 'Faça login para continuar.' };
    if (patch.email) {
      const mail = patch.email.trim().toLowerCase();
      if (state.users.some((u) => u.email === mail && u.id !== user.id)) {
        return { ok: false, field: 'email', message: 'Este e-mail já está em uso por outra conta.' };
      }
      patch.email = mail;
    }
    ['name', 'email', 'phone', 'birthday'].forEach((k) => {
      if (patch[k] !== undefined) user[k] = patch[k];
    });
    emit('auth');
    return { ok: true, user: publicUser(user) };
  },
  async changePassword(current, next) {
    const user = currentUser();
    if (!user) return { ok: false, message: 'Faça login para continuar.' };
    if (user.provider === 'email' && user.passHash !== (await hashPassword(user.id, current))) {
      return { ok: false, field: 'current', message: 'A senha atual não confere.' };
    }
    user.passHash = await hashPassword(user.id, next);
    user.provider = 'email';
    emit('auth');
    return { ok: true };
  },
  emailExists(email) {
    return state.users.some((u) => u.email === String(email).trim().toLowerCase());
  },
  /** Redefinição SIMULADA: sem servidor de e-mail, a nova senha é definida na hora. */
  async resetPassword(email, next) {
    const mail = String(email).trim().toLowerCase();
    const user = state.users.find((u) => u.email === mail);
    if (!user) return { ok: false, field: 'email', message: 'Não encontramos uma conta com este e-mail.' };
    user.passHash = await hashPassword(user.id, next);
    user.provider = 'email';
    emit('auth');
    return { ok: true };
  },
};

/* ───────── Carrinho ───────── */
function hasOrders() {
  return scope().orders.some((o) => !o.canceled);
}

/** → { ok: true, coupon } | { ok: false, message } */
function checkCoupon(code, subtotal) {
  const c = COUPONS[String(code || '').trim().toUpperCase()];
  if (!c) return { ok: false, message: 'Cupom não encontrado. Confira o código.' };
  if (c.expires && toDate(c.expires) < new Date()) return { ok: false, message: 'Este cupom expirou.' };
  if (c.firstOrderOnly && hasOrders()) return { ok: false, message: 'Este cupom vale só para a primeira encomenda.' };
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
    const sizeObj = p.sizes === null ? null : SIZES.find((s) => s.id === size) || SIZES[0];
    const sizeId = sizeObj ? sizeObj.id : null;
    const same = state.cart.lines.find((l) => l.kind === 'product' && l.productId === productId && l.size === sizeId && l.note === note);
    if (same) {
      same.qty = Math.min(MAX_QTY, same.qty + qty);
      emit('cart');
      return same;
    }
    const line = {
      lineId: uid(),
      kind: 'product',
      productId,
      name: p.name,
      size: sizeId,
      sizeLabel: sizeObj ? `Tamanho ${sizeObj.label} · ${sizeObj.serves}` : '',
      price: priceOf(p, sizeId || 'p'),
      qty: Math.min(MAX_QTY, qty),
      note,
      photo: p.photo,
      prepHours: p.prepHours,
    };
    state.cart.lines.push(line);
    emit('cart');
    return line;
  },
  /**
   * Adiciona um bolo criado no personalizador 3D. → linha do carrinho.
   * cart.addCustom({ name, price, thumb (dataURL), config, summary: ['Massa: …', …], serves, prepHours })
   */
  addCustom({ name = 'Bolo personalizado', price, thumb = '', config, summary = [], serves = '', prepHours = 48 }) {
    const line = {
      lineId: uid(),
      kind: 'custom',
      productId: 'custom',
      name,
      size: null,
      sizeLabel: serves,
      price: Number(price) || 0,
      qty: 1,
      note: '',
      thumb,
      config,
      summary,
      prepHours,
    };
    state.cart.lines.push(line);
    emit('cart');
    return line;
  },
  setQty(lineId, qty) {
    const line = state.cart.lines.find((l) => l.lineId === lineId);
    if (!line) return;
    if (qty <= 0) return cart.remove(lineId);
    line.qty = Math.min(MAX_QTY, qty);
    emit('cart');
  },
  setLineNote(lineId, note) {
    const line = state.cart.lines.find((l) => l.lineId === lineId);
    if (!line) return;
    line.note = note;
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
    state.cart.lines.push(line);
    emit('cart');
  },
  clear() {
    state.cart = { lines: [], coupon: null, note: '' };
    emit('cart');
  },
  note() {
    return state.cart.note || '';
  },
  setNote(text) {
    state.cart.note = text;
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
    const list = scope().favorites;
    const i = list.indexOf(productId);
    if (i >= 0) list.splice(i, 1);
    else list.unshift(productId);
    emit('favs');
    return i < 0;
  },
  list() {
    return scope().favorites.map(getProduct).filter(Boolean);
  },
  count() {
    return scope().favorites.length + scope().savedCakes.length;
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
    const item = { id: uid(), createdAt: Date.now(), ...cake };
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
    const list = scope().addresses;
    return list.find((a) => a.isDefault) || list[0] || null;
  },
  /**
   * Cria ou atualiza (quando vem id). Campos: label, cep, street, number, complement,
   * district, city, uf, reference. O primeiro endereço vira o padrão.
   */
  save(addr) {
    const list = scope().addresses;
    let item = addr.id ? list.find((a) => a.id === addr.id) : null;
    if (item) Object.assign(item, addr);
    else {
      item = { id: uid(), isDefault: list.length === 0, label: 'Casa', ...addr };
      list.push(item);
    }
    if (addr.isDefault) list.forEach((a) => (a.isDefault = a.id === item.id));
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
   Nunca guardamos o número completo nem o CVV: só bandeira, final e validade. */
export const cards = {
  list() {
    return scope().cards;
  },
  get(id) {
    return scope().cards.find((c) => c.id === id) || null;
  },
  default() {
    const list = scope().cards;
    return list.find((c) => c.isDefault) || list[0] || null;
  },
  /** cards.save({ number, holder, expiry }) → cartão salvo { id, brand, last4, holder, expiry } */
  save({ number, holder, expiry }) {
    const digits = String(number).replace(/\D/g, '');
    const list = scope().cards;
    const item = {
      id: uid(),
      brand: cardBrand(digits),
      last4: digits.slice(-4),
      holder: String(holder).trim().toUpperCase(),
      expiry,
      isDefault: list.length === 0,
    };
    list.push(item);
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

/** Índice da etapa atual calculado pelo relógio (data e horário agendados). */
function timeIndex(order, steps) {
  const idx = (id) => steps.findIndex((s) => s.id === id);
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
   */
  create({ delivery, address = null, payment, contact = {} }) {
    const user = currentUser();
    if (!user) throw new Error('É preciso estar logado para fechar o pedido.');
    if (!state.cart.lines.length) throw new Error('O carrinho está vazio.');
    const totals = cart.totals({ mode: delivery.mode, payment: payment.method });
    state.seq.order += 1;
    const { paid, ...pay } = payment;
    const order = {
      id: `BOL-${state.seq.order}`,
      code: String(Math.floor(1000 + Math.random() * 9000)), // código de confirmação na entrega
      createdAt: Date.now(),
      userId: user.id,
      items: state.cart.lines.map((l) => ({ ...l })),
      note: state.cart.note || '',
      totals: { ...totals, coupon: totals.coupon?.code || null },
      delivery: { ...delivery },
      address: address ? { ...address } : null,
      payment: { ...pay, paidAt: paid ? Date.now() : null },
      contact: { name: contact.name || user.name, phone: contact.phone || user.phone },
      prepHours: cart.prepHours(),
      demoStep: null,
      canceled: false,
    };
    scope().orders.push(order);
    state.cart = { lines: [], coupon: null, note: '' };
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
   * Situação do pedido.
   * → { id, label, index, canceled, steps: [{ id, label, desc, done, current }] }
   */
  statusOf(order) {
    const steps = stepsFor(order);
    if (order.canceled) {
      return { id: 'canceled', label: 'Cancelado', index: -1, canceled: true, steps: steps.map((s) => ({ ...s, done: false, current: false })) };
    }
    const byTime = timeIndex(order, steps);
    const index = Math.min(steps.length - 1, Math.max(byTime, order.demoStep ?? 0));
    return {
      id: steps[index].id,
      label: steps[index].label,
      index,
      canceled: false,
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
    o.items.forEach((it) => {
      if (it.kind === 'custom') cart.addCustom({ ...it, serves: it.sizeLabel });
      else cart.addProduct(it.productId, { size: it.size || 'p', qty: it.qty, note: it.note });
    });
    return o.items.length;
  },
};

/* ───────── Agenda de entregas ─────────
   Em demonstração a lotação de cada horário é simulada (estável por data),
   apenas para mostrar como a agenda se comporta. */
function pseudo(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

export const schedule = {
  /** Primeira data possível considerando o prazo de preparo dos itens. → Date (meia-noite) */
  earliest(prepHours = cart.prepHours()) {
    const d = new Date(Date.now() + prepHours * 3600e3);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 1);
    while (SITE.closedWeekdays.includes(d.getDay())) d.setDate(d.getDate() + 1);
    return d;
  },
  isOpen(date) {
    const d = toDate(date);
    const first = schedule.earliest();
    const last = new Date();
    last.setDate(last.getDate() + SITE.scheduleDaysAhead);
    return d >= first && d <= last && !SITE.closedWeekdays.includes(d.getDay());
  },
  /** Horários de um dia. → [{ label, left }]  (left = vagas restantes; 0 = esgotado) */
  slots(date) {
    const key = isoDate(date);
    return SITE.slots.map((label) => {
      const r = pseudo(`${key}|${label}`);
      const taken = r < 0.12 ? SITE.maxOrdersPerSlot : Math.floor(r * SITE.maxOrdersPerSlot);
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
  add(from, text) {
    const msg = { id: uid(), from, text, at: Date.now() };
    scope().chat.push(msg);
    emit('chat');
    return msg;
  },
  clear() {
    scope().chat = [];
    emit('chat');
  },
};

/* ───────── Preferências soltas ───────── */
export const prefs = {
  get(key, fallback = null) {
    return state.prefs[key] ?? fallback;
  },
  set(key, value) {
    state.prefs[key] = value;
    save();
  },
};
