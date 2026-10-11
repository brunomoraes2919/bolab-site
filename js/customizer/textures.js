// BOLAB — texturas procedurais do personalizador (tudo desenhado em <canvas>, sem arquivos externos).
import * as THREE from 'three';

/** Gerador pseudoaleatório com semente (mulberry32): o mesmo bolo sempre sai igual. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Ruído de valor 2D que se repete nas bordas (period = nº de células). */
function tileNoise(period, seed) {
  const r = rng(seed);
  const grid = new Float32Array(period * period);
  for (let i = 0; i < grid.length; i++) grid[i] = r();
  const at = (x, y) => grid[(((y % period) + period) % period) * period + (((x % period) + period) % period)];
  const smooth = (t) => t * t * (3 - 2 * t);
  return (u, v) => {
    const x = u * period;
    const y = v * period;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const a = at(x0, y0);
    const b = at(x0 + 1, y0);
    const c = at(x0, y0 + 1);
    const d = at(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

/** Pinta um mapa de alturas (tons de cinza) a partir de uma função f(u, v) → 0…1. */
function paintHeight(size, f, sizeY = size) {
  const c = makeCanvas(size, sizeY);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, sizeY);
  for (let y = 0; y < sizeY; y++) {
    for (let x = 0; x < size; x++) {
      const v = Math.max(0, Math.min(255, Math.round(f(x / size, y / sizeY) * 255)));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Converte alturas em mapa de normais (convenção do Three.js). */
function heightToNormal(canvas, strength = 2, wrap = true) {
  const w = canvas.width;
  const h = canvas.height;
  const src = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const out = makeCanvas(w, h);
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  const H = (x, y) => {
    if (wrap) {
      x = (x + w) % w;
      y = (y + h) % h;
    } else {
      x = Math.max(0, Math.min(w - 1, x));
      y = Math.max(0, Math.min(h - 1, y));
    }
    return src[(y * w + x) * 4] / 255;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = Math.round((-dx / len) * 127.5 + 127.5);
      img.data[i + 1] = Math.round((dy / len) * 127.5 + 127.5);
      img.data[i + 2] = Math.round((1 / len) * 127.5 + 127.5);
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

function texture(canvas, { repeat = true, srgb = false, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

/* ───────── Coberturas ───────── */

/** Marcas horizontais de espátula (lateral do buttercream). */
function streakHeight(size, seed) {
  const n1 = tileNoise(4, seed);
  const n2 = tileNoise(8, seed + 1);
  const r = rng(seed + 2);
  const bands = Array.from({ length: 46 }, () => ({ y: r(), w: 0.004 + r() * 0.02, a: (r() - 0.5) * 0.5, ph: r() * 6.28, wob: r() * 0.006 }));
  // cada linha da textura só consulta as faixas que passam perto dela (dezenas de vezes mais rápido)
  const rows = Array.from({ length: size }, (_, y) => {
    const v = y / size;
    return bands.filter((b) => {
      const d = Math.abs(v - b.y);
      return Math.min(d, 1 - d) < b.w * 3 + b.wob;
    });
  });
  return paintHeight(size, (u, v) => {
    let h = 0.5;
    for (const b of rows[Math.min(size - 1, Math.round(v * size))]) {
      const yy = b.y + Math.sin(u * 6.2832 + b.ph) * b.wob;
      let d = Math.abs(v - yy);
      d = Math.min(d, 1 - d);
      if (d < b.w * 3) h += b.a * Math.exp(-(d * d) / (b.w * b.w));
    }
    // o ruído é esticado na horizontal: a espátula arrasta o creme em volta do bolo
    h += (n1(u, v * 6) - 0.5) * 0.16 + (n2(u, v * 10) - 0.5) * 0.08;
    return h;
  });
}

/** Espiral suave de bailarina (topo de bolos redondos). */
function swirlHeight(size, seed) {
  const n = tileNoise(6, seed);
  return paintHeight(size, (u, v) => {
    const x = u - 0.5;
    const y = v - 0.5;
    const rad = Math.hypot(x, y);
    const ang = Math.atan2(y, x);
    const spiral = Math.sin(rad * 150 - ang * 1 + n(u, v) * 2.2);
    const fine = Math.sin(rad * 420 + ang * 2 + n(v, u) * 4);
    const fade = Math.min(1, rad * 14);
    return 0.5 + (spiral * 0.2 + fine * 0.07) * fade + (n(u * 2, v * 2) - 0.5) * 0.12;
  });
}

/** Ondulações macias (chantilly) ou poros finos (mousse). */
function softHeight(size, seed, pores = false) {
  const n1 = tileNoise(5, seed);
  const n2 = tileNoise(11, seed + 3);
  const n3 = tileNoise(48, seed + 5);
  const n4 = tileNoise(96, seed + 6);
  return paintHeight(size, (u, v) => {
    let h = 0.5 + (n1(u, v) - 0.5) * 0.5 + (n2(u, v) - 0.5) * 0.22;
    if (pores) {
      const p = n3(u, v) * 0.6 + n4(u, v) * 0.4;
      h += (p - 0.5) * 0.35 - Math.max(0, p - 0.72) * 1.4;
    }
    return h;
  });
}

/* ───────── Massa ───────── */

/** Miolo do bolo: claro, com furinhos de ar. Usado como cor (multiplicada pelo sabor) e relevo. */
function crumbCanvas(size, seed) {
  const n1 = tileNoise(6, seed);
  const n2 = tileNoise(20, seed + 1);
  const n3 = tileNoise(64, seed + 2);
  const c = paintHeight(size, (u, v) => 0.86 + (n1(u, v) - 0.5) * 0.12 + (n2(u, v) - 0.5) * 0.1 + (n3(u, v) - 0.5) * 0.1);
  const ctx = c.getContext('2d');
  const r = rng(seed + 9);
  const hole = (x, y, rx, ry, rot, a) => {
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const px = x + ox * size;
        const py = y + oy * size;
        if (px < -12 || py < -12 || px > size + 12 || py > size + 12) continue;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(rot);
        // brilho na borda de baixo dá volume ao furinho
        ctx.fillStyle = `rgba(255,255,255,${a * 0.5})`;
        ctx.beginPath();
        ctx.ellipse(0, ry * 0.45, rx, ry, 0, 0, 6.2832);
        ctx.fill();
        ctx.fillStyle = `rgba(70,45,30,${a})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, 6.2832);
        ctx.fill();
        ctx.restore();
      }
    }
  };
  const k = size / 256;
  for (let i = 0; i < 520; i++) hole(r() * size, r() * size, (0.5 + r() * 1.1) * k, (0.4 + r() * 0.8) * k, r() * 3.14, 0.1 + r() * 0.18);
  for (let i = 0; i < 90; i++) hole(r() * size, r() * size, (1.4 + r() * 2.4) * k, (0.9 + r() * 1.5) * k, r() * 3.14, 0.14 + r() * 0.2);
  for (let i = 0; i < 9; i++) hole(r() * size, r() * size, (3 + r() * 3) * k, (1.6 + r() * 2) * k, r() * 3.14, 0.16 + r() * 0.14);
  return c;
}

/** Casquinha assada (lateral do bolo naked): mais lisa, levemente manchada. */
function crustCanvas(size, seed) {
  const n1 = tileNoise(4, seed);
  const n2 = tileNoise(14, seed + 1);
  const n3 = tileNoise(80, seed + 2);
  return paintHeight(size, (u, v) => {
    const edge = Math.pow(Math.abs(v - 0.5) * 2, 3) * 0.14; // mais dourado junto às bordas da camada
    return 0.9 + (n1(u, v * 3) - 0.5) * 0.16 + (n2(u, v * 2) - 0.5) * 0.1 + (n3(u, v) - 0.5) * 0.12 - edge;
  });
}

/**
 * Creme raspado do bolo naked, para UMA camada de massa (v = 0 e v = 1 são as emendas).
 * A espátula deixa o creme mais grosso junto aos recheios e bem fino no meio da camada,
 * em riscos horizontais longos — nada de manchas soltas.
 */
function scrapeCanvas(size, seed, dense = false) {
  const n1 = tileNoise(2, seed);
  const n2 = tileNoise(5, seed + 1);
  const n3 = tileNoise(11, seed + 2);
  const c = makeCanvas(size, size / 2);
  const h = size / 2;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / h;
      const edge = Math.pow(Math.abs(v * 2 - 1), 2.4); // 0 no meio da camada, 1 nas emendas
      // ruído esticado na horizontal (a espátula corre em volta do bolo)
      const streak = n1(u, v * 3) * 0.5 + n2(u, v * 9) * 0.32 + n3(u, v * 22) * 0.18;
      // semi-naked: bem mais creme, a massa só espia no meio de cada camada
      let a = dense ? 0.8 + edge * 0.2 + (streak - 0.5) * 0.62 : 0.34 + edge * 0.6 + (streak - 0.5) * 0.62;
      a = Math.max(dense ? 0.46 : 0.1, Math.min(dense ? 1 : 0.97, a));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/* ───────── Estilos de acabamento da cobertura ───────── */

/** Riscado no pente: sulcos finos e regulares em volta do bolo. */
function combHeight(size) {
  return paintHeight(8, (u, v) => 0.5 + 0.5 * Math.pow(Math.abs(Math.sin(v * Math.PI * 22)), 0.7), size);
}

/** Espatulado rústico: golpes largos e curvos de espátula, uns por cima dos outros. */
function rusticHeight(size, seed) {
  const r = rng(seed);
  const n1 = tileNoise(6, seed + 4);
  // golpes largos, quase na horizontal (a espátula corre em volta do bolo), levemente em arco
  const strokes = Array.from({ length: 22 }, () => {
    const ang = (r() - 0.5) * 0.7;
    return { x: r(), y: r(), c: Math.cos(ang), s: Math.sin(ang), len: 0.2 + r() * 0.22, w: 0.05 + r() * 0.06, bend: (r() - 0.5) * 1.1, a: 0.5 + r() * 0.5 };
  });
  return paintHeight(size, (u, v) => {
    let h = 0.42 + (n1(u, v) - 0.5) * 0.14;
    for (const k of strokes) {
      // distância (com emenda nas bordas) ao golpe, no eixo dele
      let dx = u - k.x;
      let dy = v - k.y;
      dx -= Math.round(dx);
      dy -= Math.round(dy);
      const along = dx * k.c + dy * k.s;
      if (Math.abs(along) > k.len) continue;
      const across = -dx * k.s + dy * k.c - k.bend * along * along;
      const t = across / k.w;
      if (t < -1.6 || t > 1.6) continue;
      // crista de um lado (o creme empurrado), vale suave do outro
      h += k.a * (Math.exp(-((t - 0.7) ** 2) * 3.2) * 0.3 - Math.exp(-((t + 0.35) ** 2) * 1.6) * 0.16) * Math.pow(1 - (along / k.len) ** 2, 1.5);
    }
    return h;
  });
}

const hexRgb = (hex) => {
  const n = parseInt(String(hex).slice(1), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgba = (hex, a) => {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};
const mixRgb = (a, b, k) => {
  const x = hexRgb(a);
  const y = hexRgb(b);
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
};

/**
 * Pinta a cor da lateral nos estilos de duas cores. A textura dá uma volta inteira no bolo (u) e vai do pé
 * ao topo (v): o alto do <canvas> é o alto do bolo.
 *  ombre     degradê de c1 (embaixo) para c2 (em cima)
 *  listras   faixas verticais alternadas (stripes = quantas de cada cor)
 *  aquarela  manchas largas e translúcidas de c2 sobre c1, como tinta diluída na espátula
 */
export function paintFinish(canvas, style, c1, c2, { stripes = 12, seed = 7, from = 0, to = 1 } = {}) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  ctx.globalAlpha = 1;
  if (style === 'ombre') {
    const g = ctx.createLinearGradient(0, H, 0, 0);
    // from/to: o trecho do degradê que cabe a este andar (num bolo de andares o degradê atravessa o bolo todo)
    const at = (k) => mixRgb(c1, c2, from + (to - from) * k);
    const whole = from <= 0.001 && to >= 0.999;
    g.addColorStop(0, at(0));
    g.addColorStop(whole ? 0.16 : 0, at(0));
    g.addColorStop(0.5, at(0.5));
    g.addColorStop(whole ? 0.86 : 1, at(1));
    g.addColorStop(1, at(1));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    return;
  }
  if (style === 'listras') {
    const n = Math.max(4, stripes) * 2;
    for (let k = 0; k < n; k++) {
      ctx.fillStyle = k % 2 ? c2 : c1;
      ctx.fillRect(Math.round((k * W) / n), 0, Math.ceil(W / n) + 1, H);
    }
    return;
  }
  // aquarela
  ctx.fillStyle = c1;
  ctx.fillRect(0, 0, W, H);
  const r = rng(seed);
  const tones = [c2, c2, mixRgb(c1, c2, 0.55), mixRgb(c2, '#ffffff', 0.45), mixRgb(c2, '#000000', 0.12)];
  for (let i = 0; i < 34; i++) {
    const big = i < 12; // primeiro as lavadas largas, depois pinceladas menores e mais carregadas
    const x = r() * W;
    const y = r() * H;
    const rx = W * (big ? 0.12 + r() * 0.2 : 0.04 + r() * 0.08);
    const ry = H * (big ? 0.16 + r() * 0.3 : 0.07 + r() * 0.14);
    const tone = tones[Math.floor(r() * tones.length)];
    const alpha = big ? 0.3 + r() * 0.3 : 0.4 + r() * 0.4;
    for (const ox of [-W, 0, W]) {
      if (x + ox + rx < 0 || x + ox - rx > W) continue;
      ctx.save();
      ctx.translate(x + ox, y);
      ctx.rotate((r() - 0.5) * 0.5);
      ctx.scale(rx, ry);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, rgba(tone, alpha));
      g.addColorStop(0.55, rgba(tone, alpha * 0.7));
      g.addColorStop(1, rgba(tone, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    }
  }
}

/* ───────── Bases ───────── */

/** Fatia de tronco: anéis de crescimento irregulares e veios. */
function woodCanvas(size) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const r = rng(311);
  const g = ctx.createRadialGradient(size * 0.5, size * 0.5, 0, size * 0.5, size * 0.5, size * 0.72);
  g.addColorStop(0, '#b78a5c');
  g.addColorStop(0.62, '#9c6e42');
  g.addColorStop(0.9, '#7a5230');
  g.addColorStop(1, '#4e3320'); // casca escura na borda da fatia de tronco
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const cx = size * (0.5 + (r() - 0.5) * 0.08);
  const cy = size * (0.5 + (r() - 0.5) * 0.08);
  for (let rad = size * 0.012; rad < size * 0.78; rad += size * (0.006 + r() * 0.012)) {
    ctx.strokeStyle = `rgba(${90 + Math.floor(r() * 30)},${52 + Math.floor(r() * 20)},${24},${0.1 + r() * 0.22})`;
    ctx.lineWidth = size * (0.0015 + r() * 0.004);
    ctx.beginPath();
    const ph = r() * 6.28;
    for (let a = 0; a <= 6.3; a += 0.08) {
      const rr = rad * (1 + 0.03 * Math.sin(a * 3 + ph) + 0.015 * Math.sin(a * 7 + ph * 2));
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr * 0.96;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // rachaduras finas saindo do miolo
  for (let i = 0; i < 5; i++) {
    const a = r() * 6.28;
    ctx.strokeStyle = 'rgba(70,40,18,0.25)';
    ctx.lineWidth = size * 0.002;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * size * 0.02, cy + Math.sin(a) * size * 0.02);
    ctx.lineTo(cx + Math.cos(a + 0.05) * size * (0.2 + r() * 0.3), cy + Math.sin(a + 0.05) * size * (0.2 + r() * 0.3));
    ctx.stroke();
  }
  return c;
}

/** Mármore branco com veios cinzentos. */
function marbleCanvas(size) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const r = rng(733);
  ctx.fillStyle = '#f3f1ee';
  ctx.fillRect(0, 0, size, size);
  // nuvens claras
  for (let i = 0; i < 26; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = size * (0.08 + r() * 0.2);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const tone = r() < 0.5 ? '215,213,214' : '255,255,255';
    g.addColorStop(0, `rgba(${tone},${0.18 + r() * 0.2})`);
    g.addColorStop(1, `rgba(${tone},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const vein = (width, alpha) => {
    let x = r() * size;
    let y = -10;
    let dir = Math.PI / 2 + (r() - 0.5) * 1.2;
    ctx.strokeStyle = `rgba(120,118,124,${alpha})`;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    while (y < size + 10 && x > -20 && x < size + 20) {
      dir += (r() - 0.5) * 0.7;
      dir = Math.max(0.5, Math.min(2.6, dir));
      x += Math.cos(dir) * size * 0.03;
      y += Math.sin(dir) * size * 0.03;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  for (let i = 0; i < 5; i++) vein(size * (0.012 + r() * 0.014), 0.07);
  for (let i = 0; i < 7; i++) vein(size * (0.002 + r() * 0.004), 0.3 + r() * 0.2);
  for (let i = 0; i < 6; i++) vein(size * 0.0012, 0.35);
  return c;
}

/* ───────── Decorações ───────── */

function strawberryCanvases(size) {
  const color = makeCanvas(size);
  const bump = makeCanvas(size);
  const cc = color.getContext('2d');
  const bc = bump.getContext('2d');
  // v = 0 (base da textura) é a ponta do morango; v = 1 é o ombro, junto às folhas.
  const g = cc.createLinearGradient(0, size, 0, 0);
  g.addColorStop(0, '#b3121f');
  g.addColorStop(0.45, '#cf1f2a');
  g.addColorStop(0.8, '#de3a36');
  g.addColorStop(0.94, '#ec8a6c');
  g.addColorStop(1, '#f3d2b0');
  cc.fillStyle = g;
  cc.fillRect(0, 0, size, size);
  bc.fillStyle = '#909090';
  bc.fillRect(0, 0, size, size);
  const cols = 12;
  const rows = 9;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = ((i + (j % 2 ? 0.5 : 0)) / cols) * size;
      const y = ((j + 0.6) / rows) * size * 0.93 + size * 0.05;
      const s = size / 256;
      for (const ox of [-size, 0, size]) {
        // covinha escura em volta da semente
        const rg = bc.createRadialGradient(x + ox, y, 0, x + ox, y, 9 * s);
        rg.addColorStop(0, 'rgba(20,20,20,0.9)');
        rg.addColorStop(1, 'rgba(20,20,20,0)');
        bc.fillStyle = rg;
        bc.fillRect(x + ox - 10 * s, y - 10 * s, 20 * s, 20 * s);
        bc.fillStyle = '#d8d8d8';
        bc.beginPath();
        bc.ellipse(x + ox, y, 2.2 * s, 3.4 * s, 0, 0, 6.2832);
        bc.fill();
        cc.fillStyle = 'rgba(120,10,20,0.35)';
        cc.beginPath();
        cc.ellipse(x + ox, y, 5 * s, 6 * s, 0, 0, 6.2832);
        cc.fill();
        cc.fillStyle = '#f0d27a';
        cc.beginPath();
        cc.ellipse(x + ox, y, 2.1 * s, 3.3 * s, 0, 0, 6.2832);
        cc.fill();
      }
    }
  }
  return { color, bump };
}

/** Vela listrada em espiral, na cor pedida. */
function candleCanvas(hex) {
  const w = 64;
  const h = 64;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fffaf4';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = hex;
  ctx.lineWidth = 15;
  for (let i = -3; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-10, i * 32 + 48);
    ctx.lineTo(w + 10, i * 32 - 26);
    ctx.stroke();
  }
  return c;
}

function radialCanvas(size, stops) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([at, col]) => g.addColorStop(at, col));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/** Chama da vela: gota com miolo claro e base azulada. */
function flameCanvas() {
  const w = 64;
  const h = 128;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(w / 2, 4);
    ctx.bezierCurveTo(w * 0.62, h * 0.3, w * 0.92, h * 0.52, w * 0.86, h * 0.72);
    ctx.bezierCurveTo(w * 0.8, h * 0.96, w * 0.2, h * 0.96, w * 0.14, h * 0.72);
    ctx.bezierCurveTo(w * 0.08, h * 0.52, w * 0.38, h * 0.3, w / 2, 4);
    ctx.closePath();
  };
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,196,84,0.0)');
  g.addColorStop(0.18, 'rgba(255,190,70,0.95)');
  g.addColorStop(0.6, 'rgba(255,214,110,1)');
  g.addColorStop(0.86, 'rgba(255,150,60,0.95)');
  g.addColorStop(1, 'rgba(90,140,255,0.7)');
  ctx.fillStyle = g;
  ctx.shadowColor = 'rgba(255,170,60,0.9)';
  ctx.shadowBlur = 6;
  path();
  ctx.fill();
  ctx.shadowBlur = 0;
  const core = ctx.createRadialGradient(w / 2, h * 0.68, 1, w / 2, h * 0.62, w * 0.34);
  core.addColorStop(0, 'rgba(255,255,244,1)');
  core.addColorStop(0.6, 'rgba(255,246,200,0.85)');
  core.addColorStop(1, 'rgba(255,230,150,0)');
  ctx.fillStyle = core;
  path();
  ctx.fill();
  return c;
}

/** Desenhos já calculados nesta sessão (por tamanho): reabrir o personalizador não refaz nenhum. */
const DRAWN = new Map();

/**
 * Conjunto de texturas de uma cena. Cada textura é criada na primeira vez que é pedida
 * e todas são liberadas em dispose(). size = lado das texturas maiores (256 no celular, 512 no computador).
 */
export function createTextureKit({ aniso = 4, small = false, size = 0 } = {}) {
  const cache = new Map();
  const S = size || (small ? 256 : 512);
  const get = (key, make) => {
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key);
  };
  const drawn = (key, make) => {
    const k = `${key}|${S}`;
    if (!DRAWN.has(k)) DRAWN.set(k, make());
    return DRAWN.get(k);
  };
  const kit = {
    streakNormal: () => get('streak', () => texture(drawn('streak', () => heightToNormal(streakHeight(S, 11), 2.4)), { aniso })),
    // a espiral do topo é suave: no celular metade do tamanho basta (um quarto do tempo para desenhar)
    swirlNormal: () => get('swirl', () => texture(drawn('swirl', () => heightToNormal(swirlHeight(S >= 512 ? S : S / 2, 23), 2.2, false)), { repeat: false, aniso })),
    softNormal: () => get('soft', () => texture(drawn('soft', () => heightToNormal(softHeight(S / 2, 31), 2.2)), { aniso })),
    poreNormal: () => get('pore', () => texture(drawn('pore', () => heightToNormal(softHeight(S, 47, true), 2.6)), { aniso })),
    crumb: () => get('crumb', () => texture(drawn('crumb', () => crumbCanvas(S, 5)), { srgb: true, aniso })),
    crumbBump: () => get('crumbBump', () => texture(drawn('crumb', () => crumbCanvas(S, 5)), { aniso })),
    crust: () => get('crust', () => texture(drawn('crust', () => crustCanvas(S / 2, 71)), { srgb: true, aniso })),
    scrape: () => get('scrape', () => texture(drawn('scrape', () => scrapeCanvas(S, 83)), { srgb: true, aniso })),
    scrapeDense: () => get('scrapeDense', () => texture(drawn('scrapeDense', () => scrapeCanvas(S, 83, true)), { srgb: true, aniso })),
    combNormal: () => get('comb', () => texture(drawn('comb', () => heightToNormal(combHeight(S), 3.2)), { aniso })),
    rusticNormal: () => get('rustic', () => texture(drawn('rustic', () => heightToNormal(rusticHeight(S, 57), 3)), { aniso })),
    wood: () => get('wood', () => texture(drawn('wood', () => woodCanvas(S)), { repeat: false, srgb: true, aniso })),
    marble: () => get('marble', () => texture(drawn('marble', () => marbleCanvas(S)), { repeat: false, srgb: true, aniso })),
    glitterNormal: () =>
      get('glitter', () =>
        texture(
          drawn('glitter', () => {
            const r = rng(97);
            return heightToNormal(paintHeight(128, () => r()), 1.6);
          }),
          { aniso },
        ),
      ),
    strawberry: () =>
      get('strawberry', () => {
        const { color, bump } = drawn('strawberry', () => strawberryCanvases(S >= 512 ? 256 : 128));
        return { map: texture(color, { srgb: true, aniso }), bump: texture(bump, { aniso }) };
      }),
    candle: (hex) => get(`candle${hex}`, () => texture(drawn(`candle${hex}`, () => candleCanvas(hex)), { srgb: true, aniso })),
    flame: () => get('flame', () => texture(drawn('flame', flameCanvas), { repeat: false, srgb: true })),
    glow: () =>
      get('glow', () =>
        texture(
          drawn('glow', () =>
            radialCanvas(128, [
              [0, 'rgba(255,214,140,0.9)'],
              [0.25, 'rgba(255,180,90,0.35)'],
              [1, 'rgba(255,160,60,0)'],
            ]),
          ),
          { repeat: false, srgb: true },
        ),
      ),
    contactShadow: () =>
      get('contact', () =>
        texture(
          drawn('contact', () =>
            radialCanvas(128, [
              [0, 'rgba(255,255,255,1)'],
              [0.35, 'rgba(255,255,255,0.75)'],
              [0.7, 'rgba(255,255,255,0.22)'],
              [1, 'rgba(255,255,255,0)'],
            ]),
          ),
          { repeat: false },
        ),
      ),
    /** Sombra do bolo sobre o prato: cheia por baixo do bolo e sumindo logo depois da borda dele. */
    plateShadow: () =>
      get('plateShadow', () =>
        texture(
          drawn('plateShadow', () =>
            radialCanvas(128, [
              [0, 'rgba(255,255,255,1)'],
              [0.7, 'rgba(255,255,255,1)'],
              [0.8, 'rgba(255,255,255,0.62)'],
              [0.9, 'rgba(255,255,255,0.2)'],
              [1, 'rgba(255,255,255,0)'],
            ]),
          ),
          { repeat: false },
        ),
      ),
    /** Sombra projetada no chão: mancha bem macia, sem borda (parecida com uma curva de sino). */
    softShadow: () =>
      get('softShadow', () =>
        texture(
          drawn('softShadow', () =>
            radialCanvas(128, [
              [0, 'rgba(255,255,255,1)'],
              [0.18, 'rgba(255,255,255,0.9)'],
              [0.36, 'rgba(255,255,255,0.62)'],
              [0.54, 'rgba(255,255,255,0.33)'],
              [0.72, 'rgba(255,255,255,0.13)'],
              [0.88, 'rgba(255,255,255,0.03)'],
              [1, 'rgba(255,255,255,0)'],
            ]),
          ),
          { repeat: false },
        ),
      ),
    /** Textura criada fora do kit (ex.: plaquinha) mas liberada junto com ele. */
    adopt(key, tex) {
      cache.get(key)?.dispose?.();
      cache.set(key, tex);
      return tex;
    },
    /** Tarefas para adiantar, uma por vez, quando o aparelho estiver ocioso (evita engasgo na primeira escolha). */
    warmups() {
      return [kit.softNormal, kit.swirlNormal, kit.poreNormal, kit.streakNormal, kit.crumb, kit.crust, kit.scrape, kit.strawberry].map((fn) => () => void fn());
    },
    dispose() {
      cache.forEach((t) => {
        if (t?.isTexture) t.dispose();
        else if (t && typeof t === 'object') Object.values(t).forEach((x) => x?.dispose?.());
      });
      cache.clear();
    },
  };
  return kit;
}

export { makeCanvas, texture };
