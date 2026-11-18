// BOLAB — Ateliê / Cena: os cenários em volta do bolo, com cara de fotografia de produto.
//
//   'bancada'  tampo de mármore, luz de janela deitada no tampo, cozinha clara só sugerida no desfoque
//   'vitrine'  prateleira de vidro, focos de luz e reflexos limpos, faixas de luz fria e quente ao fundo
//   'festa'    toalha de linho com confete, luzinhas coloridas fora de foco ao fundo
//
// A base que a pessoa escolheu (prato, boleira, tábua…) assenta DIRETO no tampo: não há peça de cenário
// embaixo dela. Como é feito (nada baixado, tudo desenhado em <canvas> e em programas da placa de vídeo):
//   · TAMPO: um disco com a beira esfumada (como a borda de mesa fora de foco numa foto). A pintura (veios,
//     trama, confete, luz de janela) perde nitidez conforme se afasta do bolo — profundidade de campo — e a
//     superfície reflete o fundo de leve, mais forte no olhar rasante (Fresnel), como pedra polida ou vidro.
//     A sombra do bolo e a sombra de contato no pé da base saem do mesmo programa.
//   · FUNDO: uma esfera grande com o ambiente já fora de foco (janelas, faixas de luz) e discos de luz
//     soltos na frente dela (bokeh), que deslizam uns sobre os outros quando a câmera gira.
//   · Degradês calculados no programa (não na imagem) e um grão fino por cima: nenhum degrau de cor (banding).
//
// O tampo e o fundo não usam as luzes do motor (são "fotografados": a luz deles é pintada e acompanha a
// câmera, como a do bolo), então custam pouco por pixel. A direção dessa luz está num lugar só: KEY_LIGHT.
// As cores saem do FUNDO do palco (js/customizer/backdrop.js): junto do bolo o tampo tem o tom `ref` do fundo
// em uso — o contraste automático entre bolo e fundo continua valendo.
import * as THREE from 'three';
import { mixHex } from '../../customizer/backdrop.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
export const SCENES = ['bancada', 'vitrine', 'festa'];

const DOME_R = 26; // raio da esfera do fundo
const LAT0 = -50; // faixa de latitude (graus) que a pintura do fundo cobre: abaixo e acima dela a cor é lisa
const LAT1 = 40;
const RIM = 0.3; // fração do raio do tampo em que a beira pode esfumar (a malha de fora é translúcida)
const MAX_BOKEH = 180;

/*
 * r6-cenarios: direção da luz principal — ÚNICO lugar.
 * O motor (engine.js, KEY_LIGHT) põe a luz principal a `az` do azimute da câmera (negativo = à esquerda de
 * quem olha) e a `elev` de altura. A luz pintada no tampo e a sombra do bolo no tampo saem daqui.
 * r6-luz: os números agora vêm do motor (ctx.keyLight, lido ao criar o cenário); os daqui são só o valor de
 * reserva — sombra pintada e sombra real nunca apontam para lados diferentes.
 */
const KEY_LIGHT = { az: -48 * DEG, elev: 52 * DEG };
/** De onde vem a luz principal, no chão (x, z), para uma câmera no azimute dado; reach = sombra por unidade de altura. */
function keyLight(cameraAz) {
  const az = cameraAz + KEY_LIGHT.az;
  return { x: Math.sin(az), z: Math.cos(az), reach: 1 / Math.tan(KEY_LIGHT.elev) };
}

/* ───────── Utilitários de pintura ───────── */

function rgbOf(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex, a = 1) {
  const [r, g, b] = rgbOf(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
/** Cor como o programa usa: valores de tela (sRGB), sem conversão. */
const v3 = (hex, into = new THREE.Vector3()) => {
  const [r, g, b] = rgbOf(hex);
  return into.set(r / 255, g / 255, b / 255);
};
const shade = (hex, k) => mixHex(hex, k < 1 ? '#000000' : '#ffffff', k < 1 ? 1 - k : k - 1);
const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Gerador de números repetível (o cenário é sempre o mesmo). */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ruído suave em 2D (Perlin), de −1 a 1. */
function perlin(seed) {
  const r = rng(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const gx = new Float32Array(256);
  const gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const a = r() * TAU;
    gx[i] = Math.cos(a);
    gy[i] = Math.sin(a);
  }
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const a = perm[perm[X] + Y];
    const b = perm[perm[X + 1] + Y];
    const c = perm[perm[X] + Y + 1];
    const d = perm[perm[X + 1] + Y + 1];
    const n00 = gx[a] * xf + gy[a] * yf;
    const n10 = gx[b] * (xf - 1) + gy[b] * yf;
    const n01 = gx[c] * xf + gy[c] * (yf - 1);
    const n11 = gx[d] * (xf - 1) + gy[d] * (yf - 1);
    const nx0 = n00 + u * (n10 - n00);
    const nx1 = n01 + u * (n11 - n01);
    return (nx0 + v * (nx1 - nx0)) * 1.41;
  };
}

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Pinta uma camada em tamanho reduzido, desfoca e amplia sobre `dst` (por cima do que já houver).
 * scale = quanto menor a camada é pintada · blur = raio do desfoque, em pixels de `dst` · wrap = a imagem dá
 * a volta na horizontal (o desfoque não pode deixar costura). O desfoque de verdade (filtro do canvas) é usado
 * onde existe; onde não existe (Safari antigo), a camada é encolhida e ampliada duas vezes, que dá quase o mesmo.
 */
function layer(dst, { scale = 4, blur = 0, wrap = false, alpha = 1, op = 'source-over' }, paint) {
  const w = Math.max(8, Math.round(dst.width / scale));
  const h = Math.max(8, Math.round(dst.height / scale));
  const px = blur / scale;
  const pad = wrap ? Math.min(w, Math.ceil(px * 3) + 2) : 0;
  const a = canvasOf(w + pad * 2, h);
  const g = a.getContext('2d');
  g.translate(pad, 0);
  g.scale(w / dst.width, h / dst.height);
  paint(g);
  let src = a;
  if (px > 0.3) {
    const b = canvasOf(a.width, a.height);
    const gb = b.getContext('2d');
    if (typeof gb.filter === 'string') {
      gb.filter = `blur(${px.toFixed(2)}px)`;
      gb.drawImage(a, 0, 0);
      gb.filter = 'none';
    } else {
      gb.imageSmoothingEnabled = true;
      gb.imageSmoothingQuality = 'high';
      const f = Math.max(1.5, px * 1.6);
      const s = canvasOf(Math.max(4, Math.round(a.width / f)), Math.max(4, Math.round(a.height / f)));
      const gs = s.getContext('2d');
      gs.imageSmoothingEnabled = true;
      gs.imageSmoothingQuality = 'high';
      gs.drawImage(a, 0, 0, s.width, s.height);
      const s2 = canvasOf(Math.max(4, Math.round(a.width / (f * 0.62))), Math.max(4, Math.round(a.height / (f * 0.62))));
      const g2 = s2.getContext('2d');
      g2.imageSmoothingEnabled = true;
      g2.imageSmoothingQuality = 'high';
      g2.drawImage(s, 0, 0, s2.width, s2.height);
      gb.drawImage(s2, 0, 0, a.width, a.height);
    }
    src = b;
  }
  const out = dst.getContext('2d');
  out.save();
  out.imageSmoothingEnabled = true;
  out.imageSmoothingQuality = 'high';
  out.globalAlpha = alpha;
  out.globalCompositeOperation = op;
  out.drawImage(src, pad, 0, w, h, 0, 0, dst.width, dst.height);
  out.restore();
}

/* ───────── Cores e parâmetros de cada cenário ───────── */

const PARTY = ['#f0527a', '#ffd166', '#8fd3c8', '#c9a0dc', '#ff9f6b', '#7ec4f0'];

/** O "visual" de um cenário num tom de fundo: cores do tampo e do ambiente e os números do programa. */
function lookOf(b, id) {
  const dark = b.tone === 'dark';
  const [c0, c1, c2, c3] = b.c;
  const near = mixHex(c0, c1, 0.5); // ≈ b.ref: o tom atrás do contorno do bolo
  const L = {
    dark,
    id,
    base: near,
    // ambiente, de baixo para cima: piso · rodapé · faixa do horizonte (o que fica atrás do bolo) · alto
    sky: dark ? [shade(c3, 0.62), mixHex(c2, c3, 0.5), mixHex(c0, c1, 0.7), mixHex(c1, c2, 0.7)] : [shade(c3, 0.93), mixHex(c2, c3, 0.45), mixHex(c1, c2, 0.8), mixHex(c1, c2, 0.3)],
    glow: dark ? '#ffe6c8' : '#ffffff', // luz de janela
    warm: dark ? '#ffcf8f' : '#ffdca6', // lâmpadas
    cool: dark ? '#cfe4ff' : '#ffffff',
    pool: '#ffe9cf',
    side: dark ? 0.2 : 0.06, // o lado da luz é mais claro
    cast: b.shadow.color, // sombra do bolo no tampo
    castA: Math.min(0.62, b.shadow.opacity * (dark ? 1.25 : 1.5)),
    /** Tom de uma coisa de fundo: puxado para a cor do ambiente, para nunca brigar com o bolo. */
    thing: (accent, k = 0.5) => mixHex(mixHex(c1, c2, dark ? 0.7 : 0.5), accent, dark ? k * 0.85 : k),
  };
  if (id === 'bancada') {
    Object.assign(L, {
      // mármore: claro de veio cinza nos tons claros; escuro de veio creme e dourado nos tons escuros
      base: dark ? mixHex(near, c2, 0.3) : mixHex(near, '#ffffff', 0.25),
      vein: dark ? mixHex(c0, '#fff4e2', 0.78) : mixHex(c3, '#75686f', 0.72),
      veinA: dark ? 1.15 : 0.85,
      gold: dark ? '#f0cd92' : '#c9a36a',
      f0: 0.05,
      ghost: dark ? 1.1 : 0.5,
      refl: dark ? 1.25 : 1.0,
      reflLod: 3.4,
      detail: 0.05,
      detailScale: 1.9,
      blur: 3.4,
      fall: dark ? 0.2 : 0.06,
      ao: dark ? 0.26 : 0.15,
      edge: 0,
      feather: 0.22,
      vig: dark ? 0.3 : 0.07,
    });
  } else if (id === 'vitrine') {
    Object.assign(L, {
      // vidro: um nada mais frio que o tom do fundo
      base: dark ? mixHex(mixHex(near, c2, 0.3), '#2e3a48', 0.2) : mixHex(near, '#eef6f8', 0.5),
      f0: 0.1,
      ghost: dark ? 1.6 : 0.8,
      refl: dark ? 2.1 : 1.5,
      reflLod: 2.3,
      detail: 0,
      detailScale: 1,
      blur: 2.6,
      fall: dark ? 0.24 : 0.1,
      ao: dark ? 0.2 : 0.11,
      edge: dark ? 0.15 : 0.15,
      feather: 0.14,
      vig: dark ? 0.34 : 0.08,
    });
  } else {
    Object.assign(L, {
      // linho: um nada mais quente que o tom do fundo
      base: dark ? mixHex(near, '#7a4634', 0.14) : mixHex(near, '#fff5e6', 0.6),
      f0: 0.02,
      refl: dark ? 0.5 : 0.25,
      reflLod: 5,
      detail: dark ? 0.12 : 0.085,
      detailScale: 2.1,
      blur: 3.6,
      fall: dark ? 0.2 : 0.05,
      ao: dark ? 0.3 : 0.19,
      edge: 0,
      feather: 0.24,
      vig: dark ? 0.32 : 0.07,
    });
  }
  return L;
}

/* ───────── Tampo ─────────
   Canvas transparente com o desenho do material (veios, dobras, confete) em cima da cor lisa que o programa
   aplica. O lado do canvas vale o diâmetro do tampo. */

/**
 * Veios do mármore. Cada família de veios é uma rampa atravessada à direção dos veios, entortada por ruído
 * de várias escalas: o veio passa onde a rampa cruza um número inteiro — linhas longas, quase paralelas, que
 * nunca fecham em anel. Cada veio tem a sua força e a sua largura (muitos nem aparecem) e some e volta ao
 * longo do caminho. Uma segunda família, mais fina e noutro ângulo, cruza a primeira.
 */
const hash1 = (i) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
function veinRows(field, S, y0, y1, n) {
  const K = 2;
  const ca = Math.cos(0.5);
  const sa = Math.sin(0.5);
  const cb = Math.cos(-0.16);
  const sb = Math.sin(-0.16);
  // largura mínima de um veio, em unidades da rampa: nunca mais fino que um ponto do campo (senão vira tracejado)
  const min1 = ((3.3 * K) / S) * 1.5;
  const min2 = ((5.3 * K) / S) * 1.7;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < S; x++) {
      const px = (x / S - 0.5) * K;
      const py = (y / S - 0.5) * K;
      const u = px * ca + py * sa;
      const v = -px * sa + py * ca;
      const w = n(u * 0.8 + 3.1, v * 0.8 + 7.7) + 0.5 * n(u * 1.9 + 11.3, v * 1.9 + 4.1) + 0.15 * n(u * 4.3 + 2.7, v * 4.3 + 8.8) + 0.04 * n(u * 9.1 + 5.1, v * 9.1 + 1.4);
      // família principal
      const t = v * 3.3 + 1.05 * w;
      const k = Math.round(t);
      const d = Math.abs(t - k);
      const strength = hash1(k) > 0.3 ? 0.35 + 0.65 * hash1(k + 7.3) : 0;
      const along = sstep(-0.4, 0.15, n(u * 0.9 + k * 3.1, k * 1.7 + 0.4));
      const thin = (0.01 + 0.03 * hash1(k + 2.9)) * (0.55 + 0.9 * (0.5 + 0.5 * n(u * 2.6 + k * 5.3, 5.5)));
      const width = Math.max(thin, min1);
      const core = Math.max(0, 1 - d / width) * Math.sqrt(thin / width);
      const smoke = Math.max(0, 1 - d / (width * 8 + 0.05));
      // família fina, noutro ângulo
      const u2 = u * cb + v * sb;
      const v2 = -u * sb + v * cb;
      const t2 = v2 * 5.3 + 1.5 * w + 0.6 * n(u2 * 3.1 + 40.4, v2 * 3.1 + 20.2);
      const k2 = Math.round(t2);
      const d2 = Math.abs(t2 - k2);
      const s2 = hash1(k2 + 51.7) > 0.5 ? 0.25 + 0.75 * hash1(k2 + 13.1) : 0;
      const along2 = sstep(-0.1, 0.4, n(u2 * 1.6 + k2 * 2.3, k2 * 4.1 + 9.9));
      const w2 = Math.max(0.022, min2);
      const fine = Math.max(0, 1 - d2 / w2) * Math.sqrt(0.022 / w2);
      const i = y * S + x;
      const main = strength * along;
      field.vein[i] = Math.min(1, main * (0.8 * core * core + 0.2 * smoke * smoke * smoke) + 0.36 * s2 * along2 * fine * fine);
      field.gold[i] = Math.min(1, main * smoke * smoke * sstep(0.1, 0.6, n(u * 1.8 + 90.4, v * 1.8 + 12.9)) * 0.5);
      field.cloud[i] = 0.5 + 0.5 * (0.7 * n(u * 0.7 + 55.5, v * 1.5 + 0.4 * w + 77.7) + 0.3 * n(u * 2.2 + 15.5, v * 3.9 + 37.7));
    }
  }
}

/**
 * Luz desenhada no tampo: `shapes(q)` desenha as áreas iluminadas (em branco opaco; o canvas vale o diâmetro do
 * tampo). O que fica fora delas ganha um véu de sombra bem leve e elas próprias um clarão — é o contraste entre
 * os dois que faz a luz aparecer, inclusive em tampo quase branco.
 */
function tableLight(c, L, shapes, { blur = 0.012, veil = 0.05, glow = 0.4, color = '#ffffff' } = {}) {
  const S = c.width;
  layer(c, { scale: 4, blur: S * blur }, (q) => {
    q.fillStyle = rgba(L.cast, veil);
    q.fillRect(0, 0, S, S);
    q.globalCompositeOperation = 'destination-out';
    q.fillStyle = '#ffffff';
    shapes(q);
  });
  layer(c, { scale: 4, blur: S * blur, alpha: glow }, (q) => {
    q.fillStyle = color;
    shapes(q);
  });
}
/** Ponto do canvas do tampo para um azimute (graus) e uma distância do eixo (em raios do tampo). */
const tableXY = (S, deg, dist) => [S / 2 + Math.sin(deg * DEG) * dist * (S / 2), S / 2 - Math.cos(deg * DEG) * dist * (S / 2)];

/** Pinta o campo de veios com as cores do tom em uso. */
function paintMarble(c, L, field, S) {
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  const img = new ImageData(S, S);
  const d = img.data;
  const vein = rgbOf(L.vein);
  const gold = rgbOf(L.gold);
  const hi = rgbOf(L.dark ? mixHex(L.base, '#000000', 0.5) : '#ffffff');
  for (let i = 0; i < S * S; i++) {
    const a = field.vein[i] * L.veinA;
    const gk = field.gold[i] * (L.dark ? 0.5 : 0.42);
    // nuvens: manchas largas de claro e de sombra, quase nada
    const cl = (field.cloud[i] - 0.5) * 2;
    const ca = Math.abs(cl) * (L.dark ? 0.2 : 0.08);
    const cc = cl > 0 ? hi : vein;
    const t = a + gk + ca;
    if (t <= 0.002) continue;
    const o = i * 4;
    d[o] = (vein[0] * a + gold[0] * gk + cc[0] * ca) / t;
    d[o + 1] = (vein[1] * a + gold[1] * gk + cc[1] * ca) / t;
    d[o + 2] = (vein[2] * a + gold[2] * gk + cc[2] * ca) / t;
    d[o + 3] = Math.min(255, (1 - (1 - a) * (1 - gk) * (1 - ca)) * 255);
  }
  const small = canvasOf(S, S);
  small.getContext('2d').putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(small, 0, 0, c.width, c.height);
  // luz de janela deitada no mármore: duas fileiras de vidraças vindas da janela do fundo (225°), em viés,
  // passando à esquerda do bolo na vista padrão
  const T = c.width;
  tableLight(
    c,
    L,
    (q) => {
      const [x, y] = tableXY(T, 290, 0.44);
      q.save();
      q.translate(x, y);
      q.rotate(Math.atan2(-Math.cos(212 * DEG), Math.sin(212 * DEG)) - Math.PI / 2); // o eixo y do desenho aponta para o fundo, onde está a janela
      q.transform(1, 0, 0.32, 1, 0, 0);
      const u = T / 2;
      for (let col = 0; col < 2; col++) for (let row = 0; row < 3; row++) q.fillRect((col - 1) * 0.17 * u + 0.012 * u, row * 0.2 * u + 0.012 * u, 0.146 * u, 0.176 * u);
      q.restore();
    },
    { blur: 0.012, veil: L.dark ? 0.14 : 0.075, glow: L.dark ? 0.2 : 0.6, color: L.dark ? '#ffe9cf' : '#ffffff' },
  );
}

/** Vidro: quase liso — só uma névoa larga, para a superfície não ficar "de plástico". */
function paintGlass(c, L) {
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  const S = c.width;
  const r = rng(23);
  layer(c, { scale: 8, blur: S * 0.06 }, (q) => {
    for (let i = 0; i < 14; i++) {
      const x = r() * S;
      const y = r() * S;
      const rad = S * (0.12 + r() * 0.2);
      const blot = q.createRadialGradient(x, y, 0, x, y, rad);
      blot.addColorStop(0, rgba(i % 2 ? '#ffffff' : L.sky[0], L.dark ? 0.05 : 0.07));
      blot.addColorStop(1, rgba('#ffffff', 0));
      q.fillStyle = blot;
      q.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  });
  // focos de vitrine: poças redondas de luz na prateleira, em volta de onde o bolo fica
  tableLight(
    c,
    L,
    (q) => {
      [
        [212, 0.36, 0.2],
        [262, 0.5, 0.15],
        [158, 0.5, 0.16],
        [320, 0.44, 0.17],
        [40, 0.46, 0.18],
        [100, 0.42, 0.15],
      ].forEach(([deg, dist, rad]) => {
        const [x, y] = tableXY(S, deg, dist);
        q.beginPath();
        q.arc(x, y, (rad * S) / 2, 0, TAU);
        q.fill();
      });
    },
    { blur: 0.03, veil: L.dark ? 0.16 : 0.06, glow: L.dark ? 0.1 : 0.45, color: L.dark ? '#e6f0ff' : '#ffffff' },
  );
}

/** Linho: dobras largas e macias da toalha e um punhado de confete caído longe do bolo. */
function paintLinen(c, L) {
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  const S = c.width;
  const r = rng(37);
  layer(c, { scale: 6, blur: S * 0.035 }, (q) => {
    // dobras: faixas longas de luz e de sombra, quase paralelas
    for (let i = 0; i < 7; i++) {
      q.save();
      q.translate(S / 2, S / 2);
      q.rotate(-0.42 + (r() - 0.5) * 0.3);
      const off = (r() - 0.5) * S * 0.95;
      const w = S * (0.05 + r() * 0.09);
      const grad = q.createLinearGradient(0, off - w, 0, off + w);
      const light = i % 2 === 0;
      grad.addColorStop(0, rgba('#000000', 0));
      grad.addColorStop(0.5, rgba(light ? '#ffffff' : '#5a2a1a', light ? (L.dark ? 0.07 : 0.35) : L.dark ? 0.12 : 0.022));
      grad.addColorStop(1, rgba('#000000', 0));
      q.fillStyle = grad;
      q.fillRect(-S, off - w, S * 2, w * 2);
      q.restore();
    }
  });
  // confete de papel espalhado na toalha: uns poucos perto do bolo (nítidos), mais para longe (fora de foco na cena)
  const u = S / 2;
  for (let i = 0; i < 84; i++) {
    const a = r() * TAU;
    const d = (0.2 + 0.78 * r() ** 0.7) * u;
    const size = (0.0085 + r() * 0.0075) * u;
    g.save();
    g.translate(u + Math.cos(a) * d, u + Math.sin(a) * d);
    g.rotate(r() * TAU);
    g.fillStyle = rgba(i % 4 === 0 ? '#e9c58a' : L.thing(PARTY[i % PARTY.length], 0.88), L.dark ? 0.86 : 0.92);
    g.beginPath();
    if (i % 3) g.ellipse(0, 0, size, size * (0.5 + r() * 0.5), 0, 0, TAU);
    else g.rect(-size, -size * 0.55, size * 2, size * 1.1);
    g.fill();
    // a luz pega de um lado do papel
    g.fillStyle = rgba('#ffffff', 0.22);
    g.beginPath();
    g.ellipse(-size * 0.25, -size * 0.2, size * 0.55, size * 0.3, 0, 0, TAU);
    g.fill();
    g.restore();
  }
}

/** Textura miúda que se repete (64 mm de lado): grão da pedra ou trama do linho. Cinza médio = sem efeito. */
function paintDetail(c, id) {
  const S = c.width;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const d = img.data;
  const r = rng(id === 'festa' ? 71 : 53);
  if (id === 'festa') {
    // trama simples (um por cima, um por baixo), com fios mais grossos aqui e ali
    const T = 4; // pixels por fio
    const n = S / T;
    const warp = Array.from({ length: n }, () => 0.84 + r() * 0.32);
    const weft = Array.from({ length: n }, () => 0.84 + r() * 0.32);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const ix = Math.floor(x / T);
        const iy = Math.floor(y / T);
        const fx = (x % T) / (T - 1) - 0.5;
        const fy = (y % T) / (T - 1) - 0.5;
        const over = (ix + iy) % 2 === 0;
        // o fio de cima é abaulado na direção em que corre; entre os fios, a sombra
        const body = over ? (1 - fx * fx * 2.6) * warp[ix] : (1 - fy * fy * 2.6) * weft[iy];
        const v = 128 + (body - 0.72) * 150 + (r() - 0.5) * 26;
        const o = (y * S + x) * 4;
        d[o] = d[o + 1] = d[o + 2] = Math.max(0, Math.min(255, v));
        d[o + 3] = 255;
      }
    }
  } else {
    for (let i = 0; i < S * S; i++) {
      const v = id === 'vitrine' ? 128 : 128 + (r() - 0.5) * 120 * (r() < 0.06 ? 2.2 : 1);
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = Math.max(0, Math.min(255, v));
      d[i * 4 + 3] = 255;
    }
  }
  // média neutra: o detalhe dá relevo, não muda o tom do tampo
  let sum = 0;
  for (let i = 0; i < S * S; i++) sum += d[i * 4];
  const shift = 128 - sum / (S * S);
  for (let i = 0; i < S * S; i++) d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = Math.max(0, Math.min(255, d[i * 4] + shift));
  g.putImageData(img, 0, 0);
}

/* ───────── Ambiente (fundo fora de foco) ─────────
   Canvas transparente: X = volta inteira (0° = a frente da vista padrão, +z), Y = latitude de LAT1 (em cima)
   a LAT0. O degradê de base é calculado no programa; aqui entram só as "coisas": luz de janela, prateleiras,
   faixas de luz, balões — tudo já desfocado. Cada pintura devolve também os discos de luz (bokeh). */
function paintPano(c, L, id, low) {
  const W = c.width;
  const H = c.height;
  c.getContext('2d').clearRect(0, 0, W, H);
  const ux = W / 360; // pixels por grau, na horizontal
  const uy = H / (LAT1 - LAT0);
  const X = (deg) => ((((deg % 360) + 360) % 360) / 360) * W;
  const Y = (lat) => (LAT1 - lat) * uy;
  const r = rng(id === 'bancada' ? 5 : id === 'vitrine' ? 17 : 29);
  /** Desenha também nas duas emendas, para a volta fechar sem costura. */
  const wrap = (q, deg, fn) => {
    const x = X(deg);
    [x - W, x, x + W].forEach((xx) => {
      q.save();
      q.translate(xx, 0);
      fn(q);
      q.restore();
    });
  };
  /** Mancha oval macia. w, h em graus (diâmetros). hard = onde a borda começa a cair (0 = já do centro). */
  const blob = (q, deg, lat, w, h, color, a, hard = 0) =>
    wrap(q, deg, (qq) => {
      const rx = (w / 2) * ux;
      const ry = (h / 2) * uy;
      qq.translate(0, Y(lat));
      qq.scale(1, ry / rx);
      const grad = qq.createRadialGradient(0, 0, 0, 0, 0, rx);
      grad.addColorStop(0, rgba(color, a));
      if (hard > 0) grad.addColorStop(hard, rgba(color, a));
      grad.addColorStop(1, rgba(color, 0));
      qq.fillStyle = grad;
      qq.fillRect(-rx, -rx, rx * 2, rx * 2);
    });
  /** Retângulo (em graus). */
  const box = (q, deg, lat0, lat1, w, color, a) =>
    wrap(q, deg, (qq) => {
      qq.fillStyle = rgba(color, a);
      qq.fillRect((-w / 2) * ux, Y(lat1), w * ux, (lat1 - lat0) * uy);
    });
  /** Faixa vertical de luz: forte no meio, some para cima e para baixo. */
  const band = (q, deg, w, color, a, lat0 = LAT0, lat1 = LAT1, core = 0.5) =>
    wrap(q, deg, (qq) => {
      const grad = qq.createLinearGradient(0, Y(lat1), 0, Y(lat0));
      grad.addColorStop(0, rgba(color, a * 0.25));
      grad.addColorStop(core, rgba(color, a));
      grad.addColorStop(1, rgba(color, a * 0.1));
      qq.fillStyle = grad;
      qq.fillRect((-w / 2) * ux, Y(lat1), w * ux, (lat1 - lat0) * uy);
    });
  const bokeh = [];
  /** Disco de luz solto: az (graus), lat (graus, vista do centro), dist do eixo, raio, cor, força. */
  const light = (az, lat, dist, size, color, a) => bokeh.push({ az, y: Math.tan(lat * DEG) * dist, dist, size, color, a });

  if (id === 'bancada') {
    // cozinha clara. A vista padrão olha para 206° (a esquerda do quadro são os azimutes maiores): a janela
    // que ilumina a cena fica à esquerda do bolo, as prateleiras com louça e a planta à direita; outras duas
    // janelas e mais prateleiras fecham a volta, para o fundo ter o que mostrar em qualquer giro
    const wins = [225, 100, 340];
    const shelves = [
      [184, 36],
      [283, 52],
      [40, 58],
    ];
    const glowA = L.dark ? 0.36 : 0.95;
    layer(c, { scale: 6, blur: W * 0.03, wrap: true }, (q) => {
      // os cantos entre as janelas ficam mais fechados (dá a profundidade do cômodo)
      shelves.forEach(([deg, w]) => blob(q, deg, -8, w * 1.9, 130, L.dark ? L.sky[0] : shade(L.sky[0], 0.86), L.dark ? 0.4 : 0.34));
      wins.forEach((deg, i) => blob(q, deg, -4, 66 - i * 6, 135, L.glow, glowA * (i ? 0.3 : 0.45)));
    });
    layer(c, { scale: 4, blur: W * 0.007, wrap: true }, (q) => {
      // vidraças: 2 × 3, com os montantes quase sumindo no desfoque
      wins.forEach((deg, i) => {
        const w = i ? 22 : 26;
        const lat0 = -36;
        const lat1 = 37;
        for (let ix = 0; ix < 2; ix++) for (let iy = 0; iy < 3; iy++) box(q, deg + (ix - 0.5) * (w / 2 + 0.8), lat0 + (iy * (lat1 - lat0)) / 3 + 1, lat0 + ((iy + 1) * (lat1 - lat0)) / 3 - 1, w / 2 - 0.8, L.glow, glowA * (i ? 0.72 : 1));
      });
      // prateleiras e o que está nelas: potes e louças como manchas de cor quase apagadas
      const tones = ['#8fb7a2', '#e0b77a', '#c98a8a', '#f3e6d2', '#8fb3cc', '#ffffff', '#b98e62'];
      shelves.forEach(([deg, w], k) => {
        [-27, -13, 1, 15].forEach((lat, j) => {
          box(q, deg, lat - 1, lat, w, L.dark ? shade(L.sky[2], 1.3) : shade(L.sky[0], 0.8), L.dark ? 0.6 : 0.7);
          for (let x = -w / 2 + 2; x < w / 2 - 2; x += 3 + r() * 3.2) {
            const hgt = 4 + r() * 6;
            const tone = L.thing(tones[Math.floor(r() * tones.length)], 0.55);
            if (r() < 0.8) blob(q, deg + x, lat + hgt / 2 + 0.2, 2.8 + r() * 2.4, hgt, tone, L.dark ? 0.6 : 0.78, 0.6);
          }
          if (j === 1 && k !== 1) blob(q, deg - w * 0.3, lat + 8, 10, 15, L.thing('#5f8f6c', 0.78), L.dark ? 0.6 : 0.72, 0.45); // planta
        });
      });
    });
    // pendentes acesos e brilhos de metal e de louça, em duas profundidades
    const n = low ? 20 : 36;
    for (let i = 0; i < n; i++) {
      const az = r() * 360;
      const nearWin = wins.some((w) => Math.abs(((az - w + 540) % 360) - 180) < 20);
      if (nearWin) continue;
      light(az, -5 + r() * 12 + (i % 5 === 0 ? 11 : 0), 10.5 + r() * 7, 0.16 + r() * r() * 0.6, i % 4 === 0 ? L.cool : L.warm, (L.dark ? 0.42 : 0.44) * (0.4 + r() * 0.6));
    }
    [
      [201, 3.4, 0.62],
      [193.5, 1.6, 0.44],
      [178, 4.2, 0.74],
      [171, 0.6, 0.3],
      [300, 3, 0.6],
      [62, 2, 0.55],
      [150, 4, 0.5],
    ].forEach(([deg, lat, size]) => light(deg, lat, 12.5, size, L.warm, (L.dark ? 0.5 : 0.46) * (0.7 + 0.3 * r())));
  } else if (id === 'vitrine') {
    // loja: faixas verticais de luz, frias e quentes, de larguras diferentes — o resto fica em sombra macia
    const bandA = L.dark ? 0.5 : 0.95;
    layer(c, { scale: 6, blur: W * 0.02, wrap: true }, (q) => {
      for (let deg = 0; deg < 360; deg += 36) blob(q, deg + 18 + (r() - 0.5) * 10, -4, 30, 150, L.sky[0], L.dark ? 0.4 : 0.26);
    });
    layer(c, { scale: 4, blur: W * 0.006, wrap: true }, (q) => {
      let deg = 6;
      let k = 0;
      while (deg < 356) {
        const wide = k % 3 === 0;
        const w = wide ? 7 + r() * 5 : 1.6 + r() * 2.2;
        const color = k % 2 ? L.warm : L.cool;
        band(q, deg, w, color, bandA * (wide ? 0.55 : 0.9), LAT0, LAT1, 0.42 + r() * 0.2);
        if (wide) band(q, deg + w * 0.5 + 1.6, 0.9, color, bandA * 0.85); // filete ao lado da faixa larga
        deg += (wide ? 20 : 11) + r() * 12;
        k++;
      }
      // prateleiras de vidro ao fundo: dois fios de luz horizontais
      [-9, 12].forEach((lat) => box(q, 180, lat, lat + 0.5, 360, L.cool, L.dark ? 0.2 : 0.5));
    });
    const n = low ? 30 : 56;
    for (let i = 0; i < n; i++) light(r() * 360, -5 + r() * 12 + (i % 4 === 0 ? 10 : 0), 10.5 + r() * 8, 0.14 + r() * r() * 0.5, i % 3 ? L.cool : L.warm, (L.dark ? 0.46 : 0.44) * (0.4 + r() * 0.6));
  } else {
    // festa: luzes coloridas em discos grandes, varais de luzinhas e luzes soltas — bokeh de festa, sem figura
    layer(c, { scale: 6, blur: W * 0.02, wrap: true }, (q) => {
      for (let deg = 0; deg < 360; deg += 60) blob(q, deg + 8, -2, 70, 110, L.warm, L.dark ? 0.1 : 0.3);
    });
    layer(c, { scale: 3, blur: W * 0.0016, wrap: true }, (q) => {
      // luzes coloridas de festa bem fora de foco: discos grandes, de borda definida, uns por cima dos outros
      for (let k = 0; k < 46; k++) {
        const size = 3.2 + r() * r() * 5;
        const color = k % 3 === 0 ? L.warm : L.thing(PARTY[k % PARTY.length], 0.9);
        blob(q, r() * 360, -13 + r() * 22, size, size, color, (L.dark ? 0.34 : 0.4) * (0.5 + 0.5 * r()), 0.9);
      }
    });
    // varais de luzinhas, em arcos, em duas distâncias; e luzes coloridas soltas mais ao fundo
    const per = low ? 5 : 8;
    for (let sg = 0; sg < 8; sg++) {
      for (let i = 0; i < per; i++) {
        const t = (i + 0.5) / per;
        const sag = Math.sin(t * Math.PI);
        light(sg * 45 + t * 45, 3 - sag * 5.5 + (r() - 0.5) * 0.5, 11, 0.2 + r() * 0.1, L.warm, (L.dark ? 0.7 : 0.6) * (0.75 + 0.25 * r()));
        if (i < per - 1) light(sg * 45 + 20 + t * 52, 9 - sag * 6, 15, 0.3 + r() * 0.16, (sg + i) % 3 ? L.warm : L.thing(PARTY[(sg + i) % PARTY.length], 0.9), (L.dark ? 0.5 : 0.46) * (0.7 + 0.3 * r()));
      }
    }
    const n = low ? 20 : 44;
    for (let i = 0; i < n; i++) light(r() * 360, -8 + r() * 13 + (i % 4 === 0 ? 10 : 0), 12 + r() * 7, 0.22 + r() * r() * 0.75, i % 3 === 0 ? L.warm : L.thing(PARTY[i % PARTY.length], 0.92), (L.dark ? 0.36 : 0.36) * (0.45 + r() * 0.55));
  }
  return bokeh.slice(0, MAX_BOKEH);
}

/* ───────── Programas ───────── */

const NOISE = /* glsl */ `
  float grain(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  // ruído fino (triangular, ±1 nível de cor): desfaz os degraus dos degradês
  vec3 dither(vec3 c) {
    return c + (grain(gl_FragCoord.xy) + grain(gl_FragCoord.xy + 17.13) - 1.0) / 255.0;
  }
`;
const SKY = /* glsl */ `
  uniform sampler2D tPano;
  uniform sampler2D tPanoPrev;
  uniform float uMix;
  uniform vec3 uSky[4];
  uniform vec3 uSkyPrev[4];
  vec3 skyBase(float y) {
    float a = smoothstep(-0.92, -0.5, y);
    float b = smoothstep(-0.52, -0.25, y);
    float c = smoothstep(-0.04, 0.62, y);
    vec3 now = mix(mix(mix(uSky[0], uSky[1], a), uSky[2], b), uSky[3], c);
    if (uMix < 0.001) return now;
    vec3 old = mix(mix(mix(uSkyPrev[0], uSkyPrev[1], a), uSkyPrev[2], b), uSkyPrev[3], c);
    return mix(now, old, uMix);
  }
`;

const DOME_VERT = /* glsl */ `
  varying vec3 vDir;
  varying vec2 vUv;
  varying vec4 vClip;
  void main() {
    vUv = uv;
    vDir = position;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
    vClip = gl_Position;
  }
`;
const DOME_FRAG = /* glsl */ `
  ${SKY}
  ${NOISE}
  uniform float uDim;
  uniform float uVig;
  varying vec3 vDir;
  varying vec2 vUv;
  varying vec4 vClip;
  void main() {
    vec3 col = skyBase(normalize(vDir).y);
    vec4 t = texture2D(tPano, vUv);
    if (uMix > 0.001) t = mix(t, texture2D(tPanoPrev, vUv), uMix);
    col = col * (1.0 - t.a) + t.rgb;
    col *= mix(1.0, 0.2, uDim);
    vec2 ndc = vClip.xy / vClip.w;
    col *= 1.0 - (uVig + 0.3 * uDim) * smoothstep(0.45, 1.45, length(ndc));
    gl_FragColor = vec4(dither(col), 1.0);
  }
`;

const GROUND_VERT = /* glsl */ `
  varying vec3 vW;
  varying vec4 vClip;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
    vClip = gl_Position;
  }
`;
const GROUND_FRAG = /* glsl */ `
  ${SKY}
  ${NOISE}
  uniform sampler2D tMap;
  uniform sampler2D tMapPrev;
  uniform sampler2D tDetail;
  uniform vec3 uBase;
  uniform vec3 uBasePrev;
  uniform vec3 uPool;
  uniform vec2 uLight;     // direção (x, z) de onde vem a luz principal
  uniform vec2 uLat;       // latitude de baixo (rad) e 1 / faixa
  uniform vec4 uShape;     // raio do tampo · fração esfumada · raio do pé da peça · brilho da aresta
  uniform vec4 uOptics;    // refletância de frente · força do reflexo · desfoque do reflexo · desfoque do tampo
  uniform vec4 uShade;     // queda para a beira · oclusão no pé · força do detalhe · escala do detalhe
  uniform float uGhost;    // reflexo da peça no tampo polido
  uniform float uSide;     // quanto o lado da luz é mais claro que o outro
  uniform vec4 uCast;      // sombra do bolo: raio · onde começa · onde termina · força
  uniform vec3 uCastCol;
  uniform float uDim;
  uniform float uVig;
  varying vec3 vW;
  varying vec4 vClip;

  vec3 pano(vec3 d, float lod) {
    float ua = atan(d.x, d.z) * 0.15915494;
    float ub = fract(ua);
    float u = fwidth(ua) < fwidth(ub) + 1e-6 ? ua : ub; // a emenda da volta não pode puxar a imagem miúda
    float v = (asin(clamp(d.y, -1.0, 1.0)) - uLat.x) * uLat.y;
    vec4 t = texture2D(tPano, vec2(u, v), lod);
    if (uMix > 0.001) t = mix(t, texture2D(tPanoPrev, vec2(u, v), lod), uMix);
    return skyBase(d.y) * (1.0 - t.a) + t.rgb;
  }

  void main() {
    float R = uShape.x;
    float r = length(vW.xz);
    float far = clamp((r - uShape.z) / max(R - uShape.z, 0.001), 0.0, 1.0);
    // material: a pintura perde nitidez longe do bolo (profundidade de campo)
    vec2 uv = vW.xz / (2.0 * R) + 0.5;
    float lod = uOptics.w * smoothstep(0.22, 1.0, far);
    vec4 t = texture2D(tMap, uv, lod);
    vec3 base = uBase;
    if (uMix > 0.001) {
      t = mix(t, texture2D(tMapPrev, uv, lod), uMix);
      base = mix(uBase, uBasePrev, uMix);
    }
    vec3 col = base * (1.0 - t.a) + t.rgb;
    col *= 1.0 + uShade.z * (texture2D(tDetail, vW.xz * uShade.w).r - 0.5) * 2.0;
    // luz de estúdio: um pouco mais clara do lado da luz, caindo macia para a beira; sombra junto do pé
    float side = dot(vW.xz / max(r, 0.001), uLight);
    col *= 1.0 + uSide * side * smoothstep(0.0, 0.7, far) - uShade.x * far * far;
    col *= 1.0 - uShade.y * exp(-max(r - uShape.z, 0.0) * 2.4);
    // sombra do bolo: cai para o lado oposto ao da luz, nítida perto do pé e cada vez mais macia e fraca
    float along = clamp(dot(vW.xz, -uLight), uCast.y, uCast.z);
    float k = (along - uCast.y) / max(uCast.z - uCast.y, 0.001);
    float dist = length(vW.xz + uLight * along) - uCast.x * (1.0 - 0.12 * k);
    float soft = uCast.x * mix(0.16, 0.95, k);
    float sh = (1.0 - smoothstep(-soft, soft, dist)) * mix(1.0, 0.5, k) * uCast.w;
    col = mix(col, col * uCastCol, sh);
    // reflexo do ambiente, mais forte no olhar rasante
    vec3 V = normalize(cameraPosition - vW);
    float fres = uOptics.x + (1.0 - uOptics.x) * pow(1.0 - max(V.y, 0.0), 5.0);
    col = mix(col, pano(vec3(-V.x, V.y, -V.z), uOptics.z), clamp(fres * uOptics.y, 0.0, 0.92));
    // a peça clara reflete no tampo polido: uma claridade macia logo à frente do pé, do lado de quem olha
    vec2 front = normalize(cameraPosition.xz) * uShape.z * 1.5;
    float gd = length((vW.xz - front) / (uShape.z * vec2(1.25)));
    col += uGhost * fres * exp(-gd * gd * 1.4) * (1.0 - sh) * (1.0 - 0.7 * uDim);
    // aresta polida (vidro): um fio de luz antes de a beira esfumar
    float edge = (r - R * (1.0 - uShape.y)) / (0.035 * R);
    col += uShape.w * exp(-edge * edge) * (1.0 - 0.8 * uDim);
    // revelação: tudo apaga, menos a poça de luz em volta do bolo
    float pool = exp(-r * r / (uShape.z * uShape.z * 5.5));
    col *= mix(vec3(1.0), uPool * (0.13 + 1.0 * pool), uDim);
    vec2 ndc = vClip.xy / vClip.w;
    col *= 1.0 - (uVig + 0.3 * uDim) * smoothstep(0.45, 1.45, length(ndc));
    float alpha = 1.0 - smoothstep(R * (1.0 - uShape.y), R, r);
    gl_FragColor = vec4(dither(col), alpha);
  }
`;

const BOKEH_VERT = /* glsl */ `
  attribute vec3 aPos;
  attribute vec4 aLook;   // raio · força · cor r, g
  attribute float aBlue;
  uniform float uNear;    // só aparecem os discos mais longe que isto (os de trás do bolo)
  uniform float uShow;
  varying vec2 vP;
  varying vec4 vTint;
  void main() {
    vec4 mv = viewMatrix * modelMatrix * vec4(aPos, 1.0);
    float depth = -mv.z;
    vTint = vec4(aLook.z, aLook.w, aBlue, aLook.y * uShow * smoothstep(uNear, uNear + 3.0, depth));
    vP = position.xy;
    mv.xy += position.xy * aLook.x;
    gl_Position = projectionMatrix * mv;
  }
`;
const BOKEH_FRAG = /* glsl */ `
  uniform float uAdd;   // 1 = soma luz (fundo escuro) · 0 = cobre (fundo claro)
  uniform float uDim;
  varying vec2 vP;
  varying vec4 vTint;
  void main() {
    float r = length(vP);
    // disco de lente: cheio, com a borda um nada mais acesa e o corte macio
    float disc = smoothstep(1.0, 0.74, r);
    float a = disc * (0.78 + 0.22 * smoothstep(0.35, 0.85, r)) * vTint.a * 0.8 * (1.0 + 1.1 * uDim);
    if (a < 0.003) discard;
    gl_FragColor = vec4(vTint.rgb * a, a * (1.0 - uAdd));
  }
`;

/* ───────── O cenário ───────── */

export function createSets(ctx) {
  // r6-luz: a direção da luz principal vem do motor (um lugar só); e, quando o tampo recebe a sombra de verdade
  // do bolo (mapa de sombras do motor: ctx.shadowOnGround), a sombra pintada vira só uma penumbra larga e fraca
  // — as duas nunca somam em dobro. No nível leve (sem mapa) a pintada continua inteira.
  if (ctx.keyLight) {
    KEY_LIGHT.az = ctx.keyLight.az;
    KEY_LIGHT.elev = ctx.keyLight.elev;
  }
  let castBase = 0.3;
  const castGain = () => (ctx.shadowOnGround ? 0.15 : 1);
  const low = ctx.tier.detail < 1;
  const group = new THREE.Group();
  group.name = 'atelie:cenario';
  group.visible = false;
  ctx.scene.add(group);

  const mapSize = low ? 512 : 1024;
  const fieldSize = low ? 384 : 512;
  const panoSize = low ? [1024, 256] : [2048, 512];
  const mapCanvas = canvasOf(mapSize, mapSize);
  const panoCanvas = canvasOf(panoSize[0], panoSize[1]);
  const detailCanvas = canvasOf(128, 128);
  /** As imagens entram no programa como estão (valores de tela), com a transparência já multiplicada. */
  const texOf = (canvas, { repeat = false, repeatX = false } = {}) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.NoColorSpace;
    t.premultiplyAlpha = true;
    t.anisotropy = low ? 2 : 4;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (repeatX) t.wrapS = THREE.RepeatWrapping;
    return t;
  };
  const mapTex = texOf(mapCanvas);
  const panoTex = texOf(panoCanvas, { repeatX: true });
  const detailTex = texOf(detailCanvas, { repeat: true });
  detailTex.premultiplyAlpha = false;

  /* uniformes compartilhados entre o tampo e o fundo */
  const vecs = (n) => Array.from({ length: n }, () => new THREE.Vector3());
  const U = {
    tPano: { value: panoTex },
    tPanoPrev: { value: panoTex },
    uMix: { value: 0 },
    uSky: { value: vecs(4) },
    uSkyPrev: { value: vecs(4) },
    uDim: { value: 0 },
    uVig: { value: 0.12 },
  };
  const groundU = {
    ...U,
    tMap: { value: mapTex },
    tMapPrev: { value: mapTex },
    tDetail: { value: detailTex },
    uBase: { value: new THREE.Vector3(1, 1, 1) },
    uBasePrev: { value: new THREE.Vector3(1, 1, 1) },
    uPool: { value: new THREE.Vector3(1, 0.91, 0.8) },
    uLight: { value: new THREE.Vector2(0, 1) },
    uLat: { value: new THREE.Vector2(LAT0 * DEG, 1 / ((LAT1 - LAT0) * DEG)) },
    uShape: { value: new THREE.Vector4(4, 0.26, 1, 0) },
    uOptics: { value: new THREE.Vector4(0.05, 1, 3, 3) },
    uShade: { value: new THREE.Vector4(0.1, 0.15, 0.04, 2) },
    uGhost: { value: 0 },
    uSide: { value: 0.05 },
    uCast: { value: new THREE.Vector4(1, 0.5, 2, 0.3) },
    uCastCol: { value: new THREE.Vector3(0.4, 0.2, 0.25) },
  };
  const groundOpts = { uniforms: groundU, vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG, toneMapped: false, extensions: { derivatives: true } };
  const discMat = new THREE.ShaderMaterial(groundOpts);
  const rimMat = new THREE.ShaderMaterial({ ...groundOpts, transparent: true, depthWrite: false });
  const domeMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, side: THREE.BackSide, depthWrite: false, toneMapped: false });

  // tampo: o miolo (opaco) e a beira que esfuma (translúcida); os dois em tamanho 1, ampliados pelo raio do tampo
  const seg = low ? 48 : 72;
  const discGeo = new THREE.CircleGeometry(1 - RIM, seg);
  discGeo.rotateX(-Math.PI / 2);
  const rimGeo = new THREE.RingGeometry(1 - RIM, 1.004, seg, 1);
  rimGeo.rotateX(-Math.PI / 2);
  const disc = new THREE.Mesh(discGeo, discMat);
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.renderOrder = -6;
  disc.frustumCulled = rim.frustumCulled = false;
  // fundo: esfera com os anéis nas latitudes da pintura (acima e abaixo dela a cor é lisa)
  const lats = [-90, -70, LAT0, -38, -26, -14, -2, 10, 22, 31, LAT1, 62, 90];
  const domeGeo = new THREE.LatheGeometry(
    lats.map((lat) => new THREE.Vector2(Math.max(1e-4, Math.cos(lat * DEG)) * DOME_R, Math.sin(lat * DEG) * DOME_R)),
    low ? 32 : 48,
  );
  for (let i = 0; i < domeGeo.attributes.position.count; i++) {
    const lat = Math.asin(THREE.MathUtils.clamp(domeGeo.attributes.position.getY(i) / DOME_R, -1, 1)) / DEG;
    domeGeo.attributes.uv.setY(i, THREE.MathUtils.clamp((lat - LAT0) / (LAT1 - LAT0), 0, 1));
  }
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.renderOrder = 40; // depois do bolo e do tampo: só pinta o que eles deixam à mostra
  dome.frustumCulled = false;
  group.add(dome, disc, rim);

  // discos de luz (bokeh): uma malha só, um quadrado por disco, sempre de frente
  const bokehGeo = new THREE.InstancedBufferGeometry();
  bokehGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  bokehGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const bPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BOKEH * 3), 3);
  const bLook = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BOKEH * 4), 4);
  const bBlue = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BOKEH), 1);
  bokehGeo.setAttribute('aPos', bPos);
  bokehGeo.setAttribute('aLook', bLook);
  bokehGeo.setAttribute('aBlue', bBlue);
  bokehGeo.instanceCount = 0;
  const bokehU = { uNear: { value: 8 }, uShow: { value: 1 }, uAdd: { value: 0 }, uDim: U.uDim };
  const bokehMat = new THREE.ShaderMaterial({
    uniforms: bokehU,
    vertexShader: BOKEH_VERT,
    fragmentShader: BOKEH_FRAG,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const bokeh = new THREE.Mesh(bokehGeo, bokehMat);
  bokeh.frustumCulled = false;
  bokeh.renderOrder = -7; // antes da beira do tampo: a beira esfumada passa por cima deles
  group.add(bokeh);
  let bokehNext = null; // discos do cenário que está chegando (entram quando a pintura nova entra)
  function setBokeh(list) {
    const c = new THREE.Vector3();
    list.forEach((b, i) => {
      const a = b.az * DEG;
      bPos.setXYZ(i, Math.sin(a) * b.dist, b.y, Math.cos(a) * b.dist);
      v3(b.color, c);
      bLook.setXYZW(i, b.size, b.a, c.x, c.y);
      bBlue.setX(i, c.z);
    });
    bPos.needsUpdate = bLook.needsUpdate = bBlue.needsUpdate = true;
    bokehGeo.instanceCount = list.length;
  }

  // a câmera manda na luz pintada (como na do bolo: sempre do alto, à esquerda de quem olha) e no corte dos discos
  const _c = new THREE.Vector3();
  disc.onBeforeRender = (renderer, scene, camera) => {
    const kl = keyLight(Math.atan2(camera.position.x, camera.position.z)); // r6-cenarios: direção da luz principal
    groundU.uLight.value.set(kl.x, kl.z);
    groundU.uCast.value.w = castBase * castGain(); // r6-luz
    bokehU.uNear.value = _c.set(camera.position.x, 0, camera.position.z).length() + tableR * 0.45;
  };

  let id = 'bancada';
  let backdrop = null;
  let look = null;
  let painted = '';
  let visible = false;
  let dimK = 0;
  let benchY = 0;
  let footR = 1; // raio do pé da base que a pessoa escolheu (é ela que assenta no tampo)
  let tableR = 4;
  let tableGoal = 4;
  let needPaint = false;
  let quietGround = false;

  /* ───────── pintura ─────────
     Em passos, um por quadro: nenhum segura a tela por muito tempo. Na primeira vez o cenário só aparece
     quando todos terminam; nas trocas, a pintura antiga fica na tela e a nova entra por cima, esmaecendo. */
  let paintJobs = [];
  let warming = false;
  let fade = 0;
  let prevTex = [null, null];
  let veins = null; // campo de veios do mármore (não depende do tom: é calculado uma vez)
  const send = (t) => !group.visible && ctx.renderer.initTexture(t);

  /** Os números do programa de um visual (os que podem esmaecer de um cenário para o outro). */
  const numsOf = (L) => ({ feather: L.feather, edge: L.edge, f0: L.f0, refl: L.refl, reflLod: L.reflLod, blur: L.blur, fall: L.fall, ao: L.ao, detail: L.detail, detailScale: L.detailScale, vig: L.vig, add: L.dark ? 0.85 : 0.3, castA: L.castA, ghost: L.ghost || 0, side: L.side });
  const _pool = [new THREE.Vector3(), new THREE.Vector3()];
  const _cast = [new THREE.Vector3(), new THREE.Vector3()];
  let numsFrom = null;
  let numsTo = null;
  let swap = null; // o que troca de uma vez no meio do esmaecer: os discos de luz e a textura miúda
  /** k = 1 mostra o visual antigo, 0 o novo; show = quanto os discos de luz e o detalhe aparecem (somem no meio da troca). */
  function applyNums(k, show = 1) {
    const a = numsTo;
    const b = numsFrom || numsTo;
    const mix = (key) => a[key] + (b[key] - a[key]) * k;
    const side = swap ? b : a; // antes da troca do meio valem a trama e a escala antigas
    groundU.uShape.value.y = mix('feather');
    groundU.uShape.value.w = mix('edge');
    groundU.uOptics.value.set(mix('f0'), mix('refl'), mix('reflLod'), mix('blur'));
    groundU.uShade.value.set(mix('fall'), mix('ao'), side.detail * show, side.detailScale);
    U.uVig.value = mix('vig');
    bokehU.uAdd.value = side.add;
    bokehU.uShow.value = show;
    castBase = mix('castA');
    groundU.uCast.value.w = castBase * castGain();
    groundU.uGhost.value = mix('ghost');
    groundU.uSide.value = mix('side');
    groundU.uPool.value.copy(_pool[0]).lerp(_pool[1], k);
    groundU.uCastCol.value.copy(_cast[0]).lerp(_cast[1], k);
  }
  function applyLook(L, instant) {
    if (instant || !look) {
      U.uSkyPrev.value.forEach((v, i) => v3(L.sky[i], v));
      v3(L.base, groundU.uBasePrev.value);
    }
    U.uSky.value.forEach((v, i) => v3(L.sky[i], v));
    v3(L.base, groundU.uBase.value);
    numsFrom = instant || !look ? null : numsOf(look);
    numsTo = numsOf(L);
    v3(L.pool, _pool[0]);
    v3(L.cast, _cast[0]);
    if (numsFrom) {
      v3(look.pool, _pool[1]);
      v3(look.cast, _cast[1]);
    } else {
      _pool[1].copy(_pool[0]);
      _cast[1].copy(_cast[0]);
    }
    look = L;
  }

  function paint() {
    if (!backdrop) return;
    const key = `${id}|${backdrop.id}`;
    if (key === painted && !paintJobs.length) return;
    const scene = id;
    const L = lookOf(backdrop, scene);
    const jobs = [];
    if (scene === 'bancada') {
      if (!veins) {
        const S = fieldSize;
        const field = { vein: new Float32Array(S * S), gold: new Float32Array(S * S), cloud: new Float32Array(S * S) };
        const n = perlin(11);
        const rows = low ? 48 : 128;
        for (let y = 0; y < S; y += rows) jobs.push(() => veinRows(field, S, y, Math.min(S, y + rows), n));
        jobs.push(() => (veins = field));
      }
      jobs.push(() => paintMarble(mapCanvas, L, veins, fieldSize));
    } else jobs.push(() => (scene === 'vitrine' ? paintGlass : paintLinen)(mapCanvas, L));
    jobs.push(() => {
      mapTex.needsUpdate = true;
      send(mapTex);
    });
    jobs.push(() => {
      bokehNext = paintPano(panoCanvas, L, scene, low);
      panoTex.needsUpdate = true;
      send(panoTex);
    });
    jobs.push(() => {
      // a pintura nova está pronta: a antiga esmaece por cima dela, e os números do programa vão junto; os
      // discos de luz e a textura miúda (grão / trama) trocam no meio do caminho, quando estão apagados
      const first = !prevTex[0];
      applyLook(L, first);
      const list = bokehNext;
      bokehNext = null;
      swap = () => {
        swap = null;
        paintDetail(detailCanvas, scene);
        detailTex.needsUpdate = true;
        setBokeh(list);
      };
      if (first) {
        swap();
        send(detailTex);
        applyNums(0, 1);
      } else applyNums(1, 1);
      painted = key;
      needPaint = false;
      if (!group.visible) layout();
    });
    paintJobs = jobs;
    ctx.invalidate();
  }

  /** Guarda a pintura que está na tela em texturas à parte: ela fica até a nova chegar e some aos poucos. */
  function keepOld() {
    if (!painted || !group.visible || !look) return;
    prevTex.forEach((t) => t?.dispose());
    const copy = (canvas, opts) => {
      const c = canvasOf(canvas.width, canvas.height);
      c.getContext('2d').drawImage(canvas, 0, 0);
      return texOf(c, opts);
    };
    prevTex = [copy(mapCanvas), copy(panoCanvas, { repeatX: true })];
    groundU.tMapPrev.value = prevTex[0];
    U.tPanoPrev.value = prevTex[1];
    U.uSkyPrev.value.forEach((v, i) => v3(look.sky[i], v));
    v3(look.base, groundU.uBasePrev.value);
    U.uMix.value = 1;
    fade = 1;
  }
  function dropOld() {
    prevTex.forEach((t) => t?.dispose());
    prevTex = [null, null];
    groundU.tMapPrev.value = mapTex;
    U.tPanoPrev.value = panoTex;
    U.uMix.value = 0;
    fade = 0;
    if (swap) swap();
    numsFrom = null;
    if (numsTo) applyNums(0, 1);
  }

  /** Mostra o cenário (depois de pintado) e põe o chão no lugar. */
  function reveal() {
    group.visible = true;
    layout();
    ctx.invalidate();
  }

  function placeTable() {
    disc.scale.setScalar(tableR);
    rim.scale.setScalar(tableR);
    groundU.uShape.value.x = tableR;
    groundU.uShape.value.z = footR;
  }

  function layout() {
    const stand = ctx.stand;
    if (!stand) return;
    // a base que a pessoa escolheu assenta direto no tampo (não há peça de cenário embaixo dela)
    benchY = stand.floorY;
    disc.position.y = rim.position.y = benchY;
    dome.position.y = bokeh.position.y = benchY;
    // onde ela toca o tampo: bases de pé (boleira, boleira de vidro) apoiam num anel menor que o prato
    const footed = -stand.floorY > 0.3;
    footR = footed ? stand.plateRadius * 0.5 : stand.plateRadius;
    // o tampo cresce com o bolo: a beira dele fica sempre no mesmo lugar do quadro
    tableGoal = Math.max(4, stand.plateRadius * 3.4 + 1.1);
    if (!group.visible) tableR = tableGoal;
    placeTable();
    // sombra do bolo no tampo: cada unidade de altura joga a sombra `reach` para o lado oposto ao da luz
    const m = ctx.m;
    const reach = keyLight(0).reach; // r6-cenarios: direção da luz principal
    const wide = Math.max(stand.plateRadius, m ? m.base.bounds.maxR : 0);
    const hPlate = Math.max(0.02, -benchY);
    groundU.uCast.value.set(wide * 0.97, reach * hPlate * 0.55, reach * (hPlate + (m ? m.Htot : 1) * 0.92), groundU.uCast.value.w);
    if (group.visible) {
      ctx.setGround({ drop: 0, contact: 0, radius: 0, reframe: !quietGround });
      ctx.floorShadow(false); // a sombra projetada no tampo é a do programa (a mancha do motor fica para o modo rápido)
    }
  }

  return {
    group,
    get id() {
      return id;
    },
    get benchY() {
      return benchY;
    },
    /** Altura da peça de cenário sob a base: não há mais nenhuma (a base assenta direto no tampo). */
    get underHeight() {
      return 0;
    },
    /** O cenário está na tela? (ligado E já pintado) */
    get visible() {
      return group.visible;
    },
    setScene(next) {
      if (!SCENES.includes(next) || next === id) return;
      keepOld();
      id = next;
      needPaint = true;
      if (visible) {
        paint();
        if (group.visible) layout();
      }
    },
    setBackdrop(b, { instant = false } = {}) {
      if (!b || b.id === backdrop?.id) return;
      if (!instant) keepOld();
      backdrop = b;
      needPaint = true;
      if (visible) paint();
    },
    /** quiet = sem reenquadrar a câmera (a foto de catálogo esconde o cenário e o traz de volta num instante). */
    setVisible(on, { quiet = false } = {}) {
      on = Boolean(on);
      if (on === visible) return;
      visible = on;
      quietGround = quiet;
      if (on) {
        if (needPaint || !painted) paint();
        if (painted) reveal(); // (a pintura nova, se houver, entra por cima em poucos quadros)
      } else {
        group.visible = false;
        ctx.floorShadow(true);
        ctx.setGround({ drop: 0, contact: 0, radius: 0, reframe: !quiet });
      }
      quietGround = false;
    },
    layout,
    /** O prato gira com o bolo dentro do motor; o cenário não tem peça que gire (fica para o contrato da cena). */
    spin() {},
    /** Revelação: k = 1 apaga o ambiente e deixa a poça de luz em volta do bolo (as luzes do fundo acendem mais). */
    dim(k) {
      dimK = k;
      U.uDim.value = k;
    },
    tick(dt) {
      if (!visible) return false;
      let busy = false;
      if (paintJobs.length) {
        paintJobs.shift()();
        busy = true;
        if (!paintJobs.length && !group.visible && !warming) {
          // primeira vez: os programas da placa de vídeo são preparados em segundo plano e só então o cenário
          // aparece (compilar na hora de desenhar seguraria a tela por um instante)
          warming = true;
          const parallel = ctx.renderer.extensions.has('KHR_parallel_shader_compile');
          ctx.compileQuietly(group, () =>
            setTimeout(
              () => {
                warming = false;
                if (visible && !group.visible) reveal();
              },
              parallel ? 0 : 300, // sem aviso de "programa pronto", espera um pouco: a placa compila em segundo plano
            ),
          );
        }
      }
      if (warming) busy = true;
      if (!group.visible) return busy;
      if (fade > 0 && !paintJobs.length) {
        fade = Math.max(0, fade - dt / (ctx.reduceMotion ? 0.15 : 0.55));
        const k = fade * fade * (3 - 2 * fade);
        U.uMix.value = k;
        if (swap && fade <= 0.5) swap();
        applyNums(k, Math.abs(2 * fade - 1));
        if (fade <= 0) dropOld();
        busy = true;
      }
      if (Math.abs(tableGoal - tableR) > 1e-3) {
        tableR += (tableGoal - tableR) * Math.min(1, dt * 7);
        if (Math.abs(tableGoal - tableR) < 0.004) tableR = tableGoal;
        placeTable();
        busy = true;
      }
      return busy;
    },
    stats() {
      let tris = 0;
      let calls = 0;
      group.traverse((o) => {
        if (!o.isMesh || !o.visible) return;
        const geo = o.geometry;
        const n = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
        tris += n * (geo.isInstancedBufferGeometry ? geo.instanceCount : 1);
        calls++;
      });
      return { triangles: Math.round(tris), calls };
    },
    /** Só para a bancada de testes: as pinturas como estão (dataURL). */
    debug: {
      get table() {
        return { tableR, footR, plate: ctx.stand?.plateRadius, floorY: ctx.stand?.floorY };
      },
      canvas: (name) => ({ map: mapCanvas, pano: panoCanvas, detail: detailCanvas })[name]?.toDataURL('image/png'),
      get look() {
        return look;
      },
      get dim() {
        return dimK;
      },
    },
    dispose() {
      ctx.scene.remove(group);
      if (group.visible) ctx.floorShadow(true);
      disc.onBeforeRender = () => {};
      [discGeo, rimGeo, domeGeo, bokehGeo].forEach((gq) => gq.dispose());
      [discMat, rimMat, domeMat, bokehMat].forEach((mt) => mt.dispose());
      [mapTex, panoTex, detailTex, ...prevTex].forEach((t) => t?.dispose());
      paintJobs = [];
      veins = null;
    },
  };
}
