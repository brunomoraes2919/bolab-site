// BOLAB — desenhos procedurais das opções novas do personalizador (rodada 5): o miolo de cada massa
// (mesclada, formigueiro, confete…), os pedaços que aparecem no corte do recheio (frutas, castanhas, biscoito),
// as coberturas de textura própria (granulado, coco ralado, merengue maçaricado) e os estilos de cobertura
// pintados em volta do bolo (marmorizado, pinceladas, barrado, fault line, estêncil…).
// Tudo em <canvas>, sem arquivos externos, e só é desenhado quando a opção é escolhida.
import { rng, hashString, makeCanvas, tileNoise, crumbCanvas, hexRgb, mixRgb, rgba } from './textures.js';

const TAU = Math.PI * 2;
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const css = ([r, g, b], a = 1) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
const shade = (hex, k) => {
  const [r, g, b] = hexRgb(hex);
  return k >= 0 ? css([r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k]) : css([r * (1 + k), g * (1 + k), b * (1 + k)]);
};

/** Desenha a mesma coisa nas emendas do azulejo (o que passa de uma beira reaparece na outra). */
function tiled(size, x, y, reach, draw) {
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      const px = x + ox * size;
      const py = y + oy * size;
      if (px < -reach || py < -reach || px > size + reach || py > size + reach) continue;
      draw(px, py);
    }
  }
}

/** Contorno irregular (pedaço de castanha, lasca): n pontas com o raio variando. */
function blob(g, x, y, rad, r, { points = 7, rough = 0.34, squash = 1, rot = 0 } = {}) {
  g.beginPath();
  for (let i = 0; i <= points; i++) {
    const a = rot + (i / points) * TAU;
    const k = rad * (1 - rough + r() * rough);
    const px = x + Math.cos(a) * k;
    const py = y + Math.sin(a) * k * squash;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
}

/* ───────── Miolo das massas ─────────
   O azulejo cobre 6,2 cm de bolo (a mesma escala do miolo liso). As cores já vão na textura — o material fica
   branco —, multiplicadas pelo mesmo miolo de furinhos das outras massas. */

/**
 * Miolo com desenho, visto no corte: veios de uma segunda massa (mesclada, churros) e pedacinhos
 * (granulado do formigueiro, confeitos, castanhas, sementes de maracujá…). Ver FLAVORS.look no cardápio.
 */
export function crumbLookCanvas(size, flavor) {
  const look = flavor.look || {};
  const seed = hashString(`miolo-${flavor.id}`);
  const r = rng(seed);
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const mm = size / 62; // pixels por milímetro

  if (look.swirl) {
    // veios: faixas onduladas de uma massa dentro da outra, como a colherada riscada com o palito
    const n1 = tileNoise(3, seed);
    const n2 = tileNoise(5, seed + 1);
    const n3 = tileNoise(2, seed + 2);
    const n4 = tileNoise(11, seed + 3);
    const a = hexRgb(flavor.crumb);
    const b = hexRgb(look.swirl.color);
    const th = 1 - look.swirl.amount;
    const img = g.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        // a massa escorre deitada dentro da fôrma: as duas massas ficam em faixas onduladas, mais compridas que
        // altas, que engrossam, afinam e se encontram (três faixas a cada 6 cm: mais ou menos uma por camada)
        const wander = 1.25 * (n1(u, v) - 0.5) + 0.7 * (n3(u + 0.4, v) - 0.5) + 0.5 * (n2(u, v) - 0.5) + 0.16 * (n4(u, v) - 0.5);
        const band = 0.5 + 0.5 * Math.sin((v * 3 + wander) * TAU);
        // 'veio' = fitas finas (canela polvilhada entre colheradas); senão, manchas largas de uma segunda massa
        const k = (look.swirl.kind === 'veio' ? 1 - smooth(0, look.swirl.amount * 0.42, Math.abs(band - 0.5)) : smooth(th - 0.12, th + 0.12, band)) * (0.82 + 0.18 * n4(v, u));
        const i = (y * size + x) * 4;
        img.data[i] = a[0] + (b[0] - a[0]) * k;
        img.data[i + 1] = a[1] + (b[1] - a[1]) * k;
        img.data[i + 2] = a[2] + (b[2] - a[2]) * k;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  } else {
    g.fillStyle = flavor.crumb;
    g.fillRect(0, 0, size, size);
  }
  g.globalCompositeOperation = 'multiply';
  g.drawImage(crumbCanvas(size, 5), 0, 0);
  g.globalCompositeOperation = 'source-over';

  (look.specks || []).forEach((spec) => {
    const colors = spec.colors || [spec.color];
    const count = Math.round(spec.n);
    for (let i = 0; i < count; i++) {
      const x = r() * size;
      const y = r() * size;
      const len = (spec.size[0] + r() * (spec.size[1] - spec.size[0])) * mm;
      const color = colors[Math.floor(r() * colors.length)];
      const ang = r() * TAU;
      const seen = 0.45 + r() * 0.55; // o pedaço raramente é cortado bem de frente
      tiled(size, x, y, len + 2, (px, py) => {
        const pr = rng(seed + i * 7 + 13); // o mesmo pedaço nas duas beiras da emenda
        g.save();
        g.translate(px, py);
        g.rotate(ang);
        if (spec.kind === 'rod') {
          // granulado: bastãozinho de pontas redondas, com a massa um tico manchada em volta
          const thick = Math.max(1.3, Math.min(len * 0.42, (spec.thick || 1.1) * mm));
          g.lineCap = 'round';
          g.strokeStyle = rgba(color, 0.2);
          g.lineWidth = thick * 1.9;
          g.beginPath();
          g.moveTo((-len * seen) / 2, 0);
          g.lineTo((len * seen) / 2, 0);
          g.stroke();
          g.strokeStyle = color;
          g.lineWidth = thick;
          g.stroke();
          g.strokeStyle = shade(color, 0.22);
          g.lineWidth = thick * 0.3;
          g.beginPath();
          g.moveTo((-len * seen) / 2, -thick * 0.2);
          g.lineTo((len * seen) / 4, -thick * 0.2);
          g.stroke();
        } else if (spec.kind === 'fiber') {
          // fiapo (coco, raspas de casca, fio de banana): fino e de leve curvo
          g.lineCap = 'round';
          g.strokeStyle = color;
          g.lineWidth = Math.max(1, 0.38 * mm);
          g.beginPath();
          g.moveTo(-len / 2, 0);
          g.quadraticCurveTo(0, (pr() - 0.5) * len * 0.5, len / 2, 0);
          g.stroke();
        } else if (spec.kind === 'chunk') {
          // pedaço (noz, amendoim, chocolate branco): contorno quebrado, miolo um pouco mais claro
          const cut = rng(seed + i * 7 + 13);
          g.fillStyle = 'rgba(40,24,12,0.14)';
          blob(g, 0.5, 0.7, len * 0.54, cut, { squash: seen, points: 6, rough: 0.42 });
          g.fill();
          g.fillStyle = color;
          blob(g, 0, 0, len * 0.5, pr, { squash: seen, points: 6, rough: 0.42 });
          g.fill();
        } else {
          // ponto (confeito derretido, semente): a cor escorre um pouco para a massa
          const rad = len / 2;
          g.fillStyle = rgba(color, 0.22);
          g.beginPath();
          g.ellipse(0, 0, rad * 1.5, rad * 1.5 * seen, 0, 0, TAU);
          g.fill();
          g.fillStyle = color;
          g.beginPath();
          g.ellipse(0, 0, rad, rad * Math.max(0.6, seen), 0, 0, TAU);
          g.fill();
        }
        g.restore();
      });
    }
  });
  return c;
}

/* ───────── Pedaços no corte do recheio ─────────
   Atlas 6 × 3 com transparência: cada célula é um pedaço visto de frente, desenhado dentro de 86% da célula
   (a folga evita que uma célula "vaze" na vizinha). A geometria (geometry.js → buildCutFaces) cola um
   quadradinho por pedaço na face do corte. */

export const PIECE_COLS = 6;
export const PIECE_ROWS = 3;
const CELLS = ['morango', 'framboesa', 'mirtilo', 'cereja', 'abacaxi', 'pessego', 'ameixa', 'semente', 'noz', 'noz2', 'pistache', 'farelo', 'coco', 'cookie', 'cookie2', 'crocante', 'gota'];
/** Onde cada pedaço fica no atlas: { u0, v0, du, dv } em coordenadas de textura. */
export function pieceCell(name) {
  const i = Math.max(0, CELLS.indexOf(name));
  const col = i % PIECE_COLS;
  const row = Math.floor(i / PIECE_COLS);
  return { u0: col / PIECE_COLS, v0: 1 - (row + 1) / PIECE_ROWS, du: 1 / PIECE_COLS, dv: 1 / PIECE_ROWS };
}

/** Farelo escuro de biscoito, solto em volta do pedaço (o "cookies & cream" de verdade é pintadinho). */
function crumbs(g, s, r, n) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = ['rgba(43,24,17,0.9)', 'rgba(70,44,32,0.8)'][i % 2];
    blob(g, (r() - 0.5) * s * 2.1, (r() - 0.5) * s * 2.1, s * (0.035 + r() * 0.065), r, { points: 5, rough: 0.4 });
    g.fill();
  }
}

const DRAW = {
  // fatia de morango cortado ao meio, de pé: casca vermelha, miolo claro com as fibras
  morango(g, s, r) {
    const heart = (k) => {
      g.beginPath();
      g.moveTo(0, s * 0.96 * k);
      g.bezierCurveTo(-s * k, s * 0.35 * k, -s * 0.98 * k, -s * 0.78 * k, -s * 0.34 * k, -s * 0.9 * k);
      g.bezierCurveTo(-s * 0.12 * k, -s * 0.96 * k, s * 0.12 * k, -s * 0.96 * k, s * 0.34 * k, -s * 0.9 * k);
      g.bezierCurveTo(s * 0.98 * k, -s * 0.78 * k, s * k, s * 0.35 * k, 0, s * 0.96 * k);
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
    g.strokeStyle = 'rgba(255,226,220,0.4)';
    g.lineWidth = s * 0.026;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + r() * 0.2;
      g.beginPath();
      g.moveTo(Math.cos(a) * s * 0.12, -s * 0.1 + Math.sin(a) * s * 0.14);
      g.lineTo(Math.cos(a) * s * 0.62, -s * 0.02 + Math.sin(a) * s * 0.66);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,244,238,0.85)';
    g.beginPath();
    g.ellipse(0, -s * 0.12, s * 0.07, s * 0.2, 0, 0, TAU);
    g.fill();
  },
  // framboesa: bagas redondas juntas, vinho
  framboesa(g, s, r) {
    for (let i = 0; i < 26; i++) {
      const a = r() * TAU;
      const d = Math.sqrt(r()) * s * 0.74;
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d * 0.82;
      const rad = s * (0.163 + r() * 0.065);
      const gr = g.createRadialGradient(x - rad * 0.3, y - rad * 0.3, 0, x, y, rad);
      gr.addColorStop(0, '#ef5f7c');
      gr.addColorStop(0.5, '#c21d46');
      gr.addColorStop(1, '#7c0f2c');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, rad, 0, TAU);
      g.fill();
    }
  },
  // mirtilo inteiro: azul-arroxeado, com a "pruína" clara e a coroinha
  mirtilo(g, s) {
    const gr = g.createRadialGradient(-s * 0.3, -s * 0.34, s * 0.05, 0, 0, s * 0.9);
    gr.addColorStop(0, '#8792c8');
    gr.addColorStop(0.45, '#434a86');
    gr.addColorStop(1, '#1c1c40');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, s * 0.88, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(20,18,44,0.75)';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      const k = s * (i % 2 ? 0.1 : 0.24);
      g.lineTo(s * 0.18 + Math.cos(a) * k, -s * 0.22 + Math.sin(a) * k);
    }
    g.fill();
  },
  // cereja em calda cortada ao meio: vermelho-escuro brilhante, com a marca do caroço
  cereja(g, s) {
    const gr = g.createRadialGradient(-s * 0.25, -s * 0.3, s * 0.05, 0, 0, s * 0.9);
    gr.addColorStop(0, '#e3566c');
    gr.addColorStop(0.5, '#a8142e');
    gr.addColorStop(1, '#5e0a1a');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, s * 0.88, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(60,6,18,0.6)';
    g.beginPath();
    g.ellipse(s * 0.06, s * 0.08, s * 0.3, s * 0.26, 0, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = s * 0.09;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(0, 0, s * 0.62, Math.PI * 1.08, Math.PI * 1.42);
    g.stroke();
  },
  // cubo de abacaxi em calda: amarelo translúcido, com as fibras saindo do miolo
  abacaxi(g, s, r) {
    g.beginPath();
    g.moveTo(-s * 0.84, -s * 0.5);
    g.lineTo(s * 0.7, -s * 0.72);
    g.lineTo(s * 0.9, s * 0.56);
    g.lineTo(-s * 0.62, s * 0.78);
    g.closePath();
    const gr = g.createLinearGradient(-s, -s, s, s);
    gr.addColorStop(0, '#f8de6a');
    gr.addColorStop(1, '#e2ac2c');
    g.fillStyle = gr;
    g.fill();
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(255,246,190,0.75)';
    g.lineWidth = s * 0.05;
    for (let i = 0; i < 9; i++) {
      const x = -s + (i / 8) * s * 2 + (r() - 0.5) * s * 0.1;
      g.beginPath();
      g.moveTo(x, -s);
      g.lineTo(x + s * 0.2, s);
      g.stroke();
    }
    g.restore();
    g.strokeStyle = 'rgba(190,130,20,0.55)';
    g.lineWidth = s * 0.05;
    g.stroke();
  },
  // fatia de pêssego em calda: meia-lua alaranjada, mais vermelha do lado do caroço
  pessego(g, s) {
    g.beginPath();
    g.moveTo(-s * 0.92, s * 0.1);
    g.bezierCurveTo(-s * 0.7, -s * 0.95, s * 0.7, -s * 0.95, s * 0.92, s * 0.1);
    g.bezierCurveTo(s * 0.55, s * 0.72, -s * 0.55, s * 0.72, -s * 0.92, s * 0.1);
    g.closePath();
    const gr = g.createLinearGradient(0, -s * 0.8, 0, s * 0.6);
    gr.addColorStop(0, '#f39a34');
    gr.addColorStop(0.55, '#f9bd52');
    gr.addColorStop(1, '#e9763a');
    g.fillStyle = gr;
    g.fill();
    g.strokeStyle = 'rgba(214,74,40,0.55)';
    g.lineWidth = s * 0.1;
    g.beginPath();
    g.moveTo(-s * 0.7, s * 0.16);
    g.bezierCurveTo(-s * 0.4, s * 0.5, s * 0.4, s * 0.5, s * 0.7, s * 0.16);
    g.stroke();
    g.strokeStyle = 'rgba(255,238,190,0.6)';
    g.lineWidth = s * 0.07;
    g.beginPath();
    g.moveTo(-s * 0.56, -s * 0.3);
    g.bezierCurveTo(-s * 0.3, -s * 0.62, s * 0.2, -s * 0.66, s * 0.4, -s * 0.5);
    g.stroke();
  },
  // ameixa-preta em calda: pedaço escuro e enrugado, com brilho
  ameixa(g, s, r) {
    g.fillStyle = '#26101c';
    blob(g, 0, 0, s * 0.9, r, { points: 9, rough: 0.22, squash: 0.82 });
    g.fill();
    g.strokeStyle = 'rgba(110,52,78,0.7)';
    g.lineWidth = s * 0.06;
    g.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const y = -s * 0.42 + i * s * 0.2;
      g.beginPath();
      g.moveTo(-s * 0.5 + r() * s * 0.2, y);
      g.quadraticCurveTo(0, y + (r() - 0.5) * s * 0.3, s * 0.5 - r() * s * 0.2, y + (r() - 0.5) * s * 0.1);
      g.stroke();
    }
    g.strokeStyle = 'rgba(255,255,255,0.4)';
    g.lineWidth = s * 0.07;
    g.beginPath();
    g.arc(0, 0, s * 0.6, Math.PI * 1.1, Math.PI * 1.4);
    g.stroke();
  },
  // sementes de maracujá: gotinhas pretas, cada uma no seu saquinho de polpa alaranjada
  semente(g, s, r) {
    for (let i = 0; i < 4; i++) {
      const x = -s * 0.62 + i * s * 0.42 + (r() - 0.5) * s * 0.1;
      const y = (r() - 0.5) * s * 0.7;
      const rot = r() * TAU;
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      g.fillStyle = 'rgba(244,176,36,0.85)';
      g.beginPath();
      g.ellipse(0, 0, s * 0.3, s * 0.22, 0, 0, TAU);
      g.fill();
      g.fillStyle = '#1c120a';
      g.beginPath();
      g.moveTo(-s * 0.19, 0);
      g.bezierCurveTo(-s * 0.06, -s * 0.14, s * 0.16, -s * 0.1, s * 0.19, 0);
      g.bezierCurveTo(s * 0.16, s * 0.1, -s * 0.06, s * 0.14, -s * 0.19, 0);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.ellipse(s * 0.02, -s * 0.04, s * 0.07, s * 0.025, 0, 0, TAU);
      g.fill();
      g.restore();
    }
  },
  // pedaço de noz: gomos claros por dentro, película castanha por fora
  noz(g, s, r) {
    g.fillStyle = '#7d5230';
    blob(g, 0, 0, s * 0.9, r, { points: 8, rough: 0.3 });
    g.fill();
    g.fillStyle = '#b98a54';
    blob(g, -s * 0.04, -s * 0.04, s * 0.78, r, { points: 7, rough: 0.3 });
    g.fill();
    g.fillStyle = '#d6b27c';
    blob(g, -s * 0.2, -s * 0.16, s * 0.34, r, { points: 6, rough: 0.4 });
    g.fill();
    g.strokeStyle = 'rgba(122,78,40,0.85)';
    g.lineWidth = s * 0.08;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-s * 0.5, -s * 0.1);
    g.quadraticCurveTo(-s * 0.1, s * 0.2, s * 0.1, -s * 0.2);
    g.quadraticCurveTo(s * 0.3, -s * 0.4, s * 0.5, s * 0.1);
    g.stroke();
  },
  noz2(g, s, r) {
    g.fillStyle = '#7d5230';
    blob(g, 0, 0, s * 0.86, r, { points: 6, rough: 0.4, squash: 0.74 });
    g.fill();
    g.fillStyle = '#c0935c';
    blob(g, s * 0.02, 0, s * 0.72, r, { points: 6, rough: 0.36, squash: 0.72 });
    g.fill();
    g.strokeStyle = 'rgba(122,78,40,0.8)';
    g.lineWidth = s * 0.07;
    g.beginPath();
    g.moveTo(-s * 0.4, s * 0.1);
    g.quadraticCurveTo(0, -s * 0.3, s * 0.42, 0);
    g.stroke();
  },
  // pistache picado: lascas verdes com a pele arroxeada
  pistache(g, s, r) {
    for (let i = 0; i < 4; i++) {
      const x = (r() - 0.5) * s * 1.2;
      const y = (r() - 0.5) * s * 1.1;
      g.fillStyle = '#6e4a56';
      blob(g, x, y, s * (0.3 + r() * 0.12), r, { points: 6, rough: 0.3, squash: 0.7, rot: r() * TAU });
      g.fill();
      g.fillStyle = ['#a9c36c', '#93b25a', '#bdd384'][i % 3];
      blob(g, x, y, s * (0.22 + r() * 0.08), r, { points: 6, rough: 0.3, squash: 0.7, rot: r() * TAU });
      g.fill();
    }
  },
  // farelo de paçoca: grãozinhos soltos de amendoim
  farelo(g, s, r) {
    for (let i = 0; i < 16; i++) {
      const x = (r() - 0.5) * s * 1.6;
      const y = (r() - 0.5) * s * 1.2;
      g.fillStyle = ['#c79a5c', '#e3bd84', '#b08346', '#d6ac6e'][i % 4];
      blob(g, x, y, s * (0.1 + r() * 0.14), r, { points: 5, rough: 0.4 });
      g.fill();
    }
  },
  // coco ralado: fitinhas brancas atravessadas
  coco(g, s, r) {
    g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const x = (r() - 0.5) * s * 1.4;
      const y = (r() - 0.5) * s * 1.2;
      const a = r() * TAU;
      const len = s * (0.4 + r() * 0.4);
      for (const [color, width, off] of [
        ['rgba(150,120,80,0.35)', s * 0.13, s * 0.03],
        ['#fffdf4', s * 0.1, 0],
      ]) {
        g.strokeStyle = color;
        g.lineWidth = width;
        g.beginPath();
        g.moveTo(x - Math.cos(a) * len, y - Math.sin(a) * len + off);
        g.quadraticCurveTo(x + (r() - 0.5) * s * 0.3, y + (r() - 0.5) * s * 0.3 + off, x + Math.cos(a) * len, y + Math.sin(a) * len + off);
        g.stroke();
      }
    }
  },
  // pedaço de biscoito recheado quebrado, visto de lado: bolacha escura, creme branco, bolacha escura — uma
  // "tabuinha" de pontas quebradas, com o farelo escuro que solta no creme em volta
  cookie(g, s, r) {
    crumbs(g, s, r, 13);
    const w = s * 0.94;
    const h = s * 0.66;
    const j = () => (r() - 0.5) * 0.24;
    g.save();
    g.beginPath();
    g.moveTo(-w * (0.9 + j()), -h * 0.96);
    g.lineTo(w * (0.72 + j()), -h);
    g.lineTo(w * (0.98 + j() * 0.2), -h * (0.4 + j()));
    g.lineTo(w * (0.8 + j()), h * (0.06 + j()));
    g.lineTo(w * (0.96 + j() * 0.2), h * (0.7 + j()));
    g.lineTo(w * (0.84 + j()), h);
    g.lineTo(-w * (0.7 + j()), h * 0.98);
    g.lineTo(-w * (0.97 + j() * 0.2), h * (0.42 + j()));
    g.lineTo(-w * (0.8 + j()), -h * (0.1 + j()));
    g.closePath();
    g.clip();
    g.fillStyle = '#2b1811';
    g.fillRect(-s, -s, s * 2, s * 2);
    g.fillStyle = '#fbf6ea';
    g.fillRect(-s, -h * 0.25, s * 2, h * 0.5);
    // o friso gravado na borda de cada bolacha
    g.fillStyle = 'rgba(104,68,50,0.85)';
    for (let x = -s; x < s; x += s * 0.17) {
      g.fillRect(x, -h * 0.98, s * 0.07, h * 0.2);
      g.fillRect(x + s * 0.05, h * 0.78, s * 0.07, h * 0.2);
    }
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(-s, -h * 0.31, s * 2, h * 0.07);
    g.fillRect(-s, h * 0.24, s * 2, h * 0.07);
    g.restore();
  },
  // lasca de bolacha solta (uma banda só), de quinas vivas, com um resto de creme grudado embaixo
  cookie2(g, s, r) {
    crumbs(g, s, r, 15);
    const j = () => (r() - 0.5) * 0.3;
    g.save();
    g.beginPath();
    g.moveTo(-s * (0.82 + j()), -s * (0.3 + j()));
    g.lineTo(-s * (0.1 + j()), -s * (0.46 + j()));
    g.lineTo(s * (0.8 + j()), -s * (0.22 + j()));
    g.lineTo(s * (0.6 + j()), s * (0.34 + j()));
    g.lineTo(s * (0.05 + j()), s * (0.2 + j()));
    g.lineTo(-s * (0.62 + j()), s * (0.4 + j()));
    g.closePath();
    g.clip();
    g.fillStyle = '#2b1811';
    g.fillRect(-s, -s, s * 2, s * 2);
    g.fillStyle = 'rgba(251,246,234,0.95)';
    g.fillRect(-s, s * 0.14, s * 2, s);
    g.fillStyle = 'rgba(104,68,50,0.85)';
    for (let x = -s; x < s; x += s * 0.17) g.fillRect(x, -s * 0.5, s * 0.07, s * 0.2);
    g.restore();
  },
  // crocante: lascas de caramelo âmbar com castanha dentro
  crocante(g, s, r) {
    for (let i = 0; i < 5; i++) {
      const x = (r() - 0.5) * s * 1.3;
      const y = (r() - 0.5) * s * 1.1;
      const rad = s * (0.24 + r() * 0.16);
      g.fillStyle = ['#d99a3a', '#c98428', '#e6b052'][i % 3];
      blob(g, x, y, rad, r, { points: 5, rough: 0.5, rot: r() * TAU });
      g.fill();
      g.fillStyle = 'rgba(244,222,170,0.9)';
      blob(g, x - rad * 0.1, y - rad * 0.1, rad * 0.4, r, { points: 5, rough: 0.3 });
      g.fill();
    }
  },
  // gota de chocolate: gotinha de base larga e biquinho
  gota(g, s) {
    g.beginPath();
    g.moveTo(0, -s * 0.84);
    g.bezierCurveTo(s * 0.22, -s * 0.3, s * 0.86, 0, s * 0.8, s * 0.5);
    g.bezierCurveTo(s * 0.74, s * 0.84, -s * 0.74, s * 0.84, -s * 0.8, s * 0.5);
    g.bezierCurveTo(-s * 0.86, 0, -s * 0.22, -s * 0.3, 0, -s * 0.84);
    g.closePath();
    const gr = g.createRadialGradient(-s * 0.25, s * 0.1, s * 0.05, 0, s * 0.2, s);
    gr.addColorStop(0, '#6a3a20');
    gr.addColorStop(0.5, '#3c1e10');
    gr.addColorStop(1, '#221008');
    g.fillStyle = gr;
    g.fill();
  },
};

/** O atlas de pedaços. cell = lado de cada célula, em pixels. */
export function piecesCanvas(cell) {
  const c = makeCanvas(cell * PIECE_COLS, cell * PIECE_ROWS);
  const g = c.getContext('2d');
  CELLS.forEach((name, i) => {
    g.save();
    g.translate((i % PIECE_COLS) * cell + cell / 2, Math.floor(i / PIECE_COLS) * cell + cell / 2);
    g.beginPath();
    g.rect(-cell / 2, -cell / 2, cell, cell);
    g.clip();
    DRAW[name](g, cell * 0.43, rng(977 + i * 31));
    g.restore();
  });
  return c;
}

export { smooth, shade, css, tiled, blob, mixRgb };

/* ───────── Coberturas de textura própria ─────────
   Cada uma devolve { shade, height }: `shade` multiplica a cor da cobertura (tons de cinza, ou já colorido no
   merengue) e `height` vira o relevo. O azulejo cobre TILE unidades de bolo (8 cm). */

export const COVER_TILE = 0.8;

/**
 * Confeitos em bastão cobrindo a superfície inteira, uns por cima dos outros: granulado (curto, gordinho) ou
 * coco ralado (fitas mais compridas e finas, de leve curvas).
 */
export function strandCanvases(size, { seed = 41, count = 2100, len = [3.2, 4.6], thick = 1.15, base = 0.4, tones = [0.7, 1], curl = 0, gloss = 0.3 } = {}) {
  const mm = size / (COVER_TILE * 100);
  const shadeC = makeCanvas(size);
  const heightC = makeCanvas(size);
  const g = shadeC.getContext('2d');
  const h = heightC.getContext('2d');
  const gray = (k) => {
    const v = Math.round(255 * Math.max(0, Math.min(1, k)));
    return `rgb(${v},${v},${v})`;
  };
  g.fillStyle = gray(base);
  g.fillRect(0, 0, size, size);
  h.fillStyle = gray(0.12);
  h.fillRect(0, 0, size, size);
  g.lineCap = 'round';
  h.lineCap = 'round';
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const x = r() * size;
    const y = r() * size;
    const l = (len[0] + r() * (len[1] - len[0])) * mm * (0.55 + 0.45 * r()); // quase nenhum fica deitado por inteiro
    const a = r() * TAU;
    const w = thick * mm * (0.85 + r() * 0.3);
    const tone = tones[0] + r() * (tones[1] - tones[0]);
    const bend = (r() - 0.5) * curl * l;
    const level = 0.35 + 0.65 * (i / count); // os de cima da pilha ficam mais altos
    const dx = (Math.cos(a) * l) / 2;
    const dy = (Math.sin(a) * l) / 2;
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    tiled(size, x, y, l + w, (px, py) => {
      const path = (ctx, off = 0) => {
        ctx.beginPath();
        ctx.moveTo(px - dx + nx * off, py - dy + ny * off);
        ctx.quadraticCurveTo(px + nx * (bend + off), py + ny * (bend + off), px + dx + nx * off, py + dy + ny * off);
      };
      // sombra em volta, corpo e um fio de brilho deslocado para o lado da luz
      g.strokeStyle = `rgba(0,0,0,${0.28 * (1 - base * 0.5)})`;
      g.lineWidth = w * 1.5;
      path(g, w * 0.18);
      g.stroke();
      g.strokeStyle = gray(tone * 0.9);
      g.lineWidth = w;
      path(g);
      g.stroke();
      g.strokeStyle = gray(Math.min(1, tone * (1 + gloss)));
      g.lineWidth = w * 0.34;
      path(g, -w * 0.18);
      g.stroke();
      // altura: um bastão redondo (largo e baixo por baixo, estreito e alto por cima)
      [
        [1.25, 0.3],
        [0.85, 0.62],
        [0.45, 0.9],
      ].forEach(([k, lift]) => {
        h.strokeStyle = gray(level * lift + 0.1);
        h.lineWidth = w * k;
        path(h);
        h.stroke();
      });
    });
  }
  return { shade: shadeC, height: heightC };
}

/**
 * Relevo do merengue em picos (0…1), com emenda nas bordas: montinhos puxados com as costas da colher, cada um
 * torcido em espiral, encostados uns nos outros.
 */
let MERINGUE = null;
export function meringueHeight() {
  if (MERINGUE) return MERINGUE;
  const G = 3;
  const r = rng(733);
  const n = tileNoise(7, 734);
  const peaks = [];
  for (let j = 0; j < G; j++) {
    for (let i = 0; i < G; i++) {
      peaks.push({ x: (i + 0.22 + r() * 0.56) / G, y: (j + 0.22 + r() * 0.56) / G, rad: (0.74 + r() * 0.34) / G, top: 0.62 + r() * 0.38, twist: (r() < 0.5 ? -1 : 1) * (2 + Math.floor(r() * 2)), ph: r() * TAU, lean: r() * TAU });
    }
  }
  MERINGUE = (u, v) => {
    u -= Math.floor(u);
    v -= Math.floor(v);
    const ci = Math.floor(u * G);
    const cj = Math.floor(v * G);
    let best = 0;
    for (let oj = -1; oj <= 1; oj++) {
      for (let oi = -1; oi <= 1; oi++) {
        const p = peaks[((cj + oj + G) % G) * G + ((ci + oi + G) % G)];
        let dx = u - p.x;
        let dy = v - p.y;
        dx -= Math.round(dx);
        dy -= Math.round(dy);
        // o pico pende um pouco para um lado (a colher sai puxando)
        dx -= Math.cos(p.lean) * p.rad * 0.16;
        dy -= Math.sin(p.lean) * p.rad * 0.16;
        const d = Math.hypot(dx, dy) / p.rad;
        if (d >= 1) continue;
        const t = 1 - d;
        // sulcos em espiral (a colher gira ao sair): são as cristas deles que a chama tosta
        const ridge = 1 + 0.3 * Math.sin(Math.atan2(dy, dx) * p.twist + t * 8 + p.ph) * Math.min(1, d * 3.5);
        const hgt = p.top * (0.5 * t + 0.5 * Math.pow(t, 2.2)) * ridge;
        if (hgt > best) best = hgt;
      }
    }
    return Math.max(0, Math.min(1, best + 0.1 * n(u, v)));
  };
  return MERINGUE;
}

/** Cor do merengue maçaricado: branco nos vales, dourado nas cristas e castanho nas pontas (onde a chama pegou). */
export function meringueToastCanvas(size) {
  const f = meringueHeight();
  const n = tileNoise(9, 811);
  const wide = tileNoise(2, 812);
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const A = [255, 252, 244];
  const B = [233, 178, 98];
  const C = [146, 86, 36];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const hgt = f(u, v);
      // a chama passa por cima: tosta mais o que está mais alto, de um jeito desigual
      const fire = hgt * (0.38 + 0.3 * n(u, v) + 0.95 * wide(u, v));
      // (dourado largo e macio; o castanho fica só na pontinha de alguns picos — queimado demais vira "pintas")
      const gold = smooth(0.26, 0.72, fire) * 0.92;
      const burn = smooth(0.8, 1.08, fire) * 0.85;
      const i = (y * size + x) * 4;
      for (let k = 0; k < 3; k++) {
        const base = A[k] + (B[k] - A[k]) * gold;
        img.data[i + k] = base + (C[k] - base) * burn;
      }
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/* ───────── Estilos de cobertura ───────── */

/** Relevos que se repetem em volta do bolo (azulejo de 16 cm): f(u, v) → 0…1. */
export const STYLE_HEIGHT = {
  // pente em sobe e desce: os sulcos ondulam em volta do bolo
  ondas: (u, v) => 0.5 + 0.5 * Math.pow(Math.abs(Math.sin((v * 11 + 0.85 * Math.sin(u * TAU * 2)) * Math.PI)), 0.7),
  // sulcos de baixo para cima, um a cada 6 mm
  vertical: (u) => 0.5 + 0.5 * Math.pow(Math.abs(Math.sin(u * Math.PI * 26)), 0.7),
  // cesta: tiras deitadas que passam por cima de uma haste e por baixo da seguinte
  cesta: (u, v) => {
    // 8 tiras por azulejo (2 cm cada) e uma haste a cada 2,7 cm; cada tira cobre duas hastes: passa por cima da do
    // meio e some por baixo das duas das pontas — na fileira seguinte, o desenho anda uma haste para o lado
    const row = Math.floor(v * 8);
    const fv = v * 8 - row;
    let x = (u * 6 - (row % 2)) % 2;
    if (x < 0) x += 2;
    const dx = Math.min(x, 2 - x); // distância até a haste onde a tira some
    const gap = smooth(0, 0.14, fv) * smooth(1, 0.86, fv);
    const body = 0.5 + 0.34 * Math.sin(fv * Math.PI) + 0.08 * Math.cos(fv * TAU * 3);
    const strip = body * gap * smooth(0.1, 0.42, dx) * (0.8 + 0.2 * Math.sin((Math.PI * x) / 2));
    const stake = dx < 0.26 ? 0.78 * Math.pow(Math.cos((dx / 0.26) * (Math.PI / 2)), 0.7) * (0.92 + 0.08 * Math.cos(v * TAU * 24)) : 0;
    return Math.max(strip, stake);
  },
};

/** Beira irregular (cm), com emenda a cada azulejo: onde o barrado termina, onde a fault line "rasga". */
export function raggedEdge(seed, amp = 1) {
  const r = rng(seed);
  const ph = [r() * TAU, r() * TAU, r() * TAU, r() * TAU];
  return (u) => amp * (0.26 * Math.sin(u * TAU * 2 + ph[0]) + 0.17 * Math.sin(u * TAU * 5 + ph[1]) + 0.1 * Math.sin(u * TAU * 11 + ph[2]) + 0.05 * Math.sin(u * TAU * 23 + ph[3]));
}
/** As duas beiras da fault line, em cm a partir do meio da faixa (a de baixo é negativa). */
export const FAULT_HALF = 1.25;
export function faultEdges(seed = 5) {
  const lo = raggedEdge(seed * 3 + 1, 1.15);
  const hi = raggedEdge(seed * 3 + 2, 1.15);
  return { lo: (u) => -FAULT_HALF + lo(u), hi: (u) => FAULT_HALF + hi(u) };
}

/** Uma peça de confeito (castanha, granulado, confeito colorido, coco, raspa) na cor e, se houver, no relevo. */
function trimPiece(g, h, trim, x, y, mm, r, level = 1) {
  const colors = trim.colors;
  const color = colors[Math.floor(r() * colors.length)];
  const ang = r() * TAU;
  const each = (fn) => {
    fn(g, false);
    if (h) fn(h, true);
  };
  const lift = (k) => {
    const v = Math.round(255 * Math.min(1, (0.35 + 0.65 * k) * level));
    return `rgb(${v},${v},${v})`;
  };
  if (trim.id === 'granulado' || (trim.id === 'confeitos' && r() < 0.62)) {
    const len = (2.6 + r() * 1.8) * mm * (0.55 + 0.45 * r());
    const w = 1.15 * mm;
    each((c, isH) => {
      c.lineCap = 'round';
      c.save();
      c.translate(x, y);
      c.rotate(ang);
      if (!isH) {
        c.strokeStyle = 'rgba(0,0,0,0.25)';
        c.lineWidth = w * 1.5;
        c.beginPath();
        c.moveTo(-len / 2, w * 0.2);
        c.lineTo(len / 2, w * 0.2);
        c.stroke();
      }
      c.strokeStyle = isH ? lift(0.7) : color;
      c.lineWidth = w;
      c.beginPath();
      c.moveTo(-len / 2, 0);
      c.lineTo(len / 2, 0);
      c.stroke();
      c.strokeStyle = isH ? lift(1) : shade(color, 0.3);
      c.lineWidth = w * 0.34;
      c.beginPath();
      c.moveTo(-len / 2, -w * 0.2);
      c.lineTo(len / 3, -w * 0.2);
      c.stroke();
      c.restore();
    });
  } else if (trim.id === 'confeitos') {
    const rad = (0.8 + r() * 0.7) * mm;
    each((c, isH) => {
      if (!isH) {
        c.fillStyle = 'rgba(0,0,0,0.22)';
        c.beginPath();
        c.arc(x + rad * 0.2, y + rad * 0.25, rad * 1.1, 0, TAU);
        c.fill();
      }
      c.fillStyle = isH ? lift(0.8) : color;
      c.beginPath();
      c.arc(x, y, rad, 0, TAU);
      c.fill();
      c.fillStyle = isH ? lift(1) : shade(color, 0.45);
      c.beginPath();
      c.arc(x - rad * 0.3, y - rad * 0.3, rad * 0.36, 0, TAU);
      c.fill();
    });
  } else if (trim.id === 'coco') {
    const len = (4 + r() * 5) * mm;
    const bend = (r() - 0.5) * len * 0.5;
    each((c, isH) => {
      c.lineCap = 'round';
      c.save();
      c.translate(x, y);
      c.rotate(ang);
      if (!isH) {
        c.strokeStyle = 'rgba(120,100,70,0.3)';
        c.lineWidth = 1.2 * mm;
        c.beginPath();
        c.moveTo(-len / 2, 0.3 * mm);
        c.quadraticCurveTo(0, bend + 0.3 * mm, len / 2, 0.3 * mm);
        c.stroke();
      }
      c.strokeStyle = isH ? lift(0.9) : color;
      c.lineWidth = 0.85 * mm;
      c.beginPath();
      c.moveTo(-len / 2, 0);
      c.quadraticCurveTo(0, bend, len / 2, 0);
      c.stroke();
      c.restore();
    });
  } else if (trim.id === 'raspas') {
    // lasca enrolada: um arco largo, mais claro na crista
    const rad = (2 + r() * 2.6) * mm;
    const span = 1.2 + r() * 1.6;
    each((c, isH) => {
      c.lineCap = 'round';
      c.save();
      c.translate(x, y);
      c.rotate(ang);
      if (!isH) {
        c.strokeStyle = 'rgba(0,0,0,0.25)';
        c.lineWidth = 1.9 * mm;
        c.beginPath();
        c.arc(0.25 * mm, 0.3 * mm, rad, 0, span);
        c.stroke();
      }
      c.strokeStyle = isH ? lift(0.75) : color;
      c.lineWidth = 1.5 * mm;
      c.beginPath();
      c.arc(0, 0, rad, 0, span);
      c.stroke();
      c.strokeStyle = isH ? lift(1) : shade(color, 0.22);
      c.lineWidth = 0.5 * mm;
      c.beginPath();
      c.arc(0, 0, rad + 0.3 * mm, 0.1, span - 0.1);
      c.stroke();
      c.restore();
    });
  } else {
    // castanha picada: pedaços quebrados de tamanhos bem diferentes
    const rad = (1.1 + r() * r() * 2.6) * mm;
    const seedA = Math.floor(r() * 1e6);
    each((c, isH) => {
      if (!isH) {
        c.fillStyle = 'rgba(60,36,14,0.28)';
        blob(c, x + rad * 0.14, y + rad * 0.2, rad * 1.08, rng(seedA), { points: 6, rough: 0.45, rot: ang });
        c.fill();
      }
      c.fillStyle = isH ? lift(0.78) : color;
      blob(c, x, y, rad, rng(seedA), { points: 6, rough: 0.45, rot: ang });
      c.fill();
      c.fillStyle = isH ? lift(1) : shade(color, 0.2);
      blob(c, x - rad * 0.16, y - rad * 0.16, rad * 0.5, rng(seedA + 1), { points: 5, rough: 0.4, rot: ang });
      c.fill();
    });
  }
}

const heartPath = (g, x, y, s) => {
  g.beginPath();
  g.moveTo(x, y + s * 0.82);
  g.bezierCurveTo(x - s * 1.25, y - s * 0.05, x - s * 0.62, y - s * 1.0, x, y - s * 0.3);
  g.bezierCurveTo(x + s * 0.62, y - s * 1.0, x + s * 1.25, y - s * 0.05, x, y + s * 0.82);
  g.closePath();
};

/**
 * Estilos pintados num azulejo que se repete em volta do bolo (16 cm de largura; de altura, do pé ao alto da
 * lateral — por isso o barrado e a fault line podem ficar numa altura certa). Devolve { color, height }:
 * `height` (relevo das peças de confeito) só existe nos estilos com confeito.
 *   poa · coracoes · arabesco      estêncil da segunda cor (c2) sobre a cobertura (c1)
 *   barrado                        faixa cheia de confeito no pé, com a beira irregular
 *   chuva                          confeitos que sobem do pé e vão rareando
 *   faultline                      faixa de confeitos no meio (mid, em cm), entre duas beiras "rasgadas" pintadas de dourado
 */
export function paintTileStyle(size, style, { c1, c2, trim, mid = 4.5, top = 9, seed = 3 } = {}) {
  const color = makeCanvas(size);
  const g = color.getContext('2d');
  const mm = size / 160;
  const cm = mm * 10;
  const Y = (h) => size - h * cm; // altura em cm → linha do desenho (o pé do bolo fica embaixo)
  const r = rng(seed * 97 + 11);
  g.fillStyle = c1;
  g.fillRect(0, 0, size, size);
  if (style === 'poa' || style === 'coracoes') {
    // 5 colunas por azulejo (3,2 cm), linhas desencontradas a cada 2,6 cm, a primeira a 1,7 cm do pé
    g.fillStyle = c2;
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 6; col++) {
        const x = (col + (row % 2 ? 0.5 : 0)) * 3.2 * cm;
        const y = Y(1.7 + row * 2.6);
        if (style === 'poa') {
          g.beginPath();
          g.arc(x, y, 0.6 * cm, 0, TAU);
          g.fill();
        } else {
          heartPath(g, x, y, 0.62 * cm);
          g.fill();
        }
      }
    }
    return { color, height: null };
  }
  if (style === 'arabesco') {
    // renda: 4 motivos por azulejo (4 cm), em linhas desencontradas de 4 cm
    g.strokeStyle = c2;
    g.fillStyle = c2;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const motif = (x, y, s) => {
      g.lineWidth = 0.16 * s;
      for (const k of [-1, 1]) {
        // volutas espelhadas em S
        g.beginPath();
        g.moveTo(x, y + s * 1.5);
        g.bezierCurveTo(x + k * s * 1.3, y + s * 1.2, x + k * s * 1.5, y + s * 0.1, x + k * s * 0.7, y + s * 0.05);
        g.bezierCurveTo(x + k * s * 0.2, y, x + k * s * 0.25, y + s * 0.62, x + k * s * 0.72, y + s * 0.5);
        g.stroke();
        g.beginPath();
        g.moveTo(x, y - s * 1.5);
        g.bezierCurveTo(x + k * s * 1.3, y - s * 1.2, x + k * s * 1.5, y - s * 0.1, x + k * s * 0.7, y - s * 0.05);
        g.bezierCurveTo(x + k * s * 0.2, y, x + k * s * 0.25, y - s * 0.62, x + k * s * 0.72, y - s * 0.5);
        g.stroke();
        // folhinhas
        g.beginPath();
        g.ellipse(x + k * s * 1.56, y, s * 0.2, s * 0.5, 0, 0, TAU);
        g.fill();
      }
      // losango e pingos no eixo
      g.beginPath();
      g.moveTo(x, y - s * 0.42);
      g.lineTo(x + s * 0.26, y);
      g.lineTo(x, y + s * 0.42);
      g.lineTo(x - s * 0.26, y);
      g.closePath();
      g.fill();
      for (const dy of [-1.86, 1.86]) {
        g.beginPath();
        g.arc(x, y + dy * s, s * 0.16, 0, TAU);
        g.fill();
      }
    };
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) motif((col + (row % 2 ? 0.5 : 0)) * 4 * cm, Y(2.3 + row * 4), 0.86 * cm);
    }
    return { color, height: null };
  }

  // estilos com confeito
  const height = makeCanvas(size);
  const h = height.getContext('2d');
  h.fillStyle = 'rgb(30,30,30)';
  h.fillRect(0, 0, size, size);
  const under = trim.colors[trim.colors.length > 2 ? 2 : 0];
  const scatter = (count, yLo, yHi, keep) => {
    for (let i = 0; i < count; i++) {
      const x = r() * size;
      const hgt = yLo + r() * (yHi - yLo);
      const pieceSeed = Math.floor(r() * 1e9);
      if (r() > keep(x / size, hgt)) continue;
      const level = 0.5 + 0.5 * (i / count);
      for (const ox of [-size, 0, size]) {
        if (x + ox < -8 * mm || x + ox > size + 8 * mm) continue;
        trimPiece(g, h, trim, x + ox, Y(hgt), mm, rng(pieceSeed), level);
      }
    }
  };
  const perCm2 = { castanha: 26, granulado: 46, confeitos: 40, coco: 44, raspas: 20 }[trim.id] || 30;
  if (style === 'barrado') {
    const edge = raggedEdge(seed * 7 + 1);
    const bandTop = Math.min(3.4, top * 0.42);
    // fundo: o confeito fecha a faixa; por baixo dele só aparece a sombra entre as peças
    g.fillStyle = rgba(under, 0.82);
    g.beginPath();
    g.moveTo(0, size);
    for (let x = 0; x <= size; x += 2) g.lineTo(x, Y(bandTop - 0.35 + edge(x / size)));
    g.lineTo(size, size);
    g.closePath();
    g.fill();
    scatter(Math.round(perCm2 * 16 * (bandTop + 0.6)), -0.2, bandTop + 0.9, (u, hgt) => 1 - smooth(-0.3, 0.55, hgt - (bandTop + edge(u))));
  } else if (style === 'chuva') {
    const reach = top * 0.82;
    scatter(Math.round(perCm2 * 16 * reach * 0.62), -0.2, reach, (u, hgt) => Math.pow(1 - hgt / reach, 2.1) * 1.15);
  } else {
    // fault line
    const { lo, hi } = faultEdges(seed);
    g.fillStyle = rgba(under, 0.9);
    g.beginPath();
    for (let x = 0; x <= size; x += 2) g.lineTo(x, Y(mid + hi(x / size)));
    for (let x = size; x >= 0; x -= 2) g.lineTo(x, Y(mid + lo(x / size)));
    g.closePath();
    g.fill();
    scatter(Math.round(perCm2 * 16 * (FAULT_HALF * 2 + 1.2) * 1.15), mid - FAULT_HALF - 1.4, mid + FAULT_HALF + 1.4, (u, hgt) => (hgt > mid + lo(u) + 0.1 && hgt < mid + hi(u) - 0.1 ? 1 : 0));
    for (const [edge, side] of [
      [lo, -1],
      [hi, 1],
    ]) {
      // do lado de fora da faixa volta a ser só creme (as peças que passaram da beira ficam por baixo dele)
      const outside = (c) => {
        c.beginPath();
        for (let x = 0; x <= size; x += 2) c.lineTo(x, Y(mid + edge(x / size)));
        c.lineTo(size, side > 0 ? 0 : size);
        c.lineTo(0, side > 0 ? 0 : size);
        c.closePath();
        c.fill();
      };
      g.fillStyle = c1;
      outside(g);
      h.fillStyle = 'rgb(30,30,30)';
      outside(h);
      // a beira "rasgada" do creme, pintada de dourado
      for (const [col, w, off] of [
        ['#8a6414', 2.3, 0],
        ['#d9ac3e', 1.6, 0],
        ['#f7e3a0', 0.5, -0.3],
      ]) {
        g.strokeStyle = col;
        g.lineWidth = w * mm;
        g.lineJoin = 'round';
        g.beginPath();
        for (let x = -4; x <= size + 4; x += 2) g.lineTo(x, Y(mid + edge(x / size)) + off * mm);
        g.stroke();
      }
    }
  }
  return { color, height };
}

/**
 * Estilos pintados numa volta inteira do bolo (x = a volta, y = do pé ao alto; o alto do <canvas> é o alto do bolo).
 * L e H = comprimento da volta e altura da lateral, em cm, para as pinceladas e os veios não saírem esticados.
 *   marmorizado  veios finos e manchas largas de c2 em c1
 *   pinceladas   toques de espátula de c2, fechados no pé e soltos no alto
 */
export function paintWrapStyle(canvas, style, c1, c2, { seed = 7, L = 63, H = 9 } = {}) {
  const g = canvas.getContext('2d');
  const W = canvas.width;
  const Hp = canvas.height;
  g.globalAlpha = 1;
  if (style === 'marmorizado') {
    const cells = Math.max(3, Math.round(L / 9)); // um "nó" de veio a cada ~9 cm
    const n1 = tileNoise(cells, seed);
    const n2 = tileNoise(cells * 2, seed + 1);
    const n3 = tileNoise(cells * 5, seed + 2);
    const vy = H / 9;
    const a = hexRgb(c1);
    const b = hexRgb(c2);
    const img = g.createImageData(W, Hp);
    for (let y = 0; y < Hp; y++) {
      for (let x = 0; x < W; x++) {
        const u = x / W;
        const v = (y / Hp) * vy;
        const wu = u + (0.34 / cells) * (n2(u, v * 0.5) - 0.5);
        const wv = v + 0.5 * (n2(u + 0.31, v * 0.5 + 0.17) - 0.5);
        const f = n1(wu, wv / cells + 0.13) * 0.7 + n2(wu, wv / cells) * 0.3;
        const fine = n3(u, v / cells);
        const main = 1 - smooth(0.002, 0.016, Math.abs(f - 0.5)); // veio principal, fino
        const second = (1 - smooth(0.001, 0.009, Math.abs(f - 0.37 - 0.04 * fine))) * 0.6;
        const wash = smooth(0.5, 0.78, f) * 0.14 + (1 - smooth(0, 0.07, Math.abs(f - 0.5))) * 0.16; // mancha larga, quase transparente
        const k = Math.min(1, Math.max(main, second) * (0.65 + 0.35 * fine) + wash);
        const i = (y * W + x) * 4;
        img.data[i] = a[0] + (b[0] - a[0]) * k;
        img.data[i + 1] = a[1] + (b[1] - a[1]) * k;
        img.data[i + 2] = a[2] + (b[2] - a[2]) * k;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return;
  }
  // pinceladas
  g.fillStyle = c1;
  g.fillRect(0, 0, W, Hp);
  const r = rng(seed * 31 + 5);
  const sx = W / L;
  const sy = Hp / H;
  const tones = [c2, c2, mixRgb(c2, '#ffffff', 0.35), mixRgb(c2, c1, 0.4), mixRgb(c2, '#000000', 0.12)];
  const count = Math.round(L * H * 0.2);
  const list = Array.from({ length: count }, () => ({ x: r() * L, y: H * (0.04 + 0.8 * Math.pow(r(), 1.7)), len: 2 + r() * 1.7, wid: 0.9 + r() * 0.7, ang: -Math.PI / 2 + (r() - 0.5) * 1.5, tone: tones[Math.floor(r() * tones.length)], a: 0.75 + r() * 0.25 }));
  list.sort((p, q) => q.y - p.y); // as do alto primeiro: as de baixo, mais fechadas, vão por cima
  for (const st of list) {
    for (const ox of [-L, 0, L]) {
      if (st.x + ox < -4 || st.x + ox > L + 4) continue;
      g.save();
      g.translate((st.x + ox) * sx, Hp - st.y * sy);
      g.scale(sx, sy);
      g.rotate(st.ang);
      // a lâmina pousa cheia de creme (começo opaco, de borda arredondada) e sai arrastando até sumir
      const grad = g.createLinearGradient(0, 0, st.len, 0);
      grad.addColorStop(0, rgba(st.tone, st.a));
      grad.addColorStop(0.55, rgba(st.tone, st.a * 0.8));
      grad.addColorStop(1, rgba(st.tone, 0));
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, -st.wid / 2);
      g.bezierCurveTo(st.len * 0.5, -st.wid * 0.62, st.len * 0.9, -st.wid * 0.36, st.len, 0);
      g.bezierCurveTo(st.len * 0.9, st.wid * 0.36, st.len * 0.5, st.wid * 0.62, 0, st.wid / 2);
      g.bezierCurveTo(-st.wid * 0.36, st.wid * 0.3, -st.wid * 0.36, -st.wid * 0.3, 0, -st.wid / 2);
      g.fill();
      // o cordão de creme na beira por onde a lâmina entrou
      g.strokeStyle = rgba(mixRgb(st.tone, '#ffffff', 0.4), st.a * 0.7);
      g.lineWidth = 0.09;
      g.beginPath();
      g.moveTo(0.02, -st.wid * 0.42);
      g.bezierCurveTo(-st.wid * 0.3, -st.wid * 0.2, -st.wid * 0.3, st.wid * 0.2, 0.02, st.wid * 0.42);
      g.stroke();
      g.restore();
    }
  }
}

/** O topo do marmorizado: os mesmos veios, vistos de cima (o desenho cobre 2,9 raios de lado). */
export function paintMarbleTop(canvas, c1, c2, seed = 7) {
  const g = canvas.getContext('2d');
  const S = canvas.width;
  const n1 = tileNoise(3, seed + 40);
  const n2 = tileNoise(6, seed + 41);
  const n3 = tileNoise(15, seed + 42);
  const a = hexRgb(c1);
  const b = hexRgb(c2);
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const wu = u + 0.12 * (n2(u, v) - 0.5);
      const wv = v + 0.12 * (n2(u + 0.31, v + 0.17) - 0.5);
      const f = n1(wu, wv) * 0.7 + n2(wu, wv) * 0.3;
      const fine = n3(u, v);
      const main = 1 - smooth(0.002, 0.014, Math.abs(f - 0.5));
      const second = (1 - smooth(0.001, 0.008, Math.abs(f - 0.37 - 0.04 * fine))) * 0.6;
      const wash = smooth(0.5, 0.78, f) * 0.14 + (1 - smooth(0, 0.06, Math.abs(f - 0.5))) * 0.16;
      const k = Math.min(1, Math.max(main, second) * (0.65 + 0.35 * fine) + wash);
      const i = (y * S + x) * 4;
      img.data[i] = a[0] + (b[0] - a[0]) * k;
      img.data[i + 1] = a[1] + (b[1] - a[1]) * k;
      img.data[i + 2] = a[2] + (b[2] - a[2]) * k;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

/* ───────── r6-luz: acabamento dos materiais das peças ─────────
   As peças de decoração criam os seus materiais em decor.js, decor2.js, party.js e pecas-*.js. Com o estúdio
   novo (caixas de luz de verdade no ambiente), o motor passa cada um por aqui na primeira vez que é usado:
   metais deixam de "acender por conta própria" (era o que fazia as vezes de reflexo) e passam a refletir as
   caixas de luz; frutas, pérolas e chocolate ganham o brilho certo. A chave é o nome do material na
   biblioteca (lib.mat.<nome>) ou a chave de lib.custom(); um * no fim vale como prefixo. */
// (ouro e prata só parecem metal refletindo muita luz: o ambiente vale quase o dobro para eles, como numa tenda de
// luz; a cor de cada metal fica a do cardápio — o motor a converte em refletância de metal, ver engine.js)
const METAL = { metalness: 1, emissiveIntensity: 0, envMapIntensity: 1.9 };
export const MATERIAL_LOOK = {
  // ouro: metal de verdade (cor de base do ouro; o brilho é o estúdio refletido)
  gold: { ...METAL, roughness: 0.2 },
  goldPaint: { ...METAL, roughness: 0.28, emissiveIntensity: 0.05 },
  glitter: { ...METAL, roughness: 0.33, emissiveIntensity: 0.04 },
  'x2-goldleaf': { ...METAL, roughness: 0.2, emissiveIntensity: 0.03, envMapIntensity: 2.1 },
  'pk-metal': { ...METAL, roughness: 0.16 },
  'pk-glitter': { ...METAL, roughness: 0.35 },
  'pf-flake': { ...METAL, roughness: 0.22 },
  'pf-dragee': { ...METAL, roughness: 0.17 },
  'pf-starlet': { metalness: 0.9, roughness: 0.32, envMapIntensity: 1.8 },
  'pf-mirror*': { ...METAL, roughness: 0.07, envMapIntensity: 1.8 },
  'pt-ringMetal*': { ...METAL, roughness: 0.12, envMapIntensity: 1.9 },
  candleMetal: { ...METAL, roughness: 0.26 },
  // frutas: casca úmida (verniz) sobre a cor; o morango deixa passar um nada de luz
  strawberry: { roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.16, bumpScale: 1, envMapIntensity: 1.1 },
  blueberry: { color: 0x2f3a6e, roughness: 0.48, sheen: 1, sheenRoughness: 0.42, sheenColor: 0xaebcf0 },
  raspberry: { roughness: 0.36, clearcoat: 0.6, clearcoatRoughness: 0.2 },
  'pk-fruit': { roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.18 },
  'pf-grape': { roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.3 },
  'x2-candy': { roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.08 },
  // pérolas: lisas, com o nácar por cima
  pearl: { color: 0xfffaf2, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08, iridescence: 0.55, envMapIntensity: 1.25 },
  'pt-pearl': { roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.16 },
  // chocolate temperado: brilho macio, não espelho
  chocolate: { roughness: 0.38, clearcoat: 0.42, clearcoatRoughness: 0.26 },
  'x2-choc': { roughness: 0.34, clearcoat: 0.5, clearcoatRoughness: 0.24 },
  // creme de bico e pétalas: acetinado
  piping: { roughness: 0.58, sheen: 0.3, sheenRoughness: 0.5 },
  'pk-cream': { roughness: 0.58, sheen: 0.3, sheenRoughness: 0.5 },
  plaque: { roughness: 0.26, clearcoat: 0.7, clearcoatRoughness: 0.14 },
  // folhagem: sem luz própria (ela achatava as folhas)
  'pf-foliage': { emissiveIntensity: 0.12 },
};
const LOOK_PREFIXES = Object.keys(MATERIAL_LOOK).filter((k) => k.endsWith('*'));

/** O acabamento do material `key` (ou null). Metais sem entrada própria recebem o acerto geral dos metais. */
export function materialLook(key, mat) {
  if (MATERIAL_LOOK[key]) return MATERIAL_LOOK[key];
  const pre = LOOK_PREFIXES.find((k) => key.startsWith(k.slice(0, -1)));
  if (pre) return MATERIAL_LOOK[pre];
  if (mat && mat.metalness >= 0.75) return METAL;
  return null;
}
