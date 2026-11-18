// BOLAB — especificações das peças do grupo "doces" (chocolate e docinhos; ver kit.js). Só dados.
// As medidas (1 = 10 cm) são as do doce de verdade; as esferas `sph` cobrem a malha desenhada em pecas-doces.js.
// Campos a mais em `vars` (parts, bar, rolls, canes, cone…) são lidos só pelo módulo de peças: a composição de
// cada variante fica aqui para as esferas e a malha saírem da mesma conta.

const TAU = Math.PI * 2;

/** Esferas de raio r ao longo do segmento a → b (n esferas; classe opcional). */
const seg = (a, b, r, n, cls) =>
  Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const s = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, r];
    if (cls) s.push(cls);
    return s;
  });

/** Anel de n esferas de raio r, a `rad` do ponto (x, y, z), num plano horizontal. */
const ringOf = (n, rad, r, y, x = 0, z = 0, a0 = 0) => Array.from({ length: n }, (_, i) => [x + rad * Math.cos(a0 + (i / n) * TAU), y, z + rad * Math.sin(a0 + (i / n) * TAU), r]);

/** Chapa em pé (largura w, altura h; `top` = quanto ela estreita no alto), girada de yaw em torno de Y, em (x, z). */
const plate = ({ w, h, x = 0, z = 0, yaw = 0, top = 1 }, r = 0.075) => {
  const out = [];
  const rows = Math.max(2, Math.round(h / (r * 1.6)));
  for (let j = 0; j < rows; j++) {
    const t = j / (rows - 1);
    const y = r * 0.8 + (h - r * 1.7) * t;
    const ww = w * (1 - (1 - top) * t);
    const cols = Math.max(1, Math.round(ww / (r * 1.6)));
    for (let i = 0; i < cols; i++) {
      const lx = cols === 1 ? 0 : -ww / 2 + r * 0.8 + ((ww - r * 1.6) * i) / (cols - 1);
      out.push([x + lx * Math.cos(yaw), y, z - lx * Math.sin(yaw), r]);
    }
  }
  return out;
};

/* Placas de chocolate: cada peça é um grupinho de lascas fincadas (a alta atrás, a pequena na frente).
   k = desenho da lasca (pecas-doces.js) · w, h = largura e altura · top = quanto estreita no alto ·
   x, z = onde finca · yaw = giro · tilt = inclinação para trás (rad) · tone = tom (multiplica a cor). */
const SHARDS = [
  [
    { k: 'alta', w: 0.34, h: 0.82, top: 0.45, x: -0.03, z: -0.12, yaw: 0.12, tilt: 0.06, tone: 1 },
    { k: 'larga', w: 0.4, h: 0.58, top: 0.7, x: 0.07, z: 0.02, yaw: -0.38, tilt: 0.01, tone: 0.9 },
    { k: 'curta', w: 0.24, h: 0.4, top: 0.6, x: -0.12, z: 0.1, yaw: 0.5, tilt: -0.05, tone: 1.08 },
  ],
  [
    { k: 'vela', w: 0.4, h: 0.72, top: 0.75, x: 0, z: -0.09, yaw: -0.15, tilt: 0.04, tone: 1 },
    { k: 'curta', w: 0.26, h: 0.44, top: 0.6, x: 0.05, z: 0.1, yaw: 0.4, tilt: -0.04, tone: 0.9 },
  ],
  [
    { k: 'larga', w: 0.42, h: 0.66, top: 0.7, x: 0, z: -0.07, yaw: 0.2, tilt: 0.05, tone: 0.94, flip: true },
    { k: 'alta', w: 0.22, h: 0.5, top: 0.5, x: -0.1, z: 0.1, yaw: -0.45, tilt: -0.03, tone: 1.06 },
  ],
];

/* Tabletes: pedaços de barra fincados em pé. n = gomos (um em cima do outro) · sink = quanto entra na cobertura ·
   lean = inclinação para trás · roll = tombo de lado · yaw = giro (rad). Gomo de 2,4 cm; barra de 9 mm. */
const BARS = [
  { n: 3, sink: 0.05, lean: 0.1, roll: 0.03, yaw: 0.1 },
  { n: 2, sink: 0.04, lean: 0.2, roll: -0.1, yaw: -0.22 },
  { n: 3, sink: 0.17, lean: 0.03, roll: 0.08, yaw: 0.3 },
];
const barVar = (b) => {
  const h = b.n * 0.24 - b.sink;
  const top = [Math.sin(b.roll) * h, Math.cos(b.roll) * Math.cos(b.lean) * h, -Math.sin(b.lean) * h];
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  const a = [0, 0.085, -0.01];
  const e = [top[0] * c + top[2] * s, top[1] - 0.075, -top[0] * s + top[2] * c];
  // duas colunas de esferas (a barra tem 2,4 cm de largura e 9 mm de espessura)
  const off = [0.045 * c, 0, -0.045 * s];
  const rows = Math.max(2, Math.round(h / 0.15));
  return {
    r: 0.17,
    h: top[1],
    bar: b,
    sph: [...seg([a[0] - off[0], a[1], a[2] - off[2]], [e[0] - off[0], e[1], e[2] - off[2]], 0.09, rows), ...seg([a[0] + off[0], a[1], a[2] + off[2]], [e[0] + off[0], e[1], e[2] + off[2]], 0.09, rows)],
  };
};

/* Cookies: um só, pilha de dois, um só (raio 2,15 cm; 8 mm de altura).
   Cada cookie: x, y, z = centro da base · tilt = quanto levanta um lado (rad, em torno de z) · yaw = giro. */
const COOKIE_R = 0.215;
const COOKIES = [
  [{ x: 0, y: 0, z: 0, tilt: 0.03, yaw: 0.4, seed: 37 }],
  [{ x: 0, y: 0, z: 0, tilt: 0, yaw: 0, seed: 11 }, { x: 0.006, y: 0.076, z: 0.004, tilt: 0.05, yaw: 0.9, seed: 23 }],
  [{ x: 0, y: 0, z: 0, tilt: -0.025, yaw: 2.1, seed: 41 }],
];
const cookieVar = (list) => ({
  r: 0.235,
  h: Math.max(...list.map((c) => c.y + 0.09 + COOKIE_R * Math.sin(c.tilt))),
  cookies: list,
  // cada cookie: um miolo e um anel de esferas no plano dele (o lado −x é o que levanta)
  sph: list.flatMap((c) => {
    const cs = Math.cos(c.tilt);
    const sn = Math.sin(c.tilt);
    const at = (lx, lz) => [c.x + lx * cs + 0.045 * sn, c.y + 0.045 * cs - lx * sn, c.z + lz, 0.088];
    return [at(0, 0), ...Array.from({ length: 6 }, (_, i) => at(0.135 * Math.cos((i / 6) * TAU), 0.135 * Math.sin((i / 6) * TAU)))];
  }),
});

/* Pipoca: cada peça é um punhado de pipocas grudadas pelo caramelo. [x, y, z, raio] de cada pipoca. */
const POPCORN = [
  [[-0.08, 0.08, -0.045, 0.09], [0.085, 0.076, -0.03, 0.088], [0.0, 0.074, 0.09, 0.086], [0.0, 0.2, 0.005, 0.084]],
  [[-0.075, 0.08, -0.04, 0.09], [0.08, 0.076, -0.035, 0.086], [0.005, 0.07, 0.085, 0.082]],
  [[-0.07, 0.08, 0, 0.09], [0.075, 0.075, 0.02, 0.084], [0.0, 0.19, 0.01, 0.08]],
];

/* Canudos de wafer: feixes fincados. Cada canudo: x, z = onde finca · ax, az = quanto o alto se afasta do pé
   (o canudo tem `len` de comprimento acima da cobertura). */
const ROLLS = [
  [{ x: -0.045, z: -0.03, ax: -0.2, az: -0.1, len: 0.88 }, { x: 0.05, z: -0.02, ax: 0.17, az: -0.16, len: 0.96 }, { x: 0, z: 0.05, ax: 0.03, az: 0.2, len: 0.8 }],
  [{ x: -0.05, z: 0, ax: -0.16, az: 0.06, len: 0.92 }, { x: 0.05, z: 0.01, ax: 0.19, az: -0.08, len: 0.84 }],
  [{ x: -0.04, z: 0.035, ax: -0.19, az: 0.14, len: 0.82 }, { x: 0.045, z: 0.03, ax: 0.2, az: 0.1, len: 0.9 }, { x: 0, z: -0.05, ax: -0.02, az: -0.2, len: 0.98 }],
];
const rollVar = (rolls) => ({
  r: 0.185,
  h: Math.max(...rolls.map((q) => q.len)),
  rolls,
  sph: rolls.flatMap((q) => {
    const up = Math.sqrt(Math.max(0.01, q.len * q.len - q.ax * q.ax - q.az * q.az));
    const at = (t) => [q.x + q.ax * t, up * t, q.z + q.az * t];
    return [...seg(at(0.06), at(0.3), 0.06, 3), ...seg(at(0.42), at(0.96), 0.06, 6, 'air')];
  }),
});

/* Bengalinhas: cada peça é um par cruzado — uma deitada na cobertura e a outra apoiada por cima dela.
   Cada bengala: x, z = meio da haste · yaw = direção da haste · lift = quanto a ponta do gancho sobe (rad). */
export const CANE = { straight: 0.38, hook: 0.07, r: 0.03 };
const CANES = [
  [{ x: 0, z: 0.015, yaw: 0.5, lift: 0, flip: true }, { x: -0.034, z: -0.02, yaw: -0.55, lift: 0.27, flip: false }],
  [{ x: 0, z: -0.015, yaw: -0.42, lift: 0, flip: false }, { x: -0.034, z: 0.012, yaw: 0.62, lift: 0.27, flip: true }],
];
/** Pontos ao longo do eixo de uma bengala (haste + gancho), já na pose dela. → [[x, y, z]] */
export const canePath = (c, n) => {
  const { straight: L, hook: R, r } = CANE;
  const total = L + R * 3.4;
  const out = [];
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * total;
    let x = -L / 2 + s;
    let z = 0;
    if (s > L) {
      const a = (s - L) / R;
      x = L / 2 + R * Math.sin(a);
      z = (c.flip ? -1 : 1) * R * (1 - Math.cos(a));
    }
    // a de cima apoia a ponta reta na cobertura e sobe para o lado do gancho
    const y = r + Math.sin(c.lift) * (x + L / 2);
    const xx = -L / 2 + (x + L / 2) * Math.cos(c.lift);
    out.push([c.x + xx * Math.cos(c.yaw) + z * Math.sin(c.yaw), y, c.z - xx * Math.sin(c.yaw) + z * Math.cos(c.yaw)]);
  }
  return out;
};
const caneVar = (canes) => ({ r: 0.31, h: 0.2, canes, sph: canes.flatMap((c) => canePath(c, 11).map(([x, y, z]) => [x, y + 0.01, z, 0.048])) });

/* Casquinha: bola de 5,8 cm meio derretida, poça em volta e a casquinha (9 cm) de ponta-cabeça, tombada.
   drops = pingos que escaparam da poça: [ângulo, distância do meio, raio]. */
const CONE = { ball: 0.29, cy: 0.215, rim: 0.212, len: 0.9, tilt: 0.36, az: 0.6, drops: [[0.7, 0.42, 0.05], [5.6, 0.375, 0.036], [4.4, 0.455, 0.04]] };
/** Contorno da poça: distância do meio até a beira, na direção a. */
export const puddleEdge = (a) => 0.36 * (1 + 0.15 * Math.sin(3 * a + 1) + 0.1 * Math.sin(5 * a + 2.2) + 0.045 * Math.sin(8 * a + 0.4));
const coneAxis = [Math.sin(CONE.tilt) * Math.cos(CONE.az), Math.cos(CONE.tilt), -Math.sin(CONE.tilt) * Math.sin(CONE.az)];
const coneAt = (d) => [coneAxis[0] * d, CONE.cy + coneAxis[1] * d, coneAxis[2] * d];
const coneBase = Math.sqrt(CONE.ball * CONE.ball - CONE.rim * CONE.rim); // onde a boca da casquinha assenta na bola

const KIT_DOCES = {
  /* ───────── Chocolate ───────── */
  placas: {
    vars: SHARDS.map((parts) => ({ r: 0.3, h: Math.max(...parts.map((p) => p.h)), parts, sph: parts.flatMap((p) => plate(p)) })),
    size: [0.9, 1.08],
    face: 'out',
    alt: true,
    ring: { step: 0.6, touch: 0.52, out: 0.25, band: 0.58 },
    pile: [0.265, 3, 0],
    minS: 0.6,
  },
  esferas: {
    vars: [0.19, 0.125, 0.155].map((r) => ({ r, h: r * 2, sph: [[0, r - 0.004, 0, r]] })),
    size: [0.92, 1.03],
    alt: true,
    ring: { step: 0.37, touch: 0.35, band: 0.39 },
    pile: [0.19, 7, 0],
    scat: [0.2, 6],
  },
  barras: {
    vars: BARS.map(barVar),
    size: [0.94, 1.04],
    face: 'out',
    alt: true,
    ring: { step: 0.38, touch: 0.335, out: 0.15, band: 0.36 },
    pile: [0.175, 5, 0],
  },
  conchaschoc: {
    vars: [
      { r: 0.22, h: 0.09, sph: [[-0.11, 0.03, 0.03, 0.105], [0.11, 0.03, 0.03, 0.105], [0, 0.03, -0.075, 0.105], [0, 0.03, 0.06, 0.1]] }, // vieira
      { r: 0.25, h: 0.15, sph: [[0, 0.045, -0.125, 0.1], [0, 0.05, 0, 0.11], [0, 0.05, 0.12, 0.13]] }, // búzio
      { r: 0.16, h: 0.09, sph: [[0, 0.03, 0, 0.16]] }, // caracol
    ],
    size: [0.92, 1.06],
    alt: true,
    ring: { step: 0.47, touch: 0.45, out: 0.255, band: 0.5 },
    pile: [0.245, 5, 0],
    scat: [0.25, 6],
  },
  gotas: { coat: { perArea: 46, perSide: 10, rad: 0.042, flat: false } },
  crocantes: { coat: { perArea: 40, perSide: 9, rad: 0.04, flat: false } },

  /* ───────── Docinhos ───────── */
  jujubas: {
    vars: [
      { r: 0.105, h: 0.19, w: 2, sph: [[0, 0.06, 0, 0.105], [0, 0.12, 0, 0.078]] }, // em pé
      { r: 0.14, h: 0.18, w: 1, sph: [[-0.035, 0.085, 0, 0.1], [0.055, 0.075, 0, 0.085]] }, // tombada
    ],
    size: [0.9, 1.08],
    ring: { step: 0.24, touch: 0.225, out: 0.14, band: 0.28 },
    pile: [0.11, 14, 0.15],
    scat: [0.12, 12],
  },
  donuts: {
    vars: [0, 1, 2].map(() => ({ r: 0.226, h: 0.16, sph: ringOf(6, 0.13, 0.094, 0.075) })),
    size: [0.95, 1.05],
    alt: true,
    ring: { step: 0.49, touch: 0.465, band: 0.47 },
    pile: [0.232, 4, 0.14],
  },
  cookies: {
    vars: COOKIES.map(cookieVar),
    size: [0.95, 1.04],
    alt: true,
    ring: { step: 0.5, touch: 0.47, band: 0.48 },
    pile: [0.24, 5, 0],
  },
  pipoca: {
    vars: POPCORN.map((k) => ({ r: 0.2, h: Math.max(...k.map((q) => q[1] + q[3])), kernels: k, sph: k.map(([x, y, z, r]) => [x, y, z, r + 0.012]) })),
    size: [0.92, 1.06],
    ring: { step: 0.34, touch: 0.31, band: 0.4 },
    pile: [0.15, 11, 0.15],
  },
  casquinha: {
    vars: [
      {
        r: 0.51,
        h: 1.26,
        cone: CONE,
        sph: [
          [0, CONE.cy, 0, CONE.ball + 0.035],
          // a poça: um anel por dentro e esferas acompanhando o contorno; os pingos
          ...ringOf(8, 0.24, 0.1, 0.0),
          ...Array.from({ length: 16 }, (_, i) => {
            const a = (i / 16) * TAU;
            const d = puddleEdge(a) - 0.085;
            return [d * Math.sin(a), 0, d * Math.cos(a), 0.1];
          }),
          ...CONE.drops.map(([a, d, r]) => [d * Math.sin(a), 0.012, d * Math.cos(a), r * 1.25]),
          // a casquinha, da boca até a ponta
          ...[[0.08, 0.215], [0.22, 0.185], [0.36, 0.155], [0.5, 0.125], [0.62, 0.1], [0.73, 0.075], [0.83, 0.055], [0.91, 0.04], [0.97, 0.025]].map(([s, r]) => [...coneAt(coneBase + s * CONE.len), r]),
        ],
      },
    ],
    hero: { s: [0.62, 1] },
    face: 'front',
    size: [1, 1],
  },
  pacoca: {
    vars: [
      { r: 0.15, h: 0.29, sph: [[0, 0.075, 0, 0.15], [0, 0.145, 0, 0.15], [0, 0.215, 0, 0.15]] }, // em pé
      { r: 0.2, h: 0.26, sph: [[-0.085, 0.125, 0, 0.145], [0, 0.125, 0, 0.15], [0.085, 0.125, 0, 0.145]] }, // deitada (ao comprido de x)
      { r: 0.15, h: 0.29, sph: [[0, 0.075, 0, 0.15], [0, 0.145, 0, 0.15], [0, 0.215, 0, 0.15]] }, // em pé, com o canto esfarelado
    ],
    size: [0.95, 1.05],
    face: 'out',
    alt: true,
    ring: { step: 0.345, touch: 0.32, out: 0.155, band: 0.32 },
    pile: [0.152, 7, 0.285],
  },
  cakepops: {
    vars: [0, 1, 2].map(() => ({ r: 0.196, h: 0.38, sph: [[0, 0.185, 0, 0.196]] })),
    size: [0.94, 1.05],
    stick: { n: [2, 3, 5], h: [0.3, 0.2, 0.36, 0.25], gap: 0.46, into: 0.1, r: 0.018 },
  },
  pastilhas: { coat: { perArea: 34, perSide: 8, rad: 0.068, flat: true } },
  bengalinhas: {
    vars: CANES.map(caneVar),
    size: [0.95, 1.05],
    face: 'out',
    alt: true,
    ring: { step: 0.62, touch: 0.58, out: 0.27, band: 0.56 },
    pile: [0.32, 1.4, 0],
    minS: 0.6,
  },
  canudos: {
    vars: ROLLS.map(rollVar),
    size: [0.94, 1.05],
    face: 'out',
    alt: true,
    ring: { step: 0.4, touch: 0.37, out: 0.18, band: 0.38 },
    pile: [0.19, 3, 0],
  },
  ovinhos: {
    vars: [0, 1, 2].map((v) => ({ r: 0.16, h: 0.22, sph: v === 1 ? [[-0.05, 0.095, 0, 0.105], [0.05, 0.125, 0, 0.105]] : [[-0.05, 0.1, 0, 0.105], [0.05, 0.1, 0, 0.105]] })),
    size: [0.9, 1.08],
    ring: { step: 0.34, touch: 0.32, band: 0.33 },
    pile: [0.148, 9, 0.17],
    scat: [0.165, 10],
  },
};

/* Peça colocada à mão (uma a uma, onde o cliente soltou): a variante é sorteada pelo lugar — e o lugar é
   arredondado ao ser guardado. Para a peça nunca "mudar de tamanho" entre a sondagem e o bolo pronto, todas as
   variantes de uma decoração que pode ser colocada à mão ocupam o mesmo volume: a união das esferas delas. */
['placas', 'esferas', 'barras', 'conchaschoc', 'jujubas', 'cookies', 'pacoca', 'bengalinhas', 'canudos', 'ovinhos'].forEach((id) => {
  const all = [];
  const seen = new Set();
  KIT_DOCES[id].vars.forEach((V) => {
    V.sph.forEach((q) => {
      const key = q.map((n) => (typeof n === 'number' ? n.toFixed(4) : n)).join(' ');
      if (!seen.has(key)) {
        seen.add(key);
        all.push(q);
      }
    });
  });
  KIT_DOCES[id].vars.forEach((V) => {
    V.sph = all;
  });
});

export default KIT_DOCES;
