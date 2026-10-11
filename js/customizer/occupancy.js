// BOLAB — distribuidor de decorações: quem ocupa o quê no topo e na lateral do bolo.
//
// O topo e a lateral são divididos em zonas (borda de bico, coroa, palco do meio, fundo para os palitos,
// frente para a escrita, lateral alta / baixa, base, faixa das cascatas). Cada peça declara o espaço que
// ocupa (esferas, em unidades do mundo: 1 = 10 cm) e um único distribuidor — calculado uma vez por
// configuração, sempre na mesma ordem — entrega os lugares: nada é colocado sem antes conferir que o lugar
// está livre. Os construtores (decor.js, decor2.js, party.js) só desenham o que o plano manda, então o
// resultado não depende da ordem em que as peças são montadas.
//
// Prioridade (quem escolhe lugar primeiro): nome em acrílico e plaquinha → estrelas → balões → arranjos do
// centro → velas → escrita → pirulitos e corações no palito → cascatas → coroas e meias-luas → espalhados.
// Os confeitos de cobertura (granulado, confete, pérolas soltas, folha de ouro miúda) entram por último, na
// hora de desenhar: cada um consulta o plano pronto e só cai onde não há peça nenhuma.
import { cleanOffset, pointInPath, rayHit, pathAt, cakeMetrics, dripReach } from './geometry.js';
import { rng, hashString } from './textures.js';
import { getDecor, getQuantity, getPiping } from '../data/customizer.js';
import { decorOptions } from './pricing.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** Folga mínima entre peças de decorações diferentes (1,2 mm). */
export const GAP = 0.012;
const CELL = 0.3;

/* ───────── Medidas compartilhadas com os construtores ───────── */

export const MAC_T = 0.164; // altura de um macaron
export const MAC_R = 0.153;
export const COOKIE_T = 0.098;
export const COOKIE_R = 0.15;
/** Com calda, quanto a cerca de chocolate se afasta da cobertura (a espessura das gotas). */
export const FENCE_AWAY = 0.044;

/** Quebra da mensagem da plaquinha em até duas linhas. */
export function splitMessage(text) {
  const t = String(text || '').trim();
  if (t.length <= 14 || !t.includes(' ')) return [t];
  let best = -1;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === ' ' && (best < 0 || Math.abs(i - t.length / 2) < Math.abs(best - t.length / 2))) best = i;
  }
  return [t.slice(0, best), t.slice(best + 1)];
}

/** Tamanho da plaquinha (largura acompanha o texto; duas linhas = mais alta). */
export function plaqueSize(text, rho) {
  const lines = splitMessage(text);
  const longest = Math.max(...lines.map((l) => l.length));
  const w = Math.min(rho * 1.9, Math.max(0.58, 0.25 + longest * 0.097));
  const h = lines.length > 1 ? 0.52 : 0.36;
  return { w, h, lines };
}

/** Texto comprido com espaço vira duas linhas no topo de acrílico (a de baixo é a mais longa, quando dá). */
export function topperLines(text) {
  const t = String(text || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 16);
  if (t.length <= 8 || !t.includes(' ')) return t ? [t] : [];
  let best = null;
  for (let i = 1; i < t.length - 1; i++) {
    if (t[i] !== ' ') continue;
    const a = t.slice(0, i);
    const b = t.slice(i + 1);
    const score = Math.max(a.length, b.length) * 10 + (a.length > b.length ? 1 : 0);
    if (!best || score < best.score) best = { score, lines: [a, b] };
  }
  return best ? best.lines : [t];
}

/** Largura do topo de acrílico: uns três quartos do diâmetro do bolo (de 7 a 16 cm). */
export function topperSize(chars, free, tight = false) {
  const want = clamp(0.5 + 0.16 * Math.max(1, chars), 0.75, 1.6);
  return Math.min(want, free * (chars > 10 ? 2.25 : 1.9)) * (tight ? 0.86 : 1);
}

/**
 * Escala do bico da base de um andar (spec = medidas do bico). Com calda, as peças encolhem para ficar abaixo
 * das gotas mais compridas; se nem assim couberem, aquele andar fica sem bico na base (devolve 0).
 */
export function baseRingScale(config, t, spec) {
  if (!spec) return 0;
  const size = spec.baseScale || 1;
  if (!config.drip?.on) return size;
  const need = spec.r * size * 1.16 * (1 + 0.45 * Math.cos(spec.lean || 0)) + 0.012;
  const room = t.Ht - t.rf - dripReach(t) - 0.03;
  if (need <= room) return size;
  const k = room / need;
  return k < 0.55 ? 0 : size * k;
}

/* ───────── Volumes das peças (os mesmos que cada construtor declara em part.volumes) ─────────
   Cada função devolve [[x, y, z, r, classe]]: esferas que cobrem a peça desenhada. */

/** Base ortonormal (u, v) perpendicular ao eixo n. */
function perp(nx, ny, nz) {
  let ux = -nz;
  let uy = 0;
  let uz = nx;
  let l = Math.hypot(ux, uz);
  if (l < 1e-4) {
    ux = 1;
    uz = 0;
    l = 1;
  }
  ux /= l;
  uz /= l;
  // v = n × u
  const vx = ny * uz - nz * uy;
  const vy = nz * ux - nx * uz;
  const vz = nx * uy - ny * ux;
  return [ux, uy, uz, vx, vy, vz];
}

/** Disco (macaron, biscoito, pirulito): uma esfera no meio e uma roda de esferas na borda, no plano do disco. */
function volDisc(cx, cy, cz, nx, ny, nz, R, half, kind = 'solid', n = 6) {
  const rim = Math.max(half, R * 0.34);
  const out = [[cx, cy, cz, Math.max(half, R * 0.5), kind]];
  const [ux, uy, uz, vx, vy, vz] = perp(nx, ny, nz);
  const d = R - rim;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const c = Math.cos(a) * d;
    const s = Math.sin(a) * d;
    out.push([cx + ux * c + vx * s, cy + uy * c + vy * s, cz + uz * c + vz * s, rim, kind]);
  }
  return out;
}

export const VOL = {
  /** Morango deitado, com a ponta para fora e para cima (x, z = onde apoia; y0 = cobertura). */
  berryLying(x, y0, z, ox, oz, s, lean, kind = 'solid') {
    const sl = Math.sin(lean);
    const cl = Math.cos(lean);
    const cy = y0 + 0.098 * s;
    return [
      [x - ox * sl * 0.02 * s, cy - cl * 0.02 * s, z - oz * sl * 0.02 * s, 0.118 * s, kind],
      [x + ox * sl * 0.098 * s, cy + cl * 0.098 * s, z + oz * sl * 0.098 * s, 0.07 * s, kind],
      [x - ox * sl * 0.088 * s, cy - cl * 0.088 * s, z - oz * sl * 0.088 * s, 0.1 * s, kind],
    ];
  },
  /** Morango em pé (ponta para cima), no meio de um arranjo. yc = centro da fruta. */
  berryUp(x, yc, z, s) {
    return [
      [x, yc - 0.02 * s, z, 0.118 * s, 'solid'],
      [x, yc + 0.098 * s, z, 0.07 * s, 'solid'],
      [x, yc - 0.088 * s, z, 0.1 * s, 'solid'],
    ];
  },
  blueberry: (x, y, z, k, kind = 'solid') => [[x, y + 0.05 * k, z, 0.065 * k, kind]],
  raspberry: (x, y, z, k, kind = 'solid') => [[x, y + 0.064 * k, z, 0.092 * k, kind]],
  /** Rosa de açúcar: K = escala final da malha. */
  rose: (x, y, z, K) => [[x, y + 0.04 * K, z, 0.172 * K, 'solid']],
  roseSide: (x, y, z, ox, oz, K) => [[x + ox * 0.05 * K, y + 0.02 * K, z + oz * 0.05 * K, 0.172 * K, 'side']],
  blossom: (x, y, z, k, kind = 'solid') => [[x, y + 0.02 * k, z, 0.08 * k, kind]],
  /** Folha deitada: nasce em (x, z) e aponta para o ângulo a; L = escala. */
  leaf(x, y, z, a, L, kind = 'solid') {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [
      [x + c * 0.05 * L, y + 0.02, z + s * 0.05 * L, 0.04 * L, kind],
      [x + c * 0.11 * L, y + 0.022, z + s * 0.11 * L, 0.034 * L, kind],
    ];
  },
  /** Cereja: corpo + cabinho (eixo inclinado de `tilt` para o ângulo a; spin gira o cabo em volta do eixo). */
  cherry(x, y, z, s, a, tilt, spin, variant) {
    const ax = Math.cos(a) * Math.sin(tilt);
    const ay = Math.cos(tilt);
    const az = Math.sin(a) * Math.sin(tilt);
    const by = y - 0.006 * s;
    const out = [[x + ax * 0.093 * s, by + ay * 0.093 * s, z + az * 0.093 * s, 0.1 * s, 'solid']];
    const bx = variant ? -0.035 : 0.075;
    const bz = variant ? 0.06 : -0.015;
    const len = variant ? 0.3 : 0.27;
    // rotação que leva +Y ao eixo (menor arco), depois de girar `spin` em torno de Y
    const k = Math.hypot(az, ax) || 1;
    const kx = az / k; // eixo de rotação = Y × eixo → (az, 0, -ax)
    const kz = -ax / k;
    const ct = ay;
    const st = Math.hypot(ax, az);
    const cs = Math.cos(spin);
    const sn = Math.sin(spin);
    [0.3, 0.55, 0.8, 1].forEach((u) => {
      const px0 = bx * Math.pow(u, 1.7);
      const py = 0.15 + len * u - 0.03 * u * u;
      const pz0 = bz * u * u;
      const px = px0 * cs + pz0 * sn;
      const pz = -px0 * sn + pz0 * cs;
      // Rodrigues: v·cosθ + (k × v)·sinθ + k (k·v)(1 − cosθ), com k = (kx, 0, kz)
      const kv = kx * px + kz * pz;
      const cxp = -kz * py; // (k × v).x = ky·vz − kz·vy
      const cyp = kz * px - kx * pz;
      const czp = kx * py;
      const rx = px * ct + cxp * st + kx * kv * (1 - ct);
      const ry = py * ct + cyp * st;
      const rz = pz * ct + czp * st + kz * kv * (1 - ct);
      out.push([x + rx * s, by + ry * s, z + rz * s, 0.014 * s, 'air']);
    });
    return out;
  },
  daisy: (x, y, z, s) => [[x, y + 0.02 * s, z, 0.139 * s, 'solid']],
  /** Margarida colada na lateral: o miolo aponta para (ax, ay, az). */
  daisySide: (x, y, z, ax, ay, az, s) => volDisc(x + ax * 0.03 * s, y + ay * 0.03 * s, z + az * 0.03 * s, ax, ay, az, 0.139 * s, 0.04 * s, 'side'),
  daisyLeaf: (x, y, z, a, s) => [[x + Math.cos(a) * 0.165 * s, y + 0.02, z + Math.sin(a) * 0.165 * s, 0.036 * s, 'solid']],
  /** Peônia: taça grande; o eixo inclina `tilt` para (ox, oz). */
  peony(x, y, z, s, ox = 0, oz = 1, tilt = 0, kind = 'solid') {
    const ax = ox * Math.sin(tilt);
    const ay = Math.cos(tilt);
    const az = oz * Math.sin(tilt);
    const out = [[x + ax * 0.1 * s, y + ay * 0.1 * s, z + az * 0.1 * s, 0.2 * s, kind]];
    const [ux, uy, uz, vx, vy, vz] = perp(ax, ay, az);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const c = Math.cos(a) * 0.168 * s;
      const sn = Math.sin(a) * 0.168 * s;
      out.push([x + ax * 0.075 * s + ux * c + vx * sn, y + ay * 0.075 * s + uy * c + vy * sn, z + az * 0.075 * s + uz * c + vz * sn, 0.1 * s, kind]);
    }
    return out;
  },
  peonyLeaf(x, y, z, a, s, L, kind = 'solid') {
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const d0 = 0.17 * s;
    return [
      [x + c * (d0 + 0.07 * L), y + 0.024, z + sn * (d0 + 0.07 * L), 0.045 * L, kind],
      [x + c * (d0 + 0.125 * L), y + 0.022, z + sn * (d0 + 0.125 * L), 0.032 * L, kind],
    ];
  },
  /** Macaron com centro (cx, cy, cz) e eixo (nx, ny, nz). */
  macaron: (cx, cy, cz, nx, ny, nz, s, kind = 'solid') => volDisc(cx, cy, cz, nx, ny, nz, 0.158 * s, 0.084 * s, kind),
  brigadeiro(x, y, z, s) {
    const out = [[x, y + 0.106 * s, z, 0.109 * s, 'solid']];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      out.push([x + Math.cos(a) * 0.097 * s, y + 0.062 * s, z + Math.sin(a) * 0.097 * s, 0.043 * s, 'solid']);
    }
    return out;
  },
  bombom: (x, y, z, s, kind = 'solid') => [[x, y + 0.074 * s, z, 0.126 * s, kind]],
  meringue: (x, y, z, s, tall = 1) => [
    [x, y + 0.095 * s, z, 0.109 * s, 'solid'],
    [x + 0.012 * s, y + 0.17 * s * tall, z, 0.058 * s, 'solid'],
  ],
  marshmallow: (x, yc, z, s) => [[x, yc, z, 0.13 * s, 'solid']],
  /** Biscoito recheado com centro (cx, cy, cz) e eixo (nx, ny, nz). */
  cookie: (cx, cy, cz, nx, ny, nz, s) => volDisc(cx, cy, cz, nx, ny, nz, 0.153 * s, 0.054 * s, 'solid'),
  heart: (cx, cy, cz, s, kind = 'solid') => [[cx, cy, cz, 0.073 * s, kind]],
  butterfly: (x, y, z, s, open, ux = 0, uy = 1, uz = 0, kind = 'solid') => [[x + ux * 0.05 * s, y + uy * 0.05 * s, z + uz * 0.05 * s, Math.max(0.088, 0.1 * open) * s, kind]],
  /** Laço em pé no topo (origem no nó, costas em z = 0). (fx, fz) = para onde ele olha. */
  bowTop(x, y, z, fx, fz, s) {
    const rx = fz; // "direita" do laço
    const rz = -fx;
    const p = (lx, ly, lz, r) => [x + rx * lx * s + fx * lz * s, y + ly * s, z + rz * lx * s + fz * lz * s, r * s, 'solid'];
    const out = [p(0, 0.128, 0.066, 0.07)];
    [-1, 1].forEach((sx) => {
      out.push(p(sx * 0.115, 0.17, 0.07, 0.12), p(sx * 0.225, 0.19, 0.07, 0.118));
      out.push(p(sx * 0.09, 0.055, 0.14, 0.045), p(sx * 0.165, 0.035, 0.215, 0.042), p(sx * 0.225, 0.03, 0.285, 0.04));
    });
    return out;
  },
  /** Laço na frente da lateral (origem no nó). (nx, nz) = para fora do bolo. */
  bowSide(x, y, z, nx, nz, s) {
    const rx = nz;
    const rz = -nx;
    const p = (lx, ly, lz, r) => [x + rx * lx * s + nx * lz * s, y + ly * s, z + rz * lx * s + nz * lz * s, r * s, 'side'];
    const out = [p(0, 0, 0.066, 0.064)];
    [-1, 1].forEach((sx) => {
      out.push(p(sx * 0.12, 0.035, 0.07, 0.125), p(sx * 0.235, 0.055, 0.07, 0.115));
      out.push(p(sx * 0.055, -0.1, 0.035, 0.05), p(sx * 0.105, -0.2, 0.035, 0.056), p(sx * 0.16, -0.305, 0.035, 0.058));
    });
    return out;
  },
  /** Palito: do topo do bolo (x0, y0, z0) até (x1, y1, z1). */
  stick(x0, y0, z0, x1, y1, z1, r = 0.014, kind = 'stick') {
    const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    const n = Math.max(1, Math.ceil(len / 0.04));
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (y0 + (y1 - y0) * t < y0 + 0.012 && i < n) continue; // o pé entra na cobertura
      out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t, r, kind]);
    }
    return out;
  },
  /** Balão: nó em (x, y, z), eixo (ax, ay, az), escala s. */
  balloon(x, y, z, ax, ay, az, s) {
    return [
      [x + ax * 0.237 * s, y + ay * 0.237 * s, z + az * 0.237 * s, 0.163 * s, 'air'],
      [x + ax * 0.105 * s, y + ay * 0.105 * s, z + az * 0.105 * s, 0.092 * s, 'air'],
      [x + ax * 0.01 * s, y + ay * 0.01 * s, z + az * 0.01 * s, 0.035 * s, 'air'],
    ];
  },
  /** Pirulito: disco de centro (cx, cy, cz) e frente (nx, ny, nz). */
  lollipop: (cx, cy, cz, nx, ny, nz, s) => volDisc(cx, cy, cz, nx, ny, nz, 0.153 * s, 0.05 * s, 'air', 8),
  /** Estrela do topo de festa (raio = size). */
  star(x, y, z, size, roll, group = 'estrela') {
    const kind = `air:${group}`;
    const out = [[x, y, z, 0.56 * size, kind]];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + Math.PI / 2 + roll;
      out.push([x + Math.cos(a) * 0.76 * size, y + Math.sin(a) * 0.76 * size, z, 0.28 * size, kind]);
    }
    return out;
  },
  /** Vela clássica: pé em (x, y0, z), altura h; a chama fica acima. */
  candle(x, y0, z, h) {
    const out = [];
    const n = Math.ceil(h / 0.05);
    for (let i = 0; i <= n; i++) out.push([x, y0 + 0.03 + (h - 0.03) * (i / n), z, 0.033, 'solid']);
    out.push([x, y0 + h + 0.075, z, 0.04, 'fx']);
    return out;
  },
  /**
   * Placa em pé (plaquinha, nome em acrílico, algarismos): centro em (cx, z) e de y0 a y1, largura w, espessura
   * 2·r. tilt = quanto o alto recua (rad, em torno do pé `pivot`).
   */
  board(cx, z, y0, y1, w, r, tilt, pivot, kind) {
    const out = [];
    const nx = Math.max(1, Math.ceil((w - 2 * r) / (r * 1.6)));
    const ny = Math.max(1, Math.ceil((y1 - y0 - 2 * r) / (r * 1.6)));
    for (let j = 0; j <= ny; j++) {
      const y = y1 - y0 <= 2 * r ? (y0 + y1) / 2 : y0 + r + ((y1 - y0 - 2 * r) * j) / ny;
      const zz = z - Math.sin(tilt) * (y - pivot);
      for (let i = 0; i <= nx; i++) {
        const x = w <= 2 * r ? cx : cx - w / 2 + r + ((w - 2 * r) * i) / nx;
        out.push([x, y, zz, r, kind]);
      }
    }
    return out;
  },
};

/* ───────── Ocupação ─────────
   Tudo o que já tem lugar: esferas (peças) e cilindros em pé (regiões reservadas). Uma grade no plano xz deixa
   cada consulta barata — o granulado inteiro passa por aqui sem pesar. */

function createOcc() {
  const items = [];
  const grid = new Map();
  const each = (x, z, r, fn) => {
    const x0 = Math.floor((x - r) / CELL);
    const x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL);
    const z1 = Math.floor((z + r) / CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) if (fn((ix + 256) * 1024 + iz + 256)) return true;
    }
    return false;
  };
  const insert = (it) => {
    items.push(it);
    each(it.x, it.z, it.r, (k) => {
      let l = grid.get(k);
      if (!l) grid.set(k, (l = []));
      l.push(it);
      return false;
    });
    return it;
  };
  return {
    items,
    /** Esfera (peça). o = dono (número). soft = confeito de cobertura (não barra outro confeito). */
    add(o, x, y, z, r, kind = 'solid') {
      return insert({ o, x, y, z, r, y0: y - r, y1: y + r, sph: true, kind, soft: kind === 'coating', dead: false });
    },
    /** Cilindro em pé (região reservada entre y0 e y1). */
    addCyl(o, x, z, r, y0, y1, kind = 'region') {
      return insert({ o, x, y: (y0 + y1) / 2, z, r, y0, y1, sph: false, kind, soft: kind === 'coating', dead: false });
    },
    /** A esfera (x, y, z, r) encosta em algo que não é do dono `me`? skipSoft: ignora confeitos de cobertura · skipKind: ignora essa classe. */
    hit(x, y, z, r, pad = GAP, me = -1, skipSoft = false, skipKind = '') {
      const R = r + pad;
      return each(x, z, R, (k) => {
        const l = grid.get(k);
        if (!l) return false;
        for (let i = 0; i < l.length; i++) {
          const it = l[i];
          if (it.dead || it.o === me || (skipSoft && it.soft) || (skipKind && it.kind === skipKind)) continue;
          const dx = it.x - x;
          const dz = it.z - z;
          const rr = R + it.r;
          const h2 = dx * dx + dz * dz;
          if (h2 >= rr * rr) continue;
          if (it.sph) {
            const dy = it.y - y;
            if (h2 + dy * dy < rr * rr) return true;
          } else if (y + R > it.y0 && y - R < it.y1) return true;
        }
        return false;
      });
    },
    /** O cilindro (x, z, r) entre y0 e y1 encosta em algo? (esferas contam pela faixa de altura que ocupam) */
    hitCyl(x, z, r, y0, y1, pad = GAP, me = -1) {
      const R = r + pad;
      return each(x, z, R, (k) => {
        const l = grid.get(k);
        if (!l) return false;
        for (let i = 0; i < l.length; i++) {
          const it = l[i];
          if (it.dead || it.o === me) continue;
          if (y1 + pad <= it.y0 || y0 - pad >= it.y1) continue;
          const dx = it.x - x;
          const dz = it.z - z;
          const rr = R + it.r;
          if (dx * dx + dz * dz < rr * rr) return true;
        }
        return false;
      });
    },
    /** Folga horizontal até a peça mais próxima que cruza a faixa de altura [y0, y1]. */
    clear(x, z, y0, y1, me = -1) {
      let best = Infinity;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.dead || it.o === me || y1 <= it.y0 || y0 >= it.y1) continue;
        const d = Math.hypot(it.x - x, it.z - z) - it.r;
        if (d < best) best = d;
      }
      return best;
    },
    /** Ponto mais alto ocupado dentro do disco (x, z, r), acima de yMin. */
    topAt(x, z, r, yMin, me = -1) {
      let best = -Infinity;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.dead || it.o === me || it.y1 <= yMin) continue;
        if (Math.hypot(it.x - x, it.z - z) < it.r + r) best = Math.max(best, it.y1);
      }
      return best;
    },
    release(o) {
      for (let i = 0; i < items.length; i++) if (items[i].o === o) items[i].dead = true;
    },
  };
}

/** Distância com sinal até o contorno (> 0 dentro). */
export function signedDist(path, px, pz) {
  let best = Infinity;
  for (let i = 0; i < path.n; i++) {
    const j = i + 1 === path.n ? 0 : i + 1;
    const ax = path.x[i];
    const az = path.z[i];
    const ex = path.x[j] - ax;
    const ez = path.z[j] - az;
    const len = ex * ex + ez * ez || 1e-9;
    const t = Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / len));
    const dx = px - ax - ex * t;
    const dz = pz - az - ez * t;
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return (pointInPath(path, px, pz) ? 1 : -1) * Math.sqrt(best);
}

/* ───────── O que cada decoração ocupa ─────────
   r = raio da peça (escala 1) · out = quanto ela avança para a borda a partir do ponto de apoio ·
   step = distância entre vizinhas numa coroa (fartura média) · touch = menor distância entre vizinhas ·
   band = largura da faixa que a coroa ocupa · h = altura · minS = menor escala aceitável ·
   pile = [raio de arranjo, quantas, altura do 2º andar] para o montinho do centro ·
   scat = [espaço por peça, quantas] espalhadas · casc = [espaço, quantas] em cascata · sideR = raio na lateral. */
const SPEC = {
  frutas: { r: 0.115, out: 0.165, step: 0.215, touch: 0.2, band: 0.44, h: 0.2, minS: 0.8, casc: [0.1, 9], sideR: 0.115 },
  morangos: { r: 0.118, out: 0.165, step: 0.3, touch: 0.24, band: 0.36, h: 0.2, minS: 0.78, pile: [0.126, 7, 0] },
  cerejas: { r: 0.1, out: 0.1, step: 0.265, touch: 0.205, band: 0.21, h: 0.46, minS: 0.8, pile: [0.104, 7, 0.15], scat: [0.13, 8] },
  flores: { r: 0.19, out: 0.19, step: 0.3, touch: 0.26, band: 0.4, h: 0.2, minS: 0.62, casc: [0.11, 8], sideR: 0.14 },
  margaridas: { r: 0.139, out: 0.139, step: 0.272, touch: 0.25, band: 0.3, h: 0.06, minS: 0.72, scat: [0.15, 8], casc: [0.128, 8], sideR: 0.139 },
  peonias: { r: 0.268, out: 0.268, step: 0.42, touch: 0.42, band: 0.54, h: 0.3, minS: 0.5, casc: [0.2, 5], sideR: 0.2 },
  macarons: { r: 0.158, out: 0.158, step: 0.249, touch: 0.19, band: 0.33, h: 0.26, minS: 0.72, pile: [0.158, 6, MAC_T - 0.01], casc: [0.155, 5], sideR: 0.158 },
  brigadeiros: { r: 0.14, out: 0.14, step: 0.339, touch: 0.285, band: 0.29, h: 0.22, minS: 0.72, pile: [0.142, 7, 0] },
  bombons: { r: 0.126, out: 0.126, step: 0.307, touch: 0.258, band: 0.26, h: 0.2, minS: 0.75, pile: [0.128, 7, 0.128], scat: [0.145, 8] },
  suspiros: { r: 0.109, out: 0.109, step: 0.265, touch: 0.228, band: 0.23, h: 0.24, minS: 0.72, pile: [0.113, 7, 0.14], scat: [0.13, 9] },
  marshmallows: { r: 0.13, out: 0.13, step: 0.28, touch: 0.265, band: 0.27, h: 0.21, minS: 0.72, pile: [0.132, 8, 0.19], scat: [0.14, 9] },
  biscoitos: { r: 0.153, out: 0.085, step: 0.371, touch: 0.2, band: 0.3, h: 0.31, minS: 0.72 },
  raspas: { r: 0.09, out: 0.09, step: 0.16, touch: 0.16, band: 0.19, h: 0.1, minS: 1 },
  ouro: { r: 0.06, out: 0.06, step: 0.135, touch: 0.125, band: 0.13, h: 0.03, minS: 1, scat: [0.17, 6], casc: [0.1, 9], sideR: 0.1 },
  coracoes: { r: 0.073, out: 0.085, step: 0.195, touch: 0.165, band: 0.19, h: 0.16, minS: 0.8, scat: [0.086, 14] },
  borboletas: { r: 0.12, out: 0.145, step: 0.28, touch: 0.26, band: 0.29, h: 0.14, minS: 0.8, scat: [0.13, 6], casc: [0.115, 7], sideR: 0.1 },
};

const NAMES = {
  frutas: 'as frutas',
  morangos: 'os morangos',
  cerejas: 'as cerejas',
  flores: 'as rosas',
  margaridas: 'as margaridas',
  peonias: 'as peônias',
  macarons: 'os macarons',
  brigadeiros: 'os brigadeiros',
  bombons: 'os bombons',
  suspiros: 'os suspiros',
  marshmallows: 'os marshmallows',
  biscoitos: 'os biscoitos',
  wafer: 'a cerca de chocolate',
  pirulitos: 'os pirulitos',
  raspas: 'as raspas de chocolate',
  granulado: 'o granulado',
  confete: 'o confete',
  perolas: 'as pérolas',
  ouro: 'a folha de ouro',
  velas: 'as velas',
  topo: 'o topo de estrelas',
  baloes: 'os balões',
  lacos: 'o laço',
  coracoes: 'os corações',
  borboletas: 'as borboletas',
  placa: 'a plaquinha',
  nome: 'o topo com o nome',
  escrita: 'a mensagem escrita',
};
const bare = (id) => (NAMES[id] || id).replace(/^(as|os|a|o) /, '');
const listOf = (ids, withArticle = false) => {
  const names = ids.map((id) => (withArticle ? NAMES[id] || id : bare(id)));
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** Vários itens, ou um item de nome plural ("os macarons")? */
const many = (ids) => ids.length > 1 || /^(as|os) /.test(NAMES[ids[0]] || '');

/* ───────── Distribuidor ───────── */

const MEMO = new Map();
const MEMO_MAX = 8;

function configKey(config, m) {
  const d = config.decor || {};
  const covers = (m.stack || [m]).map((t) => `${t.type}:${t.style}:${t.naked ? 1 : 0}`).join();
  const opts = (d.items || []).map((id) => {
    const o = decorOptions(config, id);
    return `${id}:${o.arr}:${o.qty}`;
  });
  return [config.shape, config.size, config.tiers, config.height, (config.layers || []).length, covers, config.drip?.on ? 1 : 0, config.piping?.style, config.piping?.where, opts.join(), d.candles, d.candleStyle, d.number, d.message, d.messageMode, d.script, d.topper?.text, m.R, m.Ht, m.Htot].join('|');
}

/**
 * Plano de ocupação de um bolo. base = { border, rho, topY, pipe, pipeTop, message, script, named, plaqueLift }
 * (o que decorLayout já sabe). O resultado fica guardado: pedir de novo o mesmo bolo não refaz a conta.
 */
export function allocate(config, m, base) {
  // (a chave não leva o nível de detalhe: os contornos que o plano usa são os mesmos no celular e no computador,
  // então o painel — que pede os avisos — e o desenho 3D compartilham a mesma conta)
  const key = configKey(config, m);
  if (MEMO.has(key)) {
    const hit = MEMO.get(key);
    MEMO.delete(key);
    MEMO.set(key, hit);
    return hit;
  }
  const out = compute(config, m, base);
  MEMO.set(key, out);
  if (MEMO.size > MEMO_MAX) MEMO.delete(MEMO.keys().next().value);
  return out;
}

/** Plano já calculado para esta configuração (ou null) e as medidas do bolo: { plan, m }. */
export function plannedFor(config) {
  let m = null;
  try {
    m = cakeMetrics(config, 1);
  } catch {
    return null;
  }
  return { plan: MEMO.get(configKey(config, m)) || null, m };
}

function compute(config, m, base) {
  const d = config.decor;
  const items = (d.items || []).filter((id) => getDecor(id));
  const has = (id) => items.includes(id);
  const opt = (id) => decorOptions(config, id);
  const qty = (id) => getQuantity(opt(id).qty)?.k || 1;
  const rho = base.rho;
  const topY = base.topY;
  const cx = m.center.x;
  const cz = m.center.z;
  const stack = m.stack || [m];
  const round = m.shape === 'round';
  const occ = createOcc();
  const notes = { adapted: false, messages: [], unfit: [], unfitIds: [] };
  const about = new Map(); // aviso → decorações de que ele fala (se uma delas acabar não cabendo, o aviso sai)
  const say = (msg, ids) => {
    if (!notes.messages.includes(msg)) notes.messages.push(msg);
    if (ids) about.set(msg, ids.slice());
    notes.adapted = true;
  };
  const message = base.message || '';
  const script = base.script || '';
  const named = Boolean(base.named);
  const special = has('velas') && d.candleStyle !== 'classica';
  const numero = special && d.candleStyle === 'numero' && /\d/.test(String(d.number ?? ''));
  const faisca = special && d.candleStyle === 'faisca';
  const classic = has('velas') && !special;
  const fenced = has('wafer');
  const drip = Boolean(config.drip?.on);
  const vintage = config.piping?.style === 'vintage';

  // ── donos ──
  const owners = new Map();
  const own = (name) => {
    if (!owners.has(name)) owners.set(name, owners.size + 1);
    return owners.get(name);
  };
  const plan = {};
  const P = (id) => plan[id] || (plan[id] = { id, zone: '', pieces: [], regions: [], scale: 1, want: 0, unfit: false });
  const party = { plaque: null, topper: null, stars: [], candles: null, numbers: null, sparkler: null, text: null };

  // ── topo ──
  // a borda de bico (base.border) e, com pérolas, o colar que acompanha o bico por dentro
  const necklace = has('perolas') ? 0.054 : 0;
  const edge = base.border + necklace;
  const flat = m.topFlat;
  const sd = round ? (x, z) => rho - Math.hypot(x - cx, z - cz) : (x, z) => signedDist(flat, x, z);
  /** O disco (x, z, r) cabe na área livre do topo (dentro da borda de bico)? */
  const inside = (x, z, r = 0) => {
    // atalho: dentro do círculo inscrito já está dentro de qualquer formato (evita medir o contorno inteiro)
    if (Math.hypot(x - cx, z - cz) + r + edge <= rho) return true;
    return !round && sd(x, z) >= edge + r - 1e-6;
  };
  const insets = new Map();
  const inset = (dist) => {
    const k = Math.round(dist * 250);
    if (!insets.has(k)) insets.set(k, cleanOffset(flat, -Math.max(0.001, k / 250)));
    return insets.get(k);
  };
  /** Distância do centro, na direção theta, até o contorno do topo recuado de `dist`. */
  const reach = (theta, dist) => (round ? Math.max(0, rho - dist) : rayHit(inset(dist), cx, cz, theta));
  const F = Math.max(0.03, rho - edge); // raio livre (círculo inscrito)
  /** Meia largura livre do topo na profundidade z (para peças de raio r). */
  const maxX = (z, r = 0) => {
    let lo = 0;
    let hi = (m.bounds?.hx || rho) + 0.1;
    if (!inside(cx, z, r)) return 0;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (inside(cx + mid, z, r) && inside(cx - mid, z, r)) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  /** Meia largura do bolo inteiro (até a beira) na profundidade z. */
  const rimX = (z) => {
    let lo = 0;
    let hi = (m.bounds?.hx || rho) + 0.1;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (sd(cx + mid, z) >= -0.01 && sd(cx - mid, z) >= -0.01) lo = mid;
      else hi = mid;
    }
    return lo;
  };

  /** Tenta pôr uma peça: confere o topo (peças apoiadas) e a ocupação; se couber, reserva. */
  const fits = (o, vol, pad = GAP) => {
    for (let i = 0; i < vol.length; i++) {
      const v = vol[i];
      const cls = String(v[4] || 'solid').split(':')[0];
      if (cls === 'solid' && !inside(v[0], v[2], v[3])) return false;
      if (cls === 'stick' && v[1] < topY + 0.08 && !inside(v[0], v[2], 0.012)) return false;
      if (cls === 'air' && Math.hypot(v[0] - cx, v[2] - cz) > rho && sd(v[0], v[2]) < -(m.rf + 0.03)) return false;
      // o que é colado na lateral encosta na cerca de chocolate (ela é a parede): só o resto barra
      if (occ.hit(v[0], v[1], v[2], v[3], pad, o, false, cls === 'side' || cls === 'coating' ? 'fence' : '')) return false;
    }
    return true;
  };
  const reserve = (o, vol) => vol.forEach((v) => occ.add(o, v[0], v[1], v[2], v[3], v[4] || 'solid'));
  const put = (id, piece, pad = GAP) => {
    const o = own(id);
    if (!fits(o, piece.vol, pad)) return false;
    reserve(o, piece.vol);
    P(id).pieces.push(piece);
    return true;
  };

  /* ── lateral: faixa livre de cada andar ── */
  const pipeStyle = config.piping?.style || 'liso';
  const combo = Boolean(getPiping(pipeStyle)?.combo);
  const pipeBase = pipeStyle !== 'liso' && (combo || config.piping.where !== 'top') && !fenced;
  const spec = base.pipe;
  const fenceAway = fenced && drip ? FENCE_AWAY : 0; // com calda, as barrinhas ficam encostadas nas gotas
  const fenceOut = fenced ? 0.068 + fenceAway : 0;
  let baseDropped = false;
  const sides = stack.map((t) => {
    const sideH = t.Ht - t.rf;
    let lo = t.y0 + 0.02;
    // bico da base: a peça (raio r, um pouco esticada) se apoia inclinada no canto bolo / prato
    const baseSize = pipeBase ? baseRingScale(config, t, spec) : 0;
    if (baseSize) lo = t.y0 + spec.r * baseSize * 1.16 * (1 + 0.45 * Math.cos(spec.lean || 0)) + 0.02;
    else if (pipeBase && spec) baseDropped = true;
    let hi = t.y0 + sideH - 0.015;
    let why = '';
    if (drip && !fenced) {
      // a calda desce até 74% da lateral: as peças da lateral ficam abaixo das gotas mais compridas
      const reachDown = dripReach(t) + 0.03;
      hi = t.y0 + sideH - reachDown;
      why = 'calda';
    }
    if (vintage && !fenced && !drip && !t.naked) {
      const sag = Math.min(0.3, sideH * 0.44);
      const under = t.y0 + sideH - 0.05 - sag - 0.045;
      if (under < hi) {
        hi = under;
        why = 'guirlanda';
      }
    }
    if (t.isTop && base.pipeTop && (pipeStyle === 'babado' || pipeStyle === 'folhas') && !fenced) hi = Math.min(hi, t.y0 + sideH - 0.06);
    return { t, sideH, lo, hi, why, out: fenceOut };
  });
  if (vintage && drip && !fenced) say('Com a calda escorrendo, o acabamento vintage fica só com as conchas da borda: as guirlandas da lateral ficariam por cima das gotas.');
  if (baseDropped) say('Com a calda chegando perto do pé do bolo, o bico da base não é aplicado neste bolo.');
  // a cerca de chocolate passa 1 cm da borda do topo: nada no topo (nem no ar, logo acima) encosta nela
  if (fenced) {
    const wall = cleanOffset(m.frost, 0.034 + fenceAway);
    const n = Math.max(12, Math.round(wall.length / 0.055));
    const pt = {};
    for (let i = 0; i < n; i++) {
      pathAt(wall, (i / n) * wall.length, pt);
      occ.addCyl(own('wafer'), pt.x, pt.z, 0.036, topY - 0.2, topY + 0.135, 'fence');
    }
  }
  const sideOf = (y) => sides.find((s) => y >= s.t.y0 && y <= s.t.y0 + s.t.Ht) || sides[0];
  let sideLimited = '';
  /** Peça na lateral: centro a `depth` da parede, na direção theta (a partir do eixo do bolo). */
  const wallAt = (s, theta, depth) => {
    const dist = rayHit(s.t.frost, 0, 0, theta) + s.out + depth;
    return { x: Math.cos(theta) * dist, z: Math.sin(theta) * dist, ox: Math.cos(theta), oz: Math.sin(theta) };
  };

  /* ── quem fica em que zona ── */
  const zones = {};
  let centerTaken = has('velas') || has('topo') || Boolean(message) || named || has('baloes') || has('pirulitos') || Boolean(script);
  items.forEach((id) => {
    const arr = opt(id).arr;
    if (arr === 'centro') {
      zones[id] = 'center';
      centerTaken = true;
    } else if (arr === 'coroa') zones[id] = 'crown';
    else if (arr === 'meialua') zones[id] = 'half';
    else if (arr === 'espalhado') zones[id] = 'scatter';
    else if (arr === 'cascata') zones[id] = 'cascade';
    else if (arr === 'palito' || arr === 'frente' || arr === 'lateral') zones[id] = arr;
  });
  const autos = items.filter((id) => id !== 'velas' && opt(id).arr === 'auto');
  if (autos.length === 1) zones[autos[0]] = centerTaken ? 'crown' : 'center';
  else {
    autos.forEach((id, i) => {
      if (i < 2) zones[id] = 'half';
      else zones[id] = centerTaken ? 'crown' : 'center';
    });
  }
  // laço na frente: precisa de lateral livre; com calda ou guirlanda ocupando a lateral, ele sobe para o topo
  if (zones.lacos === 'frente') {
    const s = sides[sides.length - 1];
    if ((s.hi - s.lo) / 0.62 < 0.45) {
      zones.lacos = 'center';
      say(`O laço foi para o topo do bolo: na lateral ele ficaria por cima ${s.why === 'calda' ? 'da calda' : s.why === 'guirlanda' ? 'das guirlandas' : 'do acabamento'}.`);
    }
  }

  const ringIds = () => items.filter((id) => zones[id] === 'crown' || zones[id] === 'half');
  const bandOf = (id) => {
    const sp = SPEC[id];
    if (!sp) return 0.25;
    if (id === 'flores') return 0.38 * Math.min(1.3, 0.74 + rho * 0.42);
    if (id === 'peonias') {
      const ps = clamp(0.74 + rho * 0.5, 0.95, 1.36);
      return 2 * 0.268 * 0.82 * (Math.min(0.2 * ps, (F - 0.02) / 2.2) / 0.2) + 0.01;
    }
    return sp.band;
  };

  // quantos arranjos cabem lado a lado no centro; os demais vão para a coroa (ou meia-lua)
  {
    const centers = items.filter((id) => zones[id] === 'center');
    const ringBand = ringIds().length ? Math.max(...ringIds().map(bandOf)) * 0.8 : 0;
    const room = F - ringBand;
    const maxGroups = room >= 0.78 ? 4 : room >= 0.56 ? 3 : room >= 0.34 ? 2 : 1;
    const moved = [];
    centers.slice(maxGroups).forEach((id) => {
      const arrs = getDecor(id).arrs;
      if (arrs.includes('coroa')) zones[id] = 'crown';
      else if (arrs.includes('meialua')) zones[id] = 'half';
      else return;
      moved.push(id);
    });
    if (moved.length) say(`O centro já estava cheio: ${listOf(moved, true)} ${many(moved) ? 'foram' : 'foi'} para a borda do topo.`);
  }

  /* ── palco: o miolo do topo, por dentro da coroa ── */
  const rings = ringIds();
  const groups = items.filter((id) => zones[id] === 'center');
  const stageBusy = groups.length > 0 || has('velas') || Boolean(script) || Boolean(message) || named || has('topo') || has('baloes') || has('pirulitos') || zones.coracoes === 'palito';
  let ringScale = 1;
  let ringW = 0;
  if (rings.length) {
    const band = Math.max(...rings.map(bandOf));
    let need = 0;
    if (stageBusy) {
      need = 0.16;
      if (groups.length) need = Math.max(need, groups.length === 1 ? 0.26 : groups.length === 2 ? 0.46 : 0.56);
      if (classic) need = Math.max(need, 0.15 + 0.012 * (d.candles || 1)) + (groups.length ? 0.08 : 0);
      if (numero) need = Math.max(need, 0.2 + 0.12 * String(d.number).length) + (groups.length ? 0.12 : 0);
      if (script) need = Math.max(need, 0.34) + (groups.length || has('velas') ? 0.12 : 0);
      if (has('baloes') || has('pirulitos') || message || named) need = Math.max(need, 0.24);
      need = Math.min(need, 0.66 * F);
    }
    const minS = Math.max(...rings.map((id) => SPEC[id]?.minS || 0.75));
    ringScale = clamp((F - need - GAP) / band, minS, 1);
    ringW = band * ringScale + GAP;
    if (ringScale < 0.9) say(`${cap(listOf(rings, true))} ${many(rings) ? 'ficaram' : 'ficou'} em tamanho menor para caber com o resto no topo.`, rings);
  }
  const Fi = Math.max(0.03, Math.min(F, Math.max(F - ringW, Math.min(F * 0.6, 0.2)))); // raio do palco

  /** Melhor disco livre no palco, perto de (px, pz): { x, z, r }. limit = raio máximo a partir do centro do palco. */
  const bestDisc = (px, pz, want, y0, y1, me, limit = Fi) => {
    let best = null;
    const cand = [[px, pz], [cx, cz]];
    for (let k = 1; k <= 5; k++) {
      const rad = (limit * k) / 5;
      const n = 6 + k * 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + k * 0.4;
        cand.push([cx + Math.cos(a) * rad, cz + Math.sin(a) * rad]);
      }
    }
    for (let i = 0; i < cand.length; i++) {
      const [x, z] = cand[i];
      const fromC = Math.hypot(x - cx, z - cz);
      // (folga até a borda medida pelo círculo inscrito: o palco é ele, em qualquer formato)
      let clr = Math.min(rho - fromC - edge, limit - fromC);
      if (clr <= 0.02) continue;
      clr = Math.min(clr, occ.clear(x, z, y0, y1, me) - GAP);
      if (clr <= 0.02) continue;
      const r = Math.min(clr, want);
      const score = r - 0.32 * Math.hypot(x - px, z - pz);
      if (!best || score > best.score) best = { x, z, r, score };
    }
    return best;
  };

  /* ══ 1. Topos espetados: nome em acrílico, plaquinha, estrelas, balões ══ */
  const backDepth = Math.min(0.34, 0.36 * rho);
  let depthP = Math.min(backDepth, Fi - 0.03);
  let depthN = Math.min(backDepth + (message ? 0.045 : 0), Fi - 0.02);
  if (named && message) depthP = depthN - 0.09;
  const ringH = rings.length ? Math.max(...rings.map((id) => (SPEC[id]?.h || 0.2) * ringScale)) : 0;
  const plaqueTopY = message ? base.plaqueLift + (splitMessage(message).length > 1 ? 0.52 : 0.36) : 0;

  if (message) {
    const ps = plaqueSize(message, rho);
    const zP = cz - depthP;
    const lift = base.plaqueLift;
    const stickX = Math.max(0, Math.min(ps.w * 0.3, maxX(zP, 0.02) - 0.005));
    const o = own('toppers:placa');
    const vol = [
      ...VOL.board(cx, zP, topY + lift, topY + lift + ps.h, ps.w, 0.028, 0.08, topY + lift + ps.h / 2, 'air:placa'),
      ...VOL.stick(cx - stickX, topY, zP - 0.012, cx - stickX, topY + lift + 0.03, zP - 0.012, 0.013, 'stick:placa'),
      ...VOL.stick(cx + stickX, topY, zP - 0.012, cx + stickX, topY + lift + 0.03, zP - 0.012, 0.013, 'stick:placa'),
    ];
    reserve(o, vol);
    party.plaque = { x: cx, z: zP, w: ps.w, h: ps.h, lines: ps.lines, lift, stickX, vol };
  }

  if (named) {
    const lines = topperLines(d.topper.text);
    const chars = Math.max(...lines.map((s) => s.length));
    const two = lines.length > 1;
    const free0 = Math.max(0.1, rho - (base.border + 0.035));
    const tight = Boolean(message) || has('topo');
    const size = topperSize(chars, free0, tight);
    const totalW = 0.3 + 0.5 * chars; // largura do texto em "em" (estimativa: a medida de verdade é do construtor)
    const emCap = two ? 0.48 : 0.6;
    const em = Math.min(size / totalW, emCap);
    const zN = cz - depthN;
    const maxW = Math.max(0.3, Math.min(size, em * totalW * 1.12, 2 * rimX(zN)));
    const maxEm = Math.min(emCap, em * 1.25);
    // altura da linha de base: por cima da plaquinha, das velas e do que estiver na coroa por baixo das pontas
    let lift = 0.22;
    if (message) lift = plaqueTopY + 0.1;
    else if (has('velas')) lift = faisca ? 0.36 : numero ? 0.86 : 0.6;
    else if (has('topo')) lift = 0.3;
    if (groups.length) lift = Math.max(lift, 0.34);
    if (rings.length && maxW / 2 > maxX(zN, 0) - ringW + 0.02) lift = Math.max(lift, ringH + 0.33 * maxEm + 0.05);
    const bottom = lift - 0.33 * maxEm;
    const high = lift + (two ? 1.7 : 0.9) * maxEm;
    const stakeX = maxW > 0.56 ? Math.max(0, Math.min(0.3 * maxW, maxX(zN, 0.02) - 0.005)) : 0;
    const tilt = message ? 0.05 : 0.09;
    const o = own('toponome');
    const vol = VOL.board(cx, zN, topY + bottom, topY + high, maxW, 0.03, tilt, topY, 'air');
    (stakeX ? [-stakeX, stakeX] : [0]).forEach((sx) => vol.push(...VOL.stick(cx + sx, topY, zN, cx + sx, topY + bottom + 0.02, zN - Math.sin(tilt) * bottom, 0.036, 'stick')));
    reserve(o, vol);
    party.topper = { x: cx, z: zN, maxW, maxEm, lift, stakeX, tilt, bottom, high, two };
  }

  let textDepth = 0; // profundidade guardada para a escrita (quando ela divide o topo com o que vai no meio)
  const groupDiscs = []; // discos dos arranjos do centro
  /* velas clássicas: roda no meio livre, em volta do arranjo do centro, em arco — o primeiro formato que couber */
  const placeCandles = () => {
    const n = clamp(Math.round(d.candles || 1), 1, 9);
    const h = message ? 0.4 : 0.5;
    const o = own('velas');
    const y0 = topY - 0.03;
    const volOf = (x, z) => VOL.candle(x, y0, z, h);
    const arc = (ox2, oz2, rad, mid, span) => {
      const out = [];
      for (let i = 0; i < n; i++) {
        const a = n === 1 ? mid : span >= TAU - 1e-3 ? mid + ((i + 0.5) / n) * TAU : mid + (i / (n - 1) - 0.5) * span;
        out.push([ox2 + Math.cos(a) * rad, oz2 + Math.sin(a) * rad]);
      }
      return out;
    };
    const ok = (pts) => {
      for (let i = 0; i < pts.length; i++) {
        if (!inside(pts[i][0], pts[i][1], 0.04)) return false;
        if (Math.hypot(pts[i][0] - cx, pts[i][1] - cz) > Fi - 0.035 + 1e-6 && rings.length) return false;
        for (let j = 0; j < i; j++) if (Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) < 0.074) return false;
        if (!fits(o, volOf(pts[i][0], pts[i][1]))) return false;
      }
      return true;
    };
    const midR = groupDiscs.length === 1 ? groupDiscs[0].r : groupDiscs.length ? Math.max(...groupDiscs.map((g) => Math.hypot(g.x - cx, g.z - cz) + g.r)) : 0;
    const midC = groupDiscs.length === 1 ? groupDiscs[0] : { x: cx, z: cz };
    const variants = [];
    const F0 = Math.PI / 2;
    if (!groupDiscs.length) {
      // meio livre: roda de velas (ou uma só) no centro do palco livre
      const want = n === 1 ? 0.06 : Math.max(0.13, (n * 0.105) / TAU + 0.08);
      const zPref = cz - (textDepth && !round ? textDepth * 0.5 : 0) + ((message || named || has('baloes')) && !textDepth ? 0.1 * Fi : 0) - (has('topo') && !message && !named ? 0 : 0);
      const M = bestDisc(cx, zPref, want + 0.04, y0, y0 + h + 0.12, o);
      if (M) {
        [1, 0.86, 0.72].forEach((q) => {
          const rad = n === 1 ? 0 : Math.min(want * q, M.r - 0.04);
          if (n === 1 || rad >= Math.max(0.05, (n * 0.076) / TAU)) variants.push(arc(M.x, M.z, rad, F0, TAU));
        });
      }
    } else {
      const rad = midR + 0.065;
      variants.push(arc(midC.x, midC.z, rad, F0, TAU));
      [3.6, 2.8, 2.2, 1.7].forEach((sp) => variants.push(arc(midC.x, midC.z, rad, F0, Math.min(sp, ((n - 1) * 0.105) / rad + 0.6))));
      [3.4, 2.4].forEach((sp) => variants.push(arc(midC.x, midC.z, rad, -F0, sp)));
    }
    // arcos junto à beira do palco: na frente, depois atrás
    [Fi - 0.045, Fi - 0.1, Fi * 0.7].forEach((rad) => {
      if (rad < 0.06) return;
      [F0, -F0].forEach((mid) => {
        [0.115, 0.095, 0.08].forEach((gap) => {
          const span = Math.min(2.7, ((n - 1) * gap) / rad);
          if (span >= 2.7 && n > 1 && ((n - 1) * 0.076) / rad > 2.7) return;
          variants.push(arc(cx, cz, rad, mid, span));
        });
      });
    });
    let pts = variants.find(ok);
    if (!pts) {
      // último recurso: procura lugares livres um a um, da frente para trás
      pts = [];
      const cand = [];
      // primeiro por dentro do palco; se faltar lugar, também na faixa da coroa (as velas vêm antes dela)
      const radii = [];
      for (let rad = Fi - 0.04; rad > 0.02; rad -= 0.07) radii.push(rad);
      for (let rad = Fi + 0.03; rad <= F - 0.04; rad += 0.07) radii.push(rad);
      radii.forEach((rad) => {
        const m2 = Math.max(6, Math.floor((TAU * rad) / 0.085));
        for (let i = 0; i < m2; i++) {
          const a = F0 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (TAU / m2);
          cand.push([cx + Math.cos(a) * rad, cz + Math.sin(a) * rad]);
        }
      });
      cand.push([cx, cz]);
      for (let i = 0; i < cand.length && pts.length < n; i++) {
        const [x, z] = cand[i];
        if (!inside(x, z, 0.04) || pts.some((q) => Math.hypot(q[0] - x, q[1] - z) < 0.074) || !fits(o, volOf(x, z))) continue;
        pts.push([x, z]);
      }
    }
    pts.forEach(([x, z]) => reserve(o, volOf(x, z)));
    party.candles = { h, y0, spots: pts.map(([x, z]) => ({ x, z, vol: volOf(x, z) })), center: !groupDiscs.length };
    if (pts.length < n) {
      notes.unfit.push(
        pts.length
          ? `Só ${pts.length === 1 ? 'coube 1 vela' : `couberam ${pts.length} velas`} das ${n} no topo deste bolo. Tire uma decoração do topo ou escolha um bolo maior.`
          : 'As velas não couberam no topo deste bolo com as outras peças. Tire uma decoração do topo ou escolha um bolo maior.',
      );
      notes.unfitIds.push('velas');
    }
  };
  // topo pequeno, sem arranjo no centro: as velas (que não podem faltar) escolhem lugar antes das estrelas e dos balões
  if (classic && F < 0.36 && !groups.length) placeCandles();

  if (has('topo')) {
    const o = own('toppers:estrela');
    const k = Math.min(1.1, 0.7 + rho * 0.35);
    const up = base.plaqueLift - 0.34;
    const zP = cz - depthP;
    const tryStar = (x, z, height, size, roll) => {
      if (!inside(x, z, 0.014)) return false;
      const vol = [...VOL.star(x, topY + height, z, size, roll), ...VOL.stick(x, topY, z - 0.004, x, topY + height - size * 0.4, z - 0.004, 0.013, 'stick:estrela')];
      if (!fits(o, vol)) return false;
      reserve(o, vol);
      party.stars.push({ x, z, height, size, roll, vol });
      return true;
    };
    // conjuntos possíveis, do preferido ao de reserva; fica o que encaixar mais estrelas
    const sets = [];
    if (message) {
      const ph = party.plaque.w / 2;
      const room = maxX(zP, 0.02);
      sets.push([
        [-(ph + 0.13), 0.02, (named ? 0.5 : 0.64) + up, 0.15, -0.2],
        [ph + 0.12, 0, (named ? 0.44 : 0.5) + up, 0.115, 0.25],
        [ph + 0.2, 0.1, 0.3 + up * 0.6, 0.08, -0.15],
      ].map(([dx, dz, h, sz, roll]) => [cx + clamp(dx, -room, room), zP + dz, h, sz, roll]));
      // topo estreito: estrelas baixas à frente da plaquinha
      sets.push([
        [-Math.min(room, ph * 0.7), 0.16, 0.2, 0.09 * k, -0.2],
        [Math.min(room, ph * 0.7), 0.16, 0.17, 0.08 * k, 0.25],
      ].map(([dx, dz, h, sz, roll]) => [cx + dx, zP + dz, h, sz, roll]));
    } else if (named) {
      const zS = party.topper.z + 0.16;
      const lim = maxX(zS, 0.02) - 0.01;
      sets.push([
        [-lim, 0.0, Math.min(0.4 * k, party.topper.bottom - 0.14 * k), 0.13 * k, -0.25],
        [lim, -0.03, Math.min(0.33 * k, party.topper.bottom - 0.12 * k), 0.105 * k, 0.28],
        [lim - 0.17 * k, 0.12, 0.2 * k, 0.08 * k, -0.15],
      ].map(([dx, dz, h, sz, roll]) => [cx + dx, zS + dz, Math.max(0.12, h), sz, roll]));
    } else {
      // sozinhas: no centro (ou atrás do que estiver no centro)
      const crowded = groups.length > 0 || has('velas') || Boolean(script);
      const zS = cz - (crowded ? Math.min(0.55 * Fi, Fi - 0.06) : 0.14 * rho);
      const half = Math.max(0.05, Math.min(0.24 * k, maxX(zS, 0.02) - 0.02));
      [1, 0.8].forEach((q) => {
        sets.push([
          [0, 0, 0.78 * k * q, 0.2 * k * q, 0.05],
          [-half, 0.07, 0.52 * k * q, 0.13 * k * q, -0.3],
          [half * 0.96, 0.06, 0.4 * k * q, 0.105 * k * q, 0.28],
        ].map(([dx, dz, h, sz, roll]) => [cx + dx, zS + dz, h, sz, roll]));
      });
    }
    let done = false;
    for (let i = 0; i < sets.length && !done; i++) {
      const test = sets[i].filter(([x, z, h, sz, roll]) => inside(x, z, 0.014) && fits(o, [...VOL.star(x, topY + h, z, sz, roll), ...VOL.stick(x, topY, z - 0.004, x, topY + h - sz * 0.4, z - 0.004, 0.013, 'stick:estrela')]));
      if (test.length === sets[i].length || i === sets.length - 1) {
        sets[i].forEach(([x, z, h, sz, roll]) => tryStar(x, z, h, sz, roll));
        done = true;
      }
    }
    if (!party.stars.length) {
      notes.unfitIds.push('topo');
    } else if (party.stars.length < 3) say('O topo de estrelas ficou com menos estrelas para não encostar nas outras peças.');
  }

  /** Fileira de peças no palito: tenta posições simétricas, do meio para fora, em várias profundidades. */
  const stickRows = (id, want, { depths, gap, make, minCount = 1 }) => {
    const placed = [];
    const o = own(id);
    for (let di = 0; di < depths.length && placed.length < want; di++) {
      const z = cz - clamp(depths[di], -(Fi - 0.04), Fi - 0.04);
      const half = maxX(z, 0.02) - Math.max(0, F - Fi) * 0.0;
      const lim = Math.min(half, Math.sqrt(Math.max(0.0004, Fi * Fi - (z - cz) ** 2)) + (round ? 0 : half));
      const left = want - placed.length;
      // posições: ímpar → 0, ±g, ±2g…; par → ±g/2, ±3g/2…
      const xs = [];
      const odd = left % 2 === 1;
      for (let k = 0; k < 12; k++) {
        const x = odd ? k * gap : (k + 0.5) * gap;
        if (x > lim) break;
        if (odd && k === 0) xs.push([0]);
        else xs.push([-x, x]);
      }
      for (let k = 0; k < xs.length && placed.length < want; k++) {
        const group = xs[k];
        if (group.length === 2 && want - placed.length < 2) continue;
        const pieces = group.map((x) => make(cx + x, z, clamp(x / Math.max(lim, gap), -1, 1), placed.length + (x > 0 ? 1 : 0)));
        if (pieces.some((p) => !p || !fits(o, p.vol))) continue; // em pares: ou cabem os dois, ou nenhum (simetria)
        pieces.forEach((p) => {
          reserve(o, p.vol);
          placed.push(p);
        });
      }
    }
    if (placed.length >= minCount) placed.sort((a, b) => a.x - b.x).forEach((p) => P(id).pieces.push(p));
    else placed.length = 0;
    return placed;
  };

  if (has('baloes')) {
    const k = qty('baloes');
    const want0 = k < 1 ? 3 : k > 1 ? 7 : 5;
    const o = own('baloes');
    const r = rng(hashString(`baloes${m.shape}${m.R}`));
    const run = (s, gap) => {
      const boards = Boolean(message) || named;
      const back = Math.min(Fi - 0.04, Math.max(0.36 * rho, (boards ? depthN + 0.2 : 0)));
      const depths = boards ? [back, Fi - 0.04, 0.36 * rho, depthP - 0.22] : [0.36 * rho, Math.min(Fi - 0.04, 0.62 * Fi), 0.1 * rho];
      const want = Math.max(2, Math.min(want0, Math.round(want0 * clamp(F / 0.62, 0.4, 1))));
      return stickRows('baloes', want, {
        depths,
        gap,
        minCount: 1,
        make: (x, z, j, i) => {
          let h = 0.4 + (i % 2 ? 0.27 : 0) + 0.06 * (1 - Math.abs(j)) + (r() - 0.5) * 0.03;
          const lean = j * 0.3 * Math.min(1, want / 4) + (r() - 0.5) * 0.06;
          const back2 = -0.06 - r() * 0.06;
          const l = Math.hypot(Math.sin(lean), Math.cos(lean), back2);
          const ax = Math.sin(lean) / l;
          const ay = Math.cos(lean) / l;
          const az = back2 / l;
          // sobe o balão se houver uma placa ou outro balão no caminho
          for (let tries = 0; tries < 4; tries++) {
            const vol = VOL.balloon(x + ax * h, topY + ay * h, z + az * h, ax, ay, az, s);
            if (fits(o, vol)) break;
            h += 0.17;
            if (h > 1.02) return null;
          }
          const vol = [...VOL.balloon(x + ax * h, topY + ay * h, z + az * h, ax, ay, az, s), ...VOL.stick(x, topY, z, x + ax * h, topY + ay * h, z + az * h, 0.014)];
          return { t: 'balloon', x, z, h, ax, ay, az, s, j, vol };
        },
      });
    };
    let got = run(1, 0.2);
    if (got.length < Math.min(3, want0)) {
      const o2 = own('baloes');
      occ.release(o2);
      P('baloes').pieces.length = 0;
      got = run(0.78, 0.17);
      if (got.length) P('baloes').scale = 0.78;
    }
    P('baloes').want = want0;
    P('baloes').zone = 'palito';
  }

  /* ══ 2. O meio do palco: arranjos do centro, velas, escrita ══ */
  // reserva provisória da frente para a escrita (quando ela divide o topo com o que vai no meio)
  const midBusy = groups.length > 0 || has('velas') || (has('topo') && !message && !named);
  const RES = own('~reserva');
  const textOf = () => {
    const text = String(script).trim().slice(0, 24);
    const bastao = d.script === 'bastao';
    const adv = bastao ? 0.66 : 0.41; // avanço médio por letra (em)
    const ex = 0.07;
    const block = (parts) => ({ n: parts.length, wb: Math.max(...parts.map((s) => 0.16 + adv * s.length)) + 2 * ex, hb: (parts.length > 1 ? 2.1 : 1.05) + 2 * ex });
    const one = block([text]);
    let two = null;
    for (let i = 1; i < text.length - 1; i++) {
      if (text[i] !== ' ') continue;
      const b = block([text.slice(0, i).trim(), text.slice(i + 1).trim()]);
      if (!two || b.wb < two.wb) two = b;
    }
    return { text, bastao, one, two, smax: bastao ? 0.34 : 0.42 };
  };
  // onde a escrita pode ficar: dentro da borda de bico, por dentro da coroa (se houver) e longe de qualquer peça
  const TXT = own('escrita');
  const stageIn = (x, z) => !rings.length || Math.hypot(x - cx, z - cz) + edge + ringW <= rho || (!round && sd(x, z) >= edge + ringW - 1e-6);
  // (loose: se não couber por dentro da coroa, a mensagem pode avançar sobre a faixa dela — a coroa abre espaço)
  const textFree = (x, z, loose = false) => inside(x, z, 0.03) && (loose || stageIn(x, z)) && !occ.hitCyl(x, z, 0.03, topY - 0.01, topY + 0.05, GAP, TXT);
  const rectFree = (xc, zc, hw, hh, loose) => {
    const nx = Math.max(2, Math.ceil((2 * hw) / 0.07));
    const nz = Math.max(2, Math.ceil((2 * hh) / 0.07));
    // primeiro os quatro cantos (o que mais barra); depois a moldura inteira (contorno do topo) e o miolo (peças)
    for (let i = 0; i <= 1; i++) for (let j = 0; j <= 1; j++) if (!textFree(xc - hw + 2 * hw * i, zc - hh + 2 * hh * j, loose)) return false;
    for (let i = 0; i <= nx; i++) {
      for (let j = 0; j <= nz; j++) {
        const x = xc - hw + (2 * hw * i) / nx;
        const z = zc - hh + (2 * hh * j) / nz;
        const rim = i === 0 || j === 0 || i === nx || j === nz;
        if (rim ? !textFree(x, z, loose) : occ.hitCyl(x, z, 0.03, topY - 0.01, topY + 0.05, GAP, TXT)) return false;
      }
    }
    return true;
  };
  const zBack = cz - reach(-Math.PI / 2, edge + 0.03);
  const zFront = cz + reach(Math.PI / 2, edge + 0.03);
  /** O maior texto reto (uma ou duas linhas) que cabe ao longo do eixo do bolo, de preferência perto de zPref. */
  const fitFlat = (T, sCap, zPref, loose = false) => {
    let best = null;
    const blocks = T.two ? [T.one, T.two] : [T.one];
    blocks.forEach((b) => {
      for (let i = 0; i <= 32; i++) {
        const zc = zBack + ((zFront - zBack) * i) / 32;
        let lo = 0.07;
        let hi = sCap;
        if (!rectFree(cx, zc, (b.wb * lo) / 2, (b.hb * lo) / 2, loose)) continue;
        if (rectFree(cx, zc, (b.wb * hi) / 2, (b.hb * hi) / 2, loose)) lo = hi;
        else {
          for (let q = 0; q < 8; q++) {
            const mid = (lo + hi) / 2;
            if (rectFree(cx, zc, (b.wb * mid) / 2, (b.hb * mid) / 2, loose)) lo = mid;
            else hi = mid;
          }
        }
        // duas linhas só quando a letra fica bem maior
        const score = lo * (b.n > 1 ? 0.84 : 1) * (1 - (0.3 * Math.abs(zc - zPref)) / rho);
        if (!best || score > best.score) best = { mode: 'flat', s: lo, x: cx, z: zc, hw: (b.wb * lo) / 2, hh: (b.hb * lo) / 2, lines: b.n, score };
      }
    });
    return best;
  };
  /** Cobre um retângulo com discos pequenos (os cantos também). */
  const coverRect = (o, q, y0, y1, kind) => {
    const rc = Math.min(0.05, q.hh, q.hw);
    const nx = Math.max(1, Math.ceil((2 * q.hw) / (rc * 1.5)));
    const nz = Math.max(1, Math.ceil((2 * q.hh) / (rc * 1.5)));
    for (let i = 0; i <= nx; i++) {
      for (let j = 0; j <= nz; j++) occ.addCyl(o, q.x - q.hw + rc * 0.7 + ((2 * q.hw - rc * 1.4) * i) / nx, q.z - q.hh + rc * 0.7 + ((2 * q.hh - rc * 1.4) * j) / nz, rc, y0, y1, kind);
    }
  };
  // A mensagem tem prioridade sobre os arranjos: antes de pôr o que vai no meio, o lugar dela fica guardado
  // (num tamanho de letra modesto); depois de tudo colocado, ela cresce até onde der.
  if (script && midBusy) {
    const T = textOf();
    const sShare = clamp((1.2 * Fi) / T.one.wb, 0.09, 0.2);
    if (round && (T.one.wb * sShare * 0.5) / Math.max(0.1, Fi - (T.one.hb * sShare) / 2) <= 1.15) {
      // redondo: faixa em arco junto à frente
      textDepth = clamp(T.one.hb * sShare + 0.03, 0.17, 0.62 * Fi);
      const rad = Fi - textDepth / 2;
      const span = Math.min(1.2, (T.one.wb * sShare * 0.5) / Math.max(0.1, rad) + 0.15);
      const n = Math.max(3, Math.ceil((2 * span * rad) / (textDepth * 0.8)));
      for (let i = 0; i <= n; i++) {
        const a = Math.PI / 2 - span + (2 * span * i) / n;
        occ.addCyl(RES, cx + Math.cos(a) * rad, cz + Math.sin(a) * rad, textDepth / 2, topY, topY + 0.3);
      }
    } else {
      // demais formatos (e texto comprido demais para o arco): o melhor retângulo, de preferência na frente
      let hold = fitFlat(T, sShare, zFront - 0.12);
      if (!hold || hold.s < 0.085) hold = fitFlat(T, sShare, zFront - 0.12, true) || hold;
      if (hold) {
        coverRect(RES, { x: hold.x, z: hold.z, hw: hold.hw + 0.015, hh: hold.hh + 0.015 }, topY, topY + 0.3, 'region');
        textDepth = 2 * hold.hh + 0.03;
      }
    }
  }
  // velas de número na frente do arranjo: reserva provisória de uma faixa
  let numS = 0;
  if (numero) {
    const digits = String(d.number).replace(/\D/g, '').slice(0, 3);
    numS = message ? 0.44 : 0.5;
    const span = (s) => digits.length * 0.66 * s + (digits.length - 1) * 0.07 * s;
    const room = 2 * Fi * (groups.length ? 0.8 : 0.94) - 0.04;
    if (span(numS) > room) numS = Math.max(0.3, (numS * room) / span(numS));
  }

  /* velas de número: escolhem lugar antes dos arranjos do centro (não podem faltar) — na frente do palco quando
     há arranjo no meio, senão no meio; diminuem só o necessário para caber */
  if (numero) {
    const digits = String(d.number).replace(/\D/g, '').slice(0, 3);
    const o = own('velas');
    const tryAt = (x, z, sz) => {
      const w = digits.length * 0.66 * sz + (digits.length - 1) * 0.07 * sz;
      const y0 = topY - 0.022 * (sz / 0.5);
      const vol = VOL.board(x, z, y0 + 0.022 * (sz / 0.5), y0 + sz, w, 0.1 * sz, 0, y0, 'solid');
      // chamas: uma por algarismo (o lugar exato é do construtor; a faixa acima dos algarismos fica reservada)
      const fl = VOL.board(x, z, y0 + sz, y0 + sz + 0.15, w, 0.045, 0, y0, 'fx');
      if (!fits(o, vol) || !fits(o, fl)) return null;
      return { x, z, s: sz, w, y0, vol: [...vol, ...fl] };
    };
    const zWant = groups.length ? cz + Fi - 0.14 : cz + ((message || named || has('baloes')) ? Math.min(0.12, 0.14 * rho) : 0) - (textDepth ? (round ? 0.16 * rho : textDepth * 0.5) : 0);
    const cand = [];
    [1, 0.86, 0.72, 0.6, 0.5].forEach((q) => {
      const sz = numS * q;
      if (sz < 0.24) return;
      for (let z = zBack + 0.05; z <= zFront - 0.05; z += 0.04) cand.push({ z, sz, score: q - (0.4 * Math.abs(z - zWant)) / Math.max(0.2, F) });
      cand.push({ z: zWant, sz, score: q });
    });
    cand.sort((p1, p2) => p2.score - p1.score);
    let got = null;
    for (let i = 0; i < cand.length && !got; i++) got = tryAt(cx, cand[i].z, cand[i].sz);
    if (got) {
      reserve(o, got.vol);
      party.numbers = { ...got, digits };
      if (got.s < 0.4) say('As velas de número ficaram menores para caber no topo.');
    } else {
      notes.unfit.push('As velas de número não couberam no topo com as outras peças. Tire uma decoração do topo ou escolha um bolo maior.');
      notes.unfitIds.push('velas');
    }
  }

  /* arranjos do centro */
  if (groups.length) {
    const backUsed = Boolean(message) || named || has('baloes');
    const frontNeed = 0; // (as velas de número já têm lugar: o arranjo se acomoda atrás delas)
    const zPref = cz + (backUsed ? 0.08 * Fi : 0) - (textDepth && !round ? textDepth * 0.5 : 0) - (party.numbers ? 0.1 : 0);
    const o = own('~grupo');
    let M = bestDisc(cx, zPref, Fi, topY, topY + 0.32, o);
    if (M && frontNeed) {
      // deixa a frente para os algarismos
      const cut = Math.min(frontNeed, M.r * 0.6);
      M = { x: M.x, z: M.z - cut / 2, r: M.r - cut / 2 };
    }
    if (M && classic && M.r - 0.075 >= 0.115) M.r -= 0.075; // o arranjo encolhe um pouco: as velas dão a volta nele
    if (!M || M.r < 0.07) {
      groups.forEach((id) => {
        P(id).unfit = true;
        P(id).zone = 'center';
      });
    } else {
      const n = groups.length;
      const wide = m.shape === 'rect' && n === 2;
      // círculos iguais dentro do disco livre: 2 lado a lado, 3 em triângulo (um na frente), 4 em quadrado
      const layout =
        n === 1
          ? [[0, 0, 1]]
          : n === 2
            ? [[-0.5, 0, 0.5], [0.5, 0, 0.5]]
            : n === 3
              ? [[-0.464, -0.268, 0.464], [0.464, -0.268, 0.464], [0, 0.536, 0.464]]
              : [[-0.414, -0.414, 0.414], [0.414, -0.414, 0.414], [-0.414, 0.414, 0.414], [0.414, 0.414, 0.414]];
      groups.forEach((id, i) => {
        const [fx, fz, fr] = layout[Math.min(i, layout.length - 1)];
        let gx = M.x + fx * M.r;
        const gz = M.z + fz * M.r;
        let gr = M.r * fr - (n > 1 ? GAP * 0.75 : 0);
        if (wide) {
          // retangular: dois arranjos lado a lado aproveitam o comprimento
          const hx = maxX(M.z, M.r) + M.r;
          gr = Math.min(Fi, (hx - GAP) / 2, M.r);
          gx = cx + (i ? 1 : -1) * (gr + GAP * 0.75);
        }
        groupDiscs.push({ id, x: gx, z: gz, r: gr });
      });
      if (n > 1) say(`${cap(listOf(groups, true))} dividem o centro do bolo, lado a lado.`);
    }
  }

  /* Montinho genérico: uma peça no meio e anéis em volta; por cima, peças apoiadas nos vãos. */
  const pileSpots = (g, size, count, rise, minS) => {
    const r = rng(hashString(`pile${size}${count}${m.shape}${m.R}`));
    // 1) uma peça no meio e anéis em volta (cabe pelo menos o primeiro anel)
    const full = g.r / (3.06 * size);
    if (count >= 4 && full >= minS) {
      const s = Math.min(1, full);
      const sz = size * s;
      const spots = [{ x: g.x, z: g.z, ox: 0, oz: 1, level: 0, center: true }];
      let ringR = sz * 2.05;
      let ringN = 0;
      let a0 = 0;
      while (spots.length < count && ringR + sz <= g.r + 1e-4) {
        const per = Math.max(3, Math.floor((TAU * ringR) / (sz * 2.08)));
        const ph = r() * TAU;
        if (!ringN) {
          ringN = Math.min(per, count - 1);
          a0 = ph;
        }
        for (let i = 0; i < per && spots.length < count; i++) {
          const a = ph + (i / per) * TAU;
          spots.push({ x: g.x + Math.cos(a) * ringR, z: g.z + Math.sin(a) * ringR, ox: Math.cos(a), oz: Math.sin(a), level: 0 });
        }
        ringR += sz * 1.95;
      }
      if (rise && ringN >= 3) {
        // por cima, peças apoiadas nos vãos entre a do meio e as do primeiro anel
        const per = Math.max(3, Math.floor((TAU * 2.05) / 2.08));
        const tops = clamp(Math.round((spots.length - 1) / 3), 1, Math.min(3, Math.floor(ringN / 2)));
        for (let i = 0; i < tops; i++) {
          const a = a0 + ((Math.round((i * per) / tops) + 0.5) / per) * TAU;
          spots.push({ x: g.x + Math.cos(a) * sz * 1.16, z: g.z + Math.sin(a) * sz * 1.16, ox: Math.cos(a), oz: Math.sin(a), level: 1, rise: rise * s });
        }
      }
      return { s, spots };
    }
    // 2) lugar apertado: três peças encostadas, em triângulo (e uma por cima, no vão, se a decoração empilha)
    const tri = g.r / (2.17 * size);
    if (count >= 3 && tri >= minS) {
      const s = Math.min(1, tri);
      const sz = size * s;
      const spots = [];
      for (let i = 0; i < 3; i++) {
        const a = Math.PI / 2 + (i / 3) * TAU;
        spots.push({ x: g.x + Math.cos(a) * sz * 1.165, z: g.z + Math.sin(a) * sz * 1.165, ox: Math.cos(a), oz: Math.sin(a), level: 0 });
      }
      if (rise && count >= 4) spots.push({ x: g.x, z: g.z, ox: 0, oz: 1, level: 1, rise: rise * s * 0.86, center: true });
      return { s, spots };
    }
    // 3) duas lado a lado · 4) uma só
    const duo = g.r / (2.03 * size);
    if (count >= 2 && duo >= minS) {
      const s = Math.min(1, duo);
      const sz = size * s * 1.012;
      return { s, spots: [{ x: g.x - sz, z: g.z, ox: -1, oz: 0, level: 0 }, { x: g.x + sz, z: g.z, ox: 1, oz: 0, level: 0 }] };
    }
    const s = Math.min(1, g.r / size);
    if (s < minS * 0.9) return { s: 0, spots: [] };
    return { s, spots: [{ x: g.x, z: g.z, ox: 0, oz: 1, level: 0, center: true }] };
  };

  const R = (seed) => rng(hashString(`${seed}${m.shape}${m.R}${items.join()}`));
  const flowerScale = Math.min(1.3, 0.74 + rho * 0.42);
  const peonyScale = clamp(0.74 + rho * 0.5, 0.95, 1.36);

  /** Compõe o arranjo de centro de uma decoração dentro do disco g. */
  const composeCenter = (id, g) => {
    const pl = P(id);
    pl.zone = 'center';
    pl.group = g;
    const k = qty(id);
    const r = R(`centro${id}`);
    const o = own(id);
    const add = (piece) => put(id, piece);
    if (id === 'frutas') {
      // morango em pé no meio, anéis de morangos deitados e frutas pequenas nos vãos
      const want = clamp(0.52 * rho, 0.25, 0.62) * (k < 1 ? 0.75 : k > 1 ? 1.15 : 1);
      const gr = Math.min(g.r, want);
      let s = clamp(gr / 0.36, 0.72, gr < 0.56 ? 1.1 : 1);
      if (gr < 0.125 * 0.72) return void (pl.unfit = true);
      if (gr < 0.26) s = clamp(gr / 0.13, 0.72, 1);
      add({ t: 'U', x: g.x, z: g.z, y: topY + 0.145 * 1.12 * s, s: 1.12 * s, vol: VOL.berryUp(g.x, topY + 0.145 * 1.12 * s, g.z, 1.12 * s) });
      let ringR = 0.2 * s;
      let ringI = 0;
      while (ringR + 0.155 * s <= gr) {
        const n = Math.max(5, Math.round((TAU * ringR) / (0.235 * s)));
        const ph = r() * TAU;
        for (let i = 0; i < n; i++) {
          const a = ph + (i / n) * TAU;
          const x = g.x + Math.cos(a) * ringR;
          const z = g.z + Math.sin(a) * ringR;
          if (ringI > 0 && i % 2 === 1) continue; // nos anéis de fora, morangos alternam com frutas pequenas
          const lean = 1.05 + r() * 0.3;
          const sc = (0.9 + r() * 0.16) * s;
          add({ t: 'S', x, y: topY, z, ox: Math.cos(a), oz: Math.sin(a), s: sc, lean, yaw: (r() - 0.5) * 0.4, vol: VOL.berryLying(x, topY, z, Math.cos(a), Math.sin(a), sc, lean) });
        }
        ringR += 0.225 * s;
        ringI++;
      }
      pl.fill = { x: g.x, z: g.z, r: gr, n: Math.round(10 + gr * 46) };
      pl.scale = s;
      pl.blob = Math.min(gr, 0.5);
      return;
    }
    if (id === 'flores') {
      // buquê: uma rosa maior, outras em volta e florzinhas preenchendo
      const unit = flowerScale * 1.12; // escala da malha de uma rosa "tamanho 1"
      const want = 0.55 * flowerScale; // raio do buquê inteiro
      if (g.r < 0.172 * 0.62 * unit) return void (pl.unfit = true);
      const gs = clamp(g.r / want, 0, 1);
      const full = gs > 0.52; // cabe o buquê (encolhido, se preciso); senão, uma rosa só
      const mainK = full ? 1.1 * unit * gs : Math.min(1.1 * unit, g.r / 0.176);
      const spread = 0.21 * flowerScale * (full ? gs : 0);
      const mx = g.x - spread * 0.2;
      const mz = g.z + spread * 0.1;
      add({ t: 'rose', x: mx, y: topY, z: mz, K: mainK, tx: 0, tz: 0.4, tilt: 0.22, vol: VOL.rose(mx, topY, mz, mainK) });
      if (full) {
        const around = (k > 1 ? 1 : 0) + (g.r > 0.62 ? 4 : g.r > 0.4 ? 3 : 2);
        for (let i = 0; i < around; i++) {
          const a = 0.9 + (i / around) * TAU + (r() - 0.5) * 0.3;
          const K = (0.76 + r() * 0.12) * flowerScale * 1.12 * gs;
          const dist = Math.min(spread * 1.18 + 0.02, g.r - 0.172 * K);
          const x = g.x + Math.cos(a) * dist;
          const z = g.z + Math.sin(a) * dist;
          add({ t: 'rose', x, y: topY, z, K, tx: Math.cos(a), tz: Math.sin(a), tilt: 0.2 + r() * 0.1, vol: VOL.rose(x, topY, z, K) });
        }
        pl.fill = { x: g.x, z: g.z, r0: spread * 1.6, r: g.r, n: 5 + around * 2 };
      }
      pl.blob = Math.min(g.r, 0.45 * flowerScale);
      pl.scale = clamp(mainK / (1.1 * flowerScale * 1.12), 0, 1);
      return;
    }
    if (id === 'raspas') {
      const rad = Math.min(g.r, 0.48 * rho);
      if (rad < 0.1) return void (pl.unfit = true);
      const hgt = 0.1 + rad * 0.2;
      occ.addCyl(o, g.x, g.z, rad, topY, topY + hgt, 'solid');
      pl.regions.push({ x: g.x, z: g.z, r: rad, h: hgt, mound: true });
      return;
    }
    if (id === 'peonias') {
      // uma flor grande; com fartura média ou farta, flores menores encostadas nela, viradas para fora
      const alone = Math.min(peonyScale, (g.r - 0.004) / 0.268);
      if (alone < 0.5) return void (pl.unfit = true);
      const around = k < 1 ? 0 : k > 1 ? 4 : 2;
      // buquê: a principal (raio 0,268·s) e as menores (0,62·s) com o centro a 0,34·s do meio → raio ≈ 0,51·s
      const bunch = Math.min(peonyScale, g.r / 0.512);
      const main = around && bunch >= 0.66 ? bunch : alone;
      add({ t: 'peony', x: g.x, y: topY, z: g.z, s: main, ox: 0, oz: 1, tilt: 0.1, tint: 0, vol: VOL.peony(g.x, topY, g.z, main, 0, 1, 0.1) });
      if (around && bunch >= 0.66) {
        for (let i = 0; i < around; i++) {
          const a = (around === 2 ? 0.25 + i * Math.PI * 0.9 : 0.6 + (i / around) * TAU) + (r() - 0.5) * 0.3;
          const s2 = 0.62 * main * (0.92 + r() * 0.1);
          const dist = Math.min(0.34 * main, g.r - 0.268 * s2 - 0.004);
          const x = g.x + Math.cos(a) * dist;
          const z = g.z + Math.sin(a) * dist;
          add({ t: 'peony', x, y: topY, z, s: s2, ox: Math.cos(a), oz: Math.sin(a), tilt: 0.42, tint: 1 + (i % 3), vol: VOL.peony(x, topY, z, s2, Math.cos(a), Math.sin(a), 0.42) });
        }
      }
      pl.scale = clamp(main / peonyScale, 0, 1);
      pl.blob = Math.min(g.r, 0.4);
      return;
    }
    if (id === 'biscoitos') {
      // uma pilha no meio, outros encostados nela e, nos vãos, deitados na cobertura
      const s = clamp(g.r / 0.4, 0.72, 1);
      if (g.r < COOKIE_R * 0.72) return void (pl.unfit = true);
      const s0 = g.r < 0.36 ? clamp(g.r / 0.16, 0.72, 1) : s;
      const n = k < 1 ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const x = g.x + (r() - 0.5) * 0.02 * s0;
        const z = g.z + (r() - 0.5) * 0.02 * s0;
        const y = topY + (COOKIE_T * (i + 0.5) - 0.003) * s0;
        add({ t: 'cookie', x, y, z, nx: 0, ny: 1, nz: 0, s: s0, flat: true, vol: VOL.cookie(x, y, z, 0, 1, 0, s0) });
      }
      const a0 = 0.5 + r() * 0.6;
      if (g.r >= 0.36) {
        for (let i = 0; i < 3; i++) {
          const a = a0 + (i / 3) * TAU + (r() - 0.5) * 0.2;
          const elev = 0.56 + r() * 0.1;
          const dist = Math.min((COOKIE_R + 0.03 + COOKIE_R * Math.sin(elev) * 0.5) * s, g.r - 0.16 * s);
          const x = g.x + Math.cos(a) * dist;
          const z = g.z + Math.sin(a) * dist;
          const y = topY + (COOKIE_R * Math.cos(elev) + (COOKIE_T / 2) * Math.sin(elev)) * s - 0.006;
          const nx = Math.cos(a) * Math.cos(elev);
          const ny = Math.sin(elev);
          const nz = Math.sin(a) * Math.cos(elev);
          add({ t: 'cookie', x, y, z, nx, ny, nz, s, a, elev, vol: VOL.cookie(x, y, z, nx, ny, nz, s) });
        }
      }
      const flatN = g.r > 0.55 ? (k > 1 ? 3 : k < 1 ? 0 : 2) : 0;
      for (let i = 0; i < flatN; i++) {
        const a = a0 + ((i + 0.5) / 3) * TAU + (r() - 0.5) * 0.15;
        const dist = g.r - (COOKIE_R + 0.006) * s;
        const x = g.x + Math.cos(a) * dist;
        const z = g.z + Math.sin(a) * dist;
        const y = topY + (COOKIE_T / 2) * s - 0.004;
        add({ t: 'cookie', x, y, z, nx: 0, ny: 1, nz: 0, s, flat: true, vol: VOL.cookie(x, y, z, 0, 1, 0, s) });
      }
      pl.scale = s0;
      pl.blob = Math.min(g.r, 0.42);
      return;
    }
    if (id === 'lacos') {
      const s = clamp(Math.min(0.6 + rho * 0.5, g.r / 0.34), 0, 1.25);
      if (s < 0.42) return void (pl.unfit = true);
      const fl = Math.hypot(0.12, 1);
      const z = g.z - 0.1 * s;
      add({ t: 'bow', x: g.x, y: topY, z, s, fx: 0.12 / fl, fz: 1 / fl, vol: VOL.bowTop(g.x, topY, z, 0.12 / fl, 1 / fl, s) });
      pl.scale = clamp(s / Math.min(1.25, 0.6 + rho * 0.5), 0, 1);
      pl.blob = 0.26 * s;
      return;
    }
    // montinhos: morangos banhados, cerejas, macarons, brigadeiros, bombons, suspiros, marshmallows
    const sp = SPEC[id];
    const [size, count, rise] = sp.pile;
    const { s, spots } = pileSpots(g, size, Math.max(1, Math.round(count * k)), rise, sp.minS);
    if (!spots.length) return void (pl.unfit = true);
    pl.want = Math.max(1, Math.round(count * k));
    pl.scale = s;
    spots.forEach((q, i) => {
      const y = topY + (q.rise || 0);
      if (id === 'morangos') {
        if (q.center) return add({ t: 'U', x: q.x, z: q.z, y: topY + 0.147 * 1.1 * s, s: 1.1 * s, vol: VOL.berryUp(q.x, topY + 0.147 * 1.1 * s, q.z, 1.1 * s) });
        const lean = 1.0 + r() * 0.25;
        const sc = (0.9 + r() * 0.14) * s;
        return add({ t: 'S', x: q.x, y: topY, z: q.z, ox: q.ox, oz: q.oz, s: sc, lean, yaw: (r() - 0.5) * 0.4, vol: VOL.berryLying(q.x, topY, q.z, q.ox, q.oz, sc, lean) });
      }
      if (id === 'cerejas') {
        const sc = (0.94 + r() * 0.1) * s;
        const tilt = q.center && spots.length < 8 ? 0.1 : 0.2 + r() * 0.3;
        const a = Math.atan2(q.oz, q.ox) + (r() - 0.5) * 1.2;
        const spin = r() * TAU;
        const v = r() < 0.5 ? 0 : 1;
        return add({ t: 'cherry', x: q.x, y, z: q.z, s: sc, a, tilt, spin, v, vol: VOL.cherry(q.x, y, q.z, sc, a, tilt, spin, v) });
      }
      if (id === 'macarons') {
        if (!q.level) {
          const yc = topY + (MAC_T / 2) * s - 0.004;
          return add({ t: 'mac', x: q.x, y: yc, z: q.z, nx: 0, ny: 1, nz: 0, s, flat: true, vol: VOL.macaron(q.x, yc, q.z, 0, 1, 0, s) });
        }
        const elev = 1.12 + r() * 0.2;
        const yc = y + (MAC_T / 2 + 0.03) * s;
        const nx = q.ox * Math.cos(elev);
        const ny = Math.sin(elev);
        const nz = q.oz * Math.cos(elev);
        return add({ t: 'mac', x: q.x, y: yc, z: q.z, nx, ny, nz, s, dx: q.ox, dz: q.oz, elev, vol: VOL.macaron(q.x, yc, q.z, nx, ny, nz, s) });
      }
      if (id === 'brigadeiros') {
        const sc = (0.96 + r() * 0.06) * s;
        return add({ t: 'brig', x: q.x, y, z: q.z, s: sc, vol: VOL.brigadeiro(q.x, y, q.z, sc) });
      }
      if (id === 'bombons') {
        const sc = (0.96 + r() * 0.06) * s;
        return add({ t: 'bombom', x: q.x, y, z: q.z, s: sc, level: q.level, vol: VOL.bombom(q.x, y, q.z, sc) });
      }
      if (id === 'suspiros') {
        const sc = (q.center && !q.level ? 1.08 : 0.88 + r() * 0.14) * s;
        const tall = 0.94 + r() * 0.12;
        return add({ t: 'meringue', x: q.x, y, z: q.z, s: sc, tall, level: q.level, vol: VOL.meringue(q.x, y, q.z, sc, tall) });
      }
      // marshmallows
      const sc = (0.94 + r() * 0.08) * s;
      const lying = q.level ? r() < 0.6 : i % 3 === 1;
      const squash = lying ? 1 : 0.92 + r() * 0.1;
      const yc = y + 0.1 * sc * squash - 0.004;
      return add({ t: 'marsh', x: q.x, y: yc, z: q.z, s: sc, lying, squash, level: q.level, vol: VOL.marshmallow(q.x, yc, q.z, sc) });
    });
    pl.blob = Math.min(g.r, spots.reduce((dd, q) => Math.max(dd, Math.hypot(q.x - g.x, q.z - g.z)), 0) + 0.15);
  };
  groupDiscs.forEach((g) => composeCenter(g.id, g));
  groups.forEach((id) => {
    const pl = P(id);
    pl.zone = 'center';
    if (!pl.pieces.length && !pl.regions.length) pl.unfit = true;
    else if (pl.scale < 0.78 && pl.group && pl.group.r < 0.7 * F) say(`${cap(NAMES[id])} ${many([id]) ? 'ficaram' : 'ficou'} em tamanho menor para caber no centro com as outras peças.`);
  });
  // raio ocupado pelo que está no meio (para as velas darem a volta)
  const midR = groupDiscs.length === 1 ? groupDiscs[0].r : groupDiscs.length ? Math.max(...groupDiscs.map((g) => Math.hypot(g.x - cx, g.z - cz) + g.r)) : 0;
  const midC = groupDiscs.length === 1 ? groupDiscs[0] : { x: cx, z: cz };

  /* velas clássicas (num topo pequeno elas já foram colocadas antes de tudo) */
  if (classic && !party.candles) placeCandles();

  /* vela faísca */
  if (faisca) {
    const o = own('velas');
    const volAt = (x, z) => [
      ...VOL.stick(x, topY, z, x, topY + 0.5, z, 0.037, 'solid'),
      [x, topY + 0.6, z, 0.11, 'fx'],
      [x, topY + 0.82, z, 0.2, 'fx'],
      [x, topY + 1.08, z, 0.2, 'fx'],
    ];
    const cand = [];
    if (!groupDiscs.length) {
      const aside = (named || message) ? -Math.min(0.34, Fi * 0.5) : 0;
      cand.push([cx + aside, cz + (aside ? 0.06 : 0) + (has('baloes') ? 0.1 * Fi : 0)], [cx, cz], [cx, cz + 0.12], [cx, cz + 0.24]);
    } else {
      groupDiscs.forEach((g) => cand.push([g.x, g.z - g.r - 0.06], [g.x - g.r - 0.06, g.z], [g.x + g.r + 0.06, g.z], [g.x, g.z + g.r + 0.06]));
    }
    for (let rad = 0.1; rad < F - 0.04; rad += 0.08) for (let i = 0; i < 10; i++) cand.push([cx + Math.cos(i * 0.628 + 2) * rad, cz + Math.sin(i * 0.628 + 2) * rad]);
    // e, por fim, qualquer lugar livre do topo (formatos compridos têm espaço nas pontas), do meio para fora
    const grid = [];
    for (let x = m.bounds.minX; x <= m.bounds.maxX; x += 0.08) for (let z = m.bounds.minZ; z <= m.bounds.maxZ; z += 0.08) grid.push([x, z]);
    grid.sort((p1, p2) => Math.hypot(p1[0] - cx, p1[1] - cz) - Math.hypot(p2[0] - cx, p2[1] - cz)).forEach((q) => cand.push(q));
    const got = cand.find(([x, z]) => inside(x, z, 0.05) && fits(o, volAt(x, z)));
    if (got) {
      reserve(o, volAt(got[0], got[1]));
      party.sparkler = { x: got[0], z: got[1], vol: volAt(got[0], got[1]) };
    } else {
      notes.unfit.push('A vela faísca não coube no topo com as outras peças. Tire uma decoração do topo ou escolha um bolo maior.');
      notes.unfitIds.push('velas');
    }
  }

  /* escrita com bico */
  occ.release(RES);
  if (script) {
    const T = textOf();
    const o = TXT;
    const yb = topY;
    let best = null;
    // em arco, acompanhando a borda da frente (bolo redondo com o meio ocupado)
    if (round && midBusy) {
      const r1 = (rings.length ? Fi : F) - 0.008;
      const arcFree = (sz) => {
        const hh = (T.one.hb * sz) / 2;
        const rmid = r1 - hh;
        if (rmid < 0.08) return null;
        const half = (T.one.wb * sz * 0.5) / rmid;
        if (half > 1.15) return null;
        const n = Math.max(4, Math.ceil((2 * half * rmid) / 0.07));
        for (let i = 0; i <= n; i++) {
          const a = Math.PI / 2 - half + (2 * half * i) / n;
          for (let j = -1; j <= 1; j++) {
            const rad = rmid + j * Math.max(0, hh - 0.03);
            if (!textFree(cx + Math.cos(a) * rad, cz + Math.sin(a) * rad)) return null;
          }
        }
        return { rmid, half, hh };
      };
      let lo = 0.07;
      let hi = T.smax * 0.8;
      let got = arcFree(lo);
      if (got) {
        for (let i = 0; i < 9; i++) {
          const mid = (lo + hi) / 2;
          const g2 = arcFree(mid);
          if (g2) {
            lo = mid;
            got = g2;
          } else hi = mid;
        }
        best = { mode: 'arc', s: lo, x: cx, z: cz, rmid: got.rmid, half: got.half, hh: got.hh, r1, score: lo * 1.15 };
      }
    }
    // reta: o maior retângulo livre ao longo do eixo do bolo (uma ou duas linhas)
    const flat = fitFlat(T, T.smax, midBusy ? cz + Fi * 0.5 : cz);
    if (flat && (!best || flat.score > best.score)) best = flat;
    if (!best || best.s < 0.085) {
      // não coube por dentro da coroa: a mensagem avança sobre a faixa dela (as peças da coroa dão lugar)
      const wide = fitFlat(T, T.smax, midBusy ? cz + Fi * 0.5 : cz, true);
      if (wide && (!best || wide.s > best.s * 1.1)) best = wide;
    }
    if (best) {
      if (best.mode === 'arc') {
        const n = Math.max(4, Math.ceil((2 * best.half * best.rmid) / 0.05));
        for (let i = 0; i <= n; i++) {
          const a = Math.PI / 2 - best.half + (2 * best.half * i) / n;
          occ.addCyl(o, cx + Math.cos(a) * best.rmid, cz + Math.sin(a) * best.rmid, best.hh + 0.004, yb - 0.01, yb + 0.05, 'flat');
        }
      } else coverRect(o, best, yb - 0.01, yb + 0.05, 'flat');
      party.text = best;
      if (best.s < 0.1) say('A mensagem escrita ficou em letra pequena para caber no topo com as outras peças.');
    } else {
      notes.unfit.push('A mensagem escrita com bico não coube no topo com as outras peças. Use a plaquinha ou tire uma decoração do topo.');
      notes.unfitIds.push('escrita');
    }
  }

  /** Eixo do palito (u) e frente (n) de uma peça espetada que olha para `yaw`, deitada `lean` para trás e rolada `roll`. */
  const facing = (yaw, lean, roll) => {
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const sl = Math.sin(lean);
    const cl = Math.cos(lean);
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    return { ux: -fx * sl * cr - fz * sr, uy: cl * cr, uz: -fz * sl * cr + fx * sr, nx: fx * cl, ny: sl, nz: fz * cl };
  };
  // até onde vai, para trás, o que está no meio do palco (os palitos ficam atrás disso)
  const midBackZ = () => {
    let z = cz;
    groupDiscs.forEach((g) => (z = Math.min(z, g.z - g.r)));
    if (party.candles) party.candles.spots.forEach((q) => (z = Math.min(z, q.z - 0.04)));
    if (party.numbers) z = Math.min(z, party.numbers.z - 0.06);
    if (party.sparkler) z = Math.min(z, party.sparkler.z - 0.05);
    return z;
  };

  /* pirulitos */
  if (has('pirulitos')) {
    const k = qty('pirulitos');
    const want0 = k < 1 ? 2 : k > 1 ? 5 : 3;
    const o = own('pirulitos');
    const r = rng(hashString(`pirulitos${m.shape}${m.R}`));
    const HEIGHTS = [0.4, 0.27, 0.43, 0.3, 0.38];
    const anyMid = groupDiscs.length || party.candles || party.numbers || party.sparkler;
    const midBack = anyMid ? cz - midBackZ() + 0.09 : 0.1 * rho;
    const boards = Boolean(message) || named;
    const depths = [midBack, boards ? depthP - 0.16 : 0.44 * rho, 0.1 * rho, 0.32 * Fi, 0.6 * Fi, -0.1 * Fi, -0.4 * Fi, Fi - 0.05];
    const run = (s, gap, want) =>
      stickRows('pirulitos', want, {
        depths,
        gap,
        make: (x, z, j, i) => {
          let h = HEIGHTS[(i + (want === 2 ? 1 : 0)) % HEIGHTS.length] + (r() - 0.5) * 0.03;
          const yaw = j * 0.3 + (r() - 0.5) * 0.1;
          const roll = -j * 0.16 + (r() - 0.5) * 0.05;
          const f = facing(yaw, 0.07, roll);
          const vol0 = (hh) => VOL.lollipop(x + f.ux * hh, topY + f.uy * hh, z + f.uz * hh, f.nx, f.ny, f.nz, s);
          for (let tries = 0; tries < 4; tries++) {
            if (fits(o, vol0(h))) break;
            h += 0.14;
            if (h > 0.78) return null;
          }
          const hs = Math.max(0.02, h - 0.15 * s);
          const vol = [...vol0(h), ...VOL.stick(x, topY, z, x + f.ux * hs, topY + f.uy * hs, z + f.uz * hs, 0.016)];
          return { t: 'lolly', x, z, h, yaw, roll, ux: f.ux, uy: f.uy, uz: f.uz, s, j, vol };
        },
      });
    const want = Math.max(1, Math.min(want0, Math.round(want0 * clamp(F / 0.55, 0.34, 1))));
    let got = run(1, 0.325, want);
    if (!got.length) {
      got = run(0.74, 0.25, Math.min(want, 2));
      if (got.length) P('pirulitos').scale = 0.74;
    }
    P('pirulitos').want = want0;
    P('pirulitos').zone = 'palito';
  }

  /* corações no palito: em volta do meio */
  if (zones.coracoes === 'palito') {
    const k = qty('coracoes');
    const want = k < 1 ? 3 : k > 1 ? 9 : 6;
    const o = own('coracoes');
    const r = R('coracoespalito');
    const pl = P('coracoes');
    pl.zone = 'palito';
    pl.want = want;
    const inner = midR ? midR + 0.07 : 0.05;
    const ringR = clamp(Math.min(rho * 0.5, Fi - 0.05), Math.min(inner, Fi - 0.04), Math.max(inner, Fi - 0.04));
    for (let i = 0; i < want; i++) {
      for (let tries = 0; tries < 6; tries++) {
        const a = Math.PI * 0.5 + ((i + 0.5) / want) * TAU + (r() - 0.5) * 0.25 + tries * 0.21;
        const dist = Math.max(inner, ringR * (tries < 2 ? 0.74 + r() * 0.26 : 1 - 0.1 * tries));
        const x = midC.x + Math.cos(a) * dist;
        const z = midC.z + Math.sin(a) * dist;
        const h = 0.3 + 0.1 * (1 - Math.sin(a)) + r() * 0.1 + tries * 0.06;
        const yaw = Math.cos(a) * 0.45 + (r() - 0.5) * 0.3;
        const roll = (r() - 0.5) * 0.3;
        const s = 1.35 + r() * 0.3;
        const f = facing(yaw, 0.05, roll);
        const hx = x + f.ux * h;
        const hy = topY + f.uy * h;
        const hz = z + f.uz * h;
        const hs = Math.max(0.02, h - 0.06 * s);
        const vol = [...VOL.heart(hx, hy, hz, s, 'air'), ...VOL.stick(x, topY, z, x + f.ux * hs, topY + f.uy * hs, z + f.uz * hs, 0.012)];
        if (!inside(x, z, 0.014) || (rings.length && sd(x, z) < edge + ringW) || !fits(o, vol)) continue;
        reserve(o, vol);
        pl.pieces.push({ t: 'heartStick', x, z, h, yaw, roll, s, ux: f.ux, uy: f.uy, uz: f.uz, vol });
        break;
      }
    }
  }

  /* ══ 3. Lateral: laço na frente e cascatas ══ */
  /** Faixa de altura que um conjunto de volumes ocupa. */
  const spanY = (vol) => {
    let lo = Infinity;
    let hi = -Infinity;
    vol.forEach((v) => {
      lo = Math.min(lo, v[1] - v[3]);
      hi = Math.max(hi, v[1] + v[3]);
    });
    return [lo, hi];
  };
  /** A peça cabe na faixa livre da lateral do andar s? (anota quando é a calda ou a guirlanda que a barra) */
  const inBand = (s, vol) => {
    const [lo, hi] = spanY(vol);
    if (lo >= s.lo && hi <= s.hi) return true;
    if (s.why && hi > s.hi && lo >= s.lo) sideLimited = sideLimited || s.why;
    return false;
  };

  /* laço na frente da lateral do andar de cima */
  if (zones.lacos === 'frente') {
    const pl = P('lacos');
    pl.zone = 'frente';
    const s0 = sides[sides.length - 1];
    const at = frontSpot(m);
    const band = s0.hi - s0.lo;
    const full = clamp(0.72 + rho * 0.5, 0.45, 1.3);
    const s = clamp(Math.min(full, band / 0.56), 0.4, 1.3);
    // o nó fica logo abaixo da borda (ou do que estiver ocupando o alto da lateral)
    const y = Math.min(s0.hi - 0.173 * s, s0.t.y0 + s0.sideH - 0.04 - 0.19 * s);
    const off = 0.004 + s0.out;
    const x = at.x + at.nx * off;
    const z = at.z + at.nz * off;
    const piece = { t: 'bow', x, y, z, s, nx: at.nx, nz: at.nz, side: true, vol: VOL.bowSide(x, y, z, at.nx, at.nz, s) };
    if (!inBand(s0, piece.vol) || !put('lacos', piece)) pl.unfit = true;
    else {
      pl.scale = s / full;
      if (s < full * 0.8) say('O laço ficou menor para caber na lateral, abaixo do que já está na borda.');
    }
  }

  /* cascatas: nascem no topo, perto da borda, e descem a lateral em diagonal */
  const cascades = items.filter((id) => zones[id] === 'cascade');
  const total = m.Htot ?? m.Ht;
  // faixas: a primeira na frente (um pouco à direita); as seguintes, paralelas, sem se cruzar
  const LANES = [0.36 * Math.PI, 0.36 * Math.PI - 1.36, 0.36 * Math.PI + 1.36, 0.36 * Math.PI + 2.72, 0.36 * Math.PI - 2.5];
  const usedLanes = new Set();
  // q = { wx, wz: ponto da parede (já por fora da cerca, se houver) · y · ox, oz: para fora · taper }
  const makeSide = {
    frutas: (q, i, r) => {
      if (i % 3 === 2) {
        const k = 0.9 * q.taper;
        const x = q.wx + q.ox * 0.08 * k;
        const z = q.wz + q.oz * 0.08 * k;
        return { t: 'R', x, y: q.y - 0.064 * k, z, k, side: true, vol: [[x, q.y, z, 0.092 * k, 'side']] };
      }
      const sc = (0.86 + r() * 0.16) * q.taper;
      const x = q.wx + q.ox * 0.11 * sc;
      const z = q.wz + q.oz * 0.11 * sc;
      return { t: 'S', x, y: q.y - 0.098 * sc, z, ox: q.ox, oz: q.oz, s: sc, lean: 1.45, yaw: (r() - 0.5) * 0.5, side: true, vol: VOL.berryLying(x, q.y - 0.098 * sc, z, q.ox, q.oz, sc, 1.45, 'side') };
    },
    flores: (q, i, r) => {
      const sc = (0.6 + r() * 0.24) * q.taper * flowerScale;
      if (i % 3 !== 1) return { t: 'rose', x: q.wx, y: q.y, z: q.wz, ox: q.ox, oz: q.oz, K: sc, side: true, leaf: true, vol: VOL.roseSide(q.wx, q.y, q.wz, q.ox, q.oz, sc) };
      const k = sc * 1.25;
      return { t: 'blossom', x: q.wx, y: q.y, z: q.wz, ox: q.ox, oz: q.oz, k, side: true, leaf: true, vol: [[q.wx + q.ox * 0.02, q.y, q.wz + q.oz * 0.02, 0.085 * k, 'side']] };
    },
    margaridas: (q, i, r) => {
      const s = (i % 2 ? 0.8 : 1.0) * q.taper;
      const l = Math.hypot(1, 0.3);
      const x = q.wx + q.ox * 0.006;
      const z = q.wz + q.oz * 0.006;
      return { t: 'daisy', x, y: q.y, z, ox: q.ox, oz: q.oz, s, up: 0.3, roll: r() * TAU, side: true, leaf: i % 2 === 0, vol: VOL.daisySide(x, q.y, z, q.ox / l, 0.3 / l, q.oz / l, s) };
    },
    peonias: (q, i, r) => {
      const s = peonyScale * q.taper * (0.5 + r() * 0.18) * 0.84;
      const x = q.wx + q.ox * 0.02 * s;
      const z = q.wz + q.oz * 0.02 * s;
      return { t: 'peony', x, y: q.y, z, ox: q.ox, oz: q.oz, s, side: true, spin: r() * TAU, leaf: true, vol: VOL.peony(x, q.y, z, s, q.ox, q.oz, Math.atan2(1, 0.16), 'side') };
    },
    macarons: (q, i, r) => {
      // colados pela casquinha de baixo, de frente para fora; um sim, um não, apoiado sobre os vizinhos
      const over = i % 2;
      const s = 0.9 + 0.1 * q.taper - (i % 3 === 2 ? 0.08 : 0);
      const up = over * 0.2 + (r() - 0.5) * 0.1;
      const l = Math.hypot(1, up);
      const depth = 0.074 * s + over * 0.05;
      const x = q.wx + q.ox * depth;
      const z = q.wz + q.oz * depth;
      return { t: 'mac', x, y: q.y, z, nx: q.ox / l, ny: up / l, nz: q.oz / l, s, side: true, roll: r() * TAU, vol: VOL.macaron(x, q.y, z, q.ox / l, up / l, q.oz / l, s, 'side') };
    },
    ouro: (q) => {
      const x = q.wx + q.ox * 0.004;
      const z = q.wz + q.oz * 0.004;
      return { t: 'gold', x, y: q.y, z, ox: q.ox, oz: q.oz, side: true, spread: 0.09 * q.taper, vol: [[x, q.y, z, 0.1 * q.taper, 'coating']] };
    },
    borboletas: (q, i, r) => {
      const s = (0.85 + r() * 0.3) * (0.8 + 0.2 * q.taper);
      const open = 0.75 + r() * 0.45;
      const up = 0.2 + r() * 0.3;
      const l = Math.hypot(1, up);
      const x = q.wx + q.ox * 0.004;
      const z = q.wz + q.oz * 0.004;
      return { t: 'fly', x, y: q.y, z, ox: q.ox, oz: q.oz, s, open, up, side: true, vol: VOL.butterfly(x, q.y, z, s, open, q.ox / l, up / l, q.oz / l, 'side') };
    },
  };
  const makeTop = {
    frutas: (x, z, ox, oz, i, r) => {
      if (i % 3 === 2) return { t: 'R', x, y: topY - 0.004, z, k: 0.95, vol: VOL.raspberry(x, topY - 0.004, z, 0.95) };
      const lean = 1.0 + r() * 0.3;
      const sc = 0.88 + r() * 0.14;
      return { t: 'S', x, y: topY, z, ox, oz, s: sc, lean, yaw: (r() - 0.5) * 0.5, vol: VOL.berryLying(x, topY, z, ox, oz, sc, lean) };
    },
    flores: (x, z, ox, oz, i, r) => {
      if (i % 2 === 0) {
        const K = (0.66 + r() * 0.26) * flowerScale * 1.12;
        return { t: 'rose', x, y: topY, z, K, tx: ox, tz: oz, tilt: 0.2 + r() * 0.1, leaves: true, vol: VOL.rose(x, topY, z, K) };
      }
      const k = 0.95 * flowerScale;
      return { t: 'blossom', x, y: topY, z, k, vol: VOL.blossom(x, topY, z, k) };
    },
    margaridas: (x, z, ox, oz, i) => {
      const s = i % 2 ? 0.8 : 1.02;
      return { t: 'daisy', x, y: topY, z, ox, oz, s, leaf: i % 2 === 0, vol: VOL.daisy(x, topY, z, s) };
    },
    peonias: (x, z, ox, oz, i, r) => {
      const s = peonyScale * (i === 0 ? 0.8 : 0.5 + r() * 0.2);
      return { t: 'peony', x, y: topY, z, s, ox, oz, tilt: 0.25, leaves: true, vol: VOL.peony(x, topY, z, s, ox, oz, 0.25) };
    },
    macarons: (x, z) => {
      const yc = topY + MAC_T / 2 - 0.004;
      return { t: 'mac', x, y: yc, z, nx: 0, ny: 1, nz: 0, s: 1, flat: true, vol: VOL.macaron(x, yc, z, 0, 1, 0, 1) };
    },
    ouro: (x, z) => ({ t: 'gold', x, y: topY, z, spread: 0.09, vol: [[x, topY, z, 0.1, 'coating']] }),
    borboletas: (x, z, ox, oz, i, r) => {
      const s = 0.85 + r() * 0.35;
      const open = 0.75 + r() * 0.45;
      return { t: 'fly', x, y: topY + 0.002, z, s, open, vol: VOL.butterfly(x, topY + 0.002, z, s, open) };
    },
  };
  // raio que a peça ocupa no topo (para recuar da borda) e na lateral (para o espaçamento)
  const TOP_R = { frutas: 0.17, flores: 0.2, margaridas: 0.145, peonias: 0.27 * peonyScale * 0.8, macarons: 0.165, ouro: 0.1, borboletas: 0.14 };
  const volR = (vol) => vol.reduce((best, v) => Math.max(best, v[3]), 0);
  cascades.forEach((id) => {
    const sp = SPEC[id];
    const pl = P(id);
    pl.zone = 'cascade';
    if (!sp?.casc || !makeSide[id]) return void (pl.unfit = true);
    const k = qty(id);
    const [size, count] = sp.casc;
    const n = Math.max(4, Math.round(count * k * 1.25));
    const topN = Math.max(2, Math.round(n * 0.3));
    const sideN = n - topN;
    pl.want = n;
    const o = own(id);
    const rTop = TOP_R[id];
    const tryLane = (a0, commit) => {
      const r = R(`cascata${id}`); // o mesmo sorteio no ensaio e na colocação
      // no topo: da borda para dentro, numa pequena diagonal
      const pieces = [];
      let ang = a0 + 0.04;
      for (let i = 0; i < topN + 3 && pieces.length < topN; i++) {
        const lim = reach(ang, edge + rTop + GAP);
        const dist = lim - i * rTop * 1.3;
        if (dist < Math.max(0.05, Fi * 0.2)) break;
        const x = cx + Math.cos(ang) * dist;
        const z = cz + Math.sin(ang) * dist;
        const piece = makeTop[id](x, z, Math.cos(ang), Math.sin(ang), pieces.length, r);
        if (fits(o, piece.vol) && pieces.every((q) => Math.hypot(q.x - x, q.z - z) >= size * 1.9)) {
          pieces.push(piece);
          if (commit) reserve(o, piece.vol);
        }
        ang -= (1.5 * rTop) / Math.max(0.25, dist);
      }
      // na lateral: desce em diagonal, andar por andar, só onde a lateral está livre
      const sidePieces = [];
      let last = null;
      for (let step = 0; step < 90 && sidePieces.length < sideN; step++) {
        const t = (step + 0.4) / 90;
        const y = total * (1 - t) * 0.94 + 0.03;
        const s = sideOf(y);
        if (s.t.naked && (id === 'ouro' || id === 'borboletas' || id === 'margaridas')) continue;
        const theta = a0 + 0.1 + t * 1.15;
        const w = wallAt(s, theta, 0);
        const rr0 = (sp.sideR || size) * 0.9;
        if (last && Math.hypot(w.x - last.x, y - last.y, w.z - last.z) < rr0 + last.rr * 0.9) continue;
        const piece = makeSide[id]({ wx: w.x, wz: w.z, y, ox: w.ox, oz: w.oz, taper: 1 - 0.25 * t, u: 0.3 + 0.7 * t }, sidePieces.length, r);
        const rr = volR(piece.vol);
        if (last && Math.hypot(piece.vol[0][0] - last.cx, piece.vol[0][1] - last.cy, piece.vol[0][2] - last.cz) < (rr + last.rr) * 0.98) continue;
        if (!inBand(s, piece.vol) || !fits(o, piece.vol)) continue;
        if (commit) reserve(o, piece.vol);
        sidePieces.push(piece);
        last = { x: w.x, y, z: w.z, rr, cx: piece.vol[0][0], cy: piece.vol[0][1], cz: piece.vol[0][2] };
      }
      return { got: [...pieces, ...sidePieces], top: pieces.length, side: sidePieces.length };
    };
    // escolhe a primeira faixa livre em que a cascata nasce no topo e desce a lateral
    let pick = -1;
    let bestScore = -1;
    for (let li = 0; li < LANES.length; li++) {
      if (usedLanes.has(li)) continue;
      const res = tryLane(LANES[li], false);
      const score = res.top * 2 + res.side - li * 0.5 + (res.top && res.side ? 3 : 0);
      if (score > bestScore) {
        bestScore = score;
        pick = li;
      }
      if (res.top >= Math.min(2, topN) && res.side >= Math.min(2, sideN)) {
        pick = li;
        break;
      }
    }
    if (pick < 0 || bestScore <= 0) return void (pl.unfit = true);
    usedLanes.add(pick);
    const res = tryLane(LANES[pick], true);
    res.got.forEach((piece) => pl.pieces.push(piece));
    pl.lane = pick;
    pl.sideCount = res.side;
    if (!res.got.length) pl.unfit = true;
    else if (!res.side && sideN > 0) say(`${cap(NAMES[id])} em cascata ${many([id]) ? 'ficaram' : 'ficou'} só no topo: a lateral já está ocupada.`);
  });
  if (cascades.filter((id) => !P(id).unfit).length > 1) say(`As cascatas de ${listOf(cascades.filter((id) => !P(id).unfit))} descem lado a lado, cada uma na sua faixa.`);

  /* ══ 4. Coroas e meias-luas: dividem a borda do topo em setores ══ */
  const ringPoint = (dist, theta) => {
    const dd = reach(theta, dist);
    return { x: cx + Math.cos(theta) * dd, z: cz + Math.sin(theta) * dd, d: dd, theta };
  };
  /** Pontos espaçados de `step` (em linha reta) ao longo do anel recuado de `dist`, entre os ângulos a e b. */
  const ringWalk = (dist, a, b, step) => {
    const out = [];
    if (b - a < 1e-3) return out;
    let p = ringPoint(dist, a);
    out.push(p);
    let guard = 0;
    while (guard++ < 300) {
      let da = step / Math.max(0.08, p.d);
      let q = null;
      for (let it = 0; it < 5; it++) {
        q = ringPoint(dist, p.theta + da);
        const len = Math.hypot(q.x - p.x, q.z - p.z);
        if (Math.abs(len - step) < 0.0015) break;
        da = Math.min(1.2, (da * step) / Math.max(len, 1e-4));
      }
      if (q.theta > b + 1e-6) break;
      out.push(q);
      p = q;
    }
    return out;
  };
  /** Peças de um setor: cabem inteiras entre a e b (o primeiro e o último a meia peça das divisas). */
  const sectorSpots = (dist, a, b, step, half, closed) => {
    if (closed) {
      // volta inteira: ajusta o passo para fechar o anel sem vão nem aperto
      let st = step;
      let pts = [];
      for (let it = 0; it < 3; it++) {
        pts = ringWalk(dist, a, a + TAU - 1e-4, st);
        if (pts.length < 3) return pts;
        const last = pts[pts.length - 1];
        const gap = Math.hypot(pts[0].x - last.x, pts[0].z - last.z);
        const around = (pts.length - 1) * st + gap; // perímetro (em cordas)
        const n = Math.max(3, Math.round(around / step - 0.15));
        const st2 = around / n;
        if (Math.abs(st2 - st) < 0.0015) break;
        st = st2;
      }
      if (pts.length > 3) {
        const last = pts[pts.length - 1];
        if (Math.hypot(pts[0].x - last.x, pts[0].z - last.z) < st * 0.75) pts.pop();
      }
      return pts;
    }
    const p0 = ringPoint(dist, a);
    const p1 = ringPoint(dist, b);
    const a0 = a + half / Math.max(0.08, p0.d);
    const b0 = b - half / Math.max(0.08, p1.d);
    if (b0 <= a0) {
      const midp = ringPoint(dist, (a + b) / 2);
      return (b - a) * midp.d >= 2 * half ? [midp] : [];
    }
    let pts = ringWalk(dist, a0, b0, step);
    if (pts.length > 1) {
      // estica um pouco para terminar na ponta do setor
      const slack = b0 - pts[pts.length - 1].theta;
      const arc = (b0 - a0) * pts[0].d;
      const st2 = step * (1 + (slack * pts[0].d) / Math.max(0.01, arc - slack * pts[0].d));
      // (a mesma quantidade de peças, um pouco mais afastadas; a folga no fim evita perder a última por arredondamento)
      if (st2 < step * 1.35) pts = ringWalk(dist, a0, b0 + 0.08, st2).slice(0, pts.length);
      else {
        const shift = slack / 2;
        pts = ringWalk(dist, a0 + shift, b0, step);
      }
    } else if (pts.length === 1) pts = [ringPoint(dist, (a0 + b0) / 2)];
    return pts;
  };

  // setores
  const halves = rings.filter((id) => zones[id] === 'half');
  const crowns = rings.filter((id) => zones[id] === 'crown');
  const sectors = []; // { id, a, b, open (meia-lua: pontas livres), closed }
  if (rings.length) {
    const FRONT = Math.PI / 2;
    const vis = (a) => Math.sin(a) + (Math.cos(a) < 0 ? 0.001 : 0); // mais à frente primeiro; empate: esquerda
    if (!crowns.length) {
      if (halves.length === 1) sectors.push({ id: halves[0], a: Math.PI * 0.53, b: Math.PI * 1.47, open: true, side: 'left' });
      else if (halves.length === 2) {
        sectors.push({ id: halves[0], a: Math.PI * 0.53, b: Math.PI * 1.47, open: true, side: 'left' });
        sectors.push({ id: halves[1], a: Math.PI * 1.53, b: Math.PI * 2.47, open: true, side: 'right' });
      } else {
        const n = halves.length;
        const span = TAU / n;
        const mids = Array.from({ length: n }, (_, i) => FRONT + span * (i + 0.5)).sort((p, q) => vis(q) - vis(p));
        halves.forEach((id, i) => sectors.push({ id, a: mids[i] - span * 0.47, b: mids[i] + span * 0.47, open: true, side: Math.cos(mids[i]) < 0 ? 'left' : 'right' }));
      }
    } else {
      // meias-luas ficam com os lados; as coroas dividem o resto em setores alternados
      const n = halves.length + crowns.length;
      const hSpan = halves.length ? Math.min(Math.PI * 0.94, (TAU / n) * (crowns.length === 1 && halves.length === 1 ? 1 : 0.95)) : 0;
      const gaps = [];
      if (!halves.length) gaps.push([FRONT - Math.PI, FRONT + Math.PI]);
      else if (halves.length === 1) {
        sectors.push({ id: halves[0], a: Math.PI - hSpan / 2, b: Math.PI + hSpan / 2, open: true, side: 'left' });
        gaps.push([Math.PI + hSpan / 2 - TAU, Math.PI - hSpan / 2]);
      } else {
        const mids = halves.length === 2 ? [Math.PI, 0] : Array.from({ length: halves.length }, (_, i) => Math.PI - (TAU / halves.length) * i);
        const span = Math.min(hSpan, (TAU / halves.length) * 0.62);
        const cuts = [];
        halves.forEach((id, i) => {
          sectors.push({ id, a: mids[i] - span / 2, b: mids[i] + span / 2, open: true, side: Math.cos(mids[i]) < 0 ? 'left' : 'right' });
          cuts.push([mids[i] - span / 2, mids[i] + span / 2]);
        });
        const norm = (a) => ((a % TAU) + TAU) % TAU;
        const sorted = cuts.map(([a, b]) => [norm(a), norm(a) + (b - a)]).sort((p, q) => p[0] - q[0]);
        sorted.forEach((c, i) => {
          const next = i + 1 < sorted.length ? sorted[i + 1][0] : sorted[0][0] + TAU;
          if (next - c[1] > 0.05) gaps.push([c[1], next]);
        });
      }
      gaps.sort((p, q) => vis((q[0] + q[1]) / 2) - vis((p[0] + p[1]) / 2));
      // quantos setores cada coroa recebe: grupos de ~3 peças
      const radius = Math.max(0.1, F - ringW / 2);
      const avgStep = crowns.reduce((s2, id) => s2 + (SPEC[id]?.step || 0.3), 0) / crowns.length;
      const gapLen = gaps.reduce((s2, g2) => s2 + (g2[1] - g2[0]), 0) * radius;
      let reps = crowns.length === 1 ? 1 : clamp(Math.round(gapLen / (crowns.length * 3.7 * avgStep * ringScale)), 1, 3);
      let slots = crowns.length * reps;
      // distribui os setores pelos vãos, proporcional ao tamanho de cada um
      let cuts2 = [];
      const build = () => {
        cuts2 = [];
        const totalA = gaps.reduce((s2, g2) => s2 + (g2[1] - g2[0]), 0);
        let left = slots;
        gaps.forEach((g2, gi) => {
          const share = gi === gaps.length - 1 ? left : Math.max(crowns.length === 1 ? 1 : 0, Math.round((slots * (g2[1] - g2[0])) / totalA));
          const cnt = Math.min(left, Math.max(gaps.length > 1 ? 1 : 0, share));
          left -= cnt;
          for (let i = 0; i < cnt; i++) cuts2.push([g2[0] + ((g2[1] - g2[0]) * i) / cnt, g2[0] + ((g2[1] - g2[0]) * (i + 1)) / cnt]);
        });
      };
      if (crowns.length === 1) slots = gaps.length;
      build();
      if (crowns.length > 1 && cuts2.length < crowns.length) {
        reps = 1;
        slots = crowns.length;
        build();
      }
      if (!halves.length && crowns.length > 1) {
        // o primeiro setor fica centrado na frente
        const w = TAU / slots;
        cuts2 = Array.from({ length: slots }, (_, i) => [FRONT - w / 2 + i * w, FRONT + w / 2 + i * w]);
      }
      const single = crowns.length === 1 && !halves.length;
      cuts2.forEach((c, i) => sectors.push({ id: crowns[i % crowns.length], a: c[0], b: c[1], open: false, closed: single }));
    }
    if (crowns.length > 1 && !halves.length) say(`Reorganizamos para caber: ${listOf(rings)} dividem a coroa, em trechos alternados.`, rings);
    else if (rings.length > 2 || (crowns.length && halves.length)) say(`Reorganizamos para caber: ${listOf(rings)} dividem a borda do topo.`, rings);
  }
  rings.forEach((id) => {
    const pl = P(id);
    pl.zone = zones[id] === 'crown' ? 'crown' : sectors.find((s) => s.id === id)?.side || 'left';
    pl.scale = ringScale;
  });

  /** Peça de coroa / meia-lua de cada decoração. q = { x, z, ox, oz, u, taper, i, n, prev, s } */
  const ringPiece = {
    frutas: (q, r) => {
      if (q.i % 2 === 0) {
        const lean = 1.0 + r() * 0.3;
        const sc = (0.88 + r() * 0.14) * q.taper * q.s;
        return { t: 'S', x: q.x, y: topY, z: q.z, ox: q.ox, oz: q.oz, s: sc, lean, yaw: (r() - 0.5) * 0.4, vol: VOL.berryLying(q.x, topY, q.z, q.ox, q.oz, sc, lean) };
      }
      // entre dois morangos: framboesa na frente e mirtilos por dentro
      const k = 0.92 * q.taper * q.s;
      const x = q.x + q.ox * 0.05 * q.s;
      const z = q.z + q.oz * 0.05 * q.s;
      return { t: 'R', x, y: topY - 0.004, z, k, extra: [[-0.115, 0], [-0.03, 0.105], [-0.2, 0.05]], ox: q.ox, oz: q.oz, vol: VOL.raspberry(x, topY - 0.004, z, k) };
    },
    morangos: (q, r) => {
      const lean = 0.92 + r() * 0.25;
      const sc = (0.9 + r() * 0.14) * q.taper * q.s;
      return { t: 'S', x: q.x, y: topY, z: q.z, ox: q.ox, oz: q.oz, s: sc, lean, yaw: (r() - 0.5) * 0.4, vol: VOL.berryLying(q.x, topY, q.z, q.ox, q.oz, sc, lean) };
    },
    cerejas: (q, r) => {
      const sc = (0.9 + r() * 0.14) * q.taper * q.s;
      const a = Math.atan2(q.oz, q.ox) + (q.i % 2 ? 1 : -1) * (Math.PI / 2 + r() * 0.5);
      const tilt = 0.08 + r() * 0.26;
      const spin = r() * TAU;
      const v = r() < 0.5 ? 0 : 1;
      return { t: 'cherry', x: q.x, y: topY, z: q.z, s: sc, a, tilt, spin, v, vol: VOL.cherry(q.x, topY, q.z, sc, a, tilt, spin, v) };
    },
    flores: (q, r) => {
      const ends = q.open && (q.i === 0 || q.i === q.n - 1) && q.n > 2;
      if (ends) {
        const k = 0.9 * flowerScale * q.s;
        return { t: 'blossom', x: q.x, y: topY, z: q.z, k, vol: VOL.blossom(q.x, topY, q.z, k) };
      }
      const K = (q.open ? 0.66 + 0.3 * Math.sin(Math.PI * q.u) : 0.74 + (q.i % 2) * 0.12) * flowerScale * 1.12 * q.s;
      return { t: 'rose', x: q.x, y: topY, z: q.z, K, tx: q.ox, tz: q.oz, tilt: 0.2 + r() * 0.1, leaves: true, inner: true, ox: q.ox, oz: q.oz, vol: VOL.rose(q.x, topY, q.z, K) };
    },
    margaridas: (q) => {
      const s = (q.i % 2 ? 0.8 : 1.02) * q.taper * q.s;
      return { t: 'daisy', x: q.x, y: topY + (q.i % 2) * 0.004, z: q.z, ox: q.ox, oz: q.oz, s, leaf: q.i % 2 === 0, garland: q.i % 2 === 0, vol: VOL.daisy(q.x, topY, q.z, s) };
    },
    peonias: (q) => {
      const s = q.size * q.s * (0.62 + 0.4 * Math.sin(Math.PI * q.u)) * 0.8;
      return { t: 'peony', x: q.x, y: topY, z: q.z, s, ox: q.ox, oz: q.oz, tilt: 0.22, leaves: true, vol: VOL.peony(q.x, topY, q.z, s, q.ox, q.oz, 0.22) };
    },
    macarons: (q) => {
      // em fila, cada um deitado sobre o anterior (dominós caídos); o primeiro do grupo fica deitado
      const s = q.s;
      const stepLen = q.prev ? Math.hypot(q.x - q.prev.x, q.z - q.prev.z) : 0;
      const elev = q.prev ? Math.acos(clamp((MAC_T * s * 0.97) / stepLen, 0, 1)) : Math.PI / 2 - 0.04;
      // tangente no sentido da fila
      const tx = -q.oz;
      const tz = q.ox;
      const nx = tx * Math.cos(elev);
      const ny = Math.sin(elev);
      const nz = tz * Math.cos(elev);
      const yc = topY + (MAC_R * Math.cos(elev) + (MAC_T / 2) * Math.sin(elev)) * s - 0.004;
      return { t: 'mac', x: q.x, y: yc, z: q.z, nx, ny, nz, s, dx: tx, dz: tz, elev, vol: VOL.macaron(q.x, yc, q.z, nx, ny, nz, s) };
    },
    brigadeiros: (q, r) => {
      const sc = (0.96 + r() * 0.06) * (0.8 + 0.2 * q.taper) * q.s;
      return { t: 'brig', x: q.x, y: topY, z: q.z, s: sc, vol: VOL.brigadeiro(q.x, topY, q.z, sc) };
    },
    bombons: (q, r) => {
      const sc = (0.94 + r() * 0.08) * (0.82 + 0.18 * q.taper) * q.s;
      return { t: 'bombom', x: q.x, y: topY, z: q.z, s: sc, vol: VOL.bombom(q.x, topY, q.z, sc) };
    },
    suspiros: (q, r) => {
      const sc = (q.i % 2 ? 0.84 : 1.0) * (0.8 + 0.2 * q.taper) * q.s;
      const tall = 0.94 + r() * 0.12;
      return { t: 'meringue', x: q.x, y: topY, z: q.z, s: sc, tall, vol: VOL.meringue(q.x, topY, q.z, sc, tall) };
    },
    marshmallows: (q, r) => {
      const sc = (0.9 + r() * 0.1) * q.taper * q.s;
      const lying = q.i % 3 === 2;
      const squash = lying ? 1 : 0.9 + r() * 0.12;
      const yc = topY + 0.1 * sc * squash - 0.004;
      return { t: 'marsh', x: q.x, y: yc, z: q.z, s: sc, lying, squash, vol: VOL.marshmallow(q.x, yc, q.z, sc) };
    },
    biscoitos: (q, r) => {
      // em pé, fincados na cobertura, com a face em relevo virada para fora; apertados, giram e se sobrepõem
      const s = (0.86 + 0.14 * q.taper) * q.s;
      const stepLen = q.prev ? Math.hypot(q.x - q.prev.x, q.z - q.prev.z) : 1;
      const yaw = stepLen < 0.3 * s ? Math.acos(clamp((stepLen / s - 0.02) / 0.31, 0.3, 1)) : (r() - 0.5) * 0.2;
      const a = Math.atan2(q.oz, q.ox) + yaw;
      const elev = 0.2 + r() * 0.1;
      const nx = Math.cos(a) * Math.cos(elev);
      const ny = Math.sin(elev);
      const nz = Math.sin(a) * Math.cos(elev);
      const yc = topY + (COOKIE_R * Math.cos(elev) + (COOKIE_T / 2) * Math.sin(elev)) * s - 0.034;
      return { t: 'cookie', x: q.x, y: yc, z: q.z, nx, ny, nz, s, a, elev, vol: VOL.cookie(q.x, yc, q.z, nx, ny, nz, s) };
    },
    ouro: (q) => ({ t: 'gold', x: q.x, y: topY, z: q.z, spread: 0.05, n: 3, vol: [[q.x, topY, q.z, 0.06, 'coating']] }),
    coracoes: (q, r) => {
      const s = (q.i % 2 ? 0.92 : 1.16) * (0.8 + 0.2 * q.taper) * q.s;
      const lean = 0.16 + r() * 0.12;
      const yc = topY + 0.07 * Math.cos(lean) * s - 0.014;
      const x = q.x - q.ox * 0.07 * Math.sin(lean) * s * 0.5;
      const z = q.z - q.oz * 0.07 * Math.sin(lean) * s * 0.5;
      return { t: 'heart', x: q.x, y: yc, z: q.z, ox: q.ox, oz: q.oz, s, lean, roll: (r() - 0.5) * 0.2, stand: true, vol: VOL.heart(x, yc, z, s) };
    },
    borboletas: (q, r) => {
      const s = (0.85 + r() * 0.3) * (0.8 + 0.2 * q.taper) * q.s;
      const open = 0.75 + r() * 0.45;
      return { t: 'fly', x: q.x, y: topY + 0.002, z: q.z, s, open, vol: VOL.butterfly(q.x, topY + 0.002, q.z, s, open) };
    },
  };

  const ringCount = {};
  sectors.forEach((sec) => {
    const id = sec.id;
    const sp = SPEC[id];
    if (!sp) return;
    const pl = P(id);
    const k = qty(id);
    const r = R(`anel${id}${sec.a.toFixed(2)}`);
    const o = own(id);
    const s = ringScale;
    if (id === 'raspas') {
      // faixa de raspas ao longo do setor (a região inteira é reservada; o construtor espalha dentro dela)
      const bw = 0.085;
      sectorSpots(edge + bw + GAP, sec.a, sec.b, bw * 1.7, bw, sec.closed).forEach((p, i, all) => {
        const taper = sec.open ? Math.sin(Math.PI * (all.length > 1 ? i / (all.length - 1) : 0.5)) : 1;
        const rad = bw * (0.55 + 0.45 * taper);
        if (!inside(p.x, p.z, rad) || occ.hitCyl(p.x, p.z, rad, topY, topY + 0.09, GAP, o)) return;
        occ.addCyl(o, p.x, p.z, rad, topY, topY + 0.09, 'solid');
        pl.regions.push({ x: p.x, z: p.z, r: rad, h: 0.06 + 0.03 * taper });
      });
      return;
    }
    // medidas desta decoração na coroa: out = quanto a peça avança para a borda · step = distância entre vizinhas ·
    // half = meia peça (folga até a divisa do setor)
    let size = 0;
    let outR = sp.out * s;
    let step = Math.max(sp.touch, sp.step / Math.pow(k, 0.55)) * s;
    let half = sp.r * s;
    if (id === 'peonias') {
      size = Math.min(0.2 * peonyScale, (F - 0.02) / 2.2) / 0.2; // escala da flor na meia-lua
      const big = size * 0.82 * s; // a maior (no meio do arco)
      outR = 0.268 * big;
      step = Math.max(0.36, 0.424 / Math.pow(k * 0.8, 0.55)) * size * s;
      half = 0.268 * big * 0.7;
    } else if (id === 'flores') {
      outR = 0.172 * 0.96 * flowerScale * 1.12 * s;
      step = 0.3 * flowerScale * s;
      half = 0.1 * flowerScale * s;
    } else if (id === 'macarons') {
      step = Math.max(sp.touch, 0.339 / Math.pow(k * 1.75, 0.55)) * s;
      half = sp.r * 1.1 * s; // o primeiro da fila fica deitado; o último, apoiado, avança um pouco
    } else if (id === 'frutas') {
      step = Math.max(sp.touch, sp.step / Math.pow(k, 0.5)) * s;
    } else if (id === 'biscoitos') {
      // apertados, giram de lado (escamas): avançam mais para a borda
      if (step < 0.3 * s) outR = 0.175 * s;
    }
    half += GAP * 0.6;
    const pts = sectorSpots(edge + outR + GAP, sec.a, sec.b, step, half, sec.closed);
    ringCount[id] = (ringCount[id] || 0) + pts.length;
    let prev = null;
    let placed = 0;
    pts.forEach((p, i) => {
      const u = sec.closed ? i / pts.length : pts.length === 1 ? 0.5 : i / (pts.length - 1);
      const taper = sec.open ? 0.7 + 0.3 * Math.sin(Math.PI * u) : 1;
      const q = { x: p.x, z: p.z, ox: Math.cos(p.theta), oz: Math.sin(p.theta), u, taper, i, n: pts.length, prev, s, open: sec.open, size };
      const piece = ringPiece[id](q, r);
      if (!put(id, piece)) {
        prev = null;
        return;
      }
      piece.u = u;
      piece.taper = taper;
      piece.sector = sectors.indexOf(sec);
      prev = { x: p.x, z: p.z };
      placed++;
    });
    pl.placedRing = (pl.placedRing || 0) + placed;
  });
  // coroa fechada de macarons: o primeiro apoia no último (se os dois existirem lado a lado)
  rings.forEach((id) => {
    const pl = P(id);
    if (id !== 'raspas' && !pl.pieces.length && !pl.regions.length) pl.unfit = true;
    else if (id !== 'raspas' && ringCount[id] && (pl.placedRing || 0) <= ringCount[id] * 0.6 && ringCount[id] - (pl.placedRing || 0) >= 2) {
      say(`Reduzimos a quantidade de ${bare(id)} na borda para não encostar nas outras peças.`);
    }
    if (id === 'raspas' && !pl.regions.length) pl.unfit = true;
  });

  /* ══ 5. Espalhados: ocupam o que sobrou do topo (e, em algumas decorações, a lateral) ══ */
  const scatterTop = (id, size, rPiece, want, make, seed) => {
    const r = R(`espalha${seed || id}`);
    const b = m.bounds;
    const pl = P(id);
    const mine = [];
    let got = 0;
    for (let tries = 0; tries < want * 40 && got < want; tries++) {
      const x = b.minX + r() * (b.maxX - b.minX);
      const z = b.minZ + r() * (b.maxZ - b.minZ);
      if (!inside(x, z, rPiece)) continue;
      if (mine.some((q) => Math.hypot(q[0] - x, q[1] - z) < size * 2.05)) continue;
      const dd = Math.hypot(x - cx, z - cz) || 1;
      const piece = make(x, z, (x - cx) / dd, (z - cz) / dd, got, r);
      if (!put(id, piece)) continue;
      mine.push([x, z]);
      got++;
    }
    pl.want = (pl.want || 0) + want;
    return got;
  };
  /** Peças espalhadas pela lateral de um andar, dentro da faixa livre. */
  const scatterSide = (id, s, want, rPiece, depth, yPick, make, seed) => {
    if (s.t.naked) return 0;
    if (s.hi - s.lo < 2 * rPiece) {
      if (s.why) sideLimited = sideLimited || s.why;
      return 0;
    }
    const r = R(`lateral${seed || id}${s.t.index}`);
    const o = own(id);
    const pl = P(id);
    let got = 0;
    for (let tries = 0; tries < want * 14 && got < want; tries++) {
      const at = r() * s.t.frost.length;
      const yWant = yPick(r, s);
      if (s.why && yWant + rPiece > s.hi) sideLimited = sideLimited || s.why;
      const y = clamp(yWant, s.lo + rPiece, s.hi - rPiece);
      const pt = pathAt(s.t.frost, at, {});
      const x = pt.x + pt.nx * (s.out + depth);
      const z = pt.z + pt.nz * (s.out + depth);
      const piece = make({ x, y, z, ox: pt.nx, oz: pt.nz }, got, r);
      if (!inBand(s, piece.vol) || !fits(o, piece.vol)) continue;
      // peças da mesma decoração não se encostam na lateral
      if (pl.pieces.some((q) => q.side && Math.hypot(q.x - x, q.y - y, q.z - z) < rPiece * 2.15)) continue;
      reserve(o, piece.vol);
      pl.pieces.push(piece);
      got++;
    }
    return got;
  };
  const topSide = sides[sides.length - 1];
  const scatters = items.filter((id) => zones[id] === 'scatter' && SPEC[id]?.scat);
  // primeiro as peças maiores: as miúdas preenchem depois
  [...scatters]
    .sort((a, b) => SPEC[b].scat[0] - SPEC[a].scat[0])
    .forEach((id) => {
      const sp = SPEC[id];
      const k = qty(id);
      const [size, count] = sp.scat;
      const want = Math.max(2, Math.round(count * k * 1.3));
      const pl = P(id);
      pl.zone = 'scatter';
      let got = 0;
      if (id === 'cerejas') {
        got = scatterTop(id, size, 0.1, want, (x, z, ox, oz, i, r) => {
          const sc = 0.9 + r() * 0.14;
          const a = Math.atan2(oz, ox) + (r() - 0.5) * 1.6;
          const tilt = 0.08 + r() * 0.26;
          const spin = r() * TAU;
          const v = r() < 0.5 ? 0 : 1;
          return { t: 'cherry', x, y: topY, z, s: sc, a, tilt, spin, v, vol: VOL.cherry(x, topY, z, sc, a, tilt, spin, v) };
        });
      } else if (id === 'margaridas') {
        got = scatterTop(id, size, 0.14, want, (x, z, ox, oz, i, r) => {
          const s = 0.86 + r() * 0.26;
          return { t: 'daisy', x, y: topY, z, ox, oz, s, leaf: i % 2 === 0, vol: VOL.daisy(x, topY, z, s) };
        });
        // algumas também na lateral do andar de cima
        if (!m.naked) {
          const n = Math.round(m.frost.length * 1.1 * k);
          scatterSide(id, topSide, n, 0.14, 0.02, (r, s) => s.t.y0 + s.sideH - 0.15 - Math.pow(r(), 1.5) * Math.min(0.55, s.sideH * 0.6), (q, i, r) => {
            const s = 0.8 + r() * 0.26;
            return { t: 'daisy', x: q.x, y: q.y, z: q.z, ox: q.ox, oz: q.oz, s, up: 0, roll: r() * TAU, side: true, vol: VOL.daisySide(q.x, q.y, q.z, q.ox, 0, q.oz, s) };
          });
        }
      } else if (id === 'bombons') {
        got = scatterTop(id, size, 0.126, want, (x, z, ox, oz, i, r) => {
          const sc = 0.94 + r() * 0.08;
          return { t: 'bombom', x, y: topY, z, s: sc, vol: VOL.bombom(x, topY, z, sc) };
        });
      } else if (id === 'suspiros') {
        got = scatterTop(id, size, 0.12, want, (x, z, ox, oz, i, r) => {
          const sc = 0.72 + r() * 0.36;
          const tall = 0.94 + r() * 0.12;
          return { t: 'meringue', x, y: topY, z, s: sc, tall, vol: VOL.meringue(x, topY, z, sc, tall) };
        });
      } else if (id === 'marshmallows') {
        got = scatterTop(id, size, 0.13, want, (x, z, ox, oz, i, r) => {
          const sc = 0.92 + r() * 0.1;
          const lying = r() < 0.4;
          const squash = lying ? 1 : 0.9 + r() * 0.12;
          const yc = topY + 0.1 * sc * squash - 0.004;
          return { t: 'marsh', x, y: yc, z, s: sc, lying, squash, vol: VOL.marshmallow(x, yc, z, sc) };
        });
        // mini marshmallows soltos entre os grandes
        scatterTop(id, 0.07, 0.066, Math.max(2, Math.round(6 * k * 1.3)), (x, z, ox, oz, i, r) => {
          const lying = r() < 0.5;
          const yc = topY + 0.05 - 0.004;
          return { t: 'marsh', x, y: yc, z, s: 0.5, lying, squash: 1, mini: true, vol: VOL.marshmallow(x, yc, z, 0.5) };
        }, 'minimarsh');
      } else if (id === 'ouro') {
        got = scatterTop(id, size, 0.1, want, (x, z) => ({ t: 'gold', x, y: topY, z, spread: 0.09, vol: [[x, topY, z, 0.1, 'coating']] }));
        if (!fenced) {
          sides.forEach((s) => {
            if (s.t.naked) return;
            const n = Math.max(3, Math.round(s.t.frost.length * 1.1 * k));
            scatterSide(id, s, n, 0.11, 0.004, (r, ss) => ss.t.y0 + ss.sideH * (0.2 + 0.65 * r()), (q) => ({ t: 'gold', x: q.x, y: q.y, z: q.z, ox: q.ox, oz: q.oz, side: true, spread: 0.11, vol: [[q.x, q.y, q.z, 0.11, 'coating']] }));
          });
        }
      } else if (id === 'coracoes') {
        got = scatterTop(id, size, 0.073 * 1.3, want, (x, z, ox, oz, i, r) => {
          const s = 0.8 + r() * 0.5;
          if (r() < 0.45) {
            // fincado na cobertura, meio deitado para trás
            const a = Math.PI * 0.5 + (r() - 0.5) * 1.6;
            const lean = 0.25 + r() * 0.4;
            const yc = topY + (0.07 * Math.cos(lean) + 0.02 * Math.sin(lean)) * s - 0.012;
            return { t: 'heart', x, y: yc, z, ox: Math.cos(a), oz: Math.sin(a), s, lean, roll: (r() - 0.5) * 0.4, stand: true, vol: VOL.heart(x, yc, z, s) };
          }
          return { t: 'heart', x, y: topY + 0.024 * s, z, s, spin: r() * TAU, flat: true, vol: VOL.heart(x, topY + 0.024 * s, z, s) };
        });
        if (!m.naked) {
          const n = Math.round(m.frost.length * 1.5 * k);
          scatterSide(id, topSide, n, 0.085, 0.02, (r, s) => s.t.y0 + s.sideH * (0.5 + 0.42 * r()), (q, i, r) => {
            const s = 0.7 + r() * 0.4;
            return { t: 'heart', x: q.x, y: q.y, z: q.z, ox: q.ox, oz: q.oz, s, roll: (r() - 0.5) * 0.8, side: true, vol: VOL.heart(q.x, q.y, q.z, s, 'side') };
          });
        }
      } else if (id === 'borboletas') {
        got = scatterTop(id, size, 0.105, want, (x, z, ox, oz, i, r) => {
          const s = 0.85 + r() * 0.35;
          const open = 0.75 + r() * 0.45;
          return { t: 'fly', x, y: topY + 0.002, z, s, open, vol: VOL.butterfly(x, topY + 0.002, z, s, open) };
        });
      }
      if (!got) pl.unfit = true;
      else if (got < want * 0.4 && want - got >= 4) say(`Couberam menos ${bare(id)} que o normal: o topo já está cheio.`);
    });

  /* guirlanda de margaridas: quem está em coroa ganha algumas flores na lateral, logo abaixo da borda */
  if (has('margaridas') && (zones.margaridas === 'crown' || zones.margaridas === 'half') && !m.naked) {
    const o = own('margaridas');
    const r = R('guirlanda');
    const s0 = topSide;
    P('margaridas').pieces.filter((q) => q.garland).forEach((q) => {
      const a = Math.atan2(q.z - cz, q.x - cx) + (r() - 0.5) * 0.08;
      const s2 = (0.78 + r() * 0.24) * (q.taper || 1);
      const y = s0.t.y0 + s0.sideH - 0.13 - r() * 0.08;
      const dist = rayHit(m.frost, cx, cz, a) + s0.out + 0.006;
      const x = cx + Math.cos(a) * dist;
      const z = cz + Math.sin(a) * dist;
      const l = Math.hypot(1, 0.12);
      const piece = { t: 'daisy', x, y, z, ox: Math.cos(a), oz: Math.sin(a), s: s2, up: 0.12, roll: r() * TAU, side: true, vol: VOL.daisySide(x, y, z, Math.cos(a) / l, 0.12 / l, Math.sin(a) / l, s2) };
      if (!inBand(s0, piece.vol) || !fits(o, piece.vol)) return;
      reserve(o, piece.vol);
      P('margaridas').pieces.push(piece);
    });
  }

  /* folha de ouro em coroa: respingos descendo o começo da lateral */
  if (has('ouro') && zones.ouro === 'crown' && !m.naked && !fenced && base.border < 0.06) {
    const n = Math.round(m.frost.length * 2.2 * qty('ouro'));
    scatterSide('ouro', topSide, n, 0.05, 0.004, (r, s) => s.t.y0 + s.sideH - 0.03 - Math.pow(r(), 1.6) * 0.22, (q) => ({ t: 'gold', x: q.x, y: q.y, z: q.z, ox: q.ox, oz: q.oz, side: true, spread: 0.05, n: 3, vol: [[q.x, q.y, q.z, 0.05, 'coating']] }), 'ourocoroa');
  }

  /* ══ 6. Acabamentos das peças: folhas, florzinhas e frutas miúdas, só onde sobrou lugar ══ */
  items.forEach((id) => {
    const pl = plan[id];
    if (!pl) return;
    const r = R(`folhas${id}`);
    const o = own(id);
    const extra = [];
    const tryExtra = (piece) => {
      if (!fits(o, piece.vol)) return false;
      reserve(o, piece.vol);
      extra.push(piece);
      return true;
    };
    if (id === 'flores') {
      pl.pieces.forEach((q) => {
        if (q.t === 'rose' && !q.side) {
          // duas ou três folhas saindo de baixo da rosa
          const n = 2 + (r() < 0.5 ? 1 : 0);
          const a0 = r() * TAU;
          for (let i = 0; i < n; i++) {
            const a = a0 + (i / n) * TAU + (r() - 0.5) * 0.7;
            const L = (0.9 + r() * 0.3) * flowerScale;
            const lx = q.x + Math.cos(a) * 0.08 * q.K;
            const lz = q.z + Math.sin(a) * 0.08 * q.K;
            // só a parte da folha que passa da rosa conta
            const vol = VOL.leaf(lx, topY, lz, a, L).filter((v) => Math.hypot(v[0] - q.x, v[2] - q.z) + v[3] > 0.172 * q.K);
            tryExtra({ t: 'leaf', x: lx, y: topY + 0.004, z: lz, a, L, tint: r() < 0.5 ? 1 : 0, vol });
          }
          if (q.inner) {
            // florzinha por dentro da coroa, entre as rosas
            const k = (0.8 + 0.2 * (q.taper || 1)) * flowerScale;
            const dist = 0.172 * q.K + 0.08 * k + GAP;
            const bx = q.x - q.ox * dist - q.oz * 0.07;
            const bz = q.z - q.oz * dist + q.ox * 0.07;
            tryExtra({ t: 'blossom', x: bx, y: topY, z: bz, k, vol: VOL.blossom(bx, topY, bz, k) });
          }
        } else if (q.side && q.leaf) {
          const L = 1.1 * flowerScale;
          const vol = [[q.x - q.oz * 0.112 * L + q.ox * 0.02, q.y - 0.02 + 0.056 * L, q.z + q.ox * 0.112 * L + q.oz * 0.02, 0.036 * L, 'side']];
          if (inBand(sideOf(q.y), vol)) tryExtra({ t: 'leaf', x: q.x, y: q.y - 0.02, z: q.z, ox: q.ox, oz: q.oz, L, side: true, vol });
        }
      });
      if (pl.fill && pl.fill.n) {
        const f = pl.fill;
        for (let i = 0; i < f.n; i++) {
          const a = (i / f.n) * TAU + r() * 0.5;
          const dist = f.r0 + r() * Math.max(0, f.r - f.r0 - 0.07);
          const k = flowerScale * (0.85 + r() * 0.3) * (pl.scale || 1);
          const x = f.x + Math.cos(a) * dist;
          const z = f.z + Math.sin(a) * dist;
          if (Math.hypot(x - f.x, z - f.z) + 0.08 * k > f.r) continue;
          tryExtra({ t: 'blossom', x, y: topY, z, k, vol: VOL.blossom(x, topY, z, k) });
        }
      }
    } else if (id === 'frutas') {
      if (pl.fill) {
        // frutas pequenas preenchendo os vãos e a beira do arranjo
        const f = pl.fill;
        const own2 = [];
        let got = 0;
        for (let i = 0; i < 260 && got < f.n; i++) {
          const a = r() * TAU;
          const dist = Math.sqrt(r()) * (f.r - 0.07);
          const x = f.x + Math.cos(a) * dist;
          const z = f.z + Math.sin(a) * dist;
          const isRasp = r() < 0.38;
          const k = (isRasp ? 0.9 + r() * 0.2 : 0.86 + r() * 0.3) * (pl.scale || 1);
          const vol = isRasp ? VOL.raspberry(x, topY - 0.004, z, k) : VOL.blueberry(x, topY, z, k);
          // não entra nos morangos do próprio arranjo
          if (occ.hit(vol[0][0], vol[0][1], vol[0][2], vol[0][3], 0.002, -1)) continue;
          if (Math.hypot(x - f.x, z - f.z) + vol[0][3] > f.r) continue;
          void own2;
          if (tryExtra({ t: isRasp ? 'R' : 'B', x, y: topY - (isRasp ? 0.004 : 0), z, k, vol })) got++;
        }
      }
      pl.pieces.forEach((q) => {
        if (q.t !== 'R' || !q.extra) return;
        // mirtilos por dentro da coroa, atrás da framboesa
        q.extra.forEach(([dr, dt]) => {
          const x = q.x + q.ox * dr + -q.oz * dt;
          const z = q.z + q.oz * dr + q.ox * dt;
          const k = (0.86 + r() * 0.24) * (q.k / 0.92);
          const vol = VOL.blueberry(x, topY, z, k);
          if (occ.hit(vol[0][0], vol[0][1], vol[0][2], vol[0][3], 0.002, -1)) return;
          tryExtra({ t: 'B', x, y: topY, z, k, vol });
        });
      });
    } else if (id === 'margaridas') {
      pl.pieces.forEach((q) => {
        if (q.t !== 'daisy' || !q.leaf) return;
        if (q.side) {
          const L = 0.9 * q.s;
          const vol = [[q.x - q.oz * 0.112 * L + q.ox * 0.02, q.y - 0.02 + 0.056 * L, q.z + q.ox * 0.112 * L + q.oz * 0.02, 0.036 * L, 'side']];
          if (inBand(sideOf(q.y), vol)) tryExtra({ t: 'leaf', x: q.x, y: q.y - 0.02, z: q.z, ox: q.ox, oz: q.oz, s: q.s, L, side: true, vol });
          return;
        }
        const a = Math.atan2(q.oz, q.ox) + Math.PI + (r() - 0.5) * 2.4;
        tryExtra({ t: 'leaf', x: q.x, y: q.y, z: q.z, a, s: q.s, vol: VOL.daisyLeaf(q.x, topY, q.z, a, q.s) });
      });
    } else if (id === 'peonias') {
      pl.pieces.forEach((q) => {
        if (q.t !== 'peony') return;
        if (q.side) {
          // a folha da flor da lateral fica inteira por baixo dela (não ocupa lugar a mais)
          extra.push({ t: 'leaf', x: q.x, y: q.y, z: q.z, ox: q.ox, oz: q.oz, s: q.s, side: true, vol: [] });
          return;
        }
        const n = 2 + (r() < 0.5 ? 1 : 0);
        const a0 = r() * TAU;
        for (let i = 0; i < n; i++) {
          const a = a0 + (i / n) * TAU + (r() - 0.5) * 0.7;
          const L = (1.25 + r() * 0.3) * q.s;
          tryExtra({ t: 'leaf', x: q.x, y: topY + 0.004, z: q.z, a, s: q.s, L, tint: r() < 0.5 ? 1 : 0, vol: VOL.peonyLeaf(q.x, topY, q.z, a, q.s, L).filter((v) => Math.hypot(v[0] - q.x, v[2] - q.z) + v[3] > 0.268 * q.s) });
        }
      });
    }
    extra.forEach((piece) => pl.pieces.push(piece));
  });

  /* ══ 7. O que não coube, alturas e chave ══ */
  const unfit = [];
  items.forEach((id) => {
    const pl = plan[id];
    if (id === 'velas' || id === 'topo') return;
    if (id === 'baloes' || id === 'pirulitos') {
      if (!pl || !pl.pieces.length) unfit.push(id);
      else if (pl.pieces.length < pl.want && pl.want - pl.pieces.length >= 2) say(`Cabem ${pl.pieces.length} ${bare(id)} neste topo (o normal seriam ${pl.want}).`);
      if (pl && pl.scale < 0.9 && pl.pieces.length) say(`${cap(NAMES[id])} ficaram menores para caber no topo com as outras peças.`);
      return;
    }
    if (pl && pl.unfit) unfit.push(id);
    if (id === 'coracoes' && zones.coracoes === 'palito' && pl && !pl.pieces.length) unfit.push(id);
  });
  if (notes.unfitIds.includes('topo')) unfit.push('topo');
  const uniq = [...new Set(unfit)];
  if (uniq.length) {
    const cm = Math.round(m.R * 20);
    const where = stack.length > 1 ? 'O andar de cima' : 'O topo deste bolo';
    notes.unfit.unshift(`${where} tem ${cm} cm: não ${many(uniq) ? 'couberam' : 'coube'} ${listOf(uniq, true)} junto com o resto. Tire ${uniq.length > 1 ? 'um desses itens' : 'outra decoração'} ou escolha um bolo maior.`);
    uniq.forEach((id) => notes.unfitIds.push(id));
    // quem não coube não pode aparecer também como "ficou menor" ou "dividiu a borda"
    notes.messages = notes.messages.filter((msg) => !(about.get(msg) || []).some((id) => uniq.includes(id)));
  }
  if (sideLimited) say(sideLimited === 'calda' ? 'Com a calda escorrendo, as peças da lateral ficam abaixo das gotas.' : 'Com as guirlandas do acabamento vintage, as peças da lateral ficam abaixo delas.');
  notes.unfit.forEach((msg) => {
    if (!notes.messages.includes(msg)) notes.messages.push(msg);
  });
  if (notes.unfit.length) notes.adapted = true;
  notes.unfitIds = [...new Set(notes.unfitIds)];

  // alturas (acima do topo) por família — para o enquadramento da câmera
  const fam = { decor: 0, extra: 0, party: 0 };
  const CLASSIC = new Set(['frutas', 'flores', 'raspas', 'velas', 'toppers:placa', 'toppers:estrela']);
  const PARTY = new Set(['escrita', 'toponome']);
  const nameOf = new Map([...owners.entries()].map(([name, o]) => [o, name]));
  occ.items.forEach((it) => {
    if (it.dead) return;
    const name = nameOf.get(it.o) || '';
    if (name.startsWith('~')) return;
    const h = it.y1 - topY;
    if (h <= 0) return;
    if (name === 'velas' && special) fam.party = Math.max(fam.party, h);
    else if (PARTY.has(name)) fam.party = Math.max(fam.party, h);
    else if (CLASSIC.has(name)) fam.decor = Math.max(fam.decor, h);
    else fam.extra = Math.max(fam.extra, h);
  });

  // chave: muda sempre que alguma peça muda de lugar ou de tamanho
  let hash = 2166136261;
  const mix = (v) => {
    hash = Math.imul(hash ^ Math.round(v * 1000), 16777619);
  };
  occ.items.forEach((it) => {
    if (it.dead) return;
    mix(it.o);
    mix(it.x);
    mix(it.y);
    mix(it.z);
    mix(it.r);
  });
  Object.values(plan).forEach((pl) => mix(pl.scale || 1));

  const layoutZones = {};
  items.forEach((id) => {
    const z = plan[id]?.zone || zones[id];
    if (z) layoutZones[id] = z === 'half' ? 'left' : z;
  });

  return {
    key: (hash >>> 0).toString(36),
    zones: layoutZones,
    plan,
    party,
    notes,
    occ,
    edge,
    necklace,
    sides: sides.map((s) => ({ lo: s.lo, hi: s.hi, out: s.out, why: s.why, sideH: s.sideH })),
    fenceOut,
    heights: fam,
    stage: { r: Fi, free: F, ringW, ringScale, mid: midR },
    centerTaken,
  };
}

/** Ponto da lateral de um andar que olha de frente para quem vê o bolo (no coração, o flanco direito). */
export function frontSpot(t) {
  const path = t.frost;
  const fx = t.shape === 'heart' ? 0.62 : t.shape === 'round' ? 0.3 : 0;
  const fz = t.shape === 'heart' ? 0.78 : t.shape === 'round' ? 0.954 : 1;
  let best = 0;
  for (let i = 1; i < path.n; i++) if (path.nx[i] * fx + path.nz[i] * fz > path.nx[best] * fx + path.nz[best] * fz) best = i;
  const run = [];
  for (let i = 0; i < path.n; i++) if (path.nx[i] * path.nx[best] + path.nz[i] * path.nz[best] > 0.9995) run.push(i);
  let x = 0;
  let z = 0;
  run.forEach((i) => {
    x += path.x[i];
    z += path.z[i];
  });
  return { x: x / run.length, z: z / run.length, nx: path.nx[best], nz: path.nz[best], flat: run.length > 3 };
}
