// BOLAB — pontos de partida do personalizador: inspirações, bolos do cardápio e "Surpreenda-me".
import { FLAVORS, FILLINGS } from '../data/customizer.js';
import { normalizeConfig } from './pricing.js';

const cfg = (c) => normalizeConfig({ decor: { items: [] }, ...c });

/** Inspirações: combinações completas e equilibradas, para ninguém começar do zero. */
export const PRESETS = [
  {
    id: 'morango',
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

/* ───────── Surpreenda-me ─────────
   Sorteio com bom gosto: massas e recheios que combinam, paletas harmônicas, decoração na medida. */
const PAIRINGS = {
  baunilha: ['morango', 'ninho', 'docedeleite', 'maracuja', 'framboesa', 'brigadeiro'],
  chocolate: ['brigadeiro', 'nutella', 'ninho', 'framboesa', 'coco', 'maracuja'],
  redvelvet: ['ninho', 'framboesa', 'morango', 'coco'],
  cenoura: ['brigadeiro', 'docedeleite', 'nutella'],
  limao: ['limao', 'coco', 'framboesa', 'ninho'],
  morango: ['ninho', 'morango', 'brigadeiro', 'coco'],
};

const PALETTES = [
  { covering: { type: 'buttercream', color: '#f7d3dc' }, drip: { on: true, color: '#ffffff' }, piping: { color: '#ffffff' }, decor: ['frutas', 'flores', 'perolas'] },
  { covering: { type: 'buttercream', color: '#ffffff' }, drip: { on: true, color: '#d96b82' }, piping: { color: '#ffb3d1' }, decor: ['confete', 'velas', 'frutas', 'topo'] },
  { covering: { type: 'ganache', color: '#3a1a08' }, drip: { on: false, color: '#6b3f22' }, piping: { color: '#6b3f22' }, decor: ['raspas', 'frutas', 'perolas'] },
  { covering: { type: 'chantilly', color: '#ffffff' }, drip: { on: true, color: '#3a1a08' }, piping: { color: '#ffffff' }, decor: ['frutas', 'raspas', 'granulado'] },
  { covering: { type: 'glace', color: '#ffb3d1' }, drip: { on: false, color: '#ffffff' }, piping: { color: '#ffffff' }, decor: ['perolas', 'flores', 'frutas'] },
  { covering: { type: 'mousse', color: '#c7a7ff' }, drip: { on: true, color: '#ffffff' }, piping: { color: '#ffffff' }, decor: ['perolas', 'confete', 'flores'] },
  { covering: { type: 'buttercream', color: '#a8f0c6' }, drip: { on: true, color: '#ffffff' }, piping: { color: '#ffffff' }, decor: ['flores', 'perolas', 'frutas'] },
  { covering: { type: 'chocolate', color: '#6b3f22' }, drip: { on: true, color: '#3a1a08' }, piping: { color: '#f2e4c7' }, decor: ['granulado', 'raspas', 'frutas'] },
  { covering: { type: 'naked', color: '#ffffff' }, drip: { on: true, color: '#b9772c' }, piping: { color: '#ffffff' }, decor: ['frutas', 'flores'] },
  { covering: { type: 'buttercream', color: '#9bd4ff' }, drip: { on: true, color: '#ffffff' }, piping: { color: '#ffffff' }, decor: ['confete', 'velas', 'perolas', 'topo'] },
  { covering: { type: 'glace', color: '#ffffff' }, drip: { on: true, color: '#b9772c' }, piping: { color: '#f2e4c7' }, decor: ['flores', 'perolas', 'frutas'] },
  { covering: { type: 'buttercream', color: '#ffd166' }, drip: { on: true, color: '#ffffff' }, piping: { color: '#ffffff' }, decor: ['flores', 'confete', 'velas'] },
];

const rnd = (list) => list[Math.floor(Math.random() * list.length)];

function weighted(pairs) {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [value, w] of pairs) {
    r -= w;
    if (r <= 0) return value;
  }
  return pairs[0][0];
}

/**
 * Um bolo sorteado. Mantém o tamanho atual (quem escolheu M para a festa continua com M)
 * e evita repetir a mesma cobertura do bolo anterior.
 */
export function randomConfig(current) {
  let palette = rnd(PALETTES);
  for (let i = 0; i < 6 && current && palette.covering.type === current.covering?.type && palette.covering.color === current.covering?.color; i++) palette = rnd(PALETTES);

  const count = weighted([
    [2, 3],
    [3, 5],
    [4, 1],
  ]);
  const main = rnd(FLAVORS).id;
  const second = Math.random() < 0.3 ? rnd(FLAVORS).id : main;
  const layers = Array.from({ length: count }, (_, i) => (i % 2 ? second : main));
  const fillPool = PAIRINGS[main] || FILLINGS.map((f) => f.id);
  const fillA = rnd(fillPool);
  const fillB = Math.random() < 0.5 ? rnd(fillPool) : fillA;
  const fillings = Array.from({ length: count - 1 }, (_, i) => (i % 2 ? fillB : fillA));

  const naked = palette.covering.type === 'naked';
  const style = naked ? 'liso' : weighted([
    ['liso', 2],
    ['bolinhas', 2],
    ['conchas', 2],
    ['estrelas', 2],
    ['rosetas', 3],
    ['folhas', 1],
  ]);
  const where = weighted([
    ['top', 5],
    ['base', 2],
    ['both', 3],
  ]);

  const pool = [...palette.decor];
  const decorCount = weighted([
    [1, 4],
    [2, 5],
    [3, 1],
  ]);
  const items = [];
  while (items.length < decorCount && pool.length) items.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);

  return normalizeConfig({
    shape: weighted([
      ['round', 6],
      ['square', 1.5],
      ['heart', 1.5],
      ['rect', 1],
    ]),
    size: current?.size || 'p',
    layers,
    fillings,
    covering: { ...palette.covering },
    drip: { ...palette.drip, on: palette.drip.on && Math.random() < 0.75 },
    piping: { style, where, color: palette.piping.color },
    decor: { items, candles: 3 + Math.floor(Math.random() * 5), message: '' },
    name: '',
  });
}
