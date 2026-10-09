// BOLAB — catálogo. Para trocar preço, texto ou foto de um produto, edite aqui.
// photo: chave em js/data/photos.js. sizes: null para acessórios (preço único).

/** Tamanhos dos bolos. O preço do produto é o do tamanho P; os demais multiplicam. */
export const SIZES = [
  { id: 'p', label: 'P', diameter: '15 cm', serves: '8 a 10 fatias', mult: 1 },
  { id: 'm', label: 'M', diameter: '20 cm', serves: '15 a 20 fatias', mult: 1.55 },
  { id: 'g', label: 'G', diameter: '25 cm', serves: '25 a 30 fatias', mult: 2.1 },
];

// Para tirar um produto do ar sem apagá-lo, acrescente  active: false.
// Para voltar a vender, apague essa linha (e reative a categoria em js/data/site.js, se for o caso).
const ALL_PRODUCTS = [
  {
    id: 'p1',
    name: 'Chocolate Belga',
    desc: 'Massa aerada de cacau 70%, recheio de ganache cremoso e raspas de chocolate belga.',
    long: 'O queridinho de quem leva chocolate a sério. Três camadas de massa úmida de cacau 70% intercaladas com ganache sedosa, finalizadas com raspas de chocolate belga feitas na hora.',
    price: 149.9,
    cat: 'premium',
    badge: 'Mais pedido',
    rating: 4.9,
    reviews: 128,
    prepHours: 24,
    featured: true,
    customizable: true,
    photo: 'p1',
    tags: ['chocolate', 'ganache', 'premium', 'aniversário'],
    ingredients: ['Cacau 70%', 'Chocolate belga', 'Creme de leite fresco', 'Manteiga', 'Ovos caipiras', 'Farinha de trigo'],
    allergens: ['Glúten', 'Leite', 'Ovos'],
  },
  {
    id: 'p2',
    name: 'Red Velvet Clássico',
    desc: 'Camadas de massa aveludada com cream cheese e cobertura de chantilly artesanal.',
    long: 'Vermelho intenso por fora, macio como veludo por dentro. O toque levemente ácido do cream cheese equilibra a doçura e deixa cada fatia impossível de recusar.',
    price: 139.9,
    cat: 'trad',
    badge: 'Top vendas',
    rating: 4.8,
    reviews: 94,
    prepHours: 24,
    featured: true,
    customizable: true,
    photo: 'p2',
    tags: ['red velvet', 'cream cheese', 'clássico'],
    ingredients: ['Cream cheese', 'Cacau', 'Buttermilk', 'Manteiga', 'Ovos caipiras', 'Farinha de trigo'],
    allergens: ['Glúten', 'Leite', 'Ovos'],
  },
  {
    id: 'p3',
    name: 'Naked de Morango',
    desc: 'Bolo naked com camadas de morangos frescos e chantilly artesanal levinho.',
    long: 'Sem cobertura para esconder nada: massa de baunilha, chantilly batido na hora e morangos frescos escolhidos um a um. Leve, fotogênico e perfeito para comemorar.',
    price: 179.9,
    cat: 'premium',
    badge: 'Premium',
    rating: 5.0,
    reviews: 57,
    prepHours: 48,
    featured: true,
    customizable: true,
    photo: 'p3',
    tags: ['naked cake', 'morango', 'artesanal', 'casamento'],
    ingredients: ['Morangos frescos', 'Chantilly artesanal', 'Baunilha', 'Manteiga', 'Ovos caipiras', 'Farinha de trigo'],
    allergens: ['Glúten', 'Leite', 'Ovos'],
  },
  {
    id: 'p4',
    name: 'Cenoura + Brigadeiro',
    desc: 'O clássico brasileiro: massa úmida de cenoura com brigadeiro cremoso por cima.',
    long: 'Aquele gosto de casa de vó, com acabamento de confeitaria. Massa fofinha de cenoura e uma camada generosa de brigadeiro cremoso que escorre pelas bordas.',
    price: 89.9,
    cat: 'trad',
    badge: 'Clássico',
    rating: 4.7,
    reviews: 210,
    prepHours: 24,
    featured: false,
    customizable: true,
    photo: 'p4',
    tags: ['cenoura', 'brigadeiro', 'brasileiro'],
    ingredients: ['Cenoura', 'Chocolate ao leite', 'Leite condensado', 'Ovos caipiras', 'Farinha de trigo', 'Óleo vegetal'],
    allergens: ['Glúten', 'Leite', 'Ovos'],
  },
  {
    id: 'p5',
    active: false, // fora do cardápio por enquanto (sem opções para restrições alimentares)
    name: 'Vegano de Baunilha',
    desc: '100% vegetal. Massa fofinha de baunilha com creme de coco e frutas da estação.',
    long: 'Ninguém sente falta de nada. Massa de baunilha macia, creme de coco aveludado e frutas frescas por cima — sem leite, sem ovos, sem abrir mão do sabor.',
    price: 119.9,
    cat: 'veg',
    badge: 'Vegano',
    rating: 4.6,
    reviews: 43,
    prepHours: 36,
    featured: false,
    customizable: true,
    photo: 'p5',
    tags: ['vegano', 'baunilha', 'sem lactose'],
    ingredients: ['Leite de coco', 'Baunilha', 'Frutas da estação', 'Farinha de trigo', 'Açúcar demerara', 'Óleo de coco'],
    allergens: ['Glúten', 'Coco'],
  },
  {
    id: 'p6',
    name: 'Unicórnio Kids',
    desc: 'Bolo colorido com fondant artesanal e decoração de unicórnio — a estrela da festa.',
    long: 'O bolo que arranca um "uau" das crianças (e dos adultos). Camadas coloridas por dentro, decoração modelada à mão por fora e sabor que agrada a turma toda.',
    price: 199.9,
    cat: 'inf',
    badge: 'Infantil',
    rating: 4.9,
    reviews: 76,
    prepHours: 48,
    featured: false,
    customizable: true,
    photo: 'p6',
    tags: ['infantil', 'fondant', 'colorido', 'festa'],
    ingredients: ['Baunilha', 'Buttercream', 'Pasta americana', 'Manteiga', 'Ovos caipiras', 'Farinha de trigo'],
    allergens: ['Glúten', 'Leite', 'Ovos'],
  },
  {
    id: 'p7',
    name: 'Limão Siciliano',
    desc: 'Massa cítrica com lemon curd e cobertura de merengue levemente dourado.',
    long: 'Refrescante do começo ao fim. Massa perfumada com raspas de limão siciliano, recheio de lemon curd e merengue maçaricado que derrete na boca.',
    price: 129.9,
    cat: 'premium',
    badge: 'Novo',
    rating: 4.7,
    reviews: 32,
    prepHours: 24,
    featured: true,
    customizable: true,
    photo: 'p7',
    tags: ['limão', 'cítrico', 'merengue'],
    ingredients: ['Limão siciliano', 'Lemon curd', 'Merengue suíço', 'Manteiga', 'Ovos caipiras', 'Farinha de trigo'],
    allergens: ['Glúten', 'Leite', 'Ovos'],
  },
  {
    id: 'p8',
    name: 'Prestígio Gourmet',
    desc: 'Camadas de chocolate e coco em perfeita harmonia, com cobertura cremosa.',
    long: 'A dupla que nunca sai de moda. Massa de chocolate bem molhadinha, recheio cremoso de coco fresco e cobertura de chocolate meio amargo.',
    price: 154.9,
    cat: 'trad',
    badge: 'Favorito',
    rating: 4.8,
    reviews: 89,
    prepHours: 24,
    featured: false,
    customizable: true,
    photo: 'p8',
    tags: ['chocolate', 'coco', 'prestígio'],
    ingredients: ['Coco fresco', 'Chocolate meio amargo', 'Leite condensado', 'Manteiga', 'Ovos caipiras', 'Farinha de trigo'],
    allergens: ['Glúten', 'Leite', 'Ovos', 'Coco'],
  },
  {
    id: 'p9',
    active: false, // fora do cardápio por enquanto (sem opções para restrições alimentares)
    name: 'Sem Glúten de Cacau',
    desc: 'Farinha de amêndoa, cacau 70% e adoçante natural. Delicioso e sem glúten.',
    long: 'Intenso, úmido e naturalmente sem glúten. Feito com farinha de amêndoas e cacau 70%, tem textura de brownie e sabor de chocolate de verdade.',
    price: 144.9,
    cat: 'sg',
    badge: 'Sem glúten',
    rating: 4.5,
    reviews: 28,
    prepHours: 36,
    featured: false,
    customizable: false,
    photo: 'p9',
    tags: ['sem glúten', 'cacau', 'amêndoa'],
    ingredients: ['Farinha de amêndoas', 'Cacau 70%', 'Ovos caipiras', 'Manteiga', 'Açúcar de coco'],
    allergens: ['Leite', 'Ovos', 'Castanhas'],
  },
  {
    id: 'p10',
    name: 'Floresta Negra',
    desc: 'Massa de chocolate com cerejas ao marasquino, chantilly e raspas de chocolate amargo.',
    long: 'Um clássico europeu feito do jeito certo: camadas de chocolate, chantilly fresco e cerejas inteiras. Elegante para a mesa, irresistível na fatia.',
    price: 169.9,
    cat: 'premium',
    badge: 'Premium',
    rating: 4.8,
    reviews: 61,
    prepHours: 36,
    featured: false,
    customizable: true,
    photo: 'p10',
    tags: ['floresta negra', 'cereja', 'chocolate'],
    ingredients: ['Cerejas', 'Chantilly artesanal', 'Chocolate amargo', 'Manteiga', 'Ovos caipiras', 'Farinha de trigo'],
    allergens: ['Glúten', 'Leite', 'Ovos'],
  },
  {
    id: 'p11',
    name: 'Velinhas Temáticas',
    desc: 'Kit com 10 velinhas coloridas para deixar o parabéns ainda mais especial.',
    long: 'Dez velinhas coloridas em tons pastel que combinam com qualquer bolo. Chegam junto com a sua encomenda, prontas para acender.',
    price: 24.9,
    cat: 'acess',
    badge: 'Acessório',
    rating: 4.8,
    reviews: 87,
    prepHours: 0,
    featured: false,
    customizable: false,
    sizes: null,
    photo: 'p11',
    tags: ['velinha', 'aniversário'],
  },
  {
    id: 'p12',
    name: 'Velinhas Numéricas',
    desc: 'Velas em formato de número (0 a 9) em dourado. Informe a idade nas observações.',
    long: 'Velas de número em dourado para marcar a idade em grande estilo. Diga o número desejado nas observações do pedido.',
    price: 18.9,
    cat: 'acess',
    badge: 'Acessório',
    rating: 4.7,
    reviews: 62,
    prepHours: 0,
    featured: false,
    customizable: false,
    sizes: null,
    photo: 'p12',
    tags: ['velinha', 'número', 'dourada'],
  },
  {
    id: 'p13',
    name: 'Topper Personalizado',
    desc: 'Topper com nome, frase ou tema à sua escolha. Feito sob medida para o seu bolo.',
    long: 'Um topo de bolo feito só para a sua festa: nome, idade, frase ou tema. Conte o que você imagina nas observações e a gente cria.',
    price: 39.9,
    cat: 'acess',
    badge: 'Personalizado',
    rating: 5.0,
    reviews: 134,
    prepHours: 48,
    featured: true,
    customizable: false,
    sizes: null,
    photo: 'p13',
    tags: ['topper', 'personalizado', 'acrílico'],
  },
  {
    id: 'p14',
    name: 'Topper Feliz Aniversário',
    desc: 'Topper espelhado em dourado ou rosé. Elegante e pronto para qualquer bolo.',
    long: 'O acabamento que faltava. Topper "Feliz Aniversário" em acrílico espelhado, disponível em dourado ou rosé.',
    price: 29.9,
    cat: 'acess',
    badge: 'Acessório',
    rating: 4.9,
    reviews: 98,
    prepHours: 24,
    featured: false,
    customizable: false,
    sizes: null,
    photo: 'p14',
    tags: ['topper', 'feliz aniversário', 'dourado'],
  },
  {
    id: 'p15',
    name: 'Kit Decoração Completo',
    desc: 'Velinhas temáticas + topper personalizado + laços decorativos. Tudo para a mesa do bolo.',
    long: 'Tudo o que a mesa do bolo precisa em um kit só: velinhas temáticas, topper personalizado e laços decorativos. Sai mais em conta do que comprar separado.',
    price: 69.9,
    cat: 'acess',
    badge: 'Kit',
    rating: 5.0,
    reviews: 45,
    prepHours: 48,
    featured: true,
    customizable: false,
    sizes: null,
    photo: 'p15',
    tags: ['kit', 'decoração', 'velinhas', 'topper'],
  },
];

/** Avaliações ILUSTRATIVAS (demonstração). Trocar por avaliações reais antes de vender. */
export const REVIEWS = [
  { productId: 'p1', name: 'Camila R.', rating: 5, date: '2026-09-21', text: 'O melhor bolo de chocolate que já comi. Chegou no horário e lindo demais!' },
  { productId: 'p1', name: 'Rafael M.', rating: 5, date: '2026-08-30', text: 'Ganache perfeita, nada enjoativo. Virou tradição nos aniversários aqui de casa.' },
  { productId: 'p2', name: 'Juliana S.', rating: 5, date: '2026-09-12', text: 'Massa super macia e o cream cheese no ponto certo. Todo mundo pediu o contato.' },
  { productId: 'p3', name: 'Beatriz L.', rating: 5, date: '2026-09-05', text: 'Pedi para o chá de bebê e foi o centro das fotos. Morangos fresquíssimos.' },
  { productId: 'p4', name: 'Dona Lúcia', rating: 5, date: '2026-09-18', text: 'Gosto de bolo de vó, mas com cara de confeitaria. Brigadeiro maravilhoso.' },
  { productId: 'p5', name: 'Thaís A.', rating: 4, date: '2026-08-22', text: 'Finalmente um bolo vegano que não fica seco. Minha família nem percebeu.' },
  { productId: 'p6', name: 'Patrícia N.', rating: 5, date: '2026-09-27', text: 'Minha filha chorou de alegria quando viu. Valeu cada centavo.' },
  { productId: 'p7', name: 'Marcos V.', rating: 5, date: '2026-09-02', text: 'Refrescante e equilibrado. O merengue maçaricado é um show à parte.' },
  { productId: 'p8', name: 'Aline C.', rating: 5, date: '2026-08-15', text: 'Coco de verdade, bem cremoso. Sumiu em dez minutos na festa.' },
  { productId: 'p10', name: 'Fernanda T.', rating: 5, date: '2026-09-09', text: 'Elegante e delicioso. As cerejas fazem toda a diferença.' },
  { productId: 'custom', name: 'Larissa P.', rating: 5, date: '2026-09-24', text: 'Montei meu bolo no 3D e chegou IGUALZINHO. Experiência incrível do começo ao fim.' },
  { productId: 'custom', name: 'Gustavo H.', rating: 5, date: '2026-09-14', text: 'Fiz surpresa para minha esposa escolhendo cada camada. Ela amou saber que eu que "criei".' },
];

/** Só o que está à venda. */
export const PRODUCTS = ALL_PRODUCTS.filter((p) => p.active !== false);

const byId = new Map(PRODUCTS.map((p) => [p.id, p]));

/**
 * Nota média e total de avaliações do cardápio à venda, para os textos de prova social.
 * → { avg: '4,8', count: 1173, countLabel: 'mais de 1.100' }
 */
export function ratingSummary() {
  const count = PRODUCTS.reduce((n, p) => n + p.reviews, 0);
  const avg = count ? PRODUCTS.reduce((s, p) => s + p.rating * p.reviews, 0) / count : 0;
  const floor = Math.floor(count / 100) * 100;
  return {
    avg: avg.toFixed(1).replace('.', ','),
    count,
    countLabel: floor ? `mais de ${floor.toLocaleString('pt-BR')}` : String(count),
  };
}

export function getProduct(id) {
  return byId.get(id) || null;
}

/** Tamanhos disponíveis para o produto ([] quando é preço único). */
export function sizesOf(product) {
  return product.sizes === null ? [] : SIZES;
}

/** Preço do produto em um tamanho ('p' | 'm' | 'g'); arredonda para terminar em ,90. */
export function priceOf(product, sizeId = 'p') {
  const size = SIZES.find((s) => s.id === sizeId);
  if (!size || product.sizes === null || size.mult === 1) return product.price;
  return Math.round(product.price * size.mult) - 0.1;
}

export function isCake(product) {
  return product.cat !== 'acess';
}

/** Busca por nome, descrição e tags, ignorando acentos e maiúsculas. */
export function searchProducts({ q = '', cat = 'todos', sort = 'relevancia' } = {}) {
  const norm = (s) =>
    String(s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  const term = norm(q.trim());
  let list = PRODUCTS.filter((p) => cat === 'todos' || p.cat === cat);
  if (term) {
    list = list.filter((p) => norm(`${p.name} ${p.desc} ${p.tags.join(' ')}`).includes(term));
  }
  const sorters = {
    relevancia: (a, b) => Number(b.featured) - Number(a.featured) || b.reviews - a.reviews,
    'menor-preco': (a, b) => a.price - b.price,
    'maior-preco': (a, b) => b.price - a.price,
    avaliacao: (a, b) => b.rating - a.rating || b.reviews - a.reviews,
  };
  return [...list].sort(sorters[sort] || sorters.relevancia);
}

export function relatedTo(product, limit = 4) {
  const same = PRODUCTS.filter((p) => p.id !== product.id && p.cat === product.cat);
  const others = PRODUCTS.filter((p) => p.id !== product.id && p.cat !== product.cat && isCake(p) === isCake(product));
  return [...same, ...others].slice(0, limit);
}

/** Acessórios sugeridos como complemento (carrinho e página de produto). */
export function addOns(limit = 3) {
  return PRODUCTS.filter((p) => p.cat === 'acess').slice(0, limit);
}
