// BOLAB — texturas procedurais do personalizador (tudo desenhado em <canvas>, sem arquivos externos).
import * as THREE from 'three';
import { LAYER_CM, FILLING_CM } from '../data/customizer.js';

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

/**
 * Lateral de um disco de massa assada (bolo naked), numa tira 4 × 1: uma volta de ~4 alturas de camada por
 * 1 altura. Devolve { map, bump }: tons (multiplicam a cor da massa) e relevo.
 * É miolo à mostra, não tábua: poros redondos de tamanhos variados, migalha fina, manchas de forno, e a
 * casquinha — uma faixa mais escura e lisa em cima (onde a massa dourou) e um filete embaixo (o fundo da fôrma).
 */
function crustCanvases(h, seed) {
  const w = h * 4;
  const r = rng(seed);
  const map = makeCanvas(w, h);
  const bump = makeCanvas(w, h);
  const g = map.getContext('2d');
  const gb = bump.getContext('2d');
  g.fillStyle = '#dedede';
  g.fillRect(0, 0, w, h);
  gb.fillStyle = '#9a9a9a';
  gb.fillRect(0, 0, w, h);
  // manchas de forno: áreas um pouco mais claras e mais escuras (com emenda na horizontal)
  const blot = (ctx, x, y, rad, tone, alpha) => {
    for (const dx of [-w, 0, w]) {
      const gr = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, rad);
      gr.addColorStop(0, `rgba(${tone},${alpha})`);
      gr.addColorStop(1, `rgba(${tone},0)`);
      ctx.fillStyle = gr;
      ctx.fillRect(x + dx - rad, y - rad, rad * 2, rad * 2);
    }
  };
  for (let i = 0; i < 46; i++) blot(g, r() * w, r() * h, h * (0.18 + r() * 0.4), r() < 0.5 ? '255,255,255' : '120,120,120', 0.1 + r() * 0.12);
  // poros: furinhos escuros de vários tamanhos, um pouco achatados (a massa cresce para cima), com a beira clara
  const pore = (x, y, rad, depth) => {
    const sq = 0.65 + r() * 0.5;
    const rot = (r() - 0.5) * 0.8;
    for (const dx of [-w, 0, w]) {
      g.fillStyle = `rgba(70,70,70,${depth})`;
      g.beginPath();
      g.ellipse(x + dx, y, rad, rad * sq, rot, 0, 6.3);
      g.fill();
      g.fillStyle = `rgba(255,255,255,${depth * 0.35})`;
      g.beginPath();
      g.ellipse(x + dx + rad * 0.25, y + rad * 0.3, rad * 0.8, rad * sq * 0.6, rot, 0, 6.3);
      g.fill();
      gb.fillStyle = `rgba(20,20,20,${Math.min(1, depth * 1.6)})`;
      gb.beginPath();
      gb.ellipse(x + dx, y, rad, rad * sq, rot, 0, 6.3);
      gb.fill();
    }
  };
  for (let i = 0; i < 520; i++) {
    const big = r() < 0.07;
    pore(r() * w, h * (0.1 + r() * 0.8), h * (big ? 0.035 + r() * 0.03 : 0.008 + r() * r() * 0.022), big ? 0.34 + r() * 0.2 : 0.2 + r() * 0.3);
  }
  // migalha fina: granulado pixel a pixel (tons e relevo)
  const noise = (ctx, amount) => {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (r() - 0.5) * amount;
      d[i] = Math.max(0, Math.min(255, d[i] + n));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    }
    ctx.putImageData(img, 0, 0);
  };
  noise(g, 34);
  noise(gb, 60);
  // casquinha: em cima (topo assado) larga e de beira irregular; embaixo (fundo da fôrma) um filete
  const skin = (top) => {
    const base = top ? 0.16 : 0.07;
    const ph = [r() * 6.28, r() * 6.28, r() * 6.28];
    for (let x = 0; x < w; x += 2) {
      const a = (x / w) * 6.2832;
      const k = base * (0.7 + 0.22 * Math.sin(a * 3 + ph[0]) + 0.14 * Math.sin(a * 7 + ph[1]) + 0.1 * Math.sin(a * 17 + ph[2]));
      const y0 = top ? 0 : h * (1 - k);
      const gr = g.createLinearGradient(0, top ? 0 : h, 0, top ? h * k : h * (1 - k));
      gr.addColorStop(0, `rgba(96,84,74,${top ? 0.86 : 0.7})`);
      gr.addColorStop(0.55, `rgba(120,104,90,${top ? 0.5 : 0.35})`);
      gr.addColorStop(1, 'rgba(140,120,100,0)');
      g.fillStyle = gr;
      g.fillRect(x, y0, 2, h * k);
      // a casca é mais lisa que o miolo: o relevo dos poros some ali
      const gr2 = gb.createLinearGradient(0, top ? 0 : h, 0, top ? h * k : h * (1 - k));
      gr2.addColorStop(0, 'rgba(170,170,170,0.95)');
      gr2.addColorStop(1, 'rgba(154,154,154,0)');
      gb.fillStyle = gr2;
      gb.fillRect(x, y0, 2, h * k);
    }
  };
  skin(true);
  skin(false);
  return { map, bump };
}

/**
 * Véu de creme raspado sobre a lateral inteira de um andar naked (alfa): v vai do pé ao alto das massas.
 * n = número de camadas de massa (diz onde ficam os discos e os recheios nessa altura).
 *  · naked: quase nada — restos de creme junto dos recheios, puxados pela espátula por cima das massas, e
 *    umas manchas ralas no meio dos discos;
 *  · semi-naked (dense): uma película fina e desigual cobre tudo; a massa aparece por baixo em manchas
 *    alongadas, onde a espátula raspou mais (sempre no meio dos discos, nunca sobre o recheio).
 */
function scrapeFilmCanvas(size, seed, n, dense, single) {
  const n1 = tileNoise(3, seed);
  const n2 = tileNoise(7, seed + 1);
  const n3 = tileNoise(19, seed + 2);
  const n4 = tileNoise(41, seed + 3);
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  // alturas (em fração do andar) de cada disco de massa
  const L = single ? 1 : LAYER_CM;
  const F = FILLING_CM;
  const H = single ? 1 : n * L + (n - 1) * F;
  const discs = Array.from({ length: single ? 1 : n }, (_, i) => [(i * (L + F)) / H, (i * (L + F) + L) / H]);
  const sm = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let y = 0; y < size; y++) {
    const v = 1 - y / size; // a linha de cima da textura é o alto do andar
    let k = -1; // posição dentro do disco: 0 = meio, 1 = beira (junto do recheio); −1 = faixa de recheio
    let rel = 0.5;
    for (const [a, b] of discs) {
      if (v >= a && v <= b) {
        rel = (v - a) / (b - a);
        k = Math.abs(rel * 2 - 1);
      }
    }
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // ruído esticado na horizontal: a espátula corre em volta do bolo
      const streak = n1(u, v * 2.2) * 0.45 + n2(u, v * 7) * 0.3 + n3(u, v * 26) * 0.17 + n4(u * 2, v * 60) * 0.08;
      // riscos finos da espátula arrastando o creme (bem esticados em volta do bolo)
      const drag = n4(u * 2, v * 110) * 0.6 + n3(u * 3, v * 70) * 0.4;
      const lines = sm(0.3, 0.62, drag);
      let a;
      if (dense) {
        if (k < 0) a = 0.96 + (streak - 0.5) * 0.08; // sobre o recheio: creme cheio
        else {
          // manchas raspadas, de beira nítida: onde o ruído largo passa do limiar, a película some e a massa aparece
          const bare = sm(0.53, 0.6, n1(u * 1.0 + 0.3, v * 1.6 + 0.7) * 0.5 + n2(u, v * 3.2) * 0.36 + n3(u, v * 30) * 0.14 + (1 - k) * 0.16 + (drag - 0.5) * 0.09);
          const film = 0.7 + 0.26 * lines + (streak - 0.5) * 0.2;
          a = film * (1 - bare * 0.94) + sm(0.78, 1, k) * 0.3;
        }
        a = Math.max(0.03, Math.min(1, a));
      } else {
        if (k < 0) a = 0; // o próprio recheio aparece
        else {
          // resto de creme junto do recheio, arrastado pela espátula; no meio do disco só umas manchas soltas.
          // Beira nítida (creme é opaco: ou tem, ou não tem), nunca um anel contínuo nem uma névoa.
          const near = sm(0.3, 1, k);
          const body = n2(u, v * 9) * 0.5 + n3(u, v * 34) * 0.32 + n1(u, v * 2.2) * 0.18;
          const thr = 0.64 - near * 0.3;
          const cover = sm(thr, thr + 0.06, body + (drag - 0.5) * 0.16);
          a = cover * (0.45 + 0.55 * lines) * (0.55 + 0.45 * near);
        }
        a = Math.max(0, Math.min(0.94, a));
      }
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * Frutas à mostra no corte de um recheio (atlas 2 × 1, com transparência):
 * esquerda = fatia de morango cortado ao meio (casca vermelha, miolo claro com as fibras) · direita = framboesa.
 */
function fruitCanvas(size) {
  const c = makeCanvas(size * 2, size);
  const g = c.getContext('2d');
  const r = rng(977);
  // morango: gota deitada (a fatia fica "de pé" no recheio), ponta para baixo
  g.save();
  g.translate(size * 0.5, size * 0.5);
  const s = size * 0.46;
  const heart = (k) => {
    g.beginPath();
    g.moveTo(0, s * 0.96 * k);
    g.bezierCurveTo(-s * 1.0 * k, s * 0.35 * k, -s * 0.98 * k, -s * 0.78 * k, -s * 0.34 * k, -s * 0.9 * k);
    g.bezierCurveTo(-s * 0.12 * k, -s * 0.96 * k, s * 0.12 * k, -s * 0.96 * k, s * 0.34 * k, -s * 0.9 * k);
    g.bezierCurveTo(s * 0.98 * k, -s * 0.78 * k, s * 1.0 * k, s * 0.35 * k, 0, s * 0.96 * k);
    g.closePath();
  };
  heart(1);
  g.fillStyle = '#c4182c';
  g.fill();
  const flesh = g.createRadialGradient(0, -s * 0.1, 0, 0, 0, s * 0.95);
  flesh.addColorStop(0, '#ffd2cc');
  flesh.addColorStop(0.22, '#f58a88');
  flesh.addColorStop(0.6, '#e0424f');
  flesh.addColorStop(1, '#c41c2e');
  heart(0.88);
  g.fillStyle = flesh;
  g.fill();
  // fibras claras do miolo até a casca
  g.strokeStyle = 'rgba(255,226,220,0.4)';
  g.lineWidth = size * 0.012;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * 6.283 + r() * 0.2;
    g.beginPath();
    g.moveTo(Math.cos(a) * s * 0.12, -s * 0.1 + Math.sin(a) * s * 0.14);
    g.lineTo(Math.cos(a) * s * 0.62, -s * 0.02 + Math.sin(a) * s * 0.66);
    g.stroke();
  }
  // miolo oco, claro
  g.fillStyle = 'rgba(255,244,238,0.85)';
  g.beginPath();
  g.ellipse(0, -s * 0.12, s * 0.07, s * 0.2, 0, 0, 6.3);
  g.fill();
  g.restore();
  // framboesa: bagas redondas juntas, vinho
  g.save();
  g.translate(size * 1.5, size * 0.5);
  for (let i = 0; i < 26; i++) {
    const a = r() * 6.283;
    const d = Math.sqrt(r()) * size * 0.34;
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d * 0.82;
    const rad = size * (0.075 + r() * 0.03);
    const gr = g.createRadialGradient(x - rad * 0.3, y - rad * 0.3, 0, x, y, rad);
    gr.addColorStop(0, '#ef5f7c');
    gr.addColorStop(0.5, '#c21d46');
    gr.addColorStop(1, '#7c0f2c');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, rad, 0, 6.3);
    g.fill();
  }
  g.restore();
  return c;
}

/* ───────── Estilos de acabamento da cobertura ───────── */

/** Riscado no pente: sulcos finos e regulares em volta do bolo. */
function combHeight(size) {
  return paintHeight(8, (u, v) => 0.5 + 0.5 * Math.pow(Math.abs(Math.sin(v * Math.PI * 22)), 0.7), size);
}

/** Espatulado rústico: golpes largos e curvos de espátula, uns por cima dos outros. */
/**
 * Mapa de normais direto de uma função de altura (sem passar por 8 bits): relevo fino sem "degraus".
 * f(u, v) → altura 0…1, com emenda nas bordas.
 */
function normalFromHeight(size, f, strength = 2) {
  const hgt = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) hgt[y * size + x] = f(x / size, y / size);
  const out = makeCanvas(size);
  const ctx = out.getContext('2d');
  const img = ctx.createImageData(size, size);
  const at = (x, y) => hgt[((y + size) % size) * size + ((x + size) % size)];
  // a inclinação é medida em "alturas por 1/256 do azulejo": o relevo fica igual em qualquer resolução
  const k = (strength * size) / 256;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * k;
      const dy = (at(x, y + 1) - at(x, y - 1)) * k;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = Math.round((-dx / len) * 127.5 + 127.5);
      img.data[i + 1] = Math.round((dy / len) * 127.5 + 127.5);
      img.data[i + 2] = Math.round((1 / len) * 127.5 + 127.5);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/**
 * Espatulado rústico: creme puxado com a ponta da espátula. Cada golpe é curto (3 a 6 cm), quase na horizontal,
 * deixa um fundo liso e levemente inclinado e um cordãozinho de creme na borda por onde a lâmina saiu. Os golpes
 * se sobrepõem na ordem em que foram dados — o mais novo apaga o que estava embaixo —, por isso o relevo é baixo,
 * cheio de bordas curtas e nítidas, e não de dobras compridas (que lembrariam tecido).
 * O azulejo cobre 16 cm de cobertura.
 */
function rusticHeight(seed) {
  const r = rng(seed);
  const n1 = tileNoise(5, seed + 4);
  const strokes = Array.from({ length: 64 }, () => {
    // quase todos em volta do bolo, em arco suave; um ou outro enviesado, como quem ajeita um canto
    const ang = (r() - 0.5) * 0.4 + (r() < 0.12 ? (r() < 0.5 ? 1 : -1) * (0.35 + r() * 0.4) : 0) + (r() < 0.5 ? Math.PI : 0);
    return {
      x: r(),
      y: r(),
      c: Math.cos(ang),
      s: Math.sin(ang),
      len: 0.13 + r() * r() * 0.2, // meia-comprimento: golpes de 4 a 10 cm, a maioria curtos
      w: 0.042 + r() * 0.03, // meia-largura: a ponta da lâmina marca de 1,3 a 2,3 cm
      bend: (r() - 0.5) * 1.1, // o pulso gira: o golpe sai em arco
      base: 0.41 + r() * 0.09,
      tilt: (r() - 0.5) * 0.06, // a lâmina nunca fica paralela ao bolo
      rise: 0.015 + r() * 0.035, // o creme vai juntando até a saída
      lip: 0.08 + r() * 0.1, // altura do cordão que sobra na beira da lâmina
      side: r() < 0.5 ? 1 : -1, // de que lado a lâmina deixou mais creme
      tail: r() < 0.3 ? 0.5 + r() * 0.5 : 0, // alguns golpes terminam num montinho (a lâmina levanta de vez)
      drag: 9 + r() * 9,
      ph: r() * 6.28,
    };
  });
  // grade de busca: cada célula sabe que golpes passam por ela (na ordem em que foram dados)
  const G = 8;
  const cells = Array.from({ length: G * G }, () => []);
  strokes.forEach((k, idx) => {
    const reach = k.len * 1.3 + k.w * 1.5 + 0.02;
    const x0 = Math.floor((k.x - reach) * G);
    const x1 = Math.floor((k.x + reach) * G);
    const y0 = Math.floor((k.y - reach) * G);
    const y1 = Math.floor((k.y + reach) * G);
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const cell = cells[(((gy % G) + G) % G) * G + (((gx % G) + G) % G)];
        if (cell[cell.length - 1] !== idx) cell.push(idx);
      }
    }
  });
  const sm = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  return (u, v) => {
    let h = 0.5 + (n1(u, v) - 0.5) * 0.05;
    const cell = cells[Math.min(G - 1, Math.floor(v * G)) * G + Math.min(G - 1, Math.floor(u * G))];
    for (let n = 0; n < cell.length; n++) {
      const k = strokes[cell[n]];
      let dx = u - k.x;
      let dy = v - k.y;
      dx -= Math.round(dx);
      dy -= Math.round(dy);
      const a = dx * k.c + dy * k.s;
      const q = a / k.len;
      if (q < -1.25 || q > 1.3) continue;
      const c = (-dx * k.s + dy * k.c - k.bend * a * a) / k.w;
      const ac = Math.abs(c);
      if (ac > 2.2) continue;
      // montinho na saída de alguns golpes (a lâmina levanta de vez e larga o creme que vinha juntando)
      if (k.tail) h += k.lip * 0.8 * k.tail * Math.exp(-(((q - 0.9) / 0.085) ** 2) - (c * 1.25) ** 2);
      if (ac > 1.45) continue;
      const aq = Math.abs(q);
      // o golpe afina nas duas pontas (a lâmina pousa e sai aos poucos): no meio tem a largura toda
      const body = Math.pow(Math.max(0, 1 - Math.pow(aq, 3)), 0.6);
      if (body <= 0.02) continue;
      const cc = ac / body; // 1 = beira do golpe
      if (cc > 1.4) continue;
      // cordão de creme ao longo da beira da lâmina: alto de um lado, baixinho do outro, sumindo nas pontas
      const sideK = c * k.side > 0 ? 1 : 0.3;
      const along = Math.pow(body, 1.5) * (0.75 + 0.25 * Math.sin(q * 5 + k.ph));
      const cord = k.lip * sideK * along * Math.exp(-(((cc - 1.02) / 0.13) ** 2));
      if (cc >= 1) {
        h += cord; // por fora, o creme empurrado fica por cima do que já estava ali
        continue;
      }
      // fundo do golpe: liso, de leve cavado pela ponta arredondada da lâmina, com os fiozinhos do arrasto
      const floor = k.base - 0.018 * (1 - c * c) + k.tilt * c + k.rise * q + 0.005 * Math.sin(c * k.drag + k.ph);
      // nas pontas o golpe se funde ao que estava embaixo; ao longo do cordão a borda é nítida
      const mix = sm(1, 0.9, cc) * sm(1.05, 0.55, aq);
      h = h + cord + (floor - h) * mix;
    }
    return h;
  };
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

/**
 * Fatia de tronco (tábua redonda): anéis de crescimento em volta de um miolo fora do centro, alburno mais claro
 * perto da beira, um par de rachaduras e a casca escura em volta. A fatia ocupa o círculo de raio 0,42 da
 * textura; o resto é casca — é o que a lateral da tábua mostra.
 */
function woodCanvas(size) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const r = rng(311);
  // casca: marrom-escuro com estrias (cobre a lateral da tábua e o anel de fora da fatia)
  ctx.fillStyle = '#4b3324';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 240; i++) {
    ctx.strokeStyle = `rgba(${r() < 0.55 ? '26,17,11' : '122,92,66'},${0.1 + r() * 0.22})`;
    ctx.lineWidth = size * (0.002 + r() * 0.006);
    const x = r() * size;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (r() - 0.5) * size * 0.03, size);
    ctx.stroke();
  }
  const cx = size * 0.5;
  const cy = size * 0.5;
  const R = size * 0.42 * 0.965; // raio da madeira (o que sobra até 0,42 é a casca: um filete)
  const pith = { x: cx + (r() - 0.5) * size * 0.08, y: cy + (r() - 0.5) * size * 0.08 }; // o miolo nunca fica bem no meio
  const wob = [r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28];
  // anel k (0 = miolo, 1 = beira da madeira): vai do miolo deslocado até o contorno da fatia, sempre meio torto
  const ring = (k) => {
    ctx.beginPath();
    for (let a = 0; a <= 6.3; a += 0.045) {
      const rad = R * k * (1 + 0.02 * Math.sin(a * 3 + wob[0]) + 0.012 * Math.sin(a * 5 + wob[1]) + 0.01 * k * Math.sin(a * 11 + wob[2] + k * 6));
      const x = pith.x + (cx - pith.x) * k + Math.cos(a) * rad;
      const y = pith.y + (cy - pith.y) * k + Math.sin(a) * rad;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  // madeira: cerne mais quente no meio, alburno claro na beira
  const g = ctx.createRadialGradient(pith.x, pith.y, 0, cx, cy, R);
  g.addColorStop(0, '#a9753f');
  g.addColorStop(0.45, '#b98850');
  g.addColorStop(0.78, '#c79c64');
  g.addColorStop(1, '#dab686');
  ring(1);
  ctx.fillStyle = g;
  ctx.fill();
  // anéis de crescimento: muitos, de espessura e força irregulares (anos bons e anos ruins)
  for (let k = 0.035; k < 0.99; k += 0.011 + r() * 0.02) {
    ring(k);
    const late = r() < 0.22; // lenho tardio: anel mais grosso e escuro
    ctx.strokeStyle = `rgba(104,66,32,${late ? 0.55 + r() * 0.2 : 0.2 + r() * 0.26})`;
    ctx.lineWidth = size * (late ? 0.004 + r() * 0.003 : 0.0014 + r() * 0.002);
    ctx.stroke();
  }
  // raios e rachaduras saindo do miolo
  for (let i = 0; i < 7; i++) {
    const a = r() * 6.28;
    const k1 = 0.35 + r() * 0.6;
    ctx.strokeStyle = `rgba(74,44,20,${0.18 + r() * 0.2})`;
    ctx.lineWidth = size * (0.0012 + r() * 0.0018);
    ctx.beginPath();
    ctx.moveTo(pith.x + Math.cos(a) * R * 0.03, pith.y + Math.sin(a) * R * 0.03);
    ctx.lineTo(pith.x + (cx - pith.x) * k1 + Math.cos(a + 0.03) * R * k1, pith.y + (cy - pith.y) * k1 + Math.sin(a + 0.03) * R * k1);
    ctx.stroke();
  }
  // uma rachadura de secagem (cunha escura do meio para a beira)
  const ca = wob[3];
  ctx.fillStyle = 'rgba(58,34,16,0.78)';
  ctx.beginPath();
  ctx.moveTo(pith.x + Math.cos(ca) * R * 0.12, pith.y + Math.sin(ca) * R * 0.12);
  ctx.lineTo(cx + Math.cos(ca - 0.014) * R * 0.99, cy + Math.sin(ca - 0.014) * R * 0.99);
  ctx.lineTo(cx + Math.cos(ca + 0.014) * R * 0.99, cy + Math.sin(ca + 0.014) * R * 0.99);
  ctx.closePath();
  ctx.fill();
  // miolo
  ctx.fillStyle = 'rgba(86,52,24,0.75)';
  ctx.beginPath();
  ctx.arc(pith.x, pith.y, size * 0.008, 0, 6.3);
  ctx.fill();
  // câmbio: a linha escura entre a madeira e a casca
  ring(1);
  ctx.strokeStyle = 'rgba(52,32,18,0.8)';
  ctx.lineWidth = size * 0.007;
  ctx.stroke();
  return c;
}

/** Tábua de ripas (bases quadradas e retangulares): quatro ripas coladas, veio corrido e um ou dois nós. */
function plankCanvas(size) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const r = rng(419);
  const tones = ['#c39a66', '#b98c58', '#caa372', '#bd9160'];
  const n = 4;
  const ph = size / n;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = tones[i % tones.length];
    ctx.fillRect(0, i * ph, size, ph + 1);
    // veio: linhas corridas, de leve onduladas, que se abrem em volta dos nós
    const knot = r() < 0.6 ? { x: size * (0.15 + r() * 0.7), y: (i + 0.25 + r() * 0.5) * ph, rad: size * (0.012 + r() * 0.012) } : null;
    for (let k = 0; k < 34; k++) {
      const y0 = i * ph + ((k + r() * 0.8) / 34) * ph;
      const amp = size * (0.002 + r() * 0.004);
      const f = 1.5 + r() * 2.5;
      const p0 = r() * 6.28;
      ctx.strokeStyle = `rgba(110,72,38,${0.1 + r() * 0.26})`;
      ctx.lineWidth = size * (0.0012 + r() * 0.0022);
      ctx.beginPath();
      for (let x = 0; x <= size; x += size / 64) {
        let y = y0 + amp * Math.sin((x / size) * f * 6.28 + p0);
        if (knot) {
          const dx = x - knot.x;
          const dy = y - knot.y;
          y += (Math.sign(dy) || 1) * knot.rad * 2.2 * Math.exp(-(dx * dx) / (knot.rad * knot.rad * 22)) * Math.exp(-Math.abs(dy) / (knot.rad * 5));
        }
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    if (knot) {
      const kg = ctx.createRadialGradient(knot.x, knot.y, 0, knot.x, knot.y, knot.rad * 1.5);
      kg.addColorStop(0, 'rgba(70,42,20,0.9)');
      kg.addColorStop(0.6, 'rgba(96,60,30,0.7)');
      kg.addColorStop(1, 'rgba(96,60,30,0)');
      ctx.fillStyle = kg;
      ctx.beginPath();
      ctx.ellipse(knot.x, knot.y, knot.rad * 1.7, knot.rad, 0, 0, 6.3);
      ctx.fill();
    }
  }
  // emendas entre as ripas
  for (let i = 1; i < n; i++) {
    ctx.fillStyle = 'rgba(62,38,18,0.6)';
    ctx.fillRect(0, i * ph - size * 0.0025, size, size * 0.005);
    ctx.fillStyle = 'rgba(255,236,208,0.16)';
    ctx.fillRect(0, i * ph + size * 0.0025, size, size * 0.003);
  }
  return c;
}

/**
 * Mármore branco (tipo carrara): fundo frio com nuvens cinzentas e veios que se leem de longe — três ou quatro
 * veios fortes na diagonal, cada um com um halo esfumado e ramos finos que se soltam dele, e uma rede de
 * fiozinhos claros por trás.
 */
function marbleCanvas(size) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const r = rng(733);
  ctx.fillStyle = '#f4f3f1';
  ctx.fillRect(0, 0, size, size);
  // nuvens: manchas largas cinza-azuladas e brancas
  for (let i = 0; i < 30; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = size * (0.1 + r() * 0.24);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const tone = r() < 0.6 ? '196,199,208' : '255,255,255';
    g.addColorStop(0, `rgba(${tone},${0.16 + r() * 0.2})`);
    g.addColorStop(1, `rgba(${tone},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // um veio: caminho quebradiço numa direção geral; devolve os pontos (os ramos nascem deles)
  const walk = (x, y, dir, steps, wander) => {
    const pts = [[x, y]];
    let d = dir;
    for (let i = 0; i < steps; i++) {
      d += (r() - 0.5) * wander;
      d = dir + Math.max(-0.7, Math.min(0.7, d - dir));
      const step = size * (0.018 + r() * 0.03);
      x += Math.cos(d) * step;
      y += Math.sin(d) * step;
      pts.push([x, y]);
    }
    return pts;
  };
  const stroke = (pts, width, color, alpha) => {
    ctx.strokeStyle = `rgba(${color},${alpha})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  };
  const main = 0.9 + r() * 0.35; // direção geral dos veios (diagonal)
  for (let i = 0; i < 6; i++) {
    // nascem fora do quadro e atravessam a placa inteira
    const t = (i + 0.2 + r() * 0.6) / 6;
    const pts = walk(size * (t * 1.5 - 0.45), -size * 0.05, main + (r() - 0.5) * 0.3, 40, 0.75);
    const w = size * (0.006 + r() * 0.006);
    stroke(pts, w * 7, '150,154,166', 0.05);
    stroke(pts, w * 3.2, '128,132,146', 0.1);
    stroke(pts, w, '78,82,96', 0.78);
    // ramos: saem do veio em ângulo fechado e afinam
    for (let k = 0; k < 5; k++) {
      const from = pts[3 + Math.floor(r() * (pts.length - 6))];
      const side = r() < 0.5 ? 1 : -1;
      const branch = walk(from[0], from[1], main + side * (0.45 + r() * 0.5), 6 + Math.floor(r() * 9), 0.8);
      stroke(branch, w * 1.8, '140,144,156', 0.08);
      stroke(branch, w * (0.3 + r() * 0.3), '90,94,108', 0.62);
    }
  }
  // rede de fiozinhos claros, em todas as direções
  for (let i = 0; i < 16; i++) {
    const pts = walk(r() * size, r() * size, r() * 6.28, 6 + Math.floor(r() * 10), 1.1);
    stroke(pts, size * (0.0012 + r() * 0.0016), '120,124,138', 0.22 + r() * 0.2);
  }
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
    crust: () => get('crust', () => texture(drawn('crust', () => crustCanvases(S / 2, 71)).map, { srgb: true, aniso })),
    crustBump: () => get('crustBump', () => texture(drawn('crust', () => crustCanvases(S / 2, 71)).bump, { aniso })),
    /** Véu de creme raspado do andar naked (n camadas de massa) · dense = semi-naked. */
    scrapeFilm: (n, dense) => {
      const key = `film${n}${dense ? 'd' : ''}`;
      return get(key, () => texture(drawn(key, () => scrapeFilmCanvas(S, 83, n, dense, n === 1)), { srgb: true, aniso }));
    },
    fruit: () => get('fruit', () => texture(drawn('fruit', () => fruitCanvas(S >= 512 ? 128 : 96)), { repeat: false, srgb: true, aniso })),
    combNormal: () => get('comb', () => texture(drawn('comb', () => heightToNormal(combHeight(S), 3.2)), { aniso })),
    rusticNormal: () => get('rustic', () => texture(drawn('rustic', () => normalFromHeight(S, rusticHeight(57), 1.7)), { aniso })),
    wood: () => get('wood', () => texture(drawn('wood', () => woodCanvas(S)), { repeat: false, srgb: true, aniso })),
    marble: () => get('marble', () => texture(drawn('marble', () => marbleCanvas(S)), { repeat: false, srgb: true, aniso })),
    plank: () => get('plank', () => texture(drawn('plank', () => plankCanvas(S)), { repeat: false, srgb: true, aniso })),
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
      // (o espatulado e o riscado entram no fim: são os estilos de cobertura que mais demoram a desenhar)
      return [kit.softNormal, kit.swirlNormal, kit.poreNormal, kit.streakNormal, kit.crumb, kit.crust, kit.crustBump, () => kit.scrapeFilm(3, false), kit.strawberry, kit.rusticNormal, kit.combNormal].map((fn) => () => void fn());
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
