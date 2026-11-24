// BOLAB — o estúdio fotográfico que o bolo reflete (r7-motor). Mapa de ambiente próprio, em alta faixa
// dinâmica, desenhado por código (nada baixado): uma cúpula neutra + caixas de luz com QUEDA SUAVE (o centro
// mais quente, a borda esfumada, cantos arredondados — como o tecido difusor de um softbox de verdade) + dois
// cartões pretos ("bandeiras") que dão contraste ao que brilha: é o escuro ao lado do claro que faz ganache,
// calda e ouro parecerem líquidos e polidos, e não plástico.
//
//   const env = buildStudio(renderer, { size });   →  { texture, dispose() }
//
// Tudo no referencial de quem olha (a câmera fica em +Z; esquerda = −X): o motor gira a consulta ao mapa pelo
// azimute da câmera (engine.js → prepareShaders), então o estúdio fica parado em relação a quem olha e o bolo
// gira dentro dele como num prato giratório. Valores acima de 1 são luz de verdade.
//
// size = lado de cada face do cubo de onde o mapa é filtrado: 256 no celular (6 MB de mapa), 512 no computador
// (reflexos mais definidos nos vernizes lisos).
import * as THREE from 'three';

const BOX_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;
// corpo: 1 por dentro, esfumando até a borda (superelipse = cantos arredondados) · hot: queda do centro à borda
const BOX_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uSoft;
uniform float uHot;
varying vec2 vUv;
void main() {
	vec2 p = abs( vUv - 0.5 ) * 2.0;
	float d = pow( pow( p.x, 4.0 ) + pow( p.y, 4.0 ), 0.25 );
	float body = 1.0 - smoothstep( 1.0 - uSoft, 1.0, d );
	float hot = mix( 1.0, uHot, smoothstep( 0.0, 1.0, d * d ) );
	gl_FragColor = vec4( uColor * body * hot, body );
}`;

/** A cena do estúdio (liberada por quem chama depois de filtrada). */
export function studioScene() {
  const scene = new THREE.Scene();
  // cúpula: degradê do teto ao chão, pintado nos vértices
  const dome = new THREE.SphereGeometry(30, 48, 24);
  const pos = dome.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const top = [0.21, 0.207, 0.204];
  const mid = [0.275, 0.27, 0.265];
  const low = [0.14, 0.126, 0.12]; // o chão devolve uma luz quente e fraca
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 30;
    const a = y >= 0 ? mid : low;
    const b = y >= 0 ? top : mid;
    const k = y >= 0 ? Math.pow(y, 0.6) : 1 + Math.max(-1, y * 2.2);
    for (let c = 0; c < 3; c++) col[i * 3 + c] = a[c] + (b[c] - a[c]) * k;
  }
  dome.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));

  const plane = new THREE.PlaneGeometry(1, 1);
  /**
   * Caixa de luz. power = luz no centro · soft = quanto da borda é esfumado (0 a 1) · hot = quanto sobra de luz
   * na borda em relação ao centro. A luz soma-se à cúpula.
   */
  const box = (hex, power, x, y, z, w, h, { soft = 0.45, hot = 0.5 } = {}) => {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(hex).multiplyScalar(power) }, uSoft: { value: soft }, uHot: { value: hot } },
      vertexShader: BOX_VERT,
      fragmentShader: BOX_FRAG,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    const light = new THREE.Mesh(plane, mat);
    light.position.set(x, y, z);
    light.scale.set(w, h, 1);
    light.lookAt(0, 0.4, 0);
    scene.add(light);
  };
  /** Bandeira: cartão preto fosco, de borda esfumada, que tira luz de um lado (contraste nos brilhos). */
  const flag = (x, y, z, w, h, depth = 0.9) => {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0x000000) }, uSoft: { value: 0.85 }, uHot: { value: 1 } },
      vertexShader: BOX_VERT,
      fragmentShader: BOX_FRAG,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.ZeroFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    mat.fragmentShader = BOX_FRAG.replace('gl_FragColor = vec4( uColor * body * hot, body );', `gl_FragColor = vec4( 0.0, 0.0, 0.0, body * ${depth.toFixed(2)} );`);
    const card = new THREE.Mesh(plane, mat);
    card.position.set(x, y, z);
    card.scale.set(w, h, 1);
    card.lookAt(0, 0.4, 0);
    card.renderOrder = -1; // antes das luzes: a bandeira escurece a cúpula, não as caixas
    scene.add(card);
  };
  // (as potências compensam a queda: cada caixa entrega ao bolo a mesma luz total das caixas chapadas de antes)
  box(0xfff8f0, 22, -2.75, 4.75, 2.5, 1.9, 1.4, { soft: 0.4, hot: 0.45 }); // principal: alto, à esquerda, um pouco à frente
  box(0xffffff, 4.6, 0.5, 7, -0.8, 3.4, 3.4, { soft: 0.5, hot: 0.5 }); // teto: enche o topo do bolo e as curvas de cima
  box(0xffeef0, 1.4, 6, 1.4, 1.6, 4.4, 4.6, { soft: 0.6, hot: 0.55 }); // preenchimento: grande e fraco, à direita
  box(0xffffff, 13, 3.3, 2.6, -5.4, 0.9, 5.4, { soft: 0.8, hot: 0.35 }); // contraluz da direita (a mais forte)
  box(0xfff6ee, 8, -4.6, 2.2, -4.6, 0.8, 4.8, { soft: 0.8, hot: 0.35 }); // contraluz da esquerda
  box(0xffffff, 0.75, 0, 1.2, 7.5, 7.4, 3.6, { soft: 0.6, hot: 0.6 }); // parede clara atrás de quem olha: nada brilhante reflete "preto"
  // bandeira: uma faixa escura baixa à esquerda, entre a frente e a contraluz (do lado da luz principal, onde o
  // brilho precisa de um escuro ao lado). À direita não há: ali ela riscava uma divisa dura na lateral do bolo.
  flag(-6.5, 0.6, -0.6, 3.2, 3.4, 0.4);
  return scene;
}

/** Monta o mapa de ambiente filtrado (PMREM) do estúdio. */
export function buildStudio(renderer, { size = 256 } = {}) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const studio = studioScene();
  let target;
  let cube = null;
  try {
    if (size > 256 && renderer.capabilities.isWebGL2) {
      // cubo maior, filtrado a partir dele (o caminho de cena do Three.js é fixo em 256)
      cube = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
      const cam = new THREE.CubeCamera(0.1, 100, cube);
      const keep = renderer.toneMapping;
      renderer.toneMapping = THREE.NoToneMapping;
      cam.update(renderer, studio);
      renderer.toneMapping = keep;
      target = pmrem.fromCubemap(cube.texture);
    } else target = pmrem.fromScene(studio, 0.012);
  } finally {
    cube?.dispose();
    const seen = new Set();
    studio.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry)) {
        seen.add(o.geometry);
        o.geometry.dispose();
      }
      o.material?.dispose();
    });
  }
  return {
    texture: target.texture,
    dispose() {
      target.dispose();
      pmrem.dispose();
    },
  };
}
