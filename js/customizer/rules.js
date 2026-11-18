// BOLAB — regras de confeiteiro do personalizador: o que um confeiteiro diria ao ver o bolo montado.
//
//   rulesOf(config) → [{ level, code, step, text, fix? }]
//     level  'bloqueia'  não se faz de verdade: a tela corrige sozinha (enforceRules) e explica
//            'alerta'    dá para fazer, com cuidado: aparece no painel, não trava nada
//            'dica'      conselho de quem faz todo dia
//     code   identificador estável (a assistente Bô usa para escolher o comentário)
//     step   etapa da tela onde o assunto mora: 'formato' | 'massa' | 'recheio' | 'cobertura' | 'acabamento' | 'decoracao'
//     text   a frase, pronta para ler em voz alta
//     fix    { label, apply(config, prev) }  como resolver (apply mexe numa cópia da configuração e pode devolver
//            { note: 'frase dizendo o que fez' }); nos alertas e dicas é uma sugestão que a pessoa aceita com um toque
//
//   enforceRules(config, prev?) → { config, fixed: [regras 'bloqueia' aplicadas] }
//     prev = a configuração de antes da última escolha: com ela, a correção desfaz o lado certo da combinação
//     (quem pôs a 3ª camada no bentô da caixinha ganha o bolo fora da caixinha, não uma camada a menos).
//
// Módulo puro: sem tela e sem 3D (roda no Node — tools/tests/cz_rules.test.mjs). As decorações podem consultar
// rulesOf também; aqui só entram regras de estrutura, sabor, cobertura, calda e do que encosta nelas.
import { getCovering, getFilling, getFinish, getPiping, getDecor, isVolcano, MAX_LAYERS } from '../data/customizer.js';
import { normalizeConfig, coversOf, heightCmOf, servesText, extraPrepOf, prepHoursOf, decorOptions } from './pricing.js';

const low = (s) => String(s).toLowerCase();
const joinPt = (list) => (list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`);
const uniq = (list) => [...new Set(list)];

/** Estilos de cobertura que ocupam a lateral inteira (nada mais se prende ali) e os que ocupam só o pé do bolo. */
const SIDE_STYLES = ['rosetas', 'babados', 'cesta'];
const FOOT_STYLES = ['barrado', 'chuva'];
/** O que troca uma cobertura mole por uma firme parecida. */
const FIRM_SWAP = { chantilly: 'chantininho', mousse: 'buttercream', merengue: 'buttercream' };
/** Decorações pesadas, que marcam (ou afundam em) coberturas moles e no glacê espelhado. */
const HEAVY_DECOR = ['macarons', 'bombons', 'brigadeiros', 'morangos', 'biscoitos'];

/** Os estilos que ocupam a lateral, com artigo (para as frases): [nome, plural?]. */
const STYLE_ART = { rosetas: ['as rosetas', true], babados: ['os babados', true], cesta: ['o trançado de cesta', false], barrado: ['o barrado', false], chuva: ['os confeitos subindo', true], faultline: ['a fault line', false] };
const styleArt = (id) => (STYLE_ART[id] || [low(getFinish(id)?.name || id), false])[0];
const styleMany = (id) => Boolean((STYLE_ART[id] || [])[1]);
const capital = (text) => text.replace(/^./, (ch) => ch.toUpperCase());
/** Arranjos que prendem a peça na lateral do bolo (a cascata desce por ela: sem lateral, sobraria uma peça ou duas no topo). */
const SIDE_ARRS = ['lateral', 'frente', 'cascata'];
/** Nome de uma decoração com artigo ("as nuvens"), para as frases. */
const decorName = (id) => {
  const d = getDecor(id);
  return d ? `${d.art || 'os'} ${low(d.name)}` : id;
};
/** Decorações presas na lateral: a cerca, a fita e as que estão com arranjo de lateral. */
function sideDecor(c) {
  const items = c.decor?.items || [];
  return items.filter((id) => id === 'wafer' || id === 'fita' || SIDE_ARRS.includes(decorOptions(c, id).arr));
}
/**
 * Tira da lateral o que estiver preso nela: quem tem um arranjo de topo vai para o topo; quem só existe na
 * lateral (cerca, fita, carinha) sai do bolo. only = só estes ids. → frase dizendo o que foi feito
 */
function clearSide(x, only = null) {
  const moved = [];
  const out = [];
  sideDecor(x)
    .filter((id) => !only || only.includes(id))
    .forEach((id) => {
      const to = id === 'wafer' || id === 'fita' ? null : (getDecor(id)?.arrs || []).find((a) => !SIDE_ARRS.includes(a));
      if (to) {
        x.decor.opts = { ...(x.decor.opts || {}), [id]: { ...(x.decor.opts?.[id] || {}), arr: to } };
        moved.push(id);
      } else {
        x.decor.items = x.decor.items.filter((q) => q !== id);
        out.push(id);
      }
    });
  const parts = [];
  if (out.length) parts.push(`Tiramos ${joinPt(out.map(decorName))}.`);
  if (moved.length) parts.push(`${capital(joinPt(moved.map(decorName)))} ${moved.length > 1 || /^(as|os) /.test(decorName(moved[0])) ? 'foram' : 'foi'} para o topo.`);
  return { note: parts.join(' ') };
}

/** Aplica uma mudança em todas as coberturas (a do bolo e a de cada andar). */
function eachCover(config, fn) {
  fn(config.covering, 0);
  if (Array.isArray(config.tierCover)) config.tierCover.forEach((cover, i) => fn(cover, i));
}

function setLayers(config, n) {
  const count = Math.max(1, Math.min(MAX_LAYERS, n));
  while (config.layers.length > count) config.layers.pop();
  while (config.layers.length < count) config.layers.push(config.layers[config.layers.length - 1] || 'baunilha');
  config.fillings.length = Math.min(config.fillings.length, count - 1);
  while (config.fillings.length < count - 1) config.fillings.push(config.fillings[config.fillings.length - 1] || 'ninho');
  if (Array.isArray(config.fillAdds)) config.fillAdds.length = Math.min(config.fillAdds.length, count - 1);
}

/** O que o confeiteiro diria deste bolo. Aceita qualquer configuração (normaliza antes de olhar). */
export function rulesOf(raw) {
  const c = normalizeConfig(raw);
  const out = [];
  const add = (level, code, step, text, fix = null) => out.push(fix ? { level, code, step, text, fix } : { level, code, step, text });
  const tiers = c.tiers || 1;
  const n = c.layers.length;
  const covers = coversOf(c);
  const types = covers.map((x) => getCovering(x.type));
  const styles = covers.map((x) => x.style);
  const fills = c.fillings.map(getFilling);
  const volcano = isVolcano(c);
  const bento = c.size === 'bento';
  const pip = getPiping(c.piping?.style);
  const piped = Boolean(pip) && pip.id !== 'liso';
  const pipedLow = piped && (pip.combo || c.piping.where !== 'top');
  const pipedSide = piped && Boolean(pip.side); // escamas, poá, arabescos, guirlandas: o bico toma a lateral
  const items = c.decor?.items || [];
  const height = heightCmOf(c);
  const coverNames = (list) => low(joinPt(uniq(list.map((x) => x.name))));

  /* ───────── Tamanho e formato ───────── */
  if (bento && tiers > 1) add('bloqueia', 'bento-andares', 'formato', 'O bentô é um mini bolo de um andar só. Para andares, escolha do P para cima.', { label: 'Deixar com 1 andar', apply: (x) => ((x.tiers = 1), (x.tierCover = null)) });
  if (bento && n > 3) add('bloqueia', 'bento-camadas', 'massa', 'No bentô cabem até 3 camadas de massa: mais que isso ele tomba.', { label: 'Deixar com 3 camadas', apply: (x) => setLayers(x, 3) });
  if (bento && c.base === 'caixa' && n === 3) {
    add('bloqueia', 'bento-caixinha', 'massa', 'Na caixinha, o bentô vai com até 2 camadas: com 3 a tampa não fecha.', {
      label: 'Ajustar',
      // quem acabou de escolher a caixinha quer a caixinha (sai uma camada); quem pôs a camada quer a camada (sai a caixinha)
      apply: (x, prev) => {
        if (prev && prev.base !== 'caixa') {
          setLayers(x, 2);
          return { note: 'Deixamos o bolo com 2 camadas.' };
        }
        x.base = 'prato';
        return { note: 'Tiramos da caixinha: ele vai no prato.' };
      },
    });
  }
  if (c.size === 'gg' && tiers >= 3) add('bloqueia', 'gg-andares', 'formato', 'O GG vai até 2 andares: com 3, o de baixo passaria de 36 cm e não cabe no forno nem na caixa de transporte. Para 3 andares, o maior é o G.', { label: 'Deixar com 2 andares', apply: (x) => ((x.tiers = 2), Array.isArray(x.tierCover) && (x.tierCover.length = 2)) });
  if (bento && tiers === 1) add('dica', 'bento-serve', 'formato', 'O bentô serve uma ou duas pessoas: é presente, não bolo de festa. Para a turma, leve também um P.');
  if (c.size === 'gg') add('dica', 'gg-peso', 'formato', `O GG de ${tiers > 1 ? `${tiers} andares` : 'um andar'} é pesado: a entrega é feita por duas pessoas e a mesa precisa ser firme.`);
  if (height >= 34) add('alerta', 'transporte-altura', 'formato', `Com ${height} cm de altura, este bolo viaja em duas partes e é montado no local da festa. A gente combina o horário com você.`);
  else if (tiers === 3) add('dica', 'andares-prazo', 'formato', 'Três andares pedem 4 dias: cada andar é montado, firmado e só então recebe o de cima.');
  if (volcano && c.size === 'gg') add('alerta', 'vulcao-gg', 'formato', 'Fôrma de furo de 30 cm assa devagar: o vulcão GG sai mais baixo no centro. O G é o maior que fica bonito.', { label: 'Trocar para o G', apply: (x) => (x.size = 'g') });

  /* ───────── Sustentação ───────── */
  if (tiers >= 3 && types.some((t) => t.soft)) {
    const soft = uniq(types.filter((t) => t.soft).map((t) => t.name));
    add('bloqueia', 'andares-cobertura-mole', 'cobertura', `${joinPt(soft)} não ${soft.length > 1 ? 'seguram' : 'segura'} 3 andares: com o peso, a lateral cede e racha. Trocamos por uma cobertura firme.`, {
      label: 'Trocar por cobertura firme',
      apply: (x) => eachCover(x, (cover) => FIRM_SWAP[cover.type] && ((cover.type = FIRM_SWAP[cover.type]), (cover.style = 'liso'))),
    });
  } else if (tiers === 2 && Array.isArray(c.tierCover) && ['mousse', 'merengue'].includes(covers[0].type)) {
    add('bloqueia', 'andar-de-baixo-mole', 'cobertura', `${types[0].name} no andar de baixo não aguenta o peso do andar de cima. Trocamos o de baixo por uma cobertura firme.`, {
      label: 'Trocar o andar de baixo',
      apply: (x) => ((x.tierCover[0].type = FIRM_SWAP[x.tierCover[0].type]), (x.tierCover[0].style = 'liso'), (x.covering = { ...x.tierCover[0] })),
    });
  } else if (tiers === 2 && types[0].soft) {
    add('alerta', 'dois-andares-mole', 'cobertura', `${types[0].name} em bolo de 2 andares cede com o peso e com o calor. A gente monta com suportes, mas chantininho ou buttercream são bem mais seguros.`, {
      label: 'Trocar por chantininho',
      apply: (x) => eachCover(x, (cover) => FIRM_SWAP[cover.type] && ((cover.type = 'chantininho'), (cover.style = 'liso'))),
    });
  }
  const softFills = uniq(fills.filter((f) => f.soft).map((f) => f.name));
  if (softFills.length && tiers >= 2) add('alerta', 'andares-recheio-mole', 'recheio', `${joinPt(softFills)} em bolo de andares: cada camada leva um anel de buttercream por fora, para o recheio não escapar com o peso. O bolo precisa chegar gelado.`);
  else if (softFills.length && n >= 4) add('alerta', 'alto-recheio-mole', 'recheio', `Bolo alto com ${low(joinPt(softFills))} pede estrutura: a gente monta com anel de buttercream e canudos por dentro. Fora da geladeira, ele aguenta pouco tempo.`);

  /* ───────── Compatibilidades ───────── */
  if (types.some((t) => t.id === 'glace') && pipedLow) {
    add('bloqueia', 'glace-bico-lateral', 'acabamento', 'Glacê espelhado não aceita bico na lateral: o creme escorrega no espelho. O bico ficou só no topo.', {
      label: 'Bico só no topo',
      apply: (x) => (getPiping(x.piping.style)?.combo ? (x.piping.style = 'liso') : (x.piping.where = 'top')),
    });
  }
  if (types.some((t) => t.id === 'merengue') && c.drip.on) add('bloqueia', 'merengue-calda', 'cobertura', 'Merengue maçaricado não vai com calda: a calda quente derrete os picos. Tiramos a calda.', { label: 'Tirar a calda', apply: (x) => (x.drip.on = false) });
  if (types.some((t) => t.id === 'merengue') && piped) add('bloqueia', 'merengue-bico', 'acabamento', 'O merengue em picos já é o acabamento: bico por cima dele não assenta. Tiramos o bico.', { label: 'Tirar o bico', apply: (x) => (x.piping.style = 'liso') });
  const rough = types.filter((t) => t.id === 'brigadeiro' || t.id === 'coco');
  if (rough.length && c.drip.on) add('bloqueia', 'textura-calda', 'cobertura', `A calda não corre por cima do ${rough[0].id === 'coco' ? 'coco ralado' : 'granulado'}: ela empoça e não desce. Tiramos a calda.`, { label: 'Tirar a calda', apply: (x) => (x.drip.on = false) });
  const sideStyle = styles.find((s) => SIDE_STYLES.includes(s));
  const footStyle = styles.find((s) => FOOT_STYLES.includes(s));
  if (styles.some((s) => s === 'rosetas' || s === 'babados') && c.drip.on) {
    add('bloqueia', 'bico-lateral-calda', 'cobertura', `Com ${low(getFinish(styles.find((s) => s === 'rosetas' || s === 'babados')).name)} na lateral, a calda não tem por onde descer. Tiramos a calda.`, { label: 'Tirar a calda', apply: (x) => (x.drip.on = false) });
  }
  if (styles.includes('rosetas') && piped) add('bloqueia', 'rosetas-bico', 'acabamento', 'O bolo de rosetas já é confeitado de bico por inteiro: tiramos o acabamento da borda.', { label: 'Tirar o bico', apply: (x) => (x.piping.style = 'liso') });
  else if ((sideStyle || footStyle) && pipedLow) {
    add('bloqueia', 'lateral-bico-base', 'acabamento', `${getFinish(sideStyle || footStyle).name} ocupa o pé do bolo: o bico ficou só no topo.`, {
      label: 'Bico só no topo',
      apply: (x) => (getPiping(x.piping.style)?.combo ? (x.piping.style = 'liso') : (x.piping.where = 'top')),
    });
  }
  else if ((sideStyle || footStyle) && pipedSide) {
    const st = sideStyle || footStyle;
    add('bloqueia', 'lateral-bico-lateral', 'acabamento', `${capital(styleArt(st))} já ${styleMany(st) ? 'ocupam' : 'ocupa'} a lateral do bolo: o bico de ${low(pip.name)} não entra por cima. Tiramos o bico.`, { label: 'Tirar o bico', apply: (x) => (x.piping.style = 'liso') });
  }
  // o que mais se prende na lateral: fita e peças coladas
  const onSide = sideDecor(c).filter((id) => id !== 'wafer');
  if (sideStyle && onSide.length) {
    add('bloqueia', 'lateral-pecas', 'decoracao', `${capital(styleArt(sideStyle))} ${styleMany(sideStyle) ? 'tomam' : 'toma'} a lateral inteira do bolo: nada mais se prende ali.`, { label: 'Levar para o topo', apply: (x) => clearSide(x, onSide) });
  } else if ((footStyle || styles.includes('faultline')) && items.includes('fita')) {
    add('bloqueia', 'lateral-fita', 'decoracao', `A fita esconderia ${styleArt(footStyle || 'faultline')}: tiramos a fita.`, { label: 'Tirar a fita', apply: (x) => (x.decor.items = x.decor.items.filter((id) => id !== 'fita')) });
  }
  if (styles[styles.length - 1] === 'rosetas' && types[types.length - 1].kind !== 'naked' && c.decor.message && c.decor.messageMode === 'bico') {
    add('bloqueia', 'rosetas-escrita', 'decoracao', 'Por cima das rosetas não dá para escrever com bico: a mensagem foi para a plaquinha.', { label: 'Mensagem na plaquinha', apply: (x) => (x.decor.messageMode = 'placa') });
  }
  if ((sideStyle || footStyle || styles.includes('faultline')) && items.includes('wafer')) {
    add('bloqueia', 'lateral-cerca', 'decoracao', `A cerca de chocolate esconderia ${low(getFinish(sideStyle || footStyle || 'faultline').name)}: tiramos a cerca.`, {
      label: 'Tirar a cerca',
      apply: (x) => (x.decor.items = x.decor.items.filter((id) => id !== 'wafer')),
    });
  }
  if (c.drip.on && c.drip.length === 'longa' && pipedLow && !sideStyle && !footStyle && !types.some((t) => t.id === 'glace')) {
    add('bloqueia', 'calda-longa-bico-base', 'acabamento', 'A calda longa desce até o pé do bolo e cobriria o bico da base.', {
      label: 'Ajustar',
      // quem alongou a calda quer a calda longa (o bico sobe para o topo); quem pôs o bico na base quer o bico (a calda encurta)
      apply: (x, prev) => {
        if (prev && prev.drip.length === 'longa' && prev.drip.on) {
          x.drip.length = 'media';
          return { note: 'Deixamos a calda no comprimento médio.' };
        }
        if (getPiping(x.piping.style)?.combo) x.piping.style = 'liso';
        else x.piping.where = 'top';
        return { note: 'O bico ficou só no topo.' };
      },
    });
  }
  if (volcano && piped) add('bloqueia', 'vulcao-bico', 'acabamento', 'No vulcão a cobertura escorre por cima da borda: bico não segura ali. Tiramos o bico.', { label: 'Tirar o bico', apply: (x) => (x.piping.style = 'liso') });
  if (volcano && sideDecor(c).length) {
    add('bloqueia', 'vulcao-lateral', 'decoracao', 'No vulcão a lateral é a própria massa, com o creme escorrendo: nada se cola nela (nem cerca, nem fita).', { label: 'Levar para o topo', apply: (x) => clearSide(x) });
  }
  if (volcano && c.decor.message && c.decor.messageMode === 'bico') {
    add('bloqueia', 'vulcao-escrita', 'decoracao', 'O topo do vulcão é creme escorrendo, com o furo no meio: não dá para escrever com bico. A mensagem foi para a plaquinha.', { label: 'Mensagem na plaquinha', apply: (x) => (x.decor.messageMode = 'placa') });
  }
  if (styles.includes('faultline') && n < 3) {
    add('bloqueia', 'faultline-baixo', 'cobertura', 'A fault line precisa de altura: num bolo baixo a faixa de confeitos some.', {
      label: 'Altura padrão',
      // quem baixou o bolo quer o bolo baixo (sai a fault line); quem escolheu a fault line quer a fault line (o bolo sobe)
      apply: (x, prev) => {
        if (prev && prev.layers.length >= 3) {
          eachCover(x, (cover) => cover.style === 'faultline' && (cover.style = 'liso'));
          return { note: 'A cobertura voltou a ser lisa.' };
        }
        setLayers(x, 3);
        return { note: 'Deixamos o bolo na altura padrão.' };
      },
    });
  }
  if (tiers > 1 && Array.isArray(c.tierCover)) {
    covers.forEach((cover, i) => {
      if (i < tiers - 1 && cover.type === 'naked' && covers.slice(i + 1).some((up) => up.type === 'pasta')) {
        add('alerta', 'naked-sob-pasta', 'cobertura', 'Andar naked embaixo de um andar de pasta americana: o de cima pesa e o naked não tem casca para segurar. A gente reforça com canudos, mas inverter os dois é mais seguro.');
      }
    });
  }
  if (types.some((t) => t.id === 'glace') && items.some((id) => HEAVY_DECOR.includes(id))) add('alerta', 'glace-decor-pesada', 'decoracao', 'Decoração pesada marca o glacê espelhado. Pérolas, folha de ouro e frutas pequenas ficam perfeitas nele.');
  if (c.drip.on && c.drip.metal && types.some((t) => t.soft)) add('alerta', 'calda-metalica-mole', 'cobertura', 'A calda dourada é pincelada depois de firme, e em cobertura mole ela demora a firmar. Em buttercream ou chantininho o dourado fica mais vivo.');

  /* ───────── Chá revelação ───────── */
  if (c.reveal.on) {
    if (types.some((t) => t.kind === 'naked') || styles.includes('seminaked')) {
      add('bloqueia', 'revelacao-naked', 'cobertura', 'No chá revelação o recheio não pode aparecer por fora: trocamos o naked por uma cobertura fechada.', {
        label: 'Cobertura fechada',
        apply: (x) => eachCover(x, (cover) => (cover.type === 'naked' ? ((cover.type = 'chantininho'), (cover.style = 'liso')) : cover.style === 'seminaked' && (cover.style = 'liso'))),
      });
    }
    if (!fills.length) add('bloqueia', 'revelacao-sem-recheio', 'recheio', 'O chá revelação precisa de recheio: é ele que leva a cor. Acrescentamos uma camada com recheio de Ninho.', { label: 'Acrescentar recheio', apply: (x) => (setLayers(x, 2), (x.fillings = ['ninho'])) });
    else if (fills.some((f) => !f.pale)) {
      const dark = uniq(fills.filter((f) => !f.pale).map((f) => f.name));
      add('bloqueia', 'revelacao-recheio-escuro', 'recheio', `${joinPt(dark)} não ${dark.length > 1 ? 'pegam' : 'pega'} a cor do chá revelação: só creme claro tinge direito. Trocamos por Ninho.`, {
        label: 'Trocar por Ninho',
        apply: (x) => (x.fillings = x.fillings.map((id) => (getFilling(id)?.pale ? id : 'ninho'))),
      });
    }
    if (c.fillAdds.some(Boolean)) add('dica', 'revelacao-adicional', 'recheio', 'No chá revelação, pedaços no recheio aparecem no corte junto com a cor: morango no rosa fica lindo; no azul, prefira sem.');
  }

  /* ───────── Conservação e transporte (Cuiabá é quente) ───────── */
  const hot = types.filter((t, i) => t.heat && types.indexOf(t) === i);
  if (hot.length) {
    const meringue = hot.some((t) => t.id === 'merengue');
    add('alerta', 'calor-cobertura', 'cobertura', `No calor de Cuiabá, ${coverNames(hot)} ${hot.length > 1 ? 'saem' : 'sai'} da geladeira só na hora de servir: no máximo 30 minutos fora.${meringue ? ' O merengue é tostado no dia da entrega e não gosta de umidade.' : ''} A entrega vai em caixa térmica.`);
  }
  const cold = uniq(fills.filter((f) => f.cold).map((f) => f.name));
  if (cold.length && types.some((t) => t.id === 'pasta')) add('alerta', 'pasta-geladeira', 'cobertura', `Pasta americana sua na geladeira, e ${low(joinPt(cold))} ${cold.length > 1 ? 'precisam' : 'precisa'} de frio. A gente cobre no dia e você mantém o bolo no ar-condicionado, sem geladeira, por até 4 horas.`);
  else if (cold.length && !hot.length) add('dica', 'recheio-frio', 'recheio', `${joinPt(cold)} ${cold.length > 1 ? 'pedem' : 'pede'} geladeira até a hora do parabéns. Com fruta fresca, o bolo é para consumir em até 2 dias.`);
  if (types.some((t) => t.kind === 'naked') && !volcano && !c.soak) add('dica', 'naked-resseca', 'massa', 'Sem cobertura na lateral, o naked resseca mais rápido. Uma calda de molhar segura a massa úmida até a festa.', { label: 'Molhar com calda de baunilha', apply: (x) => (x.soak = 'baunilha') });
  if (c.soak === 'licor') add('dica', 'licor-adulto', 'massa', 'A calda de licor leva álcool: é um bolo de adulto. Para festa de criança, vá de baunilha ou leite condensado.');

  /* ───────── Prazo e rendimento ───────── */
  const extra = extraPrepOf(c);
  if (extra.hours > 0) add('dica', 'prazo-extra', 'cobertura', `${joinPt(extra.why)} ${extra.why.length > 1 ? 'pedem' : 'pede'} ${extra.hours} h a mais de preparo: este bolo fica pronto em ${Math.round(prepHoursOf(c) / 24)} dias.`);
  if (n >= 4 && tiers === 1 && !bento) add('dica', 'fatias-alto', 'formato', `Bolo alto rende mais: corte fatias de dois dedos e divida cada uma ao meio. Assim ele serve ${servesText(c)}.`);
  if (tiers >= 2) add('dica', 'fatias-andares', 'formato', `Este bolo rende ${servesText(c)}. Em festa com outros doces, conte uma fatia por convidado e mais umas dez de folga.`);
  if (covers.some((x) => getFinish(x.style)?.trim && x.trim === 'castanha')) add('dica', 'castanha-aviso', 'cobertura', 'O barrado de castanha fica à mostra: avise os convidados que o bolo leva castanha.');

  const rank = { bloqueia: 0, alerta: 1, dica: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

/**
 * Aplica as correções das regras 'bloqueia' até não sobrar nenhuma (no máximo 6 voltas).
 * → { config (normalizada), fixed: [{ level, code, step, text }] na ordem em que foram aplicadas }
 */
export function enforceRules(raw, prev = null) {
  let config = normalizeConfig(raw);
  const before = prev ? normalizeConfig(prev) : null;
  const fixed = [];
  for (let pass = 0; pass < 6; pass++) {
    const block = rulesOf(config).find((r) => r.level === 'bloqueia' && r.fix && !fixed.some((f) => f.code === r.code));
    if (!block) break;
    const next = JSON.parse(JSON.stringify(config));
    const done = block.fix.apply(next, before);
    config = normalizeConfig(next);
    fixed.push({ level: block.level, code: block.code, step: block.step, text: done && typeof done === 'object' && done.note ? `${block.text} ${done.note}` : block.text });
  }
  return { config, fixed };
}

/** Aplica a sugestão de uma regra (alerta ou dica) e devolve a configuração nova, já normalizada. */
export function applyFix(raw, code) {
  const config = normalizeConfig(raw);
  const rule = rulesOf(config).find((r) => r.code === code && r.fix);
  if (!rule) return config;
  const next = JSON.parse(JSON.stringify(config));
  rule.fix.apply(next, null);
  return enforceRules(next, config).config;
}

/** As regras de uma etapa da tela (sem as 'bloqueia', que já foram corrigidas antes de desenhar). */
export function rulesForStep(config, step) {
  return rulesOf(config).filter((r) => r.level !== 'bloqueia' && r.step === step);
}
