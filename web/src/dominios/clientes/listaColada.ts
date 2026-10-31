// "Colar lista" de clientes nas Configurações: transforma o texto colado (uma empresa por linha, colunas separadas
// por ponto e vírgula ou tabulação) nos registros a inserir na tabela clientes.
import { REGIMES } from "./tipos";

/** Colunas: razão social; CNPJ; regime (id ou nome); nome fantasia. Ignora linhas vazias e o cabeçalho "Razão...". */
export function lerListaColada(texto: string, orgId: string) {
  const regimes = new Map(
    REGIMES.flatMap((r) => [
      [r.id, r.id],
      [r.nome.toLowerCase(), r.id],
    ]),
  );
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.split(/[;\t]/).map((x) => x.trim()))
    .filter((p) => p[0] && !/raz[aã]o/i.test(p[0]));
  return linhas.map(([razao, cnpj, regime, fantasia]) => ({
    org_id: orgId,
    razao_social: razao,
    cnpj: cnpj || null,
    regime: regimes.get((regime ?? "").toLowerCase()) ?? null,
    nome_fantasia: fantasia || null,
  }));
}
