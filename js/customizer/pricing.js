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
  DRIP_METAL_PRICE,
  REVEAL_PRICE,
  VOLCANO_CM,
  FILL_ADDS,
  SOAKS,
  TRIMS,
  DRIP_AMOUNTS,
  DRIP_LENGTHS,
  REVEAL_COLORS,
  METAL_COLORS,
  isVolcano,
  getSoak,
  getFillAdd,
  getTrim,
  getDripAmount,
  getRevealColor,
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
  heightIdOf,
  layersHeightCm,
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
// r5-decor: bicos, decorações, velas, mensagens e topos (cardápio em customizer-decor.js)
import { MAX_PLACED, CANDLE_PALETTES, PLAQUE_SHAPES, TOPPER_STYLES, TOPPER_FINISHES, DOODLES, THEMES, DECOR_COLOR_NAMES, pipingPlaces, getPipingPlace, getCandlePalette, getPlaqueShape, getTopperStyle, getTopperFinish, getTheme } from '../data/customizer-decor.js';

const round2 = (n) => Math.round(n * 100) / 100;
const HEX = /^#[0-9a-f]{6}$/i;
const hex = (v, fallback) => (HEX.test(String(v || '')) ? String(v).toLowerCase() : fallback);
const pick = (list, id, fallback) => (list.some((x) => x.id === id) ? id : fallback);

/** O bolo que aparece ao abrir o personalizador: bonito, equilibrado e com preço amigável. */
export function defaultConfig() {
  return {
    v: 4,
    shape: 'round',
    size: 'p',
    tiers: 1,
    height: 'padrao', // derivada do número de camadas (2 = baixo · 3 = padrão · 4 = alto)
    base: 'boleira',
    layers: ['baunilha', 'baunilha', 'baunilha'],
    fillings: ['morango', 'ninho'],
    fillAdds: ['', ''], // adicional de cada recheio (pedaços que aparecem no corte); '' = nenhum
    soak: '', // calda de molhar a massa ('' = sem calda)
    // trim = o confeito do barrado, dos "confeitos subindo" e da fault line
    covering: { type: 'buttercream', color: '#f7d3dc', style: 'liso', color2: '#ffffff', trim: 'castanha' },
    tierCover: null, // com 2 ou 3 andares: uma cobertura por andar (de baixo para cima) ou null = igual em todos
    // amount = quanta calda (pouca · media · farta) · length = até onde desce · half = meia-lua (só de um lado) ·
    // metal = dourada / metálica
    drip: { on: false, color: '#ffffff', amount: 'media', length: 'media', half: false, metal: false },
    // chá revelação: o recheio é tingido de rosa ou azul e a cor fica em segredo até o corte
    reveal: { on: false, color: 'rosa' },
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
      topper: { text: '', color: '#dcae52', style: 'nome', finish: 'acrilico' }, // topo personalizado
      // r5-decor ↓
      candlePalette: 'colorida', // cores das velas clássicas, longas e de espiral
      plaque: 'retangulo', // formato da plaquinha
      doodle: '', // desenho de bentô ao lado da escrita com bico
      placed: [], // peças com lugar escolhido pelo cliente: [{ id, x, z, rot, scale, face, y }]
      theme: '', // tema pronto de onde o bolo partiu (só para o resumo)
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
  return { type, color, style, color2: hex(raw?.color2, fallback.color2 || '#ffffff'), trim: pick(TRIMS, raw?.trim, fallback.trim || 'castanha') };
}

/** Coberturas que o bolo vulcão aceita: cremes que escorrem do furo. */
export const VOLCANO_COVERS = ['chocolate', 'brigadeiro', 'ganache', 'ganachebranca', 'chantininho'];

/**
 * A mensagem escrita com bico cabe — e aparece — no topo deste bolo?
 *  · bolo de 3 andares: o último andar fica alto e pequeno; de frente a escrita não se lê → só plaquinha;
 *  · topo pequeno para o texto: com a letra mínima de um bico (uns 1,6 cm), não cabe nem em duas linhas.
 * Devolve { ok, why: '' | 'alto' | 'pequeno', top (cm do último andar), perLine (letras que cabem por linha) }.
 */
export function scriptRoom(config) {
  const tiers = TIER_OPTIONS.some((t) => t.n === Number(config?.tiers)) ? Number(config.tiers) : 1;
  const radii = tierRadii((getSize(config?.size) || SIZES[0]).radius, tiers);
  const top = Math.round(radii[radii.length - 1] * 20);
  const style = config?.piping?.style;
  const pipeTop = style && style !== 'liso' && (getPiping(style)?.combo || getPiping(style)?.side || ['top', 'both', 'cobre'].includes(config.piping.where || 'top'));
  // a borda de bico come espaço dos dois lados (as rosetas, o dobro)
  const room = top - (pipeTop ? (style === 'rosetas' ? 6.6 : 3.6) : 1.6);
  const perLine = Math.max(0, Math.floor(room / 0.8));
  if (tiers >= 3) return { ok: false, why: 'alto', top, perLine };
  const text = cleanMessage(config?.decor?.message).trim();
  let longest = text.length;
  for (let i = 1; i < text.length - 1; i++) {
    if (text[i] === ' ') longest = Math.min(longest, Math.max(i, text.length - i - 1));
  }
  return { ok: longest <= perLine, why: longest <= perLine ? '' : 'pequeno', top, perLine };
}

/** Opções de uma decoração (arranjo, quantidade, cor), sempre válidas para aquela decoração. */
export function decorOptions(config, id) {
  const d = getDecor(id);
  const o = config?.decor?.opts?.[id] || {};
  if (!d) return { arr: 'auto', qty: 'medio', color: '#ffffff' };
  const out = {
    arr: d.arrs.includes(o.arr) ? o.arr : d.arrs[0],
    qty: d.qty && QUANTITIES.some((q) => q.id === o.qty) ? o.qty : 'medio',
    color: d.colors ? hex(o.color, d.color) : d.color || '#ffffff',
  };
  // tipo da peça (cerca de barrinhas / champanhe / canudos, bandeirolas triangulares / juninas…)
  if (d.kinds) out.kind = d.kinds.some((k) => k.id === o.kind) ? o.kind : d.kinds[0].id;
  return out;
}

/** Peças com lugar escolhido pelo cliente: só decorações com preço por unidade, com números válidos. */
function normalizePlaced(raw) {
  if (!Array.isArray(raw)) return [];
  const num = (v, lo, hi, fallback = 0) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : fallback);
  const out = [];
  raw.forEach((q) => {
    if (!q || typeof q !== 'object' || out.length >= MAX_PLACED) return;
    const dec = getDecor(q.id);
    if (!dec || !(dec.unit > 0)) return;
    const piece = { id: dec.id, x: +num(q.x, -4, 4).toFixed(4), z: +num(q.z, -4, 4).toFixed(4), rot: +num(q.rot, -64, 64).toFixed(4), scale: +num(q.scale, 0.6, 1.4, 1).toFixed(3), face: q.face === 'lateral' ? 'lateral' : 'topo' };
    if (piece.face === 'lateral' && Number.isFinite(Number(q.y))) piece.y = +num(q.y, 0, 6).toFixed(4);
    out.push(piece);
  });
  return out;
}

/** Garante uma configuração completa e válida a partir de qualquer coisa salva (rascunho, favorito, link). */
export function normalizeConfig(raw) {
  const d = defaultConfig();
  const c = raw && typeof raw === 'object' ? raw : {};
  let layers = (Array.isArray(c.layers) && c.layers.length ? c.layers : d.layers).slice(0, MAX_LAYERS).map((id) => pick(FLAVORS, id, 'baunilha'));
  // Bolos guardados antes da anatomia nova (v < 3) tinham a "altura" como um esticador da massa. Agora a altura
  // é o número de camadas: o "alto" ganha uma camada, o "baixo" perde uma (de 2 para cima; o simples continua simples).
  if (!(Number(c.v) >= 3)) {
    if (c.height === 'alto' && layers.length >= 2 && layers.length < MAX_LAYERS) layers = [...layers, layers[layers.length - 1]];
    else if (c.height === 'baixo' && layers.length > 2) layers = layers.slice(0, -1);
  }
  // r5-estrutura: o bolo vulcão é uma massa só (fôrma de furo), sem recheio nem andares; a cobertura é o creme do furo
  const shape = pick(SHAPES, c.shape, d.shape);
  const volcano = shape === 'vulcao';
  if (volcano) layers = layers.slice(-1);
  const rawFill = Array.isArray(c.fillings) ? c.fillings : d.fillings;
  const fillings = [];
  for (let i = 0; i < layers.length - 1; i++) {
    fillings.push(pick(FILLINGS, rawFill[i], pick(FILLINGS, rawFill[rawFill.length - 1], 'brigadeiro')));
  }
  const rawAdds = Array.isArray(c.fillAdds) ? c.fillAdds : [];
  const fillAdds = fillings.map((_, i) => (FILL_ADDS.some((x) => x.id === rawAdds[i]) ? rawAdds[i] : ''));
  const tiers = !volcano && TIER_OPTIONS.some((t) => t.n === Number(c.tiers)) ? Number(c.tiers) : 1;
  const covering = normalizeCover(c.covering, d.covering);
  if (volcano) {
    if (!VOLCANO_COVERS.includes(covering.type)) {
      covering.type = 'chocolate';
      covering.color = getCovering('chocolate').defaultColor;
    }
    covering.style = 'liso';
  }
  const tierCover = tiers > 1 && Array.isArray(c.tierCover) ? Array.from({ length: tiers }, (_, i) => normalizeCover(c.tierCover[i] || covering, covering)) : null;
  const size = pick(SIZES, c.size, d.size);
  const reveal = { on: Boolean(c.reveal?.on) && !volcano, color: pick(REVEAL_COLORS, c.reveal?.color, 'rosa') };
  const items = [...new Set(Array.isArray(c.decor?.items) ? c.decor.items : d.decor.items)].filter((id) => DECORS.some((x) => x.id === id)).slice(0, MAX_DECORS);
  const opts = {};
  items.forEach((id) => {
    const dec = getDecor(id);
    if (dec.qty || dec.colors || dec.kinds || dec.arrs.length > 1) opts[id] = decorOptions(c, id);
  });
  const pipingStyle = pick(PIPINGS, c.piping?.style, 'liso');
  // cada bico aceita os seus lugares (cintura e topo inteiro não servem para todos)
  const places = pipingPlaces(pipingStyle);
  const pipingWhere = places.includes(c.piping?.where) ? c.piping.where : places[0] || 'top';
  return {
    v: 4,
    shape,
    size,
    tiers,
    height: heightIdOf(layers.length),
    base: baseFor(pick(BASES, c.base, d.base), size),
    layers,
    fillings,
    fillAdds,
    soak: pick(SOAKS, c.soak, ''),
    covering,
    tierCover,
    drip: {
      on: Boolean(c.drip?.on) && !volcano,
      color: hex(c.drip?.color, d.drip.color),
      amount: pick(DRIP_AMOUNTS, c.drip?.amount, 'media'),
      length: pick(DRIP_LENGTHS, c.drip?.length, 'media'),
      half: Boolean(c.drip?.half),
      metal: Boolean(c.drip?.metal),
    },
    reveal,
    piping: {
      style: pipingStyle,
      where: pipingWhere,
      color: hex(c.piping?.color, d.piping.color),
    },
    decor: {
      items,
      opts,
      candles: Math.max(1, Math.min(MAX_CANDLES, Math.round(Number(c.decor?.candles) || d.decor.candles))),
      candleStyle: pick(CANDLE_STYLES, c.decor?.candleStyle, 'classica'),
      number: String(c.decor?.number ?? '').replace(/\D/g, '').slice(0, 3),
      message: cleanMessage(c.decor?.message),
      // escrita no topo só onde ela cabe e aparece; senão a mensagem vai na plaquinha (ver scriptRoom)
      messageMode: c.decor?.messageMode === 'bico' && scriptRoom(c).ok ? 'bico' : 'placa',
      script: pick(SCRIPTS, c.decor?.script, 'cursiva'),
      messageColor: hex(c.decor?.messageColor, d.decor.messageColor),
      topper: {
        text: cleanMessage(c.decor?.topper?.text, TOPPER_MAX),
        color: hex(c.decor?.topper?.color, d.decor.topper.color),
        style: pick(TOPPER_STYLES, c.decor?.topper?.style, 'nome'),
        finish: pick(TOPPER_FINISHES, c.decor?.topper?.finish, 'acrilico'),
      },
      candlePalette: pick(CANDLE_PALETTES, c.decor?.candlePalette, 'colorida'),
      plaque: pick(PLAQUE_SHAPES, c.decor?.plaque, 'retangulo'),
      doodle: DOODLES.some((x) => x.id === c.decor?.doodle) ? c.decor.doodle : '',
      placed: normalizePlaced(c.decor?.placed),
      theme: THEMES.some((t) => t.id === c.decor?.theme) ? c.decor.theme : '',
    },
    name: String(c.name || '').replace(/[<>]/g, '').slice(0, 40),
    // bolos guardados antes de existir a escolha de fundo caem em "automático"
    backdrop: BACKDROPS.some((b) => b.id === c.backdrop) ? c.backdrop : BACKDROP_AUTO,
  };
}

/** A caixinha do bentô só existe para o bentô: em outro tamanho o bolo volta para a boleira. */
function baseFor(id, size) {
  const only = getBase(id)?.only;
  return only && only !== size ? 'boleira' : id;
}

export function sizeOf(config) {
  return getSize(config.size) || SIZES[0];
}

/** A cobertura de cada andar, de baixo para cima (um item só no bolo de 1 andar). */
export function coversOf(config) {
  const n = config.tiers || 1;
  return Array.from({ length: n }, (_, i) => (config.tierCover && config.tierCover[i]) || config.covering);
}

/** Fator de preço do bolo inteiro: tamanho × andares (a altura entra pelas camadas e recheios a mais). */
export function multOf(config) {
  return round2(sizeOf(config).mult * getTierOption(config.tiers || 1).mult);
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

const PLACE_TEXT = { top: 'no topo', base: 'na base', both: 'no topo e na base', cintura: 'na cintura', cobre: 'cobrindo o topo inteiro' };
/** Nome de uma cor de decoração (as metalizadas e as de fita não estão na paleta das coberturas). */
const tint = (h) => (colorName(h) === 'Cor personalizada' && DECOR_COLOR_NAMES[String(h).toLowerCase()]) || colorName(h);
/** Preço do bico no bolo (o topo inteiro coberto leva bem mais creme e tempo). */
export function pipingPriceOf(config) {
  const pip = getPiping(config.piping.style);
  if (!pip || !(pip.price > 0)) return 0;
  const place = pipingPlaces(pip.id).includes(config.piping.where) ? getPipingPlace(config.piping.where) : null;
  return round2(pip.price * (place?.mult || 1));
}
/** Texto das velas de um bolo: "Velas longas (5, douradas)". */
function candleText(config) {
  const st = getCandleStyle(config.decor.candleStyle);
  if (st.id === 'numero') return config.decor.number ? `Velas de número (${config.decor.number})` : 'Velas de número';
  if (st.id === 'faisca') return 'Vela faísca';
  if (st.id === 'letras') return 'Velas de letras (PARABÉNS)';
  const pal = st.colors ? getCandlePalette(config.decor.candlePalette) : null;
  const name = st.id === 'classica' ? 'Velas' : st.id === 'estrela' ? 'Velas de estrela' : `Velas ${low(st.name)}`;
  return `${name} (${config.decor.candles}${pal && pal.id !== 'colorida' ? `, ${low(pal.name)}` : ''})`;
}
/** Peças colocadas à mão, agrupadas por decoração: [{ id, n, name, unit }]. */
export function placedGroups(config) {
  const seen = new Map();
  (config.decor.placed || []).forEach((q) => seen.set(q.id, (seen.get(q.id) || 0) + 1));
  return [...seen].map(([id, n]) => ({ id, n, name: getDecor(id).name, unit: getDecor(id).unit }));
}
const low = (s) => String(s).toLowerCase();

/** Diâmetros dos andares em cm, de baixo para cima: [21, 16, 10]. */
export function diametersOf(config) {
  return tierRadii(sizeOf(config).radius, config.tiers || 1).map((r) => Math.round(r * 20));
}

/** Altura total do bolo em cm (sem a base e sem a decoração). */
export function heightCmOf(config) {
  if (isVolcano(config)) return VOLCANO_CM;
  // camadas de massa + recheios + a cobertura do topo de cada andar
  return Math.round((layersHeightCm(config.layers.length) + 0.5) * (config.tiers || 1));
}

/** Quantas fatias rende: "8 a 10 fatias". Um andar na altura padrão usa o texto do cardápio. */
export function servesText(config) {
  const tiers = config.tiers || 1;
  const n = config.layers.length;
  // o bentô é sempre o mesmo mini bolo: serve uma ou duas pessoas, tenha 2 ou 3 camadas
  if (tiers === 1 && (n === 3 || config.size === 'bento') && !isVolcano(config)) return sizeOf(config).serves;
  // bolo mais alto rende mais (fatias mais altas, que se cortam mais finas); o simples e o baixo, menos.
  // O vulcão é alto, mas tem o furo no meio: rende como um bolo baixo.
  const k = isVolcano(config) ? 0.8 : n <= 1 ? 0.7 : getHeight(heightIdOf(n))?.serves || 1;
  const area = diametersOf(config).reduce((s, d) => s + Math.PI * (d / 2) ** 2, 0) * k;
  // calibrado pelo cardápio: um bolo de 15 cm rende de 8 a 10 fatias
  const lo = Math.max(config.size === 'bento' ? 2 : 4, Math.round(area / 22));
  const hi = Math.max(lo + (config.size === 'bento' ? 1 : 2), Math.round(area / 17.6));
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
    else text += `, ${finishText(cov)}`;
  }
  return text + withDrip;
}

/** O estilo com o que ele leva: "barrado de castanha", "poá em rosa chá", "rosetas". */
function finishText(cov) {
  const fin = getFinish(cov.style);
  if (!fin || fin.id === 'liso') return '';
  if (fin.trim) return `${low(fin.name)} de ${low(getTrim(cov.trim)?.name || '')}`;
  if (fin.two) return `${low(fin.name)} em ${low(colorName(cov.color2))}`;
  return low(fin.name);
}
/** Preço do estilo de uma cobertura (a técnica + o confeito, quando leva). */
const finishPrice = (cov) => (getFinish(cov.style)?.price || 0) + (getFinish(cov.style)?.trim ? getTrim(cov.trim)?.price || 0 : 0);

/** A calda em palavras: "caramelo, farta, em meia-lua". */
function dripText(drip) {
  const metal = METAL_COLORS.find((x) => x.hex === drip.color)?.name;
  const bits = [drip.metal ? (metal ? low(metal) : `${low(colorName(drip.color))} metálica`) : low(colorName(drip.color))];
  if (drip.amount !== 'media') bits.push(low(getDripAmount(drip.amount).name));
  if (drip.length !== 'media') bits.push(drip.length === 'curta' ? 'gotas curtas' : 'gotas longas');
  if (drip.half) bits.push('em meia-lua');
  return bits.join(', ');
}

/** Nome de um recheio com o adicional dele: "Ninho com morango fresco". */
function fillText(config, i) {
  const add = getFillAdd(config.fillAdds?.[i]);
  const name = getFilling(config.fillings[i]).name;
  return add ? `${name} com ${low(add.name)}` : name;
}

/** Nome de uma decoração com as escolhas dela: "Macarons (em coroa, farto)". */
function decorText(config, id) {
  const d = getDecor(id);
  if (id === 'velas') return candleText(config);
  const o = decorOptions(config, id);
  const bits = [];
  if (d.kinds && o.kind !== d.kinds[0].id) bits.push(low(d.kinds.find((k) => k.id === o.kind)?.name || ''));
  if (d.arrs.length > 1 && o.arr !== d.arrs[0]) bits.push(low(getArrangement(o.arr)?.name || ''));
  if (d.qty && o.qty !== 'medio') bits.push(low(getQuantity(o.qty).name));
  if (d.colors && o.color !== d.color) bits.push(low(tint(o.color)));
  return bits.length ? `${d.name} (${bits.join(', ')})` : d.name;
}

/** "dourado · no aro · papel com glitter": o topo personalizado em poucas palavras. */
function topperText(config) {
  const t = config.decor.topper;
  const bits = [low(tint(t.color))];
  if (t.style && t.style !== 'nome') bits.push(low(getTopperStyle(t.style).name));
  if (t.finish && t.finish !== 'acrilico') bits.push(low(getTopperFinish(t.finish).name));
  return bits.join(' · ');
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
    tiers > 1 ? `Bolo ${low(shape.name)} de ${tiers} andares` : `Bolo ${low(shape.name)} · ${size.id === 'bento' ? 'bentô' : `tamanho ${size.label}`}`,
    tiers > 1 ? `${joinPt(dias.map(String))} cm · ${servesText(config)}` : `${size.diameter} · ${servesText(config)}`,
    (BASE_PRICE + shape.price) * m,
  );
  if (tiers > 1) add('tiers', 'Montagem dos andares', 'Sustentação interna e nivelamento', getTierOption(tiers).fee);

  const n = config.layers.length;
  if (n > 1) add('layers', n - 1 === 1 ? '1 camada extra' : `${n - 1} camadas extras`, `${n} camadas de massa${tiers > 1 ? ' em cada andar' : ''} · ${heightCmOf(config)} cm de altura`, (n - 1) * EXTRA_LAYER_PRICE * m);

  const flavorSum = config.layers.reduce((s, id) => s + (getFlavor(id)?.price || 0), 0);
  if (flavorSum > 0) add('flavors', 'Massas especiais', countList(config.layers.map((id) => getFlavor(id).name)), flavorSum * m);

  const fillSum = config.fillings.reduce((s, id) => s + (getFilling(id)?.price || 0), 0);
  if (config.fillings.length) add('fillings', config.fillings.length > 1 ? 'Recheios' : 'Recheio', countList(config.fillings.map((id) => getFilling(id).name)), fillSum * m);
  const adds = (config.fillAdds || []).map(getFillAdd).filter(Boolean);
  if (adds.length) add('filladds', adds.length > 1 ? 'Adicionais no recheio' : 'Adicional no recheio', countList(adds.map((x) => x.name)), adds.reduce((sum, x) => sum + x.price, 0) * m);
  const soak = getSoak(config.soak);
  if (soak) add('soak', 'Calda de molhar a massa', soak.name, soak.price * m);

  // cobertura: com uma por andar, vale a mais cara (o trabalho é o mesmo em todos)
  const cov = covers.reduce((a, b) => (getCovering(b.type).price > getCovering(a.type).price ? b : a));
  const mixed = covers.some((x) => x.type !== covers[0].type || x.color !== covers[0].color);
  add(
    'covering',
    mixed ? 'Cobertura por andar' : cov.type === 'naked' ? 'Acabamento naked' : isVolcano(config) ? `${getCovering(cov.type).name} transbordando` : `Cobertura de ${low(getCovering(cov.type).name)}`,
    mixed ? countList(covers.map((x) => `${getCovering(x.type).name} ${low(colorName(x.color))}`)) : colorName(cov.color),
    getCovering(cov.type).price * m,
  );
  // estilo: com um por andar, vale o mais caro (a técnica + o confeito, quando leva)
  const styled = covers.reduce((a, b) => (finishPrice(b) > finishPrice(a) ? b : a));
  const finNames = [...new Set(covers.filter((x) => x.style !== 'liso').map(finishText))];
  if (finNames.length) add('finish', `Estilo: ${joinPt(finNames)}`, getFinish(styled.style).desc, finishPrice(styled) * m);

  if (isVolcano(config)) {
    const extra = getDripAmount(config.drip.amount).price;
    if (extra > 0) add('drip', 'Cobertura farta', 'Transborda do furo e desce por toda a volta', extra * m);
  } else if (config.drip.on) {
    const text = dripText(config.drip);
    add('drip', 'Calda escorrendo', text.charAt(0).toUpperCase() + text.slice(1), (DRIP_PRICE + getDripAmount(config.drip.amount).price + (config.drip.metal ? DRIP_METAL_PRICE : 0)) * m);
  }
  // chá revelação: a cor não aparece aqui (quem monta o bolo pode estar ao lado de quem não pode saber)
  if (config.reveal?.on) add('reveal', 'Chá revelação', 'Recheio tingido · a cor fica em segredo', REVEAL_PRICE);

  const pip = getPiping(config.piping.style);
  if (pip.price > 0) {
    const place = pip.combo ? 'Topo, lateral e base' : pip.side ? 'Lateral, com a borda do topo' : PLACE_TEXT[config.piping.where] || '';
    add('piping', `Acabamento em ${low(pip.name)}`, `${place.charAt(0).toUpperCase()}${place.slice(1)}, em ${low(colorName(config.piping.color))}`, pipingPriceOf(config) * m);
  }

  config.decor.items.forEach((id) => {
    const dcr = getDecor(id);
    const o = decorOptions(config, id);
    if (id === 'velas') {
      const st = getCandleStyle(config.decor.candleStyle);
      const pal = st.colors ? getCandlePalette(config.decor.candlePalette) : null;
      const units = `${config.decor.candles} ${config.decor.candles === 1 ? 'unidade' : 'unidades'}${pal && pal.id !== 'colorida' ? ` · ${low(pal.name)}` : ''}`;
      const detail = st.count ? units : st.id === 'numero' ? `Número ${config.decor.number || '—'}` : st.desc;
      add('decor-velas', st.id === 'classica' ? 'Velas' : `Velas: ${low(st.name)}`, detail, dcr.price + st.price);
      return;
    }
    const q = dcr.qty ? getQuantity(o.qty).mult : 1;
    const bits = [];
    if (dcr.arrs.length > 1 && o.arr !== 'auto') bits.push(getArrangement(o.arr)?.name);
    if (dcr.qty && o.qty !== 'medio') bits.push(getQuantity(o.qty).name);
    if (dcr.kinds) bits.unshift(dcr.kinds.find((k) => k.id === o.kind)?.name);
    if (dcr.colors) bits.push(tint(o.color));
    add(`decor-${id}`, dcr.name, bits.filter(Boolean).join(' · ') || dcr.desc, dcr.price * q * (dcr.scales ? m : 1));
  });
  // peças colocadas à mão: por unidade (preço fixo, não acompanha o tamanho do bolo)
  placedGroups(config).forEach((g) => add(`placed-${g.id}`, `${g.name}: ${g.n === 1 ? '1 peça avulsa' : `${g.n} peças avulsas`}`, 'Colocadas uma a uma, onde você escolheu', g.unit * g.n));

  if (config.decor.message) {
    if (config.decor.messageMode === 'bico') add('message', 'Mensagem escrita no topo', `“${config.decor.message}” · letra ${low(SCRIPTS.find((s) => s.id === config.decor.script).name)}${config.decor.doodle ? ` · com ${low(DOODLES.find((x) => x.id === config.decor.doodle).name)}` : ''}`, SCRIPT_PRICE);
    else add('message', 'Plaquinha com mensagem', `“${config.decor.message}”${config.decor.plaque !== 'retangulo' ? ` · ${low(getPlaqueShape(config.decor.plaque).name)}` : ''}`, MESSAGE_PRICE);
  }
  if (config.decor.topper.text) add('topper', 'Topo personalizado', `“${config.decor.topper.text}” · ${topperText(config)}`, TOPPER_PRICE);

  const base = getBase(config.base);
  if (base.price > 0) add('stand', base.name, base.desc, base.price);

  const total = round2(lines.reduce((s, l) => s + l.value, 0));
  return { lines, total, mult: m, size };
}

export function priceOf(config) {
  return breakdownOf(config).total;
}

/* ───────── O que não coube não é cobrado ─────────
   O distribuidor de decorações (occupancy.js, que precisa do 3D) diz o que coube no bolo; aqui, sem 3D nenhum,
   esse resultado vira uma configuração "cobrável": sai o que não coube e a quantidade passa a ser a que ficou.
   É essa configuração que o painel soma e que vai para o carrinho, os favoritos e o pedido — então carrinho,
   pedidos e o desenho 2D continuam calculando o preço só com priceOf(configuração guardada). */

/** A quantidade (pouco · médio · farto) mais próxima do que de fato ficou no bolo — nunca acima da escolhida. */
function fittedQty(wantedId, f) {
  const wanted = getQuantity(wantedId) || getQuantity('medio');
  if (!f || !(f.want > 0) || f.got >= f.want) return wanted.id;
  let best = wanted;
  let gap = Infinity;
  // do mais barato para o mais caro: no empate, fica o mais barato
  QUANTITIES.filter((q) => q.k <= wanted.k).forEach((q) => {
    const d = Math.abs(f.got - f.want * Math.pow(q.k / wanted.k, f.p ?? 1));
    if (d < gap - 1e-9) {
      best = q;
      gap = d;
    }
  });
  return best.id;
}

/**
 * O bolo como ele será feito e cobrado, dado o que o distribuidor informou (decorNotes: { unfitIds, fit }).
 * → { config, removed: [id…], lowered: [{ id, from, to }], candles: { from, to } | null, changed }
 *   removed traz ids de decoração e também 'escrita' (mensagem com bico que não coube no topo).
 * Função pura: não chama o distribuidor. Quem tem o 3D carregado repete a conta até nada mais mudar.
 */
export function billableConfig(config, fit) {
  const out = normalizeConfig(config);
  const unfit = new Set(Array.isArray(fit?.unfitIds) ? fit.unfitIds : []);
  const counts = fit?.fit && typeof fit.fit === 'object' ? fit.fit : {};
  const removed = out.decor.items.filter((id) => unfit.has(id));
  const lowered = [];
  let candles = null;
  out.decor.items = out.decor.items.filter((id) => !unfit.has(id));
  removed.forEach((id) => delete out.decor.opts[id]);
  out.decor.items.forEach((id) => {
    const d = getDecor(id);
    if (d.qty && out.decor.opts[id]) {
      const from = out.decor.opts[id].qty;
      const to = fittedQty(from, counts[id]);
      if (to !== from) {
        out.decor.opts[id].qty = to;
        lowered.push({ id, from, to });
      }
    }
    // velas clássicas: o pedido leva as que couberam (o preço das velas não muda com a quantidade)
    if (id === 'velas' && out.decor.candleStyle === 'classica' && counts.velas && counts.velas.got >= 1 && counts.velas.got < out.decor.candles) {
      candles = { from: out.decor.candles, to: Math.round(counts.velas.got) };
      out.decor.candles = candles.to;
    }
  });
  if (unfit.has('escrita') && out.decor.message && out.decor.messageMode === 'bico') {
    out.decor.message = '';
    removed.push('escrita');
  }
  // peças colocadas à mão: ficam as que couberam, já no lugar em que ficaram (fit.placed vem do distribuidor)
  let placedOut = 0;
  let placedMoved = 0;
  if (Array.isArray(fit?.placed) && fit.placed.length === out.decor.placed.length && out.decor.placed.length) {
    const kept = [];
    out.decor.placed.forEach((q, i) => {
      const r = fit.placed[i];
      if (!r || !r.ok) return void placedOut++;
      const next = { ...q, x: +Number(r.x).toFixed(4), z: +Number(r.z).toFixed(4) };
      if (q.face === 'lateral' && Number.isFinite(r.y)) next.y = +Number(r.y).toFixed(4);
      if (Math.abs(next.x - q.x) > 2e-4 || Math.abs(next.z - q.z) > 2e-4 || (next.y != null && Math.abs(next.y - (q.y ?? -9)) > 2e-4)) placedMoved++;
      kept.push(next);
    });
    out.decor.placed = kept;
  }
  return { config: out, removed, lowered, candles, placedOut, placedMoved, changed: Boolean(removed.length || lowered.length || candles || placedOut || placedMoved) };
}

const BILL_NAME = (id) => (id === 'escrita' ? 'mensagem escrita no topo' : low(getDecor(id)?.name || id));

/** Antes de gravar: o que o painel explica, uma frase por linha ([] quando tudo coube). */
export function billPreview(bill) {
  const out = [];
  if (bill?.removed?.length) {
    const many = bill.removed.length > 1;
    out.push(`Não coube neste bolo · não cobrado: ${joinPt(bill.removed.map(BILL_NAME))}. Para ${many ? 'caberem' : 'caber'}, tire outra decoração do topo ou escolha um bolo maior; ao adicionar ao carrinho, ${many ? 'esses itens saem' : 'esse item sai'} do bolo.`);
  }
  (bill?.lowered || []).forEach((l) => out.push(`${getDecor(l.id).name}: coube a quantidade “${low(getQuantity(l.to).name)}”, e é ela que entra no preço.`));
  if (bill?.candles) out.push(`Velas: couberam ${bill.candles.to} das ${bill.candles.from}; o pedido vai com ${bill.candles.to}.`);
  if (bill?.placedOut) out.push(bill.placedOut === 1 ? 'Uma peça colocada à mão não coube · não cobrada.' : `${bill.placedOut} peças colocadas à mão não couberam · não cobradas.`);
  return out;
}

/** Aviso curto do que mudou ao gravar o bolo ('' quando nada mudou). bill = resultado de billableConfig. */
export function billNotice(bill) {
  const out = [];
  if (bill?.removed?.length) out.push(`Tiramos o que não coube no bolo: ${joinPt(bill.removed.map(BILL_NAME))}.`);
  if (bill?.lowered?.length) out.push(`Cobramos a quantidade que coube: ${joinPt(bill.lowered.map((l) => `${BILL_NAME(l.id)} (${low(getQuantity(l.to).name)})`))}.`);
  if (bill?.candles) out.push(`Couberam ${bill.candles.to} das ${bill.candles.from} velas.`);
  if (bill?.placedOut) out.push(bill.placedOut === 1 ? 'Tiramos uma peça avulsa que não coube.' : `Tiramos ${bill.placedOut} peças avulsas que não couberam.`);
  return out.join(' ');
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

/**
 * Horas a mais que as escolhas de estrutura, sabor e cobertura pedem (o campo `prep` de cada opção do cardápio):
 * vale a MAIOR, não a soma — a pasta americana seca enquanto a mousse firma.
 * → { hours, why: [nomes das opções que pedem prazo] }
 */
export function extraPrepOf(config) {
  const picked = [
    getSize(config.size),
    getShape(config.shape),
    getBase(config.base),
    getSoak(config.soak),
    ...config.layers.map(getFlavor),
    ...config.fillings.map(getFilling),
    ...(config.fillAdds || []).map(getFillAdd),
    ...coversOf(config).flatMap((x) => [getCovering(x.type), getFinish(x.style)]),
  ].filter((x) => x && x.prep > 0);
  const hours = picked.reduce((max, x) => Math.max(max, x.prep), 0);
  return { hours, why: [...new Set(picked.filter((x) => x.prep === hours).map((x) => x.name || x.label))] };
}

/**
 * Prazo de preparo em horas: bolo personalizado pede 48 h; os mais elaborados, 72 h; 3 andares, 96 h —
 * mais o que as opções escolhidas pedirem a mais (pasta americana, GG…), até 5 dias.
 */
export function prepHoursOf(config) {
  const items = config.decor.items;
  const extra = extraPrepOf(config).hours;
  if ((config.tiers || 1) >= 3) return Math.min(120, 96 + extra);
  const elaborate =
    config.layers.length >= 4 ||
    config.size === 'g' ||
    (config.tiers || 1) > 1 ||
    (getPiping(config.piping.style)?.prep || 0) >= 24 ||
    // r5-decor: peças modeladas, secas ou maturadas de véspera (campo `prep` do cardápio)
    [...items, ...(config.decor.placed || []).map((q) => q.id)].some((id) => (getDecor(id)?.prep || 0) >= 24) ||
    Boolean(config.decor.message) ||
    Boolean(config.decor.topper?.text);
  return Math.min(120, (elaborate ? 72 : 48) + extra);
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
  const fills = config.fillings.map((id, i) => fillText(config, i));
  const covers = coversOf(config);
  const pip = getPiping(config.piping.style);
  const decor = config.decor.items.map((id) => decorText(config, id));
  placedGroups(config).forEach((g) => decor.push(`${low(g.name)} avulsos (${g.n})`));
  if (config.decor.message) decor.push(config.decor.messageMode === 'bico' ? `“${config.decor.message}” escrito no topo` : `plaquinha “${config.decor.message}”`);
  if (config.decor.topper.text) decor.push(`topo “${config.decor.topper.text}” ${topperText(config)}`);
  const drip = config.drip.on ? `, com calda ${dripText(config.drip)} escorrendo` : '';
  const volcano = isVolcano(config);
  const soak = getSoak(config.soak);
  const sameCover = covers.every((x) => JSON.stringify(x) === JSON.stringify(covers[0]));
  const extras = [];
  if (config.height !== 'padrao') extras.push(low(getHeight(config.height).name));
  if (config.base !== 'boleira') extras.push(low(getBase(config.base).name));
  const dias = diametersOf(config);
  if (volcano) {
    const amount = getDripAmount(config.drip.amount);
    return {
      formato: `Vulcão · ${size.label} (${size.diameter})${config.base !== 'boleira' ? ` · ${low(getBase(config.base).name)}` : ''}`,
      massa: `Massa de ${low(names[0])}, de fôrma de furo${soak ? `, molhada com calda de ${low(soak.name)}` : ''}`,
      recheio: 'Sem recheio: a cobertura enche o furo',
      cobertura: `${getCovering(covers[0].type).name} ${low(colorName(covers[0].color))} transbordando do furo${amount.id === 'media' ? '' : amount.id === 'farta' ? ', bem farta' : ', só um fio'}`,
      acabamento: 'Liso, sem bico',
      decoracao: decor.length ? joinPt(decor) : 'Sem decoração extra',
    };
  }
  const massa = sameFlavor ? `${n} ${n === 1 ? 'camada' : 'camadas'} de ${low(names[0])}${tiers > 1 ? ' em cada andar' : ''}` : `${joinPt(names)} (da base ao topo)`;
  const recheio = fills.length ? countList(fills) : 'Sem recheio (bolo de 1 camada)';
  return {
    formato: `${getShape(config.shape).name} · ${tiers > 1 ? `${tiers} andares (${joinPt(dias.map(String))} cm)` : `${size.label} (${size.diameter})`}${extras.length ? ` · ${extras.join(' · ')}` : ''}`,
    massa: soak ? `${massa}, molhada com calda de ${low(soak.name)}` : massa,
    recheio: config.reveal?.on && fills.length ? `${recheio} · chá revelação (cor em segredo)` : recheio,
    cobertura: sameCover ? coverText(covers[0], drip) : `Por andar, de baixo para cima: ${covers.map((x) => low(coverText(x))).join('; ')}${drip}`,
    acabamento: pip.id === 'liso' ? 'Liso, sem bico' : pip.combo ? `${pip.name} (guirlandas, conchas e lacinhos), em ${low(colorName(config.piping.color))}` : pip.side ? `${pip.name} na lateral, em ${low(colorName(config.piping.color))}` : `${pip.name} ${PLACE_TEXT[config.piping.where] || ''}, em ${low(colorName(config.piping.color))}`,
    decoracao: decor.length ? joinPt(decor) : 'Sem decoração extra',
  };
}

/** Linhas do resumo guardadas com o pedido (carrinho, pedido, favoritos): a ordem dos recheios fica explícita. */
export function summaryOf(config) {
  const p = partsOf(config);
  const fills = config.fillings.map((id, i) => fillText(config, i));
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
  out.push(`Altura: ${heightCmOf(config)} cm (${config.layers.length === 1 ? 'bolo simples, 1 camada' : `${config.layers.length} camadas de massa${(config.tiers || 1) > 1 ? ' por andar' : ''}`})`);
  out.push(
    mixedFlavor ? `Massa (da base ao topo): ${joinPt(names)}` : `Massa: ${p.massa}`,
    mixedFill ? `Recheio (de baixo para cima): ${joinPt(fills)}` : `Recheio: ${p.recheio}`,
  );
  // a cor do chá revelação fica fora do resumo que o cliente vê: ela vai na configuração e na ficha de produção
  if (config.reveal?.on && mixedFill) out.push('Chá revelação: recheio tingido, cor em segredo');
  out.push(
    `Cobertura: ${p.cobertura}`,
    `Acabamento: ${p.acabamento}`,
    `Decoração: ${decor.length ? joinPt(decor) : 'sem extras'}`,
  );
  placedGroups(config).forEach((g) => out.push(`Peças avulsas: ${g.name} (${g.n})`));
  if (config.decor.theme) out.push(`Tema de partida: ${getTheme(config.decor.theme).name}`);
  if (config.decor.message) out.push(`${config.decor.messageMode === 'bico' ? 'Escrita no topo' : 'Mensagem'}: “${config.decor.message}”${config.decor.messageMode === 'bico' ? (config.decor.doodle ? ` (com ${low(DOODLES.find((x) => x.id === config.decor.doodle).name)})` : '') : config.decor.plaque !== 'retangulo' ? ` (plaquinha em ${low(getPlaqueShape(config.decor.plaque).name)})` : ''}`);
  if (config.decor.topper.text) out.push(`Topo personalizado: “${config.decor.topper.text}” (${topperText(config)})`);
  if (config.decor.items.includes('velas') && config.decor.candleStyle === 'numero' && config.decor.number) out.push(`Velas de número: ${config.decor.number}`);
  if (config.base !== 'boleira') out.push(`Base: ${low(getBase(config.base).name)}`);
  return out;
}

/** Nome sugerido quando a cliente não batiza o bolo. */
export function autoName(config) {
  const count = new Map();
  config.layers.forEach((id) => count.set(id, (count.get(id) || 0) + 1));
  const mainFlavor = getFlavor([...count].sort((a, b) => b[1] - a[1])[0][0]).name;
  if (isVolcano(config)) return `Vulcão de ${mainFlavor} com ${getCovering(config.covering.type).name.replace(/ com granulado$/, '')}`;
  const naked = config.covering.type === 'naked';
  const fill = config.fillings.length ? getFilling(config.fillings[config.fillings.length - 1]).name : '';
  const base = config.size === 'bento' ? `Bentô de ${mainFlavor}` : naked ? `Naked de ${mainFlavor}` : `Bolo de ${mainFlavor}`;
  return fill && low(fill) !== low(mainFlavor) ? `${base} com ${fill}` : base;
}

export function displayName(config) {
  return config.name?.trim() || autoName(config);
}

/* ───────── r5-decor: ficha de produção ─────────
   Como cada peça do bolo é feita (campo `craft` do cardápio): uma linha por bico, decoração, vela, mensagem e
   topo. → [{ id, label, craft, prep }] */
export function craftOf(config) {
  const out = [];
  const pip = getPiping(config.piping.style);
  if (pip && pip.id !== 'liso') out.push({ id: 'piping', label: `Bico: ${pip.name}`, craft: pip.craft || '', prep: pip.prep || 0 });
  config.decor.items.forEach((id) => {
    const d = getDecor(id);
    if (id === 'velas') {
      const st = getCandleStyle(config.decor.candleStyle);
      out.push({ id: 'decor-velas', label: decorText(config, id), craft: st.craft || d.craft || '', prep: 0 });
      return;
    }
    out.push({ id: `decor-${id}`, label: decorText(config, id), craft: d.craft || '', prep: d.prep || 0 });
  });
  placedGroups(config).forEach((g) => out.push({ id: `placed-${g.id}`, label: `${g.name}: ${g.n} avulsas, na posição do desenho`, craft: getDecor(g.id).craft || '', prep: getDecor(g.id).prep || 0 }));
  if (config.decor.message) {
    if (config.decor.messageMode === 'bico') {
      out.push({ id: 'message', label: `Escrita no topo: “${config.decor.message}”`, craft: SCRIPTS.find((x) => x.id === config.decor.script)?.craft || '', prep: 0 });
      if (config.decor.doodle) out.push({ id: 'doodle', label: `Desenho: ${DOODLES.find((x) => x.id === config.decor.doodle).name}`, craft: DOODLES.find((x) => x.id === config.decor.doodle).craft || '', prep: 0 });
    } else out.push({ id: 'message', label: `Plaquinha: “${config.decor.message}”`, craft: getPlaqueShape(config.decor.plaque).craft || '', prep: 12 });
  }
  if (config.decor.topper.text) out.push({ id: 'topper', label: `Topo: “${config.decor.topper.text}”`, craft: `${getTopperStyle(config.decor.topper.style).craft} · ${getTopperFinish(config.decor.topper.finish).craft}`, prep: 24 });
  return out;
}

/** Aplica um tema pronto (customizer-decor.js → THEMES) a um bolo: troca decorações e bico; o resto fica. */
export function applyTheme(config, themeId) {
  const theme = getTheme(themeId);
  if (!theme) return normalizeConfig(config);
  const next = JSON.parse(JSON.stringify(config));
  const a = theme.apply || {};
  if (a.cover?.color) {
    next.covering = { ...next.covering, color: a.cover.color };
    if (Array.isArray(next.tierCover)) next.tierCover = next.tierCover.map((c) => ({ ...c, color: a.cover.color }));
  }
  if (a.piping) next.piping = { ...next.piping, where: 'top', ...a.piping };
  const d = a.decor || {};
  next.decor = {
    ...next.decor,
    items: (d.items || []).slice(),
    opts: JSON.parse(JSON.stringify(d.opts || {})),
    placed: [],
    theme: theme.id,
  };
  ['candles', 'candleStyle', 'candlePalette', 'number', 'message', 'messageMode', 'plaque'].forEach((k) => {
    if (d[k] != null) next.decor[k] = d[k];
  });
  return normalizeConfig(next);
}
