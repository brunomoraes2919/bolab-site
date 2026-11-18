// BOLAB — Ateliê: controle de som para a barra do personalizador.
//
//   import { soundControl } from '../atelier/audio-ui.js';
//   barra.append(soundControl());              // botão de alto-falante que abre um painel pequeno
//
// O painel tem: liga/desliga geral, três deslizantes (música, efeitos, voz), a escolha da trilha
// e "Vibração" (só em celular que vibra). Tudo fica lembrado (prefs 'atelierAudio').
// O estilo mora em css/atelier-audio.css e é carregado por este módulo (uma vez).
//
// Enquanto está aberto, o painel fica preso ao <body> (posição fixa): assim ele nunca é cortado
// pelo palco do bolo (que tem overflow: hidden) nem fica atrás do painel de opções. No celular
// ele vira uma folha na base da tela; no computador, um balão ao lado do botão.
//
// Opções: soundControl({ placement: 'auto' | 'up' | 'down', align: 'auto' | 'start' | 'end', className })
// O elemento devolvido tem .open(), .close() e .destroy().
import { html, raw } from '../ui.js';
import { audio } from './audio.js';
import { haptics } from './haptics.js';

const svg = (body) => raw(`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`);
// Ícones no estilo Lucide (licença ISC), como os de js/icons.js.
const SPEAKER = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>';
const ICONS = {
  on: svg(`${SPEAKER}<path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>`),
  low: svg(`${SPEAKER}<path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>`),
  off: svg(`${SPEAKER}<line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>`),
  music: svg('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  sfx: svg('<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>'),
  voice: svg('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>'),
  haptics: svg('<path d="m2 8 2 2-2 2 2 2-2 2"/><path d="m22 8-2 2 2 2-2 2 2 2"/><rect width="8" height="14" x="8" y="5" rx="1"/>'),
  close: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
};
const SLIDERS = [
  { ch: 'music', label: 'Música' },
  { ch: 'sfx', label: 'Efeitos' },
  { ch: 'voice', label: 'Voz' },
];
const SHEET_BELOW = 640; // abaixo desta largura o painel vira folha na base da tela

let styled = false;
/** Carrega css/atelier-audio.css uma única vez. */
function loadStyle() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  if (document.querySelector('link[data-atelier-audio]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('../../css/atelier-audio.css', import.meta.url).href;
  link.setAttribute('data-atelier-audio', '');
  document.head.appendChild(link);
}

let seq = 0;

function template(id) {
  const s = audio.settings;
  return html`
    <button type="button" class="aa-btn" data-aa-toggle aria-haspopup="dialog" aria-expanded="false" aria-controls="aa-panel-${id}" title="Som">
      <span class="aa-btn__icon" data-aa-icon></span>
    </button>
    <div class="aa-panel" id="aa-panel-${id}" role="dialog" aria-label="Controles de som" data-aa-panel hidden>
      <div class="aa-head">
        <strong class="aa-title" id="aa-title-${id}">Som</strong>
        <button type="button" class="aa-switch" role="switch" data-aa-master aria-labelledby="aa-title-${id}" aria-checked="true">
          <span class="aa-switch__state" data-aa-master-text>Ligado</span>
          <span class="aa-switch__track" aria-hidden="true"><span class="aa-switch__thumb"></span></span>
        </button>
        <button type="button" class="aa-close" data-aa-close aria-label="Fechar controles de som">${ICONS.close}</button>
      </div>
      <div class="aa-rows" data-aa-rows>
        ${SLIDERS.map(
          ({ ch, label }) => html`
            <div class="aa-row">
              <label class="aa-row__label" for="aa-${ch}-${id}">${ICONS[ch]}<span>${label}</span></label>
              <input class="aa-range" id="aa-${ch}-${id}" type="range" min="0" max="100" step="5" value="${Math.round(s[ch] * 100)}" data-aa-vol="${ch}" />
              <output class="aa-row__value" for="aa-${ch}-${id}" data-aa-out="${ch}"></output>
            </div>
          `,
        )}
        <fieldset class="aa-themes">
          <legend class="aa-legend">Trilha</legend>
          <div class="aa-themes__list">
            ${audio.music.themes.map(
              (t) => html`
                <label class="aa-theme">
                  <input class="aa-theme__input" type="radio" name="aa-theme-${id}" value="${t.id}" data-aa-theme />
                  <span class="aa-theme__name">${t.name}</span>
                </label>
              `,
            )}
          </div>
        </fieldset>
      </div>
      <div class="aa-foot" data-aa-haptics-row hidden>
        <span class="aa-row__label" id="aa-hap-${id}">${ICONS.haptics}<span>Vibração</span></span>
        <button type="button" class="aa-switch" role="switch" data-aa-haptics aria-labelledby="aa-hap-${id}" aria-checked="true">
          <span class="aa-switch__track" aria-hidden="true"><span class="aa-switch__thumb"></span></span>
        </button>
      </div>
    </div>
  `;
}

/**
 * Cria o controle de som. Devolve um elemento pronto para entrar na barra do personalizador.
 */
export function soundControl({ placement = 'auto', align = 'auto', className = '' } = {}) {
  loadStyle();
  const id = ++seq;
  const el = document.createElement('div');
  el.className = `aa ${className}`.trim();
  el.innerHTML = String(template(id));
  const btn = el.querySelector('[data-aa-toggle]');
  const panel = el.querySelector('[data-aa-panel]');
  const $ = (sel) => panel.querySelector(sel);
  const s = audio.settings;
  let open = false;

  function render() {
    const off = s.mute.master;
    const quiet = off || s.master <= 0 || ['music', 'sfx', 'voice'].every((ch) => s.mute[ch] || s[ch] <= 0);
    const low = !quiet && Math.max(s.mute.music ? 0 : s.music, s.mute.sfx ? 0 : s.sfx, s.mute.voice ? 0 : s.voice) <= 0.35;
    btn.querySelector('[data-aa-icon]').innerHTML = String(quiet ? ICONS.off : low ? ICONS.low : ICONS.on);
    btn.classList.toggle('is-off', quiet);
    btn.setAttribute('aria-label', `Som ${quiet ? 'desligado' : 'ligado'}. ${open ? 'Fechar' : 'Abrir'} controles de som`);
    $('[data-aa-master]').setAttribute('aria-checked', String(!off));
    $('[data-aa-master-text]').textContent = off ? 'Desligado' : 'Ligado';
    $('[data-aa-rows]').classList.toggle('is-off', off);
    for (const { ch, label } of SLIDERS) {
      const input = $(`[data-aa-vol="${ch}"]`);
      const pct = s.mute[ch] ? 0 : Math.round(s[ch] * 100);
      if (+input.value !== pct) input.value = String(pct);
      input.disabled = off;
      input.style.setProperty('--aa-fill', `${pct}%`);
      input.setAttribute('aria-valuetext', pct ? `${label}: ${pct}%` : `${label}: sem som`);
      $(`[data-aa-out="${ch}"]`).textContent = pct ? `${pct}%` : 'mudo';
    }
    for (const radio of panel.querySelectorAll('[data-aa-theme]')) {
      radio.checked = radio.value === s.theme;
      radio.disabled = off;
    }
    $('[data-aa-haptics-row]').hidden = !haptics.supported || haptics.reduced;
    $('[data-aa-haptics]').setAttribute('aria-checked', String(s.haptics));
  }

  /** Folha na base da tela (celular) ou balão preso ao botão (computador), sempre dentro da tela. */
  function place() {
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const sheet = vw < SHEET_BELOW;
    panel.classList.toggle('aa-panel--sheet', sheet);
    for (const prop of ['left', 'top', 'bottom', 'maxHeight']) panel.style[prop] = '';
    if (sheet) return;
    const b = btn.getBoundingClientRect();
    const w = panel.offsetWidth;
    const h = panel.scrollHeight + 2;
    const below = vh - b.bottom - 16;
    const above = b.top - 16;
    const up = placement === 'up' || (placement === 'auto' && below < h && above > below);
    const end = align === 'end' || (align === 'auto' && b.left + b.width / 2 > vw / 2);
    const left = Math.max(8, Math.min(vw - w - 8, end ? b.right - w : b.left));
    panel.style.left = `${Math.round(left)}px`;
    panel.style.maxHeight = `${Math.max(160, Math.round(up ? above : below))}px`;
    if (up) {
      panel.style.top = 'auto';
      panel.style.bottom = `${Math.round(vh - b.top + 8)}px`;
    } else {
      panel.style.top = `${Math.round(b.bottom + 8)}px`;
      panel.style.bottom = 'auto';
    }
  }

  const inside = (node) => el.contains(node) || panel.contains(node);
  function onDocDown(ev) {
    if (!inside(ev.target)) setOpen(false);
  }
  function onKey(ev) {
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      setOpen(false, true);
      return;
    }
    if (ev.key !== 'Tab' || !panel.contains(document.activeElement)) return;
    // o painel está no fim do <body>: sair dele com Tab fecha e devolve o foco ao botão
    const stops = [...panel.querySelectorAll('button, input')].filter((n) => !n.disabled && n.offsetParent && (n.type !== 'radio' || n.checked));
    const edge = ev.shiftKey ? stops[0] : stops[stops.length - 1];
    if (document.activeElement === edge) {
      ev.preventDefault();
      setOpen(false, true);
    }
  }
  const onLeave = () => setOpen(false);

  function setOpen(next, refocus = false) {
    if (next === open) return;
    open = next;
    btn.setAttribute('aria-expanded', String(open));
    if (open) {
      document.body.appendChild(panel);
      panel.hidden = false;
      render();
      place();
      document.addEventListener('pointerdown', onDocDown, true);
      document.addEventListener('keydown', onKey, true);
      window.addEventListener('resize', place);
      window.addEventListener('scroll', place, true);
      window.addEventListener('hashchange', onLeave);
      $('[data-aa-master]').focus({ preventScroll: true });
    } else {
      document.removeEventListener('pointerdown', onDocDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('hashchange', onLeave);
      panel.hidden = true;
      el.appendChild(panel);
      if (refocus && el.isConnected) btn.focus({ preventScroll: true });
      render();
    }
  }

  btn.addEventListener('click', () => {
    audio.unlock();
    setOpen(!open);
  });
  $('[data-aa-close]').addEventListener('click', () => setOpen(false, true));
  $('[data-aa-master]').addEventListener('click', () => {
    const turningOn = s.mute.master;
    s.mute.master = !s.mute.master;
    if (turningOn) {
      audio.unlock();
      audio.sfx('toggle', { on: true, delay: 0.08 });
    }
    haptics.play('toggle');
  });
  panel.addEventListener('input', (ev) => {
    const input = ev.target.closest('[data-aa-vol]');
    if (!input) return;
    const ch = input.dataset.aaVol;
    const v = Math.max(0, Math.min(100, +input.value || 0)) / 100;
    if (v > 0 && s.mute[ch]) s.set({ [ch]: v, mute: { [ch]: false } });
    else s[ch] = v;
  });
  panel.addEventListener('change', (ev) => {
    const input = ev.target.closest('[data-aa-vol]');
    if (input) {
      // soltar o deslizante de efeitos dá uma amostra do volume novo
      if (input.dataset.aaVol === 'sfx') audio.sfx('select');
      return;
    }
    const radio = ev.target.closest('[data-aa-theme]');
    if (radio && radio.checked) {
      audio.unlock();
      audio.music.setTheme(radio.value);
      audio.sfx('tap');
    }
  });
  $('[data-aa-haptics]').addEventListener('click', () => {
    s.haptics = !s.haptics;
    if (s.haptics) haptics.play('step');
  });

  // acompanha mudanças feitas em outro lugar (outro controle, a própria loja)
  const off = s.on(() => {
    if (open && !el.isConnected) return void setOpen(false); // a tela saiu com o painel aberto
    render();
  });

  el.open = () => setOpen(true);
  el.close = () => setOpen(false);
  el.destroy = () => {
    setOpen(false);
    off();
    el.remove();
  };
  render();
  return el;
}

export default soundControl;
