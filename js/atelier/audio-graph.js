// BOLAB — Ateliê: a "mesa de som" (o caminho que todo som percorre até o alto-falante).
//
//   efeitos ─┐
//   música ──┼─→ volume geral ─→ compressor ─→ teto suave ─→ saída
//   voz ─────┘        ↑
//   reverb (convolução com uma resposta de sala gerada aqui mesmo)
//
// Serve tanto para o som ao vivo (AudioContext) quanto para a bancada de medição
// (OfflineAudioContext): js/atelier/audio.js e lab/audio-offline.js montam a mesma mesa.
// Tudo é feito com nós nativos do navegador: nenhum cálculo por amostra roda na tela.
// Os únicos laços por amostra ficam aqui e rodam UMA vez (ruídos, resposta do reverb, texturas);
// depois os buffers são só reutilizados.
import { rngFrom } from './audio-theory.js';
import { createBank, pluckNote, boxNote, malletNote } from './audio-banks.js';

/** Quantos sons podem soar ao mesmo tempo (notas da música + efeitos). */
export const MAX_VOICES = 24;
/** Teto do limitador: nenhuma amostra passa disto (−1,4 dBFS). */
export const CEILING = 0.855;
/** Compressor do barramento mestre e o ganho que desfaz o "makeup" automático dele (medido em tools/audio_check.mjs). */
export const COMP = { threshold: -6, knee: 4, ratio: 12, attack: 0.003, release: 0.15 };
export const COMP_MAKEUP_DB = 2.56;

/** Curva dos controles de volume: 0–1 do deslizante → ganho (metade do curso ≈ −9 dB). */
export const taper = (v) => Math.pow(Math.max(0, Math.min(1, +v || 0)), 1.5);
export const dbToGain = (db) => Math.pow(10, db / 20);

/** Quanto a música e os efeitos abaixam enquanto a assistente fala. */
export const DUCK = { music: dbToGain(-11), sfx: dbToGain(-4), attack: 0.16, release: 0.7 };

/** Voz da assistente: volume a que todo clipe é trazido (RMS do trecho falado, dBFS) e o limite do ajuste. */
export const VOICE_TARGET_DB = -18;

/**
 * Ganho que traz um clipe de voz para o volume-alvo, para a assistente soar sempre igual seja qual
 * for a origem do arquivo. É uma leitura única do clipe, feita quando ele é carregado (1 amostra a
 * cada 4, em blocos de 50 ms; só os blocos com fala contam).
 */
export function voiceGain(buffer) {
  const d = buffer.getChannelData(0);
  const blk = Math.max(64, Math.floor(buffer.sampleRate * 0.05));
  const blocks = [];
  let peak = 0;
  for (let at = 0; at + blk <= d.length; at += blk) {
    let s = 0;
    for (let i = at; i < at + blk; i += 4) {
      const v = d[i];
      s += v * v;
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
    }
    blocks.push(s / (blk / 4));
  }
  if (!blocks.length || peak < 1e-4) return 1;
  const loudest = Math.max(...blocks);
  const speech = blocks.filter((ms) => ms > loudest * 0.01); // até 20 dB abaixo do bloco mais forte
  const rmsDb = 10 * Math.log10(speech.reduce((a, b) => a + b, 0) / speech.length);
  const gainDb = Math.max(-18, Math.min(14, VOICE_TARGET_DB - rmsDb));
  return Math.min(dbToGain(gainDb), 0.95 / peak);
}

function softClipCurve(n = 2049) {
  // Reta até 0,7; daí em diante dobra suavemente até o teto. Entradas além de ±1 ficam no teto.
  const knee = 0.7;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const ax = Math.abs(x);
    const y = ax <= knee ? ax : knee + (CEILING - knee) * Math.tanh((ax - knee) / (CEILING - knee));
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

function noiseBuffers(ctx, rnd) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * 2);
  const white = ctx.createBuffer(1, n, sr);
  const pink = ctx.createBuffer(1, n, sr);
  const brown = ctx.createBuffer(1, n, sr);
  const w = white.getChannelData(0);
  const p = pink.getChannelData(0);
  const b = brown.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const x = rnd() * 2 - 1;
    w[i] = x * 0.7;
    // rosa (filtro de Paul Kellet)
    b0 = 0.99886 * b0 + x * 0.0555179;
    b1 = 0.99332 * b1 + x * 0.0750759;
    b2 = 0.969 * b2 + x * 0.153852;
    b3 = 0.8665 * b3 + x * 0.3104856;
    b4 = 0.55 * b4 + x * 0.5329522;
    b5 = -0.7616 * b5 - x * 0.016898;
    p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11;
    b6 = x * 0.115926;
    // marrom (passeio com vazamento)
    last = (last + 0.02 * x) / 1.02;
    b[i] = last * 3.5;
  }
  // emenda sem estalo: os últimos 20 ms cruzam com o começo
  for (const d of [w, p, b]) {
    const f = Math.floor(sr * 0.02);
    for (let i = 0; i < f; i++) {
      const k = i / f;
      d[n - f + i] = d[n - f + i] * (1 - k) + d[i] * k;
    }
  }
  return { white, pink, brown };
}

/**
 * Resposta de uma sala pequena e quente (cozinha de ateliê): ~1,1 s, agudos morrem primeiro.
 * lite = versão de celular: um canal só e mais curta (a convolução é o que mais pesa na thread de
 * áudio, e o alto-falante do celular é mono de qualquer jeito).
 */
function roomImpulse(ctx, rnd, lite = false) {
  const sr = ctx.sampleRate;
  const seconds = lite ? 0.85 : 1.25;
  const t60 = lite ? 0.8 : 1.05;
  const n = Math.floor(sr * seconds);
  const channels = lite ? 1 : 2;
  const buf = ctx.createBuffer(channels, n, sr);
  const pre = Math.floor(sr * 0.009);
  for (let ch = 0; ch < channels; ch++) {
    const d = buf.getChannelData(ch);
    let y = 0;
    let a = 0;
    let level = 1;
    const fall = Math.exp(-6.91 / (t60 * sr)); // decaimento por amostra (sem exponencial dentro do laço)
    const rise = Math.floor(sr * 0.012);
    for (let i = pre; i < n; i++) {
      const k = i - pre;
      if ((k & 31) === 0) {
        const fc = 900 + 5200 * Math.exp((-k / sr) * 3.2);
        a = Math.exp((-2 * Math.PI * fc) / sr);
      }
      y = (1 - a) * (rnd() * 2 - 1) + a * y;
      d[i] = k < rise ? (y * level * k) / rise : y * level; // sem estalo no começo
      level *= fall;
    }
    // primeiras reflexões (paredes próximas), diferentes em cada lado
    const taps = ch === 0 ? [0.011, 0.019, 0.031, 0.043] : [0.013, 0.023, 0.029, 0.047];
    taps.forEach((sec, k) => {
      const at = Math.floor(sr * sec);
      const amp = 0.5 * Math.pow(0.72, k) * (k % 2 ? -1 : 1);
      for (let j = 0; j < 24 && at + j < n; j++) d[at + j] += amp * Math.exp(-j / 6) * (j % 2 ? -0.5 : 1);
    });
    const fade = Math.floor(sr * 0.05);
    for (let i = 0; i < fade; i++) d[n - 1 - i] *= i / fade;
  }
  return buf;
}

/**
 * Soma em `d`, a partir de `at`, uma senoide que decai (um "grão"): amp·sen(ph + w·j)·e^(−j/tau).
 * Usa a recorrência y[j] = c1·y[j−1] − c2·y[j−2]: duas multiplicações por amostra, sem seno nem
 * exponencial dentro do laço. wrap = dá a volta no fim do buffer (texturas que tocam em laço).
 */
function addGrain(d, at, len, amp, w, ph, tau, ramp, wrap) {
  const r = Math.exp(-1 / tau);
  const c1 = 2 * r * Math.cos(w);
  const c2 = r * r;
  let y1 = (amp / r) * Math.sin(ph - w);
  let y2 = (amp / c2) * Math.sin(ph - 2 * w);
  const n = d.length;
  for (let j = 0; j < len; j++) {
    const y = c1 * y1 - c2 * y2;
    y2 = y1;
    y1 = y;
    let i = at + j;
    if (i >= n) {
      if (!wrap) break;
      i -= n;
    }
    d[i] += j < ramp ? (y * j) / ramp : y;
  }
}

/* Texturas: nuvens de grãos prontas (confeito caindo, palmas, faísca, chiado de vinil). */
const TEXTURES = {
  // confeitos caindo: tiquezinhos agudos e curtos, cada vez mais raros
  grains(sr, rnd) {
    const n = Math.floor(sr * 0.75);
    const d = new Float32Array(n);
    for (let k = 0; k < 46; k++) {
      const at = Math.floor(Math.pow(rnd(), 1.6) * (n - sr * 0.03));
      const f = 2300 + rnd() * 3200;
      const tau = sr * (0.0012 + rnd() * 0.0022);
      const amp = 0.25 + rnd() * 0.75;
      const ph = rnd() * 6.28;
      addGrain(d, at, Math.floor(tau * 6), amp, (2 * Math.PI * f) / sr, ph, tau, 6, false);
    }
    return d;
  },
  // palmas: estalos de ruído, densos no meio e rareando
  claps(sr, rnd) {
    const n = Math.floor(sr * 1.6);
    const d = new Float32Array(n);
    for (let k = 0; k < 150; k++) {
      const u = rnd();
      const at = Math.floor((0.02 + Math.pow(u, 0.8) * 0.93) * (n - sr * 0.05));
      const env = Math.sin(Math.min(1, at / n / 0.3) * Math.PI * 0.5) * (1 - Math.pow(at / n, 2.2));
      const tau = sr * (0.004 + rnd() * 0.005);
      const amp = (0.35 + rnd() * 0.65) * env;
      const len = Math.floor(tau * 6);
      const fall = Math.exp(-1 / tau);
      let lp = 0;
      let level = amp;
      for (let j = 0; j < len && at + j < n; j++) {
        lp += 0.45 * (rnd() * 2 - 1 - lp);
        d[at + j] += j < 4 ? (level * lp * j) / 4 : level * lp;
        level *= fall;
      }
    }
    return d;
  },
  // faísca: crepitar fino e contínuo (emenda perfeita: os grãos dão a volta no fim)
  fizz(sr, rnd) {
    const n = Math.floor(sr * 1.2);
    const d = new Float32Array(n);
    for (let k = 0; k < 260; k++) {
      const at = Math.floor(rnd() * n);
      const f = 2800 + rnd() * 3600;
      const tau = sr * (0.0005 + rnd() * 0.0014);
      const amp = Math.pow(rnd(), 2) * 0.9 + 0.08;
      const ph = rnd() * 6.28;
      addGrain(d, at, Math.floor(tau * 6), amp, (2 * Math.PI * f) / sr, ph, tau, 4, true);
    }
    return d;
  },
  // vinil: estalinhos esparsos e um sopro muito baixo (laço de 4 s)
  crackle(sr, rnd) {
    const n = Math.floor(sr * 4);
    const d = new Float32Array(n);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      lp += 0.12 * (rnd() * 2 - 1 - lp);
      d[i] = lp * 0.05;
    }
    for (let k = 0; k < 30; k++) {
      const at = Math.floor(rnd() * (n - 400));
      const amp = (rnd() < 0.2 ? 0.7 : 0.25) * (0.4 + rnd() * 0.6) * (rnd() < 0.5 ? -1 : 1);
      const tau = 2 + rnd() * 7;
      for (let j = 0; j < 60; j++) d[at + j] += amp * Math.exp(-j / tau) * (j < 2 ? 0.6 : 1) * Math.cos(j * 0.9);
    }
    return d;
  },
};

/**
 * Monta a mesa de som em `ctx`. Devolve os pontos de entrada (g.sfx.in, g.music.in, g.voice.in,
 * e as entradas de reverb .rev), os buffers prontos e o controle de vozes simultâneas.
 */
export function buildGraph(ctx, { seed = null, lazy = false, lite = false } = {}) {
  const rnd = seed == null ? Math.random : rngFrom(seed);
  const mix = ctx.createGain();
  const master = ctx.createGain();
  const gate = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  const makeup = ctx.createGain();
  const clip = ctx.createWaveShaper();
  comp.threshold.value = COMP.threshold;
  comp.knee.value = COMP.knee;
  comp.ratio.value = COMP.ratio;
  comp.attack.value = COMP.attack;
  comp.release.value = COMP.release;
  makeup.gain.value = dbToGain(-COMP_MAKEUP_DB);
  clip.curve = softClipCurve();
  mix.connect(master).connect(gate).connect(comp).connect(makeup).connect(clip).connect(ctx.destination);

  const convolver = ctx.createConvolver();
  // ao vivo (lazy) a sala é gerada quando a tela estiver folgada (até 2 s depois), para não pesar
  // no toque que liga o som; até lá os sons saem secos, o que ninguém nota
  const room = () => (convolver.buffer = roomImpulse(ctx, rnd, lite));
  if (!lazy) room();
  else if (typeof requestIdleCallback === 'function') requestIdleCallback(room, { timeout: 2000 });
  else setTimeout(room, 500);
  const wet = ctx.createGain();
  wet.gain.value = 0.55;
  convolver.connect(wet).connect(mix);

  // Cada canal tem a entrada seca (.in) e a entrada que vai para o reverb (.rev); o volume e o
  // "abaixar para a voz" (duck) valem para as duas.
  const channel = () => {
    const ch = { in: ctx.createGain(), rev: ctx.createGain(), duck: ctx.createGain(), revDuck: ctx.createGain(), vol: ctx.createGain(), revVol: ctx.createGain() };
    ch.in.connect(ch.duck).connect(ch.vol).connect(mix);
    ch.rev.channelCount = 1;
    ch.rev.channelCountMode = 'explicit';
    ch.rev.connect(ch.revDuck).connect(ch.revVol).connect(convolver);
    return ch;
  };
  const sfx = channel();
  const music = channel();
  // a música passa por um filtro de "brilho" que cada trilha e cada etapa ajustam
  music.tone = ctx.createBiquadFilter();
  music.tone.type = 'lowpass';
  music.tone.frequency.value = 9000;
  music.tone.Q.value = 0.5;
  music.in.disconnect();
  music.in.connect(music.tone).connect(music.duck);

  const voice = { in: ctx.createGain(), vol: ctx.createGain(), analyser: ctx.createAnalyser() };
  voice.analyser.fftSize = 512;
  voice.analyser.smoothingTimeConstant = 0;
  voice.in.connect(voice.vol).connect(mix);
  voice.in.connect(voice.analyser);

  const textures = new Map();
  const g = {
    ctx,
    /** Versão de celular: reverb curto de um canal e nada de posição no estéreo (mesa toda mono). */
    lite,
    rnd,
    mix,
    master,
    gate,
    comp,
    makeup,
    clip,
    sfx,
    music,
    voice,
    noise: noiseBuffers(ctx, rnd),
    /** Tônica (classe de altura 0–11) da trilha atual: os efeitos "musicais" afinam por ela. */
    tonic: 2,
    /** Acordes agendados pela música: [{ t0, t1, pcs }] — os efeitos musicais tocam notas do acorde do momento. */
    harmony: [],
    /** Bancos de notas prontas (preenchidos em seguida; cada nota é gerada na primeira vez que é pedida). */
    banks: null,
    /** Ao vivo: efeitos já renderizados, prontos para tocar de um buffer (ver audio-sfx.js). */
    cache: lazy ? { map: new Map(), seconds: 0 } : null,
    /** Textura pronta (gerada na primeira vez e guardada). */
    texture(name) {
      if (!textures.has(name)) {
        const data = TEXTURES[name](ctx.sampleRate, rnd);
        const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
        buf.getChannelData(0).set(data);
        textures.set(name, buf);
      }
      return textures.get(name);
    },
    /** Prepara as texturas aos poucos (uma por vez, devolvendo a vez para a tela), para o primeiro uso não travar. */
    warm() {
      const todo = Object.keys(TEXTURES).filter((name) => !textures.has(name));
      const step = () => {
        const name = todo.shift();
        if (!name) return;
        g.texture(name);
        setTimeout(step, 30);
      };
      setTimeout(step, 30);
    },
    /** Classes de altura que soam bem no instante t: o acorde do momento, ou a pentatônica do tom. */
    pcsAt(t) {
      for (let i = g.harmony.length - 1; i >= 0; i--) {
        const h = g.harmony[i];
        if (t >= h.t0 - 0.02 && t < h.t1) return h.pcs;
      }
      return [0, 2, 4, 7, 9].map((iv) => (g.tonic + iv) % 12);
    },
    /** A nota permitida mais próxima de `midi` (empate: a de cima). */
    tune(midi, t) {
      const pcs = g.pcsAt(t);
      for (let d = 0; d <= 6; d++) {
        if (pcs.includes((((midi + d) % 12) + 12) % 12)) return midi + d;
        if (pcs.includes((((midi - d) % 12) + 12) % 12)) return midi - d;
      }
      return midi;
    },
    /* Vozes simultâneas: cada nota ou efeito reserva o seu intervalo de tempo. */
    voices: [],
    maxVoices: MAX_VOICES,
    peakVoices: 0,
    /**
     * Reserva uma voz entre t0 e t1. Com a mesa cheia, uma nota da música simplesmente não entra;
     * um efeito toma o lugar da nota de música mais antiga (kill a silencia em 30 ms).
     */
    alloc(kind, t0, t1, kill) {
      const now = ctx.currentTime;
      const live = (g.voices = g.voices.filter((v) => v.t1 > now));
      let overlap = 0;
      for (const v of live) if (v.t0 < t1 && v.t1 > t0) overlap++;
      if (overlap >= g.maxVoices) {
        if (kind === 'music') return null;
        const victim = live.find((v) => v.kind === 'music' && v.t0 < t1 && v.t1 > t0) || live.find((v) => v.t0 < t1 && v.t1 > t0);
        if (victim) {
          victim.kill?.(Math.max(now, t0));
          victim.t1 = Math.max(now, t0) + 0.04;
        }
      } else if (overlap + 1 > g.peakVoices) g.peakVoices = overlap + 1;
      const voice = { kind, t0, t1, kill };
      live.push(voice);
      return voice;
    },
    /** Quantas vozes soam agora. */
    activeVoices() {
      const now = ctx.currentTime;
      return g.voices.filter((v) => v.t0 <= now && v.t1 > now).length;
    },
    /** Ajusta o volume de um canal (0–1 do deslizante) sem estalo. */
    setLevel(name, value, trim = 1, ramp = 0.04) {
      const t = ctx.currentTime;
      const gain = taper(value) * trim;
      const tc = Math.max(0.001, ramp / 3);
      if (name === 'master') return void master.gain.setTargetAtTime(gain, t, tc);
      if (name === 'voice') return void voice.vol.gain.setTargetAtTime(gain, t, tc);
      const ch = g[name];
      ch.vol.gain.setTargetAtTime(gain, t, tc);
      ch.revVol.gain.setTargetAtTime(gain, t, tc);
    },
    /** Abaixa (on) ou devolve (off) a música e os efeitos enquanto a voz fala. */
    setDuck(on, t = ctx.currentTime) {
      const tc = (on ? DUCK.attack : DUCK.release) / 3;
      for (const [ch, depth] of [[music, DUCK.music], [sfx, DUCK.sfx]]) {
        for (const p of [ch.duck.gain, ch.revDuck.gain]) {
          p.cancelScheduledValues(t);
          p.setTargetAtTime(on ? depth : 1, t, tc);
        }
      }
      g.ducked = !!on;
    },
    ducked: false,
  };
  g.banks = { pluck: createBank(g, pluckNote), box: createBank(g, boxNote), mallet: createBank(g, malletNote) };
  return g;
}
