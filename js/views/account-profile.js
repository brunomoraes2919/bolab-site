// BOLAB — dados pessoais e senha (#/conta/dados).
import { html, raw, icon, initials, on, toast, formData, applyErrors, validators, bindMasks, openDialog, toDate, isoDate } from '../ui.js';
import { auth } from '../store.js';
import { GOOGLE_LOGO } from '../icons.js';
import { accountPage, withLoading } from './account.js';
import { passwordField, bindPasswordFields, clearErrorsOnInput } from './auth.js';

/**
 * Trocar o e-mail pede a senha atual: além de ser mais seguro, a senha é guardada
 * junto com o e-mail, então ela precisa ser regravada depois da troca.
 * → senha digitada (já conferida) ou undefined se a pessoa desistiu.
 */
function askCurrentPassword(newEmail) {
  const dlg = openDialog({
    title: 'Confirme que é você',
    body: html`
      <form class="auth-form" id="acc-confirm-pass" novalidate>
        <p class="muted">Para trocar o e-mail da conta para <strong>${newEmail}</strong>, digite sua senha atual.</p>
        ${passwordField({ id: 'acc-confirm-current', name: 'current', label: 'Senha atual', autofocus: true })}
      </form>
    `,
    footer: html`
      <button class="btn btn--secondary" type="button" data-dialog-close>Cancelar</button>
      <button class="btn" type="submit" form="acc-confirm-pass">Confirmar</button>
    `,
  });
  bindPasswordFields(dlg.el);
  clearErrorsOnInput(dlg.el);
  const form = dlg.el.querySelector('form');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const current = form.elements.current.value;
    if (!applyErrors(form, { current: current ? '' : 'Digite sua senha atual.' })) return;
    // Regravar a mesma senha é o jeito de a loja conferir se ela está certa.
    const res = await withLoading(dlg.el.querySelector('[type="submit"]'), () => auth.changePassword(current, current));
    if (!res) return;
    if (res.ok) dlg.close(current);
    else applyErrors(form, { current: res.message });
  });
  return dlg.closed;
}

export default {
  title: 'Dados pessoais',
  layout: 'plain',
  auth: true,

  render() {
    const user = auth.user();
    if (!user) return '';
    const social = user.provider !== 'email';
    return accountPage({
      title: 'Dados pessoais',
      active: 'dados',
      body: html`
        <form class="card card--pad" novalidate data-profile>
          <div class="acc-card__head">
            <h2>Seus dados</h2>
            <p>Usamos para identificar você e falar sobre os seus pedidos.</p>
          </div>
          <div class="form-grid form-grid--2">
            <div class="field span-2">
              <label for="pf-name">Nome completo</label>
              <input class="input" id="pf-name" name="name" type="text" autocomplete="name" autocapitalize="words" value="${user.name}" />
            </div>
            <div class="field">
              <label for="pf-email">E-mail</label>
              <input
                class="input"
                id="pf-email"
                name="email"
                type="email"
                inputmode="email"
                autocomplete="email"
                autocapitalize="none"
                spellcheck="false"
                value="${user.email}"
                ${social ? raw('readonly aria-describedby="pf-email-hint"') : ''}
              />
              ${social ? html`<div class="field__hint" id="pf-email-hint">Este e-mail vem da sua conta Google.</div>` : ''}
            </div>
            <div class="field">
              <label for="pf-phone">WhatsApp</label>
              <input
                class="input"
                id="pf-phone"
                name="phone"
                type="tel"
                inputmode="tel"
                autocomplete="tel-national"
                data-mask="phone"
                placeholder="(65) 99999-0000"
                value="${user.phone || ''}"
              />
              <div class="field__hint">Para avisar quando seu bolo sair para entrega.</div>
            </div>
            <div class="field">
              <label for="pf-birthday">Data de aniversário</label>
              <input class="input" id="pf-birthday" name="birthday" type="date" autocomplete="bday" min="1900-01-01" max="${isoDate(new Date())}" value="${user.birthday || ''}" />
              <div class="field__hint">Para ganhar um mimo no seu aniversário.</div>
            </div>
          </div>
          <div class="acc-actions">
            <button class="btn" type="submit">Salvar alterações</button>
          </div>
        </form>

        <form class="card card--pad" novalidate data-password>
          <div class="acc-card__head">
            <h2>${social ? 'Criar uma senha' : 'Senha'}</h2>
            <p>${social ? 'Opcional: com uma senha você também entra usando e-mail.' : 'Troque sua senha sempre que achar necessário.'}</p>
          </div>
          ${social
            ? html`<div class="acc-provider">
                ${raw(GOOGLE_LOGO)}<span>Você entrou com o Google (conta de exemplo desta demonstração), então ainda não tem senha na BOLAB.</span>
              </div>`
            : ''}
          <input type="email" name="username" autocomplete="username" value="${user.email}" hidden />
          <div class="form-grid form-grid--2">
            ${social ? '' : html`<div class="span-2">${passwordField({ id: 'pf-current', name: 'current', label: 'Senha atual' })}</div>`}
            ${passwordField({ id: 'pf-next', name: 'next', label: social ? 'Senha' : 'Nova senha', autocomplete: 'new-password', meter: true })}
            ${passwordField({ id: 'pf-confirm', name: 'confirm', label: social ? 'Repita a senha' : 'Repita a nova senha', autocomplete: 'new-password' })}
          </div>
          <div class="acc-actions">
            <button class="btn btn--secondary" type="submit">${icon('lock')} ${social ? 'Criar senha' : 'Alterar senha'}</button>
          </div>
        </form>
      `,
    });
  },

  mount(root, ctx) {
    bindMasks(root);
    bindPasswordFields(root);
    clearErrorsOnInput(root);

    async function saveProfile(form) {
      const user = auth.user();
      if (!user) return;
      const data = formData(form);
      const errors = {};
      if (data.name.length < 2) errors.name = 'Digite seu nome.';
      if (!data.email) errors.email = 'O e-mail não pode ficar em branco.';
      else if (!validators.email(data.email)) errors.email = 'Este e-mail parece incompleto. Confira, por favor.';
      if (data.phone && !validators.phone(data.phone)) errors.phone = 'O número parece incompleto. Use DDD + número.';
      if (data.birthday && (toDate(data.birthday) > new Date() || Number(data.birthday.slice(0, 4)) < 1900)) {
        errors.birthday = 'Confira a data: ela precisa estar no passado.';
      }
      if (!applyErrors(form, errors)) return;

      const email = data.email.toLowerCase();
      const emailChanged = email !== user.email;
      let password;
      if (emailChanged && user.provider === 'email') {
        if (auth.emailExists(email)) {
          applyErrors(form, { email: 'Este e-mail já está em uso por outra conta.' });
          return;
        }
        password = await askCurrentPassword(email);
        if (password === undefined) return;
      }

      const res = await withLoading(form.querySelector('[type="submit"]'), () =>
        auth.update({ name: data.name, email, phone: data.phone, birthday: data.birthday }),
      );
      if (!res) return;
      if (!res.ok) {
        applyErrors(form, { [res.field || 'name']: res.message });
        return;
      }
      if (password !== undefined) await auth.resetPassword(email, password);

      root.querySelectorAll('[data-user-name]').forEach((el) => (el.textContent = res.user.name));
      root.querySelectorAll('[data-user-email]').forEach((el) => (el.textContent = res.user.email));
      root.querySelectorAll('[data-user-initials]').forEach((el) => (el.textContent = initials(res.user.name)));
      root.querySelectorAll('[name="username"]').forEach((el) => (el.value = res.user.email));
      toast('Dados atualizados.', { type: 'success' });
    }

    async function savePassword(form) {
      const user = auth.user();
      if (!user) return;
      const social = user.provider !== 'email';
      const current = form.elements.current?.value ?? '';
      const next = form.elements.next.value;
      const confirm = form.elements.confirm.value;
      const errors = {};
      if (!social && !current) errors.current = 'Digite sua senha atual.';
      if (next.length < 6) errors.next = 'A senha precisa ter pelo menos 6 caracteres.';
      else if (!social && next === current) errors.next = 'Escolha uma senha diferente da atual.';
      if (!errors.next && confirm !== next) errors.confirm = 'As duas senhas precisam ser iguais.';
      if (!applyErrors(form, errors)) return;

      const res = await withLoading(form.querySelector('[type="submit"]'), () => auth.changePassword(current, next));
      if (!res) return;
      if (!res.ok) {
        applyErrors(form, { [res.field || 'current']: res.message });
        return;
      }
      toast(social ? 'Senha criada. Agora você também entra com e-mail e senha.' : 'Senha alterada com sucesso.', { type: 'success' });
      if (social) {
        ctx.rerender();
        return;
      }
      form.reset();
      form.elements.next.dispatchEvent(new Event('input', { bubbles: true }));
    }

    on(root, 'submit', '[data-profile]', (ev, form) => {
      ev.preventDefault();
      saveProfile(form);
    });
    on(root, 'submit', '[data-password]', (ev, form) => {
      ev.preventDefault();
      savePassword(form);
    });
  },
};
