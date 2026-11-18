// BOLAB — Ateliê, jogo: as encomendas. Clientes de mentira, com pedido, gosto, ocasião e orçamento.
// Para escrever uma encomenda nova, copie uma parecida e troque os textos; a nota sai sozinha (score.js).
//
//   {
//     id, nivel: 1 fácil · 2 médio · 3 caprichado,
//     cliente: { nome, trato ("A Lia": como as frases falam dela), pl (true = "pediram"), tipo, retrato },
//     ocasiao, pedido (uma ou duas frases, na voz do cliente),
//     pessoas, orcamento (R$), dias (prazo, opcional),
//     quer: [desejos]      naoGosta: [desejos ao contrário]      surpresa: desejo que o cliente não contou (opcional)
//     feliz / quase        o que o cliente diz com 3 e com 2 estrelas (com 1, vale a fala do tipo dele)
//     quando: [meses]      encomenda de época (junho, dezembro…): na "encomenda do dia" só aparece nesses meses
//   }
//
// DESEJO = { c: 's' sabor | 'v' visual | 'p' pedido, k: tipo, t: como aparece na comanda ("chocolate"), … }
//   tem      alguma opção escolhida bate com ids / tag (etiqueta do cardápio) / word (pedaço do nome); em = onde procurar
//   decor    pelo menos `min` enfeites diferentes batem           cor      cobertura numa das famílias de cor (fam)
//   andares  { min, max }     velas { estilo, numero }     recado { inclui }     calda     revelacao
//   regra    nenhuma das regras de confeiteiro listadas em `sem` (js/customizer/rules.js) aparece
//   ou / e   combinações (de: [desejos])
// achou / falta = frase própria para quando acerta / erra (senão sai "A Lia pediu chocolate e ganhou.").
// NADA de restrição alimentar (alergia, "sem glúten", "vegano"): decisão da BOLAB.
import { hash32 } from '../bo/brain.js';

const EDIBLE = ['massa', 'recheio', 'adicional', 'cobertura'];
/** sabor que está no bolo (massa, recheio, adicional ou cobertura) */
const sabor = (t, m, x = {}) => ({ c: 's', k: 'tem', t, em: EDIBLE, ...m, ...x });
/** uma opção exata de uma família: massa('cenoura', ['cenoura']) */
const opcao = (c, kind) => (t, ids, x = {}) => ({ c, k: 'tem', t, em: [kind], ids, ...x });
const massa = opcao('s', 'massa');
const recheio = opcao('s', 'recheio');
const formato = opcao('v', 'formato');
const tamanho = opcao('v', 'tamanho');
/** enfeite (decoração do bolo ou peça colocada à mão) */
const enfeite = (t, m, x = {}) => ({ c: 'v', k: 'decor', t, ...m, ...x });
const cor = (t, fam, x = {}) => ({ c: 'v', k: 'cor', t, fam, ...x });
const andares = (t, min, max = 3, x = {}) => ({ c: 'v', k: 'andares', t, min, max, ...x });
const velas = (t, m = {}, x = {}) => ({ c: 'v', k: 'velas', t, ...m, ...x });
const recado = (t, inclui = '', x = {}) => ({ c: 'v', k: 'recado', t, inclui, ...x });
const jeito = (t, tag, x = {}) => ({ c: 'v', k: 'tem', t, tag, em: ['cobertura', 'estilo', 'bico', 'base', 'formato'], ...x });
/** cuidados de confeiteiro (regras de js/customizer/rules.js) */
const calor = (t = 'aguentar o calor') => ({ c: 'p', k: 'regra', t, sem: ['calor-cobertura'], achou: 'Aguenta o calor sem derreter.', falta: 'Essa cobertura sofre no calor: o bolo ia chegar derretendo.' });
const viagem = (t = 'viajar sem geladeira') => ({ c: 'p', k: 'regra', t, sem: ['calor-cobertura', 'recheio-frio', 'pasta-geladeira'], achou: 'Viaja bem: nada ali precisa de geladeira.', falta: 'Tem coisa nesse bolo que pede geladeira, e o caminho é longo.' });
const firme = (t = 'ficar firme de pé') => ({ c: 'p', k: 'regra', t, sem: ['dois-andares-mole', 'andares-recheio-mole', 'alto-recheio-mole'], achou: 'Está firme: aguenta o peso dos andares.', falta: 'Com creme mole entre os andares, o bolo pode ceder.' });
/** o que o cliente NÃO quer (procura no bolo inteiro) */
const nao = (t, m, x = {}) => ({ c: 's', k: 'tem', t, ...m, ...x });

const CHOCOLATE = { tag: 'chocolate' };
const COCO = { tag: 'coco', word: 'coco\\b|cocada' };

/** O que o cliente diz quando a entrega vale 1 estrela (por tipo de cliente). */
export const SEM_GRACA = {
  crianca: ['Hum… não era bem esse que eu tinha imaginado.', 'Eu como, tá? Mas não foi o que eu pedi.'],
  adulto: ['Obrigado pelo capricho, mas não era bem o combinado.', 'Dá para servir. Só não é o bolo que eu pedi.'],
  idoso: ['Ô, meu bem… ficou diferente do que eu falei, não ficou?', 'Agradeço o carinho. Da próxima vez a gente acerta.'],
  grupo: ['A gente agradece, mas não era isso que estava combinado.', 'Vai dar para a festa. Só não é o que a gente pediu.'],
};

export const NIVEIS = { 1: 'Fácil', 2: 'Médio', 3: 'Caprichado' };

export const ORDERS = [
  /* ───────── Fáceis: um desejo ou dois, orçamento folgado ───────── */
  {
    id: 'lia',
    nivel: 1,
    cliente: { nome: 'Lia', trato: 'A Lia', tipo: 'crianca', retrato: { pele: 'c', cabelo: 'maria', cor: 'castanho', extra: ['bochecha'], roupa: '#f5a9b9', fundo: '#ffe7ec', idade: 'crianca' } },
    ocasiao: 'Aniversário de 7 anos',
    pedido: 'Faço sete anos no sábado! Quero um bolo de chocolate, bem chocolatudo. Vêm dez amigos.',
    pessoas: 10,
    orcamento: 165,
    quer: [sabor('chocolate', CHOCOLATE, { falta: 'A Lia pediu chocolate e não achou nenhum.' }), velas('velinhas para soprar')],
    feliz: 'É o bolo mais chocolatudo do mundo! Posso lamber a espátula?',
    quase: 'Tá gostoso! Mas faltou uma coisinha do que eu pedi…',
  },
  {
    id: 'seu-zeca',
    nivel: 1,
    cliente: { nome: 'Seu Zeca', trato: 'O Seu Zeca', tipo: 'idoso', retrato: { pele: 'b', cabelo: 'careca', cor: 'grisalho', extra: ['bigode', 'oculos'], roupa: '#7fae8a', fundo: '#e7f6ec', idade: 'idoso' } },
    ocasiao: 'Café de domingo',
    pedido: 'Bolo de cenoura com chocolate por cima, do jeitinho que a minha mãe fazia. Somos oito no café.',
    pessoas: 8,
    orcamento: 145,
    quer: [massa('massa de cenoura', ['cenoura']), { c: 's', k: 'tem', t: 'chocolate por cima', em: ['cobertura', 'recheio'], tag: 'chocolate' }],
    feliz: 'Fechei o olho e voltei para a cozinha da minha mãe. Obrigado, viu?',
    quase: 'Está bom, está bom. Mas o da minha mãe tinha outra coisa…',
  },
  {
    id: 'bia',
    nivel: 1,
    cliente: { nome: 'Bia', trato: 'A Bia', tipo: 'crianca', retrato: { pele: 'a', cabelo: 'rabo', cor: 'loiro', extra: ['laco', 'bochecha'], roupa: '#c7a7ff', fundo: '#f1e9ff', idade: 'crianca' } },
    ocasiao: 'Aniversário de 5 anos',
    pedido: 'Rosa! Tem que ser cor-de-rosa. E com confete, muito confete!',
    pessoas: 8,
    orcamento: 140,
    quer: [cor('cobertura cor-de-rosa', ['rosa']), { c: 'v', k: 'tem', t: 'confete', ids: ['funfetti', 'confete', 'confeitos'], em: ['massa', 'decor', 'avulso', 'confeito'] }],
    feliz: 'É ROSA! E tem confete! É o melhor dia da minha vida!',
    quase: 'Bonito… mas cadê o resto que eu pedi?',
  },
  {
    id: 'dona-cida',
    nivel: 1,
    cliente: { nome: 'Dona Cida', trato: 'A Dona Cida', tipo: 'idoso', retrato: { pele: 'd', cabelo: 'coque', cor: 'grisalho', extra: ['oculos', 'brinco'], roupa: '#e8809a', fundo: '#fff4d6', idade: 'idoso' } },
    ocasiao: 'Café com as vizinhas',
    pedido: 'Um bolo de laranja para o café com as vizinhas. Chocolate não, que eu enjoei. Somos seis.',
    pessoas: 6,
    orcamento: 145,
    quer: [massa('massa de laranja', ['laranja'])],
    naoGosta: [nao('chocolate', CHOCOLATE)],
    feliz: 'Que cheiro de laranja! As vizinhas vão pedir a receita, e eu não dou.',
    quase: 'Ficou bom, meu bem. Só não era bem o que eu falei.',
  },
  {
    id: 'theo',
    nivel: 1,
    cliente: { nome: 'Theo', trato: 'O Theo', tipo: 'crianca', retrato: { pele: 'e', cabelo: 'black', cor: 'preto', extra: [], roupa: '#2d8b4a', fundo: '#e7f6ec', idade: 'crianca' } },
    ocasiao: 'Aniversário de 9 anos',
    pedido: 'Quero um campo de futebol em cima do bolo: gramado verde e uma bola. Vai o time todo, doze pessoas.',
    pessoas: 12,
    orcamento: 225,
    quer: [enfeite('uma bola de futebol', { ids: ['bola'] }), { c: 'v', k: 'ou', t: 'gramado verde', de: [{ k: 'tem', ids: ['grama'], em: ['bico'] }, { k: 'cor', fam: ['verde'] }] }],
    feliz: 'Golaço! Esse bolo vai para a final do campeonato.',
    quase: 'Legal! Mas ficou faltando um pedaço do campo.',
  },
  {
    id: 'marina',
    nivel: 1,
    cliente: { nome: 'Marina', trato: 'A Marina', tipo: 'adulto', retrato: { pele: 'c', cabelo: 'longo', cor: 'preto', extra: ['brinco'], roupa: '#d12d58', fundo: '#ffe7ec', idade: 'adulto' } },
    ocasiao: 'Aniversário de namoro',
    pedido: 'Um bentô para o Caio, só para nós dois, com “Te amo” escrito. Ele finge que não liga, mas liga.',
    pessoas: 2,
    orcamento: 85,
    quer: [tamanho('tamanho bentô', ['bento']), recado('“Te amo” escrito', 'te amo')],
    feliz: 'Ele fingiu que não ligou por dois segundos. Depois tirou foto de todos os ângulos.',
    quase: 'Fofo! Mas eu tinha pedido outra coisinha também.',
  },
  {
    id: 'tio-beto',
    nivel: 1,
    cliente: { nome: 'Tio Beto', trato: 'O Tio Beto', tipo: 'adulto', retrato: { pele: 'd', cabelo: 'curto', cor: 'preto', extra: ['barba', 'bone'], roupa: '#f2a60c', fundo: '#fff4d6', idade: 'adulto' } },
    ocasiao: 'Churrasco de domingo',
    pedido: 'Depois do churrasco, a turma quer bolo de coco. Bem branquinho, sem invenção. Somos uns quinze.',
    pessoas: 15,
    orcamento: 260,
    quer: [sabor('coco', { tag: 'coco' }), cor('branquinho por fora', ['branco', 'creme'])],
    feliz: 'Rapaz, esse coco está de comer rezando. Guarda um pedaço que eu levo para casa.',
    quase: 'Bom demais. Só que eu tinha falado outra coisa, lembra?',
  },
  {
    id: 'duda',
    nivel: 1,
    cliente: { nome: 'Duda', trato: 'A Duda', tipo: 'crianca', retrato: { pele: 'b', cabelo: 'chanel', cor: 'ruivo', extra: ['bochecha'], roupa: '#e2334f', fundo: '#ffe7ec', idade: 'crianca' } },
    ocasiao: 'Aniversário de 12 anos',
    pedido: 'Morango! Dentro do bolo e em cima também, com a fruta de verdade. São dez pessoas.',
    pessoas: 10,
    orcamento: 165,
    quer: [
      { c: 's', k: 'tem', t: 'morango dentro do bolo', em: ['massa', 'recheio', 'adicional'], word: 'morang', falta: 'A Duda pediu morango dentro do bolo e não achou nenhum.' },
      enfeite('morangos de verdade em cima', { ids: ['morangosfrescos', 'morangos', 'frutas'] }),
    ],
    feliz: 'Morango em todo lugar! Vou comer o de cima primeiro.',
    quase: 'Quase! Mas ainda dava para ter mais morango, né?',
  },
  {
    id: 'prof-ana',
    nivel: 1,
    cliente: { nome: 'Professora Ana', trato: 'A professora Ana', tipo: 'adulto', retrato: { pele: 'e', cabelo: 'cacheado', cor: 'castanho', extra: ['oculos'], roupa: '#1a4a8b', fundo: '#e3f0ff', idade: 'adulto' } },
    ocasiao: 'Último dia de aula',
    pedido: 'É a festinha da turma: vinte crianças com fome. Um bolo simples, com recheio de brigadeiro. Café não, que é para criança.',
    pessoas: 20,
    orcamento: 265,
    quer: [{ c: 's', k: 'tem', t: 'recheio de brigadeiro', em: ['recheio'], word: 'brigadeiro' }],
    naoGosta: [nao('café', { tag: 'cafe' })],
    feliz: 'Vinte crianças em silêncio por três minutos. Isso não tem preço.',
    quase: 'As crianças comeram, mas eu tinha pedido diferente.',
  },
  {
    id: 'vo-nena',
    nivel: 1,
    cliente: { nome: 'Vó Nena', trato: 'A Vó Nena', tipo: 'idoso', retrato: { pele: 'a', cabelo: 'coque', cor: 'branco', extra: ['brinco', 'bochecha'], roupa: '#b497f0', fundo: '#f1e9ff', idade: 'idoso' } },
    ocasiao: 'Aniversário de 80 anos',
    pedido: 'Recheio de ameixa com doce de leite, como nas festas de antigamente. E velinha, que eu ainda tenho fôlego! Quinze pessoas.',
    pessoas: 15,
    orcamento: 285,
    quer: [recheio('recheio de ameixa', ['ameixa']), velas('velinha para soprar')],
    feliz: 'Igualzinho ao do meu casamento! Vou soprar a vela e pedir mais oitenta.',
    quase: 'Está uma gostosura, mas eu tinha pedido de outro jeito.',
  },
  {
    id: 'seu-nilton',
    nivel: 1,
    cliente: { nome: 'Seu Nilton', trato: 'O Seu Nilton', tipo: 'adulto', retrato: { pele: 'c', cabelo: 'topete', cor: 'castanho', extra: ['bigode'], roupa: '#b9772c', fundo: '#fbeed9', idade: 'adulto' } },
    ocasiao: 'Lanche da oficina',
    pedido: 'Aquele bolo vulcão, com a cobertura de chocolate transbordando do furo. A oficina inteira vai lanchar: dez pessoas.',
    pessoas: 10,
    orcamento: 180,
    quer: [formato('bolo vulcão', ['vulcao']), { c: 's', k: 'tem', t: 'chocolate transbordando', em: ['cobertura'], tag: 'chocolate' }],
    feliz: 'Olha esse chocolate descendo! Hoje ninguém trabalha depois do lanche.',
    quase: 'Bom, bom. Mas o vulcão que eu pedi era outro.',
  },

  /* ───────── Médias: tema, cor, recado, um cuidado ───────── */
  {
    id: 'sofia',
    nivel: 2,
    cliente: { nome: 'Sofia', trato: 'A Sofia', tipo: 'crianca', retrato: { pele: 'b', cabelo: 'longo', cor: 'castanho', extra: ['tiara'], roupa: '#f7b7c8', fundo: '#ffe7ec', idade: 'adulto' } },
    ocasiao: 'Festa de 15 anos',
    pedido: 'Quinze anos é uma vez só: quero dois andares, rosa, com borboletas. E a vela de número, por favor. Trinta convidados.',
    pessoas: 30,
    orcamento: 455,
    quer: [andares('dois andares', 2), cor('cobertura rosa', ['rosa']), enfeite('borboletas', { ids: ['borboletas'] }), velas('vela de número 15', { estilo: 'numero', numero: '15' })],
    feliz: 'Ai, ficou perfeito! Vai ser a primeira foto do meu álbum.',
    quase: 'Tá lindo, mas eu sonhei com ele um pouquinho diferente.',
  },
  {
    id: 'cha-revelacao',
    nivel: 2,
    cliente: { nome: 'Carol e Rafa', trato: 'A Carol e o Rafa', pl: true, tipo: 'grupo', retrato: { pele: 'c', cabelo: 'cacheado', cor: 'preto', extra: ['brinco'], roupa: '#ffd166', fundo: '#fff4d6', idade: 'adulto', par: { pele: 'd', cabelo: 'curto', cor: 'preto', extra: ['barba'], roupa: '#6fcfa8' } } },
    ocasiao: 'Chá revelação',
    pedido: 'O segredo fica no recheio! Por fora, nada de rosa nem de azul, para ninguém desconfiar. Vêm vinte pessoas.',
    pessoas: 20,
    orcamento: 265,
    quer: [{ c: 'v', k: 'revelacao', t: 'recheio com a cor em segredo' }, enfeite('um enfeite de bebê', { tag: 'bebe' })],
    naoGosta: [{ c: 'v', k: 'cor', t: 'rosa ou azul por fora', fam: ['rosa', 'azul'], falta: 'A cobertura entregou o segredo: era para não ter rosa nem azul por fora.' }],
    feliz: 'Ninguém desconfiou de nada! A vó quase desmaiou na hora do corte.',
    quase: 'Deu certo, mas ficou faltando um detalhe do combinado.',
  },
  {
    id: 'formandos',
    nivel: 2,
    cliente: { nome: 'Formandos de Enfermagem', trato: 'Os formandos', pl: true, tipo: 'grupo', retrato: { pele: 'e', cabelo: 'coque', cor: 'preto', extra: ['capelo'], roupa: '#1d1a1c', fundo: '#e3f0ff', idade: 'adulto', par: { pele: 'b', cabelo: 'curto', cor: 'castanho', extra: ['capelo', 'oculos'], roupa: '#1d1a1c' } } },
    ocasiao: 'Formatura',
    pedido: 'Cinco anos de plantão e chegou o diploma! Metade da turma quer chocolate, a outra metade quer doce de leite. Capelo em cima e “Parabéns” no bolo. Trinta pessoas.',
    pessoas: 30,
    orcamento: 300,
    quer: [sabor('chocolate', CHOCOLATE), sabor('doce de leite', { word: 'doce de leite' }), enfeite('capelo e diploma', { ids: ['capelo'] }), recado('“Parabéns” no bolo', 'parab')],
    feliz: 'Agora sim somos enfermeiros com bolo! A turma inteira agradece.',
    quase: 'A turma gostou, mas metade ficou sem o que pediu.',
  },
  {
    id: 'arraial',
    nivel: 2,
    cliente: { nome: 'Dona Fátima', trato: 'A Dona Fátima', tipo: 'adulto', retrato: { pele: 'd', cabelo: 'tranca', cor: 'preto', extra: ['flor', 'bochecha'], roupa: '#e2334f', fundo: '#fff4d6', idade: 'adulto' } },
    ocasiao: 'Festa junina da rua',
    pedido: 'É o arraial da rua! Quero gosto de paçoca, bandeirinhas e cara de São João. Uns vinte e cinco vizinhos.',
    pessoas: 25,
    orcamento: 350,
    quando: [6, 7],
    quer: [{ c: 's', k: 'tem', t: 'gosto de paçoca', em: ['massa', 'recheio'], word: 'pacoc' }, enfeite('bandeirinhas', { ids: ['bandeirolas'] }), enfeite('dois enfeites de festa junina', { tag: 'junino', min: 2 })],
    feliz: 'Eita, que trem bonito! Esse vai para o centro da mesa, do lado da canjica.',
    quase: 'Está arrumadinho, mas o arraial pedia mais.',
  },
  {
    id: 'natal',
    nivel: 2,
    cliente: { nome: 'Tia Lúcia', trato: 'A Tia Lúcia', tipo: 'adulto', retrato: { pele: 'a', cabelo: 'chanel', cor: 'loiro', extra: ['brinco', 'oculos'], roupa: '#8b1a1a', fundo: '#e7f6ec', idade: 'adulto' } },
    ocasiao: 'Ceia de Natal',
    pedido: 'A ceia é lá em casa. Quero um bolo com cara de Natal e gosto de castanha, com “Feliz Natal” no bolo. Dezesseis à mesa.',
    pessoas: 16,
    orcamento: 275,
    quando: [12],
    quer: [sabor('gosto de castanha', { tag: 'castanhas' }), enfeite('dois enfeites de Natal', { tag: 'natal', min: 2 }), recado('“Feliz Natal” no bolo', 'natal')],
    feliz: 'Ficou mais bonito que a árvore! Este ano a sobremesa ganhou do peru.',
    quase: 'Bonito. Mas Natal lá em casa é mais caprichado, sabe?',
  },
  {
    id: 'maes',
    nivel: 2,
    cliente: { nome: 'Pedro', trato: 'O Pedro', tipo: 'crianca', retrato: { pele: 'c', cabelo: 'franja', cor: 'castanho', extra: ['bochecha'], roupa: '#6fb6f2', fundo: '#e3f0ff', idade: 'crianca' } },
    ocasiao: 'Dia das Mães',
    pedido: 'É surpresa para a minha mãe! Ela ama flor e ama limão. Escreve “Mãe” no bolo? Juntei a mesada inteira. Somos oito.',
    pessoas: 8,
    orcamento: 130,
    quando: [5],
    quer: [sabor('limão', { tag: 'citrico' }), enfeite('flores', { tag: 'flor' }), recado('“Mãe” no bolo', 'mae')],
    feliz: 'Ela chorou! Mas disse que era de alegria. Valeu a mesada inteira.',
    quase: 'A mamãe gostou, mas eu queria que fosse igualzinho ao que eu pedi.',
  },
  {
    id: 'casamento-civil',
    nivel: 2,
    cliente: { nome: 'Helena e Jorge', trato: 'A Helena e o Jorge', pl: true, tipo: 'grupo', retrato: { pele: 'b', cabelo: 'coque', cor: 'castanho', extra: ['flor'], roupa: '#ffffff', fundo: '#f2e4c7', idade: 'adulto', par: { pele: 'c', cabelo: 'curto', cor: 'grisalho', extra: ['gravata'], roupa: '#3d3a3c' } } },
    ocasiao: 'Casamento no cartório',
    pedido: 'Vamos casar no cartório e almoçar com a família. Um bolo branco, de um andar só, com flores e as alianças. Vinte pessoas.',
    pessoas: 20,
    orcamento: 280,
    quer: [cor('bolo branco', ['branco', 'creme']), andares('um andar só', 1, 1), enfeite('flores', { tag: 'flor' }), enfeite('as alianças', { ids: ['aliancas'] })],
    feliz: 'Simples e lindo, como a gente queria. O Jorge já quer casar de novo só pelo bolo.',
    quase: 'Ficou bonito, mas faltou um detalhe do nosso pedido.',
  },
  {
    id: 'despedida',
    nivel: 2,
    cliente: { nome: 'Pessoal do RH', trato: 'O pessoal do RH', tipo: 'grupo', retrato: { pele: 'd', cabelo: 'curto', cor: 'preto', extra: ['oculos', 'gravata'], roupa: '#5f8f6a', fundo: '#e7f6ec', idade: 'adulto', par: { pele: 'a', cabelo: 'chanel', cor: 'ruivo', extra: [], roupa: '#d96b82' } } },
    ocasiao: 'Despedida de colega',
    pedido: 'A Márcia do financeiro vai embora e só funciona à base de café. Queremos gosto de café e “Boa sorte” no bolo. Fruta não: ela tira tudo do prato. A vaquinha deu pouco. Quinze pessoas.',
    pessoas: 15,
    orcamento: 215,
    quer: [{ c: 's', k: 'tem', t: 'gosto de café', em: ['massa', 'recheio', 'molhar'], tag: 'cafe' }, recado('“Boa sorte” no bolo', 'sorte')],
    naoGosta: [{ c: 's', k: 'ou', t: 'fruta', de: [{ k: 'tem', tag: 'fruta' }, { k: 'tem', tag: 'frutado' }] }],
    feliz: 'A Márcia disse que agora nem quer mais ir embora. O financeiro agradece.',
    quase: 'O pessoal comeu, mas não era bem a cara da Márcia.',
  },
  {
    id: 'halloween',
    nivel: 2,
    cliente: { nome: 'Gui', trato: 'O Gui', tipo: 'crianca', retrato: { pele: 'a', cabelo: 'topete', cor: 'preto', extra: [], roupa: '#4a1a6a', fundo: '#f1e9ff', idade: 'crianca' } },
    ocasiao: 'Festa de Halloween',
    pedido: 'Festa de Halloween lá em casa! Quero um bolo de dar medo: roxo ou laranja, com fantasma e abóbora. De chocolate. Doze amigos.',
    pessoas: 12,
    orcamento: 235,
    quando: [10],
    quer: [sabor('chocolate', CHOCOLATE), cor('cobertura roxa ou laranja', ['roxo', 'laranja']), enfeite('dois enfeites de Halloween', { tag: 'halloween', min: 2 })],
    feliz: 'Buuu! Ficou assustadoramente gostoso. Minha irmã gritou.',
    quase: 'Deu um medinho, mas eu queria que desse medão.',
  },
  {
    id: 'pascoa',
    nivel: 2,
    cliente: { nome: 'Tia Rê', trato: 'A Tia Rê', tipo: 'adulto', retrato: { pele: 'c', cabelo: 'rabo', cor: 'castanho', extra: ['bochecha'], roupa: '#bfe8c8', fundo: '#fff4d6', idade: 'adulto' } },
    ocasiao: 'Almoço de Páscoa',
    pedido: 'Domingo de Páscoa com os sobrinhos: massa de cenoura, que é a preferida do coelho, chocolate e enfeites de Páscoa. Dez pessoas.',
    pessoas: 10,
    orcamento: 175,
    quando: [3, 4],
    quer: [massa('massa de cenoura', ['cenoura']), { c: 's', k: 'tem', t: 'chocolate', em: ['recheio', 'cobertura'], tag: 'chocolate' }, enfeite('dois enfeites de Páscoa', { tag: 'pascoa', min: 2 })],
    feliz: 'Os sobrinhos acharam que foi o coelho que trouxe. Deixei eles acharem.',
    quase: 'As crianças gostaram, mas a Páscoa pedia mais capricho.',
  },
  {
    id: 'piquenique',
    nivel: 2,
    cliente: { nome: 'Clara', trato: 'A Clara', tipo: 'adulto', retrato: { pele: 'e', cabelo: 'black', cor: 'preto', extra: ['flor', 'brinco'], roupa: '#ffd166', fundo: '#e7f6ec', idade: 'adulto' } },
    ocasiao: 'Piquenique no parque',
    pedido: 'Piquenique ao meio-dia, no sol de Cuiabá. Quero um bolo rústico, com frutas, que não derreta na toalha. Oito pessoas.',
    pessoas: 8,
    orcamento: 120,
    quer: [jeito('jeito rústico', 'rustico'), enfeite('frutas', { tag: 'fruta' }), calor('não derreter no sol')],
    feliz: 'Sobreviveu ao sol e sumiu em dez minutos. Piquenique aprovado!',
    quase: 'Estava gostoso, mas no parque ele sofreu um pouco.',
  },
  {
    id: 'cha-bebe',
    nivel: 2,
    cliente: { nome: 'Vó Lourdes', trato: 'A Vó Lourdes', tipo: 'idoso', retrato: { pele: 'e', cabelo: 'coque', cor: 'grisalho', extra: ['oculos'], roupa: '#b8dcff', fundo: '#e3f0ff', idade: 'idoso' } },
    ocasiao: 'Chá de bebê do neto',
    pedido: 'Meu primeiro neto vem aí! Quero tudo clarinho, branco ou azul bem suave, com enfeites de bebê. Chocolate não: mancha a roupinha das visitas. Vinte pessoas.',
    pessoas: 20,
    orcamento: 260,
    quer: [cor('branco ou azul clarinho', ['branco', 'creme', 'azul']), enfeite('dois enfeites de bebê', { tag: 'bebe', min: 2 })],
    naoGosta: [nao('chocolate', CHOCOLATE)],
    feliz: 'Que coisa mais delicada! Vou guardar a foto para mostrar para ele quando crescer.',
    quase: 'Ficou uma graça, mas vó repara em tudo, viu?',
  },
  {
    id: 'juju',
    nivel: 2,
    cliente: { nome: 'Juju', trato: 'A Juju', tipo: 'crianca', retrato: { pele: 'd', cabelo: 'maria', cor: 'preto', extra: ['oculos'], roupa: '#6f9a55', fundo: '#e7f6ec', idade: 'crianca' } },
    ocasiao: 'Surpresa para o irmão',
    pedido: 'É surpresa para o meu irmão João. Ele ama dinossauro e ama limão. Tem que ser verde! Só tenho a minha mesada. Oito pessoas.',
    pessoas: 8,
    orcamento: 115,
    quer: [{ c: 's', k: 'tem', t: 'limão', em: ['massa', 'recheio'], word: 'lim' }, enfeite('dinossauros', { ids: ['dinos'] }), cor('cobertura verde', ['verde'])],
    feliz: 'O João fez o barulho do dinossauro! Isso quer dizer que ele amou.',
    quase: 'Ele gostou, mas eu sei que podia ser mais a cara dele.',
  },
  {
    id: 'manu',
    nivel: 2,
    cliente: { nome: 'Manu', trato: 'A Manu', tipo: 'crianca', retrato: { pele: 'b', cabelo: 'cacheado', cor: 'castanho', extra: ['tiara', 'bochecha'], roupa: '#1a4a8b', fundo: '#f1e9ff', idade: 'crianca' } },
    ocasiao: 'Festa do pijama',
    pedido: 'Festa do pijama! Bolo cor de noite, azul ou roxo, com lua, nuvem e estrela. Metade das amigas quer chocolate e metade quer baunilha: faz mesclado? Somos dez.',
    pessoas: 10,
    orcamento: 225,
    quer: [massa('massa mesclada', ['mesclada']), cor('cor de noite (azul ou roxo)', ['azul', 'roxo']), enfeite('dois enfeites de céu', { ids: ['luanuvens', 'estrelinhas', 'nuvens', 'topo'], min: 2 })],
    feliz: 'Parece o céu da minha janela! Ninguém vai dormir hoje.',
    quase: 'Tá bonito, mas o céu que eu pedi tinha mais coisa.',
  },

  /* ───────── Caprichadas: tema + orçamento apertado + cuidado de confeiteiro + surpresa ───────── */
  {
    id: 'casamento-quintal',
    nivel: 3,
    cliente: { nome: 'Luana e Diego', trato: 'A Luana e o Diego', pl: true, tipo: 'grupo', retrato: { pele: 'd', cabelo: 'longo', cor: 'preto', extra: ['flor', 'brinco'], roupa: '#ffffff', fundo: '#e7f6ec', idade: 'adulto', par: { pele: 'e', cabelo: 'black', cor: 'preto', extra: ['gravata'], roupa: '#2a1215' } } },
    ocasiao: 'Casamento no quintal',
    pedido: 'Vamos casar no quintal da vó, no fim da tarde, com sessenta convidados. Bolo branco, de andares, com flores. Ele fica na mesa a festa inteira: não pode derreter nem entortar.',
    pessoas: 60,
    orcamento: 700,
    quer: [cor('bolo branco', ['branco', 'creme']), andares('bolo de andares', 2), enfeite('dois tipos de flor', { tag: 'flor', min: 2 }), calor('aguentar o calor do quintal'), firme('não entortar')],
    surpresa: enfeite('pérolas', { ids: ['perolas'] }, { achou: 'Surpresa certeira: a Luana sonhava com pérolas no bolo!', falta: 'Segredo: a Luana sonhava com pérolas no bolo. Fica para as bodas.' }),
    feliz: 'Ficou de pé a festa inteira, mais firme que o noivo na hora do sim!',
    quase: 'Estava bonito, mas casamento a gente quer sem nenhum susto.',
  },
  {
    id: 'bodas',
    nivel: 3,
    cliente: { nome: 'Seu Antônio', trato: 'O Seu Antônio', tipo: 'idoso', retrato: { pele: 'c', cabelo: 'curto', cor: 'branco', extra: ['oculos', 'gravata'], roupa: '#dcae52', fundo: '#fff4d6', idade: 'idoso' } },
    ocasiao: 'Bodas de ouro',
    pedido: 'Cinquenta anos com a Dalva! Quero dois andares, dourado para todo lado e recheio de ameixa, como no nosso casamento. Pasta americana não: ela diz que parece massinha. Quarenta convidados.',
    pessoas: 40,
    orcamento: 470,
    quer: [recheio('recheio de ameixa', ['ameixa']), andares('dois andares', 2), { c: 'v', k: 'ou', t: 'dourado', de: [{ k: 'decor', tag: 'brilho' }, { k: 'calda', metal: true }, { k: 'tem', ids: ['dourada'], em: ['base'] }, { k: 'tem', ids: ['respingo', 'perolado'], em: ['estilo'] }] }],
    naoGosta: [{ c: 'v', k: 'tem', t: 'pasta americana', ids: ['pasta'], em: ['cobertura'] }],
    surpresa: enfeite('cerejas', { ids: ['cerejas'] }, { achou: 'Surpresa certeira: o primeiro bolo deles tinha cerejas em cima!', falta: 'Segredo: o primeiro bolo deles tinha cerejas em cima. Fica para as bodas de diamante.' }),
    feliz: 'A Dalva me deu um beijo na frente de todo mundo. Cinquenta anos e ainda fico vermelho.',
    quase: 'Está bonito, filho. Mas a Dalva repara, e eu levo a culpa.',
  },
  {
    id: 'unicornio',
    nivel: 3,
    cliente: { nome: 'Alice', trato: 'A Alice', tipo: 'crianca', retrato: { pele: 'a', cabelo: 'maria', cor: 'loiro', extra: ['tiara', 'bochecha'], roupa: '#d9c2ff', fundo: '#ffe7ec', idade: 'crianca' } },
    ocasiao: 'Aniversário de 6 anos',
    pedido: 'Quero um unicórnio de verdade: com chifre e crina! Por dentro tem que ter confete. A festa é no salão do prédio, que é um forno. Vinte e cinco crianças.',
    pessoas: 25,
    orcamento: 375,
    quer: [massa('massa de confete', ['funfetti']), enfeite('chifre e crina de unicórnio', { ids: ['chifre', 'crina'], min: 2 }), calor('aguentar o salão quente')],
    surpresa: enfeite('marshmallow', { ids: ['marshmallows'] }, { achou: 'Surpresa certeira: a Alice é louca por marshmallow!', falta: 'Segredo: a Alice é louca por marshmallow. Fica para os 7 anos.' }),
    feliz: 'É um unicórnio de verdade! Ele pode morar no meu quarto?',
    quase: 'É bonito… mas unicórnio de verdade tem mais coisa.',
  },
  {
    id: 'chef',
    nivel: 3,
    cliente: { nome: 'Chef Renata', trato: 'A chef Renata', tipo: 'adulto', retrato: { pele: 'c', cabelo: 'coque', cor: 'preto', extra: ['brinco'], roupa: '#1d1a1c', fundo: '#efeff1', idade: 'adulto' } },
    ocasiao: 'Jantar para críticos',
    pedido: 'Recebo oito críticos em casa. Nada óbvio: sem baunilha, sem brigadeiro, sem cor-de-rosa. Quero pistache ou caramelo salgado, calda escorrendo e um ar moderno. O orçamento é justo: eu sei quanto custa.',
    pessoas: 8,
    orcamento: 125,
    quer: [recheio('pistache ou caramelo salgado', ['pistache', 'caramelosalgado']), { c: 'v', k: 'calda', t: 'calda escorrendo' }, jeito('ar moderno', 'moderno')],
    naoGosta: [nao('baunilha', { ids: ['baunilha'], em: ['massa', 'molhar'] }), nao('brigadeiro', { word: 'brigadeiro' }), { c: 'v', k: 'cor', t: 'cor-de-rosa', fam: ['rosa'] }],
    surpresa: enfeite('folha de ouro', { ids: ['ouro'] }, { achou: 'Surpresa certeira: folha de ouro é a assinatura dela!', falta: 'Segredo: folha de ouro é a assinatura dela. Fica para o próximo jantar.' }),
    feliz: 'Admito: eu não mudaria nada. E eu sempre mudo alguma coisa.',
    quase: 'Correto. Mas “correto” não ganha estrela na minha cozinha.',
  },
  {
    id: 'estrada',
    nivel: 3,
    cliente: { nome: 'Dona Olga', trato: 'A Dona Olga', tipo: 'idoso', retrato: { pele: 'b', cabelo: 'chanel', cor: 'grisalho', extra: ['oculos', 'brinco'], roupa: '#b9772c', fundo: '#fbeed9', idade: 'idoso' } },
    ocasiao: 'Almoço no sítio',
    pedido: 'O bolo vai comigo para o sítio: três horas de estrada, sem geladeira e com buraco. Um andar só, rústico, com doce de leite. Fruta fresca não, que não aguenta a viagem. Quinze pessoas.',
    pessoas: 15,
    orcamento: 200,
    quer: [sabor('doce de leite', { word: 'doce de leite' }), jeito('jeito rústico', 'rustico'), andares('um andar só', 1, 1), viagem('aguentar a estrada sem geladeira')],
    naoGosta: [{ c: 'v', k: 'decor', t: 'fruta fresca', tag: 'fruta' }],
    feliz: 'Chegou inteirinho, e olha que a estrada não ajudou. Você entende do riscado!',
    quase: 'Chegou. Não do jeito que eu queria, mas chegou.',
  },
  {
    id: 'gemeos',
    nivel: 3,
    cliente: { nome: 'Dani', trato: 'A Dani', tipo: 'adulto', retrato: { pele: 'b', cabelo: 'rabo', cor: 'loiro', extra: ['oculos'], roupa: '#6fb6f2', fundo: '#e3f0ff', idade: 'adulto' } },
    ocasiao: 'Aniversário dos gêmeos',
    pedido: 'Os gêmeos fazem quatro anos e não concordam em nada: o Léo quer espaço, a Lara quer jardim. Um andar para cada um, massa mesclada para ninguém brigar. Trinta pessoas e o dobro de despesa, então capricha no preço.',
    pessoas: 30,
    orcamento: 435,
    quer: [massa('massa mesclada', ['mesclada']), andares('um andar para cada um', 2), enfeite('algo de espaço para o Léo', { ids: ['foguete', 'planetas'] }), enfeite('algo de jardim para a Lara', { ids: ['flores', 'margaridas', 'joaninhas', 'borboletas', 'cogumelos', 'girassois'] })],
    surpresa: velas('velas de estrela', { estilo: 'estrela' }, { achou: 'Surpresa certeira: os dois adoram soprar velinha de estrela!', falta: 'Segredo: os dois adoram soprar velinha de estrela. Fica para os 5 anos.' }),
    feliz: 'Pela primeira vez em quatro anos, os dois concordaram: “é o melhor bolo do mundo”.',
    quase: 'Um gostou, a outra fez bico. Faltou um pedacinho do pedido.',
  },
  {
    id: 'clinica',
    nivel: 3,
    cliente: { nome: 'Doutora Paula', trato: 'A doutora Paula', tipo: 'adulto', retrato: { pele: 'e', cabelo: 'chanel', cor: 'preto', extra: ['oculos', 'brinco'], roupa: '#ffffff', fundo: '#e3f0ff', idade: 'adulto' } },
    ocasiao: 'Inauguração do consultório',
    pedido: 'Inauguro o meu consultório de dentista em três dias. Azul, que é a cor da casa, com “Bem-vindos” no bolo e sem enfeite de criança. Quarenta e cinco convidados e nenhum dia a mais de prazo.',
    pessoas: 45,
    orcamento: 470,
    dias: 3,
    quer: [cor('cobertura azul', ['azul']), recado('“Bem-vindos” no bolo', 'bem-vind')],
    naoGosta: [{ c: 'v', k: 'decor', t: 'enfeite de criança', tag: 'infantil' }],
    surpresa: enfeite('pérolas', { ids: ['perolas'] }, { achou: 'Surpresa certeira: pérolas lembram sorrisos. A doutora adorou!', falta: 'Segredo: a doutora queria pérolas, que lembram sorrisos. Fica para o aniversário do consultório.' }),
    feliz: 'Pontual e impecável. Dentista também gosta de doce, só não espalha.',
    quase: 'Serviu, mas inauguração a gente só faz uma.',
  },
  {
    id: 'reveillon',
    nivel: 3,
    cliente: { nome: 'Marcos', trato: 'O Marcos', tipo: 'adulto', retrato: { pele: 'c', cabelo: 'topete', cor: 'castanho', extra: ['barba'], roupa: '#ffffff', fundo: '#fff4d6', idade: 'adulto' } },
    ocasiao: 'Réveillon na varanda',
    pedido: 'Virada do ano na varanda, calor de dezembro. Bolo branco, com dois brilhos diferentes e aquela vela que solta faísca à meia-noite. Vinte e cinco pessoas.',
    pessoas: 25,
    orcamento: 325,
    quando: [12, 1],
    quer: [cor('bolo branco', ['branco', 'creme']), enfeite('dois enfeites que brilham', { tag: 'brilho', min: 2 }), velas('vela que solta faísca', { estilo: 'faisca' }), calor('aguentar o calor da varanda')],
    surpresa: enfeite('uvas', { ids: ['uvas'] }, { achou: 'Surpresa certeira: uvas da sorte para a meia-noite!', falta: 'Segredo: o Marcos queria uvas da sorte para a meia-noite. Fica para a próxima virada.' }),
    feliz: 'Meia-noite, faísca e bolo inteiro. O ano já começou certo!',
    quase: 'Deu para brindar, mas a virada pedia mais brilho.',
  },
  {
    id: 'sogra',
    nivel: 3,
    cliente: { nome: 'Rodrigo', trato: 'O Rodrigo', tipo: 'adulto', retrato: { pele: 'a', cabelo: 'curto', cor: 'ruivo', extra: ['barba', 'oculos'], roupa: '#5f8f6a', fundo: '#efeff1', idade: 'adulto' } },
    ocasiao: 'Aniversário da sogra',
    pedido: 'Minha sogra repara em tudo. Ela quer red velvet, cerejas e um ar de confeitaria antiga. Coco ela não suporta. A festa é em três dias, somos doze, e eu preciso muito acertar.',
    pessoas: 12,
    orcamento: 225,
    dias: 3,
    quer: [massa('massa red velvet', ['redvelvet']), enfeite('cerejas', { ids: ['cerejas'] }), { c: 'v', k: 'tem', t: 'ar de confeitaria antiga', tag: 'vintage', em: ['estilo', 'bico'] }],
    naoGosta: [nao('coco', COCO)],
    feliz: 'Ela disse “até que ficou bom”. Vindo dela, isso é uma medalha!',
    quase: 'Ela comeu dois pedaços e ainda achou um defeito. Quase lá.',
  },
  {
    id: 'quermesse',
    nivel: 3,
    cliente: { nome: 'Dona Graça', trato: 'A Dona Graça', tipo: 'idoso', retrato: { pele: 'd', cabelo: 'cacheado', cor: 'grisalho', extra: ['brinco', 'bochecha'], roupa: '#d96b82', fundo: '#fff4d6', idade: 'idoso' } },
    ocasiao: 'Quermesse da paróquia',
    pedido: 'É para vender em fatias na quermesse: bolo retangular, de coco, para quarenta fatias. Fica na barraca, no sol, a tarde inteira. Castanha não, que a criançada cata e joga fora. E o caixa da paróquia é curto.',
    pessoas: 40,
    orcamento: 365,
    quer: [formato('bolo retangular', ['rect']), sabor('coco', { tag: 'coco' }), calor('aguentar a tarde na barraca')],
    naoGosta: [nao('castanha', { tag: 'castanhas' })],
    surpresa: enfeite('cerejas', { ids: ['cerejas'] }, { achou: 'Surpresa certeira: com cereja em cima, cada fatia vende sozinha!', falta: 'Segredo: com uma cereja em cima, cada fatia vende sozinha. Fica para a próxima quermesse.' }),
    feliz: 'Vendeu tudo antes do bingo! A paróquia agradece, e o padre repetiu.',
    quase: 'Vendeu, mas sobrou fatia. Na próxima a gente acerta.',
  },
];

export const getOrder = (id) => ORDERS.find((o) => o.id === id) || null;

/* ───────── Encomenda do dia: semeada pela data, igual para todo mundo ───────── */

/** A data local em texto: 2026-11-17. */
export function dayKey(date = new Date()) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const isDayKey = (v) => typeof v === 'string' && DAY_RE.test(v);

/**
 * A fila de um mês: as encomendas de sempre mais as da época (Natal só em dezembro, arraial em junho e julho…),
 * embaralhadas por uma conta feita com o ano e o mês. Cada dia do mês pega a próxima da fila: dois dias seguidos
 * nunca repetem, e quem joga todo dia passa por quase todas.
 */
function monthQueue(year, month) {
  const tag = `bolab-encomenda-do-dia:${year}-${month}`;
  return ORDERS.filter((o) => !o.quando || o.quando.includes(month))
    .map((o) => ({ o, h: hash32(`${tag}:${o.id}`) }))
    .sort((x, y) => x.h - y.h || (x.o.id < y.o.id ? -1 : 1))
    .map((x) => x.o);
}

/** A encomenda de um dia (a de hoje, sem data). Igual para todo mundo; nunca repete a da véspera nem sai fora de época. */
export function dailyOrder(date = new Date()) {
  const key = isDayKey(date) ? date : dayKey(date);
  const [, y, m, d] = DAY_RE.exec(key).map(Number);
  const queue = monthQueue(y, m);
  // virada de mês: a fila começa numa posição que não repete o último dia do mês anterior
  // (seja qual for o começo que aquele mês usou: são no máximo quatro candidatos)
  const prev = new Date(y, m - 1, 0); // último dia do mês anterior
  const before = monthQueue(prev.getFullYear(), prev.getMonth() + 1);
  const lastOnes = new Set([0, 1, 2, 3].map((k) => before[(prev.getDate() - 1 + k) % before.length].id));
  let start = 0;
  while (start < 4 && lastOnes.has(queue[start % queue.length].id)) start++;
  return queue[(d - 1 + start) % queue.length];
}

/* ───────── Desafio relâmpago: três desejos sorteados, relógio de 75 segundos (o relógio nunca tira estrela) ───────── */
export const FLASH_SECONDS = 75;
const FLASH_SABOR = [
  sabor('chocolate', CHOCOLATE),
  { c: 's', k: 'tem', t: 'morango', em: ['massa', 'recheio', 'adicional'], word: 'morang' },
  sabor('coco', { tag: 'coco' }),
  sabor('limão', { tag: 'citrico' }),
  sabor('doce de leite', { word: 'doce de leite' }),
  { c: 's', k: 'tem', t: 'café', em: ['massa', 'recheio', 'molhar'], tag: 'cafe' },
  sabor('castanhas', { tag: 'castanhas' }),
];
const FLASH_COR = [cor('cobertura rosa', ['rosa']), cor('cobertura azul', ['azul']), cor('cobertura verde', ['verde']), cor('cobertura amarela', ['amarelo']), cor('cobertura branca', ['branco', 'creme']), cor('cobertura roxa', ['roxo'])];
const FLASH_ENFEITE = [
  enfeite('fruta em cima', { tag: 'fruta' }),
  enfeite('uma flor', { tag: 'flor' }),
  enfeite('algo que brilha', { tag: 'brilho' }),
  enfeite('um docinho em cima', { tag: 'doce' }),
  velas('velinhas'),
  { c: 'v', k: 'calda', t: 'calda escorrendo' },
  { c: 'v', k: 'tem', t: 'um acabamento de bico', em: ['bico'] },
];

/** A encomenda relâmpago número `seed` (a mesma semente dá sempre os mesmos três desejos). */
export function flashOrder(seed = 0) {
  const h = hash32(`bolab-relampago:${Math.round(Number(seed) || 0)}`);
  const a = FLASH_SABOR[h % FLASH_SABOR.length];
  const b = FLASH_COR[(h >>> 5) % FLASH_COR.length];
  const c = FLASH_ENFEITE[(h >>> 11) % FLASH_ENFEITE.length];
  return {
    id: 'relampago',
    seed: Math.round(Number(seed) || 0),
    nivel: 1,
    flash: true,
    cliente: { nome: 'Desafio relâmpago', trato: 'O desafio', tipo: 'adulto', retrato: { emblema: 'raio', fundo: '#fff4d6' } },
    ocasiao: 'Desafio relâmpago',
    pedido: `Valendo! Um bolo com ${a.t}, ${b.t} e ${c.t}. O relógio é só para dar frio na barriga.`,
    pessoas: 8,
    orcamento: 0,
    quer: [a, b, c],
    feliz: 'Três de três, e no capricho! Mão de confeiteiro.',
    quase: 'Quase tudo! Faltou um dos três.',
  };
}

/** O bolo em branco de onde uma encomenda começa: simples, barato e sem enfeite (o resto é com quem joga). */
export function blankCake() {
  return {
    shape: 'round',
    size: 'p',
    tiers: 1,
    layers: ['baunilha', 'baunilha'],
    fillings: ['ninho'],
    fillAdds: [''],
    soak: '',
    covering: { type: 'chantininho', color: '#ffffff', style: 'liso' },
    drip: { on: false },
    piping: { style: 'liso' },
    decor: { items: [], opts: {}, message: '', placed: [], theme: '' },
    name: '',
  };
}
