// BOLAB — tela do item, no formato de app de delivery.
// Celular: foto de ponta a ponta com voltar/favorito/compartilhar por cima, nome, nota, prazo e
// preço, "Receba a partir de…", grupos de opção e o rodapé fixo com contador e botão com valor.
// Computador: foto à esquerda, compra em um cartão fixo à direita.
import { html, icon, money, plural, dateShort, on, toast, copyText } from '../ui.js';
import {
  photo,
  rating,
  stars,
  favButton,
  productCard,
  qtyStepper,
  breadcrumb,
  priceButton,
  optionGroupHead,
  listRow,
  chipRow,
  promoBanner,
  sectionHead,
  dayLabel,
  prepLabel,
} from '../components.js';
import { REVIEWS, getProduct, sizesOf, priceOf, isCake, addOns, searchProducts } from '../data/products.js';
import { CATEGORIES, SITE } from '../data/site.js';
import { cart, schedule } from '../store.js';
import { goBack } from '../router.js';
import { receiveContext } from '../shell.js';

const NOTE_MAX = 140;
const WIDE = window.matchMedia('(min-width: 900px)');

const CARE_TIPS = [
  'Guarde na geladeira até a hora da festa.',
  'Tire de 20 a 30 minutos antes de servir.',
  'Sobrou? Em pote fechado, na geladeira, dura até 3 dias.',
  'Na retirada, leve o bolo no piso do carro, sempre na horizontal.',
];

const round2 = (n) => Math.round(n * 100) / 100;
/** "R$ 250" (sem os centavos quando são zero). */
const brl = (v) => money(v).replace(',00', '');

/** Valores da escolha atual (tamanho × quantidade). O Pix segue a mesma conta do carrinho. */
function quote(p, size, qty) {
  const unit = priceOf(p, size || 'p');
  const pix = (v) => round2(v - round2(v * (SITE.pix.discountPct / 100)));
  return { unit, unitPix: pix(unit), total: round2(unit * qty) };
}

function listText(items) {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}` : items[0] || '';
}

/* ───────── Blocos ───────── */
function priceHtml(q) {
  return html`<strong class="price pd-price__value">${money(q.unit)}</strong><span class="pd-price__pix">${money(q.unitPix)} no Pix</span>`;
}

/** "Receba a partir de <data real>": abre a folha de entrega da moldura (data-open-receive). */
function receiveRow(p) {
  const ctx = receiveContext();
  const day = dayLabel(schedule.earliest(p.prepHours));
  const pickup = ctx.mode === 'pickup';
  return listRow({
    iconName: pickup ? 'store' : 'calendar',
    title: `${pickup ? 'Retire' : 'Receba'} a partir de ${day}`,
    desc: pickup ? `${SITE.pickup.name} · ${SITE.pickup.address}` : `${ctx.label} ${ctx.place}`,
    trail: 'Trocar',
    attrs: 'data-open-receive aria-haspopup="dialog"',
  });
}

function deliveryChips() {
  const { fee, freeAbove } = SITE.shipping;
  return chipRow(
    [
      { icon: 'truck', label: `Entrega ${money(fee)}`, info: true },
      { icon: 'check-circle', label: `Grátis acima de ${brl(freeAbove)}`, info: true, tone: 'positive' },
      { icon: 'store', label: 'Retirada grátis', info: true },
    ],
    { label: 'Entrega e retirada', cls: 'pd-facts' },
  );
}

function sizeGroup(p) {
  const sizes = sizesOf(p);
  if (!sizes.length) return '';
  return html`
    <section class="pd-group">
      ${optionGroupHead('Tamanho', { hint: 'Escolha 1', required: true, done: true, id: 'pd-size-t' })}
      <div class="pd-sizes" role="radiogroup" aria-labelledby="pd-size-t">
        ${sizes.map(
          (s, i) => html`
            <label class="option pd-size">
              <input type="radio" name="size" value="${s.id}" ${i === 0 ? html`checked` : ''} />
              <span class="option__body">
                <span class="option__title">${s.label} · ${s.diameter}</span>
                <span class="option__desc">${s.serves}</span>
              </span>
              <strong class="pd-size__price">${money(priceOf(p, s.id))}</strong>
              <span class="option__check">${icon('check')}</span>
            </label>
          `,
        )}
      </div>
    </section>
  `;
}

function noteGroup(cake) {
  return html`
    <section class="pd-group">
      ${optionGroupHead(cake ? 'Mensagem no bolo ou observação' : 'Alguma observação?', { hint: 'Opcional', id: 'pd-note-t' })}
      <div class="pd-note">
        <textarea
          class="textarea"
          id="pd-note"
          rows="2"
          maxlength="${NOTE_MAX}"
          aria-labelledby="pd-note-t"
          aria-describedby="pd-note-count"
          placeholder="${cake ? 'Ex.: escrever “Parabéns, Ana!”' : 'Ex.: nome, idade, cor ou tema da festa'}"
          data-pd-note
        ></textarea>
        <span class="pd-note__count" id="pd-note-count" data-pd-note-count>0/${NOTE_MAX}</span>
      </div>
    </section>
  `;
}

function details(p) {
  const cake = isCake(p);
  const item = (title, body) => html`
    <details>
      <summary>${title}${icon('chevron-down')}</summary>
      <div class="accordion__body">${body}</div>
    </details>
  `;
  return html`
    <div class="card accordion pd-details">
      ${item(cake ? 'Sobre este bolo' : 'Sobre este item', html`<p>${p.long}</p>`)}
      ${p.ingredients?.length
        ? item(
            'Ingredientes',
            html`<p>${listText(p.ingredients)}.</p>
              ${p.allergens?.length ? html`<p>Contém ${listText(p.allergens.map((a) => a.toLowerCase()))}.</p>` : ''}`,
          )
        : ''}
      ${cake
        ? item(
            'Conservação',
            html`<ul class="pd-tips">
              ${CARE_TIPS.map((t) => html`<li>${t}</li>`)}
            </ul>`,
          )
        : ''}
      ${item(
        'Entrega e cancelamento',
        html`<p>
            Entrega em ${SITE.region} por ${money(SITE.shipping.fee)}, grátis acima de ${brl(SITE.shipping.freeAbove)}. Retirada sem custo no ${SITE.pickup.name}. Dia e
            horário você escolhe ao fechar o pedido.
          </p>
          <p>Dá para cancelar sem custo enquanto o pedido não entrar em produção.</p>`,
      )}
    </div>
  `;
}

function reviewCard(r) {
  return html`
    <figure class="pd-review">
      <figcaption class="pd-review__head">
        <span class="avatar avatar--sm" aria-hidden="true">${r.name[0]}</span>
        <span class="pd-review__who"><strong>${r.name}</strong>${stars(r.rating)}</span>
        <time datetime="${r.date}">${dateShort(r.date)}</time>
      </figcaption>
      <blockquote>${r.text}</blockquote>
    </figure>
  `;
}

function reviewsBlock(p) {
  const own = REVIEWS.filter((r) => r.productId === p.id);
  const avg = Number(p.rating).toFixed(1).replace('.', ',');
  return html`
    <section class="pd-block" id="pd-avaliacoes" aria-labelledby="pd-rev-t">
      <div class="section-head">
        <h2 class="section-title" id="pd-rev-t">Avaliações</h2>
        <p class="pd-score">${icon('star')}<strong>${avg}</strong><span>${plural(p.reviews, 'avaliação', 'avaliações')}</span></p>
      </div>
      ${own.length
        ? html`<div class="rail pd-reviews">${own.map(reviewCard)}</div>`
        : html`<p class="pd-reviews__none">Quem pediu deu nota ${avg}. Os comentários por escrito aparecem aqui assim que chegarem.</p>`}
    </section>
  `;
}

/** Fileira de produtos em carrossel compacto ("Peça também"). */
function shelf(title, list, { href = '', id }) {
  if (!list.length) return '';
  return html`
    <section class="pd-block" aria-labelledby="${id}">
      ${sectionHead(title, { href, id })}
      <div class="rail pd-shelf">${list.map((x) => productCard(x, { compact: true }))}</div>
    </section>
  `;
}

function notFound() {
  return html`
    <div class="container">
      <div class="empty pd-missing">
        <div class="empty__art">${icon('cake')}</div>
        <h1>Este item saiu do cardápio</h1>
        <p>O link pode estar desatualizado. Veja o que está disponível ou monte o seu bolo em 3D.</p>
        <div class="pd-missing__actions">
          <a class="btn" href="#/cardapio">Ver cardápio</a>
          <a class="btn btn--secondary" href="#/monte-seu-bolo">${icon('cube')} Montar meu bolo em 3D</a>
        </div>
      </div>
    </div>
  `;
}

export default {
  title: (ctx) => getProduct(ctx.params.id)?.name || 'Item não encontrado',
  layout: 'default',

  render(ctx) {
    const p = getProduct(ctx.params.id);
    if (!p) return notFound();

    const cake = isCake(p);
    const cat = CATEGORIES.find((c) => c.id === p.cat);
    const q = quote(p, 'p', 1);
    const avg = Number(p.rating).toFixed(1).replace('.', ',');
    const ready = prepLabel(p.prepHours);
    const others = addOns(6).filter((x) => x.id !== p.id);

    return html`
      <article class="pd">
        <div class="container">
          <div class="pd-grid">
            <div class="pd-crumb only-desktop">
              ${breadcrumb([{ href: '#/cardapio', label: 'Cardápio' }, { href: `#/cardapio?cat=${p.cat}`, label: cat?.label || 'Bolos' }, { label: p.name }])}
            </div>

            <div class="pd-photo">
              ${photo(p.photo, { w: 720, alt: p.name, eager: true, priority: true, sizes: '(min-width: 900px) 52vw, (min-width: 720px) 50vw, 100vw' })}
              ${p.badge ? html`<span class="badge badge--float pd-photo__badge">${p.badge}</span>` : ''}
              <button class="fav-btn pd-photo__btn pd-photo__back" type="button" data-back="/cardapio" aria-label="Voltar">${icon('arrow-left')}</button>
              <div class="pd-photo__actions">
                ${favButton(p.id, { cls: 'pd-photo__btn' })}
                <button class="fav-btn pd-photo__btn" type="button" data-pd-share aria-label="Compartilhar ${p.name}">${icon('share')}</button>
              </div>
            </div>

            <div class="pd-buy">
              <div class="pd-buy__body">
                <header class="pd-head">
                  <h1 class="pd-title">${p.name}</h1>
                  <div class="meta pd-meta">
                    <button class="pd-meta__rating" type="button" data-pd-goto-reviews aria-label="Nota ${avg} de 5, ${plural(p.reviews, 'avaliação', 'avaliações')}. Ver avaliações">
                      ${rating(p.rating, p.reviews)}
                    </button>
                    ${ready ? html`<span class="meta__item">${ready}</span>` : ''}
                    <a class="meta__item pd-meta__cat" href="#/cardapio?cat=${p.cat}">${cat?.label || 'Cardápio'}</a>
                  </div>
                  <p class="pd-price" aria-live="polite" data-pd-price>${priceHtml(q)}</p>
                  <p class="pd-desc">${p.desc}</p>
                </header>

                <div class="pd-recv">
                  <div class="card" data-pd-receive>${receiveRow(p)}</div>
                  ${deliveryChips()}
                </div>

                ${sizeGroup(p)} ${noteGroup(cake)}
              </div>

              <div class="sticky-cta pd-sticky pd-cta">
                ${qtyStepper(1)}
                ${priceButton(html`<span data-pd-add-label>Adicionar<span class="pd-cta__more"> ao carrinho</span></span>`, q.total, { attrs: 'data-pd-add', cls: 'btn--lg' })}
              </div>
            </div>

            <div class="pd-more">
              ${shelf('Peça também', others, { href: '#/cardapio?cat=acess', id: 'pd-also-t' })}
              ${cake
                ? ''
                : shelf('Bolos mais pedidos', searchProducts().filter(isCake).slice(0, 6), { href: '#/cardapio', id: 'pd-cakes-t' })}
              ${p.customizable
                ? html`<div class="pd-block">
                    ${promoBanner({
                      tone: 'stage',
                      tag: 'Só na BOLAB',
                      title: 'Quer este bolo do seu jeito?',
                      text: 'Troque massa, recheio e cobertura em 3D.',
                      cta: 'Personalizar este bolo',
                      href: `#/monte-seu-bolo?base=${p.id}`,
                      img: 'assets/img/cz-belga.webp',
                      cutout: true,
                    })}
                  </div>`
                : ''}
              <div class="pd-block">${details(p)}</div>
              ${reviewsBlock(p)}
            </div>
          </div>
        </div>
      </article>
    `;
  },

  mount(root, ctx) {
    const p = getProduct(ctx.params.id);
    if (!p) return undefined;

    const sizes = sizesOf(p);
    const priceEl = root.querySelector('[data-pd-price]');
    const noteEl = root.querySelector('[data-pd-note]');
    const countEl = root.querySelector('[data-pd-note-count]');
    const addBtn = root.querySelector('[data-pd-add]');
    const addLabel = root.querySelector('[data-pd-add-label]');
    const receiveEl = root.querySelector('[data-pd-receive]');

    let size = sizes.length ? sizes[0].id : null;
    let qty = 1;
    let leaving = false;
    let doneTimer = 0;

    function update() {
      const q = quote(p, size, qty);
      priceEl.innerHTML = String(priceHtml(q));
      addBtn.querySelector('.btn__price').textContent = money(q.total);
    }

    /** Computador: a pessoa continua na tela, então o próprio botão confirma por um instante. */
    function celebrate() {
      const idle = addLabel.innerHTML;
      addBtn.classList.add('is-done');
      addLabel.textContent = 'Adicionado';
      doneTimer = setTimeout(() => {
        addBtn.classList.remove('is-done');
        addLabel.innerHTML = idle;
      }, 1400);
    }

    function add() {
      // Um toque duplo não pode colocar duas unidades.
      if (leaving || addBtn.classList.contains('is-done')) return;
      if (!cart.addProduct(p.id, { size: size || 'p', qty, note: noteEl.value.trim() })) return;
      if (WIDE.matches) {
        celebrate();
        toast(`${p.name} foi para o carrinho`, { type: 'success', action: { label: 'Ver carrinho', href: '#/carrinho' } });
        return;
      }
      // Celular: como nos apps de delivery, volta para onde a pessoa estava; lá a barra
      // "Ver carrinho" já aparece com o item e o valor.
      leaving = true;
      toast(`${p.name} foi para o carrinho`, { type: 'success' });
      goBack('/cardapio');
    }

    async function share() {
      const url = location.href;
      if (navigator.share) {
        try {
          await navigator.share({ title: `${p.name} · BOLAB`, text: p.desc, url });
          return;
        } catch (err) {
          if (err?.name === 'AbortError') return; // a pessoa fechou a janela de compartilhar
        }
      }
      const ok = await copyText(url);
      toast(ok ? 'Link copiado. Agora é só colar e enviar.' : 'Não deu para copiar. Copie o link pela barra de endereço.', { type: ok ? 'success' : 'error' });
    }

    on(root, 'change', 'input[name="size"]', (_ev, el) => {
      size = el.value;
      update();
    });

    root.addEventListener('qty', (ev) => {
      if (!ev.target.closest('.pd-cta')) return;
      qty = ev.detail;
      update();
    });

    on(root, 'input', '[data-pd-note]', (_ev, el) => {
      countEl.textContent = `${el.value.length}/${NOTE_MAX}`;
      countEl.classList.toggle('is-full', el.value.length >= NOTE_MAX);
      // o campo cresce com o texto (até o limite do CSS), em vez de rolar por dentro
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    });

    on(root, 'click', '[data-pd-add]', add);
    on(root, 'click', '[data-pd-share]', share);
    on(root, 'click', '[data-pd-goto-reviews]', () => {
      root.querySelector('#pd-avaliacoes')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Trocou entrega/retirada na folha: a linha "Receba a partir de…" acompanha.
    const onReceive = () => {
      receiveEl.innerHTML = String(receiveRow(p));
    };
    window.addEventListener('bolab:receive', onReceive);

    return () => {
      clearTimeout(doneTimer);
      window.removeEventListener('bolab:receive', onReceive);
    };
  },
};
