// BOLAB — fundo do palco do personalizador.
// O fundo "Automático" é escolhido pelas cores do bolo, para que o contorno, os bicos e a calda
// nunca se confundam com o que está atrás deles. Funções puras (sem tela, sem 3D): dá para testar no Node.
import { getFlavor } from '../data/customizer.js';

export const BACKDROP_AUTO = 'auto';

/**
 * Fundos prontos. c = degradê do centro para a borda · ref = tom que fica atrás do contorno do bolo
 * (é com ele que o contraste é medido; os valores foram lidos dos pixels do palco de verdade) · tone = como os textos e ícones do palco se comportam.
 */
export const BACKDROPS = [
  {
    id: 'rosa',
    name: 'Rosa claro',
    tone: 'light',
    c: ['#fffaf8', '#fdeef2', '#f9dbe3', '#f5cbd6'],
    ref: '#fdf3f5',
    glow: 'rgba(255, 255, 255, 0.95)',
    floor: 'rgba(240, 190, 204, 0.38)',
    ink: '#2a1210',
    ink2: '#7a5060',
    shadow: { color: '#6d2338', opacity: 0.2 },
    contact: { color: '#5c1d30', opacity: 0.34 },
    ground: '#f6c9d4',
  },
  {
    id: 'creme',
    name: 'Creme',
    tone: 'light',
    c: ['#fffdf9', '#fbf2e4', '#f4e3cc', '#ecd3b3'],
    ref: '#fcf6ec',
    glow: 'rgba(255, 255, 255, 0.9)',
    floor: 'rgba(224, 192, 150, 0.36)',
    ink: '#2a1210',
    ink2: '#75573f',
    shadow: { color: '#6b4426', opacity: 0.2 },
    contact: { color: '#573419', opacity: 0.32 },
    ground: '#f1dcc0',
  },
  {
    id: 'rose',
    name: 'Rosé profundo',
    tone: 'dark',
    c: ['#a8697f', '#995a72', '#84475f', '#69334b'],
    ref: '#a2647a',
    glow: 'rgba(255, 226, 234, 0.1)',
    floor: 'rgba(66, 20, 40, 0.36)',
    ink: '#ffffff',
    ink2: '#ffe3ea',
    shadow: { color: '#2b0b19', opacity: 0.34 },
    contact: { color: '#22070f', opacity: 0.46 },
    ground: '#d9a9b6',
  },
  {
    id: 'cacau',
    name: 'Cacau',
    tone: 'dark',
    c: ['#643842', '#4e2731', '#391a23', '#251016'],
    ref: '#5a313b',
    glow: 'rgba(255, 206, 216, 0.08)',
    floor: 'rgba(12, 3, 7, 0.42)',
    ink: '#ffffff',
    ink2: '#f6d9df',
    shadow: { color: '#0b0204', opacity: 0.46 },
    contact: { color: '#070102', opacity: 0.55 },
    ground: '#b98f97',
  },
];

/** Entre quais fundos o "Automático" escolhe. Em empate: bolo claro prefere o rosé, bolo escuro prefere o rosa claro. */
const AUTO_LIGHT_CAKE = ['rose', 'cacau', 'rosa'];
const AUTO_DARK_CAKE = ['rosa', 'rose', 'cacau'];
/** Contraste mínimo entre a cobertura e o fundo atrás dela. */
export const CONTRAST_TARGET = 2;
/** A partir daqui o contraste já é "de sobra": acima disso, mais contraste não conta mais pontos. */
const CONTRAST_ENOUGH = 3;
/** Diferença de nota para o fundo automático trocar (evita ficar alternando entre cores parecidas). */
const SWITCH_MARGIN = 0.5;
const TIE = 0.35;

const byId = (id) => BACKDROPS.find((b) => b.id === id) || null;
export const getBackdrop = byId;

function rgbOf(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Luminância relativa (WCAG) de uma cor #rrggbb: 0 = preto, 1 = branco. */
export function luminance(hex) {
  const [r, g, b] = rgbOf(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste (WCAG) entre duas cores: de 1 (iguais) a 21 (preto e branco). */
export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function mixHex(a, b, k) {
  const x = rgbOf(a);
  const y = rgbOf(b);
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * As cores do bolo que precisam aparecer contra o fundo, com o peso de cada uma.
 * A primeira é sempre a principal (cobertura — ou, no naked, a massa com o véu de creme).
 * Bico, calda e enfeites claros pesam mais quando têm cor parecida com a da cobertura: aí é o fundo
 * que precisa destacá-los. Quando já contrastam com o próprio bolo (bico branco em bolo escuro), quase não pesam.
 */
export function cakeTones(config) {
  const tones = [];
  const cover = config?.covering?.color || '#ffffff';
  let main = cover;
  if (config?.covering?.type === 'naked') {
    const crusts = (config.layers || []).map((id) => getFlavor(id)?.crust || '#d39a5c');
    let crust = crusts[0] || '#d39a5c';
    for (let i = 1; i < crusts.length; i++) crust = mixHex(crust, crusts[i], 1 / (i + 1));
    main = mixHex(crust, cover, 0.38);
  }
  tones.push({ hex: main, w: 1 });
  const detail = (hex, w) => tones.push({ hex, w: w * Math.max(0.15, Math.min(1, (3 - contrast(hex, main)) / 2)) });
  if (config?.drip?.on) detail(config.drip.color, 0.5);
  if (config?.piping && config.piping.style !== 'liso') detail(config.piping.color, 0.5);
  const items = config?.decor?.items || [];
  if (items.includes('perolas')) detail('#fff6ec', 0.25);
  if (items.includes('flores')) detail('#f6aabb', 0.2);
  return tones;
}

/** Nota de um fundo para um bolo: contraste médio (com teto) das cores do bolo contra o fundo. */
export function backdropScore(config, backdrop) {
  const tones = cakeTones(config);
  let sum = 0;
  let weight = 0;
  tones.forEach((t) => {
    sum += Math.min(CONTRAST_ENOUGH, contrast(t.hex, backdrop.ref)) * t.w;
    weight += t.w;
  });
  return { score: sum / weight, main: contrast(tones[0].hex, backdrop.ref) };
}

/**
 * Fundo automático para um bolo.
 * Regra: só valem fundos em que a cobertura tem contraste ≥ CONTRAST_TARGET (2:1) com o tom atrás dela;
 * entre eles ganha o de melhor nota (bico, calda e pérolas também contam). Bolos claros e pastel caem no
 * rosé profundo, bolos escuros no rosa claro e os de tom médio no lado que der mais contraste.
 * `prevId` é o fundo automático que já está na tela: ele só é trocado se outro for claramente melhor
 * (histerese: evita ficar alternando enquanto a pessoa passeia por cores parecidas).
 */
export function autoBackdrop(config, prevId = null) {
  const light = luminance(cakeTones(config)[0].hex) >= 0.4;
  const rated = (light ? AUTO_LIGHT_CAKE : AUTO_DARK_CAKE).map((id, order) => ({ id, order, ...backdropScore(config, byId(id)) }));
  const ok = rated.filter((r) => r.main >= CONTRAST_TARGET);
  // nenhum chega ao alvo (não acontece com a paleta da loja): fica o de maior contraste com a cobertura
  if (!ok.length) return rated.reduce((a, b) => (b.main > a.main ? b : a)).id;
  const top = Math.max(...ok.map((r) => r.score));
  const best = ok.filter((r) => r.score >= top - TIE).sort((a, b) => a.order - b.order)[0];
  const prev = rated.find((r) => r.id === prevId);
  // histerese: o fundo que já está na tela fica se ainda serve bem — nota parecida e contraste da cobertura
  // não muito abaixo do melhor (um bolo claro que vira escuro troca; tons vizinhos não ficam alternando)
  const cap = (v) => Math.min(v, 6);
  if (prev && prev.main >= CONTRAST_TARGET && prev.score >= best.score - SWITCH_MARGIN && cap(prev.main) >= 0.6 * cap(best.main)) return prev.id;
  return best.id;
}

/** O fundo em uso: o escolhido à mão ou, em "Automático", o calculado para o bolo. */
export function resolveBackdrop(config, prevAutoId = null) {
  return byId(config?.backdrop) || byId(autoBackdrop(config, prevAutoId));
}

/**
 * Grão fino (48 × 48, preto e branco quase transparentes) posto por cima dos degradês: sem ele, um degradê
 * largo em tom escuro aparece em degraus (banding), porque a tela só tem 256 níveis por cor.
 */
const GRAIN = 'data:image/png;base64,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';

/** Paradas do degradê de estúdio: a luz cai macia do centro para as bordas (mesmos tons, mais paradas). */
function studioStops(b) {
  return [
    [0, b.c[0]],
    [0.22, mixHex(b.c[0], b.c[1], 0.52)],
    [0.46, b.c[1]],
    [0.64, mixHex(b.c[1], b.c[2], 0.52)],
    [0.82, b.c[2]],
    [1, b.c[3]],
  ];
}
function rgbaOf(hex, a) {
  const [r, g, bl] = rgbOf(hex);
  return `rgba(${r}, ${g}, ${bl}, ${a})`;
}

/**
 * O mesmo fundo em CSS (camada do palco): fundo infinito de estúdio — a luz abre atrás do bolo e cai macia
 * para as bordas, o chão recebe um clarão discreto, os cantos fecham um nada (vinheta) e um grão fino
 * desfaz os degraus do degradê. O tom atrás do contorno do bolo continua sendo `ref`.
 */
export function backdropCss(b) {
  const dark = b.tone === 'dark';
  return [
    `url(${GRAIN})`,
    `radial-gradient(135% 120% at 50% 46%, transparent 58%, ${rgbaOf(b.shadow.color, dark ? 0.3 : 0.07)} 100%)`,
    `radial-gradient(64% 15% at 50% 79%, ${dark ? 'rgba(255, 236, 240, 0.05)' : 'rgba(255, 255, 255, 0.5)'} 0%, transparent 72%)`,
    `linear-gradient(180deg, transparent 62%, ${b.floor} 100%)`,
    `radial-gradient(60% 46% at 50% 44%, ${b.glow} 0%, transparent 70%)`,
    `radial-gradient(120% 90% at 50% 30%, ${studioStops(b)
      .map(([at, hex]) => `${hex} ${Math.round(at * 100)}%`)
      .join(', ')})`,
  ].join(', ');
}

let grainTile = null;
/** O mesmo fundo pintado num <canvas> 2D (miniaturas, foto e vídeo para compartilhar). */
export function paintBackdrop(ctx, w, h, b) {
  const dark = b.tone === 'dark';
  const g = ctx.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
  studioStops(b).forEach(([at, hex]) => g.addColorStop(at, hex));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w * 0.5, h * 0.46, 0, w * 0.5, h * 0.46, Math.max(w, h) * 0.42);
  glow.addColorStop(0, b.glow);
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  // vinheta: os cantos fecham um nada
  const vig = ctx.createRadialGradient(w * 0.5, h * 0.46, Math.min(w, h) * 0.42, w * 0.5, h * 0.46, Math.hypot(w, h) * 0.62);
  vig.addColorStop(0, rgbaOf(b.shadow.color, 0));
  vig.addColorStop(1, rgbaOf(b.shadow.color, dark ? 0.3 : 0.07));
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
  // grão fino por cima (só no navegador): desfaz os degraus do degradê na foto e no vídeo
  if (typeof document === 'undefined' || typeof ctx.createPattern !== 'function') return;
  try {
    if (!grainTile) {
      const S = 64;
      grainTile = document.createElement('canvas');
      grainTile.width = grainTile.height = S;
      const q = grainTile.getContext('2d');
      const img = q.createImageData(S, S);
      let seed = 7;
      for (let i = 0; i < S * S; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const v = seed >>> 31 ? 255 : 0;
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = ((seed >>> 8) & 7) % 5;
      }
      q.putImageData(img, 0, 0);
    }
    ctx.fillStyle = ctx.createPattern(grainTile, 'repeat');
    ctx.fillRect(0, 0, w, h);
  } catch {
    // sem grão: o fundo fica como sempre foi
  }
}
