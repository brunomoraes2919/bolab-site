// BOLAB — Ateliê: preferências de som (volumes, mudos, trilha e vibração), lembradas no aparelho.
// Ficam em prefs ('atelierAudio'), junto com as outras preferências da loja (js/store.js).
//
//   settings.music            → 0 a 1          settings.music = 0.3
//   settings.mute.music       → true/false     settings.mute.music = true
//   settings.theme            → 'bossa' | 'caixinha' | 'lofi'
//   settings.haptics          → vibração no celular (true/false)
//   settings.set({ sfx: 0.5, mute: { master: true } })     várias de uma vez
//   settings.on((s, what) => …)                            avisa a cada mudança; devolve a função que cancela
//   settings.audible('music') → o canal está soando? (volume > 0 e nada mudo)
import { prefs } from '../store.js';
import { THEMES, DEFAULT_THEME } from './audio-theory.js';

export const PREFS_KEY = 'atelierAudio';
export const CHANNELS = ['master', 'music', 'sfx', 'voice'];

/** De fábrica: efeitos e voz ligados, música ligada em volume baixo. */
export const DEFAULTS = Object.freeze({
  v: 1,
  master: 1,
  music: 0.4,
  sfx: 0.8,
  voice: 1,
  mute: Object.freeze({ master: false, music: false, sfx: false, voice: false }),
  theme: DEFAULT_THEME,
  haptics: true,
});

const clamp01 = (v, fallback) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
};

/** Qualquer coisa guardada (ou nada) vira um conjunto válido de preferências. */
export function sanitize(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const mute = src.mute && typeof src.mute === 'object' ? src.mute : {};
  const out = { v: 1, mute: {} };
  for (const ch of CHANNELS) {
    out[ch] = clamp01(src[ch], DEFAULTS[ch]);
    out.mute[ch] = typeof mute[ch] === 'boolean' ? mute[ch] : DEFAULTS.mute[ch];
  }
  out.theme = typeof src.theme === 'string' && THEMES[src.theme] ? src.theme : DEFAULTS.theme;
  out.haptics = typeof src.haptics === 'boolean' ? src.haptics : DEFAULTS.haptics;
  return out;
}

let state = sanitize(prefs.get(PREFS_KEY));
const subs = new Set();

function commit(what) {
  prefs.set(PREFS_KEY, settings.snapshot());
  for (const fn of [...subs]) {
    try {
      fn(settings, what);
    } catch (err) {
      console.error('[atelie] ouvinte das preferências de som falhou:', err);
    }
  }
}

const mute = {};
for (const ch of CHANNELS) {
  Object.defineProperty(mute, ch, {
    enumerable: true,
    get: () => state.mute[ch],
    set: (v) => {
      if (state.mute[ch] === !!v) return;
      state.mute[ch] = !!v;
      commit(`mute.${ch}`);
    },
  });
}

export const settings = {
  mute,
  get theme() {
    return state.theme;
  },
  set theme(id) {
    if (!THEMES[id] || id === state.theme) return;
    state.theme = id;
    commit('theme');
  },
  get haptics() {
    return state.haptics;
  },
  set haptics(v) {
    if (state.haptics === !!v) return;
    state.haptics = !!v;
    commit('haptics');
  },
  /** Muda várias preferências de uma vez (uma gravação, um aviso). */
  set(patch = {}) {
    const next = sanitize({ ...settings.snapshot(), ...patch, mute: { ...state.mute, ...(patch.mute || {}) } });
    if (JSON.stringify(next) === JSON.stringify(state)) return;
    state = next;
    commit('set');
  },
  toggleMute(ch = 'master') {
    if (CHANNELS.includes(ch)) mute[ch] = !state.mute[ch];
    return state.mute[ch];
  },
  /** O canal está soando? (o mudo geral e o volume geral valem para todos) */
  audible(ch) {
    if (state.mute.master || state.master <= 0) return false;
    return ch === 'master' ? true : !state.mute[ch] && state[ch] > 0;
  },
  on(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
  },
  snapshot() {
    return { ...state, mute: { ...state.mute } };
  },
  reset() {
    state = sanitize(null);
    commit('reset');
  },
  /** Relê do aparelho (só para testes). */
  reload() {
    state = sanitize(prefs.get(PREFS_KEY));
  },
};

for (const ch of CHANNELS) {
  Object.defineProperty(settings, ch, {
    enumerable: true,
    get: () => state[ch],
    set: (v) => {
      const n = clamp01(v, state[ch]);
      if (n === state[ch]) return;
      state[ch] = n;
      commit(ch);
    },
  });
}
