// BOLAB — carteira de cupons (#/conta/cupons).
// As regras (validade, mínimo, primeiro pedido) são as da loja: aqui só mostramos.
import { html, icon, on, toast, money, toDate, setFieldError } from '../ui.js';
import { notice } from '../components.js';
import { cart } from '../store.js';
import { navigate } from '../router.js';
import { COUPONS } from '../data/site.js';
import { accountPage, walletCodes, addToWallet, couponStatus } from './account.js';
import { clearErrorsOnInput } from './auth.js';

const DAY_FULL = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

/** Recado que sobrevive ao redesenho da tela depois de adicionar um cupom pelo código. */
let flash = null;

/** A loja considera o cupom vencido a partir de 0h da data `expires`: o último dia válido é a véspera. */
function lastValidDay(coupon) {
  const d = toDate(coupon.expires);
  return DAY_FULL.format(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
}

function stub(c) {
  if (c.type === 'pct') return html`<strong>${c.value}%</strong><span>OFF</span>`;
  if (c.type === 'fixed') return html`<strong class="is-small">${money(c.value).replace(/,00$/, '')}</strong><span>OFF</span>`;
  return html`${icon('truck')}<span>Entrega grátis</span>`;
}

function ticket(code) {
  const c = COUPONS[code];
  const st = couponStatus(c);
  const applied = cart.couponCode() === code;
  const subtotal = cart.totals().subtotal;
  const missing = c.minSubtotal && !cart.isEmpty() && subtotal < c.minSubtotal ? c.minSubtotal - subtotal : 0;
  return html`
    <article class="acc-ticket ${st.usable ? '' : 'is-off'}" data-ticket="${code}">
      <div class="acc-ticket__stub">${stub(c)}</div>
      <div class="acc-ticket__body">
        <div class="acc-ticket__title">
          <h2>${c.label}</h2>
          ${!st.usable ? html`<span class="badge">${st.why}</span>` : applied ? html`<span class="badge badge--green">${icon('check')} No carrinho</span>` : ''}
        </div>
        <ul class="acc-ticket__rules">
          <li>${icon('check')}<span>${c.firstOrderOnly ? 'Válido só no primeiro pedido' : 'Vale em qualquer pedido'}</span></li>
          <li>${icon('check')}<span>${c.minSubtotal ? `Para compras a partir de ${money(c.minSubtotal)}` : 'Sem valor mínimo'}</span></li>
          <li>${icon('check')}<span>${c.expires ? `Válido até ${lastValidDay(c)}` : 'Sem data de validade'}</span></li>
        </ul>
        ${st.usable
          ? html`
              ${missing > 0 ? html`<p class="acc-ticket__hint">Faltam ${money(missing)} no seu carrinho para usar este cupom.</p>` : ''}
              <div class="acc-ticket__foot">
                <button class="acc-ticket__code" type="button" data-copy-coupon="${code}" aria-label="Copiar o código ${code}">${code} ${icon('copy')}</button>
                ${applied && !cart.isEmpty()
                  ? html`<a class="btn btn--sm btn--secondary" href="#/carrinho">Ver carrinho</a>`
                  : html`<button class="btn btn--sm" type="button" data-use="${code}">Usar agora</button>`}
              </div>
              <div class="acc-ticket__msg" data-ticket-msg hidden></div>
            `
          : html`
              <div class="acc-ticket__foot">
                <span class="acc-ticket__code">${code}</span>
              </div>
            `}
      </div>
    </article>
  `;
}

export default {
  title: 'Cupons',
  layout: 'plain',
  auth: true,

  render() {
    const codes = walletCodes();
    // Os que dá para usar vêm primeiro.
    const sorted = [...codes].sort((a, b) => Number(couponStatus(COUPONS[b]).usable) - Number(couponStatus(COUPONS[a]).usable));
    const usable = sorted.filter((code) => couponStatus(COUPONS[code]).usable).length;
    const message = flash;
    flash = null;
    return accountPage({
      title: 'Cupons',
      active: 'cupons',
      body: html`
        <form class="card card--pad acc-coupon-add" novalidate data-add-coupon>
          <div class="field">
            <label for="cp-code">Tem um código de cupom?</label>
            <div class="acc-coupon-add__row">
              <input class="input" id="cp-code" name="code" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="24" placeholder="Digite o código" />
              <button class="btn" type="submit">Adicionar</button>
            </div>
          </div>
          ${message
            ? notice(
                html`${message.text}
                  <a class="link" href="${message.href}">${message.cta}</a>`,
                { tone: message.tone, iconName: message.tone === 'green' ? 'check-circle' : 'info' },
              )
            : ''}
        </form>

        <div class="acc-toolbar">
          <div>
            <h2 class="acc-subtitle">Sua carteira</h2>
            <p>${usable ? `${usable === 1 ? '1 cupom pronto' : `${usable} cupons prontos`} para usar. Só vale um por pedido.` : 'Nenhum cupom disponível no momento.'}</p>
          </div>
        </div>

        <div class="acc-list acc-list--tickets">${sorted.map(ticket)}</div>

        <p class="acc-note">${icon('info')}<span>O desconto aparece no carrinho assim que o cupom é aplicado. No Pix você ainda soma o desconto do pagamento.</span></p>
      `,
    });
  },

  mount(root, ctx) {
    clearErrorsOnInput(root);

    on(root, 'click', '[data-use]', (_ev, btn) => {
      const code = btn.dataset.use;
      const res = cart.applyCoupon(code);
      if (!res.ok) {
        // Mostra o motivo que a loja deu e oferece o caminho para resolver.
        const box = btn.closest('[data-ticket]').querySelector('[data-ticket-msg]');
        box.hidden = false;
        box.innerHTML = String(html`<span>${res.message}</span><a class="link" href="#/cardapio">Ver cardápio</a>`);
        return;
      }
      if (cart.isEmpty()) {
        toast(`Cupom ${code} guardado! Ele entra sozinho quando você escolher seu bolo.`, { type: 'success', duration: 4200 });
        navigate('/cardapio');
      } else {
        toast(`Cupom ${code} aplicado ao seu carrinho.`, { type: 'success' });
        navigate('/carrinho');
      }
    });

    on(root, 'submit', '[data-add-coupon]', (ev, form) => {
      ev.preventDefault();
      const input = form.elements.code;
      const code = input.value.trim().toUpperCase();
      if (!code) {
        setFieldError(form, 'code', 'Digite o código do cupom.');
        input.focus();
        return;
      }
      const coupon = COUPONS[code];
      const res = cart.applyCoupon(code); // a loja valida e, se der, já aplica ao carrinho
      if (!coupon || !couponStatus(coupon).usable) {
        setFieldError(form, 'code', res.message || 'Este cupom não está disponível.');
        input.focus();
        input.select();
        return;
      }
      addToWallet(code);
      const empty = cart.isEmpty();
      if (res.ok) {
        flash = {
          tone: 'green',
          text: empty ? `Cupom ${code} guardado. Ele entra sozinho no seu próximo pedido.` : `Cupom ${code} aplicado ao seu carrinho.`,
          cta: empty ? 'Ver cardápio' : 'Ver carrinho',
          href: empty ? '#/cardapio' : '#/carrinho',
        };
      } else {
        flash = {
          tone: 'amber',
          text: `${res.message} O cupom ${code} fica na sua carteira para quando você quiser usar.`,
          cta: 'Ver cardápio',
          href: '#/cardapio',
        };
      }
      ctx.rerender();
    });
  },
};
