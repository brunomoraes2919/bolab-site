// BOLAB — curadoria e textos da tela guiada do personalizador (r7-criar): o que aparece PRIMEIRO em cada pergunta,
// as explicações de uma linha dos termos de confeitaria, os kits de enfeite de um toque e os grupos dos temas.
//
// Aqui não mora preço, id novo nem regra: só a ordem e as palavras. Os ids são os de customizer.js e
// customizer-decor.js; um id que não existir mais é simplesmente ignorado pela tela.
//
//   FIRST   as opções que abrem cada pergunta (5 a 8). O resto fica em "Ver todas", em grupos e com busca.
//           (a grade tem 3 colunas: contando o cartão "sem…" que algumas perguntas têm, evite deixar um cartão sozinho na última fileira)
//   HINTS   uma linha curta embaixo do nome, para o que uma criança (ou um adulto) não é obrigado a conhecer.
//   KITS    enfeites que combinam, postos de uma vez. Trocam os enfeites do bolo; cor e bico ficam.
//   THEME_GROUPS  como os 23 temas se dividem em "Ver todos".

export const FIRST = {
  shape: ['round', 'heart', 'square', 'rect', 'flor', 'vulcao', 'hex', 'oval'],
  base: ['boleira', 'prato', 'madeira', 'dourada', 'vidro', 'marmore'],
  flavor: ['baunilha', 'chocolate', 'cenoura', 'mesclada', 'formigueiro', 'funfetti', 'morango', 'redvelvet'],
  filling: ['brigadeiro', 'ninho', 'morango', 'docedeleite', 'nutella', 'prestigio', 'maracuja', 'cookies'],
  covering: ['buttercream', 'chantininho', 'chantilly', 'ganache', 'brigadeiro', 'naked'],
  finish: ['liso', 'rustico', 'ombre', 'seminaked', 'rosetas', 'barrado'],
  piping: ['rosetas', 'conchas', 'estrelas', 'bolinhas', 'vintage'],
  theme: ['unicornio', 'futebol', 'ursinho', 'nuvens', 'princesa', 'espaco', 'mar', 'dinos'],
  decor: ['frutas', 'flores', 'macarons', 'brigadeiros', 'confete', 'granulado', 'baloes', 'borboletas'],
};

export const HINTS = {
  size: { bento: 'mini bolo' },
  shape: { vulcao: 'bolo de furo', hex: 'seis lados' },
  base: { boleira: 'prato com pé', dourada: 'disco dourado', prateada: 'disco prateado', preta: 'disco preto', caixa: 'com tampa e talher' },
  flavor: { redvelvet: 'vermelha, com um toque de cacau', mesclada: 'baunilha e chocolate', formigueiro: 'com granulado na massa', funfetti: 'com confeitos coloridos' },
  filling: {
    ninho: 'creme de leite em pó',
    prestigio: 'coco com chocolate',
    cookies: 'creme com biscoito',
    nutella: 'creme de avelã',
    ganache: 'creme de chocolate',
    ganachebranca: 'creme de chocolate branco',
    cremebelga: 'creme de baunilha',
    creamcheese: 'creme levemente azedinho',
    quatroleites: 'quatro cremes de leite',
    coco: 'creme de coco',
    limaosiciliano: 'creme de limão amarelo',
    caramelosalgado: 'caramelo com uma pitada de sal',
  },
  covering: {
    buttercream: 'creme de manteiga, bem liso',
    chantininho: 'chantilly com leite em pó',
    chantilly: 'creme leve e branquinho',
    ganache: 'chocolate com brilho',
    ganachebranca: 'chocolate branco com brilho',
    glace: 'lisa e brilhante como espelho',
    chocolate: 'brigadeiro espalhado',
    brigadeiro: 'brigadeiro e granulado',
    creamcheese: 'creme levemente azedinho',
    mousse: 'macia como nuvem',
    pasta: 'massinha de açúcar bem lisa',
    merengue: 'picos de clara, tostados',
    coco: 'creme coberto de coco',
    naked: 'bolo pelado: a massa aparece',
  },
  finish: {
    liso: 'sem desenho',
    rustico: 'marcas de espátula',
    pente: 'risquinhos em volta',
    seminaked: 'creme fininho, a massa aparece',
    ombre: 'do claro para o escuro',
    aquarela: 'manchas de cor',
    marmorizado: 'veios, como pedra',
    perolado: 'brilho de pérola',
    barrado: 'faixa de confeito embaixo',
    chuva: 'confeitos subindo da base',
    faultline: 'faixa de confeitos no meio',
    poa: 'bolinhas',
    arabesco: 'desenho de renda',
    cesta: 'trançado, como cesta',
  },
  piping: { vintage: 'conchas, laços e guirlandas', perolao: 'bolinhas grandes', pingos: 'pingos com pontinha', guirlanda: 'cordões na lateral', escamas: 'lateral toda coberta', poa: 'bolinhas na lateral', arabescos: 'desenhos na lateral' },
  where: { top: 'na borda de cima', base: 'no pé do bolo', both: 'em cima e embaixo', cintura: 'no meio do bolo', cobre: 'o topo todo coberto' },
};

/** Explicações de uma linha que abrem cada pergunta (antes de a pessoa escolher), para os termos da etapa. */
export const TERMS = {
  calda: 'É uma calda pincelada em cada camada: a massa fica mais úmida.',
  adicional: 'Pedacinhos no meio do creme, que aparecem quando o bolo é cortado.',
  tipo: 'A cobertura é o creme que veste o bolo por fora.',
  estilo: 'É o jeito de alisar ou pintar a cobertura.',
  drip: 'A calda desce pela borda, em gotas.',
  bico: 'O bico é a ponta do saco de confeitar: faz flores, conchas e estrelas de creme.',
  tema: 'Um tema põe todos os enfeites de uma vez. Depois você muda o que quiser.',
  enfeites: 'Escolha um conjunto pronto ou monte peça por peça.',
  velas: 'As velas vão junto, para acender na hora do parabéns.',
  mensagem: 'Vai numa plaquinha de açúcar ou escrita com bico, direto no bolo.',
  topo: 'Um enfeite recortado, preso num palito, que fica em pé no bolo.',
};

/** Enfeites de um toque. items = ids de DECORS (na ordem em que entram); pics = miniaturas do cartão (até 2). */
export const KITS = [
  { id: 'frutas', name: 'Frutas', hint: 'frutas frescas e morangos', items: ['frutas', 'morangosfrescos'], pics: ['frutas', 'morangosfrescos'] },
  { id: 'flores', name: 'Flores', hint: 'rosas de açúcar e raminhos', items: ['flores', 'gipsofila'], pics: ['flores', 'gipsofila'] },
  { id: 'chocolate', name: 'Chocolate', hint: 'raspas e bombons', items: ['raspas', 'bombons'], pics: ['bombons', 'raspas'] },
  { id: 'docinhos', name: 'Docinhos', hint: 'macarons e brigadeiros', items: ['macarons', 'brigadeiros'], pics: ['macarons', 'brigadeiros'] },
  { id: 'festa', name: 'Festa', hint: 'confete, balões e estrelas', items: ['confete', 'baloes', 'topo'], pics: ['baloes', 'confete'] },
  { id: 'brilho', name: 'Brilho', hint: 'pérolas e estrelinhas', items: ['perolas', 'estrelinhas'], pics: ['perolas', 'estrelinhas'] },
];

export const THEME_GROUPS = [
  { id: 'criancas', name: 'Para crianças', ids: ['unicornio', 'mar', 'safari', 'espaco', 'jardim', 'futebol', 'dinos', 'ursinho', 'nuvens', 'princesa', 'principe'] },
  { id: 'datas', name: 'Datas do ano', ids: ['junina', 'natal', 'pascoa', 'halloween', 'maes', 'namorados', 'reveillon'] },
  { id: 'momentos', name: 'Momentos especiais', ids: ['casamento', 'batizado', 'formatura', 'quinze', 'chabebe'] },
];
