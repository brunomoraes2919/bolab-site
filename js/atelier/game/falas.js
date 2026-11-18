// BOLAB — Ateliê, jogo: o que a Bô diz durante as encomendas.
// O jogo NÃO edita a Bô (js/atelier/bo/): estas falas saem pelo balão dela com bo.say({ text, mood }).
// Quando a frente da Bô gravar a voz, basta ela criar em lines.js os grupos com os MESMOS nomes daqui
// (jogo.inicio, jogo.estrelas.3…): o jogo passa a pedir a fala pelo nome do grupo e ela sai com voz.
// A lista para gravação está em tools/out/r5/jogo/falas-bo.md (gerada deste arquivo por tools/jogo_falas.mjs).
//
// Regras das falas (as mesmas de lines.js): de 4 a 14 palavras, para o ouvido, sem número, sem sigla,
// sem pressão de venda, sem assunto de restrição alimentar.
// Humor: 'neutra' | 'feliz' | 'comemora' | 'surpresa' | 'preocupada' | 'pensando'.

export const GAME_LINES = {
  'jogo.inicio': {
    quando: 'Começou uma encomenda',
    humor: 'feliz',
    falas: [
      'Encomenda nova na bancada! Lê o pedido com calma e mãos à obra.',
      'Chegou cliente! Vamos fazer esse bolo do jeitinho que foi pedido.',
      'Pedido anotado. Eu fico de olho e te aviso se faltar alguma coisa.',
      'Avental no lugar? Então bora atender esse pedido.',
      'Cliente esperando! A comanda fica aqui no canto, é só tocar.',
      'Mais uma encomenda! Gosto de ver esse ateliê movimentado.',
      'Vamos caprichar. Cliente feliz volta sempre.',
    ],
  },
  'jogo.dia': {
    quando: 'Começou a encomenda do dia',
    humor: 'comemora',
    falas: [
      'Encomenda do dia saindo! Hoje todo mundo recebeu esse mesmo pedido.',
      'Essa é a encomenda de hoje. Amanhã tem outra, novinha.',
      'Pedido do dia na mesa! Vamos ver o que você apronta.',
      'A encomenda de hoje chegou cedo. Bora atender?',
      'Hoje o desafio é esse. Capricha, que eu estou torcendo.',
    ],
  },
  'jogo.relampago': {
    quando: 'Começou o desafio relâmpago',
    humor: 'surpresa',
    falas: [
      'Valendo! Três pedidos e o relógio correndo. Sem medo.',
      'Relâmpago! Monta rapidinho, mas monta bonito.',
      'O relógio começou. Respira e vai escolhendo.',
      'Desafio relâmpago! O tempo é só para dar frio na barriga.',
      'Mão rápida agora! Eu vou contando daqui.',
    ],
  },
  'jogo.tempo': {
    quando: 'O relógio do relâmpago zerou',
    humor: 'neutra',
    falas: [
      'O relógio zerou, mas pode terminar com calma. Aqui ninguém perde.',
      'Tempo! Se quiser, termina sem pressa e entrega depois.',
      'Acabou o tempo. O bolo ainda pode ficar lindo.',
      'Zerou! Relógio é detalhe, o que vale é o bolo.',
    ],
  },
  'jogo.pronto': {
    quando: 'Tudo o que o cliente pediu está no bolo',
    humor: 'feliz',
    falas: [
      'Está tudo aí! Quando quiser, é só entregar.',
      'Não falta nada do pedido. Pode entregar esse bolo.',
      'Conferi a comanda: tudo certo. Bora entregar?',
      'Pedido completo! O cliente vai gostar de ver isso.',
    ],
  },
  'jogo.entrega': {
    quando: 'O bolo foi entregue (antes da nota aparecer)',
    humor: 'pensando',
    falas: [
      'Bolo na caixa! Vamos ver a cara do cliente.',
      'Entregue! Agora é esperar a reação.',
      'Lá vai o bolo. Estou até nervosa.',
      'Caixa fechada e laço dado. Tomara que goste!',
      'Saiu para entrega! Quero ver esse sorriso.',
    ],
  },
  'jogo.estrelas.3': {
    quando: 'Entrega com três estrelas',
    humor: 'comemora',
    falas: [
      'Três estrelas! O cliente saiu sorrindo de orelha a orelha.',
      'Perfeito! Era exatamente isso que foi pedido.',
      'Nota máxima! Esse bolo eu assinava embaixo.',
      'Acertou em cheio! Pedido, sabor e visual, tudo no lugar.',
      'Três estrelas brilhando! Isso é trabalho de confeiteiro.',
      'Que entrega! O cliente já quer encomendar outro.',
      'Cliente feliz, Bô feliz. Três estrelas merecidas!',
    ],
  },
  'jogo.estrelas.2': {
    quando: 'Entrega com duas estrelas',
    humor: 'feliz',
    falas: [
      'Duas estrelas! Ficou bom, faltou só um detalhe.',
      'Quase perfeito. Olha na comanda o que ficou de fora.',
      'O cliente gostou, mas sentiu falta de uma coisinha.',
      'Boa entrega! Com um ajuste, vira nota máxima.',
      'Duas estrelas é bolo bem feito. A terceira está pertinho.',
      'Foi por pouco! Quer tentar de novo e fechar as três?',
      'Ficou gostoso. Só não era bem tudo o que foi pedido.',
    ],
  },
  'jogo.estrelas.1': {
    quando: 'Entrega com uma estrela',
    humor: 'neutra',
    falas: [
      'Uma estrela. O bolo saiu, mas o pedido era outro.',
      'Entregar já vale! Vamos reler o pedido juntos?',
      'O cliente comeu, mas queria uma coisa diferente.',
      'Acontece nas melhores confeitarias. Tenta de novo, eu ajudo.',
      'Dessa vez passou longe do pedido. A próxima sai melhor.',
      'Uma estrela é começo. Dá uma olhada no que faltou.',
      'Tudo bem errar. Bolo bom se aprende fazendo.',
    ],
  },
  'jogo.surpresa': {
    quando: 'O bolo acertou a surpresa que o cliente não contou',
    humor: 'surpresa',
    falas: [
      'Você adivinhou o desejo secreto do cliente! Como é que pode?',
      'Surpresa certeira! Nem precisou o cliente contar.',
      'Isso o cliente nem tinha pedido, e amou.',
      'Leu o pensamento do cliente! Isso é dom.',
    ],
  },
  'jogo.figurinha': {
    quando: 'Ganhou uma figurinha nova',
    humor: 'comemora',
    falas: [
      'Figurinha nova para o álbum!',
      'Olha só, ganhou uma figurinha!',
      'Mais uma para a coleção. Já colei no álbum.',
      'Figurinha fresquinha! Dá uma espiada no álbum.',
      'Essa você ainda não tinha. Álbum crescendo!',
      'Ganhou figurinha! Eu adoro quando isso acontece.',
    ],
  },
  'jogo.figurinha.secreta': {
    quando: 'Ganhou uma figurinha secreta',
    humor: 'surpresa',
    falas: [
      'Uma figurinha secreta! Essa quase ninguém acha.',
      'Opa, você achou um segredo do ateliê!',
      'Figurinha escondida! Como foi que você descobriu?',
      'Segredo revelado! Essa é das raras.',
      'Achou uma das secretas. Não conta para ninguém!',
      'Essa estava bem escondida. Olho de confeiteiro!',
    ],
  },
  'jogo.dica.sabor': {
    quando: 'Dica: falta um sabor que o cliente pediu',
    humor: 'pensando',
    falas: [
      'Ainda falta um sabor do pedido. Dá uma olhada na massa e no recheio.',
      'O cliente pediu um sabor que eu não achei aí.',
      'Confere a comanda: tem sabor pedido que ficou de fora.',
      'Faltou um gostinho que o cliente queria. Olha os recheios.',
      'Psiu: o sabor do pedido ainda não entrou no bolo.',
    ],
  },
  'jogo.dica.visual': {
    quando: 'Dica: falta um enfeite, uma cor ou um detalhe de visual',
    humor: 'pensando',
    falas: [
      'Por fora ainda falta um detalhe do pedido.',
      'O cliente pediu um enfeite que eu não estou vendo.',
      'Repara na comanda: falta um capricho no visual.',
      'A cor ou o enfeite ainda não é o que foi pedido.',
      'Falta pouco! Só um detalhe da decoração.',
    ],
  },
  'jogo.dica.naogosta': {
    quando: 'Dica: o bolo tem algo que o cliente disse que não gosta',
    humor: 'preocupada',
    falas: [
      'Cuidado: tem uma coisa aí que o cliente não gosta.',
      'Ih, isso o cliente pediu para não pôr.',
      'Melhor tirar isso. O cliente avisou que não gosta.',
      'Olha a comanda: tem um item riscado ali no bolo.',
    ],
  },
  'jogo.dica.pessoas': {
    quando: 'Dica: o bolo é pequeno para o número de pessoas',
    humor: 'preocupada',
    falas: [
      'Esse bolo está pequeno para tanta gente.',
      'Vai faltar fatia! Aumenta o tamanho ou sobe um andar.',
      'A festa é maior que o bolo. Dá para crescer?',
      'Com esse tamanho, alguém fica sem pedaço.',
    ],
  },
  'jogo.dica.prazo': {
    quando: 'Dica: o bolo demora mais que o prazo do cliente',
    humor: 'preocupada',
    falas: [
      'Esse bolo demora mais do que o cliente pode esperar.',
      'O prazo está apertado. Tem enfeite aí que pede dias de preparo.',
      'Assim não fica pronto a tempo. Simplifica um pouco.',
    ],
  },
  'jogo.dica.combina': {
    quando: 'Dica: os sabores brigam ou o visual está carregado',
    humor: 'pensando',
    falas: [
      'O pedido está certo, mas a combinação pode melhorar.',
      'Tem coisa demais disputando a atenção nesse bolo.',
      'Esses sabores estão brigando. Troca um recheio e me conta.',
    ],
  },
  'jogo.orcamento': {
    quando: 'O preço passou do orçamento do cliente',
    humor: 'preocupada',
    falas: [
      'Passou do orçamento! Vamos trocar alguma coisa por uma mais simples.',
      'Ih, ficou mais caro do que o cliente pode pagar.',
      'O bolso do cliente não alcança. Que tal tirar um enfeite?',
      'Estourou o combinado. Um recheio mais em conta resolve.',
      'O preço subiu além da conta. Dá para enxugar sem perder a graça.',
    ],
  },
  'jogo.livre': {
    quando: 'Voltou ao modo livre',
    humor: 'feliz',
    falas: [
      'De volta ao modo livre. Aqui quem manda é você.',
      'Seu bolo voltou para a bancada, do jeitinho que estava.',
      'Encomendas guardadas. Agora é criar à vontade.',
    ],
  },
};

/** A fala número `n` de um grupo (roda em rodízio, para não repetir): { group, text, mood }. */
export function gameLine(group, n = 0) {
  const g = GAME_LINES[group];
  if (!g) return null;
  const i = ((Math.round(Number(n) || 0) % g.falas.length) + g.falas.length) % g.falas.length;
  return { group, text: g.falas[i], mood: g.humor };
}
