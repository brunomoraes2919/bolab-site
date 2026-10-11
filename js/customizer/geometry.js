// BOLAB — geometria procedural do bolo: contornos (redondo, quadrado, retangular, coração),
// superfícies varridas ao longo do contorno, calda escorrendo, fatia cortada e boleira.
// Unidades: 1 = 10 cm. O bolo apoia em y = 0 e cresce para cima.
import * as THREE from 'three';
import { rng } from './textures.js';
import { getSize, getFilling, tierRadii, LAYER_CM, FILLING_CM, SINGLE_CM } from '../data/customizer.js';
import { rng as seeded } from './textures.js';

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

/**
 * Coração feito de arcos e retas tangentes: dois lóbulos bem separados, bico marcado na frente
 * e reentrância funda atrás — para ser lido como coração de qualquer ângulo.
 */
function heartPath(k) {
  const r = 0.54 * k;
  const a = 0.6 * k;
  const bz = -0.36 * k; // centro dos lóbulos (z)
  const tz = 0.88 * k; // centro do arredondamento do bico
  const rt = 0.12 * k;
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

/** Hexágono de quinas arredondadas, com um lado plano de frente (as quinas ficam à direita e à esquerda). */
function hexPath(R) {
  const rc = 0.12;
  const apothem = (R - 0.045) * 0.98;
  const H = Math.PI / 3;
  const cr = (apothem - rc) / Math.cos(H / 2);
  const b = new PathBuilder();
  for (let k = 0; k < 6; k++) {
    const ang = k * H;
    const cx = cr * Math.cos(ang);
    const cz = cr * Math.sin(ang);
    if (k > 0) {
      const nx = Math.cos(ang - H / 2);
      const nz = Math.sin(ang - H / 2);
      b.lineTo(cx + rc * nx, cz + rc * nz, nx, nz);
    }
    b.arc(cx, cz, rc, ang - H / 2, ang + H / 2);
  }
  const nx = Math.cos(-H / 2);
  const nz = Math.sin(-H / 2);
  b.lineTo(cr + rc * nx, rc * nz, nx, nz);
  return b.finish();
}

/** Contorno da massa para um formato e raio nominal R (já descontada a espessura da cobertura). */
export function shapePath(shape, R, detail = 1) {
  if (shape === 'square') return roundedRectPath(R * 0.9 - 0.045, R * 0.9 - 0.045, 0.17);
  if (shape === 'rect') return roundedRectPath(R * 1.14 - 0.045, R * 0.76 - 0.045, 0.17);
  if (shape === 'heart') return heartPath(R);
  if (shape === 'hex') return hexPath(R);
  return circlePath(R - 0.045, detail < 1 ? 80 : 112);
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

/** Menor distância de um ponto ao contorno. */
function distToPath(path, px, pz) {
  let best = Infinity;
  for (let i = 0; i < path.n; i++) {
    const j = (i + 1) % path.n;
    const ax = path.x[i];
    const az = path.z[i];
    const ex = path.x[j] - ax;
    const ez = path.z[j] - az;
    const len = ex * ex + ez * ez || 1e-9;
    const t = Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / len));
    const dx = px - ax - ex * t;
    const dz = pz - az - ez * t;
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/**
 * Contorno deslocado "de verdade": onde o deslocamento simples se cruzaria (bico e reentrância do coração,
 * quinas apertadas), os pontos a menos de |d| do contorno original são descartados e sobra uma curva limpa,
 * com quina viva nesses lugares. É por ela que os bicos da borda são distribuídos.
 */
export function cleanOffset(path, d, spacing = 0.02) {
  if (!d) return path;
  const dense = resamplePath(path, Math.max(48, Math.round(path.length / spacing)));
  const need = Math.abs(d) * 0.985;
  const x = [];
  const z = [];
  const nx = [];
  const nz = [];
  for (let i = 0; i < dense.n; i++) {
    const px = dense.x[i] + dense.nx[i] * d;
    const pz = dense.z[i] + dense.nz[i] * d;
    if (distToPath(path, px, pz) < need) continue;
    x.push(px);
    z.push(pz);
    nx.push(dense.nx[i]);
    nz.push(dense.nz[i]);
  }
  if (x.length < 8) return offsetPath(path, d);
  return makePath(Float32Array.from(x), Float32Array.from(z), Float32Array.from(nx), Float32Array.from(nz));
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

// t = espessura · rf = raio da quina do topo · lip = coroinha que a espátula deixa na borda do topo ·
// skirt = barra de calda acumulada no pé (coberturas despejadas)
const FROST = {
  buttercream: { t: 0.045, rf: 0.03, lip: 0.006 },
  chantilly: { t: 0.055, rf: 0.06, lip: 0.004 },
  ganache: { t: 0.036, rf: 0.045, skirt: 0.012 },
  glace: { t: 0.032, rf: 0.085, skirt: 0.016 },
  chocolate: { t: 0.048, rf: 0.05, lip: 0.005 },
  mousse: { t: 0.052, rf: 0.07 },
  naked: { t: 0, rf: 0.04 },
};

/**
 * Medidas de UM andar. layerY[i] = base da camada i · fillY[i] = base do recheio acima da camada i,
 * sempre a partir do pé do andar (y0 diz a que altura do bolo esse pé fica).
 */
const NAKED_OUT = 0.028; // quanto o creme do topo (e o recheio estufado) passam da massa no bolo naked

function tierMetrics(config, R, cover, y0, detail) {
  const type = cover.type;
  const semi = cover.style === 'seminaked' && type !== 'naked';
  const naked = type === 'naked' || semi;
  const n = config.layers.length;
  // camadas finas de massa e recheio quase da mesma espessura (1 unidade = 10 cm): a altura vem do número de
  // camadas. O bolo de 1 camada é o bolo simples, sem recheio: uma massa só, mais alta.
  const layerH = (n === 1 ? SINGLE_CM : LAYER_CM) / 10;
  const fillH = FILLING_CM / 10;
  const { t, rf, lip = 0, skirt = 0 } = naked ? FROST.naked : FROST[type] || FROST.buttercream;
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
  const tTop = naked ? 0.07 : t + 0.006; // naked: uma camada generosa de creme por cima
  const sponge = shapePath(config.shape, R, detail);
  const frost = offsetPath(sponge, naked ? NAKED_OUT : t); // superfície externa (cobertura ou borda do creme)
  const isHeart = config.shape === 'heart';
  // no coração, o centro fica onde cabe o maior círculo (arranjos e velas ganham espaço)
  const center = { x: 0, z: isHeart ? 0.08 * R : 0 };
  const bounds = pathBounds(frost);
  const topFlat = offsetPath(sponge, (naked ? NAKED_OUT : t) - rf); // limite da área plana do topo
  // menor distância do centro até a borda plana do topo: dá a escala das decorações
  let rMin = Infinity;
  for (let i = 0; i < topFlat.n; i++) rMin = Math.min(rMin, Math.hypot(topFlat.x[i] - center.x, topFlat.z[i] - center.z));
  // espatulado e riscado não deixam a coroinha lisa na borda
  const crown = cover.style === 'rustico' || cover.style === 'pente' ? 0 : lip;
  return { R, type, naked, semi, style: cover.style || 'liso', cover, n, fillIds: config.fillings.slice(), layerH, fillH, t, rf, lip: crown, skirt, detail, tTop, layerY, fillY, H, Ht: H + tTop, y0, sponge, frost, topFlat, center, bounds, rMin, shape: config.shape };
}

/**
 * Medidas do bolo inteiro. Devolve o andar de CIMA (onde ficam bicos do topo e decorações), com:
 *  stack = todos os andares, de baixo para cima · base = o andar de baixo (boleira, enquadramento) ·
 *  Htot = altura total do bolo. Num bolo de 1 andar, é o próprio andar (y0 = 0, Htot = Ht).
 */
export function cakeMetrics(config, detail = 1) {
  const radii = tierRadii(getSize(config.size)?.radius || 1, config.tiers || 1);
  let y = 0;
  const stack = radii.map((R, i) => {
    const tier = tierMetrics(config, R, (config.tierCover && config.tierCover[i]) || config.covering, y, detail);
    tier.index = i;
    y += tier.Ht;
    return tier;
  });
  const top = stack[stack.length - 1];
  stack.forEach((tier) => {
    tier.stack = stack;
    tier.base = stack[0];
    tier.Htot = y;
    tier.isTop = tier === top;
  });
  return top;
}

/* ───────── Superfície varrida ─────────
   profile: [{ d, y, nd, ny }] de baixo para cima (d = deslocamento para fora do contorno).
   Fecha com tampa plana no último ponto quando capTop = true. */
export function sweep(path, profile, { capTop = false, capBottom = false, uRepeat = 1, vScale = 1, capScale = 0.5, center = { x: 0, z: 0 }, flip = false, wrap = false } = {}) {
  const n = path.n;
  const m = profile.length;
  const cols = n + 1;
  const capVerts = (capTop ? cols + 1 : 0) + (capBottom ? cols + 1 : 0);
  const count = cols * m + capVerts;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const uv1 = new Float32Array(count * 2);
  let yLo = Infinity;
  let yHi = -Infinity;
  profile.forEach((q) => {
    yLo = Math.min(yLo, q.y);
    yHi = Math.max(yHi, q.y);
  });
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
      uv1[k * 2] = path.s[i] / path.length;
      uv1[k * 2 + 1] = (p.y - yLo) / (yHi - yLo || 1);
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
      uv1.set([(x - center.x) * capScale + 0.5, (z - center.z) * capScale + 0.5], k * 2);
      k++;
    }
    pos.set([center.x, p.y, center.z], k * 3);
    nor.set([0, up ? 1 : -1, 0], k * 3);
    uv.set([0.5, 0.5], k * 2);
    uv1.set([0.5, 0.5], k * 2);
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
  // segundo conjunto de UV (0…1 em volta × 0…1 de altura): só a cobertura usa, para os estilos de duas cores.
  // As outras peças ficam sem ele — assim os shaders delas são os mesmos de sempre (já adiantados no aquecimento).
  if (wrap) geo.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
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
  const profile = [];
  if (m.skirt) {
    // cobertura despejada: uma barra arredondada de calda se acumula no pé do bolo
    const k = m.skirt;
    for (let i = 0; i <= 5; i++) {
      const a = (i / 5) * Math.PI;
      profile.push({ d: m.t + k * 0.7 * Math.sin(a) + k * 0.25 * (1 - i / 5), y: k * 2.6 * (i / 5), nd: Math.max(0.2, Math.sin(a) + 0.5), ny: -Math.cos(a) * 0.8 });
    }
    // logo acima da barra a lateral volta a ser reta (sem esta linha, a parede inteira herdaria a inclinação da barra)
    profile.push({ d: m.t, y: k * 2.6 + 0.006, nd: 1, ny: 0 });
  } else profile.push({ d: m.t, y: 0, nd: 1, ny: 0 });
  filletUp(profile, m.t, m.Ht + m.lip, m.rf, m.detail < 1 ? 6 : 8);
  if (m.lip) {
    // coroinha da espátula: sobe um fio na borda e se desfaz em direção ao centro do topo
    const edge = m.t - m.rf;
    [
      [0.022, 0.82],
      [0.048, 0.36],
      [0.08, 0],
    ].forEach(([inset, k]) => profile.push({ d: edge - inset, y: m.Ht + m.lip * k, nd: 0.12, ny: 1 }));
  }
  const uRepeat = Math.max(2, Math.round(m.frost.length / 1.6));
  return sweep(m.sponge, profile, { capTop: true, uRepeat, vScale: 1 / 1.6, capScale: 1 / (2.9 * m.R), center: m.center, wrap: true });
}

/* ───────── Bolo naked: discos de massa, recheio estufado, creme do topo e a raspada ─────────
   Nada aqui é cilindro perfeito: cada disco tem a quina de cima arredondada (onde a massa cresceu e dourou),
   um contorno de leve torto e fica um tico fora do prumo; o recheio é uma camada grossa de creme que estufa
   entre os discos, com a beira irregular; o creme do topo é generoso e passa da borda. */

/** Soma de ondas em volta do bolo: irregularidade suave e repetível. freqs = voltas por circunferência. */
function waves(r, freqs) {
  const ph = freqs.map(() => r() * TAU);
  const total = freqs.reduce((a, _, i) => a + 1 / (i + 1), 0);
  return (a) => freqs.reduce((sum, f, i) => sum + Math.sin(a * f + ph[i]) / (i + 1), 0) / total;
}

/** Deforma uma peça em volta do centro. f(ângulo, y, raio) → { k = escala radial, dy, dx, dz }. */
function warp(geo, center, f) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) - center.x;
    const z = pos.getZ(i) - center.z;
    const y = pos.getY(i);
    const o = f(Math.atan2(z, x), y, Math.hypot(x, z));
    pos.setXYZ(i, center.x + x * (o.k ?? 1) + (o.dx || 0), y + (o.dy || 0), center.z + z * (o.k ?? 1) + (o.dz || 0));
  }
  pos.needsUpdate = true;
  return geo;
}

/** Refaz as normais de uma peça varrida depois de deformada (e costura a primeira coluna com a última). */
function renormal(geo, cols, rows) {
  geo.computeVertexNormals();
  const nor = geo.attributes.normal;
  for (let j = 0; j < rows; j++) {
    const a = j;
    const b = (cols - 1) * rows + j;
    const x = nor.getX(a) + nor.getX(b);
    const y = nor.getY(a) + nor.getY(b);
    const z = nor.getZ(a) + nor.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    nor.setXYZ(a, x / l, y / l, z / l);
    nor.setXYZ(b, x / l, y / l, z / l);
  }
  return geo;
}

const profileLength = (profile) => profile.reduce((sum, q, i) => (i ? sum + Math.hypot(q.d - profile[i - 1].d, q.y - profile[i - 1].y) : 0), 0);

/**
 * O "torto" de cada disco de massa do naked: tamanho um tico diferente, fora do prumo e contorno ondulado.
 * Somado, nunca passa de ~2,3 mm — menos que a folga do creme do topo e da calda, que ficam sempre por fora.
 */
function spongeNoise(m, i) {
  const r = seeded(m.n * 131 + i * 17 + Math.round(m.R * 100) + (m.index || 0) * 57);
  const w = waves(r, [2, 3, 5, 9]);
  const inv = 1 / Math.max(0.5, m.R);
  const k0 = 1 + (r() - 0.5) * 0.012 * inv; // cada disco sai de um tamanho (1 mm de diferença)
  const dx = (r() - 0.5) * 0.014; // e nunca fica bem no prumo
  const dz = (r() - 0.5) * 0.014;
  const amp = 0.009 * inv;
  return (a) => ({ k: k0 + amp * w(a), dx, dz });
}

/** Um disco de massa do bolo naked: lateral assada, quina de cima arredondada, contorno de leve torto. */
export function buildSponge(m, i) {
  const y0 = m.layerY[i];
  const y1 = y0 + m.layerH;
  const rt = Math.min(0.036, m.layerH * 0.2); // quina de cima: a massa cresce arredondada
  const rb = 0.012; // quina de baixo: o canto da fôrma, quase vivo
  const profile = [
    { d: -rb, y: y0, nd: 0.4, ny: -0.92 },
    { d: -rb * 0.3, y: y0 + rb * 0.35, nd: 0.82, ny: -0.57 },
    { d: 0, y: y0 + rb, nd: 1, ny: 0 },
    { d: 0.0025, y: (y0 + y1) / 2, nd: 1, ny: 0 }, // leve barriga no meio
  ];
  const steps = m.detail < 1 ? 4 : 6;
  for (let k = 0; k <= steps; k++) {
    const a = (k / steps) * (Math.PI / 2);
    profile.push({ d: -rt + rt * Math.cos(a), y: y1 - rt + rt * Math.sin(a), nd: Math.cos(a), ny: Math.sin(a) });
  }
  // a textura da casca é uma tira 4 × 1: quatro alturas de camada por volta de textura (os poros ficam redondos)
  const uRepeat = Math.max(2, Math.round(m.sponge.length / (m.layerH * 4)));
  const geo = sweep(m.sponge, profile, { capTop: true, uRepeat, vScale: 1 / profileLength(profile), capScale: 1 / 0.6, center: m.center });
  if (m.semi) return geo; // no semi-naked a espátula deixa a lateral no prumo
  return warp(geo, m.center, spongeNoise(m, i));
}

/**
 * Recheio aparente entre dois discos (bolo naked): camada grossa de creme, fosca, que estufa um pouco para
 * fora, com a beira irregular (aqui escapou mais, ali menos) e um resto de creme subindo e descendo nas massas.
 * No semi-naked fica rente (a espátula raspou) e é do creme da cobertura.
 */
const BAND_BULGE = 0.012; // o creme fica quase rente à massa (a espátula passou em volta): escapa 1 mm, em média
function bandNoise(m, i) {
  const r = seeded(m.n * 71 + i * 29 + Math.round(m.R * 100) + (m.index || 0) * 13);
  const swell = waves(r, [2, 3, 5, 8]); // trechos em que o creme escapou mais, outros em que ficou para dentro
  const lump = waves(r, [13, 23, 37, 59]); // o ondulado miúdo de creme apertado
  const creep = waves(r, [5, 11, 19]);
  const inv = 1 / Math.max(0.5, m.R);
  return { creep, out: (a) => inv * (0.01 * swell(a) + 0.003 * lump(a)) };
}

export function buildFillingBand(m, i) {
  const y0 = m.fillY[i];
  const y1 = y0 + m.fillH;
  const mid = (y0 + y1) / 2;
  const half = (y1 - y0) / 2 + 0.005;
  const bulge = m.semi ? 0.004 : BAND_BULGE;
  const steps = m.detail < 1 ? 7 : 10;
  const profile = [{ d: -0.03, y: y0 - 0.004, nd: 0, ny: -1 }];
  for (let k = 0; k <= steps; k++) {
    const a = -Math.PI / 2 + (k / steps) * Math.PI;
    const c = Math.pow(Math.max(0, Math.cos(a)), 0.3); // face quase reta, só a quina arredonda junto das massas
    profile.push({ d: -0.008 + (bulge + 0.008) * c, y: mid + half * Math.sin(a), nd: Math.max(0.2, c), ny: Math.sin(a) * 0.7 });
  }
  profile.push({ d: -0.03, y: y1 + 0.004, nd: 0, ny: 1 });
  // no semi-naked a faixa é feita do próprio creme da cobertura (mesmo material, mesmo conjunto de UV)
  const geo = sweep(m.sponge, profile, { uRepeat: 1, wrap: Boolean(m.semi) });
  if (m.semi) return geo;
  const { creep, out } = bandNoise(m, i);
  const inv = 1 / Math.max(0.5, m.R);
  warp(geo, m.center, (a, y) => {
    const side = (y - mid) / half; // −1 embaixo, +1 em cima
    const edge = Math.pow(Math.min(1, Math.abs(side)), 3); // 0 no meio da faixa, 1 no encontro com a massa
    // o creme cede com o peso: a barriga fica um pouco abaixo do meio e a beira de baixo desce sobre a massa
    const sag = side < 0 ? -edge * (0.004 + 0.012 * Math.max(0, creep(a))) : edge * 0.006 * (0.3 + 0.7 * creep(a + 1.7));
    return { k: 1 + out(a) * (1 - edge * 0.6) - inv * 0.003 * side * (1 - edge), dy: sag };
  });
  return renormal(geo, m.sponge.n + 1, profile.length);
}

/** Fio de geleia junto ao creme (recheios de fruta no bolo naked): fino, escuro e brilhante, sobre a massa de baixo. */
export function buildJamThread(m, i) {
  const y = m.fillY[i] + 0.016;
  const rad = 0.011;
  const profile = [];
  for (let k = 0; k <= 6; k++) {
    const a = -Math.PI / 2 + (k / 6) * Math.PI;
    profile.push({ d: 0.012 + rad * Math.cos(a), y: y + rad * 0.8 * Math.sin(a), nd: Math.cos(a), ny: Math.sin(a) });
  }
  const geo = sweep(m.sponge, profile, { uRepeat: 1 });
  const r = seeded(m.n * 53 + i * 31 + Math.round(m.R * 100));
  const wob = waves(r, [5, 9, 17, 29]);
  const amp = 0.01 / Math.max(0.5, m.R);
  // a geleia escorre aqui e some ali: o fio engrossa, afina e às vezes entra no creme
  return warp(geo, m.center, (a) => ({ k: 1 + amp * wob(a) - (wob(a * 1.3 + 2) > 0.45 ? amp * 2.2 : 0), dy: 0.004 * wob(a + 1) }));
}

/**
 * Creme do topo do bolo naked: uma camada generosa, com volume, que passa da borda e pende um pouco —
 * mais aqui, menos ali — sobre o disco de cima. As marcas de espátula vêm do relevo do material.
 */
const TOP_LIP = 0.03; // quanto a beira do creme do topo desce abaixo do alto da massa (antes da irregularidade)
function creamNoise(m) {
  const r = seeded(m.n * 37 + Math.round(m.R * 100) + (m.index || 0) * 91);
  const droop = waves(r, [3, 5, 8, 13]);
  const amp = 0.016 / Math.max(0.5, m.R);
  return {
    droop,
    amp,
    side: (a) => amp * 0.85 * droop(a * 1.7 + 4), // a lateral do creme ondula (foi alisada à mão)
    hang: (a) => {
      const d = 0.5 + 0.5 * droop(a);
      return 0.006 + 0.075 * d * d * d; // a beira pende sobre o disco de cima: aqui um dedo de creme, ali quase nada
    },
  };
}

export function buildTopCream(m) {
  const rr = m.rf;
  const out = NAKED_OUT + 0.002;
  const lip = TOP_LIP;
  const y1 = m.Ht;
  const profile = [
    { d: -0.03, y: m.H + 0.004, nd: 0, ny: -1 }, // por baixo, escondido sobre a massa
    { d: out - 0.02, y: m.H - lip * 0.5, nd: -0.25, ny: -0.97 },
    { d: out - 0.006, y: m.H - lip, nd: 0.45, ny: -0.9 }, // a beira que passou da borda
    { d: out, y: m.H - lip * 0.4, nd: 1, ny: -0.25 },
  ];
  // a borda é de creme mole, não de tampa: arredonda desde baixo (curva mais alta que larga), sem parede reta
  const rv = Math.min(m.tTop - 0.014, rr * 1.6);
  profile.push({ d: out, y: y1 - rv, nd: 1, ny: 0 });
  const steps = m.detail < 1 ? 5 : 7;
  for (let k = 1; k <= steps; k++) {
    const a = (k / steps) * (Math.PI / 2);
    profile.push({ d: out - rr + rr * Math.cos(a), y: y1 - rv + rv * Math.sin(a), nd: Math.cos(a) * rv, ny: Math.sin(a) * rr });
  }
  const geo = sweep(m.sponge, profile, { capTop: true, uRepeat: Math.max(2, Math.round(m.sponge.length / 1.6)), vScale: 1 / 1.6, capScale: 1 / (2.9 * m.R), center: m.center, wrap: true });
  const noise = creamNoise(m);
  const yEdge = m.H + 0.01;
  warp(geo, m.center, (a, y) => {
    const side = noise.side(a) * Math.min(1, Math.max(0, (y1 - y) / 0.03));
    if (y > yEdge) return { k: 1 + side };
    const w = Math.min(1, (yEdge - y) / (lip + 0.01));
    return { k: 1 + side + noise.amp * noise.droop(a + 2) * w, dy: -w * noise.hang(a) };
  });
  return renormal(geo, m.sponge.n + 1, profile.length);
}

/**
 * Véu de creme raspado sobre a lateral inteira de um andar naked (a textura decide onde há creme):
 * restos junto dos recheios no naked; uma película desigual, com a massa aparecendo em manchas, no semi-naked.
 */
export function buildScrapeCoat(m) {
  const y0 = 0.004;
  const y1 = m.H - 0.002;
  const uRepeat = Math.max(2, Math.round(m.sponge.length / 1.6));
  if (m.semi) {
    // semi-naked: lateral no prumo, película rente por fora das faixas de creme
    const d = 0.0085;
    return sweep(m.sponge, [{ d, y: y0, nd: 1, ny: 0 }, { d, y: y1, nd: 1, ny: 0 }], { uRepeat, vScale: 1 / (y1 - y0) });
  }
  // naked: o véu acompanha o torto de cada disco, colado na massa (0,4 mm por fora), inclusive nas quinas de cima
  // e de baixo — é ali, junto do recheio, que fica mais creme. Quatro linhas por disco; sobre o recheio é invisível.
  const d = 0.004;
  const rt = Math.min(0.036, m.layerH * 0.2);
  const profile = [];
  const rowDisc = [];
  m.layerY.forEach((ly, i) => {
    const top = ly + m.layerH;
    profile.push(
      { d: -0.002, y: Math.max(y0, ly + 0.003), nd: 0.8, ny: -0.6 },
      { d, y: ly + 0.014, nd: 1, ny: 0 },
      { d, y: top - rt * 0.72, nd: 1, ny: 0 },
      { d: d - rt * 0.45, y: Math.min(y1, top - rt * 0.17), nd: 0.6, ny: 0.8 },
    );
    rowDisc.push(i, i, i, i);
  });
  const geo = sweep(m.sponge, profile, { uRepeat, vScale: 1 });
  // v da textura = altura dentro do andar (a textura sabe onde ficam discos e recheios)
  const uv = geo.attributes.uv;
  const pos = geo.attributes.position;
  for (let k = 0; k < uv.count; k++) uv.setY(k, (pos.getY(k) - y0) / (y1 - y0));
  const noise = m.layerY.map((_, i) => spongeNoise(m, i));
  const rows = profile.length;
  let k = 0;
  warp(geo, m.center, (a) => noise[rowDisc[k++ % rows]](a));
  return geo;
}

/* ───────── Calda escorrendo ─────────
   Um lençol de espessura variável sobre o topo e a lateral: onde há calda ele fica para fora;
   onde não há, mergulha para dentro da cobertura e some. As gotas se fundem à borda como líquido. */
const HIDDEN = -0.006; // calda mais de 0,6 mm para dentro da cobertura: não se vê

/** Até onde a gota mais comprida da calda desce na lateral de um andar, medido do começo da quina do topo (m.Ht − m.rf). */
export function dripReach(m) {
  return Math.min((m.Ht - m.rf) * 0.74, 0.66);
}

export function buildDrip(m, seed = 1) {
  const d0 = m.naked ? NAKED_OUT + 0.002 : m.t; // no naked a calda assenta no creme do topo
  const rf = m.rf;
  const yTop = m.Ht;
  const sideH = yTop - rf;
  const r = rng(seed);
  const outer = offsetPath(m.sponge, d0);
  const lod = m.detail < 1 ? 2.1 : 1; // no celular a malha da calda tem ~1/4 dos triângulos
  const ds = 0.0115 * lod;
  const cols = Math.max(96, Math.round(outer.length / ds));
  const col = resamplePath(outer, cols);
  const L = col.length;

  // sorteio das gotas: a maioria curta, algumas longas — como calda de verdade
  const maxLen = dripReach(m);
  const drips = [];
  let s = r() * 0.1;
  while (s < L - 0.07) {
    // de verdade: umas poucas gotas compridas, muitas médias e algumas que mal saem da borda
    const kind = r();
    const long = kind < 0.3;
    const len = maxLen * (long ? 0.55 + r() * 0.45 : kind < 0.78 ? 0.22 + r() * 0.3 : 0.1 + r() * 0.1);
    drips.push({ s, w: 0.023 + r() * 0.014 + (long ? 0.006 : 0), len: Math.max(0.075, len) });
    s += 0.1 + r() * 0.2;
  }
  const lipPhase = [r() * TAU, r() * TAU, r() * TAU];
  const lipAt = (x) => 0.03 + 0.012 * Math.sin((x / L) * TAU * 7 + lipPhase[0]) + 0.008 * Math.sin((x / L) * TAU * 17 + lipPhase[1]) + 0.005 * Math.sin((x / L) * TAU * 31 + lipPhase[2]);

  const t0 = 0.017;
  const dv = 0.012 * lod;
  const F = 5;
  const rowsSide = Math.ceil((maxLen + 0.05) / dv);
  const rows = 1 + F + rowsSide;
  const vertCount = (cols + 1) * rows + 1;
  const pos = new Float32Array(vertCount * 3);
  const depth = new Float32Array(vertCount); // quanto cada ponto da lateral fica para fora (+) ou para dentro (−) da cobertura
  const K = 0.03;
  const smin = (a, b) => {
    const h = Math.max(K - Math.abs(a - b), 0) / K;
    return Math.min(a, b) - h * h * K * 0.25;
  };
  // onde não há calda o lençol mergulha até sumir. No naked ele parte de 3 mm fora da massa (assenta no creme do
  // topo), então precisa mergulhar mais: até 3 mm para dentro da massa, que é torta e recua aqui e ali.
  const floor = m.naked ? -(d0 + 0.03) : -0.03;
  const thickness = (sx, v, near) => {
    let sd = v - lipAt(sx);
    let bulb = 0;
    for (const dr of near) {
      let dsx = Math.abs(sx - dr.s);
      if (dsx > L / 2) dsx = L - dsx;
      const end = dr.len - dr.w;
      // pescoço fino e uma gota gordinha na ponta
      const w = dr.w * (0.64 + 0.36 * smoothstep(end - dr.w * 3.2, end - dr.w * 0.4, v));
      const vv = Math.max(-0.05, Math.min(end, v));
      sd = smin(sd, Math.hypot(dsx, v - vv) - w);
      const g = Math.exp(-((v - end) ** 2 + dsx * dsx) / (2 * (dr.w * 0.9) ** 2));
      if (g > bulb) bulb = g;
    }
    if (sd >= 0) return Math.max(floor, -1.3 * sd);
    return (0.017 + 0.019 * bulb) * Math.sin((Math.PI / 2) * Math.min(1, -sd / 0.028));
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
      // lábio macio: a calda engrossa um pouco ao dobrar a quina do topo
      const th = t0 + (tSide0 - t0) * smoothstep(0, 1, f / F) + 0.005 * Math.sin((Math.PI * f) / F);
      const off = -rf + (rf + th) * Math.sin(a);
      pos.set([px + nx * off, yTop - rf + (rf + th) * Math.cos(a), pz + nz * off], k * 3);
      k++;
    }
    for (let j = 1; j <= rowsSide; j++) {
      const v = j * dv;
      const th = thickness(sx, v, near);
      pos.set([px + nx * th, Math.max(0.004, sideH - v), pz + nz * th], k * 3);
      depth[k] = th;
      k++;
    }
  }
  const centerIndex = k;
  pos.set([m.center.x, yTop + t0, m.center.z], k * 3);
  const index = [];
  // no naked só some o que entrou bem na massa (ela recua até uns 2,3 mm; o véu de creme é meio transparente)
  const hidden = m.naked ? -(d0 + 0.026) : HIDDEN;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows - 1; j++) {
      const a = i * rows + j;
      const b = (i + 1) * rows + j;
      // onde não há calda o lençol mergulha na cobertura: esses quadrados nunca aparecem e ficam de fora
      // (entre as gotas é a maior parte da malha; quem tem um canto à vista continua inteiro)
      if (j > F && depth[a] < hidden && depth[b] < hidden && depth[a + 1] < hidden && depth[b + 1] < hidden) continue;
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
  const jam = m.fillY.map(() => []); // recheios de fruta: a geleia espalhada sobre a massa de baixo
  const bits = { pos: [], nor: [], uv: [], idx: [] }; // pedaços de fruta à mostra (quadradinhos com a foto da fatia)
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
      // no naked o recheio aparece por fora: a face do corte vai até onde a faixa de creme chega neste ângulo
      const rEnd = m.semi ? rs + 0.004 : m.naked ? (rs + BAND_BULGE) * (1 + bandNoise(m, i).out(theta)) - 0.001 : rs;
      const fruit = getFilling(m.fillIds?.[i]);
      const top = [];
      const bottom = [];
      const ph1 = wob() * TAU;
      const ph2 = wob() * TAU;
      for (let k = 0; k <= segs; k++) {
        const rr = (k / segs) * rEnd;
        // linhas quase retas, como num bolo bem montado: só um tremidinho de mão
        const w1 = Math.sin(rr * 9 + ph1) * 0.0022 + Math.sin(rr * 23 + ph2) * 0.0012;
        const w2 = Math.sin(rr * 11 + ph2) * 0.0022 + Math.sin(rr * 19 + ph1) * 0.0012;
        // o recheio "abraça" a massa: avança um pouco para cima e para baixo
        top.push([rr, y1 + 0.006 + w1, 1]);
        bottom.push([rr, y0 - 0.006 + w2, 0.92]);
      }
      filling[i].push(polyGeometry([...bottom, ...top.reverse()], basis, { uvScale: UV, lift: 0.0012 }));
      if (fruit?.cream) {
        // geleia: uma fita fina e irregular sobre a massa de baixo, que some antes da borda
        const jt = [];
        const jb = [];
        const r1 = rs - 0.03;
        for (let k = 0; k <= segs; k++) {
          const rr = 0.01 + (k / segs) * (r1 - 0.01);
          const thick = 0.016 + 0.009 * Math.sin(rr * 14 + ph1) + 0.005 * Math.sin(rr * 37 + ph2);
          jb.push([rr, y0 - 0.004, 0.9]);
          jt.push([rr, y0 + Math.max(0.006, thick) * Math.min(1, (r1 - rr) / 0.05 + 0.25), 1]);
        }
        jam[i].push(polyGeometry([...jb, ...jt.reverse()], basis, { uvScale: UV, lift: 0.0018 }));
        // pedaços da fruta mergulhados no creme: fatias de morango de pé, ou framboesas
        const cell = fruit.pieces === 'framboesa' ? 0.5 : 0;
        const hh = Math.min(0.13, m.fillH * (fruit.pieces === 'framboesa' ? 0.62 : 0.84));
        let rr = 0.1 + wob() * 0.1;
        while (rr < rs - 0.1) {
          const ww = hh * (fruit.pieces === 'framboesa' ? 1.05 : 0.86 + wob() * 0.2);
          const yc = y0 + m.fillH * (0.54 + (wob() - 0.5) * 0.12);
          const tilt = (wob() - 0.5) * 0.5;
          const flipU = wob() < 0.5;
          const base = bits.pos.length / 3;
          [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
            // canto do quadradinho, girado de leve no plano do corte
            const lx = (sx * ww) / 2;
            const ly = (sy * hh) / 2;
            const px = rr + lx * Math.cos(tilt) - ly * Math.sin(tilt);
            const py = yc + lx * Math.sin(tilt) + ly * Math.cos(tilt);
            bits.pos.push(basis.ox + basis.ux * px + basis.nx * 0.0026, py, basis.oz + basis.uz * px + basis.nz * 0.0026);
            bits.nor.push(basis.nx, 0, basis.nz);
            bits.uv.push(cell + ((flipU ? -sx : sx) * 0.5 + 0.5) * 0.5, sy * 0.5 + 0.5);
          });
          if (basis.winding > 0) bits.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          else bits.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
          rr += ww * (1.25 + wob() * 0.9);
        }
      }
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
      // mesma seção da peça de fora (buildTopCream) neste ângulo: beira que pende, lateral arredondada
      const rr = m.rf;
      const rv = Math.min(m.tTop - 0.014, rr * 1.6);
      const noise = creamNoise(m);
      const hang = noise.hang(theta);
      const kSide = 1 + noise.side(theta);
      const kLip = kSide + noise.amp * noise.droop(theta + 2);
      const out = rs + NAKED_OUT + 0.002;
      const wAt = (dy) => Math.min(1, (0.01 + dy) / (TOP_LIP + 0.01)); // quanto cada ponto acompanha a beira que pende
      const pts = [
        [0, m.H - 0.004],
        [rs - 0.004, m.H - 0.004],
        [(out - 0.02) * kLip, m.H - TOP_LIP * 0.5 - wAt(TOP_LIP * 0.5) * hang],
        [(out - 0.006) * kLip, m.H - TOP_LIP - hang],
        [out * kLip - 0.001, m.H - TOP_LIP * 0.4 - wAt(TOP_LIP * 0.4) * hang],
      ];
      const re = out * kSide - 0.001;
      for (let k = 0; k <= 5; k++) {
        const a = (k / 5) * (Math.PI / 2);
        pts.push([re - rr + rr * Math.cos(a), m.Ht - rv + rv * Math.sin(a)]);
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

  let pieces = null;
  if (bits.idx.length) {
    pieces = new THREE.BufferGeometry();
    pieces.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bits.pos), 3));
    pieces.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(bits.nor), 3));
    pieces.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(bits.uv), 2));
    pieces.setIndex(bits.idx);
  }
  return {
    sponge: sponge.map(merge),
    filling: filling.map(merge),
    jam: jam.map((list) => (list.length ? merge(list) : null)),
    pieces,
    frost: merge(frost),
    drip: merge(dripGeo),
  };
}

/* ───────── Boleira ───────── */

/** Placa (tábua, cake board, mármore): contorno + espessura, com as quinas levemente chanfradas. */
function slab(path, yTop, thick, bevel = 0.012, capScale = 0.21) {
  const profile = [
    { d: -bevel, y: yTop - thick, nd: 0.4, ny: -0.9 },
    { d: 0, y: yTop - thick + bevel, nd: 1, ny: -0.2 },
    { d: 0, y: yTop - bevel, nd: 1, ny: 0.2 },
    { d: -bevel, y: yTop, nd: 0.4, ny: 0.9 },
  ];
  return sweep(path, profile, { capTop: true, capBottom: true, capScale });
}

/**
 * A base do bolo. m = o andar de baixo.
 *  boleira  prato de porcelana com filete dourado sobre um pé torneado
 *  prato    o mesmo prato, baixo, sem pé
 *  madeira  tábua rústica · dourada / prateada  cake board espelhado que acompanha o formato · marmore  placa
 * → { parts: [{ geo, mat, cast }], floorY, plateRadius, standHeight, shade: { x, z } }
 * mat: 'porcelain' | 'gold' | 'wood' | 'goldfoil' | 'silver' | 'marble'
 */
export function buildStand(m, base = 'boleira') {
  const b = m.bounds;
  const round = m.shape === 'round' || m.shape === 'heart' || m.shape === 'hex';
  const low = m.detail < 1;
  const outline = (margin) => (round ? circlePath(b.maxR + margin, low ? 80 : 128) : roundedRectPath(b.hx + margin, b.hz + margin, Math.min(b.hx, b.hz) * 0.42 + margin * 0.5));
  const reach = (margin) => (round ? b.maxR + margin : Math.hypot(b.hx + margin, b.hz + margin) * 0.92);
  const shade = (margin) => (round ? { x: b.maxR + margin, z: b.maxR + margin } : { x: b.hx + margin, z: b.hz + margin });

  if (base === 'madeira') {
    const margin = 0.26;
    const thick = 0.09;
    if (round) {
      // fatia de tronco: contorno meio torto (nenhuma árvore é um círculo) e a textura na escala exata da fatia,
      // para os anéis e a casca caírem na beira
      const R = b.maxR + margin;
      const wood = new PathBuilder();
      const n = low ? 80 : 128;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const k = 1 + 0.018 * Math.sin(a * 3 + 1.3) + 0.012 * Math.sin(a * 5 + 4.1) + 0.007 * Math.sin(a * 8 + 2.2);
        wood.push(Math.cos(a) * R * k, Math.sin(a) * R * k, Math.cos(a), Math.sin(a));
      }
      const geo = slab(wood.finish(), -0.002, thick, 0.02, 0.42 / R);
      return { parts: [{ geo, mat: 'wood' }], floorY: -0.002 - thick, plateRadius: R * 1.02, standHeight: thick, shade: shade(margin - 0.03) };
    }
    // quadrada ou retangular: tábua de ripas, com as ripas no sentido do comprimento
    const geo = slab(outline(margin), -0.002, thick, 0.016, 0.48 / (Math.max(b.hx, b.hz) + margin));
    return { parts: [{ geo, mat: 'plank' }], floorY: -0.002 - thick, plateRadius: reach(margin), standHeight: thick, shade: shade(margin - 0.03) };
  }
  if (base === 'marmore') {
    const margin = 0.3;
    const thick = 0.06;
    const geo = slab(outline(margin), -0.002, thick, 0.007, 0.4 / (Math.max(b.hx, b.hz, b.maxR * (round ? 1 : 0)) + margin));
    return { parts: [{ geo, mat: 'marble' }], floorY: -0.002 - thick, plateRadius: reach(margin), standHeight: thick, shade: shade(margin - 0.03) };
  }
  if (base === 'dourada' || base === 'prateada') {
    const margin = 0.14;
    const thick = 0.11;
    const geo = slab(cleanOffset(m.frost, margin), -0.002, thick, 0.01);
    return { parts: [{ geo, mat: base === 'dourada' ? 'goldfoil' : 'silver' }], floorY: -0.002 - thick, plateRadius: b.maxR + margin, standHeight: thick, shade: { x: (round ? b.maxR : b.hx) + margin - 0.02, z: (round ? b.maxR : b.hz) + margin - 0.02 } };
  }

  const margin = 0.2 + m.R * 0.07;
  const platePath = outline(margin);
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
  const rimProfile = plateProfile.slice(3, 8).map((q) => ({ ...q, d: q.d + q.nd * 0.0014, y: q.y + q.ny * 0.0014 }));
  const rim = sweep(platePath, rimProfile);
  const boardProfile = [
    { d: m.t + 0.024, y: -0.014, nd: 1, ny: 0 },
    { d: m.t + 0.024, y: -0.004, nd: 1, ny: 0.2 },
    { d: m.t + 0.02, y: 0, nd: 0.3, ny: 1 },
    { d: m.t - 0.02, y: 0, nd: 0, ny: 1 },
  ];
  const board = sweep(m.sponge, boardProfile);
  const rho = Math.min(b.hx, b.hz) + margin;
  const yTop = top - 0.056;
  const parts = [{ geo: plate, mat: 'porcelain' }, { geo: rim, mat: 'gold', cast: false }];
  // o disco dourado sob o bolo aparece nos bolos cobertos; no naked a massa assenta direto no prato
  if (m.naked) board.dispose();
  else parts.push({ geo: board, mat: 'gold', cast: false });

  if (base === 'prato') {
    // prato baixo: só um anel de apoio por baixo
    const hs = 0.026;
    const ring = new THREE.LatheGeometry(
      [new THREE.Vector2(0, yTop - hs), new THREE.Vector2(rho * 0.5, yTop - hs), new THREE.Vector2(rho * 0.54, yTop - hs * 0.5), new THREE.Vector2(rho * 0.52, yTop + 0.004)].reverse(),
      low ? 44 : 72,
    );
    parts.push({ geo: ring, mat: 'porcelain' });
    return { parts, floorY: yTop - hs, plateRadius: reach(margin), standHeight: hs + 0.07, shade: shade(margin - 0.035) };
  }

  const hs = 0.3 + m.R * 0.1;
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
  const pts = curve.getPoints(low ? 26 : 44);
  pts.push(new THREE.Vector2(0, yTop - hs));
  parts.push({ geo: new THREE.LatheGeometry(pts.reverse(), low ? 44 : 72), mat: 'porcelain' });
  return { parts, floorY: yTop - hs, plateRadius: reach(margin), standHeight: hs + 0.07, shade: shade(margin - 0.035) };
}
