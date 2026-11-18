// BOLAB — Ateliê / Cena: ferramentas do confeiteiro (espátula, raspador, saco de confeitar, bisnaga, faca) e
// partículas (fumaça das velas, brilhos da revelação, confete de papel, gotinhas). Tudo procedural e pequeno:
// as ferramentas somam ~1,2 mil triângulos e só existem enquanto uma animação precisa delas.
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

/** Estrelinha de quatro pontas (o brilho da revelação). */
export function sparkTexture(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const h = size / 2;
  const halo = g.createRadialGradient(h, h, 0, h, h, h);
  halo.addColorStop(0, 'rgba(255,255,255,1)');
  halo.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  halo.addColorStop(0.5, 'rgba(255,255,255,0.08)');
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
    ray.addColorStop(0.5, 'rgba(255,255,255,0.95)');
    ray.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = ray;
    g.beginPath();
    g.moveTo(-h, 0);
    g.quadraticCurveTo(0, -size * 0.045, h, 0);
    g.quadraticCurveTo(0, size * 0.045, -h, 0);
    g.fill();
    g.restore();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * As ferramentas. Cada uma é um grupo criado na primeira vez que é pedida e guardado; `tools.hide()` esconde
 * todas. Eixos de cada uma (para quem posiciona):
 *   spatula  +Y do bico da lâmina para o cabo · a lâmina é fina em Z · origem no meio da lâmina
 *   scraper  a aresta que trabalha é a de −X · +Y para cima · origem no meio da aresta que trabalha
 *   bag      origem na ponta do bico · +Y sobe pelo saco
 *   bottle   origem na ponta do bico · +Y sobe pela bisnaga
 *   knife    origem no meio do fio · +Y para cima (dorso) · o comprimento da lâmina vai em Z
 */
export function createTools(tier) {
  const made = {};
  const owned = [];
  const seg = tier.detail < 1 ? 10 : 16;
  const own = (x) => {
    owned.push(x);
    return x;
  };
  let metal = null;
  let handle = null;
  let cloth = null;
  const mats = {
    metal: () => (metal ||= own(new THREE.MeshStandardMaterial({ color: 0xf1f3f6, metalness: 0.55, roughness: 0.3, emissive: 0x5a5e66, emissiveIntensity: 0.3 }))),
    handle: () => (handle ||= own(new THREE.MeshStandardMaterial({ color: 0xd9486f, roughness: 0.5, metalness: 0 }))),
    cloth: () => (cloth ||= own(new THREE.MeshStandardMaterial({ color: 0xfdf8f1, roughness: 0.84, metalness: 0 }))),
  };
  const part = (geo, mat) => {
    const ms = new THREE.Mesh(own(geo), mat);
    ms.castShadow = false;
    ms.receiveShadow = false;
    return ms;
  };
  const builders = {
    spatula() {
      const g = new THREE.Group();
      const blade = part(new THREE.CapsuleGeometry(0.085, 0.52, 3, seg), mats.metal());
      blade.scale.set(1, 1, 0.08);
      const neck = part(new THREE.CylinderGeometry(0.018, 0.03, 0.1, 8), mats.metal());
      neck.position.y = 0.36;
      const grip = part(new THREE.CapsuleGeometry(0.04, 0.26, 3, seg), mats.handle());
      grip.position.y = 0.58;
      g.add(blade, neck, grip);
      return g;
    },
    scraper() {
      const g = new THREE.Group();
      const plate = part(new THREE.BoxGeometry(0.4, 0.78, 0.012), mats.metal());
      plate.position.x = 0.2;
      const grip = part(new THREE.CapsuleGeometry(0.042, 0.7, 3, seg), mats.handle());
      grip.position.x = 0.41;
      g.add(plate, grip);
      return g;
    },
    bag() {
      const g = new THREE.Group();
      const tip = part(new THREE.ConeGeometry(0.036, 0.11, seg, 1, true), mats.metal());
      tip.rotation.x = Math.PI;
      tip.position.y = 0.055;
      // o saco: um cone aberto, mais gordo no meio (cheio de creme), torcido em cima
      const pts = [
        [0.03, 0.08],
        [0.075, 0.2],
        [0.135, 0.4],
        [0.16, 0.56],
        [0.14, 0.7],
        [0.07, 0.8],
        [0.035, 0.84],
        [0.06, 0.92],
      ].map(([r, y]) => new THREE.Vector2(r, y));
      const body = part(new THREE.LatheGeometry(pts, seg), mats.cloth());
      g.add(tip, body);
      return g;
    },
    bottle() {
      const g = new THREE.Group();
      const nozzle = part(new THREE.ConeGeometry(0.03, 0.14, seg, 1, true), mats.cloth());
      nozzle.rotation.x = Math.PI;
      nozzle.position.y = 0.07;
      const body = part(new THREE.CapsuleGeometry(0.085, 0.3, 3, seg), mats.cloth());
      body.position.y = 0.36;
      const cap = part(new THREE.CylinderGeometry(0.05, 0.06, 0.05, seg), mats.handle());
      cap.position.y = 0.15;
      g.add(nozzle, body, cap);
      return g;
    },
    knife() {
      const g = new THREE.Group();
      // lâmina: um trapézio fino (o fio embaixo), com a ponta descendo
      const shape = new THREE.Shape();
      shape.moveTo(-0.55, 0);
      shape.lineTo(0.5, 0);
      shape.quadraticCurveTo(0.62, 0.05, 0.6, 0.15);
      shape.lineTo(-0.55, 0.15);
      shape.closePath();
      const blade = part(new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false }), mats.metal());
      blade.rotation.y = Math.PI / 2;
      blade.position.x = 0.006;
      const grip = part(new THREE.CapsuleGeometry(0.045, 0.3, 3, seg), mats.handle());
      grip.rotation.x = Math.PI / 2;
      grip.position.set(0, 0.085, 0.76);
      g.add(blade, grip);
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

/* ───────── Brilhos da revelação: pontinhos que acendem e apagam, subindo devagar ───────── */
export function createSparkles(scene, tex, count = 40) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ map: tex, size: 0.3, sizeAttenuation: true, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.visible = false;
  pts.renderOrder = 8;
  scene.add(pts);
  let box = { r0: 1, r1: 2, y0: 0, y1: 2, cx: 0, cz: 0 };
  let t = 0;
  let level = 0;
  const seedOne = (i) => {
    seeds[i * 4] = Math.random() * TAU; // ângulo
    seeds[i * 4 + 1] = Math.random(); // raio
    seeds[i * 4 + 2] = Math.random(); // altura
    seeds[i * 4 + 3] = Math.random() * TAU; // fase do pisca
  };
  for (let i = 0; i < count; i++) seedOne(i);
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
        const a = seeds[i * 4] + t * 0.12;
        const r = box.r0 + (box.r1 - box.r0) * seeds[i * 4 + 1];
        const up = (seeds[i * 4 + 2] + t * 0.045) % 1;
        pos[i * 3] = box.cx + Math.cos(a) * r;
        pos[i * 3 + 1] = box.y0 + (box.y1 - box.y0) * up;
        pos[i * 3 + 2] = box.cz + Math.sin(a) * r;
        const tw = Math.max(0, Math.sin(t * (1.6 + (i % 5) * 0.35) + seeds[i * 4 + 3])) ** 3;
        const edge = Math.sin(Math.PI * up) ** 0.6; // nasce e some nas pontas da subida
        const v = level * tw * edge;
        col[i * 3] = v;
        col[i * 3 + 1] = v * 0.9;
        col[i * 3 + 2] = v * 0.68;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      return true;
    },
    dispose() {
      scene.remove(pts);
      geo.dispose();
      mat.dispose();
    },
  };
}

/* ───────── Confete de papel ───────── */
const PAPER = ['#f0527a', '#f7b7c8', '#ffd166', '#fff3e0', '#8fd3c8', '#c9a0dc', '#ff9f6b'];
export function createConfetti(scene, count = 110) {
  const geo = new THREE.PlaneGeometry(0.085, 0.05);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: false });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.castShadow = false;
  mesh.renderOrder = 7;
  scene.add(mesh);
  const P = [];
  const base = PAPER.map((h) => new THREE.Color(h));
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  let t = -1;
  let dur = 2.6;
  let floorY = -1;
  return {
    object: mesh,
    /**
     * Dispara: dois canhões (à esquerda e à direita de quem olha) e uma chuva fina por cima.
     * right/back = vetores do mundo da câmera deitados no chão; center = meio do bolo; top = altura do topo.
     */
    burst({ center, top, right, back, ground, spread = 1.4, seconds = 2.6 }) {
      P.length = 0;
      floorY = ground;
      dur = seconds;
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
        P.push({ p: from, v: vel, wait: side ? Math.random() * 0.12 : 0.15 + Math.random() * 0.7, rot: new THREE.Vector3(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU), spin: new THREE.Vector3((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 9), sway: Math.random() * TAU, col: base[i % base.length], size: 0.75 + Math.random() * 0.6, rest: false });
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
        let k = fade * o.size;
        if (o.wait > 0) {
          o.wait -= dt;
          k = 0;
        } else if (!o.rest) {
          // papel: a gravidade puxa, o ar segura (ele plana e balança)
          o.v.y -= 5.2 * dt;
          const drag = Math.exp(-1.9 * dt);
          o.v.x *= drag;
          o.v.z *= drag;
          if (o.v.y < -1.15) o.v.y += (-1.15 - o.v.y) * Math.min(1, 6 * dt);
          o.sway += dt * 5.5;
          o.p.x += (o.v.x + Math.sin(o.sway) * 0.35) * dt;
          o.p.y += o.v.y * dt;
          o.p.z += (o.v.z + Math.cos(o.sway * 0.8) * 0.35) * dt;
          o.rot.addScaledVector(o.spin, dt);
          if (o.p.y <= floorY + 0.012) {
            o.p.y = floorY + 0.012;
            o.rest = true;
            o.rot.x = -Math.PI / 2;
            o.rot.y = 0;
          }
        }
        e.set(o.rot.x, o.rot.y, o.rot.z);
        q.setFromEuler(e);
        m4.compose(o.p, q, s.setScalar(Math.max(k, 1e-5)));
        mesh.setMatrixAt(i, m4);
        // papel virando: a face clareia e escurece conforme pega luz
        const shade = 0.72 + 0.28 * Math.abs(v.set(0, 0, 1).applyQuaternion(q).y);
        mesh.setColorAt(i, c.copy(o.col).multiplyScalar(shade));
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (t >= dur) {
        t = -1;
        mesh.visible = false;
        return false;
      }
      return true;
    },
    stop() {
      t = -1;
      mesh.visible = false;
    },
    dispose() {
      scene.remove(mesh);
      mesh.dispose();
      geo.dispose();
      mat.dispose();
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
