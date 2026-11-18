// BOLAB — peças do grupo "frutas" (frutas e flores; módulo carregado sob demanda; ver kit.js).
//
// Cada peça é modelada por código, na medida real (1 = 10 cm), com a origem no ponto de apoio. As medidas que
// também interessam ao distribuidor (pose de cada variante, bagos de cada cacho…) vêm de kit-frutas.js: a malha
// lê de lá os mesmos números que geraram as esferas de ocupação.
import { THREE, mergeGeometries, TAU, drawKit, surface, tube, piece, smooth, rng, shown, mix, shift, tintsOf, pick, fruitSkin, leafy, cream, candy, chocolate, painted, card, gradeY, KIT } from './pecas-base.js';

const X = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const _n = new THREE.Vector3();
const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _a = new THREE.Color();
const _c = new THREE.Color();
const varsOf = (id) => KIT[id].vars;
const col = (hex) => new THREE.Color(hex);

/* ───────── Ajudantes de malha ───────── */

/** Malha montada vértice a vértice (cada parte com os próprios vértices: vales vivos entre elas). */
class Buf {
  constructor() {
    this.pos = [];
    this.col = [];
    this.idx = [];
  }

  v(x, y, z, c) {
    this.pos.push(x, y, z);
    this.col.push(c.r, c.g, c.b);
    return this.pos.length / 3 - 1;
  }

  /**
   * Gomo: calota redonda apoiada no ponto c, virada para n. rings = 2 (polo, meio, base) ou 1 (polo, base).
   * A cor vai de `dark` (na base, onde encosta nos vizinhos) a `lit` (no polo).
   */
  dome(cx, cy, cz, nx, ny, nz, rad, seg, rings, dark, lit, spin = 0) {
    _n.set(nx, ny, nz).normalize();
    _t1.crossVectors(Math.abs(_n.y) > 0.9 ? X : UP, _n).normalize();
    _t2.crossVectors(_n, _t1);
    const rows = rings === 2 ? [[0.9, 0.8], [1.78, 0.12]] : [[1.45, 0.3]];
    const pole = this.v(cx + _n.x * rad, cy + _n.y * rad, cz + _n.z * rad, lit);
    let prev = null;
    rows.forEach(([th, tone], k) => {
      const first = this.pos.length / 3;
      const st = Math.sin(th) * rad;
      const ct = Math.cos(th) * rad;
      _c.copy(dark).lerp(lit, tone);
      for (let j = 0; j < seg; j++) {
        const a = spin + ((j + (k % 2) * 0.5) / seg) * TAU;
        const ca = Math.cos(a) * st;
        const sa = Math.sin(a) * st;
        this.v(cx + _t1.x * ca + _t2.x * sa + _n.x * ct, cy + _t1.y * ca + _t2.y * sa + _n.y * ct, cz + _t1.z * ca + _t2.z * sa + _n.z * ct, _c);
      }
      for (let j = 0; j < seg; j++) {
        const j2 = (j + 1) % seg;
        if (prev == null) this.idx.push(pole, first + j, first + j2);
        else this.idx.push(prev + j, first + j, prev + j2, prev + j2, first + j, first + j2);
      }
      prev = first;
    });
  }

  /**
   * Peça torneada: rows = [[raio, y, cor]] — a cor pode ser função do ângulo. De baixo para cima (ou, num aro
   * chato, de fora para dentro) as faces saem viradas para fora (para cima); inward vira ao contrário.
   */
  lathe(rows, seg, inward = false) {
    const first = this.pos.length / 3;
    rows.forEach(([rad, y, c]) => {
      for (let j = 0; j < seg; j++) {
        const a = (j / seg) * TAU;
        this.v(rad * Math.sin(a), y, rad * Math.cos(a), typeof c === 'function' ? c(a) : c);
      }
    });
    for (let i = 0; i < rows.length - 1; i++) {
      for (let j = 0; j < seg; j++) {
        const a = first + i * seg + j;
        const b = first + i * seg + ((j + 1) % seg);
        const c = b + seg;
        const d = a + seg;
        if (inward) this.idx.push(a, c, b, a, d, c);
        else this.idx.push(a, b, c, a, c, d);
      }
    }
  }

  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

/** Troca o tom "assado" (cinza) de cada vértice por uma cor da rampa: stops = [[tom, '#hex']…]. */
function ramp(geo, stops) {
  const c = geo.attributes.color;
  const cs = stops.map(([t, hex]) => [t, new THREE.Color(hex)]);
  for (let i = 0; i < c.count; i++) {
    const t = c.getX(i);
    let k = 0;
    while (k < cs.length - 2 && t > cs[k + 1][0]) k++;
    const [t0, c0] = cs[k];
    const [t1, c1] = cs[k + 1];
    _c.copy(c0).lerp(c1, Math.max(0, Math.min(1, (t - t0) / (t1 - t0 || 1))));
    c.setXYZ(i, _c.r, _c.g, _c.b);
  }
  return geo;
}

/** Assenta a peça: o ponto mais baixo fica `sink` abaixo do apoio (y = 0). */
function sit(geo, sink = 0.003) {
  geo.computeBoundingBox();
  return geo.translate(0, -geo.boundingBox.min.y - sink, 0);
}

/** Aplica a pose do kit (os mesmos passos que geraram as esferas de ocupação; ver kit-frutas.js). */
function applyPose(geo, ops) {
  ops.forEach(([k, a, b, c]) => {
    if (k === 't') geo.translate(a, b, c);
    else if (k === 'x') geo.rotateX(a);
    else if (k === 'y') geo.rotateY(a);
    else geo.rotateZ(a);
  });
  return geo;
}

/** Malha com UV (para material pintado em canvas) a partir de listas soltas. */
function meshOf(pos, uv, idx) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Encurva um raminho deitado ao longo de z para o lado −x (acompanha a borda do bolo; ver `sprig` no kit). */
function bendX(geo, k) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) - k * pos.getZ(i) ** 2);
  return geo;
}

/** Ruído macio e barato (0…1) para manchas: não muda de uma visita para outra. */
const blotch = (a, b, seed) => 0.5 + 0.27 * Math.sin(a * 2 + seed * 1.7 + 1.8 * Math.sin(b * 2.3 + seed)) + 0.23 * Math.sin(a * 3 - b * 3.1 + seed * 2.3);

/* ───────── Morangos inteiros ─────────
   O corpo usa a textura de sementes da biblioteca (malha torneada com UV); o cálice é modelado aqui: sépalas
   pontudas deitadas no ombro da fruta, com as pontas levantadas, e o toco do cabinho. */

/** Nenhum morango é torneado: cada variante é um pouco achatada e torta para um lado (corpo e cálice juntos). */
function skew(geo, k) {
  const sx = [1, 0.97, 1.03, 0.98][k % 4];
  const sz = [0.93, 0.98, 0.9, 0.95][k % 4];
  const shear = [0.07, -0.05, 0.03, 0][k % 4];
  return geo.applyMatrix4(new THREE.Matrix4().set(sx, shear, 0, 0, 0, 1, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1));
}

function strawberryBody(D, k) {
  const lowp = D < 1;
  const pts = new THREE.SplineCurve([[0.0005, -0.165], [0.03, -0.155], [0.068, -0.105], [0.1, -0.035], [0.114, 0.04], [0.105, 0.1], [0.075, 0.138], [0.03, 0.15], [0.0005, 0.146]].map(([x, y]) => new THREE.Vector2(x, y))).getPoints(lowp ? 9 : 15);
  return skew(new THREE.LatheGeometry(pts, lowp ? 12 : 20), k);
}

function strawberryCalyx(D, k) {
  const lowp = D < 1;
  const r = rng(77 + k * 13);
  const n = lowp ? 6 : 8;
  const parts = [];
  for (let i = 0; i < n; i++) {
    const len = 0.078 + r() * 0.04;
    const curl = 0.012 + r() * 0.045; // quanto a ponta levanta
    const wid = 0.02 + r() * 0.008;
    const g = surface(lowp ? 2 : 4, 2, (u, v, p) => {
      const vv = v * 2 - 1;
      const w = wid * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.55)), 0.9) * (1 - 0.25 * u);
      const rad = 0.006 + u * len;
      // acompanha o ombro da fruta e levanta na ponta
      const over = Math.max(0, rad - 0.075);
      const y = 0.156 - 0.012 * Math.min(1, rad / 0.075) ** 2 - over * 0.32 - 0.028 * (over / 0.03) ** 2 + curl * u * u * u + 0.004 * Math.abs(vv);
      p.set(rad, y, vv * w);
      return (0.35 + 0.65 * smooth(0, 0.5, u)) * (vv === 0 ? 0.8 : 1);
    }, { shade: true });
    g.rotateY((i / n) * TAU + (r() - 0.5) * 0.5);
    parts.push(piece(g));
  }
  const stem = tube(lowp ? 1 : 2, lowp ? 3 : 5, (u, P) => P.set(0.012 * u * u, 0.148 + 0.05 * u, -0.006 * u), (u) => 0.0075 - 0.0015 * u, (u) => 0.45 + 0.4 * u, X);
  parts.push(piece(stem));
  return skew(ramp(mergeGeometries(parts), [[0, '#2f5a1c'], [0.5, '#4f8a2f'], [1, '#86b04a']]), k);
}

/** Põe o morango (ponta em −y) na pose da variante: ponta para (lean, yaw), centro em c. */
function berryPose(geo, { lean, yaw, c }) {
  return geo.rotateX(Math.PI + lean).rotateY(yaw).translate(c[0], c[1], c[2]);
}

const BERRY_TINTS = ['#ffffff', '#fff1f1', '#ffe6e0', '#f6dada'];

/* ───────── Framboesas e amoras ─────────
   Frutas de gomos: calotas redondas em fileiras desencontradas sobre um miolo escuro. A framboesa é um dedal
   oco (a boca escura aparece quando ela está deitada); a amora é mais comprida, de gomos graúdos e pretos. */

function drupeGeometry(D, o) {
  const lowp = D < 1;
  const buf = new Buf();
  const r = rng(o.seed);
  const rd = o.rd * (lowp ? o.grow || 1.3 : 1);
  const seg = lowp ? 5 : 6;
  // meridiano: do pé (τ = 0) ao ápice (τ = 1), em passos de comprimento iguais
  const N = 48;
  const pts = [];
  let len = 0;
  for (let i = 0; i <= N; i++) {
    const [rho, y] = o.profile(i / N);
    if (i) len += Math.hypot(rho - pts[i - 1][0], y - pts[i - 1][1]);
    pts.push([rho, y, len]);
  }
  const at = (s) => {
    let i = 1;
    while (i < N && pts[i][2] < s) i++;
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const t = (s - p0[2]) / (p1[2] - p0[2] || 1);
    const dr = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const dl = Math.hypot(dr, dy) || 1;
    return { rho: p0[0] + dr * t, y: p0[1] + dy * t, nr: dy / dl, ny: -dr / dl };
  };
  const dark = col(o.dark);
  const lits = o.lits.map(col);
  const rows = Math.max(2, Math.round((len - rd * 0.5) / (rd * 1.5)));
  for (let k = 0; k <= rows; k++) {
    const q = at(rd * 0.45 + ((len - rd * 0.5) * k) / rows);
    const n = q.rho < rd * 0.7 ? 1 : Math.max(3, Math.round((TAU * q.rho) / (rd * 1.72)));
    const ph = r() * TAU;
    for (let j = 0; j < n; j++) {
      const a = ph + (j / n) * TAU + (r() - 0.5) * 0.12;
      const sa = Math.sin(a);
      const ca = Math.cos(a);
      const rad = rd * (0.9 + r() * 0.22);
      const rho = n === 1 ? 0 : q.rho - 0.28 * rd * q.nr;
      const y = q.y - 0.28 * rd * q.ny + (n === 1 ? 0.1 * rd : 0);
      const nr = n === 1 ? 0 : q.nr;
      const ny = n === 1 ? 1 : q.ny;
      const lit = lits[Math.min(lits.length - 1, Math.floor(Math.pow(r(), o.bias || 1) * lits.length))];
      buf.dome(rho * sa, y, rho * ca, nr * sa + (r() - 0.5) * 0.2, ny + (r() - 0.5) * 0.2, nr * ca + (r() - 0.5) * 0.2, rad, seg, 2, dark, lit, r() * TAU);
    }
  }
  // miolo escuro por baixo dos gomos (tapa os vãos)
  const core = [];
  const cn = lowp ? 3 : 5;
  for (let i = 0; i <= cn; i++) {
    const q = at((len * i) / cn);
    core.push([Math.max(0.0005, q.rho - 0.5 * rd * q.nr), q.y - 0.5 * rd * q.ny, dark]);
  }
  buf.lathe(core, lowp ? 6 : 8);
  if (o.hollow) {
    // boca da framboesa: um funil fundo e escuro
    const [rho0, y0] = o.profile(0);
    const deep = dark.clone().multiplyScalar(0.3);
    buf.lathe([[rho0 * 0.86, y0 + 0.002, dark], [rho0 * 0.6, y0 + 0.03, deep], [rho0 * 0.3, y0 + 0.075, deep], [0.0005, y0 + 0.095, deep]], lowp ? 6 : 10, true);
  } else buf.lathe([[0.0005, core[0][1], dark], [core[0][0], core[0][1], dark]], lowp ? 6 : 8);
  let geo = buf.geo();
  if (o.sepals && !lowp) {
    // amora: a estrelinha verde-clara do cálice, no pé (duas faces: aparece quando ela está deitada)
    const [rho0, y0] = o.profile(0);
    const parts = [piece(geo)];
    for (let i = 0; i < 5; i++) {
      const g = surface(2, 2, (u, v, p) => {
        const vv = v * 2 - 1;
        p.set(rho0 * 0.25 + u * rho0 * 0.95, y0 + 0.006 - 0.012 * u + 0.02 * u * u, vv * 0.016 * (1 - u * u));
        return 0.6 + 0.4 * u;
      }, { shade: true });
      g.rotateY((i / 5) * TAU + 0.3);
      const front = ramp(piece(g), [[0, '#6f7f3a'], [1, '#b7c27c']]);
      const back = front.clone();
      const pos = back.attributes.position.array;
      for (let t = 0; t < pos.length; t += 9) {
        for (let c = 0; c < 3; c++) {
          const tmp = pos[t + 3 + c];
          pos[t + 3 + c] = pos[t + 6 + c];
          pos[t + 6 + c] = tmp;
        }
      }
      back.computeVertexNormals();
      parts.push(front, back);
    }
    geo = mergeGeometries(parts);
  }
  return geo;
}

const RASP = {
  rd: 0.0245,
  grow: 1.5,
  dark: '#40051a',
  lits: ['#b3123a', '#a70f35', '#bf1d45', '#9b0d30', '#c82a4e'],
  hollow: true,
  // dedal: mais largo perto da boca, afinando para o ápice redondo
  profile: (t) => {
    const a = t * Math.PI * 0.5;
    return [0.07 * Math.pow(Math.cos(a), 0.62) * (0.9 + 0.1 * smooth(0, 0.22, t)) + 0.0005, 0.012 + 0.163 * Math.pow(Math.sin(a), 0.92)];
  },
};
const BLACK = {
  rd: 0.03,
  grow: 1.55,
  dark: '#07040a',
  lits: ['#1d1024', '#170c1d', '#25122b', '#120a18', '#1a0e22', '#3d1230', '#55142c'],
  bias: 1.5,
  sepals: true,
  // ovo comprido, de ombros cheios
  profile: (t) => {
    const a = t * Math.PI * 0.5;
    return [0.082 * Math.pow(Math.cos(a), 0.5) * (0.8 + 0.2 * smooth(0, 0.3, t)) + 0.0005, 0.016 + 0.212 * Math.pow(Math.sin(a), 0.86)];
  },
};

/** Fruta de gomos em pé (k muda o sorteio e a proporção) ou deitada (tilt, em torno de X). */
function drupe(D, o, k, { tilt = 0, sx = 1, sy = 1, sink = 0.004 } = {}) {
  const geo = drupeGeometry(D, { ...o, seed: 404 + k * 31 });
  geo.scale(sx, sy, sx);
  if (tilt) {
    geo.translate(0, -0.1 * sy, 0).rotateX(tilt);
    geo.computeBoundingBox();
    geo.translate(0, 0, -(geo.boundingBox.min.z + geo.boundingBox.max.z) / 2);
  }
  return sit(geo, sink);
}

/** Framboesa: vermelho fundo e aveludado (pouco verniz, um brilho acetinado rosado). */
const velvet = (lib) => lib.custom('pf-velvet', () => lib.physical({ color: 0xffffff, roughness: 0.46, clearcoat: 0.22, clearcoatRoughness: 0.5, sheen: 0.45, sheenRoughness: 0.5, sheenColor: 0xff8fa8, vertexColors: true }));

/* ───────── Mirtilos ─────────
   Bolinha levemente achatada, com a coroa em estrela na ponta (onde foi a flor) e o véu azulado em manchas:
   mais claro onde ninguém pegou, azul-marinho onde a mão esfregou. */

function blueberryOne(D, R, seed) {
  const lowp = D < 1;
  const k = R / 0.062;
  const body = surface(lowp ? 5 : 9, lowp ? 8 : 12, (u, v, p) => {
    const phi = -Math.PI / 2 + u * Math.PI;
    const a = v * TAU;
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    const dish = s > 0 ? Math.exp(-((c / 0.33) ** 2)) : 0; // a covinha rasa da coroa
    p.set(R * c * Math.sin(a), R * (0.9 * s - 0.22 * dish), R * c * Math.cos(a));
    return (0.3 + 0.56 * blotch(a, phi, seed)) * (1 - 0.75 * dish) * (0.7 + 0.3 * smooth(-1, -0.25, s));
  }, { wrapV: true, shade: true, orient: true });
  // coroa: um aro baixo em estrela de cinco pontas em volta da covinha
  const buf = new Buf();
  const seg = lowp ? 5 : 10;
  const star = (j) => (lowp ? 1.1 : 1 + 0.2 * Math.cos((5 * j * TAU) / seg));
  const rows = [[0.012, 0.044, 0.04], [0.024, 0.0545, 0.46], [0.0315, 0.046, 0.26]];
  rows.forEach(([rad, y, tone], i) => {
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * TAU;
      const q = rad * k * (i ? star(j) : 1);
      buf.v(q * Math.sin(a), y * k, q * Math.cos(a), _a.setScalar(tone));
    }
  });
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j;
      const b = i * seg + ((j + 1) % seg);
      // de dentro para fora: as faces olham para cima
      buf.idx.push(a, b + seg, b, a, a + seg, b + seg);
    }
  }
  return ramp(mergeGeometries([piece(body), piece(buf.geo())]), [[0, '#06081a'], [0.3, '#131937'], [0.6, '#26315d'], [1, '#56679f']]);
}

function blueberryCluster(D, k) {
  return mergeGeometries(
    varsOf('mirtilos')[k].berries.map(([x, y, z, R, tilt, az], i) => blueberryOne(D, R, k * 7 + i * 3.1).rotateX(tilt).rotateY(az).translate(x, y - 0.003, z)),
  );
}

/** Véu do mirtilo: fosco, com um brilho acetinado azulado. */
const bloomSkin = (lib) => lib.custom('pf-bloom', () => lib.physical({ color: 0xffffff, roughness: 0.52, sheen: 0.5, sheenRoughness: 0.5, sheenColor: 0x7f93cf, vertexColors: true }));

/* ───────── Cachinhos de uva ─────────
   Mini cacho deitado: bagos ovais encostados (os de cima nos vãos dos de baixo), o engaço lenhoso saindo por
   trás e os cabinhos finos que levam a cada bago de cima. */

function grapeBunch(D, k) {
  const lowp = D < 1;
  const r = rng(909 + k * 17);
  const V = varsOf('uvas')[k];
  const top = V.h;
  return mergeGeometries(
    V.grapes.map(([x, y, z, R]) => {
      const g = new THREE.SphereGeometry(R, lowp ? 8 : 12, lowp ? 6 : 9);
      g.scale(0.95, 1.13, 0.95);
      g.rotateX(Math.PI / 2 + (r() - 0.5) * 0.9).rotateY(r() * TAU);
      g.translate(x, y - 0.004, z);
      const tone = 0.78 + r() * 0.22;
      // a luz pega os bagos de cima; entre eles e junto à cobertura fica escuro
      return gradeY(piece(g, `#${_a.setScalar(tone).getHexString()}`), [[0, '#9a9a9a'], [top * 0.45, '#d8d8d8'], [top, '#ffffff']]);
    }),
  );
}

function grapeStem(D, k) {
  const lowp = D < 1;
  const V = varsOf('uvas')[k];
  const [[x0, y0, z0], [x1, y1, z1]] = V.stem;
  const parts = [];
  // engaço: nasce no meio do cacho e sai por trás, um pouco levantado, com a ponta cortada mais grossa
  parts.push(piece(tube(lowp ? 3 : 6, lowp ? 4 : 6, (u, P) => P.set(x0 + (x1 - x0) * u + 0.018 * Math.sin(u * Math.PI), y0 - 0.07 + (y1 - y0 + 0.07) * Math.pow(u, 0.8), z0 + 0.1 * (1 - u) + (z1 - z0) * u), (u) => 0.0085 + 0.005 * smooth(0.86, 1, u) - 0.002 * (1 - u), (u) => 0.5 + 0.5 * u, X)));
  // cabinhos: do engaço até o topo de cada bago de cima
  if (!lowp) {
    V.grapes.filter((g) => g[1] > 0.15).forEach(([gx, gy, gz, R]) => {
      const ax = x0 + (x1 - x0) * 0.25;
      const ay = y0 + 0.02;
      const az = z0 + (z1 - z0) * 0.25;
      parts.push(piece(tube(3, 4, (u, P) => P.set(ax + (gx - ax) * u, ay + (gy + R * 0.9 - ay) * u + 0.03 * Math.sin(u * Math.PI), az + (gz - az) * u), 0.0042, 0.75, X)));
    });
  }
  return ramp(mergeGeometries(parts), [[0, '#4a4a20'], [0.6, '#77702f'], [1, '#a08f4c']]);
}

/** Casca de uva: brilho mais macio que o da fruta molhada (a pruína deixa o bago meio fosco). */
const grapeSkin = (lib) => lib.custom('pf-grape', () => lib.physical({ color: 0xffffff, roughness: 0.36, clearcoat: 0.3, clearcoatRoughness: 0.4, sheen: 0.35, sheenRoughness: 0.6, sheenColor: 0xdfe6ff, vertexColors: true }));

/** Tons de um cacho: a cor escolhida, um tico mais clara ou mais funda de um cacho para outro. */
const grapeTint = (p, i, r, color) => {
  const c = shown(color || '#6a2a6e');
  return [c, shift(c, 0.012, 1.05, -0.03), mix(c, '#ffffff', 0.1), shift(c, -0.015, 0.95, 0.02)][Math.floor(r() * 4) % 4];
};

/* ───────── Fatias (kiwi, limão, laranja) ─────────
   Rodela com espessura e UV plana (a textura inteira cobre o disco; a casca em volta pega a cor da beirada).
   half = meia-lua (z ≥ 0, com a parede do corte) · cut = cortada num raio (para torcer) · warp entorta. */

function sliceGeometry(R, t, D, { half = false, cut = false, warp = null, oval = 1 } = {}) {
  const lowp = D < 1;
  const nr = lowp ? 2 : 3;
  const na = half ? (lowp ? 8 : 13) : lowp ? 14 : 24;
  const span = half ? Math.PI : TAU;
  const pos = [];
  const uv = [];
  const idx = [];
  const P = new THREE.Vector3();
  const put = (rho, th, y) => {
    P.set(rho * Math.cos(th), y, rho * Math.sin(th) * oval);
    if (warp) warp(rho / R, th, P);
    pos.push(P.x, P.y, P.z);
    uv.push(0.5 + 0.488 * (rho / R) * Math.cos(th), 0.5 + 0.488 * (rho / R) * Math.sin(th));
    return pos.length / 3 - 1;
  };
  [1, -1].forEach((side) => {
    const y = (side * t) / 2;
    const c0 = put(0, 0, y);
    let prev = null;
    for (let i = 1; i <= nr; i++) {
      const ring = [];
      for (let j = 0; j <= na; j++) ring.push(put((R * i) / nr, (span * j) / na, y));
      for (let j = 0; j < na; j++) {
        if (!prev) idx.push(...(side > 0 ? [c0, ring[j + 1], ring[j]] : [c0, ring[j], ring[j + 1]]));
        else if (side > 0) idx.push(prev[j], prev[j + 1], ring[j + 1], prev[j], ring[j + 1], ring[j]);
        else idx.push(prev[j], ring[j + 1], prev[j + 1], prev[j], ring[j], ring[j + 1]);
      }
      prev = ring;
    }
  });
  // casca em volta
  const top = [];
  const bot = [];
  for (let j = 0; j <= na; j++) {
    top.push(put(R, (span * j) / na, t / 2));
    bot.push(put(R, (span * j) / na, -t / 2));
  }
  for (let j = 0; j < na; j++) idx.push(top[j], bot[j + 1], bot[j], top[j], top[j + 1], bot[j + 1]);
  const wall = (pts) => {
    const a = pts.map(([rho, th]) => put(rho, th, t / 2));
    const b = pts.map(([rho, th]) => put(rho, th, -t / 2));
    for (let i = 0; i < pts.length - 1; i++) idx.push(a[i], a[i + 1], b[i], a[i + 1], b[i + 1], b[i]);
  };
  // meia-lua: a parede reta do corte, de ponta a ponta
  const m = lowp ? 2 : 4;
  if (half) wall(Array.from({ length: m + 1 }, (_, i) => -R + (2 * R * i) / m).map((x) => [Math.abs(x), x >= 0 ? 0 : Math.PI]));
  // rodela cortada num raio: as duas paredes do corte
  if (cut) [0, span].forEach((th) => wall(Array.from({ length: nr + 1 }, (_, i) => [(R * i) / nr, th])));
  return meshOf(pos, uv, idx);
}

/** Kiwi: polpa verde com raios claros, miolo creme alongado e a roda de sementinhas pretas. */
function drawKiwi(g, S) {
  const c = S / 2;
  const R = S * 0.5;
  const px = S / 256;
  const r = rng(11);
  g.fillStyle = '#5f8420';
  g.fillRect(0, 0, S, S);
  const gr = g.createRadialGradient(c, c, R * 0.1, c, c, R);
  gr.addColorStop(0, '#bcd568');
  gr.addColorStop(0.25, '#9cc23a');
  gr.addColorStop(0.7, '#7fae2a');
  gr.addColorStop(0.94, '#6b9422');
  gr.addColorStop(1, '#5f8420');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(c, c, R, 0, TAU);
  g.fill();
  g.lineCap = 'round';
  for (let i = 0; i < 120; i++) {
    const a = r() * TAU;
    const r0 = R * (0.15 + r() * 0.12);
    const r1 = R * (0.5 + r() * 0.42);
    g.strokeStyle = `rgba(214,232,140,${(0.08 + r() * 0.16).toFixed(2)})`;
    g.lineWidth = px * (0.6 + r() * 1.3);
    g.beginPath();
    g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
    g.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
    g.stroke();
  }
  g.save();
  g.translate(c, c);
  g.scale(1, 0.7);
  const core = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.21);
  core.addColorStop(0, '#f6f3d8');
  core.addColorStop(0.6, '#e9eeb6');
  core.addColorStop(1, 'rgba(200,224,120,0)');
  g.fillStyle = core;
  g.beginPath();
  g.arc(0, 0, R * 0.21, 0, TAU);
  g.fill();
  g.restore();
  g.fillStyle = '#17100a';
  for (let i = 0; i < 40; i++) {
    const a = ((i + r() * 0.7) / 40) * TAU;
    const rr = R * (0.26 + r() * 0.15);
    g.save();
    g.translate(c + Math.cos(a) * rr, c + Math.sin(a) * rr * 0.86);
    g.rotate(a);
    g.beginPath();
    g.ellipse(0, 0, px * 4.4, px * 1.9, 0, 0, TAU);
    g.fill();
    g.restore();
  }
}

/**
 * Rodela de cítrico: casca, albedo (a parte branca), gomos com as vesículas em riscos e o miolo.
 * dried = desidratada: beirada irregular (recortada pelo alfa), miolo vazado e gomos caramelizados.
 */
function drawCitrus(g, S, o) {
  const c = S / 2;
  const R = S * 0.5;
  const px = S / 256;
  const r = rng(o.seed);
  g.clearRect(0, 0, S, S);
  const edge = (a) => (o.dried ? R * (0.95 + 0.028 * Math.sin(a * 5 + 1) + 0.016 * Math.sin(a * 11 + 2)) : R);
  const blob = (k) => {
    g.beginPath();
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * TAU;
      const q = edge(a) * k;
      if (i) g.lineTo(c + Math.cos(a) * q, c + Math.sin(a) * q);
      else g.moveTo(c + Math.cos(a) * q, c + Math.sin(a) * q);
    }
    g.closePath();
  };
  if (!o.dried) {
    g.fillStyle = o.peel;
    g.fillRect(0, 0, S, S);
  }
  blob(1);
  g.fillStyle = o.peel;
  g.fill();
  blob(1 - o.peelW);
  g.fillStyle = o.pith;
  g.fill();
  const r0 = R * 0.075;
  const r1 = R * (1 - o.peelW - o.pithW);
  const a0 = r() * TAU;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  for (let k = 0; k < o.n; k++) {
    const A = a0 + (k / o.n) * TAU + o.gap;
    const B = a0 + ((k + 1) / o.n) * TAU - o.gap;
    const mid = (A + B) / 2;
    const grad = g.createRadialGradient(c, c, r0, c, c, r1);
    grad.addColorStop(0, o.pulp0);
    grad.addColorStop(1, o.pulp1);
    g.fillStyle = grad;
    g.strokeStyle = o.pulp1;
    g.lineWidth = px * 3;
    g.beginPath();
    g.moveTo(c + Math.cos(mid) * r0, c + Math.sin(mid) * r0);
    g.lineTo(c + Math.cos(A + 0.03) * r1 * 0.96, c + Math.sin(A + 0.03) * r1 * 0.96);
    g.arc(c, c, r1 * 0.985, A + 0.05, B - 0.05);
    g.lineTo(c + Math.cos(B - 0.03) * r1 * 0.96, c + Math.sin(B - 0.03) * r1 * 0.96);
    g.closePath();
    g.fill();
    g.stroke();
    // vesículas: risquinhos claros e escuros ao longo do gomo
    for (let i = 0; i < o.streaks; i++) {
      const a = A + (B - A) * (0.1 + 0.8 * r());
      const q0 = r0 + (r1 - r0) * (0.12 + r() * 0.5);
      const q1 = Math.min(r1 * 0.95, q0 + (r1 - r0) * (0.15 + r() * 0.35));
      g.strokeStyle = r() < 0.6 ? `rgba(${o.streak},${(0.18 + r() * 0.3).toFixed(2)})` : `rgba(${o.shade},${(0.1 + r() * 0.18).toFixed(2)})`;
      g.lineWidth = px * (0.7 + r() * 1.1);
      g.beginPath();
      g.moveTo(c + Math.cos(a) * q0, c + Math.sin(a) * q0);
      g.lineTo(c + Math.cos(a) * q1, c + Math.sin(a) * q1);
      g.stroke();
    }
  }
  if (o.dried) {
    // caramelizado: a beirada e alguns pontos mais escuros; o miolo cai fora
    const burn = g.createRadialGradient(c, c, R * 0.55, c, c, R);
    burn.addColorStop(0, 'rgba(110,40,0,0)');
    burn.addColorStop(1, 'rgba(110,40,0,0.42)');
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = burn;
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 26; i++) {
      const a = r() * TAU;
      const q = R * (0.2 + r() * 0.7);
      g.fillStyle = `rgba(96,34,0,${(0.08 + r() * 0.16).toFixed(2)})`;
      g.beginPath();
      g.arc(c + Math.cos(a) * q, c + Math.sin(a) * q, px * (2 + r() * 5), 0, TAU);
      g.fill();
    }
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    for (let i = 0; i <= 10; i++) {
      const a = a0 + (i / 10) * TAU;
      const q = R * (i % 2 ? 0.03 : 0.085);
      if (i) g.lineTo(c + Math.cos(a) * q, c + Math.sin(a) * q);
      else g.moveTo(c + Math.cos(a) * q, c + Math.sin(a) * q);
    }
    g.closePath();
    g.fill();
    g.globalCompositeOperation = 'source-over';
  } else {
    g.fillStyle = o.pith;
    g.beginPath();
    g.arc(c, c, r0 * 1.15, 0, TAU);
    g.fill();
  }
}
const drawLemon = (g, S) => drawCitrus(g, S, { seed: 21, peel: '#eec20c', pith: '#f6eebc', pulp0: '#efe27c', pulp1: '#e0c634', streak: '255,250,200', shade: '176,146,20', n: 9, peelW: 0.075, pithW: 0.045, gap: 0.03, streaks: 34 });
const drawOrange = (g, S) => drawCitrus(g, S, { seed: 33, dried: true, peel: '#b4530c', pith: '#d08f3a', pulp0: '#d86f12', pulp1: '#e98a1c', streak: '255,196,96', shade: '120,44,0', n: 10, peelW: 0.07, pithW: 0.035, gap: 0.035, streaks: 30 });

/** Laranja desidratada: a rodela seca enverga como uma batata chips. */
const chipWarp = (k) => (q, th, P) => {
  P.y += 0.034 * q * q * Math.sin(2 * th + k * 1.3) + 0.012 * q * Math.sin(3 * th + k);
};

/* ───────── Figos cortados ─────────
   Metades e quartos de figo roxo: casca escura com riscas (esverdeada no pescoço) e a face cortada pintada —
   borda branca, polpa rosada de fios e sementinhas, o oco no meio. */

const FIG_H = 0.44;
/** Contorno do figo: [raio, y] do pé (y = 0) ao cabinho. */
const figOutline = (n) =>
  new THREE.SplineCurve([[0.0005, 0], [0.07, 0.006], [0.125, 0.035], [0.172, 0.09], [0.19, 0.155], [0.178, 0.225], [0.14, 0.29], [0.095, 0.34], [0.058, 0.38], [0.034, 0.41], [0.024, FIG_H]].map(([x, y]) => new THREE.Vector2(x, y))).getPoints(n).map((p) => [Math.max(0.0005, p.x), p.y]);

function figSkin(D, quarter) {
  const lowp = D < 1;
  const pts = figOutline(lowp ? 8 : 13);
  const nu = pts.length - 1;
  const span = quarter ? Math.PI / 4 : Math.PI / 2;
  const geo = surface(nu, quarter ? (lowp ? 3 : 5) : lowp ? 6 : 10, (u, v, p) => {
    const [rad, y] = pts[Math.round(u * nu)];
    const phi = (v * 2 - 1) * span;
    p.set(rad * Math.sin(phi), y, -rad * Math.cos(phi));
    const t = y / FIG_H;
    // roxo fundo com riscas; esverdeado no pescoço e em volta do olho do pé
    return 0.2 + 0.55 * smooth(0.6, 1, t) + 0.12 * smooth(0.1, 0, t) + 0.06 * Math.sin(phi * 13 + t * 3) * (1 - t) + 0.06 * blotch(phi * 2, t * 5, 3);
  }, { shade: true, orient: true });
  return ramp(geo, [[0, '#1b0c20'], [0.25, '#351736'], [0.5, '#54284a'], [0.75, '#76623f'], [1, '#94a14f']]);
}

function figFace(D, quarter) {
  const lowp = D < 1;
  const pts = figOutline(lowp ? 8 : 13);
  const pos = [];
  const uv = [];
  const idx = [];
  const add = (x, y, z, u) => {
    pos.push(x, y, z);
    uv.push(u, 0.02 + 0.96 * (y / FIG_H));
    return pos.length / 3 - 1;
  };
  const U = (rad) => 0.48 * (rad / 0.2);
  if (!quarter) {
    // a polpa estufa um tico no meio
    pts.forEach(([rad, y], i) => {
      add(-rad, y, 0, 0.5 - U(rad));
      add(0, y, 0.008 * Math.sin((Math.PI * i) / (pts.length - 1)), 0.5);
      add(rad, y, 0, 0.5 + U(rad));
      if (i) {
        const a = (i - 1) * 3;
        const b = i * 3;
        idx.push(a, a + 1, b + 1, a, b + 1, b, a + 1, a + 2, b + 2, a + 1, b + 2, b + 1);
      }
    });
  } else {
    [1, -1].forEach((side) => {
      const first = pos.length / 3;
      pts.forEach(([rad, y], i) => {
        add(0, y, 0, 0.5);
        add(side * rad * Math.SQRT1_2, y, -rad * Math.SQRT1_2, 0.5 + side * U(rad));
        if (i) {
          const a = first + (i - 1) * 2;
          const b = first + i * 2;
          idx.push(a, a + 1, b + 1, a, b + 1, b);
        }
      });
    });
  }
  return meshOf(pos, uv, idx);
}

function drawFig(g, S) {
  const pts = figOutline(48);
  const px = S / 256;
  const r = rng(5);
  const PX = (x) => S * (0.5 + 0.48 * (x / 0.2));
  const PY = (y) => S * (1 - (0.02 + 0.96 * (y / FIG_H)));
  const widthAt = (y) => {
    let i = 1;
    while (i < pts.length - 1 && pts[i][1] < y) i++;
    const [r0, y0] = pts[i - 1];
    const [r1, y1] = pts[i];
    return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0 || 1);
  };
  // quanto a polpa recua da casca: a borda branca é mais grossa no pescoço e em volta do olho do pé
  const rind = (t) => 0.022 + 0.06 * smooth(0.55, 0.95, t) + 0.03 * smooth(0.12, 0, t);
  const path = (shrink) => {
    g.beginPath();
    pts.forEach(([rad, y], i) => {
      const w = Math.max(0, rad - shrink(y / FIG_H));
      if (i) g.lineTo(PX(w), PY(y));
      else g.moveTo(PX(w), PY(y));
    });
    for (let i = pts.length - 1; i >= 0; i--) g.lineTo(PX(-Math.max(0, pts[i][0] - shrink(pts[i][1] / FIG_H))), PY(pts[i][1]));
    g.closePath();
  };
  g.fillStyle = '#3a1a3a';
  g.fillRect(0, 0, S, S);
  path(() => 0.005);
  g.fillStyle = '#f4e9cf';
  g.fill();
  // polpa: do vinho, no oco do meio, ao rosa junto da borda branca (três passadas para esfumar a divisa)
  [[1, '#e8b7a6'], [1.25, '#d9828a'], [1.6, '#c4546a']].forEach(([k, hex]) => {
    path((t) => rind(t) * k);
    g.fillStyle = hex;
    g.fill();
  });
  path((t) => rind(t) * 2.1 + 0.012);
  const grad = g.createRadialGradient(PX(0), PY(0.17), 0, PX(0), PY(0.17), S * 0.4);
  grad.addColorStop(0, '#7a1934');
  grad.addColorStop(0.5, '#a8334f');
  grad.addColorStop(1, '#c4546a');
  g.fillStyle = grad;
  g.fill();
  // fios da polpa e sementinhas, apontando do oco para a casca
  g.lineCap = 'round';
  for (let i = 0; i < 700; i++) {
    const t = 0.05 + r() * 0.74;
    const y = t * FIG_H;
    const w = widthAt(y) - rind(t) * 1.15;
    if (w < 0.012) continue;
    const x = (r() * 2 - 1) * w;
    const dx = x;
    const dy = (y - 0.17) * 0.55;
    const L = Math.hypot(dx, dy) || 1;
    const len = 0.004 + r() * 0.009;
    g.strokeStyle = r() < 0.5 ? `rgba(247,226,176,${(0.4 + r() * 0.5).toFixed(2)})` : `rgba(236,150,150,${(0.3 + r() * 0.45).toFixed(2)})`;
    g.lineWidth = px * (0.8 + r() * 1.2);
    g.beginPath();
    g.moveTo(PX(x), PY(y));
    g.lineTo(PX(x + (dx / L) * len), PY(y + (dy / L) * len));
    g.stroke();
  }
  g.fillStyle = '#f8e8bd';
  for (let i = 0; i < 300; i++) {
    const t = 0.07 + r() * 0.68;
    const y = t * FIG_H;
    const w = widthAt(y) - rind(t) * 1.3;
    if (w < 0.012) continue;
    g.beginPath();
    g.arc(PX((r() * 2 - 1) * w), PY(y), px * (0.7 + r() * 0.8), 0, TAU);
    g.fill();
  }
  // o oco do meio
  g.fillStyle = 'rgba(88,14,36,0.7)';
  g.beginPath();
  g.ellipse(PX(0), PY(0.165), S * 0.016, S * 0.085, 0, 0, TAU);
  g.fill();
}

/* ───────── Physalis ─────────
   Bolinha laranja lustrosa e a capa seca aberta para trás: cinco sépalas de papel, pontudas, com a nervura do
   meio marcada, viradas para longe da fruta. */

function physalisBerry(D) {
  const lowp = D < 1;
  return ramp(
    surface(lowp ? 6 : 10, lowp ? 9 : 14, (u, v, p) => {
      const phi = -Math.PI / 2 + u * Math.PI;
      const a = v * TAU;
      const c = Math.cos(phi);
      const s = Math.sin(phi);
      p.set(0.085 * c * Math.sin(a), 0.097 + 0.084 * s, 0.085 * c * Math.cos(a));
      // mais amarela e sombreada junto ao cabinho (onde a capa nasce); laranja vivo na ponta
      return 0.2 + 0.6 * smooth(-1, -0.2, s) + 0.2 * blotch(a, phi, 4);
    }, { wrapV: true, shade: true, orient: true }),
    [[0, '#9c4c08'], [0.35, '#cf730a'], [0.75, '#e6790a'], [1, '#f08c12']],
  );
}

function physalisHusk(D, k) {
  const lowp = D < 1;
  const V = varsOf('physalis')[k];
  const r = rng(31 + k * 7);
  const parts = [];
  V.sepals.forEach((deg) => {
    const az = (deg * Math.PI) / 180 + (r() - 0.5) * 0.1;
    const len = 0.185 + r() * 0.04;
    const back = V.back * (0.85 + r() * 0.3);
    const wid = 0.082 + r() * 0.012;
    const lift = 0.03 + r() * 0.02;
    const ex = Math.cos(az);
    const ez = Math.sin(az);
    parts.push(
      piece(
        surface(lowp ? 3 : 6, lowp ? 2 : 4, (u, v, p) => {
          const vv = v * 2 - 1;
          // larga perto da base, afinando numa ponta comprida
          const w = wid * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.52)), 0.8) * (1 - 0.25 * u);
          const rho = 0.01 + len * Math.pow(u, 0.9);
          // a sépala é uma canoa: as beiradas sobem para o lado da fruta
          const y = lift * Math.sin(Math.PI * Math.min(1, u * 1.15)) - back * u * u + 0.24 * Math.abs(vv) * w + 0.006 * Math.sin(u * 17 + vv * 4);
          p.set(ex * rho - ez * vv * w, y, ez * rho + ex * vv * w);
          return 0.38 + 0.42 * smooth(0, 0.45, u) - 0.2 * Math.exp(-((vv / 0.2) ** 2)) + 0.16 * Math.abs(vv) + 0.06 * Math.sin(u * 22 + vv * 3);
        }, { shade: true }),
      ),
    );
  });
  parts.push(piece(tube(lowp ? 1 : 2, lowp ? 3 : 5, (u, P) => P.set(0.006 * u, 0.012 - 0.06 * u, 0.004 * u * u), 0.0065, 0.3, X)));
  return ramp(mergeGeometries(parts), [[0, '#4a3414'], [0.4, '#7d5d2c'], [0.7, '#a1834c'], [1, '#bfa46b']]);
}

/* ───────── Maracujá ─────────
   Metade em cuia: casca amarela lisa, a parede branca e grossa do corte e, dentro, a polpa alaranjada e
   encharcada, cheia de sementes pretas — cada uma no seu saquinho. */

function passionShell(D) {
  const lowp = D < 1;
  const { R, dep } = varsOf('maracuja')[0];
  const seg = lowp ? 12 : 22;
  const buf = new Buf();
  const skin = [col('#a87a16'), col('#d9a826'), col('#ecc542')];
  const rows = [];
  const nu = lowp ? 4 : 7;
  for (let i = 0; i <= nu; i++) {
    const th = (i / nu) * Math.PI * 0.5;
    rows.push([
      Math.max(0.0005, R * Math.sin(th)),
      -dep * Math.cos(th),
      (a) => {
        const b = blotch(a * 1.5, th * 4, 2);
        return _a.copy(skin[1]).lerp(b > 0.5 ? skin[2] : skin[0], Math.abs(b - 0.5) * 1.3).multiplyScalar(0.72 + 0.28 * (i / nu));
      },
    ]);
  }
  buf.lathe(rows, seg);
  // o corte: casca fina por fora, a parede branca e a beirada que desce para a polpa
  const pith = col('#f5ecd2');
  buf.lathe([[R, 0, skin[1]], [R - 0.007, 0.0015, col('#efe0a8')], [R - 0.022, 0.002, pith], [R - 0.04, 0, pith], [R - 0.047, -0.012, col('#f0d68c')], [R - 0.05, -0.03, col('#e0a030')]], seg);
  return buf.geo();
}

/** Polpa: altura em (x, z) — um saquinho estufado em volta de cada semente. */
function passionSeeds(lowp) {
  const { R } = varsOf('maracuja')[0];
  const n = lowp ? 12 : 22;
  const r = rng(61);
  const seeds = [];
  for (let i = 0; i < n; i++) {
    const rho = (R - 0.075) * Math.sqrt((i + 0.6) / n);
    const a = i * 2.39996 + (r() - 0.5) * 0.5;
    seeds.push([rho * Math.sin(a), rho * Math.cos(a), r() * TAU, 0.85 + r() * 0.3]);
  }
  const height = (x, z) => {
    let h = 0;
    for (let i = 0; i < n; i++) h = Math.max(h, 0.024 * seeds[i][3] * Math.exp(-(((x - seeds[i][0]) ** 2 + (z - seeds[i][1]) ** 2) / (lowp ? 0.0028 : 0.0016))));
    return h;
  };
  return { seeds, height };
}

function passionPulp(D) {
  const lowp = D < 1;
  const { R } = varsOf('maracuja')[0];
  const { seeds, height } = passionSeeds(lowp);
  const Rc = R - 0.046;
  const pulp = ramp(
    surface(lowp ? 4 : 8, lowp ? 12 : 24, (u, v, p) => {
      const a = v * TAU;
      const rho = Rc * u;
      const x = rho * Math.sin(a);
      const z = rho * Math.cos(a);
      const h = height(x, z);
      p.set(x, -0.03 + h - 0.012 * u * u, z);
      return 0.25 + 0.75 * Math.min(1, h / 0.02);
    }, { wrapV: true, shade: true }),
    [[0, '#7a3c00'], [0.4, '#c06a04'], [0.8, '#e0900e'], [1, '#efb026']],
  );
  const parts = [piece(pulp)];
  seeds.forEach(([x, z, spin, k]) => {
    // semente: gota preta achatada, meio afundada no seu saquinho
    const g = new THREE.SphereGeometry(1, lowp ? 5 : 8, lowp ? 3 : 5);
    g.scale(0.018 * k, 0.008, 0.0115 * k).rotateY(spin).rotateX((spin % 1) * 0.5 - 0.25);
    g.translate(x, -0.03 + height(x, z) - 0.0025, z);
    parts.push(piece(g, '#170d07'));
  });
  return mergeGeometries(parts);
}

/* ───────── Mosquitinho (gipsofila) ─────────
   Tufo de raminhos verdes finíssimos que se abrem em três e de novo em dois ou três, cada pontinha com uma
   florzinha branca miúda (uma bolinha facetada) e botões nos nós. */

function gypsophila(D, k) {
  const lowp = D < 1;
  const r = rng(515 + varsOf('gipsofila')[k].seed * 29);
  const parts = [];
  const whites = ['#ffffff', '#f4f1e6', '#ecefe0'];
  const flower = (x, y, z, s) => {
    const g = new THREE.IcosahedronGeometry(lowp ? s * 1.35 : s, 0);
    // florzinha dobrada: um pompom macio (normais de bolinha), não um cristal
    g.setAttribute('normal', g.attributes.position.clone());
    g.scale(1, 0.72, 1).rotateX(r() * 3).rotateZ(r() * 3);
    // nada sai da nuvem (a esfera de ocupação do kit)
    const q = Math.hypot(x, z);
    const k2 = q > 0.182 ? 0.182 / q : 1;
    g.translate(x * k2, Math.min(0.18, Math.max(0.02, y)), z * k2);
    parts.push(piece(g, whites[Math.floor(r() * 3) % 3]));
  };
  const twig = (a, b, rad) => {
    const ref = Math.abs(b.y - a.y) > 0.9 * a.distanceTo(b) ? X : UP;
    parts.push(piece(tube(1, 3, (u, P) => P.lerpVectors(a, b, u), rad, 1, ref), '#73905a'));
  };
  const grow = (base, dir, len, depth, rad) => {
    const tip = base.clone().addScaledVector(dir, len);
    tip.y = Math.max(0.018, tip.y);
    twig(base, tip, rad);
    if (depth === 0) return void flower(tip.x, tip.y, tip.z, 0.02 + r() * 0.009);
    const n = 3;
    const b1 = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) > 0.9 ? X : UP).normalize();
    const b2 = new THREE.Vector3().crossVectors(dir, b1);
    const ph = r() * TAU;
    for (let i = 0; i < n; i++) {
      const open = 0.5 + r() * 0.4;
      const phi = ph + (i / n) * TAU + (r() - 0.5) * 0.6;
      const d = dir.clone().multiplyScalar(Math.cos(open)).addScaledVector(b1, Math.sin(open) * Math.cos(phi)).addScaledVector(b2, Math.sin(open) * Math.sin(phi));
      d.y = Math.max(-0.1, Math.min(0.8, d.y));
      grow(tip, d.normalize(), len * (0.58 + r() * 0.2), depth - 1, rad * 0.78);
    }
    if (!lowp && r() < 0.7) flower(tip.x + dir.x * 0.012, tip.y + dir.y * 0.012, tip.z + dir.z * 0.012, 0.013);
  };
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + r() * 0.7;
    const el = 0.3 + r() * 0.75;
    grow(new THREE.Vector3(0, -0.004, 0), new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)), 0.08 + r() * 0.03, lowp ? 1 : 2, 0.0042);
  }
  return mergeGeometries(parts);
}

/* ───────── Lavanda ─────────
   Macinho de dois ou três raminhos secos, amarrado com ráfia: cabo fino cinza-esverdeado e a espiga de botões
   roxos miúdos em verticilos desencontrados, afinando para a ponta. Deitado ao longo de z (as espigas em −z). */

function lavender(D, k) {
  const lowp = D < 1;
  const V = varsOf('lavanda')[k];
  const r = rng(707 + k * 11);
  const parts = [];
  const q = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  const purples = ['#5f4f96', '#7160a8', '#4f417f', '#7f72b0', '#665e8e'];
  (V.n === 3 ? [-0.15, 0.02, 0.16] : [-0.08, 0.12]).forEach((yaw, i) => {
    const zA = 0.36 - r() * 0.03; // o corte do cabo
    const zB = -0.34 + r() * 0.04; // a ponta da espiga
    const zS = zB + 0.25 + r() * 0.05; // onde a espiga começa
    const xAt = (z) => (0.2 - z) * Math.tan(yaw); // abrem em leque a partir do amarrado (z = 0,2)
    const yAt = (z) => 0.012 + (i % 2) * 0.007 + 0.016 * smooth(0.12, -0.15, z);
    parts.push(piece(tube(lowp ? 1 : 3, lowp ? 3 : 4, (u, P) => {
      const z = zA + (zB + 0.03 - zA) * u;
      P.set(xAt(z), yAt(z), z);
    }, 0.0052, 1, UP), '#869670'));
    const whorls = lowp ? 5 : 8;
    const per = lowp ? 4 : 6;
    for (let w = 0; w < whorls; w++) {
      const t = w / (whorls - 1);
      const z = zS + (zB - zS) * t;
      const rw = 0.0135 * (1 - 0.5 * t * t) - (w === 0 ? 0.003 : 0);
      const size = (lowp ? 1.3 : 1) * (1 - 0.32 * t);
      for (let j = 0; j < per; j++) {
        const phi = ((j + (w % 2) * 0.5) / per) * TAU + (r() - 0.5) * 0.3;
        const ex = Math.cos(phi);
        const ey = Math.sin(phi);
        // cada botão aponta para fora e para a ponta da espiga
        axis.set(ex * 0.72, ey * 0.72, -0.7).normalize();
        const g = new THREE.OctahedronGeometry(1, 0);
        g.scale(0.0085 * size, 0.019 * size, 0.0085 * size);
        g.applyQuaternion(q.setFromUnitVectors(UP, axis));
        g.translate(xAt(z) + ex * rw, yAt(z) + ey * rw, z);
        parts.push(piece(g, purples[Math.floor(r() * purples.length) % purples.length]));
      }
    }
  });
  // o amarrado de ráfia
  if (!lowp) parts.push(piece(tube(8, 4, (u, P) => P.set(Math.cos(u * TAU) * 0.027, 0.017 + Math.sin(u * TAU) * 0.014, 0.2 + 0.004 * Math.sin(u * TAU * 2)), 0.0042, 1, Z), '#c9b68a'));
  return bendX(mergeGeometries(parts), V.bend);
}

/* ───────── Eucalipto ─────────
   Ramo de eucalipto prateado: haste fina avermelhada e pares de folhas redondas verde-acinzentadas, um par
   deitado e o seguinte levantado, diminuindo até a ponta. Deitado ao longo de z (a ponta em −z). */

function roundLeaf(Rl, lowp, seed) {
  return surface(lowp ? 5 : 7, 2, (u, v, p) => {
    const vv = v * 2 - 1;
    const w = Rl * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2)) * (1 - 0.1 * u);
    p.set(u * 1.9 * Rl, 0.11 * Rl * vv * vv + 0.07 * Rl * Math.sin(Math.PI * u), vv * w);
    return 0.4 + 0.2 * u + 0.2 * vv * vv + (vv === 0 ? 0.14 : 0) + 0.12 * blotch(u * 3, vv * 2, seed);
  }, { shade: true });
}

function eucalyptus(D, k) {
  const lowp = D < 1;
  const V = varsOf('eucalipto')[k];
  const r = rng(808 + k * 5);
  const L = V.len;
  const xAt = (t) => 0.012 * Math.sin(t * 5 + k);
  const yAt = (t) => 0.008 + 0.04 * Math.sin(Math.PI * t) + 0.018 * t;
  const zAt = (t) => L / 2 - L * t;
  const leaves = [];
  for (let i = 0; i < V.nodes; i++) {
    const t = 0.08 + (0.92 * i) / (V.nodes - 1);
    const Rl = (0.108 - 0.058 * t) * (0.9 + r() * 0.2);
    const raised = i % 2 === 1;
    [1, -1].forEach((side) => {
      const g = roundLeaf(Rl, lowp, i * 2 + side);
      const elev = raised ? 0.7 + r() * 0.3 : 0.1 + r() * 0.2;
      const sweep = 0.35 + r() * 0.3;
      g.rotateX((r() - 0.5) * 0.5 + (raised ? side * 0.45 : 0)).rotateZ(elev).rotateY(side > 0 ? sweep : Math.PI - sweep);
      g.translate(xAt(t), yAt(t) + 0.004, zAt(t));
      leaves.push(piece(g));
    });
  }
  const stem = tube(lowp ? 3 : 8, lowp ? 3 : 5, (u, P) => P.set(xAt(u), yAt(u), zAt(u)), (u) => 0.0078 - 0.0042 * u, 1, UP);
  return bendX(mergeGeometries([ramp(mergeGeometries(leaves), [[0, '#3f584a'], [0.5, '#6e8c78'], [1, '#aabfae']]), piece(stem, '#7c6052')]), V.bend);
}

/* ───────── Suculentas de buttercream ─────────
   Rosetas feitas no bico: folhas carnudas (corte oval, mais chato em cima) em anéis desencontrados — as de fora
   deitadas, as de dentro cada vez mais em pé e menores. Três tipos: echevéria, pontuda e roseta gordinha.
   A cor vem por instância; a ponta de cada folha puxa para o rosado. */

const SUCCULENTS = [
  // anéis: [folhas, comprimento, meia largura, inclinação, raio onde nasce] · thick = grossura · point = onde começa o bico
  { rings: [[6, 0.15, 0.056, 0.22, 0.034], [5, 0.122, 0.05, 0.6, 0.03], [4, 0.088, 0.04, 0.98, 0.02], [3, 0.052, 0.028, 1.32, 0.008]], thick: 0.021, point: 0.72 },
  { rings: [[8, 0.152, 0.034, 0.3, 0.034], [7, 0.128, 0.031, 0.68, 0.028], [5, 0.098, 0.027, 1.02, 0.018], [3, 0.062, 0.02, 1.34, 0.007]], thick: 0.017, point: 0.5 },
  { rings: [[7, 0.118, 0.058, 0.26, 0.03], [6, 0.096, 0.052, 0.62, 0.026], [5, 0.07, 0.042, 1.0, 0.018], [3, 0.042, 0.03, 1.32, 0.007]], thick: 0.023, point: 0.84 },
];

function succulent(D, k) {
  const lowp = D < 1;
  const r = rng(321 + k * 9);
  const kind = SUCCULENTS[k % 3];
  const parts = [];
  kind.rings.forEach(([n, len, wid, elev, r0], ri) => {
    for (let i = 0; i < n; i++) {
      const el = elev + (r() - 0.5) * 0.12;
      const ln = len * (0.92 + r() * 0.16);
      const se = Math.sin(el);
      const ce = Math.cos(el);
      const g = surface(lowp ? (ri < 2 && n < 7 ? 3 : 2) : 4, lowp ? 4 : n > 6 || ri > 1 ? 5 : 6, (u, v, p) => {
        const a = v * TAU;
        const sn = Math.sin(a);
        // espatulada: estreita no pé, larga a dois terços, terminando em bico
        const w = wid * (0.5 + 0.5 * smooth(0, 0.6, u)) * Math.sqrt(Math.max(0, 1 - smooth(kind.point, 1, u) ** 2)) + 0.0004;
        const th = kind.thick * (1 - 0.4 * u) * (0.25 + 0.75 * (w / wid)) * (sn > 0 ? 0.4 : 1) * sn;
        const along = ln * u;
        const lift = ln * 0.2 * u * u; // a folha enverga para cima
        p.set(r0 + along * ce - (th + lift) * se, 0.008 + ri * 0.012 + along * se + (th + lift) * ce, Math.cos(a) * w);
        return (0.3 + 0.52 * smooth(0, 0.5, u) + 0.18 * smooth(0.72, 1, u)) * (sn < -0.3 ? 0.86 : 1);
      }, { wrapV: true, shade: true, orient: true });
      g.rotateY(((i + (ri % 2) * 0.5) / n) * TAU + (r() - 0.5) * 0.22 + ri * 0.37);
      parts.push(piece(g));
    }
  });
  const buf = new Buf();
  buf.lathe([[0.062, 0.002, _a.setScalar(0.2).clone()], [0.04, 0.022, _a.setScalar(0.3).clone()], [0.0005, 0.03, _a.setScalar(0.3).clone()]], lowp ? 5 : 7);
  parts.push(piece(buf.geo()));
  return ramp(mergeGeometries(parts), [[0, '#737373'], [0.5, '#c8c8c8'], [0.82, '#ffffff'], [1, '#ffd9e2']]);
}

/* ───────── Girassóis de buttercream ─────────
   Três voltas de pétalas de bico folha (largas no pé, puxadas numa ponta, com a quina no meio), folhas verdes
   de bico por baixo e o miolo: um botão escuro coberto de granulado de chocolate. */

function leafStroke(n, len, wid, r0, elev, drop, lift, lowp) {
  const se = Math.sin(elev);
  const ce = Math.cos(elev);
  return surface(lowp ? 2 : n, 2, (u, v, p) => {
    const vv = v * 2 - 1;
    const w = wid * (0.7 + 0.3 * Math.sin(Math.PI * Math.min(1, u * 1.3))) * Math.pow(Math.max(0, 1 - u ** 2.4), 0.7);
    const along = len * u;
    const ridge = (1 - Math.abs(vv)) * 0.8 * w + 0.004 * Math.sin(u * 14) * (1 - u);
    p.set(r0 + along * ce - ridge * se, lift + along * se + ridge * ce - drop * u * u, vv * w);
    return (0.25 + 0.75 * smooth(0, 0.7, u)) * (vv === 0 ? 1 : 0.84);
  }, { shade: true, flip: true });
}

function sunflowerPetals(D, k) {
  const lowp = D < 1;
  const r = rng(909 + k * 3);
  const petals = [];
  // voltas: [pétalas, comprimento, raio onde nascem, inclinação, desencontro]
  (lowp ? [[11, 0.125, 0.085, 0.1, 0], [9, 0.105, 0.07, 0.42, 0.5], [7, 0.078, 0.056, 0.8, 0.25]] : [[14, 0.125, 0.085, 0.1, 0], [12, 0.105, 0.07, 0.42, 0.5], [10, 0.078, 0.056, 0.8, 0.25]]).forEach(([n, len, r0, elev, off], li) => {
    for (let i = 0; i < n; i++) {
      const g = leafStroke(3, len * (0.9 + r() * 0.2), 0.031 * (0.9 + r() * 0.2) * (1 - li * 0.08), r0, elev + (r() - 0.5) * 0.14, li ? 0.006 : 0.02, 0.012 + li * 0.006, lowp);
      g.rotateY(((i + off) / n) * TAU + (r() - 0.5) * 0.12);
      petals.push(piece(g));
    }
  });
  const leaves = varsOf('girassois')[k].leaves.map((ang, i) => piece(leafStroke(4, 0.15 + 0.02 * i, 0.05, 0.1, 0.05, 0.012, 0.006, lowp).rotateY(ang)));
  return mergeGeometries([ramp(mergeGeometries(petals), [[0, '#8a4600'], [0.5, '#d68a00'], [1, '#f0b004']]), ramp(mergeGeometries(leaves), [[0, '#2f5a26'], [0.6, '#4f8a3a'], [1, '#77ab52']])]);
}

function sunflowerCore(D, k) {
  const lowp = D < 1;
  const r = rng(1234 + k);
  const buf = new Buf();
  const brown = col('#24120a');
  buf.lathe([[0.094, 0.004, col('#150a04')], [0.088, 0.024, brown], [0.062, 0.037, brown], [0.03, 0.042, brown], [0.0005, 0.043, brown]], lowp ? 8 : 12);
  const parts = [piece(buf.geo())];
  const tones = ['#3b1e0f', '#4a2812', '#2e160a', '#5a3218'];
  const n = lowp ? 16 : 40;
  for (let i = 0; i < n; i++) {
    const rho = 0.084 * Math.sqrt((i + 0.5) / n);
    const a = i * 2.39996 + r();
    const g = new THREE.CylinderGeometry(0.0046, 0.0046, lowp ? 0.034 : 0.027, lowp ? 3 : 4, 1, true);
    g.rotateZ(Math.PI / 2 + (r() - 0.5) * 0.5).rotateY(r() * TAU);
    g.translate(rho * Math.sin(a), 0.047 - 0.033 * (rho / 0.094) ** 2 + r() * 0.004, rho * Math.cos(a));
    parts.push(piece(g, tones[i % 4]));
  }
  return mergeGeometries(parts);
}

/** Folha fina: a luz atravessa um pouco (o lado de trás não fica preto). */
const foliage = (lib) => lib.custom('pf-foliage', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide, vertexColors: true, emissive: 0x566a5c, emissiveIntensity: 0.4 }));

/** Creme de bico visto dos dois lados (pétalas finas de bico folha). */
const creamLeaf = (lib) => lib.custom('pf-creamLeaf', () => lib.physical({ color: 0xffffff, roughness: 0.6, sheen: 0.4, sheenRoughness: 0.55, sheenColor: 0xffffff, side: THREE.DoubleSide, vertexColors: true }));

/* ───────── Flores prensadas ─────────
   Decalques chapados, como num herbário: amor-perfeito roxo e amarelo, margaridinha, raminho de folhas e uma
   florzinha azul com cabo. Cada um é pintado em canvas (em unidades do mundo: 1 = 10 cm) e recortado pelo alfa. */

/** Prepara o canvas para desenhar em unidades do mundo, com y para cima, numa placa de w × h. */
function world(g, S, w, h) {
  g.setTransform(S / w, 0, 0, -S / h, S / 2, S / 2);
  g.lineCap = 'round';
  g.lineJoin = 'round';
}
function petalPath(g, len, wid) {
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(wid, len * 0.18, wid * 1.12, len * 0.92, 0, len);
  g.bezierCurveTo(-wid * 1.12, len * 0.92, -wid, len * 0.18, 0, 0);
  g.closePath();
}
/** Uma pétala: preenchimento em degradê do pé à ponta, contorno fino e nervuras claras. */
function petal(g, ang, len, wid, stops, { edge = 'rgba(60,40,60,0.35)', veins = 5, vein = 'rgba(255,255,255,0.16)' } = {}) {
  g.save();
  g.rotate(ang);
  const grad = g.createLinearGradient(0, 0, 0, len);
  stops.forEach(([t, c]) => grad.addColorStop(t, c));
  petalPath(g, len, wid);
  g.fillStyle = grad;
  g.fill();
  g.strokeStyle = edge;
  g.lineWidth = len * 0.012;
  g.stroke();
  g.strokeStyle = vein;
  g.lineWidth = len * 0.008;
  for (let i = 0; i < veins; i++) {
    const k = veins === 1 ? 0 : (i / (veins - 1)) * 2 - 1;
    g.beginPath();
    g.moveTo(0, len * 0.06);
    g.quadraticCurveTo(k * wid * 0.55, len * 0.5, k * wid * 0.72, len * (0.9 - 0.18 * Math.abs(k)));
    g.stroke();
  }
  g.restore();
}

function drawPansy(g, S, w, h, pal) {
  world(g, S, w, h);
  const L = w * 0.46;
  g.translate(0, -w * 0.02);
  // duas pétalas de cima, por trás
  petal(g, 0.48, L, L * 0.6, pal.top);
  petal(g, -0.48, L, L * 0.6, pal.top);
  // as dos lados e a de baixo, com os "bigodes" escuros
  petal(g, 1.85, L * 0.9, L * 0.56, pal.side);
  petal(g, -1.85, L * 0.9, L * 0.56, pal.side);
  petal(g, Math.PI, L * 0.95, L * 0.68, pal.low);
  g.strokeStyle = pal.whisker;
  [[1.85, 5], [-1.85, 5], [Math.PI, 7]].forEach(([ang, n]) => {
    g.save();
    g.rotate(ang);
    for (let i = 0; i < n; i++) {
      const k = (i / (n - 1)) * 2 - 1;
      g.lineWidth = L * 0.014;
      g.beginPath();
      g.moveTo(0, L * 0.05);
      g.quadraticCurveTo(k * L * 0.14, L * 0.2, k * L * 0.26, L * (0.4 - 0.1 * Math.abs(k)));
      g.stroke();
    }
    g.restore();
  });
  g.fillStyle = pal.eye;
  g.beginPath();
  g.arc(0, -L * 0.03, L * 0.075, 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.75)';
  [-1, 1].forEach((s) => {
    g.beginPath();
    g.ellipse(s * L * 0.09, L * 0.01, L * 0.04, L * 0.025, s * 0.5, 0, TAU);
    g.fill();
  });
}
const VIOLET = { top: [[0, '#2f1650'], [0.5, '#4a2478'], [1, '#5c3190']], side: [[0, '#3a1a62'], [0.45, '#6a3ea6'], [1, '#8a62c4']], low: [[0, '#f0c53a'], [0.3, '#f3d86a'], [0.55, '#8a5fc2'], [1, '#6a3ea6']], whisker: 'rgba(30,8,50,0.85)', eye: '#f2a91c' };
const SUNSET = { top: [[0, '#4c1026'], [0.5, '#7a1c3c'], [1, '#93304e']], side: [[0, '#b9791a'], [0.4, '#edbd3a'], [1, '#f3d267']], low: [[0, '#c98a1c'], [0.4, '#f0c540'], [1, '#f5da78']], whisker: 'rgba(70,14,30,0.85)', eye: '#e08a12' };

function drawDaisy(g, S, w, h) {
  world(g, S, w, h);
  const r = rng(42);
  const L = w * 0.46;
  // duas voltas de pétalas brancas de ponta rosada (a de trás um tom abaixo, para o desenho aparecer no branco)
  [[16, 0.94, [[0, '#e9dcc4'], [0.7, '#eadcd0'], [1, '#dba0b0']]], [18, 1, [[0, '#f3ead6'], [0.65, '#f8f2e6'], [1, '#eab4c2']]]].forEach(([n, k, stops], li) => {
    for (let i = 0; i < n; i++) petal(g, ((i + li * 0.5) / n) * TAU + (r() - 0.5) * 0.12, L * k * (0.9 + r() * 0.1), L * 0.1, stops, { edge: 'rgba(150,120,110,0.5)', veins: 1, vein: 'rgba(190,160,150,0.35)' });
  });
  const core = g.createRadialGradient(0, 0, 0, 0, 0, L * 0.26);
  core.addColorStop(0, '#e9b92c');
  core.addColorStop(0.7, '#d39a1c');
  core.addColorStop(1, '#a8741a');
  g.fillStyle = core;
  g.beginPath();
  g.arc(0, 0, L * 0.26, 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(120,76,10,0.55)';
  for (let i = 0; i < 40; i++) {
    const a = r() * TAU;
    const q = L * 0.23 * Math.sqrt(r());
    g.beginPath();
    g.arc(Math.cos(a) * q, Math.sin(a) * q, L * 0.014, 0, TAU);
    g.fill();
  }
}

/** Folhinha oval com a nervura do meio, nascendo em (x, y) na direção ang. */
function leaflet(g, x, y, ang, len, wid, fill) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  petalPath(g, len, wid);
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = 'rgba(40,60,20,0.4)';
  g.lineWidth = len * 0.02;
  g.stroke();
  g.strokeStyle = 'rgba(225,235,190,0.55)';
  g.beginPath();
  g.moveTo(0, len * 0.05);
  g.lineTo(0, len * 0.88);
  g.stroke();
  g.restore();
}

function drawSprig(g, S, w, h) {
  world(g, S, w, h);
  const greens = ['#6c8846', '#7f9a52', '#8fa55e', '#5f7c40'];
  const at = (t) => [w * 0.1 * Math.sin(t * 2.6 - 0.5), -h * 0.44 + h * 0.8 * t];
  g.strokeStyle = '#6b7c3e';
  g.lineWidth = w * 0.03;
  g.beginPath();
  for (let i = 0; i <= 20; i++) {
    const [x, y] = at(i / 20);
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.stroke();
  for (let i = 0; i < 11; i++) {
    const t = 0.14 + (0.86 * i) / 10;
    const [x, y] = at(t);
    const side = i % 2 ? 1 : -1;
    const len = w * (0.42 - 0.2 * t);
    leaflet(g, x, y, i === 10 ? -0.25 : -side * (1.0 - 0.3 * t), len, len * 0.36, greens[i % 4]);
  }
}

function drawBlue(g, S, w, h) {
  world(g, S, w, h);
  g.strokeStyle = '#6b7c3e';
  g.lineWidth = w * 0.035;
  g.beginPath();
  g.moveTo(-w * 0.04, -h * 0.45);
  g.quadraticCurveTo(w * 0.1, -h * 0.1, 0, h * 0.2);
  g.stroke();
  leaflet(g, w * 0.03, -h * 0.25, -1.0, w * 0.42, w * 0.13, '#7f9a52');
  leaflet(g, w * 0.045, -h * 0.1, 0.9, w * 0.36, w * 0.12, '#6c8846');
  // cinco pétalas redondas azuis e o olho amarelo
  g.translate(0, h * 0.24);
  const L = w * 0.42;
  for (let i = 0; i < 5; i++) petal(g, (i / 5) * TAU + 0.2, L, L * 0.5, [[0, '#4a5fae'], [0.5, '#6b84cf'], [1, '#8ea4e2']], { edge: 'rgba(40,50,110,0.45)', veins: 3 });
  g.fillStyle = '#f4f0d6';
  g.beginPath();
  g.arc(0, 0, L * 0.2, 0, TAU);
  g.fill();
  g.fillStyle = '#e8b320';
  g.beginPath();
  g.arc(0, 0, L * 0.12, 0, TAU);
  g.fill();
}

const PRESSED = [(g, S, w, h) => drawPansy(g, S, w, h, VIOLET), drawDaisy, drawSprig, (g, S, w, h) => drawPansy(g, S, w, h, SUNSET), drawBlue];

/** Placa deitada (a frente para cima, o alto do desenho em +z), um fio acima da cobertura. */
function decal(k) {
  const [w, h] = varsOf('prensadas')[k].card;
  return card(w, h).rotateX(-Math.PI / 2).rotateY(Math.PI).translate(0, 0.0035, 0);
}

/** Material de uma flor prensada: fosco, recortado, sem brigar de profundidade com a cobertura. */
function pressedMat(lib, k) {
  const [w, h] = varsOf('prensadas')[k].card;
  const mat = painted(lib, `prensada${k}`, (g, S) => PRESSED[k](g, S, w, h), { alpha: true, rough: 0.82 });
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -2;
  return mat;
}

/* ───────── Malhas (uma por variante k do kit; D = 1 no computador, 0,5 no celular) ───────── */

const poseOf = (id, k) => varsOf(id)[k].pose;
const slice = (id, k, t, D, more = {}) => {
  const V = varsOf(id)[k];
  return applyPose(sliceGeometry(V.R, t, D, { half: Boolean(V.half), ...more }), V.pose);
};

export const MESHES = {
  morangoCorpo: (D, k) => berryPose(strawberryBody(D, k), poseOf('morangosfrescos', k)),
  morangoCalice: (D, k) => berryPose(strawberryCalyx(D, k), poseOf('morangosfrescos', k)),
  framboesa: (D, k) => (k === 2 ? drupe(D, RASP, k, { tilt: -1.77, sink: 0.006 }) : drupe(D, RASP, k, k ? { sx: 1.05, sy: 0.94 } : {})),
  amora: (D, k) => (k === 1 ? drupe(D, BLACK, k, { tilt: 1.5, sink: 0.006 }) : drupe(D, BLACK, k, k ? { sx: 1.04, sy: 0.93 } : {})),
  mirtilos: (D, k) => blueberryCluster(D, k),
  uvas: (D, k) => grapeBunch(D, k),
  uvasCabo: (D, k) => grapeStem(D, k),
  figoCasca: (D, k) => applyPose(figSkin(D, varsOf('figos')[k].quarter), poseOf('figos', k)),
  figoFace: (D, k) => applyPose(figFace(D, varsOf('figos')[k].quarter), poseOf('figos', k)),
  physalis: (D, k) => applyPose(physalisBerry(D), poseOf('physalis', k)),
  physalisCapa: (D, k) => applyPose(physalisHusk(D, k), poseOf('physalis', k)),
  kiwi: (D, k) => slice('kiwi', k, 0.042, D, { oval: 0.92 }),
  laranja: (D, k) => slice('laranja', k, 0.012, D, { warp: chipWarp(k) }),
  limao: (D, k) => {
    const V = varsOf('limao')[k];
    return V.twist ? slice('limao', k, 0.032, D, { cut: true, warp: (q, th, P) => void (P.y += (V.twist * (th - Math.PI) * q) / Math.PI) }) : slice('limao', k, 0.032, D);
  },
  maracujaCasca: (D, k) => applyPose(passionShell(D), poseOf('maracuja', k)),
  maracujaPolpa: (D, k) => applyPose(passionPulp(D), poseOf('maracuja', k)),
  gipsofila: (D, k) => gypsophila(D, k),
  lavanda: (D, k) => lavender(D, k),
  eucalipto: (D, k) => eucalyptus(D, k),
  prensada: (D, k) => decal(k),
  suculenta: (D, k) => succulent(D, k),
  girassol: (D, k) => sunflowerPetals(D, k),
  girassolMiolo: (D, k) => sunflowerCore(D, k),
};

/* ───────── Peças ─────────
   id → partes de cada variante: { mesh (nome em MESHES), mat, tint (cor por instância), cast }. */

const cycle = (tints) => (p, i) => tints[i % tints.length];
const PIECES = {
  morangosfrescos: [{ mesh: 'morangoCorpo', mat: (lib) => lib.mat.strawberry(), tint: cycle(BERRY_TINTS) }, { mesh: 'morangoCalice', mat: leafy }],
  framboesas: [{ mesh: 'framboesa', mat: velvet, tint: cycle(['#ffffff', '#ffe4ea', '#f3d3d8', '#fff0e6']) }],
  mirtilos: [{ mesh: 'mirtilos', mat: bloomSkin, tint: cycle(['#ffffff', '#e6eaff', '#d9dcf4']) }],
  amoras: [{ mesh: 'amora', mat: fruitSkin, tint: cycle(['#ffffff', '#f4e4f0', '#ffe9ec']) }],
  uvas: [{ mesh: 'uvas', mat: grapeSkin, tint: grapeTint }, { mesh: 'uvasCabo', mat: leafy, cast: false }],
  figos: [{ mesh: 'figoCasca', mat: leafy }, { mesh: 'figoFace', mat: (lib) => painted(lib, 'figo', drawFig, { rough: 0.4 }), cast: false }],
  physalis: [{ mesh: 'physalis', mat: fruitSkin, tint: cycle(['#ffffff', '#fff0dc', '#ffe6d0']) }, { mesh: 'physalisCapa', mat: leafy }],
  kiwi: [{ mesh: 'kiwi', mat: (lib) => painted(lib, 'kiwi', drawKiwi, { rough: 0.46 }) }],
  laranja: [{ mesh: 'laranja', mat: (lib) => painted(lib, 'laranja', drawOrange, { alpha: true, rough: 0.5, emissive: 0.24 }) }],
  limao: [{ mesh: 'limao', mat: (lib) => painted(lib, 'limao', drawLemon, { rough: 0.42 }) }],
  maracuja: [{ mesh: 'maracujaCasca', mat: fruitSkin }, { mesh: 'maracujaPolpa', mat: candy, cast: false }],
  gipsofila: [{ mesh: 'gipsofila', mat: leafy }],
  lavanda: [{ mesh: 'lavanda', mat: leafy }],
  eucalipto: [{ mesh: 'eucalipto', mat: foliage }],
  prensadas: [(k) => ({ mesh: 'prensada', mat: (lib) => pressedMat(lib, k), cast: false })],
  suculentas: [{ mesh: 'suculenta', mat: cream, tint: (p, i, r, color) => shift(pick(tintsOf(color || '#7fae8a'), r), 0, 1.04, -0.09) }],
  girassois: [{ mesh: 'girassol', mat: creamLeaf, tint: cycle(['#ffffff', '#fff2d2', '#ffe8bd']) }, { mesh: 'girassolMiolo', mat: chocolate, cast: false }],
};

/** Quais malhas formam cada peça (para os testes de triângulos e de cobertura das esferas de ocupação). */
export const SHAPES = Object.fromEntries(Object.entries(PIECES).map(([id, parts]) => [id, parts.map((p) => (typeof p === 'function' ? p(0) : p).mesh)]));

export const BUILDERS = Object.fromEntries(
  Object.entries(PIECES).map(([id, parts]) => [
    id,
    (ctx, part) =>
      drawKit(
        ctx,
        part,
        id,
        varsOf(id).map((_, k) => ({
          parts: parts.map((pt) => {
            const { mesh, ...more } = typeof pt === 'function' ? pt(k) : pt;
            return { geo: (lib) => lib.shape(`pf-${mesh}${k}`, () => MESHES[mesh](lib.detail, k)), sink: 0, ...more };
          }),
        })),
      ),
  ]),
);
