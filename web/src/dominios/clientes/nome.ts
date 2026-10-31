// Regras simples sobre clientes que se repetem nas telas.

/** Nome para mostrar: o nome curto (fantasia) quando existe, senão a razão social. Sem cliente → `semCliente`. */
export function nomeCliente(c: { nome_fantasia?: string | null; razao_social: string } | null | undefined, semCliente = ""): string {
  return c ? c.nome_fantasia || c.razao_social : semCliente;
}
