// BOLAB — Ateliê: a camada de imersão da tela do personalizador (frente Tela).
//
// A tela (js/views/customizer.js) busca este módulo depois do primeiro quadro do bolo e entrega um `host`
// (o que ele pode ler e pedir). Aqui se ligam, sob demanda e cada um por si:
//
//   avisos     ./notices.js (host.notes, criado pela tela)      → convite do som, dicas, controles de gesto: um por vez
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
import { createHands } from './hands.js';
import { NOTE_ICON } from './notices.js';

/**
 * As dicas da primeira visita. Chegam UMA POR VEZ, na faixa de avisos, depois que a Bô se apresentou — e cada uma
 * espera a Bô terminar de falar. Nenhuma tem "próxima": some sozinha, ao ser cumprida ou no ✕.
 *   girar   some quando a pessoa gira o bolo (ou em 8 s)
 *   jogo    o convite para brincar: aponta para o botão do jogo, na coluna do palco (ele fica marcado enquanto a
 *           dica está na tela). Sem o botão à vista (jogo não carregou, celular muito baixo), fala do menu "…".
 */
const TIPS = [
  { id: 'girar', icon: 'swipe', text: 'Arraste o bolo para girar e ver de todos os lados.', ms: 8000, spot: null },
  {
    id: 'jogo',
    icon: 'ticket',
    text: 'Quer brincar de confeiteiro? O jogo fica neste botão.',
    action: 'Jogar',
    spot: '.cz-tools [data-act="game"]',
    alt: { text: 'Jogo, som, vistas e modo rápido ficam no menu do palco.', action: 'Abrir', spot: '[data-act="stagemenu"]' },
    ms: 10000,
  },
];
const INVITE_AFTER = 3200; // o bolo aparece primeiro: o convite do som só vem depois de a pessoa ter visto o bolo
const TIP_AFTER = 6500; // depois da resposta ao convite (a Bô se apresenta nesse meio-tempo)
const TIP_GAP = 9000; // entre uma dica e a outra

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
  const notes = host.notes;
  let invite = null; // o aviso do convite: { close() }
  let soundPending = false; // o convite saiu sem resposta nesta visita: o alto-falante ainda liga o som
  let tips = null; // a dica em cartaz: { note, at }
  let tipsAt = 0; // a próxima dica da fila
  let spun = false; // a pessoa já girou o bolo: a dica de girar não é mais precisa
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
        soundEl = u.soundControl({ placement: 'up', align: 'end', className: 'at-sound' });
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
        syncWants();
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

  /* ───────── convite para ligar o som (só na primeira visita; nunca toca sozinho) ─────────
     Um aviso da faixa de baixo do palco (nunca sobre o bolo nem sobre o painel): a pessoa vê o bolo primeiro. */
  /** O convite ficou sem resposta: o botão "…" do palco e a linha do som pedem atenção, sem insistir. */
  function syncWants() {
    soundEl?.classList.toggle('at-wants', soundPending);
    host.cz.classList.toggle('wants-sound', soundPending);
  }
  function showInvite() {
    if (invite || !alive || !atelie() || revealing || prefs.get('atelierSoundAsked')) return;
    const mine = notes.push({
      kind: 'ask',
      className: 'at-card at-invite',
      label: 'Som do ateliê',
      icon: NOTE_ICON.sound,
      title: 'Ligar o som do ateliê?',
      text: 'Música baixinha e a voz da Bô.',
      closable: false,
      ms: 16000,
      actions: [
        { label: 'Agora não', quiet: true, attr: 'data-at-no', onClick: () => answerInvite(false) },
        { label: 'Ligar', aria: 'Ligar o som', go: true, attr: 'data-at-yes', onClick: () => answerInvite(true) },
      ],
      onClose: (why) => why === 'time' && invite === mine && dismissInvite(),
    });
    invite = mine;
    host.say('Quer ligar o som do ateliê? Tem música baixinha, sons de confeitaria e a voz da assistente Bô. Use os botões Ligar o som ou Agora não.');
  }
  function closeInvite() {
    const was = invite;
    invite = null;
    was?.close('answer');
  }
  function acceptSound({ quiet = false, on = true } = {}) {
    soundPending = false;
    syncWants();
    prefs.set('atelierSoundAsked', true);
    if (!audio) return;
    audio.settings.mute.master = !on;
    if (on) audio.unlock(); // dentro do toque da pessoa
    soundOn();
    if (on && !quiet) audio.sfx('open', { delay: 0.05 });
  }
  /** on = true liga; false guarda "sem som" (dá para ligar depois, no menu do palco). */
  function answerInvite(on, { quiet = false } = {}) {
    if (!invite) return;
    closeInvite();
    acceptSound({ quiet, on });
    host.say(on ? 'Som ligado. Para ajustar ou desligar, abra o menu do palco.' : 'Sem som. Para ligar depois, abra o menu do palco.');
    startBo();
    later(maybeTips, TIP_AFTER);
  }
  /**
   * A pessoa seguiu montando sem responder: o convite sai do caminho. Nada toca nesta visita (o som nem é
   * ligado ao barramento) até ela tocar no alto-falante; na próxima visita o convite volta.
   */
  function dismissInvite() {
    if (!invite) return;
    closeInvite();
    soundPending = true;
    syncWants();
    startBo();
    later(maybeTips, TIP_AFTER);
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
    if (!bo || !bo.enabled) return void notes.flash(text, { ms: 4200 });
    if (bo.ui.bubbleOn && tries < 2) return void later(() => hint(text, still, tries + 1), 3200);
    bo.say({ text, mood: 'feliz' });
  }
  /** A Bô está no palco? (a faixa de avisos começa depois dela; sem ela, usa a largura toda) */
  function boOn(on) {
    bo?.setEnabled(on);
    host.cz.classList.toggle('has-bo', Boolean(bo && bo.enabled));
  }
  function startBo() {
    if (!atelie() || !alive) return;
    if (bo) return void boOn(true);
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
        boOn(atelie() && !revealing);
      })
      .catch((err) => console.warn('[atelie] a Bô não chegou:', err?.message || err))
      .finally(() => {
        boLoading = null;
      });
  }

  /* ───────── dicas da primeira visita: uma por vez, na faixa de avisos ───────── */
  const tipsBlocked = () => Boolean(invite || revealing || !atelie() || document.querySelector('.overlay') || host.cz.classList.contains('has-order') || host.cz.classList.contains('has-menu') || host.root.querySelector('.ag-panel.is-open'));
  function maybeTips() {
    if (tips || !alive || prefs.get('atelierTipsSeen')) return;
    if (tipsAt >= TIPS.length) return void endTips();
    // com o jogo aberto, uma encomenda em curso ou um diálogo por cima, a dica fica para daqui a pouco
    if (tipsBlocked()) return void later(maybeTips, 4000);
    if (TIPS[tipsAt].id === 'girar' && spun) tipsAt += 1; // já girou sozinha
    const i = tipsAt;
    let tip = TIPS[i];
    // dica que aponta para um botão que não está à vista (o jogo não carregou, ou foi recolhido no "…") usa a alternativa
    const seen = (sel) => Boolean(sel && [...host.cz.querySelectorAll(sel)].some((n) => n.getClientRects().length));
    const viaGame = tip.id === 'jogo' && seen(tip.spot);
    if (tip.alt && !viaGame) tip = { ...tip, ...tip.alt };
    const text = tip.text;
    const note = notes.push({
      kind: 'tip',
      className: 'at-tips',
      label: 'Dica do ateliê',
      icon: NOTE_ICON[tip.icon],
      text,
      ms: tip.ms,
      closeLabel: 'Fechar a dica',
      actions: tip.action ? [{ label: tip.action, attr: 'data-at-next', onClick: () => (closeTip('done'), viaGame ? host.openGame() : host.openMenu()) }] : [],
      wait: () => Boolean(bo?.ui?.bubbleOn) || tipsBlocked(),
      onShow() {
        if (tip.spot) host.cz.querySelector(tip.spot)?.classList.add('at-spot');
        host.say(`Dica: ${text}`);
      },
      // a Bô voltou a falar: a dica (e o anel no botão) dá a vez e volta depois
      onYield(off) {
        if (tip.spot) host.cz.querySelector(tip.spot)?.classList.toggle('at-spot', !off);
      },
      onClose() {
        unspot();
        if (tips?.note !== note) return;
        tips = null;
        tipsAt = i + 1;
        if (tipsAt >= TIPS.length) endTips();
        else later(maybeTips, TIP_GAP);
      },
    });
    tips = { note, at: i };
  }
  function unspot() {
    host.cz.querySelectorAll('.at-spot').forEach((n) => n.classList.remove('at-spot'));
  }
  function closeTip(why = 'close') {
    tips?.note.close(why);
  }
  function endTips() {
    prefs.set('atelierTipsSeen', true);
    prefs.set('customizerHintSeen', true);
  }
  /** Fecha a dica em cartaz e não mostra mais nenhuma nesta visita (voltam na próxima, se ainda não foram vistas). */
  function closeTips() {
    const was = tips;
    tips = null;
    tipsAt = TIPS.length + 1;
    was?.note.close('stop');
    unspot();
  }

  /* ───────── modo ───────── */
  async function enterAtelie() {
    syncScene();
    const ok = await loadSound();
    if (!alive || !atelie()) return;
    if (ok && !prefs.get('atelierSoundAsked') && audio.supported && !audio.settings.mute.master) {
      // o bolo primeiro: o convite só entra depois de alguns segundos (a Bô e as dicas vêm depois da resposta)
      later(showInvite, INVITE_AFTER);
      return;
    }
    if (ok) soundOn();
    startBo();
    later(maybeTips, TIP_AFTER);
  }
  function leaveAtelie() {
    closeInvite();
    closeTips(); // quem foi para o modo rápido não precisa das dicas agora (elas voltam na próxima visita ao ateliê)
    revealing?.close();
    soundOff();
    boOn(false);
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
      // a pessoa já está montando: o convite sai do caminho (as dicas ficam: moram na faixa do palco e não cobrem nada)
      if ((detail?.by || 'user') === 'user') dismissInvite();
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
      boOn(false); // a revelação é do bolo: a Bô espera calada e volta no fim
      revealing = m.startReveal(host, {
        scene: live,
        later,
        haptics: () => haptics,
        onClose: () => {
          revealing = null;
          if (alive && atelie()) {
            call(scene()?.setScene?.bind(scene()), sceneFor());
            boOn(true);
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
     Quem abre é a linha "Encomendas e figurinhas" da folha "Ateliê" (launcher: false): o palco fica só com o bolo. */
  const boForGame = {
    // sem a Bô (ou com ela desligada), o jogo mostra as falas como texto na própria cena da entrega
    get say() {
      return bo && bo.enabled ? (what, opts) => bo.say(what, opts) : undefined;
    },
  };
  const syncOrder = () => host.gameOn(Boolean(game && call(game.current?.bind(game))));
  /* Novidade no jogo: figurinha nova ainda não vista no álbum, ou a encomenda do dia que a pessoa ainda não viu
     hoje (basta abrir o jogo uma vez no dia). Vira um ponto discreto no botão do jogo — nada além disso. */
  const dayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  function syncGameNews() {
    if (!game || !alive) return;
    let news = false;
    try {
      const s = game.state() || {};
      news = (s.fresh || []).length > 0 || (prefs.get('atelierGameSeenDay') !== dayKey() && s.daily?.last !== dayKey());
    } catch {
      // sem estado legível: sem ponto
    }
    host.cz.classList.toggle('has-game-news', news);
    const btn = host.cz.querySelector('.cz-tools [data-act="game"]');
    if (btn) btn.setAttribute('aria-label', news ? 'Encomendas e figurinhas. Tem novidade.' : 'Encomendas e figurinhas');
  }
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
      ['game.start', 'game.end', 'game.sticker'].forEach((type) => offs.push(bus.on(type, () => later(syncGameNews, 60))));
      syncOrder();
      // a aba do jogo abriu: a pessoa viu as novidades de hoje; ao fechar, confere de novo (o álbum zera as figurinhas novas)
      const tab = host.cz.querySelector('.ag-panel');
      if (tab && typeof MutationObserver === 'function') {
        const watch = new MutationObserver(() => {
          if (tab.classList.contains('is-open')) prefs.set('atelierGameSeenDay', dayKey());
          later(syncGameNews, 60);
        });
        watch.observe(tab, { attributes: true, attributeFilter: ['class'] });
        offs.push(() => watch.disconnect());
      }
      syncGameNews();
      // o jogo ouve 'mode' para saber se está no modo rápido (a tela só emite quando o modo muda)
      if (!atelie()) bus.emit('mode', { mode: host.mode() });
      // o botão do jogo na coluna do palco e a linha dele na folha "Ateliê"
      host.cz.querySelectorAll('[data-at-game]').forEach((btn) => (btn.hidden = false));
      host.cz.classList.add('has-game');
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
      closeTip('done'); // a dica em cartaz já foi cumprida (a próxima espera o jogo fechar)
      dismissInvite();
      return call(game?.open?.bind(game));
    },
    /** A folha "Ateliê" vai abrir: a aba do jogo sai da frente (as duas cobrem o mesmo painel). */
    closeGame: () => Boolean(game && call(game.isOpen?.bind(game))) && call(game.close?.bind(game)),
    /** A etapa mudou. */
    step() {
      dismissInvite();
      if (atelie() && !revealing) call(scene()?.setScene?.bind(scene()), sceneFor());
      hands.sync();
    },
    /** A pessoa trocou o cenário (painel "Fundo"). */
    scene() {
      if (atelie() && !revealing) call(scene()?.setScene?.bind(scene()), sceneFor());
    },
    /** A pessoa mexeu no bolo (girou): a primeira dica já foi cumprida. */
    interact() {
      spun = true;
      if (tips && TIPS[tips.at]?.id === 'girar') closeTip('done'); // cumprida (mesmo que ainda esperando a vez)
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
      if (tips?.note.shown) return closeTip('dismiss'), true;
      if (invite?.shown) return dismissInvite(), true; // sem resposta: pergunta de novo na próxima visita
      if (hands.back()) return true;
      return false;
    },
    /** Para testes e para o roteiro de sessão. */
    debug: () => ({ mode: host.mode(), sound: Boolean(offSound), pending: soundPending, audio: audio ? audio.debug() : null, bo: Boolean(bo), boOn: Boolean(bo?.enabled), invite: Boolean(invite), tips: tips?.note.shown ? tips.at : null, scene: sceneOk, game: Boolean(game), order: Boolean(game && call(game.current?.bind(game))) }),
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
      closeTips();
      host.cz.classList.remove('has-bo', 'has-game', 'has-game-news', 'wants-sound');
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
