// Leitura do resultado das chamadas ao Supabase sem esquecer o erro.
import { traduzirErro } from "./erros";

/**
 * Devolve `data` da resposta do Supabase ou lança um Error com a mensagem já traduzida para português.
 * Uso: `const linhas = exigir(await supabase().from("x").select("*"))`.
 */
export function exigir<T>(resposta: { data: T; error: unknown }): T {
  if (resposta.error) throw new Error(traduzirErro(resposta.error));
  return resposta.data;
}
