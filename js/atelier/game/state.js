// BOLAB — Ateliê, jogo: o que fica guardado no aparelho (encomendas entregues, figurinhas, encomenda em andamento).
//
//   localStorage['bolab:atelie:v1']  — fora do estado da loja (bolab:v1): o jogo nunca toca em carrinho, pedido ou conta.
//
// Tudo o que é lido passa por cleanState, CAMPO A CAMPO: texto no lugar de número, id que não existe, lista gigante
// ou JSON quebrado viram o valor padrão, sem derrubar nada. Com o armazenamento bloqueado (navegação privada, cota
// cheia), o jogo funciona igual e só não lembra na próxima visita.
//
// Módulo puro, fora o createStore (que recebe o armazenamento): roda no Node — tools/tests/jogo.test.mjs.
import { normalizeConfig } from '../../customizer/pricing.js';
import { ORDERS, isDayKey } from './orders.js';
import { STICKERS, emptyStats } from './stickers.js';

export const STORE_KEY = 'bolab:atelie:v1';
export const VERSION = 1;
const MAX_BYTES = 200000;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const int = (v, lo, hi, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
};
const idList = (v, max) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && ID_RE.test(x)))].slice(0, max) : []);

export function emptyState() {
  return {
    v: VERSION,
    intro: false, // já viu a explicação de como se joga
    orders: {}, // por encomenda: { stars: melhor nota 1..3, tries: quantas entregas, day: quando tirou a melhor }
    daily: { last: '', stars: 0, count: 0 }, // última encomenda do dia entregue, a nota dela e em quantos dias já entregou
    flash: { n: 0, best: 0 }, // desafios relâmpago jogados e a melhor nota
    stickers: {}, // figurinha → dia em que ganhou
    fresh: [], // ganhas e ainda não vistas no álbum
    stats: emptyStats(), // contadores das figurinhas de "junte tantos" (nunca aparecem na tela)
    current: null, // encomenda em andamento: { mode, id, day?, seed?, startedAt?, tries, hinted }
    parked: null, // o bolo que estava na bancada quando a encomenda começou (volta no modo livre)
    lines: 0, // rodízio das falas da Bô (para não repetir)
  };
}

/** Versões antigas → a atual. (Ainda só existe a 1; a tabela fica pronta para a próxima.) */
const MIGRATIONS = {
  // 1: (s) => ({ ...s, v: 2, campoNovo: … }),
};
export function migrate(raw) {
  let s = raw;
  for (let guard = 0; guard < 20 && isObj(s) && MIGRATIONS[int(s.v, 0, 999, 0)]; guard++) s = MIGRATIONS[int(s.v, 0, 999, 0)](s);
  return s;
}

function cleanCurrent(raw) {
  if (!isObj(raw)) return null;
  const mode = ['order', 'daily', 'flash'].includes(raw.mode) ? raw.mode : null;
  if (!mode) return null;
  const out = { mode, id: '', tries: int(raw.tries, 0, 9999, 0), hinted: raw.hinted === true };
  if (mode === 'flash') {
    out.id = 'relampago';
    out.seed = int(raw.seed, 0, 1e6, 0);
    out.startedAt = int(raw.startedAt, 0, 8.64e15, 0);
  } else {
    if (!ORDERS.some((o) => o.id === raw.id)) return null;
    out.id = raw.id;
    if (mode === 'daily') {
      if (!isDayKey(raw.day)) return null;
      out.day = raw.day;
    }
  }
  return out;
}

/** Qualquer coisa → um estado completo e válido. Nunca lança erro. */
export function cleanState(input) {
  const s = emptyState();
  let raw = input;
  try {
    raw = migrate(input);
  } catch {
    raw = null;
  }
  if (!isObj(raw)) return s;
  s.intro = raw.intro === true;
  if (isObj(raw.orders)) {
    for (const o of ORDERS) {
      const r = raw.orders[o.id];
      if (!isObj(r)) continue;
      const stars = int(r.stars, 0, 3, 0);
      if (stars < 1) continue;
      s.orders[o.id] = { stars, tries: int(r.tries, 1, 9999, 1), day: isDayKey(r.day) ? r.day : '' };
    }
  }
  if (isObj(raw.daily)) {
    s.daily.last = isDayKey(raw.daily.last) ? raw.daily.last : '';
    s.daily.stars = s.daily.last ? int(raw.daily.stars, 0, 3, 0) : 0;
    s.daily.count = int(raw.daily.count, 0, 99999, 0);
    if (s.daily.last && s.daily.count < 1) s.daily.count = 1;
  }
  if (isObj(raw.flash)) {
    s.flash.n = int(raw.flash.n, 0, 1e6, 0);
    s.flash.best = int(raw.flash.best, 0, 3, 0);
  }
  if (isObj(raw.stickers)) {
    for (const st of STICKERS) {
      const day = raw.stickers[st.id];
      if (day === undefined || day === null || day === false) continue;
      s.stickers[st.id] = isDayKey(day) ? day : '';
    }
  }
  s.fresh = idList(raw.fresh, STICKERS.length).filter((id) => id in s.stickers);
  if (isObj(raw.stats)) {
    s.stats.placed = int(raw.stats.placed, 0, 9999, 0);
    s.stats.undo = int(raw.stats.undo, 0, 9999, 0);
    s.stats.massas = idList(raw.stats.massas, 60);
    s.stats.recheios = idList(raw.stats.recheios, 60);
    s.stats.formas = idList(raw.stats.formas, 20);
  }
  s.current = cleanCurrent(raw.current);
  if (isObj(raw.parked)) {
    try {
      s.parked = normalizeConfig(raw.parked);
    } catch {
      s.parked = null;
    }
  }
  s.lines = int(raw.lines, 0, 1e9, 0);
  return s;
}

/** Texto guardado → estado. JSON quebrado ou grande demais = começa do zero. */
export function parseState(text) {
  if (typeof text !== 'string' || !text || text.length > MAX_BYTES) return emptyState();
  try {
    return cleanState(JSON.parse(text));
  } catch {
    return emptyState();
  }
}

function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null; // o navegador barrou até olhar para o armazenamento
  }
}

/**
 * O estado do jogo com leitura e gravação seguras.
 *   const store = createStore();          store.state (objeto vivo) · store.save() · store.reset() · store.persisted
 * `storage` troca o localStorage (testes); null = só na memória.
 */
export function createStore({ storage = defaultStorage(), key = STORE_KEY } = {}) {
  let persisted = Boolean(storage);
  let state = emptyState();
  if (storage) {
    try {
      state = parseState(storage.getItem(key));
    } catch {
      persisted = false;
    }
  }
  const api = {
    get state() {
      return state;
    },
    /** false quando o aparelho não deixa guardar (o jogo segue, só não lembra depois). */
    get persisted() {
      return persisted;
    },
    save() {
      if (!storage) return false;
      try {
        storage.setItem(key, JSON.stringify(state));
        persisted = true;
      } catch {
        persisted = false;
      }
      return persisted;
    },
    reset() {
      state = emptyState();
      if (storage) {
        try {
          storage.removeItem(key);
        } catch {
          persisted = false;
        }
      }
      return state;
    },
  };
  return api;
}

/** O resumo do caderno que as figurinhas de encomenda consultam. */
export function gameSummary(state) {
  const done = (o) => state.orders[o.id]?.stars || 0;
  return {
    dailyCount: state.daily.count,
    delivered: ORDERS.filter((o) => done(o) >= 1).length,
    easyLeft: ORDERS.filter((o) => o.nivel === 1 && done(o) < 1).length,
    left: ORDERS.filter((o) => done(o) < 1).length,
    notPerfect: ORDERS.filter((o) => done(o) < 3).length,
  };
}
