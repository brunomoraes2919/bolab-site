// BOLAB — Ateliê: o som do personalizador (efeitos, música de fundo adaptativa e a voz da assistente).
//
//   import { audio } from './atelier/audio.js';
//
//   audio.unlock()                       chamar dentro de um gesto (toque, clique, tecla). Pode chamar quantas vezes quiser.
//   audio.ready                          true depois do desbloqueio
//   audio.sfx('plop', { gain, pitch, pan, delay })      efeito por nome (audio.sfxNames); nunca lança erro
//         opções extras: dur (segundos, nos efeitos contínuos), count/interval ('pipe-run'), degree (efeitos musicais),
//         loop: true (repete até handle.stop()). Devolve { played, end, stop({ fade }) }.
//   audio.music.start() · audio.music.stop({ fade }) · audio.music.setScene('cobertura') · audio.music.setTheme('lofi')
//   audio.music.themes                   [{ id, name }]
//   audio.voice.play(url, { text, onStart, onEnd, priority, interrupt, chime }) → Promise<{ played, reason }>
//   audio.voice.stop() · audio.voice.speaking · audio.voice.level() (0–1, para a boca da mascote) · audio.voice.preload(url)
//   audio.voice.duck(true|false)         abaixa/devolve a música para uma voz que não passa por aqui (fala do navegador)
//   audio.settings                       volumes 0–1 (master, music, sfx, voice), mute por canal, theme, haptics → prefs 'atelierAudio'
//   audio.bind(bus)                      liga o som aos eventos do personalizador; devolve a função que desliga
//   audio.suspend() · audio.resume()     a tela chama ao sair/voltar (app em segundo plano = silêncio, automático)
//   audio.dispose()
//
// Nada toca antes de um gesto da pessoa (regra dos navegadores): até lá as chamadas são ignoradas
// em silêncio, e a música pedida começa sozinha no primeiro toque. Onde não existe Web Audio, tudo
// vira "não faz nada". Tudo é sintetizado: nenhum arquivo de áudio é baixado para efeitos e música.
//
// Peças: audio-graph.js (mesa de som, limitador, reverb) · audio-sfx.js (receitas dos efeitos) ·
// audio-music.js + audio-theory.js (trilha generativa) · audio-banks.js (notas prontas) ·
// audio-map.js (evento → efeito) · audio-settings.js (preferências) · audio-ui.js (controle de som)
// · haptics.js (vibração). Bancada de testes: lab/audio.html; medições: tools/audio_check.mjs e
// tools/audio_live.mjs.
import { settings } from './audio-settings.js';
import { buildGraph, voiceGain } from './audio-graph.js';
import { playSfx, hasSfx, sfxInfo, SFX_NAMES, SFX_LIST } from './audio-sfx.js';
import { createMusic } from './audio-music.js';
import { THEME_LIST, SCENES } from './audio-theory.js';
import { createRouter, cueSound } from './audio-map.js';

const hasWindow = typeof window !== 'undefined';
const AC = hasWindow ? window.AudioContext || window.webkitAudioContext : null;
const NOOP = Object.freeze({ played: false, end: 0, stop() {} });
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'mousedown', 'keydown', 'click'];
const VOICE_QUEUE = 2; // quantos clipes esperam a vez (o mais antigo sai quando chega outro)
const VOICE_CACHE = 16;

let ctx = null;
let g = null;
let music = null;
let unlocked = false; // o contexto já tocou pelo menos uma vez
let kickAt = -1e9; // instante do último pedido de desbloqueio feito dentro de um gesto
let wantMusic = false;
let scene = 'formato';
let armed = false;
let watching = false;
let quietTimer = 0;
let warned = false;
const holds = new Set(); // motivos de silêncio: 'hidden' (aba/app em segundo plano) · 'screen' (a tela saiu) · 'muted' (som desligado)
const loops = new Set();
const recent = new Map();
let offSettings = null;
let meterNode = null;
let meterBuf = null;

const nowMs = () => (hasWindow && window.performance ? performance.now() : Date.now());
function warn(err) {
  if (warned) return;
  warned = true;
  console.warn('[atelie] som:', err);
}

/* ───────── Desbloqueio e ciclo de vida ───────── */

function onGesture() {
  unlock();
}
function arm() {
  if (armed || !AC) return;
  armed = true;
  for (const type of GESTURES) window.addEventListener(type, onGesture, { capture: true, passive: true });
}
function disarm() {
  if (!armed) return;
  armed = false;
  for (const type of GESTURES) window.removeEventListener(type, onGesture, { capture: true });
}

function onVisibility() {
  if (document.visibilityState === 'hidden') hold('hidden');
  else release('hidden');
}
const onHide = () => hold('hidden');
const onShow = () => {
  if (document.visibilityState !== 'hidden') release('hidden');
};
function watch() {
  if (watching || !hasWindow) return;
  watching = true;
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onHide);
  window.addEventListener('pageshow', onShow);
  document.addEventListener('freeze', onHide);
  document.addEventListener('resume', onShow);
  offSettings = settings.on(applySettings);
  if (document.visibilityState === 'hidden') holds.add('hidden');
  if (settings.mute.master) holds.add('muted');
}
function unwatch() {
  if (!watching) return;
  watching = false;
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('pagehide', onHide);
  window.removeEventListener('pageshow', onShow);
  document.removeEventListener('freeze', onHide);
  document.removeEventListener('resume', onShow);
  offSettings?.();
  offSettings = null;
}

function create() {
  try {
    ctx = new AC({ latencyHint: 'interactive' });
  } catch (err) {
    warn(err);
    ctx = null;
    return false;
  }
  // celular (tela de toque ou poucos núcleos): reverb mais leve
  const lite = (hasWindow && window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || (navigator.hardwareConcurrency || 8) <= 4;
  g = buildGraph(ctx, { lazy: true, lite });
  music = createMusic(g);
  // um pouco depois, com calma (uma coisa por vez): texturas (confeito, palmas, faísca) e as notas
  // dos efeitos musicais, para o primeiro uso de cada um não custar nada
  setTimeout(() => {
    if (!g) return;
    g.warm();
    g.banks.mallet.warm(60, 93);
    g.banks.box.warm(69, 100);
  }, 900);
  music.setTheme(settings.theme);
  music.setScene(scene);
  applyLevels(0);
  if (holds.size) g.gate.gain.value = 0;
  ctx.onstatechange = onState;
  try {
    // iPhone (iOS 17+): som "ambiente" — respeita a chave de silêncio e não corta a música que a pessoa já ouve
    if (navigator.audioSession) navigator.audioSession.type = 'ambient';
  } catch {
    // sem essa API: segue o padrão do aparelho
  }
  return true;
}

function onState() {
  if (!ctx) return;
  if (ctx.state === 'running') {
    if (!unlocked) {
      unlocked = true;
      disarm();
    }
    if (holds.size) goQuiet();
    else wake();
  } else if (unlocked && !holds.size) {
    arm(); // o sistema pausou o som (ligação, troca de fone): volta no próximo toque
  }
}

/** Dentro de um gesto: cria (na primeira vez) e acorda o contexto de áudio. Seguro chamar várias vezes. */
function unlock() {
  if (!AC) return false;
  watch();
  holds.delete('screen');
  if (!ctx) {
    const ua = navigator.userActivation;
    if (ua && !ua.hasBeenActive) {
      arm(); // ainda não houve gesto nesta página: espera o primeiro, sem nem criar o contexto
      return false;
    }
    if (!create()) return false;
  }
  if (holds.size) return unlocked; // em segundo plano ou com o som desligado: fica quieto
  if (ctx.state !== 'running') {
    kickAt = nowMs();
    try {
      const p = ctx.resume();
      if (p && p.then) p.then(onState, () => {});
      // iPhone antigo só libera o som depois de tocar alguma coisa dentro do gesto: um buffer mudo
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      src.connect(ctx.destination);
      src.start(0);
    } catch (err) {
      warn(err);
    }
    if (!unlocked) arm();
  }
  onState();
  if (unlocked) wake();
  return unlocked;
}

function hold(reason) {
  if (holds.has(reason)) return;
  holds.add(reason);
  if (holds.size === 1) goQuiet();
}
function release(reason) {
  if (!holds.delete(reason)) return;
  if (!holds.size) wake();
}

/** Silêncio: some com tudo em ~80 ms e adormece o contexto (não gasta bateria em segundo plano). */
function goQuiet() {
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    g.gate.gain.cancelScheduledValues(t);
    g.gate.gain.setTargetAtTime(0, t, 0.02);
    voice.stop({ fade: 0.06 });
    stopLoops(0.06);
    music.stop({ fade: 0.08 });
  } catch (err) {
    warn(err);
  }
  clearTimeout(quietTimer);
  quietTimer = setTimeout(() => {
    if (holds.size && ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
  }, 140);
}

function wake() {
  if (!ctx || holds.size) return;
  clearTimeout(quietTimer);
  const up = () => {
    if (!ctx || holds.size || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    g.gate.gain.cancelScheduledValues(t);
    g.gate.gain.setTargetAtTime(1, t, 0.04);
    sync();
  };
  if (ctx.state === 'running') return void up();
  if (!unlocked) return void arm();
  try {
    const p = ctx.resume();
    if (p && p.then) p.then(up, () => arm());
  } catch {
    arm();
  }
  // se o navegador não deixar acordar sozinho (iPhone depois de uma ligação), acorda no próximo toque
  setTimeout(() => {
    if (ctx && !holds.size && ctx.state !== 'running') arm();
  }, 400);
}

/** Deixa a música de acordo com o que foi pedido e com o que é permitido agora. */
function sync() {
  if (!ctx || !music) return;
  const should = unlocked && !holds.size && ctx.state === 'running' && wantMusic && settings.audible('music');
  if (should && !music.playing) music.start({ fade: 0.8 });
  else if (!should && music.playing) music.stop({ fade: 0.35 });
}

function applyLevels(ramp = 0.04) {
  if (!g) return;
  const lv = (ch) => (settings.mute[ch] ? 0 : settings[ch]);
  g.setLevel('master', lv('master'), 1, ramp);
  g.setLevel('music', lv('music'), 1, ramp);
  g.setLevel('sfx', lv('sfx'), 1, ramp);
  g.setLevel('voice', lv('voice'), 1, ramp);
}

function applySettings() {
  applyLevels();
  if (music && music.theme !== settings.theme) music.setTheme(settings.theme);
  if (!settings.audible('voice')) voice.stop();
  if (!settings.audible('sfx')) stopLoops();
  if (settings.mute.master) hold('muted');
  else release('muted');
  sync();
}

/** Pode tocar neste canal agora? (vale também no instante do primeiro gesto, enquanto o contexto acorda) */
function canPlay(channel) {
  if (!ctx || holds.size || !settings.audible(channel)) return false;
  if (ctx.state === 'running') return unlocked;
  return nowMs() - kickAt < 1500 && ctx.state !== 'closed';
}

/* ───────── Efeitos ───────── */

function stopLoops(fade = 0.12) {
  for (const loop of [...loops]) loop.stop({ fade });
}

function startLoop(name, o) {
  const every = sfxInfo(name).loop;
  const max = Math.max(1, Math.min(60, +o.max || 30));
  const t0 = ctx.currentTime;
  const handles = [];
  let next = t0 + 0.005 + Math.max(0, +o.delay || 0);
  let timer = 0;
  const loop = {
    played: true,
    name,
    end: t0 + max,
    stop({ fade = 0.15 } = {}) {
      clearTimeout(timer);
      loops.delete(loop);
      for (const h of handles) h.stop(fade);
      handles.length = 0;
    },
  };
  const spin = () => {
    if (!loops.has(loop)) return;
    const now = ctx.currentTime;
    if (now - t0 > max || !canPlay('sfx')) return void loop.stop();
    while (next < now + 0.3) {
      const h = playSfx(g, name, next, { ...o, loop: false, delay: 0 });
      if (h) handles.push(h);
      next += every;
    }
    while (handles.length && handles[0].end < now) handles.shift();
    timer = setTimeout(spin, 100);
  };
  loops.add(loop);
  spin();
  return loop;
}

/** Toca um efeito pelo nome. Nunca lança erro; se não puder tocar, devolve um "nada" com stop() inofensivo. */
function sfx(name, opts) {
  try {
    if (!hasSfx(name) || !canPlay('sfx')) return NOOP;
    const o = opts && typeof opts === 'object' ? opts : {};
    const now = ctx.currentTime;
    const delay = Math.max(0, +o.delay || 0);
    // o mesmo efeito duas vezes no mesmo instante vira um só (evita metralhadora)
    const key = `${name}@${delay.toFixed(2)}`;
    const stamp = nowMs();
    if (stamp - (recent.get(key) ?? -1e9) < 28) return NOOP;
    recent.set(key, stamp);
    if (o.loop && sfxInfo(name).loop) return startLoop(name, o);
    const h = playSfx(g, name, now + 0.004 + delay, o);
    if (!h) return NOOP;
    return { played: true, name, end: h.end, stop: ({ fade = 0.06 } = {}) => h.stop(fade) };
  } catch (err) {
    warn(err);
    return NOOP;
  }
}

/* ───────── Voz da assistente ───────── */

const clips = new Map(); // url → Promise<{ buffer, gain }>
const voiceQueue = [];
let cur = null; // clipe em andamento (ou carregando)
let levelEnv = 0;
let levelBuf = null;
let outsideVoice = false; // uma voz que não passa por aqui está falando (ver voice.duck)

function decode(bytes) {
  return new Promise((resolve, reject) => {
    const p = ctx.decodeAudioData(bytes, resolve, reject);
    if (p && p.then) p.then(resolve, reject);
  });
}

function loadClip(url) {
  if (clips.has(url)) {
    const hit = clips.get(url);
    clips.delete(url);
    clips.set(url, hit); // usado agora: vai para o fim da fila de descarte
    return hit;
  }
  const job = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`voz: ${url} respondeu ${r.status}`);
      return r.arrayBuffer();
    })
    .then((bytes) => decode(bytes))
    .then((buffer) => ({ buffer, gain: voiceGain(buffer) }));
  job.catch(() => clips.delete(url));
  clips.set(url, job);
  while (clips.size > VOICE_CACHE) clips.delete(clips.keys().next().value);
  return job;
}

function settle(item, result) {
  if (item.done) return;
  item.done = true;
  clearTimeout(item.timer);
  if (item.started) {
    try {
      item.onEnd?.(result);
    } catch (err) {
      console.error('[atelie] onEnd da voz falhou:', err);
    }
  }
  item.resolve(result);
}

function voiceNext() {
  if (cur) return;
  const item = voiceQueue.shift();
  if (!item) {
    if (g && g.ducked && !outsideVoice) g.setDuck(false);
    return;
  }
  cur = item;
  loadClip(item.url).then(
    ({ buffer, gain }) => {
      if (cur !== item || item.done) return;
      if (!canPlay('voice')) return voiceEnd(item, { played: false, reason: 'muted' });
      const lead = item.chime ? 0.3 : 0.03;
      if (item.chime) sfx('hint');
      const t = ctx.currentTime + lead;
      const src = ctx.createBufferSource();
      const amp = ctx.createGain();
      src.buffer = buffer;
      const level = gain * Math.max(0, Math.min(2, item.gain == null ? 1 : +item.gain || 0));
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(level, t + 0.012);
      src.connect(amp).connect(g.voice.in);
      src.start(t);
      g.setDuck(true, ctx.currentTime);
      item.src = src;
      item.amp = amp;
      item.started = true;
      item.duration = buffer.duration;
      src.onended = () => voiceEnd(item, { played: true, reason: 'ended', duration: buffer.duration });
      // rede de segurança: se o navegador não avisar o fim, o clipe termina pelo relógio
      item.timer = setTimeout(() => voiceEnd(item, { played: true, reason: 'ended', duration: buffer.duration }), (lead + buffer.duration + 0.6) * 1000);
      try {
        item.onStart?.({ url: item.url, text: item.text, duration: buffer.duration });
      } catch (err) {
        console.error('[atelie] onStart da voz falhou:', err);
      }
    },
    (err) => {
      warn(err);
      voiceEnd(item, { played: false, reason: 'error' });
    },
  );
}

function voiceEnd(item, result) {
  if (item.src) item.src.onended = null;
  settle(item, result);
  if (cur === item) {
    cur = null;
    voiceNext();
  }
}

/** Corta o clipe em andamento com um fade curto. */
function voiceCut(reason, fade) {
  const item = cur;
  if (!item) return;
  if (item.src && ctx) {
    try {
      const t = ctx.currentTime;
      item.amp.gain.cancelScheduledValues(t);
      item.amp.gain.setTargetAtTime(0, t, Math.max(0.005, fade / 3));
      item.src.stop(t + fade + 0.03);
    } catch {
      // já parou
    }
  }
  voiceEnd(item, { played: false, reason });
}

const voice = {
  /**
   * Toca um clipe (mp3) da assistente. Fila curta: se ela já estiver falando, o clipe espera a vez;
   * com priority maior que a do clipe atual (ou interrupt: true) ele interrompe com fade.
   * A promessa sempre resolve: { played: true, reason: 'ended' } ou { played: false, reason:
   * 'locked' | 'muted' | 'dropped' | 'interrupted' | 'stopped' | 'error' }.
   */
  play(url, o = {}) {
    return new Promise((resolve) => {
      const item = { url: String(url), text: o.text || '', priority: +o.priority || 0, gain: o.gain, chime: !!o.chime, onStart: o.onStart, onEnd: o.onEnd, resolve };
      if (!canPlay('voice')) return resolve({ played: false, reason: !unlocked ? 'locked' : settings.audible('voice') ? 'paused' : 'muted' });
      if (cur && (o.interrupt || item.priority > cur.priority)) {
        while (voiceQueue.length) settle(voiceQueue.shift(), { played: false, reason: 'dropped' });
        voiceQueue.push(item);
        voiceCut('interrupted', 0.14);
        return;
      }
      voiceQueue.push(item);
      while (voiceQueue.length > VOICE_QUEUE) settle(voiceQueue.shift(), { played: false, reason: 'dropped' });
      voiceNext();
    });
  },
  stop({ fade = 0.12 } = {}) {
    while (voiceQueue.length) settle(voiceQueue.shift(), { played: false, reason: 'stopped' });
    voiceCut('stopped', fade);
    if (g && g.ducked && !outsideVoice) g.setDuck(false);
  },
  /**
   * Para uma voz que NÃO passa por este canal (ex.: a fala sintetizada do próprio navegador):
   * duck(true) abaixa a música e os efeitos, duck(false) devolve. Os clipes de play() fazem isso sozinhos.
   */
  duck(on) {
    outsideVoice = !!on;
    if (g) g.setDuck(outsideVoice || voice.speaking);
  },
  /** Baixa e prepara um clipe antes da hora (só depois do desbloqueio). */
  preload(url) {
    if (!ctx) return Promise.resolve(false);
    return loadClip(String(url)).then(
      () => true,
      () => false,
    );
  },
  get speaking() {
    return !!(cur && cur.started && !cur.done);
  },
  /** O clipe em andamento: { url, text, duration } ou null. */
  get current() {
    return cur && cur.started ? { url: cur.url, text: cur.text, duration: cur.duration } : null;
  },
  /** A voz pode tocar agora? (desbloqueado, com volume e sem mudo) */
  get enabled() {
    return canPlay('voice');
  },
  /** Volume da voz neste instante, de 0 a 1, já suavizado (chame a cada quadro para mexer a boca da mascote). */
  level() {
    if (!g || !voice.speaking) {
      levelEnv *= 0.7;
      return levelEnv < 0.004 ? (levelEnv = 0) : levelEnv;
    }
    const an = g.voice.analyser;
    let rms = 0;
    if (an.getFloatTimeDomainData) {
      if (!levelBuf || levelBuf.length !== an.fftSize) levelBuf = new Float32Array(an.fftSize);
      an.getFloatTimeDomainData(levelBuf);
      for (let i = 0; i < levelBuf.length; i++) rms += levelBuf[i] * levelBuf[i];
      rms = Math.sqrt(rms / levelBuf.length);
    } else {
      if (!levelBuf || levelBuf.length !== an.fftSize) levelBuf = new Uint8Array(an.fftSize);
      an.getByteTimeDomainData(levelBuf);
      for (let i = 0; i < levelBuf.length; i++) rms += ((levelBuf[i] - 128) / 128) ** 2;
      rms = Math.sqrt(rms / levelBuf.length);
    }
    const v = Math.min(1, Math.pow(rms / 0.24, 0.8));
    levelEnv = v > levelEnv ? levelEnv + (v - levelEnv) * 0.6 : levelEnv + (v - levelEnv) * 0.25;
    return levelEnv;
  },
};

/* ───────── Barramento do personalizador ───────── */

/**
 * Liga o som aos eventos do personalizador: cada 'change', 'step', 'tool', 'fit', 'cart', 'open' e
 * 'close' toca o seu efeito (mapa em audio-map.js) e cada 'step' muda a cena da música.
 * Opções: map (trocas no mapa padrão) · music: false (não mexer na cena da música) · cued: () => boolean
 * (r5-tela: a cena do ateliê está ligada — o que ela anima soa pelas marcas 'cue', não no toque).
 * Devolve a função que desliga.
 */
function bind(bus, { map, music: followMusic = true, cued = null } = {}) {
  if (!bus || typeof bus.on !== 'function') return () => {};
  const route = createRouter({ map, cued }); // r5-tela: cued = a cena está ligada? (ver CUED_KEYS em audio-map.js)
  watch();
  if (!unlocked) arm();
  // r5-tela: marcas de som da cena ('cue'). Um som em laço começa em kind 'start' e para no 'stop' de mesmo nome
  // e parte; ao desligar (ou depois de 12 s sem 'stop') ele para sozinho.
  const cueLoops = new Map();
  const playCue = (cue) => {
    const hit = cueSound(cue);
    if (!hit) return;
    if (hit.loop === 'stop') {
      cueLoops.get(hit.key)?.stop({ fade: 0.15 });
      cueLoops.delete(hit.key);
    } else if (hit.loop === 'start') {
      cueLoops.get(hit.key)?.stop({ fade: 0.05 });
      cueLoops.set(hit.key, audio.sfx(hit.name, { ...hit.opts, loop: true, max: 12 }));
    } else audio.sfx(hit.name, hit.opts);
  };
  const off = bus.on('*', (detail, type) => {
    if (followMusic && type === 'step' && detail && SCENES.includes(detail.id)) audio.music.setScene(detail.id);
    if (type === 'cue') playCue(detail);
    for (const hit of route(type, detail || {})) audio.sfx(hit.name, hit.opts);
  });
  return () => {
    off();
    cueLoops.forEach((h) => h.stop({ fade: 0.1 }));
    cueLoops.clear();
  };
}

/* ───────── Interface pública ───────── */

export const audio = {
  unlock,
  /** true depois do desbloqueio (o som já pôde tocar). */
  get ready() {
    return unlocked;
  },
  /** 'unsupported' | 'locked' | 'running' | 'paused' (em silêncio: segundo plano, tela fechada ou som desligado). */
  get state() {
    if (!AC) return 'unsupported';
    if (!unlocked) return 'locked';
    return !holds.size && ctx && ctx.state === 'running' ? 'running' : 'paused';
  },
  get supported() {
    return !!AC;
  },
  sfx,
  sfxNames: SFX_NAMES,
  sfxList: SFX_LIST,
  music: {
    themes: THEME_LIST,
    get theme() {
      return settings.theme;
    },
    get scene() {
      return scene;
    },
    /** A música está de fato soando agora. */
    get playing() {
      return !!(music && music.playing);
    },
    /** Pede a música. Se ainda não houve gesto, ela começa sozinha no primeiro toque. */
    start() {
      wantMusic = true;
      sync();
    },
    stop({ fade = 0.6 } = {}) {
      wantMusic = false;
      try {
        if (music && music.playing) music.stop({ fade });
      } catch (err) {
        warn(err);
      }
    },
    /** Etapa do personalizador: muda instrumentação e intensidade na próxima barra de compasso. */
    setScene(id) {
      if (!SCENES.includes(id)) return;
      scene = id;
      if (music) music.setScene(id);
    },
    /** Troca de trilha (fica lembrada nas preferências). */
    setTheme(id) {
      settings.theme = id;
      if (music && music.theme !== settings.theme) music.setTheme(settings.theme);
    },
  },
  voice,
  settings,
  bind,
  /** A tela saiu: silêncio e contexto adormecido. */
  suspend() {
    if (!AC) return;
    watch();
    hold('screen');
  },
  /** A tela voltou. */
  resume() {
    if (!AC) return;
    release('screen');
  },
  /** Desmonta tudo (o próximo unlock() recomeça do zero). */
  dispose() {
    disarm();
    unwatch();
    clearTimeout(quietTimer);
    try {
      voice.stop({ fade: 0.02 });
      stopLoops(0.02);
      if (music) music.stop({ fade: 0.02 });
      if (ctx) {
        ctx.onstatechange = null;
        if (ctx.state !== 'closed') ctx.close().catch(() => {});
      }
    } catch (err) {
      warn(err);
    }
    ctx = null;
    g = null;
    music = null;
    meterNode = null;
    unlocked = false;
    wantMusic = false;
    holds.clear();
    outsideVoice = false;
    clips.clear();
    recent.clear();
  },
  /** Bancada: volume que está saindo agora ({ rms, peak }, 0–1). Liga um medidor na saída na primeira chamada. */
  meter() {
    if (!g) return { rms: 0, peak: 0 };
    if (!meterNode) {
      meterNode = ctx.createAnalyser();
      meterNode.fftSize = 2048;
      meterBuf = new Float32Array(meterNode.fftSize);
      g.clip.connect(meterNode);
    }
    meterNode.getFloatTimeDomainData(meterBuf);
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < meterBuf.length; i++) {
      const v = meterBuf[i];
      sum += v * v;
      if (v > peak) peak = v;
      else if (-v > peak) peak = -v;
    }
    return { rms: Math.sqrt(sum / meterBuf.length), peak };
  },
  /** Números para a bancada e para os testes. */
  debug() {
    return {
      state: audio.state,
      context: ctx ? ctx.state : 'none',
      time: ctx ? +ctx.currentTime.toFixed(3) : 0,
      sampleRate: ctx ? ctx.sampleRate : 0,
      lite: !!(g && g.lite),
      latency: ctx ? +((ctx.baseLatency || 0) + (ctx.outputLatency || 0)).toFixed(4) : 0,
      holds: [...holds],
      armed,
      wantMusic,
      musicPlaying: !!(music && music.playing),
      theme: settings.theme,
      scene,
      bar: music && music.bar ? { scene: music.bar.scene, section: music.bar.section, chords: music.bar.segments.map((s) => s.chord.name) } : null,
      voices: g ? g.activeVoices() : 0,
      peakVoices: g ? g.peakVoices : 0,
      loops: loops.size,
      speaking: voice.speaking,
      queued: voiceQueue.length,
      ducked: !!(g && g.ducked),
      duck: g ? +g.music.duck.gain.value.toFixed(3) : 1,
      gate: g ? +g.gate.gain.value.toFixed(3) : 1,
    };
  },
};

export default audio;
