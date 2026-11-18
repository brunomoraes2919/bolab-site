// BOLAB — busca de endereço pelo CEP (API pública ViaCEP, gratuita e sem chave).
//
// A resposta vem de outro site: é tratada como texto de fora. Só os quatro campos esperados são
// lidos, cada um limitado no tamanho e sem caracteres invisíveis; o estado tem de ser uma sigla.

const ch = (code) => String.fromCharCode(code);
// caracteres de controle, de largura zero e de inversão de texto
const INVISIBLE = new RegExp(`[\x00-\x1f\x7f-\x9f${ch(0x200b)}-${ch(0x200f)}${ch(0x202a)}-${ch(0x202e)}${ch(0x2066)}-${ch(0x2069)}${ch(0xfeff)}]`, 'g');
// Nome de rua não tem "<" nem ">": se vier, sai (as telas escapam o texto de qualquer jeito).
const clean = (v, max) => (typeof v === 'string' ? v.replace(INVISIBLE, '').replace(/[<>]/g, '').trim().slice(0, max) : '');

/**
 * lookupCep('78005-000')
 * → { ok: true, cep, street, district, city, uf }
 * → { ok: false, reason: 'invalid' | 'notfound' | 'network' }
 * Em caso de falha, a tela deve deixar a pessoa preencher o endereço à mão.
 */
export async function lookupCep(cep) {
  const digits = String(cep).replace(/\D/g, '');
  if (digits.length !== 8) return { ok: false, reason: 'invalid' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, reason: 'network' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) return { ok: false, reason: 'network' };
    const data = await res.json();
    if (data === null || typeof data !== 'object' || Array.isArray(data)) return { ok: false, reason: 'network' };
    if (data.erro) return { ok: false, reason: 'notfound' };
    const uf = clean(data.uf, 2).toUpperCase();
    return {
      ok: true,
      cep: digits,
      street: clean(data.logradouro, 120),
      district: clean(data.bairro, 80),
      city: clean(data.localidade, 80),
      uf: /^[A-Z]{2}$/.test(uf) && clean(data.uf, 3).length === 2 ? uf : '',
    };
  } catch {
    return { ok: false, reason: 'network' };
  } finally {
    clearTimeout(timer);
  }
}
