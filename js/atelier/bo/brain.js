// BOLAB — Ateliê: o cérebro da Bô. Sistema especialista, puro (sem DOM, sem relógio próprio, sem sorteio
// escondido): roda igual no navegador e no Node, e a mesma sequência de eventos dá sempre as mesmas falas.
//
//   const mem = createMemory({ seed: 7, mode: 'importa' });
//   react({ type: 'change', key: 'filling', value: { index: 0, id: 'maracuja' }, by: 'user', at: 12000 }, { config, step }, mem)
//     → null (ela espera um instante) … depois
//   react({ type: 'tick', at: 12900 }, { config, step }, mem)
//     → { id: 'combo.chocolate+maracuja.1', text, speech, mood, priority, why, action? }
//
//   answer('combina', { config, step }, mem)  → resposta de um atalho "Pergunte à Bô" (sempre responde)
//   scoreOf(config)                           → Nota da Bô (determinística: o mesmo bolo dá a mesma nota)
//
// O TEMPO entra pelos eventos (`at`, em milissegundos): quem chama manda { type: 'tick', at } a cada meio segundo.
// A Bô nunca mexe no bolo: quando tem uma sugestão, devolve `action: { label, patch }` e a TELA aplica
// (applyPatch(config, patch) + normalizeConfig). Outras ações possíveis: { label, step } (ir para uma etapa) e
// { label, ask } (abrir outro atalho da própria Bô).
//
// Catálogo: a Bô raciocina por TIPO de opção e pelas `tags` que cada item do catálogo traz (item.tags é a ÚNICA
// fonte: não há tabela paralela aqui). Para um id que ela não conhece, usa as tags e cai nas falas genéricas
// (tag.sabor.*, tag.estilo.*, tag.decor.*, tipo.*). Opção sem tags é tratada como neutra (lista vazia).
//
// Toda sugestão com `patch` passa por patchOk(): muda o bolo de verdade, não cria nada que a cozinha não faz
// (regras 'bloqueia' de js/customizer/rules.js) e não traz opção fora de venda (active: false). O chá revelação
// é segredo: a Bô nunca lê, diz nem devolve a cor (reveal.color) — no barramento ela chega como 'segredo'.
import * as CAT from '../../data/customizer.js';
import { normalizeConfig, priceOf, servesText, prepHoursOf, diametersOf, heightCmOf, decorOptions } from '../../customizer/pricing.js';
import { rulesOf as kitchenRules, enforceRules } from '../../customizer/rules.js';
import { SITE } from '../../data/site.js';
import { LINES, POOLS, showText } from './lines.js';

/* ───────── Ajustes de ritmo (ms) ───────── */
export const TIMING = {
  gap: 8000, // tempo mínimo entre o começo de duas falas
  gapFalante: 6500, // no modo "falante" ela se permite um pouco menos
  gapLight: 5200, // …depois de um simples anúncio de etapa, a reação à primeira escolha pode vir antes
  quietP2: 5000, // no modo "só quando importa", reação comum só depois desse silêncio
  waitP2: 3000, // …e ela espera no máximo isso pela vez (reação atrasada soa fora de hora)
  quietP1: 20000,
  densityWindow: 45000,
  densityMax: 4, // no modo "só quando importa": no máximo 4 falas espontâneas em 45 s
  settleFlavor: 1400, // massas e recheios costumam ser trocados em série (uma camada depois da outra)
  waitLight: 2500, // anúncio de etapa atrasado perde o sentido
  waitP3: 4500,
  offerHold: 14000, // com um botão de sugestão no balão, conversa fiada espera
  settle: 750, // respiro antes de reagir a uma escolha (junta cliques seguidos)
  settleText: 2500, // digitando: espera a pessoa parar
  settleColor: 1100,
  pendingTtl: 10000, // uma opinião que esperou demais perde a hora
  burstWindow: 2500,
  burstCount: 4, // 4 mudanças em 2,5 s = rajada: ela se cala
  focusWindow: 20000,
  focusCount: 6, // 6 mudanças em 20 s = pessoa concentrada: só o que importa
  focusHold: 6000,
  stepTip: 22000, // parada numa etapa: uma dica
  idle: 50000, // ociosa: convite suave
  sleep: 110000, // ociosidade longa: ela cochila
  priceEvery: 45000,
  praiseEvery: 90000,
};

export const MODES = ['falante', 'importa', 'muda'];
export const STEPS = ['formato', 'massa', 'recheio', 'cobertura', 'acabamento', 'decoracao', 'resumo'];
const STEP_NAME = { formato: 'formato', massa: 'massa', recheio: 'recheio', cobertura: 'cobertura', acabamento: 'acabamento', decoracao: 'decoração', resumo: 'resumo' };

/** Atalhos "Pergunte à Bô" (fichas). */
export const CHIPS = [
  { id: 'combina', label: 'Combina?' },
  { id: 'sabor', label: 'Sugira um sabor' },
  { id: 'decoracao', label: 'Sugira uma decoração' },
  { id: 'pessoas', label: 'Para quantas pessoas?' },
  { id: 'economizar', label: 'Deixar mais em conta' },
  { id: 'surpresa', label: 'Me surpreenda' },
  { id: 'falta', label: 'O que falta?' },
  { id: 'nota', label: 'Nota da Bô' },
];

/** Nomes que a Bô usa no balão (o catálogo tem nomes de marca; ela descreve o sabor). */
const BO_NAMES = {
  'recheio:ninho': 'creme de leite em pó',
  'recheio:nutella': 'creme de avelã',
  'recheio:prestigio': 'coco com brigadeiro',
  'recheio:cookies': 'creme com biscoito',
  'cobertura:chantininho': 'chantilly com leite em pó',
  'tamanho:gg': 'tamanho GG',
};
/** Textos que vêm de fora (regras do confeiteiro, nomes do catálogo) passam por aqui antes de ir para o balão. */
export function semMarca(text) {
  return String(text || '')
    .replace(/\bchantininho\b/gi, 'chantilly com leite em pó')
    .replace(/\b(?:leite |creme de leite )?Ninho\b/g, 'creme de leite em pó')
    .replace(/\bNutella\b/g, 'creme de avelã')
    .replace(/\bPrest[ií]gio\b/g, 'coco com brigadeiro');
}

const KIND = {
  massa: { list: () => CAT.FLAVORS, fam: 'sabor' },
  recheio: { list: () => CAT.FILLINGS, fam: 'sabor' },
  cobertura: { list: () => CAT.COVERINGS, fam: 'estilo' },
  estilo: { list: () => CAT.FINISHES, fam: 'estilo' },
  bico: { list: () => CAT.PIPINGS, fam: 'estilo' },
  decor: { list: () => CAT.DECORS, fam: 'decor' },
  formato: { list: () => CAT.SHAPES, fam: null },
  tamanho: { list: () => CAT.SIZES, fam: null },
  base: { list: () => CAT.BASES, fam: null },
  vela: { list: () => CAT.CANDLE_STYLES, fam: null },
  tema: { list: () => CAT.THEMES, fam: null },
  adicional: { list: () => CAT.FILL_ADDS, fam: 'sabor' },
  molhar: { list: () => CAT.SOAKS, fam: null },
  confeito: { list: () => CAT.TRIMS, fam: null },
};

export function itemOf(kind, id) {
  return (KIND[kind]?.list() || []).find((x) => x.id === id) || null;
}

/** As opções de um tipo que estão à venda (active !== false): só elas entram numa sugestão. */
export function shopOf(kind) {
  return (KIND[kind]?.list() || []).filter((x) => x.active !== false);
}

/**
 * Tags de uma opção, lidas do catálogo (lista, ou texto separado por espaço ou vírgula).
 * Opção sem tags → lista vazia: nas contas de sabor e de estilo ela é neutra, e a fala cai no tipo (tipo.massa…).
 */
export function tagsOf(kind, id) {
  const t = itemOf(kind, id)?.tags;
  if (Array.isArray(t)) return t.filter((x) => typeof x === 'string' && x);
  if (typeof t === 'string' && t.trim()) return t.trim().split(/[\s,]+/);
  return [];
}

const low = (s) => String(s || '').toLowerCase();
export function nameOf(kind, id) {
  const it = itemOf(kind, id);
  return BO_NAMES[`${kind}:${id}`] || semMarca(low(it?.name || it?.label || id));
}

/* ───────── utilitários ───────── */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uniq = (arr) => [...new Set(arr)];
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function brl(v) {
  const n = Math.round(Math.abs(Number(v) || 0) * 100);
  const int = String(Math.floor(n / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${int},${String(n % 100).padStart(2, '0')}`;
}

function joinPt(list) {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`;
}

/** FNV-1a de 32 bits: a "sorte" da Bô é uma conta, não um sorteio. */
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Aplica o `patch` de uma ação sobre a configuração (objetos se fundem; listas são trocadas inteiras). */
export function applyPatch(config, patch) {
  const merge = (a, b) => {
    if (Array.isArray(b) || b === null || typeof b !== 'object') return b;
    const out = a && typeof a === 'object' && !Array.isArray(a) ? { ...a } : {};
    for (const k of Object.keys(b)) out[k] = merge(out[k], b[k]);
    return out;
  };
  return normalizeConfig(merge(config, patch));
}

/* ───────── Cor ───────── */
function rgb(hex) {
  const h = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''))?.[1] || 'ffffff';
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

export function luminance(hex) {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastOf(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export function hslOf(hex) {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s, l };
}

/** Família de uma cor: branco, creme, preto, marrom, cinza (neutras) ou rosa, vermelho, laranja, amarelo, verde, azul, roxo. */
export function familyOf(hex) {
  const { h, s, l } = hslOf(hex);
  if (l >= 0.96 || (l >= 0.9 && s < 0.25)) return 'branco';
  if (l <= 0.09) return 'preto';
  if (s < 0.12) return l > 0.7 ? 'branco' : l < 0.3 ? 'preto' : 'cinza';
  if (h >= 12 && h < 50 && l < 0.5 && !(h >= 38 && s > 0.75 && l > 0.4)) return 'marrom';
  if (h >= 25 && h < 65 && l >= 0.8 && s < 0.75) return 'creme';
  if (h >= 345 || h < 12) return l >= 0.6 ? (h >= 345 || h < 3 ? 'rosa' : 'laranja') : 'vermelho';
  if (h < 38) return 'laranja';
  if (h < 70) return 'amarelo';
  if (h < 170) return 'verde';
  if (h < 255) return 'azul';
  if (h < 300) return 'roxo';
  return 'rosa';
}

const NEUTRAL = new Set(['branco', 'creme', 'preto', 'marrom', 'cinza']);
const hueDist = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** Relação entre duas cores: 'neutra' (uma delas é neutra), 'mono', 'analoga', 'complementar', 'triade' ou 'livre'. */
export function relationOf(a, b) {
  const fa = familyOf(a);
  const fb = familyOf(b);
  if (NEUTRAL.has(fa) || NEUTRAL.has(fb)) return 'neutra';
  const d = hueDist(hslOf(a).h, hslOf(b).h);
  if (d < 14) return 'mono';
  if (d < 45) return 'analoga';
  if (d >= 150) return 'complementar';
  if (d >= 100) return 'triade';
  return 'livre';
}

function colorLabel(hex) {
  const n = CAT.colorName ? CAT.colorName(hex) : '';
  if (n && n !== 'Cor personalizada') return n.charAt(0).toLowerCase() + n.slice(1); // "rosa BOLAB", "branco neve"
  return { branco: 'branco', creme: 'creme', preto: 'tom bem escuro', marrom: 'tom de chocolate', cinza: 'cinza', rosa: 'rosa', vermelho: 'vermelho', laranja: 'coral', amarelo: 'amarelo', verde: 'verde', azul: 'azul', roxo: 'roxo' }[familyOf(hex)];
}

const isTwoTone = (styleId) => Boolean(itemOf('estilo', styleId)?.two);
const pipingOn = (c) => c.piping?.style && c.piping.style !== 'liso';

/** As cores à mostra no bolo: [{ role, hex }] (role: cobertura | cobertura2 | calda | bico | decor:<id>). */
export function paletteOf(config) {
  const out = [{ role: 'cobertura', hex: config.covering.color }];
  if (isTwoTone(config.covering.style)) out.push({ role: 'cobertura2', hex: config.covering.color2 });
  if (config.drip?.on) out.push({ role: 'calda', hex: config.drip.color });
  if (pipingOn(config)) out.push({ role: 'bico', hex: config.piping.color });
  (config.decor?.items || []).forEach((id) => {
    const d = itemOf('decor', id);
    if (d?.colors) out.push({ role: `decor:${id}`, hex: decorOptions(config, id).color });
  });
  return out;
}

/** A melhor cor de uma lista para contrastar com `against` sem brigar com ela. */
function contrastPick(list, against, { min = 1.5, target = 2.2 } = {}) {
  const fam = familyOf(against);
  const neutralBase = NEUTRAL.has(fam);
  const scored = list
    .map((hex, i) => {
      const c = contrastOf(hex, against);
      const f = familyOf(hex);
      // sobre uma cor neutra (branco, creme, chocolate) qualquer cor harmoniza: vale a que contrasta na medida;
      // sobre uma cor viva, primeiro um tom da mesma família, depois os neutros e os vizinhos
      const rel = neutralBase ? (f === fam ? 1 : 0) : f === fam ? 0 : NEUTRAL.has(f) || relationOf(hex, against) === 'analoga' ? 1 : 2;
      return { hex, c, rel, i };
    })
    .filter((x) => x.c >= min);
  scored.sort((a, b) => a.rel - b.rel || Math.abs(a.c - target) - Math.abs(b.c - target) || a.i - b.i);
  return scored[0]?.hex || null;
}

/** Leitura das cores: problemas de contraste, relação entre a cobertura e os destaques, clima da paleta. */
export function colorReport(config) {
  const pal = paletteOf(config);
  const cover = config.covering.color;
  const naked = config.covering.type === 'naked';
  const issues = [];
  if (pipingOn(config) && !naked) {
    const c = contrastOf(config.piping.color, cover);
    // branco sobre branco (ou creme) é o clássico dos bolos de casamento e de batizado: não é problema
    const classicWhite = ['branco', 'creme'].includes(familyOf(cover)) && ['branco', 'creme'].includes(familyOf(config.piping.color));
    if (c < 1.22 && !classicWhite) {
      const pick = contrastPick((CAT.COLORS || []).map((x) => x.hex), cover);
      issues.push({
        code: 'bico.some',
        group: 'cor.bico.some',
        text: `O bico está quase no mesmo tom da cobertura${pick ? `; em ${colorLabel(pick)} ele aparece mais` : ''}.`,
        action: pick ? { label: `Bico em ${colorLabel(pick)}`, patch: { piping: { color: pick } } } : null,
        weight: 6,
      });
    }
  }
  if (config.drip?.on) {
    const c = contrastOf(config.drip.color, cover);
    const bothDark = luminance(config.drip.color) < 0.12 && luminance(cover) < 0.12;
    if (c < 1.3 || (bothDark && c < 2.2)) {
      const pick = contrastPick(CAT.DRIP_COLORS || ['#ffffff', '#3a1a08'], cover, { min: 2, target: 4 });
      issues.push({
        code: 'calda.some',
        group: bothDark ? 'cor.calda.escura' : 'cor.calda.some',
        groups: bothDark ? ['cor.calda.escura', 'cor.calda.some'] : ['cor.calda.some'],
        text: colorLabel(config.drip.color) === colorLabel(cover) ? `A calda e a cobertura estão na mesma cor (${colorLabel(cover)}): ela quase não aparece.` : `A calda ${colorLabel(config.drip.color)} quase não aparece sobre a cobertura ${colorLabel(cover)}.`,
        action: pick ? { label: `Calda em ${colorLabel(pick)}`, patch: { drip: { on: true, color: pick } } } : null,
        weight: 7,
      });
    }
  }
  const chroma = pal.filter((p) => !NEUTRAL.has(familyOf(p.hex)));
  const fams = uniq(chroma.map((p) => familyOf(p.hex)));
  if (fams.length >= 4) issues.push({ code: 'muitas', group: 'cor.muitas', text: `São ${fams.length} famílias de cor no bolo; repetir uma delas acalma o visual.`, action: null, weight: 4 });

  // clima da paleta
  let mood = 'neutra';
  let reason = 'tons neutros, que combinam com tudo';
  if (chroma.length >= 2) {
    const base = chroma[0].hex;
    const rels = chroma.slice(1).map((p) => relationOf(base, p.hex));
    if (fams.length === 1) [mood, reason] = ['mono', 'tom sobre tom, discreto e elegante'];
    else if (rels.includes('complementar')) [mood, reason] = ['complementar', 'cores opostas que se valorizam'];
    else if (rels.every((r) => r === 'analoga' || r === 'mono')) [mood, reason] = ['analoga', 'cores vizinhas, em harmonia'];
    else if (fams.length === 3) [mood, reason] = ['triade', 'três cores alegres, com cara de festa'];
    else [mood, reason] = ['livre', 'uma mistura de cores bem pessoal'];
  } else if (chroma.length === 1) {
    [mood, reason] = ['acento', `${colorLabel(chroma[0].hex)} com tons neutros: limpo e certeiro`];
  }
  const pastel = chroma.length >= 2 && chroma.every((p) => hslOf(p.hex).l >= 0.74);
  if (pastel && mood !== 'complementar') reason = 'tons pastel, bem delicados';
  const dark = luminance(cover) < 0.1;
  // um enfeite que repete a cor da cobertura ou do bico "amarra" o visual
  const accents = pal.filter((p) => p.role.startsWith('decor:'));
  const anchors = pal.filter((p) => !p.role.startsWith('decor:') && !NEUTRAL.has(familyOf(p.hex)));
  const echo = accents.some((a) => anchors.some((b) => familyOf(a.hex) === familyOf(b.hex)));
  return { palette: pal, issues, mood, pastel, dark, fams, echo, reason };
}

/* ───────── Sabor ───────── */
const flav = (kind, id) => {
  const tags = tagsOf(kind, id);
  return { kind, id, tags, has: (t) => tags.includes(t) };
};
const isAcid = (f) => f.has('azedinho') || f.has('citrico');
/** Quanto um sabor pesa no doce do bolo, só pelas tags: doce e caramelo somam; fruta, leveza e "adulto" aliviam. */
function sweetWeight(f) {
  if (isAcid(f)) return -1;
  const w = (f.has('doce') ? 1 : 0) + (f.has('caramelo') ? 1 : 0) + (f.has('chocolate') ? 0.5 : 0) + (f.has('intenso') ? 0.5 : 0) - (f.has('frutado') ? 0.5 : 0) - (f.has('leve') ? 0.5 : 0) - (f.has('adulto') ? 0.5 : 0);
  return Math.max(-0.5, w);
}

/**
 * Pares conhecidos massa+recheio: 2 certeiro · 1 bom · 0 ousado · -1 arriscado.
 * É o caderno de receitas da Bô (o que confeiteira sabe de cor); o que não está aqui sai das tags do catálogo.
 */
const PAIR = {
  'chocolate+maracuja': 2, 'chocolate+morango': 2, 'chocolate+framboesa': 2, 'chocolate+brigadeiro': 1, 'chocolate+nutella': 1,
  'chocolate+coco': 2, 'chocolate+ninho': 2, 'chocolate+docedeleite': 1, 'chocolate+limao': 0,
  'chocolate+cereja': 2, 'chocolate+prestigio': 2, 'chocolate+caramelosalgado': 2, 'chocolate+cafe': 2, 'chocolate+frutasvermelhas': 2,
  'chocolate+pistache': 2, 'chocolate+cookies': 2, 'chocolate+meioamargo': 1, 'chocolate+ganache': 1, 'chocolate+moussechocolate': 1,
  'chocolate+limaosiciliano': 0, 'chocolate+creamcheese': 1,
  'baunilha+morango': 2, 'baunilha+ninho': 2, 'baunilha+docedeleite': 2, 'baunilha+brigadeiro': 2, 'baunilha+coco': 2,
  'baunilha+limao': 2, 'baunilha+maracuja': 2, 'baunilha+framboesa': 2, 'baunilha+nutella': 1,
  'baunilha+pessego': 2, 'baunilha+ameixa': 2, 'baunilha+frutasvermelhas': 2, 'baunilha+quatroleites': 2, 'baunilha+cremebelga': 2,
  'baunilha+limaosiciliano': 2, 'baunilha+abacaxicoco': 2, 'baunilha+docedeleitenozes': 2,
  'redvelvet+ninho': 2, 'redvelvet+framboesa': 2, 'redvelvet+morango': 2, 'redvelvet+brigadeiro': 1, 'redvelvet+coco': 1,
  'redvelvet+docedeleite': 0, 'redvelvet+nutella': 1, 'redvelvet+limao': -1, 'redvelvet+maracuja': -1,
  'redvelvet+creamcheese': 2, 'redvelvet+ganachebranca': 2, 'redvelvet+frutasvermelhas': 2, 'redvelvet+limaosiciliano': -1,
  'cenoura+brigadeiro': 2, 'cenoura+docedeleite': 2, 'cenoura+ninho': 1, 'cenoura+nutella': 1, 'cenoura+coco': 1,
  'cenoura+limao': -1, 'cenoura+maracuja': -1, 'cenoura+framboesa': -1, 'cenoura+morango': 0,
  'cenoura+meioamargo': 2, 'cenoura+ganache': 2, 'cenoura+creamcheese': 2, 'cenoura+limaosiciliano': -1, 'cenoura+frutasvermelhas': -1,
  'cenoura+cereja': 0, 'cenoura+moussechocolate': 1,
  'limao+limao': 1, 'limao+coco': 2, 'limao+framboesa': 2, 'limao+ninho': 2, 'limao+morango': 1, 'limao+maracuja': 1,
  'limao+brigadeiro': -1, 'limao+nutella': -1, 'limao+docedeleite': 0,
  'limao+limaosiciliano': 2, 'limao+ganachebranca': 2, 'limao+brigadeirobranco': 2, 'limao+meioamargo': 0, 'limao+ganache': 0,
  'limao+cookies': 0, 'limao+prestigio': 0, 'limao+moussechocolate': 0, 'limao+caramelosalgado': 0, 'limao+ameixa': 0,
  'morango+ninho': 2, 'morango+brigadeiro': 2, 'morango+morango': 1, 'morango+nutella': 2, 'morango+coco': 1,
  'morango+limao': 1, 'morango+docedeleite': 0, 'morango+maracuja': 0, 'morango+framboesa': 1,
  'morango+brigadeirobranco': 2, 'morango+moussemorango': 1,
  'mesclada+brigadeiro': 2, 'mesclada+ninho': 2, 'formigueiro+brigadeiro': 2, 'formigueiro+ninho': 2,
  'funfetti+brigadeirobranco': 2, 'funfetti+ninho': 2, 'funfetti+brigadeiro': 2,
  'laranja+ganache': 2, 'laranja+meioamargo': 2, 'laranja+brigadeiro': 1, 'laranja+cafe': 0, 'laranja+docedeleite': 1,
  'maracuja+ganachebranca': 2, 'maracuja+meioamargo': 2, 'maracuja+ganache': 2, 'maracuja+brigadeiro': 2, 'maracuja+ninho': 2, 'maracuja+coco': 2,
  'banana+docedeleite': 2, 'banana+caramelosalgado': 2, 'banana+brigadeiro': 1, 'banana+docedeleitenozes': 2, 'banana+pacoca': 1,
  'coco+abacaxicoco': 2, 'coco+cocada': 2, 'coco+docedeleite': 2, 'coco+coco': 2, 'coco+quatroleites': 2, 'coco+maracuja': 2, 'coco+prestigio': 2,
  'nozes+docedeleitenozes': 2, 'nozes+ameixa': 2, 'nozes+docedeleite': 2, 'nozes+nozes': 1, 'nozes+cafe': 2,
  'amendoas+framboesa': 2, 'amendoas+pistache': 2, 'amendoas+frutasvermelhas': 2, 'amendoas+limaosiciliano': 2, 'amendoas+cremebelga': 2,
  'pacoca+docedeleite': 2, 'pacoca+pacoca': 2, 'pacoca+brigadeiro': 2,
  'churros+docedeleite': 2, 'churros+docedeleitenozes': 2, 'churros+caramelosalgado': 1, 'churros+ninho': 1,
  'cafe+docedeleite': 2, 'cafe+caramelosalgado': 2, 'cafe+moussechocolate': 2, 'cafe+ganache': 1, 'cafe+meioamargo': 1, 'cafe+nozes': 2, 'cafe+ninho': 1,
  'chocolatebranco+frutasvermelhas': 2, 'chocolatebranco+maracuja': 2, 'chocolatebranco+framboesa': 2, 'chocolatebranco+limaosiciliano': 2, 'chocolatebranco+pistache': 2,
};
const RISK_GROUP = {
  'limao+brigadeiro': 'combo.risco.citrico-chocolate',
  'limao+nutella': 'combo.risco.citrico-chocolate',
  'limao+docedeleite': 'combo.risco.limao-docedeleite',
  'cenoura+limao': 'combo.risco.cenoura-acido',
  'cenoura+maracuja': 'combo.risco.cenoura-acido',
  'cenoura+framboesa': 'combo.risco.cenoura-acido',
  'cenoura+limaosiciliano': 'combo.risco.cenoura-acido',
  'cenoura+frutasvermelhas': 'combo.risco.cenoura-acido',
  'redvelvet+limao': 'combo.risco.delicada-acido',
  'redvelvet+maracuja': 'combo.risco.delicada-acido',
  'redvelvet+limaosiciliano': 'combo.risco.delicada-acido',
};
/** Pares conhecidos entre recheios (ids em ordem alfabética). */
const DUO = {
  'brigadeiro+ninho': 2, 'morango+ninho': 2, 'coco+maracuja': 2, 'brigadeiro+morango': 2, 'coco+docedeleite': 1, 'morango+nutella': 2,
  'brigadeiro+maracuja': 2, 'framboesa+ninho': 2, 'brigadeiro+nutella': 0, 'framboesa+limao': 0, 'brigadeiro+docedeleite': 0,
  'ninho+nutella': 2, 'brigadeiro+coco': 2, 'cereja+moussechocolate': 2, 'frutasvermelhas+ganachebranca': 2, 'ganache+maracuja': 2,
  'caramelosalgado+ganache': 1, 'cafe+docedeleite': 2, 'brigadeirobranco+morango': 2, 'frutasvermelhas+limaosiciliano': 1, 'abacaxicoco+coco': 2,
  'framboesa+pistache': 2, 'brigadeiro+cookies': 2, 'cremebelga+morango': 2, 'maracuja+ninho': 2, 'docedeleite+pacoca': 1, 'coco+quatroleites': 1,
};

/** Afinidade por tags (vale para qualquer catálogo): { score, code }. */
function tagAffinity(a, b) {
  const any = (f, ...t) => t.some((x) => f.has(x));
  const both = (x, y) => (a.has(x) && any(b, ...y)) || (b.has(x) && any(a, ...y));
  if (both('cafe', ['citrico'])) return { score: -1, code: 'cafe-citrico' };
  if (both('chocolate', ['frutado', 'citrico'])) return { score: 2, code: 'chocolate-fruta' };
  if (both('cafe', ['chocolate', 'caramelo'])) return { score: 2, code: 'cafe-chocolate' };
  if (both('castanhas', ['caramelo', 'chocolate'])) return { score: 2, code: 'castanha-caramelo' };
  if (both('coco', ['frutado', 'citrico'])) return { score: 2, code: 'tropical' };
  if (both('crocante', ['cremoso'])) return { score: 2, code: 'cremoso-crocante' };
  if ((isAcid(a) && any(b, 'doce', 'caramelo', 'cremoso')) || (isAcid(b) && any(a, 'doce', 'caramelo', 'cremoso'))) return { score: 2, code: 'doce-azedo' };
  if (both('especiarias', ['caramelo'])) return { score: 2, code: 'equilibrado' };
  if (a.has('classico') && b.has('classico')) return { score: 1, code: 'equilibrado' };
  if (both('especiarias', ['frutado', 'cremoso'])) return { score: 1, code: 'equilibrado' };
  return { score: 1, code: 'neutro' };
}

function pairOf(massaId, recheioId) {
  const key = `${massaId}+${recheioId}`;
  const aff = tagAffinity(flav('massa', massaId), flav('recheio', recheioId));
  const score = key in PAIR ? PAIR[key] : aff.score;
  let group = null;
  if (POOLS[`combo.${key}`]) group = `combo.${key}`;
  else if (score < 0) group = RISK_GROUP[key] || (POOLS[`combo.risco.${aff.code}`] ? `combo.risco.${aff.code}` : null);
  // sem fala própria: a fala da afinidade por tags — menos quando o caderno conhece o par e o acha MENOS feliz do que
  // as tags sugerem (limão com ganache não ganha "chocolate com fruta sempre dá certo")
  else if (score >= 1 && score >= aff.score) group = POOLS[`combo.tag.${aff.code}`] ? `combo.tag.${aff.code}` : null;
  return { key, massa: massaId, recheio: recheioId, score, code: aff.code, group, risk: score < 0 };
}

function duoOf(a, b) {
  if (a === b) return { key: `${a}+${b}`, score: 0, group: null, known: false };
  const key = [a, b].sort().join('+');
  const aff = tagAffinity(flav('recheio', a), flav('recheio', b));
  const known = key in DUO;
  const score = known ? DUO[key] : aff.code === 'neutro' ? 0 : Math.max(0, aff.score - 1);
  const group = POOLS[`duo.${key}`] ? `duo.${key}` : score >= 1 && POOLS[`combo.tag.${aff.code}`] ? `combo.tag.${aff.code}` : null;
  return { key, score, group, code: aff.code, known };
}

/** O porquê de um par, numa frase curta para o balão. */
function pairReason(massaId, recheioId) {
  const m = flav('massa', massaId);
  const r = flav('recheio', recheioId);
  if (m.has('chocolate') && (r.has('frutado') || r.has('citrico'))) return 'A fruta equilibra o chocolate.';
  if (isAcid(r) && (m.has('doce') || m.has('classico'))) return 'O azedinho corta o doce da massa.';
  if (isAcid(m) && (r.has('cremoso') || r.has('coco'))) return 'O creme suaviza o cítrico.';
  if ((m.has('cafe') && (r.has('chocolate') || r.has('caramelo'))) || (r.has('cafe') && m.has('chocolate'))) return 'Café realça o chocolate e o caramelo.';
  if (m.has('especiarias') && r.has('caramelo')) return 'A canela pede um caramelo.';
  if (m.has('coco') && r.has('frutado')) return 'Coco com fruta fica fresco, tropical.';
  if (r.has('crocante') || (m.has('crocante') && r.has('cremoso'))) return 'O crocante muda a mordida.';
  if (r.has('chocolate') && !m.has('chocolate')) return 'O chocolate do recheio aparece bem nessa massa.';
  if (m.has('classico') && r.has('classico')) return 'É um par clássico, agrada todo mundo.';
  return 'Os dois sabores se completam.';
}

/** Recheios à venda que mais combinam com uma massa (os melhores primeiro), fora os de `exclude`. */
export function bestFillingsFor(massaId, exclude = [], want = null) {
  return shopOf('recheio')
    .filter((f) => !exclude.includes(f.id))
    .map((f, i) => ({ id: f.id, i, price: f.price || 0, score: pairOf(massaId, f.id).score, popular: f.popular ? 1 : 0, f: flav('recheio', f.id) }))
    .filter((x) => (want ? want(x.f) : true))
    .sort((a, b) => b.score - a.score || b.popular - a.popular || a.price - b.price || a.i - b.i)
    .map((x) => x.id);
}

const mainFlavor = (config) => {
  const n = new Map();
  config.layers.forEach((id) => n.set(id, (n.get(id) || 0) + 1));
  return [...n].sort((a, b) => b[1] - a[1])[0][0];
};

const swapFilling = (config, index, id) => config.fillings.map((f, i) => (i === index ? id : f));

/** O primeiro recheio da lista que a cozinha aceita no vão `index` (chá revelação só leva creme claro, por exemplo). */
function firstFilling(config, index, ids) {
  return ids.find((id) => patchOk(config, { fillings: swapFilling(config, index, id) })) || null;
}

/** Leitura do sabor: pares, dupla de recheios, excesso de doce / de ácido / de intensidade. */
export function flavorReport(config) {
  const massas = uniq(config.layers);
  const main = mainFlavor(config);
  const fillings = config.fillings;
  const pairs = [];
  fillings.forEach((r, index) => {
    // cada recheio fica entre a camada `index` e a `index + 1`
    const near = uniq([config.layers[index], config.layers[index + 1]].filter(Boolean));
    const worst = near.map((m) => pairOf(m, r)).sort((a, b) => a.score - b.score)[0] || pairOf(main, r);
    pairs.push({ ...worst, index });
  });
  const duos = [];
  for (let i = 0; i < fillings.length - 1; i++) if (fillings[i] !== fillings[i + 1]) duos.push({ ...duoOf(fillings[i], fillings[i + 1]), a: fillings[i], b: fillings[i + 1] });
  const fl = fillings.map((id) => flav('recheio', id));
  const mf = flav('massa', main);
  const sweet = fl.reduce((s, f) => s + sweetWeight(f), 0) + 0.5 * sweetWeight(mf); // massa cítrica alivia; massa doce soma
  const issues = [];
  let balance = null;
  if (fl.length >= 2 && !fl.some(isAcid) && sweet >= 3) balance = 'tudo-doce';
  else if (fl.length >= 2 && fl.every(isAcid) && (isAcid(mf) || fl.length >= 3)) balance = 'tudo-azedo';
  else if (fl.length >= 2 && fl.every((f) => f.has('intenso')) && mf.has('intenso')) balance = 'tudo-intenso';
  // receita consagrada não é excesso: o mesmo recheio certeiro em todas as camadas (churros com doce de leite,
  // red velvet com cream cheese) ou uma dupla de recheios que a própria Bô elogia (doce de leite com coco)
  const classic = pairs.length && pairs.every((p) => p.score >= 2) && uniq(fillings).length === 1;
  const praised = duos.length && duos.every((d) => d.known && d.score >= 1);
  if (balance && (classic || (balance === 'tudo-doce' && praised && sweet < 4))) balance = null;

  pairs
    .filter((p) => p.risk)
    .forEach((p) => {
      const sug = firstFilling(config, p.index, bestFillingsFor(p.massa, fillings));
      issues.push({
        code: `par:${p.key}`,
        group: p.group || 'combo.tag.tudo-intenso',
        text: `${cap(nameOf('massa', p.massa))} com ${nameOf('recheio', p.recheio)} disputam a atenção${sug ? `; com ${nameOf('recheio', sug)} a massa aparece mais` : ''}.`,
        action: sug ? { label: `Trocar ${nameOf('recheio', p.recheio)} por ${nameOf('recheio', sug)}`, patch: { fillings: swapFilling(config, p.index, sug) } } : null,
        weight: 9,
      });
    });
  if (balance) {
    // troca o recheio que mais pesa (o último, no empate) por um contraponto
    const weights = fl.map(sweetWeight);
    // …de preferência um que não seja par certeiro da massa (o doce de leite do churros fica; sai o vizinho)
    let idx = 0;
    const keep = (i) => (pairs[i]?.score >= 2 ? 1 : 0);
    if (balance === 'tudo-doce') weights.forEach((w, i) => (keep(i) < keep(idx) || (keep(i) === keep(idx) && w >= weights[idx]) ? (idx = i) : 0));
    else fl.forEach((_, i) => (keep(i) <= keep(idx) ? (idx = i) : 0));
    const want = balance === 'tudo-doce' ? (f) => isAcid(f) || f.has('frutado') : balance === 'tudo-azedo' ? (f) => !isAcid(f) && (f.has('cremoso') || f.has('leve')) : (f) => !f.has('intenso');
    // a troca tem de resolver o excesso de verdade (e a cozinha tem de aceitar)
    const sug = bestFillingsFor(config.layers[idx] || main, fillings, want).find((id) => {
      const patch = { fillings: swapFilling(config, idx, id) };
      return patchOk(config, patch) && !balanceOf(applyPatch(config, patch));
    });
    const what = { 'tudo-doce': 'Os recheios são todos bem doces', 'tudo-azedo': 'Tem acidez em todas as camadas', 'tudo-intenso': 'Todos os sabores são intensos' }[balance];
    issues.push({
      code: balance,
      group: `combo.tag.${balance}`,
      text: `${what}${sug ? `; ${nameOf('recheio', sug)} no lugar de ${nameOf('recheio', fillings[idx])} equilibra` : ''}.`,
      action: sug ? { label: `Trocar ${nameOf('recheio', fillings[idx])} por ${nameOf('recheio', sug)}`, patch: { fillings: swapFilling(config, idx, sug) } } : null,
      weight: 8,
    });
  }
  const good = pairs.filter((p) => p.score >= 2).sort((a, b) => a.index - b.index);
  const goodDuo = duos.filter((d) => d.score >= 2);
  let reason = CAT.isVolcano?.(config) ? 'vulcão: uma massa só, com a cobertura transbordando' : 'bolo simples, de uma massa só';
  if (good.length) reason = `${nameOf('massa', good[0].massa)} com ${nameOf('recheio', good[0].recheio)} é um par certeiro`;
  else if (goodDuo.length) reason = `${nameOf('recheio', goodDuo[0].a)} e ${nameOf('recheio', goodDuo[0].b)} se dão muito bem`;
  else if (pairs.length) reason = 'os sabores convivem bem';
  return { main, massas, pairs, duos, sweet, balance, issues, good, goodDuo, reason, mixed: massas.length > 1 };
}

/** Só o excesso (doce, ácido, intenso) de um bolo — sem montar as sugestões (usado para conferir uma troca). */
function balanceOf(config) {
  const fl = config.fillings.map((id) => flav('recheio', id));
  if (fl.length < 2) return null;
  const mf = flav('massa', mainFlavor(config));
  const sweet = fl.reduce((s, f) => s + sweetWeight(f), 0) + 0.5 * sweetWeight(mf);
  if (!fl.some(isAcid) && sweet >= 3) return 'tudo-doce';
  if (fl.every(isAcid) && (isAcid(mf) || fl.length >= 3)) return 'tudo-azedo';
  if (fl.every((f) => f.has('intenso')) && mf.has('intenso')) return 'tudo-intenso';
  return null;
}

/* ───────── O que a cozinha faz (js/customizer/rules.js) e o que está à venda ───────── */
const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Códigos das regras 'bloqueia' de um bolo (o que a cozinha não faz). */
function blocksOf(config) {
  try {
    return kitchenRules(config).filter((r) => r.level === 'bloqueia').map((r) => r.code);
  } catch {
    return [];
  }
}

/** Tudo o que um bolo usa do catálogo: ['massa:baunilha', 'decor:velas'…]. */
function usedOf(config) {
  const d = config.decor || {};
  const covers = [config.covering, ...(Array.isArray(config.tierCover) ? config.tierCover : [])].filter(Boolean);
  return [
    `formato:${config.shape}`,
    `tamanho:${config.size}`,
    `base:${config.base}`,
    ...(config.layers || []).map((id) => `massa:${id}`),
    ...(config.fillings || []).map((id) => `recheio:${id}`),
    ...(config.fillAdds || []).filter(Boolean).map((id) => `adicional:${id}`),
    ...(config.soak ? [`molhar:${config.soak}`] : []),
    ...covers.flatMap((c) => [`cobertura:${c.type}`, `estilo:${c.style}`, ...(itemOf('estilo', c.style)?.trim ? [`confeito:${c.trim}`] : [])]),
    `bico:${config.piping?.style}`,
    ...(d.items || []).map((id) => `decor:${id}`),
    ...(d.placed || []).map((q) => `decor:${q.id}`),
    ...((d.items || []).includes('velas') ? [`vela:${d.candleStyle}`] : []),
  ];
}

/**
 * Uma sugestão só vale se: muda o bolo de verdade, não cria nada que a cozinha não faz (regra 'bloqueia' nova),
 * não traz opção fora de venda e não toca na cor do chá revelação.
 */
export function patchOk(config, patch) {
  if (!isObj(patch) || (isObj(patch.reveal) && 'color' in patch.reveal)) return false;
  let next;
  try {
    next = applyPatch(config, patch);
  } catch {
    return false;
  }
  if (same(next, config)) return false;
  const had = new Set(usedOf(config));
  const off = usedOf(next).some((k) => {
    if (had.has(k)) return false;
    const [kind, id] = k.split(':');
    return itemOf(kind, id)?.active === false;
  });
  if (off) return false;
  const before = new Set(blocksOf(config));
  return blocksOf(next).every((code) => before.has(code));
}

/** Só o que muda de `a` para `b`, em forma de patch (objetos por dentro; listas inteiras). Nunca leva a cor do chá revelação. */
function diffPatch(a, b) {
  const out = {};
  for (const k of Object.keys(b)) {
    if (k === 'v' || k === 'height' || same(a?.[k], b[k])) continue;
    if (isObj(a?.[k]) && isObj(b[k]) && k !== 'opts') {
      const d = diffPatch(a[k], b[k]);
      if (d) out[k] = d;
    } else out[k] = b[k];
  }
  if (isObj(out.reveal)) {
    delete out.reveal.color;
    if (!Object.keys(out.reveal).length) delete out.reveal;
  }
  return Object.keys(out).length ? out : null;
}

/** A sugestão de uma regra do confeiteiro ({ label, patch } ou { label, apply }) em forma de ação da Bô. */
function ruleAction(config, rule) {
  const f = rule?.fix;
  if (!isObj(f) || !f.label) return null;
  if (isObj(f.patch)) return { label: semMarca(f.label), patch: f.patch };
  if (typeof f.apply !== 'function') return null;
  try {
    const next = JSON.parse(JSON.stringify(config));
    f.apply(next, null);
    const patch = diffPatch(config, enforceRules(next, config).config);
    return patch && patchOk(config, patch) ? { label: semMarca(f.label), patch } : null;
  } catch {
    return null;
  }
}

/* ───────── Estrutura e equilíbrio ───────── */
const TOP_ARR = new Set(['auto', 'centro', 'coroa', 'meialua', 'espalhado', 'cascata', 'palito', 'fundo']);
// fruta fresca sobre chantilly é clássico: não entra (a lista acompanha HEAVY_DECOR de js/customizer/rules.js)
const HEAVY = new Set(['macarons', 'bombons', 'brigadeiros', 'morangos', 'biscoitos', 'donuts', 'cookies', 'cakepops']);
/** Alertas do confeiteiro que pesam no equilíbrio do bolo (os de conservação e prazo são só informação). */
const STRUCT_ALERTS = new Set(['dois-andares-mole', 'glace-decor-pesada', 'calda-metalica-mole', 'naked-sob-pasta', 'alto-recheio-mole', 'andares-recheio-mole', 'vulcao-gg']);

/** A cobertura cede com peso e calor? O catálogo diz (soft); opção antiga, sem os campos novos, vale a tag "delicado". */
const isSoftCover = (id) => {
  const c = itemOf('cobertura', id);
  return Boolean(c) && (c.soft === true || (!('kind' in c) && tagsOf('cobertura', id).includes('delicado')));
};
/** A cobertura sofre no calor (sai da geladeira só na hora)? */
const isHeatCover = (id) => {
  const c = itemOf('cobertura', id);
  return Boolean(c) && (c.heat === true || c.soft === true || (!('kind' in c) && tagsOf('cobertura', id).includes('delicado')));
};
const firstSentence = (text) => {
  const s = String(text || '');
  const i = s.indexOf('. ', 30);
  return i > 0 ? s.slice(0, i + 1) : s;
};
/** Enfeite miúdo, salpicado (granulado, confete, glitter…): ocupa pouco do topo. */
const isSprinkle = (id) => {
  const d = itemOf('decor', id);
  return Boolean(d) && Array.isArray(d.arrs) && d.arrs.length === 1 && d.arrs[0] === 'espalhado';
};

export function balanceReport(config) {
  const items = config.decor?.items || [];
  const tiers = config.tiers || 1;
  const dias = diametersOf(config);
  const topDia = dias[dias.length - 1];
  const volcano = Boolean(CAT.isVolcano?.(config));
  let load = 0;
  const onTop = [];
  items.forEach((id) => {
    const o = decorOptions(config, id);
    if (!TOP_ARR.has(o.arr)) return;
    onTop.push(id);
    load += (isSprinkle(id) ? 0.5 : 1) * (o.qty === 'farto' ? 1.5 : o.qty === 'pouco' ? 0.7 : 1);
  });
  const placed = (config.decor?.placed || []).filter((q) => q.face !== 'lateral');
  load += Math.min(2, placed.length / 4); // peças postas à mão no topo também ocupam
  load = Math.round(load * 100) / 100;
  const capacity = (topDia >= 29 ? 6 : topDia >= 24 ? 5 : topDia >= 19 ? 4 : topDia >= 14 ? 3 : 2) - (volcano ? 1 : 0); // o furo do vulcão come o centro
  const crowded = load > capacity + 0.2;
  const pip = itemOf('bico', config.piping?.style);
  const placedKinds = uniq((config.decor?.placed || []).map((q) => q.id)).filter((id) => !items.includes(id)).length;
  const layersOfDecor = (config.covering.style !== 'liso' ? 1 : 0) + (config.drip?.on ? 1 : 0) + (pipingOn(config) ? (pip?.combo ? 2 : 1) : 0) + items.length + Math.min(2, placedKinds) + (config.decor?.message ? 1 : 0) + (config.decor?.topper?.text ? 1 : 0);
  const loaded = layersOfDecor >= 7;
  const tall = tiers === 1 && !volcano && config.size !== 'bento' && heightCmOf(config) / dias[0] >= 0.82;
  const empty = layersOfDecor === 0;
  const heavyOnSoft = isSoftCover(config.covering.type) && onTop.some((id) => HEAVY.has(id) && decorOptions(config, id).qty !== 'pouco');
  const issues = [];
  if (crowded) {
    // primeiro o que menos mexe na ideia: um enfeite farto volta para a quantidade média; senão sai um (de preferência
    // o último que não carrega cor da paleta; as velas ficam)
    const full = [...onTop].reverse().find((id) => itemOf('decor', id)?.qty && decorOptions(config, id).qty === 'farto');
    const drop = onTop.length >= 2 ? [...onTop].reverse().find((id) => id !== 'velas' && !itemOf('decor', id)?.colors) || [...onTop].reverse().find((id) => id !== 'velas') : null;
    const action = full
      ? { label: `${cap(nameOf('decor', full))} em quantidade média`, patch: { decor: { opts: { [full]: { ...decorOptions(config, full), qty: 'medio' } } } } }
      : drop
        ? { label: `Tirar ${nameOf('decor', drop)}`, patch: { decor: { items: items.filter((x) => x !== drop) } } }
        : null;
    issues.push({
      code: 'topo.lotado',
      group: 'topo.lotado',
      text: full ? `O topo de ${topDia} cm está apertado; ${nameOf('decor', full)} em quantidade média já alivia.` : `O topo de ${topDia} cm está com ${onTop.length} enfeites; com um a menos, cada um aparece mais.`,
      action,
      weight: 8,
    });
  }
  if (loaded && !crowded) issues.push({ code: 'disputa', group: 'disputa', text: 'Estilo, calda, bico e enfeites: é muita coisa pedindo atenção ao mesmo tempo.', action: null, weight: 5 });
  if (heavyOnSoft) {
    // a firme mais parecida (o chantilly vira chantilly com leite em pó; mousse e merengue, buttercream), se a cozinha aceitar
    const order = config.covering.type === 'chantilly' ? ['chantininho', 'buttercream'] : ['buttercream', 'chantininho'];
    const firm = Array.isArray(config.tierCover)
      ? null
      : [...order, ...shopOf('cobertura').filter((c) => tagsOf('cobertura', c.id).includes('firme')).map((c) => c.id)].find((id) => itemOf('cobertura', id)?.active !== false && !isSoftCover(id) && patchOk(config, { covering: { type: id } }));
    issues.push({
      code: 'peso.delicado',
      group: 'peso.delicado',
      text: `Enfeite pesado sobre ${nameOf('cobertura', config.covering.type)} pode marcar o creme no calor${firm ? `; ${nameOf('cobertura', firm)} segura melhor` : ''}.`,
      action: firm ? { label: `Trocar para ${nameOf('cobertura', firm)}`, patch: { covering: { type: firm } } } : null,
      weight: 5,
    });
  }
  // o que o confeiteiro avisa sobre a estrutura (cobertura mole em andares, enfeite pesado no glacê…)
  let kitchen = [];
  try {
    kitchen = kitchenRules(config).filter((r) => r.level === 'alerta' && STRUCT_ALERTS.has(r.code));
  } catch {
    kitchen = [];
  }
  kitchen.forEach((r) => issues.push({ code: `regra:${r.code}`, group: 'regra.alerta', text: semMarca(firstSentence(r.text)), action: ruleAction(config, r), weight: 6 }));
  let reason = 'cada enfeite tem o seu espaço';
  if (empty) reason = 'bolo liso, minimalista';
  else if (crowded) reason = 'o topo está concorrido';
  else if (loaded) reason = 'há muita informação junta';
  else if (kitchen.length) reason = 'a estrutura pede um cuidado';
  else if (tall) reason = 'alto e estreito: elegante, pede fatia fina';
  return { onTop, load, capacity, crowded, loaded, tall, empty, heavyOnSoft, kitchen: kitchen.length, issues, topDia, reason };
}

/* ───────── Ocasião (deduzida do tema, dos enfeites e da mensagem) ───────── */
const OCCASION_WORDS = [
  ['aniversario', /parab|anivers|feliz idade|anos\b|niver/i],
  ['romantico', /te amo|amor|namor|paix|minha vida|meu bem/i],
  ['bebe', /beb[eê]|ch[aá] de|bem-vind|nasc/i],
  ['casamento', /casament|noiv|bodas|felicidades aos/i],
  ['formatura', /formatur|formand|doutor|diploma/i],
  ['natal', /natal|boas festas|ho ho/i],
  ['pascoa', /p[aá]scoa/i],
  ['junino', /s[aã]o jo[aã]o|arrai[aá]|junin/i],
];
const OCCASION_TAGS = { natal: 'natal', pascoa: 'pascoa', junino: 'junino', halloween: 'halloween', casamento: 'casamento', bebe: 'bebe', formatura: 'formatura' };
/** Temas cuja ocasião não sai direto das tags. null = o tema não define ocasião (Dia das Mães, Réveillon). */
const THEME_OCCASION = { quinze: 'aniversario', chabebe: 'bebe', nuvens: 'bebe', batizado: 'bebe', maes: null, reveillon: null };

/** A ocasião de um tema pronto: 'infantil', 'natal', 'casamento'… ou null. */
export function themeOccasion(themeId) {
  if (!themeId) return null;
  if (themeId in THEME_OCCASION) return THEME_OCCASION[themeId];
  const t = tagsOf('tema', themeId);
  return ['natal', 'pascoa', 'junino', 'halloween', 'casamento', 'formatura', 'infantil', 'bebe', 'romantico'].find((x) => t.includes(x)) || null;
}

export function occasionOf(config) {
  const score = {};
  const add = (k, v) => (score[k] = (score[k] || 0) + v);
  const d = config.decor || {};
  const text = `${d.message || ''} ${d.topper?.text || ''} ${config.name || ''}`;
  OCCASION_WORDS.forEach(([k, re]) => re.test(text) && add(k, 3));
  const items = d.items || [];
  // um tema pronto diz a ocasião com todas as letras (enquanto as peças dele continuam no bolo)
  const theme = itemOf('tema', d.theme);
  const themeOc = theme && (theme.apply?.decor?.items || []).some((id) => items.includes(id)) ? themeOccasion(theme.id) : null;
  if (themeOc) add(themeOc, 4);
  if (items.includes('velas')) add('aniversario', 2);
  const age = Number(d.number) || 0;
  let kid = false;
  if (items.includes('velas') && d.candleStyle === 'numero' && age > 0 && age <= 12) kid = true;
  items.forEach((id) => {
    const t = tagsOf('decor', id);
    Object.entries(OCCASION_TAGS).forEach(([tag, oc]) => t.includes(tag) && add(oc, tag === 'casamento' || tag === 'bebe' ? 1 : 3));
    if (t.includes('romantico')) add('romantico', 1);
    if (t.includes('infantil')) add('infantil', 1);
  });
  if (config.shape === 'heart') add('romantico', 2);
  if (kid) add('infantil', 3);
  if ((config.tiers || 1) >= 2 && ['branco', 'creme'].includes(familyOf(config.covering.color))) add('casamento', 1.5);
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] < 2) return { id: null, score: 0, age };
  // "infantil" precisa de mais de um sinal (um enfeite divertido sozinho não faz a festa ser de criança)
  if (best[0] === 'infantil' && best[1] < 3) return { id: score.aniversario >= 2 ? 'aniversario' : null, score: score.aniversario || 0, age };
  return { id: best[0], score: best[1], age };
}

/* ───────── Bolso: trocas que barateiam sem perder a ideia ───────── */
export function savingsOf(config) {
  const base = priceOf(config);
  const out = [];
  const tryPatch = (code, rank, label, text, patch) => {
    if (!patchOk(config, patch)) return;
    const saving = Math.round((base - priceOf(applyPatch(config, patch))) * 100) / 100;
    if (saving >= 3) out.push({ code, rank, label, text, patch, saving });
  };
  const items = config.decor.items;
  items.forEach((id) => {
    const o = decorOptions(config, id);
    if (itemOf('decor', id)?.qty && o.qty === 'farto') tryPatch(`qtd:${id}`, 1, `${cap(nameOf('decor', id))} em quantidade média`, `${cap(nameOf('decor', id))} em quantidade média em vez de farta: o topo continua cheio.`, { decor: { opts: { [id]: { ...o, qty: 'medio' } } } });
  });
  const drip = config.drip;
  if (drip.on && drip.metal) tryPatch('calda.metal', 2, 'Calda sem o metálico', 'A calda na cor natural, sem o banho metálico: o escorrido continua lá.', { drip: { metal: false } });
  if (drip.on && drip.amount === 'farta') tryPatch('calda.farta', 2, 'Calda na quantidade média', 'Calda na quantidade média em vez de farta: ainda escorre em toda a volta.', { drip: { amount: 'media' } });
  const pip = itemOf('bico', config.piping.style);
  if (pip && pip.id !== 'liso' && config.piping.where === 'cobre') tryPatch('bico.lugar', 2, 'Bico só na borda do topo', `${cap(nameOf('bico', pip.id))} só na borda do topo, em vez do topo inteiro.`, { piping: { where: 'top' } });
  if (pip && pip.price >= 9) {
    const tags = tagsOf('bico', pip.id);
    const places = (id) => (typeof CAT.pipingPlaces === 'function' ? CAT.pipingPlaces(id) : ['top', 'base', 'both']);
    const alt = shopOf('bico')
      .filter((p) => p.id !== 'liso' && p.price < pip.price - 2 && !p.combo && (pip.combo || places(p.id).includes(config.piping.where)))
      .sort((a, b) => tagsOf('bico', b.id).filter((t) => tags.includes(t)).length - tagsOf('bico', a.id).filter((t) => tags.includes(t)).length || a.price - b.price)[0];
    if (alt) tryPatch('bico', 2, `Bico em ${nameOf('bico', alt.id)}`, `${cap(nameOf('bico', alt.id))} no lugar de ${nameOf('bico', pip.id)}: mantém o ar ${tagsOf('bico', alt.id).includes('vintage') && tags.includes('vintage') ? 'vintage' : 'caprichado'}.`, { piping: { style: alt.id } });
  }
  const fin = itemOf('estilo', config.covering.style);
  if (fin && fin.price >= 8) tryPatch('estilo', 3, 'Cobertura lisa', `Cobertura lisa no lugar de ${nameOf('estilo', fin.id)}: a cor continua a mesma.`, { covering: { style: 'liso' } });
  if (fin?.trim) {
    const cur = itemOf('confeito', config.covering.trim);
    const alt = cur && shopOf('confeito').filter((t) => t.id !== cur.id && t.price <= cur.price - 2).sort((a, b) => a.price - b.price)[0];
    if (alt) tryPatch('confeito', 3, `${cap(nameOf('estilo', fin.id))} de ${nameOf('confeito', alt.id)}`, `${cap(nameOf('confeito', alt.id))} no lugar de ${nameOf('confeito', cur.id)} no acabamento: o desenho é o mesmo.`, { covering: { trim: alt.id } });
  }
  const stand = itemOf('base', config.base);
  if (stand && stand.price >= 6 && itemOf('base', 'boleira')) tryPatch('base', 2, 'Base de boleira', `Boleira de porcelana (inclusa) no lugar de ${nameOf('base', stand.id)}.`, { base: 'boleira' });
  const soak = itemOf('molhar', config.soak);
  if (soak && soak.price >= 6) {
    const alt = shopOf('molhar').filter((x) => x.id !== soak.id && x.price <= soak.price - 3).sort((a, b) => a.price - b.price)[0];
    if (alt) tryPatch('molhar', 3, `Calda de molhar de ${nameOf('molhar', alt.id)}`, `Calda de ${nameOf('molhar', alt.id)} no lugar da de ${nameOf('molhar', soak.id)}: a massa fica úmida do mesmo jeito.`, { soak: alt.id });
  }
  config.fillings.forEach((id, index) => {
    const f = itemOf('recheio', id);
    if (!f) return;
    const tags = tagsOf('recheio', id).filter((t) => ['chocolate', 'frutado', 'citrico', 'caramelo', 'coco', 'castanhas', 'cremoso', 'cafe'].includes(t));
    const alt = shopOf('recheio')
      .filter((x) => x.id !== id && !config.fillings.includes(x.id) && x.price <= f.price - 3 && tagsOf('recheio', x.id).some((t) => tags.includes(t)))
      .sort((a, b) => pairOf(config.layers[index], b.id).score - pairOf(config.layers[index], a.id).score || a.price - b.price)
      .find((x) => pairOf(config.layers[index], x.id).score >= 1 && patchOk(config, { fillings: swapFilling(config, index, x.id) }));
    if (alt) tryPatch(`recheio:${index}`, 3, `Trocar ${nameOf('recheio', id)} por ${nameOf('recheio', alt.id)}`, `${cap(nameOf('recheio', alt.id))} no lugar de ${nameOf('recheio', id)}: o mesmo espírito, mais em conta.`, { fillings: swapFilling(config, index, alt.id) });
  });
  (config.fillAdds || []).forEach((id, index) => {
    if (!id || !itemOf('adicional', id)) return;
    tryPatch(`adicional:${index}`, 4, `Recheio sem ${nameOf('adicional', id)}`, `Sem ${nameOf('adicional', id)} no recheio: o sabor principal continua lá.`, { fillAdds: config.fillAdds.map((x, i) => (i === index ? '' : x)) });
  });
  if (config.decor.topper?.text && !config.decor.message) tryPatch('topo', 4, 'Plaquinha no lugar do topo', `O nome numa plaquinha em vez do topo recortado.`, { decor: { topper: { text: '' }, message: config.decor.topper.text, messageMode: 'placa' } });
  if (items.length >= 3) {
    const priciest = items
      .filter((id) => id !== 'velas')
      .map((id) => ({ id, v: base - priceOf(applyPatch(config, { decor: { items: items.filter((x) => x !== id) } })) }))
      .sort((a, b) => b.v - a.v)[0];
    if (priciest) tryPatch(`tirar:${priciest.id}`, 5, `Tirar ${nameOf('decor', priciest.id)}`, `Sem ${nameOf('decor', priciest.id)}, o bolo ainda fica com ${items.length - 1} enfeites.`, { decor: { items: items.filter((x) => x !== priciest.id) } });
  }
  if (config.layers.length >= 4) tryPatch('camada', 6, 'Uma camada a menos', 'Uma camada a menos: continua alto e bem recheado.', { layers: config.layers.slice(0, -1), fillings: config.fillings.slice(0, -1), fillAdds: (config.fillAdds || []).slice(0, -1) });
  const cover = itemOf('cobertura', config.covering.type);
  if (cover && cover.price >= 20 && !Array.isArray(config.tierCover)) {
    const alt = shopOf('cobertura').find((c) => c.id !== cover.id && c.price <= cover.price - 6 && tagsOf('cobertura', c.id).includes('firme') && !isHeatCover(c.id));
    if (alt) tryPatch('cobertura', 6, `${cap(nameOf('cobertura', alt.id))} no lugar da ${nameOf('cobertura', cover.id)}`, `${cap(nameOf('cobertura', alt.id))} bem liso no lugar da ${nameOf('cobertura', cover.id)}: firme do mesmo jeito.`, { covering: { type: alt.id } });
  }
  // primeiro o que menos muda a ideia (rank); no empate, o que mais economiza
  return out.sort((a, b) => a.rank - b.rank || b.saving - a.saving);
}

/* ───────── Nota da Bô (determinística) ───────── */
export function scoreOf(rawConfig) {
  const config = normalizeConfig(rawConfig);
  const s = scoreCore(config);
  // a sugestão da nota nunca pode piorar a nota: se a troca não ajuda, fica só o conselho
  if (s.sugestao?.action?.patch && scoreCore(applyPatch(config, s.sugestao.action.patch)).media < s.media) s.sugestao.action = null;
  return s;
}

function scoreCore(config) {
  const fr = flavorReport(config);
  const cr = colorReport(config);
  const br = balanceReport(config);
  const volcano = Boolean(CAT.isVolcano?.(config));

  let sabor = 3;
  let saborReason = fr.reason;
  if (fr.pairs.length) {
    const avg = fr.pairs.reduce((s, p) => s + p.score, 0) / fr.pairs.length;
    sabor = 3 + avg * 0.9 + (fr.goodDuo.length ? 0.5 : 0) - (fr.balance ? 1 : 0) - (fr.pairs.some((p) => p.risk) ? 0.5 : 0);
  } else if (volcano) {
    // no vulcão o par é a massa com o creme que transborda: contraste (cenoura com chocolate, chocolate com creme claro) vale mais
    const m = flav('massa', fr.main);
    const dark = ['chocolate', 'brigadeiro', 'ganache'].includes(config.covering.type);
    const contrast = dark ? !m.has('chocolate') || m.has('classico') : m.has('chocolate') || m.has('frutado') || m.has('coco') || isAcid(m);
    sabor = contrast ? 4.6 : 4;
    saborReason = contrast ? `massa de ${nameOf('massa', fr.main)} com ${nameOf('cobertura', config.covering.type)} transbordando é um par certeiro` : 'no vulcão, a massa e o creme que transborda se dão bem';
    if (config.soak) sabor += 0.2;
  }
  sabor = clamp(Math.round(sabor), 1, 5);

  const items = config.decor.items.length;
  // um tema pronto que continua no bolo amarra o visual (e explica as muitas cores de uma festa de criança)
  const theme = itemOf('tema', config.decor.theme);
  const themed = Boolean(theme) && (theme.apply?.decor?.items || []).filter((id) => config.decor.items.includes(id)).length >= 2;
  let visual = 3;
  if (['analoga', 'complementar', 'mono', 'acento', 'triade'].includes(cr.mood) || cr.pastel) visual += 1;
  else if (cr.mood === 'neutra') visual += 0.5;
  if (items >= 1 || pipingOn(config) || config.drip.on) visual += 0.5;
  if (cr.echo) visual += 0.5;
  if (themed) visual += 0.5;
  if (config.covering.style !== 'liso' && items <= 3) visual += 0.25;
  visual -= cr.issues.filter((i) => i.code !== 'muitas').length;
  if (cr.issues.some((i) => i.code === 'muitas') && !themed) visual -= 1;
  visual = clamp(Math.round(visual), 1, 5);
  const visualIssues = themed ? cr.issues.filter((i) => i.code !== 'muitas') : cr.issues;
  const visualReason = themed && !visualIssues.length ? `o tema ${low(theme.name)} amarra o visual` : cr.reason;

  let equilibrio = 4;
  if (br.empty) equilibrio = 3;
  else if (!br.crowded && !br.loaded && items >= 1 && items <= (themed ? 5 : 3) && (pipingOn(config) || config.drip.on || config.covering.style !== 'liso' || themed)) equilibrio = 5;
  if (br.crowded) equilibrio -= br.load > br.capacity + 1.2 ? 2 : 1;
  if (br.loaded) equilibrio -= 1;
  if (br.tall) equilibrio -= 0.5;
  if (br.heavyOnSoft) equilibrio -= 0.5;
  equilibrio -= Math.min(2, br.kitchen); // cada alerta de estrutura do confeiteiro tira uma estrela
  equilibrio = clamp(Math.round(equilibrio), 1, 5);

  const media = Math.round(((sabor + visual + equilibrio) / 3) * 10) / 10;
  const estrelas = clamp(Math.round(media), 1, 5);
  const parts = [
    { k: 'sabor', label: 'Sabor', v: sabor, reason: saborReason, issues: fr.issues },
    { k: 'visual', label: 'Visual', v: visual, reason: visualReason, issues: visualIssues },
    { k: 'equilibrio', label: 'Equilíbrio', v: equilibrio, reason: br.reason, issues: br.issues },
  ];
  const forte = [...parts].sort((a, b) => b.v - a.v)[0];
  const fraco = [...parts].sort((a, b) => a.v - b.v)[0];
  const issues = [...fr.issues, ...br.issues, ...visualIssues].sort((a, b) => b.weight - a.weight);
  const frase = `O ponto forte é o ${low(forte.label)}: ${forte.reason}.`;
  // sugestão: o problema da parte mais fraca; sem problema à vista, um caminho para ela crescer
  const HINT = {
    sabor: volcano
      ? config.soak
        ? 'No vulcão, uma cobertura que contraste com a massa faz o sabor crescer.'
        : 'No vulcão, uma calda de molhar deixa a massa ainda mais úmida.'
      : config.fillings.length
        ? 'Para o sabor crescer, um recheio de fruta ao lado de um cremoso dá contraste.'
        : 'Com mais uma camada entra um recheio, e o sabor ganha contraste.',
    visual: 'Para o visual crescer, repita uma cor da cobertura num bico ou num enfeite.',
    equilibrio: br.empty ? 'Um bico ou um enfeite já deixa o bolo mais completo.' : 'Para equilibrar, deixe um elemento ser a estrela e simplifique os outros.',
  };
  const weakIssue = [...fraco.issues].sort((a, b) => b.weight - a.weight)[0] || issues[0] || null;
  let sugestao = null;
  if (weakIssue) sugestao = { texto: weakIssue.text, action: weakIssue.action || null, code: weakIssue.code };
  else if (fraco.v <= 3 || estrelas < 5) sugestao = { texto: HINT[fraco.k], action: null, code: `dica.${fraco.k}` };
  return { sabor, visual, equilibrio, media, estrelas, frase, sugestao, forte: forte.k, fraco: fraco.k, parts: parts.map(({ k, label, v }) => ({ k, label, v })) };
}

/** Tudo o que a Bô tem a dizer sobre o bolo agora, do mais importante ao menos (para "Combina?" e para a revisão). */
export function findingsOf(config) {
  const fr = flavorReport(config);
  const cr = colorReport(config);
  const br = balanceReport(config);
  const issues = [...fr.issues, ...br.issues, ...cr.issues].sort((a, b) => b.weight - a.weight);
  const praise = [];
  if (fr.good.length || fr.goodDuo.length) praise.push({ k: 'sabor', text: cap(fr.reason) });
  if (!cr.issues.length && cr.mood !== 'livre') praise.push({ k: 'cor', text: cap(cr.reason) });
  if (!br.issues.length && !br.empty) praise.push({ k: 'equilibrio', text: cap(br.reason) });
  return { issues, praise, fr, cr, br };
}

/* ───────── Memória da sessão ───────── */
export function createMemory({ seed = 1, mode = 'importa', durations = null, returning = false } = {}) {
  return {
    seed: Number(seed) || 1,
    mode: MODES.includes(mode) ? mode : 'importa',
    durations, // { id: segundos } do manifesto de voz (opcional)
    returning,
    said: {}, // id → quando foi dita
    saidGroups: {}, // grupo → quantas vezes
    log: [], // [{ at, id, why }]
    lastStart: -1e9,
    busyUntil: -1e9,
    lastLight: false,
    offerUntil: 0,
    oc: null, // a última ocasião deduzida
    stepChanges: 0,
    lastEventAt: 0,
    startedAt: null,
    pending: null, // { ev, dueAt, until, priority }
    queue: [], // falas agendadas: [{ kind, dueAt }]
    recent: [], // instantes das mudanças recentes (rajada / concentração)
    burstUntil: 0,
    burstSeen: false,
    focusUntil: 0,
    steps: {}, // etapa → visitas
    step: null,
    stepAt: 0,
    tipGiven: {},
    idleSaid: 0,
    idleMark: 0,
    asleep: false,
    woke: false,
    flags: {}, // coisas que só se comentam uma vez
    counts: {}, // contadores (desfazer seguidos, vezes que perguntou…)
    price: null,
    prep: null,
    rules: {}, // códigos de regra já comentados
    lastPriceAt: -1e9,
    lastPraiseAt: -1e9,
    selfUntil: 0, // logo depois de uma ação da própria Bô, ela não comenta a mudança
    missed: null, // no modo mudo: a última coisa importante que ela teria dito
    noteHash: null,
    suggested: {},
    changes: 0,
    cool: {}, // chave → até quando ela não repete aquele tipo de comentário (gestos, peças à mão)
    rapido: false, // modo rápido da tela: só o que pede atenção
  };
}

const durMs = (id, mem) => {
  const d = mem.durations?.[id];
  return d ? Math.round(d * 1000) : 500 + (LINES[id]?.text.length || 40) * 62;
};

/** Escolhe uma fala ainda não dita nos grupos dados (em ordem de preferência). Sem sorteio: conta com a semente. */
export function pickLine(groups, mem, { repeat = false } = {}) {
  for (const g of groups) {
    const pool = POOLS[g];
    if (!pool) continue;
    const fresh = pool.filter((id) => !(id in mem.said));
    if (fresh.length) return fresh[hash32(`${mem.seed}|${g}|${pool.length - fresh.length}`) % fresh.length];
  }
  if (repeat) {
    for (const g of groups) {
      const pool = POOLS[g];
      if (pool) return [...pool].sort((a, b) => (mem.said[a] || 0) - (mem.said[b] || 0))[0];
    }
  }
  return null;
}

const optionGroups = (kind, id) => {
  const fam = KIND[kind]?.fam;
  return [`${kind}.${id}`, ...(fam ? tagsOf(kind, id).map((t) => `tag.${fam}.${t}`) : []), `tipo.${kind}`];
};

/* ───────── Candidatos: o que ela PODERIA dizer sobre um evento ───────── */
// Prioridade: 5 alerta (fura a fila) · 4 opinião que pede atenção · 3 opinião/momento · 2 reação comum · 1 conversa fiada
function cand(groups, priority, why, extra = {}) {
  return { groups: Array.isArray(groups) ? groups : [groups], priority, why, ...extra };
}

function issueCand(issue, priority, why) {
  return cand(issue.groups || issue.group, priority, why, { vars: {}, action: issue.action, detail: issue.text, once: issue.code });
}

function priceVars(config, price) {
  const pct = SITE.pix?.discountPct || 0;
  return {
    preco: brl(price),
    pct,
    pix: pct ? brl(price * (1 - pct / 100)) : '',
    limite: brl(SITE.shipping?.freeAbove || 0),
    regiao: SITE.region || '',
    fatias: servesText(config),
    dias: Math.round(prepHoursOf(config) / 24),
    diametro: diametersOf(config)[0],
    altura: heightCmOf(config),
  };
}

function colorCands(key, config, mem) {
  const out = [];
  const cr = colorReport(config);
  const forKey = { 'cover.color': ['bico.some', 'calda.some'], 'cover.type': ['bico.some', 'calda.some'], 'cover.color2': [], 'piping.color': ['bico.some'], 'piping.style': ['bico.some'], 'drip.color': ['calda.some'], 'drip.on': ['calda.some'] }[key] || [];
  cr.issues.filter((i) => forKey.includes(i.code)).forEach((i) => out.push(issueCand(i, 3.4, `cor: ${i.code}`)));
  if (cr.issues.some((i) => i.code === 'muitas')) out.push(cand('cor.muitas', 3, 'cor: muitas famílias de cor', { once: 'cor.muitas' }));
  if (!/color/.test(key)) return out;
  // relação da cor que acabou de mudar com a cobertura (ou da cobertura com o primeiro destaque)
  const roleOf = { 'cover.color': 'cobertura', 'cover.color2': 'cobertura2', 'piping.color': 'bico', 'drip.color': 'calda' }[key] || (key === 'decor.color' ? 'decor' : null);
  const changed = cr.palette.find((p) => p.role === roleOf || (roleOf === 'decor' && p.role.startsWith('decor:')));
  const other = cr.palette.find((p) => p !== changed && !NEUTRAL.has(familyOf(p.hex)));
  if (changed && other && !cr.issues.length) {
    const rel = relationOf(changed.hex, other.hex);
    if (cr.pastel && rel !== 'complementar') out.push(cand('cor.pastel', 3, 'cor: paleta pastel'));
    else if (['complementar', 'analoga', 'triade', 'mono'].includes(rel)) out.push(cand(`cor.${rel}`, 3, `cor: ${rel} (${familyOf(changed.hex)} × ${familyOf(other.hex)})`));
  }
  if (key === 'decor.color' && cr.echo) out.push(cand('cor.repete', 3, 'cor: enfeite repete uma cor do bolo', { once: 'cor.repete' }));
  if (key === 'cover.color') {
    const hex = config.covering.color;
    const custom = !(CAT.COLORS || []).some((c) => c.hex === hex);
    if (custom) out.push(cand('cor.livre', 2.2, 'cor personalizada', { once: 'cor.livre' }));
    out.push(cand(`cor.fam.${familyOf(hex)}`, 2.1, `cor da cobertura: ${familyOf(hex)}`));
    if (cr.dark && !mem.flags['cor.escuro']) out.push(cand('cor.escuro', 2.3, 'cobertura escura', { once: 'cor.escuro' }));
    if (['branco', 'creme'].includes(familyOf(hex)) && !config.decor.items.length) out.push(cand('cor.claro', 2.3, 'cobertura clara, sem enfeites ainda', { once: 'cor.claro' }));
  }
  out.push(cand('tipo.cor', 1.5, 'trocou uma cor'));
  return out;
}

function flavorCands(kind, value, config, mem) {
  const out = [];
  const id = value?.id;
  const index = Number(value?.index) || 0;
  const fr = flavorReport(config);
  // 1) excesso (doce, ácido, intenso): uma vez por tipo
  fr.issues.filter((i) => !i.code.startsWith('par:')).forEach((i) => out.push(issueCand(i, 4, `sabor: ${i.code} (doçura ${fr.sweet})`)));
  // 2) par arriscado que envolve o que acabou de mudar
  fr.pairs
    .filter((p) => p.risk && (kind === 'massa' ? p.massa === id : p.recheio === id))
    .forEach((p) => {
      const issue = fr.issues.find((i) => i.code === `par:${p.key}`);
      if (issue) out.push(issueCand(issue, 4.1, `sabor: par arriscado ${p.key}`));
    });
  // 3) par certeiro
  const pairs = kind === 'massa' ? fr.pairs.filter((p) => p.massa === id) : fr.pairs.filter((p) => p.recheio === id && p.index === index);
  pairs.filter((p) => !p.risk && p.group && p.score >= 1).forEach((p) => out.push(cand(p.group, p.score >= 2 ? 3.3 : 3, `sabor: par ${p.key} (${p.score > 0 ? '+' : ''}${p.score})`)));
  // 4) dupla de recheios
  if (kind === 'recheio') {
    fr.duos.filter((d) => (d.a === id || d.b === id) && d.group).forEach((d) => out.push(cand(d.group, d.score >= 2 ? 3.2 : 2.6, `sabor: dupla de recheios ${d.key}`)));
    if (config.fillings.length >= 2 && config.fillings.every((f) => f === id)) out.push(cand('duo.iguais', 2.4, 'mesmo recheio em todas as camadas', { once: 'duo.iguais' }));
  }
  if (kind === 'massa' && fr.mixed) out.push(cand('combo.camadas', 3, 'massas diferentes entre as camadas', { once: 'combo.camadas' }));
  // 5) a fala da opção
  out.push(cand(optionGroups(kind, id), 2, `${kind}: ${id}`));
  return out;
}

function changeCands(ev, ctx, mem) {
  const config = ctx.config;
  const { key } = ev;
  const v = ev.value;
  const id = v && typeof v === 'object' ? v.id : v;
  const out = [];
  switch (key) {
    case 'shape':
      out.push(cand(optionGroups('formato', id), 2, `formato: ${id}`));
      break;
    case 'size':
      out.push(cand(optionGroups('tamanho', id), 2, `tamanho: ${id}`));
      break;
    case 'tiers':
      out.push(cand(`andares.${id}`, 3, `andares: ${id}`));
      if (Number(id) >= 2) out.push(cand('torre', 2.5, 'bolo de andares: sustentação', { once: 'torre' }));
      break;
    case 'height':
      out.push(cand(`altura.${id}`, 2, `altura: ${id}`));
      break;
    case 'base':
      out.push(cand(optionGroups('base', id), 2, `base: ${id}`));
      break;
    case 'layer.add':
      out.push(cand('camada.mais', 2, 'mais uma camada'));
      break;
    case 'layer.remove':
      out.push(config.layers.length === 1 ? cand('camada.unica', 3, 'ficou uma camada só') : cand('camada.menos', 2, 'uma camada a menos'));
      break;
    case 'layer.flavor':
      out.push(...flavorCands('massa', v, config, mem));
      break;
    case 'filling':
      out.push(...flavorCands('recheio', v, config, mem));
      break;
    case 'cover.type':
      out.push(...colorCands(key, config, mem));
      out.push(cand(optionGroups('cobertura', id), 2, `cobertura: ${id}`));
      break;
    case 'cover.style':
      out.push(cand(optionGroups('estilo', id), 2, `estilo: ${id}`));
      break;
    case 'cover.tier':
      out.push(cand('tipo.cobertura', 1.5, 'cobertura por andar'));
      break;
    case 'cover.color':
    case 'cover.color2':
    case 'drip.color':
    case 'piping.color':
    case 'decor.color':
      out.push(...colorCands(key, config, mem));
      break;
    case 'message.color':
    case 'topper.color':
      out.push(cand('tipo.cor', 1.5, 'trocou uma cor'));
      break;
    case 'drip.on':
      if (v) {
        out.push(...colorCands(key, config, mem));
        out.push(cand('calda.on', 2, 'ligou a calda'));
      } else out.push(cand('calda.off', 1.5, 'tirou a calda'));
      break;
    case 'piping.style':
      out.push(...colorCands(key, config, mem));
      out.push(cand(optionGroups('bico', id), 2, `bico: ${id}`));
      break;
    case 'piping.where':
      out.push(cand(`onde.${id}`, ['cintura', 'cobre'].includes(id) ? 2 : 1.5, `bico: ${id}`));
      break;
    case 'filling.add':
      out.push(id ? cand(optionGroups('adicional', id), 2, `adicional do recheio: ${id}`) : cand('adicional.tirou', 1.5, 'tirou o adicional do recheio'));
      break;
    case 'soak':
      out.push(id ? cand(optionGroups('molhar', id), 2, `calda de molhar: ${id}`) : cand('molhar.tirou', 1.5, 'tirou a calda de molhar'));
      break;
    case 'cover.trim':
      // o confeito só aparece quando o estilo usa um (barrado, confeitos subindo, fault line)
      if (itemOf('estilo', config.covering.style)?.trim) out.push(cand(optionGroups('confeito', id), 2, `confeito do acabamento: ${id}`));
      break;
    case 'drip.amount':
      if (config.drip.on) out.push(cand(`calda.qtd.${id}`, 2, `calda: quantidade ${id}`));
      break;
    case 'drip.length':
      if (config.drip.on) out.push(cand(`calda.comprimento.${id}`, 2, `calda: comprimento ${id}`));
      break;
    case 'drip.half':
      if (config.drip.on) out.push(v ? cand('calda.meialua', 2, 'calda em meia-lua') : cand('calda.volta', 1.5, 'calda na volta inteira'));
      break;
    case 'drip.metal':
      if (config.drip.on) out.push(v ? cand('calda.metal', 2.5, 'calda metálica') : cand('calda.metal.off', 1.5, 'calda sem o metálico'));
      break;
    // chá revelação: a cor é segredo (no barramento vem 'segredo'); ela comenta o mistério, nunca a cor
    case 'reveal.on':
      out.push(v ? cand('revelacao.on', 3.2, 'ligou o chá revelação') : cand('revelacao.off', 1.5, 'desligou o chá revelação'));
      break;
    case 'reveal.color':
      if (config.reveal?.on && !cooling(mem, 'revelacao.cor', ev.at)) out.push(cand('revelacao.cor', 2.5, 'escolheu a cor do chá revelação (em segredo)', { cool: ['revelacao.cor', 60000] }));
      break;
    case 'decor.theme':
      if (id) out.push(cand(optionGroups('tema', id), 4, `tema pronto: ${id}`, { flag: `tema.${themeOccasion(id) || id}` }));
      break;
    case 'decor.kind':
      out.push(cand('enfeite.modelo', 1.5, 'trocou o modelo de um enfeite'));
      break;
    case 'decor.candlePalette':
      out.push(cand('tipo.cor', 1.5, 'trocou as cores das velas'));
      break;
    case 'decor.placed': {
      // peças colocadas à mão, uma a uma (o gesto 'place' do ateliê avisa a mesma coisa: vale um comentário só)
      const before = Array.isArray(ev.prev) ? ev.prev.length : null;
      const after = Array.isArray(v) ? v.length : (config.decor.placed || []).length;
      if (before == null || before === after) break;
      if (after > before) out.push(...placedCands({ ok: true, n: after }, ev.at, mem));
      else if (!cooling(mem, 'mao.tirou', ev.at)) out.push(cand('mao.tirou', 1.5, 'tirou uma peça colocada à mão', { cool: ['mao.tirou', 30000] }));
      break;
    }
    case 'decor.add': {
      const max = CAT.MAX_DECORS || 5;
      if (config.decor.items.length >= max) out.push(cand('decor.max', 3, 'limite de enfeites', { once: 'decor.max' }));
      out.push(cand(optionGroups('decor', id), 2, `decoração: ${id}`));
      break;
    }
    case 'decor.remove':
      out.push(cand('tipo.decor.tirou', 1.5, 'tirou um enfeite'));
      break;
    case 'decor.clear':
      out.push(cand('tipo.decor.limpou', 2, 'limpou a decoração'));
      break;
    case 'decor.arr':
      out.push(cand([`arranjo.${v?.arr || v?.value || ''}`, 'tipo.arranjo'], 2, `arranjo: ${v?.arr || ''}`));
      break;
    case 'decor.qty':
      out.push(cand(`qtd.${v?.qty || v?.value || ''}`, 2, `quantidade: ${v?.qty || ''}`));
      break;
    case 'candles.count':
      out.push(cand('velas.qtd', 1.5, 'quantidade de velas'));
      break;
    case 'candles.style':
      out.push(cand(`vela.${id}`, 2, `velas: ${id}`));
      break;
    case 'candles.number':
      if (String(id || '').length) out.push(cand('velas.numero', 2, 'idade na vela', { once: 'velas.numero' }));
      break;
    case 'message.text':
      if (!config.decor.message) out.push(cand('mensagem.tirou', 1.5, 'tirou a mensagem'));
      else out.push(cand(`mensagem.${config.decor.messageMode === 'bico' ? 'bico' : 'placa'}`, 3, 'escreveu uma mensagem'));
      break;
    case 'message.mode':
      if (id === 'bico' && config.decor.messageMode !== 'bico') out.push(cand('escrita.naocabe', 4, 'a escrita com bico não cabe neste topo'));
      else if (config.decor.message) out.push(cand(`mensagem.${id === 'bico' ? 'bico' : 'placa'}`, 2, `mensagem: ${id}`));
      break;
    case 'topper.text':
      if (config.decor.topper?.text) out.push(cand('topo.nome', 2.5, 'topo personalizado'));
      break;
    case 'name':
      if (config.name) out.push(cand('nome', 2, 'deu nome ao bolo', { once: 'nome' }));
      break;
    case 'backdrop':
      out.push(cand('fundo', 1.5, 'trocou o fundo'));
      break;
    case 'preset':
      // quem já chegou por uma inspiração acabou de ouvir sobre ela na boas-vindas
      if (!(['inspiracao', 'produto'].includes(mem.openSource) && ev.at - mem.startedAt < 20000)) out.push(cand('preset', 3, 'escolheu uma inspiração'));
      break;
    case 'surprise':
      out.push(cand('surpresa.tela', 3, 'surpreenda-me da tela'));
      break;
    case 'palette':
      out.push(cand('paleta', 3, 'aplicou uma paleta'));
      break;
    case 'undo': {
      const n = mem.counts.undo || 1;
      if (n === 3) out.push(cand('incentivo', 3, 'três desfazer seguidos: incentivo'));
      else out.push(cand('desfazer', n <= 1 ? 2 : 1.5, 'desfez'));
      break;
    }
    case 'redo':
      out.push(cand('refazer', 1.5, 'refez'));
      break;
    case 'restart':
      out.push(cand('recomecar', 3, 'recomeçou'));
      break;
    default:
      if (/^decor\.placed\.\d+/.test(String(key))) out.push(...placedCands({ ok: true, moved: true }, ev.at, mem));
      return out; // chave desconhecida: ignora
  }
  return out;
}

const cooling = (mem, key, at) => (mem.cool?.[key] || 0) > at;

/** Peça colocada à mão: colocou, mudou de lugar, não coube, chegou ao limite. Raro de propósito (não a cada toque). */
function placedCands(v, at, mem) {
  if (v.ok === false) return cooling(mem, 'mao.naocoube', at) ? [] : [cand('mao.naocoube', 3.2, 'a peça não coube onde a pessoa tocou', { cool: ['mao.naocoube', 25000] })];
  if (v.moved) return [cand('mao.moveu', 2, 'mudou de lugar uma peça colocada à mão', { once: 'mao.moveu' })];
  if (Number(v.n) >= (CAT.MAX_PLACED || 24)) return [cand('mao.cheio', 3, 'limite de peças colocadas à mão', { once: 'mao.cheio' })];
  if (cooling(mem, 'mao.colocou', at)) return [];
  return [cand('mao.colocou', mem.flags['gesto.place'] ? 2 : 3, 'colocou uma peça à mão', { flag: 'gesto.place', cool: ['mao.colocou', 40000] })];
}

/** Gestos do ateliê ({ id, phase, value }): só o fim do gesto conta, e cada um descansa um bom tempo antes de repetir. */
function gestureCands(ev, mem) {
  if (ev.phase !== 'end') return [];
  const at = ev.at;
  const v = ev.value;
  const rare = (group, key, ms, why) => (cooling(mem, key, at) ? [] : [cand(group, mem.flags[key] ? 2 : 3, why, { flag: key, cool: [key, ms] })]);
  switch (ev.id) {
    case 'spread':
      return v === false ? [] : rare('gesto.spread', 'gesto.spread', 90000, 'espalhou a cobertura girando o prato');
    case 'place':
      return placedCands(isObj(v) ? v : { ok: v !== false }, at, mem);
    case 'drip':
      return rare('gesto.drip', 'gesto.drip', 90000, 'pingou a calda com o dedo');
    case 'light':
      return rare('gesto.light', 'gesto.light', 60000, 'acendeu as velas');
    case 'blow':
      return rare('gesto.blow', 'gesto.blow', 60000, 'soprou as velas');
    case 'spin':
      return v === 'auto' ? [] : [cand('gesto.spin', 2, 'girou o bolo com o dedo', { once: 'gesto.spin' })];
    default:
      return [];
  }
}

/** Momentos do ateliê: a revelação do bolo pronto, foto / vídeo / cartão e a troca de modo. */
function momentCands(ev, mem) {
  const at = ev.at;
  if (ev.type === 'reveal') {
    if (ev.skipped) return [];
    switch (ev.phase) {
      case 'start':
        return cooling(mem, 'momento.revelar', at) ? [] : [cand('momento.revelar', 4, 'revelação do bolo: começou', { cool: ['momento.revelar', 30000] })];
      case 'candles':
        return [cand('momento.velas', 3, 'revelação: velas acesas', { cool: ['momento.velas', 30000] })];
      case 'blown':
        return [cand('momento.sopro', 3.5, 'revelação: velas sopradas', { cool: ['momento.sopro', 30000] })];
      case 'end':
        return cooling(mem, 'momento.fim', at) ? [] : [cand('momento.fim', 3.5, 'revelação: terminou', { cool: ['momento.fim', 60000] })];
      default:
        return [];
    }
  }
  if (ev.type === 'photo') {
    const group = { foto: 'foto', video: 'foto.video', cartao: 'foto.cartao' }[ev.kind];
    return group ? [cand(group, 3, `registro: ${ev.kind}`)] : [];
  }
  if (ev.type === 'mode') {
    if (ev.mode === 'rapido') return [cand('modo.rapido', 4, 'foi para o modo rápido', { once: 'modo.rapido' })];
    return ev.mode === 'atelie' && mem.flags['modo.rapido'] ? [cand('modo.atelie', 3, 'voltou ao modo ateliê', { cool: ['modo.atelie', 120000] })] : [];
  }
  /** O que a cozinha corrigiu sozinha ({ fixed: [{ code, text }] }): ela explica com a fala do código, sem bronca. */
  if (ev.type === 'rule') {
    const fixed = (Array.isArray(ev.fixed) ? ev.fixed : []).filter((r) => r && r.code && !mem.rules[r.code]);
    // a fala do código vale a pena; a genérica só sai se não houver nada melhor a dizer (a tela já mostra o aviso)
    // r5-qa: quando a cozinha corrige mais de uma coisa de uma vez (vulcão: tira o bico E leva as peças da lateral
    // para o topo), ela explica a que tem fala própria — antes pegava sempre a primeira da lista e, se essa não
    // tinha fala, ficava calada sobre as outras.
    const pick = fixed.find((r) => POOLS[`regra.${r.code}`]) || fixed[0];
    return (pick ? [pick] : []).map((r) => cand([`regra.${r.code}`, 'regra.corrigiu'], POOLS[`regra.${r.code}`] ? 4 : 2.2, `a cozinha corrigiu: ${r.code}`, { rule: r.code, mood: 'pensando' }));
  }
  return [];
}

/** O que vale para QUALQUER mudança: regras do confeiteiro, equilíbrio, ocasião, prazo, bolso, elogio. */
function crossCands(ev, ctx, mem) {
  const config = ctx.config;
  const out = [];
  const now = ev.at;
  // regras do confeiteiro (js/customizer/rules.js, se existir)
  // (a fala é a do código, quando existe — regra.vulcao-lateral… —, ou a do nível; o balão leva o texto da regra)
  // Só entra o que APARECEU com esta mudança: o que o bolo já trazia antes não vira assunto do nada. E um alerta de
  // cada vez: se ela acabou de dar um, o próximo espera a vez em lugar de atropelar o balão (e o botão) do primeiro.
  const justWarned = now - (mem.ruleAt ?? -1e9) < TIMING.gap;
  ctxRules(ctx).forEach((r) => {
    if (mem.rules[r.code] || (mem.ruleCodes || []).includes(r.code)) return;
    const p = r.level === 'bloqueia' ? 5 : r.level === 'alerta' ? 4.5 : 2.5;
    const text = semMarca(typeof r.fix === 'string' ? `${r.text} ${r.fix}` : r.text);
    out.push(cand([`regra.${r.code}`, `regra.${r.level}`], p, `regra do confeiteiro: ${r.code}`, { detail: text, action: ruleAction(config, r), rule: r.code, force: p >= 5 || (p >= 4.5 && !justWarned), mood: p >= 4.5 ? 'preocupada' : null }));
  });
  const br = balanceReport(config);
  if (br.crowded && /^decor\.(add|qty|arr)$|^size$|^tiers$/.test(ev.key)) out.push(issueCand(br.issues.find((i) => i.code === 'topo.lotado'), 4, `equilíbrio: topo lotado (${br.load} > ${br.capacity})`));
  if (br.heavyOnSoft && (ev.key === 'cover.type' || (/^decor\.(add|qty)$/.test(ev.key) && HEAVY.has(ev.value?.id)))) out.push(issueCand(br.issues.find((i) => i.code === 'peso.delicado'), 3.4, 'enfeite pesado em cobertura delicada'));
  if (br.loaded && !br.crowded && /^decor\.add$|^piping\.style$|^drip\.on$|^cover\.style$/.test(ev.key)) out.push(cand('disputa', 3.2, 'muita informação junta', { once: 'disputa', detail: br.issues.find((i) => i.code === 'disputa')?.text }));
  if (br.tall && /^layer\.add$|^height$|^size$/.test(ev.key)) out.push(cand('alto.estreito', 3, 'alto e estreito', { once: 'alto.estreito' }));
  if (br.empty && /^decor\.(remove|clear)$|^piping\.style$|^drip\.on$|^cover\.style$/.test(ev.key)) out.push(cand('simples', 2.4, 'bolo liso, sem enfeites', { once: 'simples' }));
  if (ev.key === 'cover.type' && isHeatCover(config.covering.type) && !mem.rules['calor-cobertura']) out.push(cand('calor', 2.4, 'cobertura que sofre no calor: dica da geladeira', { once: 'calor' }));

  // ocasião: comenta uma vez quando fica clara
  const oc = occasionOf(config);
  const ocNew = oc.id && oc.score >= 3 && (mem.oc?.id !== oc.id || (mem.oc?.score || 0) < 3);
  if (ocNew && /^decor\.|^message\.|^topper\.|^shape$|^candles\./.test(ev.key) && POOLS[`elogio.tema.${oc.id}`]) out.push(cand(`elogio.tema.${oc.id}`, 3.1, `ocasião deduzida: ${oc.id} (${oc.score})`, { once: `tema.${oc.id}` }));

  // prazo
  const prep = prepHoursOf(config);
  if (mem.prep != null && prep > mem.prep) out.push(cand(prep >= 96 && (config.tiers || 1) >= 3 ? ['prazo.andares', 'prazo.mais'] : 'prazo.mais', 3.6, `prazo: de ${mem.prep} h para ${prep} h`, { once: `prazo.${prep}` }));
  else if (mem.prep != null && prep < mem.prep) out.push(cand('prazo.menos', 2, `prazo: de ${mem.prep} h para ${prep} h`, { once: `prazo.menos.${prep}` }));

  // bolso
  const price = ev.price ?? priceOf(config);
  const prev = ev.prevPrice ?? mem.price;
  if (prev != null && ev.by === 'user') {
    const delta = Math.round((price - prev) * 100) / 100;
    const free = SITE.shipping?.freeAbove || 0;
    if (free && prev < free && price >= free) out.push(cand('preco.frete', 3.2, `passou de ${brl(free)}: entrega grátis`, { once: 'preco.frete' }));
    const quiet = now - mem.lastPriceAt >= TIMING.priceEvery && (mem.counts.price || 0) < 4;
    const expected = /^size$|^tiers$|^shape$/.test(ev.key); // mexer na estrutura muda o preço: a pessoa já espera
    if (quiet && delta >= Math.max(45, prev * 0.3)) out.push(cand('preco.pesa.muito', expected ? 1.9 : 3.8, `preço: +${brl(delta)} (${Math.round((delta / prev) * 100)}%)`, { vars: { delta: brl(delta) }, price: true, action: { label: 'Deixar mais em conta', ask: 'economizar' } }));
    else if (quiet && delta >= Math.max(18, prev * 0.12) && !expected) out.push(cand('preco.pesa', 3.1, `preço: +${brl(delta)}`, { vars: { delta: brl(delta) }, price: true }));
    else if (quiet && delta <= -Math.max(15, prev * 0.1) && !expected) out.push(cand('preco.baixou', 2.2, `preço: −${brl(-delta)}`, { vars: { delta: brl(-delta) }, price: true }));
  }
  return out.filter(Boolean);
}

/** As regras do confeiteiro que a TELA entregou (ctx.rules = rulesOf de js/customizer/rules.js). Sem ela, nenhuma. */
function ctxRules(ctx) {
  if (typeof ctx.rules !== 'function') return [];
  try {
    const r = ctx.rules(ctx.config);
    return Array.isArray(r) ? r.filter((x) => x && x.code && x.text) : [];
  } catch {
    return [];
  }
}

function toolCands(ev, ctx, mem) {
  const first = (k) => !mem.flags[`tool.${k}`];
  switch (ev.id) {
    case 'cutaway':
      return ev.value === false ? [cand('corte.off', 1.5, 'fechou o corte')] : [cand('corte.on', first('cutaway') ? 3 : 2, 'ver por dentro', { flag: 'tool.cutaway' })];
    case 'rotate':
      return ev.value === false ? [] : [cand('girar', 1.5, 'giro automático', { once: 'girar' })];
    case 'view':
      return [cand('vista', 1.5, 'trocou a vista', { once: 'vista' })];
    case 'measure':
      return ev.value === false ? [] : [cand('medir', 2.5, 'medidas')];
    case 'photo':
      return [cand('foto', 3, 'tirou foto')];
    case 'share':
      return [cand('compartilhar', 2.5, 'compartilhou')];
    case 'download':
      return [cand('baixar', 2.5, 'baixou a imagem')];
    case 'save':
      return [cand('salvar', 3, 'salvou o bolo')];
    case 'breakdown':
      return ev.value === false ? [] : [cand('preco.detalhe', 2.2, 'abriu o detalhe do preço', { once: 'preco.detalhe' })];
    case 'ficha':
      return [cand('ficha', 2.5, 'abriu a ficha de produção', { once: 'ficha' })];
    case 'link':
      return [cand('link', 2.5, 'copiou o link do bolo')];
    case 'reveal':
      // o corte que mostra a cor do chá revelação: ela comemora o momento, sem dizer a cor
      return ev.value === false ? [] : [cand('revelacao.corte', 3.5, 'revelou a cor no corte')];
    default:
      return [];
  }
}

/* ───────── Do candidato à fala ───────── */
function build(c, ctx, mem, { repeat = false } = {}) {
  if (!c) return null;
  if (c.once && mem.flags[c.once] && !repeat) return null;
  const id = pickLine(c.groups, mem, { repeat });
  if (!id) return null;
  const line = LINES[id];
  const price = ctx.price ?? priceOf(ctx.config);
  const vars = { ...priceVars(ctx.config, price), ...(c.vars || {}) };
  let text = showText(id, vars);
  // rede de segurança: botão que não muda nada, que a cozinha não faz ou que traz opção fora de venda não aparece
  const actions = (c.actions || (c.action ? [c.action] : []))
    .filter((a) => a && a.label && (a.patch ? patchOk(ctx.config, a.patch) : a.step || a.ask))
    .slice(0, 2);
  // o balão é a legenda da fala; o detalhe (com nomes e números) entra quando não há botão que já diga o mesmo
  if (c.detail && !line.show) text = c.rule ? c.detail : actions.length ? text : `${text} ${c.detail}`.trim();
  return {
    id,
    group: line.group,
    text,
    speech: line.text,
    mood: c.mood || line.mood,
    priority: c.priority,
    why: c.why,
    action: actions[0] || null,
    actions,
    force: Boolean(c.force),
    stars: c.stars || null,
    _c: c,
  };
}

function gate(d, mem, now) {
  if (!d) return false;
  if (mem.mode === 'muda') {
    if (d.priority >= 4) mem.missed = d;
    return false;
  }
  if (d.force) return true;
  if (mem.rapido && d.priority < 3.5) return false; // modo rápido: só o que pede atenção
  if (now < mem.busyUntil) return false;
  if (now < mem.burstUntil) return false;
  if (now < mem.focusUntil && d.priority < 4) return false;
  const light = mem.lastLight; // a fala anterior foi só o anúncio de uma etapa
  if (now - mem.lastStart < (light ? TIMING.gapLight : mem.mode === 'falante' ? TIMING.gapFalante : TIMING.gap)) return false;
  if (d.priority >= 4) return true;
  if (now < mem.offerUntil) return false; // há uma sugestão com botão no balão: não a atropela
  const quiet = now - mem.busyUntil;
  if (mem.mode === 'falante') return d.priority >= 2 || quiet >= TIMING.quietP2;
  // "só quando importa": além do intervalo, um teto de falas por trecho da sessão
  if (mem.log.filter((l) => !l.force && now - l.at < TIMING.densityWindow).length >= TIMING.densityMax) return false;
  if (d.priority >= 3) return true;
  if (d.priority >= 2) return quiet >= (light ? 1000 : TIMING.quietP2);
  return Boolean(d._c?.idle) && quiet >= TIMING.quietP1;
}

function commit(d, mem, now) {
  const c = d._c || {};
  mem.said[d.id] = now;
  mem.saidGroups[d.group] = (mem.saidGroups[d.group] || 0) + 1;
  mem.lastStart = now;
  mem.busyUntil = now + durMs(d.id, mem);
  mem.log.push({ at: now, id: d.id, why: d.why, priority: d.priority, force: Boolean(d.force) });
  mem.lastLight = Boolean(c.light);
  mem.offerUntil = d.actions?.length ? now + TIMING.offerHold : 0;
  if (d.noteKey != null) mem.noteHash = d.noteKey;
  if (c.once) mem.flags[c.once] = true;
  if (c.flag) mem.flags[c.flag] = true;
  if (c.cool) mem.cool[c.cool[0]] = now + c.cool[1];
  if (c.rule) {
    mem.rules[c.rule] = true;
    mem.ruleAt = now;
  }
  if (c.price) {
    mem.lastPriceAt = now;
    mem.counts.price = (mem.counts.price || 0) + 1;
  }
  if (c.praise) mem.lastPraiseAt = now;
  if (c.tip) mem.tipGiven[c.tip] = true;
  if (c.idle) {
    mem.idleSaid += 1;
    mem.idleMark = now;
  }
  mem.missed = null;
  const { _c, ...pub } = d;
  return pub;
}

/** Entre vários candidatos, o primeiro (por prioridade) que tem fala nova e passa pelo ritmo. */
function choose(cands, ctx, mem, now, { defer = true } = {}) {
  const sorted = cands.filter(Boolean).sort((a, b) => b.priority - a.priority);
  let waiting = null;
  for (const c of sorted) {
    const d = build(c, ctx, mem);
    if (!d) continue;
    if (gate(d, mem, now)) return { say: commit(d, mem, now) };
    if (!waiting && d.priority >= 2 && mem.mode !== 'muda') waiting = d;
  }
  return { wait: defer ? waiting : null };
}

function candsFor(ev, ctx, mem) {
  if (ev.type === 'change') return [...changeCands(ev, ctx, mem), ...crossCands(ev, ctx, mem).filter((c) => !(MACHINE.has(ev.key) || ev.key === THEME_KEY) || c.rule)];
  if (ev.type === 'tool') return toolCands(ev, ctx, mem);
  if (ev.type === 'gesture') return gestureCands(ev, mem);
  if (ev.type === 'reveal' || ev.type === 'photo' || ev.type === 'mode' || ev.type === 'rule') return momentCands(ev, mem);
  if (ev.type === 'step') {
    const visits = mem.steps[ev.id] || 0;
    return visits <= 1 ? [cand(`etapa.${ev.id}.abre`, 3, `abriu a etapa ${ev.id}`, { light: true })] : [cand(`etapa.${ev.id}.dica`, 2, `voltou à etapa ${ev.id}`, { tip: ev.id })];
  }
  if (ev.type === 'fit') {
    const dropped = Array.isArray(ev.dropped) ? ev.dropped : [];
    if (dropped.length) {
      const names = joinPt(dropped.map((id) => (id === 'escrita' ? 'a mensagem escrita' : nameOf('decor', id))));
      const sizes = CAT.SIZES || [];
      const next = sizes[sizes.findIndex((s) => s.id === ctx.config.size) + 1];
      return [cand('naocoube', 5, `não coube: ${dropped.join(', ')}`, { vars: { nomes: names }, force: true, action: next && (ctx.config.tiers || 1) === 1 ? { label: `Aumentar para ${next.label}`, patch: { size: next.id } } : null })];
    }
    return ev.adapted ? [cand('adaptado', 1.5, 'o distribuidor reorganizou os enfeites', { once: 'adaptado' })] : [];
  }
  return [];
}

const settleOf = (ev) => {
  if (ev.type !== 'change') return TIMING.settle;
  if (/text$|^name$|number$/.test(ev.key)) return TIMING.settleText;
  if (/color|count/.test(ev.key)) return TIMING.settleColor;
  if (/^layer\.flavor$|^filling$/.test(ev.key)) return TIMING.settleFlavor;
  return TIMING.settle;
};

const MACHINE = new Set(['preset', 'surprise', 'palette', 'undo', 'redo', 'restart']);
/** Um tema pronto troca cor, bico e enfeites de uma vez: chega como várias mudanças no mesmo instante, e esta por último. */
const THEME_KEY = 'decor.theme';
/** Eventos do barramento que a Bô acompanha (o resto — marcas de som, eventos do jogo… — nem mexe na memória dela). */
export const EVENTS = new Set(['open', 'close', 'step', 'change', 'fit', 'tool', 'cart', 'tick', 'nudge', 'gesture', 'reveal', 'photo', 'mode', 'rule']);

function noteChange(ev, mem) {
  const now = ev.at;
  mem.changes += 1;
  mem.stepChanges = (mem.stepChanges || 0) + 1;
  if (/text$|^name$|number$/.test(ev.key)) return; // digitando: não é rajada, só espera a pessoa parar
  mem.recent.push(now);
  mem.recent = mem.recent.filter((t) => now - t <= TIMING.focusWindow);
  const burst = mem.recent.filter((t) => now - t <= TIMING.burstWindow).length;
  if (burst >= TIMING.burstCount) {
    if (now >= mem.burstUntil) mem.burstAt = now; // quando esta rajada começou
    mem.burstUntil = now + TIMING.burstWindow;
    mem.burstSeen = true;
    mem.pending = null;
  }
  if (mem.recent.length >= TIMING.focusCount) {
    if (now >= mem.focusUntil) mem.focusAt = now;
    mem.focusUntil = now + TIMING.focusHold;
  }
}

function greeting(ev, mem) {
  const src = ev.source || 'novo';
  const map = { rascunho: 'ola.rascunho', salvo: 'ola.salvo', edicao: 'ola.edicao', inspiracao: 'ola.inspiracao', produto: 'ola.produto', desafio: 'ola.desafio' };
  const groups = map[src] ? [map[src]] : [];
  groups.push(mem.returning ? 'ola.retorno' : 'ola.novo');
  return cand(groups, 5, `abriu o ateliê (${src}${mem.returning ? ', de volta' : ', primeira vez'})`, { force: true });
}

/** O jeitão do bolo, para o elogio: clássico (sabores de sempre, cores calmas) ou ousado (par incomum, cores opostas). */
function characterOf(config) {
  const fr = flavorReport(config);
  const cr = colorReport(config);
  const all = [...config.layers.map((id) => tagsOf('massa', id)), ...config.fillings.map((id) => tagsOf('recheio', id))];
  if (fr.pairs.some((p) => p.score <= 0) || cr.mood === 'complementar' || cr.dark) return 'elogio.ousado';
  if (all.length && all.every((t) => t.includes('classico')) && ['neutra', 'acento', 'mono', 'analoga'].includes(cr.mood)) return 'elogio.classico';
  return null;
}

function praiseCand(ctx, mem, now, priority = 3) {
  if (now - mem.lastPraiseAt < TIMING.praiseEvery || (mem.counts.praise || 0) >= 3) return null;
  const s = scoreOf(ctx.config);
  if (s.media < 4.3) return null;
  const g = { sabor: 'elogio.sabor', visual: 'elogio.cor', equilibrio: 'elogio.equilibrio' }[s.forte];
  return cand([g, characterOf(ctx.config), 'elogio.geral'].filter(Boolean), priority, `elogio: nota ${s.media}, ponto forte ${s.forte}`, { praise: true });
}

function noteDecision(ctx, mem, { repeat = true } = {}) {
  const s = scoreOf(ctx.config);
  const c = cand(`nota.${Math.max(2, s.estrelas)}`, 3.5, `nota da Bô: sabor ${s.sabor}, visual ${s.visual}, equilíbrio ${s.equilibrio}`, { stars: s, action: s.sugestao?.action || null });
  const d = build(c, ctx, mem, { repeat });
  if (!d) return null;
  d.text = `${s.frase}${s.sugestao ? ` ${s.sugestao.texto}` : ''}`;
  d.noteKey = hash32(JSON.stringify(ctx.config)); // o mesmo bolo não ganha a mesma nota duas vezes sem pedir
  return d;
}

/* ───────── Tique: o que amadureceu com o tempo ───────── */
function onTick(ctx, mem, now) {
  // 1) opinião esperando a vez
  const p = mem.pending;
  if (p && now >= p.dueAt) {
    if (now > p.until || (p.ev.type === 'step' && p.ev.id !== mem.step)) {
      mem.pending = null;
      afterChange(ctx, mem);
    } else {
      const r = choose(candsFor(p.ev, ctx, mem), ctx, mem, now);
      if (r.say) {
        mem.pending = null;
        afterChange(ctx, mem);
        return r.say;
      }
      // quanto cada tipo de fala aguenta esperar pela vez: alerta e sugestão, bastante; reação comum, quase nada
      const w = r.wait;
      const limit = !w ? 0 : w._c?.light ? TIMING.waitLight : w.priority >= 4 ? TIMING.pendingTtl : w.priority >= 3 ? TIMING.waitP3 : TIMING.waitP2;
      if (!w || now > p.dueAt + limit) {
        mem.pending = null;
        afterChange(ctx, mem);
      }
    }
  }
  if (mem.mode === 'muda') return null;
  if (now < mem.busyUntil || mem.pending) return null;

  // 2) falas agendadas (apresentação, nota no resumo)
  const q = mem.queue.find((x) => now >= x.dueAt);
  if (q) {
    let d = null;
    if (q.kind === 'apresenta') d = build(cand('apresenta', 3, 'primeira visita: como falar com a Bô', { once: 'apresenta' }), ctx, mem);
    if (q.kind === 'nota' && ctx.step === 'resumo') d = noteDecision(ctx, mem, { repeat: false });
    if (!d || now > q.dueAt + 15000) mem.queue = mem.queue.filter((x) => x !== q);
    else if (gate(d, mem, now)) {
      mem.queue = mem.queue.filter((x) => x !== q);
      return commit(d, mem, now);
    }
  }

  // 3) depois de uma rajada: uma revisão do que ficou
  if (mem.burstSeen && now >= mem.burstUntil + 1500) {
    mem.burstSeen = false;
    const f = findingsOf(ctx.config);
    const top = f.issues.find((i) => !mem.flags[i.code] && !(i.code.startsWith('regra:') && mem.rules[i.code.slice(6)]));
    const cands = [top ? issueCand(top, 3.2, `depois da rajada: ${top.code}`) : null, mem.mode === 'falante' ? cand('rajada', 2, 'rajada de mudanças', { once: 'rajada' }) : null, praiseCand(ctx, mem, now)];
    const r = choose(cands, ctx, mem, now, { defer: false });
    if (r.say) return r.say;
  }

  const quiet = now - mem.lastEventAt;
  // 4) parada numa etapa: a dica da etapa
  if (mem.step && !mem.tipGiven[mem.step] && now - mem.stepAt >= TIMING.stepTip && quiet >= 9000) {
    const d = build(cand(`etapa.${mem.step}.dica`, 2, `parada na etapa ${mem.step}: dica`, { tip: mem.step }), ctx, mem);
    if (!d) mem.tipGiven[mem.step] = true;
    else if (gate(d, mem, now)) return commit(d, mem, now);
  }
  // 5) elogio com motivo, sobre o que a pessoa acabou de resolver NESTA etapa (sabor no recheio, cor na cobertura…)
  const about = { recheio: ['sabor', 'elogio.sabor'], cobertura: ['visual', 'elogio.cor'], acabamento: ['visual', 'elogio.cor'], decoracao: ['equilibrio', 'elogio.equilibrio'] }[mem.step];
  if (about && (mem.stepChanges || 0) >= 2 && quiet >= 7000 && quiet < TIMING.idle && now - mem.lastPraiseAt >= TIMING.praiseEvery && (mem.counts.praise || 0) < 3) {
    const s = scoreOf(ctx.config);
    if (s[about[0]] >= 5 && s.media >= 4) {
      const d = build(cand([about[1], characterOf(ctx.config), 'elogio.geral'].filter(Boolean), 3, `elogio na etapa ${mem.step}: ${about[0]} nota ${s[about[0]]}`, { praise: true }), ctx, mem);
      if (d && gate(d, mem, now)) {
        mem.counts.praise = (mem.counts.praise || 0) + 1;
        return commit(d, mem, now);
      }
    }
  }
  // 5b) adequação à ocasião: uma dica, uma vez, quando a ocasião está clara e a pessoa chegou à decoração
  if (!mem.flags['ocasiao.dica'] && STEPS.indexOf(mem.step) >= 5 && quiet >= 8000 && quiet < TIMING.idle) {
    const c = occasionTip(ctx.config);
    const d = c && build(c, ctx, mem);
    if (!c) mem.flags['ocasiao.dica'] = mem.changes > 12; // nada a dizer por enquanto (para de olhar quando a sessão já vai longe)
    else if (d && gate(d, mem, now)) return commit(d, mem, now);
  }
  // 5c) no resumo, com calma: o desconto do Pix e o prazo (uma vez cada; informação, não pressão)
  if (mem.step === 'resumo' && quiet >= 14000 && quiet < TIMING.idle && !mem.queue.length) {
    const pct = SITE.pix?.discountPct || 0;
    const c = pct && !mem.flags['preco.pix'] ? cand('preco.pix', 2, 'resumo: desconto do Pix', { once: 'preco.pix' }) : !mem.flags['prazo.info'] && now - mem.busyUntil >= 14000 ? cand('prazo.info', 2, 'resumo: prazo de preparo', { once: 'prazo.info' }) : null;
    const d = c && build(c, ctx, mem);
    if (d && gate(d, mem, now)) return commit(d, mem, now);
  }
  // 6) ociosidade: convite suave (e, no modo falante, uma graça de vez em quando)
  const maxIdle = mem.mode === 'falante' ? 4 : 2;
  if (quiet >= TIMING.idle && quiet < TIMING.sleep && now - mem.idleMark >= TIMING.idle && mem.idleSaid < maxIdle) {
    const groups = mem.mode === 'falante' && mem.idleSaid % 2 === 1 ? ['humor', 'ocioso'] : ['ocioso'];
    const d = build(cand(groups, 1, `ociosa há ${Math.round(quiet / 1000)} s: convite`, { idle: true }), ctx, mem);
    if (d && gate(d, mem, now)) return commit(d, mem, now);
  }
  if (mem.mode === 'falante' && quiet >= 30000 && quiet < TIMING.idle && now - mem.busyUntil >= 30000 && (mem.counts.chat || 0) < 3) {
    const d = build(cand((mem.counts.chat || 0) % 2 ? ['incentivo'] : ['humor'], 1, 'modo falante: conversa leve', { idle: true }), ctx, mem);
    if (d && gate(d, mem, now)) {
      mem.counts.chat = (mem.counts.chat || 0) + 1;
      return commit(d, mem, now);
    }
  }
  if (quiet >= TIMING.sleep) mem.asleep = true;
  return null;
}

/** Dica de adequação à ocasião (deduzida): falta a vela do aniversário, o coração do presente romântico… */
function occasionTip(config) {
  const oc = occasionOf(config);
  if (!oc.id || oc.score < 3) return null;
  const d = config.decor;
  const extra = { once: 'ocasiao.dica' };
  const max = CAT.MAX_DECORS || 5;
  if (oc.id === 'aniversario' && !d.items.includes('velas') && onSale('decor', 'velas') && d.items.length < max) return cand('ocasiao.aniversario.velas', 3.2, 'ocasião: aniversário sem velas', { ...extra, action: { label: 'Colocar velas', patch: { decor: { items: [...d.items, 'velas'] } } } });
  if (oc.id === 'romantico' && config.shape !== 'heart' && onSale('formato', 'heart') && !CAT.isVolcano?.(config)) return cand('ocasiao.romantico.formato', 3.2, 'ocasião: romântico sem o coração', { ...extra, action: { label: 'Ver em formato de coração', patch: { shape: 'heart' } } });
  if (oc.id === 'infantil' && !config.fillings.some((f) => tagsOf('recheio', f).includes('infantil'))) return cand('ocasiao.infantil.sabor', 3.2, 'ocasião: infantil sem um recheio que criança adora', extra);
  if (oc.id === 'casamento' && (config.tiers || 1) === 1 && !['g', 'gg'].includes(config.size)) return cand('ocasiao.casamento.fatias', 3.2, 'ocasião: casamento com bolo pequeno', { ...extra, action: { label: 'Para quantas pessoas?', ask: 'pessoas' } });
  if (oc.id === 'bebe' && !colorReport(config).pastel && hslOf(config.covering.color).l < 0.74) return cand('ocasiao.bebe.cores', 3.2, 'ocasião: chá de bebê sem tons pastel', extra);
  if (oc.id === 'formatura' && !d.topper?.text) return cand('ocasiao.formatura.topo', 3.2, 'ocasião: formatura sem topo com nome', extra);
  return null;
}

function afterChange(ctx, mem) {
  mem.price = ctx.price ?? priceOf(ctx.config);
  mem.prep = prepHoursOf(ctx.config);
  mem.oc = occasionOf(ctx.config);
  mem.ruleCodes = ctxRules(ctx).map((r) => r.code); // as regras que o bolo já traz: só as novas viram comentário
}

/* ───────── A entrada principal ───────── */
/**
 * react(evento, contexto, memória) → { id, text, speech, mood, priority, why, action?, actions?, stars? } | null
 *   evento: { type: 'open'|'close'|'step'|'change'|'fit'|'tool'|'cart'|'tick'|'nudge', at, …campos do barramento }
 *   contexto: { config (normalizada), step, price?, rules? (função rulesOf do catálogo, se existir) }
 */
export function react(ev, ctx, mem) {
  if (!ev || !ctx?.config) return null;
  // evento que ela não conhece (marca de som, evento do jogo…) ou gesto em andamento: nem conta como atividade
  if (!EVENTS.has(ev.type) || (ev.type === 'gesture' && ev.phase === 'move')) return null;
  const now = Number(ev.at) || 0;
  if (mem.startedAt == null) {
    mem.startedAt = now;
    mem.lastEventAt = now;
    mem.idleMark = now;
    afterChange(ctx, mem);
  }
  if (ev.type === 'tick') return onTick(ctx, mem, now);

  const wasAsleep = mem.asleep;
  mem.lastEventAt = now;
  mem.asleep = false;
  mem.idleMark = now;

  switch (ev.type) {
    case 'open': {
      mem.openSource = ev.source || 'novo';
      mem.step = ctx.step || 'formato';
      mem.stepAt = now;
      mem.steps[mem.step] = (mem.steps[mem.step] || 0) + 1;
      afterChange(ctx, mem);
      if (!mem.returning) mem.queue.push({ kind: 'apresenta', dueAt: now + 14000 });
      const r = choose([greeting(ev, mem)], ctx, mem, now, { defer: false });
      return r.say || null;
    }
    case 'close': {
      if (now - (mem.cartAt ?? -1e9) < 15000) return null;
      const r = choose([cand('tchau', 3, 'fechou o ateliê', { force: mem.mode !== 'muda' })], ctx, mem, now, { defer: false });
      return r.say || null;
    }
    case 'cart': {
      mem.cartAt = now;
      mem.pending = null;
      const price = ev.price ?? ctx.price ?? priceOf(ctx.config);
      const v = priceVars(ctx.config, price);
      const pix = v.pct ? `No Pix sai por ${v.pix}.` : '';
      const r = choose([cand(ev.editing ? 'carrinho.edicao' : 'carrinho', 5, 'foi para o carrinho', { force: true, vars: { preco: brl(price), pix } })], ctx, mem, now, { defer: false });
      return r.say || null;
    }
    case 'nudge': {
      const f = findingsOf(ctx.config);
      const top = f.issues[0];
      const cands = [top ? issueCand({ ...top, code: null }, 3.5, `cutucada: ${top.code}`) : null, praiseCand(ctx, mem, Number.MAX_SAFE_INTEGER, 3), cand(`etapa.${ctx.step || mem.step || 'formato'}.dica`, 2.5, 'cutucada: dica da etapa'), cand('incentivo', 2, 'cutucada: incentivo')];
      for (const c of cands.filter(Boolean)) {
        const d = build({ ...c, force: true }, ctx, mem, { repeat: false });
        if (d && gate(d, mem, now)) return commit(d, mem, now);
      }
      return null;
    }
    case 'step': {
      mem.step = ev.id;
      mem.stepAt = now;
      mem.stepChanges = 0;
      mem.steps[ev.id] = (mem.steps[ev.id] || 0) + 1;
      mem.queue = mem.queue.filter((x) => x.kind !== 'nota');
      if (ev.id === 'resumo') {
        if (hash32(JSON.stringify(ctx.config)) !== mem.noteHash) mem.queue.push({ kind: 'nota', dueAt: now + 6500 });
      }
      break;
    }
    case 'change': {
      if (now < mem.selfUntil || ev.by === 'bo') {
        afterChange(ctx, mem);
        return null;
      }
      // mudanças feitas pela máquina (inspiração, surpresa, paleta, desfazer…): só o evento geral conta, uma vez
      if (ev.by && ev.by !== 'user' && !MACHINE.has(ev.key)) {
        if (!MACHINE.has(ev.by)) {
          afterChange(ctx, mem);
          return null;
        }
        if (now - (mem.machineAt ?? -1e9) < 1500) return null;
        ev = { ...ev, key: ev.by, value: null };
      }
      if (ev.key === THEME_KEY) {
        if (!ev.value) {
          afterChange(ctx, mem); // o tema saiu (a pessoa limpou ou trocou as peças): nada a dizer
          return null;
        }
        // as outras mudanças do tema acabaram de chegar, todas juntas: não são rajada nem pessoa concentrada
        if (now - (mem.burstAt ?? -1e9) < 600) {
          mem.burstUntil = 0;
          mem.burstSeen = false;
        }
        if (now - (mem.focusAt ?? -1e9) < 600) mem.focusUntil = 0;
        mem.recent = mem.recent.filter((t) => now - t > 600);
        mem.pending = null;
        mem.machineAt = now;
      } else if (MACHINE.has(ev.key)) mem.machineAt = now;
      else noteChange(ev, mem);
      mem.counts.undo = ev.key === 'undo' ? (mem.counts.undo || 0) + 1 : 0;
      break;
    }
    case 'gesture':
      if (ev.phase !== 'end') return null; // o começo do gesto só conta como atividade
      break;
    case 'mode':
      mem.rapido = ev.mode === 'rapido';
      break;
    case 'fit':
    case 'tool':
    case 'reveal':
    case 'photo':
    case 'rule':
      break;
    default:
      return null; // evento desconhecido: ignora
  }

  // acordou com a pessoa mexendo: uma graça (uma vez)
  if (wasAsleep && !mem.flags.acordou && mem.mode !== 'muda') {
    const d = build(cand('acordou', 3, 'acordou do cochilo', { once: 'acordou' }), ctx, mem);
    if (d && gate(d, mem, now)) {
      afterChange(ctx, mem);
      return commit(d, mem, now);
    }
  }

  // alerta fura a fila na hora; o resto espera um instante (e pode ser trocado por algo mais novo)
  const peek = candsFor(ev, ctx, mem);
  const urgent = peek.filter((c) => c && c.force);
  if (urgent.length) {
    const r = choose(urgent, ctx, mem, now, { defer: false });
    if (r.say) {
      afterChange(ctx, mem);
      mem.pending = null;
      return r.say;
    }
  }
  if (now < mem.burstUntil && ev.type === 'change') return null;
  const top = peek.filter(Boolean).reduce((m, c) => Math.max(m, c.priority), 0);
  if (!top) {
    if (ev.type === 'change') afterChange(ctx, mem);
    return null;
  }
  const cur = mem.pending;
  // Uma escolha pode chegar como várias mudanças no MESMO instante (a cozinha corrige algo junto: o vulcão tira o
  // bico, o chá revelação troca o recheio escuro…). A primeira é a escolha da pessoa: as seguintes só passam na
  // frente se forem mais importantes. Em instantes diferentes, a mudança mais nova substitui a que esperava.
  const sameBatch = Boolean(cur) && cur.ev.type === 'change' && ev.type === 'change' && now - cur.at < 80;
  if (!cur || (sameBatch ? top > cur.priority : top >= cur.priority - 0.5 || now - cur.at > 4000)) {
    if (cur && cur.ev.type === 'change' && ev.type !== 'change') afterChange(ctx, mem);
    mem.pending = { ev, at: now, dueAt: now + settleOf(ev), until: now + settleOf(ev) + TIMING.pendingTtl, priority: top };
  }
  return null;
}

/** Como ela deve aparecer agora: 'ativa' | 'discreta' (pessoa concentrada) | 'dormindo'. */
export function presenceOf(mem, now) {
  if (mem.asleep || now - mem.lastEventAt >= TIMING.sleep) return 'dormindo';
  if (now < mem.focusUntil || now < mem.burstUntil) return 'discreta';
  return 'ativa';
}

/** Falas que provavelmente vêm a seguir (para baixar o clipe antes): a opinião em espera e a abertura da próxima etapa. */
export function predict(ctx, mem) {
  const out = [];
  if (mem.pending) {
    const c = candsFor(mem.pending.ev, ctx, mem)
      .filter(Boolean)
      .sort((a, b) => b.priority - a.priority);
    for (const x of c) {
      if (x.once && mem.flags[x.once]) continue;
      const id = pickLine(x.groups, mem);
      if (id) {
        out.push(id);
        break;
      }
    }
  }
  const next = STEPS[STEPS.indexOf(ctx.step || mem.step) + 1];
  if (next && !mem.steps[next]) {
    const id = pickLine([`etapa.${next}.abre`], mem);
    if (id) out.push(id);
  }
  return out;
}

/* ───────── Atalhos "Pergunte à Bô" ───────── */
// Ideias prontas de "Me surpreenda". Cada uma tem a sua fala (ideia.<id>) e só é oferecida se o catálogo de hoje
// tiver todos os ingredientes à venda, se a cozinha fizer (patchOk) e se a própria Bô não tiver ressalva de sabor.
// `vulcao: true` = ideia para o bolo de furo (massa, cobertura que transborda e calda de molhar; sem recheio).
const IDEAS = [
  { id: 'tropical', layers: 'limao', fillings: ['maracuja', 'coco'], covering: { type: 'chantilly', color: '#ffffff', style: 'liso' }, drip: { on: true, color: '#ffd166' }, piping: { style: 'bolinhas', where: 'top', color: '#ffffff' }, decor: ['frutas'] },
  { id: 'casadinho', layers: 'chocolate', fillings: ['brigadeiro', 'ninho'], covering: { type: 'chocolate', color: '#6b3f22', style: 'rustico' }, drip: { on: false }, piping: { style: 'rosetas', where: 'top', color: '#ffffff' }, decor: ['brigadeiros', 'granulado'] },
  { id: 'vermelhas', layers: 'redvelvet', fillings: ['framboesa', 'morango'], covering: { type: 'buttercream', color: '#ffffff', style: 'seminaked' }, drip: { on: false }, piping: { style: 'liso' }, decor: ['frutas', 'flores'] },
  { id: 'cenoura', layers: 'cenoura', fillings: ['brigadeiro', 'brigadeiro'], covering: { type: 'chocolate', color: '#6b3f22', style: 'rustico' }, drip: { on: true, color: '#3a1a08' }, piping: { style: 'liso' }, decor: ['granulado'] },
  { id: 'fazenda', layers: 'baunilha', fillings: ['docedeleite', 'coco'], covering: { type: 'naked', color: '#ffffff', style: 'liso' }, drip: { on: true, color: '#b9772c' }, piping: { style: 'liso' }, decor: ['frutas'], soak: 'baunilha' },
  { id: 'bombom', layers: 'chocolate', fillings: ['morango', 'brigadeiro'], covering: { type: 'ganache', color: '#3a1a08', style: 'liso' }, drip: { on: false }, piping: { style: 'conchas', where: 'top', color: '#6b3f22' }, decor: ['morangos'] },
  { id: 'limao', layers: 'limao', fillings: ['framboesa', 'limao'], covering: { type: 'buttercream', color: '#ffffff', style: 'liso' }, drip: { on: false }, piping: { style: 'bolinhas', where: 'both', color: '#ffd166' }, decor: ['flores', 'perolas'] },
  { id: 'morangocreme', layers: 'baunilha', fillings: ['morango', 'ninho'], covering: { type: 'chantilly', color: '#ffffff', style: 'liso' }, drip: { on: true, color: '#d96b82' }, piping: { style: 'rosetas', where: 'top', color: '#f7d3dc' }, decor: ['frutas'] },
  { id: 'florestanegra', layers: 'chocolate', fillings: ['cereja', 'cereja'], covering: { type: 'chantilly', color: '#ffffff', style: 'rustico' }, drip: { on: false }, piping: { style: 'rosetas', where: 'top', color: '#ffffff' }, decor: ['cerejas', 'raspas'] },
  { id: 'churros', layers: 'churros', fillings: ['docedeleite', 'docedeleite'], covering: { type: 'buttercream', color: '#f2e4c7', style: 'barrado', trim: 'castanha' }, drip: { on: true, color: '#b9772c' }, piping: { style: 'liso' }, decor: [] },
  { id: 'redvelvet', layers: 'redvelvet', fillings: ['creamcheese', 'creamcheese'], covering: { type: 'creamcheese', color: '#ffffff', style: 'rustico' }, drip: { on: false }, piping: { style: 'liso' }, decor: ['framboesas'] },
  { id: 'bananacaramelo', layers: 'banana', fillings: ['docedeleite', 'docedeleite'], covering: { type: 'buttercream', color: '#f2e4c7', style: 'rustico' }, drip: { on: true, color: '#b9772c' }, piping: { style: 'liso' }, decor: [] },
  { id: 'pistache', layers: 'amendoas', fillings: ['pistache', 'framboesa'], covering: { type: 'buttercream', color: '#ffffff', style: 'liso' }, drip: { on: false }, piping: { style: 'bolinhas', where: 'base', color: '#ffffff' }, decor: ['framboesas'] },
  { id: 'cafeteria', layers: 'cafe', fillings: ['caramelosalgado', 'moussechocolate'], covering: { type: 'ganache', color: '#3a1a08', style: 'liso' }, drip: { on: false }, piping: { style: 'liso' }, decor: ['raspas'] },
  { id: 'cocogelado', layers: 'coco', fillings: ['coco', 'quatroleites'], covering: { type: 'coco', color: '#ffffff', style: 'liso' }, drip: { on: false }, piping: { style: 'liso' }, decor: ['coco'], soak: 'leitecondensado' },
  { id: 'arraial', layers: 'pacoca', fillings: ['docedeleite', 'pacoca'], covering: { type: 'buttercream', color: '#ffd166', style: 'barrado', trim: 'castanha' }, drip: { on: false }, piping: { style: 'liso' }, decor: ['pacoca'] },
  { id: 'laranjachoc', layers: 'laranja', fillings: ['meioamargo', 'meioamargo'], covering: { type: 'ganache', color: '#3a1a08', style: 'liso' }, drip: { on: false }, piping: { style: 'liso' }, decor: ['laranja'] },
  { id: 'confete', layers: 'funfetti', fillings: ['brigadeirobranco', 'brigadeirobranco'], covering: { type: 'chantininho', color: '#ffffff', style: 'chuva', trim: 'confeitos' }, drip: { on: false }, piping: { style: 'liso' }, decor: ['confete'] },
  { id: 'vulcaocenoura', vulcao: true, layers: 'cenoura', fillings: [], covering: { type: 'chocolate', color: '#6b3f22', style: 'liso' }, drip: { on: false }, piping: { style: 'liso' }, decor: ['granulado'], soak: 'leitecondensado' },
  { id: 'vulcaochocolate', vulcao: true, layers: 'chocolate', fillings: [], covering: { type: 'brigadeiro', color: '#6b3f22', style: 'liso' }, drip: { on: false }, piping: { style: 'liso' }, decor: ['brigadeiros'], soak: 'leitecondensado' },
  { id: 'vulcaococo', vulcao: true, layers: 'coco', fillings: [], covering: { type: 'ganachebranca', color: '#f2e4c7', style: 'liso' }, drip: { on: false }, piping: { style: 'liso' }, decor: ['coco'], soak: 'leitecondensado' },
];

const onSale = (kind, id) => {
  const it = itemOf(kind, id);
  return Boolean(it) && it.active !== false;
};

function ideaPatch(idea, config) {
  const volcano = Boolean(CAT.isVolcano?.(config));
  const n = volcano ? 1 : Math.max(2, config.layers.length);
  return {
    layers: Array.from({ length: n }, () => idea.layers),
    fillings: Array.from({ length: n - 1 }, (_, i) => idea.fillings[Math.min(i, idea.fillings.length - 1)]),
    fillAdds: Array.from({ length: n - 1 }, () => ''),
    soak: idea.soak || '',
    covering: { color2: '#ffffff', ...idea.covering },
    tierCover: null,
    drip: { amount: 'media', length: 'media', half: false, metal: false, ...idea.drip },
    piping: idea.piping,
    decor: { items: idea.decor, opts: {}, placed: [], theme: '' },
  };
}

/** A ideia serve para ESTE bolo? Ingredientes à venda, a cozinha faz e a própria Bô não teria ressalva de sabor. */
function ideaFits(idea, config) {
  if (Boolean(idea.vulcao) !== Boolean(CAT.isVolcano?.(config))) return false;
  if (!onSale('massa', idea.layers) || !idea.fillings.every((f) => onSale('recheio', f)) || !onSale('cobertura', idea.covering.type) || !onSale('estilo', idea.covering.style) || !onSale('bico', idea.piping.style) || !idea.decor.every((d) => onSale('decor', d))) return false;
  if (idea.soak && !onSale('molhar', idea.soak)) return false;
  const patch = ideaPatch(idea, config);
  if (!patchOk(config, patch)) return false;
  const next = applyPatch(config, patch);
  // a cozinha pode aceitar e mesmo assim trocar algo de lugar (estilo que a cobertura não aceita…): a ideia tem de chegar inteira
  if (next.layers[0] !== idea.layers || next.covering.type !== idea.covering.type || next.covering.style !== idea.covering.style || next.piping.style !== idea.piping.style) return false;
  if (idea.decor.some((d) => !next.decor.items.includes(d))) return false;
  return flavorReport(next).issues.length === 0;
}

/** As ideias de "Me surpreenda" que servem para um bolo (para testes e para a bancada). */
export function ideasFor(config) {
  return IDEAS.filter((i) => ideaFits(i, config)).map((i) => ({ id: i.id, patch: ideaPatch(i, config) }));
}

const SEASONAL = ['natal', 'pascoa', 'junino', 'halloween', 'casamento', 'bebe', 'formatura'];

function decorIdea(config, mem) {
  const items = config.decor.items;
  const fr = flavorReport(config);
  const cr = colorReport(config);
  const oc = occasionOf(config);
  const volcano = Boolean(CAT.isVolcano?.(config));
  const flavors = [...config.layers.map((id) => flav('massa', id)), ...config.fillings.map((id) => flav('recheio', id))];
  const styleTags = uniq([...tagsOf('cobertura', config.covering.type), ...tagsOf('estilo', config.covering.style)]);
  const present = uniq(items.flatMap((id) => tagsOf('decor', id)));
  const soft = isSoftCover(config.covering.type) || config.covering.type === 'glace';
  const OC = { infantil: ['infantil', 'divertido', 'festa'], aniversario: ['festa'], romantico: ['romantico', 'flor'], casamento: ['casamento', 'flor', 'elegante'], bebe: ['bebe', 'flor'], formatura: ['formatura', 'brilho', 'festa'], natal: ['natal'], pascoa: ['pascoa'], junino: ['junino'], halloween: ['halloween'] };
  const scored = shopOf('decor')
    .filter((d) => !items.includes(d.id) && d.id !== 'velas')
    .map((d, i) => {
      const t = tagsOf('decor', d.id);
      // peça de data ou de tema (Natal, Páscoa, casamento, unicórnio…) só entra quando o bolo já é dessa festa
      const season = SEASONAL.filter((x) => t.includes(x));
      if (season.length && !t.some((x) => ['fruta', 'flor', 'chocolate', 'doce', 'brilho'].includes(x)) && !season.includes(oc.id)) return null;
      if (t.includes('tematico') && !(oc.id && (OC[oc.id] || []).some((x) => t.includes(x)))) return null;
      if (soft && HEAVY.has(d.id)) return null; // pesado em cobertura mole ou no glacê espelhado: não
      if (volcano && !(d.arrs || []).some((a) => TOP_ARR.has(a))) return null; // no vulcão nada se prende na lateral
      let s = 0;
      let why = 'Fecha bem o visual.';
      const bump = (v, w) => {
        if (v > 0 && v >= s - 0.01) why = w;
        s += v;
      };
      if (t.includes('fruta') && flavors.some((f) => f.has('frutado') || isAcid(f))) bump(3, 'Repete por fora a fruta que vai por dentro.');
      if (t.includes('chocolate') && flavors.some((f) => f.has('chocolate'))) bump(3, 'Mostra por fora o chocolate de dentro.');
      if (oc.id && (OC[oc.id] || []).some((x) => t.includes(x))) bump(2.5, 'Tem a cara da ocasião.');
      if (styleTags.some((x) => t.includes(x))) bump(1.5, 'Acompanha o estilo da cobertura.');
      if (cr.dark && t.includes('brilho')) bump(2, 'Brilha sobre a cobertura escura.');
      if (!cr.dark && t.includes('flor') && ['branco', 'creme', 'rosa'].includes(familyOf(config.covering.color))) bump(1, 'Flor em cobertura clara fica delicado.');
      const fam = ['fruta', 'flor', 'doce', 'brilho'].find((x) => t.includes(x));
      if (fam && present.includes(fam)) s -= 2;
      if (d.popular) s += 0.4;
      if ((d.price || 0) > 14) s -= 0.5;
      if ((d.prep || 0) >= 24) s -= 0.5; // peça que alonga o prazo só quando vale muito a pena
      if (mem.suggested[`decor:${d.id}`]) s -= 4;
      return { d, s, why, i };
    })
    .filter(Boolean)
    .sort((a, b) => b.s - a.s || a.i - b.i);
  // a primeira que a cozinha aceita (a cerca não vai com barrado, por exemplo)
  const best = scored.find((x) => patchOk(config, { decor: { items: [...items, x.d.id] } })) || null;
  return { best, fr };
}

/** No bolo vulcão não há recheio: o palpite de sabor é a calda de molhar ou o creme que transborda. */
function volcanoIdea(config) {
  const m = flav('massa', config.layers[0]);
  if (!config.soak) {
    const id = ['leitecondensado', 'baunilha'].find((x) => onSale('molhar', x) && patchOk(config, { soak: x }));
    if (id) return { porque: `Uma calda de ${nameOf('molhar', id)} deixa a massa de ${nameOf('massa', config.layers[0])} ainda mais úmida.`, action: { label: `Molhar com calda de ${nameOf('molhar', id)}`, patch: { soak: id } } };
  }
  const dark = ['chocolate', 'brigadeiro', 'ganache'];
  const want = m.has('chocolate') && !m.has('classico') ? ['ganachebranca', 'chantininho'] : m.has('chocolate') ? ['brigadeiro', 'ganachebranca'] : ['chocolate', 'brigadeiro', 'ganache'];
  const contrast = dark.includes(config.covering.type) ? !m.has('chocolate') || m.has('classico') : m.has('chocolate') || m.has('frutado') || m.has('coco') || isAcid(m);
  if (!contrast) {
    const id = want.find((x) => x !== config.covering.type && onSale('cobertura', x) && patchOk(config, { covering: { type: x, color: itemOf('cobertura', x).defaultColor } }));
    if (id) return { porque: `${cap(nameOf('cobertura', id))} transbordando faz contraste com a massa de ${nameOf('massa', config.layers[0])}.`, action: { label: `Cobertura de ${nameOf('cobertura', id)}`, patch: { covering: { type: id, color: itemOf('cobertura', id).defaultColor } } } };
  }
  return null;
}

/** Um adicional de recheio (pedaços no corte) que combina com os sabores do bolo, para quando o sabor já está redondo. */
function addIdea(config) {
  if (!config.fillings.length || (config.fillAdds || []).some(Boolean)) return null;
  const pick = (index, id, porque) => {
    const fillAdds = config.fillings.map((_, i) => (i === index ? id : ''));
    return onSale('adicional', id) && patchOk(config, { fillAdds }) ? { index, id, porque, patch: { fillAdds } } : null;
  };
  for (const [index, f] of config.fillings.entries()) {
    const r = flav('recheio', f);
    if (itemOf('recheio', f)?.pieces) continue; // já tem pedaços próprios
    if (r.has('chocolate') && !r.has('crocante')) return pick(index, 'morango', 'A fruta fresca corta o chocolate.') || pick(index, 'crocante', 'O crocante muda a mordida.');
    if (r.has('caramelo')) return pick(index, 'nozes', 'Nozes tostadas equilibram o doce do caramelo.') || pick(index, 'crocante', 'O crocante muda a mordida.');
    if (r.has('cremoso') && !isAcid(r)) return pick(index, 'crocante', 'Cremoso com crocante é a melhor mordida.') || pick(index, 'gotas', 'Gotas de chocolate viram pequenas surpresas.');
  }
  return null;
}

/**
 * Resposta de um atalho. Sempre responde (e pode repetir uma fala quando todas as variações já saíram).
 * → { id, text, speech, mood, priority, why, action?, actions?, stars? }
 */
export function answer(chip, ctx, mem) {
  const config = ctx.config;
  const now = Number(ctx.now ?? mem.lastEventAt) || 0;
  const price = ctx.price ?? priceOf(config);
  mem.counts[`ask.${chip}`] = (mem.counts[`ask.${chip}`] || 0) + 1;
  const nth = mem.counts[`ask.${chip}`];
  const volcano = Boolean(CAT.isVolcano?.(config));
  let c = null;

  if (chip === 'combina') {
    const f = findingsOf(config);
    const top = f.issues[0];
    if (top) c = cand('combina.quase', 4, `combina? → ${top.code}`, { vars: { achado: top.text }, action: top.action });
    else c = cand('combina.sim', 4, 'combina? → sem ressalvas', { vars: { achado: f.praise.length ? `${joinPt(f.praise.slice(0, 2).map((p, i) => (i ? low(p.text) : p.text)))}.` : '' } });
  } else if (chip === 'sabor') {
    const fr = flavorReport(config);
    const issue = fr.issues[0];
    if (volcano) {
      const v = volcanoIdea(config);
      c = v ? cand('sugere.vulcao', 4, 'sugira um sabor → bolo vulcão', { vars: { porque: v.porque }, action: v.action }) : cand('sugere.sabor.ok', 4, 'sugira um sabor → vulcão já resolvido', { detail: 'No vulcão, a massa e o creme que transborda já fazem um bom par.' });
    } else if (!config.fillings.length) {
      const first = bestFillingsFor(config.layers[0]).find((id) => patchOk(config, { layers: [...config.layers, config.layers[0]], fillings: [id], fillAdds: [''] }));
      c = cand('camada.unica', 4, 'sugira um sabor → bolo de uma camada', { detail: 'Com mais uma camada, entra um recheio.', action: first ? { label: 'Pôr mais uma camada', patch: { layers: [...config.layers, config.layers[0]], fillings: [first], fillAdds: [''] } } : null });
    } else if (issue?.action) {
      const sug = issue.action.patch.fillings.find((id, i) => id !== config.fillings[i]);
      const idx = issue.action.patch.fillings.findIndex((id, i) => id !== config.fillings[i]);
      c = cand('sugere.sabor', 4, `sugira um sabor → corrige ${issue.code}`, { vars: { massa: nameOf('massa', config.layers[idx] || fr.main), sugestao: nameOf('recheio', sug), porque: pairReason(config.layers[idx] || fr.main, sug) }, action: issue.action });
    } else {
      const s = scoreOf(config);
      const add = s.sabor >= 5 && nth <= 2 ? addIdea(config) : null;
      if (s.sabor >= 5 && nth === 1) c = cand('sugere.sabor.ok', 4, 'sugira um sabor → já está ótimo', { detail: `${cap(fr.reason)}.` });
      else if (add && !mem.suggested[`adicional:${add.id}`]) {
        // o sabor já está redondo: em vez de trocar recheio, um adicional (pedaços que aparecem no corte)
        mem.suggested[`adicional:${add.id}`] = true;
        c = cand('sugere.adicional', 4, `sugira um sabor → adicional ${add.id}`, { vars: { sugestao: cap(nameOf('adicional', add.id)), porque: add.porque }, action: { label: `Pôr ${nameOf('adicional', add.id)} no recheio`, patch: add.patch } });
      } else {
        // troca o recheio que menos combina (o último, no empate) pelo melhor que ainda não está no bolo
        let idx = 0;
        fr.pairs.forEach((p, i) => (p.score <= fr.pairs[idx].score ? (idx = i) : 0));
        const massa = config.layers[idx] || fr.main;
        const ok = (id) => {
          const patch = { fillings: swapFilling(config, idx, id) };
          return patchOk(config, patch) && flavorReport(applyPatch(config, patch)).issues.length === 0;
        };
        const all = bestFillingsFor(massa, config.fillings);
        const sug = all.find((id) => !mem.suggested[`recheio:${id}`] && ok(id)) || all.find(ok);
        if (sug) {
          mem.suggested[`recheio:${sug}`] = true;
          c = cand('sugere.sabor', 4, `sugira um sabor → ${sug} no lugar de ${config.fillings[idx]}`, { vars: { massa: nameOf('massa', massa), sugestao: nameOf('recheio', sug), porque: pairReason(massa, sug) }, action: { label: `Trocar ${nameOf('recheio', config.fillings[idx])} por ${nameOf('recheio', sug)}`, patch: { fillings: swapFilling(config, idx, sug) } } });
        } else c = cand('sugere.sabor.ok', 4, 'sugira um sabor → sem alternativa melhor');
      }
    }
  } else if (chip === 'decoracao') {
    const br = balanceReport(config);
    const max = CAT.MAX_DECORS || 5;
    const crowdedIssue = br.issues.find((i) => i.code === 'topo.lotado');
    if (config.decor.items.length >= max || br.crowded || br.load >= br.capacity) c = cand('sugere.decor.cheio', 4, 'sugira uma decoração → topo cheio', { detail: crowdedIssue?.text || '', action: crowdedIssue?.action || null });
    else {
      const { best } = decorIdea(config, mem);
      if (best) {
        mem.suggested[`decor:${best.d.id}`] = true;
        c = cand('sugere.decor', 4, `sugira uma decoração → ${best.d.id} (${best.s.toFixed(1)})`, { vars: { sugestao: nameOf('decor', best.d.id), porque: best.why }, action: { label: `Colocar ${nameOf('decor', best.d.id)}`, patch: { decor: { items: [...config.decor.items, best.d.id] } } } });
      } else c = cand('sugere.decor.cheio', 4, 'sugira uma decoração → nada a acrescentar');
    }
  } else if (chip === 'pessoas') {
    const sizes = shopOf('tamanho');
    const i = sizes.findIndex((s) => s.id === config.size);
    const tiers = config.tiers || 1;
    // compara com os tamanhos vizinhos (o catálogo vai do bentô ao GG: a lista inteira não cabe num balão)
    const near = [sizes[i - 1], sizes[i + 1]].filter((s) => s && patchOk(config, { size: s.id }));
    const serve = (patch) => servesText(applyPatch(config, patch));
    const twoTiers = tiers === 1 && patchOk(config, { tiers: 2 }) ? `com 2 andares, ${serve({ tiers: 2 })}` : '';
    const parts = [...near.map((s) => `o ${s.label} rende ${serve({ size: s.id })}`), twoTiers].filter(Boolean);
    const comparacao = parts.length ? `${cap(parts.length > 1 ? `${parts.slice(0, -1).join(', ')}; ${parts[parts.length - 1]}` : parts[0])}.` : '';
    const actions = [];
    if (sizes[i + 1]) actions.push({ label: `Aumentar para ${sizes[i + 1].label}`, patch: { size: sizes[i + 1].id } });
    if (sizes[i - 1]) actions.push({ label: `Diminuir para ${sizes[i - 1].label}`, patch: { size: sizes[i - 1].id } });
    c = cand('pessoas', 4, `para quantas pessoas → ${servesText(config)}`, { vars: { fatias: servesText(config), comparacao }, actions });
  } else if (chip === 'economizar') {
    const all = savingsOf(config);
    const s = all.find((x) => !mem.suggested[`eco:${x.code}`]) || all[0];
    if (s) {
      mem.suggested[`eco:${s.code}`] = true;
      c = cand('economia.sugestao', 4, `mais em conta → ${s.code} (−${brl(s.saving)})`, { vars: { sugestao: s.text, economia: brl(s.saving) }, action: { label: s.label, patch: s.patch } });
    } else c = cand('economia.enxuto', 4, 'mais em conta → nada a cortar', { detail: `Sai por ${brl(price)}.` });
  } else if (chip === 'surpresa') {
    const ok = IDEAS.filter((i) => ideaFits(i, config));
    const cur = `${config.layers[0]}|${config.fillings.join(',')}`;
    const fresh = ok.filter((i) => !mem.suggested[`ideia:${i.id}`] && `${i.layers}|${i.fillings.slice(0, config.fillings.length).join(',')}` !== cur);
    const pool = fresh.length ? fresh : ok;
    const idea = pool[hash32(`${mem.seed}|ideia|${nth}`) % Math.max(1, pool.length)];
    if (idea) {
      mem.suggested[`ideia:${idea.id}`] = true;
      c = cand([`ideia.${idea.id}`, 'surpreende'], 4, `me surpreenda → ideia ${idea.id}`, { action: { label: 'Quero ver no meu bolo', patch: ideaPatch(idea, config) }, mood: 'comemora' });
    } else c = cand('surpreende', 4, 'me surpreenda → sem ideia pronta para este bolo', { detail: 'Para este bolo, a melhor surpresa é a sua: mexe à vontade.' });
  } else if (chip === 'falta') {
    const missing = [];
    const single = config.layers.length === 1;
    const cur = STEPS.indexOf(ctx.step || mem.step || 'formato');
    const todo = STEPS.filter((s, i) => s !== 'resumo' && !(mem.steps[s] > 0) && i > cur && !(s === 'recheio' && single));
    if (todo.length) missing.push(`passar por ${joinPt(todo.map((s) => STEP_NAME[s]))}`);
    const oc = occasionOf(config);
    const d = config.decor;
    if (!d.items.length && !d.message && !todo.includes('decoracao')) missing.push('um enfeite ou uma mensagem, se quiser');
    if (oc.id === 'aniversario' && !d.items.includes('velas')) missing.push('as velas do parabéns');
    if (d.items.includes('velas') && d.candleStyle === 'numero' && !d.number) missing.push('o número da vela');
    if (missing.length) {
      const step = todo[0] || (missing.some((m) => /vela|enfeite/.test(m)) ? 'decoracao' : null);
      c = cand('falta.itens', 4, `o que falta → ${missing.length} item(ns)`, { vars: { lista: joinPt(missing) }, action: step ? { label: `Ir para ${STEP_NAME[step]}`, step } : null });
    } else c = cand('falta.nada', 4, 'o que falta → nada', { action: (ctx.step || mem.step) !== 'resumo' ? { label: 'Ir para o resumo', step: 'resumo' } : null });
  } else if (chip === 'nota') {
    const d = noteDecision(ctx, mem, { repeat: true });
    if (d) return commit({ ...d, force: true }, mem, now);
  } else if (chip === 'atendimento') {
    c = cand('atendimento', 4, 'assunto do atendimento');
  }
  if (!c) c = cand('limite', 4, `pergunta fora dos atalhos (${chip})`);
  const d = build({ ...c, force: true }, ctx, mem, { repeat: true });
  return d ? commit(d, mem, now) : null;
}

/** Depois que a tela aplicou uma ação da Bô: ela confirma e não comenta a própria mudança. */
export function afterAction(ctx, mem, now) {
  mem.selfUntil = now + 1800;
  mem.pending = null;
  afterChange(ctx, mem);
  const d = build(cand('acao.feito', 3, 'ação aplicada', { force: true }), ctx, mem, { repeat: true });
  return d ? commit(d, mem, now) : null;
}

/** Uma fala qualquer da biblioteca, por id ou por grupo (para `say`, para a bancada e para a costura com um servidor). */
export function lineDecision(idOrGroup, ctx, mem, { vars = {}, now = 0 } = {}) {
  const id = LINES[idOrGroup] ? idOrGroup : pickLine([idOrGroup], mem, { repeat: true });
  if (!id) return null;
  const line = LINES[id];
  const price = ctx?.config ? ctx.price ?? priceOf(ctx.config) : 0;
  const d = { id, group: line.group, text: showText(id, ctx?.config ? { ...priceVars(ctx.config, price), ...vars } : vars), speech: line.text, mood: line.mood, priority: 4, why: 'fala pedida', action: null, actions: [], force: true, stars: null };
  return commit(d, mem, now);
}
