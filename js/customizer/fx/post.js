// BOLAB — pós-processamento do personalizador (r7-motor). Passes próprios, sem biblioteca: alvos de render do
// Three.js (WebGLRenderTarget) + um triângulo de tela cheia. Só existe com WebGL2.
//
//   const post = createPost(renderer, nivel.post);        // null se o aparelho não tiver WebGL2
//   post.render(scene, camera, draw)                      draw(scene, camera) = o renderer.render original
//   post.setQuality({ ao, bloom, … })                     troca o que está ligado (o regulador e o rebaixamento usam)
//   post.release()  (contexto perdido)  ·  post.dispose()  ·  post.info()  (o que está ligado e a memória dos alvos)
//
// O caminho de um quadro:
//
//   1. CENA  → alvo com antisserrilhado (MSAA 4×) e textura de profundidade. O alvo se passa pela tela: os
//      materiais gravam nele exatamente o que gravariam no <canvas> (curva de tom e sRGB já aplicados, fundo
//      transparente, mesma mistura das transparências) — com o pós desligado, o quadro sai idêntico ao de antes
//      e nenhum programa de material é compilado de novo. (O Three.js r160 só aplica a curva de tom fora da
//      tela nos alvos de realidade virtual: o alvo leva essa marca, isXRRenderTarget — é o único efeito dela.)
//   2. OCLUSÃO (meia resolução): para cada ponto, olha a profundidade em volta e mede o quanto a vizinhança
//      tapa a luz do ambiente (encontro bolo × prato, entre andares, debaixo de pitangas e peças). Normal
//      reconstruída da profundidade; amostras em espiral, giradas por um ruído fixo na tela (nada pisca ao
//      girar); depois um desfoque separável que respeita as bordas (bilateral, pela profundidade).
//   3. BRILHO (um quarto da resolução, em cascata): só o que passa do branco — chama, ouro, o brilho do verniz.
//      A curva de tom do motor é reversível: o passe recupera dela a luz original de cada ponto e só deixa
//      passar o que era mais forte que um branco bem iluminado. O creme branco não "vaza" luz.
//   4. COMPOSIÇÃO → <canvas>: cena × oclusão (com tom quente, e poupando os brilhos) + brilho, vinheta (opcional)
//      e um pontilhado de ±½ nível que desfaz as faixas dos degradês. O alfa do fundo é preservado.
//
// Profundidade de campo: não há — decisão de projeto, não foi implementada nem testada. O bolo ocupa quase toda
// a profundidade da cena e o fundo simples é CSS (não há o que desfocar atrás); desfocar o próprio bolo tiraria
// nitidez do produto, que é o que a pessoa está escolhendo. Vinheta: o passe existe (vignette > 0) mas nenhuma
// receita a liga — sobre o fundo CSS ela escureceria só a tela 3D, não a página. Grão: não há; só o pontilhado.
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4( position.xy, 0.0, 1.0 );
}`;

const COMMON = /* glsl */ `
vec3 toLinear( vec3 c ) {
	return mix( c / 12.92, pow( ( c + 0.055 ) / 1.055, vec3( 2.4 ) ), step( 0.04045, c ) );
}
vec3 toSrgb( vec3 c ) {
	c = max( c, 0.0 );
	return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, c ) );
}
vec2 packDepth( float z ) {
	z = clamp( z, 0.0, 0.99999 ) * 255.0;
	float hi = floor( z );
	return vec2( hi / 255.0, z - hi );
}
float unpackDepth( vec2 p ) { return ( p.x * 255.0 + p.y ) / 255.0; }
`;

/* ───────── 2. oclusão de ambiente ───────── */
const AO_FRAG = /* glsl */ `
uniform highp sampler2D tDepth;
uniform vec2 uDepthTexel; // 1 ponto da profundidade (resolução cheia)
uniform vec2 uInvProj; // 1 / P00, 1 / P11
uniform vec2 uProj; // P00, P11
uniform vec2 uNearFar;
uniform float uRadius; // raio no mundo
uniform float uIntensity;
uniform float uBias;
uniform float uMaxUv; // raio máximo na tela (fração da altura)
uniform vec2 uWide; // segunda escala (larga): raio no mundo · força
varying vec2 vUv;
${COMMON}
float viewZ( float d ) {
	return ( uNearFar.x * uNearFar.y ) / ( ( uNearFar.y - uNearFar.x ) * d - uNearFar.y );
}
vec3 viewPos( vec2 uv, float d ) {
	float z = viewZ( d );
	return vec3( ( uv * 2.0 - 1.0 ) * uInvProj * -z, z );
}
vec3 posAt( vec2 uv ) {
	return viewPos( uv, texture2D( tDepth, uv ).x );
}
// ruído de gradiente intercalado (Jimenez): fixo na tela, sem padrão visível depois do desfoque
float ign( vec2 p ) {
	return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) );
}
void main() {
	// (o centro de um ponto da meia resolução cai na divisa de quatro pontos da profundidade: escolhe um, sempre o mesmo)
	vec2 uvc = ( floor( vUv / uDepthTexel ) + 0.5 ) * uDepthTexel;
	float d = texture2D( tDepth, uvc ).x;
	if ( d >= 0.99999 ) {
		gl_FragColor = vec4( 1.0, 1.0, 1.0, 1.0 );
		return;
	}
	vec3 P = viewPos( uvc, d );
	// normal: das duas diferenças de cada eixo, a menor (não atravessa a borda de um objeto)
	vec3 Pl = posAt( uvc - vec2( uDepthTexel.x, 0.0 ) );
	vec3 Pr = posAt( uvc + vec2( uDepthTexel.x, 0.0 ) );
	vec3 Pb = posAt( uvc - vec2( 0.0, uDepthTexel.y ) );
	vec3 Pt = posAt( uvc + vec2( 0.0, uDepthTexel.y ) );
	vec3 dx = abs( Pl.z - P.z ) < abs( Pr.z - P.z ) ? P - Pl : Pr - P;
	vec3 dy = abs( Pb.z - P.z ) < abs( Pt.z - P.z ) ? P - Pb : Pt - P;
	vec3 N = normalize( cross( dx, dy ) );

	// raio na tela (fração da altura). De perto ele é limitado — e o raio no mundo encolhe junto, para a
	// oclusão não mudar de força com o zoom
	float perUnit = uProj.y * 0.5 / -P.z;
	float rUv = min( uMaxUv, uRadius * perUnit );
	float radius = rUv / perUnit;
	vec2 scale = vec2( uProj.x / uProj.y, 1.0 ) * rUv;
	float phi = ign( gl_FragCoord.xy ) * 6.2831853;
	float jit = ign( gl_FragCoord.yx + 31.7 ); // a distância de cada amostra também varia de ponto para ponto
	float r2 = radius * radius;
	float bias = uBias * radius / uRadius;
	float sum = 0.0;
	for ( int i = 0; i < TAPS; i ++ ) {
		float a = ( float( i ) + 0.15 + 0.7 * jit ) / float( TAPS );
		float ang = a * ( TURNS * 6.2831853 ) + phi;
		vec2 suv = uvc + vec2( cos( ang ), sin( ang ) ) * a * scale;
		suv = ( floor( suv / uDepthTexel ) + 0.5 ) * uDepthTexel;
		vec3 v = posAt( suv ) - P;
		float vv = dot( v, v );
		float vn = dot( v, N );
		float f = max( r2 - vv, 0.0 );
		sum += f * f * f * max( ( vn - bias ) / ( vv + 0.0016 * r2 ), 0.0 );
	}
	float ao = max( 0.0, 1.0 - sum * uIntensity * 5.0 / ( r2 * r2 * r2 * float( TAPS ) ) );
	#ifdef WIDE_TAPS
		// escala larga: a penumbra ampla debaixo do prato, no degrau entre andares, ao pé do bolo
		float rUvW = min( uMaxUv * 2.4, uWide.x * perUnit );
		float radiusW = rUvW / perUnit;
		vec2 scaleW = vec2( uProj.x / uProj.y, 1.0 ) * rUvW;
		float r2w = radiusW * radiusW;
		float biasW = uBias * 2.0 * radiusW / uWide.x;
		float sumW = 0.0;
		for ( int i = 0; i < WIDE_TAPS; i ++ ) {
			float a = ( float( i ) + 0.85 - 0.7 * jit ) / float( WIDE_TAPS );
			float ang = a * ( WIDE_TURNS * 6.2831853 ) + phi * 1.618 + 2.4;
			vec2 suv = uvc + vec2( cos( ang ), sin( ang ) ) * a * scaleW;
			suv = ( floor( suv / uDepthTexel ) + 0.5 ) * uDepthTexel;
			vec3 v = posAt( suv ) - P;
			float vv = dot( v, v );
			float f = max( r2w - vv, 0.0 );
			sumW += f * f * f * max( ( dot( v, N ) - biasW ) / ( vv + 0.0016 * r2w ), 0.0 );
		}
		ao *= max( 0.0, 1.0 - sumW * uWide.y * 5.0 / ( r2w * r2w * r2w * float( WIDE_TAPS ) ) );
	#endif
	gl_FragColor = vec4( ao, packDepth( -P.z / uNearFar.y ), 1.0 );
}`;

/* desfoque separável que respeita as bordas: pesa cada vizinho pela diferença de profundidade */
const BLUR_FRAG = /* glsl */ `
uniform sampler2D tAo;
uniform vec2 uDir; // um ponto do alvo, na direção do passe
uniform float uFar;
uniform float uTol; // diferença de profundidade (mundo) que ainda conta como a mesma superfície
varying vec2 vUv;
${COMMON}
void main() {
	vec4 c = texture2D( tAo, vUv );
	float zc = unpackDepth( c.gb );
	if ( zc >= 0.9999 ) {
		gl_FragColor = c;
		return;
	}
	float sum = c.r;
	float wsum = 1.0;
	for ( int i = 1; i <= BLUR_R; i ++ ) {
		float fi = float( i );
		float g = exp( -fi * fi / ( 2.0 * BLUR_S * BLUR_S ) );
		float tol = uTol * ( 0.6 + fi );
		for ( int s = -1; s <= 1; s += 2 ) {
			vec4 t = texture2D( tAo, vUv + uDir * ( fi * float( s ) ) );
			float w = g * clamp( 1.0 - abs( unpackDepth( t.gb ) - zc ) * uFar / tol, 0.0, 1.0 );
			sum += t.r * w;
			wsum += w;
		}
	}
	gl_FragColor = vec4( sum / wsum, c.gb, 1.0 );
}`;

/* ───────── 3. brilho ───────── */
// Filtro de entrada: média de 5 amostras (cada uma já é a média de 2×2 pontos), pesada para um ponto muito
// forte e sozinho não dominar (é o que faria o brilho de uma pérola dourada piscar ao girar).
const BRIGHT_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uTexel; // um ponto da cena
uniform vec2 uKnee; // luz original a partir da qual começa a brilhar · e onde chega ao máximo
varying vec2 vUv;
${COMMON}
// desfaz a curva de tom do motor (PBR Neutral): do valor na tela para a luz que chegou
float sceneLight( float peak ) {
	const float s = 0.76;
	const float d = 0.24;
	return peak < s ? peak : d * d / max( 1.0 - peak, 0.0035 ) - d + s;
}
vec4 tap( vec2 uv ) {
	vec4 c = texture2D( tScene, uv );
	vec3 lin = toLinear( c.rgb );
	float peak = max( lin.r, max( lin.g, lin.b ) );
	float k = smoothstep( uKnee.x, uKnee.y, sceneLight( peak ) );
	return vec4( lin * k, 1.0 / ( 1.0 + peak * k * 4.0 ) );
}
void main() {
	vec4 a = tap( vUv );
	vec4 b = tap( vUv + uTexel * vec2( -1.5, -1.5 ) );
	vec4 c = tap( vUv + uTexel * vec2( 1.5, -1.5 ) );
	vec4 d = tap( vUv + uTexel * vec2( -1.5, 1.5 ) );
	vec4 e = tap( vUv + uTexel * vec2( 1.5, 1.5 ) );
	vec3 sum = a.rgb * a.a * 2.0 + b.rgb * b.a + c.rgb * c.a + d.rgb * d.a + e.rgb * e.a;
	float w = a.a * 2.0 + b.a + c.a + d.a + e.a;
	gl_FragColor = vec4( sum / w, 1.0 );
}`;
const DOWN_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel; // um ponto da origem
varying vec2 vUv;
void main() {
	vec3 c = texture2D( tSrc, vUv ).rgb * 4.0;
	c += texture2D( tSrc, vUv + uTexel * vec2( -1.0, -1.0 ) ).rgb;
	c += texture2D( tSrc, vUv + uTexel * vec2( 1.0, -1.0 ) ).rgb;
	c += texture2D( tSrc, vUv + uTexel * vec2( -1.0, 1.0 ) ).rgb;
	c += texture2D( tSrc, vUv + uTexel * vec2( 1.0, 1.0 ) ).rgb;
	gl_FragColor = vec4( c / 8.0, 1.0 );
}`;
// subida: filtro em tenda da cascata menor, somado ao nível atual
const UP_FRAG = /* glsl */ `
uniform sampler2D tSrc; // nível menor
uniform sampler2D tBase; // nível deste tamanho
uniform vec2 uTexel; // um ponto do nível menor
uniform float uSpread;
varying vec2 vUv;
void main() {
	vec2 o = uTexel * 0.5;
	vec3 c = texture2D( tSrc, vUv + vec2( -o.x * 2.0, 0.0 ) ).rgb + texture2D( tSrc, vUv + vec2( o.x * 2.0, 0.0 ) ).rgb + texture2D( tSrc, vUv + vec2( 0.0, -o.y * 2.0 ) ).rgb + texture2D( tSrc, vUv + vec2( 0.0, o.y * 2.0 ) ).rgb;
	c += ( texture2D( tSrc, vUv + vec2( -o.x, -o.y ) ).rgb + texture2D( tSrc, vUv + vec2( o.x, -o.y ) ).rgb + texture2D( tSrc, vUv + vec2( -o.x, o.y ) ).rgb + texture2D( tSrc, vUv + vec2( o.x, o.y ) ).rgb ) * 2.0;
	gl_FragColor = vec4( texture2D( tBase, vUv ).rgb + c / 12.0 * uSpread, 1.0 );
}`;

/* ───────── 4. composição ───────── */
const COMPOSE_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tAo;
uniform sampler2D tBloom;
uniform highp sampler2D tDepth;
uniform vec2 uAoTexel; // um ponto do alvo da oclusão
uniform vec2 uNearFar;
uniform vec3 uAoTint; // cor da sombra de oclusão (quente: luz que rebate no próprio doce)
uniform vec2 uAoKeep; // faixa de brilho em que a oclusão vai sumindo (não suja os brilhos)
uniform float uAoPower;
uniform float uAoGround; // quanto a oclusão escurece o que está atrás da tela (o chão, no fundo transparente)
uniform float uBloom;
uniform float uVignette;
uniform float uDither;
uniform float uView; // 0 = imagem · 1 = só a oclusão · 2 = só o brilho (conferência)
varying vec2 vUv;
${COMMON}
float hash( vec2 p ) {
	vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
	p3 += dot( p3, p3.yzx + 33.33 );
	return fract( ( p3.x + p3.y ) * p3.z );
}
#if defined( USE_AO ) && defined( AO_JOINT )
float viewDepth( float d ) {
	return ( uNearFar.x * uNearFar.y ) / ( uNearFar.y - ( uNearFar.y - uNearFar.x ) * d ) / uNearFar.y;
}
// ampliação que respeita as bordas: dos 4 vizinhos da meia resolução, pesam os que estão na mesma profundidade
float aoJoint() {
	float zc = viewDepth( texture2D( tDepth, vUv ).x );
	vec2 p = vUv / uAoTexel - 0.5;
	vec2 f = fract( p );
	vec2 base = ( floor( p ) + 0.5 ) * uAoTexel;
	float sum = 0.0;
	float wsum = 0.0;
	for ( int j = 0; j < 2; j ++ ) {
		for ( int i = 0; i < 2; i ++ ) {
			vec4 t = texture2D( tAo, base + vec2( float( i ), float( j ) ) * uAoTexel );
			float wb = ( i == 0 ? 1.0 - f.x : f.x ) * ( j == 0 ? 1.0 - f.y : f.y );
			float wz = 1.0 / ( 0.00002 + abs( unpackDepth( t.gb ) - zc ) );
			sum += t.r * wb * wz;
			wsum += wb * wz;
		}
	}
	return wsum > 0.0 ? sum / wsum : 1.0;
}
#endif
void main() {
	vec4 c = texture2D( tScene, vUv );
	vec3 lin = toLinear( c.rgb );
	float alpha = c.a;
	float touched = 0.0;
	#ifdef USE_AO
		#ifdef AO_JOINT
			float ao = aoJoint();
		#else
			float ao = texture2D( tAo, vUv ).r;
		#endif
		ao = pow( ao, uAoPower );
		float peak = max( lin.r, max( lin.g, lin.b ) );
		ao = mix( ao, 1.0, smoothstep( uAoKeep.x, uAoKeep.y, peak ) );
		// Numa superfície clara a luz rebate dentro da própria reentrância e a enche de volta (creme branco não
		// fica cinza nos sulcos); numa escura, não. Aproximação de vários rebates (Jimenez et al., 2016), feita
		// por canal com a cor do ponto: a sombra de oclusão sai da cor do doce — rosada no morango, quente no creme.
		vec3 albedo = clamp( lin / max( c.a, 0.001 ), 0.0, 1.0 );
		vec3 ka = 2.0404 * albedo - 0.3324;
		vec3 kb = -4.7951 * albedo + 0.6417;
		vec3 kc = 2.7552 * albedo + 0.6903;
		vec3 shade = mix( uAoTint, vec3( 1.0 ), max( vec3( ao ), ( ( ao * ka + kb ) * ao + kc ) * ao ) );
		if ( uView > 0.5 && uView < 1.5 ) {
			gl_FragColor = vec4( toSrgb( shade ), 1.0 );
			return;
		}
		lin *= shade;
		// onde a tela é transparente (o chão do fundo simples), a oclusão vira sombra sobre o que está atrás
		alpha = 1.0 - ( 1.0 - alpha ) * ( 1.0 - ( 1.0 - ao ) * uAoGround );
		touched = 1.0 - ao;
	#endif
	#ifdef USE_BLOOM
		vec3 glow = texture2D( tBloom, vUv ).rgb * uBloom;
		if ( uView > 1.5 ) {
			gl_FragColor = vec4( toSrgb( glow ), 1.0 );
			return;
		}
		lin += glow;
		// fora do bolo (fundo transparente) a luz entra como um véu claro: o alfa acompanha
		vec3 g = toSrgb( glow );
		alpha = alpha + ( 1.0 - alpha ) * clamp( max( g.r, max( g.g, g.b ) ), 0.0, 1.0 );
		touched += g.r + g.g + g.b;
	#endif
	#ifdef USE_VIGNETTE
		vec2 q = vUv - 0.5;
		float vig = 1.0 - uVignette * smoothstep( 0.18, 0.75, dot( q, q ) * 2.0 );
		lin *= vig;
		alpha = 1.0 - ( 1.0 - alpha ) * vig;
		touched += 1.0 - vig;
	#endif
	// ponto que nenhum efeito tocou sai exatamente como entrou
	vec3 outc = touched > 0.0 ? toSrgb( lin ) : c.rgb;
	#ifdef USE_DITHER
		float n = hash( gl_FragCoord.xy ) + hash( gl_FragCoord.yx + 17.0 ) - 1.0; // triangular, ±1
		outc += n * uDither / 255.0 * step( 0.004, touched ) * step( 0.5, c.a );
	#endif
	gl_FragColor = vec4( outc, alpha );
}`;

const DEFAULTS = {
  msaa: 4, // amostras do antisserrilhado do alvo da cena
  ao: null, // { taps, radius, intensity, blur, joint }
  bloom: null, // { levels, strength, from, full }
  vignette: 0,
  dither: 1,
};
const AO_DEFAULTS = { taps: 8, turns: 3, radius: 0.17, intensity: 0.9, bias: 0.008, maxUv: 0.09, blur: 4, joint: true, power: 1, tint: [0.3, 0.24, 0.23], keep: [0.6, 1.02], ground: 0.55, wide: null };
const WIDE_DEFAULTS = { taps: 8, turns: 3, radius: 0.6, intensity: 0.35 };
const BLOOM_DEFAULTS = { levels: 4, strength: 0.4, from: 1.55, full: 5.5, spread: 1 };

function normalize(opts) {
  const o = { ...DEFAULTS, ...(opts || {}) };
  o.ao = o.ao ? { ...AO_DEFAULTS, ...(o.ao === true ? {} : o.ao) } : null;
  if (o.ao) o.ao.wide = o.ao.wide ? { ...WIDE_DEFAULTS, ...(o.ao.wide === true ? {} : o.ao.wide) } : null;
  o.bloom = o.bloom ? { ...BLOOM_DEFAULTS, ...(o.bloom === true ? {} : o.bloom) } : null;
  return o;
}

export function createPost(renderer, options) {
  if (!renderer.capabilities.isWebGL2) return null;
  let q = normalize(options);
  const maxSamples = renderer.capabilities.maxSamples || 4;

  /* triângulo de tela cheia */
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  tri.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  const quad = new THREE.Mesh(tri, null);
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  quadScene.matrixWorldAutoUpdate = false;
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const pass = (name, fragmentShader, uniforms, defines = {}) =>
    new THREE.ShaderMaterial({ name: `bolab-post-${name}`, vertexShader: VERT, fragmentShader, uniforms, defines, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false });
  const v2 = () => new THREE.Vector2();
  const U = (value) => ({ value });

  /* alvos (criados no primeiro quadro e a cada mudança de tamanho ou de qualidade) */
  let sceneRT = null;
  let aoA = null;
  let aoB = null;
  let bloomRT = []; // [nível 0 = 1/4, 1/8, …]
  let bloomUp = []; // subida: do penúltimo ao nível 0
  let mats = null;
  let width = 0;
  let height = 0;
  let built = false;
  let view = 0;
  let failed = false;

  const target = (w, h, extra = {}) => new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), { depthBuffer: false, stencilBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, type: THREE.UnsignedByteType, format: THREE.RGBAFormat, ...extra });

  function freeTargets() {
    sceneRT?.depthTexture?.dispose();
    [sceneRT, aoA, aoB, ...bloomRT, ...bloomUp].forEach((t) => t?.dispose());
    sceneRT = aoA = aoB = null;
    bloomRT = [];
    bloomUp = [];
    width = height = 0;
  }
  function freeMaterials() {
    if (mats) Object.values(mats).forEach((mt) => mt?.dispose());
    mats = null;
    built = false;
  }

  function build() {
    freeMaterials();
    freeTargets();
    mats = {};
    if (q.ao) {
      mats.ao = pass(
        'oclusao',
        AO_FRAG,
        { tDepth: U(null), uDepthTexel: U(v2()), uInvProj: U(v2()), uProj: U(v2()), uNearFar: U(v2()), uRadius: U(q.ao.radius), uIntensity: U(q.ao.intensity), uBias: U(q.ao.bias), uMaxUv: U(q.ao.maxUv), uWide: U(v2()) },
        { TAPS: Math.max(4, Math.round(q.ao.taps)), TURNS: `${q.ao.turns}.0`, ...(q.ao.wide ? { WIDE_TAPS: Math.max(3, Math.round(q.ao.wide.taps)), WIDE_TURNS: `${q.ao.wide.turns}.0` } : {}) },
      );
      mats.blur = pass('desfoque', BLUR_FRAG, { tAo: U(null), uDir: U(v2()), uFar: U(60), uTol: U(0.035) }, { BLUR_R: Math.max(1, Math.round(q.ao.blur)), BLUR_S: `${(Math.max(1, q.ao.blur) * 0.7).toFixed(2)}` });
    }
    if (q.bloom) {
      mats.bright = pass('altas-luzes', BRIGHT_FRAG, { tScene: U(null), uTexel: U(v2()), uKnee: U(v2()) });
      mats.down = pass('reduz', DOWN_FRAG, { tSrc: U(null), uTexel: U(v2()) });
      mats.up = pass('amplia', UP_FRAG, { tSrc: U(null), tBase: U(null), uTexel: U(v2()), uSpread: U(1) });
    }
    const defines = {};
    if (q.ao) defines.USE_AO = 1;
    if (q.ao?.joint) defines.AO_JOINT = 1;
    if (q.bloom) defines.USE_BLOOM = 1;
    if (q.vignette > 0) defines.USE_VIGNETTE = 1;
    if (q.dither > 0) defines.USE_DITHER = 1;
    mats.compose = pass(
      'composicao',
      COMPOSE_FRAG,
      { tScene: U(null), tAo: U(null), tBloom: U(null), tDepth: U(null), uAoTexel: U(v2()), uNearFar: U(v2()), uAoTint: U(new THREE.Vector3(1, 1, 1)), uAoKeep: U(v2()), uAoPower: U(1), uAoGround: U(0), uBloom: U(0), uVignette: U(q.vignette), uDither: U(q.dither), uView: U(0) },
      defines,
    );
    built = true;
  }

  /** Um alvo recém-criado que a placa recusa (incompleto) derruba o pós antes de a tela ficar em branco. */
  function verify(...targets) {
    const gl = renderer.getContext();
    targets.forEach((t) => {
      if (!t) return;
      renderer.setRenderTarget(t);
      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (status !== gl.FRAMEBUFFER_COMPLETE && !gl.isContextLost()) throw new Error(`alvo de render incompleto (0x${status.toString(16)})`);
    });
  }

  function resize(w, h) {
    if (w === width && h === height && sceneRT) return false;
    freeTargets();
    width = w;
    height = h;
    const samples = Math.min(q.msaa, maxSamples);
    const opts = { samples, depthBuffer: true, colorSpace: THREE.SRGBColorSpace };
    if (q.ao) {
      const depth = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
      depth.minFilter = depth.magFilter = THREE.NearestFilter;
      opts.depthTexture = depth;
    }
    sceneRT = target(w, h, opts);
    sceneRT.isXRRenderTarget = true; // grava como a tela (curva de tom + sRGB): ver o cabeçalho
    sceneRT.texture.internalFormat = 'RGBA8'; // os valores já chegam em sRGB: a placa não converte de novo
    if (q.ao) {
      const w2 = Math.ceil(w / 2);
      const h2 = Math.ceil(h / 2);
      aoA = target(w2, h2);
      aoB = target(w2, h2);
    }
    if (q.bloom) {
      let bw = Math.ceil(w / 4);
      let bh = Math.ceil(h / 4);
      // (textura sRGB: a placa guarda a luz com mais níveis no escuro — o halo não faz faixas — e devolve linear)
      const opt = { colorSpace: THREE.SRGBColorSpace };
      for (let i = 0; i < q.bloom.levels && bw >= 4 && bh >= 4; i++) {
        bloomRT.push(target(bw, bh, opt));
        if (i > 0) bloomUp.push(target(bloomRT[i - 1].width, bloomRT[i - 1].height, opt));
        bw = Math.ceil(bw / 2);
        bh = Math.ceil(bh / 2);
      }
    }
    return true;
  }

  const _size = new THREE.Vector2();
  let raw = null; // o renderer.render original, enquanto um quadro está sendo desenhado
  function blit(material, to) {
    quad.material = material;
    renderer.setRenderTarget(to);
    raw(quadScene, quadCam);
  }

  /**
   * Desenha um quadro inteiro. draw(scene, camera) é o renderer.render original (o motor troca o render por
   * um que passa por aqui: quem chamar renderer.render(scene, camera) de fora também recebe o quadro acabado).
   */
  function render(scene, camera, draw) {
    if (failed) {
      draw(scene, camera);
      return false;
    }
    if (!built) build();
    renderer.getDrawingBufferSize(_size);
    let fresh = false;
    try {
      fresh = resize(Math.max(1, Math.floor(_size.x)), Math.max(1, Math.floor(_size.y)));
    } catch (err) {
      failed = true;
      console.warn('[bolo 3D] pós-processamento desligado:', err?.message || err);
      renderer.setRenderTarget(null);
      draw(scene, camera);
      return false;
    }
    const keepAuto = renderer.autoClear;
    raw = draw;
    try {
      renderer.autoClear = true;
      if (fresh) verify(sceneRT, aoA, bloomRT[0]);
      renderer.setRenderTarget(sceneRT);
      draw(scene, camera);

      const P = camera.projectionMatrix.elements;
      if (q.ao) {
        const u = mats.ao.uniforms;
        u.tDepth.value = sceneRT.depthTexture;
        u.uDepthTexel.value.set(1 / width, 1 / height);
        u.uInvProj.value.set(1 / P[0], 1 / P[5]);
        u.uProj.value.set(P[0], P[5]);
        u.uNearFar.value.set(camera.near, camera.far);
        u.uRadius.value = q.ao.radius;
        u.uIntensity.value = q.ao.intensity;
        u.uBias.value = q.ao.bias;
        u.uMaxUv.value = q.ao.maxUv;
        if (q.ao.wide) u.uWide.value.set(q.ao.wide.radius, q.ao.wide.intensity);
        blit(mats.ao, aoA);
        const b = mats.blur.uniforms;
        b.uFar.value = camera.far;
        b.tAo.value = aoA.texture;
        b.uDir.value.set(1 / aoA.width, 0);
        blit(mats.blur, aoB);
        b.tAo.value = aoB.texture;
        b.uDir.value.set(0, 1 / aoA.height);
        blit(mats.blur, aoA);
      }
      let glow = null;
      if (q.bloom && bloomRT.length) {
        const br = mats.bright.uniforms;
        br.tScene.value = sceneRT.texture;
        br.uTexel.value.set(1 / width, 1 / height);
        br.uKnee.value.set(q.bloom.from, q.bloom.full);
        blit(mats.bright, bloomRT[0]);
        const dn = mats.down.uniforms;
        for (let i = 1; i < bloomRT.length; i++) {
          dn.tSrc.value = bloomRT[i - 1].texture;
          dn.uTexel.value.set(1 / bloomRT[i - 1].width, 1 / bloomRT[i - 1].height);
          blit(mats.down, bloomRT[i]);
        }
        const up = mats.up.uniforms;
        up.uSpread.value = q.bloom.spread;
        let src = bloomRT[bloomRT.length - 1];
        for (let i = bloomRT.length - 2; i >= 0; i--) {
          up.tSrc.value = src.texture;
          up.tBase.value = bloomRT[i].texture;
          up.uTexel.value.set(1 / src.width, 1 / src.height);
          blit(mats.up, bloomUp[i]);
          src = bloomUp[i];
        }
        glow = src;
      }
      const c = mats.compose.uniforms;
      c.tScene.value = sceneRT.texture;
      c.tAo.value = aoA ? aoA.texture : null;
      c.tBloom.value = glow ? glow.texture : null;
      c.tDepth.value = q.ao?.joint ? sceneRT.depthTexture : null;
      if (aoA) c.uAoTexel.value.set(1 / aoA.width, 1 / aoA.height);
      c.uNearFar.value.set(camera.near, camera.far);
      if (q.ao) {
        c.uAoTint.value.fromArray(q.ao.tint);
        c.uAoKeep.value.fromArray(q.ao.keep);
        c.uAoPower.value = q.ao.power;
        c.uAoGround.value = q.ao.ground;
      }
      c.uBloom.value = q.bloom ? q.bloom.strength / Math.max(1, bloomRT.length) : 0;
      c.uVignette.value = q.vignette;
      c.uDither.value = q.dither;
      c.uView.value = view;
      blit(mats.compose, null);
    } catch (err) {
      // qualquer falha aqui (alvo que a placa recusa, memória): o pós sai de cena e o bolo segue direto na tela
      failed = true;
      console.warn('[bolo 3D] pós-processamento desligado:', err?.message || err);
      renderer.setRenderTarget(null);
      draw(scene, camera);
      return false;
    } finally {
      renderer.autoClear = keepAuto;
      quad.material = null;
      raw = null;
    }
    return true;
  }

  /** Memória dos alvos (bytes) e o que está ligado. */
  function info() {
    const px = (t) => (t ? t.width * t.height : 0);
    const samples = sceneRT ? sceneRT.samples : Math.min(q.msaa, maxSamples);
    const scenePx = px(sceneRT);
    const sceneBytes = scenePx * 4 * (samples > 0 ? samples + 1 : 1) + scenePx * 4 * (samples > 0 ? samples : 1) + (sceneRT?.depthTexture ? scenePx * 4 : 0);
    const aoBytes = (px(aoA) + px(aoB)) * 4;
    const bloomBytes = [...bloomRT, ...bloomUp].reduce((sum, t) => sum + px(t) * 4, 0);
    return {
      on: !failed,
      size: [width, height],
      msaa: samples,
      ao: q.ao ? { taps: q.ao.taps + (q.ao.wide ? q.ao.wide.taps : 0), blur: q.ao.blur, joint: q.ao.joint } : false,
      bloom: q.bloom ? { levels: bloomRT.length || q.bloom.levels } : false,
      vignette: q.vignette,
      targets: (sceneRT ? 1 : 0) + (aoA ? 2 : 0) + bloomRT.length + bloomUp.length,
      passes: 1 + (q.ao ? 3 : 0) + (q.bloom ? Math.max(0, bloomRT.length * 2 - 1) : 0),
      bytes: sceneBytes + aoBytes + bloomBytes,
      mb: +((sceneBytes + aoBytes + bloomBytes) / 1048576).toFixed(1),
    };
  }

  return {
    render,
    info,
    get quality() {
      return q;
    },
    get failed() {
      return failed;
    },
    /** Troca o que está ligado. Só refaz alvos e programas se a estrutura mudar; números (força, raio) valem na hora. */
    setQuality(next) {
      const n = normalize(next);
      const shape = (o) => JSON.stringify([o.msaa, o.ao && [o.ao.taps, o.ao.turns, o.ao.blur, o.ao.joint, o.ao.wide && [o.ao.wide.taps, o.ao.wide.turns]], o.bloom && [o.bloom.levels], o.vignette > 0, o.dither > 0]);
      const changed = shape(n) !== shape(q);
      q = n;
      if (changed) {
        freeMaterials();
        freeTargets();
      }
    },
    /** Conferência: 0 = imagem · 1 = só a oclusão · 2 = só o brilho. */
    setView(v) {
      view = v;
    },
    /** Contexto perdido: solta os alvos e os programas (voltam sozinhos no próximo quadro). */
    release() {
      freeMaterials();
      freeTargets();
      failed = false;
    },
    dispose() {
      freeMaterials();
      freeTargets();
      tri.dispose();
    },
  };
}
