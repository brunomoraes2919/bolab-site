// BOLAB — geometria procedural do bolo: contornos (redondo, quadrado, retangular, coração),
// superfícies varridas ao longo do contorno, calda escorrendo, fatia cortada e boleira.
// Unidades: 1 = 10 cm. O bolo apoia em y = 0 e cresce para cima.
import * as THREE from 'three';
import { rng } from './textures.js';
import { getSize } from '../data/customizer.js';

const TAU = Math.PI * 2;
const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* ───────── Contornos ─────────
   Um contorno é um polígono fechado no plano XZ com a normal (para fora) de cada ponto.
   Como as normais são exatas, deslocar o contorno (cobertura, calda, bicos) é só somar d·normal. */

function makePath(x, z, nx, nz) {
  const n = x.length;
  const s = new Float32Array(n + 1);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    s[i + 1] = s[i] + Math.hypot(x[j] - x[i], z[j] - z[i]);
  }
  return { x, z, nx, nz, s, n, length: s[n] };
}

class PathBuilder {
  constructor() {
    this.x = [];
    this.z = [];
    this.nx = [];
    this.nz = [];
  }
  push(x, z, nx, nz) {
    const k = this.x.length;
    if (k && Math.hypot(x - this.x[k - 1], z - this.z[k - 1]) < 1e-5) return;
    this.x.push(x);
    this.z.push(z);
    this.nx.push(nx);
    this.nz.push(nz);
  }
  /** Arco de a0 a a1 (rad). sign = 1 convexo (normal sai do centro), -1 côncavo. */
  arc(cx, cz, r, a0, a1, sign = 1, step = 0.07) {
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step));
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const c = Math.cos(a);
      const s = Math.sin(a);
      this.push(cx + r * c, cz + r * s, sign * c, sign * s);
    }
  }
  lineTo(x, z, nx, nz, maxSeg = 0.14) {
    const k = this.x.length - 1;
    const x0 = this.x[k];
    const z0 = this.z[k];
    const n = Math.max(1, Math.ceil(Math.hypot(x - x0, z - z0) / maxSeg));
    for (let i = 1; i <= n; i++) this.push(x0 + ((x - x0) * i) / n, z0 + ((z - z0) * i) / n, nx, nz);
  }
  finish() {
    const k = this.x.length - 1;
    if (k > 0 && Math.hypot(this.x[k] - this.x[0], this.z[k] - this.z[0]) < 1e-5) {
      this.x.pop();
      this.z.pop();
      this.nx.pop();
      this.nz.pop();
    }
    return makePath(Float32Array.from(this.x), Float32Array.from(this.z), Float32Array.from(this.nx), Float32Array.from(this.nz));
  }
}

function circlePath(r, segments = 112) {
  const b = new PathBuilder();
  b.arc(0, 0, r, 0, TAU, 1, TAU / segments);
  return b.finish();
}

function roundedRectPath(hx, hz, rc) {
  const b = new PathBuilder();
  const H = Math.PI / 2;
  b.arc(hx - rc, hz - rc, rc, 0, H);
  b.lineTo(-hx + rc, hz, 0, 1);
  b.arc(-hx + rc, hz - rc, rc, H, 2 * H);
  b.lineTo(-hx, -hz + rc, -1, 0);
  b.arc(-hx + rc, -hz + rc, rc, 2 * H, 3 * H);
  b.lineTo(hx - rc, -hz, 0, -1);
  b.arc(hx - rc, -hz + rc, rc, 3 * H, 4 * H);
  b.lineTo(hx, hz - rc, 1, 0);
  return b.finish();
}

/** Coração feito de arcos e retas tangentes: dois lóbulos, bico arredondado na frente e reentrância suave atrás. */
function heartPath(k) {
  const r = 0.56 * k;
  const a = 0.5 * k;
  const bz = -0.3 * k; // centro dos lóbulos (z)
  const tz = 0.74 * k; // centro do arredondamento do bico
  const rt = 0.17 * k;
  const rn = 0.15 * k;
  const zN = bz - Math.sqrt((r + rn) ** 2 - a * a); // centro do arredondamento da reentrância
  const alphaN = Math.atan2(bz - zN, a);
  const beta0 = Math.atan2(zN - bz, -a) + TAU; // onde o lóbulo direito encosta na reentrância
  const vx = -a;
  const vz = tz - bz;
  const D = Math.hypot(vx, vz);
  const beta1 = Math.atan2(vz, vx) - Math.acos((r - rt) / D); // direção da normal da lateral direita
  const nx = Math.cos(beta1);
  const nz = Math.sin(beta1);
  const b = new PathBuilder();
  b.arc(0, zN, rn, Math.PI / 2, alphaN, -1, 0.12);
  b.arc(a, bz, r, beta0, TAU + beta1, 1, 0.06);
  b.lineTo(rt * nx, tz + rt * nz, nx, nz);
  b.arc(0, tz, rt, beta1, Math.PI - beta1, 1, 0.1);
  b.lineTo(-a - r * nx, bz + r * nz, -nx, nz);
  b.arc(-a, bz, r, Math.PI - beta1, Math.PI - beta0 + TAU, 1, 0.06);
  b.arc(0, zN, rn, Math.PI - alphaN, Math.PI / 2, -1, 0.12);
  return b.finish();
}

/** Contorno da massa para um formato e raio nominal R (já descontada a espessura da cobertura). */
export function shapePath(shape, R) {
  if (shape === 'square') return roundedRectPath(R * 0.9 - 0.045, R * 0.9 - 0.045, 0.17);
  if (shape === 'rect') return roundedRectPath(R * 1.14 - 0.045, R * 0.76 - 0.045, 0.17);
  if (shape === 'heart') return heartPath(R * 1.04);
  return circlePath(R - 0.045);
}

/** Contorno deslocado d para fora (ou para dentro, se negativo). */
export function offsetPath(path, d) {
  if (!d) return path;
  const x = new Float32Array(path.n);
  const z = new Float32Array(path.n);
  for (let i = 0; i < path.n; i++) {
    x[i] = path.x[i] + path.nx[i] * d;
    z[i] = path.z[i] + path.nz[i] * d;
  }
  return makePath(x, z, path.nx, path.nz);
}

/** Ponto do contorno na distância s (ao longo do perímetro), com normal interpolada. */
export function pathAt(path, sWorld, out = {}) {
  let s = sWorld % path.length;
  if (s < 0) s += path.length;
  let lo = 0;
  let hi = path.n;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path.s[mid] <= s) lo = mid;
    else hi = mid;
  }
  const j = (lo + 1) % path.n;
  const seg = path.s[lo + 1] - path.s[lo] || 1;
  const t = (s - path.s[lo]) / seg;
  out.x = path.x[lo] + (path.x[j] - path.x[lo]) * t;
  out.z = path.z[lo] + (path.z[j] - path.z[lo]) * t;
  let nx = path.nx[lo] + (path.nx[j] - path.nx[lo]) * t;
  let nz = path.nz[lo] + (path.nz[j] - path.nz[lo]) * t;
  const len = Math.hypot(nx, nz) || 1;
  nx /= len;
  nz /= len;
  out.nx = nx;
  out.nz = nz;
  // tangente no sentido em que o contorno é percorrido
  let tx = path.x[j] - path.x[lo];
  let tz = path.z[j] - path.z[lo];
  const tl = Math.hypot(tx, tz) || 1;
  out.tx = tx / tl;
  out.tz = tz / tl;
  return out;
}

/** Reamostra o contorno em `count` pontos igualmente espaçados. */
export function resamplePath(path, count) {
  const x = new Float32Array(count);
  const z = new Float32Array(count);
  const nx = new Float32Array(count);
  const nz = new Float32Array(count);
  const p = {};
  for (let i = 0; i < count; i++) {
    pathAt(path, (i / count) * path.length, p);
    x[i] = p.x;
    z[i] = p.z;
    nx[i] = p.nx;
    nz[i] = p.nz;
  }
  return makePath(x, z, nx, nz);
}

export function pointInPath(path, px, pz) {
  let inside = false;
  for (let i = 0, j = path.n - 1; i < path.n; j = i++) {
    const zi = path.z[i];
    const zj = path.z[j];
    if (zi > pz !== zj > pz && px < ((path.x[j] - path.x[i]) * (pz - zi)) / (zj - zi) + path.x[i]) inside = !inside;
  }
  return inside;
}

/** Distância do ponto (cx, cz) até o contorno na direção theta. */
export function rayHit(path, cx, cz, theta) {
  const dx = Math.cos(theta);
  const dz = Math.sin(theta);
  let best = 0;
  for (let i = 0; i < path.n; i++) {
    const j = (i + 1) % path.n;
    const ex = path.x[j] - path.x[i];
    const ez = path.z[j] - path.z[i];
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const ax = path.x[i] - cx;
    const az = path.z[i] - cz;
    const t = (ax * ez - az * ex) / den;
    const u = (ax * dz - az * dx) / den;
    if (t > best && u >= -1e-6 && u <= 1 + 1e-6) best = t;
  }
  return best;
}

export function pathBounds(path) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let maxR = 0;
  for (let i = 0; i < path.n; i++) {
    minX = Math.min(minX, path.x[i]);
    maxX = Math.max(maxX, path.x[i]);
    minZ = Math.min(minZ, path.z[i]);
    maxZ = Math.max(maxZ, path.z[i]);
    maxR = Math.max(maxR, Math.hypot(path.x[i], path.z[i]));
  }
  return { minX, maxX, minZ, maxZ, maxR, hx: (maxX - minX) / 2, hz: (maxZ - minZ) / 2 };
}

/* ───────── Medidas do bolo ───────── */

const FROST = {
  buttercream: { t: 0.045, rf: 0.032 },
  chantilly: { t: 0.055, rf: 0.06 },
  ganache: { t: 0.036, rf: 0.045 },
  glace: { t: 0.032, rf: 0.085 },
  chocolate: { t: 0.048, rf: 0.05 },
  mousse: { t: 0.052, rf: 0.07 },
  naked: { t: 0, rf: 0.024 },
};

/**
 * Todas as medidas de que os construtores precisam.
 * layerY[i] = base da camada i · fillY[i] = base do recheio acima da camada i.
 */
export function cakeMetrics(config) {
  const R = getSize(config.size)?.radius || 1;
  const type = config.covering.type;
  const naked = type === 'naked';
  const n = config.layers.length;
  const layerH = n === 1 ? 0.5 : n === 2 ? 0.38 : n === 3 ? 0.31 : 0.275;
  const fillH = 0.066;
  const { t, rf } = FROST[type] || FROST.buttercream;
  const layerY = [];
  const fillY = [];
  let y = 0;
  for (let i = 0; i < n; i++) {
    layerY.push(y);
    y += layerH;
    if (i < n - 1) {
      fillY.push(y);
      y += fillH;
    }
  }
  const H = y;
  const tTop = naked ? 0.058 : t + 0.006;
  const sponge = shapePath(config.shape, R);
  const frost = offsetPath(sponge, naked ? 0.014 : t); // superfície externa (cobertura ou borda do creme)
  const isHeart = config.shape === 'heart';
  const center = { x: 0, z: isHeart ? -0.1 * R : 0 };
  const bounds = pathBounds(frost);
  const topFlat = offsetPath(sponge, (naked ? 0.014 : t) - rf); // limite da área plana do topo
  // menor distância do centro até a borda plana do topo: dá a escala das decorações
  let rMin = Infinity;
  for (let i = 0; i < topFlat.n; i++) rMin = Math.min(rMin, Math.hypot(topFlat.x[i] - center.x, topFlat.z[i] - center.z));
  return { R, type, naked, n, layerH, fillH, t, rf, tTop, layerY, fillY, H, Ht: H + tTop, sponge, frost, topFlat, center, bounds, rMin, shape: config.shape };
}

/* ───────── Superfície varrida ─────────
   profile: [{ d, y, nd, ny }] de baixo para cima (d = deslocamento para fora do contorno).
   Fecha com tampa plana no último ponto quando capTop = true. */
export function sweep(path, profile, { capTop = false, capBottom = false, uRepeat = 1, vScale = 1, capScale = 0.5, center = { x: 0, z: 0 }, flip = false } = {}) {
  const n = path.n;
  const m = profile.length;
  const cols = n + 1;
  const capVerts = (capTop ? cols + 1 : 0) + (capBottom ? cols + 1 : 0);
  const count = cols * m + capVerts;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const vAt = [0];
  for (let j = 1; j < m; j++) vAt.push(vAt[j - 1] + Math.hypot(profile[j].d - profile[j - 1].d, profile[j].y - profile[j - 1].y));
  let k = 0;
  for (let i = 0; i < cols; i++) {
    const ii = i % n;
    const u = (path.s[i] / path.length) * uRepeat;
    for (let j = 0; j < m; j++) {
      const p = profile[j];
      pos[k * 3] = path.x[ii] + path.nx[ii] * p.d;
      pos[k * 3 + 1] = p.y;
      pos[k * 3 + 2] = path.z[ii] + path.nz[ii] * p.d;
      const l = Math.hypot(p.nd, p.ny) || 1;
      nor[k * 3] = (path.nx[ii] * p.nd) / l;
      nor[k * 3 + 1] = p.ny / l;
      nor[k * 3 + 2] = (path.nz[ii] * p.nd) / l;
      uv[k * 2] = u;
      uv[k * 2 + 1] = vAt[j] * vScale;
      k++;
    }
  }
  const index = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m - 1; j++) {
      const a = i * m + j;
      const b = (i + 1) * m + j;
      const c = a + 1;
      const d = b + 1;
      if (flip) index.push(a, b, c, b, d, c);
      else index.push(a, c, b, b, c, d);
    }
  }
  const sideCount = index.length;
  const cap = (row, up) => {
    const p = profile[row];
    const start = k;
    for (let i = 0; i < cols; i++) {
      const ii = i % n;
      const x = path.x[ii] + path.nx[ii] * p.d;
      const z = path.z[ii] + path.nz[ii] * p.d;
      pos.set([x, p.y, z], k * 3);
      nor.set([0, up ? 1 : -1, 0], k * 3);
      uv.set([(x - center.x) * capScale + 0.5, (z - center.z) * capScale + 0.5], k * 2);
      k++;
    }
    pos.set([center.x, p.y, center.z], k * 3);
    nor.set([0, up ? 1 : -1, 0], k * 3);
    uv.set([0.5, 0.5], k * 2);
    const c = k++;
    for (let i = 0; i < n; i++) {
      if (up) index.push(c, start + i + 1, start + i);
      else index.push(c, start + i, start + i + 1);
    }
  };
  if (capTop) cap(m - 1, true);
  const topCount = index.length - sideCount;
  if (capBottom) cap(0, false);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(index);
  // grupo 0 = lateral (e tampa de baixo), grupo 1 = tampa de cima: permite materiais diferentes
  geo.addGroup(0, sideCount, 0);
  if (topCount) geo.addGroup(sideCount, topCount, 1);
  if (index.length > sideCount + topCount) geo.addGroup(sideCount + topCount, index.length - sideCount - topCount, 0);
  return geo;
}

function filletUp(profile, d, yTop, r, steps = 7) {
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    profile.push({ d: d - r + r * Math.cos(a), y: yTop - r + r * Math.sin(a), nd: Math.cos(a), ny: Math.sin(a) });
  }
}

/** Casca de cobertura: lateral reta, quina arredondada e topo plano. */
export function buildFrosting(m) {
  const profile = [{ d: m.t, y: 0, nd: 1, ny: 0 }];
  filletUp(profile, m.t, m.Ht, m.rf, 8);
  const uRepeat = Math.max(2, Math.round(m.frost.length / 1.6));
  return sweep(m.sponge, profile, { capTop: true, uRepeat, vScale: 1 / 1.6, capScale: 1 / (2.9 * m.R), center: m.center });
}

/** Uma camada de massa (bolo naked): bordas levemente arredondadas. */
export function buildSponge(m, i) {
  const y0 = m.layerY[i];
  const y1 = y0 + m.layerH;
  const b = 0.016;
  const profile = [
    { d: -b, y: y0, nd: 0.5, ny: -0.86 },
    { d: -0.003, y: y0 + b * 0.6, nd: 0.9, ny: -0.4 },
    { d: 0, y: y0 + b * 1.4, nd: 1, ny: 0 },
    { d: 0, y: y1 - b * 1.4, nd: 1, ny: 0 },
    { d: -0.003, y: y1 - b * 0.6, nd: 0.9, ny: 0.4 },
    { d: -b, y: y1, nd: 0.5, ny: 0.86 },
  ];
  const uRepeat = Math.max(2, Math.round(m.sponge.length / 1.2));
  return sweep(m.sponge, profile, { capTop: true, uRepeat, vScale: 1 / m.layerH, capScale: 1 / 0.6, center: m.center });
}

/** Faixa de recheio aparente entre duas camadas (bolo naked): levemente estufada. */
export function buildFillingBand(m, i) {
  const y0 = m.fillY[i] - 0.004;
  const y1 = m.fillY[i] + m.fillH + 0.004;
  const mid = (y0 + y1) / 2;
  const half = (y1 - y0) / 2;
  const bulge = 0.02;
  const profile = [];
  for (let k = 0; k <= 8; k++) {
    const a = -Math.PI / 2 + (k / 8) * Math.PI;
    profile.push({ d: -0.016 + bulge * Math.cos(a), y: mid + half * Math.sin(a), nd: Math.cos(a) * half, ny: Math.sin(a) * bulge });
  }
  return sweep(m.sponge, profile, { uRepeat: 1 });
}

/** Creme do topo do bolo naked: disco macio com borda arredondada. */
export function buildTopCream(m) {
  const rr = m.rf;
  const out = 0.014;
  const y0 = m.H - 0.004;
  const y1 = m.Ht;
  const profile = [];
  for (let k = 0; k <= 5; k++) {
    const a = -Math.PI / 2 + (k / 5) * (Math.PI / 2);
    profile.push({ d: out - rr + rr * Math.cos(a), y: y0 + rr + rr * Math.sin(a), nd: Math.cos(a), ny: Math.sin(a) });
  }
  filletUp(profile, out, y1, rr, 6);
  return sweep(m.sponge, profile, { capTop: true, uRepeat: Math.max(2, Math.round(m.sponge.length / 1.6)), vScale: 1 / 1.6, capScale: 1 / (2.9 * m.R), center: m.center });
}

/** Véu fino de creme raspado sobre a lateral do bolo naked. */
export function buildScrapeCoat(m) {
  const profile = [
    { d: 0.004, y: 0.004, nd: 1, ny: 0 },
    { d: 0.004, y: m.H, nd: 1, ny: 0 },
  ];
  return sweep(m.sponge, profile, { uRepeat: Math.max(2, Math.round(m.sponge.length / 1.4)), vScale: 1 / 1.1 });
}

/* ───────── Calda escorrendo ─────────
   Um lençol de espessura variável sobre o topo e a lateral: onde há calda ele fica para fora;
   onde não há, mergulha para dentro da cobertura e some. As gotas se fundem à borda como líquido. */
export function buildDrip(m, seed = 1) {
  const d0 = m.naked ? 0.014 : m.t;
  const rf = m.rf;
  const yTop = m.Ht;
  const sideH = yTop - rf;
  const r = rng(seed);
  const outer = offsetPath(m.sponge, d0);
  const ds = 0.0115;
  const cols = Math.max(96, Math.round(outer.length / ds));
  const col = resamplePath(outer, cols);
  const L = col.length;

  // sorteio das gotas: a maioria curta, algumas longas — como calda de verdade
  const maxLen = Math.min(sideH * 0.74, 0.66);
  const drips = [];
  let s = r() * 0.1;
  while (s < L - 0.07) {
    const long = r() < 0.36;
    const len = maxLen * (long ? 0.55 + r() * 0.45 : 0.16 + r() * 0.3);
    drips.push({ s, w: 0.026 + r() * 0.013 + (long ? 0.005 : 0), len: Math.max(0.08, len) });
    s += 0.115 + r() * 0.16;
  }
  const lipPhase = [r() * TAU, r() * TAU, r() * TAU];
  const lipAt = (x) => 0.03 + 0.012 * Math.sin((x / L) * TAU * 7 + lipPhase[0]) + 0.008 * Math.sin((x / L) * TAU * 17 + lipPhase[1]) + 0.005 * Math.sin((x / L) * TAU * 31 + lipPhase[2]);

  const t0 = 0.017;
  const dv = 0.012;
  const F = 5;
  const rowsSide = Math.ceil((maxLen + 0.05) / dv);
  const rows = 1 + F + rowsSide;
  const vertCount = (cols + 1) * rows + 1;
  const pos = new Float32Array(vertCount * 3);
  const K = 0.03;
  const smin = (a, b) => {
    const h = Math.max(K - Math.abs(a - b), 0) / K;
    return Math.min(a, b) - h * h * K * 0.25;
  };
  const thickness = (sx, v, near) => {
    let sd = v - lipAt(sx);
    let bulb = 0;
    for (const dr of near) {
      let dsx = Math.abs(sx - dr.s);
      if (dsx > L / 2) dsx = L - dsx;
      const end = dr.len - dr.w;
      const w = dr.w * (0.8 + 0.2 * smoothstep(end - dr.w * 3, end, v));
      const vv = Math.max(-0.05, Math.min(end, v));
      sd = smin(sd, Math.hypot(dsx, v - vv) - w);
      const g = Math.exp(-((v - end) ** 2 + dsx * dsx) / (2 * (dr.w * 0.9) ** 2));
      if (g > bulb) bulb = g;
    }
    if (sd >= 0) return Math.max(-0.03, -1.3 * sd);
    return (0.019 + 0.013 * bulb) * Math.sin((Math.PI / 2) * Math.min(1, -sd / 0.028));
  };

  let k = 0;
  for (let i = 0; i <= cols; i++) {
    const ii = i % cols;
    const sx = col.s[ii];
    const near = drips.filter((dr) => {
      let dsx = Math.abs(sx - dr.s);
      if (dsx > L / 2) dsx = L - dsx;
      return dsx < dr.w + 0.09;
    });
    const px = col.x[ii];
    const pz = col.z[ii];
    const nx = col.nx[ii];
    const nz = col.nz[ii];
    const tSide0 = thickness(sx, 0, near);
    // linha 0: borda da "poça" no topo
    pos.set([px - nx * rf, yTop + t0, pz - nz * rf], k * 3);
    k++;
    for (let f = 1; f <= F; f++) {
      const a = (f / F) * (Math.PI / 2);
      const th = t0 + (tSide0 - t0) * smoothstep(0, 1, f / F);
      const off = -rf + (rf + th) * Math.sin(a);
      pos.set([px + nx * off, yTop - rf + (rf + th) * Math.cos(a), pz + nz * off], k * 3);
      k++;
    }
    for (let j = 1; j <= rowsSide; j++) {
      const v = j * dv;
      const th = thickness(sx, v, near);
      pos.set([px + nx * th, Math.max(0.004, sideH - v), pz + nz * th], k * 3);
      k++;
    }
  }
  const centerIndex = k;
  pos.set([m.center.x, yTop + t0, m.center.z], k * 3);
  const index = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows - 1; j++) {
      const a = i * rows + j;
      const b = (i + 1) * rows + j;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
    index.push(centerIndex, (i + 1) * rows, i * rows);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  // costura: a primeira e a última coluna ocupam o mesmo lugar e precisam da mesma normal
  const nor = geo.attributes.normal;
  for (let j = 0; j < rows; j++) {
    const a = j;
    const b = cols * rows + j;
    const x = nor.getX(a) + nor.getX(b);
    const y = nor.getY(a) + nor.getY(b);
    const z = nor.getZ(a) + nor.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    nor.setXYZ(a, x / l, y / l, z / l);
    nor.setXYZ(b, x / l, y / l, z / l);
  }
  return geo;
}

/* ───────── "Ver por dentro": faces do corte ─────────
   Cada face é o desenho do bolo cortado num plano que passa pelo eixo: camadas de massa,
   recheios com borda irregular, a casca de cobertura e a calda por cima. */

function polyGeometry(points, basis, { color = null, uvScale = 1, lift = 0 } = {}) {
  // points: [[r, y, shade?], …] no plano do corte
  const contour = points.map((p) => new THREE.Vector2(p[0], p[1]));
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const n = points.length;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const [rr, y, shade = 1] = points[i];
    pos.set([basis.ox + basis.ux * rr + basis.nx * lift, y, basis.oz + basis.uz * rr + basis.nz * lift], i * 3);
    nor.set([basis.nx, 0, basis.nz], i * 3);
    uv.set([rr * uvScale + basis.uvShift, y * uvScale], i * 2);
    const c = color || [1, 1, 1];
    col.set([c[0] * shade, c[1] * shade, c[2] * shade], i * 3);
  }
  const index = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (const t of tris) {
    a.fromArray(pos, t[0] * 3);
    b.fromArray(pos, t[1] * 3);
    c.fromArray(pos, t[2] * 3);
    b.sub(a);
    c.sub(a);
    b.cross(c);
    if (b.x * basis.nx + b.z * basis.nz >= 0) index.push(t[0], t[1], t[2]);
    else index.push(t[0], t[2], t[1]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(index);
  return geo;
}

function gridGeometry(rs, ys, shadeAt, basis, uvScale, lift = 0) {
  // grade retangular no plano do corte, com sombreamento por vértice (casquinha mais escura)
  const nr = rs.length;
  const ny = ys.length;
  const n = nr * ny;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const col = new Float32Array(n * 3);
  let k = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nr; i++) {
      const rr = rs[i];
      const y = ys[j];
      pos.set([basis.ox + basis.ux * rr + basis.nx * lift, y, basis.oz + basis.uz * rr + basis.nz * lift], k * 3);
      nor.set([basis.nx, 0, basis.nz], k * 3);
      uv.set([rr * uvScale + basis.uvShift, y * uvScale], k * 2);
      const sh = shadeAt(i, j);
      col.set([sh, sh, sh], k * 3);
      k++;
    }
  }
  const index = [];
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nr - 1; i++) {
      const a = j * nr + i;
      const b = a + 1;
      const c = a + nr;
      const d = c + 1;
      // a ordem depende do lado para onde a face olha
      if (basis.winding > 0) index.push(a, b, c, b, d, c);
      else index.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(index);
  return geo;
}

function merge(list) {
  const geos = list.filter(Boolean);
  if (!geos.length) return null;
  if (geos.length === 1) return geos[0];
  let vCount = 0;
  let iCount = 0;
  geos.forEach((g) => {
    vCount += g.attributes.position.count;
    iCount += g.index.count;
  });
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const col = new Float32Array(vCount * 3);
  const index = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  geos.forEach((g) => {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    if (g.attributes.color) col.set(g.attributes.color.array, vo * 3);
    else col.fill(1, vo * 3, (vo + g.attributes.position.count) * 3);
    const src = g.index.array;
    for (let i = 0; i < src.length; i++) index[io + i] = src[i] + vo;
    vo += g.attributes.position.count;
    io += src.length;
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  return out;
}

/**
 * Geometrias das duas faces do corte, entre os ângulos thetaA e thetaB (fatia retirada).
 * → { sponge: [geo por camada], filling: [geo por recheio], frost, drip }
 */
export function buildCutFaces(m, { thetaA, thetaB, drip = false, seed = 1 }) {
  const sponge = m.layerY.map(() => []);
  const filling = m.fillY.map(() => []);
  const frost = [];
  const dripGeo = [];
  const UV = 1 / 0.62;
  const outer = m.frost;

  [
    { theta: thetaA, side: 1 },
    { theta: thetaB, side: -1 },
  ].forEach(({ theta, side }, faceIndex) => {
    const ux = Math.cos(theta);
    const uz = Math.sin(theta);
    // a normal da face aponta para dentro da fatia retirada
    const basis = { ox: m.center.x, oz: m.center.z, ux, uz, nx: -uz * side, nz: ux * side, winding: side, uvShift: faceIndex * 0.37 };
    const rs = rayHit(m.sponge, m.center.x, m.center.z, theta);
    const rf = rayHit(outer, m.center.x, m.center.z, theta);
    const wob = rng(seed * 7 + faceIndex * 13 + 3);

    m.layerY.forEach((y0, i) => {
      const y1 = y0 + m.layerH;
      const crust = 0.045;
      const skin = 0.014;
      const rCols = [0, rs * 0.5, rs - crust, rs];
      const yRows = [y0, y0 + skin, y0 + skin * 2.4, y1 - skin * 2.4, y1 - skin, y1];
      sponge[i].push(
        gridGeometry(rCols, yRows, (ci, rj) => {
          let sh = 1;
          if (ci === 3) sh *= 0.66; // casquinha da lateral
          if (rj === 0 || rj === 5) sh *= 0.72; // base e topo assados
          else if (rj === 1 || rj === 4) sh *= 0.9;
          return sh;
        }, basis, UV),
      );
    });

    m.fillY.forEach((y0, i) => {
      const y1 = y0 + m.fillH;
      const segs = 22;
      const rEnd = rs + (m.naked ? 0.008 : 0);
      const top = [];
      const bottom = [];
      const ph1 = wob() * TAU;
      const ph2 = wob() * TAU;
      for (let k = 0; k <= segs; k++) {
        const rr = (k / segs) * rEnd;
        const w1 = Math.sin(rr * 9 + ph1) * 0.006 + Math.sin(rr * 23 + ph2) * 0.003;
        const w2 = Math.sin(rr * 11 + ph2) * 0.006 + Math.sin(rr * 19 + ph1) * 0.003;
        // o recheio "abraça" a massa: avança um pouco para cima e para baixo
        top.push([rr, y1 + 0.006 + w1, 1]);
        bottom.push([rr, y0 - 0.006 + w2, 0.92]);
      }
      filling[i].push(polyGeometry([...bottom, ...top.reverse()], basis, { uvScale: UV, lift: 0.0012 }));
    });

    if (!m.naked) {
      const pts = [
        [rs, 0],
        [rf, 0],
      ];
      const cornerR = Math.min(m.rf, rf - rs + 0.02);
      for (let k = 0; k <= 6; k++) {
        const a = (k / 6) * (Math.PI / 2);
        pts.push([rf - cornerR + cornerR * Math.cos(a), m.Ht - cornerR + cornerR * Math.sin(a)]);
      }
      pts.push([0, m.Ht], [0, m.H], [rs, m.H]);
      frost.push(polyGeometry(pts, basis, { uvScale: UV, lift: 0.0006 }));
    } else {
      const rr = m.rf;
      const re = rs + 0.014;
      const pts = [[0, m.H - 0.004]];
      for (let k = 0; k <= 4; k++) {
        const a = -Math.PI / 2 + (k / 4) * (Math.PI / 2);
        pts.push([re - rr + rr * Math.cos(a), m.H - 0.004 + rr + rr * Math.sin(a)]);
      }
      for (let k = 0; k <= 4; k++) {
        const a = (k / 4) * (Math.PI / 2);
        pts.push([re - rr + rr * Math.cos(a), m.Ht - rr + rr * Math.sin(a)]);
      }
      pts.push([0, m.Ht]);
      frost.push(polyGeometry(pts, basis, { uvScale: UV, lift: 0.0006 }));
    }

    if (drip) {
      const t0 = 0.017;
      const cr = m.rf;
      const lip = 0.035;
      const pts = [[0, m.Ht]];
      for (let k = 0; k <= 5; k++) {
        const a = Math.PI / 2 - (k / 5) * (Math.PI / 2);
        pts.push([rf - cr + cr * Math.cos(a), m.Ht - cr + cr * Math.sin(a)]);
      }
      pts.push([rf, m.Ht - cr - lip], [rf + t0 * 0.7, m.Ht - cr - lip + 0.006]);
      for (let k = 0; k <= 5; k++) {
        const a = (k / 5) * (Math.PI / 2);
        pts.push([rf - cr + (cr + t0) * Math.cos(a), m.Ht - cr + (cr + t0) * Math.sin(a)]);
      }
      pts.push([0, m.Ht + t0]);
      dripGeo.push(polyGeometry(pts, basis, { uvScale: UV, lift: 0.0009 }));
    }
  });

  return {
    sponge: sponge.map(merge),
    filling: filling.map(merge),
    frost: merge(frost),
    drip: merge(dripGeo),
  };
}

/* ───────── Boleira ───────── */

/**
 * Prato de porcelana com filete dourado, pé torneado e a base dourada do bolo.
 * → { plate, rim, foot, board, floorY, plateRadius }
 */
export function buildStand(m) {
  const b = m.bounds;
  const round = m.shape === 'round' || m.shape === 'heart';
  const margin = 0.2 + m.R * 0.07;
  const platePath = round ? circlePath(b.maxR + margin, 128) : roundedRectPath(b.hx + margin, b.hz + margin, Math.min(b.hx, b.hz) * 0.42 + margin * 0.5);
  const top = -0.014;
  const plateProfile = [
    { d: -0.16, y: top - 0.058, nd: 0.05, ny: -1 },
    { d: -0.07, y: top - 0.05, nd: 0.25, ny: -0.97 },
    { d: -0.025, y: top - 0.034, nd: 0.7, ny: -0.7 },
    { d: -0.004, y: top - 0.016, nd: 0.97, ny: -0.2 },
    { d: 0, y: top - 0.004, nd: 1, ny: 0.1 },
    { d: -0.006, y: top + 0.008, nd: 0.75, ny: 0.66 },
    { d: -0.02, y: top + 0.013, nd: 0.1, ny: 1 },
    { d: -0.036, y: top + 0.01, nd: -0.35, ny: 0.94 },
    { d: -0.06, y: top + 0.003, nd: -0.2, ny: 0.98 },
    { d: -0.09, y: top, nd: 0, ny: 1 },
  ];
  const plate = sweep(platePath, plateProfile, { capTop: true, capBottom: true });
  const rimProfile = plateProfile.slice(3, 8).map((p) => ({ ...p, d: p.d + p.nd * 0.0014, y: p.y + p.ny * 0.0014 }));
  const rim = sweep(platePath, rimProfile);

  const rho = Math.min(b.hx, b.hz) + margin;
  const hs = 0.3 + m.R * 0.1;
  const yTop = top - 0.056;
  const curve = new THREE.SplineCurve([
    new THREE.Vector2(rho * 0.5, yTop + 0.004),
    new THREE.Vector2(rho * 0.3, yTop - hs * 0.1),
    new THREE.Vector2(rho * 0.15, yTop - hs * 0.32),
    new THREE.Vector2(rho * 0.125, yTop - hs * 0.55),
    new THREE.Vector2(rho * 0.2, yTop - hs * 0.76),
    new THREE.Vector2(rho * 0.4, yTop - hs * 0.92),
    new THREE.Vector2(rho * 0.5, yTop - hs * 0.975),
    new THREE.Vector2(rho * 0.512, yTop - hs * 0.99),
    new THREE.Vector2(rho * 0.5, yTop - hs),
  ]);
  const pts = curve.getPoints(44);
  pts.push(new THREE.Vector2(0, yTop - hs));
  const foot = new THREE.LatheGeometry(pts.reverse(), 72);

  const boardProfile = [
    { d: m.t + 0.024, y: -0.014, nd: 1, ny: 0 },
    { d: m.t + 0.024, y: -0.004, nd: 1, ny: 0.2 },
    { d: m.t + 0.02, y: 0, nd: 0.3, ny: 1 },
    { d: m.t - 0.02, y: 0, nd: 0, ny: 1 },
  ];
  const board = sweep(m.sponge, boardProfile);
  return { plate, rim, foot, board, floorY: yTop - hs, plateRadius: round ? b.maxR + margin : Math.hypot(b.hx + margin, b.hz + margin) * 0.92, standHeight: hs + 0.07 };
}
