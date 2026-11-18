// BOLAB — Ateliê: a teoria musical da trilha de fundo (só números; nada de som aqui).
//
// A música do personalizador não é um arquivo: ela é composta na hora, compasso a compasso.
// Este arquivo decide O QUE tocar (acordes, condução de vozes, baixo, ritmo, frases); quem
// transforma isso em som é js/atelier/audio-music.js. Como aqui só há números, tudo pode ser
// testado sem navegador (tools/tests/audio.test.mjs confere que cada nota pertence à harmonia
// do compasso, que as vozes andam por grau conjunto e que cada instrumento fica na sua tessitura).
//
//   const composer = createComposer('bossa', { seed: 7 });
//   const bar = composer.next('cobertura');   // um compasso pronto para a etapa "cobertura"
//   bar.segments → [{ start, dur, chord: { name, root, type, bass }, voicing }]
//   bar.events   → [{ inst, role, midi, beat, dur, vel, shift }]   (role: 'bass' | 'chord' | 'melody' | 'perc')
//
// Alturas em número MIDI (60 = dó central); tempo em batidas dentro do compasso.

/** As sete etapas do personalizador, na ordem. A posição é a "intensidade" da música (0 a 6). */
export const SCENES = ['formato', 'massa', 'recheio', 'cobertura', 'acabamento', 'decoracao', 'resumo'];
export const levelOf = (scene) => Math.max(0, SCENES.indexOf(scene));

/** Gerador de números ao acaso que pode ser repetido (mesma semente = mesma música). */
export function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mod12 = (n) => ((n % 12) + 12) % 12;
export const pcOf = (midi) => mod12(midi);
/** A nota de classe `pc` dentro da oitava que começa em `lo` (lo … lo+11). */
export const pitchIn = (pc, lo) => lo + mod12(pc - lo);
/** Todas as notas de classe `pc` entre lo e hi. */
function placements(pc, lo, hi) {
  const out = [];
  for (let m = pitchIn(pc, lo); m <= hi; m += 12) out.push(m);
  return out;
}

/**
 * Tipos de acorde. Intervalos em semitons acima da fundamental.
 *   tones    notas do acorde            tensions  tensões que soam bem por cima
 *   voicing  ordem de preferência das notas na mão (3ª e 7ª primeiro: são elas que definem o acorde;
 *            a fundamental fica com o baixo)
 *   alts     outras formas do mesmo acorde, usadas quando a preferida obrigaria a uma segunda menor
 *   scale    notas permitidas para uma frase melódica sobre o acorde (sem "notas a evitar")
 *   arp      ordem do arpejo (valsa)    fifth     a "quinta" que o baixo pode tocar
 */
export const CHORD_TYPES = {
  maj9: { tones: [0, 4, 7, 11], tensions: [2, 9], voicing: [4, 11, 2, 7], alts: [[4, 9, 2, 7]], scale: [0, 2, 4, 7, 9, 11], arp: [0, 4, 7, 11], fifth: 7 },
  maj7: { tones: [0, 4, 7, 11], tensions: [2, 9], voicing: [4, 11, 7, 2], scale: [0, 2, 4, 7, 9, 11], arp: [0, 4, 7, 11], fifth: 7 },
  '6/9': { tones: [0, 4, 7, 9], tensions: [2], voicing: [4, 9, 2, 7], scale: [0, 2, 4, 7, 9], arp: [0, 4, 7, 9], fifth: 7 },
  m9: { tones: [0, 3, 7, 10], tensions: [2, 5], voicing: [3, 10, 2, 7], alts: [[3, 10, 7, 0], [3, 10, 7, 5]], scale: [0, 2, 3, 5, 7, 10], arp: [0, 3, 7, 10], fifth: 7 },
  m7: { tones: [0, 3, 7, 10], tensions: [5], voicing: [3, 10, 7, 0], scale: [0, 3, 5, 7, 10], arp: [0, 3, 7, 10], fifth: 7 },
  m6: { tones: [0, 3, 7, 9], tensions: [2], voicing: [3, 9, 7, 2], alts: [[3, 9, 7, 0]], scale: [0, 2, 3, 7, 9], arp: [0, 3, 7, 9], fifth: 7 },
  13: { tones: [0, 4, 7, 10], tensions: [2, 9], voicing: [10, 4, 9, 2], alts: [[10, 4, 2, 7]], scale: [0, 2, 4, 7, 9, 10], arp: [0, 4, 7, 10], fifth: 7 },
  7: { tones: [0, 4, 7, 10], tensions: [2], voicing: [4, 10, 0, 7], scale: [0, 2, 4, 7, 9, 10], arp: [0, 4, 7, 10], fifth: 7 },
  '7b9': { tones: [0, 4, 7, 10], tensions: [1], voicing: [4, 10, 1, 7], scale: [0, 1, 4, 7, 10], arp: [0, 4, 7, 10], fifth: 7 },
  '7#11': { tones: [0, 4, 7, 10], tensions: [2, 6], voicing: [4, 10, 2, 7], scale: [0, 2, 4, 6, 7, 10], arp: [0, 4, 7, 10], fifth: 7 },
  '9sus': { tones: [0, 5, 7, 10], tensions: [2, 9], voicing: [5, 10, 2, 7], scale: [0, 2, 5, 7, 9, 10], arp: [0, 5, 7, 10], fifth: 7 },
  '7sus4': { tones: [0, 5, 7, 10], tensions: [2], voicing: [5, 10, 0, 7], scale: [0, 2, 5, 7, 9, 10], arp: [0, 5, 7, 10], fifth: 7 },
  dim7: { tones: [0, 3, 6, 9], tensions: [], voicing: [0, 3, 6, 9], scale: [0, 3, 6, 9], arp: [0, 3, 6, 9], fifth: 6 },
  maj: { tones: [0, 4, 7], tensions: [2], voicing: [0, 4, 7], scale: [0, 2, 4, 7, 9], arp: [0, 4, 7], fifth: 7 },
  add9: { tones: [0, 2, 4, 7], tensions: [], voicing: [0, 4, 7, 2], scale: [0, 2, 4, 7, 9], arp: [0, 4, 7, 14], fifth: 7 },
};

const DOMINANT = new Set(['13', '7', '7b9', '7#11', '9sus', '7sus4']);

/** Onde uma frase pode repousar: notas do acorde (e a 9ª natural, menos nas dominantes, que pedem resolução). */
function restPcs(chord) {
  const def = CHORD_TYPES[chord.type];
  const list = DOMINANT.has(chord.type) || !def.tensions.includes(2) ? def.tones : [...def.tones, 2];
  return list.map((iv) => mod12(chord.root + iv));
}

/** As classes de altura (0–11) de um conjunto de intervalos do acorde. */
export function chordPcs(chord, which = 'tones') {
  const def = CHORD_TYPES[chord.type];
  const list = which === 'all' ? [...def.tones, ...def.tensions] : which === 'scale' ? [...def.scale, ...def.tones, ...def.tensions] : def[which];
  return [...new Set(list.map((iv) => mod12(chord.root + iv)))];
}

/**
 * Condução de vozes: escolhe em que oitava vai cada nota do acorde para a mão mexer o mínimo
 * possível em relação ao acorde anterior (`prev`), sem segundas menores nem nonas menores entre
 * as vozes, sem abrir mais que uma nona e sem embolar no grave. Devolve as notas em ordem crescente.
 */
export function voiceChord(chord, { lo, hi, n = 4, prev = null, center = (lo + hi) / 2, floor = -Infinity, maxSpan = 14 } = {}) {
  const def = CHORD_TYPES[chord.type];
  let best = null;
  let bestScore = Infinity;
  [def.voicing, ...(n >= 4 ? def.alts || [] : [])].forEach((shape, rank) => {
    const lists = shape.slice(0, n).map((iv) => placements(mod12(chord.root + iv), lo, hi));
    const acc = [];
    const visit = (i) => {
      if (i === lists.length) {
        const v = [...acc].sort((a, b) => a - b);
        const s = voicingScore(v, { prev, center, floor, maxSpan }) + rank * 3; // a forma preferida ganha no empate
        if (s < bestScore) {
          bestScore = s;
          best = v;
        }
        return;
      }
      for (const m of lists[i]) {
        acc.push(m);
        visit(i + 1);
        acc.pop();
      }
    };
    visit(0);
  });
  return best || [];
}

/** Quanto um voicing "custa" (menor é melhor). Os defeitos de verdade custam caro. */
export function voicingScore(v, { prev = null, center = 62, floor = -Infinity, maxSpan = 14 } = {}) {
  let s = 0;
  for (let i = 0; i < v.length; i++) {
    for (let j = i + 1; j < v.length; j++) {
      const d = v[j] - v[i];
      if (d === 0) s += 1000; // nota dobrada
      else if (d === 1) s += 200; // segunda menor
      else if (d % 12 === 1) s += 120; // nona menor
    }
  }
  const span = v[v.length - 1] - v[0];
  if (span > maxSpan) s += 40 * (span - maxSpan);
  if (v[0] <= floor + 1) s += 300; // a mão não pode descer abaixo do baixo
  if (v.length > 1 && v[0] < 52 && v[1] - v[0] < 3) s += 30; // intervalo pequeno no grave embola
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  if (prev && prev.length === v.length) {
    for (let i = 0; i < v.length; i++) s += Math.abs(v[i] - prev[i]);
    s += 0.5 * Math.abs(v[v.length - 1] - prev[prev.length - 1]); // a voz de cima é a que mais se ouve
    s += 0.25 * Math.abs(mean - center); // puxa de volta ao centro para a mão não "escorregar" com o tempo
  } else {
    s += Math.abs(mean - center);
  }
  return s;
}

/** Defeitos de um voicing (lista vazia = limpo). Usado pelos testes. */
export function voicingFlaws(v) {
  const flaws = [];
  for (let i = 0; i < v.length; i++) {
    for (let j = i + 1; j < v.length; j++) {
      const d = v[j] - v[i];
      if (d === 0) flaws.push('nota dobrada');
      else if (d === 1) flaws.push('segunda menor');
      else if (d % 12 === 1) flaws.push('nona menor');
    }
  }
  return flaws;
}

/** Arpejo (valsa): começa na nota do baixo e sobe pelas notas do acorde, uma acima da outra. */
export function arpNotes(chord, lo, count = 4) {
  const def = CHORD_TYPES[chord.type];
  let pcs = def.arp.map((iv) => mod12(chord.root + iv));
  const at = pcs.indexOf(chord.bass);
  pcs = at >= 0 ? [...pcs.slice(at), ...pcs.slice(0, at)] : [chord.bass, ...pcs];
  const out = [pitchIn(pcs[0], lo)];
  for (let i = 1; i < pcs.length && out.length < count; i++) out.push(pitchIn(pcs[i], out[out.length - 1] + 1));
  return out;
}

/* ───────── As três trilhas ───────── */

// Um compasso da forma é uma lista de acordes: [nome, grau (semitons acima da tônica), tipo, baixo?, batidas?]
// `baixo` = intervalo acima da fundamental quando o acorde é invertido (ex.: Fá com baixo em Lá = 4).
const C = (name, rel, type, bass = 0, beats = 0) => ({ name, rel, type, bass, beats });

const BOSSA = {
  id: 'bossa',
  name: 'Bossa do ateliê',
  keyName: 'Ré maior',
  tonic: 2,
  bpm: 116,
  beats: 4,
  swing: 0.5,
  humanize: 0.007,
  /** A partir de que etapa (0–6) cada instrumento entra. */
  layers: { gtr: 0, bass: 1, shaker: 2, rim: 3, ep: 4, pad: 5, box: 6 },
  ranges: { gtr: [45, 72], bass: [33, 44], ep: [67, 81], pad: [54, 72], box: [79, 91] },
  // I | I | V7/ii | V7/ii | ii | V | iii | V7/ii | ii | iv6 | iii | bIII° | ii | subV | I | ii–V
  form: [
    [C('Dmaj9', 0, 'maj9')],
    [C('D6/9', 0, '6/9')],
    [C('B7(b9)', 9, '7b9')],
    [C('B7(b9)', 9, '7b9')],
    [C('Em9', 2, 'm9')],
    [C('A13', 7, '13')],
    [C('F#m7', 4, 'm7')],
    [C('B7(b9)', 9, '7b9')],
    [C('Em9', 2, 'm9')],
    [C('Gm6', 5, 'm6')],
    [C('F#m7', 4, 'm7')],
    [C('F°7', 3, 'dim7')],
    [C('Em9', 2, 'm9')],
    [C('Eb7(9)', 1, '7#11')],
    [C('Dmaj9', 0, 'maj9')],
    [C('Em9', 2, 'm9', 0, 2), C('A13', 7, '13', 0, 2)],
  ],
  // Resumo: repouso na tônica, com brilho. I6/9 | Imaj9 | IVmaj7 | V9sus
  tag: [[C('D6/9', 0, '6/9')], [C('Dmaj9', 0, 'maj9')], [C('Gmaj7', 5, 'maj7')], [C('A9sus', 7, '9sus')]],
  cadence: [C('A13', 7, '13')],
  compose: composeBossa,
};

const CAIXINHA = {
  id: 'caixinha',
  name: 'Caixinha de música',
  keyName: 'Fá maior',
  tonic: 5,
  bpm: 92,
  beats: 3,
  swing: 0.5,
  humanize: 0.004,
  layers: { box: 0, bass: 1, pad: 2, mel: 4, brush: 5, glock: 6 },
  ranges: { box: [62, 85], bass: [38, 49], pad: [52, 67], mel: [76, 91], glock: [86, 96] },
  // I | I6 | IV | V7sus | vi | ii | V7sus | V7 | I | V6 | vi | iv6 | I64 | V7 | I | I
  form: [
    [C('F', 0, 'maj')],
    [C('F/A', 0, 'maj', 4)],
    [C('Bb(add9)', 5, 'add9')],
    [C('C7sus4', 7, '7sus4')],
    [C('Dm7', 9, 'm7')],
    [C('Gm7', 2, 'm7')],
    [C('C7sus4', 7, '7sus4')],
    [C('C7', 7, '7')],
    [C('F', 0, 'maj')],
    [C('C/E', 7, 'maj', 4)],
    [C('Dm7', 9, 'm7')],
    [C('Bbm6', 5, 'm6')],
    [C('F/C', 0, 'maj', 7)],
    [C('C7', 7, '7')],
    [C('F', 0, 'maj')],
    [C('F(add9)', 0, 'add9')],
  ],
  tag: [[C('F(add9)', 0, 'add9')], [C('Bb(add9)', 5, 'add9')], [C('F/C', 0, 'maj', 7)], [C('C7', 7, '7')]],
  cadence: [C('C7', 7, '7')],
  compose: composeCaixinha,
};

const LOFI = {
  id: 'lofi',
  name: 'Tarde lo-fi',
  keyName: 'Mi bemol maior',
  tonic: 3,
  bpm: 76,
  beats: 4,
  swing: 0.57,
  humanize: 0.009,
  layers: { ep: 0, crackle: 0, bass: 1, kick: 2, hat: 2, snare: 3, pluck: 4, box: 6 },
  ranges: { ep: [53, 72], bass: [32, 43], pluck: [62, 79], box: [77, 89] },
  // ii V I vi | IV iii ii Vsus | ii V I vi | ii V I I
  form: [
    [C('Fm9', 2, 'm9')],
    [C('Bb13', 7, '13')],
    [C('Ebmaj9', 0, 'maj9')],
    [C('Cm9', 9, 'm9')],
    [C('Abmaj9', 5, 'maj9')],
    [C('Gm7', 4, 'm7')],
    [C('Fm9', 2, 'm9')],
    [C('Bb9sus', 7, '9sus')],
    [C('Fm9', 2, 'm9')],
    [C('Bb13', 7, '13')],
    [C('Ebmaj9', 0, 'maj9')],
    [C('Cm9', 9, 'm9')],
    [C('Fm9', 2, 'm9')],
    [C('Bb13', 7, '13')],
    [C('Ebmaj9', 0, 'maj9')],
    [C('Eb6/9', 0, '6/9')],
  ],
  tag: [[C('Ebmaj9', 0, 'maj9')], [C('Cm9', 9, 'm9')], [C('Abmaj9', 5, 'maj9')], [C('Bb9sus', 7, '9sus')]],
  cadence: [C('Bb13', 7, '13')],
  compose: composeLofi,
};

export const THEMES = { bossa: BOSSA, caixinha: CAIXINHA, lofi: LOFI };
export const THEME_LIST = [BOSSA, CAIXINHA, LOFI].map((t) => ({ id: t.id, name: t.name }));
export const DEFAULT_THEME = 'bossa';

/* ───────── O compositor ───────── */

/**
 * Compositor de uma trilha. A cada chamada de next(etapa) devolve o próximo compasso.
 * A troca de etapa acontece sempre na barra de compasso; ao chegar no resumo, um compasso de
 * dominante prepara a resolução na tônica (se o acorde anterior já não for uma dominante).
 */
export function createComposer(themeId, { seed = (Math.random() * 4294967296) >>> 0 } = {}) {
  const theme = THEMES[themeId] || BOSSA;
  const rnd = rngFrom(seed);
  const st = { n: 0, pos: 0, tag: 0, section: 'form', last: null, voic: {}, mel: null, quiet: 2, pat: 0 };

  function harmony(level) {
    let defs;
    if (level >= 6) {
      if (st.section === 'form') {
        const resolved = st.last && DOMINANT.has(st.last.type) && (st.last.rel === 7 || st.last.rel === 1);
        st.section = resolved || !st.last ? 'tag' : 'cadence';
        st.tag = 0;
        defs = st.section === 'cadence' ? theme.cadence : null;
      } else if (st.section === 'cadence') {
        st.section = 'tag';
      }
      if (!defs) defs = theme.tag[st.tag++ % theme.tag.length];
    } else {
      if (st.section !== 'form') {
        st.section = 'form';
        st.pos = 0;
      }
      defs = theme.form[st.pos++ % theme.form.length];
    }
    let start = 0;
    return defs.map((d) => {
      const dur = d.beats || theme.beats;
      const root = mod12(theme.tonic + d.rel);
      const seg = { start, dur, chord: { name: d.name, root, type: d.type, bass: mod12(root + d.bass), rel: d.rel } };
      start += dur;
      st.last = d;
      return seg;
    });
  }

  return {
    theme,
    seed,
    /** Posição na forma (para depuração e testes). */
    get state() {
      return { bar: st.n, pos: st.pos, section: st.section };
    },
    next(scene) {
      const level = typeof scene === 'number' ? Math.max(0, Math.min(6, scene)) : levelOf(scene);
      const segments = harmony(level);
      const events = [];
      const bar = st.n++;
      const ctx = {
        theme,
        level,
        bar,
        segments,
        st,
        rnd,
        section: st.section,
        segAt: (beat) => segments.find((s) => beat >= s.start && beat < s.start + s.dur) || segments[segments.length - 1],
        add: (ev) => events.push({ dur: 0.5, vel: 0.5, shift: 0, ...ev }),
      };
      theme.compose(ctx);
      events.sort((a, b) => a.beat - b.beat);
      const secPerBeat = 60 / theme.bpm;
      return { index: bar, scene: SCENES[level], level, section: st.section, beats: theme.beats, bpm: theme.bpm, dur: theme.beats * secPerBeat, segments, events };
    },
  };
}

/** Frase curta e esparsa (2 a 4 notas), por grau conjunto, terminando numa nota do acorde. Nunca se repete igual. */
function fillPhrase(c, { inst, lo, hi, prob, vel = 0.42 }) {
  const { st, rnd, theme } = c;
  st.quiet++;
  if (st.quiet < 2 || rnd() > prob) return;
  st.quiet = 0;
  const n = 2 + Math.floor(rnd() * 3);
  const last8 = theme.beats * 2 - 1;
  let e = 1 + Math.floor(rnd() * 3);
  let prev = null;
  let dir = rnd() < 0.5 ? 1 : -1;
  for (let i = 0; i < n && e <= last8; i++) {
    const beat = e / 2;
    const seg = c.segAt(beat);
    const isLast = i === n - 1 || e >= last8 - 1;
    const pcs = isLast ? restPcs(seg.chord) : prev == null ? chordPcs(seg.chord, 'all') : chordPcs(seg.chord, 'scale');
    const cands = [];
    for (let m = lo; m <= hi; m++) if (pcs.includes(mod12(m))) cands.push(m);
    let pick;
    if (prev == null) {
      const target = st.mel != null ? st.mel : lo + (hi - lo) * (0.35 + rnd() * 0.3);
      pick = cands.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
    } else {
      // grau conjunto na direção da frase; perto da borda da tessitura, a frase vira
      if (prev + dir * 4 > hi || prev + dir * 4 < lo) dir = -dir;
      const near = cands.filter((m) => m !== prev && (m - prev) * dir > 0 && Math.abs(m - prev) <= 4);
      const any = cands.filter((m) => m !== prev && Math.abs(m - prev) <= 5);
      const pool = (near.length ? near : any.length ? any : cands).sort((x, y) => Math.abs(x - prev) - Math.abs(y - prev));
      pick = pool[Math.floor(rnd() * Math.min(pool.length, 2))];
      if (rnd() < 0.3) dir = -dir;
    }
    const step = isLast ? 0 : 1 + (rnd() < 0.45 ? 1 : 0);
    const room = seg.start + seg.dur - beat; // a nota não invade o acorde seguinte
    const dur = isLast ? Math.min(room, 1 + rnd()) : Math.min(room, step / 2);
    c.add({ inst, role: 'melody', midi: pick, beat, dur, vel: vel * (0.85 + rnd() * 0.3) * (isLast ? 0.9 : 1) });
    prev = pick;
    e += step;
    if (isLast) break;
  }
  st.mel = prev;
}

/** Brilhos esparsos no agudo (resumo): duas ou três notas do acorde subindo. */
function sparkle(c, { inst, lo, hi, vel = 0.24, slots }) {
  const { rnd } = c;
  let prev = null;
  for (const beat of slots) {
    if (rnd() < 0.3) continue;
    const seg = c.segAt(beat);
    const pcs = chordPcs(seg.chord, 'all');
    const cands = [];
    for (let m = lo; m <= hi; m++) if (pcs.includes(mod12(m)) && (prev == null || m > prev)) cands.push(m);
    if (!cands.length) break;
    const pick = cands[Math.floor(rnd() * Math.min(cands.length, 3))];
    c.add({ inst, role: 'chord', midi: pick, beat, dur: 1, vel: vel * (0.8 + rnd() * 0.4) });
    prev = pick;
  }
}

/* Bossa nova: violão de náilon (baixo no polegar + acorde nos dedos, na clave da bossa), baixo
   redondo, ganzá, aro, piano elétrico em frases curtas. Colcheias retas, sem swing. */
function composeBossa(c) {
  const { level, segments, st, rnd, bar, add } = c;
  const odd = bar % 2 === 1;
  const dyn = 1 + 0.06 * Math.sin((bar / 8) * Math.PI * 2);
  for (const s of segments) {
    s.thumb = pitchIn(s.chord.bass, 45);
    s.voicing = voiceChord(s.chord, { lo: 54, hi: 72, n: 4, prev: st.voic.gtr, center: 63, floor: s.thumb });
    st.voic.gtr = s.voicing;
    s.bassNote = pitchIn(s.chord.bass, 33);
    s.bassFifth = pitchIn(s.chord.root + CHORD_TYPES[s.chord.type].fifth, 33);
  }

  // Violão — dedos. Em colcheias (0–7): clave da bossa em dois compassos: [0,3,6] e [2,5].
  let hits = level === 0 ? [0] : level === 1 ? [0, 5] : odd ? [2, 5] : [0, 3, 6];
  if (level < 2) for (const s of segments) if (!hits.includes(s.start * 2)) hits.push(s.start * 2);
  hits = hits.sort((a, b) => a - b);
  hits.forEach((e, i) => {
    const beat = e / 2;
    const s = c.segAt(beat);
    const nextBeat = i + 1 < hits.length ? hits[i + 1] / 2 : 4;
    const ring = level === 0 ? Math.min(s.start + s.dur - beat, 3.6) : Math.min(nextBeat - beat, 1.5) * 0.92;
    const notes = level === 0 || i === 0 ? s.voicing : s.voicing.slice(1);
    const roll = level === 0 ? 0.03 : 0.011;
    const accent = i === 0 ? 1 : 0.86;
    notes.forEach((midi, k) => {
      add({ inst: 'gtr', role: 'chord', midi, beat, dur: ring, vel: (level === 0 ? 0.46 : 0.5) * accent * dyn * (0.92 + rnd() * 0.16), shift: k * roll });
    });
  });
  // Na primeira etapa, de dois em dois compassos os dedos "respondem" baixinho no contratempo do 3.
  if (level === 0 && odd && segments.length === 1) {
    segments[0].voicing.slice(1).forEach((midi, k) => add({ inst: 'gtr', role: 'chord', midi, beat: 2.5, dur: 1.4, vel: 0.33 * dyn, shift: k * 0.02 }));
  }
  // Violão — polegar: a fundamental no tempo 1 (e a quinta no 3 enquanto não há baixo).
  for (const s of segments) {
    add({ inst: 'gtr', role: 'bass', midi: s.thumb, beat: s.start, dur: Math.min(s.dur, 2) * 0.95, vel: (level >= 1 ? 0.4 : 0.52) * dyn });
    if (level === 0 && s.dur >= 4) {
      add({ inst: 'gtr', role: 'bass', midi: pitchIn(s.chord.root + CHORD_TYPES[s.chord.type].fifth, 45), beat: 2, dur: 1.8, vel: 0.42 * dyn });
    }
  }

  // Baixo: fundamental (semínima pontuada) e quinta, com as colcheias de passagem a partir da cobertura.
  if (level >= 1) {
    for (const s of segments) {
      const whole = s.dur >= 4;
      add({ inst: 'bass', role: 'bass', midi: s.bassNote, beat: s.start, dur: whole ? 1.4 : Math.min(s.dur, 2) * 0.9, vel: 0.66 * dyn });
      if (whole) {
        add({ inst: 'bass', role: 'bass', midi: s.bassFifth, beat: 2, dur: 1.4, vel: 0.58 * dyn });
        if (level >= 3) add({ inst: 'bass', role: 'bass', midi: s.bassFifth, beat: 1.5, dur: 0.42, vel: 0.44 });
        if (level >= 4 && rnd() < 0.5) add({ inst: 'bass', role: 'bass', midi: s.bassNote, beat: 3.5, dur: 0.42, vel: 0.4 });
      }
    }
  }

  if (level >= 2) {
    const acc = [0.5, 0.28, 0.7, 0.28, 0.5, 0.28, 0.7, 0.32];
    for (let e = 0; e < 8; e++) add({ inst: 'shaker', role: 'perc', beat: e / 2, vel: acc[e] * (0.85 + rnd() * 0.3) * (level >= 3 ? 1 : 0.8) });
  }
  if (level >= 3) for (const e of odd ? [2, 5] : [0, 3, 6]) add({ inst: 'rim', role: 'perc', beat: e / 2, vel: 0.42 * (0.9 + rnd() * 0.2) });

  if (level >= 4) fillPhrase(c, { inst: 'ep', lo: 67, hi: 81, prob: level >= 5 ? 0.6 : 0.5, vel: 0.4 });

  // Piano elétrico em notas-guia sustentadas (3ª e 7ª), bem baixinho.
  if (level >= 5) {
    for (const s of segments) {
      const guide = voiceChord(s.chord, { lo: 54, hi: 67, n: 2, prev: st.voic.pad, center: 60, floor: s.thumb });
      st.voic.pad = guide;
      for (const midi of guide) add({ inst: 'pad', role: 'chord', midi, beat: s.start, dur: s.dur * 0.96, vel: 0.2 });
    }
  }
  if (level >= 6) sparkle(c, { inst: 'box', lo: 79, hi: 91, slots: [0.5, 1.5, 2.5], vel: 0.24 });
}

/* Valsa de caixinha de música: arpejo que começa na nota do baixo, baixo no tempo 1, cama de
   notas longas, melodia de notas longas por grau conjunto. */
function composeCaixinha(c) {
  const { level, segments, st, rnd, bar, add } = c;
  const s = segments[0];
  const chord = s.chord;
  const a = arpNotes(chord, 62, 4);
  s.voicing = a.slice(0, 3);
  s.bassNote = pitchIn(chord.bass, 38);
  if (bar % 4 === 0) st.pat = Math.floor(rnd() * 2);

  // Arpejo: semínimas no começo; colcheias a partir da cobertura.
  if (level < 3) {
    const order = st.pat ? [0, 2, 1] : [0, 1, 2];
    order.forEach((k, i) => add({ inst: 'box', role: 'chord', midi: a[k], beat: i, dur: Math.min(1.6, 3.5 - i), vel: [0.52, 0.4, 0.36][i] * (0.92 + rnd() * 0.16) }));
  } else {
    const order = a.length >= 4 ? [0, 1, 2, 3, 2, 1] : st.pat ? [0, 1, 2, 1, 2, 1] : [0, 2, 1, 2, 1, 2];
    order.forEach((k, i) => add({ inst: 'box', role: 'chord', midi: a[k], beat: i / 2, dur: Math.min(1.2, 3.5 - i / 2), vel: [0.52, 0.34, 0.4, 0.32, 0.38, 0.3][i] * (0.92 + rnd() * 0.16) }));
  }

  if (level >= 1) {
    add({ inst: 'bass', role: 'bass', midi: s.bassNote, beat: 0, dur: 2.5, vel: 0.6 });
    if (level >= 5) add({ inst: 'bass', role: 'bass', midi: pitchIn(chord.root + CHORD_TYPES[chord.type].fifth, 38), beat: 2, dur: 0.85, vel: 0.4 });
  }

  if (level >= 2) {
    const def = CHORD_TYPES[chord.type];
    // cama: fundamental, terça (ou quarta) e quinta, conduzidas por grau conjunto
    const lists = def.arp.slice(0, 3).map((iv) => placements(mod12(chord.root + iv), 52, 67));
    let best = null;
    let bestScore = Infinity;
    for (const x of lists[0]) for (const y of lists[1]) for (const z of lists[2]) {
      const v = [x, y, z].sort((p, q) => p - q);
      const sc = voicingScore(v, { prev: st.voic.pad, center: 60, floor: s.bassNote, maxSpan: 12 });
      if (sc < bestScore) {
        bestScore = sc;
        best = v;
      }
    }
    st.voic.pad = best;
    s.pad = best;
    for (const midi of best) add({ inst: 'pad', role: 'chord', midi, beat: 0, dur: 3, vel: 0.3 });
  }

  // Melodia: uma nota longa por compasso (às vezes duas), sempre a nota do acorde mais próxima da anterior.
  if (level >= 4) {
    const r = rnd();
    if (r > 0.16) {
      const stable = chordPcs(chord, 'all');
      const scale = chordPcs(chord, 'scale');
      const lo = 76;
      const hi = 91;
      const from = st.mel != null ? st.mel : 82;
      const cands = [];
      for (let m = lo; m <= hi; m++) if (stable.includes(mod12(m)) && Math.abs(m - from) <= 5) cands.push(m);
      const weight = (m) => {
        const d = Math.abs(m - from);
        const edge = m > 88 || m < 78 ? 0.4 : 1;
        return (d === 0 ? 1 : d <= 2 ? 4 : d <= 4 ? 2 : 1) * edge;
      };
      let total = 0;
      for (const m of cands) total += weight(m);
      let x = rnd() * total;
      let target = cands[0];
      for (const m of cands) {
        x -= weight(m);
        if (x <= 0) {
          target = m;
          break;
        }
      }
      if (target == null) target = pitchIn(stable[0], 79);
      const vel = 0.5 * (0.9 + rnd() * 0.2);
      if (r < 0.5) {
        add({ inst: 'mel', role: 'melody', midi: target, beat: 0, dur: 3, vel });
        st.mel = target;
      } else if (r < 0.84) {
        // mínima + semínima de passagem (nota vizinha da escala do acorde)
        const neigh = [];
        for (let m = target - 3; m <= target + 3; m++) if (m !== target && m >= lo && m <= hi && scale.includes(mod12(m))) neigh.push(m);
        add({ inst: 'mel', role: 'melody', midi: target, beat: 0, dur: 2, vel });
        const pass = neigh.length ? neigh[Math.floor(rnd() * neigh.length)] : target;
        add({ inst: 'mel', role: 'melody', midi: pass, beat: 2, dur: 1, vel: vel * 0.8 });
        st.mel = pass;
      } else {
        add({ inst: 'mel', role: 'melody', midi: target, beat: 1, dur: 2, vel: vel * 0.92 });
        st.mel = target;
      }
    }
  }

  if (level >= 5) {
    add({ inst: 'brush', role: 'perc', beat: 1, vel: 0.3 });
    add({ inst: 'brush', role: 'perc', beat: 2, vel: 0.24 });
  }
  if (level >= 6 && rnd() < 0.7) sparkle(c, { inst: 'glock', lo: 86, hi: 96, slots: [2, 2.5], vel: 0.2 });
}

/* Lo-fi: piano elétrico em acordes cheios, baixo redondo, bumbo/caixa/chimbal preguiçosos com
   swing leve, frases de violão, chiado de vinil. */
function composeLofi(c) {
  const { level, segments, st, rnd, bar, add } = c;
  const odd = bar % 2 === 1;
  const s = segments[0];
  const chord = s.chord;
  s.bassNote = pitchIn(chord.bass, 32);
  s.voicing = voiceChord(chord, { lo: 53, hi: 72, n: 4, prev: st.voic.ep, center: 62, floor: s.bassNote + 9 });
  st.voic.ep = s.voicing;
  const fifth = pitchIn(chord.root + CHORD_TYPES[chord.type].fifth, 32);

  s.voicing.forEach((midi, k) => add({ inst: 'ep', role: 'chord', midi, beat: 0, dur: 3.7, vel: 0.5 * (0.92 + rnd() * 0.16), shift: k * 0.022 }));
  if (level >= 5 && odd) s.voicing.slice(1).forEach((midi, k) => add({ inst: 'ep', role: 'chord', midi, beat: 2.5, dur: 1.3, vel: 0.33, shift: k * 0.015 }));

  if (level >= 1) {
    add({ inst: 'bass', role: 'bass', midi: s.bassNote, beat: 0, dur: 1.4, vel: 0.68 });
    add({ inst: 'bass', role: 'bass', midi: rnd() < 0.35 ? fifth : s.bassNote, beat: 2.5, dur: 0.95, vel: 0.56 });
    if (level >= 3 && rnd() < 0.4) add({ inst: 'bass', role: 'bass', midi: fifth, beat: 3.5, dur: 0.42, vel: 0.44 });
  }

  if (level >= 2) {
    add({ inst: 'kick', role: 'perc', beat: 0, vel: 0.8 });
    add({ inst: 'kick', role: 'perc', beat: 2.5, vel: 0.62 });
    if (odd && level >= 3 && rnd() < 0.5) add({ inst: 'kick', role: 'perc', beat: 1.5, vel: 0.5 });
    if (level === 2) for (const b of [0, 1, 2, 3]) add({ inst: 'hat', role: 'perc', beat: b, vel: 0.2 });
  }
  if (level >= 3) {
    add({ inst: 'snare', role: 'perc', beat: 1, vel: 0.5, shift: 0.012 });
    add({ inst: 'snare', role: 'perc', beat: 3, vel: 0.54, shift: 0.012 });
    for (let e = 0; e < 8; e++) add({ inst: 'hat', role: 'perc', beat: e / 2, vel: (e % 2 ? 0.2 : 0.32) * (0.85 + rnd() * 0.3) });
    if (level >= 5 && rnd() < 0.3) add({ inst: 'hat', role: 'perc', beat: 3.75, vel: 0.16 });
  }

  if (level >= 4) fillPhrase(c, { inst: 'pluck', lo: 62, hi: 79, prob: level >= 5 ? 0.55 : 0.45, vel: 0.44 });
  if (level >= 6) sparkle(c, { inst: 'box', lo: 77, hi: 89, slots: [1.5, 3], vel: 0.22 });
}

/** Em que instante (em batidas) cai uma posição do compasso, com o swing da trilha (0,5 = reto). */
export function swingBeat(beat, swing = 0.5) {
  if (swing === 0.5) return beat;
  const whole = Math.floor(beat);
  const f = beat - whole;
  return whole + (f < 0.5 ? (f / 0.5) * swing : swing + ((f - 0.5) / 0.5) * (1 - swing));
}

/** Frequência (Hz) de uma nota MIDI, lá = 440. */
export const mtof = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
