// BOLAB — Ateliê: a Bô em pessoa. Desenho vetorial próprio (nenhuma imagem externa), nascido da marca:
// a bolinha da logo virou a cabeça, o "B" virou o corpo, e a cobertura que escorre por dentro do B continua lá.
// Estilo "figurinha": cada parte tem contorno branco, então ela se destaca em qualquer fundo do palco.
//
//   const av = createAvatar();
//   mount.append(av.el);
//   av.set('falando', { mood: 'feliz' });   // parada | ouvindo | pensando | falando | feliz | comemorando | surpresa | preocupada | dormindo
//   av.mouth(0.7);                           // abertura da boca enquanto fala (0 a 1)
//   av.look(1, -0.3);                        // para onde ela olha (-1 a 1 em cada eixo)
//
// Só transform e opacity são animados; fora da tela (ou com a aba escondida) as animações param (.is-away).
// As cores vêm de css/tokens.css (ver css/atelier-bo.css).

export const AVATAR_STATES = ['parada', 'ouvindo', 'pensando', 'falando', 'feliz', 'comemorando', 'surpresa', 'preocupada', 'dormindo'];

// O "B" do corpo: haste à esquerda, duas barrigas à direita (a de baixo maior), como na logo.
const BODY = 'M46,95 H64 C74,95 80,100 80,106 C80,111 77,115 73,116.5 C81,118.5 87,124 87,131 C87,140 80,146 70,146 H46 Q40,146 40,140 V101 Q40,95 46,95 Z';
// A cobertura escorrendo dentro da barriga de baixo (três gotas, a do meio mais comprida).
const DRIP = 'M50,121 H72 Q77,121 77,126 V128.5 Q77,132.5 73.6,132.5 Q70.2,132.5 70.2,128.8 Q70.2,126.4 67.9,126.4 Q65.6,126.4 65.6,129 V133 Q65.6,137.4 62.1,137.4 Q58.6,137.4 58.6,133 V128.6 Q58.6,126.4 56.4,126.4 Q54.2,126.4 54.2,128.4 Q54.2,130.6 52.1,130.6 Q50,130.6 50,128.4 Z';
// O chapéu de confeiteira: uma nuvem sobre uma faixa.
const HAT_PUFF = 'M45,23 C35,21 33,8 44,7 C47,-2 62,-3 66,5 C76,0 90,8 81,19 C83,22 80,25 76,23 Z';

const SVG = `
<svg class="bo-svg" viewBox="0 0 120 158" aria-hidden="true" focusable="false">
  <g transform="translate(0 7)">
    <ellipse class="bo-ground" cx="62" cy="147" rx="27" ry="4"/>
    <g class="bo-body-all">
      <g class="bo-arm bo-arm--l"><circle class="bo-s bo-c-skin" cx="36" cy="123" r="6.2"/></g>
      <g class="bo-arm bo-arm--r"><circle class="bo-s bo-c-skin" cx="90" cy="122" r="6.2"/></g>
      <path class="bo-s bo-c-skin" d="${BODY}"/>
      <rect class="bo-c-white" x="50" y="102.5" width="19.5" height="7.5" rx="3.75"/>
      <path class="bo-c-white" d="${DRIP}"/>
    </g>
    <g class="bo-head">
      <circle class="bo-s bo-c-skin" cx="60" cy="62" r="36"/>
      <path class="bo-shine" d="M33,50 Q37,37 49,31"/>
      <g class="bo-hat">
        <g transform="rotate(-11 60 26) translate(-3 -1) scale(1.06)" style="transform-origin:60px 26px">
          <path class="bo-s bo-c-white" d="${HAT_PUFF}"/>
          <rect class="bo-s bo-c-white" x="44" y="20" width="32" height="10.5" rx="4.5"/>
          <path class="bo-hat-line" d="M46.5,22.2 H73.5"/>
          <path class="bo-hat-line" d="M52,11 Q54,15 52.5,18.5 M66,9 Q65,14 67,18"/>
        </g>
      </g>
      <g class="bo-face">
        <ellipse class="bo-cheek" cx="35.5" cy="77" rx="5.6" ry="3.6"/>
        <ellipse class="bo-cheek" cx="84.5" cy="77" rx="5.6" ry="3.6"/>
        <g class="bo-brows">
          <path class="bo-l-ink bo-brow bo-brow--l" d="M40.5,53 Q45.5,50.5 51,52"/>
          <path class="bo-l-ink bo-brow bo-brow--r" d="M69,52 Q74.5,50.5 79.5,53"/>
        </g>
        <g class="bo-eyes">
          <g class="bo-eye bo-eye--open">
            <g class="bo-pupils">
              <ellipse class="bo-c-ink" cx="46.5" cy="66" rx="5" ry="6.7"/>
              <ellipse class="bo-c-ink" cx="73.5" cy="66" rx="5" ry="6.7"/>
              <circle class="bo-c-white" cx="48.3" cy="63.3" r="1.9"/>
              <circle class="bo-c-white" cx="75.3" cy="63.3" r="1.9"/>
            </g>
          </g>
          <g class="bo-eye bo-eye--arc">
            <path class="bo-l-ink" d="M41,68.5 Q46.5,60.5 52,68.5"/>
            <path class="bo-l-ink" d="M68,68.5 Q73.5,60.5 79,68.5"/>
          </g>
          <g class="bo-eye bo-eye--shut">
            <path class="bo-l-ink" d="M41.5,66 Q46.5,70.8 51.5,66"/>
            <path class="bo-l-ink" d="M68.5,66 Q73.5,70.8 78.5,66"/>
          </g>
        </g>
        <g class="bo-mouths">
          <path class="bo-l-ink bo-mouth bo-mouth--smile" d="M52.5,78.5 Q60,85.8 67.5,78.5"/>
          <g class="bo-mouth bo-mouth--grin">
            <path class="bo-c-mouth" d="M50.5,77.5 Q60,75.5 69.5,77.5 Q69,89.5 60,89.5 Q51,89.5 50.5,77.5 Z"/>
            <ellipse class="bo-c-tongue" cx="60" cy="86.4" rx="4.6" ry="2.4"/>
          </g>
          <g class="bo-mouth bo-mouth--open">
            <g class="bo-jaw">
              <path class="bo-c-mouth" d="M52,78 Q60,76.4 68,78 Q68,89.5 60,89.5 Q52,89.5 52,78 Z"/>
              <ellipse class="bo-c-tongue" cx="60" cy="86.6" rx="4" ry="2.1"/>
            </g>
          </g>
          <ellipse class="bo-c-mouth bo-mouth bo-mouth--o" cx="60" cy="82.5" rx="4" ry="4.8"/>
          <path class="bo-l-ink bo-mouth bo-mouth--wavy" d="M52.5,83 Q56.2,79 60,82.5 T67.5,82"/>
          <path class="bo-l-ink bo-mouth bo-mouth--flat" d="M56,82.5 Q60,84 65,81.5"/>
          <ellipse class="bo-c-mouth bo-mouth bo-mouth--zz" cx="60" cy="82.5" rx="2.6" ry="3"/>
        </g>
      </g>
      <path class="bo-extra bo-sweat" d="M93,36 Q99,45 93,49 Q87,45 93,36 Z"/>
    </g>
    <g class="bo-extra bo-dots">
      <circle cx="97" cy="30" r="3"/><circle cx="106" cy="22" r="3.6"/><circle cx="114.5" cy="12" r="4.2"/>
    </g>
    <g class="bo-extra bo-zz">
      <path class="bo-zz__o" d="M94,34 h7 l-7,8 h7"/><path d="M94,34 h7 l-7,8 h7"/>
      <path class="bo-zz__o" d="M104,18 h9 l-9,10.5 h9"/><path d="M104,18 h9 l-9,10.5 h9"/>
    </g>
    <g class="bo-extra bo-sparks">
      <path d="M12,40 l2.2,5.2 5.2,2.2 -5.2,2.2 -2.2,5.2 -2.2,-5.2 -5.2,-2.2 5.2,-2.2 Z"/>
      <path d="M106,26 l2.6,6 6,2.6 -6,2.6 -2.6,6 -2.6,-6 -6,-2.6 6,-2.6 Z"/>
      <path d="M108,74 l1.7,4 4,1.7 -4,1.7 -1.7,4 -1.7,-4 -4,-1.7 4,-1.7 Z"/>
    </g>
  </g>
</svg>`;

/** Rosto de cada estado: olhos · boca · sobrancelhas · extra · gesto (animação de uma vez). */
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
  // Desenho fixo, escrito neste arquivo: não há dado de fora neste HTML.
  el.innerHTML = `<span class="bo-av__fig">${SVG}</span>`;
  const fig = el.firstElementChild;
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
    animTimer = setTimeout(() => delete fig.dataset.anim, 1400);
  }

  function set(next, { mood = 'neutra', quiet = false } = {}) {
    const face = FACE[next] || FACE.parada;
    const name = FACE[next] ? next : 'parada';
    const changed = name !== state || name === 'falando';
    state = name;
    el.dataset.state = name;
    if (name === 'falando') apply({ ...face, ...(TALK[mood] || TALK.neutra) });
    else apply(face);
    if (changed && !quiet) gesture(face.anim);
    if (name !== 'falando') mouth(0);
  }

  function mouth(level) {
    el.style.setProperty('--bo-mouth', String(Math.max(0, Math.min(1, level || 0)).toFixed(2)));
  }

  function look(x = 0, y = 0) {
    el.style.setProperty('--bo-lx', `${(Math.max(-1, Math.min(1, x)) * 2.4).toFixed(2)}px`);
    el.style.setProperty('--bo-ly', `${(Math.max(-1, Math.min(1, y)) * 1.8).toFixed(2)}px`);
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
