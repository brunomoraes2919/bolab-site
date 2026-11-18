// BOLAB — Ateliê, jogo: os desenhos de tela (só montam HTML; quem liga os botões é index.js).
// Todo texto passa pelo html`` de js/ui.js; os SVG são os de art.js (texto fixo do próprio código, por isso raw()).
import { html, raw } from '../../ui.js';
import { brl } from '../bo/brain.js';
import { ORDERS, NIVEIS, SEM_GRACA, FLASH_SECONDS } from './orders.js';
import { STICKERS, PAGES } from './stickers.js';
import { portraitSvg, stickerSvg, iconSvg } from './art.js';

const ico = (name) => raw(iconSvg(name));
const face = (order, mood, size) => raw(portraitSvg(order.cliente.retrato, mood, { size }));
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Três estrelas, `n` acesas. `big` = as da entrega (acendem uma a uma). */
export function starsHtml(n, { big = false, label = true } = {}) {
  return html`<span class="ag-stars ${big ? 'ag-stars--big' : ''}" ${label ? raw(`role="img" aria-label="${n === 0 ? 'Ainda sem estrelas' : `${n} de 3 estrelas`}"`) : raw('aria-hidden="true"')}>${[1, 2, 3].map((i) => html`<i class="ag-star ${i <= n ? 'is-on' : ''}">${ico('estrela')}</i>`)}</span>`;
}

const chips = (order) => html`
  <span class="ag-chip">${ico('pessoas')}${plural(order.pessoas, 'pessoa', 'pessoas')}</span>
  ${order.orcamento ? html`<span class="ag-chip">${ico('orcamento')}até ${brl(order.orcamento)}</span>` : ''}
  ${order.dias ? html`<span class="ag-chip">${ico('prazo')}${plural(order.dias, 'dia', 'dias')}</span>` : ''}
`;

function orderRow(order, best, { current = false } = {}) {
  return html`
    <li>
      <button type="button" class="ag-row ${current ? 'is-current' : ''}" data-ag-act="brief" data-id="${order.id}">
        <span class="ag-row__face">${face(order, best === 3 ? 'feliz' : 'neutro', 48)}</span>
        <span class="ag-row__body">
          <strong>${order.cliente.nome}</strong>
          <span>${order.ocasiao}${current ? ' · em andamento' : ''}</span>
        </span>
        ${starsHtml(best)}
      </button>
    </li>
  `;
}

/** A entrada do jogo: encomenda do dia, relâmpago, caderno de encomendas. */
export function hubView({ state, daily, dailyDone, current, flashNext, hasParked }) {
  const delivered = ORDERS.filter((o) => state.orders[o.id]).length;
  return html`
    ${!state.intro
      ? html`<div class="ag-how" data-ag-how>
          <ol>
            <li><b>1</b>Escolha um cliente</li>
            <li><b>2</b>Monte o bolo que ele pediu</li>
            <li><b>3</b>Entregue e ganhe estrelas</li>
          </ol>
          <p>É só brincadeira: nada aqui vai para o carrinho.${Object.keys(state.stickers).length ? ' E você já ganhou figurinhas só de montar o seu bolo: veja no Álbum.' : ''}</p>
        </div>`
      : ''}
    ${current
      ? html`<div class="ag-now">
          <span class="ag-now__face">${face(current.order, 'neutro', 40)}</span>
          <span class="ag-now__body"><strong>Em andamento: ${current.order.cliente.nome}</strong><span>${current.order.ocasiao}</span></span>
          <button type="button" class="btn btn--sm" data-ag-act="comanda">Continuar</button>
        </div>`
      : ''}
    <div class="ag-specials">
      <button type="button" class="ag-special ag-special--day" data-ag-act="brief-daily">
        <span class="ag-special__face">${face(daily, dailyDone === 3 ? 'feliz' : 'neutro', 56)}</span>
        <span class="ag-special__body">
          <small>${ico('sol')}Encomenda do dia</small>
          <strong>${daily.cliente.nome}</strong>
          <span>${daily.ocasiao}</span>
        </span>
        ${dailyDone ? starsHtml(dailyDone) : html`<span class="ag-special__go">${ico('seta')}</span>`}
      </button>
      <button type="button" class="ag-special ag-special--flash" data-ag-act="brief-flash">
        <span class="ag-special__face">${face(flashNext, 'neutro', 56)}</span>
        <span class="ag-special__body">
          <small>${ico('raio')}Desafio relâmpago</small>
          <strong>${FLASH_SECONDS} segundos</strong>
          <span>Três desejos sorteados</span>
        </span>
        ${state.flash.best ? starsHtml(state.flash.best) : html`<span class="ag-special__go">${ico('seta')}</span>`}
      </button>
    </div>
    <div class="ag-sec-head"><h3>Caderno de encomendas</h3><span>${delivered} de ${ORDERS.length} entregues</span></div>
    ${[1, 2, 3].map(
      (n) => html`
        <h4 class="ag-level">${NIVEIS[n]}</h4>
        <ul class="ag-list">${ORDERS.filter((o) => o.nivel === n).map((o) => orderRow(o, state.orders[o.id]?.stars || 0, { current: current?.order.id === o.id && current.mode !== 'flash' }))}</ul>
      `,
    )}
    ${current
      ? html`<button type="button" class="ag-link" data-ag-act="quit">Sair da encomenda e voltar ao modo livre</button>`
      : hasParked
        ? html`<button type="button" class="ag-link" data-ag-act="restore">Voltar ao bolo que eu estava montando</button>`
        : html`<p class="ag-foot">No modo livre nada muda: feche esta aba e monte o bolo que quiser.</p>`}
  `;
}

const CHECK_LABEL = (c) => {
  const text = c.kind === 'nao' ? `sem ${c.t}` : c.t;
  return c.need ? `${text} (${c.have} de ${c.need})` : text;
};

/** A lista de conferência da comanda. `result` = scoreOrder (null antes de começar: só mostra o que foi pedido). */
function checklist(order, result) {
  const items = result
    ? result.checks
    : [
        ...(order.quer || []).map((w) => ({ kind: 'quer', t: w.t, ok: false, need: w.k === 'decor' && w.min > 1 ? w.min : 0, have: 0 })),
        ...(order.naoGosta || []).map((w) => ({ kind: 'nao', t: w.t, ok: false })),
      ];
  const main = items.filter((c) => c.kind === 'quer' || c.kind === 'nao');
  const deal = items.filter((c) => ['pessoas', 'orcamento', 'prazo'].includes(c.kind));
  const look = items.filter((c) => c.kind === 'bo');
  const li = (c) => html`<li class="ag-check ${result && c.ok ? 'is-ok' : ''} ${c.kind === 'nao' ? 'ag-check--no' : ''} ${result && !c.ok && c.level === 0.5 ? 'is-near' : ''}">
    <i>${ico(result && c.ok ? 'ok' : c.kind === 'nao' ? 'nao' : 'falta')}</i><span>${CHECK_LABEL(c)}</span>${result ? html`<span class="sr-only">${c.ok ? ': feito' : ': falta'}</span>` : ''}
  </li>`;
  return html`
    <ul class="ag-checks" aria-label="O que o cliente pediu">${main.map(li)}</ul>
    ${result
      ? html`
          <ul class="ag-checks ag-checks--deal" aria-label="O combinado">${deal.map(li)}</ul>
          <ul class="ag-checks ag-checks--bo" aria-label="O olhar da Bô">${look.map(li)}</ul>
        `
      : ''}
  `;
}

function budgetBar(result) {
  if (!result?.budget) return '';
  const pct = Math.max(4, Math.min(100, Math.round((result.price / result.budget) * 100)));
  return html`
    <div class="ag-budget ${result.over ? 'is-over' : ''}">
      <div class="ag-budget__text"><span>${result.over ? 'Passou do orçamento' : 'Orçamento'}</span><strong>${brl(result.price)} <small>de ${brl(result.budget)}</small></strong></div>
      <div class="ag-budget__bar" role="img" aria-label="${`Preço: ${brl(result.price)} de ${brl(result.budget)}`}"><i style="width:${pct}%"></i></div>
    </div>
  `;
}

const head = (order, mood, size = 72) => html`
  <header class="ag-client">
    <span class="ag-client__face">${face(order, mood, size)}</span>
    <div class="ag-client__body">
      <h3>${order.cliente.nome}</h3>
      <p>${order.ocasiao} · ${NIVEIS[order.nivel] || ''}</p>
      <div class="ag-chips">${chips(order)}</div>
    </div>
  </header>
  <blockquote class="ag-say">${order.pedido}</blockquote>
`;

/** O pedido, antes de aceitar. */
export function briefView({ order, mode, best, sameAsCurrent }) {
  return html`
    ${head(order, 'neutro')}
    ${checklist(order, null)}
    ${order.surpresa ? html`<p class="ag-secret">${ico('cadeado')}Este cliente tem um desejo secreto. Se você adivinhar, ganha um elogio.</p>` : ''}
    ${best ? html`<p class="ag-best">Sua melhor entrega: ${starsHtml(best)}</p>` : ''}
    <div class="ag-actions">
      <button type="button" class="btn btn--block" data-ag-act="start" data-mode="${mode}" data-id="${order.id}">${sameAsCurrent ? 'Recomeçar do zero' : mode === 'flash' ? 'Valendo!' : 'Aceitar encomenda'}</button>
      ${mode === 'flash' ? '' : html`<button type="button" class="btn btn--secondary btn--block" data-ag-act="start" data-keep="1" data-mode="${mode}" data-id="${order.id}">Usar o bolo que está na bancada</button>`}
    </div>
    <p class="ag-foot">${mode === 'flash' ? 'O relógio não tira estrela de ninguém: se zerar, termine com calma.' : 'Ao aceitar, a bancada recebe um bolo em branco. O seu bolo fica guardado e volta quando você sair.'}</p>
  `;
}

/** A comanda da encomenda em andamento, com tudo o que já foi feito. */
export function comandaView({ order, result, seconds }) {
  const left = result.missing.length;
  return html`
    ${head(order, 'neutro', 64)}
    ${seconds != null ? html`<p class="ag-clock ${seconds <= 0 ? 'is-done' : ''}">${ico('raio')}${seconds > 0 ? `Faltam ${seconds} segundos` : 'O relógio zerou: termine com calma'}</p>` : ''}
    ${checklist(order, result)}
    ${budgetBar(result)}
    <div class="ag-actions">
      <button type="button" class="btn btn--block" data-ag-act="deliver">${left ? 'Entregar assim mesmo' : 'Entregar o bolo'}</button>
      ${left ? html`<button type="button" class="btn btn--secondary btn--block" data-ag-act="hint">${ico('dica')}Dica da Bô</button>` : ''}
    </div>
    <p class="ag-hint" data-ag-hint aria-live="polite"></p>
    <button type="button" class="ag-link" data-ag-act="quit">Desistir desta encomenda</button>
  `;
}

const PART_NAME = { sabor: 'Sabor', visual: 'Visual', pedido: 'Pedido' };
const MOOD = { 3: 'amou', 2: 'quase', 1: 'chateado' };

/** A fala do cliente para a nota (com 1 estrela, a do tipo dele; escolhida pelo tamanho do nome, sem sorteio). */
export function reactionOf(order, stars) {
  if (stars >= 3) return order.feliz;
  if (stars === 2) return order.quase;
  const pool = SEM_GRACA[order.cliente.tipo] || SEM_GRACA.adulto;
  return pool[order.cliente.nome.length % pool.length];
}

/** A cena da entrega: o cliente reage, as estrelas acendem, a lista do que agradou e do que faltou. */
export function sceneView({ order, result, stickers, boLine, canBuy, nextLabel }) {
  const good = result.checks.filter((c) => c.ok && c.kind !== 'bo');
  const bad = result.checks.filter((c) => !c.ok);
  return html`
    <div class="ag-scene" data-ag-scene data-stars="${result.stars}">
      <div class="ag-scene__wait" aria-hidden="true">${ico('caixa')}<span>Entregando o bolo…</span></div>
      <div class="ag-scene__main">
        <p class="ag-scene__kicker">${order.ocasiao}</p>
        <div class="ag-scene__face">${face(order, MOOD[result.stars], 112)}</div>
        ${starsHtml(result.stars, { big: true })}
        <blockquote class="ag-say ag-say--up">${reactionOf(order, result.stars)}</blockquote>
        <ul class="ag-parts" aria-label="A nota por parte">
          ${Object.entries(result.parts).map(([k, v]) => html`<li><span>${PART_NAME[k]}</span><span class="ag-pips" role="img" aria-label="${`${v} de 3`}">${[1, 2, 3].map((i) => html`<i class="${i <= v ? 'is-on' : ''}"></i>`)}</span></li>`)}
        </ul>
        ${result.surprise?.ok ? html`<p class="ag-surprise">${ico('estrela')}${result.surprise.text}</p>` : ''}
        ${bad.length ? html`<h4 class="ag-notes__h">O que faltou</h4><ul class="ag-notes ag-notes--bad">${bad.map((c) => html`<li><i>${ico('x')}</i>${c.text}</li>`)}</ul>` : ''}
        ${good.length ? html`<h4 class="ag-notes__h">O que agradou</h4><ul class="ag-notes ag-notes--good">${good.map((c) => html`<li><i>${ico('ok')}</i>${c.text}</li>`)}</ul>` : ''}
        ${result.surprise && !result.surprise.ok ? html`<p class="ag-secret">${ico('cadeado')}${result.stars === 3 ? result.surprise.text : 'O desejo secreto continua em segredo.'}</p>` : ''}
        ${boLine ? html`<p class="ag-bo"><b>Bô</b>${boLine}</p>` : ''}
        ${stickers.length
          ? html`<div class="ag-won"><h4>${stickers.length === 1 ? 'Figurinha nova' : 'Figurinhas novas'}</h4><ul>${stickers.map((s) => html`<li><button type="button" class="ag-won__btn" data-ag-act="sticker" data-id="${s.id}">${raw(stickerSvg(s, { size: 56 }))}<span>${s.name}</span></button></li>`)}</ul></div>`
          : ''}
        <div class="ag-actions">
          ${result.stars < 3 ? html`<button type="button" class="btn btn--block" data-ag-act="retry">Tentar de novo</button>` : ''}
          <button type="button" class="btn ${result.stars < 3 ? 'btn--secondary' : ''} btn--block" data-ag-act="next">${nextLabel}</button>
        </div>
        ${canBuy ? html`<button type="button" class="ag-link ag-link--buy" data-ag-act="buy">Quer este bolo de verdade? Ver no resumo</button>` : ''}
        <button type="button" class="ag-link" data-ag-act="free">Voltar ao modo livre</button>
      </div>
    </div>
  `;
}

/** O álbum de figurinhas. */
export function albumView({ state }) {
  const have = (id) => id in state.stickers;
  const fresh = new Set(state.fresh);
  return html`
    <div class="ag-album">
      ${PAGES.map((page) => {
        const list = STICKERS.filter((s) => s.page === page.id);
        return html`
          <section class="ag-page">
            <div class="ag-sec-head"><h3>${page.name}</h3><span>${list.filter((s) => have(s.id)).length} de ${list.length}</span></div>
            <ul class="ag-grid">
              ${list.map((s) => {
                const got = have(s.id);
                const name = got ? s.name : s.secret ? 'Figurinha secreta' : s.name;
                return html`<li>
                  <button type="button" class="ag-slot ${got ? 'is-got' : ''} ${fresh.has(s.id) ? 'is-new' : ''}" data-ag-act="sticker" data-id="${s.id}" aria-label="${`${name}: ${got ? 'ganha' : 'ainda não'}`}">
                    ${raw(stickerSvg(s, { locked: !got, size: 64 }))}
                    <span>${name}</span>
                    ${fresh.has(s.id) ? html`<em>nova</em>` : ''}
                  </button>
                </li>`;
              })}
            </ul>
          </section>
        `;
      })}
    </div>
  `;
}

/** O detalhe de uma figurinha (num diálogo pequeno). */
export function stickerDetail(s, day) {
  const got = day !== undefined;
  const when = got && day ? `Ganha em ${day.split('-').reverse().join('/')}` : got ? 'Ganha' : s.secret ? 'É segredo: continue explorando o ateliê.' : 'Ainda não ganha';
  return html`
    <div class="ag-detail">
      ${raw(stickerSvg(s, { locked: !got, size: 128 }))}
      <h3>${got || !s.secret ? s.name : 'Figurinha secreta'}</h3>
      <p>${got ? s.won : s.secret ? 'Ninguém sabe como se ganha esta.' : s.how}</p>
      <small>${when}</small>
    </div>
  `;
}
