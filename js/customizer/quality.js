// BOLAB — níveis de qualidade do 3D.
//
//   desktop  computador: tudo ligado, 2 pixels por ponto, todas as peças com todos os segmentos.
//   mobile   o celular de hoje (r6-luz): sombras suaves de verdade, materiais físicos (verniz, acetinado),
//            texturas de 512, corpo do bolo com todos os segmentos, até 2 pixels por ponto.
//   lite     último recurso: sem mapa de sombras (sombra de contato falsa), sem verniz, 1,5 pixel por ponto,
//            peças com metade dos segmentos. Ninguém começa aqui, a não ser aparelho muito fraco (≤ 2 GB ou
//            ≤ 2 núcleos, quando o aparelho informa) ou um aparelho que já precisou ser rebaixado nesta quinzena.
//
// O motor ajusta sozinho: primeiro baixa a resolução (createResolutionGovernor); se, já no piso, desenhar
// continuar caro, rebaixa o nível uma vez (mobile → lite) e nunca sobe de volta no meio do uso.
// Para testar um nível à força: ?cztier=mobile | lite | desktop no endereço (antes do #).

export const TIERS = {
  desktop: {
    name: 'desktop',
    family: 'desktop', // o que a tela enxerga em cake.tier ('desktop' | 'mobile')
    maxRatio: 2, // teto de pixels por ponto da tela
    minRatio: 1, // último recurso da resolução dinâmica (o piso normal depende da tela: ver createResolutionGovernor)
    antialias: true,
    shadows: true, // mapa de sombras em tempo real
    shadowSize: 1024, // (a sombra é macia de propósito: mais pontos que isso só custam)
    softShadow: true,
    physical: true, // verniz (clearcoat), brilho acetinado (sheen) e iridescência
    fillLight: true, // luz de preenchimento
    pointLight: true, // luz quente das velas
    detail: 1, // peças de decoração e bicos com todos os segmentos
    bodyDetail: 1, // corpo do bolo (cobertura, calda, massa, base)
    density: 1, // quantidade de granulado, confete e pérolas
    texSize: 512,
    aniso: 8,
    plaquePx: 384, // altura da textura da plaquinha
    smallCastShadow: true, // frutas pequenas, flores e miudezas projetam sombra
    rotateFps: 60, // giro automático (o monitor pode ter 144 Hz: não precisa disso tudo)
    flickerFps: 30, // chama das velas
    activeFps: 0, // arrastando ou animando: 0 = o ritmo da tela
    wedgeEvery: 1, // "ver por dentro": refaz as faces do corte a cada N quadros da abertura
    idleSleep: 0, // segundos sem toque até o giro automático descansar (0 = nunca)
    fallback: null,
  },
  // Orçamento do celular: até 2 pixels por ponto (descendo a 1,25 se os quadros atrasarem), mapa de sombras de
  // 768, luz principal + preenchimento + contraluz + ambiente de estúdio, e no máximo
  // 150 mil triângulos no bolo mais carregado.
  mobile: {
    name: 'mobile',
    family: 'mobile',
    maxRatio: 2,
    minRatio: 1,
    antialias: true,
    shadows: true,
    shadowSize: 768,
    softShadow: true,
    physical: true,
    fillLight: true,
    pointLight: true,
    detail: 0.8,
    bodyDetail: 1,
    density: 0.7,
    texSize: 512,
    aniso: 4,
    plaquePx: 256,
    smallCastShadow: true, // frutas e flores projetam sombra (sem ela, parecem flutuar sobre a cobertura)
    rotateFps: 30,
    flickerFps: 30,
    activeFps: 60,
    wedgeEvery: 2,
    idleSleep: 25,
    fallback: 'lite',
  },
  // Nível leve: um passe só (sem mapa de sombras), sem verniz, e no máximo ~110 mil triângulos.
  lite: {
    name: 'lite',
    family: 'mobile',
    maxRatio: 1.5,
    minRatio: 1,
    antialias: true, // barato nas placas de celular e segura o serrilhado a 1,5×
    shadows: false,
    shadowSize: 1024,
    softShadow: false,
    physical: false,
    fillLight: false,
    pointLight: false,
    detail: 0.5,
    bodyDetail: 0.5,
    density: 0.7,
    texSize: 256,
    aniso: 2,
    plaquePx: 192,
    smallCastShadow: false,
    rotateFps: 30,
    flickerFps: 30,
    activeFps: 60,
    wedgeEvery: 2,
    idleSleep: 25,
    fallback: null,
  },
};

/* O aparelho que precisou do nível leve começa nele nas próximas visitas (por 14 dias): não passa de novo
   pelos segundos de engasgo até o motor decidir. Guardado só no próprio aparelho. */
const LITE_KEY = 'bolab:cz:lite';
const LITE_DAYS = 14;
export function rememberLite() {
  try {
    window.localStorage.setItem(LITE_KEY, String(Date.now()));
  } catch {
    // sem armazenamento: vale só para esta visita
  }
}
function rememberedLite() {
  try {
    const at = Number(window.localStorage.getItem(LITE_KEY) || 0);
    return at > 0 && Date.now() - at < LITE_DAYS * 864e5;
  } catch {
    return false;
  }
}

/** Aparelho com pouca folga: tela de toque pequena, Android/WebView, iPhone, ou pouca memória e poucos núcleos. */
export function detectTier() {
  try {
    const forced = new URLSearchParams(window.location.search).get('cztier');
    if (forced && TIERS[forced]) return TIERS[forced];
    const ua = navigator.userAgent || '';
    const touch = window.matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints || 0) > 0;
    const small = Math.min(window.screen?.width || 9999, window.screen?.height || 9999) < 820 || window.matchMedia('(max-width: 899px)').matches;
    const handheld = /Android|iPhone|iPad|iPod/i.test(ua);
    const weak = (navigator.deviceMemory || 8) <= 4 && (navigator.hardwareConcurrency || 8) <= 6;
    if (!((touch && small) || handheld || weak)) return TIERS.desktop;
    // muito fraco (quando o aparelho informa) ou já rebaixado há pouco: começa no nível leve
    const feeble = (navigator.deviceMemory || 8) <= 2 || (navigator.hardwareConcurrency || 8) <= 2;
    return feeble || rememberedLite() ? TIERS.lite : TIERS.mobile;
  } catch {
    return TIERS.desktop;
  }
}

/**
 * Resolução dinâmica. A nitidez é o padrão: o regulador só baixa a resolução quando DESENHAR está caro.
 *
 * O que ele mede: o custo de cada quadro animado — o tempo de render na CPU e, quando o aparelho informa,
 * o tempo da placa de vídeo. Nunca o intervalo entre quadros: esse também atrasa por causa de outras tarefas
 * da página e do próprio limite de 30 quadros/s do giro, e baixar a resolução não resolveria nenhum dos dois.
 *
 *  - desce um degrau (0,25) só depois de 20 quadros animados SEGUIDOS acima do orçamento;
 *  - sobe de volta com facilidade: 30 quadros seguidos abaixo de metade do orçamento (se a subida não se
 *    sustentar, passa a esperar 4× mais antes de tentar de novo — não fica oscilando);
 *  - piso: em telas com 2 ou mais pixels por ponto nunca abaixo de 1,25; o 1,0 só existe em telas de menos
 *    de 2× ou como último recurso, depois de 3 janelas seguidas (60 quadros) estouradas já em 1,25
 *    (o antisserrilhado é fixado na criação da tela e não pode ser desligado depois).
 * Quadros parados não passam por aqui: o motor sempre os redesenha na resolução máxima do nível.
 *
 * r6-luz: quando nem o último recurso basta — mais 3 janelas seguidas (60 quadros) estouradas com a resolução
 * já na menor possível —, o regulador avisa (exhausted = true) e o motor rebaixa o nível de qualidade
 * (mobile → lite). reset() recomeça a conta no nível novo.
 */
export function createResolutionGovernor({ max, dpr = 1, step = 0.25 }) {
  const floorFor = (d, top) => Math.min(top, d >= 2 ? 1.25 : 1);
  let top = max;
  let floor = floorFor(dpr, max);
  let ratio = max;
  let over = 0; // quadros seguidos acima do orçamento
  let under = 0; // quadros seguidos com folga
  let stuck = 0; // janelas seguidas estouradas já no piso
  let lastResort = false;
  let starved = 0; // janelas seguidas estouradas sem ter mais para onde descer
  let exhausted = false;
  let upNeed = 30;
  let sinceUp = 1e9; // quadros desde a última subida
  let cpu = 0;
  let gpu = null;
  let budget = 0;
  const steps = { down: 0, up: 0 };
  return {
    get ratio() {
      return ratio;
    },
    /** Desenhar continua caro mesmo na menor resolução: é hora de rebaixar o nível. */
    get exhausted() {
      return exhausted;
    },
    /**
     * costMs = custo de desenhar o quadro (o maior entre CPU e placa de vídeo) · budgetMs = orçamento do modo
     * atual (giro a 30 quadros/s tem mais folga que um arrasto a 60). Devolve true se a proporção mudou.
     */
    sample(costMs, budgetMs, { cpuMs = costMs, gpuMs = null } = {}) {
      if (!(costMs >= 0) || !(budgetMs > 0) || costMs > 250) return false; // engasgo isolado não conta
      cpu = cpu ? cpu * 0.9 + cpuMs * 0.1 : cpuMs;
      if (gpuMs != null) gpu = gpu == null ? gpuMs : gpu * 0.9 + gpuMs * 0.1;
      budget = budgetMs;
      sinceUp++;
      if (costMs > budgetMs) {
        over++;
        under = 0;
      } else {
        over = 0;
        stuck = 0;
        starved = 0;
        under = costMs < budgetMs * 0.5 ? under + 1 : 0;
      }
      if (over >= 20) {
        over = 0;
        const min = lastResort ? Math.min(1, floor) : floor;
        if (ratio > min + 1e-3) {
          if (sinceUp < 240) upNeed = Math.min(1200, upNeed * 4); // a última subida não se sustentou
          ratio = Math.max(min, ratio - step);
          steps.down++;
          return true;
        }
        if (!lastResort && ratio > 1 + 1e-3 && ++stuck >= 3) {
          lastResort = true;
          stuck = 0;
          ratio = Math.max(1, ratio - step);
          steps.down++;
          return true;
        }
        // já na menor resolução possível e ainda estourando: mais três janelas assim e o nível precisa cair
        if (ratio <= Math.min(1, floor) + 1e-3 && ++starved >= 3) exhausted = true;
        return false;
      }
      if (under >= upNeed && ratio < top - 1e-3) {
        under = 0;
        sinceUp = 0;
        ratio = Math.min(top, ratio + step);
        steps.up++;
        return true;
      }
      return false;
    },
    /** A tela mudou (outro monitor, zoom): novo teto e novo piso. */
    limit(nextMax, nextDpr = dpr) {
      top = nextMax;
      floor = floorFor(nextDpr, nextMax);
      ratio = Math.max(Math.min(ratio, top), Math.min(lastResort ? 1 : floor, top));
    },
    /** Depois de um rebaixamento de nível: novo teto, conta zerada (a resolução recomeça do teto novo). */
    reset(nextMax, nextDpr = dpr) {
      top = nextMax;
      floor = floorFor(nextDpr, nextMax);
      ratio = top;
      over = under = stuck = starved = 0;
      lastResort = false;
      exhausted = false;
      upNeed = 30;
      sinceUp = 1e9;
    },
    /** Retrato do regulador, só para conferência (gancho ?czdebug). */
    state() {
      return { ratio, max: top, floor, lastResort, exhausted, overFrames: over, calmFrames: under, upAfter: upNeed, cpuMs: +cpu.toFixed(2), gpuMs: gpu == null ? null : +gpu.toFixed(2), budgetMs: +budget.toFixed(1), steps: { ...steps } };
    },
  };
}
