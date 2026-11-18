// BOLAB — Ateliê: o que mudou entre duas configurações do bolo.
// A tela do personalizador compara o bolo de antes com o de agora e avisa o barramento (js/atelier/bus.js)
// com um evento `change` por diferença. Como a comparação é feita campo a campo, uma opção nova do bolo
// (de estrutura ou de decoração) já sai avisada sem ninguém mexer aqui: campo desconhecido vira chave com o
// caminho pontilhado ('soak', 'drip.amount', 'reveal.on', 'decor.novidade.cor'…).
//
//   diffConfig(prev, next) → [{ key, value, prev }]      (lista vazia quando nada mudou)
//
// Módulo puro (sem tela, sem 3D): roda no Node — tools/tests/atelier_diff.test.mjs.

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
const list = (v) => (Array.isArray(v) ? v : []);

/** Nome do evento para os campos que o contrato do barramento já conhece (os demais usam o próprio caminho). */
const RENAME = {
  'covering.type': 'cover.type',
  'covering.style': 'cover.style',
  'covering.color': 'cover.color',
  'covering.color2': 'cover.color2',
  'covering.trim': 'cover.trim',
  'decor.candles': 'candles.count',
  'decor.candleStyle': 'candles.style',
  'decor.number': 'candles.number',
  'decor.message': 'message.text',
  'decor.messageMode': 'message.mode',
  'decor.messageColor': 'message.color',
  'decor.script': 'message.script',
  'decor.topper.text': 'topper.text',
  'decor.topper.color': 'topper.color',
};
/** Campos tratados à mão (listas com sentido próprio) ou que não são escolha da pessoa. */
const SKIP = new Set(['v', 'layers', 'fillings', 'fillAdds', 'tierCover', 'decor.items', 'decor.opts']);

/** Diferença genérica, campo a campo: objetos são percorridos; listas e valores simples são comparados inteiros… */
function walk(a, b, path, out) {
  if (same(a, b)) return;
  if (isObj(a) && isObj(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const p = path ? `${path}.${k}` : k;
      if (!SKIP.has(p)) walk(a[k], b[k], p, out);
    }
    return;
  }
  // …menos as listas do mesmo tamanho, que saem item a item ('fillAdds.1')
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    for (let i = 0; i < a.length; i++) walk(a[i], b[i], `${path}.${i}`, out);
    return;
  }
  out.push({ key: RENAME[path] || path, value: b ?? null, prev: a ?? null });
}

/**
 * O que mudou de `prev` para `next` (duas configurações do personalizador, de preferência já normalizadas).
 * A ordem acompanha as etapas da tela: estrutura, massa, recheio, cobertura, calda, bico, decoração, festa, geral.
 */
export function diffConfig(prev, next) {
  const a = isObj(prev) ? prev : {};
  const b = isObj(next) ? next : {};
  const out = [];
  const push = (key, value, before = null) => out.push({ key, value, prev: before });

  // estrutura (o resto dos campos simples sai pelo percurso genérico, mais abaixo)
  ['shape', 'size', 'tiers', 'height', 'base'].forEach((k) => {
    if (!same(a[k], b[k])) push(k, b[k] ?? null, a[k] ?? null);
  });

  // massa: camadas que entraram, que saíram e que trocaram de sabor
  const la = list(a.layers);
  const lb = list(b.layers);
  for (let i = 0; i < Math.min(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) push('layer.flavor', { index: i, id: lb[i] }, { index: i, id: la[i] });
  }
  for (let i = la.length; i < lb.length; i++) push('layer.add', { index: i, id: lb[i] });
  for (let i = la.length - 1; i >= lb.length; i--) push('layer.remove', { index: i, id: la[i] }, { index: i, id: la[i] });

  // recheio: o que mudou em cada vão (um vão novo também conta; o que sumiu foi junto com a camada)
  const fa = list(a.fillings);
  const fb = list(b.fillings);
  for (let i = 0; i < fb.length; i++) {
    if (fa[i] !== fb[i]) push('filling', { index: i, id: fb[i] }, i < fa.length ? { index: i, id: fa[i] } : null);
  }

  // adicional de cada recheio (pedaços no corte): id '' = saiu
  const xa = list(a.fillAdds);
  const xb = list(b.fillAdds);
  for (let i = 0; i < Math.max(xa.length, xb.length); i++) {
    const was = xa[i] || '';
    const now = i < fb.length ? xb[i] || '' : '';
    if (was !== now && i < fb.length) push('filling.add', { index: i, id: now }, { index: i, id: was });
  }

  // cobertura por andar: cada andar que mudou; index null = voltou a ser "igual em todos" (ou deixou de ser)
  const ta = Array.isArray(a.tierCover) ? a.tierCover : null;
  const tb = Array.isArray(b.tierCover) ? b.tierCover : null;
  if (tb) {
    tb.forEach((cover, i) => {
      if (!same(ta?.[i], cover)) push('cover.tier', { index: i, ...cover }, ta?.[i] ? { index: i, ...ta[i] } : null);
    });
  } else if (ta) push('cover.tier', { index: null }, { index: null, count: ta.length });

  // decorações: entrou, saiu (ou saíram todas de uma vez) e os ajustes de cada uma
  const da = isObj(a.decor) ? a.decor : {};
  const db = isObj(b.decor) ? b.decor : {};
  const ia = list(da.items);
  const ib = list(db.items);
  const gone = ia.filter((id) => !ib.includes(id));
  const came = ib.filter((id) => !ia.includes(id));
  const decorOut = [];
  const dpush = (key, value, before = null) => decorOut.push({ key, value, prev: before });
  if (gone.length > 1 && !ib.length) dpush('decor.clear', { ids: gone }, { ids: ia.slice() });
  else gone.forEach((id) => dpush('decor.remove', { id }, { id }));
  came.forEach((id) => dpush('decor.add', { id, ...(isObj(db.opts?.[id]) ? db.opts[id] : {}) }));
  ib.filter((id) => ia.includes(id)).forEach((id) => {
    const oa = isObj(da.opts?.[id]) ? da.opts[id] : {};
    const ob = isObj(db.opts?.[id]) ? db.opts[id] : {};
    for (const k of new Set([...Object.keys(oa), ...Object.keys(ob)])) {
      if (!same(oa[k], ob[k])) dpush(`decor.${k}`, { id, [k]: ob[k] ?? null }, { id, [k]: oa[k] ?? null });
    }
  });

  // todo o resto, campo a campo (cobertura, calda, bico, velas, mensagem, topo, nome, fundo e o que for novo)
  const rest = [];
  walk(a, b, '', rest);
  const structural = new Set(['shape', 'size', 'tiers', 'height', 'base']);
  const order = (key) => {
    if (key.startsWith('cover.')) return 0;
    if (key.startsWith('drip.')) return 1;
    if (key.startsWith('piping.')) return 2;
    if (/^(candles|message|topper|decor)\./.test(key)) return 4;
    if (key === 'name' || key === 'backdrop') return 5;
    return 3; // campos novos (calda de molhar, adicionais, chá revelação…) entram depois da cobertura
  };
  const others = rest.filter((d) => !structural.has(d.key));
  const tierAt = out.findIndex((d) => d.key === 'cover.tier');
  const tiers = tierAt >= 0 ? out.splice(tierAt) : [];
  [0, 1, 2, 3].forEach((n) => {
    out.push(...others.filter((d) => order(d.key) === n));
    if (n === 0) out.push(...tiers);
  });
  out.push(...decorOut, ...others.filter((d) => order(d.key) === 4), ...others.filter((d) => order(d.key) === 5));
  return out;
}
