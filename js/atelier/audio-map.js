// BOLAB — Ateliê: que efeito sonoro toca para cada evento do personalizador (só regras, sem som).
//
// A tela avisa o que aconteceu pelo barramento (js/atelier/bus.js); aqui se decide o som:
//   route('change', { key: 'filling', by: 'user', … })  →  [{ name: 'spread', opts: {} }]
//
// Regras:
//   · cada escolha da pessoa (by: 'user') toca o efeito da sua chave; chave desconhecida toca 'select';
//   · mudanças em rajada (desfazer, refazer, paleta, inspiração, surpresa, recomeçar: vários 'change'
//     com by diferente de 'user') tocam UM efeito de conjunto, não uma metralhadora;
//   · ajustes automáticos (by: 'auto') ficam em silêncio: o gesto que os causou já fez o seu som;
//   · a mesma chave não repete em menos de 60 ms (140 ms para texto digitado).
//
// Para trocar o som de um evento sem mexer aqui: audio.bind(bus, { map: { 'change:shape': 'tap',
// 'step:resumo': null, 'tool:photo': (detalhe) => ({ name: 'camera', opts: { gain: 0.6 } }) } }).
import { SCENES } from './audio-theory.js';

/** Som de cada decoração ao ser colocada: macia (fruta, doce), dura (chocolate, acrílico) ou confeito que cai. */
export const DECOR_SOUND = {
  frutas: 'place-soft',
  morangos: 'place-soft',
  cerejas: 'place-soft',
  flores: 'place-soft',
  margaridas: 'place-soft',
  peonias: 'place-soft',
  macarons: 'place-soft',
  brigadeiros: 'place-soft',
  suspiros: 'place-soft',
  marshmallows: 'place-soft',
  borboletas: 'place-soft',
  bombons: 'place-hard',
  biscoitos: 'place-hard',
  wafer: 'place-hard',
  pirulitos: 'place-hard',
  topo: 'place-hard',
  baloes: 'place-hard',
  lacos: 'place-hard',
  velas: 'place-hard',
  raspas: 'sprinkle',
  granulado: 'sprinkle',
  confete: 'sprinkle',
  perolas: 'sprinkle',
  ouro: 'sprinkle',
  coracoes: 'sprinkle',
};
const MATERIAL = { soft: 'place-soft', hard: 'place-hard', sprinkle: 'sprinkle' };

const idOf = (v) => (v && typeof v === 'object' ? v.id : v);
const num = (v) => (typeof v === 'number' ? v : parseFloat(v && typeof v === 'object' ? v.n ?? v.count ?? v.value : v));
const SIZE_ORDER = { p: 0, m: 1, g: 2, baixo: 0, padrao: 1, alto: 2 };
const order = (v) => (idOf(v) in SIZE_ORDER ? SIZE_ORDER[idOf(v)] : num(v));
const smaller = (d) => order(d.value) < order(d.prev);

function decorSound(value) {
  if (value && typeof value === 'object' && MATERIAL[value.material]) return MATERIAL[value.material];
  return DECOR_SOUND[idOf(value)] || 'place';
}

const COVER_STYLE = { liso: 'smooth', rustico: 'swipe', pente: 'scrape', respingo: 'sprinkle', seminaked: 'scrape' };

/** Efeito de conjunto de cada tipo de rajada. */
export const ENSEMBLE = { undo: 'undo', redo: 'redo', preset: 'magic', palette: 'magic', surprise: 'surprise', restart: 'whoosh' };

/** O mapa padrão. Valor: nome do efeito, { name, opts }, lista, null (silêncio) ou função do detalhe do evento. */
export const DEFAULT_MAP = {
  open: 'open',
  close: 'close',
  step: (d, ctx) => (ctx.back ? 'back' : { name: 'step', opts: { degree: Math.max(0, Math.min(7, ctx.index)) } }),
  'step:resumo': (d, ctx) => (ctx.back ? 'back' : [{ name: 'step', opts: { degree: 6 } }, { name: 'tada', opts: { delay: 0.28 } }]),
  cart: (d) => (d.editing ? 'save' : 'cash'),
  fit: (d) => (d.dropped && d.dropped.length ? 'notfit' : d.adapted ? { name: 'shake', opts: { gain: 0.7 } } : null),

  'tool:cutaway': (d) => (d.value === false ? 'close' : 'slice'),
  'tool:rotate': (d) => ({ name: 'toggle', opts: { on: d.value !== false } }),
  'tool:measure': (d) => ({ name: 'toggle', opts: { on: d.value !== false } }),
  'tool:view': 'tap',
  'tool:photo': 'camera',
  'tool:download': 'camera',
  'tool:share': 'pop',
  'tool:save': 'save',
  'tool:breakdown': 'open',
  tool: 'tap',

  'change:shape': 'plop',
  'change:size': (d) => ({ name: 'resize', opts: { dir: smaller(d) ? -1 : 1 } }),
  'change:tiers': (d) => (smaller(d) ? 'remove' : 'stack'),
  'change:height': (d) => ({ name: 'resize', opts: { dir: smaller(d) ? -1 : 1 } }),
  'change:base': 'place-hard',
  'change:layer.add': 'plop',
  'change:layer.remove': 'remove',
  'change:layer.flavor': { name: 'pour', opts: { dur: 0.65 } },
  'change:filling': 'spread',
  'change:cover.type': 'swipe',
  'change:cover.style': (d) => COVER_STYLE[idOf(d.value)] || 'swipe',
  'change:cover.color': 'smooth',
  'change:cover.color2': 'smooth',
  'change:cover.tier': 'tap',
  'change:drip.on': (d) => (d.value && idOf(d.value) !== 'off' ? 'drip' : 'remove'),
  'change:drip.color': 'drip',
  'change:piping.style': (d) => (!idOf(d.value) || idOf(d.value) === 'liso' ? 'remove' : 'pipe-run'),
  'change:piping.where': 'pipe-run',
  'change:piping.color': 'pipe',
  'change:decor.add': (d) => decorSound(d.value),
  'change:decor.remove': 'remove',
  'change:decor.clear': 'whoosh',
  'change:decor.arr': { name: 'shake', opts: { gain: 0.8 } },
  'change:decor.qty': (d) => (decorSound(d.value) === 'sprinkle' ? 'sprinkle' : 'place'),
  'change:decor.color': 'select',
  'change:candles.count': (d) => (smaller(d) ? 'remove' : 'place-hard'),
  'change:candles.style': (d) => (idOf(d.value) === 'faisca' ? 'sparkle' : 'match'),
  'change:candles.number': 'tap',
  'change:message.text': 'pipe',
  'change:message.mode': 'toggle',
  'change:message.color': 'select',
  'change:topper.text': 'tap',
  'change:topper.color': 'select',
  'change:name': null,
  'change:backdrop': 'select',
  // as chaves "gerais" que anunciam uma rajada caem no efeito de conjunto (ver route)
  // (r5-tela: mover uma peça colocada à mão muda x e z de uma vez — quem soa é o gesto, não cada coordenada)
  change: (d) => (String(d.key || '').startsWith('decor.placed.') ? null : 'select'),

  // r5-tela ↓ eventos do ateliê (js/atelier/README.md §1)
  cue: null, // marcas de som da cena: tocadas por audio.bind (ver cueSound: há laços com começo e fim)
  photo: null, // 'tool:photo' já faz o clique da câmera
  reveal: null, // a revelação soa pelas marcas ('cue') da cena — ou, sem ela, pelas que a tela emite
  mode: (d) => (d.mode === 'atelie' ? { name: 'toggle', opts: { on: true } } : null),
  'bo.action': 'pop',
  'tool:reveal': 'sparkle',
  'tool:ficha': 'open',
  'tool:link': 'pop',
  'tool:scene': 'whoosh',
  'tool:hand': (d) => ({ name: 'toggle', opts: { on: d.value !== false } }), // arranjos prontos × uma a uma
  'tool:pick': (d) => (d.value ? 'pop' : 'tap'), // pegou / soltou a peça
  'change:drip.amount': 'drip',
  // peças colocadas à mão: colocar soa pelo gesto; tirar soa como tirar
  'change:decor.placed': (d) => (count(d.value) < count(d.prev) ? (count(d.value) ? 'remove' : 'whoosh') : null),
  gesture(d) {
    const v = d.value && typeof d.value === 'object' ? d.value : {};
    if (d.id === 'place') return d.phase !== 'end' ? null : v.ok === false ? 'notfit' : decorSound(v.id);
    if (d.id === 'drip') return d.phase === 'end' && !v.silent ? (v.max ? { name: 'shake', opts: { gain: 0.6 } } : 'drip') : null;
    // com a cena, acender, soprar e espalhar soam pelas marcas dela (value.cued); sem ela, por aqui
    if (d.id === 'light') return d.phase === 'end' && !v.cued ? [{ name: 'match', opts: {} }, { name: 'flame', opts: { delay: 0.3 } }] : null;
    if (d.id === 'blow') return d.phase === 'end' && !v.cued ? 'blow' : null;
    if (d.id === 'spread') return v.cued ? null : d.phase === 'move' ? { name: 'spread', opts: { gain: 0.7 } } : d.phase === 'end' ? 'smooth' : null;
    // a volta que o bolo dá sozinho soa; o giro com o dedo fica em silêncio (acontece o tempo todo)
    if (d.id === 'spin') return d.phase === 'start' && d.value === 'auto' ? { name: 'whoosh', opts: { gain: 0.5 } } : null;
    return null;
  },
  // jogo (js/atelier/game): encomenda aceita, nota, figurinha
  'game.start': 'hint',
  'game.score': (d) => (d.stars >= 3 ? [{ name: 'tada', opts: {} }, { name: 'applause', opts: { delay: 0.3 } }] : d.stars === 2 ? 'tada' : 'coin'),
  'game.sticker': (d) => (d.first === false ? null : 'sparkle'),
  'game.end': null,
  // r5-tela ↑
};

const count = (v) => (Array.isArray(v) ? v.length : 0);

/**
 * r5-tela — Uma marca de som da cena ({ name, at, dur, count, part, kind }) → o que tocar:
 * { name, opts, key, loop: 'start' | 'stop' | null }. `key` identifica o laço (o 'stop' fecha o 'start' de mesmo nome e parte).
 */
export function cueSound(cue) {
  if (!cue || !cue.name) return null;
  const opts = { delay: Math.max(0, Number(cue.at) || 0) };
  if (cue.dur > 0) opts.dur = cue.dur;
  if (cue.count > 1) opts.count = cue.count;
  return { name: String(cue.name), opts, key: `${cue.name}:${cue.part ?? ''}`, loop: cue.kind === 'start' ? 'start' : cue.kind === 'stop' ? 'stop' : null };
}

const SLOW_KEYS = new Set(['message.text', 'topper.text', 'name']);
const BURST_MS = 400;

function normalize(result) {
  if (!result) return [];
  const list = Array.isArray(result) ? result : [result];
  return list.filter(Boolean).map((r) => (typeof r === 'string' ? { name: r, opts: {} } : { name: r.name, opts: r.opts || {} }));
}

/**
 * Cria o roteador de eventos. now = relógio em milissegundos (trocável nos testes).
 * Devolve route(tipo, detalhe) → [{ name, opts }].
 */
/**
 * r5-tela — O que a cena do ateliê anima (e, portanto, sonoriza pelas marcas 'cue', na hora certa de cada batida).
 * Com a cena ligada (opção `cued` do roteador), a escolha dessas chaves faz só um clique de interface na hora do
 * toque: o som "de confeitaria" vem da animação. Sem isso, o mesmo som tocaria duas vezes (no toque e na batida).
 */
export const CUED_KEYS = new Set([
  'shape', 'size', 'tiers', 'height', 'base',
  'layer.add', 'layer.remove', 'layer.flavor', 'filling', 'soak',
  'cover.type', 'cover.style', 'cover.color', 'cover.color2', 'cover.tier',
  'drip.on', 'drip.amount',
  'piping.style', 'piping.where',
  'decor.add', 'decor.remove', 'decor.clear',
]);

export function createRouter({ map = {}, cued = null, now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) } = {}) {
  const table = { ...DEFAULT_MAP, ...map };
  const last = new Map();
  let burst = { group: null, until: -Infinity };
  let stepIndex = -1;

  const pick = (keys, detail, ctx) => {
    for (const k of keys) {
      if (!(k in table)) continue;
      const entry = table[k];
      return normalize(typeof entry === 'function' ? entry(detail, ctx) : entry);
    }
    return [];
  };

  return function route(type, detail = {}) {
    const t = now();
    try {
      if (type === 'change') {
        const key = String(detail.key || '');
        const by = detail.by || 'user';
        if (by === 'auto') return [];
        const group = by !== 'user' ? by : key in ENSEMBLE ? key : null;
        if (group) {
          const same = burst.group === group && t < burst.until;
          burst = { group, until: t + BURST_MS };
          if (same) return [];
          return `ensemble:${group}` in table ? pick([`ensemble:${group}`], detail, {}) : normalize(ENSEMBLE[group] || 'select');
        }
        const gap = SLOW_KEYS.has(key) ? 140 : 60;
        if (t - (last.get(key) ?? -Infinity) < gap) return [];
        last.set(key, t);
        // r5-tela: a cena está animando esta mudança — as marcas dela trazem o som; aqui fica só o clique do toque
        if (CUED_KEYS.has(key) && typeof cued === 'function' && cued()) return [{ name: 'tap', opts: { gain: 0.6 } }];
        return pick([`change:${key}`, 'change'], detail, {});
      }
      if (type === 'step') {
        const index = typeof detail.index === 'number' ? detail.index : SCENES.indexOf(detail.id);
        const prev = typeof detail.prev === 'number' ? detail.prev : detail.prev != null ? SCENES.indexOf(detail.prev) : stepIndex;
        stepIndex = index;
        if (prev === index) return [];
        return pick([`step:${detail.id}`, 'step'], detail, { index, back: prev >= 0 && index < prev });
      }
      if (type === 'tool') return pick([`tool:${detail.id}`, 'tool'], detail, {});
      if (type === 'open') stepIndex = -1;
      return pick([type], detail, {});
    } catch {
      return []; // um evento estranho nunca derruba o som
    }
  };
}
