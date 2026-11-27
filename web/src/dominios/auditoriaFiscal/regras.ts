// Auditoria fiscal › Regras de validação (125): regras próprias e utilizações do ERP que o Ledgra Auditor usa ao conferir
// o relatório do SAP. A biblioteca fica no Ledgra (uma só, a mesma da tela de lá); o HUB lê e grava pela Função
// ledgra-regras. Aqui ficam os tipos e as regras puras da tela (conferir antes de enviar, textos e filtros).
import type { Tom } from "@/components/ui/Tons";

export type Gravidade = "ALTA" | "MEDIA" | "BAIXA";
export type Condicao = { coluna: string; operador: string; valor: string };

export type RegraPropria = {
  id: string;
  codigo: string;
  empresa_id: string | null;
  empresa?: string | null;
  nome: string;
  condicoes: Condicao[];
  gravidade: Gravidade;
  ajuste: string;
  fundamento: string | null;
  ativo: boolean;
  motivo?: string | null;
  pode_gravar?: boolean;
};

export type Natureza = "fiscal" | "nao_fiscal" | "revisar";
export type Utilizacao = {
  id: string;
  empresa_id: string | null;
  empresa?: string | null;
  utilizacao: string;
  sentido: "E" | "S";
  natureza: Natureza;
  cfops: string[];
  cst_icms: string[];
  credito_icms: boolean;
  cst_ipi: string[];
  cst_pis_real: string[];
  cst_pis_presumido: string[];
  observacao: string | null;
  fundamento: string | null;
  ativo: boolean;
  motivo?: string | null;
  pode_gravar?: boolean;
};

export type Catalogo = {
  colunas: { coluna: string; nome: string }[];
  operadores: { operador: string; nome: string; sem_valor: boolean; dica: string | null }[];
};

export type RespostaRegras = Catalogo & {
  empresa: string;
  pode: { gravar: boolean; todas: boolean };
  regras: RegraPropria[];
  utilizacoes: Utilizacao[];
};

export const GRAVIDADES: { id: Gravidade; nome: string; tom: Tom }[] = [
  { id: "ALTA", nome: "Alta (erro)", tom: "vermelho" },
  { id: "MEDIA", nome: "Média (atenção)", tom: "ambar" },
  { id: "BAIXA", nome: "Baixa (aviso)", tom: "azul" },
];
export const nomeGravidade = (g: Gravidade) => GRAVIDADES.find((x) => x.id === g)?.nome ?? g;
export const tomGravidade = (g: Gravidade): Tom => GRAVIDADES.find((x) => x.id === g)?.tom ?? "neutro";

export const NATUREZAS: { id: Natureza; nome: string }[] = [
  { id: "fiscal", nome: "Fiscal" },
  { id: "nao_fiscal", nome: "Não fiscal" },
  { id: "revisar", nome: "Revisar" },
];
export const nomeNatureza = (n: Natureza) => NATUREZAS.find((x) => x.id === n)?.nome ?? n;
export const nomeSentido = (s: "E" | "S") => (s === "E" ? "Entrada" : "Saída");

/** "1556, 2556; 1407" → ["1556", "2556", "1407"]. */
export const lerCodigos = (texto: string) => [
  ...new Set(
    texto
      .split(/[,;\s]+/)
      .map((x) => x.trim())
      .filter(Boolean),
  ),
];
export const juntarCodigos = (xs: string[]) => xs.map((x) => x || "(vazio)").join(", ");

/** Códigos com o tamanho certo (CFOP 4, CST 2). Devolve o primeiro inválido ou null. */
export function codigoInvalido(xs: string[], tamanho: number): string | null {
  return xs.find((x) => !new RegExp(`^\\d{${tamanho}}$`).test(x)) ?? null;
}

/** "CFOP está na lista 1556, 2556" — a condição em português. */
export function textoCondicao(c: Condicao, cat: Catalogo): string {
  const coluna = cat.colunas.find((x) => x.coluna === c.coluna)?.nome ?? c.coluna;
  const op = cat.operadores.find((x) => x.operador === c.operador);
  return op?.sem_valor ? `${coluna} ${op.nome}` : `${coluna} ${op?.nome ?? c.operador} ${c.valor}`;
}

/** Mesmas regras do banco do Ledgra, para avisar antes de enviar. Devolve a mensagem ou null. */
export function conferirRegra(r: Pick<RegraPropria, "nome" | "ajuste" | "condicoes">, cat: Catalogo): string | null {
  if (r.nome.trim().length < 3) return "Dê um nome à regra (mínimo 3 letras).";
  if (r.condicoes.length < 1 || r.condicoes.length > 6) return "A regra precisa de 1 a 6 condições.";
  for (const [i, c] of r.condicoes.entries()) {
    if (!cat.colunas.some((x) => x.coluna === c.coluna)) return `Escolha a coluna da condição ${i + 1}.`;
    const op = cat.operadores.find((x) => x.operador === c.operador);
    if (!op) return `Escolha a comparação da condição ${i + 1}.`;
    if (!op.sem_valor && !c.valor.trim()) return `Informe o valor da condição ${i + 1}.`;
  }
  if (r.ajuste.trim().length < 5) return "Escreva o ajuste sugerido (mínimo 5 letras).";
  return null;
}

export function conferirUtilizacao(
  u: Pick<Utilizacao, "utilizacao" | "cfops" | "cst_icms" | "cst_ipi" | "cst_pis_real" | "cst_pis_presumido">,
): string | null {
  if (u.utilizacao.trim().length < 2) return "Informe a utilização como está no SAP.";
  const cfop = codigoInvalido(u.cfops, 4);
  if (cfop !== null) return `CFOP "${cfop}" inválido (use 4 dígitos).`;
  for (const [lista, nome] of [
    [u.cst_icms, "CST do ICMS"],
    [u.cst_ipi, "CST do IPI"],
    [u.cst_pis_real, "CST do PIS/COFINS (Lucro Real)"],
    [u.cst_pis_presumido, "CST do PIS/COFINS (Presumido)"],
  ] as const) {
    const ruim = codigoInvalido(lista, 2);
    if (ruim !== null) return `${nome} "${ruim}" inválido (use 2 dígitos).`;
  }
  return null;
}

export type FiltroRegras = { busca: string; situacao: "ativas" | "inativas" | "todas" };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filtrarRegras(rs: RegraPropria[], f: FiltroRegras, cat: Catalogo) {
  const q = norm(f.busca.trim());
  return rs.filter(
    (r) =>
      (f.situacao === "todas" || (f.situacao === "ativas" ? r.ativo : !r.ativo)) &&
      (!q ||
        norm(`${r.codigo} ${r.nome} ${r.ajuste} ${r.fundamento ?? ""} ${r.condicoes.map((c) => textoCondicao(c, cat)).join(" ")}`).includes(
          q,
        )),
  );
}

export function filtrarUtilizacoes(us: Utilizacao[], f: FiltroRegras) {
  const q = norm(f.busca.trim());
  return us.filter(
    (u) =>
      (f.situacao === "todas" || (f.situacao === "ativas" ? u.ativo : !u.ativo)) &&
      (!q || norm(`${u.utilizacao} ${u.cfops.join(" ")} ${u.observacao ?? ""} ${u.fundamento ?? ""}`).includes(q)),
  );
}
