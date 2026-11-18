// BOLAB — especificações das peças do grupo "festa" (brilho, papel e festa; ver kit.js). Só dados.
//
// As contas do começo só montam as esferas de ocupação (sph) a partir das MESMAS medidas com que
// pecas-festa.js desenha as malhas (exportadas aqui: CROWN, RAINBOW, FLAGS, SKY, MIRRORS, PUFFS): mudou a
// medida, a esfera acompanha. Nada daqui depende do three.js.
const TAU = Math.PI * 2;
const n3 = (v) => Math.round(v * 1000) / 1000;

/** Roda de n esferas em volta do eixo Y (raio da roda, altura, raio de cada esfera, ângulo da primeira). */
const wheel = (n, rad, y, r, a0 = 0) =>
  Array.from({ length: n }, (_, i) => {
    const a = a0 + (i / n) * TAU;
    return [n3(Math.sin(a) * rad), y, n3(Math.cos(a) * rad), r];
  });

/** Disco fino de frente (plano XY, raio R), centrado em (0, 0, cz): uma esfera no meio e dez na borda. */
const disc = (R, cz = 0) => [
  [0, 0, cz, n3(0.46 * R)],
  ...Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * TAU;
    return [n3(Math.sin(a) * 0.7 * R), n3(Math.cos(a) * 0.7 * R), cz, n3(0.41 * R)];
  }),
];

/** Palito em pé em (x, z), do bolo até a altura y1: uma conta a cada 4 mm (como VOL.stick). */
const stake = (x, y1, z = 0, r = 0.015) => {
  const out = [];
  for (let y = 0.02; y < y1; y += 0.04) out.push([x, n3(y), z, r, 'stick']);
  out.push([x, n3(y1 - r * 0.6), z, r, 'stick']);
  return out;
};

/* ───────── Coroa ───────── */

/** Aro de 6 cm que abre para ~6,8 cm nas pontas; oito pontas (altas e baixas alternadas) com bolinha. */
export const CROWN = { R: 0.3, N: 8, tall: 0.37, short: 0.29, valley: 0.14, flare: 0.13 };

const crownSph = () => {
  const C = CROWN;
  const out = wheel(12, C.R + 0.008, 0.096, 0.128);
  for (let k = 0; k < C.N; k++) {
    const a = (k / C.N) * TAU;
    const h = k % 2 ? C.short : C.tall;
    const rad = C.R * (1 + C.flare * 0.8);
    out.push([n3(Math.sin(a) * rad), n3(h - 0.07), n3(Math.cos(a) * rad), 0.12]);
    const b = a + TAU / C.N / 2;
    out.push([n3(Math.sin(b) * C.R * 1.04), 0.2, n3(Math.cos(b) * C.R * 1.04), 0.1]);
  }
  out.push([0, 0.12, 0, 0.2]); // o miolo do aro não recebe outra peça
  return out;
};

/* ───────── Arco-íris ───────── */

/**
 * Cinco cordões de pasta (raio de fora R, largura W cada, meia espessura half) e uma nuvem de bolinhas em cada pé:
 * clouds = [x, y, z, raio] das bolinhas do pé direito (o esquerdo espelha).
 */
export const RAINBOW = {
  R: 0.52,
  W: 0.074,
  n: 5,
  half: 0.05,
  clouds: [
    [0.335, 0.08, 0.085, 0.108],
    [0.462, 0.062, 0.05, 0.082],
    [0.212, 0.058, 0.06, 0.078],
    [0.3, 0.15, 0.03, 0.088],
    [0.41, 0.135, 0.005, 0.07],
    [0.34, 0.066, -0.08, 0.086],
  ],
};

const rainbowSph = () => {
  const A = RAINBOW;
  const out = [];
  const row = (rad, r, n) => {
    for (let k = 0; k <= n; k++) {
      const th = 0.07 + (k / n) * (Math.PI - 0.14);
      const y = rad * Math.sin(th);
      const s = [n3(-rad * Math.cos(th)), n3(y), 0, r];
      if (y > 0.16) s.push('air');
      out.push(s);
    }
  };
  const inner = A.R - A.W * A.n;
  row(A.R - (A.R - inner) * 0.25, 0.122, 13);
  row(inner + (A.R - inner) * 0.25, 0.122, 8);
  [-1, 1].forEach((sx) => A.clouds.forEach(([x, y, z, r]) => out.push([sx * x, y, z, n3(r * 1.03)])));
  return out;
};

/* ───────── Bandeirolas ───────── */

/** Dois palitos a 12 cm um do outro, 10 cm acima do bolo; o barbante faz barriga de 2 cm entre eles. */
export const FLAGS = { span: 0.6, top: 1.04, tie: 1.0, sag: 0.2, z: 0.012 };
/** Barbante: ponto, direção e "para baixo da bandeirinha" (perpendicular ao fio) em x. → [y, tx, ty] */
export const flagLine = (x) => {
  const y = FLAGS.tie - FLAGS.sag * (1 - (x / FLAGS.span) ** 2);
  const dy = (2 * FLAGS.sag * x) / (FLAGS.span * FLAGS.span);
  const l = Math.hypot(1, dy);
  return [y, 1 / l, dy / l];
};

const flagsSph = () => {
  const out = [...stake(-FLAGS.span, FLAGS.top), ...stake(FLAGS.span, FLAGS.top)];
  // o nó do barbante no alto de cada palito
  [-1, 1].forEach((sx) => out.push([sx * FLAGS.span, FLAGS.tie, 0, 0.034, 'air']));
  for (let i = -6; i <= 6; i++) {
    const x = i * 0.1;
    const [y, tx, ty] = flagLine(x);
    // duas fileiras: junto do fio e mais abaixo (as bandeirinhas pendem perpendiculares ao barbante)
    out.push([n3(x + ty * 0.065), n3(y - tx * 0.065), FLAGS.z, 0.09, 'air']);
    out.push([n3(x + ty * 0.21), n3(y - tx * 0.21), FLAGS.z, 0.097, 'air']);
  }
  return out;
};

/* ───────── Lua e nuvens ───────── */

/**
 * Recortes de papel no palito. moon: centro, raio e o círculo recortado (cut = [x, y, raio]); stick = x do palito.
 * clouds = [x, y, z, escala] · stars = [x, y, raio, giro] (cada uma no seu palito) · drop = estrela pendurada
 * na ponta de cima da lua · puffs = círculos da silhueta da nuvem ([x, y, raio], na escala 1).
 */
export const SKY = {
  moon: { x: -0.08, y: 1.0, R: 0.4, cut: [0.092, 1.08, 0.32], stick: -0.22, top: 0.92 },
  clouds: [
    [-0.46, 0.43, 0.032, 1.12],
    [0.4, 0.52, 0.046, 0.96],
  ],
  stars: [
    [0.535, 1.0, 0.085, 0.2],
    [-0.6, 0.85, 0.07, -0.25],
  ],
  drop: [0.03, 1.12, 0.095],
  puffs: [
    [-0.15, -0.045, 0.09],
    [-0.04, 0.03, 0.125],
    [0.1, 0.0, 0.1],
    [0.185, -0.07, 0.068],
  ],
};

/** Lua crescente: as duas pontas e, para um ângulo em volta do centro, até onde vai o recorte. */
export function crescentOf(M) {
  const [ix, iy, ir] = M.cut;
  const dx = ix - M.x;
  const dy = iy - M.y;
  const D = Math.hypot(dx, dy);
  const a = (M.R * M.R - ir * ir + D * D) / (2 * D);
  const h = Math.sqrt(M.R * M.R - a * a);
  const up = [M.x + (dx * a - dy * h) / D, M.y + (dy * a + dx * h) / D];
  const down = [M.x + (dx * a + dy * h) / D, M.y + (dy * a - dx * h) / D];
  const a0 = Math.atan2(up[1] - M.y, up[0] - M.x);
  const a1 = Math.atan2(down[1] - M.y, down[0] - M.x) + TAU;
  /** Distância do centro da lua até a beira do recorte, na direção b. */
  const inner = (b) => {
    const p = Math.cos(b) * dx + Math.sin(b) * dy;
    return p + Math.sqrt(Math.max(0, p * p - D * D + ir * ir));
  };
  return { up, down, a0, a1, inner };
}

const skySph = () => {
  const S = SKY;
  const M = S.moon;
  const C = crescentOf(M);
  const out = [...stake(M.stick, M.top, -0.02)];
  // a lua: esferas ao longo do meio do crescente, do tamanho da largura dele em cada ponto
  const n = 16;
  for (let i = 0; i <= n; i++) {
    const b = C.a0 + (i / n) * (C.a1 - C.a0);
    const t = Math.min(M.R, C.inner(b));
    const mid = (M.R + t) / 2;
    out.push([n3(M.x + Math.cos(b) * mid), n3(M.y + Math.sin(b) * mid), 0, n3(Math.max(0.062, (M.R - t) / 2 + 0.024)), 'air']);
  }
  S.clouds.forEach(([x, y, z, k]) => {
    out.push(...stake(x, y - 0.06 * k, z - 0.02));
    out.push([n3(x - 0.135 * k), n3(y - 0.035 * k), z, n3(0.125 * k), 'air'], [n3(x - 0.01 * k), n3(y + 0.01 * k), z, n3(0.16 * k), 'air'], [n3(x + 0.145 * k), n3(y - 0.035 * k), z, n3(0.125 * k), 'air']);
  });
  S.stars.forEach(([x, y, r]) => {
    out.push(...stake(x, y - r * 0.5, -0.02));
    out.push([x, y, 0, n3(r * 1.04), 'air']);
  });
  out.push([S.drop[0], S.drop[1], 0, n3(S.drop[2] * 1.04), 'air'], [n3((S.drop[0] + C.up[0]) / 2), n3((S.drop[1] + S.drop[2] + C.up[1]) / 2), 0, 0.07, 'air']);
  return out;
};

/* ───────── Bolas espelhadas e nuvens de pasta ───────── */

/**
 * Cachos de bolas espelhadas: [x, y, z, raio] de cada bola (apoiadas no topo, encostadas umas nas outras; 1,5 a
 * 3,8 cm). Cada cacho tem uns 4 cm de largura (x): na coroa, um encosta no outro. A malha é feita destas bolas.
 */
export const MIRRORS = [
  [[0, 0.19, 0, 0.19]],
  [
    [-0.062, 0.145, -0.02, 0.145],
    [0.122, 0.1, 0.135, 0.1],
    [0.102, 0.075, -0.148, 0.075],
  ],
  [
    [-0.085, 0.125, 0.03, 0.125],
    [0.118, 0.1, -0.064, 0.1],
  ],
  [
    [0.085, 0.115, -0.03, 0.115],
    [-0.106, 0.09, 0.04, 0.09],
    [-0.021, 0.075, -0.182, 0.075],
  ],
];

/**
 * Nuvens de pasta: [x, y, z, raio] de cada gomo (achatado: a meia altura é y + 0,012). O alto da nuvem aponta
 * para +z. A malha é feita destes gomos.
 */
export const PUFFS = [
  [
    [-0.14, 0.03, -0.012, 0.085],
    [-0.045, 0.046, 0.034, 0.115],
    [0.075, 0.038, 0.018, 0.1],
    [0.165, 0.023, -0.022, 0.07],
  ],
  [
    [-0.092, 0.023, -0.012, 0.07],
    [0.0, 0.036, 0.022, 0.095],
    [0.096, 0.026, -0.006, 0.075],
  ],
  [
    [-0.155, 0.026, -0.018, 0.075],
    [-0.065, 0.038, 0.012, 0.1],
    [0.05, 0.048, 0.04, 0.12],
    [0.162, 0.03, -0.012, 0.085],
  ],
];

/**
 * Todas as variantes de uma peça com o MESMO volume (a união delas): assim, se uma peça colocada à mão cabe ou
 * não num lugar não depende de qual variante o sorteio escolheu para aquele ponto.
 */
const sameVolume = (shapes, r, h) => {
  const sph = shapes.flat();
  return shapes.map(() => ({ r, h, sph }));
};

/* ───────── Especificações ───────── */

export default {
  // fita de cetim em volta de cada andar (o lugar dela é reservado direto em occupancy.js)
  fita: { band: { h: 0.26 } },

  /* ── brilho: confeitos de cobertura (caem onde sobra lugar) ──
     Além dos campos de kit.js, estes confeitos usam (em pecas-festa.js): sideBand = expoente da altura na lateral
     (1 = por igual; maior = mais junto da base) e sideTop = até que fração da altura da lateral o confeito sobe. */
  // pó cintilante: cada "pitada" é um punhado de lâminas minúsculas. Cobre o topo inteiro; na lateral sobe da
  // base até o alto, rareando
  glitter: { coat: { perArea: 490, perSide: 190, rad: 0.04, flat: true, sideBand: 1.5, sideTop: 1 } },
  // bolinhas de dois tamanhos e bastõezinhos, prateados e dourados (a densidade é dividida entre os três)
  metalicos: { coat: { perArea: 62, perSide: 16, rad: 0.026, flat: false, sideBand: 1.6, sideTop: 0.7 } },
  // estrelas chatas de açúcar (7 mm)
  estrelinhas: { coat: { perArea: 58, perSide: 16, rad: 0.037, flat: true, sideBand: 1.5, sideTop: 0.8 } },
  // miçangas: bolinhas de açúcar de 2 mm, uma a uma
  micangas: { coat: { perArea: 400, perSide: 80, rad: 0.0125, flat: false, sideBand: 1.7, sideTop: 0.62 } },

  // bolas espelhadas em cacho: cada variante é uma bola grande ou um cachinho de bolas encostadas (MIRRORS)
  espelhadas: {
    vars: sameVolume(MIRRORS, 0.285, 0.38),
    size: [0.92, 1.05],
    face: 'out',
    alt: true,
    ring: { step: 0.43, touch: 0.405, out: 0.252, band: 0.5 },
    pile: [0.215, 5, 0],
    scat: [0.26, 3],
  },

  /* ── papel e festa ── */
  // varal de bandeirinhas entre dois palitos, em pé no fundo do topo
  bandeirolas: {
    vars: [{ r: 0.64, depth: 0.05, h: 1.06, sph: flagsSph() }],
    hero: { s: [0.6, 1] },
    grow: 0.6,
    minS: 0.6,
    face: 'front',
  },
  // leques (rosetas plissadas) de 7, 6 e 5 cm; a origem é o miolo, onde o palito termina por trás. As variantes
  // se alternam na ordem (a 4ª e a 5ª repetem os tamanhos menores: são as da fileira de trás, no "farto"). As
  // alturas (h = do bolo ao miolo) deixam cada roseta acima do bolo e desencontrada das vizinhas.
  leques: {
    vars: [0.35, 0.3, 0.25, 0.25, 0.3].map((R) => ({ r: R, h: R, sph: disc(R, 0.04) })),
    size: [0.96, 1.04],
    alt: true,
    stick: { n: [2, 3, 5], h: [0.97, 0.44, 0.7, 0.72, 0.36], gap: 0.6, fan: 0.3, tilt: 0.1, lean: 0.06, r: 0.012, max: 1.35 },
  },
  // cata-ventos de 6 cm (duas posições de giro)
  catavento: {
    vars: [0, 1].map(() => ({ r: 0.3, h: 0.3, sph: disc(0.3, 0.035) })),
    size: [0.88, 1.1],
    alt: true,
    stick: { n: [2, 3, 4], h: [0.86, 0.52, 0.36, 0.92], gap: 0.6, fan: 0.26, tilt: 0.12, lean: 0.06, r: 0.012, max: 1.3 },
  },
  // bolas de papel colmeia de 5,6 · 4,2 · 4,9 cm; a origem é o polo de baixo, por onde o palito entra. As alturas
  // (h = do bolo ao polo de baixo) garantem que duas bolas vizinhas — na mesma fileira ou uma atrás da outra —
  // nunca se atravessem.
  pompons: {
    vars: [0.28, 0.21, 0.245].map((R) => ({ r: R, h: 2 * R, sph: [[0, R, 0, n3(R * 1.02)]] })),
    size: [0.95, 1.05],
    alt: true,
    stick: { n: [2, 3, 4], h: [0.72, 0.34, 0.26, 0.8], gap: 0.5, fan: 0.2, tilt: 0.14, lean: 0.05, r: 0.012, into: 0.04, max: 1.2 },
  },
  // lua crescente, duas nuvens e estrelinhas no palito, em pé no fundo do topo
  luanuvens: {
    vars: [{ r: 0.72, depth: 0.07, h: 1.42, sph: skySph() }],
    hero: { s: [0.6, 1] },
    grow: 0.6,
    minS: 0.6,
    face: 'front',
  },
  // arco-íris de pasta de açúcar (10,4 cm) com uma nuvem em cada pé
  arcoiris: {
    vars: [{ r: 0.56, depth: 0.19, h: 0.53, sph: rainbowSph() }],
    hero: { s: [0.6, 1] },
    grow: 0.5,
    minS: 0.62,
    face: 'front',
  },
  // coroa de pasta de goma metalizada, no centro do topo
  coroa: {
    vars: [{ r: 0.375, h: 0.42, sph: crownSph() }],
    hero: { s: [0.6, 1] },
    grow: 0.5,
    minS: 0.62,
    face: 'front',
  },
  // nuvens fofinhas: gomos de pasta achatados (PUFFS), deitadas no topo (o alto da nuvem aponta para o meio do
  // bolo) e coladas na lateral (o alto para cima)
  nuvens: {
    vars: sameVolume(PUFFS, 0.255, 0.105),
    size: [0.9, 1.08],
    face: 'in',
    alt: true,
    ring: { step: 0.56, touch: 0.5, out: 0.28, band: 0.5 },
    scat: [0.225, 5],
    scatSide: { per: 0.95, lo: 0.3, hi: 0.86 },
    side: { depth: -0.004, mode: 'base', roll: 0.5 },
  },
};
