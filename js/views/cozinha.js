// BOLAB — ficha da cozinha (#/cozinha?…): o que a confeitaria abre pelo link da mensagem do pedido.
//
// Mostra a ficha de produção de cada bolo montado no 3D (js/customizer/ficha.js), os itens do
// cardápio do mesmo pedido, o dia e o horário, com botão de imprimir. Não exige conta e não usa
// nada guardado no aparelho: tudo vem do próprio link (ver js/pedido-whatsapp.js).
//
// O link não traz nome, telefone, endereço nem recado: isso fica no texto da mensagem do WhatsApp.
// A cor do chá revelação vem no link, mas só entra na tela depois de um toque em "Mostrar a cor".
import { html, raw, icon, on, toast, copyText, dateLong } from '../ui.js';
import { slotLabel } from '../components.js';
import { getProduct, SIZES } from '../data/products.js';
import { decodeConfig } from '../customizer/share.js';
import { fichaDeProducao, fichaEmTexto } from '../customizer/ficha.js';
import { lerCozinha } from '../pedido-whatsapp.js';

/* Bolos com a cor do chá revelação à mostra (por posição no link). Volta a esconder ao sair da tela. */
const shown = new Set();
let shownFor = '';

const rawQuery = () => (location.hash.split('?')[1] || '').slice(0, 60000);

/** As linhas de fichaEmTexto viram blocos: título, linha de medidas e grupos "Rótulo: texto" com subitens. */
function blocksOf(lines) {
  const groups = [];
  lines.slice(2).forEach((line) => {
    const indent = line.length - line.trimStart().length;
    const text = line.trim().replace(/^·\s*/, '');
    if (indent >= 2 && groups.length) {
      groups[groups.length - 1].subs.push({ text, deep: indent >= 4 });
      return;
    }
    const m = /^([^:]{1,48}):\s*(.*)$/.exec(text);
    groups.push(m ? { label: m[1], text: m[2], subs: [] } : { label: '', text, subs: [] });
  });
  return { title: lines[0] || 'Bolo personalizado', measures: lines[1] || '', groups };
}

/** Texto com as cores (#rrggbb) acompanhadas de uma amostra, para a confeitaria bater o tom. */
function withSwatches(text) {
  return String(text)
    .split(/(#[0-9a-fA-F]{6})\b/)
    .map((part) => (/^#[0-9a-fA-F]{6}$/.test(part) ? html`<span class="kz-hex"><i style="background:${part}"></i>${part}</span>` : part));
}

/** "1. Massa de chocolate (1,9 cm): como fazer" → o começo em destaque, o modo de fazer em seguida. */
function subItem(s) {
  const i = s.text.indexOf(': ');
  const cut = i > 0 && i <= 64; // frase comprida com dois-pontos no meio (observações) fica inteira, sem destaque
  const head = cut ? s.text.slice(0, i) : '';
  const body = cut ? s.text.slice(i + 2) : s.text;
  return html`<li class="${s.deep ? 'kz-sub kz-sub--deep' : 'kz-sub'}">${head ? html`<strong>${withSwatches(head)}</strong> ` : ''}${withSwatches(body)}</li>`;
}

function revealBox(i, on_) {
  return html`
    <div class="kz-reveal ${on_ ? 'is-on' : ''}">
      ${icon(on_ ? 'eye' : 'lock')}
      <div>
        <strong>${on_ ? 'Chá revelação: a cor está à mostra' : 'Chá revelação: a cor está escondida'}</strong>
        <span>${on_ ? 'Esconda antes de mostrar esta tela a outra pessoa.' : 'Só a confeitaria deve ver. Mostre a cor quando estiver longe de quem encomendou.'}</span>
      </div>
      <button class="btn btn--secondary btn--sm kz-noprint" type="button" data-kz-reveal="${i}" aria-pressed="${on_ ? 'true' : 'false'}">${on_ ? 'Esconder a cor' : 'Mostrar a cor'}</button>
    </div>
  `;
}

function cakeCard(cake, i, total) {
  const config = decodeConfig(cake.text);
  if (!config) {
    return html`
      <section class="card kz-cake kz-cake--bad">
        <h2>Bolo ${i + 1}</h2>
        <p>Não deu para ler este bolo: o link chegou incompleto. Peça ao cliente para enviar o pedido de novo.</p>
      </section>
    `;
  }
  const reveal = Boolean(config.reveal?.on);
  const open = shown.has(i);
  // secret: true = a ficha leva a cor do chá revelação; só depois do toque em "Mostrar a cor".
  const b = blocksOf(fichaEmTexto(fichaDeProducao(config, { secret: open })));
  return html`
    <section class="card kz-cake" aria-labelledby="kz-cake-${i}">
      <header class="kz-cake__head">
        <div>
          <p class="kz-cake__n">${total > 1 ? `Bolo ${i + 1} de ${total}` : 'Bolo montado em 3D'}${cake.qty > 1 ? html` · <strong>${cake.qty} unidades</strong>` : ''}</p>
          <h2 id="kz-cake-${i}">${b.title}</h2>
          <p class="kz-cake__measures">${b.measures}</p>
        </div>
        <a class="btn btn--soft btn--sm kz-noprint" href="#/monte-seu-bolo?c=${cake.text}">${icon('cube')}Abrir em 3D</a>
      </header>
      ${reveal ? revealBox(i, open) : ''}
      <dl class="kz-rows">
        ${b.groups.map(
          (g) => html`
            <div class="kz-row">
              ${g.label ? html`<dt>${g.label}</dt>` : html`<dt class="sr-only">Detalhe</dt>`}
              <dd>
                ${g.text ? html`<p>${withSwatches(g.text)}</p>` : ''}
                ${g.subs.length ? html`<ul>${g.subs.map(subItem)}</ul>` : ''}
              </dd>
            </div>
          `,
        )}
      </dl>
    </section>
  `;
}

function itemsCard(items) {
  if (!items.length) return '';
  return html`
    <section class="card kz-items" aria-labelledby="kz-items-t">
      <h2 id="kz-items-t">Itens do cardápio no mesmo pedido</h2>
      <ul>
        ${items.map((it) => {
          const p = getProduct(it.id);
          const size = SIZES.find((s) => s.id === it.size);
          return html`<li><strong>${it.qty}×</strong> ${p ? p.name : `Item ${it.id} (não está mais no cardápio)`}${size && p?.sizes !== null ? ` · tamanho ${size.label} (${size.diameter})` : ''}</li>`;
        })}
      </ul>
    </section>
  `;
}

function emptyLink() {
  return html`
    <div class="container kz">
      <div class="card empty">
        <div class="empty__art">${icon('receipt')}</div>
        <h1 class="kz-empty__t">Este link não traz nenhuma ficha</h1>
        <p>A ficha da cozinha abre pelo link que vem na mensagem do pedido, no WhatsApp. Se o link chegou cortado, peça ao cliente para enviar o pedido de novo.</p>
        <a class="btn" href="#/">Ir para a loja</a>
      </div>
    </div>
  `;
}

export default {
  title: 'Ficha da cozinha',
  layout: 'plain',

  render() {
    const query = rawQuery();
    if (query !== shownFor) {
      shown.clear();
      shownFor = query;
    }
    const data = lerCozinha(query);
    if (!data.cakes.length) return emptyLink();
    const when = data.date ? `${data.mode === 'pickup' ? 'Retirada no ateliê' : 'Entrega'}: ${dateLong(data.date).toLowerCase()}${data.slot ? `, ${slotLabel(data.slot)}` : ''}` : '';
    return html`
      <div class="container kz">
        <header class="kz-head">
          <div>
            <p class="kz-head__kicker">Ficha da cozinha</p>
            <h1>${data.order ? `Pedido ${data.order}` : 'Pedido pelo WhatsApp'}</h1>
            ${when ? html`<p class="kz-head__when">${icon(data.mode === 'pickup' ? 'store' : 'truck')}${when}</p>` : ''}
          </div>
          <div class="kz-actions kz-noprint">
            <button class="btn" type="button" data-kz-print>${raw('<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v6H7z"/></svg>')}Imprimir</button>
            <button class="btn btn--secondary" type="button" data-kz-copy>${icon('copy')}Copiar em texto</button>
          </div>
        </header>
        <p class="notice kz-note kz-noprint">${icon('info')}<span>Nome, telefone, endereço e recados do cliente estão na mensagem do WhatsApp. Este link traz só o que serve para produzir.</span></p>
        ${itemsCard(data.items)} ${data.cakes.map((c, i) => cakeCard(c, i, data.cakes.length))}
      </div>
    `;
  },

  mount(root, ctx) {
    const page = root.firstElementChild;
    on(page, 'click', '[data-kz-print]', () => window.print());

    on(page, 'click', '[data-kz-reveal]', (_ev, btn) => {
      const i = Number(btn.dataset.kzReveal);
      if (shown.has(i)) shown.delete(i);
      else shown.add(i);
      ctx.rerender();
      document.querySelector(`[data-kz-reveal="${i}"]`)?.focus({ preventScroll: true });
    });

    // Copia as fichas como estão na tela: a cor do chá revelação só entra se estiver à mostra.
    on(page, 'click', '[data-kz-copy]', async () => {
      const data = lerCozinha(rawQuery());
      const parts = data.cakes.map((c, i) => {
        const config = decodeConfig(c.text);
        if (!config) return `Bolo ${i + 1}: link incompleto.`;
        const lines = fichaEmTexto(fichaDeProducao(config, { secret: shown.has(i) }));
        return [`${c.qty}x ${lines[0]}`, ...lines.slice(1)].join('\n');
      });
      const head = [data.order ? `Pedido ${data.order}` : 'Pedido', data.date ? `${data.mode === 'pickup' ? 'Retirada' : 'Entrega'} ${dateLong(data.date).toLowerCase()}${data.slot ? `, ${slotLabel(data.slot)}` : ''}` : ''].filter(Boolean).join(' · ');
      const ok = await copyText([head, ...parts].join('\n\n'));
      toast(ok === false ? 'Não deu para copiar aqui. Use Imprimir.' : 'Fichas copiadas.', { type: ok === false ? 'error' : 'success' });
    });

    return () => {
      // Saiu da ficha (não é um simples redesenho): a cor volta a ficar escondida.
      if (!location.hash.startsWith('#/cozinha')) shown.clear();
    };
  },
};
