// BOLAB — "Monte seu bolo": personalizador 3D em 7 etapas.
// A tela só orquestra: as opções vêm de js/data/customizer.js, preço e resumo de js/customizer/pricing.js
// e o desenho 3D de js/customizer/engine.js. Nada aqui redesenha a tela inteira: cada mudança
// atualiza o painel no lugar e chama cake.setConfig().
//
// Fluidez no celular: o toque só registra a escolha; no quadro seguinte o painel é atualizado no lugar
// (só o que mudou — ver morph) e, no outro, o bolo. Nada pesado roda dentro do toque.
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
  FINISHES,
  BASES,
  HEIGHTS,
  TIER_OPTIONS,
  QUANTITIES,
  ARRANGEMENTS,
  DECOR_GROUPS,
  DECOR_COLORS,
  CANDLE_STYLES,
  SCRIPTS,
  TOPPER_COLORS,
  TOPPER_MAX,
  TOPPER_PRICE,
  SCRIPT_PRICE,
  finishAllowed,
  getFinish,
  getDecor,
  getPiping,
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
  servesText,
  diametersOf,
  heightCmOf,
  coversOf,
  decorOptions,
} from '../customizer/pricing.js';
import { PRESETS, OCCASIONS, COLOR_PALETTES, applyPalette, getPreset, presetForProduct, randomConfig } from '../customizer/presets.js';
import { createCakeScene } from '../customizer/engine.js';
import { BACKDROPS, BACKDROP_AUTO, getBackdrop, resolveBackdrop, backdropCss } from '../customizer/backdrop.js';
import { drawCake2D, thumb2D } from '../customizer/fallback.js';

const STEPS = [
  { id: 'formato', label: 'Formato', title: 'Formato e tamanho', sub: 'Comece pela base: o formato e quantas fatias você precisa.' },
  { id: 'massa', label: 'Massa', title: 'Escolha a massa', sub: 'Quantas camadas e qual sabor em cada uma.' },
  { id: 'recheio', label: 'Recheio', title: 'Agora, o recheio', sub: 'O que vai entre uma camada e outra.' },
  { id: 'cobertura', label: 'Cobertura', title: 'Cobertura', sub: 'O tipo, a cor, o estilo e, se quiser, aquela calda escorrendo.' },
  { id: 'acabamento', label: 'Acabamento', title: 'Acabamento', sub: 'O confeitado de bico que contorna o bolo.' },
  { id: 'decoracao', label: 'Decoração', title: 'Decoração', sub: 'Os toques finais: enfeites, velas, mensagem e topo.' },
  { id: 'resumo', label: 'Resumo', title: 'Seu bolo está pronto', sub: 'Confira e peça: a gente começa a fazer assim que você fechar o pedido.' },
];
const STEP_INDEX = Object.fromEntries(STEPS.map((s, i) => [s.id, i]));
const AUTO_CUT_STEPS = new Set(['massa', 'recheio']);

/** Recheio sugerido quando o bolo ganha a primeira camada extra. */
const FIRST_FILLING = { baunilha: 'morango', chocolate: 'brigadeiro', redvelvet: 'ninho', cenoura: 'brigadeiro', limao: 'limao', morango: 'ninho' };

// miniaturas das inspirações: imagens prontas em assets/img/cz-<id>.webp (geradas pelo próprio motor 3D com
// tools/render_promos.mjs). Só são desenhadas na hora — e guardadas aqui — se o arquivo faltar.
const presetThumbs = new Map();

/**
 * Deixa `live` igual a `next` mexendo só no que mudou (classes, atributos, textos, trechos novos).
 * Os elementos que continuam iguais não são tocados: sem redesenho do painel inteiro, sem perder foco nem rolagem.
 */
function morph(live, next) {
  const a = live.childNodes;
  const b = next.childNodes;
  for (let i = 0; i < b.length; i++) {
    const to = b[i];
    const from = a[i];
    if (!from) {
      live.appendChild(to.cloneNode(true));
      continue;
    }
    const same = from.nodeType === to.nodeType && from.nodeName === to.nodeName && (from.nodeType !== 1 || (from.dataset?.k || '') === (to.dataset?.k || ''));
    if (!same) {
      live.replaceChild(to.cloneNode(true), from);
      continue;
    }
    if (from.nodeType !== 1) {
      if (from.data !== to.data) from.data = to.data;
      continue;
    }
    for (const at of to.attributes) if (from.getAttribute(at.name) !== at.value) from.setAttribute(at.name, at.value);
    for (const at of [...from.attributes]) if (!to.hasAttribute(at.name)) from.removeAttribute(at.name);
    if (from.nodeName === 'INPUT') {
      if (from !== document.activeElement && from.value !== to.value) from.value = to.value;
    } else if (from.nodeName === 'svg') {
      if (from.innerHTML !== to.innerHTML) from.innerHTML = to.innerHTML;
    } else morph(from, to);
  }
  while (a.length > b.length) live.removeChild(live.lastChild);
}

/* ───────── Ilustrações próprias (traço, no estilo dos ícones do site) ───────── */
const art = (body, { vb = 48, sw = 2.4 } = {}) =>
  raw(`<svg viewBox="0 0 ${vb} ${vb}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`);
const SOFT = 'fill="currentColor" fill-opacity=".14"';

const SHAPE_ART = {
  hex: art(`<path d="M14 7h20l10 17-10 17H14L4 24Z" ${SOFT}/>`),
  round: art(`<circle cx="24" cy="24" r="16" ${SOFT}/>`),
  square: art(`<rect x="9" y="9" width="30" height="30" rx="7" ${SOFT}/>`),
  rect: art(`<rect x="4" y="13" width="40" height="22" rx="7" ${SOFT}/>`),
  heart: art(`<path d="M24 40C11 31 6 23 6 16.5a9 9 0 0 1 18-2.6 9 9 0 0 1 18 2.6C42 23 37 31 24 40Z" ${SOFT}/>`),
};

const PIPING_ART = {
  perolao: art(`<path d="M5 38h38"/><circle cx="13" cy="29" r="8" ${SOFT}/><circle cx="33" cy="29" r="8" ${SOFT}/>`),
  corda: art(`<path d="M5 38h38"/><path d="M6 30c4-8 8 4 12-4s8 4 12-4 8 4 12-4" /><path d="M6 24c4 8 8-4 12 4s8-4 12 4 8-4 12 4"/>`),
  ziguezague: art(`<path d="M5 38h38"/><path d="m6 30 6-9 6 9 6-9 6 9 6-9 6 9" ${SOFT}/>`),
  babado: art(`<path d="M5 20h38"/><path d="M6 20c0 8 4 12 6 4 2 8 6 8 6 0 2 8 6 8 6 0 2 8 6 8 6 0 2 8 6 4 6-4" ${SOFT}/>`),
  vintage: art(`<path d="M5 12h38M5 40h38"/><path d="M6 14c4 12 14 12 18 0 4 12 14 12 18 0"/><path d="M21 15c-4-5-6 3 0 1M27 15c4-5 6 3 0 1" ${SOFT}/><circle cx="24" cy="15" r="1.600" fill="currentColor"/>`),
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
  morangos: ico(`<path d="M12 21c-4-2-6.500-5.500-6.500-9.500A3.500 3.500 0 0 1 9 8h6a3.500 3.500 0 0 1 3.500 3.500c0 4-2.500 7.500-6.500 9.500Z" ${SOFT}/><path d="M5.800 13.500c2 1.500 4-1 6.200.5s4-1.500 6.200 0"/><path d="M12 8V5M12 8 9.500 5.500M12 8l2.500-2.500"/>`),
  cerejas: ico(`<circle cx="8" cy="16.500" r="3.800" ${SOFT}/><circle cx="16.500" cy="15" r="3.800" ${SOFT}/><path d="M8 12.700C8.500 8 11 5 15 3.500M16.500 11.200c0-3.200-.5-5.700-1.500-7.700"/>`),
  margaridas: ico(`<circle cx="12" cy="12" r="2.200" fill="currentColor"/>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path transform="rotate(${a} 12 12)" d="M12 9.200c-1.200-1.800-1.200-4.600 0-6.700 1.200 2.100 1.200 4.900 0 6.700Z" ${SOFT}/>`).join('')}`),
  peonias: ico(`<circle cx="12" cy="12" r="9" ${SOFT}/><path d="M12 12a2 2 0 1 1 2 2 4.500 4.500 0 1 1-4.500-4.500A7 7 0 1 1 17 17"/><path d="M5 9c1-2.500 3-4.500 5.500-5.500M19 15c-1 2.500-3 4.500-5.500 5.500"/>`),
  macarons: ico(`<path d="M4 11a8 4.800 0 0 1 16 0Z" ${SOFT}/><path d="M4 15a8 4.800 0 0 0 16 0Z" ${SOFT}/><path d="M4.500 13h15"/>`),
  brigadeiros: ico(`<circle cx="12" cy="9.500" r="5.500" ${SOFT}/><path d="M5 13.500h14l-2 6.500H7Z"/><path d="M9.500 14 10 20M14.500 14 14 20"/>`),
  bombons: ico(`<ellipse cx="12" cy="12" rx="5" ry="4.200" ${SOFT}/><path d="m7 12-4-3v6ZM17 12l4-3v6Z"/>`),
  suspiros: ico(`<path d="M12 3c.5 3 5.500 5 5.500 10a5.500 5.500 0 0 1-11 0C6.500 8 11.500 6 12 3Z" ${SOFT}/><path d="M8 12.500c1.500 1 6.500 1 8 0M7 16c2 1 8 1 10 0"/>`),
  marshmallows: ico(`<rect x="3.500" y="9.500" width="8.500" height="10" rx="2.500" ${SOFT}/><rect x="13" y="5" width="7.500" height="9.500" rx="2.500" ${SOFT}/>`),
  biscoitos: ico(`<ellipse cx="12" cy="8" rx="8" ry="3.500" ${SOFT}/><path d="M4 8v2.500c0 2 3.600 3.500 8 3.500s8-1.500 8-3.500V8"/><path d="M4 13.500V15c0 2 3.600 3.500 8 3.500s8-1.500 8-3.500v-1.500"/>`),
  wafer: ico(`<rect x="4" y="5" width="4" height="15" rx="1.500" ${SOFT}/><rect x="10" y="4" width="4" height="16" rx="1.500" ${SOFT}/><rect x="16" y="6" width="4" height="14" rx="1.500" ${SOFT}/><path d="M2.500 14.500h19"/>`),
  pirulitos: ico(`<circle cx="12" cy="8.500" r="6" ${SOFT}/><path d="M12 8.500a2 2 0 1 1 2 2 4 4 0 1 1-4-4"/><path d="M12 14.500V22"/>`),
  ouro: ico(`<path d="M5 19C5 10 10 5 19 5c0 9-5 14-14 14Z" ${SOFT}/><path d="M5 19 14 10"/>`),
  baloes: ico(`<ellipse cx="8.500" cy="8" rx="4.500" ry="5.500" ${SOFT}/><ellipse cx="16.500" cy="9.500" rx="3.800" ry="4.800" ${SOFT}/><path d="M8.500 13.500c0 3 2 4 2.500 8M16.500 14.300c0 3-2.500 4-3.500 7.200"/>`),
  lacos: ico(`<path d="M12 12 4.500 7v10ZM12 12l7.500-5v10Z" ${SOFT}/><circle cx="12" cy="12" r="1.800"/><path d="m11 13.500-2.500 6M13 13.500l2.500 6"/>`),
  coracoes: ico(`<path d="M12 20.500C5.500 16 3.500 12.500 3.500 9.300a4.300 4.300 0 0 1 8.500-1.200 4.300 4.300 0 0 1 8.500 1.200c0 3.200-2 6.700-8.500 11.200Z" ${SOFT}/>`),
  borboletas: ico(`<path d="M12 12C10 6.500 6 4.500 3.500 6.500s-.5 7 4 6.500c-2.500 1.500-2.500 5.500.5 6s4-3.500 4-7ZM12 12c2-5.500 6-7.500 8.500-5.500s.5 7-4 6.500c2.500 1.500 2.500 5.500-.5 6s-4-3.500-4-7Z" ${SOFT}/><path d="M12 9v9.500M12 9l-1.500-3M12 9l1.500-3"/>`),
  generic: ico(`<path d="m12 3 2.300 6.700L21 12l-6.700 2.300L12 21l-2.300-6.700L3 12l6.700-2.300Z" ${SOFT}/>`),
  topo: ico(`<path d="m12 2.500 2.100 4.300 4.700.7-3.400 3.300.8 4.700-4.200-2.200-4.200 2.200.8-4.700-3.400-3.300 4.700-.7Z" ${SOFT}/><path d="M12 13.300v8.200"/>`),
};

const ICON = {
  ruler: ico(`<path d="M3 17 17 3l4 4L7 21Z"/><path d="m7.500 12.500 2 2M10.500 9.500l2 2M13.500 6.500l2 2"/>`),
  redo: ico(`<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.300L21 13"/>`),
  backdrop: ico(`<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none"/>`),
  chef: ico(`<path d="M6 13.900A4 4 0 0 1 7.400 6.100a5 5 0 0 1 9.200 0A4 4 0 0 1 18 13.900V19a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1Z"/><path d="M6 17h12"/>`),
  slice: ico(`<circle cx="9" cy="7" r="2"/><path d="M7.200 7.900 3 11v9c0 .6.4 1 1 1h16c.6 0 1-.4 1-1v-9c0-2-3-6-7-8l-3.600 2.600"/><path d="M16 13H3"/><path d="M16 17H3"/>`),
  spin: ico(`<path d="M16.500 7.500C15.600 4.200 14 2 12 2 9.200 2 7 6.500 7 12s2.200 10 5 10c.3 0 .7-.1 1-.2"/><path d="m15.200 13.700 3.800 1.900-1.900 3.800"/><path d="M19 15.600c-1.800.9-4.300 1.400-7 1.400-5.500 0-10-2.200-10-5s4.500-5 10-5c4.800 0 8.900 1.700 9.800 4"/>`),
  swipe: ico(`<polyline points="18 8 22 12 18 16"/><polyline points="6 8 2 12 6 16"/><line x1="2" x2="22" y1="12" y2="12"/>`),
};

/* ───────── Cor livre (matiz, saturação e brilho ↔ código da cor) ───────── */
const HEX6 = /^#[0-9a-f]{6}$/i;
const clamp01 = (n) => Math.max(0, Math.min(1, n));
function hexToHsv(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  const r = (n >> 16) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [h, max ? d / max : 0, max];
}
function hsvToHex(h, s, v) {
  const f = (k) => {
    const x = (k + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(x, 4 - x, 1))) * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(5)}${f(3)}${f(1)}`;
}
/** Tons prontos de uma mesma matiz, do mais claro ao mais escuro (saturação, brilho). */
const TONES = [
  [0.1, 1],
  [0.24, 1],
  [0.42, 0.98],
  [0.62, 0.94],
  [0.8, 0.82],
  [0.88, 0.6],
  [0.9, 0.38],
];

/* ───────── Dica da chef ───────── */
function tipFor(stepId, c) {
  const n = c.layers.length;
  const main = c.layers[n - 1];
  if (stepId === 'formato') {
    if ((c.tiers || 1) > 1) return 'Bolo de andares pede um dia a mais de preparo: cada andar é montado e firmado antes de receber o de cima.';
    if (c.shape === 'hex') return 'O hexagonal é moderno e fotogênico: as quinas destacam listras, degradê e bicos na base.';
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
      perolao: 'As pérolas grandes dão um ar de joia. Na base de cada andar, ficam um luxo.',
      corda: 'A corda trançada é um clássico discreto: emoldura o bolo sem roubar a cena.',
      ziguezague: 'O zigue-zague é feito num vai e vem contínuo do bico. Em cor contrastante, aparece muito mais.',
      babado: 'O babado lembra um tecido franzido. Fica lindo em tons pastel e em bolos de 15 anos.',
      vintage: 'O vintage (lambeth) é o estilo das confeitarias antigas: guirlandas, conchas e lacinhos. Em branco sobre cor pastel é imbatível.',
    };
    return tips[c.piping.style] || tips.liso;
  }
  if (stepId === 'decoracao') {
    const items = c.decor.items;
    if (items.length >= MAX_DECORS) return 'Chegamos ao limite de decorações para o bolo não ficar carregado. Para trocar, tire uma primeiro.';
    if (items.length && !items.some((id) => c.decor.opts?.[id])) return 'Toque numa decoração escolhida (lá em cima) para mudar o arranjo, a quantidade e a cor.';
    if (items.includes('velas') && !c.decor.message) return 'Que tal uma mensagem com o nome de quem faz aniversário? Pode ir na plaquinha ou escrita no topo, com bico.';
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

/** Amostras de cor + botão "outra cor" (seletor livre). Uma cor fora das amostras aparece como a primeira. */
function colorPicker(set, current, colors, label) {
  const list = colors.some((c) => c.hex === current) ? colors : [{ hex: current, name: 'Cor personalizada' }, ...colors];
  return html`<div class="cz-colors" role="radiogroup" aria-label="${label}">
      ${list.map((c) => {
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
      <button type="button" class="cz-color cz-color--free" data-act="pick-color" data-value="${set}" aria-label="Escolher outra cor" title="Outra cor" data-k="${set}:free">${icon('plus')}</button>
    </div>
    <p class="cz-colorname">${colorName(current)}${COLORS.some((c) => c.hex === current) ? '' : ` ${current.toUpperCase()}`}</p>`;
}

const swatches = (hexes) => hexes.map((hex) => ({ hex, name: colorName(hex) }));

/** Ficha de escolha (compacta): texto, amostra de cor e nota de preço opcionais. */
function chip(set, value, isOn, label, { swatch = '', note = '' } = {}) {
  return html`<button type="button" class="cz-chip ${isOn ? 'is-on' : ''}" role="radio" aria-checked="${isOn ? 'true' : 'false'}" data-set="${set}" data-value="${value}" data-k="${set}:${value}">
    ${swatch ? html`<i class="cz-chip__sw" style="--c:${swatch}"></i>` : ''}<span>${label}</span>${note ? html`<small>${note}</small>` : ''}
  </button>`;
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
    <span class="cz-kicker">Etapa ${i + 1} de ${STEPS.length}</span>
    <h2>${s.title}</h2>
    <p>${s.sub}</p>
  </header>`;
}

const ordinal = (n) => `${n}ª`;

/* ───────── Etapas ───────── */
function stepFormato(c, ui) {
  const price = priceOf(c);
  const min = minPrice();
  const tiers = c.tiers || 1;
  const occasions = OCCASIONS.filter((o) => PRESETS.some((p) => p.occasion === o.id));
  const list = ui.occasion ? PRESETS.filter((p) => p.occasion === ui.occasion) : PRESETS;
  const custom = tiers > 1 || c.height !== 'padrao' || c.base !== 'boleira';
  const open = ui.structOpen ?? custom;
  const brief = [tiers > 1 ? `${tiers} andares` : '1 andar', `altura ${HEIGHTS.find((h) => h.id === c.height).name.toLowerCase()}`, BASES.find((b) => b.id === c.base).name.toLowerCase()].join(' · ');
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
      <div class="cz-chips cz-chips--scroll cz-occ" role="radiogroup" aria-label="Inspirações por ocasião">
        ${chip('occasion', '', !ui.occasion, 'Todas')}${occasions.map((o) => chip('occasion', o.id, ui.occasion === o.id, o.name))}
      </div>
      <div class="cz-presets" role="group" aria-label="Inspirações para começar">
        <button type="button" class="cz-preset cz-preset--surprise" data-act="surprise" aria-label="Surpreenda-me: montar um bolo surpresa">
          <span class="cz-preset__img">${icon('shuffle')}</span>
          <span class="cz-preset__text"><strong>Surpresa</strong></span>
        </button>
        ${list.map(
          (p) => html`<button type="button" class="cz-preset" data-act="preset" data-value="${p.id}" data-k="preset:${p.id}" aria-label="Começar pela inspiração ${p.name}: ${p.tag}">
            <span class="cz-preset__img" data-thumb="${p.id}" style="background:${backdropCss(resolveBackdrop(p.config))}">
              <img src="${presetThumbs.get(p.id) || `assets/img/cz-${p.id}.webp`}" alt="" width="136" height="136" loading="lazy" decoding="async" />
            </span>
            <span class="cz-preset__text"><strong>${p.name}</strong><span>${p.tag}</span></span>
          </button>`,
        )}
      </div>
    </section>

    <section class="cz-sec">
      <div class="cz-sec__head"><h3>Formato</h3></div>
      <div class="cz-grid cz-grid--5" role="radiogroup" aria-label="Formato do bolo">
        ${SHAPES.map((sh) =>
          optCard({
            set: 'shape',
            value: sh.id,
            on: c.shape === sh.id,
            name: sh.name,
            price: priceTag(deltaOf(c, sh.price)),
            artwork: html`<span class="cz-opt__art">${SHAPE_ART[sh.id]}</span>`,
            tile: true,
          }),
        )}
      </div>
    </section>

    <section class="cz-sec">
      <div class="cz-sec__head"><h3>Tamanho</h3><span class="cz-sec__note">${sizeOf(c).hint}</span></div>
      <div class="cz-grid cz-grid--3" role="radiogroup" aria-label="Tamanho do bolo">
        ${SIZES.map((sz) => {
          const as = { ...c, size: sz.id };
          return optCard({
            set: 'size',
            value: sz.id,
            on: c.size === sz.id,
            name: tiers > 1 ? `${diametersOf(as)[0]} cm na base` : sz.diameter,
            desc: servesText(as),
            price: html`<span class="cz-opt__price"><b>${money(priceOf(as))}</b></span>`,
            artwork: html`<span class="cz-opt__big">${sz.label}</span>`,
            tile: true,
          });
        })}
      </div>
    </section>

    <section class="cz-sec cz-sec--more">
      <button type="button" class="cz-more" data-act="struct" aria-expanded="${open ? 'true' : 'false'}" data-k="struct:toggle">
        <span class="cz-more__text"><strong>Andares, altura e base</strong><small>${brief}</small></span>
        ${icon('chevron-down')}
      </button>
      ${open
        ? html`<div class="cz-morebody">
            <span class="cz-sub__label">Andares</span>
            ${segmented('tiers', String(tiers), TIER_OPTIONS.map((t) => ({ id: String(t.n), name: t.name })), 'Quantos andares')}
            <p class="cz-note">${tiers > 1 ? `Diâmetros de ${diametersOf(c).join(', ')} cm, ${heightCmOf(c)} cm de altura · rende ${servesText(c)}.` : 'Com mais andares o bolo de baixo cresce e rende muito mais fatias.'}</p>
            <span class="cz-sub__label">Altura de cada andar</span>
            ${segmented('height', c.height, HEIGHTS, 'Altura do bolo')}
            <span class="cz-sub__label">Base</span>
            <div class="cz-chips" role="radiogroup" aria-label="Base do bolo">
              ${BASES.map((b) => chip('base', b.id, c.base === b.id, b.name, { swatch: b.swatch, note: b.price ? `+ ${brl(b.price)}` : '' }))}
            </div>
          </div>`
        : ''}
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
  const tiers = c.tiers || 1;
  const each = tiers > 1 && ui.tierMode === 'each' && Array.isArray(c.tierCover);
  const ti = each ? Math.min(ui.tier, tiers - 1) : tiers - 1;
  const cov = each ? c.tierCover[ti] : c.covering;
  const naked = cov.type === 'naked';
  const fin = getFinish(cov.style);
  const dripList = ui.moreDrip || !DRIP_COLORS.includes(c.drip.color) ? COLORS : COLORS.filter((x) => DRIP_COLORS.includes(x.hex));
  return html`
    <section class="cz-sec">
      <div class="cz-sec__head"><h3>Paletas prontas</h3><span class="cz-sec__note">Recolorem o bolo inteiro</span></div>
      <div class="cz-pals" role="group" aria-label="Paletas prontas">
        ${COLOR_PALETTES.map(
          (p) => html`<button type="button" class="cz-pal" data-act="palette" data-value="${p.id}" data-k="palette:${p.id}" aria-label="Aplicar a paleta ${p.name}">
            <span class="cz-pal__dots">${[p.cover, p.cover2, p.accents[0], p.text].map((h) => html`<i style="--c:${h}"></i>`)}</span><span>${p.name}</span>
          </button>`,
        )}
      </div>
    </section>

    ${tiers > 1
      ? html`<section class="cz-sec">
          ${segmented('tierMode', each ? 'each' : 'all', [{ id: 'all', name: 'Igual em todos' }, { id: 'each', name: 'Uma por andar' }], 'Cobertura dos andares')}
          ${each
            ? html`<div class="cz-stack" role="radiogroup" aria-label="Andar que você está editando">
                ${coversOf(c)
                  .map((x, i) => {
                    const where = i === tiers - 1 ? ' (topo)' : i === 0 ? ' (base)' : '';
                    return html`<button type="button" class="cz-layer ${i === ti ? 'is-on' : ''}" role="radio" aria-checked="${i === ti ? 'true' : 'false'}" data-set="tier" data-value="${i}" data-k="tier:${i}">
                      <i class="cz-swatch" style="--c:${x.color}"></i>
                      <span>${ordinal(i + 1).replace('ª', 'º')} andar${where}</span>
                      <strong>${getCovering(x.type).name}</strong>
                      ${icon(i === ti ? 'edit' : 'chevron-right')}
                    </button>`;
                  })
                  .reverse()}
              </div>`
            : ''}
        </section>`
      : ''}

    <section class="cz-sec">
      <div class="cz-sec__head"><h3>Tipo de cobertura</h3></div>
      <div class="cz-grid cz-grid--2" role="radiogroup" aria-label="Tipo de cobertura">
        ${COVERINGS.map((k) =>
          optCard({
            set: 'covering',
            value: k.id,
            on: cov.type === k.id,
            name: k.name,
            desc: k.desc,
            price: priceTag(deltaOf(c, k.price)),
            artwork: html`<i class="cz-swatch ${FINISH_SWATCH[k.finish] || ''}" style="--c:${ui.colorChosen || cov.type === k.id ? cov.color : k.defaultColor}"></i>`,
          }),
        )}
      </div>
    </section>

    <section class="cz-sec">
      <div class="cz-sec__head"><h3>${naked ? 'Cor do creme do topo' : 'Cor da cobertura'}</h3></div>
      ${colorPicker('coveringColor', cov.color, COLORS, naked ? 'Cor do creme do topo' : 'Cor da cobertura')}
    </section>

    <section class="cz-sec">
      <div class="cz-sec__head"><h3>Estilo da cobertura</h3><span class="cz-sec__note">${fin.desc}</span></div>
      <div class="cz-fins" role="radiogroup" aria-label="Estilo da cobertura">
        ${FINISHES.map((f) => {
          const ok = finishAllowed(cov.type, f.id);
          return html`<button type="button" class="cz-fin ${cov.style === f.id ? 'is-on' : ''} ${ok ? '' : 'is-off'}" role="radio" aria-checked="${cov.style === f.id ? 'true' : 'false'}" ${ok ? '' : raw('disabled')} data-set="finish" data-value="${f.id}" data-k="finish:${f.id}">
            <i class="cz-fin__art cz-fin__art--${f.id}" style="--c:${cov.color};--c2:${cov.color2}"></i>
            <span>${f.name}</span>
            <small>${f.price ? `+ ${brl(deltaOf(c, f.price))}` : 'incluso'}</small>
          </button>`;
        })}
      </div>
      ${fin.two
        ? html`<div class="cz-sub">
            <span class="cz-sub__label">Segunda cor</span>
            ${colorPicker('color2', cov.color2, COLORS, 'Segunda cor da cobertura')}
          </div>`
        : ''}
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
  const pip = getPiping(c.piping.style);
  const none = pip.id === 'liso';
  return html`
    <section class="cz-sec">
      <div class="cz-sec__head"><h3>Estilo do bico</h3><span class="cz-sec__note">${pip.desc}</span></div>
      <div class="cz-grid cz-grid--3" role="radiogroup" aria-label="Estilo do acabamento">
        ${PIPINGS.map((x) =>
          optCard({
            set: 'pipingStyle',
            value: x.id,
            on: c.piping.style === x.id,
            name: x.name,
            price: priceTag(deltaOf(c, x.price)),
            artwork: html`<span class="cz-opt__art">${PIPING_ART[x.id]}</span>`,
            tile: true,
          }),
        )}
      </div>
    </section>
    ${none
      ? ''
      : html`
          ${pip.combo
            ? html`<p class="cz-note">O conjunto vintage já vem completo: conchas no topo e na base, guirlandas na lateral e um lacinho em cada encontro.</p>`
            : html`<section class="cz-sec">
                <div class="cz-sec__head"><h3>Onde aplicar</h3></div>
                ${segmented('pipingWhere', c.piping.where, PIPING_PLACES, 'Onde aplicar o acabamento')}
              </section>`}
          <section class="cz-sec">
            <div class="cz-sec__head"><h3>Cor do acabamento</h3></div>
            ${colorPicker('pipingColor', c.piping.color, COLORS, 'Cor do acabamento')}
          </section>
        `}
  `;
}

/** Ajustes de uma decoração escolhida: arranjo, fartura e cor (ou, nas velas, o tipo e o número). */
function decorAdjust(c, id) {
  const d = getDecor(id);
  if (id === 'velas') {
    const st = c.decor.candleStyle;
    return html`<div class="cz-adjust cz-adjust--below" data-cz-candles data-k="adjustbox:velas">
      <span class="cz-sub__label">Velas: de que tipo?</span>
      ${segmented('candleStyle', st, CANDLE_STYLES, 'Tipo de vela')}
      ${st === 'classica'
        ? html`<div class="cz-row cz-row--gap">
            <div class="cz-row__text"><strong>Quantas velas?</strong><span>De 1 a ${MAX_CANDLES}, coloridas e listradas</span></div>
            ${qtyStepper(c.decor.candles, { min: 1, max: MAX_CANDLES, id: 'candles' })}
          </div>`
        : st === 'numero'
          ? html`<div class="cz-field cz-field--inline">
              <label for="cz-number">Qual número?</label>
              <input class="input" id="cz-number" type="text" inputmode="numeric" maxlength="3" placeholder="Ex.: 30" value="${c.decor.number}" data-field="number" autocomplete="off" enterkeyhint="done" />
            </div>`
          : html`<p class="cz-note">Uma vela vulcão no centro: acende e solta estrelinhas na hora do parabéns.</p>`}
    </div>`;
  }
  const o = decorOptions(c, id);
  return html`<div class="cz-adjust" data-k="adjustbox:${id}">
    ${d.arrs.length > 1
      ? html`<span class="cz-sub__label">Como arrumar</span>
          <div class="cz-chips" role="radiogroup" aria-label="Arranjo de ${d.name}">
            ${d.arrs.map((a) => chip(`decorArr.${id}`, a, o.arr === a, ARRANGEMENTS.find((x) => x.id === a)?.name || a))}
          </div>`
      : ''}
    ${d.qty
      ? html`<span class="cz-sub__label">Quantidade</span>
          ${segmented(`decorQty.${id}`, o.qty, QUANTITIES, `Quantidade de ${d.name}`)}`
      : ''}
    ${d.colors
      ? html`<span class="cz-sub__label">Cor</span>
          ${colorPicker(`decorColor.${id}`, o.color, swatches(DECOR_COLORS[d.colors]), `Cor de ${d.name}`)}`
      : ''}
  </div>`;
}

function stepDecoracao(c, ui) {
  const items = c.decor.items;
  const full = items.length >= MAX_DECORS;
  const group = DECOR_GROUPS.some((g) => g.id === ui.decorGroup) ? ui.decorGroup : 'frutas';
  const adjustable = (d) => d.qty || d.colors || d.arrs.length > 1 || d.id === 'velas';
  // as velas têm o painel delas logo abaixo das opções (aparece ao escolher, como sempre foi)
  const open = items.includes(ui.decorOpen) && ui.decorOpen !== 'velas' && adjustable(getDecor(ui.decorOpen)) ? ui.decorOpen : null;
  const bico = c.decor.messageMode === 'bico';
  return html`
    <section class="cz-sec">
      <div class="cz-sec__head">
        <h3>Decorações <span class="cz-optional">(opcional)</span></h3>
        ${items.length ? html`<button type="button" class="cz-linkbtn" data-act="clear-decor" data-k="decor:clear">Tirar todas</button>` : html`<span class="cz-sec__note" data-k="decor:max">Combine até ${MAX_DECORS}</span>`}
      </div>
      <div class="cz-picked" role="group" aria-label="Decorações escolhidas: ${items.length} de ${MAX_DECORS}">
        ${items.length
          ? items.map((id) => {
              const d = getDecor(id);
              const can = adjustable(d);
              return html`<span class="cz-pick ${open === id ? 'is-on' : ''}" data-k="pick:${id}">
                <button type="button" class="cz-pick__main" data-act="adjust" data-value="${id}" ${can ? (id === 'velas' ? '' : raw(`aria-expanded="${open === id ? 'true' : 'false'}"`)) : raw('disabled')} aria-label="${can ? (id === 'velas' ? 'Ajustar as velas: tipo e quantidade' : `Ajustar ${d.name}: arranjo, quantidade e cor`) : d.name}">
                  ${d.name}${can ? icon('sliders') : ''}
                </button>
                <button type="button" class="cz-pick__x" data-act="decor" data-value="${id}" aria-label="Tirar ${d.name}">${icon('x')}</button>
              </span>`;
            })
          : html`<span class="cz-picked__empty" data-k="pick:none">Nenhuma ainda. Toque numa decoração abaixo para colocar no bolo.</span>`}
      </div>
      ${open ? decorAdjust(c, open) : ''}
      <div class="cz-chips cz-chips--scroll cz-tabs" role="radiogroup" aria-label="Tipos de decoração">
        ${DECOR_GROUPS.map((g) => chip('decorGroup', g.id, group === g.id, g.name, { note: String(items.filter((id) => getDecor(id).group === g.id).length || '') }))}
      </div>
      ${DECOR_GROUPS.map(
        // todos os grupos ficam montados; só o da aba escolhida aparece (trocar de aba não refaz nada)
        (g) => html`<div class="cz-grid cz-grid--2" role="group" aria-label="${g.name}: ${items.length} de ${MAX_DECORS} decorações escolhidas" data-k="group:${g.id}" ${g.id === group ? '' : raw('hidden')}>
          ${DECORS.filter((d) => d.group === g.id).map((d) => {
            const isOn = items.includes(d.id);
            const q = isOn && d.qty ? QUANTITIES.find((x) => x.id === decorOptions(c, d.id).qty).mult : 1;
            return optCard({
              act: 'decor',
              value: d.id,
              on: isOn,
              name: d.name,
              desc: d.desc,
              price: html`<span class="cz-opt__price"><b>+ ${money(deltaOf(c, d.price * q, d.scales))}</b></span>`,
              artwork: html`<span class="cz-opt__art">${DECOR_ART[d.id] || DECOR_ART.generic}</span>`,
              role: 'checkbox',
              disabled: full && !isOn,
            });
          })}
        </div>`,
      )}
      ${items.includes('velas') ? decorAdjust(c, 'velas') : ''}
    </section>

    <section class="cz-sec">
      <div class="cz-field">
        <div class="cz-field__top">
          <label for="cz-message">Mensagem <span class="cz-optional">(opcional)</span></label>
          <span class="cz-field__price">+ ${money(bico ? SCRIPT_PRICE : MESSAGE_PRICE)}</span>
        </div>
        ${segmented('messageMode', bico ? 'bico' : 'placa', [{ id: 'placa', name: 'Na plaquinha' }, { id: 'bico', name: 'Escrita no topo' }], 'Onde vai a mensagem')}
        <input class="input" id="cz-message" type="text" maxlength="${MESSAGE_MAX}" placeholder="Ex.: Parabéns, Ana!" value="${c.decor.message}" data-field="message" autocomplete="off" enterkeyhint="done" aria-describedby="cz-message-count" />
        <div class="cz-field__foot">
          <span>${bico ? 'Escrita com bico de confeitar, direto na cobertura.' : 'A plaquinha aparece no bolo enquanto você escreve.'}</span>
          <span id="cz-message-count" data-count="message">${c.decor.message.length}/${MESSAGE_MAX}</span>
        </div>
        ${bico
          ? html`<div class="cz-sub">
              <span class="cz-sub__label">Letra</span>
              ${segmented('script', c.decor.script, SCRIPTS, 'Letra da mensagem')}
              <span class="cz-sub__label">Cor da escrita</span>
              ${colorPicker('messageColor', c.decor.messageColor, COLORS, 'Cor da escrita')}
            </div>`
          : ''}
        <div class="cz-ideas" aria-label="Sugestões de mensagem">
          ${MESSAGE_IDEAS.map((m) => html`<button type="button" data-act="idea" data-value="${m}">${m}</button>`)}
          <button type="button" class="cz-ideas__clear" data-act="idea" data-value="" data-clear-message ${c.decor.message ? '' : raw('hidden')}>Sem mensagem</button>
        </div>
      </div>
    </section>

    <section class="cz-sec">
      <div class="cz-field">
        <div class="cz-field__top">
          <label for="cz-topper">Topo personalizado <span class="cz-optional">(opcional)</span></label>
          <span class="cz-field__price">+ ${money(TOPPER_PRICE)}</span>
        </div>
        <input class="input" id="cz-topper" type="text" maxlength="${TOPPER_MAX}" placeholder="Ex.: Ana 30" value="${c.decor.topper.text}" data-field="topper" autocomplete="off" enterkeyhint="done" />
        <div class="cz-field__foot"><span>Nome ou idade recortado em acrílico, no palito.</span><span data-count="topper">${c.decor.topper.text.length}/${TOPPER_MAX}</span></div>
        <div class="cz-chips" role="radiogroup" aria-label="Cor do topo personalizado">
          ${TOPPER_COLORS.map((t) => chip('topperColor', t.hex, c.decor.topper.color === t.hex, t.name, { swatch: t.hex }))}
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
        ? html`<span class="badge">${icon('edit')} Editando o bolo do carrinho</span>`
        : html`<span class="cz-kicker">${icon('check-circle')} Seu bolo está pronto</span>`}
      <div class="cz-offer__name" data-cz-namebox>${nameBox(c, ui.renaming)}</div>
      <div class="cz-offer__price"><strong data-cz-price>${money(total)}</strong></div>
      <p class="cz-offer__pay" data-cz-pay>${payLine(total)}</p>
      <p class="cz-offer__ship">${icon('calendar')}<span>Rende ${servesText(c)} · receba a partir de <strong>${firstDate(c)}</strong></span></p>
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
  const body = id === 'massa' ? stepMassa(c, ui) : id === 'recheio' ? stepRecheio(c, ui) : id === 'cobertura' ? stepCobertura(c, ui) : id === 'acabamento' ? stepAcabamento(c) : stepDecoracao(c, ui);
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
          <div class="cz-bg" data-cz-bg aria-hidden="true"></div>
          <header class="cz-top">
            <button type="button" class="cz-round" data-back="/" aria-label="Voltar para a loja">${icon('arrow-left')}</button>
            <div class="cz-brand">
              <a class="cz-brand__mark" href="#/" aria-label="BOLAB — página inicial"><img src="assets/logo-mark.webp" alt="" width="28" height="43" /></a>
              <div class="cz-brand__text"><h1>Monte seu bolo</h1><span data-cz-name></span></div>
            </div>
            <button type="button" class="cz-round cz-hist" data-act="undo" aria-label="Desfazer" title="Desfazer" disabled>${icon('undo')}</button>
            <button type="button" class="cz-round cz-hist" data-act="redo" aria-label="Refazer" title="Refazer" disabled>${ICON.redo}</button>
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

          <div class="cz-measure" data-cz-measure hidden></div>
          <div class="cz-flash" data-cz-flash aria-hidden="true"></div>
          <div class="cz-hint" data-cz-hint>${ICON.swipe} Arraste para girar</div>
          <div class="cz-meta" data-cz-meta></div>
          <div class="cz-bgbar" id="cz-bgbar" data-cz-bgbar role="radiogroup" aria-label="Fundo do palco" hidden></div>
          <div class="cz-bgbar cz-viewbar" id="cz-viewbar" data-cz-viewbar role="group" aria-label="Vistas e medidas" hidden></div>
          <div class="cz-tools" data-cz-tools>
            <button type="button" class="cz-tool cz-tool--bg" data-act="bgmenu" aria-expanded="false" aria-controls="cz-bgbar" aria-label="Fundo do palco" title="Fundo do palco">${ICON.backdrop}<span>Fundo</span></button>
            <button type="button" class="cz-tool cz-tool--label" data-act="cutaway" aria-pressed="false" aria-label="Ver por dentro" title="Ver por dentro">${ICON.slice}<span>Ver por dentro</span></button>
            <button type="button" class="cz-tool cz-tool--icon" data-act="rotate" aria-pressed="false" aria-label="Giro automático" title="Giro automático">${ICON.spin}</button>
            <button type="button" class="cz-tool cz-tool--view" data-act="viewmenu" aria-expanded="false" aria-controls="cz-viewbar" aria-label="Vistas e medidas" title="Vistas e medidas">${icon('eye')}</button>
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
      measure: $('[data-cz-measure]'),
      viewbar: $('[data-cz-viewbar]'),
      flash: $('[data-cz-flash]'),
      bg: $('[data-cz-bg]'),
      bgbar: $('[data-cz-bgbar]'),
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
    const ui = { flavorMode: 'all', fillMode: 'all', layer: 0, gap: 0, moreDrip: false, colorChosen: false, tipOpen: false, renaming: false, editing: false, celebrated: false, savedId: null, savedKey: '', occasion: '', structOpen: null, tierMode: 'all', tier: 0, decorGroup: 'frutas', decorOpen: null };
    let cake = null;
    let cutaway = false;
    let autoCut = true; // enquanto a pessoa não mexer no botão, o corte abre sozinho nas etapas de massa e recheio
    let rotating = !reduceMotion && prefs.get('customizerRotate', true) !== false;
    let shownPrice = null;
    let priceAnim = 0;

    const configKey = () => JSON.stringify({ ...config, backdrop: undefined }); // o fundo do palco não faz dele outro bolo
    const clone = (o) => JSON.parse(JSON.stringify(o));

    function syncModes() {
      ui.flavorMode = config.layers.every((x) => x === config.layers[0]) ? 'all' : 'each';
      ui.fillMode = config.fillings.every((x) => x === config.fillings[0]) ? 'all' : 'each';
      ui.layer = config.layers.length - 1;
      ui.gap = Math.max(0, config.fillings.length - 1);
      const n = config.tiers || 1;
      ui.tierMode = n > 1 && Array.isArray(config.tierCover) ? 'each' : 'all';
      ui.tier = n - 1;
      const cov = coverRef();
      ui.colorChosen = cov.color !== getCovering(cov.type).defaultColor;
      if (!config.decor.items.includes(ui.decorOpen)) ui.decorOpen = null;
    }

    /** A cobertura que os controles estão editando: a do andar escolhido ou a do bolo inteiro. */
    function coverRef() {
      const n = config.tiers || 1;
      if (n > 1 && ui.tierMode === 'each' && Array.isArray(config.tierCover)) return config.tierCover[Math.min(ui.tier, n - 1)];
      return config.covering;
    }
    /** Com uma cobertura por andar, a "principal" (fundo do palco, desenho 2D) acompanha o andar de baixo. */
    function coverDone() {
      if (ui.tierMode === 'each' && Array.isArray(config.tierCover)) config.covering = clone(config.tierCover[0]);
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

    // versões antigas guardavam as miniaturas das inspirações no aparelho (dezenas de KB regravados a cada escolha)
    if (prefs.get('customizerThumbs')) prefs.set('customizerThumbs', null);

    const origin = loadInitial(ctx.query || {});
    config = normalizeConfig(config);
    syncModes();

    /* ── desfazer / refazer ── */
    const hist = { past: [], future: [], cur: JSON.stringify(config), merge: '', at: 0, lock: false };
    function syncHist() {
      root.querySelectorAll('[data-act="undo"]').forEach((b) => (b.disabled = !hist.past.length));
      root.querySelectorAll('[data-act="redo"]').forEach((b) => (b.disabled = !hist.future.length));
    }
    /** Guarda o estado anterior a cada mudança. Digitação seguida no mesmo campo conta como um passo só. */
    function record(merge = '') {
      const key = JSON.stringify(config);
      if (key === hist.cur) return;
      if (!hist.lock) {
        const t = performance.now();
        const same = merge && merge === hist.merge && t - hist.at < 1500;
        if (!same) {
          hist.past.push(hist.cur);
          if (hist.past.length > 60) hist.past.shift();
        }
        hist.future.length = 0;
        hist.merge = merge;
        hist.at = t;
      }
      hist.cur = key;
      syncHist();
    }
    function travel(from, to, said) {
      if (!from.length) return;
      to.push(hist.cur);
      config = normalizeConfig(JSON.parse(from.pop()));
      hist.lock = true;
      hist.merge = '';
      // a pessoa continua no mesmo andar / camada que estava editando (quando ele ainda existe)
      const at = { tier: ui.tier, layer: ui.layer, gap: ui.gap };
      syncModes();
      ui.tier = Math.min(at.tier, (config.tiers || 1) - 1);
      ui.layer = Math.min(at.layer, config.layers.length - 1);
      ui.gap = Math.max(0, Math.min(at.gap, config.fillings.length - 1));
      const cov = coverRef();
      ui.colorChosen = cov.color !== getCovering(cov.type).defaultColor;
      commit();
      hist.lock = false;
      syncHist();
      el.live.textContent = said;
    }
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
      measuring = false;
      el.measure.hidden = true;
      el.viewbar.hidden = true;
      setBgBar(false);
      syncBackdrop({ instant: true });
      drawCake2D(el.fallback.querySelector('canvas'), config, { background: false });
    }

    function sceneUpdate() {
      if (cake) cake.setConfig(config);
      else drawCake2D(el.fallback.querySelector('canvas'), config, { background: false });
    }
    const sceneUpdateSoon = debounce(() => alive && sceneUpdate(), 130); // digitando: a plaquinha é refeita no máximo a cada ~130 ms

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
      cake?.setAutoRotate(rotating && !measuring);
      el.tools.querySelector('[data-act="rotate"]').setAttribute('aria-pressed', String(rotating));
      if (remember) prefs.set('customizerRotate', rotating);
    }

    /* ── fundo do palco: automático (pelas cores do bolo) ou escolhido no botão "Fundo" ── */
    let stageBackdrop = null;
    let autoBackdropId = null; // último fundo automático: só troca se outro for claramente melhor
    let bgOpen = false;

    function syncBackdrop({ instant = false } = {}) {
      // sem 3D (desenho 2D) o palco fica sempre no fundo claro
      const b = el.cz.classList.contains('is-flat') ? getBackdrop('rosa') : resolveBackdrop(config, autoBackdropId);
      if (!getBackdrop(config.backdrop)) autoBackdropId = b.id;
      if (stageBackdrop?.id === b.id) return;
      stageBackdrop = b;
      el.cz.dataset.tone = b.tone;
      const old = [...el.bg.children];
      const layer = document.createElement('div');
      layer.className = 'cz-bg__layer';
      layer.style.background = backdropCss(b);
      el.bg.appendChild(layer);
      if (instant || reduceMotion || !old.length) {
        old.forEach((n) => n.remove());
        layer.classList.add('is-on');
      } else {
        void layer.offsetWidth;
        layer.classList.add('is-on');
        later(() => old.forEach((n) => n.remove()), 650);
      }
      cake?.setBackdrop(b, { instant });
      if (bgOpen) renderBgBar();
    }

    function renderBgBar() {
      const cur = getBackdrop(config.backdrop) ? config.backdrop : BACKDROP_AUTO;
      const used = stageBackdrop || getBackdrop('rosa');
      el.bgbar.innerHTML = String(html`
        <p class="cz-bgbar__name"><span>Fundo</span><strong>${cur === BACKDROP_AUTO ? `Automático · ${used.name}` : used.name}</strong></p>
        <div class="cz-bgbar__row">
          <button type="button" class="cz-bgsw cz-bgsw--auto ${cur === BACKDROP_AUTO ? 'is-on' : ''}" role="radio" aria-checked="${cur === BACKDROP_AUTO ? 'true' : 'false'}" data-act="backdrop" data-value="${BACKDROP_AUTO}" aria-label="Automático: o fundo acompanha as cores do bolo" title="Automático"><b>A</b></button>
          ${BACKDROPS.map(
            (b) => html`<button type="button" class="cz-bgsw ${cur === b.id ? 'is-on' : ''}" role="radio" aria-checked="${cur === b.id ? 'true' : 'false'}" data-act="backdrop" data-value="${b.id}" aria-label="${b.name}" title="${b.name}" style="--sw:${b.c[1]};--sw2:${b.c[3]}"></button>`,
          )}
        </div>
      `);
    }

    function setBgBar(open) {
      bgOpen = Boolean(open);
      el.bgbar.hidden = !bgOpen;
      el.tools.querySelector('[data-act="bgmenu"]').setAttribute('aria-expanded', String(bgOpen));
      if (bgOpen && viewOpen) setViewBar(false);
      if (bgOpen) renderBgBar();
    }

    /** Miniatura de inspiração cujo arquivo não carregou: desenha na hora com o motor 3D (ou em 2D). */
    function presetFallback(img) {
      const id = img.closest('[data-thumb]')?.dataset.thumb;
      const p = id && getPreset(id);
      if (!p || img.dataset.fallback) return;
      img.dataset.fallback = '1';
      later(() => {
        if (!alive) return;
        try {
          const url = presetThumbs.get(id) || (cake ? cake.thumbOf(p.config, { size: 200, quality: 0.78, fill: 0.88 }) : thumb2D(p.config, 200));
          if (!url) return;
          presetThumbs.set(id, url);
          root.querySelectorAll(`[data-thumb="${id}"] img`).forEach((n) => (n.src = url));
        } catch (err) {
          console.error('[personalizador] miniatura da inspiração', id, err);
        }
      }, 1200);
    }
    root.addEventListener('error', (ev) => ev.target instanceof HTMLImageElement && ev.target.closest('[data-thumb]') && presetFallback(ev.target), true);

    function startScene() {
      try {
        cake = createCakeScene(el.canvas, {
          insets: stageInsets,
          onInteract: hideHint,
          onFrame: () => measuring && drawMeasure(),
          onContextLost: () => (el.lost.hidden = false),
          onContextRestored: () => {
            el.lost.hidden = true;
            cake?.setConfig(config, { instant: true });
          },
        });
      } catch (err) {
        console.warn('[personalizador] 3D indisponível, usando desenho 2D:', err?.message || err);
        useFallback();
        return;
      }
      // um quadro para a tela aparecer; depois o corpo do bolo, e os bicos e decorações chegam um a um
      requestAnimationFrame(() => {
        if (!alive) return;
        try {
          cake.setBackdrop(stageBackdrop, { instant: true });
          cake.setView(viewFor(step), { animate: false });
          cake.setConfig(config, { staged: true });
          cake.setAutoRotate(rotating);
          cake.setPaused(Boolean(document.querySelector('.overlay')));
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
        // com tudo parado, adianta o que a pessoa ainda pode escolher (o primeiro toque em cada opção não engasga)
        later(() => alive && cake?.warmUp(), 900);
      });
      // a plaquinha usa a fonte da marca: se ela chegar depois, refaz o texto
      document.fonts?.load?.('700 40px "Plus Jakarta Sans"').then(() => alive && cake?.refreshText()).catch(() => {});
    }

    // Nada é desenhado com um diálogo aberto por cima do bolo; e o giro espera enquanto o painel rola.
    const overlayWatch = new MutationObserver(() => cake?.setPaused(Boolean(document.querySelector('.overlay'))));
    overlayWatch.observe(document.body, { childList: true });
    // Dedo no painel de opções (toque ou rolagem): a pessoa está lendo, não olhando o bolo — o giro espera 2 s.
    const holdSpin = () => cake?.quiet(2000);
    el.body.addEventListener('scroll', holdSpin, { passive: true });
    el.steps.addEventListener('scroll', holdSpin, { passive: true });
    root.querySelector('.cz-panel').addEventListener('pointerdown', holdSpin, { passive: true });

    function hideHint() {
      if (!el.hint.classList.contains('is-on')) return;
      el.hint.classList.remove('is-on');
      prefs.set('customizerHintSeen', true);
    }

    const viewFor = (i) => (['acabamento', 'decoracao'].includes(STEPS[i].id) ? 'top' : 'default');
    let manualView = null; // vista escolhida no botão (de frente, de cima): vale até trocar de etapa

    let flashTimer = 0;
    /** Aviso curto sobre o palco ("De frente", "De cima"…). */
    function flash(text) {
      el.flash.textContent = text;
      el.flash.classList.add('is-on');
      clearTimeout(flashTimer);
      flashTimer = later(() => el.flash.classList.remove('is-on'), 1300);
      el.live.textContent = text;
    }

    /* ── ver medidas: diâmetro de cada andar e altura, em cm, desenhados sobre o bolo ── */
    let measuring = false;
    let measureMarkup = '';
    function placeMeasure() {
      // a camada de medidas ocupa exatamente a área da tela 3D
      el.measure.style.cssText = `top:${el.canvas.offsetTop}px;left:${el.canvas.offsetLeft}px;width:${el.canvas.offsetWidth}px;height:${el.canvas.offsetHeight}px`;
    }
    function drawMeasure() {
      if (!measuring || !cake) return;
      const d = cake.measure();
      if (!d) return;
      const dia = diametersOf(config);
      const sym = config.shape === 'round' ? 'Ø ' : '';
      const r = (n) => Math.round(n * 2) / 2;
      const top = r(d.height.top.y);
      const bottom = r(d.height.bottom.y);
      const hx = Math.max(24, r(Math.min(d.height.top.x, d.height.bottom.x) - 16));
      let path = `M${hx} ${top}V${bottom}M${hx - 5} ${top}h10M${hx - 5} ${bottom}h10`;
      let tags = `<span class="cz-measure__tag" style="left:${hx}px;top:${r((top + bottom) / 2)}px">${heightCmOf(config)} cm</span>`;
      d.tiers.forEach((t, i) => {
        const y = r((t.left.y + t.right.y) / 2);
        path += `M${r(t.left.x)} ${y}H${r(t.right.x)}M${r(t.left.x)} ${y - 5}v10M${r(t.right.x)} ${y - 5}v10`;
        tags += `<span class="cz-measure__tag" style="left:${r((t.left.x + t.right.x) / 2)}px;top:${y}px">${sym}${dia[i]} cm</span>`;
      });
      const markup = `<svg aria-hidden="true"><path class="cz-measure__halo" d="${path}"/><path d="${path}"/></svg>${tags}`;
      if (markup === measureMarkup) return;
      measureMarkup = markup;
      el.measure.innerHTML = `${markup}<p class="cz-measure__info">${String(icon('users'))}<span>Rende ${servesText(config)}</span></p>`;
    }
    /* ── vistas rápidas (padrão, de frente, de cima) e medidas: uma barra que abre no botão "Vistas" ── */
    let viewOpen = false;
    const VIEWS = [
      { id: 'default', name: 'Padrão' },
      { id: 'front', name: 'De frente' },
      { id: 'above', name: 'De cima' },
    ];
    function renderViewBar() {
      const cur = manualView || 'default';
      el.viewbar.innerHTML = String(html`
        <div class="cz-viewbar__row">
          ${VIEWS.map((x) => html`<button type="button" class="cz-chip ${cur === x.id ? 'is-on' : ''}" aria-pressed="${cur === x.id ? 'true' : 'false'}" data-act="view" data-value="${x.id}">${x.name}</button>`)}
          <button type="button" class="cz-chip cz-chip--tool ${measuring ? 'is-on' : ''}" aria-pressed="${measuring ? 'true' : 'false'}" data-act="measure">${ICON.ruler}<span>Medidas</span></button>
        </div>
      `);
    }
    function setViewBar(open) {
      viewOpen = Boolean(open) && Boolean(cake);
      el.viewbar.hidden = !viewOpen;
      const btn = el.tools.querySelector('[data-act="viewmenu"]');
      btn.setAttribute('aria-expanded', String(viewOpen));
      btn.classList.toggle('is-active', measuring || Boolean(manualView));
      if (viewOpen) {
        if (bgOpen) setBgBar(false);
        renderViewBar();
      }
    }

    function setMeasuring(on) {
      measuring = Boolean(on) && Boolean(cake);
      el.measure.hidden = !measuring;
      measureMarkup = '';
      if (measuring) {
        placeMeasure();
        manualView = 'front';
        cake.setAutoRotate(false);
        cake.setView('front');
        drawMeasure();
        el.live.textContent = `Medidas: ${diametersOf(config).join(', ')} cm de largura, ${heightCmOf(config)} cm de altura. Rende ${servesText(config)}.`;
      } else {
        el.measure.innerHTML = '';
        manualView = null;
        cake?.setAutoRotate(rotating);
        cake?.setView(viewFor(step));
      }
      setViewBar(viewOpen);
    }
    const onResize = () => measuring && later(() => alive && measuring && (placeMeasure(), (measureMarkup = ''), drawMeasure()), 200);
    window.addEventListener('resize', onResize);

    /* ── desenho do painel ── */
    let stepsMarkup = '';
    let stepsShown = -1;
    function renderSteps() {
      const markup = String(html`${stepChips(step, config, visited)}`);
      if (markup !== stepsMarkup) {
        stepsMarkup = markup;
        el.steps.innerHTML = markup;
      }
      if (stepsShown === step) return;
      stepsShown = step;
      // centraliza a etapa atual no próximo quadro (medir a tela dentro do toque obrigaria o navegador a recalcular tudo na hora)
      requestAnimationFrame(() => {
        const cur = alive && el.steps.querySelector('.is-current');
        if (!cur) return;
        const target = cur.offsetLeft - (el.steps.clientWidth - cur.offsetWidth) / 2;
        el.steps.scrollTo({ left: Math.max(0, target), behavior: reduceMotion ? 'auto' : 'smooth' });
      });
    }

    const tpl = document.createElement('template');
    /** still = a mesma etapa, depois de uma escolha: o painel é atualizado no lugar, só no que mudou. */
    function renderBody({ still = false } = {}) {
      const markup = String(renderStep(step, config, ui));
      el.body.classList.toggle('is-still', still);
      if (still && el.body.firstChild) {
        tpl.innerHTML = markup;
        morph(el.body, tpl.content);
        return;
      }
      el.body.innerHTML = markup;
      el.body.scrollTop = 0;
    }

    function renderNameBox() {
      const box = root.querySelector('[data-cz-namebox]');
      if (box) box.innerHTML = String(nameBox(config, ui.renaming));
    }

    function renderFoot() {
      const last = step === STEPS.length - 1;
      // no resumo, o botão principal leva o valor dentro ("Adicionar · R$ 149,90"); o total ao lado sai
      el.foot.toggleAttribute('data-last', last);
      el.foot.innerHTML = String(html`
        ${step > 0 ? html`<button type="button" class="cz-prev" data-act="prev" aria-label="Voltar uma etapa" ${last ? raw('data-last') : ''}>${icon('arrow-left')}<span>Voltar</span></button>` : ''}
        <button type="button" class="cz-total" data-act="breakdown" aria-label="Ver detalhes do preço">
          <small>Total ${icon('chevron-up')}</small><strong data-cz-price>${money(shownPrice ?? priceOf(config))}</strong>
        </button>
        ${last
          ? html`<button type="button" class="btn btn--price cz-next" data-act="add" aria-label="${editLineId ? 'Salvar alterações' : 'Adicionar ao carrinho'}">
              <span class="btn__label">${icon(editLineId ? 'check' : 'bag')} ${editLineId ? 'Salvar alterações' : 'Adicionar'}</span>
              <span class="btn__price" data-cz-price>${money(shownPrice ?? priceOf(config))}</span>
            </button>`
          : html`<button type="button" class="btn cz-next" data-act="next">${step === STEPS.length - 2 ? 'Ver resumo' : 'Continuar'} ${icon('arrow-right')}</button>`}
      `);
    }

    let metaMarkup = '';
    function renderMeta() {
      const markup = String(html`<span>${icon('users')} ${servesText(config)}</span><span>${icon('calendar')} Receba a partir de ${firstDate(config)}</span>`);
      if (markup !== metaMarkup) {
        metaMarkup = markup;
        el.meta.innerHTML = markup;
      }
      const name = editLineId ? 'Editando o bolo do carrinho' : displayName(config);
      if (el.name.textContent !== name) el.name.textContent = name;
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
      // o "pulinho" do preço, sem obrigar o navegador a recalcular a tela para reiniciar a animação
      root.querySelectorAll('[data-cz-price]').forEach((n) =>
        n.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.09)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' }),
      );
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

    /* Depois de qualquer escolha: o toque só valida e agenda. No quadro seguinte o painel e o preço são
       atualizados (a opção aparece marcada na hora); no outro, o bolo. Várias mudanças no mesmo instante
       viram uma atualização só. */
    let pending = null;
    let flushRaf = 0;
    let sceneRaf = 0;

    function flush() {
      flushRaf = 0;
      const p = pending;
      pending = null;
      if (!alive || !p) return;
      updatePrice();
      renderMeta();
      syncBackdrop();
      if (p.body) {
        renderBody({ still: true });
        renderSteps();
        // o painel atualizado nasce com o preço final; o número animado segue por cima
        if (shownPrice !== null) setPriceText(shownPrice);
      }
      if (p.scene === 'soon') sceneUpdateSoon();
      else if (p.scene === 'now' && !sceneRaf) {
        sceneRaf = requestAnimationFrame(() => {
          sceneRaf = 0;
          if (alive) sceneUpdate();
        });
      }
    }

    /** Aplica já o que estiver agendado (antes de fotografar o bolo para o carrinho, por exemplo). */
    function syncNow() {
      if (flushRaf) {
        cancelAnimationFrame(flushRaf);
        flush();
      }
      if (sceneRaf) cancelAnimationFrame(sceneRaf);
      sceneRaf = 0;
      sceneUpdate();
    }

    function commit({ rerender = true, scene = 'now', merge = '' } = {}) {
      config = normalizeConfig(config);
      record(merge);
      if (measuring) measureMarkup = '';
      if (ui.savedId && ui.savedKey !== configKey()) ui.savedId = null; // mudou depois de salvar: vira um bolo novo
      if (!pending) pending = { body: false, scene: 'none' };
      if (rerender) pending.body = true;
      if (scene === 'now' || (scene === 'soon' && pending.scene === 'none')) pending.scene = scene;
      if (!flushRaf) flushRaf = requestAnimationFrame(flush);
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
        later(() => alive && STEPS[step]?.id === 'resumo' && confetti({ count: cake.tier === 'mobile' ? 44 : 80 }), 500);
      }
    }

    function goto(i, { focus = true } = {}) {
      const next = Math.max(0, Math.min(STEPS.length - 1, i));
      if (next === step) return;
      step = next;
      visited.add(step);
      ui.tipOpen = false;
      ui.renaming = false;
      if (bgOpen) setBgBar(false);
      if (measuring) setMeasuring(false);
      manualView = null;
      setViewBar(false);
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
      const stage = config.backdrop;
      config = normalizeConfig(next);
      if (keepSize) config.size = size;
      if (!getBackdrop(next?.backdrop)) config.backdrop = stage; // inspiração ou surpresa não mexem no fundo escolhido
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
      syncNow();
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
      const stage = shot ? resolveBackdrop(config) : getBackdrop('rosa');
      const logo = await loadImage('assets/logo.webp');
      if (logo) {
        const lw = 250;
        const lh = (lw * logo.height) / logo.width;
        if (stage.tone === 'dark') {
          // sobre fundo escuro, a marca vai numa plaquinha clara
          g.fillStyle = 'rgba(255, 250, 248, 0.95)';
          g.beginPath();
          if (g.roundRect) g.roundRect((W - lw) / 2 - 30, 38, lw + 60, lh + 32, 30);
          else g.rect((W - lw) / 2 - 30, 38, lw + 60, lh + 32);
          g.fill();
        }
        g.drawImage(logo, (W - lw) / 2, 54, lw, lh);
      }
      const face = getComputedStyle(document.documentElement).getPropertyValue('--font-body').trim() || 'system-ui, sans-serif';
      await document.fonts?.load?.(`700 60px ${face}`).catch(() => {});
      g.textAlign = 'center';
      g.fillStyle = stage.ink;
      let fs = 64;
      const name = displayName(config);
      do {
        g.font = `700 ${fs}px ${face}`;
        fs -= 3;
      } while (g.measureText(name).width > W - 140 && fs > 30);
      g.fillText(name, W / 2, H - 150);
      g.fillStyle = stage.ink2;
      g.font = `600 30px ${face}`;
      g.fillText(`${servesText(config)} · criado no personalizador 3D da BOLAB`, W / 2, H - 92);
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
          <p class="cz-trust">${icon('info')}<span>Os valores acompanham o tamanho ${sizeOf(config).label}${(config.tiers || 1) > 1 ? ', os andares' : ''} e a altura do bolo. Base, velas, topos e mensagem têm preço fixo.</span></p>`,
        footer: html`<button type="button" class="btn btn--block" data-dialog-close>Entendi</button>`,
      });
    }

    /* ── escolhas ── */
    const setters = {
      shape: (v) => (config.shape = v),
      size: (v) => (config.size = v),
      occasion: (v) => (ui.occasion = v),
      tiers: (v) => {
        config.tiers = Number(v) || 1;
        if (config.tiers === 1) {
          config.tierCover = null;
          ui.tierMode = 'all';
        }
        ui.tier = config.tiers - 1;
      },
      height: (v) => (config.height = v),
      base: (v) => (config.base = v),
      tierMode: (v) => {
        const n = config.tiers || 1;
        if (v === 'each' && n > 1) {
          if (!Array.isArray(config.tierCover)) config.tierCover = Array.from({ length: n }, () => clone(config.covering));
          ui.tierMode = 'each';
          ui.tier = n - 1;
        } else {
          config.covering = clone(coverRef());
          config.tierCover = null;
          ui.tierMode = 'all';
        }
      },
      tier: (v) => {
        ui.tier = Number(v) || 0;
        const cov = coverRef();
        ui.colorChosen = cov.color !== getCovering(cov.type).defaultColor;
      },
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
        const cov = coverRef();
        cov.type = v;
        if (!ui.colorChosen) cov.color = getCovering(v).defaultColor;
        if (!finishAllowed(v, cov.style)) cov.style = 'liso';
        coverDone();
      },
      coveringColor: (v) => {
        coverRef().color = v;
        ui.colorChosen = true;
        coverDone();
      },
      finish: (v) => {
        const cov = coverRef();
        if (!finishAllowed(cov.type, v)) return;
        cov.style = v;
        // duas cores iguais não aparecem: a segunda começa em branco (ou em rosa-claro, se a cobertura já for branca)
        if (getFinish(v)?.two && cov.color2 === cov.color) cov.color2 = cov.color === '#ffffff' ? '#f7d3dc' : '#ffffff';
        coverDone();
      },
      color2: (v) => {
        coverRef().color2 = v;
        coverDone();
      },
      dripColor: (v) => (config.drip.color = v),
      pipingStyle: (v) => (config.piping.style = v),
      pipingWhere: (v) => (config.piping.where = v),
      pipingColor: (v) => (config.piping.color = v),
      decorGroup: (v) => (ui.decorGroup = v),
      decorArr: (v, id) => decorOpt(id, { arr: v }),
      decorQty: (v, id) => decorOpt(id, { qty: v }),
      decorColor: (v, id) => decorOpt(id, { color: v }),
      candleStyle: (v) => (config.decor.candleStyle = v),
      messageMode: (v) => (config.decor.messageMode = v),
      script: (v) => (config.decor.script = v),
      messageColor: (v) => (config.decor.messageColor = v),
      topperColor: (v) => (config.decor.topper.color = v),
    };
    function decorOpt(id, patch) {
      if (!getDecor(id)) return;
      config.decor.opts = { ...config.decor.opts, [id]: { ...decorOptions(config, id), ...patch } };
    }

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
      if (i >= 0) {
        items.splice(i, 1);
        if (ui.decorOpen === id) ui.decorOpen = null;
      } else if (items.length >= MAX_DECORS) {
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

    /* ── cor livre: matiz, tons, código e cores recentes ── */
    function openColorPicker(setKey, btn) {
      const [name, arg] = String(setKey).split('.');
      const apply = setters[name];
      if (!apply) return;
      const start = btn.closest('.cz-colors')?.querySelector('.cz-color.is-on')?.dataset.value;
      let [h, s, v] = hexToHsv(HEX6.test(start || '') ? start : '#f7d3dc');
      const stored = prefs.get('customizerColors', []);
      const recent = (Array.isArray(stored) ? stored : []).filter((x) => HEX6.test(x)).slice(0, 8);
      const dlg = openDialog({
        title: 'Escolha a cor',
        body: html`<div class="cz-cp">
          <div class="cz-cp__sv" data-cp-sv tabindex="0" role="application" aria-label="Tom da cor. Arraste, ou use as setas, para clarear, escurecer ou suavizar."><i data-cp-dot></i></div>
          <input class="cz-cp__hue" data-cp-hue type="range" min="0" max="359" step="1" aria-label="Matiz" />
          <div class="cz-cp__tones" data-cp-tones role="group" aria-label="Tons prontos desta cor"></div>
          <div class="cz-cp__hex">
            <i class="cz-cp__now" data-cp-now></i>
            <label for="cz-cp-hex">Código da cor</label>
            <input class="input" id="cz-cp-hex" data-cp-hex type="text" maxlength="7" autocomplete="off" spellcheck="false" />
          </div>
          ${recent.length
            ? html`<span class="cz-sub__label">Cores recentes</span>
                <div class="cz-colors">
                  ${recent.map((x) => html`<button type="button" class="cz-color ${isLight(x) ? 'is-light' : ''}" style="--c:${x}" data-cp-color="${x}" aria-label="Cor ${x.toUpperCase()}" title="${x.toUpperCase()}"></button>`)}
                </div>`
            : ''}
        </div>`,
        footer: html`<button type="button" class="btn btn--block" data-cp-ok>Usar esta cor</button>`,
      });
      const q = (sel) => dlg.el.querySelector(sel);
      const sv = q('[data-cp-sv]');
      const dot = q('[data-cp-dot]');
      const hue = q('[data-cp-hue]');
      const hexIn = q('[data-cp-hex]');
      const now = q('[data-cp-now]');
      const tones = q('[data-cp-tones]');
      let tonesHue = -1;
      const paint = (keepText = false) => {
        const hex = hsvToHex(h, s, v);
        sv.style.setProperty('--h', String(Math.round(h)));
        dot.style.left = `${s * 100}%`;
        dot.style.top = `${(1 - v) * 100}%`;
        dot.style.setProperty('--c', hex);
        now.style.setProperty('--c', hex);
        hue.value = String(Math.round(h));
        if (!keepText) hexIn.value = hex.toUpperCase();
        if (tonesHue !== Math.round(h)) {
          tonesHue = Math.round(h);
          tones.innerHTML = TONES.map(([ts, tv]) => {
            const x = hsvToHex(h, ts, tv);
            return `<button type="button" style="--c:${x}" data-cp-color="${x}" aria-label="Tom ${x.toUpperCase()}"></button>`;
          }).join('');
        }
      };
      const pick = (ev) => {
        const box = sv.getBoundingClientRect();
        s = clamp01((ev.clientX - box.left) / box.width);
        v = 1 - clamp01((ev.clientY - box.top) / box.height);
        paint();
      };
      sv.addEventListener('pointerdown', (ev) => {
        sv.setPointerCapture?.(ev.pointerId);
        pick(ev);
      });
      sv.addEventListener('pointermove', (ev) => {
        if (ev.buttons || ev.pointerType === 'touch') pick(ev);
      });
      sv.addEventListener('keydown', (ev) => {
        const step = { ArrowLeft: [-0.04, 0], ArrowRight: [0.04, 0], ArrowUp: [0, 0.04], ArrowDown: [0, -0.04] }[ev.key];
        if (!step) return;
        ev.preventDefault();
        s = clamp01(s + step[0]);
        v = clamp01(v + step[1]);
        paint();
      });
      hue.addEventListener('input', () => {
        h = Number(hue.value) || 0;
        // do cinza/branco para uma cor: a matiz só aparece com alguma saturação
        if (s < 0.08) s = 0.45;
        paint();
      });
      hexIn.addEventListener('input', () => {
        let t = hexIn.value.trim();
        if (t && t[0] !== '#') t = `#${t}`;
        if (!HEX6.test(t)) return;
        [h, s, v] = hexToHsv(t);
        paint(true);
      });
      dlg.el.addEventListener('click', (ev) => {
        const c = ev.target.closest('[data-cp-color]')?.dataset.cpColor;
        if (c) {
          const keepHue = h;
          [h, s, v] = hexToHsv(c);
          if (s < 0.02) h = keepHue;
          paint();
          return;
        }
        if (!ev.target.closest('[data-cp-ok]')) return;
        const hex = hsvToHex(h, s, v);
        prefs.set('customizerColors', [hex, ...recent.filter((x) => x !== hex)].slice(0, 8));
        dlg.close();
        if (!alive) return;
        apply(hex, arg);
        commit();
      });
      paint();
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
      undo: () => travel(hist.past, hist.future, 'Última mudança desfeita'),
      redo: () => travel(hist.future, hist.past, 'Mudança refeita'),
      viewmenu: () => setViewBar(!viewOpen),
      view(v) {
        if (!cake) return;
        const next = VIEWS.some((x) => x.id === v) ? v : 'default';
        if (measuring && next !== 'front') setMeasuring(false);
        manualView = next === 'default' ? null : next;
        if (cutaway && next !== 'default') setCutaway(false, true);
        cake.setView(manualView || viewFor(step));
        setViewBar(false); // a barra sai da frente: o bolo é o que interessa
        flash(next === 'default' ? 'Vista padrão' : `Vista: ${VIEWS.find((x) => x.id === next).name.toLowerCase()}`);
      },
      measure() {
        setMeasuring(!measuring);
        setViewBar(false);
        if (!measuring) flash('Medidas escondidas');
      },
      struct() {
        const custom = (config.tiers || 1) > 1 || config.height !== 'padrao' || config.base !== 'boleira';
        ui.structOpen = !(ui.structOpen ?? custom);
        renderBody({ still: true });
      },
      palette(v) {
        const p = COLOR_PALETTES.find((x) => x.id === v);
        if (!p) return;
        config = applyPalette(config, p);
        ui.colorChosen = true;
        commit();
        el.live.textContent = `Paleta ${p.name} aplicada ao bolo inteiro`;
      },
      'pick-color': (v, btn) => openColorPicker(v, btn),
      adjust(v) {
        if (v === 'velas') {
          // o painel das velas fica logo abaixo das opções: a ficha leva até ele
          root.querySelector('[data-cz-candles]')?.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
          return;
        }
        ui.decorOpen = ui.decorOpen === v ? null : v;
        renderBody({ still: true });
      },
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
        ui.decorOpen = null;
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
      bgmenu: () => setBgBar(!bgOpen),
      backdrop(v) {
        config.backdrop = v;
        commit({ rerender: false, scene: 'none' });
        syncBackdrop();
        renderBgBar();
        el.bgbar.querySelector('.is-on')?.focus({ preventScroll: true });
        el.live.textContent = `Fundo do palco: ${getBackdrop(v) ? stageBackdrop.name : `automático (${stageBackdrop.name})`}`;
      },
      add: addToCart,
      save: toggleSave,
      share: () => shareCake(false),
      download: () => shareCake(true),
    };

    on(root, 'click', '[data-set]', (_ev, btn) => {
      // "decorCor.macarons" = escolha "decorCor" da decoração "macarons"
      const [name, arg] = btn.dataset.set.split('.');
      const fn = setters[name];
      if (!fn || btn.disabled) return;
      fn(btn.dataset.value, arg);
      commit();
    });

    on(root, 'click', '[data-act]', (_ev, btn) => {
      const fn = actions[btn.dataset.act];
      if (fn) fn(btn.dataset.value, btn);
    });

    // o painel "Fundo" fecha ao tocar fora dele ou com Esc
    const onDocDown = (ev) => {
      if (bgOpen && !ev.target.closest?.('[data-cz-bgbar], [data-act="bgmenu"]')) setBgBar(false);
      // a barra de vistas fica aberta enquanto a pessoa gira o bolo; fecha ao tocar no painel
      if (viewOpen && !ev.target.closest?.('[data-cz-viewbar], [data-act="viewmenu"], .cz-stage')) setViewBar(false);
    };
    document.addEventListener('pointerdown', onDocDown, true);
    root.addEventListener('keydown', (ev) => {
      // Ctrl+Z desfaz, Ctrl+Shift+Z (ou Ctrl+Y) refaz — fora dos campos de texto
      const k = ev.key.toLowerCase();
      if ((ev.ctrlKey || ev.metaKey) && (k === 'z' || k === 'y') && !ev.target.closest?.('input, textarea')) {
        ev.preventDefault();
        if (k === 'y' || ev.shiftKey) actions.redo();
        else actions.undo();
        return;
      }
      if (ev.key !== 'Escape') return;
      if (viewOpen) {
        setViewBar(false);
        el.tools.querySelector('[data-act="viewmenu"]').focus();
      }
      if (!bgOpen) return;
      setBgBar(false);
      el.tools.querySelector('[data-act="bgmenu"]').focus();
    });

    root.addEventListener('qty', (ev) => {
      const id = ev.target.dataset.id;
      if (id === 'layers') setLayers(ev.detail);
      else if (id === 'candles') config.decor.candles = ev.detail;
      else return;
      commit({ merge: id });
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
        commit({ rerender: false, scene: had === Boolean(config.decor.message) ? 'soon' : 'now', merge: 'message' });
      } else if (input.dataset.field === 'name') {
        if (input.value !== cleanName(input.value)) writeBack(input, cleanName);
        config.name = cleanName(input.value);
        commit({ rerender: false, scene: 'none', merge: 'name' });
      } else if (input.dataset.field === 'topper') {
        const clean = (v) => cleanMessage(v, TOPPER_MAX);
        const had = Boolean(config.decor.topper.text);
        if (input.value !== clean(input.value)) writeBack(input, clean);
        config.decor.topper.text = clean(input.value);
        const count = root.querySelector('[data-count="topper"]');
        if (count) count.textContent = `${config.decor.topper.text.length}/${TOPPER_MAX}`;
        commit({ rerender: false, scene: had === Boolean(config.decor.topper.text) ? 'soon' : 'now', merge: 'topper' });
      } else if (input.dataset.field === 'number') {
        const clean = (v) => String(v).replace(/\D/g, '').slice(0, 3);
        if (input.value !== clean(input.value)) writeBack(input, clean);
        config.decor.number = clean(input.value);
        commit({ rerender: false, scene: 'soon', merge: 'number' });
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
      if (input.dataset.field === 'message') {
        if (config.decor.messageMode === 'bico') cake?.setView('above');
        else cake?.focusPlaque(true);
      }
      syncKeyboard();
    });

    on(root, 'focusout', '[data-field]', (_ev, input) => {
      const field = input.dataset.field;
      later(() => {
        if (!alive) return;
        if (field === 'message' && !root.querySelector('[data-field="message"]:focus')) {
          cake?.focusPlaque(false);
          if (config.decor.messageMode === 'bico') cake?.setView(manualView || viewFor(step));
          // espaço sobrando no fim não vira parte da mensagem
          if (config.decor.message !== config.decor.message.trim()) {
            config.decor.message = config.decor.message.trim();
            const box = root.querySelector('[data-field="message"]');
            if (box) box.value = config.decor.message;
            const count = root.querySelector('[data-count="message"]');
            if (count) count.textContent = `${config.decor.message.length}/${MESSAGE_MAX}`;
            commit({ rerender: false, merge: 'message' });
          }
        }
        if (field === 'topper' && config.decor.topper.text !== config.decor.topper.text.trim()) {
          config.decor.topper.text = config.decor.topper.text.trim();
          commit({ merge: 'topper' });
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
      // quality() é só leitura: nível, proporção de pixels em uso e o estado do regulador de resolução
      window.__cz = { cake: () => cake, config: () => config, set: (next) => replaceConfig(next), goto, quality: () => cake?.quality() ?? null };
    }

    /* ── primeira pintura ── */
    el.cz.dataset.step = STEPS[step].id;
    renderSteps();
    renderBody();
    renderFoot();
    renderMeta();
    updatePrice();
    setRotating(rotating, false);
    syncBackdrop({ instant: true });
    // a tela aparece primeiro (fundo, opções e o aviso de "preparando"); a cena 3D começa logo em seguida
    requestAnimationFrame(() => requestAnimationFrame(() => alive && startScene()));

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
      config = normalizeConfig(config);
      syncModes();
      hist.past.length = 0;
      hist.future.length = 0;
      hist.lock = true;
      commit({ rerender: false });
      hist.lock = false;
      syncHist();
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
      document.removeEventListener('pointerdown', onDocDown, true);
      window.removeEventListener('resize', onResize);
      overlayWatch.disconnect();
      cancelAnimationFrame(flushRaf);
      cancelAnimationFrame(sceneRaf);
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
