// Tipos de clientes: cadastro do cliente, regimes tributários e segmentos.

export interface Cliente {
  id: string;
  org_id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  regime: string | null;
  ativo: boolean;
  codigo_dominio?: string | null;
  cidade?: string | null;
  uf?: string | null;
  inicio_em?: string | null;
  inativo_em?: string | null;
  motivo_inativacao?: string | null;
  cliente_desde?: string | null;
  situacao_dominio?: string | null;
  segmento?: string | null;
  grupos?: string[];
}

export const REGIMES: { id: string; nome: string }[] = [
  { id: "simples", nome: "Simples Nacional" },
  { id: "presumido", nome: "Lucro Presumido" },
  { id: "real", nome: "Lucro Real" },
  { id: "mei", nome: "MEI" },
  { id: "imune_isenta", nome: "Imune/Isenta" },
  { id: "pf", nome: "Pessoa física" },
  { id: "outro", nome: "Outro" },
];

export const SEGMENTOS: { id: string; nome: string }[] = [
  { id: "comercio", nome: "Comércio" },
  { id: "industria", nome: "Indústria" },
  { id: "servicos", nome: "Serviços" },
  { id: "construcao", nome: "Construção" },
  { id: "agro", nome: "Agronegócio" },
  { id: "saude", nome: "Saúde" },
  { id: "educacao", nome: "Educação" },
  { id: "transporte", nome: "Transporte" },
  { id: "holding", nome: "Holding" },
  { id: "terceiro_setor", nome: "Terceiro setor" },
  { id: "outro", nome: "Outro" },
];
export const nomeSegmento = (s: string | null | undefined) => SEGMENTOS.find((x) => x.id === s)?.nome ?? "—";
