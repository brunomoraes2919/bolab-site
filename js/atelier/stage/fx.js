// BOLAB — Ateliê / Cena: utensílios do confeiteiro (espátula reta e angular, raspador, saco de confeitar com
// bico, bisnaga, faca, fósforo) e partículas (fumaça das velas, poeira de luz da revelação, confete, gotinhas).
// Tudo procedural e pequeno: cada utensílio tem de 150 a 700 triângulos e só existe depois que uma animação
// precisa dele. Proporção e material de utensílio de verdade: lâmina de aço fina com a ponta redonda, cabo de
// madeira ovalado com virola e rebites, saco de pano com as dobras da mão que aperta.
import * as THREE from 'three';

const TAU = Math.PI * 2;

/** Bolinha macia (branco no meio, transparente na borda) para fumaça, brilho e luz. */
export function softDotTexture(size = 64, { hard = 0.15 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(hard, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.28)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Grão de luz da revelação: um miolo pequeno e aceso, um halo largo e fraco e dois raios finíssimos. */
export function sparkTexture(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const h = size / 2;
  const halo = g.createRadialGradient(h, h, 0, h, h, h);
  halo.addColorStop(0, 'rgba(255,255,255,1)');
  halo.addColorStop(0.1, 'rgba(255,255,255,0.8)');
  halo.addColorStop(0.24, 'rgba(255,255,255,0.2)');
  halo.addColorStop(0.6, 'rgba(255,255,255,0.045)');
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'lighter';
  [0, Math.PI / 2].forEach((rot) => {
    g.save();
    g.translate(h, h);
    g.rotate(rot);
    const ray = g.createLinearGradient(-h, 0, h, 0);
    ray.addColorStop(0, 'rgba(255,255,255,0)');
    ray.addColorStop(0.5, 'rgba(255,255,255,0.5)');
    ray.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = ray;
    g.beginPath();
    g.moveTo(-h * 0.92, 0);
    g.quadraticCurveTo(0, -size * 0.016, h * 0.92, 0);
    g.quadraticCurveTo(0, size * 0.016, -h * 0.92, 0);
    g.fill();
    g.restore();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ───────── Peças dos utensílios ───────── */

/** Aço escovado: riscas finas, quase paralelas, de claro e de escuro (a cor do material é multiplicada por elas). */
function brushedTexture() {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  let seed = 19;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let x = 0; x < S; x++) {
    const line = 222 + rnd() * 30;
    for (let y = 0; y < S; y++) {
      const v = line + (rnd() - 0.5) * 9;
      const o = (y * S + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.max(0, Math.min(255, v));
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(9, 1);
  return t;
}
/**
 * Lâmina de aço não é espelho chapado: a face é levemente abaulada e a luz corre por ela. Inclina as normais
 * das faces largas ao longo da largura (eixo `axis`, do meio `mid`, meia-largura `half`) — o reflexo vira um degradê.
 */
function crownNormals(geo, axis, mid, half, amount = 0.3, thin = 'z') {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(nor, i);
    if (Math.abs(v[thin]) < 0.8) continue; // só as faces largas
    const k = (pos[`get${axis.toUpperCase()}`](i) - mid) / half;
    v[axis] += amount * Math.max(-1, Math.min(1, k)) * Math.sign(v[thin]);
    v.normalize();
    nor.setXYZ(i, v.x, v.y, v.z);
  }
  nor.needsUpdate = true;
  return geo;
}

/**
 * Lâmina fina ao longo de Y: fatias de baixo (ponta) para cima, cada uma com a meia-largura w(y), o desvio
 * z(y) (o degrau da espátula angular) e a espessura. As bordas saem vivas (faces separadas das laterais).
 */
function bladeGeo(rows, thick) {
  const pos = [];
  const idx = [];
  const h = thick / 2;
  const n = rows.length;
  // faces de cima (+z) e de baixo (−z)
  [1, -1].forEach((sgn) => {
    const base = pos.length / 3;
    rows.forEach(([y, w, z = 0]) => pos.push(-w, y, z + h * sgn, w, y, z + h * sgn));
    for (let i = 0; i < n - 1; i++) {
      const a = base + i * 2;
      if (sgn > 0) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  // os dois cantos (fio da lâmina)
  [-1, 1].forEach((side) => {
    const base = pos.length / 3;
    rows.forEach(([y, w, z = 0]) => pos.push(w * side, y, z + h, w * side, y, z - h));
    for (let i = 0; i < n - 1; i++) {
      const a = base + i * 2;
      if (side > 0) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const uv = [];
  for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] * 1.6, pos[i + 1]);
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return crownNormals(geo, 'x', 0, 0.08, 0.34);
}
/** Fatias de uma lâmina de espátula: ponta redonda, corpo quase paralelo, estreitando até a espiga. */
function spatulaRows(len, half, { step = 0, stepAt = 0 } = {}) {
  const rows = [];
  const tipR = half;
  for (let i = 0; i <= 7; i++) {
    const a = (i / 7) * (Math.PI / 2);
    rows.push([-len / 2 + tipR * (1 - Math.cos(a)), tipR * Math.sin(a) * 0.999 + 0.001]);
  }
  const body = 12;
  for (let i = 1; i <= body; i++) {
    const t = i / body;
    const y = -len / 2 + tipR + t * (len - tipR);
    // estreita só no terço final, até a largura da espiga
    const w = half * (1 - 0.62 * Math.max(0, (t - 0.72) / 0.28) ** 1.6);
    rows.push([y, w]);
  }
  if (step) {
    rows.forEach((row) => {
      const k = Math.min(1, Math.max(0, (row[0] - stepAt) / 0.11));
      row[2] = step * k * k * (3 - 2 * k);
    });
  }
  return rows;
}
/** Cabo torneado ao longo de Y (de y0 a y1), ovalado: mais largo que alto. */
function gripGeo(y0, y1, r, seg) {
  const L = y1 - y0;
  const pts = [
    [0.001, 0],
    [r * 0.78, 0],
    [r * 0.84, L * 0.03],
    [r * 0.86, L * 0.3],
    [r, L * 0.62],
    [r * 0.96, L * 0.86],
    [r * 0.74, L * 0.96],
    [r * 0.36, L * 0.995],
    [0.001, L],
  ].map(([x, y]) => new THREE.Vector2(x, y0 + y));
  const geo = new THREE.LatheGeometry(pts, seg);
  geo.scale(1, 1, 0.68);
  return geo;
}

/**
 * Os utensílios. Cada um é um grupo criado na primeira vez que é pedido e guardado; `tools.hide()` esconde
 * todos. Eixos de cada um (para quem posiciona):
 *   spatula  +Y da ponta da lâmina para o cabo · a lâmina é fina em Z · origem no meio da lâmina
 *   offset   espátula angular: como a spatula, com o cabo num degrau para +Z (a mão fica acima do creme)
 *   scraper  a aresta que trabalha é a de −X · +Y para cima · origem no meio da aresta que trabalha
 *   bag      origem na ponta do bico · +Y sobe pelo saco
 *   bottle   origem na ponta do bico · +Y sobe pela bisnaga
 *   knife    origem no meio do fio · +Y para cima (dorso) · o comprimento da lâmina vai em Z
 *   match    origem na cabeça do fósforo · +Y segue pelo palito
 */
export function createTools(tier) {
  const made = {};
  const owned = [];
  const low = tier.detail < 1;
  const seg = low ? 16 : 20;
  const own = (x) => {
    owned.push(x);
    return x;
  };
  const cache = {};
  const mat = (name, make) => () => (cache[name] ||= own(make()));
  const mats = {
    // aço inox polido (a luz do ambiente do motor faz o resto)
    metal: mat('metal', () => new THREE.MeshStandardMaterial({ color: 0xf2f4f7, map: own(brushedTexture()), metalness: 0.8, roughness: 0.3, emissive: 0x5c6068, emissiveIntensity: 0.26 })),
    // cabo de madeira envernizada
    handle: mat('handle', () => new THREE.MeshStandardMaterial({ color: 0x9a6338, roughness: 0.42, metalness: 0 })),
    // pano do saco de confeitar e plástico da bisnaga
    cloth: mat('cloth', () => new THREE.MeshStandardMaterial({ color: 0xfbf6ee, roughness: 0.7, metalness: 0 })),
    plastic: mat('plastic', () => new THREE.MeshStandardMaterial({ color: 0xf6f1e8, roughness: 0.36, metalness: 0 })),
    accent: mat('accent', () => new THREE.MeshStandardMaterial({ color: 0xd9486f, roughness: 0.4, metalness: 0 })),
    stick: mat('stick', () => new THREE.MeshStandardMaterial({ color: 0xe2c79c, roughness: 0.7, metalness: 0 })),
    head: mat('head', () => new THREE.MeshStandardMaterial({ color: 0x7c2a22, roughness: 0.8, metalness: 0 })),
  };
  const part = (geo, material, x = 0, y = 0, z = 0) => {
    const ms = new THREE.Mesh(own(geo), material);
    ms.position.set(x, y, z);
    ms.castShadow = false;
    ms.receiveShadow = false;
    return ms;
  };
  const lathe = (pts, n = seg) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), n);
  /** Lâmina, espiga, virola e cabo com dois rebites — a espátula reta e a angular são a mesma peça. */
  function spatulaOf(step) {
    const g = new THREE.Group();
    const len = 0.7;
    const rows = spatulaRows(len, 0.078, { step, stepAt: len / 2 - 0.2 });
    const blade = part(bladeGeo(rows, 0.006), mats.metal());
    const y0 = len / 2 - 0.01;
    const ferrule = part(lathe([[0.001, 0], [0.036, 0], [0.039, 0.006], [0.039, 0.04], [0.036, 0.046], [0.001, 0.046]]), mats.metal(), 0, y0, step);
    ferrule.scale.z = 0.68;
    const grip = part(gripGeo(0, 0.37, 0.047, seg), mats.handle(), 0, y0 + 0.044, step);
    g.add(blade, ferrule, grip);
    [0.13, 0.26].forEach((dy) => {
      const rivet = part(new THREE.CylinderGeometry(0.0085, 0.0085, 0.066, 10), mats.metal(), 0, y0 + 0.044 + dy, step);
      rivet.rotation.x = Math.PI / 2;
      g.add(rivet);
    });
    return g;
  }
  const builders = {
    spatula: () => spatulaOf(0),
    offset: () => spatulaOf(0.085),
    scraper() {
      // raspador de bancada: chapa de aço de cantos arredondados com o cabo de madeira numa das bordas
      const g = new THREE.Group();
      const w = 0.42;
      const h = 0.78;
      const r = 0.03;
      const shape = new THREE.Shape();
      shape.moveTo(0, -h / 2 + r * 0.4);
      shape.quadraticCurveTo(0, -h / 2, r * 0.4, -h / 2);
      shape.lineTo(w - r, -h / 2);
      shape.quadraticCurveTo(w, -h / 2, w, -h / 2 + r);
      shape.lineTo(w, h / 2 - r);
      shape.quadraticCurveTo(w, h / 2, w - r, h / 2);
      shape.lineTo(r * 0.4, h / 2);
      shape.quadraticCurveTo(0, h / 2, 0, h / 2 - r * 0.4);
      shape.closePath();
      const plateGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.007, bevelEnabled: true, bevelThickness: 0.0016, bevelSize: 0.0016, bevelSegments: 1, curveSegments: low ? 3 : 5 });
      plateGeo.translate(0, 0, -0.0035);
      crownNormals(plateGeo, 'x', w / 2, w / 2, 0.3);
      const plate = part(plateGeo, mats.metal());
      const grip = part(new THREE.CapsuleGeometry(0.043, h - 0.1, low ? 3 : 5, seg), mats.handle(), w - 0.012, 0, 0);
      grip.scale.z = 0.8;
      g.add(plate, grip);
      [-0.24, 0, 0.24].forEach((y) => {
        const rivet = part(new THREE.CylinderGeometry(0.01, 0.01, 0.074, 10), mats.metal(), w - 0.012, y, 0);
        rivet.rotation.x = Math.PI / 2;
        g.add(rivet);
      });
      return g;
    },
    bag() {
      // saco de confeitar: bico de aço em estrela, anel adaptador, o pano cheio de creme e torcido em cima
      const g = new THREE.Group();
      const teeth = 8;
      const tipGeo = lathe(
        [
          [0.016, 0],
          [0.02, 0.012],
          [0.03, 0.07],
          [0.046, 0.15],
          [0.05, 0.17],
        ],
        teeth * 2,
      );
      // a boca do bico é recortada em dentes (bico pitanga): um sim, um não, os anéis de baixo fecham
      const tp = tipGeo.attributes.position;
      for (let i = 0; i < tp.count; i++) {
        const y = tp.getY(i);
        if (y > 0.02) continue;
        const a = Math.atan2(tp.getX(i), tp.getZ(i));
        const tooth = Math.round((a / TAU) * teeth * 2) % 2 === 0 ? 1 : 0.5;
        tp.setX(i, tp.getX(i) * tooth);
        tp.setZ(i, tp.getZ(i) * tooth);
      }
      tipGeo.computeVertexNormals();
      const tip = part(tipGeo, mats.metal());
      tip.material.side = THREE.DoubleSide;
      const ring = part(lathe([[0.049, 0.15], [0.058, 0.153], [0.06, 0.19], [0.055, 0.2], [0.05, 0.2]]), mats.plastic());
      const bodyGeo = lathe(
        [
          [0.05, 0.19],
          [0.064, 0.24],
          [0.1, 0.36],
          [0.14, 0.5],
          [0.158, 0.61],
          [0.15, 0.7],
          [0.112, 0.79],
          [0.058, 0.855],
          [0.036, 0.885],
          [0.05, 0.93],
          [0.085, 0.985],
          [0.1, 1.02],
        ],
        28, // as dobras precisam de gomos bastantes, senão o pano fica facetado
      );
      // dobras do pano: nascem onde a mão torce o saco e somem para baixo, onde o creme estica o pano
      const bp = bodyGeo.attributes.position;
      for (let i = 0; i < bp.count; i++) {
        const y = bp.getY(i);
        const a = Math.atan2(bp.getX(i), bp.getZ(i));
        const k = Math.max(0, (y - 0.5) / 0.5);
        const fold = 1 + 0.2 * k * k * Math.sin(a * 7 + y * 9) + 0.07 * k * Math.sin(a * 13 - y * 5);
        bp.setX(i, bp.getX(i) * fold);
        bp.setZ(i, bp.getZ(i) * fold);
      }
      bodyGeo.computeVertexNormals();
      const body = part(bodyGeo, mats.cloth());
      body.material.side = THREE.DoubleSide;
      g.add(tip, ring, body);
      return g;
    },
    bottle() {
      // bisnaga de calda: bico cônico fino, tampa de rosca e o corpo macio de ombros redondos
      const g = new THREE.Group();
      const nozzle = part(lathe([[0.008, 0], [0.012, 0.004], [0.028, 0.12], [0.03, 0.13]]), mats.accent());
      const cap = part(lathe([[0.03, 0.13], [0.052, 0.134], [0.055, 0.14], [0.055, 0.176], [0.05, 0.18]]), mats.accent());
      const body = part(
        lathe([
          [0.05, 0.178],
          [0.058, 0.186],
          [0.082, 0.215],
          [0.09, 0.25],
          [0.09, 0.5],
          [0.086, 0.525],
          [0.07, 0.54],
          [0.001, 0.545],
        ]),
        mats.plastic(),
      );
      g.add(nozzle, cap, body);
      return g;
    },
    knife() {
      // faca de bolo: lâmina longa de dorso reto com a ponta caindo, guarda de aço e cabo de madeira rebitado
      const g = new THREE.Group();
      const shape = new THREE.Shape();
      shape.moveTo(-0.55, 0);
      shape.lineTo(0.42, 0);
      shape.quadraticCurveTo(0.56, 0.012, 0.63, 0.085);
      shape.quadraticCurveTo(0.56, 0.146, 0.4, 0.15);
      shape.lineTo(-0.55, 0.15);
      shape.closePath();
      const bladeG = new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.012, bevelSegments: 1, curveSegments: low ? 5 : 9 });
      bladeG.translate(0, 0, -0.002);
      crownNormals(bladeG, 'y', 0.075, 0.075, 0.42);
      const blade = part(bladeG, mats.metal());
      blade.rotation.y = Math.PI / 2;
      const guard = part(new THREE.BoxGeometry(0.03, 0.17, 0.035), mats.metal(), 0, 0.078, 0.575);
      const gripG = gripGeo(0, 0.36, 0.062, seg);
      gripG.rotateX(Math.PI / 2);
      gripG.scale(0.5, 1, 1);
      const grip = part(gripG, mats.handle(), 0, 0.078, 0.59);
      g.add(blade, guard, grip);
      [0.69, 0.79, 0.88].forEach((z) => {
        const rivet = part(new THREE.CylinderGeometry(0.0095, 0.0095, 0.05, 10), mats.metal(), 0, 0.078, z);
        rivet.rotation.z = Math.PI / 2;
        g.add(rivet);
      });
      return g;
    },
    match() {
      // fósforo longo de cozinha: palito quadrado de madeira clara e a cabeça
      const g = new THREE.Group();
      const stick = part(new THREE.BoxGeometry(0.016, 0.5, 0.016), mats.stick(), 0, 0.262, 0);
      const head = part(new THREE.SphereGeometry(0.017, 12, 10), mats.head(), 0, 0.012, 0);
      head.scale.y = 1.45;
      g.add(stick, head);
      return g;
    },
  };
  return {
    mats,
    get(name, parent) {
      if (!made[name]) {
        made[name] = builders[name]();
        made[name].name = `ferramenta:${name}`;
        made[name].visible = false;
      }
      if (parent && made[name].parent !== parent) parent.add(made[name]);
      return made[name];
    },
    hide() {
      Object.values(made).forEach((g) => (g.visible = false));
    },
    dispose() {
      Object.values(made).forEach((g) => g.parent?.remove(g));
      owned.forEach((o) => o.dispose());
    },
  };
}

/** Aponta o eixo +Y de um objeto para uma direção (com um giro em torno dele). */
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
export function aimY(object, dx, dy, dz, twist = 0) {
  _dir.set(dx, dy, dz).normalize();
  object.quaternion.setFromUnitVectors(_up, _dir);
  if (twist) object.quaternion.multiply(_q.setFromAxisAngle(_up, twist));
}

/* ───────── Fumaça fina das velas ───────── */
export function createSmoke(scene, tex, max = 24) {
  const puffs = [];
  let live = 0;
  const make = () => {
    const mat = new THREE.SpriteMaterial({ map: tex, color: 0xdfe0e4, transparent: true, opacity: 0, depthWrite: false });
    const sp = new THREE.Sprite(mat);
    sp.visible = false;
    sp.renderOrder = 6;
    scene.add(sp);
    return { sp, mat, t: -1, life: 1, x: 0, y: 0, z: 0, seed: 0 };
  };
  return {
    /** Um fio de fumaça subindo de (x, y, z) — em coordenadas do mundo. */
    emit(x, y, z, delay = 0, count = 3) {
      for (let i = 0; i < count; i++) {
        let p = puffs.find((q) => q.t < 0);
        if (!p) {
          if (puffs.length >= max) return;
          p = make();
          puffs.push(p);
        }
        Object.assign(p, { t: 0, wait: delay + i * 0.16, life: 1.05 + i * 0.12, x, y, z, seed: Math.random() * TAU });
        live++;
      }
    },
    tick(dt) {
      if (!live) return false;
      live = 0;
      puffs.forEach((p) => {
        if (p.t < 0) return;
        if (p.wait > 0) {
          p.wait -= dt;
          live++;
          return;
        }
        p.t += dt;
        const k = p.t / p.life;
        if (k >= 1) {
          p.t = -1;
          p.sp.visible = false;
          return;
        }
        live++;
        const rise = 0.62 * (1 - (1 - k) ** 1.7);
        p.sp.visible = true;
        p.sp.position.set(p.x + Math.sin(p.seed + k * 5.2) * 0.05 * k, p.y + rise, p.z + Math.cos(p.seed * 1.7 + k * 4.1) * 0.05 * k);
        const s = 0.045 + 0.2 * k;
        p.sp.scale.set(s, s * 1.5, 1);
        p.mat.opacity = 0.34 * Math.sin(Math.PI * Math.min(1, k * 1.15)) ** 0.8;
      });
      return live > 0;
    },
    clear() {
      puffs.forEach((p) => {
        p.t = -1;
        p.sp.visible = false;
      });
      live = 0;
    },
    dispose() {
      puffs.forEach((p) => {
        scene.remove(p.sp);
        p.mat.dispose();
      });
      puffs.length = 0;
    },
  };
}

/* ───────── Poeira de luz da revelação ─────────
   Grãos dourados suspensos no facho de luz: a maioria miúda e quase parada, alguns maiores e fora de foco,
   poucos que cintilam de verdade. Sobem devagar, em espiral aberta, e piscam cada um no seu tempo. */
export function createSparkles(scene, tex, count = 40) {
  const pos = new Float32Array(count * 3);
  const look = new Float32Array(count * 2); // tamanho · brilho
  const seeds = new Float32Array(count * 5);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aLook', new THREE.BufferAttribute(look, 2));
  const uniforms = { map: { value: tex }, uScale: { value: 400 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec2 aLook;
      uniform float uScale;
      varying float vGlow;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aLook.x * uScale / max(0.1, -mv.z);
        vGlow = aLook.y;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      varying float vGlow;
      void main() {
        float a = texture2D(map, gl_PointCoord).r * vGlow;
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.6) * a, 0.0);
      }`,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.visible = false;
  pts.renderOrder = 8;
  // o tamanho na tela acompanha a altura do quadro e a abertura da câmera
  const _size = new THREE.Vector2();
  pts.onBeforeRender = (renderer, sc, camera) => {
    renderer.getDrawingBufferSize(_size);
    uniforms.uScale.value = _size.y * 0.5 * camera.projectionMatrix.elements[5];
  };
  scene.add(pts);
  let box = { r0: 1, r1: 2, y0: 0, y1: 2, cx: 0, cz: 0 };
  let t = 0;
  let level = 0;
  for (let i = 0; i < count; i++) {
    seeds[i * 5] = Math.random() * TAU; // ângulo
    seeds[i * 5 + 1] = Math.random(); // raio
    seeds[i * 5 + 2] = Math.random(); // altura
    seeds[i * 5 + 3] = Math.random() * TAU; // fase do pisca
    // de cada 9, um grão maior e macio (fora de foco); de cada 5, um que cintila; o resto é poeira fina
    seeds[i * 5 + 4] = i % 9 === 4 ? 2 : i % 5 === 0 ? 1 : 0;
  }
  return {
    object: pts,
    place(next) {
      box = next;
    },
    /** level 0…1 = quanto do brilho está aceso (entra e sai aos poucos). */
    set(lv) {
      level = lv;
      pts.visible = lv > 0.002;
    },
    tick(dt) {
      if (!pts.visible) return false;
      t += dt;
      for (let i = 0; i < count; i++) {
        const kind = seeds[i * 5 + 4];
        const a = seeds[i * 5] + t * (0.08 + 0.06 * seeds[i * 5 + 1]);
        const r = box.r0 + (box.r1 - box.r0) * seeds[i * 5 + 1];
        const up = (seeds[i * 5 + 2] + t * (kind === 2 ? 0.02 : 0.035)) % 1;
        pos[i * 3] = box.cx + Math.cos(a) * r;
        pos[i * 3 + 1] = box.y0 + (box.y1 - box.y0) * up;
        pos[i * 3 + 2] = box.cz + Math.sin(a) * r;
        const wave = Math.sin(t * (1.1 + (i % 5) * 0.3) + seeds[i * 5 + 3]);
        const tw = kind === 1 ? Math.max(0, wave) ** 6 : 0.55 + 0.45 * wave;
        const edge = Math.sin(Math.PI * up) ** 0.6; // nasce e some nas pontas da subida
        look[i * 2] = kind === 2 ? 0.13 : kind === 1 ? 0.24 : 0.06 + 0.04 * seeds[i * 5 + 1];
        look[i * 2 + 1] = level * edge * (kind === 2 ? 0.07 : kind === 1 ? 0.9 * tw : 0.6 * tw);
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aLook.needsUpdate = true;
      return true;
    },
    dispose() {
      scene.remove(pts);
      geo.dispose();
      mat.dispose();
    },
  };
}

/* ───────── Confete ─────────
   Papel de seda e papel metalizado, em três cortes (retângulo, quadradinho e serpentina), cada pedaço
   levemente enrolado — não é uma chapa. Cada um tem frente e verso (o verso é mais claro), pega a luz
   conforme vira e os metalizados soltam um lampejo. Meia dúzia passa perto da lente, grande e fora de foco. */
const PAPER = ['#f0527a', '#f7b7c8', '#ffd166', '#fff3e0', '#8fd3c8', '#c9a0dc', '#ff9f6b'];
const FOIL = ['#f2cf7e', '#f6c9b8', '#e9e4dc'];
export function createConfetti(scene, count = 110, { dot = null } = {}) {
  // um pedaço: tira de 1 × 1 em quatro gomos, enrolada como papel que saiu do canhão
  const geo = new THREE.PlaneGeometry(1, 1, 1, 4);
  const gp = geo.attributes.position;
  for (let i = 0; i < gp.count; i++) {
    const y = gp.getY(i);
    gp.setZ(i, 0.42 * y * y - 0.035);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: false });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.castShadow = false;
  mesh.renderOrder = 7;
  scene.add(mesh);
  // os que passam perto da lente: discos macios, poucos
  const nearCount = dot ? 5 : 0;
  let near = null;
  let nearMat = null;
  let nearGeo = null;
  if (nearCount) {
    nearGeo = new THREE.PlaneGeometry(1, 1);
    nearMat = new THREE.MeshBasicMaterial({ map: dot, color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, depthTest: false, toneMapped: false });
    near = new THREE.InstancedMesh(nearGeo, nearMat, nearCount);
    near.frustumCulled = false;
    near.visible = false;
    near.renderOrder = 9;
    scene.add(near);
  }
  const P = [];
  const N = [];
  const base = PAPER.map((h) => new THREE.Color(h));
  const foil = FOIL.map((h) => new THREE.Color(h));
  const white = new THREE.Color(0xffffff);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  const lightDir = new THREE.Vector3(-0.4, 0.82, 0.4).normalize();
  let t = -1;
  let dur = 2.6;
  let floorY = -1;
  let faceCam = null;
  return {
    object: mesh,
    /**
     * Dispara: dois canhões (à esquerda e à direita de quem olha) e uma chuva fina por cima.
     * right/back = vetores do mundo da câmera deitados no chão; center = meio do bolo; top = altura do topo;
     * camera = a câmera (para os pedaços que passam perto da lente).
     */
    burst({ center, top, right, back, ground, spread = 1.4, seconds = 2.6, camera = null }) {
      P.length = 0;
      N.length = 0;
      floorY = ground;
      dur = seconds;
      faceCam = camera;
      for (let i = 0; i < count; i++) {
        const side = i % 3 === 2 ? 0 : i % 2 ? 1 : -1;
        const from = new THREE.Vector3();
        const vel = new THREE.Vector3();
        if (side) {
          from.copy(center).addScaledVector(right, side * spread * 1.25).addScaledVector(back, -0.5);
          from.y = top * 0.25;
          vel.copy(right).multiplyScalar(-side * (0.7 + Math.random() * 1.4)).addScaledVector(back, (Math.random() - 0.3) * 1.2);
          vel.y = 3.4 + Math.random() * 2.4;
        } else {
          from.copy(center).addScaledVector(right, (Math.random() - 0.5) * spread * 2.2).addScaledVector(back, (Math.random() - 0.5) * spread * 1.6);
          from.y = top + 1.1 + Math.random() * 0.8;
          vel.set((Math.random() - 0.5) * 0.5, -0.2 - Math.random() * 0.5, (Math.random() - 0.5) * 0.5);
        }
        // corte: de cada 7, uma serpentina; de cada 3, um quadradinho; o resto, retângulo
        const kind = i % 7 === 3 ? 2 : i % 3 === 0 ? 1 : 0;
        const k = 0.8 + Math.random() * 0.5;
        const size = kind === 2 ? [0.026 * k, 0.26 * k] : kind === 1 ? [0.058 * k, 0.058 * k] : [0.05 * k, 0.088 * k];
        const shiny = i % 4 === 1;
        P.push({
          p: from,
          v: vel,
          wait: side ? Math.random() * 0.12 : 0.15 + Math.random() * 0.7,
          rot: new THREE.Vector3(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU),
          spin: new THREE.Vector3((Math.random() - 0.5) * (kind === 2 ? 7 : 15), (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 8),
          sway: Math.random() * TAU,
          col: shiny ? foil[i % foil.length] : base[i % base.length],
          shiny,
          size,
          drag: kind === 2 ? 1.5 : 1.9 + Math.random() * 0.6,
          fall: kind === 2 ? 1.5 : 0.95 + Math.random() * 0.4,
          rest: false,
        });
      }
      if (near && camera) {
        // entre a lente e o bolo, a um terço do caminho: caem devagar, atravessando o quadro
        const toCam = v.copy(camera.position).sub(center);
        for (let i = 0; i < nearCount; i++) {
          const d = 0.5 + Math.random() * 0.22;
          // pelos lados do quadro, nunca na frente do bolo
          const p = new THREE.Vector3().copy(center).addScaledVector(toCam, d).addScaledVector(right, (i % 2 ? 1 : -1) * (0.75 + Math.random() * 0.8) * (1 - d) * 2.2);
          p.y += 0.8 + Math.random() * 1.6;
          N.push({ p, vy: -(0.5 + Math.random() * 0.5), vx: (Math.random() - 0.5) * 0.3, wait: 0.2 + Math.random() * 0.9, size: 0.13 + Math.random() * 0.1, col: (i % 3 ? base : foil)[i % 3] });
          near.setColorAt(i, N[i].col);
        }
        if (near.instanceColor) near.instanceColor.needsUpdate = true;
        near.visible = true;
        nearMat.opacity = 0;
      }
      t = 0;
      mesh.visible = true;
    },
    tick(dt) {
      if (t < 0) return false;
      t += dt;
      const fade = Math.min(1, Math.max(0, (dur - t) / 0.45));
      for (let i = 0; i < count; i++) {
        const o = P[i];
        let k = fade;
        if (o.wait > 0) {
          o.wait -= dt;
          k = 0;
        } else if (!o.rest) {
          // papel: a gravidade puxa, o ar segura (ele plana e balança; a serpentina cai mais reta)
          o.v.y -= 5.2 * dt;
          const drag = Math.exp(-o.drag * dt);
          o.v.x *= drag;
          o.v.z *= drag;
          if (o.v.y < -o.fall) o.v.y += (-o.fall - o.v.y) * Math.min(1, 6 * dt);
          o.sway += dt * 5.5;
          o.p.x += (o.v.x + Math.sin(o.sway) * 0.35) * dt;
          o.p.y += o.v.y * dt;
          o.p.z += (o.v.z + Math.cos(o.sway * 0.8) * 0.35) * dt;
          o.rot.addScaledVector(o.spin, dt);
          if (o.p.y <= floorY + 0.014) {
            o.p.y = floorY + 0.014;
            o.rest = true;
            o.rot.x = -Math.PI / 2;
            o.rot.y = 0;
          }
        }
        e.set(o.rot.x, o.rot.y, o.rot.z);
        q.setFromEuler(e);
        m4.compose(o.p, q, s.set(Math.max(o.size[0] * k, 1e-5), Math.max(o.size[1] * k, 1e-5), Math.max(o.size[1] * k, 1e-5)));
        mesh.setMatrixAt(i, m4);
        // papel virando: a face clareia e escurece conforme pega a luz; o verso é mais claro; o metalizado lampeja
        const facing = v.set(0, 0, 1).applyQuaternion(q).dot(lightDir);
        const lit = 0.62 + 0.38 * Math.abs(facing);
        c.copy(o.col);
        if (facing < 0) c.lerp(white, o.shiny ? 0.25 : 0.42);
        c.multiplyScalar(lit);
        if (o.shiny) c.lerp(white, Math.abs(facing) ** 14 * 0.9);
        mesh.setColorAt(i, c);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (near && near.visible) {
        nearMat.opacity = 0.62 * fade * Math.min(1, t / 0.4);
        if (faceCam) q.copy(faceCam.quaternion);
        for (let i = 0; i < N.length; i++) {
          const o = N[i];
          let k = 1;
          if (o.wait > 0) {
            o.wait -= dt;
            k = 0;
          } else {
            o.p.y += o.vy * dt;
            o.p.x += o.vx * dt;
          }
          m4.compose(o.p, q, s.setScalar(Math.max(o.size * k, 1e-5)));
          near.setMatrixAt(i, m4);
        }
        near.instanceMatrix.needsUpdate = true;
      }
      if (t >= dur) {
        t = -1;
        mesh.visible = false;
        if (near) near.visible = false;
        return false;
      }
      return true;
    },
    stop() {
      t = -1;
      mesh.visible = false;
      if (near) near.visible = false;
    },
    dispose() {
      scene.remove(mesh);
      mesh.dispose();
      geo.dispose();
      mat.dispose();
      if (near) {
        scene.remove(near);
        near.dispose();
        nearGeo.dispose();
        nearMat.dispose();
      }
    },
  };
}

/* ───────── Gotinhas (calda de molhar, a gota que pinga na borda) ───────── */
export function createDroplets(parent, material, count = 16) {
  const geo = new THREE.SphereGeometry(0.022, 8, 6);
  const mesh = new THREE.InstancedMesh(geo, material, count);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.castShadow = false;
  parent.add(mesh);
  const m4 = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const q = new THREE.Quaternion();
  return {
    object: mesh,
    count,
    /** Posição e tamanho da gota i (k = 0 some). */
    set(i, x, y, z, k = 1, stretch = 1) {
      m4.compose(p.set(x, y, z), q, s.set(Math.max(k, 1e-5), Math.max(k * stretch, 1e-5), Math.max(k, 1e-5)));
      mesh.setMatrixAt(i, m4);
    },
    show(on) {
      mesh.visible = on;
      if (!on) for (let i = 0; i < count; i++) this.set(i, 0, 0, 0, 0);
      mesh.instanceMatrix.needsUpdate = true;
    },
    flush() {
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      parent.remove(mesh);
      mesh.dispose();
      geo.dispose();
    },
  };
}
