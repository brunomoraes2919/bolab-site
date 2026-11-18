// BOLAB — Ateliê: vibração curta no celular (o "toque" que acompanha o som).
//
//   import { haptics } from './atelier/haptics.js';
//   haptics.tap()            toque leve (seleção)          haptics.success()    deu certo (foi para o carrinho)
//   haptics.step()           mudou de etapa                haptics.warn()       não coube / atenção
//   haptics.play('place')    pelo nome                     haptics.bind(bus)    liga aos eventos do personalizador
//   haptics.supported        o aparelho vibra?             haptics.enabled      suportado + ligado nas preferências
//
// Só vibra onde existe navigator.vibrate (Android: Chrome e o app; iPhone não tem) e tela de toque.
// Respeita a preferência "Vibração" do controle de som (prefs 'atelierAudio' → haptics) e o ajuste
// "reduzir movimento" do aparelho. Os pulsos são curtos (8–30 ms): um toque, não um alarme.
// No app Android o WebView só vibra se o manifesto tiver a permissão android.permission.VIBRATE.
import { settings } from './audio-settings.js';

/** Padrões em milissegundos (vibra, pausa, vibra…). */
export const PATTERNS = {
  tap: 8,
  select: 10,
  place: 14,
  step: [10, 40, 12],
  toggle: 12,
  success: [12, 50, 22],
  warn: [24, 60, 24],
  error: [30, 50, 30],
  camera: 18,
  tada: [10, 40, 10, 40, 30],
};

const nav = typeof navigator !== 'undefined' ? navigator : null;
const media = (query) => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
let lastAt = 0;

export const haptics = {
  /** O aparelho tem motor de vibração acessível (Android) e tela de toque. */
  get supported() {
    return !!nav && typeof nav.vibrate === 'function' && (media('(pointer: coarse)') || (nav.maxTouchPoints || 0) > 0);
  },
  /** A pessoa pediu menos movimento no aparelho: sem vibração. */
  get reduced() {
    return media('(prefers-reduced-motion: reduce)');
  },
  get enabled() {
    return haptics.supported && settings.haptics && !haptics.reduced;
  },
  /** Vibra um padrão (nome de PATTERNS, número de ms ou lista). Devolve true se o aparelho aceitou. */
  play(pattern = 'tap') {
    if (!haptics.enabled) return false;
    // r5-tela: antes do primeiro toque de verdade na página o navegador recusa a vibração (e registra um aviso
    // no console): nesse caso, nem tenta
    if (nav.userActivation && !nav.userActivation.hasBeenActive) return false;
    const p = typeof pattern === 'string' ? PATTERNS[pattern] : pattern;
    if (p == null) return false;
    const now = Date.now();
    if (now - lastAt < 40) return false; // nada de zumbido contínuo em rajadas
    lastAt = now;
    try {
      return nav.vibrate(p) !== false;
    } catch {
      return false;
    }
  },
  stop() {
    try {
      if (haptics.supported) nav.vibrate(0);
    } catch {
      // aparelho sem vibração
    }
  },
  tap: () => haptics.play('tap'),
  select: () => haptics.play('select'),
  step: () => haptics.play('step'),
  success: () => haptics.play('success'),
  warn: () => haptics.play('warn'),
  /**
   * Liga a vibração aos eventos do personalizador (só às escolhas da própria pessoa).
   * Devolve a função que desliga.
   */
  bind(bus) {
    if (!bus || typeof bus.on !== 'function') return () => {};
    return bus.on('*', (detail, type) => {
      const pattern = hapticFor(type, detail || {});
      if (pattern) haptics.play(pattern);
    });
  },
};

/** Que vibração acompanha cada evento (null = nenhuma). Separado para poder ser testado. */
export function hapticFor(type, detail = {}) {
  if (type === 'step') return 'step';
  if (type === 'cart') return 'success';
  if (type === 'fit') return detail.dropped && detail.dropped.length ? 'warn' : null;
  if (type === 'tool') return detail.id === 'photo' || detail.id === 'download' ? 'camera' : 'tap';
  if (type === 'change') {
    if ((detail.by || 'user') !== 'user') return detail.by === 'auto' ? null : 'select';
    const key = String(detail.key || '');
    if (key.endsWith('.text') || key === 'name') return null; // digitando: o teclado já responde
    if (key === 'decor.add' || key === 'layer.add' || key === 'tiers' || key === 'candles.count') return 'place';
    return 'tap';
  }
  return null;
}

export default haptics;
