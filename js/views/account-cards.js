// BOLAB — formas de pagamento (#/conta/pagamentos).
// A loja nunca guarda o número completo nem o código de segurança: só bandeira, final e validade.
import { html, icon, on, toast, formData, applyErrors, validators, bindMasks, cardBrand, openDialog, confirmDialog } from '../ui.js';
import { cards } from '../store.js';
import { SITE } from '../data/site.js';
import { accountPage, rerenderOn, withLoading } from './account.js';
import { clearErrorsOnInput } from './auth.js';

const BRAND_CLASSES = ['visa', 'mastercard', 'amex', 'elo', 'hipercard'];
const brandClass = (brand) => {
  const key = String(brand || '').toLowerCase();
  return BRAND_CLASSES.includes(key) ? `acc-cc--${key}` : '';
};

function cardVisual({ brand, number, holder, expiry, tag = '' }) {
  return html`
    <div class="acc-cc ${brandClass(brand)}" data-cc>
      <div class="acc-cc__top">
        <span class="acc-cc__chip" aria-hidden="true"></span>
        ${tag}
        <span class="acc-cc__brand" data-cc-brand>${brand}</span>
      </div>
      <div class="acc-cc__number" data-cc-number>${number}</div>
      <div class="acc-cc__bottom">
        <div><small>Titular</small><span data-cc-holder>${holder}</span></div>
        <div><small>Validade</small><span data-cc-expiry>${expiry}</span></div>
      </div>
    </div>
  `;
}

function savedCard(c) {
  const expired = !validators.expiry(String(c.expiry || ''));
  const tag = expired
    ? html`<span class="badge badge--red">Vencido</span>`
    : c.isDefault
      ? html`<span class="badge">${icon('check')} Padrão</span>`
      : '';
  return html`
    <article class="acc-pay" aria-label="${c.brand} final ${c.last4}">
      ${cardVisual({ brand: c.brand, number: `•••• •••• •••• ${c.last4}`, holder: c.holder, expiry: c.expiry, tag })}
      <div class="acc-item-actions">
        ${c.isDefault ? '' : html`<button class="btn btn--sm btn--ghost" type="button" data-default="${c.id}">Tornar padrão</button>`}
        <button class="btn btn--sm btn--ghost btn--danger" type="button" data-remove="${c.id}">${icon('trash')} Remover</button>
      </div>
    </article>
  `;
}

/** "4111 11•• •••• ••••" — o que já foi digitado + o que falta. */
function previewNumber(value) {
  const digits = value.replace(/\D/g, '').slice(0, 16);
  return (digits + '•'.repeat(16 - digits.length)).replace(/(.{4})(?=.)/g, '$1 ');
}

function openCardForm() {
  const hasCards = cards.list().length > 0;
  const dlg = openDialog({
    title: 'Novo cartão',
    body: html`
      <form class="auth-form" id="acc-card-form" novalidate>
        <div class="acc-cc-preview" aria-hidden="true">
          ${cardVisual({ brand: 'Cartão', number: previewNumber(''), holder: 'NOME DO TITULAR', expiry: 'MM/AA' })}
        </div>
        <div class="field">
          <label for="cc-number">Número do cartão</label>
          <input class="input" id="cc-number" name="number" type="text" inputmode="numeric" autocomplete="cc-number" data-mask="card" placeholder="0000 0000 0000 0000" autofocus />
        </div>
        <div class="field">
          <label for="cc-holder">Nome do titular</label>
          <input class="input" id="cc-holder" name="holder" type="text" autocomplete="cc-name" autocapitalize="characters" spellcheck="false" placeholder="Como está escrito no cartão" />
        </div>
        <div class="field acc-cc-expiry">
          <label for="cc-expiry">Validade</label>
          <input class="input" id="cc-expiry" name="expiry" type="text" inputmode="numeric" autocomplete="cc-exp" data-mask="expiry" placeholder="MM/AA" />
        </div>
        ${hasCards
          ? html`<label class="check">
              <input type="checkbox" name="isDefault" value="1" />
              <span>Usar como cartão padrão</span>
            </label>`
          : ''}
        <div class="acc-secure">
          ${icon('shield-check')}
          <span>Por segurança, nunca guardamos o número completo nem o código de segurança. Ficam salvos só a bandeira, os 4 últimos dígitos e a validade.</span>
        </div>
      </form>
    `,
    footer: html`
      <button class="btn btn--secondary" type="button" data-dialog-close>Cancelar</button>
      <button class="btn" type="submit" form="acc-card-form">Salvar cartão</button>
    `,
  });

  const form = dlg.el.querySelector('form');
  const f = form.elements;
  const view = dlg.el.querySelector('[data-cc]');
  bindMasks(form);
  clearErrorsOnInput(form);

  form.addEventListener('input', () => {
    const brand = cardBrand(f.number.value);
    view.className = `acc-cc ${brandClass(brand)}`;
    view.querySelector('[data-cc-brand]').textContent = brand;
    view.querySelector('[data-cc-number]').textContent = previewNumber(f.number.value);
    view.querySelector('[data-cc-holder]').textContent = f.holder.value.trim().toUpperCase() || 'NOME DO TITULAR';
    view.querySelector('[data-cc-expiry]').textContent = f.expiry.value || 'MM/AA';
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const data = formData(form);
    const digits = data.number.replace(/\D/g, '');
    const errors = {};
    if (digits.length < 13) errors.number = 'O número do cartão está incompleto.';
    else if (!validators.cardNumber(data.number)) errors.number = 'Este número não parece válido. Confira os dígitos.';
    if (data.holder.replace(/[^\p{L}]/gu, '').length < 3) errors.holder = 'Digite o nome como está no cartão.';
    if (!/^\d{2}\/\d{2}$/.test(data.expiry)) errors.expiry = 'Use o formato MM/AA.';
    else if (!validators.expiry(data.expiry)) errors.expiry = 'Confira a validade: este cartão parece vencido.';
    if (!errors.number && !errors.expiry) {
      const brand = cardBrand(digits);
      const same = cards.list().some((c) => c.last4 === digits.slice(-4) && c.brand === brand && c.expiry === data.expiry);
      if (same) errors.number = 'Este cartão já está salvo na sua conta.';
    }
    if (!applyErrors(form, errors)) return;

    const saved = await withLoading(dlg.el.querySelector('[type="submit"]'), () => {
      const item = cards.save({ number: digits, holder: data.holder, expiry: data.expiry });
      if (data.isDefault) cards.setDefault(item.id);
      return item;
    });
    if (!saved) return;
    dlg.close(saved);
    toast(`${saved.brand} final ${saved.last4} salvo na sua conta.`, { type: 'success' });
  });

  return dlg;
}

export default {
  title: 'Formas de pagamento',
  layout: 'plain',
  auth: true,

  render() {
    const list = [...cards.list()].sort((x, y) => Number(Boolean(y.isDefault)) - Number(Boolean(x.isDefault)));
    return accountPage({
      title: 'Formas de pagamento',
      active: 'pagamentos',
      body: html`
        <section class="card acc-pix" aria-label="Pix">
          <div class="row">
            <span class="row__icon">${icon('pix')}</span>
            <div class="row__body">
              <div class="row__title">Pix</div>
              <div class="row__desc">Sempre disponível, com aprovação na hora.</div>
            </div>
            <span class="badge badge--green">${SITE.pix.discountPct}% OFF</span>
          </div>
        </section>

        <div class="acc-toolbar">
          <div>
            <h2 class="acc-subtitle">Cartões de crédito</h2>
            <p>Parcele em até ${SITE.card.maxInstallments}x sem juros.</p>
          </div>
          ${list.length ? html`<button class="btn only-desktop" type="button" data-add>${icon('plus')} Adicionar cartão</button>` : ''}
        </div>

        ${list.length
          ? html`
              <div class="acc-list">
                ${list.map(savedCard)}
                <button class="acc-add-tile acc-add-tile--card" type="button" data-add>${icon('plus')} Adicionar outro cartão</button>
              </div>
            `
          : html`
              <div class="card">
                <div class="empty acc-empty">
                  <div class="empty__art">${icon('credit-card')}</div>
                  <h2>Nenhum cartão salvo</h2>
                  <p>Salve um cartão e pague as próximas encomendas sem digitar tudo de novo.</p>
                  <button class="btn" type="button" data-add>${icon('plus')} Adicionar cartão</button>
                </div>
              </div>
            `}

        <p class="acc-note">${icon('lock')}<span>Por segurança, nunca guardamos o número completo nem o código de segurança dos seus cartões.</span></p>
      `,
    });
  },

  mount(root, ctx) {
    on(root, 'click', '[data-add]', () => openCardForm());
    on(root, 'click', '[data-default]', (_ev, btn) => {
      cards.setDefault(btn.dataset.default);
      toast('Cartão padrão atualizado.', { type: 'success' });
    });
    on(root, 'click', '[data-remove]', async (_ev, btn) => {
      const c = cards.get(btn.dataset.remove);
      if (!c) return;
      const ok = await confirmDialog({
        title: 'Remover este cartão?',
        message: `${c.brand} final ${c.last4}. Você pode cadastrar de novo quando quiser.`,
        confirmLabel: 'Remover',
        cancelLabel: 'Manter',
        danger: true,
      });
      if (!ok) return;
      cards.remove(c.id);
      toast('Cartão removido.');
    });
    return rerenderOn(ctx, ['cards']);
  },
};
