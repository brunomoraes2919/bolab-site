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
    .replace(/^ /, '')
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

function joinPt(list) {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`;
}

/** "Morango (2×) e Ninho": agrupa os repetidos na ordem em que aparecem. */
function countList(names) {
  const seen = new Map();
  names.forEach((n) => seen.set(n, (seen.get(n) || 0) + 1));
  return joinPt([...seen].map(([name, n]) => (n > 1 ? `${name} (${n}×)` : name)));
}

const PLACE_TEXT = { top: 'no topo', base: 'na base', both: 'no topo e na base' };

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
    const place = PLACE_TEXT[config.piping.where] || '';
    add('piping', `Acabamento em ${pip.name.toLowerCase()}`, `${place.charAt(0).toUpperCase()}${place.slice(1)}, em ${colorName(config.piping.color).toLowerCase()}`, pip.price * m);
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

/** O menor preço possível no personalizador (bolo P mais simples) — calculado, nunca fixo. */
export function minPrice() {
  const cheapest = (list) => list.reduce((a, b) => (b.price < a.price ? b : a));
  return priceOf(
    normalizeConfig({
      shape: cheapest(SHAPES).id,
      size: SIZES.reduce((a, b) => (b.mult < a.mult ? b : a)).id,
      layers: [cheapest(FLAVORS).id],
      fillings: [],
      covering: { type: cheapest(COVERINGS).id },
      drip: { on: false },
      piping: { style: cheapest(PIPINGS).id },
      decor: { items: [], message: '' },
    }),
  );
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

/**
 * O bolo descrito em frases curtas, uma por parte (tela de resumo).
 * → { formato, massa, recheio, cobertura, acabamento, decoracao }
 */
export function partsOf(config) {
  const size = sizeOf(config);
  const names = config.layers.map((id) => getFlavor(id).name);
  const n = names.length;
  const sameFlavor = names.every((x) => x === names[0]);
  const fills = config.fillings.map((id) => getFilling(id).name);
  const cov = getCovering(config.covering.type);
  const covColor = colorName(config.covering.color).toLowerCase();
  const pip = getPiping(config.piping.style);
  const decor = config.decor.items.map((id) => (id === 'velas' ? `Velas (${config.decor.candles})` : getDecor(id).name));
  if (config.decor.message) decor.push(`plaquinha “${config.decor.message}”`);
  return {
    formato: `${getShape(config.shape).name} · ${size.label} (${size.diameter})`,
    massa: sameFlavor ? `${n} ${n === 1 ? 'camada' : 'camadas'} de ${names[0].toLowerCase()}` : `${joinPt(names)} (da base ao topo)`,
    recheio: fills.length ? countList(fills) : 'Sem recheio (bolo de 1 camada)',
    cobertura: `${cov.id === 'naked' ? `Naked, com creme ${covColor} no topo` : `${cov.name} ${covColor}`}${config.drip.on ? `, com calda ${colorName(config.drip.color).toLowerCase()} escorrendo` : ''}`,
    acabamento: pip.id === 'liso' ? 'Liso, sem bico' : `${pip.name} ${PLACE_TEXT[config.piping.where] || ''}, em ${colorName(config.piping.color).toLowerCase()}`,
    decoracao: decor.length ? joinPt(decor) : 'Sem decoração extra',
  };
}

/** Linhas do resumo guardadas com o pedido (carrinho, pedido, favoritos): a ordem dos recheios fica explícita. */
export function summaryOf(config) {
  const p = partsOf(config);
  const fills = config.fillings.map((id) => getFilling(id).name);
  const mixedFill = fills.some((f) => f !== fills[0]);
  const names = config.layers.map((id) => getFlavor(id).name);
  const mixedFlavor = names.some((x) => x !== names[0]);
  const decor = config.decor.items.map((id) => (id === 'velas' ? `Velas (${config.decor.candles})` : getDecor(id).name));
  const out = [
    `Formato: ${getShape(config.shape).name}, tamanho ${sizeOf(config).label} (${sizeOf(config).diameter})`,
    mixedFlavor ? `Massa (da base ao topo): ${joinPt(names)}` : `Massa: ${p.massa}`,
    mixedFill ? `Recheio (de baixo para cima): ${joinPt(fills)}` : `Recheio: ${p.recheio}`,
    `Cobertura: ${p.cobertura}`,
    `Acabamento: ${p.acabamento}`,
    `Decoração: ${decor.length ? joinPt(decor) : 'sem extras'}`,
  ];
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
