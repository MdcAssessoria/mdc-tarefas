// Chaves do projeto para as Funções Edge (SEG-01, 20/11/2026).
// O Supabase troca as chaves antigas (anon / service_role, baseadas no segredo JWT) pelas novas (sb_publishable_… /
// sb_secret_…), que podem ser criadas e revogadas sem derrubar nada. As antigas deixam de funcionar no fim de 2026.
// Aqui as Funções usam a chave NOVA ("default") quando ela existe e, enquanto não existir, a antiga. Depois de criar a
// chave secreta no painel e conferir as Funções, as chaves antigas podem ser desativadas (Settings › API Keys).
// Nunca registre o valor de uma chave em log ou resposta.

function chaveNova(variavel: "SUPABASE_SECRET_KEYS" | "SUPABASE_PUBLISHABLE_KEYS"): string | null {
  const bruto = Deno.env.get(variavel);
  if (!bruto) return null;
  try {
    const chaves = JSON.parse(bruto) as Record<string, string>;
    return chaves["default"] ?? Object.values(chaves)[0] ?? null;
  } catch {
    return null;
  }
}

/** Chave de serviço (passa por cima do RLS): só no servidor, nunca devolvida ao navegador. */
export function chaveSecreta(): string {
  const chave = chaveNova("SUPABASE_SECRET_KEYS") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!chave) throw new Error("Chave de serviço do Supabase não configurada.");
  return chave;
}

/** Chave pública (respeita o RLS): usada com o login do usuário no cabeçalho Authorization. */
export function chavePublica(): string {
  const chave = chaveNova("SUPABASE_PUBLISHABLE_KEYS") ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!chave) throw new Error("Chave pública do Supabase não configurada.");
  return chave;
}
