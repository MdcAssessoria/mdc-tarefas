// Auditoria fiscal (SAP) (migração 122; módulo próprio desde a 125): tipos do resultado que o Ledgra Auditor devolve e as regras
// puras da tela (nomes, cores, filtros). A conferência em si roda no Ledgra (Função Edge ledgra-auditoria).
import type { Tom } from "@/components/ui/Tons";

export type Gravidade = "erro" | "credito" | "aviso" | "oportunidade";

export interface ResumoAuditoria {
  itens?: number;
  conferidos?: number;
  achados?: number;
  erros?: number;
  avisos?: number;
  oportunidades?: number;
  aRecolher?: number;
  economia?: number;
}

export interface RegraContada {
  regra: string;
  titulo: string;
  gravidade: Gravidade;
  quantidade: number;
  valor: number;
}

export interface AchadoAuditoria {
  regra: string;
  titulo: string;
  gravidade: Gravidade;
  documento: string;
  data: string;
  item: string;
  descricao: string;
  ncm: string | null;
  cfop: string;
  mensagem: string;
  esperado: string;
  informado: string;
  diferenca: number;
}

export interface AuditoriaErp {
  id: string;
  org_id: string;
  cliente_id: string | null;
  cnpj: string;
  empresa: string | null;
  arquivo_nome: string;
  regime: RegimeAuditoria;
  ledgra_id: string;
  link: string;
  linhas: number;
  fora: number;
  resumo: ResumoAuditoria;
  por_regra: RegraContada[];
  achados: AchadoAuditoria[];
  criado_em: string;
}

export type RegimeAuditoria = "" | "NAO CUMULATIVO" | "CUMULATIVO" | "SIMPLES";

export const REGIMES: { id: RegimeAuditoria; nome: string }[] = [
  { id: "", nome: "Pelo cadastro no Ledgra" },
  { id: "NAO CUMULATIVO", nome: "Não cumulativo (Lucro Real)" },
  { id: "CUMULATIVO", nome: "Cumulativo (Lucro Presumido)" },
  { id: "SIMPLES", nome: "Simples Nacional" },
];

export const NOME_GRAVIDADE: Record<Gravidade, string> = {
  erro: "Erro",
  credito: "Crédito",
  aviso: "Atenção",
  oportunidade: "Oportunidade",
};

export const TOM_GRAVIDADE: Record<Gravidade, Tom> = {
  erro: "vermelho",
  credito: "violeta",
  aviso: "ambar",
  oportunidade: "verde",
};

/** Extensões que o Ledgra lê: o .txt que o SAP grava ao exportar, a planilha ou o CSV. */
export const arquivoAceito = (nome: string) => /\.(txt|tsv|csv|xlsx|xls)$/i.test(nome);

/** Regime padrão pelo regime do cadastro do cliente no HUB (texto livre: "Lucro Real", "presumido"…). */
export function regimeDoCadastro(regime: string | null | undefined): RegimeAuditoria {
  const r = (regime ?? "").toLowerCase();
  if (r.includes("real")) return "NAO CUMULATIVO";
  if (r.includes("presumido")) return "CUMULATIVO";
  if (r.includes("simples") || r.includes("mei")) return "SIMPLES";
  return "";
}

export interface FiltroAchados {
  regra: string;
  gravidade: Gravidade | "";
  busca: string;
}

/** Achados que passam no filtro (busca no documento, descrição, NCM, CFOP e mensagem, sem acento). */
export function filtrarAchados(achados: AchadoAuditoria[], f: FiltroAchados): AchadoAuditoria[] {
  const limpo = (t: string) =>
    t
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  const q = limpo(f.busca.trim());
  return achados.filter(
    (a) =>
      (!f.regra || a.regra === f.regra) &&
      (!f.gravidade || a.gravidade === f.gravidade) &&
      (!q || limpo([a.documento, a.descricao, a.ncm ?? "", a.cfop, a.mensagem, a.titulo].join(" ")).includes(q)),
  );
}
