// BOLAB — regras do bolo personalizado: configuração válida, preço, rendimento, prazo e resumo.
// As telas e o motor 3D só leem daqui; valores e opções ficam em js/data/customizer.js.
import {
  BASE_PRICE,
  EXTRA_LAYER_PRICE,
  MAX_LAYERS,
  MAX_DECORS,
  MAX_CANDLES,
  MESSAGE_MAX,
  MESSAGE_PRICE,
  DRIP_PRICE,
  SIZES,
  SHAPES,
  FLAVORS,
  FILLINGS,
  COVERINGS,
  PIPINGS,
  PIPING_PLACES,
  DECORS,
  getShape,
  getSize,
  getFlavor,
  getFilling,
  getCovering,
  getPiping,
  getDecor,
  colorName,
} from '../data/customizer.js';

const round2 = (n) => Math.round(n * 100) / 100;
const HEX = /^#[0-9a-f]{6}$/i;
const hex = (v, fallback) => (HEX.test(String(v || '')) ? String(v).toLowerCase() : fallback);
const pick = (list, id, fallback) => (list.some((x) => x.id === id) ? id : fallback);

/** O bolo que aparece ao abrir o personalizador: bonito, equilibrado e com preço amigável. */
export function defaultConfig() {
  return {
    v: 1,
    shape: 'round',
    size: 'p',
    layers: ['baunilha', 'baunilha', 'baunilha'],
    fillings: ['morango', 'ninho'],
    covering: { type: 'buttercream', color: '#f7d3dc' },
    drip: { on: false, color: '#ffffff' },
    piping: { style: 'rosetas', where: 'top', color: '#ffffff' },
    decor: { items: ['frutas'], candles: 5, message: '' },
    name: '',
  };
}

/** Limpa uma mensagem para caber na plaquinha. */
export function cleanMessage(text) {
  return String(text || '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, MESSAGE_MAX);
}

/** Garante uma configuração completa e válida a partir de qualquer coisa salva (rascunho, favorito, link). */
export function normalizeConfig(raw) {
  const d = defaultConfig();
  const c = raw && typeof raw === 'object' ? raw : {};
  const layers = (Array.isArray(c.layers) && c.layers.length ? c.layers : d.layers).slice(0, MAX_LAYERS).map((id) => pick(FLAVORS, id, 'baunilha'));
  const rawFill = Array.isArray(c.fillings) ? c.fillings : d.fillings;
  const fillings = [];
  for (let i = 0; i < layers.length - 1; i++) {
    fillings.push(pick(FILLINGS, rawFill[i], pick(FILLINGS, rawFill[rawFill.length - 1], 'brigadeiro')));
  }
  const covType = pick(COVERINGS, c.covering?.type, d.covering.type);
  const items = [...new Set(Array.isArray(c.decor?.items) ? c.decor.items : d.decor.items)].filter((id) => DECORS.some((x) => x.id === id)).slice(0, MAX_DECORS);
  return {
    v: 1,
    shape: pick(SHAPES, c.shape, d.shape),
    size: pick(SIZES, c.size, d.size),
    layers,
    fillings,
    covering: { type: covType, color: hex(c.covering?.color, getCovering(covType).defaultColor) },
    drip: { on: Boolean(c.drip?.on), color: hex(c.drip?.color, d.drip.color) },
    piping: {
      style: pick(PIPINGS, c.piping?.style, 'liso'),
      where: pick(PIPING_PLACES, c.piping?.where, 'top'),
      color: hex(c.piping?.color, d.piping.color),
    },
    decor: {
      items,
      candles: Math.max(1, Math.min(MAX_CANDLES, Math.round(Number(c.decor?.candles) || d.decor.candles))),
      message: cleanMessage(c.decor?.message),
    },
    name: String(c.name || '').replace(/[<>]/g, '').slice(0, 40),
  };
}

export function sizeOf(config) {
  return getSize(config.size) || SIZES[0];
}

/** Quanto uma opção acrescenta ao preço no tamanho atual (para os "+ R$" dos seletores). */
export function deltaOf(config, price, scales = true) {
  return round2(price * (scales ? sizeOf(config).mult : 1));
}

function countList(names) {
  const seen = new Map();
  names.forEach((n) => seen.set(n, (seen.get(n) || 0) + 1));
  return [...seen].map(([name, n]) => (n > 1 ? `${name} (${n}x)` : name)).join(', ');
}

function joinPt(list) {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`;
}

/**
 * Detalhamento do preço.
 * → { lines: [{ id, label, detail, value }], total, mult, size }
 */
export function breakdownOf(config) {
  const size = sizeOf(config);
  const m = size.mult;
  const shape = getShape(config.shape);
  const lines = [];
  const add = (id, label, detail, value) => lines.push({ id, label, detail, value: round2(value) });

  add('base', `Bolo ${shape.name.toLowerCase()} · tamanho ${size.label}`, `${size.diameter} · ${size.serves}`, (BASE_PRICE + shape.price) * m);

  const n = config.layers.length;
  if (n > 1) add('layers', n - 1 === 1 ? '1 camada extra' : `${n - 1} camadas extras`, `${n} camadas de massa no total`, (n - 1) * EXTRA_LAYER_PRICE * m);

  const flavorSum = config.layers.reduce((s, id) => s + (getFlavor(id)?.price || 0), 0);
  if (flavorSum > 0) add('flavors', 'Massas especiais', countList(config.layers.map((id) => getFlavor(id).name)), flavorSum * m);

  const fillSum = config.fillings.reduce((s, id) => s + (getFilling(id)?.price || 0), 0);
  if (config.fillings.length) add('fillings', config.fillings.length > 1 ? 'Recheios' : 'Recheio', countList(config.fillings.map((id) => getFilling(id).name)), fillSum * m);

  const cov = getCovering(config.covering.type);
  add('covering', cov.id === 'naked' ? 'Acabamento naked' : `Cobertura de ${cov.name.toLowerCase()}`, colorName(config.covering.color), cov.price * m);

  if (config.drip.on) add('drip', 'Calda escorrendo', colorName(config.drip.color), DRIP_PRICE * m);

  const pip = getPiping(config.piping.style);
  if (pip.price > 0) {
    const place = PIPING_PLACES.find((p) => p.id === config.piping.where)?.name || '';
    add('piping', `Acabamento em ${pip.name.toLowerCase()}`, `${place} · ${colorName(config.piping.color).toLowerCase()}`, pip.price * m);
  }

  config.decor.items.forEach((id) => {
    const dcr = getDecor(id);
    const detail = id === 'velas' ? `${config.decor.candles} ${config.decor.candles === 1 ? 'unidade' : 'unidades'}` : dcr.desc;
    add(`decor-${id}`, dcr.name, detail, dcr.price * (dcr.scales ? m : 1));
  });

  if (config.decor.message) add('message', 'Plaquinha com mensagem', `“${config.decor.message}”`, MESSAGE_PRICE);

  const total = round2(lines.reduce((s, l) => s + l.value, 0));
  return { lines, total, mult: m, size };
}

export function priceOf(config) {
  return breakdownOf(config).total;
}

/** Texto de rendimento, no mesmo formato dos bolos do cardápio. */
export function servesOf(config) {
  const s = sizeOf(config);
  return `Tamanho ${s.label} · ${s.serves}`;
}

/** Prazo de preparo em horas: bolo personalizado pede 48 h; os mais elaborados, 72 h. */
export function prepHoursOf(config) {
  const elaborate = config.layers.length >= 4 || config.size === 'g' || config.decor.items.includes('flores') || Boolean(config.decor.message);
  return elaborate ? 72 : 48;
}

export function prepLabelOf(config) {
  return prepHoursOf(config) >= 72 ? '3 dias' : '2 dias';
}

/** Linhas do resumo (carrinho, pedido, favoritos). */
export function summaryOf(config) {
  const size = sizeOf(config);
  const out = [];
  out.push(`Formato: ${getShape(config.shape).name}, tamanho ${size.label} (${size.diameter})`);

  const names = config.layers.map((id) => getFlavor(id).name);
  const same = names.every((n) => n === names[0]);
  const n = names.length;
  out.push(same ? `Massa: ${n} ${n === 1 ? 'camada' : 'camadas'} de ${names[0].toLowerCase()}` : `Massa (da base ao topo): ${names.join(', ')}`);

  if (config.fillings.length) {
    const fills = config.fillings.map((id) => getFilling(id).name);
    const sameFill = fills.every((f) => f === fills[0]);
    out.push(sameFill ? `Recheio: ${fills[0]}` : `Recheio (de baixo para cima): ${fills.join(', ')}`);
  } else out.push('Recheio: sem recheio (1 camada)');

  const cov = getCovering(config.covering.type);
  const covText = cov.id === 'naked' ? `Naked, com creme ${colorName(config.covering.color).toLowerCase()} no topo` : `${cov.name} ${colorName(config.covering.color).toLowerCase()}`;
  out.push(`Cobertura: ${covText}${config.drip.on ? `, com calda ${colorName(config.drip.color).toLowerCase()} escorrendo` : ''}`);

  const pip = getPiping(config.piping.style);
  if (pip.id !== 'liso') {
    const place = PIPING_PLACES.find((p) => p.id === config.piping.where)?.name.toLowerCase() || '';
    out.push(`Acabamento: ${pip.name} ${place}, ${colorName(config.piping.color).toLowerCase()}`);
  } else out.push('Acabamento: liso');

  const decor = config.decor.items.map((id) => (id === 'velas' ? `Velas (${config.decor.candles})` : getDecor(id).name));
  out.push(decor.length ? `Decoração: ${joinPt(decor)}` : 'Decoração: sem extras');
  if (config.decor.message) out.push(`Mensagem: “${config.decor.message}”`);
  return out;
}

/** Nome sugerido quando a cliente não batiza o bolo. */
export function autoName(config) {
  const count = new Map();
  config.layers.forEach((id) => count.set(id, (count.get(id) || 0) + 1));
  const mainFlavor = getFlavor([...count].sort((a, b) => b[1] - a[1])[0][0]).name;
  const naked = config.covering.type === 'naked';
  const fill = config.fillings.length ? getFilling(config.fillings[config.fillings.length - 1]).name : '';
  const base = naked ? `Naked de ${mainFlavor}` : `Bolo de ${mainFlavor}`;
  return fill && fill.toLowerCase() !== mainFlavor.toLowerCase() ? `${base} com ${fill}` : base;
}

export function displayName(config) {
  return config.name?.trim() || autoName(config);
}
