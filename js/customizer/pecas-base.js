// BOLAB — base dos módulos de peças carregados sob demanda (pecas-*.js).
//
// Como uma peça nova entra no bolo:
//   1. kit-<grupo>.js declara o que ela ocupa e como pode ser arrumada (ver kit.js) — só dados;
//   2. pecas-<grupo>.js exporta BUILDERS = { id: (ctx, part) => … } com a malha de verdade;
//   3. quem decide o lugar, o tamanho e a quantidade é o distribuidor (occupancy.js): o construtor só desenha
//      as peças do plano — ctx.layout.plan[id].pieces — e declara os volumes delas (part.volumes).
// drawKit faz os passos repetidos: lê o plano, monta os lotes de instâncias (um por malha / material), orienta
// cada peça pela mesma base que o distribuidor usou para os volumes, põe o palito das peças espetadas e a
// sombra de contato do celular.
//
// Convenções das malhas (1 = 10 cm, escala 1 = tamanho de catálogo):
//   apoiada no topo  origem no ponto de apoio, +y para cima, +z a frente
//   no palito        origem onde o palito entra na peça, +y ao longo do palito, +z a frente (olha para quem vê)
//   decalque lateral (side.mode 'face')  origem no meio do desenho, +z sai do bolo, +y sobe
//   colada pelo pé   (side.mode 'base')  a mesma malha do topo: +y sai do bolo
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, hashString, makeCanvas, texture } from './textures.js';
import { Batch, frameQuat, surface, paint, plain, segs, smooth, gomo, addVol, groundBlob, scatter, quantityOf, roundedRectShape } from './decor.js';
import { rgbOf, mix, shift, shown, lightOf, saturOf, tintsOf, harmonyOf, dye, piece, lathe, tube, trail, onDome, planarUV, matte, paper, fondant, chocolate, candy, sugar, stickMat, goldLeaf, hash2, pick } from './decor2.js';
import { KIT, kitBasis } from './kit.js';

const TAU = Math.PI * 2;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _vx = new THREE.Vector3();
const _vy = new THREE.Vector3();
const _vz = new THREE.Vector3();

/** Base ortonormal [X, Y, Z] (9 números, de kit.js) → quaternion. */
export function basisQuat(B, out = new THREE.Quaternion()) {
  _m.makeBasis(_vx.set(B[0], B[1], B[2]), _vy.set(B[3], B[4], B[5]), _vz.set(B[6], B[7], B[8]));
  return out.setFromRotationMatrix(_m);
}

/* ───────── Materiais ───────── */

/** Metal polido (bola espelhada, aliança, coroa): reflete o ambiente. A cor vem por instância ou por vértice. */
export const metal = (lib) => lib.custom('pk-metal', () => new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.14, vertexColors: true }));
/** Metal acetinado com granulado fino (pó metálico comestível sobre pasta de goma, papel glitter). */
export const glitter = (lib) => lib.custom('pk-glitter', () => new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.78, roughness: 0.38, normalMap: lib.tex.glitterNormal(), normalScale: new THREE.Vector2(0.8, 0.8), vertexColors: true, side: THREE.DoubleSide }));
/** Casca de fruta fresca: lisa, com brilho úmido. */
export const fruitSkin = (lib) => lib.custom('pk-fruit', () => lib.physical({ color: 0xffffff, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.25, vertexColors: true }));
/** Folha, pétala natural, papel fosco de duas faces. */
export const leafy = (lib) => lib.custom('pk-leafy', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.66, side: THREE.DoubleSide, vertexColors: true }));
/** Creme de bico (o mesmo aspecto dos bicos da borda), com cor por instância. */
export const cream = (lib) => lib.custom('pk-cream', () => lib.physical({ color: 0xffffff, roughness: 0.62, sheen: 0.4, sheenRoughness: 0.55, sheenColor: 0xffffff, vertexColors: true }));

/**
 * Material com desenho pintado em canvas (recorte de papel, fatia de fruta, estampa). draw(g, size) pinta;
 * alpha = recorta pelo canal alfa (alphaTest) — as sombras acompanham o recorte.
 */
export function painted(lib, key, draw, { size = 256, alpha = false, rough = 0.6, metalness = 0, double = true, emissive = 0 } = {}) {
  return lib.custom(`pk-paint-${key}`, () => {
    const c = makeCanvas(size, size);
    const g = c.getContext('2d');
    draw(g, size);
    const map = texture(c, { srgb: true, repeat: false });
    const mat = new THREE.MeshStandardMaterial({ map, roughness: rough, metalness, side: double ? THREE.DoubleSide : THREE.FrontSide, alphaTest: alpha ? 0.5 : 0, vertexColors: false });
    if (emissive) {
      mat.emissive = new THREE.Color(0xffffff);
      mat.emissiveMap = map;
      mat.emissiveIntensity = emissive;
    }
    // a textura é só deste material: vai embora junto com ele
    mat.addEventListener('dispose', () => map.dispose());
    return mat;
  });
}

/* ───────── Geometria ───────── */

/** Chapa recortada (papel, acrílico, pasta aberta): contorno 2D (THREE.Shape ou [[x, y]…]) com espessura. Frente em +z. */
export function cutout(shape, depth = 0.012, { bevel = 0, curve = 10 } = {}) {
  const sh = shape.isShape ? shape : new THREE.Shape(shape.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: curve, steps: 1 });
  geo.translate(0, 0, -depth / 2);
  const out = geo.toNonIndexed();
  out.deleteAttribute('uv');
  out.computeVertexNormals();
  geo.dispose();
  return paint(out, 1, 1, 1);
}

/** Placa plana com UV de 0 a 1 (para um material pintado): largura w, altura h, centrada, frente em +z. */
export function card(w, h, { y0 = -h / 2 } = {}) {
  const g = new THREE.PlaneGeometry(w, h);
  g.translate(0, y0 + h / 2, 0);
  return g;
}

/** Esfera de poucos lados (as contas dos cachos, bolinhas): já com cor de vértice branca. */
export function ball(r, D = 1, { squash = 1 } = {}) {
  const g = new THREE.SphereGeometry(r, D < 1 ? 8 : 14, D < 1 ? 6 : 10);
  if (squash !== 1) g.scale(1, squash, 1);
  return paint(g, 1, 1, 1);
}

/** Tinge por faixas de altura: stops = [[y, '#hex']…] (interpola entre elas). Para peças fundidas com cor de vértice. */
export function gradeY(geo, stops) {
  const pos = geo.attributes.position;
  if (!geo.attributes.color) paint(geo, 1, 1, 1);
  const col = geo.attributes.color;
  const cs = stops.map(([y, hex]) => [y, new THREE.Color(hex)]);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    let k = 0;
    while (k < cs.length - 2 && y > cs[k + 1][0]) k++;
    const [y0, c0] = cs[k];
    const [y1, c1] = cs[Math.min(cs.length - 1, k + 1)];
    const t = y1 === y0 ? 0 : Math.max(0, Math.min(1, (y - y0) / (y1 - y0)));
    c.copy(c0).lerp(c1, t);
    col.setXYZ(i, col.getX(i) * c.r, col.getY(i) * c.g, col.getZ(i) * c.b);
  }
  return geo;
}

/* ───────── Desenho das peças do kit ───────── */

/**
 * Desenha as peças de uma decoração do kit conforme o plano.
 *   variants  uma entrada por variante de KIT[id].vars (mesma ordem). Cada uma é { key, make, mat, tint, cast,
 *             sink, scale } ou { parts: [ … ] } quando a peça tem mais de um material:
 *               key   nome da geometria na biblioteca (única no módulo)
 *               geo   (lib) => geometria que já existe na biblioteca (no lugar de key + make)
 *               make  (D) => BufferGeometry  (D = nível de detalhe: 1 computador · 0,5 celular)
 *               mat   (lib, ctx) => material
 *               tint  (peça, i, sorteio, corEscolhida) => '#hex' ou null (cor por instância; multiplica a do vértice)
 *               sink  quanto a peça afunda na cobertura (padrão 0,002)
 *               scale (peça, sorteio) => [sx, sy, sz] (multiplica a escala da peça; padrão uniforme)
 *   opts.each (peça, i, sorteio, quat) → chamado para cada peça (peças avulsas extras, luzes…)
 * Devolve o plano da decoração (ou null, se ela não ficou no bolo).
 */
export function drawKit(ctx, part, id, variants, opts = {}) {
  const { m, lib, layout } = ctx;
  part.volumes = [];
  const pl = layout.plan?.[id];
  if (!pl || !pl.pieces.length) return null;
  const K = KIT[id];
  const r = rng(hashString(`${id}${m.shape}${m.R}${pl.zone}`));
  const color = layout.opt(id).color;
  const small = ctx.tier?.smallCastShadow !== false;
  const lots = variants.map((v) => (v.parts || [v]).map((pt) => ({ pt, batch: new Batch(pt.geo ? pt.geo(lib) : lib.shape(pt.key, () => pt.make(lib.detail)), pt.mat(lib, ctx), { cast: pt.cast ?? small, receive: Boolean(pt.receive) }) })));
  const sticks = new Batch(lib.geo.stick(), stickMat(lib));
  let nSticks = 0;
  pl.pieces.forEach((p, i) => {
    if (p.t !== 'k') return;
    const B = kitBasis(p);
    basisQuat(B, _q);
    const stick = p.pose === 'stick';
    const x = stick ? p.px : p.x;
    const y = stick ? p.py : p.y;
    const z = stick ? p.pz : p.z;
    const vi = Math.min(p.v ?? 0, lots.length - 1);
    const rad = (K?.vars[p.v]?.r || 0.1) * p.s;
    lots[vi].forEach(({ pt, batch }) => {
      const k = pt.scale ? pt.scale(p, r) : null;
      const sc = k ? [p.s * k[0], p.s * k[1], p.s * k[2]] : p.s;
      batch.add(x, y - (p.pose === 'top' ? pt.sink ?? 0.002 : 0), z, _q, sc, pt.tint ? pt.tint(p, i, r, color) : null, rad);
    });
    if (stick && opts.stick !== false) {
      // palito: do bolo (um pouco enterrado) até a peça, no mesmo eixo dela
      const w = (K?.stick?.r || 0.014) / 0.0095;
      sticks.add(p.x - B[3] * 0.07, p.y - B[4] * 0.07, p.z - B[5] * 0.07, _q, [w, p.h + 0.07 + (K?.stick?.into || 0) * p.s, w], null, 0.03);
      nSticks++;
    }
    addVol(part, p.vol);
    if (opts.each) opts.each(p, i, r, _q);
  });
  lots.flat().forEach(({ batch }) => part.add(batch, m));
  if (nSticks) part.add(sticks, m);
  if (pl.zone === 'center' && pl.group && pl.blob) groundBlob(ctx, part, pl.group.x, pl.group.z, pl.blob);
  return pl;
}

/**
 * Confeito de cobertura do kit (K.coat): cai onde sobrou lugar no topo e na lateral, na hora de desenhar.
 *   look = { key, make, mat, tints: (cor) => ['#hex'…] }
 */
export function drawCoat(ctx, part, id, look) {
  const { lib, layout } = ctx;
  const C = KIT[id].coat;
  scatter(ctx, part, {
    geometry: lib.shape(look.key, () => look.make(lib.detail)),
    material: look.mat(lib, ctx),
    tints: look.tints(layout.opt(id).color),
    perArea: C.perArea,
    perSide: C.perSide ?? 0,
    flat: C.flat !== false,
    sideBand: C.sideBand ?? 1.6,
    seed: id,
    id,
    rad: C.rad ?? 0.026,
    lift: C.lift ?? 0,
  });
}

export { THREE, mergeGeometries, TAU, rng, hashString, makeCanvas, texture };
export { Batch, frameQuat, surface, paint, plain, segs, smooth, gomo, addVol, groundBlob, scatter, quantityOf, roundedRectShape };
export { rgbOf, mix, shift, shown, lightOf, saturOf, tintsOf, harmonyOf, dye, piece, lathe, tube, trail, onDome, planarUV, matte, paper, fondant, chocolate, candy, sugar, stickMat, goldLeaf, hash2, pick };
export { KIT, kitBasis };
