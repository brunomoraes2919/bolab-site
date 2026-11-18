// BOLAB — motor 3D do personalizador (Three.js).
//
//   const cake = createCakeScene(canvas, { onContextLost, onContextRestored, onInteract });
//   cake.setConfig(config)            atualiza o bolo (reconstrói só o que mudou, com animação)
//   cake.setCutaway(true|false)       "Ver por dentro": retira uma fatia e mostra massa e recheio
//   cake.setAutoRotate(true|false)    giro automático (pausa enquanto a pessoa mexe)
//   cake.setView('default'|'top')     enquadramentos prontos · cake.resetView()
//   cake.snapshot({ size })           → dataURL JPEG sobre o fundo que dá contraste ao bolo
//   cake.setBackdrop(fundo)           ajusta sombras e luz de baixo ao fundo do palco (js/customizer/backdrop.js)
//   cake.setPaused(bool) · cake.quiet(ms)   para de desenhar (diálogo aberto) / segura o giro (painel rolando)
//   cake.resize() · cake.dispose()
//
// Fluidez: o nível de qualidade vem de js/customizer/quality.js (celular × computador). O laço só desenha
// quando algo muda; o giro automático roda a ~30 quadros/s no celular; a resolução desce sozinha se os
// quadros atrasarem e volta ao máximo quando o bolo para. Peças novas são construídas uma por quadro.
//
// createCakeScene lança erro se o aparelho não tiver WebGL: a tela trata e segue sem o 3D.
//
// ───────── Para a rodada de imersão (animações de preparo): as partes do bolo têm nome ─────────
// Nada aqui anima a montagem; o que existe é o endereço de cada parte e um ponto único de aviso.
//
//   cake.parts()          → [{ name, kind, tier, index, objects: [Object3D…] }] do bolo que está na tela
//        name                         o que é
//        'base'                       boleira, prato, tábua, caixinha…            (kind 'base')
//        'massa:<andar>:<camada>'     disco de massa — só existe como peça no naked e no vulcão ('massa')
//        'recheio:<andar>:<vão>'      faixa de recheio (naked); o fio de geleia vai junto     ('recheio')
//        'cobertura:<andar>'          a casca de cobertura: material[0] = lateral, material[1] = topo;
//                                     no naked é o creme do topo; no vulcão, o creme que transborda ('cobertura')
//        'cobertura:<andar>:rosetas'  as rosetas do bolo de rosetas (um lote de instâncias)   ('cobertura')
//        'cobertura:<andar>:veu'      o véu de creme raspado do naked e do semi-naked         ('cobertura')
//        'calda:<andar>'              a calda escorrendo                                      ('calda')
//        'corte:<andar>'              as faces do "ver por dentro"                            ('corte')
//        'bico'                       o acabamento de bico (part.group)                       ('bico')
//        'decor:<id>'                 cada decoração (part.group)                             ('decor')
//      Cada Object3D leva o mesmo dado em object.userData.part = { name, kind, tier, index }.
//
//   cake.onBuild(fn)      → fn({ name, kind, tier, index, objects }) toda vez que uma parte é (re)construída —
//      é o "passo de construção". Devolve a função que cancela. É aqui que a próxima rodada pendura a animação
//      de cada parte quando ela nasce (escala, posição, opacidade), sem tocar em quem constrói.
//
//   cake.assembly()       → a receita de montagem, na ordem do confeiteiro, para QUALQUER bolo (coberto ou não):
//      [{ id, kind, tier, index, label, make() }]. make() devolve uma peça avulsa (THREE.Mesh, já na altura
//      certa) de um disco de massa ou de um recheio — num bolo coberto essas peças não existem na cena, porque
//      a casca as esconde. Quem anima acrescenta as peças, mostra uma a uma e as remove ao terminar
//      (peca.geometry.dispose()); os materiais são do motor e não devem ser liberados.
//
// Como revelar cada parte, sem mexer no motor:
//   · peça inteira: object.visible, object.scale e object.position (cada parte é um objeto próprio);
//   · cobertura e calda "sendo espalhadas": as malhas são varridas em volta do bolo, coluna por coluna —
//     geometry.setDrawRange(0, n) mostra os n primeiros índices, isto é, um trecho da volta
//     (geometry.userData.layout = { cols, rows } diz quantas colunas existem; o grupo 0 é a lateral, o 1, o topo);
//   · cor: os materiais de cada andar ficam em cake.debug.mats; uma transição de cor pode ser feita neles;
//   · corte: cake.setCutaway(true) abre a fatia (os planos de corte valem para tudo o que é do bolo);
//   · depois de mexer, chame cake.debug.invalidate() para o laço desenhar (ele dorme quando nada muda).
//
// ───────── r5-cena: o ateliê (cozinha em volta do bolo + animações de preparo) ─────────
//   cake.atelier          → o objeto do contrato (js/atelier/README.md §2): setEnabled, setScene, on('cue'|'busy'),
//      play, skip, replay, pick, ghost, candles, spread, reveal, capture — mais ready (promessa), busy, scene,
//      dripAt(hit) e names. A implementação mora em js/atelier/stage/** e só é baixada quando alguém liga o
//      ateliê ou pede uma animação, e nunca antes do primeiro quadro do bolo: com ele desligado ("modo rápido")
//      nada aqui muda de comportamento nem de custo.
//   cake.setConfig(config, { animate: false, by })   by = quem mudou ('user' anima; 'undo' | 'preset' |
//      'surprise' | 'auto'… usam a transição curta). Tudo o que este arquivo ganhou para isso está marcado "r5-cena".
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createTextureKit, paintFinish, makeCanvas, texture, heightToNormal, normalFromHeight, paintHeight } from './textures.js';
import { strandCanvases, meringueHeight, meringueToastCanvas, COVER_TILE, STYLE_HEIGHT, paintTileStyle, paintWrapStyle, paintMarbleTop } from './looks.js';
import { cakeMetrics, buildFrosting, buildSponge, buildFillingBand, buildJamThread, buildTopCream, buildScrapeCoat, buildDrip, buildCutFaces, buildStand, faultMid, rosetteCoatGeometry, rosetteSpots, buildBundt, buildVolcanoCream, buildVolcanoCut } from './geometry.js';
import { createDecorLibrary, decorLayout, buildPiping, buildDecor, decorHeight, inWedge, newPart, Batch } from './decor.js';
import { EXTRA_DECOR, extraDecorHeight } from './decor2.js';
import { PARTY_DECOR, partyHeight } from './party.js';
import { getFlavor, getFilling, getRevealColor, getTrim, TRIMS, PIPINGS, DECORS } from '../data/customizer.js';
import { detectTier, createResolutionGovernor } from './quality.js';
import { getBackdrop, resolveBackdrop, paintBackdrop } from './backdrop.js';
// r5-decor: chave do bico, aviso de módulo de peças carregado e ids das peças colocadas à mão
import { pipingKey, onDecorReady } from './decor.js';
import { decorIdsOf } from './kit.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const WEDGE_A = 22 * DEG; // a fatia retirada fica de frente para a câmera padrão
const WEDGE_SPAN = 86 * DEG;
const VIEW = {
  default: { az: 26 * DEG, polar: 67 * DEG },
  top: { az: 26 * DEG, polar: 52 * DEG },
  inside: { az: 34 * DEG, polar: 63 * DEG },
  front: { az: 0, polar: 80 * DEG },
  above: { az: 0, polar: 20 * DEG },
};
// O coração só se lê como coração visto mais de cima e com a ponta voltada para a câmera.
const HEART_VIEW = {
  default: { az: 0, polar: 37 * DEG },
  top: { az: 0, polar: 31 * DEG },
  inside: { az: 30 * DEG, polar: 50 * DEG },
  front: { az: 0, polar: 76 * DEG },
  above: { az: 0, polar: 16 * DEG },
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

/** Constrói qualquer decoração: as clássicas (decor.js), as novas (decor2.js) e as de festa (party.js). */
function buildAnyDecor(id, ctx) {
  const special = id === 'velas' && ctx.config.decor.candleStyle !== 'classica' ? PARTY_DECOR.velasEspeciais : EXTRA_DECOR[id] || PARTY_DECOR[id];
  if (!special) return buildDecor(id, ctx);
  const part = newPart();
  special(ctx, part);
  return part;
}

/** Altura acima do topo do bolo ocupada por tudo o que está em cima dele. */
const decorTop = (cfg) => Math.max(decorHeight(cfg), extraDecorHeight(cfg), partyHeight(cfg));

export function isWebGLAvailable() {
  // só confere se o navegador conhece WebGL; quem tenta de verdade é o renderizador (um contexto a menos por visita)
  return typeof window !== 'undefined' && Boolean(window.WebGLRenderingContext);
}

/** Ajustes de material para cada tipo de cobertura. */
const COVERING_LOOK = {
  buttercream: { roughness: 0.56, clearcoat: 0.05, clearcoatRoughness: 0.5, sheen: 0.45, normal: 'streak', normalScale: 0.26, topNormal: 'swirl', topScale: 0.3, env: 0.95 },
  chantilly: { roughness: 0.82, clearcoat: 0, clearcoatRoughness: 0.6, sheen: 0.8, normal: 'soft', normalScale: 0.5, topNormal: 'soft', topScale: 0.5, env: 1 },
  ganache: { roughness: 0.2, clearcoat: 0.75, clearcoatRoughness: 0.14, sheen: 0, normal: 'soft', normalScale: 0.07, topNormal: 'soft', topScale: 0.07, env: 1.15 },
  glace: { roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.07, sheen: 0, normal: 'soft', normalScale: 0.05, topNormal: 'soft', topScale: 0.05, env: 1.1 },
  chocolate: { roughness: 0.4, clearcoat: 0.28, clearcoatRoughness: 0.32, sheen: 0, normal: 'streak', normalScale: 0.5, topNormal: 'swirl', topScale: 0.5, env: 1 },
  mousse: { roughness: 0.76, clearcoat: 0, clearcoatRoughness: 0.6, sheen: 0.5, normal: 'pore', normalScale: 0.45, topNormal: 'pore', topScale: 0.45, env: 0.95 },
  naked: { roughness: 0.78, clearcoat: 0, clearcoatRoughness: 0.6, sheen: 0.6, normal: 'soft', normalScale: 0.7, topNormal: 'rustic', topScale: 1.7, env: 0.9 },
  // tint = tom próprio do tipo, que multiplica a cor escolhida · map / tile = textura própria (ver looks.js)
  chantininho: { roughness: 0.78, clearcoat: 0, clearcoatRoughness: 0.6, sheen: 0.7, normal: 'soft', normalScale: 0.3, topNormal: 'soft', topScale: 0.3, env: 0.95, tint: '#fff6e4' },
  creamcheese: { roughness: 0.64, clearcoat: 0.03, clearcoatRoughness: 0.5, sheen: 0.4, normal: 'streak', normalScale: 0.36, topNormal: 'swirl', topScale: 0.36, env: 0.95, tint: '#fff3dc' },
  pasta: { roughness: 0.58, clearcoat: 0, clearcoatRoughness: 0.6, sheen: 0.3, normal: 'soft', normalScale: 0.03, topNormal: 'soft', topScale: 0.03, env: 0.85 },
  ganachebranca: { roughness: 0.24, clearcoat: 0.6, clearcoatRoughness: 0.16, sheen: 0, normal: 'soft', normalScale: 0.07, topNormal: 'soft', topScale: 0.07, env: 1.1 },
  merengue: { roughness: 0.4, clearcoat: 0.22, clearcoatRoughness: 0.3, sheen: 0.2, normal: 'merengue', normalScale: 1, topNormal: 'merengue', topScale: 1, env: 1.05, map: 'merengue', tile: true, tint: '#fffaf0' },
  brigadeiro: { roughness: 0.5, clearcoat: 0.14, clearcoatRoughness: 0.4, sheen: 0, normal: 'granulado', normalScale: 1.3, topNormal: 'granulado', topScale: 1.3, env: 0.9, map: 'granulado', tile: true },
  coco: { roughness: 0.95, clearcoat: 0, clearcoatRoughness: 0.6, sheen: 0.5, normal: 'coco', normalScale: 1.1, topNormal: 'coco', topScale: 1.1, env: 0.85, map: 'coco', tile: true },
};

export function createCakeScene(canvas, { onContextLost, onContextRestored, onInteract, onFrame, insets, tier: forcedTier } = {}) {
  if (!isWebGLAvailable()) throw new Error('WebGL indisponível');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tier = forcedTier || detectTier();
  const deviceRatio = () => window.devicePixelRatio || 1;
  /** Proporção de pixels do bolo parado (a mais nítida que o nível permite). */
  const stillRatio = () => Math.min(deviceRatio(), tier.maxRatio);
  const gov = createResolutionGovernor({ max: stillRatio(), dpr: deviceRatio() });
  let curRatio = stillRatio();

  /* ───────── Renderizador ───────── */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: tier.antialias, alpha: true, stencil: false, powerPreference: 'high-performance' });
  } catch (err) {
    throw new Error('WebGL indisponível');
  }
  renderer.debug.checkShaderErrors = false; // sem esperar o registro de cada programa: a compilação não trava a tela
  renderer.setPixelRatio(curRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = tier.shadows;
  renderer.shadowMap.type = tier.softShadow ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  renderer.localClippingEnabled = true;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  const tex = createTextureKit({ aniso: Math.min(tier.physical ? 8 : 2, renderer.capabilities.getMaxAnisotropy()), size: tier.texSize });
  const lib = createDecorLibrary(tex, tier);

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
  // celular: luz principal + contraluz + ambiente (sem preenchimento nem luz das velas: o ambiente compensa)
  const hemi = new THREE.HemisphereLight(0xfff6f0, 0xf6c9d4, tier.fillLight ? 0.85 : 1.14);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff0e0, 2.1);
  key.castShadow = tier.shadows;
  key.shadow.mapSize.set(tier.shadowSize, tier.shadowSize);
  key.shadow.bias = -0.0012;
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 5;
  key.shadow.blurSamples = 12;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xffe3ea, 0.9);
  if (tier.fillLight) scene.add(fill, fill.target);
  const rim = new THREE.DirectionalLight(0xffffff, 1.0);
  scene.add(rim, rim.target);
  // brilho quente das velas: fica sempre na cena (intensidade 0 sem velas) para não recompilar materiais
  const candleLight = new THREE.PointLight(0xffb066, 0, 3.4, 2);
  if (tier.pointLight) scene.add(candleLight);

  /* ───────── Chão: sombra projetada (mancha macia) + sombra de contato ─────────
     A sombra no chão é uma mancha desfocada que acompanha a luz: fica macia em qualquer fundo
     e não custa nada (o mapa de sombras cuida só do bolo e do prato, com mais definição). */
  let backdrop = getBackdrop('rosa');
  const shadowPlane = new THREE.PlaneGeometry(1, 1);
  const floor = new THREE.Mesh(
    shadowPlane,
    new THREE.MeshBasicMaterial({ map: tex.softShadow(), color: backdrop.shadow.color, transparent: true, opacity: backdrop.shadow.opacity, depthWrite: false, toneMapped: false }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.renderOrder = -2;
  scene.add(floor);
  const contact = new THREE.Mesh(
    shadowPlane,
    new THREE.MeshBasicMaterial({ map: tex.contactShadow(), color: backdrop.contact.color, transparent: true, opacity: backdrop.contact.opacity, depthWrite: false, toneMapped: false }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.renderOrder = -1;
  scene.add(contact);
  // sombra macia do bolo sobre o prato: assenta o bolo mesmo sem mapa de sombras (celular)
  const plateShade = new THREE.Mesh(
    shadowPlane,
    new THREE.MeshBasicMaterial({ map: tex.plateShadow(), color: 0x4a1f2b, transparent: true, opacity: tier.shadows ? 0.12 : 0.3, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  plateShade.rotation.x = -Math.PI / 2;
  scene.add(plateShade);

  /* ───────── Planos de corte ("Ver por dentro") ───────── */
  const OFF = () => new THREE.Plane(new THREE.Vector3(0, 1, 0), 1000);
  const clipPlanes = [OFF(), OFF()];
  const clipped = { clippingPlanes: clipPlanes, clipIntersection: true, clipShadows: true };

  /* ───────── Materiais ───────── */
  // no celular, sem verniz (clearcoat) nem brilho acetinado (sheen): materiais bem mais leves de desenhar
  const coat = (v) => (tier.physical ? v : 0);
  const porcelain = new THREE.MeshPhysicalMaterial({ color: 0xfffdfb, roughness: tier.physical ? 0.2 : 0.12, clearcoat: coat(0.9), clearcoatRoughness: 0.12 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xe6bb62, metalness: 0.88, roughness: 0.28, emissive: 0x6b4a10, emissiveIntensity: 0.4 });
  // Cobertura por andar (até 3): lateral, topo e a face cortada, cada um com a aparência e a cor do seu andar.
  const frostTiers = [];
  const frostOf = (i) => {
    if (!frostTiers[i]) {
      const side = new THREE.MeshPhysicalMaterial({ color: 0xffffff, sheenColor: 0xffffff, sheenRoughness: 0.55, ...clipped });
      const top = new THREE.MeshPhysicalMaterial({ color: 0xffffff, sheenColor: 0xffffff, sheenRoughness: 0.55, ...clipped });
      const cut = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, emissiveIntensity: 0.12 });
      cut.emissive = cut.color;
      frostTiers[i] = { side, top, cut, scrape: null, canvas: null, map: null, mapKey: '', mapped: false, topRustic: null };
    }
    return frostTiers[i];
  };
  const frostSide = frostOf(0).side;
  const frostTop = frostOf(0).top;
  const cutFrost = frostOf(0).cut;
  const dripMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: tier.physical ? 0.2 : 0.13, clearcoat: coat(0.85), clearcoatRoughness: 0.12, ...clipped });
  const cutDrip = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });
  // (na calda metálica o material "acende" um pouco na própria cor, como o dourado da boleira)
  dripMat.emissive = dripMat.color;
  cutDrip.emissive = cutDrip.color;
  dripMat.emissiveIntensity = cutDrip.emissiveIntensity = 0;
  /** Véu de creme raspado do andar i (naked: ralo; semi-naked: bem mais cheio). */
  const scrapeOf = (i) => {
    const f = frostOf(i);
    const t = m.stack[i] || m;
    const dense = Boolean(t.semi);
    const key = `${t.n}|${dense}`;
    if (!f.scrape || f.scrape.userData.key !== key) {
      f.scrape?.dispose();
      f.scrape = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex.scrapeFilm(t.n, dense), transparent: true, roughness: 0.86, depthWrite: false, ...clipped });
      f.scrape.userData.key = key;
    }
    displayColor(t.cover.color, f.scrape.color);
    return f.scrape;
  };
  const scrape = () => scrapeOf(0);
  // bases que não são porcelana (criadas quando escolhidas)
  const standMats = {};
  const standMat = (name) => {
    if (name === 'porcelain') return porcelain;
    if (name === 'gold') return gold;
    if (!standMats[name]) {
      standMats[name] =
        name === 'wood' || name === 'plank'
          ? new THREE.MeshStandardMaterial({ map: name === 'wood' ? tex.wood() : tex.plank(), roughness: 0.72 })
          : name === 'marble'
            ? new THREE.MeshPhysicalMaterial({ map: tex.marble(), roughness: tier.physical ? 0.2 : 0.14, clearcoat: coat(0.55), clearcoatRoughness: 0.15 })
            : name === 'silver'
              ? new THREE.MeshStandardMaterial({ color: 0xf2f4f8, metalness: 0.72, roughness: 0.24, emissive: 0x565b63, emissiveIntensity: 0.42 })
              : name === 'blackboard'
                ? new THREE.MeshStandardMaterial({ color: 0x1f1c1e, roughness: 0.62, envMapIntensity: 0.8 })
                : name === 'glass'
                    ? new THREE.MeshStandardMaterial({ color: 0xe6f3f5, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.36, envMapIntensity: 1.9 })
                    : name === 'kraft'
                      ? new THREE.MeshStandardMaterial({ color: 0xc8a676, roughness: 0.92, envMapIntensity: 0.5, side: THREE.DoubleSide })
                      : name === 'paper'
                        ? new THREE.MeshStandardMaterial({ color: 0xfbf8f1, roughness: 0.9, envMapIntensity: 0.6 })
                        : new THREE.MeshStandardMaterial({ color: 0xf0c66a, metalness: 0.72, roughness: 0.27, emissive: 0x7a5412, emissiveIntensity: 0.5 });
    }
    return standMats[name];
  };
  const flavorOf = (i) => getFlavor(config.layers[Math.min(i, config.layers.length - 1)]);
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
    layerMat(crustMats, i, () => {
      const mat = new THREE.MeshStandardMaterial({ map: tex.crust(), bumpMap: tex.crustBump(), bumpScale: 3, roughness: 0.97, envMapIntensity: 0.2, ...clipped });
      mat.color.set(flavorOf(i).crust);
      return mat;
    });
  const crumbMat = (i) =>
    layerMat(crumbMats, i, () => {
      const mat = new THREE.MeshStandardMaterial({ map: tex.crumb(), emissiveMap: tex.crumb(), bumpMap: tex.crumbBump(), bumpScale: 2.2, roughness: 0.92, vertexColors: true, emissiveIntensity: 0.26 });
      mat.emissive = mat.color; // o miolo "acende" um pouco na própria cor, como massa de verdade atravessada pela luz
      crumbLook(mat, flavorOf(i));
      return mat;
    });
  /**
   * O miolo da massa no corte. As massas lisas usam uma textura só (os furinhos), tingida pela cor do sabor;
   * as que têm desenho (mesclada, formigueiro, confete…) usam a textura delas, já colorida, e o material fica branco.
   * Devolve a cor que o material deve ter.
   */
  function crumbLook(mat, flavor) {
    const map = flavor.look ? tex.crumbLook(flavor) : tex.crumb();
    if (mat.map !== map) {
      mat.map = map;
      mat.emissiveMap = map;
    }
    const color = flavor.look ? '#ffffff' : flavor.crumb;
    mat.color.set(color);
    return color;
  }
  const bandMat = (i) => layerMat(bandMats, i, () => new THREE.MeshPhysicalMaterial({ roughness: 0.8, envMapIntensity: 0.7, ...clipped }));
  // a massa do bolo vulcão por fora: dourada da fôrma, lisa, com os furinhos finos do miolo
  let bundtMat = null;
  const bundt = () => (bundtMat ||= new THREE.MeshStandardMaterial({ map: tex.crumb(), bumpMap: tex.crumbBump(), bumpScale: 1.3, roughness: 0.9, envMapIntensity: 0.28, ...clipped }));
  const bundtColor = (flavor, target) => target.set(flavor.crust).multiplyScalar(0.92);
  // geleia dos recheios de fruta: o fio escuro e brilhante junto ao creme (por fora, no naked, e no corte)
  const jamMats = [];
  const cutJamMats = [];
  const jamMat = (i) => layerMat(jamMats, i, () => new THREE.MeshPhysicalMaterial({ roughness: tier.physical ? 0.22 : 0.14, clearcoat: coat(0.7), clearcoatRoughness: 0.15, ...clipped }));
  const cutJamMat = (i) => layerMat(cutJamMats, i, () => new THREE.MeshStandardMaterial({ roughness: 0.3, vertexColors: true }));
  let fruitMat = null;
  const fruitPieces = () => (fruitMat ||= new THREE.MeshStandardMaterial({ map: tex.pieces(), alphaTest: 0.5, roughness: 0.5, side: THREE.DoubleSide }));
  const fillingOf = (i) => getFilling(config.fillings[Math.min(i, config.fillings.length - 1)]);
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
  let focus = false; // câmera parada na plaquinha enquanto a pessoa digita a mensagem
  let holdUntil = 0; // giro automático em pausa até este instante
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
  const jobs = []; // peças a construir, uma por quadro (nunca tudo de uma vez no toque)
  let paused = false; // diálogo aberto ou bolo fora da tela: nada é desenhado
  let offscreen = false;
  let quietUntil = 0; // painel rolando: o giro automático espera
  let lastInput = 0; // último toque/tecla (o giro descansa depois de um tempo sem ninguém mexer)
  let lastRender = 0;
  let lastAmbient = 0;
  let rotClock = 0;
  let framePeriod = 1 / 60;
  let sharp = true; // o quadro parado já está na resolução máxima
  let ticking = false;
  let selfMove = false;
  let nap = 0; // cochilo entre dois quadros do giro automático (o laço não acorda a cada atualização da tela)
  let skipUntil = 0; // logo depois de reconstruir peças, compilar ou trocar a resolução, o custo do quadro não conta
  const clock = () => performance.now() / 1000;
  let napped = false;
  const stats = { renders: 0, skipped: 0 };
  const shadowCenter = new THREE.Vector3();
  // r5-cena: ateliê. stage = a cena carregada (null até alguém pedir) · ground = quanto o "chão" fica abaixo do pé
  // da base (a bailarina entra no meio) e o raio da sombra de contato · spinAngle = giro do prato (bolo + base)
  let stage = null;
  let stageLoad = null;
  let stageWanted = false;
  let atelierOn = false;
  let atelierScene = 'bancada';
  const atelierSubs = new Map();
  const ground = { drop: 0, contact: 0, radius: 0 };
  let spinAngle = 0;

  function invalidate() {
    dirty = true;
    wake();
  }

  /** Acorda o laço de desenho (ele dorme quando não há nada para animar). */
  function wake() {
    // durante o próprio quadro nada é agendado aqui: o fim do quadro decide (senão cada invalidate() criaria um laço a mais)
    if (!running || ticking || lost || disposed || paused || offscreen) return;
    if (nap) {
      clearTimeout(nap);
      nap = 0;
    }
    if (!raf) raf = requestAnimationFrame(tick);
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

  function runJobs(budgetMs) {
    if (!jobs.length) return false;
    const t0 = performance.now();
    do jobs.shift()();
    while (jobs.length && performance.now() - t0 < budgetMs);
    return true;
  }

  function settle() {
    while (jobs.length) jobs.shift()();
    stage?.skip(); // r5-cena: a animação de preparo em curso também termina aqui
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
    const to = hex?.isColor ? hex : displayColor(hex);
    const from = mats[0].color.clone();
    if (from.equals(to)) {
      // já está na cor pedida: cancela uma transição que ainda estivesse a caminho de OUTRA cor (duas mudanças
      // no mesmo quadro, a segunda desfazendo a primeira) e deixa todos os materiais do grupo iguais
      tweens.delete(keyName);
      mats.forEach((mt) => mt.color.copy(to));
      return;
    }
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

  /* ───────── As partes do bolo, por nome (ver o cabeçalho) ───────── */
  const named = new Map(); // nome → { name, kind, tier, index, objects }
  const buildHooks = new Set();
  /** Registra uma parte construída (ou reconstruída) e avisa quem pediu para saber. */
  function built(name, objects, { kind = name.split(':')[0], tier: tierIndex = null, index = null } = {}) {
    const list = (Array.isArray(objects) ? objects : [objects]).filter(Boolean);
    const entry = { name, kind, tier: tierIndex, index, objects: list };
    list.forEach((o) => {
      o.name ||= name;
      o.userData.part = { name, kind, tier: tierIndex, index };
    });
    named.set(name, entry);
    buildHooks.forEach((fn) => {
      try {
        fn(entry);
      } catch (err) {
        console.error(`[bolo 3D] passo de construção "${name}"`, err);
      }
    });
    return list[0];
  }
  /** Esquece as partes de um tipo (antes de refazê-las). */
  const forget = (kind) => [...named.keys()].forEach((k) => named.get(k).kind === kind && named.delete(k));

  function rebuildStand() {
    disposeGroup(standGroup);
    stand = buildStand(m.base, config.base);
    stand.parts.forEach((part) => standGroup.add(mesh(part.geo, standMat(part.mat), { cast: part.cast !== false })));
    forget('base');
    built('base', [...standGroup.children]);
    floor.visible = true;
    plateShade.position.set(0, config.base === 'boleira' || config.base === 'prato' || config.base === 'vidro' ? -0.0128 : -0.0008, 0);
    plateShade.scale.set(2 * stand.shade.x, 2 * stand.shade.z, 1);
    placeGround();
  }

  /** r5-cena: a sombra de contato fica no chão de verdade (com a bailarina, mais baixo que o pé da base). */
  function placeGround() {
    if (!stand) return;
    contact.position.y = stand.floorY - ground.drop + 0.002;
    const footR = ground.contact || stand.plateRadius * 0.5;
    contact.scale.set(footR * 3.6, footR * 3.6, 1);
  }

  /** O mapa de sombras enquadra só o bolo, o prato e a decoração: cada ponto dele rende mais. */
  function fitShadow() {
    const top = m.Htot + decorTop(config) + 0.06;
    const bottom = stand.floorY;
    shadowCenter.set(0, (top + bottom) / 2, m.center.z * 0.5);
    const rb = Math.hypot(stand.plateRadius + 0.06, (top - bottom) / 2);
    const sc = key.shadow.camera;
    sc.left = -rb;
    sc.right = rb;
    sc.top = rb;
    sc.bottom = -rb;
    sc.near = 7 - rb - 0.3;
    sc.far = 7 + rb + 0.3;
    sc.updateProjectionMatrix();
  }

  /** A mancha de sombra no chão cai para o lado oposto ao da luz principal (lightAz = azimute da luz). */
  function placeFloorShadow(lightAz) {
    if (!stand || !m) return;
    const k = 0.78; // 1 / tan(52°), a altura da luz principal
    const hPlate = -stand.floorY + ground.drop; // r5-cena: com a bailarina, o chão fica mais baixo
    const near = -stand.plateRadius + hPlate * k;
    const far = Math.max(stand.plateRadius + hPlate * k, m.base.bounds.maxR + (hPlate + m.Htot) * k);
    const mid = (near + far) / 2;
    const dx = -Math.sin(lightAz);
    const dz = -Math.cos(lightAz);
    floor.position.set(dx * mid, stand.floorY - ground.drop + 0.001, dz * mid);
    floor.scale.set((far - near) * 1.34, stand.plateRadius * 2.6, 1);
    floor.rotation.z = Math.atan2(-dz, dx);
  }

  function applyBackdropLook(b, k = 1, from = null) {
    if (!from) {
      floor.material.color.set(b.shadow.color);
      floor.material.opacity = b.shadow.opacity;
      contact.material.color.set(b.contact.color);
      contact.material.opacity = b.contact.opacity;
      hemi.groundColor.set(b.ground);
      return;
    }
    floor.material.color.copy(from.shadow).lerp(_bd.set(b.shadow.color), k);
    floor.material.opacity = from.shadowA + (b.shadow.opacity - from.shadowA) * k;
    contact.material.color.copy(from.contact).lerp(_bd.set(b.contact.color), k);
    contact.material.opacity = from.contactA + (b.contact.opacity - from.contactA) * k;
    hemi.groundColor.copy(from.ground).lerp(_bd.set(b.ground), k);
  }

  /** Fundo do palco em uso: as sombras do chão e a luz que vem de baixo acompanham o tom dele. */
  function setBackdrop(b, { instant = false } = {}) {
    if (!b || b.id === backdrop.id) return;
    const from = { shadow: floor.material.color.clone(), shadowA: floor.material.opacity, contact: contact.material.color.clone(), contactA: contact.material.opacity, ground: hemi.groundColor.clone() };
    backdrop = b;
    tween('backdrop', instant ? 0 : 0.55, (k) => applyBackdropLook(b, k, from));
    stage?.setBackdrop(b, { instant }); // r5-cena: a cozinha acompanha o tom do fundo
    invalidate();
  }

  /* Texturas das coberturas de textura própria (granulado, coco ralado, merengue) e dos estilos de pente e de
     cesta: desenhadas na primeira vez que a opção é escolhida (looks.js) e guardadas como as outras. */
  const S = tex.size;
  const strands = (kind) =>
    tex.drawn(`strand:${kind}`, () =>
      kind === 'coco'
        ? strandCanvases(S, { seed: 67, count: Math.round(2500 * (S / 512) ** 0.5), len: [5, 10], thick: 0.95, base: 0.74, tones: [0.9, 1], curl: 0.5, gloss: 0.06 })
        : strandCanvases(S, { seed: 41, count: Math.round(2100 * (S / 512) ** 0.5), len: [3.4, 4.8], thick: 1.2, base: 0.34, tones: [0.62, 0.96], gloss: 0.34 }),
    );
  const fromHeight = (key, fn, strength) => () => tex.lazy(`n:${key}`, () => texture(tex.drawn(`n:${key}`, () => normalFromHeight(S, fn, strength)), { aniso: tex.aniso }));
  const COVER_MAPS = {
    granulado: () => tex.lazy('c:granulado', () => texture(strands('granulado').shade, { srgb: true, aniso: tex.aniso })),
    coco: () => tex.lazy('c:coco', () => texture(strands('coco').shade, { srgb: true, aniso: tex.aniso })),
    merengue: () => tex.lazy('c:merengue', () => texture(tex.drawn('c:merengue', () => meringueToastCanvas(S)), { srgb: true, aniso: tex.aniso })),
  };
  const NORMALS = {
    streak: () => tex.streakNormal(),
    swirl: () => tex.swirlNormal(),
    soft: () => tex.softNormal(),
    pore: () => tex.poreNormal(),
    comb: () => tex.combNormal(),
    rustic: () => tex.rusticNormal(),
    granulado: () => tex.lazy('n:granulado', () => texture(tex.drawn('n:granulado', () => heightToNormal(strands('granulado').height, 2.4)), { aniso: tex.aniso })),
    coco: () => tex.lazy('n:coco', () => texture(tex.drawn('n:coco', () => heightToNormal(strands('coco').height, 1.8)), { aniso: tex.aniso })),
    merengue: fromHeight('merengue', meringueHeight(), 1.5),
    ondas: fromHeight('ondas', STYLE_HEIGHT.ondas, 2.6),
    vertical: fromHeight('vertical', STYLE_HEIGHT.vertical, 2.6),
    cesta: fromHeight('cesta', STYLE_HEIGHT.cesta, 2.4),
  };
  /** Sombra do trançado da cesta: o fundo entre as tiras escurece (multiplica a cor da cobertura). */
  const basketShade = () =>
    tex.lazy('c:cesta', () =>
      texture(
        tex.drawn('c:cesta', () => paintHeight(S, (u, v) => 0.5 + 0.5 * Math.min(1, STYLE_HEIGHT.cesta(u, v) / 0.55))),
        { srgb: true, aniso: tex.aniso },
      ),
    );
  /** Estilos pintados numa volta inteira do bolo (segundo conjunto de coordenadas) e num azulejo que se repete. */
  const WRAP_STYLES = new Set(['ombre', 'aquarela', 'listras', 'marmorizado', 'pinceladas']);
  const TILE_STYLES = new Set(['poa', 'coracoes', 'arabesco', 'barrado', 'chuva', 'faultline']);
  const shown = (hex) => `#${displayColor(hex, _bd).getHexString()}`;
  const _tint = new THREE.Color();
  /** A cor da cobertura como ela aparece: a escolhida, puxada para o tom próprio do tipo (chantininho é marfim, não branco puro). */
  const coverTone = (hex, look, target = new THREE.Color()) => {
    displayColor(hex, target);
    return look.tint ? target.multiply(_tint.set(look.tint)) : target;
  };
  const shownTone = (hex, look) => `#${coverTone(hex, look, _bd).getHexString()}`;
  /** Cópia de uma textura para o topo do andar (lá a escala das coordenadas é outra), com a repetição certa. */
  function topCopy(f, key, source, repeat) {
    f.topTex ||= {};
    let copy = f.topTex[key];
    if (!copy || copy.source !== source.source) {
      copy?.dispose();
      copy = f.topTex[key] = source.clone();
    }
    copy.repeat.setScalar(repeat);
    return copy;
  }
  /** Textura que mostra um desenho feito na hora (cor ou relevo de um estilo): troca só a imagem quando o estilo muda. */
  function canvasTexture(f, slot, canvas, { srgb = true, channel = 0 } = {}) {
    let t = f[slot];
    if (!t) {
      t = f[slot] = new THREE.CanvasTexture(canvas);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.channel = channel;
      t.anisotropy = tier.physical ? 4 : 2;
    }
    t.image = canvas;
    t.needsUpdate = true;
    return t;
  }

  /** Textura de cor da lateral do andar i nos estilos pintados numa volta inteira (degradê, aquarela, listras, marmorizado, pinceladas). */
  function finishMap(i, t, look) {
    const f = frostOf(i);
    const c1 = shownTone(t.cover.color, look);
    const c2 = shownTone(t.cover.color2, look);
    const stripes = Math.max(5, Math.round(t.frost.length / 0.52));
    // degradê em bolo de andares com a mesma cobertura: um só degradê do pé ao topo, cada andar com o seu trecho
    const whole = t.style === 'ombre' && !config.tierCover && t.stack.length > 1;
    const from = whole ? t.y0 / t.Htot : 0;
    const to = whole ? (t.y0 + t.Ht) / t.Htot : 1;
    const key = `${t.style}|${c1}|${c2}|${stripes}|${from.toFixed(3)}|${to.toFixed(3)}|${t.frost.length.toFixed(2)}|${t.Ht.toFixed(2)}`;
    if (f.mapKey === key && f.map) return f.map;
    if (!f.canvas) f.canvas = makeCanvas(tier.physical ? 1024 : 512, tier.physical ? 256 : 128);
    if (t.style === 'marmorizado' || t.style === 'pinceladas') paintWrapStyle(f.canvas, t.style, c1, c2, { seed: 7 + i * 13, L: t.frost.length * 10, H: t.Ht * 10 });
    else paintFinish(f.canvas, t.style, c1, c2, { stripes, seed: 7 + i * 13, from, to });
    f.topColor = whole ? `#${_bd.set(t.cover.color).lerp(new THREE.Color(t.cover.color2), to).getHexString()}` : t.cover.color2;
    canvasTexture(f, 'map', f.canvas, { channel: 1 }); // segundo conjunto de coordenadas: uma volta inteira × do pé ao topo
    f.mapKey = key;
    return f.map;
  }

  /** Cor e relevo da lateral do andar i nos estilos de azulejo (estêncil, barrado, confeitos subindo, fault line). */
  function tileStyle(i, t, look) {
    const f = frostOf(i);
    const c1 = shownTone(t.cover.color, look);
    const c2 = shownTone(t.cover.color2, look);
    const trim = getTrim(t.cover.trim) || TRIMS[0];
    const key = `${t.style}|${c1}|${c2}|${trim.id}|${t.Ht.toFixed(3)}`;
    if (f.tileKey !== key) {
      const out = paintTileStyle(S, t.style, { c1, c2, trim, mid: faultMid(t) * 10, top: (t.Ht - t.rf) * 10, seed: 3 + i });
      canvasTexture(f, 'tmap', out.color);
      f.tnormalOn = Boolean(out.height);
      if (out.height) canvasTexture(f, 'tnormal', heightToNormal(out.height, 2), { srgb: false });
      f.tileKey = key;
    }
    return { map: f.tmap, normal: f.tnormalOn ? f.tnormal : null };
  }

  /** O topo do marmorizado: os veios continuam por cima do bolo. */
  function marbleTop(i, t, look) {
    const f = frostOf(i);
    const c1 = shownTone(t.cover.color, look);
    const c2 = shownTone(t.cover.color2, look);
    const key = `${c1}|${c2}`;
    if (f.marbleKey !== key) {
      if (!f.marbleCanvas) f.marbleCanvas = makeCanvas(tier.physical ? 512 : 256);
      paintMarbleTop(f.marbleCanvas, c1, c2, 7 + i * 13);
      canvasTexture(f, 'marble', f.marbleCanvas);
      f.marbleKey = key;
    }
    return f.marble;
  }

  /** Aparência (brilho, relevo da espátula) e cores do andar i. quiet = sem transição de cor. */
  function applyTierLook(i, quiet) {
    const t = m.stack[i];
    const cov = t.cover;
    const f = frostOf(i);
    const look = COVERING_LOOK[cov.type] || COVERING_LOOK.buttercream;
    const round = m.shape === 'round';
    const tile = Boolean(look.tile);
    const sideRepeat = 1.6 / COVER_TILE;
    const topRepeat = (2.9 * t.R) / COVER_TILE;
    const wrap = !t.naked && WRAP_STYLES.has(t.style);
    const tiled = !t.naked && TILE_STYLES.has(t.style) ? tileStyle(i, t, look) : null;
    const mapped = wrap || Boolean(tiled);
    const pearl = !t.naked && t.style === 'perolado';
    let sideMap = look.normal;
    let sideScale = look.normalScale;
    let topMap = look.topNormal === 'swirl' && !round ? look.normal : look.topNormal; // (o naked usa as marcas de espátula)
    let topScale = look.topScale;
    if (t.style === 'rustico') {
      sideMap = topMap = 'rustic';
      sideScale = 1.15;
      topScale = 0.95;
    } else if (t.style === 'pente' || t.style === 'ondas') {
      sideMap = t.style === 'pente' ? 'comb' : 'ondas';
      sideScale = 1.05;
      if (round) {
        topMap = 'swirl';
        topScale = 0.95;
      }
    } else if (t.style === 'vertical') {
      sideMap = 'vertical';
      sideScale = 1.05;
    } else if (t.style === 'cesta') {
      sideMap = 'cesta';
      sideScale = 2;
    } else if (t.style === 'pinceladas') {
      // os toques de espátula deixam o creme irregular por baixo da cor
      sideMap = 'rustic';
      sideScale = 0.6;
    } else if (pearl || t.style === 'babados' || t.style === 'rosetas') {
      sideMap = 'soft';
      sideScale = 0.12;
    }
    // vulcão: creme que escorreu, não creme espatulado — sem marcas de espátula, só um ondulado macio
    if (t.volcano && !tile) {
      sideMap = 'soft';
      sideScale = 0.16;
    }
    [
      [f.side, sideMap, sideScale],
      [f.top, topMap, topScale],
    ].forEach(([mat, mapName, scale], isTop) => {
      // computador: verniz e acetinado nunca chegam a zero, para todas as coberturas usarem o mesmo programa
      // (trocar de tipo não recompila nada). Celular: os dois ficam desligados e o brilho vira superfície mais lisa.
      mat.roughness = tier.physical ? look.roughness : Math.max(0.09, look.roughness * (1 - 0.42 * look.clearcoat));
      mat.clearcoat = tier.physical ? Math.max(0.002, look.clearcoat) : 0;
      mat.clearcoatRoughness = look.clearcoatRoughness;
      mat.sheen = tier.physical ? Math.max(0.002, look.sheen) : 0;
      mat.envMapIntensity = look.env;
      // perolado: o pó de pérola faz a cobertura refletir como metal fosco, sem perder a cor
      mat.metalness = pearl ? 0.55 : 0;
      if (pearl) {
        mat.roughness = 0.3;
        mat.envMapIntensity = 1.7;
        if (tier.physical) mat.clearcoat = 0.4;
      }
      let map = NORMALS[mapName] ? NORMALS[mapName]() : null;
      let fixed = false; // textura com repetição própria (não entra no ajuste de escala do topo)
      if (!isTop && tiled?.normal) {
        // estilos com confeito: o relevo das peças vem junto com a cor delas
        map = tiled.normal;
        scale = 1.25;
        fixed = true;
      } else if (map && tile) {
        // textura própria da cobertura: azulejo de 8 cm — na lateral, duas repetições por azulejo-padrão; no topo, uma cópia
        if (isTop) map = topCopy(f, `n:${mapName}`, map, topRepeat);
        else map.repeat.setScalar(sideRepeat);
        fixed = true;
      } else if (map && isTop && mapName === 'rustic') {
        // espatulado no topo: a mesma textura da lateral, mas com cópia própria — os golpes ficam do mesmo
        // tamanho dos da lateral (o topo usa outra escala de UV) e atravessados, como quem alisa de lado a lado
        if (!f.topRustic || f.topRustic.source !== map.source) {
          f.topRustic?.dispose();
          f.topRustic = map.clone();
          f.topRustic.center.set(0.5, 0.5);
          f.topRustic.rotation = 0.55;
        }
        f.topRustic.repeat.setScalar((2.9 * t.R) / 1.6);
        map = f.topRustic;
        fixed = true;
      }
      if (mat.normalMap !== map) {
        mat.normalMap = map;
        mat.needsUpdate = true;
      }
      mat.normalScale.setScalar(scale);
      // no topo, texturas que se repetem usam uma escala própria (a espiral cobre o topo inteiro)
      if (map && isTop && !fixed && mapName !== 'swirl') map.repeat.set(1, 1);
    });
    f.cut.roughness = Math.max(0.45, look.roughness);
    if (f.coat) {
      f.coat.roughness = Math.min(0.9, look.roughness + 0.08);
      f.coat.envMapIntensity = look.env * 0.9;
    }

    // cor: nos estilos pintados quem dá a cor da lateral é a textura (o material fica branco); nas coberturas de
    // textura própria, a textura (granulado, coco, tostado do merengue) multiplica a cor escolhida
    const cover = !mapped && look.map ? COVER_MAPS[look.map]() : null;
    if (cover) cover.repeat.setScalar(sideRepeat);
    const map = wrap ? finishMap(i, t, look) : tiled ? tiled.map : !t.naked && t.style === 'cesta' ? basketShade() : cover;
    if (f.side.map !== map) {
      f.side.map = map;
      f.side.needsUpdate = true;
    }
    const marble = wrap && t.style === 'marmorizado';
    const capMap = marble ? marbleTop(i, t, look) : cover ? topCopy(f, `c:${look.map}`, cover, topRepeat) : null;
    if (f.top.map !== capMap) {
      f.top.map = capMap;
      f.top.needsUpdate = true;
    }
    const topColor = wrap && t.style === 'ombre' ? f.topColor || cov.color2 : cov.color;
    const state = `${mapped ? 1 : 0}${marble ? 1 : 0}`;
    if (quiet || mapped || f.mapped !== state) {
      [`frostS${i}`, `frostT${i}`, `frostC${i}`].forEach((k) => tweens.delete(k));
      if (mapped) f.side.color.set(0xffffff);
      else coverTone(cov.color, look, f.side.color);
      if (marble) f.top.color.set(0xffffff);
      else coverTone(topColor, look, f.top.color);
      coverTone(cov.color, look, f.cut.color);
      if (f.coat) coverTone(cov.color, look, f.coat.color);
    } else {
      tweenColor(`frostS${i}`, [f.side, ...(f.coat ? [f.coat] : [])], coverTone(cov.color, look));
      tweenColor(`frostT${i}`, [f.top], coverTone(topColor, look));
      tweenColor(`frostC${i}`, [f.cut], coverTone(cov.color, look));
    }
    f.mapped = state;
    if (f.scrape) displayColor(cov.color, f.scrape.color);
  }

  /** O bolo de rosetas: uma roseta de bico em cada pedaço da cobertura do andar ti (um lote só, uma chamada de desenho). */
  const coatBatches = [];
  const rosetteGeos = {};
  function rosetteCoat(t, ti) {
    const f = frostOf(ti);
    f.coat ||= new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.66, ...clipped });
    // bolo de andares ou grande: centenas de rosetas, cada uma pequena na tela → a malha leve
    const far = m.stack.length > 1 || m.base.R > 1.3;
    const rosetteGeo = (rosetteGeos[far ? 'far' : 'near'] ||= rosetteCoatGeometry(tier.detail, far));
    const batch = new Batch(rosetteGeo, f.coat, { cast: tier.smallCastShadow, receive: true });
    const q = new THREE.Quaternion();
    const spin = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3();
    rosetteSpots(t).forEach((s) => {
      dir.set(s.nx, s.ny, s.nz).normalize();
      q.setFromUnitVectors(up, dir).multiply(spin.setFromAxisAngle(up, s.spin));
      batch.add(s.x, t.y0 + s.y, s.z, q, s.scale, null, s.rad);
    });
    const built = batch.build(m.base.center);
    if (built) {
      built.userData.part = { kind: 'cobertura', tier: ti, piece: 'rosetas' };
      coatBatches.push(batch);
    }
    return built;
  }

  function rebuildBody() {
    coatBatches.forEach((b) => b.mesh?.dispose());
    coatBatches.length = 0;
    disposeGroup(bodyGroup);
    ['massa', 'recheio', 'cobertura'].forEach(forget);
    m.stack.forEach((t, ti) => {
      const f = frostOf(ti);
      const g = new THREE.Group();
      g.position.y = t.y0;
      bodyGroup.add(g);
      const at = { tier: ti };
      if (t.volcano) {
        // bolo vulcão: a massa de fôrma de furo e, por cima, o creme que enche o furo e transborda
        bundtColor(flavorOf(0), bundt().color);
        g.add(built(`massa:${ti}:0`, mesh(buildBundt(t), bundt()), { ...at, index: 0 }));
        const seed = (Math.round(t.R * 100) * 13 + 7) | 0;
        g.add(built(`cobertura:${ti}`, mesh(buildVolcanoCream(t, seed), [f.side, f.top]), at));
        return;
      }
      if (!t.naked) {
        g.add(built(`cobertura:${ti}`, mesh(buildFrosting(t), [f.side, f.top]), at));
        if (t.style === 'rosetas') {
          const coat = rosetteCoat(t, ti);
          if (coat) bodyGroup.add(built(`cobertura:${ti}:rosetas`, coat, { ...at, kind: 'cobertura' }));
        }
        return;
      }
      t.layerY.forEach((_, i) => {
        const mat = crustMat(i);
        g.add(built(`massa:${ti}:${i}`, mesh(buildSponge(t, i), [mat, mat]), { ...at, index: i }));
      });
      // semi-naked: entre as camadas aparece o próprio creme da cobertura, não o recheio
      t.fillY.forEach((_, i) => {
        const band = mesh(buildFillingBand(t, i), t.semi ? f.side : bandMat(i));
        g.add(band);
        let jam = null;
        // recheio de fruta no naked: o fio de geleia aparece junto ao creme
        if (!t.semi && fillingOf(i)?.cream) {
          jamMat(i).color.set(fillingOf(i).color);
          jam = mesh(buildJamThread(t, i), jamMat(i), { cast: false });
          g.add(jam);
        }
        built(`recheio:${ti}:${i}`, [band, jam], { ...at, index: i });
      });
      g.add(built(`cobertura:${ti}`, mesh(buildTopCream(t), [f.side, f.top]), at));
      // a raspada de creme: um véu só sobre a lateral inteira do andar
      const veil = mesh(buildScrapeCoat(t), scrapeOf(ti), { cast: false });
      veil.renderOrder = 2;
      g.add(built(`cobertura:${ti}:veu`, veil, { ...at, kind: 'cobertura' }));
    });
  }

  /**
   * A receita de montagem do bolo atual, na ordem do confeiteiro (ver o cabeçalho). Só dados e fábricas de
   * peças avulsas: nada é acrescentado à cena aqui.
   */
  function assembly() {
    if (!m) return [];
    const steps = [{ id: 'base', kind: 'base', tier: null, index: null, label: 'base', make: null }];
    const piece = (geo, material, y0) => {
      const ms = mesh(geo, material);
      ms.position.y = y0;
      return ms;
    };
    m.stack.forEach((t, ti) => {
      if (t.volcano) steps.push({ id: `massa:${ti}:0`, kind: 'massa', tier: ti, index: 0, label: flavorOf(0).name, make: () => piece(buildBundt(t), bundt(), t.y0) });
      else {
        t.layerY.forEach((_, i) => {
          steps.push({ id: `massa:${ti}:${i}`, kind: 'massa', tier: ti, index: i, label: flavorOf(i).name, make: () => piece(buildSponge(t, i), [crustMat(i), crustMat(i)], t.y0) });
          if (i < t.fillY.length) steps.push({ id: `recheio:${ti}:${i}`, kind: 'recheio', tier: ti, index: i, label: fillingOf(i).name, make: () => piece(buildFillingBand(Object.assign(Object.create(t), { semi: false }), i), bandMat(i), t.y0) });
        });
      }
      steps.push({ id: `cobertura:${ti}`, kind: 'cobertura', tier: ti, index: null, label: t.cover.type, make: null });
      if (config.drip.on) steps.push({ id: `calda:${ti}`, kind: 'calda', tier: ti, index: null, label: 'calda', make: null });
    });
    if (pipingPart?.group.children.length) steps.push({ id: 'bico', kind: 'bico', tier: null, index: null, label: config.piping.style, make: null });
    decorParts.forEach((_, id) => steps.push({ id: `decor:${id}`, kind: 'decor', tier: null, index: null, label: id, make: null }));
    return steps;
  }

  function applyLayerColors(instant) {
    config.layers.forEach((id, i) => {
      const f = getFlavor(id);
      // só os que já existem: massa e miolo nascem (já na cor certa) quando o bolo é naked ou é aberto
      const crust = crustMats[i];
      const crumb = crumbMats[i];
      if (i === 0 && bundtMat) bundtColor(f, bundtMat.color);
      if (crust) {
        if (instant) crust.color.set(f.crust);
        else tweenColor(`crust${i}`, [crust], f.crust);
      }
      if (crumb) {
        // massa com desenho: a textura troca na hora (a cor do material é branca; não há o que animar)
        const had = crumb.map !== tex.crumb();
        tweens.delete(`crumb${i}`);
        if (instant || f.look || had) crumbLook(crumb, f);
        else tweenColor(`crumb${i}`, [crumb], f.crumb);
      }
    });
    // chá revelação: o recheio inteiro é tingido de rosa ou azul (a tela só manda a cor depois de "revelar")
    const secret = config.reveal?.on ? getRevealColor(config.reveal.color)?.hex : null;
    config.fillings.forEach((id, i) => {
      const f = getFilling(id);
      // recheio é creme: fosco, com um brilho discreto só nos mais lisos (brigadeiro, doce de leite)
      [bandMat(i), cutFillMat(i)].forEach((mat) => {
        mat.roughness = 0.86 - f.gloss * 0.3;
        mat.clearcoat = tier.physical ? Math.max(0.002, f.gloss * 0.12) : 0;
        mat.clearcoatRoughness = 0.5;
      });
      // mousse: aerada, cheia de bolhinhas (o mesmo relevo de poros da cobertura de mousse)
      const pores = f.aerated ? tex.poreNormal() : null;
      const cutMat = cutFillMat(i);
      if (cutMat.normalMap !== pores) {
        cutMat.normalMap = pores;
        cutMat.normalScale.setScalar(0.55);
        cutMat.needsUpdate = true;
      }
      // recheio de fruta: o que se vê é o creme; a geleia (a cor da fruta) é um fio junto dele
      const body = secret || f.cream || f.color;
      if (f.cream) [jamMats[i], cutJamMats[i]].forEach((mat) => mat?.color.set(f.color));
      if (instant) {
        bandMat(i).color.set(body);
        cutFillMat(i).color.set(body);
      } else tweenColor(`fill${i}`, [bandMat(i), cutFillMat(i)], body);
    });
  }

  function rebuildDrip() {
    disposeGroup(dripGroup);
    forget('calda');
    if (!config.drip.on) return;
    m.stack.forEach((t, ti) => {
      const seed = (t.shape.length * 31 + Math.round(t.R * 100) + t.n * 7 + ti * 101) | 0;
      const drip = mesh(buildDrip(t, seed), dripMat, { cast: tier.smallCastShadow });
      drip.position.y = t.y0;
      dripGroup.add(built(`calda:${ti}`, drip, { tier: ti }));
    });
  }

  function rebuildCut() {
    disposeGroup(cutGroup);
    forget('corte');
    if (wedge.span <= 0.002) return;
    const opts = { cast: false, receive: true };
    // o corte passa pelo mesmo eixo em todos os andares (o do andar de baixo)
    m.stack.forEach((t, ti) => {
      const local = Object.assign(Object.create(t), { center: m.base.center });
      const cut = { thetaA: wedge.a, thetaB: wedge.a + wedge.span, drip: config.drip.on, seed: t.n + ti * 5 };
      const faces = t.volcano ? buildVolcanoCut(local, cut) : buildCutFaces(local, cut);
      const g = new THREE.Group();
      g.position.y = t.y0;
      cutGroup.add(g);
      named.set(`corte:${ti}`, { name: `corte:${ti}`, kind: 'corte', tier: ti, index: null, objects: [g] });
      // r5-cena: cada face leva de quem é (userData.cut), para a animação de uma camada mover a face dela junto
      const tag = (ms, of, index) => {
        ms.userData.cut = { of, index, tier: ti };
        return ms;
      };
      faces.sponge.forEach((geo, i) => geo && g.add(tag(mesh(geo, crumbMat(i), opts), 'massa', i)));
      faces.filling.forEach((geo, i) => geo && g.add(tag(mesh(geo, cutFillMat(i), opts), 'recheio', i)));
      faces.jam.forEach((geo, i) => {
        if (!geo) return;
        cutJamMat(i).color.set(fillingOf(i).color);
        g.add(tag(mesh(geo, cutJamMat(i), opts), 'recheio', i));
      });
      if (faces.pieces) g.add(mesh(faces.pieces, fruitPieces(), opts));
      if (faces.frost) g.add(mesh(faces.frost, frostOf(ti).cut, opts));
      if (faces.drip) g.add(mesh(faces.drip, cutDrip, opts));
    });
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
      const c = new THREE.Vector3(m.base.center.x, 0, m.base.center.z);
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
        const hidden = w && !o.clipped && inWedge(o, w); // peça "clipped" é cortada pelos mesmos planos do bolo
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
    // clip = planos de corte do "ver por dentro", para as peças que são fatiadas junto com o bolo (a escrita)
    return { config, m, lib, layout, tier, clip: clipped };
  }

  /** Lista das peças de decoração de uma configuração: id → chave (muda a chave, reconstrói). */
  function decorPlan(cfg, sig) {
    const plan = new Map();
    // r5-decor: decorIdsOf = itens escolhidos + decorações das peças colocadas à mão (decor.placed)
    decorIdsOf(cfg).forEach((id) => {
      if (id === 'topo') return;
      // as velas mudam de lugar quando entra ou sai o topo personalizado
      plan.set(id, `${sig}|${id}${id === 'velas' ? `${cfg.decor.candles}|${cfg.decor.number}|${Boolean(cfg.decor.topper?.text)}` : ''}`);
    });
    const plaque = cfg.decor.messageMode !== 'bico' ? cfg.decor.message : '';
    if (cfg.decor.items.includes('topo') || plaque) plan.set('toppers', `${sig}|toppers|${cfg.decor.items.includes('topo')}|${plaque}`);
    if (cfg.decor.messageMode === 'bico' && cfg.decor.message) plan.set('escrita', `${sig}|escrita|${cfg.decor.message}|${cfg.decor.script}|${cfg.decor.messageColor}|${cfg.decor.candles}|${cfg.decor.number}|${Boolean(cfg.decor.topper?.text)}`);
    if (cfg.decor.topper?.text) plan.set('toponome', `${sig}|toponome|${cfg.decor.topper.text}|${cfg.decor.topper.color}|${plaque}`);
    if (m.stack.some((t) => t.style === 'respingo')) plan.set('respingo', `${sig}|respingo`);
    return plan;
  }

  /* ───────── Câmera ───────── */
  const _off = new THREE.Vector3();
  const _sph = new THREE.Spherical();
  const _bd = new THREE.Color();

  /** Posição da câmera em volta do alvo. Sem `out`, devolve um objeto novo (fora do laço de desenho). */
  function getSpherical(out = {}) {
    _sph.setFromVector3(_off.copy(camera.position).sub(controls.target));
    out.az = _sph.theta;
    out.polar = _sph.phi;
    out.dist = _sph.radius;
    out.ty = controls.target.y;
    out.tz = controls.target.z;
    return out;
  }

  function applySpherical(s) {
    controls.target.set(0, s.ty, s.tz ?? 0);
    camera.position.setFromSpherical(_sph.set(s.dist, s.polar, s.az)).add(controls.target);
    camera.lookAt(controls.target);
  }

  const anglesOf = (name) => (m?.shape === 'heart' ? HEART_VIEW : VIEW)[name] || VIEW.default;

  /** Margens do palco em frações da altura e quanto do espaço útil o bolo pode ocupar. */
  function insetsNow() {
    const i = insets?.() || {};
    return { top: (i.top || 0) / size.h, bottom: (i.bottom || 0) / size.h, fill: i.fill || 0.78 };
  }

  const fitCam = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  const fitSph = new THREE.Spherical();
  const fitV = new THREE.Vector3();

  /** Pontos que precisam caber no quadro: prato, pé, borda do topo e o alto da decoração. */
  function fitPoints() {
    const pts = [];
    const ring = (r, y, cz = 0, n = 14) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        pts.push(Math.cos(a) * r, y, cz + Math.sin(a) * r);
      }
    };
    ring(stand.plateRadius, -0.02);
    ring(stand.plateRadius * 0.5, stand.floorY);
    if (ground.drop) ring(ground.radius || stand.plateRadius * 0.5, stand.floorY - ground.drop); // r5-cena: a bailarina cabe no quadro
    if (m.base !== m) ring(m.base.bounds.maxR, m.base.Ht);
    (stand.points || []).forEach((p) => pts.push(p[0], p[1], p[2])); // a tampa aberta da caixinha do bentô
    ring(m.bounds.maxR, m.Htot + (layout.pipeTop ? 0.1 : 0.01));
    ring(Math.min(0.6, m.rMin * 0.7), m.Htot + decorTop(config), m.center.z, 8);
    return pts;
  }

  /**
   * Distância e alvo para o bolo inteiro (boleira e decoração incluídas) caber no quadro.
   * Projeta os pontos de verdade, em vez de estimar: o bolo ocupa a fração "fill" do espaço útil,
   * já descontadas as margens de cima e de baixo (botões que flutuam sobre o palco).
   */
  function computeFit(aspect, angles, { top = 0, bottom = 0, fill = 0.78 } = {}) {
    const pts = fitPoints();
    fitCam.fov = camera.fov;
    fitCam.aspect = aspect;
    fitCam.updateProjectionMatrix();
    const tanV = Math.tan((camera.fov * DEG) / 2);
    const elev = Math.PI / 2 - angles.polar;
    const lo = -1 + 2 * bottom;
    const hi = 1 - 2 * top;
    const midY = (lo + hi) / 2;
    const halfY = ((hi - lo) / 2) * fill;
    const tz = m.center.z * 0.5;
    let ty = (m.Htot + decorTop(config) + stand.floorY) / 2;
    const measure = (dist) => {
      fitSph.set(dist, angles.polar, angles.az || 0);
      fitCam.position.setFromSpherical(fitSph);
      fitCam.position.y += ty;
      fitCam.position.z += tz;
      fitCam.lookAt(0, ty, tz);
      fitCam.updateMatrixWorld();
      let minY = Infinity;
      let maxY = -Infinity;
      let maxX = 0;
      for (let i = 0; i < pts.length; i += 3) {
        fitV.set(pts[i], pts[i + 1], pts[i + 2]).project(fitCam);
        minY = Math.min(minY, fitV.y);
        maxY = Math.max(maxY, fitV.y);
        maxX = Math.max(maxX, Math.abs(fitV.x));
      }
      return { minY, maxY, maxX };
    };
    let dist = 6;
    for (let pass = 0; pass < 3; pass++) {
      let near = 1.2;
      let far = 40;
      for (let i = 0; i < 20; i++) {
        const mid = (near + far) / 2;
        const e = measure(mid);
        if ((e.maxY - e.minY) / 2 <= halfY && e.maxX <= fill) far = mid;
        else near = mid;
      }
      dist = far;
      const e = measure(dist);
      // centraliza no espaço útil mexendo só na altura do alvo (o eixo de giro continua no bolo)
      ty += (((e.minY + e.maxY) / 2 - midY) * dist * tanV) / Math.cos(elev);
    }
    // bolos menores ficam um pouco mais longe: dá para sentir a diferença entre P, M e G
    const sizeCue = 1 + 0.08 * Math.max(0, 1.25 - m.base.R);
    return { dist: dist * sizeCue, ty, tz };
  }

  function updateLimits() {
    controls.minDistance = fitDist * 0.5;
    controls.maxDistance = fitDist * 1.45;
  }

  function flyTo(to, dur = 0.7, { exact = false } = {}) {
    const from = getSpherical();
    let target = to;
    if (!exact) {
      // gira pelo caminho mais curto
      let d = (to.az - from.az) % TAU;
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      target = { ...to, az: from.az + d };
    }
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
    const v = view ? anglesOf(view) : null;
    const angles = v || { az: cur.az, polar: cur.polar };
    const fit = computeFit(size.w / size.h, angles, insetsNow());
    const zoom = v || !fitDist ? 1 : THREE.MathUtils.clamp(cur.dist / fitDist, 0.5, 1.45);
    fitDist = fit.dist;
    updateLimits();
    const to = { az: angles.az, polar: angles.polar, dist: fit.dist * zoom, ty: fit.ty, tz: fit.tz };
    if (animate) flyTo(to, 0.65);
    else {
      flying = null;
      applySpherical(to);
      controls.update();
    }
    invalidate();
  }

  /** Uma volta completa em torno do bolo, terminando na vista da etapa (a revelação do resumo). */
  function spin({ turns = 1, dur = 2.8 } = {}) {
    if (!m || reduceMotion) return;
    const v = anglesOf(cutaway ? 'inside' : viewName);
    const fit = computeFit(size.w / size.h, v, insetsNow());
    fitDist = fit.dist;
    updateLimits();
    const from = getSpherical();
    let d = (v.az - from.az) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    flying = { from, to: { az: from.az + d + TAU * turns, polar: v.polar, dist: fit.dist, ty: fit.ty, tz: fit.tz }, t: 0, dur };
    holdUntil = now + dur + 0.8;
    invalidate();
  }

  /** Pausa o giro automático por alguns segundos (ex.: logo depois de trocar o formato). */
  function holdRotation(ms = 3000) {
    holdUntil = Math.max(holdUntil, now + ms / 1000);
  }

  /**
   * Enquanto a pessoa escreve a mensagem: para o giro e leva a câmera para a frente da plaquinha,
   * mais perto. focusPlaque(false) volta ao enquadramento da etapa.
   */
  function focusPlaque(on) {
    if (!m) return;
    if (!on) {
      if (!focus) return;
      focus = false;
      updateLimits();
      frame({ view: cutaway ? 'inside' : viewName, animate: true });
      return;
    }
    focus = true;
    const p = decorParts.get('toppers')?.plaque || {
      y: layout.topY + 0.48,
      z: m.center.z - Math.min(0.34, layout.rho * 0.36),
      w: 0.72,
      h: 0.36,
    };
    const tanV = Math.tan((camera.fov * DEG) / 2);
    const aspect = size.w / size.h;
    const dist = Math.max(fitDist * 0.36, (p.w * 0.5) / (tanV * aspect * 0.36), (p.h * 0.5) / (tanV * 0.22));
    controls.minDistance = Math.min(controls.minDistance, dist * 0.9);
    flyTo({ az: 0, polar: 66 * DEG, dist, ty: p.y - 0.05, tz: p.z }, 0.55);
    invalidate();
  }

  /* ───────── API: configuração ───────── */
  /**
   * instant: sem animação e tudo pronto na volta (miniaturas, fotos).
   * staged: primeira aparição — o corpo do bolo já, bicos e decorações chegando um a um nos quadros seguintes.
   */
  function setConfig(next, { instant = false, staged = false, animate = true, by = 'user' } = {}) {
    if (disposed || !next) return;
    jobs.length = 0;
    lastInput = clock();
    skipUntil = lastInput + 0.4;
    const prev = config;
    const prevM = m;
    const first = !prev;
    // r5-cena: com o ateliê ligado, a cena dirige a mudança (antes de refazer: guarda a cobertura antiga, encerra
    // a animação em curso). directed = ela vai tocar a animação de preparo no lugar do "assentar" de sempre.
    const told = Boolean(stage && atelierOn && !first && !instant && !staged);
    const directed = told && animate !== false && stage.before(prev, next, { by }) === true;
    config = JSON.parse(JSON.stringify(next));
    m = cakeMetrics(config, tier.detail);
    layout = decorLayout(config, m);
    const quiet = instant || staged || reduceMotion;

    // o que muda a GEOMETRIA: formato, tamanho, andares, base; e, no corpo, camadas, altura e tipo/estilo de cada andar
    const styles = m.stack.map((t) => `${t.type}:${t.style}`).join();
    const kStand = `${config.shape}|${config.size}|${config.tiers}|${config.base}`;
    // (recheios de fruta ganham um fio de geleia por fora, no naked: trocar o recheio pode mudar a geometria)
    // (no vulcão, a quantidade e o comprimento da cobertura mudam a malha do creme)
    const kBody = `${kStand}|${m.n}|${styles}|${m.naked || m.stack.some((t) => t.naked) ? config.fillings.map((id) => (getFilling(id)?.cream ? 1 : 0)).join('') : ''}|${m.volcano ? `${config.drip.amount}${config.drip.length}` : ''}`;
    const kDrip = `${kBody}|${config.drip.on}|${config.drip.amount}|${config.drip.length}|${config.drip.half}`;
    // r5-decor: a chave do bico vem de decor.js (cerca em volta, cintura e topo coberto mudam o que ele desenha)
    const kPipe = `${kDrip}|${pipingKey(config, layout)}`;
    const kLayers = `${config.layers.join()}|${config.fillings.join()}|${(config.fillAdds || []).join()}`;
    const sig = `${kPipe}|${[...config.decor.items].sort().join()}|${config.decor.message ? config.decor.messageMode : 0}|${JSON.stringify(config.decor.opts)}|${config.decor.candleStyle}|${layout.key || ''}`;

    const standChanged = kStand !== keys.stand;
    const bodyChanged = kBody !== keys.body;
    if (standChanged) rebuildStand();
    if (bodyChanged) rebuildBody();

    // cores
    m.stack.forEach((_, i) => applyTierLook(i, first || quiet || bodyChanged));
    // calda dourada ou metálica: pó comestível pincelado — reflete como metal, com um fundo quente da própria cor
    const metal = Boolean(config.drip.metal);
    if (metal !== dripMat.userData.metal) {
      dripMat.userData.metal = metal;
      [dripMat, cutDrip].forEach((mt) => {
        mt.metalness = metal ? 0.82 : 0;
        mt.emissiveIntensity = metal ? 0.3 : 0;
      });
      dripMat.roughness = metal ? 0.3 : tier.physical ? 0.2 : 0.13;
      dripMat.clearcoat = metal ? 0 : coat(0.85);
      cutDrip.roughness = metal ? 0.34 : 0.35;
    }
    // (r5-cena: calda que acabou de ser ligada já nasce na cor dela — não atravessa a cor da calda anterior)
    if (first || quiet || (directed && !prev.drip.on)) {
      [dripMat, cutDrip].forEach((mt) => displayColor(config.drip.color, mt.color));
      displayColor(config.piping.color, lib.mat.piping().color);
      tweens.delete('drip');
      tweens.delete('pipe');
    } else {
      tweenColor('drip', [dripMat, cutDrip], config.drip.color);
      tweenColor('pipe', [lib.mat.piping()], config.piping.color);
    }
    const pipeMat = lib.mat.piping();
    if (pipeMat.sheenColor) displayColor(config.piping.color, pipeMat.sheenColor).lerp(_bd.set(0xffffff), 0.55);
    applyLayerColors(first || quiet || bodyChanged);

    if (kDrip !== keys.drip) rebuildDrip();

    // Bicos e decorações: cada peça que mudou é construída num quadro próprio — o toque nunca espera por elas,
    // e a peça antiga fica no lugar até a nova chegar. Só as novas entram com animação.
    const pop = !(instant || reduceMotion);
    const pipeStyle = `${config.piping.style}|${config.piping.where}`;
    if (!pipingPart || pipingPart.key !== kPipe) {
      jobs.push(() => {
        const old = pipingPart;
        const part = buildPiping(buildContext());
        part.key = kPipe;
        part.style = pipeStyle;
        part.born = !pop || (!staged && old && old.batches.length > 0 && old.style === pipeStyle) ? -100 : now;
        part.fresh = part.born === now; // r5-cena: peça nova de verdade (a cena anima a chegada dela)
        disposePart(old);
        pipingPart = part;
        cakeGroup.add(part.group);
        built('bico', part.group);
        refreshParts(true);
      });
    }
    const plan = decorPlan(config, sig);
    [...decorParts.keys()].forEach((id) => {
      if (!plan.has(id)) {
        // r5-cena: a cena pode ficar com a peça retirada (ela some com animação e é liberada depois)
        const gone = decorParts.get(id);
        if (!(directed && stage.adopt(id, gone))) disposePart(gone);
        decorParts.delete(id);
        named.delete(`decor:${id}`);
      }
    });
    plan.forEach((k, id) => {
      const old = decorParts.get(id);
      if (old && old.key === k) return;
      const own = ownKey(id);
      jobs.push(() => {
        const prev = decorParts.get(id);
        const part = buildAnyDecor(id, buildContext());
        part.key = k;
        part.own = own;
        part.born = !pop || (!staged && prev && prev.own === own) ? -100 : now;
        part.fresh = part.born === now; // r5-cena
        disposePart(prev);
        decorParts.set(id, part);
        cakeGroup.add(part.group);
        built(`decor:${id}`, part.group, { kind: 'decor' });
        if (id === 'velas' && part.lightAt) candleLight.position.copy(part.lightAt);
        refreshParts(true);
      });
    });

    if (wedge.span > 0.002 && (bodyChanged || kDrip !== keys.drip || kLayers !== keys.layers)) {
      applyWedge();
    } else refreshParts(true);

    // luz das velas
    // chamas acesas: as clássicas (quantas a pessoa escolheu), uma por algarismo ou a vela faísca
    const flamesLit = config.decor.candleStyle === 'numero' ? config.decor.number.length : config.decor.candleStyle === 'faisca' ? 4 : config.decor.candles;
    const lightTo = plan.has('velas') && flamesLit ? 0.5 + Math.sqrt(flamesLit) * 0.42 : 0;
    if (quiet) candleLight.userData.base = lightTo;
    else {
      const from = candleLight.userData.base || 0;
      tween('candle', 0.5, (k) => (candleLight.userData.base = from + (lightTo - from) * k));
    }

    // movimento: o bolo "assenta" quando ganha camada, muda de formato ou de tamanho
    // (r5-cena: com a cena dirigindo, quem mexe o bolo é a animação de preparo)
    if (directed) {
      tweens.delete('settle');
      cakeGroup.scale.setScalar(1);
    } else if (!quiet) {
      if (first) {
        cakeGroup.scale.setScalar(0.82);
        tween('settle', 0.75, (k) => cakeGroup.scale.setScalar(0.82 + 0.18 * k), { ease: bounce });
      } else if (bodyChanged && prevM) {
        const ratio = prevM.n !== m.n ? THREE.MathUtils.clamp(prevM.Htot / m.Htot, 0.6, 1.4) : 1;
        const side = standChanged && wedge.span <= 0.002 ? 0.93 : 1;
        cakeGroup.scale.set(side, ratio === 1 ? 0.95 : ratio, side);
        const fromY = cakeGroup.scale.y;
        tween('settle', 0.7, (k) => cakeGroup.scale.set(side + (1 - side) * k, fromY + (1 - fromY) * k, side + (1 - side) * k), { ease: bounce });
      }
    } else if (staged && !reduceMotion) {
      cakeGroup.scale.setScalar(0.86);
      tween('settle', 0.75, (k) => cakeGroup.scale.setScalar(0.86 + 0.14 * k), { ease: bounce });
    } else {
      tweens.delete('settle');
      cakeGroup.scale.setScalar(1);
    }

    const topChanged = !prevM || Math.abs(prevM.Htot + decorTop(prev) - (m.Htot + decorTop(config))) > 0.02;
    const heartSwitch = prevM && prevM.shape !== m.shape && (m.shape === 'heart' || prevM.shape === 'heart');
    if (first) frame({ view: viewName, animate: false });
    else if (focus) focusPlaque(true);
    else if (heartSwitch) {
      // o coração tem enquadramento próprio; o giro espera um pouco para a pessoa ver o formato
      frame({ view: cutaway ? 'inside' : viewName, animate: !quiet });
      if (m.shape === 'heart') holdRotation(3200);
    } else if (standChanged || topChanged) frame({ animate: !quiet });

    // r5-cena: a cena escolhe e toca a animação pelo que mudou (ou só avisa o som, na transição curta)
    if (stage) stage.after(prev, config, { told, by, animate, directed, standChanged, bodyChanged, dripChanged: kDrip !== keys.drip, prevM });
    keys = { stand: kStand, body: kBody, drip: kDrip, pipe: kPipe, layers: kLayers };
    fitShadow();
    if (instant) while (jobs.length) jobs.shift()();
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
    // r5-cena: no ateliê, a entrada é a animação de preparo (a base chega e o bolo assenta nela)
    if (stage && atelierOn) {
      stage.play('intro');
      return;
    }
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
    // tudo o que é desenhado com letras: plaquinha, escrita com bico e topo personalizado
    let any = false;
    ['toppers', 'escrita', 'toponome'].forEach((id) => {
      const old = decorParts.get(id);
      if (!old || (id === 'toppers' && !config?.decor.message)) return;
      const part = buildAnyDecor(id, buildContext());
      part.key = old.key;
      part.own = old.own;
      part.born = -100;
      disposePart(old);
      decorParts.set(id, part);
      cakeGroup.add(part.group);
      any = true;
    });
    if (!any) return;
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
      let step = 0;
      tween('wedge', 0.62, (k) => {
        if (k < 1 && step++ % tier.wedgeEvery) return; // no celular: quadro sim, quadro não (e sempre o último)
        wedge.span = from + (to - from) * k;
        applyWedge();
      }, { ease: easeInOut });
    }
    if (on && !focus) {
      const v = anglesOf('inside');
      const fit = computeFit(size.w / size.h, v, insetsNow());
      swayBase = v.az;
      swayT = 0;
      if (!instant) flyTo({ az: v.az, polar: v.polar, dist: fit.dist * 0.96, ty: fit.ty, tz: fit.tz }, 0.8);
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
    if (m && !focus) frame({ view: viewName, animate });
  }

  function resetView() {
    if (!m) return;
    focus = false;
    frame({ view: cutaway ? 'inside' : viewName, animate: true });
    swayT = 0;
    swayBase = anglesOf(cutaway ? 'inside' : viewName).az;
  }

  /* ───────── Laço de desenho ───────── */
  const _cam = {};
  function placeLight(light, center, az, elev, dist) {
    light.position.set(center.x + Math.sin(az) * Math.cos(elev) * dist, center.y + Math.sin(elev) * dist, center.z + Math.cos(az) * Math.cos(elev) * dist);
    light.target.position.copy(center);
    light.target.updateMatrixWorld();
  }

  function placeLights() {
    const az = getSpherical(_cam).az;
    // luz principal sempre vindo do alto, à esquerda de quem olha
    placeLight(key, shadowCenter, az - 48 * DEG, 52 * DEG, 7);
    placeLight(fill, controls.target, az + 70 * DEG, 18 * DEG, 6);
    placeLight(rim, controls.target, az + 165 * DEG, 38 * DEG, 6);
    placeFloorShadow(az - 48 * DEG);
  }

  function applyRatio(r) {
    if (Math.abs(r - curRatio) < 1e-3) return;
    curRatio = r;
    renderer.setPixelRatio(r);
    renderer.setSize(size.w, size.h, false);
    skipUntil = clock() + 0.3; // o quadro que realoca a tela não serve de medida
  }

  /* Tempo da placa de vídeo, quando o aparelho informa (muitos WebViews não informam: aí vale só o da CPU).
     Uma consulta por vez; o resultado chega um ou dois quadros depois. */
  const gl = renderer.getContext();
  let gpuExt = null;
  try {
    gpuExt = renderer.capabilities.isWebGL2 ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;
  } catch {
    gpuExt = null;
  }
  let gpuQuery = null;
  let gpuOpen = false;
  let gpuMs = null;
  let gpuAt = 0;
  function gpuPoll(t) {
    if (!gpuExt || !gpuQuery || gpuOpen) return;
    try {
      const ready = gl.getQueryParameter(gpuQuery, gl.QUERY_RESULT_AVAILABLE);
      const disjoint = gl.getParameter(gpuExt.GPU_DISJOINT_EXT);
      if (!ready && !disjoint) return;
      if (ready && !disjoint) {
        gpuMs = gl.getQueryParameter(gpuQuery, gl.QUERY_RESULT) / 1e6;
        gpuAt = t;
      }
      gl.deleteQuery(gpuQuery);
    } catch {
      gpuExt = null;
    }
    gpuQuery = null;
  }

  /** Desenha um quadro e devolve o tempo de render na CPU (ms). measure = este quadro entra na medição da placa de vídeo. */
  function draw(measure = false) {
    placeLights();
    if (measure && gpuExt && !gpuQuery && !lost) {
      try {
        gpuQuery = gl.createQuery();
        gl.beginQuery(gpuExt.TIME_ELAPSED_EXT, gpuQuery);
        gpuOpen = true;
      } catch {
        gpuExt = null;
        gpuQuery = null;
      }
    }
    const t0 = performance.now();
    renderer.render(scene, camera);
    const ms = performance.now() - t0;
    if (gpuOpen) {
      gl.endQuery(gpuExt.TIME_ELAPSED_EXT);
      gpuOpen = false;
    }
    stats.renders++;
    return ms;
  }

  /**
   * Medidas do bolo na tela, para o modo "ver medidas": as duas pontas da largura de cada andar (de baixo
   * para cima) e as da altura total, em pixels de CSS a partir do canto da tela 3D.
   */
  const _mp = new THREE.Vector3();
  function measure() {
    if (!m) return null;
    camera.updateMatrixWorld();
    // "direita" da câmera, deitada no plano da mesa
    _mp.setFromMatrixColumn(camera.matrixWorld, 0);
    const len = Math.hypot(_mp.x, _mp.z) || 1;
    const rx = _mp.x / len;
    const rz = _mp.z / len;
    const k = cakeGroup.scale;
    const at = (d, y) => {
      _mp.set(rx * d * k.x, y * k.y, rz * d * k.z).project(camera);
      return { x: (_mp.x * 0.5 + 0.5) * size.w, y: (0.5 - _mp.y * 0.5) * size.h };
    };
    const span = (t) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < t.frost.n; i++) {
        const d = t.frost.x[i] * rx + t.frost.z[i] * rz;
        if (d < lo) lo = d;
        if (d > hi) hi = d;
      }
      return { lo, hi };
    };
    const tiers = m.stack.map((t) => {
      const { lo, hi } = span(t);
      const y = t.y0 + t.Ht * 0.5;
      return { left: at(lo, y), right: at(hi, y) };
    });
    const edge = span(m.base).lo;
    return { tiers, height: { bottom: at(edge, 0), top: at(edge, m.Htot) } };
  }

  /** Estado da qualidade em uso (só leitura; exposto no gancho ?czdebug). */
  function quality() {
    return { tier: tier.name, devicePixelRatio: deviceRatio(), ratio: curRatio, stillRatio: stillRatio(), sharp, gpuTimer: Boolean(gpuExt), governor: gov.state() };
  }

  /** Sem ninguém mexer há um tempo (celular): o giro e as chamas descansam até o próximo toque. */
  const resting = (t) => tier.idleSleep > 0 && t - lastInput > tier.idleSleep;

  function tick(time) {
    raf = 0;
    if (!running || lost || disposed || paused || offscreen) return;
    ticking = true;
    const t = time / 1000;
    const rawDt = lastFrame ? t - lastFrame : 1 / 60;
    const dt = Math.min(0.05, rawDt);
    lastFrame = t;
    now += dt;
    // período da tela (60, 90, 120 Hz): o menor intervalo visto entre dois quadros seguidos, com folga para se corrigir
    if (!napped) framePeriod = Math.min(1 / 50, framePeriod * 1.002, Math.max(1 / 240, rawDt));
    napped = false;

    let active = dirty;
    dirty = false;
    gpuPoll(t);

    if (runJobs(5)) {
      active = true;
      skipUntil = Math.max(skipUntil, t + 0.25); // peça nova: envio de malhas e, às vezes, compilação
    }

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

    // r5-cena: animações de preparo, cenário e gestos (devolve true enquanto houver o que desenhar)
    if (stage && stage.tick(dt, now)) active = true;

    const calm = t < quietUntil;
    const asleep = resting(t);
    let turning = false;
    if (flying) {
      active = true;
      flying.t += dt;
      const p = Math.min(1, flying.t / flying.dur);
      const e = easeInOut(p);
      const a = flying.from;
      const b = flying.to;
      _cam.az = a.az + (b.az - a.az) * e;
      _cam.polar = a.polar + (b.polar - a.polar) * e;
      _cam.dist = a.dist + (b.dist - a.dist) * e;
      _cam.ty = a.ty + (b.ty - a.ty) * e;
      _cam.tz = a.tz + (b.tz - a.tz) * e;
      applySpherical(_cam);
      if (p >= 1) {
        flying = null;
        swayBase = b.az;
        swayT = 0;
      }
    } else if (autoRotate && !userActive && !focus && now >= holdUntil && !calm && !asleep) turning = true;
    rotClock = turning ? rotClock + dt : 0;

    if (controls.update()) active = true;

    if (partsAnimating()) {
      active = true;
      refreshParts(false);
    }

    const candles = decorParts.get('velas');
    const flames = candles && candles.flames.length ? candles.flames : null;
    const flicker = Boolean(flames) && !reduceMotion && !calm && !asleep;
    // animações de fundo (giro automático, chama das velas) rodam num ritmo mais lento, definido pelo nível
    const ambient = turning || flicker;

    const since = lastRender ? t - lastRender : 1;
    const fps = active ? tier.activeFps : turning ? tier.rotateFps : tier.flickerFps;
    const gap = fps ? 1 / fps : 0;
    const due = since >= gap - framePeriod * 0.6;
    if (active && !due) dirty = true; // fica para o próximo quadro
    if ((active || ambient) && due) {
      if (turning) {
        const sp = getSpherical(_cam);
        if (cutaway) {
          // com o bolo aberto, a câmera só balança de leve em torno da fatia
          swayT += rotClock;
          sp.az = swayBase + Math.sin(swayT * 0.55) * 0.42;
        } else sp.az += rotClock * 0.24;
        rotClock = 0;
        applySpherical(sp);
        // avisa os controles da nova posição sem que isso conte como "a pessoa mexeu" (senão o giro voltaria ao ritmo cheio)
        selfMove = true;
        controls.update();
        selfMove = false;
      }
      if (flames) {
        let sum = 0;
        for (let i = 0; i < flames.length; i++) {
          const f = flames[i];
          const flick = reduceMotion ? 1 : 1 + Math.sin(now * 13 + f.phase) * 0.06 + Math.sin(now * 23.7 + f.phase * 2.1) * 0.05;
          const sway = reduceMotion ? 1 : 1 + Math.sin(now * 7.3 + f.phase) * 0.05;
          // r5-cena: lv = quanto a chama está acesa (1 = como sempre; a cena acende e apaga as velas por aqui)
          const lv = Math.max(f.lv ?? 1, 1e-4);
          f.flame.scale.set(f.sx * sway * lv, f.sy * flick * lv, 1);
          f.glow.material.opacity = 0.5;
          f.glow.scale.setScalar(0.34 * (0.94 + (flick - 1) * 1.5) * lv);
          sum += flick * lv;
        }
        candleLight.intensity = (candleLight.userData.base || 0) * (sum / flames.length);
      } else candleLight.intensity = candleLight.userData.base || 0;

      // em movimento vale a resolução pedida pelo regulador (no caso comum, a máxima: nada é realocado)
      applyRatio(gov.ratio);
      sharp = curRatio >= stillRatio() - 1e-3;
      const cpuMs = draw(true);
      lastRender = t;
      onFrame?.();
      stage?.afterDraw(); // r5-cena: gravação do vídeo (copia o quadro recém-desenhado)
      if (stageWanted && !stageLoad && m) loadStage(); // r5-cena: só depois do primeiro quadro do bolo
      // resolução dinâmica: conta o CUSTO de desenhar este quadro (CPU e, se houver, placa de vídeo) contra o
      // orçamento do modo atual — nunca o intervalo entre quadros, que atrasa por outros motivos
      if (clock() >= skipUntil) {
        const gpuNow = gpuMs != null && t - gpuAt < 0.5 ? gpuMs : null;
        gov.sample(Math.max(cpuMs, gpuNow || 0), 750 / (fps || 60), { cpuMs, gpuMs: gpuNow });
      }
    } else if (!active && !ambient && !sharp && since > 0.22) {
      // parou de mexer: um quadro na resolução máxima, para o bolo parado ficar nítido
      applyRatio(stillRatio());
      sharp = true;
      draw();
      onFrame?.();
      stage?.afterDraw(); // r5-cena
    } else if (!active && !ambient) stats.skipped++;

    // dorme quando não há mais nada para animar; qualquer mudança chama invalidate() e acorda o laço
    const waiting = (autoRotate && !focus && !asleep) || (Boolean(flames) && !reduceMotion && !asleep);
    ticking = false;
    if (dirty || active || !sharp || tweens.size || flying || jobs.length) raf = requestAnimationFrame(tick);
    else if (ambient || waiting) {
      // só animação de fundo pela frente: cochila até perto do próximo quadro dela
      // acorda com uma folga antes do quadro devido: temporizador atrasado não pode derrubar o giro abaixo de ~30 quadros/s
      const ms = ambient ? (gap - (t - lastRender) - framePeriod) * 1000 - 6 : 120;
      if (ms > 4) {
        nap = setTimeout(() => {
          nap = 0;
          napped = true;
          wake();
        }, ms);
      } else raf = requestAnimationFrame(tick);
    }
  }

  function start() {
    if (running || disposed || lost) return;
    running = true;
    lastFrame = 0;
    dirty = true;
    wake();
  }

  function halt() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    clearTimeout(nap);
    nap = 0;
  }

  function stop() {
    running = false;
    halt();
  }

  /** Para de desenhar por completo (diálogo aberto por cima do bolo) e retoma depois. */
  function setPaused(on) {
    on = Boolean(on);
    if (on === paused) return;
    paused = on;
    if (paused) halt();
    else {
      lastFrame = 0;
      invalidate();
    }
  }

  /** Segura o giro automático e as chamas por um instante (enquanto o painel de opções está rolando). */
  function quiet(ms = 180) {
    quietUntil = Math.max(quietUntil, performance.now() / 1000 + ms / 1000);
  }

  /* ───────── Tamanho ───────── */
  function resize() {
    if (disposed) return;
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    if (w === size.w && h === size.h) return;
    size = { w, h };
    gov.limit(stillRatio(), deviceRatio());
    curRatio = Math.min(curRatio, stillRatio());
    skipUntil = clock() + 0.3;
    renderer.setPixelRatio(curRatio);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (m) {
      if (focus) focusPlaque(true);
      else if (flying) {
        // o palco mudou de tamanho no meio de um voo da câmera (ex.: revelação do resumo): corrige o destino sem interromper
        const fit = computeFit(w / h, flying.to, insetsNow());
        fitDist = fit.dist;
        updateLimits();
        Object.assign(flying.to, { dist: fit.dist, ty: fit.ty, tz: fit.tz });
      } else frame({ animate: false });
    }
    invalidate();
  }

  /* ───────── Foto do bolo ───────── */
  /** Desenha o bolo num <canvas> 2D (vista de catálogo, bolo fechado, sem interferir no que está na tela). */
  function snapshotCanvas({ size: px = 360, width = px, height = px, background = true, scale = 2, fill = 0.7, scene: withScene = false } = {}) {
    if (disposed || lost || !m) return null;
    settle();
    const keepCam = getSpherical();
    const keepWedge = wedge.span;
    const keepSize = { ...size };
    // a foto usa o fundo que dá contraste a ESTE bolo (o escolhido à mão ou o automático), e as sombras desse fundo
    const shot = background ? resolveBackdrop(config, null) : getBackdrop('rosa');
    // r5-cena: a foto de catálogo sai como sempre (sem a cozinha); snapshot({ scene: true }) fotografa com ela
    const hidStage = !withScene && stage ? stage.shot(true) : false;
    try {
      if (keepWedge > 0.002) {
        wedge.span = 0;
        applyWedge();
      }
      applyBackdropLook(shot);
      const ss = Math.min(scale, 4096 / Math.max(width, height));
      renderer.setPixelRatio(1);
      renderer.setSize(Math.round(width * ss), Math.round(height * ss), false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const v = anglesOf('default');
      const fit = computeFit(width / height, v, { fill });
      applySpherical({ az: v.az, polar: v.polar, dist: fit.dist, ty: fit.ty, tz: fit.tz });
      candleLight.intensity = candleLight.userData.base || 0;
      draw();
      const out = document.createElement('canvas');
      out.width = width;
      out.height = height;
      const ctx = out.getContext('2d');
      if (background) paintBackdrop(ctx, width, height, shot);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(renderer.domElement, 0, 0, width, height);
      return out;
    } finally {
      if (hidStage) stage.shot(false);
      applyBackdropLook(backdrop);
      renderer.setPixelRatio(curRatio);
      renderer.setSize(keepSize.w, keepSize.h, false);
      camera.aspect = keepSize.w / keepSize.h;
      camera.updateProjectionMatrix();
      applySpherical(keepCam);
      if (keepWedge > 0.002) {
        wedge.span = keepWedge;
        applyWedge();
      }
      draw();
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

  /* ───────── Aquecimento ─────────
     Nos momentos ociosos, adianta o que a pessoa ainda pode escolher — texturas, peças e programas da placa
     de vídeo — para que o primeiro toque em cada opção não engasgue. Uma tarefa por vez, só com tudo parado. */
  const warmQueue = [];
  let warmTimer = 0;
  let warmGap = 60; // pausa entre duas tarefas de aquecimento (maior para o catálogo novo, que é longo)
  const whenIdle = (fn) => ('requestIdleCallback' in window ? window.requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 120));
  function warmNext() {
    if (disposed || lost || !warmQueue.length) return;
    const busy = tweens.size || flying || jobs.length || userActive || paused;
    if (!busy) {
      try {
        warmQueue.shift()();
      } catch (err) {
        console.warn('[bolo 3D] aquecimento ignorado:', err?.message || err);
      }
    }
    if (warmQueue.length) warmTimer = setTimeout(() => whenIdle(warmNext), busy ? 400 : warmGap);
  }

  /**
   * Materiais com planos de corte (massa, recheio e creme do naked, calda) só compilam do jeito certo quando são
   * desenhados de verdade: entram num quadro comum, num pedacinho invisível, um por momento ocioso.
   */
  function warmByDrawing(material, wrap = false) {
    const geo = new THREE.PlaneGeometry(0.01, 0.01);
    if (wrap) geo.setAttribute('uv1', geo.attributes.uv.clone()); // como a malha da cobertura (segundo conjunto de UV)
    const probe = new THREE.Mesh(geo, material);
    probe.frustumCulled = false;
    probe.receiveShadow = true;
    probe.position.set(0, -30, 0);
    scene.add(probe);
    draw();
    skipUntil = clock() + 0.4;
    scene.remove(probe);
    geo.dispose();
    invalidate();
  }

  /**
   * Compila os materiais de um grupo sem travar a tela e chama done() quando ficam prontos. Faz o que
   * renderer.compileAsync faz, mas sem estourar ("reading 'isReady'") quando um material é liberado antes de o
   * programa ficar pronto — o que acontece se o bolo muda no meio do aquecimento (e deixava done() sem rodar).
   */
  function compileQuietly(group, done) {
    let pending;
    try {
      pending = renderer.compile(group, camera, scene);
    } catch {
      done();
      return;
    }
    const poll = () => {
      if (!disposed) {
        pending.forEach((mt) => {
          const program = renderer.properties.get(mt).currentProgram;
          if (!program || program.isReady()) pending.delete(mt);
        });
      }
      if (pending.size && !disposed) setTimeout(poll, 10);
      else done();
    };
    setTimeout(poll, 10);
  }

  function warmUp() {
    if (warmQueue.length || !m || disposed) return;
    warmGap = 60;
    // primeiro o "Ver por dentro" (o momento mais visto), sem travar nada; depois texturas, bicos e decorações;
    // por último, e só bem depois de o bolo aparecer, os materiais que precisam de um quadro de verdade
    warmQueue.push(() => {
      const group = new THREE.Group();
      const geo = new THREE.PlaneGeometry(0.01, 0.01);
      [crumbMat(0), cutFillMat(0), cutFrost, cutDrip].forEach((mt) => group.add(new THREE.Mesh(geo, mt)));
      const done = () => geo.dispose();
      compileQuietly(group, done);
    });
    tex.warmups().forEach((fn) => warmQueue.push(fn));
    const base = JSON.parse(JSON.stringify(config));
    const tryPart = (cfg, build) => () => {
      const m2 = cakeMetrics(cfg, tier.detail);
      const part = build({ config: cfg, m: m2, lib, layout: decorLayout(cfg, m2), tier });
      const done = () => part.dispose();
      if (!part.group.children.length) done();
      else compileQuietly(part.group, done);
    };
    const pipe = (style) => {
      if (style !== 'liso' && style !== config.piping.style) warmQueue.push(tryPart({ ...base, piping: { ...base.piping, style } }, buildPiping));
    };
    const decor = (id) => {
      if (config.decor.items.includes(id)) return;
      warmQueue.push(tryPart({ ...base, decor: { ...base.decor, items: [id], opts: {}, message: '' } }, (ctx) => buildAnyDecor(id === 'topo' ? 'toppers' : id, ctx)));
    };
    // primeiro o que mais se escolhe (os bicos e as decorações de sempre) e os materiais do naked e da calda;
    // o catálogo novo entra depois, com a tela já quieta há mais tempo
    const classicPipes = ['rosetas', 'conchas', 'estrelas', 'bolinhas', 'folhas'];
    const classicDecor = ['frutas', 'flores', 'velas', 'perolas', 'confete', 'granulado', 'raspas', 'topo'];
    classicPipes.forEach(pipe);
    classicDecor.forEach(decor);
    [() => dripMat, () => crustMat(0), () => bandMat(0), scrape].forEach((get) => warmQueue.push(() => warmByDrawing(get())));
    // cobertura em duas cores (degradê, aquarela, listras): a mesma cobertura do bolo, com um mapa de cor
    warmQueue.push(() => {
      const f = frostOf(0);
      if (f.mapped) return;
      const map = new THREE.CanvasTexture(document.createElement('canvas'));
      map.channel = 1;
      map.colorSpace = THREE.SRGBColorSpace;
      const mats = [f.side, f.top].map((mt) => {
        const copy = mt.clone();
        copy.map = map;
        return copy;
      });
      mats.forEach((mt) => warmByDrawing(mt, true));
      mats.forEach((mt) => mt.dispose());
      map.dispose();
    });
    // daqui em diante é o catálogo novo (dezenas de peças): uma de cada vez, com folga, para o giro não soluçar
    warmQueue.push(() => (warmGap = 200));
    PIPINGS.forEach((x) => !classicPipes.includes(x.id) && pipe(x.id));
    // bases de madeira, mármore, dourada e prateada
    warmQueue.push(() => {
      const group = new THREE.Group();
      const geo = new THREE.PlaneGeometry(0.01, 0.01);
      ['wood', 'plank', 'marble', 'silver', 'goldfoil'].forEach((name) => group.add(new THREE.Mesh(geo, standMat(name))));
      const done = () => geo.dispose();
      compileQuietly(group, done);
    });
    DECORS.forEach((x) => !classicDecor.includes(x.id) && decor(x.id));
    // escrita com bico e topo personalizado
    warmQueue.push(tryPart({ ...base, decor: { ...base.decor, items: [], opts: {}, message: 'Bolo', messageMode: 'bico', topper: { text: '', color: '#dcae52' } } }, (ctx) => buildAnyDecor('escrita', ctx)));
    warmQueue.push(tryPart({ ...base, decor: { ...base.decor, items: [], opts: {}, message: '', topper: { text: 'Bolo', color: '#dcae52' } } }, (ctx) => buildAnyDecor('toponome', ctx)));
    warmTimer = setTimeout(() => whenIdle(warmNext), 300);
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
  controls.addEventListener('change', () => {
    if (!selfMove) invalidate();
  });

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

  // qualquer toque ou tecla na tela conta como "tem gente aqui": o giro em descanso volta
  const onInput = () => {
    lastInput = performance.now() / 1000;
    wake();
  };
  lastInput = performance.now() / 1000;
  ['pointerdown', 'keydown', 'wheel'].forEach((type) => window.addEventListener(type, onInput, { passive: true, capture: true }));

  const onVisibility = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVisibility);

  const onLost = (ev) => {
    ev.preventDefault();
    lost = true;
    stage?.skip(); // r5-cena: nenhuma animação fica pela metade
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
    gpuQuery = null;
    gpuOpen = false;
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

  // bolo fora da tela: nada é desenhado até ele voltar
  const io =
    'IntersectionObserver' in window
      ? new IntersectionObserver((entries) => {
          offscreen = !entries[entries.length - 1].isIntersecting;
          if (offscreen) halt();
          else {
            lastFrame = 0;
            invalidate();
          }
        })
      : null;
  io?.observe(canvas);

  resize();
  start();

  // r5-decor: módulos de peças carregados sob demanda — quando um chega, as peças que esperavam por ele são
  // refeitas (a chave do plano muda; devolver false encerra a escuta depois que o bolo é descartado)
  // r5-tela: a inscrição é cancelada no dispose() — sem isso, cada motor encerrado ficava preso ao registro do
  // kit de peças (e, com ele, a tela inteira): 13 ouvintes e centenas de nós a mais a cada visita
  const offDecorReady = onDecorReady(() => {
    if (disposed) return false;
    if (config) setConfig(config);
    return true;
  });

  /* ───────── r5-cena: ateliê ─────────
     O que a cena (js/atelier/stage/index.js) recebe do motor, e a fachada `cake.atelier` do contrato. A cena é
     baixada sob demanda; até lá a fachada responde com valores neutros e guarda o que foi pedido.
     Tudo isto é montado só na primeira vez que alguém pede `cake.atelier`: sem o ateliê, o motor não gasta
     nem o tempo de preparar este trecho. */
  let loadStage = null;
  let atelierApi = null;
  function buildAtelier() {
    const emitAtelier = (type, detail) => {
      atelierSubs.get(type)?.forEach((fn) => {
        try {
          fn(detail);
        } catch (err) {
          console.error(`[ateliê] ouvinte de "${type}"`, err);
        }
      });
    };
    /** Gira o prato: o bolo, a base e a sombra do bolo no prato giram juntos em torno do eixo. */
    function setSpin(angle) {
      spinAngle = angle;
      cakeGroup.rotation.y = angle;
      standGroup.rotation.y = angle;
      plateShade.rotation.z = angle;
      dirty = true;
    }
    const stageCtx = {
      tier,
      reduceMotion,
      canvas,
      renderer,
      scene,
      camera,
      controls,
      lib,
      groups: { standGroup, cakeGroup, bodyGroup, cutGroup, dripGroup },
      lights: { hemi, key, fill, rim, candleLight },
      shadows: { floor, contact, plateShade },
      clipPlanes,
      mats: { frostOf, dripMat, cutDrip, crustMat, bandMat, crumbMat, cutFillMat, cutJamMat, fruitPieces, fillingOf },
      get config() {
        return config;
      },
      get m() {
        return m;
      },
      get layout() {
        return layout;
      },
      get stand() {
        return stand;
      },
      get wedge() {
        return wedge;
      },
      get now() {
        return now;
      },
      get cutaway() {
        return cutaway;
      },
      get backdrop() {
        return backdrop;
      },
      get size() {
        return size;
      },
      get viewName() {
        return cutaway ? 'inside' : viewName;
      },
      get pipingPart() {
        return pipingPart;
      },
      get spin() {
        return spinAngle;
      },
      get pending() {
        return jobs.length;
      },
      decorParts,
      coatBatches,
      named,
      assembly,
      onBuild(fn) {
        buildHooks.add(fn);
        return () => buildHooks.delete(fn);
      },
      emit: emitAtelier,
      invalidate,
      setSpin,
      /** drop = quanto o chão fica abaixo do pé da base · contact = raio da sombra de contato (0 = o de sempre). */
      setGround({ drop = 0, contact: contactR = 0, radius = 0, reframe = true } = {}) {
        const moved = Math.abs(ground.drop - drop) > 1e-4 || Math.abs(ground.radius - radius) > 1e-3;
        ground.drop = drop;
        ground.contact = contactR;
        ground.radius = radius;
        placeGround();
        if (moved && reframe && m && !focus) frame({ animate: !reduceMotion });
        dirty = true;
      },
      floorShadow(on) {
        floor.visible = on;
      },
      getSpherical,
      applySpherical(s) {
        applySpherical(s);
        selfMove = true;
        controls.update();
        selfMove = false;
      },
      computeFit: (angles, extra) => computeFit(size.w / size.h, angles, { ...insetsNow(), ...extra }),
      anglesOf,
      flyTo,
      spinCamera: spin,
      holdRotation,
      setCutaway,
      openWedge(span) {
        // abre (ou fecha) a fatia sem animação e sem mexer na câmera: quem anima é a cena
        tweens.delete('wedge');
        wedge.span = span;
        cutaway = span > 0.002;
        applyWedge();
      },
      WEDGE: { a: WEDGE_A, span: WEDGE_SPAN },
      /** Leva a câmera para a vista do corte (o que setCutaway(true) faz depois de abrir a fatia). */
      viewInside() {
        if (focus) return;
        const v = anglesOf('inside');
        const fit = computeFit(size.w / size.h, v, insetsNow());
        swayBase = v.az;
        swayT = 0;
        flyTo({ az: v.az, polar: v.polar, dist: fit.dist * 0.96, ty: fit.ty, tz: fit.tz }, 0.8);
      },
      refreshParts,
      disposePart,
      compileQuietly,
      displayColor,
      /** A pessoa (ou o giro automático) está mexendo na câmera agora? */
      get userActive() {
        return userActive;
      },
    };

    loadStage = function () {
      if (stageLoad) return stageLoad;
      stageLoad = import('../atelier/stage/index.js')
        .then((mod) => {
          if (disposed) return null;
          stage = mod.createStage(stageCtx);
          stage.setScene(atelierScene);
          stage.setBackdrop(backdrop, { instant: true });
          stage.setEnabled(atelierOn);
          invalidate();
          return stage;
        })
        .catch((err) => {
          console.warn('[ateliê] cena indisponível:', err?.message || err);
          return null;
        });
      return stageLoad;
    };
    /** A cena, quando chegar. Pedir aqui já a encomenda (o download espera o primeiro quadro do bolo). */
    function stageReady() {
      if (stage) return Promise.resolve(stage);
      if (stageLoad) return stageLoad;
      stageWanted = true;
      invalidate();
      return new Promise((resolve) => {
        const wait = () => {
          if (disposed) resolve(null);
          else if (stageLoad) stageLoad.then(resolve);
          else setTimeout(wait, 30);
        };
        wait();
      });
    }
    const viaStage = (fn, fallback = null) => stageReady().then((s) => (s ? fn(s) : fallback));

    const atelier = {
      get enabled() {
        return atelierOn;
      },
      /** Liga ou desliga a cozinha e as animações de preparo (false = "modo rápido": tudo como sempre foi). */
      setEnabled(on) {
        atelierOn = Boolean(on);
        if (stage) stage.setEnabled(atelierOn);
        else if (atelierOn) stageReady();
        invalidate();
      },
      /** 'bancada' (padrão) | 'vitrine' | 'festa'. */
      setScene(id) {
        atelierScene = id === 'vitrine' || id === 'festa' ? id : 'bancada';
        stage?.setScene(atelierScene);
        invalidate();
      },
      get scene() {
        return atelierScene;
      },
      /** 'cue' (marcas de som) · 'busy' (true/false: animação em curso). Devolve a função que cancela. */
      on(type, fn) {
        if (!atelierSubs.has(type)) atelierSubs.set(type, new Set());
        atelierSubs.get(type).add(fn);
        return () => atelierSubs.get(type)?.delete(fn);
      },
      /** Promessa que resolve quando a cena estiver carregada (true) ou não puder ser (false). */
      get ready() {
        return stageReady().then(Boolean);
      },
      get busy() {
        return Boolean(stage?.busy);
      },
      play: (name, opts) => viaStage((s) => s.play(name, opts), false),
      skip() {
        stage?.skip();
      },
      replay: (opts) => viaStage((s) => s.replay(opts), false),
      pick: (x, y) => (stage ? stage.pick(x, y) : (stageReady(), null)),
      ghost: (piece, hit) => (stage ? stage.ghost(piece, hit) : { ok: false, why: 'carregando' }),
      /** Toque na borda do bolo: a gota de calda mais próxima escorre de novo (só com calda). */
      dripAt: (hit) => (stage ? stage.dripAt(hit) : false),
      candles: {
        get lit() {
          return stage ? stage.candles.lit : true;
        },
        get count() {
          return decorParts.get('velas')?.flames.length || 0;
        },
        light: () => viaStage((s) => s.candles.light(), false),
        blow: (strength = 1) => viaStage((s) => s.candles.blow(strength), false),
      },
      spread: {
        begin: (part) => (stage ? stage.spread.begin(part) : { progress: 1, done: Promise.resolve(false) }),
        feed(deltaAngle) {
          stage?.spread.feed(deltaAngle);
        },
        cancel() {
          stage?.spread.cancel();
        },
      },
      reveal: (opts) => viaStage((s) => s.reveal(opts), false),
      capture: {
        get supported() {
          return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function';
        },
        video: (opts) => viaStage((s) => s.capture.video(opts), null).catch(() => null),
      },
    };
    return atelier;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (typeof offDecorReady === 'function') offDecorReady(); // r5-tela
    stop();
    clearTimeout(resumeTimer);
    clearTimeout(warmTimer);
    warmQueue.length = 0;
    jobs.length = 0;
    tweens.clear();
    // r5-cena: a cena solta o que é dela (cenário, ferramentas, partículas, gravação)
    stage?.dispose();
    stage = null;
    atelierSubs.clear();
    ro?.disconnect();
    io?.disconnect();
    window.removeEventListener('resize', resize);
    ['pointerdown', 'keydown', 'wheel'].forEach((type) => window.removeEventListener(type, onInput, { capture: true }));
    document.removeEventListener('visibilitychange', onVisibility);
    canvas.removeEventListener('keydown', onKey);
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    controls.dispose();
    disposePart(pipingPart);
    decorParts.forEach(disposePart);
    decorParts.clear();
    coatBatches.forEach((b) => b.mesh?.dispose());
    Object.values(rosetteGeos).forEach((g) => g.dispose());
    [standGroup, bodyGroup, cutGroup, dripGroup].forEach(disposeGroup);
    shadowPlane.dispose();
    plateShade.material.dispose();
    floor.material.dispose();
    contact.material.dispose();
    buildHooks.clear();
    [porcelain, gold, dripMat, cutDrip, bundtMat, ...Object.values(standMats), ...frostTiers.flatMap((f) => (f ? [f.side, f.top, f.cut, f.scrape, f.map, f.tmap, f.tnormal, f.marble, f.coat, f.topRustic, ...Object.values(f.topTex || {})] : [])), ...crustMats, ...crumbMats, ...bandMats, ...cutFillMats, ...jamMats, ...cutJamMats, fruitMat].forEach((mt) => mt?.dispose());
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
    /** As partes do bolo que está na tela, por nome (ver o cabeçalho deste arquivo). */
    parts: () => [...named.values()].map((p) => ({ ...p, objects: p.objects.slice() })),
    /** Avisa a cada parte (re)construída: fn({ name, kind, tier, index, objects }). Devolve a função que cancela. */
    onBuild(fn) {
      buildHooks.add(fn);
      return () => buildHooks.delete(fn);
    },
    assembly,
    setCutaway,
    setAutoRotate,
    setView,
    resetView,
    spin,
    holdRotation,
    focusPlaque,
    setBackdrop,
    setPaused,
    quiet,
    warmUp,
    quality,
    measure,
    snapshot,
    snapshotCanvas,
    thumbOf,
    playIntro,
    refreshText,
    resize,
    dispose,
    settle,
    /** r5-cena: a cozinha e as animações de preparo (contrato em js/atelier/README.md, §2). */
    get atelier() {
      return (atelierApi ||= buildAtelier());
    },
    get cutaway() {
      return cutaway;
    },
    /** Nível de qualidade em uso ('mobile' ou 'desktop'). */
    get tier() {
      return tier.name;
    },
    /** Só para testes: acesso ao renderizador (simular perda de contexto, medir desenho). */
    debug: {
      renderer,
      scene,
      camera,
      controls,
      lights: { hemi, key, fill, rim, candleLight },
      mats: { frostSide, frostTop, porcelain, gold, dripMat },
      floor,
      contact,
      invalidate,
      stats,
      gov,
      tier,
      get ratio() {
        return curRatio;
      },
      get pending() {
        return jobs.length;
      },
      /** r5-cena: a cena do ateliê, depois de carregada (bancada de testes e medições). */
      get stage() {
        return stage;
      },
      /** A configuração que está desenhada agora (para conferir que a tela mostra o bolo que é cobrado). */
      get config() {
        return config;
      },
      /**
       * Volumes ocupados por cada peça do bolo (para o teste de colisões): [{ id, volumes: [{ x, y, z, r }] }].
       * Usa part.volumes quando a peça declara os seus; senão, deriva dos lotes (posição + raio ocupado de cada
       * instância, com o centro meio raio acima do pé) e dos objetos avulsos.
       */
      volumes() {
        const of = (id, part) => {
          if (!part) return null;
          if (Array.isArray(part.volumes)) return { id, volumes: part.volumes.map((v) => ({ x: v.x, y: v.y, z: v.z, r: v.r, kind: v.kind || '' })) };
          const volumes = [];
          part.batches.forEach((b) => b.items.forEach((it) => volumes.push({ x: it.x, y: it.y + it.rad * 0.5, z: it.z, r: it.rad, kind: '' })));
          part.objects.forEach((o) => volumes.push({ x: o.object.position.x, y: o.object.position.y + o.rad * 0.5, z: o.object.position.z, r: o.rad, kind: 'objeto' }));
          return { id, volumes };
        };
        return [of('bico', pipingPart), ...[...decorParts.entries()].map(([id, part]) => of(id, part))].filter(Boolean);
      },
    },
  };
}
