// BOLAB — Ateliê: barramento de eventos do personalizador.
// A tela do personalizador (js/views/customizer.js) AVISA aqui tudo o que acontece; o som
// (js/atelier/audio.js), a assistente Bô (js/atelier/bo/), os efeitos e os desafios só OUVEM.
// Assim nenhuma dessas partes precisa conhecer a outra, e desligar uma não quebra o resto.
//
//   import { bus } from '../atelier/bus.js';
//   const off = bus.on('change', (ev) => { … });   // off() cancela
//   bus.emit('change', { key: 'cover.type', value: 'ganache', prev: 'buttercream', config, price, prevPrice, by: 'user' });
//
// EVENTOS (o `config` é sempre a configuração JÁ normalizada, a mesma que é desenhada e cobrada)
//
//   open    { config, source }            source: 'novo' | 'inspiracao' | 'salvo' | 'edicao' | 'produto' | 'desafio' | 'rascunho'
//   close   { }
//   step    { id, index, prev, config }   id: 'formato' | 'massa' | 'recheio' | 'cobertura' | 'acabamento' | 'decoracao' | 'resumo'
//   change  { key, value, prev, config, price, prevPrice, by }
//             by: 'user' | 'preset' | 'surprise' | 'palette' | 'undo' | 'redo' | 'restart' | 'auto'
//             key (o que mudou):
//               estrutura   'shape' 'size' 'tiers' 'height' 'base'
//               massa       'layer.add' 'layer.remove' 'layer.flavor'      value: { index, id }
//               recheio     'filling'                                      value: { index, id }
//               cobertura   'cover.type' 'cover.style' 'cover.color' 'cover.color2' 'cover.tier'
//               calda       'drip.on' 'drip.color'
//               bico        'piping.style' 'piping.where' 'piping.color'
//               decoração   'decor.add' 'decor.remove' 'decor.clear' 'decor.arr' 'decor.qty' 'decor.color'   value: { id, … }
//               festa       'candles.count' 'candles.style' 'candles.number' 'message.text' 'message.mode'
//                           'message.color' 'topper.text' 'topper.color'
//               geral       'name' 'backdrop' 'preset' 'surprise' 'palette' 'undo' 'redo' 'restart'
//             Chaves novas podem aparecer (opções novas do bolo): quem ouve deve ignorar o que não conhece.
//   fit     { adapted, dropped, config }  o distribuidor reorganizou (adapted) ou não coube (dropped: ids)
//   tool    { id, value }                 id: 'cutaway' | 'rotate' | 'view' | 'measure' | 'photo' | 'share' | 'download' | 'save' | 'breakdown'
//   cart    { config, price, editing }    o bolo foi para o carrinho (ou a edição foi salva)
//
// Um erro dentro de um ouvinte nunca derruba o personalizador: é registrado no console e o resto segue.

const subs = new Map();

export const bus = {
  /** Ouve um tipo de evento ('*' ouve todos: fn(detail, type)). Devolve a função que cancela. */
  on(type, fn) {
    if (!subs.has(type)) subs.set(type, new Set());
    subs.get(type).add(fn);
    return () => subs.get(type)?.delete(fn);
  },
  emit(type, detail = {}) {
    for (const key of [type, '*']) {
      const set = subs.get(key);
      if (!set) continue;
      for (const fn of [...set]) {
        try {
          fn(detail, type);
        } catch (err) {
          console.error(`[atelie] ouvinte de "${type}" falhou:`, err);
        }
      }
    }
  },
  /** Só para testes: quantos ouvintes existem. */
  count(type) {
    return subs.get(type)?.size || 0;
  },
};
