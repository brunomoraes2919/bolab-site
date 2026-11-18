// BOLAB — cardápio do personalizador 3D. Para trocar nome, preço ou cor de uma opção, edite aqui.
// Preços em reais, referentes ao tamanho P de 1 andar e altura padrão. O bolo (massa, recheio, cobertura,
// acabamento e decorações comestíveis) é multiplicado pelo fator do tamanho, dos andares e da altura;
// velas, topos, plaquinha, escrita e base têm preço fixo.
//
// CADA OPÇÃO pode ter, além de nome, descrição e preço:
//   craft    uma linha de como é feita (vai para a ficha de produção do confeiteiro)
//   prep     horas a mais de preparo que ela pede (soma-se ao prazo do bolo; vale a maior)
//   tags     vocabulário fixo (a assistente Bô lê): sabores e recheios usam FLAVOR_TAGS; coberturas, estilos,
//            formatos e bases usam LOOK_TAGS
//   popular  true nos mais pedidos (aparecem primeiro, em "Mais pedidos")
//   active   false tira a opção da loja SEM quebrar os bolos antigos que já a usam (carrinho, pedidos, favoritos):
//            ela some das listas, mas continua sendo desenhada e cobrada onde já estava.
import { SIZES as CATALOG_SIZES } from './products.js';

export const FLAVOR_TAGS = ['chocolate', 'frutado', 'citrico', 'cremoso', 'caramelo', 'castanhas', 'coco', 'cafe', 'especiarias', 'leve', 'intenso', 'doce', 'azedinho', 'crocante', 'classico', 'infantil', 'adulto'];
export const LOOK_TAGS = ['firme', 'delicado', 'brilhante', 'fosco', 'rustico', 'elegante', 'moderno', 'vintage', 'divertido'];

/** Só o que está à venda (active !== false). `keep` = id que continua aparecendo mesmo desligado (o já escolhido). */
export const activeOf = (list, keep = null) => list.filter((x) => x.active !== false || x.id === keep || (Array.isArray(keep) && keep.includes(x.id)));
const finder = (list) => (id) => list.find((x) => x.id === id) || null;

/** Preço de partida: o bolo mais simples (P, redondo, 1 camada, cobertura básica) sai por R$ 69. */
export const BASE_PRICE = 59;
/** Cada camada de massa além da primeira. */
export const EXTRA_LAYER_PRICE = 6;
export const MAX_LAYERS = 4;
export const DRIP_PRICE = 6;
/** Calda dourada ou metálica (pó comestível pincelado sobre a calda já firme). */
export const DRIP_METAL_PRICE = 6;
/** Chá revelação: recheio tingido em segredo (preço fixo). */
export const REVEAL_PRICE = 12;

/**
 * Tamanhos. P, M e G são os mesmos do cardápio; o Bentô e o GG existem só no personalizador.
 * radius = raio usado no 3D (1 unidade = 10 cm).
 */
export const SIZES = [
  {
    id: 'bento',
    label: 'Bentô',
    diameter: '10 cm',
    serves: '1 a 2 fatias',
    mult: 0.55,
    radius: 0.5,
    hint: 'Mini bolo para presentear, na caixinha',
    popular: true,
    tags: ['divertido', 'moderno', 'delicado'],
    craft: 'Bolo de 10 cm, até 3 camadas de massa; na caixinha vai com papel-manteiga e talher (até 2 camadas, para a tampa fechar).',
  },
  ...CATALOG_SIZES.map((s) => ({
    ...s,
    radius: { p: 0.75, m: 1, g: 1.25 }[s.id] || 1,
    hint: { p: 'Para um café em família', m: 'O mais pedido para festas', g: 'Para festa grande' }[s.id] || '',
    popular: s.id === 'm',
    tags: { p: ['delicado'], m: ['elegante', 'vintage'], g: ['elegante'] }[s.id] || [],
    craft: { p: 'Fôrma de 15 cm.', m: 'Fôrma de 20 cm.', g: 'Fôrma de 25 cm; canudos de sustentação no centro.' }[s.id] || '',
  })),
  {
    id: 'gg',
    label: 'GG',
    diameter: '30 cm',
    serves: '35 a 45 fatias',
    mult: 2.75,
    radius: 1.5,
    hint: 'Para casamento e festa de empresa',
    prep: 24,
    tags: ['elegante'],
    craft: 'Fôrma de 30 cm; massa assada em duas levas, base reforçada de 35 cm e canudos de sustentação.',
  },
];

export const SHAPES = [
  { id: 'round', name: 'Redondo', desc: 'O clássico de toda festa', price: 0, popular: true, tags: ['vintage', 'elegante'], craft: 'Fôrma redonda de aro removível.' },
  { id: 'square', name: 'Quadrado', desc: 'Moderno e fácil de fatiar', price: 5, tags: ['moderno'], craft: 'Fôrma quadrada; quinas acertadas na espátula de ângulo.' },
  { id: 'rect', name: 'Retangular', desc: 'Fatias generosas para a turma', price: 15, popular: true, tags: ['moderno', 'divertido'], craft: 'Assadeira retangular; cortar em fatias de 5 × 5 cm.' },
  { id: 'heart', name: 'Coração', desc: 'Para declarar o seu amor', price: 12, tags: ['delicado', 'vintage'], craft: 'Fôrma de coração (ou redondo + quadrado recortados e unidos com creme).' },
  { id: 'hex', name: 'Hexagonal', desc: 'Geométrico, de vitrine', price: 10, tags: ['moderno', 'elegante'], craft: 'Fôrma hexagonal; quinas vivas pedem cobertura firme.' },
  { id: 'oval', name: 'Oval', desc: 'Elegante, de mesa posta', price: 8, tags: ['elegante', 'vintage'], craft: 'Fôrma oval; alisar com espátula flexível acompanhando a curva.' },
  { id: 'flor', name: 'Flor', desc: 'Seis pétalas, um charme', price: 12, tags: ['delicado', 'divertido', 'vintage'], craft: 'Fôrma de pétalas (6 gomos); cobertura puxada de baixo para cima em cada gomo.' },
  {
    id: 'vulcao',
    name: 'Vulcão',
    desc: 'Bolo de furo com a cobertura transbordando',
    price: 6,
    popular: true,
    tags: ['rustico', 'divertido'],
    craft: 'Fôrma de furo central untada e enfarinhada; desenformar morno e despejar a cobertura cremosa no furo até transbordar.',
  },
];
/** O vulcão é um bolo à parte: uma massa só, sem recheio nem andares, e a "cobertura" é a calda cremosa do furo. */
export const isVolcano = (config) => config?.shape === 'vulcao';

/**
 * Andares. O tamanho escolhido (P, M, G) vale para o bolo de 1 andar; com mais andares o de baixo cresce
 * e cada andar de cima tem 5,4 cm a menos de diâmetro. mult = quanto de bolo há a mais (pela área);
 * fee = montagem e sustentação (preço fixo).
 */
export const TIER_OPTIONS = [
  { n: 1, name: '1 andar', mult: 1, fee: 0 },
  { n: 2, name: '2 andares', mult: 2.1, fee: 20, prep: 24, craft: 'Cada andar sobre disco próprio, com canudos de sustentação no andar de baixo.' },
  { n: 3, name: '3 andares', mult: 3.3, fee: 40, prep: 48, craft: 'Canudos em cada andar e pino central; montar no local quando passar de 35 cm de altura.' },
];
/** Raio (em unidades de 10 cm) de cada andar, de baixo para cima. */
export function tierRadii(sizeRadius, tiers) {
  const n = Math.max(1, Math.min(3, tiers || 1));
  const bottom = sizeRadius + (n - 1) * 0.15;
  return Array.from({ length: n }, (_, i) => +(bottom - i * 0.27).toFixed(3));
}

/**
 * Anatomia de um andar, como nos bolos de confeitaria: camadas FINAS de massa (uns 2 cm) alternadas com
 * recheio quase da mesma espessura. A altura do bolo vem de quantas camadas ele tem — a massa nunca é "esticada".
 * (Bolo de 1 camada é o bolo simples, sem recheio: uma massa só, mais alta.)
 */
export const LAYER_CM = 1.9; // espessura de cada camada de massa
export const FILLING_CM = 1.55; // espessura de cada recheio
export const SINGLE_CM = 5; // a massa do bolo simples (1 camada, sem recheio)
export const VOLCANO_CM = 8; // a massa do bolo vulcão (fôrma de furo)

/** Altura de um andar (cm), sem a cobertura do topo, conforme o número de camadas de massa. */
export function layersHeightCm(n) {
  return n <= 1 ? SINGLE_CM : +(n * LAYER_CM + (n - 1) * FILLING_CM).toFixed(2);
}

/** Altura = atalho para o número de camadas de massa (em cada andar). serves = quanto o rendimento acompanha. */
export const HEIGHTS = [
  { id: 'baixo', name: 'Baixo', desc: '2 massas e 1 recheio · uns 6 cm', layers: 2, serves: 0.8 },
  { id: 'padrao', name: 'Padrão', desc: '3 massas e 2 recheios · uns 9 cm', layers: 3, serves: 1 },
  { id: 'alto', name: 'Alto', desc: '4 massas e 3 recheios · uns 13 cm', layers: 4, serves: 1.25 },
];
/** A altura que corresponde a um número de camadas (1 camada = bolo simples, conta como baixo). */
export const heightIdOf = (layers) => (layers <= 2 ? 'baixo' : layers === 3 ? 'padrao' : 'alto');

/** Bases onde o bolo é entregue e fotografado. Preço fixo. only = só aparece para esse tamanho. */
export const BASES = [
  { id: 'boleira', name: 'Boleira', desc: 'Porcelana com filete dourado', price: 0, swatch: '#fffdfb', popular: true, tags: ['vintage', 'elegante'], craft: 'Boleira de porcelana da casa (devolução em 7 dias) ou prato descartável rígido.' },
  { id: 'prato', name: 'Prato branco', desc: 'Baixo e discreto', price: 0, swatch: '#f6f3ef', tags: ['moderno'], craft: 'Prato raso de porcelana.' },
  { id: 'madeira', name: 'Tábua de madeira', desc: 'Rústica, de tronco', price: 6, swatch: '#a8733f', tags: ['rustico'], craft: 'Fatia de tronco envernizada; disco de papel-manteiga sob o bolo.' },
  { id: 'tabua', name: 'Tábua retangular', desc: 'De servir, com alça', price: 9, swatch: '#b98250', tags: ['rustico', 'moderno'], craft: 'Tábua de servir de madeira; disco de papel-manteiga sob o bolo.' },
  { id: 'dourada', name: 'Base dourada', desc: 'Cake board espelhado', price: 8, swatch: '#dcae52', tags: ['elegante', 'brilhante'], craft: 'Cake board dourado de 12 mm, 4 cm maior que o bolo.' },
  { id: 'prateada', name: 'Base prateada', desc: 'Cake board espelhado', price: 8, swatch: '#cfd3da', tags: ['elegante', 'brilhante'], craft: 'Cake board prateado de 12 mm, 4 cm maior que o bolo.' },
  { id: 'preta', name: 'Base preta', desc: 'Cake board fosco, moderno', price: 8, swatch: '#1d1a1c', tags: ['moderno', 'fosco'], craft: 'Cake board preto fosco de 12 mm, 4 cm maior que o bolo.' },
  { id: 'marmore', name: 'Mármore', desc: 'Placa branca com veios', price: 12, swatch: '#ecebe8', tags: ['elegante', 'moderno'], craft: 'Placa de mármore da casa (devolução em 7 dias).' },
  { id: 'vidro', name: 'Boleira de vidro', desc: 'Transparente, com pé', price: 6, swatch: '#dcecef', tags: ['elegante', 'delicado', 'brilhante'], craft: 'Boleira de vidro com pé (devolução em 7 dias); disco fino sob o bolo.' },
  { id: 'caixa', name: 'Caixinha do bentô', desc: 'Com papel-manteiga e talher', price: 5, swatch: '#cfae7c', only: 'bento', tags: ['divertido', 'moderno'], craft: 'Embalagem kraft com tampa, forrada de papel-manteiga; talher de madeira preso por fora.' },
];

/** Grupos das massas (abas do painel). */
export const FLAVOR_GROUPS = [
  { id: 'classicas', name: 'Clássicas' },
  { id: 'frutas', name: 'Frutas' },
  { id: 'especiais', name: 'Castanhas e especiarias' },
];

/**
 * Massas. color = cor do seletor; crumb = miolo (visto por dentro); crust = casquinha (bolo naked).
 * look = o desenho do miolo no corte, quando ele não é liso:
 *   swirl  { color, amount, kind? }  uma segunda massa em manchas (mesclada) ou, com kind: 'veio', em fitas finas (canela)
 *   specks [{ color | colors, n, size: [mín, máx] (mm), kind: 'dot' | 'rod' | 'chunk' | 'fiber' }]  pedacinhos na massa
 */
export const FLAVORS = [
  { id: 'baunilha', group: 'classicas', name: 'Baunilha', desc: 'Fofinha, com baunilha de verdade', price: 0, color: '#d79a62', crumb: '#f7d894', crust: '#d39a5c', popular: true, tags: ['classico', 'leve', 'doce'], craft: 'Pão de ló amanteigado com baunilha em fava; 170 °C, fôrma forrada.' },
  { id: 'chocolate', group: 'classicas', name: 'Chocolate', desc: 'Cacau 70%, bem molhadinha', price: 8, color: '#4a2c18', crumb: '#4a2a19', crust: '#5a3320', popular: true, tags: ['chocolate', 'intenso', 'classico'], craft: 'Massa de cacau 70% com café coado para realçar; bem úmida.' },
  { id: 'cenoura', group: 'classicas', name: 'Cenoura', desc: 'A receita da vó, bem úmida', price: 5, color: '#e07820', crumb: '#f2a03c', crust: '#c9711e', popular: true, tags: ['classico', 'doce', 'infantil'], craft: 'Cenoura crua batida com óleo e ovos; massa de liquidificador.' },
  { id: 'redvelvet', group: 'classicas', name: 'Red velvet', desc: 'Aveludada, com toque de cacau', price: 12, color: '#8b1a1a', crumb: '#a8222c', crust: '#7c1820', tags: ['chocolate', 'leve', 'adulto'], craft: 'Buttermilk, cacau e corante vermelho em gel; não assar demais para não escurecer.' },
  {
    id: 'mesclada',
    group: 'classicas',
    name: 'Mesclada',
    desc: 'Baunilha e chocolate em mármore',
    price: 6,
    color: '#d79a62',
    color2: '#4a2c18',
    crumb: '#f7d894',
    crust: '#b9814a',
    look: { swirl: { color: '#5c3622', amount: 0.42 } },
    popular: true,
    tags: ['chocolate', 'classico', 'infantil'],
    craft: 'Duas massas (baunilha e chocolate) alternadas às colheradas e riscadas com palito.',
  },
  {
    id: 'formigueiro',
    group: 'classicas',
    name: 'Formigueiro',
    desc: 'Baunilha salpicada de granulado',
    price: 6,
    color: '#e3b877',
    crumb: '#f8dc9c',
    crust: '#d39a5c',
    look: { specks: [{ color: '#3b2012', n: 190, size: [1.3, 3], kind: 'rod', thick: 0.85 }] },
    popular: true,
    tags: ['chocolate', 'classico', 'infantil'],
    craft: 'Massa branca com granulado de chocolate misturado no fim, para não derreter.',
  },
  {
    id: 'funfetti',
    group: 'classicas',
    name: 'Confete',
    desc: 'Baunilha com confeitos coloridos por dentro',
    price: 7,
    color: '#f0d49a',
    crumb: '#fae3a8',
    crust: '#d9a868',
    look: { specks: [{ colors: ['#e8437a', '#3fa7e0', '#f5c211', '#3fbf6f', '#f07a2a', '#8a5fd6'], n: 150, size: [1.8, 3.2], kind: 'dot' }] },
    popular: true,
    tags: ['infantil', 'doce', 'classico'],
    craft: 'Massa branca com confeitos coloridos resistentes ao forno, misturados por último.',
  },

  { id: 'limao', group: 'frutas', name: 'Limão', desc: 'Cítrica, leve e perfumada', price: 5, color: '#d0dc80', crumb: '#f1ee9c', crust: '#cfc766', tags: ['citrico', 'leve', 'azedinho'], craft: 'Suco e raspas de limão-taiti; iogurte na massa.' },
  { id: 'morango', group: 'frutas', name: 'Morango', desc: 'Rosada, com fruta de verdade', price: 7, color: '#e87090', crumb: '#f5a6b8', crust: '#dd7391', tags: ['frutado', 'doce', 'infantil'], craft: 'Purê de morango reduzido na massa; um toque de corante natural de beterraba.' },
  {
    id: 'laranja',
    group: 'frutas',
    name: 'Laranja',
    desc: 'Suco e raspas de laranja-pera',
    price: 5,
    color: '#f0a23c',
    crumb: '#f9c768',
    crust: '#cf8a32',
    look: { specks: [{ color: '#e56f14', n: 130, size: [1.2, 2.6], kind: 'fiber' }] },
    tags: ['citrico', 'frutado', 'leve', 'classico'],
    craft: 'Suco e raspas de laranja-pera; massa de liquidificador, bem fofa.',
  },
  {
    id: 'maracuja',
    group: 'frutas',
    name: 'Maracujá',
    desc: 'Azedinha, com as sementes da fruta',
    price: 8,
    color: '#f2c230',
    crumb: '#f8d862',
    crust: '#d6a12c',
    look: { specks: [{ color: '#2a1a10', n: 46, size: [1.7, 2.5], kind: 'dot' }] },
    tags: ['frutado', 'azedinho', 'citrico'],
    craft: 'Polpa de maracujá coada, com uma colher das sementes devolvida à massa.',
  },
  {
    id: 'banana',
    group: 'frutas',
    name: 'Banana com canela',
    desc: 'Banana madura e canela, cheirosa',
    price: 7,
    color: '#cfa35c',
    crumb: '#e4c07c',
    crust: '#b4863e',
    look: { specks: [{ color: '#5a391c', n: 90, size: [1.2, 2.6], kind: 'fiber' }, { color: '#8a5a2c', n: 220, size: [0.4, 0.9], kind: 'dot' }] },
    tags: ['frutado', 'especiarias', 'doce'],
    craft: 'Banana-nanica bem madura amassada, canela em pó e açúcar mascavo.',
  },
  {
    id: 'coco',
    group: 'frutas',
    name: 'Coco',
    desc: 'Branquinha, com coco fresco ralado',
    price: 6,
    color: '#f3e7cc',
    crumb: '#f6e6c2',
    crust: '#dcb37a',
    look: { specks: [{ color: '#fffdf6', n: 300, size: [1.6, 3.4], kind: 'fiber' }] },
    tags: ['coco', 'leve', 'doce'],
    craft: 'Massa branca com leite de coco e coco fresco ralado grosso.',
  },

  {
    id: 'nozes',
    group: 'especiais',
    name: 'Nozes',
    desc: 'Amanteigada, com nozes picadas',
    price: 12,
    color: '#b98a5e',
    crumb: '#dcbc90',
    crust: '#a87648',
    look: { specks: [{ colors: ['#7a5230', '#94683e', '#6a4424', '#a87a4c'], n: 60, size: [2.2, 4.6], kind: 'chunk' }] },
    tags: ['castanhas', 'crocante', 'adulto'],
    craft: 'Nozes tostadas e picadas grosseiramente, passadas na farinha para não afundar.',
  },
  {
    id: 'amendoas',
    group: 'especiais',
    name: 'Amêndoas',
    desc: 'Farinha de amêndoas e lâminas tostadas',
    price: 14,
    color: '#e3c9a0',
    crumb: '#f2dfb8',
    crust: '#c79c62',
    look: { specks: [{ colors: ['#fff6e2', '#fbecd0'], n: 44, size: [3.4, 6], kind: 'rod', thick: 0.7 }, { color: '#a87a48', n: 70, size: [0.8, 1.6], kind: 'dot' }] },
    tags: ['castanhas', 'leve', 'adulto'],
    craft: 'Metade da farinha é de amêndoas; lâminas tostadas misturadas à massa.',
  },
  {
    id: 'pacoca',
    group: 'especiais',
    name: 'Paçoca',
    desc: 'Amendoim torrado, gosto de festa junina',
    price: 9,
    color: '#cfa46a',
    crumb: '#e3c08a',
    crust: '#b98a50',
    look: { specks: [{ colors: ['#a87840', '#c49654'], n: 120, size: [1.4, 3], kind: 'chunk' }] },
    tags: ['castanhas', 'doce', 'classico'],
    craft: 'Paçoca esfarelada e amendoim torrado moído grosso na massa.',
  },
  {
    id: 'churros',
    group: 'especiais',
    name: 'Churros',
    desc: 'Massa de canela com açúcar',
    price: 8,
    color: '#c98e4f',
    crumb: '#ecc88e',
    crust: '#b0763c',
    look: { swirl: { color: '#9a5622', amount: 0.36, kind: 'veio' }, specks: [{ color: '#8a4f20', n: 200, size: [0.4, 0.9], kind: 'dot' }] },
    tags: ['especiarias', 'caramelo', 'doce'],
    craft: 'Açúcar e canela polvilhados entre colheradas de massa, formando veios.',
  },
  {
    id: 'cafe',
    group: 'especiais',
    name: 'Café',
    desc: 'Café coado forte, aroma de padaria',
    price: 8,
    color: '#8a5a3a',
    crumb: '#b88a64',
    crust: '#7d4f30',
    look: { specks: [{ color: '#4a2c18', n: 300, size: [0.4, 1], kind: 'dot' }] },
    tags: ['cafe', 'intenso', 'adulto'],
    craft: 'Café coado bem forte no lugar do leite e uma colher de café solúvel.',
  },
  {
    id: 'chocolatebranco',
    group: 'especiais',
    name: 'Chocolate branco',
    desc: 'Amanteigada, com pedaços que derretem',
    price: 12,
    color: '#f1e2c0',
    crumb: '#f6e6c0',
    crust: '#d9b077',
    look: { specks: [{ colors: ['#fffaec', '#fff3d6'], n: 46, size: [2.6, 4.8], kind: 'chunk' }] },
    tags: ['chocolate', 'doce', 'cremoso'],
    craft: 'Chocolate branco derretido na massa e picado grosso por cima antes de assar.',
  },
];

/** Grupos dos recheios (abas do painel). */
export const FILLING_GROUPS = [
  { id: 'chocolate', name: 'Chocolate' },
  { id: 'cremes', name: 'Cremes' },
  { id: 'frutas', name: 'Frutas' },
  { id: 'mousses', name: 'Mousses' },
  { id: 'especiais', name: 'Castanhas, café e caramelo' },
];

/**
 * Recheios (entre as camadas). gloss: 0 = cremoso fosco … 1 = brilhante.
 *   cream   recheio de duas partes: `cream` é o creme (o que mais aparece) e `color` vira o fio de geleia / calda
 *   pieces  pedaços à mostra no corte (ver PIECES)
 *   soft    creme aerado, que cede com peso (as regras de confeiteiro olham isto)
 *   cold    precisa de geladeira até a hora de servir
 *   pale    creme claro: aceita corante (chá revelação)
 */
export const FILLINGS = [
  { id: 'brigadeiro', group: 'chocolate', name: 'Brigadeiro', desc: 'Cremoso, de chocolate ao leite', price: 8, color: '#6d3d20', gloss: 0.55, popular: true, tags: ['chocolate', 'cremoso', 'classico', 'infantil'], craft: 'Brigadeiro de panela com chocolate ao leite 40%, ponto de colher.' },
  { id: 'meioamargo', group: 'chocolate', name: 'Brigadeiro meio amargo', desc: 'Chocolate 54%, menos doce', price: 10, color: '#3f2212', gloss: 0.6, tags: ['chocolate', 'intenso', 'adulto'], craft: 'Brigadeiro gourmet com chocolate 54% e creme de leite fresco.' },
  { id: 'brigadeirobranco', group: 'chocolate', name: 'Brigadeiro branco', desc: 'De chocolate branco, bem cremoso', price: 9, color: '#f6e6bf', gloss: 0.5, pale: true, tags: ['chocolate', 'doce', 'cremoso', 'infantil'], craft: 'Brigadeiro de chocolate branco nobre, ponto de colher.' },
  { id: 'nutella', group: 'chocolate', name: 'Nutella', desc: 'Creme de avelã puro', price: 12, color: '#4c2712', gloss: 0.8, popular: true, tags: ['chocolate', 'castanhas', 'intenso'], craft: 'Creme de avelã puro, com barragem de buttercream para não escorrer.' },
  { id: 'ganache', group: 'chocolate', name: 'Ganache meio amargo', desc: 'Chocolate nobre e creme de leite', price: 11, color: '#2e170b', gloss: 0.75, tags: ['chocolate', 'intenso', 'adulto'], craft: 'Ganache 2:1 de chocolate 54%, batida depois de fria para ganhar corpo.' },
  { id: 'ganachebranca', group: 'chocolate', name: 'Ganache branca', desc: 'Chocolate branco aveludado', price: 11, color: '#f4e4c4', gloss: 0.65, pale: true, tags: ['chocolate', 'doce', 'cremoso'], craft: 'Ganache 3:1 de chocolate branco, descansada 12 h.' },
  { id: 'prestigio', group: 'chocolate', name: 'Prestígio', desc: 'Beijinho de coco com brigadeiro', price: 10, color: '#5a3018', gloss: 0.5, cream: '#fbf6ea', popular: true, tags: ['chocolate', 'coco', 'classico'], craft: 'Uma camada fina de brigadeiro e, por cima, beijinho cremoso com coco fresco.' },
  { id: 'cookies', group: 'chocolate', name: 'Cookies & cream', desc: 'Creme branco com biscoito de chocolate', price: 11, color: '#f3ecdf', gloss: 0.3, pieces: 'cookie', popular: true, tags: ['chocolate', 'crocante', 'cremoso', 'infantil'], craft: 'Creme de leite Ninho com biscoito recheado quebrado grosso, misturado na hora.' },

  { id: 'ninho', group: 'cremes', name: 'Ninho', desc: 'Creme de leite em pó, sucesso absoluto', price: 10, color: '#fff4dc', gloss: 0.3, pale: true, popular: true, tags: ['cremoso', 'doce', 'classico', 'infantil'], craft: 'Creme de leite Ninho cozido, ponto de recheio firme.' },
  { id: 'quatroleites', group: 'cremes', name: 'Quatro leites', desc: 'Condensado, Ninho, coco e creme de leite', price: 10, color: '#fbefd2', gloss: 0.35, pale: true, tags: ['cremoso', 'doce', 'classico'], craft: 'Leite condensado, leite em pó, leite de coco e creme de leite cozidos até engrossar.' },
  { id: 'cremebelga', group: 'cremes', name: 'Creme belga', desc: 'Creme de confeiteiro com baunilha', price: 9, color: '#f6e2a4', gloss: 0.5, cold: true, tags: ['cremoso', 'classico', 'leve'], craft: 'Creme de confeiteiro com gemas e baunilha, aerado com chantilly.' },
  { id: 'creamcheese', group: 'cremes', name: 'Cream cheese', desc: 'Levemente azedinho, par do red velvet', price: 11, color: '#fbf3e4', gloss: 0.3, pale: true, cold: true, tags: ['cremoso', 'azedinho', 'adulto'], craft: 'Cream cheese batido com manteiga e açúcar de confeiteiro.' },
  { id: 'docedeleite', group: 'cremes', name: 'Doce de leite', desc: 'Argentino, no ponto de colher', price: 8, color: '#c8783a', gloss: 0.7, popular: true, tags: ['caramelo', 'doce', 'classico'], craft: 'Doce de leite argentino, ponto de colher, com barragem de buttercream.' },
  { id: 'coco', group: 'cremes', name: 'Beijinho', desc: 'Cremoso, com coco fresco', price: 7, color: '#f4f0e8', gloss: 0.25, pale: true, tags: ['coco', 'doce', 'classico', 'infantil'], craft: 'Beijinho de panela com coco fresco ralado, ponto de colher.' },
  { id: 'cocada', group: 'cremes', name: 'Cocada cremosa', desc: 'Coco queimadinho no leite condensado', price: 9, color: '#e4c78c', gloss: 0.4, pieces: 'coco', tags: ['coco', 'caramelo', 'doce'], craft: 'Coco em fitas dourado no açúcar, cozido com leite condensado.' },

  { id: 'morango', group: 'frutas', name: 'Morango', desc: 'Creme, geleia artesanal e pedaços da fruta', price: 9, color: '#d93060', gloss: 0.9, cream: '#fff0e4', pieces: 'morango', cold: true, popular: true, tags: ['frutado', 'cremoso', 'classico'], craft: 'Geleia de morango da casa sobre a massa, creme de Ninho e morangos frescos fatiados.' },
  { id: 'framboesa', group: 'frutas', name: 'Framboesa', desc: 'Creme com geleia intensa, levemente ácida', price: 10, color: '#c0204a', gloss: 0.9, cream: '#fdeee6', pieces: 'framboesa', cold: true, tags: ['frutado', 'azedinho', 'adulto'], craft: 'Geleia de framboesa coada, creme leve e framboesas inteiras.' },
  { id: 'frutasvermelhas', group: 'frutas', name: 'Frutas vermelhas', desc: 'Morango, framboesa e mirtilo no creme', price: 11, color: '#a01848', gloss: 0.9, cream: '#fdeee6', pieces: 'frutas', cold: true, tags: ['frutado', 'azedinho', 'cremoso'], craft: 'Geleia de frutas vermelhas, creme leve e as frutas inteiras por cima.' },
  { id: 'abacaxicoco', group: 'frutas', name: 'Abacaxi com coco', desc: 'Abacaxi em calda no creme de coco', price: 9, color: '#e6bf3c', gloss: 0.8, cream: '#fbf5e2', pieces: 'abacaxi', cold: true, tags: ['frutado', 'coco', 'leve'], craft: 'Abacaxi cozido em calda, bem escorrido, sobre creme de coco.' },
  { id: 'pessego', group: 'frutas', name: 'Pêssego com creme', desc: 'Pêssego em calda e creme de baunilha', price: 9, color: '#f0a23a', gloss: 0.8, cream: '#fff3dc', pieces: 'pessego', cold: true, tags: ['frutado', 'cremoso', 'classico'], craft: 'Pêssego em calda fatiado e escorrido, sobre creme de baunilha.' },
  { id: 'ameixa', group: 'frutas', name: 'Ameixa com doce de leite', desc: 'O clássico das festas de família', price: 10, color: '#2c1420', gloss: 0.85, cream: '#c8783a', pieces: 'ameixa', tags: ['frutado', 'caramelo', 'classico', 'adulto'], craft: 'Doce de leite e ameixa-preta cozida em calda, sem caroço, picada.' },
  { id: 'cereja', group: 'frutas', name: 'Cereja', desc: 'Floresta negra: chantilly e cerejas', price: 11, color: '#7a0f24', gloss: 0.9, cream: '#fff6ee', pieces: 'cereja', soft: true, cold: true, tags: ['frutado', 'cremoso', 'adulto', 'classico'], craft: 'Chantilly firme, cerejas em calda escorridas e um fio da calda sobre a massa.' },
  { id: 'limaosiciliano', group: 'frutas', name: 'Limão-siciliano', desc: 'Curd amarelinho e bem cítrico', price: 10, color: '#f4d640', gloss: 0.85, cold: true, tags: ['citrico', 'azedinho', 'adulto'], craft: 'Lemon curd de limão-siciliano com manteiga, cozido em banho-maria.' },

  { id: 'limao', group: 'mousses', name: 'Mousse de limão', desc: 'Azedinha e refrescante', price: 7, color: '#c8dc50', gloss: 0.3, soft: true, cold: true, aerated: true, tags: ['citrico', 'azedinho', 'leve'], craft: 'Mousse de limão-taiti com leite condensado e creme de leite, estabilizada com gelatina.' },
  { id: 'maracuja', group: 'mousses', name: 'Mousse de maracujá', desc: 'Com a calda e as sementes da fruta', price: 9, color: '#e3a416', gloss: 0.85, cream: '#f7d98a', pieces: 'maracuja', soft: true, cold: true, aerated: true, popular: true, tags: ['frutado', 'azedinho', 'leve'], craft: 'Mousse de maracujá estabilizada com gelatina e um fio de calda da fruta com sementes.' },
  { id: 'moussechocolate', group: 'mousses', name: 'Mousse de chocolate', desc: 'Aerada, de chocolate meio amargo', price: 10, color: '#5a3524', gloss: 0.2, soft: true, cold: true, aerated: true, tags: ['chocolate', 'leve', 'cremoso'], craft: 'Mousse de chocolate 54% com chantilly incorporado; montar com aro e acetato.' },
  { id: 'moussemorango', group: 'mousses', name: 'Mousse de morango', desc: 'Rosada, feita com a fruta', price: 9, color: '#f3a6b8', gloss: 0.2, soft: true, cold: true, aerated: true, tags: ['frutado', 'leve', 'infantil'], craft: 'Purê de morango, chantilly e gelatina; montar com aro e acetato.' },

  { id: 'docedeleitenozes', group: 'especiais', name: 'Doce de leite com nozes', desc: 'Cremoso com pedaços crocantes', price: 11, color: '#c8783a', gloss: 0.7, pieces: 'nozes', popular: true, tags: ['caramelo', 'castanhas', 'crocante'], craft: 'Doce de leite argentino com nozes tostadas picadas grosso.' },
  { id: 'nozes', group: 'especiais', name: 'Creme de nozes', desc: 'Suave, com nozes tostadas', price: 12, color: '#dcc49c', gloss: 0.3, pieces: 'nozes', tags: ['castanhas', 'cremoso', 'adulto'], craft: 'Creme cozido de leite condensado e nozes moídas, com pedaços inteiros.' },
  { id: 'pistache', group: 'especiais', name: 'Pistache', desc: 'Creme de pistache de verdade', price: 16, color: '#b7c789', gloss: 0.4, pieces: 'pistache', tags: ['castanhas', 'cremoso', 'adulto'], craft: 'Pasta pura de pistache em creme de chocolate branco; pistache picado por cima.' },
  { id: 'pacoca', group: 'especiais', name: 'Paçoca', desc: 'Creme de amendoim com paçoca esfarelada', price: 9, color: '#d9b27a', gloss: 0.2, pieces: 'pacoca', tags: ['castanhas', 'doce', 'classico'], craft: 'Creme de leite condensado com pasta de amendoim e paçoca esfarelada.' },
  { id: 'caramelosalgado', group: 'especiais', name: 'Caramelo salgado', desc: 'Caramelo de manteiga com flor de sal', price: 11, color: '#9c5216', gloss: 0.85, tags: ['caramelo', 'intenso', 'adulto'], craft: 'Caramelo a seco com creme de leite, manteiga e flor de sal, ponto firme.' },
  { id: 'cafe', group: 'especiais', name: 'Café', desc: 'Creme de café coado, tipo cappuccino', price: 9, color: '#b08a68', gloss: 0.35, tags: ['cafe', 'cremoso', 'adulto'], craft: 'Creme de leite condensado com café coado forte e um toque de cacau.' },
];

/**
 * Pedaços que aparecem no corte (do recheio ou do adicional). cells = desenhos do atlas (textures.js → piecesCanvas);
 * h = altura do pedaço em relação à do recheio · w = largura em relação à altura · gap = distância entre pedaços
 * (em larguras) · lift = onde ficam na altura do recheio (0 embaixo … 1 em cima) · tilt = quanto podem girar.
 */
export const PIECES = {
  morango: { cells: ['morango'], h: 0.84, w: [0.86, 1.06], gap: [1.25, 2.15], lift: 0.54, tilt: 0.5 },
  framboesa: { cells: ['framboesa'], h: 0.62, w: [1.05, 1.05], gap: [1.25, 2.15], lift: 0.54, tilt: 0.5 },
  frutas: { cells: ['morango', 'framboesa', 'mirtilo', 'mirtilo'], h: 0.66, w: [0.95, 1.05], gap: [1.15, 1.9], lift: 0.52, tilt: 0.5 },
  cereja: { cells: ['cereja'], h: 0.7, w: [1, 1], gap: [1.3, 2.2], lift: 0.5, tilt: 0.6 },
  abacaxi: { cells: ['abacaxi'], h: 0.56, w: [1, 1.3], gap: [1.2, 2], lift: 0.42, tilt: 0.7 },
  pessego: { cells: ['pessego'], h: 0.5, w: [1.5, 1.9], gap: [1.15, 1.7], lift: 0.42, tilt: 0.35 },
  ameixa: { cells: ['ameixa'], h: 0.58, w: [1.1, 1.4], gap: [1.3, 2.3], lift: 0.42, tilt: 0.7 },
  maracuja: { cells: ['semente'], h: 0.44, w: [1.5, 1.9], gap: [1.3, 2.4], lift: 0.26, tilt: 0.4 },
  nozes: { cells: ['noz', 'noz2'], h: 0.56, w: [1, 1.25], gap: [1.2, 2.3], lift: 0.5, tilt: 1.5, spread: 0.26 },
  pistache: { cells: ['pistache'], h: 0.42, w: [1.1, 1.4], gap: [1.3, 2.4], lift: 0.5, tilt: 1.5, spread: 0.32 },
  pacoca: { cells: ['farelo'], h: 0.42, w: [1.4, 1.9], gap: [1.2, 2], lift: 0.5, tilt: 1.2, spread: 0.3 },
  coco: { cells: ['coco'], h: 0.4, w: [1.6, 2.2], gap: [1.1, 1.7], lift: 0.5, tilt: 1.2, spread: 0.3 },
  cookie: { cells: ['cookie', 'cookie2', 'cookie'], h: 0.86, w: [1.3, 1.8], gap: [0.8, 1.25], lift: 0.5, tilt: 0.7, spread: 0.1 },
  crocante: { cells: ['crocante'], h: 0.54, w: [1.1, 1.5], gap: [0.9, 1.6], lift: 0.5, tilt: 1.5, spread: 0.26 },
  gotas: { cells: ['gota'], h: 0.4, w: [1, 1], gap: [1.2, 2.1], lift: 0.5, tilt: 1.5, spread: 0.32 },
};

/** Adicionais do recheio (um por recheio): pedaços que aparecem no corte. */
export const FILL_ADDS = [
  { id: 'morango', name: 'Morango fresco', desc: 'Fatias da fruta no meio do creme', price: 6, pieces: 'morango', swatch: '#e2334f', popular: true, tags: ['frutado', 'azedinho', 'classico'], craft: 'Morangos frescos fatiados, secos em papel, dispostos em toda a camada.' },
  { id: 'crocante', name: 'Crocante', desc: 'Praliné de castanha-de-caju', price: 5, pieces: 'crocante', swatch: '#d99a3a', tags: ['castanhas', 'crocante', 'caramelo'], craft: 'Praliné de castanha-de-caju quebrado, polvilhado sobre o recheio na montagem.' },
  { id: 'gotas', name: 'Gotas de chocolate', desc: 'Chocolate meio amargo em gotas', price: 4, pieces: 'gotas', swatch: '#3a1c0e', tags: ['chocolate', 'crocante', 'infantil'], craft: 'Gotas de chocolate 54% espalhadas sobre o recheio.' },
  { id: 'nozes', name: 'Nozes', desc: 'Tostadas e picadas', price: 7, pieces: 'nozes', swatch: '#8a6238', tags: ['castanhas', 'crocante', 'adulto'], craft: 'Nozes tostadas, picadas grosso, espalhadas sobre o recheio.' },
];

/** Calda de molhar a massa (não aparece no 3D: entra na ficha de produção e no preço). */
export const SOAKS = [
  { id: 'leitecondensado', name: 'Leite condensado', desc: 'Molhadinho, bem brasileiro', price: 4, popular: true, tags: ['doce', 'cremoso', 'classico', 'infantil'], craft: 'Calda de leite condensado, leite e baunilha; 3 colheres de sopa por camada.' },
  { id: 'baunilha', name: 'Baunilha', desc: 'Calda leve de açúcar e baunilha', price: 3, tags: ['leve', 'doce', 'classico'], craft: 'Calda rala de açúcar com fava de baunilha, fria; 2 colheres de sopa por camada.' },
  { id: 'cafe', name: 'Café', desc: 'Café coado adoçado, para massas escuras', price: 3, tags: ['cafe', 'intenso', 'adulto'], craft: 'Café coado forte com açúcar, frio; 2 colheres de sopa por camada.' },
  { id: 'licor', name: 'Licor', desc: 'Um toque de licor de laranja ou cacau', price: 6, tags: ['adulto', 'intenso'], craft: 'Calda de açúcar com licor (laranja nas massas claras, cacau nas escuras); 2 colheres de sopa por camada.' },
];

/**
 * Coberturas. defaultColor = cor sugerida ao escolher o tipo. poured = despejada.
 * kind decide que estilos ela aceita (ver FINISHES.on):
 *   firm  creme firme de espátula · soft  chantilly · mousse · poured  despejada · fondant  pasta americana ·
 *   fixed  tem textura própria (merengue, granulado, coco) · naked
 * soft = cede com peso e calor (regras de confeiteiro) · heat = sofre no calor (transporte em Cuiabá)
 */
export const COVERINGS = [
  { id: 'buttercream', name: 'Buttercream', desc: 'Manteiga batida, lisinha e firme', price: 12, defaultColor: '#f7d3dc', finish: 'acetinado', kind: 'firm', popular: true, tags: ['firme', 'elegante'], craft: 'Buttercream de merengue suíço; alisar com espátula quente e raspador de bancada.' },
  { id: 'chantininho', name: 'Chantininho', desc: 'Chantilly com leite Ninho, firme para decorar', price: 12, defaultColor: '#ffffff', finish: 'fosco', kind: 'firm', heat: true, popular: true, tags: ['firme', 'fosco', 'divertido'], craft: 'Chantilly vegetal batido com leite Ninho e leite condensado até o ponto de bico firme.' },
  { id: 'chantilly', name: 'Chantilly', desc: 'Leve, aerado e bem branquinho', price: 10, defaultColor: '#ffffff', finish: 'fosco', kind: 'soft', soft: true, heat: true, popular: true, tags: ['delicado', 'fosco'], craft: 'Chantilly fresco batido em ponto firme; manter refrigerado até a entrega.' },
  { id: 'ganache', name: 'Ganache', desc: 'Chocolate nobre com brilho intenso', price: 14, defaultColor: '#3a1a08', finish: 'brilhante', kind: 'poured', poured: true, tags: ['brilhante', 'elegante'], craft: 'Ganache 1:1 de chocolate 54% despejada a 32 °C sobre o bolo já selado e gelado.' },
  { id: 'ganachebranca', name: 'Ganache branca', desc: 'Chocolate branco fluido, em qualquer cor', price: 14, defaultColor: '#f2e4c7', finish: 'brilhante', kind: 'poured', poured: true, tags: ['brilhante', 'elegante', 'moderno'], craft: 'Ganache 3:1 de chocolate branco, tingida com corante lipossolúvel, despejada a 30 °C.' },
  { id: 'glace', name: 'Glacê espelhado', desc: 'Liso como espelho, super brilhante', price: 11, defaultColor: '#ffb3d1', finish: 'espelhado', kind: 'poured', poured: true, heat: true, tags: ['brilhante', 'moderno'], craft: 'Glaçage de glucose, leite condensado e gelatina a 32 °C sobre o bolo congelado e bem liso.' },
  { id: 'chocolate', name: 'Chocolate cremoso', desc: 'Cobertura de brigadeiro espatulada', price: 13, defaultColor: '#6b3f22', finish: 'cremoso', kind: 'firm', tags: ['rustico', 'brilhante'], craft: 'Brigadeiro mole de chocolate ao leite, espatulado ainda morno.' },
  { id: 'brigadeiro', name: 'Brigadeiro com granulado', desc: 'Coberto de brigadeiro e granulado belga', price: 15, defaultColor: '#6b3f22', finish: 'cremoso', kind: 'fixed', popular: true, tags: ['rustico', 'divertido', 'fosco'], craft: 'Brigadeiro em ponto de enrolar espalhado no bolo e coberto, ainda mole, de granulado belga.' },
  { id: 'creamcheese', name: 'Cream cheese', desc: 'Frosting levemente azedinho', price: 13, defaultColor: '#ffffff', finish: 'acetinado', kind: 'firm', heat: true, tags: ['delicado', 'elegante', 'rustico'], craft: 'Cream cheese gelado batido com manteiga e açúcar de confeiteiro; aplicar com o bolo frio.' },
  { id: 'mousse', name: 'Mousse', desc: 'Aveludada, textura de nuvem', price: 11, defaultColor: '#f2e4c7', finish: 'aveludado', kind: 'mousse', soft: true, heat: true, tags: ['delicado', 'fosco'], craft: 'Mousse estabilizada com gelatina, aplicada com aro e acetato; desenformar gelado.' },
  { id: 'pasta', name: 'Pasta americana', desc: 'Lisa como porcelana, com quinas vivas', price: 22, defaultColor: '#ffffff', finish: 'fosco', kind: 'fondant', prep: 24, tags: ['firme', 'elegante', 'fosco'], craft: 'Bolo selado com ganache firme e quinas vivas; pasta aberta a 3 mm e alisada com alisador.' },
  { id: 'merengue', name: 'Merengue maçaricado', desc: 'Merengue suíço em picos, tostado na hora', price: 15, defaultColor: '#ffffff', finish: 'brilhante', kind: 'fixed', soft: true, heat: true, tags: ['rustico', 'brilhante', 'delicado'], craft: 'Merengue suíço aplicado em picos com as costas da colher e tostado no maçarico no dia da entrega.' },
  { id: 'coco', name: 'Coco ralado', desc: 'Creme branco coberto de coco fresco', price: 12, defaultColor: '#ffffff', finish: 'fosco', kind: 'fixed', tags: ['rustico', 'fosco', 'delicado'], craft: 'Chantininho por baixo e coco fresco ralado grosso pressionado à mão em toda a volta.' },
  { id: 'naked', name: 'Naked', desc: 'Massa à mostra com creme no topo', price: 10, defaultColor: '#ffffff', finish: 'rústico', kind: 'naked', tags: ['rustico', 'moderno'], craft: 'Sem cobertura na lateral: recheios nivelados na borda e creme só no topo.' },
];

/** Grupos dos estilos de cobertura (abas do painel). */
export const FINISH_GROUPS = [
  { id: 'espatula', name: 'Espátula' },
  { id: 'cores', name: 'Cores' },
  { id: 'bico', name: 'Bico' },
  { id: 'confeitos', name: 'Confeitos' },
  { id: 'estencil', name: 'Estêncil' },
];

/**
 * Estilos de acabamento da cobertura (a técnica). two = usa uma segunda cor · trim = usa um confeito (TRIMS).
 * on = em que tipos de cobertura a técnica se faz de verdade (COVERINGS.kind); o naked não tem estilo.
 */
const CREAM = ['firm', 'soft'];
export const FINISHES = [
  { id: 'liso', group: 'espatula', name: 'Liso', desc: 'Alisado na espátula', price: 0, on: ['firm', 'soft', 'mousse', 'poured', 'fondant', 'fixed'], popular: true, tags: ['elegante', 'moderno'], craft: 'Alisar com raspador de bancada e espátula quente.' },
  { id: 'rustico', group: 'espatula', name: 'Espatulado', desc: 'Rústico, com marcas de espátula', price: 4, on: ['firm', 'soft', 'mousse'], popular: true, tags: ['rustico'], craft: 'Golpes curtos com a ponta da espátula, sem alisar.' },
  { id: 'pente', group: 'espatula', name: 'Riscado', desc: 'Riscos finos feitos no pente', price: 5, on: CREAM, tags: ['vintage', 'elegante'], craft: 'Pente decorador de dentes finos, numa volta só da bailarina.' },
  { id: 'ondas', group: 'espatula', name: 'Ondas', desc: 'Pente em sobe e desce, em volta do bolo', price: 5, on: CREAM, tags: ['vintage', 'divertido'], craft: 'Pente decorador subindo e descendo enquanto a bailarina gira.' },
  { id: 'vertical', group: 'espatula', name: 'Riscos verticais', desc: 'Sulcos de baixo para cima', price: 5, on: CREAM, tags: ['moderno', 'elegante'], craft: 'Ponta da espátula (ou pente) puxada de baixo para cima, sulco a sulco.' },
  { id: 'seminaked', group: 'espatula', name: 'Semi-naked', desc: 'A massa aparece sob o creme', price: 0, on: CREAM, popular: true, tags: ['rustico', 'moderno'], craft: 'Camada fina de creme raspada até a massa aparecer em manchas.' },
  { id: 'pinceladas', group: 'espatula', name: 'Pinceladas', desc: 'Toques de espátula em duas cores', price: 12, two: true, on: CREAM, tags: ['moderno', 'rustico', 'elegante'], craft: 'Creme da segunda cor aplicado em toques com espátula de pintura, do pé para o alto.' },

  { id: 'ombre', group: 'cores', name: 'Degradê', desc: 'Duas cores em ombré', price: 8, two: true, on: ['firm', 'soft', 'mousse', 'fondant'], popular: true, tags: ['moderno', 'delicado'], craft: 'Três tons aplicados em faixas e fundidos no raspador.' },
  { id: 'aquarela', group: 'cores', name: 'Aquarela', desc: 'Manchas suaves de cor', price: 10, two: true, on: ['firm', 'soft', 'mousse', 'fondant'], tags: ['delicado', 'moderno'], craft: 'Manchas de creme colorido puxadas no raspador, sem misturar de todo.' },
  { id: 'listras', group: 'cores', name: 'Listras', desc: 'Faixas em duas cores', price: 12, two: true, on: ['firm', 'soft', 'fondant'], tags: ['divertido', 'vintage'], craft: 'Pente de listras: sulcos preenchidos com a segunda cor e alisados.' },
  { id: 'marmorizado', group: 'cores', name: 'Marmorizado', desc: 'Veios de cor, como mármore', price: 10, two: true, on: ['firm', 'fondant', 'poured'], tags: ['elegante', 'moderno'], craft: 'Segunda cor em fios, torcida e aberta junto (pasta) ou riscada no despejo (ganache e glacê).' },
  { id: 'perolado', group: 'cores', name: 'Perolado', desc: 'Brilho de pérola aplicado no pincel', price: 12, on: ['firm', 'fondant'], tags: ['elegante', 'brilhante'], craft: 'Pó perolado comestível diluído em álcool de cereais, pincelado sobre a cobertura gelada.' },
  { id: 'respingo', group: 'cores', name: 'Respingo dourado', desc: 'Salpicos de dourado comestível', price: 12, on: ['firm', 'soft', 'mousse', 'poured', 'fondant'], tags: ['elegante', 'moderno'], craft: 'Pó dourado diluído, salpicado com pincel de cerdas duras.' },

  { id: 'rosetas', group: 'bico', name: 'Rosetas', desc: 'O bolo inteiro coberto de rosetas', price: 18, on: CREAM, popular: true, tags: ['vintage', 'delicado', 'divertido'], craft: 'Bico 1M: rosetas de 4 cm em fileiras desencontradas, da base para o topo.' },
  { id: 'babados', group: 'bico', name: 'Babados', desc: 'Camadas de babado na lateral', price: 18, on: CREAM, tags: ['vintage', 'delicado', 'elegante'], craft: 'Bico pétala 104: babados sobrepostos de baixo para cima, com a bailarina girando.' },
  { id: 'cesta', group: 'bico', name: 'Cesta', desc: 'Trançado de bico na lateral', price: 16, on: ['firm'], tags: ['vintage', 'rustico'], craft: 'Bico cesta 47: uma haste vertical e tiras horizontais alternadas, coluna a coluna.' },

  { id: 'barrado', group: 'confeitos', name: 'Barrado', desc: 'Faixa de castanha, granulado ou coco na base', price: 5, trim: true, on: ['firm', 'soft', 'poured'], popular: true, tags: ['vintage', 'rustico'], craft: 'Confeito pressionado com a mão em concha na base, com o bolo inclinado sobre a assadeira.' },
  { id: 'chuva', group: 'confeitos', name: 'Confeitos subindo', desc: 'Sobem da base e vão rareando', price: 6, trim: true, on: ['firm', 'soft', 'poured'], tags: ['divertido', 'moderno'], craft: 'Confeito jogado de baixo para cima, mais fechado no pé e solto no alto.' },
  { id: 'faultline', group: 'confeitos', name: 'Fault line', desc: 'Faixa de confeitos no meio da cobertura', price: 14, trim: true, on: ['firm'], tags: ['moderno', 'divertido'], craft: 'Faixa de confeitos colada no meio; creme mais grosso acima e abaixo, com a beira irregular pintada de dourado.' },

  { id: 'poa', group: 'estencil', name: 'Poá', desc: 'Bolinhas em estêncil', price: 9, two: true, on: ['firm', 'fondant'], tags: ['divertido', 'vintage'], craft: 'Estêncil de bolinhas com glacê real da segunda cor, sobre a cobertura gelada.' },
  { id: 'coracoes', group: 'estencil', name: 'Corações', desc: 'Corações em estêncil', price: 9, two: true, on: ['firm', 'fondant'], tags: ['divertido', 'delicado'], craft: 'Estêncil de corações com glacê real da segunda cor, sobre a cobertura gelada.' },
  { id: 'arabesco', group: 'estencil', name: 'Arabesco', desc: 'Renda em estêncil', price: 12, two: true, on: ['firm', 'fondant'], tags: ['elegante', 'vintage'], craft: 'Estêncil de arabescos com glacê real da segunda cor; retirar de uma vez, sem arrastar.' },
];

/** Confeitos do barrado, dos "confeitos subindo" e da fault line. colors = tons das peças (texturas). */
export const TRIMS = [
  { id: 'castanha', name: 'Castanha', desc: 'Castanha-de-caju tostada e picada', price: 7, swatch: '#c79a62', colors: ['#d9b27c', '#b98850', '#e8cfa0', '#a57842'], popular: true, tags: ['castanhas', 'crocante'], craft: 'Castanha-de-caju tostada, picada na faca (xerém grosso).' },
  { id: 'granulado', name: 'Granulado', desc: 'Chocolate belga', price: 4, swatch: '#3a1a08', colors: ['#3a1c0e', '#4a2614', '#2c140a'], popular: true, tags: ['chocolate', 'crocante', 'infantil'], craft: 'Granulado belga ao leite e meio amargo misturados.' },
  { id: 'confeitos', name: 'Confeitos coloridos', desc: 'Mix de granulados e bolinhas', price: 5, swatch: '#e8437a', colors: ['#e8437a', '#3fa7e0', '#f5c211', '#3fbf6f', '#ffffff', '#f07a2a', '#8a5fd6'], tags: ['infantil', 'doce'], craft: 'Mix de confeitos: granulado colorido, miçangas e bolinhas.' },
  { id: 'coco', name: 'Coco ralado', desc: 'Coco fresco em flocos', price: 4, swatch: '#fffdf6', colors: ['#fffdf6', '#f6f0e2', '#fff8ea'], tags: ['coco', 'leve'], craft: 'Coco fresco ralado grosso, bem seco.' },
  { id: 'raspas', name: 'Raspas de chocolate', desc: 'Lascas de chocolate ao leite', price: 6, swatch: '#6b3f22', colors: ['#6b3f22', '#532e18', '#7d4c2a'], tags: ['chocolate', 'crocante'], craft: 'Chocolate ao leite raspado com descascador de legumes.' },
];
export function finishAllowed(coveringId, finishId) {
  if (finishId === 'liso') return true;
  const cover = getCovering(coveringId);
  const fin = getFinish(finishId);
  return Boolean(cover && fin && fin.on.includes(cover.kind));
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
/** Cores que só a calda metálica usa (têm nome, mas não entram na paleta da cobertura). */
export const METAL_COLORS = [
  { hex: '#d4a437', name: 'Dourado' },
  { hex: '#c9ced6', name: 'Prateado' },
  { hex: '#d99a8a', name: 'Rosé gold' },
];

/** Cores sugeridas para a calda (as demais continuam disponíveis em "mais cores"). */
export const DRIP_COLORS = ['#3a1a08', '#6b3f22', '#ffffff', '#b9772c', '#ffb3d1', '#d96b82', '#ffd166', '#8b1a1a'];
/** Quanta calda desce pela borda. k = quantas gotas (1 = a de sempre). */
export const DRIP_AMOUNTS = [
  { id: 'pouca', name: 'Pouca', k: 0.55, price: 0, craft: 'Gotas espaçadas, feitas uma a uma com a bisnaga.' },
  { id: 'media', name: 'Média', k: 1, price: 0, craft: 'Gotas com a bisnaga em toda a volta e o topo fechado.' },
  { id: 'farta', name: 'Farta', k: 1.7, price: 3, craft: 'Calda despejada no centro e empurrada para a borda até escorrer em toda a volta.' },
];
/** Até onde a calda desce. k = fração do comprimento máximo. */
export const DRIP_LENGTHS = [
  { id: 'curta', name: 'Curta', k: 0.45 },
  { id: 'media', name: 'Média', k: 0.74 },
  { id: 'longa', name: 'Longa', k: 1 },
];

/** Chá revelação: a cor do recheio fica em segredo até o corte. */
export const REVEAL_COLORS = [
  { id: 'rosa', name: 'Rosa', hex: '#f77fa8', who: 'menina' },
  { id: 'azul', name: 'Azul', hex: '#5fa8ee', who: 'menino' },
];

export const getSoak = finder(SOAKS);
export const getFillAdd = finder(FILL_ADDS);
export const getTrim = finder(TRIMS);
export const getDripAmount = finder(DRIP_AMOUNTS);
export const getDripLength = finder(DRIP_LENGTHS);
export const getRevealColor = finder(REVEAL_COLORS);

const byId = (list) => (id) => list.find((x) => x.id === id) || null;
export const getShape = byId(SHAPES);
export const getSize = byId(SIZES);
export const getFlavor = byId(FLAVORS);
export const getFilling = byId(FILLINGS);
export const getCovering = byId(COVERINGS);
export const getFinish = byId(FINISHES);
export const getBase = byId(BASES);
export const getHeight = byId(HEIGHTS);
export const getTierOption = (n) => TIER_OPTIONS.find((t) => t.n === n) || TIER_OPTIONS[0];

export function colorName(hex) {
  const h = String(hex || '').toLowerCase();
  // r5-qa: cores que os temas prontos usam fora da paleta (o laranja do Halloween, o azul claro do Fundo do mar)
  // também têm nome: o resumo, a ficha e o pedido não dizem "cor personalizada" para uma cor que a loja escolheu.
  return COLORS.find((c) => c.hex === h)?.name || TOPPER_COLORS.find((c) => c.hex === h)?.name || DECOR_COLOR_NAMES[h] || 'Cor personalizada';
}

// Bicos, decorações, velas, mensagens e topos moram em customizer-decor.js (reexportados aqui: quem importa deste
// arquivo continua encontrando tudo).
import { TOPPER_COLORS, DECOR_COLOR_NAMES } from './customizer-decor.js';
export * from './customizer-decor.js';
