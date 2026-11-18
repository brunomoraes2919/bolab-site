// BOLAB — Ateliê: bancos de notas prontas (corda dedilhada, caixinha de música, marimba de brinquedo).
//
// Alguns timbres não dá para fazer só com nós nativos em tempo real (a corda dedilhada precisa de
// um laço mais curto do que o navegador permite) e outros sairiam caros (um sininho são três
// osciladores). Então cada nota desses timbres é calculada UMA vez, vira um buffer e depois é só
// tocada: uma fonte e um ganho por nota. Um buffer a cada 2 semitons; as notas vizinhas saem do
// buffer mais próximo com playbackRate (que também corrige a afinação exata da corda).
//
// A música (audio-music.js) e os efeitos musicais (audio-sfx.js) usam os mesmos bancos, que moram
// na mesa de som: g.banks.pluck · g.banks.box · g.banks.mallet.
import { mtof } from './audio-theory.js';

/** Corda dedilhada (Karplus-Strong estendido): ruído suave num laço com atraso de um período e amortecimento. */
export function pluckNote(sr, rnd, midi) {
  const f = mtof(midi);
  const blend = 0.5;
  const period = Math.max(2, Math.round(sr / f - blend));
  const f0 = sr / (period + blend); // afinação real do buffer (corrigida depois com playbackRate)
  const t60 = Math.max(1.3, Math.min(2.6, 2.6 - ((midi - 40) / 36) * 1.2));
  const len = Math.floor(sr * (t60 + 0.15));
  const out = new Float32Array(len);
  const line = new Float32Array(period);
  // dedo na corda de náilon: ruído bem arredondado, tocado a 1/5 do comprimento
  let lp1 = 0;
  let lp2 = 0;
  const soft = 0.22 + 0.2 * Math.min(1, (midi - 40) / 40);
  let mean = 0;
  for (let i = 0; i < period; i++) {
    lp1 += soft * (rnd() * 2 - 1 - lp1);
    lp2 += soft * (lp1 - lp2);
    line[i] = lp2;
    mean += lp2;
  }
  mean /= period;
  const pick = Math.max(1, Math.round(period * 0.2));
  const shaped = new Float32Array(period);
  let peak = 1e-9;
  for (let i = 0; i < period; i++) {
    shaped[i] = line[i] - mean - 0.55 * (line[(i - pick + period) % period] - mean);
    peak = Math.max(peak, Math.abs(shaped[i]));
  }
  for (let i = 0; i < period; i++) line[i] = shaped[i] / peak;
  const rho = Math.pow(10, -3 / (t60 * f0));
  let prev = line[period - 1];
  let idx = 0;
  let body = 0;
  const bodyA = Math.exp((-2 * Math.PI * 4200) / sr);
  let max = 1e-9;
  for (let n = 0; n < len; n++) {
    const x = line[idx];
    line[idx] = rho * ((1 - blend) * x + blend * prev);
    prev = x;
    idx = idx + 1 === period ? 0 : idx + 1;
    body = (1 - bodyA) * x + bodyA * body; // caixa do violão: tira o brilho de corda de aço
    out[n] = body;
    if (Math.abs(body) > max) max = Math.abs(body);
  }
  const fadeIn = Math.floor(sr * 0.0015);
  const fadeOut = Math.floor(sr * 0.05);
  for (let n = 0; n < len; n++) {
    let k = 0.9 / max;
    if (n < fadeIn) k *= n / fadeIn;
    if (n > len - fadeOut) k *= (len - n) / fadeOut;
    out[n] *= k;
  }
  return { data: out, f0 };
}

/** Lâmina de caixinha de música: fundamental pura, um terceiro harmônico discreto e o "tim" metálico que some logo. */
export function boxNote(sr, rnd, midi) {
  const f = mtof(midi);
  const t60 = Math.max(0.9, Math.min(2, 2 - ((midi - 60) / 36) * 0.9));
  const len = Math.floor(sr * (t60 + 0.1));
  const out = new Float32Array(len);
  const parts = [
    [1, 1, t60],
    [3, 0.07, t60 * 0.35],
    [6.27, 0.045, 0.14],
  ];
  for (const [k, amp, t] of parts) {
    if (f * k > 9000) continue;
    // senoide que decai por recorrência (duas multiplicações por amostra, sem seno nem exponencial no laço)
    const w = (2 * Math.PI * f * k) / sr;
    const r = Math.exp(-6.91 / (t * sr));
    const c1 = 2 * r * Math.cos(w);
    const c2 = r * r;
    const ph = rnd() * 0.4;
    let y1 = (amp / r) * Math.sin(ph - w);
    let y2 = (amp / c2) * Math.sin(ph - 2 * w);
    for (let n = 0; n < len; n++) {
      const y = c1 * y1 - c2 * y2;
      y2 = y1;
      y1 = y;
      out[n] += y;
    }
  }
  const click = Math.floor(sr * 0.003);
  for (let n = 0; n < click; n++) out[n] += (rnd() * 2 - 1) * 0.06 * (1 - n / click);
  const fadeIn = Math.floor(sr * 0.0012);
  const fadeOut = Math.floor(sr * 0.04);
  for (let n = 0; n < len; n++) {
    let k = 0.8;
    if (n < fadeIn) k *= n / fadeIn;
    if (n > len - fadeOut) k *= (len - n) / fadeOut;
    out[n] *= k;
  }
  return { data: out, f0: f };
}

/** Marimba de brinquedo: fundamental curta, quarto harmônico que some logo e o toque da baqueta. */
export function malletNote(sr, rnd, midi) {
  const f = mtof(midi);
  const t60 = Math.max(0.3, Math.min(0.55, 0.55 - ((midi - 60) / 36) * 0.2));
  const len = Math.floor(sr * (t60 + 0.05));
  const out = new Float32Array(len);
  const parts = [
    [1, 1, t60],
    [4, 0.16, t60 * 0.22],
  ];
  for (const [k, amp, t] of parts) {
    if (f * k > 9000) continue;
    const w = (2 * Math.PI * f * k) / sr;
    const r = Math.exp(-6.91 / (t * sr));
    const c1 = 2 * r * Math.cos(w);
    const c2 = r * r;
    let y1 = (amp / r) * Math.sin(-w);
    let y2 = (amp / c2) * Math.sin(-2 * w);
    for (let n = 0; n < len; n++) {
      const y = c1 * y1 - c2 * y2;
      y2 = y1;
      y1 = y;
      out[n] += y;
    }
  }
  // baqueta: um sopro de ruído de 6 ms, arredondado
  const tick = Math.floor(sr * 0.006);
  let lp = 0;
  for (let n = 0; n < tick; n++) {
    lp += 0.5 * (rnd() * 2 - 1 - lp);
    out[n] += lp * 0.18 * (1 - n / tick);
  }
  const fadeIn = Math.floor(sr * 0.001);
  const fadeOut = Math.floor(sr * 0.03);
  for (let n = 0; n < len; n++) {
    let k = 0.8;
    if (n < fadeIn) k *= n / fadeIn;
    if (n > len - fadeOut) k *= (len - n) / fadeOut;
    out[n] *= k;
  }
  return { data: out, f0: f };
}

/** Banco de notas: um buffer a cada 2 semitons; as notas vizinhas saem do mais próximo, com playbackRate. */
export function createBank(g, make) {
  const notes = new Map();
  const queue = [];
  let pumping = false;
  const build = (base) => {
    if (notes.has(base)) return notes.get(base);
    const { data, f0 } = make(g.ctx.sampleRate, g.rnd, base);
    const buffer = g.ctx.createBuffer(1, data.length, g.ctx.sampleRate);
    buffer.getChannelData(0).set(data);
    const note = { buffer, f0 };
    notes.set(base, note);
    return note;
  };
  const pump = () => {
    const base = queue.shift();
    if (base == null) return void (pumping = false);
    build(base);
    setTimeout(pump, 0); // um buffer por vez, devolvendo a vez para a tela entre um e outro
  };
  return {
    /** Prepara as notas de lo a hi. sync = tudo de uma vez (bancada); senão, aos poucos. */
    warm(lo, hi, sync = false) {
      for (let m = lo - (lo % 2); m <= hi + 1; m += 2) {
        if (notes.has(m)) continue;
        if (sync) build(m);
        else if (!queue.includes(m)) queue.push(m);
      }
      if (!sync && !pumping && queue.length) {
        pumping = true;
        setTimeout(pump, 0);
      }
    },
    /** As notas de lo a hi já estão prontas? */
    ready(lo, hi) {
      for (let m = lo - (lo % 2); m <= hi + 1; m += 2) if (!notes.has(m)) return false;
      return true;
    },
    /** { buffer, rate } para tocar a nota `midi`. */
    get(midi) {
      const note = build(midi - (((midi % 2) + 2) % 2));
      return { buffer: note.buffer, rate: mtof(midi) / note.f0 };
    },
    get size() {
      return notes.size;
    },
  };
}
