// BOLAB — fechar pedido: entrega → agendamento → pagamento, em uma página só.
import {
  html,
  raw,
  icon,
  money,
  dateLong,
  isoDate,
  toDate,
  plural,
  on,
  sleep,
  masks,
  bindMasks,
  applyErrors,
  setFieldError,
  validators,
  cardBrand,
  toast,
  openDialog,
} from '../ui.js';
import { lineThumb, totalsSummary } from '../components.js';
import { auth, cart, addresses, cards, orders, schedule, isServedCity } from '../store.js';
import { lookupCep } from '../cep.js';
import { navigate } from '../router.js';
import { SITE } from '../data/site.js';
import { installmentOptions, whenStore } from './cart.js';

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const WEEKDAYS = [
  ['D', 'Domingo'],
  ['S', 'Segunda-feira'],
  ['T', 'Terça-feira'],
  ['Q', 'Quarta-feira'],
  ['Q', 'Quinta-feira'],
  ['S', 'Sexta-feira'],
  ['S', 'Sábado'],
];
const STEP_NAMES = ['Entrega', 'Agendamento', 'Pagamento'];
const MONTH_FMT = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const MONTH_SHORT = new Intl.DateTimeFormat('pt-BR', { month: 'short' });
const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const CORREIOS_CEP = 'https://buscacepinter.correios.com.br/app/endereco/index.php';
const STRIP_DAYS = 10; // dias mostrados na faixa do celular
const PROGRESS_KEY = 'bolab:checkout'; // sessionStorage: andamento do checkout (nunca dados de cartão)
const TEST_CARD = { number: '4111 1111 1111 1111', expiry: '12/30', cvv: '123', cpf: '529.982.247-25' };

/* ───────── Estado ─────────
   Fica no módulo: redesenhar a tela (ou sair e voltar) não perde o que já foi preenchido. */
const blankAddress = () => ({ label: 'Casa', cep: '', street: '', number: '', complement: '', district: '', city: '', uf: '', reference: '' });

const fresh = () => ({
  userId: null,
  step: 1, // etapa aberta
  reached: 1, // etapa mais avançada já liberada
  mode: 'delivery',
  addressId: 'new', // id de um endereço salvo ou 'new'
  addr: blankAddress(),
  addrOpen: false, // campos de endereço aparecem depois do CEP (ou de "Não sei meu CEP")
  cepUnknown: false,
  unserved: '', // cidade do endereço novo quando fica fora da área de entrega
  noNumber: false, // "Endereço sem número"
  cep: { state: 'idle', message: '', last: '' }, // idle | loading | ok | warn | fail | unknown
  contact: { name: '', phone: '' },
  date: '',
  slot: '',
  month: '', // 'AAAA-MM' em exibição no calendário
  fullCal: false, // no celular: calendário do mês aberto no lugar da faixa de dias
  payment: 'pix',
  cardId: 'new', // id de um cartão salvo ou 'new'
  card: { number: '', holder: '', expiry: '', cvv: '', cpf: '', save: false }, // salvar o cartão é escolha da cliente
  installments: 1,
  summaryOpen: false,
  placing: false,
});

let S = fresh();
let leaving = false; // pedido criado: a tela está só esperando a próxima abrir
let compact = false; // etapa estreita demais para calendário e horários lado a lado (celular)

/** Campo do formulário → onde o valor mora no estado. */
const BIND = {
  cep: ['addr', 'cep'],
  street: ['addr', 'street'],
  number: ['addr', 'number'],
  complement: ['addr', 'complement'],
  district: ['addr', 'district'],
  city: ['addr', 'city'],
  uf: ['addr', 'uf'],
  reference: ['addr', 'reference'],
  contactName: ['contact', 'name'],
  contactPhone: ['contact', 'phone'],
  cardNumber: ['card', 'number'],
  cardHolder: ['card', 'holder'],
  cardExpiry: ['card', 'expiry'],
  cardCvv: ['card', 'cvv'],
  cardCpf: ['card', 'cpf'],
};

/* ───────── Utilidades ───────── */
const attr = (name, onState) => (onState ? raw(name) : '');
const digitsOf = (v) => String(v).replace(/\D/g, '');
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** Texto sem acentos, sem espaços nas pontas e em minúsculas (para comparar nomes de cidade). */
const plainText = (v) =>
  String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

function monthDate(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

function lastBookableDay() {
  const d = new Date();
  d.setDate(d.getDate() + SITE.scheduleDaysAhead);
  return d;
}

function slotFree(date, label) {
  return Boolean(date && label) && schedule.slots(date).some((s) => s.label === label && s.left > 0);
}

/** Dia aberto e com pelo menos um horário livre. */
function bookable(date) {
  return schedule.isOpen(date) && schedule.slots(date).some((x) => x.left > 0);
}

/** Próximos dias em que dá para agendar, a partir da primeira data possível. */
function nextBookableDays(limit) {
  const out = [];
  const d = new Date(schedule.earliest());
  const last = lastBookableDay();
  while (d <= last && out.length < limit) {
    if (bookable(d)) out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** '11:00' → '11h' · '09:30' → '9h30' */
function hourText(hhmm) {
  const [h, m] = String(hhmm).trim().split(':');
  return `${Number(h)}h${m && m !== '00' ? m : ''}`;
}

/**
 * A etapa tem menos de 600px de largura útil? (mesma medida da regra @container do CSS.)
 * Nesse caso o calendário do mês dá lugar a uma faixa com os próximos dias.
 */
function guessCompact() {
  const w = document.documentElement.clientWidth;
  return w < 900 ? w < 664 : Math.min(w, 1264) < 1140;
}

/** Valores com a forma de pagamento já considerada a partir da etapa 3. */
function totalsNow() {
  return cart.totals({ mode: S.mode, payment: S.reached >= 3 ? S.payment : null });
}

/** "São Paulo" — ou "Cuiabá/SP" quando o nome bate com uma cidade atendida mas o estado não. */
function placeOf(city, uf) {
  const name = String(city || '').trim();
  return isServedCity(name) && uf ? `${name}/${uf}` : name;
}

/** Endereço salvo escolhido para entrega que fica fora da área atendida → nome do lugar ('' = tudo certo). */
function unservedSaved() {
  if (S.mode !== 'delivery' || S.addressId === 'new') return '';
  const a = addresses.get(S.addressId);
  return a && !isServedCity(a.city, a.uf) ? placeOf(a.city, a.uf) : '';
}

/** A etapa 1 está completa? (quem recebe + retirada, ou um endereço salvo dentro da área de entrega) */
function deliveryReady() {
  if (S.contact.name.trim().length < 3 || !validators.phone(S.contact.phone)) return false;
  if (S.mode === 'pickup') return true;
  const a = S.addressId === 'new' ? null : addresses.get(S.addressId);
  return Boolean(a) && isServedCity(a.city, a.uf);
}

/** Endereço que já vem marcado: o padrão, se a entrega chega lá; senão o primeiro atendido. */
function preferredAddressId() {
  const def = addresses.default();
  if (def && isServedCity(def.city, def.uf)) return def.id;
  return addresses.list().find((a) => isServedCity(a.city, a.uf))?.id || def?.id || 'new';
}

/** Guarda o andamento nesta aba, para um recarregamento não mandar a cliente de volta ao começo. */
function persist() {
  if (!S.userId) return;
  try {
    sessionStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({
        userId: S.userId,
        step: S.step,
        reached: S.reached,
        mode: S.mode,
        addressId: S.addressId === 'new' ? null : S.addressId,
        date: S.date,
        slot: S.slot,
        payment: S.payment,
        contact: { name: S.contact.name, phone: S.contact.phone },
      }),
    );
  } catch {
    // sem armazenamento de sessão: o andamento só não sobrevive a um recarregamento.
  }
}

function forget() {
  try {
    sessionStorage.removeItem(PROGRESS_KEY);
  } catch {
    // nada a limpar.
  }
}

/** Retoma o andamento guardado (da mesma pessoa). O que não valer mais é corrigido em sync(). */
function restore(userId) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(PROGRESS_KEY) || 'null');
    if (!saved || saved.userId !== userId) return;
    if (saved.mode === 'delivery' || saved.mode === 'pickup') S.mode = saved.mode;
    if (saved.addressId && addresses.get(saved.addressId)) S.addressId = saved.addressId;
    if (/^\d{4}-\d{2}-\d{2}$/.test(saved.date || '')) S.date = saved.date;
    if (typeof saved.slot === 'string') S.slot = saved.slot;
    if (saved.payment === 'pix' || saved.payment === 'card') S.payment = saved.payment;
    if (typeof saved.contact?.name === 'string' && saved.contact.name.trim()) {
      S.contact = { name: saved.contact.name, phone: masks.phone(String(saved.contact.phone || '')) };
    }
    S.reached = Math.min(3, Math.max(1, Number(saved.reached) || 1));
    S.step = Math.min(S.reached, Math.max(1, Number(saved.step) || 1));
  } catch {
    // andamento ilegível: começa do início.
  }
}

/** Mantém o estado coerente com a conta, os endereços, os cartões e a agenda. */
function sync() {
  const user = auth.user();
  if (!user) return;
  if (S.userId !== user.id) {
    S = fresh();
    S.userId = user.id;
    S.contact = { name: user.name || '', phone: masks.phone(user.phone || '') };
    S.addressId = preferredAddressId();
    S.cardId = cards.default()?.id || 'new';
    restore(user.id);
  }
  if (S.addressId !== 'new' && !addresses.get(S.addressId)) S.addressId = preferredAddressId();
  if (S.cardId !== 'new' && !cards.get(S.cardId)) S.cardId = cards.default()?.id || 'new';

  // O carrinho pode ter mudado: a data escolhida precisa continuar possível.
  if (S.date && !schedule.isOpen(S.date)) S.date = '';
  // A primeira data disponível já vem marcada, para os horários aparecerem de cara.
  if (!S.date) {
    const first = nextBookableDays(1)[0];
    if (first) S.date = isoDate(first);
  }
  if (!slotFree(S.date, S.slot)) S.slot = '';

  // Ninguém chega ao agendamento ou ao pagamento sem uma entrega possível…
  if (S.reached > 1 && !deliveryReady()) S.reached = 1;
  // …nem ao pagamento sem dia e horário.
  if (S.reached > 2 && !(S.date && S.slot)) S.reached = 2;
  S.step = Math.min(S.step, S.reached);

  const min = monthKey(new Date());
  const max = monthKey(lastBookableDay());
  if (!S.month) S.month = monthKey(S.date ? toDate(S.date) : schedule.earliest());
  if (S.month < min) S.month = min;
  if (S.month > max) S.month = max;
}

/* ───────── Etapas (cabeçalho) ───────── */
function stepperHtml() {
  return STEP_NAMES.map((label, i) => {
    const n = i + 1;
    const current = S.step === n;
    const done = !current && n < S.reached;
    const inner = html`<span class="steps__num">${done ? icon('check') : n}</span><span class="steps__label">${label}</span>`;
    const item = current
      ? html`<span class="steps__item is-current" aria-current="step">${inner}</span>`
      : done
        ? html`<button class="steps__item is-done" type="button" id="co-nav-${n}" data-co-edit="${n}" aria-label="Voltar para ${label}">${inner}</button>`
        : html`<span class="steps__item">${inner}</span>`;
    const bar = n < STEP_NAMES.length ? html`<span class="steps__bar ${done ? 'is-done' : ''}" aria-hidden="true"></span>` : '';
    return html`${item}${bar}`;
  });
}

/* ───────── Etapa 1 — Entrega ───────── */
function modeOption(value, iconName, title, desc, price) {
  return html`
    <label class="option co-option">
      <input type="radio" name="mode" id="co-mode-${value}" value="${value}" ${attr('checked', S.mode === value)} />
      <span class="option__icon">${icon(iconName)}</span>
      <span class="option__body co-option__body">
        <span class="co-option__main">
          <span class="option__title">${title}</span>
          <span class="option__desc">${desc}</span>
        </span>
        <span class="co-option__price ${price === 'Grátis' ? 'is-free' : ''}">${price}</span>
      </span>
      <span class="option__check">${icon('check')}</span>
    </label>
  `;
}

function cepStatusHtml() {
  const { state, message } = S.cep;
  if (state === 'loading') return html`<span class="co-spinner" aria-hidden="true"></span><span>Buscando o endereço…</span>`;
  if (state === 'ok') return html`${icon('check-circle')}<span>${message}</span>`;
  if (state === 'warn' || state === 'fail') return html`${icon('info')}<span>${message}</span>`;
  if (state === 'unknown') {
    return html`${icon('info')}<span>Sem problema: preencha o endereço abaixo. Se quiser conferir, <a class="link" href="${CORREIOS_CEP}" target="_blank" rel="noopener">consulte o CEP nos Correios</a>.</span>`;
  }
  return html`${icon('sparkles')}<span>Digite o CEP e a gente preenche o endereço para você.</span>`;
}

/** Entrega fora da área: mensagem clara e a alternativa a um toque. */
function unservedHtml(place) {
  if (!place) return '';
  return html`
    <div class="notice notice--amber co-unserved" role="alert">
      ${icon('map-pin')}
      <div>
        <p><strong>Ainda não entregamos em ${place}.</strong> Hoje atendemos ${SITE.region}.</p>
        <p>Você pode retirar no ateliê, sem custo, ou escolher outro endereço.</p>
        <button class="btn btn--sm" type="button" id="co-go-pickup" data-co-pickup>${icon('store')} Retirar no ateliê</button>
      </div>
    </div>
  `;
}

function addressForm() {
  const a = S.addr;
  return html`
    <div class="co-addr">
      <div class="co-addr__grid">
        <div class="field co-col-2">
          <label for="co-cep">CEP</label>
          <input
            class="input"
            id="co-cep"
            name="cep"
            type="text"
            inputmode="numeric"
            autocomplete="postal-code"
            data-mask="cep"
            maxlength="9"
            placeholder="00000-000"
            value="${a.cep}"
            aria-describedby="co-cep-status"
          />
        </div>
        <div class="co-cep-box co-col-4">
          <p class="co-cep is-${S.cep.state}" id="co-cep-status" data-cep-status aria-live="polite">${cepStatusHtml()}</p>
          <button class="link co-cep__help" type="button" id="co-cep-unknown" data-co-cep-unknown ${attr('hidden', S.addrOpen)}>Não sei meu CEP</button>
        </div>
      </div>

      <div class="co-unserved-box" data-co-unserved data-place="${S.unserved}">${unservedHtml(S.unserved)}</div>

      <div class="co-addr__more" data-addr-more ${attr('hidden', !S.addrOpen)}>
        <div class="co-addr__grid">
          <div class="field co-col-4">
            <label for="co-street">Rua ou avenida</label>
            <input class="input" id="co-street" name="street" type="text" autocomplete="address-line1" value="${a.street}" />
          </div>
          <div class="field co-col-2 co-narrow">
            <label for="co-number">Número</label>
            <input
              class="input"
              id="co-number"
              name="number"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              maxlength="10"
              placeholder="${S.noNumber ? 's/n' : 'Ex.: 120'}"
              value="${S.noNumber ? '' : a.number}"
              ${attr('disabled', S.noNumber)}
            />
          </div>
          <div class="field co-col-3 co-wide">
            <label for="co-complement">Complemento <span class="co-optional">(opcional)</span></label>
            <input class="input" id="co-complement" name="complement" type="text" autocomplete="address-line2" placeholder="Apto, bloco, casa…" value="${a.complement}" />
          </div>
          <label class="check co-col-3 co-nonumber">
            <input type="checkbox" name="noNumber" id="co-no-number" ${attr('checked', S.noNumber)} />
            <span>Endereço sem número</span>
          </label>
          <div class="field co-col-6">
            <label for="co-district">Bairro</label>
            <input class="input" id="co-district" name="district" type="text" autocomplete="address-level3" value="${a.district}" />
          </div>
          <div class="field co-col-4 co-wide">
            <label for="co-city">Cidade</label>
            <input class="input" id="co-city" name="city" type="text" autocomplete="address-level2" value="${a.city}" />
          </div>
          <div class="field co-col-2 co-narrow">
            <label for="co-uf">Estado</label>
            <select class="select" id="co-uf" name="uf" autocomplete="address-level1">
              <option value="">—</option>
              ${UFS.map((uf) => html`<option value="${uf}" ${attr('selected', a.uf === uf)}>${uf}</option>`)}
            </select>
          </div>
          <div class="field co-col-6">
            <label for="co-reference">Ponto de referência <span class="co-optional">(opcional)</span></label>
            <input class="input" id="co-reference" name="reference" type="text" autocomplete="off" placeholder="Ex.: portão azul, ao lado da padaria" value="${a.reference}" />
          </div>
        </div>
        <div class="co-tags" role="radiogroup" aria-label="Salvar este endereço como">
          <span class="co-tags__label">Salvar como</span>
          ${['Casa', 'Trabalho', 'Outro'].map(
            (l) => html`
              <label class="co-tag">
                <input type="radio" name="addrLabel" id="co-label-${l}" value="${l}" ${attr('checked', a.label === l)} />
                <span>${l}</span>
              </label>
            `,
          )}
        </div>
      </div>
    </div>
  `;
}

function addressBlock() {
  const list = addresses.list();
  return html`
    <fieldset class="co-group">
      <legend>Onde entregamos?</legend>
      ${list.length
        ? html`
            <div class="co-options">
              ${list.map(
                (a) => html`
                  <label class="option co-option">
                    <input type="radio" name="addressId" id="co-addr-${a.id}" value="${a.id}" ${attr('checked', S.addressId === a.id)} />
                    <span class="option__icon">${icon('map-pin')}</span>
                    <span class="option__body">
                      <span class="option__title co-option__name">${a.label || 'Endereço'} ${a.isDefault ? html`<span class="badge">Padrão</span>` : ''}</span>
                      <span class="option__desc">${addresses.format(a)}</span>
                    </span>
                    <span class="option__check">${icon('check')}</span>
                  </label>
                `,
              )}
              <label class="option co-option co-option--add">
                <input type="radio" name="addressId" id="co-addr-new" value="new" ${attr('checked', S.addressId === 'new')} />
                <span class="option__icon">${icon('plus')}</span>
                <span class="option__body"><span class="option__title">Entregar em outro endereço</span></span>
                <span class="option__check">${icon('check')}</span>
              </label>
            </div>
          `
        : ''}
      ${S.addressId === 'new' ? addressForm() : html`<div class="co-unserved-box">${unservedHtml(unservedSaved())}</div>`}
    </fieldset>
  `;
}

function pickupBlock() {
  return html`
    <div class="co-pickup">
      <span class="co-pickup__icon">${icon('store')}</span>
      <div>
        <strong>${SITE.pickup.name}</strong>
        <span>${SITE.pickup.address} · ${SITE.city}/${SITE.uf}</span>
        <span>${SITE.hours}</span>
        <small>${SITE.pickup.note}</small>
      </div>
    </div>
  `;
}

function deliveryBody() {
  const t = cart.totals({ mode: 'delivery' });
  const pickup = S.mode === 'pickup';
  return html`
    <form data-co-form="delivery" novalidate>
      <div class="co-options" role="radiogroup" aria-label="Como você quer receber o pedido">
        ${modeOption('delivery', 'truck', 'Receber em casa', `Entrega com hora marcada em ${SITE.region}`, t.shipping === 0 ? 'Grátis' : money(t.shipping))}
        ${modeOption('pickup', 'store', 'Retirar no ateliê', SITE.pickup.address, 'Grátis')}
      </div>

      ${pickup ? pickupBlock() : addressBlock()}

      <fieldset class="co-group">
        <legend>${pickup ? 'Quem vai retirar?' : 'Quem vai receber?'}</legend>
        <div class="form-grid form-grid--2">
          <div class="field">
            <label for="co-name">Nome completo</label>
            <input class="input" id="co-name" name="contactName" type="text" autocomplete="name" value="${S.contact.name}" />
          </div>
          <div class="field">
            <label for="co-phone">WhatsApp</label>
            <input
              class="input"
              id="co-phone"
              name="contactPhone"
              type="tel"
              inputmode="tel"
              autocomplete="tel-national"
              data-mask="phone"
              placeholder="(65) 99999-0000"
              value="${S.contact.phone}"
            />
            <div class="field__error"></div>
            <div class="field__hint">Só usamos para falar sobre este pedido.</div>
          </div>
        </div>
      </fieldset>

      <button class="btn btn--lg btn--block co-next" type="submit" id="co-next-1">Escolher dia e horário ${icon('arrow-right')}</button>
    </form>
  `;
}

function deliverySummary() {
  const who = `${S.contact.name} · ${S.contact.phone}`;
  if (S.mode === 'pickup') return html`<strong>Retirada no ${SITE.pickup.name}</strong><span>${SITE.pickup.address}</span><span>${who}</span>`;
  const a = addresses.get(S.addressId);
  return html`<strong>Entrega${a?.label ? `: ${a.label}` : ''}</strong><span>${addresses.format(a)}</span><span>${who}</span>`;
}

/* ───────── Etapa 2 — Agendamento ───────── */
function calendarHtml() {
  const first = schedule.earliest();
  const view = monthDate(S.month);
  const year = view.getFullYear();
  const month = view.getMonth();
  const today = isoDate(new Date());
  const firstIso = isoDate(first);
  const blanks = new Date(year, month, 1).getDay(); // semana começa no domingo
  const days = new Date(year, month + 1, 0).getDate();
  const canPrev = S.month > monthKey(new Date());
  const canNext = S.month < monthKey(lastBookableDay());

  const cells = [];
  for (let i = 0; i < blanks; i++) cells.push(html`<span class="co-cal__blank" aria-hidden="true"></span>`);
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month, d);
    const iso = isoDate(date);
    const open = schedule.isOpen(date);
    const full = open && schedule.slots(date).every((s) => s.left === 0);
    const off = !open || full;
    const selected = S.date === iso;
    const cls = [
      'co-cal__day',
      iso === today ? 'is-today' : '',
      selected ? 'is-selected' : '',
      iso === firstIso && !selected ? 'is-first' : '',
      full ? 'is-full' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const label = `${dateLong(date)}${iso === today ? ', hoje' : ''}${full ? ', esgotado' : off ? ', indisponível' : ''}`;
    cells.push(html`
      <button class="${cls}" type="button" id="co-day-${iso}" data-co-day="${iso}" aria-label="${label}" aria-pressed="${selected ? 'true' : 'false'}" ${attr('disabled', off)}>
        ${d}
      </button>
    `);
  }

  return html`
    <div class="co-cal">
      <div class="co-cal__head">
        <button class="icon-btn" type="button" id="co-month-prev" data-co-month="-1" aria-label="Mês anterior" ${attr('disabled', !canPrev)}>${icon('chevron-left')}</button>
        <strong aria-live="polite">${cap(MONTH_FMT.format(view))}</strong>
        <button class="icon-btn" type="button" id="co-month-next" data-co-month="1" aria-label="Próximo mês" ${attr('disabled', !canNext)}>${icon('chevron-right')}</button>
      </div>
      <div class="co-cal__week" aria-hidden="true">${WEEKDAYS.map(([short, long]) => html`<span title="${long}">${short}</span>`)}</div>
      <div class="co-cal__grid">${cells}</div>
      <ul class="co-cal__legend" aria-hidden="true">
        <li><i class="is-today"></i>Hoje</li>
        <li><i class="is-open">12</i>Disponível</li>
        <li><i class="is-off">12</i>Indisponível</li>
      </ul>
    </div>
  `;
}

/** Celular: faixa com os próximos dias disponíveis, no lugar do calendário do mês. */
function dayStripHtml() {
  const today = isoDate(new Date());
  const days = nextBookableDays(STRIP_DAYS);
  // Um dia escolhido no calendário completo, fora da faixa, continua visível aqui.
  if (S.date && !days.some((d) => isoDate(d) === S.date)) {
    days.push(toDate(S.date));
    days.sort((a, b) => a - b);
  }
  return html`
    <div class="co-days" data-co-days role="group" aria-label="Próximos dias disponíveis">
      ${days.map((d) => {
        const iso = isoDate(d);
        const selected = S.date === iso;
        return html`
          <button class="co-day ${selected ? 'is-selected' : ''}" type="button" id="co-day-${iso}" data-co-day="${iso}" aria-label="${dateLong(d)}" aria-pressed="${selected ? 'true' : 'false'}">
            <span class="co-day__wd">${iso === today ? 'hoje' : WEEKDAY_SHORT[d.getDay()]}</span>
            <strong class="co-day__num">${d.getDate()}</strong>
            <span class="co-day__mo">${MONTH_SHORT.format(d).replace('.', '')}</span>
          </button>
        `;
      })}
    </div>
  `;
}

function slotsHtml() {
  if (!S.date) {
    return html`
      <div class="co-slots co-slots--empty" data-co-slots>
        ${icon('clock')}
        <p>Escolha um dia para ver os horários disponíveis.</p>
      </div>
    `;
  }
  const list = schedule.slots(S.date);
  // No primeiro dia possível, só entram as janelas que começam depois de o pedido ficar pronto.
  const partial = list.length > 0 && list.length < SITE.slots.length && S.date === isoDate(schedule.earliest());
  if (!list.length) {
    return html`
      <div class="co-slots co-slots--empty" data-co-slots>
        ${icon('clock')}
        <p>Este dia não tem mais horários. Escolha outra data.</p>
      </div>
    `;
  }
  return html`
    <div class="co-slots" data-co-slots>
      <h3>Horários para <em>${dateLong(S.date).toLowerCase()}</em></h3>
      <div class="co-slots__list" role="group" aria-label="Horários disponíveis">
        ${list.map((x, i) => {
          const sold = x.left === 0;
          const selected = S.slot === x.label;
          return html`
            <button
              class="co-slot ${selected ? 'is-selected' : ''}"
              type="button"
              id="co-slot-${i}"
              data-co-slot="${x.label}"
              aria-pressed="${selected ? 'true' : 'false'}"
              ${attr('disabled', sold)}
            >
              <span class="co-slot__time">${x.label}</span>
              ${sold ? html`<span class="co-slot__tag is-sold">Esgotado</span>` : x.left === 1 ? html`<span class="co-slot__tag is-last">Últimas vagas</span>` : ''}
            </button>
          `;
        })}
      </div>
      ${partial
        ? html`<p class="co-slots__note">${icon('clock')}<span>Neste dia os horários começam às ${hourText(list[0].label.split('–')[0])}: é quando o seu pedido fica pronto.</span></p>`
        : ''}
    </div>
  `;
}

function scheduleBody() {
  const first = schedule.earliest();
  const pickup = S.mode === 'pickup';
  const month = !compact || S.fullCal; // calendário do mês (computador, ou celular a pedido)
  const ready = Boolean(S.date && S.slot);
  return html`
    <form data-co-form="schedule" novalidate>
      <p class="co-lead">
        ${icon('calendar')}
        <span>
          Feito sob encomenda, só para você. Pedindo hoje, a primeira data para ${pickup ? 'retirar' : 'receber'} é
          <strong>${dateLong(first).toLowerCase()}</strong>.
        </span>
      </p>
      <div class="co-sched ${compact ? 'co-sched--stack' : ''}">
        <div class="co-daypick">
          ${month ? calendarHtml() : dayStripHtml()}
          ${compact
            ? html`
                <button class="co-textbtn" type="button" id="co-cal-toggle" data-co-fullcal aria-expanded="${S.fullCal ? 'true' : 'false'}">
                  ${icon('calendar')}${S.fullCal ? 'Ver só os próximos dias' : 'Ver calendário completo'}
                </button>
              `
            : ''}
        </div>
        ${slotsHtml()}
      </div>
      <button class="btn btn--lg btn--block co-next" type="submit" id="co-next-2" ${attr('disabled', !ready)}>
        ${ready ? html`Ir para o pagamento ${icon('arrow-right')}` : 'Escolha um horário'}
      </button>
    </form>
  `;
}

function scheduleSummary() {
  return html`<strong>${dateLong(S.date)}</strong><span>${S.mode === 'pickup' ? 'Retirada' : 'Entrega'} entre ${S.slot.replace(' – ', ' e ')}</span>`;
}

/* ───────── Etapa 3 — Pagamento ───────── */
function previewNumber(number) {
  const padded = (digitsOf(number) + '•'.repeat(16)).slice(0, 16);
  return padded.replace(/(.{4})(?=.)/g, '$1 ');
}

function previewBrand(number) {
  const brand = digitsOf(number).length ? cardBrand(number) : '';
  return brand === 'Cartão' ? '' : brand;
}

function newCardForm() {
  const c = S.card;
  return html`
    <div class="co-newcard">
      <div class="co-cc" data-cc aria-hidden="true">
        <div class="co-cc__top">
          <span class="co-cc__chip"></span>
          <span class="co-cc__brand" data-cc-brand>${previewBrand(c.number)}</span>
        </div>
        <div class="co-cc__number" data-cc-number>${previewNumber(c.number)}</div>
        <div class="co-cc__bottom">
          <div>
            <small>Nome</small>
            <span data-cc-holder>${c.holder.trim().toUpperCase() || 'NOME NO CARTÃO'}</span>
          </div>
          <div>
            <small>Validade</small>
            <span data-cc-expiry>${c.expiry || 'MM/AA'}</span>
          </div>
        </div>
      </div>

      <div class="co-newcard__fields">
        <div class="field co-span">
          <label for="co-card-number">Número do cartão</label>
          <input
            class="input"
            id="co-card-number"
            name="cardNumber"
            type="text"
            inputmode="numeric"
            autocomplete="cc-number"
            data-mask="card"
            maxlength="19"
            placeholder="0000 0000 0000 0000"
            value="${c.number}"
          />
        </div>
        <div class="field co-span">
          <label for="co-card-holder">Nome impresso no cartão</label>
          <input class="input co-upper" id="co-card-holder" name="cardHolder" type="text" autocomplete="cc-name" autocapitalize="characters" spellcheck="false" maxlength="40" value="${c.holder}" />
        </div>
        <div class="field">
          <label for="co-card-expiry">Validade</label>
          <input class="input" id="co-card-expiry" name="cardExpiry" type="text" inputmode="numeric" autocomplete="cc-exp" data-mask="expiry" maxlength="5" placeholder="MM/AA" value="${c.expiry}" />
        </div>
        <div class="field">
          <label for="co-card-cvv">CVV</label>
          <input class="input" id="co-card-cvv" name="cardCvv" type="text" inputmode="numeric" autocomplete="cc-csc" data-mask="digits" maxlength="4" placeholder="123" value="${c.cvv}" />
        </div>
        <div class="field co-span">
          <label for="co-card-cpf">CPF do titular</label>
          <input class="input" id="co-card-cpf" name="cardCpf" type="text" inputmode="numeric" autocomplete="off" data-mask="cpf" maxlength="14" placeholder="000.000.000-00" value="${c.cpf}" />
        </div>
        <label class="check co-span">
          <input type="checkbox" name="saveCard" id="co-card-save" ${attr('checked', c.save)} />
          <span>Salvar este cartão para as próximas compras. Guardamos só a bandeira, o final e a validade.</span>
        </label>
      </div>
    </div>
  `;
}

function cardPanel(total) {
  const saved = cards.list();
  const parcels = installmentOptions(total);
  if (S.installments > parcels.length) S.installments = parcels.length;
  return html`
    <div class="co-pay-panel">
      ${saved.length
        ? html`
            <div class="co-options" role="radiogroup" aria-label="Qual cartão usar">
              ${saved.map(
                (c) => html`
                  <label class="option co-option">
                    <input type="radio" name="cardId" id="co-card-${c.id}" value="${c.id}" ${attr('checked', S.cardId === c.id)} />
                    <span class="option__icon">${icon('credit-card')}</span>
                    <span class="option__body">
                      <span class="option__title">${c.brand} •••• ${c.last4}</span>
                      <span class="option__desc">${c.holder} · validade ${c.expiry}</span>
                    </span>
                    <span class="option__check">${icon('check')}</span>
                  </label>
                `,
              )}
              <label class="option co-option co-option--add">
                <input type="radio" name="cardId" id="co-card-new" value="new" ${attr('checked', S.cardId === 'new')} />
                <span class="option__icon">${icon('plus')}</span>
                <span class="option__body"><span class="option__title">Usar outro cartão</span></span>
                <span class="option__check">${icon('check')}</span>
              </label>
            </div>
          `
        : ''}
      ${S.cardId === 'new' ? newCardForm() : ''}
      <div class="field">
        <label for="co-installments">Parcelamento</label>
        <select class="select" id="co-installments" name="installments">
          ${parcels.map((p) => html`<option value="${p.n}" ${attr('selected', S.installments === p.n)}>${p.n}x de ${money(p.value)} sem juros</option>`)}
        </select>
      </div>
    </div>
  `;
}

function pixPanel(pix) {
  return html`
    <div class="co-pay-panel co-pix">
      <ul>
        <li>${icon('check')}<span>Você paga <strong>${money(pix.total)}</strong> e economiza ${money(pix.pixDiscount)}.</span></li>
        <li>${icon('check')}<span>Na próxima tela mostramos o QR Code e o código copia e cola.</span></li>
        <li>${icon('check')}<span>A confirmação sai em segundos e o seu horário fica garantido.</span></li>
      </ul>
    </div>
  `;
}

function paymentBody() {
  const pix = cart.totals({ mode: S.mode, payment: 'pix' });
  const card = cart.totals({ mode: S.mode, payment: 'card' });
  const maxParcels = installmentOptions(card.total).length;
  const isPix = S.payment === 'pix';
  return html`
    <form data-co-form="payment" novalidate>
      <div class="co-options" role="radiogroup" aria-label="Forma de pagamento">
        <label class="option co-option">
          <input type="radio" name="payment" id="co-pay-pix" value="pix" ${attr('checked', isPix)} />
          <span class="option__icon">${icon('pix')}</span>
          <span class="option__body co-option__body">
            <span class="co-option__main">
              <span class="option__title co-option__name">Pix <span class="badge badge--green">${SITE.pix.discountPct}% OFF</span></span>
              <span class="option__desc">Aprovação na hora</span>
            </span>
            <span class="co-option__price">${money(pix.total)}</span>
          </span>
          <span class="option__check">${icon('check')}</span>
        </label>
        <label class="option co-option">
          <input type="radio" name="payment" id="co-pay-card" value="card" ${attr('checked', !isPix)} />
          <span class="option__icon">${icon('credit-card')}</span>
          <span class="option__body co-option__body">
            <span class="co-option__main">
              <span class="option__title"><span class="only-desktop">Cartão de crédito</span><span class="only-mobile">Cartão</span></span>
              <span class="option__desc">
                <span class="only-desktop">${maxParcels > 1 ? `Em até ${maxParcels}x sem juros` : 'À vista, sem juros'}</span>
                <span class="only-mobile">${maxParcels > 1 ? `Crédito, em até ${maxParcels}x sem juros` : 'Crédito, à vista'}</span>
              </span>
            </span>
            <span class="co-option__price">${money(card.total)}</span>
          </span>
          <span class="option__check">${icon('check')}</span>
        </label>
      </div>

      ${isPix ? pixPanel(pix) : cardPanel(card.total)}
      ${SITE.demo
        ? html`
            <div class="notice notice--amber co-demo">
              ${icon('info')}
              <div>
                <strong>Modo demonstração:</strong> nenhum valor será cobrado.
                ${!isPix && S.cardId === 'new' ? html`<button class="link" type="button" id="co-fill-test" data-co-fill>Preencher com cartão de teste</button>` : ''}
              </div>
            </div>
          `
        : ''}

      <button class="btn btn--lg btn--block co-pay" type="submit" id="co-pay" data-co-pay>
        ${icon('lock')}
        <span data-co-pay-label>${isPix ? `Gerar Pix de ${money(pix.total)}` : `Pagar ${money(card.total)}`}</span>
      </button>
      <p class="co-legal">
        Ao fazer o pedido, você concorda com a nossa
        <button class="link" type="button" id="co-policy" data-co-policy>política de cancelamento</button>: grátis enquanto o seu bolo não entrou em produção.
      </p>
    </form>
  `;
}

/* ───────── Moldura das etapas ───────── */
function stepCard(n, { title, hint, summary, body }) {
  const open = S.step === n;
  const done = !open && n < S.reached;
  return html`
    <section class="co-step card ${open ? 'is-open' : done ? 'is-done' : 'is-waiting'}" id="co-step-${n}" aria-labelledby="co-step-${n}-title">
      <header class="co-step__head">
        <span class="co-step__num">${done ? icon('check') : n}</span>
        <h2 id="co-step-${n}-title" tabindex="-1">${title}</h2>
        ${done ? html`<button class="btn btn--ghost btn--sm co-step__edit" type="button" id="co-edit-${n}" data-co-edit="${n}" aria-label="Alterar ${title.toLowerCase()}">Alterar</button>` : ''}
        ${done ? html`<p class="co-step__summary">${summary()}</p>` : html`<p class="co-step__hint">${hint}</p>`}
      </header>
      ${open ? html`<div class="co-step__body">${body()}</div>` : ''}
    </section>
  `;
}

function mainHtml() {
  const pickup = S.mode === 'pickup';
  return html`
    ${stepCard(1, {
      title: 'Entrega',
      hint: 'Como você quer receber o seu pedido?',
      summary: deliverySummary,
      body: deliveryBody,
    })}
    ${stepCard(2, {
      title: 'Agendamento',
      hint: pickup ? 'Escolha o dia e o horário da retirada.' : 'Escolha o dia e o horário da entrega.',
      summary: scheduleSummary,
      body: scheduleBody,
    })}
    ${stepCard(3, {
      title: 'Pagamento',
      hint: `Pix com ${SITE.pix.discountPct}% de desconto ou cartão em até ${SITE.card.maxInstallments}x.`,
      summary: () => '',
      body: paymentBody,
    })}
  `;
}

/* ───────── Resumo do pedido ───────── */
function summaryHtml() {
  const t = totalsNow();
  const lines = cart.lines();
  const code = cart.couponCode();
  const couponIssue =
    code && t.couponIssue
      ? html`
          <div class="notice notice--amber co-sum__issue" role="status">
            ${icon('ticket')}
            <div>
              <strong>O cupom ${code} não entrou neste pedido.</strong> ${t.couponIssue}
              <a class="link" href="#/carrinho">Trocar cupom</a>
            </div>
          </div>
        `
      : '';
  return html`
    <div class="co-sum card ${S.summaryOpen ? 'is-open' : ''}" data-co-sum>
      <button class="co-sum__toggle" type="button" id="co-sum-toggle" data-co-sum-toggle aria-expanded="${S.summaryOpen ? 'true' : 'false'}" aria-controls="co-sum-body">
        <span class="co-sum__toggle-main">
          ${icon('bag')}
          <span>
            <strong>Resumo do pedido</strong>
            <small>${plural(t.itemCount, 'item', 'itens')} · <span data-co-sum-hint>${S.summaryOpen ? 'ocultar' : 'ver detalhes'}</span></small>
          </span>
        </span>
        <span class="co-sum__toggle-total"><strong>${money(t.total)}</strong>${icon('chevron-down')}</span>
      </button>
      <div class="co-sum__body" id="co-sum-body">
        <h2 class="co-sum__title">Resumo do pedido</h2>
        <ul class="co-sum__items">
          ${lines.map(
            (l) => html`
              <li class="co-sum__item">
                <span class="co-sum__thumb">${lineThumb(l, { w: 112 })}<i>${l.qty}</i></span>
                <span class="co-sum__info">
                  <strong>${l.name}</strong>
                  ${l.sizeLabel ? html`<span>${l.sizeLabel}</span>` : ''}
                </span>
                <span class="co-sum__price">${money(l.price * l.qty)}</span>
              </li>
            `,
          )}
        </ul>
        <div class="co-sum__totals">${totalsSummary(t, { mode: S.mode })}</div>
        ${t.pixDiscount === 0
          ? html`<p class="co-sum__tip">${icon('pix')}<span>Pagando no Pix você ganha <strong>${SITE.pix.discountPct}% de desconto</strong>.</span></p>`
          : ''}
        <a class="co-sum__edit link" href="#/carrinho">Editar carrinho</a>
      </div>
    </div>
    ${couponIssue}
    <ul class="co-assure">
      <li>${icon('lock')}<span>Seus dados trafegam em ambiente seguro</span></li>
      <li>${icon('shield-check')}<span>Cancelamento grátis antes da produção</span></li>
      <li>${icon('message')}<span>Dúvidas? <a class="link" href="#/atendimento">Fale com a gente</a></span></li>
    </ul>
  `;
}

/* ───────── Validação ───────── */
function addressErrors(a) {
  const e = {};
  // Sem CEP só passa quem disse "Não sei meu CEP"; CEP digitado precisa estar completo.
  if (a.cep ? !validators.cep(a.cep) : !S.cepUnknown) e.cep = a.cep ? 'O CEP tem 8 números. Confira se faltou algum.' : 'Informe o CEP do endereço de entrega.';
  if (!S.addrOpen) return e; // os outros campos ainda nem apareceram
  if (a.street.trim().length < 3) e.street = 'Informe a rua ou avenida.';
  if (!S.noNumber && !a.number.trim()) e.number = 'Informe o número.';
  if (a.district.trim().length < 2) e.district = 'Informe o bairro.';
  if (a.city.trim().length < 2) e.city = 'Informe a cidade.';
  else if (!isServedCity(a.city, a.uf)) e.city = `Ainda não entregamos em ${placeOf(a.city, a.uf)}.`;
  if (!a.uf) e.uf = 'Escolha o estado.';
  return e;
}

function expiryMessage(v) {
  const m = v.match(/^(\d{2})\/(\d{2})$/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return 'Cartão vencido. Confira a validade.';
  return 'Use o formato MM/AA, como 08/29.';
}

function cardErrors(c) {
  const e = {};
  if (!digitsOf(c.number)) e.cardNumber = 'Informe o número do cartão.';
  else if (!validators.cardNumber(c.number)) e.cardNumber = 'Confira o número do cartão: algum dígito não bate.';
  if (c.holder.trim().length < 3) e.cardHolder = 'Digite o nome como está impresso no cartão.';
  if (!c.expiry) e.cardExpiry = 'Informe a validade.';
  else if (!validators.expiry(c.expiry)) e.cardExpiry = expiryMessage(c.expiry);
  if (!c.cvv) e.cardCvv = 'Informe o CVV (verso do cartão).';
  else if (!/^\d{3,4}$/.test(c.cvv)) e.cardCvv = 'O CVV tem 3 ou 4 números.';
  if (!c.cpf) e.cardCpf = 'Informe o CPF do titular do cartão.';
  else if (!validators.cpf(c.cpf)) e.cardCpf = 'Este CPF não parece válido. Confira os números.';
  return e;
}

/** Conferência ao sair do campo: só reclama do que já foi digitado (campo vazio fica para o envio). */
const ON_BLUR = {
  cep: (v) => (validators.cep(v) ? '' : 'O CEP tem 8 números. Confira se faltou algum.'),
  contactPhone: (v) => (validators.phone(v) ? '' : 'Informe o WhatsApp com DDD, por exemplo (65) 99999-1234.'),
  cardNumber: (v) => (validators.cardNumber(v) ? '' : 'Confira o número do cartão: algum dígito não bate.'),
  cardExpiry: (v) => (validators.expiry(v) ? '' : expiryMessage(v)),
  cardCvv: (v) => (/^\d{3,4}$/.test(v) ? '' : 'O CVV tem 3 ou 4 números.'),
  cardCpf: (v) => (validators.cpf(v) ? '' : 'Este CPF não parece válido. Confira os números.'),
};

/* ───────── Tela ───────── */
export default {
  title: 'Fechar pedido',
  layout: 'focus',
  auth: true,

  render() {
    if (cart.isEmpty()) return html`<div class="container co" aria-busy="true"></div>`;
    compact = guessCompact();
    sync();
    return html`
      <div class="container co">
        <div class="co-top">
          <h1>Fechar pedido</h1>
          <nav class="steps co-steps" data-co-stepper aria-label="Etapas do pedido">${stepperHtml()}</nav>
        </div>
        <div class="co-layout">
          <aside class="co-side" data-co-side aria-label="Resumo do pedido">${summaryHtml()}</aside>
          <div class="co-main" data-co-main>${mainHtml()}</div>
        </div>
      </div>
    `;
  },

  mount(root, ctx) {
    const page = root.firstElementChild;
    leaving = false;
    if (cart.isEmpty()) {
      navigate('/carrinho', { replace: true });
      return undefined;
    }

    let alive = true;
    let cepToken = 0;
    const main = page.querySelector('[data-co-main]');
    const side = page.querySelector('[data-co-side]');
    const stepper = page.querySelector('[data-co-stepper]');
    let sideCache = String(summaryHtml());
    bindMasks(main);

    persist();

    /**
     * Redesenha as etapas e o resumo no lugar, devolvendo o foco a quem estava com ele.
     * `focusStep`: a etapa acabou de abrir — o foco vai para o título dela (teclado e leitor de tela).
     */
    function paint({ scrollTo = 0, focusStep = 0 } = {}) {
      sync();
      persist();
      const focusId = page.contains(document.activeElement) ? document.activeElement.id : '';
      const stripAt = page.querySelector('[data-co-days]')?.scrollLeft || 0;
      main.innerHTML = String(mainHtml());
      const strip = page.querySelector('[data-co-days]');
      if (strip) strip.scrollLeft = stripAt; // a faixa de dias não volta para o começo a cada toque
      stepper.innerHTML = String(html`${stepperHtml()}`);
      const nextSide = String(summaryHtml());
      if (nextSide !== sideCache) {
        side.innerHTML = nextSide;
        sideCache = nextSide;
      }
      bindMasks(main);
      if (focusStep) {
        page.querySelector(`#co-step-${focusStep}-title`)?.focus({ preventScroll: true });
      } else if (focusId) {
        const el = document.getElementById(focusId);
        if (el && !el.disabled) el.focus({ preventScroll: true });
      }
      if (scrollTo) page.querySelector(`#co-step-${scrollTo}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    const offCart = whenStore('cart', () => {
      if (!leaving) ctx.rerender();
    });

    // Girou o aparelho ou mudou a largura da janela: troca entre faixa de dias e calendário.
    const onResize = () => {
      const next = guessCompact();
      if (next === compact) return;
      compact = next;
      if (S.step === 2 && !S.placing) paint();
    };
    window.addEventListener('resize', onResize);

    /* ── Navegação entre etapas ── */
    on(page, 'click', '[data-co-edit]', (_ev, btn) => {
      if (S.placing) return;
      S.step = Number(btn.dataset.coEdit);
      paint({ scrollTo: S.step, focusStep: S.step });
    });

    on(page, 'click', '[data-co-sum-toggle]', (_ev, btn) => {
      S.summaryOpen = !S.summaryOpen;
      btn.closest('[data-co-sum]').classList.toggle('is-open', S.summaryOpen);
      btn.setAttribute('aria-expanded', String(S.summaryOpen));
      btn.querySelector('[data-co-sum-hint]').textContent = S.summaryOpen ? 'ocultar' : 'ver detalhes';
      sideCache = String(summaryHtml());
    });

    /* ── Campos: tudo que é digitado vai para o estado ── */
    on(page, 'input', 'input, select', (_ev, el) => {
      const bind = BIND[el.name];
      if (!bind) return;
      S[bind[0]][bind[1]] = el.value;
      if (el.closest('.field')?.classList.contains('is-invalid')) setFieldError(el.form, el.name, '');
      if (bind[0] === 'contact') persist();
      // Mexeu na cidade ou no estado: o aviso de área some e é reavaliado ao sair do campo.
      if ((el.name === 'city' || el.name === 'uf') && S.unserved) showUnserved('');
      if (el.name === 'cep') onCep(el);
      if (bind[0] === 'card') updateCardPreview();
    });

    on(page, 'focusout', 'input', (_ev, el) => {
      if (el.name === 'city') checkServed();
      const check = ON_BLUR[el.name];
      if (!check || !el.value.trim() || !el.form) return;
      setFieldError(el.form, el.name, check(el.value));
    });

    on(page, 'change', 'input[type="radio"], input[type="checkbox"], select', (_ev, el) => {
      if (el.name === 'mode') {
        S.mode = el.value;
        paint();
      } else if (el.name === 'addressId') {
        S.addressId = el.value;
        paint();
      } else if (el.name === 'uf') {
        checkServed();
      } else if (el.name === 'addrLabel') {
        S.addr.label = el.value;
      } else if (el.name === 'noNumber') {
        // "Endereço sem número": o campo fica desligado e o endereço é salvo com "s/n".
        S.noNumber = el.checked;
        const number = el.form.querySelector('[name="number"]');
        number.disabled = S.noNumber;
        number.placeholder = S.noNumber ? 's/n' : 'Ex.: 120';
        if (S.noNumber) {
          number.value = '';
          S.addr.number = '';
          setFieldError(el.form, 'number', '');
        } else {
          number.focus();
        }
      } else if (el.name === 'payment') {
        S.payment = el.value;
        paint();
      } else if (el.name === 'cardId') {
        S.cardId = el.value;
        paint();
      } else if (el.name === 'installments') {
        S.installments = Number(el.value);
      } else if (el.name === 'saveCard') {
        S.card.save = el.checked;
      }
    });

    /* ── CEP: busca sozinho e nunca trava o preenchimento ── */
    function setCep(state, message = '') {
      S.cep.state = state;
      S.cep.message = message;
      const box = page.querySelector('[data-cep-status]');
      if (!box) return;
      box.className = `co-cep is-${state}`;
      box.innerHTML = String(cepStatusHtml());
    }

    /** Mostra (ou tira) o aviso de fora da área no formulário de endereço novo, sem redesenhar a etapa. */
    function showUnserved(place) {
      S.unserved = place;
      const box = page.querySelector('[data-co-unserved]');
      // Só troca o aviso quando ele muda: recriá-lo tiraria o foco do botão "Retirar no ateliê".
      if (box && (box.dataset.place || '') !== place) {
        box.innerHTML = String(unservedHtml(place));
        box.dataset.place = place;
      }
      const form = page.querySelector('[data-co-form="delivery"]');
      if (form?.querySelector('[name="city"]')) setFieldError(form, 'city', place ? `Ainda não entregamos em ${place}.` : '');
    }

    /** Confere a cidade digitada (ou vinda do CEP) contra a área de entrega. → true quando atendemos. */
    function checkServed() {
      if (S.mode !== 'delivery' || S.addressId !== 'new') return true;
      const city = S.addr.city.trim();
      const bad = city.length >= 2 && !isServedCity(city, S.addr.uf);
      if (bad || S.unserved) showUnserved(bad ? placeOf(city, S.addr.uf) : '');
      return !bad;
    }

    /** Leva a pessoa até o aviso de fora da área, com o foco no botão "Retirar no ateliê". */
    function pointToPickup() {
      const btn = page.querySelector('[data-co-pickup]');
      if (!btn) return;
      btn.focus({ preventScroll: true });
      btn.closest('.co-unserved').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    on(page, 'click', '[data-co-pickup]', () => {
      S.mode = 'pickup';
      paint({ scrollTo: 1 });
      page.querySelector('#co-mode-pickup')?.focus({ preventScroll: true });
    });

    /** Mostra o restante do endereço (rua, número, bairro…), sem redesenhar o que está sendo digitado. */
    function openAddress() {
      S.addrOpen = true;
      const more = page.querySelector('[data-addr-more]');
      if (more) more.hidden = false;
      const help = page.querySelector('[data-co-cep-unknown]');
      if (help) help.hidden = true;
    }

    on(page, 'click', '[data-co-cep-unknown]', () => {
      S.cepUnknown = true;
      openAddress();
      setCep('unknown');
      setFieldError(page.querySelector('[data-co-form="delivery"]'), 'cep', '');
      page.querySelector('#co-street')?.focus();
    });

    async function onCep(input) {
      const cep = digitsOf(input.value);
      if (cep.length < 8) {
        cepToken += 1;
        S.cep.last = '';
        if (S.cep.state !== 'idle') setCep('idle');
        return;
      }
      if (S.unserved) showUnserved(''); // CEP novo: o aviso anterior não vale mais
      if (cep === S.cep.last) return;
      S.cep.last = cep;
      const token = ++cepToken;
      openAddress(); // CEP completo: os campos aparecem já, com ou sem resposta da busca
      setCep('loading');
      const res = await lookupCep(cep);
      if (!alive || token !== cepToken) return;

      if (!res.ok) {
        setCep(
          'fail',
          res.reason === 'notfound'
            ? 'Não encontramos este CEP. Sem problema: preencha o endereço nos campos abaixo.'
            : 'Não conseguimos buscar o CEP agora. Você pode preencher o endereço à mão.',
        );
        return;
      }

      const form = page.querySelector('[data-co-form="delivery"]');
      ['street', 'district', 'city', 'uf'].forEach((key) => {
        if (!res[key]) return;
        S.addr[key] = res[key];
        const field = form?.querySelector(`[name="${key}"]`);
        if (!field) return;
        field.value = res[key];
        setFieldError(form, key, '');
      });

      // CEP de fora da área de entrega: avisa na hora e oferece a retirada, em vez de seguir pedindo o número.
      if (!checkServed()) {
        setCep('warn', `Este CEP é de ${res.city}/${res.uf}.`);
        return;
      }
      setCep('ok', res.street ? 'Endereço encontrado! Agora é só informar o número.' : 'Encontramos a cidade. Complete com a rua e o número.');

      // Se a pessoa ainda está no CEP, leva o cursor para o que falta preencher.
      if (document.activeElement === input) form?.querySelector(res.street ? '#co-number' : '#co-street')?.focus({ preventScroll: true });
    }

    /* ── Etapa 1 ── */
    function submitDelivery(form) {
      const delivering = S.mode === 'delivery';
      const errors = delivering && S.addressId === 'new' ? addressErrors(S.addr) : {};
      if (S.contact.name.trim().length < 3) errors.contactName = `Diga o nome de quem vai ${delivering ? 'receber' : 'retirar'} o pedido.`;
      if (!validators.phone(S.contact.phone)) {
        errors.contactPhone = S.contact.phone ? 'Informe o WhatsApp com DDD, por exemplo (65) 99999-1234.' : 'Informe um WhatsApp para falarmos sobre o pedido.';
      }
      if (delivering && S.addressId === 'new') checkServed();
      if (!applyErrors(form, errors)) {
        // Se o único impedimento é a área de entrega, o foco vai para a alternativa (retirar no ateliê).
        if (Object.keys(errors).every((k) => k === 'city') && S.unserved) pointToPickup();
        return;
      }
      if (delivering && unservedSaved()) {
        pointToPickup();
        return;
      }

      if (delivering && S.addressId === 'new') {
        const clean = Object.fromEntries(Object.entries(S.addr).map(([k, v]) => [k, String(v).trim()]));
        if (S.noNumber) clean.number = 's/n';
        // "cuiaba" digitado à mão é salvo com o nome certo da cidade atendida ("Cuiabá").
        clean.city = SITE.deliveryCities.find((c) => plainText(c) === plainText(clean.city)) || clean.city;
        const saved = addresses.save(clean);
        S.addressId = saved.id;
        S.addr = blankAddress();
        S.addrOpen = false;
        S.cepUnknown = false;
        S.noNumber = false;
        S.unserved = '';
        S.cep = { state: 'idle', message: '', last: '' };
      }
      S.contact.name = S.contact.name.trim();
      S.reached = Math.max(S.reached, 2);
      S.step = S.reached >= 3 ? 3 : 2;
      sync(); // pode recuar a etapa (ex.: endereço fora da área): rola e foca a que ficou aberta
      paint({ scrollTo: S.step, focusStep: S.step });
    }

    /* ── Etapa 2 ── */
    on(page, 'click', '[data-co-month]', (_ev, btn) => {
      const d = monthDate(S.month);
      d.setMonth(d.getMonth() + Number(btn.dataset.coMonth));
      S.month = monthKey(d);
      paint();
    });

    on(page, 'click', '[data-co-day]', (_ev, btn) => {
      S.date = btn.dataset.coDay;
      if (!slotFree(S.date, S.slot)) S.slot = '';
      S.month = monthKey(toDate(S.date));
      paint();
      // Com o calendário do mês aberto no celular, os horários ficam abaixo da dobra: leva até eles.
      if (compact && S.fullCal) page.querySelector('[data-co-slots]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    on(page, 'click', '[data-co-fullcal]', () => {
      S.fullCal = !S.fullCal;
      if (S.date) S.month = monthKey(toDate(S.date));
      paint();
    });

    on(page, 'click', '[data-co-slot]', (_ev, btn) => {
      S.slot = btn.dataset.coSlot;
      paint();
    });

    function submitSchedule() {
      if (!(S.date && S.slot)) return; // o botão só libera com dia e horário escolhidos
      S.reached = 3;
      S.step = 3;
      paint({ scrollTo: 3, focusStep: 3 });
    }

    /* ── Etapa 3 ── */
    function updateCardPreview() {
      const box = page.querySelector('[data-cc]');
      if (!box) return;
      box.querySelector('[data-cc-number]').textContent = previewNumber(S.card.number);
      box.querySelector('[data-cc-holder]').textContent = S.card.holder.trim().toUpperCase() || 'NOME NO CARTÃO';
      box.querySelector('[data-cc-expiry]').textContent = S.card.expiry || 'MM/AA';
      box.querySelector('[data-cc-brand]').textContent = previewBrand(S.card.number);
    }

    on(page, 'click', '[data-co-fill]', () => {
      S.card = { ...S.card, ...TEST_CARD, holder: (S.contact.name || auth.user()?.name || 'Cliente Teste').toUpperCase() };
      paint();
      toast('Cartão de teste preenchido. Nada será cobrado.', { type: 'success' });
    });

    on(page, 'click', '[data-co-policy]', () => {
      openDialog({
        title: 'Política de cancelamento',
        body: html`
          <div class="co-policy">
            <p><strong>Antes da produção: cancelamento grátis.</strong> Enquanto o seu bolo não começou a ser feito, você cancela direto em “Meus pedidos” e o valor pago volta integralmente.</p>
            <p><strong>Depois que a produção começa:</strong> os ingredientes já foram separados e usados só para você. Fale com a gente pelo atendimento que encontramos juntos a melhor solução.</p>
            <p><strong>Garantia BOLAB:</strong> se o seu bolo não chegar perfeito, a gente refaz ou devolve o seu dinheiro.</p>
          </div>
        `,
        footer: html`<button class="btn" type="button" data-dialog-close autofocus>Entendi</button>`,
      });
    });

    function setBusy(busy, label) {
      const btn = page.querySelector('[data-co-pay]');
      if (!btn) return;
      const form = btn.form;
      form.classList.toggle('is-busy', busy);
      form.querySelectorAll('.co-options, .co-pay-panel, .co-demo, .co-legal').forEach((el) => {
        el.inert = busy;
      });
      btn.classList.toggle('is-busy', busy);
      btn.setAttribute('aria-busy', String(busy));
      if (busy) {
        btn.dataset.label = btn.querySelector('[data-co-pay-label]').textContent;
        btn.querySelector('[data-co-pay-label]').textContent = label;
      } else if (btn.dataset.label) {
        btn.querySelector('[data-co-pay-label]').textContent = btn.dataset.label;
      }
    }

    async function placeOrder(form) {
      if (S.placing) return;

      // As etapas anteriores precisam continuar valendo (o horário pode ter saído do ar).
      sync();
      if (S.reached < 3) {
        toast(S.reached < 2 ? 'Confira os dados da entrega para continuar.' : 'Este horário não está mais disponível. Escolha outro para continuar.', { type: 'error' });
        paint({ scrollTo: S.step, focusStep: S.step });
        return;
      }
      // sync() já garantiu: em entrega, o endereço existe e fica dentro da área atendida.
      const address = S.mode === 'delivery' ? addresses.get(S.addressId) : null;

      let payment = { method: 'pix', paid: false };
      let cardToSave = null;
      if (S.payment === 'card') {
        if (S.cardId === 'new') {
          if (!applyErrors(form, cardErrors(S.card))) return;
          payment = { method: 'card', brand: cardBrand(S.card.number), last4: digitsOf(S.card.number).slice(-4), installments: S.installments, paid: true };
          if (S.card.save) cardToSave = { number: S.card.number, holder: S.card.holder, expiry: S.card.expiry };
        } else {
          const saved = cards.get(S.cardId);
          payment = { method: 'card', brand: saved.brand, last4: saved.last4, installments: S.installments, paid: true };
        }
      }

      S.placing = true;
      setBusy(true, payment.method === 'card' ? 'Processando pagamento…' : 'Gerando o seu Pix…');
      await sleep(payment.method === 'card' ? 1500 : 800);
      if (!alive) {
        S.placing = false;
        return;
      }

      try {
        if (cardToSave) cards.save(cardToSave);
        leaving = true;
        const order = orders.create({
          delivery: { mode: S.mode, date: S.date, slot: S.slot },
          address,
          payment,
          contact: { name: S.contact.name, phone: S.contact.phone },
        });
        S = fresh(); // nada do cartão fica na memória
        forget();
        navigate(`/pedido/${order.id}`, { query: { novo: 1 }, replace: true });
      } catch (err) {
        console.error('[checkout] não foi possível fechar o pedido', err);
        leaving = false;
        S.placing = false;
        setBusy(false);
        // Recusas da loja (ex.: endereço fora da área) chegam com a mensagem pronta para a cliente.
        const refusal = err && err.constructor === Error && err.message;
        toast(refusal || 'Não conseguimos fechar o pedido agora. Tente de novo em instantes.', { type: 'error', duration: 6000 });
        if (cart.isEmpty()) navigate('/carrinho', { replace: true });
        else paint({ scrollTo: S.step, focusStep: S.step });
      }
    }

    on(page, 'submit', 'form[data-co-form]', (ev, form) => {
      ev.preventDefault();
      if (form.dataset.coForm === 'delivery') submitDelivery(form);
      else if (form.dataset.coForm === 'schedule') submitSchedule(form);
      else placeOrder(form);
    });

    return () => {
      alive = false;
      offCart();
      window.removeEventListener('resize', onResize);
    };
  },
};
