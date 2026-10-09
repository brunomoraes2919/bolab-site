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

/** O mesmo fundo em CSS (camada do palco). */
export function backdropCss(b) {
  return [
    `linear-gradient(180deg, transparent 66%, ${b.floor} 100%)`,
    `radial-gradient(60% 46% at 50% 44%, ${b.glow} 0%, transparent 70%)`,
    `radial-gradient(120% 90% at 50% 30%, ${b.c[0]} 0%, ${b.c[1]} 48%, ${b.c[2]} 82%, ${b.c[3]} 100%)`,
  ].join(', ');
}

/** O mesmo fundo pintado num <canvas> 2D (miniaturas e foto para compartilhar). */
export function paintBackdrop(ctx, w, h, b) {
  const g = ctx.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
  g.addColorStop(0, b.c[0]);
  g.addColorStop(0.5, b.c[1]);
  g.addColorStop(0.85, b.c[2]);
  g.addColorStop(1, b.c[3]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w * 0.5, h * 0.46, 0, w * 0.5, h * 0.46, Math.max(w, h) * 0.42);
  glow.addColorStop(0, b.glow);
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
}
