// BOLAB — cardápio do personalizador 3D: bicos, decorações, temas, velas, mensagens e topos.
// Para trocar nome, preço ou cor de uma opção, edite aqui. (O resto do cardápio — formatos, massas, recheios,
// coberturas — fica em customizer.js, que reexporta tudo o que está neste arquivo.)
// Este arquivo não importa nada de customizer.js (evita importação em círculo).
//
// Toda peça (bico, decoração, vela, plaquinha, topo) traz, além de nome e preço:
//   craft    como é feita e de que material (uma linha; vai para a ficha de produção)
//   prep     horas a mais de preparo (0 quando não muda o prazo)
//   tags     palavras de um vocabulário fixo (TAGS), usadas pela assistente e pela busca do painel
//   popular  true nas mais pedidas (aparecem primeiro, em "Mais pedidos")
//   active   false tira a opção da loja sem quebrar bolos antigos (ela continua abrindo, sendo desenhada e
//            cobrada em bolos já salvos; só some das listas de escolha)

/** Vocabulário fixo das etiquetas. */
export const TAGS = ['fruta', 'flor', 'chocolate', 'doce', 'brilho', 'papel', 'tematico', 'infantil', 'romantico', 'festa', 'elegante', 'divertido', 'rustico', 'vintage', 'natal', 'pascoa', 'junino', 'halloween', 'casamento', 'bebe', 'formatura'];

/** Quantas decorações dá para combinar (o bolo arruma sozinho quem fica no centro, em volta e na lateral). */
export const MAX_DECORS = 8;
export const MAX_CANDLES = 9;
/** Quantas peças a pessoa pode colocar à mão, uma a uma (decor.placed). */
export const MAX_PLACED = 24;
export const MESSAGE_MAX = 20;
export const MESSAGE_PRICE = 8;
/** Mensagem escrita com bico direto no topo do bolo. */
export const SCRIPT_PRICE = 10;
export const TOPPER_MAX = 14;
/** Topo personalizado (nome ou idade recortado em acrílico). */
export const TOPPER_PRICE = 18;

/** Cores sugeridas para cada família de decoração (a pessoa pode abrir o seletor livre). */
export const DECOR_COLORS = {
  pastel: ['#f7b7c8', '#ffd9a8', '#fff2a8', '#bfe8c8', '#b8dcff', '#d9c2ff', '#ffffff', '#d96b82'],
  flor: ['#e4607f', '#f39fb2', '#ffffff', '#ffd166', '#c7a7ff', '#ff8c8c', '#8b1a1a', '#f2e4c7'],
  choc: ['#3a1a08', '#6b3f22', '#ffffff', '#f7b7c8'],
  metal: ['#dcae52', '#cfd3da', '#e8a5a0', '#1d1a1c'],
  // chocolate e metalizados juntos (esferas, placas)
  chocmetal: ['#3a1a08', '#6b3f22', '#ffffff', '#dcae52', '#e8a5a0', '#f7b7c8'],
  // fitas de cetim
  fita: ['#d96b82', '#f7b7c8', '#ffffff', '#dcae52', '#8b1a1a', '#1a4a8b', '#b8dcff', '#2d8b4a', '#c7a7ff', '#1d1a1c'],
  // uvas
  uva: ['#6a2a6e', '#9bbf4a', '#8a1f3a'],
  // festa (papel): cores vivas
  festa: ['#d96b82', '#ffd166', '#6fcfa8', '#6fb6f2', '#b497f0', '#ff8c6b', '#ffffff', '#1d1a1c'],
  // verdes de folhagem e suculenta
  verde: ['#7fae8a', '#5f8f6a', '#9fc7b0', '#b89bc9', '#6f9a55'],
};

/**
 * Acabamentos de bico (confeitados na borda). combo = conjunto completo que já decide onde vai cada coisa
 * (não usa "onde aplicar") · side = o bico toma a lateral (também não usa "onde aplicar") ·
 * places = onde ele pode ser aplicado (ids de PIPING_PLACES; sem a lista, só topo / base / os dois).
 */
export const PIPINGS = [
  { id: 'liso', name: 'Liso', desc: 'Sem bico, só a cobertura', price: 0, craft: 'Sem confeitar de bico', prep: 0, tags: ['elegante'], popular: true },
  { id: 'bolinhas', name: 'Bolinhas', desc: 'Pingos delicados na borda', price: 5, craft: 'Bico perlê nº 5, bolinhas encostadas uma na outra', prep: 0, tags: ['elegante', 'bebe'], places: ['top', 'base', 'both', 'cintura', 'cobre'] },
  { id: 'perolao', name: 'Pérolas grandes', desc: 'Gotas gordinhas de bico liso', price: 6, craft: 'Bico perlê nº 12, gotas grandes', prep: 0, tags: ['elegante', 'casamento'], places: ['top', 'base', 'both', 'cintura', 'cobre'] },
  { id: 'conchas', name: 'Conchas', desc: 'Borda clássica de confeitaria', price: 7, craft: 'Bico pitanga aberta (1M / 21), conchas em fila', prep: 0, tags: ['vintage', 'festa'], popular: true, places: ['top', 'base', 'both', 'cintura'] },
  { id: 'estrelas', name: 'Estrelas', desc: 'Pitangas feitas uma a uma', price: 8, craft: 'Bico pitanga aberta, uma pitanga por vez', prep: 0, tags: ['festa'], popular: true, places: ['top', 'base', 'both', 'cintura', 'cobre'] },
  { id: 'rosetas', name: 'Rosetas', desc: 'Espirais generosas de creme', price: 9, craft: 'Bico 1M, roseta em espiral de dentro para fora', prep: 0, tags: ['romantico', 'festa'], popular: true, places: ['top', 'base', 'both', 'cobre'] },
  { id: 'folhas', name: 'Folhas', desc: 'Guirlanda de folhinhas', price: 7, craft: 'Bico folha (352), pares em V', prep: 0, tags: ['flor', 'rustico'] },
  { id: 'corda', name: 'Corda', desc: 'Cordão torcido contínuo', price: 7, craft: 'Bico pitanga, cordão torcido sem levantar o bico', prep: 0, tags: ['vintage'], places: ['top', 'base', 'both', 'cintura'] },
  { id: 'ziguezague', name: 'Zigue-zague', desc: 'Vai e vem de bico pitanga', price: 7, craft: 'Bico pitanga, vai e vem apertado', prep: 0, tags: ['divertido'], places: ['top', 'base', 'both', 'cintura'] },
  { id: 'babado', name: 'Babado', desc: 'Rufo ondulado, bem romântico', price: 9, craft: 'Bico pétala (104), fita franzida', prep: 0, tags: ['romantico', 'vintage'] },
  { id: 'vintage', name: 'Vintage', desc: 'Guirlandas, conchas e lacinhos', price: 24, combo: true, craft: 'Técnica lambeth: conchas, cordões drapeados em duas camadas e lacinhos', prep: 24, tags: ['vintage', 'romantico', 'casamento'], popular: true },
  // ── rodada 5 ──
  { id: 'tranca', name: 'Trança', desc: 'Três cordões trançados', price: 8, craft: 'Bico pitanga fechada, três cordões cruzados', prep: 0, tags: ['rustico', 'vintage'], places: ['top', 'base', 'both', 'cintura'] },
  { id: 'coracoes', name: 'Corações', desc: 'Duas conchas que viram coração', price: 9, craft: 'Bico pitanga, duas conchas unidas pela cauda', prep: 0, tags: ['romantico'], places: ['top', 'base', 'both', 'cintura'] },
  { id: 'florzinhas', name: 'Florzinhas', desc: 'Flores de bico com miolo de pérola', price: 10, craft: 'Bico drop flower (2D), uma pérola de açúcar no miolo', prep: 0, tags: ['flor', 'romantico', 'bebe'], places: ['top', 'base', 'both', 'cintura', 'cobre'] },
  { id: 'pingos', name: 'Suspiros de bico', desc: 'Pingos altos, com a pontinha', price: 8, craft: 'Bico pitanga, pingos altos puxados para cima', prep: 0, tags: ['festa', 'divertido'], places: ['top', 'base', 'both', 'cobre'] },
  { id: 'pitangas', name: 'Pitangas alternadas', desc: 'Uma grande, uma pequena', price: 10, craft: 'Bico pitanga grande e médio, alternados', prep: 0, tags: ['festa', 'vintage'], places: ['top', 'base', 'both', 'cobre'] },
  { id: 'grama', name: 'Grama', desc: 'Tufos de fiozinhos de creme', price: 9, craft: 'Bico grama (233), tufos curtos', prep: 0, tags: ['tematico', 'infantil', 'divertido'], places: ['top', 'base', 'both', 'cobre'] },
  { id: 'guirlanda', name: 'Guirlandas', desc: 'Cordões drapeados na lateral', price: 16, side: true, craft: 'Cordão de bolinhas drapeado, com uma pitanga em cada encontro', prep: 0, tags: ['vintage', 'elegante', 'casamento'] },
  { id: 'escamas', name: 'Escamas', desc: 'Bolinhas puxadas na espátula', price: 18, side: true, craft: 'Efeito pétala: bolinhas de bico perlê puxadas com a espátula, coluna por coluna', prep: 0, tags: ['elegante', 'tematico'] },
  { id: 'poa', name: 'Poá', desc: 'Bolinhas espalhadas na lateral', price: 9, side: true, craft: 'Bico perlê pequeno, bolinhas em fileiras desencontradas', prep: 0, tags: ['divertido', 'vintage', 'bebe'] },
  { id: 'arabescos', name: 'Arabescos', desc: 'Volutas finas na lateral', price: 16, side: true, craft: 'Bico perlê nº 2, arabescos à mão livre', prep: 0, tags: ['elegante', 'casamento', 'vintage'] },
];

/** Onde o bico é aplicado. mult = fator sobre o preço do bico. */
export const PIPING_PLACES = [
  { id: 'top', name: 'No topo', mult: 1 },
  { id: 'base', name: 'Na base', mult: 1 },
  { id: 'both', name: 'Topo e base', mult: 1 },
  { id: 'cintura', name: 'Na cintura', mult: 1 },
  { id: 'cobre', name: 'Topo inteiro', mult: 1.8 },
];
/** Lugares aceitos por um bico (os de lateral e os conjuntos não usam "onde aplicar"). */
export function pipingPlaces(id) {
  const p = PIPINGS.find((x) => x.id === id);
  if (!p || p.id === 'liso' || p.combo || p.side) return [];
  return p.places || ['top', 'base', 'both'];
}

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
  { id: 'fundo', name: 'Em pé, ao fundo' },
];

/** Fartura de uma decoração. k = fator de quantidade no 3D; mult = fator de preço. */
export const QUANTITIES = [
  { id: 'pouco', name: 'Pouco', k: 0.6, mult: 0.8 },
  { id: 'medio', name: 'Médio', k: 1, mult: 1 },
  { id: 'farto', name: 'Farto', k: 1.5, mult: 1.35 },
];

export const DECOR_GROUPS = [
  { id: 'frutas', name: 'Frutas' },
  { id: 'flores', name: 'Flores' },
  { id: 'chocolate', name: 'Chocolate' },
  { id: 'doces', name: 'Docinhos' },
  { id: 'brilho', name: 'Brilho' },
  { id: 'festa', name: 'Festa e papel' },
  { id: 'tematico', name: 'Temáticos' },
];

/**
 * Decorações. scales = acompanha o tamanho do bolo (comestíveis); false = preço fixo.
 * arrs = arranjos possíveis (o primeiro é o padrão) · qty = aceita pouco/médio/farto ·
 * colors = família de cores sugeridas (DECOR_COLORS) · color = cor padrão ·
 * kinds = tipos da mesma peça (o primeiro é o padrão) · art = artigo do nome nas frases ("os macarons") ·
 * unit = preço de UMA peça colocada à mão (só quem tem `unit` pode ser colocado um a um).
 */
export const DECORS = [
  /* ── Frutas ── */
  { id: 'frutas', group: 'frutas', name: 'Frutas frescas', art: 'as', desc: 'Morangos, mirtilos e framboesas', price: 12, scales: true, arrs: ['auto', 'centro', 'coroa', 'meialua', 'cascata'], qty: true, unit: 2.5, craft: 'Morangos, mirtilos e framboesas frescos, higienizados e secos, postos na hora da entrega', prep: 0, tags: ['fruta', 'romantico', 'rustico'], popular: true },
  { id: 'morangos', group: 'frutas', name: 'Morangos banhados', art: 'os', desc: 'Mergulhados no chocolate', price: 14, scales: true, arrs: ['coroa', 'centro', 'meialua'], qty: true, colors: 'choc', color: '#3a1a08', unit: 3.5, craft: 'Morangos com cabinho banhados em chocolate temperado, com fios de chocolate por cima', prep: 0, tags: ['fruta', 'chocolate', 'romantico'], popular: true },
  { id: 'cerejas', group: 'frutas', name: 'Cerejas', art: 'as', desc: 'Com cabinho, bem vermelhas', price: 9, scales: true, arrs: ['coroa', 'centro', 'meialua', 'espalhado'], qty: true, unit: 1.5, craft: 'Cerejas em calda com cabinho, bem escorridas', prep: 0, tags: ['fruta', 'vintage', 'romantico'], popular: true },
  { id: 'morangosfrescos', group: 'frutas', name: 'Morangos inteiros', art: 'os', desc: 'Frescos, com as folhinhas', price: 10, scales: true, arrs: ['coroa', 'centro', 'meialua', 'espalhado'], qty: true, unit: 2.2, craft: 'Morangos frescos inteiros, com o cálice, postos na hora da entrega', prep: 0, tags: ['fruta', 'rustico', 'romantico'], popular: true },
  { id: 'framboesas', group: 'frutas', name: 'Framboesas', art: 'as', desc: 'Frescas, bem vermelhas', price: 12, scales: true, arrs: ['coroa', 'centro', 'meialua', 'espalhado'], qty: true, unit: 1.2, craft: 'Framboesas frescas selecionadas uma a uma', prep: 0, tags: ['fruta', 'elegante', 'romantico'] },
  { id: 'mirtilos', group: 'frutas', name: 'Mirtilos', art: 'os', desc: 'Blueberries com o véu azulado', price: 11, scales: true, arrs: ['espalhado', 'coroa', 'centro', 'meialua'], qty: true, unit: 0.8, craft: 'Mirtilos frescos, sem lavar na hora (para não perder o véu)', prep: 0, tags: ['fruta', 'elegante', 'rustico'] },
  { id: 'amoras', group: 'frutas', name: 'Amoras', art: 'as', desc: 'Escuras e brilhantes', price: 12, scales: true, arrs: ['coroa', 'centro', 'meialua', 'espalhado'], qty: true, unit: 1.2, craft: 'Amoras frescas selecionadas', prep: 0, tags: ['fruta', 'rustico', 'elegante'] },
  { id: 'uvas', group: 'frutas', name: 'Cachinhos de uva', art: 'os', desc: 'Mini cachos, roxos ou verdes', price: 11, scales: true, arrs: ['meialua', 'centro', 'coroa'], qty: true, colors: 'uva', color: '#6a2a6e', unit: 4, craft: 'Mini cachos de uva sem semente, lavados e secos', prep: 0, tags: ['fruta', 'rustico', 'elegante'] },
  { id: 'figos', group: 'frutas', name: 'Figos cortados', art: 'os', desc: 'Em metades e quartos', price: 14, scales: true, arrs: ['meialua', 'centro', 'coroa'], qty: true, unit: 3.5, craft: 'Figos roxos maduros cortados na hora, em metades e quartos', prep: 0, tags: ['fruta', 'rustico', 'elegante'] },
  { id: 'physalis', group: 'frutas', name: 'Physalis', art: 'as', desc: 'Com a capinha aberta', price: 13, scales: true, arrs: ['coroa', 'centro', 'meialua', 'espalhado'], qty: true, unit: 2.2, craft: 'Physalis com a capa seca aberta para trás', prep: 0, tags: ['fruta', 'elegante', 'rustico'] },
  { id: 'kiwi', group: 'frutas', name: 'Kiwi em fatias', art: 'o', desc: 'Rodelas e meias-luas', price: 9, scales: true, arrs: ['coroa', 'meialua', 'espalhado'], qty: true, unit: 1, craft: 'Kiwi descascado em fatias de 5 mm, secas no papel', prep: 0, tags: ['fruta', 'divertido'] },
  { id: 'laranja', group: 'frutas', name: 'Laranja desidratada', art: 'a', desc: 'Rodelas finas, quase vitrais', price: 10, scales: true, arrs: ['meialua', 'coroa', 'centro'], qty: true, unit: 1.8, craft: 'Rodelas de laranja secas no forno baixo por 3 horas', prep: 12, tags: ['fruta', 'rustico', 'elegante', 'natal'] },
  { id: 'limao', group: 'frutas', name: 'Limão siciliano', art: 'o', desc: 'Rodelas frescas', price: 8, scales: true, arrs: ['coroa', 'meialua', 'espalhado'], qty: true, unit: 1, craft: 'Limão siciliano em rodelas finas, secas no papel', prep: 0, tags: ['fruta', 'rustico'] },
  { id: 'maracuja', group: 'frutas', name: 'Maracujá', art: 'o', desc: 'Metades com a polpa à mostra', price: 10, scales: true, arrs: ['meialua', 'centro', 'coroa'], qty: true, unit: 3, craft: 'Maracujá azedo cortado ao meio na hora', prep: 0, tags: ['fruta', 'rustico'] },
  { id: 'coco', group: 'frutas', name: 'Coco em fitas', art: 'as', desc: 'Lascas de coco fresco', price: 8, scales: true, arrs: ['auto', 'centro', 'coroa', 'meialua'], qty: true, craft: 'Coco fresco em fitas, levemente tostadas nas bordas', prep: 0, tags: ['fruta', 'rustico'] },

  /* ── Flores ── */
  { id: 'flores', group: 'flores', name: 'Rosas de açúcar', art: 'as', desc: 'Modeladas à mão', price: 10, scales: true, arrs: ['auto', 'centro', 'coroa', 'meialua', 'cascata'], qty: true, colors: 'flor', color: '#e4607f', unit: 3, craft: 'Rosas modeladas em pasta de açúcar, pétala por pétala, secas por 24 h', prep: 24, tags: ['flor', 'romantico', 'casamento', 'elegante'], popular: true },
  { id: 'margaridas', group: 'flores', name: 'Margaridas', art: 'as', desc: 'Florzinhas de miolo amarelo', price: 9, scales: true, arrs: ['espalhado', 'coroa', 'meialua', 'cascata'], qty: true, colors: 'flor', color: '#ffffff', unit: 1.5, craft: 'Margaridas de pasta de açúcar cortadas no cortador, com miolo texturizado', prep: 24, tags: ['flor', 'rustico', 'infantil', 'bebe'] },
  { id: 'peonias', group: 'flores', name: 'Peônias', art: 'as', desc: 'Flores grandes e cheias', price: 14, scales: true, arrs: ['centro', 'meialua', 'cascata'], qty: true, colors: 'flor', color: '#f39fb2', unit: 6, craft: 'Peônias de pasta de goma, pétalas afinadas e montadas em camadas', prep: 24, tags: ['flor', 'romantico', 'casamento', 'elegante'] },
  { id: 'gipsofila', group: 'flores', name: 'Mosquitinho', art: 'o', desc: 'Raminhos de gipsofila', price: 9, scales: true, arrs: ['meialua', 'coroa', 'centro', 'cascata'], qty: true, unit: 1.5, craft: 'Ramos de gipsofila natural, com o cabo isolado em fita floral', prep: 0, tags: ['flor', 'rustico', 'casamento', 'romantico'], popular: true },
  { id: 'lavanda', group: 'flores', name: 'Lavanda', art: 'a', desc: 'Raminhos perfumados', price: 10, scales: true, arrs: ['meialua', 'coroa', 'centro'], qty: true, unit: 1.5, craft: 'Ramos de lavanda seca, com o cabo isolado', prep: 0, tags: ['flor', 'rustico', 'elegante'] },
  { id: 'eucalipto', group: 'flores', name: 'Eucalipto', art: 'o', desc: 'Raminhos de folhas redondas', price: 9, scales: true, arrs: ['meialua', 'coroa', 'cascata'], qty: true, unit: 1.8, craft: 'Ramos de eucalipto prateado, com o cabo isolado em fita floral', prep: 0, tags: ['flor', 'rustico', 'casamento', 'elegante'] },
  { id: 'prensadas', group: 'flores', name: 'Flores prensadas', art: 'as', desc: 'Coladas na cobertura, como um herbário', price: 16, scales: true, arrs: ['espalhado', 'lateral', 'cascata'], qty: true, unit: 2, craft: 'Flores comestíveis prensadas e secas, aplicadas uma a uma na cobertura', prep: 24, tags: ['flor', 'rustico', 'elegante', 'casamento'] },
  { id: 'suculentas', group: 'flores', name: 'Suculentas de buttercream', art: 'as', desc: 'Rosetas verdes modeladas no bico', price: 13, scales: true, arrs: ['centro', 'coroa', 'meialua'], qty: true, colors: 'verde', color: '#7fae8a', unit: 3.5, craft: 'Suculentas feitas no bico pétala sobre o prego de flor, geladas e transferidas', prep: 12, tags: ['flor', 'rustico', 'divertido'] },
  { id: 'girassois', group: 'flores', name: 'Girassóis', art: 'os', desc: 'De bico, com miolo de chocolate', price: 12, scales: true, arrs: ['centro', 'coroa', 'meialua'], qty: true, unit: 3.5, craft: 'Girassóis de buttercream no bico folha, com miolo de granulado', prep: 12, tags: ['flor', 'rustico', 'divertido'] },

  /* ── Chocolate ── */
  { id: 'raspas', group: 'chocolate', name: 'Raspas de chocolate', art: 'as', desc: 'Lascas e cachos de chocolate belga', price: 6, scales: true, arrs: ['auto', 'centro', 'coroa', 'meialua'], qty: true, craft: 'Chocolate belga temperado raspado na faca, em lascas e cachos', prep: 0, tags: ['chocolate', 'elegante'], popular: true },
  { id: 'bombons', group: 'chocolate', name: 'Bombons e trufas', art: 'os', desc: 'Chocolates sortidos', price: 14, scales: true, arrs: ['coroa', 'centro', 'meialua', 'espalhado'], qty: true, unit: 3, craft: 'Bombons moldados e trufas enroladas à mão', prep: 0, tags: ['chocolate', 'doce', 'romantico'], popular: true },
  { id: 'placas', group: 'chocolate', name: 'Placas de chocolate', art: 'as', desc: 'Lascas grandes fincadas no topo', price: 13, scales: true, arrs: ['centro', 'meialua', 'coroa'], qty: true, colors: 'choc', color: '#3a1a08', unit: 3, craft: 'Chocolate temperado espalhado fino e quebrado em placas irregulares', prep: 0, tags: ['chocolate', 'elegante', 'divertido'] },
  { id: 'esferas', group: 'chocolate', name: 'Esferas de chocolate', art: 'as', desc: 'Bolas ocas de vários tamanhos', price: 14, scales: true, arrs: ['centro', 'meialua', 'coroa', 'espalhado'], qty: true, colors: 'chocmetal', color: '#3a1a08', unit: 3, craft: 'Esferas ocas moldadas em chocolate temperado; as douradas levam pó comestível', prep: 12, tags: ['chocolate', 'elegante', 'brilho'] },
  { id: 'barras', group: 'chocolate', name: 'Tabletes de chocolate', art: 'os', desc: 'Pedaços de barra, em gomos', price: 10, scales: true, arrs: ['centro', 'meialua', 'coroa'], qty: true, colors: 'choc', color: '#6b3f22', unit: 2.5, craft: 'Barra de chocolate partida em pedaços de dois e três gomos', prep: 0, tags: ['chocolate', 'divertido'] },
  { id: 'conchaschoc', group: 'chocolate', name: 'Conchas de chocolate', art: 'as', desc: 'Moldadas, como as do mar', price: 12, scales: true, arrs: ['coroa', 'meialua', 'espalhado', 'centro'], qty: true, colors: 'choc', color: '#ffffff', unit: 2.5, craft: 'Conchas e búzios moldados em chocolate marmorizado', prep: 12, tags: ['chocolate', 'tematico', 'elegante'] },
  { id: 'gotas', group: 'chocolate', name: 'Gotas de chocolate', art: 'as', desc: 'Chips espalhados pelo bolo', price: 6, scales: true, arrs: ['espalhado'], qty: true, craft: 'Gotas de chocolate ao leite e meio amargo', prep: 0, tags: ['chocolate', 'divertido'] },
  { id: 'crocantes', group: 'chocolate', name: 'Bolinhas crocantes', art: 'as', desc: 'Cereal coberto de chocolate', price: 7, scales: true, arrs: ['espalhado'], qty: true, craft: 'Bolinhas de cereal cobertas de chocolate ao leite, branco e amargo', prep: 0, tags: ['chocolate', 'divertido'] },

  /* ── Docinhos ── */
  { id: 'macarons', group: 'doces', name: 'Macarons', art: 'os', desc: 'Casquinhas com recheio', price: 16, scales: true, arrs: ['coroa', 'meialua', 'centro', 'cascata'], qty: true, colors: 'pastel', color: '#f7b7c8', unit: 3.5, craft: 'Macarons de farinha de amêndoa com recheio de ganache, maturados por 24 h', prep: 24, tags: ['doce', 'elegante', 'romantico'], popular: true },
  { id: 'brigadeiros', group: 'doces', name: 'Brigadeiros', art: 'os', desc: 'Docinhos na forminha', price: 12, scales: true, arrs: ['coroa', 'centro', 'meialua'], qty: true, unit: 2.5, craft: 'Brigadeiros enrolados à mão no granulado belga, na forminha', prep: 0, tags: ['doce', 'chocolate', 'festa', 'infantil'], popular: true },
  { id: 'suspiros', group: 'doces', name: 'Suspiros', art: 'os', desc: 'Merengues crocantes', price: 8, scales: true, arrs: ['coroa', 'espalhado', 'meialua', 'centro'], qty: true, colors: 'pastel', color: '#ffffff', unit: 1.5, craft: 'Suspiros de merengue suíço secos no forno baixo', prep: 12, tags: ['doce', 'festa', 'bebe'] },
  { id: 'marshmallows', group: 'doces', name: 'Marshmallows', art: 'os', desc: 'Macios e coloridos', price: 7, scales: true, arrs: ['espalhado', 'centro', 'coroa'], qty: true, colors: 'pastel', color: '#f7b7c8', unit: 1.2, craft: 'Marshmallows grandes e mini', prep: 0, tags: ['doce', 'infantil', 'divertido'] },
  { id: 'biscoitos', group: 'doces', name: 'Biscoito recheado', art: 'os', desc: 'De chocolate com creme', price: 9, scales: true, arrs: ['coroa', 'meialua', 'centro'], qty: true, unit: 2, craft: 'Biscoitos de chocolate recheados, inteiros', prep: 0, tags: ['doce', 'chocolate', 'infantil', 'divertido'] },
  { id: 'wafer', group: 'doces', name: 'Cerca em volta do bolo', art: 'a', desc: 'Barrinhas, champanhe ou canudos', price: 22, scales: true, arrs: ['lateral'], kinds: [{ id: 'chocolate', name: 'Barrinhas de chocolate' }, { id: 'champanhe', name: 'Biscoito champanhe' }, { id: 'canudos', name: 'Canudos de wafer' }], craft: 'Peças coladas uma a uma na cobertura, em volta do bolo inteiro', prep: 0, tags: ['doce', 'chocolate', 'festa', 'divertido'], popular: true },
  { id: 'pirulitos', group: 'doces', name: 'Pirulitos', art: 'os', desc: 'Espirais coloridas no palito', price: 10, scales: false, arrs: ['palito'], qty: true, colors: 'pastel', color: '#f7b7c8', craft: 'Pirulitos de espiral no palito de papel', prep: 0, tags: ['doce', 'infantil', 'divertido', 'festa'] },
  { id: 'jujubas', group: 'doces', name: 'Jujubas', art: 'as', desc: 'Balas de goma açucaradas', price: 7, scales: true, arrs: ['coroa', 'espalhado', 'centro', 'meialua'], qty: true, unit: 0.6, craft: 'Balas de goma sortidas, passadas no açúcar cristal', prep: 0, tags: ['doce', 'infantil', 'divertido', 'festa'] },
  { id: 'donuts', group: 'doces', name: 'Mini donuts', art: 'os', desc: 'Com cobertura e granulado', price: 15, scales: true, arrs: ['coroa', 'centro', 'meialua'], qty: true, colors: 'pastel', color: '#f7b7c8', unit: 3.5, craft: 'Mini donuts assados, com glacê colorido e confeitos', prep: 12, tags: ['doce', 'infantil', 'divertido', 'festa'] },
  { id: 'cookies', group: 'doces', name: 'Cookies', art: 'os', desc: 'Com gotas de chocolate', price: 11, scales: true, arrs: ['coroa', 'centro', 'meialua'], qty: true, unit: 2.5, craft: 'Mini cookies de baunilha com gotas de chocolate', prep: 12, tags: ['doce', 'chocolate', 'divertido', 'rustico'] },
  { id: 'pipoca', group: 'doces', name: 'Pipoca caramelizada', art: 'a', desc: 'Um monte dourado e crocante', price: 9, scales: true, arrs: ['centro', 'meialua', 'coroa'], qty: true, craft: 'Pipoca estourada na hora e caramelizada no ponto de bala', prep: 0, tags: ['doce', 'divertido', 'festa', 'junino'] },
  { id: 'casquinha', group: 'doces', name: 'Casquinha derretendo', art: 'a', desc: 'Sorvete caído de ponta-cabeça', price: 14, scales: false, arrs: ['centro'], colors: 'pastel', color: '#f7b7c8', craft: 'Bola de massa de bolo com cobertura (cake pop grande) sob uma casquinha de wafer, com cobertura escorrida', prep: 12, tags: ['doce', 'divertido', 'infantil', 'festa'] },
  { id: 'pacoca', group: 'doces', name: 'Paçoquinhas', art: 'as', desc: 'Rolhas de amendoim', price: 8, scales: true, arrs: ['coroa', 'centro', 'meialua'], qty: true, unit: 1.5, craft: 'Paçocas tipo rolha, inteiras', prep: 0, tags: ['doce', 'junino', 'rustico'] },
  { id: 'cakepops', group: 'doces', name: 'Cake pops', art: 'os', desc: 'Bolinhas de bolo no palito', price: 14, scales: false, arrs: ['palito'], qty: true, colors: 'pastel', color: '#f7b7c8', craft: 'Bolinhas de massa de bolo banhadas em chocolate colorido, com confeitos', prep: 12, tags: ['doce', 'infantil', 'divertido', 'festa'] },
  { id: 'pastilhas', group: 'doces', name: 'Confeitos de chocolate', art: 'os', desc: 'Pastilhas coloridas', price: 7, scales: true, arrs: ['espalhado'], qty: true, craft: 'Pastilhas de chocolate confeitadas, sortidas', prep: 0, tags: ['doce', 'chocolate', 'infantil', 'divertido'] },
  { id: 'bengalinhas', group: 'doces', name: 'Bengalinhas doces', art: 'as', desc: 'Listradas de vermelho e branco', price: 9, scales: false, arrs: ['centro', 'meialua'], qty: true, unit: 2, craft: 'Bengalinhas de açúcar listradas', prep: 0, tags: ['doce', 'natal', 'divertido'] },
  { id: 'canudos', group: 'doces', name: 'Canudos de wafer', art: 'os', desc: 'Fincados no topo, em feixe', price: 9, scales: false, arrs: ['centro', 'meialua'], qty: true, unit: 1.5, craft: 'Canudinhos de wafer recheados, listrados', prep: 0, tags: ['doce', 'chocolate', 'divertido'] },
  { id: 'ovinhos', group: 'doces', name: 'Ovinhos de chocolate', art: 'os', desc: 'Coloridos e salpicados', price: 10, scales: true, arrs: ['centro', 'coroa', 'espalhado', 'meialua'], qty: true, unit: 1.2, craft: 'Mini ovos de chocolate confeitados em tons pastel, salpicados', prep: 0, tags: ['doce', 'chocolate', 'pascoa', 'infantil'] },

  /* ── Brilho ── */
  { id: 'granulado', group: 'brilho', name: 'Granulado', art: 'o', desc: 'Chocolate belga crocante', price: 5, scales: true, arrs: ['espalhado'], qty: true, craft: 'Granulado de chocolate belga', prep: 0, tags: ['chocolate', 'festa', 'infantil'], popular: true },
  { id: 'confete', group: 'brilho', name: 'Confete colorido', art: 'o', desc: 'Para deixar a festa mais alegre', price: 6, scales: true, arrs: ['espalhado'], qty: true, craft: 'Confeitos de açúcar coloridos', prep: 0, tags: ['festa', 'infantil', 'divertido'], popular: true },
  { id: 'perolas', group: 'brilho', name: 'Pérolas de açúcar', art: 'as', desc: 'Peroladas e douradas', price: 7, scales: true, arrs: ['espalhado'], qty: true, craft: 'Pérolas de açúcar peroladas e douradas, aplicadas com pinça', prep: 0, tags: ['brilho', 'elegante', 'casamento'], popular: true },
  { id: 'ouro', group: 'brilho', name: 'Folha de ouro', art: 'a', desc: 'Lâminas de ouro comestível', price: 15, scales: true, arrs: ['espalhado', 'coroa', 'cascata'], qty: true, craft: 'Folha de ouro comestível 23 quilates, aplicada com pincel seco', prep: 0, tags: ['brilho', 'elegante', 'casamento'] },
  { id: 'glitter', group: 'brilho', name: 'Glitter comestível', art: 'o', desc: 'Brilho fino por cima de tudo', price: 6, scales: true, arrs: ['espalhado'], qty: true, colors: 'metal', color: '#dcae52', craft: 'Pó cintilante comestível, aplicado com bombinha', prep: 0, tags: ['brilho', 'festa', 'elegante'] },
  { id: 'metalicos', group: 'brilho', name: 'Confeitos metálicos', art: 'os', desc: 'Bolinhas e bastões prateados e dourados', price: 8, scales: true, arrs: ['espalhado'], qty: true, craft: 'Confeitos metalizados sortidos (bolinhas e bastões), aplicados com pinça', prep: 0, tags: ['brilho', 'elegante', 'festa'] },
  { id: 'estrelinhas', group: 'brilho', name: 'Estrelinhas', art: 'as', desc: 'Confeitos em forma de estrela', price: 7, scales: true, arrs: ['espalhado'], qty: true, colors: 'metal', color: '#dcae52', craft: 'Confeitos de açúcar em estrela', prep: 0, tags: ['brilho', 'festa', 'infantil', 'natal'] },
  { id: 'micangas', group: 'brilho', name: 'Miçangas', art: 'as', desc: 'Bolinhas miúdas de açúcar', price: 5, scales: true, arrs: ['espalhado'], qty: true, colors: 'pastel', color: '#ffffff', craft: 'Miçangas de açúcar', prep: 0, tags: ['brilho', 'bebe', 'divertido'] },
  { id: 'espelhadas', group: 'brilho', name: 'Bolas espelhadas', art: 'as', desc: 'Esferas metalizadas de vários tamanhos', price: 12, scales: false, arrs: ['meialua', 'centro', 'coroa', 'espalhado'], qty: true, colors: 'metal', color: '#dcae52', unit: 1.5, craft: 'Bolas metalizadas decorativas (não comestíveis), fixadas no palito', prep: 0, tags: ['brilho', 'elegante', 'festa'], popular: true },

  /* ── Festa e papel ── */
  { id: 'velas', group: 'festa', name: 'Velas', art: 'as', desc: 'Clássicas, longas, de número ou faísca', price: 8, scales: false, arrs: ['auto'], craft: 'Velas de aniversário', prep: 0, tags: ['festa', 'infantil'], popular: true },
  { id: 'topo', group: 'festa', name: 'Topo de estrelas', art: 'o', desc: 'Estrelas douradas no palito', price: 8, scales: false, arrs: ['palito'], craft: 'Estrelas de papel glitter dourado no palito', prep: 0, tags: ['papel', 'brilho', 'festa'], popular: true },
  { id: 'baloes', group: 'festa', name: 'Balões no palito', art: 'os', desc: 'Mini balões coloridos', price: 12, scales: false, arrs: ['palito'], qty: true, colors: 'pastel', color: '#d96b82', craft: 'Mini balões de látex de 5 polegadas no palito', prep: 0, tags: ['papel', 'festa', 'infantil', 'divertido'], popular: true },
  { id: 'lacos', group: 'festa', name: 'Laço', art: 'o', desc: 'Laço de açúcar na frente do bolo', price: 9, scales: false, arrs: ['frente', 'centro'], colors: 'pastel', color: '#d96b82', craft: 'Laço modelado em pasta de açúcar, seco por 24 h', prep: 24, tags: ['romantico', 'bebe', 'elegante'] },
  { id: 'coracoes', group: 'festa', name: 'Corações', art: 'os', desc: 'De açúcar, espalhados ou no palito', price: 8, scales: true, arrs: ['espalhado', 'palito', 'coroa'], qty: true, colors: 'pastel', color: '#d96b82', unit: 1, craft: 'Corações de pasta de açúcar cortados no cortador', prep: 12, tags: ['romantico', 'festa'] },
  { id: 'borboletas', group: 'festa', name: 'Borboletas', art: 'as', desc: 'Pousadas no bolo', price: 10, scales: true, arrs: ['cascata', 'espalhado', 'coroa'], qty: true, colors: 'pastel', color: '#f7b7c8', unit: 2, craft: 'Borboletas de papel de arroz impresso, com as asas dobradas', prep: 0, tags: ['papel', 'romantico', 'infantil', 'bebe'], popular: true },
  { id: 'fita', group: 'festa', name: 'Fita de cetim', art: 'a', desc: 'Em volta do bolo, com lacinho', price: 7, scales: false, arrs: ['lateral'], colors: 'fita', color: '#d96b82', craft: 'Fita de cetim de 25 mm em volta de cada andar, com laço na frente', prep: 0, tags: ['elegante', 'romantico', 'casamento', 'bebe'] },
  { id: 'bandeirolas', group: 'festa', name: 'Bandeirolas', art: 'as', desc: 'Varal de bandeirinhas sobre o bolo', price: 10, scales: false, arrs: ['fundo'], colors: 'festa', color: '#d96b82', kinds: [{ id: 'triangulo', name: 'Triangulares' }, { id: 'junina', name: 'De festa junina' }], craft: 'Bandeirinhas de papel coladas no barbante, entre dois palitos', prep: 0, tags: ['papel', 'festa', 'infantil', 'junino'], popular: true },
  { id: 'leques', group: 'festa', name: 'Leques de papel', art: 'os', desc: 'Rosetas plissadas no palito', price: 11, scales: false, arrs: ['palito'], qty: true, colors: 'festa', color: '#d96b82', craft: 'Leques de papel plissado montados no palito', prep: 0, tags: ['papel', 'festa', 'divertido'] },
  { id: 'catavento', group: 'festa', name: 'Cata-ventos', art: 'os', desc: 'De papel, no palito', price: 10, scales: false, arrs: ['palito'], qty: true, colors: 'festa', color: '#6fb6f2', craft: 'Cata-ventos de papel dupla face no palito', prep: 0, tags: ['papel', 'infantil', 'divertido', 'festa'] },
  { id: 'pompons', group: 'festa', name: 'Pompons', art: 'os', desc: 'Bolas de papel colmeia no palito', price: 11, scales: false, arrs: ['palito'], qty: true, colors: 'festa', color: '#d96b82', craft: 'Mini bolas de papel colmeia no palito', prep: 0, tags: ['papel', 'festa', 'divertido', 'infantil'] },
  { id: 'luanuvens', group: 'festa', name: 'Lua e nuvens', art: 'a', desc: 'Lua, nuvens e estrelinhas no palito', price: 14, scales: false, arrs: ['fundo'], colors: 'metal', color: '#dcae52', craft: 'Recortes em papel perolado e glitter, montados no palito', prep: 0, tags: ['papel', 'bebe', 'infantil', 'brilho'] },
  { id: 'arcoiris', group: 'festa', name: 'Arco-íris', art: 'o', desc: 'De pasta de açúcar, com nuvens nos pés', price: 16, scales: false, arrs: ['fundo', 'centro'], craft: 'Arcos de pasta de açúcar em tons pastel, secos por 48 h, com nuvens modeladas', prep: 48, tags: ['infantil', 'bebe', 'divertido', 'tematico'], popular: true },
  { id: 'coroa', group: 'festa', name: 'Coroa', art: 'a', desc: 'Dourada, no alto do bolo', price: 15, scales: false, arrs: ['centro'], colors: 'metal', color: '#dcae52', craft: 'Coroa de pasta de goma pintada com pó metálico comestível, seca por 48 h', prep: 48, tags: ['tematico', 'infantil', 'brilho', 'elegante'] },
  { id: 'nuvens', group: 'festa', name: 'Nuvens', art: 'as', desc: 'Fofinhas, de pasta de açúcar', price: 9, scales: true, arrs: ['espalhado', 'lateral', 'coroa'], qty: true, unit: 1.8, craft: 'Nuvens modeladas em pasta de açúcar branca', prep: 12, tags: ['infantil', 'bebe', 'divertido'] },

  /* ── Temáticos ── */
  { id: 'chifre', group: 'tematico', name: 'Chifre de unicórnio', art: 'o', desc: 'Chifre dourado e duas orelhas', price: 18, scales: false, arrs: ['centro', 'fundo'], craft: 'Chifre torcido e orelhas em pasta de goma, pintados com pó dourado e secos por 48 h', prep: 48, tags: ['tematico', 'infantil', 'divertido', 'brilho'], popular: true },
  { id: 'cilios', group: 'tematico', name: 'Cílios', art: 'os', desc: 'Olhinhos fechados na frente do bolo', price: 6, scales: false, arrs: ['frente'], craft: 'Cílios recortados em pasta de açúcar preta', prep: 12, tags: ['tematico', 'infantil', 'divertido'] },
  { id: 'crina', group: 'tematico', name: 'Crina de rosetas', art: 'a', desc: 'Rosetas e pitangas coloridas em cascata', price: 14, scales: true, arrs: ['cascata', 'meialua', 'coroa'], qty: true, colors: 'pastel', color: '#f7b7c8', craft: 'Rosetas, pitangas e pingos de buttercream em três cores, aplicados em cascata', prep: 0, tags: ['tematico', 'infantil', 'divertido', 'romantico'] },
  { id: 'orelhasurso', group: 'tematico', name: 'Orelhas de ursinho', art: 'as', desc: 'Duas orelhas redondas no alto', price: 10, scales: false, arrs: ['fundo'], colors: 'choc', color: '#b9772c', craft: 'Orelhas modeladas em pasta de açúcar, secas por 24 h', prep: 24, tags: ['tematico', 'infantil', 'bebe'] },
  { id: 'carinhaurso', group: 'tematico', name: 'Carinha de ursinho', art: 'a', desc: 'Focinho, nariz e olhinhos na frente', price: 9, scales: false, arrs: ['frente'], craft: 'Focinho, nariz e olhos aplicados em pasta de açúcar', prep: 12, tags: ['tematico', 'infantil', 'bebe'] },
  { id: 'orelhascoelho', group: 'tematico', name: 'Orelhas de coelho', art: 'as', desc: 'Compridas, com o miolo rosado', price: 12, scales: false, arrs: ['fundo'], craft: 'Orelhas de pasta de goma com arame interno isolado, secas por 48 h', prep: 48, tags: ['tematico', 'infantil', 'pascoa', 'bebe'] },
  { id: 'sereia', group: 'tematico', name: 'Cauda de sereia', art: 'a', desc: 'Saindo do bolo, com escamas', price: 18, scales: false, arrs: ['centro', 'fundo'], colors: 'pastel', color: '#b8dcff', craft: 'Cauda modelada em pasta de goma com escamas marcadas e pó perolado, seca por 48 h', prep: 48, tags: ['tematico', 'infantil', 'brilho'] },
  { id: 'estrelasdomar', group: 'tematico', name: 'Estrelas-do-mar', art: 'as', desc: 'De pasta de açúcar', price: 9, scales: true, arrs: ['espalhado', 'coroa', 'meialua'], qty: true, unit: 1.8, craft: 'Estrelas-do-mar modeladas em pasta de açúcar e texturizadas', prep: 12, tags: ['tematico', 'infantil', 'divertido'] },
  { id: 'planetas', group: 'tematico', name: 'Planetas', art: 'os', desc: 'No palito, com anéis e listras', price: 14, scales: false, arrs: ['palito'], qty: true, craft: 'Planetas de pasta de açúcar marmorizada no palito', prep: 24, tags: ['tematico', 'infantil', 'divertido'] },
  { id: 'foguete', group: 'tematico', name: 'Foguete', art: 'o', desc: 'Decolando do bolo', price: 15, scales: false, arrs: ['centro', 'fundo'], craft: 'Foguete modelado em pasta de açúcar sobre base de isopor forrado', prep: 48, tags: ['tematico', 'infantil', 'divertido'] },
  { id: 'bola', group: 'tematico', name: 'Bola de futebol', art: 'a', desc: 'No centro do gramado', price: 14, scales: false, arrs: ['centro'], craft: 'Bola de chocolate oca forrada com gomos de pasta de açúcar', prep: 24, tags: ['tematico', 'infantil', 'divertido'], popular: true },
  { id: 'capelo', group: 'tematico', name: 'Capelo e diploma', art: 'o', desc: 'Para a formatura', price: 16, scales: false, arrs: ['centro'], craft: 'Capelo e canudo modelados em pasta de açúcar, com borla de fio', prep: 24, tags: ['tematico', 'formatura', 'elegante'] },
  { id: 'cubos', group: 'tematico', name: 'Cubos de letras', art: 'os', desc: 'Bloquinhos de brinquedo', price: 12, scales: false, arrs: ['centro', 'meialua'], qty: true, unit: 4, craft: 'Cubos de pasta de açúcar com letras aplicadas', prep: 24, tags: ['tematico', 'bebe', 'infantil'] },
  { id: 'cruz', group: 'tematico', name: 'Cruz', art: 'a', desc: 'Dourada, no alto do bolo', price: 12, scales: false, arrs: ['fundo', 'centro'], colors: 'metal', color: '#dcae52', craft: 'Cruz de pasta de goma pintada com pó metálico, no palito', prep: 24, tags: ['tematico', 'elegante', 'bebe'] },
  { id: 'aliancas', group: 'tematico', name: 'Alianças', art: 'as', desc: 'Duas alianças entrelaçadas', price: 12, scales: false, arrs: ['centro'], colors: 'metal', color: '#dcae52', craft: 'Alianças de pasta de goma pintadas com pó metálico', prep: 24, tags: ['tematico', 'casamento', 'elegante', 'romantico'] },
  { id: 'cogumelos', group: 'tematico', name: 'Cogumelos', art: 'os', desc: 'De chapéu vermelho com pintinhas', price: 10, scales: true, arrs: ['coroa', 'centro', 'espalhado', 'meialua'], qty: true, unit: 2, craft: 'Cogumelos modelados em pasta de açúcar', prep: 12, tags: ['tematico', 'infantil', 'divertido', 'rustico'] },
  { id: 'joaninhas', group: 'tematico', name: 'Joaninhas', art: 'as', desc: 'Passeando pelo bolo', price: 8, scales: true, arrs: ['espalhado', 'lateral'], qty: true, unit: 1.5, craft: 'Joaninhas modeladas em pasta de açúcar', prep: 12, tags: ['tematico', 'infantil', 'divertido'] },
  { id: 'dinos', group: 'tematico', name: 'Dinossauros', art: 'os', desc: 'Silhuetas no palito', price: 12, scales: false, arrs: ['palito'], qty: true, colors: 'verde', color: '#5f8f6a', craft: 'Silhuetas recortadas em papel de alta gramatura, no palito', prep: 0, tags: ['tematico', 'infantil', 'papel', 'divertido'] },
  { id: 'folhastropicais', group: 'tematico', name: 'Folhas tropicais', art: 'as', desc: 'Costela-de-adão e palmeira', price: 10, scales: false, arrs: ['palito', 'lateral'], qty: true, craft: 'Folhas recortadas em papel verde de dois tons, no palito', prep: 0, tags: ['tematico', 'papel', 'rustico', 'infantil'] },
  { id: 'pegadas', group: 'tematico', name: 'Pegadas', art: 'as', desc: 'Patinhas subindo pela lateral', price: 7, scales: true, arrs: ['lateral', 'espalhado'], qty: true, colors: 'choc', color: '#3a1a08', unit: 1, craft: 'Pegadas recortadas em pasta de açúcar', prep: 12, tags: ['tematico', 'infantil', 'divertido'] },
  { id: 'chapeupalha', group: 'tematico', name: 'Chapéu de palha', art: 'o', desc: 'De festa junina, com fita xadrez', price: 13, scales: false, arrs: ['centro'], craft: 'Mini chapéu de palha decorativo com fita', prep: 0, tags: ['tematico', 'junino', 'divertido', 'rustico'] },
  { id: 'azevinho', group: 'tematico', name: 'Azevinho', art: 'o', desc: 'Folhas verdes e bolinhas vermelhas', price: 9, scales: true, arrs: ['coroa', 'espalhado', 'meialua'], qty: true, unit: 1.8, craft: 'Folhas e frutinhas de azevinho em pasta de açúcar', prep: 12, tags: ['tematico', 'natal'] },
  { id: 'pinheirinhos', group: 'tematico', name: 'Pinheirinhos', art: 'os', desc: 'De bico, com estrela na ponta', price: 12, scales: true, arrs: ['centro', 'meialua', 'coroa'], qty: true, unit: 3.5, craft: 'Cones de wafer cobertos de buttercream verde no bico pitanga, com estrela de açúcar', prep: 12, tags: ['tematico', 'natal', 'divertido'] },
  { id: 'flocos', group: 'tematico', name: 'Flocos de neve', art: 'os', desc: 'Recortes brancos, delicados', price: 9, scales: true, arrs: ['espalhado', 'lateral'], qty: true, unit: 1.2, craft: 'Flocos de neve recortados em pasta de açúcar com ejetor', prep: 12, tags: ['tematico', 'natal', 'elegante'] },
  { id: 'cenourinhas', group: 'tematico', name: 'Cenourinhas', art: 'as', desc: 'De pasta de açúcar', price: 8, scales: true, arrs: ['coroa', 'espalhado', 'meialua'], qty: true, unit: 1.5, craft: 'Cenourinhas modeladas em pasta de açúcar', prep: 12, tags: ['tematico', 'pascoa', 'infantil', 'divertido'] },
  { id: 'fantasmas', group: 'tematico', name: 'Fantasminhas', art: 'os', desc: 'De suspiro, com olhinhos', price: 9, scales: true, arrs: ['coroa', 'centro', 'meialua', 'espalhado'], qty: true, unit: 1.8, craft: 'Suspiros em forma de fantasma, com olhos de chocolate', prep: 12, tags: ['tematico', 'halloween', 'infantil', 'divertido'] },
  { id: 'aboboras', group: 'tematico', name: 'Abóboras', art: 'as', desc: 'Miniaturas de pasta de açúcar', price: 10, scales: true, arrs: ['coroa', 'centro', 'meialua', 'espalhado'], qty: true, unit: 2, craft: 'Mini abóboras modeladas em pasta de açúcar', prep: 12, tags: ['tematico', 'halloween', 'rustico', 'divertido'] },
  { id: 'morcegos', group: 'tematico', name: 'Morcegos', art: 'os', desc: 'Silhuetas pretas voando', price: 9, scales: false, arrs: ['palito', 'lateral'], qty: true, craft: 'Morcegos recortados em papel preto, no palito ou colados na lateral', prep: 0, tags: ['tematico', 'halloween', 'papel', 'divertido'] },
];

/** Estilos de vela. count = a pessoa escolhe quantas · colors = aceita paleta (CANDLE_PALETTES). */
export const CANDLE_STYLES = [
  { id: 'classica', name: 'Clássicas', desc: 'Listradas, você escolhe quantas', price: 0, count: true, colors: true, craft: 'Velas de parafina listradas', prep: 0, tags: ['festa', 'infantil'], popular: true },
  { id: 'longa', name: 'Longas', desc: 'Altas e fininhas', price: 4, count: true, colors: true, craft: 'Velas longas de 15 cm, finas', prep: 0, tags: ['festa', 'elegante'] },
  { id: 'espiral', name: 'Espiral', desc: 'Torcidas, bem charmosas', price: 4, count: true, colors: true, craft: 'Velas torcidas em espiral', prep: 0, tags: ['festa', 'vintage', 'divertido'] },
  { id: 'numero', name: 'De número', desc: 'A idade em velas douradas', price: 6, craft: 'Velas de número metalizadas', prep: 0, tags: ['festa'], popular: true },
  { id: 'letras', name: 'De letras', desc: 'PARABÉNS, letra por letra', price: 9, craft: 'Velas em forma de letra, no palito', prep: 0, tags: ['festa', 'divertido'] },
  { id: 'estrela', name: 'Estrelas', desc: 'Velinhas em forma de estrela', price: 6, count: true, craft: 'Velas em forma de estrela, no palito', prep: 0, tags: ['festa', 'brilho', 'infantil'] },
  { id: 'faisca', name: 'Faísca', desc: 'Vela vulcão que solta estrelinhas', price: 9, craft: 'Vela vulcão de festa (uso sob supervisão de um adulto)', prep: 0, tags: ['festa', 'brilho'], popular: true },
];

/** Paletas das velas (as clássicas, as longas e as de espiral). */
export const CANDLE_PALETTES = [
  { id: 'colorida', name: 'Coloridas', hexes: ['#f08fb0', '#f6c453', '#6fcfa8', '#6fb6f2', '#b497f0'] },
  { id: 'pastel', name: 'Pastel', hexes: ['#f9c9d6', '#fde6b0', '#c9ecd6', '#c8e0fa', '#dccdf7'] },
  { id: 'arcoiris', name: 'Arco-íris', hexes: ['#e8504f', '#f4973b', '#f7d24a', '#59b66d', '#4a90d9', '#8a63c9'] },
  { id: 'dourada', name: 'Douradas', hexes: ['#dcae52'], metal: true },
  { id: 'prateada', name: 'Prateadas', hexes: ['#cfd3da'], metal: true },
  { id: 'rose', name: 'Rosé', hexes: ['#e8a5a0'], metal: true },
  { id: 'branca', name: 'Brancas', hexes: ['#fbf7f0'] },
  { id: 'rosa', name: 'Rosa', hexes: ['#f08fb0', '#f9c9d6'] },
  { id: 'azul', name: 'Azul', hexes: ['#6fb6f2', '#c8e0fa'] },
];
/** O que as velas de letras escrevem. */
export const CANDLE_WORD = 'PARABÉNS';

/** Letra da mensagem escrita com bico no topo. */
export const SCRIPTS = [
  { id: 'cursiva', name: 'Cursiva', craft: 'Letra cursiva com bico perlê nº 2' },
  { id: 'bastao', name: 'Bastão', craft: 'Letra de forma fina com bico perlê nº 2' },
  { id: 'gordinha', name: 'Gordinha', craft: 'Letra de forma arredondada com bico perlê nº 4' },
  { id: 'classica', name: 'Clássica', craft: 'Letra serifada inclinada com bico perlê nº 1' },
];

/**
 * Desenhos de bentô: traços simples feitos com o mesmo bico da escrita.
 * (Cadastrados, mas DESLIGADOS — active: false — até o desenho 3D deles ficar pronto: não aparecem no painel.)
 */
export const DOODLES = [
  { id: '', name: 'Sem desenho' },
  { id: 'coracao', name: 'Coração', craft: 'Coração em traço de bico', active: false },
  { id: 'flor', name: 'Florzinha', craft: 'Flor de cinco pétalas em traço de bico', active: false },
  { id: 'estrela', name: 'Estrela', craft: 'Estrela em traço de bico', active: false },
  { id: 'carinha', name: 'Carinha', craft: 'Carinha sorrindo em traço de bico', active: false },
];

/** Formato da plaquinha de mensagem. (Só o retângulo está ligado; os outros esperam o desenho 3D.) */
export const PLAQUE_SHAPES = [
  { id: 'retangulo', name: 'Retângulo', craft: 'Plaquinha retangular de pasta de açúcar, no palito' },
  { id: 'coracao', name: 'Coração', craft: 'Plaquinha em coração de pasta de açúcar, no palito', active: false },
  { id: 'nuvem', name: 'Nuvem', craft: 'Plaquinha em nuvem de pasta de açúcar, no palito', active: false },
  { id: 'faixa', name: 'Faixa', craft: 'Faixa de pasta de açúcar com as pontas em V, entre dois palitos', active: false },
];

/** Estilos do topo personalizado. (Só "Nome" está ligado; os outros esperam o desenho 3D.) */
export const TOPPER_STYLES = [
  { id: 'nome', name: 'Nome', desc: 'Recortado, no palito', craft: 'Nome recortado a laser, no palito' },
  { id: 'aro', name: 'No aro', desc: 'Dentro de um aro', craft: 'Nome recortado dentro de um aro, no palito', active: false },
  { id: 'coracao', name: 'Coração', desc: 'Dentro de um coração', craft: 'Nome recortado dentro de um contorno de coração, no palito', active: false },
  { id: 'estrela', name: 'Estrela', desc: 'Com estrelinhas', craft: 'Nome recortado com estrelas, no palito', active: false },
  { id: 'idade', name: 'Idade grande', desc: 'Número em destaque', craft: 'Número grande recortado, no palito', active: false },
];

/** Acabamentos do topo personalizado. */
export const TOPPER_COLORS = [
  { hex: '#dcae52', name: 'Dourado' },
  { hex: '#cfd3da', name: 'Prateado' },
  { hex: '#1d1a1c', name: 'Preto' },
  { hex: '#e8a5a0', name: 'Rosé' },
];
/** Material do topo personalizado. */
export const TOPPER_FINISHES = [
  { id: 'acrilico', name: 'Acrílico espelhado', craft: 'Acrílico espelhado de 2 mm' },
  { id: 'glitter', name: 'Papel com glitter', craft: 'Papel glitter de alta gramatura, dupla face' },
  { id: 'madeira', name: 'Madeira', craft: 'MDF de 3 mm cortado a laser' },
];

/** Sugestões rápidas de mensagem para a plaquinha. */
export const MESSAGE_IDEAS = ['Parabéns!', 'Feliz aniversário', 'Te amo', 'Felicidades', 'Bem-vindo, bebê', 'Feliz Natal', 'Feliz Páscoa', 'Mãe, te amo', 'Viva São João', 'Boas festas'];

/**
 * Temas prontos: conjuntos de peças já compostas, que a pessoa aplica com um toque e depois ajusta.
 * Sempre genéricos (nunca personagens nem marcas). apply = o que o tema põe no bolo:
 *   decor   { items, opts, candles, candleStyle, candlePalette, message… } — troca as decorações do bolo
 *   piping  { style, where, color } — troca o bico · cover { color } — sugere a cor da cobertura (opcional)
 * O preço é o das peças: o que não couber no bolo escolhido não é cobrado, como em qualquer decoração.
 */
export const THEMES = [
  { id: 'unicornio', name: 'Unicórnio', desc: 'Chifre dourado, crina de rosetas e cílios', tags: ['tematico', 'infantil', 'divertido'], popular: true, colors: ['#ffffff', '#f7b7c8', '#dcae52'], apply: { cover: { color: '#ffffff' }, piping: { style: 'liso' }, decor: { items: ['chifre', 'crina', 'cilios', 'estrelinhas'], opts: { chifre: { arr: 'centro' }, crina: { arr: 'cascata', color: '#f7b7c8' } } } } },
  { id: 'mar', name: 'Fundo do mar', desc: 'Cauda de sereia, conchas e pérolas', tags: ['tematico', 'infantil'], colors: ['#b8dcff', '#d9c2ff', '#ffffff'], apply: { cover: { color: '#9bd4ff' }, piping: { style: 'escamas', color: '#b8dcff' }, decor: { items: ['sereia', 'conchaschoc', 'estrelasdomar', 'perolas'], opts: { sereia: { arr: 'fundo' }, conchaschoc: { arr: 'meialua' }, estrelasdomar: { arr: 'espalhado', qty: 'pouco' } } } } },
  { id: 'safari', name: 'Safári', desc: 'Folhas tropicais e pegadas', tags: ['tematico', 'infantil', 'rustico'], colors: ['#f2e4c7', '#2d8b4a', '#6b3f22'], apply: { cover: { color: '#f2e4c7' }, piping: { style: 'grama', where: 'base', color: '#2d8b4a' }, decor: { items: ['folhastropicais', 'pegadas', 'raspas'], opts: { folhastropicais: { arr: 'palito' }, pegadas: { arr: 'lateral' }, raspas: { arr: 'meialua' } } } } },
  { id: 'espaco', name: 'Espaço', desc: 'Planetas, foguete e estrelas', tags: ['tematico', 'infantil', 'divertido'], colors: ['#1a4a8b', '#dcae52', '#ffffff'], apply: { cover: { color: '#1a4a8b' }, piping: { style: 'liso' }, decor: { items: ['foguete', 'planetas', 'estrelinhas', 'topo'], opts: { foguete: { arr: 'centro' }, estrelinhas: { color: '#dcae52' } } } } },
  { id: 'jardim', name: 'Jardim encantado', desc: 'Cogumelos, joaninhas e margaridas', tags: ['tematico', 'infantil', 'flor'], colors: ['#a8f0c6', '#8b1a1a', '#ffffff'], apply: { cover: { color: '#ffffff' }, piping: { style: 'grama', where: 'base', color: '#2d8b4a' }, decor: { items: ['cogumelos', 'joaninhas', 'margaridas', 'borboletas'], opts: { cogumelos: { arr: 'meialua' }, joaninhas: { arr: 'espalhado', qty: 'pouco' }, margaridas: { arr: 'cascata' }, borboletas: { arr: 'espalhado', qty: 'pouco' } } } } },
  { id: 'futebol', name: 'Futebol', desc: 'Bola no gramado de bico', tags: ['tematico', 'infantil', 'divertido'], popular: true, colors: ['#2d8b4a', '#ffffff', '#1d1a1c'], apply: { cover: { color: '#ffffff' }, piping: { style: 'grama', where: 'cobre', color: '#2d8b4a' }, decor: { items: ['bola', 'fita'], opts: { bola: { arr: 'centro' }, fita: { color: '#2d8b4a' } } } } },
  { id: 'dinos', name: 'Dinossauros', desc: 'Silhuetas, folhas e ovinhos', tags: ['tematico', 'infantil', 'divertido'], colors: ['#a8f0c6', '#5f8f6a', '#f2e4c7'], apply: { cover: { color: '#f2e4c7' }, piping: { style: 'grama', where: 'base', color: '#2d8b4a' }, decor: { items: ['dinos', 'folhastropicais', 'ovinhos', 'pegadas'], opts: { folhastropicais: { arr: 'lateral' }, ovinhos: { arr: 'meialua' }, pegadas: { arr: 'espalhado', qty: 'pouco' } } } } },
  { id: 'ursinho', name: 'Ursinho', desc: 'Orelhinhas no alto e carinha na frente', tags: ['tematico', 'bebe', 'infantil'], popular: true, colors: ['#b9772c', '#f2e4c7', '#6b3f22'], apply: { cover: { color: '#b9772c' }, piping: { style: 'liso' }, decor: { items: ['orelhasurso', 'carinhaurso', 'baloes'], opts: { baloes: { color: '#f2e4c7', qty: 'pouco' } } } } },
  { id: 'nuvens', name: 'Nuvens e arco-íris', desc: 'Arco-íris de açúcar, nuvens e estrelas', tags: ['tematico', 'bebe', 'infantil'], popular: true, colors: ['#ffffff', '#b8dcff', '#f7b7c8'], apply: { cover: { color: '#ffffff' }, piping: { style: 'bolinhas', where: 'base', color: '#ffffff' }, decor: { items: ['arcoiris', 'nuvens', 'estrelinhas'], opts: { arcoiris: { arr: 'fundo' }, nuvens: { arr: 'lateral' }, estrelinhas: { color: '#dcae52' } } } } },
  { id: 'princesa', name: 'Princesa', desc: 'Coroa dourada, rosas e borboletas', tags: ['tematico', 'infantil', 'romantico'], colors: ['#f7d3dc', '#dcae52', '#ffffff'], apply: { cover: { color: '#f7d3dc' }, piping: { style: 'perolao', where: 'both', color: '#ffffff' }, decor: { items: ['coroa', 'flores', 'borboletas', 'perolas'], opts: { coroa: { color: '#dcae52' }, flores: { arr: 'cascata', color: '#f39fb2' }, borboletas: { arr: 'cascata', qty: 'pouco' } } } } },
  { id: 'principe', name: 'Príncipe', desc: 'Coroa, estrelas e azul-marinho', tags: ['tematico', 'infantil', 'elegante'], colors: ['#1a4a8b', '#dcae52', '#ffffff'], apply: { cover: { color: '#1a4a8b' }, piping: { style: 'perolao', where: 'both', color: '#ffffff' }, decor: { items: ['coroa', 'estrelinhas', 'fita'], opts: { coroa: { color: '#dcae52' }, estrelinhas: { color: '#dcae52' }, fita: { color: '#dcae52' } } } } },
  { id: 'junina', name: 'Festa junina', desc: 'Bandeirinhas, chapéu de palha e paçoca', tags: ['tematico', 'junino', 'divertido'], colors: ['#ffd166', '#d96b82', '#2d8b4a'], apply: { cover: { color: '#ffd166' }, piping: { style: 'tranca', where: 'base', color: '#b9772c' }, decor: { items: ['bandeirolas', 'chapeupalha', 'pacoca', 'pipoca'], opts: { bandeirolas: { kind: 'junina' }, chapeupalha: { arr: 'centro' }, pacoca: { arr: 'coroa' }, pipoca: { arr: 'meialua' } } } } },
  { id: 'natal', name: 'Natal', desc: 'Pinheirinhos, azevinho e bengalinhas', tags: ['tematico', 'natal'], colors: ['#ffffff', '#8b1a1a', '#2d8b4a'], apply: { cover: { color: '#ffffff' }, piping: { style: 'estrelas', where: 'base', color: '#ffffff' }, decor: { items: ['pinheirinhos', 'azevinho', 'bengalinhas', 'flocos'], opts: { pinheirinhos: { arr: 'centro' }, azevinho: { arr: 'coroa' }, bengalinhas: { arr: 'meialua' }, flocos: { arr: 'lateral' } } } } },
  { id: 'pascoa', name: 'Páscoa', desc: 'Orelhas de coelho, ovinhos e cenourinhas', tags: ['tematico', 'pascoa', 'infantil'], colors: ['#ffffff', '#f7b7c8', '#bfe8c8'], apply: { cover: { color: '#ffffff' }, piping: { style: 'grama', where: 'top', color: '#2d8b4a' }, decor: { items: ['orelhascoelho', 'ovinhos', 'cenourinhas'], opts: { ovinhos: { arr: 'centro' }, cenourinhas: { arr: 'coroa' } } } } },
  { id: 'halloween', name: 'Halloween', desc: 'Fantasminhas, abóboras e morcegos', tags: ['tematico', 'halloween', 'divertido'], colors: ['#4a1a6a', '#e07820', '#1d1a1c'], apply: { cover: { color: '#4a1a6a' }, piping: { style: 'pingos', where: 'base', color: '#e07820' }, decor: { items: ['fantasmas', 'aboboras', 'morcegos'], opts: { fantasmas: { arr: 'centro' }, aboboras: { arr: 'coroa' }, morcegos: { arr: 'lateral' } } } } },
  { id: 'maes', name: 'Dia das Mães', desc: 'Peônias, pérolas e um recado', tags: ['flor', 'romantico', 'elegante'], colors: ['#f7d3dc', '#f39fb2', '#ffffff'], apply: { cover: { color: '#f7d3dc' }, piping: { style: 'perolao', where: 'base', color: '#ffffff' }, decor: { items: ['peonias', 'gipsofila', 'perolas'], opts: { peonias: { arr: 'meialua', color: '#f39fb2' }, gipsofila: { arr: 'meialua' } }, message: 'Mãe, te amo' } } },
  { id: 'namorados', name: 'Dia dos Namorados', desc: 'Corações, morangos banhados e rosas', tags: ['romantico', 'chocolate'], colors: ['#8b1a1a', '#f7d3dc', '#3a1a08'], apply: { cover: { color: '#f7d3dc' }, piping: { style: 'coracoes', where: 'top', color: '#d96b82' }, decor: { items: ['morangos', 'coracoes', 'flores'], opts: { morangos: { arr: 'centro' }, coracoes: { arr: 'espalhado', color: '#8b1a1a' }, flores: { arr: 'meialua', color: '#8b1a1a' } }, message: 'Te amo' } } },
  { id: 'reveillon', name: 'Réveillon', desc: 'Dourado, bolas espelhadas e faísca', tags: ['brilho', 'elegante', 'festa'], colors: ['#ffffff', '#dcae52', '#cfd3da'], apply: { cover: { color: '#ffffff' }, piping: { style: 'liso' }, decor: { items: ['espelhadas', 'estrelinhas', 'ouro', 'velas', 'topo'], opts: { espelhadas: { arr: 'meialua', color: '#dcae52' }, estrelinhas: { color: '#dcae52' }, ouro: { arr: 'cascata' } }, candleStyle: 'faisca' } } },
  { id: 'casamento', name: 'Casamento', desc: 'Peônias em cascata, pérolas e alianças', tags: ['casamento', 'elegante', 'romantico'], colors: ['#ffffff', '#f2e4c7', '#dcae52'], apply: { cover: { color: '#ffffff' }, piping: { style: 'guirlanda', color: '#ffffff' }, decor: { items: ['peonias', 'perolas', 'aliancas'], opts: { peonias: { arr: 'cascata', color: '#f7d3dc', qty: 'farto' }, aliancas: { color: '#dcae52' } } } } },
  { id: 'batizado', name: 'Batizado', desc: 'Cruz dourada, mosquitinho e pérolas', tags: ['bebe', 'elegante'], colors: ['#ffffff', '#b8dcff', '#dcae52'], apply: { cover: { color: '#ffffff' }, piping: { style: 'bolinhas', where: 'both', color: '#ffffff' }, decor: { items: ['cruz', 'gipsofila', 'perolas', 'fita'], opts: { cruz: { arr: 'fundo', color: '#dcae52' }, gipsofila: { arr: 'meialua' }, fita: { color: '#ffffff' } } } } },
  { id: 'formatura', name: 'Formatura', desc: 'Capelo, diploma e estrelas douradas', tags: ['formatura', 'elegante', 'festa'], colors: ['#1d1a1c', '#dcae52', '#ffffff'], apply: { cover: { color: '#ffffff' }, piping: { style: 'corda', where: 'base', color: '#dcae52' }, decor: { items: ['capelo', 'estrelinhas', 'topo'], opts: { estrelinhas: { color: '#dcae52' } }, message: 'Parabéns!' } } },
  { id: 'quinze', name: '15 anos', desc: 'Coroa, borboletas e rosas em cascata', tags: ['romantico', 'elegante', 'festa'], colors: ['#f7d3dc', '#e8a5a0', '#ffffff'], apply: { cover: { color: '#f7d3dc' }, piping: { style: 'florzinhas', where: 'base', color: '#ffffff' }, decor: { items: ['coroa', 'flores', 'borboletas', 'velas'], opts: { coroa: { color: '#e8a5a0' }, flores: { arr: 'cascata', color: '#f39fb2' }, borboletas: { arr: 'espalhado', qty: 'pouco' } }, candleStyle: 'numero', number: '15' } } },
  { id: 'chabebe', name: 'Chá de bebê', desc: 'Cubos de letras, nuvens e balões', tags: ['bebe', 'infantil'], colors: ['#ffffff', '#b8dcff', '#f7b7c8'], apply: { cover: { color: '#ffffff' }, piping: { style: 'poa', color: '#b8dcff' }, decor: { items: ['cubos', 'luanuvens', 'baloes'], opts: { cubos: { arr: 'centro' }, baloes: { color: '#b8dcff', qty: 'pouco' } }, message: 'Bem-vindo, bebê' } } },
];

const byId = (list) => (id) => list.find((x) => x.id === id) || null;
export const getPiping = byId(PIPINGS);
export const getDecor = byId(DECORS);
export const getQuantity = byId(QUANTITIES);
export const getArrangement = byId(ARRANGEMENTS);
export const getCandleStyle = byId(CANDLE_STYLES);
export const getCandlePalette = byId(CANDLE_PALETTES);
export const getTheme = byId(THEMES);
export const getPipingPlace = byId(PIPING_PLACES);
export const getPlaqueShape = byId(PLAQUE_SHAPES);
export const getTopperStyle = byId(TOPPER_STYLES);
export const getTopperFinish = byId(TOPPER_FINISHES);

/** A opção está à venda? (active: false tira da loja sem quebrar bolos antigos) */
export const isActive = (x) => Boolean(x) && x.active !== false;
/** Só o que está à venda — é o que os seletores do painel mostram. */
export const shopList = (list) => list.filter(isActive);

/** Nome de uma cor de vela, fita ou peça metalizada que não está na paleta de coberturas. */
export const DECOR_COLOR_NAMES = {
  '#dcae52': 'Dourado',
  '#cfd3da': 'Prateado',
  '#e8a5a0': 'Rosé',
  '#1d1a1c': 'Preto',
  '#6a2a6e': 'Roxa',
  '#9bbf4a': 'Verde',
  '#8a1f3a': 'Rubi',
  '#f7b7c8': 'Rosa claro',
  '#ffd9a8': 'Pêssego',
  '#fff2a8': 'Amarelo claro',
  '#bfe8c8': 'Verde menta',
  '#b8dcff': 'Azul claro',
  '#d9c2ff': 'Lilás claro',
  '#e4607f': 'Rosa pink',
  '#f39fb2': 'Rosa antigo',
  '#6fcfa8': 'Verde água',
  '#6fb6f2': 'Azul',
  '#b497f0': 'Lilás',
  '#ff8c6b': 'Laranja',
  '#e07820': 'Laranja abóbora', // r5-qa: o laranja do tema Halloween (bico e calda)
  '#7fae8a': 'Verde sálvia',
  '#5f8f6a': 'Verde musgo',
  '#9fc7b0': 'Verde claro',
  '#b89bc9': 'Lilás acinzentado',
  '#6f9a55': 'Verde folha',
};
