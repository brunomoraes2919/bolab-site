// BOLAB — Ateliê: a Bô em pessoa. Desenho vetorial próprio (nenhuma imagem externa), nascido da marca:
// ela é um pingo de cobertura — a mesma cobertura rosa que escorre dentro do "B" da logo. A bolinha da logo é a
// cabeça, as três gotas da logo são a franja, e no alto fica o biquinho que o saco de confeitar deixa.
// Quatro tons: rosa da marca, branco, vinho (olhos e boca) e um rosa claro de sombra. Um recorte branco em volta
// (como figurinha) separa a Bô de qualquer fundo do palco.
//
//   const av = createAvatar();
//   mount.append(av.el);
//   av.set('falando', { mood: 'feliz' });   // parada | ouvindo | pensando | falando | feliz | comemorando | surpresa | preocupada | dormindo
//   av.mouth(0.7);                           // abertura da boca enquanto fala (0 a 1)
//   av.look(1, -0.3);                        // para onde ela olha (-1 a 1 em cada eixo)
//   av.gesture('pop');                       // entrada ('pop'), saída ('out') e os gestos de cada estado
//
// O desenho é montado nó a nó (createElementNS + atributos): nenhum HTML em texto, nenhum estilo embutido — a
// política de segurança da loja não aceita estilo criado por código. As cores e as animações são classes de
// css/atelier-bo.css (tokens de css/tokens.css). Só transform e opacity são animados; fora da tela (ou com a aba
// escondida) as animações param (.is-away). A caixa é quadrada (viewBox 120 × 120).

export const AVATAR_STATES = ['parada', 'ouvindo', 'pensando', 'falando', 'feliz', 'comemorando', 'surpresa', 'preocupada', 'dormindo'];

const NS = 'http://www.w3.org/2000/svg';

/** Nó SVG: s('path', { class: 'bo-c-skin', d: '…' }, [filhos]). */
function s(tag, attrs = {}, kids = []) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  for (const kid of kids) n.append(kid);
  return n;
}

/* ───────── geometria ───────── */
// Cabeça: círculo de centro (60, 71) e raio 43.
const HEAD = { cx: 60, cy: 71, r: 43 };
// Biquinho: nasce tangente ao círculo (em 232° e 300°), sobe e vira a ponta para a direita. A base fecha por dentro
// da cabeça, para ele poder balançar sem abrir fresta.
const TIP = 'M33.52,37.12 C41.4,30.96 50.5,28 54.5,19 C57,13.4 61,7.5 68,7.6 C71,7.6 74.6,9 75.4,11.7 C75.9,13.5 74.4,15.1 72.6,14.9 C70,14.7 67.2,16.2 66.6,19.5 C65.8,24 73.7,29.26 81.5,33.76 L80,50 L36,50 Z';

// Rosto: a parte de baixo de um círculo branco (centro (60, 73), raio 36,5); em cima, a cobertura desce em três
// gotas de larguras e comprimentos diferentes, com os vãos arredondados — a mesma construção da logo.
const FACE_R = 36.5;
const DRIPS = [
  { x0: 34, x1: 45.5, y: 62.5 },
  { x0: 53.5, x1: 67, y: 68.5 },
  { x0: 75, x1: 87, y: 64 },
];
const n2 = (v) => Number(v.toFixed(2));
function facePath(base, drop = 0) {
  const dx = Math.sqrt(FACE_R * FACE_R - (base - 73) * (base - 73));
  const xl = n2(60 - dx);
  const xr = n2(60 + dx);
  let d = `M${xl},${base}`;
  let x = xl;
  for (const g of DRIPS) {
    const gap = n2((g.x0 - x) / 2);
    const r = n2((g.x1 - g.x0) / 2);
    d += ` A${gap},${gap} 0 0 1 ${g.x0},${base} V${g.y + drop} A${r},${r} 0 0 0 ${g.x1},${g.y + drop} V${base}`;
    x = g.x1;
  }
  const gap = n2((xr - x) / 2);
  return `${d} A${gap},${gap} 0 0 1 ${xr},${base} A${FACE_R},${FACE_R} 0 1 1 ${xl},${base} Z`;
}

const EYE = { y: 85, xl: 44.5, xr: 75.5, rx: 4.9, ry: 6.4 };
const star4 = (cx, cy, r) => {
  const k = r * 0.3;
  return `M${cx},${cy - r} L${cx + k},${cy - k} L${cx + r},${cy} L${cx + k},${cy + k} L${cx},${cy + r} L${cx - k},${cy + k} L${cx - r},${cy} L${cx - k},${cy - k} Z`;
};
const zed = (x, y, w, h) => `M${x},${y} h${w} l${-w},${h} h${w}`;

function draw() {
  const eyesOpen = s('g', { class: 'bo-eye bo-eye--open' }, [
    s('g', { class: 'bo-pupils' }, [
      s('ellipse', { class: 'bo-c-ink', cx: EYE.xl, cy: EYE.y, rx: EYE.rx, ry: EYE.ry }),
      s('ellipse', { class: 'bo-c-ink', cx: EYE.xr, cy: EYE.y, rx: EYE.rx, ry: EYE.ry }),
    ]),
  ]);
  const eyesArc = s('g', { class: 'bo-eye bo-eye--arc' }, [
    s('path', { class: 'bo-l-ink', d: 'M38.8,87.6 Q44.5,78.6 50.2,87.6' }),
    s('path', { class: 'bo-l-ink', d: 'M69.8,87.6 Q75.5,78.6 81.2,87.6' }),
  ]);
  const eyesShut = s('g', { class: 'bo-eye bo-eye--shut' }, [
    s('path', { class: 'bo-l-ink', d: 'M39.3,85.4 Q44.5,90.6 49.7,85.4' }),
    s('path', { class: 'bo-l-ink', d: 'M70.3,85.4 Q75.5,90.6 80.7,85.4' }),
  ]);
  const mouths = s('g', { class: 'bo-mouths', transform: 'translate(0 -0.8)' }, [
    s('path', { class: 'bo-l-ink bo-mouth bo-mouth--smile', d: 'M53.6,93.6 Q60,100 66.4,93.6' }),
    s('g', { class: 'bo-mouth bo-mouth--grin' }, [
      s('path', { class: 'bo-c-ink', d: 'M51.2,92.4 Q60,90.8 68.8,92.4 Q69,103.4 60,103.4 Q51,103.4 51.2,92.4 Z' }),
      s('ellipse', { class: 'bo-c-tongue', cx: 60, cy: 100.5, rx: 4.6, ry: 2.4 }),
    ]),
    s('g', { class: 'bo-mouth bo-mouth--open' }, [
      s('g', { class: 'bo-jaw' }, [
        s('path', { class: 'bo-c-ink', d: 'M53,93 Q60,91.6 67,93 Q67.4,103.6 60,103.6 Q52.6,103.6 53,93 Z' }),
        s('ellipse', { class: 'bo-c-tongue', cx: 60, cy: 100.8, rx: 3.9, ry: 2.1 }),
      ]),
    ]),
    s('ellipse', { class: 'bo-c-ink bo-mouth bo-mouth--o', cx: 60, cy: 97.4, rx: 3.9, ry: 4.7 }),
    s('path', { class: 'bo-l-ink bo-mouth bo-mouth--wavy', d: 'M53,97.6 Q56.5,94 60,97.2 T67,96.8' }),
    s('path', { class: 'bo-l-ink bo-mouth bo-mouth--flat', d: 'M57.5,96.8 Q62,98.2 67,95.8' }),
    s('ellipse', { class: 'bo-c-ink bo-mouth bo-mouth--zz', cx: 60, cy: 97, rx: 2.5, ry: 2.9 }),
  ]);
  const face = s('g', { class: 'bo-face' }, [
    s('ellipse', { class: 'bo-cheek', cx: 34.6, cy: 95.2, rx: 5.2, ry: 3.3 }),
    s('ellipse', { class: 'bo-cheek', cx: 85.4, cy: 95.2, rx: 5.2, ry: 3.3 }),
    s('g', { class: 'bo-eyes' }, [eyesOpen, eyesArc, eyesShut]),
    // pálpebras (da cor do rosto): caídas para fora na preocupação; uma só, reta, no "hum…" de quem pensa.
    // Fazem o papel das sobrancelhas sem disputar espaço com a franja — e leem bem em 48 px.
    s('polygon', { class: 'bo-c-face bo-lid bo-lid--sad', points: '37,74 52.5,74 52.5,78.4 37,85.4' }),
    s('polygon', { class: 'bo-c-face bo-lid bo-lid--sad', points: '83,74 67.5,74 67.5,78.4 83,85.4' }),
    s('rect', { class: 'bo-c-face bo-lid bo-lid--half', x: 37, y: 72, width: 18, height: 8.4 }),
    mouths,
  ]);
  const tip = (cls) => s('path', { class: cls, d: TIP });
  const head = (cls) => s('circle', { class: cls, cx: HEAD.cx, cy: HEAD.cy, r: HEAD.r });
  return s('svg', { class: 'bo-svg', viewBox: '0 0 120 120', 'aria-hidden': 'true', focusable: 'false' }, [
    s('g', { class: 'bo-all' }, [
      // recorte branco (por baixo de tudo), biquinho, cabeça, rosto
      head('bo-key'),
      // três camadas de movimento: o humor (gira em volta do centro da cabeça, então a base nunca descola do
      // círculo), o balanço ocioso e o comprimento (estica no susto, encolhe no cochilo)
      s('g', { class: 'bo-tip' }, [s('g', { class: 'bo-tip__sway' }, [s('g', { class: 'bo-tip__len' }, [tip('bo-key'), tip('bo-c-skin')])])]),
      head('bo-c-skin'),
      s('path', { class: 'bo-c-shade', d: facePath(61) }),
      s('path', { class: 'bo-c-face', d: facePath(63.4, 2.4) }),
      face,
      s('path', { class: 'bo-extra bo-sweat', d: 'M99.5,33 Q105,42 99.5,46 Q94,42 99.5,33 Z' }),
    ]),
    s('g', { class: 'bo-extra bo-dots' }, [s('circle', { cx: 91, cy: 25, r: 2.7 }), s('circle', { cx: 100, cy: 16.5, r: 3.4 }), s('circle', { cx: 110, cy: 7.5, r: 4.1 })]),
    s('g', { class: 'bo-extra bo-zz' }, [
      s('path', { class: 'bo-zz__o', d: zed(22, 20, 7, 8) }),
      s('path', { d: zed(22, 20, 7, 8) }),
      s('path', { class: 'bo-zz__o', d: zed(7, 5, 9.5, 11) }),
      s('path', { d: zed(7, 5, 9.5, 11) }),
    ]),
    s('g', { class: 'bo-extra bo-sparks' }, [s('path', { d: star4(12, 28, 9) }), s('path', { d: star4(104, 19, 10.5) }), s('path', { d: star4(111, 58, 6.5) })]),
  ]);
}

/**
 * Rosto de cada estado: olhos · boca · sobrancelhas · extra · gesto (animação de uma vez).
 * "Sobrancelhas" (brows) é o nome de sempre do atributo; no desenho, quem responde são as pálpebras:
 * worried = caídas, one = uma só meio fechada, up/none = olho inteiro.
 */
const FACE = {
  parada: { eyes: 'open', mouth: 'smile', brows: 'none', extra: '', anim: '' },
  ouvindo: { eyes: 'wide', mouth: 'smile', brows: 'up', extra: '', anim: 'nod' },
  pensando: { eyes: 'look', mouth: 'flat', brows: 'one', extra: 'dots', anim: '' },
  falando: { eyes: 'open', mouth: 'open', brows: 'none', extra: '', anim: '' },
  feliz: { eyes: 'arc', mouth: 'grin', brows: 'none', extra: '', anim: 'hop' },
  comemorando: { eyes: 'arc', mouth: 'grin', brows: 'none', extra: 'sparks', anim: 'cheer' },
  surpresa: { eyes: 'wide', mouth: 'o', brows: 'up', extra: '', anim: 'jolt' },
  preocupada: { eyes: 'open', mouth: 'wavy', brows: 'worried', extra: 'sweat', anim: 'wobble' },
  dormindo: { eyes: 'shut', mouth: 'zz', brows: 'none', extra: 'zz', anim: '' },
};

/** Enquanto fala, o humor da fala muda os olhos e as sobrancelhas (a boca é da voz). */
const TALK = {
  neutra: { eyes: 'open', brows: 'none', extra: '' },
  feliz: { eyes: 'arc', brows: 'none', extra: '' },
  comemora: { eyes: 'arc', brows: 'none', extra: 'sparks' },
  surpresa: { eyes: 'wide', brows: 'up', extra: '' },
  preocupada: { eyes: 'open', brows: 'worried', extra: 'sweat' },
  pensando: { eyes: 'open', brows: 'one', extra: '' },
};

export function createAvatar() {
  const el = document.createElement('span');
  el.className = 'bo-av';
  const fig = document.createElement('span');
  fig.className = 'bo-av__fig';
  fig.append(draw());
  el.append(fig);
  let state = '';
  let animTimer = 0;

  function apply(face) {
    el.dataset.eyes = face.eyes;
    el.dataset.mouth = face.mouth;
    el.dataset.brows = face.brows;
    el.dataset.extra = face.extra || '';
  }

  function gesture(name) {
    clearTimeout(animTimer);
    if (!name) {
      delete fig.dataset.anim;
      return;
    }
    // reinicia a animação mesmo se o gesto for o mesmo de antes
    delete fig.dataset.anim;
    void fig.offsetWidth;
    fig.dataset.anim = name;
    if (name !== 'out') animTimer = setTimeout(() => delete fig.dataset.anim, 1400); // a saída fica no último quadro
  }

  function set(next, { mood = 'neutra', quiet = false } = {}) {
    const face = FACE[next] || FACE.parada;
    const name = FACE[next] ? next : 'parada';
    const changed = name !== state || name === 'falando';
    state = name;
    el.dataset.state = name;
    if (name === 'falando') {
      el.dataset.mood = TALK[mood] ? mood : 'neutra';
      apply({ ...face, ...(TALK[mood] || TALK.neutra) });
    } else {
      delete el.dataset.mood;
      apply(face);
    }
    if (changed && !quiet) gesture(face.anim);
    if (name !== 'falando') mouth(0);
  }

  function mouth(level) {
    el.style.setProperty('--bo-mouth', String(Math.max(0, Math.min(1, level || 0)).toFixed(2)));
  }

  function look(x = 0, y = 0) {
    el.style.setProperty('--bo-lx', `${(Math.max(-1, Math.min(1, x)) * 2.8).toFixed(2)}px`);
    el.style.setProperty('--bo-ly', `${(Math.max(-1, Math.min(1, y)) * 2).toFixed(2)}px`);
  }

  set('parada', { quiet: true });
  look(0, 0);

  return {
    el,
    set,
    mouth,
    look,
    gesture,
    get state() {
      return state;
    },
    /** Pausa as animações contínuas (fora da tela, aba escondida). */
    pause(away) {
      el.classList.toggle('is-away', Boolean(away));
    },
    destroy() {
      clearTimeout(animTimer);
      el.remove();
    },
  };
}
