// BOLAB — indique e ganhe (#/conta/indicar).
// DEMONSTRAÇÃO: o código é gerado a partir da conta, mas ainda não existe contagem de indicações.
import { html, icon, on, toast, money, copyText } from '../ui.js';
import { auth } from '../store.js';
import { SITE } from '../data/site.js';
import { accountPage, firstName } from './account.js';
import { demoNote } from './auth.js';

const REWARD = 20; // crédito para quem indica (R$)
const FRIEND_PCT = 10; // desconto para quem foi indicado (%)

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
  { title: 'Envie o seu código', text: 'Mande para as amigas, a família, o grupo do trabalho: quem tiver uma data especial chegando.' },
  { title: `Sua amiga ganha ${FRIEND_PCT}% OFF`, text: 'O desconto vale no primeiro pedido dela, usando o seu código.' },
  { title: `Você ganha ${money(REWARD).replace(/,00$/, '')}`, text: 'O crédito entra na sua conta assim que ela receber o bolo.' },
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
        <section class="acc-refer">
          <span class="eyebrow">${icon('gift')} Bolo bom a gente divide</span>
          <h2>Indique uma amiga e <em>ganhe ${money(REWARD).replace(/,00$/, '')}.</em></h2>
          <p>Ela ganha ${FRIEND_PCT}% OFF no primeiro pedido. Você ganha ${money(REWARD).replace(/,00$/, '')} em créditos a cada amiga que receber o bolo.</p>

          <div class="acc-refer__code">
            <div>
              <small>Seu código</small>
              <strong data-code>${code}</strong>
            </div>
            <button class="btn btn--sm" type="button" data-copy-code aria-label="Copiar o código ${code}">${icon('copy')} Copiar</button>
          </div>

          <div class="acc-refer__share">
            <a class="btn btn--wa" href="https://wa.me/?text=${encodeURIComponent(inviteText(code))}" target="_blank" rel="noopener">${icon('whatsapp')} Enviar no WhatsApp</a>
            ${canShare ? html`<button class="btn btn--glass" type="button" data-share>${icon('share')} Compartilhar</button>` : ''}
            <button class="btn btn--glass" type="button" data-copy-invite>${icon('copy')} Copiar convite</button>
          </div>
        </section>

        <section aria-label="Como funciona">
          <h2 class="acc-subtitle">Como funciona</h2>
          <ol class="acc-steps">
            ${STEPS.map(
              (s, i) => html`
                <li>
                  <span class="acc-steps__num" aria-hidden="true">${i + 1}</span>
                  <div>
                    <h3>${s.title}</h3>
                    <p>${s.text}</p>
                  </div>
                </li>
              `,
            )}
          </ol>
        </section>

        <section class="card card--pad" aria-label="Suas indicações">
          <div class="acc-card__head">
            <h2>Suas indicações</h2>
            <p>Quando alguém pedir com o seu código, aparece aqui.</p>
          </div>
          <div class="acc-refer-stats">
            <div><strong>0</strong><span>indicações até agora</span></div>
            <div><strong>${money(0)}</strong><span>em créditos</span></div>
          </div>
          ${demoNote('as indicações ainda não são contabilizadas e o código não vale como cupom no carrinho. Quando o programa entrar no ar, tudo aparece nesta tela.')}
        </section>
      `,
    });
  },

  mount(root) {
    const user = auth.user();
    if (!user) return;
    const code = referralCode(user);

    on(root, 'click', '[data-copy-code]', async () => {
      const ok = await copyText(code);
      toast(ok ? `Código ${code} copiado.` : `Seu código é ${code}.`, { type: 'success' });
    });

    on(root, 'click', '[data-copy-invite]', async () => {
      const ok = await copyText(inviteText(code));
      toast(ok ? 'Convite copiado. Agora é só colar na conversa.' : `Não deu para copiar. Seu código é ${code}.`, { type: ok ? 'success' : 'info' });
    });

    on(root, 'click', '[data-share]', async () => {
      try {
        await navigator.share({ title: `${SITE.name} — ${SITE.tagline}`, text: inviteText(code) });
      } catch (err) {
        if (err?.name === 'AbortError') return; // a pessoa fechou a janela de compartilhar
        const ok = await copyText(inviteText(code));
        toast(ok ? 'Convite copiado. Agora é só colar na conversa.' : `Seu código é ${code}.`, { type: 'success' });
      }
    });
  },
};
