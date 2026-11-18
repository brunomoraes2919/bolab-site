// BOLAB — ficha de produção do bolo personalizado: os dados que o confeiteiro precisa para fazer o bolo,
// na ordem em que ele trabalha, montados a partir do `craft` de cada opção do cardápio (js/data/customizer.js).
//
//   fichaDeProducao(config, { secret }) → objeto simples (pode virar JSON, tela ou impressão)
//
// secret: false troca a cor do chá revelação por "em segredo" (a ficha mostrada ao cliente não pode entregar a cor).
// As decorações entram resumidas (acabamento de bico e lista de decorações, do jeito que o resumo do pedido já diz);
// a etapa de decoração pode acrescentar a parte dela em `decoracao`.
// Módulo puro: sem tela e sem 3D (roda no Node — tools/tests/cz_share.test.mjs).
import { getShape, getSize, getBase, getFlavor, getFilling, getFillAdd, getSoak, getCovering, getFinish, getTrim, getDripAmount, getDripLength, getRevealColor, getTierOption, colorName, isVolcano, METAL_COLORS, LAYER_CM, FILLING_CM, SINGLE_CM, VOLCANO_CM } from '../data/customizer.js';
import { normalizeConfig, coversOf, diametersOf, heightCmOf, servesText, prepHoursOf, extraPrepOf, partsOf, priceOf, displayName } from './pricing.js';
import { rulesOf } from './rules.js';

const pick = (item) => (item ? { id: item.id, nome: item.name || item.label, comoFazer: item.craft || '' } : null);
const cor = (hex) => ({ nome: METAL_COLORS.find((c) => c.hex === hex)?.name || colorName(hex), hex });

export function fichaDeProducao(raw, { secret = true } = {}) {
  const c = normalizeConfig(raw);
  const tiers = c.tiers || 1;
  const volcano = isVolcano(c);
  const dias = diametersOf(c);
  const size = getSize(c.size);
  const covers = coversOf(c);
  const reveal = c.reveal.on ? getRevealColor(c.reveal.color) : null;

  // camadas de um andar, de baixo para cima: massa, recheio, massa, recheio… massa
  const camadas = [];
  c.layers.forEach((id, i) => {
    camadas.push({ tipo: 'massa', ordem: camadas.length + 1, ...pick(getFlavor(id)), espessuraCm: volcano ? VOLCANO_CM : c.layers.length === 1 ? SINGLE_CM : LAYER_CM });
    if (i < c.fillings.length) {
      camadas.push({
        tipo: 'recheio',
        ordem: camadas.length + 1,
        ...pick(getFilling(c.fillings[i])),
        espessuraCm: FILLING_CM,
        adicional: pick(getFillAdd(c.fillAdds[i])),
        tingir: reveal ? (secret ? { nome: reveal.name, hex: reveal.hex } : 'em segredo') : null,
      });
    }
  });

  const ficha = {
    nome: displayName(c),
    preco: priceOf(c),
    medidas: {
      formato: pick(getShape(c.shape)),
      tamanho: { ...pick(size), diametro: size.diameter },
      andares: dias.map((d, i) => ({ andar: i + 1, larguraCm: d, alturaCm: Math.round((heightCmOf({ ...c, tiers: 1 }) + Number.EPSILON) * 10) / 10 })),
      montagem: tiers > 1 ? getTierOption(tiers).craft : null,
      alturaTotalCm: heightCmOf(c),
      rende: servesText(c),
      base: pick(getBase(c.base)),
    },
    camadas,
    camadasPorAndar: tiers > 1 ? `As mesmas ${camadas.length} camadas em cada um dos ${tiers} andares.` : null,
    caldaDeMolhar: pick(getSoak(c.soak)),
    cobertura: covers.map((cover, i) => {
      const fin = getFinish(cover.style);
      return {
        andar: i + 1,
        ...pick(getCovering(cover.type)),
        cor: cor(cover.color),
        estilo: fin && fin.id !== 'liso' ? pick(fin) : null,
        segundaCor: fin?.two ? cor(cover.color2) : null,
        confeito: fin?.trim ? pick(getTrim(cover.trim)) : null,
      };
    }),
    calda: volcano
      ? { transborda: true, quantidade: pick(getDripAmount(c.drip.amount)), comprimento: getDripLength(c.drip.length).name }
      : c.drip.on
        ? { cor: cor(c.drip.color), quantidade: pick(getDripAmount(c.drip.amount)), comprimento: getDripLength(c.drip.length).name, meiaLua: c.drip.half, metalica: c.drip.metal }
        : null,
    chaRevelacao: reveal ? { cor: secret ? { id: reveal.id, nome: reveal.name, hex: reveal.hex } : 'em segredo', aviso: 'Não mostrar a cor a ninguém além de quem encomendou. Recheio tingido com corante em gel; cobertura fechada.' } : null,
    decoracao: { acabamento: partsOf(c).acabamento, itens: partsOf(c).decoracao, mensagem: c.decor.message || null, topo: c.decor.topper?.text || null },
    prazo: { horas: prepHoursOf(c), aMais: extraPrepOf(c).hours, porCausaDe: extraPrepOf(c).why },
    observacoes: rulesOf(c)
      .filter((r) => r.level !== 'bloqueia')
      .map((r) => ({ nivel: r.level, codigo: r.code, texto: r.text })),
  };
  return ficha;
}

/** A ficha em linhas de texto (para copiar, imprimir ou mostrar numa lista). */
export function fichaEmTexto(ficha) {
  const out = [`${ficha.nome}`, `${ficha.medidas.formato.nome} · ${ficha.medidas.tamanho.nome} (${ficha.medidas.tamanho.diametro}) · ${ficha.medidas.alturaTotalCm} cm de altura · rende ${ficha.medidas.rende}`];
  if (ficha.medidas.andares.length > 1) out.push(`Andares (de baixo para cima): ${ficha.medidas.andares.map((a) => `${a.larguraCm} cm`).join(', ')}. ${ficha.medidas.montagem || ''}`.trim());
  out.push(`Formato: ${ficha.medidas.formato.comoFazer}`, `Base: ${ficha.medidas.base.nome}. ${ficha.medidas.base.comoFazer}`);
  out.push('Camadas, de baixo para cima:');
  ficha.camadas.forEach((l) => {
    const tint = l.tingir ? ` · tingir de ${typeof l.tingir === 'string' ? `cor ${l.tingir}` : `${l.tingir.nome.toLowerCase()} (${l.tingir.hex})`}` : '';
    out.push(`  ${l.ordem}. ${l.tipo === 'massa' ? 'Massa' : 'Recheio'} de ${l.nome.toLowerCase()} (${String(l.espessuraCm).replace('.', ',')} cm)${tint}: ${l.comoFazer}`);
    if (l.adicional) out.push(`     + ${l.adicional.nome}: ${l.adicional.comoFazer}`);
  });
  if (ficha.camadasPorAndar) out.push(`  ${ficha.camadasPorAndar}`);
  if (ficha.caldaDeMolhar) out.push(`Calda de molhar: ${ficha.caldaDeMolhar.nome}. ${ficha.caldaDeMolhar.comoFazer}`);
  ficha.cobertura.forEach((k) => {
    const where = ficha.cobertura.length > 1 ? ` (${k.andar}º andar)` : '';
    out.push(`Cobertura${where}: ${k.nome}, ${k.cor.nome.toLowerCase()} (${k.cor.hex}). ${k.comoFazer}`);
    if (k.estilo) out.push(`  Estilo: ${k.estilo.nome}${k.segundaCor ? `, com ${k.segundaCor.nome.toLowerCase()} (${k.segundaCor.hex})` : ''}${k.confeito ? `, de ${k.confeito.nome.toLowerCase()}` : ''}. ${k.estilo.comoFazer}${k.confeito ? ` ${k.confeito.comoFazer}` : ''}`);
  });
  if (ficha.calda?.transborda) out.push(`Cobertura transbordando do furo: quantidade ${ficha.calda.quantidade.nome.toLowerCase()}, comprimento ${ficha.calda.comprimento.toLowerCase()}.`);
  else if (ficha.calda) out.push(`Calda: ${ficha.calda.cor.nome.toLowerCase()} (${ficha.calda.cor.hex}), quantidade ${ficha.calda.quantidade.nome.toLowerCase()}, gotas ${ficha.calda.comprimento.toLowerCase()}s${ficha.calda.meiaLua ? ', em meia-lua' : ''}${ficha.calda.metalica ? ', pincelada com pó metálico' : ''}. ${ficha.calda.quantidade.comoFazer}`);
  if (ficha.chaRevelacao) out.push(`Chá revelação: recheio ${typeof ficha.chaRevelacao.cor === 'string' ? `na cor ${ficha.chaRevelacao.cor}` : `${ficha.chaRevelacao.cor.nome.toLowerCase()} (${ficha.chaRevelacao.cor.hex})`}. ${ficha.chaRevelacao.aviso}`);
  out.push(`Acabamento: ${ficha.decoracao.acabamento}`, `Decoração: ${ficha.decoracao.itens}`);
  out.push(`Prazo: ${ficha.prazo.horas} h${ficha.prazo.aMais ? ` (${ficha.prazo.aMais} h a mais por causa de ${ficha.prazo.porCausaDe.join(', ').toLowerCase()})` : ''}`);
  if (ficha.observacoes.length) {
    out.push('Observações do confeiteiro:');
    ficha.observacoes.forEach((o) => out.push(`  · ${o.texto}`));
  }
  return out;
}
