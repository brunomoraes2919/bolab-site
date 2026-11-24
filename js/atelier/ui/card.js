// BOLAB — Ateliê: o cartão do bolo (lembrança para baixar ou mandar): a foto do bolo no fundo do palco, a marca,
// o nome do bolo e, se a pessoa quiser assinar, "feito por …".
//
//   drawCard(info) → Promise<canvas 1080 × 1350>          downloadCanvas(canvas)
//   openCard(info) → abre o cartão com assinatura, baixar, compartilhar, copiar o link e (se houver) o vídeo
//
//   info = { name, serves, backdrop, shot({ width, height }) → canvas | null, flat(canvas), link,
//            maker, setMaker(nome), tell(id, valor), video? }
//
//   openShow(info) → r7-criar: "Mostrar para um adulto" — o bolo com nome (a criança batiza), preço, QR feito aqui
//                    mesmo (./qr.js), a mensagem pronta e os botões de enviar. Nada é enviado nem aberto sozinho:
//                    cada saída é um toque da própria pessoa. Quem abre o link vê o MESMO bolo, com "Pedir este bolo".
//
//   info (openShow) = { name, named, autoName, price, serves, thumb() → url, link, setName(nome) → link novo,
//                       keep() (guarda o bolo no aparelho), order() (pede daqui mesmo), tell(id, valor) }
//
// O nome digitado só é desenhado no <canvas> e posto no campo pelo html`` (escapado): nunca vira HTML.
// No app Android, "Baixar" é atendido pela casca do app (ela intercepta o download de data:image).
import { html, raw, openDialog, toast, copyText, debounce, money } from '../../ui.js';
import { qrMatrix, qrPath } from './qr.js';

const W = 1080;
const H = 1350;
const svg = (body) => raw(`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`);
const ICON = {
  download: svg('<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/>'),
  share: svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.600 13.500 6.800 4M15.400 6.500l-6.800 4"/>'),
  link: svg('<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>'),
  film: svg('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 9 5 3-5 3Z"/>'),
  copy: svg('<rect x="9" y="9" width="12" height="12" rx="2.500"/><path d="M5 15V5.500A2.500 2.500 0 0 1 7.500 3H15"/>'),
  chat: svg('<path d="M20.500 11.500a8.500 8.500 0 0 1-12.600 7.400L3.500 20.500l1.600-4.300A8.500 8.500 0 1 1 20.500 11.500Z"/>'),
  check: svg('<path d="m5 12.500 4.500 4.500L19 7.500"/>'),
  bag: svg('<path d="M5 8h14l-1 12H6Z"/><path d="M9 8V6.500a3 3 0 0 1 6 0V8"/>'),
};

/** Sem "<", ">" nem espaços repetidos; no máximo 24 letras. */
export const cleanMaker = (v) =>
  String(v ?? '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^\s+/, '')
    .slice(0, 24);

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

const fontFace = () => getComputedStyle(document.documentElement).getPropertyValue('--font-body').trim() || 'system-ui, sans-serif';

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r);
  else g.rect(x, y, w, h);
}

/** A foto com a marca (a parte que não muda quando a pessoa assina). */
async function drawBase(info) {
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const g = out.getContext('2d');
  // a foto é tirada mais alta do que o cartão e sobe 180 px: o bolo fica acima da etiqueta, sem emenda no fundo
  const shot = info.shot({ width: W, height: H + 180, fill: 0.6 });
  if (shot) g.drawImage(shot, 0, -180);
  else {
    const flat = document.createElement('canvas');
    flat.width = flat.height = W;
    info.flat(flat);
    g.fillStyle = '#fdeef2';
    g.fillRect(0, 0, W, H);
    g.drawImage(flat, 0, (H - W) / 2 - 130);
  }
  const logo = await loadImage('assets/logo.webp');
  if (logo) {
    const lw = 210;
    const lh = (lw * logo.height) / logo.width;
    if (info.backdrop?.tone === 'dark') {
      g.fillStyle = 'rgba(255, 250, 248, 0.95)';
      roundRect(g, (W - lw) / 2 - 28, 40, lw + 56, lh + 30, 28);
      g.fill();
    }
    g.drawImage(logo, (W - lw) / 2, 55, lw, lh);
  }
  await document.fonts?.load?.(`800 60px ${fontFace()}`).catch(() => {});
  return out;
}

/** A etiqueta do cartão: nome do bolo, assinatura e quantas fatias, numa plaquinha branca. */
function compose(base, info, maker) {
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const g = out.getContext('2d');
  g.drawImage(base, 0, 0);
  const face = fontFace();
  const signed = Boolean(maker);
  const boxH = signed ? 268 : 214;
  const x = 60;
  const y = H - boxH - 60;
  g.save();
  g.shadowColor = 'rgba(42, 18, 21, 0.22)';
  g.shadowBlur = 40;
  g.shadowOffsetY = 14;
  g.fillStyle = '#ffffff';
  roundRect(g, x, y, W - 2 * x, boxH, 36);
  g.fill();
  g.restore();
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  let fs = 60;
  do {
    g.font = `800 ${fs}px ${face}`;
    fs -= 2;
  } while (g.measureText(info.name).width > W - 2 * x - 96 && fs > 30);
  g.fillStyle = '#1c1a1b';
  g.fillText(info.name, W / 2, y + 92);
  let line = y + 146;
  if (signed) {
    g.font = `700 36px ${face}`;
    g.fillStyle = '#d12d58';
    g.fillText(`feito por ${maker}`, W / 2, line);
    line += 54;
  }
  g.font = `600 28px ${face}`;
  g.fillStyle = '#5f5b5e';
  g.fillText(`${info.serves} · montado no ateliê 3D da BOLAB`, W / 2, line);
  return out;
}

export async function drawCard(info) {
  return compose(await drawBase(info), info, cleanMaker(info.maker));
}

export function downloadCanvas(canvas, name = 'meu-bolo-bolab.jpg') {
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/jpeg', 0.9);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function openCard(info) {
  const base = await drawBase(info);
  let maker = cleanMaker(info.maker);
  let canvas = compose(base, info, maker);
  let file = null;
  const makeFile = async () => {
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
    file = blob ? new File([blob], 'meu-bolo-bolab.jpg', { type: 'image/jpeg' }) : null;
    return file;
  };
  await makeFile();
  const canShare = Boolean(file && navigator.canShare?.({ files: [file] }));
  info.tell('photo', 'cartao');
  const dlg = openDialog({
    title: 'Cartão do bolo',
    body: html`<div class="at-cardbox">
      <img src="${canvas.toDataURL('image/jpeg', 0.82)}" alt="Cartão com a foto do bolo ${info.name}" width="540" height="675" data-card />
      <div class="at-cardbox__side">
        <label class="at-cardbox__field" for="at-maker">
          <span>Assinar o cartão <small>(opcional)</small></span>
          <input class="input" id="at-maker" type="text" maxlength="24" placeholder="Seu nome" value="${maker}" autocomplete="given-name" enterkeyhint="done" data-maker />
        </label>
        <p class="at-cardbox__hint">Aparece no cartão como “feito por …”.</p>
        <div class="at-cardbox__more">
          <button type="button" class="cz-linkbtn" data-do="link">${ICON.link} Copiar o link do bolo</button>
          ${info.video ? html`<button type="button" class="cz-linkbtn" data-do="video">${ICON.film} Gravar um vídeo</button>` : ''}
        </div>
      </div>
    </div>`,
    footer: html`
      <button type="button" class="btn btn--secondary cz-fit" data-do="download">${ICON.download} Baixar</button>
      ${canShare ? html`<button type="button" class="btn cz-fit" data-do="share">${ICON.share} Compartilhar</button>` : ''}
    `,
  });
  const img = dlg.el.querySelector('[data-card]');
  const redraw = debounce(() => {
    if (!img.isConnected) return;
    canvas = compose(base, info, maker);
    img.src = canvas.toDataURL('image/jpeg', 0.82);
    file = null;
  }, 260);
  dlg.el.addEventListener('input', (ev) => {
    const input = ev.target.closest('[data-maker]');
    if (!input) return;
    if (input.value !== cleanMaker(input.value)) input.value = cleanMaker(input.value);
    maker = input.value.trim();
    info.setMaker(maker);
    redraw();
  });
  dlg.el.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target.closest('[data-maker]')) ev.target.blur();
  });
  dlg.el.addEventListener('click', async (ev) => {
    const what = ev.target.closest('[data-do]')?.dataset.do;
    if (!what) return;
    if (what === 'download') {
      canvas = compose(base, info, maker);
      info.tell('download');
      info.tell('photo', 'foto');
      downloadCanvas(canvas);
      toast('Cartão do bolo baixado', { type: 'success' });
    } else if (what === 'share') {
      canvas = compose(base, info, maker);
      const f = file || (await makeFile());
      if (!f) return;
      info.tell('share');
      try {
        await navigator.share({ files: [f], title: info.name, text: `Olha o bolo que eu montei na BOLAB! ${info.link}` });
      } catch {
        // a pessoa fechou a janela de compartilhar: tudo bem
      }
    } else if (what === 'link') {
      const ok = await copyText(info.link);
      info.tell('link');
      toast(ok === false ? 'Não deu para copiar o link aqui.' : 'Link copiado. Quem abrir vê este mesmo bolo.', { type: ok === false ? 'info' : 'success' });
    } else if (what === 'video') {
      dlg.close();
      info.video();
    }
  });
  return dlg;
}

/** Sem "<", ">" nem espaços repetidos; no máximo 40 letras (o mesmo limite do nome do bolo na tela). */
export const cleanCakeName = (v) =>
  String(v ?? '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^\s+/, '')
    .slice(0, 40);

/** A mensagem pronta que acompanha o link (é a que vai no "Enviar", no WhatsApp e no "Copiar"). */
export const showMessage = (name, price, link) => `Olha o bolo que eu montei na BOLAB! É o “${name}”, por ${money(price)}. Dá para ver e pedir aqui: ${link}`.trim();

/** O QR do link, pronto para a tela — ou '' quando o endereço é comprido demais para um código fácil de ler. */
function qrMarkup(link) {
  const qr = qrMatrix(link);
  if (!qr || qr.version > 24) return '';
  const pad = 4; // a margem branca que os leitores pedem
  const side = qr.size + pad * 2;
  // cada módulo com 3 px inteiros (no computador, de 1 px por ponto, um módulo de tamanho quebrado sai borrado);
  // em tela estreita o CSS encolhe o desenho, e a densidade do celular dá conta
  // só números e letras de comando de caminho: o desenho é feito aqui, nada vem de fora
  return String(html`<svg class="at-show__qrpic" width="${side * 3}" height="${side * 3}" viewBox="0 0 ${side} ${side}" role="img" aria-label="Código QR com o endereço deste bolo" shape-rendering="crispEdges"><rect width="${side}" height="${side}" fill="#fff"/><path transform="translate(${pad} ${pad})" fill="#000" d="${raw(qrPath(qr))}"/></svg>`);
}

/**
 * "Mostrar para um adulto": o cartão do bolo (foto, nome, preço) e as saídas — QR para quem está perto, mensagem
 * com link para quem está longe, e "pedir este bolo" para quando o adulto pega o aparelho na mão.
 */
export function openShow(info) {
  let name = info.named ? cleanCakeName(info.name) : '';
  let link = info.link;
  const canShare = typeof navigator.share === 'function';
  const shown = () => name || info.autoName;
  info.tell('show', 'open');
  const dlg = openDialog({
    title: 'Mostrar para um adulto',
    body: html`<div class="at-show">
      <div class="at-show__card">
        <img class="at-show__pic" src="${info.thumb()}" alt="O bolo que você montou" width="112" height="112" />
        <div class="at-show__info">
          <label for="at-cakename">Nome do bolo</label>
          <input class="input" id="at-cakename" type="text" maxlength="40" placeholder="${info.autoName}" value="${name}" autocomplete="off" enterkeyhint="done" data-cakename />
          <p class="at-show__price"><strong>${money(info.price)}</strong><span>${info.serves}</span></p>
        </div>
      </div>
      <div class="at-show__far">
        <p class="at-show__lead"><strong>Está longe?</strong> Mande esta mensagem:</p>
        <p class="at-show__msg"><span data-msg>${showMessage(shown(), info.price, '')}</span> <span class="at-show__link" data-link>${link}</span></p>
        <div class="at-show__ways">
          ${canShare ? html`<button type="button" class="btn cz-fit" data-do="share">${ICON.share} Enviar</button>` : ''}
          <a class="btn ${canShare ? 'btn--secondary' : ''} cz-fit" data-do="whats" href="https://wa.me/?text=${encodeURIComponent(showMessage(shown(), info.price, link))}" target="_blank" rel="noopener">${ICON.chat} WhatsApp</a>
          <button type="button" class="btn btn--secondary cz-fit" data-do="copy">${ICON.copy} Copiar</button>
        </div>
      </div>
      <div class="at-show__near" data-near>
        <div class="at-show__qr" data-qr>${raw(qrMarkup(link))}</div>
        <p><strong>O adulto está perto?</strong> É só apontar a câmera do celular dele para este código. O bolo abre lá, com o botão de pedir.</p>
      </div>
      <p class="at-show__keep">${ICON.check}<span>Seu bolo fica guardado neste aparelho. Dá para continuar depois.</span></p>
    </div>`,
    footer: html`<button type="button" class="btn btn--secondary btn--block at-show__order" data-do="order">${ICON.bag} O adulto está aqui: pedir este bolo</button>`,
  });
  const q = (sel) => dlg.el.querySelector(sel);
  const near = q('[data-near]');
  if (!q('[data-qr]').firstChild) near.hidden = true; // endereço comprido demais: ficam a mensagem e o link
  info.keep?.();
  const refresh = debounce(() => {
    if (!dlg.el.isConnected) return;
    link = info.setName(name) || link;
    q('[data-msg]').textContent = showMessage(shown(), info.price, '');
    q('[data-link]').textContent = link;
    q('[data-do="whats"]').href = `https://wa.me/?text=${encodeURIComponent(showMessage(shown(), info.price, link))}`;
    const markup = qrMarkup(link);
    q('[data-qr]').innerHTML = markup;
    near.hidden = !markup;
  }, 320);
  dlg.el.addEventListener('input', (ev) => {
    const input = ev.target.closest('[data-cakename]');
    if (!input) return;
    if (input.value !== cleanCakeName(input.value)) input.value = cleanCakeName(input.value);
    name = input.value.trim();
    refresh();
  });
  dlg.el.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target.closest('[data-cakename]')) ev.target.blur();
  });
  dlg.el.addEventListener('click', async (ev) => {
    const what = ev.target.closest('[data-do]')?.dataset.do;
    if (!what) return;
    const text = showMessage(shown(), info.price, link);
    if (what === 'share') {
      info.tell('show', 'share');
      info.keep?.();
      try {
        await navigator.share({ title: shown(), text });
      } catch {
        // a pessoa fechou a janela de enviar: tudo bem
      }
    } else if (what === 'copy') {
      const ok = await copyText(text);
      info.tell('show', 'copy');
      info.keep?.();
      toast(ok === false ? 'Não deu para copiar aqui. Use o código ou o WhatsApp.' : 'Mensagem copiada, com o link do bolo. Agora é só colar para o adulto.', { type: ok === false ? 'info' : 'success', duration: 4500 });
    } else if (what === 'whats') {
      info.tell('show', 'whatsapp'); // o próprio link abre o WhatsApp (toque da pessoa); aqui só fica o registro
      info.keep?.();
    } else if (what === 'order') {
      info.tell('show', 'order');
      dlg.close();
      info.order();
    }
  });
  return dlg;
}
