// BOLAB — Ateliê: as falas da Bô.
// Cada fala tem um TEXTO FALADO (gravado com voz por tools/voz/gerar.mjs) e, quando há número que muda
// (preço, fatias, prazo), um TEXTO DE BALÃO separado, com {variáveis} preenchidas na hora pelo cérebro.
// A voz nunca diz número que muda: "isso pesa um pouquinho no preço" — o valor aparece só no balão.
//
// Como escrever uma fala (ela é feita para o OUVIDO):
//   · 1 a 2 frases, de 2 a 6 segundos (até uns 95 caracteres);
//   · sem siglas, sem "R$", sem "cm", sem parênteses; número por extenso só quando é fixo;
//   · sem promessa de saúde, sem assunto de restrição alimentar (isso é com o atendimento),
//     sem marca nem personagem de terceiros, sem pressão de venda, diminutivo com parcimônia.
//
// Organização: falas(categoria, grupo, humor, ...textos). O id de cada fala é "<grupo>.<n>" (n começa em 1).
// NUNCA reordene nem apague textos de um grupo já publicado: acrescente no fim (o id é a posição).
// Um texto pode ser 'fala' ou ['fala', 'balão com {variavel}'].
// Humor: 'neutra' | 'feliz' | 'comemora' | 'surpresa' | 'preocupada' | 'pensando'.
//
// Grupos que o cérebro procura por convenção (brain.js):
//   massa.<id> recheio.<id> cobertura.<id> estilo.<id> bico.<id> decor.<id> formato.<id> tamanho.<id> base.<id>
//   vela.<id> onde.<id> arranjo.<id> tema.<id> adicional.<id> molhar.<id> confeito.<id> regra.<código da regra>
//   (o jogo, em js/atelier/game/, pede as falas dele pelo nome do grupo: jogo.<momento> — ver o fim deste arquivo)
//   → se não houver (opção nova no catálogo): tag.sabor.<tag> | tag.estilo.<tag> | tag.decor.<tag> → tipo.<tipo>

const G = {};
function falas(cat, grupo, humor, ...textos) {
  if (G[grupo]) throw new Error(`Grupo de falas repetido: ${grupo}`);
  G[grupo] = { cat, humor, textos };
}

/* ───────── Boas-vindas e retorno ───────── */
falas('boasvindas', 'ola.novo', 'feliz',
  'Oi! Eu sou a Bô, a assistente da BOLAB. Vamos montar um bolo de dar gosto?',
  'Olá! Sou a Bô, assistente aqui do ateliê. Você monta e eu dou os palpites.',
  'Que bom te ver no ateliê! Eu sou a Bô. Mexe à vontade, que eu vou te dando dicas.',
  'Oi, oi! Bô, assistente da BOLAB, ao seu dispor. Bora montar esse bolo?',
);
falas('boasvindas', 'ola.retorno', 'feliz',
  'Olha quem voltou! Que bom te ver de novo no ateliê.',
  'Oi de novo! Já estava com saudade de montar bolo com você.',
  'Voltou! Pega o avental, que hoje sai coisa boa.',
  'Que bom te ver por aqui outra vez. Qual vai ser a ideia de hoje?',
);
falas('boasvindas', 'ola.rascunho', 'feliz',
  'Guardei o seu bolo do jeito que você deixou. Vamos continuar?',
  'Seu bolo ficou esperando aqui na bancada. É só seguir de onde parou.',
  'Achei o seu rascunho! Continuamos de onde você parou.',
);
falas('boasvindas', 'ola.salvo', 'feliz',
  'Abrindo um bolo dos seus guardados. Esse eu lembro, é bonito.',
  'Seu bolo salvo está de volta na bancada. Quer mexer em alguma coisa?',
);
falas('boasvindas', 'ola.edicao', 'neutra',
  'Vamos ajustar o bolo do carrinho. Muda o que quiser, eu acompanho.',
  'Editando o seu bolo. Capricha nos ajustes, que eu vou olhando.',
);
falas('boasvindas', 'ola.inspiracao', 'feliz',
  'Começar por uma inspiração é esperto. Agora deixa com a sua cara.',
  'Boa base! Essa inspiração já vem equilibrada, é só personalizar.',
  'Gostei da inspiração. Troca o que quiser até virar o seu bolo.',
);
falas('boasvindas', 'ola.produto', 'feliz',
  'Esse é um dos queridos do cardápio. Vamos deixar do seu jeito?',
  'Partir de um bolo do cardápio é meio caminho andado. Agora personaliza.',
);
falas('boasvindas', 'ola.desafio', 'comemora',
  'Desafio aceito! Vamos ver esse talento de confeitaria.',
  'Opa, um desafio! Eu fico de olho e torcendo por você.',
);
falas('boasvindas', 'apresenta', 'feliz',
  'Eu acompanho o que você faz e dou palpite de confeiteira. Toque em mim quando quiser perguntar.',
  'Toque em mim para ver os atalhos: posso sugerir sabor, decoração e até um jeito de economizar.',
  'Se eu falar demais, é só tocar em mim e escolher um modo mais quieto.',
);

/* ───────── Etapas: abertura e dica ───────── */
falas('etapa', 'etapa.formato.abre', 'neutra',
  'Primeiro a base de tudo: o formato e o tamanho do bolo.',
  'Começamos pelo formato. Pensa em quantas pessoas vão comer.',
  'Formato e tamanho primeiro. O resto a gente enfeita depois.',
);
falas('etapa', 'etapa.formato.dica', 'neutra',
  'Na dúvida do tamanho, conta os convidados e sobe um pouco. Bolo sobrando nunca foi problema.',
  'Redondo é o clássico. Quadrado e retangular são os mais fáceis de fatiar por igual.',
  'Mais andares deixam o bolo imponente e rendem muito mais fatias.',
);
falas('etapa', 'etapa.massa.abre', 'neutra',
  'Agora a massa. É ela que dá o tom do bolo inteiro.',
  'Hora da massa! Dá até para misturar sabores entre as camadas.',
  'Massa: a alma do bolo. Qual é a sua preferida?',
);
falas('etapa', 'etapa.massa.dica', 'neutra',
  'Massa neutra, como a de baunilha, deixa o recheio brilhar.',
  'Camadas de sabores diferentes ficam lindas na hora do corte.',
  'Quanto mais camadas, mais alto o bolo e mais recheio entre elas.',
);
falas('etapa', 'etapa.recheio.abre', 'feliz',
  'Recheio! Para muita gente, é a melhor parte.',
  'Agora o recheio. É aqui que o bolo ganha personalidade.',
  'Vamos de recheio. Dá para escolher um diferente em cada camada.',
);
falas('etapa', 'etapa.recheio.dica', 'neutra',
  'Uma regra de confeiteira: recheio doce pede um vizinho azedinho.',
  'Dois recheios diferentes deixam cada garfada mais interessante.',
  'Recheio de fruta refresca. Recheio cremoso abraça. Os dois juntos, perfeito.',
);
falas('etapa', 'etapa.cobertura.abre', 'neutra',
  'Cobertura: a roupa do bolo. Escolhe o tipo, a cor e o estilo.',
  'Hora de vestir o bolo. A cobertura muda tudo no visual.',
  'Agora a cobertura. Pensa na cor da festa.',
);
falas('etapa', 'etapa.cobertura.dica', 'neutra',
  'No nosso calor, as coberturas mais firmes aguentam melhor fora da geladeira.',
  'Cor clara deixa o bolo delicado. Cor forte chama a atenção na mesa.',
  'A calda escorrendo dá um charme. Fica melhor ainda numa cor que contraste.',
);
falas('etapa', 'etapa.acabamento.abre', 'neutra',
  'Agora os bicos de confeitar. É o acabamento que mostra o capricho.',
  'Acabamento! Um bico bem escolhido emoldura o bolo.',
  'Hora do bico. Pode ser discreto ou bem trabalhado, você manda.',
);
falas('etapa', 'etapa.acabamento.dica', 'neutra',
  'Bico da mesma cor da cobertura fica elegante. Em outra cor, vira destaque.',
  'Borda no topo e na base deixa o bolo com cara de confeitaria clássica.',
  'Se a decoração for farta, um bico mais simples equilibra.',
);
falas('etapa', 'etapa.decoracao.abre', 'feliz',
  'Decoração! A parte mais divertida. Só não vale lotar demais o topo.',
  'Agora os enfeites. Frutas, flores, doces, velas: o que combina com a festa?',
  'Hora de decorar. Escolhe com calma, que o bolo se arruma sozinho.',
);
falas('etapa', 'etapa.decoracao.dica', 'neutra',
  'Dois ou três enfeites bem escolhidos valem mais que um topo lotado.',
  'Repetir no enfeite uma cor da cobertura amarra o visual todo.',
  'Uma mensagem deixa o bolo com dono. Pode ser na plaquinha ou escrita no topo.',
);
falas('etapa', 'etapa.resumo.abre', 'feliz',
  'Pronto! Olha o seu bolo inteiro. Confere se está tudo do seu gosto.',
  'Chegamos ao resumo. Dá uma última olhada com carinho.',
  'Olha só como ficou! Confere os detalhes antes de pedir.',
);
falas('etapa', 'etapa.resumo.dica', 'neutra',
  'Quer a minha opinião sincera? Toca em mim e pergunta se combina.',
  'Dá para salvar o bolo e decidir depois. Ele fica guardado para você.',
  'O dia e o horário da entrega você escolhe ao fechar o pedido.',
);

/* ───────── Opções: formato, tamanho, estrutura ───────── */
falas('opcao', 'formato.round', 'neutra', 'Redondo, o clássico. Combina com tudo e nunca sai de moda.', 'Voltou para o redondo. Um clássico é um clássico.');
falas('opcao', 'formato.square', 'neutra', 'Quadrado! Moderno e muito prático na hora de fatiar.');
falas('opcao', 'formato.rect', 'neutra', 'Retangular rende fatias generosas. Ótimo para a turma toda.');
falas('opcao', 'formato.heart', 'feliz', 'Coração! Esse bolo já chega dizendo tudo.', 'De coração, que amor! Alguém vai ficar feliz.');
falas('opcao', 'formato.hex', 'surpresa', 'Hexagonal, que chique. Parece saído de uma vitrine.');
falas('opcao', 'tamanho.p', 'neutra', ['Pequeno e certeiro, do tamanho de um café em família.', 'Pequeno e certeiro: rende {fatias}.']);
falas('opcao', 'tamanho.m', 'neutra', ['O médio é o mais pedido para festa. Costuma ser a conta certa.', 'O médio costuma ser a conta certa: rende {fatias}.']);
falas('opcao', 'tamanho.g', 'feliz', ['Grandão! Esse é para festa cheia, ninguém fica sem fatia.', 'Grandão! Rende {fatias}, ninguém fica sem.']);
falas('opcao', 'andares.1', 'neutra', 'De volta a um andar só. Simples e bonito também funciona.');
falas('opcao', 'andares.2', 'feliz', 'Dois andares! O bolo já ganha cara de festa grande.');
falas('opcao', 'andares.3', 'comemora', 'Três andares, que espetáculo! Esse vai ser o centro da festa.');
falas('opcao', 'altura.baixo', 'neutra', 'Mais baixo: fatia delicada e mais leve no bolso.');
falas('opcao', 'altura.padrao', 'neutra', 'Altura padrão: o equilíbrio certo entre massa e recheio.');
falas('opcao', 'altura.alto', 'feliz', 'Bolo alto impressiona. A fatia fica linda, com várias camadas.');
falas('opcao', 'camada.mais', 'feliz',
  'Mais uma camada! O bolo cresce e ganha mais recheio.',
  'Subindo! Cada camada nova é um recheio a mais.',
  'Mais altura. A fatia vai ficar um espetáculo.',
);
falas('opcao', 'camada.menos', 'neutra', 'Tirou uma camada. Fica mais leve e mais em conta.', 'Uma camada a menos. Às vezes o simples resolve.');
falas('opcao', 'camada.unica', 'neutra', 'Uma camada só é o bolo simples, sem recheio. Gostoso com um café.');
falas('opcao', 'base.boleira', 'neutra', 'Boleira de porcelana com filete dourado. Clássica.');
falas('opcao', 'base.prato', 'neutra', 'Prato branco, discreto. Deixa o bolo ser a estrela.');
falas('opcao', 'base.madeira', 'neutra', 'Tábua de madeira! Dá um ar rústico lindo.');
falas('opcao', 'base.dourada', 'feliz', 'Base dourada: brilho de festa chique.');
falas('opcao', 'base.prateada', 'neutra', 'Base prateada, elegante e moderna.');
falas('opcao', 'base.marmore', 'surpresa', 'Mármore! Sofisticado, de capa de revista.');

/* ───────── Opções: massas ───────── */
falas('opcao', 'massa.baunilha', 'neutra', 'Baunilha: fofinha e amiga de todos os recheios.', 'Massa de baunilha é coringa. Agora o recheio pode ousar.');
falas('opcao', 'massa.chocolate', 'feliz', 'Chocolate! Massa bem molhadinha, não tem erro.', 'Massa de chocolate pede um recheio que contraste. Uma fruta fica demais.');
falas('opcao', 'massa.redvelvet', 'feliz', 'Red velvet! Aveludada, com aquela cor que arranca suspiro no corte.', 'Red velvet é pura elegância. Com um recheio claro, o contraste fica lindo.');
falas('opcao', 'massa.cenoura', 'feliz', 'Cenoura, receita de vó! Bem úmida, tem gosto de casa.', 'Bolo de cenoura conquista qualquer idade. Já sabe o recheio que ele pede, né?');
falas('opcao', 'massa.limao', 'neutra', 'Massa de limão: leve, cítrica e perfumada.', 'Limão na massa deixa o bolo fresco. Ótimo para o nosso calor.');
falas('opcao', 'massa.morango', 'feliz', 'Massa de morango, rosada e com fruta de verdade.', 'Morango na massa! Fica uma graça quando corta.');

/* ───────── Opções: recheios (os nomes de marca do catálogo viram descrição: "creme de leite em pó", "creme de avelã") ───────── */
falas('opcao', 'recheio.brigadeiro', 'feliz', 'Brigadeiro! Tem recheio mais brasileiro que esse?', 'Brigadeiro cremoso agrada do mais novo ao mais velho.');
falas('opcao', 'recheio.ninho', 'feliz', 'Creme de leite em pó: suave, cremoso e sempre muito pedido.', 'Esse creme de leite em pó combina com quase tudo. Escolha segura.');
falas('opcao', 'recheio.morango', 'neutra', 'Recheio de morango com pedaços da fruta. Fresco e clássico.', 'Morango no recheio traz frescor e uma cor linda no corte.');
falas('opcao', 'recheio.docedeleite', 'feliz', 'Doce de leite no ponto de colher. Difícil é parar de comer.', 'Doce de leite é intenso. Uma camada já marca presença.');
falas('opcao', 'recheio.limao', 'neutra', 'Mousse de limão: azedinha e refrescante.', 'Limão no recheio limpa o paladar. Ótimo com massa mais doce.');
falas('opcao', 'recheio.maracuja', 'feliz', 'Maracujá! Azedinho na medida, levanta qualquer bolo.', 'Mousse de maracujá é perfume puro. Combina demais com chocolate.');
falas('opcao', 'recheio.nutella', 'feliz', 'Creme de avelã! Para quem gosta de chocolate com personalidade.', 'Creme de avelã é intenso e marcante. Vai bem com uma fruta por perto.');
falas('opcao', 'recheio.coco', 'neutra', 'Beijinho cremoso com coco fresco. Tem cheiro de festa de criança.', 'Coco deixa o recheio macio e perfumado.');
falas('opcao', 'recheio.framboesa', 'neutra', 'Framboesa: intensa e levemente ácida. Escolha de quem entende.', 'Framboesa dá cor e acidez. Fica sofisticado.');

/* ───────── Opções: coberturas e estilos ───────── */
falas('opcao', 'cobertura.buttercream', 'neutra', 'Buttercream: lisinho, firme e ótimo para decorar.', 'Buttercream segura bem o formato. Bom para bicos e para o nosso calor.');
falas('opcao', 'cobertura.chantilly', 'neutra', 'Chantilly: leve, aerado e bem branco.', 'Chantilly é delicado. Combina com fruta fresca que é uma beleza.');
falas('opcao', 'cobertura.ganache', 'feliz', 'Ganache! Chocolate nobre com aquele brilho de dar água na boca.', 'Ganache deixa o bolo intenso e brilhante. Coisa fina.');
falas('opcao', 'cobertura.glace', 'surpresa', 'Glacê espelhado: liso como um espelho. Impressiona.', 'Esse brilho do glacê espelhado fica lindo com poucos enfeites.');
falas('opcao', 'cobertura.chocolate', 'feliz', 'Cobertura cremosa de chocolate, espatulada. Dá vontade de passar o dedo.', 'Chocolate cremoso por fora: bolo com cara de aconchego.');
falas('opcao', 'cobertura.mousse', 'neutra', 'Mousse na cobertura: aveludada, parece uma nuvem.', 'Cobertura de mousse fica suave e delicada.');
falas('opcao', 'cobertura.naked', 'neutra', 'Naked! A massa à mostra tem um charme rústico.', 'No naked, o recheio aparece. Vale caprichar nas cores das camadas.');
falas('opcao', 'estilo.liso', 'neutra', 'Liso: alisado na espátula, limpo e elegante.');
falas('opcao', 'estilo.rustico', 'neutra', 'Espatulado, com as marcas da espátula. Tem jeito de feito à mão.');
falas('opcao', 'estilo.pente', 'neutra', 'Riscado no pente. Um detalhe simples que dá textura.');
falas('opcao', 'estilo.ombre', 'feliz', 'Degradê! Duas cores se encontrando com suavidade.');
falas('opcao', 'estilo.aquarela', 'feliz', 'Aquarela: manchas suaves de cor. Cada bolo fica único.');
falas('opcao', 'estilo.listras', 'feliz', 'Listras! Dão ritmo ao bolo. Fica moderno e alegre.');
falas('opcao', 'estilo.seminaked', 'neutra', 'Semi-naked: a massa aparece de leve sob o creme. Rústico e delicado.');
falas('opcao', 'estilo.respingo', 'surpresa', 'Respingo dourado! Um toque de brilho que deixa tudo mais festivo.');

/* ───────── Opções: bicos ───────── */
falas('opcao', 'bico.liso', 'neutra', 'Sem bico. A cobertura fica lisa, só ela.');
falas('opcao', 'bico.bolinhas', 'neutra', 'Bolinhas: pingos delicados na borda. Discreto e caprichado.');
falas('opcao', 'bico.perolao', 'feliz', 'Pérolas grandes, bem gordinhas. Dão um acabamento fofo.');
falas('opcao', 'bico.conchas', 'neutra', 'Conchas, a borda clássica de confeitaria. Nunca falha.');
falas('opcao', 'bico.estrelas', 'feliz', 'Estrelas feitas uma a uma. Trabalho de paciência, e fica lindo.');
falas('opcao', 'bico.rosetas', 'feliz', 'Rosetas! Espirais generosas de creme. Minhas preferidas.');
falas('opcao', 'bico.folhas', 'neutra', 'Folhas em guirlanda. Combina muito com flores.');
falas('opcao', 'bico.corda', 'neutra', 'Corda: um cordão torcido que emoldura o bolo.');
falas('opcao', 'bico.ziguezague', 'feliz', 'Zigue-zague! Vai e vem cheio de movimento.');
falas('opcao', 'bico.babado', 'feliz', 'Babado ondulado. Bem romântico, parece renda.');
falas('opcao', 'bico.vintage', 'surpresa', 'Vintage! Guirlandas, conchas e lacinhos. É trabalho de artista.');
falas('opcao', 'onde.top', 'neutra', 'Bico no topo, emoldurando a decoração.');
falas('opcao', 'onde.base', 'neutra', 'Bico na base, dando acabamento ao pé do bolo.');
falas('opcao', 'onde.both', 'neutra', 'Topo e base: moldura completa.');

/* ───────── Opções: decorações ───────── */
falas('opcao', 'decor.frutas', 'feliz', 'Frutas frescas! Cor, brilho e frescor de uma vez.');
falas('opcao', 'decor.morangos', 'feliz', 'Morangos banhados no chocolate. Tem enfeite mais gostoso?');
falas('opcao', 'decor.cerejas', 'feliz', 'Cerejas com cabinho. Um charme de bolo de antigamente.');
falas('opcao', 'decor.flores', 'feliz', 'Rosas de açúcar modeladas à mão. Delicadeza pura.');
falas('opcao', 'decor.margaridas', 'feliz', 'Margaridas! Deixam o bolo alegre e leve.');
falas('opcao', 'decor.peonias', 'surpresa', 'Peônias, grandes e cheias. Uma só já faz presença.');
falas('opcao', 'decor.macarons', 'feliz', 'Macarons no bolo! Chique e colorido.');
falas('opcao', 'decor.brigadeiros', 'feliz', 'Brigadeiros por cima. Enfeite que some rápido da mesa.');
falas('opcao', 'decor.bombons', 'feliz', 'Bombons e trufas. Para os apaixonados por chocolate.');
falas('opcao', 'decor.suspiros', 'feliz', 'Suspiros! Crocantes, leves e com cara de nuvem.');
falas('opcao', 'decor.marshmallows', 'feliz', 'Marshmallows coloridos. A criançada adora.');
falas('opcao', 'decor.biscoitos', 'feliz', 'Biscoito recheado no topo. Divertido e crocante.');
falas('opcao', 'decor.wafer', 'surpresa', 'Cerca de chocolate em volta do bolo. Parece um presente embrulhado.');
falas('opcao', 'decor.pirulitos', 'comemora', 'Pirulitos em espiral! Pura festa.');
falas('opcao', 'decor.raspas', 'neutra', 'Raspas de chocolate belga. Simples e elegante.');
falas('opcao', 'decor.granulado', 'feliz', 'Granulado crocante. Lembra brigadeiro de festa.');
falas('opcao', 'decor.confete', 'comemora', 'Confete colorido! Alegria em forma de enfeite.');
falas('opcao', 'decor.perolas', 'neutra', 'Pérolas de açúcar. Um brilho delicado.');
falas('opcao', 'decor.ouro', 'surpresa', 'Folha de ouro! Um luxo. Um pouco já ilumina o bolo.');
falas('opcao', 'decor.velas', 'comemora', 'Velas! Agora sim, tem parabéns.');
falas('opcao', 'decor.topo', 'feliz', 'Topo de estrelas douradas. Dá altura e brilho ao bolo.');
falas('opcao', 'decor.baloes', 'comemora', 'Balões no palito! Agora virou festa.');
falas('opcao', 'decor.lacos', 'feliz', 'Um laço de açúcar. Parece um presente.');
falas('opcao', 'decor.coracoes', 'feliz', 'Corações! Bolo cheio de carinho.');
falas('opcao', 'decor.borboletas', 'feliz', 'Borboletas pousadas no bolo. Fica leve, quase voando.');

/* ───────── Opções: velas, arranjo, quantidade, calda, mensagem ───────── */
falas('opcao', 'vela.classica', 'feliz', 'Velas clássicas, listradas. Não esquece de fazer um pedido.');
falas('opcao', 'vela.numero', 'feliz', 'Vela de número! Mostra a idade com orgulho.');
falas('opcao', 'vela.faisca', 'comemora', 'Vela faísca! Solta estrelinhas na hora do parabéns.');
falas('opcao', 'velas.qtd', 'feliz', 'Ajustando as velas. Pulmão preparado?', 'Quantas velas! Vai precisar de fôlego.', 'Velas na conta certa.');
falas('opcao', 'velas.numero', 'feliz', 'Idade anotada. Ninguém vai errar a conta no parabéns.');
falas('opcao', 'arranjo.coroa', 'neutra', 'Em coroa: os enfeites fazem a volta no topo. Clássico.');
falas('opcao', 'arranjo.cascata', 'feliz', 'Cascata! Os enfeites descem pela lateral. Efeito lindo.');
falas('opcao', 'arranjo.meialua', 'neutra', 'Meia-lua: assimétrico e moderno.');
falas('opcao', 'arranjo.centro', 'neutra', 'Tudo no centro: o olhar vai direto para lá.');
falas('opcao', 'arranjo.espalhado', 'neutra', 'Espalhado, bem natural.');
falas('opcao', 'qtd.pouco', 'neutra', 'Pouco: um toque só. Menos também é bonito.');
falas('opcao', 'qtd.medio', 'neutra', 'Quantidade média: na medida.');
falas('opcao', 'qtd.farto', 'feliz', 'Farto! Capricha, que festa é festa.');
falas('opcao', 'calda.on', 'feliz',
  'Calda escorrendo! Dá vontade de passar o dedo.',
  'Ah, a calda. Esse escorrido deixa qualquer bolo mais guloso.',
  'Com calda! Cada gota cai num lugar, por isso nenhum bolo fica igual.',
);
falas('opcao', 'calda.off', 'neutra', 'Sem calda. O bolo fica mais limpo.');
falas('opcao', 'mensagem.placa', 'feliz', 'Mensagem na plaquinha! Agora o bolo tem dono.', 'Recado anotado. Vai na plaquinha, no alto do bolo.');
falas('opcao', 'mensagem.bico', 'feliz', 'Escrita com bico, direto no topo. Feita à mão, letra por letra.', 'Mensagem escrita no bolo. Fica pessoal, eu adoro.');
falas('opcao', 'mensagem.tirou', 'neutra', 'Sem mensagem. O bolo fala por si.');
falas('opcao', 'topo.nome', 'feliz', 'Topo personalizado! Um nome recortado dá destaque.', 'Um topo com nome deixa o bolo único.');
falas('opcao', 'nome', 'feliz', 'Bolo batizado! Gostei do nome.', 'Dar nome ao bolo: agora ele é oficialmente seu.');
falas('opcao', 'fundo', 'neutra', 'Mudou o cenário. O bolo continua sendo a estrela.', 'Fundo novo! Bom para ver como as cores se comportam.');

/* ───────── Genéricas por tipo (opção que a Bô ainda não conhece) ───────── */
falas('tag', 'tipo.massa', 'neutra', 'Boa massa. Vamos ver com que recheio ela conversa.', 'Anotado. Essa massa promete.', 'Gostei da escolha de massa.');
falas('tag', 'tipo.recheio', 'feliz', 'Bom recheio! Já estou imaginando a fatia.', 'Recheio escolhido. Vai ficar gostoso.', 'Anotado o recheio. Boa pedida.');
falas('tag', 'tipo.cobertura', 'neutra', 'Cobertura trocada. Olha como muda o bolo todo.', 'Essa cobertura veste bem.', 'Boa escolha de cobertura.');
falas('tag', 'tipo.estilo', 'neutra', 'Novo estilo! A espátula faz diferença.', 'Gostei desse acabamento.', 'Estilo trocado. Ficou com outra cara.');
falas('tag', 'tipo.bico', 'neutra', 'Bico trocado. Detalhe que conta.', 'Esse bico dá um acabamento bonito.', 'Boa, acabamento novo.');
falas('tag', 'tipo.decor', 'feliz', 'Enfeite novo no bolo!', 'Boa adição. O bolo vai ganhando vida.', 'Gostei desse enfeite.');
falas('tag', 'tipo.decor.tirou', 'neutra', 'Tirou um enfeite. O topo respira melhor.', 'Menos um. Às vezes, limpar deixa mais bonito.', 'Enfeite retirado. Sem problema.');
falas('tag', 'tipo.decor.limpou', 'neutra', 'Topo limpo! Recomeçar a decoração também é criar.');
falas('tag', 'tipo.formato', 'neutra', 'Formato novo. Muda a personalidade do bolo.', 'Outro formato! Vamos ver como fica.');
falas('tag', 'tipo.tamanho', 'neutra', 'Tamanho ajustado.', 'Mudou o tamanho. As fatias acompanham.');
falas('tag', 'tipo.base', 'neutra', 'Base trocada. É a moldura do bolo.', 'Boa base. Detalhe que aparece na foto.');
falas('tag', 'tipo.arranjo', 'neutra', 'Mudou o arranjo. Olha como o topo respira diferente.', 'Outro arranjo! Às vezes é só isso que faltava.', 'Boa. Mexer no arranjo muda tudo.');
falas('tag', 'tipo.cor', 'neutra', 'Cor nova! Olha como o bolo muda de humor.', 'Gostei dessa cor.', 'Trocar a cor é o jeito mais rápido de mudar tudo.', 'Essa cor tem presença.');

/* ───────── Genéricas por tag: sabor ───────── */
falas('tag', 'tag.sabor.chocolate', 'feliz', 'Chocolate nunca decepciona.', 'Para quem ama chocolate, escolha certa.');
falas('tag', 'tag.sabor.frutado', 'neutra', 'Sabor de fruta traz frescor para o bolo.', 'Fruta no bolo equilibra o doce.');
falas('tag', 'tag.sabor.citrico', 'neutra', 'Um toque cítrico deixa tudo mais leve.');
falas('tag', 'tag.sabor.cremoso', 'feliz', 'Cremoso do jeito que a gente gosta.');
falas('tag', 'tag.sabor.caramelo', 'feliz', 'Caramelo! Aquele dourado que abraça.');
falas('tag', 'tag.sabor.castanhas', 'neutra', 'Castanhas dão sabor e uma textura ótima.');
falas('tag', 'tag.sabor.coco', 'neutra', 'Coco perfuma o bolo todo.');
falas('tag', 'tag.sabor.cafe', 'feliz', 'Café no bolo! Sabor de gente grande, e é uma delícia.');
falas('tag', 'tag.sabor.especiarias', 'neutra', 'Especiarias deixam o bolo perfumado e aconchegante.');
falas('tag', 'tag.sabor.leve', 'neutra', 'Escolha leve. Dá para repetir a fatia.');
falas('tag', 'tag.sabor.intenso', 'neutra', 'Sabor intenso. Esse marca presença.');
falas('tag', 'tag.sabor.doce', 'neutra', 'Esse é bem doce. Vale pensar num vizinho mais fresco.');
falas('tag', 'tag.sabor.azedinho', 'neutra', 'Azedinho na medida. Equilibra o doce que é uma beleza.');
falas('tag', 'tag.sabor.crocante', 'feliz', 'Um crocante no meio muda a mordida. Adoro.');
falas('tag', 'tag.sabor.classico', 'neutra', 'Um clássico. E clássico é clássico porque funciona.');
falas('tag', 'tag.sabor.infantil', 'feliz', 'Esse a criançada aprova de olhos fechados.');
falas('tag', 'tag.sabor.adulto', 'neutra', 'Sabor mais adulto, sofisticado.');

/* ───────── Genéricas por tag: cobertura, estilo e bico ───────── */
falas('tag', 'tag.estilo.firme', 'neutra', 'Essa é firme. Aguenta bem o transporte e o nosso calor.');
falas('tag', 'tag.estilo.delicado', 'neutra', 'Bem delicada. Pede geladeira até a hora de servir.');
falas('tag', 'tag.estilo.brilhante', 'feliz', 'Brilho bonito! Reflete a luz da festa.');
falas('tag', 'tag.estilo.fosco', 'neutra', 'Acabamento fosco, discreto e elegante.');
falas('tag', 'tag.estilo.rustico', 'neutra', 'Um ar rústico, de feito em casa. Tem muito charme.');
falas('tag', 'tag.estilo.elegante', 'neutra', 'Elegante. Menos é mais.');
falas('tag', 'tag.estilo.moderno', 'neutra', 'Bem moderno. Linhas limpas.');
falas('tag', 'tag.estilo.vintage', 'feliz', 'Estilo vintage. Lembra as confeitarias de antigamente.');
falas('tag', 'tag.estilo.divertido', 'feliz', 'Divertido! Bolo com bom humor.');

/* ───────── Genéricas por tag: decoração ───────── */
falas('tag', 'tag.decor.fruta', 'feliz', 'Fruta no topo dá cor e frescor.');
falas('tag', 'tag.decor.flor', 'feliz', 'Flores deixam qualquer bolo mais delicado.');
falas('tag', 'tag.decor.chocolate', 'feliz', 'Chocolate na decoração. Nunca é demais.');
falas('tag', 'tag.decor.doce', 'feliz', 'Doce de enfeite! Decoração que dá para comer é a melhor.');
falas('tag', 'tag.decor.brilho', 'feliz', 'Um brilho a mais. Festa pede.');
falas('tag', 'tag.decor.papel', 'neutra', 'Enfeite de papel: leve e cheio de graça.');
falas('tag', 'tag.decor.tematico', 'feliz', 'Enfeite temático! A festa já tem cara.');
falas('tag', 'tag.decor.infantil', 'feliz', 'Esse é sucesso com a criançada.');
falas('tag', 'tag.decor.romantico', 'feliz', 'Romântico. Tem alguém especial nessa história?');
falas('tag', 'tag.decor.festa', 'comemora', 'Agora sim, clima de festa.');
falas('tag', 'tag.decor.elegante', 'neutra', 'Um toque elegante. Fica fino.');
falas('tag', 'tag.decor.divertido', 'feliz', 'Divertido! Vai arrancar sorriso.');
falas('tag', 'tag.decor.rustico', 'neutra', 'Rústico e charmoso.');
falas('tag', 'tag.decor.vintage', 'neutra', 'Um ar de antigamente. Lindo.');
falas('tag', 'tag.decor.natal', 'comemora', 'Clima de Natal! Já sinto cheiro de rabanada.');
falas('tag', 'tag.decor.pascoa', 'feliz', 'Páscoa chegando! Chocolate liberado.');
falas('tag', 'tag.decor.junino', 'comemora', 'Festa junina! Só falta a fogueira.');
falas('tag', 'tag.decor.halloween', 'surpresa', 'Dia das bruxas! Bolo assustadoramente bonito.');
falas('tag', 'tag.decor.casamento', 'feliz', 'Com cara de casamento. Vivam os noivos!');
falas('tag', 'tag.decor.bebe', 'feliz', 'Para a chegada de um bebê. Que fase gostosa.');
falas('tag', 'tag.decor.formatura', 'comemora', 'Formatura! Uma conquista dessas merece bolo.');

/* ───────── Combinações: massa + recheio ───────── */
falas('combo', 'combo.chocolate+maracuja', 'feliz', 'Chocolate com maracujá! O azedinho corta o doce. Combinação de mestre.');
falas('combo', 'combo.chocolate+morango', 'feliz', 'Chocolate com morango é um clássico que nunca erra.');
falas('combo', 'combo.chocolate+framboesa', 'feliz', 'Chocolate e framboesa: intenso com ácido. Coisa de confeitaria fina.');
falas('combo', 'combo.chocolate+brigadeiro', 'feliz', 'Chocolate com brigadeiro. Para quem ama chocolate de verdade.');
falas('combo', 'combo.chocolate+nutella', 'neutra', 'Chocolate com creme de avelã: intenso em dobro. Uma fruta por perto cairia bem.');
falas('combo', 'combo.chocolate+coco', 'feliz', 'Chocolate com coco. Dupla de padaria que todo mundo ama.');
falas('combo', 'combo.chocolate+ninho', 'feliz', 'Chocolate com creme de leite em pó: o escuro e o claro. Lindo no corte.');
falas('combo', 'combo.chocolate+docedeleite', 'neutra', 'Chocolate com doce de leite: bem doce, bem brasileiro.');
falas('combo', 'combo.chocolate+limao', 'surpresa', 'Chocolate com limão é ousado. O cítrico acorda o chocolate.');
falas('combo', 'combo.baunilha+morango', 'feliz', 'Baunilha com morango lembra morango com creme. Não tem como errar.');
falas('combo', 'combo.baunilha+ninho', 'feliz', 'Baunilha com creme de leite em pó. Suave, quase um abraço.');
falas('combo', 'combo.baunilha+docedeleite', 'feliz', 'Baunilha com doce de leite. Simples e certeiro.');
falas('combo', 'combo.baunilha+brigadeiro', 'feliz', 'Baunilha com brigadeiro: o bolo de aniversário da infância.');
falas('combo', 'combo.baunilha+coco', 'neutra', 'Baunilha e coco: delicado e perfumado.');
falas('combo', 'combo.baunilha+maracuja', 'feliz', 'Baunilha com maracujá: a massa suave deixa a fruta aparecer.');
falas('combo', 'combo.redvelvet+ninho', 'feliz', 'Red velvet com creme branco: o contraste clássico. Lindo e gostoso.');
falas('combo', 'combo.redvelvet+framboesa', 'feliz', 'Red velvet com framboesa. Combina na cor e no sabor.');
falas('combo', 'combo.redvelvet+morango', 'feliz', 'Red velvet com morango: vermelho com vermelho, uma graça.');
falas('combo', 'combo.cenoura+brigadeiro', 'comemora', 'Cenoura com brigadeiro! O casamento mais feliz da confeitaria brasileira.');
falas('combo', 'combo.cenoura+docedeleite', 'feliz', 'Cenoura com doce de leite. Diferente e delicioso.');
falas('combo', 'combo.limao+limao', 'neutra', 'Limão na massa e no recheio: para quem gosta de bolo bem fresco.');
falas('combo', 'combo.limao+coco', 'feliz', 'Limão com coco: fresco e tropical.');
falas('combo', 'combo.limao+framboesa', 'feliz', 'Limão com framboesa: cítrico com fruta vermelha. Bem vibrante.');
falas('combo', 'combo.limao+ninho', 'feliz', 'Limão com creme de leite em pó: o azedinho e o suave em equilíbrio.');
falas('combo', 'combo.morango+ninho', 'feliz', 'Massa de morango com creme de leite em pó. Doce e delicado, uma graça.');
falas('combo', 'combo.morango+brigadeiro', 'feliz', 'Morango com brigadeiro lembra bombom de morango.');
falas('combo', 'combo.morango+morango', 'feliz', 'Morango em dose dupla! Para os fãs da fruta.');
falas('combo', 'combo.morango+nutella', 'feliz', 'Morango com creme de avelã. Dá até para ouvir os suspiros.');

/* ───────── Combinações arriscadas (sincera, sem debochar) ───────── */
falas('combo', 'combo.risco.citrico-chocolate', 'pensando',
  'Limão com recheio de chocolate é ousado: os dois disputam a atenção. Quer uma sugestão?',
  'Cítrico com chocolate ao leite divide opiniões. Se é o seu gosto, vai fundo.',
);
falas('combo', 'combo.risco.cenoura-acido', 'pensando',
  'Cenoura com recheio azedinho é incomum. O par clássico dela é o brigadeiro.',
  'Bolo de cenoura costuma pedir um recheio mais doce. Quer ver uma sugestão?',
);
falas('combo', 'combo.risco.delicada-acido', 'pensando',
  'Essa massa é delicada, e um recheio muito ácido pode cobrir o sabor dela.',
  'Recheio bem ácido rouba a cena dessa massa. Um creme suave valoriza mais.',
);
falas('combo', 'combo.risco.limao-docedeleite', 'pensando', 'Limão com doce de leite: o azedo e o bem doce. É contraste forte, tem quem ame.');

/* ───────── Combinações entre recheios ───────── */
falas('combo', 'duo.brigadeiro+ninho', 'feliz', 'Brigadeiro e creme de leite em pó juntos: o famoso casadinho. Sucesso de festa.');
falas('combo', 'duo.morango+ninho', 'feliz', 'Morango com creme de leite em pó: uma das duplas mais queridas das festas.');
falas('combo', 'duo.coco+maracuja', 'feliz', 'Maracujá com coco: tropical até dizer chega.');
falas('combo', 'duo.brigadeiro+morango', 'feliz', 'Brigadeiro e morango: dupla de bombom.');
falas('combo', 'duo.coco+docedeleite', 'feliz', 'Doce de leite com coco lembra cocada cremosa. Uma delícia.');
falas('combo', 'duo.morango+nutella', 'feliz', 'Creme de avelã com morango. Difícil alguém recusar.');
falas('combo', 'duo.brigadeiro+maracuja', 'feliz', 'Brigadeiro com maracujá: o doce e o azedinho se equilibram.');
falas('combo', 'duo.framboesa+ninho', 'feliz', 'Framboesa com creme de leite em pó: ácido e suave, bem equilibrado.');
falas('combo', 'duo.brigadeiro+nutella', 'neutra', 'Brigadeiro e creme de avelã: chocolate sobre chocolate. Para os fortes.');
falas('combo', 'duo.framboesa+limao', 'neutra', 'Limão e framboesa juntos: bem azedinho. Refrescante de verdade.');
falas('combo', 'duo.brigadeiro+docedeleite', 'neutra', 'Brigadeiro com doce de leite: dois doces de panela. Bem brasileiro, bem doce.');
falas('combo', 'duo.iguais', 'neutra', 'O mesmo recheio em todas as camadas: sabor bem marcado.');
falas('combo', 'combo.camadas', 'feliz', 'Massas diferentes em cada camada! No corte, fica um espetáculo.', 'Misturar massas é ideia de quem gosta de surpresa na fatia.');

/* ───────── Combinações por tag (valem para qualquer catálogo) ───────── */
falas('combo', 'combo.tag.chocolate-fruta', 'feliz', 'Chocolate com fruta sempre dá certo: um realça o outro.', 'Fruta com chocolate é par perfeito. O fresco equilibra o intenso.');
falas('combo', 'combo.tag.doce-azedo', 'feliz', 'Doce com azedinho: equilíbrio de confeiteira.', 'Esse contraste de doce com ácido deixa o bolo mais leve de comer.');
falas('combo', 'combo.tag.tudo-doce', 'pensando',
  'Está tudo bem doce por aqui. Um recheio de fruta daria um respiro.',
  'Camadas doces em sequência. Que tal um azedinho no meio para equilibrar?',
  'Muito doce junto cansa o paladar. Posso sugerir um contraponto?',
);
falas('combo', 'combo.tag.tudo-azedo', 'pensando', 'Bastante acidez junta. Um recheio cremoso acalmaria.', 'Azedinho em todas as camadas. Um creme suave no meio equilibra.');
falas('combo', 'combo.tag.tudo-intenso', 'pensando', 'Sabores intensos em todas as camadas. Fica marcante; uma camada suave daria descanso.', 'Bolo potente! Se quiser aliviar, troca um recheio por algo mais leve.');
falas('combo', 'combo.tag.tropical', 'feliz', 'Coco com fruta: sabor tropical.');
falas('combo', 'combo.tag.cafe-chocolate', 'feliz', 'Café com chocolate: combinação de cafeteria.');
falas('combo', 'combo.tag.castanha-caramelo', 'feliz', 'Castanha com caramelo: crocante e dourado. Fino.');
falas('combo', 'combo.tag.cremoso-crocante', 'feliz', 'Cremoso com crocante: a melhor mordida.');
falas('combo', 'combo.tag.equilibrado', 'feliz', 'Essa combinação está equilibrada. Aprovado.', 'Gostei da dupla. Um sabor apoia o outro.');

/* ───────── Cores ───────── */
falas('cor', 'cor.fam.branco', 'neutra', 'Branco: clássico, combina com qualquer enfeite.');
falas('cor', 'cor.fam.creme', 'neutra', 'Creme é suave e aconchegante.');
falas('cor', 'cor.fam.rosa', 'feliz', 'Rosa! Delicado, e é a cor aqui da casa.');
falas('cor', 'cor.fam.vermelho', 'surpresa', 'Vermelho é ousado. Chama o olhar na mesa.');
falas('cor', 'cor.fam.laranja', 'feliz', 'Tom de coral: alegre e caloroso.');
falas('cor', 'cor.fam.amarelo', 'feliz', 'Amarelo traz sol para o bolo.');
falas('cor', 'cor.fam.verde', 'neutra', 'Verde! Fresco, lembra jardim.');
falas('cor', 'cor.fam.azul', 'neutra', 'Azul em bolo é charmoso. Fica lindo com branco.');
falas('cor', 'cor.fam.roxo', 'feliz', 'Lilás e roxo dão um ar de encanto.');
falas('cor', 'cor.fam.marrom', 'feliz', 'Tons de chocolate. Só de olhar dá vontade.');
falas('cor', 'cor.fam.preto', 'surpresa', 'Cor escura é dramática. Dourado e frutas vermelhas brilham em cima dela.');
falas('cor', 'cor.livre', 'feliz', 'Cor personalizada! Aqui a gente mistura até chegar no tom.');
falas('cor', 'cor.complementar', 'feliz',
  'Essas duas cores são opostas, por isso vibram tanto juntas.',
  'Cores opostas! Uma destaca a outra. Chama a atenção.',
  'Contraste forte e bonito. As cores se valorizam.',
);
falas('cor', 'cor.analoga', 'feliz',
  'Cores vizinhas, harmonia garantida. Fica suave.',
  'Tons próximos: o bolo fica elegante e tranquilo.',
  'Essa paleta conversa bem. Tudo no mesmo clima.',
);
falas('cor', 'cor.triade', 'comemora', 'Três cores bem distribuídas: alegre, com cara de festa.', 'Paleta colorida e equilibrada. Festiva!');
falas('cor', 'cor.mono', 'neutra', 'Tom sobre tom. Discreto e muito elegante.', 'Tudo na mesma família de cor: bem sofisticado.');
falas('cor', 'cor.pastel', 'feliz', 'Paleta de tons pastel. Delicada, parece doce de vitrine.', 'Cores claras e suaves. Um sonho.');
falas('cor', 'cor.bico.some', 'pensando',
  'O bico está quase da cor da cobertura. Fica discreto; se quiser destaque, troca a cor.',
  'Tom sobre tom no bico: elegante, mas o desenho aparece pouco.',
  'O bico some um pouco nessa cor. Quer que ele apareça mais?',
);
falas('cor', 'cor.calda.some', 'pensando',
  'A calda está muito próxima da cor da cobertura. Quase não aparece.',
  'Calda e cobertura no mesmo tom: o escorrido se perde. Outra cor faria ela aparecer.',
  'Para a calda aparecer, ela precisa contrastar com a cobertura.',
);
falas('cor', 'cor.calda.escura', 'pensando',
  'Calda escura em cobertura escura some. Uma cor clara faria ela brilhar.',
  'Escuro sobre escuro esconde a calda. Um tom claro ou dourado resolve.',
);
falas('cor', 'cor.muitas', 'pensando', 'Bastante cor junta! Para festa alegre, ótimo. Para algo elegante, eu tiraria uma.', 'O bolo está bem colorido. Se quiser mais calma, repete uma das cores.');
falas('cor', 'cor.escuro', 'neutra', 'Em cobertura escura, dourado e frutas vermelhas ficam um luxo.', 'Fundo escuro pede um enfeite claro ou brilhante por cima.');
falas('cor', 'cor.claro', 'neutra', 'Cobertura clara é uma tela em branco: qualquer enfeite aparece.');
falas('cor', 'cor.repete', 'feliz', 'Repetiu a cor no enfeite. É isso que amarra o visual.');
falas('cor', 'paleta', 'feliz', 'Paleta aplicada! Cores que já nasceram combinando.', 'Essa paleta é bonita. Tudo conversa.', 'Boa! Paleta pronta poupa tempo e acerta.');

/* ───────── Estrutura e equilíbrio ───────── */
falas('estrutura', 'topo.lotado', 'pensando',
  'O topo está ficando cheio. Se tirar um enfeite, os outros aparecem mais.',
  'Muita coisa em cima. Menos enfeites, mais destaque para cada um.',
  'Eita, topo concorrido! Vale escolher os preferidos.',
);
falas('estrutura', 'decor.max', 'neutra', 'Chegamos ao limite de enfeites. Para pôr outro, tira um antes.', 'O bolo está completo de enfeites. Daqui, só trocando.');
falas('estrutura', 'alto.estreito', 'neutra', 'Bolo alto e estreito fica elegante. Para cortar, a fatia tem que ser mais fina.', 'Bem alto para a largura. Chama a atenção e pede cuidado no transporte. A gente cuida.');
falas('estrutura', 'torre', 'neutra', 'Bolo de andares pede sustentação por dentro. Pode ficar tranquilo, isso é com a gente.', 'Bolo de andares é montado com apoio interno. Chega firme na festa.');
falas('estrutura', 'naocoube', 'preocupada',
  ['Esse não coube no topo. Não entra na conta, mas vale reorganizar.', 'Não coube no topo: {nomes}. Não entra na conta, mas vale reorganizar.'],
  ['Ops, faltou espaço para tudo. O que não coube não é cobrado.', 'Ops, faltou espaço para {nomes}. O que não coube não é cobrado.'],
  ['Não coube tudo. Um bolo maior ou um enfeite a menos resolve.', 'Não coube: {nomes}. Um bolo maior ou um enfeite a menos resolve.'],
);
falas('estrutura', 'adaptado', 'neutra', 'Os enfeites se ajeitaram para caber. Ficou bem distribuído.', 'O topo se reorganizou para tudo caber direito.');
falas('estrutura', 'escrita.naocabe', 'pensando', 'A escrita com bico precisa de espaço no topo. Na plaquinha cabe certo.', 'Mensagem longa para esse topo. A plaquinha resolve.');
falas('estrutura', 'disputa', 'pensando', 'Bico trabalhado e muito enfeite disputam espaço. Escolhe quem é a estrela.');
falas('estrutura', 'simples', 'neutra', 'Bolo liso, sem enfeite. Minimalista também é estilo.');

/* ───────── Alertas e regras do confeiteiro ───────── */
falas('alerta', 'regra.bloqueia', 'preocupada',
  'Opa, assim o bolo não fica de pé. Olha o aviso.',
  'Desse jeito o bolo não se sustenta. Dá uma olhada no que eu anotei.',
  'Esse ponto precisa de ajuste antes de seguir.',
);
falas('alerta', 'regra.alerta', 'preocupada', 'Um alerta de confeiteira. Dá uma olhada.', 'Atenção a um detalhe aqui.', 'Isso merece cuidado. Deixei anotado.');
falas('alerta', 'regra.dica', 'neutra', 'Uma dica rápida sobre essa escolha.', 'Anotei uma sugestão para você.', 'Palpite de confeiteira: olha só.');
falas('alerta', 'calor', 'neutra',
  'Cobertura delicada e calor não são amigos. Mantém na geladeira até a hora de servir.',
  'No calor de Cuiabá, bolo delicado vai da geladeira direto para a mesa.',
  'Cobertura delicada gosta de frio. Deixa para tirar da geladeira na hora do parabéns.',
);
falas('alerta', 'peso.delicado', 'pensando',
  'Enfeite pesado em cobertura delicada pode marcar. Uma cobertura mais firme segura melhor.',
  'Muito peso sobre creme leve. Se quiser segurança, vai de cobertura firme.',
  'Cobertura leve com enfeite pesado pede geladeira e pouco tempo fora.',
);
falas('alerta', 'atendimento', 'neutra', 'Esse assunto é com o nosso atendimento. Lá eles respondem com todo o cuidado.', 'Para dúvidas sobre ingredientes, fala com o atendimento. É o caminho certo.');
falas('alerta', 'limite', 'neutra', 'Eu entendo de bolo e respondo pelos atalhos. Para outros assuntos, chama o atendimento.', 'Isso foge do meu forno. O atendimento resolve para você.');

/* ───────── Preço (a voz não diz valor; o balão mostra) ───────── */
falas('preco', 'preco.pesa', 'neutra',
  ['Isso pesa um pouquinho no preço. Dá uma olhada.', 'Esse item soma {delta} ao bolo, que agora sai por {preco}.'],
  ['Esse capricho custa um pouco mais. Só para você saber.', 'Esse capricho soma {delta}. O bolo agora sai por {preco}.'],
  ['O preço subiu um tanto com essa escolha. Vale conferir.', 'O preço subiu {delta} com essa escolha: agora {preco}.'],
  ['Fica lindo, e soma no valor. Olha lá no total.', 'Fica lindo, e soma {delta} no valor. Total: {preco}.'],
);
falas('preco', 'preco.pesa.muito', 'pensando',
  ['Essa escolha muda bastante o valor. Confere o total com calma.', 'Essa escolha soma {delta}. O bolo agora sai por {preco}.'],
  ['Subiu bem o preço agora. Se quiser, eu mostro um jeito de economizar.', 'Subiu {delta}: agora {preco}. Se quiser, eu mostro um jeito de economizar.'],
);
falas('preco', 'preco.baixou', 'feliz',
  ['Ficou mais em conta. E continua bonito.', 'Ficou {delta} mais em conta: agora {preco}. E continua bonito.'],
  ['O preço baixou com essa troca.', 'O preço baixou {delta} com essa troca: agora {preco}.'],
  ['Economia feita. Gostei.', 'Economia de {delta}. O bolo sai por {preco}.'],
);
falas('preco', 'preco.frete', 'feliz',
  ['Boa notícia: com esse bolo, a entrega sai de graça.', 'Boa notícia: passou de {limite}, a entrega sai grátis.'],
  ['Com esse valor, você não paga a entrega.', 'Com {preco}, você não paga a entrega (grátis acima de {limite}).'],
);
falas('preco', 'preco.pix', 'neutra', ['Pagando no Pix tem desconto. Fica a dica.', 'No Pix tem {pct}% de desconto: {pix}.']);
falas('preco', 'economia.sugestao', 'feliz',
  ['Achei um jeito de economizar sem mudar a ideia do bolo.', '{sugestao} Economiza {economia}.'],
  ['Dá para baixar o valor com uma troca esperta. Olha só.', '{sugestao} Economiza {economia}.'],
  ['Tenho uma sugestão que alivia o preço e mantém o estilo.', '{sugestao} Economiza {economia}.'],
);
falas('preco', 'economia.enxuto', 'neutra', 'Seu bolo já está enxuto. Não tem gordura para cortar.', 'Aqui não dá para economizar sem mudar a ideia. Está bem resolvido.');
falas('preco', 'preco.detalhe', 'neutra', 'Aqui você vê quanto custa cada parte do bolo. Tudo às claras.', 'O preço, item por item. Sem surpresa.');

/* ───────── Prazo ───────── */
falas('prazo', 'prazo.mais', 'neutra',
  ['Esse capricho pede mais tempo de ateliê. O prazo aumentou um pouco.', 'Esse capricho pede mais tempo: o preparo passa para {dias} dias.'],
  ['Trabalho assim leva mais um dia para ficar perfeito.', 'Trabalho assim leva mais tempo: {dias} dias de preparo.'],
  ['Esse detalhe é feito com calma. O prazo acompanha.', 'Esse detalhe é feito com calma: {dias} dias de preparo.'],
);
falas('prazo', 'prazo.andares', 'neutra',
  ['Bolo de três andares é obra. Precisa de mais dias de preparo.', 'Bolo de três andares é obra: {dias} dias de preparo.'],
  ['Para tantos andares, o ateliê pede prazo maior. Vale se programar.', 'Para tantos andares, o ateliê pede {dias} dias. Vale se programar.'],
);
falas('prazo', 'prazo.menos', 'feliz', ['Com essa troca, o bolo fica pronto mais rápido.', 'Com essa troca, o preparo cai para {dias} dias.']);
falas('prazo', 'prazo.info', 'neutra',
  ['Todo bolo aqui é feito sob encomenda, do zero.', 'Todo bolo é feito sob encomenda. Este pede {dias} dias de preparo; a data você escolhe no pedido.'],
  ['A gente não tem bolo de prateleira: o seu começa quando você pede.', 'O seu bolo começa quando você pede: {dias} dias de preparo, com entrega ou retirada.'],
);

/* ───────── Ocasião ───────── */
falas('ocasiao', 'ocasiao.aniversario.velas', 'pensando', 'Bolo de aniversário sem vela? Se quiser, tem na decoração.');
falas('ocasiao', 'ocasiao.infantil.sabor', 'neutra', 'Para festa de criança, brigadeiro e creme de leite em pó são aposta certa.');
falas('ocasiao', 'ocasiao.casamento.fatias', 'neutra', 'Para casamento, vale conferir as fatias: sempre aparece mais um convidado.');
falas('ocasiao', 'ocasiao.romantico.formato', 'feliz', 'Para um presente romântico, o formato de coração fala por você.');
falas('ocasiao', 'ocasiao.bebe.cores', 'feliz', 'Para chá de bebê, tons pastel ficam uma delicadeza.');
falas('ocasiao', 'ocasiao.formatura.topo', 'feliz', 'Formatura pede um topo com o nome. Fica uma lembrança linda.');
falas('ocasiao', 'elogio.tema.aniversario', 'comemora', 'Com cara de aniversário! Só falta cantar parabéns.');
falas('ocasiao', 'elogio.tema.romantico', 'feliz', 'Que bolo romântico. Alguém vai se emocionar.');
falas('ocasiao', 'elogio.tema.infantil', 'comemora', 'Bolo de festa de criança de verdade. Vai ter fila para a fatia.');
falas('ocasiao', 'elogio.tema.casamento', 'feliz', 'Tem cara de casamento. Elegante e delicado.');
falas('ocasiao', 'elogio.tema.bebe', 'feliz', 'Bolo de boas-vindas para um bebê. Coisa mais querida.');
falas('ocasiao', 'elogio.tema.formatura', 'comemora', 'Bolo de formatura! Esse diploma vem com cobertura.');
falas('ocasiao', 'elogio.tema.natal', 'comemora', 'Bolo de Natal! A ceia vai ficar completa.');

/* ───────── Elogios (sempre com motivo) ───────── */
falas('elogio', 'elogio.sabor', 'feliz',
  'Essa combinação de sabores está redonda. Dá para sentir o equilíbrio.',
  'Sabor bem pensado: tem doce, tem frescor, tem contraste.',
  'Quem montou esse recheio entende do assunto.',
  'Na boca, esse bolo vai ser um sucesso.',
);
falas('elogio', 'elogio.cor', 'feliz',
  'As cores estão conversando muito bem. Parece bolo de vitrine.',
  'Que paleta bonita! Dá vontade de fotografar.',
  'Esse contraste de cores ficou no ponto.',
  'Visual harmonioso. O olho agradece.',
);
falas('elogio', 'elogio.equilibrio', 'feliz', 'Nada sobrando, nada faltando. Bolo equilibrado.', 'Gosto de como cada enfeite tem o seu espaço.', 'Está tudo na medida. Isso é difícil de acertar.');
falas('elogio', 'elogio.classico', 'feliz', 'Um bolo clássico, sem erro. Vai agradar todo mundo.', 'Clássico e bem feito. Nunca sai de moda.');
falas('elogio', 'elogio.ousado', 'surpresa', 'Bolo ousado! Gosto de quem arrisca.', 'Diferente de tudo. Tem personalidade.');
falas('elogio', 'elogio.geral', 'feliz',
  'Esse bolo está ficando lindo. Capricha!',
  'Olha, se eu pudesse, pedia uma fatia.',
  'Está com cara de bolo de confeitaria premiada.',
  'Está ficando uma beleza. Continua assim.',
);

/* ───────── Incentivo, humor leve, ociosidade ───────── */
falas('papo', 'incentivo', 'feliz',
  'Vai no seu gosto. Não existe bolo errado.',
  'Pode testar à vontade. Aqui nada estraga.',
  'Experimenta! O bom do ateliê é poder mudar de ideia.',
  'Confia no seu olho. Você está indo bem.',
  'Sem pressa. Bolo bom se monta com calma.',
  'Capricha, que esse bolo é seu.',
);
falas('papo', 'humor', 'feliz',
  'Eu não como bolo, mas dou palpite que é uma beleza.',
  'Se bolo falasse, esse estaria pedindo festa.',
  'Confeiteira que é confeiteira prova a calda. Eu só olho, infelizmente.',
  'Dizem que eu sou doce demais. Culpa do recheio.',
  'Já montei tanto bolo hoje que estou vendo granulado.',
  'Bolo bonito é igual a música boa: dá vontade de repetir.',
  'Aqui no ateliê, a única regra é se divertir.',
  'Um segredo: todo bolo fica mais gostoso com gente querida em volta.',
);
falas('papo', 'ocioso', 'neutra',
  'Estou por aqui. Se quiser uma sugestão, é só tocar em mim.',
  'Pensando na próxima escolha? Sem pressa.',
  'Quer um palpite? Toca em mim que eu sugiro alguma coisa.',
  'Se der branco, pede para eu te surpreender.',
  'Vou aproveitar para alisar a cobertura. Me chama quando quiser.',
  'Pode pensar com calma. Bolo parado não esfria.',
);
falas('papo', 'acordou', 'surpresa', 'Opa, cochilei. Cheiro de bolo dá um sono bom.', 'Voltei! Onde a gente estava?');
falas('papo', 'rajada', 'surpresa',
  'Eita, quanta ideia boa de uma vez! Quando assentar, eu opino.',
  'Calma, que eu estou acompanhando! Mexe à vontade.',
  'Você está com a mão boa hoje. Vou só olhando.',
);
falas('papo', 'desfazer', 'neutra',
  'Desfeito. Errar faz parte da receita.',
  'Voltamos um passo. Sem problema nenhum.',
  'Mudou de ideia? Acontece nas melhores cozinhas.',
  'Desfazer é o melhor ingrediente do ateliê.',
);
falas('papo', 'refazer', 'neutra', 'Refeito! Era bom mesmo.', 'Voltou atrás na volta. Gostei da decisão.');
falas('papo', 'recomecar', 'neutra', 'Do zero! Bancada limpa, ideia nova.', 'Recomeçar faz bem. Vamos de novo.', 'Tudo limpo. Qual vai ser a ideia agora?');
falas('papo', 'surpresa.tela', 'surpresa',
  'Surpresa! Gostou? Se não, pede outra.',
  'Olha o que saiu! Às vezes o acaso acerta.',
  'Eita, essa eu não esperava. Tem potencial.',
  'Sorteio feito. Agora ajusta do seu jeito.',
);
falas('papo', 'preset', 'feliz', 'Essa inspiração é bonita. Agora deixa com a sua cara.', 'Boa base para começar. Mexe no que quiser.', 'Inspiração escolhida! Metade do caminho já foi.');

/* ───────── Ferramentas do palco ───────── */
falas('ferramenta', 'corte.on', 'feliz', 'Olha por dentro! É aqui que a gente vê se o bolo é bom.', 'Corte aberto. Repara nas camadas e no recheio.', 'Por dentro é que mora o segredo.');
falas('ferramenta', 'corte.off', 'neutra', 'Fechou o corte. Guardado o segredo.');
falas('ferramenta', 'foto', 'comemora', 'Xis! Esse ângulo valorizou.', 'Foto tirada. Bolo fotogênico.', 'Ficou bonito na foto. Mostra para alguém.');
falas('ferramenta', 'compartilhar', 'feliz', 'Mostra mesmo! Bolo bonito é para ser visto.', 'Compartilhado. Depois me conta o que acharam.');
falas('ferramenta', 'baixar', 'neutra', 'Imagem salva. Dá para mostrar para a família antes de pedir.', 'Baixado. Boa para guardar de lembrança.');
falas('ferramenta', 'salvar', 'feliz', 'Bolo guardado nos seus favoritos. Ele te espera.', 'Salvo! Pode voltar quando quiser.', 'Guardei. Decidir com calma é sempre bom.');
falas('ferramenta', 'medir', 'neutra',
  ['Medidas na tela. Bom para saber se cabe na geladeira.', 'Mede {diametro} cm de diâmetro e {altura} cm de altura. Bom para saber se cabe na geladeira.'],
  ['Régua na mão! Confere o tamanho de verdade.', 'Régua na mão: {diametro} cm de diâmetro por {altura} cm de altura.'],
);
falas('ferramenta', 'girar', 'neutra', 'Girando! Dá para ver o bolo de todos os lados.');
falas('ferramenta', 'vista', 'neutra', 'Outro ângulo. De cima dá para conferir o arranjo.');

/* ───────── Carrinho e despedida ───────── */
falas('carrinho', 'carrinho', 'comemora',
  ['Bolo no carrinho! Agora é com a gente: vamos caprichar.', 'Bolo no carrinho por {preco}. Agora é com a gente: vamos caprichar. {pix}'],
  ['Pedido a caminho do forno. Obrigada pela confiança!', 'Pedido a caminho do forno: {preco}. Obrigada pela confiança! {pix}'],
  ['Foi para o carrinho. Esse eu quero ver pronto.', 'Foi para o carrinho por {preco}. Esse eu quero ver pronto. {pix}'],
  ['Fechou! Vai ficar lindo na sua mesa.', 'Fechou: {preco}. Vai ficar lindo na sua mesa. {pix}'],
);
falas('carrinho', 'carrinho.edicao', 'feliz', 'Ajustes salvos. Seu bolo foi atualizado no carrinho.', 'Alterações guardadas. Está do jeito novo.');
falas('carrinho', 'tchau', 'feliz', 'Até logo! O ateliê fica aberto para você.', 'Tchau, tchau! Volta para montar outro.', 'Até a próxima. Foi bom confeitar com você.');

/* ───────── Atalhos "Pergunte à Bô" ───────── */
falas('atalho', 'combina.sim', 'feliz',
  ['Combina, sim. Está tudo conversando bem.', 'Combina, sim. {achado}'],
  ['Olhei com calma: está harmonioso. Pode seguir.', 'Olhei com calma: está harmonioso. {achado}'],
  ['Combina! Não mudaria nada agora.', 'Combina! {achado}'],
);
falas('atalho', 'combina.quase', 'pensando',
  ['Quase tudo combina. Eu só mexeria num ponto.', 'Quase tudo combina. {achado}'],
  ['Está bonito, e tem um detalhe que pode melhorar.', 'Está bonito, e tem um detalhe: {achado}'],
  ['Combina, com uma ressalva. Olha a minha sugestão.', 'Combina, com uma ressalva. {achado}'],
);
falas('atalho', 'sugere.sabor', 'feliz',
  ['Para esse bolo, eu iria nesse recheio aqui. Quer provar a ideia?', 'Com massa de {massa}, eu iria de {sugestao}: {porque}'],
  ['Tenho um palpite de sabor que vai casar bem.', 'Meu palpite: {sugestao} com a massa de {massa}. {porque}'],
  ['Pensei numa troca de recheio que equilibra tudo.', 'Uma troca que equilibra: {sugestao}. {porque}'],
  ['Se fosse meu, eu colocaria esse sabor. Olha só.', 'Se fosse meu: {sugestao} com {massa}. {porque}'],
);
falas('atalho', 'sugere.sabor.ok', 'feliz', 'Os sabores já estão ótimos. Eu não mexeria.', 'Nesse sabor eu não toco. Está redondo.');
falas('atalho', 'sugere.decor', 'feliz',
  ['Um enfeite que combina com esse bolo: olha a minha ideia.', 'Minha ideia: {sugestao}. {porque}'],
  ['Para o topo, eu iria nisso aqui.', 'Para o topo, eu iria de {sugestao}. {porque}'],
  ['Tenho uma sugestão de decoração que conversa com os sabores.', 'Sugestão: {sugestao}. {porque}'],
  ['Que tal esse enfeite? Acho que fecha o visual.', 'Que tal {sugestao}? {porque}'],
);
falas('atalho', 'sugere.decor.cheio', 'neutra', 'O topo já está bem servido. Mais enfeite ia pesar.', 'De decoração, está completo. Eu pararia por aqui.');
falas('atalho', 'pessoas', 'neutra',
  ['Olha quantas fatias esse bolo rende. Confere se dá para todo mundo.', 'Este bolo rende {fatias}. {comparacao}'],
  ['A conta das fatias está aqui. Na dúvida, um tamanho acima.', 'Rende {fatias}. {comparacao}'],
  ['Rendimento na tela. Lembra de contar as crianças e quem repete.', 'São {fatias}. {comparacao}'],
);
falas('atalho', 'surpreende', 'comemora',
  'Deixa comigo! Pensei numa combinação especial.',
  'Surpresa da Bô saindo do forno. Quer ver?',
  'Tenho uma ideia que eu adoro. Olha só.',
  'Essa aqui é receita de confiança. Topa?',
);
falas('atalho', 'ideia.tropical', 'feliz', 'Um tropical: limão, maracujá e coco. Fresco, perfeito para o calor.');
falas('atalho', 'ideia.casadinho', 'feliz', 'O casadinho: chocolate com brigadeiro e creme de leite em pó. Agrada criança e adulto.');
falas('atalho', 'ideia.vermelhas', 'feliz', 'Frutas vermelhas: red velvet, framboesa e morango. Lindo de cortar.');
falas('atalho', 'ideia.cenoura', 'feliz', 'A cenoura de vó: bem úmida, com muito brigadeiro.');
falas('atalho', 'ideia.fazenda', 'feliz', 'Doce de leite com coco no bolo de baunilha. Sabor de fazenda.');
falas('atalho', 'ideia.bombom', 'feliz', 'Bombom de morango: chocolate, morango e brigadeiro.');
falas('atalho', 'ideia.limao', 'feliz', 'Todo de limão, com framboesa no meio. Leve e elegante.');
falas('atalho', 'ideia.morangocreme', 'feliz', 'Morango com creme: baunilha, morango e creme de leite em pó. Querido de todas as festas.');
falas('atalho', 'falta.itens', 'neutra',
  ['Ainda faltam uns detalhes. Anotei para você.', 'Ainda falta: {lista}.'],
  ['Olhei o bolo: tem coisa para decidir ainda.', 'Para decidir ainda: {lista}.'],
  ['Quase! Faltam poucos passos.', 'Quase! Falta: {lista}.'],
);
falas('atalho', 'falta.nada', 'feliz', 'Não falta nada. Esse bolo está pronto para o pedido.', 'Completo! Se gostou, é só ir para o resumo.', 'Por mim, pode pedir. Está redondo.');
falas('atalho', 'acao.feito', 'feliz', 'Pronto, troquei. Olha como ficou.', 'Feito! Vê se gostou.', 'Trocado. Se não gostar, é só desfazer.');

/* ───────── Nota da Bô ───────── */
falas('nota', 'nota.5', 'comemora', 'Nota máxima! Esse bolo eu assinaria embaixo.', 'Cinco estrelas. Não mudaria nada.', 'Bolo de vitrine. Nota máxima da Bô.');
falas('nota', 'nota.4', 'feliz', 'Muito bom! Quatro estrelas, com um detalhe para chegar lá.', 'Bolo bonito e gostoso. Falta pouco para a nota máxima.', 'Quase perfeito. Tenho só uma sugestão.');
falas('nota', 'nota.3', 'neutra', 'Bom bolo. Com um ou dois ajustes, ele sobe de nível.', 'Três estrelas honestas. Dá para melhorar, e eu mostro como.', 'Está no caminho. Olha as minhas sugestões.');
falas('nota', 'nota.2', 'pensando', 'Vou ser sincera: dá para melhorar bastante. Posso ajudar.', 'Tem boas ideias aqui, mas elas estão brigando. Vamos ajustar?', 'Ainda não está no ponto. Com uns ajustes, fica ótimo.');

/* ═════════════════════════════════════════════════════════════════════════════════════════════════════════
   CATÁLOGO NOVO (rodada 5). Daqui para baixo, só acréscimos: grupos novos com falas(…) e, para um grupo que já
   existia, mais(grupo, …) — que põe as falas NO FIM (os ids antigos não mudam de lugar).
   Nomes de marca do catálogo viram descrição: "creme de leite em pó", "creme de avelã", "coco com brigadeiro",
   "chantilly com leite em pó".
   ═════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Acrescenta falas no fim de um grupo já publicado. */
function mais(grupo, ...textos) {
  if (!G[grupo]) throw new Error(`Grupo de falas inexistente: ${grupo}`);
  G[grupo].textos.push(...textos);
}

/* ───────── Formatos, tamanhos e bases novos ───────── */
mais('formato.rect', 'Retangular é campeão de festa de escola: corta fácil e ninguém fica sem fatia.');
falas('opcao', 'formato.oval', 'neutra', 'Oval, elegante. Tem cara de mesa posta em almoço de domingo.');
falas('opcao', 'formato.flor', 'feliz', 'Formato de flor! Cada pétala já sai quase uma fatia pronta.');
falas('opcao', 'formato.vulcao', 'surpresa',
  'Vulcão! Bolo de furo com a cobertura transbordando. Impossível resistir.',
  'No vulcão é uma massa só, bem molhadinha. A graça está na cobertura escorrendo.',
);
falas('opcao', 'tamanho.bento', 'feliz',
  ['Bentô! Um mini bolo na caixinha, feito para presentear.', 'Bentô! Mini bolo para presentear: rende {fatias}.'],
  'O bentô é carinho em forma de bolo. Cabe na mão e no coração.',
);
falas('opcao', 'tamanho.gg', 'comemora', ['Tamanho de festão! Esse aí alimenta o salão inteiro.', 'Tamanho de festão! Rende {fatias}.']);
mais('tamanho.m', 'Tamanho médio, o que mais sai aqui no ateliê. Serve bem uma festa.');
mais('base.boleira', 'A boleira levanta o bolo na mesa. Fica com cara de festa de família.');
falas('opcao', 'base.tabua', 'neutra', 'Tábua de servir, com alça. Rústica, e já vai direto para a mesa.');
falas('opcao', 'base.preta', 'neutra', 'Base preta e fosca. Qualquer cor de cobertura salta em cima dela.');
falas('opcao', 'base.vidro', 'feliz', 'Boleira de vidro, com pé. Leve e transparente, o bolo parece flutuar.');
falas('opcao', 'base.caixa', 'feliz', 'Na caixinha, com papel-manteiga e talher. Presente pronto para entregar.');

/* ───────── Massas novas ───────── */
falas('opcao', 'massa.mesclada', 'feliz',
  'Mesclada! Baunilha e chocolate em mármore. Cada fatia sai com um desenho diferente.',
  'Massa mesclada resolve a briga de quem quer chocolate e quem quer baunilha.',
);
falas('opcao', 'massa.formigueiro', 'feliz',
  'Formigueiro! Massa branquinha, cheia de granulado. Lembra lanche da tarde.',
  'O granulado derrete de leve no forno. Por isso o formigueiro fica tão macio.',
);
falas('opcao', 'massa.funfetti', 'comemora',
  'Massa de confete! Colorida por dentro, a festa já começa no corte.',
  'Confete na massa é surpresa garantida. A criançada vibra quando vê a fatia.',
);
falas('opcao', 'massa.laranja', 'neutra', 'Laranja, com suco e raspas da fruta. Perfuma a cozinha inteira.');
falas('opcao', 'massa.maracuja', 'feliz', 'Massa de maracujá, azedinha, com as sementes. Fica linda e fresca.');
falas('opcao', 'massa.banana', 'feliz', 'Banana com canela! Cheiro de casa de vó no fim da tarde.');
falas('opcao', 'massa.coco', 'neutra', 'Massa de coco, branquinha e úmida. Vai bem com fruta e doce de leite.');
falas('opcao', 'massa.nozes', 'neutra', 'Massa de nozes, amanteigada. Tem pedacinho crocante em cada mordida.');
falas('opcao', 'massa.amendoas', 'neutra', 'Amêndoas na massa: delicada e perfumada. Coisa de confeitaria fina.');
falas('opcao', 'massa.pacoca', 'feliz', 'Massa de paçoca! Amendoim torrado, gosto de festa junina o ano todo.');
falas('opcao', 'massa.churros', 'feliz', 'Churros! Massa com veios de canela e açúcar. Já sabe o recheio, né?');
falas('opcao', 'massa.cafe', 'neutra', 'Massa de café coado, bem forte. Tem cheiro de padaria de manhã cedo.');
falas('opcao', 'massa.chocolatebranco', 'neutra', 'Chocolate branco na massa: amanteigada, com pedaços que derretem.');

/* ───────── Recheios novos ───────── */
falas('opcao', 'recheio.meioamargo', 'neutra', 'Brigadeiro meio amargo: mais cacau, menos doce. Quem prova não volta atrás.');
falas('opcao', 'recheio.brigadeirobranco', 'feliz', 'Brigadeiro branco, bem cremoso. Doce e delicado, pede uma fruta do lado.');
falas('opcao', 'recheio.ganache', 'neutra', 'Ganache meio amargo no recheio. Firme e intensa, segura bem bolo alto.');
falas('opcao', 'recheio.ganachebranca', 'neutra', 'Ganache branca, aveludada. Combina demais com frutas vermelhas.');
falas('opcao', 'recheio.prestigio', 'feliz',
  'Coco com chocolate, a dupla da infância. Beijinho por cima do brigadeiro.',
  'Esse recheio de coco com brigadeiro faz sucesso em qualquer festa.',
);
falas('opcao', 'recheio.cookies', 'feliz',
  'Creme branco com biscoito de chocolate quebrado. Crocante e cremoso juntos.',
  'Biscoito no recheio! A gente mistura na hora, para não amolecer.',
);
falas('opcao', 'recheio.quatroleites', 'neutra', 'Quatro leites: cremoso, branquinho e suave. Combina com qualquer massa.');
falas('opcao', 'recheio.cremebelga', 'neutra', 'Creme belga, com baunilha de verdade. Delicado, pede geladeira até servir.');
falas('opcao', 'recheio.creamcheese', 'neutra', 'Cream cheese, levemente azedinho. É o par perfeito do red velvet.');
falas('opcao', 'recheio.cocada', 'feliz', 'Cocada cremosa, com coco queimadinho. Tem gosto de doce de tacho.');
falas('opcao', 'recheio.frutasvermelhas', 'feliz', 'Frutas vermelhas no creme: morango, framboesa e mirtilo. Fresco e colorido.');
falas('opcao', 'recheio.abacaxicoco', 'feliz', 'Abacaxi com coco! Refrescante, a cara do verão cuiabano.');
falas('opcao', 'recheio.pessego', 'neutra', 'Pêssego com creme. Clássico de festa de família, suave e perfumado.');
falas('opcao', 'recheio.ameixa', 'neutra', 'Ameixa com doce de leite, o recheio das bodas e dos aniversários de vó.');
falas('opcao', 'recheio.cereja', 'feliz', 'Cereja com chantilly, estilo floresta negra. Pede massa de chocolate.');
falas('opcao', 'recheio.limaosiciliano', 'neutra', 'Creme de limão-siciliano, amarelinho e bem cítrico. Acorda qualquer massa.');
falas('opcao', 'recheio.moussechocolate', 'neutra', 'Mousse de chocolate, aerada. Macia na colher, e gosta de geladeira.');
falas('opcao', 'recheio.moussemorango', 'feliz', 'Mousse de morango, rosada e fofinha. Sai da geladeira direto para a mesa.');
falas('opcao', 'recheio.docedeleitenozes', 'feliz',
  'Doce de leite com nozes: cremoso com crocante. Um dos queridos da casa.',
  'As nozes cortam o doce do doce de leite. Equilíbrio de confeiteira.',
);
falas('opcao', 'recheio.nozes', 'neutra', 'Creme de nozes, suave, com pedaços tostados. Elegante sem fazer barulho.');
falas('opcao', 'recheio.pistache', 'surpresa', 'Pistache de verdade! Verdinho, cremoso e muito chique.');
falas('opcao', 'recheio.pacoca', 'feliz', 'Creme de amendoim com paçoca esfarelada. Difícil comer uma fatia só.');
falas('opcao', 'recheio.caramelosalgado', 'feliz', 'Caramelo com flor de sal. O salgadinho realça o doce, é de viciar.');
falas('opcao', 'recheio.cafe', 'neutra', 'Creme de café, tipo cappuccino. Fica uma beleza com massa de chocolate.');

/* ───────── Coberturas novas ───────── */
falas('opcao', 'cobertura.chantininho', 'feliz',
  'Chantilly com leite em pó: firme para decorar e gostoso de verdade.',
  'Esse chantilly firme segura bico alto. No calor, geladeira até a hora da festa.',
);
falas('opcao', 'cobertura.ganachebranca', 'neutra', 'Ganache branca escorrida, em qualquer cor. Brilho de vitrine.');
falas('opcao', 'cobertura.brigadeiro', 'feliz',
  'Coberto de brigadeiro e granulado! Parece um brigadeirão de festa.',
  'Brigadeiro com granulado por fora: ninguém resiste a passar o dedo.',
);
falas('opcao', 'cobertura.creamcheese', 'neutra', 'Cobertura de cream cheese, levemente azedinha. Corta o doce do bolo.');
falas('opcao', 'cobertura.pasta', 'neutra', 'Pasta americana: lisa como porcelana. Aguenta bem o nosso calor.');
falas('opcao', 'cobertura.merengue', 'surpresa', 'Merengue em picos, tostado no maçarico. Parece nuvem dourada.');
falas('opcao', 'cobertura.coco', 'neutra', 'Coberto de coco ralado fresco. Branquinho, parece bolo gelado de festa.');

/* ───────── Estilos novos ───────── */
mais('estilo.liso', 'Liso de novo. Cobertura lisa pede mão firme, e a gente tem.');
mais('estilo.rustico', 'O espatulado disfarça bem as marcas do transporte. Bonito e prático.');
mais('estilo.seminaked', 'No semi-naked a massa espia pelo creme. Fica lindo com flores e frutas.');
mais('estilo.ombre', 'No degradê, a cor mais forte fica embaixo e vai clareando. Suave.');
falas('opcao', 'estilo.ondas', 'neutra', 'Ondas no pente, subindo e descendo. Dá movimento ao bolo todo.');
falas('opcao', 'estilo.vertical', 'neutra', 'Riscos de baixo para cima. Alongam o bolo, ele parece mais alto.');
falas('opcao', 'estilo.pinceladas', 'feliz', 'Pinceladas de espátula em duas cores. Parece pintura a óleo.');
falas('opcao', 'estilo.marmorizado', 'surpresa', 'Marmorizado! Veios de cor que nunca saem iguais. Peça única.');
falas('opcao', 'estilo.perolado', 'feliz', 'Brilho de pérola no pincel. Muda conforme a luz, uma elegância.');
falas('opcao', 'estilo.rosetas', 'feliz',
  'O bolo inteiro de rosetas! Parece um buquê. Dá trabalho, e vale cada uma.',
  'Rosetas por toda a volta. Clássico que nunca perde a graça.',
);
falas('opcao', 'estilo.babados', 'feliz', 'Babados em camadas, como saia de bailarina. Romântico demais.');
falas('opcao', 'estilo.cesta', 'neutra', 'Trançado de cesta na lateral. Pede fruta ou flor por cima, como um piquenique.');
falas('opcao', 'estilo.barrado', 'neutra',
  'Barrado na base! Um rodapé crocante que dá acabamento e sabor.',
  'O barrado esconde a emenda do bolo com a base. Truque antigo de confeiteira.',
);
falas('opcao', 'estilo.chuva', 'feliz', 'Confeitos subindo pela lateral, rareando no alto. Efeito de festa.');
falas('opcao', 'estilo.faultline', 'surpresa', 'Uma faixa de confeitos aparecendo no meio da cobertura. Moderno e ousado.');
falas('opcao', 'estilo.poa', 'feliz', 'Poá! Bolinhas no estêncil, alegres e arrumadinhas.');
falas('opcao', 'estilo.coracoes', 'feliz', 'Corações no estêncil, um por um. Bolo apaixonado.');
falas('opcao', 'estilo.arabesco', 'neutra', 'Arabescos em estêncil, como renda. Fino, com cara de casamento.');

/* ───────── Bicos novos e lugares do bico ───────── */
mais('bico.liso', 'Sem bico nenhum. A cobertura dá conta do recado sozinha.');
mais('bico.conchas', 'Conchas bem juntinhas fazem aquela borda de bolo de padaria boa.');
mais('bico.estrelas', 'Estrelinhas de bico, as pitangas de sempre. Rápidas, alegres, certeiras.');
mais('bico.rosetas', 'Roseta é o bico que mais rende elogio. Fica linda em cor suave.');
mais('bico.vintage', 'O vintage leva guirlanda sobre guirlanda. É bordado feito de creme.');
falas('opcao', 'bico.tranca', 'neutra', 'Trança de três cordões. Lembra cesta de vime, tem um ar de fazenda.');
falas('opcao', 'bico.coracoes', 'feliz', 'Duas conchas viradas formam um coração. Truque antigo e charmoso.');
falas('opcao', 'bico.florzinhas', 'feliz', 'Florzinhas de bico com miolo de pérola. Delicadas, uma graça.');
falas('opcao', 'bico.pingos', 'feliz', 'Suspiros de bico, altinhos e com a pontinha. Dão volume e alegria.');
falas('opcao', 'bico.pitangas', 'feliz', 'Pitangas alternadas, uma grande e uma pequena. Ritmo de festa.');
falas('opcao', 'bico.grama', 'feliz', 'Bico de grama! Fiozinhos de creme que viram um gramado. Ótimo para temas.');
falas('opcao', 'bico.guirlanda', 'neutra', 'Guirlandas drapeadas na lateral. Clássico de bolo de casamento.');
falas('opcao', 'bico.escamas', 'surpresa', 'Escamas puxadas na espátula, uma sobre a outra. Lembra cauda de sereia.');
falas('opcao', 'bico.poa', 'feliz', 'Bolinhas de bico espalhadas pela lateral. Simples e simpático.');
falas('opcao', 'bico.arabescos', 'neutra', 'Arabescos finos, feitos à mão livre. Pedem pulso firme e paciência.');
falas('opcao', 'onde.cintura', 'neutra', 'Bico na cintura do bolo, como um cinto. Divide a lateral com charme.');
falas('opcao', 'onde.cobre', 'feliz', 'O topo inteiro coberto de bico! Farto, e nem precisa de enfeite.');

/* ───────── Decorações novas: frutas ───────── */
falas('opcao', 'decor.morangosfrescos', 'feliz', 'Morangos inteiros, com as folhinhas. Simples, fresco e sempre bonito.');
falas('opcao', 'decor.framboesas', 'feliz', 'Framboesas frescas. Pequenas, vermelhas e cheias de elegância.');
falas('opcao', 'decor.mirtilos', 'feliz', 'Mirtilos, com aquele véu azulado. Ficam lindos ao lado de frutas vermelhas.');
falas('opcao', 'decor.amoras', 'neutra', 'Amoras escuras e brilhantes. Dão um ar de bolo de campo.');
falas('opcao', 'decor.uvas', 'feliz', 'Cachinhos de uva! Parecem pintura de natureza-morta.');
falas('opcao', 'decor.figos', 'surpresa', 'Figos cortados, mostrando o miolo. Chique e meio rústico ao mesmo tempo.');
falas('opcao', 'decor.physalis', 'surpresa', 'Physalis com a capinha aberta. Parece uma lanterna dourada.');
falas('opcao', 'decor.kiwi', 'feliz', 'Kiwi em fatias! Verdinho, alegra qualquer topo.');
falas('opcao', 'decor.laranja', 'neutra', 'Rodelas de laranja desidratada. Contra a luz, parecem vitral.');
falas('opcao', 'decor.limao', 'neutra', 'Rodelas de limão-siciliano. Avisam de longe que o bolo é fresco.');
falas('opcao', 'decor.maracuja', 'feliz', 'Metades de maracujá com a polpa à mostra. Tropical e perfumado.');
falas('opcao', 'decor.coco', 'neutra', 'Fitas de coco fresco, bem branquinhas. Delicadas e elegantes.');

/* ───────── Decorações novas: flores ───────── */
falas('opcao', 'decor.gipsofila', 'feliz', 'Mosquitinho! Raminhos brancos e miúdos. Combinam com tudo.');
falas('opcao', 'decor.lavanda', 'neutra', 'Raminhos de lavanda. Perfume de jardim e um lilás suave.');
falas('opcao', 'decor.eucalipto', 'neutra', 'Eucalipto de folha redonda. O verde acalma e deixa tudo elegante.');
falas('opcao', 'decor.prensadas', 'surpresa', 'Flores prensadas coladas na cobertura, como página de herbário.');
falas('opcao', 'decor.suculentas', 'surpresa', 'Suculentas feitas de creme, no bico. Enganam até quem cuida de planta.');
falas('opcao', 'decor.girassois', 'feliz', 'Girassóis de bico, com miolo de chocolate. Alegria amarela.');

/* ───────── Decorações novas: chocolate ───────── */
falas('opcao', 'decor.placas', 'neutra', 'Placas de chocolate fincadas no topo. Dão altura e um ar moderno.');
falas('opcao', 'decor.esferas', 'surpresa', 'Esferas de chocolate, de vários tamanhos. Parecem planetas brilhando.');
falas('opcao', 'decor.barras', 'feliz', 'Tabletes de chocolate em gomos. Para quem não esconde o que ama.');
falas('opcao', 'decor.conchaschoc', 'feliz', 'Conchas de chocolate, moldadas como as do mar. Um capricho.');
falas('opcao', 'decor.gotas', 'feliz', 'Gotas de chocolate espalhadas. Pequenas, mas ninguém deixa no prato.');
falas('opcao', 'decor.crocantes', 'feliz', 'Bolinhas crocantes cobertas de chocolate. Fazem barulhinho bom na mordida.');

/* ───────── Decorações novas: docinhos ───────── */
falas('opcao', 'decor.jujubas', 'feliz', 'Jujubas açucaradas. Coloridas, com gosto de festa de criança.');
falas('opcao', 'decor.donuts', 'comemora', 'Mini donuts com cobertura! Um bolo que vem com sobremesa em cima.');
falas('opcao', 'decor.cookies', 'feliz', 'Cookies com gotas de chocolate. Tem cara de lanche caprichado.');
falas('opcao', 'decor.pipoca', 'feliz', 'Pipoca caramelizada, dourada e crocante. Cinema em cima do bolo.');
falas('opcao', 'decor.casquinha', 'surpresa', 'Casquinha de sorvete caída de ponta-cabeça. Parece que derreteu agora.');
falas('opcao', 'decor.pacoca', 'feliz', 'Paçoquinhas! Doce de amendoim com sotaque de festa junina.');
falas('opcao', 'decor.cakepops', 'feliz', 'Bolinhas de bolo no palito. É bolo em cima de bolo, pode isso?');
falas('opcao', 'decor.pastilhas', 'feliz', 'Confeitos de chocolate coloridos. A criançada caça um por um.');
falas('opcao', 'decor.bengalinhas', 'feliz', 'Bengalinhas listradas de vermelho e branco. Já é quase Natal.');
falas('opcao', 'decor.canudos', 'neutra', 'Canudos de wafer fincados em feixe. Crocantes, dão altura ao topo.');
falas('opcao', 'decor.ovinhos', 'feliz', 'Ovinhos de chocolate, coloridos e salpicados. A Páscoa agradece.');

/* ───────── Decorações novas: brilho ───────── */
falas('opcao', 'decor.glitter', 'feliz', 'Brilho bem fino por cima de tudo. O bolo cintila quando a luz bate.');
falas('opcao', 'decor.metalicos', 'neutra', 'Confeitos metálicos, prateados e dourados. Poucos já fazem efeito.');
falas('opcao', 'decor.estrelinhas', 'feliz', 'Estrelinhas de confeito. Um céu inteiro em cima do bolo.');
falas('opcao', 'decor.micangas', 'neutra', 'Miçangas de açúcar, miudinhas. Dão textura e um brilho delicado.');
falas('opcao', 'decor.espelhadas', 'surpresa', 'Bolas espelhadas! Refletem a festa inteira. Muito pedidas, e com razão.');

/* ───────── Decorações novas: festa e papel ───────── */
falas('opcao', 'decor.fita', 'feliz', 'Fita de cetim em volta, com lacinho. O bolo vira presente.');
falas('opcao', 'decor.bandeirolas', 'comemora', 'Varal de bandeirinhas por cima do bolo. Já chega fazendo festa.');
falas('opcao', 'decor.leques', 'feliz', 'Leques de papel plissado. Não pesam nada e enchem o topo de cor.');
falas('opcao', 'decor.catavento', 'feliz', 'Cata-ventos de papel! Dá vontade de soprar para ver girar.');
falas('opcao', 'decor.pompons', 'feliz', 'Pompons de papel no palito. Fofos e bem festeiros.');
falas('opcao', 'decor.luanuvens', 'feliz', 'Lua, nuvens e estrelinhas. O bolo parece uma canção de ninar.');
falas('opcao', 'decor.arcoiris', 'comemora', 'Arco-íris de açúcar, com nuvens nos pés. Um dos mais queridos da criançada.');
falas('opcao', 'decor.coroa', 'feliz', 'Uma coroa dourada no alto. Hoje alguém manda na festa.');
falas('opcao', 'decor.nuvens', 'feliz', 'Nuvens fofinhas de pasta de açúcar. O bolo foi parar no céu.');

/* ───────── Decorações novas: temáticas ───────── */
falas('opcao', 'decor.chifre', 'comemora', 'Chifre dourado e orelhinhas! O unicórnio chegou para a festa.');
falas('opcao', 'decor.cilios', 'feliz', 'Cílios de olhinhos fechados. O bolo ganhou cara de sonho bom.');
falas('opcao', 'decor.crina', 'feliz', 'Crina de rosetas coloridas, descendo em cascata. Pura fantasia.');
falas('opcao', 'decor.orelhasurso', 'feliz', 'Duas orelhinhas redondas no alto. Virou um ursinho!');
falas('opcao', 'decor.carinhaurso', 'feliz', 'Focinho e olhinhos na frente. Esse bolo dá vontade de abraçar.');
falas('opcao', 'decor.orelhascoelho', 'feliz', 'Orelhas compridas de coelho. Simpático que só ele.');
falas('opcao', 'decor.sereia', 'surpresa', 'Uma cauda de sereia mergulhando no bolo. Brilha a cada escama.');
falas('opcao', 'decor.estrelasdomar', 'feliz', 'Estrelas-do-mar de açúcar. Só falta o barulho das ondas.');
falas('opcao', 'decor.planetas', 'surpresa', 'Planetas no palito, com anéis e tudo. Um sistema solar de açúcar.');
falas('opcao', 'decor.foguete', 'comemora', 'Um foguete decolando do bolo! Contagem regressiva para o parabéns.');
falas('opcao', 'decor.bola', 'comemora', 'Bola de futebol no centro! Agora é só apitar o início da festa.');
falas('opcao', 'decor.capelo', 'comemora', 'Capelo e diploma! Tanto estudo merece essa homenagem.');
falas('opcao', 'decor.cubos', 'feliz', 'Cubos de letras, como bloquinhos de montar. Fofura de quarto de bebê.');
falas('opcao', 'decor.cruz', 'neutra', 'Uma cruz dourada no alto. Delicada, para um dia de bênção.');
falas('opcao', 'decor.aliancas', 'feliz', 'Duas alianças entrelaçadas. O bolo já está dizendo sim.');
falas('opcao', 'decor.cogumelos', 'feliz', 'Cogumelos de chapéu vermelho com pintinhas. Saíram de um conto de fadas.');
falas('opcao', 'decor.joaninhas', 'feliz', 'Joaninhas passeando pelo bolo. Dizem que dão sorte.');
falas('opcao', 'decor.dinos', 'comemora', 'Dinossauros no palito! A festa voltou alguns milhões de anos.');
falas('opcao', 'decor.folhastropicais', 'feliz', 'Folhas tropicais, costela-de-adão e palmeira. Clima de floresta.');
falas('opcao', 'decor.pegadas', 'feliz', 'Patinhas subindo pela lateral. Quem será que passou por aqui?');
falas('opcao', 'decor.chapeupalha', 'comemora', 'Chapéu de palha com fita xadrez. Só falta a sanfona tocar.');
falas('opcao', 'decor.azevinho', 'feliz', 'Azevinho, verde e vermelho. Um toque e o bolo fica natalino.');
falas('opcao', 'decor.pinheirinhos', 'feliz', 'Pinheirinhos de bico com estrela na ponta. Uma floresta de Natal.');
falas('opcao', 'decor.flocos', 'neutra', 'Flocos de neve recortados. Aqui no calor, neve só no bolo mesmo.');
falas('opcao', 'decor.cenourinhas', 'feliz', 'Cenourinhas de açúcar. O coelho vai aprovar.');
falas('opcao', 'decor.fantasmas', 'surpresa', 'Fantasminhas de suspiro! Assustam pouco e somem rápido.');
falas('opcao', 'decor.aboboras', 'feliz', 'Abóboras em miniatura. Dia das bruxas com muito charme.');
falas('opcao', 'decor.morcegos', 'surpresa', 'Morcegos voando em volta do bolo. Um arrepio divertido.');
falas('opcao', 'enfeite.modelo', 'neutra', 'Outro modelo da mesma peça. Muda o jeito sem mudar a ideia.', 'Trocou o modelo. Cada um tem o seu charme.');

/* ───────── Velas e arranjos novos ───────── */
mais('vela.classica', 'As listradinhas de sempre. Bolo de aniversário pede.');
mais('vela.numero', 'Vela de número fica ótima na foto. Só não vale esconder a idade.');
mais('vela.faisca', 'A faísca é o momento do vídeo. Um adulto acende, combinado?');
falas('opcao', 'vela.longa', 'neutra', 'Velas longas e fininhas. Elegantes, deixam o bolo mais alto.');
falas('opcao', 'vela.espiral', 'feliz', 'Velas torcidas em espiral. Um charme de festa de antigamente.');
falas('opcao', 'vela.letras', 'comemora', 'Velas de letras, escrevendo parabéns. O recado já vem aceso.');
falas('opcao', 'vela.estrela', 'feliz', 'Velinhas de estrela. Cada pedido ganha a sua.');
falas('opcao', 'arranjo.auto', 'neutra', 'No automático, os enfeites se arrumam do jeito que o topo pede.');
falas('opcao', 'arranjo.lateral', 'neutra', 'Na lateral, em volta do bolo. O topo fica livre para outra ideia.');
falas('opcao', 'arranjo.palito', 'neutra', 'No palito, acima do bolo. Ganha altura sem ocupar o topo.');
falas('opcao', 'arranjo.frente', 'neutra', 'Na frente do bolo, bem à vista. É o lado da foto.');
falas('opcao', 'arranjo.fundo', 'neutra', 'Em pé, lá no fundo. Vira cenário para o resto da decoração.');

/* ───────── Temas prontos ───────── */
falas('opcao', 'tema.unicornio', 'comemora',
  'Tema de unicórnio! Chifre dourado, crina de rosetas e cílios. Mágico.',
  'Unicórnio na bancada. Agora ajusta as cores da crina do seu jeito.',
);
falas('opcao', 'tema.mar', 'surpresa', 'Fundo do mar! Sereia, conchas e pérolas. Quase dá para ouvir as ondas.');
falas('opcao', 'tema.safari', 'feliz', 'Safári! Folhas, pegadas e muito verde. Aventura em forma de bolo.');
falas('opcao', 'tema.espaco', 'comemora', 'Tema de espaço! Planetas, foguete e estrelas. Festa de outro mundo.');
falas('opcao', 'tema.jardim', 'feliz', 'Jardim encantado, com cogumelos e joaninhas. Parece livro de histórias.');
falas('opcao', 'tema.futebol', 'comemora',
  'Futebol! Bola no centro e gramado de bico. É gol da confeitaria.',
  'Tema de futebol pronto. Quer deixar com as cores do time do coração?',
);
falas('opcao', 'tema.dinos', 'comemora', 'Dinossauros! Folhas, ovinhos e pegadas. Rugido garantido na festa.');
falas('opcao', 'tema.ursinho', 'feliz',
  'Ursinho! Orelhinhas no alto e carinha na frente. Fofura sem tamanho.',
  'O tema de ursinho fica lindo em tons de caramelo e creme.',
);
falas('opcao', 'tema.nuvens', 'feliz',
  'Nuvens e arco-íris! Um céu inteiro de açúcar, delicado e alegre.',
  'Esse tema é um sonho em tons pastel. Combina com festa de bebê.',
);
falas('opcao', 'tema.princesa', 'feliz', 'Tema de princesa: coroa dourada, rosas e borboletas. Majestoso.');
falas('opcao', 'tema.principe', 'feliz', 'Tema de príncipe: coroa, estrelas e azul-marinho. Elegante desde cedo.');
falas('opcao', 'tema.junina', 'comemora', 'Festa junina! Bandeirinhas, chapéu de palha e paçoca. Olha a festa, gente!');
falas('opcao', 'tema.natal', 'comemora', 'Natal! Pinheirinhos, azevinho e bengalinhas. A ceia ganhou sobremesa.');
falas('opcao', 'tema.pascoa', 'feliz', 'Páscoa! Orelhas de coelho, ovinhos e cenourinhas. Uma doçura.');
falas('opcao', 'tema.halloween', 'surpresa', 'Dia das bruxas! Fantasminhas, abóboras e morcegos. Travessura das boas.');
falas('opcao', 'tema.maes', 'feliz', 'Para o Dia das Mães: peônias, pérolas e um recado. Ela merece.');
falas('opcao', 'tema.namorados', 'feliz', 'Dia dos Namorados: corações, morangos banhados e rosas. Declaração pronta.');
falas('opcao', 'tema.reveillon', 'comemora', 'Réveillon! Dourado, bolas espelhadas e faísca. Ano novo com brilho.');
falas('opcao', 'tema.casamento', 'feliz', 'Tema de casamento: peônias em cascata, pérolas e alianças. Emociona.');
falas('opcao', 'tema.batizado', 'neutra', 'Batizado: cruz dourada, mosquitinho e pérolas. Sereno e delicado.');
falas('opcao', 'tema.formatura', 'comemora', 'Formatura! Capelo, diploma e estrelas douradas. Orgulho da família.');
falas('opcao', 'tema.quinze', 'comemora', 'Quinze anos! Coroa, borboletas e rosas em cascata. Noite de gala.');
falas('opcao', 'tema.chabebe', 'feliz', 'Chá de bebê! Cubos de letras, nuvens e balões. Que espera gostosa.');
falas('tag', 'tipo.tema', 'feliz', 'Tema aplicado! Agora deixa com a sua cara.', 'Gostei do tema. Dá para trocar qualquer peça depois.', 'Tema pronto na bancada. O resto é com você.');
falas('ocasiao', 'elogio.tema.pascoa', 'feliz', 'Bolo de Páscoa! O coelho vai querer a receita.');
falas('ocasiao', 'elogio.tema.junino', 'comemora', 'Bolo de festa junina! Já ouço a quadrilha chamando.');
falas('ocasiao', 'elogio.tema.halloween', 'surpresa', 'Bolo de dia das bruxas. Dá medo é de acabar rápido.');

/* ───────── Adicional do recheio, calda de molhar, confeitos do barrado ───────── */
falas('opcao', 'adicional.morango', 'feliz',
  'Morango fresco no meio do creme. No corte, aparece cada fatia da fruta.',
  'Fruta fresca no recheio pede geladeira. O frescor compensa.',
);
falas('opcao', 'adicional.crocante', 'feliz', 'Crocante de castanha no recheio! Muda a mordida inteira.');
falas('opcao', 'adicional.gotas', 'feliz', 'Gotas de chocolate no recheio. Pequenas surpresas a cada garfada.');
falas('opcao', 'adicional.nozes', 'neutra', 'Nozes tostadas no recheio. Crocantes, com gosto de festa de fim de ano.');
falas('opcao', 'adicional.tirou', 'neutra', 'Sem adicional. O recheio fica lisinho, só o creme.');
falas('tag', 'tipo.adicional', 'feliz', 'Adicional no recheio! Vai aparecer bonito no corte.', 'Boa! Um pedacinho a mais em cada garfada.');
falas('opcao', 'molhar.leitecondensado', 'feliz',
  'Massa molhada com leite condensado. Fica úmida por dias, bem brasileira.',
  'Calda de leite condensado é o segredo do bolo molhadinho de festa.',
);
falas('opcao', 'molhar.baunilha', 'neutra', 'Calda leve de baunilha. Só umedece, sem roubar o sabor da massa.');
falas('opcao', 'molhar.cafe', 'neutra', 'Massa molhada no café. Em massa escura, o chocolate fica mais forte.');
falas('opcao', 'molhar.licor', 'neutra', 'Um toque de licor na massa. Perfume de sobremesa de gente grande.');
falas('opcao', 'molhar.tirou', 'neutra', 'Sem calda de molhar. A massa fica mais sequinha, estilo bolo de café.');
falas('tag', 'tipo.molhar', 'neutra', 'Calda de molhar escolhida. Bolo úmido é outra coisa.', 'Boa! Massa molhadinha não resseca até a hora da festa.');
falas('opcao', 'confeito.castanha', 'neutra',
  'Castanha tostada e picada. Crocante, e combina com quase todo recheio.',
  'Castanha-de-caju no acabamento: sabor do Brasil no pé do bolo.',
);
falas('opcao', 'confeito.granulado', 'feliz',
  'Granulado belga no acabamento. Chocolate que estala no dente.',
  'Granulado em volta lembra brigadeiro gigante. Sucesso certo.',
);
falas('opcao', 'confeito.confeitos', 'comemora', 'Confeitos coloridos! Um carnaval em volta do bolo.');
falas('opcao', 'confeito.coco', 'neutra', 'Coco ralado fresco no acabamento. Branquinho e perfumado.');
falas('opcao', 'confeito.raspas', 'neutra', 'Raspas de chocolate ao leite. Delicadas, derretem na boca.');
falas('tag', 'tipo.confeito', 'neutra', 'Confeito trocado. Muda a textura e o sabor da borda.', 'Bom confeito. Detalhe que se sente na mordida.');

/* ───────── Opções da calda que escorre ───────── */
falas('opcao', 'calda.qtd.pouca', 'neutra', 'Pouca calda: gotas espaçadas, feitas uma a uma. Delicado.');
falas('opcao', 'calda.qtd.media', 'neutra', 'Calda na medida: escorre em toda a volta, sem exagero.');
falas('opcao', 'calda.qtd.farta', 'feliz', 'Calda farta! Escorre generosa pela borda inteira. Gulosa do jeito que eu gosto.');
falas('opcao', 'calda.comprimento.curta', 'neutra', 'Gotas curtas, só beirando a borda. Discreto e elegante.');
falas('opcao', 'calda.comprimento.media', 'neutra', 'Calda até o meio do bolo. O clássico do escorrido.');
falas('opcao', 'calda.comprimento.longa', 'surpresa', 'Calda longa, descendo quase até a base. Dramática e linda.');
falas('opcao', 'calda.meialua', 'neutra', 'Calda só de um lado, em meia-lua. Assimétrico e moderno.', 'Meia-lua de calda: o outro lado fica livre para os enfeites.');
falas('opcao', 'calda.volta', 'neutra', 'Calda na volta inteira de novo. O clássico.');
falas('opcao', 'calda.metal', 'surpresa', 'Calda dourada! Pincelada à mão depois de firme. Puro luxo.', 'Calda metálica reflete a luz da festa. Pouco enfeite já basta.');
falas('opcao', 'calda.metal.off', 'neutra', 'Sem o metálico. A calda volta à cor natural.');

/* ───────── Chá revelação (a Bô NUNCA diz nem mostra a cor) ───────── */
falas('opcao', 'revelacao.on', 'surpresa',
  'Chá revelação! O recheio guarda o segredo até a hora do corte.',
  'Segredo guardado dentro do bolo. Por fora, ninguém desconfia de nada.',
  'Adoro um mistério! A cor só aparece na primeira fatia.',
);
falas('opcao', 'revelacao.cor', 'feliz',
  'Cor escolhida e trancada a sete chaves. Daqui não sai nem uma pista.',
  'Anotado em segredo. Nem eu vou contar, prometo.',
);
falas('opcao', 'revelacao.off', 'neutra', 'Sem chá revelação. O recheio volta a ser só recheio.');
falas('ferramenta', 'revelacao.corte', 'comemora', 'Segredo revelado! Agora todo mundo já sabe.', 'Olha a cor aparecendo no corte! Que momento.');

/* ───────── Combinações novas: massa + recheio ───────── */
falas('combo', 'combo.redvelvet+creamcheese', 'comemora', 'Red velvet com cream cheese: o par original. Não tem como melhorar.');
falas('combo', 'combo.redvelvet+ganachebranca', 'feliz', 'Red velvet com ganache branca. O vermelho e o branco, lindos no corte.');
falas('combo', 'combo.chocolate+cereja', 'feliz', 'Chocolate com cereja e chantilly: floresta negra. Clássico de confeitaria.');
falas('combo', 'combo.chocolate+prestigio', 'feliz', 'Chocolate com coco e brigadeiro. Lembra bombom de coco, só que em fatia.');
falas('combo', 'combo.chocolate+caramelosalgado', 'feliz', 'Chocolate com caramelo salgado. O sal acorda o cacau. Dupla de mestre.');
falas('combo', 'combo.chocolate+cafe', 'feliz', 'Chocolate com café: um puxa o sabor do outro. Combinação de cafeteria.');
falas('combo', 'combo.chocolate+frutasvermelhas', 'feliz', 'Chocolate com frutas vermelhas. O azedinho corta o cacau, fica elegante.');
falas('combo', 'combo.chocolate+pistache', 'surpresa', 'Chocolate com pistache. Verde e marrom no corte, sabor de doceria fina.');
falas('combo', 'combo.chocolate+cookies', 'feliz', 'Massa de chocolate com creme de biscoito: escuro e branco, crocante e macio.');
falas('combo', 'combo.cenoura+meioamargo', 'feliz', 'Cenoura com brigadeiro meio amargo: o clássico, numa versão mais adulta.');
falas('combo', 'combo.cenoura+ganache', 'feliz', 'Cenoura com ganache. Chocolate de verdade para a receita da vó.');
falas('combo', 'combo.cenoura+creamcheese', 'feliz', 'Cenoura com cream cheese: o azedinho do creme faz a massa brilhar.');
falas('combo', 'combo.churros+docedeleite', 'comemora', 'Churros com doce de leite! Só falta a barraquinha na porta.');
falas('combo', 'combo.banana+docedeleite', 'feliz', 'Banana com doce de leite. Sobremesa de fazenda, não tem erro.');
falas('combo', 'combo.banana+caramelosalgado', 'feliz', 'Banana, canela e caramelo salgado. Lembra banana caramelizada na frigideira.');
falas('combo', 'combo.coco+abacaxicoco', 'feliz', 'Coco com abacaxi: gelado, tropical, perfeito para o calor de Cuiabá.');
falas('combo', 'combo.coco+cocada', 'feliz', 'Coco na massa e cocada no recheio. Para quem ama coco sem moderação.');
falas('combo', 'combo.coco+docedeleite', 'feliz', 'Massa de coco com doce de leite. Lembra cocada de tabuleiro.');
falas('combo', 'combo.laranja+ganache', 'feliz', 'Laranja com ganache meio amargo. Chocolate com laranja é paixão antiga.');
falas('combo', 'combo.laranja+meioamargo', 'feliz', 'Laranja com brigadeiro meio amargo. Cítrico e cacau, dupla sofisticada.');
falas('combo', 'combo.maracuja+ganachebranca', 'feliz', 'Maracujá com ganache branca: o azedo e o doce em paz. Delícia.');
falas('combo', 'combo.maracuja+meioamargo', 'feliz', 'Maracujá com chocolate meio amargo. Contraste forte, de dar água na boca.');
falas('combo', 'combo.limao+limaosiciliano', 'neutra', 'Limão na massa e limão-siciliano no recheio. Cítrico de ponta a ponta.');
falas('combo', 'combo.limao+ganachebranca', 'feliz', 'Limão com ganache branca. O chocolate branco amansa o azedinho.');
falas('combo', 'combo.cafe+docedeleite', 'feliz', 'Café com doce de leite. É o cafezinho com sobremesa, numa fatia só.');
falas('combo', 'combo.cafe+caramelosalgado', 'feliz', 'Café com caramelo salgado. Parece bebida de cafeteria chique.');
falas('combo', 'combo.cafe+moussechocolate', 'feliz', 'Café com mousse de chocolate. Macio e intenso ao mesmo tempo.');
falas('combo', 'combo.nozes+docedeleitenozes', 'feliz', 'Nozes na massa e no doce de leite. Sabor de fim de ano.');
falas('combo', 'combo.nozes+ameixa', 'feliz', 'Nozes com ameixa e doce de leite. Receita de família, das boas.');
falas('combo', 'combo.amendoas+framboesa', 'feliz', 'Amêndoas com framboesa. Delicado com ácido, clássico da confeitaria francesa.');
falas('combo', 'combo.amendoas+pistache', 'feliz', 'Amêndoas com pistache. Castanha com castanha, puro requinte.');
falas('combo', 'combo.pacoca+docedeleite', 'comemora', 'Paçoca com doce de leite. Mais brasileiro que isso, só com sanfona.');
falas('combo', 'combo.pacoca+pacoca', 'comemora', 'Paçoca na massa e no recheio! Arraial completo.');
falas('combo', 'combo.formigueiro+brigadeiro', 'feliz', 'Formigueiro com brigadeiro. Festa de criança do começo ao fim.');
falas('combo', 'combo.formigueiro+ninho', 'feliz', 'Formigueiro com creme de leite em pó. Simples, e some da mesa.');
falas('combo', 'combo.mesclada+brigadeiro', 'feliz', 'Mesclada com brigadeiro. Agrada quem ama chocolate e quem prefere baunilha.');
falas('combo', 'combo.funfetti+brigadeirobranco', 'comemora', 'Massa de confete com brigadeiro branco. Doce e alegre, pura festa.');
falas('combo', 'combo.funfetti+ninho', 'feliz', 'Massa de confete com creme de leite em pó. A criançada aprova.');
falas('combo', 'combo.chocolatebranco+frutasvermelhas', 'feliz', 'Chocolate branco com frutas vermelhas. O azedinho equilibra, fica fino.');
falas('combo', 'combo.chocolatebranco+maracuja', 'feliz', 'Chocolate branco com maracujá. Doce e azedo de mãos dadas.');
falas('combo', 'combo.baunilha+pessego', 'feliz', 'Baunilha com pêssego e creme. Lembra as sobremesas de domingo.');
falas('combo', 'combo.baunilha+ameixa', 'feliz', 'Baunilha com ameixa e doce de leite. O bolo das festas de antigamente.');
falas('combo', 'combo.baunilha+frutasvermelhas', 'feliz', 'Baunilha com frutas vermelhas. A massa suave deixa as frutas brilharem.');
falas('combo', 'combo.baunilha+quatroleites', 'feliz', 'Baunilha com quatro leites. Branquinho, molhado, um carinho.');
falas('combo', 'combo.baunilha+cremebelga', 'neutra', 'Baunilha com creme belga. Delicado, com cara de confeitaria europeia.');
falas('combo', 'combo.morango+brigadeirobranco', 'feliz', 'Morango com brigadeiro branco. Rosa e branco, doce como um bombom.');
falas('combo', 'combo.risco.cafe-citrico', 'pensando',
  'Café com cítrico é raro: um amarga, o outro azeda. Quer uma sugestão?',
  'Café e fruta cítrica costumam se estranhar. Um creme suave faz as pazes.',
);

/* ───────── Combinações novas entre recheios (ids em ordem alfabética) ───────── */
falas('combo', 'duo.ninho+nutella', 'comemora', 'Creme de leite em pó com creme de avelã: dupla campeã das festas.');
falas('combo', 'duo.brigadeiro+coco', 'feliz', 'Brigadeiro e beijinho juntos. Os dois docinhos da festa numa fatia só.');
falas('combo', 'duo.cereja+moussechocolate', 'feliz', 'Cereja com mousse de chocolate. Floresta negra em versão nuvem.');
falas('combo', 'duo.frutasvermelhas+ganachebranca', 'feliz', 'Frutas vermelhas com ganache branca. Ácido e doce, bem equilibrado.');
falas('combo', 'duo.ganache+maracuja', 'feliz', 'Ganache com mousse de maracujá. Um dos contrastes mais gostosos que existem.');
falas('combo', 'duo.caramelosalgado+ganache', 'neutra', 'Caramelo salgado com ganache. Intenso, para comer devagar.');
falas('combo', 'duo.cafe+docedeleite', 'feliz', 'Café com doce de leite entre as camadas. Amargo e doce se entendem.');
falas('combo', 'duo.brigadeirobranco+morango', 'feliz', 'Brigadeiro branco com morango. Doce com fruta, clássico que funciona.');
falas('combo', 'duo.frutasvermelhas+limaosiciliano', 'neutra', 'Limão-siciliano com frutas vermelhas. Bem cítrico, bem fresco.');
falas('combo', 'duo.abacaxicoco+coco', 'feliz', 'Abacaxi com coco e beijinho. Tropical e bem cremoso.');
falas('combo', 'duo.framboesa+pistache', 'feliz', 'Pistache com framboesa. Verde e vermelho, par de doceria francesa.');
falas('combo', 'duo.brigadeiro+cookies', 'feliz', 'Brigadeiro com creme de biscoito. Festa de criança que adulto também ama.');
falas('combo', 'duo.cremebelga+morango', 'feliz', 'Creme belga com morango. Lembra torta de morango de vitrine.');
falas('combo', 'duo.maracuja+ninho', 'feliz', 'Maracujá com creme de leite em pó. O azedinho e o suave, sem erro.');

/* ───────── Peças colocadas à mão ───────── */
falas('imersao', 'mao.colocou', 'feliz',
  'No lugar! Peça por peça, o bolo fica com a sua assinatura.',
  'Boa mão! Ficou bem ali.',
  'Isso, uma de cada vez. É assim que confeiteira decora.',
  'Bem colocada! Em trio, as peças ficam mais naturais.',
);
falas('imersao', 'mao.naocoube', 'pensando',
  'Ali não coube. Tenta um pouquinho para o lado.',
  'Esse cantinho já está ocupado. Tem espaço logo ao lado.',
  'Faltou espaço ali. Acontece, o topo é disputado.',
);
falas('imersao', 'mao.tirou', 'neutra', 'Peça retirada. O espaço ficou livre para outra ideia.', 'Tirou uma. Às vezes o bolo respira melhor assim.');
falas('imersao', 'mao.moveu', 'neutra', 'Mudou de lugar. Olho de confeiteira ajusta até ficar bom.', 'Um tiquinho para lá e ficou melhor. Detalhe que conta.');
falas('imersao', 'mao.cheio', 'neutra', 'Já tem peça à mão que chega. Para pôr outra, tira uma antes.');

/* ───────── Gestos do ateliê (curtas e raras) ───────── */
falas('imersao', 'gesto.spread', 'feliz',
  'Isso! Gira o prato, que a cobertura vai se espalhando.',
  'Girando e alisando. É assim mesmo que a gente faz na bancada.',
  'Cobertura espalhada! Mão de confeiteira, hein?',
);
falas('imersao', 'gesto.drip', 'feliz', 'Pingando a calda gota a gota. Cada uma escolhe o seu caminho.', 'Mais calda! Devagar, que ela escorre sozinha.');
falas('imersao', 'gesto.light', 'comemora', 'Velas acesas! Agora o bolo ganhou alma de festa.', 'Acendeu! Olha que luz bonita na cobertura.');
falas('imersao', 'gesto.blow', 'comemora', 'Sopra com vontade e faz um pedido!', 'Apagou! Que o pedido se realize.', 'Soprão! Não sobrou uma acesa.');
falas('imersao', 'gesto.spin', 'neutra', 'Girando o bolo. De todo lado ele tem que estar bonito.', 'Dá a volta completa. Confeiteira confere até as costas do bolo.');

/* ───────── Momentos: a revelação do bolo pronto, foto, vídeo, cartão, modo ───────── */
falas('imersao', 'momento.revelar', 'comemora',
  'Luz baixa, que o bolo vai entrar. Olha só o que você fez.',
  'Chegou a hora! Com vocês, o seu bolo.',
  'Respira fundo. Esse é o momento do bolo.',
);
falas('imersao', 'momento.velas', 'feliz', 'Velas acesas. Pensa bem no pedido.', 'Olha esse brilho. Agora é com você: sopra!');
falas('imersao', 'momento.sopro', 'comemora', 'Parabéns! Soprou tudo de uma vez.', 'Apagadas! Pedido feito, agora é guardar segredo.', 'Viva! Foi um sopro de respeito.');
falas('imersao', 'momento.fim', 'feliz',
  'Esse bolo merece foto. Quer guardar ou mostrar para alguém?',
  'Ficou lindo de verdade. Dá orgulho de ver pronto.',
  'Do prato vazio até aqui, tudo obra sua. Parabéns!',
);
falas('imersao', 'foto.video', 'comemora', 'Vídeo da montagem gravado! O bolo nascendo do zero, em poucos segundos.', 'Gravado! Dá gosto ver o bolo se montando sozinho.');
falas('imersao', 'foto.cartao', 'feliz', 'Cartão pronto para compartilhar. Seu bolo virou convite.', 'Um cartão com o seu bolo. Manda para quem vai dividir a fatia.');
falas('imersao', 'modo.atelie', 'feliz', 'De volta ao ateliê! Avental no lugar, vamos confeitar.', 'Modo ateliê ligado. Aqui a gente monta com calma e com gosto.');
falas('imersao', 'modo.rapido', 'neutra', 'Modo rápido. Eu fico quietinha aqui no canto; precisando, me chama.', 'Direto ao ponto, então. Se quiser um palpite, é só tocar em mim.');
falas('ferramenta', 'ficha', 'neutra', 'A ficha de produção: é assim que o seu bolo chega na nossa cozinha.', 'Tudo anotado na ficha, do jeito que a confeiteira vai ler.');
falas('ferramenta', 'link', 'feliz', 'Link copiado! Quem abrir vê o bolo do jeitinho que está.', 'Copiado. Manda para alguém dar palpite também.');

/* ───────── Regras do confeiteiro com fala própria (regra.<código de js/customizer/rules.js>) ───────── */
falas('alerta', 'regra.vulcao-lateral', 'pensando', 'No vulcão, a lateral é massa com creme escorrendo. Enfeite, só no topo.');
falas('alerta', 'regra.vulcao-escrita', 'pensando', 'Creme escorrendo não segura escrita. No vulcão, a mensagem vai na plaquinha.');
falas('alerta', 'regra.lateral-pecas', 'pensando', 'Esse estilo já toma a lateral inteira. As peças dali sobem para o topo.');
falas('alerta', 'regra.lateral-fita', 'pensando', 'A fita ia esconder o acabamento do pé do bolo. Fica melhor sem ela.');
falas('alerta', 'regra.lateral-bico-lateral', 'pensando', 'A lateral já está tomada pelo estilo da cobertura. Bico por cima não assenta.');
falas('alerta', 'regra.rosetas-escrita', 'pensando', 'Em cima de rosetas não dá para escrever com bico. A plaquinha resolve.');
falas('alerta', 'regra.corrigiu', 'neutra',
  'A cozinha ajustou um detalhe, para o bolo sair do jeito certo.',
  'Um ajuste de confeiteira, para dar certo na vida real.',
  'A cozinha pediu um ajuste, e ele já está feito.',
);

/* ───────── Atalhos: sugestões para o catálogo novo ───────── */
falas('atalho', 'sugere.vulcao', 'feliz',
  ['No vulcão, o sabor mora na massa e na cobertura. Tenho um palpite.', 'No vulcão, o sabor mora na massa e na cobertura. {porque}'],
  ['Bolo vulcão pede massa bem molhadinha. Olha a minha ideia.', 'Bolo vulcão pede massa bem molhadinha. {porque}'],
);
falas('atalho', 'sugere.adicional', 'feliz',
  ['Os sabores estão ótimos. Um adicional no recheio daria um toque a mais.', 'Os sabores estão ótimos. {sugestao} no recheio daria um toque a mais: {porque}'],
  ['Que tal um pedacinho de surpresa no meio do recheio?', 'Que tal {sugestao} no meio do recheio? {porque}'],
);
falas('atalho', 'ideia.florestanegra', 'feliz', 'Floresta negra: chocolate, cereja e chantilly. Um clássico que impõe respeito.');
falas('atalho', 'ideia.churros', 'feliz', 'Churros com doce de leite, castanha na base e canela no ar.');
falas('atalho', 'ideia.redvelvet', 'feliz', 'Red velvet de verdade: cream cheese por dentro e por fora.');
falas('atalho', 'ideia.bananacaramelo', 'feliz', 'Banana com canela, doce de leite e caramelo escorrendo. Conforto puro.');
falas('atalho', 'ideia.pistache', 'surpresa', 'Amêndoas com pistache e framboesa. Verde, rosa e muito requinte.');
falas('atalho', 'ideia.cafeteria', 'feliz', 'Bolo de cafeteria: café, caramelo salgado e mousse de chocolate.');
falas('atalho', 'ideia.cocogelado', 'feliz', 'Coco gelado: massa de coco, beijinho e quatro leites. Branquinho e molhado.');
falas('atalho', 'ideia.arraial', 'comemora', 'Arraial: paçoca com doce de leite e castanha no barrado.');
falas('atalho', 'ideia.laranjachoc', 'feliz', 'Laranja com chocolate meio amargo. Perfumado, com cara de sobremesa fina.');
falas('atalho', 'ideia.confete', 'comemora', 'Festa por dentro: massa de confete com brigadeiro branco e muita cor.');
falas('atalho', 'ideia.vulcaocenoura', 'comemora', 'Vulcão de cenoura com chocolate transbordando. Não tem quem resista.');
falas('atalho', 'ideia.vulcaochocolate', 'comemora', 'Vulcão de chocolate com brigadeiro e granulado. Para os apaixonados.');
falas('atalho', 'ideia.vulcaococo', 'surpresa', 'Vulcão de coco com ganache branca escorrendo. Parece neve derretendo.');

/* ───────── Jogo do ateliê: as encomendas (mesmos grupos e mesma ordem de js/atelier/game/falas.js) ─────────
   O jogo pede a fala pelo nome do grupo: bo.say('jogo.inicio'). Mudou lá? Acrescente aqui NO FIM do grupo. */
// Começou uma encomenda
falas('jogo', 'jogo.inicio', 'feliz',
  'Encomenda nova na bancada! Lê o pedido com calma e mãos à obra.',
  'Chegou cliente! Vamos fazer esse bolo do jeitinho que foi pedido.',
  'Pedido anotado. Eu fico de olho e te aviso se faltar alguma coisa.',
  'Avental no lugar? Então bora atender esse pedido.',
  'Cliente esperando! A comanda fica aqui no canto, é só tocar.',
  'Mais uma encomenda! Gosto de ver esse ateliê movimentado.',
  'Vamos caprichar. Cliente feliz volta sempre.',
);
// Começou a encomenda do dia
falas('jogo', 'jogo.dia', 'comemora',
  'Encomenda do dia saindo! Hoje todo mundo recebeu esse mesmo pedido.',
  'Essa é a encomenda de hoje. Amanhã tem outra, novinha.',
  'Pedido do dia na mesa! Vamos ver o que você apronta.',
  'A encomenda de hoje chegou cedo. Bora atender?',
  'Hoje o desafio é esse. Capricha, que eu estou torcendo.',
);
// Começou o desafio relâmpago
falas('jogo', 'jogo.relampago', 'surpresa',
  'Valendo! Três pedidos e o relógio correndo. Sem medo.',
  'Relâmpago! Monta rapidinho, mas monta bonito.',
  'O relógio começou. Respira e vai escolhendo.',
  'Desafio relâmpago! O tempo é só para dar frio na barriga.',
  'Mão rápida agora! Eu vou contando daqui.',
);
// O relógio do relâmpago zerou
falas('jogo', 'jogo.tempo', 'neutra',
  'O relógio zerou, mas pode terminar com calma. Aqui ninguém perde.',
  'Tempo! Se quiser, termina sem pressa e entrega depois.',
  'Acabou o tempo. O bolo ainda pode ficar lindo.',
  'Zerou! Relógio é detalhe, o que vale é o bolo.',
);
// Tudo o que o cliente pediu está no bolo
falas('jogo', 'jogo.pronto', 'feliz',
  'Está tudo aí! Quando quiser, é só entregar.',
  'Não falta nada do pedido. Pode entregar esse bolo.',
  'Conferi a comanda: tudo certo. Bora entregar?',
  'Pedido completo! O cliente vai gostar de ver isso.',
);
// O bolo foi entregue (antes da nota aparecer)
falas('jogo', 'jogo.entrega', 'pensando',
  'Bolo na caixa! Vamos ver a cara do cliente.',
  'Entregue! Agora é esperar a reação.',
  'Lá vai o bolo. Estou até nervosa.',
  'Caixa fechada e laço dado. Tomara que goste!',
  'Saiu para entrega! Quero ver esse sorriso.',
);
// Entrega com três estrelas
falas('jogo', 'jogo.estrelas.3', 'comemora',
  'Três estrelas! O cliente saiu sorrindo de orelha a orelha.',
  'Perfeito! Era exatamente isso que foi pedido.',
  'Nota máxima! Esse bolo eu assinava embaixo.',
  'Acertou em cheio! Pedido, sabor e visual, tudo no lugar.',
  'Três estrelas brilhando! Isso é trabalho de confeiteiro.',
  'Que entrega! O cliente já quer encomendar outro.',
  'Cliente feliz, Bô feliz. Três estrelas merecidas!',
);
// Entrega com duas estrelas
falas('jogo', 'jogo.estrelas.2', 'feliz',
  'Duas estrelas! Ficou bom, faltou só um detalhe.',
  'Quase perfeito. Olha na comanda o que ficou de fora.',
  'O cliente gostou, mas sentiu falta de uma coisinha.',
  'Boa entrega! Com um ajuste, vira nota máxima.',
  'Duas estrelas é bolo bem feito. A terceira está pertinho.',
  'Foi por pouco! Quer tentar de novo e fechar as três?',
  'Ficou gostoso. Só não era bem tudo o que foi pedido.',
);
// Entrega com uma estrela
falas('jogo', 'jogo.estrelas.1', 'neutra',
  'Uma estrela. O bolo saiu, mas o pedido era outro.',
  'Entregar já vale! Vamos reler o pedido juntos?',
  'O cliente comeu, mas queria uma coisa diferente.',
  'Acontece nas melhores confeitarias. Tenta de novo, eu ajudo.',
  'Dessa vez passou longe do pedido. A próxima sai melhor.',
  'Uma estrela é começo. Dá uma olhada no que faltou.',
  'Tudo bem errar. Bolo bom se aprende fazendo.',
);
// O bolo acertou a surpresa que o cliente não contou
falas('jogo', 'jogo.surpresa', 'surpresa',
  'Você adivinhou o desejo secreto do cliente! Como é que pode?',
  'Surpresa certeira! Nem precisou o cliente contar.',
  'Isso o cliente nem tinha pedido, e amou.',
  'Leu o pensamento do cliente! Isso é dom.',
);
// Ganhou uma figurinha nova
falas('jogo', 'jogo.figurinha', 'comemora',
  'Figurinha nova para o álbum!',
  'Olha só, ganhou uma figurinha!',
  'Mais uma para a coleção. Já colei no álbum.',
  'Figurinha fresquinha! Dá uma espiada no álbum.',
  'Essa você ainda não tinha. Álbum crescendo!',
  'Ganhou figurinha! Eu adoro quando isso acontece.',
);
// Ganhou uma figurinha secreta
falas('jogo', 'jogo.figurinha.secreta', 'surpresa',
  'Uma figurinha secreta! Essa quase ninguém acha.',
  'Opa, você achou um segredo do ateliê!',
  'Figurinha escondida! Como foi que você descobriu?',
  'Segredo revelado! Essa é das raras.',
  'Achou uma das secretas. Não conta para ninguém!',
  'Essa estava bem escondida. Olho de confeiteiro!',
);
// Dica: falta um sabor que o cliente pediu
falas('jogo', 'jogo.dica.sabor', 'pensando',
  'Ainda falta um sabor do pedido. Dá uma olhada na massa e no recheio.',
  'O cliente pediu um sabor que eu não achei aí.',
  'Confere a comanda: tem sabor pedido que ficou de fora.',
  'Faltou um gostinho que o cliente queria. Olha os recheios.',
  'Psiu: o sabor do pedido ainda não entrou no bolo.',
);
// Dica: falta um enfeite, uma cor ou um detalhe de visual
falas('jogo', 'jogo.dica.visual', 'pensando',
  'Por fora ainda falta um detalhe do pedido.',
  'O cliente pediu um enfeite que eu não estou vendo.',
  'Repara na comanda: falta um capricho no visual.',
  'A cor ou o enfeite ainda não é o que foi pedido.',
  'Falta pouco! Só um detalhe da decoração.',
);
// Dica: o bolo tem algo que o cliente disse que não gosta
falas('jogo', 'jogo.dica.naogosta', 'preocupada',
  'Cuidado: tem uma coisa aí que o cliente não gosta.',
  'Ih, isso o cliente pediu para não pôr.',
  'Melhor tirar isso. O cliente avisou que não gosta.',
  'Olha a comanda: tem um item riscado ali no bolo.',
);
// Dica: o bolo é pequeno para o número de pessoas
falas('jogo', 'jogo.dica.pessoas', 'preocupada',
  'Esse bolo está pequeno para tanta gente.',
  'Vai faltar fatia! Aumenta o tamanho ou sobe um andar.',
  'A festa é maior que o bolo. Dá para crescer?',
  'Com esse tamanho, alguém fica sem pedaço.',
);
// Dica: o bolo demora mais que o prazo do cliente
falas('jogo', 'jogo.dica.prazo', 'preocupada',
  'Esse bolo demora mais do que o cliente pode esperar.',
  'O prazo está apertado. Tem enfeite aí que pede dias de preparo.',
  'Assim não fica pronto a tempo. Simplifica um pouco.',
);
// Dica: os sabores brigam ou o visual está carregado
falas('jogo', 'jogo.dica.combina', 'pensando',
  'O pedido está certo, mas a combinação pode melhorar.',
  'Tem coisa demais disputando a atenção nesse bolo.',
  'Esses sabores estão brigando. Troca um recheio e me conta.',
);
// O preço passou do orçamento do cliente
falas('jogo', 'jogo.orcamento', 'preocupada',
  'Passou do orçamento! Vamos trocar alguma coisa por uma mais simples.',
  'Ih, ficou mais caro do que o cliente pode pagar.',
  'O bolso do cliente não alcança. Que tal tirar um enfeite?',
  'Estourou o combinado. Um recheio mais em conta resolve.',
  'O preço subiu além da conta. Dá para enxugar sem perder a graça.',
);
// Voltou ao modo livre
falas('jogo', 'jogo.livre', 'feliz',
  'De volta ao modo livre. Aqui quem manda é você.',
  'Seu bolo voltou para a bancada, do jeitinho que estava.',
  'Encomendas guardadas. Agora é criar à vontade.',
);

/* ───────── Montagem: grupos → falas com id ───────── */

/** Todas as falas por id: { id, group, cat, mood, text (falado), show (modelo do balão ou null) }. */
export const LINES = {};
/** Ids de cada grupo, na ordem: POOLS['massa.chocolate'] → ['massa.chocolate.1', 'massa.chocolate.2']. */
export const POOLS = {};

for (const [group, g] of Object.entries(G)) {
  POOLS[group] = g.textos.map((t, i) => {
    const id = `${group}.${i + 1}`;
    const [text, show] = Array.isArray(t) ? t : [t, null];
    LINES[id] = { id, group, cat: g.cat, mood: g.humor, text, show };
    return id;
  });
}

/** Nomes das categorias, para relatórios e para a bancada. */
export const CATEGORIES = {
  boasvindas: 'Boas-vindas e retorno',
  etapa: 'Etapas (abertura e dica)',
  opcao: 'Opções do catálogo',
  tag: 'Genéricas por tipo e por tag',
  combo: 'Combinações de sabor',
  cor: 'Cores',
  estrutura: 'Estrutura e equilíbrio',
  alerta: 'Alertas e regras',
  preco: 'Preço',
  prazo: 'Prazo',
  ocasiao: 'Ocasião',
  elogio: 'Elogios',
  papo: 'Incentivo, humor e ociosidade',
  ferramenta: 'Ferramentas do palco',
  carrinho: 'Carrinho e despedida',
  atalho: 'Atalhos "Pergunte à Bô"',
  nota: 'Nota da Bô',
  imersao: 'Gestos e momentos do ateliê',
  jogo: 'Jogo do ateliê (encomendas)',
};

export const hasGroup = (group) => Boolean(POOLS[group]);

/** Preenche as {variaveis} de um modelo de balão. O que não vier some junto com o espaço em volta. */
export function fill(template, vars = {}) {
  return String(template)
    .replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? '' : String(vars[k])))
    .replace(/\s+([.,:;!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Texto do balão de uma fala (com as variáveis) — igual ao falado quando não há modelo próprio. */
export function showText(id, vars) {
  const l = LINES[id];
  if (!l) return '';
  return l.show ? fill(l.show, vars) : l.text;
}

/** Contagem de falas por categoria (para o relatório). */
export function countByCategory() {
  const out = {};
  Object.values(LINES).forEach((l) => {
    out[l.cat] = (out[l.cat] || 0) + 1;
  });
  return out;
}
