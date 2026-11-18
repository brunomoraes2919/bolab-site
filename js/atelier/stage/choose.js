// BOLAB — Ateliê / Cena: lógica pura das animações de preparo (sem tela, sem 3D: roda no Node).
//
//   chooseAnimations(prev, next, { by })  → [{ name, …parâmetros }]   qual animação cada mudança do bolo pede
//   timeline(name, params)                → { dur, cues: [{ name, at, dur?, count?, part?, kind }], …batidas }
//   decorStyle(id)                        → como a peça pousa ('hard' quica, 'soft' pousa macio, 'sprinkle' chove…)
//
// A linha do tempo é a ÚNICA fonte dos instantes: o desenho (anims.js) e as marcas de som saem dos mesmos
// números, então cada "plop" que se vê tem a marca no mesmo instante. Teste: tools/tests/atelier_stage.test.mjs.
import { diffConfig } from '../diff.js';
import { getDecor } from '../../data/customizer.js';

/** Todas as animações que `play(name)` aceita (contrato do ateliê, §2). */
export const ANIMS = ['intro', 'layer', 'filling', 'soak', 'cover', 'style', 'drip', 'piping', 'decor', 'remove', 'candles.light', 'candles.blow', 'cut', 'resize', 'tier', 'reveal', 'celebrate'];

/** Mudanças que não vieram do dedo da pessoa numa opção: transição curta em vez da animação longa. */
export const QUICK_BY = new Set(['undo', 'redo', 'preset', 'surprise', 'auto', 'palette', 'restart']);

/** Sons que tocam em laço (o áudio recebe 'start' e 'stop'); os demais são batidas ('hit'). */
export const LOOPS = new Set(['pour', 'spread', 'smooth', 'sprinkle']);

const SPRINKLE_IDS = new Set(['raspas', 'gotas', 'crocantes', 'coco', 'pipoca']);
const SOFT_IDS = new Set(['marshmallows', 'suspiros', 'pompons', 'nuvens', 'luanuvens']);

/**
 * Como uma decoração chega ao bolo. style: 'sprinkle' (chuva de confeitos) · 'hard' (doce: cai e quica) ·
 * 'fruit' (fruta: cai e dá um quique curto) · 'soft' (flor: pousa macio) · 'place' (peça no palito ou
 * modelada: desce e firma) · 'candles' (velas: fincadas e acesas). cue = o som de cada pouso.
 */
export function decorStyle(id) {
  if (id === 'velas') return { style: 'candles', cue: 'place' };
  if (id === 'toppers' || id === 'toponome' || id === 'escrita') return { style: 'place', cue: id === 'escrita' ? 'pipe-run' : 'place' };
  if (id === 'respingo') return { style: 'sprinkle', cue: 'sprinkle' };
  const group = getDecor(id)?.group || '';
  if (group === 'brilho' || SPRINKLE_IDS.has(id)) return { style: 'sprinkle', cue: 'sprinkle' };
  if (SOFT_IDS.has(id) || group === 'flores') return { style: 'soft', cue: 'place-soft' };
  if (group === 'frutas') return { style: 'fruit', cue: 'place' };
  if (group === 'doces' || group === 'chocolate') return { style: 'hard', cue: 'place-hard' };
  return { style: 'place', cue: 'place' };
}

const isStructure = (key) => key === 'shape' || key === 'size' || key === 'tiers';

/**
 * Qual animação cada mudança pede, na ordem em que o confeiteiro faria. Lista vazia = nada mudou (ou só
 * mudou o que não se anima: nome, fundo, cor do bico…). `by` fora do toque numa opção devolve só `swap`.
 * Bicos e decorações NOVOS não saem daqui: o motor avisa quando cada peça nasce (ela é construída num quadro
 * próprio) e a cena pendura a animação nesse aviso. Aqui saem só as que foram retiradas (`remove`).
 */
export function chooseAnimations(prev, next, { by = 'user' } = {}) {
  if (!prev || !next) return [];
  const diff = diffConfig(prev, next);
  const visible = diff.filter((d) => d.key !== 'name' && d.key !== 'backdrop');
  if (!visible.length) return [];
  if (QUICK_BY.has(by)) return [{ name: 'swap', by }];
  const has = (key) => diff.find((d) => d.key === key);
  const all = (key) => diff.filter((d) => d.key === key);
  const out = [];

  // estrutura: o bolo inteiro é refeito — uma animação só, e o resto entra junto
  // ('height' não conta: é derivada do número de camadas, que tem a animação dela)
  if (diff.some((d) => isStructure(d.key))) {
    const tiers = has('tiers');
    if (tiers && (tiers.value || 1) > (tiers.prev || 1) && !has('shape') && !has('size')) out.push({ name: 'tier', index: (tiers.value || 1) - 1 });
    else out.push({ name: 'resize', what: has('shape') ? 'shape' : has('size') ? 'size' : 'tiers' });
    return out;
  }
  if (has('base')) out.push({ name: 'intro', only: 'base' });

  // massa
  const added = all('layer.add');
  const removed = all('layer.remove');
  if (added.length) added.forEach((d) => out.push({ name: 'layer', mode: 'add', index: d.value.index }));
  else if (removed.length) out.push({ name: 'layer', mode: 'remove', index: Math.min(...removed.map((d) => d.value.index)) });
  all('layer.flavor').forEach((d) => out.push({ name: 'layer', mode: 'swap', index: d.value.index }));

  // recheio (o vão que nasceu junto com uma camada nova já entra na animação da camada)
  const born = new Set(added.map((d) => d.value.index - 1));
  all('filling').forEach((d) => !born.has(d.value.index) && out.push({ name: 'filling', index: d.value.index }));
  all('filling.add').forEach((d) => d.value.id && !out.some((o) => o.name === 'filling' && o.index === d.value.index) && out.push({ name: 'filling', index: d.value.index, extra: true }));
  const soak = has('soak');
  if (soak && soak.value) out.push({ name: 'soak' });

  // cobertura: tipo = aplicar de novo; cor = uma demão; estilo = passada de pente ou espátula
  const tierCover = all('cover.tier');
  if (has('cover.type')) out.push({ name: 'cover', mode: 'full' });
  else if (tierCover.length) {
    tierCover.forEach((d) => {
      if (d.value.index == null) out.push({ name: 'cover', mode: 'tint' });
      else if (!d.prev || d.prev.type !== d.value.type) out.push({ name: 'cover', mode: 'full', tier: d.value.index });
      else if (d.prev.style !== d.value.style) out.push({ name: 'style', tier: d.value.index });
      else out.push({ name: 'cover', mode: 'tint', tier: d.value.index });
    });
  } else if (has('cover.style') || has('cover.trim')) out.push({ name: 'style' });
  else if (has('cover.color') || has('cover.color2')) out.push({ name: 'cover', mode: 'tint' });

  // calda
  const dripOn = has('drip.on');
  if (dripOn && !dripOn.value) out.push({ name: 'remove', part: 'calda' });
  else if (next.drip?.on && (dripOn || has('drip.amount') || has('drip.length') || has('drip.half'))) out.push({ name: 'drip' });

  // bico e decorações retirados
  const pipe = has('piping.style');
  if (pipe && pipe.value === 'liso') out.push({ name: 'remove', part: 'bico' });
  const clear = has('decor.clear');
  if (clear) out.push({ name: 'remove', ids: clear.value.ids.slice() });
  all('decor.remove').forEach((d) => out.push({ name: 'remove', id: d.value.id }));
  return out;
}

/* ───────── Linha do tempo ───────── */

const r3 = (v) => Math.round(v * 1000) / 1000;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Marca de som. Sons em laço saem como 'start' (com a duração) e ganham o 'stop' correspondente. */
function mark(list, name, at, extra = {}) {
  const loop = LOOPS.has(name) && extra.dur > 0;
  list.push({ name, at: r3(at), dur: r3(extra.dur || 0), count: extra.count || 1, part: extra.part || '', kind: extra.kind || (loop ? 'start' : 'hit') });
  if (loop) list.push({ name, at: r3(at + extra.dur), dur: 0, count: 1, part: extra.part || '', kind: 'stop' });
}

/** No máximo `max` batidas de uma sequência (as demais ficam mudas: 80 confeitos não são 80 sons). */
function sample(times, max) {
  if (times.length <= max) return times.slice();
  const out = [];
  for (let i = 0; i < max; i++) out.push(times[Math.round((i * (times.length - 1)) / (max - 1))]);
  return out;
}

/**
 * Duração, batidas e marcas de som de uma animação. Os parâmetros são contagens que só a cena conhece
 * (quantas pitangas, quantas gotas…); com os mesmos parâmetros o resultado é sempre o mesmo.
 * `speed` > 1 acelera tudo (o replay em time-lapse).
 */
export function timeline(name, p = {}) {
  const cues = [];
  const part = p.part || '';
  let out;
  switch (name) {
    case 'intro': {
      // a base chega e assenta na bailarina; o bolo desce em seguida
      const only = p.only === 'base';
      out = { dur: only ? 0.8 : 1.5, stand: 0.36, cake: 0.84 };
      mark(cues, 'whoosh', 0, { dur: 0.3 });
      mark(cues, 'place-hard', out.stand, { part: 'base' });
      if (!only) mark(cues, 'plop', out.cake, { part: 'bolo' });
      break;
    }
    case 'layer': {
      const mode = p.mode || 'add';
      if (mode === 'remove') {
        out = { dur: 0.6, open: 0.14, lift: 0.1 };
        mark(cues, 'remove', out.lift, { part });
      } else if (mode === 'swap') {
        // a camada sai, troca e volta ao lugar
        out = { dur: 1.0, open: 0.14, lift: 0.14, land: 0.56, close: 0.8 };
        mark(cues, 'whoosh', out.lift, { dur: 0.25, part });
        mark(cues, 'stack', out.land, { part });
      } else {
        // recheio do vão novo (se houver) e, por cima, o disco de massa que desce e assenta
        const fill = p.filling ? 0.36 : 0;
        out = { dur: 1.2 + fill, open: 0.14, fillAt: 0.14, fill, drop: 0.2 + fill, land: 0.58 + fill, close: 0.98 + fill };
        if (fill) {
          mark(cues, 'plop', out.fillAt + 0.06, { part: 'recheio' });
          mark(cues, 'spread', out.fillAt + 0.1, { dur: fill, part: 'recheio' });
        }
        mark(cues, 'whoosh', out.drop, { dur: 0.3, part });
        mark(cues, 'stack', out.land, { part });
      }
      break;
    }
    case 'filling': {
      out = { dur: 1.2, open: 0.14, lift: 0.12, plop: 0.3, spread: 0.36, spreadDur: 0.42, land: 0.9, close: 1.0 };
      mark(cues, 'plop', out.plop, { part });
      mark(cues, 'spread', out.spread, { dur: out.spreadDur, part });
      mark(cues, 'stack', out.land, { part });
      break;
    }
    case 'soak': {
      const n = clamp(p.count || 9, 3, 16);
      out = { dur: 1.2, open: 0.14, from: 0.22, step: 0.5 / n, fall: 0.22, count: n, close: 1.0 };
      mark(cues, 'pour', out.from, { dur: 0.6, part: 'massa' });
      sample(Array.from({ length: n }, (_, i) => out.from + out.fall + i * out.step), 5).forEach((t) => mark(cues, 'drip', t, { part: 'massa' }));
      break;
    }
    case 'cover': {
      if (p.mode === 'tint') {
        // uma demão: o prato dá uma volta e a espátula deixa a cor nova
        out = { dur: 1.2, top: 0, topDur: 0, side: 0.1, sideDur: 0.92 };
        mark(cues, 'spread', out.side, { dur: out.sideDur, part });
        mark(cues, 'swipe', out.side + out.sideDur, { part });
      } else {
        // creme no topo (plop), espalha (o prato começa a girar) e sobe pela lateral em uma volta
        out = { dur: 2.4, plop: 0.2, top: 0.26, topDur: 0.62, side: 0.9, sideDur: 1.25 };
        mark(cues, 'plop', out.plop, { part });
        mark(cues, 'spread', out.top, { dur: out.topDur, part });
        mark(cues, 'smooth', out.side, { dur: out.sideDur, part });
        mark(cues, 'swipe', out.side + out.sideDur, { part });
      }
      break;
    }
    case 'style': {
      out = { dur: 1.4, top: 0, topDur: 0, side: 0.12, sideDur: 1.05 };
      mark(cues, 'scrape', out.side, { dur: out.sideDur, part });
      mark(cues, 'swipe', out.side + out.sideDur, { part });
      break;
    }
    case 'drip': {
      // a calda é despejada em volta (uma volta do prato) e cada gota começa a escorrer quando o fio passa por ela
      const lens = Array.isArray(p.drops) && p.drops.length ? p.drops : [0.5];
      const pool = 0.3;
      const sweep = 1.25;
      const starts = lens.map((_, i) => pool + 0.06 + (lens.length > 1 ? i / lens.length : 0) * sweep);
      const durs = lens.map((len) => 0.38 + 0.5 * clamp(len, 0, 1));
      const end = Math.max(...starts.map((t, i) => t + durs[i]));
      out = { dur: r3(end + 0.12), pool, sweep, starts: starts.map(r3), durs: durs.map(r3) };
      mark(cues, 'pour', 0.08, { dur: pool + sweep - 0.08, part });
      sample(starts.map((t, i) => t + durs[i] * 0.3), 12).forEach((t) => mark(cues, 'drip', t, { part }));
      break;
    }
    case 'piping': {
      // cada pitanga nasce do bico, uma atrás da outra
      const n = Math.max(1, p.count || 1);
      const step = r3(clamp(1.7 / n, 0.012, 0.12));
      out = { dur: r3(0.16 + n * step + 0.26), from: 0.16, step, grow: 0.18, count: n };
      if (n <= 14) for (let i = 0; i < n; i++) mark(cues, 'pipe', out.from + i * step, { part: 'bico' });
      else {
        mark(cues, 'pipe-run', out.from, { dur: n * step, count: n, part: 'bico' });
        mark(cues, 'pipe', out.from + n * step, { part: 'bico' });
      }
      break;
    }
    case 'decor': {
      const style = p.style || 'place';
      const n = Math.max(1, p.count || 1);
      if (style === 'sprinkle') {
        out = { dur: 1.3, from: 0.1, rain: 0.85, fall: 0.24, count: n, step: 0 };
        mark(cues, 'sprinkle', out.from + out.fall * 0.6, { dur: out.rain, count: n, part });
      } else {
        const step = r3(clamp(1.25 / n, 0.035, 0.17));
        const fall = style === 'soft' ? 0.42 : style === 'place' || style === 'candles' ? 0.3 : 0.26;
        const settle = style === 'hard' ? 0.42 : style === 'fruit' ? 0.3 : 0.24;
        out = { dur: r3(0.08 + (n - 1) * step + fall + settle), from: 0.08, step: r3(step), fall, settle, count: n };
        const cue = p.cue || (style === 'hard' ? 'place-hard' : style === 'soft' ? 'place-soft' : 'place');
        sample(Array.from({ length: n }, (_, i) => out.from + i * step + fall), 10).forEach((t) => mark(cues, cue, t, { part }));
      }
      break;
    }
    case 'remove': {
      out = { dur: 0.4, squash: 0.08 };
      mark(cues, 'remove', 0, { part });
      break;
    }
    case 'candles.light': {
      const n = Math.max(1, p.count || 1);
      const step = r3(clamp(0.9 / n, 0.06, 0.16));
      out = { dur: r3(0.3 + n * step + 0.3), from: 0.3, step: r3(step), flare: 0.26, count: n };
      mark(cues, 'match', 0, { part: 'velas' });
      sample(Array.from({ length: n }, (_, i) => out.from + i * step), 8).forEach((t) => mark(cues, 'flame', t, { part: 'velas' }));
      break;
    }
    case 'candles.blow': {
      out = { dur: 1.7, lean: 0.06, out: 0.2, outSpan: 0.28, smoke: 1.3, count: Math.max(1, p.count || 1) };
      mark(cues, 'blow', 0, { dur: 0.5, part: 'velas' });
      break;
    }
    case 'cut': {
      out = { dur: 1.9, knifeA: 0.22, knifeB: 0.56, open: 0.78, slide: 0.6, leave: 1.5 };
      mark(cues, 'slice', out.knifeA, { part: 'corte' });
      mark(cues, 'slice', out.knifeB, { part: 'corte' });
      mark(cues, 'whoosh', out.open, { dur: 0.4, part: 'corte' });
      break;
    }
    case 'resize': {
      out = { dur: 0.62 };
      mark(cues, p.what === 'shape' ? 'whoosh' : 'resize', 0, { part: 'bolo' });
      break;
    }
    case 'tier': {
      out = { dur: 1.05, drop: 0.08, land: 0.5 };
      mark(cues, 'whoosh', out.drop, { dur: 0.35 });
      mark(cues, 'stack', out.land, { part: `andar:${p.index ?? 1}` });
      break;
    }
    case 'reveal': {
      const seconds = clamp(p.seconds || 5, 1.5, 14);
      out = { dur: seconds, dim: 0.7, tada: r3(Math.min(seconds - 0.6, seconds * 0.82)) };
      mark(cues, 'whoosh', 0, { dur: 0.6 });
      mark(cues, 'sparkle', 0.5, { dur: seconds - 1 });
      mark(cues, 'tada', out.tada);
      break;
    }
    case 'celebrate': {
      out = { dur: 2.6, burst: 0.05 };
      mark(cues, 'confetti', out.burst, { count: p.count || 1 });
      mark(cues, 'tada', out.burst + 0.05);
      break;
    }
    case 'swap': {
      out = { dur: 0.28 };
      mark(cues, 'plop', 0, { part: 'bolo' });
      break;
    }
    default:
      out = { dur: 0 };
  }
  const speed = p.speed > 0 ? p.speed : 1;
  if (speed !== 1) {
    // tudo o que é instante ou duração encolhe junto (listas inclusive); contagens ficam
    Object.keys(out).forEach((k) => {
      if (k === 'count') return;
      if (typeof out[k] === 'number') out[k] = r3(out[k] / speed);
      else if (Array.isArray(out[k])) out[k] = out[k].map((v) => r3(v / speed));
    });
    cues.forEach((c) => {
      c.at = r3(c.at / speed);
      c.dur = r3(c.dur / speed);
    });
  }
  out.cues = cues.sort((a, b) => a.at - b.at);
  return out;
}

/** Com `prefers-reduced-motion`: nada de animação, só a batida principal de cada mudança (num instante). */
export function reducedCues(name, p = {}) {
  const main = { intro: 'plop', layer: p.mode === 'remove' ? 'remove' : 'stack', filling: 'plop', soak: 'drip', cover: 'swipe', style: 'swipe', drip: 'drip', piping: 'pipe', decor: p.cue || 'place', remove: 'remove', 'candles.light': 'flame', 'candles.blow': 'blow', cut: 'slice', resize: 'resize', tier: 'stack', reveal: 'tada', celebrate: 'tada', swap: 'plop' }[name];
  return main ? [{ name: main, at: 0, dur: 0, count: 1, part: p.part || '', kind: 'hit' }] : [];
}

/**
 * O roteiro do replay: os passos de `cake.assembly()` viram animações em sequência, e o conjunto é
 * acelerado ou esticado para caber em `seconds` (8 a 12 s). → { total, speed, steps: [{ at, name, dur, id, … }] }
 */
export function replayPlan(steps, { seconds = 10, counts = {} } = {}) {
  const list = [];
  let t = 0;
  const add = (name, params, overlap = 0) => {
    const tl = timeline(name, params);
    const at = Math.max(0, t - overlap);
    list.push({ at, name, dur: tl.dur, params });
    t = at + tl.dur;
  };
  add('intro', { only: 'base' });
  const byTier = new Map();
  (steps || []).forEach((s) => {
    if (s.kind === 'base') return;
    if (s.kind === 'massa' || s.kind === 'recheio') {
      // cada disco de massa e cada recheio: entram encavalados, é uma pilha subindo
      const tl = timeline(s.kind === 'massa' ? 'layer' : 'filling', {});
      const dur = s.kind === 'massa' ? 0.62 : 0.5;
      list.push({ at: t, name: s.kind === 'massa' ? 'layer' : 'filling', dur, params: { id: s.id, tier: s.tier, index: s.index, replay: true }, full: tl.dur });
      t += dur * 0.72;
      return;
    }
    if (s.kind === 'cobertura') {
      if (!byTier.has('cover')) {
        byTier.set('cover', true);
        t += 0.2;
        add('cover', { mode: 'full', replay: true });
      }
      return;
    }
    if (s.kind === 'calda') {
      if (!byTier.has('drip')) {
        byTier.set('drip', true);
        add('drip', { drops: counts.drops || [0.5, 0.8, 0.4, 0.9, 0.6], replay: true }, 0.1);
      }
      return;
    }
    if (s.kind === 'bico') add('piping', { count: counts.bico || 24, replay: true }, 0.1);
    else if (s.kind === 'decor') {
      const id = s.id.split(':')[1];
      const st = decorStyle(id);
      add('decor', { id, style: st.style, cue: st.cue, count: counts[s.id] || 8, part: s.id, replay: true }, 0.25);
    }
  });
  const raw = t + 0.5;
  const target = clamp(seconds, 4, 20);
  const speed = r3(raw / target);
  return {
    total: r3(raw / speed),
    speed,
    steps: list.map((s) => ({ ...s, at: r3(s.at / speed), dur: r3(s.dur / speed), params: { ...s.params, speed } })),
  };
}
