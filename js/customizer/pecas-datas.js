// BOLAB — peças do grupo "datas" (datas comemorativas e natureza; módulo carregado sob demanda; ver kit.js).
//
// Tudo genérico (nenhum personagem, nenhuma marca), imitando o que a confeitaria faz de verdade:
//   pasta de açúcar modelada   cogumelos, joaninhas, cenourinhas, abóboras, azevinho, pegadas, flocos de neve
//   suspiro de bico            fantasminhas
//   buttercream no bico        pinheirinhos (cone coberto de pitangas puxadas)
//   papel recortado            dinossauros, folhas tropicais e morcegos (no palito e colados na lateral)
//   palha trançada             chapéu de festa junina
// As medidas (1 = 10 cm) e as esferas de cada peça estão em kit-datas.js; aqui ficam só as malhas.
import { THREE, TAU, drawKit, surface, lathe, tube, trail, onDome, piece, dye, paint, mergeGeometries, smooth, gomo, hash2, rng, fondant, matte, sugar, paper, leafy, cream, shown, shift, pick } from './pecas-base.js';

const Y = new THREE.Vector3(0, 1, 0);
const _P = new THREE.Vector3();
const _N = new THREE.Vector3();
const _Q = new THREE.Quaternion();

// cores de pasta e de papel (um pouco mais fundas que o tom final: a luz do palco clareia)
const RED = '#a90f1a';
const BLACK = '#1b1819';
const IVORY = '#efe2c8';
const WHITE = '#ffffff';
const CARROT = '#e8700f';
const PUMPKIN = '#e9830f';
const HOLLY = '#1d6634';
const SPROUT = '#4b9434';
const PINE = '#2a7f41';
const STRAW = '#c2933f';

/* ───────── Ajudantes ───────── */

/**
 * Contorno fechado e suave por pontos de controle [x, y, quina]: quina = 1 mantém a ponta viva (espinho, garra);
 * os outros pontos viram curva. n = quantos pontos por trecho curvo (entre duas quinas o trecho é reto).
 */
function contour(pts, n = 4) {
  const N = pts.length;
  const out = [];
  const tan = (i, leaving) => {
    const p = pts[i];
    const a = pts[(i + N - 1) % N];
    const b = pts[(i + 1) % N];
    if (p[2]) return leaving ? [b[0] - p[0], b[1] - p[1]] : [p[0] - a[0], p[1] - a[1]];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const m = leaving ? Math.hypot(b[0] - p[0], b[1] - p[1]) : Math.hypot(p[0] - a[0], p[1] - a[1]);
    return [(dx / l) * m, (dy / l) * m];
  };
  for (let i = 0; i < N; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % N];
    const m0 = tan(i, true);
    const m1 = tan((i + 1) % N, false);
    const steps = p[2] && q[2] ? 1 : n;
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      out.push([h00 * p[0] + h10 * m0[0] + h01 * q[0] + h11 * m1[0], h00 * p[1] + h10 * m0[1] + h01 * q[1] + h11 * m1[1]]);
    }
  }
  return out;
}

/** Metade direita de um contorno simétrico (do alto ao pé, os dois extremos no eixo) → contorno inteiro. */
const bothSides = (half) => [...half, ...half.slice(1, -1).reverse().map(([x, y, s]) => [-x, y, s])];

/** Folha fina recortada (papel; face de cima de uma pasta aberta): contorno [[x, y]…] no plano XY, frente em +z. */
function sheet(outline, holes = []) {
  const pts = outline.map(([x, y]) => new THREE.Vector2(x, y));
  const hs = holes.map((h) => h.map(([x, y]) => new THREE.Vector2(x, y)));
  const faces = THREE.ShapeUtils.triangulateShape(pts, hs);
  const all = pts.concat(...hs);
  const pos = new Float32Array(all.length * 3);
  all.forEach((p, i) => {
    pos[i * 3] = p.x;
    pos[i * 3 + 1] = p.y;
  });
  const idx = [];
  faces.forEach(([a, b, c]) => {
    const ccw = (all[b].x - all[a].x) * (all[c].y - all[a].y) - (all[b].y - all[a].y) * (all[c].x - all[a].x) > 0;
    idx.push(a, ccw ? b : c, ccw ? c : b);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return paint(g, 1, 1, 1);
}

/** Beirada de uma chapa cortada: parede de z = 0 a z = depth ao longo do contorno. skip(a, b) pula um trecho. */
function rim(outline, depth, skip = null) {
  const N = outline.length;
  let area = 0;
  for (let i = 0; i < N; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % N];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const pos = [];
  for (let i = 0; i < N; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % N];
    if (skip && skip(a, b)) continue;
    const A = area > 0 ? a : b;
    const B = area > 0 ? b : a;
    pos.push(A[0], A[1], 0, B[0], B[1], 0, B[0], B[1], depth, A[0], A[1], 0, B[0], B[1], depth, A[0], A[1], depth);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return paint(g, 1, 1, 1);
}

/** Move cada vértice (fn recebe o ponto e o altera) e refaz as normais. */
function warp(geo, fn) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    _P.fromBufferAttribute(pos, i);
    fn(_P);
    pos.setXYZ(i, _P.x, _P.y, _P.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Sombra assada por vértice: multiplica a cor por fn(x, y, z). */
function tone(geo, fn) {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const t = fn(pos.getX(i), pos.getY(i), pos.getZ(i));
    col.setXYZ(i, col.getX(i) * t, col.getY(i) * t, col.getZ(i) * t);
  }
  return geo;
}

/** Deita no topo uma peça desenhada no plano XY: o +y do desenho vira +z (a frente) e a espessura sobe em +y. */
const lay = (geo) => geo.rotateX(-Math.PI / 2).rotateY(Math.PI);

/** Pastilha achatada (pinta, olho): disco abaulado de raio r e altura h, assentado em P e deitado na normal N. */
function button(r, h, nv, P, N, rows = 2, oval = 1) {
  const g = lathe(rows > 1 ? [[0.001, h, 1], [r * 0.74, h * 0.82, 1], [r, 0, 0.86]] : [[0.001, h, 1], [r, 0, 0.9]], nv);
  if (oval !== 1) g.scale(1, 1, oval);
  g.applyQuaternion(_Q.setFromUnitVectors(Y, N));
  return g.translate(P.x, P.y, P.z);
}

/* ───────── Cogumelos (pasta de açúcar) ───────── */

/** Cogumelo de jardim encantado: pé claro e gordinho, chapéu vermelho de aba virada e pintinhas brancas achatadas. */
function mushroomGeometry(D, big) {
  const lowp = D < 1;
  const R = big ? 0.17 : 0.128; // raio do chapéu
  const capH = big ? 0.142 : 0.112; // altura da cúpula
  const y0 = big ? 0.215 : 0.152; // altura da aba
  const sr = big ? 0.06 : 0.05; // raio do pé
  const nv = lowp ? 10 : 18;
  const stem = lathe(
    lowp
      ? [[sr * 1.2, 0, 0.74], [sr * 1.3, y0 * 0.2, 0.94], [sr * 0.96, y0 * 0.7, 1], [sr * 0.9, y0 + 0.012, 0.8]]
      : [[sr * 1.15, 0, 0.72], [sr * 1.32, y0 * 0.12, 0.9], [sr * 1.26, y0 * 0.3, 0.98], [sr * 1.03, y0 * 0.6, 1], [sr * 0.93, y0 * 0.85, 0.94], [sr * 0.9, y0 + 0.012, 0.78]],
    lowp ? 8 : 12,
  );
  // chapéu: cúpula, aba enrolada para baixo e o forro claro por baixo — um perfil só (as faces saem viradas para fora)
  const dome = (rho) => y0 + capH * Math.pow(Math.cos(Math.asin(Math.min(1, rho / R))), 0.85);
  const rows = lowp ? 4 : 8;
  const prof = [];
  for (let i = 0; i <= rows; i++) {
    const t = (i / rows) * (Math.PI / 2);
    prof.push([i === 0 ? 0.001 : R * Math.sin(t), y0 + capH * Math.pow(Math.cos(t), 0.85), 0.9 + 0.1 * Math.cos(t)]);
  }
  const red = prof.length;
  prof.push([R * 0.975, y0 - 0.012, 0.8], [R * 0.972, y0 - 0.0125, 0.8], [R * 0.62, y0 - 0.003, 0.66], [sr * 0.9, y0 + 0.008, 0.5]);
  const cap = lathe(prof, nv, (a) => 1 + 0.025 * Math.sin(a * 2 + 1) + 0.015 * Math.sin(a * 3));
  const col = cap.attributes.color;
  const cRed = new THREE.Color(RED);
  const cIvory = new THREE.Color(IVORY);
  for (let i = 0; i < col.count; i++) {
    const c = Math.floor(i / nv) <= red ? cRed : cIvory;
    col.setXYZ(i, col.getX(i) * c.r, col.getY(i) * c.g, col.getZ(i) * c.b);
  }
  const top = [piece(cap)];
  // pintinhas: bolinhas de pasta branca achatadas com o dedo, de tamanhos diferentes
  const dots = big
    ? [[0.1, 0.5, 0.03], [0.5, 0.2, 0.026], [0.53, 1.75, 0.031], [0.48, 3.3, 0.024], [0.55, 4.8, 0.028], [0.83, 1.0, 0.022], [0.85, 2.5, 0.026], [0.82, 4.0, 0.021], [0.86, 5.6, 0.024]]
    : [[0.12, 1.0, 0.024], [0.55, 0.3, 0.022], [0.5, 2.3, 0.025], [0.56, 4.3, 0.021], [0.85, 1.3, 0.018], [0.84, 3.3, 0.02], [0.86, 5.3, 0.018]];
  dots.slice(0, lowp ? (big ? 6 : 5) : 99).forEach(([t, a, r]) => {
    onDome(dome, R * t * Math.sin(a), R * t * Math.cos(a), -0.002, _P, _N);
    top.push(piece(button(r, 0.0075, lowp ? 5 : 9, _P, _N, lowp ? 1 : 2), WHITE));
  });
  // o chapéu assenta um pouco torto, como peça feita à mão
  const hat = mergeGeometries(top).translate(0, -y0, 0).rotateZ(big ? 0.07 : -0.09).rotateX(big ? -0.05 : 0.06).translate(0, y0, 0);
  return mergeGeometries([piece(stem, IVORY), hat]);
}

/* ───────── Joaninhas (pasta de açúcar) ───────── */

/** Joaninha: corpo vermelho em meia-gota, cabeça preta, risca das asas e seis pintas achatadas. Cabeça em +z. */
function ladybugGeometry(D) {
  const lowp = D < 1;
  const R = 0.057;
  const H = 0.06;
  const dome = (rho) => H * Math.pow(Math.cos(Math.asin(Math.min(1, rho / R))), 0.8);
  const rows = lowp ? 4 : 6;
  const prof = [];
  for (let i = 0; i <= rows; i++) {
    const t = (i / rows) * (Math.PI / 2) * 0.94;
    prof.push([i === 0 ? 0.001 : R * Math.sin(t), H * Math.pow(Math.cos(t), 0.8), 0.8 + 0.2 * Math.cos(t)]);
  }
  prof.push([R * 0.95, 0, 0.58]);
  const parts = [piece(lathe(prof, lowp ? 10 : 16), RED)];
  // risca do meio, onde as asas se encontram
  parts.push(piece(trail(lowp ? 5 : 10, (u, P, N) => onDome(dome, 0, (0.5 - u) * 2 * R * 0.93, 0.0004, P, N), 0.0075, 0.0026), BLACK));
  [[0.028, 0.025, 0.011], [0.037, -0.006, 0.012], [0.024, -0.036, 0.01]].forEach(([x, z, r]) =>
    [-1, 1].forEach((s) => {
      onDome(dome, s * x, z, -0.0012, _P, _N);
      parts.push(piece(button(r, 0.0042, lowp ? 5 : 8, _P, _N, lowp ? 1 : 2), BLACK));
    }),
  );
  const body = mergeGeometries(parts).scale(1, 1, 1.14);
  const head = piece(new THREE.SphereGeometry(0.029, lowp ? 6 : 9, lowp ? 4 : 6).scale(1.08, 0.82, 0.86).translate(0, 0.02, 0.064), BLACK);
  return mergeGeometries([body, head]);
}

/* ───────── Cenourinhas (pasta de açúcar) ───────── */

/** Cenoura deitada: cone laranja de ombro redondo, riscos de faca e três folhinhas verdes. Ponta em +z. */
function carrotGeometry(D) {
  const lowp = D < 1;
  const L = 0.25;
  const R = 0.048;
  const m = lowp ? 5 : 10;
  const prof = [[0.001, 0, 0.8], [R * 0.62, 0.003, 0.9], [R * 0.94, 0.014, 1]];
  for (let k = 0; k <= m; k++) {
    const t = k / m;
    const groove = k % 2 === 1 && k < m;
    prof.push([R * (0.15 + 0.85 * Math.pow(1 - t, 0.72)) * (groove ? 0.9 : 1), 0.03 + (L - 0.03) * t, groove ? 0.68 : 1]);
  }
  prof.push([0.001, L + 0.007, 0.9]);
  const parts = [piece(lathe(prof, lowp ? 7 : 10).rotateX(Math.PI / 2), CARROT)];
  // folhinhas: três gotinhas de pasta verde espetadas no ombro
  [[-0.55, 0.3, 0.06], [0.05, 0.55, 0.075], [0.6, 0.25, 0.062]].forEach(([phi, up, len], i) => {
    const leaf = tube(lowp ? 2 : 4, lowp ? 4 : 6, (u, P) => P.set(Math.sin(phi) * len * u, up * len * u * (1 - 0.35 * u), 0.006 - Math.cos(phi) * len * u), (u) => 0.0015 + 0.0125 * Math.pow(Math.sin(Math.PI * (0.12 + 0.82 * u)), 0.8), (u) => 0.82 + 0.18 * u, Y);
    parts.push(piece(leaf, i === 1 ? SPROUT : '#3f8a30'));
  });
  const g = mergeGeometries(parts);
  // levemente torta; deitada com a ponta encostando no bolo
  warp(g, (p) => {
    p.x += 0.016 * Math.pow(Math.max(0, p.z) / L, 2);
  });
  return g.rotateX(0.17).translate(0, R + 0.001, -L * 0.42);
}

/* ───────── Abóboras (pasta de açúcar) ───────── */

/** Mini abóbora: bola achatada de oito gomos marcados, com a cova do cabinho e um cabinho torto e estriado. */
function pumpkinGeometry(D) {
  const lowp = D < 1;
  const lobes = 8;
  const R = 0.148;
  const H = 0.19;
  const body = surface(lowp ? 6 : 10, lobes * (lowp ? 2 : 4), (u, v, p) => {
    const a = v * TAU;
    const t = 0.07 + u * (Math.PI - 0.2);
    const k = gomo(a, lobes, 0.6);
    const ring = Math.pow(Math.sin(t), 0.72);
    const rad = R * ring * (1 - 0.15 * (1 - k));
    const y = H * (0.5 + 0.5 * Math.cos(t)) - (t < Math.PI / 2 ? 0.03 * Math.exp(-Math.pow(Math.sin(t) / 0.45, 2)) : 0);
    p.set(rad * Math.sin(a), y, rad * Math.cos(a));
    return (0.56 + 0.44 * k) * (0.8 + 0.2 * smooth(0, 0.3, 1 - u));
  }, { wrapV: true, shade: true, orient: true });
  const nu = lowp ? 2 : 4;
  const stem = surface(nu, lowp ? 5 : 10, (u, v, p) => {
    const a = v * TAU;
    const top = u > 0.999;
    const w = Math.min(1, u / (1 - 1 / nu));
    const k = gomo(a, 5, 0.8);
    const rad = top ? 0.001 : (0.03 - 0.013 * smooth(0, 0.55, w) + 0.005 * smooth(0.7, 1, w)) * (1 - 0.24 * (1 - k));
    p.set(0.022 * w * w + rad * Math.sin(a), H - 0.04 + 0.078 * w, -0.008 * w + rad * Math.cos(a));
    return (0.66 + 0.34 * k) * (0.82 + 0.18 * w);
  }, { wrapV: true, shade: true, orient: true });
  return mergeGeometries([piece(body, PUMPKIN), piece(stem, '#5a6427')]);
}

/* ───────── Fantasminhas (suspiro) ───────── */

const GHOST = [[0.1, 0, 0.62], [0.122, 0.014, 0.82], [0.13, 0.04, 0.95], [0.127, 0.068, 1], [0.115, 0.096, 0.97], [0.106, 0.116, 0.91], [0.106, 0.138, 0.97], [0.109, 0.162, 1], [0.104, 0.188, 1], [0.092, 0.212, 1], [0.074, 0.234, 1], [0.052, 0.254, 1], [0.031, 0.272, 1], [0.016, 0.29, 1], [0.006, 0.306, 1], [0.001, 0.316, 1]];
const GHOST_LOW = [[0.1, 0, 0.62], [0.13, 0.04, 0.95], [0.117, 0.093, 0.98], [0.106, 0.12, 0.91], [0.109, 0.16, 1], [0.094, 0.208, 1], [0.052, 0.254, 1], [0.016, 0.29, 1], [0.001, 0.316, 1]];

/**
 * Fantasminha de suspiro: duas apertadas do bico liso (barriga e cabeça redondas, com a cintura entre elas), a
 * pontinha curta caída de lado e dois olhos de chocolate.
 */
function ghostGeometry(D) {
  const lowp = D < 1;
  const H = 0.316;
  const body = lathe(lowp ? GHOST_LOW : GHOST, lowp ? 10 : 16);
  warp(body, (p) => {
    const f = p.y / H;
    p.x += 0.034 * Math.pow(f, 5);
    p.y -= 0.01 * Math.pow(f, 8);
  });
  const parts = [piece(body)];
  [-1, 1].forEach((s) => {
    const a = s * 0.34;
    _N.set(Math.sin(a), 0.04, Math.cos(a)).normalize();
    _P.set(0.1075 * Math.sin(a), 0.168, 0.1075 * Math.cos(a)).addScaledVector(_N, -0.0015);
    parts.push(piece(button(0.0185, 0.0065, lowp ? 6 : 12, _P, _N, lowp ? 1 : 2, 1.3), BLACK));
  });
  return mergeGeometries(parts);
}

/* ───────── Azevinho (pasta de açúcar) ───────── */

// metade direita da folha (da base à ponta): três espinhos de cada lado, com o recorte fundo entre eles
const HOLLY_HALF = [[0.012, 0, 1], [0.036, 0.02], [0.066, 0.06, 1], [0.04, 0.087], [0.079, 0.13, 1], [0.043, 0.157], [0.06, 0.197, 1], [0.024, 0.214], [0, 0.252, 1]];

/** Uma folha de azevinho no plano XY (base na origem, ponta em +y), com a espessura da pasta em +z. */
function hollyLeaf(lowp, len = 1) {
  const depth = 0.012;
  const L = 0.252;
  const parts = [];
  [1, -1].forEach((sx) => {
    const half = [[0, 0, 1], ...HOLLY_HALF, [0, 0.19, 1], [0, 0.125, 1], [0, 0.06, 1]].map(([x, y, s]) => [x * sx, y * len, s]);
    const poly = contour(half, lowp ? 2 : 3);
    // a pasta seca sobre uma forma: a folha fica em calha (nervura embaixo), arqueada e com os espinhos ondulados
    const shape = (p) => {
      const ax = Math.abs(p.x);
      p.z += 0.2 * ax + 0.022 * Math.sin((Math.PI * p.y) / (L * len)) + 0.1 * ax * Math.sin(p.y * 46 + (sx > 0 ? 0 : 1.6));
    };
    const top = tone(warp(sheet(poly).translate(0, 0, depth), shape), (x) => 0.62 + 0.38 * smooth(0, 0.03, Math.abs(x)));
    parts.push(piece(top, HOLLY));
    if (!lowp) parts.push(piece(tone(warp(rim(poly, depth, (a, b) => Math.abs(a[0]) < 1e-6 && Math.abs(b[0]) < 1e-6), shape), () => 0.72), HOLLY));
  });
  return mergeGeometries(parts);
}

/** Raminho de azevinho: duas ou três folhas em leque e três frutinhas vermelhas no pé delas. As folhas apontam para +z. */
function hollyGeometry(D, three) {
  const lowp = D < 1;
  const parts = [];
  const fan = three ? [[-0.98, 0.94, 0.07], [0, 1.06, 0.12], [0.98, 0.9, 0.05]] : [[-0.62, 1, 0.08], [0.66, 0.92, 0.05]];
  fan.forEach(([ang, len, lift], i) => {
    parts.push(lay(hollyLeaf(lowp, len)).rotateX(-lift).rotateY(ang).translate(0, 0.002 + 0.004 * i, 0));
  });
  const berry = (r) => lathe(lowp ? [[0.001, 2 * r, 1], [0.87 * r, 1.5 * r, 1], [0.87 * r, 0.5 * r, 0.72]] : [[0.001, 2 * r, 1], [0.71 * r, 1.71 * r, 1], [r, r, 0.96], [0.8 * r, 0.4 * r, 0.7]], lowp ? 6 : 8);
  [[-0.03, -0.009, 0.012, 0.031], [0.03, -0.01, 0.014, 0.029], [0.002, -0.011, -0.036, 0.03]].forEach(([x, y, z, r]) => parts.push(piece(berry(r).translate(x, y, z), RED)));
  return mergeGeometries(parts).translate(0, 0, three ? -0.085 : -0.09);
}

/* ───────── Flocos de neve (pasta de açúcar, cortados com ejetor) ───────── */

// meio braço de cada modelo (o braço aponta para +y; pontos do lado direito, do vão entre dois braços até a ponta)
const FLAKES = [
  [[0.026, 0.045], [0.0125, 0.06], [0.0125, 0.07], [0.05, 0.1075], [0.039, 0.1185], [0.0125, 0.092], [0.0125, 0.108], [0.036, 0.1315], [0.026, 0.1415], [0.0125, 0.128], [0.0125, 0.148], [0, 0.168]],
  [[0.02, 0.0346], [0.012, 0.048], [0.012, 0.06], [0.047, 0.095], [0.036, 0.106], [0.012, 0.082], [0.012, 0.104], [0.025, 0.12], [0, 0.142]],
  [[0.019, 0.033], [0.0115, 0.045], [0.0115, 0.066], [0.03, 0.084], [0.0215, 0.093], [0.0115, 0.083], [0, 0.116]],
];

/** Floco de neve de seis braços, chapado: deitado no topo (ou colado na lateral pelo verso). */
function flakeGeometry(D, kind) {
  const lowp = D < 1;
  const half = FLAKES[kind];
  const arm = [...half, ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
  const outline = [];
  for (let k = 0; k < 6; k++) {
    const c = Math.cos((k * TAU) / 6);
    const s = Math.sin((k * TAU) / 6);
    arm.forEach(([x, y]) => outline.push([x * c - y * s, x * s + y * c]));
  }
  const depth = 0.014;
  const top = sheet(outline).translate(0, 0, depth);
  const g = lowp ? top : mergeGeometries([piece(top), piece(tone(rim(outline, depth), () => 0.86))]);
  return lay(g);
}

/* ───────── Pegadas (pasta de açúcar) ───────── */

/** Almofadinha chapada de pasta: tampo liso, beirada arredondada. */
function pad(rx, rz, h, lowp, nv, wave = null) {
  const g = lathe(lowp ? [[0.001, h, 1], [0.8, h, 1], [1, 0, 0.8]] : [[0.001, h, 1], [0.78, h, 1], [0.95, h * 0.62, 0.95], [1, 0, 0.78]], nv, wave);
  return g.scale(rx, 1, rz);
}

/** Pegada: uma almofada grande (triangular, com o recorte no calcanhar) e quatro dedos. Os dedos apontam para +z. */
function pawGeometry(D) {
  const lowp = D < 1;
  const h = 0.014;
  // almofada: a ponta virada para os dedos, os dois cantos atrás e o recorte no meio da base
  const parts = [pad(0.062, 0.05, h, lowp, lowp ? 10 : 18, (a) => 1 + 0.07 * Math.cos(3 * a) - 0.08 * Math.exp(-Math.pow((a - Math.PI) / 0.3, 2))).translate(0, 0, -0.04)];
  [[-0.069, 0.026, 0.024, 0.031, 0.42], [-0.027, 0.064, 0.0245, 0.034, 0.12], [0.027, 0.064, 0.0245, 0.034, -0.12], [0.069, 0.026, 0.024, 0.031, -0.42]].forEach(([x, z, rx, rz, turn]) => {
    parts.push(pad(rx, rz, h, lowp, lowp ? 6 : 10).rotateY(-turn).translate(x, 0, z));
  });
  return mergeGeometries(parts.map((g) => piece(g)));
}

/* ───────── Pinheirinhos (buttercream no bico pitanga) ───────── */

/**
 * Uma pitanga puxada (bico estrela): os gomos nascem gordos no pé e se juntam na ponta — cristas claras
 * levantadas, vales fundos rentes ao cone. Eixo +y, pé na origem. shade escurece a peça inteira (umas ficam
 * mais na sombra que as outras).
 */
function spike(b, len, lobes, lowp, shade = 1) {
  const pos = [];
  const col = [];
  const put = (x, y, z, t) => {
    pos.push(x, y, z);
    col.push(t * shade, t * shade, t * shade);
    return pos.length / 3 - 1;
  };
  const n = lobes * 2;
  const ring = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const crest = i % 2 === 0;
    const r = crest ? b : b * 0.62;
    ring.push(put(r * Math.sin(a), crest ? len * 0.3 : 0, r * Math.cos(a), crest ? 1 : 0.44));
  }
  const tip = put(b * 0.14, len, 0, 1);
  const idx = [];
  for (let i = 0; i < n; i++) idx.push(ring[i], ring[(i + 1) % n], tip);
  // o lado de baixo de cada gomo (só no computador: de perto dá para ver por baixo)
  if (!lowp) for (let i = 0; i < n; i += 2) idx.push(ring[(i + n - 1) % n], ring[i], ring[(i + 1) % n]);
  // faces para fora do eixo
  const c = len * 0.35;
  for (let i = 0; i < idx.length; i += 3) {
    const [i0, i1, i2] = [idx[i] * 3, idx[i + 1] * 3, idx[i + 2] * 3];
    const ux = pos[i1] - pos[i0];
    const uy = pos[i1 + 1] - pos[i0 + 1];
    const uz = pos[i1 + 2] - pos[i0 + 2];
    const vx = pos[i2] - pos[i0];
    const vy = pos[i2 + 1] - pos[i0 + 1];
    const vz = pos[i2 + 2] - pos[i0 + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const mx = (pos[i0] + pos[i1] + pos[i2]) / 3;
    const my = (pos[i0 + 1] + pos[i1 + 1] + pos[i2 + 1]) / 3 - c;
    const mz = (pos[i0 + 2] + pos[i1 + 2] + pos[i2 + 2]) / 3;
    if (nx * mx + ny * my + nz * mz < 0) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Estrela de cinco pontas facetada (açúcar), em pé no plano XY, centro na origem. */
function starTopper(r, t) {
  const rimPts = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    const q = i % 2 ? r * 0.44 : r;
    rimPts.push([q * Math.sin(a), q * Math.cos(a)]);
  }
  const pos = [];
  for (let i = 0; i < 10; i++) {
    const a = rimPts[i];
    const b = rimPts[(i + 1) % 10];
    pos.push(0, 0, t, b[0], b[1], 0, a[0], a[1], 0, 0, 0, -t, a[0], a[1], 0, b[0], b[1], 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return paint(g, 1, 1, 1);
}

/** Pinheirinho de bico: cone coberto de pitangas verdes puxadas para fora, fileira por fileira, e estrela na ponta. */
function treeGeometry(D, tall) {
  const lowp = D < 1;
  const H = tall ? 0.7 : 0.49;
  const R = tall ? 0.17 : 0.135;
  const b0 = lowp ? 0.1 : 0.074;
  const lobes = lowp ? 5 : 6;
  const r = rng(tall ? 4117 : 2903);
  const parts = [piece(lathe([[R * 1.04, 0, 0.42], [R * 0.52, H * 0.5, 0.42], [0.001, H * 0.96, 0.42]], lowp ? 6 : 9), PINE)];
  const dir = new THREE.Vector3();
  let y = b0 * 0.9;
  let bTop = b0;
  for (let row = 0; row < 12; row++) {
    const f = y / H;
    const b = b0 * (1 - 0.34 * f);
    const rho = R * (1 - f);
    if (rho < b * 0.3) break;
    bTop = b;
    const n = Math.max(3, Math.round((TAU * (rho + b * 0.35)) / (b * 1.72)));
    const a0 = row * 0.9 + r() * 0.5;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU + (r() - 0.5) * 0.12;
      const tilt = 0.02 + 0.5 * f + (r() - 0.5) * 0.14; // embaixo sai quase reta; no alto, aponta para cima
      dir.set(Math.cos(tilt) * Math.sin(a), Math.sin(tilt), Math.cos(tilt) * Math.cos(a));
      const g = spike(b * (0.94 + r() * 0.12), b * (1.18 + r() * 0.24), lobes, lowp, 0.84 + 0.16 * r()).rotateY(r() * TAU);
      g.applyQuaternion(_Q.setFromUnitVectors(Y, dir));
      g.translate(Math.sin(a) * (rho - b * 0.2), y, Math.cos(a) * (rho - b * 0.2));
      parts.push(piece(g, PINE));
    }
    y += b * 1.5;
  }
  // a pitanga da ponta, em pé, e a estrela espetada nela
  const bt = bTop * 0.8;
  parts.push(piece(spike(bt, bt * 1.7, lobes, lowp).translate(0, H - bt * 1.15, 0), PINE));
  const rs = tall ? 0.062 : 0.054;
  parts.push(piece(starTopper(rs, rs * 0.3).translate(0, H + bt * 0.45 + rs * 0.62, 0), '#f0b91f'));
  return mergeGeometries(parts);
}

/* ───────── Chapéu de palha (festa junina) ───────── */

/** Mini chapéu de palha trançada: copa de tampo chato, aba larga ondulada e desfiada na beira, fita xadrez vermelha. */
function strawHatGeometry(D) {
  const lowp = D < 1;
  const Rc = 0.2; // raio da copa
  const Hc = 0.195; // altura da copa
  const Rb = 0.405; // raio da aba
  const nv = lowp ? 28 : 48;
  const half = lowp ? 0.02 : 0.0135; // meia volta da trança (crista / vale)
  const bump = lowp ? 0.003 : 0.0035;
  const wallR = (y) => Rc - 0.01 * (y / Hc);
  // perfil do centro do tampo até a beira da aba: [raio, y, tom]; as voltas da trança são cristas e vales alternados
  const prof = [[0.001, Hc + 0.005, 0.95]];
  let k = 1;
  const crest = () => (k++ % 2 ? 1 : 0);
  for (let rr = half; rr < Rc * 0.9; rr += half) {
    const c = crest();
    prof.push([rr, Hc + 0.005 * (1 - Math.pow(rr / Rc, 2)) + bump * c, 0.64 + 0.36 * c]);
  }
  prof.push([wallR(Hc) - 0.006, Hc - 0.004 + bump, 1]);
  for (let yy = Hc - 0.018; yy > 0.016; yy -= half) {
    const c = crest();
    prof.push([wallR(yy) + bump * c, yy, 0.62 + 0.36 * c]);
  }
  prof.push([Rc + 0.008, 0.006, 0.6]);
  for (let rr = Rc + 0.008 + half; rr < Rb - half * 0.5; rr += half) {
    const c = crest();
    prof.push([rr, 0.004 + bump * c, 0.64 + 0.36 * c]);
  }
  prof.push([Rb, 0.005, 0.92]);
  const nu = prof.length - 1;
  // a aba ondula e levanta um pouco na beira
  const brimY = (rad, a) => {
    const w = Math.max(0, (rad - Rc) / (Rb - Rc));
    return 0.042 * w * w + (0.016 * Math.sin(2 * a + 0.6) + 0.007 * Math.sin(5 * a + 2)) * w * w;
  };
  const straw = surface(nu, nv, (u, v, p) => {
    const i = Math.round(u * nu);
    const j = Math.round(v * nv) % nv;
    const a = v * TAU;
    const row = prof[i];
    const rad = row[0] + (i === nu ? (hash2(j, 7) - 0.5) * 0.012 : 0);
    p.set(rad * Math.sin(a), row[1] + brimY(rad, a), rad * Math.cos(a));
    // palha: cada volta tem os pontos da trança (claro / escuro em xadrez) e fios de tons diferentes
    return row[2] * (0.9 + 0.1 * ((i + j) % 2)) * (0.9 + 0.14 * hash2(i, j));
  }, { wrapV: true, shade: true });
  const parts = [piece(straw, STRAW)];
  // beira desfiada: pontas soltas de palha
  const fr = [];
  const nf = nv * 2;
  for (let j = 0; j < nf; j++) {
    const a = ((j + 0.5) / nf) * TAU;
    const da = (0.5 / nf) * TAU;
    const out = Rb + 0.01 + 0.024 * hash2(j, 3);
    const sk = (hash2(j, 5) - 0.5) * 0.05;
    const y1 = brimY(Rb, a) + 0.005;
    fr.push(Rb * 0.99 * Math.sin(a - da), brimY(Rb, a - da) + 0.005, Rb * 0.99 * Math.cos(a - da), Rb * 0.99 * Math.sin(a + da), brimY(Rb, a + da) + 0.005, Rb * 0.99 * Math.cos(a + da), out * Math.sin(a + sk), y1 + (hash2(j, 9) - 0.4) * 0.012, out * Math.cos(a + sk));
  }
  const fringe = new THREE.BufferGeometry();
  fringe.setAttribute('position', new THREE.Float32BufferAttribute(fr, 3));
  fringe.computeVertexNormals();
  paint(fringe, 1, 1, 1);
  parts.push(piece(tone(fringe, (x, y, z) => 0.74 + 0.26 * hash2(Math.round(x * 400), Math.round(z * 400))), STRAW));
  // fita xadrez (vichy) vermelha em volta da copa: quadradinhos de três tons
  const ncol = lowp ? 36 : 52;
  const nrow = lowp ? 2 : 3;
  const cell = (TAU * (Rc + 0.004)) / ncol;
  const pos = [];
  const col = [];
  const tones = [new THREE.Color('#a8121e'), new THREE.Color('#d2565f'), new THREE.Color('#f4ece2')];
  for (let c = 0; c < ncol; c++) {
    for (let rw = 0; rw < nrow; rw++) {
      const a0 = (c / ncol) * TAU;
      const a1 = ((c + 1) / ncol) * TAU;
      const y0 = 0.024 + rw * cell;
      const y1 = y0 + cell;
      const r0 = wallR(y0) + 0.0065;
      const r1 = wallR(y1) + 0.0065;
      const q = [[r0 * Math.sin(a0), y0, r0 * Math.cos(a0)], [r0 * Math.sin(a1), y0, r0 * Math.cos(a1)], [r1 * Math.sin(a1), y1, r1 * Math.cos(a1)], [r1 * Math.sin(a0), y1, r1 * Math.cos(a0)]];
      [0, 1, 2, 0, 2, 3].forEach((n) => pos.push(...q[n]));
      const t = tones[(c % 2) + (rw % 2)];
      for (let n = 0; n < 6; n++) col.push(t.r, t.g, t.b);
    }
  }
  const band = new THREE.BufferGeometry();
  band.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  band.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  band.computeVertexNormals();
  parts.push(piece(band));
  return mergeGeometries(parts);
}

/* ───────── Dinossauros (silhuetas de papel, no palito) ───────── */

// contornos em centímetros, o bicho olhando para a direita, pés em y = 0: [x, y, quina]
const DINO = {
  // pescoçudo
  neck: [[-4, 2, 1], [-3.1, 2.55], [-2.1, 3.05], [-1.1, 3.55], [0, 3.75], [0.9, 3.6], [1.45, 3.75], [1.95, 4.4], [2.3, 5.15], [2.62, 5.75], [3, 6.05], [3.45, 6], [3.8, 5.72], [3.72, 5.45], [3.3, 5.32], [2.98, 5.2], [2.82, 4.85], [2.62, 4.2], [2.35, 3.45], [2.1, 2.8], [2, 2], [1.98, 1], [2, 0, 1], [1.05, 0, 1], [1.08, 0.9], [0.95, 1.6], [0.3, 1.8], [-0.4, 1.78], [-0.72, 1.5], [-0.7, 0.8], [-0.68, 0, 1], [-1.65, 0, 1], [-1.62, 0.9], [-1.78, 1.65], [-2.2, 1.95], [-2.9, 1.85], [-3.5, 1.78]],
  // de placas nas costas
  plates: [
    [-4.1, 2.35, 1], [-3.85, 2.55, 1], [-3.95, 3.3, 1], [-3.5, 2.7, 1], [-3.2, 2.8, 1], [-3.15, 3.5, 1], [-2.8, 2.92, 1], [-2.45, 3.02, 1],
    [-2.35, 3.05, 1], [-2.5, 3.6], [-2.05, 4.05, 1], [-1.7, 3.7], [-1.6, 3.3, 1],
    [-1.5, 3.33, 1], [-1.6, 4], [-1.05, 4.55, 1], [-0.6, 4.1], [-0.5, 3.52, 1],
    [-0.4, 3.54, 1], [-0.45, 4.25], [0.15, 4.85, 1], [0.7, 4.2], [0.7, 3.5, 1],
    [0.8, 3.48, 1], [0.85, 4.05], [1.4, 4.45, 1], [1.8, 3.85], [1.72, 3.2, 1],
    [1.82, 3.15, 1], [1.95, 3.6], [2.4, 3.8, 1], [2.6, 3.3], [2.5, 2.85, 1],
    [2.85, 2.6], [3.3, 2.15], [3.75, 1.9], [4.1, 1.6], [4.15, 1.3], [3.8, 1.15], [3.3, 1.3], [2.8, 1.55], [2.35, 1.6],
    [2.2, 1], [2.2, 0, 1], [1.35, 0, 1], [1.4, 0.7], [1.25, 1.3], [0.5, 1.25], [-0.5, 1.25], [-0.8, 1], [-0.78, 0, 1], [-1.75, 0, 1], [-1.75, 0.85], [-2, 1.55], [-2.7, 1.95], [-3.4, 2.15],
  ],
  // de três chifres
  horns: [
    [-3.9, 1.7, 1], [-3.3, 2.35], [-2.5, 3.05], [-1.4, 3.45], [-0.2, 3.5], [0.6, 3.4],
    [0.85, 3.45, 1], [0.7, 4.1], [1, 4.6], [1.6, 4.75], [2.15, 4.5], [2.4, 4],
    [2.5, 3.8, 1], [3.15, 4.95, 1], [2.9, 3.85, 1], [3.75, 4.65, 1], [3.15, 3.45, 1],
    [3.4, 3.1], [3.55, 2.85, 1], [3.95, 3.3, 1], [3.85, 2.65, 1], [4.05, 2.3], [4.1, 1.85, 1], [3.7, 1.8], [3.1, 1.75], [2.6, 1.7], [2.3, 1.55],
    [2.2, 0.9], [2.2, 0, 1], [1.3, 0, 1], [1.35, 0.8], [1.2, 1.35], [0.4, 1.3], [-0.6, 1.3], [-0.9, 1.05], [-0.88, 0, 1], [-1.85, 0, 1], [-1.85, 0.85], [-2.1, 1.45], [-2.9, 1.6],
  ],
};

/** Silhueta de dinossauro recortada em papel grosso: de frente (+z), o palito colado por trás, entrando pelos pés. */
function dinoGeometry(D, kind) {
  const lowp = D < 1;
  const k = 0.076;
  const g = sheet(contour(DINO[kind].map(([x, y, s]) => [x * k, y * k, s]), lowp ? 2 : 4));
  // o papel abaúla um tico (não fica uma chapa dura)
  return warp(g, (p) => {
    p.z = 0.013 + 0.05 * p.x * p.x;
  });
}

/* ───────── Folhas tropicais (papel) ───────── */

/** Metade direita da costela-de-adão: contorno em coração com cinco rasgos fundos; cabinho em (0, 0), ponta em +y. */
function monsteraHalf() {
  const cy = 0.27;
  const env = (th) => 0.31 + 0.2 * Math.pow(Math.cos(th / 2), 4);
  const at = (deg, k = 1, s = 0) => {
    const th = (deg * Math.PI) / 180;
    const rho = env(th) * k;
    return [rho * Math.sin(th), cy + rho * Math.cos(th), s];
  };
  const pts = [[0, cy + env(0), 1], at(9, 0.99)];
  const slits = [[26, 0.52], [51, 0.36], [77, 0.3], [104, 0.3], [132, 0.4]];
  slits.forEach(([deg, deep], i) => {
    const wall = deep + (1 - deep) * 0.6;
    pts.push(at(deg - 6.5, 0.985), at(deg - 2.4, wall), at(deg, deep), at(deg + 2.4, wall), at(deg + 6.5, 0.985));
    if (i < slits.length - 1) pts.push(at((deg + slits[i + 1][0]) / 2, 1.01));
  });
  pts.push(at(150, 1), at(164, 0.95), at(174, 0.74), [0.034, cy - 0.03], [0.013, cy - 0.06, 1], [0.013, 0, 1]);
  return pts.reverse(); // do cabinho para a ponta
}

/** Metade direita da folha de palmeira: talo no meio e folíolos pontudos, inclinados para a ponta. */
function palmHalf() {
  const w0 = 0.011;
  const pts = [[w0, 0, 1]];
  const N = 10;
  for (let k = 0; k < N; k++) {
    const yb = 0.115 + 0.064 * k;
    const g = 0.026;
    const len = 0.33 * Math.pow(Math.sin(Math.PI * (0.13 + 0.78 * (k / (N - 1)))), 0.8);
    const al = ((58 - 26 * (k / (N - 1))) * Math.PI) / 180;
    const dx = Math.sin(al);
    const dy = Math.cos(al);
    pts.push([w0, yb - g, 1], [w0 + dx * len * 0.5 + dy * 0.024, yb - g + dy * len * 0.5 - dx * 0.024], [w0 + dx * len, yb + dy * len, 1], [w0 + dx * len * 0.45 - dy * 0.004, yb + g + dy * len * 0.45 + dx * 0.004], [w0, yb + g, 1]);
  }
  pts.push([w0, 0.745, 1], [0.036, 0.81], [0, 0.9, 1]);
  return pts;
}

/**
 * Folha de papel dobrada na nervura: as duas metades são chapas separadas (a dobra fica marcada).
 * halfPts = metade direita, do cabinho (em y = 0) até a ponta (0, top) · fold = quanto as beiradas vêm para a
 * frente · bow = quanto a folha enverga de lado · holes = furos (metade direita)
 */
function paperLeaf(halfPts, top, lowp, { fold = 0.16, bow = 0, holes = [], mid = 4 } = {}) {
  const parts = [];
  [1, -1].forEach((sx) => {
    // a metade fecha pela nervura (pontos no eixo, da ponta de volta ao cabinho)
    const spine = [];
    for (let i = 1; i <= mid; i++) spine.push([0, top * (1 - i / (mid + 1)), 1]);
    const poly = contour([[0, 0, 1], ...halfPts, ...spine].map(([x, y, s]) => [x * sx, y, s]), lowp ? 2 : 3);
    const g = sheet(poly, lowp ? [] : holes.map((h) => h.map(([x, y]) => [x * sx, y])));
    tone(g, (x) => 0.74 + 0.26 * smooth(0, 0.05, Math.abs(x)));
    parts.push(piece(warp(g, (p) => {
      p.z = fold * Math.abs(p.x);
      p.x += bow * p.y * p.y;
    })));
  });
  return mergeGeometries(parts);
}

/** Furo oval (fenestra da costela-de-adão), deitado na direção ang (graus a partir da ponta). */
function ovalHole(deg, rho, len, wid) {
  const th = (deg * Math.PI) / 180;
  const cx = rho * Math.sin(th);
  const cy = 0.27 + rho * Math.cos(th);
  const out = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const u = Math.cos(a) * len;
    const v = Math.sin(a) * wid;
    out.push([cx + u * Math.sin(th) + v * Math.cos(th), cy + u * Math.cos(th) - v * Math.sin(th)]);
  }
  return out;
}

/** kind: 0 = costela-de-adão · 1 = palmeira. decal = colada na lateral (menor, centrada, quase chapada). */
function leafGeometry(D, kind, decal) {
  const lowp = D < 1;
  const g = kind === 0 ? paperLeaf(monsteraHalf(), 0.78, lowp, { fold: decal ? 0.05 : 0.16, holes: [ovalHole(38, 0.16, 0.036, 0.013), ovalHole(90.5, 0.125, 0.03, 0.012)] }) : paperLeaf(palmHalf(), 0.9, lowp, { fold: decal ? 0.06 : 0.2, bow: 0.13, mid: 6 });
  if (!decal) return g.translate(0, 0, 0.013);
  return g.translate(kind === 0 ? 0 : -0.045, kind === 0 ? -0.4 : -0.47, 0.004).scale(0.64, 0.64, 0.64);
}

/* ───────── Morcegos (papel preto) ───────── */

// metade direita, do vão entre as orelhas até o pé: orelha pontuda, "dedão" da asa, ponta da asa e três recortes
const BAT_HALF = [[0, 0.092], [0.014, 0.1], [0.034, 0.143, 1], [0.047, 0.096], [0.062, 0.08], [0.1, 0.1], [0.165, 0.13, 1], [0.228, 0.107], [0.287, 0.04, 1], [0.24, 0.035], [0.205, -0.035, 1], [0.16, 0.002], [0.118, -0.062, 1], [0.078, -0.02], [0.045, -0.055], [0.03, -0.095], [0.012, -0.11], [0, -0.104]];

/** Morcego de papel: corpo chapado e asas dobradas para a frente. decal = colado na lateral pelo corpo (centrado). */
function batGeometry(D, decal) {
  const lowp = D < 1;
  const g = sheet(contour(bothSides(BAT_HALF), lowp ? 2 : 4));
  warp(g, (p) => {
    const w = Math.max(0, Math.abs(p.x) - 0.045);
    p.z = (decal ? 0.004 : 0.013) + (decal ? 0.36 : 0.24) * w;
    if (!decal) p.y += 0.112;
  });
  return dye(g, BLACK);
}

/* ───────── Registro ───────── */

const vary = (list) => (p, i, r) => pick(list, r);
/** Tons de cartolina a partir da cor escolhida: de frente para a luz do palco o papel clareia muito, então a tinta desce. */
const cardTints = (hex) => {
  const c = shift(shown(hex), 0, 1.3, -0.17);
  return [c, shift(c, 0.012, 1.05, 0.035), shift(c, -0.01, 1, -0.03)];
};

/** id → malhas de cada variante (na ordem de kit-datas.js); também serve aos testes de cobertura das esferas. */
export const MALHAS = {
  cogumelos: [(D) => mushroomGeometry(D, true), (D) => mushroomGeometry(D, false)],
  joaninhas: [ladybugGeometry],
  dinos: [(D) => dinoGeometry(D, 'neck'), (D) => dinoGeometry(D, 'plates'), (D) => dinoGeometry(D, 'horns')],
  folhastropicais: [(D) => leafGeometry(D, 0, false), (D) => leafGeometry(D, 1, false), (D) => leafGeometry(D, 0, true), (D) => leafGeometry(D, 1, true)],
  pegadas: [pawGeometry],
  chapeupalha: [strawHatGeometry],
  azevinho: [(D) => hollyGeometry(D, true), (D) => hollyGeometry(D, false)],
  pinheirinhos: [(D) => treeGeometry(D, true), (D) => treeGeometry(D, false)],
  flocos: [(D) => flakeGeometry(D, 0), (D) => flakeGeometry(D, 1), (D) => flakeGeometry(D, 2)],
  cenourinhas: [carrotGeometry],
  fantasmas: [ghostGeometry],
  aboboras: [pumpkinGeometry],
  morcegos: [(D) => batGeometry(D, false), (D) => batGeometry(D, true)],
};

/** Monta as variantes de uma decoração para drawKit: uma malha por variante, mesmo material e mesma tinta. */
const kit = (id, mat, extra = {}) => (ctx, part) => drawKit(ctx, part, id, MALHAS[id].map((make, v) => ({ key: `pd-${id}${v}`, make, mat, ...extra })));

const LEAF_TINTS = [['#2b6b3a', '#3d8346'], ['#5b9a40', '#3d8346']];

export const BUILDERS = {
  cogumelos: kit('cogumelos', fondant),
  joaninhas: kit('joaninhas', fondant),
  dinos: kit('dinos', leafy, { tint: (p, i, r, color) => cardTints(color || '#5f8f6a')[p.v % 3], cast: true }),
  folhastropicais: kit('folhastropicais', leafy, { tint: (p, i) => LEAF_TINTS[p.v % 2][i % 2] }),
  pegadas: kit('pegadas', fondant, { tint: (p, i, r, color) => shown(color || '#3a1a08'), cast: false }),
  chapeupalha: kit('chapeupalha', paper, { cast: true }),
  azevinho: kit('azevinho', fondant),
  pinheirinhos: kit('pinheirinhos', cream, { tint: vary(['#ffffff', '#eef7e6', '#f3fff0']), cast: true }),
  flocos: kit('flocos', sugar),
  cenourinhas: kit('cenourinhas', fondant, { tint: vary(['#ffffff', '#fff1e2', '#ffe9d6']) }),
  fantasmas: kit('fantasmas', matte),
  aboboras: kit('aboboras', fondant, { tint: vary(['#ffffff', '#fff0dc', '#ffe6cf']), scale: (p, r) => [1, 0.88 + r() * 0.2, 1] }),
  morcegos: kit('morcegos', leafy),
};
