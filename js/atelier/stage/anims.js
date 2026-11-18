// BOLAB — Ateliê / Cena: as animações de preparo. Cada função devolve um "clipe":
//   { dur, cues, update(t), finish() }   t em segundos desde o começo; finish() deixa TUDO no estado final
// (é o que o skip() chama: nenhuma animação pode terminar com o bolo pela metade). Os instantes vêm de
// timeline() (choose.js), a mesma fonte das marcas de som — o que se vê e o que se ouve nascem dos mesmos números.
//
// Regras da casa: física plausível (cair acelera, pousar amassa e volta com um pouco de sobra, líquido escorre
// rápido e freia), nada quica mais de duas vezes, e o prato sempre termina exatamente onde começou.
import * as THREE from 'three';
import { timeline, decorStyle } from './choose.js';
import { aimY, createDroplets } from './fx.js';
import { buildCutFaces } from '../../customizer/geometry.js';
import { inWedge } from '../../customizer/decor.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeIn = (t) => t * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const backOut = (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
/** Oscilação que morre: 1 no instante 0, cruza o zero e some (o "volta com sobra" depois do amassado). */
const ring = (t, freq = 3.1, damp = 8.5) => Math.exp(-damp * t) * Math.cos(TAU * freq * t);
const wrapPi = (a) => {
  a %= TAU;
  if (a > Math.PI) a -= TAU;
  if (a < -Math.PI) a += TAU;
  return a;
};
const hash = (i) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _c = new THREE.Vector3();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _col = new THREE.Color();
const _m4 = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/* ───────── Cobertura varrida: prepara a malha para aparecer coluna por coluna ─────────
   A casca é varrida em volta do bolo (geometry.js → sweep): os índices da lateral vêm coluna por coluna e os
   do topo, depois. Aqui o topo passa para o começo da lista (assim "topo + n colunas" é um trecho só) e a
   lateral pode ser girada para começar na coluna que estiver debaixo da espátula. A malha desenhada é a mesma. */
function prepareSweep(geo) {
  if (geo.userData.r5sweep !== undefined) return geo.userData.r5sweep;
  let info = null;
  const lay = geo.userData.layout;
  const idx = geo.index;
  const g0 = geo.groups[0];
  if (lay && idx && g0 && g0.start === 0) {
    const n = lay.cols - 1;
    const per = g0.count / n;
    if (Number.isInteger(per) && per >= 6) {
      const side = g0.count;
      const g1 = geo.groups.find((g) => g.materialIndex === 1 && g.start === side);
      const top = g1 ? g1.count : 0;
      if (top) {
        const arr = idx.array;
        const sideSeg = arr.slice(0, side);
        const topSeg = arr.slice(side, side + top);
        arr.set(topSeg, 0);
        arr.set(sideSeg, top);
        const rest = geo.groups.filter((g) => g !== g0 && g !== g1).map((g) => ({ ...g }));
        geo.clearGroups();
        geo.addGroup(0, top, 1);
        geo.addGroup(top, side, 0);
        rest.forEach((g) => geo.addGroup(g.start, g.count, g.materialIndex));
        idx.needsUpdate = true;
      }
      info = { n, per, side, top, rows: lay.rows };
    }
  }
  geo.userData.r5sweep = info;
  return info;
}

/** Gira a lista de colunas da lateral para que a coluna j0 seja a primeira a aparecer. */
function rotateSide(geo, info, j0) {
  if (!j0) return;
  const arr = geo.index.array;
  const seg = arr.slice(info.top, info.top + info.side);
  const cut = j0 * info.per;
  arr.set(seg.subarray(cut), info.top);
  arr.set(seg.subarray(0, cut), info.top + info.side - cut);
  geo.index.needsUpdate = true;
}

/** Ângulo (em volta do centro do andar) de cada coluna, na ordem em que elas aparecem. */
function columnAngles(geo, info, center) {
  const arr = geo.index.array;
  const pos = geo.attributes.position;
  const out = new Float32Array(info.n + 1);
  let prev = 0;
  for (let j = 0; j <= info.n; j++) {
    const vid = arr[info.top + (j % info.n) * info.per];
    const a = Math.atan2(pos.getZ(vid) - center.z, pos.getX(vid) - center.x);
    out[j] = j ? prev + wrapPi(a - prev) : a;
    prev = out[j];
  }
  return out;
}

/** O creme no topo: um disco com a quina arredondada que nasce como uma colherada e se espalha até a borda. */
function buildBlob(t) {
  const n = t.topFlat.n;
  const flat = [0.28, 0.55, 0.8, 1];
  const fil = 4;
  const rings = flat.length + fil;
  const count = 1 + rings * n;
  const bx = new Float32Array(count);
  const bz = new Float32Array(count);
  const by = new Float32Array(count);
  const bu = new Float32Array(count);
  const uv = new Float32Array(count * 2);
  const cx = t.center.x;
  const cz = t.center.z;
  const capScale = 1 / (2.9 * t.R);
  bx[0] = cx;
  bz[0] = cz;
  let k = 1;
  for (let r = 0; r < rings; r++) {
    for (let i = 0; i < n; i++) {
      if (r < flat.length) {
        bx[k] = cx + (t.topFlat.x[i] - cx) * flat[r];
        bz[k] = cz + (t.topFlat.z[i] - cz) * flat[r];
        bu[k] = flat[r];
      } else {
        const a = ((r - flat.length + 1) / fil) * (Math.PI / 2);
        bx[k] = lerp(t.topFlat.x[i], t.frost.x[i], Math.sin(a));
        bz[k] = lerp(t.topFlat.z[i], t.frost.z[i], Math.sin(a));
        by[k] = -t.rf * (1 - Math.cos(a));
        bu[k] = 1;
      }
      k++;
    }
  }
  for (let i = 0; i < count; i++) {
    uv[i * 2] = (bx[i] - cx) * capScale + 0.5;
    uv[i * 2 + 1] = (bz[i] - cz) * capScale + 0.5;
  }
  const index = [];
  // (mesmo sentido da tampa da casca: a face olha para cima)
  for (let i = 0; i < n; i++) index.push(0, 1 + ((i + 1) % n), 1 + i);
  for (let r = 0; r < rings - 1; r++) {
    const a0 = 1 + r * n;
    const b0 = a0 + n;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      index.push(a0 + i, a0 + j, b0 + i, a0 + j, b0 + j, b0 + i);
    }
  }
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('uv1', new THREE.BufferAttribute(uv.slice(), 2));
  geo.setIndex(index);
  /** s = quanto do topo o creme já cobre (0…1) · bulge = altura da colherada no meio · lift = folga sobre o que há embaixo */
  const set = (s, bulge, lift) => {
    for (let i = 0; i < count; i++) {
      pos[i * 3] = cx + (bx[i] - cx) * s;
      pos[i * 3 + 1] = t.Ht + by[i] * Math.min(1, 0.45 + s * 0.55) + bulge * (1 - bu[i] * bu[i]) + lift;
      pos[i * 3 + 2] = cz + (bz[i] - cz) * s;
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  };
  return { geo, set };
}

/* ───────── Montagem por dentro (as camadas de um bolo coberto) ───────── */

/**
 * Num bolo coberto os discos de massa e os recheios não existem na cena (a casca esconde). A montagem cria
 * essas peças com cake.assembly() e as guarda enquanto o bolo não muda de estrutura; a "radiografia" deixa a
 * cobertura translúcida por um instante para a pessoa ver a camada chegando.
 */
export function createMontage(ctx) {
  const group = new THREE.Group();
  group.name = 'atelie:montagem';
  ctx.groups.cakeGroup.add(group);
  const pieces = new Map();
  const lids = new Map();
  let key = '';
  let ghost = 0;
  let hidDecor = false;
  // a casca "de vidro": materiais simples e translúcidos que ocupam o lugar dos da cobertura durante a radiografia
  // (deixar os de verdade transparentes obrigaria a placa de vídeo a recompilar os programas deles)
  const glass = [];
  let swapped = [];
  const glassOf = (ti, color) => {
    if (!glass[ti]) {
      const f = ctx.mats.frostOf(ti);
      glass[ti] = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, clippingPlanes: f.side.clippingPlanes, clipIntersection: true });
    }
    glass[ti].color.set(color);
    return glass[ti];
  };
  const setGlass = (on) => {
    if (on === swapped.length > 0) return;
    if (!on) {
      swapped.forEach(({ mesh, material, coat }) => {
        mesh.material = material;
        if (coat) coat.visible = true;
      });
      swapped = [];
      return;
    }
    ctx.m.stack.forEach((t, ti) => {
      if (t.naked || t.volcano) return;
      const mesh = ctx.named.get(`cobertura:${ti}`)?.objects[0];
      if (!mesh) return;
      const coat = ctx.named.get(`cobertura:${ti}:rosetas`)?.objects[0] || null;
      const g = glassOf(ti, t.cover.color);
      swapped.push({ mesh, material: mesh.material, coat, glass: g });
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(() => g) : g;
      if (coat) coat.visible = false;
    });
  };
  const clear = () => {
    [...pieces.values(), ...lids.values()].forEach((p) => {
      group.remove(p.mesh);
      p.mesh.geometry.dispose();
    });
    pieces.clear();
    lids.clear();
  };
  const signature = () => {
    const c = ctx.config;
    const m = ctx.m;
    return `${c.shape}|${c.size}|${c.tiers}|${c.height || ''}|${c.layers.length}|${m.stack.map((t) => `${t.type}:${t.style}:${t.naked ? 1 : 0}`).join()}`;
  };
  return {
    group,
    /** Cria as peças que faltam (as de andares naked já existem na cena e não são duplicadas). */
    ensure() {
      const k = signature();
      if (k !== key) {
        clear();
        key = k;
      }
      ctx.assembly().forEach((step) => {
        if (!step.make || pieces.has(step.id) || ctx.named.has(step.id)) return;
        const mesh = step.make();
        mesh.castShadow = false;
        mesh.visible = false;
        group.add(mesh);
        pieces.set(step.id, { mesh, tier: step.tier, index: step.index, kind: step.kind, rest: mesh.position.clone() });
      });
      return pieces;
    },
    get: (id) => pieces.get(id),
    /**
     * A "tampa" de um recheio: a faixa de recheio é só a beirada (no bolo pronto o meio fica escondido pela
     * massa de cima); enquanto ele é posto e espalhado, a tampa fecha o topo para a colherada ser maciça.
     */
    lid(ti, i, material) {
      const t = ctx.m.stack[ti];
      const k = `${signature()}|${ti}:${i}`;
      let lid = lids.get(k);
      if (!lid) {
        const path = t.sponge;
        const n = path.n;
        const y = t.fillY[i] + t.fillH;
        const pos = new Float32Array((n + 1) * 3);
        pos.set([t.center.x, y + 0.012, t.center.z], 0);
        for (let q = 0; q < n; q++) pos.set([t.center.x + (path.x[q] - t.center.x) * 0.992, y - 0.002, t.center.z + (path.z[q] - t.center.z) * 0.992], (q + 1) * 3);
        const index = [];
        for (let q = 0; q < n; q++) index.push(0, 1 + ((q + 1) % n), 1 + q);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((n + 1) * 2), 2));
        geo.setIndex(index);
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, material);
        mesh.castShadow = false;
        mesh.position.y = t.y0;
        mesh.visible = false;
        group.add(mesh);
        lid = { mesh, rest: mesh.position.clone() };
        lids.set(k, lid);
      }
      lid.mesh.material = material;
      return lid;
    },
    /** Mostra (ou esconde) as peças de dentro — todas, ou só as de um andar. */
    show(on, tier = null) {
      pieces.forEach((p) => {
        if (tier == null || p.tier === tier) {
          p.mesh.visible = on;
          p.mesh.position.copy(p.rest);
          p.mesh.scale.setScalar(1);
        }
      });
      if (!on) lids.forEach((l) => (l.mesh.visible = false));
    },
    /**
     * Radiografia: a = 0 (bolo normal) … 1 (cobertura translúcida, calda, bico e decorações fora de cena).
     * Na volta, bico e decorações reaparecem com o "pop" de sempre do motor.
     */
    xray(a) {
      if (a === ghost) return;
      ghost = a;
      setGlass(a > 0.001);
      swapped.forEach((sw) => (sw.glass.opacity = 0.74 - 0.5 * a));
      const hide = a > 0.001;
      if (hide !== hidDecor) {
        hidDecor = hide;
        ctx.groups.dripGroup.visible = !hide;
        const parts = [ctx.pipingPart, ...ctx.decorParts.values()].filter(Boolean);
        parts.forEach((p) => {
          p.group.visible = !hide;
          if (!hide && !p.r5clip) p.born = ctx.now;
        });
        if (!hide) ctx.refreshParts(true);
      }
      this.show(a > 0.01);
    },
    get ghost() {
      return ghost;
    },
    dispose() {
      this.xray(0);
      clear();
      glass.forEach((g) => g?.dispose());
      ctx.groups.cakeGroup.remove(group);
    },
  };
}

/* ───────── As animações ───────── */

export function createAnims(S) {
  const { ctx, tools, montage } = S;
  const G = ctx.groups;
  const reveal = { hemi: 0, key: 0, fill: 0, rim: 0, on: false };
  let droplets = null;
  let dropMat = null;

  /** Direção no chão (x, z) a `deg` graus à direita de quem olha o bolo de frente. */
  const viewDir = (deg) => {
    const a = ctx.getSpherical().az + deg * DEG;
    return { x: Math.sin(a), z: Math.cos(a) };
  };
  const spinTo = (angle) => {
    ctx.setSpin(angle);
    S.sets.spin(angle);
  };
  /** Mostra uma ferramenta na cena (coordenadas do mundo) e devolve o grupo. */
  const tool = (name) => {
    const t = tools.get(name, ctx.scene);
    t.visible = true;
    return t;
  };
  /** Orienta um objeto por três eixos (x e y dados; z = x × y). */
  const basis = (object, xAxis, yAxis) => {
    _x.copy(xAxis).normalize();
    _z.crossVectors(_x, yAxis).normalize();
    _y.crossVectors(_z, _x).normalize();
    object.quaternion.setFromRotationMatrix(_m4.makeBasis(_x, _y, _z));
  };

  /* ── peças de uma camada: a de fora (naked), a da montagem (bolo coberto) e as faces dela no corte ── */
  function layerObjs(kind, ti, i) {
    const t = ctx.m.stack[ti];
    if (!t) return [];
    const id = `${kind}:${ti}:${i}`;
    const out = [];
    const base = kind === 'massa' ? t.layerY[i] : t.fillY[i];
    if (base == null) return out;
    const real = ctx.named.get(id);
    const add = (o) => {
      if (!o.userData.r5rest) o.userData.r5rest = o.position.clone();
      out.push({ o, rest: o.userData.r5rest, base, cx: t.center.x, cz: t.center.z });
    };
    if (real) real.objects.forEach(add);
    else {
      const piece = montage.get(id);
      if (piece) {
        piece.mesh.userData.r5rest = piece.rest;
        add(piece.mesh);
      }
    }
    // recheio: a tampa fecha o topo da faixa enquanto ela se mexe (some quando a animação termina)
    const band = out[0]?.o;
    if (kind === 'recheio' && band) {
      const lid = montage.lid(ti, i, Array.isArray(band.material) ? band.material[0] : band.material);
      out.push({ o: lid.mesh, rest: lid.rest, base, cx: t.center.x, cz: t.center.z, temp: true });
    }
    const cut = G.cutGroup.children.find((g) => g.children.some((ch) => ch.userData.cut?.tier === ti));
    cut?.children.forEach((ch) => ch.userData.cut?.of === kind && ch.userData.cut.index === i && add(ch));
    return out;
  }
  /** Posição e amassado de uma peça: dy = quanto está acima do lugar · sy / sxz = escala em torno do pé dela. */
  function pose(list, dy, sy = 1, sxz = 1, show = true) {
    list.forEach(({ o, rest, base, cx, cz }) => {
      o.visible = show;
      o.scale.set(sxz, sy, sxz);
      o.position.set(rest.x + cx * (1 - sxz), rest.y + dy + base * (1 - sy), rest.z + cz * (1 - sxz));
    });
  }
  const rest = (list) => {
    pose(list, 0, 1, 1, true);
    list.forEach((e) => e.temp && (e.o.visible = false));
  };
  /** Queda com pouso: devolve [dy, sy, sxz] para o instante x (segundos desde que a peça soltou). */
  function dropPose(x, fall, height, squash = 0.16) {
    if (x <= 0) return [height, 1, 1];
    if (x < fall) {
      const k = x / fall;
      return [height * (1 - k * k), 1 + 0.07 * k, 1 - 0.025 * k];
    }
    const w = ring(x - fall);
    return [0, 1 - squash * w, 1 + squash * 0.45 * w];
  }
  /** No naked: o creme do topo (ele sobe para dar passagem a quem chega e volta a assentar). */
  function capOf(ti) {
    const t = ctx.m.stack[ti];
    if (!t?.naked) return [];
    return (ctx.named.get(`cobertura:${ti}`)?.objects || []).map((o) => {
      if (!o.userData.r5rest) o.userData.r5rest = o.position.clone();
      return { o, rest: o.userData.r5rest, base: t.H, cx: t.center.x, cz: t.center.z };
    });
  }
  /** O véu de creme raspado do naked some enquanto a pilha se mexe (ele cobre a lateral inteira). */
  const veils = (on) => ctx.m.stack.forEach((t, ti) => t.naked && ctx.named.get(`cobertura:${ti}:veu`)?.objects.forEach((o) => (o.visible = on)));
  /** Tudo o que está acima de um vão (camadas e recheios seguintes do mesmo andar e, no naked, o creme do topo). */
  function above(ti, fromLayer) {
    const t = ctx.m.stack[ti];
    const out = [];
    for (let i = fromLayer; i < t.layerY.length; i++) out.push(...layerObjs('massa', ti, i));
    for (let i = fromLayer; i < t.fillY.length; i++) out.push(...layerObjs('recheio', ti, i));
    out.push(...capOf(ti));
    return out;
  }
  const tiersOf = (p) => ctx.m.stack.map((t, ti) => ({ t, ti })).filter(({ t, ti }) => !t.volcano && (p.tier == null || p.tier === ti));
  const needsXray = () => ctx.m.stack.some((t) => !t.naked && !t.volcano);

  /* ───────── intro: a base chega e o bolo assenta nela ───────── */
  function intro(p = {}) {
    const tl = timeline('intro', p);
    const only = p.only === 'base';
    return {
      ...tl,
      update(t) {
        const sx = t - tl.stand + 0.3;
        const [dy, sy, sxz] = dropPose(sx, 0.3, only ? 0.35 : 1.1, 0.07);
        G.standGroup.position.y = dy;
        G.standGroup.scale.set(sxz, sy, sxz);
        if (only) {
          // a base trocou debaixo do bolo: ele dá um pulinho junto e assenta
          const [cy, csy, csxz] = dropPose(sx - 0.04, 0.3, 0.42, 0.06);
          G.cakeGroup.position.y = cy;
          G.cakeGroup.scale.set(csxz, csy, csxz);
          return;
        }
        const cx = t - tl.cake + 0.34;
        const [cy, csy, csxz] = dropPose(cx, 0.34, 1.5, 0.11);
        G.cakeGroup.visible = cx > 0;
        G.cakeGroup.position.y = cy;
        G.cakeGroup.scale.set(csxz, csy, csxz);
        ctx.shadows.plateShade.visible = cx > 0 && cy < 0.5; // a sombra no prato só aparece com o bolo chegando
      },
      start() {
        if (only) return;
        // bico e decorações chegam depois que o bolo assenta (o "pop" de sempre do motor, um a um)
        const at = ctx.now + tl.cake + 0.12;
        if (ctx.pipingPart) ctx.pipingPart.born = at;
        let i = 0;
        ctx.decorParts.forEach((part) => (part.born = at + 0.12 + 0.1 * i++));
      },
      finish() {
        G.standGroup.position.y = 0;
        G.standGroup.scale.setScalar(1);
        G.cakeGroup.position.y = 0;
        G.cakeGroup.scale.setScalar(1);
        G.cakeGroup.visible = true;
        ctx.shadows.plateShade.visible = true;
      },
    };
  }

  /* ───────── layer: o disco de massa desce e assenta (com o recheio do vão novo por baixo) ───────── */
  function layer(p = {}) {
    const mode = p.mode || 'add';
    if (!ctx.m || ctx.m.volcano) return null;
    const list = tiersOf(p);
    if (!list.length) return null;
    const xr = true; // (no naked não há casca para ficar de vidro, mas bico e decorações saem de cena do mesmo jeito)
    if (needsXray()) montage.ensure();
    const idx = (t) => (p.index == null ? t.layerY.length - 1 : Math.min(p.index, t.layerY.length - 1));
    const sets = list.map(({ t, ti }) => {
      const i = idx(t);
      return { t, ti, i, disc: layerObjs('massa', ti, i), band: i > 0 ? layerObjs('recheio', ti, i - 1) : [], over: above(ti, i + 1), cap: capOf(ti) };
    });
    veils(false);
    const tl = timeline('layer', { ...p, mode, filling: mode === 'add' && sets.some((s) => s.band.length), part: `massa:${p.tier ?? 0}:${p.index ?? idx(ctx.m.stack[0])}` });
    const closeAt = tl.close ?? tl.dur - 0.2;
    return {
      ...tl,
      update(t) {
        if (xr) montage.xray(Math.min(smooth(0, tl.open, t), 1 - smooth(closeAt, tl.dur, t)));
        sets.forEach((s) => {
          if (mode === 'remove') {
            // a camada que saiu já não existe: o que ficou dá uma respirada (sobe um fio e assenta)
            const [dy, sy, sxz] = dropPose(t - tl.lift, 0.16, 0.1, 0.1);
            pose(s.disc, dy, sy, sxz);
            return;
          }
          if (mode === 'swap') {
            // sai (sobe e some), troca de sabor lá em cima e volta
            const up = smooth(tl.lift, tl.lift + 0.2, t);
            const x = t - (tl.land - 0.26);
            if (x <= 0) pose(s.disc, 0.55 * easeOut(up), 1, 1 - 0.04 * up);
            else pose(s.disc, ...dropPose(x, 0.26, 0.55, 0.15));
            if (s.over.length) pose(s.over, x <= 0 ? 0.62 * easeOut(up) : dropPose(x - 0.05, 0.26, 0.62, 0)[0]);
            return;
          }
          if (s.band.length) {
            const k = clamp01((t - tl.fillAt) / Math.max(0.01, tl.fill));
            const w = t > tl.land ? ring(t - tl.land, 3.1, 9) : 0;
            pose(s.band, 0, lerp(1.9, 1, easeOut(k)) - 0.2 * w, lerp(0.3, 1, easeOut(k)) + 0.02 * w, t >= tl.fillAt);
          }
          const fall = tl.land - tl.drop;
          pose(s.disc, ...dropPose(t - tl.drop, fall, 1.0, 0.17), t >= tl.drop - 0.02);
          if (s.cap.length) {
            // o creme do topo sobe com a radiografia e desce logo atrás do disco
            const x = t - (tl.land + 0.04);
            if (x <= 0) pose(s.cap, 1.9 * easeOut(smooth(0, tl.open + 0.06, t)));
            else pose(s.cap, ...dropPose(x, 0.22, 1.9, 0.1));
          }
        });
        // a pilha de baixo sente o peso de quem chegou
        if (mode !== 'remove' && tl.land != null && t > tl.land) G.cakeGroup.scale.y = 1 - 0.022 * ring(t - tl.land, 3.1, 9);
      },
      finish() {
        sets.forEach((s) => [s.disc, s.band, s.over, s.cap].forEach(rest));
        G.cakeGroup.scale.setScalar(1);
        veils(true);
        if (xr) montage.xray(0);
      },
    };
  }

  /* ───────── filling: o recheio é posto no vão e se espalha; as camadas de cima voltam e assentam ───────── */
  function filling(p = {}) {
    if (!ctx.m || ctx.m.volcano) return null;
    const list = tiersOf(p).filter(({ t }) => t.fillY.length > (p.index || 0));
    if (!list.length) return null;
    const xr = true;
    if (needsXray()) montage.ensure();
    const i = p.index || 0;
    const tl = timeline('filling', { ...p, part: `recheio:${p.tier ?? 0}:${i}` });
    veils(false);
    const sets = list.map(({ ti }) => ({ band: layerObjs('recheio', ti, i), over: [...layerObjs('massa', ti, i + 1), ...above(ti, i + 2), ...layerObjs('recheio', ti, i + 1)] }));
    return {
      ...tl,
      update(t) {
        if (xr) montage.xray(Math.min(smooth(0, tl.open, t), 1 - smooth(tl.close, tl.dur, t)));
        sets.forEach((s) => {
          const up = easeOut(smooth(tl.lift, tl.lift + 0.2, t));
          const x = t - (tl.land - 0.24);
          const [dy, sy, sxz] = x <= 0 ? [0.5 * up, 1, 1] : dropPose(x, 0.24, 0.5, 0.13);
          pose(s.over, dy, sy, sxz);
          const k = clamp01((t - tl.spread) / tl.spreadDur);
          const w = t > tl.land ? ring(t - tl.land, 3.1, 9) : 0;
          // colherada alta no meio que baixa e corre para a borda; quando a massa volta, ela cede e estufa
          pose(s.band, 0, lerp(2.3, 1, easeOut(k)) - 0.22 * w, lerp(0.26, 1, easeOut(k)) + 0.02 * w, t >= tl.plop - 0.05);
        });
      },
      finish() {
        sets.forEach((s) => [s.band, s.over].forEach(rest));
        veils(true);
        if (xr) montage.xray(0);
      },
    };
  }

  /* ───────── soak: a calda de molhar pinga sobre a massa e some nela ───────── */
  function soak(p = {}) {
    if (!ctx.m) return null;
    const top = ctx.m;
    const n = ctx.tier.detail < 1 ? 7 : 10;
    const tl = timeline('soak', { ...p, count: n });
    const xr = true;
    if (needsXray()) montage.ensure();
    if (!dropMat) dropMat = new THREE.MeshStandardMaterial({ color: 0xe0a44a, roughness: 0.18, metalness: 0, transparent: true, opacity: 0.86 });
    if (!droplets) droplets = createDroplets(G.cakeGroup, dropMat, 16);
    const spots = Array.from({ length: n }, (_, i) => {
      const a = hash(i + 3) * TAU;
      const r = top.rMin * 0.82 * Math.sqrt(hash(i + 11));
      return { x: top.center.x + Math.cos(a) * r, z: top.center.z + Math.sin(a) * r };
    });
    const y = top.y0 + top.H;
    // a massa de cima escurece onde a calda pega (e volta: por dentro ela continua úmida, mas a cor é a do sabor)
    const crust = top.volcano ? null : ctx.mats.crustMat(top.layerY.length - 1);
    const dry = crust ? crust.color.clone() : null;
    const caps = ctx.m.stack.flatMap((_, ti) => capOf(ti));
    veils(false);
    const bottle = tool('bottle');
    bottle.visible = false;
    return {
      ...tl,
      update(t) {
        if (xr) montage.xray(Math.min(smooth(0, tl.open, t), 1 - smooth(tl.close, tl.dur, t)));
        pose(caps, 2.1 * easeOut(Math.min(smooth(0, tl.open + 0.06, t), 1 - smooth(tl.close - 0.12, tl.dur - 0.04, t))));
        droplets.show(true);
        const last = tl.from + n * tl.step;
        spots.forEach((s, i) => {
          const x = (t - tl.from - i * tl.step) / tl.fall;
          if (x <= 0 || x > 1.6) droplets.set(i, 0, 0, 0, 0);
          else if (x < 1) droplets.set(i, s.x, y + 0.62 * (1 - x * x), s.z, 1.7, 1 + 1.1 * x);
          else droplets.set(i, s.x, y + 0.004, s.z, 1.7 * (1 + (x - 1) * 2.4) * (1 - (x - 1) / 0.6), 0.2); // espalha e some na massa
        });
        droplets.flush();
        if (crust) crust.color.copy(dry).multiplyScalar(1 - 0.2 * smooth(tl.from + tl.fall, last + tl.fall, t) * (1 - smooth(tl.close - 0.1, tl.dur, t)));
        // a bisnaga de calda passeia por cima, soltando as gotas
        const show = smooth(0, tl.from, t) * (1 - smooth(last, last + 0.2, t));
        bottle.visible = show > 0.02;
        if (bottle.visible) {
          const k = clamp01((t - tl.from) / Math.max(0.01, n * tl.step)) * (n - 1);
          const a = spots[Math.floor(k)];
          const b = spots[Math.min(n - 1, Math.floor(k) + 1)];
          _p.set(lerp(a.x, b.x, k - Math.floor(k)), y + 0.66 + 0.5 * (1 - show), lerp(a.z, b.z, k - Math.floor(k)));
          G.cakeGroup.localToWorld(_p);
          bottle.position.copy(_p);
          const out = viewDir(70);
          aimY(bottle, out.x * 0.45, 1, out.z * 0.45);
        }
      },
      finish() {
        droplets.show(false);
        bottle.visible = false;
        if (crust) crust.color.copy(dry);
        rest(caps);
        veils(true);
        if (xr) montage.xray(0);
      },
    };
  }

  /* ───────── cover / style: o creme é aplicado com o prato girando ─────────
     mode 'full'  colherada no topo, espalha, e a espátula sobe a lateral em uma volta do prato
     mode 'tint'  uma demão de cor nova por cima da antiga · 'style' = passada de pente / espátula
     manual       quem gira o prato é o dedo (spread.begin): k = S.spreadState.progress */
  function coat(p = {}, kind = 'cover') {
    const m = ctx.m;
    if (!m) return null;
    const mode = kind === 'style' ? 'style' : p.mode === 'tint' ? 'tint' : 'full';
    const tl = timeline(kind === 'style' ? 'style' : 'cover', { ...p, mode, part: `cobertura:${p.tier ?? 0}` });
    const manual = p.manual || null;
    const spins = ctx.wedge.span <= 0.002; // com o bolo aberto o prato fica parado (o corte é fixo): a espátula dá a volta
    const snap = S.snapshot;
    const jobs = [];
    let usedMontage = false;
    m.stack.forEach((t, ti) => {
      if (p.tier != null && p.tier !== ti) return;
      const part = ctx.named.get(`cobertura:${ti}`);
      const mesh = part?.objects[0];
      if (!mesh) return;
      const info = t.volcano ? null : prepareSweep(mesh.geometry);
      const f = ctx.mats.frostOf(ti);
      const job = { t, ti, mesh, info, f, under: null, blob: null, coatMesh: ctx.named.get(`cobertura:${ti}:rosetas`)?.objects[0] || null, veil: ctx.named.get(`cobertura:${ti}:veu`)?.objects[0] || null };
      // por baixo: a cobertura que estava (uma cópia dela) ou, se não havia, as camadas de massa e recheio
      const old = snap?.get(ti);
      if (old && !t.naked) {
        const under = new THREE.Mesh(old.geo, old.mats);
        under.position.set(t.center.x * 0.008, old.y0 + 0.0005, t.center.z * 0.008);
        under.scale.set(0.992, 0.997, 0.992);
        under.castShadow = false;
        G.cakeGroup.add(under);
        job.under = under;
        snap.delete(ti);
      } else if (!t.naked && !t.volcano) {
        montage.ensure();
        montage.show(true, ti);
        usedMontage = true;
      }
      if (info) {
        const blob = buildBlob(t);
        const bm = new THREE.Mesh(blob.geo, f.top);
        bm.position.y = t.y0;
        bm.castShadow = false;
        bm.receiveShadow = true;
        bm.visible = false;
        G.cakeGroup.add(bm);
        job.blob = { ...blob, mesh: bm };
      }
      if (job.coatMesh) job.coatCount = job.coatMesh.count;
      jobs.push(job);
    });
    if (!jobs.length) return null;

    // a espátula trabalha do lado direito de quem olha; na aplicação completa ela atravessa a frente
    const lead = jobs.find((j) => j.info) || null;
    const tA = mode === 'full' ? tl.plop : tl.side;
    const tB = tl.side + tl.sideDur;
    const E = (t) => easeInOut(clamp01((t - tA) / (tB - tA)));
    const Es = mode === 'full' ? E(tl.side) : 0;
    let dir = 1;
    const mid = viewDir(mode === 'full' ? 34 : 52);
    const midAng = Math.atan2(mid.z, mid.x);
    jobs.forEach((j) => {
      if (!j.info) return;
      const phi0 = columnAngles(j.mesh.geometry, j.info, j.t.center);
      const s = Math.sign(phi0[j.info.n] - phi0[0]) || 1;
      if (j === lead) dir = s;
      // a coluna que estará debaixo da espátula quando a lateral começar
      const startW = spins && !manual ? midAng - s * Math.PI * Es : midAng;
      const local = startW + (spins && !manual ? s * TAU * Es : 0);
      let j0 = 0;
      let best = Infinity;
      for (let c = 0; c < j.info.n; c++) {
        const d = Math.abs(wrapPi(phi0[c] - local));
        if (d < best) {
          best = d;
          j0 = c;
        }
      }
      rotateSide(j.mesh.geometry, j.info, j0);
      j.phi = columnAngles(j.mesh.geometry, j.info, j.t.center);
      j.mesh.geometry.setDrawRange(0, 0);
    });
    jobs.forEach((j) => {
      if (j.coatMesh) j.coatMesh.count = 0;
      if (j.veil) j.veil.visible = false;
      if (!j.info) j.mesh.visible = false;
    });
    // ferramentas: a espátula espalha o creme no topo; o raspador (em pé, encostado) sobe e alisa a lateral
    const knifeTop = mode === 'full' ? tool('spatula') : null;
    const sp = tool('scraper');
    sp.visible = false;
    if (knifeTop) knifeTop.visible = false;
    const topDir = viewDir(40);
    const sideH = lead ? lead.t.Ht - lead.t.rf * 0.4 : 1;

    /** Ponto do mundo onde a cobertura está chegando agora (a coluna da vez, a meia altura da lateral). */
    const leadPoint = (j, f, out) => {
      const c = f * j.info.n;
      const a = Math.floor(c) % j.info.n;
      const b = (a + 1) % j.info.n;
      const arr = j.mesh.geometry.index.array;
      const pos = j.mesh.geometry.attributes.position;
      const va = arr[j.info.top + a * j.info.per];
      const vb = arr[j.info.top + b * j.info.per];
      const k = c - Math.floor(c);
      out.set(lerp(pos.getX(va), pos.getX(vb), k), j.t.y0 + (j.t.Ht - j.t.rf) * 0.5, lerp(pos.getZ(va), pos.getZ(vb), k));
      return G.cakeGroup.localToWorld(out);
    };

    function apply(t, f, e) {
      // f = quanto da lateral já tem creme (0…1) · e = quanto o prato já girou (0…1 volta)
      if (spins) spinTo(dir * TAU * e);
      const topK = mode === 'full' ? clamp01((t - tl.top) / tl.topDur) : clamp01((manual ? f : (t - tl.side) / tl.sideDur) / 0.42);
      const landed = mode !== 'full' || t >= tl.plop;
      jobs.forEach((j) => {
        if (!j.info) {
          // sem malha varrida (vulcão): o creme chega de uma vez, estufando
          const k = clamp01((t - (mode === 'full' ? tl.plop : tl.side)) / 0.5);
          j.mesh.visible = k > 0;
          const w = 0.1 * ring(k * 0.5, 3, 7) * (k > 0 ? 1 : 0);
          j.mesh.scale.set(1 + w * 0.4, lerp(0.5, 1, easeOut(k)) - w, 1 + w * 0.4);
          return;
        }
        const showTop = topK >= 1;
        const cols = Math.round(f * j.info.n);
        j.mesh.geometry.setDrawRange(showTop ? 0 : j.info.top, (showTop ? j.info.top : 0) + cols * j.info.per);
        if (j.blob) {
          const b = j.blob;
          b.mesh.visible = landed && !showTop;
          if (b.mesh.visible) {
            if (mode === 'full') {
              // a colherada cai, amassa e é espalhada até a borda
              const fall = clamp01((t - (tl.plop - 0.16)) / 0.16);
              const s0 = 0.3;
              const s = lerp(s0, 1, easeInOut(topK));
              const squash = t > tl.plop ? ring(t - tl.plop, 3, 8) : 0;
              b.set(s * (1 + 0.05 * squash), 0.2 * (1 - topK) ** 1.4 * (1 - 0.3 * squash), 0.006 + 0.9 * (1 - fall * fall));
            } else b.set(lerp(0.05, 1, easeOut(topK)), 0.012 * (1 - topK), 0.005);
          }
        }
        if (j.coatMesh) j.coatMesh.count = Math.round(j.coatCount * easeIn(f));
        if (j.veil) {
          j.veil.visible = f > 0;
          j.veil.material.opacity = f;
        }
      });
      if (!lead) return;
      const j = lead;
      const cw = G.cakeGroup.localToWorld(_c.set(j.t.center.x, 0, j.t.center.z));
      // no topo: a espátula quase deitada, a ponta perto do meio, alisando de dentro para fora
      if (knifeTop) {
        const inK = smooth(tl.plop, tl.plop + 0.16, t);
        const outK = smooth(tl.side - 0.12, tl.side + 0.1, t);
        knifeTop.visible = inK > 0.01 && outK < 0.99;
        if (knifeTop.visible) {
          const rTop = j.t.rMin * lerp(0.2, 0.9, easeInOut(topK));
          _v2.set(topDir.x, 0, topDir.z);
          _y.copy(_v2).addScaledVector(UP, 0.26);
          _x.crossVectors(_y, UP);
          basis(knifeTop, _x, _y);
          const sway = Math.sin(t * 15) * 0.05 * (1 - topK);
          knifeTop.position.set(cw.x + topDir.x * (rTop + 0.3 * outK) - topDir.z * sway, j.t.y0 + j.t.Ht + 0.045 + 0.5 * (1 - inK) + 0.14 * (1 - topK) + 0.5 * outK, cw.z + topDir.z * (rTop + 0.3 * outK) + topDir.x * sway);
        }
      }
      // na lateral: o raspador em pé, a aresta encostada na cobertura, o cabo para fora e um pouco para trás
      const leave = manual ? manual.tail : smooth(tB - 0.02, tB + 0.2, t);
      const enter = mode === 'full' ? smooth(tl.side - 0.1, tl.side + 0.1, t) : smooth(0, tl.side + 0.06, t);
      sp.visible = enter > 0.01 && leave < 0.99;
      if (!sp.visible) return;
      leadPoint(j, f, _p);
      _v.set(_p.x - cw.x, 0, _p.z - cw.z).normalize(); // para fora do bolo
      const tang = _z.crossVectors(UP, _v).multiplyScalar(dir); // para onde o creme avança
      _x.copy(_v).multiplyScalar(0.74).addScaledVector(tang, -0.67);
      sp.scale.set(1, Math.max(0.7, (sideH + 0.14) / 0.78), 1);
      basis(sp, _x, UP);
      sp.position.copy(_p).addScaledVector(_v, 0.01 + 0.55 * leave + 0.5 * (1 - enter));
      sp.position.y = j.t.y0 + (sideH + 0.1) * 0.5 + 0.25 * leave;
    }

    return {
      ...tl,
      dur: manual ? Infinity : tl.dur,
      update(t) {
        if (manual) {
          // o topo é espalhado sozinho; a lateral avança conforme o prato é girado com o dedo
          if (t < tl.side) apply(t, 0, 0);
          else apply(tl.side + 0.3, manual.progress, manual.progress);
          return;
        }
        const e = E(t);
        const w = smooth(tl.side, tB, t);
        const f = t < tl.side ? 0 : spins && mode === 'full' ? clamp01(e - Es + Es * w) : clamp01(mode === 'full' ? (e - Es) / (1 - Es) : e);
        apply(t, f, e);
      },
      finish() {
        jobs.forEach((j) => {
          j.mesh.visible = true;
          j.mesh.scale.setScalar(1);
          j.mesh.geometry.setDrawRange(0, Infinity);
          if (j.blob) {
            G.cakeGroup.remove(j.blob.mesh);
            j.blob.geo.dispose();
          }
          if (j.under) {
            G.cakeGroup.remove(j.under);
            j.under.geometry.dispose();
            j.under.material.forEach((mt) => mt.dispose());
          }
          if (j.coatMesh) j.coatMesh.count = j.coatCount;
          if (j.veil) {
            j.veil.visible = true;
            j.veil.material.opacity = 1;
          }
        });
        if (usedMontage) montage.show(false);
        sp.visible = false;
        sp.scale.setScalar(1);
        if (knifeTop) knifeTop.visible = false;
        spinTo(0);
      },
    };
  }

  /* ───────── drip: a calda é despejada em volta e cada gota escorre por gravidade ───────── */
  function dripMeshes() {
    return ctx.m.stack.map((t, ti) => ({ t, ti, mesh: ctx.named.get(`calda:${ti}`)?.objects[0] })).filter((d) => d.mesh?.geometry.userData.drip);
  }
  /** Prepara uma malha de calda para ser animada: guarda a forma final e o que cada coluna segue. */
  function dripRig(d, startAng) {
    const geo = d.mesh.geometry;
    const u = geo.userData.drip;
    const pos = geo.attributes.position;
    const base = pos.array.slice();
    const { cols, rows, top, fillet } = u;
    const rim = top; // linha da borda da poça
    const side0 = top + fillet; // última linha da quina (âncora das gotas)
    const cx = d.t.center.x;
    const cz = d.t.center.z;
    // coluna mais perto de onde a bisnaga começa
    let c0 = 0;
    let best = Infinity;
    const ang = new Float32Array(cols);
    for (let i = 0; i < cols; i++) {
      const k = (i * rows + rim) * 3;
      ang[i] = Math.atan2(base[k + 2] - cz, base[k] - cx);
      const dd = Math.abs(wrapPi(ang[i] - startAng));
      if (dd < best) {
        best = dd;
        c0 = i;
      }
    }
    const dirS = Math.sign(wrapPi(ang[(c0 + 1) % cols] - ang[c0])) || 1;
    const frac = (s) => (((s - u.colS[c0]) / u.L) % 1 + 1) % 1;
    const order = u.drips.map((dr, i) => ({ i, fr: frac(dr.s) })).sort((a, b) => a.fr - b.fr);
    const rank = new Int32Array(u.drips.length);
    order.forEach((o, k) => (rank[o.i] = k));
    // por coluna: fração da volta, gota mais próxima e o quanto a coluna pertence a ela
    const colFr = new Float32Array(cols + 1);
    const colDrip = new Int32Array(cols + 1).fill(-1);
    const colW = new Float32Array(cols + 1);
    for (let i = 0; i <= cols; i++) {
      const ii = i % cols;
      const sx = u.colS[ii];
      colFr[i] = frac(sx);
      let near = -1;
      let nd = Infinity;
      u.drips.forEach((dr, k) => {
        let dsx = Math.abs(sx - dr.s);
        if (dsx > u.L / 2) dsx = u.L - dsx;
        if (dsx < nd) {
          nd = dsx;
          near = k;
        }
      });
      if (near >= 0) {
        colDrip[i] = near;
        colW[i] = 1 - smooth(u.drips[near].w * 1.25, u.drips[near].w + 0.09, nd);
      }
    }
    return { d, geo, u, pos, base, rim, side0, cx, cz, c0, dirS, order, rank, colFr, colDrip, colW, ang };
  }
  /** Escreve a malha no instante dado: pool = poça (0…1) · lipAt(col) e dropAt(gota) = 0…1 de cada parte. */
  function dripWrite(rig, pool, lipAt, dropAt) {
    const { u, base, rim, side0, cx, cz } = rig;
    const { cols, rows, dv, sideH } = u;
    const out = rig.pos.array;
    const lipV = 0.05;
    const nDrips = u.drips.length;
    const gd = rig.gd || (rig.gd = new Float32Array(Math.max(1, nDrips)));
    for (let k = 0; k < nDrips; k++) gd[k] = dropAt(k);
    for (let i = 0; i <= cols; i++) {
      const o = i * rows * 3;
      const lip = lipAt(i);
      const dk = rig.colDrip[i];
      const run = dk >= 0 ? lerp(lip, Math.min(lip, gd[dk]), rig.colW[i]) : lip;
      // a borda da poça (encolhida para o meio enquanto a poça se espalha)
      const rx = cx + (base[o + rim * 3] - cx) * pool;
      const ry = base[o + rim * 3 + 1];
      const rz = cz + (base[o + rim * 3 + 2] - cz) * pool;
      for (let j = 0; j <= rim; j++) {
        const q = o + j * 3;
        out[q] = cx + (base[q] - cx) * pool;
        out[q + 1] = base[q + 1];
        out[q + 2] = cz + (base[q + 2] - cz) * pool;
      }
      for (let j = rim + 1; j <= side0; j++) {
        const q = o + j * 3;
        out[q] = lerp(rx, base[q], lip);
        out[q + 1] = lerp(ry, base[q + 1], lip);
        out[q + 2] = lerp(rz, base[q + 2], lip);
      }
      const ax = out[o + side0 * 3];
      const az = out[o + side0 * 3 + 2];
      const ay = out[o + side0 * 3 + 1];
      for (let j = side0 + 1; j < rows; j++) {
        const q = o + j * 3;
        const v = (j - side0) * dv;
        const lipPart = Math.min(v, lipV);
        const g = v <= lipV ? lip : run;
        const e = smooth(0, 0.3, g);
        out[q] = lerp(ax, base[q], e);
        out[q + 2] = lerp(az, base[q + 2], e);
        const y = Math.max(0.004, sideH - (lipPart * lip + (v - lipPart) * run));
        out[q + 1] = lip <= 0 ? ay : Math.min(ay, y);
      }
    }
    const c = (cols + 1) * rows * 3;
    out[c] = base[c];
    out[c + 1] = base[c + 1];
    out[c + 2] = base[c + 2];
    rig.pos.needsUpdate = true;
  }
  const dripEase = (x) => 1 - (1 - clamp01(x) ** 1.25) ** 2.3;

  function drip(p = {}) {
    if (!ctx.m || !ctx.config.drip.on) return null;
    const list = dripMeshes();
    if (!list.length) return null;
    const spins = ctx.wedge.span <= 0.002;
    const at = viewDir(46);
    const startAng = Math.atan2(at.z, at.x);
    const rigs = list.map((d) => dripRig(d, startAng));
    const lead = rigs[0];
    const drops = lead.order.map((o) => clamp01(lead.u.drips[o.i].len / Math.max(0.05, lead.u.maxLen)));
    const tl = timeline('drip', { ...p, drops: drops.length ? drops : [0.5], part: 'calda:0' });
    const speed = p.speed > 0 ? p.speed : 1;
    const bottle = tool('bottle');
    bottle.visible = false;
    const tEnd = tl.pool + tl.sweep;
    return {
      ...tl,
      update(t) {
        const e = easeInOut(clamp01((t - 0.04 / speed) / (tEnd + 0.18 / speed)));
        if (spins) spinTo(lead.dirS * TAU * e);
        const pool = lerp(0.06, 1, easeOut(clamp01(t / tl.pool)));
        const pass = clamp01((t - tl.pool) / tl.sweep);
        rigs.forEach((rig) => {
          const n = rig.order.length;
          dripWrite(
            rig,
            pool,
            (i) => (t < tl.pool ? 0 : easeOut(clamp01((pass - rig.colFr[i]) / (0.22 / speed / tl.sweep)))),
            (k) => {
              // cada gota segue o instante da linha do tempo (a mesma das marcas de som); em andares de cima,
              // as gotas se repartem pela mesma lista
              const slot = Math.min(tl.starts.length - 1, Math.round((rig.rank[k] / Math.max(1, n)) * tl.starts.length));
              return dripEase((t - tl.starts[slot]) / tl.durs[slot]);
            },
          );
        });
        // a bisnaga acompanha o fio de calda: primeiro no meio (a poça), depois na borda
        const show = smooth(0, 0.12 / speed, t) * (1 - smooth(tEnd, tEnd + 0.2 / speed, t));
        bottle.visible = show > 0.02;
        if (!bottle.visible) return;
        const rig = lead;
        const k = (((rig.c0 + Math.round(pass * rig.u.cols)) % rig.u.cols) * rig.u.rows + rig.rim) * 3;
        const edge = smooth(tl.pool * 0.55, tl.pool, t);
        _p.set(lerp(rig.cx, rig.base[k], edge), rig.d.t.y0 + rig.u.yTop, lerp(rig.cz, rig.base[k + 2], edge));
        G.cakeGroup.localToWorld(_p);
        const out = viewDir(70);
        bottle.position.set(_p.x, _p.y + 0.1 + 0.6 * (1 - show), _p.z);
        aimY(bottle, out.x * 0.5, 1, out.z * 0.5);
      },
      finish() {
        rigs.forEach((rig) => {
          rig.pos.array.set(rig.base);
          rig.pos.needsUpdate = true;
        });
        bottle.visible = false;
        spinTo(0);
      },
    };
  }

  /** Toque na borda: a gota mais próxima do dedo escorre de novo. */
  function dripOne(hit) {
    if (!ctx.m || !ctx.config.drip.on || !hit) return null;
    const list = dripMeshes();
    const d = list.find((x) => x.ti === (hit.tier ?? list[list.length - 1].ti)) || list[list.length - 1];
    if (!d) return null;
    const rig = dripRig(d, Math.atan2(hit.z - d.t.center.z, hit.x - d.t.center.x));
    if (!rig.u.drips.length) return null;
    const k = rig.colDrip[rig.c0];
    if (k < 0) return null;
    const dur = 0.42 + 0.5 * clamp01(rig.u.drips[k].len / Math.max(0.05, rig.u.maxLen));
    return {
      dur: dur + 0.05,
      cues: [{ name: 'drip', at: dur * 0.3, dur: 0, count: 1, part: `calda:${d.ti}`, kind: 'hit' }],
      update(t) {
        dripWrite(rig, 1, () => 1, (i) => (i === k ? dripEase(t / dur) : 1));
      },
      finish() {
        rig.pos.array.set(rig.base);
        rig.pos.needsUpdate = true;
      },
    };
  }

  /* ───────── peças em lote (bico e decorações): a cena escreve as instâncias no lugar do motor ───────── */
  /** Lista única das peças de uma parte: cada uma com onde fica e como escrever a sua posição. */
  function itemsOf(part) {
    const list = [];
    part.batches.forEach((b) => {
      if (!b.mesh) return;
      b.items.forEach((it, i) => list.push({ b, i, it, x: it.x, y: it.y, z: it.z, rad: it.rad }));
    });
    part.objects.forEach((o) => {
      if (!o.rest) o.rest = o.object.position.clone();
      list.push({ o, x: o.rest.x, y: o.rest.y, z: o.rest.z, rad: o.rad });
    });
    return list;
  }
  /** Escreve uma peça: f = tamanho (0 some) · dx, dy, dz = deslocamento · sy / sxz = amassado. */
  function writeItem(e, f, dx = 0, dy = 0, dz = 0, sy = 1, sxz = 1) {
    const w = ctx.wedge.span > 0.002 ? ctx.wedge : null;
    if (e.b) {
      const it = e.it;
      if (w && inWedge(it, w)) f = 0;
      const k = Math.max(f, 1e-6);
      _p.set(it.x + dx, it.y + dy, it.z + dz);
      _s.set(it.s[0] * k * sxz, it.s[1] * k * sy, it.s[2] * k * sxz);
      e.b.mesh.setMatrixAt(e.i, _m4.compose(_p, it.q, _s));
      e.b.dirty = true;
    } else {
      const o = e.o;
      const hidden = w && !o.clipped && inWedge(o, w);
      o.object.visible = !hidden && f > 0.001;
      o.object.position.set(o.rest.x + dx, o.rest.y + dy, o.rest.z + dz);
      if (!o.object.isSprite) o.object.scale.set(o.scale.x * Math.max(f, 0.001) * sxz, o.scale.y * Math.max(f, 0.001) * sy, o.scale.z * Math.max(f, 0.001) * sxz);
    }
  }
  function flushItems(part) {
    part.batches.forEach((b) => {
      if (b.dirty && b.mesh) {
        b.mesh.instanceMatrix.needsUpdate = true;
        b.dirty = false;
      }
    });
  }
  /** Devolve a parte ao motor, no estado final. */
  function releasePart(part) {
    part.r5clip = false;
    part.born = -100;
    part.objects.forEach((o) => o.rest && o.object.position.copy(o.rest));
    ctx.refreshParts(true);
  }

  /* ───────── piping: as pitangas nascem em sequência, como saindo do bico ───────── */
  function piping(p = {}) {
    const part = p.partObject || ctx.pipingPart;
    if (!part || !ctx.m) return null;
    const list = itemsOf(part);
    if (!list.length) return null;
    const c = ctx.m.base.center;
    const from = viewDir(-70);
    const a0 = Math.atan2(from.z, from.x);
    // de cima para baixo (borda do topo, cintura, base) e, em cada altura, em volta do bolo
    list.forEach((e) => {
      e.band = -Math.round(e.y / 0.12);
      e.ang = ((Math.atan2(e.z - c.z, e.x - c.x) - a0) % TAU + TAU) % TAU;
    });
    list.sort((a, b) => a.band - b.band || a.ang - b.ang);
    const tl = timeline('piping', { ...p, count: list.length });
    const bag = tool('bag');
    part.r5clip = true;
    part.born = -100;
    part.group.visible = true;
    const n = list.length;
    return {
      ...tl,
      update(t) {
        for (let k = 0; k < n; k++) {
          const x = (t - tl.from - k * tl.step) / tl.grow;
          if (x <= 0) writeItem(list[k], 0);
          else if (x >= 1) writeItem(list[k], 1);
          else {
            // sai do bico gordinha e alta, e assenta
            const g = backOut(x);
            writeItem(list[k], g, 0, 0, 0, 1 + 0.3 * (1 - x), 1);
          }
        }
        flushItems(part);
        const cur = clamp01((t - tl.from) / Math.max(0.001, n * tl.step)) * (n - 1);
        const a = list[Math.floor(cur)];
        const b = list[Math.min(n - 1, Math.floor(cur) + 1)];
        const k = cur - Math.floor(cur);
        const show = smooth(0, tl.from, t) * (1 - smooth(tl.from + n * tl.step, tl.from + n * tl.step + 0.2, t));
        bag.visible = show > 0.02;
        if (!bag.visible) return;
        // o bico fica logo acima da pitanga da vez; o saco, inclinado para fora
        const squeeze = 0.02 * Math.sin(t * 30);
        _p.set(lerp(a.x, b.x, k), lerp(a.y, b.y, k) + a.rad * 0.9 + 0.03 + squeeze + 0.5 * (1 - show), lerp(a.z, b.z, k));
        G.cakeGroup.localToWorld(_p);
        bag.position.copy(_p);
        const ox = _p.x - c.x;
        const oz = _p.z - c.z;
        const l = Math.hypot(ox, oz) || 1;
        aimY(bag, (ox / l) * 0.5, 1, (oz / l) * 0.5);
      },
      pending() {
        list.forEach((e) => writeItem(e, 0));
        flushItems(part);
      },
      finish() {
        bag.visible = false;
        releasePart(part);
      },
    };
  }

  /* ───────── decor: as peças caem e assentam uma a uma ───────── */
  function decor(p = {}) {
    const id = p.id;
    const part = p.partObject || ctx.decorParts.get(id);
    if (!part || !ctx.m) return null;
    const list = itemsOf(part);
    if (!list.length) return null;
    const st = decorStyle(id);
    const style = p.style || st.style;
    const c = ctx.m.base.center;
    const topY = ctx.layout?.topY ?? ctx.m.Htot;
    // peças do mesmo lugar (o morango e o cabinho dele) caem juntas
    const groups = new Map();
    list.forEach((e, i) => {
      e.side = e.y < topY - 0.05 && Math.hypot(e.x - c.x, e.z - c.z) > ctx.m.rMin * 0.9;
      e.seed = hash(i * 1.37 + 5);
      const k = style === 'sprinkle' ? i : `${Math.round(e.x / 0.07)}|${Math.round(e.z / 0.07)}|${e.side ? Math.round(e.y / 0.1) : 0}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    });
    const from = viewDir(-60);
    const a0 = Math.atan2(from.z, from.x);
    const clusters = [...groups.values()].map((g) => ({ g, ang: ((Math.atan2(g[0].z - c.z, g[0].x - c.x) - a0) % TAU + TAU) % TAU, r: Math.hypot(g[0].x - c.x, g[0].z - c.z) }));
    if (style !== 'sprinkle') clusters.sort((a, b) => a.ang - b.ang);
    const count = style === 'sprinkle' ? list.length : clusters.length;
    const tl = timeline('decor', { ...p, style, cue: p.cue || st.cue, count, part: `decor:${id}` });
    const hop = style === 'hard' ? [0.045, 0.016] : style === 'fruit' ? [0.02, 0] : [0, 0];
    const height = style === 'soft' ? 0.5 : style === 'place' || style === 'candles' ? 0.42 : 0.62;
    part.r5clip = true;
    part.born = -100;
    part.group.visible = true;
    part.flames.forEach((f) => (f.lv = 0));
    const isCandles = style === 'candles';

    function one(e, x, fall, settle) {
      // x = segundos desde que esta peça soltou
      if (x <= 0) return writeItem(e, 0);
      const ox = e.x - c.x;
      const oz = e.z - c.z;
      const l = Math.hypot(ox, oz) || 1;
      if (e.side) {
        // peça da lateral: chega de fora e gruda na cobertura (aperta e volta)
        const k = clamp01(x / fall);
        const d = 0.34 * (1 - easeOut(k));
        const press = x > fall ? 0.07 * ring(x - fall, 3.4, 11) : 0;
        return writeItem(e, Math.min(1, x / 0.07), (ox / l) * d, 0, (oz / l) * d, 1 + press * 0.5, 1 - press);
      }
      const pop = Math.min(1, x / 0.06);
      if (x < fall) {
        const k = x / fall;
        if (style === 'soft') return writeItem(e, pop, 0, height * (1 - easeOut(k)) + 0.02 * Math.sin(k * 9 + e.seed * 6) * (1 - k), 0, 1, 1); // pousa planando
        if (style === 'place' || style === 'candles') return writeItem(e, pop, 0, height * (1 - easeOut(k)), 0, 1, 1); // a mão desce e firma
        return writeItem(e, pop, 0, height * (1 - k * k), 0, 1 + 0.05 * k, 1); // solta: cai acelerando
      }
      const u = x - fall;
      if (style === 'hard' || style === 'fruit') {
        // dois quiques que morrem; o doce amassa um nada no primeiro pouso
        const h1 = 0.16;
        const h2 = 0.1;
        let dy = 0;
        if (u < h1) dy = hop[0] * Math.sin((Math.PI * u) / h1);
        else if (u < h1 + h2) dy = hop[1] * Math.sin((Math.PI * (u - h1)) / h2);
        const sq = 0.09 * Math.exp(-u * 26);
        return writeItem(e, 1, 0, dy, 0, 1 - sq, 1 + sq * 0.5);
      }
      if (style === 'soft') {
        const w = 0.06 * ring(u, 2.2, 7);
        return writeItem(e, 1, 0, 0, 0, 1 - w, 1 + w * 0.5);
      }
      const w = 0.05 * ring(u, 3.2, 10);
      return writeItem(e, 1, 0, -0.012 * Math.exp(-u * 14), 0, 1 - w, 1 + w * 0.4);
    }

    return {
      ...tl,
      chain: isCandles ? 'candles.light' : null,
      update(t) {
        if (style === 'sprinkle') {
          // chuva de confeitos: cada um solta num instante sorteado e cai sem quicar
          list.forEach((e) => {
            const x = t - tl.from - e.seed * tl.rain;
            if (x <= 0) return writeItem(e, 0);
            const k = clamp01(x / tl.fall);
            if (e.side) {
              const ox = e.x - c.x;
              const oz = e.z - c.z;
              const l = Math.hypot(ox, oz) || 1;
              const d = 0.3 * (1 - k * k);
              return writeItem(e, Math.min(1, x / 0.05), (ox / l) * d, d * 0.5, (oz / l) * d);
            }
            const dy = k < 1 ? 0.6 * (1 - k * k) : 0.012 * Math.exp(-(x - tl.fall) * 18) * Math.abs(Math.sin((x - tl.fall) * 40));
            return writeItem(e, Math.min(1, x / 0.05), 0, dy, 0);
          });
        } else {
          clusters.forEach((cl, k) => {
            const x = t - tl.from - k * tl.step;
            cl.g.forEach((e) => one(e, x, tl.fall, tl.settle));
          });
        }
        flushItems(part);
      },
      pending() {
        list.forEach((e) => writeItem(e, 0));
        flushItems(part);
      },
      finish(skipped) {
        // (velas: se a animação foi cortada, elas já ficam acesas; senão, quem acende é a animação seguinte)
        if (!isCandles || skipped) part.flames.forEach((f) => (f.lv = S.candleState.lit ? 1 : 0));
        releasePart(part);
      },
    };
  }

  /* ───────── remove: a peça retirada encolhe e sai ───────── */
  function remove(p = {}) {
    const tl = timeline('remove', { ...p, part: p.id ? `decor:${p.id}` : p.part || '' });
    const parts = (p.parts || []).filter(Boolean);
    const topY = ctx.layout?.topY ?? ctx.m?.Htot ?? 1;
    return {
      ...tl,
      update(t) {
        const k = clamp01(t / tl.dur);
        // toma impulso (incha um nada), sobe e some
        const s = k < 0.2 ? 1 + 0.07 * Math.sin((k / 0.2) * Math.PI) : 1 - easeIn((k - 0.2) / 0.8);
        parts.forEach((part) => {
          part.group.scale.setScalar(Math.max(s, 0.001));
          part.group.position.y = topY * (1 - s) + 0.3 * easeIn(k);
        });
      },
      finish() {
        parts.forEach((part) => ctx.disposePart(part));
        parts.length = 0;
      },
    };
  }

  /* ───────── velas ───────── */
  function candlesLight(p = {}) {
    const part = ctx.decorParts.get('velas');
    const flames = part?.flames || [];
    if (!flames.length) return null;
    const tl = timeline('candles.light', { ...p, count: flames.length });
    const spark = S.spark();
    const order = flames.map((f, i) => ({ f, i, x: f.flame.position.x })).sort((a, b) => a.x - b.x);
    S.candleState.lit = true;
    return {
      ...tl,
      update(t) {
        order.forEach(({ f }, k) => {
          const x = (t - tl.from - k * tl.step) / tl.flare;
          // a chama pega: cresce além do tamanho e assenta
          f.lv = x <= 0 ? 0 : x >= 1 ? 1 : backOut(x) * (1 + 0.35 * Math.sin(x * Math.PI));
        });
        // o fósforo: um ponto de luz que vai de vela em vela
        const cur = clamp01((t - tl.from + tl.step) / (order.length * tl.step)) * (order.length - 1);
        const a = order[Math.floor(cur)].f.flame.position;
        const b = order[Math.min(order.length - 1, Math.floor(cur) + 1)].f.flame.position;
        const k = cur - Math.floor(cur);
        const show = smooth(0, 0.12, t) * (1 - smooth(tl.from + order.length * tl.step - 0.05, tl.from + order.length * tl.step + 0.12, t));
        spark.visible = show > 0.02;
        _p.set(lerp(a.x, b.x, k) + 0.03, lerp(a.y, b.y, k) + 0.035 + 0.25 * (1 - smooth(0, tl.from, t)), lerp(a.z, b.z, k));
        G.cakeGroup.localToWorld(_p);
        spark.position.copy(_p);
        const fl = 0.16 + 0.03 * Math.sin(t * 47);
        spark.scale.set(fl * show, fl * show, 1);
      },
      finish() {
        flames.forEach((f) => (f.lv = 1));
        spark.visible = false;
      },
    };
  }

  function candlesBlow(p = {}) {
    const part = ctx.decorParts.get('velas');
    const flames = part?.flames || [];
    if (!flames.length) return null;
    const strength = Math.max(0, Math.min(1.5, p.strength ?? 1));
    const tl = timeline('candles.blow', { ...p, count: flames.length });
    const mat = flames[0].flame.material;
    // sopro fraco: só as chamas mais "fáceis" apagam; as outras deitam e voltam
    const fate = flames.map((f, i) => {
      const r = hash(i * 3.1 + 1);
      return { f, out: strength >= 0.6 || r < strength * 1.1, at: tl.out + r * tl.outSpan };
    });
    const left = fate.filter((x) => !x.out).length;
    let smoked = false;
    const result = { out: flames.length - left, left };
    return {
      ...tl,
      result,
      update(t) {
        // todas deitam com o sopro (o material da chama é um só)
        const lean = Math.sin(clamp01(t / 0.5) * Math.PI) * 0.95 * Math.min(1, strength + 0.25);
        mat.rotation = -lean;
        fate.forEach(({ f, out, at }) => {
          const flick = 1 - 0.35 * Math.sin(clamp01(t / 0.5) * Math.PI) * (0.6 + 0.4 * Math.sin(t * 60 + f.phase));
          f.lv = out ? Math.max(0, flick * (1 - smooth(at - 0.06, at, t))) : flick;
        });
        if (!smoked && t >= tl.out) {
          smoked = true;
          fate.forEach(({ f, out, at }) => {
            if (!out) return;
            G.cakeGroup.localToWorld(_p.copy(f.flame.position));
            S.smoke.emit(_p.x, _p.y + 0.01, _p.z, at - tl.out, ctx.tier.detail < 1 ? 2 : 3);
          });
        }
      },
      finish() {
        mat.rotation = 0;
        fate.forEach(({ f, out }) => (f.lv = out ? 0 : 1));
        S.candleState.lit = left > 0;
      },
    };
  }

  /* ───────── cut: a faca corta e a fatia sai ───────── */
  function cut(p = {}) {
    const m = ctx.m;
    if (!m) return null;
    if (ctx.wedge.span > 0.002) return null; // já está aberto
    const tl = timeline('cut', p);
    const { a, span } = ctx.WEDGE;
    const b = a + span;
    const c = m.base.center;
    const mid = a + span / 2;
    const slice = new THREE.Group();
    slice.visible = false;
    G.cakeGroup.add(slice);
    // planos da fatia: o contrário dos do bolo (aqui fica só o que está DENTRO da cunha)
    const nA = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    const nB = new THREE.Vector3(Math.sin(b), 0, -Math.cos(b));
    const planes = [new THREE.Plane(nA.clone(), 0), new THREE.Plane(nB.clone(), 0)];
    const owned = [];
    const faceGeos = [];
    const cloneMat = (mt) => {
      const copy = mt.clone();
      copy.clippingPlanes = planes;
      copy.clipIntersection = false;
      copy.clipShadows = false;
      copy.transparent = false;
      copy.opacity = 1;
      copy.depthWrite = true;
      owned.push(copy);
      return copy;
    };
    const copyOf = (src) => {
      const mats = Array.isArray(src.material) ? src.material.map(cloneMat) : cloneMat(src.material);
      const ms = new THREE.Mesh(src.geometry, mats);
      src.updateWorldMatrix(true, false);
      G.cakeGroup.updateWorldMatrix(true, false);
      ms.applyMatrix4(_m4.copy(G.cakeGroup.matrixWorld).invert().multiply(src.matrixWorld));
      ms.castShadow = false;
      slice.add(ms);
    };
    [G.bodyGroup, G.dripGroup].forEach((grp) => grp.traverse((o) => o.isMesh && !o.isInstancedMesh && o.visible && o.material && !(o.material.transparent && !Array.isArray(o.material)) && copyOf(o)));
    // as duas faces da fatia: as do "resto do bolo" de uma cunha complementar
    let ok = !m.stack.some((t) => t.volcano);
    if (ok) {
      try {
        m.stack.forEach((t, ti) => {
          const local = Object.assign(Object.create(t), { center: m.base.center });
          const faces = buildCutFaces(local, { thetaA: b, thetaB: a + TAU, drip: ctx.config.drip.on, seed: t.n + ti * 5 });
          const g = new THREE.Group();
          g.position.y = t.y0;
          slice.add(g);
          const add = (geo, mat) => {
            if (!geo) return;
            faceGeos.push(geo);
            const ms = new THREE.Mesh(geo, mat);
            ms.castShadow = false;
            g.add(ms);
          };
          faces.sponge.forEach((geo, i) => add(geo, ctx.mats.crumbMat(i)));
          faces.filling.forEach((geo, i) => add(geo, ctx.mats.cutFillMat(i)));
          faces.jam.forEach((geo, i) => geo && add(geo, ctx.mats.cutJamMat(i)));
          if (faces.pieces) add(faces.pieces, ctx.mats.fruitPieces());
          add(faces.frost, ctx.mats.frostOf(ti).cut);
          if (faces.drip) add(faces.drip, ctx.mats.cutDrip);
        });
      } catch (err) {
        ok = false;
      }
    }
    // o bico e as decorações que ficam em cima da fatia saem junto com ela: são as mesmas peças que o motor
    // esconde do bolo quando a fatia é retirada (mesma malha, mesmo material: nada novo para a placa de vídeo)
    const riders = [];
    const wedgeNow = { a, span };
    [ctx.pipingPart, ...ctx.decorParts.values()].filter(Boolean).forEach((part) => {
      part.batches.forEach((bt) => {
        if (!bt.mesh) return;
        const inside = bt.items.filter((it) => inWedge(it, wedgeNow));
        if (!inside.length) return;
        const copy = new THREE.InstancedMesh(bt.geometry, bt.material, inside.length);
        const tinted = bt.items.some((it) => it.color != null);
        inside.forEach((it, i) => {
          copy.setMatrixAt(i, _m4.compose(_p.set(it.x, it.y, it.z), it.q, _s.set(it.s[0], it.s[1], it.s[2])));
          if (tinted) copy.setColorAt(i, _col.set(it.color != null ? it.color : 0xffffff));
        });
        copy.castShadow = false;
        copy.frustumCulled = false;
        slice.add(copy);
        riders.push(copy);
      });
    });
    let ready = false;
    ctx.compileQuietly(slice, () => (ready = true));
    const knife = tool('knife');
    knife.visible = false;
    const R = m.base.bounds.maxR;
    const top = m.Htot;
    const out = new THREE.Vector3(Math.cos(mid), 0, Math.sin(mid));
    let opened = false;
    let openT = 0;
    const setPlanes = (off) => {
      planes[0].constant = -nA.dot(_v.set(c.x + off.x, 0, c.z + off.z));
      planes[1].constant = -nB.dot(_v);
    };
    setPlanes(_v2.set(0, 0, 0));
    const knifeAt = (ang, x) => {
      // a faca desce no plano do corte, do alto até o prato, e sobe de volta
      const k = x < 0.2 ? easeIn(clamp01(x / 0.2)) : 1 - smooth(0.26, 0.4, x);
      knife.visible = x > -0.12 && x < 0.42;
      const dx = Math.cos(ang);
      const dz = Math.sin(ang);
      knife.position.set(c.x + dx * R * 0.55, lerp(top + 0.7, 0.02, k), c.z + dz * R * 0.55);
      knife.rotation.set(0, Math.atan2(dx, dz), 0);
      const s = Math.max(0.55, Math.min(1.6, (R * 1.25) / 1.1));
      knife.scale.set(1, 1, s);
    };
    return {
      ...tl,
      update(t) {
        if (t < tl.knifeB - 0.2) knifeAt(a, t - (tl.knifeA - 0.2));
        else knifeAt(b, t - (tl.knifeB - 0.2));
        if (!opened && t >= tl.open && (ready || t > tl.open + 0.5)) {
          opened = true;
          openT = t;
          ctx.openWedge(span);
          ctx.viewInside();
          slice.visible = ok;
        }
        if (!opened) return;
        const x = t - openT;
        const k = easeOut(clamp01(x / tl.slide));
        const gone = smooth(tl.leave - tl.open, tl.dur - tl.open, x);
        const d = (R * 0.9 + 0.5) * k + 0.8 * gone;
        _v2.copy(out).multiplyScalar(d);
        slice.position.set(_v2.x, 0.05 * Math.sin(Math.PI * clamp01(x / tl.slide)), _v2.z);
        const s = 1 - gone;
        slice.scale.setScalar(Math.max(s, 0.001));
        slice.position.x += (c.x + out.x * R * 0.5) * (1 - s);
        slice.position.z += (c.z + out.z * R * 0.5) * (1 - s);
        setPlanes(_v2);
        // (a fatia encolhe em torno do meio dela; os planos acompanham só o deslocamento)
        if (s < 0.999) slice.traverse((o) => o.isMesh && (o.visible = s > 0.02));
      },
      finish() {
        if (!opened) {
          ctx.openWedge(span);
          ctx.viewInside();
        }
        knife.visible = false;
        knife.scale.setScalar(1);
        G.cakeGroup.remove(slice);
        faceGeos.forEach((g) => g.dispose());
        owned.forEach((mt) => mt.dispose());
        riders.forEach((r) => r.dispose());
      },
    };
  }

  /* ───────── resize / tier / swap ───────── */
  function resize(p = {}) {
    const m = ctx.m;
    if (!m) return null;
    const tl = timeline('resize', p);
    const prev = p.prevM;
    const shape = p.what === 'shape';
    const rr = prev && !shape ? THREE.MathUtils.clamp(prev.base.R / m.base.R, 0.55, 1.6) : 0.86;
    const rh = prev && !shape ? THREE.MathUtils.clamp(prev.Htot / m.Htot, 0.55, 1.6) : 1.1;
    const hold = [ctx.pipingPart, ...ctx.decorParts.values()].filter(Boolean);
    return {
      ...tl,
      start() {
        // bico e decorações reaparecem quando o bolo assenta
        hold.forEach((part, i) => !part.r5clip && (part.born = ctx.now + 0.22 + i * 0.06));
        ctx.refreshParts(true);
      },
      update(t) {
        const k = clamp01(t / tl.dur);
        // sai do tamanho antigo, passa um pouco do novo e assenta (volume conservado: o que alarga, abaixa)
        const w = ring(k * 0.62, 2.4, 6.5);
        const sxz = 1 + (rr - 1) * w;
        const sy = 1 + (rh - 1) * w - (rr === 1 ? 0 : 0.04 * Math.sin(k * Math.PI));
        G.cakeGroup.scale.set(sxz, sy, sxz);
        G.standGroup.scale.set(sxz, 1, sxz);
      },
      finish() {
        G.cakeGroup.scale.setScalar(1);
        G.standGroup.scale.setScalar(1);
      },
    };
  }

  function tierUp(p = {}) {
    const m = ctx.m;
    if (!m || m.stack.length < 2) return resize(p);
    const ti = m.stack.length - 1;
    const tl = timeline('tier', { ...p, index: ti });
    const cover = ctx.named.get(`cobertura:${ti}`)?.objects[0];
    const g = cover?.parent && cover.parent !== G.bodyGroup ? cover.parent : null;
    if (!g) return resize(p);
    const extra = [ctx.named.get(`cobertura:${ti}:rosetas`)?.objects[0], ctx.named.get(`calda:${ti}`)?.objects[0]].filter(Boolean);
    const y0 = g.position.y;
    const t0 = m.stack[ti];
    const parts = () => [ctx.pipingPart, ...ctx.decorParts.values()].filter(Boolean);
    const lower = p.prevM ? THREE.MathUtils.clamp(p.prevM.base.R / m.base.R, 0.6, 1.5) : 1;
    let shown = false;
    return {
      ...tl,
      update(t) {
        if (!shown) parts().forEach((part) => (part.group.visible = false));
        const [dy, sy, sxz] = dropPose(t - tl.drop, tl.land - tl.drop, 1.5, 0.14);
        g.visible = t >= tl.drop - 0.02;
        g.position.set(t0.center.x * (1 - sxz), y0 + dy, t0.center.z * (1 - sxz));
        g.scale.set(sxz, sy, sxz);
        extra.forEach((o) => {
          o.visible = t >= tl.drop - 0.02;
          o.userData.r5y ??= o.position.y;
          o.position.y = o.userData.r5y + dy;
        });
        // os andares de baixo crescem para receber o novo e cedem quando ele pousa
        const k = clamp01(t / 0.4);
        const base = 1 + (lower - 1) * ring(k * 0.6, 2.4, 6.5);
        const press = t > tl.land ? 0.03 * ring(t - tl.land, 3.1, 9) : 0;
        G.cakeGroup.scale.set(base, 1 - press, base);
        G.standGroup.scale.set(base, 1, base);
        if (t >= tl.land + 0.06 && !shown) {
          shown = true;
          parts().forEach((part, i) => {
            part.group.visible = true;
            if (!part.r5clip) part.born = ctx.now + i * 0.07;
          });
          ctx.refreshParts(true);
        }
      },
      finish() {
        g.visible = true;
        g.position.set(0, y0, 0);
        g.scale.setScalar(1);
        extra.forEach((o) => {
          o.visible = true;
          if (o.userData.r5y != null) o.position.y = o.userData.r5y;
        });
        G.cakeGroup.scale.setScalar(1);
        G.standGroup.scale.setScalar(1);
        parts().forEach((part) => (part.group.visible = true));
      },
    };
  }

  /** Transição curta (desfazer, inspiração, surpresa): o bolo dá um pulinho e assenta. */
  function swap(p = {}) {
    const tl = timeline('swap', p);
    return {
      ...tl,
      update(t) {
        const w = ring(clamp01(t / tl.dur) * 0.5, 2.2, 6);
        G.cakeGroup.scale.set(1 - 0.05 * w, 1 + 0.045 * w, 1 - 0.05 * w);
      },
      finish() {
        G.cakeGroup.scale.setScalar(1);
      },
    };
  }

  /* ───────── reveal: luz baixa, foco no bolo, giro de vitrine, brilhos ───────── */
  function revealClip(p = {}) {
    const m = ctx.m;
    if (!m) return null;
    const tl = timeline('reveal', p);
    const L = ctx.lights;
    if (!reveal.on) Object.assign(reveal, { hemi: L.hemi.intensity, key: L.key.intensity, fill: L.fill.intensity, rim: L.rim.intensity, exposure: ctx.renderer.toneMappingExposure });
    const from = S.revealLevel;
    const hold = Boolean(p.hold);
    const calm = ctx.reduceMotion;
    const set = (k) => {
      S.revealLevel = k;
      L.hemi.intensity = reveal.hemi * (1 - 0.56 * k);
      L.key.intensity = reveal.key * (1 + 0.12 * k);
      L.fill.intensity = reveal.fill * (1 - 0.55 * k);
      L.rim.intensity = reveal.rim * (1 + 0.9 * k);
      S.sets.dim(k);
      S.sparkles.set(calm ? 0 : k);
    };
    const R = m.base.bounds.maxR;
    S.sparkles.place({ cx: 0, cz: m.center.z * 0.5, r0: R + 0.15, r1: R + 1.5, y0: -0.2, y1: m.Htot + 1.2 });
    reveal.on = true;
    const inDur = calm ? 0.15 : tl.dim;
    return {
      ...tl,
      start() {
        if (!calm && !p.still) ctx.spinCamera({ turns: p.turns ?? 1, dur: Math.max(1.2, tl.dur - 0.5) });
      },
      update(t) {
        const up = lerp(from, 1, easeInOut(clamp01(t / inDur)));
        const down = hold ? 0 : easeInOut(clamp01((t - (tl.dur - 0.6)) / 0.6));
        set(up * (1 - down));
      },
      finish() {
        set(hold ? 1 : 0);
        if (!hold) reveal.on = false;
      },
    };
  }
  /** Sai da revelação (quando ela ficou "presa" para a foto). */
  function revealOff() {
    if (!reveal.on) return null;
    const from = S.revealLevel;
    const L = ctx.lights;
    const set = (k) => {
      S.revealLevel = k;
      L.hemi.intensity = reveal.hemi * (1 - 0.56 * k);
      L.key.intensity = reveal.key * (1 + 0.12 * k);
      L.fill.intensity = reveal.fill * (1 - 0.55 * k);
      L.rim.intensity = reveal.rim * (1 + 0.9 * k);
      S.sets.dim(k);
      S.sparkles.set(ctx.reduceMotion ? 0 : k);
    };
    return {
      dur: ctx.reduceMotion ? 0.15 : 0.5,
      cues: [],
      update(t) {
        set(from * (1 - easeInOut(clamp01(t / this.dur))));
      },
      finish() {
        set(0);
        reveal.on = false;
      },
    };
  }

  /* ───────── celebrate: confete de papel ───────── */
  function celebrate(p = {}) {
    const m = ctx.m;
    if (!m || ctx.reduceMotion) return null;
    const tl = timeline('celebrate', p);
    return {
      ...tl,
      start() {
        const r = viewDir(90);
        const b = viewDir(180);
        S.confetti.burst({
          center: new THREE.Vector3(0, 0, m.center.z * 0.5),
          top: m.Htot + 0.6,
          right: new THREE.Vector3(r.x, 0, r.z),
          back: new THREE.Vector3(b.x, 0, b.z),
          ground: S.sets.visible ? S.sets.benchY : ctx.stand.floorY,
          spread: m.base.bounds.maxR + 0.9,
          seconds: tl.dur,
        });
      },
      update() {},
      finish() {
        S.confetti.stop();
      },
    };
  }

  /** No replay: uma peça (disco de massa ou recheio) entra na pilha. */
  function stackPiece(p = {}) {
    const [kind, ti, i] = String(p.id || '').split(':');
    const objs = layerObjs(kind, Number(ti), Number(i));
    if (!objs.length) return null;
    const dur = p.dur || 0.5;
    const isFill = kind === 'recheio';
    const fall = dur * 0.5;
    return {
      dur,
      cues: [{ name: isFill ? 'plop' : 'stack', at: isFill ? dur * 0.25 : fall, dur: 0, count: 1, part: p.id, kind: 'hit' }],
      update(t) {
        if (isFill) {
          const k = clamp01(t / (dur * 0.8));
          pose(objs, 0, lerp(2.1, 1, easeOut(k)), lerp(0.28, 1, easeOut(k)), true);
        } else pose(objs, ...dropPose(t, fall, 0.9, 0.16), true);
      },
      finish() {
        // (a tampa do recheio fica até a massa de cima chegar; quem a esconde é o fim do replay)
        pose(objs, 0, 1, 1, true);
      },
    };
  }

  return {
    intro,
    layer,
    filling,
    soak,
    cover: (p) => coat(p, 'cover'),
    style: (p) => coat(p, 'style'),
    drip,
    dripOne,
    piping,
    decor,
    remove,
    'candles.light': candlesLight,
    'candles.blow': candlesBlow,
    cut,
    resize,
    tier: tierUp,
    swap,
    reveal: revealClip,
    revealOff,
    celebrate,
    stackPiece,
    layerObjs,
    dispose() {
      droplets?.dispose();
      dropMat?.dispose();
    },
  };
}
