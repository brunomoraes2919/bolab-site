// BOLAB — pontos de partida do personalizador: inspirações, bolos do cardápio e "Surpreenda-me".
import { getDecor, getSize, getShape, getFlavor, getFilling, getFillAdd, getSoak, getCovering, getFinish, getTrim, getPiping, getCandleStyle, getTheme, pipingPlaces } from '../data/customizer.js';
import { normalizeConfig, applyTheme } from './pricing.js';
import { enforceRules } from './rules.js';

const cfg = (c) => normalizeConfig({ decor: { items: [] }, ...c });

/** Inspirações: combinações completas e equilibradas, para ninguém começar do zero. */
export const PRESETS = [
  {
    id: 'morango',
    occasion: 'aniversario',
    name: 'Morango dos Sonhos',
    tag: 'Baunilha, morango e leite em pó cremoso',
    config: cfg({
      shape: 'round',
      layers: ['baunilha', 'baunilha', 'baunilha'],
      fillings: ['morango', 'ninho'],
      covering: { type: 'buttercream', color: '#f7d3dc' },
      drip: { on: true, color: '#ffffff' },
      piping: { style: 'rosetas', where: 'top', color: '#ffffff' },
      decor: { items: ['frutas'] },
    }),
  },
  {
    id: 'belga',
    occasion: 'aniversario',
    name: 'Chocolate Belga',
    tag: 'Para quem ama chocolate',
    config: cfg({
      shape: 'round',
      layers: ['chocolate', 'chocolate', 'chocolate'],
      fillings: ['brigadeiro', 'nutella'],
      covering: { type: 'ganache', color: '#3a1a08' },
      drip: { on: false, color: '#6b3f22' },
      piping: { style: 'conchas', where: 'base', color: '#6b3f22' },
      decor: { items: ['raspas', 'frutas'] },
    }),
  },
  {
    id: 'festa',
    occasion: 'infantil',
    name: 'Festa Confete',
    tag: 'Colorido e cheio de alegria',
    config: cfg({
      shape: 'round',
      layers: ['baunilha', 'morango', 'baunilha'],
      fillings: ['ninho', 'brigadeiro'],
      covering: { type: 'chantilly', color: '#ffffff' },
      drip: { on: true, color: '#d96b82' },
      piping: { style: 'estrelas', where: 'both', color: '#9bd4ff' },
      decor: { items: ['confete', 'velas', 'topo'], candles: 6 },
    }),
  },
  {
    id: 'amor',
    occasion: 'namorados',
    name: 'Red Velvet do Amor',
    tag: 'Coração para presentear',
    config: cfg({
      shape: 'heart',
      layers: ['redvelvet', 'redvelvet'],
      fillings: ['ninho'],
      covering: { type: 'buttercream', color: '#ffb3d1' },
      drip: { on: false, color: '#ffffff' },
      piping: { style: 'conchas', where: 'both', color: '#ffffff' },
      decor: { items: ['flores', 'perolas'], message: 'Te amo' },
    }),
  },
  {
    id: 'limao',
    occasion: 'aniversario',
    name: 'Limão Siciliano',
    tag: 'Leve, cítrico e elegante',
    config: cfg({
      shape: 'round',
      layers: ['limao', 'limao', 'limao'],
      fillings: ['limao', 'coco'],
      covering: { type: 'chantilly', color: '#ffffff' },
      drip: { on: true, color: '#ffd166' },
      piping: { style: 'bolinhas', where: 'top', color: '#ffffff' },
      decor: { items: ['flores', 'perolas'] },
    }),
  },
  {
    id: 'naked',
    occasion: 'casamento',
    name: 'Naked Rústico',
    tag: 'Doce de leite e frutas',
    config: cfg({
      shape: 'round',
      layers: ['baunilha', 'baunilha', 'baunilha'],
      fillings: ['docedeleite', 'ninho'],
      covering: { type: 'naked', color: '#ffffff' },
      drip: { on: true, color: '#b9772c' },
      piping: { style: 'liso', where: 'top', color: '#ffffff' },
      decor: { items: ['frutas', 'flores'] },
    }),
  },
];

/** Ocasiões das inspirações (filtro da faixa de inspirações), na ordem em que os filtros aparecem.
 *  "Bebê" junta chá de bebê, chá revelação e batizado; "Datas festivas", Páscoa, festa junina, Halloween e Natal. */
export const OCCASIONS = [
  { id: 'aniversario', name: 'Aniversário' },
  { id: 'infantil', name: 'Infantil' },
  { id: 'quinze', name: '15 anos' },
  { id: 'casamento', name: 'Casamento' },
  { id: 'bebe', name: 'Bebê' },
  { id: 'namorados', name: 'Namorados' },
  { id: 'maes', name: 'Dia das Mães' },
  { id: 'formatura', name: 'Formatura' },
  { id: 'festas', name: 'Datas festivas' },
];

// Inspirações que usam os recursos novos: andares, estilos de cobertura, bicos, decorações com arranjo, bases.
PRESETS.push(
  {
    id: 'lambeth',
    occasion: 'quinze',
    name: 'Vintage Rosé',
    tag: 'Guirlandas, conchas e lacinhos',
    config: cfg({
      shape: 'round',
      height: 'alto',
      layers: ['baunilha', 'baunilha', 'baunilha'],
      fillings: ['framboesa', 'ninho'],
      covering: { type: 'buttercream', color: '#ffffff' },
      piping: { style: 'vintage', where: 'both', color: '#f7b7c8' },
      decor: { items: ['cerejas'], opts: { cerejas: { arr: 'coroa' } }, message: '15 anos', messageMode: 'bico', script: 'cursiva', messageColor: '#d96b82' },
    }),
  },
  {
    id: 'tres',
    occasion: 'casamento',
    name: 'Três Andares Clássico',
    tag: 'Branco, pérolas e rosas em cascata',
    config: cfg({
      shape: 'round',
      tiers: 3,
      base: 'prateada',
      layers: ['baunilha', 'baunilha', 'baunilha'],
      fillings: ['ninho', 'framboesa'],
      covering: { type: 'buttercream', color: '#ffffff' },
      piping: { style: 'perolao', where: 'base', color: '#ffffff' },
      decor: { items: ['flores', 'perolas'], opts: { flores: { arr: 'cascata', qty: 'farto', color: '#ffffff' } } },
    }),
  },
  {
    id: 'campo',
    occasion: 'casamento',
    name: 'Semi-naked do Campo',
    tag: 'Rústico, com frutas e flores',
    config: cfg({
      shape: 'round',
      tiers: 2,
      base: 'madeira',
      layers: ['baunilha', 'baunilha', 'baunilha'],
      fillings: ['docedeleite', 'ninho'],
      covering: { type: 'buttercream', color: '#ffffff', style: 'seminaked' },
      piping: { style: 'liso', where: 'top', color: '#ffffff' },
      decor: { items: ['frutas', 'flores'], opts: { frutas: { arr: 'cascata' }, flores: { arr: 'centro', color: '#f39fb2' } } },
    }),
  },
  {
    id: 'lilas',
    occasion: 'quinze',
    name: 'Degradê Lilás',
    tag: 'Dois andares e borboletas',
    config: cfg({
      shape: 'round',
      tiers: 2,
      layers: ['baunilha', 'morango', 'baunilha'],
      fillings: ['ninho', 'framboesa'],
      covering: { type: 'buttercream', color: '#c7a7ff', style: 'ombre', color2: '#ffffff' },
      piping: { style: 'bolinhas', where: 'base', color: '#ffffff' },
      decor: { items: ['borboletas', 'perolas'], opts: { borboletas: { arr: 'cascata', color: '#d9c2ff' } }, topper: { text: '15', color: '#dcae52' } },
    }),
  },
  {
    id: 'nuvem',
    occasion: 'bebe',
    name: 'Chá de Bebê Nuvem',
    tag: 'Aquarela, babado e suspiros',
    config: cfg({
      shape: 'round',
      layers: ['baunilha', 'baunilha', 'baunilha'],
      fillings: ['ninho', 'morango'],
      covering: { type: 'chantilly', color: '#ffffff', style: 'aquarela', color2: '#9bd4ff' },
      piping: { style: 'babado', where: 'top', color: '#ffffff' },
      decor: { items: ['suspiros', 'baloes'], opts: { suspiros: { arr: 'coroa', color: '#ffffff' }, baloes: { color: '#b8dcff' } }, message: 'Bem-vindo', messageMode: 'placa' },
    }),
  },
  {
    id: 'doces',
    occasion: 'infantil',
    name: 'Festa dos Doces',
    tag: 'Listras, pirulitos e marshmallows',
    config: cfg({
      shape: 'round',
      layers: ['baunilha', 'morango', 'baunilha'],
      fillings: ['brigadeiro', 'ninho'],
      covering: { type: 'buttercream', color: '#ffffff', style: 'listras', color2: '#ffb3d1' },
      piping: { style: 'bolinhas', where: 'both', color: '#ffffff' },
      decor: { items: ['pirulitos', 'marshmallows', 'velas'], opts: { marshmallows: { arr: 'espalhado' } }, candleStyle: 'numero', number: '5' },
    }),
  },
  {
    id: 'cerca',
    occasion: 'aniversario',
    name: 'Cerca de Chocolate',
    tag: 'Palitos de wafer e frutas no topo',
    config: cfg({
      shape: 'round',
      layers: ['chocolate', 'chocolate', 'chocolate'],
      fillings: ['brigadeiro', 'morango'],
      covering: { type: 'chocolate', color: '#6b3f22' },
      piping: { style: 'liso', where: 'top', color: '#ffffff' },
      decor: { items: ['wafer', 'frutas', 'lacos'], opts: { frutas: { arr: 'centro', qty: 'farto' }, lacos: { arr: 'frente', color: '#d96b82' } } },
    }),
  },
  {
    id: 'coracao',
    occasion: 'namorados',
    name: 'Coração Vintage',
    tag: 'Para dizer "te amo"',
    config: cfg({
      shape: 'heart',
      height: 'alto',
      layers: ['redvelvet', 'redvelvet', 'redvelvet'],
      fillings: ['ninho', 'framboesa'],
      covering: { type: 'buttercream', color: '#ffb3d1' },
      piping: { style: 'vintage', where: 'both', color: '#ffffff' },
      decor: { items: ['cerejas'], opts: { cerejas: { arr: 'coroa' } }, message: 'Te amo', messageMode: 'bico', script: 'cursiva', messageColor: '#8b1a1a' },
    }),
  },
  {
    id: 'natal',
    occasion: 'festas',
    name: 'Natal Nevado',
    tag: 'Espatulado branco, folhas e frutas vermelhas',
    config: cfg({
      shape: 'round',
      base: 'madeira',
      layers: ['chocolate', 'baunilha', 'chocolate'],
      fillings: ['docedeleite', 'ninho'],
      covering: { type: 'buttercream', color: '#ffffff', style: 'rustico' },
      piping: { style: 'folhas', where: 'top', color: '#2d8b4a' },
      decor: { items: ['cerejas', 'ouro'], opts: { cerejas: { arr: 'centro', qty: 'farto' }, ouro: { arr: 'espalhado', qty: 'pouco' } } },
    }),
  },
  {
    id: 'dourado',
    occasion: 'casamento',
    name: 'Elegância Dourada',
    tag: 'Hexagonal, respingo de ouro e macarons',
    config: cfg({
      shape: 'hex',
      tiers: 2,
      base: 'dourada',
      layers: ['baunilha', 'baunilha', 'baunilha'],
      fillings: ['maracuja', 'ninho'],
      covering: { type: 'buttercream', color: '#ffffff', style: 'respingo' },
      piping: { style: 'corda', where: 'base', color: '#ffffff' },
      decor: { items: ['macarons', 'ouro'], opts: { macarons: { arr: 'meialua', qty: 'pouco', color: '#ffffff' }, ouro: { arr: 'coroa' } }, topper: { text: 'Amor', color: '#dcae52' } },
    }),
  },
  {
    id: 'jardim',
    occasion: 'aniversario',
    name: 'Jardim de Macarons',
    tag: 'Macarons, margaridas e calda branca',
    config: cfg({
      shape: 'round',
      layers: ['limao', 'limao', 'limao'],
      fillings: ['framboesa', 'ninho'],
      covering: { type: 'buttercream', color: '#a8f0c6' },
      drip: { on: true, color: '#ffffff' },
      piping: { style: 'liso', where: 'top', color: '#ffffff' },
      decor: { items: ['macarons', 'margaridas'], opts: { macarons: { arr: 'coroa', color: '#f7b7c8' }, margaridas: { arr: 'espalhado', qty: 'pouco' } } },
    }),
  },
);

/* ───────── Rodada 5: inspirações com o cardápio novo ─────────
   Formatos (oval, flor, vulcão), tamanhos (bentô, GG), massas e recheios novos, estilos de cobertura (rosetas,
   babados, cesta, fault line, marmorizado, pinceladas, perolado, estêncil), bicos de lateral, temas prontos e
   velas novas. Toda inspiração passa em tools/tests/vitrine.test.mjs: nada que as regras de confeiteiro
   bloqueiem, nada desligado no cardápio, e tudo cabe no bolo.

   sized: true = a inspiração foi pensada para o tamanho dela (bentô, GG) e a tela a aplica NESSE tamanho
   (r5-qa: `keepSize: !p.sized` em js/views/customizer.js). As demais mantêm o tamanho que a pessoa já escolheu. */

/** Inspiração que parte de um tema pronto (customizer-decor.js → THEMES): o tema põe o bico e as decorações. */
const themed = (themeId, c, after = null) => {
  const base = applyTheme(cfg(c), themeId);
  if (!after) return base;
  const next = JSON.parse(JSON.stringify(base));
  after(next);
  return normalizeConfig(next);
};
const x3 = (id) => [id, id, id];

PRESETS.push(
  {
    id: 'vulcao',
    occasion: 'aniversario',
    name: 'Vulcão de Chocolate',
    tag: 'Brigadeiro cremoso transbordando do furo',
    config: cfg({
      shape: 'vulcao',
      layers: ['chocolate'],
      fillings: [],
      covering: { type: 'chocolate', color: '#6b3f22' },
      drip: { on: false, amount: 'farta' },
      piping: { style: 'liso', where: 'top', color: '#ffffff' },
      decor: { items: ['morangosfrescos', 'granulado'], opts: { morangosfrescos: { arr: 'coroa' } } },
    }),
  },
  {
    id: 'unicornio',
    occasion: 'infantil',
    name: 'Unicórnio Encantado',
    tag: 'Chifre dourado, crina de rosetas e cílios',
    config: themed('unicornio', {
      shape: 'round',
      layers: ['funfetti', 'funfetti', 'funfetti', 'funfetti'],
      fillings: ['brigadeirobranco', 'morango', 'brigadeirobranco'],
      covering: { type: 'chantininho', color: '#ffffff' },
    }),
  },
  {
    id: 'cesta',
    occasion: 'aniversario',
    name: 'Cesta de Morangos',
    tag: 'Trançado de bico e morangos inteiros',
    config: cfg({
      shape: 'round',
      base: 'madeira',
      layers: x3('baunilha'),
      fillings: ['morango', 'cremebelga'],
      covering: { type: 'buttercream', color: '#f2e4c7', style: 'cesta' },
      piping: { style: 'corda', where: 'top', color: '#f2e4c7' },
      decor: { items: ['morangosfrescos'], opts: { morangosfrescos: { arr: 'coroa', qty: 'farto' } } },
    }),
  },
  {
    id: 'mar',
    occasion: 'infantil',
    name: 'Fundo do Mar',
    tag: 'Cauda de sereia, conchas e escamas de bico',
    config: themed('mar', {
      shape: 'round',
      layers: x3('coco'),
      fillings: ['abacaxicoco', 'coco'],
      covering: { type: 'buttercream', color: '#9bd4ff', style: 'ombre', color2: '#ffffff' },
    }),
  },
  {
    id: 'flor',
    occasion: 'maes',
    name: 'Flor para a Mãe',
    tag: 'Formato de flor, peônias e pistache',
    config: themed('maes', {
      shape: 'flor',
      layers: x3('amendoas'),
      fillings: ['pistache', 'framboesa'],
      covering: { type: 'buttercream', color: '#f7d3dc' },
    }),
  },
  {
    id: 'faultline',
    occasion: 'aniversario',
    name: 'Faixa de Confeitos',
    tag: 'Fault line colorida e casquinha derretendo',
    config: cfg({
      shape: 'round',
      layers: ['chocolate', 'chocolate', 'chocolate', 'chocolate'],
      fillings: ['cookies', 'nutella', 'cookies'],
      covering: { type: 'buttercream', color: '#c7a7ff', style: 'faultline', trim: 'confeitos' },
      piping: { style: 'liso', where: 'top', color: '#ffffff' },
      decor: { items: ['casquinha', 'confete'], opts: { casquinha: { color: '#f7b7c8' } } },
    }),
  },
  {
    id: 'oval',
    occasion: 'aniversario',
    name: 'Mármore e Figos',
    tag: 'Oval marmorizado, com figos, amoras e ouro',
    config: cfg({
      shape: 'oval',
      base: 'marmore',
      layers: x3('nozes'),
      fillings: ['caramelosalgado', 'nozes'],
      covering: { type: 'ganachebranca', color: '#f2e4c7', style: 'marmorizado', color2: '#b9772c' },
      piping: { style: 'liso', where: 'top', color: '#ffffff' },
      decor: { items: ['figos', 'amoras', 'ouro'], opts: { figos: { arr: 'centro' }, amoras: { arr: 'espalhado', qty: 'pouco' }, ouro: { arr: 'coroa', qty: 'pouco' } } },
    }),
  },
  {
    id: 'dinos',
    occasion: 'infantil',
    name: 'Vale dos Dinossauros',
    tag: 'Silhuetas, folhas e ovinhos no gramado',
    config: themed('dinos', {
      shape: 'round',
      layers: x3('chocolate'),
      fillings: ['cookies', 'brigadeiro'],
      covering: { type: 'chantininho', color: '#f2e4c7' },
    }),
  },
  {
    id: 'babados',
    occasion: 'quinze',
    name: 'Saia de Babados',
    tag: 'Dois andares de babados e coroa rosé',
    config: cfg({
      shape: 'round',
      tiers: 2,
      layers: x3('redvelvet'),
      fillings: ['creamcheese', 'framboesa'],
      covering: { type: 'buttercream', color: '#ffb3d1', style: 'babados' },
      piping: { style: 'perolao', where: 'top', color: '#ffffff' },
      decor: { items: ['coroa', 'perolas'], opts: { coroa: { color: '#e8a5a0' } } },
    }),
  },
  {
    id: 'bento',
    occasion: 'namorados',
    sized: true,
    name: 'Bentô do Recado',
    tag: 'Mini bolo na caixinha, com recado no bico',
    config: cfg({
      shape: 'round',
      size: 'bento',
      base: 'caixa',
      layers: ['chocolate', 'chocolate'],
      fillings: ['brigadeiro'],
      covering: { type: 'chantininho', color: '#ffffff' },
      piping: { style: 'conchas', where: 'both', color: '#ffb3d1' },
      decor: { items: [], message: 'Te adoro', messageMode: 'bico', script: 'gordinha', messageColor: '#8b1a1a' },
    }),
  },
  {
    id: 'futebol',
    occasion: 'infantil',
    name: 'Dia de Jogo',
    tag: 'Gramado de bico e bola no centro',
    config: themed('futebol', {
      shape: 'rect',
      layers: x3('formigueiro'),
      fillings: ['brigadeiro', 'brigadeirobranco'],
      covering: { type: 'chantininho', color: '#ffffff' },
    }),
  },
  {
    id: 'rosetas',
    occasion: 'maes',
    name: 'Buquê de Rosetas',
    tag: 'Coberto de rosetas, com pérolas e borboletas',
    config: cfg({
      shape: 'round',
      layers: x3('baunilha'),
      fillings: ['frutasvermelhas', 'ganachebranca'],
      covering: { type: 'buttercream', color: '#f7d3dc', style: 'rosetas' },
      piping: { style: 'liso', where: 'top', color: '#ffffff' },
      decor: { items: ['perolas', 'borboletas'], opts: { borboletas: { arr: 'espalhado', qty: 'pouco', color: '#ffffff' } } },
    }),
  },
  {
    id: 'aliancas',
    occasion: 'casamento',
    name: 'Peônias e Alianças',
    tag: 'Dois andares perolados, com guirlandas de bico',
    config: themed(
      'casamento',
      { shape: 'round', tiers: 2, base: 'dourada', layers: x3('nozes'), fillings: ['ameixa', 'nozes'], covering: { type: 'buttercream', color: '#f2e4c7', style: 'perolado' } },
      (c) => {
        // o tema sugere branco; aqui o perolado vai sobre creme (tom de champanhe)
        c.covering.color = '#f2e4c7';
      },
    ),
  },
  {
    id: 'junina',
    occasion: 'festas',
    name: 'Arraiá de Paçoca',
    tag: 'Bandeirinhas, chapéu de palha e paçoca',
    config: themed(
      'junina',
      { shape: 'round', base: 'madeira', layers: x3('pacoca'), fillings: ['docedeleite', 'pacoca'], covering: { type: 'buttercream', color: '#ffd166', style: 'rustico' } },
      (c) => {
        // paçocas de um lado e pipoca do outro: o chapéu de palha fica à mostra no centro
        c.decor.opts.pacoca = { arr: 'meialua', qty: 'pouco' };
        c.decor.opts.pipoca = { arr: 'coroa', qty: 'pouco' };
      },
    ),
  },
  {
    id: 'pascoa',
    occasion: 'festas',
    name: 'Coelhinho da Páscoa',
    tag: 'Cenoura com brigadeiro, orelhas e ovinhos',
    config: themed(
      'pascoa',
      { shape: 'round', layers: x3('cenoura'), fillings: ['brigadeiro', 'brigadeiro'], covering: { type: 'buttercream', color: '#a8f0c6', style: 'poa', color2: '#ffffff' } },
      (c) => {
        c.covering.color = '#a8f0c6'; // o tema sugere branco; aqui, menta com poá branco
        c.decor.opts.ovinhos.qty = 'pouco'; // o ninho de ovinhos divide o centro com as orelhas
      },
    ),
  },
  {
    id: 'halloween',
    occasion: 'festas',
    name: 'Doces ou Travessuras',
    tag: 'Fantasminhas, abóboras e calda laranja',
    config: themed(
      'halloween',
      { shape: 'round', layers: x3('chocolate'), fillings: ['docedeleite', 'meioamargo'], covering: { type: 'buttercream', color: '#4a1a6a' }, drip: { on: true, color: '#e07820' } },
      (c) => {
        // os morcegos do tema vão colados na lateral, onde a calda desce: aqui ficam de fora
        c.decor.items = c.decor.items.filter((id) => id !== 'morcegos');
      },
    ),
  },
  {
    id: 'formatura',
    occasion: 'formatura',
    name: 'Canudo na Mão',
    tag: 'Capelo, estrelas douradas e pinceladas',
    config: themed('formatura', {
      shape: 'round',
      layers: x3('chocolate'),
      fillings: ['caramelosalgado', 'meioamargo'],
      covering: { type: 'buttercream', color: '#ffffff', style: 'pinceladas', color2: '#1d1a1c' },
    }),
  },
  {
    id: 'batizado',
    occasion: 'bebe',
    name: 'Batizado de Renda',
    tag: 'Arabescos dourados, cruz e mosquitinho',
    config: themed(
      'batizado',
      {
        shape: 'round',
        layers: x3('baunilha'),
        fillings: ['pessego', 'quatroleites'],
        covering: { type: 'buttercream', color: '#ffffff', style: 'arabesco', color2: '#dcae52' },
      },
      (c) => {
        // a renda de estêncil é a lateral: a fita do tema ficaria por cima dela
        c.decor.items = c.decor.items.filter((id) => id !== 'fita');
      },
    ),
  },
  {
    id: 'revelacao',
    occasion: 'bebe',
    name: 'Chá Revelação',
    tag: 'Escolha a cor em segredo: só aparece no corte',
    // Neutra por fora e com recheios claros (os que pegam a cor). O chá revelação NÃO vem ligado: a tela trata
    // um bolo que chega com ele ligado como "cor já escolhida", e o pedido sairia com uma cor que ninguém escolheu.
    // r5-qa: askReveal = ao aplicar, a tela abre o seletor secreto da cor (sem escolha, o chá fica desligado).
    askReveal: true,
    config: cfg({
      shape: 'round',
      layers: x3('baunilha'),
      fillings: ['ninho', 'brigadeirobranco'],
      covering: { type: 'chantininho', color: '#ffffff' },
      piping: { style: 'poa', where: 'top', color: '#ffd166' },
      decor: { items: ['nuvens', 'micangas'], opts: { nuvens: { arr: 'coroa', qty: 'pouco' }, micangas: { color: '#fff2a8' } }, message: 'Menino ou menina?' },
    }),
  },
  {
    id: 'festao',
    occasion: 'aniversario',
    sized: true,
    name: 'Festa Grande',
    tag: 'GG de dois andares, confeitos e velas de letras',
    config: cfg({
      shape: 'round',
      size: 'gg',
      tiers: 2,
      layers: x3('mesclada'),
      fillings: ['brigadeiro', 'ninho'],
      covering: { type: 'chantininho', color: '#ffffff', style: 'chuva', trim: 'confeitos' },
      piping: { style: 'pitangas', where: 'top', color: '#ffffff' },
      // r5-qa: a tela aplica esta inspiração no GG dela (sized): as velas de letras voltam, que no GG cabem
      decor: { items: ['velas', 'baloes', 'topo'], candleStyle: 'letras', opts: { baloes: { color: '#ffd166' } } },
    }),
  },
);

/* Ordem da fileira "Todas": as mais vistosas primeiro, misturando ocasiões, formatos e cores (quem filtra por
   ocasião vê a mesma ordem). Inspiração nova que não estiver na lista entra no fim. */
const ORDER = [
  'morango', 'vulcao', 'unicornio', 'cesta', 'belga', 'mar', 'flor', 'faultline', 'bento', 'limao', 'futebol', 'babados',
  'oval', 'dinos', 'rosetas', 'amor', 'festa', 'lambeth', 'aliancas', 'naked', 'junina', 'revelacao', 'formatura', 'pascoa',
  'doces', 'tres', 'batizado', 'halloween', 'campo', 'lilas', 'nuvem', 'cerca', 'coracao', 'festao', 'natal', 'dourado', 'jardim',
];
const rank = (id) => (ORDER.includes(id) ? ORDER.indexOf(id) : ORDER.length);
PRESETS.sort((a, b) => rank(a.id) - rank(b.id));

export function getPreset(id) {
  return PRESETS.find((p) => p.id === id) || null;
}

/** Bolos do cardápio traduzidos para o personalizador (entrada por ?base=p1…p10), com o que a descrição de
 *  cada um promete: ganache no Chocolate Belga, cream cheese no Red Velvet, lemon curd e merengue no Limão… */
const BY_PRODUCT = {
  p1: () => ({ ...getPreset('belga').config, fillings: ['ganache', 'ganache'], decor: { ...getPreset('belga').config.decor, items: ['raspas'] } }),
  p2: () =>
    cfg({
      layers: ['redvelvet', 'redvelvet', 'redvelvet'],
      fillings: ['creamcheese', 'creamcheese'],
      covering: { type: 'chantilly', color: '#ffffff' },
      piping: { style: 'conchas', where: 'both', color: '#ffffff' },
      decor: { items: ['frutas'] },
    }),
  p3: () =>
    cfg({
      layers: ['baunilha', 'baunilha', 'baunilha'],
      fillings: ['morango', 'ninho'],
      covering: { type: 'naked', color: '#ffffff' },
      piping: { style: 'liso', where: 'top', color: '#ffffff' },
      decor: { items: ['frutas'] },
    }),
  // "massa úmida de cenoura com brigadeiro cremoso por cima": é o vulcão, uma massa só com a cobertura transbordando
  p4: () => ({ ...getPreset('vulcao').config, layers: ['cenoura'], decor: { ...getPreset('vulcao').config.decor, items: ['granulado'] } }),
  p5: () =>
    cfg({
      layers: ['baunilha', 'baunilha'],
      fillings: ['coco'],
      covering: { type: 'chantilly', color: '#ffffff' },
      piping: { style: 'bolinhas', where: 'top', color: '#ffffff' },
      decor: { items: ['frutas'] },
    }),
  p6: () => getPreset('unicornio').config,
  p7: () =>
    cfg({
      layers: ['limao', 'limao', 'limao'],
      fillings: ['limaosiciliano', 'limaosiciliano'],
      covering: { type: 'merengue', color: '#ffffff' },
      piping: { style: 'liso', where: 'top', color: '#ffffff' },
      decor: { items: ['limao'], opts: { limao: { arr: 'coroa', qty: 'pouco' } } },
    }),
  p8: () =>
    cfg({
      layers: ['chocolate', 'chocolate', 'chocolate'],
      fillings: ['prestigio', 'prestigio'],
      covering: { type: 'chocolate', color: '#3a1a08' },
      piping: { style: 'conchas', where: 'top', color: '#ffffff' },
      decor: { items: ['coco', 'raspas'] },
    }),
  p9: () =>
    cfg({
      layers: ['chocolate', 'chocolate'],
      fillings: ['brigadeiro'],
      covering: { type: 'ganache', color: '#3a1a08' },
      piping: { style: 'liso', where: 'top', color: '#6b3f22' },
      decor: { items: ['frutas'] },
    }),
  p10: () =>
    cfg({
      layers: ['chocolate', 'chocolate', 'chocolate'],
      fillings: ['cereja', 'cereja'],
      covering: { type: 'chantilly', color: '#ffffff' },
      piping: { style: 'rosetas', where: 'top', color: '#ffffff' },
      decor: { items: ['raspas', 'cerejas'], opts: { cerejas: { arr: 'centro', qty: 'pouco' } } },
    }),
};

/** Configuração parecida com um produto do cardápio; null se não houver correspondência. */
export function presetForProduct(productId) {
  const make = BY_PRODUCT[productId];
  return make ? normalizeConfig(make()) : null;
}

/* ───────── Paletas prontas ─────────
   Recolorem o bolo inteiro em harmonia: cobertura (e a segunda cor do degradê/aquarela/listras), calda,
   bico, as decorações que têm cor e a mensagem. */
export const COLOR_PALETTES = [
  { id: 'pastel', name: 'Pastel', cover: '#f7d3dc', cover2: '#ffffff', drip: '#ffffff', piping: '#ffffff', accents: ['#f7b7c8', '#bfe8c8', '#b8dcff', '#d9c2ff'], text: '#d96b82' },
  { id: 'neutro', name: 'Neutro elegante', cover: '#ffffff', cover2: '#f2e4c7', drip: '#f2e4c7', piping: '#ffffff', accents: ['#ffffff', '#f2e4c7', '#dcae52'], text: '#b9772c' },
  { id: 'chocolate', name: 'Chocolate', cover: '#6b3f22', cover2: '#3a1a08', drip: '#3a1a08', piping: '#f2e4c7', accents: ['#3a1a08', '#f2e4c7', '#b9772c'], text: '#f2e4c7', dark: true },
  { id: 'romantico', name: 'Romântico', cover: '#ffb3d1', cover2: '#d96b82', drip: '#ffffff', piping: '#ffffff', accents: ['#d96b82', '#f7b7c8', '#ffffff'], text: '#8b1a1a' },
  { id: 'lavanda', name: 'Lavanda', cover: '#c7a7ff', cover2: '#ffffff', drip: '#ffffff', piping: '#ffffff', accents: ['#d9c2ff', '#ffffff', '#f7b7c8'], text: '#4a1a6a' },
  { id: 'ceu', name: 'Céu de algodão', cover: '#9bd4ff', cover2: '#ffffff', drip: '#ffffff', piping: '#ffffff', accents: ['#b8dcff', '#ffffff', '#d9c2ff'], text: '#1a4a8b' },
  { id: 'tropical', name: 'Tropical', cover: '#ffd166', cover2: '#ff8c8c', drip: '#ffffff', piping: '#2d8b4a', accents: ['#ff8c8c', '#ffd166', '#a8f0c6'], text: '#2d8b4a' },
  { id: 'menta', name: 'Menta fresca', cover: '#a8f0c6', cover2: '#ffffff', drip: '#ffffff', piping: '#ffffff', accents: ['#ffffff', '#fff2a8', '#f7b7c8'], text: '#2d8b4a' },
  { id: 'gala', name: 'Noite de gala', cover: '#1a4a8b', cover2: '#4a1a6a', drip: '#dcae52', piping: '#ffffff', accents: ['#dcae52', '#ffffff', '#cfd3da'], text: '#dcae52', dark: true },
  { id: 'natal', name: 'Natal', cover: '#ffffff', cover2: '#8b1a1a', drip: '#8b1a1a', piping: '#2d8b4a', accents: ['#8b1a1a', '#2d8b4a', '#dcae52'], text: '#8b1a1a' },
];

const mixHex = (a, b, k) => {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (sh) => Math.round(((pa >> sh) & 255) + (((pb >> sh) & 255) - ((pa >> sh) & 255)) * k);
  return `#${[16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, '0')).join('')}`;
};

/** Aplica uma paleta ao bolo atual, sem mexer em formato, sabores, estilos nem na escolha das decorações. */
export function applyPalette(config, palette) {
  const c = JSON.parse(JSON.stringify(config));
  c.covering.color = palette.cover;
  c.covering.color2 = palette.cover2;
  if (Array.isArray(c.tierCover)) {
    // uma cobertura por andar: do tom principal (embaixo) ao segundo tom (em cima)
    const n = c.tierCover.length;
    c.tierCover = c.tierCover.map((t, i) => ({ ...t, color: mixHex(palette.cover, palette.cover2, n > 1 ? i / (n - 1) : 0), color2: palette.cover2 }));
  }
  c.drip.color = palette.drip;
  c.piping.color = palette.piping;
  c.decor.messageColor = palette.text;
  c.decor.opts = c.decor.opts || {};
  let k = 0;
  c.decor.items.forEach((id) => {
    const d = getDecor(id);
    if (!d?.colors) return;
    // chocolates continuam em tons de chocolate; o resto recebe os tons de destaque da paleta
    if (d.colors === 'choc') return;
    c.decor.opts[id] = { ...(c.decor.opts[id] || {}), color: palette.accents[k++ % palette.accents.length] };
  });
  return normalizeConfig(c);
}

/* ───────── Surpreenda-me ─────────
   Sorteio com bom gosto: parte de "receitas" que confeiteiras usam de verdade (cobertura + estilo + bico +
   decorações que conversam) e de uma paleta pronta; massas e recheios que combinam. Nunca é só aleatório, e o
   bolo sorteado sempre passa pelas regras de confeiteiro (enforceRules) antes de chegar à tela. */

/** Recheios que combinam com cada massa (todas as 19 massas do cardápio). */
const PAIRINGS = {
  baunilha: ['morango', 'ninho', 'docedeleite', 'frutasvermelhas', 'cremebelga', 'pessego', 'brigadeiro', 'quatroleites', 'maracuja', 'abacaxicoco'],
  chocolate: ['brigadeiro', 'meioamargo', 'nutella', 'ninho', 'prestigio', 'cereja', 'moussechocolate', 'caramelosalgado', 'cookies', 'framboesa', 'coco', 'cafe'],
  cenoura: ['brigadeiro', 'meioamargo', 'docedeleite', 'nutella'],
  redvelvet: ['creamcheese', 'ninho', 'frutasvermelhas', 'framboesa', 'ganachebranca'],
  mesclada: ['brigadeiro', 'ninho', 'brigadeirobranco', 'docedeleite'],
  formigueiro: ['brigadeiro', 'brigadeirobranco', 'ninho', 'docedeleite'],
  funfetti: ['ninho', 'brigadeirobranco', 'moussemorango', 'morango'],
  limao: ['limao', 'limaosiciliano', 'coco', 'framboesa', 'ganachebranca', 'frutasvermelhas'],
  morango: ['ninho', 'morango', 'brigadeirobranco', 'moussemorango', 'cremebelga'],
  laranja: ['brigadeiro', 'ganache', 'cremebelga', 'docedeleite'],
  maracuja: ['maracuja', 'ganachebranca', 'coco', 'brigadeirobranco', 'ninho'],
  banana: ['docedeleite', 'caramelosalgado', 'docedeleitenozes', 'brigadeiro'],
  coco: ['coco', 'abacaxicoco', 'cocada', 'prestigio', 'docedeleite', 'maracuja'],
  nozes: ['docedeleitenozes', 'nozes', 'ameixa', 'caramelosalgado', 'cafe', 'docedeleite'],
  amendoas: ['frutasvermelhas', 'framboesa', 'pistache', 'ganachebranca', 'pessego', 'cremebelga'],
  pacoca: ['pacoca', 'docedeleite', 'brigadeiro', 'caramelosalgado'],
  churros: ['docedeleite', 'caramelosalgado', 'docedeleitenozes', 'cremebelga'],
  cafe: ['cafe', 'ganache', 'meioamargo', 'caramelosalgado', 'docedeleite', 'moussechocolate'],
  chocolatebranco: ['frutasvermelhas', 'framboesa', 'maracuja', 'limaosiciliano', 'pistache', 'ganachebranca'],
};
/** Massas que se alternam bem no mesmo bolo (a segunda entra nas camadas pares). */
const DUOS = { baunilha: ['chocolate', 'morango'], chocolate: ['baunilha', 'coco'], morango: ['baunilha'], coco: ['chocolate'], laranja: ['chocolate'], cafe: ['chocolate'], limao: ['coco'] };
/** Adicional de recheio (pedaços no corte) que cai bem em cada creme. */
const ADDS = {
  ninho: ['morango', 'crocante', 'gotas'],
  brigadeirobranco: ['morango', 'gotas'],
  quatroleites: ['morango', 'crocante'],
  cremebelga: ['morango', 'gotas'],
  brigadeiro: ['morango', 'crocante', 'nozes'],
  meioamargo: ['crocante', 'nozes'],
  docedeleite: ['nozes', 'crocante'],
  caramelosalgado: ['nozes', 'crocante'],
  cafe: ['crocante', 'gotas'],
  coco: ['gotas'],
};
/** Massas para os bolos de chocolate por fora (as que pedem cobertura escura). */
const DARK_FLAVORS = ['chocolate', 'chocolate', 'chocolate', 'cenoura', 'mesclada', 'redvelvet', 'cafe', 'nozes', 'laranja', 'banana', 'coco', 'baunilha'];

/** Massas para as receitas de festa de criança (listras com pirulitos, confeitos subindo com velas e balões). */
const KID_FLAVORS = ['baunilha', 'chocolate', 'mesclada', 'formigueiro', 'funfetti', 'morango', 'cenoura'];

/* Receitas. finish, types, piping e trim aceitam lista (sorteia um). decor = conjuntos de peças; 'id:arranjo' fixa o
   arranjo. where = lugar do bico quando a receita obriga (estilos que ocupam o pé do bolo, coberturas despejadas).
   dark = cobertura de chocolate · light = só paletas claras · color = cor fixa da cobertura · two = usa a segunda cor · flavors = massas da receita ·
   minLayers / maxTiers = só entra em bolos com essa estrutura · w = peso no sorteio (padrão 1). */
const RECIPES = [
  { w: 2, types: ['buttercream', 'chantininho', 'chantilly'], finish: 'liso', piping: ['rosetas', 'conchas', 'bolinhas', 'perolao', 'estrelas', 'pitangas', 'florzinhas', 'tranca'], decor: [['frutas'], ['flores', 'perolas'], ['macarons', 'flores'], ['frutas', 'flores'], ['morangosfrescos'], ['framboesas', 'mirtilos'], ['cerejas'], ['suspiros', 'micangas']], drip: 0.5 },
  { types: ['buttercream', 'chantininho'], finish: 'ombre', two: true, piping: ['bolinhas', 'perolao', 'liso', 'florzinhas'], decor: [['borboletas'], ['flores'], ['macarons', 'perolas'], ['peonias'], ['coracoes']], drip: 0 },
  { types: ['buttercream', 'chantininho', 'chantilly'], finish: 'aquarela', two: true, piping: ['babado', 'bolinhas', 'liso'], decor: [['suspiros'], ['margaridas'], ['flores', 'ouro'], ['nuvens'], ['prensadas']], drip: 0 },
  { types: ['buttercream'], finish: 'liso', piping: ['vintage'], decor: [['cerejas'], ['lacos', 'perolas'], ['coracoes'], []], drip: 0 },
  { types: ['buttercream', 'chantininho', 'creamcheese'], finish: 'rustico', piping: ['liso', 'folhas'], decor: [['frutas', 'flores'], ['peonias'], ['ouro', 'flores'], ['figos', 'amoras'], ['laranja', 'eucalipto'], ['girassois'], ['lavanda', 'mirtilos']], drip: 0 },
  { types: ['buttercream'], finish: 'seminaked', piping: ['liso'], decor: [['frutas', 'flores'], ['frutas'], ['peonias'], ['morangosfrescos', 'gipsofila'], ['figos', 'eucalipto']], drip: 0.3, light: true },
  { types: ['naked'], finish: 'liso', piping: ['liso'], decor: [['frutas', 'flores'], ['morangosfrescos'], ['figos'], ['frutas', 'gipsofila']], drip: 0.35, light: true, soak: 'baunilha', maxTiers: 2 },
  { types: ['buttercream', 'chantininho'], finish: 'listras', two: true, piping: ['bolinhas', 'estrelas', 'pingos'], decor: [['pirulitos', 'marshmallows'], ['confete', 'baloes'], ['suspiros'], ['donuts'], ['jujubas', 'cakepops']], drip: 0, flavors: KID_FLAVORS },
  { types: ['buttercream', 'chantininho'], finish: 'respingo', piping: ['corda', 'perolao', 'liso'], decor: [['macarons', 'ouro'], ['flores', 'ouro'], ['bombons'], ['espelhadas'], ['esferas']], drip: 0 },
  { types: ['buttercream', 'chantininho'], finish: ['pente', 'ondas', 'vertical'], piping: ['ziguezague', 'conchas', 'corda', 'liso'], decor: [['frutas'], ['margaridas'], ['macarons'], ['physalis'], ['morangosfrescos']], drip: 0 },
  { w: 2, types: ['ganache', 'chocolate'], finish: 'liso', piping: ['conchas', 'rosetas', 'corda', 'tranca', 'liso'], decor: [['morangos'], ['bombons', 'raspas'], ['brigadeiros'], ['wafer', 'frutas'], ['placas', 'esferas'], ['barras', 'crocantes'], ['cerejas', 'raspas']], drip: 0.6, dark: true },
  { types: ['brigadeiro'], finish: 'liso', piping: ['liso', 'conchas', 'pitangas'], where: 'top', decor: [['brigadeiros'], ['morangos'], ['morangosfrescos'], ['cerejas']], drip: 0, dark: true },
  // ── estilos de bico e de confeitos (rodada 5) ──
  { types: ['buttercream', 'chantininho'], finish: 'rosetas', piping: ['liso'], decor: [['perolas'], ['borboletas:espalhado'], ['micangas'], ['flores:centro']], drip: 0 },
  { types: ['buttercream', 'chantininho'], finish: 'babados', piping: ['perolao', 'bolinhas', 'liso'], where: 'top', decor: [['flores:centro'], ['perolas'], ['lacos:centro'], ['peonias:centro']], drip: 0 },
  { types: ['buttercream'], finish: 'cesta', piping: ['corda', 'tranca', 'liso'], where: 'top', decor: [['morangosfrescos'], ['frutas'], ['girassois'], ['margaridas:coroa']], drip: 0, light: true },
  { types: ['buttercream', 'ganachebranca'], finish: 'marmorizado', two: true, piping: ['liso', 'perolao'], where: 'top', decor: [['ouro'], ['figos'], ['flores', 'ouro'], ['esferas'], ['macarons']], drip: 0 },
  { types: ['buttercream', 'chantininho'], finish: 'pinceladas', two: true, piping: ['liso', 'corda'], decor: [['placas'], ['esferas', 'ouro'], ['flores'], ['macarons', 'ouro']], drip: 0 },
  { types: ['buttercream'], finish: 'perolado', piping: ['guirlanda', 'arabescos', 'perolao'], decor: [['flores', 'perolas'], ['peonias'], ['gipsofila'], ['lacos']], drip: 0, light: true },
  { types: ['buttercream'], finish: ['poa', 'coracoes', 'arabesco'], two: true, piping: ['bolinhas', 'perolao', 'liso'], decor: [['lacos'], ['flores'], ['suspiros'], ['coracoes'], ['borboletas:espalhado']], drip: 0 },
  { types: ['buttercream', 'chantininho', 'chantilly'], finish: 'barrado', trim: ['castanha', 'coco', 'granulado', 'raspas'], piping: ['conchas', 'rosetas', 'estrelas'], where: 'top', decor: [['cerejas'], ['frutas'], ['morangosfrescos']], drip: 0 },
  { types: ['buttercream', 'chantininho'], finish: 'chuva', trim: ['confeitos', 'granulado'], piping: ['pitangas', 'estrelas', 'pingos'], where: 'top', decor: [['velas', 'topo'], ['baloes'], ['confete', 'velas'], ['donuts']], drip: 0, flavors: KID_FLAVORS },
  { types: ['buttercream'], finish: 'faultline', trim: ['confeitos', 'granulado', 'castanha'], piping: ['liso'], decor: [['macarons'], ['casquinha'], ['flores'], ['frutas']], drip: 0, minLayers: 3 },
  { types: ['buttercream'], finish: 'liso', piping: ['escamas', 'poa', 'guirlanda', 'arabescos'], decor: [['perolas'], ['flores'], ['conchaschoc'], ['lacos']], drip: 0 },
  { types: ['glace'], finish: 'liso', piping: ['liso', 'bolinhas'], where: 'top', decor: [['ouro'], ['perolas'], ['framboesas'], ['mirtilos']], drip: 0, maxTiers: 1 },
  { types: ['merengue'], finish: 'liso', piping: ['liso'], decor: [['limao'], ['frutas'], ['maracuja'], ['physalis']], drip: 0, color: '#ffffff', maxTiers: 1, flavors: ['limao', 'maracuja', 'coco', 'laranja', 'baunilha'] },
  { types: ['coco'], finish: 'liso', piping: ['liso', 'bolinhas'], decor: [['coco'], ['frutas'], ['cerejas'], ['flores']], drip: 0, color: '#ffffff', flavors: ['coco', 'baunilha', 'chocolate', 'limao', 'maracuja', 'laranja'] },
];

/** O vulcão (fôrma de furo): uma massa só, sem recheio, com o creme transbordando. Só em bolo de 1 andar, do P ao G. */
const VOLCANO_RECIPES = [
  { flavor: ['chocolate', 'cenoura', 'mesclada', 'formigueiro'], type: 'chocolate', color: '#6b3f22', decor: [['granulado'], ['morangosfrescos:coroa'], ['brigadeiros'], ['raspas']] },
  { flavor: ['cenoura', 'chocolate', 'banana'], type: 'brigadeiro', color: '#6b3f22', decor: [['brigadeiros'], ['morangosfrescos:coroa'], []] },
  { flavor: ['chocolate', 'laranja', 'cafe'], type: 'ganache', color: '#3a1a08', decor: [['raspas'], ['morangos'], ['cerejas']] },
  { flavor: ['baunilha', 'morango', 'coco', 'funfetti'], type: 'chantininho', color: '#ffffff', decor: [['morangosfrescos:coroa'], ['coco'], ['confete'], ['frutas']] },
  { flavor: ['limao', 'maracuja', 'chocolatebranco'], type: 'ganachebranca', color: '#f2e4c7', decor: [['framboesas'], ['raspas'], ['physalis']] },
];
/** Temas prontos que servem em qualquer época (os de data e de cerimônia ficam para quem os procura). */
const SURPRISE_THEMES = ['unicornio', 'mar', 'safari', 'espaco', 'jardim', 'futebol', 'dinos', 'ursinho', 'nuvens', 'princesa', 'principe'];
const SURPRISE_CANDLES = ['classica', 'classica', 'longa', 'espiral', 'estrela', 'faisca'];

const isLive = (x) => Boolean(x) && x.active !== false;
const asList = (v) => (Array.isArray(v) ? v : [v]);

/**
 * Um bolo-surpresa. Mantém a estrutura que a pessoa já escolheu (tamanho, andares, altura, base e fundo) e
 * evita repetir a cobertura do bolo anterior. rng = gerador de números (0 a 1); os testes passam um com semente.
 */
export function randomConfig(current, rng = Math.random) {
  const rnd = (list) => list[Math.floor(rng() * list.length)];
  const weighted = (pairs) => {
    const total = pairs.reduce((sum, [, w]) => sum + w, 0);
    let r = rng() * total;
    for (const [value, w] of pairs) {
      r -= w;
      if (r <= 0) return value;
    }
    return pairs[0][0];
  };
  const live = (getter, ids) => ids.filter((id) => isLive(getter(id)));
  const size = isLive(getSize(current?.size)) ? current.size : 'p';
  const tiers = size === 'bento' ? 1 : current?.tiers || 1;
  // a surpresa mantém a altura que a pessoa escolheu (= o número de camadas de massa)
  const count = current?.layers?.length >= 2 ? current.layers.length : 3;
  const keep = { size, tiers, v: 4, base: current?.base || 'boleira', backdrop: current?.backdrop, name: '' };
  const done = (config) => enforceRules(config).config;

  // de vez em quando, um vulcão (só onde ele existe: 1 andar, do P ao G)
  if (tiers === 1 && (size === 'p' || size === 'm' || size === 'g') && current?.shape !== 'vulcao' && isLive(getShape('vulcao')) && rng() < 0.07) {
    const v = rnd(VOLCANO_RECIPES.filter((r) => isLive(getCovering(r.type))));
    const [items, opts] = decorSet(rnd(v.decor));
    return done({ ...keep, shape: 'vulcao', layers: [rnd(live(getFlavor, v.flavor)) || 'chocolate'], fillings: [], covering: { type: v.type, color: v.color }, drip: { on: false, amount: weighted([['media', 3], ['farta', 2]]) }, piping: { style: 'liso' }, decor: { items, opts, message: '' } });
  }

  const fits = (r) => (!r.minLayers || count >= r.minLayers) && (!r.maxTiers || tiers <= r.maxTiers);
  const pool = RECIPES.filter(fits).map((r) => [r, r.w || 1]);
  let recipe = pool[0][0];
  let palette = COLOR_PALETTES[0];
  let finish = 'liso';
  for (let i = 0; i < 8; i++) {
    recipe = weighted(pool);
    finish = rnd(live(getFinish, asList(recipe.finish))) || 'liso';
    palette = rnd(COLOR_PALETTES.filter((p) => Boolean(p.dark) === Boolean(recipe.dark) && !(recipe.light && p.id !== 'neutro' && p.id !== 'pastel')));
    if (!current || palette.cover !== current.covering?.color || finish !== current.covering?.style) break;
  }
  // em bolo de andares, cobertura e recheio têm de aguentar peso: nada de creme mole
  const types = live(getCovering, recipe.types).filter((id) => tiers === 1 || !getCovering(id).soft);
  const type = rnd(types.length ? types : ['buttercream']);

  const popular = (id) => (getFlavor(id).popular ? 2 : 1);
  const flavors = live(getFlavor, recipe.flavors || (recipe.dark ? DARK_FLAVORS : Object.keys(PAIRINGS)));
  const main = recipe.flavors || recipe.dark ? rnd(flavors) : weighted(flavors.map((id) => [id, popular(id)]));
  const partners = live(getFlavor, DUOS[main] || []);
  const second = partners.length && rng() < 0.25 ? rnd(partners) : main;
  const layers = Array.from({ length: count }, (_, i) => (i % 2 ? second : main));
  const firmOnly = tiers > 1 || count >= 4;
  const okFill = (id) => isLive(getFilling(id)) && !(firmOnly && getFilling(id).soft);
  let fillPool = (PAIRINGS[main] || []).filter(okFill);
  if (second !== main) {
    const both = fillPool.filter((id) => (PAIRINGS[second] || []).includes(id));
    if (both.length) fillPool = both;
  }
  if (!fillPool.length) fillPool = ['brigadeiro', 'ninho'].filter(okFill);
  const fillA = rnd(fillPool);
  const fillB = rng() < 0.5 ? rnd(fillPool) : fillA;
  const fillings = Array.from({ length: count - 1 }, (_, i) => (i % 2 ? fillB : fillA));
  const fillAdds = fillings.map(() => '');
  if (rng() < 0.2) {
    const at = fillings.findIndex((id) => ADDS[id]);
    const add = at >= 0 ? rnd(live(getFillAdd, ADDS[fillings[at]])) : '';
    if (add) fillings.forEach((id, i) => id === fillings[at] && (fillAdds[i] = add));
  }

  const style = rnd(live(getPiping, recipe.piping)) || 'liso';
  const places = pipingPlaces(style);
  const where = recipe.where && places.includes(recipe.where) ? recipe.where : places.length ? weighted([['top', 5], ['base', 2], ['both', 3]].filter(([p]) => places.includes(p))) : 'top';
  const [items, opts] = decorSet(rnd(recipe.decor));
  const dripOn = rng() < recipe.drip;
  const base = normalizeConfig({
    ...keep,
    shape: weighted([['round', 6], ['square', 1], ['heart', 1], ['hex', 1], ['rect', 0.8], ['oval', 1], ['flor', 1]].filter(([id]) => isLive(getShape(id)))),
    layers,
    fillings,
    fillAdds,
    soak: recipe.soak && isLive(getSoak(recipe.soak)) ? recipe.soak : '',
    covering: {
      type,
      color: recipe.color || (recipe.dark ? (type === 'ganache' ? '#3a1a08' : '#6b3f22') : palette.cover),
      style: finish,
      color2: recipe.two && palette.cover2 === palette.cover ? '#ffffff' : palette.cover2,
      trim: recipe.trim ? rnd(live(getTrim, asList(recipe.trim))) || 'castanha' : 'castanha',
    },
    drip: { on: dripOn, color: palette.drip, amount: weighted([['media', 5], ['pouca', 2], ['farta', 2]]), length: weighted([['media', 4], ['curta', 1]]) },
    piping: { style, where, color: palette.piping },
    decor: { items, opts, candles: 3 + Math.floor(rng() * 5), candleStyle: rnd(live(getCandleStyle, SURPRISE_CANDLES)) || 'classica', candlePalette: rnd(['colorida', 'pastel', 'dourada', 'branca']), message: '' },
  });
  // as cores das decorações vêm da mesma paleta
  const tinted = applyPalette(base, recipe.dark ? { ...palette, cover: base.covering.color, cover2: base.covering.color2 } : palette);
  tinted.covering = base.covering;
  // de vez em quando, um tema pronto por cima de um bolo liso (o tema traz o bico e as peças dele)
  const themes = live(getTheme, SURPRISE_THEMES);
  if (!recipe.dark && finish === 'liso' && getCovering(type).kind === 'firm' && themes.length && rng() < 0.35) {
    return done(applyTheme({ ...tinted, drip: { ...tinted.drip, on: false } }, rnd(themes)));
  }
  return done(tinted);
}

/** ['flores:centro', 'ouro'] → [['flores', 'ouro'], { flores: { arr: 'centro' } }], só com o que está à venda. */
function decorSet(set) {
  const items = [];
  const opts = {};
  set.forEach((entry) => {
    const [id, arr] = entry.split(':');
    if (!isLive(getDecor(id))) return;
    items.push(id);
    if (arr) opts[id] = { arr };
  });
  return [items, opts];
}
