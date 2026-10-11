// BOLAB — pontos de partida do personalizador: inspirações, bolos do cardápio e "Surpreenda-me".
import { FLAVORS, FILLINGS, getDecor } from '../data/customizer.js';
import { normalizeConfig } from './pricing.js';

const cfg = (c) => normalizeConfig({ decor: { items: [] }, ...c });

/** Inspirações: combinações completas e equilibradas, para ninguém começar do zero. */
export const PRESETS = [
  {
    id: 'morango',
    occasion: 'aniversario',
    name: 'Morango dos Sonhos',
    tag: 'Baunilha, morango e ninho',
    config: cfg({
      shape: 'round',
      layers: ['baunilha', 'baunilha', 'baunilha'],
      fillings: ['morango', 'ninho'],
      covering: { type: 'buttercream', color: '#f7d3dc' },
      drip: { on: true, color: '#ffffff' },
      piping: { style: 'rosetas', where: 'top', color: '#ffffff' },
      decor: { items: ['frutas'] },
    }),
  },
  {
    id: 'belga',
    occasion: 'aniversario',
    name: 'Chocolate Belga',
    tag: 'Para quem ama chocolate',
    config: cfg({
      shape: 'round',
      layers: ['chocolate', 'chocolate', 'chocolate'],
      fillings: ['brigadeiro', 'nutella'],
      covering: { type: 'ganache', color: '#3a1a08' },
      drip: { on: false, color: '#6b3f22' },
      piping: { style: 'conchas', where: 'base', color: '#6b3f22' },
      decor: { items: ['raspas', 'frutas'] },
    }),
  },
  {
    id: 'festa',
    occasion: 'infantil',
    name: 'Festa Confete',
    tag: 'Colorido e cheio de alegria',
    config: cfg({
      shape: 'round',
      layers: ['baunilha', 'morango', 'baunilha'],
      fillings: ['ninho', 'brigadeiro'],
      covering: { type: 'chantilly', color: '#ffffff' },
      drip: { on: true, color: '#d96b82' },
      piping: { style: 'estrelas', where: 'both', color: '#9bd4ff' },
      decor: { items: ['confete', 'velas', 'topo'], candles: 6 },
    }),
  },
  {
    id: 'amor',
    occasion: 'namorados',
    name: 'Red Velvet do Amor',
    tag: 'Coração para presentear',
    config: cfg({
      shape: 'heart',
      layers: ['redvelvet', 'redvelvet'],
      fillings: ['ninho'],
      covering: { type: 'buttercream', color: '#ffb3d1' },
      drip: { on: false, color: '#ffffff' },
      piping: { style: 'conchas', where: 'both', color: '#ffffff' },
      decor: { items: ['flores', 'perolas'], message: 'Te amo' },
    }),
  },
  {
    id: 'limao',
    occasion: 'aniversario',
    name: 'Limão Siciliano',
    tag: 'Leve, cítrico e elegante',
    config: cfg({
      shape: 'round',
      layers: ['limao', 'limao', 'limao'],
      fillings: ['limao', 'coco'],
      covering: { type: 'chantilly', color: '#ffffff' },
      drip: { on: true, color: '#ffd166' },
      piping: { style: 'bolinhas', where: 'top', color: '#ffffff' },
      decor: { items: ['flores', 'perolas'] },
    }),
  },
  {
    id: 'naked',
    occasion: 'casamento',
    name: 'Naked Rústico',
    tag: 'Doce de leite e frutas',
    config: cfg({
      shape: 'round',
      layers: ['baunilha', 'baunilha', 'baunilha'],
      fillings: ['docedeleite', 'ninho'],
      covering: { type: 'naked', color: '#ffffff' },
      drip: { on: true, color: '#b9772c' },
      piping: { style: 'liso', where: 'top', color: '#ffffff' },
      decor: { items: ['frutas', 'flores'] },
    }),
  },
];

/** Ocasiões das inspirações (filtro da faixa de inspirações). */
export const OCCASIONS = [
  { id: 'aniversario', name: 'Aniversário' },
  { id: 'casamento', name: 'Casamento' },
  { id: 'quinze', name: '15 anos' },
  { id: 'bebe', name: 'Chá de bebê' },
  { id: 'infantil', name: 'Infantil' },
  { id: 'namorados', name: 'Namorados' },
  { id: 'natal', name: 'Natal' },
];

// Inspirações que usam os recursos novos: andares, estilos de cobertura, bicos, decorações com arranjo, bases.
PRESETS.push(
  {
    id: 'lambeth',
    occasion: 'quinze',
    name: 'Vintage Rosé',
    tag: 'Guirlandas, conchas e lacinhos',
    config: cfg({
      shape: 'round',
      height: 'alto',
      layers: ['baunilha', 'baunilha', 'baunilha'],
      fillings: ['framboesa', 'ninho'],
      covering: { type: 'buttercream', color: '#ffffff' },
      piping: { style: 'vintage', where: 'both', color: '#f7b7c8' },
      decor: { items: ['cerejas'], opts: { cerejas: { arr: 'coroa' } }, message: '15 anos', messageMode: 'bico', script: 'cursiva', messageColor: '#d96b82' },
    }),
  },
  {
    id: 'tres',
    occasion: 'casamento',
    name: 'Três Andares Clássico',
    tag: 'Branco, pérolas e rosas em cascata',
    config: cfg({
      shape: 'round',
      tiers: 3,
      base: 'prateada',
      layers: ['baunilha', 'baunilha', 'baunilha'],
      fillings: ['ninho', 'framboesa'],
      covering: { type: 'buttercream', color: '#ffffff' },
      piping: { style: 'perolao', where: 'base', color: '#ffffff' },
      decor: { items: ['flores', 'perolas'], opts: { flores: { arr: 'cascata', qty: 'farto', color: '#ffffff' } } },
    }),
  },
  {
    id: 'campo',
    occasion: 'casamento',
    name: 'Semi-naked do Campo',
    tag: 'Rústico, com frutas e flores',
    config: cfg({
      shape: 'round',
      tiers: 2,
      base: 'madeira',
      layers: ['baunilha', 'baunilha', 'baunilha'],
      fillings: ['docedeleite', 'ninho'],
      covering: { type: 'buttercream', color: '#ffffff', style: 'seminaked' },
      piping: { style: 'liso', where: 'top', color: '#ffffff' },
      decor: { items: ['frutas', 'flores'], opts: { frutas: { arr: 'cascata' }, flores: { arr: 'centro', color: '#f39fb2' } } },
    }),
  },
  {
    id: 'lilas',
    occasion: 'quinze',
    name: 'Degradê Lilás',
    tag: 'Dois andares e borboletas',
    config: cfg({
      shape: 'round',
      tiers: 2,
      layers: ['baunilha', 'morango', 'baunilha'],
      fillings: ['ninho', 'framboesa'],
      covering: { type: 'buttercream', color: '#c7a7ff', style: 'ombre', color2: '#ffffff' },
      piping: { style: 'bolinhas', where: 'base', color: '#ffffff' },
      decor: { items: ['borboletas', 'perolas'], opts: { borboletas: { arr: 'cascata', color: '#d9c2ff' } }, topper: { text: '15', color: '#dcae52' } },
    }),
  },
  {
    id: 'nuvem',
    occasion: 'bebe',
    name: 'Chá de Bebê Nuvem',
    tag: 'Aquarela, babado e suspiros',
    config: cfg({
      shape: 'round',
      layers: ['baunilha', 'baunilha', 'baunilha'],
      fillings: ['ninho', 'morango'],
      covering: { type: 'chantilly', color: '#ffffff', style: 'aquarela', color2: '#9bd4ff' },
      piping: { style: 'babado', where: 'top', color: '#ffffff' },
      decor: { items: ['suspiros', 'baloes'], opts: { suspiros: { arr: 'coroa', color: '#ffffff' }, baloes: { color: '#b8dcff' } }, message: 'Bem-vindo', messageMode: 'placa' },
    }),
  },
  {
    id: 'doces',
    occasion: 'infantil',
    name: 'Festa dos Doces',
    tag: 'Listras, pirulitos e marshmallows',
    config: cfg({
      shape: 'round',
      layers: ['baunilha', 'morango', 'baunilha'],
      fillings: ['brigadeiro', 'ninho'],
      covering: { type: 'buttercream', color: '#ffffff', style: 'listras', color2: '#ffb3d1' },
      piping: { style: 'bolinhas', where: 'both', color: '#ffffff' },
      decor: { items: ['pirulitos', 'marshmallows', 'velas'], opts: { marshmallows: { arr: 'espalhado' } }, candleStyle: 'numero', number: '5' },
    }),
  },
  {
    id: 'cerca',
    occasion: 'aniversario',
    name: 'Cerca de Chocolate',
    tag: 'Palitos de wafer e frutas no topo',
    config: cfg({
      shape: 'round',
      layers: ['chocolate', 'chocolate', 'chocolate'],
      fillings: ['brigadeiro', 'morango'],
      covering: { type: 'chocolate', color: '#6b3f22' },
      piping: { style: 'liso', where: 'top', color: '#ffffff' },
      decor: { items: ['wafer', 'frutas', 'lacos'], opts: { frutas: { arr: 'centro', qty: 'farto' }, lacos: { arr: 'frente', color: '#d96b82' } } },
    }),
  },
  {
    id: 'coracao',
    occasion: 'namorados',
    name: 'Coração Vintage',
    tag: 'Para dizer "te amo"',
    config: cfg({
      shape: 'heart',
      height: 'alto',
      layers: ['redvelvet', 'redvelvet', 'redvelvet'],
      fillings: ['ninho', 'framboesa'],
      covering: { type: 'buttercream', color: '#ffb3d1' },
      piping: { style: 'vintage', where: 'both', color: '#ffffff' },
      decor: { items: ['cerejas'], opts: { cerejas: { arr: 'coroa' } }, message: 'Te amo', messageMode: 'bico', script: 'cursiva', messageColor: '#8b1a1a' },
    }),
  },
  {
    id: 'natal',
    occasion: 'natal',
    name: 'Natal Nevado',
    tag: 'Espatulado branco, folhas e frutas vermelhas',
    config: cfg({
      shape: 'round',
      base: 'madeira',
      layers: ['chocolate', 'baunilha', 'chocolate'],
      fillings: ['docedeleite', 'ninho'],
      covering: { type: 'buttercream', color: '#ffffff', style: 'rustico' },
      piping: { style: 'folhas', where: 'top', color: '#2d8b4a' },
      decor: { items: ['cerejas', 'ouro'], opts: { cerejas: { arr: 'centro', qty: 'farto' }, ouro: { arr: 'espalhado' } } },
    }),
  },
  {
    id: 'dourado',
    occasion: 'casamento',
    name: 'Elegância Dourada',
    tag: 'Hexagonal, respingo de ouro e macarons',
    config: cfg({
      shape: 'hex',
      tiers: 2,
      base: 'dourada',
      layers: ['baunilha', 'baunilha', 'baunilha'],
      fillings: ['maracuja', 'ninho'],
      covering: { type: 'buttercream', color: '#ffffff', style: 'respingo' },
      piping: { style: 'corda', where: 'base', color: '#ffffff' },
      decor: { items: ['macarons', 'ouro'], opts: { macarons: { arr: 'meialua', color: '#ffffff' }, ouro: { arr: 'coroa' } }, topper: { text: 'Amor', color: '#dcae52' } },
    }),
  },
  {
    id: 'jardim',
    occasion: 'aniversario',
    name: 'Jardim de Macarons',
    tag: 'Macarons, margaridas e calda branca',
    config: cfg({
      shape: 'round',
      layers: ['limao', 'limao', 'limao'],
      fillings: ['framboesa', 'ninho'],
      covering: { type: 'buttercream', color: '#a8f0c6' },
      drip: { on: true, color: '#ffffff' },
      piping: { style: 'liso', where: 'top', color: '#ffffff' },
      decor: { items: ['macarons', 'margaridas'], opts: { macarons: { arr: 'coroa', color: '#f7b7c8' }, margaridas: { arr: 'espalhado' } } },
    }),
  },
);

export function getPreset(id) {
  return PRESETS.find((p) => p.id === id) || null;
}

/** Bolos do cardápio traduzidos para o personalizador (entrada por ?base=p1…p10). */
const BY_PRODUCT = {
  p1: () => getPreset('belga').config,
  p2: () =>
    cfg({
      layers: ['redvelvet', 'redvelvet', 'redvelvet'],
      fillings: ['ninho', 'ninho'],
      covering: { type: 'chantilly', color: '#ffffff' },
      piping: { style: 'conchas', where: 'both', color: '#ffffff' },
      decor: { items: ['frutas'] },
    }),
  p3: () =>
    cfg({
      layers: ['baunilha', 'baunilha', 'baunilha'],
      fillings: ['morango', 'ninho'],
      covering: { type: 'naked', color: '#ffffff' },
      piping: { style: 'liso', where: 'top', color: '#ffffff' },
      decor: { items: ['frutas'] },
    }),
  p4: () =>
    cfg({
      layers: ['cenoura', 'cenoura'],
      fillings: ['brigadeiro'],
      covering: { type: 'chocolate', color: '#6b3f22' },
      drip: { on: true, color: '#3a1a08' },
      piping: { style: 'liso', where: 'top', color: '#6b3f22' },
      decor: { items: ['granulado'] },
    }),
  p5: () =>
    cfg({
      layers: ['baunilha', 'baunilha'],
      fillings: ['coco'],
      covering: { type: 'chantilly', color: '#ffffff' },
      piping: { style: 'bolinhas', where: 'top', color: '#ffffff' },
      decor: { items: ['frutas'] },
    }),
  p6: () =>
    cfg({
      layers: ['baunilha', 'morango', 'baunilha'],
      fillings: ['ninho', 'morango'],
      covering: { type: 'buttercream', color: '#ffffff' },
      drip: { on: true, color: '#ffb3d1' },
      piping: { style: 'rosetas', where: 'top', color: '#c7a7ff' },
      decor: { items: ['confete', 'topo', 'perolas'] },
    }),
  p7: () =>
    cfg({
      layers: ['limao', 'limao', 'limao'],
      fillings: ['limao', 'limao'],
      covering: { type: 'chantilly', color: '#ffffff' },
      piping: { style: 'estrelas', where: 'top', color: '#ffd166' },
      decor: { items: [] },
    }),
  p8: () =>
    cfg({
      layers: ['chocolate', 'chocolate', 'chocolate'],
      fillings: ['coco', 'coco'],
      covering: { type: 'chocolate', color: '#3a1a08' },
      piping: { style: 'conchas', where: 'top', color: '#ffffff' },
      decor: { items: ['raspas'] },
    }),
  p9: () =>
    cfg({
      layers: ['chocolate', 'chocolate'],
      fillings: ['brigadeiro'],
      covering: { type: 'ganache', color: '#3a1a08' },
      piping: { style: 'liso', where: 'top', color: '#6b3f22' },
      decor: { items: ['frutas'] },
    }),
  p10: () =>
    cfg({
      layers: ['chocolate', 'chocolate', 'chocolate'],
      fillings: ['framboesa', 'ninho'],
      covering: { type: 'chantilly', color: '#ffffff' },
      piping: { style: 'rosetas', where: 'top', color: '#ffffff' },
      decor: { items: ['raspas', 'frutas'] },
    }),
};

/** Configuração parecida com um produto do cardápio; null se não houver correspondência. */
export function presetForProduct(productId) {
  const make = BY_PRODUCT[productId];
  return make ? normalizeConfig(make()) : null;
}

/* ───────── Paletas prontas ─────────
   Recolorem o bolo inteiro em harmonia: cobertura (e a segunda cor do degradê/aquarela/listras), calda,
   bico, as decorações que têm cor e a mensagem. */
export const COLOR_PALETTES = [
  { id: 'pastel', name: 'Pastel', cover: '#f7d3dc', cover2: '#ffffff', drip: '#ffffff', piping: '#ffffff', accents: ['#f7b7c8', '#bfe8c8', '#b8dcff', '#d9c2ff'], text: '#d96b82' },
  { id: 'neutro', name: 'Neutro elegante', cover: '#ffffff', cover2: '#f2e4c7', drip: '#f2e4c7', piping: '#ffffff', accents: ['#ffffff', '#f2e4c7', '#dcae52'], text: '#b9772c' },
  { id: 'chocolate', name: 'Chocolate', cover: '#6b3f22', cover2: '#3a1a08', drip: '#3a1a08', piping: '#f2e4c7', accents: ['#3a1a08', '#f2e4c7', '#b9772c'], text: '#f2e4c7', dark: true },
  { id: 'romantico', name: 'Romântico', cover: '#ffb3d1', cover2: '#d96b82', drip: '#ffffff', piping: '#ffffff', accents: ['#d96b82', '#f7b7c8', '#ffffff'], text: '#8b1a1a' },
  { id: 'lavanda', name: 'Lavanda', cover: '#c7a7ff', cover2: '#ffffff', drip: '#ffffff', piping: '#ffffff', accents: ['#d9c2ff', '#ffffff', '#f7b7c8'], text: '#4a1a6a' },
  { id: 'ceu', name: 'Céu de algodão', cover: '#9bd4ff', cover2: '#ffffff', drip: '#ffffff', piping: '#ffffff', accents: ['#b8dcff', '#ffffff', '#d9c2ff'], text: '#1a4a8b' },
  { id: 'tropical', name: 'Tropical', cover: '#ffd166', cover2: '#ff8c8c', drip: '#ffffff', piping: '#2d8b4a', accents: ['#ff8c8c', '#ffd166', '#a8f0c6'], text: '#2d8b4a' },
  { id: 'menta', name: 'Menta fresca', cover: '#a8f0c6', cover2: '#ffffff', drip: '#ffffff', piping: '#ffffff', accents: ['#ffffff', '#fff2a8', '#f7b7c8'], text: '#2d8b4a' },
  { id: 'gala', name: 'Noite de gala', cover: '#1a4a8b', cover2: '#4a1a6a', drip: '#dcae52', piping: '#ffffff', accents: ['#dcae52', '#ffffff', '#cfd3da'], text: '#dcae52', dark: true },
  { id: 'natal', name: 'Natal', cover: '#ffffff', cover2: '#8b1a1a', drip: '#8b1a1a', piping: '#2d8b4a', accents: ['#8b1a1a', '#2d8b4a', '#dcae52'], text: '#8b1a1a' },
];

const mixHex = (a, b, k) => {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (sh) => Math.round(((pa >> sh) & 255) + (((pb >> sh) & 255) - ((pa >> sh) & 255)) * k);
  return `#${[16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, '0')).join('')}`;
};

/** Aplica uma paleta ao bolo atual, sem mexer em formato, sabores, estilos nem na escolha das decorações. */
export function applyPalette(config, palette) {
  const c = JSON.parse(JSON.stringify(config));
  c.covering.color = palette.cover;
  c.covering.color2 = palette.cover2;
  if (Array.isArray(c.tierCover)) {
    // uma cobertura por andar: do tom principal (embaixo) ao segundo tom (em cima)
    const n = c.tierCover.length;
    c.tierCover = c.tierCover.map((t, i) => ({ ...t, color: mixHex(palette.cover, palette.cover2, n > 1 ? i / (n - 1) : 0), color2: palette.cover2 }));
  }
  c.drip.color = palette.drip;
  c.piping.color = palette.piping;
  c.decor.messageColor = palette.text;
  c.decor.opts = c.decor.opts || {};
  let k = 0;
  c.decor.items.forEach((id) => {
    const d = getDecor(id);
    if (!d?.colors) return;
    // chocolates continuam em tons de chocolate; o resto recebe os tons de destaque da paleta
    if (d.colors === 'choc') return;
    c.decor.opts[id] = { ...(c.decor.opts[id] || {}), color: palette.accents[k++ % palette.accents.length] };
  });
  return normalizeConfig(c);
}

/* ───────── Surpreenda-me ─────────
   Sorteio com bom gosto: parte de "receitas" que confeiteiras usam de verdade (estilo de cobertura + bico +
   decorações que conversam) e de uma paleta pronta; massas e recheios que combinam. Nunca é só aleatório. */
const PAIRINGS = {
  baunilha: ['morango', 'ninho', 'docedeleite', 'maracuja', 'framboesa', 'brigadeiro'],
  chocolate: ['brigadeiro', 'nutella', 'ninho', 'framboesa', 'coco', 'maracuja'],
  redvelvet: ['ninho', 'framboesa', 'morango', 'coco'],
  cenoura: ['brigadeiro', 'docedeleite', 'nutella'],
  limao: ['limao', 'coco', 'framboesa', 'ninho'],
  morango: ['ninho', 'morango', 'brigadeiro', 'coco'],
};

const RECIPES = [
  { types: ['buttercream', 'chantilly'], finish: 'liso', piping: ['rosetas', 'conchas', 'bolinhas', 'perolao'], decor: [['frutas'], ['flores', 'perolas'], ['macarons', 'flores'], ['frutas', 'flores']], drip: 0.55 },
  { types: ['buttercream'], finish: 'ombre', piping: ['bolinhas', 'perolao', 'liso'], decor: [['borboletas'], ['flores'], ['macarons', 'perolas']], drip: 0 },
  { types: ['buttercream', 'chantilly'], finish: 'aquarela', piping: ['babado', 'bolinhas', 'liso'], decor: [['suspiros'], ['margaridas'], ['flores', 'ouro']], drip: 0 },
  { types: ['buttercream'], finish: 'liso', piping: ['vintage'], decor: [['cerejas'], ['lacos', 'perolas'], []], drip: 0 },
  { types: ['buttercream', 'chantilly'], finish: 'rustico', piping: ['liso', 'folhas'], decor: [['frutas', 'flores'], ['peonias'], ['ouro', 'flores']], drip: 0 },
  { types: ['buttercream'], finish: 'seminaked', piping: ['liso'], decor: [['frutas', 'flores'], ['frutas'], ['peonias']], drip: 0.3, light: true },
  { types: ['buttercream'], finish: 'listras', piping: ['bolinhas', 'estrelas'], decor: [['pirulitos', 'marshmallows'], ['confete', 'baloes'], ['suspiros']], drip: 0 },
  { types: ['buttercream', 'mousse'], finish: 'respingo', piping: ['corda', 'perolao', 'liso'], decor: [['macarons', 'ouro'], ['flores', 'ouro'], ['bombons']], drip: 0 },
  { types: ['buttercream'], finish: 'pente', piping: ['ziguezague', 'conchas', 'liso'], decor: [['frutas'], ['margaridas'], ['macarons']], drip: 0 },
  { types: ['ganache', 'chocolate'], finish: 'liso', piping: ['conchas', 'rosetas', 'corda', 'liso'], decor: [['morangos'], ['bombons', 'raspas'], ['brigadeiros'], ['wafer', 'frutas']], drip: 0.6, dark: true },
];

const rnd = (list) => list[Math.floor(Math.random() * list.length)];

function weighted(pairs) {
  const total = pairs.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [value, w] of pairs) {
    r -= w;
    if (r <= 0) return value;
  }
  return pairs[0][0];
}

/**
 * Um bolo-surpresa. Mantém a estrutura que a pessoa já escolheu (tamanho, andares, altura, base e fundo) e
 * evita repetir a cobertura do bolo anterior.
 */
export function randomConfig(current) {
  let recipe = rnd(RECIPES);
  let palette = null;
  for (let i = 0; i < 8; i++) {
    recipe = rnd(RECIPES);
    palette = rnd(COLOR_PALETTES.filter((p) => Boolean(p.dark) === Boolean(recipe.dark) && !(recipe.light && p.id !== 'neutro' && p.id !== 'pastel')));
    if (!current || palette.cover !== current.covering?.color || recipe.finish !== current.covering?.style) break;
  }
  const count = weighted([
    [2, 3],
    [3, 5],
    [4, 1],
  ]);
  const main = recipe.dark ? rnd(['chocolate', 'chocolate', 'baunilha', 'redvelvet']) : rnd(FLAVORS).id;
  const second = Math.random() < 0.3 ? rnd(FLAVORS).id : main;
  const layers = Array.from({ length: count }, (_, i) => (i % 2 ? second : main));
  const fillPool = PAIRINGS[main] || FILLINGS.map((f) => f.id);
  const fillA = rnd(fillPool);
  const fillB = Math.random() < 0.5 ? rnd(fillPool) : fillA;
  const fillings = Array.from({ length: count - 1 }, (_, i) => (i % 2 ? fillB : fillA));
  const type = rnd(recipe.types);
  const style = rnd(recipe.piping);
  const items = [...rnd(recipe.decor)];
  const two = recipe.finish === 'ombre' || recipe.finish === 'aquarela' || recipe.finish === 'listras';
  const base = normalizeConfig({
    shape: weighted([
      ['round', 6],
      ['square', 1.2],
      ['heart', 1.2],
      ['hex', 1.2],
      ['rect', 0.8],
    ]),
    size: current?.size || 'p',
    tiers: current?.tiers || 1,
    height: current?.height || 'padrao',
    base: current?.base || 'boleira',
    backdrop: current?.backdrop,
    layers,
    fillings,
    covering: { type, color: recipe.dark ? (type === 'ganache' ? '#3a1a08' : '#6b3f22') : palette.cover, style: recipe.finish, color2: two && palette.cover2 === palette.cover ? '#ffffff' : palette.cover2 },
    drip: { on: Math.random() < recipe.drip, color: palette.drip },
    piping: { style, where: weighted([['top', 5], ['base', 2], ['both', 3]]), color: palette.piping },
    decor: { items, candles: 3 + Math.floor(Math.random() * 5), message: '' },
    name: '',
  });
  // as cores das decorações vêm da mesma paleta
  const tinted = applyPalette(base, recipe.dark ? { ...palette, cover: base.covering.color, cover2: base.covering.color2 } : palette);
  tinted.covering = base.covering;
  return normalizeConfig(tinted);
}
