// BI de Gestão: detalhe das linhas da DRE e do DFC. As contas do plano por linha (bi_relatorio_contas, migração 104)
// viram sub-linhas da matriz; o clique num valor abre a origem (bi_origem: notas, impostos das notas, títulos, baixas
// e lançamentos complementares). Regras puras, testadas em detalhe.test.ts.
import type { LinhaMatriz } from "./relatorio";

/** Uma linha devolvida por bi_relatorio_contas (linha do relatório × conta do plano × mês). */
export interface ContaBanco {
  linha: string;
  conta: string | null;
  nome: string;
  ordem: number;
  competencia: string;
  valor: number;
}

/** Sub-linha da matriz: a conta do plano dentro de uma linha do relatório. `conta` nulo = sem conta do plano. */
export interface ContaMatriz extends LinhaMatriz {
  linha: string;
  conta: string | null;
}

/** Uma linha devolvida por bi_origem. */
export interface OrigemBanco {
  empresa: string;
  origem: "nota" | "imposto" | "titulo" | "baixa" | "extrato" | "complementar";
  data: string | null;
  documento: string | null;
  pessoa: string | null;
  doc: string | null;
  categoria: string | null;
  conta: string | null;
  valor: number;
}

export const NOME_ORIGEM: Record<OrigemBanco["origem"], string> = {
  nota: "Nota fiscal",
  imposto: "Imposto da nota",
  titulo: "Conta a pagar/receber",
  baixa: "Pagamento/recebimento",
  extrato: "Movimento do banco",
  complementar: "Lançamento complementar",
};

const centavos = (v: number) => Math.round(v * 100) / 100;

/** Agrupa as contas por linha do relatório, com os valores na ordem de `meses` ("AAAA-MM"). */
export function montarContas(linhas: ContaBanco[], meses: string[]): Map<string, ContaMatriz[]> {
  const pos = new Map(meses.map((m, i) => [m, i]));
  const chaves = new Map<string, ContaMatriz & { ordem: number }>();
  for (const l of linhas) {
    const k = `${l.linha}|${l.conta ?? ""}|${l.nome}`;
    let c = chaves.get(k);
    if (!c) {
      c = {
        linha: l.linha,
        conta: l.conta,
        codigo: `${l.linha}:${l.conta ?? l.nome}`,
        nome: l.conta ? `${l.conta} · ${l.nome}` : l.nome,
        subtotal: false,
        ordem: l.ordem,
        valores: meses.map(() => 0),
        total: 0,
      };
      chaves.set(k, c);
    }
    const i = pos.get(l.competencia.slice(0, 7));
    if (i !== undefined) c.valores[i] = centavos(c.valores[i] + Number(l.valor));
  }
  const saida = new Map<string, ContaMatriz[]>();
  for (const { ordem: _o, ...c } of [...chaves.values()].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome))) {
    const linha = { ...c, total: centavos(c.valores.reduce((a, v) => a + v, 0)) };
    if (linha.valores.every((v) => v === 0)) continue;
    saida.set(c.linha, [...(saida.get(c.linha) ?? []), linha]);
  }
  return saida;
}

/** Valor da conta passado ao banco no clique: a conta do plano, "-" para "sem conta" ou null para a linha inteira. */
export const contaDoClique = (c: ContaMatriz | null) => (c ? (c.conta ?? "-") : null);
