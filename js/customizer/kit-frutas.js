// BOLAB — especificações das peças do grupo "frutas" (frutas e flores; ver kit.js). Só dados — e as contas que
// os geram: a malha de cada peça (pecas-frutas.js) lê daqui as mesmas medidas (pose do morango, bagos do cacho…),
// para as esferas de ocupação `sph` cobrirem exatamente o que é desenhado.
const TAU = Math.PI * 2;
const r3 = (n) => Math.round(n * 1000) / 1000;

/* ───────── Poses ─────────
   Uma pose é uma lista de passos — ['x' | 'y' | 'z', ângulo] gira, ['t', x, y, z] desloca — aplicada, na mesma
   ordem, à malha (applyPose, em pecas-frutas.js) e às esferas de ocupação descritas no espaço da peça. */
const place = (p, ops) =>
  ops.reduce(([x, y, z], [k, a, b, c]) => {
    if (k === 't') return [x + a, y + b, z + c];
    const cs = Math.cos(a);
    const sn = Math.sin(a);
    if (k === 'x') return [x, y * cs - z * sn, y * sn + z * cs];
    if (k === 'y') return [x * cs + z * sn, y, -x * sn + z * cs];
    return [x * cs - y * sn, x * sn + y * cs, z];
  }, p);
/** Variante: esferas locais [[x, y, z, raio, classe?]] levadas pela pose; r e h saem delas. */
function posed(local, pose, more = {}) {
  const sph = local.map(([x, y, z, rad, cls]) => {
    const q = place([x, y, z], pose).map(r3);
    return cls ? [...q, rad, cls] : [...q, rad];
  });
  return { r: r3(Math.max(...sph.map((q) => Math.hypot(q[0], q[2]) + q[3]))), h: r3(Math.max(...sph.map((q) => q[1] + q[3]))), pose, sph, ...more };
}
/** Esferas de uma fatia deitada no plano xz (antes da pose): uma no meio e uma roda na borda. Meia-lua: z ≥ 0. */
function sliceSph(R, { half = false, n = half ? 5 : 10, rim = R * 0.36, twist = 0 } = {}) {
  const out = [half ? [0, 0, R * 0.34, R * 0.38] : [0, 0, 0, R * 0.44]];
  const d = R - rim;
  for (let i = 0; i < n; i++) {
    const a = half ? (Math.PI * (i + 0.5)) / n : (TAU * (i + 0.5)) / n;
    out.push([d * Math.cos(a), twist ? (twist * (a - Math.PI) * d) / (Math.PI * R) : 0, d * Math.sin(a), rim]);
  }
  if (half) out.push([-0.8 * R, 0, 0.12 * R, 0.2 * R], [0.8 * R, 0, 0.12 * R, 0.2 * R]);
  return out.map((q) => q.map(r3));
}

/* ───────── Morangos inteiros ─────────
   Perfil do morango da biblioteca (raio, y): ponta em −y, cálice em +y. Cada variante é uma pose: deitado com a
   ponta para (lean, yaw) — yaw 0 = ponta para fora do bolo — ou em pé, de ponta para cima. */
const BERRY = [[0.0005, -0.165], [0.03, -0.155], [0.068, -0.105], [0.1, -0.035], [0.114, 0.04], [0.105, 0.1], [0.075, 0.138], [0.03, 0.15], [0.0005, 0.146]];
function strawberry(lean, yaw, w = 1) {
  const sl = Math.sin(lean);
  const cl = Math.cos(lean);
  const a = [sl * Math.sin(yaw), cl, sl * Math.cos(yaw)]; // para onde aponta a ponta
  // altura do centro: o ponto mais baixo da fruta girada encosta na cobertura (e afunda um tico nela)
  const cy = Math.max(...BERRY.map(([rho, y]) => y * cl + rho * sl)) - (0.004 + 0.014 * sl);
  const c = [0.012 * a[0], cy, 0.012 * a[2]];
  const at = (k, rad) => [r3(c[0] + a[0] * k), r3(c[1] + a[1] * k), r3(c[2] + a[2] * k), rad];
  return { r: 0.15, h: r3(cy + 0.12 + 0.05 * cl), w, pose: { lean, yaw, c }, sph: [at(-0.02, 0.118), at(0.098, 0.07), at(-0.095, 0.112)] };
}

/* ───────── Mirtilos ─────────
   Cachinhos de 2 a 4 frutas soltas, encostadas: [x, y (centro), z, raio, inclinação da coroa, direção da coroa]. */
const blue = (list, w = 1) => ({ r: 0.14, h: r3(Math.max(...list.map((b) => b[1] + b[3]))), w, berries: list, sph: list.map(([x, y, z, R]) => [x, y, z, r3(R * 1.04)]) });

/* ───────── Cachinhos de uva ─────────
   Bagos de cada cacho deitado (a ponta do cacho em +z, o cabo em −z): [x, y, z, raio]. */
const bunch = (grapes, stem, w = 1) => ({
  r: r3(Math.max(...grapes.map(([x, , z, R]) => Math.hypot(x, z) + R))),
  h: r3(Math.max(...grapes.map((g) => g[1] + g[3]))),
  w,
  grapes,
  stem,
  sph: [...grapes.map(([x, y, z, R]) => [x, y, z, r3(R * 1.05)]), [stem[1][0], stem[1][1], stem[1][2], 0.035], [r3((stem[0][0] + stem[1][0]) / 2), r3((stem[0][1] + stem[1][1]) / 2 + 0.01), r3((stem[0][2] + stem[1][2]) / 2), 0.05]],
});
const GRAPES_A = [
  // de baixo: 3 · 3 · 1
  [-0.15, 0.08, -0.12, 0.082], [0.015, 0.078, -0.15, 0.08], [0.17, 0.081, -0.105, 0.083],
  [-0.085, 0.079, 0.02, 0.081], [0.08, 0.083, 0.03, 0.085], [0.232, 0.068, 0.062, 0.07],
  [-0.012, 0.076, 0.165, 0.078],
  // por cima, nos vãos
  [-0.07, 0.2, -0.072, 0.08], [0.092, 0.205, -0.058, 0.08], [0, 0.195, 0.075, 0.075],
];
const GRAPES_B = [
  [-0.085, 0.079, -0.1, 0.081], [0.08, 0.082, -0.112, 0.084],
  [-0.15, 0.077, 0.04, 0.079], [0.012, 0.08, 0.035, 0.082],
  [-0.066, 0.075, 0.17, 0.076],
  [-0.002, 0.2, -0.045, 0.08], [-0.07, 0.193, 0.092, 0.074],
];

/* ───────── Figos cortados ─────────
   No espaço da fruta: eixo em +y (pé em y = 0, cabinho em y = 0,44), face cortada em z = 0, casca para −z. */
// fatias da fruta ao longo do eixo: [y, raio ali]; cada uma coberta por 3 esferas (metade) ou 4 (quarto)
const FIG_ROWS = [[0.05, 0.14], [0.155, 0.19], [0.26, 0.16], [0.345, 0.092]];
const FIG_HALF = [...FIG_ROWS.flatMap(([y, q]) => [[-0.5 * q, y, -0.3 * q, 0.57 * q], [0.5 * q, y, -0.3 * q, 0.57 * q], [0, y, -0.56 * q, 0.5 * q]]), [0, 0.412, -0.008, 0.04]].map((s) => s.map(r3));
const FIG_QUARTER = [...FIG_ROWS.slice(0, 3).flatMap(([y, q]) => [[-0.33 * q, y, -0.55 * q, 0.4 * q], [0.33 * q, y, -0.55 * q, 0.4 * q], [0, y, -0.24 * q, 0.3 * q], [0, y, -0.76 * q, 0.28 * q]]), [0, 0.35, -0.045, 0.06], [0, 0.412, -0.012, 0.035]].map((s) => s.map(r3));
const fig = (quarter, roll, rx, ry, dy, w = 1) => posed(quarter ? FIG_QUARTER : FIG_HALF, [['t', 0, -0.185, 0], ['y', roll], ['x', rx], ['y', ry], ['t', 0, dy, 0]], { quarter, w });

/* ───────── Physalis ─────────
   No espaço da fruta: o cabinho na origem, a bolinha em +y; as sépalas da capa abrem em volta e viram para −y.
   sepals = direção de cada sépala em volta do eixo (graus) · back = quanto elas viram para trás. */
const physalis = (pose, sepals, back, w = 1) =>
  posed([[0, 0.097, 0, 0.09], ...sepals.map((deg) => [0.175 * Math.cos((deg * Math.PI) / 180), 0.012 - back * 0.42, 0.175 * Math.sin((deg * Math.PI) / 180), 0.105])], pose, { sepals, back, w });

/* ───────── Maracujá ─────────
   Metade em cuia: a face cortada na origem, virada para +y; a cuia desce até −dep. Apoiada, tomba de rx para fora. */
const PASSION = { R: 0.3, dep: 0.27 };
const passion = (rx, ry, w = 1) => posed([[0, -0.1, 0, 0.318]], [['x', rx], ['y', ry], ['t', 0, Math.hypot(PASSION.R * Math.sin(rx), PASSION.dep * Math.cos(rx)) - 0.004, 0]], { w, ...PASSION });

/* ───────── Fatias (kiwi, limão, laranja) ─────────
   A fatia nasce deitada no plano xz, centrada; a meia-lua ocupa z ≥ 0 (o corte reto ao longo de x). */
const KIWI = 0.23;
const LEMON = 0.25;
const ORANGE = 0.27;
const flat = (R, y, more = {}) => posed(sliceSph(R), [['t', 0, y, 0]], { R, ...more });
const halfFlat = (R, y, more = {}) => posed(sliceSph(R, { half: true }), [['t', 0, y, -0.4 * R]], { R, half: true, ...more });
/** Meia-lua em pé sobre o corte reto, deitada `lean` para trás e girada `yaw`. */
const halfUp = (R, lean, yaw, more = {}) => posed(sliceSph(R, { half: true }), [['x', -(Math.PI / 2 + lean)], ['y', yaw], ['t', 0, -0.012, 0.1 * R]], { R, half: true, ...more });
/** Rodela em pé, fincada na cobertura (afunda `sink`), deitada `lean` para trás e girada `yaw`. */
const upright = (R, lean, yaw, sink, more = {}) => posed(sliceSph(R, { rim: R * 0.3 }), [['t', 0, 0, R], ['x', -(Math.PI / 2 + lean)], ['y', yaw], ['t', 0, -sink, 0.12 * R]], { R, ...more });
/** Rodela torcida: cortada num raio e torcida, fica em pé sobre as duas pontas do corte. */
const twisted = (R, twist, yaw, more = {}) => posed(sliceSph(R, { twist, n: 6 }), [['z', -Math.PI / 2], ['y', -Math.PI / 2 + yaw], ['t', 0, R * 0.965, 0]], { R, twist, ...more });

/* ───────── Flores e folhagens ───────── */
/** Tufo de mosquitinho: uma nuvem baixa de raminhos que nascem no mesmo ponto (serve em pé no topo e colado na lateral). */
const tuft = (seed, w = 1) => ({ r: 0.2, h: 0.2, w, seed, sph: [[0, 0.04, 0, 0.2]] });
/**
 * Raminho deitado ao longo de z (a ponta em −z), encurvado de `bend` para o lado −x — o centro do bolo, quando a
 * peça acompanha a borda (face 'tang'). list = esferas ao longo dele: [z, y, raio, desvio em x].
 */
const sprig = (list, bend, more = {}) => {
  const sph = list.map(([z, y, rad, dx = 0]) => [r3(dx - bend * z * z), y, z, rad]);
  return { r: r3(Math.max(...sph.map((q) => Math.hypot(q[0], q[2]) + q[3]))), h: r3(Math.max(...sph.map((q) => q[1] + q[3]))), sph, bend, ...more };
};
/** Duas fileiras de esferas (uma de cada lado do eixo) entre z0 e z1: cobre um ramo de folhas largas. */
const rows = (z0, z1, n, y, rad, dx) => Array.from({ length: n }, (_, i) => z0 + ((z1 - z0) * i) / (n - 1)).flatMap((z) => [[r3(z), y, rad, -dx], [r3(z), y, rad, dx]]);
/**
 * Decalque chapado (flor prensada) numa placa de w × h: rente à cobertura, com o alto do desenho em +z. As esferas
 * contam como peça apoiada (a flor não invade o bico da borda nem a calda, e nada é posto em cima dela):
 *   · a primeira, no meio, dá o espaçamento entre uma flor e a seguinte (é por ela que a cascata mede a distância);
 *   · uma grade de bolinhas baixas cobre o desenho até as pontas;
 *   · uma bolinha mínima logo acima do desenho: na lateral, afasta a flor do alto da faixa livre, onde as rosetas
 *     grandes da borda do topo (nos cantos de um bolo sextavado) chegam a encostar em quem está colado ali.
 */
const pressed = (w, h) => {
  const square = h < w * 1.3;
  const rho = Math.min(w, h) * (square ? 0.22 : 0.3);
  const xs = square ? [-0.28 * w, 0, 0.28 * w] : [-0.2 * w, 0.2 * w];
  const z0 = h / 2 - rho;
  const n = Math.max(2, Math.ceil((2 * z0) / (1.3 * rho)) + 1);
  const grid = Array.from({ length: n }, (_, i) => -z0 + (2 * z0 * i) / (n - 1)).flatMap((z) => xs.map((x) => [r3(x), 0, r3(z), r3(rho)]));
  const sph = [[0, 0, 0, r3(0.4 * Math.max(w, h))], ...grid, [0, 0, r3(h / 2 + 0.045), 0.015]];
  return { r: r3(Math.max(...sph.map((q) => Math.hypot(q[0], q[2]) + q[3]))), h: 0.01, card: [w, h], sph };
};
/** Flor de bico baixa e redonda: uma esfera no miolo e uma roda nas pontas das pétalas. */
const rosette = (R, h, more = {}) => ({ r: R, h, sph: [[0, h * 0.45, 0, r3(R * 0.5)], ...Array.from({ length: 7 }, (_, i) => [r3(R * 0.64 * Math.cos((i / 7) * TAU)), r3(h * 0.4), r3(R * 0.64 * Math.sin((i / 7) * TAU)), r3(R * 0.36)])], ...more });

// Na coroa, `out` é a distância do apoio à beira do topo: tem de caber a esfera mais avançada da maior peça
// (× size máx); `band` soma a isso o quanto a peça avança para dentro.
export default {
  morangosfrescos: {
    vars: [strawberry(1.1, 0), strawberry(1.0, 0.45), strawberry(1.18, Math.PI - 0.35, 0.8), strawberry(0.1, 2.2, 0.5)],
    size: [0.9, 1.08],
    face: 'out',
    ring: { step: 0.275, touch: 0.25, out: 0.2, band: 0.41 },
    pile: [0.162, 6, 0.15],
    scat: [0.185, 7],
  },
  framboesas: {
    vars: [
      { r: 0.095, h: 0.2, sph: [[0, 0.074, 0, 0.098], [0, 0.122, 0, 0.078]] },
      { r: 0.095, h: 0.2, sph: [[0, 0.074, 0, 0.1], [0, 0.118, 0, 0.078]] },
      { r: 0.095, h: 0.19, w: 0.7, sph: [[0, 0.09, -0.04, 0.095], [0, 0.09, 0.035, 0.095]] },
    ],
    size: [0.9, 1.1],
    face: 'out',
    ring: { step: 0.215, touch: 0.2, out: 0.148, band: 0.27 },
    pile: [0.1, 9, 0.125],
    scat: [0.115, 10],
  },
  mirtilos: {
    vars: [
      blue([[-0.066, 0.053, 0.036, 0.062, 0.5, 0.6], [0.066, 0.052, 0.03, 0.06, 1.25, 2.2], [0, 0.055, -0.076, 0.064, 0.2, 4], [0, 0.142, -0.004, 0.058, 0.75, 5.2]], 0.8),
      blue([[-0.07, 0.055, -0.02, 0.064, 0.3, 1.2], [0.058, 0.05, -0.05, 0.058, 1.5, 3.4], [0.012, 0.053, 0.072, 0.062, 0.9, 0.2]]),
      blue([[-0.064, 0.056, 0, 0.065, 0.15, 2], [0.066, 0.052, 0.012, 0.06, 1.1, 5]]),
    ],
    size: [0.9, 1.1],
    ring: { step: 0.27, touch: 0.25, out: 0.162, band: 0.32 },
    pile: [0.14, 7, 0.105],
    scat: [0.15, 9],
  },
  amoras: {
    vars: [
      { r: 0.105, h: 0.25, sph: [[0, 0.086, 0, 0.108], [0, 0.156, 0, 0.098]] },
      { r: 0.105, h: 0.2, w: 0.8, sph: [[0, 0.096, -0.045, 0.102], [0, 0.096, 0.045, 0.1]] },
      { r: 0.105, h: 0.24, sph: [[0, 0.084, 0, 0.11], [0, 0.142, 0, 0.096]] },
    ],
    size: [0.9, 1.08],
    face: 'out',
    ring: { step: 0.235, touch: 0.215, out: 0.16, band: 0.32 },
    pile: [0.108, 8, 0.135],
    scat: [0.125, 9],
  },
  uvas: {
    vars: [bunch(GRAPES_A, [[0.01, 0.17, -0.1], [-0.01, 0.27, -0.27]]), bunch(GRAPES_B, [[-0.01, 0.16, -0.08], [0.03, 0.25, -0.24]])],
    size: [0.92, 1.06],
    face: 'out',
    alt: true,
    ring: { step: 0.54, touch: 0.52, out: 0.275, band: 0.6 },
    pile: [0.275, 3, 0],
  },
  figos: {
    vars: [fig(false, 0, -Math.PI / 2 + 0.32, 0.15, 0.19), fig(true, 0.3, -Math.PI / 2 + 0.16, -0.7, 0.187), fig(false, 0.45, -Math.PI / 2 + 0.2, 1.9, 0.188), fig(true, -0.35, -Math.PI / 2 + 0.25, 2.5, 0.188)],
    size: [0.9, 1.06],
    face: 'out',
    alt: true,
    ring: { step: 0.43, touch: 0.41, out: 0.25, band: 0.52 },
    pile: [0.225, 3, 0],
  },
  physalis: {
    vars: [
      physalis([['x', 1.25], ['t', 0, 0.05, -0.03]], [270, 325, 215, 15, 165], 0.1),
      physalis([['x', 0.12], ['y', 1], ['t', 0, 0.062, 0]], [10, 80, 150, 225, 295], 0.055, 0.7),
      physalis([['x', 1.05], ['y', 0.7], ['t', 0, 0.033, -0.03]], [262, 318, 206, -6, 186], 0.12),
    ],
    size: [0.9, 1.06],
    face: 'out',
    ring: { step: 0.42, touch: 0.39, out: 0.3, band: 0.6 },
    pile: [0.21, 5, 0],
    scat: [0.23, 6],
  },
  kiwi: {
    vars: [flat(KIWI, 0.019), halfFlat(KIWI, 0.019), halfUp(KIWI, 0.32, 0.25)],
    size: [0.92, 1.06],
    face: 'out',
    alt: true,
    ring: { step: 0.485, touch: 0.47, out: 0.245, band: 0.5 },
    scat: [0.25, 6],
  },
  laranja: {
    // em pé e deitadas alternadas: a beirada da deitada passa por baixo da que está fincada ao lado
    vars: [upright(ORANGE, 0.2, 0.42, 0.045), flat(ORANGE * 0.94, 0.04), upright(ORANGE, 0.34, -0.5, 0.05), flat(ORANGE * 0.9, 0.04)],
    size: [0.9, 1.06],
    face: 'out',
    alt: true,
    ring: { step: 0.45, touch: 0.42, out: 0.28, band: 0.56 },
    pile: [0.255, 4, 0],
  },
  limao: {
    // deitadas e torcidas alternadas (a torcida fica em pé: a deitada ao lado passa por baixo dela)
    vars: [flat(LEMON, 0.015), twisted(LEMON * 0.92, 0.19, 0.8), halfFlat(LEMON, 0.015), twisted(LEMON * 0.92, 0.17, -0.8)],
    size: [0.92, 1.06],
    face: 'out',
    alt: true,
    ring: { step: 0.47, touch: 0.44, out: 0.3, band: 0.58 },
    scat: [0.27, 5],
  },
  maracuja: {
    vars: [passion(0.42, 0), passion(0.3, 0.8)],
    size: [0.92, 1.04],
    face: 'out',
    alt: true,
    minS: 0.7,
    ring: { step: 0.66, touch: 0.64, out: 0.34, band: 0.7 },
    pile: [0.33, 3, 0],
  },
  gipsofila: {
    vars: [tuft(1), tuft(2), tuft(3)],
    size: [0.85, 1.12],
    ring: { step: 0.3, touch: 0.26, out: 0.24, band: 0.48 },
    pile: [0.17, 5, 0.09],
    casc: [0.17, 8],
    side: { depth: 0 },
  },
  lavanda: {
    vars: [
      sprig([[0.33, 0.02, 0.05], [0.2, 0.025, 0.06], [0.06, 0.03, 0.075], [-0.1, 0.035, 0.085, -0.045], [-0.1, 0.035, 0.085, 0.045], [-0.26, 0.035, 0.085, -0.06], [-0.26, 0.035, 0.085, 0.06]], 0.55, { n: 3 }),
      sprig([[0.33, 0.02, 0.05], [0.2, 0.025, 0.06], [0.06, 0.03, 0.07], [-0.1, 0.035, 0.085, -0.02], [-0.1, 0.035, 0.08, 0.035], [-0.26, 0.035, 0.085, -0.035], [-0.26, 0.035, 0.08, 0.045]], 0.55, { n: 2 }),
    ],
    size: [0.92, 1.08],
    face: 'tang',
    alt: true,
    ring: { step: 0.56, touch: 0.5, out: 0.2, band: 0.36 },
    pile: [0.3, 2, 0],
  },
  eucalipto: {
    vars: [
      sprig([[0.3, 0.04, 0.06], ...rows(0.21, -0.24, 4, 0.075, 0.125, 0.075), [-0.345, 0.06, 0.08], [-0.405, 0.05, 0.04]], 0.7, { nodes: 7, len: 0.64 }),
      sprig([[0.25, 0.04, 0.06], ...rows(0.16, -0.19, 4, 0.075, 0.12, 0.07), [-0.295, 0.06, 0.075], [-0.35, 0.05, 0.04]], 0.7, { nodes: 6, len: 0.54 }),
      // raminho curto, pendurado: só para a lateral (cascata)
      // (a primeira esfera, larga, é a que dá o espaçamento entre um raminho e o seguinte na descida)
      sprig([[-0.02, 0.05, 0.18], [0.2, 0.035, 0.06], [0.1, 0.05, 0.11], [-0.16, 0.05, 0.12], [-0.26, 0.05, 0.075]], 0, { nodes: 5, len: 0.46, sideOnly: true }),
    ],
    size: [0.92, 1.08],
    face: 'tang',
    alt: true,
    ring: { step: 0.47, touch: 0.42, out: 0.25, band: 0.47 },
    casc: [0.2, 6],
    side: { v: 2, depth: 0, roll: 0.9 },
  },
  prensadas: {
    vars: [pressed(0.36, 0.36), pressed(0.27, 0.27), pressed(0.26, 0.5), pressed(0.34, 0.34), pressed(0.22, 0.42)],
    size: [0.86, 1.1],
    scat: [0.2, 8],
    scatSide: { per: 1.1, lo: 0.16, hi: 0.86 },
    casc: [0.17, 8],
    side: { depth: 0.004, roll: 0.8 },
  },
  suculentas: {
    vars: [rosette(0.19, 0.13), rosette(0.19, 0.14), rosette(0.16, 0.12)],
    size: [0.86, 1.12],
    ring: { step: 0.41, touch: 0.385, out: 0.225, band: 0.45 },
    pile: [0.195, 5, 0],
  },
  girassois: {
    vars: [rosette(0.25, 0.09, { leaves: [0.6, 3.5] }), rosette(0.25, 0.09, { leaves: [2.2] })],
    size: [0.88, 1.06],
    ring: { step: 0.52, touch: 0.5, out: 0.275, band: 0.55 },
    pile: [0.255, 3, 0],
  },
};
