// BOLAB — Ateliê: o cartão do bolo (lembrança para baixar ou mandar): a foto do bolo no fundo do palco, a marca,
// o nome do bolo e, se a pessoa quiser assinar, "feito por …".
//
//   drawCard(info) → Promise<canvas 1080 × 1350>          downloadCanvas(canvas)
//   openCard(info) → abre o cartão com assinatura, baixar, compartilhar, copiar o link e (se houver) o vídeo
//
//   info = { name, serves, backdrop, shot({ width, height }) → canvas | null, flat(canvas), link,
//            maker, setMaker(nome), tell(id, valor), video? }
//
// O nome digitado só é desenhado no <canvas> e posto no campo pelo html`` (escapado): nunca vira HTML.
// No app Android, "Baixar" é atendido pela casca do app (ela intercepta o download de data:image).
import { html, raw, openDialog, toast, copyText, debounce } from '../../ui.js';

const W = 1080;
const H = 1350;
const svg = (body) => raw(`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`);
const ICON = {
  download: svg('<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/>'),
  share: svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.600 13.500 6.800 4M15.400 6.500l-6.800 4"/>'),
  link: svg('<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>'),
  film: svg('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 9 5 3-5 3Z"/>'),
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
