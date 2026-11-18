// BOLAB — "kit" de peças: o contrato entre o distribuidor (occupancy.js), o painel e os módulos de peças
// carregados sob demanda (pecas-*.js).
//
// Cada decoração nova declara aqui (nos arquivos kit-*.js, que são só dados) o que ela OCUPA e como pode ser
// ARRUMADA; a malha de verdade mora no módulo de peças do grupo, que só é baixado quando a primeira peça do grupo
// é usada (ou num momento ocioso). Assim o distribuidor, o preço e o painel funcionam sem nenhum módulo de peças
// carregado, e a abertura do personalizador não fica mais pesada com o catálogo crescendo.
//
// Especificação de uma decoração (KIT[id]) — medidas em unidades do mundo (1 = 10 cm), na escala 1:
//   mod    grupo de módulo: 'frutas' | 'doces' | 'festa' | 'temas' | 'datas' (vem do arquivo kit-<mod>.js; a
//          malha fica em pecas-<mod>.js)
//   vars   variantes visuais: [{ r, h, sph, w }]
//            r = raio do pé (o que a peça ocupa no topo) · h = altura · w = peso no sorteio (padrão 1)
//            sph = esferas que cobrem a malha, em coordenadas DA PEÇA: [[x, y, z, raio, classe?]]
//                  (y sobe a partir do apoio; +z é a frente da peça). classe padrão = a da pose
//                  ('solid' apoiada no topo · 'side' colada na lateral · 'air' no palito); use 'air' numa parte
//                  alta e fina que pode passar da beira (cabinho, antena) e 'coating' em decalque chapado.
//   size   [mín, máx] da escala sorteada (padrão [0.94, 1.06])
//   face   para onde olha a frente (+z) no topo: 'rand' (padrão) | 'out' (para fora do bolo) | 'in' | 'tang' | 'front'
//   alt    true = na coroa as variantes se alternam em ordem (senão, sorteio pelo peso)
//   grow   0…1: quanto a peça acompanha o tamanho do bolo (0 = tamanho real fixo; padrão 0)
//   ring   coroa e meia-lua: { step, touch, out, band, minS }  (como SPEC em occupancy.js; touch ≤ step)
//   pile   montinho no centro: [raio de arranjo, quantas, altura do 2º andar (0 = não empilha)]
//   scat   espalhado no topo: [espaço por peça, quantas]
//   scatSide   espalhado também na lateral: { per (peças por unidade de perímetro), lo, hi (fração da altura) }
//   casc   cascata: [espaço, quantas]  (precisa de side)
//   side   como a peça cola na lateral: { v (variante; padrão a mesma), depth (afastamento do apoio), up (inclinação),
//            mode: 'base' (padrão: colada pelo pé, +y da peça sai do bolo — a mesma malha do topo) |
//                  'face' (decalque de frente: +z sai do bolo, +y sobe, +x à direita de quem olha),
//            roll: amplitude do giro sorteado (rad; false = sem giro) }
//   stick  no palito: { n: [pouco, médio, farto], h: [alturas…], gap, lean, fan, r (raio do palito) }
//            (a origem da peça é onde o palito entra nela; +y segue o palito, +z olha para a frente)
//   hero   peça única: { s: [mín, máx] }  → arranjos 'centro' (divide o centro com os outros arranjos) e
//            'fundo' (em pé no fundo do palco, deixando a frente livre)
//   front  uma peça na frente da lateral do andar de cima: { v, s: [mín, máx], y (fração da altura, do alto) }
//   band   faixa em volta do bolo (fita): { h, lift }  — ver 'fita' em occupancy.js
//   coat   confeito de cobertura (cai onde sobrar lugar, na hora de desenhar): { perArea, perSide, rad, flat, sideBand }
//   minS   menor escala aceitável (padrão 0.72)
//
// Poses (as mesmas contas servem ao distribuidor — volumes — e ao construtor — orientação da malha):
//   topo     basisTop(rot)                 → peça em pé, girada de rot em torno de Y
//   lateral  basisSide(ox, oz, up, roll)   → +y da peça aponta para fora do bolo
//   palito   basisStick(yaw, lean, roll)   → +y segue o palito, +z olha para a frente
import frutas from './kit-frutas.js';
import doces from './kit-doces.js';
import festa from './kit-festa.js';
import temas from './kit-temas.js';
import datas from './kit-datas.js';

/** id da decoração → especificação. */
export const KIT = {};
[['frutas', frutas], ['doces', doces], ['festa', festa], ['temas', temas], ['datas', datas]].forEach(([mod, specs]) => {
  Object.entries(specs).forEach(([id, spec]) => {
    KIT[id] = { mod, vars: [], size: [0.94, 1.06], face: 'rand', grow: 0, minS: 0.72, ...spec };
  });
});

export const kitOf = (id) => KIT[id] || null;

/** Confeito de cobertura (cai onde sobrar lugar, às centenas): os clássicos e os do kit. */
export const isCoat = (id) => id === 'granulado' || id === 'confete' || id === 'perolas' || Boolean(KIT[id]?.coat);
/**
 * Orçamento dos confeitos no celular (junção da rodada 5): com vários confeitos ao mesmo tempo num bolo grande,
 * cada um cai um pouco mais ralo — o conjunto continua farto e o bolo cabe nos ~150 mil triângulos do celular.
 * Até 3 confeitos num bolo de 3 andares nada muda. → fator de densidade (≤ 1); no computador, sempre 1.
 */
export function coatShare(config, m, tierDensity = 1) {
  if (!(tierDensity < 1) || !m) return 1;
  const n = (config?.decor?.items || []).filter(isCoat).length;
  if (n < 2) return 1;
  const stack = m.stack || [m];
  let area = (stack[0].frost.length * stack[0].frost.length) / (4 * Math.PI); // o topo (pelo perímetro do andar de baixo)
  stack.forEach((t) => (area += t.frost.length * t.Ht));
  const load = n * Math.max(1, area / 14);
  return load <= 6.6 ? 1 : Math.pow(6.6 / load, 1.3);
}

/* ───────── Poses: base ortonormal [X, Y, Z] da peça (colunas), sem depender do three.js ───────── */

/** Em pé no topo, girada de `rot` em torno de Y (a frente +z passa a apontar para (sen rot, cos rot)). */
export function basisTop(rot = 0) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [c, 0, -s, 0, 1, 0, s, 0, c];
}

/** Colada na lateral: +y para fora do bolo (um pouco para cima, se up > 0); roll gira em torno desse eixo. */
export function basisSide(ox, oz, up = 0, roll = 0) {
  const l = Math.hypot(ox, up, oz) || 1;
  const yx = ox / l;
  const yy = up / l;
  const yz = oz / l;
  // x0 = tangente horizontal; z0 = x0 × y
  const h = Math.hypot(ox, oz) || 1;
  const tx = -oz / h;
  const tz = ox / h;
  let zx = -tz * yy; // (tx, 0, tz) × (yx, yy, yz)
  let zy = tz * yx - tx * yz;
  let zz = tx * yy;
  const zl = Math.hypot(zx, zy, zz) || 1;
  zx /= zl;
  zy /= zl;
  zz /= zl;
  const c = Math.cos(roll);
  const s = Math.sin(roll);
  // gira x e z em torno de y
  return [tx * c + zx * s, zy * s, tz * c + zz * s, yx, yy, yz, zx * c - tx * s, zy * c, zz * c - tz * s];
}

/**
 * De frente, colada na lateral como um decalque: +z da peça sai do bolo (olha para quem vê), +y sobe e +x
 * aponta para a direita de quem olha — o mesmo desenho que serve num palito serve aqui. roll gira no plano.
 */
export function basisFace(ox, oz, roll = 0) {
  const h = Math.hypot(ox, oz) || 1;
  const zx = ox / h;
  const zz = oz / h;
  // x0 = y × z (direita de quem olha de fora)
  const x0x = zz;
  const x0z = -zx;
  const c = Math.cos(roll);
  const s = Math.sin(roll);
  return [x0x * c, s, x0z * c, -x0x * s, c, -x0z * s, zx, 0, zz];
}

/** No palito: a peça olha para `yaw` (0 = frente do bolo, +z), deitada `lean` para trás e rolada `roll`. */
export function basisStick(yaw = 0, lean = 0, roll = 0) {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const sl = Math.sin(lean);
  const cl = Math.cos(lean);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  // u = eixo do palito (+y da peça) · n = frente (+z da peça) · x = u × n
  const ux = -fx * sl * cr - fz * sr;
  const uy = cl * cr;
  const uz = -fz * sl * cr + fx * sr;
  const nx = fx * cl;
  const ny = sl;
  const nz = fz * cl;
  let xx = uy * nz - uz * ny;
  let xy = uz * nx - ux * nz;
  let xz = ux * ny - uy * nx;
  const xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl;
  xy /= xl;
  xz /= xl;
  // z ortogonal de verdade: x × u
  const zx = xy * uz - xz * uy;
  const zy = xz * ux - xx * uz;
  const zz = xx * uy - xy * ux;
  return [xx, xy, xz, ux, uy, uz, zx, zy, zz];
}

/** Volumes ([[x, y, z, r, classe]]) de uma variante colocada em (x, y, z) com a base B e a escala s. */
export function kitVolume(variant, x, y, z, B, s, cls = 'solid') {
  const out = [];
  const sph = variant.sph;
  for (let i = 0; i < sph.length; i++) {
    const [lx, ly, lz, lr, k] = sph[i];
    out.push([x + (B[0] * lx + B[3] * ly + B[6] * lz) * s, y + (B[1] * lx + B[4] * ly + B[7] * lz) * s, z + (B[2] * lx + B[5] * ly + B[8] * lz) * s, lr * s, k || cls]);
  }
  return out;
}

/** A base da pose de uma peça do plano ({ t: 'k', … }): a mesma que o distribuidor usou para os volumes. */
export function kitBasis(p) {
  if (p.pose === 'side') return p.face ? basisFace(p.ox, p.oz, p.roll || 0) : basisSide(p.ox, p.oz, p.up || 0, p.roll || 0);
  if (p.pose === 'stick') return basisStick(p.yaw || 0, p.lean || 0, p.roll || 0);
  return basisTop(p.rot || 0);
}

/** Giro da frente da peça no topo, conforme `face` (ox, oz = para fora do bolo naquele ponto). */
export function faceRot(face, ox, oz, rnd) {
  if (face === 'out') return Math.atan2(ox, oz);
  if (face === 'in') return Math.atan2(-ox, -oz);
  if (face === 'tang') return Math.atan2(-oz, ox);
  if (face === 'front') return 0;
  return rnd() * Math.PI * 2;
}

/** Sorteia uma variante pelo peso (ou alterna, se a decoração pedir). */
export function pickVariant(K, i, rnd, { alt = K.alt, only = null } = {}) {
  const list = only || K.vars.map((_, k) => k);
  if (alt) return list[i % list.length];
  let total = 0;
  for (let k = 0; k < list.length; k++) total += K.vars[list[k]].w ?? 1;
  let t = rnd() * total;
  for (let k = 0; k < list.length; k++) {
    t -= K.vars[list[k]].w ?? 1;
    if (t <= 0) return list[k];
  }
  return list[list.length - 1];
}

/** Variantes que servem para o topo (as marcadas `sideOnly` ou `stickOnly` ficam de fora). */
export function topVariants(K) {
  const list = [];
  K.vars.forEach((v, k) => {
    if (!v.sideOnly && !v.stickOnly) list.push(k);
  });
  return list.length ? list : [0];
}

/* ───────── Módulos de peças: carregados sob demanda ───────── */

const LOADERS = {
  frutas: () => import('./pecas-frutas.js'),
  doces: () => import('./pecas-doces.js'),
  festa: () => import('./pecas-festa.js'),
  temas: () => import('./pecas-temas.js'),
  datas: () => import('./pecas-datas.js'),
};
const ready = new Map(); // mod → { [id]: construtor(ctx, part) }
const loading = new Map(); // mod → Promise
const failed = new Set();
const listeners = new Set();
let epoch = 0;

/** Muda cada vez que um módulo de peças termina de carregar (entra na chave do plano: as peças são refeitas). */
export const kitEpoch = () => epoch;

/** Avisa quando um módulo de peças chega. fn devolve false para deixar de ouvir. → função que cancela. */
export function onDecorReady(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function loadModule(mod) {
  if (ready.has(mod)) return Promise.resolve(ready.get(mod));
  if (loading.has(mod)) return loading.get(mod);
  const load = LOADERS[mod];
  if (!load || failed.has(mod)) return Promise.resolve(null);
  const p = load().then(
    (ns) => {
      ready.set(mod, ns.BUILDERS || {});
      loading.delete(mod);
      epoch++;
      // quem ouve (o motor 3D de cada bolo aberto) refaz as peças que estavam esperando
      [...listeners].forEach((fn) => {
        try {
          if (fn(mod) === false) listeners.delete(fn);
        } catch (err) {
          console.error('[personalizador] módulo de peças', err);
        }
      });
      return ready.get(mod);
    },
    (err) => {
      // sem rede (ou arquivo faltando): o bolo continua aparecendo, só sem essas peças; tenta de novo depois
      console.error(`[personalizador] não deu para carregar as peças de "${mod}"`, err);
      loading.delete(mod);
      failed.add(mod);
      setTimeout(() => failed.delete(mod), 15000);
      return null;
    },
  );
  loading.set(mod, p);
  return p;
}

/**
 * O construtor de uma decoração do kit: função (ctx, part), ou null se o módulo dela ainda não chegou
 * (nesse caso o carregamento começa agora, e onDecorReady avisa quando terminar).
 */
export function kitBuilder(id) {
  const K = KIT[id];
  if (!K) return null;
  const mod = ready.get(K.mod);
  if (mod) return mod[id] || null;
  loadModule(K.mod);
  return null;
}

/** A decoração é do kit e o módulo dela ainda não está carregado? */
export const kitPending = (id) => Boolean(KIT[id]) && !ready.has(KIT[id].mod);

/** Ids de decoração que um bolo usa (itens escolhidos e peças com lugar escolhido). */
export function decorIdsOf(config) {
  const d = config?.decor || {};
  return [...new Set([...(d.items || []), ...(Array.isArray(d.placed) ? d.placed.map((p) => p.id) : [])])];
}

/**
 * Carrega os módulos de peças de que um bolo precisa (ou todos, sem argumento). Quem vai fotografar um bolo
 * na hora (miniatura, teste) espera por esta promessa antes de desenhar.
 */
export function ensureDecor(config) {
  const mods = config ? [...new Set(decorIdsOf(config).map((id) => KIT[id]?.mod).filter(Boolean))] : Object.keys(LOADERS);
  return Promise.all(mods.map(loadModule)).then(() => true);
}

/** Pré-aquecimento: baixa os módulos de peças um a um, em momentos ociosos (não disputa a abertura). */
export function warmDecorModules(delay = 2500) {
  const mods = Object.keys(LOADERS).filter((mod) => !ready.has(mod));
  const idle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 300));
  const next = () => {
    const mod = mods.shift();
    if (!mod) return;
    loadModule(mod).then(() => setTimeout(() => idle(next), 600));
  };
  setTimeout(() => idle(next), delay);
}
