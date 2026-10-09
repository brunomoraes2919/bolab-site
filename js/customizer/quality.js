// BOLAB — níveis de qualidade do 3D. O celular começa num nível leve (menos pixels, sombra barata,
// peças com menos polígonos) e o motor ainda ajusta a resolução sozinho para manter o giro fluido.
// Para testar um nível à força: ?cztier=mobile ou ?cztier=desktop no endereço (antes do #).

export const TIERS = {
  desktop: {
    name: 'desktop',
    maxRatio: 2, // teto de pixels por ponto da tela
    minRatio: 1, // último recurso da resolução dinâmica (o piso normal depende da tela: ver createResolutionGovernor)
    antialias: true,
    shadows: true, // mapa de sombras em tempo real
    shadowSize: 2048,
    softShadow: true,
    physical: true, // verniz (clearcoat), brilho acetinado (sheen) e iridescência
    fillLight: true, // luz de preenchimento
    pointLight: true, // luz quente das velas
    detail: 1, // peças com todos os segmentos
    density: 1, // quantidade de granulado, confete e pérolas
    texSize: 512,
    plaquePx: 384, // altura da textura da plaquinha
    smallCastShadow: true, // frutas pequenas, flores e miudezas projetam sombra
    rotateFps: 60, // giro automático (o monitor pode ter 144 Hz: não precisa disso tudo)
    flickerFps: 30, // chama das velas
    activeFps: 0, // arrastando ou animando: 0 = o ritmo da tela
    wedgeEvery: 1, // "ver por dentro": refaz as faces do corte a cada N quadros da abertura
    idleSleep: 0, // segundos sem toque até o giro automático descansar (0 = nunca)
  },
  // Orçamento do celular: até 1,5 pixel por ponto (descendo a 1,0 se os quadros atrasarem), um passe só
  // (sem mapa de sombras: sombras de contato falsas), 2 luzes + ambiente, sem verniz, e no máximo
  // ~110 mil triângulos no bolo mais carregado.
  mobile: {
    name: 'mobile',
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
    density: 0.7,
    texSize: 256,
    plaquePx: 192,
    smallCastShadow: false,
    rotateFps: 30,
    flickerFps: 30,
    activeFps: 60,
    wedgeEvery: 2,
    idleSleep: 25,
  },
};

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
    return (touch && small) || handheld || weak ? TIERS.mobile : TIERS.desktop;
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
    /** Retrato do regulador, só para conferência (gancho ?czdebug). */
    state() {
      return { ratio, max: top, floor, lastResort, overFrames: over, calmFrames: under, upAfter: upNeed, cpuMs: +cpu.toFixed(2), gpuMs: gpu == null ? null : +gpu.toFixed(2), budgetMs: +budget.toFixed(1), steps: { ...steps } };
    },
  };
}
