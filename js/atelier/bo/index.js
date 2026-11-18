// BOLAB — Ateliê: a Bô, assistente do personalizador. Ela OUVE o barramento (js/atelier/bus.js), raciocina com
// regras de confeitaria (brain.js), escolhe uma fala da biblioteca (lines.js), mostra no balão e fala com a voz
// gravada (assets/voz/). Ela nunca mexe no bolo: quando sugere algo, entrega uma ação e a TELA aplica.
//
//   import { createBo } from '../atelier/bo/index.js';
//   const bo = createBo({
//     mount: palco,                      // elemento posicionado (o palco 3D); a Bô flutua dentro dele
//     bus,                               // js/atelier/bus.js
//     audio,                             // js/atelier/audio.js (opcional: sem ele, só balão)
//     getConfig: () => state.config,     // a configuração atual do bolo
//     getStep: () => etapaAtual,         // 'formato' | 'massa' | … | 'resumo'
//     onAction: ({ label, patch, step }) => { … },   // a tela aplica a sugestão (ver abaixo)
//     rules: rulesOf,                    // opcional: js/customizer/rules.js, quando existir
//     source: 'rascunho',                // opcional: de onde veio o bolo, se a tela já tiver emitido 'open' antes de criar a Bô
//   });
//   bo.say('humor')            // diz uma fala (id, grupo ou { text, mood })
//   bo.ask('combina')          // responde a um atalho (Promise)
//   bo.nudge()                 // pede um palpite agora
//   bo.setEnabled(false)       // esconde e cala
//   bo.destroy()
//
// AÇÃO SUGERIDA — quando a pessoa toca no botão do balão ("Trocar para…"), a Bô chama onAction(acao) e também
// emite bus.emit('bo.action', acao). A tela faz:
//   · acao.patch → config = applyPatch(config, acao.patch)  (de brain.js; já devolve normalizada), redesenha e
//     emite as mudanças com by: 'bo' (a Bô confirma sozinha e não comenta a própria troca);
//   · acao.step  → vai para a etapa indicada.
//
// O QUE ELA OUVE NO BARRAMENTO — open, close, step, change, fit, tool, cart e, da imersão, gesture, reveal, photo
// e mode (js/atelier/README.md). O resto (marcas de som `cue`, eventos `game.*`) ela ignora sem gastar nada: o jogo
// pede as falas dele pelo nome do grupo — bo.say('jogo.inicio').
//   · Evento opcional `rule` { fixed: [{ code, text }] }: quando a tela corrige sozinha uma combinação que a cozinha
//     não faz (enforceRules), pode avisar com bus.emit('rule', { fixed: ruled.fixed }) e a Bô explica com a fala do
//     código (regra.vulcao-lateral, regra.lateral-fita…). Sem esse aviso ela não fica sabendo da correção.
//   · Chá revelação: a Bô nunca vê a cor (aqui ela é trocada por um valor fixo antes de chegar ao cérebro) e nenhuma
//     sugestão dela mexe em reveal.color.
//
// IA GENERATIVA NO FUTURO — hoje `ask(contexto)` é atendida pelas regras locais. Com um servidor, passe
// `remote: async (contexto) => ({ text, mood?, lineId?, action? })`: a resposta do servidor entra no lugar da
// local (com limite de tempo; se falhar, vale a local). `contexto` leva o atalho, a configuração, a etapa, o
// preço, a nota e as últimas falas. Sem `lineId` de uma fala gravada, a resposta sai só no balão.
import * as brain from './brain.js';
import { LINES, POOLS } from './lines.js';
import { createUi } from './ui.js';
import { normalizeConfig, priceOf } from '../../customizer/pricing.js';

const CSS_ID = 'bo-css';
/** A cor do chá revelação que a Bô "vê": sempre a mesma, seja qual for a escolhida (o segredo fica na tela). */
const REVEAL_MASK = 'rosa';
const STORE_KEY = 'bolab.bo.v1';
const VOICE_BASE = new URL('../../../assets/voz/', import.meta.url).href;

function ensureCss() {
  if (document.getElementById(CSS_ID)) return;
  const link = document.createElement('link');
  link.id = CSS_ID;
  link.rel = 'stylesheet';
  link.href = new URL('../../../css/atelier-bo.css', import.meta.url).href;
  document.head.append(link);
}

const manifests = new Map();
/** O manifesto da voz ({ voz, falas: { id: { arquivo, dur, h } } }); sem ele, a Bô fica só no balão. */
function loadManifest(base) {
  if (!manifests.has(base)) {
    manifests.set(
      base,
      fetch(`${base}manifest.json`)
        .then((r) => (r.ok ? r.json() : null))
        .then((m) => (m && m.falas ? m : null))
        .catch(() => null),
    );
  }
  return manifests.get(base);
}

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch {
    return {};
  }
}

function writeStore(v) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(v));
  } catch {
    // navegação privada ou armazenamento cheio: as preferências valem só nesta visita
  }
}

const AFTERGLOW = { feliz: 'feliz', comemora: 'comemorando', surpresa: 'surpresa', preocupada: 'preocupada' };

export function createBo({ mount, bus = null, audio = null, getConfig, getStep = () => null, onAction = null, rules = null, remote = null, mode = null, seed = null, avoid, voiceBase = VOICE_BASE, persist = true, greet = true, source = 'novo', now = () => performance.now() } = {}) {
  if (!mount) throw new Error('createBo: informe o elemento `mount` (o palco).');
  if (typeof getConfig !== 'function') throw new Error('createBo: informe `getConfig`.');
  ensureCss();
  const store = persist ? readStore() : {};
  const save = (patch) => {
    Object.assign(store, patch);
    if (persist) writeStore(store);
  };
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const mem = brain.createMemory({
    seed: seed ?? Math.floor(Math.random() * 1e9) + 1,
    mode: mode || store.mode || 'importa',
    returning: Boolean(store.seen),
  });
  let rulesFn = typeof rules === 'function' ? rules : null;
  let enabled = true;
  let destroyed = false;
  let manifest = null;
  let voiceOn = store.voice !== false && audio?.settings?.voice !== false;
  let current = null; // a fala no balão
  let speakSeq = 0;
  let speaking = false;
  let mouthRaf = 0;
  let stateTimer = 0;
  let afterTimer = 0;
  let opened = false;
  let heldEnd = 0; // quando a revelação do bolo terminou com ela calada
  let presence = 'ativa';
  const preloaded = new Set();

  loadManifest(voiceBase).then((m) => {
    manifest = m;
    if (m) mem.durations = Object.fromEntries(Object.entries(m.falas).map(([id, f]) => [id, f.dur]));
  });

  const ui = createUi({
    mount,
    chips: brain.CHIPS,
    modes: brain.MODES,
    avoid,
    position: store.pos,
    onChip: (id) => ask(id),
    onAction: (i) => runAction(i),
    onMode: (m) => setMode(m),
    onVoice: () => setVoice(!voiceOn),
    onReplay: () => current && speak(current, { replay: true }),
    onOpen: (open) => {
      if (!open) return;
      audio?.unlock?.();
      // modo mudo: o que ela guardou para dizer aparece ao toque
      if (mem.missed) {
        const d = mem.missed;
        mem.missed = null;
        ui.dot(false);
        const { _c, ...pub } = d;
        setTimeout(() => speak(pub, { silent: true }), 0);
      }
    },
    onMoved: (pos) => save({ pos }),
    onHide: () => {
      mem.offerUntil = 0; // o balão com a sugestão saiu: ela pode voltar a conversar
    },
  });
  const avatar = ui.avatar;
  ui.setMode(mem.mode);
  ui.setVoice(voiceOn);
  ui.setVoiceAvailable(typeof audio?.voice?.play === 'function');
  avatar.gesture(reduceMotion ? '' : 'pop');

  /* ───────── contexto para o cérebro ───────── */
  let rawSeen = null;
  let normSeen = null;
  /**
   * A configuração como a Bô a enxerga: normalizada e SEM a cor do chá revelação (o segredo não entra no cérebro,
   * não vai para um servidor e não volta numa sugestão — mesmo que a tela entregue a configuração inteira).
   */
  function seen(raw) {
    const c = normalizeConfig(raw);
    if (c.reveal) c.reveal = { ...c.reveal, color: REVEAL_MASK };
    return c;
  }
  function ctx(config) {
    let cfg = config || null;
    let price = null;
    return {
      get config() {
        if (!cfg) {
          // entre um evento e outro a configuração não muda: normaliza uma vez só (os tiques são frequentes)
          const raw = getConfig();
          if (raw !== rawSeen || !normSeen) {
            rawSeen = raw;
            normSeen = seen(raw);
          }
          cfg = normSeen;
        }
        return cfg;
      },
      get price() {
        if (price == null) price = priceOf(this.config);
        return price;
      },
      step: getStep() || mem.step || 'formato',
      rules: rulesFn,
      now: now(),
    };
  }

  /* ───────── estados da mascote ───────── */
  function rest() {
    if (speaking || destroyed) return;
    if (presence === 'dormindo') avatar.set('dormindo');
    else avatar.set('parada');
  }

  function flash(state, ms) {
    if (speaking) return;
    clearTimeout(stateTimer);
    avatar.set(state);
    stateTimer = setTimeout(rest, ms);
  }

  function stopMouth() {
    cancelAnimationFrame(mouthRaf);
    mouthRaf = 0;
    avatar.mouth(0);
  }

  /** A boca acompanha o volume da voz; sem medidor (ou sem som), mexe por tempo, em sílabas. */
  function runMouth(useLevel) {
    cancelAnimationFrame(mouthRaf);
    if (reduceMotion) {
      avatar.mouth(0.55);
      return;
    }
    const t0 = now();
    let last = 0;
    let smooth = 0;
    let silent = 0;
    const frame = () => {
      if (!speaking) return;
      const t = now() - t0;
      if (t - last >= 33) {
        const dt = t - last;
        last = t;
        let v = null;
        if (useLevel && typeof audio?.voice?.level === 'function') {
          v = Number(audio.voice.level()) || 0;
          silent = v < 0.02 ? silent + dt : 0;
          if (silent > 600) v = null; // medidor mudo: cai no movimento por tempo
          else v = Math.min(1, v * 1.2);
        }
        if (v == null) v = 0.2 + 0.8 * Math.abs(Math.sin(t * 0.021)) * (0.45 + 0.55 * Math.abs(Math.sin(t * 0.0067 + 1.3)));
        smooth += (v - smooth) * 0.55;
        avatar.mouth(smooth);
      }
      mouthRaf = requestAnimationFrame(frame);
    };
    mouthRaf = requestAnimationFrame(frame);
  }

  /* ───────── falar ───────── */
  const clipOf = (id) => (id && manifest?.falas?.[id]) || null;
  const urlOf = (clip) => `${voiceBase}${clip.arquivo}${clip.p || clip.h ? `?v=${clip.p || clip.h}` : ''}`; // p muda quando a voz ou a pronúncia mudam: o clipe antigo não fica preso no aparelho
  // o balão fica o tempo de ler; com botão de sugestão ou com a nota, fica bem mais (a pessoa pode fechar)
  const holdFor = (d) => (d.stars ? 18000 : d.actions?.length ? 14000 : 2600 + Math.min(5200, (d.text || '').length * 42));

  function endSpeech(seq, d) {
    if (seq !== speakSeq || !speaking) return;
    speaking = false;
    stopMouth();
    ui.setTalking(false);
    mem.busyUntil = Math.min(mem.busyUntil, now() + 300);
    const glow = AFTERGLOW[d.mood];
    clearTimeout(stateTimer);
    if (glow && presence !== 'dormindo') {
      avatar.set(glow);
      stateTimer = setTimeout(rest, glow === 'comemorando' ? 1500 : 1200);
    } else rest();
    ui.hold(holdFor(d));
  }

  function speak(d, { silent = false, replay = false } = {}) {
    if (!d || destroyed || !enabled) return;
    const seq = ++speakSeq;
    if (speaking) {
      try {
        audio?.voice?.stop?.();
      } catch {
        // tocador indisponível: segue só com o balão
      }
    }
    clearTimeout(stateTimer);
    clearTimeout(afterTimer);
    current = d;
    ui.show(d, { hold: 0, quiet: replay });
    speaking = true;
    ui.setTalking(true);
    avatar.set('falando', { mood: d.mood });
    avatar.look(0, 0.15); // falando, ela olha para a pessoa
    const clip = clipOf(d.id);
    const withVoice = !silent && voiceOn && mem.mode !== 'muda' && clip && typeof audio?.voice?.play === 'function';
    const est = clip ? clip.dur * 1000 : 500 + (d.speech || d.text || '').length * 62;
    const finish = () => {
      ui.layout(); // volta a olhar para o bolo
      endSpeech(seq, d);
    };
    if (!withVoice) {
      // sem voz: a boca mexe um instante, o balão fica
      runMouth(false);
      afterTimer = setTimeout(finish, Math.min(est, silent ? 900 : 2200));
      return;
    }
    let started = false;
    runMouth(true);
    afterTimer = setTimeout(finish, est + 2500); // rede: se o fim nunca chegar, ela não fica de boca aberta
    try {
      const p = audio.voice.play(urlOf(clip), {
        text: d.speech || d.text,
        onStart: () => {
          started = true;
        },
        onEnd: () => {
          clearTimeout(afterTimer);
          finish();
        },
      });
      Promise.resolve(p).then(
        () => {
          clearTimeout(afterTimer);
          finish();
        },
        () => {
          // o clipe falhou (rede, som bloqueado): segue só com o balão
          clearTimeout(afterTimer);
          if (seq !== speakSeq) return;
          if (started) finish();
          else afterTimer = setTimeout(finish, Math.min(est, 2200));
        },
      );
    } catch {
      clearTimeout(afterTimer);
      afterTimer = setTimeout(finish, Math.min(est, 2200));
    }
  }

  function preload(ids) {
    if (!manifest || !voiceOn || mem.mode === 'muda' || !audio?.voice) return;
    ids.forEach((id) => {
      const clip = clipOf(id);
      if (!clip || preloaded.has(id)) return;
      preloaded.add(id);
      const url = urlOf(clip);
      if (typeof audio.voice.preload === 'function') audio.voice.preload(url);
      else fetch(url).catch(() => {});
    });
  }

  /* ───────── eventos ───────── */
  function handle(type, detail = {}) {
    if (destroyed) return;
    // o que ela não acompanha (marcas de som, eventos do jogo, as próprias ações) e o meio de um gesto: nem olha
    if (!brain.EVENTS.has(type) || (type === 'gesture' && detail?.phase === 'move')) return;
    if (!enabled) {
      // a tela cala a Bô durante a revelação do bolo: o fim dela fica guardado para quando ela voltar
      if (type === 'reveal' && detail?.phase === 'end' && !detail.skipped) heldEnd = now();
      return;
    }
    if (type === 'open') {
      if (opened) return;
      opened = true;
    }
    const at = now();
    rawSeen = null; // algo aconteceu na tela: a configuração pode ter mudado (mesmo que o objeto seja o mesmo)
    const c = ctx(detail.config ? seen(detail.config) : null);
    const d = brain.react({ ...detail, type, at }, c, mem);
    if (type === 'open') save({ seen: true });
    if (type === 'step') ui.setHot(detail.id === 'resumo' ? 'nota' : null);
    if (d) speak(d);
    else if (!speaking && (type === 'change' || type === 'step' || type === 'tool')) {
      // ela repara no que aconteceu (e já vai baixando a fala que deve vir)
      flash(mem.pending ? 'ouvindo' : 'parada', 700);
      preload(brain.predict(c, mem));
    }
  }

  const offBus = bus?.on ? bus.on('*', (detail, type) => handle(type, detail)) : () => {};

  // se a tela não avisou a abertura (a Bô entrou depois), ela mesma se apresenta
  const greetTimer = setTimeout(() => greet && !opened && handle('open', { source }), 1200);

  const tick = setInterval(() => {
    if (destroyed || !enabled || document.hidden) return;
    const at = now();
    const c = ctx();
    const d = brain.react({ type: 'tick', at }, c, mem);
    if (d) speak(d);
    const p = brain.presenceOf(mem, at);
    if (p !== presence) {
      presence = p;
      ui.setPresence(p);
      rest();
    }
    ui.dot(mem.mode === 'muda' && Boolean(mem.missed));
    if (!speaking && !d && mem.pending && at - mem.pending.at > 1400 && avatar.state !== 'pensando') flash('pensando', 1600);
  }, 400);

  /* ───────── ações ───────── */
  function runAction(i) {
    const a = current?.actions?.[i];
    if (!a) return;
    audio?.unlock?.();
    if (a.ask) {
      ask(a.ask);
      return;
    }
    ui.hide();
    const action = { label: a.label, patch: a.patch || null, step: a.step || null };
    try {
      onAction?.(action);
    } catch (err) {
      console.error('[bo] a tela não conseguiu aplicar a sugestão:', err);
    }
    bus?.emit?.('bo.action', action);
    if (action.patch) {
      mem.selfUntil = now() + 1800;
      setTimeout(() => {
        if (destroyed || !enabled) return;
        const d = brain.afterAction(ctx(), mem, now());
        if (d) speak(d);
      }, 380);
    }
  }

  function askContext(chip, extra) {
    const c = ctx();
    return {
      kind: 'atalho',
      chip,
      text: extra?.text || null,
      config: c.config,
      step: c.step,
      price: c.price,
      score: brain.scoreOf(c.config),
      findings: brain.findingsOf(c.config).issues.map((x) => ({ code: x.code, text: x.text })),
      recent: mem.log.slice(-6).map((l) => ({ id: l.id, text: LINES[l.id]?.text })),
      lineIds: Object.keys(POOLS),
    };
  }

  function fromRemote(r) {
    if (!r || typeof r.text !== 'string' || !r.text.trim()) return null;
    const id = r.lineId && LINES[r.lineId] ? r.lineId : null;
    const action = r.action && typeof r.action === 'object' && r.action.label ? { label: String(r.action.label), patch: r.action.patch || null, step: r.action.step || null } : null;
    return { id, group: id ? LINES[id].group : 'remoto', text: r.text.trim().slice(0, 400), speech: id ? LINES[id].text : r.text, mood: r.mood || (id ? LINES[id].mood : 'neutra'), priority: 4, why: 'resposta do servidor', action, actions: action ? [action] : [], force: true, stars: null };
  }

  /**
   * Pergunta à Bô. `question` = id de um atalho ('combina', 'sabor', 'decoracao', 'pessoas', 'economizar',
   * 'surpresa', 'falta', 'nota') ou { chip, text }. Hoje responde pelas regras locais; com `remote`, o servidor
   * responde primeiro. Devolve a decisão ({ id, text, mood, action… }).
   */
  async function ask(question) {
    if (destroyed || !enabled) return null;
    const chip = typeof question === 'string' ? question : question?.chip || 'livre';
    audio?.unlock?.();
    ui.closePanel();
    if (!speaking) {
      clearTimeout(stateTimer);
      avatar.set('pensando');
    }
    let d = null;
    if (typeof remote === 'function') {
      try {
        d = fromRemote(await Promise.race([remote(askContext(chip, question)), new Promise((res) => setTimeout(() => res(null), 2500))]));
      } catch {
        d = null;
      }
    } else await new Promise((res) => setTimeout(res, reduceMotion ? 0 : 420)); // um instante "pensando"
    if (destroyed || !enabled) return null;
    if (!d) d = brain.answer(chip, ctx(), mem);
    else {
      mem.said[d.id || `remoto:${now()}`] = now();
      mem.lastStart = now();
      mem.busyUntil = now() + 3500;
    }
    if (d) speak(d, { silent: mem.mode === 'muda' });
    else rest();
    return d;
  }

  function say(what, opts = {}) {
    if (destroyed || !enabled) return null;
    let d = null;
    if (typeof what === 'string' && (LINES[what] || POOLS[what])) d = brain.lineDecision(what, ctx(), mem, { now: now(), vars: opts.vars });
    else {
      const text = typeof what === 'string' ? what : what?.text;
      if (!text) return null;
      d = { id: null, group: 'livre', text: String(text), speech: String(text), mood: what?.mood || opts.mood || 'neutra', priority: 4, why: 'fala avulsa', action: what?.action || null, actions: what?.action ? [what.action] : [], force: true, stars: null };
      mem.lastStart = now();
      mem.busyUntil = now() + 500 + d.text.length * 62;
    }
    if (d) speak(d, { silent: opts.silent });
    return d;
  }

  function nudge() {
    if (destroyed || !enabled) return null;
    const d = brain.react({ type: 'nudge', at: now() }, ctx(), mem);
    if (d) speak(d);
    return d;
  }

  function setMode(m) {
    if (!brain.MODES.includes(m)) return;
    mem.mode = m;
    save({ mode: m });
    ui.setMode(m);
    if (m === 'muda') {
      try {
        audio?.voice?.stop?.();
      } catch {
        // sem tocador
      }
    } else {
      mem.missed = null;
      ui.dot(false);
    }
  }

  function setVoice(on) {
    voiceOn = Boolean(on);
    save({ voice: voiceOn });
    ui.setVoice(voiceOn);
    if (!voiceOn) {
      try {
        audio?.voice?.stop?.();
      } catch {
        // sem tocador
      }
    } else audio?.unlock?.();
  }

  function setEnabled(on) {
    enabled = Boolean(on);
    ui.setVisible(enabled);
    if (!enabled) {
      speakSeq++;
      speaking = false;
      stopMouth();
      clearTimeout(afterTimer);
      ui.hide();
      ui.closePanel();
      try {
        audio?.voice?.stop?.();
      } catch {
        // sem tocador
      }
    } else {
      rest();
      // voltou logo depois da revelação do bolo: ela fecha o momento (uma fala, se o ritmo deixar)
      if (heldEnd && now() - heldEnd < 8000) setTimeout(() => !destroyed && enabled && handle('reveal', { phase: 'end' }), 500);
      heldEnd = 0;
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    offBus();
    clearInterval(tick);
    clearTimeout(greetTimer);
    clearTimeout(stateTimer);
    clearTimeout(afterTimer);
    cancelAnimationFrame(mouthRaf);
    ui.destroy();
  }

  return {
    say,
    ask,
    nudge,
    setEnabled,
    destroy,
    setMode,
    setVoice,
    /** Liga as regras do confeiteiro (rulesOf de js/customizer/rules.js) depois de criada. */
    setRules(fn) {
      rulesFn = typeof fn === 'function' ? fn : null;
    },
    /** Nota da Bô para um bolo (o atual, se não vier nenhum): { sabor, visual, equilibrio, media, estrelas, frase, sugestao }. */
    score(config) {
      return brain.scoreOf(config || getConfig());
    },
    get mode() {
      return mem.mode;
    },
    get voice() {
      return voiceOn;
    },
    get enabled() {
      return enabled;
    },
    /** Para a bancada e para testes: a memória da sessão e a interface. */
    memory: mem,
    ui,
  };
}

export { applyPatch, scoreOf, CHIPS } from './brain.js';
