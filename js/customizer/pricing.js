// BOLAB — regras do bolo personalizado: configuração válida, preço, rendimento, prazo e resumo.
// As telas e o motor 3D só leem daqui; valores e opções ficam em js/data/customizer.js.
//
// A configuração cresceu com o tempo (andares, altura, base, estilo da cobertura, opções de cada decoração,
// mensagem escrita com bico, velas de número, topo personalizado…). normalizeConfig aceita qualquer versão
// guardada — carrinho, favoritos, pedidos, rascunho, links — e completa o que faltar com o padrão.
import {
  BASE_PRICE,
  EXTRA_LAYER_PRICE,
  MAX_LAYERS,
  MAX_DECORS,
  MAX_CANDLES,
  MESSAGE_MAX,
  MESSAGE_PRICE,
  SCRIPT_PRICE,
  TOPPER_MAX,
  TOPPER_PRICE,
  DRIP_PRICE,
  SIZES,
  SHAPES,
  FLAVORS,
  FILLINGS,
  COVERINGS,
  FINISHES,
  PIPINGS,
  PIPING_PLACES,
  DECORS,
  BASES,
  HEIGHTS,
  TIER_OPTIONS,
  QUANTITIES,
  CANDLE_STYLES,
  SCRIPTS,
  tierRadii,
  finishAllowed,
  getShape,
  getSize,
  getFlavor,
  getFilling,
  getCovering,
  getFinish,
  getPiping,
  getDecor,
  getBase,
  getHeight,
  getQuantity,
  getArrangement,
  getCandleStyle,
  getTierOption,
  colorName,
} from '../data/customizer.js';
import { BACKDROPS, BACKDROP_AUTO } from './backdrop.js';

const round2 = (n) => Math.round(n * 100) / 100;
const HEX = /^#[0-9a-f]{6}$/i;
const hex = (v, fallback) => (HEX.test(String(v || '')) ? String(v).toLowerCase() : fallback);
const pick = (list, id, fallback) => (list.some((x) => x.id === id) ? id : fallback);

/** O bolo que aparece ao abrir o personalizador: bonito, equilibrado e com preço amigável. */
export function defaultConfig() {
  return {
    v: 2,
    shape: 'round',
    size: 'p',
    tiers: 1,
    height: 'padrao',
    base: 'boleira',
    layers: ['baunilha', 'baunilha', 'baunilha'],
    fillings: ['morango', 'ninho'],
    covering: { type: 'buttercream', color: '#f7d3dc', style: 'liso', color2: '#ffffff' },
    tierCover: null, // com 2 ou 3 andares: uma cobertura por andar (de baixo para cima) ou null = igual em todos
    drip: { on: false, color: '#ffffff' },
    piping: { style: 'rosetas', where: 'top', color: '#ffffff' },
    decor: {
      items: ['frutas'],
      opts: {}, // por decoração: { arr, qty, color }
      candles: 5,
      candleStyle: 'classica',
      number: '', // idade nas velas de número
      message: '',
      messageMode: 'placa', // 'placa' (plaquinha no palito) ou 'bico' (escrita no topo)
      script: 'cursiva',
      messageColor: '#d96b82',
      topper: { text: '', color: '#dcae52' }, // topo personalizado em acrílico
    },
    name: '',
    backdrop: BACKDROP_AUTO, // fundo do palco: 'auto' (acompanha as cores do bolo) ou o id de um fundo pronto
  };
}

/** Limpa uma mensagem para caber na plaquinha. */
export function cleanMessage(text, max = MESSAGE_MAX) {
  return String(text || '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^ /, '')
    .slice(0, max);
}

function normalizeCover(raw, fallback) {
  const type = pick(COVERINGS, raw?.type, fallback.type);
  const style = finishAllowed(type, raw?.style) && FINISHES.some((f) => f.id === raw?.style) ? raw.style : 'liso';
  const color = hex(raw?.color, raw?.type ? getCovering(type).defaultColor : fallback.color);
  return { type, color, style, color2: hex(raw?.color2, fallback.color2 || '#ffffff') };
}

/** Opções de uma decoração (arranjo, quantidade, cor), sempre válidas para aquela decoração. */
export function decorOptions(config, id) {
  const d = getDecor(id);
  const o = config?.decor?.opts?.[id] || {};
  if (!d) return { arr: 'auto', qty: 'medio', color: '#ffffff' };
  return {
    arr: d.arrs.includes(o.arr) ? o.arr : d.arrs[0],
    qty: d.qty && QUANTITIES.some((q) => q.id === o.qty) ? o.qty : 'medio',
    color: d.colors ? hex(o.color, d.color) : d.color || '#ffffff',
  };
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
  const tiers = TIER_OPTIONS.some((t) => t.n === Number(c.tiers)) ? Number(c.tiers) : 1;
  const covering = normalizeCover(c.covering, d.covering);
  const tierCover = tiers > 1 && Array.isArray(c.tierCover) ? Array.from({ length: tiers }, (_, i) => normalizeCover(c.tierCover[i] || covering, covering)) : null;
  const items = [...new Set(Array.isArray(c.decor?.items) ? c.decor.items : d.decor.items)].filter((id) => DECORS.some((x) => x.id === id)).slice(0, MAX_DECORS);
  const opts = {};
  items.forEach((id) => {
    const dec = getDecor(id);
    if (dec.qty || dec.colors || dec.arrs.length > 1) opts[id] = decorOptions(c, id);
  });
  const pipingStyle = pick(PIPINGS, c.piping?.style, 'liso');
  return {
    v: 2,
    shape: pick(SHAPES, c.shape, d.shape),
    size: pick(SIZES, c.size, d.size),
    tiers,
    height: pick(HEIGHTS, c.height, d.height),
    base: pick(BASES, c.base, d.base),
    layers,
    fillings,
    covering,
    tierCover,
    drip: { on: Boolean(c.drip?.on), color: hex(c.drip?.color, d.drip.color) },
    piping: {
      style: pipingStyle,
      where: pick(PIPING_PLACES, c.piping?.where, 'top'),
      color: hex(c.piping?.color, d.piping.color),
    },
    decor: {
      items,
      opts,
      candles: Math.max(1, Math.min(MAX_CANDLES, Math.round(Number(c.decor?.candles) || d.decor.candles))),
      candleStyle: pick(CANDLE_STYLES, c.decor?.candleStyle, 'classica'),
      number: String(c.decor?.number ?? '').replace(/\D/g, '').slice(0, 3),
      message: cleanMessage(c.decor?.message),
      messageMode: c.decor?.messageMode === 'bico' ? 'bico' : 'placa',
      script: pick(SCRIPTS, c.decor?.script, 'cursiva'),
      messageColor: hex(c.decor?.messageColor, d.decor.messageColor),
      topper: { text: cleanMessage(c.decor?.topper?.text, TOPPER_MAX), color: hex(c.decor?.topper?.color, d.decor.topper.color) },
    },
    name: String(c.name || '').replace(/[<>]/g, '').slice(0, 40),
    // bolos guardados antes de existir a escolha de fundo caem em "automático"
    backdrop: BACKDROPS.some((b) => b.id === c.backdrop) ? c.backdrop : BACKDROP_AUTO,
  };
}

export function sizeOf(config) {
  return getSize(config.size) || SIZES[0];
}

/** A cobertura de cada andar, de baixo para cima (um item só no bolo de 1 andar). */
export function coversOf(config) {
  const n = config.tiers || 1;
  return Array.from({ length: n }, (_, i) => (config.tierCover && config.tierCover[i]) || config.covering);
}

/** Fator de preço do bolo inteiro: tamanho × andares × altura. */
export function multOf(config) {
  return round2(sizeOf(config).mult * getTierOption(config.tiers || 1).mult * (getHeight(config.height)?.mult || 1));
}

/** Quanto uma opção acrescenta ao preço no bolo atual (para os "+ R$" dos seletores). */
export function deltaOf(config, price, scales = true) {
  return round2(price * (scales ? multOf(config) : 1));
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
const low = (s) => String(s).toLowerCase();

/** Diâmetros dos andares em cm, de baixo para cima: [21, 16, 10]. */
export function diametersOf(config) {
  return tierRadii(sizeOf(config).radius, config.tiers || 1).map((r) => Math.round(r * 20));
}

/** Altura total do bolo em cm (sem a base e sem a decoração). */
export function heightCmOf(config) {
  const n = config.layers.length;
  const layerH = (n === 1 ? 0.5 : n === 2 ? 0.38 : n === 3 ? 0.31 : 0.275) * (getHeight(config.height)?.k || 1);
  const tier = n * layerH + (n - 1) * 0.066 + 0.05;
  return Math.round(tier * 10 * (config.tiers || 1));
}

/** Quantas fatias rende: "8 a 10 fatias". Um andar na altura padrão usa o texto do cardápio. */
export function servesText(config) {
  const tiers = config.tiers || 1;
  if (tiers === 1 && config.height === 'padrao') return sizeOf(config).serves;
  const k = getHeight(config.height)?.k || 1;
  const area = diametersOf(config).reduce((s, d) => s + Math.PI * (d / 2) ** 2, 0) * k;
  // calibrado pelo cardápio: um bolo de 15 cm rende de 8 a 10 fatias
  const lo = Math.max(4, Math.round(area / 22));
  const hi = Math.max(lo + 2, Math.round(area / 17.6));
  return `${lo} a ${hi} fatias`;
}

function coverText(cov, withDrip = '') {
  const c = getCovering(cov.type);
  const color = low(colorName(cov.color));
  const fin = getFinish(cov.style);
  let text = c.id === 'naked' ? `Naked, com creme ${color} no topo` : `${c.name} ${color}`;
  if (fin && fin.id !== 'liso') {
    if (fin.id === 'ombre') text += ` em degradê para ${low(colorName(cov.color2))}`;
    else if (fin.id === 'aquarela') text += `, aquarela com ${low(colorName(cov.color2))}`;
    else if (fin.id === 'listras') text += `, listras com ${low(colorName(cov.color2))}`;
    else if (fin.id === 'seminaked') text += ', semi-naked';
    else if (fin.id === 'respingo') text += ', com respingo dourado';
    else text += `, ${low(fin.name)}`;
  }
  return text + withDrip;
}

/** Nome de uma decoração com as escolhas dela: "Macarons (em coroa, farto)". */
function decorText(config, id) {
  const d = getDecor(id);
  if (id === 'velas') {
    const st = config.decor.candleStyle;
    if (st === 'numero' && config.decor.number) return `Velas de número (${config.decor.number})`;
    if (st === 'faisca') return 'Vela faísca';
    return `Velas (${config.decor.candles})`;
  }
  const o = decorOptions(config, id);
  const bits = [];
  if (d.arrs.length > 1 && o.arr !== d.arrs[0]) bits.push(low(getArrangement(o.arr)?.name || ''));
  if (d.qty && o.qty !== 'medio') bits.push(low(getQuantity(o.qty).name));
  if (d.colors && o.color !== d.color) bits.push(low(colorName(o.color)));
  return bits.length ? `${d.name} (${bits.join(', ')})` : d.name;
}

/**
 * Detalhamento do preço.
 * → { lines: [{ id, label, detail, value }], total, mult, size }
 */
export function breakdownOf(config) {
  const size = sizeOf(config);
  const m = multOf(config);
  const shape = getShape(config.shape);
  const tiers = config.tiers || 1;
  const covers = coversOf(config);
  const lines = [];
  const add = (id, label, detail, value) => lines.push({ id, label, detail, value: round2(value) });

  const dias = diametersOf(config);
  add(
    'base',
    tiers > 1 ? `Bolo ${low(shape.name)} de ${tiers} andares` : `Bolo ${low(shape.name)} · tamanho ${size.label}`,
    tiers > 1 ? `${joinPt(dias.map(String))} cm · ${servesText(config)}` : `${size.diameter} · ${servesText(config)}`,
    (BASE_PRICE + shape.price) * m,
  );
  if (tiers > 1) add('tiers', 'Montagem dos andares', 'Sustentação interna e nivelamento', getTierOption(tiers).fee);
  if (config.height !== 'padrao') add('height', `Altura: ${low(getHeight(config.height).name)}`, 'Já somada no valor do bolo', 0);

  const n = config.layers.length;
  if (n > 1) add('layers', n - 1 === 1 ? '1 camada extra' : `${n - 1} camadas extras`, `${n} camadas de massa${tiers > 1 ? ' em cada andar' : ' no total'}`, (n - 1) * EXTRA_LAYER_PRICE * m);

  const flavorSum = config.layers.reduce((s, id) => s + (getFlavor(id)?.price || 0), 0);
  if (flavorSum > 0) add('flavors', 'Massas especiais', countList(config.layers.map((id) => getFlavor(id).name)), flavorSum * m);

  const fillSum = config.fillings.reduce((s, id) => s + (getFilling(id)?.price || 0), 0);
  if (config.fillings.length) add('fillings', config.fillings.length > 1 ? 'Recheios' : 'Recheio', countList(config.fillings.map((id) => getFilling(id).name)), fillSum * m);

  // cobertura: com uma por andar, vale a mais cara (o trabalho é o mesmo em todos)
  const cov = covers.reduce((a, b) => (getCovering(b.type).price > getCovering(a.type).price ? b : a));
  const mixed = covers.some((x) => x.type !== covers[0].type || x.color !== covers[0].color);
  add(
    'covering',
    mixed ? 'Cobertura por andar' : cov.type === 'naked' ? 'Acabamento naked' : `Cobertura de ${low(getCovering(cov.type).name)}`,
    mixed ? countList(covers.map((x) => `${getCovering(x.type).name} ${low(colorName(x.color))}`)) : colorName(cov.color),
    getCovering(cov.type).price * m,
  );
  const fin = covers.map((x) => getFinish(x.style)).reduce((a, b) => (b.price > a.price ? b : a));
  const finNames = [...new Set(covers.map((x) => x.style).filter((s) => s !== 'liso'))].map((s) => getFinish(s).name);
  if (finNames.length) add('finish', `Estilo: ${low(joinPt(finNames))}`, fin.desc, fin.price * m);

  if (config.drip.on) add('drip', 'Calda escorrendo', colorName(config.drip.color), DRIP_PRICE * m);

  const pip = getPiping(config.piping.style);
  if (pip.price > 0) {
    const place = pip.combo ? 'Topo, lateral e base' : PLACE_TEXT[config.piping.where] || '';
    add('piping', `Acabamento em ${low(pip.name)}`, `${place.charAt(0).toUpperCase()}${place.slice(1)}, em ${low(colorName(config.piping.color))}`, pip.price * m);
  }

  config.decor.items.forEach((id) => {
    const dcr = getDecor(id);
    const o = decorOptions(config, id);
    if (id === 'velas') {
      const st = getCandleStyle(config.decor.candleStyle);
      const detail = st.id === 'classica' ? `${config.decor.candles} ${config.decor.candles === 1 ? 'unidade' : 'unidades'}` : st.id === 'numero' ? `Número ${config.decor.number || '—'}` : st.desc;
      add('decor-velas', st.id === 'classica' ? 'Velas' : `Velas: ${low(st.name)}`, detail, dcr.price + st.price);
      return;
    }
    const q = dcr.qty ? getQuantity(o.qty).mult : 1;
    const bits = [];
    if (dcr.arrs.length > 1 && o.arr !== 'auto') bits.push(getArrangement(o.arr)?.name);
    if (dcr.qty && o.qty !== 'medio') bits.push(getQuantity(o.qty).name);
    if (dcr.colors) bits.push(colorName(o.color));
    add(`decor-${id}`, dcr.name, bits.filter(Boolean).join(' · ') || dcr.desc, dcr.price * q * (dcr.scales ? m : 1));
  });

  if (config.decor.message) {
    if (config.decor.messageMode === 'bico') add('message', 'Mensagem escrita no topo', `“${config.decor.message}” · letra ${low(SCRIPTS.find((s) => s.id === config.decor.script).name)}`, SCRIPT_PRICE);
    else add('message', 'Plaquinha com mensagem', `“${config.decor.message}”`, MESSAGE_PRICE);
  }
  if (config.decor.topper.text) add('topper', 'Topo personalizado', `“${config.decor.topper.text}” · ${low(colorName(config.decor.topper.color))}`, TOPPER_PRICE);

  const base = getBase(config.base);
  if (base.price > 0) add('stand', base.name, base.desc, base.price);

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
  const tiers = config.tiers || 1;
  return tiers > 1 ? `${tiers} andares · ${servesText(config)}` : `Tamanho ${s.label} · ${servesText(config)}`;
}

/** Prazo de preparo em horas: bolo personalizado pede 48 h; os mais elaborados, 72 h; 3 andares, 96 h. */
export function prepHoursOf(config) {
  const items = config.decor.items;
  if ((config.tiers || 1) >= 3) return 96;
  const elaborate =
    config.layers.length >= 4 ||
    config.size === 'g' ||
    (config.tiers || 1) > 1 ||
    config.piping.style === 'vintage' ||
    ['flores', 'peonias', 'macarons', 'margaridas'].some((id) => items.includes(id)) ||
    Boolean(config.decor.message) ||
    Boolean(config.decor.topper?.text);
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
  const tiers = config.tiers || 1;
  const sameFlavor = names.every((x) => x === names[0]);
  const fills = config.fillings.map((id) => getFilling(id).name);
  const covers = coversOf(config);
  const pip = getPiping(config.piping.style);
  const decor = config.decor.items.map((id) => decorText(config, id));
  if (config.decor.message) decor.push(config.decor.messageMode === 'bico' ? `“${config.decor.message}” escrito no topo` : `plaquinha “${config.decor.message}”`);
  if (config.decor.topper.text) decor.push(`topo “${config.decor.topper.text}” ${low(colorName(config.decor.topper.color))}`);
  const drip = config.drip.on ? `, com calda ${low(colorName(config.drip.color))} escorrendo` : '';
  const sameCover = covers.every((x) => JSON.stringify(x) === JSON.stringify(covers[0]));
  const extras = [];
  if (config.height !== 'padrao') extras.push(low(getHeight(config.height).name));
  if (config.base !== 'boleira') extras.push(low(getBase(config.base).name));
  const dias = diametersOf(config);
  return {
    formato: `${getShape(config.shape).name} · ${tiers > 1 ? `${tiers} andares (${joinPt(dias.map(String))} cm)` : `${size.label} (${size.diameter})`}${extras.length ? ` · ${extras.join(' · ')}` : ''}`,
    massa: sameFlavor ? `${n} ${n === 1 ? 'camada' : 'camadas'} de ${low(names[0])}${tiers > 1 ? ' em cada andar' : ''}` : `${joinPt(names)} (da base ao topo)`,
    recheio: fills.length ? countList(fills) : 'Sem recheio (bolo de 1 camada)',
    cobertura: sameCover ? coverText(covers[0], drip) : `Por andar, de baixo para cima: ${covers.map((x) => low(coverText(x))).join('; ')}${drip}`,
    acabamento: pip.id === 'liso' ? 'Liso, sem bico' : pip.combo ? `${pip.name} (guirlandas, conchas e lacinhos), em ${low(colorName(config.piping.color))}` : `${pip.name} ${PLACE_TEXT[config.piping.where] || ''}, em ${low(colorName(config.piping.color))}`,
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
  const decor = config.decor.items.map((id) => decorText(config, id));
  const tiers = config.tiers || 1;
  const out = [
    tiers > 1
      ? `Formato: ${getShape(config.shape).name}, ${tiers} andares (${joinPt(diametersOf(config).map(String))} cm)`
      : `Formato: ${getShape(config.shape).name}, tamanho ${sizeOf(config).label} (${sizeOf(config).diameter})`,
  ];
  if (config.height !== 'padrao') out.push(`Altura: ${low(getHeight(config.height).name)}`);
  out.push(
    mixedFlavor ? `Massa (da base ao topo): ${joinPt(names)}` : `Massa: ${p.massa}`,
    mixedFill ? `Recheio (de baixo para cima): ${joinPt(fills)}` : `Recheio: ${p.recheio}`,
    `Cobertura: ${p.cobertura}`,
    `Acabamento: ${p.acabamento}`,
    `Decoração: ${decor.length ? joinPt(decor) : 'sem extras'}`,
  );
  if (config.decor.message) out.push(`${config.decor.messageMode === 'bico' ? 'Escrita no topo' : 'Mensagem'}: “${config.decor.message}”`);
  if (config.decor.topper.text) out.push(`Topo personalizado: “${config.decor.topper.text}” (${low(colorName(config.decor.topper.color))})`);
  if (config.decor.items.includes('velas') && config.decor.candleStyle === 'numero' && config.decor.number) out.push(`Velas de número: ${config.decor.number}`);
  if (config.base !== 'boleira') out.push(`Base: ${low(getBase(config.base).name)}`);
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
  return fill && low(fill) !== low(mainFlavor) ? `${base} com ${fill}` : base;
}

export function displayName(config) {
  return config.name?.trim() || autoName(config);
}
