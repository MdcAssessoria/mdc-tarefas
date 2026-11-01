// Leitura completa de listas grandes do Supabase, sem o corte silencioso de linhas.
import { traduzirErro } from "./erros";

type Resposta = { data: unknown; error: unknown };

/**
 * O Supabase devolve no máximo 1.000 linhas por consulta (configuração "Max rows" da API) e corta o resto
 * sem avisar, mesmo com `.limit(20000)`. Esta função pede página por página até vir uma página vazia,
 * então funciona mesmo se o limite do servidor for menor que o tamanho pedido.
 *
 * `montar(de, ate)` precisa devolver a consulta já com `.range(de, ate)` e com uma ordem estável
 * (termine a ordenação por uma coluna única, como `id`), senão uma linha pode repetir ou faltar entre páginas.
 *
 * Uso: `const linhas = await lerTudo<Linha>((de, ate) => sb.from("x").select("*").eq(...).order("id").range(de, ate))`.
 */
export async function lerTudo<T>(
  montar: (de: number, ate: number) => PromiseLike<Resposta>,
  tamanho = 1000,
  maximo = 200_000,
): Promise<T[]> {
  const todas: T[] = [];
  while (todas.length <= maximo) {
    const { data, error } = await montar(todas.length, todas.length + tamanho - 1);
    if (error) throw new Error(traduzirErro(error));
    const pagina = (data as T[] | null) ?? [];
    if (pagina.length === 0) return todas;
    todas.push(...pagina);
  }
  throw new Error(`A lista passou de ${maximo.toLocaleString("pt-BR")} linhas. Use um filtro menor ou fale com o suporte.`);
}
