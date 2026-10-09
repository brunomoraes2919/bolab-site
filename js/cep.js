// BOLAB — busca de endereço pelo CEP (API pública ViaCEP, gratuita e sem chave).

/**
 * lookupCep('78005-000')
 * → { ok: true, cep, street, district, city, uf }
 * → { ok: false, reason: 'invalid' | 'notfound' | 'network' }
 * Em caso de falha, a tela deve deixar a pessoa preencher o endereço à mão.
 */
export async function lookupCep(cep) {
  const digits = String(cep).replace(/\D/g, '');
  if (digits.length !== 8) return { ok: false, reason: 'invalid' };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, reason: 'network' };
    const data = await res.json();
    if (data.erro) return { ok: false, reason: 'notfound' };
    return {
      ok: true,
      cep: digits,
      street: data.logradouro || '',
      district: data.bairro || '',
      city: data.localidade || '',
      uf: data.uf || '',
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
