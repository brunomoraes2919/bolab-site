// BOLAB — indique e ganhe (#/conta/indicar).
// DEMONSTRAÇÃO: o código é gerado a partir da conta, mas ainda não existe contagem de indicações.
import { html, icon, on, toast, money, copyText } from '../ui.js';
import { auth } from '../store.js';
import { SITE } from '../data/site.js';
import { accountPage, bindAccount, firstName } from './account.js';
import { demoNote } from './auth.js';

const REWARD = 20; // crédito para quem indica (R$)
const FRIEND_PCT = 10; // desconto para quem foi indicado (%)
const reward = () => money(REWARD).replace(/,00$/, '');

/** Código pessoal e estável: primeiro nome + 4 caracteres do identificador da conta. */
function referralCode(user) {
  const name =
    firstName(user)
      .normalize('NFD')
      .replace(/[^A-Za-z]/g, '')
      .toUpperCase()
      .slice(0, 8) || 'BOLAB';
  const tail = String(user.id || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 4)
    .toUpperCase();
  return `${name}${tail}`;
}

const siteUrl = () => `${location.origin}${location.pathname}`;

function inviteText(code) {
  return `Pedi meu bolo na ${SITE.name} e amei! Use meu código ${code} e ganhe ${FRIEND_PCT}% OFF no seu primeiro pedido: ${siteUrl()}`;
}

const STEPS = [
  { title: 'Envie seu código', text: 'Para quem tem uma festa chegando.' },
  { title: `Ela ganha ${FRIEND_PCT}% OFF`, text: 'No primeiro pedido, usando o seu código.' },
  { title: `Você ganha ${reward()}`, text: 'O crédito entra quando ela receber o bolo.' },
];

export default {
  title: 'Indique e ganhe',
  layout: 'plain',
  auth: true,

  render() {
    const user = auth.user();
    if (!user) return '';
    const code = referralCode(user);
    const canShare = typeof navigator.share === 'function';
    return accountPage({
      title: 'Indique e ganhe',
      active: 'indicar',
      body: html`
        <section class="card acc-refer">
          <h2>Ganhe ${reward()} a cada indicação</h2>
          <p>Quem você indicar ganha ${FRIEND_PCT}% OFF no primeiro pedido.</p>

          <div class="acc-code">
            <div>
              <span>Seu código</span>
              <strong data-code>${code}</strong>
            </div>
            <button class="btn btn--sm btn--soft" type="button" data-copy-code aria-label="Copiar o código ${code}">${icon('copy')} Copiar</button>
          </div>

          <div class="acc-refer__share">
            <a class="btn" href="https://wa.me/?text=${encodeURIComponent(inviteText(code))}" target="_blank" rel="noopener">${icon('whatsapp')} Enviar no WhatsApp</a>
            ${canShare
              ? html`<button class="btn btn--secondary" type="button" data-share>${icon('share')} Compartilhar</button>`
              : html`<button class="btn btn--secondary" type="button" data-copy-invite>${icon('copy')} Copiar convite</button>`}
          </div>
        </section>

        <section class="acc-group">
          <h2 class="acc-group__title">Como funciona</h2>
          <ol class="card acc-steps">
            ${STEPS.map(
              (s, i) => html`
                <li>
                  <span class="acc-steps__num" aria-hidden="true">${i + 1}</span>
                  <div>
                    <strong>${s.title}</strong>
                    <span>${s.text}</span>
                  </div>
                </li>
              `,
            )}
          </ol>
        </section>

        <section class="acc-group">
          <h2 class="acc-group__title">Suas indicações</h2>
          <div class="card acc-list">
            <div class="row">
              <span class="row__icon">${icon('users')}</span>
              <span class="row__body"><span class="row__title">Indicações</span><span class="row__desc">Quem pediu com o seu código</span></span>
              <strong class="acc-figure">0</strong>
            </div>
            <div class="row">
              <span class="row__icon">${icon('gift')}</span>
              <span class="row__body"><span class="row__title">Créditos</span><span class="row__desc">Para usar nos próximos pedidos</span></span>
              <strong class="acc-figure">${money(0)}</strong>
            </div>
          </div>
          ${demoNote('as indicações ainda não são contabilizadas e o código não vale como cupom no carrinho.')}
        </section>
      `,
    });
  },

  mount(root) {
    bindAccount(root);
    const user = auth.user();
    if (!user) return;
    const code = referralCode(user);

    on(root, 'click', '[data-copy-code]', async () => {
      const ok = await copyText(code);
      toast(ok ? `Código ${code} copiado.` : `Seu código é ${code}.`, { type: 'success' });
    });

    on(root, 'click', '[data-copy-invite]', async () => {
      const ok = await copyText(inviteText(code));
      toast(ok ? 'Convite copiado. É só colar na conversa.' : `Não deu para copiar. Seu código é ${code}.`, { type: ok ? 'success' : 'info' });
    });

    on(root, 'click', '[data-share]', async () => {
      try {
        await navigator.share({ title: `${SITE.name} — ${SITE.tagline}`, text: inviteText(code) });
      } catch (err) {
        if (err?.name === 'AbortError') return; // a pessoa fechou a janela de compartilhar
        const ok = await copyText(inviteText(code));
        toast(ok ? 'Convite copiado. É só colar na conversa.' : `Seu código é ${code}.`, { type: 'success' });
      }
    });
  },
};
