// BOLAB — Ateliê: a trilha de fundo, tocada na hora (instrumentos sintetizados + agendador).
//
// js/atelier/audio-theory.js compõe cada compasso (o que tocar); este arquivo toca:
//   · instrumentos de timbre macio: violão de náilon (corda dedilhada, Karplus-Strong), caixinha de
//     música, piano elétrico (FM), baixo redondo, cama de notas longas, ganzá, aro, vassourinha,
//     bumbo/caixa/chimbal suaves e chiado de vinil;
//   · um agendador que usa o relógio do AudioContext com folga: cada compasso é marcado inteiro
//     um pouco antes de começar, então a música não engasga quando a tela está ocupada;
//   · a troca de etapa na barra de compasso: quem entra, entra crescendo; quem sai, deixa a nota morrer.
//
// Corda dedilhada e caixinha de música vêm dos bancos de notas prontas (js/atelier/audio-banks.js);
// o resto são osciladores e ruído filtrado, nós nativos.
import { THEMES, THEME_LIST, DEFAULT_THEME, createComposer, chordPcs, swingBeat, mtof } from './audio-theory.js';
import { env } from './audio-sfx.js';

/** Com quanta antecedência (s) um compasso é marcado, e de quanto em quanto tempo (ms) o agendador olha o relógio. */
const HORIZON = 0.6;
const TICK_MS = 110;

/** Nível de cada trilha (dB), calibrado por medição para as três soarem com o mesmo volume. */
const THEME_TRIM_DB = { bossa: -0.6, caixinha: -3.2, lofi: -3 };

/** Brilho da trilha (corte do passa-baixas geral, Hz) por etapa: abre um pouco a cada passo e brilha no resumo. */
const TONE = {
  bossa: [5200, 5600, 6200, 6800, 7400, 8000, 11000],
  caixinha: [5200, 5600, 6000, 6600, 7200, 7800, 10500],
  lofi: [3400, 3600, 3800, 4100, 4400, 4700, 6200],
};

/*
 * Mesa de cada trilha: para cada instrumento, quem toca (play), volume, quanto vai para o reverb,
 * passa-baixas (lp) e passa-altas (hp) próprios e posição no estéreo. steady = instrumento
 * contínuo, que entra crescendo.
 */
const MIX = {
  bossa: {
    gtr: { play: 'pluck', gain: 1, rev: 0.2, lp: 3600, pan: -0.12, steady: true },
    bass: { play: 'bass', gain: 0.29, lp: 620, steady: true },
    shaker: { play: 'shaker', gain: 0.68, rev: 0.1, pan: 0.3, steady: true },
    rim: { play: 'rim', gain: 0.47, rev: 0.18, pan: -0.25, steady: true },
    ep: { play: 'ep', gain: 0.6, rev: 0.3, lp: 3200, hp: 110, pan: 0.2, autopan: 0.18 },
    pad: { play: 'eppad', gain: 0.63, rev: 0.3, lp: 2200, hp: 90, pan: 0.1, steady: true },
    box: { play: 'box', gain: 0.72, rev: 0.45, pan: 0.15 },
  },
  caixinha: {
    box: { play: 'box', gain: 1, rev: 0.3, steady: true },
    mel: { play: 'box', gain: 1.4, rev: 0.4, pan: 0.1 },
    bass: { play: 'bass', gain: 0.33, lp: 560, steady: true },
    pad: { play: 'pad', gain: 0.28, rev: 0.35, lp: 1300, steady: true },
    brush: { play: 'brush', gain: 1.7, rev: 0.2, pan: 0.2, steady: true },
    glock: { play: 'box', gain: 0.8, rev: 0.5, pan: -0.2 },
  },
  lofi: {
    ep: { play: 'ep', gain: 1, rev: 0.25, lp: 3600, hp: 90, pan: -0.08, autopan: 0.14, steady: true },
    bass: { play: 'bass', gain: 0.4, lp: 600, steady: true },
    kick: { play: 'kick', gain: 0.54, steady: true },
    snare: { play: 'snare', gain: 0.9, rev: 0.16, steady: true },
    hat: { play: 'hat', gain: 1.3, pan: 0.25, steady: true },
    pluck: { play: 'pluck', gain: 0.82, rev: 0.3, lp: 2800, pan: 0.2 },
    box: { play: 'box', gain: 0.9, rev: 0.45, pan: -0.15 },
    crackle: { play: 'none', gain: 0.3, steady: true },
  },
};

/* ───────── Os instrumentos ───────── */
// Cada função toca UMA nota: (sessão, instrumento, instante, evento, duração em segundos).

/** Reserva a voz e liga a nota ao barramento do instrumento. Devolve false se a mesa está cheia. */
function voice(S, t, end, amp) {
  return !!S.g.alloc('music', t, end, (at) => {
    try {
      amp.gain.cancelScheduledValues(at);
      amp.gain.setTargetAtTime(0, at, 0.01);
    } catch {
      // nota que já acabou
    }
  });
}

function sampled(bankName, curve, release) {
  return (S, I, t, ev, dur) => {
    const { ctx } = S;
    const { buffer, rate } = S.banks[bankName].get(ev.midi);
    const amp = ctx.createGain();
    const life = Math.min(dur, buffer.duration / rate);
    const end = t + life + release * 4;
    if (!voice(S, t, end, amp)) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    amp.gain.setValueAtTime(Math.pow(ev.vel, curve), t);
    amp.gain.setTargetAtTime(0, t + life, release); // o dedo abafa a corda / a lâmina para de vibrar
    src.connect(amp).connect(I.bus);
    src.start(t);
    src.stop(end);
  };
}

const PLAYERS = {
  none() {},
  pluck: sampled('pluck', 1.4, 0.05),
  box: sampled('box', 1.3, 0.11),

  /** Piano elétrico: par FM 1:1 cujo brilho decai junto com a nota (ataque de "sino", corpo redondo). */
  ep(S, I, t, ev, dur, soft = false) {
    const { ctx } = S;
    const f = mtof(ev.midi);
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const idx = ctx.createGain();
    const amp = ctx.createGain();
    const key = Math.max(0.45, Math.min(1, 1 - (ev.midi - 52) / 60));
    const i0 = (soft ? 0.45 : 0.7 + 1.6 * ev.vel) * key;
    const peak = Math.pow(ev.vel, 1.2) * 0.55;
    const a = soft ? 0.09 : 0.006;
    const tau = (soft ? 2.6 : 1.5) * (0.6 + 0.4 * key);
    const rel = soft ? 0.25 : 0.12;
    const end = t + dur + rel + 0.02;
    if (!voice(S, t, end, amp)) return;
    car.frequency.value = f;
    mod.frequency.value = f;
    idx.gain.setValueAtTime(i0 * f, t);
    idx.gain.setTargetAtTime(0.42 * i0 * f, t + a, 0.25);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + a);
    amp.gain.setTargetAtTime(0, t + a, tau);
    const held = Math.max(0, dur - a);
    amp.gain.setValueAtTime(peak * Math.exp(-held / tau), t + a + held);
    amp.gain.linearRampToValueAtTime(0, t + a + held + rel);
    mod.connect(idx).connect(car.frequency);
    if (S.wow) {
      S.wow.connect(car.detune);
      S.wow.connect(mod.detune);
    }
    car.connect(amp).connect(I.bus);
    car.start(t);
    mod.start(t);
    car.stop(end);
    mod.stop(end);
  },
  eppad(S, I, t, ev, dur) {
    PLAYERS.ep(S, I, t, ev, dur, true);
  },

  /** Baixo redondo: fundamental forte e poucos harmônicos (para aparecer também em alto-falante de celular). */
  bass(S, I, t, ev, dur) {
    const { ctx } = S;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const peak = Math.pow(ev.vel, 1.2) * 0.8;
    const end = t + dur + 0.09;
    if (!voice(S, t, end, amp)) return;
    osc.setPeriodicWave(S.bassWave);
    osc.frequency.value = mtof(ev.midi);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + 0.012);
    amp.gain.setTargetAtTime(peak * 0.7, t + 0.012, 0.14);
    const held = Math.max(0.02, dur - 0.012);
    amp.gain.setValueAtTime(peak * (0.7 + 0.3 * Math.exp(-held / 0.14)), t + 0.012 + held);
    amp.gain.linearRampToValueAtTime(0, t + 0.012 + held + 0.07);
    osc.connect(amp).connect(I.bus);
    osc.start(t);
    osc.stop(end);
  },

  /** Cama: nota longa de onda triangular, que entra e sai devagar. */
  pad(S, I, t, ev, dur) {
    const { ctx } = S;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const peak = ev.vel * 0.5;
    const end = t + dur + 0.62;
    if (!voice(S, t, end, amp)) return;
    osc.type = 'triangle';
    osc.frequency.value = mtof(ev.midi);
    osc.detune.value = (S.g.rnd() * 2 - 1) * 4;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + 0.4);
    amp.gain.setValueAtTime(peak, t + Math.max(0.4, dur));
    amp.gain.linearRampToValueAtTime(0, t + Math.max(0.4, dur) + 0.6);
    osc.connect(amp).connect(I.bus);
    osc.start(t);
    osc.stop(end);
  },

  shaker(S, I, t, ev) {
    hit(S, I, t, { color: 'white', type: 'bandpass', f: 5200, q: 0.9, a: 0.006, d: 0.05, g: ev.vel * 0.5 });
  },
  hat(S, I, t, ev) {
    hit(S, I, t, { color: 'white', type: 'bandpass', f: 7200, q: 0.8, a: 0.001, d: 0.03, g: ev.vel * 0.5 });
  },
  brush(S, I, t, ev) {
    hit(S, I, t, { color: 'pink', type: 'bandpass', f: 2600, q: 0.6, a: 0.025, d: 0.12, g: ev.vel });
  },
  rim(S, I, t, ev) {
    blip(S, I, t, { f: 830, d: 0.03, g: ev.vel * 0.6 });
    blip(S, I, t, { f: 1740, type: 'triangle', d: 0.012, g: ev.vel * 0.25 }, false);
    hit(S, I, t, { color: 'white', type: 'bandpass', f: 2400, q: 1.5, a: 0.001, d: 0.01, g: ev.vel * 0.2 }, false);
  },
  kick(S, I, t, ev) {
    blip(S, I, t, { f: 105, to: 48, glide: 0.08, a: 0.002, d: 0.22, g: ev.vel });
    hit(S, I, t, { color: 'pink', type: 'lowpass', f: 1200, q: 0.5, a: 0.001, d: 0.008, g: ev.vel * 0.25 }, false);
  },
  snare(S, I, t, ev) {
    hit(S, I, t, { color: 'pink', type: 'bandpass', f: 1700, q: 0.7, a: 0.002, d: 0.11, g: ev.vel });
    blip(S, I, t, { f: 185, to: 160, glide: 0.05, d: 0.06, g: ev.vel * 0.35 }, false);
  },
};

/** Batida de ruído filtrado. */
function hit(S, I, t, { color, type, f, q, a, d, g }, count = true) {
  const { ctx } = S;
  const amp = ctx.createGain();
  const end = env(amp.gain, t, a, 0, d, g);
  if (count && !voice(S, t, end, amp)) return;
  const src = ctx.createBufferSource();
  const flt = ctx.createBiquadFilter();
  src.buffer = S.g.noise[color];
  src.loop = true;
  flt.type = type;
  flt.frequency.value = f;
  flt.Q.value = q;
  src.connect(flt).connect(amp).connect(I.bus);
  src.start(t, S.g.rnd() * 1.8);
  src.stop(end + 0.01);
}

/** Batida de oscilador (bumbo, aro). */
function blip(S, I, t, { f, to, glide, type = 'sine', a = 0.002, d, g }, count = true) {
  const { ctx } = S;
  const amp = ctx.createGain();
  const end = env(amp.gain, t, a, 0, d, g);
  if (count && !voice(S, t, end, amp)) return;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + glide);
  osc.connect(amp).connect(I.bus);
  osc.start(t);
  osc.stop(end + 0.01);
}

/* ───────── Sessão: os instrumentos ligados de uma trilha que está tocando ───────── */

function openSession(g, banks, theme, t0, fadeIn) {
  const { ctx } = g;
  const level = Math.pow(10, (THEME_TRIM_DB[theme.id] || 0) / 20);
  const out = ctx.createGain();
  const rev = ctx.createGain();
  for (const node of [out, rev]) {
    node.gain.setValueAtTime(0, t0);
    node.gain.linearRampToValueAtTime(level, t0 + fadeIn);
  }
  out.connect(g.music.in);
  rev.connect(g.music.rev);
  const S = { g, ctx, theme, banks, out, rev, inst: {}, on: {}, extras: [], level, closed: false };
  const lfo = (rate, depth, target) => {
    const osc = ctx.createOscillator();
    const amt = ctx.createGain();
    osc.frequency.value = rate;
    amt.gain.value = depth;
    osc.connect(amt);
    if (target) amt.connect(target);
    osc.start(t0);
    S.extras.push(osc);
    return amt;
  };
  for (const [id, mix] of Object.entries(MIX[theme.id])) {
    const bus = ctx.createGain();
    bus.gain.value = mix.gain;
    let node = bus;
    if (mix.lp) {
      const flt = ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.value = mix.lp;
      flt.Q.value = 0.6;
      node = node.connect(flt);
    }
    if (mix.hp) {
      // o par FM 1:1 do piano elétrico gera uma componente contínua que varia com o brilho: fica aqui
      const flt = ctx.createBiquadFilter();
      flt.type = 'highpass';
      flt.frequency.value = mix.hp;
      flt.Q.value = 0.5;
      node = node.connect(flt);
    }
    if (mix.pan && ctx.createStereoPanner && !g.lite) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = mix.pan;
      if (mix.autopan) lfo(0.19, mix.autopan, pan.pan);
      node = node.connect(pan);
    }
    node.connect(out);
    if (mix.rev) {
      const send = ctx.createGain();
      send.gain.value = mix.rev;
      node.connect(send).connect(rev);
    }
    S.inst[id] = { bus, mix };
  }
  // baixo redondo: fundamental + harmônicos que caem depressa
  S.bassWave = ctx.createPeriodicWave(new Float32Array([0, 0, 0, 0, 0, 0]), new Float32Array([0, 1, 0.42, 0.2, 0.08, 0.03]));
  if (theme.id === 'lofi') {
    S.wow = lfo(0.37, 5); // a fita "respira": ±5 centésimos de semitom
    const src = ctx.createBufferSource();
    src.buffer = g.texture('crackle');
    src.loop = true;
    src.connect(S.inst.crackle.bus);
    src.start(t0);
    S.extras.push(src);
    g.alloc('music', t0, t0 + 1e7, null);
  }
  return S;
}

function closeSession(S, t, fade) {
  if (S.closed) return;
  S.closed = true;
  for (const node of [S.out, S.rev]) {
    node.gain.cancelScheduledValues(t);
    node.gain.setTargetAtTime(0, t, Math.max(0.01, fade / 3));
  }
  const stopAt = t + fade + 0.3;
  for (const src of S.extras) {
    try {
      src.stop(stopAt);
    } catch {
      // já parado
    }
  }
  S.g.voices = S.g.voices.filter((v) => v.t1 < 1e6); // libera a voz do chiado
  S.stopAt = stopAt;
}

/**
 * Marca um compasso a partir de t0. Com `queue`, as notas não são tocadas agora: entram na fila
 * com o seu instante, e o agendador ao vivo vai marcando só as do próximo meio segundo (criar os
 * nós de um compasso inteiro de uma vez daria um tranco na tela a cada dois segundos).
 */
function scheduleBar(S, bar, t0, only = null, queue = null) {
  const { g, theme } = S;
  const spb = 60 / bar.bpm;
  const now = g.ctx.currentTime;
  for (const seg of bar.segments) g.harmony.push({ t0: t0 + seg.start * spb, t1: t0 + (seg.start + seg.dur) * spb, pcs: chordPcs(seg.chord, 'all') });
  g.music.tone.frequency.setTargetAtTime(TONE[theme.id][bar.level], Math.max(now, t0), 0.5);
  // quem entra nesta etapa entra crescendo ao longo do compasso; o chiado some devagar quando sai
  for (const [id, from] of Object.entries(theme.layers)) {
    const I = S.inst[id];
    if (!I) continue;
    const on = bar.level >= from;
    if (I.mix.steady && on !== S.on[id] && S.on[id] !== undefined) {
      const p = I.bus.gain;
      p.cancelScheduledValues(t0);
      if (on) {
        p.setValueAtTime(I.mix.gain * 0.4, t0);
        p.linearRampToValueAtTime(I.mix.gain, t0 + bar.dur * 0.9);
      } else if (I.mix.play === 'none') {
        p.setTargetAtTime(0, t0, bar.dur / 4);
      }
    }
    S.on[id] = on;
  }
  for (const ev of bar.events) {
    const I = S.inst[ev.inst];
    if (!I || (only && ev.inst !== only)) continue;
    const t = t0 + swingBeat(ev.beat, theme.swing) * spb + (ev.shift || 0) + (g.rnd() * 2 - 1) * theme.humanize * (ev.role === 'perc' ? 0.6 : 1);
    if (queue) queue.push({ t, I, ev, dur: ev.dur * spb });
    else playNote(S, { t, I, ev, dur: ev.dur * spb }, now);
  }
  if (queue) queue.sort((a, b) => a.t - b.t);
}

/** Toca uma nota da fila (ou a pula, se a tela travou e ela ficou para trás). */
function playNote(S, note, now) {
  let { t } = note;
  if (t < now + 0.005) {
    if (now - t > 0.12) return; // atrasou demais: melhor pular a nota que tocá-la fora do tempo
    t = now + 0.005;
  }
  PLAYERS[note.I.mix.play](S, note.I, t, note.ev, note.dur);
}

/**
 * A trilha de fundo de uma mesa de som.
 *   music.start() · music.stop({ fade }) · music.setScene(etapa) · music.setTheme(id) · music.themes
 */
export function createMusic(g, { seed = null, sync = false } = {}) {
  const { banks } = g; // notas prontas (corda dedilhada, caixinha): as mesmas que os efeitos musicais usam
  let themeId = DEFAULT_THEME;
  let composer = createComposer(themeId, seed == null ? {} : { seed });
  let scene = 'formato';
  let S = null;
  let timer = 0;
  let nextBar = 0;
  let lastBar = null;
  let queue = []; // notas já compostas, esperando a vez de serem marcadas
  const closing = [];

  const theme = () => THEMES[themeId];
  function warm() {
    const r = theme().ranges;
    const mix = MIX[themeId];
    for (const [id, m] of Object.entries(mix)) {
      if (!r[id]) continue;
      if (m.play === 'pluck') banks.pluck.warm(r[id][0], r[id][1], sync);
      if (m.play === 'box') banks.box.warm(r[id][0], r[id][1], sync);
    }
  }
  /** Os bancos de notas da trilha atual já estão prontos? (ao vivo eles são gerados aos poucos) */
  function warmed() {
    const r = theme().ranges;
    for (const [id, m] of Object.entries(MIX[themeId])) {
      if (!r[id]) continue;
      if (m.play === 'pluck' && !banks.pluck.ready(r[id][0], r[id][1])) return false;
      if (m.play === 'box' && !banks.box.ready(r[id][0], r[id][1])) return false;
    }
    return true;
  }
  function sweep(now) {
    while (g.harmony.length && g.harmony[0].t1 < now - 1) g.harmony.shift();
    for (let i = closing.length - 1; i >= 0; i--) {
      if (closing[i].stopAt < now - 3) {
        closing[i].out.disconnect();
        closing[i].rev.disconnect();
        closing.splice(i, 1);
      }
    }
  }
  function tick() {
    if (!S || g.ctx.state !== 'running') return;
    const now = g.ctx.currentTime;
    if (!warmed()) {
      // as notas ainda estão sendo preparadas: o primeiro compasso espera (nada de gerar tudo de uma vez e travar a tela)
      if (nextBar < now + 0.15) nextBar = now + 0.15;
      return;
    }
    if (nextBar < now - 0.25) nextBar = now + 0.06; // o relógio andou sem a gente (aba travada): recomeça no próximo instante
    while (nextBar < now + HORIZON) {
      lastBar = composer.next(scene);
      scheduleBar(S, lastBar, nextBar, null, queue);
      nextBar += lastBar.dur;
    }
    // marca só as notas do próximo trecho (poucas por vez: a tela nem sente)
    let n = 0;
    while (n < queue.length && queue[n].t < now + HORIZON) playNote(S, queue[n++], now);
    if (n) queue.splice(0, n);
    sweep(now);
  }
  function open(delay, fadeIn) {
    g.tonic = theme().tonic;
    warm();
    const t0 = g.ctx.currentTime + delay;
    S = openSession(g, banks, theme(), t0, fadeIn);
    nextBar = t0 + 0.03;
  }
  function close(fade) {
    if (!S) return;
    closeSession(S, g.ctx.currentTime, fade);
    closing.push(S);
    S = null;
    queue = [];
    // os acordes que já não vão soar deixam de valer para os efeitos musicais
    const cut = g.ctx.currentTime + fade;
    g.harmony = g.harmony.filter((h) => h.t0 < cut);
  }

  const music = {
    themes: THEME_LIST,
    get theme() {
      return themeId;
    },
    get scene() {
      return scene;
    },
    get playing() {
      return !!S;
    },
    /** O último compasso marcado (para a bancada mostrar o acorde). */
    get bar() {
      return lastBar;
    },
    start({ fade = 0.6 } = {}) {
      if (S) return;
      // o primeiro compasso entra ~0,3 s depois: dá tempo de preparar as notas do banco aos poucos,
      // sem travar a tela no instante do toque
      open(0.3, fade);
      clearInterval(timer);
      timer = setInterval(tick, TICK_MS);
    },
    stop({ fade = 0.6 } = {}) {
      clearInterval(timer);
      timer = 0;
      close(fade);
    },
    /** Muda a etapa: vale a partir do próximo compasso. */
    setScene(id) {
      scene = id;
    },
    /** Troca de trilha: a atual some, a nova entra em seguida. */
    setTheme(id) {
      if (!THEMES[id] || id === themeId) return;
      themeId = id;
      composer = createComposer(themeId, seed == null ? {} : { seed });
      g.tonic = theme().tonic;
      if (S) {
        close(0.7);
        open(0.55, 0.7);
      }
    },
    tick,
    /**
     * Bancada (OfflineAudioContext): marca um roteiro de etapas a partir do instante `start`.
     * plan = [{ scene, bars }] · only = toca só um instrumento · session = continua a sessão devolvida
     * por uma chamada anterior (para marcar compasso a compasso, como ao vivo).
     * Devolve { dur, bars, session }.
     */
    renderPlan(plan, { start = 0.05, only = null, session = null } = {}) {
      g.tonic = theme().tonic;
      warm();
      const sess = session || openSession(g, banks, theme(), 0, 0.02);
      if (!session && only && only !== 'crackle' && sess.inst.crackle) sess.inst.crackle.bus.gain.value = 0;
      let t = start;
      const log = [];
      for (const part of plan) {
        for (let i = 0; i < part.bars; i++) {
          const bar = composer.next(part.scene);
          scheduleBar(sess, bar, t, only);
          log.push({ t, scene: bar.scene, section: bar.section, chords: bar.segments.map((s) => s.chord.name), notes: bar.events.length });
          t += bar.dur;
        }
      }
      return { dur: t, bars: log, session: sess };
    },
    /** Bancada: notas avulsas [{ inst, midi, t, dur, vel }] para conferir afinação e timbre. */
    renderNotes(notes) {
      warm();
      const sess = openSession(g, banks, theme(), 0, 0.005);
      for (const n of notes) {
        const I = sess.inst[n.inst];
        if (I) PLAYERS[I.mix.play](sess, I, n.t, { midi: n.midi, vel: n.vel == null ? 0.6 : n.vel }, n.dur || 1);
      }
    },
  };
  return music;
}

export { THEME_TRIM_DB, MIX };
