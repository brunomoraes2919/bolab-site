// BOLAB — recursos de material do motor (r7-motor): o que dá cara de comida, pronto para qualquer peça usar.
//
//   import { subsurface, foodLook, FOOD } from './fx/materials.js';
//
//   subsurface(material, { color, wrap, back, power, shadow })
//       Espalhamento subsuperficial barato para MeshStandardMaterial / MeshPhysicalMaterial (um punhado de
//       instruções por luz, sem passe extra, sem textura):
//         wrap   a luz "dá a volta" no terminador — creme, massa, fruta e cera não têm a divisa seca de luz e
//                sombra que o gesso tem; a faixa de transição ganha a cor de `color` (o vermelho por baixo da
//                casca do morango, o amarelo da manteiga no creme);
//         back   luz de fundo: quando a luz está atrás da peça, um tanto atravessa (pétala, fatia de fruta,
//                gelatina, a cera perto da chama). power = quão concentrado é esse clarão;
//         shadow quanto da sombra projetada continua valendo para essa luz espalhada (0 = ignora a sombra).
//       Devolve o próprio material. Pode ser chamado de novo para mudar os números (não recompila).
//       Chamar com `false` desliga (wrap e back em zero, sem recompilar).
//
//   foodLook(tipo, nivel)   →  parâmetros físicos prontos para `new THREE.MeshPhysicalMaterial({ ... })`
//       tipos (FOOD): creme · ganache · calda · geleia · gelatina · fruta · casca · cera · acucar · vidro · chocolate
//       nivel = o nível de qualidade (o `tier` que toda peça recebe): no nível leve (physical: false) sai o que
//       custa caro (verniz, acetinado, transmissão) e a superfície fica um pouco mais lisa para compensar.
//       A chave `subsurface`, quando existe, é para passar a subsurface() — foodMaterial() faz tudo de uma vez.
//
//   foodMaterial(tipo, nivel, extra)   →  MeshPhysicalMaterial pronto (com subsurface aplicado)
//
// Custo, para decidir onde usar:
//   sheen (acetinado)      barato            cremes, pétalas, casca de pêssego
//   clearcoat (verniz)     barato/médio      calda, ganache, geleia, fruta úmida, glacê
//   subsurface()           barato            qualquer coisa macia ou translúcida
//   transmission/thickness CARO: o Three.js desenha a cena opaca inteira uma segunda vez. foodLook só o liga
//                          no computador (nivel.transmission) e para 'gelatina' e 'vidro'; nos demais níveis
//                          esses tipos caem para transparência comum + verniz + luz de fundo (subsurface back).
//
// O motor aplica subsurface() sozinho aos materiais da biblioteca de peças que têm entrada em ENGINE_SSS
// (creme de bico, frutas, pétalas, velas) — quem define um material novo pode pedir o seu pondo
// `subsurface: { ... }` no acabamento dele em looks.js → MATERIAL_LOOK (ou `subsurface: false` para recusar).
import * as THREE from 'three';

const PARS = /* glsl */ `
uniform vec4 bolabSss; // rgb = cor do espalhamento · a = wrap
uniform vec3 bolabSssBack; // força da luz de fundo · potência · quanto da sombra vale
vec3 bolabLight = vec3( 0.0 ); // a cor da luz antes da sombra projetada
void RE_Direct_Bolab( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	float w = bolabSss.a;
	vec3 light = mix( bolabLight, directLight.color, bolabSssBack.z );
	float ndl = dot( geometryNormal, directLight.direction );
	// o que a luz envolvida acrescenta à de Lambert (só depois do terminador e na faixa rasante)
	float wrapped = max( 0.0, saturate( ( ndl + w ) / ( ( 1.0 + w ) * ( 1.0 + w ) ) ) - saturate( ndl ) );
	// luz de fundo: a direção da luz, entortada pela normal, vista de frente
	vec3 through = normalize( directLight.direction + geometryNormal * 0.35 );
	float back = pow( saturate( dot( geometryViewDir, - through ) ), bolabSssBack.y ) * bolabSssBack.x;
	reflectedLight.directDiffuse += light * material.diffuseColor * bolabSss.rgb * ( wrapped + back ) * RECIPROCAL_PI;
}
#undef RE_Direct
#define RE_Direct RE_Direct_Bolab
`;

const tmp = new THREE.Color();
const SSS = new WeakMap(); // material → uniformes (fora de userData: uma cópia do material não os herda pela metade)

/** Ver o cabeçalho. */
export function subsurface(material, opts = {}) {
  if (!material || !(material.isMeshStandardMaterial || material.isMeshPhysicalMaterial)) return material;
  const off = opts === false;
  const o = off ? {} : opts;
  let u = SSS.get(material);
  if (!u) {
    if (off) return material;
    u = { bolabSss: { value: new THREE.Vector4(1, 1, 1, 0) }, bolabSssBack: { value: new THREE.Vector3(0, 3, 0.4) } };
    SSS.set(material, u);
    const prev = material.onBeforeCompile;
    material.onBeforeCompile = function (shader, renderer) {
      prev?.call(this, shader, renderer);
      shader.uniforms.bolabSss = u.bolabSss;
      shader.uniforms.bolabSssBack = u.bolabSssBack;
      let lights = THREE.ShaderChunk.lights_fragment_begin;
      ['getDirectionalLightInfo( directionalLight, directLight );', 'getPointLightInfo( pointLight, geometryPosition, directLight );', 'getSpotLightInfo( spotLight, geometryPosition, directLight );'].forEach((call) => {
        lights = lights.split(call).join(`${call}\n\t\tbolabLight = directLight.color;`);
      });
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>\n${PARS}`).replace('#include <lights_fragment_begin>', lights);
    };
    const prevKey = material.customProgramCacheKey;
    const base = prevKey === THREE.Material.prototype.customProgramCacheKey ? '' : prevKey.call(material);
    material.customProgramCacheKey = () => `${base}|bolab-sss`;
    material.needsUpdate = true;
    // (material.clone() não leva o recurso: quem copia chama subsurface() na cópia)
  }
  const cur = u.bolabSss.value;
  if (off) {
    cur.w = 0;
    u.bolabSssBack.value.x = 0;
    return material;
  }
  if (o.color !== undefined) {
    tmp.set(o.color);
    cur.set(tmp.r, tmp.g, tmp.b, cur.w);
  }
  if (o.wrap !== undefined) cur.w = o.wrap;
  if (o.back !== undefined) u.bolabSssBack.value.x = o.back;
  if (o.power !== undefined) u.bolabSssBack.value.y = o.power;
  if (o.shadow !== undefined) u.bolabSssBack.value.z = o.shadow;
  return material;
}

/** Receitas físicas por tipo de alimento (ver o cabeçalho). `subsurface` vai para subsurface(). */
export const FOOD = {
  // creme batido, buttercream, chantilly: fosco-acetinado, com a luz entrando um pouco
  creme: { roughness: 0.6, sheen: 0.35, sheenRoughness: 0.5, sheenColor: 0xffffff, subsurface: { color: '#ffe6cf', wrap: 0.45, back: 0.06, power: 3 } },
  // ganache e chocolate derretido: verniz liso sobre uma base escura
  ganache: { roughness: 0.26, clearcoat: 0.85, clearcoatRoughness: 0.09, envMapIntensity: 1.1 },
  // calda e glacê escorrido: mais brilho, um nada de luz atravessando nas pontas finas
  calda: { roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.07, envMapIntensity: 1.1, subsurface: { color: '#ffd9c0', wrap: 0.25, back: 0.12, power: 4 } },
  // geleia e coulis: brilho molhado, cor que acende contra a luz
  geleia: { roughness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.12, subsurface: { color: '#ff7a5c', wrap: 0.5, back: 0.5, power: 2.5, shadow: 0.2 } },
  // gelatina: de verdade só no computador (transmissão); nos outros níveis, translúcida "de mentira"
  gelatina: { roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, transmission: 0.85, thickness: 0.25, ior: 1.35, fallback: { transparent: true, opacity: 0.78 }, subsurface: { color: '#ffffff', wrap: 0.6, back: 0.7, power: 2, shadow: 0.1 } },
  // fruta úmida (morango, cereja, uva): casca com verniz, polpa que deixa a luz dar a volta
  fruta: { roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.18, subsurface: { color: '#ff6a4a', wrap: 0.4, back: 0.22, power: 3 } },
  // casca aveludada (pêssego, pétala, folha): acetinado + luz de fundo
  casca: { roughness: 0.62, sheen: 0.6, sheenRoughness: 0.45, subsurface: { color: '#ffd0b8', wrap: 0.4, back: 0.45, power: 2.2, shadow: 0.25 } },
  // cera de vela: lisa, leitosa, acende perto da chama
  cera: { roughness: 0.45, clearcoat: 0.25, clearcoatRoughness: 0.4, subsurface: { color: '#ffe2b8', wrap: 0.55, back: 0.5, power: 2, shadow: 0.2 } },
  // açúcar: fondant, pasta americana, confeito fosco
  acucar: { roughness: 0.58, sheen: 0.2, sheenRoughness: 0.6, subsurface: { color: '#fff0e2', wrap: 0.3, back: 0.04 } },
  // vidro e isomalte
  vidro: { roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.03, transmission: 1, thickness: 0.08, ior: 1.5, fallback: { transparent: true, opacity: 0.22, depthWrite: false } },
  // chocolate temperado (peças): brilho macio, não espelho
  chocolate: { roughness: 0.36, clearcoat: 0.45, clearcoatRoughness: 0.25 },
};

/** Parâmetros de `tipo` para o nível `nivel` (o `tier` do motor). */
export function foodLook(tipo, nivel = {}) {
  const src = FOOD[tipo] || FOOD.creme;
  const { fallback, ...look } = src;
  const physical = nivel.physical !== false;
  if (!physical) {
    // nível leve: sem verniz nem acetinado — a superfície fica mais lisa para o brilho não sumir de todo
    if (look.clearcoat > 0.2) look.roughness = Math.max(0.08, look.roughness * (1 - 0.45 * look.clearcoat));
    delete look.clearcoat;
    delete look.clearcoatRoughness;
    delete look.sheen;
    delete look.sheenRoughness;
    delete look.sheenColor;
    delete look.subsurface;
  }
  if (look.transmission && !(physical && nivel.transmission)) {
    delete look.transmission;
    delete look.thickness;
    delete look.ior;
    Object.assign(look, fallback || {});
  }
  return look;
}

/** Um MeshPhysicalMaterial de `tipo`, já com o espalhamento aplicado. `extra` = cor, mapas etc. */
export function foodMaterial(tipo, nivel = {}, extra = {}) {
  const { subsurface: sss, ...look } = foodLook(tipo, nivel);
  const mat = new THREE.MeshPhysicalMaterial({ ...look, ...extra });
  if (sss) subsurface(mat, sss);
  return mat;
}

/**
 * O que o motor aplica por conta própria aos materiais da biblioteca de peças (nome → espalhamento), quando o
 * acabamento da peça (looks.js) não diz outra coisa. Números contidos de propósito: é um acabamento, não um efeito.
 */
export const ENGINE_SSS = {
  piping: { color: '#ffe3cc', wrap: 0.42, back: 0.05, power: 3, shadow: 0.45 },
  'pk-cream': { color: '#ffe3cc', wrap: 0.42, back: 0.05, power: 3, shadow: 0.45 },
  strawberry: { color: '#ff5a3c', wrap: 0.38, back: 0.2, power: 3, shadow: 0.4 },
  raspberry: { color: '#ff4a5a', wrap: 0.4, back: 0.25, power: 3, shadow: 0.4 },
  blueberry: { color: '#7a6cff', wrap: 0.25, back: 0.05, power: 3, shadow: 0.5 },
  'pk-fruit': { color: '#ff6a4a', wrap: 0.38, back: 0.2, power: 3, shadow: 0.4 },
  'pf-grape': { color: '#c8ff9a', wrap: 0.4, back: 0.3, power: 2.5, shadow: 0.35 },
  petal: { color: '#ffd6c8', wrap: 0.4, back: 0.4, power: 2.2, shadow: 0.3 },
  leaf: { color: '#d8ff9a', wrap: 0.3, back: 0.45, power: 2.2, shadow: 0.3 },
  candle: { color: '#ffe2b8', wrap: 0.5, back: 0.35, power: 2, shadow: 0.3 },
};
