// BOLAB — desenho 2D do bolo, usado quando o aparelho não consegue abrir a visualização 3D.
// Mostra o essencial (formato, andares, altura, base, camadas, cores e estilo da cobertura, calda, bicos e
// decoração) e gera a miniatura do carrinho.
import { getFlavor, getFilling, getSize, getDecor, tierRadii, LAYER_CM, FILLING_CM, SINGLE_CM } from '../data/customizer.js';
import { coversOf, decorOptions } from './pricing.js';
import { rng } from './textures.js';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function star(ctx, x, y, s) {
  ctx.beginPath();
  for (let p = 0; p < 10; p++) {
    const a = (p / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = (p % 2 ? 0.45 : 1) * s;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function heart(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.6, y - s * 1.1, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.6, y - s * 1.1, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
  ctx.fill();
}

/** Base onde o bolo fica: boleira alta, prato, tábua, cake board ou mármore. */
function drawBase(ctx, base, cx, baseY, cw, u) {
  ctx.fillStyle = 'rgba(60,30,40,0.14)';
  ctx.beginPath();
  ctx.ellipse(cx, baseY + u * (base === 'boleira' ? 0.5 : 0.1), cw * 0.58, u * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  const board = (fill, edge, thick, over) => {
    ctx.fillStyle = fill;
    ctx.strokeStyle = edge;
    ctx.lineWidth = Math.max(1.5, u * 0.014);
    roundRect(ctx, cx - cw / 2 - u * over, baseY, cw + u * over * 2, u * thick, u * Math.min(0.035, thick / 2));
    ctx.fill();
    ctx.stroke();
  };
  if (base === 'boleira') {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(60,30,40,0.16)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - cw * 0.2, baseY + u * 0.05);
    ctx.bezierCurveTo(cx - cw * 0.05, baseY + u * 0.14, cx - cw * 0.05, baseY + u * 0.34, cx - cw * 0.3, baseY + u * 0.46);
    ctx.lineTo(cx + cw * 0.3, baseY + u * 0.46);
    ctx.bezierCurveTo(cx + cw * 0.05, baseY + u * 0.34, cx + cw * 0.05, baseY + u * 0.14, cx + cw * 0.2, baseY + u * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    board('#ffffff', '#dcb45c', 0.07, 0.24);
  } else if (base === 'madeira') board('#a8733f', '#7c5128', 0.1, 0.22);
  else if (base === 'dourada') board('#e3bb62', '#b98d2f', 0.05, 0.16);
  else if (base === 'prateada') board('#d9dce2', '#a9adb6', 0.05, 0.16);
  else if (base === 'marmore') {
    board('#f1f0ed', '#c9c7c2', 0.09, 0.22);
    ctx.strokeStyle = 'rgba(120,120,128,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - cw * 0.4, baseY + u * 0.02);
    ctx.lineTo(cx - cw * 0.1, baseY + u * 0.07);
    ctx.moveTo(cx + cw * 0.15, baseY + u * 0.015);
    ctx.lineTo(cx + cw * 0.42, baseY + u * 0.08);
    ctx.stroke();
  } else board('#ffffff', 'rgba(60,30,40,0.2)', 0.05, 0.22);
}

/** Pinta a lateral de um andar no estilo da cobertura (liso, degradê, listras, aquarela, riscado…). */
function paintSide(ctx, cover, x, y, w, h, u, r) {
  const { color, color2, style } = cover;
  ctx.fillStyle = color;
  if (style === 'ombre') {
    const g = ctx.createLinearGradient(0, y + h, 0, y);
    g.addColorStop(0, color);
    g.addColorStop(1, color2);
    ctx.fillStyle = g;
  }
  ctx.fillRect(x, y, w, h);
  if (style === 'listras') {
    const n = Math.max(6, Math.round(w / (u * 0.16)));
    ctx.fillStyle = color2;
    for (let i = 1; i < n; i += 2) ctx.fillRect(x + (i / n) * w, y, w / n, h);
  } else if (style === 'aquarela') {
    ctx.fillStyle = color2;
    for (let i = 0; i < 7; i++) {
      ctx.globalAlpha = 0.28 + r() * 0.3;
      ctx.beginPath();
      ctx.ellipse(x + r() * w, y + r() * h, w * (0.1 + r() * 0.12), h * (0.12 + r() * 0.2), r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (style === 'pente' || style === 'rustico') {
    ctx.strokeStyle = 'rgba(60,30,40,0.1)';
    ctx.lineWidth = Math.max(1, u * 0.008);
    const step = u * (style === 'pente' ? 0.035 : 0.11);
    for (let yy = y + step; yy < y + h; yy += step) {
      ctx.beginPath();
      ctx.moveTo(x, yy + (style === 'rustico' ? (r() - 0.5) * step * 0.6 : 0));
      ctx.lineTo(x + w, yy + (style === 'rustico' ? (r() - 0.5) * step * 0.6 : 0));
      ctx.stroke();
    }
  } else if (style === 'respingo') {
    ctx.fillStyle = '#d4a23a';
    for (let i = 0; i < 34; i++) {
      ctx.beginPath();
      ctx.arc(x + r() * w, y + r() * h, u * (0.008 + r() * 0.012), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Decorações sem desenho próprio: bolinhas ou formas simples na cor certa, no topo do bolo.
const SIMPLE = {
  morangos: { color: '#d7262f', shape: 'drop' },
  cerejas: { color: '#b3122b', shape: 'dot' },
  margaridas: { color: '#ffffff', shape: 'flower' },
  peonias: { color: '#f39fb2', shape: 'flower' },
  macarons: { color: '#f7b7c8', shape: 'oval' },
  brigadeiros: { color: '#4a2614', shape: 'dot' },
  bombons: { color: '#6b3f22', shape: 'dot' },
  suspiros: { color: '#fff6ec', shape: 'drop' },
  marshmallows: { color: '#ffffff', shape: 'oval' },
  biscoitos: { color: '#2a1a14', shape: 'oval' },
  pirulitos: { color: '#f7b7c8', shape: 'stick' },
  baloes: { color: '#f7b7c8', shape: 'stick' },
  coracoes: { color: '#d96b82', shape: 'heart' },
  borboletas: { color: '#d9c2ff', shape: 'heart' },
  lacos: { color: '#f7b7c8', shape: 'heart' },
};

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
  const size = getSize(config.size) || { radius: 1 };
  const n = config.layers.length;
  const tiers = Math.max(1, Math.min(3, config.tiers || 1));
  const radii = tierRadii(size.radius, tiers);
  const covers = coversOf(config);
  const wide = { round: 1, square: 0.95, rect: 1.2, heart: 1.05, hex: 1 }[config.shape] || 1;
  // camadas finas de massa e recheio quase da mesma espessura (a mesma anatomia do 3D)
  const layerUnits = (n === 1 ? SINGLE_CM : LAYER_CM) / 10;
  const fillUnits = FILLING_CM / 10;
  const tierUnits = n * layerUnits + (n - 1) * fillUnits;
  const cakeUnits = tierUnits * tiers;
  const items = config.decor?.items || [];
  const message = config.decor?.message || '';
  const plaque = message && config.decor.messageMode !== 'bico';
  const topperText = config.decor?.topper?.text || '';
  const tall = items.includes('topo') || topperText || items.includes('baloes') || items.includes('pirulitos');
  // (nome recortado + plaquinha juntos: o nome sobe para ficar acima da placa)
  const extra = topperText && plaque ? 1.3 : tall ? 1 : plaque ? 0.8 : items.includes('velas') ? 0.66 : 0.28;
  const stand = config.base === 'boleira' ? 0.85 : 0.5;
  // 1 unidade do 3D em pixels: o desenho ocupa o máximo possível do quadro
  const u = Math.min(W / (radii[0] * 2 * wide + 0.9), H / (cakeUnits + extra + stand));
  const cx = W / 2;
  const layerH = layerUnits * u;
  const fillH = fillUnits * u;
  const th = tierUnits * u;
  const baseY = (H + (cakeUnits + extra - (stand - 0.35)) * u) / 2;
  const widthOf = (i) => radii[i] * 2 * wide * u;

  drawBase(ctx, config.base, cx, baseY, widthOf(0), u);

  // andares, de baixo para cima
  const pr = u * 0.075;
  const pipe = config.piping?.style && config.piping.style !== 'liso';
  const vintage = config.piping?.style === 'vintage';
  const pipeRow = (x0, cw, yy) => {
    const count = Math.max(4, Math.round(cw / (pr * 2.1)));
    for (let i = 0; i < count; i++) {
      const xx = x0 + pr + (i / (count - 1)) * (cw - pr * 2);
      ctx.fillStyle = config.piping.color;
      ctx.beginPath();
      ctx.arc(xx, yy, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(60,30,40,0.14)';
      ctx.beginPath();
      ctx.arc(xx + pr * 0.25, yy + pr * 0.25, pr * 0.72, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = config.piping.color;
      ctx.beginPath();
      ctx.arc(xx - pr * 0.1, yy - pr * 0.12, pr * 0.72, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  let top = baseY;
  let x0 = 0;
  let cw = 0;
  for (let t = 0; t < tiers; t++) {
    const cover = covers[t] || config.covering;
    const naked = cover.type === 'naked';
    const semi = cover.style === 'seminaked' && !naked;
    cw = widthOf(t);
    x0 = cx - cw / 2;
    const bottom = top;
    top = bottom - th;
    ctx.save();
    roundRect(ctx, x0, top - u * 0.05, cw, th + u * 0.05, u * 0.05);
    ctx.clip();
    if (naked || semi) {
      let y = bottom;
      config.layers.forEach((id, i) => {
        y -= layerH;
        ctx.fillStyle = getFlavor(id)?.crust || '#d39a5c';
        ctx.fillRect(x0, y, cw, layerH + 1);
        if (i < n - 1) {
          y -= fillH;
          const fill = getFilling(config.fillings[i]);
          // recheio de fruta: o que se vê é o creme, com um fio de geleia sobre a massa de baixo
          ctx.fillStyle = semi ? cover.color : fill?.cream || fill?.color || '#fff4dc';
          ctx.fillRect(x0, y, cw, fillH + 1);
          if (!semi && fill?.cream) {
            ctx.fillStyle = fill.color;
            ctx.fillRect(x0, y + fillH * 0.82, cw, fillH * 0.18 + 1);
          }
        }
      });
      if (semi) {
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = cover.color;
        ctx.fillRect(x0, top, cw, th);
        ctx.globalAlpha = 1;
      }
    } else paintSide(ctx, cover, x0, top - u * 0.05, cw, th + u * 0.05, u, r);
    ctx.fillStyle = cover.style === 'ombre' && !naked && !semi ? cover.color2 : cover.color;
    ctx.fillRect(x0, top - u * 0.05, cw, u * 0.06);
    // volume: luz à esquerda, sombra à direita
    const vg = ctx.createLinearGradient(x0, 0, x0 + cw, 0);
    vg.addColorStop(0, 'rgba(255,255,255,0.22)');
    vg.addColorStop(0.35, 'rgba(255,255,255,0)');
    vg.addColorStop(1, 'rgba(60,20,30,0.2)');
    ctx.fillStyle = vg;
    ctx.fillRect(x0, top - u * 0.05, cw, th + u * 0.05);
    ctx.restore();

    if (config.drip?.on) {
      ctx.fillStyle = config.drip.color;
      ctx.beginPath();
      ctx.moveTo(x0, top - u * 0.05);
      ctx.lineTo(x0, top + u * 0.02);
      const drops = Math.max(5, Math.round(cw / (u * 0.17)));
      for (let i = 0; i < drops; i++) {
        const xa = x0 + (i / drops) * cw;
        const xb = x0 + ((i + 1) / drops) * cw;
        const len = u * (0.08 + r() * Math.min(0.38, (th / u) * 0.45));
        ctx.bezierCurveTo(xa + (xb - xa) * 0.15, top + len * 1.25, xb - (xb - xa) * 0.15, top + len * 1.25, xb, top + u * 0.02);
      }
      ctx.lineTo(x0 + cw, top - u * 0.05);
      ctx.closePath();
      ctx.fill();
    }

    if (pipe) {
      const where = vintage ? 'both' : config.piping.where;
      if (where !== 'top') pipeRow(x0, cw, bottom - pr * 0.6);
      if (where !== 'base' && t === tiers - 1) pipeRow(x0, cw, top - u * 0.08);
      if (vintage) {
        // guirlandas drapeadas na lateral
        const swags = Math.max(3, Math.round(cw / (u * 0.42)));
        ctx.strokeStyle = config.piping.color;
        ctx.lineWidth = Math.max(2, u * 0.03);
        ctx.lineCap = 'round';
        for (let i = 0; i < swags; i++) {
          const xa = x0 + (i / swags) * cw;
          const xb = x0 + ((i + 1) / swags) * cw;
          ctx.beginPath();
          ctx.moveTo(xa, top + th * 0.2);
          ctx.quadraticCurveTo((xa + xb) / 2, top + th * 0.62, xb, top + th * 0.2);
          ctx.stroke();
        }
      }
    }
    if (items.includes('wafer')) {
      // cerca de wafer em volta do andar
      const sticks = Math.max(6, Math.round(cw / (u * 0.11)));
      for (let i = 0; i < sticks; i++) {
        ctx.fillStyle = i % 2 ? '#c98d4e' : '#b97c3f';
        roundRect(ctx, x0 + (i / sticks) * cw + 1, top - u * 0.09, cw / sticks - 2, th + u * 0.09, u * 0.02);
        ctx.fill();
      }
    }
  }

  // enfeites espalhados pela lateral
  const ch = cakeUnits * u;
  const side = (count, paint) => {
    for (let i = 0; i < count; i++) {
      const t = Math.min(tiers - 1, Math.floor(r() * tiers));
      const w = widthOf(t);
      paint(cx - w / 2 + r() * w, baseY - t * th - r() * r() * th * 0.8 - u * 0.03);
    }
  };
  if (items.includes('granulado') || items.includes('confete')) {
    const colors = items.includes('confete') ? ['#ff8fb3', '#ffd166', '#7fdcb0', '#7cc4ff', '#b79cff'] : ['#3d1f0f', '#54301a'];
    side(46, (x, y) => {
      ctx.fillStyle = colors[Math.floor(r() * colors.length)];
      ctx.beginPath();
      ctx.arc(x, y, u * 0.018, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  if (items.includes('perolas')) {
    side(26, (x, y) => {
      ctx.fillStyle = r() < 0.2 ? '#e2b659' : '#fffaf2';
      ctx.strokeStyle = 'rgba(60,30,40,0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, u * (0.02 + r() * 0.015), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }
  if (items.includes('ouro')) {
    ctx.fillStyle = '#d9a93f';
    side(12, (x, y) => {
      ctx.beginPath();
      ctx.ellipse(x, y, u * (0.03 + r() * 0.04), u * (0.02 + r() * 0.025), r() * 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // topo do bolo
  const topY = baseY - ch - u * 0.07;
  if (items.includes('raspas')) {
    ctx.fillStyle = '#4a2614';
    for (let i = 0; i < 9; i++) {
      roundRect(ctx, cx + (r() - 0.5) * cw * 0.5, topY - u * (0.06 + r() * 0.06), u * 0.16, u * 0.05, u * 0.025);
      ctx.fill();
    }
  }
  if (items.includes('frutas')) {
    for (let i = 0; i < 7; i++) {
      const xx = cx + (i - 3) * u * 0.2 * Math.min(1, cw / (u * 1.5));
      const big = i % 2 === 0;
      ctx.fillStyle = big ? '#d7262f' : i % 4 === 1 ? '#35447c' : '#c8234a';
      ctx.beginPath();
      ctx.ellipse(xx, topY - u * (big ? 0.1 : 0.06), u * (big ? 0.1 : 0.06), u * (big ? 0.12 : 0.06), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const flower = (xx, yy, tint, core = '#f2c14e') => {
    ctx.fillStyle = tint;
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(xx + Math.cos(a) * u * 0.06, yy + Math.sin(a) * u * 0.06, u * 0.055, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(xx, yy, u * 0.03, 0, Math.PI * 2);
    ctx.fill();
  };
  if (items.includes('flores')) {
    const tint = decorOptions(config, 'flores').color;
    [-0.3, 0, 0.3].forEach((dx) => flower(cx + dx * cw + (items.includes('frutas') ? cw * 0.05 : 0), topY - u * 0.09, tint));
  }
  // as outras decorações: uma fileira de formas simples na cor escolhida
  let row = 0;
  items.forEach((id) => {
    const sym = SIMPLE[id];
    if (!sym) return;
    const color = getDecor(id)?.colors ? decorOptions(config, id).color : sym.color;
    const count = sym.shape === 'stick' ? 3 : 5;
    const lift = u * 0.07 + row * u * 0.05;
    row += 1;
    for (let i = 0; i < count; i++) {
      const xx = cx + (count === 1 ? 0 : (i / (count - 1) - 0.5)) * cw * (0.5 + 0.12 * (row % 3));
      const yy = topY - lift;
      ctx.fillStyle = color;
      ctx.strokeStyle = 'rgba(60,30,40,0.22)';
      ctx.lineWidth = 1;
      if (sym.shape === 'flower') flower(xx, yy - u * 0.02, color);
      else if (sym.shape === 'heart') heart(ctx, xx, yy, u * 0.07);
      else if (sym.shape === 'stick') {
        const hh = u * (0.45 + (i % 2) * 0.16);
        ctx.strokeStyle = '#e7cfa0';
        ctx.lineWidth = u * 0.014;
        ctx.beginPath();
        ctx.moveTo(xx, topY);
        ctx.lineTo(xx, topY - hh);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(xx, topY - hh - u * 0.1, u * 0.1, u * (id === 'baloes' ? 0.13 : 0.1), 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        if (sym.shape === 'oval') ctx.ellipse(xx, yy, u * 0.085, u * 0.05, 0, 0, Math.PI * 2);
        else if (sym.shape === 'drop') ctx.ellipse(xx, yy - u * 0.02, u * 0.06, u * 0.085, 0, 0, Math.PI * 2);
        else ctx.arc(xx, yy, u * 0.06, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  });
  if (items.includes('velas')) {
    const style = config.decor.candleStyle || 'classica';
    if (style === 'numero' && config.decor.number) {
      ctx.fillStyle = '#d9a93f';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `800 ${u * 0.5}px system-ui, sans-serif`;
      ctx.fillText(config.decor.number, cx, topY - u * 0.06);
      ctx.fillStyle = '#ffc04d';
      ctx.beginPath();
      ctx.ellipse(cx, topY - u * 0.56, u * 0.03, u * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (style === 'faisca') {
      ctx.fillStyle = '#e3bb62';
      roundRect(ctx, cx - u * 0.035, topY - u * 0.5, u * 0.07, u * 0.5, u * 0.02);
      ctx.fill();
      ctx.fillStyle = '#ffd98a';
      for (let i = 0; i < 9; i++) star(ctx, cx + (r() - 0.5) * u * 0.36, topY - u * (0.52 + r() * 0.3), u * (0.02 + r() * 0.03));
    } else {
      const c = config.decor.candles;
      const colors = ['#f08fb0', '#f6c453', '#6fcfa8', '#6fb6f2', '#b497f0'];
      for (let i = 0; i < c; i++) {
        const xx = cx + (c === 1 ? 0 : (i / (c - 1) - 0.5) * cw * 0.6);
        ctx.fillStyle = colors[i % colors.length];
        roundRect(ctx, xx - u * 0.025, topY - u * 0.48, u * 0.05, u * 0.48, u * 0.02);
        ctx.fill();
        ctx.fillStyle = '#ffc04d';
        ctx.beginPath();
        ctx.ellipse(xx, topY - u * 0.55, u * 0.03, u * 0.06, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  if (items.includes('topo')) {
    ctx.fillStyle = '#e2b659';
    ctx.strokeStyle = '#e7cfa0';
    ctx.lineWidth = u * 0.016;
    [[0, 0.75, 0.17], [-0.24, 0.5, 0.11], [0.23, 0.4, 0.09]].forEach(([dx, hh, s]) => {
      const xx = cx + dx * u;
      const yy = topY - hh * u;
      ctx.beginPath();
      ctx.moveTo(xx, topY);
      ctx.lineTo(xx, yy);
      ctx.stroke();
      star(ctx, xx, yy, s * u);
    });
  }
  const fit = (text, weight, px, maxW, family) => {
    let fs = px;
    ctx.font = `${weight} ${fs}px ${family}`;
    while (ctx.measureText(text).width > maxW && fs > 6) {
      fs *= 0.92;
      ctx.font = `${weight} ${fs}px ${family}`;
    }
    return fs;
  };
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (topperText) {
    // topo personalizado: o nome recortado, num palito
    const yy = topY - u * (plaque ? 1.04 : 0.72);
    ctx.strokeStyle = '#e7cfa0';
    ctx.lineWidth = u * 0.016;
    ctx.beginPath();
    ctx.moveTo(cx, topY);
    ctx.lineTo(cx, yy + u * 0.1);
    ctx.stroke();
    ctx.fillStyle = config.decor.topper.color || '#dcae52';
    fit(topperText, '800', u * 0.3, Math.max(cw, u * 1.2) * 0.95, 'system-ui, sans-serif');
    ctx.fillText(topperText, cx, yy);
  }
  if (message && !plaque) {
    // escrita com bico: neste desenho de frente o topo do bolo não aparece, então ela vai na frente do andar de
    // cima — longe das decorações do topo —, com um contorno da cor da cobertura para ler bem sobre bicos e listras
    const cover = covers[tiers - 1] || config.covering;
    const face = config.decor.script === 'bastao' ? '"Plus Jakarta Sans", system-ui, sans-serif' : 'Georgia, serif';
    const fs = fit(message, config.decor.script === 'bastao' ? '700' : 'italic 700', Math.min(u * 0.17, th * 0.36), cw * 0.8, face);
    const yy = top + th * (vintage ? 0.56 : 0.5);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = cover.type === 'naked' ? '#fffaf3' : cover.color;
    ctx.lineWidth = fs * 0.36;
    ctx.strokeText(message, cx, yy);
    ctx.fillStyle = config.decor.messageColor || '#d96b82';
    ctx.fillText(message, cx, yy);
  }
  if (plaque) {
    const pw = Math.min(Math.max(cw, u) * 0.95, u * (0.3 + message.length * 0.07));
    const ph = u * 0.26;
    const py = topY - u * 0.5 - (items.includes('velas') ? u * 0.18 : 0);
    ctx.strokeStyle = '#e7cfa0';
    ctx.lineWidth = u * 0.016;
    [-0.3, 0.3].forEach((k) => {
      ctx.beginPath();
      ctx.moveTo(cx + pw * k, topY);
      ctx.lineTo(cx + pw * k, py + ph / 2);
      ctx.stroke();
    });
    ctx.fillStyle = '#fffaf3';
    ctx.strokeStyle = '#d9b25a';
    ctx.lineWidth = Math.max(1.5, u * 0.014);
    roundRect(ctx, cx - pw / 2, py - ph / 2, pw, ph, u * 0.05);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#7a2c40';
    const fs = fit(message, '700', ph * 0.46, pw * 0.86, '"Plus Jakarta Sans", system-ui, sans-serif');
    ctx.fillText(message, cx, py + fs * 0.05);
  }
}

/** Miniatura JPEG (dataURL) do desenho 2D — substitui a foto 3D no carrinho quando não há WebGL. */
export function thumb2D(config, size = 360) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  drawCake2D(c, config);
  return c.toDataURL('image/jpeg', 0.82);
}
