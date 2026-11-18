// BOLAB — presença na busca e no compartilhamento: título, descrição e dados estruturados por tela.
//
// Tudo sai de js/data/site.js e js/data/products.js: quando o dono troca telefone, endereço,
// horário ou preço lá, o que o Google lê acompanha sozinho. Nada é escrito à mão aqui.
//
// LIMITE CONHECIDO: a loja usa endereços com "#" (#/produto/p1). Para o Google e para os cartões
// de compartilhamento (WhatsApp, Instagram), tudo depois do "#" não existe: a loja inteira é UMA
// página. Estes dados descrevem a tela aberta para quem roda JavaScript (o Google roda), mas cada
// produto só terá página própria na busca quando a loja for servida com endereços de verdade
// (/produto/chocolate-belga), o que depende do servidor novo.
import { SITE, CATEGORIES } from './data/site.js';
import { PRODUCTS, getProduct, sizesOf, priceOf, isCake } from './data/products.js';
import { photoUrl } from './data/photos.js';

const IN_APP = typeof location !== 'undefined' && location.hostname === 'appassets.androidplatform.net';
const BASE = String(SITE.url || '').replace(/\/?$/, '/');
const abs = (path) => (BASE ? new URL(path, BASE).href : path);
const brl = (v) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`;
const cakes = () => PRODUCTS.filter(isCake);

export const DEFAULT_TITLE = `${SITE.name} — Bolos artesanais sob encomenda em ${SITE.city}`;
const DEFAULT_DESC = `Delivery de bolos artesanais em ${SITE.region}. Peça um clássico ou monte o seu em 3D e receba com dia e horário marcados.`;

/** Descrição de cada tela (até ~155 caracteres, que é o que a busca mostra). */
function describe(path, params, query) {
  if (path === '/cardapio') {
    const cat = CATEGORIES.find((c) => c.id === query.cat && c.id !== 'todos');
    if (cat) return `${cat.label} da ${SITE.name}: ${cat.desc ? `${cat.desc.toLowerCase()}. ` : ''}Sob encomenda, com entrega em ${SITE.region} ou retirada no ateliê.`;
    return `Cardápio da ${SITE.name}: ${cakes().length} bolos artesanais sob encomenda e itens para a festa. Entrega em ${SITE.region} ou retirada no ateliê.`;
  }
  if (path.startsWith('/produto/')) {
    const p = getProduct(params.id);
    if (p) return `${p.name}: ${p.desc} ${sizesOf(p).length ? 'A partir de' : 'Por'} ${brl(p.price)}${p.prepHours ? `, pronto em ${p.prepHours} h` : ''}.`;
  }
  // r5-qa: o mesmo que js/data/montar.js promete (cozinha 3D, som opcional, assistente Bô, preço a cada escolha)
  if (path === '/monte-seu-bolo') return `Monte seu bolo em 3D na ${SITE.name}: camada por camada numa cozinha 3D, com som opcional e dicas da assistente Bô. Formato, massa, recheio, cobertura e decoração, com o preço a cada escolha.`;
  if (path === '/atendimento') return `Atendimento da ${SITE.name}: prazos, entrega em ${SITE.region}, formas de pagamento e contato. ${SITE.hours}.`;
  return DEFAULT_DESC;
}

/* ───────── Dados estruturados (schema.org) ───────── */
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function offerOf(p) {
  const sizes = sizesOf(p);
  const common = { priceCurrency: 'BRL', availability: 'https://schema.org/MadeToOrder', itemCondition: 'https://schema.org/NewCondition', url: abs(`#/produto/${p.id}`), seller: { '@id': `${BASE}#loja` } };
  if (!sizes.length) return { '@type': 'Offer', price: p.price.toFixed(2), ...common };
  const prices = sizes.map((s) => priceOf(p, s.id));
  return { '@type': 'AggregateOffer', lowPrice: Math.min(...prices).toFixed(2), highPrice: Math.max(...prices).toFixed(2), offerCount: sizes.length, ...common };
}

function productLd(p) {
  const image = photoUrl(p.photo, 1200);
  return {
    '@type': 'Product',
    '@id': abs(`#/produto/${p.id}`),
    name: p.name,
    description: p.long || p.desc,
    sku: p.id,
    category: CATEGORIES.find((c) => c.id === p.cat)?.label || undefined,
    brand: { '@type': 'Brand', name: SITE.name },
    ...(image ? { image: [image.startsWith('http') ? image : abs(image)] } : {}),
    // Notas e avaliações só entram quando forem de clientes de verdade (hoje são ilustrativas).
    ...(!SITE.demo && p.reviews > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: p.rating, reviewCount: p.reviews, bestRating: 5 } } : {}),
    offers: offerOf(p),
  };
}

function bakeryLd() {
  const low = Math.min(...cakes().map((p) => p.price));
  const high = Math.max(...cakes().map((p) => priceOf(p, 'g')));
  const hours = Array.isArray(SITE.openingHours) ? SITE.openingHours : [];
  return {
    '@type': 'Bakery',
    '@id': `${BASE}#loja`,
    name: `${SITE.name} Confeitaria Artesanal`,
    alternateName: SITE.name,
    slogan: SITE.tagline,
    description: DEFAULT_DESC,
    url: BASE,
    image: abs('assets/og-bolab.jpg'),
    logo: abs('assets/icon-512.png'),
    telephone: SITE.whatsapp ? `+${String(SITE.whatsapp).replace(/\D/g, '')}` : undefined,
    email: SITE.email || undefined,
    address: { '@type': 'PostalAddress', streetAddress: SITE.pickup.address, addressLocality: SITE.city, addressRegion: SITE.uf, addressCountry: 'BR' },
    areaServed: SITE.deliveryCities.map((name) => ({ '@type': 'City', name })),
    openingHoursSpecification: hours.map((h) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: h.days.map((d) => DAYS[d]), opens: h.opens, closes: h.closes })),
    priceRange: cakes().length ? `${brl(low)} – ${brl(high)}` : undefined,
    currenciesAccepted: 'BRL',
    paymentAccepted: 'Pix, Cartão de crédito',
    servesCuisine: 'Confeitaria',
    sameAs: SITE.instagram ? [`https://instagram.com/${SITE.instagram}`] : undefined,
  };
}

function catalogLd(list) {
  return {
    '@type': 'OfferCatalog',
    '@id': `${BASE}#cardapio`,
    name: `Cardápio ${SITE.name}`,
    itemListElement: list.map((p, i) => ({ '@type': 'ListItem', position: i + 1, item: productLd(p) })),
  };
}

function breadcrumbLd(items) {
  return { '@type': 'BreadcrumbList', itemListElement: items.map(([name, hash], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(hash) })) };
}

/** Dados estruturados da tela. → objeto JSON-LD (exportado para os testes). */
export function structuredData(path, params = {}, query = {}) {
  const graph = [bakeryLd()];
  if (path === '/' || path === '/cardapio') {
    const list = path === '/cardapio' && query.cat && query.cat !== 'todos' ? PRODUCTS.filter((p) => p.cat === query.cat) : PRODUCTS;
    graph[0].hasOfferCatalog = catalogLd(list.length ? list : PRODUCTS);
    if (path === '/cardapio') graph.push(breadcrumbLd([['Início', ''], ['Cardápio', '#/cardapio']]));
  }
  if (path.startsWith('/produto/')) {
    const p = getProduct(params.id);
    if (p) graph.push(productLd(p), breadcrumbLd([['Início', ''], ['Cardápio', '#/cardapio'], [p.name, `#/produto/${p.id}`]]));
  }
  // undefined some na conversão para texto: campos sem dado simplesmente não aparecem.
  return JSON.parse(JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }));
}

function setMeta(selector, value) {
  const el = document.querySelector(selector);
  if (el && el.getAttribute('content') !== value) el.setAttribute('content', value);
}

/**
 * Chamado pelo roteador a cada tela: descrição, cartão de compartilhamento e dados estruturados.
 * (O título da aba é o roteador quem define.)
 */
export function applySeo({ path, params = {}, query = {}, title }) {
  if (IN_APP || typeof document === 'undefined') return; // dentro do app não há busca nem cartão
  const desc = describe(path, params, query);
  setMeta('meta[name="description"]', desc);
  setMeta('meta[property="og:title"]', title);
  setMeta('meta[property="og:description"]', desc);
  setMeta('meta[name="twitter:title"]', title);
  setMeta('meta[name="twitter:description"]', desc);
  setMeta('meta[name="robots"]', SITE.indexable === false ? 'noindex, nofollow' : 'index, follow, max-image-preview:large');

  let ld = document.getElementById('bolab-ld');
  if (!ld) {
    ld = document.createElement('script');
    ld.type = 'application/ld+json'; // bloco de dados, não é executado
    ld.id = 'bolab-ld';
    document.head.appendChild(ld);
  }
  try {
    ld.textContent = JSON.stringify(structuredData(path, params, query));
  } catch (err) {
    console.warn('[seo] dados estruturados não gerados', err);
  }
}
