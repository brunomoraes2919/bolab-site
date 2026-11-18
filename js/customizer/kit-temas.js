// BOLAB — especificações das peças do grupo "temas" (ver kit.js). Só dados.
// (as peças coladas na frente da lateral — cílios, carinha — são dobradas na parede pelo construtor: as esferas
// ficam a meio caminho entre a parede reta e a curva de um bolo redondo, com raio para cobrir as duas)
// crina: uma esfera por peça, com o centro bem acima do pé — o cordão da roseta é roliço, e uma esfera rente ao
// apoio entraria fundo no bolo (na lateral, encostaria por dentro no bico da borda do topo)
const mane = { rosette: { r: 0.198, h: 0.1, sph: [[0, 0.095, 0, 0.198]] }, star: { r: 0.13, h: 0.13, sph: [[0, 0.06, 0, 0.135]] }, kiss: { r: 0.106, h: 0.2, sph: [[0, 0.06, 0, 0.11], [0, 0.155, 0, 0.05]] } };
/** Estrela-do-mar: miolo e duas esferas por braço (off = giro dos braços daquela variante). */
function starfish(off) {
  const sph = [[0, 0.02, 0, 0.075]];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + off;
    sph.push([Math.cos(a) * 0.085, 0.02, Math.sin(a) * 0.085, 0.06], [Math.cos(a) * 0.155, 0.015, Math.sin(a) * 0.155, 0.052]);
  }
  return sph;
}
/** n esferas em roda do eixo y: a rho dele, na altura y (a primeira em phase, medido a partir da frente). */
function around(n, rho, y, r, phase = 0) {
  return Array.from({ length: n }, (_, i) => [Math.sin(phase + (i / n) * Math.PI * 2) * rho, y, Math.cos(phase + (i / n) * Math.PI * 2) * rho, r]);
}

/** Esferas ao longo do anel do planeta (raio R no plano do anel, inclinado como a malha: 0,42 em x e 0,3 em z). */
function ringSph(R, n, r) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const x = R * Math.sin(a);
    const y = -R * Math.cos(a) * Math.sin(0.42);
    return [x * Math.cos(0.3) - y * Math.sin(0.3), 0.175 + x * Math.sin(0.3) + y * Math.cos(0.3), R * Math.cos(a) * Math.cos(0.42), r];
  });
}
/** Pontos [[x, y, z]] girados de pose.yaw em y e levados a (pose.x, pose.y, pose.z) → esferas de raio r (como a malha é posta). */
function posed(pts, pose, r) {
  const c = Math.cos(pose.yaw);
  const s = Math.sin(pose.yaw);
  return pts.map(([x, y, z]) => [x * c + z * s + pose.x, y + (pose.y || 0), -x * s + z * c + pose.z, r]);
}
/** Grade 4 × 4 de pontos no plano y (± a e ± b em x e em z): cobre uma chapa quadrada. */
function grid4(a, b, y) {
  const v = [-b, -a, a, b];
  return v.flatMap((x) => v.map((z) => [x, y, z]));
}
// capelo e canudo: as mesmas poses de pecas-temas.js (CAP e o canudo)
const CAP = { x: -0.11, z: -0.07, yaw: -0.45 };
const SCROLL = { x: 0.2, y: 0.056, z: 0.2, yaw: 0.5 };
// alianças: as medidas de RINGS em pecas-temas.js
const RING = { R: 0.18, tilt: (40 * Math.PI) / 180, x: -0.048, yaw: 0.5 };
/** Esferas ao longo de um aro: centro c, raio R, no plano dos eixos unitários u e v; tudo girado de yaw em y. */
function hoop(c, u, v, R, n, r, yaw = 0) {
  return posed(
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return [0, 1, 2].map((k) => c[k] + R * (Math.cos(a) * u[k] + Math.sin(a) * v[k]));
    }),
    { x: 0, z: 0, yaw },
    r,
  );
}
// cubo de 3 cm: oito esferas (uma por canto)
const cube = { r: 0.2, h: 0.3, sph: [-0.075, 0.075].flatMap((x) => [0.075, 0.225].flatMap((y) => [-0.075, 0.075].map((z) => [x, y, z, 0.135]))) };

export default {
  /* ── unicórnio ── */
  chifre: {
    vars: [
      {
        r: 0.4,
        depth: 0.15,
        h: 0.92,
        sph: [
          [0, 0.03, 0, 0.14], [0, 0.1, 0, 0.145], [0, 0.3, 0, 0.12], [0, 0.48, 0, 0.095], [0, 0.63, 0, 0.075], [0, 0.76, 0, 0.055], [0, 0.865, 0, 0.045],
          // orelhas
          [-0.17, 0.05, 0, 0.09], [0.17, 0.05, 0, 0.09], [-0.245, 0.11, 0, 0.128], [0.245, 0.11, 0, 0.128], [-0.275, 0.22, 0, 0.128], [0.275, 0.22, 0, 0.128], [-0.31, 0.34, 0, 0.095], [0.31, 0.34, 0, 0.095], [-0.335, 0.42, 0, 0.055], [0.335, 0.42, 0, 0.055],
        ],
      },
    ],
    hero: { s: [0.7, 1] },
    grow: 0.35,
    face: 'front',
  },
  cilios: {
    vars: [{ r: 0.7, h: 0.22, sph: [[-0.25, -0.03, -0.025, 0.1], [0.25, -0.03, -0.025, 0.1], [-0.42, -0.06, -0.045, 0.1], [0.42, -0.06, -0.045, 0.1], [-0.58, -0.08, -0.085, 0.13], [0.58, -0.08, -0.085, 0.13], [-0.66, -0.05, -0.2, 0.105], [0.66, -0.05, -0.2, 0.105], [-0.69, -0.05, -0.02, 0.105], [0.69, -0.05, -0.02, 0.105]] }],
    front: { s: [0.55, 1], y: 0.4, pair: true }, // (pair: dois olhos — na flor, um em cada pétala)
    side: { mode: 'face', depth: 0.003 },
    grow: 0.7,
  },
  crina: {
    vars: [mane.rosette, mane.star, mane.rosette, mane.kiss],
    alt: true,
    size: [0.9, 1.08],
    ring: { step: 0.3, touch: 0.29, band: 0.41, out: 0.215 },
    casc: [0.14, 9],
    side: { depth: 0, roll: Math.PI * 2 },
  },

  /* ── ursinho e coelho ── */
  orelhasurso: {
    vars: [{ r: 0.76, depth: 0.55, h: 0.45, sph: [[-0.5, 0.19, 0, 0.26], [0.5, 0.19, 0, 0.26]] }],
    hero: { s: [0.6, 1] },
    grow: 0.8,
    face: 'front',
  },
  carinhaurso: {
    vars: [{ r: 0.4, h: 0.5, sph: [[0, -0.045, 0.01, 0.2], [-0.14, -0.045, 0, 0.17], [0.14, -0.045, 0, 0.17], [-0.335, 0.17, -0.03, 0.085], [0.335, 0.17, -0.03, 0.085]] }],
    front: { s: [0.6, 1], y: 0.46 },
    side: { mode: 'face', depth: 0.003 },
    grow: 0.7,
  },
  orelhascoelho: {
    vars: [
      {
        r: 0.36,
        depth: 0.1,
        h: 1.0,
        sph: [
          // a reta (esquerda), de baixo para cima
          [-0.183, 0.09, 0, 0.11], [-0.197, 0.2, 0, 0.14], [-0.205, 0.29, 0.01, 0.158], [-0.214, 0.39, 0.01, 0.158], [-0.226, 0.49, -0.005, 0.15], [-0.238, 0.6, -0.012, 0.135], [-0.247, 0.7, -0.022, 0.115], [-0.255, 0.79, -0.033, 0.09], [-0.262, 0.87, -0.045, 0.065], [-0.267, 0.935, -0.055, 0.04],
          // a dobrada (direita): sobe, vira para a frente e a ponta cai
          [0.19, 0.09, 0, 0.11], [0.21, 0.2, 0, 0.14], [0.226, 0.29, 0.01, 0.158], [0.24, 0.39, 0.01, 0.158], [0.26, 0.48, 0.005, 0.15], [0.285, 0.57, 0.03, 0.14], [0.32, 0.615, 0.09, 0.12], [0.355, 0.6, 0.17, 0.095], [0.385, 0.55, 0.25, 0.065], [0.405, 0.51, 0.31, 0.04],
        ],
      },
    ],
    hero: { s: [0.6, 1] },
    grow: 0.5,
    face: 'front',
  },

  /* ── fundo do mar ── */
  sereia: {
    vars: [
      {
        r: 0.3,
        depth: 0.2,
        h: 1.08,
        sph: [
          [-0.1, 0.05, 0, 0.18], [-0.139, 0.16, 0, 0.16], [-0.157, 0.3, 0, 0.135], [-0.145, 0.44, 0, 0.11], [-0.125, 0.51, 0, 0.1], [-0.105, 0.58, 0, 0.085], [-0.045, 0.7, 0, 0.06],
          // nadadeira (alta e fina: pode passar um pouco da beira)
          [-0.015, 0.765, 0.01, 0.08, 'air'], [-0.07, 0.87, 0.02, 0.09, 'air'], [-0.13, 0.985, 0.03, 0.095, 'air'], [-0.215, 1.05, 0.05, 0.055, 'air'], [0.09, 0.82, 0.02, 0.09, 'air'], [0.16, 0.785, 0.02, 0.07, 'air'], [0.22, 0.84, 0.03, 0.08, 'air'], [0.325, 0.82, 0.05, 0.055, 'air'],
        ],
      },
    ],
    hero: { s: [0.7, 1] },
    grow: 0.4,
    face: 'front',
  },
  estrelasdomar: {
    vars: [{ r: 0.2, h: 0.07, sph: starfish(0) }, { r: 0.2, h: 0.07, sph: starfish(0.3) }],
    size: [0.8, 1.12],
    ring: { step: 0.42, touch: 0.39, band: 0.46, out: 0.24 },
    scat: [0.23, 5],
    scatSide: { per: 0.42, lo: 0.2, hi: 0.84 },
    side: { depth: 0 },
  },

  /* ── espaço ── */
  planetas: {
    vars: [
      { r: 0.31, h: 0.36, sph: [[0, 0.175, 0, 0.18], ...ringSph(0.2575, 20, 0.062)] },
      { r: 0.2, h: 0.38, sph: [[0, 0.19, 0, 0.195]] },
      { r: 0.17, h: 0.33, sph: [[0, 0.165, 0, 0.172]] },
    ],
    alt: true,
    size: [0.92, 1.08],
    // no máximo três (um de cada), numa fileira só: as peças da mesma decoração não são conferidas entre si, e
    // com mais planetas, em duas fileiras, o anel de um atravessaria o vizinho
    stick: { n: [2, 3, 3], h: [0.42, 0.26, 0.52, 0.32], gap: 0.52, into: 0.03 },
  },
  foguete: {
    vars: [
      {
        r: 0.32,
        h: 1.0,
        sph: [[0, 0.1, 0, 0.17], ...around(6, 0.2, 0.09, 0.125), ...around(3, 0.2, 0.27, 0.09, Math.PI / 3), ...around(3, 0.175, 0.39, 0.1, Math.PI / 3), [0, 0.3, 0, 0.165], [0, 0.4, 0, 0.172], [0, 0.5, 0, 0.172], [0, 0.6, 0, 0.17], [0, 0.575, 0.115, 0.09], [0, 0.7, 0, 0.15], [0, 0.79, 0, 0.118], [0, 0.88, 0, 0.082], [0, 0.955, 0, 0.05]],
      },
    ],
    hero: { s: [0.7, 1] },
    grow: 0.35,
    face: 'front',
  },

  /* ── futebol ── */
  bola: {
    vars: [{ r: 0.34, h: 0.66, sph: [[0, 0.326, 0, 0.335]] }],
    hero: { s: [0.75, 1] },
    grow: 0.3,
    face: 'front',
  },

  /* ── formatura, bebê, batizado e casamento ── */
  capelo: {
    vars: [
      {
        r: 0.52,
        h: 0.26,
        sph: [
          // copa e tampo (grade 4 × 4) do capelo, o cordão com a borla e o canudo com o laço
          posed([[0, 0.045, 0], [0, 0.1, 0]], CAP, 0.2),
          posed(grid4(0.08, 0.24, 0.19), CAP, 0.115),
          posed([[0.017, 0.17, 0.33], [0.017, 0.08, 0.33]], CAP, 0.055),
          posed([[-0.21, 0, 0], [-0.105, 0, 0], [0, 0, 0], [0.105, 0, 0], [0.21, 0, 0], [0, 0.05, 0.06]], SCROLL, 0.078),
          posed([[-0.06, -0.015, 0.115], [0.06, -0.015, 0.115], [-0.08, 0.065, 0.035], [0.08, 0.065, 0.035]], SCROLL, 0.07),
        ].flat(),
      },
    ],
    hero: { s: [0.6, 1] },
    grow: 0.3,
    face: 'front',
  },
  cubos: {
    vars: [cube, cube, cube],
    alt: true,
    size: [0.97, 1.03],
    pile: [0.2, 4, 0.3],
    ring: { step: 0.45, touch: 0.43, band: 0.5, out: 0.26 },
    minS: 0.8,
  },
  cruz: {
    vars: [
      {
        r: 0.27,
        depth: 0.07,
        h: 1.0,
        sph: [[0, 0.06, 0, 0.035], [0, 0.14, 0, 0.035], [0, 0.265, 0, 0.115], [0, 0.38, 0, 0.095], [0, 0.5, 0, 0.09], [0, 0.62, 0, 0.09], [0, 0.75, 0, 0.1], [0, 0.86, 0, 0.095], [0, 0.955, 0, 0.115], [-0.12, 0.75, 0, 0.095], [0.12, 0.75, 0, 0.095], [-0.21, 0.75, 0, 0.118], [0.21, 0.75, 0, 0.118]],
      },
    ],
    hero: { s: [0.75, 1] },
    grow: 0.35,
    face: 'front',
  },
  aliancas: {
    vars: [{ r: 0.31, h: 0.28, sph: [...hoop([RING.x, 0.0325, 0], [1, 0, 0], [0, 0, 1], RING.R, 12, 0.064, RING.yaw), ...hoop([RING.x + RING.R * Math.cos(RING.tilt), 0.0245 + RING.R * Math.sin(RING.tilt), 0], [Math.cos(RING.tilt), Math.sin(RING.tilt), 0], [0, 0, 1], RING.R, 12, 0.064, RING.yaw)] }],
    hero: { s: [0.8, 1] },
    grow: 0.3,
    face: 'front',
  },
};
