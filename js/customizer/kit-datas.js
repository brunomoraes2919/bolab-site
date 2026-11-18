// BOLAB — especificações das peças do grupo "datas" (datas comemorativas e natureza; ver kit.js). Só dados.
// Medidas em unidades do mundo (1 = 10 cm), tiradas das malhas de pecas-datas.js; as esferas cobrem cada malha.
const TAU = Math.PI * 2;
/** n esferas de raio r em roda no plano do topo (raio rad, altura y). */
const roda = (n, rad, y, r) => Array.from({ length: n }, (_, i) => [Math.sin((i / n) * TAU) * rad, y, Math.cos((i / n) * TAU) * rad, r]);
/** n esferas de raio r em roda num recorte de frente (plano XY), em volta de (0, cy), à frente z. */
const leque = (n, rad, cy, z, r) => Array.from({ length: n }, (_, i) => [Math.sin((i / n) * TAU) * rad, cy + Math.cos((i / n) * TAU) * rad, z, r]);
/** Espelha no eixo x as esferas que não estão no meio. */
const par = (list) => list.flatMap((q) => (q[0] ? [q, [-q[0], ...q.slice(1)]] : [q]));

export default {
  /* ── jardim ── */
  // cogumelos de pasta (dois tamanhos, alternados): 3,6 cm e 2,7 cm de altura
  cogumelos: {
    vars: [
      { r: 0.185, h: 0.37, sph: [[0, 0.078, 0, 0.105], [0, 0.26, 0, 0.185]] },
      { r: 0.14, h: 0.27, sph: [[0, 0.064, 0, 0.088], [0, 0.185, 0, 0.14]] },
    ],
    size: [0.9, 1.08],
    alt: true,
    ring: { step: 0.44, touch: 0.4, band: 0.37 },
    pile: [0.19, 5, 0],
    scat: [0.2, 6],
  },
  // joaninhas (1,5 cm): no topo e andando pela lateral
  joaninhas: { vars: [{ r: 0.08, h: 0.06, sph: [[0, 0.02, 0.011, 0.082]] }], size: [0.85, 1.15], scat: [0.09, 7], scatSide: { per: 1.4 }, side: { depth: 0 } },

  /* ── safári e dinossauros ── */
  // silhuetas de papel no palito (6 cm): o pescoçudo no meio, mais alto; o de placas e o de três chifres dos lados
  dinos: {
    vars: [
      { r: 0.31, h: 0.46, sph: [[-0.049, 0.207, 0.015, 0.106], [0.082, 0.207, 0.015, 0.106], [-0.095, 0.07, 0.015, 0.09], [0.116, 0.066, 0.015, 0.082], [-0.198, 0.178, 0.015, 0.069], [-0.272, 0.148, 0.015, 0.052], [0.157, 0.272, 0.015, 0.06], [0.165, 0.331, 0.015, 0.065], [0.207, 0.397, 0.015, 0.06], [0.252, 0.437, 0.015, 0.06]] },
      { r: 0.32, h: 0.37, sph: [[-0.066, 0.178, 0.015, 0.11], [0.074, 0.178, 0.015, 0.11], [-0.141, 0.272, 0.015, 0.06], [-0.057, 0.306, 0.015, 0.065], [0.033, 0.318, 0.015, 0.065], [0.116, 0.298, 0.015, 0.06], [0.178, 0.256, 0.015, 0.052], [-0.207, 0.182, 0.015, 0.085], [-0.277, 0.215, 0.015, 0.073], [0.223, 0.157, 0.015, 0.069], [0.285, 0.116, 0.015, 0.048], [-0.095, 0.057, 0.015, 0.073], [0.136, 0.057, 0.015, 0.073]] },
      { r: 0.31, h: 0.38, sph: [[-0.074, 0.186, 0.015, 0.11], [0.057, 0.186, 0.015, 0.11], [-0.207, 0.165, 0.015, 0.077], [-0.269, 0.136, 0.015, 0.045], [0.108, 0.306, 0.015, 0.073], [0.207, 0.198, 0.015, 0.102], [0.232, 0.331, 0.015, 0.057], [0.277, 0.323, 0.015, 0.045], [0.281, 0.165, 0.015, 0.048], [0.285, 0.235, 0.015, 0.036], [-0.103, 0.057, 0.015, 0.073], [0.133, 0.057, 0.015, 0.073]] },
    ],
    size: [0.94, 1.04],
    stick: { n: [1, 2, 3], h: [0.42, 0.16, 0.18], gap: 0.64, lean: 0.05, fan: 0.1, tilt: 0.04, r: 0.012, into: 0.18 },
  },
  // folhas de papel: costela-de-adão e palmeira — no palito (0, 1) e coladas na lateral (2, 3)
  folhastropicais: {
    vars: [
      { r: 0.38, h: 0.78, stickOnly: true, sph: [[0, 0.37, 0.04, 0.15], ...leque(8, 0.29, 0.37, 0.04, 0.17)] },
      { r: 0.3, h: 0.9, stickOnly: true, sph: [[0, 0.06, 0.02, 0.07], [0, 0.17, 0.02, 0.125], [-0.12, 0.3, 0.04, 0.16], [0.14, 0.3, 0.04, 0.16], [-0.1, 0.52, 0.04, 0.17], [0.18, 0.52, 0.04, 0.17], [-0.02, 0.72, 0.04, 0.15], [0.2, 0.72, 0.04, 0.14], [0.1, 0.85, 0.02, 0.08]] },
      { r: 0.25, h: 0.5, topOnly: true, sph: [[0, 0, 0.008, 0.1], ...leque(8, 0.185, -0.012, 0.008, 0.12)] },
      { r: 0.2, h: 0.58, topOnly: true, sph: [[-0.029, -0.262, 0.008, 0.045], [-0.029, -0.192, 0.008, 0.075], [-0.106, -0.109, 0.008, 0.103], [0.061, -0.109, 0.008, 0.103], [-0.093, 0.032, 0.008, 0.109], [0.086, 0.032, 0.008, 0.109], [-0.042, 0.16, 0.008, 0.096], [0.099, 0.16, 0.008, 0.09], [0.035, 0.243, 0.008, 0.052]] },
    ],
    size: [0.9, 1.08],
    stick: { n: [2, 3, 5], h: [0.2, 0.32, 0.14, 0.36, 0.24], gap: 0.5, lean: 0.1, fan: 0.35, tilt: 0.38, r: 0.011, into: 0.12 },
    scatSide: { per: 0.8, lo: 0.36, hi: 0.6 },
    side: { mode: 'face', depth: 0.004, roll: 1.5 },
  },
  // pegadas chapadas (2 cm): subindo pela lateral e pelo topo
  pegadas: { vars: [{ r: 0.105, h: 0.015, sph: [[0, 0, -0.04, 0.07], [0, 0, 0.045, 0.062], [-0.06, 0, 0.03, 0.04], [0.06, 0, 0.03, 0.04]] }], size: [0.9, 1.12], scat: [0.14, 8], scatSide: { per: 2, lo: 0.14, hi: 0.9 }, side: { depth: 0, roll: 0.8 } },

  /* ── festa junina ── */
  // chapéu de palha (8,7 cm no bolo M; acompanha um pouco o tamanho do bolo), peça única no centro
  chapeupalha: { vars: [{ r: 0.44, h: 0.21, sph: [[0, 0.06, 0, 0.25], ...roda(14, 0.35, 0.03, 0.125)] }], hero: { s: [0.5, 1] }, minS: 0.5, grow: 0.5, face: 'front' },

  /* ── Natal ── */
  // raminhos de azevinho: três folhas (4 cm) e duas folhas
  azevinho: {
    vars: [
      { r: 0.22, h: 0.08, sph: [[0, 0.02, 0, 0.22]] },
      { r: 0.2, h: 0.07, sph: [[0, 0.02, -0.02, 0.2]] },
    ],
    size: [0.92, 1.08],
    face: 'tang',
    ring: { step: 0.5, touch: 0.45, band: 0.44 },
    scat: [0.22, 6],
  },
  // pinheirinhos de bico: 8 cm e 6 cm
  pinheirinhos: {
    vars: [
      { r: 0.25, h: 0.82, sph: [[0, 0.11, 0, 0.25], [0, 0.32, 0, 0.2], [0, 0.5, 0, 0.14], [0, 0.66, 0, 0.1], [0, 0.78, 0, 0.07]] },
      { r: 0.215, h: 0.6, sph: [[0, 0.1, 0, 0.215], [0, 0.28, 0, 0.16], [0, 0.42, 0, 0.11], [0, 0.55, 0, 0.07]] },
    ],
    size: [0.94, 1.04],
    alt: true,
    face: 'front',
    ring: { step: 0.58, touch: 0.52, band: 0.5 },
    pile: [0.255, 3, 0],
  },
  // flocos de neve chapados (3,4 · 2,8 · 2,3 cm): no topo e na lateral
  flocos: {
    vars: [
      { r: 0.17, h: 0.015, sph: [[0, 0, 0, 0.075], ...roda(6, 0.1, 0, 0.072)] },
      { r: 0.145, h: 0.015, sph: [[0, 0, 0, 0.065], ...roda(6, 0.085, 0, 0.06)] },
      { r: 0.118, h: 0.015, sph: [[0, 0, 0, 0.055], ...roda(6, 0.07, 0, 0.05)] },
    ],
    size: [0.92, 1.1],
    scat: [0.18, 7],
    scatSide: { per: 1.5, lo: 0.2, hi: 0.86 },
    side: { depth: 0 },
  },

  /* ── Páscoa ── */
  // cenourinhas deitadas (3,2 cm com as folhas): na coroa, a ponta aponta para o meio do bolo
  cenourinhas: {
    vars: [{ r: 0.17, h: 0.1, sph: [[0, 0.055, -0.135, 0.05], [0, 0.047, -0.07, 0.058], [0, 0.04, 0, 0.054], [0.005, 0.03, 0.065, 0.043], [0.013, 0.02, 0.12, 0.036]] }],
    size: [0.9, 1.1],
    face: 'in',
    ring: { step: 0.34, touch: 0.16, band: 0.36, out: 0.205 },
    scat: [0.17, 7],
  },

  /* ── Halloween ── */
  // fantasminhas de suspiro (3,2 cm)
  fantasmas: {
    vars: [{ r: 0.135, h: 0.32, sph: [[0, 0.06, 0, 0.135], [0, 0.17, 0, 0.115], [0.016, 0.285, 0, 0.045]] }],
    size: [0.86, 1.14],
    face: 'front',
    ring: { step: 0.34, touch: 0.31, band: 0.28 },
    pile: [0.14, 5, 0],
    scat: [0.155, 6],
  },
  // mini abóboras (3 cm)
  aboboras: {
    vars: [{ r: 0.155, h: 0.24, sph: [[0, 0.1, 0, 0.155], [0.01, 0.215, 0, 0.045]] }],
    size: [0.82, 1.12],
    ring: { step: 0.38, touch: 0.35, band: 0.32 },
    pile: [0.16, 5, 0],
    scat: [0.17, 6],
  },
  // morcegos de papel preto (5,7 cm de envergadura): no palito (0) e colados na lateral pelo corpo (1)
  morcegos: {
    vars: [
      { r: 0.29, h: 0.26, stickOnly: true, sph: par([[0, 0.085, 0.02, 0.09], [0, 0.2, 0.02, 0.068], [0.1, 0.16, 0.03, 0.085], [0.13, 0.09, 0.035, 0.07], [0.19, 0.17, 0.05, 0.085], [0.245, 0.14, 0.062, 0.08]]) },
      { r: 0.29, h: 0.26, sideOnly: true, sph: par([[0, -0.027, 0.01, 0.09], [0, 0.088, 0.01, 0.068], [0.1, 0.048, 0.024, 0.085], [0.13, -0.022, 0.035, 0.07], [0.19, 0.058, 0.056, 0.085], [0.245, 0.028, 0.076, 0.08]]) },
    ],
    size: [0.8, 1.1],
    stick: { n: [2, 3, 5], h: [0.52, 0.26, 0.7, 0.9, 0.22], max: 1.1, gap: 0.6, lean: 0.06, fan: 0.3, tilt: 0.22, r: 0.011, into: 0.1 },
    scatSide: { per: 1, lo: 0.3, hi: 0.72 },
    side: { v: 1, mode: 'face', depth: 0.002, roll: 0.9 },
  },
};
