// BOLAB — cardápio do personalizador 3D. Para trocar nome, preço ou cor de uma opção, edite aqui.
// Preços em reais, referentes ao tamanho P. Nos tamanhos M e G o bolo (massa, recheio, cobertura,
// acabamento e decorações comestíveis) é multiplicado pelo fator do tamanho; velas, topo de festa
// e plaquinha têm preço fixo.
import { SIZES as CATALOG_SIZES } from './products.js';

/** Preço de partida: o bolo mais simples (P, redondo, 1 camada, cobertura básica) sai por R$ 69. */
export const BASE_PRICE = 59;
/** Cada camada de massa além da primeira. */
export const EXTRA_LAYER_PRICE = 6;
export const MAX_LAYERS = 4;
export const MAX_DECORS = 3;
export const MAX_CANDLES = 9;
export const MESSAGE_MAX = 20;
export const MESSAGE_PRICE = 8;
export const DRIP_PRICE = 6;

/** Tamanhos — os mesmos do cardápio (P, M, G), com o raio usado no 3D (1 unidade = 10 cm). */
export const SIZES = CATALOG_SIZES.map((s) => ({
  ...s,
  radius: { p: 0.75, m: 1, g: 1.25 }[s.id] || 1,
  hint: { p: 'Para um café em família', m: 'O mais pedido para festas', g: 'Para festa grande' }[s.id] || '',
}));

export const SHAPES = [
  { id: 'round', name: 'Redondo', desc: 'O clássico de toda festa', price: 0 },
  { id: 'square', name: 'Quadrado', desc: 'Moderno e fácil de fatiar', price: 5 },
  { id: 'rect', name: 'Retangular', desc: 'Fatias generosas para a turma', price: 15 },
  { id: 'heart', name: 'Coração', desc: 'Para declarar o seu amor', price: 12 },
];

/** Massas. color = cor do seletor; crumb = miolo (visto por dentro); crust = casquinha (bolo naked). */
export const FLAVORS = [
  { id: 'baunilha', name: 'Baunilha', desc: 'Fofinha, com baunilha de verdade', price: 0, color: '#d79a62', crumb: '#f7d894', crust: '#d39a5c' },
  { id: 'chocolate', name: 'Chocolate', desc: 'Cacau 70%, bem molhadinha', price: 8, color: '#4a2c18', crumb: '#63371f', crust: '#3c2111' },
  { id: 'redvelvet', name: 'Red velvet', desc: 'Aveludada, com toque de cacau', price: 12, color: '#8b1a1a', crumb: '#a8222c', crust: '#7c1820' },
  { id: 'cenoura', name: 'Cenoura', desc: 'A receita da vó, bem úmida', price: 5, color: '#e07820', crumb: '#f2a03c', crust: '#c9711e' },
  { id: 'limao', name: 'Limão', desc: 'Cítrica, leve e perfumada', price: 5, color: '#d0dc80', crumb: '#f1ee9c', crust: '#cfc766' },
  { id: 'morango', name: 'Morango', desc: 'Rosada, com fruta de verdade', price: 7, color: '#e87090', crumb: '#f5a6b8', crust: '#dd7391' },
];

/** Recheios (entre as camadas). gloss: 0 = cremoso fosco … 1 = brilhante. */
export const FILLINGS = [
  { id: 'brigadeiro', name: 'Brigadeiro', desc: 'Cremoso, de chocolate ao leite', price: 8, color: '#3a1a08', gloss: 0.75 },
  { id: 'ninho', name: 'Ninho', desc: 'Creme de leite em pó, sucesso absoluto', price: 10, color: '#fff4dc', gloss: 0.3 },
  { id: 'morango', name: 'Morango', desc: 'Geleia artesanal com pedaços', price: 9, color: '#d93060', gloss: 0.9 },
  { id: 'docedeleite', name: 'Doce de leite', desc: 'Argentino, no ponto de colher', price: 8, color: '#c8783a', gloss: 0.7 },
  { id: 'limao', name: 'Limão', desc: 'Mousse azedinha e refrescante', price: 7, color: '#c8dc50', gloss: 0.35 },
  { id: 'maracuja', name: 'Maracujá', desc: 'Mousse com calda da fruta', price: 9, color: '#e8b030', gloss: 0.55 },
  { id: 'nutella', name: 'Nutella', desc: 'Creme de avelã puro', price: 12, color: '#5a2c10', gloss: 0.8 },
  { id: 'coco', name: 'Coco', desc: 'Beijinho cremoso com coco fresco', price: 7, color: '#f4f0e8', gloss: 0.25 },
  { id: 'framboesa', name: 'Framboesa', desc: 'Geleia intensa, levemente ácida', price: 10, color: '#c0204a', gloss: 0.9 },
];

/** Coberturas. defaultColor = cor sugerida ao escolher o tipo (a cliente pode trocar). */
export const COVERINGS = [
  { id: 'buttercream', name: 'Buttercream', desc: 'Manteiga batida, lisinha e firme', price: 12, defaultColor: '#f7d3dc', finish: 'acetinado' },
  { id: 'chantilly', name: 'Chantilly', desc: 'Leve, aerado e bem branquinho', price: 10, defaultColor: '#ffffff', finish: 'fosco' },
  { id: 'ganache', name: 'Ganache', desc: 'Chocolate nobre com brilho intenso', price: 14, defaultColor: '#3a1a08', finish: 'brilhante' },
  { id: 'glace', name: 'Glacê espelhado', desc: 'Liso como espelho, super brilhante', price: 11, defaultColor: '#ffb3d1', finish: 'espelhado' },
  { id: 'chocolate', name: 'Chocolate cremoso', desc: 'Cobertura de brigadeiro espatulada', price: 13, defaultColor: '#6b3f22', finish: 'cremoso' },
  { id: 'mousse', name: 'Mousse', desc: 'Aveludada, textura de nuvem', price: 11, defaultColor: '#f2e4c7', finish: 'aveludado' },
  { id: 'naked', name: 'Naked', desc: 'Massa à mostra com creme no topo', price: 10, defaultColor: '#ffffff', finish: 'rústico' },
];

/** Paleta de cores da cobertura, da calda e do acabamento. */
export const COLORS = [
  { hex: '#ffffff', name: 'Branco neve' },
  { hex: '#f2e4c7', name: 'Creme' },
  { hex: '#f7d3dc', name: 'Rosa chá' },
  { hex: '#ffb3d1', name: 'Rosa bebê' },
  { hex: '#d96b82', name: 'Rosa BOLAB' },
  { hex: '#ff8c8c', name: 'Coral' },
  { hex: '#8b1a1a', name: 'Vermelho' },
  { hex: '#ffd166', name: 'Amarelo manteiga' },
  { hex: '#a8f0c6', name: 'Menta' },
  { hex: '#2d8b4a', name: 'Verde folha' },
  { hex: '#9bd4ff', name: 'Azul céu' },
  { hex: '#1a4a8b', name: 'Azul marinho' },
  { hex: '#c7a7ff', name: 'Lilás' },
  { hex: '#4a1a6a', name: 'Roxo' },
  { hex: '#b9772c', name: 'Caramelo' },
  { hex: '#6b3f22', name: 'Chocolate ao leite' },
  { hex: '#3a1a08', name: 'Chocolate amargo' },
];

/** Cores sugeridas para a calda (as demais continuam disponíveis em "mais cores"). */
export const DRIP_COLORS = ['#3a1a08', '#6b3f22', '#ffffff', '#b9772c', '#ffb3d1', '#d96b82', '#ffd166', '#8b1a1a'];

/** Acabamentos de bico (confeitados na borda). */
export const PIPINGS = [
  { id: 'liso', name: 'Liso', desc: 'Sem bico, só a cobertura', price: 0 },
  { id: 'bolinhas', name: 'Bolinhas', desc: 'Pingos delicados na borda', price: 5 },
  { id: 'conchas', name: 'Conchas', desc: 'Borda clássica de confeitaria', price: 7 },
  { id: 'estrelas', name: 'Estrelas', desc: 'Pitangas feitas uma a uma', price: 8 },
  { id: 'rosetas', name: 'Rosetas', desc: 'Espirais generosas de creme', price: 9 },
  { id: 'folhas', name: 'Folhas', desc: 'Folhinhas em volta do bolo', price: 7 },
];

export const PIPING_PLACES = [
  { id: 'top', name: 'No topo' },
  { id: 'base', name: 'Na base' },
  { id: 'both', name: 'Topo e base' },
];

/** Decorações. scales = acompanha o tamanho do bolo (comestíveis); false = preço fixo. */
export const DECORS = [
  { id: 'frutas', name: 'Frutas frescas', desc: 'Morangos, mirtilos e framboesas', price: 12, scales: true },
  { id: 'flores', name: 'Flores de açúcar', desc: 'Rosas modeladas à mão', price: 10, scales: true },
  { id: 'raspas', name: 'Raspas de chocolate', desc: 'Lascas e cachos de chocolate belga', price: 6, scales: true },
  { id: 'granulado', name: 'Granulado', desc: 'Chocolate belga crocante', price: 5, scales: true },
  { id: 'confete', name: 'Confete colorido', desc: 'Para deixar a festa mais alegre', price: 6, scales: true },
  { id: 'perolas', name: 'Pérolas de açúcar', desc: 'Peroladas e douradas', price: 7, scales: true },
  { id: 'velas', name: 'Velas', desc: 'Você escolhe quantas', price: 8, scales: false },
  { id: 'topo', name: 'Topo de festa', desc: 'Estrelas douradas no palito', price: 8, scales: false },
];

/** Sugestões rápidas de mensagem para a plaquinha. */
export const MESSAGE_IDEAS = ['Parabéns!', 'Feliz aniversário', 'Te amo', 'Felicidades', 'Bem-vindo, bebê'];

const byId = (list) => (id) => list.find((x) => x.id === id) || null;
export const getShape = byId(SHAPES);
export const getSize = byId(SIZES);
export const getFlavor = byId(FLAVORS);
export const getFilling = byId(FILLINGS);
export const getCovering = byId(COVERINGS);
export const getPiping = byId(PIPINGS);
export const getDecor = byId(DECORS);

export function colorName(hex) {
  const h = String(hex || '').toLowerCase();
  return COLORS.find((c) => c.hex === h)?.name || 'Cor personalizada';
}
