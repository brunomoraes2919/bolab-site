// BOLAB — Ateliê, jogo: a nota de uma encomenda.
//
//   scoreOrder(order, config) → { stars: 1..3, parts: { sabor, visual, pedido }, notes: [frases], … }
//
// PURA e DETERMINÍSTICA: o mesmo pedido com o mesmo bolo dá sempre a mesma nota (roda no Node — tools/tests/jogo.test.mjs).
// Não tem tela, relógio nem sorteio. Lê o cardápio (tags de cada opção), o preço (priceOf), o rendimento (servesText),
// o prazo (prepHoursOf), as regras de confeiteiro (rulesOf) e a nota da Bô (scoreOf de bo/brain.js: sabor, visual, equilíbrio).
//
// COMO A NOTA É FEITA
//   Cada encomenda tem desejos (`quer`), o que o cliente não gosta (`naoGosta`), pessoas, orçamento e, às vezes, prazo.
//   Cada desejo pertence a uma parte: 's' sabor · 'v' visual · 'p' pedido (o combinado: gente, dinheiro, prazo, transporte).
//   Cada parte vale de 1 a 3:
//     sabor   3 = tudo o que pediu de sabor, nada do que não gosta, e a Bô acha que os sabores combinam (sabor ≥ 3 de 5)
//             2 = pelo menos metade do que pediu e nada do que não gosta (ou tudo certo, mas os sabores brigam)
//             1 = o resto
//     visual  igual, com os desejos de visual; a Bô confere cores (visual ≥ 3) e se o topo não está lotado (equilíbrio ≥ 3)
//     pedido  3 = serve todo mundo, cabe no orçamento, fica pronto no prazo e cumpre os cuidados (calor, viagem…)
//             2 = pelo menos metade do combinado · 1 = menos que isso
//             ("quase" vale meio ponto: até 10% acima do orçamento; rende pelo menos 80% das pessoas)
//   Estrelas: 3 quando as três partes valem 3 · 2 quando a soma chega a 6 · 1 no resto (nunca zero: entregar já conta).
//   A surpresa (desejo que o cliente não contou) nunca tira estrela: quando acerta, vira elogio e figurinha.
import { getFlavor, getFilling, getFillAdd, getSoak, getCovering, getFinish, getTrim, getPiping, getDecor, getBase, getShape, getSize, getCandleStyle } from '../../data/customizer.js';
import { normalizeConfig, priceOf, servesText, prepHoursOf, coversOf } from '../../customizer/pricing.js';
import { rulesOf } from '../../customizer/rules.js';
import { scoreOf, findingsOf, familyOf, brl } from '../bo/brain.js';

const uniq = (list) => [...new Set(list)];
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
/** Minúsculas e sem acento: "Limão-siciliano" → "limao-siciliano". */
export const plain = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Sabor que a cobertura traz (as coberturas do cardápio só têm etiquetas de visual). */
const COVER_TASTE = {
  ganache: ['chocolate', 'intenso'],
  ganachebranca: ['chocolate', 'doce'],
  chocolate: ['chocolate', 'doce'],
  brigadeiro: ['chocolate', 'doce', 'infantil'],
  coco: ['coco'],
  creamcheese: ['azedinho'],
  merengue: ['doce'],
};

const regexes = new Map();
function wordRe(src) {
  if (!regexes.has(src)) regexes.set(src, new RegExp(`\\b(?:${src})`));
  return regexes.get(src);
}

/** "8 a 10 fatias" → { lo: 8, hi: 10 }. */
export function servesRange(config) {
  const m = /(\d+)\D+(\d+)/.exec(servesText(config));
  return m ? { lo: Number(m[1]), hi: Number(m[2]) } : { lo: 0, hi: 0 };
}

/**
 * Tudo o que foi escolhido no bolo, numa lista só: [{ kind, id, name, tags, text }].
 * kind: massa · recheio · adicional · molhar · cobertura · estilo · confeito · bico · decor · avulso · base · formato · tamanho
 */
export function pickedOf(config) {
  const out = [];
  const add = (kind, item, extra = []) => {
    if (!item) return;
    out.push({ kind, id: item.id, name: item.name || item.label || item.id, tags: [...(item.tags || []), ...extra], text: plain(`${item.id} ${item.name || item.label || ''} ${item.desc || ''}`) });
  };
  uniq(config.layers).forEach((id) => add('massa', getFlavor(id)));
  uniq(config.fillings).forEach((id) => add('recheio', getFilling(id)));
  uniq((config.fillAdds || []).filter(Boolean)).forEach((id) => add('adicional', getFillAdd(id)));
  add('molhar', getSoak(config.soak));
  const covers = coversOf(config);
  uniq(covers.map((c) => c.type)).forEach((id) => add('cobertura', getCovering(id), COVER_TASTE[id] || []));
  uniq(covers.map((c) => c.style)).forEach((id) => id !== 'liso' && add('estilo', getFinish(id)));
  uniq(covers.filter((c) => getFinish(c.style)?.trim).map((c) => c.trim)).forEach((id) => add('confeito', getTrim(id)));
  if (config.piping.style !== 'liso') add('bico', getPiping(config.piping.style));
  config.decor.items.forEach((id) => add('decor', getDecor(id), id === 'velas' ? getCandleStyle(config.decor.candleStyle)?.tags || [] : []));
  uniq((config.decor.placed || []).map((p) => p.id)).forEach((id) => add('avulso', getDecor(id)));
  add('base', getBase(config.base));
  add('formato', getShape(config.shape));
  add('tamanho', getSize(config.size));
  return out;
}

/** O bolo visto pelo jogo: configuração normalizada + o que as outras partes da loja dizem dele. */
export function factsOf(rawConfig, { price } = {}) {
  const c = normalizeConfig(rawConfig);
  return {
    c,
    picked: pickedOf(c),
    covers: coversOf(c),
    price: Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : priceOf(c),
    serves: servesRange(c),
    servesText: servesText(c),
    prepDays: Math.ceil(prepHoursOf(c) / 24),
    rules: new Set(rulesOf(c).map((r) => r.code)),
  };
}

/** A opção escolhida `p` atende ao desejo `w`? (ids, tag ou palavra: basta um; sem nenhum dos três, qualquer opção serve) */
function matches(w, p) {
  if (!w.ids && !w.tag && !w.word) return true;
  if (w.ids && w.ids.includes(p.id)) return true;
  if (w.tag && p.tags.includes(w.tag)) return true;
  return Boolean(w.word && wordRe(w.word).test(p.text));
}
const DECOR_KINDS = ['decor', 'avulso'];
/** Quantos enfeites diferentes do bolo batem com o desejo. */
const decorCount = (w, f) => uniq(f.picked.filter((p) => DECOR_KINDS.includes(p.kind) && matches(w, p)).map((p) => p.id)).length;

const TESTS = {
  /** alguma opção escolhida (das famílias `em`, se vier) bate com ids / tag / palavra */
  tem: (w, f) => f.picked.some((p) => (!w.em || w.em.includes(p.kind)) && matches(w, p)),
  /** pelo menos `min` enfeites diferentes batem */
  decor: (w, f) => decorCount(w, f) >= (w.min || 1),
  /** a cobertura (de algum andar) é de uma das famílias de cor */
  cor: (w, f) => f.covers.some((cv) => w.fam.includes(familyOf(cv.color))),
  andares: (w, f) => (f.c.tiers || 1) >= (w.min || 1) && (f.c.tiers || 1) <= (w.max || 3),
  camadas: (w, f) => f.c.layers.length >= (w.min || 1) && f.c.layers.length <= (w.max || 4),
  velas: (w, f) => f.c.decor.items.includes('velas') && (!w.estilo || f.c.decor.candleStyle === w.estilo) && (!w.numero || (f.c.decor.candleStyle === 'numero' && f.c.decor.number === String(w.numero))),
  recado: (w, f) => {
    const text = plain(`${f.c.decor.message} ${f.c.decor.topper.text}`).trim();
    return Boolean(text) && (!w.inclui || text.includes(plain(w.inclui)));
  },
  calda: (w, f) => Boolean(f.c.drip.on) && (!w.metal || Boolean(f.c.drip.metal)),
  revelacao: (w, f) => Boolean(f.c.reveal.on),
  /** nenhuma das regras de confeiteiro listadas aparece (calor, geladeira, sustentação…) */
  regra: (w, f) => !w.sem.some((code) => f.rules.has(code)),
  ou: (w, f) => w.de.some((x) => testWish(x, f)),
  e: (w, f) => w.de.every((x) => testWish(x, f)),
};

/** O bolo atende a este desejo? Desejo de tipo desconhecido conta como atendido (não pune por algo que o jogo não sabe medir). */
export function testWish(w, facts) {
  const fn = TESTS[w?.k];
  return fn ? Boolean(fn(w, facts)) : true;
}

const PART = { s: 'sabor', v: 'visual', p: 'pedido' };

function wishText(order, w, ok, neg) {
  const who = order.cliente.trato;
  const pl = Boolean(order.cliente.pl);
  if (neg) return ok ? w.achou || `Sem ${w.t}, como combinado.` : w.falta || `${who} não ${pl ? 'gostam' : 'gosta'} de ${w.t}, e tinha.`;
  if (ok) return w.achou || `${who} ${pl ? 'pediram' : 'pediu'} ${w.t} e ${pl ? 'ganharam' : 'ganhou'}.`;
  return w.falta || `${who} ${pl ? 'pediram' : 'pediu'} ${w.t} e não ${pl ? 'acharam' : 'achou'}.`;
}

/**
 * A nota de uma encomenda. `opts.price` troca o preço calculado pelo que a tela está cobrando (o que não coube no
 * bolo não é cobrado); sem ele vale priceOf(config).
 * → {
 *     stars, parts: { sabor, visual, pedido }, notes: [frase…],
 *     checks: [{ id, part, kind: 'quer' | 'nao' | 'pessoas' | 'orcamento' | 'prazo' | 'bo', ok, level: 0 | 0.5 | 1, t, text }],
 *     price, budget, over, serves: { lo, hi }, people, prepDays, bo: { sabor, visual, equilibrio },
 *     surprise: null | { ok, t, text }, missing: [checks que faltam, do mais importante ao menos]
 *   }
 */
export function scoreOrder(order, rawConfig, opts = {}) {
  const f = factsOf(rawConfig, opts);
  const who = order.cliente.trato;
  const checks = [];
  const push = (c) => checks.push(c);

  (order.quer || []).forEach((w, i) => {
    const ok = testWish(w, f);
    const check = { id: `q${i}`, part: PART[w.c] || 'visual', kind: 'quer', ok, level: ok ? 1 : 0, t: w.t, icon: w.k, text: wishText(order, w, ok, false) };
    // desejo de "dois enfeites de…": a comanda mostra quantos já tem
    if (w.k === 'decor' && (w.min || 1) > 1) Object.assign(check, { need: w.min, have: Math.min(w.min, decorCount(w, f)) });
    push(check);
  });
  (order.naoGosta || []).forEach((w, i) => {
    const ok = !testWish(w, f);
    push({ id: `n${i}`, part: PART[w.c] || 'sabor', kind: 'nao', ok, level: ok ? 1 : 0, t: w.t, icon: 'nao', text: wishText(order, w, ok, true) });
  });

  // o combinado: gente, dinheiro e prazo
  const people = Math.max(1, Math.round(Number(order.pessoas) || 1));
  const fed = f.serves.hi >= people ? 1 : f.serves.hi >= people * 0.8 ? 0.5 : 0;
  push({
    id: 'pessoas',
    part: 'pedido',
    kind: 'pessoas',
    ok: fed === 1,
    level: fed,
    t: people === 1 ? '1 pessoa' : `${people} pessoas`,
    icon: 'pessoas',
    text: fed === 1 ? `Dá para ${people === 1 ? 'a pessoa' : `as ${people} pessoas`}: rende ${f.servesText}.` : fed ? `Ficou justo: rende ${f.servesText} e são ${people} pessoas.` : `Faltou bolo: rende ${f.servesText} e são ${people} pessoas.`,
  });
  const budget = Math.max(0, Number(order.orcamento) || 0);
  const money = !budget || f.price <= budget ? 1 : f.price <= budget * 1.1 ? 0.5 : 0;
  if (budget) {
    push({
      id: 'orcamento',
      part: 'pedido',
      kind: 'orcamento',
      ok: money === 1,
      level: money,
      t: `até ${brl(budget)}`,
      icon: 'orcamento',
      text: money === 1 ? `Coube no orçamento: ${brl(f.price)} de ${brl(budget)}.` : money ? `Passou um pouco do orçamento: ${brl(f.price)}, e o combinado era até ${brl(budget)}.` : `Estourou o orçamento: ${brl(f.price)}, e o combinado era até ${brl(budget)}.`,
    });
  }
  const days = Math.round(Number(order.dias) || 0);
  if (days > 0) {
    const ok = f.prepDays <= days;
    push({ id: 'prazo', part: 'pedido', kind: 'prazo', ok, level: ok ? 1 : 0, t: `pronto em ${days} dias`, icon: 'prazo', text: ok ? `Fica pronto a tempo: ${f.prepDays} dias de preparo.` : `Não fica pronto a tempo: este bolo pede ${f.prepDays} dias e o prazo é de ${days}.` });
  }

  // o olhar da Bô: os sabores combinam? as cores e o topo estão em ordem?
  const bo = scoreOf(f.c);
  const tasteOk = bo.sabor >= 3;
  const lookOk = bo.visual >= 3 && bo.equilibrio >= 3;
  let finds = null;
  const issueText = (list, fallback) => (list[0]?.text ? list[0].text : fallback);
  if (!tasteOk) {
    finds = finds || findingsOf(f.c);
    push({ id: 'bo-sabor', part: 'sabor', kind: 'bo', ok: false, level: 0, t: 'sabores que combinam', icon: 'bo', text: `Os sabores brigaram. ${issueText(finds.fr.issues, 'A massa e o recheio disputam a atenção.')}` });
  } else push({ id: 'bo-sabor', part: 'sabor', kind: 'bo', ok: true, level: 1, t: 'sabores que combinam', icon: 'bo', text: 'Os sabores combinam.' });
  if (!lookOk) {
    finds = finds || findingsOf(f.c);
    const list = bo.equilibrio < 3 ? [...finds.br.issues, ...finds.cr.issues] : [...finds.cr.issues, ...finds.br.issues];
    push({ id: 'bo-visual', part: 'visual', kind: 'bo', ok: false, level: 0, t: 'visual em ordem', icon: 'bo', text: `O visual ficou confuso. ${issueText(list, 'Tem coisa demais disputando o olhar.')}` });
  } else push({ id: 'bo-visual', part: 'visual', kind: 'bo', ok: true, level: 1, t: 'visual em ordem', icon: 'bo', text: 'O visual está em ordem.' });

  const partOf = (name) => {
    const own = checks.filter((c) => c.part === name);
    if (name === 'pedido') {
      const avg = own.reduce((s, c) => s + c.level, 0) / (own.length || 1);
      return avg >= 1 ? 3 : avg >= 0.5 ? 2 : 1;
    }
    const wants = own.filter((c) => c.kind === 'quer');
    const frac = wants.length ? wants.filter((c) => c.ok).length / wants.length : 1;
    const hated = own.some((c) => c.kind === 'nao' && !c.ok);
    const gate = own.find((c) => c.kind === 'bo')?.ok !== false;
    if (hated) return 1;
    if (frac === 1) return gate ? 3 : 2;
    return frac >= 0.5 ? 2 : 1;
  };
  const parts = { sabor: partOf('sabor'), visual: partOf('visual'), pedido: partOf('pedido') };
  const sum = parts.sabor + parts.visual + parts.pedido;
  const stars = sum === 9 ? 3 : sum >= 6 ? 2 : 1;

  let surprise = null;
  if (order.surpresa) {
    const ok = testWish(order.surpresa, f);
    surprise = { ok, t: order.surpresa.t, text: ok ? order.surpresa.achou || `Surpresa certeira: ${who} adora ${order.surpresa.t}!` : order.surpresa.falta || `Segredo: ${who} adora ${order.surpresa.t}. Fica para a próxima.` };
  }

  // o que falta, na ordem em que vale a pena resolver: o que o cliente não gosta, o que pediu, o combinado, o olhar da Bô
  const rank = { nao: 0, quer: 1, pessoas: 2, orcamento: 2, prazo: 2, bo: 3 };
  const missing = checks.filter((c) => !c.ok).sort((a, b) => rank[a.kind] - rank[b.kind]);
  // nas frases, o olhar da Bô só entra quando reclama (elogio dela é a própria nota da parte)
  const told = checks.filter((c) => c.kind !== 'bo' || !c.ok);
  const notes = [...told.filter((c) => !c.ok), ...told.filter((c) => c.ok)].map((c) => c.text);
  if (surprise?.ok) notes.push(surprise.text);

  return {
    stars,
    parts,
    notes,
    checks,
    missing,
    price: f.price,
    budget,
    over: budget > 0 && f.price > budget,
    serves: f.serves,
    servesText: f.servesText,
    people,
    prepDays: f.prepDays,
    bo: { sabor: bo.sabor, visual: bo.visual, equilibrio: bo.equilibrio },
    surprise,
  };
}

/** A dica mais útil agora ('' quando não falta nada): uma frase curta, sem número, para a Bô ou para o painel. */
export function hintOf(order, result) {
  const m = result.missing[0];
  if (!m) return '';
  if (m.kind === 'nao') return `Tire ${m.t}: ${order.cliente.trato} não ${order.cliente.pl ? 'gostam' : 'gosta'}.`;
  if (m.kind === 'quer') return `Ainda falta ${m.t}.`;
  if (m.kind === 'pessoas') return 'O bolo está pequeno para tanta gente.';
  if (m.kind === 'orcamento') return 'O preço passou do combinado: troque algo por uma opção mais simples.';
  if (m.kind === 'prazo') return 'Este bolo demora mais que o prazo: tire o que pede dias de preparo.';
  return m.id === 'bo-sabor' ? 'Os sabores estão brigando: troque um recheio.' : 'O visual está carregado: tire um enfeite ou mude uma cor.';
}

export { cap as capitalize };
