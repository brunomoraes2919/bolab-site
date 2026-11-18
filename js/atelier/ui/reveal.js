// BOLAB — Ateliê: a revelação do bolo (etapa Resumo) e o vídeo.
//
//   startReveal(host, { scene, later, haptics, onClose }) → { close() }
//     luz baixa → o bolo dá uma volta → (se tiver velas) acendem, "faça um pedido e sopre" → confete e aplauso →
//     "Ver o cartão do bolo". Dá para pular a qualquer momento (botão, Esc, "voltar" do Android).
//     Avisa o barramento: bus.emit('reveal', { phase: 'start' | 'candles' | 'blown' | 'end', config }).
//     Com a cena carregada (scene() devolve cake.atelier): cenário 'festa', reveal({ seconds, turns, hold: true })
//     baixa as luzes e gira, candles.light() / blow(força) → { out, left } (sobrou vela acesa: sopra de novo),
//     play('celebrate') solta o confete e reveal({ off: true }) acende tudo. O som vem das marcas da cena.
//     Sem a cena: playIntro() + spin() do motor, o confete da loja e as marcas de som emitidas daqui
//     (o motor sozinho não apaga as chamas: o sopro acontece em som, luz e festa).
//
//   canRecord(host, scene) → boolean      recordVideo(host, { scene, later }) → Promise
//     Com a cena nova: capture.video() + replay() (a montagem inteira). Sem ela: 5 s do bolo girando, gravados
//     pelo próprio navegador (MediaRecorder), com o fundo do palco e o nome do bolo.
import { html, raw, openDialog, toast } from '../../ui.js';
import { resolveBackdrop, getBackdrop, paintBackdrop } from '../../customizer/backdrop.js';
import { blowButton } from './hands.js';

const svg = (body) => raw(`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`);
const ICON = {
  card: svg('<rect x="4" y="3" width="16" height="18" rx="3"/><circle cx="12" cy="10" r="3"/><path d="M8 17h8"/>'),
  download: svg('<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/>'),
  share: svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.600 13.500 6.800 4M15.400 6.500l-6.800 4"/>'),
};

export function startReveal(host, { scene, later, haptics, onClose }) {
  const { bus } = host;
  const sc = scene(); // a cena carregada, ou null (reserva)
  const config = host.publicConfig();
  const hasCandles = sc?.candles ? sc.candles.count > 0 : config.decor.items.includes('velas');
  const timers = new Set();
  let closed = false;
  let phase = 'start';
  let blow = null;
  const wait = (fn, ms) => {
    const t = later(() => {
      timers.delete(t);
      if (!closed) fn();
    }, ms);
    timers.add(t);
  };
  const cue = (name, at = 0, extra = {}) => bus.emit('cue', { name, at, ...extra });
  const tell = (p) => {
    phase = p;
    bus.emit('reveal', { phase: p, config });
  };
  const safe = (fn) => {
    try {
      return fn();
    } catch (err) {
      console.error('[atelie] revelação: a cena recusou um passo', err);
      return undefined;
    }
  };

  const el = document.createElement('div');
  el.className = 'at-reveal';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Revelação do bolo');
  el.tabIndex = -1;
  el.innerHTML = String(html`
    <div class="at-reveal__panel">
      <p class="at-reveal__name">${host.name()}</p>
      <h2 class="at-reveal__title" data-title aria-live="polite">Luzes baixas…</h2>
      <p class="at-reveal__sub" data-sub></p>
      <div class="at-reveal__slot" data-slot></div>
      <button type="button" class="at-reveal__skip" data-skip>Pular</button>
    </div>
  `);
  const $ = (s) => el.querySelector(s);
  const setTitle = (title, sub = '') => {
    $('[data-title]').textContent = title;
    $('[data-sub]').textContent = sub;
  };
  const opener = document.activeElement;
  // a luz baixa fica sobre o palco; o texto e os botões tomam o lugar do painel de opções (o bolo segue à vista
  // e dá para girar com o dedo)
  const shade = document.createElement('div');
  shade.className = 'at-reveal__shade';
  shade.setAttribute('aria-hidden', 'true');
  host.stage.append(shade);
  const panel = host.root.querySelector('.cz-panel');
  // o resto da tela sai do caminho do teclado e do leitor de tela enquanto a revelação está aberta
  const hidden = [...panel.children, ...host.stage.querySelectorAll('.cz-top, .cz-tools, .at-hud'), host.layer].filter((n) => n && !n.hasAttribute('inert'));
  hidden.forEach((n) => n.setAttribute('inert', ''));
  panel.append(el);
  void shade.offsetWidth;
  host.cz.classList.add('is-revealing');
  el.focus({ preventScroll: true });

  let lightsOn = !sc; // com a cena, as luzes baixam em reveal({ hold }) e voltam em reveal({ off })
  function lightsUp() {
    if (lightsOn) return;
    lightsOn = true;
    safe(() => sc.reveal({ off: true }));
  }
  function celebrate() {
    if (closed || phase === 'end') return;
    blow?.destroy();
    blow = null;
    host.cz.classList.add('is-party');
    if (sc) {
      lightsUp();
      safe(() => sc.play('celebrate'));
    } else {
      host.celebrate();
      cue('confetti', 0);
      cue('tada', 0.05);
      cue('applause', 0.35);
    }
    haptics()?.play('tada');
    tell('end');
    setTitle('Ficou lindo!', 'Guarde este momento ou mostre para alguém.');
    const slot = $('[data-slot]');
    slot.innerHTML = String(html`
      <button type="button" class="btn at-reveal__go" data-card>${ICON.card} Ver o cartão do bolo</button>
      <button type="button" class="at-reveal__back" data-close>Voltar ao resumo</button>
    `);
    $('[data-skip]').hidden = true;
    slot.querySelector('[data-card]').focus({ preventScroll: true });
  }

  function candles() {
    if (closed || phase !== 'start') return;
    tell('candles');
    const cd = sc?.candles || null;
    bus.emit('gesture', { id: 'light', phase: 'start' });
    const lit = cd && !cd.lit ? safe(() => cd.light()) : null;
    Promise.resolve(lit)
      .catch(() => {})
      .finally(() => !closed && bus.emit('gesture', { id: 'light', phase: 'end', value: { cued: Boolean(cd) } }));
    setTitle('Faça um pedido', 'E sopre as velas.');
    blow = blowButton({
      label: 'Segure para soprar',
      reduceMotion: host.reduceMotion,
      onStart: () => bus.emit('gesture', { id: 'blow', phase: 'start' }),
      onBlow(strength) {
        if (closed || phase !== 'candles') return;
        const out = cd ? safe(() => cd.blow(strength)) : null;
        host.cz.classList.add('is-blown');
        Promise.resolve(out)
          .catch(() => null)
          .then((res) => {
            if (closed || phase !== 'candles') return;
            // com a cena, um sopro fraco deixa vela acesa: a pessoa sopra de novo
            const left = cd ? (res && typeof res === 'object' ? Number(res.left) || 0 : cd.lit ? 1 : 0) : 0;
            bus.emit('gesture', { id: 'blow', phase: 'end', value: { strength: +strength.toFixed(2), left, cued: Boolean(cd) } });
            if (left > 0) {
              host.cz.classList.remove('is-blown');
              setTitle('Quase!', left === 1 ? 'Ficou uma vela acesa. Sopre de novo.' : `Ficaram ${left} velas acesas. Sopre de novo.`);
              return;
            }
            tell('blown');
            wait(celebrate, cd ? 700 : 450);
          });
      },
    });
    $('[data-slot]').append(blow);
    blow.focus({ preventScroll: true });
  }

  function close() {
    if (closed) return;
    closed = true;
    timers.forEach(clearTimeout);
    blow?.destroy();
    if (sc) {
      safe(() => sc.skip());
      lightsUp();
    }
    if (phase !== 'end') bus.emit('reveal', { phase: 'end', config, skipped: true });
    hidden.forEach((n) => n.removeAttribute('inert'));
    host.cz.classList.remove('is-revealing', 'is-blown', 'is-party', 'has-scene');
    el.remove();
    shade.remove();
    host.spinOn(true);
    onClose?.();
    const back = host.root.querySelector('[data-act="reveal-cake"]') || opener;
    back?.focus?.({ preventScroll: true });
  }

  el.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-skip]')) {
      // pular leva direto para o final (a festa continua valendo)
      timers.forEach(clearTimeout);
      timers.clear();
      if (sc) safe(() => sc.skip());
      celebrate();
    } else if (ev.target.closest('[data-close]')) close();
    else if (ev.target.closest('[data-card]')) {
      close();
      host.card();
    }
  });
  el.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      close();
      return;
    }
    if (ev.key !== 'Tab') return;
    // o foco fica dentro da revelação
    const stops = [...el.querySelectorAll('button')].filter((b) => !b.hidden && !b.disabled);
    if (!stops.length) return;
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (ev.shiftKey && (document.activeElement === first || document.activeElement === el)) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  });

  /* ── a sequência ── */
  tell('start');
  host.closeCut();
  host.spinOn(false);
  host.setView();
  if (sc) {
    host.cz.classList.add('has-scene'); // a cena baixa as luzes de verdade: o escurecido da tela fica mais leve
    safe(() => sc.setScene('festa'));
  }
  const slow = host.reduceMotion ? 0.35 : 1;
  wait(() => {
    setTitle(host.name().length > 26 ? 'Aí está ele' : 'Aí está o seu bolo');
    let turn = null;
    if (sc) turn = safe(() => sc.reveal({ seconds: 3.4, turns: 1, hold: true }));
    else {
      cue('whoosh', 0);
      const cake = host.cake();
      safe(() => cake?.playIntro?.());
      safe(() => cake?.spin?.({ turns: 1, dur: 2.6 }));
      cue('sparkle', 1.6);
    }
    const next = () => (hasCandles ? candles() : celebrate());
    // com a cena, espera a volta dela (com um teto); sem ela, o tempo da volta do motor
    let went = false;
    const go = () => {
      if (went) return;
      went = true;
      next();
    };
    if (turn && typeof turn.then === 'function') turn.then(go, go);
    wait(go, turn ? 5200 : 2800 * slow);
  }, 550 * slow);

  return { close };
}

/* ───────── vídeo ───────── */

const MIMES = ['video/mp4;codecs=avc1.42E01E', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
const pickMime = () => MIMES.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';

/** Grava 0,4 s de um quadradinho: o formato que o navegador diz aceitar grava mesmo? (há aparelhos em que o MP4 sai vazio) */
function probeMime(mime) {
  return new Promise((resolve) => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    let n = 0;
    const paint = setInterval(() => {
      g.fillStyle = n++ % 2 ? '#d12d58' : '#ffe7ec';
      g.fillRect(0, 0, 64, 64);
    }, 30);
    let size = 0;
    const done = (ok) => {
      clearInterval(paint);
      resolve(ok);
    };
    try {
      const rec = new MediaRecorder(c.captureStream(30), { mimeType: mime });
      rec.ondataavailable = (ev) => (size += ev.data?.size || 0);
      rec.onerror = () => done(false);
      rec.onstop = () => done(size > 0);
      rec.start();
      setTimeout(() => rec.state !== 'inactive' && rec.stop(), 400);
      setTimeout(() => done(size > 0), 2500);
    } catch {
      done(false);
    }
  });
}
let goodMime = null; // conferido uma vez por visita
async function workingMime() {
  if (goodMime != null) return goodMime;
  for (const mime of MIMES) {
    if (window.MediaRecorder?.isTypeSupported?.(mime) && (await probeMime(mime))) return (goodMime = mime);
  }
  return (goodMime = '');
}

export function canRecord(host, sc) {
  if (host.reduceMotion || !host.cake() || typeof window.MediaRecorder !== 'function') return false;
  if (sc?.capture?.supported) return true;
  return typeof HTMLCanvasElement.prototype.captureStream === 'function' && Boolean(pickMime());
}

/** Sem a cena nova: grava o bolo dando uma volta (um quadro por desenho do motor, sobre o fundo do palco). */
function recordSpin(host, later, mime) {
  return new Promise((resolve) => {
    if (!mime) return void resolve(null);
    const cake = host.cake();
    const src = host.canvas;
    const W = 720;
    const H = 900;
    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const g = out.getContext('2d');
    const config = host.config();
    const backdrop = resolveBackdrop(config) || getBackdrop('rosa');
    const face = getComputedStyle(document.documentElement).getPropertyValue('--font-body').trim() || 'system-ui, sans-serif';
    const name = host.name();
    const draw = () => {
      paintBackdrop(g, W, H, backdrop);
      // o bolo ocupa a largura; a tela 3D costuma ser mais larga do que alta
      const k = Math.min(W / src.width, (H * 0.74) / src.height) * (src.width > src.height * 1.3 ? 1.5 : 1);
      const w = src.width * k;
      const h = src.height * k;
      try {
        g.drawImage(src, (W - w) / 2, (H - h) / 2 - 30, w, h);
      } catch {
        // contexto perdido no meio da gravação: o quadro fica só com o fundo
      }
      g.textAlign = 'center';
      g.fillStyle = backdrop.ink;
      g.font = `700 34px ${face}`;
      g.fillText(name.length > 34 ? `${name.slice(0, 33)}…` : name, W / 2, H - 78);
      g.fillStyle = backdrop.ink2;
      g.font = `600 20px ${face}`;
      g.fillText('feito no ateliê 3D da BOLAB', W / 2, H - 44);
    };
    let rec;
    const chunks = [];
    try {
      rec = new MediaRecorder(out.captureStream(30), { mimeType: mime, videoBitsPerSecond: 2_400_000 });
      rec.ondataavailable = (ev) => ev.data && ev.data.size && chunks.push(ev.data);
      rec.onstop = () => {
        off();
        resolve(chunks.length ? new Blob(chunks, { type: (rec.mimeType || mime).split(';')[0] }) : null);
      };
      rec.onerror = () => {
        off();
        resolve(null);
      };
    } catch {
      resolve(null);
      return;
    }
    const off = host.onFrame(draw);
    draw();
    rec.start();
    host.closeCut();
    host.spinOn(false);
    host.setView();
    later(() => {
      cake.playIntro?.();
      cake.spin?.({ turns: 1, dur: 4.2 });
    }, 250);
    later(() => {
      host.spinOn(true);
      if (rec.state !== 'inactive') rec.stop();
    }, 5200);
  });
}

export async function recordVideo(host, { scene, later }) {
  const sc = scene();
  host.cz.classList.add('is-recording');
  host.say(sc ? 'Gravando o vídeo da montagem do bolo. Leva uns dez segundos.' : 'Gravando o vídeo do bolo. Leva uns cinco segundos.');
  const note = document.createElement('p');
  note.className = 'at-rec';
  note.innerHTML = String(html`<i aria-hidden="true"></i><span>Gravando…</span>`);
  host.fx.append(note);
  let blob = null;
  try {
    if (sc?.capture?.supported && typeof sc.capture.video === 'function') {
      // com a cena: o vídeo é a montagem (o bolo refeito do prato vazio até a decoração), gravada por ela
      host.closeCut();
      host.spinOn(false);
      blob = await sc.capture.video({ seconds: 10, fps: 30, width: 720, replay: true });
      host.spinOn(true);
    }
    if (!blob) blob = await recordSpin(host, later, await workingMime());
  } finally {
    note.remove();
    host.cz.classList.remove('is-recording');
  }
  if (!blob) {
    toast('Não deu para gravar o vídeo neste aparelho.');
    return;
  }
  host.bus.emit('photo', { kind: 'video' });
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
  const url = URL.createObjectURL(blob);
  const file = new File([blob], `meu-bolo-bolab.${ext}`, { type: blob.type });
  const canShare = Boolean(navigator.canShare?.({ files: [file] }));
  const dlg = openDialog({
    title: 'O vídeo do seu bolo',
    body: html`<div class="at-video">
      <video src="${url}" controls loop muted playsinline autoplay aria-label="Vídeo do bolo ${host.name()}"></video>
      <p class="muted">Para guardar ou mandar para alguém.</p>
    </div>`,
    footer: html`
      <a class="btn btn--secondary cz-fit" download="meu-bolo-bolab.${ext}" data-do="download">${ICON.download} Baixar vídeo</a>
      ${canShare ? html`<button type="button" class="btn cz-fit" data-do="share">${ICON.share} Compartilhar</button>` : ''}
    `,
    onClose: () => URL.revokeObjectURL(url),
  });
  // endereço gerado na hora (blob:): entra direto no elemento, fora do html`` (que só aceita endereços da loja em href)
  dlg.el.querySelector('[data-do="download"]').href = url;
  dlg.el.addEventListener('click', async (ev) => {
    if (!ev.target.closest('[data-do="share"]')) return;
    try {
      await navigator.share({ files: [file], title: host.name(), text: 'Olha o bolo que eu montei na BOLAB!' });
    } catch {
      // a pessoa fechou a janela de compartilhar
    }
  });
}
