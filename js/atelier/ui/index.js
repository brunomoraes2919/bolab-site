// BOLAB — Ateliê: a camada de imersão da tela do personalizador (frente Tela).
//
// A tela (js/views/customizer.js) busca este módulo depois do primeiro quadro do bolo e entrega um `host`
// (o que ele pode ler e pedir). Aqui se ligam, sob demanda e cada um por si:
//
//   som        js/atelier/audio.js + audio-ui.js + haptics.js   → ligados ao barramento; trilha por etapa
//   a Bô       js/atelier/bo/index.js                           → assistente (regras + voz gravada), sugere e a tela aplica
//   gestos     ./hands.js                                       → colocar peça com o dedo, pingar calda, velas, girar o prato
//   revelação  ./reveal.js (só quando a pessoa pede)            → luz baixa, giro, velas, confete, cartão, vídeo
//   jogo       js/atelier/game/index.js (se existir)            → encomendas e figurinhas
//
// Modo `atelie` liga tudo; modo `rapido` desliga som, Bô, cena e convites — a compra segue igual nos dois.
// Tudo o que depende da cena nova (`cake.atelier`, frente Cena) é conferido antes de usar: sem ela, vale o
// motor de hoje (spin, setView, playIntro, confete da loja).
//
//   const atelier = mountAtelier(host)
//   atelier.setMode('rapido') · atelier.step(id, prev) · atelier.interact() · atelier.back() → true se fechou algo
//   atelier.hands.{arm, auto, removeOne, clear} · atelier.reveal() · atelier.video() · atelier.game() · atelier.destroy()
import { html, raw } from '../../ui.js';
import { createHands } from './hands.js';

const svg = (body) => raw(`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`);
const ICON = {
  sound: svg('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>'),
  swipe: svg('<polyline points="18 8 22 12 18 16"/><polyline points="6 8 2 12 6 16"/><line x1="2" x2="22" y1="12" y2="12"/>'),
  chat: svg('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>'),
  bolt: svg('<path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12Z"/>'),
  ticket: svg('<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 11v2M13 17v2"/>'),
};

/** As três dicas da primeira visita (no máximo três, puláveis). `spot` = o que pisca enquanto a dica está na tela. */
const TIPS = [
  { icon: 'swipe', text: 'Arraste o bolo para girar e ver de todos os lados.', spot: null },
  { icon: 'chat', text: 'A Bô é a assistente do ateliê: ela comenta as suas escolhas. Toque nela para pedir um palpite.', spot: '.bo-avatar' },
  // r5-qa: a terceira dica convida para o jogo (antes só falava do modo rápido: ninguém ficava sabendo das encomendas
  // e das figurinhas, que são a parte de brincar). Sem o jogo na tela (`game: false`), vale o texto antigo.
  {
    icon: 'ticket',
    text: 'Quer brincar de confeiteiro? Em “jogo”, clientes fazem encomendas e você ganha figurinhas. Com pressa? “rápido” deixa só o que é preciso para pedir.',
    spot: '[data-at-game]',
    alt: { icon: 'bolt', text: 'Com pressa? O Modo rápido tira som e animações e deixa só o que é preciso para pedir.', spot: '[data-at-mode]' },
  },
];

// o jogo é procurado uma vez por visita à loja (se a pasta não existir, a busca falha uma vez só)
let gameModule = null;

/**
 * As folhas de estilo do controle de som e da Bô são pedidas por eles mesmos, na hora em que nascem — e por um
 * instante apareceriam sem estilo. Aqui a folha é pedida antes (com a mesma marca que cada um procura, para não
 * ser pedida duas vezes) e só depois de ela chegar o componente entra no palco.
 */
function styleReady(file, find, mark) {
  let link = find();
  if (!link) {
    link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL(`../../../css/${file}`, import.meta.url).href;
    mark(link);
    document.head.appendChild(link);
  }
  if (link.sheet) return Promise.resolve();
  return new Promise((resolve) => {
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', resolve, { once: true });
    setTimeout(resolve, 5000);
  });
}
const audioStyle = () =>
  styleReady(
    'atelier-audio.css',
    () => document.querySelector('link[data-atelier-audio]'),
    (link) => link.setAttribute('data-atelier-audio', ''),
  );
const boStyle = () =>
  styleReady(
    'atelier-bo.css',
    () => document.getElementById('bo-css'),
    (link) => (link.id = 'bo-css'),
  );

export function mountAtelier(host) {
  const { bus, prefs } = host;
  const offs = [];
  const timers = new Set();
  let alive = true;
  let audio = null;
  let haptics = null;
  let soundEl = null;
  let soundLoading = null;
  let offSound = null; // desliga som + vibração do barramento
  let bo = null;
  let boLoading = null;
  let game = null;
  let revealing = null; // a revelação em curso: { close() }
  let invite = null;
  let soundPending = false; // o convite saiu sem resposta nesta visita: o alto-falante ainda liga o som
  let tips = null; // { el, at }
  let spunAt = -1e9;
  let sceneOk = false; // a cena (cozinha + animações, js/atelier/stage) carregou: valem os gestos de verdade
  let sceneAsked = false;

  const later = (fn, ms) => {
    const t = setTimeout(() => {
      timers.delete(t);
      if (alive) fn();
    }, ms);
    timers.add(t);
    return t;
  };
  const scene = () => host.cake()?.atelier || null;
  const atelie = () => host.mode() === 'atelie';
  const call = (fn, ...args) => {
    try {
      return typeof fn === 'function' ? fn(...args) : undefined;
    } catch (err) {
      console.error('[atelie] a cena recusou um pedido:', err);
      return undefined;
    }
  };

  /* ───────── cena (js/atelier/stage, pelo motor: cake.atelier) ─────────
     scene() é a fachada do contrato (existe sempre que há 3D); live() só devolve a cena depois de carregada —
     é com ela que valem pick/ghost, velas, prato e revelação de verdade. Sem ela, cada gesto tem a sua reserva. */
  const live = () => (sceneOk ? scene() : null);
  const sceneFor = () => {
    const choice = host.sceneChoice();
    return choice !== 'auto' ? choice : host.step() === 'resumo' ? 'vitrine' : 'bancada';
  };
  function syncScene() {
    const sc = scene();
    if (!sc) return;
    if (!atelie()) {
      call(sc.skip?.bind(sc));
      call(sc.setEnabled?.bind(sc), false);
      return;
    }
    call(sc.setEnabled?.bind(sc), true);
    if (!revealing) call(sc.setScene?.bind(sc), sceneFor());
    if (sceneAsked) return;
    sceneAsked = true;
    // a cena é baixada pelo motor depois do primeiro quadro do bolo; os gestos esperam por ela
    Promise.resolve(sc.ready)
      .then((ok) => {
        if (!alive) return;
        sceneOk = Boolean(ok);
        hands.sync();
        import('./reveal.js')
          .then((m) => alive && host.video(m.canRecord(host, live())))
          .catch(() => {});
        if (sceneOk) later(() => host.sceneLive(true, hands.sideIds()), 500);
      })
      .catch(() => {});
  }
  {
    const sc = scene();
    if (sc && typeof sc.on === 'function') {
      // o motor não toca som: avisa quando o som deve acontecer, e a tela repassa ao barramento (o áudio toca)
      const offCue = call(sc.on.bind(sc), 'cue', (cue) => bus.emit('cue', cue));
      const offBusy = call(sc.on.bind(sc), 'busy', (busy) => host.cz.classList.toggle('is-busy', Boolean(busy)));
      [offCue, offBusy].forEach((off) => typeof off === 'function' && offs.push(off));
    }
  }

  function loadSound() {
    if (audio) return Promise.resolve(true);
    soundLoading ||= Promise.all([import('../audio.js'), import('../audio-ui.js'), import('../haptics.js'), audioStyle()])
      .then(([a, u, h]) => {
        if (!alive) return false;
        audio = a.audio;
        haptics = h.haptics;
        soundEl = u.soundControl({ placement: 'down', align: 'start', className: 'at-sound' });
        // tocar no alto-falante também responde ao convite (ninguém fica com o controle "ligado" e mudo)
        soundEl.addEventListener(
          'click',
          () => {
            if (invite) answerInvite(true, { quiet: true });
            else if (soundPending) acceptSound({ quiet: true });
          },
          true,
        );
        host.hud.querySelector('[data-at-sound]').append(soundEl);
        return true;
      })
      .catch((err) => {
        console.warn('[atelie] som indisponível:', err?.message || err);
        soundLoading = null; // sem rede agora: a próxima entrada no modo Ateliê tenta de novo
        return false;
      });
    return soundLoading;
  }

  /** Liga o som e a vibração ao barramento (o áudio só toca de fato depois de um gesto da pessoa). */
  function soundOn() {
    if (!audio || offSound) return;
    audio.resume();
    // efeitos por evento, trilha por etapa e as marcas de som da cena ('cue'); com a cena ligada, o que ela anima
    // soa pelas marcas (na hora de cada batida) e o toque faz só um clique
    const offAudio = audio.bind(bus, { cued: () => sceneOk && atelie() });
    const offHaptics = haptics.bind(bus);
    audio.music.setScene(host.step());
    audio.music.start();
    offSound = () => {
      offAudio();
      offHaptics();
    };
  }
  function soundOff() {
    offSound?.();
    offSound = null;
    if (!audio) return;
    audio.music.stop({ fade: 0.3 });
    audio.suspend();
  }

  /* ───────── convite para ligar o som (só na primeira visita; nunca toca sozinho) ───────── */
  function showInvite() {
    if (invite || !alive) return;
    invite = document.createElement('div');
    invite.className = 'at-card at-invite';
    invite.setAttribute('role', 'group');
    invite.setAttribute('aria-label', 'Som do ateliê');
    invite.innerHTML = String(html`
      <span class="at-card__icon">${ICON.sound}</span>
      <p class="at-card__text"><strong>Ligar o som do ateliê?</strong><span>Música baixinha, sons de confeitaria e a voz da Bô.</span></p>
      <div class="at-card__acts">
        <button type="button" class="btn btn--sm" data-at-yes>Ligar o som</button>
        <button type="button" class="at-card__quiet" data-at-no>Agora não</button>
      </div>
    `);
    invite.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-at-yes]')) answerInvite(true);
      else if (ev.target.closest('[data-at-no]')) answerInvite(false);
    });
    host.layer.append(invite);
    later(dismissInvite, 16000);
    host.say('Quer ligar o som do ateliê? Tem música baixinha, sons de confeitaria e a voz da assistente Bô. Use os botões Ligar o som ou Agora não.');
  }
  function closeInvite() {
    invite?.remove();
    invite = null;
  }
  function acceptSound({ quiet = false, on = true } = {}) {
    soundPending = false;
    soundEl?.classList.remove('at-wants');
    prefs.set('atelierSoundAsked', true);
    if (!audio) return;
    audio.settings.mute.master = !on;
    if (on) audio.unlock(); // dentro do toque da pessoa
    soundOn();
    if (on && !quiet) audio.sfx('open', { delay: 0.05 });
  }
  /** on = true liga; false guarda "sem som" (dá para ligar depois, no alto-falante). */
  function answerInvite(on, { quiet = false } = {}) {
    if (!invite) return;
    closeInvite();
    acceptSound({ quiet, on });
    host.say(on ? 'Som ligado. O alto-falante no canto do palco ajusta ou desliga.' : 'Sem som. Para ligar depois, use o alto-falante no canto do palco.');
    startBo();
    later(maybeTips, 6500);
  }
  /**
   * A pessoa seguiu montando sem responder: o convite sai do caminho. Nada toca nesta visita (o som nem é
   * ligado ao barramento) até ela tocar no alto-falante; na próxima visita o convite volta.
   */
  function dismissInvite() {
    if (!invite) return;
    closeInvite();
    soundPending = true;
    soundEl?.classList.add('at-wants');
    startBo();
    later(maybeTips, 6500);
  }

  /* ───────── a Bô ───────── */
  // A voz dela passa por aqui: só fala em voz alta quando o som do ateliê está ligado (aceito e no modo Ateliê).
  const voiceMuted = () => Boolean(audio?.settings?.mute?.master || audio?.settings?.mute?.voice);
  const boAudio = {
    get settings() {
      return audio.settings;
    },
    unlock: () => (offSound ? audio.unlock() : false),
    voice: {
      // r5-qa: com o som recusado ("Agora não") ou mudo no alto-falante, o clipe nem é pedido à rede — antes cada fala
      // baixava o seu mp3 (~20 KB) para tocar em silêncio. A recusa cai no caminho "só balão" da Bô (a boca mexe um
      // instante e o balão fica o tempo de ler).
      play: (url, o) => (!offSound ? Promise.resolve({ played: false, reason: 'locked' }) : voiceMuted() ? Promise.reject(new Error('sem som')) : audio.voice.play(url, o)),
      stop: (o) => audio.voice.stop(o),
      preload: (url) => (offSound && !voiceMuted() ? audio.voice.preload(url) : Promise.resolve(false)),
      level: () => audio.voice.level(),
      get speaking() {
        return audio.voice.speaking;
      },
    },
  };
  /** Uma dica de gesto: a Bô diz (no balão); sem ela, um aviso curto no palco. `still` = a dica ainda faz sentido? */
  function hint(text, still = () => true, tries = 0) {
    if (!alive || !atelie() || revealing || !still()) return;
    if (!bo || !bo.enabled) return void host.flash(text);
    if (bo.ui.bubbleOn && tries < 2) return void later(() => hint(text, still, tries + 1), 3200);
    bo.say({ text, mood: 'feliz' });
  }
  function startBo() {
    if (!atelie() || !alive) return;
    if (bo) return void bo.setEnabled(true);
    boLoading ||= Promise.all([import('../bo/index.js'), boStyle()])
      .then(([m]) => {
        if (!alive || bo) return;
        bo = m.createBo({
          mount: host.layer,
          bus,
          audio: audio ? boAudio : null,
          getConfig: host.publicConfig,
          getStep: host.step,
          rules: host.rules,
          source: host.source,
          onAction: (action) => host.applyBo(action, m.applyPatch),
        });
        if (!atelie()) bo.setEnabled(false);
      })
      .catch((err) => console.warn('[atelie] a Bô não chegou:', err?.message || err))
      .finally(() => {
        boLoading = null;
      });
  }

  /* ───────── dicas da primeira visita ───────── */
  function maybeTips() {
    if (tips || invite || revealing || !atelie() || prefs.get('atelierTipsSeen') || host.step() !== 'formato' || document.querySelector('.overlay')) return;
    // r5-qa: com a aba do jogo aberta ou uma encomenda em curso as dicas não entram por cima (ficam para outra hora)
    if (host.cz.classList.contains('has-order') || host.root.querySelector('.ag-panel.is-open, .ag-sheet.is-open, [class*="ag-"].is-open')) return;
    const el = document.createElement('div');
    el.className = 'at-card at-tips';
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', 'Dicas do ateliê');
    el.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-at-next]')) showTip(tips.at + 1);
      else if (ev.target.closest('[data-at-skip]')) closeTips();
    });
    host.layer.append(el);
    host.layer.dataset.busy = 'tips';
    tips = { el, at: -1 };
    showTip(0);
  }
  function unspot() {
    host.cz.querySelectorAll('.at-spot').forEach((n) => n.classList.remove('at-spot'));
  }
  function showTip(i) {
    if (!tips) return;
    if (i >= TIPS.length) return void closeTips();
    let tip = TIPS[i];
    // r5-qa: dica que aponta para um botão que não está na tela (o jogo não carregou) usa a alternativa
    if (tip.alt && !host.cz.querySelector(`${tip.spot}:not([hidden])`)) tip = tip.alt;
    tips.at = i;
    unspot();
    if (tip.spot) host.cz.querySelector(tip.spot)?.classList.add('at-spot');
    const last = i === TIPS.length - 1;
    tips.el.innerHTML = String(html`
      <span class="at-card__icon">${ICON[tip.icon]}</span>
      <p class="at-card__text"><strong>Dica ${i + 1} de ${TIPS.length}</strong><span>${tip.text}</span></p>
      <div class="at-card__acts">
        <button type="button" class="btn btn--soft btn--sm" data-at-next>${last ? 'Entendi' : 'Próxima'}</button>
        ${last ? '' : html`<button type="button" class="at-card__quiet" data-at-skip>Pular</button>`}
      </div>
    `);
    host.say(`Dica ${i + 1} de ${TIPS.length}: ${tip.text}`);
  }
  function closeTips() {
    if (!tips) return;
    tips.el.remove();
    tips = null;
    unspot();
    delete host.layer.dataset.busy;
    prefs.set('atelierTipsSeen', true);
    prefs.set('customizerHintSeen', true);
  }

  /* ───────── modo ───────── */
  async function enterAtelie() {
    syncScene();
    const ok = await loadSound();
    if (!alive || !atelie()) return;
    if (ok && !prefs.get('atelierSoundAsked') && audio.supported && !audio.settings.mute.master) {
      showInvite(); // a Bô e as dicas vêm depois da resposta
      return;
    }
    if (ok) soundOn();
    startBo();
    later(maybeTips, 7000);
  }
  function leaveAtelie() {
    closeInvite();
    if (tips) {
      // quem foi para o modo rápido não precisa mais das dicas agora (elas voltam na próxima visita ao ateliê)
      tips.el.remove();
      tips = null;
      unspot();
      delete host.layer.dataset.busy;
    }
    revealing?.close();
    soundOff();
    bo?.setEnabled(false);
    syncScene();
    hands.sync();
  }
  function setMode() {
    if (atelie()) enterAtelie();
    else leaveAtelie();
    hands.sync();
  }

  /* ───────── gestos ───────── */
  const hands = createHands(host, { scene: live, atelie, later, hint });
  offs.push(() => hands.destroy());
  offs.push(
    bus.on('change', (detail) => {
      if ((detail?.by || 'user') === 'user') {
        dismissInvite(); // a pessoa já está montando: o convite sai do caminho
        closeTips(); // r5-qa: e as dicas também — o cartão delas fica sobre a faixa de etapas e segurava o toque em "Massa"
      }
      hands.changed(detail);
      // velas que entram ou saem do bolo mudam o que o palco oferece (acender, soprar)
      if (/^(decor\.|candles\.)/.test(String(detail?.key || ''))) later(() => hands.sync(), 500);
    }),
  );

  /* ───────── revelação, vídeo ───────── */
  async function reveal() {
    if (revealing || !alive) return;
    if (host.step() !== 'resumo') host.goto('resumo');
    closeTips();
    host.disarm();
    try {
      const m = await import('./reveal.js');
      if (!alive || revealing) return;
      bo?.setEnabled(false); // a revelação é do bolo: a Bô espera calada e volta no fim
      revealing = m.startReveal(host, {
        scene: live,
        later,
        haptics: () => haptics,
        onClose: () => {
          revealing = null;
          if (alive && atelie()) {
            call(scene()?.setScene?.bind(scene()), sceneFor());
            bo?.setEnabled(true);
          }
        },
      });
    } catch (err) {
      console.error('[atelie] revelação', err);
      host.celebrate();
    }
  }
  let recording = false;
  async function video() {
    if (recording || !alive) return;
    recording = true;
    try {
      const m = await import('./reveal.js');
      await m.recordVideo(host, { scene: live, later });
    } catch (err) {
      console.error('[atelie] vídeo', err);
      host.toast('Não deu para gravar o vídeo neste aparelho.');
    } finally {
      recording = false;
    }
  }
  // o vídeo só aparece onde dá para gravar (com a cena, a montagem do bolo; sem ela, o bolo girando)
  import('./reveal.js')
    .then((m) => alive && host.video(m.canRecord(host, live())))
    .catch(() => {});

  /* ───────── jogo (js/atelier/game): encomendas e figurinhas, por cima do painel de opções ─────────
     O botão de abrir é o da coluna do ateliê (launcher: false): o do jogo cairia no mesmo canto do som e do modo. */
  const boForGame = {
    // sem a Bô (ou com ela desligada), o jogo mostra as falas como texto na própria cena da entrega
    get say() {
      return bo && bo.enabled ? (what, opts) => bo.say(what, opts) : undefined;
    },
  };
  const syncOrder = () => host.gameOn(Boolean(game && call(game.current?.bind(game))));
  function startGame() {
    gameModule ||= import('../game/index.js').catch((err) => {
      console.warn('[atelie] jogo indisponível:', err?.message || err);
      return null;
    });
    gameModule.then((m) => {
      if (!alive || game || !m || typeof m.mountGame !== 'function') return;
      try {
        game = m.mountGame({
          root: host.cz,
          bus,
          audio,
          bo: boForGame,
          getConfig: host.publicConfig,
          setConfig: (config) => host.setConfig(config, { by: 'game' }),
          getPrice: host.price,
          goto: host.goto,
          launcher: false,
        });
      } catch (err) {
        console.error('[atelie] o jogo não montou:', err);
        return;
      }
      offs.push(() => call(game?.destroy?.bind(game)));
      // a comanda de uma encomenda em curso mora no alto do palco: o bolo dá lugar a ela
      ['game.start', 'game.end', 'game.score'].forEach((type) => offs.push(bus.on(type, () => later(syncOrder, 0))));
      syncOrder();
      // o jogo ouve 'mode' para saber se está no modo rápido (a tela só emite quando o modo muda)
      if (!atelie()) bus.emit('mode', { mode: host.mode() });
      const btn = host.hud.querySelector('[data-at-game]');
      if (btn) btn.hidden = false;
    });
  }
  later(startGame, 900);

  /* ───────── a loja saiu da frente / voltou (app em segundo plano) ───────── */
  const onBackground = () => audio?.suspend();
  const onForeground = () => {
    if (alive && atelie() && offSound) audio?.resume();
  };
  window.addEventListener('bolab:background', onBackground);
  window.addEventListener('bolab:foreground', onForeground);
  offs.push(() => {
    window.removeEventListener('bolab:background', onBackground);
    window.removeEventListener('bolab:foreground', onForeground);
  });

  if (atelie()) enterAtelie();
  else syncScene();
  hands.sync();

  return {
    hands,
    setMode,
    reveal,
    video,
    game: () => {
      // r5-qa: abrir o jogo tira da frente o cartão das dicas e o convite (ficavam por cima da aba "Jogar")
      closeTips();
      dismissInvite();
      return call(game?.open?.bind(game));
    },
    /** A etapa mudou. */
    step() {
      dismissInvite();
      if (tips) closeTips();
      if (atelie() && !revealing) call(scene()?.setScene?.bind(scene()), sceneFor());
      hands.sync();
    },
    /** A pessoa trocou o cenário (painel "Fundo"). */
    scene() {
      if (atelie() && !revealing) call(scene()?.setScene?.bind(scene()), sceneFor());
    },
    /** A pessoa mexeu no bolo (girou): a primeira dica já foi cumprida. */
    interact() {
      if (tips && tips.at === 0) showTip(1);
      const now = performance.now();
      if (now - spunAt < 1500) return;
      spunAt = now;
      bus.emit('gesture', { id: 'spin', phase: 'start', value: 'dedo' });
    },
    /** Esc / "voltar" do Android: fecha o que estiver por cima. → true se fechou alguma coisa. */
    back() {
      if (revealing) return revealing.close(), true;
      // r5-qa: a aba do jogo (encomendas, comanda, entrega, álbum) também é uma camada: "voltar" fecha a aba
      if (game && call(game.isOpen?.bind(game))) return call(game.close?.bind(game)), true;
      if (tips) return closeTips(), true;
      if (invite) return dismissInvite(), true; // sem resposta: pergunta de novo na próxima visita
      if (hands.back()) return true;
      return false;
    },
    /** Para testes e para o roteiro de sessão. */
    debug: () => ({ mode: host.mode(), sound: Boolean(offSound), pending: soundPending, audio: audio ? audio.debug() : null, bo: Boolean(bo), boOn: Boolean(bo?.enabled), invite: Boolean(invite), tips: tips ? tips.at : null, scene: sceneOk, game: Boolean(game), order: Boolean(game && call(game.current?.bind(game))) }),
    get audio() {
      return audio;
    },
    get bo() {
      return bo;
    },
    get gameApi() {
      return game;
    },
    destroy() {
      if (!alive) return;
      alive = false;
      timers.forEach(clearTimeout);
      timers.clear();
      revealing?.close();
      closeInvite();
      if (tips) {
        tips.el.remove();
        tips = null;
        unspot();
      }
      offs.forEach((off) => {
        try {
          off();
        } catch (err) {
          console.error('[atelie] limpeza', err);
        }
      });
      offSound?.();
      offSound = null;
      // a tela saiu: silêncio (a música para e o contexto adormece); a Bô e o controle de som saem do palco
      if (audio) {
        audio.music.stop({ fade: 0.2 });
        audio.voice.stop();
        audio.suspend();
      }
      try {
        bo?.destroy();
      } catch (err) {
        console.error('[atelie] a Bô não saiu direito:', err);
      }
      bo = null;
      soundEl?.destroy();
      soundEl = null;
    },
  };
}
