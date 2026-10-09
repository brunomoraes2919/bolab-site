// BOLAB — confeitaria procedural: bicos (acabamento) e decorações do bolo.
// Tudo é geometria gerada por código e desenhada em lotes (InstancedMesh) para rodar leve no celular.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, hashString, makeCanvas, texture } from './textures.js';
import { offsetPath, pathAt, pointInPath, rayHit } from './geometry.js';

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

/** Superfície paramétrica (u, v) → ponto. wrapV fecha a volta (sem costura nas normais). */
function surface(nu, nv, fn, { wrapV = false, flip = false, shade = null } = {}) {
  const cols = wrapV ? nv : nv + 1;
  const pos = new Float32Array((nu + 1) * cols * 3);
  const col = shade ? new Float32Array((nu + 1) * cols * 3) : null;
  const p = new THREE.Vector3();
  let k = 0;
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j < cols; j++) {
      fn(i / nu, j / nv, p);
      if (col) col.fill(shade(i / nu, j / nv), k, k + 3);
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
  return geo;
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

/** Perfil de "pingo": gordinho embaixo, com biquinho no alto. */
function kissProfile(t) {
  const r = Math.sin(Math.PI * Math.pow(t, 0.62)) * 0.5 + (1 - t) * 0.62;
  return Math.max(0, r * (1 - t * t * 0.55)) * (t > 0.985 ? 0 : 1);
}

function dotGeometry() {
  return surface(14, 20, (u, v, p) => {
    const r = 0.066 * kissProfile(u) * (u < 0.04 ? 0.9 + u * 2.5 : 1);
    const a = v * TAU;
    p.set(r * Math.cos(a), 0.094 * Math.pow(u, 0.9), r * Math.sin(a));
  }, { wrapV: true });
}

function starGeometry() {
  const points = 7;
  return surface(16, 42, (u, v, p) => {
    const a = v * TAU + u * 0.9;
    const ridge = 1 - 0.26 * (0.5 + 0.5 * Math.cos(points * (v * TAU)));
    const r = 0.084 * kissProfile(u) * ridge;
    p.set(r * Math.cos(a), 0.118 * Math.pow(u, 0.85), r * Math.sin(a));
  }, { wrapV: true });
}

function shellGeometry() {
  const len = 0.25;
  return surface(18, 28, (u, v, p) => {
    const head = Math.pow(Math.sin(Math.PI * Math.min(1, u * 2.4) * 0.5), 0.7);
    const r = 0.076 * head * Math.pow(1 - u, 0.85) + 0.004;
    const a = v * TAU;
    const ridge = 1 - 0.22 * (0.5 + 0.5 * Math.cos(8 * a + u * 5));
    const cy = r * 0.72;
    p.set(u * len - 0.045, Math.max(0, cy + r * ridge * Math.sin(a)), r * ridge * Math.cos(a) * 1.08);
  }, { wrapV: true, flip: true });
}

function rosetteGeometry() {
  const turns = 1.8;
  const R = 0.118;
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  const P = new THREE.Vector3();
  const at = (t, out) => {
    const a = t * turns * TAU;
    const rad = 0.012 + (R - 0.012) * Math.pow(t, 0.85);
    return out.set(rad * Math.cos(a), 0.085 * Math.pow(1 - t, 1.6) + 0.036, rad * Math.sin(a));
  };
  return surface(72, 14, (u, v, p) => {
    at(u, P);
    at(Math.min(1, u + 0.004), T);
    at(Math.max(0, u - 0.004), N);
    T.sub(N).normalize();
    N.copy(Y).addScaledVector(T, -Y.dot(T)).normalize();
    B.crossVectors(T, N);
    const a = v * TAU;
    const ridge = 1 - 0.2 * (0.5 + 0.5 * Math.cos(6 * a + u * 9));
    const taper = u > 0.86 ? 1 - (u - 0.86) * 5.5 : u < 0.04 ? 0.55 + u * 11 : 1;
    const rr = 0.041 * ridge * Math.max(0.16, taper);
    p.copy(P).addScaledVector(B, rr * Math.cos(a)).addScaledVector(N, rr * Math.sin(a));
    if (p.y < 0) p.y = 0;
  }, { wrapV: true, flip: true });
}

function leafGeometry(len = 0.13, wid = 0.034, fold = 0.5) {
  return surface(12, 8, (u, v, p) => {
    const w = wid * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 0.85);
    const vv = v * 2 - 1;
    const ripple = Math.sin(u * 16) * 0.003 * Math.abs(vv);
    p.set(u * len, 0.006 + 0.02 * Math.sin(Math.PI * u) + fold * Math.abs(vv) * w * 0.7 + ripple - u * u * 0.012, vv * w);
  });
}

function strawberryGeometry() {
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
  ]).getPoints(26);
  return new THREE.LatheGeometry(pts, 26);
}

function calyxGeometry() {
  const parts = [];
  const leaves = 7;
  for (let i = 0; i < leaves; i++) {
    const g = surface(5, 4, (u, v, p) => {
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

function blueberryGeometry() {
  const body = new THREE.SphereGeometry(0.062, 18, 14);
  body.scale(1, 0.9, 1);
  const crown = new THREE.TorusGeometry(0.018, 0.007, 6, 12);
  crown.rotateX(Math.PI / 2);
  crown.translate(0, 0.052, 0);
  return mergeGeometries([paint(plain(body), 1, 1, 1), paint(plain(crown), 0.35, 0.35, 0.45)]);
}

function raspberryGeometry() {
  const parts = [];
  const r = rng(404);
  const n = 46;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const lat = Math.acos(1 - 1.72 * t); // do topo até quase a base
    const lon = i * 2.39996;
    const R = 0.062;
    const g = new THREE.SphereGeometry(0.0205 + r() * 0.004, 7, 5);
    g.translate(R * Math.sin(lat) * Math.cos(lon), R * Math.cos(lat) * 1.1 + 0.066, R * Math.sin(lat) * Math.sin(lon));
    parts.push(plain(g));
  }
  return mergeGeometries(parts);
}

function sprinkleGeometry() {
  const g = new THREE.CapsuleGeometry(0.0105, 0.04, 3, 7);
  g.rotateZ(Math.PI / 2);
  g.translate(0, 0.0105, 0);
  return g;
}

function confettiGeometry() {
  const g = new THREE.CylinderGeometry(0.021, 0.021, 0.008, 12);
  g.translate(0, 0.004, 0);
  return g;
}

function curlGeometry() {
  const len = 0.19;
  return surface(10, 26, (u, v, p) => {
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

function roseGeometry() {
  const parts = [];
  const rings = [
    { n: 3, r0: 0.006, r1: 0.03, h: 0.118, half: 1.95, curl: 0, off: 0 },
    { n: 4, r0: 0.014, r1: 0.062, h: 0.112, half: 1.2, curl: 0.006, off: 0.5 },
    { n: 5, r0: 0.022, r1: 0.104, h: 0.098, half: 0.96, curl: 0.02, off: 0.2 },
    { n: 6, r0: 0.028, r1: 0.15, h: 0.076, half: 0.82, curl: 0.036, off: 0.7 },
  ];
  rings.forEach((ring, ri) => {
    const depth = [0.7, 0.8, 0.9, 1][ri]; // miolo mais fechado e mais escuro, como numa rosa de verdade
    for (let i = 0; i < ring.n; i++) {
      const phi = ((i + ring.off) / ring.n) * TAU;
      parts.push(
        plain(
          surface(8, 8, (u, v, p) => {
            const vv = v * 2 - 1;
            const w = ring.half * (0.22 + 0.78 * Math.sin((Math.PI * Math.min(1, u * 1.15)) / 2));
            const a = phi + vv * w;
            const rad = ring.r0 + (ring.r1 - ring.r0) * Math.pow(u, 1.25) + ring.curl * u * u * u * (1 - 0.4 * vv * vv);
            const y = ring.h * Math.pow(u, 0.8) * (1 - 0.24 * vv * vv * u) - ring.curl * 0.55 * Math.pow(u, 4);
            p.set(rad * Math.cos(a), y + 0.004, rad * Math.sin(a));
          }, { shade: (u) => depth * (0.7 + 0.3 * u) }),
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

function candleGeometry(h) {
  const body = new THREE.CylinderGeometry(0.026, 0.026, h, 16, 1, true);
  body.translate(0, h / 2, 0);
  const cap = new THREE.SphereGeometry(0.026, 16, 6, 0, TAU, 0, Math.PI / 2);
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

export function createDecorLibrary(tex) {
  const geos = new Map();
  const mats = new Map();
  const geo = (key, make) => {
    if (!geos.has(key)) geos.set(key, make());
    return geos.get(key);
  };
  const mat = (key, make) => {
    if (!mats.has(key)) mats.set(key, make());
    return mats.get(key);
  };
  const P = (o) => new THREE.MeshPhysicalMaterial(o);
  const S = (o) => new THREE.MeshStandardMaterial(o);
  return {
    geo: {
      dot: () => geo('dot', dotGeometry),
      star: () => geo('star', starGeometry),
      shell: () => geo('shell', shellGeometry),
      rosette: () => geo('rosette', rosetteGeometry),
      pipedLeaf: () => geo('pipedLeaf', () => leafGeometry(0.2, 0.055, 0.55)),
      strawberry: () => geo('strawberry', strawberryGeometry),
      calyx: () => geo('calyx', calyxGeometry),
      blueberry: () => geo('blueberry', blueberryGeometry),
      raspberry: () => geo('raspberry', raspberryGeometry),
      sprinkle: () => geo('sprinkle', sprinkleGeometry),
      confetti: () => geo('confetti', confettiGeometry),
      pearl: () => geo('pearl', () => new THREE.SphereGeometry(1, 16, 12)),
      curl: () => geo('curl', curlGeometry),
      shard: () => geo('shard', shardGeometry),
      rose: () => geo('rose', roseGeometry),
      blossom: () => geo('blossom', blossomGeometry),
      leaf: () => geo('leaf', () => leafGeometry(0.15, 0.042, 0.4)),
      candle: (h) => geo(`candle${h.toFixed(2)}`, () => candleGeometry(h)),
      wick: () => geo('wick', () => new THREE.CylinderGeometry(0.0035, 0.0035, 0.034, 5).translate(0, 0.017, 0)),
      starShape: () => geo('starShape', starShapeGeometry),
      stick: () => geo('stick', () => new THREE.CylinderGeometry(0.008, 0.008, 1, 8).translate(0, 0.5, 0)),
    },
    mat: {
      piping: () => mat('piping', () => P({ color: 0xffffff, roughness: 0.58, sheen: 0.5, sheenRoughness: 0.6, sheenColor: 0xffffff, side: THREE.DoubleSide })),
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
      petal: () => mat('petal', () => P({ color: 0xffffff, roughness: 0.58, sheen: 0.25, sheenRoughness: 0.5, sheenColor: 0xffffff, side: THREE.DoubleSide, vertexColors: true })),
      flowerCenter: () => mat('flowerCenter', () => S({ color: 0xf2c14e, roughness: 0.55 })),
      leaf: () => mat('leaf', () => S({ color: 0x6f9a55, roughness: 0.62, side: THREE.DoubleSide })),
      candle: (hex) => mat(`candle${hex}`, () => P({ map: tex.candle(hex), roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.4 })),
      wick: () => mat('wick', () => S({ color: 0x2a1c14, roughness: 0.9 })),
      stick: () => mat('stick', () => S({ color: 0xe7cfa0, roughness: 0.6 })),
      plaque: () => mat('plaque', () => P({ color: 0xfffaf3, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 })),
      flame: () => mat('flame', () => new THREE.SpriteMaterial({ map: tex.flame(), transparent: true, depthWrite: false, toneMapped: false })),
      glow: () => mat('glow', () => new THREE.SpriteMaterial({ map: tex.glow(), transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, opacity: 0.55 })),
    },
    dispose() {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      geos.clear();
      mats.clear();
    },
  };
}

/* ───────── Composição: quem fica onde no topo ───────── */

const PIPE = {
  bolinhas: { r: 0.066, step: 0.138 },
  conchas: { r: 0.076, step: 0.168 },
  estrelas: { r: 0.084, step: 0.172 },
  rosetas: { r: 0.15, step: 0.292 },
  folhas: { r: 0.075, step: 0.1 },
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

export function buildPiping(ctx) {
  const { config, m, lib, layout } = ctx;
  const style = config.piping.style;
  const part = newPart();
  if (style === 'liso') return part;
  const spec = PIPE[style];
  const geoOf = { bolinhas: lib.geo.dot, conchas: lib.geo.shell, estrelas: lib.geo.star, rosetas: lib.geo.rosette, folhas: lib.geo.pipedLeaf }[style];
  const batch = new Batch(geoOf(), lib.mat.piping(), { cast: true, receive: true });
  const r = rng(hashString(`pipe${style}${m.shape}${m.R}`));
  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const pt = {};

  const ring = (path, y, base) => {
    const count = Math.max(6, Math.round(path.length / spec.step));
    for (let i = 0; i < count; i++) {
      pathAt(path, (i / count) * path.length, pt);
      tangent.set(pt.tx, 0, pt.tz);
      normal.set(pt.nx, 0, pt.nz);
      const jitter = 0.94 + r() * 0.12;
      if (style === 'conchas') {
        frameQuat(tangent, Y, _q);
        batch.add(pt.x, y, pt.z, _q, [1, jitter, 1], null, spec.r);
      } else if (style === 'folhas') {
        // folhas apontam para fora, alternando o ângulo como numa guirlanda
        const yaw = (i % 2 ? 0.55 : -0.55) + (r() - 0.5) * 0.2;
        _x.copy(normal).applyAxisAngle(Y, yaw);
        if (base) _y.copy(Y).addScaledVector(normal, 0.25).normalize();
        else _y.copy(Y);
        frameQuat(_x, _y, _q);
        batch.add(pt.x - pt.nx * 0.05, y, pt.z - pt.nz * 0.05, _q, jitter, null, 0.1);
      } else {
        _q.setFromAxisAngle(Y, r() * TAU);
        const s = style === 'rosetas' ? [jitter, 1, jitter] : jitter;
        batch.add(pt.x, y, pt.z, _q, s, null, spec.r);
      }
    }
  };

  if (config.piping.where !== 'base') {
    const inset = style === 'folhas' ? 0.05 : spec.r;
    ring(offsetPath(m.topFlat, -inset), layout.topY - 0.002, false);
  }
  if (config.piping.where !== 'top') {
    const out = style === 'folhas' ? 0.02 : style === 'rosetas' ? spec.r * 0.5 : spec.r * 0.7;
    ring(offsetPath(m.frost, out), 0.002, true);
  }
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
  const b = { berry: new Batch(lib.geo.strawberry(), lib.mat.strawberry()), calyx: new Batch(lib.geo.calyx(), lib.mat.calyx()), count: 0 };
  const blue = new Batch(lib.geo.blueberry(), lib.mat.blueberry());
  const rasp = new Batch(lib.geo.raspberry(), lib.mat.raspberry());
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

const ROSE_TINTS = ['#e8718f', '#f08fa8', '#d95c7c', '#f6aabb', '#fbd9e0'];

function buildFlowers(ctx, part) {
  const { m, lib, layout } = ctx;
  const r = rng(hashString(`flower${m.shape}${m.R}${layout.zones.flores}`));
  const rose = new Batch(lib.geo.rose(), lib.mat.petal());
  const blossom = new Batch(lib.geo.blossom(), lib.mat.petal());
  const centers = new Batch(lib.geo.pearl(), lib.mat.flowerCenter());
  const leaves = new Batch(lib.geo.leaf(), lib.mat.leaf());
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
  const curls = new Batch(lib.geo.curl(), lib.mat.chocolate());
  const shards = new Batch(lib.geo.shard(), lib.mat.chocolate());
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
  const nTop = Math.round(topArea(m) * perArea);
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
    const nSide = Math.round(side.length * perSide);
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
  const white = new Batch(lib.geo.pearl(), lib.mat.pearl(), { cast: true, receive: true });
  const gold = new Batch(lib.geo.pearl(), lib.mat.gold(), { cast: true, receive: true });
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
    const count = Math.round(side.length * 13);
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
  const h = 0.5;
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
  const w = Math.min(rho * 1.75, Math.max(0.46, 0.2 + longest * 0.078));
  const h = lines.length > 1 ? 0.42 : 0.29;
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

function plaqueTexture(lines, w, h) {
  const px = 384; // altura da textura; a largura acompanha a proporção da plaquinha
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
    const lift = 0.3;
    const shape = roundedRectShape(w, h, 0.05);
    const body = new THREE.ExtrudeGeometry(shape, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 2, curveSegments: 10 });
    body.translate(0, 0, -0.007);
    const edge = new THREE.Mesh(body, lib.mat.gold());
    edge.castShadow = true;
    const map = plaqueTexture(lines, w, h);
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
  let h = config.piping.style !== 'liso' && config.piping.where !== 'base' ? 0.09 : 0.02;
  if (items.includes('frutas')) h = Math.max(h, 0.3);
  if (items.includes('flores')) h = Math.max(h, 0.16);
  if (items.includes('raspas')) h = Math.max(h, 0.14);
  if (items.includes('velas')) h = Math.max(h, 0.66);
  if (config.decor.message) h = Math.max(h, config.decor.message.length > 14 && config.decor.message.includes(' ') ? 0.78 : 0.65);
  if (items.includes('topo')) h = Math.max(h, 1.02);
  return h;
}
