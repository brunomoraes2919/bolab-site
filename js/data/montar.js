// BOLAB — a chamada do "Monte seu bolo" (o personalizador 3D, que por dentro é o Ateliê), em UM lugar só.
//
// Tudo o que a loja diz para convidar a pessoa ao personalizador sai deste arquivo: o banner e a
// faixa do início, o convite no meio do cardápio, nos favoritos e na tela do item, os botões das
// telas vazias, a faixa de seções, a barra inferior e o rodapé. Trocar um texto aqui troca em
// todas essas telas de uma vez.
//
// REGRA: só prometa o que já aparece no personalizador. Hoje ele tem:
//   · o bolo montado camada por camada numa cozinha 3D (formato, massa, recheio, cobertura,
//     acabamento e decoração), com o preço mudando a cada escolha;
//   · som, que só toca depois de a pessoa aceitar (por isso: "com som", nunca "com música tocando");
//   · a Bô, assistente que dá dicas. É uma assistente de regras com voz gravada e opcional: nunca
//     escreva que é uma pessoa, uma confeiteira de verdade ou uma IA que conversa;
//   · gestos na tela: girar o prato, colocar peça com o dedo, soprar as velas;
//   · a revelação do bolo no resumo (as velas só aparecem se o bolo tiver velas), cartão e vídeo;
//   · o jogo de encomendas, com álbum de figurinhas (é brincadeira: não mexe no carrinho);
//   · o modo rápido, para quem só quer pedir.
// "Ateliê BOLAB" é o nome do ponto de retirada (js/data/site.js): aqui o simulador é "cozinha 3D",
// para ninguém confundir os dois.
import { money } from '../ui.js';

export const MONTAR = {
  href: '#/monte-seu-bolo',

  /** Preço inicial do bolo montado. Tem de ser igual a minPrice() de js/customizer/pricing.js
   *  (o teste tools/tests/loja.test.mjs confere). Fica escrito aqui para o início e o cardápio
   *  não precisarem baixar as regras do personalizador só para mostrar um número. */
  fromPrice: 37.95,

  name: 'Monte seu bolo em 3D', // nome completo: faixa de seções, rodapé, leitor de tela
  short: 'Monte o seu', // atalho de categoria no início
  shortDesc: 'Numa cozinha 3D', // a linha pequena do atalho (só aparece no computador)
  tab: 'Montar', // botão do meio da barra inferior
  tag: 'Só na BOLAB', // etiqueta pequena dos banners

  title: 'Monte seu bolo em 3D',
  /** Uma linha: banners pequenos (carrossel do início, cardápio, favoritos). */
  line: 'Camada por camada, com som.',
  /** Duas linhas: a faixa grande do início. */
  text: 'Monte camada por camada numa cozinha 3D, com som e dicas da assistente Bô.',
  /** As etapas do personalizador, na ordem em que aparecem lá. */
  steps: ['Formato', 'Massa', 'Recheio', 'Cobertura', 'Decoração'],
  /** Os bolos da faixa grande do início: inspirações do próprio personalizador (assets/img/cz-<id>.webp,
   *  as de 760 px). a = o principal · b = o segundo · c = o terceiro (só no computador). */
  stage: { a: 'cesta', b: 'unicornio', c: 'vulcao' },

  /** Prazo do bolo montado, do mais simples ao mais elaborado. Tem de bater com prepHoursOf() de
   *  js/customizer/pricing.js (o mesmo teste confere). */
  prepDays: 'de 2 a 4 dias',

  /** A pergunta das "Dúvidas" do início. */
  faq: {
    q: 'Como funciona o bolo em 3D?',
    a: 'Você monta o bolo camada por camada numa cozinha 3D: formato, andares, massa, recheio, cobertura e decoração. O preço muda a cada escolha. A assistente Bô dá dicas no caminho; o som e a voz dela são opcionais. No resumo o bolo é revelado e, se tiver velas, dá para soprar antes de pedir o de verdade. Tem também um jogo de encomendas, com figurinhas para colecionar. Com pressa, use o modo rápido.',
  },

  cta: 'Montar meu bolo', // botão dos banners
  button: 'Montar meu bolo em 3D', // botão das telas vazias (cardápio sem resultado, item fora do cardápio)

  /* Variações por lugar (o resto é igual). */
  catalogTitle: 'Prefere do seu jeito? Monte o seu em 3D',
  catalogTitleParty: 'Falta o bolo? Monte o seu em 3D',
  favoritesLine: 'Salve aqui o bolo que você montar e peça quando quiser.',
  productTitle: 'Quer este bolo do seu jeito?',
  productLine: 'Troque massa, recheio e cobertura e veja como fica.',
  productCta: 'Personalizar este bolo',
};

/** "R$ 37,95" (sem os centavos quando são zero). */
export const montarPrice = () => money(MONTAR.fromPrice).replace(',00', '');

/** "A partir de R$ 37,95." — frase pronta para o fim de um texto de banner. */
export const montarFrom = () => `A partir de ${montarPrice()}.`;
