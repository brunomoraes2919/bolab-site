// BOLAB — decorações novas do personalizador (docinhos, flores variadas, enfeites de festa).
// Cada construtor recebe (ctx, part): ctx = { config, m, lib, layout, tier } e part = newPart() de decor.js.
// Tudo é geometria gerada por código e desenhada em lotes (no máximo 3 por decoração). As peças são brancas
// e recebem a cor por instância; o que tem cor fixa (cabinho, fio de calda, forminha) vem pintado nos vértices.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, hashString, makeCanvas, texture } from './textures.js';
import { cleanOffset, pathAt, pointInPath, rayHit } from './geometry.js';
import { decorOptions } from './pricing.js';
import { Batch, frameQuat, surface, paint, plain, smooth, gomo, newPart, groundBlob, leanQuat, quantityOf, decorSpots } from './decor.js';

const TAU = Math.PI * 2;
const SRGB = THREE.SRGBColorSpace;
const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _e = new THREE.Euler();
const _hsl = { h: 0, s: 0, l: 0 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (list, r) => list[Math.min(list.length - 1, Math.floor(r() * list.length))];
/** Número "aleatório" fixo para um par de índices (rugosidade que não muda de uma visita para outra). */
const hash2 = (i, j) => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/* ───────── Cores ───────── */

const rgbOf = (hex) => {
  const n = new THREE.Color(hex).getHex(SRGB);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** Mistura duas cores como num seletor de cores (k = 0 → a, 1 → b). */
function mix(a, b, k) {
  const A = rgbOf(a);
  const B = rgbOf(b);
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
}
/** Desloca matiz (dh, em voltas), saturação (× ks) e luminosidade (+ dl). */
function shift(hex, dh = 0, ks = 1, dl = 0) {
  const c = new THREE.Color(hex);
  c.getHSL(_hsl, SRGB);
  c.setHSL((_hsl.h + dh + 1) % 1, clamp(_hsl.s * ks, 0, 1), clamp(_hsl.l + dl, 0, 1), SRGB);
  return `#${c.getHexString()}`;
}
/**
 * Cor de peça que, depois da luz forte do palco, aparece na tela parecida com a que a pessoa escolheu:
 * tons claros descem um pouco e ganham saturação (o mesmo ajuste que o motor faz na cobertura).
 */
function shown(hex) {
  const c = new THREE.Color(hex);
  c.getHSL(_hsl, SRGB);
  const light = smooth(0.5, 0.85, _hsl.l);
  c.setHSL(_hsl.h, clamp(_hsl.s * (1 + 0.14 * light), 0, 1), _hsl.l * (1 - 0.1 * light), SRGB);
  return `#${c.getHexString()}`;
}
const lightOf = (hex) => new THREE.Color(hex).getHSL(_hsl, SRGB).l;
const saturOf = (hex) => new THREE.Color(hex).getHSL(_hsl, SRGB).s;
/** Três tons vizinhos da cor escolhida (a cor, mais clara, mais funda) — para as peças não saírem todas iguais. */
function tintsOf(hex) {
  if (lightOf(hex) > 0.94) return ['#f4f1ec', '#f6ecdc', '#f5e6ea'];
  const c = shown(hex);
  return [c, mix(c, '#ffffff', 0.24), shift(c, 0.015, 1.06, -0.05)];
}
/** Tons que combinam com a cor escolhida (balões): a cor, clara, duas vizinhas no círculo de cores e um marfim. */
function harmonyOf(hex) {
  if (saturOf(hex) < 0.08) return [shown(hex), '#f2c3cf', '#f1d89a', '#f4f1ec', '#dcc0ea'];
  const c = shown(hex);
  return [c, mix(c, '#ffffff', 0.4), shift(c, 0.07, 0.95, 0.1), shift(c, -0.08, 0.95, 0.03), '#f6ecdc'];
}

/* ───────── Geometria: ajudantes ───────── */

/** Multiplica a cor de vértice (sombra assada) por uma cor fixa. */
function dye(geo, hex) {
  const c = new THREE.Color(hex);
  const a = geo.attributes.color;
  for (let i = 0; i < a.count; i++) a.setXYZ(i, a.getX(i) * c.r, a.getY(i) * c.g, a.getZ(i) * c.b);
  return geo;
}

/** Prepara uma parte para ser fundida a outras: posição, normal e cor (branca se não tiver; tingida se hex vier). */
function piece(geo, hex = null) {
  const g = plain(geo);
  if (!g.attributes.color) paint(g, 1, 1, 1);
  else if (g.attributes.color === geo.attributes.color) g.setAttribute('color', geo.attributes.color.clone());
  if (hex) dye(g, hex);
  return g;
}

/**
 * Peça torneada. perfil = [[raio, y, tom = 1, rugoso = 0]]; "rugoso" sacode o raio e a altura daquele anel
 * (pezinho do macaron). wave(a, i) multiplica o raio (pregas, gomos).
 */
function lathe(profile, nv, wave = null) {
  const nu = profile.length - 1;
  return surface(nu, nv, (u, v, p) => {
    const i = Math.round(u * nu);
    const j = Math.round(v * nv) % nv;
    const row = profile[i];
    let rad = row[0];
    let y = row[1];
    if (row[3]) {
      rad += (hash2(i, j) - 0.5) * row[3];
      y += (hash2(j, i + 9) - 0.5) * row[3] * 0.6;
    }
    const a = v * TAU;
    if (wave) rad *= wave(a, i);
    p.set(rad * Math.sin(a), y, rad * Math.cos(a));
    return row[2] ?? 1;
  }, { wrapV: true, shade: true, orient: true });
}

/** Tubo ao longo de at(u, P). rad e tone podem ser funções de u. ref = eixo de apoio (não paralelo ao tubo). */
function tube(nu, nv, at, rad, tone = 1, ref = Z) {
  const P = new THREE.Vector3();
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const S = new THREE.Vector3();
  return surface(nu, nv, (u, v, p) => {
    at(u, P);
    at(Math.min(1, u + 0.01), A);
    at(Math.max(0, u - 0.01), B);
    T.subVectors(A, B).normalize();
    S.crossVectors(T, ref).normalize();
    N.crossVectors(S, T);
    const r = typeof rad === 'function' ? rad(u) : rad;
    const a = v * TAU;
    p.copy(P).addScaledVector(S, r * Math.cos(a)).addScaledVector(N, r * Math.sin(a));
    return typeof tone === 'function' ? tone(u, v) : tone;
  }, { wrapV: true, shade: true, orient: true });
}

/**
 * Fio de calda sobre uma superfície: at(u, P, N) dá o ponto e a normal dela. A fita tem 3 pontos na largura —
 * as bordas afundam um tico na peça e o meio fica abaulado; as pontas afinam.
 */
function trail(nu, at, width, lift, tone = 1) {
  const P = new THREE.Vector3();
  const N = new THREE.Vector3();
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const T = new THREE.Vector3();
  const S = new THREE.Vector3();
  const N2 = new THREE.Vector3();
  return surface(nu, 2, (u, v, p) => {
    at(Math.min(1, u + 0.004), A, N2);
    at(Math.max(0, u - 0.004), B, N2);
    at(u, P, N);
    T.subVectors(A, B).normalize();
    S.crossVectors(N, T).normalize();
    const vv = v * 2 - 1;
    const end = Math.min(1, Math.min(u, 1 - u) / 0.04);
    p.copy(P)
      .addScaledVector(S, vv * width * 0.5 * (0.35 + 0.65 * end))
      .addScaledVector(N, (1 - vv * vv) * lift * (0.3 + 0.7 * end) - 0.0012);
    return tone;
  }, { shade: true });
}

/** Ponto e normal de uma superfície de revolução y = h(ρ) acima de (x, z), afastado `lift` dela. */
function onDome(h, x, z, lift, P, N) {
  const rho = Math.hypot(x, z) || 1e-6;
  const lo = Math.max(0, rho - 0.002);
  const dy = (h(rho + 0.002) - h(lo)) / (rho + 0.002 - lo);
  N.set((-dy * x) / rho, 1, (-dy * z) / rho).normalize();
  P.set(x, h(rho), z).addScaledVector(N, lift);
}

/** UV plana (vista de cima) num disco de raio R: a textura inteira cobre o disco. */
function planarUV(geo, R) {
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / (2 * R) + 0.5;
    uv[i * 2 + 1] = pos.getZ(i) / (2 * R) + 0.5;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/* ───────── Materiais ───────── */

// açúcar fosco: suspiro, marshmallow, casquinha de macaron, recheio
const matte = (lib) => lib.custom('x2-matte', () => lib.physical({ color: 0xffffff, roughness: 0.86, sheen: 0.35, sheenRoughness: 0.6, sheenColor: 0xffffff, vertexColors: true }));
// papel e folhas finas (duas faces): forminha, cabinho e folhas do morango
const paper = (lib) => lib.custom('x2-paper', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.74, side: THREE.DoubleSide, vertexColors: true }));
// pasta de açúcar: laço
const fondant = (lib) => lib.custom('x2-fondant', () => lib.physical({ color: 0xffffff, roughness: 0.48, sheen: 0.35, sheenRoughness: 0.45, sheenColor: 0xffffff, vertexColors: true }));
// chocolate temperado: brilho macio
const chocolate = (lib) => lib.custom('x2-choc', () => lib.physical({ color: 0xffffff, roughness: 0.33, clearcoat: 0.45, clearcoatRoughness: 0.3, vertexColors: true }));
// bala dura e fruta em calda: bem brilhante
const candy = (lib) => lib.custom('x2-candy', () => lib.physical({ color: 0xffffff, roughness: 0.2, clearcoat: 0.9, clearcoatRoughness: 0.12, vertexColors: true }));
// açúcar acetinado: corações
const sugar = (lib) => lib.custom('x2-sugar', () => lib.physical({ color: 0xffffff, roughness: 0.36, clearcoat: 0.35, clearcoatRoughness: 0.3, vertexColors: true }));
// palito de papel branco (a geometria do palito não tem cor de vértice)
const stickMat = (lib) => lib.custom('x2-stick', () => new THREE.MeshStandardMaterial({ color: 0xfbf6ee, roughness: 0.62 }));
// folha de ouro: metal amassado, facetas vivas, visto dos dois lados
const goldLeaf = (lib) => lib.custom('x2-goldleaf', () => new THREE.MeshStandardMaterial({ color: 0xffd660, metalness: 0.6, roughness: 0.3, emissive: 0x8a6010, emissiveIntensity: 0.85, side: THREE.DoubleSide, flatShading: true }));

const smallCast = (ctx) => ({ cast: ctx.tier?.smallCastShadow !== false });
/** Com a cerca de chocolate em volta do bolo, o que vai na lateral fica por fora dela (a espessura de uma barrinha). */
const wallOut = (ctx) => (ctx.layout.has('wafer') ? 0.066 : 0);

/* ───────── Arranjo: ajudantes ───────── */

const ZONE_OF = { centro: 'center', coroa: 'crown', espalhado: 'scatter', cascata: 'cascade' };
/** Zona da decoração: a que o layout resolveu; 'palito', 'lateral' e 'frente' vêm direto da escolha da pessoa. */
function zoneOf(ctx, id) {
  const arr = ctx.layout.opt(id).arr;
  if (arr === 'palito' || arr === 'lateral' || arr === 'frente') return arr;
  return ctx.layout.zones[id] || ZONE_OF[arr] || 'crown';
}

/** Em pé no topo, com giro livre e uma leve inclinação. */
function uprightQuat(r, tilt = 0.1, out = _q) {
  _e.set((r() - 0.5) * 2 * tilt, r() * TAU, (r() - 0.5) * 2 * tilt);
  return out.setFromEuler(_e);
}

/** Peça com o +Y ao longo de `axis` (unitário), girada de `spin` em torno dele. */
function axisQuat(axis, spin = 0, out = _q) {
  out.setFromUnitVectors(Y, axis);
  if (spin) out.multiply(_q2.setFromAxisAngle(Y, spin));
  return out;
}

/** Peça colada na lateral: o +Y dela aponta para fora do bolo (um pouco para cima, se up > 0), girada de roll. */
function wallQuat(ox, oz, roll = 0, up = 0, out = _q) {
  _y.set(ox, up, oz).normalize();
  _x.set(-oz, 0, ox).applyAxisAngle(_y, roll);
  return frameQuat(_x, _y, out);
}

/** Peça em pé com a frente (+Z) virada para (ox, oz); lean > 0 deita para trás; roll gira em torno da frente. */
function facingQuat(ox, oz, lean = 0, roll = 0, out = _q) {
  _z.set(ox, 0, oz).normalize();
  _y.set(-_z.x * Math.sin(lean), Math.cos(lean), -_z.z * Math.sin(lean));
  _x.crossVectors(_y, _z).normalize();
  frameQuat(_x, _y, out);
  if (roll) out.multiply(_q2.setFromAxisAngle(Z, roll));
  return out;
}

/** Disco deitado (eixo +Y) com a normal levantada de `elev` (0 = em pé, π/2 = deitado) na direção (dx, dz). */
function discQuat(dx, dz, elev, spin = 0, out = _q) {
  _y.set(dx * Math.cos(elev), Math.sin(elev), dz * Math.cos(elev)).normalize();
  _x.set(-dz, 0, dx);
  frameQuat(_x, _y, out);
  if (spin) out.multiply(_q2.setFromAxisAngle(Y, spin));
  return out;
}

/** Recua para dentro do topo um lugar que cairia em cima do bico da borda (r = raio da peça). */
function keepInside(ctx, sp, r) {
  const { m, layout } = ctx;
  const dx = sp.x - m.center.x;
  const dz = sp.z - m.center.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-4) return sp;
  const limit = rayHit(m.topFlat, m.center.x, m.center.z, Math.atan2(dz, dx)) - layout.border - r;
  if (d > limit && limit > 0) {
    sp.x = m.center.x + (dx / d) * limit;
    sp.z = m.center.z + (dz / d) * limit;
  }
  return sp;
}

/**
 * Lugares de uma decoração (decorSpots), já conferidos: espalhadas e cascatas não sobem no bico da borda.
 * r = raio real da peça; size = espaço que ela ocupa no arranjo.
 */
function spotsFor(ctx, zone, { size, r = size, count = 8, k = 1, seed }) {
  const { m, layout } = ctx;
  if (zone === 'scatter') {
    const want = Math.max(2, Math.round(count * k * 1.3));
    const limit = cleanOffset(m.topFlat, -(layout.border + r * 0.9));
    return decorSpots(ctx, zone, { size, count: count * 2.2, k, seed })
      .filter((sp) => pointInPath(limit, sp.x, sp.z))
      .slice(0, want);
  }
  const spots = decorSpots(ctx, zone, { size, count, k, seed });
  const out = wallOut(ctx);
  spots.forEach((sp) => {
    if (sp.side) {
      sp.x += sp.ox * out;
      sp.z += sp.oz * out;
    } else if (zone === 'cascade' && (layout.border > 0.06 || out)) keepInside(ctx, sp, r);
  });
  if (zone !== 'cascade') return spots;
  // no topo, a cascata nasce da borda para dentro: peças largas demais para caber lado a lado dão lugar às vizinhas
  const kept = [];
  for (let i = spots.length - 1; i >= 0; i--) {
    const sp = spots[i];
    if (sp.side || kept.every((q) => q.side || Math.hypot(q.x - sp.x, q.z - sp.z) > r * 1.8)) kept.unshift(sp);
  }
  return kept;
}

/**
 * Montinho no centro: os lugares de baixo (decorSpots) e, por cima, peças apoiadas nos vãos entre elas.
 * rise = altura do segundo andar. → [{ x, y, z, ox, oz, level }]
 */
function pileSpots(ctx, { size, count, k, seed, rise }) {
  const base = decorSpots(ctx, 'center', { size, count, k, seed });
  const out = base.map((sp) => ({ ...sp, level: 0 }));
  if (base.length < 4) return out;
  const c = base[0];
  const ring = base.filter((sp) => Math.hypot(sp.x - c.x, sp.z - c.z) < size * 2.4).length - 1;
  if (ring < 3) return out;
  const a0 = Math.atan2(base[1].z - c.z, base[1].x - c.x);
  const tops = clamp(Math.round((base.length - 1) / 3), 1, Math.min(3, Math.floor(ring / 2)));
  for (let i = 0; i < tops; i++) {
    const a = a0 + ((Math.round((i * ring) / tops) + 0.5) / ring) * TAU;
    const d = size * 1.16;
    out.push({ x: c.x + Math.cos(a) * d, y: c.y + rise, z: c.z + Math.sin(a) * d, ox: Math.cos(a), oz: Math.sin(a), side: false, u: 0.5, taper: 1, level: 1 });
  }
  return out;
}

/** Raio do montinho do centro (para a sombra de contato falsa do celular). */
const pileRadius = (spots, c) => spots.reduce((d, sp) => Math.max(d, Math.hypot(sp.x - c.x, sp.z - c.z)), 0);

/**
 * Lugares para o que vai espetado em palito: uma fileira de frente para quem olha, `depth` atrás do centro
 * (negativo = na frente), com as pontas um pouco recuadas. Com plaquinha ou topo de festa no meio do bolo,
 * a fileira se abre em dois grupos, um de cada lado. → [{ x, z, j }]  (j = posição na fileira, −1…1)
 */
function stickRow(ctx, n, { depth, gap, gapMid = 0 }) {
  const { m, layout } = ctx;
  const room = layout.rho - layout.border - 0.1;
  const d = clamp(depth, -room * 0.7, room * 0.7);
  const half = Math.sqrt(Math.max(0.01, room * room - d * d)) * 0.92;
  // meia largura reservada ao que está no meio (plaquinha, topo de festa ou, se pedido, as velas)
  const hole = Math.min(half * 0.6, Math.max(gapMid, layout.backFree ? 0 : 0.42));
  const count = Math.max(1, Math.min(n, Math.floor((2 * (half - hole)) / gap) + (hole ? 0 : 1)));
  const out = [];
  for (let i = 0; i < count; i++) {
    let x = (i - (count - 1) / 2) * gap;
    if (hole) {
      // metade de cada lado, das beiradas para o meio
      const left = i < Math.ceil(count / 2);
      const k = left ? i : count - 1 - i;
      x = (left ? -1 : 1) * (half - k * gap);
    }
    const j = half > 0.01 ? clamp(x / Math.max(half, gap), -1, 1) : 0;
    out.push({ x: m.center.x + x, z: m.center.z - d - 0.1 * j * j * room, j });
  }
  return out.sort((a, b) => a.x - b.x);
}

/* ───────── Morangos banhados em chocolate ───────── */

const BERRY_TINTS = ['#ffffff', '#fff1f1', '#ffe9e4'];
// o mesmo perfil do morango das frutas frescas (raio, y): ponta em −Y, folhas em +Y
const BERRY_PROFILE = new THREE.SplineCurve(
  [[0.0005, -0.165], [0.03, -0.155], [0.068, -0.105], [0.1, -0.035], [0.114, 0.04], [0.105, 0.1], [0.075, 0.138], [0.03, 0.15], [0.0005, 0.146]].map(([r, y]) => new THREE.Vector2(r, y)),
);
const _v2 = new THREE.Vector2();
const _t2 = new THREE.Vector2();

/** Ponto sobre o morango: perfil em t (0 = ponta), no ângulo a, afastado `off` para fora. */
function onBerry(t, a, off, P, N) {
  BERRY_PROFILE.getPoint(t, _v2);
  BERRY_PROFILE.getTangent(t, _t2);
  const nr = _t2.y;
  const ny = -_t2.x;
  const rad = Math.max(0, _v2.x + nr * off);
  P.set(rad * Math.sin(a), _v2.y + ny * off, rad * Math.cos(a));
  if (N) N.set(nr * Math.sin(a), ny, nr * Math.cos(a)).normalize();
}

/**
 * A parte do morango que fica de fora do chocolate (do banho para cima), com a mesma textura do morango
 * inteiro — a metade de baixo fica escondida na casca e não é desenhada.
 */
function berryTopGeometry(D) {
  const lowp = D < 1;
  const rows = lowp ? 7 : 12;
  const t0 = 0.41;
  const pts = Array.from({ length: rows + 1 }, (_, i) => BERRY_PROFILE.getPoint(t0 + ((1 - t0) * i) / rows));
  const g = new THREE.LatheGeometry(pts, lowp ? 14 : 22);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, t0 + (1 - t0) * uv.getY(i));
  return g;
}

/** Casca de chocolate: cobre da ponta até pouco mais da metade, com a linha do banho inclinada e uma bordinha. */
function berryDipGeometry(D) {
  const lowp = D < 1;
  const nu = lowp ? 5 : 9;
  const P = new THREE.Vector3();
  return surface(nu, lowp ? 14 : 22, (u, v, p) => {
    const a = v * TAU;
    const cut = 0.455 + 0.03 * Math.sin(a - 0.6) + 0.006 * Math.sin(3 * a);
    const i = Math.round(u * nu);
    if (i === nu) onBerry(cut + 0.012, a, -0.0008, P, null); // a borda do banho encosta no morango
    else onBerry((i / (nu - 1)) * cut, a, 0.0064, P, null);
    p.copy(P);
    return i === nu ? 0.62 : 1;
  }, { wrapV: true, shade: true, orient: true });
}

/** Cabinho (estrela de folhinhas caídas sobre o ombro da fruta + talo) e os fios de calda em zigue-zague sobre o chocolate. */
function berryExtrasGeometry(D, darkLines) {
  const lowp = D < 1;
  const n = lowp ? 5 : 7;
  const parts = [];
  for (let i = 0; i < n; i++) {
    const leaf = surface(lowp ? 2 : 3, lowp ? 1 : 2, (u, v, p) => {
      const vv = v * 2 - 1;
      const w = 0.021 * Math.sin(Math.PI * Math.pow(u, 0.6)) * (1 - u * 0.3);
      p.set(0.01 + u * 0.078, 0.151 - u * u * 0.052 + 0.006 * Math.abs(vv), vv * w);
      return 0.78 + 0.22 * u;
    }, { shade: true });
    leaf.rotateY((i / n) * TAU + (i % 2) * 0.2);
    parts.push(piece(leaf, '#4f8a2f'));
  }
  parts.push(piece(new THREE.CylinderGeometry(0.006, 0.008, 0.035, lowp ? 3 : 5, 1, lowp).translate(0, 0.165, 0), '#4f8a2f'));
  const line = (n, at) => parts.push(piece(trail(n, at, 0.012, 0.0048), darkLines ? '#4a2614' : '#fbf0df'));
  if (lowp) {
    // no celular: três riscos atravessados (com poucos segmentos, ficam mais limpos que um zigue-zague)
    for (let i = 0; i < 3; i++) line(5, (u, P, N) => onBerry(0.13 + 0.11 * i + 0.07 * (u - 0.5), Math.PI + (u - 0.5) * 2.3, 0.0064, P, N));
  } else line(44, (u, P, N) => onBerry(0.08 + 0.35 * u, Math.PI + 1.15 * Math.sin(u * TAU * 3.5 + 0.5), 0.0064, P, N));
  return mergeGeometries(parts);
}

function buildDippedBerries(ctx, part) {
  const { m, lib, layout } = ctx;
  const zone = zoneOf(ctx, 'morangos');
  const k = quantityOf(ctx, 'morangos');
  const r = rng(hashString(`morangos${m.shape}${m.R}${zone}`));
  const picked = layout.opt('morangos').color;
  const tone = lightOf(picked) > 0.92 ? '#f6ead6' : picked; // chocolate branco é marfim, não branco puro
  const darkLines = lightOf(tone) > 0.8 && saturOf(tone) < 0.5;
  const berry = new Batch(lib.shape('x2-berryTop', () => berryTopGeometry(lib.detail)), lib.mat.strawberry());
  const dip = new Batch(lib.shape('x2-berryDip', () => berryDipGeometry(lib.detail)), chocolate(lib));
  const extras = new Batch(lib.shape(`x2-berryExtras${darkLines ? 'D' : 'L'}`, () => berryExtrasGeometry(lib.detail, darkLines)), paper(lib), smallCast(ctx));
  let count = 0;
  const put = (x, y, z, q, s) => {
    berry.add(x, y, z, q, s, BERRY_TINTS[count++ % 3], 0.12 * s);
    dip.add(x, y, z, q, s, tone, 0.12 * s);
    extras.add(x, y, z, q, s, null, 0.12 * s);
  };
  const y0 = layout.topY;
  if (zone === 'center') {
    const spots = decorSpots(ctx, 'center', { size: 0.125, count: 7, k, seed: 'morangos' });
    spots.forEach((sp, i) => {
      if (i === 0) {
        // o do meio em pé, com a ponta de chocolate para cima
        _q.setFromAxisAngle(_x.set(1, 0, 0), Math.PI).premultiply(_q2.setFromAxisAngle(Y, 0.4));
        put(sp.x, y0 + 0.162, sp.z, _q, 1.1);
        return;
      }
      leanQuat(sp.ox, sp.oz, 1.0 + r() * 0.3, (r() - 0.5) * 0.5, _q);
      const s = 0.9 + r() * 0.18;
      put(sp.x, y0 + 0.098 * s, sp.z, _q, s);
    });
    groundBlob(ctx, part, m.center.x, m.center.z, pileRadius(spots, m.center) + 0.16);
  } else {
    decorSpots(ctx, zone, { size: 0.14, k, seed: 'morangos' }).forEach((sp) => {
      leanQuat(sp.ox, sp.oz, 0.92 + r() * 0.3, (r() - 0.5) * 0.5, _q);
      const s = (0.9 + r() * 0.18) * sp.taper;
      put(sp.x, y0 + 0.098 * s, sp.z, _q, s);
    });
  }
  part.add(berry, m);
  part.add(dip, m);
  part.add(extras, m);
}

/* ───────── Cerejas ───────── */

/** Cereja: bolinha levemente achatada, com a covinha do cabo e um sulco; cabinho fino e curvo com o nó na ponta. */
function cherryGeometry(D, variant) {
  const lowp = D < 1;
  const R = 0.1;
  const body = surface(lowp ? 7 : 12, lowp ? 10 : 18, (u, v, p) => {
    const phi = -Math.PI / 2 + u * Math.PI;
    const a = v * TAU;
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    const groove = 1 - 0.04 * Math.exp(-(((a - Math.PI) / 0.32) ** 2)) * c;
    const rad = R * c * (1 + 0.07 * s) * groove;
    const dimple = s > 0 ? 0.034 * Math.exp(-((rad / 0.04) ** 2)) : 0;
    p.set(rad * Math.sin(a), R * 0.93 * (1 + s) - dimple, rad * Math.cos(a));
    return (0.74 + 0.26 * smooth(-1, -0.3, s)) * (1 - (s > 0 ? 0.5 * Math.exp(-((rad / 0.03) ** 2)) : 0));
  }, { wrapV: true, shade: true, orient: true });
  const bx = variant ? -0.035 : 0.075;
  const bz = variant ? 0.06 : -0.015;
  const len = variant ? 0.3 : 0.27;
  const stem = tube(
    lowp ? 4 : 8,
    lowp ? 4 : 5,
    (u, P) => P.set(bx * Math.pow(u, 1.7), 0.15 + len * u - 0.03 * u * u, bz * u * u),
    (u) => 0.0046 + 0.0042 * smooth(0.84, 1, u) + 0.0014 * (1 - u),
    (u) => 1 - 0.3 * smooth(0.75, 1, u),
    _x.set(1, 0, 0.3).normalize().clone(),
  );
  return mergeGeometries([piece(body, '#b90f27'), piece(stem, '#7f8d3a')]);
}

const CHERRY_TINTS = ['#ffffff', '#f2d6d6', '#ffe4dc', '#e2c2c2'];

function buildCherries(ctx, part) {
  const { m, lib, layout } = ctx;
  const zone = zoneOf(ctx, 'cerejas');
  const k = quantityOf(ctx, 'cerejas');
  const r = rng(hashString(`cerejas${m.shape}${m.R}${zone}`));
  const kinds = [0, 1].map((v) => new Batch(lib.shape(`x2-cherry${v}`, () => cherryGeometry(lib.detail, v)), candy(lib)));
  const put = (x, y, z, ox, oz, tilt, s) => {
    // o cabo cai um pouco para fora do arranjo
    const a = Math.atan2(oz, ox) + (r() - 0.5) * 1.6;
    _y.set(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
    axisQuat(_y, r() * TAU, _q);
    kinds[r() < 0.5 ? 0 : 1].add(x, y - 0.006 * s, z, _q, s, pick(CHERRY_TINTS, r), 0.1 * s);
  };
  if (zone === 'center') {
    const spots = pileSpots(ctx, { size: 0.104, count: 7, k, seed: 'cerejas', rise: 0.15 });
    spots.forEach((sp, i) => put(sp.x, sp.y, sp.z, sp.ox, sp.oz, i === 0 && spots.length < 8 ? 0.1 : 0.2 + r() * 0.35, 0.94 + r() * 0.12));
    groundBlob(ctx, part, m.center.x, m.center.z, pileRadius(spots, m.center) + 0.14);
  } else {
    spotsFor(ctx, zone, { size: zone === 'scatter' ? 0.13 : 0.125, r: 0.1, count: 8, k, seed: 'cerejas' }).forEach((sp) => {
      put(sp.x, sp.y, sp.z, sp.ox, sp.oz, 0.08 + r() * 0.3, (0.9 + r() * 0.16) * sp.taper);
    });
  }
  kinds.forEach((b) => part.add(b, m));
}

/* ───────── Margaridas ───────── */

/**
 * Margarida: uma volta de pétalas compridas, de ponta redonda e com um vinco no meio; por baixo, outra volta
 * desencontrada e mais escura, que aparece nos vãos e separa as pétalas (no celular, só a de cima).
 */
function daisyGeometry(D) {
  const lowp = D < 1;
  const parts = [];
  const layers = lowp ? [{ n: 14, len: 1, lift: 0.004, off: 0, tone: 1 }] : [{ n: 15, len: 1.04, lift: 0, off: 0.5, tone: 0.86 }, { n: 15, len: 1, lift: 0.007, off: 0, tone: 1 }];
  layers.forEach((L) => {
    for (let i = 0; i < L.n; i++) {
      const wob = 0.92 + 0.16 * hash2(i, L.n + L.off * 7);
      const g = surface(lowp ? 2 : 4, 2, (u, v, p) => {
        const vv = v * 2 - 1;
        // estreita junto ao miolo, mais larga a 2/3 do comprimento, ponta arredondada
        const w = 0.0215 * (0.4 + 0.6 * smooth(0, 0.6, u)) * Math.pow(Math.max(0, 1 - Math.pow(u, 5)), 0.5);
        p.set(0.024 + u * 0.102 * L.len * wob, 0.01 + L.lift + 0.016 * Math.sin(Math.PI * u * 0.8) * wob - 0.012 * u * u * u + 0.42 * Math.abs(vv) * w, vv * w);
        return L.tone * (0.6 + 0.4 * smooth(0, 0.55, u)) * (vv === 0 ? 0.86 : 1) * (0.94 + 0.06 * (i % 2));
      }, { shade: true });
      g.rotateY(((i + L.off) / L.n) * TAU + (hash2(i, 3) - 0.5) * 0.1);
      parts.push(plain(g));
    }
  });
  return mergeGeometries(parts);
}

/** Miolo da margarida: botão baixo e granulado, mais alaranjado na beirada. */
function daisyCoreGeometry(D) {
  const lowp = D < 1;
  return lathe(
    lowp
      ? [[0.001, 0.036, 1], [0.024, 0.031, 0.95], [0.036, 0.016, 0.72], [0.034, 0.006, 0.55]]
      : [[0.001, 0.037, 1, 0.003], [0.014, 0.035, 1, 0.004], [0.026, 0.03, 0.93, 0.004], [0.034, 0.021, 0.8, 0.003], [0.038, 0.011, 0.64], [0.034, 0.005, 0.5]],
    lowp ? 7 : 12,
  );
}

function buildDaisies(ctx, part) {
  const { m, lib, layout } = ctx;
  const zone = zoneOf(ctx, 'margaridas');
  const k = quantityOf(ctx, 'margaridas');
  const r = rng(hashString(`margaridas${m.shape}${m.R}${zone}`));
  const color = shown(layout.opt('margaridas').color);
  const pale = lightOf(color) > 0.86;
  const tints = pale ? [mix(color, '#efe9dc', 0.5), mix(color, '#efe9dc', 0.5), mix(color, '#f3e7cf', 0.6)] : [color, mix(color, '#ffffff', 0.25), mix(color, '#ffffff', 0.5)];
  // miolo amarelo; em pétalas amarelas ou alaranjadas ele fica castanho para não sumir
  new THREE.Color(color).getHSL(_hsl, SRGB);
  const yellowish = _hsl.s > 0.4 && _hsl.h > 0.06 && _hsl.h < 0.2;
  const core = yellowish ? '#8a5a2b' : '#f2ac1c';
  const petals = new Batch(lib.shape('x2-daisy', () => daisyGeometry(lib.detail)), lib.mat.petal(), smallCast(ctx));
  const cores = new Batch(lib.shape('x2-daisyCore', () => daisyCoreGeometry(lib.detail)), matte(lib), { cast: false });
  const leaves = new Batch(lib.geo.leaf(), lib.mat.leaf(), { cast: false });
  let n = 0;
  const leafAt = (x, y, z, a, s) => {
    _x.set(Math.cos(a), 0.1, Math.sin(a));
    frameQuat(_x, Y, _q2);
    leaves.add(x + Math.cos(a) * 0.07 * s, y + 0.002, z + Math.sin(a) * 0.07 * s, _q2, 0.82 * s, n % 2 ? '#ffffff' : '#dcefc8', 0.1);
  };
  spotsFor(ctx, zone, { size: zone === 'scatter' ? 0.15 : 0.128, r: 0.125, count: 8, k, seed: 'margaridas' }).forEach((sp, i) => {
    const s = (zone === 'scatter' ? 0.86 + r() * 0.3 : i % 2 ? 0.8 : 1.04) * sp.taper;
    if (sp.side) {
      wallQuat(sp.ox, sp.oz, r() * TAU, 0.3, _q);
      const x = sp.x - sp.ox * 0.04;
      const z = sp.z - sp.oz * 0.04;
      petals.add(x, sp.y, z, _q, s, pick(tints, r), 0.12 * s);
      cores.add(x, sp.y, z, _q, s, core, 0.04);
      if (i % 2 === 0) {
        _x.set(-sp.oz, 0.5, sp.ox);
        frameQuat(_x, _y.set(sp.ox, 0.3, sp.oz), _q2);
        leaves.add(x, sp.y - 0.02, z, _q2, 0.9 * s, '#dcefc8', 0.1);
      }
      n++;
      return;
    }
    // as da coroa alternam um pouco para dentro e para fora, como uma guirlanda
    const inward = zone === 'scatter' || zone === 'cascade' ? 0 : i % 2 ? 0.035 : -0.012;
    const x = sp.x - sp.ox * inward;
    const z = sp.z - sp.oz * inward;
    uprightQuat(r, 0.13, _q);
    petals.add(x, sp.y + 0.002 + (i % 2) * 0.004, z, _q, s, pick(tints, r), 0.12 * s);
    cores.add(x, sp.y + 0.002 + (i % 2) * 0.004, z, _q, s, core, 0.04);
    if (n % 2 === 0) leafAt(x, sp.y, z, Math.atan2(sp.oz, sp.ox) + Math.PI + (r() - 0.5) * 2.4, s);
    n++;
    // guirlanda: a cada duas, mais uma na lateral, logo abaixo da borda (a coroa "transborda" e aparece de frente)
    if ((zone === 'crown' || zone === 'left' || zone === 'right') && !m.naked && i % 2 === 0) {
      const a = Math.atan2(sp.z - m.center.z, sp.x - m.center.x) + (r() - 0.5) * 0.08;
      const d = rayHit(m.frost, m.center.x, m.center.z, a) + wallOut(ctx);
      const s2 = (0.78 + r() * 0.26) * sp.taper;
      wallQuat(Math.cos(a), Math.sin(a), r() * TAU, 0.12, _q);
      const y = m.y0 + m.Ht - m.rf - 0.12 - r() * 0.1;
      petals.add(m.center.x + Math.cos(a) * d, y, m.center.z + Math.sin(a) * d, _q, s2, pick(tints, r), 0.12 * s2);
      cores.add(m.center.x + Math.cos(a) * d, y, m.center.z + Math.sin(a) * d, _q, s2, core, 0.04);
    }
  });
  if (zone === 'scatter' && !m.naked) {
    // espalhadas: algumas também na lateral do andar de cima, mais juntas da borda e rareando para baixo
    const pt = {};
    const placed = [];
    const sideH = m.Ht - m.rf;
    const want = Math.round(m.frost.length * 1.1 * k);
    for (let tries = 0; tries < want * 12 && placed.length < want; tries++) {
      const at = r() * m.frost.length;
      const y = m.y0 + sideH - 0.15 - Math.pow(r(), 1.5) * Math.min(0.55, sideH * 0.6);
      if (y < m.y0 + 0.16 || placed.some((q) => Math.hypot(Math.min(Math.abs(q.at - at), m.frost.length - Math.abs(q.at - at)), q.y - y) < 0.27)) continue;
      placed.push({ at, y });
      pathAt(m.frost, at, pt);
      const s = 0.8 + r() * 0.3;
      wallQuat(pt.nx, pt.nz, r() * TAU, 0, _q);
      const px = pt.x + pt.nx * wallOut(ctx);
      const pz = pt.z + pt.nz * wallOut(ctx);
      petals.add(px, y, pz, _q, s, pick(tints, r), 0.12 * s);
      cores.add(px, y, pz, _q, s, core, 0.04);
    }
  }
  part.add(leaves, m);
  part.add(petals, m);
  part.add(cores, m);
}

/* ───────── Peônias ───────── */

/**
 * Peônia: flor grande e cheia, em forma de bola aberta. São taças de pétalas, uma dentro da outra: as de fora
 * largas e abertas, as de dentro cada vez mais altas e fechadas, até o miolo de babados. Cada pétala tem a
 * borda ondulada e um entalhe no meio; o fundo de cada taça vem sombreado nos vértices.
 */
function peonyGeometry(D) {
  const lowp = D < 1;
  const nu = lowp ? 3 : 6;
  const nv = lowp ? 4 : 8;
  // de fora para dentro: n pétalas · r0 = onde a pétala nasce · r1 = raio da borda · h = altura da borda ·
  // span = meia-abertura (rad) · roll = quanto a borda fecha para dentro (negativo: abre)
  const rings = lowp
    ? [
        { n: 5, r0: 0.05, r1: 0.238, h: 0.088, span: 0.7, roll: -0.018, tone: 0.97, off: 0 },
        { n: 5, r0: 0.045, r1: 0.208, h: 0.14, span: 0.7, roll: -0.004, tone: 0.95, off: 0.5 },
        { n: 6, r0: 0.036, r1: 0.158, h: 0.195, span: 0.6, roll: 0.012, tone: 0.9, off: 0.25 },
        { n: 5, r0: 0.024, r1: 0.11, h: 0.218, span: 0.7, roll: 0.022, tone: 0.82, off: 0.7 },
        { n: 4, r0: 0.012, r1: 0.064, h: 0.226, span: 0.9, roll: 0.024, tone: 0.72, off: 0.1 },
        { n: 3, r0: 0.003, r1: 0.024, h: 0.21, span: 1.2, roll: 0.008, tone: 0.6, off: 0.3 },
      ]
    : [
        { n: 6, r0: 0.05, r1: 0.238, h: 0.088, span: 0.6, roll: -0.018, tone: 0.97, off: 0 },
        { n: 6, r0: 0.045, r1: 0.212, h: 0.138, span: 0.6, roll: -0.004, tone: 0.96, off: 0.5 },
        { n: 7, r0: 0.04, r1: 0.172, h: 0.186, span: 0.52, roll: 0.01, tone: 0.92, off: 0.2 },
        { n: 6, r0: 0.03, r1: 0.132, h: 0.208, span: 0.6, roll: 0.02, tone: 0.86, off: 0.65 },
        { n: 5, r0: 0.02, r1: 0.092, h: 0.222, span: 0.72, roll: 0.026, tone: 0.79, off: 0.1 },
        { n: 4, r0: 0.01, r1: 0.054, h: 0.226, span: 0.9, roll: 0.022, tone: 0.7, off: 0.4 },
        { n: 3, r0: 0.003, r1: 0.022, h: 0.212, span: 1.2, roll: 0.008, tone: 0.6, off: 0.3 },
      ];
  const parts = [];
  rings.forEach((ring, k) => {
    for (let i = 0; i < ring.n; i++) {
      const phi = ((i + ring.off) / ring.n) * TAU + (hash2(i, k + 3) - 0.5) * 0.16;
      const ph = hash2(i, k) * TAU;
      const tall = 0.93 + 0.14 * hash2(k, i + 5);
      const size = 0.5 + 0.5 * (ring.r1 / 0.25); // babados proporcionais ao tamanho da pétala
      parts.push(
        plain(
          surface(nu, nv, (u, v, p) => {
            const vv = v * 2 - 1;
            const t = (u * Math.PI) / 2;
            const wide = 0.3 + 0.7 * Math.sin(Math.min(1, u * 1.4) * (Math.PI / 2));
            const edge = Math.pow(u, 3);
            const ruff = Math.cos(vv * 4.1 + ph); // babado: uma onda e pouco por pétala, cada uma começando num ponto
            const notch = Math.exp(-((vv / 0.24) ** 2));
            const a = phi + vv * ring.span * wide;
            // taça: a pétala sai quase deitada e vai ficando em pé até a borda
            const rad = ring.r0 + (ring.r1 - ring.r0) * Math.pow(Math.sin(t), 0.85) - ring.roll * Math.pow(u, 4) + (0.014 * edge * ruff + 0.01 * vv * u) * size;
            // borda larga, de cantos arredondados, com babado e um entalhe no meio
            const y = ring.h * tall * Math.pow(1 - Math.cos(t), 0.82) * (1 - 0.03 * vv * vv * u - 0.09 * Math.pow(Math.abs(vv), 6) * edge) + (0.017 * edge * ruff - 0.03 * edge * notch + 0.008 * vv * u) * size;
            p.set(rad * Math.cos(a), y + 0.004, rad * Math.sin(a));
            const base = k === 0 ? 0.74 : 0.34; // a taça de fora é vista por baixo: não escurece tanto
            return ring.tone * (base + (1 - base) * Math.pow(u, 1.25)) * (1 - 0.08 * vv * vv) * (1 - 0.16 * edge * (1 - ruff) * 0.5);
          }, { shade: true }),
        ),
      );
    }
  });
  return mergeGeometries(parts);
}

function buildPeonies(ctx, part) {
  const { m, lib, layout } = ctx;
  const zone = zoneOf(ctx, 'peonias');
  const k = quantityOf(ctx, 'peonias');
  const r = rng(hashString(`peonias${m.shape}${m.R}${zone}`));
  const color = shown(layout.opt('peonias').color);
  const tints = [shift(color, 0, 1.08, -0.03), color, mix(color, '#ffffff', 0.18), shift(color, 0.01, 1.1, -0.07)];
  const flowers = new Batch(lib.shape('x2-peony', () => peonyGeometry(lib.detail)), lib.mat.petal());
  const leaves = new Batch(lib.geo.leaf(), lib.mat.leaf(), smallCast(ctx));
  const y0 = layout.topY;
  const room = layout.rho - layout.border;
  const scale = clamp(0.74 + layout.rho * 0.5, 0.95, 1.36);
  const dir = new THREE.Vector3();
  const flowerAt = (x, z, s, ox, oz, tilt, tint) => {
    _y.set(ox * Math.sin(tilt), Math.cos(tilt), oz * Math.sin(tilt)).normalize();
    axisQuat(_y, r() * TAU, _q);
    flowers.add(x, y0 + 0.004, z, _q, s, tint ?? pick(tints, r), 0.24 * s);
    const n = 2 + (r() < 0.5 ? 1 : 0);
    const a0 = r() * TAU;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU + (r() - 0.5) * 0.7;
      _x.set(Math.cos(a), 0.14, Math.sin(a));
      frameQuat(_x, Y, _q);
      leaves.add(x + Math.cos(a) * 0.17 * s, y0 + 0.004, z + Math.sin(a) * 0.17 * s, _q, (1.25 + r() * 0.35) * s, r() < 0.5 ? '#ffffff' : '#dcefc8', 0.16);
    }
  };
  if (zone === 'center') {
    const cx = m.center.x;
    const cz = m.center.z;
    const main = Math.min(scale, (room - 0.02) / 0.26);
    flowerAt(cx, cz, main, 0, 1, 0.1, tints[0]);
    // em volta, flores menores encostadas na principal, viradas para fora
    const around = k < 1 ? 0 : k > 1 ? 4 : 2;
    const d = 0.34 * main;
    const small = Math.min(0.64 * main, (room - d - 0.01) / 0.26);
    if (small > 0.38) {
      for (let i = 0; i < around; i++) {
        const a = (around === 2 ? 0.25 + i * Math.PI * 0.9 : 0.6 + (i / around) * TAU) + (r() - 0.5) * 0.3;
        flowerAt(cx + Math.cos(a) * d, cz + Math.sin(a) * d, small * (0.92 + r() * 0.14), Math.cos(a), Math.sin(a), 0.42, tints[1 + (i % 3)]);
      }
    }
    groundBlob(ctx, part, cx, cz, Math.min(room, 0.3 * main + (around ? d : 0)));
  } else if (zone === 'cascade') {
    spotsFor(ctx, zone, { size: 0.2, r: 0.2 * scale, count: 5, k, seed: 'peonias' }).forEach((sp, i) => {
      const s = scale * sp.taper * (i === 0 ? 0.82 : 0.5 + r() * 0.2);
      if (!sp.side) {
        keepInside(ctx, sp, 0.17 * s); // a flor do topo fica na borda, sem pender para fora
        return flowerAt(sp.x, sp.z, s, sp.ox, sp.oz, 0.25);
      }
      // na lateral: de frente para fora, quase sem inclinar, com a base encostada na cobertura
      dir.set(sp.ox, 0.16, sp.oz).normalize();
      axisQuat(dir, r() * TAU, _q);
      const back = 0.07 - 0.03 * s;
      flowers.add(sp.x - sp.ox * back, sp.y, sp.z - sp.oz * back, _q, s * 0.84, pick(tints, r), 0.2);
      _x.set(-sp.oz, 0.6, sp.ox);
      frameQuat(_x, dir, _q);
      leaves.add(sp.x - sp.ox * 0.06, sp.y - 0.03, sp.z - sp.oz * 0.06, _q, 1.4 * s, '#dcefc8', 0.14);
      return null;
    });
  } else {
    // meia-lua: a maior no meio do arco, diminuindo para as pontas
    const size = Math.min(0.2 * scale, (room - 0.02) / 2.2);
    decorSpots(ctx, zone, { size, k: k * 0.8, seed: 'peonias' }).forEach((sp) => {
      const s = (size / 0.2) * (0.62 + 0.4 * Math.sin(Math.PI * sp.u));
      flowerAt(sp.x, sp.z, s * 0.8, sp.ox, sp.oz, 0.22);
    });
  }
  part.add(leaves, m);
  part.add(flowers, m);
}

/* ───────── Macarons ───────── */

const MAC_T = 0.164; // altura total (duas casquinhas + recheio)

/** As duas casquinhas: cúpula lisa e baixa, e na base o "pezinho" — o anel rugoso que estufa no forno. */
function macaronShellsGeometry(D) {
  const lowp = D < 1;
  const top = lathe(
    lowp
      ? [[0.001, 0.082, 1], [0.085, 0.078, 1], [0.137, 0.058, 0.97], [0.15, 0.037, 0.92], [0.156, 0.028, 0.74, 0.008], [0.146, 0.018, 0.6, 0.004]]
      : [[0.001, 0.082, 1], [0.05, 0.081, 1], [0.096, 0.076, 1], [0.128, 0.064, 0.98], [0.145, 0.049, 0.96], [0.1505, 0.037, 0.9], [0.155, 0.033, 0.74, 0.007], [0.157, 0.026, 0.8, 0.008], [0.153, 0.02, 0.68, 0.006], [0.135, 0.018, 0.55]],
    lowp ? 14 : 24,
  );
  const bottom = top.clone().rotateX(Math.PI);
  return mergeGeometries([top, bottom]);
}

/** Recheio: um disco de creme um pouco irregular, que quase chega na borda das casquinhas. */
function macaronFillingGeometry(D) {
  const lowp = D < 1;
  return lathe(
    lowp ? [[0.138, 0.02, 0.8], [0.147, 0, 1], [0.138, -0.02, 0.8]] : [[0.136, 0.021, 0.74], [0.146, 0.01, 0.96], [0.148, 0, 1], [0.146, -0.01, 0.96], [0.136, -0.021, 0.74]],
    lowp ? 14 : 24,
    (a) => 1 + 0.014 * Math.sin(3 * a + 1) + 0.008 * Math.sin(7 * a),
  );
}

function buildMacarons(ctx, part) {
  const { m, lib, layout } = ctx;
  const zone = zoneOf(ctx, 'macarons');
  const k = quantityOf(ctx, 'macarons');
  const r = rng(hashString(`macarons${m.shape}${m.R}${zone}`));
  const color = layout.opt('macarons').color;
  const tints = tintsOf(color);
  const creams = ['#f6eee0', '#f6eee0', mix(tints[0], '#ffffff', 0.7)];
  const shells = new Batch(lib.shape('x2-macaron', () => macaronShellsGeometry(lib.detail)), matte(lib));
  const filling = new Batch(lib.shape('x2-macaronFill', () => macaronFillingGeometry(lib.detail)), matte(lib), { cast: false });
  let n = 0;
  const put = (x, y, z, q, s = 1) => {
    const t = n++ % tints.length;
    shells.add(x, y, z, q, s, tints[t], 0.15 * s);
    filling.add(x, y, z, q, s, creams[t], 0.15 * s);
  };
  const y0 = layout.topY;
  const R = 0.153;
  const flat = (x, z, y = y0) => {
    uprightQuat(r, 0.05, _q);
    put(x, y + MAC_T / 2 - 0.004, z, _q);
  };
  if (zone === 'center') {
    // pilha: uma roda de macarons deitados e outros apoiados por cima, inclinados
    const spots = pileSpots(ctx, { size: 0.158, count: 6, k, seed: 'macarons', rise: MAC_T - 0.01 });
    spots.forEach((sp) => {
      if (!sp.level) return flat(sp.x, sp.z);
      discQuat(sp.ox, sp.oz, 1.12 + r() * 0.2, r() * TAU, _q);
      put(sp.x, sp.y + MAC_T / 2 + 0.03, sp.z, _q);
      return null;
    });
    groundBlob(ctx, part, m.center.x, m.center.z, pileRadius(spots, m.center) + 0.2);
  } else if (zone === 'cascade') {
    spotsFor(ctx, zone, { size: 0.155, r: R, count: 5, k, seed: 'macarons' }).forEach((sp, i) => {
      if (!sp.side) return flat(sp.x, sp.z);
      // na lateral ficam colados pela casquinha de baixo, de frente para fora; um sim, um não, apoiado
      // sobre os vizinhos (mais para fora e um pouco inclinado), como telhas
      const over = i % 2 ? 1 : 0;
      wallQuat(sp.ox, sp.oz, r() * TAU, over * 0.2 + (r() - 0.5) * 0.12, _q);
      const d = MAC_T / 2 - 0.155 * 0.35 - 0.012 + over * 0.07;
      put(sp.x + sp.ox * d, sp.y, sp.z + sp.oz * d, _q, 0.9 + 0.1 * sp.taper - (i % 3 === 2 ? 0.08 : 0));
      return null;
    });
  } else {
    // coroa / meia-lua: em fila, cada um deitado sobre o anterior (como dominós caídos)
    const spots = decorSpots(ctx, zone, { size: 0.16, k: k * 1.75, seed: 'macarons' });
    const open = zone !== 'crown';
    spots.forEach((sp, i) => {
      const prev = spots[(i + spots.length - 1) % spots.length];
      const step = Math.hypot(sp.x - prev.x, sp.z - prev.z) || 0.24;
      // tangente no sentido da fila; a normal do disco aponta para a frente da fila e para cima
      let elev = Math.acos(clamp((MAC_T * 0.97) / step, 0, 1));
      if (open && i === 0) elev = Math.PI / 2 - 0.04; // o primeiro da meia-lua não tem em quem se apoiar: fica deitado
      discQuat(-sp.oz, sp.ox, elev, r() * TAU, _q);
      put(sp.x, y0 + R * Math.cos(elev) + (MAC_T / 2) * Math.sin(elev) - 0.004, sp.z, _q);
    });
  }
  part.add(shells, m);
  part.add(filling, m);
}

/* ───────── Brigadeiros ───────── */

const GRANULE = ['#2a1409', '#3a1d0e', '#4b2713', '#5a3119', '#6a3c20'];

/** Brigadeiro: bolinha de chocolate coberta de granulado (cada confeito é um bastãozinho deitado na superfície). */
function brigadeiroGeometry(D) {
  const lowp = D < 1;
  const R = 0.1;
  const cy = 0.106;
  const r = rng(808);
  const ball = piece(new THREE.SphereGeometry(R, lowp ? 10 : 16, lowp ? 6 : 10).translate(0, cy, 0));
  // massa manchada: tons de chocolate por baixo do granulado
  const col = ball.attributes.color;
  const pos = ball.attributes.position;
  for (let i = 0; i < col.count; i++) {
    const t = 0.72 + 0.5 * hash2(Math.round(pos.getX(i) * 900) + Math.round(pos.getZ(i) * 300), Math.round(pos.getY(i) * 900));
    col.setXYZ(i, t, t, t);
  }
  const parts = [dye(ball, '#3b1e0f')];
  const n = lowp ? 30 : 80;
  const nor = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  for (let i = 0; i < n; i++) {
    const lat = Math.acos(1 - 1.66 * ((i + 0.5) / n)); // do alto até um pouco abaixo do meio (o resto fica na forminha)
    const lon = i * 2.39996 + r() * 0.6;
    nor.set(Math.sin(lat) * Math.cos(lon), Math.cos(lat), Math.sin(lat) * Math.sin(lon));
    tan.set(-nor.z, 0.001, nor.x).normalize().applyAxisAngle(nor, r() * TAU);
    const len = (lowp ? 0.042 : 0.03) * (0.8 + r() * 0.4);
    const th = lowp ? 0.0125 : 0.009;
    const g = lowp ? new THREE.CylinderGeometry(th * 0.6, th * 0.6, len, 3, 1, true) : new THREE.BoxGeometry(th, len, th);
    frameQuat(_x.crossVectors(tan, nor), tan, quat); // o comprimento (Y) do confeito deita na tangente
    g.applyQuaternion(quat);
    g.translate(nor.x * (R + th * 0.28), cy + nor.y * (R + th * 0.28), nor.z * (R + th * 0.28));
    parts.push(piece(g, pick(GRANULE, r)));
  }
  return mergeGeometries(parts);
}

/** Forminha de papel plissada: abre para cima como uma flor, abraçando a metade de baixo do docinho. */
function cupGeometry(D, { r0 = 0.062, grow = 0.068, h = 0.086 } = {}) {
  const pleats = D < 1 ? 14 : 22;
  const rows = D < 1 ? 1 : 2;
  return surface(rows, pleats * 2, (u, v, p) => {
    const zig = Math.round(v * pleats * 2) % 2 ? 1 : -1;
    const rad = r0 + grow * Math.pow(u, 0.75) + zig * (0.002 + 0.0068 * u);
    const a = v * TAU;
    p.set(rad * Math.sin(a), h * u, rad * Math.cos(a));
    return (zig > 0 ? 1 : 0.7) * (0.8 + 0.2 * u);
  }, { wrapV: true, shade: true, orient: true });
}

function buildBrigadeiros(ctx, part) {
  const { m, lib, layout } = ctx;
  const zone = zoneOf(ctx, 'brigadeiros');
  const k = quantityOf(ctx, 'brigadeiros');
  const r = rng(hashString(`brigadeiros${m.shape}${m.R}${zone}`));
  const balls = new Batch(lib.shape('x2-brigadeiro', () => brigadeiroGeometry(lib.detail)), chocolate(lib));
  const cups = new Batch(lib.shape('x2-cup', () => cupGeometry(lib.detail)), paper(lib), smallCast(ctx));
  const CUPS = ['#ffffff', '#fff6e8', '#ffffff'];
  const put = (sp, s) => {
    _q.setFromAxisAngle(Y, r() * TAU);
    balls.add(sp.x, sp.y, sp.z, _q, s, r() < 0.3 ? '#f1e4de' : '#ffffff', 0.13 * s);
    cups.add(sp.x, sp.y + 0.002, sp.z, _q, s, pick(CUPS, r), 0.13 * s);
  };
  if (zone === 'center') {
    const spots = decorSpots(ctx, 'center', { size: 0.136, count: 7, k, seed: 'brigadeiros' });
    spots.forEach((sp) => put(sp, 0.96 + r() * 0.08));
    groundBlob(ctx, part, m.center.x, m.center.z, pileRadius(spots, m.center) + 0.16);
  } else {
    decorSpots(ctx, zone, { size: 0.16, k, seed: 'brigadeiros' }).forEach((sp) => put(sp, (0.96 + r() * 0.08) * (0.8 + 0.2 * sp.taper)));
  }
  part.add(cups, m);
  part.add(balls, m);
}

/* ───────── Bombons e trufas ───────── */

/** Bombom em cúpula, de chocolate ao leite, com fio de calda clara em zigue-zague. */
function bombomDomeGeometry(D) {
  const lowp = D < 1;
  const R = 0.118;
  const H = 0.124;
  const foot = 0.014;
  const h = (rho) => foot + H * Math.pow(Math.cos(Math.asin(Math.pow(Math.min(1, rho / R), 1 / 0.8))), 0.75);
  const rows = lowp ? 5 : 9;
  const profile = [];
  for (let i = 0; i <= rows; i++) {
    const t = (i / rows) * (Math.PI / 2);
    profile.push([i === 0 ? 0.001 : R * Math.pow(Math.sin(t), 0.8), foot + H * Math.pow(Math.cos(t), 0.75), 0.86 + 0.14 * Math.cos(t)]);
  }
  profile.push([R * 0.985, 0, 0.7]);
  const body = lathe(profile, lowp ? 12 : 20);
  const lines = trail(lowp ? 26 : 54, (u, P, N) => {
    const x = (u * 2 - 1) * 0.086;
    onDome(h, x, 0.092 * Math.sqrt(1 - (x / 0.104) ** 2) * Math.sin(u * TAU * 4.5), 0.0005, P, N);
  }, 0.012, 0.005);
  return mergeGeometries([piece(body, '#6b3d21'), piece(lines, '#f3e2c6')]);
}

/** Bombom quadrado de cantos arredondados, com duas listras e uma lasca de amêndoa em cima. */
function bombomCubeGeometry(D) {
  const lowp = D < 1;
  const a = 0.098;
  const H = 0.112;
  const sq = (ang) => 1 / Math.pow(Math.pow(Math.abs(Math.cos(ang)), 6) + Math.pow(Math.abs(Math.sin(ang)), 6), 1 / 6);
  const rows = lowp
    ? [[0.97, 0, 0.72], [1, 0.02, 0.9], [1, H - 0.016, 1], [0.9, H, 1], [0.001, H + 0.002, 1]]
    : [[0.96, 0, 0.7], [1, 0.016, 0.88], [1, H - 0.022, 1], [0.975, H - 0.008, 1], [0.9, H, 1], [0.5, H + 0.002, 1], [0.001, H + 0.002, 1]];
  const body = lathe(rows.map(([k, y, t]) => [a * k, y, t]), lowp ? 16 : 24, (ang) => sq(ang));
  // listras na diagonal, a `off` do meio do bombom
  const stripe = (off) =>
    trail(lowp ? 3 : 6, (u, P, N) => {
      const t = (u * 2 - 1) * (0.106 - Math.abs(off));
      P.set((t + off) * Math.SQRT1_2, H + 0.0025, (t - off) * Math.SQRT1_2);
      N.set(0, 1, 0);
    }, 0.014, 0.005);
  const nut = new THREE.SphereGeometry(1, lowp ? 6 : 10, lowp ? 4 : 6).scale(0.03, 0.009, 0.016).rotateY(-0.5).translate(0.03, H + 0.008, -0.03);
  return mergeGeometries([piece(body, '#7a4526'), piece(stripe(-0.018), '#2e170c'), piece(stripe(-0.058), '#2e170c'), piece(nut, '#edd2a4')]);
}

/** Trufa: bolinha de chocolate branco, um pouco irregular, com um fio de calda escura em espiral. */
function truffleGeometry(D) {
  const lowp = D < 1;
  const R = 0.104;
  const cy = 0.097;
  const nu = lowp ? 6 : 10;
  const nv = lowp ? 10 : 16;
  const body = surface(nu, nv, (u, v, p) => {
    const phi = -Math.PI / 2 + u * Math.PI;
    const i = Math.round(u * nu);
    const j = Math.round(v * nv) % nv;
    const rad = R * (1 + (i > 0 && i < nu ? 0.045 * (hash2(i, j) - 0.5) : 0));
    const a = v * TAU;
    p.set(rad * Math.cos(phi) * Math.sin(a), Math.max(0.004, cy + rad * Math.sin(phi)), rad * Math.cos(phi) * Math.cos(a));
    return 0.8 + 0.2 * smooth(-1, 0, Math.sin(phi));
  }, { wrapV: true, shade: true, orient: true });
  const lines = trail(lowp ? 28 : 56, (u, P, N) => {
    const pol = 0.1 + 1.1 * u;
    const az = u * TAU * 2.6;
    N.set(Math.sin(pol) * Math.cos(az), Math.cos(pol), Math.sin(pol) * Math.sin(az));
    P.set(0, cy, 0).addScaledVector(N, R * 1.012);
  }, 0.013, 0.0052);
  return mergeGeometries([piece(body, '#f1e1c6'), piece(lines, '#4a2814')]);
}

// cor por instância: branco = como foi pintado; o tom acastanhado escurece a peça (ao leite → meio amargo)
const BOMBOM_KINDS = [
  { key: 'x2-bombomDome', make: bombomDomeGeometry, tints: ['#ffffff', '#a08a78'], h: 0.138 },
  { key: 'x2-bombomCube', make: bombomCubeGeometry, tints: ['#ffffff', '#927c70'], h: 0.114 },
  { key: 'x2-truffle', make: truffleGeometry, tints: ['#ffffff', '#ffffff', '#e6b98a'], h: 0.2 },
];

function buildBombons(ctx, part) {
  const { m, lib } = ctx;
  const zone = zoneOf(ctx, 'bombons');
  const k = quantityOf(ctx, 'bombons');
  const r = rng(hashString(`bombons${m.shape}${m.R}${zone}`));
  const batches = BOMBOM_KINDS.map((kind) => new Batch(lib.shape(kind.key, () => kind.make(lib.detail)), chocolate(lib)));
  let n = 0;
  const put = (sp, s, tilt = 0.04) => {
    const idx = n++;
    const kind = BOMBOM_KINDS[idx % 3];
    uprightQuat(r, tilt, _q);
    batches[idx % 3].add(sp.x, sp.y - 0.002, sp.z, _q, s, kind.tints[Math.floor(idx / 3) % kind.tints.length], 0.12 * s);
  };
  if (zone === 'center') {
    const spots = pileSpots(ctx, { size: 0.124, count: 7, k, seed: 'bombons', rise: 0.128 });
    spots.forEach((sp) => put(sp, 0.96 + r() * 0.08, sp.level ? 0.14 : 0.04));
    groundBlob(ctx, part, m.center.x, m.center.z, pileRadius(spots, m.center) + 0.15);
  } else {
    spotsFor(ctx, zone, { size: 0.145, r: 0.12, count: 8, k, seed: 'bombons' }).forEach((sp) => put(sp, (0.94 + r() * 0.1) * (0.82 + 0.18 * sp.taper)));
  }
  batches.forEach((b) => part.add(b, m));
}

/* ───────── Suspiros ───────── */

/** Suspiro: gota de bico pitanga — base larga de gomos, corpo que afina torcendo e uma pontinha caída de lado. */
function meringueGeometry(D) {
  const lowp = D < 1;
  const lobes = 8;
  const r = 0.108;
  const h = 0.205;
  return surface(lowp ? 7 : 12, lobes * (lowp ? 2 : 4), (u, v, p) => {
    const a = v * TAU;
    const w = smooth(0.22, 0.8, u);
    const body = Math.pow(1 - u, 0.5) * (1 - w) + 1.12 * (1 - u) * w; // bojo redondo embaixo, cone em cima
    const foot = 0.88 + 0.12 * smooth(0, 0.14, u);
    const k = gomo(a, lobes, 0.55);
    const rad = r * body * foot * (1 - (0.26 - 0.1 * u) * (1 - k));
    const tw = a + u * 0.95;
    const bend = 0.026 * Math.pow(u, 3.5);
    p.set(rad * Math.cos(tw) + bend, h * Math.pow(u, 0.9) - 0.014 * Math.pow(u, 7), rad * Math.sin(tw));
    return (0.4 + 0.6 * k) * (0.74 + 0.26 * smooth(0, 0.3, u));
  }, { wrapV: true, shade: true, orient: true });
}

function buildMeringues(ctx, part) {
  const { m, lib, layout } = ctx;
  const zone = zoneOf(ctx, 'suspiros');
  const k = quantityOf(ctx, 'suspiros');
  const r = rng(hashString(`suspiros${m.shape}${m.R}${zone}`));
  const tints = tintsOf(layout.opt('suspiros').color);
  const batch = new Batch(lib.shape('x2-meringue', () => meringueGeometry(lib.detail)), matte(lib));
  const put = (sp, s, tilt = 0.06) => {
    uprightQuat(r, tilt, _q);
    batch.add(sp.x, sp.y - 0.003, sp.z, _q, [s, s * (0.94 + r() * 0.14), s], pick(tints, r), 0.11 * s);
  };
  if (zone === 'center') {
    const spots = pileSpots(ctx, { size: 0.112, count: 7, k, seed: 'suspiros', rise: 0.14 });
    spots.forEach((sp, i) => put(sp, i === 0 ? 1.1 : 0.88 + r() * 0.16, sp.level ? 0.25 : 0.06));
    groundBlob(ctx, part, m.center.x, m.center.z, pileRadius(spots, m.center) + 0.14);
  } else {
    const scatter = zone === 'scatter';
    spotsFor(ctx, zone, { size: scatter ? 0.13 : 0.125, r: 0.11, count: 9, k, seed: 'suspiros' }).forEach((sp, i) => {
      put(sp, (scatter ? 0.72 + r() * 0.4 : i % 2 ? 0.84 : 1.04) * (0.8 + 0.2 * sp.taper));
    });
  }
  part.add(batch, m);
}

/* ───────── Marshmallows ───────── */

/** Marshmallow: cilindro macio, de quinas bem arredondadas e lados levemente estufados. Origem no meio da peça. */
function marshmallowGeometry(D) {
  const lowp = D < 1;
  const R = 0.1;
  const H = 0.1; // meia altura
  const rc = 0.036;
  const n = lowp ? 2 : 4;
  const top = [[0.001, H, 1]];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * (Math.PI / 2);
    top.push([R - rc + rc * Math.sin(t), H - rc + rc * Math.cos(t), 1 - 0.04 * Math.sin(t)]);
  }
  const profile = [...top, [R * 1.025, 0, 0.94], ...top.map(([rad, y, tone]) => [rad, -y, tone * 0.84]).reverse()];
  return lathe(profile, lowp ? 10 : 18, (a, i) => 1 + (i > 0 && i < profile.length - 1 ? 0.018 * Math.sin(2 * a + i * 0.4) : 0));
}

function buildMarshmallows(ctx, part) {
  const { m, lib, layout } = ctx;
  const zone = zoneOf(ctx, 'marshmallows');
  const k = quantityOf(ctx, 'marshmallows');
  const r = rng(hashString(`marshmallows${m.shape}${m.R}${zone}`));
  const picked = layout.opt('marshmallows').color;
  const pale = lightOf(picked) > 0.94;
  const color = shown(picked);
  const WHITE = '#f4f1ec';
  const tints = pale ? [WHITE, '#f3cdd8', '#f3e3b6', WHITE] : [color, WHITE, mix(color, '#ffffff', 0.4), WHITE, color];
  const batch = new Batch(lib.shape('x2-marshmallow', () => marshmallowGeometry(lib.detail)), matte(lib));
  let n = 0;
  /** em pé (lying = false) ou deitado, rolado para um lado qualquer */
  const put = (x, y, z, s, lying, squash = 1) => {
    const tint = tints[n++ % tints.length];
    if (lying) {
      const a = r() * TAU;
      _y.set(Math.cos(a), (r() - 0.5) * 0.16, Math.sin(a)).normalize();
      _x.set(0, 1, 0);
      frameQuat(_x, _y, _q);
      batch.add(x, y + 0.1 * s - 0.004, z, _q, s, tint, 0.11 * s);
    } else {
      uprightQuat(r, 0.07, _q);
      batch.add(x, y + 0.1 * s * squash - 0.004, z, _q, [s, s * squash, s], tint, 0.11 * s);
    }
  };
  const minis = [];
  if (zone === 'center') {
    const spots = pileSpots(ctx, { size: 0.108, count: 8, k, seed: 'marshmallows', rise: 0.19 });
    spots.forEach((sp, i) => put(sp.x, sp.y, sp.z, 0.94 + r() * 0.1, sp.level ? r() < 0.6 : i % 3 === 1, 0.9 + r() * 0.15));
    groundBlob(ctx, part, m.center.x, m.center.z, pileRadius(spots, m.center) + 0.14);
    minis.push(...spots.filter((sp) => !sp.level));
  } else {
    const spots = spotsFor(ctx, zone, { size: zone === 'scatter' ? 0.135 : 0.118, r: 0.11, count: 9, k, seed: 'marshmallows' });
    spots.forEach((sp, i) => put(sp.x, sp.y, sp.z, (0.92 + r() * 0.12) * sp.taper, zone === 'scatter' ? r() < 0.4 : i % 3 === 2, 0.88 + r() * 0.16));
    minis.push(...spots);
  }
  // mini marshmallows soltos entre os grandes
  if (zone === 'scatter') {
    spotsFor(ctx, 'scatter', { size: 0.06, r: 0.06, count: 6, k, seed: 'minimarsh' })
      .filter((sp) => minis.every((q) => Math.hypot(q.x - sp.x, q.z - sp.z) > 0.19))
      .forEach((sp) => put(sp.x, sp.y, sp.z, 0.5, r() < 0.5));
  }
  part.add(batch, m);
}

/* ───────── Biscoito recheado ───────── */

/** Relevo genérico da bolacha (sem marca nem letras): dentinhos na borda, dois frisos, gotas e uma rosácea no meio. */
function cookieCanvas(size) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const S = size;
  const R = S / 2;
  g.fillStyle = '#24140e';
  g.fillRect(0, 0, S, S);
  const r = rng(515);
  // miolo granulado do biscoito
  for (let i = 0; i < S * 6; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(70,44,30,0.35)' : 'rgba(10,5,3,0.35)';
    g.fillRect(r() * S, r() * S, S / 128, S / 128);
  }
  g.translate(R, R);
  g.lineCap = 'round';
  // cada relevo é desenhado duas vezes: a sombra (deslocada) e o alto, mais claro
  const emboss = (draw) => {
    g.save();
    g.translate(S / 170, S / 170);
    g.strokeStyle = g.fillStyle = '#0d0604';
    draw();
    g.restore();
    g.strokeStyle = g.fillStyle = '#463024';
    draw();
  };
  g.lineWidth = S / 46;
  emboss(() => {
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TAU;
      g.beginPath();
      g.moveTo(Math.cos(a) * R * 0.86, Math.sin(a) * R * 0.86);
      g.lineTo(Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95);
      g.stroke();
    }
  });
  g.lineWidth = S / 56;
  emboss(() => {
    [0.78, 0.44].forEach((k) => {
      g.beginPath();
      g.arc(0, 0, R * k, 0, TAU);
      g.stroke();
    });
  });
  emboss(() => {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      g.beginPath();
      g.ellipse(Math.cos(a) * R * 0.61, Math.sin(a) * R * 0.61, R * 0.085, R * 0.045, a, 0, TAU);
      g.fill();
    }
  });
  emboss(() => {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      g.beginPath();
      g.ellipse(Math.cos(a) * R * 0.2, Math.sin(a) * R * 0.2, R * 0.13, R * 0.06, a, 0, TAU);
      g.fill();
    }
    g.beginPath();
    g.arc(0, 0, R * 0.07, 0, TAU);
    g.fill();
  });
  return c;
}

/** As duas bolachas: disco baixo com a face em relevo (textura) e a borda canelada. */
function cookieGeometry(D) {
  const lowp = D < 1;
  const R = 0.15;
  const c = 0.015; // meia espessura do recheio
  const t = 0.034;
  const nv = lowp ? 16 : 32;
  const top = lathe(
    [[0.001, c + t, 1], [R * 0.6, c + t, 1], [R * 0.93, c + t, 1], [R, c + t - 0.007, 0.9], [R, c + 0.004, 0.72], [R * 0.97, c, 0.6], [R * 0.6, c, 0.5]],
    nv,
    (a, i) => (i >= 3 && i <= 4 ? 1 - 0.022 * (Math.round((a / TAU) * nv) % 2) : 1),
  );
  planarUV(top, R * 1.02);
  return mergeGeometries([top, top.clone().rotateX(Math.PI)]);
}

/** Recheio: creme branco que estufa um pouco para fora entre as bolachas. */
function cookieCreamGeometry(D) {
  const lowp = D < 1;
  return lathe(lowp ? [[0.128, 0.016, 0.8], [0.136, 0, 1], [0.128, -0.016, 0.8]] : [[0.126, 0.016, 0.76], [0.135, 0.008, 0.96], [0.137, 0, 1], [0.135, -0.008, 0.96], [0.126, -0.016, 0.76]], lowp ? 12 : 24, (a) => 1 + 0.012 * Math.sin(2 * a + 0.7));
}

const COOKIE_T = 0.098;

function buildCookies(ctx, part) {
  const { m, lib, layout } = ctx;
  const zone = zoneOf(ctx, 'biscoitos');
  const k = quantityOf(ctx, 'biscoitos');
  const r = rng(hashString(`biscoitos${m.shape}${m.R}${zone}`));
  const mat = lib.custom('x2-cookie', () => {
    const map = lib.custom('x2-cookieTex', () => texture(cookieCanvas(lib.detail < 1 ? 128 : 256), { repeat: false, srgb: true, aniso: 4 }));
    return new THREE.MeshStandardMaterial({ color: 0xffffff, map, bumpMap: map, bumpScale: 1.6, roughness: 0.9, vertexColors: true });
  });
  const wafers = new Batch(lib.shape('x2-cookie', () => cookieGeometry(lib.detail)), mat);
  const cream = new Batch(lib.shape('x2-cookieCream', () => cookieCreamGeometry(lib.detail)), matte(lib), { cast: false });
  const put = (x, y, z, q, s = 1) => {
    wafers.add(x, y, z, q, s, null, 0.15 * s);
    cream.add(x, y, z, q, s, '#f6f0e4', 0.15 * s);
  };
  const y0 = layout.topY;
  const R = 0.15;
  if (zone === 'center') {
    // uma pilha no meio e outros apoiados nela, em volta
    const cx = m.center.x;
    const cz = m.center.z;
    const stack = k < 1 ? 2 : 3;
    for (let i = 0; i < stack; i++) {
      uprightQuat(r, 0.03, _q);
      put(cx + (r() - 0.5) * 0.025, y0 + COOKIE_T * (i + 0.5) - 0.003, cz + (r() - 0.5) * 0.025, _q);
    }
    const room = layout.rho - layout.border;
    const a0 = 0.5 + r() * 0.6;
    // três encostados na pilha, de face para fora e para cima…
    if (room > 0.4) {
      for (let i = 0; i < 3; i++) {
        const a = a0 + (i / 3) * TAU + (r() - 0.5) * 0.2;
        const elev = 0.56 + r() * 0.1;
        discQuat(Math.cos(a), Math.sin(a), elev, r() * TAU, _q);
        const d = R + 0.03 + R * Math.sin(elev) * 0.5;
        put(cx + Math.cos(a) * d, y0 + R * Math.cos(elev) + (COOKIE_T / 2) * Math.sin(elev) - 0.006, cz + Math.sin(a) * d, _q);
      }
    }
    // …e, nos vãos entre eles, outros deitados na cobertura
    const flat = room > 0.56 ? (k > 1 ? 3 : k < 1 ? 0 : 2) : 0;
    for (let i = 0; i < flat; i++) {
      const a = a0 + ((i + 0.5) / 3) * TAU + (r() - 0.5) * 0.15;
      const d = Math.min(0.38, room - R - 0.02);
      discQuat(Math.cos(a), Math.sin(a), Math.PI / 2 - 0.05, r() * TAU, _q);
      put(cx + Math.cos(a) * d, y0 + COOKIE_T / 2 - 0.004, cz + Math.sin(a) * d, _q);
    }
    groundBlob(ctx, part, cx, cz, flat ? R * 3.2 : R * 2.4);
  } else {
    // coroa / meia-lua: em pé, fincados na cobertura, com a face em relevo virada para fora
    const spots = decorSpots(ctx, zone, { size: 0.175, k, seed: 'biscoitos' });
    spots.forEach((sp, i) => {
      const prev = spots[(i + spots.length - 1) % spots.length];
      const step = spots.length > 1 ? Math.hypot(sp.x - prev.x, sp.z - prev.z) : 1;
      // apertados, giram de lado e se sobrepõem como escamas
      const yaw = step < 0.3 ? Math.acos(clamp((step - 0.02) / 0.31, 0.3, 1)) : (r() - 0.5) * 0.24;
      const a = Math.atan2(sp.oz, sp.ox) + yaw;
      const elev = 0.2 + r() * 0.12;
      discQuat(Math.cos(a), Math.sin(a), elev, r() * TAU, _q);
      const s = 0.86 + 0.14 * sp.taper;
      put(sp.x, y0 + (R * Math.cos(elev) + (COOKIE_T / 2) * Math.sin(elev)) * s - 0.034, sp.z, _q, s);
    });
  }
  part.add(wafers, m);
  part.add(cream, m);
}

/* ───────── Cerca de chocolate (palitos de wafer) ───────── */

/** Palito coberto de chocolate: barrinha de costas retas (encosta no bolo), frente chanfrada e ponta arredondada. Altura 1. */
function fingerGeometry(D) {
  const lowp = D < 1;
  // contorno fechado da seção (x, z, tom): z = 0 nas costas
  const ring = lowp
    ? [[-0.049, 0, 0.66], [-0.047, 0.04, 0.84], [-0.03, 0.062, 1], [0.03, 0.062, 1], [0.047, 0.04, 0.84], [0.049, 0, 0.66]]
    : [[-0.049, 0, 0.62], [-0.049, 0.028, 0.8], [-0.043, 0.049, 0.92], [-0.03, 0.062, 1], [0, 0.064, 1], [0.03, 0.062, 1], [0.043, 0.049, 0.92], [0.049, 0.028, 0.8], [0.049, 0, 0.62]];
  // fileiras (altura, encolhimento da seção, tom): a última fecha a ponta num ponto
  const rows = lowp ? [[0, 1, 0.8], [0.955, 1, 1], [0.993, 0.72, 1], [1, 0, 1]] : [[0, 1, 0.76], [0.08, 1, 0.94], [0.95, 1, 1], [0.978, 0.92, 1], [0.994, 0.72, 1], [1.001, 0.4, 1], [1.003, 0, 1]];
  const nu = rows.length - 1;
  const nv = ring.length;
  return surface(nu, nv, (u, v, p) => {
    const [y, k, t] = rows[Math.round(u * nu)];
    const [x, z, tone] = ring[Math.round(v * nv) % nv];
    p.set(x * k, y, 0.03 + (z - 0.03) * k);
    return t * tone;
  }, { wrapV: true, shade: true, orient: true });
}

function buildWaferFence(ctx, part) {
  const { m, lib } = ctx;
  const r = rng(hashString(`wafer${m.shape}${m.R}`));
  const batch = new Batch(lib.shape('x2-finger', () => fingerGeometry(lib.detail)), chocolate(lib), { cast: true, receive: true });
  const TINTS = ['#6a3c20', '#643820', '#704226', '#5f351d'];
  const pt = {};
  (m.stack || [m]).forEach((t) => {
    // as barrinhas são distribuídas pelo meio da espessura delas: nas quinas, o vão de fora fica pela metade
    const mid = 0.034;
    const wall = cleanOffset(t.frost, mid);
    const n = Math.max(8, Math.round(wall.length / 0.1005));
    const step = wall.length / n;
    const base = t.y0 - (t.index ? 0 : 0.01);
    for (let i = 0; i < n; i++) {
      pathAt(wall, i * step, pt);
      _x.set(pt.nz, 0, -pt.nx); // x = Y × normal → a frente (+Z) da barrinha olha para fora
      frameQuat(_x, Y, _q);
      const h = t.y0 + t.Ht + 0.1 + (r() - 0.5) * 0.035 - base;
      batch.add(pt.x - pt.nx * (mid - 0.003), base, pt.z - pt.nz * (mid - 0.003), _q, [Math.min(1.06, step / 0.1) * 1.005, h, 1], pick(TINTS, r), 0.06);
    }
  });
  part.add(batch, m);
}

/* ───────── Pirulitos ───────── */

/**
 * Um braço da espiral do pirulito: cordão de bala achatado enrolado do centro para fora. Dois braços iguais,
 * um girado meia volta sobre o outro (cor + branco), fecham o disco. Plano XY, frente em +Z, raio 0,15.
 */
function swirlArmGeometry(D) {
  const lowp = D < 1;
  const turns = 2.2;
  const Rmax = 0.15;
  const b = Rmax / (turns * TAU + Math.PI * 0.5); // raio = b·θ
  const hw = (Math.PI * b) / 2; // meia largura da faixa: as duas faixas se encostam
  const ht = 0.024;
  return surface(lowp ? 30 : 64, lowp ? 5 : 8, (u, v, p) => {
    const th = 0.5 + u * turns * TAU;
    const rad = b * th;
    const grow = smooth(0, 0.07, u) * (1 - 0.75 * smooth(0.9, 1, u));
    const be = v * TAU;
    const cb = Math.cos(be);
    const sb = Math.sin(be);
    // seção em almofada: larga e baixa, com um sulco onde encosta na faixa vizinha
    const w = hw * 1.04 * grow * Math.sign(cb) * Math.pow(Math.abs(cb), 0.7);
    const z = ht * (0.55 + 0.45 * grow) * Math.sign(sb) * Math.pow(Math.abs(sb), 0.8);
    const rr = Math.min(Rmax, rad + w);
    p.set(rr * Math.cos(th), rr * Math.sin(th), z);
    return 0.62 + 0.38 * Math.pow(Math.abs(sb), 0.6);
  }, { wrapV: true, shade: true, orient: true });
}

function buildLollipops(ctx, part) {
  const { m, lib, layout } = ctx;
  const k = quantityOf(ctx, 'pirulitos');
  const r = rng(hashString(`pirulitos${m.shape}${m.R}`));
  const color = layout.opt('pirulitos').color;
  const pale = lightOf(color) > 0.92;
  const vivid = shift(color, 0, 1.35, lightOf(color) > 0.75 ? -0.14 : -0.04); // bala: a cor escolhida, mais viva
  const tints = pale ? ['#ef7fa0', '#6fb6f2', '#f6c453', '#6fcfa8', '#b497f0'] : [vivid, shift(vivid, 0.03, 1, -0.05), shift(vivid, -0.04, 1, 0.04), mix(vivid, '#ffffff', 0.2)];
  const swirl = new Batch(lib.shape('x2-swirl', () => swirlArmGeometry(lib.detail)), candy(lib));
  const sticks = new Batch(lib.geo.stick(), stickMat(lib));
  const want = k < 1 ? 2 : k > 1 ? 5 : 3;
  // no meio do bolo; com velas no centro, vão para trás delas; com balões (que ficam no fundo), um pouco à frente
  const candles = layout.has('velas');
  const depth = layout.has('baloes') ? (candles ? 0 : -0.08) : candles ? 0.44 : 0.1;
  // com velas no meio e balões atrás, os pirulitos ficam dos dois lados das velas
  const spots = stickRow(ctx, want, { depth: layout.rho * depth, gap: 0.31, gapMid: candles && layout.has('baloes') ? 0.34 : 0 });
  const y0 = layout.topY;
  const HEIGHTS = [0.4, 0.27, 0.43, 0.3, 0.38];
  spots.forEach((sp, i) => {
    const h = HEIGHTS[(i + (spots.length === 2 ? 1 : 0)) % HEIGHTS.length] + (r() - 0.5) * 0.03;
    // o disco olha para a frente, abrindo um pouco em leque; o palito inclina junto
    const yaw = sp.j * 0.3 + (r() - 0.5) * 0.12;
    const roll = -sp.j * 0.16 + (r() - 0.5) * 0.06;
    facingQuat(Math.sin(yaw), Math.cos(yaw), 0.07, roll, _q);
    _y.set(0, 1, 0).applyQuaternion(_q);
    const cx = sp.x + _y.x * h;
    const cy = y0 + _y.y * h;
    const cz = sp.z + _y.z * h;
    const s = 0.94 + r() * 0.12;
    const spin = r() * TAU;
    // dois braços iguais, um girado meia volta: a cor e o branco
    swirl.add(cx, cy, cz, _q2.copy(_q).multiply(_q3.setFromAxisAngle(Z, spin)), s, tints[i % tints.length], 0.06);
    swirl.add(cx, cy, cz, _q2.copy(_q).multiply(_q3.setFromAxisAngle(Z, spin + Math.PI)), s, '#f6f1ea', 0.06);
    sticks.add(sp.x - _y.x * 0.07, y0 - _y.y * 0.07, sp.z - _y.z * 0.07, _q, [1.5, h + 0.07, 1.5], null, 0.03);
  });
  part.add(sticks, m);
  part.add(swirl, m);
}

/* ───────── Folha de ouro ───────── */

/** Lâmina de ouro amassada: contorno rasgado e irregular, dobrinhas vivas. Tamanho ~1 (a escala vem por instância). */
function flakeGeometry(seed, n) {
  const r = rng(seed);
  const rim = Array.from({ length: 12 }, () => 0.62 + r() * 0.5);
  const crumple = Array.from({ length: (n + 1) * (n + 1) }, () => (r() - 0.35) * 0.13);
  return surface(n, n, (u, v, p) => {
    const x = u * 2 - 1;
    const z = v * 2 - 1;
    const a = (Math.atan2(z, x) / TAU + 1) % 1;
    const i = Math.floor(a * 12);
    const f = a * 12 - i;
    const k = (rim[i] * (1 - f) + rim[(i + 1) % 12] * f) * 0.5;
    const sq = Math.max(Math.abs(x), Math.abs(z)) / (Math.hypot(x, z) || 1); // quadrado → disco
    p.set(x * sq * k, crumple[Math.round(u * n) * (n + 1) + Math.round(v * n)] * (0.35 + Math.hypot(x, z) * 0.65), z * sq * k * 0.8);
  });
}

function buildGoldLeaf(ctx, part) {
  const { m, lib, layout } = ctx;
  const zone = zoneOf(ctx, 'ouro');
  const k = quantityOf(ctx, 'ouro');
  const r = rng(hashString(`ouro${m.shape}${m.R}${zone}`));
  const lowp = lib.detail < 1;
  const kinds = [11, 23].map((seed) => new Batch(lib.shape(`x2-flake${seed}`, () => flakeGeometry(seed, lowp ? 2 : 3)), goldLeaf(lib), { cast: false, receive: false }));
  const TINTS = ['#ffffff', '#fff0cf', '#ffe2a6', '#f6d9a0'];
  const density = ctx.tier?.density || 1;
  const pt = {};
  const flake = (x, y, z, nx, ny, nz, big) => {
    // deitada na superfície (normal n), com um canto levantado
    _y.set(nx + (r() - 0.5) * 0.3, ny + (r() - 0.5) * 0.3, nz + (r() - 0.5) * 0.3).normalize();
    _x.set(r() - 0.5, r() - 0.5, r() - 0.5).cross(_y).normalize();
    frameQuat(_x, _y, _q);
    const s = big ? 0.09 + r() * 0.06 : 0.03 + r() * 0.04;
    kinds[r() < 0.5 ? 0 : 1].add(x + nx * 0.003, y + ny * 0.003, z + nz * 0.003, _q, [s * (0.8 + r() * 0.5), s * 0.8, s * (0.8 + r() * 0.5)], pick(TINTS, r), 0.04);
  };
  /** punhado de lâminas: uma ou duas grandes e miúdas em volta, espalhando-se pela superfície (t1, t2 = eixos dela) */
  const cluster = (cx, cy, cz, n, t1, t2, spread, count) => {
    for (let i = 0; i < count; i++) {
      const a = r() * TAU;
      const d = Math.pow(r(), 0.8) * spread * (i < 2 ? 0.3 : 1);
      flake(cx + (t1.x * Math.cos(a) + t2.x * Math.sin(a)) * d, cy + (t1.y * Math.cos(a) + t2.y * Math.sin(a)) * d, cz + (t1.z * Math.cos(a) + t2.z * Math.sin(a)) * d, n.x, n.y, n.z, i === 0 || (i === 1 && r() < 0.5));
    }
  };
  const X1 = new THREE.Vector3(1, 0, 0);
  const Z1 = new THREE.Vector3(0, 0, 1);
  const nrm = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const per = Math.round((lowp ? 7 : 10) * Math.sqrt(density));
  const sideCluster = (t, s, y, spread, count) => {
    pathAt(t.frost, s, pt);
    nrm.set(pt.nx, 0, pt.nz);
    tan.set(pt.tx, 0, pt.tz);
    cluster(pt.x + pt.nx * wallOut(ctx), y, pt.z + pt.nz * wallOut(ctx), nrm, tan, Y, spread, count);
  };
  if (zone === 'crown') {
    // faixa irregular junto à borda do topo, com respingos descendo o começo da lateral
    const ring = cleanOffset(m.topFlat, -(layout.border + 0.07));
    const n = Math.round(ring.length * 7.5 * k);
    for (let i = 0; i < n; i++) {
      pathAt(ring, ((i + r()) / n) * ring.length, pt);
      const inward = (r() - 0.35) * 0.1;
      cluster(pt.x - pt.nx * inward, layout.topY, pt.z - pt.nz * inward, Y, X1, Z1, 0.05, 2 + Math.floor(r() * 3));
    }
    if (!m.naked && layout.border < 0.06) {
      const side = Math.round(m.frost.length * 2.2 * k);
      for (let i = 0; i < side; i++) sideCluster(m, r() * m.frost.length, m.y0 + m.Ht - m.rf - 0.03 - Math.pow(r(), 1.6) * 0.22, 0.05, 2 + Math.floor(r() * 2));
    }
  } else if (zone === 'cascade') {
    spotsFor(ctx, zone, { size: 0.1, r: 0.07, count: 9, k, seed: 'ouro' }).forEach((sp) => {
      if (!sp.side) return cluster(sp.x, sp.y, sp.z, Y, X1, Z1, 0.1, per);
      nrm.set(sp.ox, 0, sp.oz);
      tan.set(-sp.oz, 0, sp.ox);
      cluster(sp.x - sp.ox * 0.035, sp.y, sp.z - sp.oz * 0.035, nrm, tan, Y, 0.11 * sp.taper, per);
      return null;
    });
  } else {
    // espalhado: manchas de ouro no topo e, mais largas, na lateral de cada andar
    spotsFor(ctx, 'scatter', { size: 0.17, r: 0.1, count: 6, k, seed: 'ouro' }).forEach((sp) => cluster(sp.x, sp.y, sp.z, Y, X1, Z1, 0.1, per));
    (m.stack || [m]).forEach((t) => {
      if (t.naked) return;
      const n = Math.max(3, Math.round(t.frost.length * 1.1 * k));
      const a0 = r() * t.frost.length;
      for (let i = 0; i < n; i++) {
        const sideH = t.Ht - t.rf;
        sideCluster(t, a0 + ((i + r() * 0.6) / n) * t.frost.length, t.y0 + sideH * (0.2 + 0.65 * r()), 0.12, per + 2);
      }
    });
  }
  kinds.forEach((b) => part.add(b, m));
}

/* ───────── Balões no palito ───────── */

/** Mini balão: gota invertida (largo em cima, afinando até o bico) com o nozinho embaixo. Origem no nó. */
function balloonGeometry(D) {
  const lowp = D < 1;
  const rows = lowp ? 9 : 16;
  const R = 0.16;
  const H = 0.39;
  const profile = [[0.014, -0.026, 0.8], [0.024, -0.02, 0.86], [0.009, -0.004, 0.72], [0.012, 0.006, 0.8]];
  for (let i = 1; i <= rows; i++) {
    const t = i / rows; // 0 = bico, 1 = topo
    const ang = t * Math.PI;
    // largura máxima a ~62% da altura; embaixo afina devagar, em cima fecha redondo
    const rad = R * Math.pow(Math.sin(Math.PI * Math.pow(t, 1.45)), 0.82);
    profile.push([i === rows ? 0.001 : Math.max(0.012, rad), 0.006 + H * (1 - Math.cos(ang)) * 0.5 * (0.86 + 0.14 * t), 0.9 + 0.1 * t]);
  }
  return lathe(profile, lowp ? 12 : 22);
}

function buildBalloons(ctx, part) {
  const { m, lib, layout } = ctx;
  const k = quantityOf(ctx, 'baloes');
  const r = rng(hashString(`baloes${m.shape}${m.R}`));
  const tints = harmonyOf(layout.opt('baloes').color);
  const balloons = new Batch(lib.shape('x2-balloon', () => balloonGeometry(lib.detail)), candy(lib));
  const sticks = new Batch(lib.geo.stick(), stickMat(lib));
  const want = k < 1 ? 3 : k > 1 ? 7 : 5;
  const spots = stickRow(ctx, want, { depth: layout.rho * 0.36, gap: 0.2 });
  const y0 = layout.topY;
  const n = spots.length;
  spots.forEach((sp, i) => {
    // alturas em zigue-zague (vizinhos nunca na mesma altura) e os do meio mais altos
    const h = 0.4 + (i % 2 ? 0.27 : 0) + 0.06 * (1 - Math.abs(sp.j)) + (r() - 0.5) * 0.03;
    // o palito abre em leque para os lados e um tico para trás
    const lean = sp.j * 0.3 * Math.min(1, n / 4) + (r() - 0.5) * 0.06;
    _y.set(Math.sin(lean), Math.cos(lean), -0.06 - r() * 0.06).normalize();
    axisQuat(_y, r() * TAU, _q); // o balão segue a direção do palito
    const s = 0.95 + r() * 0.1;
    balloons.add(sp.x + _y.x * h, y0 + _y.y * h, sp.z + _y.z * h, _q, s, tints[i % tints.length], 0.06);
    sticks.add(sp.x - _y.x * 0.07, y0 - _y.y * 0.07, sp.z - _y.z * 0.07, _q, [1.25, h + 0.05, 1.25], null, 0.03);
  });
  part.add(sticks, m);
  part.add(balloons, m);
}

/* ───────── Laço de açúcar ───────── */

// seção de uma fita com espessura: [posição na largura (−1…1), face (1 = frente, −1 = verso)]
const BAND = [[-1, 1], [-0.5, 1], [0, 1], [0.5, 1], [1, 1], [1, -1], [0, -1], [-1, -1]];
const BAND_LOW = [[-1, 1], [0, 1], [1, 1], [1, -1], [-1, -1]];

/**
 * Fita com espessura ao longo de at(u, P): W(u, out) = direção da largura; half(u, vv) = meia largura;
 * wave(u, vv) = quanto a fita ondula para a frente (pregas). tone(u, vv, face) = sombra assada.
 */
function band(nu, lowp, at, W, half, wave, tone, thick = 0.011) {
  const ring = lowp ? BAND_LOW : BAND;
  const nv = ring.length;
  const P = new THREE.Vector3();
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const Wd = new THREE.Vector3();
  return surface(nu, nv, (u, v, p) => {
    const [vv, face] = ring[Math.round(v * nv) % nv];
    at(u, P);
    at(Math.min(1, u + 0.01), A);
    at(Math.max(0, u - 0.01), B);
    T.subVectors(A, B).normalize();
    W(u, Wd);
    Wd.addScaledVector(T, -Wd.dot(T)).normalize();
    N.crossVectors(T, Wd).normalize();
    p.copy(P).addScaledVector(Wd, vv * half(u, vv)).addScaledVector(N, wave(u, vv) + (face * thick) / 2);
    return tone(u, vv, face);
  }, { wrapV: true, shade: true, orient: true });
}

/**
 * Laço: duas alças fofas (franzidas no nó, cheias no meio e arredondadas na ponta), o nó e duas pontas com
 * corte em V. x = para os lados, y = para cima, z = para a frente; origem no nó, costas em z = 0.
 * rest = true: versão que fica em pé sobre o topo do bolo, com as pontas deitadas na cobertura (y = 0 é o topo).
 */
function bowGeometry(D, rest) {
  const lowp = D < 1;
  const parts = [];
  const ky = rest ? 0.128 : 0; // altura do nó
  const L = 0.3;
  for (const sx of [-1, 1]) {
    // alça: sai do nó pela frente, dá a volta e retorna por trás
    parts.push(
      band(
        lowp ? 14 : 28,
        lowp,
        (u, P) => {
          const t = u * TAU;
          const out = (1 - Math.cos(t)) / 2; // 0 no nó, 1 na ponta da alça
          // junto ao nó, a ida (frente) e a volta (trás) ficam afastadas uma da outra: as pregas não se atravessam
          P.set(sx * (0.014 + L * Math.pow(out, 0.75)), ky + 0.07 * out + 0.01 * Math.sin(t), 0.066 + 0.058 * Math.sin(t) * (0.55 + 0.45 * out) + (u < 0.5 ? 0.022 : -0.022) * (1 - out) * (1 - out));
        },
        (u, out) => out.set(sx * 0.1 * Math.sin(u * Math.PI), 1, 0),
        (u) => {
          const k = Math.sin(u * Math.PI);
          // enche logo depois do nó e arredonda na ponta; a volta de trás é um tico mais estreita (não aparece por trás da frente)
          return (0.03 + 0.08 * Math.pow(k, 0.45) * (1 - 0.4 * Math.pow(k, 8))) * (1 - 0.08 * smooth(0.5, 0.6, u));
        },
        // a fita estufa para fora da alça e franze junto ao nó
        (u, vv) => sx * (0.014 * (1 - vv * vv) * Math.sin(u * Math.PI) + 0.009 * Math.cos(vv * Math.PI * 1.5) * (1 - Math.pow(Math.sin(u * Math.PI), 0.4))),
        (u, vv, face) => (0.58 + 0.42 * Math.pow(Math.sin(u * Math.PI), 0.55)) * (face > 0 ? 1 : 0.8) * (1 - 0.14 * vv * vv) * (u > 0.5 ? 0.84 : 1),
      ),
    );
    // ponta: cai do nó para fora; termina em V
    const tail = rest
      ? (u, P) => P.set(sx * (0.02 + 0.22 * u), Math.max(0.011, ky - 0.03 - 0.28 * u * (1 - 0.35 * u)) + 0.012 * Math.sin(u * 9) * smooth(0.45, 0.7, u) * (1 - u), 0.06 + 0.24 * Math.pow(u, 1.2))
      : (u, P) => P.set(sx * (0.018 + 0.13 * u + 0.06 * u * u), -0.03 - 0.34 * u, 0.022 + 0.014 * Math.sin(u * 7) * (1 - u));
    parts.push(
      band(
        lowp ? 7 : 12,
        lowp,
        (u, P) => tail(u, P),
        rest ? (u, out) => out.set(sx * 0.9, 0.25 * (1 - smooth(0.3, 0.6, u)), -0.35) : (u, out) => out.set(1, 0, 0),
        (u) => 0.03 + 0.036 * smooth(0, 0.6, u),
        () => 0,
        (u, vv, face) => (0.7 + 0.3 * smooth(0, 0.5, u)) * (face > 0 ? 1 : 0.8) * (1 - 0.08 * vv * vv),
      ),
    );
  }
  // corte em V na ponta das fitas: o meio da última fileira recua
  parts.forEach((g, i) => {
    if (i % 2 === 0) return;
    const pos = g.attributes.position;
    const ring = lowp ? BAND_LOW : BAND;
    const last = pos.count - ring.length;
    const prev = last - ring.length;
    for (let j = 0; j < ring.length; j++) {
      const back = 0.7 * (1 - Math.abs(ring[j][0]));
      pos.setXYZ(last + j, pos.getX(last + j) + (pos.getX(prev + j) - pos.getX(last + j)) * back, pos.getY(last + j) + (pos.getY(prev + j) - pos.getY(last + j)) * back, pos.getZ(last + j) + (pos.getZ(prev + j) - pos.getZ(last + j)) * back);
    }
    g.computeVertexNormals();
  });
  // nó: uma faixa abaulada abraçando o encontro das alças
  const knot = surface(lowp ? 5 : 8, lowp ? 8 : 12, (u, v, p) => {
    const phi = -Math.PI / 2 + u * Math.PI;
    const a = v * TAU;
    const crease = 1 - 0.07 * Math.pow(Math.abs(Math.sin(a * 2)), 4);
    p.set(0.047 * Math.cos(phi) * Math.sin(a) * crease, ky + 0.06 * Math.sin(phi), 0.066 + 0.058 * Math.cos(phi) * Math.cos(a) * crease);
    return 0.84 + 0.16 * Math.cos(phi) * Math.max(0, Math.cos(a));
  }, { wrapV: true, shade: true, orient: true });
  return mergeGeometries([...parts.map((g) => piece(g)), piece(knot)]);
}

/** Ponto da lateral de um andar que olha de frente para quem vê o bolo (no coração, o flanco direito). */
function frontSpot(t) {
  const path = t.frost;
  // redondo: um pouco à direita da frente (de frente para a câmera); com faces retas: no meio da face da frente
  const fx = t.shape === 'heart' ? 0.62 : t.shape === 'round' ? 0.3 : 0;
  const fz = t.shape === 'heart' ? 0.78 : t.shape === 'round' ? 0.954 : 1;
  let best = 0;
  for (let i = 1; i < path.n; i++) if (path.nx[i] * fx + path.nz[i] * fz > path.nx[best] * fx + path.nz[best] * fz) best = i;
  // se cair num trecho reto, vai para o meio dele
  const run = [];
  for (let i = 0; i < path.n; i++) if (path.nx[i] * path.nx[best] + path.nz[i] * path.nz[best] > 0.9995) run.push(i);
  let x = 0;
  let z = 0;
  run.forEach((i) => {
    x += path.x[i];
    z += path.z[i];
  });
  return { x: x / run.length, z: z / run.length, nx: path.nx[best], nz: path.nz[best], flat: run.length > 3 };
}

function buildBow(ctx, part) {
  const { m, lib, layout } = ctx;
  const zone = zoneOf(ctx, 'lacos');
  const color = shown(layout.opt('lacos').color);
  const rest = zone !== 'frente';
  const batch = new Batch(lib.shape(rest ? 'x2-bowRest' : 'x2-bow', () => bowGeometry(lib.detail, rest)), fondant(lib));
  if (rest) {
    // em pé no meio do topo, de frente para quem olha, com as pontas deitadas na cobertura
    const s = clamp(Math.min(0.6 + layout.rho * 0.5, (layout.rho - layout.border) / 0.36), 0.5, 1.25);
    facingQuat(0.12, 1, 0.1, 0, _q);
    batch.add(m.center.x, layout.topY, m.center.z - 0.06 * s, _q, s, color, 0.2 * s);
    groundBlob(ctx, part, m.center.x, m.center.z, 0.26 * s);
  } else {
    // na frente da lateral do andar de cima, logo abaixo da borda
    const at = frontSpot(m);
    const sideH = m.Ht - m.rf;
    const s = clamp(Math.min(0.72 + layout.rho * 0.5, (sideH - 0.05) / 0.57), 0.45, 1.3);
    _x.set(at.nz, 0, -at.nx);
    frameQuat(_x, Y, _q);
    const y = m.y0 + sideH - 0.04 - 0.19 * s;
    const off = 0.004 + wallOut(ctx);
    batch.add(at.x + at.nx * off, y, at.z + at.nz * off, _q, s, color, 0.3 * s);
  }
  part.add(batch, m);
}

/* ───────── Corações de açúcar ───────── */

/** Coração fofo (almofadinha): contorno clássico, faces abauladas. Plano XY, espessura em Z; largura 0,14. */
function heartGeometry(D) {
  const lowp = D < 1;
  const k = 0.07 / 16;
  const cy = -1.5;
  const depth = 0.052;
  return surface(lowp ? 4 : 7, lowp ? 16 : 28, (u, v, p) => {
    const t = v * TAU;
    const hx = 16 * Math.pow(Math.sin(t), 3);
    const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    const s = Math.pow(Math.sin(Math.PI * u), 0.55);
    p.set(hx * s * k, (cy + (hy - cy) * s) * k - cy * k * 0.4, (-Math.cos(Math.PI * u) * depth) / 2);
    return 0.84 + 0.16 * Math.sin(Math.PI * u * 0.5);
  }, { wrapV: true, shade: true, orient: true });
}

function buildHearts(ctx, part) {
  const { m, lib, layout } = ctx;
  const zone = zoneOf(ctx, 'coracoes');
  const k = quantityOf(ctx, 'coracoes');
  const r = rng(hashString(`coracoes${m.shape}${m.R}${zone}`));
  const tints = tintsOf(layout.opt('coracoes').color);
  const hearts = new Batch(lib.shape('x2-heart', () => heartGeometry(lib.detail)), sugar(lib), smallCast(ctx));
  const y0 = layout.topY;
  const TIP = 0.07; // do centro à ponta de baixo
  if (zone === 'palito') {
    const sticks = new Batch(lib.geo.stick(), stickMat(lib), smallCast(ctx));
    const want = k < 1 ? 3 : k > 1 ? 9 : 6;
    // em volta do centro, mais altos atrás e mais baixos na frente
    const ringR = Math.max(0.06, Math.min(layout.rho * 0.5, layout.rho - layout.border - 0.1));
    for (let i = 0; i < want; i++) {
      const a = Math.PI * 0.5 + ((i + 0.5) / want) * TAU + (r() - 0.5) * 0.25;
      const d = ringR * (0.72 + r() * 0.28);
      const x = m.center.x + Math.cos(a) * d;
      const z = m.center.z + Math.sin(a) * d;
      const h = 0.3 + 0.1 * (1 - Math.sin(a)) + r() * 0.1;
      const yaw = Math.cos(a) * 0.45 + (r() - 0.5) * 0.3;
      facingQuat(Math.sin(yaw), Math.cos(yaw), 0.05, (r() - 0.5) * 0.3, _q);
      _y.set(0, 1, 0).applyQuaternion(_q);
      const s = 1.35 + r() * 0.35;
      hearts.add(x + _y.x * h, y0 + _y.y * h, z + _y.z * h, _q, s, pick(tints, r), 0.05);
      sticks.add(x - _y.x * 0.06, y0 - _y.y * 0.06, z - _y.z * 0.06, _q, [0.9, h + 0.03, 0.9], null, 0.03);
    }
    part.add(sticks, m);
  } else if (zone === 'scatter') {
    spotsFor(ctx, 'scatter', { size: 0.085, r: 0.075, count: 14, k, seed: 'coracoes' }).forEach((sp) => {
      const s = 0.8 + r() * 0.5;
      if (r() < 0.45) {
        // fincado na cobertura, meio deitado para trás
        const a = Math.PI * 0.5 + (r() - 0.5) * 1.6;
        const lean = 0.25 + r() * 0.5;
        facingQuat(Math.cos(a), Math.sin(a), lean, (r() - 0.5) * 0.5, _q);
        hearts.add(sp.x, sp.y + (TIP * Math.cos(lean) + 0.02 * Math.sin(lean)) * s - 0.012, sp.z, _q, s, pick(tints, r), 0.07 * s);
      } else {
        // deitado no topo
        _q.setFromAxisAngle(X, -Math.PI / 2 + (r() - 0.5) * 0.3).multiply(_q2.setFromAxisAngle(Z, r() * TAU));
        hearts.add(sp.x, sp.y + 0.024 * s, sp.z, _q, s, pick(tints, r), 0.07 * s);
      }
    });
    // alguns grudados na lateral do andar de cima, perto da borda
    if (!m.naked) {
      const pt = {};
      const n = Math.round(m.frost.length * 1.5 * k);
      for (let i = 0; i < n; i++) {
        pathAt(m.frost, ((i + r() * 0.8) / n) * m.frost.length, pt);
        facingQuat(pt.nx, pt.nz, 0, (r() - 0.5) * 0.9, _q);
        const s = 0.7 + r() * 0.45;
        const off = 0.016 * s + wallOut(ctx);
        hearts.add(pt.x + pt.nx * off, m.y0 + (m.Ht - m.rf) * (0.5 + 0.42 * r()), pt.z + pt.nz * off, _q, s, pick(tints, r), 0.07 * s);
      }
    }
  } else {
    // coroa: em pé junto à borda, de frente para fora, com a ponta fincada na cobertura
    decorSpots(ctx, zone, { size: 0.092, k, seed: 'coracoes' }).forEach((sp, i) => {
      const s = (i % 2 ? 0.92 : 1.18) * (0.8 + 0.2 * sp.taper);
      const lean = 0.16 + r() * 0.14;
      facingQuat(sp.ox, sp.oz, lean, (r() - 0.5) * 0.24, _q);
      hearts.add(sp.x, sp.y + TIP * Math.cos(lean) * s - 0.014, sp.z, _q, s, tints[i % tints.length], 0.07 * s);
    });
  }
  part.add(hearts, m);
}

/* ───────── Borboletas ───────── */

const WING_V0 = 0.14;

/** Par de asas direito (a outra asa espelha) em tons de cinza, para tingir: claro no meio, margem escura com pintas. */
function wingCanvas(size) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const S = size;
  const X = (u) => u * S;
  const Yv = (v) => (1 - (WING_V0 + (1 - WING_V0) * v)) * S; // as asas ocupam a parte de cima da textura
  const fore = () => {
    g.beginPath();
    g.moveTo(X(0.0), Yv(0.5));
    g.bezierCurveTo(X(0.1), Yv(0.82), X(0.45), Yv(1.02), X(0.92), Yv(0.975));
    g.bezierCurveTo(X(1.0), Yv(0.96), X(0.99), Yv(0.86), X(0.9), Yv(0.74));
    g.bezierCurveTo(X(0.8), Yv(0.6), X(0.62), Yv(0.5), X(0.4), Yv(0.47));
    g.lineTo(X(0.0), Yv(0.46));
    g.closePath();
  };
  const hind = () => {
    g.beginPath();
    g.moveTo(X(0.0), Yv(0.5));
    g.bezierCurveTo(X(0.3), Yv(0.53), X(0.62), Yv(0.51), X(0.75), Yv(0.4));
    g.bezierCurveTo(X(0.88), Yv(0.28), X(0.74), Yv(0.07), X(0.52), Yv(0.045));
    g.bezierCurveTo(X(0.36), Yv(0.03), X(0.2), Yv(0.13), X(0.11), Yv(0.25));
    g.bezierCurveTo(X(0.05), Yv(0.33), X(0.02), Yv(0.4), X(0.0), Yv(0.44));
    g.closePath();
  };
  [hind, fore].forEach((shape, k) => {
    g.save();
    shape();
    g.clip();
    const grad = g.createRadialGradient(X(0), Yv(0.48), 0, X(0), Yv(0.48), S * 0.95);
    grad.addColorStop(0, '#9a9a9a');
    grad.addColorStop(0.25, '#ffffff');
    grad.addColorStop(0.55, '#f6f6f6');
    grad.addColorStop(0.8, '#bdbdbd');
    grad.addColorStop(1, '#7c7c7c');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    // nervuras em leque
    g.strokeStyle = 'rgba(70,50,60,0.4)';
    g.lineWidth = S / 110;
    const [v0, v1] = k ? [0.56, 1.0] : [0.02, 0.44];
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.moveTo(X(0.02), Yv(0.48));
      g.quadraticCurveTo(X(0.45), Yv(0.48 + (v0 + ((v1 - v0) * i) / 5 - 0.48) * 0.55), X(1.0), Yv(v0 + ((v1 - v0) * i) / 5));
      g.stroke();
    }
    // margem escura por dentro do contorno
    shape();
    g.strokeStyle = '#3f3640';
    g.lineWidth = S * 0.085;
    g.stroke();
    g.restore();
  });
  // pintas claras sobre a margem
  g.fillStyle = '#f2f2f2';
  [[0.9, 0.9], [0.93, 0.8], [0.84, 0.7], [0.73, 0.59], [0.74, 0.3], [0.7, 0.17], [0.55, 0.085], [0.37, 0.1]].forEach(([u, v]) => {
    g.beginPath();
    g.arc(X(u), Yv(v), S * 0.016, 0, TAU);
    g.fill();
  });
  // faixa escura embaixo: é a cor do corpo e das antenas
  g.fillStyle = '#2a2024';
  g.fillRect(0, S * (1 - WING_V0 * 0.72), S, S * WING_V0 * 0.72);
  return c;
}

/** Borboleta pousada: duas asas (planos com a textura recortada) abertas em V, corpo fino e antenas. Cabeça em +X. */
function butterflyGeometry(D) {
  const lowp = D < 1;
  const L = 0.135; // comprimento ao longo do corpo
  const W = 0.118; // da dobradiça à ponta da asa
  const rise = 0.85; // abertura do V (rad acima da horizontal)
  const pos = [];
  const uv = [];
  const idx = [];
  for (const s of [1, -1]) {
    const base = pos.length / 3;
    // 3 colunas ao longo da asa: a metade de fora abre um pouco mais (asa levemente arqueada)
    [0, 0.5, 1].forEach((u) => {
      const ang = rise - 0.28 * u;
      const out = W * u;
      [0, 1].forEach((v) => {
        pos.push((v - 0.5) * L, 0.012 + out * Math.sin(ang), s * (0.004 + out * Math.cos(ang)));
        uv.push(u, WING_V0 + (1 - WING_V0) * v);
      });
    });
    for (let c = 0; c < 2; c++) {
      const a = base + c * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const wings = new THREE.BufferGeometry();
  wings.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  wings.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  wings.setIndex(idx);
  wings.computeVertexNormals();
  const dark = (g) => {
    const a = g.attributes.uv;
    for (let i = 0; i < a.count; i++) a.setXY(i, 0.5, WING_V0 * 0.3);
    return g;
  };
  const body = dark(new THREE.SphereGeometry(1, lowp ? 5 : 8, lowp ? 3 : 5).scale(0.05, 0.011, 0.011).translate(0, 0.014, 0));
  const head = dark(new THREE.SphereGeometry(0.0125, lowp ? 5 : 8, lowp ? 3 : 5).translate(0.052, 0.016, 0));
  const parts = [wings, body, head];
  for (const s of [1, -1]) {
    const feeler = dark(new THREE.CylinderGeometry(0.0016, 0.0022, 0.06, 3, 1, true).translate(0, 0.03, 0).rotateX(s * 0.5).rotateZ(-0.9).translate(0.058, 0.02, 0));
    parts.push(feeler);
  }
  return mergeGeometries(parts);
}

function buildButterflies(ctx, part) {
  const { m, lib, layout } = ctx;
  const zone = zoneOf(ctx, 'borboletas');
  const k = quantityOf(ctx, 'borboletas');
  const r = rng(hashString(`borboletas${m.shape}${m.R}${zone}`));
  const color = shown(layout.opt('borboletas').color);
  const deep = shift(color, 0, 1.25, lightOf(color) > 0.75 ? -0.08 : 0);
  const tints = [deep, mix(deep, '#ffffff', 0.25), shift(deep, 0.05, 1.05, -0.03), shift(deep, -0.06, 1, 0.02)];
  const mat = lib.custom('x2-wing', () => {
    const map = lib.custom('x2-wingTex', () => texture(wingCanvas(lib.detail < 1 ? 128 : 256), { repeat: false, srgb: true, aniso: 4 }));
    return new THREE.MeshStandardMaterial({ color: 0xffffff, map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.62 });
  });
  const batch = new Batch(lib.shape('x2-butterfly', () => butterflyGeometry(lib.detail)), mat, smallCast(ctx));
  const head = new THREE.Vector3();
  const up = new THREE.Vector3();
  /** up = para onde ficam as costas da borboleta; a cabeça aponta para um lado qualquer da superfície */
  const put = (x, y, z, s) => {
    head.set(r() - 0.5, r() - 0.5, r() - 0.5).cross(up).normalize();
    frameQuat(head, up, _q);
    // asas mais fechadas ou mais abertas, de borboleta para borboleta
    const open = 0.75 + r() * 0.6;
    batch.add(x, y, z, _q, [s, s * (1.25 - 0.3 * open), s * open], pick(tints, r), 0.09 * s);
  };
  spotsFor(ctx, zone, { size: zone === 'scatter' ? 0.13 : 0.115, r: 0.1, count: zone === 'cascade' ? 7 : 6, k, seed: 'borboletas' }).forEach((sp) => {
    const s = (0.85 + r() * 0.4) * (0.8 + 0.2 * sp.taper);
    if (sp.side) {
      up.set(sp.ox, 0.2 + r() * 0.3, sp.oz).normalize();
      put(sp.x - sp.ox * (0.115 * 0.35 - 0.004), sp.y, sp.z - sp.oz * (0.115 * 0.35 - 0.004), s);
    } else {
      up.set((r() - 0.5) * 0.4, 1, (r() - 0.5) * 0.4).normalize();
      put(sp.x, sp.y + 0.002, sp.z, s);
    }
  });
  part.add(batch, m);
}

/* ───────── Registro ───────── */

/** id da decoração → construtor(ctx, part). */
export const EXTRA_DECOR = {
  morangos: buildDippedBerries,
  cerejas: buildCherries,
  margaridas: buildDaisies,
  peonias: buildPeonies,
  macarons: buildMacarons,
  brigadeiros: buildBrigadeiros,
  bombons: buildBombons,
  suspiros: buildMeringues,
  marshmallows: buildMarshmallows,
  biscoitos: buildCookies,
  wafer: buildWaferFence,
  pirulitos: buildLollipops,
  ouro: buildGoldLeaf,
  baloes: buildBalloons,
  lacos: buildBow,
  coracoes: buildHearts,
  borboletas: buildButterflies,
};

// altura acima do topo do bolo: [arranjo padrão, no centro (montinho), no palito]
const HEIGHTS = {
  morangos: [0.24, 0.35],
  cerejas: [0.48, 0.64],
  margaridas: [0.06],
  peonias: [0.26, 0.32],
  macarons: [0.3, 0.42],
  brigadeiros: [0.22, 0.22],
  bombons: [0.2, 0.34],
  suspiros: [0.25, 0.4],
  marshmallows: [0.22, 0.42],
  biscoitos: [0.28, 0.34],
  wafer: [0.13],
  pirulitos: [0.62],
  ouro: [0.03],
  baloes: [1.16],
  lacos: [0, 0.38],
  coracoes: [0.16, 0.16, 0.7],
  borboletas: [0.14],
};

/** Altura extra (acima do topo do bolo) que as decorações daqui ocupam — para enquadrar a câmera. */
export function extraDecorHeight(config) {
  let h = 0;
  (config?.decor?.items || []).forEach((id) => {
    const row = HEIGHTS[id];
    if (!row) return;
    const arr = decorOptions(config, id).arr;
    h = Math.max(h, arr === 'palito' ? row[2] ?? row[0] : arr === 'centro' ? row[1] ?? row[0] : row[0]);
  });
  return h;
}

export { newPart };
