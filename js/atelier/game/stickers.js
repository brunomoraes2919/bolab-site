// BOLAB — Ateliê, jogo: as figurinhas do álbum de descobertas.
// Uma figurinha é ganha quando acontece alguma coisa no ateliê: o barramento (js/atelier/bus.js) avisa e o
// `earnedBy` abaixo confere. NÃO há pontos, níveis nem ranking: o álbum só conta "12 de 67".
//
//   { id, name, page, how (como ganhar, mostrado enquanto falta), won (legenda depois de ganha), secret,
//     art: [recorte, cor, desenho, destaque]  (ver art.js),
//     on: [eventos do barramento], test(x) }
//   x = { type, d (detalhe do evento), c (bolo normalizado, quando o evento traz), s (contadores guardados),
//         has(kind, fn), count(grupoOuTag), now (Date), game (resumo do caderno de encomendas) }
//
// PURO: sem tela e sem armazenamento (quem guarda é state.js). Roda no Node — tools/tests/jogo.test.mjs.
import { getDecor, getFlavor, getFilling, MAX_DECORS } from '../../data/customizer.js';
import { normalizeConfig } from '../../customizer/pricing.js';
import { scoreOf } from '../bo/brain.js';
import { pickedOf } from './score.js';

export const PAGES = [
  { id: 'inicio', name: 'Primeiros passos' },
  { id: 'formas', name: 'Formas e tamanhos' },
  { id: 'sabores', name: 'Sabores' },
  { id: 'maos', name: 'Mão na massa' },
  { id: 'enfeites', name: 'Enfeites' },
  { id: 'datas', name: 'Datas e temas' },
  { id: 'encomendas', name: 'Encomendas' },
];

/** A mudança foi feita pela pessoa (ou aceita de uma sugestão da Bô)? Desfazer, temas e "me surpreenda" não contam. */
const mine = (d) => !d?.by || d.by === 'user' || d.by === 'bo';
const key = (k, fn = () => true) => (x) => x.d.key === k && mine(x.d) && fn(x.d.value, x);
const SEASON = { junino: [6, 7], natal: [12], pascoa: [3, 4], halloween: [10] };
const CHOC_COVER = ['ganache', 'ganachebranca', 'chocolate', 'brigadeiro'];

export const STICKERS = [
  /* ───────── Primeiros passos ───────── */
  { id: 'primeira-massa', name: 'Primeira massa', page: 'inicio', how: 'Troque o sabor de uma camada de massa.', won: 'Você escolheu a sua primeira massa.', art: ['circ', 'ouro', 'massa', '#ffd166'], on: ['change'], test: key('layer.flavor') },
  { id: 'primeiro-recheio', name: 'Primeiro recheio', page: 'inicio', how: 'Troque um recheio.', won: 'Você escolheu o seu primeiro recheio.', art: ['flor', 'rosa', 'colher', '#f5a9b9'], on: ['change'], test: key('filling') },
  { id: 'primeira-calda', name: 'Primeira calda', page: 'inicio', how: 'Deixe uma calda escorrer pelo bolo.', won: 'A sua primeira calda escorreu.', art: ['circ', 'chocolate', 'calda', '#d12d58'], on: ['change'], test: key('drip.on', (v) => v === true) },
  { id: 'primeiro-bico', name: 'Bico de confeiteiro', page: 'inicio', how: 'Confeite a borda com um bico.', won: 'Você confeitou com bico pela primeira vez.', art: ['selo', 'lilas', 'bico', '#ffd166'], on: ['change'], test: key('piping.style', (v) => Boolean(v) && v !== 'liso') },
  { id: 'velinhas', name: 'Parabéns pra você', page: 'inicio', how: 'Ponha velas no bolo.', won: 'Bolo com vela já é festa.', art: ['estrela', 'azul', 'vela', '#d12d58'], on: ['change'], test: (x) => mine(x.d) && ((x.d.key === 'decor.add' && x.d.value?.id === 'velas') || (/^candles\./.test(x.d.key || '') && Boolean(x.c?.decor.items.includes('velas')))) },
  { id: 'paleta', name: 'Paleta', page: 'inicio', how: 'Mude a cor da cobertura.', won: 'Você pintou a cobertura de outra cor.', art: ['circ', 'verde', 'paleta', '#ffd166'], on: ['change'], test: key('cover.color') },
  { id: 'raio-x', name: 'Raio-X', page: 'inicio', how: 'Veja o bolo por dentro.', won: 'Você espiou as camadas por dentro.', art: ['selo', 'marinho', 'raiox', '#f5a9b9'], on: ['tool'], test: (x) => x.d.id === 'cutaway' && x.d.value !== false },
  { id: 'recado', name: 'Recado doce', page: 'inicio', how: 'Escreva uma mensagem no bolo.', won: 'Você escreveu um recado no bolo.', art: ['coracao', 'rosa', 'recado', '#d12d58'], on: ['change'], test: key('message.text', (v) => Boolean(String(v || '').trim())) },
  { id: 'tema-pronto', name: 'Tema pronto', page: 'inicio', how: 'Aplique um tema pronto.', won: 'Você partiu de um tema pronto.', art: ['estrela', 'lilas', 'varinha', '#f5a9b9'], on: ['change'], test: (x) => x.d.key === 'decor.theme' && Boolean(x.d.value) },
  { id: 'me-surpreenda', name: 'Me surpreenda', page: 'inicio', how: 'Peça um bolo surpresa.', won: 'Você deixou a sorte montar um bolo.', art: ['selo', 'laranja', 'dado', '#e8632f'], on: ['change'], test: (x) => x.d.key === 'surprise' || x.d.by === 'surprise' },
  { id: 'dupla-com-a-bo', name: 'Dupla com a Bô', page: 'inicio', how: 'Aceite uma sugestão da Bô.', won: 'Você aceitou um palpite da Bô.', art: ['circ', 'claro', 'dupla', '#d12d58'], on: ['bo.action'], test: () => true },

  /* ───────── Formas e tamanhos ───────── */
  { id: 'tres-andares', name: 'Três andares', page: 'formas', how: 'Monte um bolo de três andares.', won: 'Três andares, um em cima do outro.', art: ['escudo', 'rosa', 'andares', '#ffd166'], on: ['change'], test: key('tiers', (v) => Number(v) === 3) },
  { id: 'bento', name: 'Bentô', page: 'formas', how: 'Monte um bentô.', won: 'O menor bolo do ateliê.', art: ['selo', 'ouro', 'caixa', '#d12d58'], on: ['change'], test: key('size', (v) => v === 'bento') },
  { id: 'gigante', name: 'Bolo de gigante', page: 'formas', how: 'Monte um bolo do maior tamanho.', won: 'O maior bolo do ateliê.', art: ['circ', 'marinho', 'gg', '#1a4a8b'], on: ['change'], test: key('size', (v) => v === 'gg') },
  { id: 'arranha-ceu', name: 'Arranha-céu', page: 'formas', how: 'Empilhe quatro camadas de massa.', won: 'Quatro camadas de massa num andar só.', art: ['selo', 'menta', 'camadas', '#ffd166'], on: ['change'], test: (x) => mine(x.d) && x.d.key === 'layer.add' && x.c?.layers.length === 4 },
  { id: 'erupcao', name: 'Erupção', page: 'formas', how: 'Monte um bolo vulcão.', won: 'A cobertura transbordou do furo.', art: ['circ', 'cacau', 'vulcao', '#e8632f'], on: ['change'], test: key('shape', (v) => v === 'vulcao') },
  { id: 'de-coracao', name: 'De coração', page: 'formas', how: 'Monte um bolo em forma de coração.', won: 'Um bolo em forma de coração.', art: ['coracao', 'rosa', 'coracao', '#f5a9b9'], on: ['change'], test: key('shape', (v) => v === 'heart') },
  { id: 'geometra', name: 'Geômetra', page: 'formas', how: 'Experimente quatro formatos diferentes.', won: 'Você experimentou quatro formatos.', art: ['selo', 'azul', 'formas', '#ffd166'], on: ['change'], test: (x) => x.s.formas.length >= 4 },

  /* ───────── Sabores ───────── */
  { id: 'chocolatra', name: 'Chocólatra', page: 'sabores', how: 'Chocolate na massa, no recheio e na cobertura, tudo no mesmo bolo.', won: 'Chocolate da massa à cobertura.', art: ['flor', 'chocolate', 'chocolate', '#d12d58'], on: ['change'], test: (x) => mine(x.d) && x.has('massa', (p) => p.tags.includes('chocolate')) && x.has('recheio', (p) => p.tags.includes('chocolate')) && x.has('cobertura', (p) => CHOC_COVER.includes(p.id)) },
  { id: 'tropical', name: 'Tropical', page: 'sabores', how: 'Junte coco com uma fruta no mesmo bolo.', won: 'Coco com fruta: gosto de praia.', art: ['circ', 'menta', 'coco', '#ffd166'], on: ['change'], test: (x) => mine(x.d) && x.has(['massa', 'recheio'], (p) => p.tags.includes('coco')) && x.has(['massa', 'recheio'], (p) => p.tags.includes('frutado') || p.tags.includes('citrico')) },
  { id: 'combinacao-de-mestre', name: 'Combinação de mestre', page: 'sabores', how: 'Junte uma massa que não seja baunilha e dois recheios diferentes que a Bô considere perfeitos.', won: 'Massa e recheios em harmonia perfeita.', art: ['estrela', 'ouro', 'medalha', '#d12d58'], on: ['change'], test: (x) => mine(x.d) && ['layer.flavor', 'filling', 'layer.add'].includes(x.d.key) && Boolean(x.c) && new Set(x.c.fillings).size >= 2 && !x.c.layers.includes('baunilha') && x.bo().sabor === 5 },
  { id: 'padeiro-curioso', name: 'Padeiro curioso', page: 'sabores', how: 'Experimente seis massas diferentes.', won: 'Você já provou seis massas.', art: ['circ', 'laranja', 'batedor', '#ffd166'], on: ['change'], test: (x) => x.s.massas.length >= 6 },
  { id: 'colher-de-pau', name: 'Colher de pau', page: 'sabores', how: 'Experimente dez recheios diferentes.', won: 'Você já provou dez recheios.', art: ['flor', 'cacau', 'colher', '#ffd166'], on: ['change'], test: (x) => x.s.recheios.length >= 10 },
  { id: 'sem-casaco', name: 'Sem casaco', page: 'sabores', how: 'Deixe a massa à mostra, sem cobertura na lateral.', won: 'Um bolo naked, de massa à mostra.', art: ['selo', 'claro', 'naked', '#d12d58'], on: ['change'], test: key('cover.type', (v) => v === 'naked') },
  { id: 'hora-do-cafe', name: 'Hora do café', page: 'sabores', how: 'Ponha café na massa ou no recheio.', won: 'Um bolo com gosto de café coado.', art: ['circ', 'chocolate', 'xicara', '#f2e4c7'], on: ['change'], test: (x) => mine(x.d) && ['layer.flavor', 'filling', 'layer.add'].includes(x.d.key) && x.has(['massa', 'recheio'], (p) => p.tags.includes('cafe')) },

  /* ───────── Mão na massa (gestos) ───────── */
  { id: 'mao-firme', name: 'Mão firme', page: 'maos', how: 'Coloque dez peças no bolo com o dedo.', won: 'Dez peças colocadas uma a uma, com o dedo.', art: ['escudo', 'lilas', 'pinca', '#d12d58'], on: ['gesture'], test: (x) => x.s.placed >= 10 },
  { id: 'prato-giratorio', name: 'Prato giratório', page: 'maos', how: 'Espalhe a cobertura girando o prato.', won: 'Você espalhou a cobertura girando o prato.', art: ['circ', 'azul', 'giro', '#ffd166'], on: ['gesture'], test: (x) => x.d.id === 'spread' && x.d.phase === 'end' },
  { id: 'gota-a-gota', name: 'Gota a gota', page: 'maos', how: 'Pingue a calda com o dedo.', won: 'Você pingou a calda gota a gota.', art: ['circ', 'cacau', 'gota', '#e8809a'], on: ['gesture'], test: (x) => x.d.id === 'drip' && x.d.phase === 'end' },
  { id: 'acendedor', name: 'Acendedor', page: 'maos', how: 'Acenda as velas.', won: 'Você acendeu as velas.', art: ['selo', 'marinho', 'fosforo', '#d12d58'], on: ['gesture', 'reveal'], test: (x) => (x.type === 'gesture' ? x.d.id === 'light' && x.d.phase !== 'move' : x.d.phase === 'candles') },
  { id: 'folego', name: 'Fôlego', page: 'maos', how: 'Sopre as velas.', won: 'Você soprou as velas de uma vez.', art: ['circ', 'menta', 'sopro', '#ffd166'], on: ['gesture', 'reveal'], test: (x) => (x.type === 'gesture' ? x.d.id === 'blow' && x.d.phase === 'end' : x.d.phase === 'blown') },
  { id: 'pirueta', name: 'Pirueta', page: 'maos', how: 'Dê um giro completo no bolo.', won: 'O bolo deu uma volta inteira.', art: ['flor', 'laranja', 'giro', '#ffffff'], on: ['gesture'], test: (x) => x.d.id === 'spin' && x.d.phase === 'end' },
  { id: 'tcharam', name: 'Tcharam!', page: 'maos', how: 'Assista à revelação do bolo pronto.', won: 'Você revelou um bolo pronto.', art: ['estrela', 'rosa', 'brilho', '#ffd166'], on: ['reveal'], test: (x) => x.d.phase === 'end' },
  { id: 'clique', name: 'Clique', page: 'maos', how: 'Tire uma foto do bolo.', won: 'Você fotografou um bolo.', art: ['selo', 'verde', 'camera', '#15803d'], on: ['photo', 'tool'], test: (x) => (x.type === 'photo' ? x.d.kind === 'foto' : x.d.id === 'photo') },
  { id: 'luz-camera-bolo', name: 'Luz, câmera, bolo', page: 'maos', how: 'Grave o vídeo da montagem.', won: 'Você gravou o vídeo da montagem.', art: ['selo', 'cacau', 'claquete', '#d12d58'], on: ['photo'], test: (x) => x.d.kind === 'video' },
  { id: 'cartao-postal', name: 'Cartão postal', page: 'maos', how: 'Crie um cartão para mandar a alguém.', won: 'Você fez um cartão com o seu bolo.', art: ['circ', 'claro', 'cartao', '#d12d58'], on: ['photo'], test: (x) => x.d.kind === 'cartao' },

  /* ───────── Enfeites ───────── */
  { id: 'jardim-inteiro', name: 'Jardim inteiro', page: 'enfeites', how: 'Ponha três flores diferentes no mesmo bolo.', won: 'Três flores diferentes no mesmo bolo.', art: ['flor', 'verde', 'flores', '#f5a9b9'], on: ['change'], test: (x) => mine(x.d) && x.count('flores') >= 3 },
  { id: 'salada-de-frutas', name: 'Salada de frutas', page: 'enfeites', how: 'Ponha três frutas diferentes no mesmo bolo.', won: 'Três frutas diferentes no mesmo bolo.', art: ['circ', 'ouro', 'frutas', '#e2334f'], on: ['change'], test: (x) => mine(x.d) && x.count('frutas') >= 3 },
  { id: 'toque-de-ouro', name: 'Toque de ouro', page: 'enfeites', how: 'Use folha de ouro ou calda dourada.', won: 'Um toque de ouro no bolo.', art: ['estrela', 'cacau', 'brilho', '#ffd166'], on: ['change'], test: (x) => mine(x.d) && Boolean(x.c) && (x.c.decor.items.includes('ouro') || (x.c.drip.on && x.c.drip.metal)) && ['decor.add', 'drip.metal', 'drip.on'].includes(x.d.key) },
  { id: 'por-do-sol', name: 'Pôr do sol', page: 'enfeites', how: 'Faça uma cobertura em degradê.', won: 'Uma cobertura em degradê.', art: ['circ', 'laranja', 'sol', '#d12d58'], on: ['change'], test: key('cover.style', (v) => v === 'ombre') },
  { id: 'buque-de-creme', name: 'Buquê de creme', page: 'enfeites', how: 'Cubra o bolo inteiro de rosetas.', won: 'Um bolo inteiro coberto de rosetas.', art: ['flor', 'claro', 'roseta', '#d12d58'], on: ['change'], test: key('cover.style', (v) => v === 'rosetas') },
  { id: 'coisa-de-vo', name: 'Coisa de vó', page: 'enfeites', how: 'Use o acabamento vintage, de guirlandas e lacinhos.', won: 'Guirlandas e lacinhos, como antigamente.', art: ['circ', 'lilas', 'laco', '#ffd166'], on: ['change'], test: key('piping.style', (v) => v === 'vintage') },
  { id: 'cabe-mais-um', name: 'Cabe mais um?', page: 'enfeites', secret: true, how: 'Segredo.', won: 'Você lotou o bolo com todos os enfeites que cabem.', art: ['selo', 'laranja', 'pilha', '#d12d58'], on: ['change'], test: (x) => mine(x.d) && (x.c?.decor.items.length || 0) >= MAX_DECORS },
  { id: 'menos-e-mais', name: 'Menos é mais', page: 'enfeites', secret: true, how: 'Segredo.', won: 'Você revelou um bolo liso, sem nenhum enfeite.', art: ['circ', 'cacau', 'minimo', '#f5a9b9'], on: ['reveal', 'step'], test: (x) => (x.type === 'reveal' ? x.d.phase === 'end' : x.d.id === 'resumo') && Boolean(x.c) && !x.c.decor.items.length && !(x.c.decor.placed || []).length && x.c.piping.style === 'liso' && x.c.covering.style === 'liso' && !x.c.drip.on && !x.c.decor.message && !x.c.decor.topper.text },

  /* ───────── Datas e temas ───────── */
  { id: 'arraia', name: 'Arraiá', page: 'datas', how: 'Ponha dois enfeites de festa junina.', won: 'Um bolo pronto para o arraial.', art: ['circ', 'ouro', 'bandeirinhas', '#d12d58'], on: ['change'], test: (x) => mine(x.d) && x.count('junino') >= 2 },
  { id: 'noite-feliz', name: 'Noite feliz', page: 'datas', how: 'Ponha dois enfeites de Natal.', won: 'Um bolo com cara de Natal.', art: ['estrela', 'marinho', 'pinheiro', '#d12d58'], on: ['change'], test: (x) => mine(x.d) && x.count('natal') >= 2 },
  { id: 'coelhinho', name: 'Coelhinho', page: 'datas', how: 'Ponha dois enfeites de Páscoa.', won: 'Um bolo de Páscoa.', art: ['flor', 'lilas', 'coelho', '#f5a9b9'], on: ['change'], test: (x) => mine(x.d) && x.count('pascoa') >= 2 },
  { id: 'gostosuras', name: 'Gostosuras', page: 'datas', how: 'Ponha dois enfeites de Halloween.', won: 'Um bolo de dar medo.', art: ['circ', 'cacau', 'abobora', '#ff8c2f'], on: ['change'], test: (x) => mine(x.d) && x.count('halloween') >= 2 },
  { id: 'sim', name: 'Sim!', page: 'datas', how: 'Ponha as alianças no bolo.', won: 'Um bolo com alianças.', art: ['coracao', 'claro', 'aliancas', '#d12d58'], on: ['change'], test: (x) => mine(x.d) && x.d.key === 'decor.add' && x.d.value?.id === 'aliancas' },
  { id: 'segredo-guardado', name: 'Segredo guardado', page: 'datas', how: 'Monte um bolo de chá revelação.', won: 'O recheio guarda um segredo.', art: ['selo', 'menta', 'presente', '#d12d58'], on: ['change'], test: key('reveal.on', (v) => v === true) },
  { id: 'cabeca-nas-nuvens', name: 'Cabeça nas nuvens', page: 'datas', how: 'Monte um unicórnio: chifre e crina no mesmo bolo.', won: 'Um unicórnio de chifre e crina.', art: ['flor', 'claro', 'unicornio', '#f5a9b9'], on: ['change'], test: (x) => mine(x.d) && Boolean(x.c) && ['chifre', 'crina'].every((id) => x.c.decor.items.includes(id)) },
  { id: 'astronauta', name: 'Astronauta', page: 'datas', how: 'Ponha planetas ou um foguete no bolo.', won: 'Um bolo que foi para o espaço.', art: ['circ', 'marinho', 'planeta', '#ffd166'], on: ['change'], test: (x) => mine(x.d) && x.d.key === 'decor.add' && ['planetas', 'foguete'].includes(x.d.value?.id) },
  { id: 'na-data-certa', name: 'Na data certa', page: 'datas', secret: true, how: 'Segredo.', won: 'Você montou o bolo da festa no mês da festa.', art: ['selo', 'rosa', 'calendario', '#d12d58'], on: ['change'], test: (x) => mine(x.d) && Object.entries(SEASON).some(([tag, months]) => months.includes(x.now.getMonth() + 1) && x.count(tag) >= 2) },
  { id: 'coruja', name: 'Coruja', page: 'datas', secret: true, how: 'Segredo.', won: 'Você confeitou de madrugada.', art: ['circ', 'marinho', 'lua', '#b497f0'], on: ['change'], test: (x) => mine(x.d) && x.d.by !== 'bo' && x.now.getHours() < 5 },

  /* ───────── Encomendas ───────── */
  { id: 'primeira-encomenda', name: 'Primeira encomenda', page: 'encomendas', how: 'Entregue uma encomenda.', won: 'A sua primeira entrega.', art: ['selo', 'rosa', 'caixa', '#d12d58'], on: ['game.end'], test: (x) => x.d.stars >= 1 },
  { id: 'cliente-feliz', name: 'Cliente feliz', page: 'encomendas', how: 'Ganhe três estrelas numa encomenda.', won: 'Um cliente saiu com três estrelas no sorriso.', art: ['estrela', 'ouro', 'estrelas', '#ffffff'], on: ['game.score'], test: (x) => x.d.stars === 3 },
  { id: 'de-primeira', name: 'De primeira', page: 'encomendas', how: 'Ganhe três estrelas na primeira tentativa de uma encomenda.', won: 'Três estrelas logo na primeira tentativa.', art: ['circ', 'verde', 'alvo', '#d12d58'], on: ['game.score'], test: (x) => x.d.stars === 3 && x.d.tries === 1 && x.d.mode !== 'flash' },
  { id: 'troco-no-bolso', name: 'Troco no bolso', page: 'encomendas', how: 'Ganhe três estrelas gastando bem menos que o orçamento.', won: 'Três estrelas e ainda sobrou troco.', art: ['circ', 'menta', 'moeda', '#b97a00'], on: ['game.score'], test: (x) => x.d.stars === 3 && x.d.budget > 0 && x.d.price <= x.d.budget * 0.85 },
  { id: 'prato-do-dia', name: 'Prato do dia', page: 'encomendas', how: 'Entregue a encomenda do dia.', won: 'Você entregou uma encomenda do dia.', art: ['circ', 'laranja', 'cloche', '#d12d58'], on: ['game.end'], test: (x) => x.d.mode === 'daily' && x.d.stars >= 1 },
  { id: 'fregues-da-casa', name: 'Freguês da casa', page: 'encomendas', how: 'Entregue a encomenda do dia em cinco dias diferentes (não precisam ser seguidos).', won: 'Cinco encomendas do dia entregues.', art: ['coracao', 'rosa', 'calendario', '#d12d58'], on: ['game.end'], test: (x) => x.game.dailyCount >= 5 },
  { id: 'relampago', name: 'Relâmpago', page: 'encomendas', how: 'Termine um desafio relâmpago.', won: 'Você terminou um desafio relâmpago.', art: ['selo', 'marinho', 'raio', '#ffd166'], on: ['game.end'], test: (x) => x.d.mode === 'flash' && x.d.stars >= 1 },
  { id: 'mais-rapido-que-o-forno', name: 'Mais rápido que o forno', page: 'encomendas', how: 'Ganhe três estrelas no desafio relâmpago antes de o relógio zerar.', won: 'Três estrelas antes de o relógio zerar.', art: ['estrela', 'laranja', 'forno', '#e8632f'], on: ['game.score'], test: (x) => x.d.mode === 'flash' && x.d.stars === 3 && x.d.inTime === true },
  { id: 'aquecimento', name: 'Aquecimento', page: 'encomendas', how: 'Entregue todas as encomendas fáceis.', won: 'Todas as encomendas fáceis entregues.', art: ['circ', 'ouro', 'chama', '#d12d58'], on: ['game.end'], test: (x) => x.game.easyLeft === 0 },
  { id: 'osso-duro', name: 'Osso duro', page: 'encomendas', how: 'Ganhe três estrelas numa encomenda caprichada.', won: 'Três estrelas numa encomenda das difíceis.', art: ['escudo', 'cacau', 'osso', '#ffd166'], on: ['game.score'], test: (x) => x.d.stars === 3 && x.d.level === 3 },
  { id: 'segunda-fornada', name: 'Segunda fornada', page: 'encomendas', how: 'Melhore a nota de uma encomenda tentando de novo.', won: 'Você tentou de novo e melhorou a nota.', art: ['circ', 'azul', 'forno', '#2f7fd1'], on: ['game.score'], test: (x) => x.d.improved === true },
  { id: 'caderno-cheio', name: 'Caderno cheio', page: 'encomendas', how: 'Entregue todas as encomendas do caderno.', won: 'Todas as encomendas do caderno entregues.', art: ['selo', 'verde', 'caderno', '#15803d'], on: ['game.end'], test: (x) => x.game.left === 0 },
  { id: 'mestre-confeiteiro', name: 'Mestre confeiteiro', page: 'encomendas', how: 'Ganhe três estrelas em todas as encomendas do caderno.', won: 'Três estrelas em todas as encomendas.', art: ['estrela', 'rosa', 'chapeu', '#ffd166'], on: ['game.end'], test: (x) => x.game.notPerfect === 0 },
  { id: 'leu-pensamento', name: 'Leu pensamento', page: 'encomendas', secret: true, how: 'Segredo.', won: 'Você acertou a surpresa que o cliente não contou.', art: ['flor', 'lilas', 'presente', '#ffd166'], on: ['game.score'], test: (x) => x.d.surprise === true },
  { id: 'ops', name: 'Ops!', page: 'encomendas', secret: true, how: 'Segredo.', won: 'Você desfez cinco vezes. Errar faz parte da receita.', art: ['circ', 'claro', 'desfazer', '#d12d58'], on: ['change'], test: (x) => x.s.undo >= 5 },
  { id: 'meio-album', name: 'Meio álbum', page: 'encomendas', how: 'Complete metade do álbum.', won: 'Metade do álbum completa.', art: ['selo', 'lilas', 'album', '#d12d58'], on: ['*'], test: (x) => x.earned >= Math.ceil((STICKERS.length - 1) / 2) },
];

export const getSticker = (id) => STICKERS.find((s) => s.id === id) || null;

/** Os contadores que as figurinhas de "junte tantos" precisam (guardados com o estado do jogo). Nunca aparecem na tela. */
export function emptyStats() {
  return { placed: 0, undo: 0, massas: [], recheios: [], formas: [] };
}

const addTo = (list, id, max = 60) => {
  if (typeof id === 'string' && id && !list.includes(id) && list.length < max) list.push(id);
};

/** Anota no contador o que o evento conta (só o que a pessoa fez). Mexe em `stats`. */
export function countEvent(stats, type, d = {}) {
  if (type === 'gesture' && d.id === 'place' && d.phase === 'end') stats.placed = Math.min(9999, stats.placed + 1);
  if (type !== 'change') return;
  if (d.by === 'undo' || d.key === 'undo') stats.undo = Math.min(9999, stats.undo + 1);
  if (!mine(d)) return;
  if ((d.key === 'layer.flavor' || d.key === 'layer.add') && getFlavor(d.value?.id)) addTo(stats.massas, d.value.id);
  if (d.key === 'filling' && getFilling(d.value?.id)) addTo(stats.recheios, d.value.id);
  if (d.key === 'shape' && typeof d.value === 'string') addTo(stats.formas, d.value, 20);
}

/**
 * As figurinhas que este evento dá, fora as que a pessoa já tem.
 *   earnedBy('change', detalhe, { stats, have: Set(ids), now: Date, game: resumo })  → [ids]
 * Chame countEvent antes (o jogo faz isso). Um teste que falha por dado estranho não derruba nada: só não dá a figurinha.
 */
export function earnedBy(type, d = {}, { stats = emptyStats(), have = new Set(), now = new Date(), game = {} } = {}) {
  let c;
  let picked;
  let bo;
  const x = {
    type,
    d: d || {},
    s: stats,
    now,
    game: { dailyCount: 0, easyLeft: 1, left: 1, notPerfect: 1, ...game },
    earned: have.size,
    get c() {
      if (c === undefined) c = x.d.config && typeof x.d.config === 'object' ? normalizeConfig(x.d.config) : null;
      return c;
    },
    has(kinds, fn) {
      if (!x.c) return false;
      picked = picked || pickedOf(x.c);
      const list = [].concat(kinds);
      return picked.some((p) => list.includes(p.kind) && fn(p));
    },
    /** quantos enfeites diferentes do bolo são de um grupo ('flores', 'frutas') ou têm uma etiqueta ('natal') */
    count(what) {
      if (!x.c) return 0;
      const ids = new Set([...x.c.decor.items, ...(x.c.decor.placed || []).map((p) => p.id)]);
      return [...ids].map(getDecor).filter((dec) => dec && (dec.group === what || (dec.tags || []).includes(what))).length;
    },
    bo() {
      bo = bo || (x.c ? scoreOf(x.c) : { sabor: 0, visual: 0, equilibrio: 0 });
      return bo;
    },
  };
  const out = [];
  for (const s of STICKERS) {
    if (have.has(s.id) || s.id === 'meio-album' || !(s.on.includes(type) || s.on.includes('*'))) continue;
    try {
      if (s.test(x)) out.push(s.id);
    } catch {
      // evento fora do formato esperado: não é motivo para quebrar o ateliê
    }
  }
  // a do meio do álbum olha o que acabou de entrar
  const half = STICKERS.find((s) => s.id === 'meio-album');
  if (half && !have.has(half.id)) {
    x.earned = have.size + out.length;
    if (half.test(x)) out.push(half.id);
  }
  return out;
}
