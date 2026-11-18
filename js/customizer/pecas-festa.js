// BOLAB — peças do grupo "festa" (brilho, papel e acrílico; módulo carregado sob demanda; ver kit.js).
import { THREE, drawKit, scatter, quantityOf, hashString, surface, smooth, shown, mix, shift, lightOf, saturOf, tintsOf, harmonyOf, glitter, paper, sugar, addVol, frameQuat, Batch, tube, piece, paint, cutout, mergeGeometries, rng, KIT, fondant as fondantMat } from './pecas-base.js';
import { sweep, cleanOffset, offsetPath, pathAt } from './geometry.js';
import { bowGeometry } from './decor2.js';
import { CROWN, RAINBOW, FLAGS, flagLine, SKY, crescentOf, MIRRORS, PUFFS } from './kit-festa.js';
import { coatShare } from './kit.js';

const TAU = Math.PI * 2;
const Y = new THREE.Vector3(0, 1, 0);
const _x = new THREE.Vector3();
const _q = new THREE.Quaternion();

/* ───────── Fita de cetim ─────────
   Uma faixa em volta de cada andar (a altura e o afastamento vêm do plano) e um lacinho na frente. */

function buildRibbon(ctx, part) {
  const { m, lib, layout } = ctx;
  part.volumes = [];
  const pl = layout.plan?.fita;
  if (!pl || !pl.pieces.length) return;
  const color = shown(layout.opt('fita').color);
  const stack = m.stack || [m];
  // cetim: brilho macio que corre ao longo da fita (a mesma cor em cada bolo; some com a peça)
  const satin = lib.physical({ color, roughness: 0.36, sheen: 1, sheenRoughness: 0.3, sheenColor: mix(color, '#ffffff', 0.55), side: THREE.DoubleSide, ...(ctx.clip || {}) });
  part.owned.push(satin);
  pl.pieces.forEach((p) => {
    if (p.t !== 'band') return;
    const t = stack[p.tier];
    const path = cleanOffset(t.frost, p.out);
    const h = p.y1 - p.y0;
    // a fita abaúla um tico no meio e tem as beiras viradas para dentro
    const profile = [
      { d: -0.002, y: p.y0, nd: 0.6, ny: -0.8 },
      { d: 0.0015, y: p.y0 + h * 0.06, nd: 1, ny: -0.2 },
      { d: 0.003, y: p.y0 + h * 0.5, nd: 1, ny: 0 },
      { d: 0.0015, y: p.y0 + h * 0.94, nd: 1, ny: 0.2 },
      { d: -0.002, y: p.y1, nd: 0.6, ny: 0.8 },
    ];
    const geo = sweep(path, profile);
    part.owned.push(geo);
    const mesh = new THREE.Mesh(geo, satin);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    part.addObject(mesh, m, 2);
    if (ctx.clip) part.objects[part.objects.length - 1].clipped = true; // é fatiada junto com o bolo
    if (p.bow) {
      // lacinho chato, de frente, no meio da fita
      const bows = new Batch(lib.shape('pk-ribbonBow', () => bowGeometry(lib.detail, false)), lib.custom(`pk-satinBow${color}`, () => lib.physical({ color, roughness: 0.4, sheen: 1, sheenRoughness: 0.3, sheenColor: mix(color, '#ffffff', 0.5), vertexColors: true })));
      _x.set(p.bow.nz, 0, -p.bow.nx);
      frameQuat(_x, Y, _q);
      bows.add(p.bow.x, p.bow.y, p.bow.z, _q, [0.52 * p.bow.s, 0.5 * p.bow.s, 0.42 * p.bow.s], null, 0.14 * p.bow.s);
      part.add(bows, m);
    }
    addVol(part, p.vol);
  });
}

/* ───────── Ajudantes de malha ───────── */

/** Multiplica a cor de vértice por fn(x, y, z): sombra "assada" (vincos, pé das peças, fundo das pregas). */
function tone(geo, fn) {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const k = fn(pos.getX(i), pos.getY(i), pos.getZ(i));
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  return geo;
}

/** Malha de triângulos soltos (papel dobrado, lâminas): cada face com a sua normal. tones = um tom por vértice. */
function facets(pos, tones) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const col = new Float32Array(pos.length);
  for (let i = 0; i < tones.length; i++) col.fill(tones[i], i * 3, i * 3 + 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

/** UV plana (x, y) × k: é ela que faz aparecer o granulado do material glitter num recorte de papel. */
function uvFlat(geo, k) {
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) * k;
    uv[i * 2 + 1] = pos.getY(i) * k;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** UV em volta do eixo Y (coroa), triângulo a triângulo: a emenda da volta não estica o granulado. */
function uvAround(geo, R, k) {
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 3) {
    const a0 = Math.atan2(pos.getX(i), pos.getZ(i));
    for (let j = 0; j < 3; j++) {
      let a = Math.atan2(pos.getX(i + j), pos.getZ(i + j));
      if (a - a0 > Math.PI) a -= TAU;
      else if (a0 - a > Math.PI) a += TAU;
      uv[(i + j) * 2] = a * R * k;
      uv[(i + j) * 2 + 1] = pos.getY(i + j) * k;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** Bolinha branca pronta para fundir (w × h segmentos), já no lugar. */
const bead = (x, y, z, r, w, h, k = 1) => piece(paint(new THREE.SphereGeometry(r, w, h).translate(x, y, z), k, k, k));

/**
 * Gomos de pasta encostados (nuvem): lobes = [[x, y, z, raio]]. flat > 0 = gomos achatados, apoiados (a meia
 * altura é y + flat: o pé fica `flat` abaixo do apoio). Os vincos entre gomos e o pé saem mais escuros.
 */
function puffs(lobes, D, { flat = 0, k = 0.97, hex = '#fcfaf6', segs = D < 1 ? [8, 5] : [12, 8] } = {}) {
  const half = (q) => (flat ? q[1] + flat : q[3] * k);
  return mergeGeometries(
    lobes.map((L, i) => {
      const [x, y, z, r] = L;
      const g = paint(new THREE.SphereGeometry(1, segs[0], segs[1], 0, TAU, 0, flat ? Math.PI * 0.86 : Math.PI).scale(r * k, half(L), r * k).translate(x, y, z), 1, 1, 1);
      tone(g, (px, py, pz) => {
        let t = 9;
        lobes.forEach((Q, j) => {
          if (j !== i) t = Math.min(t, Math.hypot((px - Q[0]) / (Q[3] * k), (py - Q[1]) / half(Q), (pz - Q[2]) / (Q[3] * k)));
        });
        return (0.72 + 0.28 * smooth(0.96, 1.45, t)) * (0.84 + 0.16 * smooth(-0.01, 0.07, py));
      });
      return piece(g, hex);
    }),
  );
}

/* ───────── Brilho: confeitos de cobertura ───────── */

/**
 * Pitada de glitter: um punhado de lâminas minúsculas (meio milímetro), bem abertas e cada uma inclinada para um
 * lado — as pitadas se sobrepõem e o conjunto vira um pó cintilante, sem desenho que se repita.
 */
function glitterGeometry(D, side = false) {
  const r = rng(side ? 419 : 733);
  const n = side ? (D < 1 ? 3 : 4) : D < 1 ? 7 : 12;
  const pos = [];
  const tones = [];
  const N = new THREE.Vector3();
  const U = new THREE.Vector3();
  const V = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = r() * TAU;
    const d = (side ? 0.028 : 0.038) * Math.sqrt(r());
    const cx = Math.cos(a) * d;
    const cz = Math.sin(a) * d;
    const cy = 0.001 + r() * 0.0012;
    const tilt = 0.05 + r() * 0.5;
    const ta = r() * TAU;
    N.set(Math.sin(tilt) * Math.cos(ta), Math.cos(tilt), Math.sin(tilt) * Math.sin(ta));
    U.set(Math.cos(ta + 1.3), 0, Math.sin(ta + 1.3)).cross(N).normalize();
    V.crossVectors(N, U);
    const s = 0.0026 + r() * 0.0024;
    const k = 0.8 + r() * 0.8; // umas lâminas pegam mais luz que as outras
    const spin = r() * TAU;
    for (let j = 0; j < 3; j++) {
      const u = Math.cos(spin + (j * TAU) / 3) * s;
      const v = Math.sin(spin + (j * TAU) / 3) * s;
      pos.push(cx + U.x * u + V.x * v, cy + U.y * u + V.y * v, cz + U.z * u + V.z * v);
      tones.push(k);
    }
  }
  return facets(pos, tones);
}
// lâmina metalizada: reflete o ambiente como um espelhinho (o brilho muda de uma lâmina para a outra)
const flakeMat = (lib) => lib.custom('pf-flake', () => new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.86, roughness: 0.24, vertexColors: true, side: THREE.DoubleSide }));
const glitterTints = (color) => {
  const c = color || '#dcae52';
  return [c, c, mix(c, '#ffffff', 0.3), mix(c, '#ffffff', 0.62), shift(c, 0.01, 1.1, -0.06)];
};

const _n3 = new THREE.Vector3();
const _t3 = new THREE.Vector3();

/**
 * Confeito na lateral de cada andar (o do topo fica com `scatter`, de decor.js). Como lá, só cai na faixa livre da
 * lateral e longe das peças; a mais, desvia do colar de bico da cintura e fica abaixo do que o bico da borda
 * avança sobre a lateral. exp = expoente da altura (1 = por igual) · top = até que fração da altura sobe.
 * → função que devolve os volumes (um por confeito).
 */
function sideCoat(ctx, part, { geometry, material, tints, perSide, exp, top, seed, id, rad }) {
  const { m, layout } = ctx;
  const batch = new Batch(geometry, material, { cast: false, receive: true });
  const volumes = () => batch.items.map((it) => ({ x: it.x, y: it.y + 0.01, z: it.z, r: rad * it.s[0], kind: 'coating' }));
  if (!perSide || layout.has('wafer')) return volumes; // atrás da cerca de chocolate a lateral não aparece
  const r = rng(hashString(`${seed}lado${m.shape}${m.R}${m.n}`));
  const density = (ctx.tier?.density || 1) * quantityOf(ctx, id) * coatShare(ctx.config, m, ctx.tier?.density);
  const pipeR = layout.piping?.spec?.r || 0.09;
  const pt = {};
  (m.stack || [m]).forEach((t, ti) => {
    if (t.naked) return;
    const band = layout.sides?.[ti];
    const path = offsetPath(t.frost, 0.002);
    const sideH = t.Ht - t.rf - 0.04;
    const n = Math.round(path.length * perSide * density);
    for (let i = 0; i < n; i++) {
      pathAt(path, r() * path.length, pt);
      const y = t.y0 + 0.03 + Math.pow(r(), exp) * sideH * top;
      _n3.set(pt.nx, 0, pt.nz);
      _t3.set(pt.tx, 0, pt.tz).applyAxisAngle(_n3, r() * TAU);
      frameQuat(_t3, _n3, _q);
      const sc = 0.85 + r() * 0.35;
      const tint = tints[Math.floor(r() * tints.length)];
      const R = rad * sc;
      // faixa livre: acima do bico da base; no alto, uma folga para o bico da borda (que avança sobre a lateral)
      if (band && (y - R < band.lo || y + 2.5 * R + 0.02 > band.hi)) continue;
      // colar de bico na cintura: o confeito não entra nos vãos entre as peças do colar
      if (band?.waist && Math.abs(y + 0.01 - band.waist.y) < pipeR * (band.waist.size || 1) * 1.5 + 0.015 + R) continue;
      if (layout.occ && layout.occ.hit(pt.x, y + 0.01, pt.z, R, 0.004, -1, true)) continue;
      batch.add(pt.x, y, pt.z, _q, sc, tint, 0.03);
    }
  });
  part.add(batch, m);
  return volumes;
}

/**
 * Confeito de cobertura em um ou mais lotes (cada lote = uma malha): lots = [{ key, make, mat, tints, top, side,
 * rad, flat }], onde top e side são a parte da densidade do kit (perArea, perSide) que cabe ao lote.
 */
function coats(ctx, part, id, lots) {
  const { lib, layout } = ctx;
  const C = KIT[id].coat;
  const gets = [];
  lots.forEach((k, i) => {
    const look = { geometry: lib.shape(k.key, () => k.make(lib.detail)), material: k.mat(lib), tints: k.tints(layout.opt(id).color), id, rad: k.rad ?? C.rad };
    if (k.top !== 0) {
      scatter(ctx, part, { ...look, perArea: C.perArea * (k.top ?? 1), perSide: 0, flat: k.flat ?? C.flat !== false, sideBand: 1, seed: `${id}${i}` });
      gets.push(Object.getOwnPropertyDescriptor(part, 'volumes').get);
    }
    if (k.side !== 0) gets.push(sideCoat(ctx, part, { ...look, perSide: (C.perSide ?? 0) * (k.side ?? 1), exp: C.sideBand ?? 1.6, top: C.sideTop ?? 0.6, seed: `${id}${i}` }));
  });
  // os volumes de todos os lotes juntos (cada um declara só os seus)
  Object.defineProperty(part, 'volumes', { configurable: true, get: () => gets.flatMap((g) => g()) });
}

/** Confeito metálico redondo (dragê), apoiado e um tico afundado no creme. */
function drageeGeometry(r, D) {
  return paint(new THREE.SphereGeometry(r, D < 1 ? 6 : 8, D < 1 ? 3 : 5).translate(0, r * 0.86, 0), 1, 1, 1);
}
/** Bastãozinho metálico de 6 mm, deitado. */
function rodGeometry(D) {
  const g = D < 1 ? new THREE.CylinderGeometry(0.0085, 0.0085, 0.062, 5, 1) : new THREE.CapsuleGeometry(0.0085, 0.046, 1, 6);
  return paint(g.rotateZ(Math.PI / 2).translate(0, 0.0082, 0), 1, 1, 1);
}
const METAL_TINTS = ['#e9bb5a', '#e2e4e8', '#f0c96e', '#d2d5db', '#e3b24e', '#eceef1'];
// confeito metalizado: brilho de metal polido, mas menos espelho que a bola espelhada
const drageeMat = (lib) => lib.custom('pf-dragee', () => new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.2, envMapIntensity: 2.3, vertexColors: true }));

/** Bolinhas grandes, bolinhas pequenas e bastõezinhos: três lotes, cada um com a sua parte da densidade. */
const METALLICS = [
  { key: 'pf-dragee', make: (D) => drageeGeometry(0.021, D), top: 0.34, side: 0.34, rad: 0.024, flat: false },
  { key: 'pf-drageeS', make: (D) => drageeGeometry(0.0135, D), top: 0.38, side: 0.38, rad: 0.016, flat: false },
  { key: 'pf-rod', make: rodGeometry, top: 0.28, side: 0.28, rad: 0.034, flat: true },
].map((k) => ({ ...k, mat: drageeMat, tints: () => METAL_TINTS }));

/** Estrelinha de açúcar: cinco pontas, chata, com o miolo um tico mais alto (7 mm de ponta a ponta). */
function starletGeometry(D) {
  const lowp = D < 1;
  const h = lowp ? 0.002 : 0.0062;
  const top = 0.0098;
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * TAU;
    const d = i % 2 ? 0.0158 : 0.035;
    return [Math.sin(a) * d, Math.cos(a) * d];
  });
  const pos = [];
  const tones = [];
  for (let i = 0; i < 10; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % 10];
    pos.push(0, top, 0, x1, h, z1, x0, h, z0);
    tones.push(1, i % 2 ? 0.94 : 0.84, i % 2 ? 0.84 : 0.94);
    if (!lowp) {
      pos.push(x0, h, z0, x1, h, z1, x1, 0, z1, x0, h, z0, x1, 0, z1, x0, 0, z0);
      tones.push(0.84, 0.84, 0.66, 0.84, 0.66, 0.66);
    }
  }
  return facets(pos, tones);
}
// açúcar perolado: metalizado macio, sem espelhar
const starletMat = (lib) => lib.custom('pf-starlet', () => new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.5, roughness: 0.36, vertexColors: true, side: THREE.DoubleSide }));

/** Miçanga: uma bolinha de açúcar de 2 mm, um tico afundada no creme (no celular, um octaedro). */
function nonpareilGeometry(D) {
  const r = 0.0105;
  const g = D < 1 ? new THREE.OctahedronGeometry(r, 0) : new THREE.SphereGeometry(r, 6, 2, 0, TAU, 0, Math.PI * 0.72);
  return paint(g.translate(0, r * 0.64, 0), 1, 1, 1);
}

/* ───────── Bolas espelhadas ───────── */

/** Uma bola grande ou um cachinho de bolas encostadas: as bolas da variante v (MIRRORS, no kit). */
function mirrorGeometry(D, v) {
  const balls = MIRRORS[v];
  const total = balls.reduce((s, b) => s + b[3], 0);
  const budget = D < 1 ? 300 : 860;
  return mergeGeometries(
    balls.map(([x, y, z, r]) => {
      const w = Math.max(8, Math.floor(Math.sqrt((budget * r) / total / 1.2)));
      const g = paint(new THREE.SphereGeometry(r * 0.992, w, Math.max(5, Math.round(w * 0.62))), 1, 1, 1);
      // reflexo "assado" (o mapa de ambiente não tem o bolo nem a mesa): a metade de baixo espelha a cobertura
      // clara, logo abaixo do meio passa a faixa escura do horizonte e o pé, onde a bola encosta, escurece
      tone(g, (px, py) => {
        const t = py / r;
        return (1.06 + 0.26 * smooth(-0.2, -0.75, t)) * (1 - 0.4 * Math.exp(-(((t + 0.16) / 0.27) ** 2))) * (0.6 + 0.4 * smooth(-1, -0.86, t));
      });
      return piece(g.translate(x, y, z));
    }),
  );
}
// espelho: reflete o ambiente bem mais forte que o metal comum (senão o prateado sai quase preto no palco)
// (um material por cor escolhida: além do reflexo, a bola tem um fundo da própria cor — é o que a faz parecer
// dourada, prateada ou rosé mesmo onde o ambiente refletido é escuro)
const mirrorMat = (color) => (lib) =>
  lib.custom(`pf-mirror${color}`, () => new THREE.MeshStandardMaterial({ color: mix(color, '#ffffff', 0.35), metalness: 1, roughness: 0.09, envMapIntensity: 5, emissive: color, emissiveIntensity: 0.1, vertexColors: true }));
// de bola para bola o tom muda um nada
const mirrorTint = (p, i) => ['#ffffff', '#f4f4f4', '#fbfbfb', '#ededed'][(i * 7 + (p.v || 0) * 3) % 4];

/* ───────── Coroa ───────── */

/**
 * Coroa de pasta de goma: tira recortada em oito pontas (altas e baixas alternadas) fechada em aro, um pouco
 * aberta para cima; friso de dois cordões com pérolas na base, uma bolinha em cada ponta e uma no corpo, abaixo
 * de cada ponta. A pasta tem espessura: de cima se vê o lado de dentro do aro.
 */
function crownGeometry(D) {
  const lowp = D < 1;
  const C = CROWN;
  const cols = C.N * (lowp ? 4 : 8);
  const T = 0.011; // meia espessura da pasta
  const tipAt = (k) => (((k % C.N) + C.N) % 2 ? C.short : C.tall);
  const topAt = (a) => {
    const t = (a / TAU) * C.N;
    const k = Math.round(t);
    const f = Math.min(1, Math.abs(t - k) * 2); // 0 na ponta · 1 no vão
    return C.valley + (tipAt(k) - C.valley) * Math.pow(1 - f, 0.95);
  };
  const radAt = (y) => C.R * (1 + C.flare * Math.pow(Math.max(0, y) / C.tall, 1.5));
  // perfil: parede de fora (de baixo para cima), a borda e a parede de dentro (de cima para baixo)
  const prof = lowp
    ? [[1, 0], [1, 0.45], [1, 1], [-1, 1], [-1, 0]]
    : [[1, 0], [1, 0.22], [1, 0.5], [1, 0.78], [1, 1], [-1, 1], [-1, 0.5], [-1, 0]];
  const wall = surface(prof.length - 1, cols, (u, v, p) => {
    const [side, t] = prof[Math.round(u * (prof.length - 1))];
    const a = v * TAU;
    const y = topAt(a) * t;
    const rad = radAt(y) + side * T;
    p.set(Math.sin(a) * rad, y, Math.cos(a) * rad);
    return side > 0 ? 0.84 + 0.16 * t : 0.5 + 0.3 * t;
  }, { wrapV: true, shade: true });
  const parts = [piece(wall)];
  // friso da base: dois cordões e uma fileira de pérolas entre eles
  const band = 0.092;
  [0.013, band].forEach((y) => {
    const rad = radAt(y) + T + 0.005;
    parts.push(piece(tube(lowp ? 24 : 48, lowp ? 4 : 5, (u, P) => P.set(Math.sin(u * TAU) * rad, y, Math.cos(u * TAU) * rad), 0.0115, 0.93, Y)));
  });
  const nb = lowp ? 20 : 28;
  for (let i = 0; i < nb; i++) {
    const a = ((i + 0.5) / nb) * TAU;
    const rad = radAt(0.052) + T + 0.006;
    parts.push(bead(Math.sin(a) * rad, 0.0525, Math.cos(a) * rad, 0.0135, lowp ? 5 : 7, lowp ? 3 : 5, 0.97));
  }
  for (let k = 0; k < C.N; k++) {
    const a = (k / C.N) * TAU;
    const big = k % 2 === 0;
    // bolinha na ponta
    const rt = big ? 0.03 : 0.024;
    const yt = tipAt(k) + rt * 0.7;
    const radT = radAt(tipAt(k));
    parts.push(bead(Math.sin(a) * radT, yt, Math.cos(a) * radT, rt, lowp ? 7 : 10, lowp ? 5 : 7));
    // e uma no corpo, abaixo de cada ponta
    const rg = big ? 0.021 : 0.016;
    const yg = band + (big ? 0.085 : 0.06);
    const radG = radAt(yg) + T + rg * 0.25;
    parts.push(bead(Math.sin(a) * radG, yg, Math.cos(a) * radG, rg, lowp ? 6 : 8, lowp ? 4 : 6, 0.95));
  }
  return uvAround(mergeGeometries(parts), C.R, 3.4);
}

const crownTint = (p, i, r, color) => shift(shown(color || '#dcae52'), 0, 1, 0.04);

/* ───────── Arco-íris ───────── */

const RAINBOW_TONES = ['#ef8f9c', '#f7b885', '#f8de88', '#9dd7b0', '#90bdee', '#c3a8e8'];

/**
 * Arco-íris de pasta de açúcar: cordões levemente achatados, colados um no outro (fica um sulco entre eles),
 * em pé; uma nuvem de bolinhas de pasta abraça cada pé.
 */
function rainbowGeometry(D) {
  const lowp = D < 1;
  const A = RAINBOW;
  const parts = [];
  for (let i = 0; i < A.n; i++) {
    const R = A.R - A.W * (i + 0.5);
    const g = surface(lowp ? 14 : 26, lowp ? 6 : 10, (u, v, p) => {
      const th = -0.035 + (Math.PI + 0.07) * u; // de um pé ao outro (os pés entram um tico na cobertura)
      const ph = v * TAU;
      const cr = Math.cos(ph);
      const sr = Math.sin(ph);
      const rr = R + A.W * 0.5 * Math.sign(cr) * Math.pow(Math.abs(cr), 0.72) + 0.0025 * Math.sin(th * 9 + i * 2.1);
      p.set(-rr * Math.cos(th), rr * Math.sin(th), A.half * Math.sign(sr) * Math.pow(Math.abs(sr), 0.72));
      // o sulco entre dois cordões fica mais escuro; a frente e o verso, na cor cheia
      return 0.76 + 0.24 * Math.pow(Math.abs(sr), 0.6);
    }, { wrapV: true, shade: true, orient: true });
    parts.push(piece(g, RAINBOW_TONES[i]));
  }
  const lobes = [];
  [-1, 1].forEach((sx) => A.clouds.forEach(([x, y, z, r]) => lobes.push([sx * x, y, z, r])));
  parts.push(puffs(lobes, D, { segs: lowp ? [9, 6] : [12, 8] }));
  return mergeGeometries(parts);
}

/* ───────── Nuvens de pasta ───────── */

/** Nuvem fofinha deitada: os gomos da variante v (PUFFS, no kit); o alto da nuvem aponta para +z. */
const cloudGeometry = (D, v) => puffs(PUFFS[v], D, { flat: 0.012, k: 0.95 });

/* ───────── Bandeirolas ───────── */

const TWINE = '#d6c19a';

/** Cores das bandeirinhas a partir da cor escolhida. */
function flagColors(color, kind) {
  const c0 = color || '#d96b82';
  const h = harmonyOf(c0);
  if (kind !== 'junina') return [h[0], h[4], h[2], h[1], h[3]];
  // festa junina: bem colorida — a cor escolhida e mais cinco em volta do círculo de cores
  if (saturOf(c0) < 0.12) return [shown(c0), '#e2483d', '#f4c531', '#3da35d', '#3b82d6', '#f08a2c'];
  const c = shift(c0, 0, 1.35, 0.55 - lightOf(c0)); // viva: bem saturada, nem clara nem escura
  return [c, shift(c, 0.13, 1, 0.03), shift(c, 0.36, 0.95, -0.04), shift(c, 0.56, 0.95, 0), shift(c, -0.2, 1, 0), shift(c, -0.09, 1, 0.04)];
}

/**
 * Varal: dois palitos, o barbante amarrado no alto deles fazendo barriga e as bandeirinhas de papel dobradas
 * sobre o fio (cada uma pende perpendicular ao barbante, um pouco para a frente ou para trás).
 * kind 'junina' = retangulares com corte em V; senão, triangulares.
 */
function buntingGeometry(D, kind, colors) {
  const lowp = D < 1;
  const F = FLAGS;
  const junina = kind === 'junina';
  const parts = [];
  [-1, 1].forEach((sx) => {
    parts.push(piece(paint(new THREE.CylinderGeometry(0.013, 0.013, F.top + 0.06, lowp ? 6 : 8, 1).translate(sx * F.span, (F.top - 0.06) / 2, 0), 1, 1, 1), '#f3ead8'));
    // o nó do barbante no palito e a pontinha que sobra
    parts.push(piece(paint(new THREE.SphereGeometry(0.021, lowp ? 6 : 8, lowp ? 4 : 6).scale(1, 0.72, 1).translate(sx * F.span, F.tie, 0.003), 1, 1, 1), TWINE));
    parts.push(piece(tube(3, 4, (u, P) => P.set(sx * (F.span + 0.014 + 0.035 * u * u), F.tie - 0.012 - 0.095 * u, 0.012), 0.0045), TWINE));
  });
  parts.push(piece(tube(lowp ? 12 : 24, lowp ? 4 : 5, (u, P) => {
    const x = -F.span + 2 * F.span * u;
    P.set(x, flagLine(x)[0], F.z);
  }, 0.0052), TWINE));
  const n = junina ? 6 : 5;
  const w = junina ? 0.168 : 0.212;
  const hgt = junina ? 0.25 : 0.285;
  const pitch = junina ? 0.184 : 0.228;
  const r = rng(junina ? 61 : 29);
  for (let k = 0; k < n; k++) {
    const x0 = (k - (n - 1) / 2) * pitch;
    const [y0, tx, ty] = flagLine(x0);
    const sway = (r() - 0.5) * 0.34;
    const curl = (r() - 0.5) * 0.05;
    const lean = (r() - 0.5) * 0.05;
    const g = surface(lowp ? 2 : 4, lowp ? 2 : 4, (u, v, p) => {
      const a = v * 2 - 1; // −1…1 na largura
      const b = u * (junina ? 1 - 0.3 * (1 - Math.abs(a)) : 1); // 0 no fio · 1 na ponta (corte em V na junina)
      const along = a * (w / 2) * (junina ? 1 : 1 - b) + lean * b * hgt;
      const down = b * hgt * Math.cos(sway) - 0.006;
      p.set(x0 + tx * along + ty * down, y0 + ty * along - tx * down, F.z + 0.0062 + Math.sin(sway) * b * hgt + curl * a * a * b);
      return (0.88 + 0.12 * smooth(0, 0.14, b)) * (1 - 0.06 * b);
    }, { shade: true });
    parts.push(piece(g, mix(colors[k % colors.length], k % 2 ? '#ffffff' : '#000000', 0.03 + r() * 0.04)));
  }
  return mergeGeometries(parts);
}

function buildBunting(ctx, part) {
  const { lib, layout } = ctx;
  part.volumes = [];
  if (!layout.plan?.bandeirolas?.pieces.length) return;
  const o = layout.opt('bandeirolas');
  const kind = o.kind === 'junina' ? 'junina' : 'triangulo';
  // as cores vão pintadas nos vértices: a malha é só desta peça (vai embora com ela)
  const geo = buntingGeometry(lib.detail, kind, flagColors(o.color, kind));
  part.owned.push(geo);
  drawKit(ctx, part, 'bandeirolas', [{ geo: () => geo, mat: paper }]);
}

/* ───────── Leques (rosetas de papel plissado) ───────── */

const pleatDepth = (R) => 0.018 + 0.02 * R;

/** Roseta: tira de papel sanfonada e fechada em círculo; as pregas afinam para o miolo. Centro na origem. */
function rosetteGeometry(D, R, N) {
  const cols = 2 * (D < 1 ? Math.round(N * 0.7) : N);
  const amp = pleatDepth(R);
  const z0 = 0.014 + amp; // a prega de trás encosta no palito
  const r0 = 0.06 * R;
  const P = (j, out) => {
    const a = (j / cols) * TAU;
    const up = j % 2 === 0 ? 1 : -1;
    const rr = out ? R * (up > 0 ? 1 : 0.95) : r0;
    return [Math.sin(a) * rr, Math.cos(a) * rr, z0 + up * amp * (out ? 1 : 0.22)];
  };
  const K = (j, out) => (j % 2 === 0 ? 1 : 0.62) * (out ? 1 : 0.78);
  const pos = [];
  const tones = [];
  for (let j = 0; j < cols; j++) {
    pos.push(...P(j, false), ...P(j + 1, true), ...P(j, true), ...P(j, false), ...P(j + 1, false), ...P(j + 1, true));
    tones.push(K(j, false), K(j + 1, true), K(j, true), K(j, false), K(j + 1, false), K(j + 1, true));
  }
  return facets(pos, tones);
}

/** Miolo da roseta: rodela de papel colada por cima das pregas e um botãozinho dourado. */
function rosetteHubGeometry(D, R) {
  const lowp = D < 1;
  const z = 0.014 + 2 * pleatDepth(R) + 0.002;
  const disc = new THREE.CircleGeometry(0.29 * R, lowp ? 12 : 20).translate(0, 0, z);
  const brad = new THREE.SphereGeometry(0.03 + 0.03 * R, lowp ? 6 : 12, lowp ? 2 : 4, 0, TAU, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.55).translate(0, 0, z);
  return mergeGeometries([piece(paint(disc, 1, 1, 1), '#fffaf0'), piece(paint(brad, 1, 1, 1), '#d8b259')]);
}

// [raio, pregas] de cada variante do kit (a 4ª e a 5ª repetem as malhas dos tamanhos menores)
const ROSETTES = [
  [0.35, 18],
  [0.3, 16],
  [0.25, 14],
  [0.25, 14],
  [0.3, 16],
];
const harmonyTint = (shiftBy = 0) => (p, i, r, color) => {
  const h = harmonyOf(color || '#d96b82');
  return h[(i + shiftBy) % h.length];
};

/* ───────── Cata-ventos ───────── */

// papel de uma face só: cada lado do papel dupla face é uma malha (a frente de uma cor, o verso de outra)
const paperFace = (lib) => lib.custom('pf-paper1', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, vertexColors: true }));

/**
 * Cata-vento: quadrado de papel cortado nas diagonais; de cada quarto, uma ponta fica (é o bico do cata-vento) e
 * a outra é trazida até o miolo, fazendo a volta. side = 1: a face da frente do papel · −1: o verso (é o que se vê
 * na volta). turn = giro do conjunto. Centro na origem, de frente para +z.
 */
function pinwheelGeometry(D, side, turn) {
  const lowp = D < 1;
  const d = 0.3; // do miolo ao bico
  const z0 = 0.014;
  const parts = [];
  for (let k = 0; k < 4; k++) {
    const rot = turn + (k * Math.PI) / 2;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const g = surface(lowp ? 5 : 9, lowp ? 2 : 3, (u, v, p) => {
      // u: ao longo da volta do papel (0 = junto do bico, chapado · 1 = a ponta presa no miolo)
      const sn = Math.sin(Math.PI * u);
      const out = 0.44 * d * Math.pow(sn, 0.85);
      const up = 0.5 * d * sn * (0.1 + 0.9 * u * u) + 0.014 * u;
      const x = v * d * (1 - u);
      p.set(x * c - out * s, x * s + out * c, z0 + up + k * 0.0015);
      if (side > 0) return u < 0.5 ? 1 - 0.3 * smooth(0.62, 0.15, x / d) * smooth(0.02, 0.3, u) : 0.66;
      return u > 0.45 ? 0.9 + 0.1 * smooth(0.5, 0.85, u) : 0.84;
    }, { shade: true, flip: side > 0 });
    parts.push(piece(g));
  }
  return mergeGeometries(parts);
}

/** Tachinha dourada no miolo do cata-vento. */
function pinGeometry(D) {
  return new THREE.SphereGeometry(0.026, D < 1 ? 6 : 10, D < 1 ? 2 : 4, 0, TAU, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.6).translate(0, 0, 0.014 + 0.018);
}

/* ───────── Pompons (bolas de papel colmeia) ───────── */

/**
 * Bola de papel colmeia: folhas de seda coladas em pontos alternados; aberta, a superfície é uma rede de
 * losangos — as paredes na casca da bola, o fundo de cada casa afundado e mais escuro. O polo de baixo é a origem.
 */
function honeycombGeometry(D, R) {
  const lowp = D < 1;
  const cols = lowp ? 20 : 40;
  const rows = lowp ? 8 : 10;
  const at = (i, j) => {
    const th = (i / rows) * Math.PI;
    const a = (j / cols) * TAU;
    const wall = (i + j) % 2 === 0;
    const rr = R * (1 - (wall ? 0 : 0.105 * Math.sin(th)));
    return [rr * Math.sin(th) * Math.sin(a), R - rr * Math.cos(th), rr * Math.sin(th) * Math.cos(a), wall ? 1 : 0.46];
  };
  const pos = [];
  const tones = [];
  const tri = (a, b, c) => {
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    tones.push(a[3], b[3], c[3]);
  };
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const A = at(i, j);
      const B = at(i + 1, j);
      const C = at(i, j + 1);
      const E = at(i + 1, j + 1);
      // a diagonal de cada quadrado liga os dois vértices de parede: as paredes viram arestas vivas
      if ((i + j) % 2 === 0) {
        if (i < rows - 1) tri(A, B, E);
        if (i > 0) tri(A, E, C);
      } else {
        if (i > 0) tri(A, B, C);
        if (i < rows - 1) tri(B, E, C);
      }
    }
  }
  return facets(pos, tones);
}

const POMPONS = [0.28, 0.21, 0.245];

/* ───────── Lua e nuvens ───────── */

const starPoints = (x, y, r, rot = 0, fat = 0.47) =>
  Array.from({ length: 10 }, (_, i) => {
    const a = rot + (i / 10) * TAU;
    const d = i % 2 ? r * fat : r;
    return [x + Math.sin(a) * d, y + Math.cos(a) * d];
  });

/** Contorno da lua crescente: o arco de fora, de uma ponta à outra, e o arco do recorte de volta. */
function moonPoints(n) {
  const M = SKY.moon;
  const C = crescentOf(M);
  const [ix, iy, ir] = M.cut;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const b = C.a0 + (i / n) * (C.a1 - C.a0);
    pts.push([M.x + Math.cos(b) * M.R, M.y + Math.sin(b) * M.R]);
  }
  const b1 = Math.atan2(C.down[1] - iy, C.down[0] - ix);
  let b0 = Math.atan2(C.up[1] - iy, C.up[0] - ix);
  while (b0 > b1) b0 -= TAU;
  const m = Math.round(n * 0.7);
  for (let i = 1; i < m; i++) {
    const b = b1 + (i / m) * (b0 - b1);
    pts.push([ix + Math.cos(b) * ir, iy + Math.sin(b) * ir]);
  }
  return pts;
}

/** Contorno da nuvem de papel: a união dos círculos de SKY.puffs com uma base reta de cantos redondos. */
function cloudPoints(k, n) {
  const cx = 0.01;
  const cy = -0.075;
  const x0 = -0.158;
  const x1 = 0.172;
  const y0 = -0.135;
  const y1 = -0.04;
  const circles = [...SKY.puffs, [x0, (y0 + y1) / 2, (y1 - y0) / 2], [x1, (y0 + y1) / 2, (y1 - y0) / 2]];
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    // até onde o raio que sai do meio da base continua dentro de alguma das formas
    let t = Math.min(dx > 0 ? (x1 - cx) / dx : dx < 0 ? (x0 - cx) / dx : 9, dy > 0 ? (y1 - cy) / dy : dy < 0 ? (y0 - cy) / dy : 9);
    circles.forEach(([px, py, pr]) => {
      const ox = px - cx;
      const oy = py - cy;
      const b = ox * dx + oy * dy;
      const q = b * b - (ox * ox + oy * oy - pr * pr);
      if (q > 0) t = Math.max(t, b + Math.sqrt(q));
    });
    pts.push([(cx + dx * t) * k, (cy + dy * t) * k]);
  }
  return pts;
}

/** A parte de papel glitter: a lua, as estrelas no palito e a estrela pendurada na ponta da lua. */
function skyGoldGeometry(D) {
  const lowp = D < 1;
  const S = SKY;
  const parts = [cutout(moonPoints(lowp ? 22 : 44), 0.014)];
  S.stars.forEach(([x, y, r, rot]) => parts.push(cutout(starPoints(x, y, r, rot), 0.012)));
  const [dx, dy, dr] = S.drop;
  const up = crescentOf(S.moon).up;
  parts.push(cutout(starPoints(dx, dy, dr, 0.14), 0.012).translate(0, 0, 0.003));
  parts.push(tube(2, 3, (u, P) => P.set(up[0] + (dx - up[0]) * u, up[1] - 0.006 + (dy + dr * 0.9 - up[1]) * u, 0.002), 0.0032));
  return uvFlat(mergeGeometries(parts.map((g) => piece(g))), 1.3);
}

/** A parte de papel perolado: as duas nuvens e os palitos de tudo. */
function skyPaperGeometry(D) {
  const lowp = D < 1;
  const S = SKY;
  const parts = [];
  const stick = (x, top, z) => parts.push(piece(paint(new THREE.CylinderGeometry(0.012, 0.012, top + 0.06, lowp ? 6 : 8, 1).translate(x, (top - 0.06) / 2, z), 1, 1, 1), '#efe5d2'));
  stick(S.moon.stick, S.moon.top, -0.019);
  S.clouds.forEach(([x, y, z, k]) => {
    parts.push(piece(cutout(cloudPoints(k, lowp ? 36 : 64), 0.012).translate(x, y, z), '#fdfbf7'));
    stick(x, y - 0.02 * k, z - 0.019);
  });
  S.stars.forEach(([x, y, r]) => stick(x, y - r * 0.15, -0.019));
  return mergeGeometries(parts);
}
// papel perolado: fosco com um brilho leve
const pearlPaper = (lib) => lib.custom('pf-pearl', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.06, vertexColors: true, side: THREE.DoubleSide }));

/* ───────── Registro ───────── */

export const BUILDERS = {
  fita: buildRibbon,
  // brilho
  // no topo, pitadas cheias; na lateral, pitadas pequenas e ralas (o pó sobe da base até o alto, rareando)
  glitter: (ctx, part) =>
    coats(ctx, part, 'glitter', [
      { key: 'pf-glitter', make: (D) => glitterGeometry(D), mat: flakeMat, tints: glitterTints, side: 0 },
      { key: 'pf-glitterSide', make: (D) => glitterGeometry(D, true), mat: flakeMat, tints: glitterTints, top: 0, rad: 0.03 },
    ]),
  metalicos: (ctx, part) => coats(ctx, part, 'metalicos', METALLICS),
  estrelinhas: (ctx, part) => coats(ctx, part, 'estrelinhas', [{ key: 'pf-starlet', make: starletGeometry, mat: starletMat, tints: (color) => tintsOf(color || '#dcae52') }]),
  micangas: (ctx, part) => coats(ctx, part, 'micangas', [{ key: 'pf-nonpareil', make: nonpareilGeometry, mat: sugar, tints: (color) => tintsOf(color || '#ffffff') }]),
  espelhadas: (ctx, part) => {
    const mat = mirrorMat(ctx.layout.opt('espelhadas').color || '#dcae52');
    return drawKit(ctx, part, 'espelhadas', MIRRORS.map((_, v) => ({ key: `pf-mirror${v}`, make: (D) => mirrorGeometry(D, v), mat, tint: mirrorTint, sink: 0.004 })));
  },
  // papel e festa
  bandeirolas: buildBunting,
  leques: (ctx, part) =>
    drawKit(ctx, part, 'leques', ROSETTES.map(([R, N]) => ({
      parts: [
        { key: `pf-rosette${R}`, make: (D) => rosetteGeometry(D, R, N), mat: paper, tint: harmonyTint() },
        { key: `pf-rosetteHub${R}`, make: (D) => rosetteHubGeometry(D, R), mat: paper },
      ],
    }))),
  catavento: (ctx, part) =>
    drawKit(ctx, part, 'catavento', [0.35, 1.05].map((turn, v) => ({
      parts: [
        { key: `pf-pinFront${v}`, make: (D) => pinwheelGeometry(D, 1, turn), mat: paperFace, tint: harmonyTint() },
        { key: `pf-pinBack${v}`, make: (D) => pinwheelGeometry(D, -1, turn), mat: paperFace, tint: harmonyTint(1) },
        { key: 'pf-pin', make: pinGeometry, mat: (lib) => lib.mat.gold() },
      ],
    }))),
  pompons: (ctx, part) => drawKit(ctx, part, 'pompons', POMPONS.map((R, v) => ({ key: `pf-honey${v}`, make: (D) => honeycombGeometry(D, R), mat: paper, tint: harmonyTint() }))),
  luanuvens: (ctx, part) =>
    drawKit(ctx, part, 'luanuvens', [
      {
        parts: [
          { key: 'pf-skyGold', make: skyGoldGeometry, mat: glitter, tint: (p, i, r, color) => shown(color || '#dcae52') },
          { key: 'pf-skyPaper', make: skyPaperGeometry, mat: pearlPaper },
        ],
      },
    ]),
  arcoiris: (ctx, part) => drawKit(ctx, part, 'arcoiris', [{ key: 'pf-rainbow', make: rainbowGeometry, mat: fondantMat }]),
  coroa: (ctx, part) => drawKit(ctx, part, 'coroa', [{ key: 'pf-crown', make: crownGeometry, mat: glitter, tint: crownTint }]),
  nuvens: (ctx, part) => drawKit(ctx, part, 'nuvens', PUFFS.map((_, v) => ({ key: `pf-cloud${v}`, make: (D) => cloudGeometry(D, v), mat: fondantMat, sink: 0 }))),
};

/**
 * Para o teste de cobertura (tools): id → uma função por variante do kit, (D) => [geometrias de todas as partes],
 * nas coordenadas da peça (as mesmas das esferas `sph`).
 */
export const SHAPES = {
  espelhadas: MIRRORS.map((_, v) => (D) => [mirrorGeometry(D, v)]),
  bandeirolas: [(D) => [buntingGeometry(D, 'triangulo', flagColors('#d96b82', 'triangulo')), buntingGeometry(D, 'junina', flagColors('#d96b82', 'junina'))]],
  leques: ROSETTES.map(([R, N]) => (D) => [rosetteGeometry(D, R, N), rosetteHubGeometry(D, R)]),
  catavento: [0.35, 1.05].map((turn) => (D) => [pinwheelGeometry(D, 1, turn), pinwheelGeometry(D, -1, turn), pinGeometry(D)]),
  pompons: POMPONS.map((R) => (D) => [honeycombGeometry(D, R)]),
  luanuvens: [(D) => [skyGoldGeometry(D), skyPaperGeometry(D)]],
  arcoiris: [(D) => [rainbowGeometry(D)]],
  coroa: [(D) => [crownGeometry(D)]],
  nuvens: PUFFS.map((_, v) => (D) => [cloudGeometry(D, v)]),
  // confeitos de cobertura: uma peça de cada lote
  glitter: [(D) => [glitterGeometry(D)], (D) => [glitterGeometry(D, true)]],
  metalicos: [(D) => [drageeGeometry(0.021, D)], (D) => [drageeGeometry(0.0135, D)], (D) => [rodGeometry(D)]],
  estrelinhas: [(D) => [starletGeometry(D)]],
  micangas: [(D) => [nonpareilGeometry(D)]],
};
