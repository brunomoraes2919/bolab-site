// BOLAB — o bolo em um texto curto, seguro para ir no endereço: #/monte-seu-bolo?c=<texto>
// Serve para o cliente mandar o bolo para alguém e para o confeiteiro abrir exatamente o bolo do pedido.
//
//   encodeConfig(config, { secret })  → '1.eyJzaGFwZSI6…'   (versão + só o que difere do bolo padrão, em base64 de URL)
//   decodeConfig(texto)               → configuração completa e válida (normalizeConfig) ou null se o texto não servir
//
// secret: false tira o chá revelação do texto (o link que o cliente compartilha não pode carregar a cor em segredo).
// Módulo puro: roda no navegador e no Node (tools/tests/cz_share.test.mjs).
import { defaultConfig, normalizeConfig } from './pricing.js';

const VERSION = 1;
const MAX_TEXT = 6000;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Só o que difere do padrão (objetos por dentro; listas inteiras). */
function delta(value, base) {
  if (!isObj(value) || !isObj(base)) return same(value, base) ? undefined : value;
  const out = {};
  for (const key of Object.keys(value)) {
    const d = delta(value[key], base[key]);
    if (d !== undefined) out[key] = d;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Devolve o padrão com as diferenças por cima. */
function merge(base, patch) {
  if (!isObj(patch) || !isObj(base)) return patch === undefined ? base : patch;
  const out = { ...base };
  for (const key of Object.keys(patch)) out[key] = merge(base[key], patch[key]);
  return out;
}

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** O bolo em texto. O fundo do palco não entra (não faz dele outro bolo). */
export function encodeConfig(config, { secret = true } = {}) {
  const full = normalizeConfig(config);
  const base = normalizeConfig(defaultConfig());
  const d = delta(full, base) || {};
  delete d.v;
  delete d.backdrop;
  delete d.height; // a altura é derivada do número de camadas
  if (!secret) delete d.reveal;
  return `${VERSION}.${toBase64Url(JSON.stringify(d))}`;
}

/** O bolo de volta, sempre completo e válido; null quando o texto não é de um bolo. */
export function decodeConfig(text) {
  const raw = String(text ?? '').trim();
  if (!raw || raw.length > MAX_TEXT) return null;
  const match = /^(\d{1,3})\.([A-Za-z0-9_-]*)$/.exec(raw);
  if (!match || Number(match[1]) !== VERSION) return null;
  try {
    const patch = match[2] ? JSON.parse(fromBase64Url(match[2])) : {};
    if (!isObj(patch)) return null;
    return normalizeConfig(merge(normalizeConfig(defaultConfig()), patch));
  } catch {
    return null;
  }
}
