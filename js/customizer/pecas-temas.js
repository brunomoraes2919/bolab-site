// BOLAB — peças do grupo "temas" (módulo carregado sob demanda; ver kit.js).
// Unicórnio, ursinho, coelho, fundo do mar, espaço, futebol, formatura, bebê, casamento e batizado: tudo o que
// uma confeitaria modela em pasta de açúcar / pasta de goma (fosca), pinta com pó metálico ou confeita com bico.
// Sempre genérico: nenhum personagem, nenhuma marca.
import { THREE, drawKit, surface, lathe, smooth, gomo, tube, piece, mergeGeometries, makeCanvas, texture, cutout, roundedRectShape, fondant, glitter, cream, stickMat, shown, mix, shift } from './pecas-base.js';
import { pathAt } from './geometry.js';
import { bowGeometry } from './decor2.js';

const TAU = Math.PI * 2;
const INK = '#1f1b1d'; // pasta preta (nunca preto puro: some no brilho)

/* ───────── Ajudantes de modelagem ───────── */

/**
 * Almofadinha: contorno fechado out(v, o) no plano XY (v = 0…1 dá a volta; o = [x, y]), com espessura em z.
 * round = 0,3 → chapa grossa de cantos macios · 0,55 → almofada bem abaulada. A frente fica em +z.
 */
function pillow(nu, nv, out, depth, { cx = 0, cy = 0, round = 0.5, tone = null } = {}) {
  const o = [0, 0];
  return surface(nu, nv, (u, v, p) => {
    out(v, o);
    const s = Math.pow(Math.sin(Math.PI * u), round);
    p.set(cx + (o[0] - cx) * s, cy + (o[1] - cy) * s, (-Math.cos(Math.PI * u) * depth) / 2);
    return tone ? tone(u, v) : 0.84 + 0.16 * Math.sin(Math.PI * u * 0.5);
  }, { wrapV: true, shade: true, orient: true });
}

/** Contorno de orelha / folha: base redonda, mais larga a `fat` da altura, ponta fina em cima. */
const leafOutline = (W, H, fat = 0.65, tip = 0.9) => (v, o) => {
  const t = v * TAU;
  const yn = (1 - Math.cos(t)) / 2;
  const w = W * Math.pow(Math.sin(Math.PI * Math.pow(yn, fat)), tip);
  o[0] = Math.sin(t) >= 0 ? w : -w;
  o[1] = H * yn;
};

/**
 * Folha comprida (orelha de coelho) feita em fileiras ao longo da altura — dobra bem, ao contrário da almofadinha
 * em leque. Seção em lente de cantos macios; meia largura W · perfil(y); base em y0, frente em +z.
 */
function blade(nu, nv, W, H, thick, { fat = 0.8, tip = 0.75, z = 0, y0 = 0 } = {}) {
  return surface(nu, nv, (u, v, p) => {
    const w = u <= 0 || u >= 1 ? 0 : W * Math.pow(Math.sin(Math.PI * Math.pow(u, fat)), tip);
    const a = v * TAU;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const t = (thick / 2) * Math.min(1, w / (thick * 0.9));
    p.set(w * Math.sign(c) * Math.pow(Math.abs(c), 0.75), y0 + H * u, z + t * Math.sign(s) * Math.pow(Math.abs(s), 0.75));
    return 0.86 + 0.14 * Math.max(0, s);
  }, { wrapV: true, shade: true, orient: true });
}

/** Aplica uma função a cada vértice (x, y, z) → p e refaz as normais. */
function warp(geo, fn) {
  const pos = geo.attributes.position;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    fn(p);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Dobra a peça para a frente (+z) em torno de um eixo horizontal, sem esticar: ang(y) = ângulo acumulado na
 * altura y (0 = em pé). A linha do meio é integrada em passos; a espessura acompanha a curva.
 */
function bendForward(geo, H, ang) {
  const N = 64;
  const cy = [0];
  const cz = [0];
  for (let i = 1; i <= N; i++) {
    const th = ang(((i - 0.5) / N) * H);
    cy.push(cy[i - 1] + (H / N) * Math.cos(th));
    cz.push(cz[i - 1] + (H / N) * Math.sin(th));
  }
  return warp(geo, (p) => {
    const yy = Math.max(0, Math.min(H, p.y));
    const f = (yy / H) * N;
    const i = Math.min(N - 1, Math.floor(f));
    const t = f - i;
    const th = ang(yy);
    p.set(p.x, cy[i] + (cy[i + 1] - cy[i]) * t + (p.y - yy) - p.z * Math.sin(th), cz[i] + (cz[i + 1] - cz[i]) * t + p.z * Math.cos(th));
  });
}

/**
 * UV para o granulado do pó metálico (material `glitter`): projeção pelo lado dominante de cada triângulo.
 * Só para geometria já fundida (sem índice); k = repetições por unidade.
 */
function grainUV(geo, k = 4) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.subVectors(b, a).cross(c.sub(a));
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    for (let j = 0; j < 3; j++) {
      const x = pos.getX(i + j);
      const y = pos.getY(i + j);
      const z = pos.getZ(i + j);
      uv[(i + j) * 2] = (ay >= ax && ay >= az ? x : ax >= az ? z : x) * k;
      uv[(i + j) * 2 + 1] = (ay >= ax && ay >= az ? z : y) * k;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/**
 * Dobra um decalque de frente (side.mode 'face') para ele acompanhar a parede do andar onde foi colado:
 * o x da peça passa a correr ao longo do contorno do bolo e o z a sair dele. p = peça do plano (x, z, ox, oz, s).
 * Num bolo quadrado (parede reta) nada muda; no redondo, os olhos e o focinho abraçam a curva.
 */
function wrapOnWall(geo, path, p) {
  const q = {};
  let s0 = 0;
  let best = Infinity;
  for (let i = 0; i < 720; i++) {
    const s = (i / 720) * path.length;
    pathAt(path, s, q);
    const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
    if (d < best) {
      best = d;
      s0 = s;
    }
  }
  pathAt(path, s0, q);
  s0 += (p.x - q.x) * q.tx + (p.z - q.z) * q.tz;
  pathAt(path, s0, q);
  const off = (p.x - q.x) * q.nx + (p.z - q.z) * q.nz; // afastamento da parede
  const Xx = p.oz; // +x da peça no mundo (direita de quem olha)
  const Xz = -p.ox;
  const dir = q.tx * Xx + q.tz * Xz >= 0 ? 1 : -1;
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    pathAt(path, s0 + dir * pos.getX(i) * p.s, q);
    const d = off + pos.getZ(i) * p.s;
    const wx = q.x + q.nx * d - p.x;
    const wz = q.z + q.nz * d - p.z;
    pos.setXYZ(i, (wx * Xx + wz * Xz) / p.s, pos.getY(i), (wx * p.ox + wz * p.oz) / p.s);
    const nlx = nor.getX(i);
    const nlz = nor.getZ(i);
    const nwx = nlx * q.nz + nlz * q.nx;
    const nwz = -nlx * q.nx + nlz * q.nz;
    nor.setXYZ(i, nwx * Xx + nwz * Xz, nor.getY(i), nwx * p.ox + nwz * p.oz);
  }
  pos.needsUpdate = true;
  nor.needsUpdate = true;
  return geo;
}

/** Construtor de um decalque de frente que abraça a parede (uma malha por formato / tamanho de bolo). */
const wallDecal = (id, key, make, mat) => (ctx, part) => {
  const p = ctx.layout.plan?.[id]?.pieces?.find((q) => q.t === 'k' && q.pose === 'side' && q.face);
  const tier = ctx.m.stack ? ctx.m.stack[ctx.m.stack.length - 1] : ctx.m;
  const path = tier?.frost;
  if (!p || !path) return drawKit(ctx, part, id, [{ key, make, mat, cast: false }]);
  const s = Math.round(p.s * 100) / 100;
  const at = { x: p.x, z: p.z, ox: p.ox, oz: p.oz, s };
  return drawKit(ctx, part, id, [{ key: `${key}~${tier.shape}~${Math.round(path.length * 400)}~${Math.round(s * 100)}`, make: (D) => wrapOnWall(make(D), path, at), mat, cast: false }]);
};

/* ───────── Unicórnio ───────── */

const GOLD = '#dcae52';

/**
 * Chifre: dois cordões de pasta de goma afinados e torcidos um no outro (é assim que se faz), pintados com pó
 * dourado. A malha gira junto com a torção: crista e vale caem sempre num vértice, o sulco sai limpo.
 */
function hornGeometry(D) {
  const lowp = D < 1;
  const H = 0.9;
  const R0 = 0.13;
  const strands = 2;
  const turns = 4.4;
  const per = lowp ? 5 : 9; // colunas por cordão
  const horn = surface(lowp ? 24 : 46, strands * per, (u, v, p) => {
    const t = 1 - Math.pow(1 - u, 1.55); // as voltas apertam perto da ponta
    const a0 = v * TAU;
    const a = a0 + (turns * TAU * u) / strands;
    const k = gomo(a0, strands, 0.62);
    const body = R0 * Math.pow(1 - t, 0.88) + 0.005 * (1 - t);
    const rad = u > 0.999 ? 0 : body * (1 - 0.3 * (1 - k)) * (1 + 0.05 * smooth(0.12, 0, u));
    p.set(rad * Math.sin(a), H * t - 0.012, rad * Math.cos(a));
    return (0.5 + 0.5 * k) * (0.82 + 0.18 * smooth(0, 0.12, u));
  }, { wrapV: true, shade: true, orient: true });
  return grainUV(mergeGeometries([piece(horn, shown(GOLD))]), 17);
}

/** Orelhas: folha branca de pasta de goma levemente em concha, com o miolo rosa aplicado por cima. */
function unicornEarsGeometry(D) {
  const lowp = D < 1;
  const parts = [];
  [-1, 1].forEach((sx) => {
    const outer = pillow(lowp ? 5 : 8, lowp ? 16 : 30, leafOutline(0.122, 0.46), 0.05, { cy: 0.17, round: 0.4 });
    const inner = pillow(lowp ? 3 : 5, lowp ? 14 : 24, leafOutline(0.07, 0.3), 0.018, { cy: 0.11, round: 0.5 }).translate(0, 0.07, 0.026);
    const cup = (p) => {
      p.z += 2.6 * p.x * p.x - 0.1 * p.y * p.y; // concha, e a ponta cai um tico para trás
    };
    const ear = mergeGeometries([piece(warp(outer, cup), '#fbf8f4'), piece(warp(inner, cup), '#f3aebf')]);
    ear.rotateY(sx * 0.32).rotateZ(-sx * 0.3).translate(sx * 0.185, -0.025, -0.015);
    parts.push(ear);
  });
  return mergeGeometries(parts);
}

/** Cílios: pálpebra fechada (arco) e quatro cílios que abrem para fora, em cordãozinho de pasta preta. */
function lashesGeometry(D) {
  const lowp = D < 1;
  const parts = [];
  [-1, 1].forEach((sx) => {
    const cx = sx * 0.4;
    const half = 0.2;
    const lidAt = (t, P) => P.set(cx + sx * t * half, 0.03 - 0.088 * (1 - t * t), 0);
    parts.push(tube(lowp ? 10 : 20, lowp ? 5 : 8, (u, P) => lidAt(u * 2 - 1, P), (u) => 0.008 + 0.016 * Math.pow(Math.sin(Math.PI * u), 0.7)));
    const P0 = new THREE.Vector3();
    [-0.2, 0.18, 0.54, 0.86].forEach((t, i) => {
      lidAt(t, P0);
      const x0 = P0.x;
      const y0 = P0.y;
      const a0 = -Math.PI / 2 + sx * (0.12 + 0.3 * i);
      const L = 0.1 + 0.014 * i;
      parts.push(
        tube(lowp ? 4 : 7, lowp ? 4 : 6, (u, P) => {
          const a = a0 + sx * 0.55 * u; // curva para fora
          P.set(x0 + Math.cos(a) * L * u, y0 + Math.sin(a) * L * u, 0);
        }, (u) => 0.0145 * (1 - 0.72 * u)),
      );
    });
  });
  const geo = mergeGeometries(parts.map((g) => piece(g, INK)));
  return geo.scale(1, 1, 0.55).translate(0, 0, 0.004);
}

/* ───────── Ursinho e coelho ───────── */

/** Contorno redondo com a base cortada reta (a peça fica em pé sobre o corte): raio R, centro em y = cy. */
const coinOutline = (R, cy) => (v, o) => {
  const t = v * TAU;
  o[0] = R * Math.sin(t);
  o[1] = Math.max(0, cy - R * Math.cos(t));
};

/** Orelhas de ursinho: discos gordos de pasta, de pé. part = 'out' (a orelha) | 'in' (o miolo claro aplicado na frente). */
function bearEarsGeometry(D, part) {
  const lowp = D < 1;
  const parts = [];
  [-1, 1].forEach((sx) => {
    const g =
      part === 'out'
        ? pillow(lowp ? 6 : 10, lowp ? 22 : 32, coinOutline(0.25, 0.2), 0.13, { cy: 0.2, round: 0.42, tone: (u) => 0.8 + 0.2 * Math.sin(Math.PI * Math.min(1, u * 1.15) * 0.5) })
        : pillow(lowp ? 4 : 6, lowp ? 18 : 26, coinOutline(0.155, 0.155), 0.03, { cy: 0.14, round: 0.6, tone: (u) => 0.9 + 0.1 * u }).translate(0, 0.035, 0.058);
    g.rotateY(sx * 0.16).rotateZ(-sx * 0.1).translate(sx * 0.5, -0.012, 0);
    parts.push(piece(g));
  });
  return mergeGeometries(parts);
}

const MUZZLE = { W: 0.27, H: 0.2, depth: 0.15, y: -0.045 };
/** Altura do focinho (z) acima do ponto (x, y) do decalque. */
const muzzleZ = (x, y) => (MUZZLE.depth / 2) * Math.sqrt(Math.max(0, 1 - Math.pow((x / MUZZLE.W) ** 2 + ((y - MUZZLE.y) / MUZZLE.H) ** 2, 2)));

/** Carinha: focinho oval abaulado, nariz, boca em cordãozinho e dois olhinhos de pasta preta com um ponto de luz. */
function bearFaceGeometry(D) {
  const lowp = D < 1;
  const { W, H, depth, y: my } = MUZZLE;
  const oval = (a, b, cy) => (v, o) => {
    const t = v * TAU;
    o[0] = a * Math.sin(t);
    o[1] = cy - b * Math.cos(t);
  };
  const muzzle = pillow(lowp ? 8 : 14, lowp ? 26 : 36, oval(W, H, my), depth, { cy: my, round: 0.5, tone: (u) => 0.82 + 0.18 * smooth(0.5, 0.95, u) });
  // nariz: triângulo de cantos bem redondos, mais largo em cima
  const ny = my + 0.085;
  const nose = pillow(lowp ? 5 : 8, lowp ? 14 : 24, (v, o) => {
    const t = v * TAU;
    const low = (1 + Math.cos(t)) / 2; // 1 embaixo, 0 em cima
    o[0] = 0.08 * Math.sin(t) * (1 - 0.3 * low);
    o[1] = ny - 0.052 * Math.cos(t);
  }, 0.07, { cy: ny, round: 0.55 }).translate(0, 0, muzzleZ(0, ny) - 0.006);
  // boca: um risco que desce do nariz e abre em dois arcos
  const mouth = [];
  const lift = 0.004;
  mouth.push(tube(lowp ? 3 : 5, lowp ? 4 : 6, (u, P) => {
    const y = ny - 0.05 - 0.062 * u;
    P.set(0, y, muzzleZ(0, y) + lift);
  }, 0.0075));
  [-1, 1].forEach((sx) => {
    mouth.push(tube(lowp ? 6 : 12, lowp ? 4 : 6, (u, P) => {
      const th = u * Math.PI * 0.8; // do meio, por baixo, para o lado (um "u" de cada lado)
      const x = sx * 0.06 * (1 - Math.cos(th));
      const y = ny - 0.112 - 0.04 * Math.sin(th);
      P.set(x, y, muzzleZ(x, y) + lift);
    }, (u) => 0.0075 * (1 - 0.45 * smooth(0.7, 1, u))));
  });
  const eyes = [];
  [-1, 1].forEach((sx) => {
    const e = new THREE.SphereGeometry(0.047, lowp ? 10 : 16, lowp ? 6 : 10).scale(1, 1.08, 0.62).translate(sx * 0.335, 0.17, 0.004);
    eyes.push(piece(e, INK));
    const glint = new THREE.SphereGeometry(0.0125, lowp ? 6 : 8, lowp ? 4 : 6).scale(1, 1, 0.5).translate(sx * 0.335 - 0.014, 0.19, 0.03);
    eyes.push(piece(glint, '#ffffff'));
  });
  return mergeGeometries([piece(muzzle, '#f7e9d2'), piece(nose, '#3a2318'), ...mouth.map((g) => piece(g, '#3a2318')), ...eyes]);
}

/** Orelhas de coelho: duas folhas compridas de pasta de goma, miolo rosado; a da direita dobra a ponta para a frente. */
function bunnyEarsGeometry(D) {
  const lowp = D < 1;
  const parts = [];
  [-1, 1].forEach((sx) => {
    // (8 colunas no celular: com menos, a frente da folha fica reta e engole o miolo rosa)
    const outer = blade(lowp ? 16 : 30, lowp ? 8 : 10, 0.145, 1.0, 0.05);
    const inner = blade(lowp ? 12 : 24, lowp ? 8 : 10, 0.082, 0.76, 0.02, { z: 0.024, y0: 0.11 });
    const folded = sx > 0;
    // a da direita dobra a ponta para a frente; a outra só arqueia um tico para trás
    const ang = folded ? (y) => 2.05 * smooth(0.5, 0.84, y) : (y) => -0.16 * smooth(0.25, 1, y);
    const shape = (g) => {
      warp(g, (p) => {
        p.z += 1.9 * p.x * p.x * (folded ? 1 - 0.8 * smooth(0.4, 0.58, p.y) : 1); // em concha (a dobra achata a folha)
      });
      return bendForward(g, 1.0, ang);
    };
    const ear = mergeGeometries([piece(shape(outer), '#fbf8f4'), piece(shape(inner), '#f4b4c4')]);
    ear.rotateY(sx * (folded ? 0.42 : 0.2)).rotateZ(-sx * (folded ? 0.17 : 0.11)).translate(sx * 0.17, -0.03, 0);
    parts.push(ear);
  });
  return mergeGeometries(parts);
}

/** Cor por instância: a cor escolhida no painel, ajustada à luz do palco. */
const chosenTint = (p, i, r, color) => shown(color);
const earCoreTint = (p, i, r, color) => mix(shown(color), '#fff3df', 0.62);

/* ───────── Fundo do mar ───────── */

/**
 * Escamas marcadas na pasta: fileiras desencontradas de discos sobrepostos, com a beira solta virada para a
 * ponta da cauda (o alto da textura). kind = 'map' (cor: vinco suave) | 'bump' (relevo). 2 escamas por volta.
 */
function scalesCanvas(size, kind) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const d = size / 2;
  const bump = kind === 'bump';
  g.fillStyle = bump ? '#7a7a7a' : '#ffffff';
  g.fillRect(0, 0, size, size);
  // de cima para baixo: a fileira de baixo (mais perto do corpo) cobre a raiz da de cima
  for (let k = -3; k <= 7; k++) {
    const y = k * (d / 2);
    for (let i = -1; i <= 3; i++) {
      const x = i * d + (k % 2 ? d / 2 : 0);
      const grad = g.createLinearGradient(0, y - d * 0.52, 0, y + d * 0.1);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.5, bump ? '#b4b4b4' : '#f3f3f3');
      grad.addColorStop(1, bump ? '#5c5c5c' : '#dedede');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, d * 0.52, 0, TAU);
      g.fill();
      g.lineWidth = Math.max(1.5, size / 70);
      g.strokeStyle = bump ? 'rgba(20,20,20,0.75)' : 'rgba(40,40,60,0.3)';
      g.stroke();
    }
  }
  return c;
}

/** Pasta com pó perolado, com as escamas marcadas (cauda). */
const pearlScales = (lib) =>
  lib.custom('pt-pearlScales', () => {
    const S = lib.detail < 1 ? 128 : 256;
    const map = texture(scalesCanvas(S, 'map'), { srgb: true });
    const bump = texture(scalesCanvas(S, 'bump'));
    const mat = lib.physical({ color: 0xffffff, map, bumpMap: bump, bumpScale: 2.4, roughness: 0.34, clearcoat: 0.55, clearcoatRoughness: 0.28, iridescence: 0.5, iridescenceIOR: 1.3, sheen: 0.5, sheenRoughness: 0.4, sheenColor: 0xffffff, vertexColors: true });
    mat.addEventListener('dispose', () => {
      map.dispose();
      bump.dispose();
    });
    return mat;
  });
/** Pasta com pó perolado, lisa (nadadeira). */
const pearl = (lib) => lib.custom('pt-pearl', () => lib.physical({ color: 0xffffff, roughness: 0.34, clearcoat: 0.55, clearcoatRoughness: 0.28, iridescence: 0.5, iridescenceIOR: 1.3, sheen: 0.5, sheenRoughness: 0.4, sheenColor: 0xffffff, vertexColors: true }));

/** Como surface(), mas aberta em v (costura duplicada, com as normais emendadas) e com UV: fn(u, v, p, uv) → tom. */
function surfaceUV(nu, nv, fn) {
  const cols = nv + 1;
  const n = (nu + 1) * cols;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const uvs = new Float32Array(n * 2);
  const p = new THREE.Vector3();
  const uv = [0, 0];
  for (let i = 0, k = 0; i <= nu; i++) {
    for (let j = 0; j < cols; j++, k++) {
      const tone = fn(i / nu, j / nv, p, uv);
      pos.set([p.x, p.y, p.z], k * 3);
      col.fill(tone, k * 3, k * 3 + 3);
      uvs.set(uv, k * 2);
    }
  }
  const index = [];
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * cols + j;
      const b = a + cols;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const nor = geo.attributes.normal;
  for (let i = 0; i <= nu; i++) {
    const a = i * cols;
    const b = a + nv;
    p.set(nor.getX(a) + nor.getX(b), nor.getY(a) + nor.getY(b), nor.getZ(a) + nor.getZ(b)).normalize();
    nor.setXYZ(a, p.x, p.y, p.z);
    nor.setXYZ(b, p.x, p.y, p.z);
  }
  return geo;
}

const TAIL = { x0: -0.1, H: 0.74, lean: 0.4 };
/** Linha do meio da cauda (t = 0 no bolo, 1 no "tornozelo") e raio do corpo. */
const tailMid = (t, P) => P.set(TAIL.x0 - 0.07 * Math.sin(Math.PI * t) + 0.06 * t * t, TAIL.H * t - 0.015, 0);
const tailRad = (t) => 0.034 + 0.14 * Math.pow(1 - t, 0.75);

/** Corpo da cauda: sai do bolo largo, sobe num "s" suave e afina até o tornozelo. As escamas vêm da textura. */
function tailBodyGeometry(D) {
  const lowp = D < 1;
  const nu = lowp ? 14 : 30;
  const nv = lowp ? 12 : 24;
  const scalesAround = 10;
  const P = new THREE.Vector3();
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  // v da textura: comprimento acumulado medido em "larguras de escama" (elas encolhem junto com o corpo)
  const vAt = [0];
  for (let i = 1; i <= nu; i++) {
    tailMid((i - 1) / nu, A);
    tailMid(i / nu, B);
    vAt.push(vAt[i - 1] + A.distanceTo(B) / (((TAU * tailRad((i - 0.5) / nu)) / scalesAround) * 2));
  }
  return surfaceUV(nu, nv, (u, v, p, uv) => {
    tailMid(u, P);
    tailMid(Math.min(1, u + 0.01), A);
    tailMid(Math.max(0, u - 0.01), B);
    A.sub(B).normalize(); // tangente (no plano xy)
    const r = tailRad(u);
    const a = v * TAU + Math.PI * 1.5; // costura atrás
    p.set(P.x + A.y * r * Math.cos(a), P.y - A.x * r * Math.cos(a), r * 0.84 * Math.sin(a));
    uv[0] = (v * scalesAround) / 2;
    uv[1] = -vAt[Math.round(u * nu)]; // a beira solta de cada escama aponta para a nadadeira
    return 0.8 + 0.2 * smooth(0, 0.22, u);
  });
}

/**
 * Nadadeira bifurcada: dois lobos em folha que saem do tornozelo, com as nervuras em leque e as pontas viradas
 * para fora. Feita em volta do tornozelo (cada raio é uma nervura).
 */
function tailFinGeometry(D) {
  const lowp = D < 1;
  const th0 = 0.66; // abertura de cada lobo, a partir do eixo da cauda
  const ridge = lowp ? 24 : 34; // nervuras por radiano
  // mais colunas nos lobos, poucas no vão e junto ao tornozelo
  const stops = [-Math.PI, -(th0 + 0.62), -(th0 - 0.5), th0 - 0.5, th0 + 0.62, Math.PI];
  const share = [0, 0.07, 0.43, 0.57, 0.93, 1];
  const thOf = (v) => {
    let k = 0;
    while (k < 4 && v > share[k + 1]) k++;
    return stops[k] + ((v - share[k]) / (share[k + 1] - share[k])) * (stops[k + 1] - stops[k]);
  };
  const fin = surface(lowp ? 5 : 8, lowp ? 44 : 92, (u, v, p) => {
    const th = thOf(v);
    const d = Math.abs(th) - th0;
    const lobe = Math.exp(-Math.pow(Math.abs(d) / (d < 0 ? 0.43 : 0.47), 1.6));
    const R = 0.03 + 0.35 * lobe;
    const s = Math.pow(Math.sin(Math.PI * u), 0.32);
    const rho = R * s;
    const wave = Math.cos(th * ridge) * lobe;
    const curl = Math.sign(th) * 0.35 * (rho / 0.38) ** 2; // as pontas viram para fora
    p.set(rho * Math.sin(th + curl), rho * Math.cos(th + curl), -Math.cos(Math.PI * u) * (0.011 + 0.012 * (1 - lobe)) + 0.0045 * wave * (rho / 0.2));
    return (0.8 + 0.2 * (0.5 + 0.5 * wave)) * (0.86 + 0.14 * s);
  }, { wrapV: true, shade: true, orient: true });
  warp(fin, (p) => {
    p.z += 0.5 * p.x * p.x + 0.15 * p.y * p.y; // em concha, para a frente
  });
  const E = new THREE.Vector3();
  tailMid(1, E);
  return mergeGeometries([piece(fin.rotateZ(-TAIL.lean).translate(E.x + 0.012, E.y + 0.02, 0))]);
}

/** Bolinha aplicada (só a calota de cima aparece): poucas faces. */
const dot = (r, lowp) => (lowp ? new THREE.OctahedronGeometry(r, 0).scale(1, 0.6, 1) : new THREE.SphereGeometry(r, 6, 2, 0, TAU, 0, Math.PI / 2));

const CORAL_DOT = '#fff0df';
/** Cor de vértice que, multiplicada pela cor clara das bolinhas (a cor da instância), dá a cor do corpo. */
const under = (hex, tint = CORAL_DOT) => {
  const a = new THREE.Color(hex);
  const b = new THREE.Color(tint);
  return new THREE.Color(Math.min(1, a.r / b.r), Math.min(1, a.g / b.g), Math.min(1, a.b / b.b));
};

/**
 * Estrela-do-mar de pasta: cinco braços roliços que afinam, cada um com a sua curvinha, e a textura clássica de
 * confeitaria — uma fileira de bolinhas claras ao longo de cada braço. kind muda a pose dos braços.
 */
function starfishGeometry(D, kind) {
  const lowp = D < 1;
  const L = 0.185;
  const bends = kind ? [0.5, -0.35, 0.25, -0.5, 0.4] : [-0.3, 0.45, -0.45, 0.2, 0.35];
  const parts = [];
  const dots = [];
  const body = under('#ee8762');
  // achata um pouco (a estrela é baixa) e encosta no apoio
  const flat = (p) => {
    p.y = Math.max(0, p.y * 0.86);
  };
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + (kind ? 0.3 : 0);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const len = L * (kind ? [1, 0.92, 1.05, 0.95, 1][i] : [0.95, 1.04, 0.9, 1, 1.02][i]);
    const at = (u, P) => {
      const side = bends[i] * 0.06 * u * u;
      const fwd = len * u;
      P.set(ca * fwd - sa * side, 0.016 + 0.02 * (1 - u), sa * fwd + ca * side);
    };
    const w = (u) => 0.014 + 0.056 * Math.pow(1 - u, 0.75);
    const arm = tube(lowp ? 4 : 6, lowp ? 5 : 7, (u, P) => at(u * 0.985, P), (u) => (u > 0.999 ? 0.001 : w(u)), (u) => 0.78 + 0.22 * smooth(0, 0.5, u), new THREE.Vector3(0, 1, 0));
    parts.push(piece(warp(arm, flat), body));
    const P = new THREE.Vector3();
    const n = lowp ? 2 : 4;
    for (let k = 0; k < n; k++) {
      const u = 0.24 + (k / n) * 0.7;
      at(u, P);
      const r = 0.0145 * (1 - 0.45 * u);
      dots.push(dot(r, lowp).translate(P.x, (P.y + w(u) * 0.8) * 0.86, P.z));
    }
  }
  const hub = new THREE.SphereGeometry(0.072, lowp ? 8 : 10, lowp ? 3 : 4, 0, TAU, 0, Math.PI / 2).scale(1, 0.62, 1).translate(0, 0.012, 0);
  parts.push(piece(warp(hub, flat), body));
  dots.push(dot(0.016, lowp).translate(0, 0.047, 0));
  return mergeGeometries([...parts, ...dots.map((g) => piece(g))]);
}
const STARFISH_TINTS = [CORAL_DOT, '#ffe9c4', '#ffe0e2', '#fff0df'];

/* ───────── Espaço ───────── */

/**
 * Bola de pasta modelada à mão: icosfera (triângulos iguais em toda a volta) com o raio e a cor dados por
 * função da direção. rad(n) → raio · tint(n, cor) pinta o vértice. As normais saem do relevo.
 */
function ballOf(detail, rad, tint) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('uv');
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const n = new THREE.Vector3();
  const t1 = new THREE.Vector3();
  const t2 = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  const e = 0.03;
  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(pos, i).normalize();
    t1.set(-n.z, 0, n.x);
    if (t1.lengthSq() < 1e-6) t1.set(1, 0, 0);
    t1.normalize();
    t2.crossVectors(n, t1);
    p.copy(n).multiplyScalar(rad(n));
    a.copy(n).addScaledVector(t1, e).normalize();
    a.multiplyScalar(rad(a)).sub(p);
    b.copy(n).addScaledVector(t2, e).normalize();
    b.multiplyScalar(rad(b)).sub(p);
    a.cross(b).normalize();
    if (a.dot(n) < 0) a.negate();
    pos.setXYZ(i, p.x, p.y, p.z);
    nor.setXYZ(i, a.x, a.y, a.z);
    c.setRGB(1, 1, 1);
    tint(n, c);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Faixas marmorizadas: mistura macia entre as cores de `pal` conforme a altura ao longo do eixo `axis`. */
function banded(pal, axis, bands, wobble = 0.05) {
  const cs = pal.map((hex) => new THREE.Color(hex));
  return (n, c) => {
    const h = n.dot(axis);
    const az = Math.atan2(n.z, n.x);
    const f = (h * 0.5 + 0.5) * bands + wobble * bands * Math.sin(az * 3 + h * 7) + 0.3 * Math.sin(az * 2 - h * 4) * wobble * bands;
    const k = Math.floor(f);
    const t = smooth(0.25, 0.75, f - k);
    c.copy(cs[((k % cs.length) + cs.length) % cs.length]).lerp(cs[(((k + 1) % cs.length) + cs.length) % cs.length], t);
  };
}

const RING_TILT = [0.42, 0.3]; // o anel inclina a frente para baixo e sobe à direita (as esferas do kit usam o mesmo giro)

/** Planeta com anel: bola dourada de faixas suaves e um anel chato de pasta, inclinado. */
function ringedPlanetGeometry(D) {
  const lowp = D < 1;
  const R = 0.175;
  const axis = new THREE.Vector3(0, 1, 0);
  const body = ballOf(lowp ? 2 : 4, () => R, banded(['#f3bd55', '#f8d98c', '#eaa040', '#f6cf78'], axis, 5, 0.035));
  body.rotateX(RING_TILT[0]).rotateZ(RING_TILT[1]);
  // anel: fita chata de cantos macios (perfil em losango achatado)
  const prof = [[0.215, 0, 0.8], [0.26, 0.011, 1], [0.3, 0, 0.92], [0.26, -0.011, 0.72]];
  const ring = surface(lowp ? 18 : 36, 4, (u, v, p) => {
    const q = prof[Math.round(v * 4) % 4];
    const a = u * TAU;
    p.set(q[0] * Math.sin(a), q[1], q[0] * Math.cos(a));
    return q[2];
  }, { wrapV: true, shade: true, orient: true });
  ring.rotateX(RING_TILT[0]).rotateZ(RING_TILT[1]);
  return mergeGeometries([piece(body), piece(ring, '#c9b4f0')]).translate(0, R, 0);
}

/** Planeta listrado: faixas marmorizadas em tons de coral, com o eixo um pouco tombado. */
function stripedPlanetGeometry(D) {
  const R = 0.19;
  const axis = new THREE.Vector3(0.3, 0.94, 0.16).normalize();
  const body = ballOf(D < 1 ? 2 : 4, () => R, banded(['#e9764f', '#f7b993', '#d9573c', '#fad6ba', '#ee8d62'], axis, 6, 0.06));
  return mergeGeometries([piece(body)]).translate(0, R, 0);
}

const CRATERS = [
  [0.1, 0.25, 0.96, 0.44],
  [-0.62, 0.5, 0.6, 0.3],
  [0.66, -0.2, 0.72, 0.34],
  [-0.3, -0.6, 0.74, 0.3],
  [0.5, 0.78, 0.36, 0.26],
  [-0.85, -0.1, -0.5, 0.36],
  [0.4, 0.3, -0.86, 0.4],
  [-0.1, -0.95, -0.3, 0.3],
  [0.95, 0.2, -0.2, 0.28],
].map(([x, y, z, rho]) => ({ dir: new THREE.Vector3(x, y, z).normalize(), rho }));

/** Lua: bola clara com crateras marcadas (bolear a pasta afunda o meio e levanta a beira). */
function moonGeometry(D) {
  const R = 0.165;
  const dip = (n) => {
    let d = 0;
    let rim = 0;
    for (let i = 0; i < CRATERS.length; i++) {
      const k = Math.acos(Math.max(-1, Math.min(1, n.dot(CRATERS[i].dir)))) / CRATERS[i].rho;
      if (k > 1.5) continue;
      d = Math.max(d, 1 - smooth(0.45, 1, k));
      rim = Math.max(rim, Math.exp(-(((k - 1.02) / 0.16) ** 2)));
    }
    return [d, rim];
  };
  const body = ballOf(D < 1 ? 3 : 5, (n) => {
    const [d, rim] = dip(n);
    return R * (1 - 0.075 * d + 0.022 * rim * (1 - d));
  }, (n, c) => {
    const [d, rim] = dip(n);
    c.set('#e9e6df').multiplyScalar(1 - 0.2 * d + 0.03 * rim * (1 - d));
  });
  return mergeGeometries([piece(body)]).translate(0, R, 0);
}

const ROCKET = { y0: 0.16, H: 0.84, R: 0.155, cap: 0.7 };
/** Raio do foguete na altura y: um charuto bojudo que fecha em ogiva. */
const rocketRad = (y) => ROCKET.R * Math.pow(Math.sin(Math.PI * (0.18 + 0.82 * Math.max(0, Math.min(1, (y - ROCKET.y0) / ROCKET.H)))), 0.8);

/**
 * Foguete de brinquedo: corpo branco bojudo, ogiva e três aletas vermelhas (ele fica em pé nelas), janela redonda
 * e um colchão de fumaça branca na base. Genérico: nenhum emblema, nenhuma marca.
 */
function rocketGeometry(D) {
  const lowp = D < 1;
  const seg = lowp ? 14 : 24;
  const { y0, H, cap } = ROCKET;
  const yCap = y0 + H * cap;
  const rows = (ya, yb, n, k, tone) => {
    const prof = [];
    for (let i = 0; i <= n; i++) {
      const y = ya + ((yb - ya) * i) / n;
      prof.push([Math.max(0.001, rocketRad(y) * k), y, tone(i / n)]);
    }
    return prof;
  };
  const body = lathe([[0.06, y0 - 0.005, 0.7], ...rows(y0, yCap, lowp ? 6 : 11, 1, (t) => 0.86 + 0.14 * smooth(0, 0.25, t))], seg);
  const nose = lathe([[rocketRad(yCap) * 0.98, yCap - 0.004, 0.8], ...rows(yCap, y0 + H, lowp ? 4 : 7, 1.035, (t) => 0.9 + 0.1 * t)], seg);
  const nozzle = lathe([[0.001, 0.1, 0.5], [0.07, 0.085, 0.6], [0.104, 0.07, 0.75], [0.1, 0.1, 0.9], [0.072, y0 + 0.012, 0.8]], seg);
  const RED = '#b4231f';
  const parts = [piece(body, '#f6f3ee'), piece(nose, RED), piece(nozzle, '#667083')];
  // aletas: folhas grossas, presas no corpo e com a ponta apoiada no bolo
  [Math.PI / 3, -Math.PI / 3, Math.PI].forEach((phi) => {
    const fin = pillow(lowp ? 4 : 6, lowp ? 12 : 22, leafOutline(0.088, 0.52, 0.62, 0.85), 0.04, { cy: 0.19, round: 0.4 });
    fin.rotateZ(Math.PI + 0.43).translate(0.085, 0.49, 0).rotateY(phi - Math.PI / 2);
    parts.push(piece(fin, RED));
  });
  // janela: aro, vidro abaulado e um ponto de luz
  const wy = 0.575;
  const wz = rocketRad(wy);
  parts.push(piece(new THREE.TorusGeometry(0.064, 0.017, lowp ? 6 : 10, lowp ? 12 : 22).translate(0, wy, wz - 0.004), '#f2c33d'));
  parts.push(piece(new THREE.SphereGeometry(0.058, lowp ? 10 : 16, lowp ? 3 : 5, 0, TAU, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.3).translate(0, wy, wz - 0.006), '#9bd6f4'));
  parts.push(piece(new THREE.SphereGeometry(0.014, 6, 4).scale(1, 1.5, 0.4).rotateZ(0.6).translate(-0.02, wy + 0.02, wz + 0.01), '#ffffff'));
  // fumaça: bolas de pasta branca em volta do bocal
  [[0, 0.17, 0.1], [1.05, 0.2, 0.085], [2.1, 0.16, 0.105], [3.14, 0.2, 0.09], [4.2, 0.17, 0.1], [5.25, 0.2, 0.085], [0.5, 0.07, 0.085], [3.6, 0.06, 0.09]].forEach(([a, rho, r], i) => {
    const puff = new THREE.SphereGeometry(r, lowp ? 7 : 12, lowp ? 5 : 8).scale(1, 0.86, 1).translate(Math.sin(a) * rho, r * 0.62 + (i > 5 ? 0.05 : 0), Math.cos(a) * rho);
    const g = piece(puff, '#fdfcfa');
    parts.push(g);
  });
  return mergeGeometries(parts);
}

/** cutout() reconhece o contorno pronto por `isShape` (que o three r160 não define em THREE.Shape): marca aqui. */
const asShape = (s) => {
  s.isShape = true;
  return s;
};

/* ───────── Futebol ───────── */

/**
 * Um gomo da bola: polígono esférico feito em anéis a partir do meio. A beira afunda (a costura) e o miolo
 * estufa um tico; os vértices da beira são só deste gomo, então a costura sai vincada.
 */
function panelGeometry(pts, k, R) {
  const n = pts.length;
  const c = new THREE.Vector3();
  pts.forEach((p) => c.add(p));
  c.normalize();
  const pos = [];
  const col = [];
  const q = new THREE.Vector3();
  const put = (v, s) => {
    v.normalize().multiplyScalar(R * (1 - 0.024 * smooth(0.55, 1, s) + 0.005 * (1 - s * s)));
    pos.push(v.x, v.y, v.z);
    const tone = 0.66 + 0.34 * smooth(1, 0.6, s);
    col.push(tone, tone, tone);
  };
  put(q.copy(c), 0);
  for (let j = 1; j <= k; j++) {
    for (let m = 0; m < n; m++) {
      for (let i = 0; i < j; i++) {
        q.copy(pts[m]).lerp(pts[(m + 1) % n], i / j).sub(c).multiplyScalar(j / k).add(c);
        put(q, j / k);
      }
    }
  }
  const start = (j) => (j === 0 ? 0 : 1 + (n * j * (j - 1)) / 2);
  const idx = [];
  for (let j = 1; j <= k; j++) {
    const o0 = start(j);
    const i0 = start(j - 1);
    const no = n * j;
    const ni = Math.max(1, n * (j - 1));
    for (let m = 0; m < n; m++) {
      for (let i = 0; i < j; i++) {
        const a = j === 1 ? 0 : i0 + ((m * (j - 1) + i) % ni);
        const b = o0 + ((m * j + i) % no);
        const d = o0 + ((m * j + i + 1) % no);
        idx.push(a, b, d);
        if (i < j - 1) idx.push(a, d, i0 + ((m * (j - 1) + i + 1) % ni));
      }
    }
  }
  // faces para fora
  const A = new THREE.Vector3().fromArray(pos, idx[0] * 3);
  const B = new THREE.Vector3().fromArray(pos, idx[1] * 3);
  const C = new THREE.Vector3().fromArray(pos, idx[2] * 3);
  if (B.sub(A).cross(C.sub(A)).dot(c) < 0) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Bola de futebol clássica: 12 gomos pretos de cinco lados e 20 brancos de seis (icosaedro truncado). */
function soccerGeometry(D) {
  const lowp = D < 1;
  const R = 0.33;
  const k = lowp ? 3 : 4;
  const t = (1 + Math.sqrt(5)) / 2;
  const V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize());
  const F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const near = V.map(() => new Set());
  F.forEach(([a, b, c]) => {
    near[a].add(b).add(c);
    near[b].add(a).add(c);
    near[c].add(a).add(b);
  });
  const third = (a, b) => V[a].clone().lerp(V[b], 1 / 3);
  const parts = [];
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  V.forEach((v, i) => {
    // os cinco pontos a um terço das arestas que saem do vértice, em ordem em volta dele
    e1.set(-v.z, 0, v.x);
    if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0);
    e1.normalize();
    e2.crossVectors(v, e1);
    const pts = [...near[i]].map((j) => third(i, j)).sort((p, q) => Math.atan2(p.dot(e2), p.dot(e1)) - Math.atan2(q.dot(e2), q.dot(e1)));
    parts.push(piece(panelGeometry(pts, k, R), '#252224'));
  });
  F.forEach(([a, b, c]) => parts.push(piece(panelGeometry([third(a, b), third(b, a), third(b, c), third(c, b), third(c, a), third(a, c)], k, R), '#f8f6f1')));
  const ball = mergeGeometries(parts);
  // um gomo preto olhando para a frente, um pouco para cima e para o lado (como a bola parada no gramado)
  ball.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V[5], new THREE.Vector3(0.2, 0.42, 0.88).normalize()));
  return ball.translate(0, R - 0.004, 0);
}

/* ───────── Formatura, bebê, batizado e casamento ───────── */

const CAP = { x: -0.11, z: -0.07, yaw: -0.45, top: 0.17, board: 0.62, thick: 0.038 };
const capPose = (g) => g.rotateY(CAP.yaw).translate(CAP.x, 0, CAP.z);

/**
 * Capelo e canudo. part = 'cap' (pasta: a copa, o tampo quadrado, o canudo branco com a fita vermelha e o
 * lacinho) | 'tassel' (dourado: o botão, o cordão que cai pela beira do tampo e a borla).
 */
function gradCapGeometry(D, part) {
  const lowp = D < 1;
  const seg = lowp ? 14 : 24;
  const { top, board, thick } = CAP;
  const yT = top + thick; // face de cima do tampo
  if (part === 'tassel') {
    const zE = board / 2;
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, yT + 0.014, 0), new THREE.Vector3(0.012, yT + 0.008, 0.15), new THREE.Vector3(0.016, yT + 0.007, zE - 0.012), new THREE.Vector3(0.017, yT - 0.012, zE + 0.016), new THREE.Vector3(0.017, yT - 0.045, zE + 0.019), new THREE.Vector3(0.017, yT - 0.075, zE + 0.019)]);
    const cord = tube(lowp ? 10 : 22, lowp ? 4 : 6, (u, P) => curve.getPoint(u, P), 0.0078, 1, new THREE.Vector3(1, 0, 0));
    const fringe = lathe([[0.001, 0.014, 0.9], [0.014, 0.01, 1], [0.02, 0, 1], [0.015, -0.011, 0.8], [0.0125, -0.016, 0.7], [0.021, -0.032, 0.95], [0.027, -0.07, 1], [0.03, -0.1, 0.9], [0.001, -0.102, 0.6]], lowp ? 10 : 20, (a, i) => (i >= 5 ? 1 - 0.16 * (1 - gomo(a, 10, 0.6)) : 1)).translate(0.017, yT - 0.085, zE + 0.019);
    const button = new THREE.SphereGeometry(0.03, lowp ? 8 : 12, lowp ? 4 : 6, 0, TAU, 0, Math.PI / 2).scale(1, 0.55, 1).translate(0, yT - 0.001, 0);
    return grainUV(capPose(mergeGeometries([piece(cord, shown(GOLD)), piece(fringe, shown(GOLD)), piece(button, shown(GOLD))])), 17);
  }
  const BLACK = '#272426';
  const skull = lathe([[0.186, 0, 0.7], [0.198, 0.014, 0.86], [0.2, 0.09, 1], [0.193, top, 0.9], [0.001, top + 0.002, 0.9]], seg);
  const slab = cutout(asShape(roundedRectShape(board - 0.014, board - 0.014, 0.03)), thick - 0.014, { bevel: 0.007, curve: lowp ? 2 : 4 }).rotateX(-Math.PI / 2).translate(0, top + thick / 2, 0);
  const cap = capPose(mergeGeometries([piece(skull, BLACK), piece(slab, BLACK)]));
  // canudo: papel enrolado (a beira da folha aparece ao longo dele), fita no meio e lacinho
  const r = 0.055;
  const roll = lathe([[0.001, -0.236, 0.5], [0.034, -0.24, 0.6], [0.05, -0.25, 0.85], [r, -0.243, 1], [r, 0.243, 1], [0.05, 0.25, 0.85], [0.034, 0.24, 0.6], [0.001, 0.236, 0.5]], seg, (a) => 1 + 0.06 * (a / TAU)).rotateZ(Math.PI / 2);
  const band = lathe([[r + 0.003, -0.034, 0.85], [r + 0.009, -0.027, 1], [r + 0.009, 0.027, 1], [r + 0.003, 0.034, 0.85]], seg).rotateZ(Math.PI / 2);
  const RED = '#a51b1b';
  const bow = bowGeometry(D, false).scale(0.34, 0.34, 0.34).rotateX(-Math.PI / 4).translate(0, r * 0.74 + 0.004, r * 0.74 + 0.004);
  const scroll = mergeGeometries([piece(roll, '#fbf8f0'), piece(band, RED), piece(bow, RED)]).rotateY(0.5).translate(0.2, r + 0.001, 0.2);
  return mergeGeometries([cap, scroll]);
}

const BLOCK = { S: 0.3, rr: 0.03, a: 0.098, dip: 0.009 };

/** Letra de bloco (A, B ou C) num quadrado de −0,5 a 0,5. */
function letterShape(ch) {
  const s = new THREE.Shape();
  const hole = (fn) => {
    const h = new THREE.Path();
    fn(h);
    s.holes.push(h);
  };
  if (ch === 'A') {
    [[-0.42, -0.5], [-0.2, -0.5], [-0.136, -0.27], [0.136, -0.27], [0.2, -0.5], [0.42, -0.5], [0.14, 0.5], [-0.14, 0.5]].forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    hole((h) => {
      h.moveTo(-0.082, -0.08);
      h.lineTo(0.082, -0.08);
      h.lineTo(0, 0.214);
    });
  } else if (ch === 'B') {
    s.moveTo(-0.36, -0.5);
    s.lineTo(0.08, -0.5);
    s.absarc(0.08, -0.23, 0.27, -Math.PI / 2, Math.PI / 2, false);
    s.lineTo(0.05, 0.04);
    s.absarc(0.05, 0.27, 0.23, -Math.PI / 2, Math.PI / 2, false);
    s.lineTo(-0.36, 0.5);
    hole((h) => {
      h.moveTo(-0.14, -0.33);
      h.lineTo(0.07, -0.33);
      h.absarc(0.07, -0.195, 0.135, -Math.PI / 2, Math.PI / 2, false);
      h.lineTo(-0.14, -0.06);
    });
    hole((h) => {
      h.moveTo(-0.14, 0.12);
      h.lineTo(0.03, 0.12);
      h.absarc(0.03, 0.225, 0.105, -Math.PI / 2, Math.PI / 2, false);
      h.lineTo(-0.14, 0.33);
    });
  } else {
    const a0 = 0.78;
    const R = 0.5;
    const r = 0.27;
    s.moveTo(R * Math.cos(a0), R * Math.sin(a0));
    s.absarc(0, 0, R, a0, TAU - a0, false);
    s.lineTo(r * Math.cos(a0), -r * Math.sin(a0));
    s.absarc(0, 0, r, TAU - a0, a0, true);
  }
  return s;
}

/** A letra em pasta: tampa plana e, no computador, as paredes (relevo). Altura `size`, de pé no plano xy. */
function letterGeometry(ch, size, depth, lowp) {
  const shape = letterShape(ch);
  const seg = ch === 'C' ? (lowp ? 5 : 8) : lowp ? 2 : 3; // divisões de cada arco (o three dobra esse número)
  const face = new THREE.ShapeGeometry(shape, seg);
  face.deleteAttribute('uv');
  face.translate(0, 0, depth);
  const parts = [piece(face)];
  if (!lowp) {
    const pts = shape.extractPoints(seg);
    const wall = [];
    [pts.shape, ...pts.holes].forEach((ring, k) => {
      const cw = THREE.ShapeUtils.isClockWise(ring);
      const loop = (k === 0) === cw ? [...ring].reverse() : ring; // por fora anti-horário; furos, horário
      loop.forEach((p, i) => {
        const q = loop[(i + 1) % loop.length];
        if (p.distanceToSquared(q) < 1e-10) return;
        wall.push(p.x, p.y, 0, q.x, q.y, 0, q.x, q.y, depth, p.x, p.y, 0, q.x, q.y, depth, p.x, p.y, depth);
      });
    });
    const w = new THREE.BufferGeometry();
    w.setAttribute('position', new THREE.Float32BufferAttribute(wall, 3));
    w.computeVertexNormals();
    parts.push(piece(w));
  }
  const g = mergeGeometries(parts);
  if (ch === 'C') g.scale(0.88, 1, 1).translate(0.035, 0, 0);
  return g.scale(size, size, 1);
}

/**
 * Cubo de brinquedo em pasta: cantos macios, moldura na cor do cubo, miolo claro rebaixado em cada face e a
 * letra aplicada em relevo nas quatro laterais e em cima.
 */
function blockGeometry(D, ch, hex, ink) {
  const lowp = D < 1;
  const { S, rr, a, dip } = BLOCK;
  const h = S / 2;
  const n = lowp ? 3 : 5;
  const grid = lowp ? [-h, -a, a, h] : [-h, -(h - rr), -a, a, h - rr, h];
  const snap = (v) => grid[Math.round(((v + h) / S) * n)];
  const box = new THREE.BoxGeometry(S, S, S, n, n, n);
  box.deleteAttribute('uv');
  const pos = box.attributes.position;
  const nor = box.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const frame = new THREE.Color(hex);
  const panel = new THREE.Color(mix(hex, '#ffffff', 0.74));
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  const f = new THREE.Vector3();
  const edge = new Map();
  const lim = h - rr;
  for (let i = 0; i < pos.count; i++) {
    p.set(snap(pos.getX(i)), snap(pos.getY(i)), snap(pos.getZ(i)));
    f.fromBufferAttribute(nor, i);
    const flat = [p.x, p.y, p.z].filter((_, k) => Math.abs(f.getComponent(k)) < 0.5);
    const inner = Math.abs(flat[0]) <= a + 1e-4 && Math.abs(flat[1]) <= a + 1e-4;
    if (inner) p.addScaledVector(f, -dip);
    else {
      // cantos macios: o que passa da caixa interna vira arco de raio rr
      q.set(Math.max(-lim, Math.min(lim, p.x)), Math.max(-lim, Math.min(lim, p.y)), Math.max(-lim, Math.min(lim, p.z)));
      const d = p.clone().sub(q);
      const axes = (Math.abs(d.x) > 1e-6 ? 1 : 0) + (Math.abs(d.y) > 1e-6 ? 1 : 0) + (Math.abs(d.z) > 1e-6 ? 1 : 0);
      if (axes >= 2) {
        d.normalize();
        p.copy(q).addScaledVector(d, rr);
        edge.set(i, d);
      }
    }
    pos.setXYZ(i, p.x, p.y, p.z);
    const c = inner ? panel : frame;
    col.set([c.r, c.g, c.b], i * 3);
  }
  box.setAttribute('color', new THREE.BufferAttribute(col, 3));
  box.computeVertexNormals();
  edge.forEach((d, i) => nor.setXYZ(i, d.x, d.y, d.z));
  const letter = letterGeometry(ch, 0.15, lowp ? 0.003 : 0.011, lowp).translate(0, 0, h - dip);
  const letters = [letter, letter.clone().rotateY(Math.PI / 2), letter.clone().rotateY(Math.PI), letter.clone().rotateY(-Math.PI / 2), letter.clone().rotateX(-Math.PI / 2)];
  return mergeGeometries([piece(box), ...letters.map((g) => piece(g, ink))]).translate(0, h, 0);
}
const BLOCKS = [
  ['A', '#f6bccb', '#de6788'],
  ['B', '#b6d8f4', '#4a8bd0'],
  ['C', '#fbe29a', '#dd9d2a'],
];

/** Contorno da cruz latina, com as pontas levemente abertas. Pé em y = 0; o cruzamento fica em CROSS.yc. */
const CROSS = { H: 0.78, yc: 0.53, L: 0.25, base: 0.22 };
function crossShape() {
  const { H, yc, L } = CROSS;
  const c = 0.06;
  const e = 0.088;
  const s = new THREE.Shape();
  s.moveTo(-e, 0);
  s.lineTo(e, 0);
  s.quadraticCurveTo(c, 0.13, c, yc - c);
  s.quadraticCurveTo(L - 0.1, yc - c, L, yc - e);
  s.lineTo(L, yc + e);
  s.quadraticCurveTo(L - 0.1, yc + c, c, yc + c);
  s.quadraticCurveTo(c, H - 0.1, e, H);
  s.lineTo(-e, H);
  s.quadraticCurveTo(-c, H - 0.1, -c, yc + c);
  s.quadraticCurveTo(-L + 0.1, yc + c, -L, yc + e);
  s.lineTo(-L, yc - e);
  s.quadraticCurveTo(-L + 0.1, yc - c, -c, yc - c);
  s.quadraticCurveTo(-c, 0.13, -e, 0);
  return s;
}

/** Cruz de pasta de goma em duas camadas (a de cima, menor, dá o relevo), pintada com pó metálico. */
function crossGeometry(D) {
  const lowp = D < 1;
  const curve = lowp ? 3 : 6;
  const back = cutout(asShape(crossShape()), 0.03, { bevel: 0.01, curve });
  const front = cutout(asShape(crossShape()), 0.012, { bevel: 0.006, curve }).translate(0, -CROSS.yc, 0).scale(0.6, 0.6, 1).translate(0, CROSS.yc, 0.031);
  return grainUV(mergeGeometries([piece(back), piece(front)]).translate(0, CROSS.base, 0), 30);
}

const RINGS = { R: 0.18, t: 0.02, w: 0.065, tilt: (40 * Math.PI) / 180, x: -0.048, yaw: 0.5 };

/** Aliança "meia-cana": aro com a face de fora abaulada e a de dentro quase reta. No plano xy, eixo em z. */
function bandGeometry(R, t, w, tubular, radial) {
  const unit = 0.01; // tubo fino de partida (um tubo mais grosso que o aro se atravessaria)
  const g = new THREE.TorusGeometry(R, unit, radial, tubular);
  g.deleteAttribute('uv');
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const a = Math.atan2(y, x);
    const cb = (Math.hypot(x, y) - R) / unit;
    const sb = pos.getZ(i) / unit;
    const tt = cb >= 0 ? t : t * 0.4;
    const rad = R + tt * cb;
    pos.setXYZ(i, rad * Math.cos(a), rad * Math.sin(a), (w / 2) * sb);
    let nr = cb / tt;
    let nz = sb / (w / 2);
    const l = Math.hypot(nr, nz) || 1;
    nr /= l;
    nz /= l;
    nor.setXYZ(i, nr * Math.cos(a), nr * Math.sin(a), nz);
  }
  return g;
}

/**
 * Metal polido da aliança, na cor escolhida. O ambiente do palco é escuro para um espelho (a prata sairia preta):
 * o reflexo é reforçado e um fio de luz própria segura a cor — a mesma receita das bolas espelhadas.
 */
const ringMetal = (color) => (lib) =>
  lib.custom(`pt-ringMetal${color}`, () => new THREE.MeshStandardMaterial({ color: mix(color, '#ffffff', 0.3), metalness: 1, roughness: 0.15, envMapIntensity: 4.2, emissive: color, emissiveIntensity: 0.12, vertexColors: true }));

/**
 * Duas alianças entrelaçadas: uma deitada no bolo; a outra passa por dentro dela, com um ponto apoiado no bolo
 * e o aro descansando sobre a primeira (a inclinação é a que faz as duas se tocarem de verdade).
 */
function ringsGeometry(D) {
  const lowp = D < 1;
  const { R, t, w, tilt, x, yaw } = RINGS;
  const make = () => bandGeometry(R, t, w, lowp ? 28 : 56, lowp ? 8 : 14).rotateX(Math.PI / 2);
  const low = 0.0245; // altura do meio da seção no ponto mais baixo da aliança inclinada
  const flat = make().translate(x, w / 2, 0);
  const leaning = make().rotateZ(tilt).translate(x + R * Math.cos(tilt), low + R * Math.sin(tilt), 0);
  return mergeGeometries([piece(flat), piece(leaning)]).rotateY(yaw);
}

// crina: os três bicos, cada um num tamanho de verdade (roseta de 4 cm, pitanga e pingo de 2,5 cm)
const maneTones = (color) => {
  const c = shown(color);
  return [c, shift(c, -0.11, 0.95, 0.02), mix(shift(c, 0.06, 0.9, 0.04), '#ffffff', 0.5)];
};
const maneTint = (p, i, r, color) => maneTones(color)[i % 3];
const maneScale = (k) => () => [k, k, k];

export const BUILDERS = {
  chifre: (ctx, part) =>
    drawKit(ctx, part, 'chifre', [
      {
        parts: [
          { key: 'pt-horn', make: hornGeometry, mat: glitter },
          { key: 'pt-uniEars', make: unicornEarsGeometry, mat: fondant },
        ],
      },
    ]),
  cilios: wallDecal('cilios', 'pt-lashes', lashesGeometry, fondant),
  crina: (ctx, part) =>
    drawKit(ctx, part, 'crina', [
      { geo: (lib) => lib.geo.rosette(false), mat: cream, tint: maneTint, scale: maneScale(1.18) },
      { geo: (lib) => lib.geo.star(false), mat: cream, tint: maneTint, scale: maneScale(1.4) },
      { geo: (lib) => lib.geo.rosette(false), mat: cream, tint: maneTint, scale: maneScale(1.18) },
      { geo: (lib) => lib.geo.kiss(false), mat: cream, tint: maneTint, scale: maneScale(1.35) },
    ]),
  orelhasurso: (ctx, part) =>
    drawKit(ctx, part, 'orelhasurso', [
      {
        parts: [
          { key: 'pt-bearEars', make: (D) => bearEarsGeometry(D, 'out'), mat: fondant, tint: chosenTint },
          { key: 'pt-bearEarCores', make: (D) => bearEarsGeometry(D, 'in'), mat: fondant, tint: earCoreTint, cast: false },
        ],
      },
    ]),
  carinhaurso: wallDecal('carinhaurso', 'pt-bearFace', bearFaceGeometry, fondant),
  orelhascoelho: (ctx, part) => drawKit(ctx, part, 'orelhascoelho', [{ key: 'pt-bunnyEars', make: bunnyEarsGeometry, mat: fondant }]),
  sereia: (ctx, part) =>
    drawKit(ctx, part, 'sereia', [
      {
        parts: [
          { key: 'pt-tailBody', make: tailBodyGeometry, mat: pearlScales, tint: chosenTint },
          { key: 'pt-tailFin', make: tailFinGeometry, mat: pearl, tint: (p, i, r, color) => mix(shown(color), '#ffffff', 0.18) },
        ],
      },
    ]),
  estrelasdomar: (ctx, part) => {
    const tint = (p, i) => STARFISH_TINTS[i % STARFISH_TINTS.length];
    return drawKit(ctx, part, 'estrelasdomar', [
      { key: 'pt-starfishA', make: (D) => starfishGeometry(D, 0), mat: fondant, tint },
      { key: 'pt-starfishB', make: (D) => starfishGeometry(D, 1), mat: fondant, tint },
    ]);
  },
  planetas: (ctx, part) =>
    drawKit(ctx, part, 'planetas', [
      { key: 'pt-planetRing', make: ringedPlanetGeometry, mat: fondant },
      { key: 'pt-planetStripes', make: stripedPlanetGeometry, mat: fondant },
      { key: 'pt-moon', make: moonGeometry, mat: fondant },
    ]),
  foguete: (ctx, part) => drawKit(ctx, part, 'foguete', [{ key: 'pt-rocket', make: rocketGeometry, mat: fondant }]),
  bola: (ctx, part) => drawKit(ctx, part, 'bola', [{ key: 'pt-soccer', make: soccerGeometry, mat: fondant, sink: 0 }]),
  capelo: (ctx, part) =>
    drawKit(ctx, part, 'capelo', [
      {
        parts: [
          { key: 'pt-gradCap', make: (D) => gradCapGeometry(D, 'cap'), mat: fondant },
          { key: 'pt-gradTassel', make: (D) => gradCapGeometry(D, 'tassel'), mat: glitter },
        ],
      },
    ]),
  cubos: (ctx, part) => drawKit(ctx, part, 'cubos', BLOCKS.map(([ch, hex, ink]) => ({ key: `pt-block${ch}`, make: (D) => blockGeometry(D, ch, hex, ink), mat: fondant }))),
  cruz: (ctx, part) =>
    drawKit(ctx, part, 'cruz', [
      {
        parts: [
          { key: 'pt-cross', make: crossGeometry, mat: glitter, tint: chosenTint },
          // o palito que segura a cruz em pé (entra uns 5 mm no bolo)
          { geo: (lib) => lib.geo.stick(), mat: stickMat, scale: () => [1.7, CROSS.base + 0.1, 1.7], sink: 0.05, cast: false },
        ],
      },
    ]),
  aliancas: (ctx, part) => drawKit(ctx, part, 'aliancas', [{ key: 'pt-rings', make: ringsGeometry, mat: ringMetal(ctx.layout.opt('aliancas').color || GOLD), sink: 0 }]),
};
