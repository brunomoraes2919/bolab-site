// BOLAB — configurações da loja. Tudo que o dono precisa ajustar fica neste arquivo.
// ATENÇÃO: os valores marcados com "PLACEHOLDER" são de demonstração e devem ser
// trocados pelos dados reais antes de vender de verdade.

export const SITE = {
  name: 'BOLAB',
  tagline: 'Onde seu bolo ganha forma',
  demo: true, // loja em modo demonstração: pagamentos e login são simulados

  city: 'Cuiabá', // PLACEHOLDER — confirmar cidade de atuação
  region: 'Cuiabá e Várzea Grande', // PLACEHOLDER — texto exibido ao cliente
  deliveryCities: ['Cuiabá', 'Várzea Grande'], // PLACEHOLDER — cidades onde a entrega é aceita
  uf: 'MT', // PLACEHOLDER

  whatsapp: '5565999990000', // PLACEHOLDER — número com DDI+DDD, só dígitos
  whatsappLabel: '(65) 99999-0000', // PLACEHOLDER
  instagram: 'bolab.confeitaria', // PLACEHOLDER — usuário sem @
  email: 'contato@bolab.com.br', // PLACEHOLDER
  hours: 'Segunda a sábado, das 9h às 19h', // PLACEHOLDER

  pickup: {
    name: 'Ateliê BOLAB',
    address: 'Rua das Orquídeas, 120 — Centro', // PLACEHOLDER
    note: 'Retire no balcão informando o número do pedido.',
  },

  shipping: {
    fee: 12.9, // taxa fixa de entrega
    freeAbove: 250, // frete grátis a partir deste subtotal
  },

  pix: {
    discountPct: 5, // desconto para pagamento no Pix
    key: 'pix@bolab.com.br', // PLACEHOLDER
    expiresMin: 15,
  },

  card: {
    maxInstallments: 6,
    minInstallment: 30,
  },

  // Janelas de entrega oferecidas por dia.
  slots: ['09:00 – 11:00', '11:00 – 13:00', '14:00 – 16:00', '16:00 – 18:00', '18:00 – 20:00'],
  closedWeekdays: [0], // 0 = domingo (não entregamos)
  maxOrdersPerSlot: 4,
  scheduleDaysAhead: 45,
};

export const CATEGORIES = [
  { id: 'todos', label: 'Todos', photo: null },
  { id: 'premium', label: 'Premium', desc: 'Ingredientes nobres e acabamento de ateliê', photo: 'cat-premium' },
  { id: 'trad', label: 'Clássicos', desc: 'Os sabores que todo mundo ama', photo: 'cat-trad' },
  // Categorias desativadas por enquanto (sem opções para restrições alimentares).
  // Para reativar, tire as barras e reative os produtos em js/data/products.js.
  // { id: 'veg', label: 'Veganos', desc: '100% vegetais, 100% sabor', photo: 'cat-veg' },
  // { id: 'sg', label: 'Sem glúten', desc: 'Leves e cheios de sabor', photo: 'p9' },
  { id: 'inf', label: 'Infantis', desc: 'Para festas cheias de cor', photo: 'cat-inf' },
  { id: 'acess', label: 'Para a festa', desc: 'Velas, toppers e kits', photo: 'cat-acess' },
];

/**
 * Cupons. type: 'pct' (percentual), 'fixed' (valor em R$) ou 'frete' (zera a entrega).
 * firstOrderOnly: só vale para quem ainda não fez pedido. expires: 'AAAA-MM-DD'.
 */
export const COUPONS = {
  BOLAB10: { code: 'BOLAB10', type: 'pct', value: 10, label: '10% OFF no primeiro pedido', firstOrderOnly: true },
  BOLO20: { code: 'BOLO20', type: 'pct', value: 20, label: '20% OFF acima de R$ 200', minSubtotal: 200 },
  FRETE0: { code: 'FRETE0', type: 'frete', value: 0, label: 'Entrega grátis', minSubtotal: 80 },
  NATAL30: { code: 'NATAL30', type: 'pct', value: 30, label: '30% OFF de Natal', expires: '2025-12-26' },
};

/** Cupons que aparecem na carteira do cliente (tela "Meus cupons"). */
export const WALLET_COUPONS = ['BOLAB10', 'FRETE0', 'BOLO20'];

/** Etapas do pedido, em ordem. */
export const ORDER_STEPS = [
  { id: 'received', label: 'Pedido recebido', desc: 'Recebemos seu pedido.' },
  { id: 'paid', label: 'Pagamento confirmado', desc: 'Tudo certo com o pagamento.' },
  { id: 'preparing', label: 'Em produção', desc: 'Seu bolo está sendo feito à mão.' },
  { id: 'ready', label: 'Pronto', desc: 'Finalizado e embalado com carinho.' },
  { id: 'out', label: 'Saiu para entrega', desc: 'A caminho do endereço.' },
  { id: 'delivered', label: 'Entregue', desc: 'Bom apetite!' },
];
