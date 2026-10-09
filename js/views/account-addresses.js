// BOLAB — endereços de entrega (#/conta/enderecos).
import { html, raw, icon, on, toast, formData, applyErrors, validators, bindMasks, masks, openDialog, confirmDialog } from '../ui.js';
import { addresses } from '../store.js';
import { lookupCep } from '../cep.js';
import { SITE } from '../data/site.js';
import { accountPage, rerenderOn, withLoading } from './account.js';
import { clearErrorsOnInput } from './auth.js';

const LABELS = [
  { id: 'Casa', icon: 'home' },
  { id: 'Trabalho', icon: 'store' },
  { id: 'Outro', icon: 'map-pin' },
];

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

const CEP_HINT = 'Digite o CEP e a gente preenche o resto.';

const iconOf = (label) => LABELS.find((l) => l.id === label)?.icon || 'map-pin';

function addressCard(a) {
  return html`
    <article class="card acc-addr ${a.isDefault ? 'is-default' : ''}">
      <div class="acc-addr__head">
        <span class="row__icon">${icon(iconOf(a.label))}</span>
        <h2>${a.label || 'Endereço'}</h2>
        ${a.isDefault ? html`<span class="badge badge--solid">${icon('check')} Padrão</span>` : ''}
      </div>
      <p class="acc-addr__text">${addresses.format(a)}</p>
      <p class="acc-addr__meta">CEP ${masks.cep(String(a.cep || ''))}${a.reference ? html`<br />Referência: ${a.reference}` : ''}</p>
      <div class="acc-item-actions">
        <button class="btn btn--sm btn--ghost" type="button" data-edit="${a.id}">${icon('edit')} Editar</button>
        ${a.isDefault ? '' : html`<button class="btn btn--sm btn--ghost" type="button" data-default="${a.id}">Tornar padrão</button>`}
        <button class="btn btn--sm btn--ghost btn--danger" type="button" data-remove="${a.id}">${icon('trash')} Remover</button>
      </div>
    </article>
  `;
}

/** Diálogo de criar/editar. Salva pela loja; a lista se redesenha sozinha. */
function openAddressForm(current = null) {
  const a = current || {};
  const first = addresses.list().length === 0;
  const noNumber = Boolean(current) && (!a.number || /^s\/?n$/i.test(a.number));
  const dlg = openDialog({
    title: current ? 'Editar endereço' : 'Novo endereço',
    body: html`
      <form class="acc-addr-form" id="acc-addr-form" novalidate>
        <div class="field">
          <label for="ad-cep">CEP</label>
          <div class="acc-cep" data-cep-box>
            <input
              class="input"
              id="ad-cep"
              name="cep"
              type="text"
              inputmode="numeric"
              autocomplete="postal-code"
              data-mask="cep"
              placeholder="00000-000"
              value="${a.cep || ''}"
              ${current ? '' : raw('autofocus')}
            />
          </div>
          <div class="acc-cep__status" data-cep-status aria-live="polite">${CEP_HINT}</div>
          <a class="auth-textlink acc-cep__help" href="https://buscacepinter.correios.com.br/app/endereco/index.php" target="_blank" rel="noopener">Não sei meu CEP</a>
        </div>

        <div class="field">
          <label for="ad-street">Rua ou avenida</label>
          <input class="input" id="ad-street" name="street" type="text" autocomplete="address-line1" value="${a.street || ''}" />
        </div>

        <div class="field acc-col-2">
          <label for="ad-number">Número</label>
          <input class="input" id="ad-number" name="number" type="text" inputmode="numeric" autocomplete="off" value="${noNumber ? '' : a.number || ''}" ${noNumber ? raw('disabled') : ''} />
        </div>
        <div class="field acc-col-4">
          <label for="ad-complement">Complemento <span class="acc-optional">(opcional)</span></label>
          <input class="input" id="ad-complement" name="complement" type="text" autocomplete="address-line2" placeholder="Apto, bloco, casa…" value="${a.complement || ''}" />
        </div>
        <label class="check">
          <input type="checkbox" name="noNumber" value="1" ${noNumber ? raw('checked') : ''} />
          <span>Endereço sem número</span>
        </label>

        <div class="field">
          <label for="ad-district">Bairro</label>
          <input class="input" id="ad-district" name="district" type="text" autocomplete="address-level3" value="${a.district || ''}" />
        </div>

        <div class="field acc-col-4">
          <label for="ad-city">Cidade</label>
          <input class="input" id="ad-city" name="city" type="text" autocomplete="address-level2" value="${a.city || ''}" />
        </div>
        <div class="field acc-col-2">
          <label for="ad-uf">Estado</label>
          <select class="select" id="ad-uf" name="uf" autocomplete="address-level1">
            <option value="">—</option>
            ${UFS.map((uf) => html`<option value="${uf}" ${(a.uf || '') === uf ? raw('selected') : ''}>${uf}</option>`)}
          </select>
        </div>

        <div class="field">
          <label for="ad-reference">Ponto de referência <span class="acc-optional">(opcional)</span></label>
          <input class="input" id="ad-reference" name="reference" type="text" autocomplete="off" placeholder="Ex.: portão azul, ao lado da padaria" value="${a.reference || ''}" />
        </div>

        <div class="field">
          <span class="label" id="ad-label-title">Este endereço é</span>
          <div class="acc-chipset" role="radiogroup" aria-labelledby="ad-label-title">
            ${LABELS.map(
              (l) => html`
                <label class="chip acc-chip">
                  <input class="sr-only" type="radio" name="label" value="${l.id}" ${(a.label || 'Casa') === l.id ? raw('checked') : ''} />
                  ${icon(l.icon)} ${l.id}
                </label>
              `,
            )}
          </div>
        </div>

        ${first || a.isDefault
          ? ''
          : html`<label class="check">
              <input type="checkbox" name="isDefault" value="1" />
              <span>Usar como endereço padrão nas próximas entregas</span>
            </label>`}
      </form>
    `,
    footer: html`
      <button class="btn btn--secondary" type="button" data-dialog-close>Cancelar</button>
      <button class="btn" type="submit" form="acc-addr-form">Salvar endereço</button>
    `,
  });

  const form = dlg.el.querySelector('form');
  const cepBox = form.querySelector('[data-cep-box]');
  const status = form.querySelector('[data-cep-status]');
  const f = form.elements;
  bindMasks(form);
  clearErrorsOnInput(form);

  function setStatus(kind, text) {
    status.className = `acc-cep__status ${kind ? `is-${kind}` : ''}`;
    status.innerHTML = kind ? String(html`${icon(kind === 'ok' ? 'check-circle' : 'info')}<span>${text}</span>`) : String(html`${text || CEP_HINT}`);
  }

  let lastLooked = current ? String(a.cep || '').replace(/\D/g, '') : '';
  async function lookup() {
    const digits = f.cep.value.replace(/\D/g, '');
    if (digits.length !== 8) {
      lastLooked = '';
      cepBox.classList.remove('is-loading');
      setStatus('', '');
      return;
    }
    if (digits === lastLooked) return;
    lastLooked = digits;
    cepBox.classList.add('is-loading');
    setStatus('', 'Buscando endereço…');
    const res = await lookupCep(digits);
    if (!form.isConnected || f.cep.value.replace(/\D/g, '') !== digits) return; // o CEP mudou enquanto buscávamos
    cepBox.classList.remove('is-loading');

    if (!res.ok) {
      setStatus(
        'warn',
        res.reason === 'notfound'
          ? 'Não encontramos este CEP. Tudo bem: confira os números ou preencha o endereço abaixo.'
          : 'Não conseguimos buscar o CEP agora. Sem problema: preencha o endereço abaixo.',
      );
      if (!f.street.value) f.street.focus();
      return;
    }
    if (res.street) f.street.value = res.street;
    if (res.district) f.district.value = res.district;
    if (res.city) f.city.value = res.city;
    if (res.uf) f.uf.value = res.uf;
    ['street', 'district', 'city', 'uf'].forEach((name) => f[name].dispatchEvent(new Event('input', { bubbles: true })));
    const place = [res.city, res.uf].filter(Boolean).join('/');
    setStatus('ok', res.street ? `Endereço encontrado em ${place}. Agora é só o número.` : `CEP de ${place}. Complete com rua, número e bairro.`);
    if (!res.street) f.street.focus();
    else if (!f.number.disabled) f.number.focus();
  }
  f.cep.addEventListener('input', lookup);

  f.noNumber.addEventListener('change', () => {
    f.number.disabled = f.noNumber.checked;
    if (f.noNumber.checked) {
      f.number.value = '';
      f.number.dispatchEvent(new Event('input', { bubbles: true }));
    } else f.number.focus();
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const data = formData(form);
    const errors = {};
    if (!validators.cep(data.cep || '')) errors.cep = 'Digite o CEP com 8 números.';
    if (!data.street) errors.street = 'Digite o nome da rua.';
    if (!data.noNumber && !data.number) errors.number = 'Falta o número.';
    if (!data.district) errors.district = 'Digite o bairro.';
    if (!data.city) errors.city = 'Digite a cidade.';
    if (!data.uf) errors.uf = 'Escolha o estado.';
    if (!applyErrors(form, errors)) return;

    const saved = await withLoading(dlg.el.querySelector('[type="submit"]'), () =>
      addresses.save({
        ...(current ? { id: current.id } : {}),
        label: data.label || 'Casa',
        cep: data.cep,
        street: data.street,
        number: data.noNumber ? 's/n' : data.number,
        complement: data.complement || '',
        district: data.district,
        city: data.city,
        uf: data.uf,
        reference: data.reference || '',
        ...(data.isDefault ? { isDefault: true } : {}),
      }),
    );
    if (!saved) return;
    dlg.close(saved);
    toast(current ? 'Endereço atualizado.' : 'Endereço salvo. Já pode usar na próxima entrega.', { type: 'success' });
  });

  return dlg;
}

export default {
  title: 'Endereços',
  layout: 'plain',
  auth: true,

  render() {
    const list = addresses.list();
    return accountPage({
      title: 'Endereços',
      active: 'enderecos',
      body: list.length
        ? html`
            <div class="acc-toolbar">
              <p>Entregamos em ${SITE.region}. O endereço padrão já vem escolhido na hora de fechar o pedido.</p>
              <button class="btn only-desktop" type="button" data-add>${icon('plus')} Adicionar endereço</button>
            </div>
            <div class="acc-list">
              ${[...list].sort((x, y) => Number(Boolean(y.isDefault)) - Number(Boolean(x.isDefault))).map(addressCard)}
              <button class="acc-add-tile" type="button" data-add>${icon('plus')} Adicionar outro endereço</button>
            </div>
          `
        : html`
            <div class="card">
              <div class="empty acc-empty">
                <div class="empty__art">${icon('map-pin')}</div>
                <h2>Nenhum endereço por aqui</h2>
                <p>Salve o endereço de entrega uma vez e feche os próximos pedidos em poucos toques. Atendemos ${SITE.region}.</p>
                <button class="btn" type="button" data-add>${icon('plus')} Adicionar endereço</button>
              </div>
            </div>
          `,
    });
  },

  mount(root, ctx) {
    on(root, 'click', '[data-add]', () => openAddressForm());
    on(root, 'click', '[data-edit]', (_ev, btn) => {
      const a = addresses.get(btn.dataset.edit);
      if (a) openAddressForm(a);
    });
    on(root, 'click', '[data-default]', (_ev, btn) => {
      addresses.setDefault(btn.dataset.default);
      toast('Endereço padrão atualizado.', { type: 'success' });
    });
    on(root, 'click', '[data-remove]', async (_ev, btn) => {
      const a = addresses.get(btn.dataset.remove);
      if (!a) return;
      const ok = await confirmDialog({
        title: 'Remover este endereço?',
        message: `${a.label}: ${addresses.format(a)}. Pedidos já feitos não mudam.`,
        confirmLabel: 'Remover',
        cancelLabel: 'Manter',
        danger: true,
      });
      if (!ok) return;
      addresses.remove(a.id);
      toast('Endereço removido.');
    });
    return rerenderOn(ctx, ['addresses']);
  },
};
