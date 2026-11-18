// BOLAB — Ateliê: os efeitos sonoros, todos sintetizados (nenhum arquivo de áudio).
//
// Cada efeito é uma "receita" curta feita com nós nativos do navegador: osciladores, ruído
// filtrado e envelopes. Sons de cozinha: macios, curtos, sem agudo estridente, e com uma variação
// leve de altura a cada toque para não cansar. Os efeitos "musicais" (seleção, etapa, moeda,
// revelação…) tocam sempre notas do acorde que a trilha está tocando naquele instante.
//
//   playSfx(g, 'plop', quando, { gain, pitch, pan, dur, count })  →  { end, stop(fade) }  (ou null)
//
// Para criar um efeito novo: acrescente uma entrada em SFX, rode `node tools/audio_check.mjs --calibrar`
// (mede volume, pico, duração, brilho e o quanto sobra num alto-falante de celular) e depois
// `node tools/audio_calibrar.mjs`, que acerta o nível em TRIM_DB, lá embaixo.
/** Envelope ataque → sustenta → decai (até −43 dB) → zero. Devolve o instante em que acaba. */
export function env(param, t, a, h, d, peak) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + a);
  const t1 = t + a + h;
  if (h > 0) param.setValueAtTime(peak, t1);
  param.setTargetAtTime(0, t1, d / 5);
  param.setValueAtTime(peak * Math.exp(-5), t1 + d);
  param.linearRampToValueAtTime(0, t1 + d + 0.012);
  return t1 + d + 0.012;
}

class Voice {
  constructor(g, t, o, def, level) {
    this.g = g;
    this.ctx = g.ctx;
    this.t = t;
    this.o = o;
    this.rnd = g.rnd;
    const wobble = (g.rnd() * 2 - 1) * (def.tonal ? 0.04 : def.vary ?? 0.45);
    this.pm = Math.pow(2, ((+o.pitch || 0) + wobble) / 12);
    this.out = this.ctx.createGain();
    this.out.gain.value = level;
    let tail = this.out;
    const side = +o.pan;
    if (side && Number.isFinite(side) && this.ctx.createStereoPanner && !g.lite) {
      const pan = this.ctx.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, side));
      tail = tail.connect(pan);
    }
    tail.connect(g.sfx.in);
    if (def.rev) {
      const send = this.ctx.createGain();
      send.gain.value = def.rev;
      tail.connect(send).connect(g.sfx.rev);
    }
    this.tail = tail;
    this.end = t;
    this.srcs = [];
  }

  /** Número ao acaso entre a e b. */
  r(a, b) {
    return a + this.rnd() * (b - a);
  }

  track(src, end) {
    this.srcs.push(src);
    if (end > this.end) {
      this.end = end;
      this.lastSrc = src;
    }
  }

  /** Nota permitida (acorde do momento) mais próxima de `midi`. */
  tuned(midi, at = 0) {
    return this.g.tune(midi, this.t + at);
  }

  /** A k-ésima nota permitida acima de `midi`. */
  above(midi, k = 1, at = 0) {
    const pcs = this.g.pcsAt(this.t + at);
    let m = midi;
    while (k > 0) {
      m++;
      if (pcs.includes(m % 12)) k--;
    }
    return m;
  }

  /** Estágio de tremor (ganho que oscila em torno de 1). */
  trem(node, { rate, depth, type = 'sine' }, t0, end) {
    const stage = this.ctx.createGain();
    const lfo = this.ctx.createOscillator();
    const amt = this.ctx.createGain();
    lfo.type = type;
    lfo.frequency.value = rate;
    amt.gain.value = depth;
    lfo.connect(amt).connect(stage.gain);
    lfo.start(t0);
    lfo.stop(end + 0.02);
    node.connect(stage);
    return stage;
  }

  /** Oscilador com envelope. f → to desliza em `glide` segundos. */
  tone({ at = 0, type = 'sine', f, to, glide, a = 0.003, h = 0, d = 0.12, g = 0.5, vib, trem }) {
    const t0 = this.t + Math.max(0, at); // a variação de tempo nunca cai antes do começo do efeito
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f * this.pm, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(to * this.pm, t0 + (glide || a + h + d));
    const end = env(amp.gain, t0, a, h, d, g);
    if (vib) {
      const lfo = this.ctx.createOscillator();
      const amt = this.ctx.createGain();
      lfo.frequency.value = vib.rate;
      amt.gain.value = vib.depth;
      lfo.connect(amt).connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(end + 0.02);
    }
    let node = osc.connect(amp);
    if (trem) node = this.trem(node, trem, t0, end);
    node.connect(this.out);
    osc.start(t0);
    osc.stop(end + 0.01);
    this.track(osc, end);
  }

  /** Ruído filtrado com envelope. O filtro pode varrer: f → to (em glide) → to2 (em glide2). */
  noise({ at = 0, color = 'white', type = 'bandpass', f = 1000, to, glide, to2, glide2, q = 1, a = 0.003, h = 0, d = 0.1, g = 0.5, rate = 1, trem }) {
    const t0 = this.t + Math.max(0, at);
    const src = this.ctx.createBufferSource();
    const flt = this.ctx.createBiquadFilter();
    const amp = this.ctx.createGain();
    src.buffer = this.g.noise[color];
    src.loop = true;
    src.playbackRate.value = rate;
    flt.type = type;
    flt.Q.value = q;
    flt.frequency.setValueAtTime(f * this.pm, t0);
    if (to) {
      const tg = t0 + (glide || a + h + d);
      flt.frequency.exponentialRampToValueAtTime(to * this.pm, tg);
      if (to2) flt.frequency.exponentialRampToValueAtTime(to2 * this.pm, tg + (glide2 || d));
    }
    const end = env(amp.gain, t0, a, h, d, g);
    let node = src.connect(flt).connect(amp);
    if (trem) node = this.trem(node, trem, t0, end);
    node.connect(this.out);
    src.start(t0, this.rnd() * 1.8);
    src.stop(end + 0.01);
    this.track(src, end);
  }

  /** Textura pronta (nuvem de grãos), com filtro opcional. */
  texture({ at = 0, name, g = 0.5, rate = 1, a = 0.005, h, d = 0.1, type, f = 1000, q = 0.7, loop = false, offset = 0 }) {
    const t0 = this.t + Math.max(0, at);
    const src = this.ctx.createBufferSource();
    const amp = this.ctx.createGain();
    src.buffer = this.g.texture(name);
    src.loop = loop;
    src.playbackRate.value = rate;
    const hold = h != null ? h : Math.max(0, src.buffer.duration / rate - offset - a - d);
    const end = env(amp.gain, t0, a, hold, d, g);
    let node = src;
    if (type) {
      const flt = this.ctx.createBiquadFilter();
      flt.type = type;
      flt.frequency.value = f;
      flt.Q.value = q;
      node = node.connect(flt);
    }
    node.connect(amp).connect(this.out);
    src.start(t0, offset);
    src.stop(end + 0.01);
    this.track(src, end);
  }

  /**
   * Nota pronta de um banco (js/atelier/audio-banks.js): uma fonte e um ganho, em vez de vários
   * osciladores. d = por quanto tempo ela soa (a nota do banco é encurtada se for mais longa).
   */
  note(bank, { at = 0, midi, g = 0.4, d = 0.5 }) {
    const t0 = this.t + Math.max(0, at);
    const { buffer, rate } = this.g.banks[bank].get(midi);
    const src = this.ctx.createBufferSource();
    const amp = this.ctx.createGain();
    const speed = rate * this.pm;
    const natural = buffer.duration / speed;
    const ring = Math.min(natural, d);
    src.buffer = buffer;
    src.playbackRate.value = speed;
    amp.gain.setValueAtTime(g, t0);
    if (ring < natural) amp.gain.setTargetAtTime(0, t0 + ring * 0.45, ring * 0.2);
    const end = t0 + Math.min(natural, ring * 1.6);
    src.connect(amp).connect(this.out);
    src.start(t0);
    src.stop(end + 0.01);
    this.track(src, end);
  }

  /** Sininho macio: a mesma lâmina da caixinha de música da trilha. */
  bell({ at = 0, midi, g = 0.4, d = 0.5 }) {
    this.note('box', { at, midi, g, d });
  }

  /** Nota de madeira (marimba de brinquedo). */
  mallet({ at = 0, midi, g = 0.5, d = 0.25 }) {
    this.note('mallet', { at, midi, g: g * 1.1, d: d * 1.4 });
  }

  /** Pingo de bico: o "pff" do saco de confeitar e o "plup" do creme assentando. */
  squeeze(at = 0, k = 1, g = 1) {
    this.noise({ at, f: 1100 * k, to: 700 * k, q: 2, a: 0.008, d: 0.07, g: 0.5 * g });
    this.tone({ at: at + 0.03, f: 320 * k, to: 210 * k, glide: 0.06, a: 0.004, d: 0.08, g: 0.45 * g });
    this.tone({ at: at + 0.03, type: 'triangle', f: 640 * k, to: 420 * k, glide: 0.06, a: 0.004, d: 0.06, g: 0.22 * g });
  }
}

/*
 * As receitas. cat = família (define o volume-alvo): 'ui' interface · 'acao' cozinha · 'festa'.
 * rev = quanto vai para o reverb · tonal = toca notas do acorde do momento · vary = variação de
 * altura a cada toque (semitons) · loop = de quantos em quantos segundos o efeito se repete quando
 * pedido com { loop: true }.
 */
const SFX = {
  /* ── interface ── */
  tap: { cat: 'ui', label: 'toque', rev: 0.04, play(v) {
    v.tone({ f: 760, to: 520, glide: 0.03, a: 0.001, d: 0.06, g: 0.6 });
    v.noise({ f: 1900, q: 1.4, a: 0.001, d: 0.02, g: 0.14 });
  } },
  select: { cat: 'ui', label: 'escolha', rev: 0.12, tonal: true, play(v, o) {
    v.mallet({ midi: v.tuned(74 + (o.degree | 0) + Math.round(v.r(-2.4, 2.4))), g: 0.55, d: 0.22 });
  } },
  toggle: { cat: 'ui', label: 'liga/desliga', rev: 0.05, play(v, o) {
    const [f1, f2] = o.on === false ? [780, 520] : [520, 780];
    v.tone({ f: f1, a: 0.002, d: 0.05, g: 0.45 });
    v.tone({ at: 0.07, f: f2, a: 0.002, d: 0.07, g: 0.5 });
  } },
  back: { cat: 'ui', label: 'voltar', rev: 0.06, play(v) {
    v.tone({ f: 620, to: 400, glide: 0.09, a: 0.003, d: 0.12, g: 0.55 });
    v.noise({ f: 1800, to: 700, q: 1, a: 0.005, d: 0.08, g: 0.07 });
  } },
  step: { cat: 'ui', label: 'próxima etapa', rev: 0.22, tonal: true, play(v, o) {
    const m = v.tuned(69 + (o.degree | 0));
    v.mallet({ midi: m, g: 0.5, d: 0.26 });
    v.mallet({ at: 0.09, midi: v.above(m, 2, 0.09), g: 0.55, d: 0.34 });
  } },
  open: { cat: 'ui', label: 'abrir', rev: 0.25, tonal: true, play(v) {
    v.noise({ f: 500, to: 2200, q: 1.2, a: 0.04, d: 0.2, g: 0.2 });
    const m = v.tuned(74);
    v.bell({ at: 0.03, midi: m, g: 0.3, d: 0.35 });
    v.bell({ at: 0.1, midi: v.above(m, 2, 0.1), g: 0.32, d: 0.45 });
  } },
  close: { cat: 'ui', label: 'fechar', rev: 0.2, tonal: true, play(v) {
    v.noise({ f: 2000, to: 450, q: 1.2, a: 0.02, d: 0.2, g: 0.2 });
    v.mallet({ at: 0.05, midi: v.tuned(68, 0.05), g: 0.42, d: 0.3 });
  } },
  error: { cat: 'ui', label: 'não pode', rev: 0.05, play(v) {
    for (const at of [0, 0.12]) {
      v.tone({ at, type: 'triangle', f: 262, a: 0.006, h: 0.04, d: 0.07, g: 0.6 });
      v.tone({ at, f: 524, a: 0.006, h: 0.03, d: 0.05, g: 0.3 });
    }
  } },
  undo: { cat: 'ui', label: 'desfazer', rev: 0.1, play(v) {
    v.tone({ f: 740, to: 370, glide: 0.14, a: 0.004, d: 0.17, g: 0.5 });
    v.noise({ f: 2400, to: 700, q: 1.1, a: 0.01, d: 0.14, g: 0.1 });
  } },
  redo: { cat: 'ui', label: 'refazer', rev: 0.1, play(v) {
    v.tone({ f: 370, to: 740, glide: 0.14, a: 0.004, d: 0.17, g: 0.5 });
    v.noise({ f: 700, to: 2400, q: 1.1, a: 0.01, d: 0.14, g: 0.1 });
  } },
  pop: { cat: 'ui', label: 'bolha', rev: 0.08, play(v) {
    v.tone({ f: 420, to: 900, glide: 0.035, a: 0.002, d: 0.06, g: 0.6 });
    v.noise({ f: 2500, q: 1.5, a: 0.001, d: 0.008, g: 0.1 });
  } },
  save: { cat: 'ui', label: 'guardar', rev: 0.22, tonal: true, play(v) {
    const m = v.tuned(74);
    v.mallet({ midi: m, g: 0.5, d: 0.25 });
    v.mallet({ at: 0.1, midi: v.above(m, 3, 0.1), g: 0.55, d: 0.4 });
  } },

  /* ── estrutura do bolo ── */
  plop: { cat: 'acao', label: 'camada assentando', rev: 0.1, play(v) {
    v.tone({ f: 190, to: 80, glide: 0.09, a: 0.002, d: 0.2, g: 0.5 });
    v.tone({ type: 'triangle', f: 560, to: 300, glide: 0.06, a: 0.002, d: 0.09, g: 0.6 });
    v.noise({ color: 'pink', f: 820, q: 0.8, a: 0.002, d: 0.06, g: 1.1 });
  } },
  stack: { cat: 'acao', label: 'andar novo', rev: 0.14, play(v) {
    v.tone({ f: 150, to: 65, glide: 0.1, a: 0.002, d: 0.24, g: 0.6 });
    v.tone({ at: 0.012, type: 'triangle', f: 500, to: 280, glide: 0.06, a: 0.002, d: 0.09, g: 0.6 });
    v.noise({ color: 'pink', f: 720, q: 0.8, a: 0.002, d: 0.07, g: 1 });
    v.tone({ at: 0.13, type: 'triangle', f: 420, to: 260, glide: 0.06, a: 0.003, d: 0.1, g: 0.35 });
  } },
  resize: { cat: 'acao', label: 'mudar o tamanho', rev: 0.08, play(v, o) {
    const [f1, f2] = o.dir < 0 ? [440, 290] : [290, 440];
    v.tone({ f: f1, to: f2, glide: 0.15, a: 0.01, h: 0.08, d: 0.12, g: 0.55, vib: { rate: 17, depth: 9 } });
    v.noise({ color: 'pink', f: f1 * 2, to: f2 * 2, q: 1.5, a: 0.02, h: 0.06, d: 0.1, g: 0.14 });
  } },

  /* ── massa ── */
  pour: { cat: 'acao', label: 'despejar a massa', rev: 0.08, loop: 0.7, play(v, o) {
    const dur = Math.max(0.5, +o.dur || 0.9);
    v.noise({ color: 'brown', f: 430, to: 330, q: 0.7, a: 0.09, h: dur - 0.34, d: 0.25, g: 1.5, trem: { rate: 8.5, depth: 0.35 } });
    v.noise({ color: 'pink', f: 1300, q: 0.9, a: 0.12, h: dur - 0.4, d: 0.22, g: 0.4, trem: { rate: 13, depth: 0.5 } });
    const glugs = Math.round(dur * 5);
    for (let i = 0; i < glugs; i++) {
      const f = v.r(150, 260);
      v.tone({ at: v.r(0.05, dur - 0.2), f: f * 2, to: f * 2 * v.r(1.5, 1.9), glide: 0.05, a: 0.004, d: 0.06, g: v.r(0.14, 0.3) });
    }
  } },
  whisk: { cat: 'acao', label: 'bater', rev: 0.12, loop: 0.96, play(v, o) {
    const n = Math.max(2, Math.min(40, Math.round((+o.dur || 0.96) / 0.16)));
    for (let i = 0; i < n; i++) {
      const up = i % 2;
      v.noise({ at: i * 0.16 + v.r(-0.008, 0.008), f: up ? 2500 : 1900, to: up ? 1700 : 2700, q: 1.8, a: 0.014, h: 0.02, d: 0.08, g: up ? 0.32 : 0.4 });
      v.tone({ at: i * 0.16, f: 610 + (up ? 30 : 0), a: 0.004, d: 0.1, g: 0.05 });
    }
  } },
  'oven-ding': { cat: 'festa', label: 'sininho do forno', rev: 0.35, tonal: true, play(v) {
    v.bell({ midi: v.tuned(81), g: 0.6, d: 1.3 });
  } },

  /* ── recheio e cobertura ── */
  spread: { cat: 'acao', label: 'espalhar o recheio', rev: 0.08, loop: 0.5, play(v, o) {
    const dur = Math.max(0.4, +o.dur || 0.6);
    v.noise({ color: 'pink', f: 520, to: 900, glide: dur * 0.5, to2: 600, glide2: dur * 0.5, q: 0.8, a: 0.08, h: dur - 0.36, d: 0.26, g: 0.9, trem: { rate: 11, depth: 0.22 } });
    v.noise({ color: 'brown', type: 'lowpass', f: 380, q: 0.5, a: 0.1, h: dur - 0.4, d: 0.25, g: 0.4 });
  } },
  swipe: { cat: 'acao', label: 'passada de espátula', rev: 0.1, play(v, o) {
    const dur = Math.max(0.25, +o.dur || 0.32);
    v.noise({ f: 900, to: 2400, glide: dur * 0.4, to2: 1200, glide2: dur * 0.6, q: 1.1, a: 0.02, h: dur - 0.24, d: 0.2, g: 0.55 });
    v.noise({ color: 'pink', type: 'lowpass', f: 700, q: 0.5, a: 0.03, h: dur - 0.26, d: 0.18, g: 0.3 });
  } },
  scrape: { cat: 'acao', label: 'pente riscando', rev: 0.1, play(v, o) {
    const dur = Math.max(0.3, +o.dur || 0.42);
    v.noise({ f: 1700, to: 2300, q: 1.6, a: 0.012, h: dur - 0.14, d: 0.12, g: 0.5, trem: { rate: 42, depth: 0.7, type: 'triangle' } });
    v.noise({ color: 'pink', f: 700, q: 0.9, a: 0.02, h: dur - 0.16, d: 0.12, g: 0.3, trem: { rate: 42, depth: 0.5 } });
  } },
  smooth: { cat: 'acao', label: 'alisar', rev: 0.1, loop: 0.55, play(v, o) {
    const dur = Math.max(0.4, +o.dur || 0.65);
    v.noise({ color: 'pink', f: 650, to: 950, glide: dur * 0.5, to2: 600, glide2: dur * 0.5, q: 0.45, a: 0.14, h: dur - 0.44, d: 0.3, g: 0.8 });
  } },
  drip: { cat: 'acao', label: 'calda escorrendo', rev: 0.2, play(v) {
    [[0, 480, 0.6], [0.14, 560, 0.45], [0.31, 430, 0.36]].forEach(([at, f, g]) => {
      v.tone({ at: at + v.r(-0.015, 0.015), f, to: f * 2.1, glide: 0.035, a: 0.002, d: 0.09, g });
    });
    v.noise({ f: 2600, q: 2, a: 0.002, d: 0.02, g: 0.04 });
  } },

  /* ── bico ── */
  pipe: { cat: 'acao', label: 'pitanga (um aperto do bico)', rev: 0.08, play(v) {
    v.squeeze(0, 1, 1);
  } },
  'pipe-run': { cat: 'acao', label: 'sequência de pitangas', rev: 0.08, play(v, o) {
    const n = Math.max(2, Math.min(24, o.count | 0 || 6));
    const gap = +o.interval || 0.085;
    for (let i = 0; i < n; i++) v.squeeze(i * gap + v.r(-0.006, 0.006), 1 + i * 0.018, v.r(0.88, 1));
  } },

  /* ── decoração ── */
  place: { cat: 'acao', label: 'peça assentando', rev: 0.1, play(v) {
    v.tone({ f: 260, to: 170, glide: 0.05, a: 0.002, d: 0.1, g: 0.5 });
    v.tone({ type: 'triangle', f: 700, to: 430, glide: 0.04, a: 0.002, d: 0.06, g: 0.5 });
    v.noise({ f: 1400, q: 1, a: 0.001, d: 0.02, g: 0.3 });
  } },
  'place-soft': { cat: 'acao', label: 'fruta ou docinho assentando', rev: 0.1, play(v) {
    v.tone({ f: 230, to: 140, glide: 0.07, a: 0.003, d: 0.13, g: 0.5 });
    v.tone({ type: 'triangle', f: 620, to: 360, glide: 0.05, a: 0.002, d: 0.07, g: 0.55 });
    v.noise({ color: 'pink', f: 900, q: 0.8, a: 0.002, d: 0.045, g: 0.8 });
  } },
  'place-hard': { cat: 'acao', label: 'chocolate ou acrílico assentando', rev: 0.12, play(v) {
    v.tone({ type: 'triangle', f: 1250, a: 0.001, d: 0.035, g: 0.26 });
    v.tone({ f: 1870, a: 0.001, d: 0.05, g: 0.1 });
    v.tone({ f: 300, to: 220, glide: 0.04, a: 0.002, d: 0.06, g: 0.55 });
    v.noise({ f: 2600, q: 2, a: 0.001, d: 0.01, g: 0.1 });
  } },
  sprinkle: { cat: 'acao', label: 'confeitos caindo', rev: 0.14, vary: 1.2, loop: 0.55, play(v) {
    v.texture({ name: 'grains', g: 0.6, rate: v.r(0.9, 1.12), a: 0.004, d: 0.2, type: 'lowpass', f: 6500 });
  } },
  shake: { cat: 'acao', label: 'chacoalhar', rev: 0.08, play(v) {
    [[0, 0.42], [0.085, 0.3], [0.17, 0.44]].forEach(([at, g], i) => {
      v.noise({ at, f: i % 2 ? 2300 : 2800, q: 1.6, a: 0.012, d: 0.05, g });
    });
  } },
  remove: { cat: 'acao', label: 'tirar uma peça', rev: 0.08, play(v) {
    v.tone({ f: 300, to: 620, glide: 0.07, a: 0.003, d: 0.09, g: 0.55 });
    v.noise({ f: 900, q: 1, a: 0.002, d: 0.03, g: 0.1 });
  } },

  /* ── festa ── */
  match: { cat: 'acao', label: 'acender o fósforo', rev: 0.1, play(v) {
    v.noise({ f: 3200, to: 2200, q: 0.9, a: 0.004, h: 0.03, d: 0.11, g: 0.4, trem: { rate: 55, depth: 0.5 } });
    v.noise({ at: 0.1, color: 'brown', type: 'lowpass', f: 900, to: 320, q: 0.5, a: 0.05, h: 0.04, d: 0.3, g: 0.9 });
    v.noise({ at: 0.1, color: 'pink', f: 1200, to: 600, q: 0.8, a: 0.04, d: 0.25, g: 0.4 });
  } },
  flame: { cat: 'acao', label: 'chama da vela', rev: 0.06, loop: 0.9, play(v, o) {
    const dur = Math.max(0.6, +o.dur || 1.2);
    v.noise({ color: 'brown', type: 'lowpass', f: 420, q: 0.6, a: 0.2, h: dur - 0.6, d: 0.4, g: 1, trem: { rate: 5.3, depth: 0.3 } });
    v.noise({ color: 'pink', f: 1100, q: 0.7, a: 0.2, h: dur - 0.6, d: 0.4, g: 0.45, trem: { rate: 8.1, depth: 0.5 } });
  } },
  blow: { cat: 'acao', label: 'soprar as velas', rev: 0.12, play(v) {
    v.noise({ color: 'pink', f: 800, to: 450, glide: 0.45, q: 0.7, a: 0.07, h: 0.22, d: 0.3, g: 0.9 });
    v.noise({ f: 2200, to: 1200, glide: 0.4, q: 0.8, a: 0.08, h: 0.18, d: 0.25, g: 0.1 });
  } },
  sparkle: { cat: 'acao', label: 'vela faísca', rev: 0.12, vary: 1, loop: 0.95, play(v, o) {
    const dur = Math.max(0.5, +o.dur || 1.1);
    v.texture({ name: 'fizz', g: 0.5, rate: v.r(0.92, 1.08), a: 0.06, h: dur - 0.34, d: 0.28, type: 'lowpass', f: 7000, loop: true, offset: v.r(0, 1) });
  } },
  confetti: { cat: 'festa', label: 'confete', rev: 0.2, play(v) {
    v.tone({ type: 'triangle', f: 300, to: 120, glide: 0.07, a: 0.001, d: 0.1, g: 0.7 });
    v.noise({ f: 1400, q: 0.8, a: 0.001, d: 0.06, g: 0.5 });
    v.texture({ at: 0.05, name: 'grains', g: 0.3, rate: 0.72, a: 0.01, d: 0.3, type: 'lowpass', f: 5000 });
    v.texture({ at: 0.32, name: 'grains', g: 0.18, rate: 0.6, a: 0.02, d: 0.3, type: 'lowpass', f: 4200 });
  } },
  tada: { cat: 'festa', label: 'revelação', rev: 0.4, tonal: true, play(v) {
    let m = v.tuned(69);
    const notes = [m];
    for (let i = 0; i < 3; i++) notes.push((m = v.above(m, 1)));
    notes.forEach((midi, i) => {
      v.mallet({ at: i * 0.07, midi, g: 0.4, d: 0.3 });
      v.bell({ at: i * 0.07, midi: midi + 12, g: 0.16, d: 0.5 });
    });
    for (const midi of [notes[0], notes[2], notes[3]]) v.bell({ at: 0.3, midi: midi + 12, g: 0.24, d: 1.1 });
    v.texture({ at: 0.3, name: 'fizz', g: 0.07, a: 0.08, h: 0.2, d: 0.6, type: 'highpass', f: 2500, loop: true });
  } },
  applause: { cat: 'festa', label: 'palmas', rev: 0.25, vary: 0.8, play(v) {
    v.texture({ name: 'claps', g: 0.9, rate: v.r(0.95, 1.05), a: 0.03, d: 0.3, type: 'bandpass', f: 1500, q: 0.5 });
  } },

  /* ── loja ── */
  coin: { cat: 'festa', label: 'moeda', rev: 0.25, tonal: true, play(v) {
    const m = v.tuned(83);
    v.bell({ midi: m, g: 0.36, d: 0.12 });
    v.bell({ at: 0.075, midi: v.above(m, 2, 0.075), g: 0.42, d: 0.45 });
  } },
  cash: { cat: 'festa', label: 'foi para o carrinho', rev: 0.25, tonal: true, play(v) {
    v.noise({ f: 900, q: 1, a: 0.001, d: 0.022, g: 0.5 });
    v.tone({ f: 180, to: 120, glide: 0.04, a: 0.002, d: 0.05, g: 0.5 });
    v.noise({ at: 0.06, f: 2400, q: 1.5, a: 0.002, d: 0.045, g: 0.16 });
    const m = v.tuned(81, 0.11);
    v.bell({ at: 0.11, midi: m, g: 0.34, d: 0.6 });
    v.bell({ at: 0.17, midi: v.above(m, 2, 0.17), g: 0.3, d: 0.7 });
  } },
  camera: { cat: 'acao', label: 'foto', rev: 0.1, play(v) {
    v.noise({ f: 2200, q: 1.2, a: 0.001, d: 0.02, g: 0.5 });
    v.tone({ f: 900, to: 500, glide: 0.015, a: 0.001, d: 0.02, g: 0.2 });
    v.noise({ at: 0.08, f: 1400, q: 1.2, a: 0.001, d: 0.03, g: 0.45 });
    v.tone({ at: 0.08, type: 'triangle', f: 260, to: 180, glide: 0.03, a: 0.001, d: 0.035, g: 0.35 });
  } },

  /* ── avisos ── */
  hint: { cat: 'ui', label: 'a assistente vai falar', rev: 0.3, tonal: true, play(v) {
    const m = v.tuned(76);
    v.bell({ midi: m, g: 0.36, d: 0.35 });
    v.bell({ at: 0.13, midi: v.above(m, 2, 0.13), g: 0.4, d: 0.5 });
  } },
  warn: { cat: 'ui', label: 'atenção', rev: 0.1, play(v) {
    for (const at of [0, 0.16]) {
      v.tone({ at, f: 392, a: 0.005, h: 0.04, d: 0.1, g: 0.5 });
      v.tone({ at, f: 784, a: 0.005, h: 0.02, d: 0.06, g: 0.08 });
    }
  } },
  notfit: { cat: 'ui', label: 'não coube', rev: 0.1, play(v) {
    v.tone({ f: 392, to: 311, glide: 0.13, a: 0.005, h: 0.06, d: 0.12, g: 0.55, vib: { rate: 14, depth: 8 } });
    v.tone({ at: 0.18, type: 'triangle', f: 220, to: 120, glide: 0.06, a: 0.003, d: 0.1, g: 0.6 });
    v.noise({ at: 0.18, color: 'pink', type: 'lowpass', f: 800, q: 0.5, a: 0.002, d: 0.05, g: 0.4 });
  } },

  /* ── conjuntos (várias mudanças de uma vez) ── */
  magic: { cat: 'festa', label: 'paleta ou inspiração aplicada', rev: 0.4, tonal: true, play(v) {
    let m = v.tuned(76);
    for (let i = 0; i < 5; i++) {
      v.bell({ at: i * 0.045, midi: m, g: 0.24, d: 0.4 });
      m = v.above(m, 1);
    }
    v.noise({ f: 1500, to: 4200, q: 1, a: 0.1, d: 0.3, g: 0.05 });
  } },
  surprise: { cat: 'festa', label: 'surpresa', rev: 0.35, tonal: true, play(v) {
    [[0, 0.42], [0.085, 0.3], [0.17, 0.44]].forEach(([at, g], i) => v.noise({ at, f: i % 2 ? 2300 : 2800, q: 1.6, a: 0.012, d: 0.05, g }));
    let m = v.tuned(74, 0.26);
    for (let i = 0; i < 5; i++) {
      v.bell({ at: 0.26 + i * 0.045, midi: m, g: 0.26, d: 0.45 });
      m = v.above(m, 1, 0.26);
    }
  } },
  whoosh: { cat: 'acao', label: 'recomeçar', rev: 0.15, play(v) {
    v.noise({ color: 'pink', f: 300, to: 1800, glide: 0.17, to2: 500, glide2: 0.3, q: 0.9, a: 0.12, h: 0.05, d: 0.3, g: 0.9 });
  } },
  slice: { cat: 'acao', label: 'cortar para ver por dentro', rev: 0.1, play(v) {
    v.noise({ f: 3000, to: 1500, q: 1.3, a: 0.005, d: 0.11, g: 0.35 });
    v.tone({ at: 0.1, type: 'triangle', f: 340, to: 210, glide: 0.05, a: 0.002, d: 0.08, g: 0.6 });
    v.noise({ at: 0.1, color: 'pink', f: 800, q: 0.8, a: 0.002, d: 0.04, g: 0.7 });
  } },
};

/* ───────── Cache: efeitos não musicais renderizados em segundo plano ───────── */

/** Opções que mudam o desenho do som (cada combinação tem o seu buffer). */
const SHAPE = ['dur', 'count', 'interval', 'dir', 'on'];
/** Quantas versões de cada efeito ficam guardadas (a variação de altura continua a cada toque). */
const VARIANTS = 2;
/** A partir de quantos toques cada versão é renderizada: efeito usado uma vez só não gasta nada a mais. */
const CACHE_AFTER = [2, 6];
/** Limite de áudio guardado, em segundos (≈ 8 MB a 48 kHz). */
const CACHE_SECONDS = 45;

const idle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 250));

function cacheEntry(g, name, def, o) {
  let key = name;
  for (const k of SHAPE) if (o[k] != null) key += `|${k}=${o[k]}`;
  let entry = g.cache.map.get(key);
  if (!entry) {
    if (g.cache.map.size > 200) return null; // opções demais variando (ex.: durações diferentes a cada vez): fica só nos nós
    entry = { buffers: [], pending: false, life: 0, failed: false, ready: null, plays: 0 };
    g.cache.map.set(key, entry);
  }
  return entry;
}

function keepCaching(g, name, def, o, entry) {
  entry.plays++;
  if (entry.pending || entry.failed || !entry.life || entry.buffers.length >= VARIANTS || g.cache.seconds > CACHE_SECONDS) return;
  if (entry.plays < (g.cache.after || CACHE_AFTER)[entry.buffers.length]) return;
  const OAC = typeof OfflineAudioContext !== 'undefined' ? OfflineAudioContext : typeof webkitOfflineAudioContext !== 'undefined' ? webkitOfflineAudioContext : null;
  if (!OAC) return void (entry.failed = true);
  entry.pending = true;
  entry.ready = new Promise((done) => {
    idle(() => {
      try {
        const rate = g.ctx.sampleRate;
        const octx = new OAC(1, Math.ceil((entry.life + 0.08) * rate), rate);
        // mesa mínima: o efeito sai seco e sem variação de altura (reverb, lado e altura entram na hora de tocar)
        const og = { ctx: octx, rnd: g.rnd, noise: g.noise, texture: g.texture, banks: g.banks, tune: g.tune, pcsAt: g.pcsAt, sfx: { in: octx.destination } };
        const v = new Voice(og, 0, { ...o, pitch: 0, pan: 0 }, { ...def, rev: 0, vary: 0 }, 1);
        def.play(v, o);
        const finish = (buffer) => {
          if (!entry.pending) return;
          entry.pending = false;
          entry.buffers.push(buffer);
          g.cache.seconds += buffer.duration;
          done(true);
        };
        octx.oncomplete = (ev) => finish(ev.renderedBuffer);
        const p = octx.startRendering();
        if (p && p.then) p.then(finish, () => {});
      } catch (err) {
        entry.pending = false;
        entry.failed = true; // este navegador não renderiza fora do tempo real: segue nos nós
        entry.error = String(err);
        done(false);
      }
    });
  });
}

/** Volume-alvo de cada família (LUFS aproximado, janela de 200 ms, com o volume de efeitos no máximo). */
export const SFX_TARGET = { ui: -23, acao: -19, festa: -16 };

/** Ajuste fino de nível por efeito (dB), tirado da medição de tools/audio_check.mjs. */
const TRIM_DB = {
  tap: -7.2,
  select: -8.3,
  toggle: -5.7,
  back: -6.9,
  step: -10.9,
  open: -9.7,
  close: -6.1,
  error: -14,
  undo: -6.1,
  redo: -5.9,
  pop: -7.1,
  save: -10.8,
  plop: -9,
  stack: -7.4,
  resize: -9.9,
  pour: -7.3,
  whisk: 7.8,
  'oven-ding': -6.2,
  spread: -1.2,
  swipe: 2.1,
  scrape: -0.3,
  smooth: 0.2,
  drip: -4.2,
  pipe: -4.8,
  'pipe-run': -4.6,
  place: -7.5,
  'place-soft': -8.3,
  'place-hard': -4.9,
  sprinkle: -5.8,
  shake: 7,
  remove: -3.6,
  match: -5.1,
  flame: -6.9,
  blow: 0.7,
  sparkle: -6.3,
  confetti: -5.6,
  tada: -5.1,
  applause: -3.8,
  coin: -4.1,
  cash: -3.5,
  camera: -0.5,
  hint: -10.6,
  warn: -12.9,
  notfit: -13.2,
  magic: -4,
  surprise: -4.6,
  whoosh: 2.9,
  slice: -3.6,
};

export const SFX_NAMES = Object.keys(SFX);
/** Lista para a bancada e para a documentação: [{ name, cat, label, loop, tonal }]. */
export const SFX_LIST = SFX_NAMES.map((name) => ({ name, cat: SFX[name].cat, label: SFX[name].label, loop: SFX[name].loop || 0, tonal: !!SFX[name].tonal }));
export const hasSfx = (name) => Object.prototype.hasOwnProperty.call(SFX, name);
export const sfxInfo = (name) => (hasSfx(name) ? SFX[name] : null);

/**
 * Toca um efeito na mesa `g` no instante `when` (relógio do AudioContext).
 * Devolve { end, stop(fade) } ou null (nome desconhecido). Nunca lança erro por opção estranha.
 */
export function playSfx(g, name, when, opts = {}) {
  if (!hasSfx(name)) return null;
  const def = SFX[name];
  const t = Math.max(when, g.ctx.currentTime);
  const gain = Number.isFinite(+opts.gain) && opts.gain != null ? Math.max(0, Math.min(2, +opts.gain)) : 1; // valor estranho = volume normal
  const level = gain * Math.pow(10, (TRIM_DB[name] || 0) / 20);
  const v = new Voice(g, t, opts, def, level);
  // Ao vivo, um efeito não musical é montado com osciladores e filtros só nas primeiras vezes;
  // enquanto isso ele é renderizado em segundo plano e, daí em diante, toca de um buffer pronto
  // (uma fonte só: bem mais leve para a tela, que está ocupada com o bolo em 3D).
  const entry = g.cache && !def.tonal ? cacheEntry(g, name, def, opts) : null;
  if (entry && entry.buffers.length) {
    const buffer = entry.buffers[Math.floor(g.rnd() * entry.buffers.length)];
    const src = g.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = v.pm;
    src.connect(v.out);
    src.start(t);
    src.stop(t + buffer.duration / v.pm + 0.01);
    v.track(src, t + buffer.duration / v.pm);
  } else {
    def.play(v, opts);
    if (entry && !entry.life) entry.life = v.end - t;
  }
  if (entry) keepCaching(g, name, def, opts, entry);
  const end = v.end;
  const stop = (fade = 0.06) => {
    const now = g.ctx.currentTime;
    if (now >= end) return;
    try {
      v.out.gain.cancelScheduledValues(now);
      v.out.gain.setTargetAtTime(0, now, Math.max(0.005, fade / 3));
      for (const s of v.srcs) s.stop(Math.max(now, t) + fade + 0.03);
    } catch {
      // fonte que já parou
    }
  };
  g.alloc('sfx', t, end, () => stop(0.03));
  if (v.lastSrc) {
    v.lastSrc.onended = () => {
      try {
        v.tail.disconnect();
      } catch {
        // já desligado
      }
    };
  }
  return { name, start: t, end, stop };
}
