// BI de Gestão: regras da tela de classificação das categorias do Omie no plano do BI (migração 105). Só a equipe MDC
// (gestor do BI) classifica. Testado em classificacao.test.ts.
import type { Tom } from "@/components/ui/Tons";
import type { CategoriaClassificacao, ContaPlano } from "./dados";

export type FiltroClassificacao = "pendentes" | "sem" | "conferir" | "equipe" | "codigo" | "todas";

export const FILTROS_CLASSIFICACAO: { id: FiltroClassificacao; nome: string }[] = [
  { id: "pendentes", nome: "Pendentes" },
  { id: "sem", nome: "Sem conta" },
  { id: "conferir", nome: "A conferir" },
  { id: "equipe", nome: "Classificadas pela equipe" },
  { id: "codigo", nome: "Pelo código do Omie" },
  { id: "todas", nome: "Todas" },
];

/** Sem conta, conta "Contas a classificar" (9.9.02) ou classificação marcada para conferir. */
export const pendente = (c: CategoriaClassificacao) => c.conta === null || c.conta === "9.9.02" || c.a_conferir;

export function filtrar(lista: CategoriaClassificacao[], f: FiltroClassificacao, busca: string): CategoriaClassificacao[] {
  const t = busca.trim().toLowerCase();
  return lista.filter((c) => {
    const ok =
      f === "todas"
        ? true
        : f === "pendentes"
          ? pendente(c)
          : f === "sem"
            ? c.conta === null || c.conta === "9.9.02"
            : f === "conferir"
              ? c.a_conferir
              : f === "equipe"
                ? c.origem === "excecao"
                : c.origem === "codigo";
    if (!ok) return false;
    if (!t) return true;
    return [c.categoria_codigo, c.descricao, c.conta, c.conta_nome, c.empresa].some((x) => (x ?? "").toLowerCase().includes(t));
  });
}

export interface ResumoClassificacao {
  semConta: number;
  valorSemConta: number;
  aConferir: number;
  total: number;
}

export function resumir(lista: CategoriaClassificacao[]): ResumoClassificacao {
  const sem = lista.filter((c) => c.conta === null || c.conta === "9.9.02");
  return {
    semConta: sem.length,
    valorSemConta: Math.round(sem.reduce((a, c) => a + Number(c.valor), 0) * 100) / 100,
    aConferir: lista.filter((c) => c.a_conferir).length,
    total: lista.length,
  };
}

export const ORIGEM: Record<CategoriaClassificacao["origem"], { nome: string; tom: Tom }> = {
  codigo: { nome: "Pelo código do Omie", tom: "neutro" },
  excecao: { nome: "Escolhida pela equipe", tom: "azul" },
  transferencia: { nome: "Transferência entre contas", tom: "neutro" },
  sem: { nome: "Sem conta", tom: "vermelho" },
};

/** Situação mostrada na linha: a conferir e sem conta têm prioridade sobre a origem. */
export function situacao(c: CategoriaClassificacao): { nome: string; tom: Tom } {
  if (c.a_conferir) return { nome: "A conferir", tom: "ambar" };
  if (c.conta === null) return ORIGEM.sem;
  if (c.conta === "9.9.02") return { nome: "Contas a classificar", tom: "ambar" };
  return ORIGEM[c.origem];
}

export const NOME_TIPO: Record<string, string> = {
  RB: "Receitas",
  DED: "Deduções da receita",
  CUS: "Custos",
  PES: "Pessoal",
  ADM: "Despesas administrativas",
  COM: "Despesas comerciais",
  TRI: "Tributos",
  RFI: "Receitas financeiras",
  DFI: "Despesas financeiras",
  IR: "IRPJ e CSLL",
  CX: "Dívidas e parcelamentos (só caixa)",
  FORA: "Fora da DRE (caixa, investimentos, sócios)",
};

/** Contas do plano agrupadas para o campo de escolha (na ordem do plano). */
export function gruposDoPlano(plano: ContaPlano[]): { tipo: string; nome: string; contas: ContaPlano[] }[] {
  const grupos: { tipo: string; nome: string; contas: ContaPlano[] }[] = [];
  for (const p of plano) {
    let g = grupos.find((x) => x.tipo === p.tipo);
    if (!g) grupos.push((g = { tipo: p.tipo, nome: NOME_TIPO[p.tipo] ?? p.tipo, contas: [] }));
    g.contas.push(p);
  }
  return grupos;
}

/** Outras empresas escolhidas com a mesma categoria (código e nome iguais): podem receber a mesma conta. */
export function mesmaCategoriaEmOutras(lista: CategoriaClassificacao[], c: CategoriaClassificacao): CategoriaClassificacao[] {
  const nome = (c.descricao ?? "").trim().toLowerCase();
  return lista.filter(
    (x) => x.cliente_id !== c.cliente_id && x.categoria_codigo === c.categoria_codigo && (x.descricao ?? "").trim().toLowerCase() === nome,
  );
}
