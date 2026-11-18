// BOLAB — Ateliê: mãos na massa. Os gestos da pessoa sobre o bolo, cada um com saída por botão/teclado:
//
//   colocar com o dedo   (etapa Decoração)  escolhe a peça no painel → toca no bolo → a prévia mostra onde ela assenta
//                        (verde cabe · vermelho não cabe) → solta. Arrastar uma peça muda de lugar; tocar nela tira.
//                        Com a cena carregada vale o topo de qualquer andar e a LATERAL (para as peças que grudam nela);
//                        sem a cena, só o topo do último andar. Grava em config.decor.placed (preço por unidade).
//                        Por botão: "Colocar onde couber", "Tirar uma", "Tirar todas" (no painel) e Enter no bolo.
//   pingar a calda       (etapa Cobertura)  tocar na borda liga a calda; com ela ligada, a gota mais próxima escorre
//                        de novo (cena.dripAt). Por botão: o interruptor "Calda escorrendo" e a "Quantidade", no painel.
//   velas                (etapa Decoração)  acender e segurar para soprar (cena.candles) — só com a cena carregada.
//   girar o prato        (etapa Cobertura)  cobertura nova: a cena espalha o topo e a lateral segue o dedo
//                        (cena.spread); parada 1,5 s, termina sozinha. Sem a cena, o bolo dá uma volta.
//
// Cada gesto avisa o barramento: bus.emit('gesture', { id, phase: 'start' | 'move' | 'end', value }).
// `scene()` (recebido de index.js) só devolve a cena depois de carregada (cake.atelier.ready): antes disso, e no
// modo rápido sem cena, a conta de onde o dedo tocou é feita aqui com a câmera do motor (só o topo do bolo).
import { html, raw } from '../../ui.js';
import { canPlace, nearestFree } from '../../customizer/occupancy.js';
import { cakeMetrics } from '../../customizer/geometry.js';
import { getDecor, DECORS, MAX_PLACED, DRIP_PRICE } from '../../data/customizer.js';

const TAU = Math.PI * 2;
const mul = (e, [x, y, z, w]) => [e[0] * x + e[4] * y + e[8] * z + e[12] * w, e[1] * x + e[5] * y + e[9] * z + e[13] * w, e[2] * x + e[6] * y + e[10] * z + e[14] * w, e[3] * x + e[7] * y + e[11] * z + e[15] * w];
const brl = (v) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`;
const svg = (body) => raw(`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`);
const ICON = {
  flame: svg('<path d="M12 3c2.6 2.6 4 4.700 4 7a4 4 0 0 1-8 0c0-.900.300-1.800.900-2.700.3 1 1 1.700 1.700 1.900C10.200 7 10.700 5 12 3Z"/><path d="M8 21h8M12 14v7"/>'),
  wind: svg('<path d="M3 8h9.500a2.500 2.500 0 1 0-2.400-3.200"/><path d="M3 12h15a3 3 0 1 1-2.900 3.800"/><path d="M3 16h6"/>'),
  turn: svg('<path d="M21 12a9 9 0 1 1-3-6.700"/><path d="M21 4v5h-5"/>'),
};

/**
 * Botão de "segurar para soprar". Segurar enche o anel; soltar sopra com a força do tempo segurado.
 * Pelo teclado (Enter/Espaço) ou por um toque rápido, sopra de uma vez. → elemento com .destroy().
 */
export function blowButton({ label = 'Segure para soprar', onStart, onBlow, reduceMotion = false }) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'at-blow';
  el.innerHTML = String(html`<span class="at-blow__ring" aria-hidden="true"><i></i></span><span class="at-blow__icon">${ICON.wind}</span><span class="at-blow__label">${label}</span>`);
  const fill = el.querySelector('i');
  let t0 = 0;
  let raf = 0;
  let held = false;
  let quickBlows = 0;
  const FULL = 1100;
  const paint = () => {
    const k = Math.min(1, (performance.now() - t0) / FULL);
    fill.style.transform = `scale(${0.2 + 0.8 * k})`;
    if (held && k < 1) raf = requestAnimationFrame(paint);
    else if (held) release();
  };
  function release() {
    if (!held) return;
    held = false;
    cancelAnimationFrame(raf);
    el.classList.remove('is-held');
    const k = Math.min(1, (performance.now() - t0) / FULL);
    fill.style.transform = '';
    // um toque rápido é um sopro fraco na primeira vez (pode sobrar vela acesa) e, daí em diante, já apaga tudo:
    // ninguém fica preso por não conseguir segurar o botão
    const quick = k < 0.25;
    onBlow?.(quick ? (quickBlows++ ? 0.7 : 0.4) : 0.6 + 0.4 * k);
  }
  el.addEventListener('pointerdown', (ev) => {
    if (ev.button > 0 || held) return;
    held = true;
    t0 = performance.now();
    el.classList.add('is-held');
    try {
      el.setPointerCapture(ev.pointerId);
    } catch {
      // sem captura: vale enquanto o dedo estiver no botão
    }
    onStart?.();
    if (reduceMotion) return;
    raf = requestAnimationFrame(paint);
  });
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('click', (ev) => {
    // teclado e leitor de tela (clique sem ponteiro): sopra de uma vez
    if (ev.detail === 0) onBlow?.(1);
  });
  el.destroy = () => {
    cancelAnimationFrame(raf);
    el.remove();
  };
  return el;
}

export function createHands(host, { scene, atelie, later, hint }) {
  const notes = host.notes;
  const { bus } = host;
  const fx = host.fx;
  let armed = null; // id da peça na mão
  let press = null; // dedo no bolo: { id, x0, y0, on, moved }
  let ghostRaf = 0;
  let ghostAt = null;
  let banner = null;
  let chip = null; // a ferramenta da etapa na coluna do palco (acender / soprar as velas)
  let blowTold = false; // o recado que explica o botão de soprar já foi dado nesta visita
  let spreading = null;
  let dripHinted = false;
  let candleTries = 0;
  const ghost = document.createElement('i');
  ghost.className = 'at-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  fx.append(ghost);

  const gesture = (id, phase, value) => bus.emit('gesture', value === undefined ? { id, phase } : { id, phase, value });
  const placed = () => host.config().decor.placed || [];
  const step = () => host.step();

  /* ───────── onde o dedo tocou ───────── */
  function topOf() {
    try {
      const m = cakeMetrics(host.shown(), 0.5);
      return { y: m.y0 + m.Ht, R: m.R };
    } catch {
      return null;
    }
  }
  function camera() {
    const cam = host.cake()?.debug?.camera;
    if (!cam || !cam.matrixWorld || !cam.projectionMatrixInverse) return null;
    cam.updateMatrixWorld?.();
    return cam;
  }
  /** Toque → ponto no bolo: { face, x, z, y?, tier?, real? } ou null (fora do bolo). */
  function pick(clientX, clientY) {
    const sc = scene();
    if (sc && typeof sc.pick === 'function') {
      try {
        const h = sc.pick(clientX, clientY);
        return h ? { face: h.face === 'lateral' ? 'lateral' : 'topo', x: h.x, z: h.z, y: h.y, tier: h.tier, real: true } : null;
      } catch {
        // a cena não soube responder: cai na conta daqui
      }
    }
    const cam = camera();
    const top = topOf();
    if (!cam || !top) return null;
    const r = host.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const nx = ((clientX - r.left) / r.width) * 2 - 1;
    const ny = 1 - ((clientY - r.top) / r.height) * 2;
    const v = mul(cam.projectionMatrixInverse.elements, [nx, ny, 0.5, 1]);
    const p = mul(cam.matrixWorld.elements, [v[0] / v[3], v[1] / v[3], v[2] / v[3], 1]);
    const o = cam.matrixWorld.elements;
    const d = [p[0] - o[12], p[1] - o[13], p[2] - o[14]];
    if (Math.abs(d[1]) < 1e-6) return null;
    const t = (top.y - o[13]) / d[1];
    if (t <= 0) return null;
    const x = o[12] + d[0] * t;
    const z = o[14] + d[2] * t;
    if (Math.hypot(x, z) > top.R * 1.45) return null;
    return { face: 'topo', x, z, rim: Math.hypot(x, z) / top.R };
  }
  /** O toque foi na borda do bolo (o anel de fora do topo, ou o alto da lateral)? */
  function onRim(hit) {
    if (!hit.real) return hit.rim > 0.62;
    try {
      const stack = cakeMetrics(host.shown(), 0.5).stack;
      const t = stack[Math.min(hit.tier ?? stack.length - 1, stack.length - 1)];
      if (hit.face === 'lateral') return hit.y > t.y0 + t.Ht * 0.55;
      return Math.hypot(hit.x - (t.center?.x || 0), hit.z - (t.center?.z || 0)) > t.R * 0.6;
    } catch {
      return true;
    }
  }
  /** Ponto do bolo → posição na tela (para a prévia desenhada aqui). */
  function project(x, y, z) {
    const cam = camera();
    if (!cam || !cam.matrixWorldInverse || !cam.projectionMatrix) return null;
    const v = mul(cam.projectionMatrix.elements, mul(cam.matrixWorldInverse.elements, [x, y, z, 1]));
    if (!v[3]) return null;
    const r = host.canvas.getBoundingClientRect();
    const f = fx.getBoundingClientRect();
    return { x: r.left - f.left + ((v[0] / v[3]) * 0.5 + 0.5) * r.width, y: r.top - f.top + (0.5 - (v[1] / v[3]) * 0.5) * r.height };
  }

  /* ───────── colocar com o dedo ───────── */
  const placing = () => step() === 'decoracao' && (Boolean(armed) || placed().length > 0);
  const pieceAt = (hit, id = armed) => ({ id, x: +hit.x.toFixed(3), z: +hit.z.toFixed(3), rot: 0, scale: 1, face: hit.face === 'lateral' ? 'lateral' : 'topo', ...(hit.face === 'lateral' && hit.y != null ? { y: +Number(hit.y).toFixed(3) } : {}) });
  /** A peça já colocada mais perto do toque (até 3,5 cm), ou -1. */
  function hitPlaced(hit) {
    let best = -1;
    let dist = 0.35;
    const side = hit.face === 'lateral';
    const dir = (q) => {
      const l = Math.hypot(q.x, q.z) || 1;
      return [q.x / l, q.z / l];
    };
    placed().forEach((q, i) => {
      if ((q.face === 'lateral') !== side) return;
      let d;
      if (side) {
        // na lateral a peça é guardada pela direção a partir do eixo e pela altura
        const a = dir(q);
        const b = dir(hit);
        d = Math.hypot(a[0] - b[0], a[1] - b[1]) * 0.8 + Math.abs((q.y ?? hit.y ?? 0) - (hit.y ?? 0));
      } else d = Math.hypot(q.x - hit.x, q.z - hit.z);
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    return best;
  }
  /** Onde a peça assenta de verdade: no ponto pedido, no lugar livre mais próximo, ou em lugar nenhum (null). */
  function settle(config, piece) {
    try {
      if (canPlace(config, piece).ok) return piece;
      const near = nearestFree(config, piece, { reach: 0.6 });
      return near ? { ...piece, x: +near.x.toFixed(3), z: +near.z.toFixed(3), ...(near.y != null ? { y: +near.y.toFixed(3) } : {}) } : null;
    } catch (err) {
      console.error('[atelie] não deu para conferir o lugar da peça:', err);
      return null;
    }
  }
  const without = (i) => ({ ...host.config(), decor: { ...host.config().decor, placed: placed().filter((_, k) => k !== i) } });

  const fits = (config, piece) => {
    try {
      return canPlace(config, piece).ok;
    } catch {
      return false;
    }
  };
  /** O primeiro lugar livre do topo para a peça, do centro para a borda (ou null: o topo está cheio). */
  function topSpot(id) {
    const top = topOf();
    if (!top || !getDecor(id)) return null;
    const config = host.config();
    for (let i = 0; i < 48; i++) {
      const r = top.R * 0.88 * Math.sqrt(i / 48);
      const a = i * 2.399963;
      const piece = { id, x: +(r * Math.cos(a)).toFixed(3), z: +(r * Math.sin(a)).toFixed(3), rot: +((i * 1.7) % TAU).toFixed(2), scale: 1, face: 'topo' };
      if (fits(config, piece)) return piece;
    }
    return null;
  }
  /** Esta peça gruda na lateral? (só importa com a cena carregada: é ela que diz onde o dedo tocou na lateral) */
  const sideMemo = new Map();
  function sideCapable(id) {
    if (!scene()) return false;
    if (!sideMemo.has(id)) {
      let why = 'desconhecida';
      try {
        why = canPlace(host.config(), { id, x: 0, z: 1, rot: 0, scale: 1, face: 'lateral' }).why;
      } catch {
        why = 'desconhecida';
      }
      sideMemo.set(id, why !== 'desconhecida');
    }
    return sideMemo.get(id);
  }
  /** O primeiro lugar livre da lateral, começando pela frente do bolo e abrindo para os lados. */
  function sideSpot(id) {
    if (!sideCapable(id)) return null;
    const config = host.config();
    let heights = [undefined];
    try {
      const t = cakeMetrics(host.shown(), 0.5).stack[0];
      heights = [0.5, 0.3, 0.68].map((k) => +(t.y0 + t.Ht * k).toFixed(3));
    } catch {
      heights = [undefined];
    }
    for (const y of heights) {
      for (let i = 0; i < 16; i++) {
        const a = Math.PI / 2 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.39; // a frente do bolo é +z
        const piece = { id, x: +Math.cos(a).toFixed(3), z: +Math.sin(a).toFixed(3), rot: 0, scale: 1, face: 'lateral', ...(y != null ? { y } : {}) };
        if (fits(config, piece)) return piece;
      }
    }
    return null;
  }
  const findSpot = (id) => topSpot(id) || sideSpot(id);
  /** Onde ainda cabe esta peça: 'topo' | 'lateral' | '' (em lugar nenhum). */
  function roomFor(id) {
    if (topSpot(id)) return 'topo';
    return sideSpot(id) ? 'lateral' : '';
  }
  /** O que dizer quando não há lugar no topo. */
  function fullText(id) {
    const name = getDecor(id)?.name || 'Esta peça';
    if (sideSpot(id)) return `O topo deste bolo está cheio. ${name} também vai na lateral: toque na lateral do bolo.`;
    if (scene() && !sideCapable(id)) return `O topo deste bolo está cheio, e ${name} não gruda na lateral. Tire uma decoração (ou o bico do topo), ou escolha uma peça marcada com “topo ou lateral”.`;
    return 'O topo deste bolo está cheio. Tire uma decoração (ou o bico do topo) para abrir espaço.';
  }
  function notFit(why = '') {
    gesture('place', 'end', { id: armed, ok: false });
    fx.classList.remove('is-nofit');
    void fx.offsetWidth;
    fx.classList.add('is-nofit');
    if (why === 'cheio') return void host.flash(`Já são ${MAX_PLACED} peças à mão`);
    // "aqui não cabe" só ajuda se couber em outro lugar: com o topo cheio, a tela diz o que fazer
    const room = armed ? roomFor(armed) : 'topo';
    if (room === 'topo') return void host.flash('Aqui não cabe');
    host.flash(room === 'lateral' ? 'Topo cheio: use a lateral' : 'Sem lugar neste bolo');
    host.say(fullText(armed));
    renderBanner();
  }
  function place(hit) {
    const d = getDecor(armed);
    if (!d) return false;
    if (placed().length >= MAX_PLACED) return notFit('cheio'), false;
    const spot = settle(host.config(), { ...pieceAt(hit), rot: +(Math.random() * TAU).toFixed(2) });
    if (!spot) return notFit(), false;
    host.setPlaced([...placed(), spot]);
    gesture('place', 'end', { id: d.id, ok: true, n: placed().length });
    host.say(`${d.name}: peça colocada. ${placed().length} de ${MAX_PLACED} à mão.`);
    renderBanner();
    return true;
  }
  function removeAt(i) {
    const q = placed()[i];
    if (!q) return;
    host.setPlaced(placed().filter((_, k) => k !== i));
    host.say(`${getDecor(q.id)?.name || 'Peça'}: uma peça tirada. Ficaram ${placed().length} à mão.`);
  }
  function moveTo(i, hit) {
    const q = placed()[i];
    if (!q || !hit) return notFit();
    const spot = settle(without(i), { ...pieceAt(hit, q.id), rot: q.rot, scale: q.scale });
    if (!spot) return notFit();
    const next = placed().slice();
    next[i] = spot;
    host.setPlaced(next);
    gesture('place', 'end', { id: q.id, ok: true, moved: true });
    host.say(`${getDecor(q.id)?.name || 'Peça'} em outro lugar.`);
  }

  /** A prévia: com a cena, o anel 3D no lugar onde a peça assenta; sem ela, um anel desenhado por cima do bolo. */
  function showGhost(clientX, clientY, id, config) {
    ghostAt = { clientX, clientY, id, config };
    if (ghostRaf) return;
    ghostRaf = requestAnimationFrame(() => {
      ghostRaf = 0;
      const g = ghostAt;
      if (!g) return;
      const hit = pick(g.clientX, g.clientY);
      const sc = scene();
      const spot = hit ? settle(g.config, pieceAt(hit, g.id)) : null;
      if (sc && typeof sc.ghost === 'function' && (!hit || hit.real)) {
        try {
          if (!hit) sc.ghost(null);
          else {
            // o anel vai para onde a peça assenta de verdade (o lugar pedido, ou o livre mais próximo)
            const at = spot || pieceAt(hit, g.id);
            sc.ghost(at, { face: at.face, x: at.x, z: at.z, y: at.y ?? hit.y, tier: hit.tier });
          }
          ghost.classList.remove('is-on');
          return;
        } catch {
          // sem prévia 3D: usa o anel desenhado
        }
      }
      if (!hit) return void ghost.classList.remove('is-on');
      const at = spot || hit;
      const top = topOf();
      const y = at.face === 'lateral' ? (at.y ?? 0) : top ? top.y : 0;
      const c = project(at.x, y, at.z);
      const edge = project(at.x + 0.2, y, at.z);
      if (!c) return void ghost.classList.remove('is-on');
      const rad = Math.max(16, Math.min(40, edge ? Math.hypot(edge.x - c.x, edge.y - c.y) : 22));
      ghost.style.transform = `translate3d(${Math.round(c.x - rad)}px, ${Math.round(c.y - rad)}px, 0)`;
      ghost.style.width = ghost.style.height = `${Math.round(rad * 2)}px`;
      ghost.classList.toggle('is-no', !spot);
      ghost.classList.add('is-on');
    });
  }
  function hideGhost() {
    ghostAt = null;
    ghost.classList.remove('is-on');
    const sc = scene();
    if (sc && typeof sc.ghost === 'function') {
      try {
        sc.ghost(null);
      } catch {
        // nada a esconder
      }
    }
  }

  function onDown(ev) {
    if (ev.target !== host.canvas || press) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    tap = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, t: performance.now() };
    if (spreading) return void spreadDown(ev);
    if (!placing()) return;
    let hit = pick(ev.clientX, ev.clientY);
    if (hit && hit.rim > 1.1) hit = null; // um dedo de folga além da borda; mais longe que isso é fora do bolo
    const on = hit ? hitPlaced(hit) : -1;
    if (!hit || (!armed && on < 0)) return; // fora do bolo, ou nada na mão: o toque gira o bolo, como sempre
    ev.stopPropagation(); // este toque é da peça: o bolo não gira
    press = { id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, on, moved: false };
    try {
      host.canvas.setPointerCapture(ev.pointerId);
    } catch {
      // sem captura: vale enquanto o dedo estiver no bolo
    }
    gesture('place', 'start', { id: on >= 0 ? placed()[on].id : armed });
    showGhost(ev.clientX, ev.clientY, on >= 0 ? placed()[on].id : armed, on >= 0 ? without(on) : host.config());
  }
  function onMove(ev) {
    if (spreading && spreading.drag && ev.pointerId === spreading.drag.id) return void spreadMove(ev);
    if (press && ev.pointerId === press.id) {
      ev.stopPropagation();
      if (!press.moved && Math.hypot(ev.clientX - press.x0, ev.clientY - press.y0) > 8) press.moved = true;
      showGhost(ev.clientX, ev.clientY, press.on >= 0 ? placed()[press.on]?.id : armed, press.on >= 0 ? without(press.on) : host.config());
      return;
    }
    // com mouse, a prévia acompanha o cursor mesmo sem apertar
    if (armed && ev.pointerType === 'mouse' && ev.target === host.canvas && placing()) showGhost(ev.clientX, ev.clientY, armed, host.config());
  }
  function onUp(ev) {
    if (spreading && spreading.drag && ev.pointerId === spreading.drag.id) return void spreadUp(ev);
    if (press && ev.pointerId === press.id) {
      ev.stopPropagation();
      const p = press;
      press = null;
      tap = null;
      if (ev.pointerType !== 'mouse') hideGhost();
      if (ev.type === 'pointercancel') return;
      const hit = pick(ev.clientX, ev.clientY);
      if (p.on >= 0 && !p.moved) removeAt(p.on);
      else if (p.on >= 0) moveTo(p.on, hit);
      else if (hit) place(hit);
      else notFit();
      return;
    }
    // um toque simples no bolo (sem arrastar): na etapa Cobertura, pinga a calda na borda
    const t = tap;
    tap = null;
    if (!t || ev.type === 'pointercancel' || ev.pointerId !== t.id || ev.target !== host.canvas) return;
    if (Math.hypot(ev.clientX - t.x, ev.clientY - t.y) > 8 || performance.now() - t.t > 450) return;
    if (atelie() && step() === 'cobertura') dripTap(ev.clientX, ev.clientY);
  }
  let tap = null;
  const onLeave = (ev) => ev.target === host.canvas && !press && hideGhost();
  const onKey = (ev) => {
    // no bolo, com uma peça na mão: Enter coloca onde couber
    if (ev.target === host.canvas && armed && ev.key === 'Enter') {
      ev.preventDefault();
      auto();
    }
  };
  // na fase de captura, no palco: decide antes do motor se o toque é da peça ou do giro
  host.stage.addEventListener('pointerdown', onDown, true);
  host.stage.addEventListener('pointermove', onMove, true);
  host.stage.addEventListener('pointerup', onUp, true);
  host.stage.addEventListener('pointercancel', onUp, true);
  host.stage.addEventListener('pointerout', onLeave, true);
  host.stage.addEventListener('keydown', onKey, true);

  /* O aviso de "peça na mão" é um controle da faixa de avisos do palco (./notices.js): fica enquanto a peça estiver
     na mão, com a saída "Pronto". */
  function renderBanner() {
    const d = armed ? getDecor(armed) : null;
    if (!d || step() !== 'decoracao') {
      banner?.close();
      banner = null;
      syncLane();
      return;
    }
    const room = placed().length >= MAX_PLACED ? 'limite' : roomFor(d.id);
    const text =
      room === 'topo'
        ? html`Toque no bolo para colocar <strong>${d.name}</strong>`
        : room === 'lateral'
          ? html`Topo cheio: toque na <strong>lateral</strong> para colocar ${d.name}`
          : room === 'limite'
            ? `Já são ${MAX_PLACED} peças à mão: tire uma para trocar`
            : 'Sem lugar livre: tire uma decoração para abrir espaço';
    if (!banner) {
      banner = notes.control({ className: 'at-banner', label: 'Peça na mão', text: html`<span class="at-banner__text">${text}</span>`, actions: [{ label: 'Pronto', className: 'at-banner__btn', attr: 'data-act="place-done"' }] });
      syncLane();
      return;
    }
    banner.set({ text: html`<span class="at-banner__text">${text}</span>` });
  }
  function arm(id) {
    const next = id && getDecor(id)?.unit ? id : null;
    const was = armed;
    armed = next;
    renderBanner();
    host.cz.classList.toggle('is-placing', Boolean(armed));
    if (armed && !was) {
      host.closeCut();
      host.spinOn(false);
      // sem a cena, só o topo vale: de cima é mais fácil acertar. Com ela, a vista da etapa mostra topo e lateral.
      if (!scene()) host.setView('above');
    } else if (!armed && was) {
      hideGhost();
      host.spinOn(true);
      host.setView();
    }
    if (!armed) return;
    const room = roomFor(armed);
    const name = getDecor(armed).name;
    if (room === 'topo') host.say(`${name} na mão: toque no bolo para colocar${sideCapable(armed) ? ', no topo ou na lateral' : ''}, ou use o botão Colocar onde couber.`);
    else host.say(fullText(armed));
  }
  /** Saída por botão: põe a peça no primeiro lugar livre, do centro para a borda. */
  function auto() {
    const d = getDecor(armed);
    if (!d) return;
    if (placed().length >= MAX_PLACED) return void notFit('cheio');
    gesture('place', 'start', { id: d.id });
    const piece = findSpot(d.id);
    if (!piece) return void notFit();
    host.setPlaced([...placed(), piece]);
    gesture('place', 'end', { id: d.id, ok: true, n: placed().length });
    host.say(`${d.name}: peça colocada. ${placed().length} de ${MAX_PLACED} à mão.`);
  }
  function removeOne(id) {
    const list = placed();
    for (let i = list.length - 1; i >= 0; i--) if (list[i].id === id) return void removeAt(i);
  }
  function clear() {
    if (!placed().length) return;
    host.setPlaced([]);
    host.say('Todas as peças colocadas à mão foram tiradas.');
  }

  /** Há um controle de gesto na faixa de baixo do palco? */
  function syncLane() {
    host.cz.classList.toggle('has-lane', Boolean(banner || spreading));
  }

  /* ───────── ferramenta da etapa (velas): um botão a mais na coluna de ferramentas do palco ───────── */
  function setChip(node) {
    chip?.destroy?.();
    chip?.remove();
    chip = node || null;
    if (chip) host.toolSlot.append(chip);
  }

  /* ───────── pingar a calda (tocar na borda) ───────── */
  function dripTap(clientX, clientY) {
    const c = host.config();
    if (c.shape === 'vulcao' || armed) return;
    const hit = pick(clientX, clientY);
    if (!hit || !onRim(hit)) return;
    gesture('drip', 'start');
    if (!c.drip.on) {
      host.setDrip({ on: true });
      gesture('drip', 'end', { on: true, amount: c.drip.amount });
      host.flash(`Calda escorrendo · + ${brl(DRIP_PRICE)}`);
      return;
    }
    // já com calda: a gota mais próxima do dedo escorre de novo (a cena faz e marca o som); a quantidade fica no painel
    const sc = scene();
    const dripped = Boolean(sc && typeof sc.dripAt === 'function' && hit.real && sc.dripAt(hit));
    gesture('drip', 'end', { on: true, amount: c.drip.amount, again: true, silent: dripped });
  }

  /* ───────── velas: acender e soprar (só com a cena nova) ───────── */
  function candleChip() {
    const cd = scene()?.candles;
    const has = host.config().decor.items.includes('velas');
    if (!cd || !has || !atelie() || step() !== 'decoracao') return false;
    if (!(cd.count > 0)) {
      // as velas ainda estão chegando ao bolo (as peças são montadas aos poucos): confere de novo daqui a pouco
      if (candleTries++ < 8) later(sync, 600);
      return false;
    }
    candleTries = 0;
    if (cd.lit) {
      const btn = blowButton({
        label: 'Segure para soprar as velas',
        reduceMotion: host.reduceMotion,
        onStart: () => gesture('blow', 'start'),
        onBlow: (k) => {
          Promise.resolve(cd.blow?.(k))
            .then((res) => {
              const left = res && typeof res === 'object' ? res.left : cd.lit ? 1 : 0;
              gesture('blow', 'end', { strength: +k.toFixed(2), left, cued: true });
              host.say(left ? `Quase: ${left === 1 ? 'ficou uma vela acesa' : `ficaram ${left} velas acesas`}. Sopre de novo.` : 'Velas apagadas.');
            })
            .catch(() => {})
            .finally(() => later(sync, 250));
        },
      });
      btn.classList.add('at-blow--chip', 'cz-tool');
      btn.title = 'Segure para soprar as velas';
      const fresh = !chip || !chip.classList.contains('at-blow--chip');
      setChip(btn);
      // na primeira vez que o botão aparece na etapa, um recado diz o que ele faz
      if (fresh && !blowTold) {
        blowTold = true;
        later(() => {
          if (!chip?.classList.contains('at-blow--chip')) return;
          // em palco baixo o botão das velas mora na folha "Ateliê" (não coube na coluna)
          const tucked = String(host.cz.dataset.collapsed || '').includes('tool');
          notes.flash(tucked ? 'Para soprar as velas, abra o menu “…” do palco' : 'Para soprar as velas, segure o botão à direita', { ms: 3600 });
        }, 900);
      }
    } else {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'at-note at-note--btn cz-tool';
      el.title = 'Acender as velas';
      el.setAttribute('aria-label', 'Acender as velas');
      el.innerHTML = String(html`${ICON.flame}<span class="sr-only">Acender as velas</span>`);
      el.addEventListener('click', () => {
        el.disabled = true;
        gesture('light', 'start');
        Promise.resolve(cd.light?.())
          .catch(() => {})
          .finally(() => {
            gesture('light', 'end', { cued: true });
            host.say('Velas acesas. Segure o botão para soprar.');
            later(sync, 200);
          });
      });
      setChip(el);
    }
    return true;
  }

  /* ───────── girar o prato para espalhar a cobertura ───────── */
  function spreadBegin() {
    const sp = scene()?.spread;
    if (!sp || typeof sp.begin !== 'function' || spreading) return false;
    let run = null;
    try {
      run = sp.begin('cover');
    } catch {
      return false;
    }
    const at = () => (typeof run.progress === 'function' ? run.progress() : Number(run.progress) || 0);
    if (!run || at() >= 1) return false; // a cena não começou (sem bolo, desligada): nada a girar
    spreading = { sp, run, el: null, note: null, drag: null, said: 0, raf: 0 };
    const mine = spreading;
    // o controle do prato: um aviso da faixa do palco, com a saída por botão e o quanto já foi alisado
    mine.note = notes.control({
      className: 'at-spread',
      label: 'Girar o prato',
      icon: ICON.turn,
      title: 'Gire o prato',
      bar: true,
      barClass: 'at-spread__ring',
      actions: [
        {
          label: 'Alisar para mim',
          className: 'at-spread__btn',
          // saída por botão: a cobertura termina sozinha, de uma vez
          onClick: () => {
            for (let i = 0; i < 12 && spreading === mine; i++) sp.feed?.(0.6);
          },
        },
      ],
    });
    mine.el = mine.note.el;
    const bar = mine.el.querySelector('.at-spread__ring i');
    const done = () => spreading === mine && spreadEnd(true);
    Promise.resolve(run.done).then(done, done);
    const tick = () => {
      if (spreading !== mine) return;
      bar.style.transform = `scaleX(${Math.max(0.04, Math.min(1, at()))})`;
      mine.raf = requestAnimationFrame(tick);
    };
    mine.raf = requestAnimationFrame(tick);
    syncLane();
    gesture('spread', 'start', { cued: true });
    host.say('Gire o prato com o dedo para alisar a cobertura, use as setas do teclado ou o botão Alisar para mim. Se preferir, ela termina sozinha.');
    return true;
  }
  const angleOf = (ev) => {
    const r = host.canvas.getBoundingClientRect();
    // o centro do prato na tela: a tela 3D começa no alto do palco (por baixo do cabeçalho), o bolo fica um pouco abaixo do meio
    return Math.atan2(ev.clientY - (r.top + r.height * 0.6), ev.clientX - (r.left + r.width / 2));
  };
  function spreadDown(ev) {
    ev.stopPropagation();
    spreading.drag = { id: ev.pointerId, a: angleOf(ev) };
    try {
      host.canvas.setPointerCapture(ev.pointerId);
    } catch {
      // segue sem captura
    }
  }
  function spreadFeed(delta) {
    if (!spreading) return;
    try {
      spreading.sp.feed?.(delta);
    } catch {
      // a cena já terminou
    }
    const now = performance.now();
    if (now - spreading.said > 220) {
      spreading.said = now;
      gesture('spread', 'move', { cued: true, turn: +Math.abs(delta).toFixed(3) });
    }
  }
  function spreadMove(ev) {
    ev.stopPropagation();
    const a = angleOf(ev);
    let d = a - spreading.drag.a;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    spreading.drag.a = a;
    spreadFeed(d);
  }
  function spreadUp(ev) {
    ev.stopPropagation();
    if (spreading) spreading.drag = null;
  }
  function spreadEnd(finished) {
    const s = spreading;
    if (!s) return;
    spreading = null;
    cancelAnimationFrame(s.raf);
    if (!finished) {
      try {
        s.sp.cancel?.();
      } catch {
        // já terminou
      }
    }
    s.note?.close();
    syncLane();
    gesture('spread', 'end', { cued: true, finished: Boolean(finished) });
  }
  const onSpreadKey = (ev) => {
    if (!spreading || (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight')) return;
    ev.preventDefault();
    ev.stopPropagation();
    spreadFeed(ev.key === 'ArrowLeft' ? -0.35 : 0.35);
  };
  host.stage.addEventListener('keydown', onSpreadKey, true);

  /** Uma escolha mudou (barramento): cobertura nova pede o prato girando. */
  function changed(detail) {
    if (!detail || (detail.by || 'user') !== 'user' || !atelie() || step() !== 'cobertura') return;
    if (String(detail.key || '') !== 'cover.type') return;
    // dois quadros depois: a cena já recebeu a cobertura nova
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (step() !== 'cobertura' || !atelie()) return;
        if (scene()) return void spreadBegin(); // com a cena: o topo se espalha e a lateral segue o dedo
        if (host.reduceMotion || host.cutaway()) return;
        // sem a cena: o bolo dá uma volta para mostrar a cobertura (o som de espátula vem do barramento)
        gesture('spin', 'start', 'auto');
        host.cake()?.spin?.({ turns: 1, dur: 1.6 });
        later(() => gesture('spin', 'end', 'auto'), 1600);
      }),
    );
  }

  /** Acerta o que aparece no palco para a etapa e o modo de agora. */
  function sync() {
    if (step() !== 'decoracao' && armed) host.disarm();
    if (step() !== 'cobertura' && spreading) spreadEnd(false);
    renderBanner();
    host.cz.classList.toggle('is-placing', Boolean(armed) && step() === 'decoracao');
    if (!candleChip() && chip) setChip(null); // nada a oferecer agora: o botão das velas sai do palco
    if (spreading) return;
    const c = host.config();
    if (atelie() && step() === 'cobertura' && !dripHinted && c.shape !== 'vulcao' && !c.drip.on && host.cake() && !host.cz.classList.contains('is-flat')) {
      dripHinted = true;
      // um pouco depois de chegar à etapa (a Bô costuma abrir a etapa com uma fala)
      later(() => hint('Dica de confeiteira: toque na borda do bolo para pingar a calda.', () => step() === 'cobertura' && !host.config().drip.on), 4200);
    }
  }

  return {
    arm,
    auto,
    removeOne,
    clear,
    sync,
    changed,
    /** Esc / voltar: solta a peça ou cancela o prato. → true se havia o que fechar. */
    back() {
      if (spreading) return spreadEnd(false), true;
      if (armed) return host.disarm(), true;
      return false;
    },
    get armed() {
      return armed;
    },
    /** Com a cena carregada: as peças avulsas que também grudam na lateral (para a etiqueta do painel). */
    sideIds() {
      const out = new Set();
      if (!scene()) return out;
      for (const d of DECORS) if (d.unit > 0 && sideCapable(d.id)) out.add(d.id);
      return out;
    },
    /** Para testes: o ponto do bolo sob um ponto da tela, e o contrário. */
    debug: { pick, project, topOf },
    destroy() {
      cancelAnimationFrame(ghostRaf);
      if (spreading) spreadEnd(false);
      host.stage.removeEventListener('pointerdown', onDown, true);
      host.stage.removeEventListener('pointermove', onMove, true);
      host.stage.removeEventListener('pointerup', onUp, true);
      host.stage.removeEventListener('pointercancel', onUp, true);
      host.stage.removeEventListener('pointerout', onLeave, true);
      host.stage.removeEventListener('keydown', onKey, true);
      host.stage.removeEventListener('keydown', onSpreadKey, true);
      setChip(null);
      banner?.close();
      banner = null;
      syncLane();
      ghost.remove();
    },
  };
}
