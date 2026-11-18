// BOLAB — Ateliê, jogo: os desenhos. Tudo SVG montado em código (nada de imagem baixada): retratos dos clientes,
// figurinhas do álbum e os ícones pequenos da comanda. Só devolve texto: roda no Node e passa pela política de
// segurança (cores em atributos `fill`, sem <style>).
//
//   portraitSvg(retrato, humor)   humor: 'neutro' | 'feliz' | 'amou' | 'quase' | 'chateado'
//   stickerSvg(figurinha, { locked })
//   iconSvg(nome)                 ícones da comanda (16 px)

const INK = '#2a1a16';
const SKIN = { a: '#fbe0cf', b: '#f3cbb0', c: '#e0ac84', d: '#c68a5e', e: '#9c6644', f: '#74482c' };
const SKIN_SHADE = { a: '#efc4ad', b: '#e3b092', c: '#c98f66', d: '#ab7147', e: '#824f31', f: '#5c3620' };
const HAIR = { preto: '#2a1a16', castanho: '#6b3f22', loiro: '#e6b85c', ruivo: '#c45a2a', grisalho: '#a9a5a8', branco: '#ece9e6' };

/** Cabelo: [atrás da cabeça, na frente da cabeça]. A cabeça é uma elipse em (48, 45), raios 19 × 21. */
const HAIRS = {
  curto: (h) => ['', `<path d="M28 44c-1-15 8-25 20-25s21 10 20 25c-3-8-8-12-20-12s-17 4-20 12z" fill="${h}"/>`],
  franja: (h) => ['', `<path d="M27.5 46c-2-16 8-27 20.500-27s22.500 11 20.500 27c-1.500-5-3.500-7.500-5.500-9-9 3.500-21 3.500-30 0-2 1.500-4 4-5.500 9z" fill="${h}"/>`],
  topete: (h) => ['', `<path d="M28 44c-1-11 5-20 15-23 7-5 17-4 21 2 4 5 5 12 4 21-3-8-8-12-20-12s-17 4-20 12z" fill="${h}"/>`],
  longo: (h) => [`<path d="M25 46c0-17 10-28 23-28s23 11 23 28v30H25z" fill="${h}"/>`, `<path d="M28 45c-1-15 8-25 20-25s21 10 20 25c-2-7-6-11-12-12-6 3-18 4-24 1-2 2-3 6-4 11z" fill="${h}"/>`],
  chanel: (h) => [`<path d="M24 47c0-18 10-29 24-29s24 11 24 29v9c0 5-4 8-8 6H32c-4 2-8-1-8-6z" fill="${h}"/>`, `<path d="M27.500 46c-2-16 8-27 20.500-27s22.500 11 20.500 27c-1.500-5-3.500-7.500-5.500-9-9 3.500-21 3.500-30 0-2 1.500-4 4-5.500 9z" fill="${h}"/>`],
  cacheado: (h) => [
    `<g fill="${h}"><circle cx="27" cy="44" r="9"/><circle cx="69" cy="44" r="9"/><circle cx="26" cy="57" r="8"/><circle cx="70" cy="57" r="8"/></g>`,
    `<g fill="${h}"><circle cx="31" cy="31" r="9"/><circle cx="42" cy="24" r="9"/><circle cx="54" cy="24" r="9"/><circle cx="65" cy="31" r="9"/><circle cx="48" cy="29" r="8"/></g>`,
  ],
  black: (h) => [`<circle cx="48" cy="36" r="27" fill="${h}"/>`, `<path d="M30 41c2-9 9-14 18-14s16 5 18 14c-5-5-11-7-18-7s-13 2-18 7z" fill="${h}"/>`],
  coque: (h) => [`<circle cx="48" cy="17" r="9" fill="${h}"/>`, `<path d="M28 44c-1-15 8-25 20-25s21 10 20 25c-3-8-8-12-20-12s-17 4-20 12z" fill="${h}"/>`],
  maria: (h) => [
    `<g fill="${h}"><circle cx="22" cy="46" r="9"/><circle cx="74" cy="46" r="9"/></g>`,
    `<path d="M27.500 46c-2-16 8-27 20.500-27s22.500 11 20.500 27c-1.500-5-3.500-7.500-5.500-9-9 3.500-21 3.500-30 0-2 1.500-4 4-5.500 9z" fill="${h}"/>`,
  ],
  rabo: (h) => [`<path d="M62 24c10-3 17 4 16 14-1 9-4 16-2 24-7-3-10-10-9-18z" fill="${h}"/>`, `<path d="M28 44c-1-15 8-25 20-25s21 10 20 25c-3-8-8-12-20-12s-17 4-20 12z" fill="${h}"/>`],
  tranca: (h) => [
    `<g fill="${h}"><rect x="22" y="40" width="9" height="36" rx="4.500"/><rect x="65" y="40" width="9" height="36" rx="4.500"/></g>`,
    `<path d="M27.500 46c-2-16 8-27 20.500-27s22.500 11 20.500 27c-3-9-9-13-20.500-13s-17.500 4-20.500 13z" fill="${h}"/>`,
  ],
  careca: (h) => ['', `<g fill="${h}"><path d="M28.500 46c-1.500-5-1-9 1-12 1 4 1.500 8 .500 12z"/><path d="M67.500 46c1.500-5 1-9-1-12-1 4-1.500 8-.500 12z"/></g>`],
};

const EXTRAS = {
  bochecha: () => `<g fill="#f08fa6" opacity=".55"><circle cx="35.500" cy="52" r="3.600"/><circle cx="60.500" cy="52" r="3.600"/></g>`,
  oculos: () => `<g fill="none" stroke="${INK}" stroke-width="1.700"><circle cx="40" cy="46" r="6"/><circle cx="56" cy="46" r="6"/><path d="M46 46h4"/></g>`,
  brinco: () => `<g fill="#f2a60c"><circle cx="28.500" cy="54" r="2.200"/><circle cx="67.500" cy="54" r="2.200"/></g>`,
  laco: () => `<g fill="#d12d58"><path d="M62 22l-10-6v12z"/><path d="M62 22l10-6v12z"/><circle cx="62" cy="22" r="3"/></g>`,
  flor: () => `<g><g fill="#fff"><circle cx="66" cy="23" r="3.600"/><circle cx="72" cy="27" r="3.600"/><circle cx="70" cy="34" r="3.600"/><circle cx="63" cy="34" r="3.600"/><circle cx="61" cy="27" r="3.600"/></g><circle cx="66.500" cy="29" r="3" fill="#f2a60c"/></g>`,
  tiara: () => `<g><path d="M29 34c5-9 12-13 19-13s14 4 19 13" fill="none" stroke="#f2a60c" stroke-width="3" stroke-linecap="round"/><path d="M48 12l3 6h-6z" fill="#f2a60c"/><circle cx="48" cy="20" r="2.600" fill="#d12d58"/></g>`,
  bone: (h, spec) => `<g><path d="M28 38c0-12 9-20 20-20s20 8 20 20z" fill="${spec.roupa || '#d12d58'}"/><path d="M27 38h30c4 0 7 2 9 5H24c0-3 1-5 3-5z" fill="${INK}" opacity=".35"/><rect x="24" y="36" width="34" height="5" rx="2.500" fill="${spec.roupa || '#d12d58'}"/></g>`,
  capelo: () => `<g><path d="M48 9l26 9-26 9-26-9z" fill="${INK}"/><path d="M34 22v8c4 3 9 4 14 4s10-1 14-4v-8l-14 5z" fill="${INK}"/><path d="M70 18v12" stroke="#f2a60c" stroke-width="2"/><circle cx="70" cy="31" r="2.400" fill="#f2a60c"/></g>`,
  barba: (h) => `<path d="M29.500 50c0 15 8 20 18.500 20s18.500-5 18.500-20c-3 6-6 8-9 8-3-2-16-2-19 0-3 0-6-2-9-8z" fill="${h}"/>`,
  bigode: (h) => `<path d="M38.500 56c3-4 6.500-4 9.500-1.500 3-2.500 6.500-2.500 9.500 1.500-4 1.500-7 1-9.500-.800-2.500 1.800-5.500 2.300-9.500.800z" fill="${h}"/>`,
  gravata: () => `<path d="M45 76l3-5 3 5 2 14h-10z" fill="#d12d58"/>`,
};
/** Enfeites que ficam por cima do cabelo (os outros ficam no rosto ou na roupa). */
const ON_TOP = new Set(['laco', 'flor', 'tiara', 'bone', 'capelo']);

function face(humor, idoso) {
  const brow = (d) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="1.600" stroke-linecap="round" opacity=".7"/>`;
  const eyes = {
    neutro: `<g fill="${INK}"><circle cx="40" cy="46" r="2.400"/><circle cx="56" cy="46" r="2.400"/></g>`,
    feliz: `<g fill="none" stroke="${INK}" stroke-width="2.200" stroke-linecap="round"><path d="M37 47q3-4 6 0"/><path d="M53 47q3-4 6 0"/></g>`,
    amou: `<g fill="#d12d58"><path d="M40 49.500c-3.500-2.200-4.500-4.300-4.500-5.600 0-1.300 1-2.200 2.200-2.200.900 0 1.700.500 2.300 1.400.600-.900 1.400-1.400 2.300-1.400 1.200 0 2.200.900 2.200 2.200 0 1.300-1 3.400-4.500 5.600z"/><path d="M56 49.500c-3.500-2.200-4.500-4.300-4.500-5.600 0-1.300 1-2.200 2.200-2.200.900 0 1.700.500 2.300 1.400.600-.900 1.400-1.400 2.300-1.400 1.200 0 2.200.900 2.200 2.200 0 1.300-1 3.400-4.500 5.600z"/></g>`,
    quase: `<g fill="${INK}"><circle cx="40" cy="46" r="2.400"/><circle cx="56" cy="46" r="2.400"/></g>${brow('M36.500 40q3.500-2 7 0')}${brow('M52.500 38.500q3.500-2.500 7-.500')}`,
    chateado: `<g fill="${INK}"><circle cx="40.800" cy="46.600" r="2.300"/><circle cx="56.800" cy="46.600" r="2.300"/></g>${brow('M36.500 39.500l7 2')}${brow('M59.500 39.500l-7 2')}`,
  };
  const mouth = {
    neutro: `<path d="M43 56.500q5 3.500 10 0" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`,
    feliz: `<path d="M40.500 54.500q7.500 9.500 15 0z" fill="#7a2c40"/><path d="M43.500 59.200q4.500 3 9 0-4.500-1.800-9 0z" fill="#f08fa6"/>`,
    amou: `<path d="M39.500 54q8.500 12 17 0z" fill="#7a2c40"/><path d="M43 59.800q5 3.400 10 0-5-2-10 0z" fill="#f08fa6"/>`,
    quase: `<path d="M43 57q5 2.500 10-.500" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`,
    chateado: `<path d="M43 58.500q2.500-2.500 5 0t5 0" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`,
  };
  const lines = idoso ? `<g fill="none" stroke="${INK}" stroke-width="1" stroke-linecap="round" opacity=".28"><path d="M32.500 50.500q1.500 1.500 3 1.500"/><path d="M63.500 50.500q-1.500 1.500-3 1.500"/><path d="M42 36.500q6-1.500 12 0"/></g>` : '';
  return `${eyes[humor] || eyes.neutro}${mouth[humor] || mouth.neutro}${lines}`;
}

/** Uma pessoa (sem o fundo), desenhada na caixa 96 × 96. */
function person(spec, humor) {
  const skin = SKIN[spec.pele] || SKIN.c;
  const shade = SKIN_SHADE[spec.pele] || SKIN_SHADE.c;
  const hair = HAIR[spec.cor] || HAIR.castanho;
  const [back, front] = (HAIRS[spec.cabelo] || HAIRS.curto)(hair);
  const extras = Array.isArray(spec.extra) ? spec.extra.filter((x) => EXTRAS[x]) : [];
  const draw = (list) => list.map((x) => EXTRAS[x](hair, spec)).join('');
  const hat = extras.includes('bone') || extras.includes('capelo');
  const cloth = spec.roupa || '#d96b82';
  const outline = cloth.toLowerCase() === '#ffffff' ? ` stroke="#d3d1d4" stroke-width="1"` : '';
  return (
    back +
    `<path d="M18 96c0-14 12-23 30-23s30 9 30 23z" fill="${cloth}"${outline}/>` +
    `<path d="M41 62h14v10c0 4-3 7-7 7s-7-3-7-7z" fill="${shade}"/>` +
    `<g fill="${skin}"><circle cx="29" cy="48" r="4"/><circle cx="67" cy="48" r="4"/><ellipse cx="48" cy="45" rx="19" ry="21"/></g>` +
    draw(extras.filter((x) => x === 'barba')) +
    face(humor, spec.idade === 'idoso') +
    (hat && extras.includes('bone') ? '' : front) +
    draw(extras.filter((x) => !ON_TOP.has(x) && x !== 'barba')) +
    draw(extras.filter((x) => ON_TOP.has(x)))
  );
}

const BOLT = `<path d="M54 12L26 52h18l-6 32 32-44H50z" fill="#f2a60c" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>`;

/**
 * O retrato de um cliente, redondo. `retrato` vem da encomenda (orders.js):
 * { pele: 'a'…'f', cabelo, cor, extra: [...], roupa, fundo, idade, par: { … segunda pessoa … } } ou { emblema: 'raio' }.
 */
export function portraitSvg(spec = {}, humor = 'neutro', { size = 64, title = '' } = {}) {
  const bg = spec.fundo || '#ffe7ec';
  let body;
  if (spec.emblema === 'raio') body = BOLT;
  else if (spec.par) body = `<g transform="translate(-9 22) scale(.76)">${person(spec, humor)}</g><g transform="translate(32 22) scale(.76)">${person({ ...spec.par, idade: spec.par.idade || spec.idade }, humor)}</g>`;
  else body = person(spec, humor);
  return `<svg class="ag-face" viewBox="0 0 96 96" width="${size}" height="${size}" ${title ? `role="img" aria-label="${title.replace(/[<>"&]/g, '')}"` : 'aria-hidden="true"'} focusable="false"><rect width="96" height="96" fill="${bg}"/>${body}</svg>`;
}

/* ───────── Figurinhas ───────── */

const star = (cx, cy, r, k = 0.46, n = 5, rot = -90) =>
  Array.from({ length: n * 2 }, (_, i) => {
    const a = ((rot + (i * 180) / n) * Math.PI) / 180;
    const rr = i % 2 ? r * k : r;
    return `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

/** Contorno da figurinha (caixa 64 × 64, centro em 32, 32). */
const SHAPES = {
  circ: (r) => `<circle cx="32" cy="32" r="${r}"/>`,
  flor: (r) => {
    // doze gomos: o recorte de figurinha clássico
    const pts = Array.from({ length: 12 }, (_, i) => {
      const a = (i * 30 * Math.PI) / 180;
      return `<circle cx="${(32 + (r - 5) * Math.cos(a)).toFixed(1)}" cy="${(32 + (r - 5) * Math.sin(a)).toFixed(1)}" r="6.500"/>`;
    }).join('');
    return `<circle cx="32" cy="32" r="${r - 5}"/>${pts}`;
  },
  estrela: (r) => `<polygon points="${star(32, 33, r + 3, 0.62, 8, -90)}" stroke-linejoin="round"/>`,
  escudo: (r) => `<path d="M32 ${32 - r}c7 4 14 5.500 ${r - 3} 5.500v${r - 2}c0 ${r * 0.62}-${r * 0.55} ${r * 0.85}-${r - 3} ${r + 1}-${r * 0.45}-${r * 0.15}-${r - 3}-${r * 0.38}-${r - 3}-${r + 1}V${37.5 - r}c${r - 10} 0 ${r - 10}-1.500 ${r - 3}-5.500z"/>`,
  selo: (r) => `<rect x="${32 - r + 1}" y="${32 - r + 1}" width="${2 * r - 2}" height="${2 * r - 2}" rx="${r * 0.36}"/>`,
  coracao: (r) => `<path transform="translate(32 34) scale(${(r / 13).toFixed(3)})" d="M0 12C-10 5-13-1-13-5c0-4 3-6.500 6.200-6.500 2.700 0 4.900 1.500 6.800 4.200 1.900-2.700 4.100-4.200 6.800-4.200C10-11.500 13-9 13-5c0 4-3 10-13 17z"/>`,
};

const W = '#ffffff';
const sw = (d, w = 2.600, c = W) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** Desenhos do miolo das figurinhas (caixa 32 × 32). a = cor de destaque, k = cor do fundo da figurinha. */
const GLYPHS = {
  bolo: (a) => `<rect x="4" y="26" width="24" height="2.500" rx="1.200" fill="${W}"/><rect x="7" y="14" width="18" height="12" rx="2" fill="${W}"/><path d="M7 16c0-1.100.900-2 2-2h14c1.100 0 2 .900 2 2v2.500c-1.500 2-3 2-4.500 0-1.500 2-3 2-4.500 0-1.500 2-3 2-4.500 0-1.500 2-3 2-4.500 0z" fill="${a}"/><rect x="15" y="7.500" width="2" height="6.500" fill="${W}"/><path d="M16 2.500c1.800 2 1.800 3.500 0 4.500-1.800-1-1.800-2.500 0-4.500z" fill="#ffd166"/>`,
  andares: (a) => `<rect x="3" y="21.500" width="26" height="6.500" rx="1.800" fill="${W}"/><rect x="7.500" y="14" width="17" height="6.500" rx="1.800" fill="${W}"/><rect x="12" y="6.500" width="8" height="6.500" rx="1.800" fill="${W}"/><g fill="${a}"><rect x="3" y="21.500" width="26" height="2.200" rx="1.100"/><rect x="7.500" y="14" width="17" height="2.200" rx="1.100"/><rect x="12" y="6.500" width="8" height="2.200" rx="1.100"/></g>`,
  camadas: (a) => `<g fill="${W}"><rect x="6" y="4" width="20" height="5" rx="2"/><rect x="6" y="11.500" width="20" height="5" rx="2"/><rect x="6" y="19" width="20" height="5" rx="2"/></g><g fill="${a}"><rect x="7" y="9" width="18" height="2.500"/><rect x="7" y="16.500" width="18" height="2.500"/></g><rect x="4" y="26" width="24" height="2.500" rx="1.200" fill="${W}"/>`,
  massa: (a) => `<path d="M5 12h22v4c0 6-4.500 11-11 11S5 22 5 16z" fill="${W}"/><path d="M5 12h22v2H5z" fill="${a}"/>${sw('M21 3l-4 12')}<circle cx="16.500" cy="16.500" r="2.300" fill="${a}"/>`,
  colher: (a) => `<ellipse cx="16" cy="9.500" rx="5.500" ry="7" fill="${W}"/><ellipse cx="16" cy="9" rx="3.200" ry="4.300" fill="${a}"/><rect x="14.700" y="15" width="2.600" height="14" rx="1.300" fill="${W}"/>`,
  calda: (a) => `<rect x="5" y="9" width="22" height="18" rx="2.500" fill="${W}"/><path d="M5 11.500c0-1.400 1.100-2.500 2.500-2.500h17c1.400 0 2.500 1.100 2.500 2.500V15c0 1.600-2.400 1.600-2.400 0 0-1.300-2.400-1.300-2.400 0v6c0 1.800-2.800 1.800-2.800 0v-5c0-1.300-2.400-1.300-2.400 0v2.500c0 1.700-2.700 1.700-2.700 0V16c0-1.300-2.400-1.300-2.400 0v1c0 1.600-2.300 1.600-2.300 0 0-1.200-1.300-1.500-1.600-.500z" fill="${a}"/>`,
  bico: (a) => `<path d="M7 4h18l-6.500 17h-5z" fill="${W}"/><path d="M13.500 21h5l-2.500 6z" fill="${a}"/><path d="M9 4h14l-1.200 3H10.200z" fill="${a}"/><circle cx="16" cy="29.500" r="1.600" fill="${W}"/>`,
  vela: (a) => `<rect x="12.500" y="12" width="7" height="17" rx="1.800" fill="${W}"/><g fill="${a}"><path d="M12.500 16l7-3v3l-7 3z"/><path d="M12.500 22l7-3v3l-7 3z"/></g><path d="M16 2.500c3 3.300 3 6 0 7.500-3-1.500-3-4.200 0-7.500z" fill="#ffd166"/>`,
  paleta: (a, k) => `<path d="M16 4C8.800 4 3.500 9 3.500 15.500S8.500 27 15 27c2 0 3-1.200 3-2.600 0-1.600-1.300-2.200-1.300-3.600 0-1.400 1.100-2.300 2.800-2.300H23c3.200 0 5.500-2.300 5.500-5.300C28.500 8 23 4 16 4z" fill="${W}"/><circle cx="10" cy="12" r="2.300" fill="#d12d58"/><circle cx="16" cy="9" r="2.300" fill="#f2a60c"/><circle cx="22" cy="12" r="2.300" fill="#6fb6f2"/><circle cx="9.500" cy="18.500" r="2.300" fill="${k === '#15803d' ? '#b497f0' : '#6fcfa8'}"/>`,
  raiox: (a, k) => `<path d="M4 25h24L26 9H6z" fill="${W}"/><g fill="${a}"><path d="M5.500 13.500h21l.300 2.500H5.200z"/><path d="M4.700 19.500h22.600l.300 2.500H4.400z"/></g><circle cx="21.500" cy="20.500" r="5.500" fill="${W}" stroke="${k}" stroke-width="2.200"/><path d="M25.500 24.500l3.500 3.500" stroke="${k}" stroke-width="2.600" stroke-linecap="round"/>`,
  recado: (a) => `<rect x="4" y="5" width="24" height="15" rx="3.500" fill="${W}"/><rect x="14.800" y="20" width="2.400" height="9.500" rx="1.200" fill="${W}"/><path d="M16 17c-3.800-2.500-5-4.600-5-6.200 0-1.500 1.200-2.600 2.500-2.600 1 0 1.900.600 2.500 1.500.600-.900 1.500-1.500 2.500-1.500 1.300 0 2.500 1.100 2.500 2.600 0 1.600-1.200 3.700-5 6.200z" fill="${a}"/>`,
  caixa: (a) => `<path d="M5 12h22v14c0 1.100-.900 2-2 2H7c-1.100 0-2-.900-2-2z" fill="${W}"/><path d="M3.500 7.500h25l-1.500 5H5z" fill="${a}"/><rect x="14" y="7.500" width="4" height="12" fill="${a}"/><rect x="14" y="12.500" width="4" height="7" fill="#ffd166"/>`,
  gg: (a) => `<rect x="2.500" y="9" width="27" height="18" rx="3.500" fill="${W}"/><path d="M2.500 12.500C2.500 10.600 4 9 6 9h20c2 0 3.500 1.600 3.500 3.500V15h-27z" fill="${a}"/><text x="16" y="24.500" text-anchor="middle" font-family="inherit" font-size="9" font-weight="800" fill="${a}">GG</text><path d="M16 2l1.400 3 3.300.400-2.400 2.200.600 3.200L16 9.200l-2.900 1.600.600-3.200-2.400-2.200 3.300-.400z" fill="#ffd166"/>`,
  vulcao: (a) => `<path d="M3.500 27c0-9 4.500-15 9-15h7c4.500 0 9 6 9 15z" fill="${W}"/><path d="M10.500 12c0-3.300 2.400-5.500 5.500-5.500s5.500 2.200 5.500 5.500c0 4-1.900 3.500-1.900 7.500 0 1.600-2.400 1.600-2.400 0V16c0-1.100-2-1.100-2 0v6.500c0 1.600-2.400 1.600-2.400 0 0-6.500-2.300-6.500-2.300-10.500z" fill="${a}"/><g fill="#ffd166"><circle cx="11" cy="4" r="1.300"/><circle cx="21.500" cy="3.500" r="1.300"/><circle cx="16" cy="2.200" r="1.300"/></g>`,
  coracao: (a) => `<path d="M16 28C5.500 21 3.500 15 3.500 11 3.500 7.300 6.300 5 9.500 5c2.700 0 4.700 1.500 6.500 4.200C17.800 6.500 19.800 5 22.500 5c3.200 0 6 2.300 6 6 0 4-2 10-12.500 17z" fill="${W}"/><path d="M9.500 8.500c-1.600 0-2.800 1.200-2.800 2.800" fill="none" stroke="${a}" stroke-width="2" stroke-linecap="round"/>`,
  formas: (a) => `<circle cx="9.500" cy="10" r="6.500" fill="${W}"/><rect x="18" y="3.500" width="11.500" height="11.500" rx="2.500" fill="${a}"/><polygon points="16,17.500 23,21.200 23,27.800 16,31.500 9,27.800 9,21.200" fill="${W}"/>`,
  chocolate: (a) => `<rect x="6.500" y="4" width="19" height="24" rx="2.500" fill="#6b3f22"/><g fill="#8a5632"><rect x="8.500" y="6" width="7" height="5.500" rx="1"/><rect x="16.500" y="6" width="7" height="5.500" rx="1"/><rect x="8.500" y="12.500" width="7" height="5.500" rx="1"/><rect x="16.500" y="12.500" width="7" height="5.500" rx="1"/></g><path d="M6.500 19.500l19-2V25.500c0 1.400-1.100 2.500-2.500 2.500H9c-1.400 0-2.500-1.100-2.500-2.500z" fill="${W}"/><path d="M6.500 19.500l19-2v2.600l-19 2z" fill="${a}"/>`,
  coco: (a) => `<circle cx="16" cy="17" r="11.500" fill="#6b3f22"/><ellipse cx="16" cy="15" rx="9" ry="6.500" fill="${W}"/><ellipse cx="16" cy="15.500" rx="5.500" ry="3.300" fill="${a}"/>${sw('M21 3.500l-3.500 11', 2.200)}`,
  medalha: (a) => `<path d="M9 3h5l3 9h-5z" fill="${a}"/><path d="M23 3h-5l-3 9h5z" fill="${W}"/><circle cx="16" cy="20" r="9" fill="#ffd166"/><polygon points="${star(16, 20, 5.500)}" fill="${W}"/>`,
  batedor: (a) => `<rect x="14.700" y="2" width="2.600" height="10" rx="1.300" fill="${W}"/><ellipse cx="16" cy="20.500" rx="7.500" ry="9" fill="none" stroke="${W}" stroke-width="2.400"/><ellipse cx="16" cy="20.500" rx="3" ry="9" fill="none" stroke="${W}" stroke-width="2.200"/><rect x="13" y="10" width="6" height="3.500" rx="1.500" fill="${a}"/>`,
  naked: (a) => `<rect x="4" y="26" width="24" height="2.500" rx="1.200" fill="${W}"/><rect x="7" y="8" width="18" height="18" rx="2" fill="#f7d894"/><g fill="${W}"><rect x="7" y="8" width="18" height="3" rx="1.500"/><rect x="7" y="14" width="18" height="2.500"/><rect x="7" y="19.500" width="18" height="2.500"/></g><circle cx="16" cy="6" r="2.800" fill="${a}"/>`,
  xicara: (a) => `<path d="M5 13h17.500v6c0 5-3.900 8.500-8.800 8.500S5 24 5 19z" fill="${W}"/>${sw('M22.500 15h2c2.200 0 3.300 1.400 3.300 3s-1.100 3-3.300 3h-2', 2.400)}<path d="M5 13h17.500v2.500H5z" fill="${a}"/>${sw('M10 4q2 2.500 0 5', 2)}${sw('M16 3q2 3 0 6', 2)}`,
  pinca: (a) => `${sw('M9.500 2.500l5 16', 2.800)}${sw('M22.500 2.500l-5 16', 2.800)}<circle cx="16" cy="23" r="5.500" fill="${a}"/><circle cx="14.300" cy="21.300" r="1.400" fill="${W}" opacity=".7"/>`,
  giro: (a) => `${sw('M26.500 15a10.500 10.500 0 1 1-3.600-7.200', 3)}<polygon points="24.500,2.500 25.500,10.500 17.800,9" fill="${W}"/><circle cx="16" cy="16" r="3.300" fill="${a}"/>`,
  gota: (a) => `<path d="M16 3c5.500 7.500 8.500 12 8.500 16.500a8.500 8.500 0 0 1-17 0C7.500 15 10.500 10.500 16 3z" fill="${a}"/><path d="M12 19.500c0 2.300 1.500 4 3.500 4.500" fill="none" stroke="${W}" stroke-width="2" stroke-linecap="round"/>`,
  sopro: (a) => `${sw('M3.500 10.500h14c3.500 0 4.500-4.500 1.200-5.800', 2.800)}${sw('M3.500 16.500h20.500c3.600 0 4.600 4.500 1.200 5.800', 2.800)}${sw('M3.500 22.500h9.500c2.600 0 3.300 3.300.900 4.200', 2.800, a)}`,
  fosforo: (a) => `<path d="M5.500 27.500L19 12" stroke="#f2e4c7" stroke-width="3.200" stroke-linecap="round"/><circle cx="20.500" cy="10.500" r="3.300" fill="${a}"/><path d="M23 1.500c3.300 2.800 3.800 5.600 1.800 7.600-1.300-.700-2.300-2-2.200-3.600-.200 1-.900 1.700-1.800 2-.600-2.200.200-4.300 2.200-6z" fill="#ffd166"/>`,
  estrela: (a) => `<polygon points="${star(16, 17, 13.500)}" fill="${W}" stroke="${W}" stroke-width="2" stroke-linejoin="round"/><polygon points="${star(16, 17, 6.500)}" fill="${a}"/>`,
  estrelas: (a) => `<polygon points="${star(16, 11, 8.500)}" fill="#ffd166" stroke="#ffd166" stroke-width="1.500" stroke-linejoin="round"/><polygon points="${star(7.500, 23, 6)}" fill="${W}" stroke="${W}" stroke-width="1.500" stroke-linejoin="round"/><polygon points="${star(24.500, 23, 6)}" fill="${W}" stroke="${W}" stroke-width="1.500" stroke-linejoin="round"/>`,
  brilho: (a) => `<path d="M14 3c1.100 7 5 11 12 12-7 1.100-10.900 5-12 12-1.100-7-5-10.900-12-12 7-1 10.900-5 12-12z" fill="${W}"/><path d="M25 2c.500 3 2 4.500 5 5-3 .500-4.500 2-5 5-.500-3-2-4.500-5-5 3-.500 4.500-2 5-5z" fill="${a}"/><circle cx="25.500" cy="25.500" r="2.300" fill="${a}"/>`,
  camera: (a) => `<rect x="11" y="5" width="10" height="5" rx="1.500" fill="${W}"/><rect x="3.500" y="8.500" width="25" height="18" rx="3.500" fill="${W}"/><circle cx="16" cy="17.500" r="6" fill="${a}"/><circle cx="16" cy="17.500" r="2.600" fill="${W}"/><circle cx="24.500" cy="12" r="1.300" fill="${a}"/>`,
  claquete: (a) => `<rect x="4.500" y="12" width="23" height="15.500" rx="2.500" fill="${W}"/><path d="M4 6.500l22.500-3.500 .800 4.500L4.800 11z" fill="${W}"/><g fill="${a}"><path d="M8 6l3.500-.500 2 4-3.500.500z"/><path d="M15.500 4.800l3.500-.500 2 4-3.500.500z"/></g><polygon points="13.500,16 13.500,24 20.500,20" fill="${a}"/>`,
  cartao: (a) => `<rect x="3" y="7" width="26" height="18" rx="2.500" fill="${W}"/><rect x="21.500" y="9.500" width="5" height="6" rx="1" fill="${a}"/><g stroke="${a}" stroke-width="1.800" stroke-linecap="round"><path d="M17 19.500h9"/><path d="M17 22.500h6"/></g><path d="M10 22c-3.400-2.200-4.500-4.200-4.500-5.600 0-1.400 1-2.400 2.200-2.400.900 0 1.700.500 2.300 1.400.600-.900 1.400-1.400 2.300-1.400 1.200 0 2.200 1 2.200 2.400 0 1.400-1.100 3.400-4.500 5.600z" fill="${a}"/>`,
  flor: (a) => `<g fill="${W}"><circle cx="16" cy="7.500" r="5.500"/><circle cx="24" cy="13.500" r="5.500"/><circle cx="21" cy="23" r="5.500"/><circle cx="11" cy="23" r="5.500"/><circle cx="8" cy="13.500" r="5.500"/></g><circle cx="16" cy="16.500" r="5" fill="${a}"/>`,
  flores: (a) => `<g fill="${W}"><circle cx="10" cy="6.500" r="3.600"/><circle cx="15" cy="10" r="3.600"/><circle cx="13" cy="16" r="3.600"/><circle cx="7" cy="16" r="3.600"/><circle cx="5" cy="10" r="3.600"/></g><circle cx="10" cy="11.500" r="3" fill="${a}"/><g fill="${a}"><circle cx="22.500" cy="14" r="3.300"/><circle cx="27" cy="17.500" r="3.300"/><circle cx="25.500" cy="23" r="3.300"/><circle cx="19.500" cy="23" r="3.300"/><circle cx="18" cy="17.500" r="3.300"/></g><circle cx="22.500" cy="19" r="2.700" fill="#ffd166"/>${sw('M10 20v9', 2.200, '#6fcfa8')}${sw('M22.500 26v3.500', 2.200, '#6fcfa8')}`,
  morango: (a) => `<path d="M16 29c-6.500-3.200-10.500-8.500-10.500-13.500 0-3.200 2.500-5.500 5.200-5.500 2 0 3.700.900 5.300 2.600 1.600-1.700 3.300-2.600 5.300-2.600 2.700 0 5.200 2.300 5.200 5.500 0 5-4 10.300-10.500 13.500z" fill="${a}"/><path d="M9.500 9.500L16 12.500l6.500-3-2.300-5L16 8l-4.200-3.500z" fill="#6fcfa8"/><g fill="${W}"><circle cx="12" cy="17" r="1"/><circle cx="20" cy="17" r="1"/><circle cx="16" cy="21" r="1"/><circle cx="16" cy="15" r="1"/></g>`,
  frutas: (a) => `<circle cx="10" cy="20" r="7.500" fill="${a}"/><circle cx="22" cy="21" r="6.500" fill="#b497f0"/><circle cx="17" cy="11" r="6" fill="#ffd166"/><g fill="${W}" opacity=".8"><circle cx="7.500" cy="17.500" r="1.500"/><circle cx="20" cy="18.500" r="1.300"/><circle cx="15" cy="9" r="1.300"/></g><path d="M17 5q2-3 5-3" fill="none" stroke="#6fcfa8" stroke-width="2.200" stroke-linecap="round"/>`,
  pilha: (a) => `<g><circle cx="9" cy="23" r="5.500" fill="${W}"/><circle cx="20" cy="24" r="5" fill="${a}"/><circle cx="14.500" cy="14.500" r="5.500" fill="#ffd166"/><circle cx="24" cy="15" r="4.500" fill="${W}"/><circle cx="19.500" cy="6.500" r="4.500" fill="${a}"/><circle cx="8" cy="11" r="3.500" fill="#6fcfa8"/></g>`,
  minimo: (a) => `<circle cx="16" cy="16" r="11.500" fill="none" stroke="${W}" stroke-width="2.600"/><circle cx="16" cy="16" r="3.300" fill="${a}"/>`,
  sol: (a) => `<path d="M5 22a11 11 0 0 1 22 0z" fill="#ffd166"/>${sw('M2.500 22h27', 2.600)}${sw('M7 27h18', 2.600, a)}${sw('M16 4v3.500', 2.400)}${sw('M5.500 9l2.500 2.500', 2.400)}${sw('M26.500 9l-2.500 2.500', 2.400)}`,
  roseta: (a) => `<circle cx="16" cy="16" r="13" fill="${W}"/>${sw('M16 16c1-2 4-1.500 4 1 0 3-4.500 4.500-7 2-3.500-3.500-.500-9.500 4.500-9.500 6 0 9 6 6.500 11', 2.400, a)}`,
  laco: (a) => `<path d="M16 16L4 8.500v15z" fill="${W}"/><path d="M16 16l12-7.500v15z" fill="${W}"/><circle cx="16" cy="16" r="3.800" fill="${a}"/>${sw('M14 19l-3.500 9', 2.600, a)}${sw('M18 19l3.500 9', 2.600, a)}`,
  varinha: (a) => `<path d="M5 27.500L18 14.500" stroke="${W}" stroke-width="3.200" stroke-linecap="round"/><polygon points="${star(21.500, 10.500, 8.500)}" fill="#ffd166" stroke="#ffd166" stroke-width="1.500" stroke-linejoin="round"/><circle cx="8" cy="9" r="1.800" fill="${a}"/><circle cx="27" cy="24" r="1.800" fill="${a}"/>`,
  bandeirinhas: (a) => `${sw('M2.500 6.500q13.500 7 27 0', 2)}<polygon points="5,8.500 11,10.500 7,17.500" fill="${W}"/><polygon points="12.500,11 18.500,11.500 15,19" fill="${a}"/><polygon points="20.500,10.800 26.500,8.800 24.500,17.500" fill="#ffd166"/><path d="M9 29c0-4 3-7 7-7s7 3 7 7z" fill="${W}"/><rect x="6" y="27.500" width="20" height="2.200" rx="1.100" fill="${a}"/>`,
  pinheiro: (a) => `<polygon points="16,4 23,13 9,13" fill="#6fcfa8"/><polygon points="16,9.500 25,20.500 7,20.500" fill="#6fcfa8"/><polygon points="16,15.500 27,27.500 5,27.500" fill="#6fcfa8"/><rect x="14.300" y="27" width="3.400" height="3.500" fill="${W}"/><polygon points="${star(16, 4.500, 4)}" fill="#ffd166"/><g fill="${a}"><circle cx="12.500" cy="18" r="1.400"/><circle cx="19.500" cy="23.500" r="1.400"/><circle cx="18" cy="12" r="1.400"/></g>`,
  coelho: (a) => `<g fill="${W}"><ellipse cx="11.500" cy="8.500" rx="3.300" ry="7.500"/><ellipse cx="20.500" cy="8.500" rx="3.300" ry="7.500"/><circle cx="16" cy="21" r="9"/></g><g fill="${a}"><ellipse cx="11.500" cy="9" rx="1.400" ry="4.800"/><ellipse cx="20.500" cy="9" rx="1.400" ry="4.800"/><circle cx="16" cy="22.500" r="1.500"/></g><g fill="#2a1a16"><circle cx="12.500" cy="19.500" r="1.200"/><circle cx="19.500" cy="19.500" r="1.200"/></g>`,
  abobora: (a) => `<rect x="14.700" y="3.500" width="2.600" height="5" rx="1.300" fill="#6fcfa8"/><ellipse cx="16" cy="18.500" rx="12" ry="10" fill="${a}"/><ellipse cx="16" cy="18.500" rx="5" ry="10" fill="none" stroke="${W}" stroke-width="1.200" opacity=".5"/><g fill="#2a1a16"><polygon points="9.500,17 13,17 11.200,13.800"/><polygon points="19,17 22.500,17 20.800,13.800"/><path d="M10 21.500h12l-2 3h-2l-1-1.500-1 1.500h-2l-1-1.500-1 1.500z"/></g>`,
  aliancas: (a) => `<circle cx="11.500" cy="18.500" r="7.500" fill="none" stroke="#ffd166" stroke-width="3.200"/><circle cx="20.500" cy="18.500" r="7.500" fill="none" stroke="${W}" stroke-width="3.200"/><polygon points="11.500,3 14.500,6.500 11.500,10 8.500,6.500" fill="${a}"/>`,
  presente: (a) => `<rect x="5" y="13" width="22" height="15" rx="2" fill="${W}"/><rect x="3.500" y="8.500" width="25" height="5.500" rx="1.800" fill="${W}"/><rect x="14" y="8.500" width="4" height="19.500" fill="${a}"/>${sw('M16 8.500c-2-5-8-5-7-1 .500 1.500 3.500 1.500 7 1c3.500.500 6.500.500 7-1 1-4-5-4-7 1z', 2.200, a)}`,
  calendario: (a) => `<rect x="4" y="6" width="24" height="22" rx="3" fill="${W}"/><path d="M4 9c0-1.700 1.300-3 3-3h18c1.700 0 3 1.300 3 3v4H4z" fill="${a}"/><g fill="${W}"><rect x="9" y="3" width="2.600" height="6" rx="1.300"/><rect x="20.400" y="3" width="2.600" height="6" rx="1.300"/></g>${sw('M10.500 20.500l4 4 7.500-8', 2.800, a)}`,
  lua: (a) => `<path d="M21.500 4.500A12 12 0 1 0 27.500 21 9.500 9.500 0 0 1 21.500 4.500z" fill="${W}"/><polygon points="${star(24.500, 9.500, 4)}" fill="#ffd166"/><circle cx="12" cy="17" r="1.500" fill="${a}"/><circle cx="16" cy="22.500" r="1" fill="${a}"/>`,
  alvo: (a) => `<circle cx="15" cy="17" r="12" fill="${W}"/><circle cx="15" cy="17" r="8" fill="${a}"/><circle cx="15" cy="17" r="4" fill="${W}"/><path d="M15 17L27 5" stroke="#2a1a16" stroke-width="2.200" stroke-linecap="round"/><polygon points="24,3 29,3 29,8" fill="#ffd166"/>`,
  moeda: (a) => `<circle cx="16" cy="16" r="12.500" fill="#ffd166"/><circle cx="16" cy="16" r="9.500" fill="none" stroke="${W}" stroke-width="1.600"/><text x="16" y="21" text-anchor="middle" font-family="inherit" font-size="13" font-weight="800" fill="${a}">$</text>`,
  cloche: (a) => `<circle cx="16" cy="6" r="2.500" fill="${W}"/><path d="M4 23a12 12 0 0 1 24 0z" fill="${W}"/><rect x="2" y="23.500" width="28" height="3" rx="1.500" fill="${a}"/><path d="M9 20a7.500 7.500 0 0 1 5-7" fill="none" stroke="${a}" stroke-width="2" stroke-linecap="round"/>`,
  raio: (a) => `<polygon points="19,2 6,18.500 14.500,18.500 12,30 26,12.500 17.500,12.500" fill="#ffd166" stroke="${W}" stroke-width="1.800" stroke-linejoin="round"/>`,
  forno: (a) => `<rect x="4" y="4" width="24" height="24" rx="3" fill="${W}"/><rect x="8" y="13" width="16" height="11" rx="2" fill="${a}"/><g fill="${a}"><circle cx="9.500" cy="8.500" r="1.600"/><circle cx="15" cy="8.500" r="1.600"/><circle cx="22.500" cy="8.500" r="1.600"/></g><rect x="11" y="18.500" width="10" height="3.500" rx="1.500" fill="#ffd166"/>`,
  chama: (a) => `<path d="M16 2.500c7 6.500 9.500 11 9.500 16a9.500 9.500 0 0 1-19 0c0-2.800 1.200-5.500 3-7.500.500 2.500 1.500 3.800 3 4.500C12 11 13.500 6.500 16 2.500z" fill="${a}"/><path d="M16 15.500c3 3 4 5 4 7a4 4 0 0 1-8 0c0-2 1-4 4-7z" fill="#ffd166"/>`,
  osso: (a) => `<g fill="${W}"><rect x="8" y="13" width="16" height="6" rx="2" transform="rotate(-35 16 16)"/><circle cx="6.500" cy="19" r="3.500"/><circle cx="10" cy="23.500" r="3.500"/><circle cx="22" cy="8.500" r="3.500"/><circle cx="25.500" cy="13" r="3.500"/></g><polygon points="${star(24, 24, 4.500)}" fill="${a}"/>`,
  caderno: (a) => `<rect x="6.500" y="3.500" width="20" height="25" rx="2.500" fill="${W}"/><rect x="6.500" y="3.500" width="5" height="25" rx="2" fill="${a}"/><g stroke="${a}" stroke-width="1.800" stroke-linecap="round"><path d="M15 10h8"/><path d="M15 15h8"/><path d="M15 20h5"/></g><g fill="${W}"><circle cx="9" cy="8.500" r="1.100"/><circle cx="9" cy="16" r="1.100"/><circle cx="9" cy="23.500" r="1.100"/></g>`,
  chapeu: (a) => `<path d="M8 16.500c-3.500-.500-5.500-3-5.500-6 0-3.500 3-6 6.500-5.500 1-2.500 3.800-4 7-4s6 1.500 7 4c3.500-.500 6.500 2 6.500 5.500 0 3-2 5.500-5.500 6v7H8z" fill="${W}"/><rect x="8" y="23" width="16" height="5.500" rx="1.500" fill="${a}"/>`,
  desfazer: (a) => `${sw('M9 12h10.500c4 0 7 3 7 7s-3 7-7 7H11', 3.200)}<polygon points="10.500,5 3.500,12 10.500,19" fill="${W}"/><circle cx="20" cy="19" r="2" fill="${a}"/>`,
  dado: (a) => `<rect x="5" y="5" width="22" height="22" rx="5" fill="${W}"/><g fill="${a}"><circle cx="11" cy="11" r="2.200"/><circle cx="21" cy="11" r="2.200"/><circle cx="16" cy="16" r="2.200"/><circle cx="11" cy="21" r="2.200"/><circle cx="21" cy="21" r="2.200"/></g>`,
  dupla: (a) => `<path d="M3.500 6.500c0-1.700 1.300-3 3-3h11c1.700 0 3 1.300 3 3v7c0 1.700-1.300 3-3 3h-6l-4.500 4v-4c-1.900 0-3.500-1.300-3.500-3z" fill="${W}"/><path d="M28.500 15.500c0-1.700-1.300-3-3-3h-9c-1.700 0-3 1.300-3 3v6c0 1.700 1.300 3 3 3h5l4 4v-4c1.700 0 3-1.300 3-3z" fill="${a}"/><g fill="${a}"><circle cx="8.500" cy="10" r="1.400"/><circle cx="12.500" cy="10" r="1.400"/><circle cx="16.500" cy="10" r="1.400"/></g>`,
  album: (a) => `<path d="M3 7.500C7.500 5.500 12 6 16 8.500v19C12 25 7.500 24.500 3 26.500z" fill="${W}"/><path d="M29 7.500C24.500 5.500 20 6 16 8.500v19c4-2.500 8.500-3 13-1z" fill="${W}"/><polygon points="${star(9.500, 15.500, 3.800)}" fill="${a}"/><circle cx="22.500" cy="15.500" r="3.300" fill="#ffd166"/>`,
  cafe: (a) => `<ellipse cx="16" cy="16" rx="8.500" ry="11.500" fill="#6b3f22" transform="rotate(25 16 16)"/>${sw('M12 6.500q5 9.500 0 19', 2.200, a)}`,
  unicornio: (a) => `<path d="M16 2l4.500 14h-9z" fill="#ffd166"/>${sw('M13.500 9.500l5 1.500', 1.600, W)}${sw('M12.500 13l6.500 1.500', 1.600, W)}<path d="M6 30c0-8 4.500-14 10-14s10 6 10 14z" fill="${W}"/><g fill="none" stroke="#2a1a16" stroke-width="1.800" stroke-linecap="round"><path d="M10 24q2 2 4 0"/><path d="M18 24q2 2 4 0"/></g><circle cx="7" cy="20" r="3" fill="${a}"/><circle cx="25" cy="20" r="3" fill="#b497f0"/>`,
  planeta: (a) => `<circle cx="16" cy="16" r="9" fill="${W}"/><ellipse cx="16" cy="16" rx="14.500" ry="4" fill="none" stroke="${a}" stroke-width="2.400" transform="rotate(-18 16 16)"/><path d="M8 13.500a8.500 8.500 0 0 1 14-4" fill="none" stroke="${a}" stroke-width="2" stroke-linecap="round" opacity=".6"/><polygon points="${star(26.500, 5.500, 3)}" fill="#ffd166"/>`,
};

/** Cores de fundo das figurinhas (as da marca e as do cardápio). */
export const STICKER_COLORS = { rosa: '#d12d58', claro: '#e8809a', cacau: '#4a1a2a', ouro: '#d98a00', verde: '#15803d', menta: '#2f9e7a', azul: '#2f7fd1', marinho: '#1a4a8b', lilas: '#7c5ad6', laranja: '#e8632f', chocolate: '#6b3f22' };

/**
 * Uma figurinha. `art` = [recorte, cor, desenho, cor de destaque].
 * locked: silhueta cinza com "?" (ainda não ganha). Recortes: circ, flor, estrela, escudo, selo, coracao.
 */
export function stickerSvg(sticker, { locked = false, size = 64 } = {}) {
  const [shape = 'circ', color = 'rosa', glyph = 'estrela', accent = '#ffd166'] = sticker?.art || [];
  const draw = SHAPES[shape] || SHAPES.circ;
  const bg = STICKER_COLORS[color] || color;
  const head = `<svg class="ag-stk" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true" focusable="false">`;
  if (locked) {
    return `${head}<g fill="#efeff1" stroke="#d3d1d4" stroke-width="1.500" stroke-dasharray="3 3">${draw(26)}</g><text x="32" y="40" text-anchor="middle" font-family="inherit" font-size="22" font-weight="800" fill="#b8b5b9">?</text></svg>`;
  }
  // recorte branco por fora (como figurinha destacada), cor por dentro, desenho no miolo
  return `${head}<g fill="#ffffff" stroke="#e5e4e6" stroke-width="1">${draw(30)}</g><g fill="${bg}">${draw(26)}</g><g transform="translate(16 16)">${(GLYPHS[glyph] || GLYPHS.estrela)(accent, bg)}</g></svg>`;
}

export const GLYPH_NAMES = Object.keys(GLYPHS);

/* ───────── Ícones pequenos (comanda e botões) ───────── */
const I = (body) => `<svg class="ag-ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
const ICONS = {
  ok: I('<path d="M5 12.500l4.500 4.500L19 7.500"/>'),
  falta: I('<circle cx="12" cy="12" r="8"/>'),
  nao: I('<circle cx="12" cy="12" r="8.500"/><path d="M6 6l12 12"/>'),
  x: I('<path d="M6 6l12 12M18 6L6 18"/>'),
  pessoas: I('<circle cx="9" cy="8" r="3.500"/><path d="M2.500 20c0-3.600 2.900-6.500 6.500-6.500s6.500 2.900 6.500 6.500"/><path d="M16 4.800a3.500 3.500 0 0 1 0 6.400M18 13.800c2.200.900 3.500 3.200 3.500 6.200"/>'),
  orcamento: I('<circle cx="12" cy="12" r="9"/><path d="M14.800 9c-.500-1.200-1.500-1.700-2.800-1.700-1.700 0-2.800.900-2.800 2.300 0 3.200 5.800 1.600 5.800 4.800 0 1.400-1.200 2.300-3 2.300-1.400 0-2.500-.600-3-1.800M12 5.500v1.800M12 16.700v1.800"/>'),
  prazo: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5.500l3.500 2"/>'),
  estrela: `<svg class="ag-ico ag-ico--star" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><polygon points="${star(12, 12.500, 10.500, 0.45)}" fill="currentColor" stroke="currentColor" stroke-width="1.500" stroke-linejoin="round"/></svg>`,
  jogar: I('<path d="M6 11.500c0-3.300 2.700-6 6-6s6 2.700 6 6"/><path d="M4 11.500h16v2.500c0 3.300-2.700 6-6 6h-4c-3.300 0-6-2.700-6-6z"/><path d="M12 2.500v3"/>'),
  album: I('<path d="M4 5.500c2.700-1 5.300-.700 8 1v13c-2.700-1.700-5.300-2-8-1zM20 5.500c-2.700-1-5.300-.700-8 1v13c2.700-1.700 5.300-2 8-1z"/>'),
  raio: I('<path d="M13 2.500L5 13.500h6l-1 8 8-11h-6z"/>'),
  sol: I('<circle cx="12" cy="12" r="4"/><path d="M12 2.500v2.500M12 19v2.500M2.500 12H5M19 12h2.500M5.300 5.300L7 7M17 17l1.700 1.700M18.700 5.300L17 7M7 17l-1.700 1.700"/>'),
  seta: I('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  voltar: I('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
  dica: I('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.500 10.900c.600.500 1 1.200 1 2.100h5c0-.900.400-1.600 1-2.100A6 6 0 0 0 12 3z"/>'),
  caixa: I('<path d="M3.500 8L12 3.500 20.500 8v8.500L12 21l-8.500-4.500z"/><path d="M3.500 8L12 12.500 20.500 8M12 12.500V21"/>'),
  cadeado: I('<rect x="5" y="10.500" width="14" height="10" rx="2"/><path d="M8 10.500V8a4 4 0 0 1 8 0v2.500"/>'),
};
export const iconSvg = (name) => ICONS[name] || ICONS.falta;
