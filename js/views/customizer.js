// BOLAB — "Monte seu bolo": personalizador 3D em 7 etapas.
// A tela só orquestra: as opções vêm de js/data/customizer.js, preço e resumo de js/customizer/pricing.js
// e o desenho 3D de js/customizer/engine.js. Nada aqui redesenha a tela inteira: cada mudança
// atualiza o painel no lugar e chama cake.setConfig().
//
// Entradas pelo endereço:  ?bolo=<id salvo>  ·  ?base=<id do produto>  ·  ?linha=<id da linha do carrinho>
// (esta última abre o bolo que já está no carrinho para editar; o botão final vira "Salvar alterações").
import { html, raw, icon, money, dateLong, on, toast, openDialog, confirmDialog, debounce, confetti } from '../ui.js';
import { qtyStepper } from '../components.js';
import { cart, savedCakes, prefs, schedule } from '../store.js';
import { navigate } from '../router.js';
import { SITE } from '../data/site.js';
import {
  SIZES,
  SHAPES,
  FLAVORS,
  FILLINGS,
  COVERINGS,
  COLORS,
  DRIP_COLORS,
  PIPINGS,
  PIPING_PLACES,
  DECORS,
  MESSAGE_IDEAS,
  MAX_LAYERS,
  MAX_DECORS,
  MAX_CANDLES,
  MESSAGE_MAX,
  MESSAGE_PRICE,
  DRIP_PRICE,
  getFlavor,
  getFilling,
  getCovering,
  colorName,
} from '../data/customizer.js';
import {
  defaultConfig,
  normalizeConfig,
  cleanMessage,
  breakdownOf,
  priceOf,
  minPrice,
  deltaOf,
  sizeOf,
  servesOf,
  prepHoursOf,
  partsOf,
  summaryOf,
  autoName,
  displayName,
} from '../customizer/pricing.js';
import { PRESETS, getPreset, presetForProduct, randomConfig } from '../customizer/presets.js';
import { createCakeScene } from '../customizer/engine.js';
import { drawCake2D, thumb2D } from '../customizer/fallback.js';

const STEPS = [
  { id: 'formato', label: 'Formato', title: 'Formato e tamanho', sub: 'Comece pela base: o formato e quantas fatias você precisa.' },
  { id: 'massa', label: 'Massa', title: 'Escolha a massa', sub: 'Quantas camadas e qual sabor em cada uma.' },
  { id: 'recheio', label: 'Recheio', title: 'Agora, o recheio', sub: 'O que vai entre uma camada e outra.' },
  { id: 'cobertura', label: 'Cobertura', title: 'Cobertura', sub: 'O tipo, a cor e, se quiser, aquela calda escorrendo.' },
  { id: 'acabamento', label: 'Acabamento', title: 'Acabamento', sub: 'O confeitado de bico que contorna o bolo.' },
  { id: 'decoracao', label: 'Decoração', title: 'Decoração', sub: 'Os toques finais. Combine até 3.' },
  { id: 'resumo', label: 'Resumo', title: 'Seu bolo está pronto', sub: 'Confira e peça: a gente começa a fazer assim que você fechar o pedido.' },
];
const STEP_INDEX = Object.fromEntries(STEPS.map((s, i) => [s.id, i]));
const AUTO_CUT_STEPS = new Set(['massa', 'recheio']);
const THUMBS_VERSION = 'v7';

/** Recheio sugerido quando o bolo ganha a primeira camada extra. */
const FIRST_FILLING = { baunilha: 'morango', chocolate: 'brigadeiro', redvelvet: 'ninho', cenoura: 'brigadeiro', limao: 'limao', morango: 'ninho' };

// miniaturas das inspirações: geradas uma vez pelo próprio motor 3D e reaproveitadas
const presetThumbs = new Map();

/* ───────── Ilustrações próprias (traço, no estilo dos ícones do site) ───────── */
const art = (body, { vb = 48, sw = 2.4 } = {}) =>
  raw(`<svg viewBox="0 0 ${vb} ${vb}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`);
const SOFT = 'fill="currentColor" fill-opacity=".14"';

const SHAPE_ART = {
  round: art(`<circle cx="24" cy="24" r="16" ${SOFT}/>`),
  square: art(`<rect x="9" y="9" width="30" height="30" rx="7" ${SOFT}/>`),
  rect: art(`<rect x="4" y="13" width="40" height="22" rx="7" ${SOFT}/>`),
  heart: art(`<path d="M24 40C11 31 6 23 6 16.5a9 9 0 0 1 18-2.6 9 9 0 0 1 18 2.6C42 23 37 31 24 40Z" ${SOFT}/>`),
};

const PIPING_ART = {
  liso: art(`<path d="M8 36V24a5 5 0 0 1 5-5h22a5 5 0 0 1 5 5v12" ${SOFT}/><path d="M5 36h38"/>`),
  bolinhas: art(`<path d="M5 36h38"/><path d="M7 36a6 6 0 0 1 4-9.6c.5-1.6 1-2.8 2-3.9 1 1.100 1.500 2.300 2 3.900a6 6 0 0 1 4 9.600Z" ${SOFT}/><path d="M22 36a6 6 0 0 1 4-9.600c.5-1.600 1-2.800 2-3.900 1 1.100 1.500 2.300 2 3.900a6 6 0 0 1 4 9.600Z" ${SOFT}/><path d="M36.500 36a6 6 0 0 1 2.500-8.800"/>`),
  conchas: art(`<path d="M5 36h38"/><path d="M6 36c-1-7 3-12 9-12 4 0 7 3 7 7 0 3-2 5-5 5Z" ${SOFT}/><path d="M22 36c-1-7 3-12 9-12 4 0 7 3 7 7 0 3-2 5-5 5Z" ${SOFT}/><path d="M10 31c2-2 5-2 7 0M26 31c2-2 5-2 7 0"/>`),
  estrelas: art(`<path d="M5 38h38"/><path d="m13 14 2.200 5.800 6.200.3-4.900 3.900 1.700 6-5.200-3.400L7.800 30l1.700-6-4.900-3.900 6.200-.3Z" ${SOFT}/><path d="m33 16 1.900 5 5.400.300-4.200 3.400 1.400 5.200-4.500-2.900-4.500 2.900 1.400-5.200-4.200-3.400 5.400-.300Z" ${SOFT}/>`),
  rosetas: art(`<circle cx="24" cy="24" r="16" ${SOFT}/><path d="M24 24a3 3 0 1 1 3 3 6.500 6.500 0 1 1-6.500-6.500A10.500 10.500 0 1 1 31 31.500"/>`),
  folhas: art(`<path d="M5 38h38"/><path d="M24 36c-6-5-7-13 0-22 7 9 6 17 0 22Z" ${SOFT}/><path d="M24 36V22"/><path d="M11 36c-5-2-7-7-5-13 6 1 9 6 7 12Z" ${SOFT}/><path d="M37 36c5-2 7-7 5-13-6 1-9 6-7 12Z" ${SOFT}/>`),
};

const ico = (body) => art(body, { vb: 24, sw: 1.9 });
const DECOR_ART = {
  frutas: ico(`<path d="M12 21.500c-4.600-1.600-7.200-5.200-7.200-9.200A4.300 4.300 0 0 1 9.100 8h5.800a4.300 4.300 0 0 1 4.300 4.300c0 4-2.600 7.600-7.200 9.200Z" ${SOFT}/><path d="M12 8V5.200M12 8 9 5.500M12 8l3-2.500M12 5.200c.2-1.400 1-2.300 2.400-2.700"/><path d="M9.300 12.500h.01M14.700 12.500h.01M12 15.800h.01"/>`),
  flores: ico(`<circle cx="12" cy="12" r="2.300"/>${[0, 72, 144, 216, 288].map((a) => `<path transform="rotate(${a} 12 12)" d="M12 9.700c-2.300-1.700-2.600-4.900 0-7 2.600 2.100 2.300 5.300 0 7Z" ${SOFT}/>`).join('')}`),
  raspas: ico(`<path d="M3.500 16c0-5.800 4-10.500 9.500-10.500 4.700 0 8 3.300 8 7.500 0 3.800-2.800 6.500-6.300 6.500-3 0-5.200-2.200-5.200-4.900 0-2.300 1.700-4.100 3.900-4.100 1.800 0 3.100 1.300 3.100 3" /><path d="M3.500 16c0 1.500.6 2.800 1.500 3.500"/>`),
  granulado: ico(`<path d="m5 7 3-2M14 5l3.200 1.200M19 11l-1.200 3M4.500 13l2.800 1.600M10 10.500l3 .8M9 18.500l3-1.500M16 19l2.500-2M13.500 14.800l1 2.600"/>`),
  confete: ico(`<circle cx="6" cy="7" r="1.600" fill="currentColor"/><circle cx="17.500" cy="5.500" r="1.200"/><circle cx="12" cy="12" r="1.800" ${SOFT}/><circle cx="19" cy="13.500" r="1.500" fill="currentColor"/><circle cx="6.500" cy="16.500" r="1.400"/><circle cx="14" cy="19" r="1.600" fill="currentColor"/><path d="m10.500 4.500 1.500 1M4 11.500l1.200.8M17 17.500l1.300 1"/>`),
  perolas: ico(`<circle cx="7.500" cy="14.500" r="4.500" ${SOFT}/><circle cx="16.500" cy="8.500" r="3.500" ${SOFT}/><circle cx="17" cy="17.500" r="2.300"/><path d="M5.800 12.800c.5-.6 1.100-.9 1.800-1M15.200 7.300c.4-.4.800-.6 1.300-.7"/>`),
  velas: ico(`<rect x="9.500" y="10" width="5" height="11.500" rx="1.600" ${SOFT}/><path d="M12 10V8.300"/><path d="M12 2.500c1.700 1.600 2.200 2.700 2.200 3.700a2.200 2.200 0 0 1-4.400 0c0-1 .5-2.100 2.200-3.700Z"/><path d="m9.500 14 5-2M9.500 18l5-2"/>`),
  topo: ico(`<path d="m12 2.500 2.100 4.300 4.700.7-3.400 3.300.8 4.700-4.200-2.200-4.200 2.200.8-4.700-3.400-3.300 4.700-.7Z" ${SOFT}/><path d="M12 13.300v8.200"/>`),
};

const ICON = {
  chef: ico(`<path d="M6 13.900A4 4 0 0 1 7.400 6.100a5 5 0 0 1 9.200 0A4 4 0 0 1 18 13.900V19a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1Z"/><path d="M6 17h12"/>`),
  slice: ico(`<circle cx="9" cy="7" r="2"/><path d="M7.200 7.900 3 11v9c0 .6.4 1 1 1h16c.6 0 1-.4 1-1v-9c0-2-3-6-7-8l-3.600 2.600"/><path d="M16 13H3"/><path d="M16 17H3"/>`),
  spin: ico(`<path d="M16.500 7.500C15.600 4.200 14 2 12 2 9.200 2 7 6.500 7 12s2.200 10 5 10c.3 0 .7-.1 1-.2"/><path d="m15.200 13.700 3.800 1.900-1.900 3.800"/><path d="M19 15.600c-1.800.9-4.300 1.400-7 1.400-5.500 0-10-2.200-10-5s4.500-5 10-5c4.800 0 8.900 1.700 9.800 4"/>`),
  swipe: ico(`<polyline points="18 8 22 12 18 16"/><polyline points="6 8 2 12 6 16"/><line x1="2" x2="22" y1="12" y2="12"/>`),
};

/* ───────── Dica da chef ───────── */
function tipFor(stepId, c) {
  const n = c.layers.length;
  const main = c.layers[n - 1];
  if (stepId === 'formato') {
    if (c.shape === 'heart') return 'O coração é o preferido para aniversário de namoro e Dia das Mães. Fica um charme com flores de açúcar.';
    if (c.shape === 'rect') return 'O retangular é o mais prático para festa grande: as fatias saem todas do mesmo tamanho.';
    if (c.shape === 'square') return 'O quadrado tem cara de confeitaria moderna e combina muito com acabamento em bolinhas.';
    if (c.size === 'g') return 'Festa grande? O G serve até 30 fatias. Se sobrar, o bolo dura bem 3 dias na geladeira.';
    return 'Na dúvida do tamanho, conte uma fatia por convidado e mais algumas para quem repetir.';
  }
  if (stepId === 'massa') {
    if (n === 1) return 'Com uma camada só, o bolo fica baixinho e sem recheio. Para o corte ficar bonito, a gente indica 2 ou 3 camadas.';
    if (n === 4) return 'Quatro camadas dão aquele bolo alto de vitrine. Fica lindo com calda escorrendo.';
    const tips = {
      baunilha: 'A baunilha é coringa: combina com qualquer recheio, dos frutados aos de chocolate.',
      chocolate: 'Nossa massa de chocolate leva cacau 70%. Com brigadeiro ou framboesa, não tem erro.',
      redvelvet: 'Red velvet pede um recheio claro, como o de ninho, para o vermelho aparecer bem no corte.',
      cenoura: 'Cenoura com brigadeiro é paixão nacional. Com doce de leite também fica uma delícia.',
      limao: 'A massa de limão é levinha. Com recheio de limão ou de coco, fica bem refrescante.',
      morango: 'A massa de morango tem um rosa lindo. Com recheio de ninho, lembra morango com leite.',
    };
    return tips[main] || tips.baunilha;
  }
  if (stepId === 'recheio') {
    if (n === 1) return 'Uma camada a mais já garante um recheio generoso. Dá para mudar o número de camadas quando quiser.';
    const f = c.fillings[c.fillings.length - 1];
    const tips = {
      brigadeiro: 'Nosso brigadeiro é feito na panela, no ponto cremoso. É o recheio mais pedido da casa.',
      ninho: 'Ninho combina com tudo e deixa o corte clarinho. Com morango, vira o clássico da casa.',
      morango: 'A geleia de morango é feita aqui, com pedaços da fruta. Com ninho fica perfeita.',
      docedeleite: 'Doce de leite com massa de baunilha ou de cenoura: simples e impossível de errar.',
      limao: 'A mousse de limão quebra o doce da cobertura. Ótima pedida para dias quentes.',
      maracuja: 'Maracujá tem aquele azedinho que equilibra coberturas mais doces, como a de chocolate.',
      nutella: 'Nutella é intensa: uma camada só já perfuma o bolo inteiro.',
      coco: 'Coco com massa de chocolate vira prestígio. Com massa de limão, fica surpreendente.',
      framboesa: 'A framboesa é levemente ácida e faz um par elegante com chocolate.',
    };
    return n > 2 ? `${tips[f] || ''} Com ${n} camadas, você pode alternar dois recheios.`.trim() : tips[f] || tips.brigadeiro;
  }
  if (stepId === 'cobertura') {
    if (c.drip.on) return 'A calda fica mais bonita quando contrasta com a cobertura: escura no bolo claro, clara no bolo escuro.';
    const tips = {
      buttercream: 'O buttercream segura bem o formato e as cores. É o melhor para bolos que vão ficar expostos na mesa.',
      chantilly: 'O chantilly é o mais leve de todos. Mantenha o bolo na geladeira até a hora do parabéns.',
      ganache: 'A ganache dá aquele brilho de chocolate nobre. Com frutas vermelhas por cima, fica sofisticada.',
      glace: 'O glacê espelhado reflete a luz como vidro. Fica lindo em tons fortes e com pérolas.',
      chocolate: 'Cobertura cremosa de brigadeiro, espatulada à mão. Peça com granulado para o clássico completo.',
      mousse: 'A mousse tem acabamento aveludado e sabor suave. Combina com tons pastel.',
      naked: 'No naked, a massa e o recheio aparecem. Capriche nas frutas ou nas flores por cima.',
    };
    return tips[c.covering.type];
  }
  if (stepId === 'acabamento') {
    const tips = {
      liso: 'Liso é elegante por si só, ainda mais com calda escorrendo ou flores. Menos é mais.',
      bolinhas: 'As bolinhas ficam delicadas no topo e na base. Em branco, combinam com qualquer cobertura.',
      conchas: 'A borda de conchas é o acabamento clássico de confeitaria, perfeita para bolos tradicionais.',
      estrelas: 'As pitangas em estrela dão um ar de festa. Experimente em uma cor diferente da cobertura.',
      rosetas: 'As rosetas são generosas e chamam atenção. No topo, já fazem as vezes de decoração.',
      folhas: 'As folhinhas formam uma guirlanda. Em verde, com flores de açúcar, ficam encantadoras.',
    };
    return tips[c.piping.style];
  }
  if (stepId === 'decoracao') {
    const items = c.decor.items;
    if (items.length >= MAX_DECORS) return 'Três decorações é o nosso limite para o bolo não ficar carregado. Para trocar, tire uma primeiro.';
    if (items.includes('velas') && !c.decor.message) return 'Que tal uma plaquinha com o nome de quem faz aniversário? É só escrever a mensagem logo abaixo.';
    if (items.includes('frutas') && !items.includes('flores')) return 'As frutas vão frescas, colocadas no dia da entrega. Com flores de açúcar, o bolo ganha cara de casamento.';
    if (!items.length) return 'Sem decoração também é uma escolha: o acabamento e a cor já falam por si. Se quiser, comece pelas frutas.';
    return 'Decorações de tipos diferentes combinam melhor: uma no centro, uma em volta e um detalhe como pérolas ou confete.';
  }
  return 'O dia e o horário da entrega você escolhe ao fechar o pedido.';
}

/* ───────── Pedaços do painel ───────── */
/** "R$ 123" quando o valor é redondo (frases), "R$ 122,55" quando não é. */
const brl = (v) => money(v).replace(/,00$/, '');

/** Primeira data de entrega possível para este bolo, por extenso e em minúsculas. */
const firstDate = (c) => dateLong(schedule.earliest(prepHoursOf(c))).toLowerCase();

function isLight(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.7;
}

/** "+ R$ 12,40" (com "por camada" quando o valor se repete em cada camada) ou "incluso". */
function priceTag(value, per = '') {
  if (!(value > 0)) return html`<span class="cz-opt__price is-free">incluso</span>`;
  return html`<span class="cz-opt__price"><b>+ ${money(value)}</b>${per ? html` <small>${per}</small>` : ''}</span>`;
}

function optCard({ set, value, on: isOn, name, desc = '', price = null, artwork = '', tile = false, role = 'radio', act = '', disabled = false }) {
  return html`<button
    type="button"
    class="cz-opt ${tile ? 'cz-opt--tile' : ''} ${isOn ? 'is-on' : ''} ${disabled ? 'is-off' : ''}"
    role="${role}"
    aria-checked="${isOn ? 'true' : 'false'}"
    ${act ? raw(`data-act="${act}"`) : raw(`data-set="${set}"`)}
    data-value="${value}"
    data-k="${set || act}:${value}"
  >
    ${artwork}
    <span class="cz-opt__body">
      <span class="cz-opt__name">${name}</span>
      ${desc ? html`<span class="cz-opt__desc">${desc}</span>` : ''}
      ${price}
    </span>
    <span class="cz-opt__check">${icon('check')}</span>
  </button>`;
}

function colorPicker(set, current, colors, label) {
  return html`<div class="cz-colors" role="radiogroup" aria-label="${label}">
      ${colors.map((c) => {
        const isOn = c.hex === current;
        return html`<button
          type="button"
          class="cz-color ${isOn ? 'is-on' : ''} ${isLight(c.hex) ? 'is-light' : ''}"
          style="--c:${c.hex}"
          role="radio"
          aria-checked="${isOn ? 'true' : 'false'}"
          aria-label="${c.name}"
          title="${c.name}"
          data-set="${set}"
          data-value="${c.hex}"
          data-k="${set}:${c.hex}"
        >
          ${icon('check')}
        </button>`;
      })}
    </div>
    <p class="cz-colorname">${colorName(current)}</p>`;
}

function segmented(set, current, options, label) {
  return html`<div class="cz-seg" role="radiogroup" aria-label="${label}">
    ${options.map(
      (o) => html`<button type="button" role="radio" aria-checked="${o.id === current ? 'true' : 'false'}" data-set="${set}" data-value="${o.id}" data-k="${set}:${o.id}">${o.name}</button>`,
    )}
  </div>`;
}

/** Dica da chef: no celular fica recolhida em uma linha (toque para abrir); no computador, sempre aberta. */
function tipBox(stepId, c, open) {
  return html`<aside class="cz-tip ${open ? 'is-open' : ''}">
    <button type="button" class="cz-tip__btn" data-act="tip" aria-expanded="${open ? 'true' : 'false'}" data-k="tip:toggle">
      <span class="cz-tip__icon">${ICON.chef}</span>
      <span class="cz-tip__body"><strong>Dica da chef</strong><span class="cz-tip__text">${tipFor(stepId, c)}</span></span>
      <span class="cz-tip__chev">${icon('chevron-down')}</span>
    </button>
  </aside>`;
}

/** Título da etapa: só no computador (no celular, o chip escuro da etapa já diz onde a pessoa está). */
function stepHead(i) {
  const s = STEPS[i];
  return html`<header class="cz-head">
    <span class="eyebrow">Etapa ${i + 1} de ${STEPS.length}</span>
    <h2>${s.title}</h2>
    <p>${s.sub}</p>
  </header>`;
}

const ordinal = (n) => `${n}ª`;

/* ───────── Etapas ───────── */
function stepFormato(c, ui) {
  const price = priceOf(c);
  const min = minPrice();
  return html`
    <p class="cz-anchor">
      ${price > min
        ? html`Este modelo sai por <strong>${brl(price)}</strong>. Bolos a partir de <strong>${brl(min)}</strong>.`
        : html`Este é o nosso bolo mais em conta: <strong>${brl(min)}</strong>.`}
    </p>

    <section class="cz-sec cz-sec--presets">
      <div class="cz-sec__head">
        <h3>Inspirações</h3>
        <button type="button" class="cz-linkbtn cz-linkbtn--solid" data-act="surprise">${icon('shuffle')} Surpreenda-me</button>
      </div>
      <div class="cz-presets" role="group" aria-label="Inspirações para começar">
        <button type="button" class="cz-preset cz-preset--surprise" data-act="surprise" aria-label="Surpreenda-me: montar um bolo surpresa">
          <span class="cz-preset__img">${icon('shuffle')}</span>
          <span class="cz-preset__text"><strong>Surpreenda-me</strong></span>
        </button>
        ${PRESETS.map(
          (p) => html`<button type="button" class="cz-preset" data-act="preset" data-value="${p.id}" aria-label="Começar pela inspiração ${p.name}: ${p.tag}">
            <span class="cz-preset__img" data-thumb="${p.id}">
              ${presetThumbs.has(p.id) ? html`<img src="${presetThumbs.get(p.id)}" alt="" width="136" height="136" />` : icon('cake')}
            </span>
            <span class="cz-preset__text"><strong>${p.name}</strong><span>${p.tag}</span></span>
          </button>`,
        )}
      </div>
    </section>

    <section class="cz-sec">
      <div class="cz-sec__head"><h3>Formato</h3></div>
      <div class="cz-grid cz-grid--4" role="radiogroup" aria-label="Formato do bolo">
        ${SHAPES.map((s) =>
          optCard({
            set: 'shape',
            value: s.id,
            on: c.shape === s.id,
            name: s.name,
            price: priceTag(deltaOf(c, s.price)),
            artwork: html`<span class="cz-opt__art">${SHAPE_ART[s.id]}</span>`,
            tile: true,
          }),
        )}
      </div>
    </section>

    <section class="cz-sec">
      <div class="cz-sec__head"><h3>Tamanho</h3><span class="cz-sec__note">${sizeOf(c).hint}</span></div>
      <div class="cz-grid cz-grid--3" role="radiogroup" aria-label="Tamanho do bolo">
        ${SIZES.map((s) =>
          optCard({
            set: 'size',
            value: s.id,
            on: c.size === s.id,
            name: s.diameter,
            desc: s.serves,
            price: html`<span class="cz-opt__price"><b>${money(priceOf({ ...c, size: s.id }))}</b></span>`,
            artwork: html`<span class="cz-opt__big">${s.label}</span>`,
            tile: true,
          }),
        )}
      </div>
    </section>

    ${tipBox('formato', c, ui.tipOpen)}
  `;
}

function stepMassa(c, ui) {
  const n = c.layers.length;
  const each = ui.flavorMode === 'each' && n > 1;
  const active = each ? Math.min(ui.layer, n - 1) : n - 1;
  const current = c.layers[active];
  const per = !each && n > 1 ? 'por camada' : '';
  return html`
    <section class="cz-sec">
      <div class="cz-row">
        <div class="cz-row__text">
          <strong>Camadas de massa</strong>
          <span>${n === 1 ? 'Bolo baixinho, sem recheio' : `${n} camadas e ${n - 1} ${n - 1 === 1 ? 'recheio' : 'recheios'}`}</span>
        </div>
        ${qtyStepper(n, { min: 1, max: MAX_LAYERS, id: 'layers' })}
      </div>
    </section>

    <section class="cz-sec">
      ${n > 1 ? segmented('flavorMode', each ? 'each' : 'all', [{ id: 'all', name: 'Um só sabor' }, { id: 'each', name: 'Um por camada' }], 'Como escolher o sabor da massa') : ''}
      ${each
        ? html`<div class="cz-stack" role="radiogroup" aria-label="Camada que você está editando">
            ${c.layers
              .map((id, i) => {
                const f = getFlavor(id);
                const where = i === n - 1 ? ' (topo)' : i === 0 ? ' (base)' : '';
                return html`<button type="button" class="cz-layer ${i === active ? 'is-on' : ''}" role="radio" aria-checked="${i === active ? 'true' : 'false'}" data-set="layer" data-value="${i}" data-k="layer:${i}">
                  <i class="cz-swatch cz-swatch--crumb" style="--c:${f.color}"></i>
                  <span>${ordinal(i + 1)} camada${where}</span>
                  <strong>${f.name}</strong>
                  ${icon(i === active ? 'edit' : 'chevron-right')}
                </button>`;
              })
              .reverse()}
          </div>`
        : ''}
    </section>

    <section class="cz-sec">
      <div class="cz-sec__head">
        <h3>${each ? `Sabor da ${ordinal(active + 1)} camada` : 'Sabor da massa'}</h3>
      </div>
      <div class="cz-grid cz-grid--2" role="radiogroup" aria-label="Sabor da massa">
        ${FLAVORS.map((f) =>
          optCard({
            set: 'flavor',
            value: f.id,
            on: each ? current === f.id : c.layers.every((x) => x === f.id),
            name: f.name,
            desc: f.desc,
            price: priceTag(deltaOf(c, f.price), per),
            artwork: html`<i class="cz-swatch cz-swatch--crumb" style="--c:${f.color}"></i>`,
          }),
        )}
      </div>
    </section>
  `;
}

function stepRecheio(c, ui) {
  const gaps = c.fillings.length;
  if (!gaps) {
    return html`<div class="cz-empty">
      <span class="cz-empty__art">${icon('layers')}</span>
      <h3>Bolo de uma camada não leva recheio</h3>
      <p>Para rechear, o bolo precisa de pelo menos duas camadas de massa. Quer adicionar mais uma?</p>
      <button type="button" class="btn" data-act="add-layer">${icon('plus')} Adicionar uma camada</button>
      <button type="button" class="cz-linkbtn" data-act="next">Seguir sem recheio</button>
    </div>`;
  }
  const each = ui.fillMode === 'each' && gaps > 1;
  const active = each ? Math.min(ui.gap, gaps - 1) : gaps - 1;
  const current = c.fillings[active];
  const per = !each && gaps > 1 ? 'por camada' : '';
  return html`
    <section class="cz-sec">
      ${gaps > 1 ? segmented('fillMode', each ? 'each' : 'all', [{ id: 'all', name: 'Um só recheio' }, { id: 'each', name: 'Um por camada' }], 'Como escolher o recheio') : ''}
      ${each
        ? html`<div class="cz-stack" role="radiogroup" aria-label="Recheio que você está editando">
            ${c.fillings
              .map((id, i) => {
                const f = getFilling(id);
                return html`<button type="button" class="cz-layer cz-layer--fill ${i === active ? 'is-on' : ''}" role="radio" aria-checked="${i === active ? 'true' : 'false'}" data-set="gap" data-value="${i}" data-k="gap:${i}">
                  <i class="cz-swatch" style="--c:${f.color}"></i>
                  <span>Entre a ${ordinal(i + 1)} e a ${ordinal(i + 2)} camada</span>
                  <strong>${f.name}</strong>
                  ${icon(i === active ? 'edit' : 'chevron-right')}
                </button>`;
              })
              .reverse()}
          </div>`
        : ''}
    </section>

    <section class="cz-sec">
      <div class="cz-sec__head">
        <h3>${each ? `Recheio entre a ${ordinal(active + 1)} e a ${ordinal(active + 2)} camada` : 'Sabor do recheio'}</h3>
      </div>
      <div class="cz-grid cz-grid--2" role="radiogroup" aria-label="Sabor do recheio">
        ${FILLINGS.map((f) =>
          optCard({
            set: 'filling',
            value: f.id,
            on: each ? current === f.id : c.fillings.every((x) => x === f.id),
            name: f.name,
            desc: f.desc,
            price: priceTag(deltaOf(c, f.price), per),
            artwork: html`<i class="cz-swatch ${f.gloss > 0.5 ? 'cz-swatch--gloss' : 'cz-swatch--satin'}" style="--c:${f.color}"></i>`,
          }),
        )}
      </div>
    </section>
  `;
}

const FINISH_SWATCH = { brilhante: 'cz-swatch--gloss', espelhado: 'cz-swatch--gloss', acetinado: 'cz-swatch--satin', cremoso: 'cz-swatch--satin', fosco: '', aveludado: '', rústico: 'cz-swatch--naked' };

function stepCobertura(c, ui) {
  const naked = c.covering.type === 'naked';
  const dripList = ui.moreDrip || !DRIP_COLORS.includes(c.drip.color) ? COLORS : COLORS.filter((x) => DRIP_COLORS.includes(x.hex));
  return html`
    <section class="cz-sec">
      <div class="cz-sec__head"><h3>Tipo de cobertura</h3></div>
      <div class="cz-grid cz-grid--2" role="radiogroup" aria-label="Tipo de cobertura">
        ${COVERINGS.map((k) =>
          optCard({
            set: 'covering',
            value: k.id,
            on: c.covering.type === k.id,
            name: k.name,
            desc: k.desc,
            price: priceTag(deltaOf(c, k.price)),
            artwork: html`<i class="cz-swatch ${FINISH_SWATCH[k.finish] || ''}" style="--c:${ui.colorChosen || c.covering.type === k.id ? c.covering.color : k.defaultColor}"></i>`,
          }),
        )}
      </div>
    </section>

    <section class="cz-sec">
      <div class="cz-sec__head"><h3>${naked ? 'Cor do creme do topo' : 'Cor da cobertura'}</h3></div>
      ${colorPicker('coveringColor', c.covering.color, COLORS, naked ? 'Cor do creme do topo' : 'Cor da cobertura')}
    </section>

    <section class="cz-sec">
      <button type="button" class="cz-switch" role="switch" aria-checked="${c.drip.on ? 'true' : 'false'}" data-act="drip" data-k="drip:toggle">
        <span class="cz-switch__knob"></span>
        <span class="cz-opt__body">
          <span class="cz-opt__name">Calda escorrendo <span class="cz-optional">(opcional)</span></span>
          <span class="cz-opt__desc">Aquele efeito de calda descendo pela borda</span>
        </span>
        <span class="cz-opt__price"><b>+ ${money(deltaOf(c, DRIP_PRICE))}</b></span>
      </button>
      ${c.drip.on
        ? html`<div class="cz-sub">
            <span class="cz-sub__label">Cor da calda</span>
            ${colorPicker('dripColor', c.drip.color, dripList, 'Cor da calda')}
            ${dripList.length < COLORS.length ? html`<button type="button" class="cz-linkbtn cz-linkbtn--inset" data-act="more-drip">${icon('palette')} Ver todas as cores</button>` : ''}
          </div>`
        : ''}
    </section>
  `;
}

function stepAcabamento(c) {
  const none = c.piping.style === 'liso';
  return html`
    <section class="cz-sec">
      <div class="cz-sec__head"><h3>Estilo do bico</h3></div>
      <div class="cz-grid cz-grid--3" role="radiogroup" aria-label="Estilo do acabamento">
        ${PIPINGS.map((p) =>
          optCard({
            set: 'pipingStyle',
            value: p.id,
            on: c.piping.style === p.id,
            name: p.name,
            price: priceTag(deltaOf(c, p.price)),
            artwork: html`<span class="cz-opt__art">${PIPING_ART[p.id]}</span>`,
            tile: true,
          }),
        )}
      </div>
    </section>
    ${none
      ? ''
      : html`
          <section class="cz-sec">
            <div class="cz-sec__head"><h3>Onde aplicar</h3></div>
            ${segmented('pipingWhere', c.piping.where, PIPING_PLACES, 'Onde aplicar o acabamento')}
          </section>
          <section class="cz-sec">
            <div class="cz-sec__head"><h3>Cor do acabamento</h3></div>
            ${colorPicker('pipingColor', c.piping.color, COLORS, 'Cor do acabamento')}
          </section>
        `}
  `;
}

function stepDecoracao(c) {
  const items = c.decor.items;
  const full = items.length >= MAX_DECORS;
  return html`
    <section class="cz-sec">
      <div class="cz-sec__head">
        <h3>Decorações <span class="cz-optional">(opcional)</span></h3>
        ${items.length ? html`<button type="button" class="cz-linkbtn" data-act="clear-decor">Tirar todas</button>` : html`<span class="cz-sec__note">Escolha até ${MAX_DECORS}</span>`}
      </div>
      <div class="cz-grid cz-grid--2" role="group" aria-label="Decorações do bolo: ${items.length} de ${MAX_DECORS} escolhidas">
        ${DECORS.map((d) => {
          const isOn = items.includes(d.id);
          return optCard({
            act: 'decor',
            value: d.id,
            on: isOn,
            name: d.name,
            desc: d.id === 'velas' && isOn ? `${c.decor.candles} ${c.decor.candles === 1 ? 'vela' : 'velas'}` : d.desc,
            price: html`<span class="cz-opt__price"><b>+ ${money(deltaOf(c, d.price, d.scales))}</b></span>`,
            artwork: html`<span class="cz-opt__art">${DECOR_ART[d.id]}</span>`,
            role: 'checkbox',
            disabled: full && !isOn,
          });
        })}
      </div>
      ${items.includes('velas')
        ? html`<div class="cz-row cz-row--gap">
            <div class="cz-row__text"><strong>Quantas velas?</strong><span>De 1 a ${MAX_CANDLES}, coloridas e listradas</span></div>
            ${qtyStepper(c.decor.candles, { min: 1, max: MAX_CANDLES, id: 'candles' })}
          </div>`
        : ''}
    </section>

    <section class="cz-sec">
      <div class="cz-field">
        <div class="cz-field__top">
          <label for="cz-message">Plaquinha com mensagem <span class="cz-optional">(opcional)</span></label>
          <span class="cz-field__price">+ ${money(MESSAGE_PRICE)}</span>
        </div>
        <input class="input" id="cz-message" type="text" maxlength="${MESSAGE_MAX}" placeholder="Ex.: Parabéns, Ana!" value="${c.decor.message}" data-field="message" autocomplete="off" enterkeyhint="done" aria-describedby="cz-message-count" />
        <div class="cz-field__foot">
          <span>A plaquinha aparece no bolo enquanto você escreve.</span>
          <span id="cz-message-count" data-count="message">${c.decor.message.length}/${MESSAGE_MAX}</span>
        </div>
        <div class="cz-ideas" aria-label="Sugestões de mensagem">
          ${MESSAGE_IDEAS.map((m) => html`<button type="button" data-act="idea" data-value="${m}">${m}</button>`)}
          <button type="button" class="cz-ideas__clear" data-act="idea" data-value="" data-clear-message ${c.decor.message ? '' : raw('hidden')}>Sem plaquinha</button>
        </div>
      </div>
    </section>
  `;
}

function billLines(c) {
  const b = breakdownOf(c);
  return html`
    ${b.lines.map((l) => html`<div class="cz-bill__line"><span>${l.label}${l.detail ? html`<small>${l.detail}</small>` : ''}</span><b>${money(l.value)}</b></div>`)}
    <div class="cz-bill__total"><span>Total</span><strong>${money(b.total)}</strong></div>
    <p class="cz-bill__note">ou ${money(b.total * (1 - SITE.pix.discountPct / 100))} no Pix (${SITE.pix.discountPct}% de desconto)</p>
  `;
}

/** Nome do bolo no resumo: título com "renomear" ou, durante a edição, o campo de texto. */
function nameBox(c, renaming) {
  if (renaming) {
    return html`<label class="sr-only" for="cz-name">Nome do bolo (opcional)</label>
      <input class="input cz-offer__input" id="cz-name" type="text" maxlength="40" placeholder="${autoName(c)}" value="${c.name}" data-field="name" autocomplete="off" enterkeyhint="done" />`;
  }
  return html`<h2>${displayName(c)}</h2>
    <button type="button" class="cz-rename" data-act="rename" data-k="rename:toggle">${icon('edit')} renomear</button>`;
}

/** Linha de pagamento da oferta: "ou R$ 256,69 no Pix · até 6x sem juros". */
function payLine(total) {
  const { maxInstallments, minInstallment } = SITE.card;
  const parcels = Math.max(1, Math.min(maxInstallments, Math.floor(total / minInstallment)));
  return html`ou <strong>${money(total * (1 - SITE.pix.discountPct / 100))}</strong> no Pix${parcels > 1 ? ` · até ${parcels}x sem juros` : ' · ou no cartão'}`;
}

/** Etapa final: a revelação. Nome, preço e entrega no alto; os detalhes ficam a um toque. */
function stepResumo(c, ui) {
  const parts = partsOf(c);
  const rows = [
    { step: 'formato', iconName: 'cube', label: 'Formato e tamanho', text: parts.formato },
    { step: 'massa', iconName: 'layers', label: 'Massa', text: parts.massa },
    { step: 'recheio', iconName: 'utensils', label: 'Recheio', text: parts.recheio },
    { step: 'cobertura', iconName: 'palette', label: 'Cobertura', text: parts.cobertura },
    { step: 'acabamento', iconName: 'wand', label: 'Acabamento', text: parts.acabamento },
    { step: 'decoracao', iconName: 'sparkles', label: 'Decoração', text: parts.decoracao },
  ];
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const total = priceOf(c);
  return html`
    <header class="cz-offer">
      ${ui.editing
        ? html`<span class="badge badge--gold">${icon('edit')} Editando o bolo do carrinho</span>`
        : html`<span class="eyebrow">${icon('sparkles')} Seu bolo está pronto</span>`}
      <div class="cz-offer__name" data-cz-namebox>${nameBox(c, ui.renaming)}</div>
      <div class="cz-offer__price"><strong data-cz-price>${money(total)}</strong></div>
      <p class="cz-offer__pay" data-cz-pay>${payLine(total)}</p>
      <p class="cz-offer__ship">${icon('calendar')}<span>Rende ${sizeOf(c).serves} · receba a partir de <strong>${firstDate(c)}</strong></span></p>
      <p class="cz-offer__sub">Confira e peça: a gente começa a fazer assim que você fechar o pedido.</p>
    </header>

    <div class="cz-sum">
      ${rows.map(
        (r) => html`<button type="button" class="cz-sum__row" data-act="goto" data-value="${r.step}" aria-label="Editar ${r.label}: ${r.text}">
          <span class="cz-sum__icon">${icon(r.iconName)}</span>
          <span class="cz-sum__text"><small>${r.label}</small><span>${cap(r.text)}</span></span>
          <span class="cz-sum__edit">${icon('edit')} Editar</span>
        </button>`,
      )}
    </div>

    <div class="cz-after">
      <button type="button" class="cz-linkbtn cz-linkbtn--solid" data-act="breakdown">${icon('receipt')} Ver detalhes do preço</button>
      <div class="cz-quiet" role="group" aria-label="Guardar ou mostrar este bolo">
        <button type="button" class="cz-quiet__btn" data-act="save" aria-pressed="${ui.savedId ? 'true' : 'false'}" data-k="save:toggle" aria-label="${ui.savedId ? 'Tirar dos favoritos' : 'Salvar nos favoritos'}" title="${ui.savedId ? 'Salvo nos favoritos' : 'Salvar nos favoritos'}">${icon('heart')}<span>${ui.savedId ? 'Salvo' : 'Salvar'}</span></button>
        <button type="button" class="cz-quiet__btn" data-act="share" aria-label="Enviar a foto do bolo" title="Enviar a foto do bolo">${icon('share')}<span>Enviar</span></button>
        <button type="button" class="cz-quiet__btn" data-act="download" aria-label="Baixar a foto do bolo" title="Baixar a foto do bolo">${icon('download')}<span>Baixar</span></button>
      </div>
    </div>
    <p class="cz-trust">${icon('shield-check')}<span>Garantia BOLAB: se o seu bolo não chegar perfeito, a gente refaz ou devolve o dinheiro. O dia e o horário da entrega você escolhe ao fechar o pedido.</span></p>
  `;
}

function renderStep(i, c, ui) {
  const id = STEPS[i].id;
  if (id === 'resumo') return stepResumo(c, ui);
  if (id === 'formato') return html`${stepHead(i)}${stepFormato(c, ui)}`;
  const body = id === 'massa' ? stepMassa(c, ui) : id === 'recheio' ? stepRecheio(c, ui) : id === 'cobertura' ? stepCobertura(c, ui) : id === 'acabamento' ? stepAcabamento(c) : stepDecoracao(c);
  return html`${stepHead(i)}${tipBox(id, c, ui.tipOpen)}${body}`;
}

function stepChips(current, c, visited) {
  return STEPS.map((s, i) => {
    const skip = s.id === 'recheio' && c.layers.length === 1;
    const done = i < current || (visited.has(i) && i !== current);
    return html`<button
      type="button"
      class="cz-step ${i === current ? 'is-current' : ''} ${done ? 'is-done' : ''} ${skip ? 'is-skip' : ''}"
      data-act="goto"
      data-value="${s.id}"
      ${i === current ? raw('aria-current="step"') : ''}
      aria-label="Etapa ${i + 1}: ${s.label}${done ? ' (feita)' : ''}"
    >
      <span class="cz-step__n">${done ? icon('check') : i + 1}</span>${s.label}
    </button>`;
  });
}

/* ───────── Tela ───────── */
export default {
  title: 'Monte seu bolo em 3D',
  layout: 'immersive',

  render() {
    return html`
      <div class="cz" data-cz data-step="formato">
        <section class="cz-stage" aria-label="Seu bolo em 3D">
          <header class="cz-top">
            <button type="button" class="cz-round" data-back="/" aria-label="Voltar para a loja">${icon('arrow-left')}</button>
            <div class="cz-brand">
              <a class="cz-brand__mark" href="#/" aria-label="BOLAB — página inicial"><img src="assets/logo-mark.webp" alt="" width="28" height="43" /></a>
              <div class="cz-brand__text"><h1>Monte seu bolo</h1><span data-cz-name></span></div>
            </div>
            <button type="button" class="cz-restart" data-act="restart" aria-label="Recomeçar do zero" title="Recomeçar do zero">${icon('refresh')}<span>Recomeçar</span></button>
            <button type="button" class="cz-price" data-act="breakdown" aria-label="Ver detalhes do preço">
              <small>Total</small><strong data-cz-price></strong><span class="cz-price__more">${icon('chevron-down')}</span>
            </button>
          </header>

          <canvas class="cz-canvas" data-cz-canvas tabindex="0" role="img" aria-label="Visualização 3D do seu bolo. Arraste para girar; use as setas do teclado para girar e os botões ao lado para ver por dentro."></canvas>
          <div class="cz-loading" data-cz-loading><img src="assets/logo-mark.webp" alt="" width="44" height="68" /><span>Preparando o seu bolo…</span></div>
          <div class="cz-fallback" data-cz-fallback hidden>
            <canvas width="520" height="520" aria-hidden="true"></canvas>
            <p>Seu aparelho não conseguiu abrir a visualização 3D, então mostramos um desenho. Pode montar à vontade: o bolo sai do forno exatamente como você escolher.</p>
          </div>
          <div class="cz-lost" data-cz-lost hidden><span>Recarregando a visualização…</span></div>

          <div class="cz-hint" data-cz-hint>${ICON.swipe} Arraste para girar</div>
          <div class="cz-meta" data-cz-meta></div>
          <div class="cz-tools" data-cz-tools>
            <button type="button" class="cz-tool cz-tool--label" data-act="cutaway" aria-pressed="false" aria-label="Ver por dentro" title="Ver por dentro">${ICON.slice}<span>Ver por dentro</span></button>
            <button type="button" class="cz-tool cz-tool--icon" data-act="rotate" aria-pressed="false" aria-label="Giro automático" title="Giro automático">${ICON.spin}</button>
            <button type="button" class="cz-tool" data-act="reset" aria-label="Centralizar o bolo" title="Centralizar">${icon('expand')}</button>
          </div>
        </section>

        <section class="cz-panel" aria-label="Opções do bolo">
          <nav class="cz-steps" data-cz-steps aria-label="Etapas"></nav>
          <div class="cz-body" data-cz-body tabindex="-1"></div>
          <footer class="cz-foot" data-cz-foot></footer>
        </section>
        <div class="sr-only" aria-live="polite" data-cz-live></div>
      </div>
    `;
  },

  mount(root, ctx) {
    const $ = (sel) => root.querySelector(sel);
    const el = {
      cz: $('[data-cz]'),
      canvas: $('[data-cz-canvas]'),
      steps: $('[data-cz-steps]'),
      body: $('[data-cz-body]'),
      foot: $('[data-cz-foot]'),
      meta: $('[data-cz-meta]'),
      name: $('[data-cz-name]'),
      hint: $('[data-cz-hint]'),
      tools: $('[data-cz-tools]'),
      fallback: $('[data-cz-fallback]'),
      lost: $('[data-cz-lost]'),
      loading: $('[data-cz-loading]'),
      live: $('[data-cz-live]'),
    };
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const desktop = window.matchMedia('(min-width: 900px)');
    const timers = new Set();
    const later = (fn, ms) => {
      const t = setTimeout(() => {
        timers.delete(t);
        fn();
      }, ms);
      timers.add(t);
      return t;
    };
    let alive = true;

    /* ── estado ── */
    let config = defaultConfig();
    let step = 0;
    let editLineId = null; // editando um bolo que já está no carrinho (?linha=<id>)
    const visited = new Set([0]);
    const ui = { flavorMode: 'all', fillMode: 'all', layer: 0, gap: 0, moreDrip: false, colorChosen: false, tipOpen: false, renaming: false, editing: false, celebrated: false, savedId: null, savedKey: '' };
    let cake = null;
    let cutaway = false;
    let autoCut = true; // enquanto a pessoa não mexer no botão, o corte abre sozinho nas etapas de massa e recheio
    let rotating = !reduceMotion && prefs.get('customizerRotate', true) !== false;
    let shownPrice = null;
    let priceAnim = 0;

    const configKey = () => JSON.stringify(config);
    const clone = (o) => JSON.parse(JSON.stringify(o));

    function syncModes() {
      ui.flavorMode = config.layers.every((x) => x === config.layers[0]) ? 'all' : 'each';
      ui.fillMode = config.fillings.every((x) => x === config.fillings[0]) ? 'all' : 'each';
      ui.layer = config.layers.length - 1;
      ui.gap = Math.max(0, config.fillings.length - 1);
      ui.colorChosen = config.covering.color !== getCovering(config.covering.type).defaultColor;
    }

    /**
     * Ponto de partida: bolo do carrinho (?linha=), bolo salvo (?bolo=), produto do cardápio (?base=)
     * ou o rascunho guardado.
     */
    function loadInitial(query) {
      editLineId = null;
      ui.editing = false;
      if (query.linha) {
        const line = cart.line(query.linha);
        if (line?.kind === 'custom' && line.config) {
          config = normalizeConfig(line.config);
          if (!config.name && line.name && line.name !== autoName(config)) config.name = String(line.name).slice(0, 40);
          editLineId = line.lineId;
          ui.editing = true;
          step = STEP_INDEX.resumo;
          return 'line';
        }
        toast('Esse bolo não está mais no carrinho. Que tal montar um novo?');
      }
      if (query.bolo) {
        const saved = savedCakes.get(query.bolo);
        if (saved?.config) {
          config = normalizeConfig({ ...saved.config, name: saved.config.name || saved.name || '' });
          ui.savedId = saved.id;
          ui.savedKey = configKey();
          step = STEP_INDEX.resumo;
          return 'saved';
        }
        toast('Não encontramos esse bolo salvo. Que tal criar um novo?');
      }
      if (query.base) {
        const preset = presetForProduct(query.base);
        if (preset) {
          config = preset;
          step = 0;
          return 'base';
        }
      }
      const draft = prefs.get('customizerDraft');
      if (draft) {
        config = normalizeConfig(draft);
        step = Math.max(0, Math.min(STEPS.length - 1, Number(prefs.get('customizerStep', 0)) || 0));
        return 'draft';
      }
      return 'new';
    }

    const origin = loadInitial(ctx.query || {});
    syncModes();
    for (let i = 0; i <= step; i++) visited.add(i);

    /** Guarda o rascunho — menos quando a pessoa está editando um bolo do carrinho. */
    function storeDraft() {
      if (editLineId) return;
      prefs.set('customizerDraft', config);
      prefs.set('customizerStep', Math.max(0, step));
    }
    const saveDraft = debounce(() => alive && storeDraft(), 350);

    /* ── 3D ── */
    /** Espaço que os botões flutuantes ocupam no palco e quanto do resto o bolo pode preencher. */
    const stageInsets = () => (desktop.matches ? { top: 4, bottom: 84, fill: 0.78 } : { top: 14, bottom: 58, fill: 0.9 });

    function makeThumb(size = 360) {
      try {
        const url = cake?.snapshot({ size, quality: 0.8, fill: 0.86 });
        if (url && url.length > 200) return url;
      } catch (err) {
        console.error('[personalizador] falha ao fotografar o bolo', err);
      }
      return thumb2D(config, size);
    }

    function useFallback() {
      cake = null;
      el.cz.classList.add('is-flat', 'is-ready');
      el.canvas.hidden = true;
      el.tools.hidden = true;
      el.hint.hidden = true;
      el.loading.hidden = true;
      el.fallback.hidden = false;
      drawCake2D(el.fallback.querySelector('canvas'), config, { background: false });
    }

    function sceneUpdate() {
      if (cake) cake.setConfig(config);
      else drawCake2D(el.fallback.querySelector('canvas'), config, { background: false });
    }
    const sceneUpdateSoon = debounce(() => alive && sceneUpdate(), 220);

    function setCutaway(on, manual) {
      cutaway = on;
      if (manual) autoCut = false;
      cake?.setCutaway(on);
      const btn = el.tools.querySelector('[data-act="cutaway"]');
      const label = on ? 'Fechar o bolo' : 'Ver por dentro';
      btn.setAttribute('aria-pressed', String(on));
      btn.setAttribute('aria-label', label); // no celular estreito o texto some: o nome continua existindo
      btn.title = label;
      btn.querySelector('span').textContent = label;
    }

    function setRotating(on, remember) {
      rotating = on && !reduceMotion;
      cake?.setAutoRotate(rotating);
      el.tools.querySelector('[data-act="rotate"]').setAttribute('aria-pressed', String(rotating));
      if (remember) prefs.set('customizerRotate', rotating);
    }

    function fillPresetThumbs() {
      root.querySelectorAll('[data-thumb]').forEach((slot) => {
        const url = presetThumbs.get(slot.dataset.thumb);
        if (url && !slot.querySelector('img')) slot.innerHTML = String(html`<img src="${url}" alt="" width="136" height="136" />`);
      });
    }

    function preparePresetThumbs() {
      if (presetThumbs.size >= PRESETS.length) return;
      const cached = prefs.get('customizerThumbs');
      if (cached?.v === THUMBS_VERSION && cached.items) {
        Object.entries(cached.items).forEach(([id, url]) => presetThumbs.set(id, url));
        if (presetThumbs.size >= PRESETS.length) return;
      }
      PRESETS.forEach((p) => {
        if (presetThumbs.has(p.id)) return;
        try {
          const url = cake ? cake.thumbOf(p.config, { size: 200, quality: 0.78, fill: 0.88 }) : thumb2D(p.config, 200);
          if (url) presetThumbs.set(p.id, url);
        } catch (err) {
          console.error('[personalizador] miniatura da inspiração', p.id, err);
        }
      });
      if (cake) prefs.set('customizerThumbs', { v: THUMBS_VERSION, items: Object.fromEntries(presetThumbs) });
    }

    function startScene() {
      try {
        cake = createCakeScene(el.canvas, {
          insets: stageInsets,
          onInteract: hideHint,
          onContextLost: () => (el.lost.hidden = false),
          onContextRestored: () => {
            el.lost.hidden = true;
            cake?.setConfig(config, { instant: true });
          },
        });
      } catch (err) {
        console.warn('[personalizador] 3D indisponível, usando desenho 2D:', err?.message || err);
        useFallback();
        preparePresetThumbs();
        fillPresetThumbs();
        return;
      }
      // um quadro para a tela aparecer; depois monta as miniaturas e o bolo da pessoa
      requestAnimationFrame(() => {
        if (!alive) return;
        try {
          preparePresetThumbs();
          fillPresetThumbs();
          cake.setConfig(config, { instant: true });
          cake.setView(viewFor(step), { animate: false });
          cake.playIntro();
          cake.setAutoRotate(rotating);
          if (AUTO_CUT_STEPS.has(STEPS[step].id) && autoCut) later(() => alive && autoCut && setCutaway(true), 900);
        } catch (err) {
          console.error('[personalizador] falha ao montar a cena 3D', err);
          cake?.dispose();
          useFallback();
        }
        el.cz.classList.add('is-ready');
        if (cake && !prefs.get('customizerHintSeen')) {
          later(() => el.hint.classList.add('is-on'), 900);
          later(hideHint, 7000);
        }
      });
      // a plaquinha usa a fonte da marca: se ela chegar depois, refaz o texto
      document.fonts?.load?.('italic 700 40px "Playfair Display"').then(() => alive && cake?.refreshText()).catch(() => {});
    }

    function hideHint() {
      if (!el.hint.classList.contains('is-on')) return;
      el.hint.classList.remove('is-on');
      prefs.set('customizerHintSeen', true);
    }

    const viewFor = (i) => (['acabamento', 'decoracao'].includes(STEPS[i].id) ? 'top' : 'default');

    /* ── desenho do painel ── */
    function renderSteps() {
      el.steps.innerHTML = String(html`${stepChips(step, config, visited)}`);
      const cur = el.steps.querySelector('.is-current');
      if (cur) {
        const target = cur.offsetLeft - (el.steps.clientWidth - cur.offsetWidth) / 2;
        el.steps.scrollTo({ left: Math.max(0, target), behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    }

    function renderBody({ still = false } = {}) {
      const keepScroll = still ? el.body.scrollTop : 0;
      const focusKey = still ? document.activeElement?.closest?.('[data-k]')?.dataset.k : null;
      el.body.classList.toggle('is-still', still);
      el.body.innerHTML = String(renderStep(step, config, ui));
      el.body.scrollTop = keepScroll;
      if (focusKey) el.body.querySelector(`[data-k="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
    }

    function renderNameBox() {
      const box = root.querySelector('[data-cz-namebox]');
      if (box) box.innerHTML = String(nameBox(config, ui.renaming));
    }

    function renderFoot() {
      const last = step === STEPS.length - 1;
      el.foot.innerHTML = String(html`
        ${step > 0 ? html`<button type="button" class="cz-prev" data-act="prev" aria-label="Voltar uma etapa" ${last ? raw('data-last') : ''}>${icon('arrow-left')}<span>Voltar</span></button>` : ''}
        <button type="button" class="cz-total" data-act="breakdown" aria-label="Ver detalhes do preço">
          <small>Total ${icon('chevron-up')}</small><strong data-cz-price>${money(shownPrice ?? priceOf(config))}</strong>
        </button>
        ${last
          ? html`<button type="button" class="btn cz-next" data-act="add">${icon(editLineId ? 'check' : 'bag')} ${editLineId ? 'Salvar alterações' : 'Adicionar ao carrinho'}</button>`
          : html`<button type="button" class="btn cz-next" data-act="next">${step === STEPS.length - 2 ? 'Ver resumo' : 'Continuar'} ${icon('arrow-right')}</button>`}
      `);
    }

    function renderMeta() {
      el.meta.innerHTML = String(html`<span>${icon('users')} ${sizeOf(config).serves}</span><span>${icon('calendar')} Receba a partir de ${firstDate(config)}</span>`);
      el.name.textContent = editLineId ? 'Editando o bolo do carrinho' : displayName(config);
    }

    function setPriceText(value) {
      root.querySelectorAll('[data-cz-price]').forEach((n) => (n.textContent = money(value)));
    }

    function updatePrice() {
      const target = priceOf(config);
      if (shownPrice === null || reduceMotion) {
        shownPrice = target;
        setPriceText(target);
        return;
      }
      if (Math.abs(target - shownPrice) < 0.005) return;
      const from = shownPrice;
      const t0 = performance.now();
      cancelAnimationFrame(priceAnim);
      root.querySelectorAll('[data-cz-price]').forEach((n) => {
        n.classList.remove('is-bump');
        void n.offsetWidth;
        n.classList.add('is-bump');
      });
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / 420);
        shownPrice = from + (target - from) * (1 - (1 - k) ** 3);
        if (k >= 1) shownPrice = target;
        setPriceText(shownPrice);
        if (k < 1) priceAnim = requestAnimationFrame(tick);
      };
      priceAnim = requestAnimationFrame(tick);
      el.live.textContent = `Total: ${money(target)}`;
    }

    /** Depois de qualquer escolha: valida, atualiza 3D, preço, painel e guarda o rascunho. */
    function commit({ rerender = true, scene = 'now' } = {}) {
      config = normalizeConfig(config);
      if (ui.savedId && ui.savedKey !== configKey()) ui.savedId = null; // mudou depois de salvar: vira um bolo novo
      if (scene === 'now') sceneUpdate();
      else if (scene === 'soon') sceneUpdateSoon();
      updatePrice();
      renderMeta();
      if (rerender) {
        renderBody({ still: true });
        renderSteps();
        // o painel refeito nasce com o preço final; o número animado segue por cima
        if (shownPrice !== null) setPriceText(shownPrice);
      }
      saveDraft();
    }

    /** A revelação do resumo: bolo fechado, uma volta completa e (uma única vez) confete. */
    function reveal() {
      if (cutaway) setCutaway(false, false);
      if (!cake) return;
      cake.playIntro();
      cake.spin();
      if (!ui.celebrated && !editLineId) {
        ui.celebrated = true;
        later(() => alive && STEPS[step]?.id === 'resumo' && confetti({ count: 80 }), 500);
      }
    }

    function goto(i, { focus = true } = {}) {
      const next = Math.max(0, Math.min(STEPS.length - 1, i));
      if (next === step) return;
      step = next;
      visited.add(step);
      ui.tipOpen = false;
      ui.renaming = false;
      const id = STEPS[step].id;
      el.cz.dataset.step = id;
      renderSteps();
      renderBody();
      renderFoot();
      if (focus) el.body.focus({ preventScroll: true });
      cake?.focusPlaque(false);
      cake?.setView(viewFor(step));
      if (id === 'resumo') reveal();
      else if (autoCut) {
        const want = AUTO_CUT_STEPS.has(id);
        if (want !== cutaway) setCutaway(want, false);
      }
      saveDraft();
    }

    /**
     * Troca o bolo inteiro (inspiração, surpresa, recomeço). Com `undo`, o aviso leva um "Desfazer"
     * que devolve o bolo anterior.
     */
    function replaceConfig(next, { keepSize = false, message = '', undo = false } = {}) {
      const before = undo ? { config: clone(config), savedId: ui.savedId, savedKey: ui.savedKey } : null;
      const size = config.size;
      config = normalizeConfig(next);
      if (keepSize) config.size = size;
      ui.savedId = null;
      syncModes();
      commit();
      renderFoot();
      if (!message) return;
      toast(message, {
        type: 'success',
        duration: before ? 7000 : 3200,
        action: before
          ? {
              label: 'Desfazer',
              onClick: () => {
                if (!alive) return;
                config = normalizeConfig(before.config);
                ui.savedId = before.savedId;
                ui.savedKey = before.savedKey;
                syncModes();
                commit();
                renderFoot();
              },
            }
          : undefined,
      });
    }

    /* ── ações finais ── */
    function cakePayload() {
      return {
        name: displayName(config),
        price: priceOf(config),
        thumb: makeThumb(360),
        config: clone(config),
        summary: summaryOf(config),
      };
    }

    function addToCart() {
      const p = cakePayload();
      const extra = { serves: servesOf(config), prepHours: prepHoursOf(config) };
      if (editLineId) {
        // editando um bolo do carrinho: atualiza a mesma linha e volta para lá
        const updated = cart.replaceCustom(editLineId, { ...p, ...extra });
        if (!updated) cart.addCustom({ ...p, ...extra });
        navigate('/carrinho');
        toast(updated ? 'Bolo atualizado no carrinho' : 'Seu bolo foi para o carrinho', { type: 'success' });
        return;
      }
      cart.addCustom({ ...p, ...extra });
      el.live.textContent = `${p.name} foi para o carrinho`;
      const dlg = openDialog({
        title: 'Está no carrinho!',
        body: html`<div class="cz-added">
          <img src="${p.thumb}" alt="Seu bolo personalizado" width="104" height="104" />
          <div>
            <h3>${p.name}</h3>
            <p>${servesOf(config)}</p>
            <p>Receba a partir de ${firstDate(config)}</p>
            <div class="price">${money(p.price)}</div>
          </div>
        </div>`,
        footer: html`
          <button type="button" class="btn btn--secondary cz-fit" data-go="/cardapio">Continuar comprando</button>
          <button type="button" class="btn cz-fit" data-go="/carrinho">Ver carrinho</button>
        `,
      });
      dlg.el.querySelector('[data-go="/carrinho"]')?.focus({ preventScroll: true });
      dlg.el.addEventListener('click', (ev) => {
        const go = ev.target.closest('[data-go]')?.dataset.go;
        if (go) navigate(go);
      });
    }

    function toggleSave() {
      if (ui.savedId) {
        savedCakes.remove(ui.savedId);
        ui.savedId = null;
        toast('Removido dos seus favoritos');
      } else {
        const item = savedCakes.add({ ...cakePayload(), serves: servesOf(config), prepHours: prepHoursOf(config) });
        ui.savedId = item.id;
        ui.savedKey = configKey();
        toast('Bolo salvo nos seus favoritos', { type: 'success', action: { label: 'Ver', href: '#/favoritos' } });
      }
      if (STEPS[step].id === 'resumo') renderBody({ still: true });
    }

    function loadImage(src) {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      });
    }

    /** Foto para compartilhar: o bolo em destaque, com a marca e o nome. */
    async function makePoster() {
      const W = 1080;
      const H = 1350;
      let shot = null;
      try {
        shot = cake?.snapshotCanvas({ width: W, height: H, scale: 1.5, fill: 0.7 });
      } catch (err) {
        console.error('[personalizador] falha ao gerar a foto', err);
      }
      const out = document.createElement('canvas');
      out.width = W;
      out.height = H;
      const g = out.getContext('2d');
      if (shot) g.drawImage(shot, 0, 0);
      else {
        const flat = document.createElement('canvas');
        flat.width = flat.height = W;
        drawCake2D(flat, config);
        g.fillStyle = '#fdeef2';
        g.fillRect(0, 0, W, H);
        g.drawImage(flat, 0, (H - W) / 2 - 60);
      }
      const logo = await loadImage('assets/logo.webp');
      if (logo) {
        const lw = 250;
        g.drawImage(logo, (W - lw) / 2, 54, lw, (lw * logo.height) / logo.width);
      }
      await document.fonts?.load?.('700 60px "Playfair Display"').catch(() => {});
      g.textAlign = 'center';
      g.fillStyle = '#2a1210';
      let fs = 64;
      const name = displayName(config);
      do {
        g.font = `700 ${fs}px "Playfair Display", Georgia, serif`;
        fs -= 3;
      } while (g.measureText(name).width > W - 140 && fs > 30);
      g.fillText(name, W / 2, H - 150);
      g.fillStyle = '#7a5060';
      g.font = '700 30px Nunito, system-ui, sans-serif';
      g.fillText(`${sizeOf(config).serves} · criado no personalizador 3D da BOLAB`, W / 2, H - 92);
      return out;
    }

    function download(canvas) {
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/jpeg', 0.9);
      a.download = 'meu-bolo-bolab.jpg';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    async function shareCake(directDownload) {
      const canvas = await makePoster();
      if (!alive) return;
      if (directDownload) {
        download(canvas);
        toast('Foto do bolo baixada', { type: 'success' });
        return;
      }
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
      const file = blob ? new File([blob], 'meu-bolo-bolab.jpg', { type: 'image/jpeg' }) : null;
      const canShare = Boolean(file && navigator.canShare?.({ files: [file] }));
      const dlg = openDialog({
        title: 'Mostre o seu bolo',
        body: html`<div class="cz-share">
          <img src="${canvas.toDataURL('image/jpeg', 0.8)}" alt="Foto do bolo ${displayName(config)}" />
          <p class="muted">Envie para a família, peça opinião ou guarde de recordação.</p>
        </div>`,
        footer: html`
          <button type="button" class="btn btn--secondary cz-fit" data-do="download">${icon('download')} Baixar foto</button>
          ${canShare ? html`<button type="button" class="btn cz-fit" data-do="share">${icon('share')} Compartilhar</button>` : ''}
        `,
      });
      dlg.el.addEventListener('click', async (ev) => {
        const what = ev.target.closest('[data-do]')?.dataset.do;
        if (what === 'download') {
          download(canvas);
          dlg.close();
          toast('Foto do bolo baixada', { type: 'success' });
        }
        if (what === 'share') {
          try {
            await navigator.share({ files: [file], title: displayName(config), text: 'Olha o bolo que eu montei na BOLAB!' });
          } catch {
            // a pessoa fechou a janela de compartilhar: tudo bem
          }
        }
      });
    }

    async function restart() {
      const ok = await confirmDialog({
        title: 'Recomeçar do zero?',
        message: 'O bolo volta para o modelo inicial e as escolhas feitas até aqui são apagadas.',
        confirmLabel: 'Recomeçar',
        cancelLabel: 'Continuar editando',
      });
      if (!ok || !alive) return;
      config = defaultConfig();
      ui.savedId = null;
      ui.moreDrip = false;
      syncModes();
      visited.clear();
      visited.add(0);
      autoCut = true;
      if (cutaway) setCutaway(false, false);
      step = -1;
      commit({ rerender: false });
      goto(0);
      cake?.resetView();
      toast('Tudo pronto para um bolo novo');
    }

    function showBreakdown() {
      openDialog({
        title: 'Detalhes do preço',
        body: html`<div class="cz-bill">${billLines(config)}</div>
          <p class="cz-trust">${icon('info')}<span>Os valores acompanham o tamanho ${sizeOf(config).label}. Velas, topo de festa e plaquinha têm preço fixo.</span></p>`,
        footer: html`<button type="button" class="btn btn--block" data-dialog-close>Entendi</button>`,
      });
    }

    /* ── escolhas ── */
    const setters = {
      shape: (v) => (config.shape = v),
      size: (v) => (config.size = v),
      flavorMode: (v) => {
        ui.flavorMode = v;
        if (v === 'all') config.layers = config.layers.map(() => config.layers[config.layers.length - 1]);
        ui.layer = config.layers.length - 1;
      },
      layer: (v) => (ui.layer = Number(v)),
      flavor: (v) => {
        if (ui.flavorMode === 'each' && config.layers.length > 1) config.layers[Math.min(ui.layer, config.layers.length - 1)] = v;
        else config.layers = config.layers.map(() => v);
      },
      fillMode: (v) => {
        ui.fillMode = v;
        if (v === 'all') config.fillings = config.fillings.map(() => config.fillings[config.fillings.length - 1]);
        ui.gap = Math.max(0, config.fillings.length - 1);
      },
      gap: (v) => (ui.gap = Number(v)),
      filling: (v) => {
        if (ui.fillMode === 'each' && config.fillings.length > 1) config.fillings[Math.min(ui.gap, config.fillings.length - 1)] = v;
        else config.fillings = config.fillings.map(() => v);
      },
      covering: (v) => {
        // a cor acompanha o tipo (ganache escura, chantilly branco…) até a pessoa escolher uma cor por conta própria
        config.covering.type = v;
        if (!ui.colorChosen) config.covering.color = getCovering(v).defaultColor;
      },
      coveringColor: (v) => {
        config.covering.color = v;
        ui.colorChosen = true;
      },
      dripColor: (v) => (config.drip.color = v),
      pipingStyle: (v) => (config.piping.style = v),
      pipingWhere: (v) => (config.piping.where = v),
      pipingColor: (v) => (config.piping.color = v),
    };

    function setLayers(n) {
      const cur = config.layers.length;
      if (n === cur) return;
      if (n > cur) {
        const top = config.layers[cur - 1];
        while (config.layers.length < n) {
          config.layers.push(top);
          config.fillings.push(config.fillings[config.fillings.length - 1] || FIRST_FILLING[top] || 'brigadeiro');
        }
      } else {
        config.layers.length = n;
        config.fillings.length = Math.max(0, n - 1);
      }
      ui.layer = Math.min(ui.layer, n - 1);
      ui.gap = Math.max(0, Math.min(ui.gap, n - 2));
      if (n === 1) ui.flavorMode = 'all';
    }

    function toggleDecor(id) {
      const items = config.decor.items;
      const i = items.indexOf(id);
      if (i >= 0) items.splice(i, 1);
      else if (items.length >= MAX_DECORS) {
        toast(`Dá para combinar até ${MAX_DECORS} decorações. Tire uma para trocar.`);
        return false;
      } else items.push(id);
      return true;
    }

    /** Mostra a plaquinha de frente por um instante (ao escolher uma mensagem pronta). */
    function peekPlaque() {
      if (!cake || !config.decor.message) return;
      cake.focusPlaque(true);
      later(() => alive && !root.querySelector('[data-field="message"]:focus') && cake?.focusPlaque(false), 2600);
    }

    const actions = {
      next() {
        let to = step + 1;
        if (STEPS[to]?.id === 'recheio' && config.layers.length === 1 && STEPS[step].id === 'massa') {
          to += 1;
          toast('Bolo de 1 camada não leva recheio. Pulamos essa etapa para você.');
        }
        goto(to);
      },
      prev() {
        let to = step - 1;
        if (STEPS[to]?.id === 'recheio' && config.layers.length === 1) to -= 1;
        goto(to);
      },
      goto: (v) => goto(STEP_INDEX[v] ?? 0),
      breakdown: showBreakdown,
      restart,
      cutaway: () => setCutaway(!cutaway, true),
      rotate: () => setRotating(!rotating, true),
      reset: () => cake?.resetView(),
      tip(_v, btn) {
        ui.tipOpen = !ui.tipOpen;
        const box = btn.closest('.cz-tip');
        box.classList.toggle('is-open', ui.tipOpen);
        btn.setAttribute('aria-expanded', String(ui.tipOpen));
      },
      surprise() {
        replaceConfig(randomConfig(config), { keepSize: true, undo: true, message: 'Bolo surpresa montado. Gostou?' });
        el.live.textContent = `Bolo surpresa: ${summaryOf(config).join('. ')}`;
      },
      preset(v) {
        const p = getPreset(v);
        if (p) replaceConfig(p.config, { keepSize: true, undo: true, message: `Inspiração “${p.name}” aplicada. Agora deixe do seu jeito!` });
      },
      'add-layer'() {
        setLayers(2);
        commit();
      },
      drip() {
        config.drip.on = !config.drip.on;
        commit();
      },
      'more-drip'() {
        ui.moreDrip = true;
        renderBody({ still: true });
      },
      decor(v) {
        if (toggleDecor(v)) commit();
      },
      'clear-decor'() {
        config.decor.items = [];
        commit();
      },
      idea(v) {
        config.decor.message = cleanMessage(v);
        commit();
        peekPlaque();
      },
      rename() {
        ui.renaming = true;
        renderNameBox();
        const input = root.querySelector('#cz-name');
        input?.focus();
        input?.select();
      },
      add: addToCart,
      save: toggleSave,
      share: () => shareCake(false),
      download: () => shareCake(true),
    };

    on(root, 'click', '[data-set]', (_ev, btn) => {
      const fn = setters[btn.dataset.set];
      if (!fn) return;
      fn(btn.dataset.value);
      commit();
    });

    on(root, 'click', '[data-act]', (_ev, btn) => {
      const fn = actions[btn.dataset.act];
      if (fn) fn(btn.dataset.value, btn);
    });

    root.addEventListener('qty', (ev) => {
      const id = ev.target.dataset.id;
      if (id === 'layers') setLayers(ev.detail);
      else if (id === 'candles') config.decor.candles = ev.detail;
      else return;
      commit();
    });

    /** O campo mostra exatamente o que será guardado (sem "<", ">" nem espaços repetidos). */
    function writeBack(input, clean) {
      const caret = clean(input.value.slice(0, input.selectionStart ?? input.value.length)).length;
      input.value = clean(input.value);
      try {
        input.setSelectionRange(caret, caret);
      } catch {
        // alguns teclados não deixam mover o cursor: tudo bem
      }
    }
    const cleanName = (v) => String(v).replace(/[<>]/g, '').replace(/^\s+/, '').slice(0, 40);

    on(root, 'input', '[data-field]', (_ev, input) => {
      if (input.dataset.field === 'message') {
        const had = Boolean(config.decor.message);
        if (input.value !== cleanMessage(input.value)) writeBack(input, cleanMessage);
        config.decor.message = cleanMessage(input.value);
        const count = root.querySelector('[data-count="message"]');
        if (count) count.textContent = `${config.decor.message.length}/${MESSAGE_MAX}`;
        const clear = root.querySelector('[data-clear-message]');
        if (clear) clear.hidden = !config.decor.message;
        commit({ rerender: false, scene: had === Boolean(config.decor.message) ? 'soon' : 'now' });
      } else if (input.dataset.field === 'name') {
        if (input.value !== cleanName(input.value)) writeBack(input, cleanName);
        config.name = cleanName(input.value);
        commit({ rerender: false, scene: 'none' });
      }
    });

    on(root, 'keydown', '[data-field]', (ev, input) => {
      if (ev.key === 'Enter') input.blur();
    });

    /* ── digitando: a câmera encara a plaquinha e a tela se ajusta ao teclado do celular ── */
    const vv = window.visualViewport;
    function syncKeyboard() {
      const typing = Boolean(root.querySelector('[data-field]:focus'));
      const open = typing && vv && vv.scale < 1.05 && window.innerHeight - vv.height > 140;
      el.cz.classList.toggle('is-typing', Boolean(open));
      if (open) {
        el.cz.style.setProperty('--cz-vh', `${Math.round(vv.height)}px`);
        el.cz.style.setProperty('--cz-vtop', `${Math.round(vv.offsetTop)}px`);
        root.querySelector('[data-field]:focus')?.scrollIntoView({ block: 'nearest' });
      } else {
        el.cz.style.removeProperty('--cz-vh');
        el.cz.style.removeProperty('--cz-vtop');
      }
    }
    vv?.addEventListener('resize', syncKeyboard);
    vv?.addEventListener('scroll', syncKeyboard);

    on(root, 'focusin', '[data-field]', (_ev, input) => {
      if (input.dataset.field === 'message') cake?.focusPlaque(true);
      syncKeyboard();
    });

    on(root, 'focusout', '[data-field]', (_ev, input) => {
      const field = input.dataset.field;
      later(() => {
        if (!alive) return;
        if (field === 'message' && !root.querySelector('[data-field="message"]:focus')) {
          cake?.focusPlaque(false);
          // espaço sobrando no fim não vira parte da mensagem
          if (config.decor.message !== config.decor.message.trim()) {
            config.decor.message = config.decor.message.trim();
            const box = root.querySelector('[data-field="message"]');
            if (box) box.value = config.decor.message;
            const count = root.querySelector('[data-count="message"]');
            if (count) count.textContent = `${config.decor.message.length}/${MESSAGE_MAX}`;
            commit({ rerender: false });
          }
        }
        if (field === 'name' && ui.renaming && !root.querySelector('[data-field="name"]:focus')) {
          ui.renaming = false;
          renderNameBox();
        }
        syncKeyboard();
      }, 60);
    });

    // ganchos de teste: só existem com ?czdebug no endereço (antes do #)
    if (new URLSearchParams(location.search).has('czdebug')) {
      window.__cz = { cake: () => cake, config: () => config, set: (next) => replaceConfig(next), goto };
    }

    /* ── primeira pintura ── */
    el.cz.dataset.step = STEPS[step].id;
    renderSteps();
    renderBody();
    renderFoot();
    renderMeta();
    updatePrice();
    setRotating(rotating, false);
    startScene();

    if (origin === 'base') toast('Partimos de um bolo do cardápio. Mude o que quiser!', { type: 'success' });
    if (origin === 'draft' && step > 0) toast('Continuando de onde você parou');

    // entrada por ?bolo= ou ?base=: depois de aplicar, tira o parâmetro do endereço (recarregar mantém o rascunho).
    // ?linha= fica: recarregar continua editando o bolo do carrinho.
    const q = ctx.query || {};
    if (origin !== 'line' && (q.bolo || q.base || q.linha)) {
      storeDraft();
      later(() => alive && navigate('/monte-seu-bolo', { replace: true }), 0);
    }

    root.__czLoad = (query) => {
      // outro bolo pedido com a tela já aberta (ex.: link de favorito ou "Editar bolo" do carrinho)
      if (!query?.bolo && !query?.base && !query?.linha) return;
      if (query.linha && query.linha === editLineId) return;
      const res = loadInitial(query);
      syncModes();
      commit({ rerender: false });
      const to = res === 'base' ? 0 : step;
      step = -1;
      goto(to);
      cake?.resetView();
      if (res !== 'line') later(() => alive && navigate('/monte-seu-bolo', { replace: true }), 0);
    };

    return () => {
      alive = false;
      storeDraft();
      vv?.removeEventListener('resize', syncKeyboard);
      vv?.removeEventListener('scroll', syncKeyboard);
      timers.forEach(clearTimeout);
      cancelAnimationFrame(priceAnim);
      try {
        cake?.dispose();
      } catch (err) {
        console.error('[personalizador] erro ao encerrar a cena', err);
      }
      cake = null;
    };
  },

  onQuery(root, ctx) {
    root.__czLoad?.(ctx.query);
  },
};
