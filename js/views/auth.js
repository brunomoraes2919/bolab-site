// BOLAB — entrar / criar conta (#/entrar?next=&modo=cadastro).
// Também exporta o campo de senha (mostrar/ocultar + medidor) usado em "Dados pessoais".
import { html, raw, icon, on, sleep, toast, formData, applyErrors, setFieldError, validators, bindMasks, openDialog } from '../ui.js';
import { photo, notice } from '../components.js';
import { auth, cart, store } from '../store.js';
import { navigate, goBack } from '../router.js';
import { GOOGLE_LOGO } from '../icons.js';
import { SITE } from '../data/site.js';

/* ───────── Campo de senha (compartilhado) ───────── */

/** 0 = curta demais · 1 = válida · 2 = boa · 3 = forte */
export function strengthOf(password) {
  const v = String(password || '');
  if (v.length < 6) return 0;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(v)).length;
  if (v.length >= 10 && kinds >= 3) return 3;
  if (v.length >= 8 && kinds >= 2) return 2;
  return 1;
}

function meterLabel(value) {
  if (!value) return 'Mínimo de 6 caracteres';
  if (value.length < 6) return 6 - value.length === 1 ? 'Falta 1 caractere' : `Faltam ${6 - value.length} caracteres`;
  return ['', 'Senha simples, mas já vale', 'Boa senha', 'Senha forte'][strengthOf(value)];
}

/** Campo de senha com botão mostrar/ocultar. `meter: true` mostra a dica de força. */
export function passwordField({ id, name = 'password', label = 'Senha', autocomplete = 'current-password', value = '', meter = false, autofocus = false } = {}) {
  return html`
    <div class="field">
      <label for="${id}">${label}</label>
      <div class="input-group auth-pass">
        <input
          class="input"
          id="${id}"
          name="${name}"
          type="password"
          autocomplete="${autocomplete}"
          autocapitalize="none"
          spellcheck="false"
          value="${value}"
          ${meter ? raw('minlength="6" data-meter') : ''}
          ${autofocus ? raw('autofocus') : ''}
        />
        <button class="icon-btn input-group__action" type="button" data-toggle-pass aria-label="Mostrar senha" aria-pressed="false">${icon('eye')}</button>
      </div>
      ${meter
        ? html`<div class="auth-meter" data-level="${strengthOf(value)}">
            <span class="auth-meter__bars" aria-hidden="true"><i></i><i></i><i></i></span>
            <span class="auth-meter__label" aria-live="polite">${meterLabel(value)}</span>
          </div>`
        : ''}
    </div>
  `;
}

/** Liga os botões mostrar/ocultar e os medidores dentro de root (uma vez por root). */
export function bindPasswordFields(root) {
  on(root, 'click', '[data-toggle-pass]', (_ev, btn) => {
    const input = btn.closest('.input-group').querySelector('input');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-pressed', String(show));
    btn.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
    btn.innerHTML = String(icon(show ? 'eye-off' : 'eye'));
    input.focus({ preventScroll: true });
  });
  on(root, 'input', 'input[data-meter]', (_ev, input) => {
    const box = input.closest('.field')?.querySelector('.auth-meter');
    if (!box) return;
    box.dataset.level = String(strengthOf(input.value));
    box.querySelector('.auth-meter__label').textContent = meterLabel(input.value);
  });
}

/** Some com o erro assim que a pessoa volta a mexer no campo. */
export function clearErrorsOnInput(root) {
  const clear = (ev) => {
    const field = ev.target.closest?.('.field.is-invalid');
    const form = ev.target.closest?.('form');
    if (!field || !form || !ev.target.name) return;
    setFieldError(form, ev.target.name, '');
    field.querySelector('.auth-suggest')?.remove();
  };
  root.addEventListener('input', clear);
  root.addEventListener('change', clear);
}

export function firstNameOf(user) {
  return String(user?.name || '').trim().split(/\s+/)[0] || '';
}

/* ───────── Tela ───────── */
const BENEFITS = [
  { icon: 'package', title: 'Acompanhe cada pedido', text: 'Da confirmação à entrega, em tempo real.' },
  { icon: 'layers', title: 'Salve os bolos criados no 3D', text: 'Monte hoje, peça quando a data chegar.' },
  { icon: 'map-pin', title: 'Endereços e pagamento salvos', text: 'Feche a próxima encomenda em poucos toques.' },
  { icon: 'ticket', title: 'Cupons exclusivos', text: 'Descontos que só quem tem conta recebe.' },
];

const mounted = new WeakMap(); // root → { setMode }

const modeOf = (query) => (query.modo === 'cadastro' ? 'signup' : 'signin');

/** Só aceitamos caminhos internos como destino depois do login. */
function safeNext(query) {
  const next = String(query.next || '');
  return next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/entrar') ? next : '';
}

function emailField(value) {
  return html`
    <div class="field">
      <label for="auth-email">E-mail</label>
      <input
        class="input"
        id="auth-email"
        name="email"
        type="email"
        inputmode="email"
        autocomplete="email"
        autocapitalize="none"
        spellcheck="false"
        placeholder="voce@email.com"
        value="${value}"
      />
    </div>
  `;
}

function signInForm({ email, password }) {
  return html`
    <form class="auth-form" novalidate data-form="signin">
      ${emailField(email)} ${passwordField({ id: 'auth-password', value: password })}
      <button class="auth-textlink auth-forgot" type="button" data-forgot>Esqueci minha senha</button>
      <button class="btn btn--block" type="submit">Entrar</button>
    </form>
    <p class="auth-switch">Primeira vez por aqui? <button class="auth-textlink" type="button" data-mode="signup">Criar minha conta</button></p>
  `;
}

function signUpForm({ name = '', email, phone = '', password, terms = false }) {
  return html`
    <form class="auth-form" novalidate data-form="signup">
      <div class="field">
        <label for="auth-name">Nome completo</label>
        <input class="input" id="auth-name" name="name" type="text" autocomplete="name" autocapitalize="words" placeholder="Nome e sobrenome" value="${name}" />
      </div>
      ${emailField(email)}
      <div class="field">
        <label for="auth-phone">WhatsApp</label>
        <input class="input" id="auth-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel-national" data-mask="phone" placeholder="(65) 99999-0000" value="${phone}" />
        <div class="field__hint">Só para falar do seu pedido e avisar quando ele sair para entrega.</div>
      </div>
      ${passwordField({ id: 'auth-password', label: 'Crie uma senha', autocomplete: 'new-password', value: password, meter: true })}
      <div class="field">
        <label class="check auth-check">
          <input type="checkbox" name="terms" value="1" ${terms ? raw('checked') : ''} />
          <span>
            Li e aceito os <button class="link" type="button" data-legal="termos">Termos de uso</button> e a
            <button class="link" type="button" data-legal="privacidade">Política de privacidade</button>.
          </span>
        </label>
      </div>
      <button class="btn btn--block" type="submit">Criar minha conta</button>
    </form>
    <p class="auth-switch">Já tem conta? <button class="auth-textlink" type="button" data-mode="signin">Entrar</button></p>
  `;
}

function cardHtml(mode, { name = '', email = '', phone = '', password = '', terms = false, next = '' } = {}) {
  const signup = mode === 'signup';
  return html`
    <div class="auth-card__dyn">
      ${next.startsWith('/checkout')
        ? html`<div class="auth-context">
            ${notice(`Falta pouco para fechar seu pedido. Entre ou crie sua conta para continuar${cart.isEmpty() ? '.' : ': seu carrinho está guardado.'}`, { iconName: 'bag' })}
          </div>`
        : ''}
      <h1 class="auth-card__title">${signup ? 'Crie sua conta em 1 minuto' : 'Que bom te ver por aqui'}</h1>
      <p class="auth-card__sub">
        ${signup
          ? 'Acompanhe pedidos, salve seus bolos 3D e ganhe 10% OFF na primeira encomenda.'
          : 'Entre para acompanhar pedidos, rever seus bolos salvos e usar seus cupons.'}
      </p>

      <div class="tabs" role="tablist" aria-label="Entrar ou criar conta">
        <button type="button" role="tab" data-mode="signin" data-tab aria-selected="${signup ? 'false' : 'true'}">Entrar</button>
        <button type="button" role="tab" data-mode="signup" data-tab aria-selected="${signup ? 'true' : 'false'}">Criar conta</button>
      </div>

      <button class="btn btn--secondary btn--block auth-google" type="button" data-google>${raw(GOOGLE_LOGO)} Continuar com Google</button>
      <p class="auth-demo">Demonstração: entra com uma conta de exemplo</p>

      <div class="auth-or"><span>${signup ? 'ou cadastre com e-mail' : 'ou entre com e-mail'}</span></div>

      ${signup ? signUpForm({ name, email, phone, password, terms }) : signInForm({ email, password })}
    </div>
  `;
}

const LEGAL = {
  termos: {
    title: 'Termos de uso',
    body: html`
      <div class="auth-legal">
        ${notice('Resumo de demonstração. Os termos definitivos serão publicados quando a loja abrir para vendas.', { iconName: 'info' })}
        <div>
          <h3>Encomendas</h3>
          <p>Nossos bolos são feitos sob encomenda. No fechamento do pedido você escolhe o dia e a janela de horário entre as datas disponíveis.</p>
        </div>
        <div>
          <h3>Alterações e cancelamento</h3>
          <p>Você pode cancelar sem custo enquanto o pedido não entrou em produção. Depois disso, fale com o nosso atendimento.</p>
        </div>
        <div>
          <h3>Pagamento</h3>
          <p>Aceitamos Pix e cartão de crédito. Nesta versão de demonstração os pagamentos são simulados: nada é cobrado de verdade.</p>
        </div>
      </div>
    `,
  },
  privacidade: {
    title: 'Política de privacidade',
    body: html`
      <div class="auth-legal">
        ${notice('Resumo de demonstração. A política definitiva será publicada quando a loja abrir para vendas.', { iconName: 'info' })}
        <div>
          <h3>Onde ficam os seus dados</h3>
          <p>Nesta demonstração, conta, endereços, pedidos e carrinho ficam guardados apenas neste aparelho. Nada é enviado para um servidor da loja.</p>
        </div>
        <div>
          <h3>Para que usamos</h3>
          <p>Nome, e-mail e WhatsApp servem para identificar você e falar sobre o seu pedido. Não enviamos propaganda sem a sua autorização.</p>
        </div>
        <div>
          <h3>Você no controle</h3>
          <p>Em Minha conta você pode corrigir seus dados e apagar tudo o que foi salvo neste aparelho quando quiser.</p>
        </div>
      </div>
    `,
  },
};

export default {
  title: (ctx) => (ctx.query.modo === 'cadastro' ? 'Criar conta' : 'Entrar'),
  layout: 'focus',

  render(ctx) {
    // Quem já está na conta não precisa ver esta tela: o mount redireciona.
    if (auth.isLogged()) return html`<div class="auth"></div>`;
    return html`
      <div class="auth">
        <div class="container auth__grid">
          <section class="auth-card" data-auth-card>${cardHtml(modeOf(ctx.query), { next: safeNext(ctx.query) })}</section>

          <button class="auth-gift" type="button" data-copy-coupon="BOLAB10">
            <span class="auth-gift__icon">${icon('gift')}</span>
            <span><strong>10% OFF na primeira encomenda</strong><br />Use o cupom <code>BOLAB10</code> no carrinho. Toque para copiar.</span>
          </button>

          <p class="auth-foot">${icon('lock')}<span>Loja em demonstração: sua conta fica salva apenas neste aparelho.</span></p>

          <aside class="auth-brand" aria-label="Vantagens de ter uma conta BOLAB">
            ${photo('celebration', { w: 900, alt: '', cls: 'auth-brand__img', sizes: '(min-width: 1000px) 50vw, 1px' })}
            <span class="eyebrow">${icon('sparkles')} Sua conta ${SITE.name}</span>
            <h2>Seu próximo bolo <em>começa aqui.</em></h2>
            <ul class="auth-brand__list">
              ${BENEFITS.map(
                (b) => html`
                  <li>
                    <span class="auth-brand__icon">${icon(b.icon)}</span>
                    <span><strong>${b.title}</strong><span>${b.text}</span></span>
                  </li>
                `,
              )}
            </ul>
            <button class="auth-brand__coupon" type="button" data-copy-coupon="BOLAB10">
              <span class="auth-gift__icon">${icon('gift')}</span>
              <span><strong>10% OFF na primeira encomenda</strong>Use o cupom <code>BOLAB10</code> no carrinho</span>
              ${icon('copy')}
            </button>
          </aside>
        </div>
      </div>
    `;
  },

  mount(root, ctx) {
    let next = safeNext(ctx.query);
    if (auth.isLogged()) {
      navigate(next || '/conta', { replace: true });
      return undefined;
    }

    const cardEl = root.querySelector('[data-auth-card]');
    let mode = modeOf(ctx.query);
    let busy = false;
    let leaving = false;

    const formEl = () => cardEl.querySelector('[data-form]');
    const desktop = () => window.matchMedia('(min-width: 1000px) and (pointer: fine)').matches;

    // O que a pessoa já digitou: trocar de aba nunca apaga nada.
    const draft = { name: '', email: '', phone: '', password: '', terms: false };
    function remember() {
      const f = formEl()?.elements;
      if (!f) return;
      ['name', 'email', 'phone'].forEach((key) => {
        if (f[key]) draft[key] = f[key].value.trim();
      });
      if (f.password) draft.password = f.password.value;
      if (f.terms) draft.terms = f.terms.checked;
    }

    function draw() {
      cardEl.innerHTML = String(cardHtml(mode, { ...draft, next }));
      bindMasks(cardEl);
      document.title = `${mode === 'signup' ? 'Criar conta' : 'Entrar'} · BOLAB`;
    }

    /** Troca entre "Entrar" e "Criar conta" mantendo o que já foi digitado. */
    function setMode(nextMode, { focus = '', email, password, sync = true } = {}) {
      remember();
      if (email != null) draft.email = email;
      if (password != null) draft.password = password;
      if (nextMode !== mode || email != null || password != null) {
        mode = nextMode;
        draw();
      }
      if (focus === 'tab') cardEl.querySelector('[data-tab][aria-selected="true"]')?.focus();
      else if (focus) formEl()?.elements[focus]?.focus();
      if (sync && modeOf(ctx.query) !== mode) {
        navigate('/entrar', { replace: true, query: { ...ctx.query, modo: mode === 'signup' ? 'cadastro' : '' } });
      }
    }

    /** O destino (?next=) pode mudar com a tela aberta, porque o roteador reaproveita esta tela. */
    function setNext(value) {
      if (value === next) return;
      remember();
      next = value;
      draw();
    }

    mounted.set(root, { setMode, setNext });

    /** Depois de entrar: volta para onde a pessoa estava (ou para o destino pedido em ?next=). */
    function finish(message) {
      leaving = true;
      toast(message, { type: 'success' });
      if (next) navigate(next, { replace: true });
      else goBack('/conta');
    }

    async function loading(btn, work) {
      busy = true;
      btn.classList.add('is-loading');
      btn.setAttribute('aria-busy', 'true');
      try {
        await sleep(420); // dá tempo de a pessoa perceber que algo aconteceu
        return await work();
      } finally {
        busy = false;
        btn.classList.remove('is-loading');
        btn.removeAttribute('aria-busy');
      }
    }

    function suggest(form, name, label, action) {
      const field = form.querySelector(`[name="${name}"]`)?.closest('.field');
      if (!field) return;
      field.querySelector('.auth-suggest')?.remove();
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'auth-suggest';
      btn.dataset.suggest = action;
      btn.innerHTML = String(html`${label}${icon('arrow-right')}`);
      field.appendChild(btn);
    }

    async function submitSignIn(form) {
      const data = formData(form);
      const password = form.elements.password.value;
      const errors = {};
      if (!data.email) errors.email = 'Digite o e-mail da sua conta.';
      else if (!validators.email(data.email)) errors.email = 'Este e-mail parece incompleto. Confira, por favor.';
      if (!password) errors.password = 'Digite sua senha.';
      form.querySelectorAll('.auth-suggest').forEach((el) => el.remove());
      if (!applyErrors(form, errors)) return;

      const res = await loading(form.querySelector('[type="submit"]'), () => auth.signIn({ email: data.email, password }));
      if (res.ok) {
        finish(`Olá, ${firstNameOf(res.user)}! Que bom te ver de novo.`);
        return;
      }
      applyErrors(form, { [res.field || 'email']: res.message });
      if (res.field === 'email' && !auth.emailExists(data.email)) suggest(form, 'email', 'Criar conta com este e-mail', 'signup');
      else if (res.field === 'email') suggest(form, 'email', 'Continuar com Google', 'google');
    }

    async function submitSignUp(form) {
      const data = formData(form);
      const password = form.elements.password.value;
      const errors = {};
      if (data.name.length < 2) errors.name = 'Como podemos te chamar? Digite seu nome.';
      if (!data.email) errors.email = 'Digite seu melhor e-mail.';
      else if (!validators.email(data.email)) errors.email = 'Este e-mail parece incompleto. Confira, por favor.';
      if (!data.phone) errors.phone = 'Digite seu WhatsApp com DDD.';
      else if (!validators.phone(data.phone)) errors.phone = 'O número parece incompleto. Use DDD + número.';
      if (password.length < 6) errors.password = 'A senha precisa ter pelo menos 6 caracteres.';
      if (!data.terms) errors.terms = 'Para criar a conta, é preciso aceitar os termos.';
      form.querySelectorAll('.auth-suggest').forEach((el) => el.remove());
      if (!applyErrors(form, errors)) return;

      const res = await loading(form.querySelector('[type="submit"]'), () =>
        auth.signUp({ name: data.name, email: data.email, phone: data.phone, password }),
      );
      if (res.ok) {
        finish(`Conta criada! Boas-vindas à BOLAB, ${firstNameOf(res.user)}.`);
        return;
      }
      applyErrors(form, { [res.field || 'email']: res.message });
      if (res.field === 'email') suggest(form, 'email', 'Entrar com este e-mail', 'signin');
    }

    async function signInWithGoogle(btn) {
      if (busy) return;
      const res = await loading(btn, () => auth.signInDemo('google'));
      if (res.ok) finish(`Olá, ${firstNameOf(res.user)}! Você entrou com a conta de exemplo do Google.`);
    }

    function openForgot() {
      const typed = formEl()?.elements.email?.value.trim() || '';
      const dlg = openDialog({
        title: 'Redefinir senha',
        body: html`
          <form class="auth-form" id="auth-forgot" novalidate>
            <p class="muted">Informe o e-mail da sua conta e escolha uma senha nova.</p>
            <div class="field">
              <label for="auth-forgot-email">E-mail da conta</label>
              <input
                class="input"
                id="auth-forgot-email"
                name="email"
                type="email"
                inputmode="email"
                autocomplete="email"
                autocapitalize="none"
                spellcheck="false"
                placeholder="voce@email.com"
                value="${typed}"
                ${typed ? '' : raw('autofocus')}
              />
            </div>
            ${passwordField({ id: 'auth-forgot-pass', name: 'next', label: 'Nova senha', autocomplete: 'new-password', meter: true, autofocus: Boolean(typed) })}
            ${notice('Em uma loja no ar você receberia um link por e-mail. Como esta é uma demonstração, a senha nova passa a valer na hora.', {
              iconName: 'info',
            })}
          </form>
        `,
        footer: html`
          <button class="btn btn--secondary" type="button" data-dialog-close>Cancelar</button>
          <button class="btn" type="submit" form="auth-forgot">Salvar nova senha</button>
        `,
      });
      bindPasswordFields(dlg.el);
      clearErrorsOnInput(dlg.el);

      const form = dlg.el.querySelector('form');
      const toSignIn = (email, message) => {
        dlg.close();
        setMode('signin', { email, password: '' });
        toast(message, { type: 'success' });
        setTimeout(() => formEl()?.elements.password?.focus(), 220);
      };

      on(dlg.el, 'click', '[data-suggest="signup"]', () => {
        const email = form.elements.email.value.trim();
        dlg.close();
        setMode('signup', { email });
        setTimeout(() => formEl()?.elements.name?.focus(), 220);
      });

      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        if (busy) return;
        const data = formData(form);
        const password = form.elements.next.value;
        const errors = {};
        if (!data.email) errors.email = 'Digite o e-mail da sua conta.';
        else if (!validators.email(data.email)) errors.email = 'Este e-mail parece incompleto. Confira, por favor.';
        if (password.length < 6) errors.next = 'A senha nova precisa ter pelo menos 6 caracteres.';
        form.querySelectorAll('.auth-suggest').forEach((el) => el.remove());
        if (!applyErrors(form, errors)) return;

        const res = await loading(dlg.el.querySelector('[type="submit"]'), () => auth.resetPassword(data.email, password));
        if (res.ok) {
          toSignIn(data.email, 'Senha nova salva. Agora é só entrar com ela.');
          return;
        }
        applyErrors(form, { [res.field || 'email']: res.message });
        suggest(form, 'email', 'Criar conta com este e-mail', 'signup');
      });
    }

    bindMasks(root);
    bindPasswordFields(root);
    clearErrorsOnInput(root);

    on(root, 'click', '[data-mode]', (_ev, btn) => {
      if (busy) return;
      setMode(btn.dataset.mode, { focus: btn.hasAttribute('data-tab') ? 'tab' : desktop() ? (btn.dataset.mode === 'signup' ? 'name' : 'email') : '' });
    });

    on(root, 'click', '[data-suggest]', (_ev, btn) => {
      if (busy) return;
      const action = btn.dataset.suggest;
      if (action === 'google') signInWithGoogle(cardEl.querySelector('[data-google]'));
      else if (action === 'signup') setMode('signup', { focus: 'name' });
      else setMode('signin', { focus: 'password' });
    });

    on(root, 'click', '[data-google]', (_ev, btn) => signInWithGoogle(btn));
    on(root, 'click', '[data-forgot]', () => !busy && openForgot());
    on(root, 'click', '[data-legal]', (_ev, btn) => {
      const doc = LEGAL[btn.dataset.legal];
      if (!doc) return;
      openDialog({ title: doc.title, body: doc.body, footer: html`<button class="btn" type="button" data-dialog-close>Entendi</button>` });
    });

    root.addEventListener('submit', (ev) => {
      const form = ev.target.closest('[data-form]');
      if (!form) return;
      ev.preventDefault();
      if (busy) return;
      if (form.dataset.form === 'signup') submitSignUp(form);
      else submitSignIn(form);
    });

    if (desktop()) formEl()?.elements[mode === 'signup' ? 'name' : 'email']?.focus({ preventScroll: true });

    // Se a pessoa entrar por outra aba, esta tela não tem mais o que fazer.
    return store.on('auth', () => {
      if (!leaving && !busy && auth.isLogged()) navigate(next || '/conta', { replace: true });
    });
  },

  /** Só a query mudou (trocou de aba ou de destino): ajusta sem recriar a tela nem apagar o que foi digitado. */
  onQuery(root, ctx) {
    const view = mounted.get(root);
    if (!view) return;
    view.setNext(safeNext(ctx.query));
    view.setMode(modeOf(ctx.query), { sync: false });
  },
};
