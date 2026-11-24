// BOLAB — "Monte seu bolo": personalizador 3D em 7 etapas, uma pergunta por vez.
// A tela só orquestra: as opções vêm de js/data/customizer.js, preço e resumo de js/customizer/pricing.js
// e o desenho 3D de js/customizer/engine.js. Nada aqui redesenha a tela inteira: cada mudança
// atualiza o painel no lugar e chama cake.setConfig().
//
// Fluidez no celular: o toque só registra a escolha; no quadro seguinte o painel é atualizado no lugar
// (só o que mudou — ver morph) e, no outro, o bolo. Nada pesado roda dentro do toque.
//
// r7-criar — o fluxo de criação:
//   começo   quem chega sem bolo nenhum parte de um bolo EM BRANCO (blankConfig) e escolhe como começar, no próprio
//            painel: do zero (padrão) · de uma inspiração · surpresa. Produto do cardápio, link, favorito, rascunho e
//            bolo do carrinho caem direto no bolo deles.
//   escolha  cada etapa é uma fila curta de PERGUNTAS (QUESTIONS); a tela mostra uma por vez, em cartões grandes, com
//            as mais pedidas primeiro e "Ver todas" (grupos + busca). O que a cozinha não faz aparece apagado, com o
//            motivo (prober → rules.js). "Continuar" segue a fila; a faixa de perguntas e as fichas de etapa pulam.
//   saída    no resumo, além de "Adicionar": "Mostrar para um adulto" (js/atelier/ui/card.js → openShow): o bolo com
//            nome, preço, link, QR feito no aparelho e mensagem pronta. Quem abre o link vê "Pedir este bolo".
//
// Composição da tela (r6-tela2; a régua está em css/customizer.css, "Palco: a grade" e "Painel: o ritmo"):
//   palco    cabeçalho (voltar · título · desfazer, refazer, recomeçar) · UMA coluna de ferramentas no canto de cima
//            à direita (ver por dentro · revelar · velas · "…") · faixa de baixo (a Bô e, ao lado, um aviso por vez)
//   folha    "Ateliê" (botão "…"): jogo, som, modo rápido, vistas, giro, medidas, fundo e cenário — por cima do painel
//   painel   fichas de etapa · a pergunta em cartaz (faixa de perguntas, pergunta, opções) · barra de total
//
// Entradas pelo endereço:  ?bolo=<id salvo>  ·  ?base=<id do produto>  ·  ?linha=<id da linha do carrinho>
// (esta última abre o bolo que já está no carrinho para editar; o botão final vira "Salvar alterações")
// ·  ?c=<texto>  abre exatamente o bolo descrito no texto (js/customizer/share.js): o link que o cliente
// compartilha e o que o confeiteiro usa para ver o bolo do pedido.
//
// O que não se faz de verdade em confeitaria é corrigido a cada mudança (js/customizer/rules.js → enforceRules),
// com um aviso que explica; alertas e dicas aparecem no painel. Tudo o que acontece é avisado ao barramento
// do ateliê (js/atelier/bus.js), no quadro seguinte ao toque.
import { html, raw, icon, money, dateLong, on, toast, openDialog, confirmDialog, debounce, confetti } from '../ui.js';
import { bus } from '../atelier/bus.js';
import { createNotices, NOTE_ICON } from '../atelier/ui/notices.js';
import { diffConfig } from '../atelier/diff.js';
import { copyText } from '../ui.js';
import { rulesForStep, rulesOf, enforceRules, applyFix } from '../customizer/rules.js';
import { encodeConfig, decodeConfig } from '../customizer/share.js';
import {
  activeOf,
  isVolcano,
  FLAVOR_GROUPS,
  FILLING_GROUPS,
  FINISH_GROUPS,
  FILL_ADDS,
  SOAKS,
  TRIMS,
  DRIP_AMOUNTS,
  DRIP_LENGTHS,
  DRIP_METAL_PRICE,
  METAL_COLORS,
  REVEAL_COLORS,
  REVEAL_PRICE,
  getSoak,
  getFillAdd,
  getTrim,
  getRevealColor,
} from '../data/customizer.js';
import { VOLCANO_COVERS } from '../customizer/pricing.js';
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
  MAX_PLACED,
  MESSAGE_MAX,
  MESSAGE_PRICE,
  DRIP_PRICE,
  getFlavor,
  getFilling,
  getCovering,
  colorName,
} from '../data/customizer.js';
import {
  blankConfig,
  defaultConfig,
  normalizeConfig,
  cleanMessage,
  breakdownOf,
  priceOf,
  deltaOf,
  sizeOf,
  servesOf,
  prepHoursOf,
  partsOf,
  summaryOf,
  billableConfig,
  billPreview,
  billNotice,
  autoName,
  displayName,
  servesText,
  diametersOf,
  heightCmOf,
  coversOf,
  decorOptions,
  scriptRoom,
  placedGroups,
} from '../customizer/pricing.js';
import { PRESETS, OCCASIONS, COLOR_PALETTES, applyPalette, getPreset, presetForProduct, randomConfig } from '../customizer/presets.js';
// r5-tela: o motor 3D — e o que só ele usa (looks, decor2, party, quality, OrbitControls, RoomEnvironment: uns
// 375 KB) — não segura mais a primeira tela. O arquivo é pedido já (o roteador pede junto com esta tela, em
// paralelo), mas o painel de opções aparece sem esperar por ele; startScene() espera o motor chegar.
const engineLoad = import('../customizer/engine.js');
engineLoad.catch(() => {}); // a falha é tratada em startScene (cai no desenho 2D)
import { decorNotes } from '../customizer/decor.js';
import { BACKDROPS, BACKDROP_AUTO, getBackdrop, resolveBackdrop, backdropCss } from '../customizer/backdrop.js';
import { drawCake2D, thumb2D } from '../customizer/fallback.js';
// r5-decor: cardápio de bicos, decorações, velas, mensagens, topos e temas; módulos de peças sob demanda
import { pipingPlaces, CANDLE_PALETTES, PLAQUE_SHAPES, TOPPER_STYLES, TOPPER_FINISHES, DOODLES, THEMES, getTheme, getCandleStyle, isActive, DECOR_COLOR_NAMES } from '../data/customizer-decor.js';
import { applyTheme, pipingPriceOf } from '../customizer/pricing.js';
import { warmDecorModules } from '../customizer/kit.js';
// r7-criar: curadoria e textos da tela guiada (o que abre cada pergunta, explicações de uma linha, kits, grupos dos temas)
import { FIRST, HINTS, TERMS, KITS, THEME_GROUPS } from '../data/customizer-guia.js';

const STEPS = [
  { id: 'formato', label: 'Formato', title: 'Formato e tamanho', sub: 'Todo bolo começa pela fôrma: o formato e quantas fatias você precisa.' },
  { id: 'massa', label: 'Massa', title: 'Hora da massa', sub: 'Quantas camadas e qual sabor em cada uma.' },
  { id: 'recheio', label: 'Recheio', title: 'Agora, o recheio', sub: 'O que vai entre uma camada e outra.' },
  { id: 'cobertura', label: 'Cobertura', title: 'Mão na espátula', sub: 'O tipo, a cor, o estilo e, se quiser, aquela calda escorrendo.' },
  { id: 'acabamento', label: 'Bico', title: 'Saco de confeitar', sub: 'O confeitado de bico que contorna o bolo.' },
  { id: 'decoracao', label: 'Decoração', title: 'Os toques finais', sub: 'Enfeites, velas, mensagem e topo. Dá até para colocar peça por peça, com o dedo.' },
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
  oval: art(`<ellipse cx="24" cy="24" rx="20" ry="13.500" ${SOFT}/>`),
  flor: art(`<path d="M37.400 16.200A8.500 8.500 0 0 1 37.400 31.800 8.500 8.500 0 0 1 24 39.500 8.500 8.500 0 0 1 10.600 31.800 8.500 8.500 0 0 1 10.600 16.200 8.500 8.500 0 0 1 24 8.500 8.500 8.500 0 0 1 37.400 16.200Z" ${SOFT}/>`),
  vulcao: art(`<circle cx="24" cy="24" r="17" ${SOFT}/><circle cx="24" cy="24" r="5.500"/><path d="M24 7v6M36 12l-3.500 4.500M12 12l3.500 4.500"/>`),
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

/** Nome de uma cor de decoração (as metalizadas, as de fita e as pastel têm nome próprio). */
const tintName = (hex) => (colorName(hex) === 'Cor personalizada' && DECOR_COLOR_NAMES[String(hex).toLowerCase()]) || colorName(hex);
const decorSwatches = (hexes) => hexes.map((hex) => ({ hex, name: tintName(hex) }));

const ICON = {
  ruler: ico(`<path d="M3 17 17 3l4 4L7 21Z"/><path d="m7.500 12.500 2 2M10.500 9.500l2 2M13.500 6.500l2 2"/>`),
  redo: ico(`<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.300L21 13"/>`),
  chef: ico(`<path d="M6 13.900A4 4 0 0 1 7.400 6.100a5 5 0 0 1 9.200 0A4 4 0 0 1 18 13.900V19a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1Z"/><path d="M6 17h12"/>`),
  slice: ico(`<circle cx="9" cy="7" r="2"/><path d="M7.200 7.900 3 11v9c0 .6.4 1 1 1h16c.6 0 1-.4 1-1v-9c0-2-3-6-7-8l-3.600 2.600"/><path d="M16 13H3"/><path d="M16 17H3"/>`),
  spin: ico(`<path d="M16.500 7.500C15.600 4.200 14 2 12 2 9.200 2 7 6.500 7 12s2.200 10 5 10c.3 0 .7-.1 1-.2"/><path d="m15.200 13.700 3.800 1.900-1.900 3.800"/><path d="M19 15.600c-1.800.9-4.300 1.400-7 1.400-5.500 0-10-2.200-10-5s4.500-5 10-5c4.800 0 8.900 1.700 9.800 4"/>`),
  // r5-tela: modo rápido, modo ateliê, tirar uma peça, vídeo e encomendas (jogo)
  bolt: ico(`<path d="M13 2 4.500 13.500H11l-1 8.500 8.500-11.500H12Z" ${SOFT}/>`),
  atelier: ico(`<path d="m12 3 1.900 5.100L19 10l-5.100 1.900L12 17l-1.900-5.100L5 10l5.100-1.900Z" ${SOFT}/><path d="M19 15v4M17 17h4M5 3v3M3.500 4.500h3"/>`),
  minus: ico(`<path d="M5 12h14"/>`),
  film: ico(`<rect x="3" y="4" width="18" height="16" rx="3" ${SOFT}/><path d="m10 9 5 3-5 3Z"/>`),
  card: ico(`<rect x="4" y="3" width="16" height="18" rx="3" ${SOFT}/><circle cx="12" cy="10" r="3"/><path d="M8 17h8"/>`),
  finger: ico(`<path d="M9 11V5.500a1.500 1.500 0 0 1 3 0V11"/><path d="M12 10.500V9a1.500 1.500 0 0 1 3 0v2"/><path d="M15 11v-.5a1.500 1.500 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.200a5 5 0 0 1-4-2L4 15.500a1.500 1.500 0 0 1 2.400-1.800L9 16" ${SOFT}/>`),
  ticket: ico(`<path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4Z" ${SOFT}/><path d="M14 6v12" stroke-dasharray="2 2.500"/>`),
  // r6-tela: a folha "Ateliê" (o que é secundário no palco mora nela) e o som
  more: ico(`<circle cx="5" cy="12" r="1.300" fill="currentColor"/><circle cx="12" cy="12" r="1.300" fill="currentColor"/><circle cx="19" cy="12" r="1.300" fill="currentColor"/>`),
  // o jogo (encomendas e figurinhas): um controle de videogame, no traço dos outros ícones (desenho no estilo Lucide, ISC)
  game: ico(`<path d="M17.300 5H6.700a4 4 0 0 0-4 3.600C2.600 9.400 2 14.500 2 16a3 3 0 0 0 3 3c1 0 1.500-.5 2-1l1.400-1.400A2 2 0 0 1 9.800 16h4.400a2 2 0 0 1 1.400.6L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.500-.6-6.600-.7-7.400A4 4 0 0 0 17.300 5Z" ${SOFT}/><path d="M6 11h4M8 9v4M15 12h.01M18 10h.01"/>`),
  note: ico(`<path d="M9 18V6l11-2v12"/><circle cx="6" cy="18" r="3" ${SOFT}/><circle cx="17" cy="16" r="3" ${SOFT}/>`),
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
    if (n === 1) return 'Com uma camada só, é o bolo simples: uma massa alta, sem recheio. Para o corte ficar bonito, a gente indica 3 camadas.';
    if (n === 2) return 'Duas camadas finas de massa e um recheio generoso no meio: um bolo baixo, ótimo para o café.';
    if (n === 4) return 'Quatro camadas finas e três recheios: aquele bolo alto de vitrine, com uns 13 cm. Fica lindo com calda escorrendo.';
    if (isVolcano(c)) return 'Vulcão pede massa fofa e úmida: cenoura com brigadeiro é o clássico; chocolate com cobertura branca fica lindo no contraste.';
    const tips = {
      baunilha: 'A baunilha é coringa: combina com qualquer recheio, dos frutados aos de chocolate.',
      chocolate: 'Nossa massa de chocolate leva cacau 70%. Com brigadeiro ou framboesa, não tem erro.',
      redvelvet: 'Red velvet pede um recheio claro, como o de ninho, para o vermelho aparecer bem no corte.',
      cenoura: 'Cenoura com brigadeiro é paixão nacional. Com doce de leite também fica uma delícia.',
      limao: 'A massa de limão é levinha. Com recheio de limão ou de coco, fica bem refrescante.',
      morango: 'A massa de morango tem um rosa lindo. Com recheio de ninho, lembra morango com leite.',
    };
    return tips[main] || `${getFlavor(main).name}: ${getFlavor(main).craft}`;
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
    const tip = tips[f] || `${getFilling(f).name}: ${getFilling(f).craft}`;
    return n > 2 ? `${tip} Com ${n} camadas, você pode alternar dois recheios.` : tip;
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
    if (isVolcano(c)) return 'No vulcão a cobertura vai morna, para escorrer devagar. Com granulado por cima, é o bolo de festa de quintal.';
    return tips[c.covering.type] || `${getCovering(c.covering.type).name}: ${getCovering(c.covering.type).craft}`;
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
    if (items.length && !items.some((id) => c.decor.opts?.[id])) return 'Na pergunta “Enfeites”, toque num enfeite que já está no bolo para mudar o arranjo, a quantidade e a cor.';
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

const ordinal = (n) => `${n}ª`;
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const low = (t) => t.charAt(0).toLowerCase() + t.slice(1);
const plain = (s) =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
const found = (item, q) => plain(`${item.name} ${item.desc || ''} ${(item.tags || []).join(' ')}`).includes(q);

/* ───────── r7-criar: uma pergunta por vez ─────────
   Cada etapa é uma fila curta de perguntas, em linguagem de gente. A tela mostra UMA por vez, com as opções em
   cartões grandes; "Continuar" segue a fila e a faixa de perguntas (logo acima do título) leva direto a qualquer uma.
     id    nome estável dentro da etapa (vai no evento 'question' do barramento)
     nav   rótulo curto, na faixa de perguntas
     ask   a pergunta (texto, ou função do bolo)
     show  quando devolve false, a pergunta não existe para este bolo (ex.: onde vai o bico, sem bico)
     skip  quando devolve true, "Continuar" passa direto por ela (só há uma resposta possível), mas ela continua na faixa
     empty opcional e ainda sem nada escolhido: o botão de seguir diz "Pular"                                        */
const hasPlaces = (c) => {
  const p = getPiping(c.piping.style);
  return Boolean(p) && p.id !== 'liso' && !p.combo && !p.side;
};
const QUESTIONS = {
  formato: [
    { id: 'formato', nav: 'Formato', ask: 'Qual o formato do bolo?' },
    { id: 'tamanho', nav: 'Tamanho', ask: 'De que tamanho?' },
    { id: 'andares', nav: 'Andares', ask: 'Quantos andares?', skip: (c) => isVolcano(c) || c.size === 'bento' },
    { id: 'altura', nav: 'Altura', ask: (c) => ((c.tiers || 1) > 1 ? 'Qual a altura de cada andar?' : 'Qual a altura do bolo?'), skip: (c) => isVolcano(c) },
    { id: 'base', nav: 'Base', ask: 'Onde o bolo vai apoiado?' },
  ],
  massa: [
    { id: 'sabor', nav: 'Sabor', ask: 'Qual o sabor da massa?' },
    { id: 'calda', nav: 'Calda', ask: 'Quer a massa mais molhadinha?', empty: (c) => !c.soak },
  ],
  recheio: [
    { id: 'sabor', nav: 'Sabor', ask: (c) => (c.fillings.length ? 'E o recheio, qual vai ser?' : isVolcano(c) ? 'O vulcão não leva recheio' : 'Este bolo ainda não tem recheio') },
    { id: 'adicional', nav: 'Pedaços', ask: 'Quer pedaços no recheio?', show: (c) => c.fillings.length > 0, empty: (c) => !c.fillAdds.some(Boolean) && !c.reveal.on },
  ],
  cobertura: [
    { id: 'tipo', nav: 'Cobertura', ask: (c) => (isVolcano(c) ? 'Que cobertura transborda do furo?' : 'Qual a cobertura?') },
    { id: 'cor', nav: 'Cor', ask: (c) => (c.covering.type === 'naked' ? 'De que cor é o creme do topo?' : 'De que cor?') },
    { id: 'estilo', nav: 'Desenho', ask: 'Como é o desenho da cobertura?', show: (c) => !isVolcano(c) },
    { id: 'transborda', nav: 'Quantidade', ask: 'Quanto a cobertura transborda?', show: (c) => isVolcano(c) },
    { id: 'calda', nav: 'Calda', ask: 'Quer calda escorrendo?', show: (c) => !isVolcano(c), empty: (c) => !c.drip.on },
  ],
  acabamento: [
    { id: 'bico', nav: 'Bico', ask: 'Quer enfeitar com creme de bico?', empty: (c) => c.piping.style === 'liso' },
    { id: 'onde', nav: 'Onde', ask: 'Onde vai o creme de bico?', show: hasPlaces },
    { id: 'cor', nav: 'Cor', ask: 'De que cor é o creme de bico?', show: (c) => c.piping.style !== 'liso' },
  ],
  decoracao: [
    { id: 'tema', nav: 'Tema', ask: 'Quer um tema pronto?', empty: (c) => !c.decor.theme },
    { id: 'enfeites', nav: 'Enfeites', ask: 'O que vai em cima do bolo?', empty: (c) => !c.decor.items.some((id) => id !== 'velas') && !c.decor.placed.length },
    { id: 'velas', nav: 'Velas', ask: 'Vai ter velas?', empty: (c) => !c.decor.items.includes('velas') },
    { id: 'mensagem', nav: 'Mensagem', ask: 'Quer escrever uma mensagem?', empty: (c) => !c.decor.message },
    { id: 'topo', nav: 'Topo', ask: 'Quer um topo com nome ou idade?', empty: (c) => !c.decor.topper.text },
  ],
  resumo: [],
};
/** As perguntas que existem para este bolo, na ordem. */
const questionsOf = (stage, c) => (QUESTIONS[stage] || []).filter((q) => !q.show || q.show(c));
const askText = (q, c) => (typeof q.ask === 'function' ? q.ask(c) : q.ask);

/* Desenhos a traço das perguntas sem miniatura 3D (andares, altura, onde vai o bico, velas, começo). */
const TIER_ART = {
  1: art(`<path d="M6 41h36"/><rect x="12" y="23" width="24" height="18" rx="3" ${SOFT}/>`),
  2: art(`<path d="M6 41h36"/><rect x="9" y="27" width="30" height="14" rx="3" ${SOFT}/><rect x="15" y="14" width="18" height="13" rx="3" ${SOFT}/>`),
  3: art(`<path d="M6 41h36"/><rect x="7" y="30" width="34" height="11" rx="3" ${SOFT}/><rect x="12" y="19" width="24" height="11" rx="3" ${SOFT}/><rect x="17" y="8" width="14" height="11" rx="3" ${SOFT}/>`),
};
const HEIGHT_ART = {
  1: art(`<path d="M6 41h36"/><rect x="10" y="29" width="28" height="12" rx="3" ${SOFT}/>`),
  2: art(`<path d="M6 41h36"/><rect x="10" y="24" width="28" height="17" rx="3" ${SOFT}/><path d="M10 32.500h28"/>`),
  3: art(`<path d="M6 41h36"/><rect x="10" y="17" width="28" height="24" rx="3" ${SOFT}/><path d="M10 25h28M10 33h28"/>`),
  4: art(`<path d="M6 41h36"/><rect x="10" y="8" width="28" height="33" rx="3" ${SOFT}/><path d="M10 16.300h28M10 24.500h28M10 32.800h28"/>`),
};
const CAKE_SIDE = `<path d="M6 41h36"/><rect x="10" y="17" width="28" height="24" rx="3" ${SOFT}/>`;
const SCALLOP = (y) => `<path d="M10 ${y}q2.300-5 4.700 0t4.700 0 4.700 0 4.700 0 4.700 0 4.500 0" stroke-width="3.200"/>`;
const WHERE_ART = {
  top: art(`${CAKE_SIDE}${SCALLOP(17)}`),
  base: art(`${CAKE_SIDE}${SCALLOP(40)}`),
  both: art(`${CAKE_SIDE}${SCALLOP(17)}${SCALLOP(40)}`),
  cintura: art(`${CAKE_SIDE}${SCALLOP(30)}`),
  cobre: art(`<path d="M6 41h36"/><path d="M10 20v18a3 3 0 0 0 3 3h22a3 3 0 0 0 3-3V20" ${SOFT}/><ellipse cx="24" cy="19" rx="14" ry="6" fill="currentColor" fill-opacity=".5"/><path d="M14 18q2-3 4 0t4 0 4 0 4 0 4 0" stroke-width="2.200"/>`),
};
const FLAME = (x, y) => `<path d="M${x} ${y - 6}c1.600 1.600 2.200 2.600 2.200 3.600a2.200 2.200 0 0 1-4.400 0c0-1 .600-2 2.200-3.600Z" fill="currentColor" fill-opacity=".3"/>`;
const CANDLE_ART = {
  none: art(`<circle cx="24" cy="24" r="15"/><path d="m13.500 13.500 21 21"/>`),
  classica: art(`${FLAME(24, 16)}<rect x="19" y="17" width="10" height="24" rx="3" ${SOFT}/><path d="m19 25 10-4M19 32l10-4M19 39l10-4"/>`),
  longa: art(`${FLAME(17, 13)}${FLAME(31, 13)}<rect x="15" y="14" width="4" height="27" rx="2" ${SOFT}/><rect x="29" y="14" width="4" height="27" rx="2" ${SOFT}/>`),
  espiral: art(`${FLAME(24, 15)}<rect x="20" y="16" width="8" height="25" rx="3" ${SOFT}/><path d="m20 22 8-3M20 27l8-3M20 32l8-3M20 37l8-3"/>`),
  numero: art(`${FLAME(24, 13)}<path d="M17 21c0-4 3-6.500 7-6.500s7 2.500 7 6c0 6-13 9-14 20.500h14" stroke-width="4"/>`),
  letras: art(`${FLAME(13, 18)}${FLAME(24, 18)}${FLAME(35, 18)}<path d="M10 40V24h3.500a3.500 3.500 0 0 1 0 7H10M20 40l4-16 4 16M21.500 34.500h5M32 40V24h3.500a3.500 3.500 0 0 1 0 7H32l5 9"/>`),
  estrela: art(`${FLAME(24, 11)}<path d="m24 13 3 6.300 6.900.800-5.100 4.700 1.400 6.800-6.200-3.400-6.200 3.400 1.400-6.800-5.100-4.700 6.900-.800Z" ${SOFT}/><path d="M24 32v10"/>`),
  faisca: art(`<path d="M24 22v20" stroke-width="3.200"/><path d="M24 5v6M24 13l0 .010M15 9l3 5M33 9l-3 5M11 17l5.500 2.500M37 17l-5.500 2.500M13 26l5-2M35 26l-5-2"/><circle cx="24" cy="18" r="2.500" fill="currentColor"/>`),
};
const START_ART = {
  zero: art(`<path d="M7 33h34"/><path d="M19 33v5.500M29 33v5.500M14 41h20"/><path d="M12 33V18a4 4 0 0 1 4-4h16a4 4 0 0 1 4 4v15" ${SOFT}/>`),
  surpresa: art(`<path d="M8 15h6c7 0 9 18 16 18h10M8 33h6c2.600 0 4.500-2.500 6.300-5.800M40 15H30c-2 0-3.600 1.500-5.100 3.600"/><path d="m35 10 5 5-5 5M35 28l5 5-5 5"/>`),
};

/** "+ R$ 8" (ou "já no preço", quando não custa nada a mais): o preço fica discreto, embaixo do nome. */
function priceNote(value) {
  if (!(value > 0)) return html`<span class="cq-card__price is-free">já no preço</span>`;
  return html`<span class="cq-card__price">+ ${brl(Math.round(value * 100) / 100)}</span>`;
}

/**
 * O cartão de escolha — UM desenho para todas as perguntas: a imagem (miniatura 3D, amostra de cor ou desenho a
 * traço), o nome curto, uma linha de explicação quando o nome é termo de confeitaria e o preço, discreto.
 * block = { text } quando a cozinha não faz essa combinação: o cartão fica apagado, com o motivo; um toque explica
 * e oferece a saída (nada é corrigido sem a pessoa ver).
 */
function card({ set = '', act = '', value, on: isOn = false, name, hint = '', price = '', artwork = '', role = 'radio', block = null, k = '', big = false, pressed = false }) {
  const hook = act ? raw(`data-act="${act}"`) : raw(`data-set="${set}"`);
  const state = pressed ? raw(`aria-pressed="${isOn ? 'true' : 'false'}"`) : raw(`role="${role}" aria-checked="${isOn ? 'true' : 'false'}"`);
  return html`<button type="button" class="cq-card ${isOn ? 'is-on' : ''} ${block ? 'is-blocked' : ''} ${big ? 'cq-card--big' : ''}" ${state} ${hook} data-value="${value}" data-k="${k || `${set || act}:${value}`}" ${block ? raw('aria-disabled="true"') : ''} data-why="${block ? block.text : ''}" data-fixed="${block && (block.dead || !block.code) ? '1' : ''}" data-plan="${block?.plan || ''}" data-name="${name}">
    <span class="cq-card__art">${artwork}</span>
    <span class="cq-card__name">${name}</span>
    ${hint ? html`<span class="cq-card__hint">${hint}</span>` : ''}
    ${block ? html`<span class="cq-card__lock">${icon('lock')}<span>não dá aqui</span></span>` : price}
    <span class="cq-card__check" aria-hidden="true">${icon('check')}</span>
  </button>`;
}
const artBox = (body, cls = '') => html`<span class="cq-art ${cls}">${body}</span>`;
/** Miniatura pronta (foto do próprio 3D, em assets/img/cz/); por baixo fica o desenho a traço, se a foto faltar. */
const picArt = (kind, id, fallback) => html`<span class="cq-art cq-art--pic">${fallback || DECOR_ART.generic}<img src="assets/img/cz/${kind}-${id}.webp" alt="" loading="lazy" decoding="async" width="120" height="120" /></span>`;
const swatchArt = (cls, css) => html`<span class="cq-art cq-art--swatch"><i class="cz-swatch ${cls}" style="${css}"></i></span>`;

/* ───────── O que a cozinha não faz aparece desabilitado, com o motivo (js/customizer/rules.js) ─────────
   Para cada opção ainda não escolhida, a tela pergunta às regras: "e se a pessoa tocasse aqui?". Se a resposta for
   uma correção automática, o cartão já nasce apagado e com a frase da regra — em vez de aceitar e corrigir depois. */
const firstSentence = (t) => String(t).split(/(?<=[.!?])\s+/)[0];
let blockMemo = { key: '', map: new Map() };
function prober(c) {
  const key = JSON.stringify({ ...c, name: undefined, backdrop: undefined });
  if (blockMemo.key !== key) blockMemo = { key, map: new Map() };
  const { map } = blockMemo;
  /**
   * id = nome da opção (para guardar a resposta) · mutate(x) = o que o toque faria numa cópia do bolo ·
   * want(x) = "a escolha sobreviveu à correção?" — quando não sobrevive (dead), não há "usar mesmo assim" a oferecer.
   */
  return (id, mutate, want = null) => {
    if (map.has(id)) return map.get(id);
    let out = null;
    try {
      const next = JSON.parse(JSON.stringify(c));
      mutate(next);
      const ruled = enforceRules(next, c);
      if (ruled.fixed.length) {
        const first = ruled.fixed[0];
        // o que a cozinha faria para aceitar a escolha ("tirar a calda", "bico só no topo"): vai escrito antes do toque
        const label = rulesOf(next).find((r) => r.code === first.code)?.fix?.label || '';
        out = { text: firstSentence(first.text), code: first.code, dead: Boolean(want) && !want(ruled.config), plan: label && label !== 'Ajustar' ? low(label) : '' };
      }
    } catch (err) {
      console.error('[personalizador] regra da opção', id, err);
    }
    map.set(id, out);
    return out;
  };
}
/** Todas as coberturas do bolo (a principal e a de cada andar), para simular uma troca. */
const eachCoverOf = (x, fn) => {
  fn(x.covering);
  if (Array.isArray(x.tierCover)) x.tierCover.forEach(fn);
};
function layersTo(x, n) {
  while (x.layers.length > n) x.layers.pop();
  while (x.layers.length < n) x.layers.push(x.layers[x.layers.length - 1] || 'baunilha');
  x.fillings.length = Math.min(x.fillings.length, n - 1);
  while (x.fillings.length < n - 1) x.fillings.push(x.fillings[x.fillings.length - 1] || 'ninho');
}

/**
 * Uma lista de opções: primeiro só as mais pedidas (js/data/customizer-guia.js → FIRST, mais a que já está no bolo);
 * "Ver todas" abre o resto no lugar — com busca e, quando a lista tem grupos, uma ficha por grupo.
 *   key    nome da lista (busca, grupo e "ver todas" ficam guardados por ela)
 *   items  o que está à venda (e o que já está no bolo) · first = ids da abertura · picked = ids escolhidos agora
 *   groups [{ id, name }] (cada item traz .group) ou [{ id, name, ids }] · card(item) → cartão
 *   lead   cartão que vem antes de todos ("Sem tema", "Sem bico") · noun/all = "massas" / "todas as"
 */
function choices({ key, items, first = null, picked = [], groups = [], ui, card: draw, lead = '', noun, all = 'todas as', label, cols = 3, role = 'radiogroup' }) {
  const open = Boolean(ui.all[key]);
  const q = plain(ui.search[key] || '').trim();
  const firstIds = first ? [...picked.filter((id) => !first.includes(id)), ...first] : null;
  const short = firstIds ? firstIds.map((id) => items.find((x) => x.id === id)).filter(Boolean).slice(0, 8 + picked.length) : items;
  const hasMore = short.length < items.length;
  const inGroup = (g) => (g.ids ? items.filter((x) => g.ids.includes(x.id)) : items.filter((x) => x.group === g.id));
  const live = groups.filter((g) => inGroup(g).length);
  const tab = live.some((g) => g.id === ui.tabs[key]) ? ui.tabs[key] : '';
  let body;
  if (!open || !hasMore) body = short.map(draw);
  else if (q) body = items.filter((x) => found(x, q)).map(draw);
  else if (tab) body = inGroup(live.find((g) => g.id === tab)).map(draw);
  else if (live.length) body = live.map((g) => html`<h4 class="cq-grouphead" data-k="gh:${key}:${g.id}">${g.name}</h4>${inGroup(g).map(draw)}`);
  else body = items.map(draw);
  const none = open && q && !items.some((x) => found(x, q));
  return html`
    ${open && hasMore
      ? html`<div class="cq-find" data-k="find:${key}">
            ${items.length > 16
              ? html`<label class="cq-find__box">
                  ${icon('search')}
                  <input type="search" enterkeyhint="search" autocomplete="off" spellcheck="false" aria-label="Buscar ${noun}" placeholder="Buscar ${noun}" value="${ui.search[key] || ''}" data-field="search.${key}" />
                </label>`
              : html`<span class="cq-find__count">${cap(all)} ${items.length} ${noun}</span>`}
            <button type="button" class="cq-find__less" data-act="all-close" data-value="${key}">Ver menos</button>
          </div>
          ${live.length && !q
            ? html`<div class="cz-chips cz-chips--scroll cq-groups" role="group" aria-label="Grupos de ${noun}" data-k="groups:${key}">
                <button type="button" class="cz-chip ${tab ? '' : 'is-on'}" aria-pressed="${tab ? 'false' : 'true'}" data-set="tab.${key}" data-value="" data-k="tab:${key}:">${cap(all.split(' ')[0])}</button>
                ${live.map((g) => html`<button type="button" class="cz-chip ${g.id === tab ? 'is-on' : ''}" aria-pressed="${g.id === tab ? 'true' : 'false'}" data-set="tab.${key}" data-value="${g.id}" data-k="tab:${key}:${g.id}">${g.name}</button>`)}
              </div>`
            : ''}`
      : ''}
    <div class="cq-grid cq-grid--${cols}" role="${role}" aria-label="${label}" data-k="grid:${key}">${open && q ? '' : lead}${body}</div>
    ${none ? html`<p class="cz-note cq-none" data-k="none:${key}">Não achamos “${ui.search[key].trim()}”. Tente outra palavra.</p>` : ''}
    ${!open && hasMore ? html`<button type="button" class="cq-more" data-act="all" data-value="${key}" data-k="all:${key}">Ver ${all} ${items.length} ${noun} ${icon('chevron-down')}</button>` : ''}
  `;
}

/**
 * Cores: primeiro a paleta pronta, em amostras grandes; por último, "Outra cor" (o seletor livre).
 * Uma cor fora da paleta aparece como a primeira amostra.
 */
function palette(set, current, colors, label, { free = true } = {}) {
  const list = colors.some((c) => c.hex === current) ? colors : [{ hex: current, name: 'Cor escolhida por você' }, ...colors];
  return html`<div class="cq-colors" role="radiogroup" aria-label="${label}" data-k="colors:${set}">
    ${list.map((c) => {
      const isOn = c.hex === current;
      return html`<button type="button" class="cq-color ${isOn ? 'is-on' : ''} ${isLight(c.hex) ? 'is-light' : ''}" style="--c:${c.hex}" role="radio" aria-checked="${isOn ? 'true' : 'false'}" aria-label="${c.name}" title="${c.name}" data-set="${set}" data-value="${c.hex}" data-k="${set}:${c.hex}">${icon('check')}</button>`;
    })}
    ${free ? html`<button type="button" class="cq-color cq-color--free" data-act="pick-color" data-value="${set}" aria-label="Outra cor: escolher qualquer cor" title="Outra cor" data-k="${set}:free">${icon('plus')}</button>` : ''}
  </div>`;
}
const colorLegend = (hex) => `${tintName(hex)}${colorName(hex) === 'Cor personalizada' && !DECOR_COLOR_NAMES[String(hex).toLowerCase()] ? ` ${String(hex).toUpperCase()}` : ''}`;

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

/** Um bloco de segundo nível dentro da pergunta (aparece depois da escolha principal): rótulo + controles. */
const extra = (label, body, k) => html`<section class="cq-extra" data-k="extra:${k}"><h3 class="cq-extra__label">${label}</h3>${body}</section>`;

/** Avisos e dicas das regras de confeiteiro para a etapa (js/customizer/rules.js): os alertas e, no máximo, uma dica. */
function rulesBox(stepId, c) {
  const all = rulesForStep(c, stepId);
  const rules = [...all.filter((r) => r.level === 'alerta'), ...all.filter((r) => r.level === 'dica').slice(0, 1)];
  if (!rules.length) return '';
  return html`<div class="cz-rules" data-k="rules:${stepId}">
    ${rules.map(
      (r) => html`<div class="cz-rule cz-rule--${r.level}" role="note" data-k="rule:${r.code}">
        <span class="cz-rule__icon">${icon(r.level === 'alerta' ? 'alert' : 'info')}</span>
        <p><span class="sr-only">${r.level === 'alerta' ? 'Atenção: ' : 'Dica: '}</span>${r.text}</p>
        ${r.fix ? html`<button type="button" class="cz-linkbtn cz-rule__fix" data-act="fix" data-value="${r.code}">${r.fix.label}</button>` : ''}
      </div>`,
    )}
  </div>`;
}

/** A opção apagada em que a pessoa tocou: o motivo, em uma frase, e a saída ("Usar mesmo assim" aplica com o ajuste). */
function whyBox(ui) {
  if (!ui.why) return '';
  return html`<div class="cq-why" role="status" data-k="why">
    <span class="cq-why__icon">${icon('info')}</span>
    <p>${ui.why.text}${!ui.why.fixed && ui.why.plan ? html` <span class="cq-why__plan">Para usar ${ui.why.name}: ${ui.why.plan}.</span>` : ''}</p>
    <div class="cq-why__acts">
      ${ui.why.fixed ? '' : html`<button type="button" class="btn btn--soft btn--sm" data-act="why-go">${ui.why.plan ? 'Usar assim' : 'Usar mesmo assim'}</button>`}
      <button type="button" class="cz-linkbtn" data-act="why-close">${ui.why.fixed ? 'Entendi' : 'Deixar como está'}</button>
    </div>
  </div>`;
}

/* ───────── As perguntas ─────────
   Cada função devolve { legend, body }: a linha de apoio embaixo da pergunta (o que é a opção escolhida, em uma
   frase) e as opções. O cabeçalho (faixa de perguntas + pergunta) é o mesmo para todas: askHead(). */

/** Amostra da massa: uma cor, ou duas (mesclada). */
const crumbSwatch = (f) => swatchArt(`cz-swatch--crumb ${f.color2 ? 'cz-swatch--duo' : ''}`, `--c:${f.color}${f.color2 ? `;--c2:${f.color2}` : ''}`);
/**
 * A cor com que uma cobertura nasce quando a pessoa ainda não escolheu cor nenhuma: a do próprio creme (ganache
 * escura, chantilly branco…). O buttercream nasce BRANCO — o rosa do cardápio era a cor do antigo bolo de vitrine,
 * e no bolo em branco ele pintaria o bolo sem ninguém pedir.
 */
const bareColor = (type) => (type === 'buttercream' ? '#ffffff' : getCovering(type)?.defaultColor || '#ffffff');
const FINISH_SWATCH = { brilhante: 'cz-swatch--gloss', espelhado: 'cz-swatch--gloss', acetinado: 'cz-swatch--satin', cremoso: 'cz-swatch--satin', fosco: '', aveludado: '', rústico: 'cz-swatch--naked' };

/* ── O começo: do zero, de uma inspiração ou surpresa (só para quem chega sem bolo nenhum) ── */
function askStart(c, ui) {
  const peek = ['unicornio', 'belga', 'cesta', 'festa'].map((id) => getPreset(id)).filter(Boolean);
  const row = ({ act, value = '', on: isOn = false, title, text, artwork, k }) => html`<button type="button" class="cq-start ${isOn ? 'is-on' : ''}" data-act="${act}" data-value="${value}" data-k="start:${k}">
      <span class="cq-start__art">${artwork}</span>
      <span class="cq-start__text"><strong>${title}</strong><span>${text}</span></span>
      <span class="cq-start__go" aria-hidden="true">${icon('chevron-right')}</span>
    </button>`;
  return {
    legend: 'O bolo muda a cada escolha que você faz.',
    body: html`<div class="cq-starts" role="group" aria-label="Como começar">
      ${row({ act: 'start', value: 'zero', on: true, k: 'zero', title: 'Do zero', text: 'Um bolo em branco. Você escolhe tudo, uma coisa de cada vez.', artwork: html`<span class="cq-start__ico">${START_ART.zero}</span>` })}
      ${row({
        act: 'start',
        value: 'galeria',
        k: 'galeria',
        title: 'Partir de uma inspiração',
        text: `${PRESETS.length} bolos prontos. Escolha um e mude o que quiser.`,
        artwork: html`<span class="cq-start__pics">${peek.map((p) => html`<img src="assets/img/cz-${p.id}.webp" alt="" width="56" height="56" loading="lazy" decoding="async" />`)}</span>`,
      })}
      ${row({ act: 'surprise', k: 'surpresa', title: 'Me surpreenda', text: 'A gente monta um bolo. Se não gostar, sorteia outro.', artwork: html`<span class="cq-start__ico">${START_ART.surpresa}</span>` })}
    </div>`,
  };
}

/** A galeria de inspirações (segundo nível do começo): por ocasião, em cartões com a foto do bolo. */
function askGallery(c, ui) {
  const occasions = OCCASIONS.filter((o) => PRESETS.some((p) => p.occasion === o.id));
  const list = ui.occasion ? PRESETS.filter((p) => p.occasion === ui.occasion) : PRESETS;
  return {
    legend: 'Toque num bolo para começar por ele. Depois você muda o que quiser.',
    body: html`
      <div class="cz-chips cz-chips--scroll cq-groups" role="radiogroup" aria-label="Inspirações por ocasião">
        ${chip('occasion', '', !ui.occasion, 'Todas')}${occasions.map((o) => chip('occasion', o.id, ui.occasion === o.id, o.name))}
      </div>
      <div class="cq-grid cq-grid--3 cq-grid--presets" role="group" aria-label="Inspirações para começar">
        ${list.map(
          (p) => html`<button type="button" class="cq-card" data-act="preset" data-value="${p.id}" data-k="preset:${p.id}" aria-label="Começar pela inspiração ${p.name}: ${p.tag}">
            <span class="cq-card__art"><span class="cq-art cq-art--pic cq-art--whole cq-art--preset" data-thumb="${p.id}" style="background:${backdropCss(resolveBackdrop(p.config))}"><img src="${presetThumbs.get(p.id) || `assets/img/cz-${p.id}.webp`}" alt="" width="136" height="136" loading="lazy" decoding="async" /></span></span>
            <span class="cq-card__name">${p.name}</span>
            <span class="cq-card__price">${brl(priceOf(p.sized ? p.config : { ...p.config, size: c.size }))}</span>
          </button>`,
        )}
      </div>
      <button type="button" class="cq-more" data-act="start" data-value="volta" data-k="gallery:back">${icon('arrow-left')} ${ui.galleryFrom === 'q' ? 'Voltar sem trocar' : 'Voltar ao começo'}</button>
    `,
  };
}

/* ── Formato ── */
function askShape(c) {
  const sh = SHAPES.find((s) => s.id === c.shape);
  return {
    legend: sh.desc,
    body: html`<div class="cq-grid cq-grid--3" role="radiogroup" aria-label="Formato do bolo">
      ${FIRST.shape
        .map((id) => activeOf(SHAPES, c.shape).find((s) => s.id === id))
        .filter(Boolean)
        .map((s) => card({ set: 'shape', value: s.id, on: c.shape === s.id, name: s.name, hint: HINTS.shape[s.id] || '', price: priceNote(deltaOf(c, s.price)), artwork: artBox(SHAPE_ART[s.id] || SHAPE_ART.round, 'cq-art--line') }))}
      </div>
      <div class="cq-alts" role="group" aria-label="Outros jeitos de começar" data-k="alts">
        <button type="button" class="cz-linkbtn" data-act="start" data-value="galeria">${icon('grid')} Trocar por um bolo pronto</button>
        <button type="button" class="cz-linkbtn" data-act="surprise">${icon('shuffle')} Me surpreenda</button>
      </div>`,
  };
}

function askSize(c) {
  const can = prober(c);
  return {
    legend: `${sizeOf(c).hint}. Dá ${servesText(c)}.`,
    body: html`<div class="cq-grid cq-grid--3" role="radiogroup" aria-label="Tamanho do bolo">
      ${activeOf(SIZES, c.size).map((sz) => {
        // o cartão mostra o bolo que a pessoa levaria nesse tamanho (o bentô, por exemplo, é sempre de um andar)
        const as = enforceRules({ ...c, size: sz.id, base: sz.id === 'bento' && c.base === 'boleira' ? 'caixa' : c.base }).config;
        return card({
          set: 'size',
          value: sz.id,
          on: c.size === sz.id,
          name: servesText(as),
          hint: HINTS.size[sz.id] || ((as.tiers || 1) > 1 ? `${diametersOf(as)[0]} cm na base` : `${sz.diameter} de largura`),
          price: html`<span class="cq-card__price">${brl(priceOf(as))}</span>`,
          artwork: artBox(html`<b class="${sz.label.length > 2 ? 'is-word' : ''}">${sz.label}</b>`, 'cq-art--letter'),
          block: c.size === sz.id ? null : can(`size:${sz.id}`, (x) => (x.size = sz.id), (x) => x.size === sz.id),
        });
      })}
    </div>`,
  };
}

function askTiers(c) {
  const tiers = c.tiers || 1;
  const can = prober(c);
  const fixed = isVolcano(c) ? 'O vulcão é um bolo só: uma massa alta, de fôrma de furo.' : c.size === 'bento' ? 'O bentô é um mini bolo de um andar só. Para andares, escolha do P para cima.' : '';
  return {
    legend: fixed || (tiers > 1 ? `Andares de ${diametersOf(c).join(', ')} cm. Dá ${servesText(c)}.` : 'Com mais andares, o de baixo cresce e o bolo dá muito mais fatias.'),
    body: html`<div class="cq-grid cq-grid--3" role="radiogroup" aria-label="Quantos andares">
      ${TIER_OPTIONS.map((t) => {
        const as = t.n === tiers ? c : normalizeConfig({ ...c, tiers: t.n, tierCover: t.n > 1 ? c.tierCover : null });
        const block = t.n === tiers ? null : fixed ? { text: fixed } : can(`tiers:${t.n}`, (x) => (x.tiers = t.n), (x) => x.tiers === t.n);
        return card({ set: 'tiers', value: String(t.n), on: tiers === t.n, name: t.name, hint: block ? '' : servesText(as), price: block || t.n === tiers ? '' : html`<span class="cq-card__price">${brl(priceOf(as))}</span>`, artwork: artBox(TIER_ART[t.n], 'cq-art--line'), block });
      })}
    </div>`,
  };
}

function askHeight(c) {
  const n = c.layers.length;
  const tiers = c.tiers || 1;
  const can = prober(c);
  const volcano = isVolcano(c);
  const opts = [
    { id: 'simples', layers: 1, name: 'Simples', hint: 'uma massa só, sem recheio' },
    ...HEIGHTS.map((h) => ({ id: h.id, layers: h.layers, name: h.name, hint: `${h.layers} massas e ${h.layers - 1} ${h.layers - 1 === 1 ? 'recheio' : 'recheios'}` })),
  ];
  return {
    legend: volcano ? 'O vulcão é uma massa só, alta, com uns 8 cm de altura.' : `${heightCmOf(c)} cm de altura${tiers > 1 ? ' no total' : ''}. A massa e o recheio têm sempre a mesma espessura: o bolo cresce em camadas.`,
    body: html`<div class="cq-grid cq-grid--4" role="radiogroup" aria-label="Altura do bolo">
      ${opts.map((o) => {
        const isOn = !volcano && n === o.layers;
        const block = isOn ? null : volcano ? { text: 'O vulcão é uma massa só, de fôrma de furo: a altura é sempre a mesma.' } : can(`layers:${o.layers}`, (x) => layersTo(x, o.layers), (x) => x.layers.length === o.layers);
        return card({ set: 'layers', value: String(o.layers), on: isOn, name: o.name, hint: o.hint, artwork: artBox(HEIGHT_ART[o.layers], 'cq-art--line'), block });
      })}
    </div>`,
  };
}

function askBase(c, ui) {
  const can = prober(c);
  const bases = activeOf(BASES, c.base).filter((b) => !b.only || b.only === c.size);
  const cur = BASES.find((b) => b.id === c.base);
  return {
    legend: `${cur.name}: ${low(cur.desc)}.`,
    body: choices({
      key: 'base',
      items: bases,
      first: c.size === 'bento' ? ['caixa', ...FIRST.base] : FIRST.base,
      picked: [c.base],
      ui,
      noun: 'bases',
      label: 'Base do bolo',
      card: (b) => card({ set: 'base', value: b.id, on: c.base === b.id, name: b.name, hint: HINTS.base[b.id] || '', price: priceNote(b.price), artwork: html`<span class="cq-art cq-art--base"><i style="--c:${b.swatch}"></i></span>`, block: c.base === b.id ? null : can(`base:${b.id}`, (x) => (x.base = b.id), (x) => x.base === b.id) }),
    }),
  };
}

/* ── Massa ── */
function askFlavor(c, ui) {
  const n = c.layers.length;
  const volcano = isVolcano(c);
  const each = ui.flavorMode === 'each' && n > 1;
  const active = each ? Math.min(ui.layer, n - 1) : n - 1;
  const current = c.layers[active];
  const times = each ? 1 : n; // um sabor para o bolo inteiro: o cartão já soma todas as camadas
  const f0 = getFlavor(current);
  return {
    title: each ? `Qual o sabor da ${ordinal(active + 1)} camada?` : '',
    legend: `${f0.name}: ${low(f0.desc)}.${volcano ? ' No vulcão, a massa é uma só.' : ''}`,
    body: html`
      ${each
        ? html`<div class="cz-stack" role="radiogroup" aria-label="Camada que você está escolhendo" data-k="massa:stack">
            ${c.layers
              .map((id, i) => {
                const f = getFlavor(id);
                const where = i === n - 1 ? ' (topo)' : i === 0 ? ' (base)' : '';
                return html`<button type="button" class="cz-layer ${i === active ? 'is-on' : ''}" role="radio" aria-checked="${i === active ? 'true' : 'false'}" data-set="layer" data-value="${i}" data-k="layer:${i}">
                  <i class="cz-swatch cz-swatch--crumb ${f.color2 ? 'cz-swatch--duo' : ''}" style="--c:${f.color}${f.color2 ? `;--c2:${f.color2}` : ''}"></i>
                  <span>${ordinal(i + 1)} camada${where}</span>
                  <strong>${f.name}</strong>
                  ${icon(i === active ? 'edit' : 'chevron-right')}
                </button>`;
              })
              .reverse()}
          </div>`
        : ''}
      ${choices({
        key: 'flavor',
        items: activeOf(FLAVORS, c.layers),
        first: FIRST.flavor,
        groups: FLAVOR_GROUPS,
        picked: each ? [current] : [...new Set(c.layers)],
        ui,
        noun: 'massas',
        label: 'Sabor da massa',
        card: (f) => card({ set: 'flavor', value: f.id, on: each ? current === f.id : c.layers.every((x) => x === f.id), name: f.name, hint: HINTS.flavor[f.id] || '', price: priceNote(deltaOf(c, f.price) * times), artwork: crumbSwatch(f) }),
      })}
      ${n > 1
        ? html`<button type="button" class="cq-toggle" role="switch" aria-checked="${each ? 'true' : 'false'}" data-set="flavorMode" data-value="${each ? 'all' : 'each'}" data-k="massa:modo">
            <span class="cz-switch__knob"></span><span class="cq-toggle__text"><strong>Um sabor em cada camada</strong><small>${each ? 'Toque numa camada acima e escolha o sabor dela.' : `O bolo tem ${n} camadas de massa.`}</small></span>
          </button>`
        : ''}
    `,
  };
}

function askSoak(c) {
  const none = !c.soak;
  return {
    legend: getSoak(c.soak)?.desc || TERMS.calda,
    body: html`<div class="cq-grid cq-grid--3" role="radiogroup" aria-label="Calda de molhar a massa">
      ${card({ set: 'soak', value: '', on: none, name: 'Sem calda', artwork: artBox(CANDLE_ART.none, 'cq-art--line cq-art--none'), price: html`<span class="cq-card__price is-free">como vem</span>` })}
      ${activeOf(SOAKS, c.soak).map((s) => card({ set: 'soak', value: s.id, on: c.soak === s.id, name: s.name, price: priceNote(deltaOf(c, s.price)), artwork: swatchArt('cz-swatch--gloss', `--c:${{ leitecondensado: '#f3e2b3', baunilha: '#f0d9a0', cafe: '#6b4226', licor: '#c9702c' }[s.id] || '#e8cf9a'}`) }))}
    </div>`,
  };
}

/* ── Recheio ── */
function askFilling(c, ui) {
  const gaps = c.fillings.length;
  if (!gaps) {
    const volcano = isVolcano(c);
    return {
      legend: volcano ? 'No lugar do recheio, a cobertura cremosa enche o furo do bolo e transborda.' : 'Para rechear, o bolo precisa de pelo menos duas camadas de massa.',
      body: html`<div class="cz-empty">
        <span class="cz-empty__art">${icon('layers')}</span>
        ${volcano
          ? html`<p>Você escolhe o sabor dela na próxima etapa.</p>`
          : html`<p>Quer pôr mais uma camada? Aí o recheio entra no meio.</p>
              <button type="button" class="btn" data-act="add-layer">${icon('plus')} Pôr mais uma camada</button>`}
      </div>`,
    };
  }
  const each = ui.fillMode === 'each' && gaps > 1;
  const active = each ? Math.min(ui.gap, gaps - 1) : gaps - 1;
  const current = c.fillings[active];
  const times = each ? 1 : gaps; // um recheio para o bolo inteiro: o cartão já soma todas as camadas
  const f0 = getFilling(current);
  const can = prober(c);
  return {
    title: each ? `Qual o recheio entre a ${ordinal(active + 1)} e a ${ordinal(active + 2)} camada?` : '',
    legend: `${f0.name}: ${low(f0.desc)}.`,
    body: html`
      ${each
        ? html`<div class="cz-stack" role="radiogroup" aria-label="Recheio que você está escolhendo" data-k="recheio:stack">
            ${c.fillings
              .map((id, i) => {
                const f = getFilling(id);
                const add = getFillAdd(c.fillAdds[i]);
                return html`<button type="button" class="cz-layer cz-layer--fill ${i === active ? 'is-on' : ''}" role="radio" aria-checked="${i === active ? 'true' : 'false'}" data-set="gap" data-value="${i}" data-k="gap:${i}">
                  <i class="cz-swatch" style="--c:${f.cream || f.color}"></i>
                  <span>Entre a ${ordinal(i + 1)} e a ${ordinal(i + 2)} camada</span>
                  <strong>${f.name}${add ? ` + ${add.name.toLowerCase()}` : ''}</strong>
                  ${icon(i === active ? 'edit' : 'chevron-right')}
                </button>`;
              })
              .reverse()}
          </div>`
        : ''}
      ${choices({
        key: 'filling',
        items: activeOf(FILLINGS, c.fillings),
        first: FIRST.filling,
        groups: FILLING_GROUPS,
        picked: each ? [current] : [...new Set(c.fillings)],
        ui,
        noun: 'recheios',
        all: 'todos os',
        label: 'Sabor do recheio',
        card: (f) => {
          const isOn = each ? current === f.id : c.fillings.every((x) => x === f.id);
          return card({
            set: 'filling',
            value: f.id,
            on: isOn,
            name: f.name,
            hint: HINTS.filling[f.id] || '',
            price: priceNote(deltaOf(c, f.price) * times),
            artwork: swatchArt(`${f.gloss > 0.5 ? 'cz-swatch--gloss' : 'cz-swatch--satin'} ${f.cream ? 'cz-swatch--duo' : ''}`, `--c:${f.cream || f.color}${f.cream ? `;--c2:${f.color}` : ''}`),
            block: isOn || !c.reveal.on ? null : can(`filling:${f.id}:${each ? active : 'all'}`, (x) => (x.fillings = each ? x.fillings.map((v, i) => (i === active ? f.id : v)) : x.fillings.map(() => f.id)), (x) => x.fillings.includes(f.id)),
          });
        },
      })}
      ${gaps > 1
        ? html`<button type="button" class="cq-toggle" role="switch" aria-checked="${each ? 'true' : 'false'}" data-set="fillMode" data-value="${each ? 'all' : 'each'}" data-k="recheio:modo">
            <span class="cz-switch__knob"></span><span class="cq-toggle__text"><strong>Um recheio em cada camada</strong><small>${each ? 'Toque numa linha acima e escolha o recheio dela.' : `O bolo leva ${gaps} recheios.`}</small></span>
          </button>`
        : ''}
    `,
  };
}

function askFillAdd(c, ui) {
  const gaps = c.fillings.length;
  const each = ui.fillMode === 'each' && gaps > 1;
  const active = each ? Math.min(ui.gap, gaps - 1) : gaps - 1;
  const add = c.fillAdds[active] || '';
  const sameAdd = c.fillAdds.every((x) => x === c.fillAdds[0]);
  const none = each ? !add : c.fillAdds.every((x) => !x);
  const cur = getFillAdd(each ? add : sameAdd ? c.fillAdds[0] : '');
  return {
    legend: cur ? `${cur.name}: ${low(cur.desc)}.` : TERMS.adicional,
    body: html`
      <div class="cq-grid cq-grid--3" role="radiogroup" aria-label="Pedaços no recheio">
        ${card({ set: 'fillAdd', value: '', on: none, name: 'Sem pedaços', artwork: artBox(CANDLE_ART.none, 'cq-art--line cq-art--none'), price: html`<span class="cq-card__price is-free">só o creme</span>` })}
        ${activeOf(FILL_ADDS, c.fillAdds).map((a) => card({ set: 'fillAdd', value: a.id, on: each ? add === a.id : sameAdd && c.fillAdds[0] === a.id, name: a.name, price: priceNote(deltaOf(c, a.price) * (each ? 1 : gaps)), artwork: swatchArt('cz-swatch--crumb', `--c:${a.swatch}`) }))}
      </div>
      ${extra(
        html`Chá revelação <span class="cz-optional">(opcional)</span>`,
        html`<button type="button" class="cz-switch" role="switch" aria-checked="${c.reveal.on ? 'true' : 'false'}" data-act="reveal-toggle" data-k="reveal:toggle">
            <span class="cz-switch__knob"></span>
            <span class="cz-opt__body">
              <span class="cz-opt__name">É um chá revelação</span>
              <span class="cz-opt__desc">O recheio vai tingido de rosa ou azul e a cor só aparece quando o bolo é cortado</span>
            </span>
            <span class="cz-opt__price"><b>+ ${money(REVEAL_PRICE)}</b></span>
          </button>
          ${c.reveal.on
            ? html`<div class="cz-sub cz-secret" data-k="reveal:secret">
                <p class="cz-secret__state">${icon('lock')}<span><strong>${ui.revealSet ? 'Cor escolhida, em segredo' : 'Falta escolher a cor'}</strong>${ui.revealSet ? 'Ela não aparece aqui, no resumo nem no pedido: só a confeitaria fica sabendo.' : 'Escolha longe de quem não pode saber: a cor não aparece em nenhum outro lugar.'}</span></p>
                <button type="button" class="btn btn--secondary btn--sm" data-act="reveal-color">${icon(ui.revealSet ? 'edit' : 'lock')} ${ui.revealSet ? 'Trocar a cor em segredo' : 'Escolher a cor em segredo'}</button>
              </div>`
            : ''}`,
        'cha',
      )}
    `,
  };
}

/* ── Cobertura ── */
/** Com 2 ou 3 andares: a mesma cobertura em todos, ou uma por andar (e qual andar está sendo escolhido). */
function tierPicker(c, ui) {
  const tiers = c.tiers || 1;
  if (tiers < 2) return '';
  const each = ui.tierMode === 'each' && Array.isArray(c.tierCover);
  const ti = each ? Math.min(ui.tier, tiers - 1) : tiers - 1;
  return html`<div class="cq-tiers" data-k="cob:andares">
    ${segmented('tierMode', each ? 'each' : 'all', [{ id: 'all', name: 'Igual em todos os andares' }, { id: 'each', name: 'Uma por andar' }], 'Cobertura dos andares')}
    ${each
      ? html`<div class="cz-stack" role="radiogroup" aria-label="Andar que você está escolhendo">
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
  </div>`;
}
/** A cobertura que a pergunta está mexendo: a do andar escolhido ou a do bolo inteiro. */
function coverAt(c, ui) {
  const tiers = c.tiers || 1;
  const each = tiers > 1 && ui.tierMode === 'each' && Array.isArray(c.tierCover);
  const ti = each ? Math.min(ui.tier, tiers - 1) : tiers - 1;
  return { each, ti, cov: each ? c.tierCover[ti] : c.covering };
}
const setCover = (x, each, ti, fn) => (each ? fn(x.tierCover[ti]) : eachCoverOf(x, fn));

function askCover(c, ui) {
  const volcano = isVolcano(c);
  const { each, ti, cov } = coverAt(c, ui);
  const kind = getCovering(cov.type);
  const can = prober(c);
  const covers = activeOf(COVERINGS, coversOf(c).map((x) => x.type)).filter((k) => !volcano || VOLCANO_COVERS.includes(k.id));
  return {
    legend: `${kind.name}: ${low(kind.desc)}.`,
    body: html`
      ${tierPicker(c, ui)}
      ${choices({
        key: 'covering',
        items: covers,
        first: volcano ? null : FIRST.covering,
        picked: [cov.type],
        ui,
        noun: 'coberturas',
        label: 'Tipo de cobertura',
        cols: 2,
        card: (k) =>
          card({
            set: 'covering',
            value: k.id,
            on: cov.type === k.id,
            name: k.name,
            hint: HINTS.covering[k.id] || '',
            price: priceNote(deltaOf(c, k.price)),
            artwork: swatchArt(FINISH_SWATCH[k.finish] || '', `--c:${ui.colorChosen || cov.type === k.id ? cov.color : bareColor(k.id)}`),
            block: cov.type === k.id ? null : can(`covering:${k.id}:${each ? ti : 'all'}`, (x) => setCover(x, each, ti, (v) => ((v.type = k.id), finishAllowed(k.id, v.style) || (v.style = 'liso'))), (x) => (each ? x.tierCover?.[ti] : x.covering)?.type === k.id),
          }),
      })}
    `,
  };
}

function askCoverColor(c, ui) {
  const { cov } = coverAt(c, ui);
  return {
    legend: colorLegend(cov.color),
    body: html`
      ${tierPicker(c, ui)}
      ${palette('coveringColor', cov.color, COLORS, cov.type === 'naked' ? 'Cor do creme do topo' : 'Cor da cobertura')}
      ${extra(
        'Combinações prontas',
        html`<p class="cq-extra__note">Pintam o bolo inteiro de uma vez: cobertura, bico e enfeites.</p>
          <div class="cz-pals" role="group" aria-label="Combinações de cores prontas">
            ${COLOR_PALETTES.map(
              (p) => html`<button type="button" class="cz-pal" data-act="palette" data-value="${p.id}" data-k="palette:${p.id}" aria-label="Pintar o bolo com a combinação ${p.name}">
                <span class="cz-pal__dots">${[p.cover, p.cover2, p.accents[0], p.text].map((h) => html`<i style="--c:${h}"></i>`)}</span><span>${p.name}</span>
              </button>`,
            )}
          </div>`,
        'paletas',
      )}
    `,
  };
}

function askCoverStyle(c, ui) {
  const { each, ti, cov } = coverAt(c, ui);
  const fin = getFinish(cov.style);
  const kind = getCovering(cov.type);
  const can = prober(c);
  const styles = activeOf(FINISHES, cov.style);
  // a amostra mostra o DESENHO: no bolo branco ela usa um creme bem claro (branco sobre o cartão branco não se vê) e,
  // nos desenhos de duas cores ainda iguais, uma segunda cor de exemplo
  const tone = isLight(cov.color) && cov.color.toLowerCase() === '#ffffff' ? '#f4ebe1' : cov.color;
  const tone2 = cov.color2 !== cov.color ? cov.color2 : cov.color.toLowerCase() === '#ffffff' ? '#f3b9c8' : '#ffffff';
  return {
    legend: `${fin.name}: ${low(fin.desc)}.`,
    body: html`
      ${tierPicker(c, ui)}
      ${choices({
        key: 'finish',
        items: styles,
        first: FIRST.finish,
        groups: FINISH_GROUPS,
        picked: [cov.style],
        ui,
        noun: 'desenhos',
        all: 'todos os',
        label: 'Desenho da cobertura',
        card: (f) => {
          const isOn = cov.style === f.id;
          const block = isOn ? null : !finishAllowed(cov.type, f.id) ? { text: cov.type === 'naked' ? 'O naked não leva desenho: a massa e o recheio à mostra já são o acabamento.' : `${f.name} não se faz em ${low(kind.name)}. Troque a cobertura para usar.` } : can(`finish:${f.id}:${each ? ti : 'all'}`, (x) => setCover(x, each, ti, (v) => (v.style = f.id)), (x) => (each ? x.tierCover?.[ti] : x.covering)?.style === f.id);
          return card({ set: 'finish', value: f.id, on: isOn, name: f.name, hint: HINTS.finish[f.id] || '', price: priceNote(deltaOf(c, f.price)), artwork: html`<span class="cq-art cq-art--fin"><i class="cz-fin__art cz-fin__art--${f.id}" style="--c:${tone};--c2:${tone2};--c3:${getTrim(cov.trim)?.swatch || '#c79a62'}"></i></span>`, block });
        },
      })}
      ${fin.two ? extra('A segunda cor', palette('color2', cov.color2, COLORS, 'Segunda cor da cobertura'), 'cor2') : ''}
      ${fin.trim
        ? extra(
            'Qual confeito?',
            html`<div class="cz-chips" role="radiogroup" aria-label="Confeito do desenho">
              ${activeOf(TRIMS, cov.trim).map((t) => chip('trim', t.id, cov.trim === t.id, t.name, { swatch: t.swatch, note: `+ ${brl(deltaOf(c, t.price))}` }))}
            </div>`,
            'confeito',
          )
        : ''}
    `,
  };
}

function askOverflow(c) {
  return {
    legend: 'No vulcão a cobertura vai morna, para escorrer devagar pela lateral.',
    body: html`
      ${extra('Quanta cobertura', segmented('dripAmount', c.drip.amount, DRIP_AMOUNTS.map((a) => ({ id: a.id, name: a.price ? `${a.name} · + ${brl(deltaOf(c, a.price))}` : a.name })), 'Quanta cobertura'), 'qtd')}
      ${extra('Até onde ela desce', segmented('dripLength', c.drip.length, DRIP_LENGTHS, 'Até onde a cobertura desce'), 'len')}
    `,
  };
}

function askDrip(c, ui) {
  const can = prober(c);
  const metalHexes = METAL_COLORS.map((x) => x.hex);
  const dripBase = c.drip.metal ? [...METAL_COLORS, ...COLORS.filter((x) => DRIP_COLORS.includes(x.hex))] : COLORS.filter((x) => DRIP_COLORS.includes(x.hex));
  const dripList = ui.moreDrip || !(DRIP_COLORS.includes(c.drip.color) || (c.drip.metal && metalHexes.includes(c.drip.color))) ? [...(c.drip.metal ? METAL_COLORS : []), ...COLORS] : dripBase;
  const block = c.drip.on ? null : can('drip:on', (x) => (x.drip.on = true), (x) => x.drip.on);
  const drop = (on) => artBox(art(`<path d="M8 14h32"/><path d="M10 14v24a3 3 0 0 0 3 3h22a3 3 0 0 0 3-3V14" ${SOFT}/>${on ? `<path d="M14 14v9a2.500 2.500 0 0 0 5 0v-9M22 14v15a2.500 2.500 0 0 0 5 0V14M30 14v7a2.500 2.500 0 0 0 5 0v-7" fill="currentColor" fill-opacity=".5"/>` : ''}`), `cq-art--line ${on ? '' : 'cq-art--none'}`);
  return {
    legend: c.drip.on ? `Calda ${low(tintName(c.drip.color))}. Fica mais bonita quando contrasta com a cobertura.` : TERMS.drip,
    body: html`
      <div class="cq-grid cq-grid--2" role="radiogroup" aria-label="Calda escorrendo">
        ${card({ set: 'dripOn', value: 'nao', on: !c.drip.on, name: 'Sem calda', artwork: drop(false), price: html`<span class="cq-card__price is-free">só a cobertura</span>` })}
        ${card({ set: 'dripOn', value: 'sim', on: c.drip.on, name: 'Com calda', artwork: drop(true), price: priceNote(deltaOf(c, DRIP_PRICE)), block })}
      </div>
      ${c.drip.on
        ? html`
            ${extra('Cor da calda', html`${palette('dripColor', c.drip.color, dripList, 'Cor da calda')}${dripList.length < COLORS.length ? html`<button type="button" class="cz-linkbtn cz-linkbtn--inset" data-act="more-drip">${icon('palette')} Ver todas as cores</button>` : ''}`, 'dripcor')}
            ${extra('Quanta calda', segmented('dripAmount', c.drip.amount, DRIP_AMOUNTS.map((a) => ({ id: a.id, name: a.price ? `${a.name} · + ${brl(deltaOf(c, a.price))}` : a.name })), 'Quantidade de calda'), 'dripqtd')}
            ${extra(
              'Até onde as gotas descem',
              html`<div class="cz-seg" role="radiogroup" aria-label="Comprimento das gotas">
                ${DRIP_LENGTHS.map((o) => {
                  const b = o.id === c.drip.length ? null : can(`dripLength:${o.id}`, (x) => (x.drip.length = o.id), (x) => x.drip.length === o.id);
                  return html`<button type="button" role="radio" aria-checked="${o.id === c.drip.length ? 'true' : 'false'}" data-set="dripLength" data-value="${o.id}" data-k="dripLength:${o.id}" class="${b ? 'is-blocked' : ''}" ${b ? raw('aria-disabled="true"') : ''} data-why="${b ? b.text : ''}" data-fixed="${b && b.dead ? '1' : ''}" data-plan="${b?.plan || ''}" data-name="Calda ${low(o.name)}">${o.name}</button>`;
                })}
              </div>`,
              'driplen',
            )}
            ${extra(
              'Mais jeitos',
              html`<div class="cz-chips cz-chips--toggles" role="group" aria-label="Mais opções da calda">
                <button type="button" class="cz-chip ${c.drip.half ? 'is-on' : ''}" aria-pressed="${c.drip.half ? 'true' : 'false'}" data-act="drip-half" data-k="drip:half"><span>Só de um lado</span><small>meia-lua</small></button>
                <button type="button" class="cz-chip ${c.drip.metal ? 'is-on' : ''}" aria-pressed="${c.drip.metal ? 'true' : 'false'}" data-act="drip-metal" data-k="drip:metal"><i class="cz-chip__sw cz-chip__sw--metal"></i><span>Dourada ou prateada</span><small>+ ${brl(deltaOf(c, DRIP_METAL_PRICE))}</small></button>
              </div>`,
              'dripmais',
            )}
          `
        : ''}
    `,
  };
}

/* ── Bico (a etapa "acabamento") ── */
function askPiping(c, ui) {
  const pip = getPiping(c.piping.style);
  const can = prober(c);
  const shop = PIPINGS.filter((x) => (isActive(x) || x.id === pip.id) && x.id !== 'liso');
  return {
    legend: pip.id === 'liso' ? TERMS.bico : `${pip.name}: ${low(pip.desc)}.${pip.combo ? ' Já vem completo: topo, lateral e base.' : pip.side ? ' Toma a lateral do bolo, com bolinhas no topo.' : ''}`,
    body: choices({
      key: 'piping',
      items: shop,
      first: FIRST.piping,
      picked: pip.id === 'liso' ? [] : [pip.id],
      ui,
      noun: 'bicos',
      all: 'todos os',
      label: 'Creme de bico',
      lead: card({ set: 'pipingStyle', value: 'liso', on: pip.id === 'liso', name: 'Sem bico', artwork: artBox(CANDLE_ART.none, 'cq-art--line cq-art--none'), price: html`<span class="cq-card__price is-free">só a cobertura</span>` }),
      card: (x) => card({ set: 'pipingStyle', value: x.id, on: pip.id === x.id, name: x.name, hint: HINTS.piping[x.id] || '', price: priceNote(deltaOf(c, x.id === pip.id ? pipingPriceOf(c) : x.price)), artwork: picArt('p', x.id, PIPING_ART[x.id] || PIPING_ART.bolinhas), block: pip.id === x.id ? null : can(`piping:${x.id}`, (v) => (v.piping.style = x.id), (v) => v.piping.style === x.id) }),
    }),
  };
}

function askPipingWhere(c) {
  const pip = getPiping(c.piping.style);
  const places = pipingPlaces(pip.id);
  const can = prober(c);
  return {
    legend: c.piping.where === 'cobre' ? 'O creme de bico cobre o topo todo, em volta dos enfeites.' : `${pip.name} ${HINTS.where[c.piping.where] || ''}.`,
    body: html`<div class="cq-grid cq-grid--3" role="radiogroup" aria-label="Onde vai o creme de bico">
      ${PIPING_PLACES.filter((x) => places.includes(x.id)).map((x) => card({ set: 'pipingWhere', value: x.id, on: c.piping.where === x.id, name: x.name, hint: HINTS.where[x.id] || '', artwork: artBox(WHERE_ART[x.id] || WHERE_ART.top, 'cq-art--line'), block: c.piping.where === x.id ? null : can(`where:${x.id}`, (v) => (v.piping.where = x.id), (v) => v.piping.where === x.id) }))}
    </div>`,
  };
}

function askPipingColor(c) {
  return { legend: colorLegend(c.piping.color), body: palette('pipingColor', c.piping.color, COLORS, 'Cor do creme de bico') };
}

/** O que o distribuidor de decorações adaptou neste bolo (nunca derruba o painel se algo der errado lá). */
let notesMemo = { key: '', value: null };
function notesOf(c) {
  // o painel pergunta várias vezes pelo mesmo bolo a cada escolha: a resposta fica guardada
  const key = JSON.stringify({ ...c, name: undefined, backdrop: undefined });
  if (notesMemo.key === key && notesMemo.value) return notesMemo.value;
  try {
    const n = decorNotes(c) || {};
    const value = { adapted: Boolean(n.adapted), messages: Array.isArray(n.messages) ? n.messages : [], unfit: Array.isArray(n.unfit) ? n.unfit : [], unfitIds: Array.isArray(n.unfitIds) ? n.unfitIds : [], fit: n.fit && typeof n.fit === 'object' ? n.fit : {}, placed: Array.isArray(n.placed) ? n.placed : [] };
    notesMemo = { key, value };
    return value;
  } catch (err) {
    console.error('[personalizador] avisos das decorações', err);
    return { adapted: false, messages: [], unfit: [], unfitIds: [], fit: {} };
  }
}

/**
 * O bolo como será feito e cobrado: sem o que o distribuidor não conseguiu pôr no bolo e com a quantidade que
 * de fato ficou. Tirar uma peça abre espaço para as outras, então sai uma de cada vez — a escolhida por último
 * primeiro — e a conta se repete até tudo caber: fica no bolo o máximo do que a pessoa escolheu. Só quando as
 * decorações já cabem é que saem a escrita que não coube e as quantidades que o distribuidor reduziu.
 * É deste bolo que saem o total, o detalhamento do preço e o resumo, e é ele que vai para o carrinho.
 * → { config, removed, lowered, candles, changed } (config === c quando tudo coube)
 */
let billMemo = { key: '', value: null };
function billOf(c) {
  const key = JSON.stringify({ ...c, name: undefined, backdrop: undefined });
  if (billMemo.key === key) return billMemo.value;
  let cur = c;
  const removed = [];
  const lowered = new Map();
  let candles = null;
  let placedOut = 0; // r5-decor: peças colocadas à mão que não couberam (não cobradas)
  try {
    for (let i = 0; i < 16; i++) {
      const notes = notesOf(cur);
      const out = cur.decor.items.filter((id) => notes.unfitIds.includes(id));
      // na última volta sai de uma vez tudo o que não coube (garante que nada "não coube" vá adiante)
      const stepBill = billableConfig(cur, i === 15 ? { unfitIds: notes.unfitIds } : out.length ? { unfitIds: [out[out.length - 1]] } : notes);
      if (!stepBill.changed) break;
      removed.push(...stepBill.removed);
      stepBill.lowered.forEach((l) => lowered.set(l.id, { id: l.id, from: lowered.get(l.id)?.from || l.from, to: l.to }));
      if (stepBill.candles) candles = { from: candles?.from || stepBill.candles.from, to: stepBill.candles.to };
      placedOut += stepBill.placedOut || 0;
      cur = stepBill.config;
    }
  } catch (err) {
    console.error('[personalizador] bolo cobrável', err);
    cur = c;
  }
  // na ordem em que a pessoa escolheu (a escrita por último)
  const order = (id) => (id === 'escrita' ? 99 : c.decor.items.indexOf(id));
  const gone = [...new Set(removed)].sort((x, y) => order(x) - order(y));
  const value = {
    config: cur,
    removed: gone,
    lowered: [...lowered.values()].filter((l) => !gone.includes(l.id)),
    candles: gone.includes('velas') ? null : candles,
    placedOut,
    changed: cur !== c,
  };
  billMemo = { key, value };
  return value;
}

/* ── Decoração ── */
/** Ajustes de uma decoração escolhida: tipo, arranjo, fartura e cor. */
function decorAdjust(c, id) {
  const d = getDecor(id);
  const o = decorOptions(c, id);
  return html`<div class="cz-adjust" data-k="adjustbox:${id}">
    <div class="cz-adjust__head"><strong>${d.name}</strong><span>${d.craft || d.desc}</span></div>
    ${d.kinds
      ? html`<span class="cz-sub__label">Tipo</span>
          <div class="cz-chips" role="radiogroup" aria-label="Tipo de ${d.name}">
            ${d.kinds.map((k) => chip(`decorKind.${id}`, k.id, o.kind === k.id, k.name))}
          </div>`
      : ''}
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
          ${palette(`decorColor.${id}`, o.color, decorSwatches(DECOR_COLORS[d.colors]), `Cor de ${d.name}`)}`
      : ''}
  </div>`;
}

/**
 * "Com o dedo": a peça que está na mão, as que já foram para o bolo e as saídas por botão (colocar onde couber,
 * tirar uma, tirar todas) para quem usa teclado ou leitor de tela.
 */
function handBox(c, armed) {
  const groups = placedGroups(c);
  const total = c.decor.placed.length;
  const d = armed ? getDecor(armed) : null;
  return html`<div class="cz-hand" data-k="hand:box">
    <p class="cz-hand__lead" data-k="hand:lead">
      ${d
        ? html`<strong>${d.name}</strong> na mão. Toque no bolo, onde quiser: ${money(d.unit)} cada.`
        : total >= MAX_PLACED
          ? `O bolo já tem ${MAX_PLACED} peças postas com o dedo, que é o limite. Tire uma para trocar.`
          : 'Escolha uma peça abaixo e toque no bolo para colocar. Arraste para mudar de lugar, toque nela para tirar.'}
    </p>
    ${d
      ? html`<div class="cz-hand__acts" data-k="hand:acts">
          <button type="button" class="btn btn--soft btn--sm" data-act="place-auto" ${total >= MAX_PLACED ? raw('disabled') : ''}>${icon('plus')} Colocar onde couber</button>
          <button type="button" class="cz-linkbtn" data-act="place-done">Soltar a peça</button>
        </div>`
      : ''}
    ${groups.length
      ? html`<div class="cz-picked" role="group" aria-label="Peças postas com o dedo: ${total} de ${MAX_PLACED}" data-k="hand:placed">
          ${groups.map(
            (g) => html`<span class="cz-pick" data-k="placed:${g.id}">
              <span class="cz-pick__main cz-pick__main--static">${g.name} × ${g.n}<small>${money(g.unit * g.n)}</small></span>
              <button type="button" class="cz-pick__x" data-act="place-remove" data-value="${g.id}" aria-label="Tirar uma peça de ${g.name} (${g.n} no bolo)">${ICON.minus}</button>
            </span>`,
          )}
          <button type="button" class="cz-linkbtn" data-act="place-clear" data-k="placed:clear">Tirar todas</button>
        </div>`
      : ''}
  </div>`;
}

const adjustable = (d) => Boolean(d) && (d.qty || d.colors || d.kinds || d.arrs.length > 1);

/** O que já está no bolo (enfeites escolhidos), com ajustar e tirar; e os avisos do que foi adaptado ou não coube. */
function pickedBox(c, ui, { hidden = false } = {}) {
  const items = c.decor.items; // as velas também aparecem aqui (o ajuste delas é a pergunta "Velas")
  const bill = billOf(c);
  const notes = notesOf(bill.config);
  const billNotes = billPreview(bill);
  const open = items.includes(ui.decorOpen) && adjustable(getDecor(ui.decorOpen)) ? ui.decorOpen : null;
  return html`
    ${items.length
      ? html`<div class="cz-picked" role="group" aria-label="Enfeites no bolo: ${c.decor.items.length} de ${MAX_DECORS}" data-k="decor:picked" ${hidden ? raw('hidden') : ''}>
          ${items.map((id) => {
            const d = getDecor(id);
            const candles = id === 'velas';
            const can = candles || adjustable(d);
            // escolhida, mas sem lugar neste bolo: a etiqueta avisa (o motivo e a saída estão no aviso logo abaixo)
            const out = bill.removed.includes(id);
            return html`<span class="cz-pick ${open === id ? 'is-on' : ''} ${out ? 'is-out' : ''}" data-k="pick:${id}">
              <button type="button" class="cz-pick__main" data-act="${candles ? 'ask' : 'adjust'}" data-value="${id}" ${can ? (candles ? '' : raw(`aria-expanded="${open === id ? 'true' : 'false'}"`)) : raw('disabled')} aria-label="${candles ? 'Ajustar as velas: tipo, cores e quantidade' : can ? `Ajustar ${d.name}: arranjo, quantidade e cor` : d.name}${out ? ' (não coube neste bolo, não cobrado)' : ''}">
                ${d.name}${out ? html`<span class="cz-pick__out">Não coube neste bolo · não cobrado</span>` : ''}${can ? icon('sliders') : ''}
              </button>
              <button type="button" class="cz-pick__x" data-act="decor-off" data-value="${id}" aria-label="Tirar ${d.name}">${icon('x')}</button>
            </span>`;
          })}
          <button type="button" class="cz-linkbtn" data-act="clear-decor" data-k="decor:clear">Tirar todos</button>
        </div>`
      : ''}
    ${notes.messages.length || billNotes.length ? html`<div class="cz-note cz-note--warn cz-note--list" role="status" data-k="decor:notes">${[...notes.messages, ...billNotes].map((m) => html`<p>${m}</p>`)}</div>` : ''}
    ${open && !hidden ? decorAdjust(c, open) : ''}
  `;
}

function askTheme(c, ui) {
  const theme = getTheme(c.decor.theme);
  const themes = THEMES.filter((t) => isActive(t) || t.id === c.decor.theme);
  return {
    legend: theme ? `${theme.name}: ${low(theme.desc)}.` : TERMS.tema,
    body: choices({
      key: 'theme',
      items: themes,
      first: FIRST.theme,
      groups: THEME_GROUPS,
      picked: theme ? [theme.id] : [],
      ui,
      noun: 'temas',
      all: 'todos os',
      label: 'Temas prontos',
      role: 'group',
      lead: card({ act: 'theme', value: '', on: !theme, pressed: true, name: 'Sem tema', artwork: artBox(CANDLE_ART.none, 'cq-art--line cq-art--none'), price: html`<span class="cq-card__price is-free">eu escolho</span>`, k: 'theme:none' }),
      card: (t) => card({ act: 'theme', value: t.id, on: c.decor.theme === t.id, pressed: true, name: t.name, artwork: html`<span class="cq-art cq-art--pic cq-art--whole">${DECOR_ART.generic}<img src="assets/img/cz/t-${t.id}.webp" alt="" loading="lazy" decoding="async" width="120" height="120" /></span>` }),
    }),
  };
}

function askDecor(c, ui) {
  const items = c.decor.items;
  const full = items.length >= MAX_DECORS;
  const bill = billOf(c);
  const byHand = ui.decorHow === 'mao';
  const armed = byHand && getDecor(ui.armed)?.unit ? ui.armed : null;
  const shop = DECORS.filter((d) => d.id !== 'velas' && (byHand ? d.unit > 0 && isActive(d) : isActive(d) || items.includes(d.id)));
  const can = prober(c);
  const one = (d) => {
    if (byHand) {
      return card({ act: 'decor', value: d.id, on: armed === d.id, pressed: true, name: d.name, price: html`<span class="cq-card__price">${brl(d.unit)} cada</span>`, artwork: picArt('d', d.id, DECOR_ART[d.id]), k: `hand:${d.id}` });
    }
    const isOn = items.includes(d.id);
    const free = isOn && bill.removed.includes(d.id); // escolhida, mas não coube: não é cobrada
    const q = isOn && d.qty ? QUANTITIES.find((x) => x.id === decorOptions(free ? c : bill.config, d.id).qty).mult : 1;
    const block = isOn ? null : full ? { text: `Dá para combinar até ${MAX_DECORS} enfeites, para o bolo não ficar carregado. Tire um para trocar.` } : d.id === 'fita' || d.id === 'wafer' ? can(`decor:${d.id}`, (x) => x.decor.items.push(d.id), (x) => x.decor.items.includes(d.id)) : null;
    return card({ act: 'decor', value: d.id, on: isOn, role: 'checkbox', name: d.name, price: free ? html`<span class="cq-card__price">não cobrado</span>` : priceNote(deltaOf(c, d.price * q, d.scales)), artwork: picArt('d', d.id, DECOR_ART[d.id]), block });
  };
  const kitOn = (k) => k.items.every((id) => items.includes(id));
  // o interruptor do "com o dedo": embaixo da lista curta enquanto está desligado; ligado, sobe para o alto da lista
  // inteira (senão ficaria depois de cem peças, sem ninguém achar como desligar)
  const handToggle = html`<button type="button" class="cq-toggle ${byHand ? 'cq-toggle--top' : ''}" role="switch" aria-checked="${byHand ? 'true' : 'false'}" data-set="decorHow" data-value="${byHand ? 'arranjo' : 'mao'}" data-k="decor:how">
      <span class="cz-switch__knob"></span><span class="cq-toggle__text"><strong>Colocar com o dedo</strong><small>${byHand ? 'Ligado: cada toque no bolo põe uma peça.' : 'Você escolhe o lugar de cada peça, tocando no bolo.'}</small></span>
    </button>`;
  const anyOn = items.some((id) => id !== 'velas') || c.decor.placed.length > 0;
  return {
    legend: byHand ? 'Com o dedo: escolha a peça e toque no bolo, no lugar que quiser.' : anyOn ? 'Toque num enfeite do bolo para mudar a quantidade, o lugar e a cor.' : TERMS.enfeites,
    body: html`
      ${pickedBox(c, ui, { hidden: byHand })}
      ${byHand ? handBox(c, armed) : ''}
      ${byHand
        ? ''
        : html`<div class="cq-grid cq-grid--3" role="group" aria-label="Conjuntos prontos de enfeites" data-k="grid:kits">
            ${KITS.filter((k) => k.items.every((id) => isActive(getDecor(id) || { active: false }))).map((k) =>
              card({
                act: 'kit',
                value: k.id,
                on: kitOn(k),
                pressed: true,
                name: k.name,
                hint: k.hint,
                price: priceNote(k.items.reduce((sum, id) => sum + deltaOf(c, getDecor(id).price, getDecor(id).scales), 0)),
                artwork: html`<span class="cq-art cq-art--pic cq-art--duo">${k.pics.slice(0, 2).map((id) => html`<img src="assets/img/cz/d-${id}.webp" alt="" loading="lazy" decoding="async" width="96" height="96" />`)}</span>`,
              }),
            )}
          </div>`}
      <section class="cq-extra cq-extra--list" data-k="extra:umaauma">
        <h3 class="cq-extra__label">${byHand ? 'Peças para pôr com o dedo' : 'Ou escolha um por um'}</h3>
        ${byHand ? handToggle : ''}
        ${choices({ key: 'decor', items: shop, first: FIRST.decor, groups: DECOR_GROUPS, picked: [], ui, noun: byHand ? 'peças' : 'enfeites', all: byHand ? 'todas as' : 'todos os', label: byHand ? 'Peças para pôr com o dedo' : 'Enfeites, um por um', role: 'group', card: one })}
        ${byHand ? '' : handToggle}
      </section>
    `,
  };
}

function askCandles(c) {
  const on = c.decor.items.includes('velas');
  const st = getCandleStyle(c.decor.candleStyle) || CANDLE_STYLES[0];
  const full = c.decor.items.length >= MAX_DECORS;
  const out = on && billOf(c).removed.includes('velas');
  return {
    legend: out ? 'As velas não couberam com os outros enfeites do topo: não são cobradas. Tire um enfeite para elas entrarem.' : on ? `${st.name}: ${low(st.desc)}.` : TERMS.velas,
    body: html`
      <div class="cq-grid cq-grid--3" role="radiogroup" aria-label="Velas">
        ${card({ set: 'candle', value: '', on: !on, name: 'Sem velas', artwork: artBox(CANDLE_ART.none, 'cq-art--line cq-art--none') })}
        ${CANDLE_STYLES.filter((x) => isActive(x) || (on && x.id === st.id)).map((x) =>
          card({ set: 'candle', value: x.id, on: on && st.id === x.id, name: x.name, price: priceNote(deltaOf(c, getDecor('velas').price, getDecor('velas').scales) + (x.price || 0)), artwork: artBox(CANDLE_ART[x.id] || CANDLE_ART.classica, 'cq-art--line'), block: on || !full ? null : { text: `Dá para combinar até ${MAX_DECORS} enfeites. Tire um para pôr as velas.` } }),
        )}
      </div>
      ${on
        ? html`<div data-cz-candles data-k="velas:ajustes">
            ${st.count
              ? extra(
                  'Quantas velas?',
                  html`<div class="cz-row cz-row--gap">
                    <div class="cz-row__text"><span>De 1 a ${MAX_CANDLES}</span></div>
                    ${qtyStepper(c.decor.candles, { min: 1, max: MAX_CANDLES, id: 'candles' })}
                  </div>`,
                  'velasqtd',
                )
              : st.id === 'numero'
                ? extra(
                    html`<label for="cz-number">Qual número?</label>`,
                    html`<input class="input" id="cz-number" type="text" inputmode="numeric" maxlength="3" placeholder="Ex.: 7" value="${c.decor.number}" data-field="number" autocomplete="off" enterkeyhint="done" />`,
                    'velasnum',
                  )
                : ''}
            ${st.colors
              ? extra(
                  'Cores das velas',
                  html`<div class="cz-chips cz-chips--scroll" role="radiogroup" aria-label="Cores das velas">
                    ${CANDLE_PALETTES.map((x) => chip('candlePalette', x.id, c.decor.candlePalette === x.id, x.name, { swatch: x.hexes[0] }))}
                  </div>`,
                  'velascor',
                )
              : ''}
          </div>`
        : ''}
    `,
  };
}

function askMessage(c) {
  const bico = c.decor.messageMode === 'bico';
  const room = scriptRoom(c); // a escrita com bico cabe (e aparece) no topo deste bolo?
  const noScript = billOf(c).removed.includes('escrita');
  const has = Boolean(c.decor.message);
  return {
    legend: TERMS.mensagem,
    body: html`
      <div class="cz-field cq-field">
        <div class="cz-field__top">
          <label for="cz-message">O que vai escrito</label>
          <span class="cz-field__price">${noScript ? 'não cobrado' : `+ ${money(bico ? SCRIPT_PRICE : MESSAGE_PRICE)}`}</span>
        </div>
        <input class="input" id="cz-message" type="text" maxlength="${MESSAGE_MAX}" placeholder="Ex.: Parabéns, Ana!" value="${c.decor.message}" data-field="message" autocomplete="off" enterkeyhint="done" aria-describedby="cz-message-count" />
        <div class="cz-field__foot">
          <span>${bico ? 'Escrita com bico de confeitar, direto na cobertura.' : 'A plaquinha aparece no bolo enquanto você escreve.'}</span>
          <span id="cz-message-count" data-count="message">${c.decor.message.length}/${MESSAGE_MAX}</span>
        </div>
        <div class="cz-ideas" aria-label="Ideias de mensagem">
          ${MESSAGE_IDEAS.map((m) => html`<button type="button" data-act="idea" data-value="${m}">${m}</button>`)}
          <button type="button" class="cz-ideas__clear" data-act="idea" data-value="" data-clear-message ${has ? '' : raw('hidden')}>Sem mensagem</button>
        </div>
      </div>
      ${extra(
        'Onde vai a mensagem',
        html`<div class="cz-seg" role="radiogroup" aria-label="Onde vai a mensagem">
            <button type="button" role="radio" aria-checked="${bico ? 'false' : 'true'}" data-set="messageMode" data-value="placa" data-k="messageMode:placa">Na plaquinha</button>
            <button type="button" role="radio" aria-checked="${bico ? 'true' : 'false'}" data-set="messageMode" data-value="bico" data-k="messageMode:bico" class="${room.ok ? '' : 'is-blocked'}" ${room.ok ? '' : raw('aria-disabled="true"')} data-why="${room.ok ? '' : room.why === 'alto' ? `Neste bolo de 3 andares a mensagem vai na plaquinha: o último andar fica alto e tem só ${room.top} cm, e a escrita não apareceria de frente.` : `No topo deste bolo cabem até ${room.perLine} letras por linha (ele tem ${room.top} cm). Encurte a mensagem ou deixe na plaquinha.`}" data-name="Escrita no topo" data-fixed="1">Escrita no topo</button>
          </div>
          ${noScript ? html`<p class="cz-note cz-note--warn" data-k="script:out">A escrita não coube no topo com as outras peças · não cobrada. Passe para a plaquinha ou tire um enfeite do topo; do jeito que está, a mensagem sai do bolo ao adicionar ao carrinho.</p>` : ''}`,
        'msgonde',
      )}
      ${bico
        ? html`${extra('Letra', html`<div class="cz-chips" role="radiogroup" aria-label="Letra da mensagem">${SCRIPTS.map((x) => chip('script', x.id, c.decor.script === x.id, x.name))}</div>`, 'msgletra')}
            ${DOODLES.filter(isActive).length > 1 ? extra('Desenho ao lado', html`<div class="cz-chips cz-chips--scroll" role="radiogroup" aria-label="Desenho ao lado da escrita">${DOODLES.filter(isActive).map((x) => chip('doodle', x.id || 'nenhum', c.decor.doodle === x.id, x.name))}</div>`, 'msgdes') : ''}
            ${extra('Cor da escrita', palette('messageColor', c.decor.messageColor, COLORS, 'Cor da escrita'), 'msgcor')}`
        : PLAQUE_SHAPES.filter(isActive).length > 1
          ? extra('Formato da plaquinha', html`<div class="cz-chips" role="radiogroup" aria-label="Formato da plaquinha">${PLAQUE_SHAPES.filter(isActive).map((x) => chip('plaque', x.id, c.decor.plaque === x.id, x.name))}</div>`, 'placa')
          : ''}
    `,
  };
}

function askTopper(c) {
  return {
    legend: TERMS.topo,
    body: html`
      <div class="cz-field cq-field">
        <div class="cz-field__top">
          <label for="cz-topper">Nome ou idade</label>
          <span class="cz-field__price">+ ${money(TOPPER_PRICE)}</span>
        </div>
        <input class="input" id="cz-topper" type="text" maxlength="${TOPPER_MAX}" placeholder="Ex.: Ana 7" value="${c.decor.topper.text}" data-field="topper" autocomplete="off" enterkeyhint="done" />
        <div class="cz-field__foot"><span>Deixe em branco para ir sem topo.</span><span data-count="topper">${c.decor.topper.text.length}/${TOPPER_MAX}</span></div>
      </div>
      ${TOPPER_STYLES.filter(isActive).length > 1
        ? extra('Estilo', html`<div class="cz-chips cz-chips--scroll" role="radiogroup" aria-label="Estilo do topo">${TOPPER_STYLES.filter(isActive).map((t) => chip('topperStyle', t.id, c.decor.topper.style === t.id, t.name))}</div>`, 'topoestilo')
        : ''}
      ${extra(
        'Material e cor',
        html`<div class="cz-chips" role="radiogroup" aria-label="Material do topo">${TOPPER_FINISHES.map((t) => chip('topperFinish', t.id, c.decor.topper.finish === t.id, t.name))}</div>
          ${c.decor.topper.finish === 'madeira'
            ? ''
            : html`<div class="cz-chips" role="radiogroup" aria-label="Cor do topo" data-k="topper:colors">${TOPPER_COLORS.map((t) => chip('topperColor', t.hex, c.decor.topper.color === t.hex, t.name, { swatch: t.hex }))}</div>`}`,
        'topomat',
      )}
    `,
  };
}

const ASKERS = {
  formato: { formato: askShape, tamanho: askSize, andares: askTiers, altura: askHeight, base: askBase },
  massa: { sabor: askFlavor, calda: askSoak },
  recheio: { sabor: askFilling, adicional: askFillAdd },
  cobertura: { tipo: askCover, cor: askCoverColor, estilo: askCoverStyle, transborda: askOverflow, calda: askDrip },
  acabamento: { bico: askPiping, onde: askPipingWhere, cor: askPipingColor },
  decoracao: { tema: askTheme, enfeites: askDecor, velas: askCandles, mensagem: askMessage, topo: askTopper },
};

/** O alto de toda pergunta: a faixa de perguntas da etapa (onde a pessoa está e o que falta), a pergunta e a linha de apoio. */
function askHead({ stage = '', list = [], q = null, title, legend, tight = false }) {
  const at = q ? list.findIndex((x) => x.id === q.id) : -1;
  // tight = a linha de apoio é fixa e curta (o começo): não reserva a segunda linha
  return html`<header class="cq-head ${tight ? 'cq-head--tight' : ''}" data-k="head">
    ${list.length > 1
      ? html`<nav class="cq-nav" aria-label="Perguntas de ${stage}: ${at + 1} de ${list.length}" data-k="nav">
          ${list.map(
            (x, i) => html`${i ? html`<span class="cq-nav__sep" aria-hidden="true">${icon('chevron-right')}</span>` : ''}<button type="button" class="cq-nav__btn ${i === at ? 'is-on' : ''} ${i < at ? 'is-done' : ''}" data-act="ask" data-value="${x.id}" ${i === at ? raw('aria-current="step"') : ''} data-k="nav:${x.id}">${x.nav}</button>`,
          )}
        </nav>`
      : ''}
    <h2 class="cq-title" id="cq-title" data-k="title">${title}</h2>
    <p class="cq-legend" data-k="legend">${legend}</p>
  </header>`;
}

function billLines(c) {
  const bill = billOf(c);
  const b = breakdownOf(bill.config);
  return html`
    ${b.lines.map((l) => html`<div class="cz-bill__line"><span>${l.label}${l.detail ? html`<small>${l.detail}</small>` : ''}</span><b>${money(l.value)}</b></div>`)}
    <div class="cz-bill__total"><span>Total</span><strong>${money(b.total)}</strong></div>
    <p class="cz-bill__note">ou ${money(b.total * (1 - SITE.pix.discountPct / 100))} no Pix (${SITE.pix.discountPct}% de desconto)</p>
    ${billPreview(bill).length ? html`<div class="cz-note cz-note--warn cz-note--list" data-cz-billnote>${billPreview(bill).map((t) => html`<p>${t}</p>`)}</div>` : ''}
  `;
}

/** Nome do bolo no resumo: o título com "dar um nome" (a criança batiza o bolo) ou, durante a edição, o campo. */
function nameBox(c, renaming) {
  if (renaming) {
    return html`<label class="sr-only" for="cz-name">Nome do bolo</label>
      <input class="input cz-offer__input" id="cz-name" type="text" maxlength="40" placeholder="${autoName(c)}" value="${c.name}" data-field="name" autocomplete="off" enterkeyhint="done" />`;
  }
  return html`<h2>${displayName(c)}</h2>
    <button type="button" class="cz-rename" data-act="rename" data-k="rename:toggle">${icon('edit')} ${c.name?.trim() ? 'mudar o nome' : 'dar um nome'}</button>`;
}

/** Linha de pagamento da oferta: "ou R$ 256,69 no Pix · até 6x sem juros". */
function payLine(total) {
  const { maxInstallments, minInstallment } = SITE.card;
  const parcels = Math.max(1, Math.min(maxInstallments, Math.floor(total / minInstallment)));
  return html`ou <strong>${money(total * (1 - SITE.pix.discountPct / 100))}</strong> no Pix${parcels > 1 ? ` · até ${parcels}x sem juros` : ' · ou no cartão'}`;
}

/** Etapa final: o bolo pronto. Nome, preço e as duas saídas (pedir ou mostrar para um adulto) no alto; os detalhes, a um toque. */
function stepResumo(real, ui) {
  // o resumo descreve e soma o bolo como ele será feito: o que não coube fica de fora (e o aviso diz o quê)
  const bill = billOf(real);
  const c = bill.config;
  const parts = partsOf(c);
  const rows = [
    { step: 'formato', iconName: 'cube', label: 'Formato e tamanho', text: parts.formato },
    { step: 'massa', iconName: 'layers', label: 'Massa', text: parts.massa },
    { step: 'recheio', iconName: 'utensils', label: 'Recheio', text: parts.recheio },
    { step: 'cobertura', iconName: 'palette', label: 'Cobertura', text: parts.cobertura },
    { step: 'acabamento', iconName: 'wand', label: 'Bico', text: parts.acabamento },
    { step: 'decoracao', iconName: 'sparkles', label: 'Decoração', text: parts.decoracao },
  ];
  const total = priceOf(c);
  return html`
    ${ui.from?.kind === 'draft' ? fromBox(ui) : ''}
    <header class="cz-offer">
      ${ui.editing ? html`<span class="badge">${icon('edit')} Editando o bolo do carrinho</span>` : ''}
      ${ui.linked ? html`<p class="cq-linked" data-k="resumo:link">${icon('gift')}<span>Montaram este bolo e mandaram para você ver. Se gostar, é só pedir.</span></p>` : ''}
      <div class="cz-offer__name" data-cz-namebox>${nameBox(real, ui.renaming)}</div>
      <div class="cz-offer__price"><strong data-cz-price>${money(total)}</strong></div>
      <p class="cz-offer__pay" data-cz-pay>${payLine(total)}</p>
      <p class="cz-offer__ship">${icon('calendar')}<span>Dá ${servesText(c)} · receba a partir de <strong>${firstDate(c)}</strong></span></p>
      <div class="cq-ends">
        ${ui.linked || ui.editing
          ? ''
          : html`<button type="button" class="cq-end cq-end--show" data-act="show-adult" data-k="end:show">
              <span class="cq-end__icon">${icon('users')}</span>
              <span class="cq-end__text"><strong>Mostrar para um adulto</strong><small>Para quem vai fazer o pedido</small></span>
              ${icon('chevron-right')}
            </button>`}
        <button type="button" class="cq-end at-revealbtn" data-act="reveal-cake" data-k="reveal:cake">
          <span class="cq-end__icon at-revealbtn__icon">${ICON.atelier}</span>
          <span class="cq-end__text at-revealbtn__text"><strong>Revelar meu bolo</strong><small>${c.decor.items.includes('velas') ? 'Luz baixa, velas acesas e você sopra' : 'Luz baixa, uma volta e confete'}</small></span>
          ${icon('chevron-right')}
        </button>
      </div>
      ${billPreview(bill).length ? html`<div class="cz-note cz-note--warn cz-note--list" role="status" data-k="resumo:bill">${billPreview(bill).map((t) => html`<p>${t}</p>`)}</div>` : ''}
    </header>

    <h3 class="cq-sumhead">O que tem neste bolo</h3>
    <div class="cz-sum">
      ${rows.map(
        (r) => html`<button type="button" class="cz-sum__row" data-act="goto" data-value="${r.step}" aria-label="Mudar ${r.label}: ${r.text}">
          <span class="cz-sum__icon">${icon(r.iconName)}</span>
          <span class="cz-sum__text"><small>${r.label}</small><span>${cap(r.text)}</span></span>
          <span class="cz-sum__edit">${icon('edit')} Mudar</span>
        </button>`,
      )}
    </div>

    ${ui.revealOffer && !c.reveal?.on
      ? html`<div class="cz-rules cz-rules--sum" data-k="resumo:cha">
          <div class="cz-rule cz-rule--dica" role="note">
            <span class="cz-rule__icon">${icon('info')}</span>
            <p><strong>Chá revelação desligado:</strong> este bolo vai com o recheio sem cor. Para a surpresa no corte, escolha a cor em segredo.</p>
            <button type="button" class="cz-linkbtn cz-rule__fix" data-act="reveal-color">Escolher a cor em segredo</button>
          </div>
        </div>`
      : ''}

    ${rulesOf(c).some((r) => r.level === 'alerta')
      ? html`<div class="cz-rules cz-rules--sum" data-k="resumo:regras">
          <h3>Antes de pedir, o que a confeitaria avisa</h3>
          ${rulesOf(c)
            .filter((r) => r.level === 'alerta')
            .map((r) => html`<div class="cz-rule cz-rule--alerta" role="note" data-k="rule:${r.code}"><span class="cz-rule__icon">${icon('alert')}</span><p>${r.text}</p></div>`)}
        </div>`
      : ''}

    <div class="cz-after">
      <button type="button" class="cz-linkbtn cz-linkbtn--solid" data-act="breakdown">${icon('receipt')} Ver detalhes do preço</button>
      <button type="button" class="cz-linkbtn" data-act="ficha">${icon('utensils')} Como será feito</button>
      <div class="cz-quiet" role="group" aria-label="Lembranças deste bolo">
        <button type="button" class="cz-quiet__btn" data-act="save" aria-pressed="${ui.savedId ? 'true' : 'false'}" data-k="save:toggle" aria-label="${ui.savedId ? 'Tirar dos favoritos' : 'Guardar nos favoritos'}" title="${ui.savedId ? 'Guardado nos favoritos' : 'Guardar nos favoritos'}">${icon('heart')}<span>${ui.savedId ? 'Guardado' : 'Guardar'}</span></button>
        <button type="button" class="cz-quiet__btn" data-act="share" aria-label="Cartão do bolo: a foto com o nome, para enviar ou guardar" title="Cartão do bolo">${ICON.card}<span>Cartão</span></button>
        <button type="button" class="cz-quiet__btn" data-act="download" aria-label="Baixar a foto do bolo" title="Baixar a foto do bolo">${icon('download')}<span>Foto</span></button>
        <button type="button" class="cz-quiet__btn" data-act="video" aria-label="Gravar um vídeo do bolo" title="Vídeo do bolo" data-k="video:btn" ${ui.canVideo ? '' : raw('hidden')}>${ICON.film}<span>Vídeo</span></button>
        <button type="button" class="cz-quiet__btn" data-act="link" aria-label="Copiar o link deste bolo" title="Copiar o link deste bolo">${icon('copy')}<span>Link</span></button>
      </div>
    </div>
    <p class="cz-trust">${icon('shield-check')}<span>Feito sob encomenda, do jeito que você montou. O dia e o horário da entrega você escolhe ao fechar o pedido, e a BOLAB confirma tudo com você antes de produzir.</span></p>
  `;
}

/** De onde o bolo partiu (inspiração ou surpresa): um aviso curto no alto das perguntas de Formato, com a saída rápida. */
function fromBox(ui) {
  if (!ui.from) return '';
  if (ui.from.kind === 'draft') {
    // quem volta encontra o bolo que deixou — e a saída para começar outro, sem procurar
    return html`<div class="cq-from" data-k="from">
      <p>Este é o bolo que você deixou guardado. Continue de onde parou.</p>
      <button type="button" class="cz-linkbtn cz-linkbtn--solid" data-act="restart">Começar outro</button>
    </div>`;
  }
  return html`<div class="cq-from" data-k="from">
    <p>${ui.from.kind === 'surprise' ? 'Bolo surpresa montado.' : ui.from.kind === 'product' ? 'Partindo de um bolo do cardápio.' : html`Partindo de <strong>${ui.from.name}</strong>.`} Mude o que quiser.</p>
    ${ui.from.kind === 'surprise' ? html`<button type="button" class="cz-linkbtn" data-act="surprise">${icon('shuffle')} Outro</button>` : ''}
    <button type="button" class="cz-linkbtn cz-linkbtn--solid" data-act="goto" data-value="resumo">Já está bom ${icon('arrow-right')}</button>
  </div>`;
}

/** A pergunta em cartaz na etapa (a que a pessoa abriu, ou a primeira que existe para este bolo). */
function currentQuestion(stage, c, ui) {
  const list = questionsOf(stage, c);
  return list.find((q) => q.id === ui.q) || list[0] || null;
}

function renderStep(i, c, ui) {
  const stage = STEPS[i].id;
  if (stage === 'resumo') return stepResumo(c, ui);
  if (stage === 'formato' && ui.start) {
    const out = ui.start === 'galeria' ? askGallery(c, ui) : askStart(c, ui);
    return html`${askHead({ title: ui.start === 'galeria' ? 'Qual bolo serve de inspiração?' : 'Como você quer começar?', legend: out.legend, tight: true })}<div class="cq-body" data-k="body:start:${ui.start}">${out.body}</div>`;
  }
  const list = questionsOf(stage, c);
  const q = currentQuestion(stage, c, ui);
  const out = ASKERS[stage][q.id](c, ui);
  return html`${stage === 'formato' || ui.from?.kind === 'draft' ? fromBox(ui) : ''}${askHead({ stage: STEPS[i].label, list, q, title: out.title || askText(q, c), legend: out.legend })}${whyBox(ui)}
    <div class="cq-body" data-k="body:${stage}:${q.id}">${out.body}</div>
    ${rulesBox(stage, c)}
    ${q === list[0] ? html`<p class="cq-tip" data-k="tip"><strong>Dica da confeitaria.</strong> ${tipFor(stage, c)}</p>` : ''}`;
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

/**
 * r5-tela — A ponte entre o motor 3D e a tela. O motor guarda as funções que recebe (enquadramento, "a pessoa
 * mexeu", "desenhei um quadro"…) e, depois de encerrado, continua preso a um registro de js/customizer/kit.js
 * (onDecorReady: o motor não cancela a inscrição). Se essas funções fossem as da própria tela, cada visita ao
 * personalizador deixaria a tela inteira na memória. Por isso o motor recebe só estes repasses, criados aqui fora:
 * ao sair, cut() esvazia o destino e a tela fica livre.
 */
function linkScene() {
  const to = {};
  return {
    to,
    options: {
      insets: () => to.insets?.() || {},
      onInteract: () => to.onInteract?.(),
      onFrame: () => to.onFrame?.(),
      onContextLost: () => to.onContextLost?.(),
      onContextRestored: () => to.onContextRestored?.(),
    },
    cut() {
      for (const key of Object.keys(to)) delete to[key];
    },
  };
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
            <button type="button" class="cz-restart" data-act="restart" aria-label="Recomeçar: voltar ao bolo em branco" title="Recomeçar">${icon('refresh')}<span>Recomeçar</span></button>
            <button type="button" class="cz-price" data-act="breakdown" aria-label="Ver detalhes do preço">
              <small>Total</small><strong data-cz-price></strong><span class="cz-price__more">${icon('chevron-down')}</span>
            </button>
          </header>

          <canvas class="cz-canvas" data-cz-canvas tabindex="0" role="img" aria-label="Visualização 3D do seu bolo. Arraste para girar; use as setas do teclado para girar e os botões ao lado para ver por dentro."></canvas>
          <div class="at-fx" data-at-fx></div>
          <div class="cz-loading" data-cz-loading><img src="assets/logo-mark.webp" alt="" width="44" height="68" /><span data-cz-loadtext>Preparando o seu bolo…</span></div>
          <div class="cz-fallback" data-cz-fallback hidden>
            <canvas width="520" height="520" aria-hidden="true"></canvas>
            <p>Seu aparelho não conseguiu abrir a visualização 3D, então mostramos um desenho. Pode montar à vontade: o bolo sai do forno exatamente como você escolher.</p>
          </div>
          <div class="cz-lost" data-cz-lost hidden><span>Recarregando a visualização…</span></div>

          <div class="cz-measure" data-cz-measure hidden></div>
          <div class="cz-meta" data-cz-meta></div>
          <div class="cz-tools" data-cz-tools>
            <button type="button" class="cz-tool" data-act="cutaway" aria-pressed="false" aria-label="Ver por dentro" title="Ver por dentro">${ICON.slice}<span class="sr-only">Ver por dentro</span></button>
            <button type="button" class="cz-tool cz-tool--reveal" data-act="reveal" aria-pressed="false" aria-label="Revelar a cor" title="Revelar a cor" hidden>${icon('gift')}<span class="sr-only">Revelar</span></button>
            <span class="cz-tools__slot" data-st-tool></span>
            <button type="button" class="cz-tool cz-tool--game" data-act="game" data-at-game aria-label="Encomendas e figurinhas" title="Encomendas e figurinhas" hidden>${ICON.game}</button>
            <button type="button" class="cz-tool cz-tool--more" data-act="stagemenu" aria-expanded="false" aria-controls="st-sheet" aria-label="Ateliê: som, jogo, vistas e fundo" title="Ateliê: som, jogo, vistas e fundo">${ICON.more}</button>
          </div>
          <div class="st-lane" data-st-lane></div>
        </section>

        <div class="at-layer" data-at-layer></div>

        <section class="cz-panel" aria-label="Opções do bolo">
          <nav class="cz-steps" data-cz-steps aria-label="Etapas"></nav>
          <div class="cz-body" data-cz-body tabindex="-1" role="group" aria-labelledby="cq-title"></div>
          <footer class="cz-foot" data-cz-foot></footer>
          <section class="st-sheet" id="st-sheet" data-st-sheet aria-label="Ateliê: som, jogo, vistas e fundo" tabindex="-1" hidden>
            <header class="st-sheet__head">
              <h2>Ateliê</h2>
              <button type="button" class="st-sheet__x" data-act="stagemenu-close" aria-label="Fechar">${icon('x')}</button>
            </header>
            <div class="st-sheet__body">
              <div class="st-group" data-at-hud>
                <button type="button" class="st-row st-row--game" data-act="game" data-at-game hidden>
                  <span class="st-row__icon">${ICON.game}</span>
                  <span class="st-row__text"><strong>Encomendas e figurinhas</strong><small>Brinque de confeiteiro: clientes pedem, você monta</small></span>
                  <span class="st-row__trail">${icon('chevron-right')}</span>
                </button>
                <button type="button" class="st-row st-row--switch" role="switch" aria-checked="false" data-act="reveal" data-st-row="reveal" hidden>
                  <span class="st-row__icon">${icon('gift')}</span>
                  <span class="st-row__text"><strong>Revelar a cor</strong><small>Mostra no corte a cor do chá revelação</small></span>
                  <span class="st-row__trail"><i class="st-switch" aria-hidden="true"></i></span>
                </button>
                <div class="st-row" data-st-row="tool" hidden>
                  <span class="st-row__icon">${DECOR_ART.velas}</span>
                  <span class="st-row__text"><strong>Velas</strong><small>Acenda e segure o botão para soprar</small></span>
                  <span class="st-row__trail" data-st-tool-home></span>
                </div>
                <div class="st-row st-row--sound" data-st-sound>
                  <span class="st-row__icon">${ICON.note}</span>
                  <span class="st-row__text"><strong>Som do ateliê</strong><small>Música, efeitos e a voz da Bô</small></span>
                  <span class="st-row__trail" data-at-sound></span>
                </div>
                <button type="button" class="st-row st-row--switch" role="switch" aria-checked="false" data-act="mode" data-at-mode>
                  <span class="st-row__icon">${ICON.bolt}</span>
                  <span class="st-row__text"><strong>Modo rápido</strong><small>Sem som, animações e a Bô: só o que é preciso para pedir</small></span>
                  <span class="st-row__trail"><i class="st-switch" aria-hidden="true"></i></span>
                </button>
              </div>
              <div class="st-group" data-st-views>
                <h3 class="st-group__title">Como ver o bolo</h3>
                <div class="cz-viewbar" id="cz-viewbar" data-cz-viewbar role="group" aria-label="Vistas"></div>
                <button type="button" class="st-row st-row--switch" role="switch" aria-checked="false" data-act="rotate">
                  <span class="st-row__icon">${ICON.spin}</span>
                  <span class="st-row__text"><strong>Giro automático</strong><small>O bolo roda devagar enquanto você escolhe</small></span>
                  <span class="st-row__trail"><i class="st-switch" aria-hidden="true"></i></span>
                </button>
                <button type="button" class="st-row st-row--switch" role="switch" aria-checked="false" data-act="measure">
                  <span class="st-row__icon">${ICON.ruler}</span>
                  <span class="st-row__text"><strong>Medidas</strong><small>Largura e altura em centímetros, sobre o bolo</small></span>
                  <span class="st-row__trail"><i class="st-switch" aria-hidden="true"></i></span>
                </button>
              </div>
              <div class="st-group">
                <div class="cz-bgbar" id="cz-bgbar" data-cz-bgbar></div>
              </div>
            </div>
          </section>
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
      tools: $('[data-cz-tools]'),
      toolSlot: $('[data-st-tool]'),
      lane: $('[data-st-lane]'),
      sheet: $('[data-st-sheet]'),
      measure: $('[data-cz-measure]'),
      viewbar: $('[data-cz-viewbar]'),
      bg: $('[data-cz-bg]'),
      bgbar: $('[data-cz-bgbar]'),
      fallback: $('[data-cz-fallback]'),
      lost: $('[data-cz-lost]'),
      loading: $('[data-cz-loading]'),
      live: $('[data-cz-live]'),
      stage: $('.cz-stage'),
      hud: $('[data-at-hud]'),
      layer: $('[data-at-layer]'),
      fx: $('[data-at-fx]'),
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

    /* ── r5-tela: modo Ateliê (cena, som, a Bô, gestos) × modo rápido (só o que é preciso para comprar) ──
       A escolha fica guardada. O módulo do ateliê (js/atelier/ui/) só é buscado depois do primeiro quadro do bolo. */
    let mode = prefs.get('atelierMode') === 'rapido' ? 'rapido' : 'atelie';
    let atelier = null;
    const frameSubs = new Set(); // quem quer ser avisado a cada quadro desenhado (gravação de vídeo, giro do prato)
    // r5-qa: a tela só se diz pronta (some o aviso "Untando a fôrma…", a tela 3D aparece, o ateliê é buscado) quando
    // o bolo está DE FATO desenhado. Antes, "is-ready" entrava logo depois de cake.setConfig(): em celular fraco o
    // primeiro quadro leva segundos (compilar materiais) e o palco ficava vazio, sem aviso, nesse meio-tempo.
    let firstFrame = null; // chamada uma vez, no primeiro quadro desenhado depois de o bolo entrar na cena
    let stageShown = false;
    let tellShown = null;
    const sceneShown = new Promise((resolve) => (tellShown = resolve));
    function stageReady() {
      if (stageShown) return;
      stageShown = true;
      firstFrame = null;
      el.cz.classList.add('is-ready');
      tellShown();
    }
    el.cz.dataset.mode = mode;
    // r6-tela: os avisos do palco (recado, pergunta, dica, controle de gesto) passam todos por aqui, um por vez
    const notes = createNotices({ lane: el.lane, cz: el.cz });

    /* ── estado ── */
    let config = blankConfig();
    let step = 0;
    let editLineId = null; // editando um bolo que já está no carrinho (?linha=<id>)
    const visited = new Set([0]);
    const ui = { flavorMode: 'all', fillMode: 'all', layer: 0, gap: 0, moreDrip: false, colorChosen: false, renaming: false, editing: false, celebrated: false, savedId: null, savedKey: '', occasion: '', tierMode: 'all', tier: 0, decorOpen: null, scriptFits: true, decorAdapted: false };
    // r7-criar: a pergunta em cartaz na etapa ('' = a primeira), as listas abertas em "Ver todas", a opção apagada em
    // que a pessoa tocou (o motivo aparece), o começo ('ask' = "como você quer começar?" · 'galeria' = inspirações),
    // de onde o bolo partiu (inspiração / surpresa), se chegou por link de alguém, e o que a pessoa escolheu por conta
    // própria (cor e bico: um tema pronto não passa por cima disso sem ela pedir)
    ui.q = '';
    ui.all = {};
    ui.why = null;
    ui.start = false;
    ui.galleryFrom = 'ask';
    ui.from = null;
    ui.linked = false;
    ui.own = { color: false, piping: false };
    const seenAsk = new Set(); // perguntas já vistas ("etapa:pergunta")
    // listas compridas: o grupo e a busca de cada uma ("Ver todas")
    ui.tabs = {};
    ui.search = {};
    // chá revelação: a cor só aparece no 3D depois de "Revelar"; revealSet = a pessoa já escolheu a cor neste bolo
    ui.revealed = false;
    ui.revealSet = false;
    ui.keep = null; // o bolo de antes de virar vulcão (camadas, recheios, cobertura), para voltar igual
    // r5-tela: decoração por arranjo pronto ou peça por peça, com o dedo; a peça "na mão"; vídeo disponível?
    ui.decorHow = 'arranjo';
    ui.armed = null;
    ui.canVideo = false;
    ui.sceneLive = false; // a cena do ateliê (cozinha, animações) está carregada?
    ui.sideIds = null; // peças que também grudam na lateral (Set), quando a cena sabe dizer onde o dedo tocou
    ui.gameOn = false;
    let cake = null;
    const sceneLink = linkScene(); // o que o motor chama de volta (cortado ao sair da tela)
    let cutaway = false;
    let autoCut = true; // enquanto a pessoa não mexer no botão, o corte abre sozinho nas etapas de massa e recheio
    let rotating = !reduceMotion && prefs.get('customizerRotate', true) !== false;
    let shownPrice = null;
    let priceAnim = 0;
    const said = { at: -1e9, text: '' }; // o último anúncio do ateliê ao leitor de tela

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
      ui.colorChosen = cov.color !== bareColor(cov.type);
      if (!config.decor.items.includes(ui.decorOpen)) ui.decorOpen = null;
      ui.scriptFits = scriptRoom(config).ok;
      ui.decorAdapted = notesOf(billOf(config).config).adapted; // não avisa de novo ao abrir um bolo que já vinha reorganizado
      ui.revealed = false;
      if (!config.reveal?.on) ui.revealSet = false;
    }

    /** Bolo que chega pronto (rascunho, favorito): sem tema, uma cor que não é o branco e um bico contam como escolha da pessoa. */
    function guessOwn() {
      const themed = Boolean(config.decor.theme);
      ui.own = { color: !themed && config.covering.color !== '#ffffff', piping: !themed && config.piping.style !== 'liso' };
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
      if (query.c) {
        // link de um bolo (js/customizer/share.js): abre exatamente aquele bolo, já no resumo
        const linked = decodeConfig(query.c);
        if (linked) {
          config = linked;
          step = STEP_INDEX.resumo;
          ui.linked = true; // o resumo vira "montaram este bolo para você ver" e o botão, "Pedir este bolo"
          return 'link';
        }
        toast('Esse link de bolo não abriu. Que tal montar um novo?');
      }
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
          ui.from = { kind: 'product', name: '' };
          return 'base';
        }
      }
      const draft = prefs.get('customizerDraft');
      if (draft) {
        config = normalizeConfig(draft);
        step = Math.max(0, Math.min(STEPS.length - 1, Number(prefs.get('customizerStep', 0)) || 0));
        ui.q = String(prefs.get('customizerAsk', '') || '');
        // um rascunho que ainda é o bolo em branco, parado no começo, não é "continuar": é começar. O mesmo vale para
        // o antigo bolo de vitrine (rosa, com rosetas e frutas) em que a pessoa nunca mexeu: ela não escolheu nada ali
        const same = (a, b) => JSON.stringify({ ...a, backdrop: 0 }) === JSON.stringify({ ...b, backdrop: 0 });
        const untouched = (step === 0 && (!ui.q || ui.q === 'formato') && same(config, normalizeConfig(blankConfig()))) || same(config, normalizeConfig(defaultConfig()));
        if (untouched) {
          config = blankConfig();
          step = 0;
          ui.q = '';
          ui.start = 'ask';
          return 'new';
        }
        ui.from = { kind: 'draft', name: '' };
        return 'draft';
      }
      ui.start = 'ask';
      return 'new';
    }

    // versões antigas guardavam as miniaturas das inspirações no aparelho (dezenas de KB regravados a cada escolha)
    if (prefs.get('customizerThumbs')) prefs.set('customizerThumbs', null);

    const origin = loadInitial(ctx.query || {});
    // um bolo guardado antes das regras de confeiteiro pode ter uma combinação que não se faz: abre já corrigido
    const opened = enforceRules(config);
    config = opened.config;
    syncModes();
    guessOwn();
    ui.revealSet = Boolean(config.reveal?.on); // um bolo que já chega com chá revelação já tem a cor escolhida
    if (opened.fixed.length) setTimeout(() => alive && toast(opened.fixed.map((r) => r.text).join(' '), { duration: 7000 }), 600);

    /* ── avisos ao ateliê (js/atelier/bus.js): som, assistente e efeitos só ouvem ──
       Nada disto roda dentro do toque: as mudanças são comparadas e avisadas no quadro seguinte (flush), junto
       com o preço. A cor do chá revelação nunca sai daqui: quem ouve recebe 'segredo'. */
    const SOURCES = { line: 'edicao', saved: 'salvo', base: 'produto', draft: 'rascunho', link: 'link', new: 'novo' };
    const publicConfig = (c) => (c.reveal ? { ...c, reveal: { ...c.reveal, color: 'segredo' } } : c);
    const told = { config: clone(config), price: null, dropped: '' };
    let changeBy = 'user'; // quem causou a próxima mudança: 'user' | 'preset' | 'surprise' | 'palette' | 'undo' | 'redo' | 'restart' | 'auto' | 'bo'
    let sceneBy = 'user'; // o mesmo, para a cena escolher entre a animação de preparo e a transição curta
    let changeNote = null; // mudança "geral" avisada antes das diferenças: { key: 'preset', value: 'festa' }
    /** Marca a origem da próxima mudança (inspiração, surpresa, paleta, desfazer…). Vale até o próximo aviso. */
    function mark(by, value = null) {
      changeBy = by;
      changeNote = by === 'auto' || by === 'user' || by === 'bo' ? null : { key: by, value };
    }
    function tellChanges() {
      const by = changeBy;
      sceneBy = by;
      const note = changeNote;
      changeBy = 'user';
      changeNote = null;
      const diffs = diffConfig(told.config, config);
      if (!diffs.length && !note) return;
      const bill = billOf(config);
      const price = priceOf(bill.config);
      const detail = { config: publicConfig(config), price, prevPrice: told.price ?? price, by };
      if (note) bus.emit('change', { key: note.key, value: note.value, prev: null, ...detail });
      diffs.forEach((d) => bus.emit('change', d.key === 'reveal.color' ? { key: d.key, value: 'segredo', prev: 'segredo', ...detail } : { ...d, ...detail }));
      told.config = clone(config);
      told.price = price;
      // o distribuidor reorganizou as decorações, ou alguma não coube (e não é cobrada)
      const adapted = notesOf(bill.config).adapted;
      const dropped = bill.removed.join();
      if ((adapted || dropped) && dropped !== told.dropped) bus.emit('fit', { adapted, dropped: bill.removed.slice(), config: publicConfig(config) });
      told.dropped = dropped;
    }
    const tellTool = (id, value = null) => bus.emit('tool', { id, value });

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
      mark(to === hist.future ? 'undo' : 'redo');
      hist.lock = true;
      hist.merge = '';
      ui.why = null;
      if (ui.start) {
        // desfazer um "Recomeçar": o bolo de antes volta, e com ele as perguntas (o começo sai de cena)
        ui.start = false;
        footKey = '';
      }
      // a pessoa continua no mesmo andar / camada que estava editando (quando ele ainda existe)
      const at = { tier: ui.tier, layer: ui.layer, gap: ui.gap };
      syncModes();
      ui.tier = Math.min(at.tier, (config.tiers || 1) - 1);
      ui.layer = Math.min(at.layer, config.layers.length - 1);
      ui.gap = Math.max(0, Math.min(at.gap, config.fillings.length - 1));
      const cov = coverRef();
      ui.colorChosen = cov.color !== bareColor(cov.type);
      guessOwn();
      commit();
      hist.lock = false;
      syncHist();
      renderFoot();
      el.live.textContent = said;
    }
    for (let i = 0; i <= step; i++) visited.add(i);

    /** Guarda o rascunho — menos quando a pessoa está editando um bolo do carrinho. */
    function storeDraft() {
      if (editLineId) return;
      prefs.set('customizerDraft', config);
      prefs.set('customizerStep', Math.max(0, step));
      prefs.set('customizerAsk', ui.start ? '' : ui.q || '');
    }
    const saveDraft = debounce(() => alive && storeDraft(), 350);

    /* ── 3D ── */
    /** Espaço que os botões flutuantes ocupam no palco e quanto do resto o bolo pode preencher. */
    const stageInsets = () => {
      // r6-tela: a grade do palco (css/customizer.css: --st-…). Em cima fica a barra do título; embaixo, a faixa da Bô
      // e dos avisos (--st-lane); a única coluna de ferramentas mora no canto de cima, à direita.
      // A tela 3D passa por baixo do cabeçalho (o cenário não é cortado): a altura dele entra na margem de cima.
      const hdr = Math.max(0, (el.stage.querySelector('.cz-top')?.offsetHeight || 56) - 8);
      if (desktop.matches) return { top: 4 + hdr, bottom: 96, fill: 0.8 };
      // na revelação os botões e a Bô saem de cena: o bolo toma o palco
      if (el.cz.classList.contains('is-revealing')) return { top: 12 + hdr, bottom: 36, fill: 0.88 };
      // Celular: a faixa de baixo é da Bô, do balão e dos avisos — o bolo nunca fica atrás de nada. O motor tem um
      // "fill" só (altura e largura); para limitar a largura sem encolher o bolo na altura, a margem de cima/baixo
      // é recalculada (pode ficar negativa). No modo rápido a faixa é mais baixa (só os avisos, sem a Bô).
      const h = el.canvas.clientHeight || 300;
      const w = el.canvas.clientWidth || 360;
      const lane = mode === 'atelie' ? 78 : 66;
      const top = ((ui.gameOn ? 56 : 6) + hdr) / h; // com uma encomenda do jogo, a comanda ocupa o alto do palco
      const bottom = lane / h;
      const fx = Math.max(0.5, 1 - 128 / w); // a coluna de ferramentas (44 + 12 + 8) de um lado; o mesmo do outro, por simetria
      const sum = 1 - ((1 - top - bottom) * 0.97) / fx;
      return { top: ((sum - (bottom - top)) / 2) * h, bottom: ((sum + (bottom - top)) / 2) * h, fill: fx };
    };

    /**
     * O bolo que aparece na tela (3D ou desenho 2D): o cobrável — sem o que não coube, com a quantidade que ficou.
     * Assim o que a pessoa vê é sempre o que está sendo somado e o que será feito.
     */
    const shownCake = () => {
      const cake3d = billOf(config).config;
      // chá revelação: enquanto ninguém tocar em "Revelar", o bolo aparece sem a cor (nem no corte)
      return cake3d.reveal.on && !ui.revealed ? { ...cake3d, reveal: { ...cake3d.reveal, on: false } } : cake3d;
    };

    function makeThumb(size = 360) {
      try {
        const url = cake?.snapshot({ size, quality: 0.8, fill: 0.86 });
        if (url && url.length > 200) return url;
      } catch (err) {
        console.error('[personalizador] falha ao fotografar o bolo', err);
      }
      return thumb2D(shownCake(), size);
    }

    function useFallback() {
      cake = null;
      el.cz.classList.add('is-flat');
      stageReady(); // r5-qa: o desenho 2D aparece na hora
      el.canvas.hidden = true;
      el.tools.hidden = true;
      el.loading.hidden = true;
      el.fallback.hidden = false;
      measuring = false;
      el.measure.hidden = true;
      setMenu(false, { focus: false });
      el.sheet.querySelector('[data-st-views]').hidden = true; // sem 3D não há vistas, giro nem medidas
      syncBackdrop({ instant: true });
      drawCake2D(el.fallback.querySelector('canvas'), shownCake(), { background: false });
    }

    function sceneUpdate() {
      // `by` diz à cena (quando ela souber: scene.atelier) se cabe a animação de preparo ou só uma transição curta
      // (um bolo trocado pelo jogo entra como uma inspiração: transição curta, não a montagem inteira)
      if (cake) cake.setConfig(shownCake(), { by: sceneBy === 'game' ? 'preset' : sceneBy });
      else drawCake2D(el.fallback.querySelector('canvas'), shownCake(), { background: false });
      sceneBy = 'user';
    }
    const sceneUpdateSoon = debounce(() => alive && sceneUpdate(), 130); // digitando: a plaquinha é refeita no máximo a cada ~130 ms

    function setCutaway(on, manual) {
      cutaway = on;
      if (manual) {
        autoCut = false;
        tellTool('cutaway', on);
      }
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
      el.sheet.querySelector('[data-act="rotate"]').setAttribute('aria-checked', String(rotating));
      if (remember) {
        prefs.set('customizerRotate', rotating);
        tellTool('rotate', rotating);
      }
    }

    /* ── fundo do palco: automático (pelas cores do bolo) ou escolhido no botão "Fundo" ── */
    let stageBackdrop = null;
    let autoBackdropId = null; // último fundo automático: só troca se outro for claramente melhor

    function syncBackdrop({ instant = false } = {}) {
      // sem 3D (desenho 2D) o palco fica sempre no fundo claro
      const b = el.cz.classList.contains('is-flat') ? getBackdrop('rosa') : resolveBackdrop(config, autoBackdropId);
      if (!getBackdrop(config.backdrop)) autoBackdropId = b.id;
      if (stageBackdrop?.id === b.id) return;
      stageBackdrop = b;
      el.cz.dataset.tone = b.tone;
      // a cor do véu do cabeçalho: o tom mais claro do fundo (fundos claros) ou o mais escuro (fundos escuros)
      el.cz.style.setProperty('--st-wall', b.tone === 'dark' ? b.c[3] : b.c[0]);
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
      if (menuOpen) renderBgBar();
    }

    function renderBgBar() {
      const cur = getBackdrop(config.backdrop) ? config.backdrop : BACKDROP_AUTO;
      const used = stageBackdrop || getBackdrop('rosa');
      el.bgbar.innerHTML = String(html`
        <h3 class="st-group__title"><span>Fundo do palco</span><small>${cur === BACKDROP_AUTO ? `Automático · ${used.name}` : used.name}</small></h3>
        <div class="cz-bgbar__row" role="radiogroup" aria-label="Fundo do palco">
          <button type="button" class="cz-bgsw cz-bgsw--auto ${cur === BACKDROP_AUTO ? 'is-on' : ''}" role="radio" aria-checked="${cur === BACKDROP_AUTO ? 'true' : 'false'}" data-act="backdrop" data-value="${BACKDROP_AUTO}" aria-label="Automático: o fundo acompanha as cores do bolo" title="Automático"><b>A</b></button>
          ${BACKDROPS.map(
            (b) => html`<button type="button" class="cz-bgsw ${cur === b.id ? 'is-on' : ''}" role="radio" aria-checked="${cur === b.id ? 'true' : 'false'}" data-act="backdrop" data-value="${b.id}" aria-label="${b.name}" title="${b.name}" style="--sw:${b.c[1]};--sw2:${b.c[3]}"></button>`,
          )}
        </div>
        ${ui.sceneLive && mode === 'atelie'
          ? html`<h3 class="st-group__title at-scenes__name"><span>Cenário em volta do bolo</span></h3>
              <div class="at-scenes" role="group" aria-label="Cenário em volta do bolo">
                ${Object.entries(SCENE_NAMES).map(([id, name]) => html`<button type="button" class="cz-chip ${sceneChoice() === id ? 'is-on' : ''}" aria-pressed="${sceneChoice() === id ? 'true' : 'false'}" data-act="scene" data-value="${id}">${name}</button>`)}
              </div>`
          : ''}
      `);
    }
    // r5-tela: o cenário em volta do bolo (a cozinha da frente Cena). "Automático" = bancada nas etapas, vitrine no resumo.
    const SCENE_NAMES = { auto: 'Automático', bancada: 'Bancada', vitrine: 'Vitrine', festa: 'Festa' };
    const sceneChoice = () => (Object.hasOwn(SCENE_NAMES, prefs.get('atelierScene')) ? prefs.get('atelierScene') : 'auto');

    /* ── r6-tela: a folha "Ateliê" — tudo o que é secundário no palco (jogo, som, modo, vistas, giro, medidas,
       fundo e cenário) mora aqui, por cima do painel de opções: o bolo continua inteiro à vista enquanto se ajusta ── */
    let menuOpen = false;
    let menuInert = [];
    function syncMenu() {
      el.sheet.querySelector('[data-act="measure"]').setAttribute('aria-checked', String(measuring));
      el.sheet.querySelector('[data-act="rotate"]').setAttribute('aria-checked', String(rotating));
    }
    function setMenu(open, { focus = true } = {}) {
      open = Boolean(open);
      if (open === menuOpen) return;
      menuOpen = open;
      const btn = el.tools.querySelector('[data-act="stagemenu"]');
      btn.setAttribute('aria-expanded', String(open));
      el.cz.classList.toggle('has-menu', open);
      if (open) {
        if (ui.armed) disarm();
        renderBgBar();
        renderViewBar();
        syncMenu();
        el.sheet.hidden = false;
        void el.sheet.offsetWidth;
        el.sheet.classList.add('is-open');
        // o que ficou por baixo não recebe foco nem toque
        menuInert = [el.steps, el.body, el.foot].filter((n) => !n.inert);
        menuInert.forEach((n) => (n.inert = true));
        el.sheet.querySelector('.st-sheet__body').scrollTop = 0;
        if (focus) el.sheet.focus({ preventScroll: true });
        el.live.textContent = 'Ateliê: som, jogo, vistas e fundo do palco. Esc fecha.';
      } else {
        const had = el.sheet.contains(document.activeElement);
        el.sheet.classList.remove('is-open');
        menuInert.forEach((n) => (n.inert = false));
        menuInert = [];
        later(() => !menuOpen && (el.sheet.hidden = true), reduceMotion ? 0 : 200);
        if (focus && had) btn.focus({ preventScroll: true });
      }
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

    async function startScene() {
      let createCakeScene = null;
      try {
        ({ createCakeScene } = await engineLoad);
      } catch (err) {
        console.warn('[personalizador] o motor 3D não chegou, usando desenho 2D:', err?.message || err);
      }
      if (!alive) return;
      if (!createCakeScene) return void useFallback();
      try {
        Object.assign(sceneLink.to, {
          insets: stageInsets,
          onInteract: () => {
            hideHint();
            atelier?.interact();
          },
          onFrame: () => {
            if (firstFrame) firstFrame(); // r5-qa
            if (measuring) drawMeasure();
            frameSubs.forEach((fn) => fn());
          },
          onContextLost: () => (el.lost.hidden = false),
          onContextRestored: () => {
            el.lost.hidden = true;
            cake?.setConfig(shownCake(), { instant: true });
          },
        });
        cake = createCakeScene(el.canvas, sceneLink.options);
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
          cake.setConfig(shownCake(), { staged: true });
          cake.setAutoRotate(rotating);
          cake.setPaused(Boolean(document.querySelector('.overlay')));
          if (AUTO_CUT_STEPS.has(STEPS[step].id) && autoCut) later(() => alive && autoCut && setCutaway(true), 900);
        } catch (err) {
          console.error('[personalizador] falha ao montar a cena 3D', err);
          cake?.dispose();
          useFallback();
        }
        // r5-qa: "pronto" = o primeiro quadro com o bolo já foi desenhado (o motor avisa por onFrame). Com um diálogo
        // por cima ou a aba escondida o motor não desenha: aí vale já. E um limite de segurança: o aviso nunca fica preso.
        if (!cake || document.hidden || document.querySelector('.overlay')) stageReady();
        else {
          firstFrame = stageReady;
          later(stageReady, 6000);
        }
        sceneShown.then(() => {
          if (!alive) return;
          // a dica de girar: no modo Ateliê ela faz parte das três dicas da primeira visita (js/atelier/ui/)
          if (cake && !prefs.get('customizerHintSeen') && mode !== 'atelie') later(showHint, 1200);
          // com tudo parado, adianta o que a pessoa ainda pode escolher (o primeiro toque em cada opção não engasga)
          later(() => alive && cake?.warmUp(), 900);
        });
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

    let hintNote = null;
    /** "Arraste para girar": uma vez só, na faixa de avisos; some ao primeiro giro. */
    function showHint() {
      if (!alive || hintNote || prefs.get('customizerHintSeen')) return;
      hintNote = notes.push({ kind: 'tip', icon: NOTE_ICON.swipe, text: 'Arraste o bolo para girar', ms: 7000, closable: false, onClose: () => prefs.set('customizerHintSeen', true) });
    }
    function hideHint() {
      hintNote?.close('done');
      hintNote = null;
    }

    const viewFor = (i) => (['acabamento', 'decoracao'].includes(STEPS[i].id) ? 'top' : 'default');
    let manualView = null; // vista escolhida no botão (de frente, de cima): vale até trocar de etapa

    /** Recado curto na faixa de avisos do palco ("Vista: de frente", "Modo rápido"…), também dito ao leitor de tela. */
    function flash(text) {
      notes.flash(text);
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
      // o desenho das medidas é só números; o texto ("rende…") entra escapado
      el.measure.innerHTML = markup + String(html`<p class="cz-measure__info">${icon('users')}<span>Rende ${servesText(config)}</span></p>`);
    }
    /* ── vistas rápidas (padrão, de frente, de cima) e medidas: uma barra que abre no botão "Vistas" ── */
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
        </div>
      `);
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
      if (menuOpen) {
        renderViewBar();
        syncMenu();
      }
      tellTool('measure', measuring);
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

    /** Para onde "Continuar" (dir = 1) ou "Voltar" (dir = -1) levam: { step, q } ou null no começo/fim da fila. */
    function neighbor(dir) {
      const stage = STEPS[step].id;
      if (stage !== 'resumo') {
        const list = questionsOf(stage, config);
        let i = list.indexOf(currentQuestion(stage, config, ui)) + dir;
        while (list[i]?.skip?.(config)) i += dir;
        if (list[i]) return { step, q: list[i].id };
      }
      let to = step + dir;
      // bolo de uma camada (ou vulcão) não leva recheio: a etapa fica fora do caminho
      if (STEPS[to]?.id === 'recheio' && !config.fillings.length) to += dir;
      if (to < 0 || to >= STEPS.length) return null;
      const list = questionsOf(STEPS[to].id, config).filter((x) => !x.skip?.(config));
      return { step: to, q: (dir > 0 ? list[0] : list[list.length - 1])?.id || '' };
    }

    let footKey = '';
    function renderFoot() {
      const last = step === STEPS.length - 1;
      const starting = Boolean(ui.start) && step === 0;
      const q = last ? null : currentQuestion(STEPS[step].id, config, ui);
      const next = last ? null : neighbor(1);
      const label = starting ? (ui.start === 'galeria' && ui.galleryFrom === 'q' ? 'Voltar sem trocar' : 'Começar do zero') : next && STEPS[next.step].id === 'resumo' ? 'Ver resumo' : q?.empty?.(config) ? 'Pular' : 'Continuar';
      const canBack = !starting && !last && Boolean(neighbor(-1));
      const key = [step, last, starting, label, canBack, editLineId, ui.linked].join('|');
      if (key === footKey && el.foot.firstChild) return;
      footKey = key;
      // no resumo, o botão principal leva o valor dentro ("Adicionar · R$ 149,90"); o total ao lado sai
      el.foot.toggleAttribute('data-last', last);
      const addLabel = editLineId ? 'Salvar alterações' : ui.linked ? 'Pedir este bolo' : 'Adicionar';
      el.foot.innerHTML = String(html`
        ${canBack || last ? html`<button type="button" class="cz-prev" data-act="prev" aria-label="Voltar à pergunta anterior" ${last ? raw('data-last') : ''}>${icon('arrow-left')}<span>Voltar</span></button>` : ''}
        <button type="button" class="cz-total" data-act="breakdown" aria-label="Ver detalhes do preço">
          <small>Total ${icon('chevron-up')}</small><strong data-cz-price>${money(shownPrice ?? priceOf(billOf(config).config))}</strong>
        </button>
        ${last
          ? html`<button type="button" class="btn btn--price cz-next" data-act="add" aria-label="${editLineId ? 'Salvar alterações' : ui.linked ? 'Pedir este bolo: adicionar ao carrinho' : 'Adicionar ao carrinho'}">
              <span class="btn__label">${icon(editLineId ? 'check' : 'bag')} ${addLabel}</span>
              <span class="btn__price" data-cz-price>${money(shownPrice ?? priceOf(billOf(config).config))}</span>
            </button>`
          : html`<button type="button" class="btn cz-next" data-act="next">${label} ${icon('arrow-right')}</button>`}
      `);
    }

    let metaMarkup = '';
    function renderMeta() {
      const markup = String(html`<span>${icon('users')} ${servesText(config)}</span><span>${icon('calendar')} Receba a partir de ${firstDate(billOf(config).config)}</span>`);
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
      const target = priceOf(billOf(config).config); // o que não coube no bolo não entra na conta
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
      // o que acabou de ser anunciado (ex.: "peça colocada") não é atropelado pelo total: os dois vão juntos
      el.live.textContent = performance.now() - said.at < 700 ? `${said.text} Total: ${money(target)}` : `Total: ${money(target)}`;
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
      tellChanges();
      renderMeta();
      syncBackdrop();
      if (p.body) {
        renderBody({ still: true });
        renderSteps();
        renderFoot();
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

    /** O botão "Revelar" só existe para o bolo de chá revelação. */
    function syncReveal() {
      const btn = el.tools.querySelector('[data-act="reveal"]');
      const on = Boolean(config.reveal?.on) && Boolean(cake);
      if (!on) ui.revealed = false;
      btn.hidden = !on;
      el.tools.classList.toggle('has-reveal', on);
      btn.setAttribute('aria-pressed', String(ui.revealed));
      const label = ui.revealed ? 'Esconder a cor' : 'Revelar a cor';
      btn.setAttribute('aria-label', label);
      btn.title = label;
      btn.querySelector('span').textContent = ui.revealed ? 'Esconder' : 'Revelar';
      // a mesma ferramenta como linha da folha "Ateliê" (aparece lá quando não cabe na coluna do palco)
      toolRow.reveal.setAttribute('aria-checked', String(ui.revealed));
      fitTools();
    }

    /* ── r6-tela: a coluna de ferramentas é UMA coluna, sempre. Ela leva até cinco botões (ver por dentro, revelar,
       velas, jogo, "…"). Em palco baixo (celular pequeno) nem todos cabem acima da faixa da Bô: o que sobra vira
       linha da folha "Ateliê", nesta ordem — velas, revelar, jogo. "Ver por dentro" e "…" ficam sempre. ── */
    const toolBtn = { reveal: el.tools.querySelector('[data-act="reveal"]'), game: el.tools.querySelector('[data-act="game"]') };
    const toolRow = { reveal: el.sheet.querySelector('[data-st-row="reveal"]'), tool: el.sheet.querySelector('[data-st-row="tool"]') };
    const toolHome = el.sheet.querySelector('[data-st-tool-home]');
    function fitTools() {
      if (!alive) return;
      const want = { tool: el.toolSlot.childElementCount > 0, reveal: !toolBtn.reveal.hidden, game: !toolBtn.game.hidden && mode === 'atelie' };
      const lap = parseFloat(getComputedStyle(el.cz).getPropertyValue('--cz-lap')) || 0;
      // o mesmo limite do CSS (.cz-tools: max-height): do alto da coluna até 68 px acima da borda do painel
      const room = el.stage.clientHeight ? Math.max(2, Math.floor((el.stage.clientHeight - el.tools.offsetTop - lap - 68 + 8) / 52)) : 9;
      let n = 2 + want.tool + want.reveal + want.game;
      const out = [];
      for (const k of ['tool', 'reveal', 'game']) {
        if (n <= room || !want[k]) continue;
        out.push(k);
        n -= 1;
      }
      const list = out.join(' ');
      if ((el.cz.dataset.collapsed || '') !== list) el.cz.dataset.collapsed = list;
      const home = out.includes('tool') ? toolHome : el.tools;
      if (el.toolSlot.parentNode !== home) {
        if (home === el.tools) el.tools.insertBefore(el.toolSlot, toolBtn.game);
        else home.append(el.toolSlot);
      }
      toolRow.tool.hidden = !out.includes('tool');
      toolRow.reveal.hidden = !out.includes('reveal');
    }
    const toolsWatch = new MutationObserver(fitTools);
    toolsWatch.observe(el.tools, { attributes: true, attributeFilter: ['hidden'], subtree: true });
    toolsWatch.observe(el.toolSlot, { childList: true });
    const stageWatch = typeof ResizeObserver === 'function' ? new ResizeObserver(fitTools) : null;
    stageWatch?.observe(el.stage);

    function commit({ rerender = true, scene = 'now', merge = '' } = {}) {
      const wantScript = config.decor?.messageMode === 'bico';
      config = normalizeConfig(config);
      // regras de confeiteiro: o que não se faz de verdade é corrigido aqui, com a explicação num aviso
      const ruled = enforceRules(config, JSON.parse(hist.cur));
      if (ruled.fixed.length) {
        config = ruled.config;
        syncModes();
        rerender = true;
        scene = 'now';
        toast(ruled.fixed.map((r) => r.text).join(' '), { duration: 7000 });
        el.live.textContent = ruled.fixed.map((r) => r.text).join(' ');
        // a Bô explica a correção com a fala da regra (ela ouve o evento opcional 'rule')
        // r5-qa: o aviso sai DEPOIS das mudanças desta escolha (que vão ao barramento no quadro seguinte). Saindo antes,
        // a rajada de mudanças que a própria correção causa atropelava a fala e a Bô ficava calada sobre a correção.
        const fixedNow = ruled.fixed.map((r) => ({ code: r.code, step: r.step, text: r.text }));
        later(() => alive && bus.emit('rule', { fixed: fixedNow }), 160);
      }
      syncReveal();
      // a escrita no topo deixou de caber (bolo de 3 andares, topo pequeno para o texto): a mensagem vai na plaquinha
      const bumped = wantScript && config.decor.messageMode !== 'bico';
      const fits = scriptRoom(config).ok;
      const fitChanged = fits !== ui.scriptFits;
      ui.scriptFits = fits;
      record(merge);
      if (measuring) measureMarkup = '';
      if (ui.savedId && ui.savedKey !== configKey()) ui.savedId = null; // mudou depois de salvar: vira um bolo novo
      if (!pending) pending = { body: false, scene: 'none' };
      if (rerender || bumped || fitChanged) pending.body = true;
      // as decorações foram reorganizadas para caber: avisa uma vez (o painel explica o quê)
      const adapted = notesOf(billOf(config).config).adapted;
      if (adapted && !ui.decorAdapted) toast('Reorganizamos as decorações para caber no bolo.');
      ui.decorAdapted = adapted;
      if (bumped) {
        pending.scene = 'now';
        if (config.decor.message) {
          toast(scriptRoom(config).why === 'alto' ? 'Em bolo de 3 andares a mensagem vai na plaquinha.' : 'Essa mensagem não cabe escrita no topo: ela foi para a plaquinha.');
          if (root.querySelector('[data-field="message"]:focus')) cake?.focusPlaque(true);
        }
      }
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
      // no modo Ateliê a festa (luz, velas, confete) fica para o botão "Revelar meu bolo"
      if (!ui.celebrated && !editLineId && mode !== 'atelie') {
        ui.celebrated = true;
        later(() => alive && STEPS[step]?.id === 'resumo' && confetti({ count: cake.tier === 'mobile' ? 44 : 80 }), 500);
      }
    }

    /** Diz ao barramento qual pergunta está em cartaz (evento novo da rodada 7: 'question'). */
    function tellQuestion() {
      const stage = STEPS[step]?.id;
      if (!stage || stage === 'resumo' || ui.start) return;
      const list = questionsOf(stage, config);
      const q = currentQuestion(stage, config, ui);
      if (!q) return;
      seenAsk.add(`${stage}:${q.id}`);
      bus.emit('question', { step: stage, id: q.id, index: list.indexOf(q), total: list.length, config: publicConfig(config) });
    }

    /** Abre outra pergunta da MESMA etapa (faixa de perguntas, "Continuar", "Voltar"). */
    function ask(id, { focus = true, dir = 1 } = {}) {
      const stage = STEPS[step]?.id;
      const q = questionsOf(stage, config).find((x) => x.id === id);
      if (!q) return;
      if (ui.armed) disarm();
      ui.q = q.id;
      ui.why = null;
      ui.renaming = false;
      if (ui.from?.kind === 'draft') ui.from = null;
      el.cz.dataset.dir = dir > 0 ? 'fwd' : 'back';
      el.cz.dataset.ask = q.id;
      renderBody();
      renderFoot();
      if (focus) el.body.focus({ preventScroll: true });
      saveDraft();
      tellQuestion();
    }

    function goto(i, { focus = true, q = '' } = {}) {
      const next = Math.max(0, Math.min(STEPS.length - 1, i));
      if (next === step) {
        // a mesma etapa: só troca a pergunta (ficha da etapa atual = volta à primeira pergunta dela)
        if (ui.start && next === 0) return;
        const first = questionsOf(STEPS[next].id, config)[0]?.id || '';
        if (STEPS[next].id !== 'resumo' && (q || first) !== currentQuestion(STEPS[next].id, config, ui)?.id) ask(q || first, { focus, dir: -1 });
        return;
      }
      const prevStep = STEPS[step]?.id || null;
      // a bancada "anda": o painel entra pelo lado para onde a pessoa foi (só visual; css/atelier.css)
      el.cz.dataset.dir = next > step ? 'fwd' : 'back';
      if (mode === 'atelie' && !reduceMotion && step >= 0) el.canvas.animate?.([{ transform: `translateX(${next > step ? 16 : -16}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
      if (ui.armed) disarm();
      step = next;
      visited.add(step);
      ui.q = q;
      ui.why = null;
      if (next > 0) ui.start = false; // saiu do começo por uma ficha de etapa: o bolo em branco já é o ponto de partida
      if (next > 0 || ui.from?.kind === 'draft') ui.from = null;
      ui.renaming = false;
      setMenu(false, { focus: false });
      if (measuring) setMeasuring(false);
      manualView = null;
      const id = STEPS[step].id;
      el.cz.dataset.step = id;
      el.cz.dataset.ask = currentQuestion(id, config, ui)?.id || '';
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
      bus.emit('step', { id, index: step, prev: prevStep, config: publicConfig(config) });
      atelier?.step(id, prevStep);
      tellQuestion();
    }

    /**
     * Troca o bolo inteiro (inspiração, surpresa, recomeço). Com `undo`, o aviso leva um "Desfazer"
     * que devolve o bolo anterior.
     */
    function replaceConfig(next, { keepSize = false, message = '', undo = false, action = null, own = null } = {}) {
      const before = undo ? { config: clone(config), savedId: ui.savedId, savedKey: ui.savedKey, revealSet: ui.revealSet, revealOffer: ui.revealOffer } : null;
      ui.revealOffer = false; // r5-qa: o aviso "chá revelação desligado" só vale para o bolo da inspiração que o ofereceu
      const size = config.size;
      const stage = config.backdrop;
      config = normalizeConfig(next);
      ui.keep = null;
      ui.revealSet = Boolean(config.reveal?.on); // um bolo que chega pronto com chá revelação já traz a cor
      if (keepSize) config.size = size;
      if (!getBackdrop(next?.backdrop)) config.backdrop = stage; // inspiração ou surpresa não mexem no fundo escolhido
      ui.savedId = null;
      syncModes();
      // um bolo que chega pronto (inspiração, surpresa, tema inteiro) traz a cor e o bico dele: deixam de ser "da pessoa"
      ui.own = own || { color: false, piping: false };
      ui.why = null;
      commit();
      renderFoot();
      if (!message) return;
      toast(message, {
        type: 'success',
        duration: before || action ? 7000 : 3200,
        action: action
          ? action
          : before
          ? {
              label: 'Desfazer',
              onClick: () => {
                if (!alive) return;
                config = normalizeConfig(before.config);
                mark('undo');
                ui.savedId = before.savedId;
                ui.savedKey = before.savedKey;
                syncModes();
                // r5-qa: o bolo de antes volta com o chá revelação como estava (cor já escolhida continua escolhida)
                ui.revealSet = Boolean(config.reveal?.on) && before.revealSet;
                ui.revealOffer = before.revealOffer;
                commit();
                renderFoot();
              },
            }
          : undefined,
      });
    }

    /* ── ações finais ── */
    /**
     * Antes de gravar (carrinho, favoritos, bolo em edição): o bolo passa a ser o que cabe — sai o que não coube
     * e a quantidade vira a que ficou —, para o preço, o resumo, a foto e o pedido baterem com o que será feito.
     * Devolve o aviso curto para mostrar à pessoa ('' quando nada mudou). Dá para desfazer.
     */
    function settleCake() {
      const bill = billOf(config);
      if (!bill.changed) return '';
      config = clone(bill.config);
      syncModes();
      commit();
      return billNotice(bill);
    }

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
      // chá revelação ligado sem a cor escolhida: o pedido não pode sair com uma cor que ninguém escolheu
      if (config.reveal?.on && !ui.revealSet) {
        toast('Falta escolher a cor do chá revelação.');
        pickRevealColor();
        return;
      }
      const note = settleCake();
      const p = cakePayload();
      const extra = { serves: servesOf(config), prepHours: prepHoursOf(config) };
      if (editLineId) {
        // editando um bolo do carrinho: atualiza a mesma linha e volta para lá
        const updated = cart.replaceCustom(editLineId, { ...p, ...extra });
        if (!updated) cart.addCustom({ ...p, ...extra });
        bus.emit('cart', { config: publicConfig(config), price: p.price, editing: true });
        navigate('/carrinho');
        const done = updated ? 'Bolo atualizado no carrinho' : 'Seu bolo foi para o carrinho';
        toast(note ? `${done}. ${note}` : done, note ? { type: 'success', duration: 6000 } : { type: 'success' });
        return;
      }
      cart.addCustom({ ...p, ...extra });
      bus.emit('cart', { config: publicConfig(config), price: p.price, editing: false });
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
        </div>
        ${note ? html`<p class="cz-note cz-note--warn" data-cz-settled>${note}</p>` : ''}`,
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
        const note = settleCake();
        const item = savedCakes.add({ ...cakePayload(), serves: servesOf(config), prepHours: prepHoursOf(config) });
        ui.savedId = item.id;
        ui.savedKey = configKey();
        toast(note ? `Bolo salvo nos seus favoritos. ${note}` : 'Bolo salvo nos seus favoritos', { type: 'success', action: { label: 'Ver', href: '#/favoritos' }, ...(note ? { duration: 6000 } : {}) });
      }
      tellTool('save', Boolean(ui.savedId));
      if (STEPS[step].id === 'resumo') renderBody({ still: true });
    }

    /**
     * Cartão do bolo (foto + nome + "feito por…"): js/atelier/ui/card.js, buscado só quando a pessoa pede.
     * directDownload = baixa a foto sem abrir o cartão.
     */
    async function shareCake(directDownload) {
      syncNow();
      let card;
      try {
        card = await import('../atelier/ui/card.js');
      } catch (err) {
        console.error('[personalizador] cartão do bolo', err);
        toast('Não deu para preparar a foto agora. Tente de novo em instantes.');
        return;
      }
      if (!alive) return;
      const info = {
        name: displayName(config),
        serves: servesText(config),
        backdrop: cake ? resolveBackdrop(config) : getBackdrop('rosa'),
        shot: ({ width, height, fill = 0.7 }) => {
          try {
            // no modo Ateliê, com a cena carregada, a foto do cartão sai com o cenário em volta do bolo
            return cake?.snapshotCanvas({ width, height, scale: 1.5, fill, scene: ui.sceneLive && mode === 'atelie' }) || null;
          } catch (err) {
            console.error('[personalizador] falha ao gerar a foto', err);
            return null;
          }
        },
        flat: (canvas) => drawCake2D(canvas, shownCake()),
        link: cakeLink(),
        maker: String(prefs.get('atelierMaker', '') || ''),
        setMaker: (name) => prefs.set('atelierMaker', name),
        tell: (id, value) => (id === 'photo' ? bus.emit('photo', { kind: value }) : tellTool(id, value)),
        video: ui.canVideo ? () => actions.video() : null,
      };
      tellTool('photo', directDownload ? 'download' : 'share');
      if (directDownload) {
        tellTool('download');
        card.downloadCanvas(await card.drawCard(info));
        bus.emit('photo', { kind: 'foto' });
        toast('Foto do bolo baixada', { type: 'success' });
        return;
      }
      await card.openCard(info);
    }

    /**
     * r7-criar — "Mostrar para um adulto": o bolo com nome, preço, QR, link e mensagem pronta (js/atelier/ui/card.js →
     * openShow). Quem abrir o link cai neste mesmo bolo, no resumo, com "Pedir este bolo". O bolo fica guardado no
     * aparelho (rascunho + favoritos) para continuar depois. Nada é enviado sozinho: cada saída é um toque da pessoa.
     */
    let shownSavedId = null; // o favorito criado por "Mostrar para um adulto" (um só por bolo: o novo troca o anterior)
    async function showAdult() {
      // chá revelação ligado sem a cor escolhida: o adulto receberia um bolo que não dá para pedir
      if (config.reveal?.on && !ui.revealSet) {
        toast('Falta escolher a cor do chá revelação.');
        pickRevealColor();
        return;
      }
      settleCake(); // o que não coube sai antes: o link, o preço e a foto mostram o bolo como ele será feito
      syncNow();
      let card;
      try {
        card = await import('../atelier/ui/card.js');
      } catch (err) {
        console.error('[personalizador] mostrar para um adulto', err);
        toast('Não deu para abrir agora. Tente de novo em instantes.');
        return;
      }
      if (!alive) return;
      card.openShow({
        name: displayName(config),
        named: Boolean(config.name?.trim()),
        autoName: autoName(config),
        price: priceOf(config),
        serves: `Dá ${servesText(config)}`,
        thumb: () => makeThumb(360),
        link: cakeLink(),
        /** A criança batiza o bolo: o nome vai para o bolo (e, com ele, para o link e para o resumo). */
        setName(name) {
          config.name = cleanName(name).trim();
          commit({ rerender: STEPS[step]?.id === 'resumo', scene: 'none', merge: 'name' });
          return cakeLink();
        },
        keep() {
          storeDraft();
          if (ui.savedId && ui.savedKey === configKey()) return;
          if (shownSavedId) savedCakes.remove(shownSavedId);
          const item = savedCakes.add({ ...cakePayload(), serves: servesOf(config), prepHours: prepHoursOf(config) });
          shownSavedId = item.id;
          ui.savedId = item.id;
          ui.savedKey = configKey();
          if (STEPS[step]?.id === 'resumo') renderBody({ still: true });
        },
        order: () => addToCart(),
        tell: (id, value) => tellTool(id, value),
      });
    }

    async function restart() {
      const ok = await confirmDialog({
        title: 'Recomeçar do zero?',
        message: 'O bolo volta a ficar em branco. Se mudar de ideia, o botão de desfazer traz este bolo de volta.',
        confirmLabel: 'Recomeçar',
        cancelLabel: 'Continuar editando',
      });
      if (!ok || !alive) return;
      const stage = config.backdrop;
      config = blankConfig();
      config.backdrop = stage;
      mark('restart');
      ui.savedId = null;
      ui.moreDrip = false;
      ui.start = 'ask';
      ui.from = null;
      ui.linked = false;
      ui.all = {};
      ui.search = {};
      ui.own = { color: false, piping: false };
      syncModes();
      visited.clear();
      visited.add(0);
      seenAsk.clear();
      autoCut = true;
      if (cutaway) setCutaway(false, false);
      step = -1;
      commit({ rerender: false });
      goto(0);
      cake?.resetView();
      toast('Bolo em branco, pronto para começar');
    }

    /** "Como será feito": a ficha de produção do bolo, em linguagem de confeitaria (sem a cor do chá revelação). */
    async function showFicha() {
      tellTool('ficha');
      const { fichaDeProducao, fichaEmTexto } = await import('../customizer/ficha.js');
      if (!alive) return;
      const lines = fichaEmTexto(fichaDeProducao(billOf(config).config, { secret: false }));
      const dlg = openDialog({
        title: 'Como o seu bolo será feito',
        body: html`<div class="cz-ficha">
          <p class="cz-ficha__lead">É esta ficha que vai para a cozinha junto com o pedido.</p>
          ${lines.slice(1).map((t) => html`<p class="${/^\s{2,}/.test(t) ? 'cz-ficha__sub' : ''}">${t.trim()}</p>`)}
        </div>`,
        footer: html`<button type="button" class="btn btn--secondary cz-fit" data-do="copy">${icon('copy')} Copiar</button><button type="button" class="btn cz-fit" data-dialog-close>Fechar</button>`,
      });
      dlg.el.addEventListener('click', async (ev) => {
        if (!ev.target.closest('[data-do="copy"]')) return;
        await copyText(lines.join('\n'));
        toast('Ficha copiada', { type: 'success' });
      });
    }

    /** Copia o link que abre exatamente este bolo (sem a cor do chá revelação). */
    const cakeLink = () => `${location.origin}${location.pathname}#/monte-seu-bolo?c=${encodeConfig(billOf(config).config, { secret: false })}`;
    async function copyLink() {
      const ok = await copyText(cakeLink());
      tellTool('link');
      toast(ok === false ? 'Não deu para copiar o link aqui. Use "Enviar" para mandar a foto.' : 'Link do bolo copiado. Quem abrir vê este mesmo bolo.', { type: ok === false ? 'info' : 'success' });
    }

    /** A cor do chá revelação, escolhida numa janela à parte: depois de fechar, ela não aparece em lugar nenhum. */
    function pickRevealColor({ offer = false } = {}) {
      const dlg = openDialog({
        title: 'A cor do chá revelação',
        body: html`<div class="cz-secretpick">
          ${offer === true ? html`<p><strong>Este bolo é de chá revelação:</strong> o recheio vai tingido e a cor só aparece no corte (+ ${money(REVEAL_PRICE)}).</p>` : ''}
          <p>Só você deve ver esta tela. Depois de escolher, a cor some do painel, do resumo e do pedido: ela vai direto para a confeitaria.</p>
          <div class="cz-secretpick__row">
            ${REVEAL_COLORS.map(
              (r) => html`<button type="button" class="cz-secretpick__btn" data-reveal="${r.id}">
                <i style="--c:${r.hex}"></i><strong>${r.who === 'menina' ? 'É menina' : 'É menino'}</strong><span>Recheio ${r.name.toLowerCase()}</span>
              </button>`,
            )}
          </div>
        </div>`,
        footer: html`<button type="button" class="btn btn--secondary btn--block" data-dialog-close>${offer === true ? 'Agora não (bolo sem a cor)' : 'Fechar sem mudar'}</button>`,
      });
      dlg.el.addEventListener('click', (ev) => {
        const id = ev.target.closest('[data-reveal]')?.dataset.reveal;
        if (!id || !alive) return;
        config.reveal = { on: true, color: id };
        ui.revealSet = true;
        ui.revealed = false;
        dlg.close();
        commit();
        toast('Cor guardada em segredo. No bolo ela só aparece em "Revelar".', { type: 'success', duration: 5000 });
      });
    }

    function showBreakdown() {
      tellTool('breakdown');
      openDialog({
        title: 'Detalhes do preço',
        body: html`<div class="cz-bill">${billLines(config)}</div>
          <p class="cz-trust">${icon('info')}<span>Os valores acompanham o tamanho ${sizeOf(config).label}${(config.tiers || 1) > 1 ? ', os andares' : ''} e a altura do bolo. Base, velas, topos e mensagem têm preço fixo.</span></p>`,
        footer: html`<button type="button" class="btn btn--block" data-dialog-close>Entendi</button>`,
      });
    }

    /* ── escolhas ── */
    const setters = {
      shape: (v) => {
        // virar vulcão guarda o bolo de camadas; sair do vulcão devolve as camadas, os recheios e a cobertura de antes
        if (v === 'vulcao' && config.shape !== 'vulcao') ui.keep = clone({ layers: config.layers, fillings: config.fillings, fillAdds: config.fillAdds, tiers: config.tiers, tierCover: config.tierCover, covering: config.covering, drip: config.drip, reveal: config.reveal });
        else if (config.shape === 'vulcao' && v !== 'vulcao' && ui.keep) {
          Object.assign(config, ui.keep);
          ui.keep = null;
        }
        config.shape = v;
      },
      size: (v) => {
        // o bentô vai na caixinha (a base dele) e, nela, com 2 camadas; quem quiser muda depois
        if (v === 'bento' && config.size !== 'bento' && config.base === 'boleira') {
          config.base = 'caixa';
          if (config.layers.length > 2) setLayers(2);
        }
        config.size = v;
      },
      tab: (v, key) => (ui.tabs[key] = v),
      // r7-criar: a altura é uma escolha só — 1 (simples, sem recheio), 2, 3 ou 4 camadas de massa
      layers: (v) => setLayers(Math.max(1, Math.min(MAX_LAYERS, Number(v) || 1))),
      dripOn: (v) => (config.drip.on = v === 'sim'),
      // velas: '' tira; um estilo põe as velas no bolo (se ainda não estiverem) já com ele
      candle: (v) => {
        const at = config.decor.items.indexOf('velas');
        if (!v) {
          if (at >= 0) config.decor.items.splice(at, 1);
          return;
        }
        if (at < 0) {
          if (config.decor.items.length >= MAX_DECORS) return void toast(`Dá para combinar até ${MAX_DECORS} enfeites. Tire um para pôr as velas.`);
          config.decor.items.push('velas');
        }
        config.decor.candleStyle = v;
      },
      soak: (v) => (config.soak = v),
      fillAdd: (v) => {
        const adds = config.fillings.map((_, i) => config.fillAdds?.[i] || '');
        if (ui.fillMode === 'each' && adds.length > 1) adds[Math.min(ui.gap, adds.length - 1)] = v;
        else adds.fill(v);
        config.fillAdds = adds;
      },
      trim: (v) => {
        coverRef().trim = v;
        coverDone();
      },
      dripAmount: (v) => (config.drip.amount = v),
      dripLength: (v) => (config.drip.length = v),
      occasion: (v) => (ui.occasion = v),
      tiers: (v) => {
        config.tiers = Number(v) || 1;
        if (config.tiers === 1) {
          config.tierCover = null;
          ui.tierMode = 'all';
        }
        ui.tier = config.tiers - 1;
      },
      // a altura é o número de camadas de massa: baixo = 2, padrão = 3, alto = 4
      height: (v) => {
        const h = HEIGHTS.find((x) => x.id === v);
        if (h) setLayers(h.layers);
      },
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
        ui.colorChosen = cov.color !== bareColor(cov.type);
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
        if (!ui.colorChosen) cov.color = bareColor(v);
        if (!finishAllowed(v, cov.style)) cov.style = 'liso';
        coverDone();
      },
      coveringColor: (v) => {
        coverRef().color = v;
        ui.colorChosen = true;
        ui.own.color = true;
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
      pipingStyle: (v) => {
        config.piping.style = v;
        ui.own.piping = v !== 'liso';
      },
      pipingWhere: (v) => (config.piping.where = v),
      pipingColor: (v) => (config.piping.color = v),
      decorHow: (v) => {
        ui.decorHow = v === 'mao' ? 'mao' : 'arranjo';
        ui.decorOpen = null;
        // com o dedo, a lista inteira de peças já fica à mão (é o segundo nível: quem chegou aqui quer escolher)
        if (ui.decorHow === 'mao') ui.all.decor = true;
        tellTool('hand', ui.decorHow === 'mao');
        if (ui.decorHow !== 'mao') disarm();
      },
      decorArr: (v, id) => decorOpt(id, { arr: v }),
      decorQty: (v, id) => decorOpt(id, { qty: v }),
      decorColor: (v, id) => decorOpt(id, { color: v }),
      // r5-decor ↓
      decorKind: (v, id) => decorOpt(id, { kind: v }),
      candlePalette: (v) => (config.decor.candlePalette = v),
      plaque: (v) => (config.decor.plaque = v),
      doodle: (v) => (config.decor.doodle = v === 'nenhum' ? '' : v),
      topperStyle: (v) => (config.decor.topper.style = v),
      topperFinish: (v) => (config.decor.topper.finish = v),
      // r5-decor ↑
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
      } else {
        items.push(id);
      }
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
          tones.innerHTML = String(
            html`${TONES.map(([ts, tv]) => {
              const x = hsvToHex(h, ts, tv);
              return html`<button type="button" style="--c:${x}" data-cp-color="${x}" aria-label="Tom ${x.toUpperCase()}"></button>`;
            })}`,
          );
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

    /** Sai do começo e abre a primeira pergunta (o bolo em branco, uma inspiração ou a surpresa já estão no palco). */
    function begin() {
      ui.start = false;
      ui.q = '';
      el.cz.dataset.dir = 'fwd';
      el.cz.dataset.ask = currentQuestion('formato', config, ui)?.id || '';
      renderSteps();
      renderBody();
      renderFoot();
      el.body.focus({ preventScroll: true });
      saveDraft();
      tellQuestion();
    }

    const actions = {
      next() {
        if (ui.start && step === 0) return void begin(); // "Começar do zero"
        const to = neighbor(1);
        if (!to) return;
        if (to.step === step) ask(to.q, { dir: 1 });
        else goto(to.step, { q: to.q });
      },
      prev() {
        const to = neighbor(-1);
        if (!to) return;
        if (to.step === step) ask(to.q, { dir: -1 });
        else goto(to.step, { q: to.q });
      },
      goto: (v) => goto(STEP_INDEX[v] ?? 0),
      // r7-criar ↓
      ask: (v) => ask(v, { dir: questionsOf(STEPS[step].id, config).findIndex((x) => x.id === v) >= questionsOf(STEPS[step].id, config).indexOf(currentQuestion(STEPS[step].id, config, ui)) ? 1 : -1 }),
      start(v) {
        if (v === 'zero') return void begin();
        if (v === 'galeria') {
          // a galeria abre do começo ou, mais tarde, do link "Trocar por um bolo pronto" (aí "voltar" devolve as perguntas)
          ui.galleryFrom = ui.start ? 'ask' : 'q';
          ui.start = 'galeria';
        } else if (ui.galleryFrom === 'q') return void begin();
        else ui.start = 'ask';
        el.cz.dataset.dir = v === 'galeria' ? 'fwd' : 'back';
        renderBody();
        renderFoot();
        el.body.focus({ preventScroll: true });
      },
      all(v) {
        ui.all[v] = true;
        renderBody({ still: true });
        // o botão que a pessoa tocou saiu da tela: o foco vai para "Ver menos", no alto da lista (não para a busca,
        // que abriria o teclado do celular sem ninguém pedir)
        root.querySelector(`[data-act="all-close"][data-value="${v}"]`)?.focus({ preventScroll: true });
        el.live.textContent = 'Lista inteira aberta.';
      },
      'all-close'(v) {
        ui.all[v] = false;
        ui.search[v] = '';
        ui.tabs[v] = '';
        renderBody({ still: true });
        el.body.scrollTop = 0;
        root.querySelector(`[data-act="all"][data-value="${v}"]`)?.focus({ preventScroll: true });
      },
      /** A opção apagada: "Usar mesmo assim" faz a escolha e a regra ajusta o resto, com o aviso do que mudou. */
      'why-go'() {
        const w = ui.why;
        ui.why = null;
        if (!w || w.fixed) return void renderBody({ still: true });
        const [name, arg] = String(w.set).split('.');
        setters[name]?.(w.value, arg);
        commit();
      },
      'why-close'() {
        ui.why = null;
        renderBody({ still: true });
        el.body.focus({ preventScroll: true });
      },
      /** Conjunto de enfeites de um toque: põe os que faltam; tocar de novo tira. */
      kit(v) {
        const k = KITS.find((x) => x.id === v);
        if (!k) return;
        const items = config.decor.items;
        if (k.items.every((id) => items.includes(id))) config.decor.items = items.filter((id) => !k.items.includes(id));
        else {
          const add = k.items.filter((id) => !items.includes(id) && getDecor(id));
          if (items.length + add.length > MAX_DECORS) return void toast(`Dá para combinar até ${MAX_DECORS} enfeites. Tire um para pôr este conjunto.`);
          items.push(...add);
        }
        ui.decorOpen = null;
        commit();
        el.live.textContent = `Enfeites de ${k.name}: ${k.hint}`;
      },
      'decor-off'(v) {
        const i = config.decor.items.indexOf(v);
        if (i < 0) return;
        config.decor.items.splice(i, 1);
        if (ui.decorOpen === v) ui.decorOpen = null;
        commit();
      },
      'show-adult': () => showAdult(),
      // r7-criar ↑
      breakdown: showBreakdown,
      restart,
      cutaway: () => setCutaway(!cutaway, true),
      rotate: () => setRotating(!rotating, true),
      reset: () => cake?.resetView(),
      undo: () => travel(hist.past, hist.future, 'Última mudança desfeita'),
      redo: () => travel(hist.future, hist.past, 'Mudança refeita'),
      stagemenu() {
        if (!menuOpen) atelier?.closeGame();
        setMenu(!menuOpen);
      },
      'stagemenu-close': () => setMenu(false),
      view(v) {
        if (!cake) return;
        const next = VIEWS.some((x) => x.id === v) ? v : 'default';
        if (measuring && next !== 'front') setMeasuring(false);
        manualView = next === 'default' ? null : next;
        if (cutaway && next !== 'default') setCutaway(false, true);
        cake.setView(manualView || viewFor(step));
        tellTool('view', next);
        if (menuOpen) renderViewBar();
        el.viewbar.querySelector('.is-on')?.focus({ preventScroll: true });
        flash(next === 'default' ? 'Vista padrão' : `Vista: ${VIEWS.find((x) => x.id === next).name.toLowerCase()}`);
      },
      measure() {
        setMeasuring(!measuring);
        flash(measuring ? 'Medidas em centímetros' : 'Medidas escondidas');
      },
      palette(v) {
        const p = COLOR_PALETTES.find((x) => x.id === v);
        if (!p) return;
        config = applyPalette(config, p);
        ui.colorChosen = true;
        ui.own.color = true;
        mark('palette', p.id);
        commit();
        el.live.textContent = `Paleta ${p.name} aplicada ao bolo inteiro`;
      },
      'pick-color': (v, btn) => openColorPicker(v, btn),
      adjust(v) {
        ui.decorOpen = ui.decorOpen === v ? null : v;
        renderBody({ still: true });
      },
      surprise() {
        // o bolo surpresa já nasce só com o que cabe nele (nada "não coube", nenhuma quantidade reduzida)
        mark('surprise');
        const fromStart = Boolean(ui.start) || ui.from?.kind === 'surprise';
        ui.from = { kind: 'surprise', name: '' };
        replaceConfig(billOf(normalizeConfig({ ...randomConfig(config), size: config.size })).config, { keepSize: true, undo: !fromStart, message: fromStart ? '' : 'Bolo surpresa montado. Gostou?' });
        el.live.textContent = `Bolo surpresa: ${summaryOf(config).join('. ')}`;
        if (ui.start) begin(); // do começo: o bolo aparece e a pessoa cai na primeira pergunta, com "Outro" e "Já está bom" à mão
      },
      preset(v) {
        const p = getPreset(v);
        if (!p) return;
        mark('preset', p.id);
        const fromStart = ui.start === 'ask' || (ui.start === 'galeria' && ui.galleryFrom !== 'q');
        const fromAny = Boolean(ui.start);
        ui.from = { kind: 'preset', name: p.name };
        // r5-qa: inspiração pensada para um tamanho (bentô, GG: `sized`) chega no tamanho dela — nome, etiqueta e
        // miniatura dizem bentô/GG, e o bolo, o preço e o carrinho têm de dizer o mesmo. As outras mantêm o tamanho
        // que a pessoa já escolheu.
        replaceConfig(p.config, { keepSize: !p.sized, undo: !fromStart, message: fromStart ? '' : `Inspiração “${p.name}” no bolo. Agora deixe do seu jeito!` });
        if (fromAny) begin();
        // r5-qa: "Chá Revelação" leva direto a escolher a cor em segredo. Nenhuma cor é assumida: sem escolha, o chá
        // fica desligado (recheio sem cor) e o resumo avisa.
        if (p.askReveal && !config.reveal?.on) {
          ui.revealOffer = true;
          pickRevealColor({ offer: true });
        }
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
      'drip-half'() {
        config.drip.half = !config.drip.half;
        commit();
      },
      'drip-metal'() {
        config.drip.metal = !config.drip.metal;
        // a calda metálica começa dourada; ao desligar, uma cor metálica volta para o chocolate
        const metals = METAL_COLORS.map((x) => x.hex);
        if (config.drip.metal && !metals.includes(config.drip.color)) config.drip.color = metals[0];
        else if (!config.drip.metal && metals.includes(config.drip.color)) config.drip.color = '#3a1a08';
        commit();
      },
      'reveal-toggle'() {
        config.reveal = { ...config.reveal, on: !config.reveal.on };
        ui.revealed = false;
        ui.revealSet = false;
        if (!config.reveal.on) ui.revealOffer = false; // r5-qa: desligou de propósito: o resumo não insiste
        commit();
        if (config.reveal.on) pickRevealColor();
      },
      'reveal-color': pickRevealColor,
      reveal() {
        if (!config.reveal?.on || !cake) return;
        ui.revealed = !ui.revealed;
        syncReveal();
        sceneUpdate();
        if (ui.revealed) {
          if (!cutaway) setCutaway(true, true);
          const who = getRevealColor(config.reveal.color)?.who;
          later(() => alive && ui.revealed && flash(who === 'menina' ? 'É menina!' : 'É menino!'), 700);
        }
        tellTool('reveal', ui.revealed);
      },
      fix(v) {
        mark('auto');
        config = applyFix(config, v);
        syncModes();
        commit();
      },
      ficha: showFicha,
      link: copyLink,
      decor(v) {
        // "uma a uma, com o dedo": o toque põe a peça na mão (o lugar é escolhido no bolo)
        if (ui.decorHow === 'mao') return void arm(ui.armed === v ? null : v);
        if (toggleDecor(v)) commit();
      },
      'place-auto': () => atelier?.hands.auto(),
      'place-done': () => disarm(),
      'place-remove': (v) => atelier?.hands.removeOne(v),
      'place-clear': () => atelier?.hands.clear(),
      mode: () => setMode(mode === 'atelie' ? 'rapido' : 'atelie'),
      'reveal-cake': () => atelier?.reveal(),
      video: () => atelier?.video(),
      game() {
        setMenu(false, { focus: false });
        atelier?.game();
      },
      'clear-decor'() {
        ui.decorOpen = null;
        config.decor.items = [];
        config.decor.theme = '';
        commit();
      },
      // Tema pronto: põe os enfeites de uma vez, com "Desfazer". r7-criar: a cor e o bico que a PESSOA escolheu ficam
      // (o tema não passa por cima sem ela pedir); o aviso diz isso e oferece "Usar o tema inteiro".
      theme(v) {
        ui.decorOpen = null;
        if (!v) {
          // "Sem tema": saem os enfeites do tema; a cor e o bico ficam como estão
          if (!config.decor.theme) return;
          const next = clone(config);
          next.decor.theme = '';
          next.decor.items = next.decor.items.filter((id) => id === 'velas');
          next.decor.placed = [];
          replaceConfig(next, { keepSize: true, undo: true, message: 'Tema tirado do bolo.', own: { ...ui.own } });
          return;
        }
        const t = getTheme(v);
        if (!t) return;
        const was = clone(config);
        const own = { ...ui.own };
        const whole = () => billOf(applyTheme(was, v)).config;
        const next = applyTheme(was, v);
        const kept = [];
        if (own.color && t.apply?.cover?.color && t.apply.cover.color !== was.covering.color) {
          next.covering.color = was.covering.color;
          if (Array.isArray(next.tierCover) && Array.isArray(was.tierCover)) next.tierCover.forEach((x, i) => (x.color = was.tierCover[i]?.color || x.color));
          kept.push('a sua cor');
        }
        if (own.piping && t.apply?.piping && t.apply.piping.style !== was.piping.style) {
          next.piping = clone(was.piping);
          kept.push('o seu bico');
        }
        ui.colorChosen = true;
        // o tema já entra só com o que cabe neste bolo (nada "não coube" fica cobrado nem gravado)
        replaceConfig(kept.length ? billOf(normalizeConfig(next)).config : whole(), {
          keepSize: true,
          undo: !kept.length,
          own: kept.length ? own : null,
          message: kept.length ? `Tema “${t.name}” no bolo, com ${kept.join(' e ')}.` : `Tema “${t.name}” no bolo. Mude o que quiser.`,
          action: kept.length
            ? {
                label: 'Usar o tema inteiro',
                onClick: () => {
                  if (!alive) return;
                  mark('preset', t.id);
                  replaceConfig(whole(), { keepSize: true });
                  ui.colorChosen = true;
                },
              }
            : null,
        });
        el.live.textContent = `Tema ${t.name} no bolo: ${t.desc}`;
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
      scene(v) {
        prefs.set('atelierScene', Object.hasOwn(SCENE_NAMES, v) ? v : 'auto');
        atelier?.scene();
        tellTool('scene', sceneChoice());
        renderBgBar();
        el.bgbar.querySelector('.at-scenes .is-on')?.focus({ preventScroll: true });
        el.live.textContent = `Cenário: ${SCENE_NAMES[sceneChoice()]}`;
      },
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

    /** Toque numa opção apagada: em vez de escolher (e corrigir depois), a tela diz o motivo e oferece a saída. */
    function explain(btn) {
      if (btn.getAttribute('aria-disabled') !== 'true') return false;
      ui.why = { name: btn.dataset.name || btn.textContent.trim(), text: btn.dataset.why || 'Essa opção não se faz neste bolo.', plan: btn.dataset.plan || '', set: btn.dataset.set || '', value: btn.dataset.value, fixed: btn.dataset.fixed === '1' || !btn.dataset.set };
      renderBody({ still: true });
      const box = root.querySelector('.cq-why');
      box?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
      el.live.textContent = `${ui.why.name}: não dá neste bolo. ${ui.why.text}`;
      root.querySelector('.cq-why button')?.focus({ preventScroll: true });
      return true;
    }

    on(root, 'click', '[data-set]', (_ev, btn) => {
      // "decorCor.macarons" = escolha "decorCor" da decoração "macarons"
      const [name, arg] = btn.dataset.set.split('.');
      const fn = setters[name];
      if (!fn || btn.disabled) return;
      if (explain(btn)) return;
      ui.why = null;
      fn(btn.dataset.value, arg);
      commit();
    });

    on(root, 'click', '[data-act]', (_ev, btn) => {
      const fn = actions[btn.dataset.act];
      if (!fn || explain(btn)) return;
      fn(btn.dataset.value, btn);
    });

    // r5-decor: busca entre as decorações (filtra enquanto a pessoa digita; o campo não perde o foco)
    const searchSoon = debounce(() => alive && renderBody({ still: true }), 140);
    // os módulos de peças chegam num momento ocioso, um a um (a abertura não espera por eles)
    warmDecorModules(3500);

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
      if (menuOpen) return void setMenu(false); // a folha "Ateliê" fecha e o foco volta ao botão dela
      atelier?.back(); // fecha o que o ateliê tiver aberto (peça na mão, revelação, dicas)
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
      if (input.dataset.field.startsWith('search.')) {
        // busca nas listas grandes: só o painel muda (o bolo fica como está)
        ui.search[input.dataset.field.slice(7)] = input.value.slice(0, 40);
        searchSoon();
        return;
      }
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
      // bill() = o bolo como será cobrado e gravado (sem o que não coube): usado por tools/cz_bill.mjs
      // reveal(true|false) = mostra ou esconde a cor do chá revelação no 3D (o que o botão "Revelar" faz)
      window.__cz = {
        cake: () => cake,
        config: () => config,
        set: (next) => {
          ui.start = false;
          ui.from = null;
          footKey = '';
          replaceConfig(next);
        },
        // goto(5) abre a Decoração na pergunta dos enfeites (é ali que ficam as etiquetas do que está no bolo);
        // goto(i, 'pergunta') abre a etapa numa pergunta; ask('pergunta') troca a pergunta da etapa em cartaz
        goto: (i, q) => {
          ui.start = false;
          footKey = '';
          goto(i, { q: q || (STEPS[i]?.id === 'decoracao' ? 'enfeites' : '') });
        },
        ask: (id) => ask(id),
        question: () => ({ step: STEPS[step]?.id, id: ui.start ? `começo:${ui.start}` : currentQuestion(STEPS[step]?.id, config, ui)?.id || '' }),
        quality: () => cake?.quality() ?? null,
        bill: (other) => billOf(other ? normalizeConfig(other) : config),
        reveal: (on) => {
          ui.revealed = Boolean(on);
          syncReveal();
          if (cake) sceneUpdate();
        },
        rules: () => rulesOf(config).map((r) => ({ level: r.level, code: r.code, step: r.step, text: r.text })),
        link: () => encodeConfig(config),
        // r5-tela: o barramento, o modo e a camada do ateliê (tools/r5t_*.mjs)
        bus,
        mode: () => mode,
        setMode: (m) => setMode(m),
        atelier: () => atelier,
        ui: () => ui,
      };
    }

    /* ── primeira pintura ── */
    el.cz.dataset.step = STEPS[step].id;
    el.cz.dataset.ask = ui.start ? '' : currentQuestion(STEPS[step].id, config, ui)?.id || '';
    renderSteps();
    renderBody();
    renderFoot();
    renderMeta();
    updatePrice();
    setRotating(rotating, false);
    syncReveal();
    syncBackdrop({ instant: true });
    syncModeUi();
    // espera viva: enquanto o 3D chega, a confeitaria "se prepara" (some junto com o aviso)
    const loadText = root.querySelector('[data-cz-loadtext]');
    const WAITS = ['Untando a fôrma…', 'Peneirando a farinha…', 'Batendo a massa…', 'Quase no ponto…'];
    let waitAt = 0;
    const waitTick = () => {
      if (!alive || el.cz.classList.contains('is-ready')) return;
      loadText.textContent = WAITS[waitAt++ % WAITS.length];
      later(waitTick, 1300);
    };
    later(waitTick, 900);
    // a tela aparece primeiro (fundo, opções e o aviso de "preparando"); a cena 3D começa logo em seguida;
    // o ateliê (som, Bô, gestos) só é buscado com a loja parada, depois que o bolo já está na tela
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!alive) return;
        const idle = window.requestIdleCallback ? (fn) => window.requestIdleCallback(fn, { timeout: 2500 }) : (fn) => setTimeout(fn, 300);
        // (o ateliê só entra depois que o motor chegou — ou falhou — e o bolo começou a ser desenhado)
        // r5-qa: "desenhado" de verdade (sceneShown), não só pedido — som, jogo e dicas nunca chegam antes do bolo
        startScene().finally(() => sceneShown.then(() => later(() => idle(() => alive && loadAtelier()), 500)));
      }),
    );

    told.price = priceOf(billOf(config).config);
    bus.emit('open', { config: publicConfig(config), source: SOURCES[origin] || 'novo' });
    tellQuestion();

    // entrada por ?bolo= ou ?base=: depois de aplicar, tira o parâmetro do endereço (recarregar mantém o rascunho).
    // ?linha= fica: recarregar continua editando o bolo do carrinho.
    const q = ctx.query || {};
    if (origin !== 'line' && (q.bolo || q.base || q.linha || q.c)) {
      storeDraft();
      later(() => alive && navigate('/monte-seu-bolo', { replace: true }), 0);
    }

    /* ── r5-tela: o ateliê (js/atelier/ui/index.js) ──
       A tela entrega ao módulo só o que ele precisa (host); ele liga som, vibração, a Bô, os gestos, a revelação e o
       jogo, e devolve os poucos comandos que a tela chama. Se o módulo não chegar (sem rede), a compra segue igual. */
    function syncModeUi() {
      const quick = mode === 'rapido';
      el.cz.dataset.mode = mode;
      // o interruptor "Modo rápido" da folha "Ateliê"
      root.querySelector('[data-at-mode]').setAttribute('aria-checked', String(quick));
    }
    function setMode(next, { quiet = false } = {}) {
      const to = next === 'rapido' ? 'rapido' : 'atelie';
      if (to === mode) return;
      mode = to;
      prefs.set('atelierMode', mode);
      syncModeUi();
      if (mode === 'rapido') hideHint();
      // a faixa reservada para a Bô muda com o modo: o bolo se reenquadra
      cake?.resize();
      cake?.setView(manualView || viewFor(step));
      bus.emit('mode', { mode });
      atelier?.setMode(mode);
      fitTools();
      if (!atelier && mode === 'atelie') loadAtelier();
      if (!quiet) {
        const said = mode === 'rapido' ? 'Modo rápido: sem som, sem animações e sem a Bô. Tudo o que você escolheu continua aqui.' : 'Modo Ateliê: som, animações e a Bô de volta.';
        flash(mode === 'rapido' ? 'Modo rápido' : 'Modo Ateliê');
        el.live.textContent = said;
      }
    }
    function arm(id) {
      ui.armed = id && getDecor(id)?.unit ? id : null;
      tellTool('pick', ui.armed);
      renderBody({ still: true });
      // a peça foi para a mão: o alto do painel diz isso e traz as saídas por botão ("colocar onde couber", "soltar")
      if (ui.armed) el.body.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      if (ui.armed && !atelier) toast('Só um instante: a bancada ainda está chegando.');
      atelier?.hands.arm(ui.armed);
    }
    function disarm() {
      if (!ui.armed) return;
      ui.armed = null;
      tellTool('pick', null);
      atelier?.hands.arm(null);
      if (STEPS[step]?.id === 'decoracao') renderBody({ still: true });
    }
    let atelierLoading = null;
    /** Anúncio curto para o leitor de tela (região aria-live da tela). */
    function say(text) {
      said.at = performance.now();
      said.text = text;
      el.live.textContent = text;
    }
    function loadAtelier() {
      if (atelier || atelierLoading || !alive) return;
      atelierLoading = import('../atelier/ui/index.js')
        .then((m) => {
          if (!alive) return;
          atelier = m.mountAtelier({
            root,
            cz: el.cz,
            stage: el.stage,
            canvas: el.canvas,
            hud: el.hud,
            layer: el.layer,
            fx: el.fx,
            notes,
            toolSlot: el.toolSlot,
            menuButton: el.tools.querySelector('[data-act="stagemenu"]'),
            openMenu: () => setMenu(true),
            openGame: () => actions.game(),
            bus,
            prefs,
            reduceMotion,
            rules: rulesOf,
            source: SOURCES[origin] || 'novo',
            mode: () => mode,
            setMode,
            cake: () => cake,
            config: () => config,
            publicConfig: () => publicConfig(config),
            shown: () => shownCake(),
            step: () => STEPS[step]?.id || 'formato',
            /** r7-criar: a pergunta em cartaz dentro da etapa ('' no começo e no resumo). */
            question: () => (ui.start || STEPS[step]?.id === 'resumo' ? '' : currentQuestion(STEPS[step]?.id, config, ui)?.id || ''),
            price: () => priceOf(billOf(config).config),
            name: () => displayName(config),
            goto: (id) => {
              const to = STEP_INDEX[id] ?? step;
              if (ui.start) {
                // o jogo ou a Bô levaram a pessoa a uma etapa com o "como você quer começar?" em cartaz
                ui.start = false;
                footKey = '';
                if (to === step) {
                  renderBody();
                  renderFoot();
                  tellQuestion();
                  return;
                }
              }
              goto(to);
            },
            flash,
            say,
            toast,
            armed: () => ui.armed,
            disarm,
            cutaway: () => cutaway,
            closeCut: () => cutaway && setCutaway(false, false),
            setView: (name) => cake?.setView(name || manualView || viewFor(step)),
            spinOn: (on) => cake?.setAutoRotate(on ? rotating && !measuring : false),
            onFrame: (fn) => {
              frameSubs.add(fn);
              return () => frameSubs.delete(fn);
            },
            card: () => shareCake(false),
            /** A Bô sugeriu e a pessoa aceitou: { label, patch, step }. */
            applyBo(action, applyPatch) {
              if (action?.patch) {
                config = applyPatch(config, action.patch);
                mark('bo');
                syncModes();
                commit();
                renderFoot();
              }
              if (action?.step && STEP_INDEX[action.step] != null) goto(STEP_INDEX[action.step]);
            },
            /** Peças colocadas à mão: grava a lista nova (o preço e o bolo acompanham). */
            setPlaced(list) {
              config.decor.placed = list;
              commit();
            },
            /** Calda pelo gesto (tocar na borda): liga ou aumenta. */
            setDrip(patch) {
              config.drip = { ...config.drip, ...patch };
              commit();
            },
            /** Troca o bolo inteiro (jogo: encomenda). */
            setConfig(next, opts = {}) {
              if (opts.by) mark(opts.by);
              if (ui.start) {
                // uma encomenda do jogo começou com o "como você quer começar?" em cartaz: as perguntas tomam o lugar
                ui.start = false;
                footKey = '';
              }
              replaceConfig(next, {});
            },
            sceneChoice,
            /** A cena carregou (ou não): a troca de cenário aparece no painel "Fundo" e as peças de lateral ganham etiqueta. */
            sceneLive(on, sideIds = null) {
              ui.sceneLive = Boolean(on);
              if (sideIds) ui.sideIds = sideIds;
              if (menuOpen) renderBgBar();
              if (STEPS[step]?.id === 'decoracao' && ui.decorHow === 'mao') renderBody({ still: true });
            },
            /** Uma encomenda do jogo está em curso: a comanda fica no alto do palco e o bolo desce um pouco. */
            gameOn(on) {
              if (ui.gameOn === Boolean(on)) return;
              ui.gameOn = Boolean(on);
              el.cz.classList.toggle('has-order', ui.gameOn);
              cake?.resize();
              cake?.setView(manualView || viewFor(step));
            },
            video(can) {
              if (ui.canVideo === can) return;
              ui.canVideo = can;
              if (STEPS[step]?.id === 'resumo') renderBody({ still: true });
            },
            celebrate: () => confetti({ count: cake?.tier === 'mobile' ? 44 : 80 }),
          });
          if (ui.armed) atelier.hands.arm(ui.armed);
        })
        .catch((err) => {
          // sem o ateliê a tela continua inteira: é o modo rápido de fato
          console.warn('[personalizador] ateliê indisponível:', err?.message || err);
        })
        .finally(() => {
          atelierLoading = null;
        });
    }
    // "voltar" do Android: primeiro fecha o que o ateliê tiver aberto; depois, o de sempre (diálogos)
    const prevBack = window.bolabBack;
    const androidBack = () => (menuOpen ? (setMenu(false), true) : Boolean(atelier?.back())) || Boolean(prevBack?.());
    window.bolabBack = androidBack;

    root.__czLoad = (query) => {
      // outro bolo pedido com a tela já aberta (ex.: link de favorito ou "Editar bolo" do carrinho)
      if (!query?.bolo && !query?.base && !query?.linha && !query?.c) return;
      if (query.linha && query.linha === editLineId) return;
      ui.start = false;
      ui.from = null;
      ui.linked = false;
      ui.q = '';
      footKey = '';
      const res = loadInitial(query);
      config = enforceRules(config).config;
      ui.revealSet = Boolean(config.reveal?.on);
      // outro bolo aberto por cima: para quem ouve, é uma abertura nova (não uma lista de mudanças)
      told.config = clone(config);
      told.price = priceOf(billOf(config).config);
      bus.emit('open', { config: publicConfig(config), source: SOURCES[res] || 'novo' });
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
      bus.emit('close', {});
      try {
        atelier?.destroy();
      } catch (err) {
        console.error('[personalizador] erro ao encerrar o ateliê', err);
      }
      atelier = null;
      frameSubs.clear();
      if (window.bolabBack === androidBack) window.bolabBack = prevBack;
      storeDraft();
      vv?.removeEventListener('resize', syncKeyboard);
      vv?.removeEventListener('scroll', syncKeyboard);
      notes.destroy();
      toolsWatch.disconnect();
      stageWatch?.disconnect();
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
      // r5-tela: um motor encerrado ainda fica preso a um registro do kit de peças (ver linkScene): aqui a tela
      // se solta dele, para que só o motor — e não a tela inteira — fique na memória
      sceneLink.cut();
      el.canvas.remove();
    };
  },

  onQuery(root, ctx) {
    root.__czLoad?.(ctx.query);
  },
};
