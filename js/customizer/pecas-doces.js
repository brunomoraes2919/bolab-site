// BOLAB — peças do grupo "doces" (chocolate e docinhos; módulo carregado sob demanda; ver kit.js).
// Tudo é geometria gerada por código, na medida do doce de verdade (1 = 10 cm). As partes de cada variante são
// fundidas numa geometria com a cor (e a sombra "assada") nos vértices; a cor escolhida no painel entra por
// instância e multiplica a do vértice. A composição de cada variante (onde fica cada lasca, cada canudo…)
// vem de kit-doces.js, de onde saem também as esferas de ocupação — a malha e as esferas nascem da mesma conta.
import { THREE, mergeGeometries, TAU, rng, makeCanvas, texture, drawKit, drawCoat, KIT, frameQuat, surface, lathe, tube, trail, piece, smooth, hash2, pick, mix, shift, shown, lightOf, tintsOf, matte, chocolate, candy, sugar, glitter } from './pecas-base.js';
import { canePath, CANE, puddleEdge } from './kit-doces.js';

const lerp = (a, b, t) => a + (b - a) * t;
const Y = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3();

/* ───────── Materiais do grupo ───────── */

// massa assada e doce esfarelento (cookie, paçoca, casquinha): fosco, com um granulado fino no relevo
const crumb = (lib) => lib.custom('dc-crumb', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, normalMap: lib.tex.glitterNormal(), normalScale: new THREE.Vector2(0.4, 0.4), vertexColors: true }));
// bala passada no açúcar cristal: fosca, com os cristais faiscando
const sugared = (lib) => lib.custom('dc-sugared', () => lib.physical({ color: 0xffffff, roughness: 0.5, sheen: 0.3, sheenRoughness: 0.5, sheenColor: 0xffffff, normalMap: lib.tex.glitterNormal(), normalScale: new THREE.Vector2(0.8, 0.8), vertexColors: true }));
// sorvete: massa fosca de grão fino, com o brilho molhado de quem está derretendo
const icecream = (lib) => lib.custom('dc-icecream', () => lib.physical({ color: 0xffffff, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.3, normalMap: lib.tex.glitterNormal(), normalScale: new THREE.Vector2(0.22, 0.22), vertexColors: true }));

/* ───────── Ajudantes de geometria ───────── */

/** Ruído suave (0…1), fixo: manchas do marmorizado, calombos da pipoca. */
function noise3(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const sz = fz * fz * (3 - 2 * fz);
  const h = (i, j, k) => hash2(i + k * 57.3, j - k * 31.7);
  return lerp(
    lerp(lerp(h(xi, yi, zi), h(xi + 1, yi, zi), sx), lerp(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), sx), sy),
    lerp(lerp(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), sx), lerp(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), sx), sy),
    sz,
  );
}

/** Valor de uma lista de pontos igualmente espaçados em t = 0…1 (interpola em linha reta: quinas vivas). */
function prof(list, t) {
  const x = Math.max(0, Math.min(1, t)) * (list.length - 1);
  const i = Math.min(list.length - 2, Math.floor(x));
  return lerp(list[i], list[i + 1], x - i);
}

/** Polos de uma superfície fechada em volta (fileira da ponta num ponto só): a mesma normal para todos — sem a "estrela" de sombra. */
function fixPoles(geo, nv) {
  const nor = geo.attributes.normal;
  const n = nor.count;
  [[0, nv], [n - nv, n]].forEach(([a, b]) => {
    _d.set(0, 0, 0);
    for (let i = a; i < b; i++) _d.set(_d.x + nor.getX(i), _d.y + nor.getY(i), _d.z + nor.getZ(i));
    _d.normalize();
    for (let i = a; i < b; i++) nor.setXYZ(i, _d.x, _d.y, _d.z);
  });
  return geo;
}

/** Bola (ou calombo): rad(d) dá o raio na direção d; tone(d, p) o tom. Centro na origem; polos em ±y. */
function blob(nu, nv, rad, tone = null) {
  return fixPoles(
    surface(nu, nv, (u, v, p) => {
      const phi = u * Math.PI;
      const a = v * TAU;
      _d.set(Math.sin(phi) * Math.sin(a), Math.cos(phi), Math.sin(phi) * Math.cos(a));
      p.copy(_d).multiplyScalar(typeof rad === 'function' ? rad(_d) : rad);
      return tone ? tone(_d, p) : 1;
    }, { wrapV: true, shade: true, orient: true }),
    nv,
  );
}

/** Assenta a peça: o ponto mais baixo fica `sink` abaixo do apoio; centre = centraliza em x e z. */
function settle(geo, sink = 0.003, centre = false) {
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  geo.translate(centre ? -(b.min.x + b.max.x) / 2 : 0, -b.min.y - sink, centre ? -(b.min.z + b.max.z) / 2 : 0);
  return geo;
}

/** UV para o granulado do relevo (normalMap): a posição projetada, k repetições por unidade. */
function grainUV(geo, k = 4) {
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) + 0.41 * pos.getY(i)) * k;
    uv[i * 2 + 1] = (pos.getZ(i) + 0.67 * pos.getY(i)) * k;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/**
 * UV em volta do eixo y (peças torneadas; geometria sem índice): u = arco, v = altura (no tampo, continua para o
 * meio). R = raio típico da peça; k = repetições por unidade.
 */
function wrapUV(geo, R, k = 3) {
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const a = [0, 0, 0];
  for (let t = 0; t < pos.count; t += 3) {
    for (let q = 0; q < 3; q++) a[q] = Math.atan2(pos.getX(t + q), pos.getZ(t + q));
    const hi = Math.max(a[0], a[1], a[2]);
    for (let q = 0; q < 3; q++) {
      const i = t + q;
      uv[i * 2] = (hi - a[q] > Math.PI ? a[q] + TAU : a[q]) * R * k;
      uv[i * 2 + 1] = (pos.getY(i) - Math.hypot(pos.getX(i), pos.getZ(i))) * k;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** Troca o tom guardado nos vértices (0…1) por uma cor da rampa stops = [[tom, '#hex']…]. */
function ramp(geo, stops) {
  const col = geo.attributes.color;
  const cs = stops.map(([t, hex]) => [t, new THREE.Color(hex)]);
  const c = new THREE.Color();
  for (let i = 0; i < col.count; i++) {
    const t = col.getX(i);
    let k = 0;
    while (k < cs.length - 2 && t > cs[k + 1][0]) k++;
    c.copy(cs[k][1]).lerp(cs[k + 1][1], Math.max(0, Math.min(1, (t - cs[k][0]) / (cs[k + 1][0] - cs[k][0]))));
    col.setXYZ(i, c.r, c.g, c.b);
  }
  return geo;
}

/** Cor por face (cada quadrado da malha de `surface`): fn(i, j) → THREE.Color, que multiplica o tom. Sai sem índice. */
function faceColors(geo, nv, fn) {
  const g = geo.toNonIndexed();
  const col = g.attributes.color;
  for (let q = 0; q < col.count / 6; q++) {
    const c = fn(Math.floor(q / nv), q % nv);
    for (let k = 0; k < 6; k++) {
      const i = q * 6 + k;
      col.setXYZ(i, col.getX(i) * c.r, col.getY(i) * c.g, col.getZ(i) * c.b);
    }
  }
  return g;
}

/**
 * Chapa fina com espessura (lasca de chocolate, vela de chocolate): at(u, v, P) dá o meio da chapa
 * (u = largura, v = altura). Sai uma casca fechada: frente (+ normal), verso e a borda.
 */
function sheet(nu, nv, at, thick, tone = () => 1) {
  const pts = [];
  const nor = [];
  const p = new THREE.Vector3();
  const id = (i, j) => i * (nv + 1) + j;
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      at(i / nu, j / nv, p);
      pts.push(p.clone());
    }
  }
  const du = new THREE.Vector3();
  const dv = new THREE.Vector3();
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      du.subVectors(pts[id(Math.min(nu, i + 1), j)], pts[id(Math.max(0, i - 1), j)]);
      dv.subVectors(pts[id(i, Math.min(nv, j + 1))], pts[id(i, Math.max(0, j - 1))]);
      nor.push(new THREE.Vector3().crossVectors(du, dv).normalize());
    }
  }
  const face = (side) =>
    surface(nu, nv, (u, v, q) => {
      const k = id(Math.round(u * nu), Math.round(v * nv));
      q.copy(pts[k]).addScaledVector(nor[k], side * thick * 0.5);
      return tone(u, v, side);
    }, { shade: true, flip: side < 0 });
  const loop = [];
  for (let i = 0; i < nu; i++) loop.push(id(i, 0));
  for (let j = 0; j < nv; j++) loop.push(id(nu, j));
  for (let i = nu; i > 0; i--) loop.push(id(i, nv));
  for (let j = nv; j > 0; j--) loop.push(id(0, j));
  const L = loop.length;
  const rim = surface(1, L, (u, v, q) => {
    const k = loop[Math.round(v * L) % L];
    q.copy(pts[k]).addScaledVector(nor[k], (u < 0.5 ? 1 : -1) * thick * 0.5);
    return 0.86;
  }, { wrapV: true, shade: true, orient: true });
  return mergeGeometries([piece(face(1)), piece(face(-1)), piece(rim)]);
}

/**
 * Bloco de cantos arredondados, feito de fileiras: meio-lados a × b (em x e z), raio de canto c;
 * rows = [[recuo, y, tom]] (recuo = quanto o contorno entra; null fecha a fileira num ponto). k = segmentos por canto.
 */
function roundBox(a, b, c, rows, k = 3) {
  const ring = [];
  for (let q = 0; q < 4; q++) {
    for (let t = 0; t <= k; t++) {
      const ang = (q + t / k) * (Math.PI / 2);
      ring.push([q === 0 || q === 3 ? 1 : -1, q < 2 ? 1 : -1, Math.cos(ang), Math.sin(ang)]);
    }
  }
  const nu = rows.length - 1;
  const nv = ring.length;
  return surface(nu, nv, (u, v, p) => {
    const [d, y, tone] = rows[Math.round(u * nu)];
    const [sx, sz, cx, cz] = ring[Math.round(v * nv) % nv];
    if (d == null) p.set(0, y, 0);
    else {
      const cc = Math.max(0, c - d);
      p.set(sx * Math.max(0, a - d - cc) + cc * cx, y, sz * Math.max(0, b - d - cc) + cc * cz);
    }
    return tone ?? 1;
  }, { wrapV: true, shade: true, orient: true });
}

/** Confeitos compridos (granulado) deitados numa superfície: at(i, r, P, N) dá o ponto e a normal. → partes já coloridas. */
function sprinkles(n, r, lowp, at, colors, len = 0.03, th = 0.008) {
  const parts = [];
  const P = new THREE.Vector3();
  const N = new THREE.Vector3();
  const T = new THREE.Vector3();
  const X = new THREE.Vector3();
  const q = new THREE.Quaternion();
  for (let i = 0; i < n; i++) {
    at(i, r, P, N);
    if (Math.abs(N.y) > 0.92) T.set(1, 0, 0);
    else T.set(-N.z, 0, N.x);
    T.addScaledVector(N, -T.dot(N)).normalize().applyAxisAngle(N, r() * TAU);
    const g = new THREE.CylinderGeometry(th * 0.6, th * 0.6, len * (0.8 + r() * 0.4), lowp ? 3 : 5, 1, true);
    frameQuat(X.crossVectors(T, N), T, q); // o comprimento (Y) deita na tangente
    g.applyQuaternion(q);
    g.translate(P.x + N.x * th * 0.35, P.y + N.y * th * 0.35, P.z + N.z * th * 0.35);
    parts.push(piece(g, pick(colors, r)));
  }
  return parts;
}

/** Pintinhas chatas (triângulos pequenos) sobre uma superfície: at(r, P, N). */
function flecks(n, r, at, size) {
  const pos = [];
  const nor = [];
  const P = new THREE.Vector3();
  const N = new THREE.Vector3();
  const T = new THREE.Vector3();
  const B = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    at(r, P, N);
    if (Math.abs(N.y) > 0.92) T.set(1, 0, 0);
    else T.set(-N.z, 0, N.x);
    T.addScaledVector(N, -T.dot(N)).normalize();
    B.crossVectors(N, T);
    const s = size * (0.45 + r() * 1.1);
    const a0 = r() * TAU;
    for (let k = 0; k < 3; k++) {
      const a = a0 + (k / 3) * TAU + (r() - 0.5) * 0.9;
      const rr = s * (0.6 + r() * 0.6);
      const c = Math.cos(a) * rr;
      const sn = Math.sin(a) * rr;
      pos.push(P.x + T.x * c + B.x * sn + N.x * 0.0012, P.y + T.y * c + B.y * sn + N.y * 0.0012, P.z + T.z * c + B.z * sn + N.z * 0.0012);
      nor.push(N.x, N.y, N.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  return g;
}

/** Tom por instância para chocolate: a cor escolhida (branco vira marfim de chocolate branco), com vizinhas. */
function chocTints(hex) {
  if (lightOf(hex) > 0.94) return ['#f3e6cc', '#f6ecd8', '#efdfc0'];
  if (lightOf(hex) > 0.55) {
    const c = shown(hex);
    return [c, mix(c, '#ffffff', 0.14), shift(c, 0.01, 1.05, -0.03)];
  }
  return [hex, mix(hex, '#000000', 0.14), mix(hex, '#9a6a44', 0.16)];
}
const chocTint = (p, i, r, color) => pick(chocTints(color), r);

/* ───────── Placas de chocolate ─────────
   Chocolate temperado espalhado fino e quebrado: lascas de contorno anguloso, fincadas em pé; a "vela" é a
   folha ondulada (chocolate que endureceu sobre papel amassado). */

const SHARD = {
  // top = altura do contorno de cima (fração de h) ao longo da largura · left / right = quanto cada lado entra
  // (fração de w), de baixo para cima
  alta: { top: [0.5, 0.66, 0.9, 1, 0.78, 0.52, 0.4], left: [0.04, 0, 0.06, 0.2], right: [-0.02, -0.06, -0.16, -0.3], bend: 0.02 },
  larga: { top: [0.62, 0.8, 0.72, 0.93, 1, 0.84, 0.58], left: [0.06, 0, 0.04, 0.12], right: [-0.03, 0, -0.08, -0.18], bend: -0.025 },
  curta: { top: [0.55, 0.85, 1, 0.8, 0.62], left: [0.05, 0, 0.1, 0.22], right: [0, -0.05, -0.12, -0.2], bend: 0.015 },
  vela: { top: [0.6, 0.82, 0.95, 1, 0.97, 0.9, 0.8, 0.68, 0.5], left: [0.1, 0.02, 0, 0.05, 0.14], right: [-0.08, -0.01, 0, -0.06, -0.16], bend: 0.03, wave: 0.055 },
};

function shardGeometry(D, o) {
  const S = SHARD[o.k];
  const lowp = D < 1;
  const wavy = Boolean(S.wave);
  const nu = lowp ? (wavy ? 6 : 4) : wavy ? 12 : S.top.length - 1;
  const nv = lowp ? (wavy ? 4 : 3) : wavy ? 8 : 5;
  const geo = sheet(nu, nv, (u, v, p) => {
    const uu = o.flip ? 1 - u : u;
    const hh = o.h * prof(S.top, uu);
    const y = -0.035 + (hh + 0.035) * v;
    const t = y / o.h;
    const xl = -o.w / 2 + o.w * prof(o.flip ? S.right.map((k) => -k) : S.left, t);
    const xr = o.w / 2 + o.w * prof(o.flip ? S.left.map((k) => -k) : S.right, t);
    let z = S.bend * Math.sin(Math.PI * u) * (0.3 + 0.7 * v);
    if (wavy) z += S.wave * Math.sin(u * 7.4 + v * 2.2 + 0.6) * (0.25 + 0.75 * v) + 0.018 * Math.sin(u * 15 - v * 5) * v;
    p.set(lerp(xl, xr, u), y, z);
  }, 0.024, (u, v, side) => (0.8 + 0.2 * smooth(0, 0.22, v)) * (side > 0 ? 1 : 0.93) * o.tone);
  geo.rotateX(-o.tilt);
  geo.rotateY(o.yaw);
  geo.translate(o.x, 0, o.z);
  return geo;
}

const shardsGeometry = (v) => (D) => mergeGeometries(KIT.placas.vars[v].parts.map((o) => shardGeometry(D, o)));

/* ───────── Esferas de chocolate ─────────
   Bola oca moldada em duas metades: lisa, com a emenda fina onde as metades se juntam. Metalizada (pó dourado
   ou rosé) quando a cor escolhida é de metal. */

function sphereGeometry(D, R, seam) {
  const lowp = D < 1;
  const nu = lowp ? 8 : 14;
  const nv = lowp ? 14 : 22;
  // a emenda cai numa fileira inteira de vértices (o equador), e a bola é girada para ela ficar de lado
  const geo = blob(nu, nv, R, (d) => (Math.abs(d.y) < 0.01 ? 0.86 : 1));
  geo.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(seam[0], 0, seam[1])));
  geo.translate(0, R - 0.004, 0);
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const k = 0.74 + 0.26 * smooth(0, R * 0.9, pos.getY(i));
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  return geo;
}

const METALS = ['#dcae52', '#e8a5a0', '#cfd3da'];
/** A cor escolhida é uma das metalizadas do cardápio (dourado, rosé, prata)? */
function isMetal(hex) {
  const c = new THREE.Color(hex);
  return METALS.some((m) => {
    const k = new THREE.Color(m);
    return Math.hypot(c.r - k.r, c.g - k.g, c.b - k.b) < 0.09;
  });
}
const sphereMat = (lib, ctx) => (isMetal(ctx.layout.opt('esferas').color) ? glitter(lib) : chocolate(lib));
const sphereTint = (p, i, r, color) => (isMetal(color) ? pick([color, mix(color, '#ffffff', 0.1), mix(color, '#6b4a1a', 0.08)], r) : chocTint(p, i, r, color));

/* ───────── Tabletes ─────────
   Pedaço de barra partida: placa de cantos arredondados com os gomos em relevo (almofada com moldura). */

const GOMO = 0.24;

function barGeometry(D, b) {
  const lowp = D < 1;
  const k = lowp ? 1 : 2;
  const T = 0.052; // a placa por baixo dos gomos
  const hh = (b.n * GOMO) / 2;
  const parts = [];
  // placa (deitada: espessura em y, comprimento em z)
  parts.push(roundBox(GOMO / 2, hh, 0.018, [[null, 0, 0.7], [0.006, 0, 0.72], [0, 0.007, 0.84], [0, T, 0.6], [null, T, 0.6]], k));
  // gomos: almofada de quinas macias com a moldura rebaixada no meio
  const a = GOMO / 2 - 0.013;
  const rows = lowp
    ? [[0, T - 0.002, 0.58], [0.014, T + 0.026, 0.96], [0.034, T + 0.034, 1], [0.048, T + 0.027, 0.84], [0.058, T + 0.027, 0.92], [null, T + 0.027, 0.92]]
    : [[0, T - 0.002, 0.55], [0.004, T + 0.014, 0.8], [0.016, T + 0.028, 0.98], [0.03, T + 0.034, 1], [0.042, T + 0.033, 0.92], [0.05, T + 0.026, 0.8], [0.06, T + 0.026, 0.92], [null, T + 0.026, 0.92]];
  for (let i = 0; i < b.n; i++) parts.push(roundBox(a, a, 0.026, rows, k).translate(0, 0, -hh + GOMO * (i + 0.5)));
  const geo = mergeGeometries(parts.map((g) => piece(g)));
  // em pé (o relevo olha para +z), fincada, e inclinada como a mão deixou
  geo.translate(0, -(T + 0.034) / 2, 0);
  geo.rotateX(Math.PI / 2);
  geo.translate(0, hh - b.sink, 0);
  geo.rotateX(-b.lean);
  geo.rotateZ(-b.roll);
  geo.rotateY(b.yaw);
  return geo;
}

/* ───────── Conchas de chocolate ─────────
   Bombons moldados (base chata, apoiada): vieira de gomos em leque, búzio de voltas em espiral e caracol
   enrolado. O marmorizado é pintado nos vértices: veios de outro chocolate misturados à cor escolhida. */

/** Veios do marmorizado: em base clara, veios de chocolate ao leite; em base escura, veios mais claros. */
function marble(geo, dark, seed) {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const k = dark ? [3.0, 4.1, 5.6] : [0.2, 0.078, 0.034];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const w = noise3(x * 6 + seed, y * 6, z * 6 + 3.3);
    const s = Math.sin(36 * x + 16 * z + 10 * y + 7 * w + seed * 1.7);
    const m = smooth(0.25, 0.8, 0.5 + 0.5 * s) * (0.55 + 0.45 * noise3(x * 2.6 + 9, y * 2.6 + seed, z * 2.6)) * (dark ? 0.8 : 1);
    col.setXYZ(i, col.getX(i) * lerp(1, k[0], m), col.getY(i) * lerp(1, k[1], m), col.getZ(i) * lerp(1, k[2], m));
  }
  return geo;
}

/** Vieira: leque de gomos que nascem da charneira, borda ondulada, e as duas "orelhinhas" retas atrás. */
function scallopGeometry(D) {
  const lowp = D < 1;
  const ribs = 8;
  const nu = lowp ? 6 : 9;
  const nv = ribs * (lowp ? 2 : 4);
  const A = 1.0;
  const L = 0.27;
  const H = 0.088;
  const fan = surface(nu, nv, (u, v, p) => {
    const ang = (v - 0.5) * 2 * A;
    const crest = 0.5 - 0.5 * Math.cos(v * ribs * TAU);
    const rim = L * (1 - 0.1 * (ang / A) ** 2) * (0.97 + 0.04 * crest);
    const rad = rim * (0.13 + 0.87 * u);
    const side = 1 - Math.pow(Math.abs(2 * v - 1), 5);
    const dome = Math.sin(Math.PI * Math.pow(u, 0.6));
    const amp = smooth(0.04, 0.45, u);
    const h = H * Math.pow(Math.max(0, dome * side), 0.42) * (1 - 0.24 * amp * (1 - crest));
    p.set(Math.sin(ang) * rad, h, Math.cos(ang) * rad - 0.135);
    return (0.64 + 0.36 * lerp(1, crest, amp)) * (0.74 + 0.26 * smooth(0, 0.035, h));
  }, { shade: true, orient: true });
  const ears = roundBox(0.074, 0.024, 0.01, [[0.004, 0, 0.7], [0, 0.005, 0.8], [0.004, 0.017, 0.9], [0.016, 0.023, 0.95], [null, 0.023, 0.95]], lowp ? 1 : 2).translate(0, 0, -0.112);
  return mergeGeometries([piece(fan), piece(ears)]);
}

/** Búzio: corpo comprido, de voltas que apertam em espiral até a ponta; metade de cima (a base é chata). */
function whelkGeometry(D) {
  const lowp = D < 1;
  const nu = lowp ? 20 : 30;
  const nv = lowp ? 6 : 10;
  const Len = 0.44;
  return surface(nu, nv, (u, v, p) => {
    const a = v * Math.PI;
    const i = Math.round(u * nu);
    // cone que engorda da ponta para a boca, fechado em arredondado na ponta larga
    const env = i === 0 || i === nu ? 0.0006 : 0.128 * Math.pow(u, 0.86) * (u > 0.84 ? Math.sqrt(Math.max(0.02, 1 - ((u - 0.84) / 0.165) ** 2)) : 1);
    // as voltas: cada uma é um gomo; o sulco entre elas sobe em espiral
    const whorl = Math.pow(Math.abs(Math.sin(Math.PI * (5 * Math.pow(u, 0.8) - a / TAU))), 0.45);
    const rad = env * (0.7 + 0.3 * whorl);
    p.set(rad * Math.cos(a), 1.12 * rad * Math.sin(a), (u - 0.5) * Len);
    return (0.52 + 0.48 * whorl) * (0.74 + 0.26 * smooth(0, 0.04, p.y));
  }, { shade: true, orient: true });
}

/** Caracol: tubo que cresce enrolado em espiral (cada volta encosta na anterior), com as linhas de crescimento. */
function coilGeometry(D) {
  const lowp = D < 1;
  const nu = lowp ? 22 : 46;
  const nv = lowp ? 4 : 7;
  const turns = 2.3;
  const k = 0.19;
  const g1 = Math.exp(k * turns * TAU);
  return surface(nu, nv, (u, v, p) => {
    const t = u * turns * TAU;
    const rho = (0.118 * Math.exp(k * t)) / g1;
    const lines = 0.5 + 0.5 * Math.cos(t * 10);
    const rt = Math.round(u * nu) === nu ? 0.0006 : 0.56 * rho * (1 - 0.5 * smooth(0.94, 1, u)) * (0.92 + 0.08 * lines);
    const a = v * Math.PI;
    const rad = rho + rt * Math.cos(a);
    p.set(rad * Math.cos(t) - 0.035, 1.3 * rt * Math.sin(a), rad * Math.sin(t) + 0.01);
    return (0.66 + 0.34 * lines) * (0.7 + 0.3 * smooth(0, 0.03, p.y));
  }, { shade: true, orient: true });
}

const SHELLS = [scallopGeometry, whelkGeometry, coilGeometry];

/* ───────── Confeitos de chocolate ───────── */

/** Gota de chocolate (chip): base redonda e chata, corpo em cone macio e o biquinho caído de lado. */
function chipGeometry(D) {
  const lowp = D < 1;
  const rows = lowp ? [[0.0005, 0.05], [0.026, 0.02], [0.04, 0]] : [[0.0005, 0.052], [0.007, 0.043], [0.024, 0.024], [0.039, 0.009], [0.036, 0]];
  const nu = rows.length - 1;
  const nv = lowp ? 6 : 7;
  return surface(nu, nv, (u, v, p) => {
    const [rad, y] = rows[Math.round(u * nu)];
    const a = v * TAU;
    p.set(rad * Math.sin(a) + 0.011 * Math.pow(y / 0.052, 3), y, rad * Math.cos(a));
    return 0.7 + 0.3 * smooth(0, 0.03, y);
  }, { wrapV: true, shade: true, orient: true });
}

/** Bolinha crocante: cereal coberto de chocolate — quase redonda, um pouco irregular. */
function crispGeometry(D) {
  const R = 0.036;
  if (D < 1) {
    const g = new THREE.IcosahedronGeometry(R, 0);
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      _d.fromBufferAttribute(pos, i).normalize();
      nor.setXYZ(i, _d.x, _d.y, _d.z);
    }
    g.translate(0, R * 0.86, 0);
    g.deleteAttribute('uv');
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) col.fill(0.74 + 0.26 * smooth(0, R * 1.2, pos.getY(i)), i * 3, i * 3 + 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }
  return blob(4, 7, (d) => R * (0.94 + 0.12 * noise3(d.x * 2.1 + 3, d.y * 2.1, d.z * 2.1 + 7)), (d) => 0.72 + 0.28 * smooth(-0.7, 0.3, d.y)).translate(0, R * 0.86, 0);
}

/** Pastilha de chocolate confeitada: lentilha de casquinha lisa (sem marca nem letra). */
function lentilGeometry(D) {
  const lowp = D < 1;
  const profile = lowp ? [[0.001, 0.056, 1], [0.062, 0.03, 0.94], [0.04, 0, 0.6]] : [[0.001, 0.058, 1], [0.046, 0.05, 1], [0.066, 0.028, 0.92], [0.046, 0.004, 0.62]];
  return lathe(profile, lowp ? 6 : 9);
}

/* ───────── Jujubas ─────────
   Bala de goma: cone baixo de topo redondo, passada no açúcar cristal (a superfície fica granulada e fosca). */

function gumdropGeometry(D, lying) {
  const lowp = D < 1;
  const H = 0.185;
  const profile = lowp
    ? [[0.001, H, 1.04], [0.05, H - 0.014, 1.03, 0.003], [0.07, H * 0.62, 1, 0.004], [0.09, 0.03, 0.9, 0.004], [0.086, 0, 0.72], [0.001, 0, 0.8]]
    : [[0.001, H, 1.04], [0.032, H - 0.005, 1.04, 0.003], [0.054, H - 0.02, 1.03, 0.004], [0.066, H - 0.05, 1.02, 0.004], [0.075, 0.09, 1, 0.004], [0.086, 0.04, 0.94, 0.004], [0.092, 0.014, 0.84, 0.004], [0.087, 0, 0.7], [0.001, 0, 0.8]];
  const geo = wrapUV(piece(lathe(profile, lowp ? 10 : 16)), 0.08, 2.6);
  if (lying) {
    geo.rotateZ(Math.PI / 2 - 0.17);
    settle(geo, 0.004, true);
  }
  return geo;
}

const JUJUBA = ['#e0334f', '#f5861f', '#f0c41d', '#3fae52', '#9a58cc', '#ec639c', '#e0334f', '#3fae52'];

/* ───────── Mini donuts ─────────
   Rosquinha assada (dourada, com a faixa clara no meio), glacê na cor escolhida escorrendo até onde quis e,
   por cima, granulado colorido ou fios de chocolate. O glacê é um lote à parte (é ele que recebe a cor). */

const DONUT = { R: 0.13, r: 0.085, sq: 0.88 };
/** Ponto do donut: th = ângulo em volta do furo · ph = ângulo em volta do tubo (0 = alto; + para fora) · rr = raio do tubo. */
function donutPoint(th, ph, rr, p) {
  const rad = DONUT.R + rr * Math.sin(ph);
  const c = Math.cos(ph);
  const y = DONUT.r * DONUT.sq * (1 + (rr / DONUT.r) * (c < 0 ? -Math.pow(-c, 0.75) : c)); // a base assenta um pouco chata
  return p.set(rad * Math.sin(th), y, rad * Math.cos(th));
}
const glazeOut = (th, sd, lowp) => 1.14 + 0.2 * Math.sin(3 * th + sd) + (lowp ? 0 : 0.12 * Math.sin(5 * th + 2.3 * sd));
const glazeIn = (th, sd) => 1.02 + 0.1 * Math.sin(4 * th + sd);

function donutDoughGeometry(D, sd, topping) {
  const lowp = D < 1;
  const nv = lowp ? 12 : 20;
  const nu = lowp ? 5 : 8;
  const dough = surface(nu, nv, (u, v, p) => {
    const ph = lerp(0.7, TAU - 0.86, u);
    donutPoint(v * TAU, ph, DONUT.r, p);
    const band = Math.exp(-(((ph - Math.PI / 2) / 0.3) ** 2)) + 0.7 * Math.exp(-(((ph - 1.5 * Math.PI) / 0.3) ** 2));
    return 0.5 + 0.5 * band - 0.3 * Math.exp(-(((ph - Math.PI) / 0.5) ** 2));
  }, { wrapV: true, shade: true, orient: true });
  ramp(dough, [[0.2, '#b06c2c'], [0.5, '#cc8c44'], [1, '#efcc92']]);
  const parts = [piece(dough)];
  const r = rng(40 + sd * 7);
  const top = (th, ph, P2, N) => {
    donutPoint(th, ph, DONUT.r + 0.0095, P2);
    N.set(Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th));
  };
  if (topping === 'fios') {
    // fios de chocolate em zigue-zague, de um lado ao outro do glacê
    const zig = lowp ? 6 : 11;
    parts.push(piece(trail(lowp ? 24 : 84, (u, P2, N) => top(u * TAU, 0.74 * Math.sin(u * TAU * zig), P2, N), 0.014, 0.0045), '#4a2613'));
  } else {
    const colors = topping === 'pastel' ? ['#ffffff', '#ffe08a', '#ffffff', '#f7a8c4', '#a5dcf5'] : ['#f25c8a', '#ffd23f', '#5cc8f2', '#8be06a', '#ffffff', '#b28cff'];
    parts.push(...sprinkles(lowp ? 9 : 22, r, lowp, (i, rr, P2, N) => top(rr() * TAU, -0.62 + rr() * 1.3, P2, N), colors, topping === 'pastel' ? 0.024 : 0.03, 0.008));
  }
  return mergeGeometries(parts);
}

function donutGlazeGeometry(D, sd) {
  const lowp = D < 1;
  const nv = lowp ? 12 : 20;
  const nu = lowp ? 4 : 6;
  return surface(nu, nv, (u, v, p) => {
    const th = v * TAU;
    const ph = lerp(-glazeIn(th, sd), glazeOut(th, sd, lowp), u);
    // a camada some nas beiradas e engrossa um pouco antes delas (o glacê escorre e para)
    const t = 0.0085 * Math.pow(Math.sin(Math.PI * u), 0.28) + 0.0045 * Math.exp(-(((u - 0.88) / 0.08) ** 2));
    donutPoint(th, ph, DONUT.r + t, p);
    return 0.84 + 0.16 * Math.pow(Math.sin(Math.PI * u), 0.5);
  }, { wrapV: true, shade: true, orient: true });
}

const DONUT_LOOK = [[0.4, 'granulado'], [2.1, 'fios'], [3.7, 'pastel']];

/* ───────── Cookies ─────────
   Cookie caseiro: disco de contorno irregular, alto no meio e caído na beira, dourado (mais tostado na borda e
   embaixo), com pedaços de chocolate meio afundados na massa. */

const COOKIE_R = 0.215;
const COOKIE_T = 0.082;

function cookieOne(D, seed) {
  const lowp = D < 1;
  const r = rng(seed);
  const k = [r() * TAU, r() * TAU, r() * TAU];
  const edge = (a) => COOKIE_R * (1 + 0.045 * Math.sin(2 * a + k[0]) + 0.03 * Math.sin(3 * a + k[1]) + 0.018 * Math.sin(5 * a + k[2]));
  // [fração do raio, fração da altura, tom: 1 = miolo claro · 0,4 = borda dourada · 0,1 = fundo]
  const rows = lowp
    ? [[0.001, 1, 1], [0.6, 0.98, 0.92], [0.93, 0.7, 0.55], [1, 0.3, 0.34], [0.86, 0, 0.14], [0.001, 0, 0.1]]
    : [[0.001, 1, 1], [0.38, 1, 1], [0.7, 0.95, 0.88], [0.9, 0.76, 0.62], [0.99, 0.45, 0.4], [0.97, 0.12, 0.28], [0.82, 0, 0.14], [0.001, 0, 0.1]];
  const nu = rows.length - 1;
  const nv = lowp ? 12 : 18;
  const top = (x, z) => COOKIE_T * (1 + 0.2 * (noise3(x * 13 + seed, 0.5, z * 13) - 0.5) + 0.1 * (noise3(x * 31, seed, z * 31) - 0.5));
  const body = surface(nu, nv, (u, v, p) => {
    const i = Math.round(u * nu);
    const [f, hy, t] = rows[i];
    const a = v * TAU;
    const rad = edge(a) * f;
    const x = rad * Math.sin(a);
    const z = rad * Math.cos(a);
    p.set(x, hy * top(x, z), z);
    return t * (0.96 + 0.08 * hash2(i * 7 + seed, Math.round(v * nv)));
  }, { wrapV: true, shade: true, orient: true });
  ramp(body, [[0.08, '#8a5524'], [0.3, '#b87a3a'], [0.62, '#d29a54'], [1.05, '#e4ba78']]);
  const parts = [piece(body)];
  // pedaços de chocolate: calombos escuros meio afundados na massa
  const n = lowp ? 4 : 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r() * 0.9;
    const f = (i % 3 === 0 ? 0.16 : 0.4 + 0.36 * r()) * COOKIE_R;
    const x = f * Math.sin(a);
    const z = f * Math.cos(a);
    const s = 0.021 + r() * 0.012;
    const g = lowp ? new THREE.OctahedronGeometry(s * 1.15, 0) : new THREE.IcosahedronGeometry(s, 0);
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    for (let q = 0; q < pos.count; q++) {
      _d.fromBufferAttribute(pos, q).normalize();
      nor.setXYZ(q, _d.x, _d.y, _d.z);
    }
    g.scale(1 + r() * 0.5, 0.66, 1);
    g.rotateY(r() * TAU);
    g.translate(x, top(x, z) * (f > 0.6 * COOKIE_R ? 0.9 : 0.985) - s * 0.12, z);
    parts.push(piece(g, pick(['#3f2010', '#4d2a15', '#34190c'], r)));
  }
  return mergeGeometries(parts);
}

const cookiesGeometry = (v) => (D) =>
  grainUV(
    mergeGeometries(
      KIT.cookies.vars[v].cookies.map((c) => {
        const g = cookieOne(D, c.seed);
        g.rotateY(c.yaw);
        g.rotateZ(-c.tilt);
        return g.translate(c.x, c.y, c.z);
      }),
    ),
    2.2,
  );

/* ───────── Pipoca caramelizada ─────────
   Cada pipoca é um miolo com dois gomos estourados, irregulares; o caramelo deixa tudo dourado e brilhante,
   mais claro onde a pipoca aparece por baixo. As pipocas vêm grudadas em punhados. */

const CARAMEL = ['#cf892c', '#d99a3c', '#c07a24', '#e0a84e'];

function kernelGeometry(lowp, seed, R) {
  const r = rng(seed);
  const parts = [];
  const base = r() * TAU;
  const n = lowp ? 1 : 3;
  for (let i = 0; i < n; i++) {
    const a = base + (i / n) * TAU + (r() - 0.5) * 0.8;
    const el = (r() - 0.3) * 1.1;
    const rad = lowp ? R * 0.98 : R * (i === 0 ? 0.78 : 0.56 + r() * 0.16);
    const dist = lowp ? 0 : R * (i === 0 ? 0.14 : 0.43);
    const off = r() * 20;
    const bump = lowp ? 0.6 : 0.42;
    const g = blob(5, 7, (d) => rad * (1 - bump / 2 + bump * noise3(d.x * 1.9 + off, d.y * 1.9 + off * 0.3, d.z * 1.9)), (d) => (0.7 + 0.3 * smooth(-0.9, 0.3, d.y)) * (1 + 0.5 * smooth(0.6, 0.9, noise3(d.x * 2.7 + off, d.y * 2.7, d.z * 2.7 + off))));
    g.scale(1, 0.82 + r() * 0.3, 1);
    g.translate(Math.cos(a) * Math.cos(el) * dist, Math.sin(el) * dist, Math.sin(a) * Math.cos(el) * dist);
    parts.push(piece(g, pick(CARAMEL, r)));
  }
  return mergeGeometries(parts);
}

const popcornGeometry = (v) => (D) => mergeGeometries(KIT.pipoca.vars[v].kernels.map(([x, y, z, R], i) => kernelGeometry(D < 1, 300 + v * 17 + i * 5, R).translate(x, y, z)));

/* ───────── Casquinha derretendo ─────────
   Bola de sorvete meio derretida, com a poça escorrida em volta, e a casquinha de wafer caída de ponta-cabeça
   em cima dela. A bola e a poça são um lote (recebem a cor escolhida); a casquinha, outro. */

/** Casquinha: cone de wafer com a grade em relevo — cada losango é um painel rebaixado entre os frisos. */
function waffleConeGeometry(D, C) {
  const lowp = D < 1;
  const N = lowp ? 8 : 12;
  const M = lowp ? 9 : 16;
  const pos = [];
  const col = [];
  const light = new THREE.Color('#e8b96f');
  const dark = new THREE.Color('#bd8240');
  const c1 = new THREE.Color();
  const c2 = new THREE.Color();
  const node = (i, j) => {
    const s = i / M;
    const a = ((j + 0.5 * (i % 2)) / N) * TAU;
    const rad = Math.max(0.003, C.rim * (1 - s) + 0.003);
    return new THREE.Vector3(rad * Math.cos(a), s * C.len, rad * Math.sin(a));
  };
  const sink = (p, k) => {
    const l = Math.hypot(p.x, p.z) || 1;
    return new THREE.Vector3(p.x - (p.x / l) * k, p.y, p.z - (p.z / l) * k);
  };
  const tri = (A, B, Cc, ca, cb, cc) => {
    pos.push(A.x, A.y, A.z, B.x, B.y, B.z, Cc.x, Cc.y, Cc.z);
    col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
  };
  for (let i = 0; i <= M - 2; i++) {
    for (let j = 0; j < N; j++) {
      const o = [node(i, j), node(i + 1, j + (i % 2)), node(i + 2, j), node(i + 1, j - 1 + (i % 2))]; // S, L, N, O
      const s = (i + 1) / M;
      const depth = 0.014 * (1 - 0.72 * s);
      const mid = o[0].clone().add(o[2]).multiplyScalar(0.5);
      const toast = 1 - 0.14 * s;
      c1.copy(light).multiplyScalar(toast * (0.95 + 0.1 * hash2(i, j + 3)));
      c2.copy(dark).multiplyScalar(toast * (0.86 + 0.24 * hash2(i + 5, j)));
      if (lowp) {
        const c = sink(mid, depth);
        for (let k = 0; k < 4; k++) tri(o[k], c, o[(k + 1) % 4], c1, c2, c1);
      } else {
        const inn = o.map((q) => sink(q.clone().lerp(mid, 0.3), depth));
        for (let k = 0; k < 4; k++) {
          const k1 = (k + 1) % 4;
          tri(o[k1], o[k], inn[k], c1, c1, c2);
          tri(o[k1], inn[k], inn[k1], c1, c2, c2);
        }
        tri(inn[0], inn[3], inn[2], c2, c2, c2);
        tri(inn[0], inn[2], inn[1], c2, c2, c2);
      }
    }
  }
  // a boca: meio losango entre os frisos da primeira fileira
  for (let j = 0; j < N; j++) tri(node(0, j), node(1, j), node(0, j + 1), c1.copy(light), light, light);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  geo.computeVertexNormals();
  return geo;
}

/** Leva o que foi feito no eixo da casquinha (boca em y = 0, ponta em +y) para a pose dela sobre a bola. */
function onCone(geo, C) {
  const d = Math.sqrt(C.ball * C.ball - C.rim * C.rim);
  geo.rotateZ(-C.tilt);
  geo.rotateY(C.az);
  return geo.translate(Math.sin(C.tilt) * Math.cos(C.az) * d, C.cy + Math.cos(C.tilt) * d, -Math.sin(C.tilt) * Math.sin(C.az) * d);
}

function scoopGeometry(D) {
  const C = KIT.casquinha.vars[0].cone;
  const lowp = D < 1;
  // a bola: rugosa como a colher deixa, com a "saia" irregular embaixo
  const ball = blob(lowp ? 9 : 18, lowp ? 14 : 28, (d) => {
    const n = noise3(d.x * 3.3 + 2, d.y * 3.3, d.z * 3.3 + 5);
    const fine = noise3(d.x * 8 + 7, d.y * 8, d.z * 8 + 1);
    const skirt = Math.exp(-(((d.y + 0.6) / 0.16) ** 2));
    return C.ball * (1 + 0.07 * (n - 0.5) + 0.03 * (fine - 0.5) + skirt * (0.03 + 0.12 * noise3(d.x * 4.5 + 9, 1.3, d.z * 4.5)));
  }, (d) => 0.8 + 0.2 * smooth(-0.8, 0, d.y)).translate(0, C.cy, 0);
  // o sorvete que a boca da casquinha espremeu para fora: um friso fino e irregular
  const collar = onCone(tube(lowp ? 12 : 28, lowp ? 4 : 6, (u, P) => P.set((C.rim + 0.004) * Math.cos(u * TAU), 0.004, (C.rim + 0.004) * Math.sin(u * TAU)), (u) => 0.008 + 0.02 * noise3(Math.cos(u * TAU) * 2.6 + 4, Math.sin(u * TAU) * 2.6, 7), 0.95, Y), C);
  // a poça: de beirada redonda e contorno escorrido
  const rows = lowp ? [[0, 0.1, 0.8], [0.25, 0.042, 0.92], [0.8, 0.032, 1], [0.95, 0.021, 0.96], [1, 0, 0.78]] : [[0, 0.1, 0.8], [0.12, 0.06, 0.84], [0.3, 0.041, 0.95], [0.6, 0.034, 1], [0.84, 0.031, 1], [0.94, 0.023, 0.97], [0.985, 0.011, 0.9], [1, 0, 0.78]];
  const nu = rows.length - 1;
  const puddle = surface(nu, lowp ? 20 : 44, (u, v, p) => {
    const [f, y, tone] = rows[Math.round(u * nu)];
    const a = v * TAU;
    const rad = lerp(0.15, puddleEdge(a), f);
    p.set(rad * Math.sin(a), y, rad * Math.cos(a));
    return tone;
  }, { wrapV: true, shade: true, orient: true });
  const parts = [piece(ball), piece(collar), piece(puddle)];
  // pingos que escaparam da poça
  C.drops.forEach(([a, d, rad]) => {
    parts.push(piece(blob(lowp ? 3 : 5, lowp ? 6 : 10, rad, (dd) => 0.82 + 0.18 * smooth(-0.2, 0.6, dd.y)).scale(1.15, 0.42, 0.9).rotateY(a).translate(d * Math.sin(a), 0.001, d * Math.cos(a))));
  });
  return grainUV(mergeGeometries(parts), 2.4);
}

const coneGeometry = (D) => grainUV(onCone(waffleConeGeometry(D, KIT.casquinha.vars[0].cone), KIT.casquinha.vars[0].cone), 3);

/* ───────── Paçoquinhas ─────────
   Paçoca tipo rolha: cilindro de amendoim prensado, fosco, de quinas que esfarelam. */

function pacocaGeometry(D, lying, broken) {
  const lowp = D < 1;
  const R = 0.13;
  const H = 0.29;
  const seed = lying ? 5 : broken ? 9 : 2;
  // [fração do raio, fração da altura, tom, rugosidade]
  const rows = lowp
    ? [[0.001, 1, 0.97, 0], [0.9, 1, 0.97, 0.004], [1, 0.95, 0.9, 0.005], [1, 0.05, 0.9, 0.005], [0.93, 0, 0.72, 0.003], [0.001, 0, 0.9, 0]]
    : [[0.001, 1, 0.98, 0], [0.55, 1, 0.99, 0.003], [0.9, 0.996, 0.96, 0.005], [0.985, 0.962, 0.9, 0.007], [1, 0.72, 1, 0.004], [1, 0.36, 0.98, 0.004], [0.99, 0.05, 0.9, 0.007], [0.93, 0, 0.74, 0.004], [0.001, 0, 0.9, 0]];
  const nu = rows.length - 1;
  const nv = lowp ? 10 : 18;
  const body = surface(nu, nv, (u, v, p) => {
    const i = Math.round(u * nu);
    const j = Math.round(v * nv) % nv;
    const [f, hy, tone, rough] = rows[i];
    const a = v * TAU;
    let y = H * hy;
    let rad = R * f + (hash2(i + seed, j) - 0.5) * rough * 2;
    let t = tone * (0.97 + 0.06 * hash2(j + seed * 3, i));
    if (broken && hy > 0.6) {
      // um canto do alto esfarelou: a quina desce e o farelo fica mais claro
      const da = Math.abs(((a - 0.9 + TAU + Math.PI) % TAU) - Math.PI);
      const c = smooth(1.05, 0.2, da) * smooth(0.3, 0.95, f);
      y -= c * 0.075 * ((hy - 0.6) / 0.4) * (0.7 + 0.6 * hash2(j, i + 4));
      rad -= c * 0.012 * hash2(j + 2, i);
      t *= 1 + 0.12 * c;
    }
    p.set(rad * Math.sin(a), y, rad * Math.cos(a));
    return t;
  }, { wrapV: true, shade: true, orient: true });
  const main = wrapUV(piece(body, '#c2955a'), R, 2.2);
  if (lying) {
    main.translate(0, -H / 2, 0);
    main.rotateZ(Math.PI / 2);
    main.translate(0, R - 0.004, 0);
  }
  const parts = [main];
  // farelos ao pé
  const r = rng(70 + seed);
  for (let i = 0; i < (lowp ? 2 : 5); i++) {
    const a = r() * TAU;
    const s = 0.008 + r() * 0.009;
    const g = new THREE.OctahedronGeometry(s, 0).scale(1, 0.6, 1).rotateY(r() * 3);
    if (lying) g.translate((r() - 0.5) * 0.24, s * 0.4, (r() < 0.5 ? -1 : 1) * (0.085 + r() * 0.045));
    else g.translate(Math.sin(a) * (0.132 + r() * 0.02), s * 0.4, Math.cos(a) * (0.132 + r() * 0.02));
    parts.push(grainUV(piece(g, '#cfa56c'), 2.2));
  }
  return mergeGeometries(parts);
}

/* ───────── Cake pops ─────────
   Bolinha de bolo banhada: lisa e brilhante, com o colarinho de cobertura onde o palito entra; por cima,
   fios em zigue-zague, granulado colorido ou fio em espiral (lote à parte: a cor deles não é a do banho). */

const POP_R = 0.185;

function cakePopGeometry(D) {
  const lowp = D < 1;
  const ball = blob(lowp ? 8 : 12, lowp ? 12 : 18, POP_R, (d) => 0.8 + 0.2 * smooth(-0.9, 0.2, d.y)).translate(0, POP_R, 0);
  const foot = lathe(lowp ? [[0.018, -0.015, 0.76], [0.064, 0.014, 0.86]] : [[0.016, -0.016, 0.74], [0.034, -0.011, 0.8], [0.052, 0.002, 0.84], [0.066, 0.016, 0.86]], lowp ? 6 : 14);
  return mergeGeometries([piece(ball), piece(foot)]);
}

function cakePopDecoGeometry(D, kind) {
  const lowp = D < 1;
  const R = POP_R;
  if (kind === 'granulado') {
    const r = rng(91);
    return mergeGeometries(
      sprinkles(lowp ? 12 : 30, r, lowp, (i, rr, P, N) => {
        const y = 0.12 + rr() * 0.86;
        const t = rr() * TAU;
        const q = Math.sqrt(1 - y * y);
        N.set(q * Math.cos(t), y, q * Math.sin(t));
        P.set(0, R, 0).addScaledVector(N, R);
      }, ['#f25c8a', '#ffd23f', '#5cc8f2', '#8be06a', '#ffffff', '#b28cff'], 0.034, 0.009),
    );
  }
  if (kind === 'espiral') {
    return piece(trail(lowp ? 24 : 64, (u, P, N) => {
      const pol = 0.12 + 1.25 * u;
      const az = u * TAU * 3.1;
      N.set(Math.sin(pol) * Math.cos(az), Math.cos(pol), Math.sin(pol) * Math.sin(az));
      P.set(0, R, 0).addScaledVector(N, R * 1.006);
    }, 0.018, 0.007));
  }
  // zigue-zague de um lado ao outro, por cima da bolinha
  return piece(trail(lowp ? 24 : 64, (u, P, N) => {
    const x = (u * 2 - 1) * 0.82 * R;
    const z = 0.9 * Math.sqrt(Math.max(0, R * R * 0.86 - x * x)) * Math.sin(u * TAU * (lowp ? 4 : 5.5));
    N.set(x, Math.sqrt(Math.max(0.0001, R * R - x * x - z * z)), z).normalize();
    P.set(0, R, 0).addScaledVector(N, R * 1.006);
  }, 0.018, 0.007));
}

const POP_DECO = ['fios', 'granulado', 'espiral'];
const popTint = (p, i, r, color) => pick(tintsOf(color), r);
const popDecoTint = (kind) => (p, i, r, color) => {
  if (kind === 'granulado') return null;
  const l = lightOf(color);
  if (kind === 'espiral') return l < 0.4 ? '#f6efe4' : '#5a3019';
  return l > 0.9 ? '#e9839f' : '#fbf6ee';
};

/* ───────── Bengalinhas doces ─────────
   Bala dura torcida: haste e gancho, listras vermelhas em espiral sobre o branco (pintadas numa textura
   pequena, que se repete ao longo da bengala). Vêm em pares cruzados. */

function caneCanvas() {
  const S = 128;
  const c = makeCanvas(S);
  const g = c.getContext('2d');
  g.fillStyle = '#fbf6ef';
  g.fillRect(0, 0, S, S);
  // faixas em diagonal: dão uma volta inteira na bengala a cada repetição
  const band = (x0, w) => {
    for (let k = -1; k <= 1; k++) {
      g.beginPath();
      g.moveTo(x0 + k * S, 0);
      g.lineTo(x0 + w + k * S, 0);
      g.lineTo(x0 + w + (k + 1) * S, S);
      g.lineTo(x0 + (k + 1) * S, S);
      g.closePath();
      g.fill();
    }
  };
  g.fillStyle = '#c81f2d';
  band(0, S * 0.3);
  band(S * 0.5, S * 0.07);
  band(S * 0.68, S * 0.07);
  return c;
}

const caneMat = (lib) =>
  lib.custom('dc-cane', () => {
    const map = texture(caneCanvas(), { srgb: true });
    const mat = lib.physical({ color: 0xffffff, map, roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.15 });
    mat.addEventListener('dispose', () => map.dispose());
    return mat;
  });

function caneGeometry(D, c) {
  const lowp = D < 1;
  const NP = 64;
  const pts = canePath(c, NP).map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const at = (u, P) => {
    const x = Math.max(0, Math.min(1, u)) * NP;
    const i = Math.min(NP - 1, Math.floor(x));
    return P.copy(pts[i]).lerp(pts[i + 1], x - i);
  };
  const total = CANE.straight + CANE.hook * 3.4;
  const k = CANE.straight / total;
  // fileiras: pontas arredondadas, poucas na haste e bastantes no gancho
  const rows = [[0, 0.03], [0.006, 0.62], [0.018, 0.93]];
  const ns = lowp ? 2 : 4;
  const nh = lowp ? 6 : 13;
  for (let i = 1; i <= ns; i++) rows.push([0.018 + (k - 0.018) * (i / ns), 1]);
  for (let i = 1; i < nh; i++) rows.push([k + (0.982 - k) * (i / nh), 1]);
  rows.push([0.982, 0.93], [0.994, 0.62], [1, 0.03]);
  const nu = rows.length - 1;
  const nv = lowp ? 6 : 9;
  const P = new THREE.Vector3();
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const T = new THREE.Vector3();
  const S = new THREE.Vector3();
  const N = new THREE.Vector3();
  const geo = surface(nu, nv, (uu, v, p) => {
    const [u, m] = rows[Math.round(uu * nu)];
    at(u, P);
    at(u + 0.012, A);
    at(u - 0.012, B);
    T.subVectors(A, B).normalize();
    S.crossVectors(T, Y).normalize();
    N.crossVectors(S, T);
    const a = v * TAU;
    p.copy(P).addScaledVector(S, CANE.r * m * Math.cos(a)).addScaledVector(N, CANE.r * m * Math.sin(a));
  });
  // costura: a primeira e a última coluna são o mesmo lugar — a mesma normal (e a textura fecha a volta)
  const nor = geo.attributes.normal;
  const uv = new Float32Array((nu + 1) * (nv + 1) * 2);
  for (let i = 0; i <= nu; i++) {
    const a = i * (nv + 1);
    const b = a + nv;
    _d.set(nor.getX(a) + nor.getX(b), nor.getY(a) + nor.getY(b), nor.getZ(a) + nor.getZ(b)).normalize();
    nor.setXYZ(a, _d.x, _d.y, _d.z);
    nor.setXYZ(b, _d.x, _d.y, _d.z);
    for (let j = 0; j <= nv; j++) {
      uv[(a + j) * 2] = (rows[i][0] * total) / 0.17 + (c.flip ? 0.4 : 0);
      uv[(a + j) * 2 + 1] = j / nv;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

const canesGeometry = (v) => (D) => mergeGeometries(KIT.bengalinhas.vars[v].canes.map((c) => caneGeometry(D, c)));

/* ───────── Canudos de wafer ─────────
   Canudinho recheado: tubo de wafer com as listras de chocolate em espiral (a malha gira junto: cada listra é
   uma coluna inteira de faces) e a boca aberta, com o recheio lá dentro. Fincados em feixe, abrindo em leque. */

function rollGeometry(D, q, seed) {
  const lowp = D < 1;
  const R = 0.047;
  const nv = lowp ? 6 : 8;
  const n = lowp ? 5 : 12;
  const L = q.len + 0.09; // 9 mm entram na cobertura
  const rows = [];
  for (let i = 0; i <= n; i++) rows.push([i / n, 1]);
  rows.push([1, 0.64], [0.966, 0.6], [0.966, 0.001]); // a boca: a parede dobra para dentro e o recheio fecha o fundo
  const nu = rows.length - 1;
  const geo = surface(nu, nv, (u, v, p) => {
    const [t, k] = rows[Math.round(u * nu)];
    const a = v * TAU + t * 5.6 + seed;
    p.set(R * k * Math.sin(a), -0.09 + L * t, R * k * Math.cos(a));
    return 0.82 + 0.18 * smooth(0.08, 0.3, t);
  }, { wrapV: true, shade: true, orient: true });
  const wafer = new THREE.Color('#e8c58c');
  const stripe = new THREE.Color('#5c3319');
  const lip = new THREE.Color('#cfa468');
  const inside = new THREE.Color('#70492a');
  const cream = new THREE.Color('#4a2814');
  const c = new THREE.Color();
  const g = faceColors(geo, nv, (i, j) => {
    if (i === n) return lip;
    if (i === n + 1) return inside;
    if (i === n + 2) return cream;
    if (j % (nv / 2) === 0) return stripe;
    return c.copy(wafer).multiplyScalar(0.93 + 0.12 * hash2(i + seed, j));
  });
  const up = Math.sqrt(Math.max(0.01, q.len * q.len - q.ax * q.ax - q.az * q.az));
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, _d.set(q.ax, up, q.az).normalize()));
  return g.translate(q.x, 0, q.z);
}

const rollsGeometry = (v) => (D) => mergeGeometries(KIT.canudos.vars[v].rolls.map((q, i) => rollGeometry(D, q, v * 2.1 + i * 1.3)));

/* ───────── Ovinhos confeitados ─────────
   Mini ovo de chocolate de casquinha fosca, em tom pastel, salpicado de pintinhas escuras. Deitado, como ovo fica. */

function eggGeometry(D, seed, tilt, roll) {
  const lowp = D < 1;
  const a = 0.15;
  const b = 0.105;
  const rad = (d) => {
    const bb = b * (1 - 0.15 * d.x);
    return 1 / Math.sqrt((d.x / a) ** 2 + (d.y / bb) ** 2 + (d.z / bb) ** 2);
  };
  const body = blob(lowp ? 8 : 12, lowp ? 12 : 18, rad, (d) => 0.78 + 0.22 * smooth(-0.95, 0.05, d.y));
  const r = rng(seed);
  const dots = flecks(lowp ? 14 : 44, r, (rr, P, N) => {
    const y = -0.3 + rr() * 1.3;
    const t = rr() * TAU;
    const q = Math.sqrt(Math.max(0, 1 - y * y));
    _d.set(q * Math.cos(t), y, q * Math.sin(t));
    const bb = b * (1 - 0.15 * _d.x);
    P.copy(_d).multiplyScalar(rad(_d));
    N.set(_d.x / (a * a), _d.y / (bb * bb), _d.z / (bb * bb)).normalize();
  }, 0.0056);
  const geo = mergeGeometries([piece(body), piece(dots, '#7d5c42')]);
  geo.rotateX(roll);
  geo.rotateZ(tilt);
  return settle(geo, 0.004);
}

const EGGS = ['#a6d6ee', '#f4aac4', '#f6e188', '#b3e0ad', '#cbb4ec', '#f3e6cf'];
const EGG_POSE = [[21, 0, 0.3], [34, 0.26, 2.2], [55, -0.08, 4.1]];

/* ───────── Construtores ───────── */

export const BUILDERS = {
  placas: (ctx, part) => drawKit(ctx, part, 'placas', KIT.placas.vars.map((_, v) => ({ key: `dc-shards${v}`, make: shardsGeometry(v), mat: chocolate, tint: chocTint }))),
  esferas: (ctx, part) =>
    drawKit(ctx, part, 'esferas', KIT.esferas.vars.map((V, v) => ({ key: `dc-sphere${v}`, make: (D) => sphereGeometry(D, V.r, [[1.1, 0.3], [0.5, -0.9], [-0.8, 0.5]][v]), mat: sphereMat, tint: sphereTint }))),
  barras: (ctx, part) => drawKit(ctx, part, 'barras', KIT.barras.vars.map((V, v) => ({ key: `dc-bar${v}`, make: (D) => barGeometry(D, V.bar), mat: chocolate, tint: chocTint }))),
  conchaschoc: (ctx, part) => {
    const dark = lightOf(ctx.layout.opt('conchaschoc').color) <= 0.55;
    return drawKit(ctx, part, 'conchaschoc', SHELLS.map((make, v) => ({ key: `dc-shell${v}${dark ? 'd' : 'l'}`, make: (D) => marble(make(D), dark, 3 + v * 5), mat: chocolate, tint: chocTint })));
  },
  gotas: (ctx, part) => drawCoat(ctx, part, 'gotas', { key: 'dc-chip', make: chipGeometry, mat: chocolate, tints: () => ['#3b1e0f', '#5e3219', '#6b3d21', '#2e160a', '#4a2613'] }),
  crocantes: (ctx, part) => drawCoat(ctx, part, 'crocantes', { key: 'dc-crisp', make: crispGeometry, mat: chocolate, tints: () => ['#6b3d21', '#f1e3c8', '#3b1e0f', '#7a4526', '#f4e9d2', '#5e3219'] }),

  jujubas: (ctx, part) => drawKit(ctx, part, 'jujubas', [false, true].map((lying) => ({ key: `dc-gumdrop${lying ? 1 : 0}`, make: (D) => gumdropGeometry(D, lying), mat: sugared, tint: (p, i, r) => pick(JUJUBA, r) }))),
  donuts: (ctx, part) =>
    drawKit(ctx, part, 'donuts', DONUT_LOOK.map(([sd, topping], v) => ({
      parts: [
        { key: `dc-donut${v}`, make: (D) => donutDoughGeometry(D, sd, topping), mat: matte },
        { key: `dc-donutGlaze${v}`, make: (D) => donutGlazeGeometry(D, sd), mat: candy, tint: (p, i, r, color) => tintsOf(color)[i % 3], cast: false },
      ],
    }))),
  cookies: (ctx, part) => drawKit(ctx, part, 'cookies', KIT.cookies.vars.map((_, v) => ({ key: `dc-cookies${v}`, make: cookiesGeometry(v), mat: crumb }))),
  pipoca: (ctx, part) => drawKit(ctx, part, 'pipoca', KIT.pipoca.vars.map((_, v) => ({ key: `dc-popcorn${v}`, make: popcornGeometry(v), mat: candy, tint: (p, i, r) => pick(['#ffffff', '#fff1dc', '#f2dcc0'], r) }))),
  casquinha: (ctx, part) =>
    drawKit(ctx, part, 'casquinha', [
      {
        parts: [
          { key: 'dc-scoop', make: scoopGeometry, mat: icecream, tint: (p, i, r, color) => (lightOf(color) > 0.94 ? '#f6eedd' : shown(color)), cast: true },
          { key: 'dc-waffleCone', make: coneGeometry, mat: crumb, cast: true },
        ],
      },
    ]),
  pacoca: (ctx, part) =>
    drawKit(ctx, part, 'pacoca', [[false, false], [true, false], [false, true]].map(([lying, broken], v) => ({ key: `dc-pacoca${v}`, make: (D) => pacocaGeometry(D, lying, broken), mat: crumb, tint: (p, i, r) => pick(['#ffffff', '#f6ead9', '#fff6e6'], r) }))),
  cakepops: (ctx, part) =>
    drawKit(ctx, part, 'cakepops', POP_DECO.map((kind) => ({
      parts: [
        { key: 'dc-cakepop', make: cakePopGeometry, mat: candy, tint: popTint },
        { key: `dc-cakepop-${kind}`, make: (D) => cakePopDecoGeometry(D, kind), mat: candy, tint: popDecoTint(kind), cast: false },
      ],
    }))),
  pastilhas: (ctx, part) => drawCoat(ctx, part, 'pastilhas', { key: 'dc-lentil', make: lentilGeometry, mat: candy, tints: () => ['#e23b3b', '#f08a24', '#f5cf2e', '#3fae5a', '#3b82d6', '#6b3d21'] }),
  bengalinhas: (ctx, part) => drawKit(ctx, part, 'bengalinhas', KIT.bengalinhas.vars.map((_, v) => ({ key: `dc-canes${v}`, make: canesGeometry(v), mat: caneMat }))),
  canudos: (ctx, part) => drawKit(ctx, part, 'canudos', KIT.canudos.vars.map((_, v) => ({ key: `dc-rolls${v}`, make: rollsGeometry(v), mat: matte }))),
  ovinhos: (ctx, part) => drawKit(ctx, part, 'ovinhos', EGG_POSE.map(([seed, tilt, roll], v) => ({ key: `dc-egg${v}`, make: (D) => eggGeometry(D, seed, tilt, roll), mat: sugar, tint: (p, i, r) => pick(EGGS, r) }))),
};

/** As malhas de cada peça — uma lista por variante, com as partes dela (para medir os triângulos em D = 1 e 0,5). */
export const MALHAS = {
  placas: KIT.placas.vars.map((_, v) => [shardsGeometry(v)]),
  esferas: KIT.esferas.vars.map((V) => [(D) => sphereGeometry(D, V.r, [0, 0])]),
  barras: KIT.barras.vars.map((V) => [(D) => barGeometry(D, V.bar)]),
  conchaschoc: SHELLS.map((make) => [make]),
  gotas: [[chipGeometry]],
  crocantes: [[crispGeometry]],
  jujubas: [false, true].map((lying) => [(D) => gumdropGeometry(D, lying)]),
  donuts: DONUT_LOOK.map(([sd, topping]) => [(D) => donutDoughGeometry(D, sd, topping), (D) => donutGlazeGeometry(D, sd)]),
  cookies: KIT.cookies.vars.map((_, v) => [cookiesGeometry(v)]),
  pipoca: KIT.pipoca.vars.map((_, v) => [popcornGeometry(v)]),
  casquinha: [[scoopGeometry, coneGeometry]],
  pacoca: [[false, false], [true, false], [false, true]].map(([lying, broken]) => [(D) => pacocaGeometry(D, lying, broken)]),
  cakepops: POP_DECO.map((kind) => [cakePopGeometry, (D) => cakePopDecoGeometry(D, kind)]),
  pastilhas: [[lentilGeometry]],
  bengalinhas: KIT.bengalinhas.vars.map((_, v) => [canesGeometry(v)]),
  canudos: KIT.canudos.vars.map((_, v) => [rollsGeometry(v)]),
  ovinhos: EGG_POSE.map(([seed, tilt, roll]) => [(D) => eggGeometry(D, seed, tilt, roll)]),
};
