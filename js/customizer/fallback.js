// BOLAB — desenho 2D do bolo, usado quando o aparelho não consegue abrir a visualização 3D.
// Mostra o essencial (formato, altura, camadas, cores, calda e decoração) e gera a miniatura do carrinho.
import { getFlavor, getFilling, getSize } from '../data/customizer.js';
import { rng } from './textures.js';

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Desenha o bolo de frente em `canvas` (qualquer tamanho). */
export function drawCake2D(canvas, config, { background = true } = {}) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  if (background) {
    const g = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, '#fffdfb');
    g.addColorStop(0.55, '#fdeef2');
    g.addColorStop(1, '#f7d3dc');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  const r = rng(7);
  const size = getSize(config.size);
  const n = config.layers.length;
  const wide = { round: 1, square: 0.95, rect: 1.2, heart: 1.05 }[config.shape] || 1;
  const layerUnits = n === 1 ? 0.5 : n === 2 ? 0.38 : n === 3 ? 0.31 : 0.275;
  const cakeUnits = n * layerUnits + (n - 1) * 0.066;
  const items0 = config.decor.items;
  const extra = items0.includes('topo') ? 1 : config.decor.message ? 0.8 : items0.includes('velas') ? 0.66 : 0.28;
  // 1 unidade do 3D em pixels: o desenho ocupa o máximo possível do quadro
  const u = Math.min(W / (size.radius * 2 * wide + 0.9), H / (cakeUnits + extra + 0.85));
  const cw = size.radius * 2 * wide * u;
  const layerH = layerUnits * u;
  const fillH = 0.066 * u;
  const ch = cakeUnits * u;
  const baseY = (H + (cakeUnits + extra - 0.5) * u) / 2;
  const x0 = W / 2 - cw / 2;
  const top = baseY - ch;
  const naked = config.covering.type === 'naked';
  const cover = config.covering.color;

  // sombra e boleira
  ctx.fillStyle = 'rgba(122,44,64,0.14)';
  ctx.beginPath();
  ctx.ellipse(W / 2, baseY + u * 0.5, cw * 0.55, u * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#dcb45c';
  ctx.lineWidth = Math.max(1.5, u * 0.018);
  ctx.beginPath();
  ctx.moveTo(W / 2 - cw * 0.2, baseY + u * 0.05);
  ctx.bezierCurveTo(W / 2 - cw * 0.05, baseY + u * 0.14, W / 2 - cw * 0.05, baseY + u * 0.34, W / 2 - cw * 0.3, baseY + u * 0.46);
  ctx.lineTo(W / 2 + cw * 0.3, baseY + u * 0.46);
  ctx.bezierCurveTo(W / 2 + cw * 0.05, baseY + u * 0.34, W / 2 + cw * 0.05, baseY + u * 0.14, W / 2 + cw * 0.2, baseY + u * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.strokeStyle = 'rgba(122,44,64,0.14)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
  roundRect(ctx, x0 - u * 0.24, baseY, cw + u * 0.48, u * 0.07, u * 0.035);
  ctx.fill();
  ctx.stroke();

  // camadas
  ctx.save();
  roundRect(ctx, x0, top - u * 0.05, cw, ch + u * 0.05, u * 0.05);
  ctx.clip();
  let y = baseY;
  config.layers.forEach((id, i) => {
    y -= layerH;
    ctx.fillStyle = naked ? getFlavor(id).crust : cover;
    ctx.fillRect(x0, y, cw, layerH + 1);
    if (i < n - 1) {
      y -= fillH;
      ctx.fillStyle = naked ? getFilling(config.fillings[i]).color : cover;
      ctx.fillRect(x0, y, cw, fillH + 1);
    }
  });
  ctx.fillStyle = cover;
  ctx.fillRect(x0, top - u * 0.05, cw, u * 0.06);
  // volume: luz à esquerda, sombra à direita
  const vg = ctx.createLinearGradient(x0, 0, x0 + cw, 0);
  vg.addColorStop(0, 'rgba(255,255,255,0.22)');
  vg.addColorStop(0.35, 'rgba(255,255,255,0)');
  vg.addColorStop(1, 'rgba(60,20,30,0.2)');
  ctx.fillStyle = vg;
  ctx.fillRect(x0, top - u * 0.05, cw, ch + u * 0.05);
  ctx.restore();

  // calda
  if (config.drip.on) {
    ctx.fillStyle = config.drip.color;
    ctx.beginPath();
    ctx.moveTo(x0, top - u * 0.05);
    ctx.lineTo(x0, top + u * 0.02);
    const drops = Math.max(5, Math.round(cw / (u * 0.17)));
    for (let i = 0; i < drops; i++) {
      const xa = x0 + (i / drops) * cw;
      const xb = x0 + ((i + 1) / drops) * cw;
      const len = u * (0.08 + r() * Math.min(0.38, (ch / u) * 0.45));
      ctx.bezierCurveTo(xa + (xb - xa) * 0.15, top + len * 1.25, xb - (xb - xa) * 0.15, top + len * 1.25, xb, top + u * 0.02);
    }
    ctx.lineTo(x0 + cw, top - u * 0.05);
    ctx.closePath();
    ctx.fill();
  }

  // bicos
  if (config.piping.style !== 'liso') {
    const pr = u * 0.075;
    const count = Math.max(4, Math.round(cw / (pr * 2.1)));
    const row = (yy) => {
      for (let i = 0; i < count; i++) {
        const xx = x0 + pr + (i / (count - 1)) * (cw - pr * 2);
        ctx.fillStyle = config.piping.color;
        ctx.beginPath();
        ctx.arc(xx, yy, pr, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(122,44,64,0.14)';
        ctx.beginPath();
        ctx.arc(xx + pr * 0.25, yy + pr * 0.25, pr * 0.72, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = config.piping.color;
        ctx.beginPath();
        ctx.arc(xx - pr * 0.1, yy - pr * 0.12, pr * 0.72, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    if (config.piping.where !== 'base') row(top - u * 0.08);
    if (config.piping.where !== 'top') row(baseY - pr * 0.6);
  }

  // decoração (símbolos simples)
  const items = config.decor.items;
  const topY = top - u * 0.07;
  if (items.includes('granulado') || items.includes('confete')) {
    const colors = items.includes('confete') ? ['#ff8fb3', '#ffd166', '#7fdcb0', '#7cc4ff', '#b79cff'] : ['#3d1f0f', '#54301a'];
    for (let i = 0; i < 46; i++) {
      ctx.fillStyle = colors[Math.floor(r() * colors.length)];
      ctx.beginPath();
      ctx.arc(x0 + r() * cw, baseY - r() * r() * ch * 0.8, u * 0.018, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (items.includes('perolas')) {
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = i % 5 === 0 ? '#e2b659' : '#fffaf2';
      ctx.strokeStyle = 'rgba(122,44,64,0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x0 + r() * cw, baseY - r() * r() * ch * 0.6 - u * 0.03, u * (0.02 + r() * 0.015), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  if (items.includes('raspas')) {
    ctx.fillStyle = '#4a2614';
    for (let i = 0; i < 9; i++) {
      roundRect(ctx, W / 2 + (r() - 0.5) * cw * 0.5, topY - u * (0.06 + r() * 0.06), u * 0.16, u * 0.05, u * 0.025);
      ctx.fill();
    }
  }
  if (items.includes('frutas')) {
    for (let i = 0; i < 7; i++) {
      const xx = W / 2 + (i - 3) * u * 0.2;
      const big = i % 2 === 0;
      ctx.fillStyle = big ? '#d7262f' : i % 4 === 1 ? '#35447c' : '#c8234a';
      ctx.beginPath();
      ctx.ellipse(xx, topY - u * (big ? 0.1 : 0.06), u * (big ? 0.1 : 0.06), u * (big ? 0.12 : 0.06), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (items.includes('flores')) {
    [-0.3, 0, 0.3].forEach((dx, i) => {
      const xx = W / 2 + dx * cw + (items.includes('frutas') ? cw * 0.05 : 0);
      ctx.fillStyle = ['#f0a3b8', '#fbd5de', '#e98aa5'][i];
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(xx + Math.cos(a) * u * 0.06, topY - u * 0.09 + Math.sin(a) * u * 0.06, u * 0.055, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#f2c14e';
      ctx.beginPath();
      ctx.arc(xx, topY - u * 0.09, u * 0.03, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  if (items.includes('velas')) {
    const c = config.decor.candles;
    const colors = ['#f08fb0', '#f6c453', '#6fcfa8', '#6fb6f2', '#b497f0'];
    for (let i = 0; i < c; i++) {
      const xx = W / 2 + (c === 1 ? 0 : (i / (c - 1) - 0.5) * cw * 0.6);
      ctx.fillStyle = colors[i % colors.length];
      roundRect(ctx, xx - u * 0.025, topY - u * 0.48, u * 0.05, u * 0.48, u * 0.02);
      ctx.fill();
      ctx.fillStyle = '#ffc04d';
      ctx.beginPath();
      ctx.ellipse(xx, topY - u * 0.55, u * 0.03, u * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (items.includes('topo')) {
    ctx.fillStyle = '#e2b659';
    ctx.strokeStyle = '#e7cfa0';
    ctx.lineWidth = u * 0.016;
    [[0, 0.75, 0.17], [-0.24, 0.5, 0.11], [0.23, 0.4, 0.09]].forEach(([dx, hh, s]) => {
      const xx = W / 2 + dx * u;
      const yy = topY - hh * u;
      ctx.beginPath();
      ctx.moveTo(xx, topY);
      ctx.lineTo(xx, yy);
      ctx.stroke();
      ctx.beginPath();
      for (let p = 0; p < 10; p++) {
        const a = (p / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = (p % 2 ? 0.45 : 1) * s * u;
        ctx.lineTo(xx + Math.cos(a) * rr, yy + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
    });
  }
  if (config.decor.message) {
    const text = config.decor.message;
    const pw = Math.min(cw * 0.95, u * (0.3 + text.length * 0.07));
    const ph = u * 0.26;
    const py = topY - u * 0.5 - (items.includes('velas') ? u * 0.18 : 0);
    ctx.strokeStyle = '#e7cfa0';
    ctx.lineWidth = u * 0.016;
    [-0.3, 0.3].forEach((k) => {
      ctx.beginPath();
      ctx.moveTo(W / 2 + pw * k, topY);
      ctx.lineTo(W / 2 + pw * k, py + ph / 2);
      ctx.stroke();
    });
    ctx.fillStyle = '#fffaf3';
    ctx.strokeStyle = '#d9b25a';
    ctx.lineWidth = Math.max(1.5, u * 0.014);
    roundRect(ctx, W / 2 - pw / 2, py - ph / 2, pw, ph, u * 0.05);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#7a2c40';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let fs = ph * 0.5;
    ctx.font = `italic 700 ${fs}px "Playfair Display", Georgia, serif`;
    while (ctx.measureText(text).width > pw * 0.86 && fs > 6) {
      fs *= 0.92;
      ctx.font = `italic 700 ${fs}px "Playfair Display", Georgia, serif`;
    }
    ctx.fillText(text, W / 2, py + fs * 0.05);
  }
}

/** Miniatura JPEG (dataURL) do desenho 2D — substitui a foto 3D no carrinho quando não há WebGL. */
export function thumb2D(config, size = 360) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  drawCake2D(c, config);
  return c.toDataURL('image/jpeg', 0.82);
}
