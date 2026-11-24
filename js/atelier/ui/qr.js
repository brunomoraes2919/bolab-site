// BOLAB — Ateliê: gerador de QR Code, feito aqui (sem biblioteca e sem serviço de fora: o endereço do bolo
// não sai do aparelho para virar imagem). Usado em "Mostrar para um adulto" (./card.js).
//
//   qrMatrix(texto, { level: 'M' | 'L' })  → { size, version, level, get(x, y) → true se o módulo é escuro } | null
//   qrPath(matriz)                          → o "d" de um <path> com todos os módulos escuros (1 unidade = 1 módulo)
//
// Modo de bytes (UTF-8), versões 1 a 40, correção L ou M, as 8 máscaras com a escolha pela menor penalidade.
// Módulo puro: roda no navegador e no Node (tools/tests/…), sem tela.

/* Tabelas da norma (ISO/IEC 18004), níveis L e M: bytes de correção por bloco e número de blocos, por versão. */
const ECC_PER_BLOCK = {
  L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
};
const BLOCKS = {
  L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
};
const LEVEL_BITS = { L: 1, M: 0 };

/** Módulos que sobram para dados + correção numa versão (tirando os desenhos fixos). */
function rawModules(ver) {
  let n = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const align = Math.floor(ver / 7) + 2;
    n -= (25 * align - 10) * align - 55;
    if (ver >= 7) n -= 36;
  }
  return n;
}
const dataCodewords = (ver, level) => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[level][ver] * BLOCKS[level][ver];

/* Reed–Solomon sobre GF(2^8), polinômio 0x11D. */
function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}
function rsDivisor(degree) {
  const out = new Array(degree).fill(0);
  out[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      out[j] = gfMul(out[j], root);
      if (j + 1 < degree) out[j] ^= out[j + 1];
    }
    root = gfMul(root, 2);
  }
  return out;
}
function rsRemainder(data, divisor) {
  const out = new Array(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ out.shift();
    out.push(0);
    for (let i = 0; i < divisor.length; i++) out[i] ^= gfMul(divisor[i], factor);
  }
  return out;
}

/** Os bytes do texto com cabeçalho, terminador e enchimento, já do tamanho da versão. */
function dataBytes(bytes, ver, level) {
  const bits = [];
  const push = (value, n) => {
    for (let i = n - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(4, 4); // modo de bytes
  push(bytes.length, ver < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const capacity = dataCodewords(ver, level) * 8;
  push(0, Math.min(4, capacity - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    out.push(b);
  }
  return out;
}

/** Divide em blocos, calcula a correção de cada um e entrelaça (como a norma manda). */
function withCorrection(data, ver, level) {
  const blocks = BLOCKS[level][ver];
  const ecc = ECC_PER_BLOCK[level][ver];
  const raw = Math.floor(rawModules(ver) / 8);
  const short = blocks - (raw % blocks);
  const shortLen = Math.floor(raw / blocks);
  const divisor = rsDivisor(ecc);
  const parts = [];
  for (let i = 0, k = 0; i < blocks; i++) {
    const dat = data.slice(k, k + shortLen - ecc + (i < short ? 0 : 1));
    k += dat.length;
    const rem = rsRemainder(dat, divisor);
    if (i < short) dat.push(0);
    parts.push(dat.concat(rem));
  }
  const out = [];
  for (let i = 0; i < parts[0].length; i++) {
    parts.forEach((block, j) => {
      if (i !== shortLen - ecc || j >= short) out.push(block[i]);
    });
  }
  return out;
}

function alignmentPositions(ver, size) {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const out = [6];
  for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
  return out;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** Penalidade de uma matriz pronta (as quatro regras da norma): quanto menor, mais fácil de ler. */
function penalty(m, size) {
  let score = 0;
  const at = (x, y) => m[y * size + x];
  // 1. sequências de 5 ou mais da mesma cor (linhas e colunas) · 3. o desenho 1:1:3:1:1 parecido com o canto
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < size; a++) {
      let run = 1;
      let hist = 0; // os últimos 11 módulos, em bits
      for (let b = 0; b < size; b++) {
        const v = pass ? at(a, b) : at(b, a);
        if (b > 0) {
          const prev = pass ? at(a, b - 1) : at(b - 1, a);
          if (v === prev) {
            run++;
            if (run === 5) score += 3;
            else if (run > 5) score++;
          } else run = 1;
        }
        hist = ((hist << 1) | v) & 0x7ff;
        if (b >= 10 && (hist === 0x05d || hist === 0x5d0)) score += 40;
      }
    }
  }
  // 2. blocos 2 × 2 da mesma cor
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const v = at(x, y);
      if (v === at(x + 1, y) && v === at(x, y + 1) && v === at(x + 1, y + 1)) score += 3;
    }
  }
  // 4. equilíbrio entre claro e escuro
  let dark = 0;
  for (let i = 0; i < m.length; i++) dark += m[i];
  score += Math.floor(Math.abs((dark * 20) / m.length - 10)) * 10;
  return score;
}

/**
 * A matriz do QR de um texto. Escolhe a menor versão em que ele cabe — com correção M quando isso não aumenta
 * demais o desenho, senão L. Devolve null se o texto não couber nem na versão 40.
 */
export function qrMatrix(text, { level = null } = {}) {
  const bytes = [...new TextEncoder().encode(String(text ?? ''))];
  const fits = (ver, lv) => 4 + (ver < 10 ? 8 : 16) + bytes.length * 8 <= dataCodewords(ver, lv) * 8;
  const smallest = (lv) => {
    for (let v = 1; v <= 40; v++) if (fits(v, lv)) return v;
    return 0;
  };
  let lv = level === 'L' || level === 'M' ? level : 'L';
  let ver = smallest(lv);
  if (!ver) return null;
  // sem nível pedido: sobe para M se a versão continuar a mesma (mais tolerante, mesmo tamanho)
  if (!level && fits(ver, 'M')) lv = 'M';
  const size = ver * 4 + 17;
  const mod = new Uint8Array(size * size);
  const fn = new Uint8Array(size * size); // 1 = módulo de desenho fixo (não recebe dado nem máscara)
  const set = (x, y, dark) => {
    mod[y * size + x] = dark ? 1 : 0;
    fn[y * size + x] = 1;
  };
  // linhas de sincronia
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  // os três cantos (com a margem branca em volta)
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, d !== 2 && d !== 4);
      }
    }
  }
  // marcas de alinhamento
  const align = alignmentPositions(ver, size);
  align.forEach((ax, i) => {
    align.forEach((ay, j) => {
      const last = align.length - 1;
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    });
  });
  // formato (escrito de verdade depois de escolher a máscara; aqui só reserva o lugar) e versão
  const drawFormat = (mask) => {
    const data = (LEVEL_BITS[lv] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i) => ((bits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  drawFormat(0);
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, dark);
      set(b, a, dark);
    }
  }
  // os dados, em ziguezague de baixo para cima a partir do canto de baixo à direita
  const words = withCorrection(dataBytes(bytes, ver, lv), ver, lv);
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const up = ((right + 1) & 2) === 0;
        const y = up ? size - 1 - vert : vert;
        if (fn[y * size + x] || k >= words.length * 8) continue;
        mod[y * size + x] = (words[k >>> 3] >>> (7 - (k & 7))) & 1;
        k++;
      }
    }
  }
  // a máscara de menor penalidade
  const applyMask = (mask) => {
    const test = MASKS[mask];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y * size + x] && test(x, y)) mod[y * size + x] ^= 1;
  };
  let best = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(mask);
    drawFormat(mask);
    const score = penalty(mod, size);
    if (score < bestScore) {
      bestScore = score;
      best = mask;
    }
    applyMask(mask); // desfaz (a máscara é um "ou exclusivo")
  }
  applyMask(best);
  drawFormat(best);
  return { size, version: ver, level: lv, mask: best, get: (x, y) => mod[y * size + x] === 1 };
}

/** O desenho do QR como um caminho de SVG: uma faixa por sequência de módulos escuros de cada linha. */
export function qrPath(qr) {
  let d = '';
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (!qr.get(x, y)) continue;
      let w = 1;
      while (x + w < qr.size && qr.get(x + w, y)) w++;
      d += `M${x} ${y}h${w}v1h${-w}z`;
      x += w;
    }
  }
  return d;
}
