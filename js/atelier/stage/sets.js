// BOLAB — Ateliê / Cena: os cenários em volta do bolo — 'bancada' (cozinha de confeitaria, com a bailarina),
// 'vitrine' (balcão de loja) e 'festa' (mesa de aniversário).
//
// Tudo procedural (nenhuma imagem baixada) e leve: um tampo (disco), a parede ao fundo (cilindro pintado, já
// desfocado), uma dúzia de objetos de fundo (cartazes desfocados que dão profundidade quando a câmera gira) e a
// peça sob a base do bolo (a bailarina, o pedestal da vitrine, o disco da mesa de festa) — menos de 2,5 mil
// triângulos. O tampo, a parede e os objetos não recebem luz (são pintados já com a luz da janela): no celular
// isso custa quase nada por pixel.
//
// As cores saem do FUNDO do palco (js/customizer/backdrop.js): perto do bolo o tampo tem o tom `ref` do fundo
// em uso e escurece para as bordas como o degradê dele — o contraste automático entre bolo e fundo, que já
// estava aprovado, continua valendo com a cozinha no lugar do degradê.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mixHex } from '../../customizer/backdrop.js';
import { softDotTexture } from './fx.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
export const SCENES = ['bancada', 'vitrine', 'festa'];

// O tampo vai até a parede, que fica perto (uns 90 cm atrás do bolo): na vista padrão o terço de cima do quadro
// mostra o pé da parede — azulejo, janela, prateleira — e o resto é tampo. As medidas verticais da parede são
// "de maquete" (a janela começa 10 cm acima do tampo): desfocada, ninguém mede, e assim ela cabe no quadro.
const BENCH_R = 9.4;
const WALL_R = 9.2;
const WALL_LOW = 1.5; // quanto a parede desce abaixo do tampo
const WALL_H = 12;
const COVE = 1.0; // o tampo sobe em curva até a parede (como fundo infinito de estúdio): não há quina dura no encontro

/* ───────── Pintura ───────── */

function rgba(hex, a = 1) {
  const n = parseInt(String(hex).replace('#', ''), 16) || 0;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
const shade = (hex, k) => mixHex(hex, k < 1 ? '#000000' : '#ffffff', k < 1 ? 1 - k : k - 1);

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

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Desfoque barato e que funciona em qualquer navegador: desenha pequeno e amplia com suavização. */
function blurInto(dst, paint, factor) {
  const small = canvasOf(Math.max(8, Math.round(dst.width / factor)), Math.max(8, Math.round(dst.height / factor)));
  const g = small.getContext('2d');
  g.scale(small.width / dst.width, small.height / dst.height);
  paint(g);
  const out = dst.getContext('2d');
  out.imageSmoothingEnabled = true;
  out.imageSmoothingQuality = 'high';
  out.drawImage(small, 0, 0, dst.width, dst.height);
}

/** As cores de um cenário a partir do fundo do palco. */
function palette(b, id) {
  const dark = b.tone === 'dark';
  const near = mixHex(b.c[0], b.c[1], 0.55);
  const wall = dark ? mixHex(b.c[2], b.c[3], 0.45) : mixHex(b.c[1], b.c[2], 0.75);
  return {
    dark,
    near, // tampo junto do bolo (≈ b.ref)
    mid: b.c[1],
    far: b.c[2],
    edge: b.c[3],
    wall,
    // azulejo: um pouco mais claro que a parede (no escuro, um pouco mais aceso)
    splash: dark ? mixHex(wall, b.c[1], 0.45) : mixHex(wall, b.c[0], 0.5),
    wallHigh: dark ? shade(b.c[3], 0.78) : mixHex(b.c[1], b.c[2], 0.35),
    line: dark ? mixHex(b.c[0], '#ffffff', 0.25) : shade(b.c[3], 0.74),
    lineA: dark ? 0.08 : id === 'festa' ? 0.2 : 0.14,
    glow: dark ? '#ffd9a6' : '#fffaf0',
    glowA: dark ? 0.5 : 0.9,
    // tons dos objetos de fundo: perto do tom da parede, para não brigar com o bolo
    thing: (accent, k = 0.42) => mixHex(dark ? mixHex(b.c[1], b.c[2], 0.6) : mixHex(b.c[1], b.c[2], 0.5), accent, dark ? k * 0.8 : k),
  };
}

const ACCENTS = ['#8fb7a2', '#e9c58a', '#d98a8a', '#b7a6d6', '#f3e6d2', '#9bbfd6', '#e7a86a'];
const PARTY = ['#f0527a', '#ffd166', '#8fd3c8', '#c9a0dc', '#ff9f6b', '#7ec4f0', '#fff3e0'];

/* Tampo: canvas X ↔ x do mundo, canvas Y ↔ z do mundo (para baixo = frente da vista padrão). */
function paintBench(c, id, P) {
  const S = c.width;
  const g = c.getContext('2d');
  const u = S / (BENCH_R * 2); // pixels por unidade do mundo (1 unidade = 10 cm)
  const h = S / 2;
  const base = g.createRadialGradient(h, h, 0, h, h, h);
  base.addColorStop(0, P.near);
  base.addColorStop(0.3, mixHex(P.near, P.mid, 0.75));
  base.addColorStop(0.62, P.far);
  base.addColorStop(0.93, P.edge);
  base.addColorStop(1, shade(P.edge, 0.9));
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  const r = rng(id === 'bancada' ? 11 : id === 'vitrine' ? 23 : 37);

  if (id === 'bancada') {
    // mármore: manchas largas e veios finos, tudo com pouco contraste
    const marks = canvasOf(S, S);
    blurInto(marks, (q) => {
      for (let i = 0; i < 30; i++) {
        const x = r() * S;
        const y = r() * S;
        const rad = (0.9 + r() * 2.6) * u;
        const blot = q.createRadialGradient(x, y, 0, x, y, rad);
        blot.addColorStop(0, rgba(i % 2 ? P.line : P.near, P.dark ? 0.12 : 0.2));
        blot.addColorStop(1, rgba(P.line, 0));
        q.fillStyle = blot;
        q.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    }, 6);
    g.drawImage(marks, 0, 0);
    // veios: finos, claros e escuros, levemente borrados (mármore, não rachadura)
    const veins = canvasOf(S, S);
    blurInto(veins, (q) => {
      q.lineCap = 'round';
      q.lineJoin = 'round';
      for (let i = 0; i < 34; i++) {
        let x = r() * S;
        let y = r() * S;
        let a = r() * TAU;
        q.strokeStyle = rgba(i % 3 ? P.line : '#ffffff', (i % 3 ? P.lineA : P.dark ? 0.07 : 0.26) * (0.4 + r() * 0.7));
        q.lineWidth = (0.03 + r() * 0.07) * u;
        q.beginPath();
        q.moveTo(x, y);
        for (let k = 0; k < 10; k++) {
          a += (r() - 0.5) * 0.9;
          x += Math.cos(a) * u * 0.6;
          y += Math.sin(a) * u * 0.6;
          q.lineTo(x, y);
        }
        q.stroke();
      }
    }, 1.6);
    g.drawImage(veins, 0, 0);
  } else if (id === 'vitrine') {
    // balcão de pedra clara em placas: juntas finas e uma mancha ou outra
    g.strokeStyle = rgba(P.line, P.lineA * 0.8);
    g.lineWidth = Math.max(1, 0.03 * u);
    for (let x = -BENCH_R; x <= BENCH_R; x += 3.4) {
      g.beginPath();
      g.moveTo(h + (x + 1.7) * u, 0);
      g.lineTo(h + (x + 1.7) * u, S);
      g.stroke();
    }
    const marks = canvasOf(S, S);
    blurInto(marks, (q) => {
      for (let i = 0; i < 18; i++) {
        const x = r() * S;
        const y = r() * S;
        const rad = (1.2 + r() * 2.4) * u;
        const blot = q.createRadialGradient(x, y, 0, x, y, rad);
        blot.addColorStop(0, rgba(P.dark ? '#ffffff' : P.line, P.dark ? 0.06 : 0.12));
        blot.addColorStop(1, rgba(P.line, 0));
        q.fillStyle = blot;
        q.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    }, 6);
    g.drawImage(marks, 0, 0);
  } else {
    // toalha de festa: poás miúdos e confete de papel caído longe do bolo
    g.fillStyle = rgba(P.dark ? '#ffffff' : P.line, P.dark ? 0.08 : 0.17);
    const step = 0.56;
    for (let ix = -18; ix <= 18; ix++) {
      for (let iz = -18; iz <= 18; iz++) {
        const x = (ix + (iz % 2 ? 0.5 : 0)) * step;
        const z = iz * step;
        if (Math.hypot(x, z) > BENCH_R) continue;
        g.beginPath();
        g.arc(h + x * u, h + z * u, 0.075 * u, 0, TAU);
        g.fill();
      }
    }
    for (let i = 0; i < 130; i++) {
      const a = r() * TAU;
      const d = 2.5 + r() * 6.4;
      g.save();
      g.translate(h + Math.cos(a) * d * u, h + Math.sin(a) * d * u);
      g.rotate(r() * TAU);
      g.fillStyle = rgba(PARTY[i % PARTY.length], P.dark ? 0.62 : 0.82);
      g.fillRect(-0.07 * u, -0.04 * u, 0.14 * u, 0.08 * u);
      g.restore();
    }
  }

  // luz da janela: vidraças claras deitadas no tampo, vindas do fundo (bem macias)
  const panes = canvasOf(S, S);
  blurInto(panes, (q) => {
    q.save();
    q.translate(h + 0.9 * u, h - 2.2 * u);
    q.rotate(0.5);
    q.transform(1, 0, 0.5, 1, 0, 0);
    q.fillStyle = rgba(P.glow, 1);
    const cols = id === 'festa' ? 1 : 2;
    const rows = id === 'vitrine' ? 2 : 3;
    for (let ix = 0; ix < cols; ix++) for (let iy = 0; iy < rows; iy++) q.fillRect((ix * 2.1 - cols * 1.05) * u, (iy * 1.9 - rows * 0.95) * u, 1.85 * u, 1.6 * u);
    q.restore();
  }, 12);
  g.globalAlpha = P.dark ? 0.16 : 0.4;
  g.globalCompositeOperation = P.dark ? 'screen' : 'soft-light';
  g.drawImage(panes, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  // sombra macia no encontro com a parede
  const rimShade = g.createRadialGradient(h, h, h * 0.8, h, h, h);
  rimShade.addColorStop(0, rgba('#000000', 0));
  rimShade.addColorStop(0.75, rgba('#000000', P.dark ? 0.28 : 0.14));
  rimShade.addColorStop(1, rgba('#000000', P.dark ? 0.28 : 0.14));
  g.fillStyle = rimShade;
  g.fillRect(0, 0, S, S);
}

/* Parede: canvas X = volta inteira (θ = 0 na frente da vista padrão), canvas Y = altura (em cima = alto). */
function paintWall(c, id, P) {
  const W = c.width;
  const H = c.height;
  const g = c.getContext('2d');
  const ux = W / (TAU * WALL_R); // pixels por unidade, na horizontal
  const uy = H / WALL_H;
  const Y = (hgt) => H - (hgt + WALL_LOW) * uy; // altura acima do tampo → pixel
  const X = (deg) => ((((deg % 360) + 360) % 360) / 360) * W;
  const SPLASH = id === 'festa' ? 0 : 2.5; // altura do azulejo
  const base = g.createLinearGradient(0, Y(-WALL_LOW), 0, Y(WALL_H - WALL_LOW));
  const at = (hgt) => (hgt + WALL_LOW) / WALL_H;
  // até onde a curva do tampo chega (uns 4 cm de altura), a parede tem a cor dela; depois abre para o azulejo
  const foot = shade(P.edge, P.dark ? 0.72 : 0.86);
  base.addColorStop(0, foot);
  base.addColorStop(at(0.45), foot);
  if (SPLASH) {
    base.addColorStop(at(1.5), P.splash);
    base.addColorStop(at(SPLASH), P.splash);
    base.addColorStop(at(SPLASH + 0.08), P.wall);
  } else base.addColorStop(at(1.7), P.wall);
  base.addColorStop(1, P.wallHigh);
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  const r = rng(id === 'bancada' ? 5 : id === 'vitrine' ? 17 : 29);
  // tudo o que fica na parede é pintado pequeno e ampliado: sai desfocado, como fundo de fotografia
  const soft = canvasOf(W, H);
  // desenha uma forma também na emenda (X perto de 0 ou de W), para a volta fechar sem costura
  const wrap = (q, x, fn) => {
    [x - W, x, x + W].forEach((xx) => {
      q.save();
      q.translate(xx, 0);
      fn(q);
      q.restore();
    });
  };
  const windowAt = (q, deg, wUnits, lo, hi, panesX, panesY) =>
    wrap(q, X(deg), (qq) => {
      const w = wUnits * ux;
      const y0 = Y(hi);
      const hh = Y(lo) - Y(hi);
      qq.save();
      qq.translate(0, y0 + hh / 2);
      qq.scale(1, (hh * 1.3) / (w * 1.5));
      const halo = qq.createRadialGradient(0, 0, 0, 0, 0, w * 1.1);
      halo.addColorStop(0, rgba(P.glow, P.glowA * 0.45));
      halo.addColorStop(1, rgba(P.glow, 0));
      qq.fillStyle = halo;
      qq.fillRect(-w * 1.1, -w * 1.1, w * 2.2, w * 2.2);
      qq.restore();
      // moldura e vidraças
      qq.fillStyle = rgba(P.dark ? shade(P.wall, 1.3) : '#ffffff', 0.9);
      qq.fillRect(-w / 2 - 0.12 * ux, y0 - 0.12 * uy, w + 0.24 * ux, hh + 0.24 * uy);
      qq.fillStyle = rgba(P.glow, P.glowA);
      const gap = 0.14 * ux;
      const gapY = 0.14 * uy;
      const pw = (w - gap * (panesX - 1)) / panesX;
      const ph = (hh - gapY * (panesY - 1)) / panesY;
      for (let i = 0; i < panesX; i++) for (let j = 0; j < panesY; j++) qq.fillRect(-w / 2 + i * (pw + gap), y0 + j * (ph + gapY), pw, ph);
    });
  const shelf = (q, deg, wUnits, hgt, thick = 0.14) =>
    wrap(q, X(deg), (qq) => {
      qq.fillStyle = rgba(P.dark ? shade(P.wall, 1.35) : shade(P.wall, 0.82), 0.95);
      qq.fillRect((-wUnits / 2) * ux, Y(hgt), wUnits * ux, thick * uy);
      qq.fillStyle = rgba('#000000', P.dark ? 0.22 : 0.1);
      qq.fillRect((-wUnits / 2) * ux, Y(hgt) + thick * uy, wUnits * ux, 0.2 * uy);
    });
  const blob = (q, deg, hgt, wUnits, hUnits, color, round = 0.3) =>
    wrap(q, X(deg), (qq) => {
      const w = wUnits * ux;
      const hh = hUnits * uy;
      qq.fillStyle = color;
      qq.beginPath();
      const rad = Math.min(w, hh) * round;
      const x0 = -w / 2;
      const y0 = Y(hgt + hUnits);
      qq.moveTo(x0 + rad, y0);
      qq.arcTo(x0 + w, y0, x0 + w, y0 + hh, rad);
      qq.arcTo(x0 + w, y0 + hh, x0, y0 + hh, rad * 0.4);
      qq.arcTo(x0, y0 + hh, x0, y0, rad * 0.4);
      qq.arcTo(x0, y0, x0 + w, y0, rad);
      qq.fill();
    });
  const bokeh = (q, deg, hgt, radUnits, color, a) =>
    wrap(q, X(deg), (qq) => {
      const rx = radUnits * ux;
      const ry = radUnits * uy;
      qq.save();
      qq.translate(0, Y(hgt));
      qq.scale(1, ry / rx);
      const grad = qq.createRadialGradient(0, 0, 0, 0, 0, rx);
      grad.addColorStop(0, rgba(color, a));
      grad.addColorStop(0.72, rgba(color, a * 0.82));
      grad.addColorStop(1, rgba(color, 0));
      qq.fillStyle = grad;
      qq.fillRect(-rx, -rx, rx * 2, rx * 2);
      qq.restore();
    });
  const degOf = (units) => (units / (TAU * WALL_R)) * 360;
  const things = (q, deg, wUnits, hgt, colors, hMax = 1.2, mix = 0.5) => {
    for (let x = -wUnits / 2 + 0.5; x < wUnits / 2 - 0.4; x += 0.85 + r() * 0.9) {
      blob(q, deg + degOf(x), hgt, 0.5 + r() * 0.5, 0.5 + r() * (hMax - 0.5), rgba(P.thing(colors[Math.floor(r() * colors.length)], mix), 0.92), 0.2 + r() * 0.3);
    }
  };

  blurInto(
    soft,
    (q) => {
      if (id === 'bancada') {
        // cozinha: janelas dos dois lados (o fundo do meio fica calmo), prateleiras com potes, azulejo baixo
        windowAt(q, 150, 6.2, 1.0, 7.4, 2, 3);
        windowAt(q, 262, 6.2, 1.0, 7.4, 2, 3);
        windowAt(q, 28, 5, 1.2, 7, 2, 3);
        [
          [206, 13],
          [320, 12],
          [88, 11],
        ].forEach(([deg, w]) => {
          [3.3, 5.5].forEach((hgt) => {
            shelf(q, deg, w, hgt);
            things(q, deg, w, hgt + 0.14, ACCENTS, 1.5);
          });
        });
        // alguma coisa encostada na parede, em cima do tampo
        [
          [196, 3],
          [226, 2.4],
          [306, 3.4],
          [70, 3],
          [352, 2.6],
        ].forEach(([deg, w]) => things(q, deg, w, 0, ACCENTS, 1.3, 0.4));
      } else if (id === 'vitrine') {
        // loja: vitrine de rua de um lado, prateleiras de doces, luminárias pendentes e um fio de luzinhas
        windowAt(q, 150, 9, 0.8, 8.5, 3, 1);
        windowAt(q, 292, 5, 1.2, 7.5, 1, 2);
        [
          [214, 16],
          [352, 14],
          [70, 11],
        ].forEach(([deg, w]) => {
          [1.1, 3.1, 5.2].forEach((hgt) => {
            shelf(q, deg, w, hgt, 0.2);
            things(q, deg, w, hgt + 0.2, PARTY, 1.3, 0.5);
          });
        });
        for (let i = 0; i < 30; i++) bokeh(q, r() * 360, 4.2 + r() * 4.5, 0.42 + r() * 0.5, P.glow, P.dark ? 0.8 : 0.65);
        for (let deg = 0; deg < 360; deg += 4.2) bokeh(q, deg + r() * 1.5, 2.45 + 0.25 * Math.sin(deg / 9), 0.17, P.glow, P.dark ? 0.9 : 0.75);
      } else {
        // festa: balões em cachos, bandeirolas e luzinhas
        for (let k = 0; k < 8; k++) {
          const deg = 12 + k * 45 + r() * 10;
          for (let i = 0; i < 5; i++) bokeh(q, deg + (r() - 0.5) * 9, 1.3 + r() * 3.6, 0.8 + r() * 0.35, P.thing(PARTY[(k + i) % PARTY.length], 0.85), 0.96);
        }
        for (let deg = 0; deg < 360; deg += 4.4) {
          const sag = Math.abs(Math.sin((deg / 44) * Math.PI));
          const hgt = 3.9 - sag * 0.8;
          wrap(q, X(deg), (qq) => {
            qq.fillStyle = rgba(P.thing(PARTY[Math.round(deg / 4.4) % PARTY.length], 0.9), 0.96);
            qq.beginPath();
            qq.moveTo(-0.34 * ux, Y(hgt));
            qq.lineTo(0.34 * ux, Y(hgt));
            qq.lineTo(0, Y(hgt - 0.8));
            qq.fill();
          });
        }
        for (let i = 0; i < 46; i++) bokeh(q, r() * 360, 0.5 + r() * 7, 0.14 + r() * 0.2, P.glow, P.dark ? 0.85 : 0.6);
      }
    },
    4,
  );
  g.drawImage(soft, 0, 0);
  if (SPLASH) {
    // azulejo de metrô: rejunte fino (só se percebe de perto, o que dá escala à parede)
    g.fillStyle = rgba(P.line, P.lineA * 0.55);
    const rowH = (SPLASH - 0.9) / 3;
    for (let row = 0; row < 3; row++) {
      g.fillRect(0, Y(0.9 + (row + 1) * rowH), W, Math.max(1, 0.03 * uy));
      for (let x = (row % 2) * 0.7; x < TAU * WALL_R; x += 1.4) g.fillRect(x * ux, Y(0.9 + (row + 1) * rowH), Math.max(1, 0.035 * ux), rowH * uy);
    }
  }
}

/* Objetos de fundo: silhuetas simples, pintadas pequenas (saem desfocadas). Um atlas de 4 × 2 por cenário. */
const CELL = 128;
const PROPS = {
  bancada: ['pote', 'tigelas', 'vaso', 'garrafa', 'utensilios', 'jarra', 'balanca', 'pote'],
  vitrine: ['boloNoPe', 'cupcakes', 'redoma', 'pote', 'vaso', 'boloNoPe', 'cupcakes', 'jarra'],
  festa: ['baloes', 'presentes', 'chapeus', 'copos', 'baloes', 'presentes', 'pirulitos', 'chapeus'],
};
/** Onde cada objeto fica: [azimute em graus (0 = frente da vista padrão), distância do eixo, largura, altura]. */
const SPOTS = [
  [176, 8.1, 1.8, 2.4],
  [232, 7.9, 1.9, 2.5],
  [262, 7.0, 1.6, 2.1],
  [150, 7.4, 1.6, 2.1],
  [296, 7.8, 1.8, 2.4],
  [124, 6.9, 1.5, 2.0],
  [330, 7.3, 1.6, 2.1],
  [98, 8.0, 1.8, 2.4],
  [20, 7.9, 1.8, 2.3],
  [62, 7.4, 1.6, 2.1],
];

function paintProps(c, id, P) {
  const kinds = PROPS[id];
  blurInto(
    c,
    (q) => {
      q.clearRect(0, 0, c.width, c.height);
      kinds.forEach((kind, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        q.save();
        q.beginPath();
        q.rect(col * CELL, row * CELL, CELL, CELL);
        q.clip();
        q.translate(col * CELL + CELL / 2, row * CELL + CELL * 0.92);
        const u = CELL * 0.0098; // 1 = 1% da célula; o chão é y = 0 e o objeto sobe para −y
        const a = P.thing(ACCENTS[(i * 3 + 1) % ACCENTS.length], 0.5);
        const b = P.thing(ACCENTS[(i * 5 + 2) % ACCENTS.length], 0.5);
        const hi = P.thing('#ffffff', P.dark ? 0.5 : 0.7);
        const box = (x, y, w, h, rad, fill) => {
          q.fillStyle = fill;
          q.beginPath();
          // (roundRect não existe em WebView antigo: lá os cantos ficam retos, e o desfoque disfarça)
          if (q.roundRect) q.roundRect(x * u, -y * u - h * u, w * u, h * u, rad * u);
          else q.rect(x * u, -y * u - h * u, w * u, h * u);
          q.fill();
        };
        const disc = (x, y, rx, ry, fill) => {
          q.fillStyle = fill;
          q.beginPath();
          q.ellipse(x * u, -y * u, rx * u, ry * u, 0, 0, TAU);
          q.fill();
        };
        // sombra no tampo
        disc(0, 0, 30, 4.5, rgba('#000000', P.dark ? 0.3 : 0.12));
        if (kind === 'pote') {
          box(-18, 0, 36, 56, 9, rgba(a, 0.94));
          box(-14, 6, 28, 30, 6, rgba(b, 0.85));
          box(-20, 56, 40, 9, 3, rgba(hi, 0.96));
        } else if (kind === 'tigelas') {
          for (let k = 0; k < 3; k++) {
            q.fillStyle = rgba(k % 2 ? a : hi, 0.96);
            q.beginPath();
            q.ellipse(0, -(22 + k * 9) * u, (30 - k * 2) * u, 20 * u, 0, 0, Math.PI);
            q.fill();
          }
          box(-12, 0, 24, 4, 2, rgba(hi, 0.96));
        } else if (kind === 'vaso') {
          box(-12, 0, 24, 30, 5, rgba(hi, 0.96));
          for (let k = 0; k < 9; k++) disc(-20 + k * 5, 40 + ((k * 7) % 22), 9, 13, rgba(P.thing('#7fae8a', 0.8), 0.85));
        } else if (kind === 'garrafa') {
          box(-11, 0, 22, 52, 7, rgba(a, 0.92));
          box(-4.5, 52, 9, 24, 3, rgba(a, 0.92));
          box(-6, 74, 12, 6, 2, rgba(hi, 0.96));
        } else if (kind === 'utensilios') {
          box(-15, 0, 30, 34, 5, rgba(hi, 0.96));
          [-9, -2, 6, 12].forEach((x, k) => {
            box(x - 1.5, 30, 3, 40 + k * 4, 1.5, rgba(b, 0.92));
            disc(x, 76 + k * 4, 5 + (k % 2) * 2, 8, rgba(k % 2 ? a : b, 0.92));
          });
        } else if (kind === 'jarra') {
          box(-16, 0, 32, 48, 9, rgba(hi, 0.96));
          box(14, 16, 12, 22, 6, rgba(hi, 0.8));
          box(-16, 0, 32, 20, 9, rgba(a, 0.6));
        } else if (kind === 'balanca') {
          box(-26, 0, 52, 14, 4, rgba(a, 0.92));
          box(-3, 14, 6, 10, 2, rgba(hi, 0.92));
          box(-30, 24, 60, 5, 2.5, rgba(hi, 0.96));
        } else if (kind === 'boloNoPe') {
          box(-4, 0, 8, 24, 2, rgba(hi, 0.96));
          box(-26, 24, 52, 5, 2.5, rgba(hi, 0.96));
          box(-19, 29, 38, 30, 5, rgba(a, 0.96));
          box(-19, 51, 38, 8, 4, rgba(hi, 0.92));
        } else if (kind === 'cupcakes') {
          [0, 1, 2].forEach((k) => {
            box(-28 + k * 7, k * 24, 56 - k * 14, 4, 2, rgba(hi, 0.96));
            for (let x = -22 + k * 7; x <= 22 - k * 7; x += 11) {
              box(x - 4, k * 24 + 4, 8, 7, 1.5, rgba(b, 0.92));
              disc(x, k * 24 + 14, 5.5, 5, rgba(k % 2 ? a : P.thing('#f0527a', 0.6), 0.96));
            }
          });
          box(-2, 0, 4, 52, 1, rgba(hi, 0.92));
        } else if (kind === 'redoma') {
          box(-28, 0, 56, 6, 3, rgba(hi, 0.96));
          q.fillStyle = rgba(hi, 0.42);
          q.beginPath();
          q.ellipse(0, -6 * u, 24 * u, 46 * u, 0, Math.PI, TAU);
          q.fill();
          box(-14, 6, 28, 20, 4, rgba(a, 0.96));
          disc(0, 54, 4, 4, rgba(hi, 0.96));
        } else if (kind === 'baloes') {
          [
            [-14, 62, 0],
            [12, 70, 1],
            [0, 84, 2],
          ].forEach(([x, y, k]) => {
            q.strokeStyle = rgba(hi, 0.6);
            q.lineWidth = 0.8 * u;
            q.beginPath();
            q.moveTo(0, 0);
            q.lineTo(x * u, -(y - 13) * u);
            q.stroke();
            disc(x, y, 12, 14.5, rgba(P.thing(PARTY[(i + k) % PARTY.length], 0.88), 0.97));
            disc(x - 4, y + 5, 3, 4, rgba('#ffffff', 0.35));
          });
        } else if (kind === 'presentes') {
          box(-24, 0, 48, 28, 3, rgba(P.thing(PARTY[i % PARTY.length], 0.78), 0.97));
          box(-3, 0, 6, 28, 0, rgba(hi, 0.92));
          box(-15, 28, 30, 20, 3, rgba(P.thing(PARTY[(i + 2) % PARTY.length], 0.78), 0.97));
          box(-2.5, 28, 5, 20, 0, rgba(hi, 0.92));
          disc(-5, 51, 6, 4, rgba(hi, 0.92));
          disc(5, 51, 6, 4, rgba(hi, 0.92));
        } else if (kind === 'chapeus') {
          [-13, 12].forEach((x, k) => {
            q.fillStyle = rgba(P.thing(PARTY[(i + k * 2) % PARTY.length], 0.82), 0.97);
            q.beginPath();
            q.moveTo((x - 12) * u, 0);
            q.lineTo((x + 12) * u, 0);
            q.lineTo(x * u, -(40 + k * 6) * u);
            q.fill();
            disc(x, 42 + k * 6, 4, 4, rgba(hi, 0.96));
          });
        } else if (kind === 'copos') {
          [-14, 0, 14].forEach((x, k) => {
            q.fillStyle = rgba(P.thing(PARTY[(i + k) % PARTY.length], 0.72), 0.96);
            q.beginPath();
            q.moveTo((x - 5) * u, 0);
            q.lineTo((x + 5) * u, 0);
            q.lineTo((x + 7.5) * u, -26 * u);
            q.lineTo((x - 7.5) * u, -26 * u);
            q.fill();
          });
        } else if (kind === 'pirulitos') {
          box(-13, 0, 26, 26, 5, rgba(hi, 0.92));
          [-9, 0, 9].forEach((x, k) => {
            box(x - 0.8, 24, 1.6, 30 + k * 5, 0.8, rgba(hi, 0.96));
            disc(x, 60 + k * 5, 8, 8, rgba(P.thing(PARTY[(i + k) % PARTY.length], 0.88), 0.97));
          });
        }
        // volume: a luz vem de um lado, o outro escurece um pouco
        q.globalCompositeOperation = 'source-atop';
        const vol = q.createLinearGradient(-30 * u, 0, 30 * u, 0);
        vol.addColorStop(0, rgba('#ffffff', 0.16));
        vol.addColorStop(0.5, rgba('#ffffff', 0));
        vol.addColorStop(1, rgba('#000000', P.dark ? 0.26 : 0.14));
        q.fillStyle = vol;
        q.fillRect(-CELL / 2, -CELL, CELL, CELL);
        q.globalCompositeOperation = 'source-over';
        q.restore();
      });
    },
    2.6,
  );
}

/* ───────── Peças 3D sob a base ───────── */

/** A bailarina: prato giratório de metal esmaltado sobre um pé baixo e pesado. Topo em y = 0. */
function turntableGeo(R, low) {
  const top = [
    [0, -0.052],
    [R * 0.96, -0.052],
    [R, -0.04],
    [R, -0.012],
    [R - 0.012, 0],
    [0, 0],
  ];
  const foot = [
    [0, -0.3],
    [R * 0.66, -0.3],
    [R * 0.68, -0.285],
    [R * 0.66, -0.25],
    [R * 0.34, -0.2],
    [R * 0.22, -0.14],
    [R * 0.22, -0.07],
    [R * 0.3, -0.052],
    [0, -0.052],
  ];
  const lathe = (pts) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), low ? 36 : 64);
  return { top: lathe(top), foot: lathe(foot), height: 0.3, baseR: R * 0.68 };
}

/** Pedestal da vitrine: um tambor de pedra clara com um filete dourado. Topo em y = 0. */
function riserGeo(R, low) {
  const body = [
    [0, -0.4],
    [R - 0.02, -0.4],
    [R, -0.38],
    [R, -0.03],
    [R - 0.03, 0],
    [0, 0],
  ];
  const band = [
    [R + 0.004, -0.3],
    [R + 0.012, -0.29],
    [R + 0.012, -0.25],
    [R + 0.004, -0.24],
  ];
  const lathe = (pts) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), low ? 36 : 64);
  return { top: lathe(body), foot: lathe(band), height: 0.4, baseR: R };
}

/** Disco fino sob a base na mesa de festa (um sousplat dourado). Topo em y = 0. */
function boardGeo(R, low) {
  const pts = [
    [0, -0.03],
    [R, -0.03],
    [R + 0.012, -0.015],
    [R, 0],
    [0, 0],
  ];
  return { top: new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), low ? 36 : 64), foot: null, height: 0.03, baseR: R };
}


/* ───────── Objetos de verdade no tampo ─────────
   Poucas peças em 3D, com a mesma luz do bolo, pousadas em volta dele: é o que faz o tampo deixar de ser um
   fundo pintado. Ficam a uns 20 cm da base — atrás e dos lados do bolo na vista padrão; as que estariam na
   frente caem fora do quadro (abaixo dele), então nunca tapam o bolo. Cada cenário tem as suas.
   Cada item: [construtor, azimute em graus (0 = frente da vista padrão), afastamento da base, giro]. */
function buildThings(id, low, M) {
  const seg = low ? 12 : 22;
  const geos = [];
  const keep = (g) => {
    geos.push(g);
    return g;
  };
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
    const ms = new THREE.Mesh(keep(geo), mat);
    ms.position.set(x, y, z);
    ms.castShadow = false;
    ms.receiveShadow = false;
    return ms;
  };
  const lathe = (pts) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
  const group = (...parts) => {
    const g = new THREE.Group();
    parts.forEach((p) => g.add(p));
    return g;
  };
  const make = {
    // tigela de louça com creme batido e a espátula dentro
    tigela() {
      const bowl = mesh(lathe([[0, 0], [0.24, 0], [0.29, 0.02], [0.43, 0.19], [0.5, 0.36], [0.51, 0.4], [0.485, 0.4], [0.46, 0.36], [0.3, 0.3], [0, 0.28]]), M.enamel);
      const cream = mesh(lathe([[0.47, 0.33], [0.36, 0.36], [0.2, 0.41], [0.08, 0.44], [0, 0.45]]), M.cream);
      const handle = mesh(new THREE.CapsuleGeometry(0.03, 0.46, 2, 8), M.pink, 0.27, 0.56, 0.05);
      handle.rotation.z = -0.62;
      return { object: group(bowl, cream, handle), foot: 0.5 };
    },
    // pote de confeitos com tampa de metal
    pote() {
      return { object: group(mesh(new THREE.CylinderGeometry(0.17, 0.16, 0.3, seg), M.mint, 0, 0.15, 0), mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.06, seg), M.steel, 0, 0.33, 0)), foot: 0.2 };
    },
    // rolo de massa
    rolo() {
      const body = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.78, seg), M.wood, 0, 0.076, 0);
      body.rotation.z = Math.PI / 2;
      const a = mesh(new THREE.CapsuleGeometry(0.032, 0.14, 2, 8), M.woodDark, 0.5, 0.076, 0);
      const b = mesh(new THREE.CapsuleGeometry(0.032, 0.14, 2, 8), M.woodDark, -0.5, 0.076, 0);
      a.rotation.z = b.rotation.z = Math.PI / 2;
      return { object: group(body, a, b), foot: 0.5, flat: true };
    },
    // três ovos
    ovos() {
      const egg = keep(new THREE.SphereGeometry(0.1, seg, Math.max(6, seg / 2)));
      const one = (x, z, turn) => {
        const ms = new THREE.Mesh(egg, M.egg);
        ms.scale.set(1, 1, 1.32);
        ms.position.set(x, 0.098, z);
        ms.rotation.y = turn;
        ms.castShadow = false;
        return ms;
      };
      return { object: group(one(-0.13, 0, 0.4), one(0.13, 0.04, -0.7), one(0.01, -0.2, 1.4)), foot: 0.3 };
    },
    // bisnaga de calda em pé
    bisnaga() {
      const tip = mesh(new THREE.ConeGeometry(0.035, 0.13, seg), M.pink, 0, 0.5, 0);
      return { object: group(mesh(new THREE.CapsuleGeometry(0.09, 0.24, 3, seg), M.cream, 0, 0.21, 0), mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.05, seg), M.pink, 0, 0.42, 0), tip), foot: 0.14 };
    },
    // pratinho com três cupcakes
    cupcakes() {
      const plate = mesh(lathe([[0, 0], [0.34, 0], [0.44, 0.03], [0.45, 0.045], [0.34, 0.03], [0, 0.03]]), M.enamel);
      const cupGeo = keep(new THREE.CylinderGeometry(0.125, 0.09, 0.13, seg));
      const swirl = keep(lathe([[0.135, 0], [0.14, 0.04], [0.1, 0.08], [0.105, 0.11], [0.06, 0.15], [0.065, 0.175], [0, 0.22]]));
      const g = group(plate);
      [[-0.17, 0.08, M.pink], [0.17, 0.08, M.mint], [0, -0.17, M.yellow]].forEach(([x, z, paper]) => {
        const cup = new THREE.Mesh(cupGeo, paper);
        cup.position.set(x, 0.095, z);
        const top = new THREE.Mesh(swirl, M.cream);
        top.position.set(x, 0.16, z);
        cup.castShadow = top.castShadow = false;
        g.add(cup, top);
      });
      return { object: g, foot: 0.45 };
    },
    // caixas de doces empilhadas, com a cinta dourada
    caixas() {
      return {
        object: group(mesh(new THREE.BoxGeometry(0.56, 0.17, 0.4), M.pink, 0, 0.085, 0), mesh(new THREE.BoxGeometry(0.57, 0.04, 0.41), M.gold, 0, 0.085, 0), mesh(new THREE.BoxGeometry(0.44, 0.15, 0.32), M.cream, 0.02, 0.245, 0.01), mesh(new THREE.BoxGeometry(0.45, 0.035, 0.33), M.gold, 0.02, 0.245, 0.01)),
        foot: 0.42,
      };
    },
    // pilha de pratinhos
    pratos() {
      const g = group();
      const geo = keep(lathe([[0, 0], [0.2, 0], [0.31, 0.022], [0.32, 0.034], [0.2, 0.02], [0, 0.02]]));
      for (let i = 0; i < 4; i++) {
        const ms = new THREE.Mesh(geo, M.enamel);
        ms.position.y = i * 0.024;
        ms.castShadow = false;
        g.add(ms);
      }
      return { object: g, foot: 0.32 };
    },
    // chapéus de festa
    chapeus() {
      const cone = keep(new THREE.ConeGeometry(0.17, 0.4, seg));
      const pom = keep(new THREE.SphereGeometry(0.045, 10, 8));
      const g = group();
      [[-0.2, 0, M.pink, 0], [0.2, 0.06, M.mint, 0.3]].forEach(([x, z, mat, tilt]) => {
        const c = new THREE.Mesh(cone, mat);
        c.position.set(x, 0.2, z);
        c.rotation.z = tilt * 0.3;
        const p = new THREE.Mesh(pom, M.cream);
        p.position.set(x - tilt * 0.06, 0.41, z);
        c.castShadow = p.castShadow = false;
        g.add(c, p);
      });
      return { object: g, foot: 0.4 };
    },
    // presente com laço
    presente() {
      return {
        object: group(
          mesh(new THREE.BoxGeometry(0.46, 0.32, 0.46), M.yellow, 0, 0.16, 0),
          mesh(new THREE.BoxGeometry(0.475, 0.325, 0.09), M.pink, 0, 0.162, 0),
          mesh(new THREE.BoxGeometry(0.09, 0.325, 0.475), M.pink, 0, 0.162, 0),
          mesh(new THREE.SphereGeometry(0.07, 10, 8), M.pink, -0.06, 0.35, 0),
          mesh(new THREE.SphereGeometry(0.07, 10, 8), M.pink, 0.06, 0.35, 0),
        ),
        foot: 0.36,
      };
    },
    // copos de papel
    copos() {
      const cup = keep(new THREE.CylinderGeometry(0.11, 0.08, 0.24, seg));
      const g = group();
      [[-0.14, 0, M.mint], [0.12, 0.05, M.pink], [0, -0.16, M.yellow]].forEach(([x, z, mat]) => {
        const c = new THREE.Mesh(cup, mat);
        c.position.set(x, 0.12, z);
        c.castShadow = false;
        g.add(c);
      });
      return { object: g, foot: 0.3 };
    },
  };
  const plan = {
    bancada: [['tigela', 158, 2.1, 0.5], ['pote', 236, 2.5, 0], ['rolo', 268, 2.2, 0.9], ['ovos', 124, 2.6, 0.3], ['bisnaga', 92, 2.7, 0], ['pote', 40, 2.6, 1], ['rolo', 330, 2.4, -0.6]],
    vitrine: [['cupcakes', 160, 2.2, 0.2], ['caixas', 240, 2.5, 0.5], ['pratos', 122, 2.6, 0], ['cupcakes', 300, 2.5, 1.1], ['caixas', 50, 2.6, -0.4]],
    festa: [['chapeus', 156, 2.2, 0.3], ['presente', 238, 2.5, 0.5], ['copos', 122, 2.6, 0], ['presente', 310, 2.6, 1], ['chapeus', 48, 2.6, -0.5]],
  }[id];
  const items = (low ? plan.slice(0, 5) : plan).map(([kind, deg, off, yaw]) => ({ ...make[kind](), deg, off, yaw }));
  return { items, geos };
}

/* ───────── O cenário ───────── */

export function createSets(ctx) {
  const low = ctx.tier.detail < 1;
  const group = new THREE.Group();
  group.name = 'atelie:cenario';
  group.visible = false;
  ctx.scene.add(group);

  const benchSize = low ? 512 : 1024;
  const wallSize = low ? [1024, 256] : [2048, 512];
  const benchCanvas = canvasOf(benchSize, benchSize);
  const wallCanvas = canvasOf(wallSize[0], wallSize[1]);
  const propCanvas = canvasOf(CELL * 4, CELL * 2);
  const texOf = (canvas) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = low ? 2 : 4;
    return t;
  };
  const benchTex = texOf(benchCanvas);
  const wallTex = texOf(wallCanvas);
  wallTex.wrapS = THREE.RepeatWrapping;
  const propTex = texOf(propCanvas);

  const flat = (map, extra = {}) => new THREE.MeshBasicMaterial({ map, toneMapped: false, ...extra });
  const benchMat = flat(benchTex);
  const wallMat = flat(wallTex, { side: THREE.BackSide });
  // tampo: um disco que sobe em curva na beira; a pintura é projetada de cima (x, z do mundo → canvas)
  const benchPts = [];
  const coveSteps = low ? 5 : 8;
  for (let i = coveSteps; i >= 0; i--) {
    const a = (i / coveSteps) * (Math.PI / 2);
    benchPts.push(new THREE.Vector2(BENCH_R - COVE + COVE * Math.sin(a), COVE * (1 - Math.cos(a))));
  }
  benchPts.push(new THREE.Vector2(0, 0));
  const benchGeo = new THREE.LatheGeometry(benchPts, low ? 40 : 64);
  for (let i = 0; i < benchGeo.attributes.position.count; i++) {
    benchGeo.attributes.uv.setXY(i, benchGeo.attributes.position.getX(i) / (2 * BENCH_R) + 0.5, 0.5 - benchGeo.attributes.position.getZ(i) / (2 * BENCH_R));
  }
  const wallGeo = new THREE.CylinderGeometry(WALL_R, WALL_R, WALL_H, low ? 40 : 64, 1, true);
  const bench = new THREE.Mesh(benchGeo, benchMat);
  bench.renderOrder = -6;
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.renderOrder = -7;
  group.add(wall, bench);

  // cópias do tampo e da parede com a pintura antiga: somem aos poucos quando o tom do fundo muda
  const fadeMats = [flat(null, { transparent: true, depthWrite: false, opacity: 0 }), flat(null, { transparent: true, depthWrite: false, opacity: 0, side: THREE.BackSide })];
  const fadeBench = new THREE.Mesh(benchGeo, fadeMats[0]);
  fadeBench.renderOrder = -5;
  const fadeWall = new THREE.Mesh(wallGeo, fadeMats[1]);
  fadeWall.renderOrder = -5;
  fadeWall.scale.setScalar(0.998);
  fadeBench.visible = fadeWall.visible = false;
  group.add(fadeWall, fadeBench);
  let fadeTex = [null, null];
  let fade = 0;

  // objetos de fundo: cartazes sempre de frente, cada um com o seu pedaço do atlas
  const props = (low ? SPOTS.slice(0, 6) : SPOTS).map((spot, i) => {
    const map = propTex.clone();
    map.repeat.set(0.25, 0.5);
    map.offset.set((i % 4) * 0.25, 0.5 - Math.floor((i % 8) / 4) * 0.5);
    const mat = new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, toneMapped: false });
    const sp = new THREE.Sprite(mat);
    sp.center.set(0.5, 0.08);
    sp.renderOrder = -4;
    group.add(sp);
    return { sp, mat, map, spot, k: 1 };
  });

  // poça de luz da revelação (invisível fora dela)
  const dot = softDotTexture(96, { hard: 0.05 });
  const poolMat = new THREE.MeshBasicMaterial({ map: dot, color: 0xffe2b8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.renderOrder = -3;
  pool.visible = false;
  group.add(pool);

  // a peça sob a base (bailarina, pedestal ou disco): o topo gira junto com o bolo
  const under = new THREE.Group();
  const underTop = new THREE.Group();
  under.add(underTop);
  group.add(under);
  const enamel = new THREE.MeshStandardMaterial({ color: 0xf6f3f0, metalness: 0.12, roughness: 0.36 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.8, roughness: 0.3, emissive: 0x3c4048, emissiveIntensity: 0.3 });
  const stone = new THREE.MeshStandardMaterial({ color: 0xfbf7f2, metalness: 0, roughness: 0.3 });
  const goldish = new THREE.MeshStandardMaterial({ color: 0xe6bb62, metalness: 0.88, roughness: 0.28, emissive: 0x6b4a10, emissiveIntensity: 0.4 });
  const tickMat = new THREE.MeshBasicMaterial({ color: 0x8d8f96, toneMapped: false });
  let underGeos = [];
  let underKey = '';

  // objetos de verdade no tampo (3D, com luz) e a sombra macia de cada um
  const std = (color, roughness = 0.6, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const thingMats = { enamel, steel, gold: goldish, cream: std(0xfff3df, 0.74), pink: std(0xe98aa4, 0.55), mint: std(0xa6d6c8, 0.55), yellow: std(0xf6d27a, 0.55), wood: std(0xd9b388, 0.7), woodDark: std(0xb98e62, 0.7), egg: std(0xf1dcc2, 0.58) };
  const thingMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0 });
  const things = new THREE.Group();
  group.add(things);
  const blobGeo = new THREE.PlaneGeometry(1, 1);
  const blobMat = new THREE.MeshBasicMaterial({ map: dot, color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false, toneMapped: false });
  let thingGeos = [];
  let thingsOf = '';
  /**
   * Monta os objetos do tampo no lugar deles e junta todos numa malha só, com a cor de cada peça nos vértices
   * (elas não se mexem): os objetos inteiros custam duas chamadas de desenho por quadro — a deles e a das
   * sombras —, o que pesa no celular. clear = raio que precisa ficar livre em volta da base do bolo.
   */
  function placeThings(clear) {
    const key = `${id}|${clear.toFixed(2)}`;
    if (thingsOf === key) return;
    thingsOf = key;
    thingGeos.forEach((gq) => gq.dispose());
    thingGeos = [];
    things.clear();
    const built = buildThings(id, low, thingMats);
    const byMat = new Map([[thingMat, []], [blobMat, []]]);
    built.items.forEach((it) => {
      const blob = new THREE.Mesh(blobGeo, blobMat);
      blob.rotation.x = -Math.PI / 2;
      blob.position.y = 0.004;
      blob.scale.set(it.foot * (it.flat ? 3.4 : 2.9), it.foot * (it.flat ? 1.3 : 2.9), 1);
      it.object.add(blob);
      const r = clear + it.off;
      it.object.position.set(Math.sin(it.deg * DEG) * r, 0, Math.cos(it.deg * DEG) * r);
      it.object.rotation.y = it.yaw + it.deg * DEG;
      it.object.updateMatrixWorld(true);
      it.object.traverse((o) => {
        if (!o.isMesh) return;
        const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
        if (o.material === blobMat) {
          byMat.get(blobMat).push(geo);
          return;
        }
        const n = geo.attributes.position.count;
        const tint = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) tint.set([o.material.color.r, o.material.color.g, o.material.color.b], i * 3);
        geo.setAttribute('color', new THREE.BufferAttribute(tint, 3));
        byMat.get(thingMat).push(geo);
      });
    });
    built.geos.forEach((gq) => gq.dispose());
    byMat.forEach((list, mat) => {
      const geo = list.length ? mergeGeometries(list) : null;
      list.forEach((gq) => gq.dispose());
      if (!geo) return;
      const ms = new THREE.Mesh(geo, mat);
      ms.castShadow = false;
      ms.receiveShadow = false;
      if (mat === blobMat) ms.renderOrder = -3;
      things.add(ms);
      thingGeos.push(geo);
    });
  }

  let id = 'bancada';
  let backdrop = null;
  let painted = '';
  let visible = false;
  let dimK = 0;
  let benchY = 0;
  let underH = 0;
  let underR = 1;
  let needPaint = false;
  let quietGround = false;

  function rebuildUnder(R) {
    const key = `${id}|${R.toFixed(2)}`;
    if (key === underKey) return;
    underKey = key;
    underGeos.forEach((gq) => gq.dispose());
    underGeos = [];
    underTop.clear();
    [...under.children].forEach((ch) => ch !== underTop && under.remove(ch));
    const built = id === 'bancada' ? turntableGeo(R, low) : id === 'vitrine' ? riserGeo(R, low) : boardGeo(R, low);
    underH = built.height;
    underR = built.baseR;
    const top = new THREE.Mesh(built.top, id === 'bancada' ? enamel : id === 'vitrine' ? stone : goldish);
    top.receiveShadow = true;
    top.castShadow = false;
    underTop.add(top);
    underGeos.push(built.top);
    if (built.foot) {
      const foot = new THREE.Mesh(built.foot, id === 'bancada' ? steel : goldish);
      foot.castShadow = false;
      under.add(foot);
      underGeos.push(built.foot);
    }
    if (id === 'bancada') {
      // marcas na beira do prato: é por elas que se vê o prato girando
      const n = 24;
      const tick = new THREE.BoxGeometry(0.012, 0.004, 0.07);
      const marks = new THREE.InstancedMesh(tick, tickMat, n);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        m4.makeRotationY(-a + Math.PI / 2);
        m4.setPosition(Math.cos(a) * (R - 0.06), 0.001, Math.sin(a) * (R - 0.06));
        marks.setMatrixAt(i, m4);
      }
      marks.castShadow = false;
      underTop.add(marks);
      underGeos.push(tick);
    }
  }

  /**
   * Pinta o cenário (tampo, parede e objetos de fundo) em três passos, um por quadro: nenhum deles segura a
   * tela por muito tempo (a parede inteira, de uma vez, custava uns 300 ms num celular). Na primeira vez a
   * cozinha só aparece quando os três terminam.
   */
  let paintJobs = [];
  let warming = false;
  function paint() {
    if (!backdrop) return;
    const key = `${id}|${backdrop.id}`;
    if (key === painted && !paintJobs.length) return;
    const P = palette(backdrop, id);
    const scene = id;
    // antes de a cozinha aparecer, cada textura já sobe para a placa de vídeo no quadro em que é pintada
    // (e os objetos do tampo são montados num quadro só deles): o primeiro quadro com a cozinha sai leve
    const send = (t) => !group.visible && ctx.renderer.initTexture(t);
    paintJobs = [
      () => {
        paintBench(benchCanvas, scene, P);
        benchTex.needsUpdate = true;
        send(benchTex);
      },
      () => {
        paintWall(wallCanvas, scene, P);
        wallTex.needsUpdate = true;
        send(wallTex);
      },
      () => {
        paintProps(propCanvas, scene, P);
        props.forEach((p) => (p.map.needsUpdate = true));
        propTex.needsUpdate = true;
        if (props[0]) send(props[0].map);
        painted = key;
        needPaint = false;
      },
      () => !group.visible && layout(),
    ];
    ctx.invalidate();
  }
  /** Mostra a cozinha (depois de pintada) e põe o chão no lugar. */
  function reveal() {
    group.visible = true;
    layout();
    ctx.invalidate();
  }

  /** Guarda a pintura que está na tela numa textura à parte e deixa as cópias por cima, para sumirem aos poucos. */
  function keepOld() {
    if (!painted || !group.visible) return;
    fadeTex.forEach((t) => t?.dispose());
    const copy = (canvas) => {
      const c = canvasOf(canvas.width, canvas.height);
      c.getContext('2d').drawImage(canvas, 0, 0);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    fadeTex = [copy(benchCanvas), copy(wallCanvas)];
    fadeTex[1].wrapS = THREE.RepeatWrapping;
    fadeMats[0].map = fadeTex[0];
    fadeMats[1].map = fadeTex[1];
    fadeMats.forEach((mt) => {
      mt.needsUpdate = true;
      mt.color.copy(benchMat.color);
    });
    fadeMats[1].color.copy(wallMat.color);
    fade = 1;
    fadeBench.visible = fadeWall.visible = true;
  }

  function layout() {
    const stand = ctx.stand;
    if (!stand) return;
    // raio do topo da peça: um pouco maior que o pé da base (bases de pé torneado apoiam num anel menor que o prato)
    const foot = stand.standHeight > 0.2 ? stand.plateRadius * 0.56 : stand.plateRadius * 1.02;
    const R = Math.max(0.95, foot + (id === 'vitrine' ? 0.3 : 0.12));
    rebuildUnder(Math.round(R * 20) / 20);
    under.position.y = stand.floorY;
    benchY = stand.floorY - underH;
    bench.position.y = benchY;
    fadeBench.position.y = benchY + 0.003;
    wall.position.y = fadeWall.position.y = benchY - WALL_LOW + WALL_H / 2;
    pool.position.y = benchY + 0.006;
    pool.scale.setScalar(Math.max(6, underR * 6.5));
    props.forEach((p) => {
      const [deg, dist, w, h] = p.spot;
      // θ = 0 é a frente da vista padrão (+z); os objetos ficam em volta, sobre o tampo
      p.sp.position.set(Math.sin(deg * DEG) * dist, benchY, Math.cos(deg * DEG) * dist);
      p.w = w;
      p.h = h;
    });
    placeThings(Math.round(Math.max(stand.plateRadius, underR) * 10) / 10);
    things.position.y = benchY;
    if (group.visible) ctx.setGround({ drop: underH, contact: underR * 0.62, radius: underR, reframe: !quietGround });
  }

  function applyDim() {
    const w = 1 - 0.72 * dimK;
    const b = 1 - 0.56 * dimK;
    wallMat.color.setScalar(w);
    benchMat.color.setScalar(b);
    props.forEach((p) => p.mat.color.setScalar(w));
    poolMat.opacity = 0.5 * dimK;
    pool.visible = dimK > 0.002;
  }

  return {
    group,
    get id() {
      return id;
    },
    get benchY() {
      return benchY;
    },
    get underHeight() {
      return underH;
    },
    /** A cozinha está na tela? (ligada E já pintada) */
    get visible() {
      return group.visible;
    },
    setScene(next) {
      if (!SCENES.includes(next) || next === id) return;
      keepOld();
      id = next;
      needPaint = true;
      underKey = '';
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
    /** quiet = sem reenquadrar a câmera (a foto de catálogo esconde a cozinha e a traz de volta num instante). */
    setVisible(on, { quiet = false } = {}) {
      on = Boolean(on);
      if (on === visible) return;
      visible = on;
      quietGround = quiet;
      if (on) {
        if (needPaint || !painted) paint();
        if (painted) reveal(); // (a pintura nova, se houver, entra por cima em três quadros)
      } else {
        group.visible = false;
        ctx.setGround({ drop: 0, contact: 0, radius: 0, reframe: !quiet });
      }
      quietGround = false;
    },
    layout,
    /** O topo da bailarina gira junto com o bolo. */
    spin(angle) {
      underTop.rotation.y = angle;
    },
    /** Revelação: k = 1 apaga a cozinha e acende a poça de luz sob o bolo. */
    dim(k) {
      dimK = k;
      applyDim();
    },
    /** Objetos que ficariam entre a câmera e o bolo saem de cena (somem antes de entrar no quadro). */
    tick(dt, camAz) {
      if (!visible) return false;
      let busy = false;
      if (paintJobs.length) {
        paintJobs.shift()();
        busy = true;
        if (!paintJobs.length && !group.visible && !warming) {
          // primeira vez: os programas da placa de vídeo são preparados em segundo plano e só então a cozinha
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
        fade = Math.max(0, fade - dt / 0.5);
        fadeMats.forEach((mt) => (mt.opacity = fade));
        if (fade <= 0) {
          fadeBench.visible = fadeWall.visible = false;
          fadeTex.forEach((t) => t?.dispose());
          fadeTex = [null, null];
          fadeMats.forEach((mt) => (mt.map = null));
        }
        busy = true;
      }
      props.forEach((p) => {
        let d = (p.spot[0] * DEG - camAz) % TAU;
        if (d > Math.PI) d -= TAU;
        if (d < -Math.PI) d += TAU;
        const k = THREE.MathUtils.smoothstep(Math.abs(d), 62 * DEG, 84 * DEG);
        p.sp.visible = k > 0.01;
        p.mat.opacity = k;
        p.sp.scale.set(p.w, p.h, 1);
      });
      return busy;
    },
    stats() {
      let tris = 0;
      group.traverse((o) => {
        if (!o.isMesh && !o.isSprite) return;
        const geo = o.geometry;
        const n = geo?.index ? geo.index.count / 3 : (geo?.attributes.position?.count || 6) / 3;
        tris += n * (o.isInstancedMesh ? o.count : 1);
      });
      return { triangles: Math.round(tris) };
    },
    dispose() {
      ctx.scene.remove(group);
      [benchGeo, wallGeo, pool.geometry, blobGeo, ...underGeos, ...thingGeos].forEach((gq) => gq.dispose());
      [benchMat, wallMat, poolMat, blobMat, thingMat, stone, tickMat, ...fadeMats, ...Object.values(thingMats)].forEach((mt) => mt.dispose());
      [benchTex, wallTex, propTex, dot, ...fadeTex].forEach((t) => t?.dispose());
      props.forEach((p) => {
        p.map.dispose();
        p.mat.dispose();
      });
      underTop.traverse((o) => o.isInstancedMesh && o.dispose());
    },
  };
}
