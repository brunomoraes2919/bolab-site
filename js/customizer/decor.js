// BOLAB — confeitaria procedural: bicos (acabamento) e decorações do bolo.
// Tudo é geometria gerada por código e desenhada em lotes (InstancedMesh) para rodar leve no celular.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, hashString, makeCanvas, texture } from './textures.js';
import { offsetPath, cleanOffset, pathAt, pointInPath, rayHit } from './geometry.js';
import { allocate, plannedFor, plaqueSize, baseRingScale, signedDist } from './occupancy.js';
import { getDecor, getQuantity, getPiping } from '../data/customizer.js';
import { decorOptions } from './pricing.js';

const TAU = Math.PI * 2;
const Y = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _c = new THREE.Color();

const backOut = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

/** Orientação a partir de dois eixos (x e y do objeto); z = x × y. */
function frameQuat(xDir, yDir, out = new THREE.Quaternion()) {
  _x.copy(xDir).normalize();
  _z.crossVectors(_x, yDir).normalize();
  _y.crossVectors(_z, _x).normalize();
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

/* ───────── Lote de instâncias ─────────
   Guarda a posição de repouso de cada peça para animar a entrada ("pop") e
   esconder o que fica dentro da fatia retirada no modo "Ver por dentro". */
export class Batch {
  constructor(geometry, material, { cast = true, receive = false } = {}) {
    this.geometry = geometry;
    this.material = material;
    this.cast = cast;
    this.receive = receive;
    this.items = [];
    this.mesh = null;
  }

  /** quat: THREE.Quaternion · scale: número ou [x, y, z] · color: hex/THREE.Color opcional · rad: raio ocupado */
  add(x, y, z, quat, scale = 1, color = null, rad = 0.05) {
    const s = typeof scale === 'number' ? [scale, scale, scale] : scale;
    this.items.push({ x, y, z, q: quat ? quat.clone() : new THREE.Quaternion(), s, color, rad });
    return this;
  }

  build(center) {
    const n = this.items.length;
    if (!n) return null;
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, n);
    mesh.castShadow = this.cast;
    mesh.receiveShadow = this.receive;
    mesh.frustumCulled = false;
    const tinted = this.items.some((it) => it.color != null);
    this.items.forEach((it, i) => {
      it.angle = Math.atan2(it.z - center.z, it.x - center.x);
      it.dist = Math.hypot(it.x - center.x, it.z - center.z);
      // num lote em que alguma peça tem cor, as que não têm ficam brancas (sem isso sairiam pretas)
      if (tinted) mesh.setColorAt(i, _c.set(it.color != null ? it.color : 0xffffff));
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.mesh = mesh;
    this.update(10, null);
    return mesh;
  }

  /** time = segundos desde que a peça entrou em cena · wedge = { a, span } ou null */
  update(time, wedge) {
    if (!this.mesh) return;
    const n = this.items.length;
    const spread = Math.min(0.5, 0.012 * n);
    for (let i = 0; i < n; i++) {
      const it = this.items[i];
      let f = 1;
      if (time < 1.2) {
        const t = (time - (i / n) * spread) / 0.34;
        f = t <= 0 ? 0 : t >= 1 ? 1 : backOut(t);
      }
      if (wedge && inWedge(it, wedge)) f = 0;
      _p.set(it.x, it.y, it.z);
      _s.set(it.s[0] * f, it.s[1] * f, it.s[2] * f);
      if (f === 0) _s.setScalar(1e-6);
      _m.compose(_p, it.q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export function inWedge(it, wedge) {
  if (wedge.span <= 0.001) return false;
  const pad = Math.min(0.5, it.rad / Math.max(0.05, it.dist));
  if (it.dist < it.rad * 0.8) return true;
  let d = (it.angle - wedge.a + pad) % TAU;
  if (d < 0) d += TAU;
  return d < wedge.span + pad * 2;
}

/* ───────── Construtores de geometria ───────── */

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Superfície paramétrica (u, v) → ponto. wrapV fecha a volta (sem costura nas normais).
 * shade: função (u, v) → tom, ou true para usar o valor devolvido por fn (sombra "assada" nos vértices:
 * vales dos gomos, base das peças, vãos entre voltas). orient garante as faces viradas para fora.
 */
function surface(nu, nv, fn, { wrapV = false, flip = false, shade = null, orient = false } = {}) {
  const cols = wrapV ? nv : nv + 1;
  const pos = new Float32Array((nu + 1) * cols * 3);
  const col = shade ? new Float32Array((nu + 1) * cols * 3) : null;
  const p = new THREE.Vector3();
  let k = 0;
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j < cols; j++) {
      const tone = fn(i / nu, j / nv, p);
      if (col) col.fill(shade === true ? tone : shade(i / nu, j / nv), k, k + 3);
      pos[k++] = p.x;
      pos[k++] = p.y;
      pos[k++] = p.z;
    }
  }
  const index = [];
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const j2 = wrapV ? (j + 1) % nv : j + 1;
      const a = i * cols + j;
      const b = (i + 1) * cols + j;
      const c = i * cols + j2;
      const d = (i + 1) * cols + j2;
      if (flip) index.push(a, c, b, b, c, d);
      else index.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  if (orient) orientOutward(geo);
  return geo;
}

/** Vira as faces de uma peça fechada para fora (∮ (p − c)·n > 0), se tiverem saído ao contrário. */
function orientOutward(geo) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) c.add(_p.fromBufferAttribute(pos, i));
  c.multiplyScalar(1 / pos.count);
  let out = 0;
  for (let i = 0; i < pos.count; i++) out += _p.fromBufferAttribute(pos, i).sub(c).dot(_s.fromBufferAttribute(nor, i));
  if (out >= 0) return;
  const idx = geo.index.array;
  for (let i = 0; i < idx.length; i += 3) {
    const t = idx[i + 1];
    idx[i + 1] = idx[i + 2];
    idx[i + 2] = t;
  }
  geo.index.needsUpdate = true;
  geo.computeVertexNormals();
}

function paint(geo, r, g, b) {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([r, g, b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function plain(geo) {
  // deixa só posição e normal, para poder fundir geometrias de origens diferentes
  const g = geo.index ? geo.toNonIndexed() : geo;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.attributes.position);
  out.setAttribute('normal', g.attributes.normal);
  if (g.attributes.color) out.setAttribute('color', g.attributes.color);
  return out;
}

/* ───────── Bicos de confeitar ─────────
   Cada peça imita o que o bico de verdade deixa: o bico liso (perlê) faz gotas redondas; o bico pitanga
   (estrela aberta) deixa gomos — crista arredondada e vale em V — que acompanham o movimento da mão. */

const segs = (n, D, min = 4) => Math.max(min, Math.round(n * D));

/** Seção do bico pitanga: 1 na crista do gomo, 0 no fundo do vale (em V). */
const gomo = (theta, lobes, round = 0.7) => Math.pow(Math.abs(Math.cos((lobes * theta) / 2)), round);

/** Bolinha (bico perlê): meia esfera levemente achatada, com um biquinho macio onde o bico se afastou. */
function beadGeometry(D) {
  const r = 0.064;
  const b = 0.05;
  const phi0 = -0.62; // a base entra um pouco por baixo: a bolinha "senta" na cobertura
  const y0 = b * Math.sin(-phi0);
  return surface(D < 0.5 ? 6 : D < 1 ? 8 : 13, D < 0.5 ? 10 : D < 1 ? 12 : 20, (u, v, p) => {
    const phi = phi0 + u * (Math.PI / 2 - phi0);
    const rad = u > 0.999 ? 0 : r * Math.cos(phi);
    const peak = Math.exp(-((rad / 0.017) ** 2));
    const a = v * TAU;
    p.set(rad * Math.cos(a) + 0.004 * peak, y0 + b * Math.sin(phi) + 0.014 * peak, rad * Math.sin(a));
    return 0.7 + 0.3 * smooth(0, 0.5, u);
  }, { wrapV: true, shade: true, orient: true });
}

/** Pitanga (estrela): monte baixo e gordinho de 7 gomos, largo na base, que fecha numa pontinha puxada para cima. */
function starGeometry(D) {
  const lobes = 7;
  const r = 0.086;
  const h = 0.092;
  return surface(D < 0.5 ? 7 : D < 1 ? 9 : 15, lobes * (D < 0.5 ? 2 : D < 1 ? 3 : 6), (u, v, p) => {
    const a = v * TAU;
    const w = smooth(0.55, 1, u);
    const body = Math.pow(1 - u, 0.5) * (1 - w) + Math.pow(1 - u, 1.5) * w * 0.95;
    const foot = 1 + 0.07 * Math.pow(1 - u, 8);
    const k = gomo(a, lobes, 0.5); // crista larga e redonda, vale estreito
    const rad = r * body * foot * (1 - (0.27 - 0.09 * u) * (1 - k));
    const tw = a + u * 0.4; // leve torção ao puxar o bico
    p.set(rad * Math.cos(tw), h * u, rad * Math.sin(tw));
    return (0.5 + 0.5 * k) * (0.78 + 0.22 * smooth(0, 0.3, u));
  }, { wrapV: true, shade: true, orient: true });
}

/**
 * Concha: uma gota deitada — cabeça redonda, gorda e alta, cheia de gomos, que afina numa cauda comprida
 * rente à cobertura (eixo x = sentido em que o bico anda). A cabeça da seguinte cobre essa cauda.
 */
function shellGeometry(D) {
  const L = 0.27;
  const rmax = 0.08;
  const lobes = 8;
  const hu = 0.17; // até aqui é a cabeça (uma calota redonda)
  return surface(D < 0.5 ? 8 : D < 1 ? 12 : 22, lobes * (D < 1 ? 2 : 4), (u, v, p) => {
    const a0 = v * TAU;
    const a = a0 + u * 0.45; // a malha gira junto com os gomos: crista e vale sempre caem num vértice
    const head = u < hu ? Math.sqrt(Math.max(0, 1 - (1 - u / hu) ** 2)) : 1;
    const t = u < hu ? 0 : (u - hu) / (1 - hu);
    const tail = Math.pow(1 - t, 1.55) * (1 + 0.5 * t); // gorda logo depois da cabeça, bem fina no fim
    const rad = rmax * head * (0.04 + 0.96 * tail);
    const k = gomo(a0, lobes, 0.6); // os gomos acompanham o afinamento até a cauda
    const s = 1 - 0.27 * (1 - k);
    const squash = 0.98 - 0.34 * u;
    const cy = rad * squash * 0.82 + 0.016 * head * (1 - t) * (1 - t); // a cabeça monta sobre a cauda da anterior
    p.set(-0.07 + L * (u < hu ? (u / hu) * 0.26 : 0.26 + 0.74 * t), Math.max(0, cy + rad * s * squash * Math.sin(a)), rad * s * Math.cos(a) * 1.06);
    return (0.5 + 0.5 * k) * (0.76 + 0.24 * smooth(-0.3, 0.5, Math.sin(a))) * (1 - 0.22 * smooth(0.55, 1, u));
  }, { wrapV: true, shade: true, orient: true });
}

/**
 * Roseta (bico 1M): um cordão de 6 gomos enrolado em espiral do centro para fora, quase duas voltas.
 * Como a mão gira e o bico não, os gomos dão uma volta em torno do cordão a cada volta da espiral —
 * é isso que desenha as "pétalas" de uma roseta de verdade.
 */
function rosetteGeometry(D) {
  const turns = 1.85;
  const R = 0.117;
  const rr = 0.041;
  const lobes = 6;
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  const P = new THREE.Vector3();
  const Q = new THREE.Vector3();
  const at = (t, out) => {
    const ang = t * turns * TAU;
    const tuck = smooth(0.86, 1, t); // a ponta final se encosta na volta de dentro
    const rad = 0.008 + (R - 0.008) * Math.pow(t, 0.92) - 0.022 * tuck;
    return out.set(rad * Math.cos(ang), rr * 0.86 * (1 + 0.42 * (1 - t) ** 1.6) * (0.45 + 0.55 * smooth(0, 0.1, t)) - rr * 0.35 * tuck, rad * Math.sin(ang));
  };
  return surface(D < 0.5 ? 25 : D < 1 ? 40 : 64, lobes * (D < 1 ? 2 : 4), (u, v, p) => {
    at(u, P);
    at(Math.min(1, u + 0.003), T);
    at(Math.max(0, u - 0.003), Q);
    T.sub(Q).normalize();
    N.copy(Y).addScaledVector(T, -Y.dot(T)).normalize();
    B.crossVectors(T, N);
    const a0 = v * TAU;
    const a = a0 + u * turns * TAU * 0.9; // a malha gira junto com os gomos (crista e vale sempre num vértice)
    const nose = Math.pow(smooth(0, 0.09, u), 0.6); // o cordão nasce fino no miolo, por baixo da primeira volta
    const end = u > 0.84 ? Math.pow(Math.max(0, 1 - (u - 0.84) / 0.16), 0.8) : 1;
    const k = gomo(a0, lobes);
    const rad = rr * nose * end * (1 - 0.4 * (1 - k));
    p.copy(P).addScaledVector(B, rad * Math.cos(a)).addScaledVector(N, rad * Math.sin(a) * 0.92);
    if (p.y < 0) p.y = 0;
    // sombra assada: fundo dos gomos, parte de baixo do cordão (o vão entre as voltas) e o miolo
    return (0.46 + 0.54 * k) * (0.56 + 0.44 * smooth(-0.6, 0.45, Math.sin(a))) * (0.8 + 0.2 * smooth(0, 0.3, u));
  }, { wrapV: true, shade: true, orient: true });
}

/**
 * Folha de bico (352/67, o bico com um entalhe em V). Eixo x = para onde o bico foi puxado.
 *  - contorno de folha: calcanhar arredondado, ombros largos a ~30% do comprimento e, dali, um estreitamento
 *    em curva até uma ponta fina e um pouco alongada (comprimento ≈ 1,9 × largura);
 *  - seção: duas asas que se encontram numa nervura central alta (o V do bico), com um sulco de cada lado
 *    dela e as bordas caindo um pouco — um "livro aberto" visto de frente;
 *  - corpo ondulado: três ondas atravessadas (o aperto ritmado da mão), fortes na base e sumindo na ponta,
 *    que também ondulam a borda vista de cima;
 *  - carnuda na base, fina na ponta, levemente arqueada e com a ponta puxada um tico para o lado.
 * A malha tem vértices exatamente na nervura, nos sulcos e nas cristas das ondas: no celular (240 triângulos)
 * a nervura e as três ondas continuam lá. A sombra dos sulcos e dos vãos entre ondas vem pintada nos vértices.
 */
function pipedLeafGeometry(D) {
  const len = 0.19;
  const half = 0.053;
  const thick = 0.036;
  const waves = 3;
  const shoulder = 0.3;
  // contorno da seção: [posição na largura (−1…1), 1 = face de cima · 0 = avesso]
  const ring =
    D < 1
      ? [[-1, 1], [-0.6, 1], [-0.2, 1], [0, 1], [0.2, 1], [0.6, 1], [1, 1], [1, 0], [0, 0], [-1, 0]]
      : [[-1, 1], [-0.84, 1], [-0.52, 1], [-0.19, 1], [0, 1], [0.19, 1], [0.52, 1], [0.84, 1], [1, 1], [1, 0], [0.5, 0], [0, 0], [-0.5, 0], [-1, 0]];
  const nv = ring.length;
  return surface(D < 0.5 ? 8 : D < 1 ? 12 : 24, nv, (u, v, p) => {
    const [side, top] = ring[Math.round(v * nv) % nv];
    const across = Math.abs(side);
    // largura ao longo da folha
    let outline;
    if (u <= shoulder) outline = Math.pow(Math.max(0, 1 - ((shoulder - u) / shoulder) ** 2), 0.5);
    else {
      const t = (u - shoulder) / (1 - shoulder);
      outline = (1 - Math.pow(t, 1.7)) * (1 - 0.35 * smooth(0.6, 1, t));
    }
    // ondas atravessadas: fortes perto da base, somem na ponta
    const swell = Math.pow(1 - u, 1.2) * smooth(0, 0.14, u);
    const wave = Math.sin(TAU * waves * u) * swell;
    const w = half * outline * (1 + 0.13 * wave);
    // espessura: carnuda na base (calcanhar redondo), fina na ponta
    const heel = u < 0.1 ? Math.sqrt(Math.max(0, 1 - (1 - u / 0.1) ** 2)) : 1;
    const body = thick * heel * (1 - 0.74 * Math.pow(u, 1.2));
    // seção: asa abaulada que cai na borda + nervura alta − sulco ao lado dela
    const wing = 1 - Math.pow(across, 2.2);
    const vein = Math.exp(-((across / 0.1) ** 2));
    const groove = Math.exp(-(((across - 0.2) / 0.1) ** 2));
    const arch = 0.003 + 0.02 * Math.sin(Math.PI * Math.pow(u, 0.8)) * (1 - 0.35 * u); // corpo levemente arqueado
    // a borda tem espessura própria (creme, não papel): a face de cima fica 0,4 × o corpo acima do avesso
    const y = top
      ? arch + body * (0.4 + 0.5 * wing + 0.5 * vein - 0.22 * groove) + 0.02 * wave * Math.pow(across, 1.1) * heel
      : arch - body * 0.08 * (1 - side * side);
    p.set(u * len, Math.max(0, y), side * w + 0.012 * u * u * u);
    if (!top) return 0.7;
    const dip = Math.max(0, -Math.sin(TAU * waves * u)) * swell; // vão entre duas ondas
    return (0.8 + 0.2 * vein + 0.06 * wing) * (1 - 0.3 * groove) * (1 - 0.42 * dip * Math.pow(across, 0.6)) * (0.82 + 0.18 * smooth(0, 0.16, u)) * (1 - 0.1 * Math.pow(across, 4));
  }, { wrapV: true, shade: true, orient: true });
}

/**
 * Corda: dois cordões torcidos um no outro. Cada peça é meio passo da torção (a seção de dois gomos dá meia
 * volta), então, emendadas em fila, formam um cordão contínuo. Eixo x = ao longo da borda.
 */
function ropeGeometry(D) {
  const L = 0.14;
  const rr = 0.043;
  return surface(D < 1 ? 6 : 10, D < 1 ? 10 : 16, (u, v, p) => {
    const a0 = v * TAU;
    const a = a0 + u * Math.PI; // a malha gira com a torção
    const k = Math.pow(Math.abs(Math.cos(a0)), 0.8); // 1 no alto de cada cordão, 0 no encontro dos dois
    const rad = rr * (0.7 + 0.3 * k);
    p.set((u - 0.5) * L * 1.06, Math.max(0, rr * 0.82 + rad * Math.sin(a)), rad * Math.cos(a));
    return (0.55 + 0.45 * k) * (0.78 + 0.22 * smooth(-0.4, 0.5, Math.sin(a)));
  }, { wrapV: true, shade: true, orient: true });
}

/** Zigue-zague: um cordão de bico pitanga que vai e vem. Cada peça é um vai e vem completo (emenda na seguinte). */
function zigzagGeometry(D) {
  const L = 0.13;
  const amp = 0.042;
  const rr = 0.03;
  const lobes = D < 1 ? 4 : 5;
  const T = new THREE.Vector3();
  const B = new THREE.Vector3();
  return surface(D < 1 ? 10 : 18, lobes * (D < 1 ? 2 : 3), (u, v, p) => {
    const a = v * TAU;
    const ph = u * TAU;
    T.set(L, 0, amp * TAU * Math.cos(ph)).normalize();
    B.crossVectors(T, Y); // lado
    const k = gomo(a, lobes);
    const rad = rr * (1 - 0.3 * (1 - k));
    const cz = amp * Math.sin(ph);
    p.set((u - 0.5) * L * 1.04, 0, cz).addScaledVector(B, rad * Math.cos(a));
    p.y = Math.max(0, rr * 0.8 + rad * Math.sin(a) * 0.92);
    return (0.52 + 0.48 * k) * (0.76 + 0.24 * smooth(-0.4, 0.5, Math.sin(a)));
  }, { wrapV: true, shade: true, orient: true });
}

/**
 * Babado (bico pétala): uma fita de creme grossa na base e fina na ponta, que sobe inclinada para fora e ondula.
 * Cada peça é uma onda completa. Eixo x = ao longo da borda, z = para fora do bolo.
 */
function ruffleGeometry(D) {
  // Babado de bico pétala (104): uma fita de creme presa ao bolo pela base grossa, com a beira fina franzida em
  // ondas REDONDAS — a beira anda mais devagar nas subidas e mais depressa nas cristas, então cada onda é um
  // gomo largo em "U" (fita ondulada), e não um dente de serra. Uma peça = uma onda; emendadas, viram a fita.
  const L = 0.13;
  const h = 0.092;
  // contorno da seção: [altura 0…1, face (1 = de fora, -1 = de dentro)]
  const ring = [[0, 1], [0.3, 1], [0.62, 1], [0.86, 1], [1, 1], [0.86, -1], [0.62, -1], [0.3, -1], [0, -1]];
  const nv = ring.length;
  return surface(D < 0.5 ? 9 : D < 1 ? 12 : 20, nv, (u, v, p) => {
    const [t, face] = ring[Math.round(v * nv) % nv];
    const ph = u * TAU;
    const wave = Math.sin(ph);
    const free = Math.pow(t, 1.5); // a base não mexe; a beira ondula solta
    const thick = 0.022 * (1 - 0.8 * t) + 0.0045; // base gorda, beira fina mas arredondada
    // a beira avança e recua ao longo da fita (−sin 2φ): cristas largas e redondas, subidas curtas
    const along = (u - 0.5) * L * 1.03 - 0.0085 * Math.sin(2 * ph) * free;
    const out = 0.012 + t * 0.046 + 0.03 * free * wave; // inclina para fora e a beira ondula
    // a beira fecha em meia-cana (sem quina) e levanta um pouco nas cristas
    const top = h * (t - 0.035 * Math.pow(t, 6)) * (1 - 0.07 * wave * t);
    p.set(along, top, out + (face * thick) / 2);
    return (0.64 + 0.36 * Math.pow(t, 0.7)) * (1 - 0.22 * Math.max(0, -wave) * t) * (face > 0 ? 1 : 0.86);
  }, { wrapV: true, shade: true, orient: true });
}

/**
 * Pingo de tinta dourada: mancha chata (quase sem altura), de contorno irregular, levemente abaulada no meio
 * para pegar o brilho. kind 0/1 = pingos (dois contornos diferentes) · 2 = risco: gota comprida, com a cabeça
 * gorda numa ponta e o rabo fino na outra (eixo x = sentido em que a tinta voou). Fica no plano xz (y = para fora).
 */
function splatGeometry(kind, D) {
  const r = rng(700 + kind * 31);
  const n = kind === 2 ? (D < 1 ? 10 : 16) : D < 1 ? 10 : 16;
  const p0 = r() * TAU;
  const p1 = r() * TAU;
  const rim = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    if (kind === 2) {
      // gota: cabeça em +x, rabo afinando até −x
      const c = Math.cos(a);
      const w = 0.34 * Math.pow((1 + c) / 2, 0.55) + 0.045;
      rim.push([1.25 * c - 0.25, w * Math.sin(a) * (0.9 + r() * 0.2)]);
    } else {
      // pingo: redondo e liso, só de leve irregular; o segundo tipo tem um "dedo" que escorreu
      let rad = 0.9 + 0.09 * Math.sin(a * 2 + p0) + 0.06 * Math.sin(a * 3 + p1);
      if (kind === 1) rad += 0.5 * Math.pow(Math.max(0, Math.cos(a - p1)), 14);
      rim.push([rad * Math.cos(a), rad * Math.sin(a) * (kind === 1 ? 0.86 : 1)]);
    }
  }
  const pos = [0, 0.22, 0];
  const uv = [0.5, 0.5];
  rim.forEach(([x, z]) => {
    pos.push(x, 0, z);
    uv.push(0.5 + x * 0.3, 0.5 + z * 0.3);
  });
  const index = [];
  for (let i = 0; i < n; i++) index.push(0, 1 + ((i + 1) % n), 1 + i);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

/** Lacinho de creme: dois laços, o nó e duas pontas. Fica deitado na lateral (x = para os lados, y = para cima, z = para fora). */
function bowGeometry(D) {
  const parts = [];
  const tube = D < 1 ? 4 : 6;
  const seg = D < 1 ? 8 : 14;
  for (const sx of [-1, 1]) {
    // laço: uma gota que sai do nó, abre e volta
    parts.push(
      plain(
        surface(seg, tube, (u, v, p) => {
          const a = u * TAU;
          const b = v * TAU;
          const lx = 0.034 * (1 - Math.cos(a)) * 0.5 * 2; // 0 no nó, máximo na ponta do laço
          const ly = 0.02 * Math.sin(a) * (0.6 + 0.4 * Math.sin(a / 2));
          const rr = 0.0085 * (0.75 + 0.25 * Math.sin(a / 2));
          p.set(sx * (0.006 + lx) + rr * Math.cos(b) * 0.6, ly + rr * Math.cos(b) * 0.5 * Math.sign(Math.sin(a) || 1), 0.012 + rr * Math.sin(b) + 0.01 * Math.sin(a / 2));
        }, { wrapV: true, shade: () => 0.92 }),
      ),
    );
    // ponta que cai
    parts.push(
      plain(
        surface(D < 1 ? 3 : 5, tube, (u, v, p) => {
          const b = v * TAU;
          const rr = 0.008 * (1 - 0.7 * u);
          p.set(sx * (0.006 + u * 0.03) + rr * Math.cos(b), -0.006 - u * 0.05 + rr * Math.cos(b) * 0.3, 0.012 + rr * Math.sin(b));
        }, { wrapV: true, shade: () => 0.84 }),
      ),
    );
  }
  const knot = new THREE.SphereGeometry(0.012, D < 1 ? 6 : 10, D < 1 ? 4 : 7);
  knot.scale(1, 1.1, 0.8);
  knot.translate(0, 0, 0.016);
  parts.push(paint(plain(knot), 1, 1, 1));
  return mergeGeometries(parts);
}

function leafGeometry(len = 0.13, wid = 0.034, fold = 0.5) {
  return surface(12, 8, (u, v, p) => {
    const w = wid * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 0.85);
    const vv = v * 2 - 1;
    const ripple = Math.sin(u * 16) * 0.003 * Math.abs(vv);
    p.set(u * len, 0.006 + 0.02 * Math.sin(Math.PI * u) + fold * Math.abs(vv) * w * 0.7 + ripple - u * u * 0.012, vv * w);
  });
}

function strawberryGeometry(D = 1) {
  // eixo Y: ponta em -Y, folhinhas em +Y; UV v = 0 na ponta
  const pts = new THREE.SplineCurve([
    new THREE.Vector2(0.0005, -0.165),
    new THREE.Vector2(0.03, -0.155),
    new THREE.Vector2(0.068, -0.105),
    new THREE.Vector2(0.1, -0.035),
    new THREE.Vector2(0.114, 0.04),
    new THREE.Vector2(0.105, 0.1),
    new THREE.Vector2(0.075, 0.138),
    new THREE.Vector2(0.03, 0.15),
    new THREE.Vector2(0.0005, 0.146),
  ]).getPoints(segs(26, D, 14));
  return new THREE.LatheGeometry(pts, segs(26, D, 14));
}

function calyxGeometry(D = 1) {
  const parts = [];
  const leaves = 7;
  for (let i = 0; i < leaves; i++) {
    const g = surface(D < 1 ? 3 : 5, D < 1 ? 2 : 4, (u, v, p) => {
      const vv = v * 2 - 1;
      const w = 0.02 * Math.sin(Math.PI * Math.pow(u, 0.6)) * (1 - u * 0.3);
      p.set(0.012 + u * 0.075, 0.15 - u * u * 0.05 + 0.006 * Math.abs(vv), vv * w);
    });
    g.rotateY((i / leaves) * TAU + (i % 2) * 0.2);
    parts.push(plain(g));
  }
  const stem = new THREE.CylinderGeometry(0.006, 0.008, 0.035, 6);
  stem.translate(0, 0.165, 0);
  parts.push(plain(stem));
  return mergeGeometries(parts);
}

function blueberryGeometry(D = 1) {
  const body = new THREE.SphereGeometry(0.062, segs(18, D, 10), segs(14, D, 7));
  body.scale(1, 0.9, 1);
  const crown = new THREE.TorusGeometry(0.018, 0.007, D < 1 ? 4 : 6, D < 1 ? 8 : 12);
  crown.rotateX(Math.PI / 2);
  crown.translate(0, 0.052, 0);
  return mergeGeometries([paint(plain(body), 1, 1, 1), paint(plain(crown), 0.35, 0.35, 0.45)]);
}

function raspberryGeometry(D = 1) {
  const parts = [];
  const r = rng(404);
  const n = D < 1 ? 30 : 46;
  const grow = D < 1 ? 1.24 : 1;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const lat = Math.acos(1 - 1.72 * t); // do topo até quase a base
    const lon = i * 2.39996;
    const R = 0.062;
    const g = new THREE.SphereGeometry((0.0205 + r() * 0.004) * grow, D < 1 ? 5 : 7, D < 1 ? 3 : 5);
    g.translate(R * Math.sin(lat) * Math.cos(lon), R * Math.cos(lat) * 1.1 + 0.066, R * Math.sin(lat) * Math.sin(lon));
    parts.push(plain(g));
  }
  return mergeGeometries(parts);
}

function sprinkleGeometry(D = 1) {
  // no celular, um bastãozinho de 5 lados (20 triângulos): na tela ele tem poucos pixels
  const g = D < 1 ? new THREE.CylinderGeometry(0.0092, 0.0092, 0.054, 5, 1) : new THREE.CapsuleGeometry(0.0092, 0.038, 2, 6);
  g.rotateZ(Math.PI / 2);
  g.translate(0, 0.0092, 0);
  return g;
}

function confettiGeometry(D = 1) {
  const g = new THREE.CylinderGeometry(0.021, 0.021, 0.008, D < 1 ? 6 : 12);
  g.translate(0, 0.004, 0);
  return g;
}

function curlGeometry(D = 1) {
  const len = 0.19;
  return surface(segs(10, D, 5), segs(26, D, 14), (u, v, p) => {
    const a = v * TAU * 1.7 + u * 0.7;
    const rad = 0.03 - v * 0.013;
    p.set((u - 0.5) * len + Math.sin(v * 5) * 0.006, 0.031 + rad * Math.sin(a), rad * Math.cos(a));
  });
}

function shardGeometry() {
  return surface(4, 3, (u, v, p) => {
    const vv = v * 2 - 1;
    p.set((u - 0.5) * 0.11 + vv * 0.012, 0.004 + Math.sin(u * Math.PI) * 0.016 + vv * vv * 0.006, vv * (0.026 - u * 0.008));
  });
}

/**
 * Rosa de açúcar: botão fechado no meio e anéis de pétalas em concha, cada vez mais abertas,
 * com a borda virada para fora. Cada pétala passa por cima da vizinha, como telhas.
 */
function roseGeometry(D = 1) {
  const parts = [];
  const nu = D < 1 ? 5 : 7;
  const nv = D < 1 ? 5 : 8;
  const rings = [
    { n: 3, r0: 0.004, r1: 0.02, h: 0.128, span: 2.3, open: 0, curl: 0, off: 0, tone: 0.62 },
    { n: 3, r0: 0.012, r1: 0.04, h: 0.124, span: 1.5, open: 0.004, curl: 0.006, off: 0.5, tone: 0.74 },
    { n: 5, r0: 0.02, r1: 0.064, h: 0.112, span: 0.98, open: 0.01, curl: 0.012, off: 0.3, tone: 0.85 },
    { n: 5, r0: 0.026, r1: 0.088, h: 0.092, span: 0.9, open: 0.018, curl: 0.02, off: 0.8, tone: 0.94 },
    { n: 6, r0: 0.03, r1: 0.11, h: 0.064, span: 0.78, open: 0.025, curl: 0.028, off: 0.15, tone: 1 },
  ];
  rings.forEach((ring) => {
    for (let i = 0; i < ring.n; i++) {
      const phi = ((i + ring.off) / ring.n) * TAU;
      parts.push(
        plain(
          surface(nu, nv, (u, v, p) => {
            const vv = v * 2 - 1;
            // contorno da pétala: estreita na base, larga em cima, topo arredondado
            const wide = 0.25 + 0.75 * Math.sin((Math.PI / 2) * Math.min(1, u * 1.25));
            const a = phi + vv * ring.span * wide;
            const rad = ring.r0 + (ring.r1 - ring.r0) * Math.pow(u, 1.15) + ring.open * u * u + ring.curl * Math.pow(u, 5) + 0.006 * vv * u;
            const y = ring.h * Math.pow(u, 0.72) * (1 - 0.34 * vv * vv * u * u) - ring.curl * 0.8 * Math.pow(u, 6);
            p.set(rad * Math.cos(a), y + 0.003, rad * Math.sin(a));
            return ring.tone * (0.4 + 0.6 * Math.pow(u, 0.9)) * (1 - 0.12 * vv * vv);
          }, { shade: true }),
        ),
      );
    }
  });
  return mergeGeometries(parts);
}

function blossomGeometry() {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const g = surface(6, 6, (u, v, p) => {
      const vv = v * 2 - 1;
      const w = 0.036 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.62)), 0.75) * (1 - 0.18 * Math.pow(u, 6));
      p.set(0.008 + u * 0.07, 0.008 + 0.03 * u * u - 0.02 * vv * vv * u + 0.004 * Math.sin(u * 9), vv * w);
    }, { shade: (u) => 0.72 + 0.28 * Math.min(1, u * 1.6) });
    g.rotateY((i / 5) * TAU);
    parts.push(plain(g));
  }
  return mergeGeometries(parts);
}

function candleGeometry(h, D = 1) {
  const body = new THREE.CylinderGeometry(0.028, 0.028, h, segs(16, D, 10), 1, true);
  body.translate(0, h / 2, 0);
  const cap = new THREE.SphereGeometry(0.028, segs(16, D, 10), D < 1 ? 4 : 6, 0, TAU, 0, Math.PI / 2);
  cap.scale(1, 0.35, 1);
  cap.translate(0, h, 0);
  // a tampa usa um ponto claro da textura listrada
  const uv = cap.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.02, 0.02);
  return mergeGeometries([body, cap]);
}

function starShapeGeometry() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + Math.PI / 2;
    const r = i % 2 ? 0.45 : 1;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.05, bevelSegments: 2 });
  g.translate(0, 0, -0.05);
  return g;
}

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  return s;
}

/* ───────── Biblioteca (geometrias e materiais reaproveitados) ───────── */

/** Geometrias já construídas nesta sessão, por nível de detalhe: reabrir o personalizador ou trocar de bico não refaz nenhuma. */
const GEOS = new Map();

export function createDecorLibrary(tex, tier = { detail: 1, physical: true }) {
  const D = tier.detail;
  const mats = new Map();
  const used = new Set();
  const geo = (key, make) => {
    const k = `${key}|${D}`;
    if (!GEOS.has(k)) GEOS.set(k, make());
    const g = GEOS.get(k);
    used.add(g);
    return g;
  };
  // "de longe": bolo de andares fica menor na tela e leva muito mais peças de bico — cada peça usa a malha
  // um nível mais leve (no computador, a do celular; no celular, uma própria). Nesse tamanho a diferença não se vê.
  const piped = (key, make) => (far) => (far ? geo(`${key}~`, () => make(D / 2)) : geo(key, () => make(D)));
  const mat = (key, make) => {
    if (!mats.has(key)) mats.set(key, make());
    return mats.get(key);
  };
  // No celular, sem verniz nem brilho acetinado: o material fica bem mais barato de desenhar
  // (o brilho que o verniz dava vira uma superfície um pouco mais lisa).
  const P = (o) => {
    if (tier.physical) return new THREE.MeshPhysicalMaterial(o);
    const { clearcoat = 0, clearcoatRoughness, sheen, sheenRoughness, sheenColor, iridescence, iridescenceIOR, ...rest } = o;
    if (clearcoat > 0.2 && rest.roughness != null) rest.roughness = Math.max(0.08, rest.roughness * (1 - 0.45 * clearcoat));
    return new THREE.MeshStandardMaterial(rest);
  };
  const S = (o) => new THREE.MeshStandardMaterial(o);
  return {
    geo: {
      dot: piped('bead', beadGeometry),
      star: piped('star', starGeometry),
      shell: piped('shell', shellGeometry),
      rosette: piped('rosette', rosetteGeometry),
      pipedLeaf: piped('pipedLeaf', pipedLeafGeometry),
      rope: () => geo('rope', () => ropeGeometry(D)),
      zigzag: () => geo('zigzag', () => zigzagGeometry(D)),
      ruffle: piped('ruffle', ruffleGeometry),
      bow: () => geo('bow', () => bowGeometry(D)),
      fleck: () => geo('fleck', () => (D < 1 ? new THREE.OctahedronGeometry(1, 0) : new THREE.SphereGeometry(1, 6, 4)).scale(1, 0.22, 0.75)),
      splat: (kind) => geo(`splat${kind}`, () => splatGeometry(kind, D)),
      strawberry: () => geo('strawberry', () => strawberryGeometry(D)),
      calyx: () => geo('calyx', () => calyxGeometry(D)),
      blueberry: () => geo('blueberry', () => blueberryGeometry(D)),
      raspberry: () => geo('raspberry', () => raspberryGeometry(D)),
      sprinkle: () => geo('sprinkle', () => sprinkleGeometry(D)),
      confetti: () => geo('confetti', () => confettiGeometry(D)),
      pearl: () => geo('pearl', () => new THREE.SphereGeometry(1, D < 1 ? 8 : 12, D < 1 ? 6 : 8)),
      blob: () => geo('blob', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
      curl: () => geo('curl', () => curlGeometry(D)),
      shard: () => geo('shard', shardGeometry),
      rose: () => geo('rose', () => roseGeometry(D)),
      blossom: () => geo('blossom', blossomGeometry),
      leaf: () => geo('leaf', () => leafGeometry(0.15, 0.042, 0.4)),
      candle: (h) => geo(`candle${h.toFixed(2)}`, () => candleGeometry(h, D)),
      wick: () => geo('wick', () => new THREE.CylinderGeometry(0.0035, 0.0035, 0.034, 5).translate(0, 0.017, 0)),
      starShape: () => geo('starShape', starShapeGeometry),
      stick: () => geo('stick', () => new THREE.CylinderGeometry(0.008, 0.008, 1, 8).translate(0, 0.5, 0)),
    },
    mat: {
      // creme confeitado: fosco macio, com um leve brilho acetinado; a sombra dos gomos vem pintada nos vértices
      piping: () => mat('piping', () => P({ color: 0xffffff, roughness: 0.62, sheen: 0.4, sheenRoughness: 0.55, sheenColor: 0xffffff, vertexColors: true })),
      strawberry: () =>
        mat('strawberry', () => {
          const t = tex.strawberry();
          return P({ map: t.map, bumpMap: t.bump, bumpScale: 2.2, roughness: 0.34, clearcoat: 0.55, clearcoatRoughness: 0.25 });
        }),
      calyx: () => mat('calyx', () => S({ color: 0x4f8a2f, roughness: 0.7, side: THREE.DoubleSide })),
      blueberry: () => mat('blueberry', () => P({ color: 0x35447c, roughness: 0.52, sheen: 1, sheenRoughness: 0.4, sheenColor: 0x9db0e8, vertexColors: true })),
      raspberry: () => mat('raspberry', () => P({ color: 0xc8234a, roughness: 0.36, clearcoat: 0.45, clearcoatRoughness: 0.3 })),
      sprinkle: () => mat('sprinkle', () => S({ color: 0xffffff, roughness: 0.42 })),
      confetti: () => mat('confetti', () => S({ color: 0xffffff, roughness: 0.5 })),
      pearl: () => mat('pearl', () => P({ color: 0xfff6ec, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.1, iridescence: 0.75, iridescenceIOR: 1.35, sheen: 0.4, sheenColor: 0xffd9e6 })),
      gold: () => mat('gold', () => S({ color: 0xe6ba5c, metalness: 0.9, roughness: 0.26, emissive: 0x6b4a10, emissiveIntensity: 0.3 })),
      // tinta dourada (respingo): metal liso e bem brilhante, com um granulado fino que quebra o reflexo
      goldPaint: () => mat('goldPaint', () => S({ color: 0xf6cc6a, metalness: 0.62, roughness: 0.3, normalMap: tex.glitterNormal(), normalScale: new THREE.Vector2(0.5, 0.5), emissive: 0x9a6410, emissiveIntensity: 0.62, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
      glitter: () => mat('glitter', () => S({ color: 0xeec063, metalness: 0.82, roughness: 0.36, normalMap: tex.glitterNormal(), normalScale: new THREE.Vector2(0.9, 0.9), emissive: 0x7a5412, emissiveIntensity: 0.55 })),
      chocolate: () => mat('chocolate', () => P({ color: 0xffffff, roughness: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.35, side: THREE.DoubleSide })),
      petal: () => mat('petal', () => P({ color: 0xffffff, roughness: 0.62, sheen: 0.25, sheenRoughness: 0.5, sheenColor: 0xffffff, side: THREE.DoubleSide, vertexColors: true })),
      flowerCenter: () => mat('flowerCenter', () => S({ color: 0xf2c14e, roughness: 0.55 })),
      leaf: () => mat('leaf', () => S({ color: 0x6f9a55, roughness: 0.62, side: THREE.DoubleSide })),
      candle: (hex) => mat(`candle${hex}`, () => P({ map: tex.candle(hex), roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.4 })),
      wick: () => mat('wick', () => S({ color: 0x2a1c14, roughness: 0.9 })),
      stick: () => mat('stick', () => S({ color: 0xe7cfa0, roughness: 0.6 })),
      plaque: () => mat('plaque', () => P({ color: 0xfffaf3, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 })),
      // sombra de contato falsa sob os arranjos (no nível sem mapa de sombras)
      blob: () => mat('blob', () => new THREE.MeshBasicMaterial({ map: tex.contactShadow(), color: 0x3a1420, transparent: true, opacity: 0.24, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
      flame: () => mat('flame', () => new THREE.SpriteMaterial({ map: tex.flame(), transparent: true, depthWrite: false, toneMapped: false })),
      glow: () => mat('glow', () => new THREE.SpriteMaterial({ map: tex.glow(), transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, opacity: 0.55 })),
    },
    /** Para os módulos de decoração: geometria guardada por nível de detalhe · material guardado nesta cena. */
    shape: geo,
    custom: mat,
    physical: P,
    detail: D,
    tex,
    dispose() {
      // solta a memória de vídeo; os dados continuam guardados para a próxima visita à tela
      used.forEach((g) => g.dispose());
      used.clear();
      mats.forEach((m) => m.dispose());
      mats.clear();
    },
  };
}

/* ───────── Composição: quem fica onde no topo ───────── */

/**
 * Medidas de cada bico (1 = 10 cm, o tamanho real não muda com o tamanho do bolo):
 * r = meia largura da borda · step = distância entre peças (para se tocarem) · inset = recuo no topo (× r) ·
 * out = afastamento da lateral na base (× r) · lean = quanto a peça da base se apoia no canto bolo/prato.
 */
const PIPE = {
  bolinhas: { r: 0.064, step: 0.123, inset: 0.94, out: 0.62, lean: 0.3 },
  conchas: { r: 0.08, step: 0.165, inset: 0.92, out: 0.6, lean: 0.42 },
  estrelas: { r: 0.086, step: 0.158, inset: 0.94, out: 0.6, lean: 0.45 },
  rosetas: { r: 0.158, step: 0.276, inset: 0.93, out: 0.45, lean: 0.62, baseScale: 0.86 },
  folhas: { r: 0.06, step: 0.084, inset: 2.1, out: 0.2, lean: 0 },
  perolao: { r: 0.098, step: 0.188, inset: 0.94, out: 0.62, lean: 0.3, scale: 1.52 },
  corda: { r: 0.046, step: 0.138, inset: 0.95, out: 0.7, lean: 0.35, along: true },
  ziguezague: { r: 0.075, step: 0.13, inset: 0.98, out: 0.78, lean: 0.4, along: true },
  babado: { r: 0.05, step: 0.13, inset: 0.3, out: 0.12, lean: 0.95, topLean: 0.9, along: true, outward: true },
};
PIPE.vintage = PIPE.conchas; // o conjunto vintage usa conchas no topo e na base


/**
 * O que o distribuidor de decorações precisou adaptar neste bolo, em frases prontas para o painel.
 * adapted = alguma peça mudou de lugar, de quantidade ou de tamanho para caber · messages = o que dizer à pessoa
 * (ex.: "Reorganizamos para caber: macarons e brigadeiros dividem a coroa") · unfit = o que não coube de jeito
 * nenhum, com a sugestão (essas frases também vêm em messages, que é o que o painel mostra) · unfitIds = quem
 * não coube ('velas', 'topo', 'escrita' ou o id da decoração) · fit = { id: { got, want, p } }, quantas peças
 * ficaram e quantas a quantidade escolhida pedia (o preço cobra o que coube: pricing.js → billableConfig).
 * É barato: reaproveita o plano já calculado para o bolo que está na tela.
 */
export function decorNotes(config) {
  try {
    const found = plannedFor(config);
    if (!found?.m) return { adapted: false, messages: [], unfit: [] };
    const notes = (found.plan || decorLayout(config, found.m)).notes;
    return { adapted: Boolean(notes.adapted), messages: notes.messages.slice(), unfit: notes.unfit.slice(), unfitIds: (notes.unfitIds || []).slice(), fit: { ...(notes.fit || {}) } };
  } catch (err) {
    console.error('[personalizador] avisos das decorações', err);
    return { adapted: false, messages: [], unfit: [] };
  }
}

/**
 * A que altura fica o pé da plaquinha. Com velas de número (que ficam bem na frente dela) a plaquinha sobe,
 * para a mensagem aparecer por cima dos algarismos em vez de ficar escondida atrás deles.
 */
export function plaqueLiftOf(config) {
  const d = config?.decor || {};
  const numbered = (d.items || []).includes('velas') && d.candleStyle === 'numero' && /\d/.test(String(d.number ?? ''));
  return numbered ? 0.66 : 0.34;
}

const NO_PLAN = () => ({
  key: 'sem-plano',
  zones: {},
  plan: {},
  party: { plaque: null, topper: null, stars: [], candles: null, numbers: null, sparkler: null, text: null },
  notes: { adapted: false, messages: [], unfit: [], unfitIds: [], fit: {} },
  occ: null,
  edge: 0.03,
  necklace: 0,
  sides: [],
  fenceOut: 0,
  heights: { decor: 0, extra: 0, party: 0 },
  stage: {},
  centerTaken: false,
});

/**
 * Quem fica onde no bolo. As medidas da borda saem daqui; os lugares de cada peça vêm do distribuidor
 * (occupancy.js), que é calculado uma vez por configuração — todos os construtores leem o mesmo plano:
 *   plan[id] = { zone, pieces, regions, scale, unfit }  ·  party = plaquinha, estrelas, velas, escrita, nome
 *   occ = o que já está ocupado (os confeitos de cobertura consultam antes de cair)  ·  key = muda quando o plano muda
 */
export function decorLayout(config, m) {
  const items = config.decor.items;
  const has = (id) => items.includes(id);
  const style = config.piping.style;
  const combo = Boolean(getPiping(style)?.combo);
  const pipeTop = style !== 'liso' && (combo || config.piping.where !== 'base');
  const pipe = PIPE[style];
  // com a cerca de chocolate em volta, o bico que passaria da beira recua para dentro (não atravessa as barrinhas)
  const fenceIn = pipeTop && has('wafer') ? (style === 'folhas' ? 0.09 : style === 'babado' ? 0.085 : 0) : 0;
  // faixa da borda ocupada pelo bico (as peças esticam até uns 16% para fechar a volta sem vão)
  const border = pipeTop ? Math.max(pipe.r * 2 + 0.012, pipe.r * (pipe.inset + 1.2) + 0.004) + (style === 'folhas' ? fenceIn : 0) : 0.03;
  const rho = m.rMin;
  const topY = (m.y0 || 0) + m.Ht + (config.drip.on ? 0.017 : 0);
  const text = config.decor.message || '';
  const message = config.decor.messageMode === 'bico' ? '' : text; // plaquinha no palito
  const script = config.decor.messageMode === 'bico' ? text : ''; // escrita com bico no topo
  const opt = (id) => decorOptions(config, id);
  const named = Boolean(config.decor.topper?.text?.trim()); // topo personalizado (nome em acrílico)
  const plaqueLift = plaqueLiftOf(config);
  let alloc;
  try {
    alloc = allocate(config, m, { border, rho, topY, pipe, pipeTop, message, script, named, plaqueLift });
  } catch (err) {
    // nunca derruba o bolo: sem plano, ele aparece só com a cobertura e o bico
    console.error('[personalizador] distribuição das decorações', err);
    alloc = NO_PLAN();
  }
  // até onde (fração do raio) um anel de decoração pode ir sem encostar no bico
  const ringK = Math.max(0.35, Math.min(0.74, 1 - (border + 0.12) / rho));
  return {
    has,
    opt,
    pipeTop,
    pipe,
    border,
    fenceIn,
    rho,
    topY,
    message,
    script,
    named,
    plaqueLift,
    centerTaken: alloc.centerTaken,
    zones: alloc.zones,
    ringK,
    backFree: !message && !has('topo') && !named,
    plan: alloc.plan,
    party: alloc.party,
    occ: alloc.occ,
    edge: alloc.edge,
    necklace: alloc.necklace,
    sides: alloc.sides,
    fenceOut: alloc.fenceOut,
    heights: alloc.heights,
    stage: alloc.stage,
    notes: alloc.notes,
    key: alloc.key,
  };
}

/** Junta volumes ([[x, y, z, r, classe]]) aos que a peça declara (part.volumes), para o teste de sobreposição. */
function addVol(part, vol) {
  if (!part.volumes) part.volumes = [];
  if (!vol) return;
  for (let i = 0; i < vol.length; i++) part.volumes.push({ x: vol[i][0], y: vol[i][1], z: vol[i][2], r: vol[i][3], kind: vol[i][4] || 'solid' });
}

/** Há alguma peça neste lugar? (confeitos de cobertura consultam antes de cair; soft = outro confeito não conta) */
function taken(layout, x, y, z, r, pad = 0.004) {
  return layout.occ ? layout.occ.hit(x, y, z, r, pad, -1, true) : false;
}

/** Fator de fartura de uma decoração (0,6 · 1 · 1,5). */
export function quantityOf(ctx, id) {
  return getQuantity(ctx.layout.opt(id).qty)?.k || 1;
}

/**
 * Lugares para as peças de uma decoração, conforme o arranjo:
 *  'center'   um no meio e anéis em volta (até `count` peças)
 *  'crown'    coroa junto à borda, a volta inteira · 'left' / 'right'  meia-lua
 *  'scatter'  espalhadas pelo topo, sem se encostar
 *  'cascade'  cascata: nasce no topo, perto da frente, e desce a lateral em diagonal até o prato (todos os andares)
 * size = raio que cada peça ocupa · k = fartura. → [{ x, y, z, ox, oz, side, u, taper }]
 * (ox, oz) aponta para fora do bolo; side = true quando a peça fica na lateral (y já é a altura dela).
 */
export function decorSpots(ctx, zone, { size = 0.08, count = 10, k = 1, seed = 'spots' } = {}) {
  const { m, layout } = ctx;
  const r = rng(hashString(`${seed}${zone}${m.shape}${m.R}`));
  const out = [];
  const y0 = layout.topY;
  const room = Math.max(size, layout.rho - layout.border - size);
  const push = (x, z, more) => {
    const dx = x - m.center.x;
    const dz = z - m.center.z;
    const d = Math.hypot(dx, dz) || 1;
    out.push({ x, y: y0, z, ox: dx / d, oz: dz / d, side: false, u: 0.5, taper: 1, ...more });
  };
  if (zone === 'center') {
    const n = Math.max(1, Math.round(count * k));
    push(m.center.x, m.center.z, { ox: 0, oz: 1 });
    let ringR = size * 2.05;
    while (out.length < n && ringR <= room) {
      const per = Math.max(3, Math.floor((TAU * ringR) / (size * 2.08)));
      const ph = r() * TAU;
      for (let i = 0; i < per && out.length < n; i++) {
        const a = ph + (i / per) * TAU;
        push(m.center.x + Math.cos(a) * ringR, m.center.z + Math.sin(a) * ringR);
      }
      ringR += size * 1.95;
    }
    return out;
  }
  if (zone === 'scatter') {
    const n = Math.max(2, Math.round(count * k * 1.3));
    const pt = {};
    for (let tries = 0; tries < n * 30 && out.length < n; tries++) {
      randomTop(m, r, layout.border + size * 0.8, pt);
      if (out.every((q) => Math.hypot(q.x - pt.x, q.z - pt.z) > size * 2.05)) push(pt.x, pt.z);
    }
    return out;
  }
  if (zone === 'cascade') {
    const n = Math.max(4, Math.round(count * k * 1.25));
    const stack = m.stack || [m];
    const total = m.Htot ?? m.Ht;
    const a0 = Math.PI * 0.36; // nasce na frente, um pouco à direita
    const topN = Math.max(2, Math.round(n * 0.3));
    const pt = {};
    const fMax = Math.max(0.4, 1 - (layout.border + size * 0.9) / layout.rho); // sem invadir o bico da borda
    let ang = a0 - 0.24;
    let last = null;
    for (let i = 0; i < topN; i++) {
      const f = Math.min(fMax, 0.36 + (0.5 * (i + 1)) / topN);
      // cada peça fica a pelo menos um corpo de distância da anterior
      for (let tries = 0; tries < 14; tries++) {
        polarPoint(m, ang, f, pt);
        if (!last || Math.hypot(pt.x - last.x, pt.z - last.z) >= size * 2.02) break;
        ang += 0.07;
      }
      push(pt.x, pt.z, { u: (i / topN) * 0.3 });
      last = { x: pt.x, z: pt.z };
      ang += 0.12;
    }
    const sideN = n - topN;
    for (let i = 0; i < sideN; i++) {
      const t = (i + 0.6) / sideN;
      const y = total * (1 - t) * 0.94 + 0.03;
      const tier = stack.find((q) => y >= q.y0 && y <= q.y0 + q.Ht) || stack[0];
      const ang = a0 + 0.1 + t * 1.15 + (r() - 0.5) * 0.16;
      const d = rayHit(tier.frost, 0, 0, ang);
      const ox = Math.cos(ang);
      const oz = Math.sin(ang);
      out.push({ x: ox * (d + size * 0.35), y: y + (r() - 0.5) * 0.04, z: oz * (d + size * 0.35), ox, oz, side: true, u: 0.3 + 0.7 * t, taper: 1 - 0.25 * t });
    }
    return out;
  }
  // coroa ou meia-lua
  const ringK = Math.max(0.3, 1 - (layout.border + size + 0.02) / layout.rho);
  arcPoints(m, zone, ringK, (size * 2.12) / Math.pow(k, 0.55)).forEach((q) => out.push({ x: q.x, y: y0, z: q.z, ox: q.ox, oz: q.oz, side: false, u: q.u, taper: q.taper }));
  return out;
}

/** Faixas angulares das composições (0° = direita, 90° = frente, 180° = esquerda, 270° = fundo). */
const ARCS = {
  crown: [0, TAU],
  left: [Math.PI * 0.53, Math.PI * 1.47],
  right: [Math.PI * 1.53, Math.PI * 2.47],
};

/** Ponto do topo na direção theta (rad) a uma fração k do caminho até a borda plana. */
function polarPoint(m, theta, k, out = {}) {
  const d = rayHit(m.topFlat, m.center.x, m.center.z, theta) * k;
  out.x = m.center.x + Math.cos(theta) * d;
  out.z = m.center.z + Math.sin(theta) * d;
  out.d = d;
  return out;
}

/**
 * Pontos espaçados de `step` ao longo de um anel que acompanha o formato do bolo
 * (fração k do centro até a borda), entre os ângulos da zona. u vai de 0 a 1 ao longo do arco.
 */
function arcPoints(m, zone, k, step) {
  const [a0, a1] = ARCS[zone] || ARCS.crown;
  const full = zone === 'crown' || !ARCS[zone];
  const raw = [];
  const pt = {};
  let a = a0;
  let guard = 0;
  while (a < a1 - 1e-4 && guard++ < 400) {
    polarPoint(m, a, k, pt);
    raw.push({ x: pt.x, z: pt.z, theta: a, ox: Math.cos(a), oz: Math.sin(a) });
    a += step / Math.max(0.12, pt.d);
  }
  if (!full && raw.length) {
    // estica para terminar exatamente no fim do arco
    const span = a1 - a0;
    const used = raw[raw.length - 1].theta - a0 || 1;
    raw.forEach((p) => {
      const th = a0 + ((p.theta - a0) / used) * span;
      polarPoint(m, th, k, pt);
      p.x = pt.x;
      p.z = pt.z;
      p.theta = th;
      p.ox = Math.cos(th);
      p.oz = Math.sin(th);
    });
  }
  raw.forEach((p, i) => {
    p.u = full ? i / raw.length : raw.length === 1 ? 0.5 : i / (raw.length - 1);
    p.taper = full ? 1 : 0.7 + 0.3 * Math.sin(Math.PI * p.u);
  });
  return raw;
}

const INSETS = new WeakMap(); // contorno do topo recuado, por bolo e por recuo (calculado uma vez)
function insetTop(m, inset) {
  if (inset <= 0.001) return m.topFlat;
  let known = INSETS.get(m.topFlat);
  if (!known) INSETS.set(m.topFlat, (known = new Map()));
  const key = Math.round(inset * 200);
  // recuos grandes (borda de rosetas + o tamanho da peça) precisam do contorno "limpo", sem laços nos cantos
  if (!known.has(key)) known.set(key, inset > 0.13 ? cleanOffset(m.topFlat, -inset) : offsetPath(m.topFlat, -inset));
  return known.get(key);
}

function randomTop(m, r, inset, out = {}) {
  const b = m.bounds;
  let limit = insetTop(m, inset);
  if (!limit || limit.n < 3) limit = insetTop(m, Math.min(inset, 0.13));
  for (let i = 0; i < 40; i++) {
    out.x = b.minX + r() * (b.maxX - b.minX);
    out.z = b.minZ + r() * (b.maxZ - b.minZ);
    if (pointInPath(limit, out.x, out.z)) return out;
  }
  out.x = m.center.x;
  out.z = m.center.z;
  return out;
}

function topArea(m) {
  // área aproximada do topo (fórmula do polígono)
  const p = m.topFlat;
  let a = 0;
  for (let i = 0; i < p.n; i++) {
    const j = (i + 1) % p.n;
    a += p.x[i] * p.z[j] - p.x[j] * p.z[i];
  }
  return Math.abs(a) / 2;
}

/* ───────── Acabamento (bicos) ───────── */

/** Pontos da borda que precisam ter uma peça: as quatro quinas; no coração, o bico e a reentrância. */
function ringAnchors(ring, shape) {
  if (shape === 'round') return [];
  const idx = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < ring.n; i++) {
    minX = Math.min(minX, ring.x[i]);
    maxX = Math.max(maxX, ring.x[i]);
    minZ = Math.min(minZ, ring.z[i]);
    maxZ = Math.max(maxZ, ring.z[i]);
  }
  if (shape === 'heart') {
    const mid = (minZ + maxZ) / 2;
    let tip = 0;
    let notch = -1;
    for (let i = 0; i < ring.n; i++) {
      if (ring.z[i] > ring.z[tip]) tip = i;
      if (ring.z[i] < mid && (notch < 0 || Math.abs(ring.x[i]) < Math.abs(ring.x[notch]))) notch = i;
    }
    idx.push(tip);
    if (notch >= 0) idx.push(notch);
  } else {
    const hx = (maxX - minX) / 2 || 1;
    const hz = (maxZ - minZ) / 2 || 1;
    [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => {
      let best = 0;
      let top = -Infinity;
      for (let i = 0; i < ring.n; i++) {
        const v = (sx * ring.x[i]) / hx + (sz * ring.z[i]) / hz;
        if (v > top) {
          top = v;
          best = i;
        }
      }
      idx.push(best);
    });
  }
  return [...new Set(idx)].map((i) => ring.s[i]).sort((a, b) => a - b);
}

/**
 * Distribui as peças pela borda: uma em cada ponto obrigatório e as demais igualmente espaçadas entre eles.
 * k é quanto cada trecho ficou mais largo ou mais apertado que o passo ideal — a peça estica ou encolhe
 * esse tanto, e a borda fecha a volta sem vão nem sobreposição.
 */
function ringSlots(ring, shape, step) {
  const anchors = ringAnchors(ring, shape);
  if (!anchors.length) anchors.push(0);
  const out = [];
  anchors.forEach((a, i) => {
    const b = i + 1 < anchors.length ? anchors[i + 1] : anchors[0] + ring.length;
    const len = b - a;
    const n = Math.max(1, Math.round(len / step));
    for (let j = 0; j < n; j++) out.push({ s: a + (len * j) / n, k: len / n / step });
  });
  return out;
}

export function buildPiping(ctx) {
  const { config, m, lib, layout } = ctx;
  const style = config.piping.style;
  const part = newPart();
  part.volumes = [];
  if (style === 'liso') return part;
  const combo = style === 'vintage';
  const kind = combo ? 'conchas' : style; // o vintage usa conchas no topo e na base
  const spec = PIPE[kind];
  const stack = m.stack || [m];
  const geoOf = {
    bolinhas: lib.geo.dot,
    perolao: lib.geo.dot,
    conchas: lib.geo.shell,
    estrelas: lib.geo.star,
    rosetas: lib.geo.rosette,
    folhas: lib.geo.pipedLeaf,
    corda: lib.geo.rope,
    ziguezague: lib.geo.zigzag,
    babado: lib.geo.ruffle,
  }[kind];
  // os bicos não entram no passe de sombras: o relevo já vem sombreado nos vértices
  const far = stack.length > 1; // andares: muito mais peças, cada uma menor na tela (malha leve no celular)
  const batch = new Batch(geoOf(far), lib.mat.piping(), { cast: false, receive: true });
  const r = rng(hashString(`pipe${style}${m.shape}${m.R}`));
  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const up = new THREE.Vector3();
  const pt = {};
  const unit = spec.scale || 1;
  const fenced = config.decor.items.includes('wafer'); // a cerca de wafer cobre a lateral inteira
  const fenceIn = layout.fenceIn || 0;

  /**
   * Folhas: guirlanda de pares em V. Em cada par, uma folha é puxada para fora e um pouco para trás e a outra
   * para fora e um pouco para a frente (~19° cada), com os calcanhares sobrepostos; as pontas de pares vizinhos
   * apenas se encostam — lê-se como folhas, não como serra. No topo as pontas passam um pouco da borda e vergam;
   * na base ficam deitadas no prato. Ângulo, comprimento, largura e altura variam de leve de folha para folha.
   */
  const garland = (path, y, base, ledge = null) => {
    const cls = base ? 'pipebase' : 'pipe';
    ringSlots(path, m.shape, spec.step * 2).forEach(({ s, k }) => {
      if (ledge) {
        pathAt(path, s, pt);
        if (signedDist(ledge, pt.x + pt.nx * 0.16, pt.z + pt.nz * 0.16) < 0.02) return; // a folha não cabe no degrau aqui
      }
      const gap = Math.min(0.046, spec.step * 2 * k * 0.28);
      const open = 0.33 * Math.max(0.85, Math.min(1.15, k)); // pares mais afastados abrem um pouco mais
      for (let side = -1; side <= 1; side += 2) {
        pathAt(path, s + (side * gap) / 2, pt);
        tangent.set(pt.tx, 0, pt.tz);
        normal.set(pt.nx, 0, pt.nz);
        const a = open + (r() - 0.5) * 0.14;
        _x.copy(normal).multiplyScalar(Math.cos(a)).addScaledVector(tangent, side * Math.sin(a));
        _x.y = (base ? 0.07 : -0.06) + (r() - 0.5) * 0.06;
        frameQuat(_x, Y, _q);
        const len = 0.9 + r() * 0.2;
        const yy = y + (side > 0 ? 0.008 : 0.002);
        batch.add(pt.x, yy, pt.z, _q, [len, 0.94 + r() * 0.12, 0.95 + r() * 0.1], null, 0.1);
        // a folha: duas esferas ao longo dela (calcanhar gordo, ponta fina)
        _z.copy(_x).normalize();
        addVol(part, [
          [pt.x + _z.x * 0.055 * len, yy + 0.02 + _z.y * 0.055 * len, pt.z + _z.z * 0.055 * len, 0.052, cls],
          [pt.x + _z.x * 0.135 * len, yy + 0.015 + _z.y * 0.135 * len, pt.z + _z.z * 0.135 * len, 0.04, cls],
        ]);
      }
    });
  };

  const ring = (path, y, base, baseSize = spec.baseScale || 1, ledge = null) => {
    if (kind === 'folhas') return garland(path, y, base, ledge);
    const cls = base ? 'pipebase' : 'pipe';
    const size = base ? baseSize : 1;
    ringSlots(path, m.shape, spec.step * size).forEach(({ s, k }) => {
      pathAt(path, s, pt);
      // na base de um andar de cima, a peça precisa caber no degrau (no coração, o degrau estreita na reentrância)
      if (ledge && signedDist(ledge, pt.x, pt.z) < spec.r * size * 0.9) return;
      tangent.set(pt.tx, 0, pt.tz);
      normal.set(pt.nx, 0, pt.nz);
      const fit = Math.max(0.86, Math.min(1.16, k)) * size;
      const jit = 0.97 + r() * 0.06;
      // na base, a peça se apoia no canto entre o bolo e o prato, virada para fora
      // (no topo, o babado cai para fora da borda — com a cerca em volta, fica em pé)
      const lean = base ? spec.lean : fenced ? 0 : spec.topLean || 0;
      up.copy(Y).multiplyScalar(Math.cos(lean)).addScaledVector(normal, Math.sin(lean));
      if (kind === 'conchas' || spec.along) {
        // peças em fila, todas no mesmo sentido (a concha cobre a cauda da anterior; corda e babado se emendam)
        // (o babado tem lado de fora: o eixo dele é invertido para a onda cair para fora do bolo)
        frameQuat(spec.outward ? _x.copy(tangent).negate() : tangent, up, _q);
        const tall = spec.along ? 1 : jit * size;
        batch.add(pt.x, y, pt.z, _q, [fit, tall * size, tall * size], null, spec.r);
        if (kind === 'babado') {
          // fita ondulada: sobe 9 mm e abre até 9 mm para o lado de fora (que, inclinado, cai para baixo)
          const oy = 0.05 * Math.cos(lean) - 0.055 * Math.sin(lean);
          const on = 0.05 * Math.sin(lean) + 0.055 * Math.cos(lean);
          for (let q = -1; q <= 1; q += 2) {
            addVol(part, [[pt.x + pt.nx * on + pt.tx * q * 0.033 * fit, y + oy, pt.z + pt.nz * on + pt.tz * q * 0.033 * fit, 0.056, cls]]);
          }
        } else if (kind === 'conchas') {
          const rad = 0.086 * tall * size;
          addVol(part, [
            [pt.x + up.x * rad * 0.4 - pt.tx * 0.02 * fit, y + up.y * rad * 0.4, pt.z + up.z * rad * 0.4 - pt.tz * 0.02 * fit, rad, cls],
            [pt.x + pt.tx * 0.1 * fit + up.x * 0.02, y + up.y * 0.02, pt.z + pt.tz * 0.1 * fit + up.z * 0.02, 0.052 * tall * size, cls],
          ]);
        } else {
          // corda e zigue-zague: cordão contínuo → duas esferas por peça
          const rad = spec.r * 1.02;
          for (let q = -1; q <= 1; q += 2) {
            addVol(part, [[pt.x + pt.tx * q * 0.034 * fit + up.x * rad * 0.5, y + up.y * rad * 0.5, pt.z + pt.tz * q * 0.034 * fit + up.z * rad * 0.5, rad, cls]]);
          }
        }
      } else {
        _x.copy(tangent).applyAxisAngle(up, kind === 'rosetas' ? (r() - 0.5) * 0.5 : r() * TAU);
        frameQuat(_x, up, _q);
        const sc = fit * jit * unit;
        batch.add(pt.x, y, pt.z, _q, sc, null, spec.r);
        // bolinha, pitanga ou roseta: uma esfera do tamanho da peça, apoiada na cobertura
        const rad = (kind === 'estrelas' ? 0.092 : kind === 'rosetas' ? 0.158 : 0.064) * sc;
        const lift = kind === 'rosetas' ? 0.12 : 0.3;
        addVol(part, [[pt.x + up.x * rad * lift, y + up.y * rad * lift, pt.z + up.z * rad * lift, rad, cls]]);
      }
    });
  };

  // topo: em cima da borda do andar mais alto; base: no encontro de cada andar com o que está embaixo dele
  const where = combo ? 'both' : config.piping.where;
  if (where !== 'base') ring(cleanOffset(m.topFlat, -(spec.r * spec.inset + fenceIn)), layout.topY - 0.002, false);
  if (where !== 'top' && !fenced) {
    stack.forEach((t) => {
      // com calda, o bico da base encolhe para ficar abaixo das gotas (ou sai, se nem assim couber)
      const size = baseRingScale(config, t, spec);
      if (size) ring(cleanOffset(t.frost, spec.r * spec.out * size), t.y0 + (t.index ? 0.002 : -0.012), true, size, t.index ? stack[t.index - 1].topFlat : null);
    });
  }
  part.add(batch, m);

  if (combo && !fenced && !config.drip.on) {
    // Vintage (lambeth): guirlandas drapeadas em volta de cada andar, com um lacinho em cada encontro.
    // (com calda escorrendo, as guirlandas ficariam por cima das gotas: o conjunto fica só com as conchas)
    const lod = lib.detail < 1 ? (far ? 0 : 1) : far ? 1 : 2; // 0 = de longe no celular · 1 = celular / de longe no computador · 2 = computador
    const bead = lib.shape(far ? 'swagBead~' : 'swagBead', () => paint(new THREE.SphereGeometry(1, [6, 8, 12][lod], [4, 5, 8][lod]), 1, 1, 1));
    const beads = new Batch(bead, lib.mat.piping(), { cast: false, receive: true });
    const bows = new Batch(lib.geo.bow(), lib.mat.piping(), { cast: false, receive: true });
    stack.forEach((t) => {
      if (t.naked) return;
      const wall = offsetPath(t.frost, 0.004);
      const sideH = t.Ht - t.rf;
      const swags = Math.max(5, Math.round(wall.length / 0.6));
      const span = wall.length / swags;
      const yTop = t.y0 + sideH - 0.05;
      const sag = Math.min(0.3, sideH * 0.44);
      const drape = (depth, scale, phase) => {
        const rad = 0.03 * scale; // bolinhas encostadas umas nas outras: um cordão de pérolas pendurado
        const n = Math.max(6, Math.round((span + depth * 0.9) / (rad * 1.9)));
        for (let g = 0; g < swags; g++) {
          for (let i = 0; i < n; i++) {
            const x = (i + phase) / n;
            pathAt(wall, (g + x) * span, pt);
            tangent.set(pt.tx, 0, pt.tz);
            normal.set(pt.nx, 0, pt.nz);
            const by = yTop - depth * 4 * x * (1 - x);
            beads.add(pt.x + pt.nx * rad * 0.5, by, pt.z + pt.nz * rad * 0.5, null, [rad, rad, rad], null, 0.04);
            addVol(part, [[pt.x + pt.nx * rad * 0.5, by, pt.z + pt.nz * rad * 0.5, rad, 'swag']]);
          }
        }
      };
      drape(sag, 1, 0.5);
      if (lib.detail >= 1 || stack.length === 1) drape(sag * 0.5, 0.72, 0.5);
      for (let g = 0; g < swags; g++) {
        pathAt(wall, g * span, pt);
        tangent.set(-pt.tx, 0, -pt.tz); // eixo invertido: a frente do laço fica virada para fora do bolo
        frameQuat(tangent, Y, _q);
        const bx = pt.x + pt.nx * 0.004;
        const bz = pt.z + pt.nz * 0.004;
        bows.add(bx, yTop + 0.014, bz, _q, 1.7, null, 0.07);
        // lacinho: nó, duas alças e duas pontas
        addVol(part, [
          [bx + pt.nx * 0.025, yTop + 0.014, bz + pt.nz * 0.025, 0.034, 'swag'],
          [bx + pt.nx * 0.03 + pt.tx * 0.075, yTop + 0.02, bz + pt.nz * 0.03 + pt.tz * 0.075, 0.052, 'swag'],
          [bx + pt.nx * 0.03 - pt.tx * 0.075, yTop + 0.02, bz + pt.nz * 0.03 - pt.tz * 0.075, 0.052, 'swag'],
          [bx + pt.nx * 0.025 + pt.tx * 0.04, yTop - 0.055, bz + pt.nz * 0.025 + pt.tz * 0.04, 0.032, 'swag'],
          [bx + pt.nx * 0.025 - pt.tx * 0.04, yTop - 0.055, bz + pt.nz * 0.025 - pt.tz * 0.04, 0.032, 'swag'],
        ]);
      }
    });
    part.add(beads, m);
    part.add(bows, m);
  }
  return part;
}

/* ───────── Peças ───────── */

function newPart() {
  const group = new THREE.Group();
  return {
    group,
    batches: [],
    objects: [], // objetos avulsos: { object, angle, dist, rad }
    flames: [],
    owned: [], // geometrias, materiais e texturas exclusivos desta peça
    volumes: null, // esferas que a peça ocupa: [{ x, y, z, r, kind }] (teste de sobreposição)
    born: 0,
    add(batch, m) {
      const mesh = batch.build(m.center);
      if (mesh) {
        group.add(mesh);
        this.batches.push(batch);
      }
    },
    addObject(object, m, rad = 0.1) {
      group.add(object);
      const dx = object.position.x - m.center.x;
      const dz = object.position.z - m.center.z;
      this.objects.push({ object, angle: Math.atan2(dz, dx), dist: Math.hypot(dx, dz), rad, scale: object.scale.clone() });
    },
    dispose() {
      this.batches.forEach((b) => b.mesh?.dispose());
      this.owned.forEach((o) => o.dispose?.());
    },
  };
}

/** Sem mapa de sombras (celular), um arranjo no centro ganha uma mancha macia por baixo para não parecer solto. */
function groundBlob(ctx, part, x, z, radius) {
  if (ctx.tier?.shadows !== false || radius <= 0.05) return;
  const blob = new THREE.Mesh(ctx.lib.geo.blob(), ctx.lib.mat.blob());
  blob.position.set(x, ctx.layout.topY + 0.003, z);
  blob.scale.set(radius * 2.5, 1, radius * 2.5);
  blob.renderOrder = 1;
  part.addObject(blob, ctx.m, radius);
}

const BERRY_TINTS = ['#ffffff', '#fff1f1', '#ffe9e4'];

function addStrawberry(b, x, y, z, quat, s) {
  b.berry.add(x, y, z, quat, s, BERRY_TINTS[(b.count++ % 3)], 0.12 * s);
  b.calyx.add(x, y, z, quat, s, null, 0.12 * s);
}

/** Morango deitado, com a ponta para fora e para cima. */
function leanQuat(outX, outZ, lean, yawJitter, out = _q) {
  // eixo do morango: de -Y (ponta) a +Y (folhas). Queremos a ponta apontando para (out, cima).
  _y.set(-outX * Math.sin(lean), -Math.cos(lean), -outZ * Math.sin(lean)); // +Y do objeto (folhas)
  _x.set(-outZ, 0, outX).applyAxisAngle(Y, yawJitter);
  return frameQuat(_x, _y, out);
}

function buildFruits(ctx, part) {
  const { m, lib, layout } = ctx;
  const pl = layout.plan.frutas;
  part.volumes = [];
  if (!pl) return;
  const r = rng(hashString(`fruit${m.shape}${m.R}${pl.zone}`));
  const small = { cast: ctx.tier?.smallCastShadow !== false };
  const b = { berry: new Batch(lib.geo.strawberry(), lib.mat.strawberry()), calyx: new Batch(lib.geo.calyx(), lib.mat.calyx(), small), count: 0 };
  const blue = new Batch(lib.geo.blueberry(), lib.mat.blueberry(), small);
  const rasp = new Batch(lib.geo.raspberry(), lib.mat.raspberry(), small);
  // cada peça já vem com lugar, tamanho e inclinação decididos pelo distribuidor
  pl.pieces.forEach((p) => {
    if (p.t === 'U') {
      // morango em pé, ponta para cima
      _q.setFromAxisAngle(_x.set(1, 0, 0), Math.PI).premultiply(_q2.setFromAxisAngle(Y, r() * TAU));
      addStrawberry(b, p.x, p.y, p.z, _q, p.s);
    } else if (p.t === 'S') {
      leanQuat(p.ox, p.oz, p.lean, p.yaw);
      addStrawberry(b, p.x, p.y + 0.098 * p.s, p.z, _q, p.s);
    } else if (p.t === 'B') {
      _q.setFromEuler(new THREE.Euler(r() * 0.9 - 0.45, r() * TAU, r() * 0.9 - 0.45));
      blue.add(p.x, p.y + 0.05 * p.k, p.z, _q, p.k, r() < 0.3 ? '#c9d2ff' : '#ffffff', 0.065);
    } else if (p.t === 'R') {
      _q.setFromEuler(new THREE.Euler(r() * 0.5 - 0.25, r() * TAU, r() * 0.5 - 0.25));
      rasp.add(p.x, p.y, p.z, _q, p.k, null, 0.08);
    }
    addVol(part, p.vol);
  });
  if (pl.group && pl.blob) groundBlob(ctx, part, pl.group.x, pl.group.z, pl.blob + 0.12);
  part.add(b.berry, m);
  part.add(b.calyx, m);
  part.add(blue, m);
  part.add(rasp, m);
}

const ROSE_TINTS = ['#e4607f', '#ee7f9b', '#d44f72', '#f39fb2', '#fbd9e0'];

/** Tons de uma flor a partir da cor escolhida: a cor, mais clara, mais funda, e dois tons bem claros para as pequenas. */
export function flowerTints(hex) {
  if (!hex || hex.toLowerCase() === '#e4607f') return ROSE_TINTS;
  const base = new THREE.Color(hex);
  const mix = (to, k) => `#${base.clone().lerp(new THREE.Color(to), k).getHexString()}`;
  return [hex, mix('#ffffff', 0.2), mix('#3a0a18', 0.14), mix('#ffffff', 0.42), mix('#ffffff', 0.68)];
}

function buildFlowers(ctx, part) {
  const { m, lib, layout } = ctx;
  const pl = layout.plan.flores;
  part.volumes = [];
  if (!pl) return;
  const r = rng(hashString(`flower${m.shape}${m.R}${pl.zone}`));
  const rose = new Batch(lib.geo.rose(), lib.mat.petal());
  const small = { cast: ctx.tier?.smallCastShadow !== false };
  const blossom = new Batch(lib.geo.blossom(), lib.mat.petal(), small);
  const centers = new Batch(lib.geo.pearl(), lib.mat.flowerCenter(), small);
  const leaves = new Batch(lib.geo.leaf(), lib.mat.leaf(), small);
  const TINTS = flowerTints(layout.opt('flores').color);
  const side = new THREE.Vector3();
  pl.pieces.forEach((p) => {
    if (p.side) {
      // na lateral, cada flor "olha" para fora do bolo
      side.set(p.ox, 0.35, p.oz).normalize();
      if (p.t === 'leaf') {
        _x.set(-p.oz, 0.5, p.ox);
        frameQuat(_x, side, _q);
        leaves.add(p.x, p.y, p.z, _q, p.L, '#dcefc8', 0.1);
      } else {
        _x.set(-p.oz, 0, p.ox);
        frameQuat(_x, side, _q);
        if (p.t === 'rose') rose.add(p.x, p.y, p.z, _q, p.K, TINTS[Math.floor(r() * 4)], 0.14);
        else {
          blossom.add(p.x, p.y, p.z, _q, p.k, TINTS[3 + Math.floor(r() * 2)], 0.08);
          centers.add(p.x + p.ox * 0.016, p.y + 0.006, p.z + p.oz * 0.016, null, 0.015, null, 0.02);
        }
      }
    } else if (p.t === 'rose') {
      _y.set(p.tx * Math.sin(p.tilt), Math.cos(p.tilt), p.tz * Math.sin(p.tilt));
      _x.set(1, 0, 0).applyAxisAngle(Y, r() * TAU);
      frameQuat(_x, _y, _q);
      rose.add(p.x, p.y + 0.005, p.z, _q, p.K, TINTS[Math.floor(r() * 4)], 0.17 * p.K);
    } else if (p.t === 'blossom') {
      _q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.4, r() * TAU, (r() - 0.5) * 0.4));
      blossom.add(p.x, p.y + 0.004, p.z, _q, p.k, r() < 0.5 ? '#ffffff' : TINTS[3 + Math.floor(r() * 2)], 0.075 * p.k);
      centers.add(p.x, p.y + 0.016 * p.k, p.z, null, 0.014 * p.k, null, 0.02);
    } else if (p.t === 'leaf') {
      _x.set(Math.cos(p.a), 0.12, Math.sin(p.a));
      frameQuat(_x, Y, _q);
      leaves.add(p.x, p.y, p.z, _q, p.L, p.tint ? '#ffffff' : '#dcefc8', 0.12);
    }
    addVol(part, p.vol);
  });
  if (pl.group && pl.blob) groundBlob(ctx, part, pl.group.x, pl.group.z, pl.blob);
  part.add(leaves, m);
  part.add(rose, m);
  part.add(blossom, m);
  part.add(centers, m);
}

const CHOC_TINTS = ['#3b1e0f', '#4a2614', '#5e3219', '#6f3f22'];

function buildShavings(ctx, part) {
  const { m, lib, layout } = ctx;
  const pl = layout.plan.raspas;
  part.volumes = [];
  if (!pl || !pl.regions.length) return;
  const r = rng(hashString(`shave${m.shape}${m.R}${pl.zone}`));
  const small = { cast: ctx.tier?.smallCastShadow !== false };
  const curls = new Batch(lib.geo.curl(), lib.mat.chocolate(), small);
  const shards = new Batch(lib.geo.shard(), lib.mat.chocolate(), small);
  const y0 = layout.topY;
  const regions = pl.regions;
  // a lasca inteira (as duas pontas) tem de cair dentro da área reservada às raspas
  const inside = (x, z, rad) => regions.some((g) => Math.hypot(x - g.x, z - g.z) + rad <= g.r);
  const euler = new THREE.Euler();
  const put = (x, z, lift, s) => {
    const curl = r() < 0.42;
    const k = s * (0.75 + r() * 0.5);
    const yaw = r() * TAU;
    euler.set((r() - 0.5) * (curl ? 0.5 : 1.0), yaw, (r() - 0.5) * (curl ? 0.5 : 1.0));
    _q.setFromEuler(euler);
    // meio comprimento da lasca e o eixo dela no plano
    const half = (curl ? 0.095 : 0.066) * k;
    const rad = (curl ? 0.036 : 0.03) * k;
    const ax = Math.cos(yaw);
    const az = -Math.sin(yaw);
    const ex = ax * (half - rad);
    const ez = az * (half - rad);
    if (!inside(x + ex, z + ez, rad) || !inside(x - ex, z - ez, rad)) return false;
    const tint = CHOC_TINTS[Math.floor(r() * CHOC_TINTS.length)];
    (curl ? curls : shards).add(x, y0 + lift, z, _q, curl ? [k, k, k] : [k * 1.2, k, k * 1.2], tint, 0.07);
    const yc = y0 + lift + (curl ? 0.031 * k : 0.012 * k);
    addVol(part, [
      [x + ex, yc, z + ez, rad, 'solid'],
      [x, yc, z, rad, 'solid'],
      [x - ex, yc, z - ez, rad, 'solid'],
    ]);
    return true;
  };
  const more = quantityOf(ctx, 'raspas');
  regions.forEach((g) => {
    if (g.mound) {
      // montinho: mais alto no meio, rareando para a beira
      const n = Math.round((26 + g.r * 70) * more);
      for (let i = 0; i < n; i++) {
        const a = r() * TAU;
        const d = Math.pow(r(), 0.75) * Math.max(0, g.r - 0.05);
        const h = Math.max(0, 1 - (d / g.r) ** 2) * Math.max(0, g.h - 0.075) * r();
        put(g.x + Math.cos(a) * d, g.z + Math.sin(a) * d, h, 1);
      }
    } else {
      // faixa junto à borda: lascas menores, deitadas
      const n = Math.round(9 * more);
      let got = 0;
      for (let i = 0; i < n * 4 && got < n; i++) {
        const a = r() * TAU;
        const d = Math.sqrt(r()) * Math.max(0, g.r - 0.035);
        if (put(g.x + Math.cos(a) * d, g.z + Math.sin(a) * d, r() * Math.max(0, g.h - 0.06), 0.62)) got++;
      }
    }
  });
  part.add(curls, m);
  part.add(shards, m);
}

const SPRINKLE_TINTS = ['#2e160a', '#3d1f0f', '#54301a', '#27120a'];
const CONFETTI_TINTS = ['#ff8fb3', '#ffd166', '#7fdcb0', '#7cc4ff', '#b79cff', '#ffffff', '#ff8c6b', '#d96b82'];

function scatter(ctx, part, { geometry, material, tints, perArea, perSide, flat, sideBand, seed, lift = 0, id = '', rad = 0.026 }) {
  const { m, layout } = ctx;
  const more = id ? quantityOf(ctx, id) : 1;
  const r = rng(hashString(`${seed}${m.shape}${m.R}${m.n}`));
  const batch = new Batch(geometry, material, { cast: false, receive: true });
  const pt = {};
  const density = (ctx.tier?.density || 1) * more;
  // volumes (só para o teste): um por confeito, tirados do lote na hora em que forem pedidos
  Object.defineProperty(part, 'volumes', { configurable: true, get: () => batch.items.map((it) => ({ x: it.x, y: it.y + 0.01, z: it.z, r: rad * it.s[0], kind: 'coating' })) });
  // confeito de cobertura: cai em todo o topo livre — nunca debaixo de uma peça, da escrita ou do bico
  const nTop = Math.round(topArea(m) * perArea * density);
  for (let i = 0; i < nTop; i++) {
    randomTop(m, r, layout.border + 0.012 + rad, pt);
    if (flat) _q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.5, r() * TAU, (r() - 0.5) * 0.5));
    else _q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.3, r() * TAU, (r() - 0.5) * 0.3));
    const sc = 0.85 + r() * 0.35;
    const tint = tints[Math.floor(r() * tints.length)];
    if (taken(layout, pt.x, layout.topY + lift + 0.01, pt.z, rad * sc)) continue;
    batch.add(pt.x, layout.topY + lift, pt.z, _q, sc, tint, 0.03);
  }
  const normal = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const fenced = layout.has('wafer'); // atrás da cerca de chocolate a lateral não aparece
  (m.stack || [m]).forEach((t, ti) => {
    if (t.naked || !perSide || fenced) return;
    // na lateral de cada andar: mais concentrado embaixo, rareando para cima — só na faixa livre
    // (acima do bico da base, abaixo da calda e das guirlandas)
    const band = layout.sides?.[ti];
    const side = offsetPath(t.frost, 0.002);
    const sideH = t.Ht - t.rf - 0.04;
    const nSide = Math.round(side.length * perSide * density);
    for (let i = 0; i < nSide; i++) {
      pathAt(side, r() * side.length, pt);
      const y = t.y0 + 0.03 + Math.pow(r(), sideBand) * sideH * (sideBand > 1.5 ? 0.6 : 1);
      normal.set(pt.nx, 0, pt.nz);
      tangent.set(pt.tx, 0, pt.tz).applyAxisAngle(normal, r() * TAU);
      frameQuat(tangent, normal, _q);
      const sc = 0.85 + r() * 0.35;
      const tint = tints[Math.floor(r() * tints.length)];
      if (band && (y - rad * sc < band.lo || y + rad * sc > band.hi)) continue;
      if (taken(layout, pt.x, y + 0.01, pt.z, rad * sc)) continue;
      batch.add(pt.x, y, pt.z, _q, sc, tint, 0.03);
    }
  });
  part.add(batch, m);
}

function buildPearls(ctx, part) {
  const { m, lib, layout } = ctx;
  const r = rng(hashString(`pearl${m.shape}${m.R}`));
  const cast = ctx.tier?.smallCastShadow !== false;
  const white = new Batch(lib.geo.pearl(), lib.mat.pearl(), { cast, receive: true });
  const gold = new Batch(lib.geo.pearl(), lib.mat.gold(), { cast, receive: true });
  const pt = {};
  // volumes (só para o teste): um por pérola, tirados dos lotes na hora em que forem pedidos
  Object.defineProperty(part, 'volumes', { configurable: true, get: () => [...white.items, ...gold.items].map((it) => ({ x: it.x, y: it.y, z: it.z, r: it.rad, kind: 'coating' })) });
  // colar de pérolas rente ao bico (ou à borda): o distribuidor deixa essa faixa livre só para ele
  const ringPath = cleanOffset(m.topFlat, -(layout.border + 0.024));
  const n = Math.max(12, Math.round(ringPath.length / 0.062));
  for (let i = 0; i < n; i++) {
    pathAt(ringPath, (i / n) * ringPath.length, pt);
    const big = i % 3 === 0;
    const rad = big ? 0.026 : 0.016;
    const y = layout.topY + rad * 0.82;
    if (taken(layout, pt.x, y, pt.z, rad)) continue;
    (i % 6 === 3 ? gold : white).add(pt.x, y, pt.z, null, rad, null, rad);
  }
  const more = quantityOf(ctx, 'perolas');
  const fenced = layout.has('wafer');
  (m.stack || [m]).forEach((t, ti) => {
    if (t.naked || fenced) return;
    const band = layout.sides?.[ti];
    const side = t.frost;
    const sideH = t.Ht - t.rf;
    const count = Math.round(side.length * 13 * (ctx.tier?.density || 1) * more);
    for (let i = 0; i < count; i++) {
      pathAt(side, r() * side.length, pt);
      const up = Math.pow(r(), 2.4);
      const rad = 0.012 + (1 - up) * 0.014 * r() + 0.004;
      const y = t.y0 + 0.02 + up * sideH * 0.7;
      const isGold = r() < 0.2;
      const x = pt.x + pt.nx * rad * 0.55;
      const z = pt.z + pt.nz * rad * 0.55;
      // só na faixa livre da lateral (acima do bico da base, abaixo da calda e das guirlandas) e longe das peças
      if (band && (y - rad < band.lo || y + rad > band.hi)) continue;
      if (taken(layout, x, y, z, rad)) continue;
      (isGold ? gold : white).add(x, y, z, null, rad, null, rad);
    }
  });
  part.add(white, m);
  part.add(gold, m);
}

/** Respingo dourado (estilo de cobertura): salpicos de ouro comestível batidos com o pincel, mais juntos de um lado. */
function buildSplatter(ctx, part) {
  // Respingo dourado de verdade: tinta comestível batida com o pincel. Fica chapada na cobertura, em pingos de
  // tamanhos MUITO diferentes (muitos pontinhos, poucos pingos grandes), alguns riscos em gota no sentido em
  // que o pincel foi batido, mais juntos de um lado do bolo e rareando em volta.
  const { m, lib, layout } = ctx;
  part.volumes = []; // tinta: fica chapada na cobertura, não ocupa volume (as peças assentam por cima dela)
  const mat = lib.mat.goldPaint();
  const batches = [0, 1, 2].map((kind) => new Batch(lib.geo.splat(kind), mat, { cast: false, receive: false }));
  const r = rng(hashString(`splat${m.shape}${m.R}`));
  const pt = {};
  const normal = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const density = ctx.tier?.density || 1;
  // raio do pingo: de 0,7 mm a 6 mm, com a distribuição bem puxada para os pequenos
  const radius = () => 0.0045 * Math.pow(12, Math.pow(r(), 3));
  const place = (x, y, z, flick, side) => {
    const kindRoll = r();
    const rad = radius();
    if (kindRoll < 0.1) {
      // risco: gota comprida no sentido da batida
      const len = rad * (2.2 + r() * 2.6);
      _x.copy(tangent).applyAxisAngle(normal, flick + (r() - 0.5) * 0.5);
      frameQuat(_x, normal, _q);
      batches[2].add(x, y, z, _q, [len, rad * 0.5, rad * (0.55 + r() * 0.3)], null, 0.03);
    } else {
      _x.copy(tangent).applyAxisAngle(normal, r() * TAU);
      frameQuat(_x, normal, _q);
      batches[kindRoll < 0.6 ? 0 : 1].add(x, y, z, _q, [rad * (0.85 + r() * 0.4), rad * 0.5, rad * (0.75 + r() * 0.35)], null, 0.03);
      // os pingos grandes espirram pontinhos em volta
      if (rad > 0.03 && side) {
        const extra = 2 + Math.floor(r() * 4);
        for (let k = 0; k < extra; k++) {
          const a = r() * TAU;
          const d = rad * (1.5 + r() * 2.2);
          const tiny = 0.005 + r() * 0.006;
          _x.copy(tangent).applyAxisAngle(normal, a);
          batches[0].add(x + _x.x * d, y + _x.y * d, z + _x.z * d, _q, [tiny, tiny * 0.5, tiny], null, 0.02);
        }
      }
    }
  };
  (m.stack || [m]).forEach((t) => {
    if (t.style !== 'respingo' || t.naked) return;
    const side = offsetPath(t.frost, 0.0025);
    const sideH = t.Ht - t.rf;
    const n = Math.round(side.length * sideH * 58 * density);
    const focus = r() * side.length; // o lado em que o pincel bateu mais
    const flick = -0.9 + r() * 0.5; // sentido da batida (os riscos descem enviesados, todos mais ou menos iguais)
    // manchas de batida: três ou quatro pontos onde a tinta se concentrou
    const hits = Array.from({ length: 3 + Math.floor(r() * 2) }, () => ({ s: focus + (r() - 0.5) * side.length * 0.45, y: 0.15 + r() * 0.7 }));
    for (let i = 0; i < n; i++) {
      let at;
      let yk;
      if (r() < 0.5) {
        const hit = hits[Math.floor(r() * hits.length)];
        at = hit.s + (r() + r() + r() - 1.5) * 0.55;
        yk = hit.y + (r() + r() - 1) * 0.45;
      } else {
        at = r() * side.length;
        yk = r();
      }
      yk = Math.max(0.04, Math.min(0.97, yk));
      pathAt(side, at, pt);
      normal.set(pt.nx, 0, pt.nz);
      tangent.set(pt.tx, 0, pt.tz);
      place(pt.x, t.y0 + 0.02 + yk * (sideH - 0.04), pt.z, flick, true);
    }
    if (t.isTop) {
      normal.copy(Y);
      tangent.set(1, 0, 0);
      for (let i = 0; i < n * 0.24; i++) {
        randomTop(m, r, layout.border + 0.02, pt);
        place(pt.x, layout.topY + 0.0012, pt.z, flick, false);
      }
    }
  });
  batches.forEach((b) => b.items.length && part.add(b, m));
}

const CANDLE_COLORS = ['#f08fb0', '#f6c453', '#6fcfa8', '#6fb6f2', '#b497f0'];

function buildCandles(ctx, part) {
  const { m, lib, layout } = ctx;
  const plan = layout.party.candles;
  part.volumes = [];
  if (!plan || !plan.spots.length) return;
  // o distribuidor já escolheu os lugares: roda no meio, em volta do arranjo do centro ou em arco
  const { h, y0, spots } = plan;
  const n = spots.length;
  const wick = new Batch(lib.geo.wick(), lib.mat.wick(), { cast: false });
  const byColor = new Map();
  const r = rng(77 + n);
  let sx = 0;
  let sz = 0;
  spots.forEach((sp, i) => {
    const { x, z } = sp;
    sx += x / n;
    sz += z / n;
    const hex = CANDLE_COLORS[i % CANDLE_COLORS.length];
    if (!byColor.has(hex)) byColor.set(hex, new Batch(lib.geo.candle(h), lib.mat.candle(hex)));
    const lean = new THREE.Euler((r() - 0.5) * 0.05, r() * TAU, (r() - 0.5) * 0.05);
    _q.setFromEuler(lean);
    byColor.get(hex).add(x, y0, z, _q, 1, null, 0.04);
    _p.set(0, h + 0.004, 0).applyQuaternion(_q);
    wick.add(x + _p.x, y0 + _p.y, z + _p.z, _q, 1, null, 0.02);
    const glow = new THREE.Sprite(lib.mat.glow());
    glow.position.set(x + _p.x, y0 + _p.y + 0.06, z + _p.z);
    glow.scale.set(0.34, 0.34, 1);
    part.addObject(glow, m, 0.04);
    const flame = new THREE.Sprite(lib.mat.flame());
    flame.center.set(0.5, 0.08);
    flame.position.set(x + _p.x, y0 + _p.y + 0.022, z + _p.z);
    flame.scale.set(0.06, 0.125, 1);
    part.addObject(flame, m, 0.04);
    part.flames.push({ flame, glow, phase: r() * TAU, sx: 0.06, sy: 0.125 });
    addVol(part, sp.vol);
  });
  byColor.forEach((b) => part.add(b, m));
  part.add(wick, m);
  part.lightAt = new THREE.Vector3(sx, y0 + h + 0.12, sz);
}

function plaqueTexture(lines, w, h, px = 384) {
  // px = altura da textura (menor no celular); a largura acompanha a proporção da plaquinha
  const c = makeCanvas(Math.round((px * w) / h), px);
  const W = c.width;
  const H = c.height;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fffaf3';
  ctx.fillRect(0, 0, W, H);
  // filete dourado interno
  ctx.strokeStyle = '#d9b25a';
  ctx.lineWidth = H * 0.018;
  const pad = H * 0.07;
  const rr = H * 0.16;
  ctx.beginPath();
  ctx.moveTo(pad + rr, pad);
  ctx.arcTo(W - pad, pad, W - pad, H - pad, rr);
  ctx.arcTo(W - pad, H - pad, pad, H - pad, rr);
  ctx.arcTo(pad, H - pad, pad, pad, rr);
  ctx.arcTo(pad, pad, W - pad, pad, rr);
  ctx.closePath();
  ctx.stroke();
  // a plaquinha usa a letra da marca (a mesma sem serifa do site); escrita à mão é a opção "escrita no topo"
  const family = '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  let size = lines.length > 1 ? H * 0.36 : H * 0.56;
  const fits = () => {
    ctx.font = `700 ${size}px ${family}`;
    return Math.max(...lines.map((l) => ctx.measureText(l).width)) <= W - pad * 3.2;
  };
  while (!fits() && size > 12) size *= 0.94;
  const grad = ctx.createLinearGradient(0, H * 0.2, 0, H * 0.8);
  grad.addColorStop(0, '#a53d56');
  grad.addColorStop(1, '#6a2236');
  ctx.fillStyle = grad;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lh = size * 1.08;
  lines.forEach((line, i) => ctx.fillText(line, W / 2, H / 2 + (i - (lines.length - 1) / 2) * lh + size * 0.04));
  return texture(c, { repeat: false, srgb: true, aniso: 8 });
}

/** Plaquinha com a mensagem (e as estrelas do topo de festa, quando houver, ao lado dela). */
function buildMessageAndTopper(ctx, part) {
  const { m, lib, layout } = ctx;
  const y0 = layout.topY;
  const plaque = layout.message ? layout.party.plaque : null;
  part.volumes = [];

  if (plaque) {
    const { w, h, lines, lift } = plaque;
    const group = new THREE.Group();
    const shape = roundedRectShape(w, h, 0.05);
    const body = new THREE.ExtrudeGeometry(shape, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 2, curveSegments: 10 });
    body.translate(0, 0, -0.007);
    const edge = new THREE.Mesh(body, lib.mat.gold());
    edge.castShadow = true;
    const map = plaqueTexture(lines, w, h, ctx.tier?.plaquePx || 384);
    const faceMat = new THREE.MeshPhysicalMaterial({ map, roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.25 });
    const faceGeo = new THREE.ShapeGeometry(roundedRectShape(w - 0.012, h - 0.012, 0.045), 10);
    // UV da face: de 0 a 1 em toda a placa
    const uv = faceGeo.attributes.uv;
    const pos = faceGeo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / (w - 0.012) + 0.5, pos.getY(i) / (h - 0.012) + 0.5);
    const front = new THREE.Mesh(faceGeo, faceMat);
    front.position.z = 0.0125;
    const back = new THREE.Mesh(faceGeo, faceMat);
    back.rotation.y = Math.PI;
    back.position.z = -0.0125;
    const plate = new THREE.Group();
    plate.add(edge, front, back);
    plate.position.y = lift + h / 2;
    plate.rotation.x = -0.08;
    group.add(plate);
    [-1, 1].forEach((sgn) => {
      const stick = new THREE.Mesh(lib.geo.stick(), lib.mat.stick());
      stick.scale.set(1, lift + h * 0.5 + 0.06, 1);
      // os palitos ficam onde o distribuidor reservou (num topo pequeno, mais juntos: nunca em cima do bico)
      stick.position.set(sgn * plaque.stickX, -0.06, -0.012);
      stick.castShadow = true;
      group.add(stick);
    });
    group.position.set(plaque.x, y0, plaque.z);
    part.addObject(group, m, 0.14); // fica atrás do centro: só some se a fatia retirada chegar até ela
    part.plaque = { x: plaque.x, y: y0 + lift + h / 2, z: plaque.z, w, h }; // para a câmera encarar a plaquinha enquanto a pessoa digita
    part.owned.push(body, faceGeo, faceMat, map);
    addVol(part, plaque.vol);
  }

  const starsPlan = layout.has('topo') ? layout.party.stars : [];
  if (starsPlan.length) {
    // as estrelas ladeiam a plaquinha, vão para as pontas do nome em acrílico ou, sozinhas, ficam no centro
    const stars = new Batch(lib.geo.starShape(), lib.mat.glitter());
    const sticks = new Batch(lib.geo.stick(), lib.mat.stick());
    starsPlan.forEach(({ x, z, height, size, roll, vol }) => {
      // gira só no plano da estrela (as pontas ficam onde o distribuidor reservou)
      _q.setFromEuler(new THREE.Euler(0, 0, roll));
      stars.add(x, y0 + height, z, _q, [size, size, size * 0.5], null, 0.05);
      sticks.add(x, y0 - 0.05, z - 0.004, null, [1, height + 0.05 - size * 0.4, 1], null, 0.03);
      addVol(part, vol);
    });
    part.add(sticks, m);
    part.add(stars, m);
  }
}

/**
 * Constrói uma decoração. id: 'frutas' | 'flores' | 'raspas' | 'granulado' | 'confete' | 'perolas' | 'velas' | 'toppers'
 * ('toppers' reúne a plaquinha de mensagem e o topo de festa, que são compostos juntos).
 */
export function buildDecor(id, ctx) {
  const part = newPart();
  const { lib } = ctx;
  if (id === 'frutas') buildFruits(ctx, part);
  else if (id === 'flores') buildFlowers(ctx, part);
  else if (id === 'raspas') buildShavings(ctx, part);
  else if (id === 'perolas') buildPearls(ctx, part);
  else if (id === 'velas') buildCandles(ctx, part);
  else if (id === 'toppers') buildMessageAndTopper(ctx, part);
  else if (id === 'granulado') {
    scatter(ctx, part, { geometry: lib.geo.sprinkle(), material: lib.mat.sprinkle(), tints: SPRINKLE_TINTS, perArea: 135, perSide: 34, flat: true, sideBand: 2.2, seed: 'gran', id, rad: 0.029 });
  } else if (id === 'confete') {
    scatter(ctx, part, { geometry: lib.geo.confetti(), material: lib.mat.confetti(), tints: CONFETTI_TINTS, perArea: 78, perSide: 20, flat: true, sideBand: 1.3, seed: 'conf', id, rad: 0.022 });
  } else if (id === 'respingo') buildSplatter(ctx, part);
  return part;
}

/** Altura extra (acima do topo do bolo) ocupada pelas decorações — usada para enquadrar a câmera. */
export function decorHeight(config) {
  const items = config.decor.items;
  let h = config.piping.style !== 'liso' && (config.piping.where !== 'base' || config.piping.style === 'vintage') ? 0.11 : 0.02;
  // o que o distribuidor colocou de verdade (frutas, rosas, raspas, velas clássicas, plaquinha, estrelas)
  const planned = plannedHeights(config);
  if (planned) return Math.max(h, planned.decor);
  if (items.includes('frutas')) h = Math.max(h, 0.3);
  if (items.includes('flores')) h = Math.max(h, 0.16);
  if (items.includes('raspas')) h = Math.max(h, 0.14);
  if (items.includes('velas')) h = Math.max(h, 0.66);
  if (config.decor.message && config.decor.messageMode !== 'bico') h = Math.max(h, plaqueLiftOf(config) + (config.decor.message.length > 14 && config.decor.message.includes(' ') ? 0.6 : 0.44));
  if (items.includes('topo')) h = Math.max(h, 1.02);
  return h;
}

/**
 * Alturas (acima do topo do bolo) do que o distribuidor colocou, por família: { decor, extra, party }.
 * Usa o plano já calculado para a configuração; se ainda não houver, calcula.
 */
export function plannedHeights(config) {
  try {
    const found = plannedFor(config);
    if (!found?.m) return null;
    return (found.plan || decorLayout(config, found.m)).heights || null;
  } catch {
    return null;
  }
}

// Peças e ajudantes que os outros módulos de decoração (decor2.js, party.js) reaproveitam.
export { frameQuat, surface, paint, plain, segs, smooth, gomo, polarPoint, arcPoints, randomTop, topArea, newPart, groundBlob, leanQuat, roundedRectShape, addVol, taken };
