// BOLAB — texto e festa: mensagem escrita com bico no topo, velas de número, vela faísca e topo personalizado.
// Cada construtor recebe (ctx, part), como em decor.js. Nada de arquivos de fonte: o texto é desenhado num
// <canvas> com as fontes do aparelho e vira textura (escrita) ou contorno recortado de verdade (topo e velas).
import * as THREE from 'three';
import { Batch, groundBlob, plaqueLiftOf, addVol, plannedHeights } from './decor.js';
import { rng, hashString, makeCanvas } from './textures.js';
import { topperLines, topperSize, VOL } from './occupancy.js';
import { getSize, tierRadii } from '../data/customizer.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const CURSIVA = '"Dancing Script", "Segoe Script", "Brush Script MT", "Snell Roundhand", cursive';
// Bastão: a letra de fôrma é desenhada fina (peso 300) e engordada com um traço redondo de espessura constante —
// é isso que um bico perlê faz. (Uma fonte já gorda, como a Arial Rounded, sairia com traços de larguras diferentes.)
const BASTAO = 'Nunito, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const faceOf = (bastao) => `${bastao ? 300 : 400} {px}px ${bastao ? BASTAO : CURSIVA}`;
const DIGITOS = '"Arial Rounded MT Bold", Nunito, "Varela Round", system-ui, sans-serif';
const HEX = /^#[0-9a-f]{6}$/i;

const _hsl = { h: 0, s: 0, l: 0 };
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();

/** Mesma correção de cor do motor: tons claros levemente escurecidos, para a tela mostrar a cor escolhida. */
function shown(hex, target = new THREE.Color()) {
  target.set(hex).getHSL(_hsl);
  const light = THREE.MathUtils.smoothstep(_hsl.l, 0.45, 0.8);
  return target.setHSL(_hsl.h, Math.min(1, _hsl.s * (1 + 0.1 * light)), _hsl.l * (1 - 0.095 * light));
}

/* ───────── Rascunho ─────────
   Um <canvas> e alguns vetores reaproveitados entre as construções: enquanto a pessoa digita,
   só as texturas (ou a malha) da peça nova são alocadas. */

let pad = null;
let padCtx = null;
function scratch(w, h) {
  if (!pad) {
    pad = makeCanvas(Math.max(64, w), Math.max(64, h));
    padCtx = pad.getContext('2d', { willReadFrequently: true });
  }
  if (pad.width < w || pad.height < h) {
    pad.width = Math.max(pad.width, w);
    pad.height = Math.max(pad.height, h);
  }
  padCtx.setTransform(1, 0, 0, 1, 0, 0);
  padCtx.clearRect(0, 0, pad.width, pad.height);
  return padCtx;
}

const FB = [];
function fbuf(i, n) {
  if (!FB[i] || FB[i].length < n) FB[i] = new Float32Array(n);
  return FB[i];
}
const IB = [];
function ibuf(i, n) {
  if (!IB[i] || IB[i].length < n) IB[i] = new Int32Array(n);
  return IB[i];
}

/** Desfoque de caixa (uma passada na horizontal e outra na vertical). dst pode ser o próprio src. */
function boxBlur(src, dst, w, h, r) {
  if (r < 1) {
    if (dst !== src) dst.set(src.subarray(0, w * h));
    return;
  }
  const tmp = fbuf(8, w * h);
  const col = fbuf(9, w);
  const k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let s = 0;
    for (let x = 0; x <= r && x < w; x++) s += src[o + x];
    for (let x = 0; x < w; x++) {
      tmp[o + x] = s * k;
      const a = x + r + 1;
      const b = x - r;
      if (a < w) s += src[o + a];
      if (b >= 0) s -= src[o + b];
    }
  }
  col.fill(0, 0, w);
  for (let y = 0; y <= r && y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) col[x] += tmp[o + x];
  }
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) dst[o + x] = col[x] * k;
    const a = y + r + 1;
    const b = y - r;
    if (a < h) {
      const oa = a * w;
      for (let x = 0; x < w; x++) col[x] += tmp[oa + x];
    }
    if (b >= 0) {
      const ob = b * w;
      for (let x = 0; x < w; x++) col[x] -= tmp[ob + x];
    }
  }
}

function blur(src, dst, w, h, r, passes) {
  boxBlur(src, dst, w, h, r);
  for (let i = 1; i < passes; i++) boxBlur(dst, dst, w, h, r);
}

/** Lê a tinta (canal alfa) do rascunho para um vetor 0…1. */
function readInk(g, w, h, out) {
  const d = g.getImageData(0, 0, w, h).data;
  for (let i = 0, n = w * h; i < n; i++) out[i] = d[i * 4 + 3] * (1 / 255);
  return out;
}

function dataTexture(data, w, h, { srgb = false, aniso = 4 } = {}) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

/* ───────── Quem fica onde no topo ─────────
   Quem decide é o distribuidor (occupancy.js), o mesmo plano que todas as decorações leem — ctx.layout.party:
     text     onde cabe a escrita: retângulo livre { mode: 'flat', x, z, hw, hh } ou arco na frente { mode: 'arc', rmid, half, hh }
     topper   o nome em acrílico: { x, z, maxW, maxEm, lift, stakeX, tilt }
     numbers  velas de número: { x, z, s, w } · sparkler: { x, z } · (plaquinha, estrelas e velas clássicas: decor.js)
   Aqui cada peça mede o texto de verdade (as fontes são do aparelho) e se ajusta para caber no lugar reservado. */

function plaqueTop(text, lift = 0.34) {
  const t = String(text || '').trim();
  if (!t) return 0;
  return lift + (t.length > 14 && t.includes(' ') ? 0.52 : 0.36); // mesmas medidas da plaquinha (decor.js)
}

/* ───────── Escrita com bico ─────────
   O texto é desenhado no rascunho, vira um campo de alturas (um cordão arredondado, mais alto onde o traço é
   mais cheio) e sai em três texturas: cor + alfa, relevo (normais) e sombra de contato. No bolo são poucas
   lâminas empilhadas: a de baixo dá o contorno (bem recortado em qualquer zoom) e as de cima, cada uma
   cortada numa cota do cordão, dão o volume de verdade quando a câmera baixa. */

const LINE_GAP = 0.1;

/**
 * Espessura do traço da fonte que o aparelho escolheu, em frações do tamanho da letra (cada aparelho tem as suas
 * fontes): 2 × área ÷ contorno de uma amostra pequena. Medida uma vez por fonte.
 */
const STROKES = new Map();
function strokeOf(font) {
  const g = scratch(160, 96);
  g.font = font.replace('{px}', '64');
  const key = `${font}|${g.measureText('Hamburgefonstiv').width.toFixed(1)}`; // muda se uma fonte melhor terminar de carregar
  if (STROKES.has(key)) return STROKES.get(key);
  g.fillStyle = '#fff';
  g.textBaseline = 'alphabetic';
  g.fillText('nou', 16, 60);
  const d = g.getImageData(0, 0, 160, 96).data;
  let area = 0;
  let edge = 0;
  for (let y = 0; y < 95; y++) {
    for (let x = 0; x < 159; x++) {
      const i = (y * 160 + x) * 4 + 3;
      area += d[i];
      edge += Math.abs(d[i + 4] - d[i]) + Math.abs(d[i + 640] - d[i]);
    }
  }
  const em = clamp((2 * area) / (edge * 0.785 + 1) / 64 || 0.08, 0.015, 0.3);
  STROKES.set(key, em);
  return em;
}

/** Escolhe quebra de linha e tamanho do texto para caber no lugar que o distribuidor reservou (plan = layout.party.text). */
function fitScript(g, text, bastao, plan) {
  const fat = bastao ? Math.max(0, 0.115 - strokeOf(faceOf(true))) : 0; // quanto o cordão engorda a letra de fôrma (em)
  g.font = faceOf(bastao).replace('{px}', '100');
  const sp = bastao ? 0.035 + fat * 0.9 : 0; // espaço extra entre letras de fôrma
  const ex = 0.055 + fat / 2; // folga do cordão em volta da tinta (em)
  const smax = bastao ? 0.34 : 0.42;
  const measure = (s) => {
    const t = g.measureText(s);
    const l = (t.actualBoundingBoxLeft || 0) / 100;
    const r = (t.actualBoundingBoxRight ?? t.width) / 100 + sp * Math.max(0, s.length - 1);
    return { s, l, r, w: Math.max(0.2, l + r), a: (t.actualBoundingBoxAscent ?? 72) / 100, d: (t.actualBoundingBoxDescent ?? 22) / 100 };
  };
  const block = (parts) => {
    const lines = parts.map(measure);
    const bases = [0];
    for (let i = 1; i < lines.length; i++) bases.push(bases[i - 1] + clamp(lines[i - 1].d + lines[i].a + LINE_GAP, 0.62, 1.2));
    const top = -(lines[0].a + ex);
    const bottom = bases[bases.length - 1] + lines[lines.length - 1].d + ex;
    return { lines, bases, top, hb: bottom - top, wb: Math.max(...lines.map((l) => l.w)) + 2 * ex };
  };
  const one = block([text]);
  if (plan.mode === 'arc') {
    // meio ocupado num bolo redondo: o texto acompanha a borda da frente, em arco, dentro da faixa reservada
    const s = Math.min(smax * 0.8, (2 * plan.hh) / one.hb, (2 * plan.half * plan.rmid) / one.wb);
    return { mode: 'arc', b: one, s, x: plan.x, z: plan.z, rmid: plan.rmid, sp, ex };
  }
  // reto: o maior tamanho que cabe no retângulo reservado, em uma ou duas linhas
  const sizeOf = (b) => Math.min(smax, (2 * plan.hw) / b.wb, (2 * plan.hh) / b.hb);
  let pick = { b: one, s: sizeOf(one) };
  for (let i = 1; i < text.length - 1; i++) {
    if (text[i] !== ' ') continue;
    const a = text.slice(0, i).trim();
    const c = text.slice(i + 1).trim();
    if (!a || !c) continue;
    const two = block([a, c]);
    const s2 = sizeOf(two);
    // duas linhas só quando a letra fica bem maior
    if (s2 > (pick.b === one ? pick.s * 1.2 : pick.s)) pick = { b: two, s: s2 };
  }
  return { mode: 'flat', b: pick.b, s: pick.s, x: plan.x, z: plan.z, sp, ex };
}

/** Desenha as linhas no rascunho (tinta branca). k = pixels por unidade do mundo. Devolve as medidas da textura. */
function drawScript(fit, bastao, k, maxW, maxH, seed) {
  const { b, sp } = fit;
  const face = faceOf(bastao);
  const own = strokeOf(face) * fit.s; // traço que a fonte já tem (unidades do mundo)
  const fs0 = fit.s * k;
  const lim = Math.min(1, (maxW - 40) / (b.wb * fs0), (maxH - 40) / (b.hb * fs0));
  const fs = fs0 * lim; // tamanho da fonte em pixels
  const kk = k * lim;
  const mg = Math.min(20, Math.ceil(fs * 0.1) + 4);
  const W = Math.ceil(b.wb * fs) + 2 * mg;
  const H = Math.ceil(b.hb * fs) + 2 * mg;
  const g = scratch(W, H);
  const r = rng(seed);
  // espessura do cordão: a de um bico de escrever de verdade (3 a 4 mm), sem entupir as letras pequenas
  const want = bastao ? clamp(0.115 * fit.s, 0.026, 0.042) : clamp(0.1 * fit.s, 0.026, 0.046);
  const grow = clamp(want - own, bastao ? -0.45 * own : 0.015 * fit.s, 0.12 * fit.s) * kk; // > 0 engorda · < 0 afina (nunca mais que metade do traço)
  g.font = face.replace('{px}', fs);
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  b.lines.forEach((l, i) => {
    const yb = mg + (b.bases[i] - b.top) * fs;
    const x0 = W / 2 - ((l.r - l.l) * fs) / 2;
    if (!bastao) {
      // cursiva: a palavra inteira de uma vez (as letras se emendam), com a linha levemente inclinada
      g.save();
      g.translate(W / 2, yb);
      g.rotate((r() - 0.5) * 0.022);
      g.translate(-W / 2, -yb);
      g.lineWidth = Math.max(1, grow);
      g.fillText(l.s, x0, yb);
      g.strokeText(l.s, x0, yb);
      g.restore();
      return;
    }
    // bastão: letra por letra, cada uma um tico fora do lugar, como sai da mão. O normal é a letra fina engordar
    // com o traço redondo; se o aparelho só tiver uma fonte gorda, um contorno "borracha" come o excesso.
    const put = [];
    for (let j = 0; j < l.s.length; j++) {
      const ch = l.s[j];
      if (ch === ' ') continue;
      const cw = g.measureText(ch).width;
      put.push({ ch, cw, x: x0 + g.measureText(l.s.slice(0, j)).width + j * sp * fs + cw / 2, y: yb - fs * 0.3 + (r() - 0.5) * fs * 0.035, a: (r() - 0.5) * 0.07, sc: 0.97 + r() * 0.06 });
    }
    for (let pass = 0; pass < 2; pass++) {
      if (pass === 1 && grow >= 0) break;
      g.globalCompositeOperation = pass ? 'destination-out' : 'source-over';
      g.lineWidth = pass ? -grow : Math.max(1, grow);
      put.forEach((p) => {
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.a);
        g.scale(p.sc, p.sc);
        if (!pass) g.fillText(p.ch, -p.cw / 2, fs * 0.3);
        if (pass || grow > 0) g.strokeText(p.ch, -p.cw / 2, fs * 0.3);
        g.restore();
      });
    }
    g.globalCompositeOperation = 'source-over';
  });
  return { g, W, H, k: kk, fs };
}

// tabelas: seção do cordão (meia-cana) e tom da cor conforme a cota — evitam uma potência por pixel
const DOME = new Float32Array(1025);
const TONE = new Uint8Array(257);
for (let i = 0; i <= 1024; i++) DOME[i] = Math.pow(i / 1024, 0.55);
for (let i = 0; i <= 256; i++) TONE[i] = Math.round(255 * Math.pow(0.74 + (0.26 * i) / 256, 0.4545));

/**
 * Do desenho às texturas do cordão. O trabalho pesado (o desfoque largo que dá o "miolo" do traço) é feito em
 * meia resolução, e as contas por pixel só passam por onde há tinta — é o que mantém a construção em poucos ms.
 */
function pipedMaps(g, W, H, k, fs, seed) {
  const n = W * H;
  const w2 = (W + 1) >> 1;
  const h2 = (H + 1) >> 1;
  const n2 = w2 * h2;
  const M = fbuf(0, n); // tinta, já com o tremor da mão; depois, a cota (0…1) de cada ponto
  const S = fbuf(1, n); // contorno suavizado
  const Hf = fbuf(2, n); // alturas (para o relevo)
  const Mh = fbuf(3, n2); // tinta em meia resolução
  const B = fbuf(4, n2); // "miolo" em meia resolução
  const img = g.getImageData(0, 0, W, H).data;
  const r = rng(seed);

  // tremor da mão: a linha de base ondula de leve · pressão: o cordão sai ora mais cheio, ora mais magro
  const iy = ibuf(0, W);
  const fy = fbuf(5, W);
  const nx = fbuf(6, W);
  const ny = fbuf(7, H);
  const wob = fs * 0.014;
  const f1 = ((1.3 + r() * 1.4) * TAU) / W;
  const f2 = ((3.1 + r() * 2.2) * TAU) / W;
  const p1 = r() * TAU;
  const p2 = r() * TAU;
  const f3 = TAU / (fs * (0.7 + r() * 0.5));
  const f4 = TAU / (fs * (0.5 + r() * 0.4));
  const p3 = r() * TAU;
  const p4 = r() * TAU;
  for (let x = 0; x < W; x++) {
    const dy = wob * (Math.sin(x * f1 + p1) * 0.65 + Math.sin(x * f2 + p2) * 0.35);
    iy[x] = Math.floor(dy);
    fy[x] = dy - iy[x];
    nx[x] = 0.07 * Math.sin(x * f3 + p3);
  }
  for (let y = 0; y < H; y++) ny[y] = 1 + 0.07 * Math.sin(y * f4 + p4);
  const edgeY = H - 1;
  for (let y = 0; y < H; y++) {
    const o = y * W;
    for (let x = 0; x < W; x++) {
      const ya = y + iy[x];
      const a = ya >= 0 && ya <= edgeY ? img[(ya * W + x) * 4 + 3] : 0;
      const c = ya >= -1 && ya < edgeY ? img[((ya + 1) * W + x) * 4 + 3] : 0;
      M[o + x] = (a + (c - a) * fy[x]) * (1 / 255);
    }
  }

  // meia resolução; de passagem, área e contorno da tinta: largura típica do traço = 2 × área ÷ contorno
  // (vale para qualquer fonte que o aparelho tenha)
  let area = 0;
  for (let y = 0; y < h2; y++) {
    const ya = y * 2 * W;
    const yb = Math.min(y * 2 + 1, edgeY) * W;
    for (let x = 0; x < w2; x++) {
      const xa = x * 2;
      const xb = Math.min(xa + 1, W - 1);
      const v = (M[ya + xa] + M[ya + xb] + M[yb + xa] + M[yb + xb]) * 0.25;
      Mh[y * w2 + x] = v;
      area += v;
    }
  }
  let edge = 0;
  for (let y = 0; y < h2 - 1; y++) {
    const o = y * w2;
    for (let x = 0; x < w2 - 1; x++) {
      const v = Mh[o + x];
      edge += Math.abs(Mh[o + x + 1] - v) + Math.abs(Mh[o + x + w2] - v);
    }
  }
  // "miolo": a tinta bem desfocada vale ~0,8 no eixo do traço e ~0,5 na borda quando o desfoque é traço ÷ 2,7.
  // A média dele sobre a tinta diz a largura efetiva do traço; se o primeiro palpite errou, refaz uma vez.
  let wh = clamp((2 * area) / (edge * 0.785 + 1e-6), 1.5, 40); // largura do traço, em pixels de meia resolução
  let rB = Math.max(1, Math.round(wh / 2.7 - 0.5));
  for (let pass = 0; pass < 2; pass++) {
    blur(Mh, B, w2, h2, rB, 3);
    let sum = 0;
    for (let i = 0; i < n2; i++) sum += Mh[i] * B[i];
    wh = clamp((Math.sqrt(rB * (rB + 1)) * 0.798) / Math.max(0.02, 1 - sum / (area + 1e-6)), 1.5, 45);
    const next = Math.max(1, Math.round(wh / 2.7 - 0.5));
    if (next === rB) break;
    rB = next;
  }
  const wpx = wh * 2;
  boxBlur(M, S, W, H, 1); // contorno

  // de cada pixel para a meia resolução (amostra entre os dois vizinhos mais próximos)
  const xi = ibuf(4, W);
  const xf = fbuf(10, W);
  for (let x = 0; x < W; x++) {
    const u = Math.max(0, (x - 0.5) / 2);
    xi[x] = Math.min(w2 - 1, Math.floor(u));
    xf[x] = xi[x] + 1 < w2 ? u - xi[x] : 0;
  }

  const col = new Uint8ClampedArray(n * 4);
  const nrm = new Uint8ClampedArray(n * 4);
  new Uint32Array(col.buffer).fill(TONE[0] * 0x010101); // sem tinta: transparente, já no tom do pé do cordão
  new Uint32Array(nrm.buffer).fill(0xffff8080); // sem tinta: relevo plano
  for (let y = 0; y < H; y++) {
    const o = y * W;
    const v = Math.max(0, (y - 0.5) / 2);
    const ya = Math.min(h2 - 1, Math.floor(v));
    const yf = ya + 1 < h2 ? v - ya : 0;
    const oa = ya * w2;
    const ob = Math.min(h2 - 1, ya + 1) * w2;
    const press = ny[y];
    for (let x = 0; x < W; x++) {
      const i = o + x;
      const s = S[i];
      if (s < 0.004) {
        Hf[i] = 0;
        M[i] = 0;
        continue;
      }
      const j = xi[x];
      const t = xf[x];
      const j2 = t ? j + 1 : j;
      const top = B[oa + j] + (B[oa + j2] - B[oa + j]) * t;
      const bot = B[ob + j] + (B[ob + j2] - B[ob + j]) * t;
      // seção do cordão: meia-cana (mais baixa nos traços finos, platô nos encontros), só por dentro do contorno
      const q = clamp((top + (bot - top) * yf - 0.5) / 0.35, 0, 1);
      const e = clamp((s - 0.35) / 0.57, 0, 1);
      const dome = DOME[(q * 1024) | 0] * e * e * (3 - 2 * e);
      Hf[i] = (0.2 * s + 0.8 * dome) * (press + nx[x]);
      M[i] = dome;
    }
  }

  const wWorld = wpx / k;
  const hBead = clamp(0.6 * wWorld, 0.008, 0.028); // altura do cordão (unidades do mundo)
  const hk = hBead * k * 0.5;
  for (let y = 1; y < H - 1; y++) {
    const yo = (H - 1 - y) * W; // a linha 0 da textura é a base das letras
    const o = y * W;
    for (let x = 1; x < W - 1; x++) {
      const i = o + x;
      const s = S[i];
      if (s < 0.004) continue;
      const t = (yo + x) * 4;
      const dx = (Hf[i + 1] - Hf[i - 1]) * hk;
      const dy = (Hf[i + W] - Hf[i - W]) * hk;
      const inv = 127.5 / Math.sqrt(dx * dx + dy * dy + 1);
      nrm[t] = 127.5 - dx * inv;
      nrm[t + 1] = 127.5 + dy * inv;
      nrm[t + 2] = 127.5 + inv;
      // cor: branco (o material dá o tom), um pouco mais fechado no pé do cordão
      const tone = TONE[(M[i] * 256) | 0];
      col[t] = tone;
      col[t + 1] = tone;
      col[t + 2] = tone;
      // alfa: 0…0,25 = contorno (suavizado) · 0,25…1 = cota do cordão, onde as lâminas de cima são cortadas
      col[t + 3] = (0.25 * s + 0.75 * M[i]) * 255;
    }
  }

  // sombra de contato: o "miolo" e uma versão mais aberta dele, um pouco deslocados para a frente
  const A2 = fbuf(3, n2);
  blur(B, A2, w2, h2, Math.max(1, Math.round(wh * 0.3)), 2);
  const off = Math.round(wh * 0.16);
  const sh = new Uint8ClampedArray(n2 * 4);
  new Uint32Array(sh.buffer).fill(0x00ffffff);
  for (let y = 0; y < h2; y++) {
    const yo = (h2 - 1 - y) * w2;
    const ys = clamp(y - off, 0, h2 - 1) * w2;
    for (let x = 0; x < w2; x++) {
      const a = B[ys + x] * 1.05 + A2[ys + x] * 0.45;
      if (a > 0.004) sh[(yo + x) * 4 + 3] = a * 255;
    }
  }
  return { col: new Uint8Array(col.buffer), nrm: new Uint8Array(nrm.buffer), sh: new Uint8Array(sh.buffer), w2, h2, hBead };
}

/**
 * Faixa onde o texto é aplicado: reta, ou curvada em arco em volta do centro do bolo (rmid > 0).
 * levels = altura de cada lâmina (uma faixa por lâmina, todas na mesma malha) · cuts = cota em que cada uma é cortada.
 */
function stripGeometry(w, h, rmid = 0, levels = [0], cuts = null) {
  const nu = rmid ? Math.max(8, Math.round((w / rmid) * 14)) : 1;
  const per = (nu + 1) * 2;
  const pos = new Float32Array(levels.length * per * 3);
  const nor = new Float32Array(levels.length * per * 3);
  const uv = new Float32Array(levels.length * per * 2);
  const cut = cuts ? new Float32Array(levels.length * per) : null;
  const idx = [];
  levels.forEach((y, l) => {
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      for (let v = 0; v < 2; v++) {
        const k = l * per + i * 2 + v;
        if (rmid) {
          const a = ((u - 0.5) * w) / rmid;
          const rad = rmid - (v - 0.5) * h; // o alto das letras aponta para o centro
          pos[k * 3] = rad * Math.sin(a);
          pos[k * 3 + 2] = rad * Math.cos(a) - rmid;
        } else {
          pos[k * 3] = (u - 0.5) * w;
          pos[k * 3 + 2] = -(v - 0.5) * h;
        }
        pos[k * 3 + 1] = y;
        nor[k * 3 + 1] = 1;
        uv[k * 2] = u;
        uv[k * 2 + 1] = v;
        if (cut) cut[k] = cuts[l];
      }
      if (i < nu) {
        const a = l * per + i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (cut) geo.setAttribute('cut', new THREE.BufferAttribute(cut, 1));
  geo.setIndex(idx);
  return geo;
}

/** Contorno nítido em qualquer zoom: o alfa da textura é um degradê e o corte acompanha o tamanho do pixel na tela. */
function crispEdge(material) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <alphatest_fragment>',
      'float bolabEdge = max( fwidth( diffuseColor.a ), 0.0001 ) * 0.75;\n\tdiffuseColor.a = smoothstep( 0.125 - bolabEdge, 0.125 + bolabEdge, diffuseColor.a );\n\t#include <alphatest_fragment>',
    );
  };
  material.customProgramCacheKey = () => 'bolab-escrita';
  return material;
}

/** Lâminas do volume: cada uma descarta o que fica abaixo da sua cota (atributo `cut`) — todas num desenho só. */
function cutByHeight(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `attribute float cut;\nvarying float vCut;\n${shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvCut = cut;')}`;
    shader.fragmentShader = `varying float vCut;\n${shader.fragmentShader.replace('#include <alphatest_fragment>', 'if ( diffuseColor.a < vCut ) discard;')}`;
  };
  material.customProgramCacheKey = () => 'bolab-escrita-cota';
  return material;
}

function buildScript(ctx, part) {
  const { config, m, lib, layout } = ctx;
  const d = config.decor;
  const text = String(layout.script ?? (d.messageMode === 'bico' ? d.message : '') ?? '')
    .trim()
    .slice(0, 24);
  if (!text) return;
  const bastao = d.script === 'bastao';
  const mobile = lib.detail < 1;
  part.volumes = [];
  const plan = layout.party?.text; // o lugar que o distribuidor reservou para a escrita (nada mais fica ali)
  if (!plan) return;
  const seed = hashString(`escrita${text}${bastao}`);
  const fit = fitScript(scratch(8, 8), text, bastao, plan);
  const ink = drawScript(fit, bastao, mobile ? 380 : 480, mobile ? 512 : 768, mobile ? 256 : 384, seed);
  const maps = pipedMaps(ink.g, ink.W, ink.H, ink.k, ink.fs, seed);

  const aniso = mobile ? 2 : 8;
  const colTex = dataTexture(maps.col, ink.W, ink.H, { srgb: true, aniso });
  const nrmTex = dataTexture(maps.nrm, ink.W, ink.H, { aniso });
  const shTex = dataTexture(maps.sh, maps.w2, maps.h2, { aniso: 1 });
  const w = ink.W / ink.k;
  const h = ink.H / ink.k;
  const rmid = fit.mode === 'arc' ? fit.rmid : 0;
  const geo = stripGeometry(w, h, rmid);
  const color = shown(HEX.test(d.messageColor) ? d.messageColor : '#d96b82');
  // glacê de escrever: liso, com um brilho macio que acompanha o cordão
  const look = { color, map: colTex, normalMap: nrmTex, normalScale: new THREE.Vector2(1, 1), roughness: 0.45, clearcoat: 0.24, clearcoatRoughness: 0.32, envMapIntensity: 0.75 };
  // granulado e confete deixam livre o lugar da escrita: o cordão assenta direto na cobertura
  const over = 0;
  const group = new THREE.Group();

  const clip = ctx.clip || {}; // planos de corte do "ver por dentro": a escrita é fatiada junto com o bolo
  const shadow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: shTex, color: 0x3a1420, transparent: true, opacity: 0.32, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, ...clip }));
  shadow.position.y = 0.0006;
  shadow.renderOrder = -0.6; // antes das chamas e dos clarões, que ficam acima do bolo
  const base = new THREE.Mesh(geo, crispEdge(lib.physical({ ...look, ...clip, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
  base.position.y = 0.0012 + over;
  base.renderOrder = -0.5;
  base.receiveShadow = true;
  group.add(shadow, base);
  part.owned.push(geo, colTex, nrmTex, shTex, shadow.material, base.material);

  const shells = mobile ? 4 : 8;
  const levels = [];
  const cuts = [];
  for (let j = 1; j <= shells; j++) {
    const t = j / (shells + 1);
    levels.push(0.0012 + over + maps.hBead * (0.2 + 0.8 * t));
    cuts.push(0.25 + 0.75 * t);
  }
  const stack = new THREE.Mesh(stripGeometry(w, h, rmid, levels, cuts), cutByHeight(lib.physical({ ...look, ...clip })));
  stack.receiveShadow = true;
  group.add(stack);
  part.owned.push(stack.geometry, stack.material);

  if (fit.mode === 'arc') group.position.set(fit.x, layout.topY, fit.z + fit.rmid);
  else group.position.set(fit.x, layout.topY, fit.z);
  part.addObject(group, m, Math.max(0.2, w * 0.5));
  if (ctx.clip) part.objects[part.objects.length - 1].clipped = true; // não some com a fatia: é cortada com o bolo
  part.script = { x: group.position.x, y: layout.topY, z: group.position.z, w, h }; // onde a escrita ficou (para a câmera, se quiser)
  // volumes: discos rentes ao topo cobrindo a tinta (bloco do texto, sem as margens transparentes da textura)
  const tw = fit.b.wb * fit.s;
  const th = fit.b.hb * fit.s;
  const rd = Math.min(0.03, th / 2, tw / 2);
  const ny = Math.max(1, Math.ceil(th / (rd * 1.7)));
  if (fit.mode === 'arc') {
    const half = tw / 2 / fit.rmid;
    const na = Math.max(2, Math.ceil(tw / (rd * 1.7)));
    for (let i = 0; i <= na; i++) {
      const a = Math.PI / 2 - half + (2 * half * i) / na;
      for (let j = 0; j <= ny; j++) {
        const rad = fit.rmid - th / 2 + rd + ((th - 2 * rd) * j) / ny;
        part.volumes.push({ x: fit.x + Math.cos(a) * rad, y: layout.topY + 0.012, z: fit.z + Math.sin(a) * rad, r: rd, kind: 'flat' });
      }
    }
  } else {
    const nx = Math.max(1, Math.ceil(tw / (rd * 1.7)));
    for (let i = 0; i <= nx; i++) {
      for (let j = 0; j <= ny; j++) {
        part.volumes.push({ x: fit.x - tw / 2 + rd + ((tw - 2 * rd) * i) / nx, y: layout.topY + 0.012, z: fit.z - th / 2 + rd + ((th - 2 * rd) * j) / ny, r: rd, kind: 'flat' });
      }
    }
  }
}

/* ───────── Do desenho ao sólido recortado (topo de acrílico e velas de número) ───────── */

/**
 * Curvas de nível `iso` de um campo w × h (marching squares). Devolve laços fechados, em pixels, já simplificados:
 * área > 0 = contorno de fora · área < 0 = furo. A matéria fica sempre do mesmo lado de quem percorre o laço.
 */
function traceLoops(f, w, h, iso, tol, minArea = 6) {
  // nxt[aresta de entrada] = aresta de saída. Fica sempre todo em −1 entre uma chamada e outra.
  const total = 2 * w * h;
  if (!IB[1] || IB[1].length < total) IB[1] = new Int32Array(total).fill(-1);
  const nxt = IB[1];
  const starts = [];
  for (let y = 0; y < h - 1; y++) {
    let c = y * w;
    let tl = f[c] > iso ? 8 : 0;
    let bl = f[c + w] > iso ? 1 : 0;
    for (let x = 0; x < w - 1; x++, c++) {
      const tr = f[c + 1] > iso ? 4 : 0;
      const br = f[c + w + 1] > iso ? 2 : 0;
      const k = tl | tr | br | bl;
      tl = tr << 1;
      bl = br >> 1;
      if (k === 0 || k === 15) continue;
      // arestas da célula: T (cima), L (esquerda), R (direita), D (baixo)
      const T = 2 * c;
      const L = T + 1;
      const R = 2 * (c + 1) + 1;
      const D = 2 * (c + w);
      let from = T;
      let to = L;
      switch (k) {
        case 1: from = L; to = D; break;
        case 2: from = D; to = R; break;
        case 3: from = L; to = R; break;
        case 4: from = R; to = T; break;
        case 6: from = D; to = T; break;
        case 7: from = L; to = T; break;
        case 8: from = T; to = L; break;
        case 9: from = T; to = D; break;
        case 11: from = T; to = R; break;
        case 12: from = R; to = L; break;
        case 13: from = R; to = D; break;
        case 14: from = D; to = L; break;
        default: {
          // sela (duas saídas): o meio da célula decide quem se liga a quem
          const mid = (f[c] + f[c + 1] + f[c + w] + f[c + w + 1]) * 0.25 > iso;
          if (k === 5) {
            nxt[L] = mid ? T : D;
            from = R;
            to = mid ? D : T;
            starts.push(L);
          } else {
            nxt[T] = mid ? R : L;
            from = D;
            to = mid ? L : R;
            starts.push(T);
          }
        }
      }
      nxt[from] = to;
      starts.push(from);
    }
  }
  const loops = [];
  const raw = [];
  for (let q = 0; q < starts.length; q++) {
    if (nxt[starts[q]] < 0) continue;
    raw.length = 0;
    let e = starts[q];
    while (e >= 0 && nxt[e] >= 0) {
      const c = e >> 1;
      const x = c % w;
      const y = (c - x) / w;
      const a = f[c];
      if (e & 1) raw.push(x, y + (iso - a) / (f[c + w] - a));
      else raw.push(x + (iso - a) / (f[c + 1] - a), y);
      const t = nxt[e];
      nxt[e] = -1;
      e = t;
    }
    const loop = simplifyLoop(raw, tol);
    if (loop && Math.abs(loop.area) >= minArea) loops.push(loop);
  }
  return loops;
}

/** Douglas–Peucker num laço fechado. */
function simplifyLoop(raw, tol) {
  const n = raw.length / 2;
  if (n < 6) return null;
  let far = 0;
  let best = -1;
  for (let i = 1; i < n; i++) {
    const d = (raw[i * 2] - raw[0]) ** 2 + (raw[i * 2 + 1] - raw[1]) ** 2;
    if (d > best) {
      best = d;
      far = i;
    }
  }
  const keep = new Uint8Array(n);
  keep[0] = keep[far] = 1;
  const stack = [0, far, far, n];
  const tol2 = tol * tol;
  while (stack.length) {
    const b = stack.pop();
    const a = stack.pop();
    const bi = b % n;
    const ax = raw[a * 2];
    const ay = raw[a * 2 + 1];
    const dx = raw[bi * 2] - ax;
    const dy = raw[bi * 2 + 1] - ay;
    const len2 = dx * dx + dy * dy || 1e-12;
    let worst = tol2;
    let wi = -1;
    for (let i = a + 1; i < b; i++) {
      const px = raw[i * 2] - ax;
      const py = raw[i * 2 + 1] - ay;
      const t = clamp((px * dx + py * dy) / len2, 0, 1);
      const ex = px - dx * t;
      const ey = py - dy * t;
      const d = ex * ex + ey * ey;
      if (d > worst) {
        worst = d;
        wi = i;
      }
    }
    if (wi >= 0) {
      keep[wi] = 1;
      stack.push(a, wi, wi, b);
    }
  }
  let count = 0;
  for (let i = 0; i < n; i++) count += keep[i];
  if (count < 3) return null;
  const p = new Float32Array(count * 2);
  let k = 0;
  for (let i = 0; i < n; i++) {
    if (!keep[i]) continue;
    p[k++] = raw[i * 2];
    p[k++] = raw[i * 2 + 1];
  }
  let area = 0;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    area += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1];
  }
  return { p, n: count, area: area / 2 };
}

function pointInLoop(loop, x, y) {
  const p = loop.p;
  let inside = false;
  for (let i = 0, j = loop.n - 1; i < loop.n; j = i++) {
    const yi = p[i * 2 + 1];
    const yj = p[j * 2 + 1];
    if (yi > y !== yj > y && x < ((p[j * 2] - p[i * 2]) * (y - yi)) / (yj - yi) + p[i * 2]) inside = !inside;
  }
  return inside;
}

/**
 * Sólido a partir dos laços: frente, verso e lateral, com a quina arredondada se round > 0.
 * Pixel (px, py) → mundo ((px − ox) · sc, (oy − py) · sc). depth = espessura · steps = segmentos da quina ·
 * uv > 0 cria coordenadas de textura (para o brilho das velas) · bulge = quanto a frente "espelha em curva".
 */
function extrudeLoops(loops, { sc, ox, oy, depth, round = 0, steps = 2, uv = 0, bulge = 0, bulgeY = 0, extra = null }) {
  const h = depth / 2;
  // perfil de frente para trás: { recuo, z, normal radial, normal em z, cut = não liga com o anel anterior }
  const prof = [];
  if (round > 0) {
    for (let q = 0; q <= steps; q++) {
      const a = (q / steps) * (Math.PI / 2);
      prof.push({ inset: round * (1 - Math.sin(a)), z: h - round * (1 - Math.cos(a)), nr: Math.sin(a), nz: Math.cos(a) });
    }
    for (let q = steps; q >= 0; q--) {
      const a = (q / steps) * (Math.PI / 2);
      prof.push({ inset: round * (1 - Math.sin(a)), z: -h + round * (1 - Math.cos(a)), nr: Math.sin(a), nz: -Math.cos(a) });
    }
  } else {
    prof.push({ inset: 0, z: h, nr: 0, nz: 1 }, { inset: 0, z: h, nr: 1, nz: 0, cut: true }, { inset: 0, z: -h, nr: 1, nz: 0 }, { inset: 0, z: -h, nr: 0, nz: -1, cut: true });
  }
  const R = prof.length;
  const pos = [];
  const nor = [];
  const idx = [];
  let flip = null;
  const outers = loops.filter((l) => l.area > 0);
  const holes = loops.filter((l) => l.area < 0);
  outers.forEach((o) => (o.holes = []));
  holes.forEach((hl) => {
    let host = null;
    outers.forEach((o) => {
      if (pointInLoop(o, hl.p[0], hl.p[1]) && (!host || o.area < host.area)) host = o;
    });
    host?.holes.push(hl);
  });
  let half = 0;
  let yLo = Infinity;
  let yHi = -Infinity;
  loops.forEach((l) => {
    for (let i = 0; i < l.n; i++) {
      half = Math.max(half, Math.abs((l.p[i * 2] - ox) * sc));
      const wy = (oy - l.p[i * 2 + 1]) * sc;
      if (wy < yLo) yLo = wy;
      if (wy > yHi) yHi = wy;
    }
  });
  const yMid = (yLo + yHi) / 2;
  const halfY = Math.max(1e-4, (yHi - yLo) / 2);

  const addLoop = (l) => {
    const n = l.n;
    const base = pos.length / 3;
    l.base = base;
    for (let j = 0; j < R; j++) {
      const pr = prof[j];
      for (let i = 0; i < n; i++) {
        const a = (i + n - 1) % n;
        const b = (i + 1) % n;
        const x = l.p[i * 2];
        const y = l.p[i * 2 + 1];
        // normal para fora = média das normais das duas arestas vizinhas (em pixels, y para baixo)
        let ax = x - l.p[a * 2];
        let ay = y - l.p[a * 2 + 1];
        let bx = l.p[b * 2] - x;
        let by = l.p[b * 2 + 1] - y;
        const la = Math.hypot(ax, ay) || 1;
        const lb = Math.hypot(bx, by) || 1;
        ax /= la;
        ay /= la;
        bx /= lb;
        by /= lb;
        let ox2 = ay + by;
        let oy2 = -(ax + bx);
        const ln = Math.hypot(ox2, oy2) || 1;
        ox2 /= ln;
        oy2 /= ln;
        const miter = Math.min(1.5, 1 / Math.max(0.3, ox2 * ay - oy2 * ax)); // mantém o recuo paralelo nas curvas
        const wx = (x - ox) * sc - ox2 * pr.inset * miter;
        const wy = (oy - y) * sc + oy2 * pr.inset * miter;
        pos.push(wx, wy, pr.z);
        if (pr.nr === 0 && bulge) {
          // a face "espelha em curva": para os lados (bulge) e de cima a baixo (bulgeY) — o alto das letras
          // reflete o teto claro e o pé reflete a mesa, com as caixas de luz passando pelo meio
          const nx = (wx * bulge) / (half || 1);
          const ny = bulgeY ? ((wy - yMid) * bulgeY) / halfY : 0;
          const len = Math.hypot(nx, ny, 1);
          nor.push(nx / len, ny / len, pr.nz / len);
        } else nor.push(ox2 * pr.nr, -oy2 * pr.nr, pr.nz);
      }
      if (j > 0 && !pr.cut) {
        if (flip === null) {
          // confere, uma vez, para que lado as faces da lateral estão viradas (triângulo a-b-c contra a normal)
          const a = (base + (j - 1) * n) * 3;
          const b = a + 3;
          const c = (base + j * n) * 3;
          const ux = pos[b] - pos[a];
          const uy = pos[b + 1] - pos[a + 1];
          const uz = pos[b + 2] - pos[a + 2];
          const vx = pos[c] - pos[a];
          const vy = pos[c + 1] - pos[a + 1];
          const vz = pos[c + 2] - pos[a + 2];
          flip = (uy * vz - uz * vy) * (nor[a] + nor[c]) + (uz * vx - ux * vz) * (nor[a + 1] + nor[c + 1]) + (ux * vy - uy * vx) * (nor[a + 2] + nor[c + 2]) < 0;
        }
        for (let i = 0; i < n; i++) {
          const i2 = (i + 1) % n;
          const a = base + (j - 1) * n + i;
          const b = base + (j - 1) * n + i2;
          const c = base + j * n + i;
          const e = base + j * n + i2;
          if (flip) idx.push(a, c, b, b, c, e);
          else idx.push(a, b, c, b, e, c);
        }
      }
    }
  };
  loops.forEach(addLoop);

  // tampas: triangulação (com furos) do anel da frente e do anel do verso
  const tri = (ring, front) => {
    outers.forEach((o) => {
      const map = [];
      const mk = (l) => {
        const out = [];
        for (let i = 0; i < l.n; i++) {
          const v = l.base + ring * l.n + i;
          out.push(new THREE.Vector2(pos[v * 3], pos[v * 3 + 1]));
          map.push(v);
        }
        return out;
      };
      const contour = mk(o);
      const hs = o.holes.map(mk);
      const faces = THREE.ShapeUtils.triangulateShape(contour, hs);
      for (const [a, b, c] of faces) {
        const A = map[a];
        const B = map[b];
        const C = map[c];
        const sgn = (pos[B * 3] - pos[A * 3]) * (pos[C * 3 + 1] - pos[A * 3 + 1]) - (pos[B * 3 + 1] - pos[A * 3 + 1]) * (pos[C * 3] - pos[A * 3]);
        if (sgn > 0 === front) idx.push(A, B, C);
        else idx.push(A, C, B);
      }
    });
  };
  tri(0, true);
  tri(R - 1, false);
  extra?.(pos, nor, idx);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (uv) {
    const t = new Float32Array((pos.length / 3) * 2);
    for (let i = 0, k = 0; i < pos.length; i += 3) {
      t[k++] = (pos[i] + pos[i + 2] * 0.7) * uv;
      t[k++] = (pos[i + 1] + pos[i + 2] * 0.4) * uv;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(t, 2));
  }
  geo.setIndex(idx);
  return geo;
}

/** Acrescenta uma caixa (haste do topo) às listas de uma malha. */
function pushBox(pos, nor, idx, x0, x1, y0, y1, z0, z1) {
  const faces = [
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]],
    [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]],
    [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]],
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]],
    [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]],
  ];
  faces.forEach(([a, b, c, d, n]) => {
    const base = pos.length / 3;
    pos.push(...a, ...b, ...c, ...d);
    nor.push(...n, ...n, ...n, ...n);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
}

/* ───────── Topo personalizado ─────────
   Nome (ou idade) em letra cursiva recortado num acrílico de 2 mm: as letras assentam num traço de base,
   pingos e acentos ganham uma pontezinha (como no corte a laser) e a peça sai inteira, com as duas hastes. */

/**
 * A que altura (acima do bolo) fica a linha de base do topo, conforme o que mais está espetado no bolo.
 * Regra do topo: o nome é o mais alto e fica atrás, no centro; a plaquinha fica à frente e abaixo dele; as
 * velas, mais à frente ainda, com as chamas abaixo das letras; as estrelas vão para as pontas.
 */
function topperLift(d) {
  const items = d.items || [];
  const plaque = d.messageMode !== 'bico' ? plaqueTop(d.message, plaqueLiftOf({ decor: d })) : 0;
  if (plaque) return plaque + 0.1; // por cima (e por trás) da plaquinha
  if (items.includes('velas')) {
    if (d.candleStyle === 'faisca') return 0.36; // a vela faísca fica de lado
    if (d.candleStyle === 'numero' && /\d/.test(String(d.number ?? ''))) return 0.86; // por cima dos algarismos e das chamas
    return 0.6; // as chamas das velas clássicas ficam abaixo do nome
  }
  if (items.includes('topo')) return 0.3; // as estrelas ficam nas pontas, mais baixas
  return 0.22;
}

/** Liga à peça principal os pedaços soltos (pingo do i, acentos, a haste do "!"): uma pontezinha para baixo. */
function bridgeFloaters(M, W, H, seedX, seedY, bw) {
  const n = W * H;
  const lab = ibuf(2, n);
  lab.fill(0, 0, n);
  const stack = ibuf(3, n);
  const box = { sum: 0, count: 0, bottom: 0 };
  // pinta um pedaço inteiro com o rótulo `id` e mede: centro (em x) e linha mais baixa
  const fill = (start, id) => {
    let top = 0;
    stack[top++] = start;
    lab[start] = id;
    box.sum = box.count = box.bottom = 0;
    while (top) {
      const i = stack[--top];
      const x = i % W;
      const y = (i - x) / W;
      box.sum += x;
      box.count++;
      if (y > box.bottom) box.bottom = y;
      if (x > 0 && !lab[i - 1] && M[i - 1] > 0.5) {
        lab[i - 1] = id;
        stack[top++] = i - 1;
      }
      if (x < W - 1 && !lab[i + 1] && M[i + 1] > 0.5) {
        lab[i + 1] = id;
        stack[top++] = i + 1;
      }
      if (y > 0 && !lab[i - W] && M[i - W] > 0.5) {
        lab[i - W] = id;
        stack[top++] = i - W;
      }
      if (y < H - 1 && !lab[i + W] && M[i + W] > 0.5) {
        lab[i + W] = id;
        stack[top++] = i + W;
      }
    }
  };
  const seed = seedY * W + seedX;
  if (!(M[seed] > 0.5)) return;
  fill(seed, 1);
  let id = 1;
  for (let i = 0; i < n; i++) {
    if (lab[i] || !(M[i] > 0.5)) continue;
    fill(i, ++id);
    if (box.count < 6) continue;
    const xc = Math.round(box.sum / box.count);
    // do ponto mais baixo do pedaço (na coluna do centro), desce até encostar na peça principal
    let y = box.bottom;
    while (y > 0 && lab[y * W + xc] !== id) y--;
    let hit = -1;
    for (let yy = y + 1; yy < H; yy++) {
      if (lab[yy * W + xc] === 1) {
        hit = yy;
        break;
      }
    }
    if (hit < 0) continue;
    for (let yy = Math.max(0, y - bw); yy <= Math.min(H - 1, hit + bw); yy++) {
      for (let x = Math.max(0, xc - bw); x <= Math.min(W - 1, xc + bw); x++) M[yy * W + x] = 1;
    }
  }
}

/**
 * "Estúdio" refletido pelo acrílico espelhado: teto claro, mesa, e caixas de luz em volta com vãos escuros.
 * É o contraste entre claro e escuro, deslizando pela peça quando a câmera gira, que faz o espelho parecer espelho.
 */
function studioEnv(lib) {
  // guardado junto com os materiais da cena: é liberado com eles
  const holder = lib.custom('acrilicoEstudio', () => {
    const c = makeCanvas(256, 128);
    const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 128);
    sky.addColorStop(0, '#ffffff');
    sky.addColorStop(0.2, '#f2f2f2');
    sky.addColorStop(0.38, '#9a9a9a');
    sky.addColorStop(0.5, '#2e2e2e');
    sky.addColorStop(0.58, '#555555');
    sky.addColorStop(0.72, '#b4b4b4');
    sky.addColorStop(0.86, '#e2e2e2');
    sky.addColorStop(1, '#f6f6f6');
    g.fillStyle = sky;
    g.fillRect(0, 0, 256, 128);
    const r = rng(5150);
    for (let i = 0; i < 9; i++) {
      const x = ((i + 0.3 + r() * 0.4) / 9) * 256;
      const w = 7 + r() * 9;
      const lg = g.createLinearGradient(x - w, 0, x + w, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0)');
      lg.addColorStop(0.3, 'rgba(255,255,255,0.95)');
      lg.addColorStop(0.7, 'rgba(255,255,255,0.95)');
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg;
      g.fillRect(x - w, 26 + r() * 10, w * 2, 58 + r() * 12);
      if (x - w < 0) g.fillRect(x - w + 256, 30, w * 2, 60); // emenda da volta
    }
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial();
    mat.userData.env = tex;
    mat.addEventListener('dispose', () => tex.dispose());
    return mat;
  });
  return holder.userData.env;
}

function acrylic(lib, hex) {
  const c = new THREE.Color(HEX.test(hex) ? hex : '#dcae52');
  c.getHSL(_hsl);
  const envMap = studioEnv(lib);
  if (_hsl.l < 0.2) {
    // preto (ou bem escuro): acrílico brilhante — reflete as luzes por cima do preto
    return lib.physical({ color: c, metalness: 0, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03, envMap, envMapIntensity: 1.25 });
  }
  // dourado, prata, rosé…: acrílico espelhado. A cor do metal é clareada (um espelho devolve quase toda a luz):
  // quem escurece e clareia a peça é o reflexo do estúdio, não a tinta
  const sat = _hsl.s;
  c.setHSL(_hsl.h, Math.min(1, sat * 1.05), Math.min(0.9, _hsl.l + (sat < 0.2 ? 0.14 : 0.06)));
  return lib.physical({ color: c, metalness: 1, roughness: 0.1, envMap, envMapIntensity: 1.55, emissive: c.clone().multiplyScalar(0.05) });
}

function buildTopper(ctx, part) {
  const { config, m, lib, layout } = ctx;
  const d = config.decor;
  const texts = topperLines(d.topper?.text);
  if (!texts.length) return;
  const mobile = lib.detail < 1;
  part.volumes = [];
  const plan = layout.party?.topper; // lugar, largura máxima e altura que o distribuidor reservou
  if (!plan) return;
  const font = (px) => `700 ${px}px ${CURSIVA}`;
  let g = scratch(8, 8);
  g.font = font(100);
  const lines = texts.map((s) => {
    const tm = g.measureText(s);
    const l = (tm.actualBoundingBoxLeft || 0) / 100;
    const r = (tm.actualBoundingBoxRight ?? tm.width) / 100;
    return { s, l, r, w: Math.max(0.4, l + r), a: (tm.actualBoundingBoxAscent ?? 75) / 100, d: (tm.actualBoundingBoxDescent ?? 25) / 100 };
  });
  const last = lines[lines.length - 1];
  const two = lines.length > 1;
  const over = 0.13; // quanto o traço de base passa das letras, de cada lado (em)
  const thin = 0.05; // espessura do traço fino sob a linha de cima (em)
  const totalW = Math.max(...lines.map((ln) => ln.w)) + 2 * over;
  // alturas em "em", com a linha de base de baixo em 0 (y cresce para baixo): o traço fino da linha de cima
  // morde o alto das letras de baixo — é por ali (e por uma pontezinha, se faltar) que as duas linhas se unem
  const yThin = -last.a + 0.04 - thin / 2;
  const yUp = yThin - 0.012;
  const top = two ? yUp - lines[0].a : -last.a;
  const desc = Math.max(0.12, last.d);
  const high = desc - top;
  const tight = Boolean(layout.message) || layout.has('topo'); // dividindo o topo com a plaquinha ou com as estrelas
  const free = Math.max(0.1, layout.rho - (layout.border + 0.035));
  // tamanho da letra no mundo: o de sempre, sem passar da largura e da altura reservadas
  const em = Math.min(topperSize(Math.max(...texts.map((s) => s.length)), free, tight) / totalW, two ? 0.92 / high : 0.6, plan.maxW / totalW, plan.maxEm);
  const width = em * totalW;

  // desenho: letras encorpadas (o acrílico não pode ter traço fino) + traço de base
  const fs = Math.min((mobile ? 360 : 640) / totalW, (mobile ? 180 : 320) / high, mobile ? 120 : 220);
  const lw = clamp(0.024 / em - 0.03, 0.022, 0.06) * fs;
  const mg = Math.ceil(lw / 2) + 6;
  const W = Math.ceil(totalW * fs) + 2 * mg;
  const H = Math.ceil(high * fs) + 2 * mg;
  g = scratch(W, H);
  g.font = font(fs);
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.lineWidth = lw;
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  const yb = mg - top * fs; // linha de base de baixo
  lines.forEach((ln, i) => {
    const y = two && i === 0 ? yb + yUp * fs : yb;
    const x = W / 2 - ((ln.r - ln.l) * fs) / 2;
    g.fillText(ln.s, x, y);
    g.strokeText(ln.s, x, y);
  });
  if (two) {
    // traço fino sob a linha de cima, com um tico de barriga
    const hw = (lines[0].w / 2 + 0.07) * fs;
    g.lineWidth = thin * fs;
    g.beginPath();
    g.moveTo(W / 2 - hw, yb + (yThin - 0.012) * fs);
    g.quadraticCurveTo(W / 2, yb + (yThin + 0.016) * fs, W / 2 + hw, yb + (yThin - 0.016) * fs);
    g.stroke();
  }
  // traço de base: um risco de pincel, mais cheio no meio, com as pontas levemente erguidas
  const xa = mg + fs * 0.01;
  const xb = W - mg - fs * 0.01;
  const xm = (xa + xb) / 2;
  g.beginPath();
  g.moveTo(xa, yb - fs * 0.03);
  g.quadraticCurveTo(xm, yb - fs * 0.005, xb, yb - fs * 0.05);
  g.quadraticCurveTo(xm, yb + fs * 0.12, xa, yb - fs * 0.03);
  g.closePath();
  g.fill();
  g.lineWidth = fs * 0.022;
  g.stroke();

  const n = W * H;
  const M = readInk(g, W, H, fbuf(0, n));
  bridgeFloaters(M, W, H, Math.round(xm), Math.round(yb + fs * 0.025), Math.max(1, Math.round(fs * 0.02)));
  const S = fbuf(1, n);
  blur(M, S, W, H, 1, fs > 70 ? 2 : 1);
  const loops = traceLoops(S, W, H, 0.5, mobile ? 0.45 : 0.32, fs * fs * 0.0006);
  if (!loops.some((lp) => lp.area > 0)) return;

  const lift = plan.lift;
  // hastes: onde o distribuidor reservou (sempre por dentro do traço de base)
  const stakeX = plan.stakeX ? Math.min(plan.stakeX, width / 2 - 0.03) : 0;
  const sc = em / fs; // unidades do mundo por pixel
  const depth = 0.022;
  const geo = extrudeLoops(loops, {
    sc,
    ox: W / 2,
    oy: yb + lift / sc,
    depth,
    bulge: 0.5,
    bulgeY: 0.62,
    extra: (pos, nor, idx) => {
      // hastes: saem do traço de base e entram no bolo (um pouco mais finas, para não brigar com a face)
      (stakeX > 0.02 ? [-stakeX, stakeX] : [0]).forEach((x0) => pushBox(pos, nor, idx, x0 - 0.013, x0 + 0.013, -0.09, lift, -depth * 0.4, depth * 0.4));
    },
  });
  const mat = acrylic(lib, d.topper?.color);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const z = plan.z; // atrás (e acima) da plaquinha, quando há uma
  mesh.position.set(plan.x, layout.topY, z);
  mesh.rotation.x = -plan.tilt;
  part.addObject(mesh, m, 0.14);
  part.owned.push(geo, mat);
  part.topper = { x: plan.x, y: layout.topY + lift - top * em * 0.5, z, w: width, h: high * em }; // onde o topo ficou (para a câmera, se quiser)
  // volumes: a placa de letras (caixa do texto) e as hastes
  addVol(part, VOL.board(plan.x, z, layout.topY + lift - desc * em, layout.topY + lift - top * em, width, 0.03, plan.tilt, layout.topY, 'air'));
  (stakeX > 0.02 ? [-stakeX, stakeX] : [0]).forEach((x0) => addVol(part, VOL.stick(plan.x + x0, layout.topY, z, plan.x + x0, layout.topY + lift - desc * em + 0.02, z - Math.sin(plan.tilt) * (lift - desc * em), 0.016, 'stick')));
}

/* ───────── Velas de número e vela faísca ───────── */

/** Uma vela em forma de algarismo: altura 1 (a escala dá o tamanho), pé em y = 0, quinas de cera arredondadas. */
function digitGeometry(ch, D) {
  const fs = D < 1 ? 110 : 170;
  let g = scratch(8, 8);
  const font = `900 ${fs}px ${DIGITOS}`;
  g.font = font;
  const zero = g.measureText('0');
  const tm = g.measureText(ch);
  const lw = fs * 0.03; // arredonda as quinas (e engorda um tico: vela é gordinha)
  const mg = Math.ceil(lw / 2) + 6;
  const l = tm.actualBoundingBoxLeft || 0;
  const r = tm.actualBoundingBoxRight ?? tm.width;
  const asc = Math.max(tm.actualBoundingBoxAscent ?? fs * 0.72, zero.actualBoundingBoxAscent ?? fs * 0.72);
  const desc = tm.actualBoundingBoxDescent ?? 0;
  const W = Math.ceil(l + r) + 2 * mg;
  const H = Math.ceil(asc + desc) + 2 * mg;
  g = scratch(W, H);
  g.font = font;
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineJoin = 'round';
  g.lineWidth = lw;
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  const yb = mg + asc;
  g.fillText(ch, mg + l, yb);
  g.strokeText(ch, mg + l, yb);
  const n = W * H;
  const M = readInk(g, W, H, fbuf(0, n));
  const S = fbuf(1, n);
  blur(M, S, W, H, D < 1 ? 1 : 2, 2);
  const loops = traceLoops(S, W, H, 0.5, D < 1 ? 0.75 : 0.45, 20);
  const href = (zero.actualBoundingBoxAscent ?? fs * 0.72) + lw; // todos os algarismos com a mesma altura
  const sc = 1 / href;
  const bottom = yb + lw / 2;
  // pavio: no ponto mais alto do algarismo
  let top = -1;
  let sum = 0;
  let cnt = 0;
  for (let i = 0; i < n && top < 0; i++) if (S[i] > 0.5) top = Math.floor(i / W);
  if (top < 0) top = 0;
  for (let y = top; y < Math.min(H, top + Math.ceil(href * 0.05)); y++) {
    for (let x = 0; x < W; x++) {
      if (S[y * W + x] > 0.5) {
        sum += x;
        cnt++;
      }
    }
  }
  const geo = loops.some((lp) => lp.area > 0)
    ? extrudeLoops(loops, { sc, ox: W / 2, oy: bottom, depth: 0.15, round: 0.045, steps: D < 1 ? 2 : 3, uv: 5 })
    : new THREE.BoxGeometry(0.4, 1, 0.15).translate(0, 0.5, 0);
  geo.userData = { w: (W - 2 * mg + lw) * sc, wick: [cnt ? (sum / cnt - W / 2) * sc : 0, (bottom - top) * sc - 0.012] };
  return geo;
}

function addFlame(ctx, part, x, y, z, phase, rad = 0.04) {
  const { m, lib } = ctx;
  const glow = new THREE.Sprite(lib.mat.glow());
  glow.position.set(x, y + 0.06, z);
  glow.scale.set(0.34, 0.34, 1);
  part.addObject(glow, m, rad);
  const flame = new THREE.Sprite(lib.mat.flame());
  flame.center.set(0.5, 0.08);
  flame.position.set(x, y + 0.022, z);
  flame.scale.set(0.06, 0.125, 1);
  part.addObject(flame, m, rad);
  part.flames.push({ flame, glow, phase, sx: 0.06, sy: 0.125 });
}

function buildNumberCandles(ctx, part) {
  const { m, lib, layout } = ctx;
  const plan = layout.party?.numbers; // { x, z, s, w, digits }: lugar e largura reservados pelo distribuidor
  if (!plan) return;
  const digits = plan.digits;
  const D = lib.detail;
  const geos = [...digits].map((ch) => lib.shape(`velaNumero${ch}`, () => digitGeometry(ch, D)));
  const cx = plan.x;
  const z = plan.z;
  // altura: a do plano; menores se a fileira de verdade (cada aparelho tem a sua fonte) passar da largura reservada
  const gap = 0.07;
  const span = (k) => geos.reduce((a, g) => a + g.userData.w * k, 0) + gap * k * (geos.length - 1);
  let s = plan.s;
  if (span(s) > plan.w) s = (s * plan.w) / span(s);
  const y0 = layout.topY - 0.022 * (s / 0.5);
  const r = rng(hashString(`numero${digits}`));
  const wick = new Batch(lib.geo.wick(), lib.mat.wick(), { cast: false });
  const byDigit = new Map();
  // com a fatia retirada, o número some inteiro (um "3" sozinho no lugar de "30" enganaria): quando a fileira
  // passa pelo meio do bolo, o raio ocupado por cada algarismo alcança o centro
  const central = Math.abs(z - m.center.z) < 0.3 && Math.abs(cx - m.center.x) < span(s) / 2 + 0.1;
  let x = cx - span(s) / 2;
  geos.forEach((geo, i) => {
    const ch = digits[i];
    const w = geo.userData.w * s;
    const px = x + w / 2;
    x += w + gap * s;
    if (!byDigit.has(ch)) byDigit.set(ch, new Batch(geo, lib.mat.glitter()));
    _q.setFromEuler(_e.set((r() - 0.5) * 0.04, (r() - 0.5) * 0.1, (r() - 0.5) * 0.04));
    const rad = central ? Math.hypot(px - m.center.x, z - m.center.z) / 0.8 + 0.1 : 0.12;
    byDigit.get(ch).add(px, y0, z, _q, s, null, rad);
    _v.set(geo.userData.wick[0] * s, geo.userData.wick[1] * s, 0).applyQuaternion(_q);
    wick.add(px + _v.x, y0 + _v.y, z + _v.z, _q, 1, null, rad);
    addFlame(ctx, part, px + _v.x, y0 + _v.y + 0.004, z + _v.z, r() * TAU, rad); // chama e pavio somem junto com a vela
    // volumes: o algarismo (uma placa gordinha) e a chama
    addVol(part, VOL.board(px, z, layout.topY, y0 + s, w, Math.min(0.1 * s, w / 2), 0, y0, 'solid'));
    addVol(part, [[px + _v.x, y0 + _v.y + 0.07, z + _v.z, 0.04, 'fx']]);
  });
  byDigit.forEach((b) => part.add(b, m));
  part.add(wick, m);
  groundBlob(ctx, part, cx, z + 0.02, Math.min(0.3, span(s) * 0.5));
  part.lightAt = new THREE.Vector3(cx, y0 + s + 0.14, z + 0.12);
}

/** Quadros do jato de faíscas (2 × 2 num só desenho), guardados por tamanho: desenhados uma vez por sessão. */
const SPARKS = new Map();
function sparkAtlas(fs) {
  if (SPARKS.has(fs)) return SPARKS.get(fs);
  const c = makeCanvas(fs * 2, fs * 2);
  const g = c.getContext('2d');
  g.lineCap = 'round';
  for (let f = 0; f < 4; f++) {
    const r = rng(9001 + f * 131);
    g.save();
    g.beginPath();
    g.rect((f % 2) * fs, (f >> 1) * fs, fs, fs);
    g.clip();
    g.translate((f % 2) * fs, (f >> 1) * fs);
    const bx = fs / 2;
    const by = fs * 0.9; // boca da vela
    // riscos que sobem em leque (mais juntos no meio) e caem um pouco nas pontas
    for (let i = 0; i < 64; i++) {
      const a = (r() + r() + r() - 1.5) * 0.66;
      const len = fs * (0.22 + r() * 0.62) * (1 - Math.abs(a) * 0.3);
      const x1 = bx + Math.sin(a) * len;
      const y1 = by - Math.cos(a) * len + fs * 0.1 * r() * Math.abs(a);
      const lg = g.createLinearGradient(bx, by, x1, y1);
      lg.addColorStop(0, 'rgba(255,252,232,0.95)');
      lg.addColorStop(0.4, 'rgba(255,222,120,0.92)');
      lg.addColorStop(0.8, 'rgba(255,168,48,0.7)');
      lg.addColorStop(1, 'rgba(255,140,30,0)');
      g.strokeStyle = lg;
      g.lineWidth = fs * (0.005 + r() * 0.011);
      g.beginPath();
      g.moveTo(bx + (r() - 0.5) * fs * 0.03, by);
      g.quadraticCurveTo(bx + Math.sin(a) * len * 0.5, by - Math.cos(a) * len * 0.62, x1, y1);
      g.stroke();
    }
    // estrelinhas (quatro pontas) e fagulhas soltas
    for (let i = 0; i < 26; i++) {
      const a = (r() + r() - 1) * 0.8;
      const dist = fs * (0.2 + r() * 0.62);
      const x = bx + Math.sin(a) * dist;
      const y = by - Math.cos(a) * dist * (1 - Math.abs(a) * 0.25);
      const size = fs * (0.01 + r() * 0.022);
      if (i % 3 === 0) {
        g.fillStyle = r() < 0.5 ? 'rgba(255,248,220,0.95)' : 'rgba(255,210,96,0.95)';
        g.beginPath();
        for (let k = 0; k < 8; k++) {
          const t = (k / 8) * TAU + 0.3;
          const rad = k % 2 ? size * 0.3 : size * 1.5;
          g.lineTo(x + Math.cos(t) * rad, y + Math.sin(t) * rad);
        }
        g.closePath();
        g.fill();
      } else {
        const rg = g.createRadialGradient(x, y, 0, x, y, size);
        rg.addColorStop(0, 'rgba(255,255,240,1)');
        rg.addColorStop(0.4, 'rgba(255,214,110,0.85)');
        rg.addColorStop(1, 'rgba(255,160,50,0)');
        g.fillStyle = rg;
        g.fillRect(x - size, y - size, size * 2, size * 2);
      }
    }
    // miolo incandescente na boca
    const core = g.createRadialGradient(bx, by - fs * 0.07, 0, bx, by - fs * 0.07, fs * 0.2);
    core.addColorStop(0, 'rgba(255,255,246,1)');
    core.addColorStop(0.3, 'rgba(255,238,170,0.9)');
    core.addColorStop(0.65, 'rgba(255,196,84,0.4)');
    core.addColorStop(1, 'rgba(255,170,60,0)');
    g.fillStyle = core;
    g.fillRect(0, 0, fs, fs);
    g.restore();
  }
  SPARKS.set(fs, c);
  return c;
}

function foilMaterial(lib) {
  return lib.custom('faiscaTubo', () => {
    const c = makeCanvas(64, 64);
    const g = c.getContext('2d');
    g.fillStyle = '#e9bd58';
    g.fillRect(0, 0, 64, 64);
    g.lineWidth = 9;
    for (let i = -2; i < 4; i++) {
      g.strokeStyle = i % 2 ? '#fbe6a2' : '#d39b34';
      g.beginPath();
      g.moveTo(-8, i * 32 + 40);
      g.lineTo(72, i * 32 - 40);
      g.stroke();
    }
    const map = new THREE.CanvasTexture(c);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(2, 3);
    map.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map, metalness: 0.82, roughness: 0.28, emissive: 0x7a5412, emissiveIntensity: 0.45 });
    mat.addEventListener('dispose', () => map.dispose());
    return mat;
  });
}

function sparklerGeometry(D) {
  // tubo metalizado com um friso em cima; a boca é um disco escuro (separado)
  const seg = D < 1 ? 10 : 18;
  const pts = [
    [0.0005, -0.07],
    [0.012, -0.05],
    [0.03, -0.02],
    [0.03, 0.455],
    [0.034, 0.46],
    [0.034, 0.495],
    [0.03, 0.5],
    [0.021, 0.5],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, seg);
}

function buildSparkler(ctx, part) {
  const { m, lib, layout } = ctx;
  const plan = layout.party?.sparkler; // { x, z }: lugar reservado pelo distribuidor (o jato de faíscas fica livre)
  if (!plan) return;
  const D = lib.detail;
  const { x, z } = plan;
  addVol(part, plan.vol);
  const y0 = layout.topY;
  const tube = new Batch(lib.shape('faiscaTubo', () => sparklerGeometry(D)), foilMaterial(lib));
  tube.add(x, y0, z, null, 1, null, 0.06);
  part.add(tube, m);
  const mouth = new Batch(lib.shape('faiscaBoca', () => new THREE.CircleGeometry(0.022, D < 1 ? 10 : 18).rotateX(-Math.PI / 2)), lib.mat.wick(), { cast: false });
  mouth.add(x, y0 + 0.497, z, null, 1, null, 0.06);
  part.add(mouth, m);
  groundBlob(ctx, part, x, z, 0.09);

  const top = y0 + 0.5;
  // clarão: o brilho das velas, três vezes maior (o motor cuida de pulsar)
  const halo = new THREE.Group();
  halo.position.set(x, top + 0.1, z);
  halo.scale.setScalar(2.6);
  const glow = new THREE.Sprite(lib.mat.glow());
  glow.scale.set(0.34, 0.34, 1);
  halo.add(glow);
  part.addObject(halo, m, 0.06);

  // jato: duas camadas que trocam de quadro (e de lado) várias vezes por segundo, cada uma no seu ritmo
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const atlas = sparkAtlas(D < 1 ? 128 : 256);
  [
    { w: 0.78, h: 0.84, rate: 17, seed: 11 },
    { w: 0.56, h: 0.62, rate: 23, seed: 47 },
  ].forEach((layer, i) => {
    const map = new THREE.CanvasTexture(atlas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.repeat.set(0.5, 0.5);
    map.offset.set(i * 0.5, 0.5);
    const mat = new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, toneMapped: false });
    const sprite = new THREE.Sprite(mat);
    sprite.center.set(0.5, 0.1);
    sprite.position.set(x, top - 0.004, z);
    sprite.scale.set(layer.w, layer.h, 1);
    let last = -1;
    sprite.onBeforeRender = () => {
      const f = still ? 0 : Math.floor(performance.now() * 0.001 * layer.rate);
      if (f === last) return;
      last = f;
      let k = Math.imul(f + layer.seed, 0x9e3779b1) >>> 0;
      k ^= k >>> 15;
      const flip = (k >> 2) & 1;
      map.repeat.x = flip ? -0.5 : 0.5;
      map.offset.set((k & 1) * 0.5 + (flip ? 0.5 : 0), k & 2 ? 0 : 0.5);
      mat.rotation = (((k >> 3) & 15) / 15 - 0.5) * 0.2;
    };
    part.addObject(sprite, m, 0.06);
    part.flames.push({ flame: sprite, glow, phase: i * 2.1, sx: layer.w, sy: layer.h });
    part.owned.push(map, mat);
  });
  part.lightAt = new THREE.Vector3(x, top + 0.2, z + 0.1);
}

function buildSpecialCandles(ctx, part) {
  part.volumes = [];
  if (ctx.config.decor.candleStyle === 'faisca') buildSparkler(ctx, part);
  else buildNumberCandles(ctx, part);
}

/** id → construtor(ctx, part). 'velasEspeciais' atende as velas de número e a vela faísca. */
export const PARTY_DECOR = {
  escrita: buildScript,
  toponome: buildTopper,
  velasEspeciais: buildSpecialCandles,
};

/** Altura extra (acima do topo do bolo) ocupada por essas peças — para enquadrar a câmera. */
export function partyHeight(config) {
  const d = config?.decor;
  if (!d) return 0;
  // o que o distribuidor colocou de verdade (o nome sobe quando há peças por baixo dele)
  const planned = plannedHeights(config);
  if (planned) return planned.party;
  let h = 0;
  const items = d.items || [];
  if (items.includes('velas')) {
    if (d.candleStyle === 'faisca') h = 1.24;
    else if (d.candleStyle === 'numero' && /\d/.test(String(d.number ?? ''))) h = 0.66;
  }
  const name = topperLines(d.topper?.text);
  if (name.length) {
    // letra do topo: a largura depende do texto; a altura acompanha (uma linha ~0,85 em · duas ~1,8 em)
    const chars = Math.max(...name.map((s) => s.length));
    const radii = tierRadii(getSize(config.size)?.radius || 1, config.tiers || 1);
    const free = Math.max(0.2, radii[radii.length - 1] - 0.12); // raio livre aproximado do último andar
    const tight = Boolean(d.messageMode !== 'bico' && String(d.message || '').trim()) || items.includes('topo');
    const two = name.length > 1;
    const em = Math.min(topperSize(chars, free, tight) / (0.3 + 0.52 * chars), two ? 0.92 / 1.9 : 0.6);
    h = Math.max(h, topperLift(d) + em * (two ? 1.85 : 0.9) + 0.05);
  }
  return h;
}
