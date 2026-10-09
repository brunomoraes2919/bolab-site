// BOLAB — motor 3D do personalizador (Three.js).
//
//   const cake = createCakeScene(canvas, { onContextLost, onContextRestored, onInteract });
//   cake.setConfig(config)            atualiza o bolo (reconstrói só o que mudou, com animação)
//   cake.setCutaway(true|false)       "Ver por dentro": retira uma fatia e mostra massa e recheio
//   cake.setAutoRotate(true|false)    giro automático (pausa enquanto a pessoa mexe)
//   cake.setView('default'|'top')     enquadramentos prontos · cake.resetView()
//   cake.snapshot({ size })           → dataURL JPEG sobre o fundo da marca
//   cake.resize() · cake.dispose()
//
// createCakeScene lança erro se o aparelho não tiver WebGL: a tela trata e segue sem o 3D.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createTextureKit } from './textures.js';
import { cakeMetrics, buildFrosting, buildSponge, buildFillingBand, buildTopCream, buildScrapeCoat, buildDrip, buildCutFaces, buildStand } from './geometry.js';
import { createDecorLibrary, decorLayout, buildPiping, buildDecor, decorHeight, inWedge } from './decor.js';
import { getFlavor, getFilling } from '../data/customizer.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const WEDGE_A = 22 * DEG; // a fatia retirada fica de frente para a câmera padrão
const WEDGE_SPAN = 86 * DEG;
const VIEW = {
  default: { az: 26 * DEG, polar: 67 * DEG },
  top: { az: 26 * DEG, polar: 52 * DEG },
  inside: { az: 34 * DEG, polar: 63 * DEG },
};

const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const backOut = (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
const bounce = (t) => {
  // mola amortecida: passa um pouco do ponto e assenta
  return 1 - Math.exp(-6.5 * t) * Math.cos(11 * t) * (1 - t);
};

/**
 * Cor de material que, depois da luz e do tone mapping, aparece na tela parecida com a cor
 * escolhida no seletor: tons claros são levemente escurecidos e ganham um pouco de saturação.
 */
const _hsl = { h: 0, s: 0, l: 0 };
function displayColor(hex, target = new THREE.Color()) {
  target.set(hex).getHSL(_hsl);
  const light = THREE.MathUtils.smoothstep(_hsl.l, 0.45, 0.8);
  return target.setHSL(_hsl.h, Math.min(1, _hsl.s * (1 + 0.1 * light)), _hsl.l * (1 - 0.095 * light));
}

export function isWebGLAvailable() {
  try {
    const c = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

/** Ajustes de material para cada tipo de cobertura. */
const COVERING_LOOK = {
  buttercream: { roughness: 0.56, clearcoat: 0.05, clearcoatRoughness: 0.5, sheen: 0.45, normal: 'streak', normalScale: 0.26, topNormal: 'swirl', topScale: 0.3, env: 0.95 },
  chantilly: { roughness: 0.82, clearcoat: 0, clearcoatRoughness: 0.6, sheen: 0.8, normal: 'soft', normalScale: 0.5, topNormal: 'soft', topScale: 0.5, env: 1 },
  ganache: { roughness: 0.2, clearcoat: 0.75, clearcoatRoughness: 0.14, sheen: 0, normal: 'soft', normalScale: 0.07, topNormal: 'soft', topScale: 0.07, env: 1.15 },
  glace: { roughness: 0.07, clearcoat: 1, clearcoatRoughness: 0.03, sheen: 0, normal: null, normalScale: 0, topNormal: null, topScale: 0, env: 1.3 },
  chocolate: { roughness: 0.4, clearcoat: 0.28, clearcoatRoughness: 0.32, sheen: 0, normal: 'streak', normalScale: 0.5, topNormal: 'swirl', topScale: 0.5, env: 1 },
  mousse: { roughness: 0.76, clearcoat: 0, clearcoatRoughness: 0.6, sheen: 0.5, normal: 'pore', normalScale: 0.45, topNormal: 'pore', topScale: 0.45, env: 0.95 },
  naked: { roughness: 0.74, clearcoat: 0, clearcoatRoughness: 0.6, sheen: 0.6, normal: 'soft', normalScale: 0.45, topNormal: 'swirl', topScale: 0.35, env: 1 },
};

export function createCakeScene(canvas, { onContextLost, onContextRestored, onInteract } = {}) {
  if (!isWebGLAvailable()) throw new Error('WebGL indisponível');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lowEnd = window.matchMedia('(max-width: 899px)').matches || (navigator.deviceMemory && navigator.deviceMemory <= 4);

  /* ───────── Renderizador ───────── */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  const tex = createTextureKit({ aniso: Math.min(8, renderer.capabilities.getMaxAnisotropy()), small: lowEnd });
  const lib = createDecorLibrary(tex);

  let pmrem = null;
  let envTarget = null;
  function buildEnvironment() {
    envTarget?.dispose();
    pmrem?.dispose();
    pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    envTarget = pmrem.fromScene(room, 0.035);
    room.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    scene.environment = envTarget.texture;
  }
  buildEnvironment();

  /* ───────── Luzes ───────── */
  const hemi = new THREE.HemisphereLight(0xfff6f0, 0xf6c9d4, 0.85);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff0e0, 2.1);
  key.castShadow = true;
  key.shadow.mapSize.set(lowEnd ? 1024 : 2048, lowEnd ? 1024 : 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 5;
  key.shadow.blurSamples = 12;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xffe3ea, 0.9);
  scene.add(fill, fill.target);
  const rim = new THREE.DirectionalLight(0xffffff, 1.0);
  scene.add(rim, rim.target);
  // brilho quente das velas: fica sempre na cena (intensidade 0 sem velas) para não recompilar materiais
  const candleLight = new THREE.PointLight(0xffb066, 0, 3.4, 2);
  scene.add(candleLight);

  /* ───────── Chão: sombra projetada + sombra de contato ───────── */
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.ShadowMaterial({ color: 0x6d2338, opacity: 0.17 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: tex.contactShadow(), color: 0x5c1d30, transparent: true, opacity: 0.34, depthWrite: false, toneMapped: false }),
  );
  contact.rotation.x = -Math.PI / 2;
  scene.add(contact);

  /* ───────── Planos de corte ("Ver por dentro") ───────── */
  const OFF = () => new THREE.Plane(new THREE.Vector3(0, 1, 0), 1000);
  const clipPlanes = [OFF(), OFF()];
  const clipped = { clippingPlanes: clipPlanes, clipIntersection: true, clipShadows: true };

  /* ───────── Materiais ───────── */
  const porcelain = new THREE.MeshPhysicalMaterial({ color: 0xfffdfb, roughness: 0.2, clearcoat: 0.9, clearcoatRoughness: 0.12 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xe6bb62, metalness: 0.88, roughness: 0.28, emissive: 0x6b4a10, emissiveIntensity: 0.4 });
  const frostSide = new THREE.MeshPhysicalMaterial({ color: 0xffffff, sheenColor: 0xffffff, sheenRoughness: 0.55, ...clipped });
  const frostTop = new THREE.MeshPhysicalMaterial({ color: 0xffffff, sheenColor: 0xffffff, sheenRoughness: 0.55, ...clipped });
  const cutFrost = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, emissiveIntensity: 0.12 });
  cutFrost.emissive = cutFrost.color;
  const dripMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.2, clearcoat: 0.85, clearcoatRoughness: 0.12, ...clipped });
  const cutDrip = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });
  const scrapeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex.scrape(), transparent: true, roughness: 0.8, depthWrite: false, ...clipped });
  // por camada / por recheio (criados sob demanda, até 4)
  const crustMats = [];
  const crumbMats = [];
  const bandMats = [];
  const cutFillMats = [];
  const layerMat = (list, i, make) => {
    if (!list[i]) list[i] = make();
    return list[i];
  };
  const crustMat = (i) =>
    layerMat(crustMats, i, () => new THREE.MeshStandardMaterial({ map: tex.crust(), bumpMap: tex.crumbBump(), bumpScale: 1.4, roughness: 0.88, ...clipped }));
  const crumbMat = (i) =>
    layerMat(crumbMats, i, () => {
      const mat = new THREE.MeshStandardMaterial({ map: tex.crumb(), emissiveMap: tex.crumb(), bumpMap: tex.crumbBump(), bumpScale: 2.2, roughness: 0.92, vertexColors: true, emissiveIntensity: 0.26 });
      mat.emissive = mat.color; // o miolo "acende" um pouco na própria cor, como massa de verdade atravessada pela luz
      return mat;
    });
  const bandMat = (i) => layerMat(bandMats, i, () => new THREE.MeshPhysicalMaterial({ roughness: 0.5, ...clipped }));
  const cutFillMat = (i) =>
    layerMat(cutFillMats, i, () => {
      const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.5, vertexColors: true, emissiveIntensity: 0.16 });
      mat.emissive = mat.color;
      return mat;
    });

  /* ───────── Grupos ───────── */
  const standGroup = new THREE.Group();
  const cakeGroup = new THREE.Group();
  const bodyGroup = new THREE.Group();
  const cutGroup = new THREE.Group();
  const dripGroup = new THREE.Group();
  cakeGroup.add(bodyGroup, dripGroup, cutGroup);
  scene.add(standGroup, cakeGroup);

  /* ───────── Câmera e controles ───────── */
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.085;
  controls.rotateSpeed = 0.75;
  controls.zoomSpeed = 0.7;
  controls.minPolarAngle = 18 * DEG;
  controls.maxPolarAngle = 86 * DEG;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };

  /* ───────── Estado ───────── */
  let config = null;
  let m = null;
  let layout = null;
  let stand = null;
  let keys = {};
  let pipingPart = null;
  const decorParts = new Map();
  let wedge = { a: WEDGE_A, span: 0 };
  let cutaway = false;
  let autoRotate = false;
  let userActive = false;
  let resumeTimer = 0;
  let viewName = 'default';
  let fitDist = 6;
  let flying = null;
  let swayT = 0;
  let swayBase = VIEW.inside.az;
  let running = false;
  let raf = 0;
  let dirty = true;
  let lost = false;
  let disposed = false;
  let now = 0;
  let lastFrame = 0;
  let size = { w: 1, h: 1 };
  const tweens = new Map();
  let tweenSeq = 0;

  function invalidate() {
    dirty = true;
  }

  /* ───────── Animações ───────── */
  function tween(keyName, dur, update, { ease = easeOut, delay = 0, done } = {}) {
    const k = keyName || `t${tweenSeq++}`;
    if (reduceMotion || dur <= 0) {
      tweens.delete(k);
      update(1);
      done?.();
      invalidate();
      return;
    }
    tweens.set(k, { t: -delay, dur, update, ease, done });
  }

  function settle() {
    [...tweens.values()].forEach((tw) => {
      tw.update(1);
      tw.done?.();
    });
    tweens.clear();
    if (flying) {
      applySpherical(flying.to);
      flying = null;
    }
    const far = now + 10;
    if (pipingPart) pipingPart.born = -far;
    decorParts.forEach((p) => (p.born = -far));
    refreshParts(true);
  }

  function tweenColor(keyName, mats, hex, dur = 0.32) {
    const to = displayColor(hex);
    const from = mats[0].color.clone();
    if (from.equals(to)) return;
    tween(keyName, dur, (k) => mats.forEach((mt) => mt.color.copy(from).lerp(to, k)));
  }

  /* ───────── Construção ───────── */
  function disposeGroup(group) {
    group.traverse((o) => {
      if (o.isMesh && !o.isInstancedMesh) o.geometry?.dispose();
    });
    group.clear();
  }

  function mesh(geo, material, { cast = true, receive = true } = {}) {
    const ms = new THREE.Mesh(geo, material);
    ms.castShadow = cast;
    ms.receiveShadow = receive;
    return ms;
  }

  function rebuildStand() {
    disposeGroup(standGroup);
    stand = buildStand(m);
    standGroup.add(mesh(stand.plate, porcelain), mesh(stand.rim, gold, { cast: false }), mesh(stand.foot, porcelain), mesh(stand.board, gold, { cast: false }));
    floor.position.y = stand.floorY;
    contact.position.y = stand.floorY + 0.002;
    const footR = stand.plateRadius * 0.5;
    contact.scale.set(footR * 3.6, footR * 3.6, 1);
    const reach = stand.plateRadius + 1.2;
    const sc = key.shadow.camera;
    sc.left = -reach;
    sc.right = reach;
    sc.top = reach + 1;
    sc.bottom = -reach;
    sc.near = 0.5;
    sc.far = 18;
    sc.updateProjectionMatrix();
  }

  function applyCoveringLook() {
    const look = COVERING_LOOK[config.covering.type] || COVERING_LOOK.buttercream;
    const mapOf = (name) => (name === 'streak' ? tex.streakNormal() : name === 'swirl' ? tex.swirlNormal() : name === 'soft' ? tex.softNormal() : name === 'pore' ? tex.poreNormal() : null);
    const round = m.shape === 'round';
    [
      [frostSide, look.normal, look.normalScale],
      [frostTop, look.topNormal === 'swirl' && !round ? look.normal : look.topNormal, look.topScale],
    ].forEach(([mat, mapName, scale], isTop) => {
      mat.roughness = look.roughness;
      mat.clearcoat = look.clearcoat;
      mat.clearcoatRoughness = look.clearcoatRoughness;
      mat.sheen = look.sheen;
      mat.envMapIntensity = look.env;
      const map = mapOf(mapName);
      if (mat.normalMap !== map) {
        mat.normalMap = map;
        mat.needsUpdate = true;
      }
      mat.normalScale.setScalar(scale);
      // no topo, texturas que se repetem usam uma escala própria (a espiral cobre o topo inteiro)
      if (map && isTop && mapName !== 'swirl') map.repeat.set(1, 1);
    });
    cutFrost.roughness = Math.max(0.45, look.roughness);
  }

  function rebuildBody() {
    disposeGroup(bodyGroup);
    applyCoveringLook();
    if (!m.naked) {
      bodyGroup.add(mesh(buildFrosting(m), [frostSide, frostTop]));
    } else {
      m.layerY.forEach((_, i) => {
        const mat = crustMat(i);
        bodyGroup.add(mesh(buildSponge(m, i), [mat, mat]));
      });
      m.fillY.forEach((_, i) => bodyGroup.add(mesh(buildFillingBand(m, i), bandMat(i))));
      bodyGroup.add(mesh(buildTopCream(m), [frostSide, frostTop]));
      const coat = mesh(buildScrapeCoat(m), scrapeMat, { cast: false });
      coat.renderOrder = 2;
      bodyGroup.add(coat);
    }
  }

  function applyLayerColors(instant) {
    config.layers.forEach((id, i) => {
      const f = getFlavor(id);
      if (instant) {
        crustMat(i).color.set(f.crust);
        crumbMat(i).color.set(f.crumb);
      } else {
        tweenColor(`crust${i}`, [crustMat(i)], f.crust);
        tweenColor(`crumb${i}`, [crumbMat(i)], f.crumb);
      }
    });
    config.fillings.forEach((id, i) => {
      const f = getFilling(id);
      [bandMat(i), cutFillMat(i)].forEach((mat) => {
        mat.roughness = 0.72 - f.gloss * 0.5;
        mat.clearcoat = f.gloss * 0.7;
        mat.clearcoatRoughness = 0.25;
      });
      if (instant) {
        bandMat(i).color.set(f.color);
        cutFillMat(i).color.set(f.color);
      } else tweenColor(`fill${i}`, [bandMat(i), cutFillMat(i)], f.color);
    });
  }

  function rebuildDrip() {
    disposeGroup(dripGroup);
    if (!config.drip.on) return;
    const seed = (m.shape.length * 31 + Math.round(m.R * 100) + m.n * 7) | 0;
    dripGroup.add(mesh(buildDrip(m, seed), dripMat));
  }

  function rebuildCut() {
    disposeGroup(cutGroup);
    if (wedge.span <= 0.002) return;
    const faces = buildCutFaces(m, { thetaA: wedge.a, thetaB: wedge.a + wedge.span, drip: config.drip.on, seed: m.n });
    const opts = { cast: false, receive: true };
    faces.sponge.forEach((g, i) => g && cutGroup.add(mesh(g, crumbMat(i), opts)));
    faces.filling.forEach((g, i) => g && cutGroup.add(mesh(g, cutFillMat(i), opts)));
    if (faces.frost) cutGroup.add(mesh(faces.frost, cutFrost, opts));
    if (faces.drip) cutGroup.add(mesh(faces.drip, cutDrip, opts));
  }

  function applyWedge() {
    if (wedge.span <= 0.002) {
      clipPlanes[0].set(new THREE.Vector3(0, 1, 0), 1000);
      clipPlanes[1].set(new THREE.Vector3(0, 1, 0), 1000);
    } else {
      const a = wedge.a;
      const b = wedge.a + wedge.span;
      const nA = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a));
      const nB = new THREE.Vector3(-Math.sin(b), 0, Math.cos(b));
      const c = new THREE.Vector3(m.center.x, 0, m.center.z);
      clipPlanes[0].set(nA, -nA.dot(c));
      clipPlanes[1].set(nB, -nB.dot(c));
    }
    rebuildCut();
    refreshParts(true);
    invalidate();
  }

  function disposePart(part) {
    if (!part) return;
    cakeGroup.remove(part.group);
    part.dispose();
  }

  /** Atualiza a entrada animada e o que fica escondido pela fatia retirada. */
  function refreshParts(force) {
    const w = wedge.span > 0.002 ? wedge : null;
    const each = (part) => {
      if (!part) return;
      const age = now - part.born;
      if (!force && age > 1.3) return;
      part.batches.forEach((b) => b.update(age, w));
      part.objects.forEach((o, i) => {
        let f = 1;
        if (age < 1.2) {
          const t = (age - i * 0.03) / 0.34;
          f = t <= 0 ? 0 : t >= 1 ? 1 : backOut(t);
        }
        const hidden = w && inWedge(o, w);
        o.object.visible = !hidden && f > 0.001;
        if (!o.object.isSprite) o.object.scale.copy(o.scale).multiplyScalar(Math.max(f, 0.001));
      });
    };
    each(pipingPart);
    decorParts.forEach(each);
  }

  function partsAnimating() {
    if (pipingPart && now - pipingPart.born < 1.3) return true;
    for (const p of decorParts.values()) if (now - p.born < 1.3) return true;
    return false;
  }

  function buildContext() {
    return { config, m, lib, layout };
  }

  /** Lista das peças de decoração de uma configuração: id → chave (muda a chave, reconstrói). */
  function decorPlan(cfg, sig) {
    const plan = new Map();
    cfg.decor.items.forEach((id) => {
      if (id === 'topo') return;
      plan.set(id, `${sig}|${id}${id === 'velas' ? cfg.decor.candles : ''}`);
    });
    if (cfg.decor.items.includes('topo') || cfg.decor.message) plan.set('toppers', `${sig}|toppers|${cfg.decor.items.includes('topo')}|${cfg.decor.message}`);
    return plan;
  }

  /* ───────── Câmera ───────── */
  function getSpherical() {
    const off = camera.position.clone().sub(controls.target);
    const s = new THREE.Spherical().setFromVector3(off);
    return { az: s.theta, polar: s.phi, dist: s.radius, ty: controls.target.y, tz: controls.target.z };
  }

  function applySpherical(s) {
    controls.target.set(0, s.ty, s.tz ?? 0);
    const sp = new THREE.Spherical(s.dist, s.polar, s.az);
    camera.position.setFromSpherical(sp).add(controls.target);
    camera.lookAt(controls.target);
  }

  /** Distância e alvo para o bolo inteiro (com boleira e decoração) caber na tela. */
  function computeFit(aspect, polar) {
    const top = m.Ht + decorHeight(config) + 0.06;
    const bottom = stand.floorY;
    const halfH = (top - bottom) / 2;
    const halfW = stand.plateRadius + 0.04;
    const elev = Math.PI / 2 - polar;
    const tanV = Math.tan((camera.fov * DEG) / 2);
    const needV = (halfH * Math.cos(elev) + halfW * Math.sin(elev)) / tanV;
    const needH = halfW / (tanV * aspect);
    // bolos menores ficam um pouco mais longe: dá para sentir a diferença entre P, M e G
    const sizeCue = 1 + 0.13 * Math.max(0, 1.25 - m.R);
    return { dist: (Math.max(needV, needH) * 1.1 + 0.4) * sizeCue, ty: (top + bottom) / 2 - 0.02, tz: m.center.z * 0.5 };
  }

  function updateLimits() {
    controls.minDistance = fitDist * 0.5;
    controls.maxDistance = fitDist * 1.45;
  }

  function flyTo(to, dur = 0.7) {
    const from = getSpherical();
    // gira pelo caminho mais curto
    let d = (to.az - from.az) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    const target = { ...to, az: from.az + d };
    if (reduceMotion || dur <= 0) {
      applySpherical(target);
      controls.update();
      invalidate();
      return;
    }
    flying = { from, to: target, t: 0, dur };
  }

  /** Reenquadra mantendo o ângulo atual (quando o bolo muda de tamanho) ou indo para uma vista pronta. */
  function frame({ view = null, animate = true } = {}) {
    if (!m || !stand) return;
    const cur = getSpherical();
    const v = view ? VIEW[view] : null;
    // o coração só se lê bem visto mais de cima
    const polar = v ? v.polar - (m.shape === 'heart' && view !== 'inside' ? 9 * DEG : 0) : cur.polar;
    const az = v ? v.az : cur.az;
    const fit = computeFit(size.w / size.h, polar);
    const zoom = v || !fitDist ? 1 : THREE.MathUtils.clamp(cur.dist / fitDist, 0.5, 1.45);
    fitDist = fit.dist;
    updateLimits();
    const to = { az, polar, dist: fit.dist * zoom, ty: fit.ty, tz: fit.tz };
    if (animate) flyTo(to, 0.65);
    else {
      flying = null;
      applySpherical(to);
      controls.update();
    }
    invalidate();
  }

  /* ───────── API: configuração ───────── */
  function setConfig(next, { instant = false } = {}) {
    if (disposed || !next) return;
    const prev = config;
    const prevM = m;
    const first = !prev;
    config = JSON.parse(JSON.stringify(next));
    m = cakeMetrics(config);
    layout = decorLayout(config, m);
    const quiet = instant || reduceMotion;

    const kStand = `${config.shape}|${config.size}`;
    const kBody = `${kStand}|${m.n}|${config.covering.type}`;
    const kDrip = `${kBody}|${config.drip.on}`;
    const kPipe = `${kDrip}|${config.piping.style}|${config.piping.where}`;
    const kLayers = `${config.layers.join()}|${config.fillings.join()}`;
    const sig = `${kPipe}|${[...config.decor.items].sort().join()}|${config.decor.message ? 1 : 0}`;

    const standChanged = kStand !== keys.stand;
    const bodyChanged = kBody !== keys.body;
    if (standChanged) rebuildStand();
    if (bodyChanged) rebuildBody();

    // cores
    if (first || quiet) {
      [frostSide, frostTop, cutFrost].forEach((mt) => displayColor(config.covering.color, mt.color));
      [dripMat, cutDrip].forEach((mt) => displayColor(config.drip.color, mt.color));
      displayColor(config.piping.color, lib.mat.piping().color);
      tweens.delete('frost');
      tweens.delete('drip');
      tweens.delete('pipe');
    } else {
      tweenColor('frost', [frostSide, frostTop, cutFrost], config.covering.color);
      tweenColor('drip', [dripMat, cutDrip], config.drip.color);
      tweenColor('pipe', [lib.mat.piping()], config.piping.color);
    }
    displayColor(config.covering.color, scrapeMat.color);
    applyLayerColors(first || quiet || bodyChanged);

    if (kDrip !== keys.drip) rebuildDrip();

    if (kPipe !== keys.pipe) {
      const had = pipingPart && pipingPart.batches.length > 0;
      disposePart(pipingPart);
      pipingPart = buildPiping(buildContext());
      pipingPart.born = quiet || (had && keys.pipeStyle === `${config.piping.style}|${config.piping.where}`) ? -100 : now;
      cakeGroup.add(pipingPart.group);
    }

    // decorações: reconstrói só as que mudaram; só as novas entram com animação
    const plan = decorPlan(config, sig);
    [...decorParts.keys()].forEach((id) => {
      if (!plan.has(id)) {
        disposePart(decorParts.get(id));
        decorParts.delete(id);
      }
    });
    plan.forEach((k, id) => {
      const old = decorParts.get(id);
      if (old && old.key === k) return;
      const part = buildDecor(id, buildContext());
      part.key = k;
      part.born = quiet || (old && old.own === ownKey(id)) ? -100 : now;
      part.own = ownKey(id);
      disposePart(old);
      decorParts.set(id, part);
      cakeGroup.add(part.group);
    });

    if (wedge.span > 0.002 && (bodyChanged || kDrip !== keys.drip || kLayers !== keys.layers)) {
      applyWedge();
    } else refreshParts(true);

    // luz das velas
    const candles = decorParts.get('velas');
    if (candles?.lightAt) candleLight.position.copy(candles.lightAt);
    const lightTo = candles ? 0.5 + Math.sqrt(config.decor.candles) * 0.42 : 0;
    if (quiet) candleLight.userData.base = lightTo;
    else {
      const from = candleLight.userData.base || 0;
      tween('candle', 0.5, (k) => (candleLight.userData.base = from + (lightTo - from) * k));
    }

    // movimento: o bolo "assenta" quando ganha camada, muda de formato ou de tamanho
    if (!quiet) {
      if (first) {
        cakeGroup.scale.setScalar(0.82);
        tween('settle', 0.75, (k) => cakeGroup.scale.setScalar(0.82 + 0.18 * k), { ease: bounce });
      } else if (bodyChanged && prevM) {
        const ratio = prevM.n !== m.n ? THREE.MathUtils.clamp(prevM.Ht / m.Ht, 0.6, 1.4) : 1;
        const side = standChanged && wedge.span <= 0.002 ? 0.93 : 1;
        cakeGroup.scale.set(side, ratio === 1 ? 0.95 : ratio, side);
        const fromY = cakeGroup.scale.y;
        tween('settle', 0.7, (k) => cakeGroup.scale.set(side + (1 - side) * k, fromY + (1 - fromY) * k, side + (1 - side) * k), { ease: bounce });
      }
    } else {
      tweens.delete('settle');
      cakeGroup.scale.setScalar(1);
    }

    const topChanged = !prevM || Math.abs(prevM.Ht + decorHeight(prev) - (m.Ht + decorHeight(config))) > 0.02;
    if (first) frame({ view: viewName, animate: false });
    else if (standChanged || topChanged) frame({ animate: !quiet });

    keys = { stand: kStand, body: kBody, drip: kDrip, pipe: kPipe, layers: kLayers, pipeStyle: `${config.piping.style}|${config.piping.where}` };
    invalidate();
  }

  function ownKey(id) {
    if (id === 'velas') return `velas${config.decor.candles}`;
    if (id === 'toppers') return `toppers${config.decor.items.includes('topo')}${config.decor.message}`;
    return id;
  }

  /** Entrada em cena: o bolo assenta na boleira e as decorações aparecem uma a uma. */
  function playIntro() {
    if (!m || reduceMotion) return;
    cakeGroup.scale.setScalar(0.82);
    tween('settle', 0.8, (k) => cakeGroup.scale.setScalar(0.82 + 0.18 * k), { ease: bounce });
    if (pipingPart) pipingPart.born = now + 0.12;
    let i = 0;
    decorParts.forEach((p) => (p.born = now + 0.24 + 0.1 * i++));
    refreshParts(true);
    invalidate();
  }

  /** Refaz a plaquinha (chamado quando a fonte da marca termina de carregar). */
  function refreshText() {
    const old = decorParts.get('toppers');
    if (!old || !config?.decor.message) return;
    const part = buildDecor('toppers', buildContext());
    part.key = old.key;
    part.own = old.own;
    part.born = -100;
    disposePart(old);
    decorParts.set('toppers', part);
    cakeGroup.add(part.group);
    refreshParts(true);
    invalidate();
  }

  /* ───────── API: ver por dentro ───────── */
  function setCutaway(on, { instant = false } = {}) {
    on = Boolean(on);
    if (on === cutaway && !instant) return;
    cutaway = on;
    if (!m) return;
    const from = wedge.span;
    const to = on ? WEDGE_SPAN : 0;
    if (instant || reduceMotion) {
      tweens.delete('wedge');
      wedge.span = to;
      applyWedge();
    } else {
      tween('wedge', 0.62, (k) => {
        wedge.span = from + (to - from) * k;
        applyWedge();
      }, { ease: easeInOut });
    }
    if (on) {
      const fit = computeFit(size.w / size.h, VIEW.inside.polar);
      swayBase = VIEW.inside.az;
      swayT = 0;
      if (!instant) flyTo({ az: VIEW.inside.az, polar: VIEW.inside.polar, dist: fit.dist * 0.94, ty: fit.ty, tz: fit.tz }, 0.8);
    }
    invalidate();
  }

  function setAutoRotate(on) {
    autoRotate = Boolean(on) && !reduceMotion;
    userActive = false;
    swayT = 0;
    swayBase = getSpherical().az;
    invalidate();
  }

  function setView(name, { animate = true } = {}) {
    viewName = VIEW[name] ? name : 'default';
    if (m) frame({ view: viewName, animate });
  }

  function resetView() {
    if (!m) return;
    frame({ view: cutaway ? 'inside' : viewName, animate: true });
    swayT = 0;
    swayBase = cutaway ? VIEW.inside.az : VIEW[viewName].az;
  }

  /* ───────── Laço de desenho ───────── */
  function placeLights() {
    const s = getSpherical();
    const t = controls.target;
    const at = (az, elev, dist, light) => {
      light.position.set(t.x + Math.sin(az) * Math.cos(elev) * dist, t.y + Math.sin(elev) * dist, t.z + Math.cos(az) * Math.cos(elev) * dist);
      light.target.position.copy(t);
      light.target.updateMatrixWorld();
    };
    // luz principal sempre vindo do alto, à esquerda de quem olha
    at(s.az - 48 * DEG, 52 * DEG, 7, key);
    at(s.az + 70 * DEG, 18 * DEG, 6, fill);
    at(s.az + 165 * DEG, 38 * DEG, 6, rim);
  }

  function tick(time) {
    raf = 0;
    if (!running || lost || disposed) return;
    raf = requestAnimationFrame(tick);
    const t = time / 1000;
    const dt = Math.min(0.05, lastFrame ? t - lastFrame : 0.016);
    lastFrame = t;
    now += dt;

    let active = dirty;
    dirty = false;

    if (tweens.size) {
      active = true;
      tweens.forEach((tw, k) => {
        tw.t += dt;
        if (tw.t < 0) return;
        const p = Math.min(1, tw.t / tw.dur);
        tw.update(tw.ease(p));
        if (p >= 1) {
          tweens.delete(k);
          tw.done?.();
        }
      });
    }

    if (flying) {
      active = true;
      flying.t += dt;
      const p = Math.min(1, flying.t / flying.dur);
      const e = easeInOut(p);
      const a = flying.from;
      const b = flying.to;
      applySpherical({ az: a.az + (b.az - a.az) * e, polar: a.polar + (b.polar - a.polar) * e, dist: a.dist + (b.dist - a.dist) * e, ty: a.ty + (b.ty - a.ty) * e, tz: a.tz + (b.tz - a.tz) * e });
      if (p >= 1) {
        flying = null;
        swayBase = b.az;
        swayT = 0;
      }
    } else if (autoRotate && !userActive) {
      active = true;
      const s = getSpherical();
      if (cutaway) {
        // com o bolo aberto, a câmera só balança de leve em torno da fatia
        swayT += dt;
        s.az = swayBase + Math.sin(swayT * 0.55) * 0.42;
      } else s.az += dt * 0.24;
      applySpherical(s);
    }

    if (controls.update()) active = true;

    if (partsAnimating()) {
      active = true;
      refreshParts(false);
    }

    const candles = decorParts.get('velas');
    if (candles && candles.flames.length) {
      active = true;
      let sum = 0;
      candles.flames.forEach((f) => {
        const flick = reduceMotion ? 1 : 1 + Math.sin(now * 13 + f.phase) * 0.06 + Math.sin(now * 23.7 + f.phase * 2.1) * 0.05;
        const sway = reduceMotion ? 1 : 1 + Math.sin(now * 7.3 + f.phase) * 0.05;
        f.flame.scale.set(f.sx * sway, f.sy * flick, 1);
        f.glow.material.opacity = 0.5;
        f.glow.scale.setScalar(0.34 * (0.94 + (flick - 1) * 1.5));
        sum += flick;
      });
      candleLight.intensity = (candleLight.userData.base || 0) * (sum / candles.flames.length);
    } else candleLight.intensity = candleLight.userData.base || 0;

    if (!active) return;
    placeLights();
    renderer.render(scene, camera);
  }

  function start() {
    if (running || disposed || lost) return;
    running = true;
    lastFrame = 0;
    dirty = true;
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  /* ───────── Tamanho ───────── */
  function resize() {
    if (disposed) return;
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    if (w === size.w && h === size.h) return;
    size = { w, h };
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (m) frame({ animate: false });
    invalidate();
  }

  /* ───────── Foto do bolo ───────── */
  function paintBackdrop(ctx, w, h) {
    const g = ctx.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    g.addColorStop(0, '#fffdfb');
    g.addColorStop(0.55, '#fdeef2');
    g.addColorStop(1, '#f7d3dc');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  /** Desenha o bolo num <canvas> 2D (vista de catálogo, bolo fechado, sem interferir no que está na tela). */
  function snapshotCanvas({ size: px = 360, width = px, height = px, background = true, scale = 2 } = {}) {
    if (disposed || lost || !m) return null;
    settle();
    const keepCam = getSpherical();
    const keepWedge = wedge.span;
    const keepSize = { ...size };
    const keepRatio = renderer.getPixelRatio();
    try {
      if (keepWedge > 0.002) {
        wedge.span = 0;
        applyWedge();
      }
      const ss = Math.min(scale, 4096 / Math.max(width, height));
      renderer.setPixelRatio(1);
      renderer.setSize(Math.round(width * ss), Math.round(height * ss), false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const fit = computeFit(width / height, VIEW.default.polar);
      applySpherical({ az: VIEW.default.az, polar: VIEW.default.polar, dist: fit.dist, ty: fit.ty, tz: fit.tz });
      candleLight.intensity = candleLight.userData.base || 0;
      placeLights();
      renderer.render(scene, camera);
      const out = document.createElement('canvas');
      out.width = width;
      out.height = height;
      const ctx = out.getContext('2d');
      if (background) paintBackdrop(ctx, width, height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(renderer.domElement, 0, 0, width, height);
      return out;
    } finally {
      renderer.setPixelRatio(keepRatio);
      renderer.setSize(keepSize.w, keepSize.h, false);
      camera.aspect = keepSize.w / keepSize.h;
      camera.updateProjectionMatrix();
      applySpherical(keepCam);
      if (keepWedge > 0.002) {
        wedge.span = keepWedge;
        applyWedge();
      }
      placeLights();
      renderer.render(scene, camera);
      invalidate();
    }
  }

  function snapshot({ type = 'image/jpeg', quality = 0.82, ...opts } = {}) {
    const c = snapshotCanvas(opts);
    return c ? c.toDataURL(type, quality) : '';
  }

  /** Miniatura de outra configuração (inspirações), sem mudar o bolo atual. */
  function thumbOf(other, opts) {
    const keep = config;
    setConfig(other, { instant: true });
    const url = snapshot(opts);
    if (keep) setConfig(keep, { instant: true });
    return url;
  }

  /* ───────── Eventos ───────── */
  const onStart = () => {
    userActive = true;
    flying = null;
    clearTimeout(resumeTimer);
    onInteract?.();
    invalidate();
  };
  const onEnd = () => {
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      userActive = false;
      swayBase = getSpherical().az;
      swayT = 0;
      invalidate();
    }, 2600);
  };
  controls.addEventListener('start', onStart);
  controls.addEventListener('end', onEnd);
  controls.addEventListener('change', invalidate);

  // teclado: setas giram, + e - aproximam
  const onKey = (ev) => {
    if (!m) return;
    const s = getSpherical();
    if (ev.key === 'ArrowLeft') s.az -= 0.22;
    else if (ev.key === 'ArrowRight') s.az += 0.22;
    else if (ev.key === 'ArrowUp') s.polar = Math.max(controls.minPolarAngle, s.polar - 0.1);
    else if (ev.key === 'ArrowDown') s.polar = Math.min(controls.maxPolarAngle, s.polar + 0.1);
    else if (ev.key === '+' || ev.key === '=') s.dist = Math.max(controls.minDistance, s.dist * 0.9);
    else if (ev.key === '-') s.dist = Math.min(controls.maxDistance, s.dist * 1.1);
    else return;
    ev.preventDefault();
    onStart();
    flyTo(s, 0.25);
    onEnd();
  };
  canvas.addEventListener('keydown', onKey);

  const onVisibility = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVisibility);

  const onLost = (ev) => {
    ev.preventDefault();
    lost = true;
    stop();
    // Solta agora tudo o que estava na placa de vídeo (com o contexto perdido isso não gera avisos);
    // na volta, o Three.js envia de novo geometrias, materiais e texturas.
    scene.traverse((o) => {
      o.geometry?.dispose();
      (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []).forEach((mt) => {
        Object.values(mt).forEach((v) => v?.isTexture && v.dispose());
        mt.dispose();
      });
      if (o.isInstancedMesh) o.dispose();
    });
    key.shadow.map?.dispose();
    key.shadow.map = null;
    envTarget?.dispose();
    pmrem?.dispose();
    envTarget = null;
    pmrem = null;
    scene.environment = null;
    onContextLost?.();
  };
  const onRestored = () => {
    lost = false;
    buildEnvironment();
    start();
    onContextRestored?.();
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => resize()) : null;
  ro?.observe(canvas);
  window.addEventListener('resize', resize);

  resize();
  start();

  function dispose() {
    if (disposed) return;
    disposed = true;
    stop();
    clearTimeout(resumeTimer);
    tweens.clear();
    ro?.disconnect();
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', onVisibility);
    canvas.removeEventListener('keydown', onKey);
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    controls.dispose();
    disposePart(pipingPart);
    decorParts.forEach(disposePart);
    decorParts.clear();
    [standGroup, bodyGroup, cutGroup, dripGroup].forEach(disposeGroup);
    floor.geometry.dispose();
    floor.material.dispose();
    contact.geometry.dispose();
    contact.material.dispose();
    [porcelain, gold, frostSide, frostTop, cutFrost, dripMat, cutDrip, scrapeMat, ...crustMats, ...crumbMats, ...bandMats, ...cutFillMats].forEach((mt) => mt?.dispose());
    lib.dispose();
    tex.dispose();
    envTarget?.dispose();
    pmrem?.dispose();
    renderer.dispose();
    // devolve o contexto gráfico na hora (o navegador limita quantos podem existir)
    renderer.forceContextLoss();
  }

  return {
    setConfig,
    setCutaway,
    setAutoRotate,
    setView,
    resetView,
    snapshot,
    snapshotCanvas,
    thumbOf,
    playIntro,
    refreshText,
    resize,
    dispose,
    settle,
    get cutaway() {
      return cutaway;
    },
    /** Só para testes: acesso ao renderizador (simular perda de contexto, medir desenho). */
    debug: { renderer, scene, camera, controls, lights: { hemi, key, fill, rim, candleLight }, mats: { frostSide, frostTop, porcelain, gold, dripMat }, floor, contact, invalidate },
  };
}
