// BOLAB — pagamentos (#/conta/pagamentos).
// A loja nunca guarda o número completo nem o código de segurança: só bandeira, final e validade.
import { html, icon, on, toast, formData, applyErrors, validators, bindMasks, cardBrand, openDialog, confirmDialog } from '../ui.js';
import { cards } from '../store.js';
import { SITE } from '../data/site.js';
import { accountPage, bindAccount, rerenderOn, withLoading } from './account.js';
import { clearErrorsOnInput } from './auth.js';

/** Linha de um cartão salvo: bandeira, final, validade e titular. Nada além disso existe guardado. */
function cardRow(c) {
  const expired = !validators.expiry(String(c.expiry || ''));
  return html`
    <li class="acc-pay" aria-label="${c.brand} final ${c.last4}">
      <span class="row__icon">${icon('credit-card')}</span>
      <div class="acc-pay__body">
        <strong>
          ${c.brand} •••• ${c.last4}
          ${expired ? html`<span class="badge badge--red">Vencido</span>` : c.isDefault ? html`<span class="badge badge--rose">Padrão</span>` : ''}
        </strong>
        <span>Vence ${c.expiry} · ${c.holder}</span>
        ${c.isDefault ? '' : html`<button class="acc-pay__default" type="button" data-default="${c.id}">Tornar padrão</button>`}
      </div>
      <button class="icon-btn acc-pay__remove" type="button" data-remove="${c.id}" aria-label="Excluir ${c.brand} final ${c.last4}">${icon('trash')}</button>
    </li>
  `;
}

function openCardForm() {
  const hasCards = cards.list().length > 0;
  const dlg = openDialog({
    title: 'Novo cartão',
    body: html`
      <form class="acc-form" id="acc-card-form" novalidate>
        <div class="field">
          <label for="cc-number">Número do cartão</label>
          <div class="input-group">
            <input class="input" id="cc-number" name="number" type="text" inputmode="numeric" autocomplete="cc-number" data-mask="card" placeholder="0000 0000 0000 0000" autofocus />
            <span class="badge acc-brand" data-brand hidden></span>
          </div>
        </div>
        <div class="field">
          <label for="cc-holder">Nome impresso no cartão</label>
          <input class="input" id="cc-holder" name="holder" type="text" autocomplete="cc-name" autocapitalize="characters" spellcheck="false" maxlength="40" />
        </div>
        <div class="field acc-form__short">
          <label for="cc-expiry">Validade</label>
          <input class="input" id="cc-expiry" name="expiry" type="text" inputmode="numeric" autocomplete="cc-exp" data-mask="expiry" placeholder="MM/AA" />
        </div>
        ${hasCards
          ? html`<label class="check">
              <input type="checkbox" name="isDefault" value="1" />
              <span>Usar como cartão padrão</span>
            </label>`
          : ''}
        <p class="acc-note">${icon('lock')}<span>Nunca guardamos o número completo nem o código de segurança. Ficam salvos só a bandeira, os 4 últimos dígitos e a validade.</span></p>
      </form>
    `,
    footer: html`
      <button class="btn btn--neutral" type="button" data-dialog-close>Cancelar</button>
      <button class="btn" type="submit" form="acc-card-form">Salvar cartão</button>
    `,
  });

  const form = dlg.el.querySelector('form');
  const f = form.elements;
  const brandTag = form.querySelector('[data-brand]');
  bindMasks(form);
  clearErrorsOnInput(form);

  // A bandeira aparece no campo assim que os primeiros dígitos permitem reconhecer.
  f.number.addEventListener('input', () => {
    const brand = cardBrand(f.number.value);
    brandTag.hidden = brand === 'Cartão' || !f.number.value;
    brandTag.textContent = brand;
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
    toast(`${saved.brand} final ${saved.last4} salvo.`, { type: 'success' });
  });

  return dlg;
}

export default {
  title: 'Pagamentos',
  layout: 'plain',
  auth: true,

  render() {
    const list = [...cards.list()].sort((x, y) => Number(Boolean(y.isDefault)) - Number(Boolean(x.isDefault)));
    return accountPage({
      title: 'Pagamentos',
      active: 'pagamentos',
      body: html`
        <section class="acc-group">
          <h2 class="acc-group__title">Sempre disponível</h2>
          <div class="card acc-list">
            <div class="row">
              <span class="row__icon acc-pix">${icon('pix')}</span>
              <span class="row__body">
                <span class="row__title">Pix</span>
                <span class="row__desc">Aprovação na hora</span>
              </span>
              <span class="badge badge--green">${SITE.pix.discountPct}% OFF</span>
            </div>
          </div>
        </section>

        <section class="acc-group">
          <h2 class="acc-group__title">Cartões de crédito</h2>
          ${list.length
            ? html`<ul class="card acc-list">${list.map(cardRow)}</ul>`
            : html`
                <div class="card">
                  <div class="empty acc-empty">
                    <div class="empty__art">${icon('credit-card')}</div>
                    <h2>Nenhum cartão salvo</h2>
                    <p>Salve um cartão e pague os próximos pedidos sem digitar tudo de novo. Parcele em até ${SITE.card.maxInstallments}x sem juros.</p>
                  </div>
                </div>
              `}
          <button class="btn btn--secondary acc-add" type="button" data-add>${icon('plus')} Adicionar cartão</button>
        </section>

        <p class="acc-note">${icon('lock')}<span>Nunca guardamos o número completo nem o código de segurança dos seus cartões.</span></p>
      `,
    });
  },

  mount(root, ctx) {
    bindAccount(root);
    on(root, 'click', '[data-add]', () => openCardForm());
    on(root, 'click', '[data-default]', (_ev, btn) => {
      cards.setDefault(btn.dataset.default);
      toast('Cartão padrão atualizado.', { type: 'success' });
    });
    on(root, 'click', '[data-remove]', async (_ev, btn) => {
      const c = cards.get(btn.dataset.remove);
      if (!c) return;
      const ok = await confirmDialog({
        title: 'Excluir este cartão?',
        message: `${c.brand} final ${c.last4}. Você pode cadastrar de novo quando quiser.`,
        confirmLabel: 'Excluir',
        cancelLabel: 'Manter',
        danger: true,
      });
      if (!ok) return;
      cards.remove(c.id);
      toast('Cartão excluído.');
    });
    return rerenderOn(ctx, ['cards']);
  },
};
