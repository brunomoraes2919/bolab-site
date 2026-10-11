// BOLAB — cupons (#/conta/cupons).
// As regras (validade, mínimo, primeiro pedido) são as da loja: aqui só mostramos.
import { html, icon, on, toast, money, toDate, setFieldError } from '../ui.js';
import { notice } from '../components.js';
import { cart } from '../store.js';
import { navigate } from '../router.js';
import { COUPONS } from '../data/site.js';
import { accountPage, bindAccount, walletCodes, addToWallet, couponStatus } from './account.js';
import { clearErrorsOnInput } from './auth.js';

const DAY = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const short = (v) => money(v).replace(/,00$/, '');

/** Recado que sobrevive ao redesenho da tela depois de adicionar um cupom pelo código. */
let flash = null;

/** A loja considera o cupom vencido a partir de 0h da data `expires`: o último dia válido é a véspera. */
function lastValidDay(coupon) {
  const d = toDate(coupon.expires);
  return DAY.format(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
}

/** O valor do cupom, grande, no canhoto. */
function value(c) {
  if (c.type === 'pct') return html`<strong>${c.value}%</strong><span>OFF</span>`;
  if (c.type === 'fixed') return html`<strong>${short(c.value)}</strong><span>OFF</span>`;
  return html`${icon('truck')}<span>Entrega grátis</span>`;
}

/** A regra em uma linha: "Só no 1º pedido · Sem valor mínimo". */
function rule(c) {
  return [
    c.firstOrderOnly ? 'Só no 1º pedido' : '',
    c.minSubtotal ? `Pedidos a partir de ${short(c.minSubtotal)}` : 'Sem valor mínimo',
    c.expires ? `Até ${lastValidDay(c)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Por que o cupom não vale mais, sem repetir o que a etiqueta já diz. */
function offReason(c, st) {
  if (st.why === 'Vencido') return c.expires ? `Valeu até ${lastValidDay(c)}` : 'Este cupom não vale mais';
  return 'Você já fez o seu primeiro pedido';
}

function coupon(code) {
  const c = COUPONS[code];
  const st = couponStatus(c);
  const applied = st.usable && cart.couponCode() === code;
  const subtotal = cart.totals().subtotal;
  const missing = st.usable && c.minSubtotal && !cart.isEmpty() && subtotal < c.minSubtotal ? c.minSubtotal - subtotal : 0;
  return html`
    <article class="acc-coupon ${st.usable ? '' : 'is-off'}" data-ticket="${code}">
      <div class="acc-coupon__value">${value(c)}</div>
      <div class="acc-coupon__body">
        <div class="acc-coupon__head">
          <h3>${c.label}</h3>
          ${!st.usable ? html`<span class="badge">${st.why}</span>` : applied ? html`<span class="badge badge--green">No carrinho</span>` : ''}
        </div>
        <p class="acc-coupon__rule">${!st.usable ? offReason(c, st) : missing > 0 ? `Faltam ${money(missing)} no carrinho` : rule(c)}</p>
        ${st.usable
          ? html`
              <div class="acc-coupon__foot">
                <button class="acc-coupon__code" type="button" data-copy-coupon="${code}" aria-label="Copiar o código ${code}">${code}${icon('copy')}</button>
                ${applied && !cart.isEmpty()
                  ? html`<a class="btn btn--sm btn--soft" href="#/carrinho">Ver carrinho</a>`
                  : html`<button class="btn btn--sm" type="button" data-use="${code}">Usar</button>`}
              </div>
              <div class="acc-coupon__msg" data-ticket-msg hidden></div>
            `
          : html`<div class="acc-coupon__foot"><span class="acc-coupon__code">${code}</span></div>`}
      </div>
    </article>
  `;
}

export default {
  title: 'Cupons',
  layout: 'plain',
  auth: true,

  render() {
    const wallet = walletCodes();
    const usable = wallet.filter((code) => couponStatus(COUPONS[code]).usable);
    // Indisponíveis: os da carteira que não valem mais para esta pessoa + os cupons da loja já vencidos.
    const expired = Object.keys(COUPONS).filter((code) => couponStatus(COUPONS[code]).why === 'Vencido');
    const off = [...new Set([...wallet.filter((code) => !usable.includes(code)), ...expired])];
    const message = flash;
    flash = null;
    return accountPage({
      title: 'Cupons',
      active: 'cupons',
      body: html`
        <form class="card acc-coupon-add" novalidate data-add-coupon>
          <div class="field">
            <label for="cp-code">Tem um código?</label>
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

        <section class="acc-group">
          <h2 class="acc-group__title">Disponíveis${usable.length ? ` (${usable.length})` : ''}</h2>
          ${usable.length
            ? html`<div class="acc-coupons">${usable.map(coupon)}</div>`
            : html`
                <div class="card">
                  <div class="empty acc-empty">
                    <div class="empty__art">${icon('ticket')}</div>
                    <h2>Nenhum cupom disponível</h2>
                    <p>Quando houver um desconto para você, ele aparece aqui.</p>
                  </div>
                </div>
              `}
          <p class="acc-note">${icon('info')}<span>Um cupom por pedido. O desconto aparece no carrinho.</span></p>
        </section>

        ${off.length
          ? html`
              <section class="acc-group">
                <h2 class="acc-group__title">Indisponíveis</h2>
                <div class="acc-coupons">${off.map(coupon)}</div>
              </section>
            `
          : ''}
      `,
    });
  },

  mount(root, ctx) {
    bindAccount(root);
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
        toast(`Cupom ${code} guardado. Ele entra sozinho quando você escolher seu bolo.`, { type: 'success', duration: 4200 });
        navigate('/cardapio');
      } else {
        toast(`Cupom ${code} aplicado ao carrinho.`, { type: 'success' });
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
      const found = COUPONS[code];
      const res = cart.applyCoupon(code); // a loja valida e, se der, já aplica ao carrinho
      if (!found || !couponStatus(found).usable) {
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
          text: empty ? `Cupom ${code} guardado. Ele entra sozinho no seu próximo pedido.` : `Cupom ${code} aplicado ao carrinho.`,
          cta: empty ? 'Ver cardápio' : 'Ver carrinho',
          href: empty ? '#/cardapio' : '#/carrinho',
        };
      } else {
        flash = {
          tone: 'amber',
          text: `${res.message} O cupom ${code} fica guardado para quando você quiser usar.`,
          cta: 'Ver cardápio',
          href: '#/cardapio',
        };
      }
      ctx.rerender();
    });
  },
};
