// BOLAB — cardápio do personalizador 3D. Para trocar nome, preço ou cor de uma opção, edite aqui.
// Preços em reais, referentes ao tamanho P de 1 andar e altura padrão. O bolo (massa, recheio, cobertura,
// acabamento e decorações comestíveis) é multiplicado pelo fator do tamanho, dos andares e da altura;
// velas, topos, plaquinha, escrita e base têm preço fixo.
import { SIZES as CATALOG_SIZES } from './products.js';

/** Preço de partida: o bolo mais simples (P, redondo, 1 camada, cobertura básica) sai por R$ 69. */
export const BASE_PRICE = 59;
/** Cada camada de massa além da primeira. */
export const EXTRA_LAYER_PRICE = 6;
export const MAX_LAYERS = 4;
/** Quantas decorações dá para combinar (o bolo arruma sozinho quem fica no centro, em volta e na lateral). */
export const MAX_DECORS = 5;
export const MAX_CANDLES = 9;
export const MESSAGE_MAX = 20;
export const MESSAGE_PRICE = 8;
/** Mensagem escrita com bico direto no topo do bolo. */
export const SCRIPT_PRICE = 10;
export const DRIP_PRICE = 6;
export const TOPPER_MAX = 14;
/** Topo personalizado (nome ou idade recortado em acrílico). */
export const TOPPER_PRICE = 18;

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
  { id: 'hex', name: 'Hexagonal', desc: 'Geométrico, de vitrine', price: 10 },
];

/**
 * Andares. O tamanho escolhido (P, M, G) vale para o bolo de 1 andar; com mais andares o de baixo cresce
 * e cada andar de cima tem 5,4 cm a menos de diâmetro. mult = quanto de bolo há a mais (pela área);
 * fee = montagem e sustentação (preço fixo).
 */
export const TIER_OPTIONS = [
  { n: 1, name: '1 andar', mult: 1, fee: 0 },
  { n: 2, name: '2 andares', mult: 2.1, fee: 20 },
  { n: 3, name: '3 andares', mult: 3.3, fee: 40 },
];
/** Raio (em unidades de 10 cm) de cada andar, de baixo para cima. */
export function tierRadii(sizeRadius, tiers) {
  const n = Math.max(1, Math.min(3, tiers || 1));
  const bottom = sizeRadius + (n - 1) * 0.15;
  return Array.from({ length: n }, (_, i) => +(bottom - i * 0.27).toFixed(3));
}

/** Altura de cada andar. k = fator sobre a altura das camadas; mult = fator de preço. */
export const HEIGHTS = [
  { id: 'baixo', name: 'Baixo', desc: 'Mais delicado', k: 0.78, mult: 0.9 },
  { id: 'padrao', name: 'Padrão', desc: 'O de sempre', k: 1, mult: 1 },
  { id: 'alto', name: 'Alto', desc: 'Imponente, de vitrine', k: 1.28, mult: 1.18 },
];

/** Bases onde o bolo é entregue e fotografado. Preço fixo. */
export const BASES = [
  { id: 'boleira', name: 'Boleira', desc: 'Porcelana com filete dourado', price: 0, swatch: '#fffdfb' },
  { id: 'prato', name: 'Prato branco', desc: 'Baixo e discreto', price: 0, swatch: '#f6f3ef' },
  { id: 'madeira', name: 'Tábua de madeira', desc: 'Rústica, de tronco', price: 6, swatch: '#a8733f' },
  { id: 'dourada', name: 'Base dourada', desc: 'Cake board espelhado', price: 8, swatch: '#dcae52' },
  { id: 'prateada', name: 'Base prateada', desc: 'Cake board espelhado', price: 8, swatch: '#cfd3da' },
  { id: 'marmore', name: 'Mármore', desc: 'Placa branca com veios', price: 12, swatch: '#ecebe8' },
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

/** Coberturas. defaultColor = cor sugerida ao escolher o tipo. poured = despejada (só aceita acabamento liso). */
export const COVERINGS = [
  { id: 'buttercream', name: 'Buttercream', desc: 'Manteiga batida, lisinha e firme', price: 12, defaultColor: '#f7d3dc', finish: 'acetinado' },
  { id: 'chantilly', name: 'Chantilly', desc: 'Leve, aerado e bem branquinho', price: 10, defaultColor: '#ffffff', finish: 'fosco' },
  { id: 'ganache', name: 'Ganache', desc: 'Chocolate nobre com brilho intenso', price: 14, defaultColor: '#3a1a08', finish: 'brilhante', poured: true },
  { id: 'glace', name: 'Glacê espelhado', desc: 'Liso como espelho, super brilhante', price: 11, defaultColor: '#ffb3d1', finish: 'espelhado', poured: true },
  { id: 'chocolate', name: 'Chocolate cremoso', desc: 'Cobertura de brigadeiro espatulada', price: 13, defaultColor: '#6b3f22', finish: 'cremoso' },
  { id: 'mousse', name: 'Mousse', desc: 'Aveludada, textura de nuvem', price: 11, defaultColor: '#f2e4c7', finish: 'aveludado' },
  { id: 'naked', name: 'Naked', desc: 'Massa à mostra com creme no topo', price: 10, defaultColor: '#ffffff', finish: 'rústico' },
];

/**
 * Estilos de acabamento da cobertura (a técnica da espátula). two = usa uma segunda cor.
 * Coberturas despejadas (ganache, glacê) só aceitam "liso" e "respingo"; o naked não tem estilo.
 */
export const FINISHES = [
  { id: 'liso', name: 'Liso', desc: 'Alisado na espátula', price: 0 },
  { id: 'rustico', name: 'Espatulado', desc: 'Rústico, com marcas de espátula', price: 4 },
  { id: 'pente', name: 'Riscado', desc: 'Riscos finos feitos no pente', price: 5 },
  { id: 'ombre', name: 'Degradê', desc: 'Duas cores em ombré', price: 8, two: true },
  { id: 'aquarela', name: 'Aquarela', desc: 'Manchas suaves de cor', price: 10, two: true },
  { id: 'listras', name: 'Listras', desc: 'Faixas em duas cores', price: 12, two: true },
  { id: 'seminaked', name: 'Semi-naked', desc: 'A massa aparece sob o creme', price: 0 },
  { id: 'respingo', name: 'Respingo dourado', desc: 'Salpicos de dourado comestível', price: 12 },
];
export function finishAllowed(coveringId, finishId) {
  if (finishId === 'liso') return true;
  if (coveringId === 'naked') return false;
  if (getCovering(coveringId)?.poured) return finishId === 'respingo';
  return true;
}

/** Paleta de cores da cobertura, da calda e do acabamento (qualquer outra cor entra pelo seletor livre). */
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

/** Cores sugeridas para cada família de decoração (a pessoa pode abrir o seletor livre). */
export const DECOR_COLORS = {
  pastel: ['#f7b7c8', '#ffd9a8', '#fff2a8', '#bfe8c8', '#b8dcff', '#d9c2ff', '#ffffff', '#d96b82'],
  flor: ['#e4607f', '#f39fb2', '#ffffff', '#ffd166', '#c7a7ff', '#ff8c8c', '#8b1a1a', '#f2e4c7'],
  choc: ['#3a1a08', '#6b3f22', '#ffffff', '#f7b7c8'],
  metal: ['#dcae52', '#cfd3da', '#e8a5a0', '#1d1a1c'],
};

/**
 * Acabamentos de bico (confeitados na borda). combo = conjunto completo que já decide onde vai cada coisa
 * (não usa "onde aplicar").
 */
export const PIPINGS = [
  { id: 'liso', name: 'Liso', desc: 'Sem bico, só a cobertura', price: 0 },
  { id: 'bolinhas', name: 'Bolinhas', desc: 'Pingos delicados na borda', price: 5 },
  { id: 'perolao', name: 'Pérolas grandes', desc: 'Gotas gordinhas de bico liso', price: 6 },
  { id: 'conchas', name: 'Conchas', desc: 'Borda clássica de confeitaria', price: 7 },
  { id: 'estrelas', name: 'Estrelas', desc: 'Pitangas feitas uma a uma', price: 8 },
  { id: 'rosetas', name: 'Rosetas', desc: 'Espirais generosas de creme', price: 9 },
  { id: 'folhas', name: 'Folhas', desc: 'Guirlanda de folhinhas', price: 7 },
  { id: 'corda', name: 'Corda', desc: 'Cordão torcido contínuo', price: 7 },
  { id: 'ziguezague', name: 'Zigue-zague', desc: 'Vai e vem de bico pitanga', price: 7 },
  { id: 'babado', name: 'Babado', desc: 'Rufo ondulado, bem romântico', price: 9 },
  { id: 'vintage', name: 'Vintage', desc: 'Guirlandas, conchas e lacinhos', price: 24, combo: true },
];

export const PIPING_PLACES = [
  { id: 'top', name: 'No topo' },
  { id: 'base', name: 'Na base' },
  { id: 'both', name: 'Topo e base' },
];

/** Como uma decoração é disposta no bolo. */
export const ARRANGEMENTS = [
  { id: 'auto', name: 'Automático' },
  { id: 'centro', name: 'No centro' },
  { id: 'coroa', name: 'Em coroa' },
  { id: 'meialua', name: 'Meia-lua' },
  { id: 'espalhado', name: 'Espalhado' },
  { id: 'cascata', name: 'Cascata' },
  { id: 'lateral', name: 'Na lateral' },
  { id: 'palito', name: 'No palito' },
  { id: 'frente', name: 'Na frente' },
];

/** Fartura de uma decoração. k = fator de quantidade no 3D; mult = fator de preço. */
export const QUANTITIES = [
  { id: 'pouco', name: 'Pouco', k: 0.6, mult: 0.8 },
  { id: 'medio', name: 'Médio', k: 1, mult: 1 },
  { id: 'farto', name: 'Farto', k: 1.5, mult: 1.35 },
];

export const DECOR_GROUPS = [
  { id: 'frutas', name: 'Frutas e flores' },
  { id: 'doces', name: 'Docinhos' },
  { id: 'brilho', name: 'Confeitos e brilho' },
  { id: 'festa', name: 'Festa' },
];

/**
 * Decorações. scales = acompanha o tamanho do bolo (comestíveis); false = preço fixo.
 * arrs = arranjos possíveis (o primeiro é o padrão) · qty = aceita pouco/médio/farto ·
 * colors = família de cores sugeridas (DECOR_COLORS) · color = cor padrão.
 */
export const DECORS = [
  { id: 'frutas', group: 'frutas', name: 'Frutas frescas', desc: 'Morangos, mirtilos e framboesas', price: 12, scales: true, arrs: ['auto', 'centro', 'coroa', 'meialua', 'cascata'], qty: true },
  { id: 'morangos', group: 'frutas', name: 'Morangos banhados', desc: 'Mergulhados no chocolate', price: 14, scales: true, arrs: ['coroa', 'centro', 'meialua'], qty: true, colors: 'choc', color: '#3a1a08' },
  { id: 'cerejas', group: 'frutas', name: 'Cerejas', desc: 'Com cabinho, bem vermelhas', price: 9, scales: true, arrs: ['coroa', 'centro', 'meialua', 'espalhado'], qty: true },
  { id: 'flores', group: 'frutas', name: 'Rosas de açúcar', desc: 'Modeladas à mão', price: 10, scales: true, arrs: ['auto', 'centro', 'coroa', 'meialua', 'cascata'], qty: true, colors: 'flor', color: '#e4607f' },
  { id: 'margaridas', group: 'frutas', name: 'Margaridas', desc: 'Florzinhas de miolo amarelo', price: 9, scales: true, arrs: ['espalhado', 'coroa', 'meialua', 'cascata'], qty: true, colors: 'flor', color: '#ffffff' },
  { id: 'peonias', group: 'frutas', name: 'Peônias', desc: 'Flores grandes e cheias', price: 14, scales: true, arrs: ['centro', 'meialua', 'cascata'], qty: true, colors: 'flor', color: '#f39fb2' },

  { id: 'macarons', group: 'doces', name: 'Macarons', desc: 'Casquinhas com recheio', price: 16, scales: true, arrs: ['coroa', 'meialua', 'centro', 'cascata'], qty: true, colors: 'pastel', color: '#f7b7c8' },
  { id: 'brigadeiros', group: 'doces', name: 'Brigadeiros', desc: 'Docinhos na forminha', price: 12, scales: true, arrs: ['coroa', 'centro', 'meialua'], qty: true },
  { id: 'bombons', group: 'doces', name: 'Bombons e trufas', desc: 'Chocolates sortidos', price: 14, scales: true, arrs: ['coroa', 'centro', 'meialua', 'espalhado'], qty: true },
  { id: 'suspiros', group: 'doces', name: 'Suspiros', desc: 'Merengues crocantes', price: 8, scales: true, arrs: ['coroa', 'espalhado', 'meialua', 'centro'], qty: true, colors: 'pastel', color: '#ffffff' },
  { id: 'marshmallows', group: 'doces', name: 'Marshmallows', desc: 'Macios e coloridos', price: 7, scales: true, arrs: ['espalhado', 'centro', 'coroa'], qty: true, colors: 'pastel', color: '#f7b7c8' },
  { id: 'biscoitos', group: 'doces', name: 'Biscoito recheado', desc: 'De chocolate com creme', price: 9, scales: true, arrs: ['coroa', 'meialua', 'centro'], qty: true },
  { id: 'wafer', group: 'doces', name: 'Cerca de chocolate', desc: 'Palitos de wafer em volta do bolo', price: 22, scales: true, arrs: ['lateral'] },
  { id: 'pirulitos', group: 'doces', name: 'Pirulitos', desc: 'Espirais coloridas no palito', price: 10, scales: false, arrs: ['palito'], qty: true, colors: 'pastel', color: '#f7b7c8' },

  { id: 'raspas', group: 'brilho', name: 'Raspas de chocolate', desc: 'Lascas e cachos de chocolate belga', price: 6, scales: true, arrs: ['auto', 'centro', 'coroa', 'meialua'], qty: true },
  { id: 'granulado', group: 'brilho', name: 'Granulado', desc: 'Chocolate belga crocante', price: 5, scales: true, arrs: ['espalhado'], qty: true },
  { id: 'confete', group: 'brilho', name: 'Confete colorido', desc: 'Para deixar a festa mais alegre', price: 6, scales: true, arrs: ['espalhado'], qty: true },
  { id: 'perolas', group: 'brilho', name: 'Pérolas de açúcar', desc: 'Peroladas e douradas', price: 7, scales: true, arrs: ['espalhado'], qty: true },
  { id: 'ouro', group: 'brilho', name: 'Folha de ouro', desc: 'Lâminas de ouro comestível', price: 15, scales: true, arrs: ['espalhado', 'coroa', 'cascata'], qty: true },

  { id: 'velas', group: 'festa', name: 'Velas', desc: 'Clássicas, de número ou faísca', price: 8, scales: false, arrs: ['auto'] },
  { id: 'topo', group: 'festa', name: 'Topo de estrelas', desc: 'Estrelas douradas no palito', price: 8, scales: false, arrs: ['palito'] },
  { id: 'baloes', group: 'festa', name: 'Balões no palito', desc: 'Mini balões coloridos', price: 12, scales: false, arrs: ['palito'], qty: true, colors: 'pastel', color: '#d96b82' },
  { id: 'lacos', group: 'festa', name: 'Laço', desc: 'Laço de açúcar na frente do bolo', price: 9, scales: false, arrs: ['frente', 'centro'], colors: 'pastel', color: '#d96b82' },
  { id: 'coracoes', group: 'festa', name: 'Corações', desc: 'De açúcar, espalhados ou no palito', price: 8, scales: true, arrs: ['espalhado', 'palito', 'coroa'], qty: true, colors: 'pastel', color: '#d96b82' },
  { id: 'borboletas', group: 'festa', name: 'Borboletas', desc: 'Pousadas no bolo', price: 10, scales: true, arrs: ['cascata', 'espalhado', 'coroa'], qty: true, colors: 'pastel', color: '#f7b7c8' },
];

/** Estilos de vela. */
export const CANDLE_STYLES = [
  { id: 'classica', name: 'Clássicas', desc: 'Listradas, você escolhe quantas', price: 0 },
  { id: 'numero', name: 'De número', desc: 'A idade em velas douradas', price: 6 },
  { id: 'faisca', name: 'Faísca', desc: 'Vela vulcão que solta estrelinhas', price: 9 },
];

/** Letra da mensagem escrita com bico no topo. */
export const SCRIPTS = [
  { id: 'cursiva', name: 'Cursiva' },
  { id: 'bastao', name: 'Bastão' },
];

/** Acabamentos do topo personalizado (acrílico recortado). */
export const TOPPER_COLORS = [
  { hex: '#dcae52', name: 'Dourado' },
  { hex: '#cfd3da', name: 'Prateado' },
  { hex: '#1d1a1c', name: 'Preto' },
  { hex: '#e8a5a0', name: 'Rosé' },
];

/** Sugestões rápidas de mensagem para a plaquinha. */
export const MESSAGE_IDEAS = ['Parabéns!', 'Feliz aniversário', 'Te amo', 'Felicidades', 'Bem-vindo, bebê'];

const byId = (list) => (id) => list.find((x) => x.id === id) || null;
export const getShape = byId(SHAPES);
export const getSize = byId(SIZES);
export const getFlavor = byId(FLAVORS);
export const getFilling = byId(FILLINGS);
export const getCovering = byId(COVERINGS);
export const getFinish = byId(FINISHES);
export const getPiping = byId(PIPINGS);
export const getDecor = byId(DECORS);
export const getBase = byId(BASES);
export const getHeight = byId(HEIGHTS);
export const getQuantity = byId(QUANTITIES);
export const getArrangement = byId(ARRANGEMENTS);
export const getCandleStyle = byId(CANDLE_STYLES);
export const getTierOption = (n) => TIER_OPTIONS.find((t) => t.n === n) || TIER_OPTIONS[0];

export function colorName(hex) {
  const h = String(hex || '').toLowerCase();
  return COLORS.find((c) => c.hex === h)?.name || TOPPER_COLORS.find((c) => c.hex === h)?.name || 'Cor personalizada';
}
