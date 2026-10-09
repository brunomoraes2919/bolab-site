// BOLAB — confeitaria procedural: bicos (acabamento) e decorações do bolo.
// Tudo é geometria gerada por código e desenhada em lotes (InstancedMesh) para rodar leve no celular.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, hashString, makeCanvas, texture } from './textures.js';
import { offsetPath, cleanOffset, pathAt, pointInPath, rayHit } from './geometry.js';

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
    this.items.forEach((it, i) => {
      it.angle = Math.atan2(it.z - center.z, it.x - center.x);
      it.dist = Math.hypot(it.x - center.x, it.z - center.z);
      if (it.color != null) mesh.setColorAt(i, _c.set(it.color));
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
  return surface(D < 1 ? 8 : 13, D < 1 ? 12 : 20, (u, v, p) => {
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
  return surface(D < 1 ? 9 : 15, lobes * (D < 1 ? 3 : 6), (u, v, p) => {
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
  return surface(D < 1 ? 12 : 22, lobes * (D < 1 ? 2 : 4), (u, v, p) => {
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
  return surface(D < 1 ? 40 : 64, lobes * (D < 1 ? 2 : 4), (u, v, p) => {
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
  return surface(D < 1 ? 12 : 24, nv, (u, v, p) => {
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
      dot: () => geo('bead', () => beadGeometry(D)),
      star: () => geo('star', () => starGeometry(D)),
      shell: () => geo('shell', () => shellGeometry(D)),
      rosette: () => geo('rosette', () => rosetteGeometry(D)),
      pipedLeaf: () => geo('pipedLeaf', () => pipedLeafGeometry(D)),
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
};

/**
 * Decide a posição de cada decoração de acordo com o que mais está no bolo, para que nada
 * se sobreponha: centro (velas, topo, plaquinha, ou um arranjo), meias-luas e coroa.
 */
export function decorLayout(config, m) {
  const items = config.decor.items;
  const has = (id) => items.includes(id);
  const pipeTop = config.piping.style !== 'liso' && config.piping.where !== 'base';
  const pipe = PIPE[config.piping.style];
  const border = pipeTop ? pipe.r * 2 + 0.012 : 0.03; // faixa da borda ocupada pelo bico
  const rho = m.rMin;
  const topY = m.Ht + (config.drip.on ? 0.017 : 0);
  const message = config.decor.message;
  const centerTaken = has('velas') || has('topo') || Boolean(message);
  const bulk = ['frutas', 'flores', 'raspas'].filter(has);
  const zones = {};
  if (bulk.length === 1) zones[bulk[0]] = centerTaken ? 'crown' : 'center';
  else if (bulk.length === 2) {
    zones[bulk[0]] = 'left';
    zones[bulk[1]] = 'right';
  } else if (bulk.length === 3) {
    zones.frutas = 'left';
    zones.flores = 'right';
    zones.raspas = 'center';
  }
  // até onde (fração do raio) um anel de decoração pode ir sem encostar no bico
  const ringK = Math.max(0.35, Math.min(0.74, 1 - (border + 0.12) / rho));
  return { has, pipeTop, pipe, border, rho, topY, message, centerTaken, zones, ringK, backFree: !message && !has('topo') };
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

function randomTop(m, r, inset, out = {}) {
  const b = m.bounds;
  const limit = inset > 0.001 ? offsetPath(m.topFlat, -Math.min(inset, 0.13)) : m.topFlat;
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
  if (style === 'liso') return part;
  const spec = PIPE[style];
  const geoOf = { bolinhas: lib.geo.dot, conchas: lib.geo.shell, estrelas: lib.geo.star, rosetas: lib.geo.rosette, folhas: lib.geo.pipedLeaf }[style];
  // os bicos não entram no passe de sombras: o relevo já vem sombreado nos vértices
  const batch = new Batch(geoOf(), lib.mat.piping(), { cast: false, receive: true });
  const r = rng(hashString(`pipe${style}${m.shape}${m.R}`));
  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const up = new THREE.Vector3();
  const pt = {};

  /**
   * Folhas: guirlanda de pares em V. Em cada par, uma folha é puxada para fora e um pouco para trás e a outra
   * para fora e um pouco para a frente (~19° cada), com os calcanhares sobrepostos; as pontas de pares vizinhos
   * apenas se encostam — lê-se como folhas, não como serra. No topo as pontas passam um pouco da borda e vergam;
   * na base ficam deitadas no prato. Ângulo, comprimento, largura e altura variam de leve de folha para folha.
   */
  const garland = (path, y, base) => {
    ringSlots(path, m.shape, spec.step * 2).forEach(({ s, k }) => {
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
        batch.add(pt.x, y + (side > 0 ? 0.008 : 0.002), pt.z, _q, [0.9 + r() * 0.2, 0.94 + r() * 0.12, 0.95 + r() * 0.1], null, 0.1);
      }
    });
  };

  const ring = (path, y, base) => {
    if (style === 'folhas') return garland(path, y, base);
    const size = base ? spec.baseScale || 1 : 1;
    ringSlots(path, m.shape, spec.step * size).forEach(({ s, k }, i) => {
      pathAt(path, s, pt);
      tangent.set(pt.tx, 0, pt.tz);
      normal.set(pt.nx, 0, pt.nz);
      const fit = Math.max(0.86, Math.min(1.16, k)) * size;
      const jit = 0.97 + r() * 0.06;
      // na base, a peça se apoia no canto entre o bolo e o prato, virada para fora
      const lean = base ? spec.lean : 0;
      up.copy(Y).multiplyScalar(Math.cos(lean)).addScaledVector(normal, Math.sin(lean));
      if (style === 'conchas') {
        // todas no mesmo sentido: a cabeça de cada uma cobre a cauda da anterior
        frameQuat(tangent, up, _q);
        batch.add(pt.x, y, pt.z, _q, [fit, jit * size, jit * size], null, spec.r);
      } else {
        _x.copy(tangent).applyAxisAngle(up, style === 'rosetas' ? (r() - 0.5) * 0.5 : r() * TAU);
        frameQuat(_x, up, _q);
        batch.add(pt.x, y, pt.z, _q, fit * jit, null, spec.r);
      }
    });
  };

  // topo: a peça fica em cima da borda do topo; base: no encontro do bolo com o prato
  if (config.piping.where !== 'base') ring(cleanOffset(m.topFlat, -spec.r * spec.inset), layout.topY - 0.002, false);
  if (config.piping.where !== 'top') ring(cleanOffset(m.frost, spec.r * spec.out * (spec.baseScale || 1)), -0.012, true);
  part.add(batch, m);
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
  const r = rng(hashString(`fruit${m.shape}${m.R}${layout.zones.frutas}`));
  const small = { cast: ctx.tier?.smallCastShadow !== false };
  const b = { berry: new Batch(lib.geo.strawberry(), lib.mat.strawberry()), calyx: new Batch(lib.geo.calyx(), lib.mat.calyx(), small), count: 0 };
  const blue = new Batch(lib.geo.blueberry(), lib.mat.blueberry(), small);
  const rasp = new Batch(lib.geo.raspberry(), lib.mat.raspberry(), small);
  const y0 = layout.topY;
  const zone = layout.zones.frutas;
  const placed = [];
  const free = (x, z, rad) => placed.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + rad);
  const blueAt = (x, z, y = y0, s = 1) => {
    _q.setFromEuler(new THREE.Euler(r() * 0.9 - 0.45, r() * TAU, r() * 0.9 - 0.45));
    const k = (0.86 + r() * 0.3) * s;
    blue.add(x, y + 0.05 * k, z, _q, k, r() < 0.3 ? '#c9d2ff' : '#ffffff', 0.065);
    placed.push({ x, z, r: 0.058 * k });
  };
  const raspAt = (x, z, y = y0, s = 1) => {
    _q.setFromEuler(new THREE.Euler(r() * 0.5 - 0.25, r() * TAU, r() * 0.5 - 0.25));
    const k = (0.9 + r() * 0.2) * s;
    rasp.add(x, y - 0.004, z, _q, k, null, 0.08);
    placed.push({ x, z, r: 0.078 * k });
  };
  const pt = {};

  if (zone === 'center') {
    const room = layout.rho - layout.border; // raio livre no centro do topo
    const pileR = Math.min(0.5 * layout.rho, room - 0.1);
    const cx = m.center.x;
    const cz = m.center.z;
    // morango central em pé, ponta para cima
    _q.setFromAxisAngle(_x.set(1, 0, 0), Math.PI).premultiply(_q2.setFromAxisAngle(Y, r() * TAU));
    addStrawberry(b, cx, y0 + 0.16, cz, _q, 1.12);
    placed.push({ x: cx, z: cz, r: 0.1 });
    let ringR = 0.195;
    while (ringR + 0.1 <= room) {
      const n = Math.max(5, Math.round((TAU * ringR) / 0.235));
      const phase = r() * TAU;
      const outerRing = ringR > 0.25;
      for (let i = 0; i < n; i++) {
        const a = phase + (i / n) * TAU + (r() - 0.5) * 0.12;
        const x = cx + Math.cos(a) * ringR;
        const z = cz + Math.sin(a) * ringR;
        if (outerRing && i % 2 === 1) {
          // nos anéis de fora, morangos se alternam com framboesas e mirtilos
          if (r() < 0.55) raspAt(x, z);
          else blueAt(x, z);
          blueAt(x + Math.cos(a + 1.2) * 0.1, z + Math.sin(a + 1.2) * 0.1);
          continue;
        }
        const lean = 1.05 + r() * 0.35;
        leanQuat(Math.cos(a), Math.sin(a), lean, (r() - 0.5) * 0.5);
        const s = 0.9 + r() * 0.2;
        addStrawberry(b, x, y0 + 0.098 * s, z, _q, s);
        placed.push({ x, z, r: 0.1 });
      }
      ringR += 0.225;
    }
    // frutas pequenas preenchendo os vãos e a borda do arranjo
    const edge = Math.max(0.12, Math.min(pileR + 0.12, room - 0.05));
    for (let i = 0; i < 260 && blue.items.length + rasp.items.length < 10 + pileR * 46; i++) {
      const a = r() * TAU;
      const d = Math.sqrt(r()) * edge;
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      const isRasp = r() < 0.38;
      if (!free(x, z, isRasp ? 0.07 : 0.05)) continue;
      if (isRasp) raspAt(x, z);
      else blueAt(x, z);
    }
    groundBlob(ctx, part, cx, cz, Math.min(room, pileR + 0.22));
    // um segundo andar de mirtilos sobre o centro
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.5;
      blueAt(cx + Math.cos(a) * 0.115, cz + Math.sin(a) * 0.115, y0 + 0.13);
    }
  } else {
    // coroa (volta inteira) ou meia-lua: morangos intercalados com frutas pequenas
    const pts = arcPoints(m, zone, layout.ringK, 0.2);
    pts.forEach((p, i) => {
      const { ox, oz, taper } = p;
      if (i % 2 === 0) {
        leanQuat(ox, oz, 1.0 + r() * 0.4, (r() - 0.5) * 0.6);
        const s = (0.88 + r() * 0.2) * taper;
        addStrawberry(b, p.x, y0 + 0.098 * s, p.z, _q, s);
        placed.push({ x: p.x, z: p.z, r: 0.1 * s });
      } else {
        const inward = 0.03 + r() * 0.03;
        const x = p.x - ox * inward;
        const z = p.z - oz * inward;
        if (r() < 0.5) {
          raspAt(x, z, y0, taper);
          blueAt(x - ox * 0.11 + (r() - 0.5) * 0.04, z - oz * 0.11 + (r() - 0.5) * 0.04, y0, taper);
        } else {
          blueAt(x + oz * 0.04, z - ox * 0.04, y0, taper);
          blueAt(x - oz * 0.05 - ox * 0.08, z + ox * 0.05 - oz * 0.08, y0, taper);
          if (r() < 0.6) blueAt(x - ox * 0.02, z - oz * 0.02, y0 + 0.075, taper * 0.9);
        }
      }
    });
  }
  part.add(b.berry, m);
  part.add(b.calyx, m);
  part.add(blue, m);
  part.add(rasp, m);
}

const ROSE_TINTS = ['#e4607f', '#ee7f9b', '#d44f72', '#f39fb2', '#fbd9e0'];

function buildFlowers(ctx, part) {
  const { m, lib, layout } = ctx;
  const r = rng(hashString(`flower${m.shape}${m.R}${layout.zones.flores}`));
  const rose = new Batch(lib.geo.rose(), lib.mat.petal());
  const small = { cast: ctx.tier?.smallCastShadow !== false };
  const blossom = new Batch(lib.geo.blossom(), lib.mat.petal(), small);
  const centers = new Batch(lib.geo.pearl(), lib.mat.flowerCenter(), small);
  const leaves = new Batch(lib.geo.leaf(), lib.mat.leaf(), small);
  const y0 = layout.topY;
  const zone = layout.zones.flores;
  const scale = Math.min(1.3, 0.74 + layout.rho * 0.42);

  const roseAt = (x, z, s, tiltDir) => {
    const tilt = 0.2 + r() * 0.2;
    _y.set(tiltDir.x * Math.sin(tilt), Math.cos(tilt), tiltDir.z * Math.sin(tilt));
    _x.set(1, 0, 0).applyAxisAngle(Y, r() * TAU);
    frameQuat(_x, _y, _q);
    rose.add(x, y0 + 0.005, z, _q, s * scale * 1.12, ROSE_TINTS[Math.floor(r() * 4)], 0.18 * s * scale);
    // duas ou três folhas saindo de baixo da rosa
    const n = 2 + (r() < 0.5 ? 1 : 0);
    const a0 = r() * TAU;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU + (r() - 0.5) * 0.7;
      _x.set(Math.cos(a), 0.12, Math.sin(a));
      frameQuat(_x, Y, _q);
      leaves.add(x + Math.cos(a) * 0.09 * s * scale, y0 + 0.004, z + Math.sin(a) * 0.09 * s * scale, _q, (0.9 + r() * 0.3) * scale, r() < 0.5 ? '#ffffff' : '#dcefc8', 0.12);
    }
  };
  const blossomAt = (x, z, s) => {
    _q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.4, r() * TAU, (r() - 0.5) * 0.4));
    const k = s * scale * (0.85 + r() * 0.3);
    blossom.add(x, y0 + 0.004, z, _q, k, r() < 0.5 ? '#ffffff' : ROSE_TINTS[3 + Math.floor(r() * 2)], 0.075 * k);
    centers.add(x, y0 + 0.016 * k, z, null, 0.014 * k, null, 0.02);
  };
  const dir = { x: 0, z: 0 };

  if (zone === 'center') {
    const cx = m.center.x;
    const cz = m.center.z;
    // buquê: uma rosa maior no meio, outras em volta e florzinhas preenchendo
    const room = layout.rho - layout.border;
    const spread = Math.min(0.21 * scale, room * 0.5);
    roseAt(cx - spread * 0.2, cz + spread * 0.1, 1.1, { x: 0, z: 0.4 });
    const around = room > 0.62 ? 4 : room > 0.4 ? 3 : 2;
    for (let i = 0; i < around; i++) {
      const a = 0.9 + (i / around) * TAU + (r() - 0.5) * 0.4;
      dir.x = Math.cos(a);
      dir.z = Math.sin(a);
      roseAt(cx + dir.x * spread * 1.18, cz + dir.z * spread * 1.18, 0.76 + r() * 0.14, dir);
    }
    groundBlob(ctx, part, cx, cz, Math.min(room, spread * 2.1));
    const smalls = 5 + around * 2;
    for (let i = 0; i < smalls; i++) {
      const a = (i / smalls) * TAU + r() * 0.5;
      const d = spread * (1.75 + r() * 0.55);
      if (d < room - 0.07) blossomAt(cx + Math.cos(a) * d, cz + Math.sin(a) * d, 1);
    }
  } else {
    // meia-lua de rosas (a maior no meio) com florzinhas nas pontas e entre elas
    const k = layout.ringK - 0.03;
    const arcZone = zone === 'crown' ? 'left' : zone;
    const pts = arcPoints(m, arcZone, k, 0.3);
    pts.forEach((p, i) => {
      dir.x = p.ox;
      dir.z = p.oz;
      const ends = i === 0 || i === pts.length - 1;
      if (ends && pts.length > 2) blossomAt(p.x, p.z, 0.9);
      else roseAt(p.x - p.ox * 0.03, p.z - p.oz * 0.03, 0.72 + 0.36 * Math.sin(Math.PI * p.u), dir);
    });
    arcPoints(m, arcZone, Math.max(0.3, k - 0.2), 0.21).forEach((p, i) => {
      if (i % 2 === 0) blossomAt(p.x, p.z, 0.8 + 0.2 * p.taper);
    });
    if (zone === 'crown') {
      // contraponto discreto do outro lado
      arcPoints(m, 'right', k, 0.24).forEach((p, i, all) => {
        if (i > 0 && i < all.length - 1 && i % 2 === 1) blossomAt(p.x, p.z, 0.85);
      });
    }
  }
  part.add(leaves, m);
  part.add(rose, m);
  part.add(blossom, m);
  part.add(centers, m);
}

const CHOC_TINTS = ['#3b1e0f', '#4a2614', '#5e3219', '#6f3f22'];

function buildShavings(ctx, part) {
  const { m, lib, layout } = ctx;
  const r = rng(hashString(`shave${m.shape}${m.R}${layout.zones.raspas}`));
  const small = { cast: ctx.tier?.smallCastShadow !== false };
  const curls = new Batch(lib.geo.curl(), lib.mat.chocolate(), small);
  const shards = new Batch(lib.geo.shard(), lib.mat.chocolate(), small);
  const y0 = layout.topY;
  const zone = layout.zones.raspas;
  const put = (x, z, lift, s) => {
    const curl = r() < 0.42;
    _q.setFromEuler(new THREE.Euler((r() - 0.5) * (curl ? 0.5 : 1.3), r() * TAU, (r() - 0.5) * (curl ? 0.5 : 1.3)));
    const k = s * (0.75 + r() * 0.5);
    (curl ? curls : shards).add(x, y0 + lift, z, _q, curl ? [k, k, k] : [k * 1.2, k, k * 1.2], CHOC_TINTS[Math.floor(r() * CHOC_TINTS.length)], 0.07);
  };
  if (zone === 'center') {
    const moundR = Math.min(0.48 * layout.rho, layout.rho - layout.border - 0.12);
    const n = Math.round(26 + moundR * 70);
    for (let i = 0; i < n; i++) {
      const a = r() * TAU;
      const d = Math.pow(r(), 0.75) * moundR;
      const h = Math.max(0, 1 - (d / moundR) ** 2) * (0.07 + moundR * 0.16) * r();
      put(m.center.x + Math.cos(a) * d, m.center.z + Math.sin(a) * d, h, 1);
    }
  } else {
    const pts = arcPoints(m, zone, layout.ringK - 0.02, 0.036);
    const pt2 = {};
    pts.forEach((p) => {
      const taper = zone === 'crown' ? 1 : Math.sin(Math.PI * p.u);
      const inward = r() * 0.24 * (0.35 + 0.65 * taper) * layout.rho;
      pt2.x = p.x - p.ox * inward + (r() - 0.5) * 0.03;
      pt2.z = p.z - p.oz * inward + (r() - 0.5) * 0.03;
      put(pt2.x, pt2.z, r() * 0.05 * taper, 0.9);
    });
  }
  part.add(curls, m);
  part.add(shards, m);
}

const SPRINKLE_TINTS = ['#2e160a', '#3d1f0f', '#54301a', '#27120a'];
const CONFETTI_TINTS = ['#ff8fb3', '#ffd166', '#7fdcb0', '#7cc4ff', '#b79cff', '#ffffff', '#ff8c6b', '#d96b82'];

function scatter(ctx, part, { geometry, material, tints, perArea, perSide, flat, sideBand, seed, lift = 0 }) {
  const { m, layout } = ctx;
  const r = rng(hashString(`${seed}${m.shape}${m.R}${m.n}`));
  const batch = new Batch(geometry, material, { cast: false, receive: true });
  const pt = {};
  const density = ctx.tier?.density || 1;
  const nTop = Math.round(topArea(m) * perArea * density);
  for (let i = 0; i < nTop; i++) {
    randomTop(m, r, layout.border + 0.012, pt);
    if (flat) _q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.5, r() * TAU, (r() - 0.5) * 0.5));
    else _q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.3, r() * TAU, (r() - 0.5) * 0.3));
    batch.add(pt.x, layout.topY + lift, pt.z, _q, 0.85 + r() * 0.35, tints[Math.floor(r() * tints.length)], 0.03);
  }
  if (!m.naked && perSide) {
    // na lateral: mais concentrado embaixo, rareando para cima
    const side = offsetPath(m.frost, 0.002);
    const sideH = m.Ht - m.rf - 0.04;
    const nSide = Math.round(side.length * perSide * density);
    const normal = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    for (let i = 0; i < nSide; i++) {
      pathAt(side, r() * side.length, pt);
      const y = 0.03 + Math.pow(r(), sideBand) * sideH * (sideBand > 1.5 ? 0.6 : 1);
      normal.set(pt.nx, 0, pt.nz);
      tangent.set(pt.tx, 0, pt.tz).applyAxisAngle(normal, r() * TAU);
      frameQuat(tangent, normal, _q);
      batch.add(pt.x, y, pt.z, _q, 0.85 + r() * 0.35, tints[Math.floor(r() * tints.length)], 0.03);
    }
  }
  part.add(batch, m);
}

function buildPearls(ctx, part) {
  const { m, lib, layout } = ctx;
  const r = rng(hashString(`pearl${m.shape}${m.R}`));
  const cast = ctx.tier?.smallCastShadow !== false;
  const white = new Batch(lib.geo.pearl(), lib.mat.pearl(), { cast, receive: true });
  const gold = new Batch(lib.geo.pearl(), lib.mat.gold(), { cast, receive: true });
  const pt = {};
  // colar de pérolas rente ao bico (ou à borda)
  const ringPath = offsetPath(m.topFlat, -(layout.border + 0.022));
  const n = Math.max(12, Math.round(ringPath.length / 0.062));
  for (let i = 0; i < n; i++) {
    pathAt(ringPath, (i / n) * ringPath.length, pt);
    const big = i % 3 === 0;
    const rad = big ? 0.026 : 0.016;
    (i % 6 === 3 ? gold : white).add(pt.x, layout.topY + rad * 0.82, pt.z, null, rad, null, rad);
  }
  if (!m.naked) {
    const side = m.frost;
    const sideH = m.Ht - m.rf;
    const count = Math.round(side.length * 13 * (ctx.tier?.density || 1));
    for (let i = 0; i < count; i++) {
      pathAt(side, r() * side.length, pt);
      const up = Math.pow(r(), 2.4);
      const rad = 0.012 + (1 - up) * 0.014 * r() + 0.004;
      const y = 0.02 + up * sideH * 0.7;
      (r() < 0.2 ? gold : white).add(pt.x + pt.nx * rad * 0.55, y, pt.z + pt.nz * rad * 0.55, null, rad, null, rad);
    }
  }
  part.add(white, m);
  part.add(gold, m);
}

const CANDLE_COLORS = ['#f08fb0', '#f6c453', '#6fcfa8', '#6fb6f2', '#b497f0'];

function buildCandles(ctx, part) {
  const { config, m, lib, layout } = ctx;
  const n = config.decor.candles;
  // com plaquinha, velas um pouco mais baixas: as chamas não cobrem a mensagem
  const h = layout.message ? 0.4 : 0.5;
  const y0 = layout.topY - 0.03;
  const spots = [];
  const cx = m.center.x;
  const cz = m.center.z;
  const centerFree = !layout.message && !layout.has('topo') && layout.zones.frutas !== 'center' && layout.zones.flores !== 'center' && layout.zones.raspas !== 'center';
  if (centerFree) {
    if (n === 1) spots.push([cx, cz]);
    else {
      const ringR = Math.min(layout.rho - layout.border - 0.1, Math.max(0.13, (n * 0.105) / TAU + 0.08));
      for (let i = 0; i < n; i++) {
        const a = Math.PI / 2 + ((i + 0.5) / n) * TAU;
        spots.push([cx + Math.cos(a) * ringR, cz + Math.sin(a) * ringR]);
      }
    }
  } else {
    // centro ocupado: as velas formam um arco na frente
    const k = Math.min(0.62, layout.ringK - 0.06);
    const span = Math.min(2.5, 0.42 * (n - 1));
    const pt = {};
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 + (n === 1 ? 0 : (i / (n - 1) - 0.5) * span);
      polarPoint(m, a, k, pt);
      spots.push([pt.x, pt.z]);
    }
  }
  const wick = new Batch(lib.geo.wick(), lib.mat.wick(), { cast: false });
  const byColor = new Map();
  const r = rng(77 + n);
  spots.forEach(([x, z], i) => {
    const hex = CANDLE_COLORS[i % CANDLE_COLORS.length];
    if (!byColor.has(hex)) byColor.set(hex, new Batch(lib.geo.candle(h), lib.mat.candle(hex)));
    const lean = new THREE.Euler((r() - 0.5) * 0.07, r() * TAU, (r() - 0.5) * 0.07);
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
  });
  byColor.forEach((b) => part.add(b, m));
  part.add(wick, m);
  part.lightAt = new THREE.Vector3(cx, y0 + h + 0.12, cz + (centerFree ? 0 : layout.rho * 0.35));
}

function plaqueSize(text, rho) {
  const lines = splitMessage(text);
  const longest = Math.max(...lines.map((l) => l.length));
  const w = Math.min(rho * 1.9, Math.max(0.58, 0.25 + longest * 0.097));
  const h = lines.length > 1 ? 0.52 : 0.36;
  return { w, h, lines };
}

function splitMessage(text) {
  const t = text.trim();
  if (t.length <= 14 || !t.includes(' ')) return [t];
  // quebra no espaço mais próximo do meio
  let best = -1;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === ' ' && (best < 0 || Math.abs(i - t.length / 2) < Math.abs(best - t.length / 2))) best = i;
  }
  return [t.slice(0, best), t.slice(best + 1)];
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
  const family = '"Playfair Display", Georgia, "Times New Roman", serif';
  let size = lines.length > 1 ? H * 0.36 : H * 0.56;
  const fits = () => {
    ctx.font = `italic 700 ${size}px ${family}`;
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
  const { config, m, lib, layout } = ctx;
  const y0 = layout.topY;
  const cx = m.center.x;
  const text = layout.message;
  const hasTopper = layout.has('topo');
  let plaqueHalf = 0;
  const backZ = m.center.z - Math.min(0.34, layout.rho * 0.36);

  if (text) {
    const { w, h, lines } = plaqueSize(text, layout.rho);
    plaqueHalf = w / 2;
    const group = new THREE.Group();
    const lift = 0.34;
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
      stick.position.set(sgn * w * 0.3, -0.06, -0.012);
      stick.castShadow = true;
      group.add(stick);
    });
    group.position.set(cx, y0, backZ);
    part.addObject(group, m, 0.14); // fica atrás do centro: só some se a fatia retirada chegar até ela
    part.plaque = { x: cx, y: y0 + lift + h / 2, z: backZ, w, h }; // para a câmera encarar a plaquinha enquanto a pessoa digita
    part.owned.push(body, faceGeo, faceMat, map);
  }

  if (hasTopper) {
    const stars = new Batch(lib.geo.starShape(), lib.mat.glitter());
    const sticks = new Batch(lib.geo.stick(), lib.mat.stick());
    const k = Math.min(1.1, 0.7 + layout.rho * 0.35);
    const set = text
      ? [
          [-(plaqueHalf + 0.11), 0.02, 0.64, 0.15, -0.2],
          [plaqueHalf + 0.1, 0.0, 0.5, 0.115, 0.25],
          [plaqueHalf + 0.2, 0.09, 0.3, 0.08, -0.15],
        ]
      : [
          [0, 0, 0.78 * k, 0.2 * k, 0.05],
          [-0.24 * k, 0.07, 0.52 * k, 0.13 * k, -0.3],
          [0.23 * k, 0.06, 0.4 * k, 0.105 * k, 0.28],
        ];
    const limit = layout.rho - layout.border - 0.06;
    set.forEach(([dx, dz, height, size, roll]) => {
      const x = cx + Math.max(-limit, Math.min(limit, dx));
      const z = (text ? backZ : m.center.z - layout.rho * 0.14) + dz;
      _q.setFromEuler(new THREE.Euler(0, roll * 0.6, roll));
      stars.add(x, y0 + height, z, _q, [size, size, size * 0.5], null, 0.05);
      sticks.add(x, y0 - 0.05, z - 0.004, null, [1, height + 0.05 - size * 0.4, 1], null, 0.03);
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
    scatter(ctx, part, { geometry: lib.geo.sprinkle(), material: lib.mat.sprinkle(), tints: SPRINKLE_TINTS, perArea: 135, perSide: 34, flat: true, sideBand: 2.2, seed: 'gran' });
  } else if (id === 'confete') {
    scatter(ctx, part, { geometry: lib.geo.confetti(), material: lib.mat.confetti(), tints: CONFETTI_TINTS, perArea: 78, perSide: 20, flat: true, sideBand: 1.3, seed: 'conf' });
  }
  return part;
}

/** Altura extra (acima do topo do bolo) ocupada pelas decorações — usada para enquadrar a câmera. */
export function decorHeight(config) {
  const items = config.decor.items;
  let h = config.piping.style !== 'liso' && config.piping.where !== 'base' ? 0.11 : 0.02;
  if (items.includes('frutas')) h = Math.max(h, 0.3);
  if (items.includes('flores')) h = Math.max(h, 0.16);
  if (items.includes('raspas')) h = Math.max(h, 0.14);
  if (items.includes('velas')) h = Math.max(h, 0.66);
  if (config.decor.message) h = Math.max(h, config.decor.message.length > 14 && config.decor.message.includes(' ') ? 0.94 : 0.78);
  if (items.includes('topo')) h = Math.max(h, 1.02);
  return h;
}
